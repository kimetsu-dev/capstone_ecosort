import { useEffect, useState } from "react";
import { auth, db, storage } from "../firebase";
import { Link, useNavigate } from "react-router-dom";
import {
  updateProfile,
  updateEmail,
  updatePassword,
  onAuthStateChanged,
  signOut,
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
  GoogleAuthProvider,
  reauthenticateWithPopup,
} from "firebase/auth";
import {
  doc,
  getDoc,
  updateDoc,
  query,
  collection,
  getDocs,
  orderBy,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { v4 as uuidv4 } from "uuid";
import {
  FiUser,
  FiCamera,
  FiEye,
  FiEyeOff,
  FiArrowLeft,
  FiLogOut,
  FiTrash2,
  FiMail,
  FiLock,
  FiAward,
  FiTrendingUp,
  FiSettings,
  FiEdit3,
  FiX,
  FiCheck,
  FiSave,
  FiAlertCircle,
} from "react-icons/fi";
import { FaTrophy, FaMedal, FaStar, FaCubes } from "react-icons/fa";
import { useTheme } from "../contexts/ThemeContext";
import PublicVerification from "./PublicVerification";

export default function Profile() {
  const { isDark } = useTheme() || {};
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [isEmailUser, setIsEmailUser] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [profilePicFile, setProfilePicFile] = useState(null);
  const [profileUrl, setProfileUrl] = useState("");
  const [points, setPoints] = useState(0);
  const [rank, setRank] = useState(null);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [achievements, setAchievements] = useState([]);
  const [passwordError, setPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");
  const [currentPasswordError, setCurrentPasswordError] = useState("");
  const [scrollY, setScrollY] = useState(0);
  const [activeTab, setActiveTab] = useState("profile"); // 'profile', 'achievements', 'ledger'
  const [profilePicPreview, setProfilePicPreview] = useState(null);

  // Handle scroll for animations
  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) return navigate("/");
      setUser(currentUser);
      setEmail(currentUser.email);

      const emailProviderPresent = currentUser.providerData.some(
        (provider) => provider.providerId === "password"
      );
      setIsEmailUser(emailProviderPresent);

      const userDoc = await getDoc(doc(db, "users", currentUser.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setUsername(data.username || "");
        setPoints(data.totalPoints || 0);
        if (data.profileUrl) setProfileUrl(data.profileUrl);
        setAchievements(generateAchievements(data.totalPoints || 0));
      }

      const q = query(collection(db, "users"), orderBy("totalPoints", "desc"));
      const snapshot = await getDocs(q);
      const ranked = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setRank(ranked.findIndex((u) => u.id === currentUser.uid) + 1);
    });

    return () => unsub();
  }, [navigate]);

  const generateAchievements = (points) => {
    const allAchievements = [
      { name: "First Steps", icon: "🌱", description: "Earned your first 100 points", requiredPoints: 100, unlocked: points >= 100 },
      { name: "Eco Advocate", icon: "🌿", description: "Reached 500 points milestone", requiredPoints: 500, unlocked: points >= 500 },
      { name: "Eco Hero", icon: "🏆", description: "Achieved 1000 points!", requiredPoints: 1000, unlocked: points >= 1000 },
      { name: "Green Champion", icon: "👑", description: "Outstanding 2000+ points", requiredPoints: 2000, unlocked: points >= 2000 },
    ];
    return allAchievements;
  };

  const validatePassword = (pwd) => {
    if (!pwd) return true;
    if (pwd.length < 8) return false;
    if (!/[A-Z]/.test(pwd)) return false;
    if (!/[0-9]/.test(pwd)) return false;
    return true;
  };

  const uploadWithRetry = async (fileRef, file, retries = 3, delay = 1000) => {
    try {
      return await uploadBytes(fileRef, file);
    } catch (error) {
      if (retries <= 0) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
      return uploadWithRetry(fileRef, file, retries - 1, delay * 2);
    }
  };

  const uploadProfilePicture = async (file) => {
    if (!file) return null;
    const fileRef = ref(storage, `profiles/${user.uid}/${uuidv4()}`);
    await uploadWithRetry(fileRef, file);
    return await getDownloadURL(fileRef);
  };

  const performReauthentication = async () => {
    if (isEmailUser) {
      if (!currentPassword) {
        setCurrentPasswordError("Current password is required to change password or email.");
        throw new Error("Current password missing");
      }
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
    } else {
      const googleProvider = new GoogleAuthProvider();
      await reauthenticateWithPopup(user, googleProvider);
    }
  };

  const handleSave = async () => {
    setPasswordError("");
    setConfirmPasswordError("");
    setCurrentPasswordError("");

    if (!username.trim()) {
      alert("Username cannot be empty");
      return;
    }

    if (password && !validatePassword(password)) {
      setPasswordError("Password must be at least 8 characters, include 1 uppercase letter and 1 number.");
      return;
    }

    if (password && password !== confirmPassword) {
      setConfirmPasswordError("Passwords do not match");
      return;
    }

    setSaving(true);

    try {
      const emailChanged = email && email !== user.email;
      const passwordChanging = !!password;
      if (emailChanged || passwordChanging) {
        await performReauthentication();
      }

      const updateFields = {};
      if (profilePicFile) {
        const uploadedUrl = await uploadProfilePicture(profilePicFile);
        setProfileUrl(uploadedUrl);
        updateFields.profileUrl = uploadedUrl;
      }
      if (username.trim() && username !== user.displayName) {
        updateFields.username = username.trim();
      }
      if (Object.keys(updateFields).length > 0) {
        await updateDoc(doc(db, "users", user.uid), updateFields);
      }
      if (username.trim() && username !== user.displayName) {
        await updateProfile(user, { displayName: username.trim() });
      }
      if (emailChanged) {
        await updateEmail(user, email);
      }
      if (passwordChanging) {
        await updatePassword(user, password);
      }
      setIsEditing(false);
      setPassword("");
      setConfirmPassword("");
      setCurrentPassword("");
      setProfilePicFile(null);
      setProfilePicPreview(null);
      alert("Profile updated successfully");
    } catch (err) {
      console.error(err);
      if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        setCurrentPasswordError("Current password is incorrect.");
      } else if (err.code === "auth/requires-recent-login") {
        alert("Please log out and log back in to perform this operation.");
      } else if (err.code === "auth/popup-closed-by-user") {
        alert("Reauthentication cancelled. Please try again.");
      } else {
        alert("Failed to update profile: " + (err.message || err));
      }
    }

    setSaving(false);
  };

  const handleLogout = async () => {
    if (window.confirm("Are you sure you want to logout?")) {
      await signOut(auth);
      navigate("/");
    }
  };

  const handleDeleteAccount = async () => {
    if (window.confirm("Are you sure you want to delete your account? This cannot be undone.")) {
      try {
        await deleteUser(auth.currentUser);
        alert("Account deleted.");
        navigate("/");
      } catch (err) {
        console.error(err);
        alert("Failed to delete account.");
      }
    }
  };

  const handleProfilePicChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setProfilePicFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfilePicPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const getBadge = () => {
    if (points >= 2000) return { name: "Green Champion", icon: "👑", color: "from-purple-500 to-pink-500" };
    if (points >= 1000) return { name: "Eco Hero", icon: "🏆", color: "from-yellow-400 to-orange-500" };
    if (points >= 500) return { name: "Eco Advocate", icon: "🌿", color: "from-green-400 to-emerald-500" };
    if (points >= 100) return { name: "Eco Starter", icon: "♻️", color: "from-blue-400 to-cyan-500" };
    return { name: "Newbie", icon: "👤", color: "from-gray-400 to-gray-500" };
  };

  const getProgressToNextLevel = () => {
    const levels = [100, 500, 1000, 2000];
    const nextLevel = levels.find((level) => points < level);
    if (!nextLevel) return { progress: 100, remaining: 0, nextLevel: 2000 };
    const prevLevel = levels[levels.indexOf(nextLevel) - 1] || 0;
    const progress = ((points - prevLevel) / (nextLevel - prevLevel)) * 100;
    return { progress, remaining: nextLevel - points, nextLevel };
  };

  const currentBadge = getBadge();
  const levelProgress = getProgressToNextLevel();

  const isSaveDisabled =
    saving ||
    !username.trim() ||
    (password && (!validatePassword(password) || password !== confirmPassword)) ||
    (isEmailUser && (password || (email !== user?.email)) && !currentPassword);

  return (
    <div className={`min-h-screen transition-colors duration-300 ${
      isDark ? "bg-gray-900" : "bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50"
    }`}>
      {/* Sticky Header with Glassmorphism */}
      <div className={`sticky top-0 z-50 backdrop-blur-xl border-b transition-all duration-300 ${
        isDark
          ? "bg-gray-900/80 border-gray-700/50"
          : "bg-white/80 border-gray-200/50"
      } ${scrollY > 20 ? 'shadow-xl' : 'shadow-md'}`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            {/* Back Button */}
            <Link
              to="/home"
              className={`group flex items-center space-x-2 px-4 py-2.5 rounded-xl font-semibold transition-all duration-300 hover:scale-105 active:scale-95 ${
                isDark
                  ? "bg-gray-800/80 text-gray-200 hover:bg-gray-700/80 border border-gray-700/50"
                  : "bg-white/90 text-gray-700 hover:bg-gray-50/90 border border-gray-200/50 shadow-sm hover:shadow-md"
              }`}
            >
              <FiArrowLeft className="text-lg transition-transform group-hover:-translate-x-1" />
              <span className="hidden sm:inline">Back</span>
            </Link>

            {/* Title */}
            <h1 className={`text-xl sm:text-2xl lg:text-3xl font-bold transition-all duration-300 ${
              isDark ? "text-white" : "bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent"
            }`} style={{ transform: scrollY > 50 ? 'scale(0.95)' : 'scale(1)' }}>
              My Profile
            </h1>

            {/* Settings Button */}
            <button
              onClick={() => navigate("/settings")}
              className={`group flex items-center space-x-2 px-4 py-2.5 rounded-xl font-semibold transition-all duration-300 hover:scale-105 active:scale-95 ${
                isDark
                  ? "bg-gray-800/80 text-gray-200 hover:bg-gray-700/80 border border-gray-700/50"
                  : "bg-white/90 text-gray-700 hover:bg-gray-50/90 border border-gray-200/50 shadow-sm hover:shadow-md"
              }`}
            >
              <FiSettings className="text-lg transition-transform group-hover:rotate-90" />
              <span className="hidden sm:inline">Settings</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 relative z-10">
        {/* Profile Header Card */}
        <div className={`rounded-3xl p-6 sm:p-8 mb-6 shadow-2xl border transition-all duration-500 ${
          isDark
            ? "bg-gray-800/95 border-gray-700/50 backdrop-blur-sm"
            : "bg-white/95 border-white/50 backdrop-blur-sm"
        }`}>
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 sm:gap-8">
            {/* Profile Picture with Enhanced Styling */}
            <div className="relative group">
              <div className={`relative w-32 h-32 sm:w-36 sm:h-36 rounded-full overflow-hidden border-4 shadow-2xl transition-all duration-300 ${
                isDark ? "border-gray-700" : "border-white"
              }`}>
                {(profilePicPreview || profileUrl) ? (
                  <img
                    src={profilePicPreview || profileUrl}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className={`w-full h-full flex items-center justify-center ${
                    isDark ? "bg-gray-700" : "bg-gradient-to-br from-gray-100 to-gray-200"
                  }`}>
                    <FiUser size={48} className={isDark ? "text-gray-400" : "text-gray-500"} />
                  </div>
                )}
              </div>

              {isEditing && (
                <label className="absolute bottom-0 right-0 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full p-3 shadow-xl cursor-pointer hover:from-blue-600 hover:to-blue-700 transition-all duration-300 hover:scale-110 group/camera">
                  <FiCamera className="text-white text-lg group-hover/camera:scale-110 transition-transform" />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleProfilePicChange}
                  />
                </label>
              )}
            </div>

            {/* User Info */}
            <div className="flex-1 text-center sm:text-left">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3 mb-3">
                <h2 className={`text-3xl sm:text-4xl font-extrabold ${
                  isDark ? "text-white" : "text-gray-900"
                }`}>
                  {username || "User"}
                </h2>
              </div>

              <p className={`text-base mb-5 flex items-center justify-center sm:justify-start gap-2 ${
                isDark ? "text-gray-400" : "text-gray-600"
              }`}>
                <FiMail className="text-sm" />
                {email}
              </p>

              {/* Enhanced Badge */}
              <div className={`inline-flex items-center space-x-3 px-6 py-3 rounded-2xl shadow-xl bg-gradient-to-r ${currentBadge.color} text-white font-bold transition-all duration-300 hover:scale-105 hover:shadow-2xl mb-6`}>
                <span className="text-3xl">{currentBadge.icon}</span>
                <span className="text-lg">{currentBadge.name}</span>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-3 sm:gap-4">
                {/* Points */}
                <div className={`rounded-2xl p-4 text-center transition-all duration-300 hover:scale-105 hover:shadow-lg ${
                  isDark
                    ? "bg-gradient-to-br from-blue-900/60 to-blue-800/60 border border-blue-700/50"
                    : "bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200/50"
                }`}>
                  <FiTrendingUp className={`text-3xl mx-auto mb-2 ${isDark ? "text-blue-400" : "text-blue-600"}`} />
                  <p className={`text-2xl sm:text-3xl font-extrabold ${isDark ? "text-blue-300" : "text-blue-700"}`}>
                    {points.toLocaleString()}
                  </p>
                  <p className={`text-xs font-semibold mt-1 ${isDark ? "text-blue-400" : "text-blue-600"}`}>
                    Points
                  </p>
                </div>

                {/* Achievements */}
                <div className={`rounded-2xl p-4 text-center transition-all duration-300 hover:scale-105 hover:shadow-lg ${
                  isDark
                    ? "bg-gradient-to-br from-purple-900/60 to-purple-800/60 border border-purple-700/50"
                    : "bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200/50"
                }`}>
                  <FaMedal className={`text-3xl mx-auto mb-2 ${isDark ? "text-purple-400" : "text-purple-600"}`} />
                  <p className={`text-2xl sm:text-3xl font-extrabold ${isDark ? "text-purple-300" : "text-purple-700"}`}>
                    {achievements.filter(a => a.unlocked).length}/{achievements.length}
                  </p>
                  <p className={`text-xs font-semibold mt-1 ${isDark ? "text-purple-400" : "text-purple-600"}`}>
                    Unlocked
                  </p>
                </div>

                {/* Rank */}
                <div className={`rounded-2xl p-4 text-center transition-all duration-300 hover:scale-105 hover:shadow-lg ${
                  isDark
                    ? "bg-gradient-to-br from-yellow-900/60 to-orange-800/60 border border-yellow-700/50"
                    : "bg-gradient-to-br from-yellow-50 to-orange-100 border border-yellow-200/50"
                }`}>
                  <FaTrophy className={`text-3xl mx-auto mb-2 ${isDark ? "text-yellow-400" : "text-yellow-600"}`} />
                  <p className={`text-2xl sm:text-3xl font-extrabold ${isDark ? "text-yellow-300" : "text-yellow-700"}`}>
                    #{rank || "..."}
                  </p>
                  <p className={`text-xs font-semibold mt-1 ${isDark ? "text-yellow-400" : "text-yellow-600"}`}>
                    Global Rank
                  </p>
                </div>
              </div>

              {/* Progress to Next Level */}
              <div className={`mt-6 p-5 rounded-2xl ${isDark ? "bg-gray-700/50" : "bg-gray-50"}`}>
                <div className="flex items-center justify-between mb-3">
                  <span className={`font-semibold text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                    🎯 Next Level Progress
                  </span>
                  <span className={`text-sm font-bold ${isDark ? "text-blue-400" : "text-blue-600"}`}>
                    {levelProgress.remaining} pts to go
                  </span>
                </div>
                <div className={`w-full rounded-full h-4 overflow-hidden ${isDark ? "bg-gray-600" : "bg-gray-200"}`}>
                  <div
                    className="bg-gradient-to-r from-emerald-400 via-green-500 to-emerald-600 h-4 rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${levelProgress.progress}%` }}
                  ></div>
                </div>
                <p className={`text-xs mt-2 text-center ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                  {Math.round(levelProgress.progress)}% complete
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className={`rounded-2xl p-2 mb-6 shadow-xl border ${
          isDark
            ? "bg-gray-800/95 border-gray-700/50"
            : "bg-white/95 border-white/50"
        }`}>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: "profile", label: "Profile", icon: FiUser },
              { id: "achievements", label: "Achievements", icon: FiAward },
              { id: "ledger", label: "Public Ledger", icon: FaCubes },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center justify-center space-x-2 px-4 py-3 rounded-xl font-semibold transition-all duration-300 ${
                  activeTab === tab.id
                    ? `${
                        isDark
                          ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg"
                          : "bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg"
                      } scale-105`
                    : `${
                        isDark ? "text-gray-400 hover:text-gray-200 hover:bg-gray-700/50" : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                      }`
                }`}
              >
                <tab.icon className="text-lg" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Profile Tab */}
        {activeTab === "profile" && (
          <div className="space-y-6">
            {/* Edit/Save Buttons */}
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className={`w-full sm:w-auto flex items-center justify-center space-x-2 px-8 py-4 rounded-2xl font-bold text-lg transition-all duration-300 hover:scale-105 active:scale-95 shadow-xl hover:shadow-2xl ${
                  isDark
                    ? "bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white"
                    : "bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white"
                }`}
              >
                <FiEdit3 className="text-xl" />
                <span>Edit Profile</span>
              </button>
            ) : (
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleSave}
                  disabled={isSaveDisabled}
                  className={`flex-1 flex items-center justify-center space-x-2 px-8 py-4 rounded-2xl font-bold text-lg transition-all duration-300 shadow-xl ${
                    isSaveDisabled
                      ? "bg-gray-400 cursor-not-allowed opacity-50"
                      : "bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white hover:scale-105 active:scale-95 hover:shadow-2xl"
                  }`}
                >
                  {saving ? (
                    <div className="animate-spin w-6 h-6 border-3 border-white border-t-transparent rounded-full"></div>
                  ) : (
                    <>
                      <FiSave className="text-xl" />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setPassword("");
                    setConfirmPassword("");
                    setCurrentPassword("");
                    setProfilePicFile(null);
                    setProfilePicPreview(null);
                  }}
                  className={`flex-1 sm:flex-initial flex items-center justify-center space-x-2 px-8 py-4 rounded-2xl font-bold text-lg transition-all duration-300 hover:scale-105 active:scale-95 shadow-xl hover:shadow-2xl ${
                    isDark
                      ? "bg-gray-700 hover:bg-gray-600 text-white"
                      : "bg-gray-200 hover:bg-gray-300 text-gray-900"
                  }`}
                >
                  <FiX className="text-xl" />
                  <span>Cancel</span>
                </button>
              </div>
            )}

            {/* Profile Form */}
            <div className={`rounded-2xl p-6 sm:p-8 shadow-xl border ${
              isDark
                ? "bg-gray-800/95 border-gray-700/50"
                : "bg-white/95 border-white/50"
            }`}>
              <h3 className={`text-2xl font-bold mb-6 flex items-center ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                <FiUser className="mr-3 text-2xl" /> Personal Information
              </h3>

              <div className="space-y-5">
                {/* Username */}
                <div>
                  <label htmlFor="username" className={`block text-sm font-semibold mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                    Username
                  </label>
                  <div className="relative">
                    <FiUser className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 text-lg" />
                    <input
                      id="username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      disabled={!isEditing}
                      className={`w-full pl-12 pr-4 py-4 rounded-xl border-2 transition-all duration-300 text-base ${
                        isEditing
                          ? `${isDark ? "bg-gray-700 text-gray-200 border-blue-500/50 focus:border-blue-500" : "bg-white text-gray-900 border-blue-300 focus:border-blue-500"} focus:ring-4 focus:ring-blue-200/50`
                          : `${isDark ? "bg-gray-700/50 text-gray-400 border-gray-600" : "bg-gray-50 text-gray-500 border-gray-200"}`
                      }`}
                      placeholder="Enter your username"
                    />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label htmlFor="email" className={`block text-sm font-semibold mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                    Email Address
                  </label>
                  <div className="relative">
                    <FiMail className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 text-lg" />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={!isEditing}
                      className={`w-full pl-12 pr-4 py-4 rounded-xl border-2 transition-all duration-300 text-base ${
                        isEditing
                          ? `${isDark ? "bg-gray-700 text-gray-200 border-blue-500/50 focus:border-blue-500" : "bg-white text-gray-900 border-blue-300 focus:border-blue-500"} focus:ring-4 focus:ring-blue-200/50`
                          : `${isDark ? "bg-gray-700/50 text-gray-400 border-gray-600" : "bg-gray-50 text-gray-500 border-gray-200"}`
                      }`}
                      placeholder="Enter your email"
                    />
                  </div>
                </div>

                {/* Password Fields - Only show when editing */}
                {isEditing && (
                  <div className="space-y-5 pt-5 border-t border-gray-200 dark:border-gray-600">
                    <div className={`p-4 rounded-xl flex items-start space-x-3 ${isDark ? "bg-blue-900/20 border border-blue-700/30" : "bg-blue-50 border border-blue-200"}`}>
                      <FiAlertCircle className={`text-xl mt-0.5 flex-shrink-0 ${isDark ? "text-blue-400" : "text-blue-600"}`} />
                      <p className={`text-sm ${isDark ? "text-blue-300" : "text-blue-700"}`}>
                        Leave password fields empty if you don't want to change your password.
                      </p>
                    </div>

                    {isEmailUser && (
                      <div>
                        <label htmlFor="currentPassword" className={`block text-sm font-semibold mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                          Current Password <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <FiLock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 text-lg" />
                          <input
                            id="currentPassword"
                            type={showCurrentPassword ? "text" : "password"}
                            value={currentPassword}
                            onChange={(e) => {
                              setCurrentPassword(e.target.value);
                              setCurrentPasswordError("");
                            }}
                            className={`w-full pl-12 pr-14 py-4 rounded-xl border-2 text-base ${
                              currentPasswordError
                                ? "border-red-500 focus:ring-red-200/50"
                                : "border-blue-300 focus:border-blue-500 focus:ring-blue-200/50"
                            } ${isDark ? "bg-gray-700 text-gray-200" : "bg-white text-gray-900"} focus:ring-4 transition-all duration-300`}
                            placeholder="Enter current password"
                          />
                          <button
                            type="button"
                            onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                            className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            {showCurrentPassword ? <FiEyeOff className="text-xl" /> : <FiEye className="text-xl" />}
                          </button>
                        </div>
                        {currentPasswordError && (
                          <p className="text-sm text-red-600 mt-2 flex items-center">
                            <FiAlertCircle className="mr-1" />
                            {currentPasswordError}
                          </p>
                        )}
                      </div>
                    )}

                    <div>
                      <label htmlFor="password" className={`block text-sm font-semibold mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                        New Password
                      </label>
                      <div className="relative">
                        <FiLock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 text-lg" />
                        <input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            setPasswordError("");
                          }}
                          className={`w-full pl-12 pr-14 py-4 rounded-xl border-2 text-base ${
                            passwordError
                              ? "border-red-500 focus:ring-red-200/50"
                              : "border-blue-300 focus:border-blue-500 focus:ring-blue-200/50"
                          } ${isDark ? "bg-gray-700 text-gray-200" : "bg-white text-gray-900"} focus:ring-4 transition-all duration-300`}
                          placeholder="Enter new password (optional)"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          {showPassword ? <FiEyeOff className="text-xl" /> : <FiEye className="text-xl" />}
                        </button>
                      </div>
                      <p className={`text-xs mt-2 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                        Must be at least 8 characters with 1 uppercase letter and 1 number
                      </p>
                      {passwordError && (
                        <p className="text-sm text-red-600 mt-2 flex items-center">
                          <FiAlertCircle className="mr-1" />
                          {passwordError}
                        </p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="confirmPassword" className={`block text-sm font-semibold mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                        Confirm New Password
                      </label>
                      <div className="relative">
                        <FiLock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 text-lg" />
                        <input
                          id="confirmPassword"
                          type={showConfirmPassword ? "text" : "password"}
                          value={confirmPassword}
                          onChange={(e) => {
                            setConfirmPassword(e.target.value);
                            setConfirmPasswordError("");
                          }}
                          className={`w-full pl-12 pr-14 py-4 rounded-xl border-2 text-base ${
                            confirmPasswordError
                              ? "border-red-500 focus:ring-red-200/50"
                              : "border-blue-300 focus:border-blue-500 focus:ring-blue-200/50"
                          } ${isDark ? "bg-gray-700 text-gray-200" : "bg-white text-gray-900"} focus:ring-4 transition-all duration-300`}
                          placeholder="Confirm new password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          {showConfirmPassword ? <FiEyeOff className="text-xl" /> : <FiEye className="text-xl" />}
                        </button>
                      </div>
                      {confirmPasswordError && (
                        <p className="text-sm text-red-600 mt-2 flex items-center">
                          <FiAlertCircle className="mr-1" />
                          {confirmPasswordError}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Account Actions */}
            <div className={`rounded-2xl p-6 sm:p-8 shadow-xl border ${
              isDark
                ? "bg-gray-800/95 border-gray-700/50"
                : "bg-white/95 border-white/50"
            }`}>
              <h3 className={`text-2xl font-bold mb-6 ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                Account Actions
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={handleLogout}
                  className="w-full bg-gradient-to-r from-orange-500 to-red-500 text-white py-4 px-6 rounded-2xl font-bold hover:from-orange-600 hover:to-red-600 transition-all duration-300 shadow-lg hover:shadow-xl flex items-center justify-center space-x-3 hover:scale-105 active:scale-95"
                >
                  <FiLogOut className="text-xl" />
                  <span className="text-lg">Logout</span>
                </button>
                <button
                  onClick={handleDeleteAccount}
                  className="w-full bg-gradient-to-r from-red-500 to-red-600 text-white py-4 px-6 rounded-2xl font-bold hover:from-red-600 hover:to-red-700 transition-all duration-300 shadow-lg hover:shadow-xl flex items-center justify-center space-x-3 hover:scale-105 active:scale-95"
                >
                  <FiTrash2 className="text-xl" />
                  <span className="text-lg">Delete Account</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Achievements Tab */}
        {activeTab === "achievements" && (
          <div className={`rounded-2xl p-6 sm:p-8 shadow-xl border ${
            isDark
              ? "bg-gray-800/95 border-gray-700/50"
              : "bg-white/95 border-white/50"
          }`}>
            <h3 className={`text-2xl font-bold mb-2 flex items-center ${isDark ? "text-gray-200" : "text-gray-800"}`}>
              <FiAward className="mr-3 text-3xl" /> Achievements
            </h3>
            <p className={`text-sm mb-6 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
              {achievements.filter(a => a.unlocked).length} of {achievements.length} unlocked
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {achievements.map((achievement, index) => (
                <div
                  key={index}
                  className={`rounded-2xl p-6 border transition-all duration-300 hover:scale-105 relative overflow-hidden ${
                    achievement.unlocked
                      ? `${isDark ? "bg-gradient-to-br from-yellow-900/30 to-orange-900/30 border-yellow-600/30" : "bg-gradient-to-br from-yellow-50 to-orange-50 border-amber-200"} hover:shadow-xl`
                      : `${isDark ? "bg-gray-700/30 border-gray-600/30 opacity-60" : "bg-gray-50 border-gray-200 opacity-70"}`
                  }`}
                  style={{
                    animationDelay: `${index * 0.1}s`,
                  }}
                >
                  {achievement.unlocked && (
                    <div className="absolute top-3 right-3 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full p-2 shadow-lg">
                      <FiCheck className="text-white text-sm" />
                    </div>
                  )}

                  {!achievement.unlocked && (
                    <div className="absolute top-3 right-3 opacity-50">
                      <FiLock className={`text-2xl ${isDark ? "text-gray-500" : "text-gray-400"}`} />
                    </div>
                  )}

                  <div className="flex items-start space-x-4">
                    <div className={`text-5xl flex-shrink-0 ${achievement.unlocked ? "" : "grayscale opacity-40"}`}>
                      {achievement.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className={`font-bold text-xl mb-2 ${
                        achievement.unlocked 
                          ? (isDark ? "text-yellow-300" : "text-amber-800")
                          : (isDark ? "text-gray-400" : "text-gray-600")
                      }`}>
                        {achievement.name}
                      </h4>
                      <p className={`text-sm mb-3 ${
                        achievement.unlocked 
                          ? (isDark ? "text-yellow-400/80" : "text-amber-600")
                          : (isDark ? "text-gray-500" : "text-gray-500")
                      }`}>
                        {achievement.description}
                      </p>

                      {!achievement.unlocked && (
                        <div className="mt-4">
                          <div className="flex items-center justify-between text-xs mb-2">
                            <span className={isDark ? "text-gray-400" : "text-gray-600"}>
                              {points} / {achievement.requiredPoints} points
                            </span>
                            <span className={`font-bold ${isDark ? "text-blue-400" : "text-blue-600"}`}>
                              {Math.round((points / achievement.requiredPoints) * 100)}%
                            </span>
                          </div>
                          <div className={`w-full rounded-full h-2 overflow-hidden ${isDark ? "bg-gray-600" : "bg-gray-200"}`}>
                            <div
                              className="bg-gradient-to-r from-blue-400 to-blue-600 h-2 rounded-full transition-all duration-1000"
                              style={{ width: `${Math.min((points / achievement.requiredPoints) * 100, 100)}%` }}
                            ></div>
                          </div>
                          <p className={`text-xs mt-2 font-semibold ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                            {achievement.requiredPoints - points} points to unlock
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Public Ledger Tab */}
        {activeTab === "ledger" && (
          <div className={`rounded-2xl shadow-xl border ${
            isDark
              ? "bg-gray-800/95 border-gray-700/50"
              : "bg-white/95 border-white/50"
          }`}>
            <PublicVerification />
          </div>
        )}
      </div>

      {/* Spacer for bottom */}
      <div className="h-8"></div>
    </div>
  );
}