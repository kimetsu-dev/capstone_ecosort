import { useEffect, useState } from "react";
import { db, auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  onSnapshot, 
  query, 
  where,
  orderBy,
  doc,
  updateDoc,
  deleteDoc
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { useUser } from "../contexts/UserContext";
import { useTheme } from "../contexts/ThemeContext";
import {
  Recycle,
  Scale,
  Award,
  CheckCircle,
  AlertCircle,
  Info,
  Loader2,
  ArrowRight,
  Trophy,
  Calculator,
  X,
  ArrowLeft,
  Leaf,
  Target,
  Sparkles,
  TrendingUp,
  Plus,
  Trash2,
  Layers,
  History,
  Clock,
  FileText,
  XCircle,
  MapPin,
  Users,
  ShieldCheck,
} from "lucide-react";

// Import the Ledger Service
import { addToLedger } from '../utils/ledgerService';

function Toast({ visible, message, type, onClose }) {
  if (!visible) return null;

  const configs = {
    success: {
      bg: "bg-green-600",
      icon: CheckCircle,
      iconColor: "text-green-100",
    },
    error: {
      bg: "bg-red-600",
      icon: AlertCircle,
      iconColor: "text-red-100",
    },
    info: {
      bg: "bg-blue-600",
      icon: Info,
      iconColor: "text-blue-100",
    },
  };

  const config = configs[type] || configs.info;
  const Icon = config.icon;

  return (
    <div className="fixed top-4 left-4 right-4 sm:left-auto sm:right-4 sm:top-6 z-50 animate-slide-in">
      <div
        className={`${config.bg} text-white px-4 py-3 sm:px-6 sm:py-4 rounded-xl shadow-xl flex items-center space-x-3 max-w-sm mx-auto sm:mx-0`}
      >
        <Icon className={`${config.iconColor} w-5 h-5 flex-shrink-0`} />
        <span className="font-medium text-sm sm:text-base flex-1">{message}</span>
        <button
          onClick={onClose}
          className="text-white/80 hover:text-white transition-colors flex-shrink-0"
          aria-label="Close notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function SubmitWaste() {
  const { user } = useUser();
  const { styles, isDark } = useTheme();
  
  // State vars
  const [wasteTypes, setWasteTypes] = useState([]);
  
  // Array of entries: { id: timestamp, wasteType: string, weight: string }
  const [entries, setEntries] = useState([]);
  
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: "", type: "info" });
  const [showPointsReference, setShowPointsReference] = useState(false);

  // Stable uid — resolved after Firebase auth rehydrates (never races)
  const [stableUid, setStableUid] = useState(null);

  // History & Deletion State
  const [showHistory, setShowHistory] = useState(false);
  const [userSubmissions, setUserSubmissions] = useState([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState({ show: false, id: null });
  const [deleting, setDeleting] = useState(false);

  // New Confirmation States
  const [confirmRemoveItem, setConfirmRemoveItem] = useState({ show: false, id: null });
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  // History filter & detail modal
  const [historyFilter, setHistoryFilter] = useState('all');
  // Store only the submission ID — modal always derives live data from userSubmissions
  const [selectedSubmissionId, setSelectedSubmissionId] = useState(null);
  const selectedSubmission = userSubmissions.find(s => s.id === selectedSubmissionId) ?? null;
  const setSelectedSubmission = (subOrNull) =>
    setSelectedSubmissionId(subOrNull ? subOrNull.id : null);

  // (Auto-fallback removed: each tab stays open even when empty so users
  //  can see "No pending submissions" rather than being silently redirected.)

  // --- PREVENT BACKGROUND SCROLLING WHEN MODALS ARE OPEN ---
  // ── Scroll lock: prevents background page from scrolling under any modal/overlay ──
  // Uses position:fixed trick which works on iOS Safari, Android WebView, and desktop.
  useEffect(() => {
    const isModalOpen =
      showHistory ||
      selectedSubmissionId !== null ||
      confirmDelete.show ||
      confirmRemoveItem.show ||
      confirmSubmit;

    if (isModalOpen) {
      // Capture current scroll position before locking
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.overflow = 'hidden';
    } else {
      // Restore scroll position when modal closes
      const scrollY = document.body.style.top;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.overflow = '';
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0', 10) * -1);
      }
    }

    return () => {
      const scrollY = document.body.style.top;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.overflow = '';
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0', 10) * -1);
      }
    };
  }, [showHistory, selectedSubmissionId, confirmDelete.show, confirmRemoveItem.show, confirmSubmit]);

  // Wait for Firebase to finish rehydrating the session before doing anything
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setStableUid(u ? u.uid : null);
    });
    return () => unsub();
  }, []);

  // Fetch waste types real-time
  useEffect(() => {
    if (!stableUid) return;

    const unsubscribe = onSnapshot(
      collection(db, "waste_types"),
      (snapshot) => {
        const types = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.name,
            pointsPerKilo: data.pointsPerKilo ?? 0,
          };
        });
        setWasteTypes(types);

        setEntries((prevEntries) => {
          if (prevEntries.length === 0 && types.length > 0) {
            return [{ id: Date.now(), wasteType: types[0].name, weight: "" }];
          }
          return prevEntries;
        });
      },
      (error) => {
        console.error("Failed to load waste types:", error);
      }
    );
    
    return () => unsubscribe(); 
  }, [stableUid]); 

  // Fetch User Submissions (History) real-time
  useEffect(() => {
    if (!stableUid) return;

    const toMs = (ts) => {
      if (!ts) return 0;
      if (typeof ts.toMillis === "function") return ts.toMillis();
      if (typeof ts.seconds === "number") return ts.seconds * 1000;
      return 0;
    };

    // Use an object so the cleanup closure always reads the latest value,
    // even when the fallback path replaces the original listener mid-flight.
    const unsubRef = { current: null };

    const attachFallback = () => {
      const qFallback = query(
        collection(db, "waste_submissions"),
        where("userId", "==", stableUid)
      );
      unsubRef.current = onSnapshot(
        qFallback,
        { includeMetadataChanges: false },
        (snapshot) => {
          const subs = snapshot.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => toMs(b.submittedAt) - toMs(a.submittedAt));
          setUserSubmissions(subs);
          setSubmissionsLoading(false);
        },
        (err2) => {
          console.error("Fallback history listener error:", err2);
          setSubmissionsLoading(false);
        }
      );
    };

    // Primary listener — requires composite index on (userId, submittedAt desc)
    const qPrimary = query(
      collection(db, "waste_submissions"),
      where("userId", "==", stableUid),
      orderBy("submittedAt", "desc")
    );

    unsubRef.current = onSnapshot(
      qPrimary,
      { includeMetadataChanges: false },
      (snapshot) => {
        const subs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setUserSubmissions(subs);
        setSubmissionsLoading(false);
      },
      (err) => {
        console.error("History listener error (switching to fallback):", err);
        // Cancel the failed primary before attaching fallback
        if (unsubRef.current) {
          unsubRef.current();
          unsubRef.current = null;
        }
        attachFallback();
      }
    );

    return () => {
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
    };
  }, [stableUid]);

  // Show toast helper
  const showToast = (message, type = "info") => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast({ visible: false, message: "", type: "info" }), 4000);
  };

  const closeToast = () => {
    setToast({ visible: false, message: "", type: "info" });
  };

  // --- ENTRY MANAGEMENT ---

  const handleAddEntry = () => {
    if (wasteTypes.length === 0) return;
    setEntries([
      ...entries,
      { id: Date.now(), wasteType: wasteTypes[0].name, weight: "" }
    ]);
  };

  const handleRemoveEntry = (id) => {
    if (entries.length <= 1) {
      showToast("You must have at least one item.", "info");
      return;
    }
    setConfirmRemoveItem({ show: true, id });
  };

  const executeRemoveEntry = () => {
    if (!confirmRemoveItem.id) return;
    setEntries(entries.filter(entry => entry.id !== confirmRemoveItem.id));
    setConfirmRemoveItem({ show: false, id: null });
  };

  const handleEntryChange = (id, field, value) => {
    setEntries(entries.map(entry => 
      entry.id === id ? { ...entry, [field]: value } : entry
    ));
  };

  // --- CALCULATIONS ---

  const getPointsRate = (typeName) => {
    const wt = wasteTypes.find(t => t.name === typeName);
    return wt ? wt.pointsPerKilo : 0;
  };

  const totals = entries.reduce((acc, entry) => {
    const weightNum = parseFloat(entry.weight);
    if (!isNaN(weightNum) && weightNum > 0) {
      const points = Math.round(weightNum * getPointsRate(entry.wasteType));
      return {
        weight: acc.weight + weightNum,
        points: acc.points + points
      };
    }
    return acc;
  }, { weight: 0, points: 0 });

  const isMixedBundle = entries.length > 1;

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!user) {
      showToast("You need to be logged in to submit waste.", "error");
      return;
    }

    const invalidEntry = entries.find(ent => !ent.wasteType || isNaN(parseFloat(ent.weight)) || parseFloat(ent.weight) <= 0);
    if (invalidEntry) {
      showToast("Please ensure all items have valid positive weights.", "error");
      return;
    }

    setConfirmSubmit(true);
  };

  const executeSubmit = async () => {
    setConfirmSubmit(false);
    setLoading(true);
    
    try {
      let payload = {
        userId: stableUid || user?.uid,
        userEmail: user?.email,
        status: "pending",
        submittedAt: serverTimestamp(),
      };

      if (entries.length === 1) {
        const singleItem = entries[0];
        const weight = parseFloat(singleItem.weight);
        const points = Math.round(weight * getPointsRate(singleItem.wasteType));
        
        payload = {
          ...payload,
          type: singleItem.wasteType,
          weight: weight,
          points: points
        };
      } else {
        const itemsPayload = entries.map(ent => ({
          wasteType: ent.wasteType,
          weight: parseFloat(ent.weight),
          points: Math.round(parseFloat(ent.weight) * getPointsRate(ent.wasteType))
        }));

        payload = {
          ...payload,
          type: "Mixed Bundle",
          items: itemsPayload,
          totalWeight: totals.weight,
          points: totals.points
        };
      }

      const docRef = await addDoc(collection(db, "waste_submissions"), payload);

      await addToLedger(
        stableUid || user?.uid, 
        "WASTE_SUBMIT", 
        payload.points,
        { 
          summary: payload.type, 
          weight: payload.weight || payload.totalWeight,
          items: payload.items || null,
          firestoreId: docRef.id,
          status: 'pending_approval'
        }
      );

      showToast(
        entries.length > 1 
          ? "Mixed bundle submitted successfully!" 
          : "Waste submission successful!", 
        "success"
      );
      
      setEntries([{ id: Date.now(), wasteType: wasteTypes[0]?.name || "", weight: "" }]);
      
    } catch (err) {
      console.error("Error:", err);
      showToast("Submission failed. Please try again.", "error");
    } finally {
      setLoading(false);
    }
  };

  const confirmDeleteSubmission = async () => {
    if (!confirmDelete.id) return;
    setDeleting(true);
    try {
      await updateDoc(doc(db, "waste_submissions", confirmDelete.id), {
        status: "cancelled",
        cancelledAt: serverTimestamp(),
      });
      showToast("Submission cancelled successfully.", "success");
      setConfirmDelete({ show: false, id: null });
    } catch (error) {
      console.error("Error cancelling submission:", error);
      showToast("Failed to cancel submission.", "error");
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return "Just now";
    return timestamp.toDate ? timestamp.toDate().toLocaleDateString() + " " + timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date(timestamp).toLocaleDateString();
  };

  const StatusBadge = ({ status }) => {
    const config = {
      pending: { color: "text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400", icon: Clock, label: "Pending" },
      confirmed: { color: "text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400", icon: CheckCircle, label: "Confirmed" },
      rejected: { color: "text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400", icon: XCircle, label: "Rejected" },
      cancelled: { color: "text-gray-600 bg-gray-100 dark:bg-gray-800 dark:text-gray-400", icon: AlertCircle, label: "Cancelled" },
    };
    const current = config[status] || config.pending;
    const Icon = current.icon;

    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${current.color}`}>
        <Icon className="w-3.5 h-3.5" />
        {current.label}
      </span>
    );
  };

  return (
    <>
      <div className={`App min-h-screen transition-all duration-300 ${styles.backgroundGradient}`}>
         <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="max-w-7xl mx-auto">

            <div className="text-center mb-4 sm:mb-6 relative">
              <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full mb-4 sm:mb-6 shadow-xl">
                <Recycle className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
              </div>
              <h1 className={`text-3xl sm:text-4xl lg:text-5xl font-bold mb-2 sm:mb-4 ${styles.textPrimary}`}>
                Submit Waste
              </h1>
              <p className={`text-base sm:text-lg lg:text-xl max-w-2xl mx-auto ${styles.textSecondary}`}>
                Transform your recyclables into valuable points and make a positive environmental impact. {isMixedBundle ? "Bundle multiple items together!" : "Submit single items or create bundles."}
              </p>

              <div className={`mt-5 max-w-2xl mx-auto flex items-start gap-3 px-4 py-3.5 rounded-2xl border text-left ${
                isDark
                  ? "bg-amber-900/25 border-amber-700/60 text-amber-300"
                  : "bg-amber-50 border-amber-300 text-amber-800"
              }`}>
                <MapPin className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-sm sm:text-base leading-snug">
                    In-person submission required — Barangay Hall only.
                  </p>
                  <p className={`text-xs sm:text-sm mt-0.5 ${isDark ? "text-amber-400/80" : "text-amber-700"}`}>
                    Please bring your recyclable materials to the Barangay Hall. A staff member will verify your waste type and weight before you submit this form.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 sm:gap-8">
              <div className="xl:col-span-2">
                <form
                  onSubmit={handleSubmit}
                  className={`${styles.cardBackground} ${styles.backdropBlur} rounded-2xl sm:rounded-3xl shadow-xl p-6 sm:p-8 lg:p-10 border ${styles.cardBorder}`}
                >
                  <div className="space-y-6 mb-8">
                    <div className="flex items-center justify-between mb-4">
                      <label className={`flex items-center text-lg sm:text-xl font-semibold ${styles.textPrimary}`}>
                        {isMixedBundle ? (
                          <>
                            <Layers className="w-5 h-5 sm:w-6 sm:h-6 mr-2 sm:mr-3 text-green-600" />
                            Mixed Bundle
                          </>
                        ) : (
                          <>
                            <Recycle className="w-5 h-5 sm:w-6 sm:h-6 mr-2 sm:mr-3 text-green-600" />
                            Waste Item
                          </>
                        )}
                      </label>
                      <span className={`text-sm ${styles.textSecondary}`}>
                        {entries.length} {entries.length === 1 ? 'item' : 'items'}
                      </span>
                    </div>

                    {entries.map((entry, index) => {
                      const currentRate = getPointsRate(entry.wasteType);
                      const currentWeight = parseFloat(entry.weight);
                      const itemPoints = (!isNaN(currentWeight) && currentWeight > 0) 
                        ? Math.round(currentWeight * currentRate) 
                        : 0;

                      return (
                        <div 
                          key={entry.id} 
                          className={`relative p-4 rounded-xl border transition-all duration-300 animate-slide-down ${
                            isDark ? "bg-gray-800/50 border-gray-700" : "bg-gray-50 border-gray-200"
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row gap-4">
                            
                            <div className="flex-1">
                              <label className={`block text-xs font-medium mb-1.5 ${styles.textSecondary}`}>
                                Type
                              </label>
                              <select
                                value={entry.wasteType}
                                onChange={(e) => handleEntryChange(entry.id, "wasteType", e.target.value)}
                                disabled={loading}
                                className={`w-full p-3 rounded-lg border focus:ring-2 focus:ring-green-500 outline-none transition-colors ${
                                  isDark
                                    ? "bg-gray-900 border-gray-600 text-white"
                                    : "bg-white border-gray-300 text-gray-900"
                                }`}
                                required
                              >
                                {wasteTypes.map(({ id, name }) => (
                                  <option key={id} value={name}>
                                    {name.charAt(0).toUpperCase() + name.slice(1)}
                                  </option>
                                ))}
                              </select>
                              <div className={`text-xs mt-1.5 flex items-center ${isDark ? "text-green-400" : "text-green-600"}`}>
                                <Award className="w-3 h-3 mr-1" />
                                {currentRate} pts/kg
                              </div>
                            </div>

                            <div className="flex-1">
                              <label className={`block text-xs font-medium mb-1.5 ${styles.textSecondary}`}>
                                Weight (kg)
                              </label>
                              <div className="relative">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  value={entry.weight}
                                  onChange={(e) => handleEntryChange(entry.id, "weight", e.target.value)}
                                  placeholder="0.00"
                                  disabled={loading}
                                  className={`w-full p-3 rounded-lg border focus:ring-2 focus:ring-green-500 outline-none pr-10 ${
                                    isDark
                                      ? "bg-gray-900 border-gray-600 text-white"
                                      : "bg-white border-gray-300 text-gray-900"
                                  }`}
                                  required
                                />
                                <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-sm ${styles.textSecondary}`}>kg</span>
                              </div>
                            </div>

                            <div className={`flex items-center justify-between sm:justify-end sm:w-32 rounded-lg px-4 py-2 sm:py-0 ${
                              isDark ? "bg-green-900/20" : "bg-green-50"
                            }`}>
                              <span className="sm:hidden text-sm font-medium text-green-600">Est. Points:</span>
                              <div className="text-right">
                                <div className="text-lg font-bold text-green-600">{itemPoints}</div>
                                <div className="text-[10px] uppercase tracking-wider text-green-600/70 hidden sm:block">Points</div>
                              </div>
                            </div>

                            {isMixedBundle && (
                              <button
                                type="button"
                                onClick={() => handleRemoveEntry(entry.id)}
                                className="self-end sm:self-center p-2 rounded-lg transition-colors text-red-500 hover:bg-red-500/10"
                                title="Remove item"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    <button
                      type="button"
                      onClick={handleAddEntry}
                      disabled={loading}
                      className={`w-full py-3 border-2 border-dashed rounded-xl flex items-center justify-center gap-2 font-medium transition-all ${
                        isDark 
                          ? "border-gray-700 hover:border-green-500/50 hover:bg-gray-800 text-gray-400 hover:text-green-400" 
                          : "border-gray-300 hover:border-green-500/50 hover:bg-gray-50 text-gray-600 hover:text-green-600"
                      }`}
                    >
                      <Plus className="w-5 h-5" />
                      {isMixedBundle ? "Add Another Item to Bundle" : "Create Mixed Bundle (Add Item)"}
                    </button>
                  </div>

                  {isMixedBundle && totals.points > 0 && (
                    <div
                      className={`mb-6 sm:mb-8 rounded-xl sm:rounded-2xl p-4 sm:p-6 border shadow-inner ${
                        isDark
                          ? "bg-green-900/20 border-green-700/50 text-green-300"
                          : "bg-green-50 border-green-200 text-green-700"
                      } backdrop-blur-sm`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="flex items-center">
                          <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center mr-3 sm:mr-4 flex-shrink-0 ${
                            isDark ? "bg-green-800" : "bg-green-100"
                          }`}>
                            <Calculator className={`w-5 h-5 sm:w-6 sm:h-6 text-green-600`} />
                          </div>
                          <div>
                            <h3 className={`font-semibold text-base sm:text-lg`}>
                              Bundle Total
                            </h3>
                            <p className={`text-sm sm:text-base opacity-90`}>
                              {entries.length} items • {totals.weight.toFixed(2)} kg total
                            </p>
                          </div>
                        </div>
                        <div className="text-center sm:text-right">
                          <div className="text-3xl sm:text-4xl lg:text-5xl font-bold flex items-center justify-center sm:justify-end gap-2 text-green-600">
                            <Sparkles className="w-6 h-6 sm:w-8 sm:h-8 text-green-500" />
                            {totals.points}
                          </div>
                          <div className="text-sm sm:text-base font-medium text-green-600">total points</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {!isMixedBundle && totals.points > 0 && (
                    <div
                      className={`mb-6 sm:mb-8 rounded-xl p-4 border ${
                        isDark
                          ? "bg-green-900/20 border-green-700/50 text-green-300"
                          : "bg-green-50 border-green-200 text-green-700"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm opacity-90">Estimated Points</div>
                          <div className="text-2xl font-bold text-green-600 mt-1">{totals.points} pts</div>
                        </div>
                        <Trophy className="w-8 h-8 text-green-600 opacity-60" />
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading || totals.points === 0}
                    className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold py-4 sm:py-5 px-6 sm:px-8 rounded-xl sm:rounded-2xl shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center space-x-3 text-base sm:text-lg lg:text-xl"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin" />
                        <span>Preparing Submission...</span>
                      </>
                    ) : (
                      <>
                        <Trophy className="w-5 h-5 sm:w-6 sm:h-6" />
                        <span className="hidden sm:inline">
                          {isMixedBundle ? "Submit Bundle" : "Submit Waste"}
                        </span>
                        <span className="sm:hidden">Submit ({totals.points} pts)</span>
                        <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
                      </>
                    )}
                  </button>
                </form>

                <div
                  className={`mt-6 rounded-xl sm:rounded-2xl p-4 sm:p-6 border ${
                    isDark ? "bg-blue-900/30 border-blue-700/50 text-blue-300" : "bg-blue-50 border-blue-200 text-blue-800"
                  } backdrop-blur-sm`}
                >
                  <div className="flex items-start gap-3 sm:gap-4 mb-4">
                    <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      isDark ? "bg-blue-800" : "bg-blue-100"
                    }`}>
                      <Users className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
                    </div>
                    <h4 className="font-semibold text-base sm:text-lg">
                      How the In-Person Process Works
                    </h4>
                  </div>
                  <ol className="space-y-3">
                    {[
                      { n: "1", text: "Bring your recyclables to the Barangay Hall during collection hours." },
                      { n: "2", text: "A barangay staff member will weigh and inspect your materials." },
                      { n: "3", text: "Fill out this form together — staff enters the verified waste type and weight." },
                      { n: "4", text: "Submit. An admin will confirm the entry and award your eco-points." },
                    ].map(({ n, text }) => (
                      <li key={n} className="flex items-start gap-3 text-sm sm:text-base leading-relaxed">
                        <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          isDark ? "bg-blue-800 text-blue-200" : "bg-blue-200 text-blue-800"
                        }`}>
                          {n}
                        </span>
                        {text}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>

              <div className="space-y-6">
                
                <div className={`${styles.cardBackground} ${styles.backdropBlur} rounded-xl sm:rounded-2xl shadow-lg p-4 sm:p-6 border ${styles.cardBorder} relative overflow-hidden`}>
                  <div className="relative z-10">
                    <h3 className={`text-base sm:text-lg font-semibold mb-4 ${styles.textPrimary} flex items-center`}>
                      <History className="w-5 h-5 mr-2 sm:mr-3 text-green-600" />
                      My Submissions
                    </h3>
                    
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-sm">
                        {submissionsLoading ? (
                          <div className={`h-8 w-10 rounded animate-pulse mb-1 ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
                        ) : (
                          <span className={`block text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                            {userSubmissions.filter(s => s.status === 'pending').length}
                          </span>
                        )}
                        <span className={`${styles.textSecondary}`}>Pending Approval</span>
                      </div>
                      <div className={`h-10 w-px ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`}></div>
                      <div className="text-sm text-right">
                        {submissionsLoading ? (
                          <div className={`h-8 w-10 rounded animate-pulse mb-1 ml-auto ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
                        ) : (
                          <span className={`block text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                            {userSubmissions.length}
                          </span>
                        )}
                        <span className={`${styles.textSecondary}`}>Total Submits</span>
                      </div>
                    </div>

                    <button
                      onClick={() => { setHistoryFilter('all'); setShowHistory(true); }}
                      className={`w-full py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-medium transition-all duration-200 ${
                        isDark 
                        ? "bg-gray-800 hover:bg-gray-700 text-white border border-gray-700" 
                        : "bg-white hover:bg-gray-50 text-gray-800 border border-gray-200 shadow-sm"
                      }`}
                    >
                      <FileText className="w-4 h-4" />
                      View All History
                    </button>
                  </div>
                </div>

                <div className={`${styles.cardBackground} ${styles.backdropBlur} rounded-xl sm:rounded-2xl shadow-lg p-4 sm:p-6 border ${styles.cardBorder}`}>
                  <h3 className={`text-base sm:text-lg font-semibold mb-4 ${styles.textPrimary} flex items-center`}>
                    <TrendingUp className="w-5 h-5 mr-2 sm:mr-3 text-green-600" />
                    Points Reference
                  </h3>
                  <button
                    onClick={() => setShowPointsReference(!showPointsReference)}
                    className={`w-full text-left p-3 sm:p-4 rounded-lg transition-all duration-200 flex items-center justify-between ${
                      isDark ? "bg-gray-800 hover:bg-gray-700 text-gray-300" : "bg-gray-50 hover:bg-gray-100 text-gray-700"
                    } backdrop-blur-sm`}
                  >
                    <span className="font-medium text-sm sm:text-base">View All Rates</span>
                    <ArrowRight
                      className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${
                        showPointsReference ? "rotate-90" : ""
                      }`}
                    />
                  </button>

                  {showPointsReference && wasteTypes.length > 0 && (
                    <div className="mt-4 space-y-2 animate-slide-down overflow-auto max-h-64 hide-scrollbar">
                      {wasteTypes.map(({ id, name, pointsPerKilo }) => (
                        <div
                          key={id}
                          className={`flex justify-between items-center py-2 sm:py-3 px-3 sm:px-4 rounded-lg border ${
                            isDark ? "bg-gray-900 border-gray-700 text-gray-300" : "bg-gray-50 border-gray-200 text-gray-700"
                          }`}
                        >
                          <span className="font-medium capitalize text-sm sm:text-base">{name}</span>
                          <span className="font-bold text-green-600 text-sm sm:text-base">{pointsPerKilo} pts/kg</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div
                  className={`${styles.cardBackground} ${styles.backdropBlur} rounded-xl sm:rounded-2xl p-4 sm:p-6 border ${styles.cardBorder} shadow-lg`}
                >
                  <h3 className={`text-base sm:text-lg font-semibold mb-3 sm:mb-4 flex items-center ${styles.textPrimary}`}>
                    <Leaf className="w-5 h-5 mr-2 sm:mr-3 text-green-600" />
                    Your Impact
                  </h3>
                  <p className={`text-sm sm:text-base mb-3 sm:mb-4 leading-relaxed ${styles.textSecondary}`}>
                    {isMixedBundle 
                      ? "Bundle multiple recyclables to maximize your environmental contribution."
                      : "Every kilogram of waste recycled makes a difference for our planet."
                    }
                  </p>
                  {totals.weight > 0 && (
                    <div
                      className={`${isDark ? "bg-green-900/40 border-green-700/70 text-green-300" : "bg-white border-green-200 text-green-800"} rounded-lg p-3 sm:p-4 border backdrop-blur-sm`}
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isDark ? "bg-green-800" : "bg-green-100"}`}>
                          <Recycle className="w-4 h-4 text-green-600" />
                        </div>
                        <p className="text-sm sm:text-base">
                          <strong className="text-green-700">{totals.weight.toFixed(2)} kg</strong> waste diverted!
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {user && (
                (() => {
                  const uid = user.uid || "";
                  const verifyCode = (uid.slice(0,3) + uid.slice(-3)).toUpperCase();
                  return (
                    <div className={`${styles.cardBackground} ${styles.backdropBlur} rounded-xl sm:rounded-2xl shadow-lg p-4 sm:p-6 border ${styles.cardBorder}`}>
                      <h3 className={`text-base sm:text-lg font-semibold mb-3 flex items-center ${styles.textPrimary}`}>
                        <ShieldCheck className="w-5 h-5 mr-2 sm:mr-3 text-amber-500" />
                        Your Identity Code
                      </h3>
                      <p className={`text-xs sm:text-sm mb-4 leading-relaxed ${styles.textSecondary}`}>
                        Show this to the barangay staff when submitting. They will check your code matches before accepting your waste.
                      </p>

                      <div className={`flex flex-col items-center justify-center gap-2 py-4 rounded-xl border-2 border-dashed ${
                        isDark ? "border-amber-700/60 bg-amber-900/15" : "border-amber-300 bg-amber-50"
                      }`}>
                        <span className={`text-3xl sm:text-4xl font-mono font-bold tracking-[0.3em] ${
                          isDark ? "text-amber-300" : "text-amber-700"
                        }`}>
                          {verifyCode}
                        </span>
                        <span className={`text-xs font-medium uppercase tracking-wider ${
                          isDark ? "text-amber-500" : "text-amber-600"
                        }`}>
                          Verification Code
                        </span>
                      </div>

                      <div className={`mt-3 flex items-center gap-3 px-3 py-2.5 rounded-lg ${
                        isDark ? "bg-gray-800" : "bg-gray-100"
                      }`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                          isDark ? "bg-green-800 text-green-300" : "bg-green-200 text-green-800"
                        }`}>
                          {(user.displayName || user.email || "?")[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className={`text-sm font-semibold truncate ${styles.textPrimary}`}>
                            {user.displayName || "User"}
                          </div>
                          <div className={`text-xs truncate ${styles.textSecondary}`}>
                            {user.email}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()
              )}

            </div>
          </div>
        </div>
      </div>

      {showHistory && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm animate-fade-in overflow-y-auto"
          onClick={() => setShowHistory(false)}
        >
          <div className="flex min-h-full items-end justify-center sm:items-center sm:p-4">
          <div
            className={`w-full sm:max-w-2xl flex flex-col rounded-t-2xl sm:rounded-2xl shadow-2xl ${
              isDark ? "bg-gray-900 border border-gray-700" : "bg-white"
            }`}
            style={{ maxHeight: '92dvh' }}
            onClick={(e) => e.stopPropagation()}
          >
            
            <div className={`flex items-center justify-between p-6 border-b ${
              isDark ? "border-gray-800" : "border-gray-100"
            }`}>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className={`text-xl font-bold ${styles.textPrimary}`}>Submission History</h2>
                </div>
                <p className={`text-sm mt-1 ${styles.textSecondary}`}>
                  {userSubmissions.length} submission{userSubmissions.length !== 1 ? 's' : ''}
                </p>
              </div>
              <button
                onClick={() => setShowHistory(false)}
                className={`p-2 rounded-full transition-colors ${
                  isDark ? "hover:bg-gray-800 text-gray-400" : "hover:bg-gray-100 text-gray-500"
                }`}
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Category Filter Tabs — horizontally scrollable, never wraps */}
            <div className={`flex-shrink-0 flex gap-2 px-4 pt-3 pb-2 border-b overflow-x-auto hide-scrollbar ${isDark ? "border-gray-800" : "border-gray-100"}`}>
              {[
                { key: 'all', label: 'All' },
                { key: 'pending', label: 'Pending' },
                { key: 'confirmed', label: 'Confirmed' },
                { key: 'cancelled', label: 'Cancelled' },
                { key: 'rejected', label: 'Rejected' },
              ].map(tab => {
                const count = tab.key === 'all'
                  ? userSubmissions.length
                  : userSubmissions.filter(s => (s.status || 'pending').toLowerCase() === tab.key).length;
                const isActive = historyFilter === tab.key;
                const activeColors = {
                  all: isDark ? 'bg-gray-200 text-gray-900' : 'bg-gray-800 text-white',
                  pending: 'bg-yellow-500 text-white',
                  confirmed: 'bg-green-500 text-white',
                  cancelled: 'bg-gray-500 text-white',
                  rejected: 'bg-red-500 text-white',
                };
                return (
                  <button
                    key={tab.key}
                    onClick={() => setHistoryFilter(tab.key)}
                    className={`flex-shrink-0 whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      isActive
                        ? activeColors[tab.key]
                        : isDark
                          ? 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                    }`}
                  >
                    {tab.label}
                    {count > 0 && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                        isActive ? 'bg-white/25 text-white' : isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-600'
                      }`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 overscroll-contain" style={{WebkitOverflowScrolling: "touch"}}>
              {(() => {
                const filtered = historyFilter === 'all'
                  ? userSubmissions
                  : userSubmissions.filter(s => (s.status || 'pending').toLowerCase() === historyFilter);

                if (filtered.length === 0) {
                  const emptyConfig = {
                    pending: {
                      icon: Clock,
                      title: 'No pending submissions',
                      sub: 'You have no submissions awaiting approval right now.',
                    },
                    confirmed: {
                      icon: CheckCircle,
                      title: 'No confirmed submissions',
                      sub: 'Confirmed submissions will appear here once approved.',
                    },
                    rejected: {
                      icon: XCircle,
                      title: 'No rejected submissions',
                      sub: 'Rejected submissions will appear here.',
                    },
                    cancelled: {
                      icon: XCircle,
                      title: 'No cancelled submissions',
                      sub: 'Cancelled submissions will appear here.',
                    },
                    all: {
                      icon: History,
                      title: 'No submissions yet',
                      sub: 'Start by submitting your first recyclables!',
                    },
                  };
                  const cfg = emptyConfig[historyFilter] || emptyConfig.all;
                  const EmptyIcon = cfg.icon;
                  return (
                    <div className="text-center py-12">
                      <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${
                        isDark ? "bg-gray-800 text-gray-600" : "bg-gray-100 text-gray-400"
                      }`}>
                        <EmptyIcon className="w-8 h-8" />
                      </div>
                      <h3 className={`text-lg font-medium ${styles.textPrimary}`}>
                        {cfg.title}
                      </h3>
                      <p className={`mt-2 text-sm ${styles.textSecondary}`}>
                        {cfg.sub}
                      </p>
                    </div>
                  );
                }

                return filtered.map((sub) => {
                  const isBundle = Array.isArray(sub.items) && sub.items.length > 1;
                  const displayType = sub.type || sub.wasteType || "Waste";
                  const displayWeight = isBundle
                    ? (sub.totalWeight ?? sub.items?.reduce((s, i) => s + (i.weight || 0), 0) ?? 0)
                    : (sub.weight ?? 0);
                  const displayPoints = sub.points ?? sub.pointsEarned ?? 0;
                  const status = (sub.status || 'pending').toLowerCase();
                  const isCancelledOrRejected = status === 'cancelled' || status === 'rejected';
                  const reason = sub.reason || sub.rejectionReason || sub.cancellationReason;

                  return (
                    <div
                      key={sub.id}
                      onClick={() => setSelectedSubmission(sub)}
                      className={`rounded-xl p-4 border transition-all cursor-pointer ${
                        isDark
                          ? "bg-gray-800/50 border-gray-700 hover:border-green-600/50 hover:bg-gray-800"
                          : "bg-white border-gray-200 hover:border-green-300 hover:shadow-md shadow-sm"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className={`font-semibold ${styles.textPrimary}`}>
                              {isBundle ? "Mixed Bundle" : displayType}
                            </span>
                            <StatusBadge status={sub.status || "pending"} />
                          </div>
                          
                          <div className={`text-sm ${styles.textSecondary} flex flex-col gap-1`}>
                             <div className="flex items-center gap-2">
                               <Clock className="w-3.5 h-3.5" />
                               {formatDate(sub.submittedAt)}
                             </div>
                             <div>
                               Weight: <span className={isDark ? "text-gray-300" : "text-gray-700"}>
                                 {Number(displayWeight).toFixed(2)} kg
                               </span>
                             </div>
                             {isBundle && Array.isArray(sub.items) && (
                               <div className="text-xs mt-1 opacity-75">
                                 Includes: {sub.items.map(i => i.wasteType || i.type).join(", ")}
                               </div>
                             )}
                             {isCancelledOrRejected && reason && (
                               <div className={`flex items-start gap-1.5 mt-1 text-xs ${isDark ? "text-red-400" : "text-red-600"}`}>
                                 <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                                 <span className="line-clamp-1">
                                   <span className="font-semibold">Reason:</span> {reason}
                                 </span>
                               </div>
                             )}
                          </div>
                        </div>

                        <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-3 sm:pt-0 mt-2 sm:mt-0 gap-1 border-gray-200 dark:border-gray-700">
                          <div className="flex flex-col sm:items-end">
                            <span className={`text-xs uppercase tracking-wider font-medium ${styles.textSecondary}`}>
                              {sub.status === 'confirmed' ? 'Earned' : 'Est. Points'}
                            </span>
                            <span className={`text-xl font-bold ${
                              sub.status === 'confirmed' ? 'text-green-600' :
                              isCancelledOrRejected ? (isDark ? 'text-gray-600' : 'text-gray-400') :
                              'text-gray-500'
                            }`}>
                              {displayPoints}
                            </span>
                          </div>
                          {sub.status === 'pending' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setConfirmDelete({ show: true, id: sub.id }); }}
                              className="mt-1 text-xs flex items-center font-medium text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 px-2 py-1.5 rounded transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-1" />
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
            
            <div className={`p-4 border-t ${isDark ? "border-gray-800" : "border-gray-100"}`}>
               <button 
                 onClick={() => setShowHistory(false)}
                 className={`w-full py-3 rounded-xl font-medium transition-colors ${
                   isDark 
                     ? "bg-gray-800 hover:bg-gray-700 text-white" 
                     : "bg-gray-100 hover:bg-gray-200 text-gray-800"
                 }`}
               >
                 Close
               </button>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* Submission Detail Modal */}
      {selectedSubmission && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className={`w-full max-w-md max-h-[80vh] flex flex-col rounded-2xl shadow-2xl ${
            isDark ? "bg-gray-900 border border-gray-700" : "bg-white"
          }`}>
            <div className={`flex items-center justify-between p-5 border-b ${isDark ? "border-gray-800" : "border-gray-100"}`}>
              <h3 className={`text-lg font-bold ${styles.textPrimary}`}>Submission Details</h3>
              <button
                onClick={() => setSelectedSubmission(null)}
                className={`p-2 rounded-full transition-colors ${isDark ? "hover:bg-gray-800 text-gray-400" : "hover:bg-gray-100 text-gray-500"}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 overscroll-contain" style={{WebkitOverflowScrolling: "touch"}}>
              <div className="flex flex-col gap-3">
                <div><StatusBadge status={selectedSubmission.status || 'pending'} /></div>
                {(() => {
                  const st = (selectedSubmission.status || 'pending').toLowerCase();
                  const reason = selectedSubmission.reason || selectedSubmission.rejectionReason || selectedSubmission.cancellationReason;
                  if ((st === 'cancelled' || st === 'rejected') && reason) {
                    return (
                      <div className={`flex items-start gap-2 px-3 py-2.5 rounded-lg text-sm ${
                        isDark ? "bg-red-900/20 border border-red-800/40 text-red-400" : "bg-red-50 border border-red-200 text-red-700"
                      }`}>
                        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold block text-xs uppercase tracking-wide mb-0.5">Reason</span>
                          {reason}
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>

              <div className={`rounded-xl p-4 space-y-3 ${isDark ? "bg-gray-800/60" : "bg-gray-50"}`}>
                <div className="flex justify-between items-center">
                  <span className={`text-sm ${styles.textSecondary}`}>Type</span>
                  <span className={`font-semibold ${styles.textPrimary}`}>
                    {Array.isArray(selectedSubmission.items) && selectedSubmission.items.length > 1
                      ? "Mixed Bundle"
                      : selectedSubmission.type || selectedSubmission.wasteType || "Waste"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={`text-sm ${styles.textSecondary}`}>Total Weight</span>
                  <span className={`font-semibold ${styles.textPrimary}`}>
                    {Number(
                      Array.isArray(selectedSubmission.items) && selectedSubmission.items.length > 1
                        ? (selectedSubmission.totalWeight ?? selectedSubmission.items.reduce((s, i) => s + (i.weight || 0), 0))
                        : (selectedSubmission.weight ?? 0)
                    ).toFixed(2)} kg
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={`text-sm ${styles.textSecondary}`}>
                    {selectedSubmission.status === 'confirmed' ? 'Points Earned' : 'Est. Points'}
                  </span>
                  <span className={`text-xl font-bold ${selectedSubmission.status === 'confirmed' ? 'text-green-600' : isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    {selectedSubmission.points ?? selectedSubmission.pointsEarned ?? 0}
                  </span>
                </div>
              </div>

              {Array.isArray(selectedSubmission.items) && selectedSubmission.items.length > 1 && (
                <div>
                  <h4 className={`text-sm font-semibold mb-2 ${styles.textPrimary}`}>Bundle Items</h4>
                  <div className="space-y-2">
                    {selectedSubmission.items.map((item, idx) => (
                      <div key={idx} className={`flex justify-between items-center px-3 py-2 rounded-lg text-sm ${
                        isDark ? "bg-gray-800 text-gray-300" : "bg-gray-50 text-gray-700"
                      }`}>
                        <span>{item.wasteType || item.type}</span>
                        <span className="font-medium">{Number(item.weight).toFixed(2)} kg · {item.points ?? 0} pts</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className={`flex items-center gap-2 text-sm ${styles.textSecondary}`}>
                <Clock className="w-4 h-4 flex-shrink-0" />
                <span><span className="font-medium">Submitted: </span>{formatDate(selectedSubmission.submittedAt)}</span>
              </div>

              <div className={`text-xs font-mono ${styles.textSecondary}`}>ID: {selectedSubmission.id}</div>
            </div>

            <div className={`p-4 border-t ${isDark ? "border-gray-800" : "border-gray-100"}`}>
              <button
                onClick={() => setSelectedSubmission(null)}
                className={`w-full py-2.5 rounded-xl font-medium transition-colors ${
                  isDark ? "bg-gray-800 hover:bg-gray-700 text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-800"
                }`}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete.show && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className={`w-full max-w-sm p-6 rounded-2xl shadow-2xl ${
            isDark ? "bg-gray-800 border border-gray-700" : "bg-white"
          }`}>
            <div className="flex items-center gap-3 mb-4 text-red-500">
              <AlertCircle className="w-6 h-6" />
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Cancel Submission?</h3>
            </div>
            <p className="mb-6 text-sm text-gray-600 dark:text-gray-300">
              Are you sure you want to cancel this pending submission? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete({ show: false, id: null })}
                disabled={deleting}
                className={`flex-1 py-2.5 rounded-xl font-medium transition-colors ${
                  isDark ? "bg-gray-700 hover:bg-gray-600 text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-800"
                }`}
              >
                Keep It
              </button>
              <button
                onClick={confirmDeleteSubmission}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl font-medium bg-red-600 hover:bg-red-700 text-white flex justify-center items-center transition-colors disabled:opacity-50"
              >
                {deleting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Yes, Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmRemoveItem.show && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className={`w-full max-w-sm p-6 rounded-2xl shadow-2xl ${
            isDark ? "bg-gray-800 border border-gray-700" : "bg-white"
          }`}>
            <div className="flex items-center gap-3 mb-4 text-red-500">
              <Trash2 className="w-6 h-6" />
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Remove Item?</h3>
            </div>
            <p className="mb-6 text-sm text-gray-600 dark:text-gray-300">
              Are you sure you want to remove this item from your bundle?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmRemoveItem({ show: false, id: null })}
                className={`flex-1 py-2.5 rounded-xl font-medium transition-colors ${
                  isDark ? "bg-gray-700 hover:bg-gray-600 text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-800"
                }`}
              >
                Cancel
              </button>
              <button
                onClick={executeRemoveEntry}
                className="flex-1 py-2.5 rounded-xl font-medium bg-red-600 hover:bg-red-700 text-white flex justify-center items-center transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmSubmit && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className={`w-full max-w-sm p-6 rounded-2xl shadow-2xl ${
            isDark ? "bg-gray-800 border border-gray-700" : "bg-white"
          }`}>
            <div className="flex items-center gap-3 mb-4 text-green-600">
              <Trophy className="w-6 h-6" />
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Confirm Submission</h3>
            </div>

            <div className={`flex items-start gap-2 px-3 py-2.5 rounded-xl mb-4 text-sm ${
              isDark
                ? "bg-amber-900/25 border border-amber-700/50 text-amber-300"
                : "bg-amber-50 border border-amber-200 text-amber-800"
            }`}>
              <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                <strong>Staff must be present.</strong> Only submit after a barangay staff member has physically verified your waste.
              </span>
            </div>

            <p className="mb-6 text-sm text-gray-600 dark:text-gray-300">
              You are about to submit {isMixedBundle ? "a mixed bundle" : "a waste item"} for an estimated <strong className="text-green-600 dark:text-green-400">{totals.points} points</strong>. Do you want to proceed?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmSubmit(false)}
                disabled={loading}
                className={`flex-1 py-2.5 rounded-xl font-medium transition-colors ${
                  isDark ? "bg-gray-700 hover:bg-gray-600 text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-800"
                }`}
              >
                Review
              </button>
              <button
                onClick={executeSubmit}
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl font-medium bg-green-600 hover:bg-green-700 text-white flex justify-center items-center transition-colors disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast visible={toast.visible} message={toast.message} type={toast.type} onClose={closeToast} />

      <style>{`
        /* Added custom scrollbar hiding for horizontal tabs */
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none; /* IE and Edge */
          scrollbar-width: none; /* Firefox */
        }
        @keyframes slide-in {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slide-down {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-slide-in { animation: slide-in 0.3s ease-out forwards; }
        .animate-slide-down { animation: slide-down 0.3s ease-out forwards; }
        .animate-fade-in { animation: fade-in 0.2s ease-out forwards; }
      `}</style>
    </>
  );
}