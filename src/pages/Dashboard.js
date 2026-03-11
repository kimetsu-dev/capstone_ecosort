import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { FiUser, FiMenu, FiX, FiLogOut, FiChevronLeft, FiBell } from "react-icons/fi";
import { useTheme } from "../contexts/ThemeContext";
import { DashboardCalendar, InlineCalendar } from "../components/DashboardCalendar";
import NotificationCenter from "../components/NotificationCenter";
import UpdateBanner from '../components/UpdateBanner';
import SubmitWaste from "./SubmitWaste";
import Rewards from "./Rewards";
import Forum from "./Forum";
import Leaderboard from "./Leaderboard";
import Transactions from "./Transactions";
import { useLanguage } from "../contexts/LanguageContext";
import logo from "../images/logo.png";

import {
  doc,
  onSnapshot,
  collection,
  query,
  orderBy,
  limit,
  getDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { pushTab, setDefaultTab, TAB_BACK_EVENT } from "../BackButtonHandler";
import {
  FaRecycle,
  FaGift,
  FaExclamationTriangle,
  FaTrophy,
  FaFileAlt,
  FaHome,
  FaCalendarAlt,
  FaMapMarkerAlt,
  FaCheckCircle,
  FaChartLine,
  FaArrowUp,
  FaLeaf,
  FaCubes,
  FaLink,
  FaMedal,
  FaUsers,
  FaChartBar,
  FaBell,
  FaStar, 
} from "react-icons/fa";

// Menu items for web version
const WEB_MENU_ITEMS = [
  { id: "overview", title: "Dashboard", icon: FaHome, color: "from-blue-500 to-indigo-600", bgColor: "bg-blue-500" },
  { id: "submit", title: "Submit", icon: FaRecycle, color: "from-emerald-500 to-teal-600", bgColor: "bg-emerald-500" },
  { id: "rewards", title: "Rewards", icon: FaGift, color: "from-amber-500 to-orange-600", bgColor: "bg-amber-500" },
  { id: "report", title: "Forum", icon: FaExclamationTriangle, color: "from-red-500 to-rose-600", bgColor: "bg-red-500" },
  { id: "leaderboard", title: "Leaderboard", icon: FaTrophy, color: "from-purple-500 to-pink-600", bgColor: "bg-purple-500" },
  { id: "transactions", title: "Transactions", icon: FaFileAlt, color: "from-slate-500 to-gray-600", bgColor: "bg-slate-500" },
];

// Menu items for app version
const APP_MENU_ITEMS = [
  { id: "overview", title: "Dashboard", icon: FaHome, color: "from-blue-500 to-indigo-600", bgColor: "bg-blue-500" },
  { id: "submit", title: "Submit", icon: FaRecycle, color: "from-emerald-500 to-teal-600", bgColor: "bg-emerald-500" },
  { id: "rewards", title: "Rewards", icon: FaGift, color: "from-amber-500 to-orange-600", bgColor: "bg-amber-500" },
  { id: "report", title: "Forum", icon: FaExclamationTriangle, color: "from-red-500 to-rose-600", bgColor: "bg-red-500" },
  { id: "transactions", title: "Transactions", icon: FaFileAlt, color: "from-slate-500 to-gray-600", bgColor: "bg-slate-500" },
];

const DAY_MAP = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export default function Dashboard() {
  const themeContext = useTheme();
  const [userName, setUserName] = useState(null);
  const [points, setPoints] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loadingActivity, setLoadingActivity] = useState(true);
  const [collectionSchedules, setCollectionSchedules] = useState([]);
  const [submissionSchedules, setSubmissionSchedules] = useState([]); 
  const [loadingSchedules, setLoadingSchedules] = useState(true);
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(true);
  const [monthlySubmissions, setMonthlySubmissions] = useState(0);
  const [weeklySubmissions, setWeeklySubmissions] = useState(0);
  const navigate = useNavigate();
  const [loadingUser, setLoadingUser] = useState(true);
  const [error, setError] = useState(null);
  const [isPWA, setIsPWA] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  // Stable auth uid from onAuthStateChanged — never null at listener setup
  const [currentUserId, setCurrentUserId] = useState(null);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // ── Analytics state ──────────────────────────────────────────────────────────
  const [submissionStreak,  setSubmissionStreak]  = useState(0);
  // Register home tab + listen for back-button tab pops
  useEffect(() => {
    setDefaultTab("/dashboard", "overview");
    const handler = (e) => {
      if (e.detail.pathname === "/dashboard") setActiveTab(e.detail.tabId);
    };
    window.addEventListener(TAB_BACK_EVENT, handler);
    return () => window.removeEventListener(TAB_BACK_EVENT, handler);
  }, []);

  useEffect(() => {
    const checkPWA = () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      const isIOSStandalone = window.navigator.standalone === true;
      setIsPWA(isStandalone || isIOSStandalone);
    };
    checkPWA();
  }, []);

  // Resolve uid after Firebase rehydrates session — all listeners depend on this
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setCurrentUserId(u ? u.uid : null);
    });
    return () => unsub();
  }, []);

  // Fetch Schedules (Live Sync)
  useEffect(() => {
    if (!currentUserId) return;
    const schedulesRef = collection(db, "collection_schedules");
    const schedulesQuery = query(schedulesRef, where("isActive", "==", true));

    const unsubscribe = onSnapshot(
      schedulesQuery,
      (snapshot) => {
        const schedulesData = snapshot.docs.map((doc) => ({
          id: doc.id,
          type: "collection", 
          ...doc.data(),
        }));
        setCollectionSchedules(schedulesData);
        setLoadingSchedules(false); 
      },
      (error) => {
        console.error("Error fetching collection schedules:", error);
        setLoadingSchedules(false);
      }
    );

    return () => unsubscribe();
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) return;
    const schedulesRef = collection(db, "submission_schedules");
    const schedulesQuery = query(schedulesRef, where("isActive", "==", true));

    const unsubscribe = onSnapshot(
      schedulesQuery,
      (snapshot) => {
        const schedulesData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setSubmissionSchedules(schedulesData); 
      },
      (error) => {
        console.error("Error fetching submission schedules:", error);
      }
    );

    return () => unsubscribe();
  }, [currentUserId]); 

  // Fetch leaderboard data (Live Sync)
  useEffect(() => {
    if (!currentUserId) return;
    setLoadingLeaderboard(true);
    const usersRef = collection(db, "users");
    const q = query(usersRef, orderBy("totalPoints", "desc"), limit(5));
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const leaderboard = querySnapshot.docs.map((doc, index) => ({
        id: doc.id,
        rank: index + 1,
        username: doc.data().username || "Anonymous",
        points: doc.data().totalPoints || 0,
        isCurrentUser: doc.id === currentUserId
      }));
      
      setLeaderboardData(leaderboard);
      setLoadingLeaderboard(false);
    }, (error) => {
      console.error("Error fetching leaderboard data:", error);
      setLoadingLeaderboard(false);
    });

    return () => unsubscribe();
  }, [currentUserId]);

  // Fetch user submission data (Live Sync - calculates streak, weekly, and monthly)
  useEffect(() => {
    if (!currentUserId) return;

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0,0,0,0);
    
    const wasteQuery = query(
      collection(db, "waste_submissions"),
      where("userId", "==", currentUserId)
    );

    const unsubscribe = onSnapshot(wasteQuery, (wasteSnapshot) => {
      let monthlyCount = 0;
      let weeklyCount = 0;
      const submissionDays = new Set();
      
      wasteSnapshot.forEach((doc) => {
        const data = doc.data();
        // submittedAt is a Firestore Timestamp — must call .toDate()
        const submissionDate = data.submittedAt?.toDate?.() ?? null;
        
        if (submissionDate && submissionDate.getTime() > 0) {
          if (submissionDate >= startOfMonth) {
            monthlyCount++;
          }
          if (submissionDate >= startOfWeek) {
            weeklyCount++;
          }
          submissionDays.add(submissionDate.toDateString());
        }
      });
      
      setMonthlySubmissions(monthlyCount);
      setWeeklySubmissions(weeklyCount);

      // Streak Calculation
      let streak = 0;
      const today = new Date();
      for (let i = 0; i < 60; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        if (submissionDays.has(d.toDateString())) streak++;
        else if (i > 0) break; // allow today to be missing
      }
      setSubmissionStreak(streak);
    });

    return () => unsubscribe();
  }, [currentUserId]);

  // Generate achievements based on points
  const generateAchievements = (points) => {
    const allAchievements = [
      { name: "First Steps", icon: "🌱", description: "Earned your first 100 points", requiredPoints: 100, unlocked: points >= 100 },
      { name: "Eco Advocate", icon: "🌿", description: "Reached 500 points milestone", requiredPoints: 500, unlocked: points >= 500 },
      { name: "Eco Hero", icon: "🌳", description: "Achieved 1000 points!", requiredPoints: 1000, unlocked: points >= 1000 },
      { name: "Green Champion", icon: "🌍", description: "Outstanding 2000+ points", requiredPoints: 2000, unlocked: points >= 2000 },
    ];
    return allAchievements;
  };

  // Fetch user details when clicked
  const handleUserClick = async (user, rank) => {
    setModalLoading(true);
    setShowModal(true);
    try {
      const userDocRef = doc(db, 'users', user.id);
      const userDoc = await getDoc(userDocRef);
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const achievements = generateAchievements(userData.totalPoints || 0);
        setSelectedUser({
          ...user,
          ...userData,
          rank,
          achievements,
        });
      } else {
        setSelectedUser({
          ...user,
          rank,
          achievements: generateAchievements(user.totalPoints || 0),
        });
      }
    } catch (err) {
      console.error("Error fetching user details:", err);
      setSelectedUser({
        ...user,
        rank,
        achievements: generateAchievements(user.totalPoints || 0),
      });
    } finally {
      setModalLoading(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setTimeout(() => setSelectedUser(null), 300);
  };

  const allSchedules = useMemo(() => {
    return [
      ...collectionSchedules.map(schedule => ({
        ...schedule,
        title: `Collection: ${schedule.area || schedule.barangay || 'Area'}`,
      })),
      ...submissionSchedules.map(schedule => ({
        ...schedule,
        title: `Submission: ${schedule.area || schedule.barangay || 'Center'}`,
      })),
    ];
  }, [collectionSchedules, submissionSchedules]);

  const getNextCollectionDate = () => {
    if (collectionSchedules.length === 0) {
      return null;
    }

    const today = new Date();
    const currentDay = today.getDay();
    const currentTime = today.getHours() * 60 + today.getMinutes();

    let nearestCollection = null;
    let minDaysAway = Infinity;
    for (const schedule of collectionSchedules) {
      const scheduleDayNum = DAY_MAP[schedule.day.toLowerCase()];
      
      const [startHours, startMinutes] = schedule.startTime.split(':').map(Number);
      const scheduleTime = startHours * 60 + startMinutes;

      let daysUntil = scheduleDayNum - currentDay;
      if (daysUntil < 0 || (daysUntil === 0 && currentTime >= scheduleTime)) {
        daysUntil += 7;
      }

      if (daysUntil < minDaysAway) {
        minDaysAway = daysUntil;
        const collectionDate = new Date(today);
        collectionDate.setDate(today.getDate() + daysUntil);
        collectionDate.setHours(startHours, startMinutes, 0, 0);
        nearestCollection = {
          date: collectionDate,
          schedule: schedule
        };
      }
    }
    return nearestCollection;
  };

  const getNextSubmissionDate = () => {
    if (submissionSchedules.length === 0) {
      return null;
    }

    const today = new Date();
    const currentDay = today.getDay();
    const currentTime = today.getHours() * 60 + today.getMinutes();

    let nearestSubmission = null;
    let minDaysAway = Infinity;
    for (const schedule of submissionSchedules) {
      const scheduleDayNum = DAY_MAP[schedule.day.toLowerCase()];
      
      const [startHours, startMinutes] = schedule.startTime.split(':').map(Number);
      const scheduleTime = startHours * 60 + startMinutes;

      let daysUntil = scheduleDayNum - currentDay;
      if (daysUntil < 0 || (daysUntil === 0 && currentTime >= scheduleTime)) {
        daysUntil += 7;
      }

      if (daysUntil < minDaysAway) {
        minDaysAway = daysUntil;
        const submissionDate = new Date(today);
        submissionDate.setDate(today.getDate() + daysUntil);
        submissionDate.setHours(startHours, startMinutes, 0, 0);
        nearestSubmission = {
          date: submissionDate,
          schedule: schedule
        };
      }
    }
    return nearestSubmission;
  };

  // Live User Points/Name sync
  useEffect(() => {
    if (!currentUserId) return;
    const userRef = doc(db, "users", currentUserId);
    const unsubscribeUser = onSnapshot(
      userRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setUserName(data.username || "User");
          setPoints(data.totalPoints ?? 0);
          setError(null);
        } else {
          setError("User data not found");
        }
        setLoadingUser(false);
      },
      (error) => {
        console.error("User listener error:", error);
        setError(error.message);
        setLoadingUser(false);
      }
    );

    return () => {
      unsubscribeUser();
    };
  }, [currentUserId]);

  // Fetch Recent Activity (Live Sync)
  useEffect(() => {
    if (!currentUserId) return;
    setLoadingActivity(true);

    const uid = currentUserId;
    const toMs = (ts) => {
      if (!ts) return 0;
      if (typeof ts.toMillis === "function") return ts.toMillis();
      if (typeof ts.toDate === "function") return ts.toDate().getTime();
      if (typeof ts.seconds === "number") return ts.seconds * 1000;
      return Number(ts) || 0;
    };

    const wasteQuery  = query(collection(db, "waste_submissions"),  where("userId", "==", uid));
    const transQuery  = query(collection(db, "point_transactions"), where("userId", "==", uid));
    const redeemQuery = query(collection(db, "redemptions"),        where("userId", "==", uid));

    // Use an object so every listener closure always reads the latest array
    // from its siblings — plain `let` variables get stale when closures capture
    // them at definition time and one fires before the others have loaded.
    const acts = { waste: [], trans: [], redeem: [] };

    const merge = () => {
      const combined = [...acts.waste, ...acts.trans, ...acts.redeem];
      combined.sort((a, b) => toMs(b.rawTimestamp) - toMs(a.rawTimestamp));
      setRecentActivity(combined.slice(0, 5));
      setLoadingActivity(false);
    };

    const unsubWaste = onSnapshot(wasteQuery, (snapshot) => {
      acts.waste = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        const ts = d.submittedAt;
        if (!ts || toMs(ts) === 0) return;
        const weight    = Number(d.weight || d.totalWeight || 0);
        const pts       = Number(d.points || d.pointsEarned || 0);
        const typeName  = d.type || d.wasteType || "Waste";
        if (!typeName && weight <= 0) return;
        acts.waste.push({
          id:           docSnap.id,
          type:         "waste_submission",
          description:  `Submitted ${typeName}${weight > 0 ? ` — ${weight}kg` : ""}`,
          points:       pts,
          rawTimestamp: ts,
          timestamp:    typeof ts.toDate === "function" ? ts.toDate() : new Date(toMs(ts)),
          icon:         FaRecycle,
          color:        "emerald",
        });
      });
      merge();
    });

    const unsubTrans = onSnapshot(transQuery, (snapshot) => {
      acts.trans = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        const ts = d.timestamp || d.createdAt;
        if (!ts || toMs(ts) === 0) return;
        const pts          = Number(d.points || d.amount || 0);
        const isRedeemed   = d.type === "points_redeemed";
        const isAwarded    = d.type === "points_awarded";
        if (!isAwarded && !isRedeemed) return;
        if (pts <= 0 && isAwarded) return;
        acts.trans.push({
          id:           docSnap.id,
          type:         isRedeemed ? "reward_redemption" : "points_earned",
          description:  d.description || (isRedeemed ? `Redeemed reward` : `Points awarded`),
          points:       isRedeemed ? -Math.abs(pts) : pts,
          rawTimestamp: ts,
          timestamp:    typeof ts.toDate === "function" ? ts.toDate() : new Date(toMs(ts)),
          icon:         isRedeemed ? FaGift : FaTrophy,
          color:        isRedeemed ? "amber" : "blue",
        });
      });
      merge();
    });

    const unsubRedeem = onSnapshot(redeemQuery, (snapshot) => {
      acts.redeem = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        const ts = d.redeemedAt || d.createdAt;
        if (!ts || toMs(ts) === 0) return;
        const cost = Number(d.cost || d.points || d.amount || 0);
        acts.redeem.push({
          id:           docSnap.id,
          type:         "reward_redemption",
          description:  `Redeemed: ${d.rewardName || "reward"}`,
          points:       -Math.abs(cost),
          rawTimestamp: ts,
          timestamp:    typeof ts.toDate === "function" ? ts.toDate() : new Date(toMs(ts)),
          icon:         FaGift,
          color:        "amber",
        });
      });
      merge();
    });

    return () => {
      unsubWaste();
      unsubTrans();
      unsubRedeem();
    };
  }, [currentUserId]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!themeContext) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
        <div className="flex flex-col items-center">
          <img 
            src={logo} 
            alt="Loading..." 
            className="w-16 h-16 rounded-2xl shadow-xl object-cover mb-4 animate-bounce" 
          />
          <p className="text-gray-500 dark:text-gray-400 font-medium animate-pulse">
            Loading Dashboard...
          </p>
        </div>
      </div>
    );
  }

  const { styles, isDark } = themeContext;

  const getThemeClass = (styleKey, fallback = "") =>
    styles?.[styleKey] || fallback;

  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  };

  const handleNavigation = (item) => {
    setActiveTab(item.id);
    setSidebarOpen(false);
    pushTab("/dashboard", item.id);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/login");
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  const isToday = (date) => {
    if (!(date instanceof Date) || isNaN(date.getTime())) return false;
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const formatRelativeTime = (date) => {
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) return "Just now";
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  const formatTime = (time) => {
    try {
      const [hours, minutes] = time.split(":");
      const date = new Date();
      date.setHours(parseInt(hours), parseInt(minutes));
      return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
    } catch {
      return time;
    }
  };

  const formatTimeRange = (start, end) => {
    return `${formatTime(start)} - ${formatTime(end)}`;
  };

  const nextCollection = getNextCollectionDate();
  const nextSubmission = getNextSubmissionDate();

  // Find user's rank in leaderboard
  const userRank = leaderboardData.findIndex(user => user.isCurrentUser) + 1;

  if (isPWA) {
    return (
      <div className={`min-h-screen ${isDark ? 'bg-gray-950' : 'bg-gray-50'} ${calendarOpen ? 'overflow-hidden' : ''}`}>
        <div className={`sticky top-0 z-[1000] ${isDark ? 'bg-gray-900/95' : 'bg-white/95'} border-b ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img 
                src={logo} 
                alt="EcoSort Logo" 
                className="w-10 h-10 rounded-2xl object-cover shadow-lg shadow-emerald-500/30" 
              />
              <div>
                <h1 className={`text-lg font-black ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  ECOSORT
                </h1>
                <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  {getGreeting()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <NotificationCenter userId={currentUserId} />
              <button
                onClick={() => navigate("/profile")}
                className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg active:scale-95 transition-transform"
              >
                <FiUser className="text-white text-lg" />
              </button>
            </div>
          </div>
        </div>

        <div className="px-4 pt-4 pb-28">
          {activeTab === "overview" ? (
            <div className="space-y-4">
              <div className={`rounded-3xl overflow-hidden shadow-2xl ${isDark ? 'bg-gradient-to-br from-emerald-600 to-teal-700' : 'bg-gradient-to-br from-emerald-500 to-teal-600'}`}>
                <div className="p-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
                  <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full -ml-12 -mb-12"></div>
                  <div className="relative z-10">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1">
                        <p className="text-emerald-100 text-sm font-medium mb-2">Your Eco Points</p>
                        <div className="flex items-baseline gap-2">
                          <h2 className="text-5xl font-black text-white">
                            {loadingUser ? "..." : points || 0}
                          </h2>
                          <span className="text-emerald-100 text-lg">pts</span>
                        </div>
                      </div>
                      
                      <div className="flex flex-col items-center">
                        <button
                          onClick={() => setShowLeaderboard(!showLeaderboard)}
                          className={`p-2 rounded-xl ${isDark ? 'bg-white/20 hover:bg-white/30' : 'bg-emerald-100 hover:bg-emerald-200'} transition-all active:scale-95`}
                          title="View Leaderboard"
                        >
                          <FaTrophy className="text-yellow-300 text-2xl" />
                        </button>
                        <span className="text-emerald-100 text-xs font-medium mt-1">
                          Rank #{userRank}
                        </span>
                        <span className="text-emerald-100 text-xs">
                          Click to view
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {showLeaderboard && (
                  <div className={`${isDark ? 'bg-gray-900/90' : 'bg-white/90'} backdrop-blur-sm p-4 border-t ${isDark ? 'border-emerald-700' : 'border-emerald-400'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className={`text-base font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Top Recyclers</h3>
                      <FaUsers className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                    </div>
                    
                    {loadingLeaderboard ? (
                      <div className="flex justify-center py-4">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-500 border-t-transparent"></div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {leaderboardData.map((user) => (
                          <div 
                            key={user.id} 
                            onClick={() => handleUserClick(user, user.rank)}
                            className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer ${user.isCurrentUser ? (isDark ? 'bg-emerald-800/30' : 'bg-emerald-100') : ''}`}
                          >
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                              user.rank === 1 ? 'bg-yellow-500 text-white' : 
                              user.rank === 2 ? 'bg-gray-400 text-white' : 
                              user.rank === 3 ? 'bg-amber-600 text-white' : 
                              isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-600'
                            }`}>
                              {user.rank}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                {user.username}
                                {user.isCurrentUser && (
                                  <span className={`ml-1 text-xs ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}> (You)</span>
                                )}
                              </p>
                            </div>
                            <span className={`text-sm font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                              {user.points}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className={`rounded-2xl p-4 ${isDark ? 'bg-gray-900 border border-gray-800' : 'bg-white border border-gray-200'} shadow-sm`}>
                  <p className={`text-xs font-semibold mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>This Month</p>
                  <p className={`text-2xl font-black ${isDark ? 'text-white' : 'text-gray-900'}`}>{monthlySubmissions}</p>
                  <p className={`text-xs ${isDark ? 'text-emerald-400' : 'text-emerald-600'} font-medium`}>submissions</p>
                </div>
                <div className={`rounded-2xl p-4 ${isDark ? 'bg-gray-900 border border-gray-800' : 'bg-white border border-gray-200'} shadow-sm`}>
                  <p className={`text-xs font-semibold mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>This Week</p>
                  <p className={`text-2xl font-black ${isDark ? 'text-white' : 'text-gray-900'}`}>{weeklySubmissions}</p>
                  <p className={`text-xs ${isDark ? 'text-blue-400' : 'text-blue-600'} font-medium`}>submissions</p>
                </div>
                <div className={`rounded-2xl p-4 ${isDark ? 'bg-gray-900 border border-gray-800' : 'bg-white border border-gray-200'} shadow-sm`}>
                  <p className={`text-xs font-semibold mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Your Streak</p>
                  <p className={`text-2xl font-black ${submissionStreak >= 3 ? 'text-orange-500' : isDark ? 'text-white' : 'text-gray-900'}`}>
                    {submissionStreak > 0 ? `🔥 ${submissionStreak}` : '—'}
                  </p>
                  <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} font-medium`}>day streak</p>
                </div>
                <div className={`rounded-2xl p-4 ${isDark ? 'bg-gray-900 border border-gray-800' : 'bg-white border border-gray-200'} shadow-sm`}>
                  <p className={`text-xs font-semibold mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Your Rank</p>
                  <p className={`text-2xl font-black ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>
                    {userRank ? `#${userRank}` : '—'}
                  </p>
                  <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} font-medium`}>leaderboard</p>
                </div>
              </div>

              <div className={`rounded-3xl p-5 ${isDark ? 'bg-gray-900 border border-gray-800' : 'bg-white border border-gray-200'} shadow-lg`}>
                {/* Header */}
                <div className="flex items-center justify-between mb-1">
                  <h3 className={`text-base font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Schedule Calendar
                  </h3>
                  <DashboardCalendar
                    selectedDate={selectedDate}
                    setSelectedDate={setSelectedDate}
                    isDark={isDark}
                    schedules={allSchedules}
                    onOpenChange={setCalendarOpen}
                  />
                </div>
                <p className={`text-xs mb-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  View upcoming waste collection and submission schedules in your area.
                </p>
                {/* Legend */}
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0" />
                    <span className={`text-[11px] font-medium ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>Collection Day</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
                    <span className={`text-[11px] font-medium ${isDark ? 'text-green-400' : 'text-green-600'}`}>Submission Day</span>
                  </div>
                </div>
              </div>

              {nextCollection && (
                <div className={`rounded-3xl p-5 ${isDark ? 'bg-gray-900 border border-gray-800' : 'bg-white border border-gray-200'} shadow-lg`}>
                  <div className="flex items-center gap-3 mb-4">
                    <div>
                      <h3 className={`text-base font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        Garbage Collection
                      </h3>
                      <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        {isToday(nextCollection.date) ? 'Today' : nextCollection.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-stretch gap-3">
                    <div className={`flex-1 rounded-2xl p-4 h-full ${isDark ? 'bg-gray-800' : 'bg-gray-50'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Collection Time</span>
                      </div>
                      <p className={`text-sm font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {formatTime(nextCollection.schedule.startTime)}
                      </p>
                    </div>
                    {nextCollection.schedule.area && (
                      <div className={`flex-1 rounded-2xl p-4 h-full ${isDark ? 'bg-gray-800' : 'bg-gray-50'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Location</span>
                        </div>
                        <p className={`text-sm font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {nextCollection.schedule.area}
                          {nextCollection.schedule.barangay && `, ${nextCollection.schedule.barangay}`}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
                            
              {nextSubmission && (
                <div className={`rounded-3xl p-5 ${isDark ? 'bg-gray-900 border border-gray-800' : 'bg-white border border-gray-200'} shadow-lg`}>
                  <div className="flex items-center gap-3 mb-4">
                    <div>
                      <h3 className={`text-base font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        Recyclable Waste Submission
                      </h3>
                      <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        {isToday(nextSubmission.date) ? 'Today' : nextSubmission.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-stretch gap-3">
                    <div className={`flex-1 rounded-2xl p-4 h-full ${isDark ? 'bg-gray-800' : 'bg-gray-50'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Operating Hours</span>
                      </div>
                      <p className={`text-sm font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {formatTimeRange(nextSubmission.schedule.startTime, nextSubmission.schedule.endTime)}
                      </p>
                    </div>
                    {nextSubmission.schedule.area && (
                      <div className={`flex-1 rounded-2xl p-4 h-full ${isDark ? 'bg-gray-800' : 'bg-gray-50'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Location</span>
                        </div>
                        <p className={`text-sm font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {nextSubmission.schedule.area}
                          {nextSubmission.schedule.barangay && `, ${nextSubmission.schedule.barangay}`}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {recentActivity.length > 0 ? (
                <div>
                  <h3 className={`text-sm font-bold mb-3 px-1 ${isDark ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider`}>
                    Recent Activity
                  </h3>
                  <div className={`rounded-3xl ${isDark ? 'bg-gray-900 border border-gray-800' : 'bg-white border border-gray-200'} shadow-lg divide-y ${isDark ? 'divide-gray-800' : 'divide-gray-100'}`}>
                    {recentActivity.slice(0, 3).map((activity) => (
                      <div key={activity.id} className="p-4 flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-2xl bg-${activity.color}-500/20 flex items-center justify-center flex-shrink-0`}>
                          <activity.icon className={`text-${activity.color}-500 text-lg`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'} truncate`}>
                            {activity.description}
                          </p>
                          <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            {formatRelativeTime(activity.timestamp)}
                          </p>
                        </div>
                        <span className={`text-sm font-bold ${activity.points > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                          {activity.points > 0 ? '+' : ''}{activity.points}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : !loadingActivity && (
                <div>
                  <h3 className={`text-sm font-bold mb-3 px-1 ${isDark ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider`}>
                    Recent Activity
                  </h3>
                  <div className={`rounded-3xl p-6 text-center ${isDark ? 'bg-gray-900 border border-gray-800' : 'bg-white border border-gray-200'} shadow-lg`}>
                    <FaRecycle className={`text-3xl mx-auto mb-2 ${isDark ? 'text-gray-600' : 'text-gray-300'}`} />
                    <p className={`text-sm font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>No activity yet</p>
                    <p className={`text-xs mt-1 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>Submit waste to get started!</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="pb-4">
              {activeTab === "submit" && <SubmitWaste />}
              {activeTab === "rewards" && <Rewards />}
              {activeTab === "report" && <Forum sidebarOpen={false} />}
              {activeTab === "leaderboard" && <Leaderboard />}
              {activeTab === "transactions" && <Transactions />}
            </div>
          )}
        </div>

        <div className={`fixed bottom-0 left-0 right-0 ${isDark ? 'bg-gray-900/95 border-gray-800' : 'bg-white/95 border-gray-200'} border-t backdrop-blur-xl z-50`}>
          <div className="px-2 py-3">
            <div className="flex items-center justify-around overflow-x-auto">
              {APP_MENU_ITEMS.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavigation(item)}
                    className="flex flex-col items-center gap-1 px-3 py-1 min-w-0 active:scale-95 transition-transform"
                  >
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all ${
                      isActive 
                        ? `bg-gradient-to-br ${item.color} shadow-lg shadow-${item.color.split('-')[1]}-500/30` 
                        : `${isDark ? 'bg-gray-800' : 'bg-gray-100'}`
                    }`}>
                      <item.icon className={`text-lg ${isActive ? 'text-white' : isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                    </div>
                    <span className={`text-[10px] font-bold truncate max-w-[60px] ${
                      isActive 
                        ? 'text-emerald-500' 
                        : isDark ? 'text-gray-400' : 'text-gray-500'
                    }`}>
                      {item.title}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
         <UpdateBanner />
         
         {showModal && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn"
              onClick={closeModal}
            >
              <div
                className={`relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl shadow-2xl animate-slideUp ${
                  isDark ? "bg-gray-800 text-gray-200" : "bg-white text-gray-900"
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={closeModal}
                  className={`absolute top-4 right-4 z-10 p-2 rounded-full transition-all duration-300 hover:scale-110 ${
                    isDark
                      ? "bg-gray-700 hover:bg-gray-600 text-gray-300"
                      : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                  }`}
                >
                  <FiX className="w-5 h-5" />
                </button>

                {modalLoading ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-500 border-t-transparent mb-4"></div>
                    <p className={`text-base ${isDark ? "text-gray-400" : "text-gray-600"}`}>Loading profile...</p>
                  </div>
                ) : selectedUser ? (
                  <>
                    <div className={`p-8 border-b ${isDark ? "border-gray-700" : "border-gray-200"}`}>
                      <div className="flex flex-col sm:flex-row items-center gap-6">
                        <div className="relative">
                          {selectedUser.profileUrl ? (
                            <img
                              src={selectedUser.profileUrl}
                              alt="Profile"
                              className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-xl"
                            />
                          ) : (
                            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center border-4 border-white shadow-xl">
                              <FiUser size={36} className="text-gray-600" />
                            </div>
                          )}
                          <div className={`absolute -bottom-2 left-1/2 transform -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold shadow-lg ${
                            selectedUser.rank === 1
                              ? "bg-gradient-to-r from-yellow-400 to-yellow-500 text-yellow-900"
                              : selectedUser.rank === 2
                              ? "bg-gradient-to-r from-gray-300 to-gray-400 text-gray-900"
                              : selectedUser.rank === 3
                              ? "bg-gradient-to-r from-amber-600 to-amber-700 text-white"
                              : isDark
                              ? "bg-gray-700 text-gray-300"
                              : "bg-gray-200 text-gray-700"
                          }`}>
                            #{selectedUser.rank}
                          </div>
                        </div>

                        <div className="flex-1 text-center sm:text-left">
                          <h2 className={`text-2xl font-bold mb-2 ${isDark ? "text-gray-100" : "text-gray-900"}`}>
                            {selectedUser.username || selectedUser.email || 'Anonymous'}
                          </h2>
                          <p className={`text-sm mb-3 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                            {selectedUser.email}
                          </p>
                          <div className="flex items-center justify-center sm:justify-start gap-4">
                            <div className={`px-4 py-2 rounded-xl ${isDark ? "bg-gray-700" : "bg-emerald-50"}`}>
                              <div className={`text-2xl font-bold ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>
                                {(selectedUser.totalPoints || 0).toLocaleString()}
                              </div>
                              <div className={`text-xs ${isDark ? "text-emerald-500" : "text-emerald-600"}`}>Points</div>
                            </div>
                            <div className={`px-4 py-2 rounded-xl ${isDark ? "bg-gray-700" : "bg-blue-50"}`}>
                              <div className={`text-2xl font-bold ${isDark ? "text-blue-400" : "text-blue-700"}`}>
                                #{selectedUser.rank}
                              </div>
                              <div className={`text-xs ${isDark ? "text-blue-500" : "text-blue-600"}`}>Rank</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-8">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className={`text-xl font-bold flex items-center ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                          <FaTrophy className="mr-2 text-2xl" /> Achievements
                        </h3>
                        <span className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                          {selectedUser.achievements?.filter(a => a.unlocked).length || 0} of {selectedUser.achievements?.length || 0} unlocked
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {selectedUser.achievements?.map((achievement, index) => (
                          <div
                            key={index}
                            className={`rounded-xl p-4 border transition-all duration-300 relative ${
                              achievement.unlocked
                                ? `${
                                    isDark ? "bg-yellow-800/20 border-yellow-600/30" : "bg-yellow-50 border-amber-200"
                                  }`
                                : `${
                                    isDark 
                                      ? "bg-gray-700/30 border-gray-600/30 opacity-60" 
                                      : "bg-gray-50 border-gray-200 opacity-70"
                                  }`
                            }`}
                          >
                            {achievement.unlocked && (
                              <div className="absolute top-2 right-2 bg-green-500 rounded-full p-1">
                                <FaCheckCircle className="w-3 h-3 text-white" />
                              </div>
                            )}

                            <div className="flex items-start space-x-3">
                              <div 
                                className={`text-3xl flex-shrink-0 ${
                                  achievement.unlocked ? "" : "grayscale opacity-40"
                                }`}
                              >
                                {achievement.icon}
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 
                                  className={`font-bold text-base mb-1 ${
                                    achievement.unlocked 
                                      ? (isDark ? "text-yellow-300" : "text-amber-800")
                                      : (isDark ? "text-gray-400" : "text-gray-600")
                                  }`}
                                >
                                  {achievement.name}
                                </h4>
                                <p 
                                  className={`text-xs ${
                                    achievement.unlocked 
                                      ? (isDark ? "text-yellow-400" : "text-amber-600")
                                      : (isDark ? "text-gray-500" : "text-gray-500")
                                  }`}
                                >
                                  {achievement.description}
                                </p>

                                {!achievement.unlocked && (
                                  <div className="mt-2">
                                    <div className={`w-full rounded-full h-1 ${isDark ? "bg-gray-600" : "bg-gray-200"}`}>
                                      <div
                                        className="bg-gradient-to-r from-blue-400 to-blue-500 h-1 rounded-full transition-all duration-500"
                                        style={{ 
                                          width: `${Math.min(((selectedUser.totalPoints || 0) / achievement.requiredPoints) * 100, 100)}%` 
                                        }}
                                      ></div>
                                    </div>
                                    <p className={`text-xs mt-1 ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                                      {achievement.requiredPoints - (selectedUser.totalPoints || 0)} points to unlock
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className={`mt-6 p-4 rounded-xl ${isDark ? "bg-blue-900/20 border border-blue-700/30" : "bg-blue-50 border border-blue-200"}`}>
                        <p className={`text-center text-sm ${isDark ? "text-blue-300" : "text-blue-800"}`}>
                          {selectedUser.achievements?.filter(a => a.unlocked).length === selectedUser.achievements?.length
                            ? "🎉 All achievements unlocked! You're an eco champion!"
                            : selectedUser.achievements?.filter(a => a.unlocked).length > 0
                            ? "Keep going! More achievements await!"
                            : "Start your eco journey to unlock achievements!"}
                        </p>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          )}
      </div>
    );
  }

  const sidebarGroups = [
    {
      group: "Main",
      items: WEB_MENU_ITEMS.filter(m => ["overview"].includes(m.id)),
    },
    {
      group: "Actions",
      items: WEB_MENU_ITEMS.filter(m => ["submit", "rewards"].includes(m.id)),
    },
    {
      group: "Community",
      items: WEB_MENU_ITEMS.filter(m => ["report", "leaderboard"].includes(m.id)),
    },
    {
      group: "History",
      items: WEB_MENU_ITEMS.filter(m => ["transactions"].includes(m.id)),
    },
  ];

  const activeMenuItem = WEB_MENU_ITEMS.find(m => m.id === activeTab);

  return (
    <div className={`min-h-screen ${isDark ? "bg-gray-900" : "bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100"}`}>

      <header className={`lg:hidden backdrop-blur-md fixed top-0 left-0 right-0 z-40 border-b ${
        isDark ? "bg-gray-800/90 text-gray-200 border-gray-700" : "bg-white/90 text-slate-900 border-slate-200/50"
      } shadow-sm`}>
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
                  ECOSORT
                </h1>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <NotificationCenter userId={currentUserId} />
              <div className="flex items-center space-x-2 cursor-pointer group" onClick={() => navigate("/profile")}>
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/40 dark:to-teal-900/40 flex items-center justify-center group-hover:shadow-md transition-all">
                  <FiUser className={`w-4 h-4 ${isDark ? "text-emerald-400" : "text-emerald-600"}`} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex lg:h-screen lg:overflow-hidden pt-[56px] lg:pt-0">

        <aside className={`fixed inset-y-0 left-0 z-50 w-72 transform transition-all duration-300 ease-in-out ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0 lg:static ${
          isDark ? "bg-gradient-to-b from-gray-800 to-gray-900 border-r border-gray-700" : "bg-white border-r border-gray-200 shadow-xl"
        }`}>
          <div className="h-full flex flex-col">

            <div className={`p-6 border-b ${isDark ? "border-gray-700" : "border-gray-200"}`}>
              <div className="flex items-center gap-3">
                <img src={logo} alt="EcoSort Logo" className="w-12 h-12 rounded-xl shadow-lg object-cover" />
                <div>
                  <h1 className="text-xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                    ECOSORT
                  </h1>
                </div>
              </div>
            </div>

            <div className={`p-4 border-b ${isDark ? "border-gray-700" : "border-gray-200"}`}>
              <div
                onClick={() => navigate("/profile")}
                className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-emerald-500/10 to-teal-500/10 cursor-pointer hover:from-emerald-500/20 hover:to-teal-500/20 transition-all group"
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white font-bold group-hover:scale-110 transition-transform shrink-0">
                  <FiUser />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold truncate ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                    {userName || "User"}
                  </p>
                  <p className={`text-xs truncate ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                    {auth.currentUser?.email}
                  </p>
                </div>
              </div>
            </div>

            <nav className="flex-1 overflow-y-auto p-4 space-y-5 scrollbar-thin">
              {sidebarGroups.map(({ group, items }) => (
                <div key={group}>
                  <p className={`text-[10px] font-black uppercase tracking-widest mb-2 px-1 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                    {group}
                  </p>
                  <div className="space-y-0.5">
                    {items.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => handleNavigation(item)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative ${
                            isActive
                              ? isDark
                                ? "bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-400 shadow-sm"
                                : "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/25"
                              : isDark
                                ? "text-gray-400 hover:bg-gray-700/50 hover:text-gray-200"
                                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                          }`}
                        >
                          {isActive && (
                            <div className={`absolute left-0 w-1 h-5 rounded-r-full ${isDark ? "bg-emerald-400" : "bg-white/60"}`} />
                          )}
                          <span className={`text-base transition-transform ${isActive ? "scale-110" : "group-hover:scale-110"}`}>
                            <Icon />
                          </span>
                          <span className="font-medium flex-1 text-left text-sm">{item.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>

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

        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-md z-40 lg:hidden transition-opacity duration-300"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <div className="flex-1 flex flex-col min-w-0 lg:overflow-hidden relative">

          <header className={`hidden lg:block border-b transition-colors shrink-0 ${
            isDark ? "bg-gray-800/50 border-gray-700 text-gray-100" : "bg-white/80 border-gray-200 text-gray-800"
          } backdrop-blur-md`}>
            <div className="px-8 py-4 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-extrabold tracking-tight">
                  {activeMenuItem?.title || "Dashboard"}
                </h2>
              </div>

              <div className="flex items-center gap-3">
                <NotificationCenter userId={currentUserId} />
                <div
                  onClick={() => navigate("/profile")}
                  className={`flex items-center gap-2.5 cursor-pointer px-3 py-2 rounded-xl border transition-colors ${
                    isDark ? "border-gray-700 hover:bg-gray-700/50" : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-bold leading-tight">{userName || "User"}</p>
                  </div>
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white shadow-md shrink-0">
                    <FiUser className="text-sm" />
                  </div>
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 lg:overflow-y-auto p-4 lg:p-8 scroll-smooth">
            {activeTab === "overview" && (
              <div className="space-y-6 animate-fadeIn">

                <div className={`relative overflow-hidden rounded-2xl p-6 ${
                  isDark
                    ? "bg-gradient-to-r from-emerald-900/60 to-teal-900/60 border border-emerald-700/40"
                    : "bg-gradient-to-r from-emerald-500 to-teal-600"
                }`}>
                  <div className="absolute -top-8 -right-8 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none" />
                  <div className="absolute -bottom-8 -left-4 w-32 h-32 bg-white/5 rounded-full blur-2xl pointer-events-none" />
                  <div className="relative z-10">
                    <p className="text-white/80 text-sm font-medium mb-1">{getGreeting()} 👋</p>
                    <h2 className="text-2xl font-extrabold text-white">{userName || "User"}</h2>
                    <p className="text-white/70 text-sm mt-1">
                      {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                  {[
                    { label: "Eco Points",        value: points || 0,                                          icon: <FaStar className="text-2xl"/>,      gradient: "from-amber-500 to-orange-500" },
                    { label: "Leaderboard Rank",  value: `#${userRank || "—"}`,                                icon: <FaTrophy className="text-2xl"/>,    gradient: "from-emerald-500 to-teal-500" },
                    { label: "This Month",        value: monthlySubmissions,                                   icon: <FaRecycle className="text-2xl"/>,   gradient: "from-blue-500 to-cyan-500" },
                    { label: "This Week",         value: weeklySubmissions,                                    icon: <FaCalendarAlt className="text-2xl"/>, gradient: "from-sky-500 to-blue-500" },
                    { label: "Day Streak",        value: submissionStreak > 0 ? `🔥 ${submissionStreak}` : 0, icon: <FaChartLine className="text-2xl"/>, gradient: "from-orange-500 to-red-500" },
                  ].map((stat, idx) => (
                    <div key={idx} className={`p-5 rounded-2xl transition-all group ${isDark ? "bg-gray-800/40 border border-gray-700 hover:border-gray-600" : "bg-white border border-gray-100 shadow-sm hover:shadow-md"}`}>
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-3 bg-gradient-to-br ${stat.gradient} text-white shadow-md group-hover:scale-110 transition-transform`}>
                        {stat.icon}
                      </div>
                      <div className="text-2xl font-black mb-0.5">{typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}</div>
                      <div className={`text-xs font-semibold uppercase tracking-wider ${isDark ? "text-gray-400" : "text-gray-500"}`}>{stat.label}</div>
                    </div>
                  ))}
                </div>

                <div className={`rounded-2xl border ${isDark ? "bg-gray-800/40 border-gray-700" : "bg-white border-gray-100 shadow-sm"}`}>
                  <div className={`px-5 py-4 border-b ${isDark ? "border-gray-700" : "border-gray-100"}`}>
                    <div className="flex items-center gap-2">
                      <FaChartBar className={isDark ? "text-emerald-400" : "text-emerald-600"} />
                      <h3 className="font-bold text-sm">Quick Actions</h3>
                    </div>
                  </div>
                  <div className="p-3 space-y-1.5">
                    {[
                      { label: "Submit Waste",    id: "submit",       icon: <FaRecycle />,      color: "from-emerald-500 to-teal-500" },
                      { label: "Browse Rewards",  id: "rewards",      icon: <FaGift />,         color: "from-amber-500 to-orange-500" },
                      { label: "Forum",           id: "report",       icon: <FaExclamationTriangle />, color: "from-red-500 to-rose-500" },
                      { label: "Leaderboard",     id: "leaderboard",  icon: <FaTrophy />,       color: "from-purple-500 to-pink-500" },
                      { label: "Transactions",    id: "transactions", icon: <FaFileAlt />,      color: "from-slate-500 to-gray-500" },
                    ].map(({ label, id, icon, color }) => (
                      <button
                        key={id}
                        onClick={() => handleNavigation(WEB_MENU_ITEMS.find(m => m.id === id))}
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

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

                      <div className="xl:col-span-2">
                        <div className={`rounded-2xl border h-full ${isDark ? "bg-gray-800/40 border-gray-700" : "bg-white border-gray-100 shadow-sm"}`}>
                          <div className={`px-5 py-4 border-b ${isDark ? "border-gray-700" : "border-gray-100"}`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <FaCalendarAlt className={isDark ? "text-emerald-400" : "text-emerald-600"} />
                                <h3 className="font-bold text-sm">Collection Calendar</h3>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0" />
                                  <span className={`text-[11px] font-medium ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>Collection</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <div className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
                                  <span className={`text-[11px] font-medium ${isDark ? 'text-green-400' : 'text-green-600'}`}>Submission</span>
                                </div>
                              </div>
                            </div>
                            <p className={`text-xs mt-1.5 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                              View upcoming waste collection and submission schedules in your area.
                            </p>
                          </div>
                          <div className="p-5">
                            <InlineCalendar
                              selectedDate={selectedDate}
                              setSelectedDate={setSelectedDate}
                              isDark={isDark}
                              schedules={allSchedules}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-6">

                        <div className={`rounded-2xl border ${isDark ? "bg-gray-800/40 border-gray-700" : "bg-white border-gray-100 shadow-sm"}`}>
                          <div className={`px-5 py-4 border-b ${isDark ? "border-gray-700" : "border-gray-100"}`}>
                            <div className="flex items-center gap-2">
                              <FaMapMarkerAlt className={isDark ? "text-blue-400" : "text-blue-600"} />
                              <h3 className="font-bold text-sm">Next Collection</h3>
                            </div>
                          </div>
                          <div className="p-4">
                            {loadingSchedules ? (
                              <div className="flex justify-center py-4">
                                <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-500 border-t-transparent" />
                              </div>
                            ) : !nextCollection ? (
                              <p className={`text-xs text-center py-4 ${isDark ? "text-gray-500" : "text-gray-400"}`}>No collection schedule available.</p>
                            ) : (
                              <div>
                                <div className={`text-2xl font-black mb-1 ${isDark ? "text-white" : "text-gray-900"}`}>
                                  {nextCollection.date.toLocaleDateString('en-US', { weekday: 'long' })}
                                </div>
                                <div className={`text-sm font-semibold mb-3 ${isDark ? "text-gray-300" : "text-gray-600"}`}>
                                  {nextCollection.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                                  {isToday(nextCollection.date) && (
                                    <span className="ml-2 inline-flex items-center px-2 py-0.5 bg-emerald-500 text-white text-[10px] font-black rounded-full">TODAY</span>
                                  )}
                                </div>
                                <div className={`text-xs rounded-xl px-3 py-2 ${isDark ? "bg-gray-700 text-gray-300" : "bg-gray-50 text-gray-600"}`}>
                                  ⏰ {formatTimeRange(nextCollection.schedule.startTime, nextCollection.schedule.endTime)}
                                  {nextCollection.schedule.area && <span className="ml-2">📍 {nextCollection.schedule.area}</span>}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {nextSubmission && (
                          <div className={`rounded-2xl border ${isDark ? "bg-gray-800/40 border-gray-700" : "bg-white border-gray-100 shadow-sm"}`}>
                            <div className={`px-5 py-4 border-b ${isDark ? "border-gray-700" : "border-gray-100"}`}>
                              <div className="flex items-center gap-2">
                                <FaRecycle className={isDark ? "text-emerald-400" : "text-emerald-600"} />
                                <h3 className="font-bold text-sm">Next Submission Drop-off</h3>
                              </div>
                            </div>
                            <div className="p-4">
                              <div className={`text-2xl font-black mb-1 ${isDark ? "text-white" : "text-gray-900"}`}>
                                {nextSubmission.date.toLocaleDateString('en-US', { weekday: 'long' })}
                              </div>
                              <div className={`text-sm font-semibold mb-3 ${isDark ? "text-gray-300" : "text-gray-600"}`}>
                                {nextSubmission.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                                {isToday(nextSubmission.date) && (
                                  <span className="ml-2 inline-flex items-center px-2 py-0.5 bg-emerald-500 text-white text-[10px] font-black rounded-full">TODAY</span>
                                )}
                              </div>
                              <div className={`text-xs rounded-xl px-3 py-2 ${isDark ? "bg-gray-700 text-gray-300" : "bg-gray-50 text-gray-600"}`}>
                                ⏰ {formatTimeRange(nextSubmission.schedule.startTime, nextSubmission.schedule.endTime)}
                                {nextSubmission.schedule.area && <span className="ml-2">📍 {nextSubmission.schedule.area}</span>}
                              </div>
                            </div>
                          </div>
                        )}

                        <div className={`rounded-2xl border ${isDark ? "bg-gray-800/40 border-gray-700" : "bg-white border-gray-100 shadow-sm"}`}>
                          <div className={`flex justify-between items-center px-5 py-4 border-b ${isDark ? "border-gray-700" : "border-gray-100"}`}>
                            <div className="flex items-center gap-2">
                              <FaChartLine className={isDark ? "text-emerald-400" : "text-emerald-600"} />
                              <h3 className="font-bold text-sm">Recent Activity</h3>
                            </div>
                            <button
                              onClick={() => handleNavigation(WEB_MENU_ITEMS.find(m => m.id === "transactions"))}
                              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${isDark ? "text-emerald-400 hover:bg-emerald-400/10" : "text-emerald-600 hover:bg-emerald-50"}`}
                            >
                              View All →
                            </button>
                          </div>
                          {loadingActivity ? (
                            <div className="flex justify-center py-8">
                              <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-500 border-t-transparent" />
                            </div>
                          ) : recentActivity.length > 0 ? (
                            <div className={`divide-y ${isDark ? "divide-gray-700/50" : "divide-gray-100"}`}>
                              {recentActivity.slice(0, 4).map((activity) => (
                                <div key={activity.id} className={`flex items-center gap-3 px-5 py-3 transition-colors ${isDark ? "hover:bg-gray-700/30" : "hover:bg-gray-50"}`}>
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0 bg-gradient-to-br ${activity.points > 0 ? "from-emerald-400 to-teal-500" : "from-rose-400 to-pink-500"}`}>
                                    {activity.points > 0 ? "+" : "−"}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-sm font-semibold truncate ${isDark ? "text-gray-200" : "text-gray-800"}`}>{activity.description}</p>
                                    <p className={`text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>{formatRelativeTime(activity.timestamp)}</p>
                                  </div>
                                  <span className={`text-sm font-extrabold ${activity.points > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                    {activity.points > 0 ? "+" : ""}{activity.points} pts
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="px-5 py-8 text-center">
                              <FaRecycle className={`text-3xl mx-auto mb-2 ${isDark ? "text-gray-600" : "text-gray-300"}`} />
                              <p className={`text-sm font-medium ${isDark ? "text-gray-400" : "text-gray-500"}`}>No activity yet</p>
                              <p className={`text-xs mt-1 ${isDark ? "text-gray-600" : "text-gray-400"}`}>Submit waste to start earning points!</p>
                            </div>
                          )}
                        </div>

                      </div>
                    </div>

                  </div>
                )}

                {/* TAB CONTENT RENDERING */}
                {activeTab === "submit" && <SubmitWaste />}
                {activeTab === "rewards" && <Rewards />}
                {activeTab === "report" && <Forum sidebarOpen={sidebarOpen} />}
                {activeTab === "leaderboard" && <Leaderboard />}
                {activeTab === "transactions" && <Transactions />}
              </main>
            </div>
          </div>

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn"
          onClick={closeModal}
        >
          <div
            className={`relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl shadow-2xl animate-slideUp ${
              isDark ? "bg-gray-800 text-gray-200" : "bg-white text-gray-900"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={closeModal}
              className={`absolute top-4 right-4 z-10 p-2 rounded-full transition-all duration-300 hover:scale-110 ${
                isDark
                  ? "bg-gray-700 hover:bg-gray-600 text-gray-300"
                  : "bg-gray-100 hover:bg-gray-200 text-gray-700"
              }`}
            >
              <FiX className="w-5 h-5" />
            </button>

            {modalLoading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-500 border-t-transparent mb-4"></div>
                <p className={`text-base ${isDark ? "text-gray-400" : "text-gray-600"}`}>Loading profile...</p>
              </div>
            ) : selectedUser ? (
              <>
                <div className={`p-8 border-b ${isDark ? "border-gray-700" : "border-gray-200"}`}>
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    <div className="relative">
                      {selectedUser.profileUrl ? (
                        <img
                          src={selectedUser.profileUrl}
                          alt="Profile"
                          className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-xl"
                        />
                      ) : (
                        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center border-4 border-white shadow-xl">
                          <FiUser size={36} className="text-gray-600" />
                        </div>
                      )}
                      <div className={`absolute -bottom-2 left-1/2 transform -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold shadow-lg ${
                        selectedUser.rank === 1
                          ? "bg-gradient-to-r from-yellow-400 to-yellow-500 text-yellow-900"
                          : selectedUser.rank === 2
                          ? "bg-gradient-to-r from-gray-300 to-gray-400 text-gray-900"
                          : selectedUser.rank === 3
                          ? "bg-gradient-to-r from-amber-600 to-amber-700 text-white"
                          : isDark
                          ? "bg-gray-700 text-gray-300"
                          : "bg-gray-200 text-gray-700"
                      }`}>
                        #{selectedUser.rank}
                      </div>
                    </div>

                    <div className="flex-1 text-center sm:text-left">
                      <h2 className={`text-2xl font-bold mb-2 ${isDark ? "text-gray-100" : "text-gray-900"}`}>
                        {selectedUser.username || selectedUser.email || 'Anonymous'}
                      </h2>
                      <p className={`text-sm mb-3 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                        {selectedUser.email}
                      </p>
                      <div className="flex items-center justify-center sm:justify-start gap-4">
                        <div className={`px-4 py-2 rounded-xl ${isDark ? "bg-gray-700" : "bg-emerald-50"}`}>
                          <div className={`text-2xl font-bold ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>
                            {(selectedUser.totalPoints || 0).toLocaleString()}
                          </div>
                          <div className={`text-xs ${isDark ? "text-emerald-500" : "text-emerald-600"}`}>Points</div>
                        </div>
                        <div className={`px-4 py-2 rounded-xl ${isDark ? "bg-gray-700" : "bg-blue-50"}`}>
                          <div className={`text-2xl font-bold ${isDark ? "text-blue-400" : "text-blue-700"}`}>
                            #{selectedUser.rank}
                          </div>
                          <div className={`text-xs ${isDark ? "text-blue-500" : "text-blue-600"}`}>Rank</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-8">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className={`text-xl font-bold flex items-center ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                      <FaTrophy className="mr-2 text-2xl" /> Achievements
                    </h3>
                    <span className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                      {selectedUser.achievements?.filter(a => a.unlocked).length || 0} of {selectedUser.achievements?.length || 0} unlocked
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {selectedUser.achievements?.map((achievement, index) => (
                      <div
                        key={index}
                        className={`rounded-xl p-4 border transition-all duration-300 relative ${
                          achievement.unlocked
                            ? `${
                                isDark ? "bg-yellow-800/20 border-yellow-600/30" : "bg-yellow-50 border-amber-200"
                              }`
                            : `${
                                isDark 
                                  ? "bg-gray-700/30 border-gray-600/30 opacity-60" 
                                  : "bg-gray-50 border-gray-200 opacity-70"
                              }`
                        }`}
                      >
                        {achievement.unlocked && (
                          <div className="absolute top-2 right-2 bg-green-500 rounded-full p-1">
                            <FaCheckCircle className="w-3 h-3 text-white" />
                          </div>
                        )}

                        <div className="flex items-start space-x-3">
                          <div 
                            className={`text-3xl flex-shrink-0 ${
                              achievement.unlocked ? "" : "grayscale opacity-40"
                            }`}
                          >
                            {achievement.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 
                              className={`font-bold text-base mb-1 ${
                                achievement.unlocked 
                                  ? (isDark ? "text-yellow-300" : "text-amber-800")
                                  : (isDark ? "text-gray-400" : "text-gray-600")
                              }`}
                            >
                              {achievement.name}
                            </h4>
                            <p 
                              className={`text-xs ${
                                achievement.unlocked 
                                  ? (isDark ? "text-yellow-400" : "text-amber-600")
                                  : (isDark ? "text-gray-500" : "text-gray-500")
                              }`}
                            >
                              {achievement.description}
                            </p>

                            {!achievement.unlocked && (
                              <div className="mt-2">
                                <div className={`w-full rounded-full h-1 ${isDark ? "bg-gray-600" : "bg-gray-200"}`}>
                                  <div
                                    className="bg-gradient-to-r from-blue-400 to-blue-500 h-1 rounded-full transition-all duration-500"
                                    style={{ 
                                      width: `${Math.min(((selectedUser.totalPoints || 0) / achievement.requiredPoints) * 100, 100)}%` 
                                    }}
                                  ></div>
                                </div>
                                <p className={`text-xs mt-1 ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                                  {achievement.requiredPoints - (selectedUser.totalPoints || 0)} points to unlock
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className={`mt-6 p-4 rounded-xl ${isDark ? "bg-blue-900/20 border border-blue-700/30" : "bg-blue-50 border border-blue-200"}`}>
                    <p className={`text-center text-sm ${isDark ? "text-blue-300" : "text-blue-800"}`}>
                      {selectedUser.achievements?.filter(a => a.unlocked).length === selectedUser.achievements?.length
                        ? "🎉 All achievements unlocked! You're an eco champion!"
                        : selectedUser.achievements?.filter(a => a.unlocked).length > 0
                        ? "Keep going! More achievements await!"
                        : "Start your eco journey to unlock achievements!"}
                    </p>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      <style>{`
        @keyframes slide-down {
          from { 
            opacity: 0; 
            transform: translateY(-20px); 
          }
          to { 
            opacity: 1; 
            transform: translateY(0); 
          }
        }
        
        @keyframes fade-in {
          from { 
            opacity: 0; 
          }
          to { 
            opacity: 1; 
          }
        }
        
        @keyframes fade-in-up {
          from { 
            opacity: 0; 
            transform: translateY(15px); 
          }
          to { 
            opacity: 1; 
            transform: translateY(0); 
          }
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

        .animate-slide-down { 
          animation: slide-down 0.6s ease-out; 
        }
        
        .animate-fade-in { 
          animation: fade-in 0.8s ease-out 0.2s both; 
        }
        
        .animate-fade-in-up { 
          animation: fade-in-up 0.5s ease-out both; 
        }
        
        .animate-stagger > * { 
          animation: fade-in-up 0.5s ease-out both; 
        }
        
        .animate-slideUp {
          animation: slideUp 0.3s ease-out;
        }

        ::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        
        ::-webkit-scrollbar-track {
          background: ${isDark ? 'rgba(31, 41, 55, 0.3)' : 'rgba(243, 244, 246, 0.3)'};
          border-radius: 8px;
        }
        
        ::-webkit-scrollbar-thumb {
          background: linear-gradient(to bottom, #10b981, #0d9488);
          border-radius: 8px;
        }
        
        ::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(to bottom, #059669, #0f766e);
        }

        ::selection {
          background: ${isDark ? 'rgba(16, 185, 129, 0.3)' : 'rgba(52, 211, 153, 0.4)'};
          color: ${isDark ? '#ffffff' : '#000000'};
        }

        * {
          transition-property: color, background-color, border-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, filter, backdrop-filter;
          transition-timing-function: cubic-bezier(0.25, 0.46, 0.45, 0.94);
          transition-duration: 200ms;
        }

        button:active,
        [role="button"]:active {
          transform: scale(0.95);
          transition-duration: 100ms;
        }

        button:focus-visible,
        [role="button"]:focus-visible {
          outline: 2px solid ${isDark ? '#10b981' : '#059669'};
          outline-offset: 2px;
          border-radius: 0.75rem;
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-slide-down,
          .animate-fade-in,
          .animate-fade-in-up,
          .animate-slideUp {
            animation: none;
          }
          
          * {
            transition-duration: 50ms;
          }
        }

        body {
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          text-rendering: optimizeLegibility;
        }

        @media (max-width: 640px) {
          /* .backdrop-blur-xl {
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
          } */
        }

        .touch-manipulation {
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
        }

        button,
        [role="button"] {
          min-height: 44px;
          min-width: 44px;
        }

        @supports (padding-top: env(safe-area-inset-top)) {
          .py-3 {
            padding-top: max(0.75rem, env(safe-area-inset-top));
            padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
          }
        }

        nav[style*="scrollbarWidth"] {
          scrollbar-color: ${isDark ? '#10b981 #1f2937' : '#10b981 #f3f4f6'};
        }

        @media (prefers-contrast: high) {
          .backdrop-blur-xl,
          .backdrop-blur-2xl {
            backdrop-filter: none;
            -webkit-backdrop-filter: none;
            background: ${isDark ? 'rgba(0, 0, 0, 0.95)' : 'rgba(255, 255, 255, 0.95)'};
          }
        }

        aside {
          will-change: transform, width;
        }
      `}</style>
    </div>
  );
}