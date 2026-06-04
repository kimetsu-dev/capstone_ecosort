import React, { useEffect, useState } from "react";
import { 
  doc, 
  updateDoc, 
  serverTimestamp, 
  addDoc, 
  collection,
  onSnapshot,
  query,
  orderBy,
  runTransaction
} from "firebase/firestore";
import { db } from "../../firebase";
import { addToLedger } from "../../utils/ledgerService";

// ── Preset rejection reasons for redemptions ─────────────────────────────────
const REDEMPTION_REJECT_REASONS = [
  "Redemption code could not be verified onsite",
  "Reward is no longer available or out of stock",
  "User was not present to claim the reward",
  "Suspicious or duplicate redemption detected",
  "Redemption request does not meet eligibility criteria",
];

// ── Reject-with-Reason Modal ──────────────────────────────────────────────────
function RejectRedemptionModal({ isOpen, onClose, onConfirm, isDark }) {
  const [selected, setSelected] = React.useState("");
  const [custom, setCustom] = React.useState("");

  if (!isOpen) return null;

  const reason = selected === "__custom__" ? custom.trim() : selected;

  const handleConfirm = () => {
    if (!reason) return;
    onConfirm(reason);
    setSelected("");
    setCustom("");
  };

  const handleClose = () => {
    setSelected("");
    setCustom("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className={`w-full max-w-md rounded-2xl shadow-2xl overflow-hidden ${isDark ? "bg-gray-800 border border-gray-700" : "bg-white border border-gray-200"}`}>
        <div className={`px-6 py-4 border-b flex items-center justify-between ${isDark ? "border-gray-700 bg-gray-800" : "border-gray-100 bg-gray-50"}`}>
          <div className="flex items-center gap-2">
            <span className="text-lg">⚠️</span>
            <h3 className={`font-bold text-base ${isDark ? "text-white" : "text-gray-900"}`}>Reject Redemption</h3>
          </div>
          <button onClick={handleClose} className={`p-1.5 rounded-lg transition-colors ${isDark ? "hover:bg-gray-700 text-gray-400" : "hover:bg-gray-200 text-gray-500"}`}>✕</button>
        </div>
        <div className="p-6 space-y-4">
          <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>
            Select a reason for rejection. This will be included in the user's notification.
          </p>
          <div className={`p-3 rounded-lg border flex items-start gap-2 text-sm ${isDark ? "bg-green-900/20 border-green-700 text-green-300" : "bg-green-50 border-green-200 text-green-700"}`}>
            <span className="flex-shrink-0 mt-0.5">💚</span>
            <span>The user's points will be <strong>automatically refunded</strong> upon rejection.</span>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {REDEMPTION_REJECT_REASONS.map((r) => (
              <label key={r} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                selected === r
                  ? (isDark ? "border-red-500 bg-red-900/20" : "border-red-400 bg-red-50")
                  : (isDark ? "border-gray-700 hover:border-gray-600" : "border-gray-200 hover:border-gray-300")
              }`}>
                <input type="radio" name="redemption-reject-reason" value={r} checked={selected === r} onChange={() => setSelected(r)} className="mt-0.5 accent-red-500" />
                <span className={`text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>{r}</span>
              </label>
            ))}
            <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
              selected === "__custom__"
                ? (isDark ? "border-red-500 bg-red-900/20" : "border-red-400 bg-red-50")
                : (isDark ? "border-gray-700 hover:border-gray-600" : "border-gray-200 hover:border-gray-300")
            }`}>
              <input type="radio" name="redemption-reject-reason" value="__custom__" checked={selected === "__custom__"} onChange={() => setSelected("__custom__")} className="mt-0.5 accent-red-500" />
              <span className={`text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>Other (write your own reason)</span>
            </label>
            {selected === "__custom__" && (
              <textarea
                rows={3}
                value={custom}
                onChange={e => setCustom(e.target.value)}
                placeholder="Describe the reason for rejection..."
                className={`w-full p-3 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-red-500/30 resize-none ${isDark ? "bg-gray-700 border-gray-600 text-white placeholder-gray-500" : "bg-white border-gray-300 text-gray-900 placeholder-gray-400"}`}
              />
            )}
          </div>
        </div>
        <div className={`px-6 py-4 border-t flex gap-3 ${isDark ? "border-gray-700" : "border-gray-100"}`}>
          <button onClick={handleClose} className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${isDark ? "bg-gray-700 hover:bg-gray-600 text-gray-300" : "bg-gray-100 hover:bg-gray-200 text-gray-700"}`}>
            Back
          </button>
          <button
            onClick={handleConfirm}
            disabled={!reason}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Confirm Rejection
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Notification helper ───────────────────────────────────────────────────────
async function addNotification(userId, message, type = "redemption_status", extras = {}) {
  const notificationsRef = collection(db, "notifications", userId, "userNotifications");
  await addDoc(notificationsRef, {
    type,
    message,
    read: false,
    createdAt: serverTimestamp(),
    ...(extras.title  ? { title:  extras.title  } : {}),
    ...(extras.reason ? { reason: extras.reason } : {}),
    ...(extras.status ? { status: extras.status } : {}),
  });
}

const RedemptionsTab = ({ 
  redemptions, 
  users, 
  rewards, 
  showToast, 
  isDark,
  pendingOnly = false,
  onExitPendingOnly
}) => {
  const [liveStats, setLiveStats] = useState({ 
    total: 0, 
    pending: 0,
    successful: 0, 
    cancelled: 0,
    rejected: 0,
    successRate: 0,
    totalPointsRedeemed: 0
  });
  const [isStatsLoading, setIsStatsLoading] = useState(true);

  const [activeTab, setActiveTab] = useState("pending");
  const [rejectModal, setRejectModal] = useState({ open: false, redemption: null });

  useEffect(() => {
    if (pendingOnly) setActiveTab("pending");
  }, [pendingOnly]);

  // Real-time redemptions listener with permission-denied retry.
  // The isAdmin() Firestore rule does a get(users/{uid}) round-trip that can
  // race against token propagation on first login, returning permission-denied
  // and leaving the tab empty.  We catch that specific error and resubscribe
  // after 2 s — by then the token is always stable.
  useEffect(() => {
    let unsubscribe = null;
    let retryTimer  = null;
    let cancelled   = false;

    const subscribe = () => {
      const redemptionsQuery = query(
        collection(db, "redemptions"),
        orderBy("redeemedAt", "desc")
      );

      unsubscribe = onSnapshot(
        redemptionsQuery,
        (snapshot) => {
          if (cancelled) return;
          try {
            const allRedemptions = snapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            }));

            const total     = allRedemptions.length;
            const pending   = allRedemptions.filter(r => r.status === "pending").length;
            const successful = allRedemptions.filter(r => r.status === "claimed").length;
            const cancelled_ = allRedemptions.filter(r => r.status === "cancelled").length;
            const rejected  = allRedemptions.filter(r => r.status === "rejected").length;
            const successRate = (successful + cancelled_ + rejected) > 0
              ? ((successful / (successful + cancelled_ + rejected)) * 100)
              : 0;

            const totalPointsRedeemed = allRedemptions
              .filter(r => r.status === "claimed")
              .reduce((sum, r) => {
                const points = parseFloat(r.cost) || parseFloat(r.pointCost) || 0;
                return sum + points;
              }, 0);

            setLiveStats({
              total,
              pending,
              successful,
              cancelled: cancelled_,
              rejected,
              successRate: isNaN(successRate) ? 0 : successRate,
              totalPointsRedeemed,
            });
            setIsStatsLoading(false);
          } catch (error) {
            console.error("Error processing live redemption stats:", error);
            setIsStatsLoading(false);
          }
        },
        (error) => {
          if (cancelled) return;
          if (error.code === "permission-denied") {
            console.warn("Redemptions: permission-denied, retrying in 2 s…");
            if (unsubscribe) { unsubscribe(); unsubscribe = null; }
            retryTimer = setTimeout(() => { if (!cancelled) subscribe(); }, 2000);
          } else {
            console.error("Error with live redemption stats listener:", error);
            setIsStatsLoading(false);
          }
        }
      );
    };

    subscribe();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const updateRedemptionStatus = async (redemptionId, newStatus, reason = null) => {
    try {
      const redemptionRef = doc(db, "redemptions", redemptionId);
      await updateDoc(redemptionRef, {
        status: newStatus,
        ...(newStatus === "claimed"   ? { claimedAt:   serverTimestamp() } : {}),
        ...(newStatus === "cancelled" ? { cancelledAt: serverTimestamp() } : {}),
        ...(newStatus === "rejected"  ? { rejectedAt:  serverTimestamp() } : {}),
        ...(newStatus === "rejected" && reason ? { rejectionReason: reason } : {}),
      });
      showToast(`Redemption marked as ${newStatus}`, "success");
    } catch (error) {
      console.error("Failed to update redemption status:", error);
      showToast("Failed to update redemption status", "error");
    }
  };

  const markRedemptionClaimed = async (redemption) => {
    if (!redemption) return;

    try {
      await updateRedemptionStatus(redemption.id, "claimed");

      // REDEMPTION_CLAIMED is an admin confirmation that the physical reward was
      // handed over. No points move at this stage — they were already deducted when
      // the user first redeemed in Rewards.js. Points value is 0.
      // Create point_transaction first so we can link its ID into the ledger block.
      let claimedPtId = null;
      try {
        const ptRef = await addDoc(collection(db, "point_transactions"), {
          userId: redemption.userId,
          type: "redemption_claimed",
          points: 0,
          description: `Reward Claimed – "${redemption.rewardName || "reward"}"`,
          rewardName: redemption.rewardName ?? null,
          rewardId: redemption.rewardId ?? null,
          redemptionId: redemption.id,
          category: "reward",
          timestamp: serverTimestamp(),
        });
        claimedPtId = ptRef.id;
      } catch (txError) {
        console.error("⚠️ Warning: Failed to create claimed transaction record:", txError);
      }

      // No points change here so write order vs updateRedemptionStatus doesn't
      // affect the tamper watcher. Keep ledger write before notification for consistency.
      await addToLedger(
        redemption.userId,
        "REDEMPTION_CLAIMED",
        0,
        {
          redemptionId: redemption.id,
          rewardId: redemption.rewardId ?? null,
          rewardName: redemption.rewardName ?? null,
          ...(claimedPtId ? { firestoreId: claimedPtId } : {}),
        }
      );

      // Use "redemption_confirmed" type so useUserNotifications renders the
      // correct 🎁 success toast.
      await addNotification(
        redemption.userId,
        `Your redemption for "${redemption.rewardName || "reward"}" has been approved and claimed successfully.`,
        "redemption_confirmed",
        {
          title: "Redemption Claimed ✅",
          status: "success",
        }
      );

      showToast(`Redemption marked as claimed successfully`, "success");
    } catch (error) {
      console.error("Failed to mark redemption claimed:", error);
      showToast(error.message || "Failed to claim redemption", "error");
    }
  };

  // ── FIXED: rejectRedemption refunds points AND restores stock ───────────────
  const rejectRedemption = async (redemption, reason) => {
    if (!redemption) return;
    try {
      const refundPoints = redemption.totalCost ?? redemption.cost ?? redemption.pointCost ?? 0;
      const restoreQty = redemption.quantity ?? 1;

      // 1. Create point_transaction record first so we have its ID for the ledger seal.
      let rejectedPtId = null;
      try {
        const ptRef = await addDoc(collection(db, "point_transactions"), {
          userId: redemption.userId,
          type: "points_refunded",
          points: refundPoints, // positive so it shows as a credit
          description: `Reward Rejected – "${redemption.rewardName || "reward"}"`,
          refundNote: "Points Refunded",
          rewardName: redemption.rewardName ?? null,
          rewardId: redemption.rewardId ?? null,
          redemptionId: redemption.id,
          category: "refund",
          timestamp: serverTimestamp(),
          ...(reason ? { rejectionReason: reason } : {}),
        });
        rejectedPtId = ptRef.id;
      } catch (txError) {
        console.error("⚠️ Warning: Failed to create refund transaction record:", txError);
      }

      // 2. Write the ledger block BEFORE the runTransaction that updates totalPoints.
      //    The tamper watcher fires when totalPoints changes. Writing the block first
      //    guarantees the ledger already has the matching REDEMPTION_CANCELLED entry
      //    (which is what the watcher's BALANCE_ACTION_TYPES set counts toward the
      //    ledger sum) before the snapshot arrives.
      await addToLedger(
        redemption.userId,
        "REDEMPTION_CANCELLED",   // ← matches BALANCE_ACTION_TYPES in the watcher
        refundPoints,             // positive = refund credit
        {
          redemptionId: redemption.id,
          rewardId: redemption.rewardId ?? null,
          rewardName: redemption.rewardName ?? null,
          refundedPoints: refundPoints,
          ...(reason ? { reason } : {}),
          ...(rejectedPtId ? { firestoreId: rejectedPtId } : {}),
        }
      );

      // 3. Atomically update redemption status, refund user points, restore stock.
      //    totalPoints changes here — the ledger block is already committed above.
      await runTransaction(db, async (transaction) => {
        const redemptionRef = doc(db, "redemptions", redemption.id);
        const userRef = doc(db, "users", redemption.userId);
        const rewardRef = doc(db, "rewards", redemption.rewardId);

        const redemptionSnap = await transaction.get(redemptionRef);
        const userSnap = await transaction.get(userRef);
        const rewardSnap = await transaction.get(rewardRef);

        if (!redemptionSnap.exists()) throw new Error("Redemption not found.");
        if (!userSnap.exists()) throw new Error("User not found.");

        // Only reject if still pending
        if (redemptionSnap.data().status !== "pending") {
          throw new Error("Only pending redemptions can be rejected.");
        }

        const currentPoints = userSnap.data().totalPoints ?? 0;

        transaction.update(redemptionRef, {
          status: "rejected",
          rejectedAt: serverTimestamp(),
          ...(reason ? { rejectionReason: reason } : {}),
        });

        // Refund the points back to the user
        transaction.update(userRef, {
          totalPoints: currentPoints + refundPoints,
        });

        // Restore the stock back to the reward
        if (rewardSnap.exists()) {
          const currentStock = rewardSnap.data().stock ?? 0;
          transaction.update(rewardRef, { stock: currentStock + restoreQty });
        }
      });

      showToast(`Redemption rejected — ${refundPoints} pts refunded to user`, "success");
    } catch (error) {
      console.error("Failed to reject redemption:", error);
      showToast(error.message || "Failed to reject redemption", "error");
    }
  };


  const getUserEmail = (userId) => {
    const user = users.find((u) => u.id === userId);
    return user ? user.email : "Unknown User";
  };

  const getUserName = (userId) => {
    const user = users.find((u) => u.id === userId);
    if (!user) return "Unknown User";
    return user.displayName || 
           user.name || 
           user.username || 
           user.firstName || 
           user.email?.split('@')[0] || 
           "Unknown User";
  };

  const getRewardName = (rewardId) => {
    const reward = rewards.find((r) => r.id === rewardId);
    return reward ? reward.name : "Unknown Reward";
  };

  const getRewardDetails = (rewardId) => {
    const reward = rewards.find((r) => r.id === rewardId);
    return reward || null;
  };

  const getStatusBadgeStyle = (status) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "claimed":
        return "bg-green-100 text-green-800 border-green-200";
      case "cancelled":
        return "bg-gray-100 text-gray-600 border-gray-300";
      case "rejected":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return "N/A";
    let date;
    if (timestamp.toDate) {
      date = timestamp.toDate();
    } else if (timestamp instanceof Date) {
      date = timestamp;
    } else {
      date = new Date(timestamp);
    }
    const datePart = date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    const timePart = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `${datePart} · ${timePart}`;
  };

  const pendingRedemptions = redemptions.filter(r => r.status === "pending");
  const claimedRedemptions = redemptions.filter(r => r.status === "claimed");
  const cancelledRedemptions = redemptions.filter(r => r.status === "cancelled");
  const rejectedRedemptions = redemptions.filter(r => r.status === "rejected");

  const StatsCard = ({ title, value, bgColor, isLoading, icon, subtitle }) => (
    <div className={`p-6 rounded-xl shadow-lg border transition-all duration-200 hover:shadow-xl ${bgColor}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium mb-2 opacity-90">{title}</div>
          {isLoading ? (
            <div className="animate-pulse">
              <div className="h-8 bg-gray-300 rounded w-16 mb-1"></div>
              {subtitle && <div className="h-4 bg-gray-200 rounded w-12"></div>}
            </div>
          ) : (
            <>
              <div className="text-3xl font-bold mb-1">{value}</div>
              {subtitle && <div className="text-sm opacity-80">{subtitle}</div>}
            </>
          )}
        </div>
        {icon && !isLoading && (
          <div className="text-2xl opacity-60">{icon}</div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h2 className={`text-2xl font-bold ${isDark ? "text-gray-100" : "text-slate-800"}`}>
            Redemption Management
          </h2>
        </div>
        <p className={`${isDark ? "text-gray-400" : "text-slate-600"}`}>
          Manage reward redemption requests from users.
        </p>
      </div>

      {!pendingOnly && (
      <div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <StatsCard
            title="Total Redemptions"
            value={liveStats.total}
            bgColor={isDark ? "bg-gray-800 border-gray-700 text-white" : "bg-white border-gray-200 text-gray-900"}
            isLoading={isStatsLoading}
          />
        </div>
      </div>
      )}

      {pendingOnly && (
        <div className={`flex items-center justify-between px-4 py-2.5 rounded-lg border text-sm font-medium mb-2 ${
          isDark ? "bg-blue-900/30 border-blue-700 text-blue-300" : "bg-blue-50 border-blue-200 text-blue-800"
        }`}>
          <span>⚡ Showing pending redemptions only</span>
          <button
            onClick={onExitPendingOnly}
            className={`text-xs underline font-semibold ${isDark ? "text-blue-400 hover:text-blue-200" : "text-blue-700 hover:text-blue-900"}`}
          >
            Show all
          </button>
        </div>
      )}

      {!pendingOnly && (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div 
          onClick={() => setActiveTab("pending")}
          className={`p-4 rounded-lg border transition-all cursor-pointer hover:shadow-md transform hover:-translate-y-1 ${
            activeTab === "pending" ? (isDark ? "ring-2 ring-yellow-500" : "ring-2 ring-yellow-400") : ""
          } ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-slate-200"}`}
        >
          <div className="text-2xl font-bold text-yellow-600">{pendingRedemptions.length}</div>
          <div className={`text-sm ${isDark ? "text-gray-400" : "text-slate-600"}`}>Needs Action</div>
          <div className={`text-xs mt-1 ${isDark ? "text-gray-500" : "text-slate-500"}`}>Waiting for approval</div>
        </div>
        
        <div 
          onClick={() => setActiveTab("claimed")}
          className={`p-4 rounded-lg border transition-all cursor-pointer hover:shadow-md transform hover:-translate-y-1 ${
            activeTab === "claimed" ? (isDark ? "ring-2 ring-green-500" : "ring-2 ring-green-400") : ""
          } ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-slate-200"}`}
        >
          <div className="text-2xl font-bold text-green-600">{claimedRedemptions.length}</div>
          <div className={`text-sm ${isDark ? "text-gray-400" : "text-slate-600"}`}>Completed</div>
          <div className={`text-xs mt-1 ${isDark ? "text-gray-500" : "text-slate-500"}`}>Successfully processed</div>
        </div>
        
        <div 
          onClick={() => setActiveTab("cancelled")}
          className={`p-4 rounded-lg border transition-all cursor-pointer hover:shadow-md transform hover:-translate-y-1 ${
            activeTab === "cancelled" ? (isDark ? "ring-2 ring-gray-400" : "ring-2 ring-gray-400") : ""
          } ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-slate-200"}`}
        >
          <div className={`text-2xl font-bold ${isDark ? "text-gray-400" : "text-gray-500"}`}>{cancelledRedemptions.length}</div>
          <div className={`text-sm ${isDark ? "text-gray-400" : "text-slate-600"}`}>Cancelled</div>
          <div className={`text-xs mt-1 ${isDark ? "text-gray-500" : "text-slate-500"}`}>Withdrawn by user</div>
        </div>

        <div 
          onClick={() => setActiveTab("rejected")}
          className={`p-4 rounded-lg border transition-all cursor-pointer hover:shadow-md transform hover:-translate-y-1 ${
            activeTab === "rejected" ? (isDark ? "ring-2 ring-red-500" : "ring-2 ring-red-400") : ""
          } ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-slate-200"}`}
        >
          <div className="text-2xl font-bold text-red-600">{rejectedRedemptions.length}</div>
          <div className={`text-sm ${isDark ? "text-gray-400" : "text-slate-600"}`}>Rejected</div>
          <div className={`text-xs mt-1 ${isDark ? "text-gray-500" : "text-slate-500"}`}>Declined by admin</div>
        </div>
      </div>
      )}

      {!pendingOnly && (
      <div className={`flex space-x-6 border-b ${isDark ? "border-gray-700" : "border-slate-200"} mb-6`}>
        <button
          onClick={() => setActiveTab("pending")}
          className={`pb-3 text-sm font-medium transition-colors relative ${
            activeTab === "pending"
              ? (isDark ? "text-blue-400" : "text-blue-600")
              : (isDark ? "text-gray-400 hover:text-gray-200" : "text-slate-500 hover:text-slate-800")
          }`}
        >
          Pending
          {activeTab === "pending" && (
            <span className={`absolute bottom-0 left-0 w-full h-0.5 ${isDark ? "bg-blue-400" : "bg-blue-600"}`}></span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("claimed")}
          className={`pb-3 text-sm font-medium transition-colors relative ${
            activeTab === "claimed"
              ? (isDark ? "text-green-400" : "text-green-600")
              : (isDark ? "text-gray-400 hover:text-gray-200" : "text-slate-500 hover:text-slate-800")
          }`}
        >
          Completed
          {activeTab === "claimed" && (
            <span className={`absolute bottom-0 left-0 w-full h-0.5 ${isDark ? "bg-green-400" : "bg-green-600"}`}></span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("cancelled")}
          className={`pb-3 text-sm font-medium transition-colors relative ${
            activeTab === "cancelled"
              ? (isDark ? "text-gray-300" : "text-gray-600")
              : (isDark ? "text-gray-400 hover:text-gray-200" : "text-slate-500 hover:text-slate-800")
          }`}
        >
          Cancelled
          {cancelledRedemptions.length > 0 && (
            <span className={`ml-1.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
              isDark ? "bg-gray-700 text-gray-300" : "bg-gray-200 text-gray-600"
            }`}>{cancelledRedemptions.length}</span>
          )}
          {activeTab === "cancelled" && (
            <span className={`absolute bottom-0 left-0 w-full h-0.5 ${isDark ? "bg-gray-400" : "bg-gray-500"}`}></span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("rejected")}
          className={`pb-3 text-sm font-medium transition-colors relative ${
            activeTab === "rejected"
              ? (isDark ? "text-red-400" : "text-red-600")
              : (isDark ? "text-gray-400 hover:text-gray-200" : "text-slate-500 hover:text-slate-800")
          }`}
        >
          Rejected
          {rejectedRedemptions.length > 0 && (
            <span className={`ml-1.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
              activeTab === "rejected"
                ? (isDark ? "bg-red-900/40 text-red-300" : "bg-red-100 text-red-700")
                : (isDark ? "bg-gray-700 text-gray-300" : "bg-gray-200 text-gray-600")
            }`}>{rejectedRedemptions.length}</span>
          )}
          {activeTab === "rejected" && (
            <span className={`absolute bottom-0 left-0 w-full h-0.5 ${isDark ? "bg-red-400" : "bg-red-600"}`}></span>
          )}
        </button>
      </div>
      )}

      {activeTab === "pending" && (
        pendingRedemptions.length === 0 ? (
          <div className="text-center py-12">
            <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${
              isDark ? "bg-gray-700" : "bg-slate-100"
            }`}>
              <span className="text-2xl">🎫</span>
            </div>
            <h3 className={`text-lg font-medium mb-2 ${isDark ? "text-gray-200" : "text-slate-900"}`}>
              All caught up!
            </h3>
            <p className={`${isDark ? "text-gray-400" : "text-slate-500"}`}>
              No pending redemption requests to process.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-3">
              {pendingRedemptions.map((redemption) => {
                const reward = getRewardDetails(redemption.rewardId);
                return (
                  <div
                    key={redemption.id}
                    className={`p-4 rounded-lg border-l-4 border-l-yellow-400 transition-all hover:shadow-md ${
                      isDark ? "bg-gray-800 border border-gray-700" : "bg-white border border-slate-200"
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex flex-col sm:flex-row justify-between items-start">
                        <div className="flex-1 w-full">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className={`font-medium uppercase tracking-wider text-xs ${
                                isDark ? "text-gray-400" : "text-slate-500"
                              }`}>
                                User
                              </span>
                              <div className={`text-sm mt-1 ${isDark ? "text-gray-300" : "text-slate-900"}`}>
                                {getUserName(redemption.userId)}
                              </div>
                              <div className={`text-xs ${isDark ? "text-gray-500" : "text-slate-500"}`}>
                                {getUserEmail(redemption.userId)}
                              </div>
                            </div>
                            <div>
                              <span className={`font-medium uppercase tracking-wider text-xs ${
                                isDark ? "text-gray-400" : "text-slate-500"
                              }`}>
                                Reward
                              </span>
                              <div className={`flex items-center gap-2 text-sm mt-1 ${isDark ? "text-gray-300" : "text-slate-900"}`}>
                                {getRewardName(redemption.rewardId)}
                                {redemption.quantity > 1 && (
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                                    isDark ? "bg-indigo-900/50 text-indigo-300 border border-indigo-700" : "bg-indigo-100 text-indigo-700 border border-indigo-200"
                                  }`}>
                                    Qty: {redemption.quantity}
                                  </span>
                                )}
                              </div>
                              {reward && (
                                <div className={`text-xs ${isDark ? "text-gray-500" : "text-slate-500"}`}>
                                  {redemption.quantity > 1 ? `${redemption.totalCost ?? (reward.cost * redemption.quantity)} pts total (${reward.cost} × ${redemption.quantity})` : `${reward.cost} points`} • {reward.category}
                                </div>
                              )}
                            </div>
                            <div className="sm:col-span-2 grid grid-cols-2 gap-4">
                              <div>
                                <span className={`font-medium uppercase tracking-wider text-xs ${
                                  isDark ? "text-gray-400" : "text-slate-500"
                                }`}>
                                  Redemption Code
                                </span>
                                <div className={`text-sm font-mono mt-1 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                                  {redemption.redemptionCode}
                                </div>
                              </div>
                              <div>
                                <span className={`font-medium uppercase tracking-wider text-xs ${
                                  isDark ? "text-gray-400" : "text-slate-500"
                                }`}>
                                  Timeline
                                </span>
                                <div className="mt-1 space-y-1">
                                  {redemption.redeemedAt && (
                                    <div className={`flex items-center gap-1.5 text-xs ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                                      <span className="font-medium">Requested:</span>
                                      {formatDate(redemption.redeemedAt)}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex-shrink-0 mt-3 sm:mt-0 sm:ml-4">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${
                            getStatusBadgeStyle(redemption.status)
                          }`}>
                            {redemption.status}
                          </span>
                        </div>
                      </div>
                      
                      {/* Refund notice */}
                      <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${
                        isDark ? "bg-amber-900/20 border-amber-700/50 text-amber-300" : "bg-amber-50 border-amber-200 text-amber-700"
                      }`}>
                        <span>💡</span>
                        <span>Rejecting will automatically refund <strong>{redemption.totalCost ?? redemption.cost ?? redemption.pointCost ?? 0} points</strong> to the user.</span>
                      </div>

                      <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 pt-3 border-t border-gray-200 dark:border-gray-600">
                        <button
                          onClick={() => markRedemptionClaimed(redemption)}
                          className="flex-1 px-4 py-2.5 text-white bg-gradient-to-r from-green-600 to-green-700 rounded-lg hover:from-green-700 hover:to-green-800 text-sm font-medium transition-all duration-200 flex items-center justify-center space-x-2 shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
                        >
                          <span>✅ Mark Claimed</span>
                        </button>
                        <button
                          onClick={() => setRejectModal({ open: true, redemption })}
                          className="flex-1 px-4 py-2.5 text-white bg-gradient-to-r from-red-600 to-red-700 rounded-lg hover:from-red-700 hover:to-red-800 text-sm font-medium transition-all duration-200 flex items-center justify-center space-x-2 shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
                        >
                          <span>❌ Reject + Refund</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )
      )}

      {(activeTab === "claimed" || activeTab === "cancelled") && !pendingOnly && (
        (activeTab === "claimed" ? claimedRedemptions : cancelledRedemptions).length === 0 ? (
          <div className="text-center py-8">
            <div className={`w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center ${
              isDark ? "bg-gray-700" : "bg-slate-100"
            }`}>
              <span className="text-lg">⏳</span>
            </div>
            <p className={`${isDark ? "text-gray-400" : "text-slate-500"}`}>
              No {activeTab} redemptions yet.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {(activeTab === "claimed" ? claimedRedemptions : cancelledRedemptions).map((redemption) => {
              const reward = getRewardDetails(redemption.rewardId);
              return (
                <div
                  key={redemption.id}
                  className={`p-4 rounded-lg transition-all hover:shadow-md ${
                    isDark ? "bg-gray-800 border border-gray-700" : "bg-white border border-slate-200"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row justify-between items-start">
                    <div className="flex-1 w-full">
                      <div className="space-y-3 sm:space-y-0 sm:grid sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className={`font-medium uppercase tracking-wider text-xs ${
                            isDark ? "text-gray-400" : "text-slate-500"
                          }`}>
                            User
                          </span>
                          <div className={`text-sm mt-1 ${isDark ? "text-gray-300" : "text-slate-900"}`}>
                            {getUserName(redemption.userId)}
                          </div>
                          <div className={`text-xs ${isDark ? "text-gray-500" : "text-slate-500"}`}>
                            {getUserEmail(redemption.userId)}
                          </div>
                        </div>
                        <div>
                          <span className={`font-medium uppercase tracking-wider text-xs ${
                            isDark ? "text-gray-400" : "text-slate-500"
                          }`}>
                            Reward
                          </span>
                          <div className={`flex items-center gap-2 text-sm mt-1 ${isDark ? "text-gray-300" : "text-slate-900"}`}>
                            {getRewardName(redemption.rewardId)}
                            {redemption.quantity > 1 && (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                                isDark ? "bg-indigo-900/50 text-indigo-300 border border-indigo-700" : "bg-indigo-100 text-indigo-700 border border-indigo-200"
                              }`}>
                                Qty: {redemption.quantity}
                              </span>
                            )}
                          </div>
                          {reward && (
                            <div className={`text-xs ${isDark ? "text-gray-500" : "text-slate-500"}`}>
                              {redemption.quantity > 1 ? `${redemption.totalCost ?? (reward.cost * redemption.quantity)} pts total (${reward.cost} × ${redemption.quantity})` : `${reward.cost} points`} • {reward.category}
                            </div>
                          )}
                        </div>
                        <div>
                          <span className={`font-medium uppercase tracking-wider text-xs ${
                            isDark ? "text-gray-400" : "text-slate-500"
                          }`}>
                            Code
                          </span>
                          <div className={`text-sm font-mono mt-1 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                            {redemption.redemptionCode}
                          </div>
                        </div>
                        <div>
                          <span className={`font-medium uppercase tracking-wider text-xs ${
                            isDark ? "text-gray-400" : "text-slate-500"
                          }`}>
                            Timeline
                          </span>
                          <div className={`mt-1 space-y-1`}>
                            {redemption.redeemedAt && (
                              <div className={`flex items-center gap-1.5 text-xs ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                                <span className="font-medium">Requested:</span>
                                {formatDate(redemption.redeemedAt)}
                              </div>
                            )}
                            {redemption.claimedAt && (
                              <div className={`flex items-center gap-1.5 text-xs ${isDark ? "text-green-400" : "text-green-600"}`}>
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                                <span className="font-medium">Claimed:</span>
                                {formatDate(redemption.claimedAt)}
                              </div>
                            )}
                            {redemption.cancelledAt && (
                              <div className={`flex items-center gap-1.5 text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0" />
                                <span className="font-medium">Cancelled:</span>
                                {formatDate(redemption.cancelledAt)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex-shrink-0 mt-3 sm:mt-0 sm:ml-4 flex flex-col items-end gap-2">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${
                        getStatusBadgeStyle(redemption.status)
                      }`}>
                        {redemption.status}
                      </span>
                      {redemption.status === "cancelled" && (
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                          isDark ? "bg-green-900/30 text-green-400" : "bg-green-50 text-green-700"
                        }`}>
                          ↩ Points refunded
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {activeTab === "rejected" && !pendingOnly && (
        rejectedRedemptions.length === 0 ? (
          <div className="text-center py-8">
            <div className={`w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center ${
              isDark ? "bg-gray-700" : "bg-slate-100"
            }`}>
              <span className="text-lg">🚫</span>
            </div>
            <p className={`${isDark ? "text-gray-400" : "text-slate-500"}`}>
              No rejected redemptions yet.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {rejectedRedemptions.map((redemption) => {
              const reward = getRewardDetails(redemption.rewardId);
              return (
                <div
                  key={redemption.id}
                  className={`p-4 rounded-lg border-l-4 border-l-red-500 transition-all hover:shadow-md ${
                    isDark ? "bg-gray-800 border border-gray-700" : "bg-white border border-slate-200"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row justify-between items-start">
                    <div className="flex-1 w-full">
                      <div className="space-y-3 sm:space-y-0 sm:grid sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className={`font-medium uppercase tracking-wider text-xs ${isDark ? "text-gray-400" : "text-slate-500"}`}>User</span>
                          <div className={`text-sm mt-1 ${isDark ? "text-gray-300" : "text-slate-900"}`}>{getUserName(redemption.userId)}</div>
                          <div className={`text-xs ${isDark ? "text-gray-500" : "text-slate-500"}`}>{getUserEmail(redemption.userId)}</div>
                        </div>
                        <div>
                          <span className={`font-medium uppercase tracking-wider text-xs ${isDark ? "text-gray-400" : "text-slate-500"}`}>Reward</span>
                          <div className={`flex items-center gap-2 text-sm mt-1 ${isDark ? "text-gray-300" : "text-slate-900"}`}>
                            {getRewardName(redemption.rewardId)}
                            {redemption.quantity > 1 && (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                                isDark ? "bg-indigo-900/50 text-indigo-300 border border-indigo-700" : "bg-indigo-100 text-indigo-700 border border-indigo-200"
                              }`}>
                                Qty: {redemption.quantity}
                              </span>
                            )}
                          </div>
                          {reward && (
                            <div className={`text-xs ${isDark ? "text-gray-500" : "text-slate-500"}`}>{redemption.quantity > 1 ? `${redemption.totalCost ?? (reward.cost * redemption.quantity)} pts total (${reward.cost} × ${redemption.quantity})` : `${reward.cost} points`} • {reward.category}</div>
                          )}
                        </div>
                        <div>
                          <span className={`font-medium uppercase tracking-wider text-xs ${isDark ? "text-gray-400" : "text-slate-500"}`}>Code</span>
                          <div className={`text-sm font-mono mt-1 ${isDark ? "text-gray-400" : "text-gray-600"}`}>{redemption.redemptionCode}</div>
                        </div>
                        <div>
                          <span className={`font-medium uppercase tracking-wider text-xs ${isDark ? "text-gray-400" : "text-slate-500"}`}>Timeline</span>
                          <div className="mt-1 space-y-1">
                            {redemption.redeemedAt && (
                              <div className={`flex items-center gap-1.5 text-xs ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                                <span className="font-medium">Requested:</span>
                                {formatDate(redemption.redeemedAt)}
                              </div>
                            )}
                            {redemption.rejectedAt && (
                              <div className={`flex items-center gap-1.5 text-xs ${isDark ? "text-red-400" : "text-red-600"}`}>
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                                <span className="font-medium">Rejected:</span>
                                {formatDate(redemption.rejectedAt)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex-shrink-0 mt-3 sm:mt-0 sm:ml-4 flex flex-col items-end gap-2">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${getStatusBadgeStyle(redemption.status)}`}>
                        {redemption.status}
                      </span>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                        isDark ? "bg-green-900/30 text-green-400" : "bg-green-50 text-green-700"
                      }`}>
                        ↩ Points refunded
                      </span>
                    </div>
                  </div>
                  {(redemption.rejectionReason || redemption.reason) && (
                    <div className={`mt-3 flex items-start gap-2 px-3 py-2.5 rounded-xl border text-sm ${
                      isDark ? "bg-red-900/20 border-red-800/50 text-red-300" : "bg-red-50 border-red-200 text-red-700"
                    }`}>
                      <span className="flex-shrink-0 mt-0.5">⚠️</span>
                      <span>
                        <span className="font-semibold">Rejection reason: </span>
                        {redemption.rejectionReason || redemption.reason}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      <RejectRedemptionModal
        isOpen={rejectModal.open}
        onClose={() => setRejectModal({ open: false, redemption: null })}
        onConfirm={(reason) => {
          rejectRedemption(rejectModal.redemption, reason);
          setRejectModal({ open: false, redemption: null });
        }}
        isDark={isDark}
      />
    </div>
  );
};

export default RedemptionsTab;