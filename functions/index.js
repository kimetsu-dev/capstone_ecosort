/**
 * EcoSort – Firebase Cloud Functions (v2)
 *
 * Triggers:
 *   1. onSubmissionStatusChanged — watches waste_submissions/{submissionId}
 *   2. onRedemptionStatusChanged — watches redemptions/{redemptionId}
 *
 * Deploy:
 *   firebase deploy --only functions
 */

const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();

// ─── Helper: get all FCM tokens for a user ────────────────────────────────────

async function getTokens(userId) {
  const snap = await db
    .collection("users").doc(userId)
    .collection("fcmTokens")
    .get();
  return snap.docs.map((d) => d.data().token).filter(Boolean);
}

// ─── Helper: send multicast push + remove stale tokens ───────────────────────

async function sendPush(userId, tokens, title, body, data) {
  if (tokens.length === 0) {
    console.log(`No FCM tokens for user ${userId} — bell notification only.`);
    return;
  }

  // Convert all data values to strings — FCM data payload requires string values
  const stringData = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, String(v ?? "")])
  );

  const message = {
    notification: { title, body },
    // android + webpush blocks ensure notification shows when app is closed
    android: {
      notification: {
        icon: "ic_notification",
        color: "#4CAF50",
        channelId: "ecosort_default",
        priority: "HIGH",
      },
      priority: "high",
    },
    webpush: {
      notification: {
        icon: "/icons/icon-192x192.png",
        badge: "/icons/icon-72x72.png",
        requireInteraction: false,
        tag: data.type || "ecosort-notification",
      },
      fcmOptions: {
        // Deep link — the SW notificationclick handler also handles routing
        link: "/dashboard",
      },
    },
    data: stringData,
    tokens,
  };

  const response = await admin.messaging().sendEachForMulticast(message);

  console.log(
    `Push to ${tokens.length} device(s) for ${userId}: ` +
    `${response.successCount} ok, ${response.failureCount} failed.`
  );

  // Remove stale/invalid tokens
  const batch = db.batch();
  let staleCount = 0;

  response.responses.forEach((res, i) => {
    if (res.success) return;
    const code = res.error?.code;
    if (
      code === "messaging/registration-token-not-registered" ||
      code === "messaging/invalid-registration-token"
    ) {
      batch.delete(
        db.collection("users").doc(userId)
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

// ─── Helper: write bell notification to Firestore (with dedup) ───────────────
// dedupeKey: if provided, skips the write if a doc with that key already exists.
// This prevents duplicate notifications when both the client and the Cloud
// Function race to write the same event (e.g. rejection flows).

async function writeNotification(userId, fields, dedupeKey = null) {
  const colRef = db
    .collection("notifications").doc(userId)
    .collection("userNotifications");

  if (dedupeKey) {
    const existing = await colRef
      .where("dedupeKey", "==", dedupeKey)
      .limit(1)
      .get();
    if (!existing.empty) {
      console.log(`Skipping duplicate notification (dedupeKey: ${dedupeKey})`);
      return;
    }
  }

  await colRef.add({
    ...fields,
    ...(dedupeKey ? { dedupeKey } : {}),
    read:      false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRIGGER 1 — Waste Submission status changed
// ═══════════════════════════════════════════════════════════════════════════════

exports.onSubmissionStatusChanged = onDocumentUpdated(
  "waste_submissions/{submissionId}",
  async (event) => {
    const before = event.data.before.data();
    const after  = event.data.after.data();

    if (before.status === after.status) return null;

    const newStatus    = after.status;
    const userId       = after.userId;
    const submissionId = event.params.submissionId;

    if (!userId) {
      console.warn(`Submission ${submissionId} has no userId — skipping.`);
      return null;
    }

    let title, body, type;

    if (newStatus === "approved") {
      const points = after.pointsAwarded ?? 0;
      title = "♻️ Submission Approved!";
      body  = `Your waste submission was confirmed. You earned ${points} point${points !== 1 ? "s" : ""}!`;
      type  = "submission_approved";
    } else if (newStatus === "rejected") {
      const reason = after.rejectionReason?.trim();
      title = "❌ Submission Not Approved";
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
    }, `${type}__${submissionId}`);

    await sendPush(userId, tokens, title, body, {
      type,
      submissionId,
      userId,
    });

    return null;
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// TRIGGER 2 — Redemption status changed
// ═══════════════════════════════════════════════════════════════════════════════

exports.onRedemptionStatusChanged = onDocumentUpdated(
  "redemptions/{redemptionId}",
  async (event) => {
    const before = event.data.before.data();
    const after  = event.data.after.data();

    if (before.status === after.status) return null;

    const newStatus    = after.status;
    const userId       = after.userId;
    const redemptionId = event.params.redemptionId;
    const rewardName   = after.rewardName || "your reward";

    if (!userId) {
      console.warn(`Redemption ${redemptionId} has no userId — skipping.`);
      return null;
    }

    let title, body, type;

    if (newStatus === "confirmed") {
      title = "🎁 Redemption Confirmed!";
      body  = `Your redemption of "${rewardName}" has been confirmed. Enjoy your reward!`;
      type  = "redemption_confirmed";
    } else if (newStatus === "rejected") {
      title = "❌ Redemption Not Approved";
      body  = `Your redemption of "${rewardName}" was rejected. Your points have been refunded.`;
      type  = "redemption_rejected";
    } else if (newStatus === "cancelled") {
      await writeNotification(userId, {
        type:        "redemption_cancelled",
        title:       "🚫 Redemption Cancelled",
        message:     `Your redemption of "${rewardName}" has been cancelled.`,
        redemptionId,
        rewardName,
        status:      "cancelled",
      }, `redemption_cancelled__${redemptionId}`);
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
    }, `${type}__${redemptionId}`);

    await sendPush(userId, tokens, title, body, {
      type,
      redemptionId,
      rewardName,
      userId,
    });

    return null;
  }
);