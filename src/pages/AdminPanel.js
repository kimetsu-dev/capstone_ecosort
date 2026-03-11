import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "../firebase";
import { signOut } from "firebase/auth";
import ScheduleManager from "./AdminPanel/ScheduleManager";
import { FiUser,  FiLogOut } from "react-icons/fi";
import logo from "../images/logo.png";
import { 
  FiMenu, 
  FiX,
  FiHome, 
  FiFileText, 
  FiGift, 
  FiUsers, 
  FiCreditCard, 
  FiTag, 
  FiAlertTriangle, 
  FiTrash,
  FiCalendar,
  FiLink,
  FiTrendingUp,
  FiTrendingDown,
  FiActivity,
  FiClock,
  FiBarChart2 
} from "react-icons/fi";
import {
  doc,
  getDoc,
  collection,
  onSnapshot,
  deleteDoc,
  query,
  orderBy,
  where,
  limit,
} from "firebase/firestore";

import WasteTypesManager from "./AdminPanel/WasteTypesManager";
import RewardsTab from "./AdminPanel/RewardsTab";
import ReportsTab from "./AdminPanel/ReportsTab";
import UsersTab from "./AdminPanel/UsersTab";
import TransactionsTab from "./AdminPanel/TransactionsTab";

import PointsModal from "./AdminPanel/Modals/PointsModal";
import RewardModal from "./AdminPanel/Modals/RewardModal";
import RewardPreview from "./AdminPanel/Modals/RewardPreview";
import RedemptionsTab from "./AdminPanel/RedemptionsTab";
import SubmissionsTab from "./AdminPanel/SubmissionsTab";
import LedgerTab from "./AdminPanel/LedgerTab";
import BlockchainTab from './AdminPanel/BlockchainTab'; 
import AnalyticsTab from "./AdminPanel/AnalyticsTab"; 

import { formatTimestamp, getStatusBadge } from "../utils/helpers";
import { useTheme } from "../contexts/ThemeContext";
import { pushTab, setDefaultTab, TAB_BACK_EVENT } from "../BackButtonHandler";

export default function AdminPanel() {
  const { isDark } = useTheme() || {};
  const [user, loadingAuth] = useAuthState(auth);
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [reports, setReports] = useState([]);
  const [users, setUsers] = useState([]);
  const [rewards, setRewards] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [pendingSubmissions, setPendingSubmissions] = useState([]);
  const [allSubmissions, setAllSubmissions] = useState([]);
  const [redemptions, setRedemptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ message: "", type: "", visible: false });
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [profile, setProfile] = useState({ displayName: "", phone: "", photoURL: "" });

  const [pointsModal, setPointsModal] = useState({ visible: false, user: null });
  const [rewardModal, setRewardModal] = useState({ visible: false, reward: null, isEdit: false });
  const [rewardPreview, setRewardPreview] = useState({ visible: false, reward: null });
  
  const [rewardForm, setRewardForm] = useState({
    name: "",
    description: "",
    cost: "",
    stock: "",
    category: "food",
    imageFile: null,
    imagePreview: null,
    imageUrl: null,
  });

  const [pointsForm, setPointsForm] = useState({ amount: "", reason: "" });
  const [pointsPerKiloMap, setPointsPerKiloMap] = useState({});

  // Register home tab + listen for back-button tab pops
  useEffect(() => {
    setDefaultTab("/adminpanel", "dashboard");
    const handler = (e) => {
      if (e.detail.pathname === "/adminpanel") setActiveTab(e.detail.tabId);
    };
    window.addEventListener(TAB_BACK_EVENT, handler);
    return () => window.removeEventListener(TAB_BACK_EVENT, handler);
  }, []);

  // Fetch Admin Profile and Waste Types Map
  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      const userDoc = doc(db, "users", user.uid);
      const docSnap = await getDoc(userDoc);
      if (docSnap.exists()) {
        setProfile(docSnap.data());
      }
    };
    fetchProfile();
    
    const q = query(collection(db, "waste_types"), orderBy("name"));
    const unsubscribeWasteTypes = onSnapshot(q, (snapshot) => {
      const map = {};
      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        if (data.name) {
          map[data.name] = data.pointsPerKilo ?? 0;
        }
      });
      setPointsPerKiloMap(map);
    });

    return () => unsubscribeWasteTypes();
  }, [user]);

  const showToast = useCallback((message, type) => {
    setToast({ message, type, visible: true });
    setTimeout(() => setToast((prev) => ({ ...prev, visible: false })), 4000);
  }, []);

  const deleteReward = async (id) => {
    if (!window.confirm("Are you sure you want to delete this reward?")) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, "rewards", id));
      showToast("Reward deleted successfully", "success");
    } catch (error) {
      console.error("Error deleting reward:", error);
      showToast("Failed to delete reward", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!loadingAuth && !user) {
      navigate("/login");
    }
  }, [user, loadingAuth, navigate]);

  // Main Data Listeners
  useEffect(() => {
    if (!user) return;

    setLoading(true);

    const usersRef = collection(db, "users");
    const unsubscribeUsers = onSnapshot(usersRef, (snapshot) => {
      setUsers(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });

    const unsubscribeTx = onSnapshot(
      query(collection(db, "point_transactions"), orderBy("timestamp", "desc")),
      (snapshot) => {
        setTransactions(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      }
    );

    const reportsRef = collection(db, "violation_reports");
    const unsubscribeReports = onSnapshot(
      reportsRef,
      (snapshot) => {
        setReports(
          snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
            submittedAt: doc.data().submittedAt?.toDate ? doc.data().submittedAt.toDate() : new Date(),
          }))
        );
        setLoading(false);
      },
      (error) => {
        console.error("Failed to fetch reports:", error);
        setLoading(false);
      }
    );

    const rewardsRef = collection(db, "rewards");
    const unsubscribeRewards = onSnapshot(rewardsRef, (snapshot) => {
      setRewards(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });

    const pendingQuery = query(collection(db, "waste_submissions"), where("status", "==", "pending"));
    const unsubscribePending = onSnapshot(pendingQuery, (snapshot) => {
      setPendingSubmissions(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });

    const allSubmissionsQuery = query(collection(db, "waste_submissions"), orderBy("submittedAt", "desc"));
    const unsubscribeAllSubmissions = onSnapshot(allSubmissionsQuery, (snapshot) => {
      setAllSubmissions(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      // Fallback without orderBy if index is missing
      const fallbackQuery = collection(db, "waste_submissions");
      onSnapshot(fallbackQuery, (snapshot) => {
        setAllSubmissions(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      });
    });

    const redemptionsRef = query(collection(db, "redemptions"), orderBy("redeemedAt", "desc"));
    const unsubscribeRedemptions = onSnapshot(redemptionsRef, (snapshot) => {
      setRedemptions(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubscribeUsers();
      unsubscribeTx();
      unsubscribeReports();
      unsubscribeRewards();
      unsubscribePending();
      unsubscribeAllSubmissions();
      unsubscribeRedemptions();
    };
  }, [user]);

  const reportsPendingCount = reports.filter((report) => report.status === "pending").length;

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/login");
    } catch (error) {
      console.error("Sign out error:", error);
      showToast("Failed to sign out", "error");
    }
  };

  const filteredRewards = rewards.filter((reward) => {
    const matchesCategory = categoryFilter === "all" || reward.category === categoryFilter;
    const matchesStock =
      stockFilter === "all" ||
      (stockFilter === "in-stock" && reward.stock > 10) ||
      (stockFilter === "low-stock" && reward.stock > 0 && reward.stock <= 10) ||
      (stockFilter === "out-of-stock" && reward.stock <= 0);

    const matchesSearch =
      !searchTerm ||
      reward.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      reward.description?.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesCategory && matchesStock && matchesSearch;
  });

  const handleTabChange = (tab, opts = {}) => {
    setActiveTab(tab);
    setPendingOnly(opts.pendingOnly || false);
    setSidebarOpen(false);
    pushTab("/adminpanel", tab);
  };

  // ── Platform Statistics ────────────────────────────────────────────────────
  const confirmedSubmissions = allSubmissions.filter(s => s.status === "confirmed").length;
  const rejectedSubmissions  = allSubmissions.filter(s => s.status === "rejected").length;

  const stats = [
    {
      title: "Total Users",
      value: users.length,
      icon: <FiUsers />,
      gradient: "from-blue-500 to-cyan-500",
    },
    {
      title: "Total Submissions",
      value: allSubmissions.length,
      icon: <FiFileText />,
      gradient: "from-amber-500 to-orange-500",
    },
    {
      title: "Rewards",
      value: rewards.length,
      icon: <FiGift />,
      gradient: "from-violet-500 to-purple-500",
    },
    {
      title: "Redemptions",
      value: redemptions.length,
      icon: <FiCreditCard />,
      gradient: "from-emerald-500 to-teal-500",
    },
  ];

 const actionCards = [
    {
      title: "Pending Submissions",
      value: pendingSubmissions.length,
      icon: <FiFileText className="text-2xl" />,
      onClick: () => handleTabChange("submissions", { pendingOnly: true }),
      gradient: "from-amber-500 to-orange-500",
      bgLight: "from-orange-50 to-amber-50",
      bgDark: "from-gray-700 to-gray-800",
      textLight: "text-orange-600",
      textDark: "text-orange-400",
      borderLight: "border-orange-300",
      borderDark: "border-gray-600",
      hasAction: pendingSubmissions.length > 0
    },
    {
      title: "Pending Redemptions",
      value: redemptions.filter((r) => r.status === "pending").length,
      icon: <FiTag className="text-2xl" />,
      onClick: () => handleTabChange("redemptions", { pendingOnly: true }),
      gradient: "from-blue-500 to-indigo-500",
      bgLight: "from-blue-50 to-indigo-50",
      bgDark: "from-gray-700 to-gray-800",
      textLight: "text-blue-600",
      textDark: "text-blue-400",
      borderLight: "border-blue-300",
      borderDark: "border-gray-600",
      hasAction: redemptions.filter((r) => r.status === "pending").length > 0
    },
    {
      title: "Pending Forum Reports",
      value: reportsPendingCount,
      icon: <FiAlertTriangle className="text-2xl" />,
      onClick: () => handleTabChange("forum", { pendingOnly: true }),
      gradient: "from-red-500 to-rose-500",
      bgLight: "from-red-50 to-rose-50",
      bgDark: "from-gray-700 to-gray-800",
      textLight: "text-red-600",
      textDark: "text-red-400",
      borderLight: "border-red-300",
      borderDark: "border-gray-600",
      hasAction: reportsPendingCount > 0
    },
  ];

  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: <FiHome /> },
    { id: "analytics", label: "Analytics", icon: <FiBarChart2 /> },
    { id: "users", label: "Users", icon: <FiUsers /> },
    { id: "submissions", label: "Submissions", icon: <FiFileText />, badge: pendingSubmissions.length },
    { id: "rewards", label: "Rewards", icon: <FiGift /> },
    { id: "redemptions", label: "Redemptions", icon: <FiCreditCard /> },
    { id: "transactions", label: "Transactions", icon: <FiActivity /> },
    { id: "wasteTypes", label: "Waste Types", icon: <FiTag /> },
    { id: "schedules", label: "Schedules", icon: <FiCalendar /> },
    { id: "forum", label: "Forum", icon: <FiAlertTriangle />, badge: reportsPendingCount },
    { id: "ledger", label: "Blockchain Ledger", icon: <FiLink /> },
    { id: "blockchain", label: "Blockchain Verify", icon: <FiLink /> },
  ];

  if (loadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-gray-900 dark:to-gray-800">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isDark ? "bg-gray-900" : "bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100"}`}>
      {/* Mobile Header */}
      <header
        className={`lg:hidden backdrop-blur-md sticky top-0 z-40 border-b ${
          isDark ? "bg-gray-800/90 text-gray-200 border-gray-700" : "bg-white/90 text-slate-900 border-slate-200/50"
        } shadow-sm`}
      >
        <div className="px-4">
          <div className="flex justify-between items-center py-3">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className={`p-2 rounded-lg ${isDark ? "hover:bg-gray-700" : "hover:bg-gray-100"} transition-colors`}
              >
                <FiMenu className="w-5 h-5" />
              </button>
              <div className="flex items-center space-x-2">
                <img src={logo} alt="EcoSort Logo" className="w-8 h-8 rounded-lg object-cover shadow-lg" />
                <h1 className={`text-base font-bold bg-gradient-to-r ${isDark ? "from-gray-100 to-gray-400" : "from-slate-800 to-slate-600"} bg-clip-text text-transparent`}>
                  Admin Panel
                </h1>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-2 cursor-pointer group" onClick={() => navigate("/adminprofile")}>
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/40 dark:to-teal-900/40 flex items-center justify-center group-hover:shadow-md transition-all">
                  <FiUser className={`w-4 h-4 ${isDark ? "text-emerald-400" : "text-emerald-600"}`} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 w-72 transform transition-all duration-300 ease-in-out ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          } lg:translate-x-0 lg:static ${
            isDark ? "bg-gradient-to-b from-gray-800 to-gray-900 border-r border-gray-700" : "bg-white border-r border-gray-200 shadow-xl"
          }`}
        >
          <div className="h-full flex flex-col">
            <div className={`p-6 border-b ${isDark ? "border-gray-700" : "border-gray-200"}`}>
              <div className="flex items-center gap-3">
                <img src={logo} alt="Logo" className="w-12 h-12 rounded-xl shadow-lg" />
                <div>
                  <h1 className="text-xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                    Admin Panel
                  </h1>
                </div>
              </div>
            </div>

            {/* Profile Section in Sidebar */}
            <div className={`p-4 border-b ${isDark ? "border-gray-700" : "border-gray-200"}`}>
              <div onClick={() => navigate("/adminprofile")} className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-emerald-500/10 to-teal-500/10 cursor-pointer hover:from-emerald-500/20 hover:to-teal-500/20 transition-all group">
                {profile.photoURL ? (
                  <img src={profile.photoURL} alt="Profile" className="w-10 h-10 rounded-full ring-2 ring-emerald-500/20 group-hover:ring-emerald-500/40 transition-all" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white font-bold group-hover:scale-110 transition-transform">
                    <FiUser />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold truncate ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                    {profile.displayName || "Admin"}
                  </p>
                  <p className={`text-xs truncate ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                    {user?.email}
                  </p>
                </div>
              </div>
            </div>

            {/* Menu Navigation */}
            <nav className="flex-1 overflow-y-auto p-4 space-y-5 scrollbar-thin">
              {[
                {
                  group: "Overview",
                  items: menuItems.filter(m => ["dashboard", "analytics"].includes(m.id))
                },
                {
                  group: "Operations",
                  items: menuItems.filter(m => ["users", "submissions", "rewards", "redemptions", "transactions", "forum"].includes(m.id))
                },
                {
                  group: "Configuration",
                  items: menuItems.filter(m => ["wasteTypes", "schedules"].includes(m.id))
                },
                {
                  group: "Security & Verification",
                  items: menuItems.filter(m => ["ledger", "blockchain"].includes(m.id))
                }
              ].map(({ group, items }) => (
                <div key={group}>
                  <p className={`text-[10px] font-black uppercase tracking-widest mb-2 px-1 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                    {group}
                  </p>
                  <div className="space-y-0.5">
                    {items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleTabChange(item.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative ${
                          activeTab === item.id
                            ? isDark
                              ? "bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-400 shadow-sm"
                              : "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/25"
                            : isDark
                              ? "text-gray-400 hover:bg-gray-700/50 hover:text-gray-200"
                              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                        }`}
                      >
                        {activeTab === item.id && (
                          <div className={`absolute left-0 w-1 h-5 rounded-r-full ${isDark ? "bg-emerald-400" : "bg-white/60"}`} />
                        )}
                        <span className={`text-base transition-transform ${activeTab === item.id ? "scale-110" : "group-hover:scale-110"}`}>
                          {item.icon}
                        </span>
                        <span className="font-medium flex-1 text-left text-sm">{item.label}</span>
                        {item.badge > 0 && (
                          <span className="px-1.5 py-0.5 text-[10px] font-black rounded-full bg-red-500 text-white tabular-nums">
                            {item.badge}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </nav>

            {/* Logout Footer */}
            <div className={`p-4 border-t ${isDark ? "border-gray-700" : "border-gray-200"}`}>
              <button 
                onClick={handleLogout}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                  isDark 
                    ? "bg-red-500/10 text-red-400 hover:bg-red-500/20" 
                    : "bg-red-50 text-red-600 hover:bg-red-100"
                }`}
              >
                <FiLogOut className="text-xl" />
                <span className="font-medium">Sign Out</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Content Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          {/* Desktop Header */}
          <header className={`hidden lg:block border-b transition-colors ${
            isDark ? "bg-gray-800/50 border-gray-700 text-gray-100" : "bg-white/80 border-gray-200 text-gray-800"
          } backdrop-blur-md sticky top-0 z-30`}>
            <div className="px-8 py-4 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-extrabold tracking-tight">
                  {menuItems.find(item => item.id === activeTab)?.label}
                </h2>
              </div>

              <div className="flex items-center gap-3">
                {/* Admin chip */}
                <div
                  onClick={() => navigate("/adminprofile")}
                  className={`flex items-center gap-2.5 cursor-pointer px-3 py-2 rounded-xl border transition-colors ${
                    isDark ? "border-gray-700 hover:bg-gray-700/50" : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-bold leading-tight">{profile.displayName || "Admin"}</p>
                    
                  </div>
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white shadow-md shrink-0">
                    {profile.photoURL
                      ? <img src={profile.photoURL} alt="Avatar" className="w-full h-full rounded-full object-cover" />
                      : <FiUser className="text-sm" />
                    }
                  </div>
                </div>
              </div>
            </div>
          </header>

          {/* Main Scroller */}
          <main className="flex-1 overflow-y-auto p-4 lg:p-8 scroll-smooth">
            {activeTab === "dashboard" && (
              <div className="space-y-6 animate-fadeIn">

                {/* ── Welcome Banner ── */}
                <div className={`relative overflow-hidden rounded-2xl p-6 ${
                  isDark
                    ? "bg-gradient-to-r from-emerald-900/60 to-teal-900/60 border border-emerald-700/40"
                    : "bg-gradient-to-r from-emerald-500 to-teal-600"
                }`}>
                  <div className="absolute -top-8 -right-8 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none" />
                  <div className="absolute -bottom-8 -left-4 w-32 h-32 bg-white/5 rounded-full blur-2xl pointer-events-none" />
                  <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-white/80 text-sm font-medium mb-1">Good to see you back 👋</p>
                      <h2 className="text-2xl font-extrabold text-white">
                        {profile.displayName || "Administrator"}
                      </h2>
                      <p className="text-white/70 text-sm mt-1">
                        {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleTabChange("analytics")}
                        className="flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-xl text-sm font-semibold backdrop-blur-sm transition-all border border-white/20"
                      >
                        <FiBarChart2 /> View Analytics
                      </button>
                    </div>
                  </div>
                </div>

                {/* ── Action Cards (Pending Items) ── */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {actionCards.map((card, idx) => (
                    <button
                      key={idx}
                      onClick={card.onClick}
                      className={`p-5 rounded-2xl text-left transition-all transform hover:scale-[1.02] hover:shadow-xl relative overflow-hidden group ${
                        card.hasAction
                          ? `bg-gradient-to-br ${card.bgLight} border-2 ${card.borderLight} shadow-md`
                          : isDark ? "bg-gray-800/60 border border-gray-700" : "bg-white border border-gray-200 shadow-sm"
                      }`}
                    >
                      <div className="absolute top-0 right-0 p-6 opacity-5 transition-transform group-hover:scale-150 group-hover:rotate-12">
                        {card.icon}
                      </div>
                      <div className="flex items-center justify-between mb-3">
                        <div className={`p-2.5 rounded-xl ${
                          card.hasAction
                            ? `bg-white/80 shadow-sm ${card.textLight}`
                            : isDark ? "bg-gray-700 text-gray-400" : "bg-gray-100 text-gray-500"
                        }`}>
                          {card.icon}
                        </div>
                        {card.hasAction ? (
                          <span className={`px-2.5 py-1 bg-gradient-to-r ${card.gradient} text-white text-[10px] font-black rounded-full tracking-wider`}>
                            NEEDS REVIEW
                          </span>
                        ) : (
                          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${isDark ? "bg-gray-700 text-gray-400" : "bg-gray-100 text-gray-500"}`}>
                            All Clear ✓
                          </span>
                        )}
                      </div>
                      <div className={`text-3xl font-black mb-0.5 ${card.hasAction ? card.textLight : isDark ? "text-gray-100" : "text-gray-800"}`}>
                        {card.value}
                      </div>
                      <div className={`text-xs font-bold uppercase tracking-widest ${card.hasAction ? card.textLight : isDark ? "text-gray-500" : "text-gray-400"}`}>
                        {card.title}
                      </div>
                    </button>
                  ))}
                </div>

                {/* ── System Stats ── */}
                <div>
                  <h3 className={`text-lg font-bold mb-4 ${isDark ? "text-gray-100" : "text-gray-800"}`}>
                    Platform Statistics
                  </h3>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {stats.map((stat, idx) => (
                      <div
                        key={idx}
                        className={`p-5 rounded-2xl ${
                          isDark ? "bg-gray-800/40 border border-gray-700" : "bg-white border border-gray-100 shadow-sm"
                        }`}
                      >
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-3 bg-gradient-to-br ${stat.gradient} text-white shadow-md`}>
                          {stat.icon}
                        </div>
                        <div className="text-2xl font-black mb-0.5">{stat.value.toLocaleString()}</div>
                        <div className={`text-xs font-semibold uppercase tracking-wider ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                          {stat.title}
                        </div>
                        {stat.sub && (
                          <div className={`text-[10px] mt-1.5 leading-relaxed ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                            {stat.sub}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Bottom Row: Recent Transactions + Quick Links ── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                  {/* Recent Transactions */}
                  <div className={`lg:col-span-2 rounded-2xl border ${isDark ? "bg-gray-800/40 border-gray-700" : "bg-white border-gray-100 shadow-sm"}`}>
                    <div className={`flex justify-between items-center px-5 py-4 border-b ${isDark ? "border-gray-700" : "border-gray-100"}`}>
                      <div className="flex items-center gap-2">
                        <FiActivity className={isDark ? "text-emerald-400" : "text-emerald-600"} />
                        <h3 className="font-bold text-sm">Recent Transactions</h3>
                      </div>
                      <button
                        onClick={() => handleTabChange("transactions")}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${isDark ? "text-emerald-400 hover:bg-emerald-400/10" : "text-emerald-600 hover:bg-emerald-50"}`}
                      >
                        View All →
                      </button>
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                      {transactions.slice(0, 6).length === 0 ? (
                        <p className={`text-sm text-center py-8 ${isDark ? "text-gray-500" : "text-gray-400"}`}>No transactions yet.</p>
                      ) : (
                        transactions.slice(0, 6).map((tx) => {
                          const txUser = users.find(u => u.id === tx.userId);
                          const isPositive = (tx.points ?? tx.amount ?? 0) > 0;
                          
                          // Properly format the name from the user object
                          const userName = txUser?.displayName || txUser?.name || txUser?.username || txUser?.firstName || "Unknown User";
                          
                          // Format text, e.g., 'points_awarded' -> 'Point Awarded'
                          const formatTxText = (text) => {
                            if (!text) return "Transaction";
                            let formatted = text.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
                            if (formatted === "Points Awarded") return "Point Awarded";
                            return formatted;
                          };
                          
                          const displayReason = tx.description || formatTxText(tx.reason || tx.type);

                          return (
                            <div key={tx.id} className={`flex items-center gap-3 px-5 py-3 transition-colors ${isDark ? "hover:bg-gray-700/30" : "hover:bg-gray-50"}`}>
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0 bg-gradient-to-br ${isPositive ? "from-emerald-400 to-teal-500" : "from-rose-400 to-pink-500"}`}>
                                {isPositive ? "+" : "−"}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-semibold truncate ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                                  {userName}
                                </p>
                                <p className={`text-xs truncate ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                                  {displayReason}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className={`text-sm font-extrabold ${isPositive ? "text-emerald-600" : "text-rose-600"}`}>
                                  {isPositive ? "+" : ""}{tx.points ?? tx.amount ?? 0} pts
                                </p>
                                <p className={`text-[10px] ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                                  {tx.timestamp?.toDate ? tx.timestamp.toDate().toLocaleDateString() : "—"}
                                </p>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className={`rounded-2xl border ${isDark ? "bg-gray-800/40 border-gray-700" : "bg-white border-gray-100 shadow-sm"}`}>
                    <div className={`px-5 py-4 border-b ${isDark ? "border-gray-700" : "border-gray-100"}`}>
                      <div className="flex items-center gap-2">
                        <FiLink className={isDark ? "text-emerald-400" : "text-emerald-600"} />
                        <h3 className="font-bold text-sm">Quick Actions</h3>
                      </div>
                    </div>
                    <div className="p-3 space-y-1.5">
                      {[
                        { label: "Manage Users",        tab: "users",        icon: <FiUsers />,        color: "from-blue-500 to-cyan-500" },
                        { label: "Analytics Report",    tab: "analytics",    icon: <FiBarChart2 />,    color: "from-violet-500 to-purple-500" },
                        { label: "Configure Pricing",   tab: "wasteTypes",   icon: <FiTag />,          color: "from-amber-500 to-orange-500" },
                        { label: "Schedules",           tab: "schedules",    icon: <FiCalendar />,     color: "from-sky-500 to-blue-500" },
                        { label: "Audit Ledger",        tab: "ledger",       icon: <FiLink />,         color: "from-emerald-500 to-teal-500" },
                        { label: "Verify Blockchain",   tab: "blockchain",   icon: <FiActivity />,     color: "from-rose-500 to-pink-500" },
                      ].map(({ label, tab, icon, color }) => (
                        <button
                          key={tab}
                          onClick={() => handleTabChange(tab)}
                          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all group ${
                            isDark ? "hover:bg-gray-700/60 text-gray-300" : "hover:bg-gray-50 text-gray-700"
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${color} text-white flex items-center justify-center text-sm shadow-sm group-hover:scale-110 transition-transform`}>
                            {icon}
                          </div>
                          <span className="text-sm font-semibold">{label}</span>
                          <span className={`ml-auto text-xs ${isDark ? "text-gray-600" : "text-gray-300"}`}>→</span>
                        </button>
                      ))}
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* TAB CONTENT RENDERING */}
            {activeTab === "analytics" && <AnalyticsTab />}
            {activeTab === "users" && <UsersTab users={users} setUsers={setUsers} setPointsModal={setPointsModal} isDark={isDark} />}
            {activeTab === "submissions" && (
              <SubmissionsTab 
                pendingSubmissions={pendingSubmissions} 
                setPendingSubmissions={setPendingSubmissions} 
                pointsPerKiloMap={pointsPerKiloMap} 
                users={users} 
                loading={loading} 
                setLoading={setLoading} 
                showToast={showToast} 
                isDark={isDark}
                pendingOnly={pendingOnly}
                onExitPendingOnly={() => setPendingOnly(false)}
              />
            )}
            {activeTab === "rewards" && (
              <RewardsTab 
                rewards={rewards} 
                filteredRewards={filteredRewards} 
                searchTerm={searchTerm} 
                setSearchTerm={setSearchTerm} 
                categoryFilter={categoryFilter} 
                setCategoryFilter={setCategoryFilter} 
                stockFilter={stockFilter} 
                setStockFilter={setStockFilter} 
                setRewardModal={setRewardModal} 
                setRewardPreview={setRewardPreview} 
                rewardForm={rewardForm} 
                setRewardForm={setRewardForm} 
                deleteReward={deleteReward} 
                loading={loading} 
                showToast={showToast} 
                isDark={isDark} 
              />
            )}
            {activeTab === "redemptions" && <RedemptionsTab redemptions={redemptions} users={users} rewards={rewards} showToast={showToast} isDark={isDark} pendingOnly={pendingOnly} onExitPendingOnly={() => setPendingOnly(false)} />}
            {activeTab === "transactions" && <TransactionsTab transactions={transactions} users={users} formatTimestamp={formatTimestamp} showSigns={true} isDark={isDark} />}
            {activeTab === "wasteTypes" && <WasteTypesManager isDark={isDark} />}
            {activeTab === "schedules" && <ScheduleManager isDark={isDark} showToast={showToast} />}
            {activeTab === "forum" && (
              <ReportsTab 
                reports={reports} 
                setReports={setReports} 
                formatTimestamp={formatTimestamp} 
                getStatusBadge={getStatusBadge} 
                showToast={showToast} 
                isDark={isDark}
                pendingOnly={pendingOnly}
                onExitPendingOnly={() => setPendingOnly(false)}
              />
            )}
            {activeTab === "ledger" && <LedgerTab />}
            {activeTab === "blockchain" && <BlockchainTab />}
          </main>
        </div>
      </div>

      {/* MODALS */}
      {pointsModal.visible && (
        <PointsModal 
          pointsModal={pointsModal} 
          setPointsModal={setPointsModal} 
          pointsForm={pointsForm} 
          setPointsForm={setPointsForm} 
          users={users} 
          setUsers={setUsers} 
          transactions={transactions} 
          setTransactions={setTransactions} 
          showToast={showToast} 
          isDark={isDark} 
        />
      )}
      {rewardModal.visible && (
        <RewardModal 
          rewardModal={rewardModal} 
          setRewardModal={setRewardModal} 
          rewardForm={rewardForm} 
          setRewardForm={setRewardForm} 
          loading={loading} 
          setLoading={setLoading} 
          showToast={showToast} 
          isDark={isDark} 
        />
      )}
      {rewardPreview.visible && (
        <RewardPreview 
          rewardPreview={rewardPreview} 
          setRewardPreview={setRewardPreview} 
          setRewardModal={setRewardModal} 
          setRewardForm={setRewardForm} 
          isDark={isDark} 
        />
      )}
      
      {/* SYSTEM TOAST */}
      {toast.visible && (
        <div className={`fixed bottom-6 right-6 flex items-center gap-3 px-5 py-3.5 rounded-2xl text-white shadow-2xl z-[100] animate-slideDown max-w-sm ${
          toast.type === "success" ? "bg-emerald-600" : toast.type === "error" ? "bg-red-600" : "bg-blue-600"
        }`}>
          <div className="w-7 h-7 rounded-full flex items-center justify-center font-black bg-white/20 text-sm shrink-0">
            {toast.type === "success" && "✓"}
            {toast.type === "error" && "✗"}
            {toast.type === "info" && "i"}
          </div>
          <span className="font-semibold text-sm leading-tight">{toast.message}</span>
          <button
            onClick={() => setToast(prev => ({ ...prev, visible: false }))}
            className="ml-2 opacity-70 hover:opacity-100 transition-opacity text-lg leading-none"
          >
            ×
          </button>
        </div>
      )}

      {/* Sidebar Overlay Mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-md z-40 lg:hidden transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Global Admin Styles */}
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn { animation: fadeIn 0.4s ease-out forwards; }
        .animate-slideDown { animation: slideDown 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
        
        .scrollbar-thin::-webkit-scrollbar { width: 4px; }
        .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: #10b981; border-radius: 20px; }
      `}</style>
    </div>
  );
}