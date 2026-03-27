import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { auth } from "../firebase";
import { useTheme } from "../contexts/ThemeContext";

const passwordRules = [
  { id: "length",    label: "At least 8 characters",       test: (p) => p.length >= 8 },
  { id: "uppercase", label: "At least 1 uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { id: "number",    label: "At least 1 number",           test: (p) => /[0-9]/.test(p) },
];

const getPasswordStrength = (pwd) => {
  const passed = passwordRules.filter((r) => r.test(pwd)).length;
  if (passed === 0) return null;
  if (passed === 1) return { label: "Weak",   color: "bg-red-500",    width: "w-1/3" };
  if (passed === 2) return { label: "Fair",   color: "bg-amber-400",  width: "w-2/3" };
  return               { label: "Strong", color: "bg-emerald-500", width: "w-full" };
};

export default function ResetPassword() {
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [status, setStatus] = useState("verifying"); // verifying | ready | success | invalid
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const oobCode = searchParams.get("oobCode");
  const passwordStrength = getPasswordStrength(password);

  // Step 1: verify the code is valid and get the associated email
  useEffect(() => {
    if (!oobCode) {
      setStatus("invalid");
      return;
    }
    verifyPasswordResetCode(auth, oobCode)
      .then((associatedEmail) => {
        setEmail(associatedEmail);
        setStatus("ready");
      })
      .catch(() => {
        setStatus("invalid");
      });
  }, [oobCode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Validate all rules
    const failedRule = passwordRules.find((r) => !r.test(password));
    if (failedRule) {
      setError(failedRule.label + " is required.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      await confirmPasswordReset(auth, oobCode, password);
      setStatus("success");
    } catch (err) {
      if (err.code === "auth/expired-action-code") {
        setError("This reset link has expired. Please request a new one.");
      } else if (err.code === "auth/invalid-action-code") {
        setError("This reset link is invalid or has already been used.");
      } else if (err.code === "auth/weak-password") {
        setError("Password is too weak. Please choose a stronger password.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    }
    setIsSubmitting(false);
  };

  // ── Shared card wrapper ───────────────────────────────────────────────────
  const Card = ({ children }) => (
    <div className={`min-h-screen flex items-center justify-center p-6 transition-colors duration-300 ${isDark ? "bg-gray-900" : "bg-emerald-50"}`}>
      <div className={`w-full max-w-md rounded-2xl shadow-xl p-8 space-y-6 transition-colors duration-300 ${isDark ? "bg-gray-800" : "bg-white"}`}>
        {children}
      </div>
    </div>
  );

  // ── Verifying ─────────────────────────────────────────────────────────────
  if (status === "verifying") {
    return (
      <Card>
        <div className="flex flex-col items-center gap-4 py-4">
          <div className={`w-12 h-12 border-4 border-t-transparent rounded-full animate-spin ${isDark ? "border-gray-400" : "border-emerald-500"}`} />
          <p className={`font-medium ${isDark ? "text-gray-300" : "text-gray-600"}`}>Verifying your reset link…</p>
        </div>
      </Card>
    );
  }

  // ── Invalid / expired link ────────────────────────────────────────────────
  if (status === "invalid") {
    return (
      <Card>
        <div className="text-center space-y-4">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto ${isDark ? "bg-red-900/30" : "bg-red-50"}`}>
            <svg className={`w-7 h-7 ${isDark ? "text-red-400" : "text-red-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <h2 className={`text-xl font-bold ${isDark ? "text-gray-100" : "text-gray-800"}`}>Link expired or invalid</h2>
          <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>
            This password reset link has already been used or has expired. Reset links are only valid for 1 hour.
          </p>
          <button
            onClick={() => navigate("/login")}
            className={`w-full py-3 rounded-xl font-semibold text-white transition-all duration-200 ${isDark ? "bg-emerald-700 hover:bg-emerald-800" : "bg-emerald-600 hover:bg-emerald-700"}`}
          >
            Back to Sign In
          </button>
        </div>
      </Card>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────
  if (status === "success") {
    return (
      <Card>
        <div className="text-center space-y-4">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto ${isDark ? "bg-emerald-900/40" : "bg-emerald-50"}`}>
            <svg className={`w-7 h-7 ${isDark ? "text-emerald-400" : "text-emerald-600"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className={`text-xl font-bold ${isDark ? "text-gray-100" : "text-gray-800"}`}>Password updated!</h2>
          <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>
            Your password has been changed successfully. You can now sign in with your new password.
          </p>
          <button
            onClick={() => navigate("/login")}
            className={`w-full py-3 rounded-xl font-semibold text-white transition-all duration-200 ${isDark ? "bg-emerald-700 hover:bg-emerald-800" : "bg-emerald-600 hover:bg-emerald-700"}`}
          >
            Go to Sign In
          </button>
        </div>
      </Card>
    );
  }

  // ── Ready — show the form ─────────────────────────────────────────────────
  return (
    <Card>
      <div>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-3 ${isDark ? "bg-emerald-900/40" : "bg-emerald-50"}`}>
          <svg className={`w-5 h-5 ${isDark ? "text-emerald-400" : "text-emerald-600"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </div>
        <h1 className={`text-2xl font-bold ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>Set new password</h1>
        <p className={`text-sm mt-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
          Resetting password for <span className={`font-semibold ${isDark ? "text-gray-200" : "text-gray-700"}`}>{email}</span>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* New password */}
        <div>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="New password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              className={`mt-1 block w-full px-4 py-3 border-2 rounded-xl transition-all duration-200 focus:outline-none placeholder-gray-400
                ${isDark
                  ? "border-gray-600 bg-gray-700 text-gray-100 focus:border-emerald-500 hover:border-gray-500"
                  : "border-gray-200 bg-white text-gray-900 focus:border-emerald-500 hover:border-gray-300"}`}
              disabled={isSubmitting}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className={`absolute right-3 top-4 text-sm hover:underline ${isDark ? "text-emerald-400" : "text-emerald-600"}`}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

          {/* Strength bar + checklist */}
          {password.length > 0 && (
            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-2">
                <div className={`flex-1 h-1.5 rounded-full ${isDark ? "bg-gray-600" : "bg-gray-200"}`}>
                  <div className={`h-1.5 rounded-full transition-all duration-300 ${passwordStrength?.color || ""} ${passwordStrength?.width || "w-0"}`} />
                </div>
                {passwordStrength && (
                  <span className={`text-xs font-semibold ${
                    passwordStrength.label === "Strong" ? isDark ? "text-emerald-400" : "text-emerald-600"
                    : passwordStrength.label === "Fair"  ? "text-amber-500"
                    : "text-red-500"
                  }`}>{passwordStrength.label}</span>
                )}
              </div>
              <ul className="space-y-1">
                {passwordRules.map((rule) => {
                  const passed = rule.test(password);
                  return (
                    <li key={rule.id} className={`flex items-center gap-1.5 text-xs transition-colors ${
                      passed
                        ? isDark ? "text-emerald-400" : "text-emerald-600"
                        : isDark ? "text-gray-500" : "text-gray-400"
                    }`}>
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        {passed
                          ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          : <circle cx="12" cy="12" r="9" strokeWidth={1.5} />
                        }
                      </svg>
                      {rule.label}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        {/* Confirm password */}
        <div>
          <div className="relative">
            <input
              type={showConfirm ? "text" : "password"}
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }}
              className={`mt-1 block w-full px-4 py-3 border-2 rounded-xl transition-all duration-200 focus:outline-none placeholder-gray-400
                ${error && error.includes("match")
                  ? "border-red-300 bg-red-50 focus:border-red-500"
                  : isDark
                  ? "border-gray-600 bg-gray-700 text-gray-100 focus:border-emerald-500 hover:border-gray-500"
                  : "border-gray-200 bg-white text-gray-900 focus:border-emerald-500 hover:border-gray-300"}`}
              disabled={isSubmitting}
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className={`absolute right-3 top-4 text-sm hover:underline ${isDark ? "text-emerald-400" : "text-emerald-600"}`}
            >
              {showConfirm ? "Hide" : "Show"}
            </button>
          </div>
          {/* Match indicator */}
          {confirmPassword.length > 0 && (
            <p className={`text-xs mt-1 flex items-center gap-1 ${
              password === confirmPassword
                ? isDark ? "text-emerald-400" : "text-emerald-600"
                : "text-red-500"
            }`}>
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {password === confirmPassword
                  ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                }
              </svg>
              {password === confirmPassword ? "Passwords match" : "Passwords do not match"}
            </p>
          )}
        </div>

        {/* General error */}
        {error && !error.includes("match") && (
          <p className="text-xs text-red-500">{error}</p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className={`w-full py-3 rounded-xl font-semibold text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${isDark ? "bg-emerald-700 hover:bg-emerald-800" : "bg-emerald-600 hover:bg-emerald-700"}`}
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Updating…
            </span>
          ) : "Update Password"}
        </button>
      </form>

      <p className={`text-center text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>
        Remember it?{" "}
        <button
          type="button"
          onClick={() => navigate("/login")}
          className={`font-semibold hover:underline ${isDark ? "text-emerald-400" : "text-emerald-600"}`}
        >
          Back to Sign In
        </button>
      </p>
    </Card>
  );
}