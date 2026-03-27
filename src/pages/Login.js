import React, { useState, useEffect } from "react";
import { auth, db } from "../firebase";
import { signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { signInWithGoogle } from "../utils/googleLogin";
import { useTheme } from "../contexts/ThemeContext";
import { useAuth } from "../contexts/AuthContext";

export default function Login() {
  const { isDark } = useTheme();
  const { currentUser, loading } = useAuth();
  const [values, setValues] = useState({
    email: "",
    password: ""
  });
  const [touched, setTouched] = useState({});
  const [errors, setErrors] = useState({});
  const [isValidating, setIsValidating] = useState(false);
  const [toast, setToast] = useState({ message: '', type: '', visible: false });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetEmailError, setResetEmailError] = useState('');
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const navigate = useNavigate();

  /* useEffect(() => {
  if (!loading && currentUser && currentUser.emailVerified) {
    navigate("/dashboard", { replace: true });
  }
}, [currentUser, loading, navigate]); 
*/

  useEffect(() => {
    const signupEmail = localStorage.getItem('signupEmail');
    if (signupEmail) {
      setValues(prev => ({ ...prev, email: signupEmail }));
      localStorage.removeItem('signupEmail');
    }
  }, []);

  const handleChange = (field, value) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const handleBlur = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const validateAll = () => {
    const newErrors = {};
    if (!values.email) newErrors.email = 'Email is required';
    else if (!validateEmail(values.email)) newErrors.email = 'Please enter a valid email address';

    if (!values.password) newErrors.password = 'Password is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsValidating(true);
    setIsLoggingIn(true);
    
    const isValid = validateAll();
    if (!isValid) {
      setIsValidating(false);
      setIsLoggingIn(false);
      setToast({ message: 'Please fix the errors above.', type: 'error', visible: true });
      setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 4000);
      return;
    }

    try {
      const normalizedEmail = values.email.trim().toLowerCase();
      const userCred = await signInWithEmailAndPassword(auth, normalizedEmail, values.password);
      const user = userCred.user;

      // Force reload to get the latest email verified status
      await user.reload(); 

      // Force token refresh so Firestore Rules instantly recognize the user as verified
      await user.getIdToken(true);

      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      // Block unverified users ONLY if they are brand-new (no Firestore doc yet).
      // Pre-existing users created before email verification was enforced are
      // allowed through — their Firestore document is their proof of legitimacy.
      if (!user.emailVerified && !userSnap.exists()) {
        await signOut(auth);
        setIsLoggingIn(false);
        setIsValidating(false);
        setToast({ message: 'Please verify your email address before logging in. Check your inbox.', type: 'error', visible: true });
        setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 4000);
        return;
      }

      let role = "resident";
      
      if (userSnap.exists()) {
        role = userSnap.data().role || "resident";
      } else {
        await setDoc(userRef, {
          email: normalizedEmail,
          username: user.displayName || 'User', 
          totalPoints: 0,
          role: "resident"
        });
      }

      setToast({ message: 'Login successful!', type: 'success', visible: true });
      
      const redirectPath = role === "admin" ? "/adminpanel" : "/dashboard";
      
      // Add a slight delay so AuthContext can update before RouteGuard checks it
      setTimeout(() => {
        navigate(redirectPath, { replace: true });
      }, 500);
      
    } catch (err) {
      console.error(err);
      setIsLoggingIn(false);
      
      let errorMessage = 'Login failed. Please check your credentials.';
      if (err.code === 'auth/user-not-found') errorMessage = 'No account found with this email address.';
      else if (err.code === 'auth/wrong-password') errorMessage = 'Incorrect password. Please try again.';
      else if (err.code === 'auth/invalid-email') errorMessage = 'Invalid email address format.';
      else if (err.code === 'auth/user-disabled') errorMessage = 'This account has been disabled.';
      
      setToast({ message: errorMessage, type: 'error', visible: true });
      setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 4000);
    }

    setIsValidating(false);
  };

const handleGoogleLogin = async (e) => {
  if (e) e.preventDefault();
  setIsLoggingIn(true);
  
  try {
    const userCred = await signInWithGoogle();
    const user = userCred.user || userCred; 
    const normalizedEmail = user.email.trim().toLowerCase();
    
    // 1. Force token refresh to ensure claims are active
    await user.getIdToken(true);

    // 2. Check if the user document exists
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    let role = "resident";
    
    if (userSnap.exists()) {
      role = userSnap.data().role || "resident";
    } else {
      // 3. Create document FIRST, then wait for it to complete
      await setDoc(userRef, {
        email: normalizedEmail,
        username: user.displayName || 'User',
        profilePicture: user.photoURL || '',
        totalPoints: 0,
        role: "resident",
        createdAt: new Date().toISOString()
      });
    }

    setToast({ message: 'Google login successful!', type: 'success', visible: true });
    
    // 4. ONLY NOW navigate to the dashboard
    const redirectPath = role === "admin" ? "/adminpanel" : "/dashboard";
    
    // Give Firestore a split second to propagate
    setTimeout(() => {
      navigate(redirectPath, { replace: true });
    }, 500);
    
  } catch (error) {
    console.error("Google login error:", error);
    setIsLoggingIn(false);
    setToast({ message: error.message || 'Google login failed.', type: 'error', visible: true });
  }
};

  const APP_URL = "https://ecosort-51471.web.app";

  const handleForgotPassword = async () => {
    setResetEmailError('');
    const email = resetEmail.trim().toLowerCase();
    if (!email) { setResetEmailError('Please enter your email address.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setResetEmailError('Please enter a valid email address.'); return; }
    setIsSendingReset(true);
    try {
      await sendPasswordResetEmail(auth, email, {
        url: `${APP_URL}/reset-password`,
        handleCodeInApp: false,
      });
      setResetSent(true);
    } catch (err) {
      if (err.code === 'auth/user-not-found')         setResetEmailError('No account found with this email address.');
      else if (err.code === 'auth/invalid-email')     setResetEmailError('Invalid email address format.');
      else if (err.code === 'auth/too-many-requests') setResetEmailError('Too many requests. Please wait and try again.');
      else setResetEmailError('Failed to send reset email. Please try again.');
    }
    setIsSendingReset(false);
  };

  const openForgotPassword = () => {
    setResetEmail(values.email || '');
    setResetEmailError('');
    setResetSent(false);
    setShowForgotPassword(true);
  };

  const closeForgotPassword = () => {
    setShowForgotPassword(false);
    setResetEmail('');
    setResetEmailError('');
    setResetSent(false);
  };

  const renderError = (field) =>
    touched[field] && errors[field] && (
      <p className="text-xs text-red-500 mt-1">{errors[field]}</p>
    );

  const inputClasses = (field) => `
    mt-1 block w-full px-4 py-3 border-2 rounded-xl transition-all duration-200
    focus:outline-none placeholder-gray-400
    ${touched[field] && errors[field]
      ? 'border-red-300 bg-red-50 focus:border-red-500'
      : isDark
      ? 'border-gray-600 bg-gray-700 text-gray-100 focus:border-emerald-500 hover:border-gray-500'
      : 'border-gray-200 bg-white text-gray-900 focus:border-emerald-500 hover:border-gray-300'}
  `;

  if (isLoggingIn) {
    return (
      <div className={`${isDark ? 'bg-gray-900' : 'bg-emerald-50'} min-h-screen flex items-center justify-center transition-colors duration-300`}>
        <div className="text-center">
          <div className={`w-12 h-12 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-4 ${isDark ? 'border-gray-400' : 'border-emerald-500'}`}></div>
          <p className={`${isDark ? 'text-gray-300' : 'text-gray-600'} font-medium`}>
            Signing you in...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${isDark ? 'bg-gray-900 text-gray-100' : 'bg-emerald-50 text-gray-900'} min-h-screen flex items-center justify-center p-6 transition-colors duration-300`}>
      <div className={`${isDark ? 'bg-gray-800' : 'bg-white'} w-full max-w-md p-8 rounded-2xl shadow-xl space-y-6 transition-colors duration-300`}>
        <div className="text-center">
          <h1 className={`${isDark ? 'text-emerald-400' : 'text-emerald-700'} text-2xl font-bold`}>Welcome Back</h1>
          <p className={`${isDark ? 'text-gray-300' : 'text-gray-500'} text-sm`}>Sign in to your account</p>
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={isValidating}
          className={`${isDark ? 'border-gray-600 text-gray-200 hover:bg-gray-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'} w-full flex items-center justify-center gap-3 py-3 px-4 border-2 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          <span className="font-medium">Sign in with Google</span>
        </button>

        <div className={`relative ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          <div className="absolute inset-0 flex items-center">
            <div className={`w-full border-t ${isDark ? 'border-gray-600' : 'border-gray-200'}`} />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className={`px-2 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>Or continue with email</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="email"
              placeholder="Email"
              className={inputClasses('email')}
              value={values.email}
              onChange={(e) => handleChange('email', e.target.value)}
              onBlur={() => handleBlur('email')}
              disabled={isValidating}
            />
            {renderError('email')}
          </div>

          <div>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                className={inputClasses('password')}
                value={values.password}
                onChange={(e) => handleChange('password', e.target.value)}
                onBlur={() => handleBlur('password')}
                disabled={isValidating}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className={`absolute right-3 top-4 text-sm ${isDark ? 'text-emerald-400' : 'text-emerald-600'} hover:underline`}
                disabled={isValidating}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {renderError('password')}
            <div className="flex justify-end mt-1">
              <button
                type="button"
                onClick={openForgotPassword}
                className={`text-xs font-medium hover:underline ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}
              >
                Forgot password?
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isValidating}
            className={`${isDark ? 'bg-emerald-700 hover:bg-emerald-800 text-white' : "bg-emerald-600 hover:bg-emerald-700 text-white"} w-full py-3 rounded-xl font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isValidating ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <p className={`${isDark ? 'text-gray-400' : 'text-gray-500'} text-center text-sm`}>
          Don't have an account?{' '}
          <button
            type="button"
            onClick={() => navigate("/signup")}
            className={`${isDark ? 'text-emerald-400' : 'text-emerald-600'} font-semibold hover:underline`}
            disabled={isValidating}
          >
            Sign up
          </button>
        </p>
      </div>

      {/* ── Forgot Password Modal ── */}
      {showForgotPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeForgotPassword} />
          <div className={`relative w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-4 transition-colors duration-300 ${isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-100'}`}>
            <button
              type="button"
              onClick={closeForgotPassword}
              className={`absolute top-4 right-4 w-7 h-7 rounded-full flex items-center justify-center transition-colors ${isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-100'}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {!resetSent ? (
              <>
                <div>
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-3 ${isDark ? 'bg-emerald-900/40' : 'bg-emerald-50'}`}>
                    <svg className={`w-5 h-5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                  </div>
                  <h2 className={`text-lg font-bold ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>Reset your password</h2>
                  <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Enter your email and we'll send you a link to set a new password.
                  </p>
                </div>
                <div>
                  <input
                    type="email"
                    placeholder="Email address"
                    value={resetEmail}
                    onChange={(e) => { setResetEmail(e.target.value); setResetEmailError(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleForgotPassword()}
                    disabled={isSendingReset}
                    className={`block w-full px-4 py-3 border-2 rounded-xl transition-all duration-200 focus:outline-none placeholder-gray-400
                      ${resetEmailError
                        ? 'border-red-300 bg-red-50 focus:border-red-500'
                        : isDark
                        ? 'border-gray-600 bg-gray-700 text-gray-100 focus:border-emerald-500 hover:border-gray-500'
                        : 'border-gray-200 bg-white text-gray-900 focus:border-emerald-500 hover:border-gray-300'}`}
                  />
                  {resetEmailError && <p className="text-xs text-red-500 mt-1">{resetEmailError}</p>}
                </div>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={isSendingReset}
                  className={`w-full py-3 rounded-xl font-semibold text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${isDark ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                >
                  {isSendingReset ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                      </svg>
                      Sending…
                    </span>
                  ) : 'Send Reset Link'}
                </button>
              </>
            ) : (
              <div className="text-center py-2 space-y-3">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto ${isDark ? 'bg-emerald-900/40' : 'bg-emerald-50'}`}>
                  <svg className={`w-7 h-7 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h2 className={`text-lg font-bold ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>Check your inbox</h2>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  A reset link was sent to <span className={`font-semibold ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{resetEmail}</span>. Check your spam folder if you don't see it.
                </p>
                <button
                  type="button"
                  onClick={closeForgotPassword}
                  className={`w-full py-2.5 rounded-xl font-semibold text-sm text-white transition-all duration-200 ${isDark ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                >
                  Back to Sign In
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {toast.visible && (
        <div className={`fixed top-4 left-1/2 transform -translate-x-1/2
          px-4 py-2 rounded-xl text-white shadow-lg z-50
          transition-all duration-300 max-w-xl w-auto
          whitespace-nowrap overflow-x-auto
          ${toast.type === 'success' ? 'bg-green-700' : toast.type === 'error' ? 'bg-red-500' : ''}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}