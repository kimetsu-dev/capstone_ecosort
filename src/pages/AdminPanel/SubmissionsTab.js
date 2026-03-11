import React, { useEffect, useState } from "react";
import { 
  doc, 
  updateDoc, 
  serverTimestamp, 
  runTransaction, 
  addDoc, 
  collection, 
  onSnapshot
} from "firebase/firestore";
import { db, auth } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { addToLedger } from "../../utils/ledgerService";
import { Layers, ChevronDown, ChevronUp, Package, MapPin, ShieldCheck } from "lucide-react";

// ── Preset rejection reasons for submissions ──────────────────────────────────
const SUBMISSION_REJECT_REASONS = [
  "Weight entered does not match what was weighed on-site",
  "Wrong waste category selected",
  "Waste type or amount is inaccurate based on staff inspection",
  "Duplicate submission detected",
  "Submission details are incomplete or incorrect",
];

// ── Reject-with-Reason Modal ──────────────────────────────────────────────────
function RejectSubmissionModal({ isOpen, onClose, onConfirm, isDark }) {
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
            <h3 className={`font-bold text-base ${isDark ? "text-white" : "text-gray-900"}`}>Reject Submission</h3>
          </div>
          <button onClick={handleClose} className={`p-1.5 rounded-lg transition-colors ${isDark ? "hover:bg-gray-700 text-gray-400" : "hover:bg-gray-200 text-gray-500"}`}>✕</button>
        </div>
        <div className="p-6 space-y-4">
          <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>
            Select a reason for rejection. This will be included in the user's notification.
          </p>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {SUBMISSION_REJECT_REASONS.map((r) => (
              <label key={r} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                selected === r
                  ? (isDark ? "border-red-500 bg-red-900/20" : "border-red-400 bg-red-50")
                  : (isDark ? "border-gray-700 hover:border-gray-600" : "border-gray-200 hover:border-gray-300")
              }`}>
                <input type="radio" name="submission-reject-reason" value={r} checked={selected === r} onChange={() => setSelected(r)} className="mt-0.5 accent-red-500" />
                <span className={`text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>{r}</span>
              </label>
            ))}
            <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
              selected === "__custom__"
                ? (isDark ? "border-red-500 bg-red-900/20" : "border-red-400 bg-red-50")
                : (isDark ? "border-gray-700 hover:border-gray-600" : "border-gray-200 hover:border-gray-300")
            }`}>
              <input type="radio" name="submission-reject-reason" value="__custom__" checked={selected === "__custom__"} onChange={() => setSelected("__custom__")} className="mt-0.5 accent-red-500" />
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



// Helper function to add notifications
// extras: { title, reason, status } — all optional
async function addNotification(userId, message, type = "submission_status", extras = {}) {
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

// Helper function to create point transactions
async function createPointTransaction({ userId, points, description, type = "points_awarded" }) {
  try {
    await addDoc(collection(db, "point_transactions"), {
      userId,
      points,
      description,
      timestamp: serverTimestamp(),
      type,
    });
  } catch (error) {
    console.error("Failed to create point transaction:", error);
  }
}

// ── Cancelled submissions section shown in pendingOnly mode ──────────────────
// This ensures admins can always see user-cancelled submissions even when the
// dashboard quick-link locks the view to pending submissions only.
function CancelledInPendingOnlySection({ cancelledSubmissions, isDark, getUserInfo, isMixedBundle, formatDate }) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className={`mt-4 rounded-xl border overflow-hidden ${
      isDark ? "border-gray-700 bg-gray-800/50" : "border-gray-200 bg-gray-50"
    }`}>
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(prev => !prev)}
        className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
          isDark ? "hover:bg-gray-700/60" : "hover:bg-gray-100"
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="text-base">🚫</span>
          <span className={`text-sm font-semibold ${isDark ? "text-gray-300" : "text-gray-700"}`}>
            User-Cancelled Submissions
          </span>
          <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${
            isDark ? "bg-gray-700 text-gray-300" : "bg-gray-200 text-gray-600"
          }`}>
            {cancelledSubmissions.length}
          </span>
        </div>
        <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${
          isDark ? "text-gray-400" : "text-gray-500"
        } ${expanded ? "rotate-180" : ""}`} />
      </button>

      {/* Collapsed body */}
      {expanded && (
        <div className={`divide-y ${isDark ? "divide-gray-700" : "divide-gray-200"}`}>
          {cancelledSubmissions.map((submission) => {
            const userInfo = getUserInfo(submission.userId);
            const isBundle = isMixedBundle(submission);
            const displayWeight = isBundle
              ? (submission.totalWeight ?? submission.items?.reduce((s, i) => s + (i.weight || 0), 0) ?? 0)
              : (submission.weight ?? 0);

            return (
              <div key={submission.id} className={`px-4 py-3 ${isDark ? "bg-gray-800/30" : "bg-white"}`}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {/* User */}
                    <div className={`text-sm font-medium truncate ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                      {userInfo.name}
                      <span className={`ml-2 text-xs font-normal ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                        {userInfo.email}
                      </span>
                    </div>
                    {/* Waste type + weight */}
                    <div className={`text-xs mt-0.5 flex items-center gap-2 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                      {isBundle ? (
                        <span className="inline-flex items-center gap-1">
                          <Layers className="w-3 h-3" />
                          Mixed Bundle · {Number(displayWeight).toFixed(2)} kg
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <Package className="w-3 h-3" />
                          {submission.type} · {Number(displayWeight).toFixed(2)} kg
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Timestamps */}
                  <div className={`text-xs flex-shrink-0 text-right space-y-0.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                    <div><span className="font-medium">Submitted:</span> {formatDate(submission.submittedAt)}</div>
                    {submission.cancelledAt && (
                      <div><span className="font-medium">Cancelled:</span> {formatDate(submission.cancelledAt)}</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const SubmissionsTab = ({ 
  pendingSubmissions, 
  setPendingSubmissions, 
  pointsPerKiloMap, 
  users, 
  loading, 
  setLoading, 
  showToast, 
  isDark,
  pendingOnly = false,
  onExitPendingOnly
}) => {
  const [currentUserId, setCurrentUserId] = useState(null);
  const [liveStats, setLiveStats] = useState({ 
    total: 0, 
    successful: 0, 
    rejected: 0, 
    pending: 0,
    cancelled: 0,
    successRate: 0,
    totalPointsAwarded: 0
  });
  const [isStatsLoading, setIsStatsLoading] = useState(true);
  const [allSubmissions, setAllSubmissions] = useState([]);
  
  // New state for tab navigation
  const [activeTab, setActiveTab] = useState("pending"); // "pending", "confirmed", "rejected", "cancelled"
  
  // Lock to pending tab when opened from dashboard
  useEffect(() => {
    if (pendingOnly) setActiveTab("pending");
  }, [pendingOnly]);
  
  // State to track expanded items in the history view
  const [expandedBundles, setExpandedBundles] = useState({});
  // State for reject-with-reason modal
  const [rejectModal, setRejectModal] = useState({ open: false, submissionId: null, userId: null });

  const toggleBundle = (id) => {
    setExpandedBundles(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // 1. Listen for Auth State Resolution
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setCurrentUserId(u ? u.uid : null);
    });
    return () => unsub();
  }, []);

  // 2. Real-time stats listener — waits for auth, depends on currentUserId
  useEffect(() => {
    if (!currentUserId) return; // Wait for Firebase to confirm the user

    const toMs = (ts) => {
      if (!ts) return 0;
      if (typeof ts.toMillis === "function") return ts.toMillis();
      if (typeof ts.seconds === "number") return ts.seconds * 1000;
      return 0;
    };

    const unsubscribe = onSnapshot(
      collection(db, "waste_submissions"),
      (snapshot) => {
        const submissions = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => toMs(b.submittedAt) - toMs(a.submittedAt));

        const total      = submissions.length;
        const successful = submissions.filter(s => s.status === "confirmed").length;
        const rejected   = submissions.filter(s => s.status === "rejected").length;
        const pending    = submissions.filter(s => s.status === "pending").length;
        const cancelled  = submissions.filter(s => s.status === "cancelled").length;
        const successRate = (successful + rejected) > 0
          ? (successful / (successful + rejected)) * 100
          : 0;
        const totalPointsAwarded = submissions
          .filter(s => s.status === "confirmed")
          .reduce((sum, s) => sum + (parseFloat(s.points) || 0), 0);

        setLiveStats({ total, successful, rejected, pending, cancelled,
          successRate: isNaN(successRate) ? 0 : successRate,
          totalPointsAwarded });
        setAllSubmissions(submissions);
        setIsStatsLoading(false);
      },
      (error) => {
        console.error("Submissions listener error:", error);
        setIsStatsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUserId]);

  const getUserInfo = (userId) => {
    const user = users.find((u) => u.id === userId);
    if (!user) return { name: "Unknown User", email: "N/A", uniqueId: userId?.slice(0, 8) || "N/A" };
    
    const name = user.displayName || user.name || user.username || user.firstName || "Unknown User";
    const email = user.email || "No email";
    const uniqueId = userId.slice(0, 8); 
    
    return { name, email, uniqueId };
  };

  const rejectSubmission = async (submissionId, userId, reason) => {
    setLoading(true);
    try {
      const submissionRef = doc(db, "waste_submissions", submissionId);
      await updateDoc(submissionRef, {
        status: "rejected",
        rejectedAt: serverTimestamp(),
        ...(reason ? { rejectionReason: reason } : {}),
      });

      const message = reason
        ? `Your waste submission has been rejected. Reason: ${reason}`
        : "Your waste submission has been rejected. Please review the guidelines and try again.";

      await addNotification(
        userId,
        message,
        "submission_status",
        {
          title: "Submission Rejected",
          status: "rejected",
          ...(reason ? { reason } : {}),
        }
      );

      // ⛓️ Record the admin rejection on the immutable ledger
      await addToLedger(
        userId,
        "SUBMISSION_REJECTED",
        0,
        { submissionId, ...(reason ? { reason } : {}) }
      );

      setPendingSubmissions((prev) => prev.filter((sub) => sub.id !== submissionId));
      showToast("Submission rejected", "success");
    } catch (error) {
      console.error("Error rejecting submission:", error);
      showToast("Failed to reject submission", "error");
    } finally {
      setLoading(false);
    }
  };

  const confirmSubmission = async (submission) => {
    setLoading(true);
    try {
      const isMixedBundle = submission.items && Array.isArray(submission.items) && submission.items.length > 1;
      let awardedPoints = 0;

      if (isMixedBundle) {
        awardedPoints = parseFloat(submission.points) || 0;
      } else {
        const pointsPerKiloForType = pointsPerKiloMap[submission.type] ?? 0;
        awardedPoints = Number(submission.weight * pointsPerKiloForType) || 0;
      }

      const userRef = doc(db, "users", submission.userId);

      await createPointTransaction({
        userId: submission.userId,
        points: awardedPoints,
        description: `Awarded points for ${isMixedBundle ? 'mixed bundle' : submission.type} submission (ID: ${submission.id.slice(0,6)})`,
        type: "points_awarded",
      });

      await runTransaction(db, async (transaction) => {
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists()) throw new Error("User does not exist");
        const currentPoints = Number(userSnap.data().totalPoints) || 0;
        const updatedPoints = currentPoints + awardedPoints;
        if (updatedPoints < 0) throw new Error("User points cannot be negative");
        transaction.update(userRef, { totalPoints: updatedPoints });
      });

      const submissionRef = doc(db, "waste_submissions", submission.id);
      await updateDoc(submissionRef, {
        status: "confirmed",
        points: awardedPoints,
        confirmedAt: serverTimestamp(),
      });

      await addNotification(
        submission.userId,
        `Your ${isMixedBundle ? 'mixed bundle' : 'waste'} submission has been confirmed! You earned ${awardedPoints.toFixed(2)} points.`
      );

      // ⛓️ Record the points award on the immutable ledger
      await addToLedger(
        submission.userId,
        "SUBMISSION_CONFIRMED",
        awardedPoints,
        {
          submissionId: submission.id,
          type: isMixedBundle ? "mixed_bundle" : submission.type,
          weight: submission.weight ?? null,
        }
      );

      setPendingSubmissions((prev) => prev.filter((sub) => sub.id !== submission.id));
      showToast("Submission confirmed and points awarded!", "success");
    } catch (error) {
      console.error("Error confirming submission:", error);
      showToast("Failed to confirm submission", "error");
    } finally {
      setLoading(false);
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
    return date.toLocaleString();
  };

  const isMixedBundle = (submission) => {
    return submission.items && Array.isArray(submission.items) && submission.items.length > 1;
  };

  const WasteDetailsRenderer = ({ submission, compact = false, showExpanded = false }) => {
    const isBundle = isMixedBundle(submission);
    const isExpanded = expandedBundles[submission.id];
    
    if (isBundle) {
      return (
        <div>
          <div className={`text-sm mt-1 font-bold flex items-center gap-2 ${isDark ? "text-green-400" : "text-green-600"}`}>
            <Layers className="w-4 h-4" />
            Mixed Bundle ({submission.items.length} items)
          </div>
          <div className={`text-xs mt-1 ${isDark ? "text-gray-400" : "text-slate-600"}`}>
            Total Weight: {(submission.totalWeight || submission.weight || 0).toFixed(2)} kg
          </div>
          
          {showExpanded ? (
            <>
              <button
                onClick={() => toggleBundle(submission.id)}
                className={`mt-2 text-xs flex items-center gap-1 ${isDark ? "text-blue-400 hover:text-blue-300" : "text-blue-600 hover:text-blue-700"}`}
              >
                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {isExpanded ? "Hide items" : "Show items"}
              </button>
              
              {isExpanded && (
                <div className={`mt-2 p-2 rounded-md ${isDark ? "bg-gray-900/50" : "bg-slate-100"} animate-slide-down`}>
                  {submission.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-xs mb-1 last:mb-0">
                      <span className={`${isDark ? "text-gray-300" : "text-slate-700"}`}>
                        • {item.wasteType}
                      </span>
                      <span className={`font-mono ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                        {item.weight}kg ({item.points || 0} pts)
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className={`mt-2 p-2 rounded-md ${isDark ? "bg-gray-900/50" : "bg-slate-50"}`}>
              {submission.items.map((item, idx) => (
                <div key={idx} className="flex justify-between text-xs mb-1 last:mb-0">
                  <span className={`${isDark ? "text-gray-400" : "text-slate-600"}`}>
                    • {item.wasteType}
                  </span>
                  <span className={`font-mono ${isDark ? "text-gray-500" : "text-slate-500"}`}>
                    {item.weight}kg
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    return (
      <div>
        <div className={`text-sm mt-1 font-bold flex items-center gap-2 ${isDark ? "text-blue-400" : "text-blue-600"}`}>
          <Package className="w-4 h-4" />
          {submission.type}
        </div>
        <div className={`text-xs ${isDark ? "text-gray-400" : "text-slate-600"}`}>
          Weight: {(submission.weight || 0).toFixed(2)} kg
        </div>
        {!compact && (
          <div className={`text-xs ${isDark ? "text-gray-500" : "text-slate-500"}`}>
            Rate: {pointsPerKiloMap[submission.type] ?? 0} pts/kg
          </div>
        )}
      </div>
    );
  };

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

  // ── Derive all tab data from the real-time allSubmissions listener ──
  // This ensures all tabs stay in sync when admin confirms/rejects/cancels.
  // livePending is the source of truth for the pending tab (replaces the prop).
  const livePendingSubmissions = allSubmissions.filter(s => s.status === "pending");
  const confirmedSubmissions   = allSubmissions.filter(s => s.status === "confirmed");
  const rejectedSubmissions    = allSubmissions.filter(s => s.status === "rejected");
  const cancelledSubmissions   = allSubmissions.filter(s => s.status === "cancelled");

  // Keep parent prop in sync with live data so dashboard counts stay accurate
  useEffect(() => {
    if (allSubmissions.length > 0 && setPendingSubmissions) {
      setPendingSubmissions(livePendingSubmissions);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSubmissions]);

  const getStatusBadgeStyle = (status) => {
    switch (status) {
      case "confirmed":
        return "bg-green-100 text-green-800 border-green-200";
      case "rejected":
        return "bg-red-100 text-red-800 border-red-200";
      case "cancelled":
        return "bg-gray-100 text-gray-600 border-gray-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h2 className={`text-2xl font-bold ${isDark ? "text-gray-100" : "text-slate-800"}`}>
            Submission Management
          </h2>
        </div>
        <p className={`${isDark ? "text-gray-400" : "text-slate-600"}`}>
          Review and confirm walk-in waste submissions. All submissions are made in person at the Barangay Hall and must be physically verified before approval.
        </p>

        {/* Walk-in reminder for admins */}
        <div className={`mt-3 flex items-start gap-2 px-4 py-3 rounded-xl border text-sm ${
          isDark ? "bg-amber-900/20 border-amber-700/50 text-amber-300" : "bg-amber-50 border-amber-200 text-amber-800"
        }`}>
          <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            <strong>Reminder:</strong> Only confirm submissions where the user was physically present and the waste was weighed and inspected on-site by a staff member.
          </span>
        </div>
      </div>

      {/* Live Stats Dashboard */}
      {!pendingOnly && (
      <div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <StatsCard
            title="Total Submissions"
            value={liveStats.total}
            bgColor={isDark ? "bg-gray-800 border-gray-700 text-white" : "bg-white border-gray-200 text-gray-900"}
            isLoading={isStatsLoading}
          />
          <StatsCard
            title="Eco Points Awarded"
            value={liveStats.totalPointsAwarded.toLocaleString()}
            bgColor={isDark ? "bg-purple-900 border-purple-700 text-purple-200" : "bg-purple-50 border-purple-200 text-purple-900"}
            isLoading={isStatsLoading}
            subtitle="Total confirmed"
          />
        </div>
      </div>
      )}

      {/* pendingOnly banner */}
      {pendingOnly && (
        <div className={`flex items-center justify-between px-4 py-2.5 rounded-lg border text-sm font-medium mb-2 ${
          isDark ? "bg-amber-900/30 border-amber-700 text-amber-300" : "bg-amber-50 border-amber-200 text-amber-800"
        }`}>
          <span>⚡ Showing pending submissions only</span>
          <button
            onClick={onExitPendingOnly}
            className={`text-xs underline font-semibold ${isDark ? "text-amber-400 hover:text-amber-200" : "text-amber-700 hover:text-amber-900"}`}
          >
            Show all
          </button>
        </div>
      )}

      {/* Quick Status Overview (Clickable to switch tabs) */}
      {!pendingOnly && (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div 
          onClick={() => setActiveTab("pending")}
          className={`p-4 rounded-lg border transition-all cursor-pointer hover:shadow-md transform hover:-translate-y-1 ${
            activeTab === "pending" ? (isDark ? "ring-2 ring-yellow-500" : "ring-2 ring-yellow-400") : ""
          } ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-slate-200"}`}
        >
          <div className="text-2xl font-bold text-yellow-600">{livePendingSubmissions.length}</div>
          <div className={`text-sm ${isDark ? "text-gray-400" : "text-slate-600"}`}>Needs Review</div>
          <div className={`text-xs mt-1 ${isDark ? "text-gray-500" : "text-slate-500"}`}>Waiting for approval</div>
        </div>
        
        <div 
          onClick={() => setActiveTab("confirmed")}
          className={`p-4 rounded-lg border transition-all cursor-pointer hover:shadow-md transform hover:-translate-y-1 ${
            activeTab === "confirmed" ? (isDark ? "ring-2 ring-green-500" : "ring-2 ring-green-400") : ""
          } ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-slate-200"}`}
        >
          <div className="text-2xl font-bold text-green-600">{liveStats.successful}</div>
          <div className={`text-sm ${isDark ? "text-gray-400" : "text-slate-600"}`}>Confirmed</div>
          <div className={`text-xs mt-1 ${isDark ? "text-gray-500" : "text-slate-500"}`}>Successfully processed</div>
        </div>
        
        <div 
          onClick={() => setActiveTab("rejected")}
          className={`p-4 rounded-lg border transition-all cursor-pointer hover:shadow-md transform hover:-translate-y-1 ${
            activeTab === "rejected" ? (isDark ? "ring-2 ring-red-500" : "ring-2 ring-red-400") : ""
          } ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-slate-200"}`}
        >
          <div className="text-2xl font-bold text-red-600">{liveStats.rejected}</div>
          <div className={`text-sm ${isDark ? "text-gray-400" : "text-slate-600"}`}>Rejected</div>
          <div className={`text-xs mt-1 ${isDark ? "text-gray-500" : "text-slate-500"}`}>Declined submissions</div>
        </div>

        <div 
          onClick={() => setActiveTab("cancelled")}
          className={`p-4 rounded-lg border transition-all cursor-pointer hover:shadow-md transform hover:-translate-y-1 ${
            activeTab === "cancelled" ? (isDark ? "ring-2 ring-gray-400" : "ring-2 ring-gray-400") : ""
          } ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-slate-200"}`}
        >
          <div className={`text-2xl font-bold ${isDark ? "text-gray-400" : "text-gray-500"}`}>{liveStats.cancelled}</div>
          <div className={`text-sm ${isDark ? "text-gray-400" : "text-slate-600"}`}>Cancelled</div>
          <div className={`text-xs mt-1 ${isDark ? "text-gray-500" : "text-slate-500"}`}>Withdrawn by user</div>
        </div>
      </div>
      )}

      {/* Tabs Navigation */}
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
          {livePendingSubmissions.length > 0 && (
            <span className={`ml-1.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
              activeTab === "pending"
                ? (isDark ? "bg-blue-900/60 text-blue-300" : "bg-blue-100 text-blue-700")
                : (isDark ? "bg-gray-700 text-gray-300" : "bg-gray-200 text-gray-600")
            }`}>{livePendingSubmissions.length}</span>
          )}
          {activeTab === "pending" && (
            <span className={`absolute bottom-0 left-0 w-full h-0.5 ${isDark ? "bg-blue-400" : "bg-blue-600"}`}></span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("confirmed")}
          className={`pb-3 text-sm font-medium transition-colors relative ${
            activeTab === "confirmed"
              ? (isDark ? "text-green-400" : "text-green-600")
              : (isDark ? "text-gray-400 hover:text-gray-200" : "text-slate-500 hover:text-slate-800")
          }`}
        >
          Confirmed
          {liveStats.successful > 0 && (
            <span className={`ml-1.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
              activeTab === "confirmed"
                ? (isDark ? "bg-green-900/60 text-green-300" : "bg-green-100 text-green-700")
                : (isDark ? "bg-gray-700 text-gray-300" : "bg-gray-200 text-gray-600")
            }`}>{liveStats.successful}</span>
          )}
          {activeTab === "confirmed" && (
            <span className={`absolute bottom-0 left-0 w-full h-0.5 ${isDark ? "bg-green-400" : "bg-green-600"}`}></span>
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
          {liveStats.rejected > 0 && (
            <span className={`ml-1.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
              activeTab === "rejected"
                ? (isDark ? "bg-red-900/60 text-red-300" : "bg-red-100 text-red-700")
                : (isDark ? "bg-gray-700 text-gray-300" : "bg-gray-200 text-gray-600")
            }`}>{liveStats.rejected}</span>
          )}
          {activeTab === "rejected" && (
            <span className={`absolute bottom-0 left-0 w-full h-0.5 ${isDark ? "bg-red-400" : "bg-red-600"}`}></span>
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
          {liveStats.cancelled > 0 && (
            <span className={`ml-1.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
              activeTab === "cancelled"
                ? (isDark ? "bg-gray-600 text-gray-200" : "bg-gray-200 text-gray-700")
                : (isDark ? "bg-gray-700 text-gray-300" : "bg-gray-200 text-gray-600")
            }`}>{liveStats.cancelled}</span>
          )}
          {activeTab === "cancelled" && (
            <span className={`absolute bottom-0 left-0 w-full h-0.5 ${isDark ? "bg-gray-400" : "bg-gray-500"}`}></span>
          )}
        </button>
      </div>
      )}

      {/* Content Area Based on Active Tab */}
      
      {/* 1. Pending Tab Content */}
      {activeTab === "pending" && (
        isStatsLoading ? (
          <div className="space-y-3">
            {[1,2].map(n => (
              <div key={n} className={`p-4 rounded-lg border animate-pulse ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-slate-200"}`}>
                <div className={`h-4 rounded w-1/3 mb-3 ${isDark ? "bg-gray-700" : "bg-gray-200"}`}></div>
                <div className={`h-3 rounded w-1/2 mb-2 ${isDark ? "bg-gray-700" : "bg-gray-200"}`}></div>
                <div className={`h-3 rounded w-1/4 ${isDark ? "bg-gray-700" : "bg-gray-200"}`}></div>
              </div>
            ))}
          </div>
        ) : livePendingSubmissions.length === 0 ? (
          <div className="text-center py-12">
            <h3 className={`text-lg font-medium mb-2 ${isDark ? "text-gray-200" : "text-slate-900"}`}>
              All caught up!
            </h3>
            <p className={`${isDark ? "text-gray-400" : "text-slate-500"}`}>
              No pending submissions to review.
            </p>
          </div>
        ) : (
          <div>
            {loading && (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                <span className="ml-2 text-slate-600">Processing...</span>
              </div>
            )}

            {!loading && (
              <div className="space-y-3">
                {livePendingSubmissions.map((submission) => {
                  const userInfo = getUserInfo(submission.userId);
                  const isBundle = isMixedBundle(submission);
                  
                  let estimatedPoints = 0;
                  if (isBundle) {
                    estimatedPoints = parseFloat(submission.points) || 0;
                  } else {
                    const rate = pointsPerKiloMap[submission.type] ?? 0;
                    estimatedPoints = Number(submission.weight * rate) || 0;
                  }
                  
                  return (
                    <div
                      key={submission.id}
                      className={`p-4 rounded-lg border-l-4 ${
                        isBundle ? 'border-l-green-500' : 'border-l-yellow-400'
                      } transition-all hover:shadow-md ${
                        isDark ? "bg-gray-800 border border-gray-700" : "bg-white border border-slate-200"
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          {isBundle ? (
                            <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full ${
                              isDark ? "bg-green-900/40 text-green-400 border border-green-700" : "bg-green-100 text-green-700 border border-green-300"
                            }`}>
                              <Layers className="w-3 h-3" />
                              Bundle
                            </span>
                          ) : (
                            <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full ${
                              isDark ? "bg-blue-900/40 text-blue-400 border border-blue-700" : "bg-blue-100 text-blue-700 border border-blue-300"
                            }`}>
                              <Package className="w-3 h-3" />
                              Single Item
                            </span>
                          )}
                          {/* Walk-in badge — all submissions are in-person */}
                          <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full ${
                            isDark ? "bg-amber-900/40 text-amber-400 border border-amber-700" : "bg-amber-100 text-amber-700 border border-amber-300"
                          }`}>
                            <MapPin className="w-3 h-3" />
                            Walk-in
                          </span>
                        </div>

                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                              <div>
                                <span className={`font-medium uppercase tracking-wider text-xs ${
                                  isDark ? "text-gray-400" : "text-slate-500"
                                }`}>
                                  User Info
                                </span>
                                <div className={`text-sm mt-1 font-medium ${isDark ? "text-gray-300" : "text-slate-900"}`}>
                                  {userInfo.name}
                                </div>
                                <div className={`text-xs ${isDark ? "text-gray-500" : "text-slate-500"}`}>
                                  {userInfo.email}
                                </div>
                                <div className={`text-xs font-mono ${isDark ? "text-gray-500" : "text-slate-500"}`}>
                                  ID: {userInfo.uniqueId}
                                </div>
                              </div>

                              <div>
                                <span className={`font-medium uppercase tracking-wider text-xs ${
                                  isDark ? "text-gray-400" : "text-slate-500"
                                }`}>
                                  Waste Details
                                </span>
                                <WasteDetailsRenderer submission={submission} />
                              </div>

                              <div className="sm:col-span-2 grid grid-cols-2 gap-4">
                                <div>
                                  <span className={`font-medium uppercase tracking-wider text-xs ${
                                    isDark ? "text-gray-400" : "text-slate-500"
                                  }`}>
                                    Points
                                  </span>
                                  <div className={`text-sm mt-1 font-bold ${isDark ? "text-yellow-400" : "text-yellow-600"}`}>
                                    {estimatedPoints.toFixed(2)} pts
                                  </div>
                                  <div className={`text-xs ${isDark ? "text-gray-500" : "text-slate-500"}`}>
                                    Estimated reward
                                  </div>
                                </div>
                                <div>
                                  <span className={`font-medium uppercase tracking-wider text-xs ${
                                    isDark ? "text-gray-400" : "text-slate-500"
                                  }`}>
                                    Submitted
                                  </span>
                                  <div className={`text-xs mt-1 ${isDark ? "text-gray-500" : "text-slate-500"}`}>
                                    {formatDate(submission.submittedAt)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        {/* ── Identity Verification Strip ───────────────────────────────── */}
                        {(() => {
                          // Derive a short, stable 6-char code from the userId for easy visual match
                          const uid = submission.userId || "";
                          const verifyCode = (uid.slice(0,3) + uid.slice(-3)).toUpperCase();
                          return (
                            <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-sm ${
                              isDark ? "bg-amber-900/15 border-amber-700/50" : "bg-amber-50 border-amber-200"
                            }`}>
                              <ShieldCheck className={`w-4 h-4 flex-shrink-0 ${isDark ? "text-amber-400" : "text-amber-600"}`} />
                              <div className="flex-1">
                                <span className={`font-semibold text-xs uppercase tracking-wider ${isDark ? "text-amber-300" : "text-amber-700"}`}>
                                  Identity Check
                                </span>
                                <p className={`text-xs mt-0.5 ${isDark ? "text-amber-400/80" : "text-amber-700"}`}>
                                  Ask the user to show their app. Their code must match:
                                </p>
                              </div>
                              <span className={`font-mono font-bold text-lg tracking-widest px-3 py-1 rounded-lg ${
                                isDark ? "bg-amber-900/40 text-amber-300 border border-amber-700" : "bg-amber-100 text-amber-800 border border-amber-300"
                              }`}>
                                {verifyCode}
                              </span>
                            </div>
                          );
                        })()}

                        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 pt-3 border-t border-gray-200 dark:border-gray-600">
                          <button
                            onClick={() => confirmSubmission(submission)}
                            className="flex-1 px-4 py-2.5 text-white bg-gradient-to-r from-green-600 to-green-700 rounded-lg hover:from-green-700 hover:to-green-800 text-sm font-medium transition-all duration-200 flex items-center justify-center space-x-2 shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
                            disabled={loading}
                          >
                            <span className="text-center">Confirm & Award {estimatedPoints.toFixed(1)} pts</span>
                          </button>
                          <button
                            onClick={() => setRejectModal({ open: true, submissionId: submission.id, userId: submission.userId })}
                            className="flex-1 px-4 py-2.5 text-white bg-gradient-to-r from-red-600 to-red-700 rounded-lg hover:from-red-700 hover:to-red-800 text-sm font-medium transition-all duration-200 flex items-center justify-center space-x-2 shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
                            disabled={loading}
                          >
                            <span>Reject</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )
      )}

      {/* ── Cancelled submissions notice (visible in pendingOnly mode) ─────────
          When admin arrives from the dashboard quick-link, all tabs are hidden.
          This collapsible section ensures user-cancelled submissions are never
          invisible — admin always knows if a user withdrew their submission.   */}
      {pendingOnly && cancelledSubmissions.length > 0 && (
        <CancelledInPendingOnlySection
          cancelledSubmissions={cancelledSubmissions}
          isDark={isDark}
          getUserInfo={getUserInfo}
          isMixedBundle={isMixedBundle}
          formatDate={formatDate}
        />
      )}

      {/* ── Reject-with-Reason Modal ────────────────────────────────────────── */}
      <RejectSubmissionModal
        isOpen={rejectModal.open}
        onClose={() => setRejectModal({ open: false, submissionId: null, userId: null })}
        onConfirm={(reason) => {
          const { submissionId, userId } = rejectModal;
          setRejectModal({ open: false, submissionId: null, userId: null });
          if (submissionId) rejectSubmission(submissionId, userId, reason);
        }}
        isDark={isDark}
      />

      {/* 2 & 3. Confirmed and Rejected Tabs Content */}
      {(activeTab === "confirmed" || activeTab === "rejected") && (
        (activeTab === "confirmed" ? confirmedSubmissions : rejectedSubmissions).length === 0 ? (
          <div className="text-center py-8">
            <div className={`w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center ${
              isDark ? "bg-gray-700" : "bg-slate-100"
            }`}>
              <span className="text-lg">⏳</span>
            </div>
            <p className={`${isDark ? "text-gray-400" : "text-slate-500"}`}>
              No {activeTab} submissions yet.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {(activeTab === "confirmed" ? confirmedSubmissions : rejectedSubmissions).map((submission) => {
              const userInfo = getUserInfo(submission.userId);
              const isBundle = isMixedBundle(submission);
              
              let finalPoints = parseFloat(submission.points) || parseFloat(submission.pointsAwarded) || 0;
              
              if (finalPoints === 0 && !isBundle) {
                const rate = pointsPerKiloMap[submission.type] ?? 0;
                finalPoints = Number(submission.weight * rate) || 0;
              }

              return (
                <div
                  key={submission.id}
                  className={`p-4 rounded-lg ${
                    isDark ? "bg-gray-800 border border-gray-700" : "bg-white border border-slate-200"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
                    <div className="flex-1 w-full">
                      <div className="flex items-center gap-2 mb-3">
                        {isBundle ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full ${
                            isDark ? "bg-green-900/40 text-green-400 border border-green-700" : "bg-green-100 text-green-700 border border-green-300"
                          }`}>
                            <Layers className="w-3 h-3" />
                            Bundle
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full ${
                            isDark ? "bg-blue-900/40 text-blue-400 border border-blue-700" : "bg-blue-100 text-blue-700 border border-blue-300"
                          }`}>
                            <Package className="w-3 h-3" />
                            Single Item
                          </span>
                        )}
                      </div>

                      <div className="space-y-3 sm:space-y-0 sm:grid sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-5 gap-4 text-sm">
                        
                        {/* User Info */}
                        <div>
                          <span className={`font-medium uppercase tracking-wider text-xs ${
                            isDark ? "text-gray-400" : "text-slate-500"
                          }`}>
                            User
                          </span>
                          <div className={`text-sm mt-1 ${isDark ? "text-gray-300" : "text-slate-900"}`}>
                            {userInfo.name}
                          </div>
                          <div className={`text-xs ${isDark ? "text-gray-500" : "text-slate-500"}`}>
                            {userInfo.email}
                          </div>
                        </div>

                        {/* Waste Details */}
                        <div className="xl:col-span-2">
                          <span className={`font-medium uppercase tracking-wider text-xs ${
                            isDark ? "text-gray-400" : "text-slate-500"
                          }`}>
                            Waste Details
                          </span>
                          <WasteDetailsRenderer submission={submission} compact={true} showExpanded={true} />
                        </div>

                        {/* Points */}
                        <div>
                          <span className={`font-medium uppercase tracking-wider text-xs ${
                            isDark ? "text-gray-400" : "text-slate-500"
                          }`}>
                            Points
                          </span>
                          <div className={`text-sm mt-1 font-bold ${
                            submission.status === "confirmed" 
                              ? (isDark ? "text-green-400" : "text-green-600")
                              : (isDark ? "text-red-400" : "text-red-600")
                          }`}>
                            {submission.status === "confirmed" ? `${finalPoints.toFixed(2)} pts` : "0 pts"}
                          </div>
                        </div>

                        {/* Timeline — submitted / confirmed / rejected dates */}
                        <div className="xl:col-span-2">
                          <span className={`font-medium uppercase tracking-wider text-xs ${
                            isDark ? "text-gray-400" : "text-slate-500"
                          }`}>
                            Timeline
                          </span>
                          <div className="mt-1 space-y-1">
                            {submission.submittedAt && (
                              <div className={`flex items-center gap-1.5 text-xs ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                                <span className="font-medium">Submitted:</span>
                                {formatDate(submission.submittedAt)}
                              </div>
                            )}
                            {submission.status === "confirmed" && submission.confirmedAt && (
                              <div className={`flex items-center gap-1.5 text-xs ${isDark ? "text-green-400" : "text-green-600"}`}>
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                                <span className="font-medium">Confirmed:</span>
                                {formatDate(submission.confirmedAt)}
                              </div>
                            )}
                            {submission.status === "rejected" && submission.rejectedAt && (
                              <div className={`flex items-center gap-1.5 text-xs ${isDark ? "text-red-400" : "text-red-600"}`}>
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                                <span className="font-medium">Rejected:</span>
                                {formatDate(submission.rejectedAt)}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Status Badge (Mobile view puts it here, Desktop floats right) */}
                        <div className="flex sm:hidden mt-2">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${
                            getStatusBadgeStyle(submission.status)
                          }`}>
                            {submission.status}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Status Badge (Desktop) */}
                    <div className="hidden sm:block flex-shrink-0 ml-4">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${
                        getStatusBadgeStyle(submission.status)
                      }`}>
                        {submission.status}
                      </span>
                    </div>
                  </div>

                  {/* ── Rejection reason banner ──────────────────────────── */}
                  {submission.status === "rejected" && submission.rejectionReason && (
                    <div className={`mt-3 flex items-start gap-2 px-3 py-2.5 rounded-xl border text-sm ${
                      isDark ? "bg-red-900/20 border-red-800/50 text-red-300" : "bg-red-50 border-red-200 text-red-700"
                    }`}>
                      <span className="flex-shrink-0 mt-0.5">⚠️</span>
                      <span>
                        <span className="font-semibold">Rejection reason: </span>
                        {submission.rejectionReason}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {/* 4. Cancelled Tab Content */}
      {activeTab === "cancelled" && (
        cancelledSubmissions.length === 0 ? (
          <div className="text-center py-8">
            <div className={`w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center ${
              isDark ? "bg-gray-700" : "bg-slate-100"
            }`}>
              <span className="text-xl">🚫</span>
            </div>
            <p className={`text-sm ${isDark ? "text-gray-400" : "text-slate-500"}`}>
              No cancelled submissions.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {cancelledSubmissions.map((submission) => {
              const userInfo = getUserInfo(submission.userId);
              const isBundle = isMixedBundle(submission);
              const displayWeight = isBundle
                ? (submission.totalWeight ?? submission.items?.reduce((s, i) => s + (i.weight || 0), 0) ?? 0)
                : (submission.weight ?? 0);
              const estimatedPoints = parseFloat(submission.points) || 0;

              return (
                <div
                  key={submission.id}
                  className={`p-4 rounded-lg border-l-4 border-l-gray-400 ${
                    isDark ? "bg-gray-800 border border-gray-700 opacity-80" : "bg-white border border-slate-200 opacity-90"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
                    <div className="flex-1 w-full">
                      {/* Badges */}
                      <div className="flex items-center gap-2 mb-3 flex-wrap">
                        {isBundle ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full ${
                            isDark ? "bg-green-900/40 text-green-400 border border-green-700" : "bg-green-100 text-green-700 border border-green-300"
                          }`}>
                            <Layers className="w-3 h-3" />Bundle
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full ${
                            isDark ? "bg-blue-900/40 text-blue-400 border border-blue-700" : "bg-blue-100 text-blue-700 border border-blue-300"
                          }`}>
                            <Package className="w-3 h-3" />Single Item
                          </span>
                        )}
                        <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full ${
                          isDark ? "bg-gray-700 text-gray-400 border border-gray-600" : "bg-gray-100 text-gray-600 border border-gray-300"
                        }`}>
                          🚫 Cancelled by User
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                        {/* User */}
                        <div>
                          <span className={`font-medium uppercase tracking-wider text-xs ${isDark ? "text-gray-400" : "text-slate-500"}`}>User</span>
                          <div className={`text-sm mt-1 font-medium ${isDark ? "text-gray-300" : "text-slate-900"}`}>{userInfo.name}</div>
                          <div className={`text-xs ${isDark ? "text-gray-500" : "text-slate-500"}`}>{userInfo.email}</div>
                        </div>

                        {/* Waste Details */}
                        <div>
                          <span className={`font-medium uppercase tracking-wider text-xs ${isDark ? "text-gray-400" : "text-slate-500"}`}>Waste Details</span>
                          <WasteDetailsRenderer submission={submission} compact={true} showExpanded={false} />
                        </div>

                        {/* Points (would have been) */}
                        <div>
                          <span className={`font-medium uppercase tracking-wider text-xs ${isDark ? "text-gray-400" : "text-slate-500"}`}>Est. Points</span>
                          <div className={`text-sm mt-1 font-bold line-through ${isDark ? "text-gray-600" : "text-gray-400"}`}>
                            {estimatedPoints.toFixed(2)} pts
                          </div>
                        </div>

                        {/* Timeline */}
                        <div>
                          <span className={`font-medium uppercase tracking-wider text-xs ${isDark ? "text-gray-400" : "text-slate-500"}`}>Timeline</span>
                          <div className="mt-1 space-y-1">
                            {submission.submittedAt && (
                              <div className={`flex items-center gap-1.5 text-xs ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                                <span className="font-medium">Submitted:</span>
                                {formatDate(submission.submittedAt)}
                              </div>
                            )}
                            {submission.cancelledAt && (
                              <div className={`flex items-center gap-1.5 text-xs ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0" />
                                <span className="font-medium">Cancelled:</span>
                                {formatDate(submission.cancelledAt)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Status badge */}
                    <div className="hidden sm:block flex-shrink-0 ml-4">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${getStatusBadgeStyle("cancelled")}`}>
                        cancelled
                      </span>
                    </div>
                  </div>

                  {/* Cancellation reason if stored */}
                  {(submission.reason || submission.cancellationReason) && (
                    <div className={`mt-3 flex items-start gap-2 px-3 py-2.5 rounded-xl border text-sm ${
                      isDark ? "bg-gray-700/40 border-gray-600 text-gray-300" : "bg-gray-50 border-gray-200 text-gray-600"
                    }`}>
                      <span className="flex-shrink-0 mt-0.5">ℹ️</span>
                      <span>
                        <span className="font-semibold">Reason: </span>
                        {submission.reason || submission.cancellationReason}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Animation styles */}
      <style>{`
        @keyframes slide-down {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-down { animation: slide-down 0.3s ease-out forwards; }
      `}</style>
    </div>
  );
};

export default SubmissionsTab;