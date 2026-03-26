import React, { useState, useRef, useMemo, useEffect } from "react";
import { useReward } from "react-rewards";
import {
  doc, updateDoc, addDoc, collection,
  serverTimestamp, onSnapshot, query, orderBy, limit
} from "firebase/firestore";
import { db, auth } from "../../firebase";
import {
  Search, Plus, Award, Edit3, Trash2, Eye, X,
  Tag, Package, PackagePlus, Filter, TrendingUp,
  AlertTriangle, CheckCircle, Save, ClipboardList,
  ArrowRight, ShieldAlert, ChevronDown, ChevronUp
} from "lucide-react";

export default function RewardsTab({
  rewards = [],
  searchTerm = "",
  setSearchTerm = () => {},
  categoryFilter = "all",
  setCategoryFilter = () => {},
  stockFilter = "all",
  setStockFilter = () => {},
  setRewardModal = () => {},
  setRewardPreview = () => {},
  deleteReward = () => {},
  rewardForm = {},
  setRewardForm = () => {},
  loading = false,
  showToast = () => {},
  isDark = false
}) {
  const [showFilters, setShowFilters] = useState(false);

  // ── Adjust Inventory modal state ──────────────────────────────────────────
  const [stockAdjustModal, setStockAdjustModal] = useState({ visible: false, reward: null });
  const [newStockVal, setNewStockVal] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [stockLoading, setStockLoading] = useState(false);
  const [adjustStep, setAdjustStep] = useState("form"); // "form" | "confirm"

  // ── Audit log viewer state ────────────────────────────────────────────────
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const scrollRef = useRef(null);
  const activeRewards = rewards.length > 0 ? rewards : [];
  const categories = [...new Set(activeRewards.map((r) => r.category))];

  // ── Live audit log stream (only when panel is open) ───────────────────────
  useEffect(() => {
    if (!showAuditLog) return;
    setAuditLoading(true);
    const q = query(
      collection(db, "inventory_logs"),
      orderBy("timestamp", "desc"),
      limit(50)
    );
    const unsub = onSnapshot(q, (snap) => {
      setAuditLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setAuditLoading(false);
    }, (err) => {
      console.error("Audit log stream error:", err);
      setAuditLoading(false);
    });
    return () => unsub();
  }, [showAuditLog]);

  // ── Derived values for the modal ──────────────────────────────────────────
  const parsedNewStock = parseInt(newStockVal, 10);
  const currentStock = stockAdjustModal.reward?.stock ?? 0;
  const delta = isNaN(parsedNewStock) ? 0 : parsedNewStock - currentStock;
  const isReduction = delta < 0;
  const finalReason = reasonCode === "Other — describe below"
    ? customReason.trim()
    : reasonCode;

  // ── Filtered rewards ──────────────────────────────────────────────────────
  const filteredRewards = useMemo(() => {
    let filtered = activeRewards;
    if (searchTerm) {
      filtered = filtered.filter(r =>
        r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.description.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    if (categoryFilter !== "all") filtered = filtered.filter(r => r.category === categoryFilter);
    if (stockFilter !== "all") {
      filtered = filtered.filter(r => {
        if (stockFilter === "in-stock") return r.stock > 5;
        if (stockFilter === "low-stock") return r.stock > 0 && r.stock <= 5;
        if (stockFilter === "out-of-stock") return r.stock === 0;
        return true;
      });
    }
    return filtered;
  }, [activeRewards, searchTerm, categoryFilter, stockFilter]);

  const getStockColor = (stock) => {
    if (stock === 0) return isDark ? "text-red-400 bg-red-900/30" : "text-red-700 bg-red-50";
    if (stock <= 5) return isDark ? "text-amber-400 bg-amber-900/30" : "text-amber-700 bg-amber-50";
    return isDark ? "text-emerald-400 bg-emerald-900/30" : "text-emerald-700 bg-emerald-50";
  };

  const getStockIcon = (stock) => {
    if (stock === 0) return <AlertTriangle size={14} />;
    if (stock <= 5) return <TrendingUp size={14} />;
    return <CheckCircle size={14} />;
  };

  // ── Open / close adjust modal ─────────────────────────────────────────────
  const openAdjustModal = (reward) => {
    setNewStockVal(String(reward.stock));
    setReasonCode("");
    setCustomReason("");
    setAdjustStep("form");
    setStockAdjustModal({ visible: true, reward });
  };

  const closeAdjustModal = () => {
    setStockAdjustModal({ visible: false, reward: null });
    setNewStockVal("");
    setReasonCode("");
    setCustomReason("");
    setAdjustStep("form");
  };

  // ── Step 1: validate then advance to confirm screen ───────────────────────
  const handleProceedToConfirm = (e) => {
    e.preventDefault();
    if (isNaN(parsedNewStock) || parsedNewStock < 0) {
      return showToast("Please enter a valid stock amount (0 or more)", "error");
    }
    if (parsedNewStock === currentStock) {
      return showToast("New stock is the same as current — no change needed", "error");
    }
    if (!reasonCode) {
      return showToast("Please select a reason for this adjustment", "error");
    }
    if (reasonCode === "Other — describe below" && !customReason.trim()) {
      return showToast("Please describe the reason in the text field", "error");
    }
    setAdjustStep("confirm");
  };

  // ── Step 2: write to Firestore ────────────────────────────────────────────
  const handleConfirmAdjustment = async () => {
    const targetReward = stockAdjustModal.reward;
    if (!targetReward) return;

    setStockLoading(true);
    try {
      // 1. Update ONLY the stock field on the reward document
      await updateDoc(doc(db, "rewards", targetReward.id), {
        stock: parsedNewStock,
      });

      // 2. Write immutable audit log — serverTimestamp cannot be faked client-side
      await addDoc(collection(db, "inventory_logs"), {
        rewardId: targetReward.id,
        rewardName: targetReward.name,
        previousStock: currentStock,
        newStock: parsedNewStock,
        difference: delta,
        reason: finalReason,
        adminId: auth?.currentUser?.uid || "unknown",
        adminEmail: auth?.currentUser?.email || "unknown",
        timestamp: serverTimestamp(),
      });

      showToast("Inventory updated and logged successfully", "success");
      closeAdjustModal();
    } catch (error) {
      console.error("Stock adjustment error:", error);
      showToast("Failed to update inventory. Check your permissions.", "error");
      setAdjustStep("form");
    } finally {
      setStockLoading(false);
    }
  };

  // ── Audit log helpers ─────────────────────────────────────────────────────
  const formatTimestamp = (ts) => {
    if (!ts) return "—";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString(undefined, {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  };

  const getDeltaStyle = (diff) => {
    if (diff < 0) return "text-red-600 bg-red-50 border-red-200";
    if (diff > 0) return "text-emerald-700 bg-emerald-50 border-emerald-200";
    return "text-slate-500 bg-slate-50 border-slate-200";
  };

  const isSuspicious = (log) => log.difference <= -5;

  // ── Fallback icon component ───────────────────────────────────────────────
  function RewardFallbackIcon({ rewardId }) {
    const { reward, rewardMe } = useReward(rewardId, "confetti", {
      lifetime: 1500,
      elementCount: 30,
    });
    return (
      <div
        ref={reward}
        role="button"
        tabIndex={0}
        onClick={() => rewardMe()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); rewardMe(); }
        }}
        aria-label="Trigger confetti"
        className={`${isDark ? "text-gray-400" : "text-slate-400"} text-6xl flex items-center justify-center select-none cursor-pointer hover:text-purple-500`}
        style={{ outline: "none" }}
      >
        <Award aria-hidden="true" />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 relative">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h2 className={`text-2xl font-bold ${isDark ? "text-gray-100" : "text-slate-800"}`}>
            Rewards Management
          </h2>
        </div>
        <p className={isDark ? "text-gray-400" : "text-slate-600"}>
          Manage and configure redeemable rewards for users.
        </p>
      </div>

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div>
        <div className="px-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${isDark ? "bg-purple-900/50" : "bg-purple-100"}`}>
                <Award className={isDark ? "text-purple-400" : "text-purple-600"} size={24} />
              </div>
              <div>
                <h3 className={`text-xl font-bold ${isDark ? "text-gray-100" : "text-slate-800"}`}>Rewards</h3>
                <p className={`text-xs ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                  {filteredRewards.length} of {activeRewards.length} items
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Audit log toggle */}
              <button
                onClick={() => setShowAuditLog((v) => !v)}
                className={`px-3 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5 transition-all border ${
                  showAuditLog
                    ? isDark ? "bg-amber-900/40 text-amber-300 border-amber-700" : "bg-amber-50 text-amber-700 border-amber-300"
                    : isDark ? "bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                }`}
                title="View Inventory Audit Log"
              >
                <ClipboardList size={15} />
                <span className="hidden sm:inline">Audit Log</span>
                {showAuditLog ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>

              {/* Add reward */}
              <button
                onClick={() => {
                  setRewardForm({
                    name: "", description: "", cost: "", stock: "",
                    category: "general", imagePreview: null, imageFile: null, imageUrl: null,
                  });
                  setRewardModal({ visible: true, reward: null, isEdit: false });
                }}
                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl hover:from-purple-700 hover:to-indigo-700 transition-all shadow-lg font-medium flex items-center gap-2 text-sm"
                type="button"
              >
                <Plus size={16} />
                <span className="hidden sm:inline">Add Reward</span>
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative mb-3">
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? "text-gray-400" : "text-slate-400"}`} size={18} />
            <input
              type="text"
              placeholder="Search rewards..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-10 pr-12 py-3 border rounded-xl focus:ring-2 focus:ring-purple-500 transition-all text-sm ${
                isDark
                  ? "border-gray-600 bg-gray-800 text-gray-200 placeholder-gray-400"
                  : "border-slate-300 bg-white text-slate-900 placeholder-slate-400"
              }`}
            />
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg transition-all ${
                showFilters
                  ? isDark ? "text-purple-400 bg-purple-900/30" : "text-purple-600 bg-purple-100"
                  : isDark ? "text-gray-400 hover:text-gray-300" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <Filter size={16} />
            </button>
          </div>

          {/* Expandable filters */}
          {showFilters && (
            <div className={`mb-3 p-4 rounded-xl border space-y-3 ${isDark ? "bg-gray-800 border-gray-700" : "bg-slate-50 border-slate-200"}`}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDark ? "text-gray-300" : "text-slate-700"}`}>Category</label>
                  <div className="relative">
                    <Tag className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? "text-gray-400" : "text-slate-400"}`} size={16} />
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className={`w-full pl-10 pr-8 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 ${isDark ? "border-gray-600 bg-gray-700 text-gray-200" : "border-slate-300 bg-white text-slate-900"}`}
                    >
                      <option value="all">All Categories</option>
                      {categories.map((c) => (
                        <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDark ? "text-gray-300" : "text-slate-700"}`}>Stock Status</label>
                  <div className="relative">
                    <Package className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? "text-gray-400" : "text-slate-400"}`} size={16} />
                    <select
                      value={stockFilter}
                      onChange={(e) => setStockFilter(e.target.value)}
                      className={`w-full pl-10 pr-8 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 ${isDark ? "border-gray-600 bg-gray-700 text-gray-200" : "border-slate-300 bg-white text-slate-900"}`}
                    >
                      <option value="all">All Stock</option>
                      <option value="in-stock">In Stock (6+)</option>
                      <option value="low-stock">Low Stock (1–5)</option>
                      <option value="out-of-stock">Out of Stock</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Audit Log Panel ───────────────────────────────────────────────── */}
      {showAuditLog && (
        <div className={`mx-4 rounded-2xl border overflow-hidden ${isDark ? "border-gray-700 bg-gray-800" : "border-amber-200 bg-amber-50"}`}>
          <div className={`px-5 py-3.5 flex items-center justify-between border-b ${isDark ? "border-gray-700" : "border-amber-200 bg-amber-100/60"}`}>
            <div className="flex items-center gap-2">
              <ShieldAlert size={17} className={isDark ? "text-amber-400" : "text-amber-600"} />
              <span className={`font-bold text-sm ${isDark ? "text-amber-300" : "text-amber-800"}`}>
                Inventory Audit Log — last 50 entries (live)
              </span>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isDark ? "bg-amber-900/40 text-amber-400" : "bg-amber-200 text-amber-700"}`}>
              Immutable · Admin-only
            </span>
          </div>

          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            {auditLoading ? (
              <div className="py-10 flex justify-center">
                <span className={`animate-spin border-2 border-t-transparent rounded-full w-6 h-6 ${isDark ? "border-amber-400" : "border-amber-500"}`} />
              </div>
            ) : auditLogs.length === 0 ? (
              <div className={`py-8 text-center text-sm ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                No inventory changes recorded yet.
              </div>
            ) : (
              <table className="w-full text-xs min-w-[640px]">
                <thead>
                  <tr className={isDark ? "bg-gray-700 text-gray-300" : "bg-amber-100 text-amber-800"}>
                    {["Timestamp", "Admin", "Reward", "Change", "Reason", "Flag"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr
                      key={log.id}
                      className={`border-t transition-colors ${
                        isSuspicious(log)
                          ? isDark ? "bg-red-900/20 border-red-800/30" : "bg-red-50 border-red-100"
                          : isDark ? "border-gray-700 hover:bg-gray-700/50" : "border-amber-100 hover:bg-white"
                      }`}
                    >
                      <td className={`px-4 py-2.5 whitespace-nowrap ${isDark ? "text-gray-300" : "text-slate-600"}`}>
                        {formatTimestamp(log.timestamp)}
                      </td>
                      <td className={`px-4 py-2.5 ${isDark ? "text-gray-300" : "text-slate-700"}`}>
                        {log.adminEmail || log.adminId}
                      </td>
                      <td className={`px-4 py-2.5 font-medium ${isDark ? "text-gray-200" : "text-slate-800"}`}>
                        {log.rewardName}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5 font-mono">
                          <span className={isDark ? "text-gray-400" : "text-slate-500"}>{log.previousStock}</span>
                          <ArrowRight size={11} className={isDark ? "text-gray-500" : "text-slate-400"} />
                          <span className={`font-semibold ${isDark ? "text-gray-100" : "text-slate-800"}`}>{log.newStock}</span>
                          <span className={`ml-1 px-1.5 py-0.5 rounded border font-bold ${getDeltaStyle(log.difference)}`}>
                            {log.difference > 0 ? `+${log.difference}` : log.difference}
                          </span>
                        </div>
                      </td>
                      <td className={`px-4 py-2.5 max-w-[180px] truncate ${isDark ? "text-gray-300" : "text-slate-600"}`}>
                        {log.reason}
                      </td>
                      <td className="px-4 py-2.5">
                        {isSuspicious(log) ? (
                          <span className="flex items-center gap-1 text-red-600 font-semibold whitespace-nowrap">
                            <AlertTriangle size={12} /> Large drop
                          </span>
                        ) : (
                          <span className={isDark ? "text-gray-600" : "text-slate-400"}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="px-4" ref={scrollRef}>
        {/* Stock summary cards */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: "In Stock",     count: activeRewards.filter(r => r.stock > 5).length,                 color: isDark ? "bg-emerald-900/30 text-emerald-400" : "bg-emerald-50 text-emerald-700", icon: <CheckCircle size={16} /> },
            { label: "Low Stock",    count: activeRewards.filter(r => r.stock > 0 && r.stock <= 5).length, color: isDark ? "bg-amber-900/30 text-amber-400"    : "bg-amber-50 text-amber-700",    icon: <TrendingUp size={16} /> },
            { label: "Out of Stock", count: activeRewards.filter(r => r.stock === 0).length,               color: isDark ? "bg-red-900/30 text-red-400"        : "bg-red-50 text-red-700",        icon: <AlertTriangle size={16} /> },
          ].map((stat, idx) => (
            <div key={idx} className={`p-4 rounded-xl border ${isDark ? "border-gray-700" : "border-slate-200"} ${stat.color}`}>
              <div className="flex items-center gap-2 mb-1">
                {stat.icon}
                <span className="font-bold text-lg">{stat.count}</span>
              </div>
              <p className="text-xs opacity-90">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Rewards grid */}
        {filteredRewards.length === 0 ? (
          <div className="text-center py-16">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${isDark ? "bg-purple-900/30" : "bg-gradient-to-br from-purple-100 to-indigo-100"}`}>
              <Award className={isDark ? "text-purple-400" : "text-purple-500"} size={32} />
            </div>
            <h3 className={`text-lg font-medium mb-2 ${isDark ? "text-gray-100" : "text-slate-800"}`}>No rewards found</h3>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredRewards.map((reward) => (
              <div
                key={reward.id}
                className={`group rounded-2xl shadow-sm border overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-slate-200"}`}
              >
                {/* Image area */}
                <div className={`relative h-48 overflow-hidden flex items-center justify-center ${isDark ? "bg-gradient-to-br from-gray-700 to-gray-800" : "bg-gradient-to-br from-slate-100 to-slate-200"}`}>
                  {reward.imageUrl ? (
                    <img src={reward.imageUrl} alt={reward.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                  ) : (
                    <RewardFallbackIcon rewardId={`reward-${reward.id}`} />
                  )}

                  {/* Hover action buttons */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <div className="flex space-x-2">
                      <button onClick={() => setRewardPreview({ visible: true, reward })} className="p-2 bg-white text-slate-700 rounded-lg hover:bg-gray-100 shadow-lg" title="Preview">
                        <Eye size={18} />
                      </button>
                      <button
                        onClick={() => {
                          setRewardForm({
                            name: reward.name, description: reward.description,
                            cost: reward.cost, stock: reward.stock,
                            category: reward.category,
                            imagePreview: reward.imageUrl || null,
                            imageUrl: reward.imageUrl || null,
                          });
                          setRewardModal({ visible: true, reward, isEdit: true });
                        }}
                        className="p-2 bg-white text-blue-600 rounded-lg hover:bg-blue-50 shadow-lg"
                        title="Edit Details"
                      >
                        <Edit3 size={18} />
                      </button>
                      <button
                        onClick={() => openAdjustModal(reward)}
                        className="p-2 bg-white text-amber-600 rounded-lg hover:bg-amber-50 shadow-lg"
                        title="Adjust Inventory"
                      >
                        <PackagePlus size={18} />
                      </button>
                      <button onClick={() => deleteReward(reward.id)} className="p-2 bg-white text-red-600 rounded-lg hover:bg-red-50 shadow-lg" title="Delete">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>

                  {/* Badges */}
                  <div className="absolute top-3 left-3">
                    <span className="px-3 py-1 bg-white/90 text-slate-700 text-xs font-medium rounded-full backdrop-blur-sm shadow-sm capitalize">{reward.category}</span>
                  </div>
                  <div className="absolute top-3 right-3">
                    <div className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full backdrop-blur-sm shadow-sm ${getStockColor(reward.stock)}`}>
                      {getStockIcon(reward.stock)}
                      <span>{reward.stock > 0 ? `${reward.stock} left` : "Out of stock"}</span>
                    </div>
                  </div>
                </div>

                {/* Card content */}
                <div className="p-6">
                  <h3 className={`font-bold text-lg mb-2 truncate ${isDark ? "text-gray-100" : "text-slate-800"}`}>{reward.name}</h3>
                  <p className={`text-sm mb-4 line-clamp-2 ${isDark ? "text-gray-400" : "text-slate-600"}`}>{reward.description}</p>
                  <div className="flex items-center gap-2">
                    <span className={`text-2xl font-bold ${isDark ? "text-purple-400" : "text-purple-600"}`}>{reward.cost}</span>
                    <span className={`text-sm font-medium ${isDark ? "text-gray-400" : "text-slate-500"}`}>points</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Adjust Inventory Modal ────────────────────────────────────────── */}
      {stockAdjustModal.visible && stockAdjustModal.reward && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className={`rounded-2xl shadow-2xl w-full max-w-md overflow-hidden ${isDark ? "bg-gray-800" : "bg-white"}`}>

            {/* Modal header */}
            <div className={`p-5 border-b flex items-center justify-between ${isDark ? "border-gray-700" : "border-slate-200"}`}>
              <h3 className={`text-lg font-bold flex items-center gap-2 ${isDark ? "text-gray-100" : "text-slate-800"}`}>
                <PackagePlus className="text-amber-500" size={20} />
                {adjustStep === "form" ? "Adjust Inventory" : "Confirm Change"}
              </h3>
              <button onClick={closeAdjustModal} className={`${isDark ? "text-gray-400 hover:text-gray-200" : "text-slate-500 hover:text-slate-700"}`} type="button">
                <X size={20} />
              </button>
            </div>

            {/* ── STEP 1: Form ── */}
            {adjustStep === "form" && (
              <form onSubmit={handleProceedToConfirm} className="p-6 space-y-5">
                {/* Item info */}
                <div className={`p-3 rounded-xl border ${isDark ? "bg-gray-700 border-gray-600" : "bg-slate-50 border-slate-200"}`}>
                  <p className={`text-xs mb-0.5 ${isDark ? "text-gray-400" : "text-slate-500"}`}>Adjusting stock for:</p>
                  <p className={`font-semibold ${isDark ? "text-gray-100" : "text-slate-800"}`}>{stockAdjustModal.reward.name}</p>
                </div>

                {/* Current / new stock */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-sm font-semibold mb-2 ${isDark ? "text-gray-300" : "text-slate-700"}`}>Current Stock</label>
                    <input
                      type="number"
                      value={currentStock}
                      disabled
                      className={`w-full px-4 py-3 border rounded-xl cursor-not-allowed ${isDark ? "bg-gray-700 border-gray-600 text-gray-400" : "bg-slate-100 border-slate-200 text-slate-500"}`}
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-semibold mb-2 ${isDark ? "text-gray-300" : "text-slate-700"}`}>
                      New Stock *
                      {!isNaN(parsedNewStock) && parsedNewStock !== currentStock && (
                        <span className={`ml-2 text-xs font-bold px-1.5 py-0.5 rounded-full ${delta < 0 ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-700"}`}>
                          {delta > 0 ? `+${delta}` : delta}
                        </span>
                      )}
                    </label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={newStockVal}
                      onChange={(e) => setNewStockVal(e.target.value)}
                      className={`w-full px-4 py-3 border rounded-xl focus:ring-2 transition-colors ${
                        isReduction
                          ? "border-red-400 bg-red-50 focus:ring-red-400 text-red-800"
                          : isDark
                          ? "border-gray-600 bg-gray-700 text-gray-100 focus:ring-amber-500"
                          : "border-amber-300 focus:ring-amber-500"
                      }`}
                    />
                  </div>
                </div>

                {/* Reduction warning */}
                {isReduction && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200">
                    <AlertTriangle size={15} className="text-red-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-red-700">
                      <span className="font-bold">Stock reduction detected.</span> You are removing{" "}
                      <span className="font-bold">{Math.abs(delta)}</span> unit{Math.abs(delta) !== 1 ? "s" : ""}.
                      This will be permanently recorded with your admin account.
                    </p>
                  </div>
                )}

                {/* Reason select */}
                <div>
                  <label className={`block text-sm font-semibold mb-2 ${isDark ? "text-gray-300" : "text-slate-700"}`}>
                    Reason for Adjustment *
                  </label>
                  <select
                    required
                    value={reasonCode}
                    onChange={(e) => { setReasonCode(e.target.value); setCustomReason(""); }}
                    className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-amber-500 ${isDark ? "bg-gray-700 border-gray-600 text-gray-200" : "border-slate-300 bg-white"}`}
                  >
                    <option value="" disabled>Select a reason…</option>
                    <option value="Restock">Restock</option>
                    <option value="Damaged Item">Damaged Item</option>
                    <option value="Lost Item">Lost Item</option>
                    <option value="Promotional Giveaway">Promotional Giveaway</option>
                    <option value="Inventory Correction">Inventory Correction</option>
                    <option value="Other — describe below">Other — describe below</option>
                  </select>
                  <p className={`text-xs mt-1.5 flex items-center gap-1 ${isDark ? "text-amber-400" : "text-amber-600"}`}>
                    <AlertTriangle size={11} /> This action is permanently logged with your name and timestamp.
                  </p>
                </div>

                {/* Custom reason textarea */}
                {reasonCode === "Other — describe below" && (
                  <textarea
                    rows={3}
                    required
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="Describe the reason in detail…"
                    className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-amber-500 text-sm resize-none ${isDark ? "bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-400" : "border-slate-300 placeholder-slate-400"}`}
                  />
                )}

                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={closeAdjustModal}
                    className={`flex-1 py-3 rounded-xl text-sm font-medium ${isDark ? "bg-gray-700 text-gray-300 hover:bg-gray-600" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white py-3 rounded-xl hover:from-amber-600 hover:to-orange-600 transition-all font-medium flex justify-center items-center gap-2 text-sm"
                  >
                    Review Change <ArrowRight size={15} />
                  </button>
                </div>
              </form>
            )}

            {/* ── STEP 2: Confirm ── */}
            {adjustStep === "confirm" && (
              <div className="p-6 space-y-5">
                <div className={`rounded-xl border p-4 space-y-3 ${isDark ? "border-amber-700 bg-amber-900/20" : "border-amber-200 bg-amber-50"}`}>
                  <p className={`text-sm font-bold ${isDark ? "text-amber-300" : "text-amber-800"}`}>
                    Review this change before confirming:
                  </p>
                  <div className="space-y-2.5 text-sm">
                    {[
                      { label: "Item",        value: stockAdjustModal.reward.name },
                      { label: "Logged as",   value: auth?.currentUser?.email || "unknown" },
                      { label: "Reason",      value: finalReason },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex justify-between gap-4">
                        <span className={isDark ? "text-gray-400" : "text-slate-500"}>{label}</span>
                        <span className={`font-medium text-right ${isDark ? "text-gray-200" : "text-slate-800"}`}>{value}</span>
                      </div>
                    ))}
                    <div className="flex justify-between items-center gap-4">
                      <span className={isDark ? "text-gray-400" : "text-slate-500"}>Stock change</span>
                      <div className="flex items-center gap-1.5 font-semibold">
                        <span className={isDark ? "text-gray-300" : "text-slate-600"}>{currentStock}</span>
                        <ArrowRight size={13} className={isDark ? "text-gray-500" : "text-slate-400"} />
                        <span className={isDark ? "text-gray-100" : "text-slate-900"}>{parsedNewStock}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded border font-bold ${getDeltaStyle(delta)}`}>
                          {delta > 0 ? `+${delta}` : delta}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {isReduction && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200">
                    <ShieldAlert size={15} className="text-red-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-red-700 font-medium">
                      This reduction is permanent and cannot be deleted from the audit log.
                    </p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setAdjustStep("form")}
                    disabled={stockLoading}
                    className={`flex-1 py-3 rounded-xl text-sm font-medium ${isDark ? "bg-gray-700 text-gray-300 hover:bg-gray-600" : "bg-slate-100 text-slate-700 hover:bg-slate-200"} disabled:opacity-50`}
                  >
                    ← Go back
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmAdjustment}
                    disabled={stockLoading}
                    className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white py-3 rounded-xl hover:from-amber-600 hover:to-orange-600 transition-all font-bold flex justify-center items-center gap-2 text-sm disabled:opacity-50"
                  >
                    {stockLoading
                      ? <span className="animate-spin border-2 border-white border-t-transparent rounded-full w-5 h-5" />
                      : <><Save size={16} /> Confirm &amp; Save</>}
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}