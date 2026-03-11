import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";

// ─── Tab history bus ──────────────────────────────────────────────────────────
// Any page that has internal tabs (AdminPanel, Dashboard) calls
// pushTab() when the user switches tabs, and setDefaultTab() once on mount.
//
// ── How to wire up AdminPanel.js (and Dashboard.js the same way): ────────────
//
//   import { pushTab, setDefaultTab, TAB_BACK_EVENT } from "../BackButtonHandler";
//
//   useEffect(() => {
//     setDefaultTab("/adminpanel", "overview");          // register home tab
//     return () => setDefaultTab("/adminpanel", null);   // clean up on unmount
//   }, []);
//
//   // Listen for back-button tab pops
//   useEffect(() => {
//     const handler = (e) => {
//       if (e.detail.pathname === "/adminpanel") setActiveTab(e.detail.tabId);
//     };
//     window.addEventListener(TAB_BACK_EVENT, handler);
//     return () => window.removeEventListener(TAB_BACK_EVENT, handler);
//   }, []);
//
//   // Whenever the user switches a tab — replace your existing setActiveTab call:
//   const handleTabChange = (tabId) => {
//     setActiveTab(tabId);
//     pushTab("/adminpanel", tabId);   // ← only addition needed
//   };

const _tabHistory  = {};   // { "/adminpanel": ["overview", "submissions", ...] }
const _defaultTabs = {};   // { "/adminpanel": "overview" }

/** Call from your page whenever the active tab changes. */
export const pushTab = (pathname, tabId) => {
  if (!_tabHistory[pathname]) _tabHistory[pathname] = [];
  const stack = _tabHistory[pathname];
  if (stack[stack.length - 1] !== tabId) stack.push(tabId);
};

/** Call once on mount to set what the "home" tab is for a route. */
export const setDefaultTab = (pathname, tabId) => {
  _defaultTabs[pathname] = tabId;
  // Seed the stack so the first back press lands on the default tab
  if (tabId && (!_tabHistory[pathname] || _tabHistory[pathname].length === 0)) {
    _tabHistory[pathname] = [tabId];
  }
};

/** Returns true if there is a tab to go back to (stack has > 1 entry). */
const _hasTabHistory = (pathname) => {
  const stack = _tabHistory[pathname];
  return !!(stack && stack.length > 1);
};

/** Pops the current tab and returns the previous one. */
const _popTab = (pathname) => {
  const stack = _tabHistory[pathname];
  if (!stack || stack.length <= 1) return _defaultTabs[pathname] ?? null;
  stack.pop();
  return stack[stack.length - 1];
};

// ─── Custom DOM event fired when a tab should be popped ──────────────────────
// Pages listen to this to switch their active tab without a shared context.
export const TAB_BACK_EVENT = "ecosort:tabBack";

// ─── Pages that use internal tabs (not separate routes) ──────────────────────
const TAB_PAGES = new Set(["/adminpanel", "/dashboard"]);

// ─── Root paths ───────────────────────────────────────────────────────────────
const USER_ROOT   = ["/dashboard"];
const ADMIN_ROOT  = ["/adminpanel"];
const PUBLIC_ROOT = ["/welcome", "/login", "/signup"];

// ─────────────────────────────────────────────────────────────────────────────
const BackButtonHandler = () => {
  const location      = useLocation();
  const navigate      = useNavigate();
  const lastBackPress = useRef(0);
  const [showExitPrompt, setShowExitPrompt] = useState(false);
  const { isAdmin, currentUser, loading, authInitialized } = useAuth();

  const locationRef = useRef(location);
  locationRef.current = location;

  // Push a browser-history guard on every route change so popstate always
  // fires before the OS can close/minimize the PWA.
  useEffect(() => {
    window.history.pushState({ ecosortGuard: true }, "", location.pathname);
  }, [location.pathname]);

  // Main back-button handler
  useEffect(() => {
    if (loading || !authInitialized) return;

    const handlePopState = () => {
      const now         = Date.now();
      const currentPath = locationRef.current.pathname;

      // ── Case 1: Tab-capable page with tab history to pop ─────────────────
      if (TAB_PAGES.has(currentPath) && _hasTabHistory(currentPath)) {
        // Immediately re-push the guard so browser stays in-app
        window.history.pushState({ ecosortGuard: true }, "", currentPath);

        const prevTab = _popTab(currentPath);
        if (prevTab) {
          window.dispatchEvent(
            new CustomEvent(TAB_BACK_EVENT, { detail: { pathname: currentPath, tabId: prevTab } })
          );
        }
        return;
      }

      // ── Case 2: Root page (default/home tab is showing) ───────────────────
      const rootPaths = currentUser
        ? (isAdmin ? ADMIN_ROOT : USER_ROOT)
        : PUBLIC_ROOT;

      if (rootPaths.includes(currentPath)) {
        window.history.pushState({ ecosortGuard: true }, "", currentPath);

        if (now - lastBackPress.current < 2000) {
          setShowExitPrompt(false);
        } else {
          lastBackPress.current = now;
          setShowExitPrompt(true);
          setTimeout(() => setShowExitPrompt(false), 2000);
        }
        return;
      }

      // ── Case 3: Normal in-app page — navigate back ────────────────────────
      navigate(-1);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [navigate, isAdmin, currentUser, loading, authInitialized]);

  return (
    <>
      {showExitPrompt && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm px-4 py-2 rounded-lg shadow-xl z-50 animate-pulse">
          Press back again to exit
        </div>
      )}
    </>
  );
};

export default BackButtonHandler;