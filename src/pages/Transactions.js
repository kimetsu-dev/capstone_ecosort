import { useEffect, useState, useCallback, useMemo } from "react";
import { auth, db } from "../firebase";
import { useNavigate } from "react-router-dom";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  getDoc,
} from "firebase/firestore";
import {
  Loader2,
  Coins,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Clock,
  Calendar,
  Search,
  Eye,
  EyeOff,
  ChevronDown,
  RefreshCw,
  ShieldCheck,
  Link,
  Hash,
  Box,
  X,
  RotateCcw,
  Info,
  Gift,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";

// ── Blockchain Block Detail Modal ─────────────────────────────────────────────
function BlockDetailModal({ block, visible, onClose }) {
  const { isDark } = useTheme();

  useEffect(() => {
    if (visible) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
        document.documentElement.style.overflow = "";
      };
    }
  }, [visible]);

  if (!visible || !block) return null;

  const isGenesis = block.index === 1 || block.prevHash === "0";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" style={{ touchAction: "none" }}>
      <div
        className={`w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden transform transition-all scale-100 ${
          isDark ? "bg-gray-800 border border-gray-700" : "bg-white border border-gray-200"
        }`}
      >
        <div className="relative p-6 pb-0">
          <button
            onClick={onClose}
            className={`absolute top-4 right-4 p-2 rounded-full transition-colors ${
              isDark ? "hover:bg-gray-700 text-gray-400" : "hover:bg-gray-100 text-gray-500"
            }`}
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-green-500/10 rounded-xl border border-green-500/20">
              <ShieldCheck className="w-8 h-8 text-green-500" />
            </div>
            <div>
              <h3 className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                Verified Transaction
              </h3>
              <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                Immutable Record #{block.index}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className={`p-5 rounded-xl space-y-4 ${isDark ? "bg-gray-900/50 border border-gray-700" : "bg-gray-50 border border-gray-100"}`}>
            <div className="flex justify-between items-center border-b border-gray-200/10 pb-3">
              <div className="flex items-center gap-2">
                <Box className="w-4 h-4 text-blue-500" />
                <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                  Block Index
                </span>
              </div>
              <span className={`font-mono font-bold text-lg ${isDark ? "text-green-400" : "text-green-600"}`}>
                #{block.index}
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Hash className="w-4 h-4 text-purple-500" />
                <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                  Current Hash (Fingerprint)
                </span>
              </div>
              <div className={`font-mono text-[10px] break-all p-3 rounded-lg border ${
                isDark ? "bg-black/30 border-gray-700 text-gray-300" : "bg-white border-gray-200 text-gray-600"
              }`}>
                {block.hash}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Link className="w-4 h-4 text-orange-500" />
                <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                  Previous Hash (Chain Link)
                </span>
              </div>
              <div className={`font-mono text-[10px] break-all p-3 rounded-lg border ${
                isDark ? "bg-black/30 border-gray-700 text-gray-500" : "bg-white border-gray-200 text-gray-400"
              }`}>
                {isGenesis ? (
                  <span className="text-blue-500 font-bold italic">-- GENESIS BLOCK (Start of Chain) --</span>
                ) : (
                  block.prevHash
                )}
              </div>
            </div>
          </div>

          <div className={`flex gap-3 p-4 rounded-lg text-sm border ${
            isDark ? "bg-blue-900/10 border-blue-900/30 text-blue-300" : "bg-blue-50 border-blue-100 text-blue-700"
          }`}>
            <ShieldCheck className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p>
              <strong>Tamper-Proof:</strong> This transaction is cryptographically linked to the previous one. Any attempt to alter this record would break the chain, alerting the system immediately.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Transaction Detail Modal ──────────────────────────────────────────────────
function TransactionDetailModal({ tx, visible, onClose, ledgerBlock, isDark }) {
  useEffect(() => {
    if (visible) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
        document.documentElement.style.overflow = "";
      };
    }
  }, [visible]);

  if (!visible || !tx) return null;

  const isEarned = tx._type === "earned" || tx.type === "points_awarded";
  const isRefund = tx._type === "refund" || tx.type === "points_refunded";
  const amount = Math.abs(tx.points || 0);

  const categoryIcons = {
    recycling: "♻️", transport: "🚶", lifestyle: "🌱",
    food: "🥗", products: "🧽", reward: "🎁", refund: "↩️", default: "🎟️",
  };
  const cat = tx.category || (isEarned ? "recycling" : isRefund ? "refund" : "reward");

  const isSubmissionRejected = tx.type === "submission_rejected" || tx._type === "submission_rejected";
  const isSubmissionCancelled = tx.type === "submission_cancelled" || tx._type === "submission_cancelled";
  const isCancelledRedemption = tx.type === "redemption_cancelled" || tx._type === "cancelled_redemption";

  const getTypeLabel = () => {
    if (isRefund) return { label: "Rejected", color: "text-orange-500", bg: isDark ? "bg-orange-900/20 border-orange-700" : "bg-orange-50 border-orange-200" };
    if (isCancelledRedemption) return { label: "Cancelled", color: "text-blue-500", bg: isDark ? "bg-blue-900/20 border-blue-700" : "bg-blue-50 border-blue-200" };
    if (isSubmissionRejected) return { label: "Submission Rejected", color: "text-red-500", bg: isDark ? "bg-red-900/20 border-red-700" : "bg-red-50 border-red-200" };
    if (isSubmissionCancelled) return { label: "Submission Cancelled", color: "text-gray-500", bg: isDark ? "bg-gray-700/40 border-gray-600" : "bg-gray-100 border-gray-300" };
    if (isEarned) return { label: "Points Earned", color: "text-green-500", bg: isDark ? "bg-green-900/20 border-green-700" : "bg-green-50 border-green-200" };
    return { label: "Points Redeemed", color: "text-red-500", bg: isDark ? "bg-red-900/20 border-red-700" : "bg-red-50 border-red-200" };
  };
  const typeInfo = getTypeLabel();

  const DetailRow = ({ label, value, mono = false }) => (
    <div className={`flex flex-col sm:flex-row sm:items-start gap-1 py-3 border-b ${isDark ? "border-gray-700/50" : "border-gray-100"}`}>
      <span className={`text-xs font-semibold uppercase tracking-wider w-32 flex-shrink-0 ${isDark ? "text-gray-400" : "text-gray-500"}`}>{label}</span>
      <span className={`text-sm flex-1 ${mono ? "font-mono" : ""} ${isDark ? "text-gray-200" : "text-gray-800"}`}>{value || "—"}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" style={{ touchAction: "none" }}>
      <div
        className={`w-full max-w-md rounded-2xl shadow-2xl overflow-hidden ${
          isDark ? "bg-gray-800 border border-gray-700" : "bg-white border border-gray-200"
        }`}
        style={{ maxHeight: "85dvh" }}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? "border-gray-700 bg-gray-800" : "border-gray-100 bg-gray-50"}`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{categoryIcons[cat] || categoryIcons.default}</span>
            <div>
              <h3 className={`font-bold text-base leading-tight ${isDark ? "text-white" : "text-gray-900"}`}>
                Transaction Details
              </h3>
              <span className={`text-xs font-semibold ${typeInfo.color}`}>{typeInfo.label}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-full transition-colors ${isDark ? "hover:bg-gray-700 text-gray-400" : "hover:bg-gray-100 text-gray-500"}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Points badge */}
        <div className={`px-5 py-4 border-b ${isDark ? "border-gray-700" : "border-gray-100"}`}>
          <div className={`inline-flex items-center gap-3 px-4 py-3 rounded-xl border ${typeInfo.bg}`}>
            {(isRefund || isCancelledRedemption) ? (
              <RotateCcw className={`w-5 h-5 ${typeInfo.color}`} />
            ) : (isSubmissionRejected || isSubmissionCancelled) ? (
              <XCircle className={`w-5 h-5 ${typeInfo.color}`} />
            ) : isEarned ? (
              <TrendingUp className={`w-5 h-5 ${typeInfo.color}`} />
            ) : (
              <TrendingDown className={`w-5 h-5 ${typeInfo.color}`} />
            )}
            <span className={`text-2xl font-bold ${typeInfo.color}`}>
              {isRefund ? `+${amount}` : isEarned ? `+${amount}` : `-${amount}`}
            </span>
            <span className={`text-sm font-medium ${isDark ? "text-gray-400" : "text-gray-500"}`}>points</span>
          </div>
        </div>
        {/* Context note below points badge */}
        {isRefund && (
          <div className={`mx-5 mb-3 flex items-center gap-2 px-3 py-2 rounded-xl text-xs border ${
            isDark ? "bg-blue-900/20 border-blue-800 text-blue-400" : "bg-blue-50 border-blue-200 text-blue-700"
          }`}>
            <RotateCcw className="w-3.5 h-3.5 flex-shrink-0" />
            <span><strong>Points Refunded</strong> — your points were returned after the admin rejected this reward.</span>
          </div>
        )}
        {isCancelledRedemption && (
          <div className={`mx-5 mb-3 flex items-center gap-2 px-3 py-2 rounded-xl text-xs border ${
            isDark ? "bg-blue-900/20 border-blue-800 text-blue-400" : "bg-blue-50 border-blue-200 text-blue-700"
          }`}>
            <RotateCcw className="w-3.5 h-3.5 flex-shrink-0" />
            <span><strong>Points Refunded</strong> — your points were returned because you cancelled this redemption.</span>
          </div>
        )}
        {isSubmissionRejected && (
          <div className={`mx-5 mb-3 flex items-center gap-2 px-3 py-2 rounded-xl text-xs border ${
            isDark ? "bg-red-900/20 border-red-800 text-red-400" : "bg-red-50 border-red-200 text-red-700"
          }`}>
            <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Your waste submission was <strong>rejected</strong>. No points were awarded.</span>
          </div>
        )}
        {isSubmissionCancelled && (
          <div className={`mx-5 mb-3 flex items-center gap-2 px-3 py-2 rounded-xl text-xs border ${
            isDark ? "bg-gray-700/40 border-gray-600 text-gray-400" : "bg-gray-100 border-gray-300 text-gray-600"
          }`}>
            <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>You <strong>cancelled</strong> this waste submission before it was reviewed.</span>
          </div>
        )}

        {/* Body */}
        <div className="px-5 py-2 overflow-y-auto" style={{ maxHeight: "50vh" }}>
          <DetailRow label="Description" value={tx.description} />
          <DetailRow label="Category" value={cat.charAt(0).toUpperCase() + cat.slice(1)} />
          <DetailRow
            label="Date"
            value={tx.timestamp?.toLocaleDateString("en-US", {
              year: "numeric", month: "long", day: "numeric",
              hour: "2-digit", minute: "2-digit",
            })}
          />
          {tx.rewardName && <DetailRow label="Reward" value={tx.rewardName} />}
          {tx.rejectionReason && (
            <DetailRow label="Rejection Reason" value={tx.rejectionReason} />
          )}
          {ledgerBlock && (
            <div className={`mt-3 flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm ${
              isDark ? "bg-green-900/20 border-green-700 text-green-400" : "bg-green-50 border-green-200 text-green-700"
            }`}>
              <ShieldCheck className="w-4 h-4 flex-shrink-0" />
              <span className="font-semibold">Verified on Blockchain · Block #{ledgerBlock.index}</span>
            </div>
          )}
        </div>

        <div className={`px-5 py-4 border-t ${isDark ? "border-gray-700" : "border-gray-100"}`}>
          <button
            onClick={onClose}
            className={`w-full py-2.5 rounded-xl font-medium text-sm transition-colors ${
              isDark ? "bg-gray-700 hover:bg-gray-600 text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-800"
            }`}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Transactions() {
  const navigate = useNavigate();
  const { isDark } = useTheme() || {};
  
  const [userName, setUserName] = useState("User");
  const [points, setPoints] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());

  const [transactions, setTransactions] = useState([]);
  const [redemptions, setRedemptions] = useState([]);
  const [refunds, setRefunds] = useState([]);
  
  const [ledgerMap, setLedgerMap] = useState({});
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [showBlockModal, setShowBlockModal] = useState(false);

  // Transaction detail modal
  const [selectedTx, setSelectedTx] = useState(null);
  const [showTxDetail, setShowTxDetail] = useState(false);

  const [loadingUserData, setLoadingUserData] = useState(true);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [error, setError] = useState(null);

  const [activeTab, setActiveTab] = useState("all"); 
  const [searchTerm, setSearchTerm] = useState("");
  const [dateRange, setDateRange] = useState("all"); 
  const [sortOrder, setSortOrder] = useState("desc"); 
  const [showPoints, setShowPoints] = useState(true);
  const [isPWA, setIsPWA] = useState(false);

  useEffect(() => {
    const checkPWA = () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      const isIOSStandalone = window.navigator.standalone === true;
      setIsPWA(isStandalone || isIOSStandalone);
    };
    checkPWA();
  }, []);

  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return "Good Morning";
    else if (hour < 18) return "Good Afternoon";
    else return "Good Evening";
  };

  const categoryIcons = {
    recycling: "♻️", transport: "🚶", lifestyle: "🌱",
    food: "🥗", products: "🧽", reward: "🎁", refund: "↩️", default: "🎟️",
  };

  const categoryColors = {
    recycling: isDark ? "bg-blue-900/30 text-blue-400" : "bg-blue-100 text-blue-700",
    transport: isDark ? "bg-green-900/30 text-green-400" : "bg-green-100 text-green-700",
    lifestyle: isDark ? "bg-purple-900/30 text-purple-400" : "bg-purple-100 text-purple-700",
    food: isDark ? "bg-orange-900/30 text-orange-400" : "bg-orange-100 text-orange-700",
    products: isDark ? "bg-teal-900/30 text-teal-400" : "bg-teal-100 text-teal-700",
    reward: isDark ? "bg-pink-900/30 text-pink-400" : "bg-pink-100 text-pink-700",
    refund: isDark ? "bg-blue-900/30 text-blue-400" : "bg-blue-100 text-blue-700",
    default: isDark ? "bg-gray-800/30 text-gray-400" : "bg-gray-100 text-gray-700",
  };

  const totalEarned = transactions.reduce((sum, tx) => sum + (tx.points || 0), 0);
  const totalSpent = redemptions.reduce((sum, r) => sum + (r.points || 0), 0);
  const totalRefunded = refunds.reduce((sum, r) => sum + (r.points || 0), 0);

  // Count how many redemptions were refunded (for tab badge)
  const refundedRedemptionIdsMemo = new Set(refunds.map(r => r.redemptionId).filter(Boolean));
  const refundedRedemptionsCount = redemptions.filter(r =>
    Array.isArray(r.redemptionIds)
      ? r.redemptionIds.some(id => refundedRedemptionIdsMemo.has(id))
      : refundedRedemptionIdsMemo.has(r.id)
  ).length;
  const submissionRejectedCount = transactions.filter(t => t.type === "submission_rejected").length;
  const submissionCancelledCount = transactions.filter(t => t.type === "submission_cancelled").length;
  // Also count cancelled redemptions that are in the refunds array
  const cancelledRedemptionCount = refunds.filter(r => r.type === "redemption_cancelled").length;
  const refundedCount = refundedRedemptionsCount + submissionRejectedCount + submissionCancelledCount + cancelledRedemptionCount;

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 1. Fetch User Data
  useEffect(() => {
    async function fetchUserData() {
      try {
        const user = auth.currentUser;
        if (!user) { navigate("/login"); return; }
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const data = userSnap.data();
          setUserName(data.username || "User");
          setPoints(data.totalPoints || 0);
        } else {
          setError("User data not found.");
        }
      } catch (err) {
        setError("Failed to load user data.");
        console.error(err);
      } finally {
        setLoadingUserData(false);
      }
    }
    fetchUserData();
  }, [navigate]);

  // 2. Fetch Blockchain Ledger
  const fetchLedger = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      const q = query(collection(db, "ledger"), where("userId", "==", user.uid));
      const snapshot = await getDocs(q);
      const map = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.metadata && data.metadata.firestoreId) {
          map[data.metadata.firestoreId] = { id: doc.id, ...data };
        }
      });
      setLedgerMap(map);
    } catch (err) {
      console.error("Error fetching ledger:", err);
    }
  }, []);

  // 3. Fetch Earned Transactions
  const fetchTransactions = useCallback(async () => {
    try {
      setLoadingTransactions(true);
      const user = auth.currentUser;
      if (!user) return;
      // Fetch both points_awarded and submission_rejected in two queries
      const earnedQ = query(
        collection(db, "point_transactions"),
        where("userId", "==", user.uid),
        where("type", "==", "points_awarded"),
        orderBy("timestamp", "desc")
      );
      const rejectedQ = query(
        collection(db, "point_transactions"),
        where("userId", "==", user.uid),
        where("type", "==", "submission_rejected"),
        orderBy("timestamp", "desc")
      );
      const cancelledSubQ = query(
        collection(db, "point_transactions"),
        where("userId", "==", user.uid),
        where("type", "==", "submission_cancelled"),
        orderBy("timestamp", "desc")
      );
      const [earnedSnap, rejectedSnap, cancelledSubSnap] = await Promise.all([
        getDocs(earnedQ), getDocs(rejectedQ), getDocs(cancelledSubQ)
      ]);
      const earned = earnedSnap.docs.map((doc) => {
        const tx = doc.data();
        return {
          id: doc.id,
          description: tx.description || "Points Earned",
          points: typeof tx.points === "number" ? tx.points : 0,
          timestamp: tx.timestamp?.toDate?.() || new Date(0),
          type: tx.type,
          category: tx.category || "recycling",
        };
      });
      const rejected = rejectedSnap.docs.map((doc) => {
        const tx = doc.data();
        return {
          id: doc.id,
          description: tx.description || "Submission Rejected",
          points: 0,
          timestamp: tx.timestamp?.toDate?.() || new Date(0),
          type: "submission_rejected",
          category: "recycling",
          rejectionReason: tx.rejectionReason || null,
          submissionId: tx.submissionId || null,
        };
      });
      const cancelledSubs = cancelledSubSnap.docs.map((doc) => {
        const tx = doc.data();
        return {
          id: doc.id,
          description: tx.description || "Submission Cancelled",
          points: 0,
          timestamp: tx.timestamp?.toDate?.() || new Date(0),
          type: "submission_cancelled",
          category: "recycling",
          submissionId: tx.submissionId || null,
        };
      });
      setTransactions([...earned, ...rejected, ...cancelledSubs]);
    } catch (err) {
      setError("Failed to load transactions.");
      console.error("Error fetching transactions:", err);
    } finally {
      setLoadingTransactions(false);
    }
  }, []);

  // 4. Fetch Redemption Transactions
  const fetchRedemptions = useCallback(async () => {
    try {
      setLoadingTransactions(true);
      const user = auth.currentUser;
      if (!user) return;

      const queries = [
        query(
          collection(db, "point_transactions"),
          where("userId", "==", user.uid),
          where("type", "==", "points_redeemed"),
          orderBy("timestamp", "desc")
        ),
        query(
          collection(db, "point_transactions"),
          where("userId", "==", user.uid),
          orderBy("timestamp", "desc")
        ),
      ];

      let allRedemptions = [];
      const seenIds = new Set();
      
      for (const q of queries) {
        try {
          const snapshot = await getDocs(q);
          snapshot.docs.forEach((doc) => {
            if (seenIds.has(doc.id)) return;
            const tx = doc.data();
            if (tx.type === "points_redeemed" || (typeof tx.points === "number" && tx.points < 0 && tx.type !== "points_refunded")) {
              seenIds.add(doc.id);
              allRedemptions.push({
                id: doc.id,
                description: tx.description || tx.rewardName || "Redeemed reward",
                points: Math.abs(typeof tx.points === "number" ? tx.points : 0),
                timestamp: tx.timestamp?.toDate?.() || new Date(0),
                type: "points_redeemed",
                category: tx.category || "reward",
                rewardName: tx.rewardName,
                rewardId: tx.rewardId,
                redemptionIds: tx.redemptionIds || [],  // ← keep the link
              });
            }
          });
        } catch (err) {
          console.error("Query error:", err);
        }
      }
      setRedemptions(allRedemptions);
    } catch (err) {
      setError("Failed to load redemptions.");
      console.error("Error fetching redemptions:", err);
    } finally {
      setLoadingTransactions(false);
    }
  }, []);

  // 5. NEW: Fetch Refund Transactions (cancelled/rejected redemptions)
  const fetchRefunds = useCallback(async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;
      const refundedQ = query(
        collection(db, "point_transactions"),
        where("userId", "==", user.uid),
        where("type", "==", "points_refunded"),
        orderBy("timestamp", "desc")
      );
      const cancelledRedQ = query(
        collection(db, "point_transactions"),
        where("userId", "==", user.uid),
        where("type", "==", "redemption_cancelled"),
        orderBy("timestamp", "desc")
      );
      const [refundedSnap, cancelledRedSnap] = await Promise.all([
        getDocs(refundedQ), getDocs(cancelledRedQ)
      ]);
      const refunded = refundedSnap.docs.map((doc) => {
        const tx = doc.data();
        return {
          id: doc.id,
          description: tx.description || "Points Refunded",
          points: Math.abs(typeof tx.points === "number" ? tx.points : 0),
          timestamp: tx.timestamp?.toDate?.() || new Date(0),
          type: "points_refunded",
          category: "refund",
          rewardName: tx.rewardName,
          rejectionReason: tx.rejectionReason,
          redemptionId: tx.redemptionId,
        };
      });
      const cancelledRedemptions = cancelledRedSnap.docs.map((doc) => {
        const tx = doc.data();
        return {
          id: doc.id,
          description: tx.description || "Redemption Cancelled",
          points: Math.abs(typeof tx.points === "number" ? tx.points : 0),
          timestamp: tx.timestamp?.toDate?.() || new Date(0),
          type: "redemption_cancelled",
          category: "refund",
          rewardName: tx.rewardName,
          redemptionId: tx.redemptionId,
        };
      });
      setRefunds([...refunded, ...cancelledRedemptions]);
    } catch (err) {
      console.error("Error fetching refunds:", err);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setError(null);
    await Promise.all([fetchTransactions(), fetchRedemptions(), fetchRefunds(), fetchLedger()]);
  }, [fetchTransactions, fetchRedemptions, fetchRefunds, fetchLedger]);

  useEffect(() => {
    handleRefresh();
  }, [handleRefresh]);

  const formatTimeAgo = (timestamp) => {
    const diff = currentTime - timestamp;
    if (diff < 0) return "now";
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(diff / 3600000);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(diff / 86400000);
    if (days < 7) return `${days}d`;
    return timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const handleViewBlock = (txId) => {
    const block = ledgerMap[txId];
    if (block) {
      setSelectedBlock(block);
      setShowBlockModal(true);
    }
  };

  const handleTxClick = (tx) => {
    setSelectedTx(tx);
    setShowTxDetail(true);
  };

  // Filtering Logic
  const filteredTransactions = useMemo(() => {
    // Earned submissions
    const earnedTxs = transactions.filter(t => t.type === "points_awarded");
    // Submission rejections and cancellations
    const submissionRejectedTxs = transactions.filter(t => t.type === "submission_rejected");
    const submissionCancelledTxs = transactions.filter(t => t.type === "submission_cancelled");

    // Admin-rejected redemptions (points_refunded) — shown as "Rejected"
    const rejectedRedemptionTxs = refunds
      .filter(r => r.type === "points_refunded")
      .map(r => ({ ...r, _type: "refund" }));

    // User-cancelled redemptions (redemption_cancelled) — shown as "Cancelled"
    const cancelledRedemptionTxs = refunds
      .filter(r => r.type === "redemption_cancelled")
      .map(r => ({ ...r, _type: "cancelled_redemption" }));

    // Normal redeemed transactions (not cancelled/rejected)
    const redeemedTxs = redemptions.map(r => ({ ...r, _type: "redeemed" }));

    let data = [];
    if (activeTab === "earned") {
      data = earnedTxs.map(t => ({ ...t, _type: "earned" }));
    } else if (activeTab === "redeemed") {
      data = redeemedTxs;
    } else if (activeTab === "refunded") {
      data = [
        ...rejectedRedemptionTxs,
        ...cancelledRedemptionTxs,
        ...submissionRejectedTxs.map(t => ({ ...t, _type: "submission_rejected" })),
        ...submissionCancelledTxs.map(t => ({ ...t, _type: "submission_cancelled" })),
      ];
    } else {
      // All tab
      data = [
        ...earnedTxs.map(t => ({ ...t, _type: "earned" })),
        ...redeemedTxs,
        ...rejectedRedemptionTxs,
        ...cancelledRedemptionTxs,
        ...submissionRejectedTxs.map(t => ({ ...t, _type: "submission_rejected" })),
        ...submissionCancelledTxs.map(t => ({ ...t, _type: "submission_cancelled" })),
      ];
    }

    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      data = data.filter((t) => t.description.toLowerCase().includes(searchLower));
    }

    if (dateRange !== "all") {
      const now = new Date();
      let compareDate = new Date();
      switch (dateRange) {
        case "today": compareDate.setHours(0, 0, 0, 0); break;
        case "week": compareDate.setDate(now.getDate() - 7); break;
        case "month": compareDate.setMonth(now.getMonth() - 1); break;
        default: compareDate = new Date(0); break;
      }
      data = data.filter((t) => t.timestamp >= compareDate);
    }

    data.sort((a, b) => {
      const aTime = a.timestamp?.getTime() || 0;
      const bTime = b.timestamp?.getTime() || 0;
      return sortOrder === "asc" ? aTime - bTime : bTime - aTime;
    });

    return data;
  }, [activeTab, transactions, redemptions, refunds, searchTerm, dateRange, sortOrder]);

  // --- RENDERERS ---

  const renderMobileTransaction = (tx) => {
    const isEarned = tx._type === "earned";
    const isRefund = tx._type === "refund";
    const isSubmissionRejected = tx._type === "submission_rejected";
    const isSubmissionCancelled = tx._type === "submission_cancelled";
    const isCancelledRedemption = tx._type === "cancelled_redemption";
    const amount = Math.abs(tx.points || 0);
    const cat = tx.category || (isEarned ? "recycling" : (isRefund || isCancelledRedemption) ? "refund" : "recycling");
    const ledgerBlock = ledgerMap[tx.id];

    const pointColor = (isRefund || isCancelledRedemption)
      ? isDark ? "text-blue-400" : "text-blue-600"
      : (isSubmissionRejected || isSubmissionCancelled)
        ? isDark ? "text-gray-400" : "text-gray-500"
        : isEarned
          ? isDark ? "text-green-400" : "text-green-600"
          : isDark ? "text-red-400" : "text-red-600";

    const pointPrefix = (isRefund || isCancelledRedemption) ? "+" : isEarned ? "+" : "";

    const typeBadge = isRefund
      ? { label: "Rejected", icon: RotateCcw, cls: isDark ? "bg-orange-900/40 text-orange-300 border-orange-700" : "bg-orange-100 text-orange-700 border-orange-200" }
      : isCancelledRedemption
        ? { label: "Cancelled", icon: RotateCcw, cls: isDark ? "bg-blue-900/40 text-blue-300 border-blue-700" : "bg-blue-100 text-blue-700 border-blue-200" }
        : isSubmissionRejected
          ? { label: "Submission Rejected", icon: XCircle, cls: isDark ? "bg-red-900/40 text-red-300 border-red-700" : "bg-red-100 text-red-700 border-red-200" }
          : isSubmissionCancelled
            ? { label: "Submission Cancelled", icon: XCircle, cls: isDark ? "bg-gray-700/60 text-gray-300 border-gray-600" : "bg-gray-100 text-gray-700 border-gray-300" }
            : isEarned
              ? { label: "Earned", icon: TrendingUp, cls: isDark ? "bg-green-900/40 text-green-300 border-green-700" : "bg-green-100 text-green-700 border-green-200" }
              : { label: "Redeemed", icon: TrendingDown, cls: isDark ? "bg-red-900/40 text-red-300 border-red-700" : "bg-red-100 text-red-700 border-red-200" };

    const TypeIcon = typeBadge.icon;

    return (
      <div
        key={tx.id}
        onClick={() => handleTxClick(tx)}
        className={`rounded-lg p-4 border relative overflow-hidden transition-all cursor-pointer ${
          isDark
            ? "bg-gray-800/50 border-gray-700/50 hover:bg-gray-800 active:bg-gray-700"
            : "bg-white/70 border-gray-200 hover:bg-white active:bg-gray-50"
        }`}
        role="listitem"
      >
        {ledgerBlock && (
          <div className="absolute top-0 right-0 pointer-events-none">
            <div className="bg-gradient-to-bl from-green-500/20 to-transparent w-20 h-20 absolute top-0 right-0 -mr-10 -mt-10 rounded-full blur-xl" />
          </div>
        )}

        {/* Top row: type badge + points */}
        <div className="flex items-center justify-between mb-2 relative z-10">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${typeBadge.cls}`}>
            <TypeIcon className="w-3 h-3" />
            {typeBadge.label}
          </span>
          <span className={`text-base font-bold ${pointColor}`}>
            {pointPrefix}{amount} pts
          </span>
        </div>

        {/* Bottom row: icon + description + time + verified */}
        <div className="flex items-center space-x-3 relative z-10">
          <div className={`${categoryColors[cat] || categoryColors.default} w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0`}>
            {categoryIcons[cat] || categoryIcons.default}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium truncate ${isDark ? "text-gray-200" : "text-gray-900"}`}>
              {tx.description}
            </p>
            <div className={`flex items-center gap-2 text-xs mt-0.5 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
              <span className="flex items-center">
                <Clock className="w-3 h-3 mr-1" />
                {formatTimeAgo(tx.timestamp)}
              </span>
              {ledgerBlock && (
                <span className="flex items-center gap-0.5 text-green-500 font-medium">
                  <ShieldCheck className="w-3 h-3" /> Verified
                </span>
              )}
            </div>
            {/* Points Refunded pill — for reward rejections */}
            {isRefund && (
              <span className={`inline-flex items-center gap-1 mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                isDark ? "bg-blue-900/30 text-blue-400" : "bg-blue-50 text-blue-700"
              }`}><RotateCcw className="w-2.5 h-2.5" /> Points Refunded</span>
            )}
            {/* Points Refunded pill — for user-cancelled redemptions */}
            {isCancelledRedemption && (
              <span className={`inline-flex items-center gap-1 mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                isDark ? "bg-blue-900/30 text-blue-400" : "bg-blue-50 text-blue-700"
              }`}><RotateCcw className="w-2.5 h-2.5" /> Points Refunded</span>
            )}
            {/* Rejection reason for submission rejections */}
            {isSubmissionRejected && tx.rejectionReason && (
              <p className={`text-[10px] mt-0.5 truncate ${isDark ? "text-red-400" : "text-red-500"}`}>
                Reason: {tx.rejectionReason}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderDesktopTransaction = (tx) => {
    const isEarned = tx._type === "earned";
    const isRefund = tx._type === "refund";
    const isSubmissionRejected = tx._type === "submission_rejected";
    const isSubmissionCancelled = tx._type === "submission_cancelled";
    const isCancelledRedemption = tx._type === "cancelled_redemption";
    const amount = Math.abs(tx.points || 0);
    const cat = tx.category || (isEarned ? "recycling" : (isRefund || isCancelledRedemption) ? "refund" : "recycling");
    const ledgerBlock = ledgerMap[tx.id];

    const pointColor = (isRefund || isCancelledRedemption)
      ? isDark ? "text-blue-400" : "text-blue-600"
      : (isSubmissionRejected || isSubmissionCancelled)
        ? isDark ? "text-gray-400" : "text-gray-500"
        : isEarned
          ? isDark ? "text-green-400" : "text-green-600"
          : isDark ? "text-red-400" : "text-red-600";

    const pointPrefix = (isRefund || isCancelledRedemption) ? "+" : isEarned ? "+" : "";

    const typeLabel = isRefund
      ? "Rejected"
      : isCancelledRedemption
        ? "Cancelled"
        : isSubmissionRejected
          ? "Submission Rejected"
          : isSubmissionCancelled
            ? "Submission Cancelled"
            : isEarned
              ? "Earned"
              : "Redeemed";

    const TypeIcon = (isRefund || isCancelledRedemption) ? RotateCcw
      : (isSubmissionRejected || isSubmissionCancelled) ? XCircle
      : isEarned ? TrendingUp : TrendingDown;

    const typeBg = isRefund
      ? isDark ? "bg-orange-900/30 text-orange-300 border border-orange-700/50" : "bg-orange-100 text-orange-800"
      : isCancelledRedemption
        ? isDark ? "bg-blue-900/30 text-blue-300 border border-blue-700/50" : "bg-blue-100 text-blue-800"
        : isSubmissionRejected
          ? isDark ? "bg-red-900/30 text-red-300 border border-red-700/50" : "bg-red-100 text-red-800"
          : isSubmissionCancelled
            ? isDark ? "bg-gray-700/50 text-gray-300 border border-gray-600/50" : "bg-gray-100 text-gray-700"
            : isEarned
              ? isDark ? "bg-green-900/30 text-green-300 border border-green-700/50" : "bg-green-100 text-green-800"
              : isDark ? "bg-red-900/30 text-red-300 border border-red-700/50" : "bg-red-100 text-red-800";

    const rowAccent = isRefund
      ? "border-l-4 border-l-orange-500"
      : isCancelledRedemption
        ? "border-l-4 border-l-blue-500"
        : isSubmissionRejected
          ? "border-l-4 border-l-red-500"
          : isSubmissionCancelled
            ? "border-l-4 border-l-gray-400"
            : isEarned
              ? "border-l-4 border-l-green-500"
              : "border-l-4 border-l-red-400";

    return (
      <tr
        key={tx.id}
        onClick={() => handleTxClick(tx)}
        className={`border-b cursor-pointer ${rowAccent} ${
          isDark
            ? "border-gray-700 hover:bg-gray-800/60"
            : "border-gray-200 hover:bg-gray-50"
        } transition-colors group`}
      >
        <td className="px-6 py-4">
          <div className="flex items-center space-x-3">
            <div className={`${categoryColors[cat] || categoryColors.default} w-10 h-10 rounded-lg flex items-center justify-center`}>
              {categoryIcons[cat] || categoryIcons.default}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className={`font-medium ${isDark ? "text-gray-200" : "text-gray-900"}`}>
                  {tx.description}
                </p>
                {ledgerBlock && (
                  <ShieldCheck className="w-4 h-4 text-green-500 opacity-70 group-hover:opacity-100 transition-opacity" />
                )}
              </div>
              {/* "Points Refunded" pill — reward rejections & user-cancelled redemptions */}
              {(isRefund || isCancelledRedemption) && (
                <span className={`inline-flex items-center gap-1 mt-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                  isDark ? "bg-blue-900/30 text-blue-400" : "bg-blue-50 text-blue-600"
                }`}><RotateCcw className="w-2.5 h-2.5" /> Points Refunded</span>
              )}
              {/* Rejection reason for submission rejections */}
              {isSubmissionRejected && tx.rejectionReason && (
                <p className={`text-xs mt-0.5 ${isDark ? "text-red-400" : "text-red-500"}`}>
                  Reason: {tx.rejectionReason}
                </p>
              )}
              {!isRefund && !isSubmissionRejected && !isCancelledRedemption && !isSubmissionCancelled && (
                <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </p>
              )}
            </div>
          </div>
        </td>
        <td className={`px-6 py-4 text-sm ${isDark ? "text-gray-300" : "text-gray-600"}`}>
          <div className="flex items-center">
            <Calendar className="w-4 h-4 mr-2" />
            {tx.timestamp.toLocaleDateString()}
          </div>
        </td>
        <td className={`px-6 py-4 text-sm ${isDark ? "text-gray-300" : "text-gray-600"}`}>
          <div className="flex items-center">
            {ledgerBlock ? (
              <div className={`px-2.5 py-1 rounded-md text-xs font-bold border flex items-center gap-1.5 shadow-sm ${
                isDark ? "bg-green-900/20 border-green-800 text-green-400" : "bg-green-50 border-green-200 text-green-700"
              }`}>
                <ShieldCheck className="w-3.5 h-3.5" /> Verified
              </div>
            ) : (
              <div className="flex items-center opacity-50" title="Pending Verification">
                <Clock className="w-4 h-4 mr-2" />
                {formatTimeAgo(tx.timestamp)}
              </div>
            )}
          </div>
        </td>
        <td className="px-6 py-4">
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${typeBg}`}>
            <TypeIcon className="w-4 h-4 mr-1.5" />
            {typeLabel}
          </span>
        </td>
        <td className="px-6 py-4 text-right">
          <span className={`text-lg font-bold ${pointColor}`}>
            {pointPrefix}{amount}
          </span>
          <div className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>points</div>
        </td>
      </tr>
    );
  };

  if (loadingUserData) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center px-4 ${
        isDark ? "bg-gray-900" : "bg-gradient-to-br from-green-50 via-teal-50 to-blue-50"
      }`}>
        <Loader2 className={`animate-spin w-8 h-8 mb-4 ${isDark ? "text-green-400" : "text-green-600"}`} />
        <p className={`text-base font-medium ${isDark ? "text-green-400" : "text-green-700"}`}>
          Loading secure transactions...
        </p>
      </div>
    );
  }

  const TABS = [
    { key: "all", label: "All" },
    { key: "earned", label: "Earned" },
    { key: "redeemed", label: "Redeemed" },
    { key: "refunded", label: "Refunded" },
  ];

  return (
    <div className={`min-h-screen ${
      isDark
        ? "bg-gray-900 text-gray-200"
        : "bg-gradient-to-br from-green-50 via-teal-50 to-blue-50 text-gray-900"
    }`}>
      {/* Blockchain Verification Modal */}
      <BlockDetailModal 
        visible={showBlockModal} 
        block={selectedBlock} 
        onClose={() => setShowBlockModal(false)} 
      />

      {/* Transaction Detail Modal */}
      <TransactionDetailModal
        tx={selectedTx}
        visible={showTxDetail}
        onClose={() => setShowTxDetail(false)}
        ledgerBlock={selectedTx ? ledgerMap[selectedTx.id] : null}
        isDark={isDark}
      />

      {/* Mobile Layout */}
      <div className="lg:hidden">
        {isPWA && (
          <div className={`sticky top-0 z-50 px-4 py-3 backdrop-blur-sm ${
            isDark ? "bg-gray-900/95" : "bg-white/95"
          }`}>
            <div className="flex items-center justify-between">
              <h1 className={`text-lg font-semibold ${isDark ? "text-gray-100" : "text-gray-900"}`}>
                Transactions
              </h1>
              <button
                onClick={handleRefresh}
                disabled={loadingTransactions}
                className={`p-2 rounded-lg transition-colors ${isDark ? "hover:bg-gray-800" : "hover:bg-gray-100"}`}
              >
                <RefreshCw className={`w-5 h-5 ${loadingTransactions ? 'animate-spin' : ''} ${isDark ? "text-gray-300" : "text-gray-600"}`} />
              </button>
            </div>
          </div>
        )}
        
        <div className="max-w-md mx-auto px-4 py-4">
          {/* Welcome Section */}
          <div className={`rounded-xl p-6 mb-6 ${isDark ? "bg-gray-800/50" : "bg-white/70"}`}>
            <div className="text-center mb-4">
              <h1 className={`text-xl font-bold mb-1 ${isDark ? "text-gray-100" : "text-gray-900"}`}>
                {`${getGreeting()}, ${userName}! 🌟`}
              </h1>
              <p className={`${isDark ? "text-gray-400" : "text-gray-600"} text-sm`}>
                Your verified eco-friendly journey
              </p>
            </div>
            <div className="flex items-center justify-center">
              <button
                onClick={() => setShowPoints(!showPoints)}
                className={`p-2 rounded-lg transition-colors mr-3 ${isDark ? "hover:bg-gray-700" : "hover:bg-gray-100"}`}
              >
                {showPoints ? <Eye className={`w-4 h-4 ${isDark ? "text-gray-300" : "text-gray-600"}`} /> : <EyeOff className={`w-4 h-4 ${isDark ? "text-gray-300" : "text-gray-600"}`} />}
              </button>
              <div className="flex items-center space-x-2 bg-gradient-to-r from-yellow-400 to-orange-400 rounded-xl px-4 py-3 text-white shadow-lg shadow-orange-500/20">
                <Coins className="w-5 h-5" />
                <div>
                  <p className="text-xs opacity-90">Available Points</p>
                  <p className="text-lg font-bold">{showPoints ? points.toLocaleString() : "•••••"}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile Stats */}
          <div className="grid grid-cols-3 gap-2 mb-6">
            <div className="bg-gradient-to-br from-green-400 to-green-600 rounded-xl p-3 text-white shadow-md">
              <TrendingUp className="w-4 h-4 mx-auto mb-1" />
              <p className="text-[10px] text-green-100 mb-0.5 text-center">Earned</p>
              <p className="text-lg font-bold text-center">{totalEarned.toLocaleString()}</p>
            </div>
            <div className="bg-gradient-to-br from-red-400 to-red-600 rounded-xl p-3 text-white shadow-md">
              <TrendingDown className="w-4 h-4 mx-auto mb-1" />
              <p className="text-[10px] text-red-100 mb-0.5 text-center">Redeemed</p>
              <p className="text-lg font-bold text-center">{totalSpent.toLocaleString()}</p>
            </div>
            <div className="bg-gradient-to-br from-blue-400 to-blue-600 rounded-xl p-3 text-white shadow-md">
              <RotateCcw className="w-4 h-4 mx-auto mb-1" />
              <p className="text-[10px] text-blue-100 mb-0.5 text-center">Refunded</p>
              <p className="text-lg font-bold text-center">{totalRefunded.toLocaleString()}</p>
            </div>
          </div>

          {/* Mobile Tab Bar */}
          <div className={`flex rounded-lg p-1 mb-4 ${isDark ? "bg-gray-800" : "bg-gray-100"}`}>
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 py-2 px-1 rounded-md text-xs font-medium transition-colors relative ${
                  activeTab === tab.key
                    ? tab.key === "refunded"
                      ? "bg-blue-600 text-white"
                      : "bg-green-600 text-white"
                    : isDark ? "text-gray-300" : "text-gray-700"
                }`}
              >
                {tab.label}
                {tab.badge > 0 && activeTab !== tab.key && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 text-[9px] font-bold rounded-full bg-blue-500 text-white flex items-center justify-center">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="space-y-3 mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search transactions..."
                className={`w-full pl-9 pr-4 py-2.5 rounded-lg border text-sm ${
                  isDark ? "bg-gray-800 border-gray-700 text-gray-200 placeholder-gray-400" : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
                } focus:outline-none focus:ring-2 focus:ring-green-500`}
              />
            </div>
            <div className="flex space-x-2">
              <div className="relative flex-1">
                <Calendar className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                  className={`w-full pl-8 pr-8 py-2.5 rounded-lg border text-sm appearance-none ${
                    isDark ? "bg-gray-800 border-gray-700 text-gray-200" : "bg-white border-gray-300 text-gray-900"
                  } focus:outline-none focus:ring-2 focus:ring-green-500`}
                >
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="week">7 Days</option>
                  <option value="month">30 Days</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              </div>
              <div className="relative flex-1">
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  className={`w-full pl-3 pr-8 py-2.5 rounded-lg border text-sm appearance-none ${
                    isDark ? "bg-gray-800 border-gray-700 text-gray-200" : "bg-white border-gray-300 text-gray-900"
                  } focus:outline-none focus:ring-2 focus:ring-green-500`}
                >
                  <option value="desc">Newest</option>
                  <option value="asc">Oldest</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              </div>
            </div>
          </div>

          {/* Hint for clickable rows */}
          <p className={`text-xs mb-3 flex items-center gap-1 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
            <Info className="w-3 h-3" /> Tap any transaction to see full details
          </p>

          {/* Mobile List */}
          <div role="list" className="space-y-3">
            {loadingTransactions ? (
              <div className="text-center py-8">
                <Loader2 className={`animate-spin w-8 h-8 mx-auto mb-3 ${isDark ? "text-green-400" : "text-green-600"}`} />
                <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>Verifying ledger...</p>
              </div>
            ) : filteredTransactions.length === 0 ? (
              <div className="text-center py-8">
                <Coins className={`w-12 h-12 mx-auto mb-3 ${isDark ? "text-gray-600" : "text-gray-400"}`} />
                <h3 className={`text-base font-medium mb-1 ${isDark ? "text-gray-300" : "text-gray-900"}`}>No transactions found</h3>
                <button onClick={handleRefresh} className="mt-3 inline-flex items-center px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors">
                  <RefreshCw className="w-4 h-4 mr-2" /> Refresh
                </button>
              </div>
            ) : (
              filteredTransactions.map((item) => renderMobileTransaction(item))
            )}
          </div>
        </div>
      </div>

      {/* Desktop Layout */}
      <div className="hidden lg:block">
        <div className="max-w-7xl mx-auto px-6 py-8">
          {/* Desktop Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className={`text-2xl font-bold ${isDark ? "text-gray-100" : "text-gray-900"}`}>
                Transaction History
              </h1>
              <p className={`text-sm mt-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                Powered by EcoSort Blockchain Ledger · Click any row for full details
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={handleRefresh}
                disabled={loadingTransactions}
                className={`p-2 rounded-lg transition-colors ${isDark ? "hover:bg-gray-700" : "hover:bg-gray-100"}`}
                title="Refresh Ledger"
              >
                <RefreshCw className={`w-5 h-5 ${loadingTransactions ? 'animate-spin' : ''} ${isDark ? "text-gray-300" : "text-gray-600"}`} />
              </button>
              <button
                onClick={() => setShowPoints(!showPoints)}
                className={`p-2 rounded-lg transition-colors ${isDark ? "hover:bg-gray-700" : "hover:bg-gray-100"}`}
              >
                {showPoints ? <Eye className={`w-5 h-5 ${isDark ? "text-gray-300" : "text-gray-600"}`} /> : <EyeOff className={`w-5 h-5 ${isDark ? "text-gray-300" : "text-gray-600"}`} />}
              </button>
              <div className="flex items-center space-x-3 bg-gradient-to-r from-yellow-400 to-orange-400 rounded-xl px-6 py-4 text-white shadow-lg shadow-orange-500/20">
                <Coins className="w-6 h-6" />
                <div>
                  <p className="text-sm opacity-90">Available Points</p>
                  <p className="text-2xl font-bold">{showPoints ? points.toLocaleString() : "•••••"}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Desktop Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-gradient-to-br from-green-400 to-green-600 rounded-2xl p-6 text-white shadow-lg">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center mb-4">
                <TrendingUp className="w-6 h-6" />
              </div>
              <p className="text-green-100 text-sm mb-1">Total Points Earned</p>
              <p className="text-3xl font-bold">{totalEarned.toLocaleString()}</p>
            </div>
            <div className="bg-gradient-to-br from-red-400 to-red-600 rounded-2xl p-6 text-white shadow-lg">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center mb-4">
                <TrendingDown className="w-6 h-6" />
              </div>
              <p className="text-red-100 text-sm mb-1">Points Redeemed</p>
              <p className="text-3xl font-bold">{totalSpent.toLocaleString()}</p>
            </div>
            <div className="bg-gradient-to-br from-blue-400 to-blue-600 rounded-2xl p-6 text-white shadow-lg">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center mb-4">
                <RotateCcw className="w-6 h-6" />
              </div>
              <p className="text-blue-100 text-sm mb-1">Points Refunded</p>
              <p className="text-3xl font-bold">{totalRefunded.toLocaleString()}</p>
            </div>
            <div className={`rounded-2xl p-6 border ${isDark ? "bg-gray-800/50 border-gray-700" : "bg-white/70 border-gray-200"}`}>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${isDark ? "bg-gray-700" : "bg-gray-100"}`}>
                <Coins className={`w-6 h-6 ${isDark ? "text-yellow-400" : "text-yellow-600"}`} />
              </div>
              <p className={`text-sm mb-1 ${isDark ? "text-gray-400" : "text-gray-600"}`}>Current Balance</p>
              <p className={`text-3xl font-bold ${isDark ? "text-gray-100" : "text-gray-900"}`}>{points.toLocaleString()}</p>
            </div>
          </div>

          {/* Controls Row */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0 mb-8">
            <div className={`inline-flex rounded-xl p-1 ${isDark ? "bg-gray-800" : "bg-gray-100"}`}>
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-colors relative ${
                    activeTab === tab.key
                      ? tab.key === "refunded"
                        ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                        : "bg-green-600 text-white shadow-lg shadow-green-600/30"
                      : isDark ? "text-gray-300 hover:text-white" : "text-gray-700 hover:text-gray-900"
                  }`}
                >
                  {tab.key === "all" ? "All Transactions" : tab.key === "earned" ? "Points Earned" : tab.key === "redeemed" ? "Points Redeemed" : "Points Refunded"}
                  {tab.badge > 0 && activeTab !== tab.key && (
                    <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500 text-white">
                      {tab.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search transactions..."
                  className={`pl-10 pr-4 py-2.5 rounded-xl border text-sm w-64 ${
                    isDark ? "bg-gray-800 border-gray-700 text-gray-200 placeholder-gray-400" : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
                  } focus:outline-none focus:ring-2 focus:ring-green-500`}
                />
              </div>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                  className={`pl-10 pr-8 py-2.5 rounded-xl border text-sm appearance-none w-40 ${
                    isDark ? "bg-gray-800 border-gray-700 text-gray-200" : "bg-white border-gray-300 text-gray-900"
                  } focus:outline-none focus:ring-2 focus:ring-green-500`}
                >
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="week">Last 7 Days</option>
                  <option value="month">Last Month</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              </div>
              <div className="relative">
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  className={`pl-4 pr-8 py-2.5 rounded-xl border text-sm appearance-none w-32 ${
                    isDark ? "bg-gray-800 border-gray-700 text-gray-200" : "bg-white border-gray-300 text-gray-900"
                  } focus:outline-none focus:ring-2 focus:ring-green-500`}
                >
                  <option value="desc">Newest</option>
                  <option value="asc">Oldest</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              </div>
            </div>
          </div>

          {/* Desktop Table */}
          <div className={`rounded-2xl overflow-hidden shadow-sm border ${isDark ? "bg-gray-800/50 border-gray-700" : "bg-white border-gray-200"}`}>
            {loadingTransactions ? (
              <div className="text-center py-16">
                <Loader2 className={`animate-spin w-12 h-12 mx-auto mb-6 ${isDark ? "text-green-400" : "text-green-600"}`} />
                <p className={`text-lg ${isDark ? "text-gray-300" : "text-gray-600"}`}>Syncing blockchain ledger...</p>
              </div>
            ) : filteredTransactions.length === 0 ? (
              <div className="text-center py-16">
                <Coins className={`w-16 h-16 mx-auto mb-6 ${isDark ? "text-gray-600" : "text-gray-400"}`} />
                <h3 className={`text-xl font-medium mb-3 ${isDark ? "text-gray-300" : "text-gray-900"}`}>No transactions found</h3>
                <button onClick={handleRefresh} className="inline-flex items-center px-6 py-3 rounded-xl bg-green-600 text-white font-medium hover:bg-green-700 transition-colors">
                  <RefreshCw className="w-5 h-5 mr-2" /> Refresh Ledger
                </button>
              </div>
            ) : (
              <table className="w-full">
                <thead className={`${isDark ? "bg-gray-700/50" : "bg-gray-50"}`}>
                  <tr>
                    <th className={`px-6 py-4 text-left text-sm font-semibold ${isDark ? "text-gray-200" : "text-gray-900"}`}>Description</th>
                    <th className={`px-6 py-4 text-left text-sm font-semibold ${isDark ? "text-gray-200" : "text-gray-900"}`}>Date</th>
                    <th className={`px-6 py-4 text-left text-sm font-semibold ${isDark ? "text-gray-200" : "text-gray-900"}`}>Status</th>
                    <th className={`px-6 py-4 text-left text-sm font-semibold ${isDark ? "text-gray-200" : "text-gray-900"}`}>Type</th>
                    <th className={`px-6 py-4 text-right text-sm font-semibold ${isDark ? "text-gray-200" : "text-gray-900"}`}>Points</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((item) => renderDesktopTransaction(item))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className={`fixed bottom-4 right-4 max-w-md rounded-xl p-4 flex items-center space-x-3 shadow-lg border z-50 ${
          isDark ? "bg-red-900/90 border-red-700 backdrop-blur-sm" : "bg-red-50 border-red-200"
        }`} role="alert">
          <AlertTriangle className={`w-5 h-5 flex-shrink-0 ${isDark ? "text-red-400" : "text-red-600"}`} />
          <span className={`font-medium ${isDark ? "text-red-300" : "text-red-700"}`}>{error}</span>
        </div>
      )}
    </div>
  );
}