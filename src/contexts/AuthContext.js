import React, { createContext, useContext, useState, useEffect } from "react";
import { auth, db } from "../firebase";
import { removeTokenFromFirestore } from "../firebase-messaging";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
} from "firebase/auth";

// doc/getDoc/setDoc are handled in Login.js and Signup.js directly

const AuthContext = createContext(undefined);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authInitialized, setAuthInitialized] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // 1. Reload the user to get the latest emailVerified status and
          //    any other profile changes (e.g. displayName set during signup).
          //    This is critical — without reload(), emailVerified can be stale.
          await user.reload();

          // 2. Get the reloaded user object from auth (reload() mutates in place
          //    but we re-read from auth.currentUser to get the freshest copy).
          const freshUser = auth.currentUser;

          // 3. Force a token refresh so Firestore security rules instantly
          //    recognise the correct provider claims and admin status.
          //
          //    NOTE: We do NOT disable/enable Firestore network here.
          //    The disableNetwork/enableNetwork pattern caused all active
          //    onSnapshot listeners (admin tabs, dashboard stats, analytics, etc.)
          //    to receive permission errors during the downtime and fail silently,
          //    making data disappear. The token refresh alone is sufficient —
          //    Firestore SDK re-evaluates security rules on the next request.
          const idTokenResult = await freshUser.getIdTokenResult(true);

          setIsAdmin(!!idTokenResult.claims.admin);

          // 4. Set the fresh user object — this is what all consumers get.
          setCurrentUser(freshUser);

        } catch (error) {
          console.error("Error in auth state change:", error);
          // Still set the user so the app doesn't hang on a network hiccup
          setCurrentUser(user);
          setIsAdmin(false);
        }
      } else {
        // No user logged in — reset everything
        setCurrentUser(null);
        setIsAdmin(false);
      }

      setLoading(false);
      setAuthInitialized(true);
    });

    return () => unsubscribe();
  }, []);

  // Sign in with email and password
  const loginUser = async (email, password) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      throw error;
    }
  };

  // createUser is intentionally a thin wrapper — the real signup flow
  // (verification email, displayName, Firestore doc) is handled in Signup.js.
  // This exists only for legacy callers; prefer using Signup.js directly.
  const createUser = async (email, password) => {
    try {
      const userCred = await createUserWithEmailAndPassword(auth, email, password);
      return userCred;
    } catch (error) {
      throw error;
    }
  };

  // Logout user
  const logOut = async () => {
    try {
      // Remove this device's FCM token from Firestore before signing out,
      // so the user stops receiving push notifications on this device.
      if (currentUser?.uid) {
        await removeTokenFromFirestore(currentUser.uid);
      }
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