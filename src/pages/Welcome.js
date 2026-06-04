import React, { useState, useEffect } from 'react';
import { useNavigate } from "react-router-dom";
import { useTheme } from '../contexts/ThemeContext';

// Icon components
const RecycleIcon = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 2L13.5 6.5L18 8L13.5 9.5L12 14L10.5 9.5L6 8L10.5 6.5L12 2Z" opacity="0.6"/>
    <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="2,2"/>
  </svg>
);

const ReportIcon = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
  </svg>
);

const CommunityIcon = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
  </svg>
);

const SparkleIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 2L13.5 6.5L18 8L13.5 9.5L12 14L10.5 9.5L6 8L10.5 6.5L12 2Z"/>
  </svg>
);

/* ---------------- INSTALL PWA COMPONENT ---------------- */
// Single instance only — renders both the auto-popup and the install card.
// Pass disableAutoPopup={true} to suppress the timed overlay (for secondary placements).
function InstallPWA({ disableAutoPopup = false }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  const [osType, setOsType] = useState('unknown');
  const [showInstructions, setShowInstructions] = useState(false);
  const [showAutoPopup, setShowAutoPopup] = useState(false);

  useEffect(() => {
    // Don't show anything if already installed as PWA
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    if (isStandalone) return;

    // Respect previous dismissal choices
    const dismissedPopup = localStorage.getItem('ecosort-install-dismissed');
    const dismissedTime = localStorage.getItem('ecosort-install-dismissed-time');
    let shouldShowPopup = true;

    if (dismissedPopup === 'permanent') {
      shouldShowPopup = false;
    }
    if (dismissedPopup === 'temporary' && dismissedTime) {
      const daysSince = (Date.now() - parseInt(dismissedTime)) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) shouldShowPopup = false;
    }

    // Detect OS
    const ua = window.navigator.userAgent.toLowerCase();
    const platform = window.navigator.platform.toLowerCase();
    let detectedOS = 'unknown';

    if (/iphone|ipad|ipod/.test(ua)) detectedOS = 'ios';
    else if (/android/.test(ua)) detectedOS = 'android';
    else if (/win/.test(platform)) detectedOS = 'windows';
    else if (/mac/.test(platform)) detectedOS = 'macos';
    else if (/linux/.test(platform)) detectedOS = 'linux';

    setOsType(detectedOS);
    if (detectedOS !== 'unknown') setIsVisible(true);

    // Auto-popup after 3 s (only once, only if not dismissed)
    let timer;
    if (shouldShowPopup && !disableAutoPopup) {
      timer = setTimeout(() => setShowAutoPopup(true), 3000);
    }

    // Native install prompt (Chrome / Edge on Android, Windows, macOS, Linux)
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, [disableAutoPopup]);

  /* --- Helpers --- */
  const getOSLabel = () => {
    const labels = { ios: 'iOS', android: 'Android', windows: 'Windows', macos: 'macOS', linux: 'Linux' };
    return labels[osType] || 'Your Device';
  };

  const triggerNativeOrInstructions = () => {
    if (deferredPrompt && osType !== 'ios') {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((result) => {
        if (result.outcome === 'accepted') setIsVisible(false);
        setDeferredPrompt(null);
      });
    } else {
      setShowInstructions((v) => !v);
    }
  };

  const handleInstallFromPopup = () => {
    setShowAutoPopup(false);
    triggerNativeOrInstructions();
    if (osType !== 'ios' && deferredPrompt) {
      // instructions toggled inside triggerNative, nothing extra needed
    } else {
      setShowInstructions(true);
    }
  };

  const handleDismissPopup = (type) => {
    setShowAutoPopup(false);
    if (type === 'permanent') {
      localStorage.setItem('ecosort-install-dismissed', 'permanent');
    } else {
      localStorage.setItem('ecosort-install-dismissed', 'temporary');
      localStorage.setItem('ecosort-install-dismissed-time', Date.now().toString());
    }
  };

  const getInstructions = () => {
    switch (osType) {
      case 'ios':
        return (
          <ol className="list-none space-y-3">
            <li className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-5 h-5 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold text-xs">1</span>
              <span>Tap the <strong className="text-gray-800">Share</strong> button <span className="inline-block px-1 bg-gray-200 rounded text-xs">⎋</span> in Safari.</span>
            </li>
            <li className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-5 h-5 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold text-xs">2</span>
              <span>Select <strong className="text-gray-800">"Add to Home Screen"</strong>.</span>
            </li>
            <li className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-5 h-5 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold text-xs">3</span>
              <span>Tap <strong className="text-gray-800">Add</strong> at the top right.</span>
            </li>
          </ol>
        );
      case 'android':
        return (
          <ol className="list-none space-y-3">
            <li className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-5 h-5 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold text-xs">1</span>
              <span>Tap the <strong className="text-gray-800">Menu</strong> icon (⋮) in Chrome.</span>
            </li>
            <li className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-5 h-5 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold text-xs">2</span>
              <span>Select <strong className="text-gray-800">"Install App"</strong> or "Add to Home Screen".</span>
            </li>
            <li className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-5 h-5 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold text-xs">3</span>
              <span>Confirm the installation.</span>
            </li>
          </ol>
        );
      case 'windows':
      case 'macos':
      case 'linux':
        return (
          <ol className="list-none space-y-3">
            <li className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-5 h-5 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold text-xs">1</span>
              <span>Look for the <strong className="text-gray-800">install icon</strong> (⊕) in your browser's address bar.</span>
            </li>
            <li className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-5 h-5 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold text-xs">2</span>
              <span>Click it and select <strong className="text-gray-800">"Install"</strong>.</span>
            </li>
            <li className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-5 h-5 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold text-xs">3</span>
              <span><strong>Or:</strong> Open browser menu (⋮) → <strong className="text-gray-800">"Install Ecosort"</strong>.</span>
            </li>
            <li className="text-xs text-gray-500 italic pl-8">
              💡 Supported: Chrome, Edge, Brave, Opera
            </li>
          </ol>
        );
      default:
        return (
          <ol className="list-none space-y-3">
            <li className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-5 h-5 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold text-xs">1</span>
              <span>Open your browser menu (usually ⋮ or ☰).</span>
            </li>
            <li className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-5 h-5 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold text-xs">2</span>
              <span>Look for <strong className="text-gray-800">"Install App"</strong> or "Add to Home Screen".</span>
            </li>
            <li className="flex gap-3 items-start">
              <span className="flex-shrink-0 w-5 h-5 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold text-xs">3</span>
              <span>Follow the prompts to complete installation.</span>
            </li>
          </ol>
        );
    }
  };

  if (!isVisible) return null;

  return (
    <>
      {/* ── Auto-popup overlay (shown once on first visit) ── */}
      {showAutoPopup && !disableAutoPopup && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl animate-slideUp">
            {/* Header */}
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center text-white font-bold text-3xl mb-4 shadow-lg">
                E
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-1">Install Ecosort</h3>
              <p className="text-sm text-gray-500">Add to your {getOSLabel()} home screen</p>
            </div>

            {/* Single simple benefit — no offline / perf / notifications */}
            <div className="bg-emerald-50 rounded-2xl p-4 mb-6 flex items-center gap-3">
              <div className="flex-shrink-0 w-9 h-9 bg-emerald-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">Quick home-screen access</p>
                <p className="text-xs text-gray-500">Open Ecosort like any other app</p>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2">
              <button
                onClick={handleInstallFromPopup}
                className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                </svg>
                Install Now
              </button>
              <button
                onClick={() => handleDismissPopup('temporary')}
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2.5 rounded-xl transition-colors text-sm"
              >
                Remind Me Later
              </button>
              <button
                onClick={() => handleDismissPopup('permanent')}
                className="w-full text-gray-400 hover:text-gray-600 font-medium py-2 text-xs transition-colors"
              >
                Don't Show Again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Inline "Get the App" card ── */}
      <div className="relative max-w-md mx-auto mt-8">
        <div className="relative overflow-hidden bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-green-500/10 backdrop-blur-xl border border-emerald-200/30 rounded-3xl p-4 sm:p-6">
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-50/50 via-teal-50/50 to-green-50/50"></div>
          <div className="relative text-center space-y-3 sm:space-y-4">
            <div className="flex items-center justify-center gap-2">
              <SparkleIcon className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />
              <span className="font-bold text-emerald-800 text-sm sm:text-base">Get the App</span>
              <SparkleIcon className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />
            </div>
            <p className="text-xs sm:text-sm text-gray-700 leading-relaxed px-2">
              Install Ecosort on {getOSLabel()} for quick home-screen access and easier waste reporting.
            </p>
            <button
              onClick={triggerNativeOrInstructions}
              className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl sm:rounded-2xl font-medium hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-200 text-xs sm:text-sm flex items-center justify-center gap-2 mx-auto"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              {deferredPrompt && osType !== 'ios' ? 'Install App' : 'How to Install'}
            </button>
          </div>
        </div>

        {/* Step-by-step instructions (toggled) */}
        {showInstructions && (
          <div className="mt-4 p-4 bg-white/90 backdrop-blur-md border border-gray-200 rounded-2xl shadow-xl animate-fade-in text-left">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h4 className="font-bold text-gray-800">How to Install</h4>
                <p className="text-xs text-gray-500 mt-0.5">Steps for {getOSLabel()}</p>
              </div>
              <button onClick={() => setShowInstructions(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div className="space-y-3 text-sm text-gray-600">
              {getInstructions()}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/* ================================================================
   MAIN WELCOME PAGE
   ================================================================ */
export default function Welcome() {
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(false);
  const [activeFeature, setActiveFeature] = useState(0);
  const { styles, isDark } = useTheme();

  useEffect(() => {
    setIsVisible(true);
    const interval = setInterval(() => {
      setActiveFeature((prev) => (prev + 1) % 3);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const features = [
    {
      icon: RecycleIcon,
      title: 'Earn EcoPoints',
      description: 'Transform recyclable waste into valuable rewards through proper segregation and sustainable practices in your community.',
      gradient: 'from-emerald-400 via-teal-500 to-green-600',
    },
    {
      icon: ReportIcon,
      title: 'Report Issues',
      description: 'Maintain community cleanliness by reporting improper waste disposal and connecting with local authorities for resolution.',
      gradient: 'from-orange-400 via-red-500 to-pink-600',
    },
    {
      icon: CommunityIcon,
      title: 'Community Hub',
      description: 'Connect with neighbors through forums, share environmental ideas, and participate in local sustainability initiatives.',
      gradient: 'from-blue-400 via-indigo-500 to-purple-600',
    },
  ];

  return (
    <div className={`relative min-h-screen overflow-hidden ${styles.page}`}>
      {/* ── Floating background blobs ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute top-20 left-20 w-32 h-32 sm:w-64 sm:h-64 rounded-full blur-3xl animate-pulse ${isDark ? 'bg-emerald-500/10' : 'bg-emerald-200/20'}`}></div>
        <div className={`absolute bottom-20 right-20 w-48 h-48 sm:w-96 sm:h-96 rounded-full blur-3xl animate-pulse delay-1000 ${isDark ? 'bg-teal-500/10' : 'bg-teal-200/20'}`}></div>
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 sm:w-48 sm:h-48 rounded-full blur-2xl animate-pulse delay-2000 ${isDark ? 'bg-green-500/10' : 'bg-green-200/20'}`}></div>
      </div>

      {/* ── Navigation (sticky top) ── */}
      <nav className={`relative z-50 backdrop-blur-xl border-b sticky top-0 shadow-lg ${isDark ? 'bg-slate-900/70 border-white/10' : 'bg-white/70 border-white/20'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 bg-gradient-to-br from-emerald-500 via-teal-500 to-green-600 rounded-lg sm:rounded-xl flex items-center justify-center text-white font-bold text-sm sm:text-lg md:text-xl shadow-lg">
                E
              </div>
              <span className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-black bg-gradient-to-r from-emerald-600 via-teal-600 to-green-700 bg-clip-text text-transparent">
                Ecosort
              </span>
            </div>

            {/* Nav actions */}
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <button
                onClick={() => navigate('/support')}
                className={`hidden sm:flex items-center gap-1.5 px-3 py-2 sm:px-4 rounded-lg sm:rounded-xl font-medium border transition-all duration-200 text-xs sm:text-sm whitespace-nowrap ${isDark ? 'border-gray-600 text-gray-300 bg-slate-800 hover:bg-slate-700' : 'border-gray-200 text-gray-600 bg-white hover:bg-gray-50'}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                Help
              </button>
              <button
                onClick={() => navigate('/signup')}
                className="bg-emerald-500 text-white rounded-lg sm:rounded-xl font-medium shadow-md hover:shadow-lg hover:bg-emerald-600 transition-all duration-200 px-3 py-2 sm:px-4 text-xs sm:text-sm whitespace-nowrap"
              >
                Sign Up
              </button>
              <button
                onClick={() => navigate('/login')}
                className={`px-3 py-2 sm:px-4 rounded-lg sm:rounded-xl font-medium border transition-all duration-200 text-xs sm:text-sm whitespace-nowrap ${isDark ? 'border-gray-600 text-gray-300 bg-slate-800 hover:bg-slate-700' : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'}`}
              >
                Sign In
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Hero Section ── */}
      {/* pt-6 prevents content sitting directly under the sticky nav */}
      <section className={`relative z-10 px-4 sm:px-6 lg:px-8 pt-10 pb-10 sm:pt-14 sm:pb-16 lg:pt-20 lg:pb-20 transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-center items-center">
            <div className="space-y-6 sm:space-y-8 lg:space-y-10 text-center max-w-4xl w-full">
              <div className="space-y-4 sm:space-y-6">
                <h1 className={`text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-black leading-tight ${styles.text.primary}`}>
                  <span className="block bg-gradient-to-r from-emerald-600 via-teal-600 to-green-700 bg-clip-text text-transparent">
                    Ecosort
                  </span>
                  
                </h1>
                <p className={`text-sm sm:text-base lg:text-lg xl:text-xl leading-relaxed max-w-2xl mx-auto ${styles.text.secondary}`}>
                  Transforming communities.
                  <span className="font-semibold text-emerald-700"> Recycle for rewards</span>,{' '}
                  <span className="font-semibold text-red-600">report issues</span>, and{' '}
                  <span className="font-semibold text-blue-600">connect with your community</span> for a cleaner, sustainable future.
                </p>
              </div>

              {/* Install PWA — auto-popup ENABLED here (single instance on the page) */}
              <InstallPWA />
            </div>
          </div>
        </div>
      </section>

      {/* ── Features Section ── */}
      <section
        className={`relative z-10 py-12 sm:py-16 lg:py-24 backdrop-blur-sm ${isDark ? 'bg-slate-800/20' : 'bg-gradient-to-br from-white/80 via-emerald-50/60 to-teal-50/40'}`}
        data-section="features"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section heading */}
          <div className="text-center mb-8 sm:mb-12 lg:mb-20">
            <div className={`inline-flex items-center gap-2 rounded-full px-4 sm:px-6 py-2 sm:py-3 font-medium shadow-lg mb-4 sm:mb-6 lg:mb-8 backdrop-blur-xl text-xs sm:text-sm ${isDark ? 'bg-slate-800/70 border border-emerald-500/30 text-emerald-300' : 'bg-white/70 border border-emerald-200/30 text-emerald-800'}`}>
              <SparkleIcon className="w-3 h-3 sm:w-4 sm:h-4" />
              <span>Platform Features</span>
              <SparkleIcon className="w-3 h-3 sm:w-4 sm:h-4" />
            </div>
            <h2 className={`text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-black mb-3 sm:mb-4 lg:mb-6 ${styles.text.primary}`}>
              Why Use Ecosort?
            </h2>
            <p className={`text-sm sm:text-base lg:text-lg xl:text-xl max-w-3xl mx-auto leading-relaxed px-4 ${styles.text.secondary}`}>
              Ecosort combines recycling rewards, community reporting, and social engagement to create sustainable waste management in your neighborhood.
            </p>
          </div>

          {/* Feature cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
            {features.map((feature, index) => {
              const IconComponent = feature.icon;
              const isActive = activeFeature === index;

              return (
                <div
                  key={index}
                  className={`group relative overflow-hidden rounded-xl sm:rounded-2xl lg:rounded-3xl transition-all duration-700 transform px-4 sm:px-6 py-6 sm:py-8 lg:py-10 ${
                    isActive
                      ? `${isDark ? 'bg-slate-800/90 border-2 border-emerald-400/50' : 'bg-white/90 border-2 border-emerald-200/50'} shadow-2xl scale-105`
                      : `${isDark ? 'bg-slate-800/70 border border-slate-600/30' : 'bg-white/70 border border-white/20'} shadow-xl hover:shadow-2xl hover:scale-[1.02]`
                  }`}
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-5 group-hover:opacity-10 transition-opacity duration-500`}></div>

                  <div className="relative text-center space-y-3 sm:space-y-4 lg:space-y-6">
                    <div className={`relative w-12 h-12 sm:w-16 sm:h-16 lg:w-20 lg:h-20 bg-gradient-to-br ${feature.gradient} rounded-xl sm:rounded-2xl lg:rounded-3xl flex items-center justify-center mx-auto shadow-lg transition-transform duration-500 ${isActive ? 'scale-110 shadow-xl' : 'group-hover:scale-105'}`}>
                      <IconComponent className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 text-white" />
                    </div>

                    <div className="space-y-2 sm:space-y-3 lg:space-y-4">
                      <h3 className={`text-base sm:text-lg lg:text-xl xl:text-2xl font-bold ${styles.text.primary}`}>{feature.title}</h3>
                      <p className={`text-xs sm:text-sm lg:text-base leading-relaxed px-2 ${styles.text.secondary}`}>{feature.description}</p>
                    </div>

                    <div className={`absolute -top-1 -right-1 sm:-top-2 sm:-right-2 w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8 rounded-full flex items-center justify-center text-xs font-bold text-white transition-all duration-300 shadow-lg ${isActive ? `bg-gradient-to-r ${feature.gradient} scale-110` : 'bg-gray-400'}`}>
                      {index + 1}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Help & Support banner */}
          <div className={`mt-8 sm:mt-12 rounded-2xl sm:rounded-3xl p-5 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-6 ${isDark ? 'bg-slate-800/70 border border-slate-600/30' : 'bg-white/70 border border-gray-200/50'} shadow-lg`}>
            <div className="flex items-center gap-4 text-center sm:text-left">
              <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-md flex-shrink-0">
                <svg className="w-6 h-6 sm:w-7 sm:h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <div>
                <h3 className={`text-base sm:text-lg font-bold ${styles.text.primary}`}>Need Help?</h3>
                <p className={`text-xs sm:text-sm ${styles.text.secondary}`}>Browse FAQs, check known issues, or contact our support team.</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/support')}
              className="flex-shrink-0 flex items-center gap-2 px-5 py-2.5 sm:px-6 sm:py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-semibold text-sm shadow-md hover:shadow-lg hover:from-emerald-600 hover:to-teal-700 transition-all duration-200 transform hover:-translate-y-0.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Help &amp; Support
            </button>
          </div>
        </div>
      </section>

      {/* ── CTA Section ── */}
      <section className={`relative z-10 py-12 sm:py-16 lg:py-24 overflow-hidden ${isDark ? 'bg-gradient-to-br from-slate-800 via-gray-800 to-emerald-800' : 'bg-gradient-to-br from-emerald-600 via-teal-600 to-green-700'}`}>
        <div className="absolute inset-0">
          <div className={`absolute top-20 left-20 w-32 h-32 sm:w-64 sm:h-64 rounded-full blur-3xl animate-pulse ${isDark ? 'bg-emerald-400/10' : 'bg-white/5'}`}></div>
          <div className={`absolute bottom-20 right-20 w-48 h-48 sm:w-96 sm:h-96 rounded-full blur-3xl animate-pulse delay-1000 ${isDark ? 'bg-teal-400/5' : 'bg-white/3'}`}></div>
        </div>

        <div className="relative max-w-6xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <div className="space-y-6 sm:space-y-8 lg:space-y-10">
            <div className="space-y-3 sm:space-y-4 lg:space-y-6">
              <div className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl animate-bounce">🌍</div>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-black text-white leading-tight">
                Ready to Transform
                <span className={`block bg-gradient-to-r bg-clip-text text-transparent ${isDark ? 'from-emerald-300 via-teal-300 to-green-300' : 'from-yellow-300 via-amber-300 to-orange-300'}`}>
                  Your Community?
                </span>
              </h2>
              <p className={`text-sm sm:text-base lg:text-lg xl:text-xl max-w-3xl mx-auto leading-relaxed ${isDark ? 'text-gray-200' : 'text-emerald-100'}`}>
                Join Ecosort today and start making meaningful impact in your community's waste management. Every action counts toward a cleaner, sustainable future.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 max-w-lg mx-auto">
              <button
                onClick={() => navigate('/signup')}
                className={`group px-6 py-3 sm:px-8 sm:py-4 rounded-lg font-bold text-sm sm:text-base transition-all duration-200 transform hover:-translate-y-1 shadow-lg flex-1 ${isDark ? 'bg-emerald-500 text-white hover:bg-emerald-400' : 'bg-white text-emerald-600 hover:bg-emerald-50'}`}
              >
                Start Your Journey
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className={`relative z-10 py-8 sm:py-12 lg:py-16 ${isDark ? 'bg-gradient-to-br from-slate-900 via-gray-900 to-slate-800 text-white' : 'bg-gradient-to-br from-slate-900 via-gray-900 to-emerald-900 text-white'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 lg:gap-10">
            {/* Brand */}
            <div className="space-y-3 sm:space-y-4 lg:space-y-6 sm:col-span-2 lg:col-span-1">
              <div className="flex items-center gap-2 sm:gap-3 lg:gap-4">
                <div className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg sm:rounded-xl lg:rounded-2xl flex items-center justify-center text-white font-bold text-sm sm:text-lg lg:text-xl">
                  E
                </div>
                <span className="text-lg sm:text-xl lg:text-2xl font-black bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
                  Ecosort
                </span>
              </div>
              <p className="text-xs sm:text-sm lg:text-base text-gray-300 leading-relaxed">
                Transforming communities through sustainable waste management. Recycle for rewards, report violations, and connect with your community for a cleaner future.
              </p>
            </div>

            {/* Features list */}
            <div>
              <h4 className="font-bold mb-3 sm:mb-4 lg:mb-6 text-emerald-400 text-sm sm:text-base lg:text-lg">Platform Features</h4>
              <ul className="space-y-2 sm:space-y-3 text-gray-300 text-xs sm:text-sm lg:text-base">
                <li className="flex items-center gap-2 sm:gap-3">
                  <span className="text-emerald-400">♻️</span>
                  Recycling Rewards System
                </li>
                <li className="flex items-center gap-2 sm:gap-3">
                  <span className="text-red-400">⚠️</span>
                  Waste Violation Reporting
                </li>
                <li className="flex items-center gap-2 sm:gap-3">
                  <span className="text-blue-400">💬</span>
                  Community Forums
                </li>
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="font-bold mb-3 sm:mb-4 lg:mb-6 text-emerald-400 text-sm sm:text-base lg:text-lg">Contact Info</h4>
              <div className="space-y-2 sm:space-y-3 lg:space-y-4 text-gray-300 text-xs sm:text-sm lg:text-base">
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="text-emerald-400">📧</span>
                  <span className="text-xs sm:text-sm">official.ecosort@gmail.com</span>
                </div>
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="text-green-400">📱</span>
                  <span>Mobile app available</span>
                </div>
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="text-teal-400">🛠️</span>
                  <button
                    onClick={() => navigate('/support')}
                    className="text-teal-400 hover:text-teal-300 underline underline-offset-2 transition-colors text-xs sm:text-sm font-medium"
                  >
                    Help &amp; Support
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-700 mt-6 sm:mt-8 lg:mt-12 pt-4 sm:pt-6 lg:pt-8 text-center">
            <span className="text-gray-400 text-[10px] sm:text-xs lg:text-sm">
              &copy; 2025 Ecosort. All rights reserved.
            </span>
          </div>
        </div>
      </footer>

      {/* ── Styles ── */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(3deg); }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-15px) scale(1.05); }
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-float   { animation: float 6s ease-in-out infinite; }
        .animate-bounce  { animation: bounce 3s ease-in-out infinite; }
        .animate-fade-in { animation: fade-in 0.3s ease-out forwards; }
        .animate-slideUp { animation: slideUp 0.3s ease-out forwards; }

        html { scroll-behavior: smooth; }

        ::-webkit-scrollbar { width: 4px; }
        @media (min-width: 640px) { ::-webkit-scrollbar { width: 6px; } }
        ::-webkit-scrollbar-track { background: rgba(241,245,249,0.5); }
        ::-webkit-scrollbar-thumb { background: linear-gradient(to bottom,#10b981,#0d9488); border-radius: 8px; }
        ::-webkit-scrollbar-thumb:hover { background: linear-gradient(to bottom,#059669,#0f766e); }
        ::selection { background: rgba(16,185,129,0.2); color: #065f46; }
      `}</style>
    </div>
  );
}