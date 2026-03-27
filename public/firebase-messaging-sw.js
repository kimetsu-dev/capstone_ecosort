/* eslint-disable no-undef */
// ─── Firebase Messaging Service Worker ───────────────────────────────────────
// This is the ONLY place Firebase Messaging runs.
// Must live at /public/firebase-messaging-sw.js → CRA copies it to /build/
// Served at: https://yourdomain.com/firebase-messaging-sw.js

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// ─── 1. Initialize Firebase (storageBucket must match src/firebase.js) ────────
firebase.initializeApp({
  apiKey:            "AIzaSyDWRvunKHCqs3maebTRr1dICfxb04XGW6A",
  authDomain:        "ecosort-51471.firebaseapp.com",
  projectId:         "ecosort-51471",
  storageBucket:     "ecosort-51471.firebasestorage.app",
  messagingSenderId: "296718734304",
  appId:             "1:296718734304:web:852095c72930c6b61a1185",
  measurementId:     "G-31NRJCYK8P",
});

// ─── 2. Messaging instance ────────────────────────────────────────────────────
const messaging = firebase.messaging();

console.log('✅ [firebase-messaging-sw.js] FCM background listener active.');

// ─── 3. Background message handler ───────────────────────────────────────────
// Fires when a push arrives and the app is CLOSED or BACKGROUNDED on Android.

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] onBackgroundMessage:', payload);

  const title = payload.notification?.title || 'EcoSort';
  const body  = payload.notification?.body  || 'You have a new notification.';
  const data  = payload.data || {};

  const options = {
    body,
    icon:     '/icons/icon-192x192.png',
    badge:    '/icons/icon-72x72.png',
    tag:      data.type || 'ecosort-notification',
    renotify: true,
    vibrate:  [200, 100, 200],
    data: { ...data, title, body },
  };

  return self.registration.showNotification(title, options);
});

// ─── 4. Notification click handler ───────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] notificationclick:', event.notification.data);
  event.notification.close();

  const data = event.notification.data || {};
  let path = '/dashboard';

  if (data.type === 'submission_approved' || data.type === 'submission_rejected') {
    path = data.submissionId ? `/transactions?id=${data.submissionId}` : '/transactions';
  } else if (data.type === 'redemption_confirmed' || data.type === 'redemption_rejected') {
    path = data.redemptionId ? `/my-redemptions?id=${data.redemptionId}` : '/my-redemptions';
  } else if (data.type === 'support_response') {
    path = data.ticketId ? `/support?ticket=${data.ticketId}` : '/support';
  } else if (data.type === 'collection_today' || data.type === 'collection_reminder') {
    path = '/dashboard';
  } else if (data.type === 'submission_today' || data.type === 'submission_reminder') {
    path = '/submit-waste';
  }

  const fullUrl = self.location.origin + path;

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.startsWith(self.location.origin) && 'focus' in client) {
            client.focus();
            return client.navigate ? client.navigate(fullUrl) : undefined;
          }
        }
        return clients.openWindow(fullUrl);
      })
  );
});