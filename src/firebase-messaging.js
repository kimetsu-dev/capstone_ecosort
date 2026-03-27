import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";
import { doc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import app, { db } from "./firebase";

const VAPID_KEY = "BFFuaGuP8bKDwDsZ6lZm4G98ambUfOca_2eTvLeexdfaSkBwdEUee3z_knD5KrzGdiTsCrR-Zwxjy6c6srTVkuI";

// The SW must be registered at the root scope for FCM to work.
// CRA registers its own SW (/service-worker.js) — we register ours separately
// so getToken() binds to the correct one.
const SW_PATH = "/firebase-messaging-sw.js";

let messaging = null;

// ─── Initialize Messaging ─────────────────────────────────────────────────────

export async function initMessaging() {
  try {
    const supported = await isSupported();
    if (!supported) {
      console.warn("🚫 Firebase Messaging not supported in this browser.");
      return null;
    }
    messaging = getMessaging(app);
    return messaging;
  } catch (err) {
    console.error("⚠️ Error initializing messaging:", err);
    return null;
  }
}

// ─── Register the Firebase messaging SW explicitly ────────────────────────────
// This ensures getToken() is tied to OUR service worker, not CRA's SW.

async function getMessagingSwRegistration() {
  try {
    // Check if our SW is already registered
    const registrations = await navigator.serviceWorker.getRegistrations();
    const existing = registrations.find((r) =>
      r.active?.scriptURL?.includes("firebase-messaging-sw.js") ||
      r.installing?.scriptURL?.includes("firebase-messaging-sw.js") ||
      r.waiting?.scriptURL?.includes("firebase-messaging-sw.js")
    );
    if (existing) return existing;

    // Register fresh
    const reg = await navigator.serviceWorker.register(SW_PATH, { scope: "/" });
    console.log("✅ firebase-messaging-sw.js registered:", reg.scope);
    return reg;
  } catch (err) {
    console.error("⚠️ Failed to register firebase-messaging-sw.js:", err);
    return null;
  }
}

// ─── Save FCM token to Firestore ──────────────────────────────────────────────

async function saveTokenToFirestore(userId, token) {
  try {
    await setDoc(
      doc(db, "users", userId, "fcmTokens", token),
      {
        token,
        updatedAt: serverTimestamp(),
        platform: /iPhone|iPad|Android/.test(navigator.userAgent) ? "mobile" : "web",
        userAgent: navigator.userAgent,
      },
      { merge: true }
    );
    console.log("✅ FCM token saved to Firestore for user:", userId);
  } catch (err) {
    console.error("⚠️ Failed to save FCM token to Firestore:", err);
  }
}

// ─── Remove FCM token from Firestore (call on logout) ────────────────────────

export async function removeTokenFromFirestore(userId) {
  if (!messaging || !userId) return;
  try {
    const registration = await getMessagingSwRegistration();
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (token) {
      await deleteDoc(doc(db, "users", userId, "fcmTokens", token));
      console.log("✅ FCM token removed from Firestore.");
    }
  } catch (err) {
    console.error("⚠️ Failed to remove FCM token:", err);
  }
}

// ─── Request Permission + Get Token ──────────────────────────────────────────

export async function requestFirebaseNotificationPermission(userId) {
  if (!messaging) await initMessaging();
  if (!messaging) return null;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.log("🚫 Notification permission denied.");
      return null;
    }

    // Always use our dedicated Firebase messaging SW — not CRA's SW
    const registration = await getMessagingSwRegistration();
    if (!registration) {
      console.error("⚠️ Could not get firebase-messaging-sw registration.");
      return null;
    }

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    console.log("📲 FCM token:", token);

    if (token && userId) {
      await saveTokenToFirestore(userId, token);
    }

    return token;
  } catch (error) {
    console.error("⚠️ Error getting FCM token:", error);
    return null;
  }
}

// ─── Foreground Message Listener ─────────────────────────────────────────────

export function onMessageListener(callback) {
  if (!messaging) return () => {};
  return onMessage(messaging, (payload) => {
    callback(payload);
  });
}