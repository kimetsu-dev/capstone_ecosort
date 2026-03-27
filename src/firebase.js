import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// ─── Firebase config ──────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyDWRvunKHCqs3maebTRr1dICfxb04XGW6A",
  authDomain:        "ecosort-51471.firebaseapp.com",
  projectId:         "ecosort-51471",
  storageBucket:     "ecosort-51471.firebasestorage.app",
  messagingSenderId: "296718734304",
  appId:             "1:296718734304:web:852095c72930c6b61a1185",
  measurementId:     "G-31NRJCYK8P",
};

const app = initializeApp(firebaseConfig);

export const auth    = getAuth(app);
export const db      = getFirestore(app);
export const storage = getStorage(app);
export const provider = new GoogleAuthProvider();

// ─── NOTE on Firebase Messaging ───────────────────────────────────────────────
// Messaging is NOT initialized here. It is initialized on-demand inside
// src/firebase-messaging.js via initMessaging() / requestFirebaseNotificationPermission().
//
// Background notifications are handled exclusively by:
//   /public/firebase-messaging-sw.js
//
// Initializing messaging here caused a race condition where `messaging` was
// exported as null before the async isSupported() check resolved.

export default app;

// Dev helper only — remove before production if desired
if (process.env.NODE_ENV === "development") {
  window.db = db;
}