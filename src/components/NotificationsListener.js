import React, { useEffect, useRef } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  getDocs,
  getDoc,
  doc,
  limit,
} from "firebase/firestore";
// getDoc is used by usePointsTamperWatcher to re-read the live value after the
// async ledger check settles, avoiding stale-closure false alarms.
import { db } from "../firebase";
import {
  initMessaging,
  requestFirebaseNotificationPermission,
  onMessageListener,
} from "../firebase-messaging";

const DAYS_LONG = [
  "sunday", "monday", "tuesday", "wednesday",
  "thursday", "friday", "saturday",
];

function isScheduledForDate(date, schedule) {
  const dayName = date
    .toLocaleDateString("en-US", { weekday: "long" })
    .toLowerCase();

  if (schedule.type === "submission") {
    if (schedule.operatingDays) {
      return !!(schedule.operatingDays[dayName]?.selected);
    }
    return schedule.day === dayName;
  }

  if (schedule.day !== dayName) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weeksDiff = Math.round(
    (date.getTime() - today.getTime()) / (7 * 24 * 60 * 60 * 1000)
  );

  switch (schedule.frequency) {
    case "weekly":
      return true;
    case "biweekly":
      return Math.abs(weeksDiff) % 2 === 0;
    case "monthly": {
      const first = new Date(date.getFullYear(), date.getMonth(), 1);
      const targetDay = DAYS_LONG.indexOf(dayName);
      while (first.getDay() !== targetDay) first.setDate(first.getDate() + 1);
      return date.getDate() === first.getDate();
    }
    default:
      return false;
  }
}

function getTimeLabel(schedule, dayName) {
  if (schedule.type === "submission" && schedule.operatingDays) {
    const dd = schedule.operatingDays[dayName];
    if (dd?.startTime) {
      const to12 = (t) => {
        const [h, m] = t.split(":");
        const d = new Date();
        d.setHours(+h, +m);
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      };
      return dd.endTime
        ? `${to12(dd.startTime)} – ${to12(dd.endTime)}`
        : to12(dd.startTime);
    }
  }
  if (schedule.startTime) {
    const to12 = (t) => {
      const [h, m] = t.split(":");
      const d = new Date();
      d.setHours(+h, +m);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    };
    return schedule.endTime
      ? `${to12(schedule.startTime)} – ${to12(schedule.endTime)}`
      : to12(schedule.startTime);
  }
  return null;
}

function reminderKey(type, scheduleId, dateStr) {
  return `${type}__${scheduleId}__${dateStr}`;
}

function useFCMPermission(userId) {
  useEffect(() => {
    if (!userId) return;

    async function setup() {
      await initMessaging();
      await requestFirebaseNotificationPermission(userId);
    }

    setup();
  }, [userId]);
}

function useFCMForegroundMessages(userId) {
  useEffect(() => {
    if (!userId) return;

    const unsubscribe = onMessageListener(async (payload) => {
      console.log("[FCM Foreground] Received:", payload);

      const title   = payload.notification?.title || "EcoSort";
      const body    = payload.notification?.body  || "";
      const data    = payload.data || {};
      const type    = data.type || "general";
      const message = body || title;

      const toastOptions = {
        position: "top-right",
        autoClose: 7000,
        closeOnClick: true,
        pauseOnHover: true,
      };

      if (type === "submission_approved") {
        toast.success(`♻️ ${title}: ${body}`, toastOptions);
      } else if (type === "submission_rejected") {
        toast.error(`❌ ${title}: ${body}`, toastOptions);
      } else if (type === "redemption_confirmed") {
        toast.success(`🎁 ${title}: ${body}`, toastOptions);
      } else if (type === "redemption_rejected") {
        toast.error(`❌ ${title}: ${body}`, toastOptions);
      } else if (type === "support_response") {
        toast.info(`💬 ${title}: ${body}`, { ...toastOptions, autoClose: 9000 });
      } else if (type === "points_tampered") {
        toast.error(`🚨 ${title}: ${body}`, { ...toastOptions, autoClose: 10000 });
      } else if (type === "points_restored") {
        toast.success(`✅ ${title}: ${body}`, { ...toastOptions, autoClose: 9000 });
      } else if (type === "collection_today" || type === "collection_reminder") {
        toast.warning(`🚛 ${title}: ${body}`, toastOptions);
      } else if (type === "submission_today" || type === "submission_reminder") {
        toast.success(`📅 ${title}: ${body}`, toastOptions);
      } else {
        toast.info(message, toastOptions);
      }

      if (data.writeNotification === "true") {
        try {
          const notifRef = collection(db, "notifications", userId, "userNotifications");
          await addDoc(notifRef, {
            type,
            title,
            message: body,
            read: false,
            createdAt: serverTimestamp(),
            ...(data.submissionId && { submissionId: data.submissionId }),
            ...(data.ticketId     && { ticketId:     data.ticketId     }),
          });
        } catch (err) {
          console.error("Failed to persist FCM foreground notification:", err);
        }
      }
    });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [userId]);
}

function useUserNotifications(userId) {
  const sessionStartTime = useRef(Date.now());
  // Tracks doc IDs already toasted this session (from FCM or a prior snapshot event)
  // so that a single notification document never produces two toasts.
  const toastedDocIds = useRef(new Set());

  useEffect(() => {
    if (!userId) return;

    const notifQuery = query(
      collection(db, "notifications", userId, "userNotifications"),
      where("read", "==", false),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(notifQuery, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const docId = change.doc.id;

          // Skip if this document was already toasted this session
          if (toastedDocIds.current.has(docId)) return;
          toastedDocIds.current.add(docId);

          const notification = change.doc.data();
          const notifTime =
            notification.createdAt?.toMillis() || Date.now();

          if (notifTime > sessionStartTime.current) {
            const isCollection =
              notification.type === "collection_reminder" ||
              notification.type === "collection_today";
            const isSubmission =
              notification.type === "submission_reminder" ||
              notification.type === "submission_today";
            const isSupportResponse =
              notification.type === "support_response";

            const toastOptions = {
              position: "top-right",
              autoClose: 6000,
              closeOnClick: true,
              pauseOnHover: true,
            };

            if (isCollection) {
              toast.warning(notification.message, toastOptions);
            } else if (isSubmission) {
              toast.success(notification.message, toastOptions);
            } else if (notification.type === "submission_approved") {
              toast.success(`♻️ ${notification.message}`, toastOptions);
            } else if (notification.type === "submission_rejected") {
              toast.error(`❌ ${notification.message}`, toastOptions);
            } else if (notification.type === "redemption_confirmed") {
              toast.success(`🎁 ${notification.message}`, toastOptions);
            } else if (notification.type === "redemption_rejected") {
              toast.error(`❌ ${notification.message}`, toastOptions);
            } else if (notification.type === "redemption_cancelled") {
              toast.info(`🚫 ${notification.message}`, toastOptions);
            } else if (notification.type === "points_tampered") {
              toast.error(`🚨 ${notification.message}`, { ...toastOptions, autoClose: 10000 });
            } else if (notification.type === "points_restored") {
              toast.success(`✅ ${notification.message}`, { ...toastOptions, autoClose: 9000 });
            } else if (isSupportResponse) {
              toast.info(notification.message, { ...toastOptions, autoClose: 8000 });
            } else {
              toast.info(notification.message, toastOptions);
            }
          }
        }
      });
    });

    return () => unsubscribe();
  }, [userId]);
}

function useScheduleReminders(userId) {
  useEffect(() => {
    if (!userId) return;

    async function checkAndFireReminders() {
      try {
        const [collSnap, subSnap] = await Promise.all([
          getDocs(
            query(
              collection(db, "collection_schedules"),
              where("isActive", "==", true)
            )
          ),
          getDocs(
            query(
              collection(db, "submission_schedules"),
              where("isActive", "==", true)
            )
          ),
        ]);

        const collectionSchedules = collSnap.docs.map((d) => ({
          id: d.id,
          type: "collection",
          ...d.data(),
        }));
        const submissionSchedules = subSnap.docs.map((d) => ({
          id: d.id,
          type: "submission",
          ...d.data(),
        }));

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        const todayStr    = today.toISOString().split("T")[0];
        const tomorrowStr = tomorrow.toISOString().split("T")[0];

        const todayDayName = today
          .toLocaleDateString("en-US", { weekday: "long" })
          .toLowerCase();
        const tomorrowDayName = tomorrow
          .toLocaleDateString("en-US", { weekday: "long" })
          .toLowerCase();

        const existingSnap = await getDocs(
          query(
            collection(db, "notifications", userId, "userNotifications"),
            where("isScheduleReminder", "==", true),
            where("reminderDate", "in", [todayStr, tomorrowStr])
          )
        );
        const existingKeys = new Set(
          existingSnap.docs.map((d) => d.data().dedupeKey)
        );

        const notifRef = collection(
          db,
          "notifications",
          userId,
          "userNotifications"
        );

        const writes = [];

        for (const s of collectionSchedules) {
          const areaLabel = s.barangay
            ? `${s.area}, ${s.barangay}`
            : s.area || "your area";
          const timeLabel = getTimeLabel(s, todayDayName);

          if (isScheduledForDate(today, s)) {
            const key = reminderKey("col_today", s.id, todayStr);
            if (!existingKeys.has(key)) {
              writes.push(
                addDoc(notifRef, {
                  type: "collection_today",
                  title: "🚛 Waste Collection Today!",
                  message: `Garbage collection is happening today in ${areaLabel}${
                    timeLabel ? ` at ${timeLabel}` : ""
                  }. Please put out your garbage before the truck arrives!`,
                  read: false,
                  isScheduleReminder: true,
                  reminderDate: todayStr,
                  dedupeKey: key,
                  scheduleId: s.id,
                  createdAt: serverTimestamp(),
                })
              );
            }
          }

          if (isScheduledForDate(tomorrow, s)) {
            const tTimeLabel = getTimeLabel(s, tomorrowDayName);
            const key = reminderKey("col_tomorrow", s.id, tomorrowStr);
            if (!existingKeys.has(key)) {
              writes.push(
                addDoc(notifRef, {
                  type: "collection_reminder",
                  title: "🗑️ Garbage Collection Tomorrow",
                  message: `Heads up! Waste collection is scheduled for tomorrow in ${areaLabel}${
                    tTimeLabel ? ` at ${tTimeLabel}` : ""
                  }. Prepare your garbage tonight so it's ready in the morning.`,
                  read: false,
                  isScheduleReminder: true,
                  reminderDate: tomorrowStr,
                  dedupeKey: key,
                  scheduleId: s.id,
                  createdAt: serverTimestamp(),
                })
              );
            }
          }
        }

        for (const s of submissionSchedules) {
          const areaLabel = s.barangay
            ? `${s.area}, ${s.barangay}`
            : s.area || "the drop-off point";
          const timeLabel = getTimeLabel(s, todayDayName);

          if (isScheduledForDate(today, s)) {
            const key = reminderKey("sub_today", s.id, todayStr);
            if (!existingKeys.has(key)) {
              writes.push(
                addDoc(notifRef, {
                  type: "submission_today",
                  title: "♻️ Waste Submission Open Today",
                  message: `The waste drop-off in ${areaLabel} is open today${
                    timeLabel ? ` from ${timeLabel}` : ""
                  }. Don't forget to bring your recyclables and submit your waste on time!`,
                  read: false,
                  isScheduleReminder: true,
                  reminderDate: todayStr,
                  dedupeKey: key,
                  scheduleId: s.id,
                  createdAt: serverTimestamp(),
                })
              );
            }
          }

          if (isScheduledForDate(tomorrow, s)) {
            const tTimeLabel = getTimeLabel(s, tomorrowDayName);
            const key = reminderKey("sub_tomorrow", s.id, tomorrowStr);
            if (!existingKeys.has(key)) {
              writes.push(
                addDoc(notifRef, {
                  type: "submission_reminder",
                  title: "📅 Submission Day Tomorrow",
                  message: `Reminder: The waste submission point in ${areaLabel} opens tomorrow${
                    tTimeLabel ? ` at ${tTimeLabel}` : ""
                  }. Prepare your items tonight and submit on time!`,
                  read: false,
                  isScheduleReminder: true,
                  reminderDate: tomorrowStr,
                  dedupeKey: key,
                  scheduleId: s.id,
                  createdAt: serverTimestamp(),
                })
              );
            }
          }
        }

        await Promise.all(writes);
      } catch (err) {
        console.error("Schedule reminder check failed:", err);
      }
    }

    checkAndFireReminders();
  }, [userId]);
}

function useSupportTicketResponses(userId) {
  const sessionStartTime = useRef(Date.now());

  useEffect(() => {
    if (!userId) return;

    const toastedThisSession = new Set();

    const q = query(
      collection(db, "supportTickets"),
      where("userId", "==", userId)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const writes = [];

      for (const change of snapshot.docChanges()) {
        if (change.type !== "added" && change.type !== "modified") continue;

        const ticket   = change.doc.data();
        const ticketId = change.doc.id;

        if (!ticket.adminResponse?.trim()) continue;
        if (toastedThisSession.has(ticketId)) continue;

        const updatedAt = ticket.updatedAt?.toMillis?.() ?? 0;
        if (updatedAt <= sessionStartTime.current && change.type === "added") continue;

        toastedThisSession.add(ticketId);

        toast.info(
          `💬 Support replied to your ticket: "${ticket.subject}"`,
          {
            position: "top-right",
            autoClose: 8000,
            closeOnClick: true,
            pauseOnHover: true,
          }
        );

        const dedupeKey = `support_response__${ticketId}__${updatedAt}`;
        const notifRef  = collection(db, "notifications", userId, "userNotifications");

        try {
          const existingSnap = await getDocs(
            query(notifRef, where("dedupeKey", "==", dedupeKey))
          );
          if (existingSnap.empty) {
            writes.push(
              addDoc(notifRef, {
                type: "support_response",
                title: "💬 Support Team Replied",
                message: `Your ticket "${ticket.subject}" has received a response from our support team.`,
                adminResponse:  ticket.adminResponse.trim(),
                ticketId,
                ticketSubject:  ticket.subject,
                ticketCategory: ticket.category,
                ticketStatus:   ticket.status,
                read:           false,
                dedupeKey,
                createdAt: serverTimestamp(),
              })
            );
          }
        } catch (err) {
          console.error("support_response dedup check failed:", err);
        }
      }

      if (writes.length) await Promise.all(writes);
    });

    return () => unsubscribe();
  }, [userId]);
}

function usePointsTamperWatcher(userId) {
  const initialLoadDone  = useRef(false);
  const lastKnownPoints  = useRef(null);
  const lastAlertedPair  = useRef(null);
  const timeoutRef       = useRef(null);
  // Prevents a stale in-flight check from updating lastKnownPoints after a
  // newer snapshot has already superseded it.
  const checkVersionRef  = useRef(0);

  useEffect(() => {
    if (!userId) return;

    const userRef = doc(db, 'users', userId);

    const unsubscribe = onSnapshot(userRef, (docSnap) => {
      if (!docSnap.exists()) return;

      const livePts = docSnap.data().totalPoints ?? 0;

      if (!initialLoadDone.current) {
        initialLoadDone.current = true;
        lastKnownPoints.current = livePts;
        return;
      }

      if (livePts === lastKnownPoints.current) return;

      // Debounce: cancel any pending check and start a fresh one.
      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      // Stamp this check so stale async completions can be ignored.
      const myVersion = ++checkVersionRef.current;

      timeoutRef.current = setTimeout(async () => {
        try {
          // IMPORTANT: BALANCE_ACTION_TYPES must exactly mirror restoreUserBalance()
          // in blockchainService.js. Any divergence causes permanent false alarms.
          const BALANCE_ACTION_TYPES = new Set([
            'SUBMISSION_CONFIRMED',
            'ADMIN_POINTS_AWARDED',
            'ADMIN_POINTS_DEDUCTED',
            'REWARD_REDEEMED',
            'REDEMPTION_CANCELLED',
          ]);

          const ledgerSnap = await getDocs(
            query(collection(db, 'ledger'), where('userId', '==', userId), orderBy('index', 'asc'))
          );

          // Bail if a newer snapshot has already superseded this check.
          if (myVersion !== checkVersionRef.current) return;

          let ledgerSum = 0;

          ledgerSnap.docs.forEach(d => {
            const b = d.data();
            // POINTS_RESET zeroes the running balance at that point in time.
            if (b.actionType === 'POINTS_RESET') {
              ledgerSum = 0;
              return;
            }
            if (!BALANCE_ACTION_TYPES.has(b.actionType)) return;
            const pts = b.metadata?.txPoints !== undefined && b.metadata?.txPoints !== null
              ? b.metadata.txPoints
              : (b.points || 0);
            ledgerSum += pts;
          });

          ledgerSum = Math.round(ledgerSum * 100) / 100;

          // Re-read the live value at check time (not the captured closure value)
          // so a rapid reset → re-award sequence resolves correctly.
          const currentDocSnap = await getDoc(doc(db, 'users', userId));
          if (!currentDocSnap.exists()) return;
          const currentLivePts = currentDocSnap.data().totalPoints ?? 0;

          // Now safe to advance lastKnownPoints — the ledger read has settled.
          lastKnownPoints.current = currentLivePts;

          if (ledgerSnap.docs.length === 0) return;

          const roundedLive     = Math.round(currentLivePts * 100) / 100;
          const expectedBalance = ledgerSum;

          if (roundedLive !== expectedBalance) {
            const alertKey = `${expectedBalance}→${roundedLive}`;
            if (lastAlertedPair.current === alertKey) return;
            lastAlertedPair.current = alertKey;

            const delta     = Math.round((roundedLive - expectedBalance) * 100) / 100;
            const direction = delta < 0 ? 'decreased' : 'increased';
            const absDelta  = Math.abs(delta);

            const notifRef = collection(db, 'notifications', userId, 'userNotifications');
            await addDoc(notifRef, {
              type:            'points_tampered',
              title:           '⚠️ Points Change Detected',
              message:
                `Your points were ${direction} by ${absDelta} pts without a matching transaction. ` +
                `Expected: ${expectedBalance} pts — Current: ${roundedLive} pts.`,
              read:            false,
              previousBalance: expectedBalance,
              tamperedBalance: roundedLive,
              delta,
              detectedAt:      new Date().toISOString(),
              createdAt:       serverTimestamp(),
            });
          } else {
            lastAlertedPair.current = null;
          }
        } catch (err) {
          console.error('[PointsTamperWatcher] Verification failed:', err);
        }
      }, 5000); // 5s debounce — gives addToLedger() time to commit before we check
    });

    return () => {
      unsubscribe();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [userId]);
}

export default function NotificationsListener({ userId }) {
  useFCMPermission(userId);
  useFCMForegroundMessages(userId);
  useUserNotifications(userId);
  useScheduleReminders(userId);
  useSupportTicketResponses(userId);
  usePointsTamperWatcher(userId);

  return (
    <ToastContainer
      position="top-right"
      toastClassName={(ctx) =>
        [
          "relative flex p-4 min-h-10 rounded-xl justify-between overflow-hidden cursor-pointer mb-2",
          ctx?.type === "warning"
            ? "bg-orange-50 border border-orange-200 text-orange-800"
            : ctx?.type === "success"
            ? "bg-green-50 border border-green-200 text-green-800"
            : ctx?.type === "error"
            ? "bg-red-50 border border-red-200 text-red-800"
            : "bg-blue-50 border border-blue-200 text-blue-800",
        ].join(" ")
      }
      bodyClassName="flex text-sm font-medium gap-2"
      autoClose={6000}
      closeOnClick
      pauseOnHover
      newestOnTop
    />
  );
}