import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import * as serviceWorkerRegistration from "./serviceWorkerRegistration";

import { AuthProvider } from "./contexts/AuthContext";
import { UserProvider } from "./contexts/UserContext";
import { ThemeProvider } from "./contexts/ThemeContext";

import { isSupported } from "firebase/messaging";

async function registerFirebaseMessagingSW() {
  if (await isSupported()) {
    try {
      await navigator.serviceWorker.register("/firebase-messaging-sw.js");
      console.log("✅ Firebase Messaging service worker registered");
    } catch (err) {
      console.error("⚠️ Failed to register Firebase Messaging SW:", err);
    }
  } else {
    console.log("🚫 Firebase messaging not supported in this browser.");
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Could not find root element with id 'root'");
}

const root = ReactDOM.createRoot(rootElement);

root.render(
  <ThemeProvider>
    <AuthProvider>
      <UserProvider>
        <App />
      </UserProvider>
    </AuthProvider>
  </ThemeProvider>
);

// ── Service Worker Registration ───────────────────────────────────────────────
serviceWorkerRegistration.register({
  onSuccess: (registration) => {
    console.log("✅ App is cached for offline use.");
  },
  onUpdate: (registration) => {
    console.log("🎉 New version available — notifying UpdateBanner.");
    // Dispatch the event UpdateBanner listens for.
    // This is the ONE place this event is ever dispatched.
    window.dispatchEvent(
      new CustomEvent("swUpdated", { detail: registration })
    );
  },
});

// ── Controller Change → Reload ────────────────────────────────────────────────
// This is the ONE place a reload-on-update is triggered.
// UpdateBanner calls skipWaiting() on the waiting SW, which causes
// controllerchange to fire here, which reloads the page with fresh assets.
if ("serviceWorker" in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    console.log("🔄 New service worker activated — reloading for fresh content.");
    window.location.reload();
  });
}

// ── Check for updates when app comes back into focus ─────────────────────────
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && "serviceWorker" in navigator) {
    navigator.serviceWorker.ready.then((registration) => {
      registration.update();
      console.log("👀 App focused — checking for updates...");
    });
  }
});

// ── Firebase Messaging SW ─────────────────────────────────────────────────────
registerFirebaseMessagingSW();