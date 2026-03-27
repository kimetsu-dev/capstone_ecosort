/**
 * EcoSort – Firebase Cloud Functions
 *
 * Uses firebase-functions v1 API (functions.firestore.document)
 * which is stable on Node 20 with firebase-functions ^4.x
 *
 * The v2 onDocumentUpdated API caused "Cannot determine backend specification"
 * timeout errors during deployment — reverted to v1.
 *
 * Deploy:
 *   firebase deploy --only functions
 */

const functions = require("firebase-functions");
const admin     = require("firebase-admin");

admin.initializeApp();

// ⚠️ Lazy Firestore init — do NOT call admin.firestore() at module scope.
// Calling it at the top level causes a 10s timeout during `firebase deploy`
// because the SDK tries to resolve credentials before the runtime is ready.
let _db = null;
function db() {
  if (!_db) _db = admin.firestore();
  return _db;
}

// ─── Helper: get all FCM tokens for a user ────────────────────────────────────

async function getTokens(userId) {
  const snap = await db()
    .collection("users").doc(userId)
    .collection("fcmTokens")
    .get();
  return snap.docs.map((d) => d.data().token).filter(Boolean);
}

// ─── Helper: send multicast push + clean up stale tokens ─────────────────────

async function sendPush(userId, tokens, title, body, data) {
  if (tokens.length === 0) {
    console.log(`No FCM tokens for user ${userId} — bell notification only.`);
    return;
  }

  // FCM data payload values must all be strings
  const stringData = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, String(v ?? "")])
  );

  const message = {
    notification: { title, body },
    android: {
      priority: "high",
      notification: {
        channelId: "ecosort_default",
        priority:  "high",
        icon:      "ic_notification",
        color:     "#4CAF50",
      },
    },
    webpush: {
      notification: {
        icon:  "/icons/icon-192x192.png",
        badge: "/icons/icon-72x72.png",
        tag:   data.type || "ecosort-notification",
        requireInteraction: false,
      },
      fcmOptions: { link: "/dashboard" },
    },
    data:   stringData,
    tokens,
  };

  const response = await admin.messaging().sendEachForMulticast(message);

  console.log(
    `Push to ${tokens.length} device(s) for ${userId}: ` +
    `${response.successCount} ok, ${response.failureCount} failed.`
  );

  // Remove stale tokens
  const batch = db().batch();
  let staleCount = 0;

  response.responses.forEach((res, i) => {
    if (res.success) return;
    const code = res.error?.code;
    if (
      code === "messaging/registration-token-not-registered" ||
      code === "messaging/invalid-registration-token"
    ) {
      batch.delete(
        db().collection("users").doc(userId)
          .collection("fcmTokens").doc(tokens[i])
      );
      staleCount++;
    } else {
      console.warn(`FCM error for token[${i}]: ${code}`);
    }
  });

  if (staleCount > 0) {
    await batch.commit();
    console.log(`Removed ${staleCount} stale token(s) for ${userId}.`);
  }
}

// ─── Helper: write bell notification to Firestore ────────────────────────────

async function writeNotification(userId, fields) {
  await db()
    .collection("notifications").doc(userId)
    .collection("userNotifications")
    .add({
      ...fields,
      read:      false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRIGGER 1 — Waste Submission status changed
// ═══════════════════════════════════════════════════════════════════════════════

exports.onSubmissionStatusChanged = functions.firestore
  .document("waste_submissions/{submissionId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after  = change.after.data();

    if (before.status === after.status) return null;

    const newStatus    = after.status;
    const userId       = after.userId;
    const submissionId = context.params.submissionId;

    if (!userId) {
      console.warn(`Submission ${submissionId} has no userId — skipping.`);
      return null;
    }

    let title, body, type;

    if (newStatus === "approved") {
      const points = after.pointsAwarded ?? 0;
      title = "Submission Approved!";
      body  = `Your waste submission was confirmed. You earned ${points} point${points !== 1 ? "s" : ""}!`;
      type  = "submission_approved";
    } else if (newStatus === "rejected") {
      const reason = after.rejectionReason?.trim();
      title = "Submission Not Approved";
      body  = reason
        ? `Your submission was not approved: ${reason}`
        : "Your submission could not be approved. Tap for details.";
      type  = "submission_rejected";
    } else {
      return null;
    }

    const tokens = await getTokens(userId);

    await writeNotification(userId, {
      type,
      title,
      message: body,
      submissionId,
      status: newStatus === "approved" ? "success" : "rejected",
      ...(newStatus === "rejected" && after.rejectionReason
        ? { reason: after.rejectionReason } : {}),
      ...(newStatus === "approved" && after.pointsAwarded !== undefined
        ? { pointsAwarded: after.pointsAwarded } : {}),
    });

    await sendPush(userId, tokens, title, body, {
      type,
      submissionId,
      userId,
    });

    return null;
  });

// ═══════════════════════════════════════════════════════════════════════════════
// TRIGGER 2 — Redemption status changed
// ═══════════════════════════════════════════════════════════════════════════════

exports.onRedemptionStatusChanged = functions.firestore
  .document("redemptions/{redemptionId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after  = change.after.data();

    if (before.status === after.status) return null;

    const newStatus    = after.status;
    const userId       = after.userId;
    const redemptionId = context.params.redemptionId;
    const rewardName   = after.rewardName || "your reward";

    if (!userId) {
      console.warn(`Redemption ${redemptionId} has no userId — skipping.`);
      return null;
    }

    let title, body, type;

    if (newStatus === "confirmed") {
      title = "Redemption Confirmed!";
      body  = `Your redemption of "${rewardName}" has been confirmed. Enjoy your reward!`;
      type  = "redemption_confirmed";
    } else if (newStatus === "rejected") {
      title = "Redemption Not Approved";
      body  = `Your redemption of "${rewardName}" was rejected. Your points have been refunded.`;
      type  = "redemption_rejected";
    } else if (newStatus === "cancelled") {
      await writeNotification(userId, {
        type:        "redemption_cancelled",
        title:       "Redemption Cancelled",
        message:     `Your redemption of "${rewardName}" has been cancelled.`,
        redemptionId,
        rewardName,
        status:      "cancelled",
      });
      return null;
    } else {
      return null;
    }

    const tokens = await getTokens(userId);

    await writeNotification(userId, {
      type,
      title,
      message: body,
      redemptionId,
      rewardName,
      status: newStatus === "confirmed" ? "success" : "rejected",
    });

    await sendPush(userId, tokens, title, body, {
      type,
      redemptionId,
      rewardName,
      userId,
    });

    return null;
  });