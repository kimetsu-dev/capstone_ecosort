import React, { useEffect, useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { useTheme, ThemeProvider } from "./contexts/ThemeContext";
import { useAuth, AuthProvider } from "./contexts/AuthContext"; 
import { LanguageProvider } from "./contexts/LanguageContext"; 
import logo from "./images/logo.png"; 
import "./index.css";

import BackButtonHandler from "./BackButtonHandler";
import { requestFirebaseNotificationPermission, onMessageListener } from "./firebase-messaging";

/* Pages */
import Welcome from "./pages/Welcome";
import Signup from "./pages/Signup";
import Login from "./pages/Login";
import AdminPanel from "./pages/AdminPanel";
import AdminProfile from "./pages/AdminProfile";
import AdminSettings from "./pages/AdminSettings";
import Dashboard from "./pages/Dashboard";
import Forum from "./pages/Forum";
import SubmitWaste from "./pages/SubmitWaste";
import Rewards from "./pages/Rewards";
import Report from "./pages/Report";
import Profile from "./pages/Profile";
import Transactions from "./pages/Transactions";
import Leaderboard from "./pages/Leaderboard";
import MyRedemptions from "./pages/MyRedemptions";
import Settings from "./pages/Settings";
import PublicVerification from "./pages/PublicVerification";

/* ---------------- INSTALLATION INSTRUCTIONS MODAL ---------------- */
const InstallInstructionsModal = ({ isOpen, onClose, osType }) => {
  if (!isOpen) return null;

  const getInstructions = () => {
    switch(osType) {
      case 'ios':
        return (
          <ol className="space-y-3 text-sm text-gray-700 dark:text-gray-200">
            <li className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-6 h-6 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold text-xs">1</span>
              <span>Tap the <span className="font-bold">Share</span> button <span className="inline-block px-1 bg-gray-200 dark:bg-gray-600 rounded">⎋</span> in Safari.</span>
            </li>
            <li className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-6 h-6 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold text-xs">2</span>
              <span>Scroll down and select <span className="font-bold">"Add to Home Screen"</span>.</span>
            </li>
            <li className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-6 h-6 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold text-xs">3</span>
              <span>Tap <span className="font-bold">Add</span> at the top right.</span>
            </li>
          </ol>
        );
      
      case 'android':
        return (
          <ol className="space-y-3 text-sm text-gray-700 dark:text-gray-200">
            <li className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-6 h-6 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold text-xs">1</span>
              <span>Tap the <span className="font-bold">Menu</span> icon <span className="inline-block px-1 bg-gray-200 dark:bg-gray-600 rounded">⋮</span> (three dots) in Chrome.</span>
            </li>
            <li className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-6 h-6 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold text-xs">2</span>
              <span>Select <span className="font-bold">"Install App"</span> or "Add to Home Screen".</span>
            </li>
            <li className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-6 h-6 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold text-xs">3</span>
              <span>Confirm the installation.</span>
            </li>
          </ol>
        );
      
      case 'windows':
      case 'macos':
      case 'linux':
        return (
          <ol className="space-y-3 text-sm text-gray-700 dark:text-gray-200">
            <li className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-6 h-6 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold text-xs">1</span>
              <span>Look for the <span className="font-bold">install icon</span> (⊕) in your browser's address bar.</span>
            </li>
            <li className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-6 h-6 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold text-xs">2</span>
              <span>Click it and select <span className="font-bold">"Install"</span>.</span>
            </li>
            <li className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-6 h-6 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold text-xs">3</span>
              <span><strong>Or:</strong> Open browser menu (⋮) → <span className="font-bold">"Install ECOSORT"</span> or "Save and share" → "Install app".</span>
            </li>
            <li className="text-xs text-gray-500 dark:text-gray-400 italic pl-8">
              💡 Supported: Chrome, Edge, Brave, Opera
            </li>
          </ol>
        );
      
      default:
        return (
          <ol className="space-y-3 text-sm text-gray-700 dark:text-gray-200">
            <li className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-6 h-6 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold text-xs">1</span>
              <span>Open your browser menu (⋮ or ☰).</span>
            </li>
            <li className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-6 h-6 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold text-xs">2</span>
              <span>Look for <span className="font-bold">"Install App"</span>, "Add to Home Screen", or "Install ECOSORT".</span>
            </li>
            <li className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-6 h-6 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold text-xs">3</span>
              <span>Follow the prompts to complete.</span>
            </li>
          </ol>
        );
    }
  };

  const getOSLabel = () => {
    switch(osType) {
      case 'ios': return 'iOS';
      case 'android': return 'Android';
      case 'windows': return 'Windows';
      case 'macos': return 'macOS';
      case 'linux': return 'Linux';
      default: return 'Your Device';
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl animate-slideUp">
        <div className="flex flex-col items-center text-center">
          <img 
            src={logo} 
            alt="EcoSort Logo" 
            className="w-16 h-16 rounded-2xl shadow-lg mb-4 object-cover" 
          />
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
            Install EcoSort
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">on {getOSLabel()}</p>
          <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-300 text-sm">
            Install the app for a better experience, offline access, and easier reporting.
          </p>

          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
            {getInstructions()}
          </div>
        </div>
        
        <button 
          onClick={onClose}
          className="w-full mt-6 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-xl transition-colors"
        >
          Got it!
        </button>
      </div>
    </div>
  );
};

/* ---------------- MOBILE WELCOME ---------------- */
const MobileWelcome = () => {
  const { isDark } = useTheme();
  const navigate = useNavigate();
  
  // Installation State
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showAutoPopup, setShowAutoPopup] = useState(false);
  const [osType, setOsType] = useState('unknown'); // 'ios', 'android', 'windows', 'macos', 'linux', 'unknown'

  useEffect(() => {
    // Check if already in standalone mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone) return;

    // Check if user has dismissed the popup before (only for auto-popup, NOT for button visibility)
    const dismissedPopup = localStorage.getItem('ecosort-install-dismissed');
    const dismissedTime = localStorage.getItem('ecosort-install-dismissed-time');
    
    let shouldShowPopup = true;
    
    // If "Don't show again" was selected, never show AUTO-POPUP
    if (dismissedPopup === 'permanent') {
      shouldShowPopup = false;
    }
    
    // If "Remind me later" was selected, show again after 7 days
    if (dismissedPopup === 'temporary' && dismissedTime) {
      const daysSinceDismissed = (Date.now() - parseInt(dismissedTime)) / (1000 * 60 * 60 * 24);
      if (daysSinceDismissed < 7) {
        shouldShowPopup = false;
      }
    }

    // Detect Operating System
    const userAgent = window.navigator.userAgent.toLowerCase();
    const platform = window.navigator.platform.toLowerCase();
    
    let detectedOS = 'unknown';
    
    if (/iphone|ipad|ipod/.test(userAgent)) {
      detectedOS = 'ios';
      setShowInstallBtn(true); // Always show install button for iOS
    } else if (/android/.test(userAgent)) {
      detectedOS = 'android';
      setShowInstallBtn(true); // Always show for Android
    } else if (/win/.test(platform)) {
      detectedOS = 'windows';
      setShowInstallBtn(true); // Always show for Windows
    } else if (/mac/.test(platform)) {
      detectedOS = 'macos';
      setShowInstallBtn(true); // Always show for macOS
    } else if (/linux/.test(platform)) {
      detectedOS = 'linux';
      setShowInstallBtn(true); // Always show for Linux
    }
    
    setOsType(detectedOS);

    // Show auto-popup after 2 seconds (only if not dismissed)
    if (shouldShowPopup) {
      const popupTimer = setTimeout(() => {
        setShowAutoPopup(true);
      }, 2000);
    }

    // Android/Desktop Detection (beforeinstallprompt)
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBtn(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = () => {
    if (osType === 'ios') {
      setShowInstructions(true); // Open modal for iOS
    } else if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === "accepted") {
          setShowInstallBtn(false);
        }
        setDeferredPrompt(null);
      });
    } else {
      // Fallback for any OS if event didn't fire but button is visible
      setShowInstructions(true);
    }
  };

  const handleDismissPopup = (type) => {
    setShowAutoPopup(false);
    if (type === 'permanent') {
      localStorage.setItem('ecosort-install-dismissed', 'permanent');
    } else if (type === 'temporary') {
      localStorage.setItem('ecosort-install-dismissed', 'temporary');
      localStorage.setItem('ecosort-install-dismissed-time', Date.now().toString());
    }
  };

  const handleInstallFromPopup = () => {
    setShowAutoPopup(false);
    if (osType === 'ios') {
      setShowInstructions(true);
    } else if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === "accepted") {
          setShowInstallBtn(false);
          localStorage.setItem('ecosort-install-dismissed', 'permanent');
        }
        setDeferredPrompt(null);
      });
    } else {
      setShowInstructions(true);
    }
  };

  const textPrimary = isDark ? "text-white" : "text-gray-900";
  const textSecondary = isDark ? "text-white/90" : "text-gray-700";
  const bgCard = isDark
    ? "bg-white/5 border border-white/10"
    : "bg-white/80 border border-black/10";

  return (
    <div
      className={`min-h-screen flex flex-col overflow-hidden bg-gradient-to-br ${
        isDark
          ? "from-slate-900 via-gray-900 to-emerald-900"
          : "from-emerald-500 to-green-500"
      }`}
    >
      <InstallInstructionsModal 
        isOpen={showInstructions} 
        onClose={() => setShowInstructions(false)} 
        osType={osType} 
      />

      {/* Auto-popup for first-time visitors */}
      {showAutoPopup && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl animate-slideUp">
            <div className="flex flex-col items-center text-center mb-4">
              <img 
                src={logo} 
                alt="EcoSort Logo" 
                className="w-20 h-20 rounded-2xl shadow-lg mb-4 object-cover" 
              />
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Install EcoSort
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Get the best experience on {osType === 'ios' ? 'iOS' : osType === 'android' ? 'Android' : osType === 'windows' ? 'Windows' : osType === 'macos' ? 'macOS' : osType === 'linux' ? 'Linux' : 'your device'}
              </p>
            </div>

            <div className="space-y-3 mb-6">
              <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-emerald-100 dark:bg-emerald-800 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/>
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Offline Access</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Use EcoSort even without internet</p>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-800 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Faster Performance</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Native app-like experience</p>
                  </div>
                </div>
              </div>

              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-purple-100 dark:bg-purple-800 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-purple-600 dark:text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Push Notifications</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Stay updated on rewards & reports</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={handleInstallFromPopup}
                className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold py-3 rounded-xl transition-all transform hover:scale-105 flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                </svg>
                Install Now
              </button>
              
              <button
                onClick={() => handleDismissPopup('temporary')}
                className="w-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-semibold py-2.5 rounded-xl transition-colors"
              >
                Remind Me Later
              </button>
              
              <button
                onClick={() => handleDismissPopup('permanent')}
                className="w-full text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 font-medium py-2 text-sm transition-colors"
              >
                Don't Show Again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Bar */}
      <div className="w-full flex justify-between items-center p-4 pb-2">
        <div className="flex items-center gap-3">
          {/* LOGO REPLACEMENT: Replaced the "E" box with the actual logo image */}
          <img 
            src={logo} 
            alt="EcoSort" 
            className="w-10 h-10 rounded-xl shadow-lg object-cover bg-white" 
          />
          <h1 className={`text-xl font-bold select-none ${textPrimary}`}>
            ECOSORT
          </h1>
        </div>

        <div className="flex gap-2">
          {showInstallBtn && (
            <button
              onClick={handleInstallClick}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-3 py-2 rounded-lg shadow-lg transition-colors flex items-center gap-1"
              type="button"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              Install
            </button>
          )}
          <button
            onClick={() => navigate("/login")}
            className={`font-semibold text-sm px-4 py-2 rounded-lg transition-colors border
              ${
                isDark
                  ? "text-white hover:bg-white/20 border-white/40"
                  : "text-gray-900 hover:bg-gray-200 border-gray-300"
              }`}
            type="button"
          >
            Login
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col justify-center px-6 pb-8">
        <div className={`text-center mb-6 ${textPrimary}`}>
          <h2 className="text-4xl font-bold leading-tight mb-3">
            Turn Your Trash<br />
            into Rewards!
          </h2>
          <p className={`text-lg font-medium ${textSecondary}`}>
            Earn points every time you segregate waste properly.
          </p>
        </div>

        <div className="flex justify-center mb-8">
          {/* You might want to replace this emoji circle with the logo too, 
              but for now I kept the large recycling symbol as it's a Hero element. 
              If you want the logo here, swap the <div> below for an <img> tag. */}
          <div className="w-32 h-32 border-8 border-white/90 rounded-full flex items-center justify-center text-white text-6xl font-bold shadow-2xl bg-white/10 backdrop-blur-sm">
            ♻
          </div>
        </div>

        <div className={`${bgCard} backdrop-blur-md rounded-xl p-5 mb-6 shadow-lg`}>
          <p className={`text-sm leading-relaxed font-medium drop-shadow-sm ${textSecondary}`}>
            ECOSORT combines recycling rewards, community reporting, and social
            features to create a comprehensive platform for sustainable waste
            management.
          </p>
        </div>

        <div className="text-center">
          <button
            onClick={() => navigate("/signup")}
            className="w-full bg-white hover:bg-gray-100 text-emerald-600 font-bold text-lg px-6 py-4 rounded-xl shadow-lg transition-all transform hover:scale-105 mb-4"
            type="button"
          >
            Get Started
          </button>
          
          <p className={`text-sm opacity-80 ${textSecondary}`}>
            Already have an account? <span onClick={() => navigate('/login')} className="underline cursor-pointer font-bold">Login here</span>
          </p>
        </div>
      </div>
    </div>
  );
};

/* ---------------- SMART WELCOME ---------------- */
const SmartWelcome = () => {
  const [showMobileVersion, setShowMobileVersion] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { theme } = useTheme();
  const [systemTheme, setSystemTheme] = useState("light");

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemTheme(mediaQuery.matches ? "dark" : "light");
    const handleChange = (e) => setSystemTheme(e.matches ? "dark" : "light");
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    const detectMobile = () => {
      const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
      const isIOSStandalone = window.navigator.standalone === true;
      const isMobile = window.innerWidth <= 768;
      return isStandalone || isIOSStandalone || isMobile;
    };
    setTimeout(() => {
      setShowMobileVersion(detectMobile());
      setIsLoading(false);
    }, 50);
  }, []);

  const isDark = theme === "dark" || (theme === "system" && systemTheme === "dark");

  if (isLoading) {
    return (
      <div
        className={`h-screen flex items-center justify-center transition-colors duration-300 ${
          isDark ? "bg-gray-900" : "bg-emerald-50"
        }`}
      >
        {/* LOGO REPLACEMENT: Smart Welcome Loading State */}
        <img 
          src={logo} 
          alt="Loading..." 
          className="w-16 h-16 rounded-xl shadow-lg animate-pulse object-cover" 
        />
      </div>
    );
  }

  return showMobileVersion ? <MobileWelcome /> : <Welcome />;
};

/* ---------------- LOADING SPINNER ---------------- */
const LoadingSpinner = () => {
  const { theme } = useTheme();
  const [systemTheme, setSystemTheme] = useState("light");

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemTheme(mediaQuery.matches ? "dark" : "light");
    const handleChange = (e) => setSystemTheme(e.matches ? "dark" : "light");
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const isDark = theme === "dark" || (theme === "system" && systemTheme === "dark");

  return (
    <div
      className={`h-screen flex items-center justify-center transition-colors duration-300 ${
        isDark ? "bg-gray-900" : "bg-gray-50"
      }`}
    >
      <div className="text-center">
        <div
          className={`w-8 h-8 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-2 transition-colors duration-300 ${
            isDark ? "border-gray-400" : "border-emerald-500"
          }`}
        ></div>
        <p
          className={`text-sm transition-colors duration-300 ${
            isDark ? "text-gray-300" : "text-gray-600"
          }`}
        >
          Loading...
        </p>
      </div>
    </div>
  );
};

/* ---------------- ROUTE GUARD COMPONENT ---------------- */
const RouteGuard = ({ children, requireAuth = false, adminOnly = false, publicOnly = false }) => {
  const { currentUser, isAdmin, loading, authInitialized } = useAuth();
  
  if (loading || !authInitialized) {
    return <LoadingSpinner />;
  }

  // Public only routes (redirect authenticated users)
  if (publicOnly && currentUser) {
    const redirectPath = isAdmin ? "/adminpanel" : "/dashboard";
    return <Navigate to={redirectPath} replace />;
  }

  // Auth required routes
  if (requireAuth && !currentUser) {
    return <Navigate to="/welcome" replace />;
  }

  // Admin only routes
  if (adminOnly && (!currentUser || !isAdmin)) {
    const redirectPath = currentUser ? "/dashboard" : "/welcome";
    return <Navigate to={redirectPath} replace />;
  }

  if (requireAuth && !adminOnly && currentUser && isAdmin) {
    return <Navigate to="/adminpanel" replace />;
  }

  return children;
};

/* ---------------- THEMED APP WRAPPER ---------------- */
const ThemedAppWrapper = () => {
  const { theme, systemTheme } = useTheme();
  const { authInitialized } = useAuth(); 
  const activeTheme = theme === "system" ? systemTheme : theme;
  

  useEffect(() => {
    requestFirebaseNotificationPermission()
      .then((token) => {
        if (token) {
          console.log("🔔 Notification permission granted. Token:", token);
        }
      })
      .catch((err) => console.log("Notification permission error:", err));

    const unsubscribe = onMessageListener((payload) => {
      console.log("💬 Foreground Message Received:", payload);
      const { title, body } = payload.notification || {};
      
      if (Notification.permission === 'granted') {
         new Notification(title, { 
           body,
           icon: '/logo192.png'
         });
      }
    });

    return () => {
    };
  }, []);

  if (!authInitialized) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${
        activeTheme === "dark" ? "bg-gray-900" : "bg-gray-50"
      }`}>
        <div className="flex flex-col items-center">
          {/* LOGO REPLACEMENT: App Initializing State */}
          <img 
            src={logo} 
            alt="EcoSort" 
            className="w-20 h-20 rounded-2xl shadow-xl object-cover mb-4 animate-bounce" 
          />
          <p className={`text-sm font-medium ${
            activeTheme === "dark" ? "text-gray-400" : "text-gray-600"
          }`}>
            Initializing...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${
        activeTheme === "dark" ? "dark" : ""
      } min-h-screen bg-white dark:bg-gray-900 transition-colors duration-300`}
    >
      <Router>
        <BackButtonHandler />
        <Routes>
          <Route path="/" element={<Navigate to="/welcome" replace />} />

          <Route
            path="/welcome"
            element={
              <RouteGuard publicOnly>
                <SmartWelcome />
              </RouteGuard>
            }
          />
          <Route
            path="/login"
            element={
              <RouteGuard publicOnly>
                <Login />
              </RouteGuard>
            }
          />
          <Route
            path="/signup"
            element={
              <RouteGuard publicOnly>
                <Signup />
              </RouteGuard>
            }
          />
           <Route
            path="/verify"
            element={<PublicVerification />}
          />

          {/* User Protected Routes */}
          <Route
            path="/dashboard"
            element={
              <RouteGuard requireAuth>
                <Dashboard />
              </RouteGuard>
            }
          />
          <Route
            path="/forum"
            element={
              <RouteGuard requireAuth>
                <Forum />
              </RouteGuard>
            }
          />
          <Route
            path="/submitwaste"
            element={
              <RouteGuard requireAuth>
                <SubmitWaste />
              </RouteGuard>
            }
          />
          <Route
            path="/rewards"
            element={
              <RouteGuard requireAuth>
                <Rewards />
              </RouteGuard>
            }
          />
          <Route
            path="/report"
            element={
              <RouteGuard requireAuth>
                <Report />
              </RouteGuard>
            }
          />
          <Route
            path="/profile"
            element={
              <RouteGuard requireAuth>
                <Profile />
              </RouteGuard>
            }
          />
          <Route
            path="/transactions"
            element={
              <RouteGuard requireAuth>
                <Transactions />
              </RouteGuard>
            }
          />
          <Route
            path="/leaderboard"
            element={
              <RouteGuard requireAuth>
                <Leaderboard />
              </RouteGuard>
            }
          />
          <Route
            path="/my-redemptions"
            element={
              <RouteGuard requireAuth>
                <MyRedemptions />
              </RouteGuard>
            }
          />
          <Route
            path="/settings"
            element={
              <RouteGuard requireAuth>
                <Settings />
              </RouteGuard>
            }
          />

          {/* Admin Protected Routes */}
          <Route
            path="/adminpanel"
            element={
              <RouteGuard requireAuth adminOnly>
                <AdminPanel />
              </RouteGuard>
            }
          />
          <Route
            path="/adminprofile"
            element={
              <RouteGuard requireAuth adminOnly>
                <AdminProfile />
              </RouteGuard>
            }
          />
          <Route
            path="/adminsettings"
            element={
              <RouteGuard requireAuth adminOnly>
                <AdminSettings />
              </RouteGuard>
            }
          />

          <Route 
            path="*" 
            element={<Navigate to="/welcome" replace />}
          />
        </Routes>
      </Router>
    </div>
  );
};

export default function App() {
  useEffect(() => {
    const isPWA =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;

    if (isPWA) {
      document.body.classList.add("no-select");
      const preventDefault = (e) => e.preventDefault();
      document.addEventListener("copy", preventDefault);
      document.addEventListener("cut", preventDefault);
      document.addEventListener("contextmenu", preventDefault);
      document.addEventListener("selectstart", preventDefault);
      document.addEventListener("dragstart", preventDefault);
      const images = document.querySelectorAll("img");
      images.forEach((img) => img.classList.add("no-save"));

      return () => {
        document.body.classList.remove("no-select");
        document.removeEventListener("copy", preventDefault);
        document.removeEventListener("cut", preventDefault);
        document.removeEventListener("contextmenu", preventDefault);
        document.removeEventListener("selectstart", preventDefault);
        document.removeEventListener("dragstart", preventDefault);
        images.forEach((img) => img.classList.remove("no-save"));
      };
    }
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider> 
        <LanguageProvider> 
          <ThemedAppWrapper />
        </LanguageProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}