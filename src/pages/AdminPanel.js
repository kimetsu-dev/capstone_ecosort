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
  FiClock
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

import { formatTimestamp, getStatusBadge } from "../utils/helpers";
import { useTheme } from "../contexts/ThemeContext";

export default function AdminPanel() {
  const { isDark } = useTheme() || {};
  const [user, loadingAuth] = useAuthState(auth);
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [reports, setReports] = useState([]);
  const [users, setUsers] = useState([]);
  const [rewards, setRewards] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [pendingSubmissions, setPendingSubmissions] = useState([]);
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

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSidebarOpen(false);
  };

  // Action Cards with click handlers
  const actionCards = [
    {
      title: "Pending Submissions",
      value: pendingSubmissions.length,
      icon: <FiFileText className="text-2xl" />,
      onClick: () => setActiveTab("submissions"),
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
      onClick: () => setActiveTab("redemptions"),
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
      onClick: () => setActiveTab("forum"),
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

  const stats = [
    {
      title: "Total Users",
      value: users.length,
      icon: <FiUsers className="text-2xl" />,
      gradient: "from-blue-500 to-cyan-500",
      bgLight: "bg-blue-50",
      bgDark: "bg-blue-900/20",
      textLight: "text-blue-600",
      textDark: "text-blue-400"
    },
    {
      title: "Total Rewards",
      value: rewards.length,
      icon: <FiGift className="text-2xl" />,
      gradient: "from-purple-500 to-pink-500",
      bgLight: "bg-purple-50",
      bgDark: "bg-purple-900/20",
      textLight: "text-purple-600",
      textDark: "text-purple-400"
    },
    {
      title: "Transactions",
      value: transactions.length,
      icon: <FiCreditCard className="text-2xl" />,
      gradient: "from-emerald-500 to-teal-500",
      bgLight: "bg-emerald-50",
      bgDark: "bg-emerald-900/20",
      textLight: "text-emerald-600",
      textDark: "text-emerald-400"
    },
    {
      title: "Total Redemptions",
      value: redemptions.length,
      icon: <FiTag className="text-2xl" />,
      gradient: "from-amber-500 to-orange-500",
      bgLight: "bg-amber-50",
      bgDark: "bg-amber-900/20",
      textLight: "text-amber-600",
      textDark: "text-amber-400"
    },
  ];

  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: <FiHome /> },
    { id: "users", label: "Users", icon: <FiUsers /> },
    { id: "submissions", label: "Submissions", icon: <FiFileText />, badge: pendingSubmissions.length },
    { id: "rewards", label: "Rewards", icon: <FiGift /> },
    { id: "redemptions", label: "Redemptions", icon: <FiCreditCard /> },
    { id: "transactions", label: "Transactions", icon: <FiActivity /> },
    { id: "wasteTypes", label: "Waste Types", icon: <FiTag /> },
    { id: "schedules", label: "Schedules", icon: <FiCalendar /> },
    { id: "forum", label: "Forum Reports", icon: <FiAlertTriangle />, badge: reportsPendingCount },
    { id: "ledger", label: "Blockchain Ledger", icon: <FiLink /> },
    { id: "blockchain", label: "Blockchain Verify", icon: <FiLink /> },
  ];

  /* Helper functions for Recent Activity - Commented out since Recent Activity is commented out
  // Helper function to get user details
  const getUserDetails = (userId) => {
    return users.find(u => u.id === userId) || { displayName: "Unknown User", photoURL: null };
  };

  // Helper function to get transaction type details
  const getTransactionTypeDetails = (tx) => {
    if (tx.type === "earn") {
      return {
        icon: <FiTrendingUp className="text-lg" />,
        bgColor: isDark ? "bg-emerald-500/10" : "bg-emerald-50",
        iconColor: "text-emerald-500",
        borderColor: isDark ? "border-emerald-500/20" : "border-emerald-100",
        amountColor: "text-emerald-600",
        label: "Earned"
      };
    } else if (tx.type === "redeem") {
      return {
        icon: <FiGift className="text-lg" />,
        bgColor: isDark ? "bg-purple-500/10" : "bg-purple-50",
        iconColor: "text-purple-500",
        borderColor: isDark ? "border-purple-500/20" : "border-purple-100",
        amountColor: "text-purple-600",
        label: "Redeemed"
      };
    } else if (tx.type === "bonus" || tx.type === "admin_adjust") {
      return {
        icon: <FiTrendingDown className="text-lg" />,
        bgColor: isDark ? "bg-blue-500/10" : "bg-blue-50",
        iconColor: "text-blue-500",
        borderColor: isDark ? "border-blue-500/20" : "border-blue-100",
        amountColor: tx.amount > 0 ? "text-blue-600" : "text-orange-600",
        label: tx.amount > 0 ? "Bonus" : "Adjustment"
      };
    }
    return {
      icon: <FiActivity className="text-lg" />,
      bgColor: isDark ? "bg-gray-500/10" : "bg-gray-50",
      iconColor: "text-gray-500",
      borderColor: isDark ? "border-gray-500/20" : "border-gray-100",
      amountColor: "text-gray-600",
      label: "Activity"
    };
  };

  // Format relative time
  const getRelativeTime = (timestamp) => {
    if (!timestamp) return "Unknown";
    
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatTimestamp(timestamp);
  };
  */

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
          isDark
            ? "bg-gray-800/90 text-gray-200 border-gray-700"
            : "bg-white/90 text-slate-900 border-slate-200/50"
        } shadow-sm`}
      >
        <div className="px-4">
          <div className="flex justify-between items-center py-3">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className={`p-2 rounded-lg ${
                  isDark ? "hover:bg-gray-700" : "hover:bg-gray-100"
                } transition-colors`}
              >
                <FiMenu className="w-5 h-5" />
              </button>
              <div className="flex items-center space-x-2">
                <img 
                  src={logo} 
                  alt="EcoSort Logo" 
                  className="w-8 h-8 rounded-lg object-cover shadow-lg" 
                />
                <div className="flex flex-col">
                  <h1
                    className={`text-base font-bold bg-gradient-to-r ${
                      isDark ? "from-gray-100 to-gray-400" : "from-slate-800 to-slate-600"
                    } bg-clip-text text-transparent`}
                  >
                    Admin Panel
                  </h1>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <div
                className="flex items-center space-x-2 cursor-pointer group"
                onClick={() => navigate("/adminprofile")}
              >
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
            isDark 
              ? "bg-gradient-to-b from-gray-800 to-gray-900 border-r border-gray-700" 
              : "bg-white border-r border-gray-200 shadow-xl"
          }`}
        >
          <div className="h-full flex flex-col">
            {/* Logo */}
            <div className={`p-6 border-b ${isDark ? "border-gray-700" : "border-gray-200"}`}>
              <div className="flex items-center gap-3">
                <img src={logo} alt="Logo" className="w-12 h-12 rounded-xl shadow-lg" />
                <div>
                  <h1 className={`text-xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent`}>
                    Admin Panel
                  </h1>
                  <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>Management Dashboard</p>
                </div>
              </div>
            </div>

            {/* User Profile */}
            <div className={`p-4 border-b ${isDark ? "border-gray-700" : "border-gray-200"}`}>
              <div 
                onClick={() => navigate("/adminprofile")}
                className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-emerald-500/10 to-teal-500/10 cursor-pointer hover:from-emerald-500/20 hover:to-teal-500/20 transition-all group"
              >
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

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto p-4 space-y-1">
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleTabChange(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group relative ${
                    activeTab === item.id
                      ? isDark
                        ? "bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-400 shadow-lg"
                        : "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30"
                      : isDark
                      ? "text-gray-400 hover:bg-gray-700/50 hover:text-gray-200"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  }`}
                >
                  <span className="text-xl">{item.icon}</span>
                  <span className="font-medium flex-1 text-left">{item.label}</span>
                  {item.badge > 0 && (
                    <span className="px-2 py-1 text-xs font-bold rounded-full bg-red-500 text-white animate-pulse">
                      {item.badge}
                    </span>
                  )}
                  {activeTab === item.id && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-gradient-to-b from-emerald-500 to-teal-500 rounded-r-full" />
                  )}
                </button>
              ))}
            </nav>

            {/* Logout Button */}
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
                <span className="font-medium">Logout</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <header className={`${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"} border-b shadow-sm`}>
            <div className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div>
                    <h2 className={`text-2xl font-bold ${isDark ? "text-gray-100" : "text-gray-800"}`}>
                      {menuItems.find(item => item.id === activeTab)?.label || "Dashboard"}
                    </h2>
                    <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"} mt-0.5`}>
                      Manage your waste management system
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className={`hidden md:flex items-center gap-2 px-4 py-2 rounded-lg ${
                    isDark ? "bg-gray-700/50" : "bg-gray-100"
                  }`}>
                    <FiClock className={isDark ? "text-gray-400" : "text-gray-500"} />
                    <span className={`text-sm font-medium ${isDark ? "text-gray-300" : "text-gray-600"}`}>
                      {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </header>

          {/* Content Area */}
          <main className="flex-1 overflow-y-auto">
            <div className="p-6">
              {/* Dashboard */}
              {activeTab === "dashboard" && (
                <div className="space-y-6 animate-fadeIn">
                  {/* Action Cards - Clickable */}
                  <div>
                    <h3 className={`text-lg font-semibold mb-3 ${isDark ? "text-gray-200" : "text-slate-700"}`}>
                      Quick Actions
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {actionCards.map((card, idx) => (
                        <button
                          key={idx}
                          onClick={card.onClick}
                          className={`p-5 rounded-xl text-left transition-all transform hover:scale-105 ${
                            card.hasAction
                              ? `bg-gradient-to-br ${card.bgLight} border-2 ${card.borderLight} shadow-lg hover:shadow-xl`
                              : isDark
                              ? `bg-gradient-to-br ${card.bgDark} border border-gray-600`
                              : "bg-gray-50 border border-gray-200"
                          }`}
                          style={{ animationDelay: `${idx * 100}ms` }}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className={`w-6 h-6 ${card.hasAction ? card.textLight : isDark ? "text-gray-400" : "text-gray-400"}`}>
                              {card.icon}
                            </div>
                            {card.hasAction && (
                              <span className={`px-2 py-1 bg-gradient-to-r ${card.gradient} text-white text-xs font-bold rounded-full`}>
                                ACTION
                              </span>
                            )}
                          </div>
                          <div className={`text-3xl font-bold mb-1 ${card.hasAction ? card.textLight : isDark ? "text-gray-400" : "text-gray-400"}`}>
                            {card.value}
                          </div>
                          <div className={`text-sm font-medium ${card.hasAction ? card.textLight.replace('600', '700') : isDark ? "text-gray-500" : "text-gray-500"}`}>
                            {card.title}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* System Overview */}
                  <div>
                    <h3 className={`text-lg font-semibold mb-3 ${isDark ? "text-gray-200" : "text-slate-700"}`}>
                      System Overview
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {stats.map((stat, idx) => (
                        <div
                          key={idx}
                          className={`p-5 rounded-xl ${
                            isDark ? "bg-gradient-to-br from-gray-700 to-gray-800 border border-gray-600" : "bg-gradient-to-br from-white to-gray-50 border border-gray-200"
                          } shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1 group`}
                          style={{ animationDelay: `${idx * 100}ms` }}
                        >
                          <div className={`mb-3 ${isDark ? stat.textDark : stat.textLight}`}>
                            {stat.icon}
                          </div>
                          <div className={`text-3xl font-bold mb-1 ${isDark ? "text-gray-100" : "text-slate-800"}`}>
                            {stat.value}
                          </div>
                          <div className={`text-sm ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                            {stat.title}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Inventory Status */}
                  <div>
                    <h3 className={`text-lg font-semibold mb-3 ${isDark ? "text-gray-200" : "text-slate-700"}`}>
                      Inventory Status
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className={`p-5 rounded-xl ${isDark ? "bg-gradient-to-br from-emerald-900/30 to-emerald-800/30 border border-emerald-700/50" : "bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-200"} hover:shadow-lg transition-all duration-300`}>
                        <div className={`text-2xl font-bold mb-1 ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>
                          {rewards.filter(r => r.stock > 5).length}
                        </div>
                        <div className={`text-sm ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>
                          In Stock (6+)
                        </div>
                      </div>

                      <div className={`p-5 rounded-xl ${isDark ? "bg-gradient-to-br from-amber-900/30 to-amber-800/30 border border-amber-700/50" : "bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200"} hover:shadow-lg transition-all duration-300`}>
                        <div className={`text-2xl font-bold mb-1 ${isDark ? "text-amber-400" : "text-amber-600"}`}>
                          {rewards.filter(r => r.stock > 0 && r.stock <= 5).length}
                        </div>
                        <div className={`text-sm ${isDark ? "text-amber-300" : "text-amber-700"}`}>
                          Low Stock (1-5)
                        </div>
                      </div>

                      <div className={`p-5 rounded-xl ${isDark ? "bg-gradient-to-br from-red-900/30 to-red-800/30 border border-red-700/50" : "bg-gradient-to-br from-red-50 to-rose-50 border border-red-200"} hover:shadow-lg transition-all duration-300`}>
                        <div className={`text-2xl font-bold mb-1 ${isDark ? "text-red-400" : "text-red-600"}`}>
                          {rewards.filter(r => r.stock === 0).length}
                        </div>
                        <div className={`text-sm ${isDark ? "text-red-300" : "text-red-700"}`}>
                          Out of Stock
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Recent Activity Section - COMMENTED OUT */}
                  {/* 
                  <div className={`rounded-2xl ${
                    isDark ? "bg-gray-800 border border-gray-700" : "bg-white border border-gray-200"
                  } shadow-lg overflow-hidden`}>
                    <div className={`px-6 py-4 border-b ${isDark ? "border-gray-700" : "border-gray-200"} bg-gradient-to-r ${
                      isDark ? "from-gray-800 to-gray-750" : "from-gray-50 to-white"
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${isDark ? "bg-emerald-500/10" : "bg-emerald-50"}`}>
                            <FiActivity className={`text-xl ${isDark ? "text-emerald-400" : "text-emerald-600"}`} />
                          </div>
                          <div>
                            <h3 className={`text-lg font-bold ${isDark ? "text-gray-100" : "text-gray-900"}`}>
                              Recent Activity
                            </h3>
                            <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                              Latest transactions across the platform
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => setActiveTab("transactions")}
                          className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
                            isDark
                              ? "text-emerald-400 hover:bg-emerald-500/10"
                              : "text-emerald-600 hover:bg-emerald-50"
                          }`}
                        >
                          View All
                        </button>
                      </div>
                    </div>

                    <div className="divide-y divide-gray-200 dark:divide-gray-700">
                      {transactions.slice(0, 8).map((tx, idx) => {
                        const userDetails = getUserDetails(tx.userId);
                        const typeDetails = getTransactionTypeDetails(tx);
                        
                        return (
                          <div
                            key={tx.id}
                            className={`p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-200 ${
                              idx === 0 ? 'animate-slideDown' : ''
                            }`}
                            style={{ animationDelay: `${idx * 50}ms` }}
                          >
                            <div className="flex items-center gap-4">
                              <div className="flex-shrink-0">
                                {userDetails.photoURL ? (
                                  <img
                                    src={userDetails.photoURL}
                                    alt={userDetails.displayName}
                                    className="w-12 h-12 rounded-full ring-2 ring-offset-2 ring-gray-200 dark:ring-gray-600 dark:ring-offset-gray-800"
                                  />
                                ) : (
                                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center text-white font-bold ring-2 ring-offset-2 ring-gray-200 dark:ring-gray-600 dark:ring-offset-gray-800">
                                    {userDetails.displayName?.charAt(0).toUpperCase() || "?"}
                                  </div>
                                )}
                              </div>

                              <div className={`flex-shrink-0 w-10 h-10 rounded-lg ${typeDetails.bgColor} ${typeDetails.iconColor} flex items-center justify-center border ${typeDetails.borderColor}`}>
                                {typeDetails.icon}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className={`font-semibold truncate ${isDark ? "text-gray-200" : "text-gray-900"}`}>
                                      {userDetails.displayName}
                                    </p>
                                    <p className={`text-sm truncate ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                                      {tx.reason || typeDetails.label}
                                    </p>
                                  </div>
                                  <div className="text-right flex-shrink-0">
                                    <p className={`font-bold text-lg ${typeDetails.amountColor}`}>
                                      {tx.type === "earn" || (tx.type === "admin_adjust" && tx.amount > 0) ? "+" : "-"}
                                      {Math.abs(tx.amount)} pts
                                    </p>
                                    <div className="flex items-center gap-1.5 justify-end mt-0.5">
                                      <FiClock className={`text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`} />
                                      <p className={`text-xs ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                                        {getRelativeTime(tx.timestamp)}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      
                      {transactions.length === 0 && (
                        <div className={`p-12 text-center ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                          <FiActivity className="w-16 h-16 mx-auto mb-4 opacity-20" />
                          <p className="text-lg font-medium">No recent transactions</p>
                          <p className="text-sm mt-2">Activity will appear here as users earn and redeem points</p>
                        </div>
                      )}
                    </div>
                  </div>
                  */}
                </div>
              )}

              {/* Waste Types Tab */}
              {activeTab === "wasteTypes" && (
                <WasteTypesManager isDark={isDark} />
              )}

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
                />
              )}

              {/* Schedules Tab */}
              {activeTab === "schedules" && (
                <ScheduleManager isDark={isDark} showToast={showToast} />
              )}

              {/* Other Tab Components */}
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

              {activeTab === "forum" && ( // Changed from "reports"
                <ReportsTab
                  reports={reports}
                  setReports={setReports}
                  formatTimestamp={formatTimestamp}
                  getStatusBadge={getStatusBadge}
                  showToast={showToast}
                  isDark={isDark}
                />
              )}

              {activeTab === "users" && (
                <UsersTab 
                  users={users} 
                  setUsers={setUsers} 
                  setPointsModal={setPointsModal} 
                  isDark={isDark} 
                />
              )}

              {activeTab === "transactions" && (
                <TransactionsTab 
                  transactions={transactions} 
                  users={users} 
                  formatTimestamp={formatTimestamp} 
                  showSigns={true} 
                  isDark={isDark} 
                />
              )}

               {/* Redemptions Tab */}
              {activeTab === "redemptions" && (
                <RedemptionsTab
                  redemptions={redemptions}
                  users={users}
                  rewards={rewards}
                  showToast={showToast}
                  isDark={isDark}
                />
              )}

              {/* Blockchain Ledger Tab */}
              {activeTab === "ledger" && (
                <LedgerTab />
              )}

              {/* NEW: Blockchain Verification Tab */}
              {activeTab === "blockchain" && (
                <BlockchainTab />
              )}
            </div>
          </main>
        </div>
      </div>

      {/* Modals */}
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

      {/* Toast Notification - Enhanced */}
      {toast.visible && (
        <div
          className={`fixed top-4 right-4 px-6 py-4 rounded-2xl text-white shadow-2xl transition-all duration-300 z-50 backdrop-blur-sm max-w-sm transform ${
            toast.visible ? "translate-y-0 opacity-100 scale-100" : "-translate-y-full opacity-0 scale-95"
          } ${
            toast.type === "success"
              ? "bg-gradient-to-r from-emerald-500 to-teal-600"
              : toast.type === "error"
              ? "bg-gradient-to-r from-red-500 to-rose-600"
              : "bg-gradient-to-r from-blue-500 to-indigo-600"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold bg-white/20 ring-2 ring-white/30">
              {toast.type === "success" && "✓"}
              {toast.type === "error" && "✗"}
              {toast.type === "info" && "i"}
            </div>
            <span className="font-medium">{toast.message}</span>
          </div>
        </div>
      )}

      {/* Sidebar Overlay for Mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Custom Styles */}
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out;
        }

        .animate-slideDown {
          animation: slideDown 0.3s ease-out;
        }

        .animate-fadeIn > * {
          animation: fadeIn 0.5s ease-out backwards;
        }
      `}</style>
    </div>
  );
}