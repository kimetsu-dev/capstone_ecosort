import React, { createContext, useContext, useState, useEffect } from "react";
import { auth, db } from "../firebase";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

const AuthContext = createContext(undefined);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authInitialized, setAuthInitialized] = useState(false);

useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, async (user) => {
    try {
      setCurrentUser(user);

      if (!user) {
        setIsAdmin(false);
        setLoading(false);
        setAuthInitialized(true);
        return;
      }

      // 🔑 THE FIX: Get the token result to check for custom claims
      // Passing 'true' forces a refresh to pick up the new admin status immediately
      const idTokenResult = await user.getIdTokenResult(true);
      
      console.log("Verified claims:", idTokenResult.claims); // Debug: check your console!
      
      if (idTokenResult.claims.admin) {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
      }

      // 📊 OPTIONAL: Still fetch Firestore for other data (points, etc.)
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);
      
      if (!userDocSnap.exists()) {
        console.warn("Creating missing user doc...");
        await setDoc(userDocRef, {
          email: user.email,
          role: "resident",
          totalPoints: 0,
          createdAt: new Date(),
        });
      }

    } catch (error) {
      console.error("Error in auth state change:", error);
      setIsAdmin(false);
    } finally {
      setLoading(false);
      setAuthInitialized(true);
    }
  });

  return () => unsubscribe();
}, []);

  // Sign in with email and password
  const loginUser = async (email, password) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // Don't set loading here - let onAuthStateChanged handle it
    } catch (error) {
      throw error;
    }
  };

  // Create user with email and password
  const createUser = async (email, password) => {
    try {
      const userCred = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCred.user;

      // Create Firestore user document
      await setDoc(doc(db, "users", user.uid), {
        email: user.email,
        role: "resident",
        totalPoints: 0,
        createdAt: new Date(),
      });
    } catch (error) {
      throw error;
    }
  };

  // Logout user
  const logOut = async () => {
    try {
      // Reset states immediately for faster UI response
      setCurrentUser(null);
      setIsAdmin(false);
      setLoading(true);
      
      await signOut(auth);
    } catch (error) {
      console.error("Logout error:", error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{ 
        currentUser, 
        isAdmin, 
        loading, 
        authInitialized,
        loginUser, 
        createUser, 
        logOut 
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};