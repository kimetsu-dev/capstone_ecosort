// ─── NotificationInit.js ──────────────────────────────────────────────────────
// Drop this component inside App.js (or wherever your router lives) as a
// child of your AuthContext provider. It fires once after the user logs in
// and saves their FCM token to Firestore so push notifications can reach them.
//
// Usage in App.js:
//   import NotificationInit from "./NotificationInit";
//   ...
//   <AuthProvider>
//     <NotificationInit />   ← add this line
//     <Router> ... </Router>
//   </AuthProvider>

import { useEffect, useRef } from "react";
import { useAuth } from "./contexts/AuthContext";
import {
  initMessaging,
  requestFirebaseNotificationPermission,
} from "./firebase-messaging";

export default function NotificationInit() {
  const { currentUser } = useAuth();
  const didInit = useRef(false);

  useEffect(() => {
    // Only run once per login session and only in production
    // (Firebase Messaging requires HTTPS — it won't work on http://localhost)
    if (!currentUser || didInit.current) return;
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") return;

    didInit.current = true;

    const setup = async () => {
      try {
        // 1. Initialize the messaging instance
        const messaging = await initMessaging();
        if (!messaging) {
          console.warn("⚠️ FCM not supported on this browser/device.");
          return;
        }

        // 2. Request permission + get token + save to Firestore
        //    The browser will only show the permission dialog once.
        //    On subsequent calls it silently returns the existing token.
        const token = await requestFirebaseNotificationPermission(currentUser.uid);

        if (token) {
          console.log("✅ FCM token saved for user:", currentUser.uid);
        } else {
          console.warn("⚠️ FCM token not obtained — user may have denied permission.");
        }
      } catch (err) {
        // Non-fatal — app works fine without push notifications
        console.error("⚠️ Notification setup failed:", err);
      }
    };

    setup();
  }, [currentUser]);

  // Reset so next login re-runs the setup
  useEffect(() => {
    if (!currentUser) {
      didInit.current = false;
    }
  }, [currentUser]);

  return null; // renders nothing
}