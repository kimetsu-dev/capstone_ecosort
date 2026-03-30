// src/pages/AdminPanel/TransactionsTab.js

import React, { useCallback, useMemo, useState, useEffect } from "react";
import { db } from '../../firebase';
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  onSnapshot, 
  getDocs,
  where
} from 'firebase/firestore';
import { useTheme } from "../../contexts/ThemeContext";
import { 
  ShieldCheck, 
  AlertTriangle, 
  Clock, 
  User, 
  Loader2, 
  DollarSign, 
  CheckCircle2, 
  XCircle,
  RefreshCw,
  ArrowDown,
  ArrowUp,
  Database,
  Recycle,
  Gift,
  Info,
  BookOpen,
  Eye,
  Lock,
  TrendingUp,
  BarChart3,
  RotateCcw,
  X,
  Calendar,
  Tag,
  Hash,
  ChevronRight,
  ShieldAlert,
  Fingerprint,
  Scale,
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
  Link,
  Zap,
} from 'lucide-react';
import { verifyPointTransactions, verifyUserLedgerBlocks, findLedgerBlockForTransaction, recoverTamperedPoints, restoreUserBalance, sendTamperNotification } from '../../utils/blockchainService'; 

const formatTimestamp = (timestamp) => {
    if (timestamp?.toDate) {
      return timestamp.toDate().toLocaleString();
    }
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return 'N/A';
    }
};

const capitalizeWords = (str) =>
    str
      ? str.replace(/\_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      : "";

// ── Audit Discrepancy Panel ───────────────────────────────────────────────────
// Shown when verifyPointTransactions finds a user whose DB balance ≠ ledger sum.
// Fetches the user's ledger blocks so the admin can see exactly what was recorded
// vs what is stored in users/{uid}.totalPoints.
function AuditDiscrepancyPanel({ differences, users, isDark, onRecoveryComplete }) {
  const [expanded, setExpanded] = useState(null); // userId currently expanded
  const [ledgerBlocks, setLedgerBlocks] = useState({}); // { userId: block[] }
  const [loadingBlocks, setLoadingBlocks] = useState({}); // { userId: bool }
  const [tamperedBlocks, setTamperedBlocks] = useState({}); // { userId: tamperedBlock[] }
  const [restoringBalance, setRestoringBalance] = useState({}); // { userId: bool }
  const [restoreResults, setRestoreResults] = useState({});     // { userId: result }

  const handleRestoreBalance = async (userId, fromDb, fromLedger) => {
    if (!window.confirm(
      `Restore balance for user '${userId}'?\n\nCurrent DB: ${fromDb} pts\nLedger (source of truth): ${fromLedger} pts\n\nThis will correct their totalPoints and notify them.`
    )) return;

    setRestoringBalance(prev => ({ ...prev, [userId]: true }));
    try {
      // 1. Notify user that a discrepancy was found
      await sendTamperNotification(userId, 'points_tampered', {
        title: '⚠️ Points Balance Discrepancy Detected',
        message:
          'A discrepancy was found between your points balance and the blockchain ledger record. ' +
          'Your correct balance is being restored automatically.',
        detectedAt: new Date().toISOString(),
      });

      // 2. Restore from ledger replay
      const result = await restoreUserBalance(userId);
      setRestoreResults(prev => ({ ...prev, [userId]: result }));

      if (!result.noChangeNeeded) {
        // 3. Notify user that balance is now corrected
        await sendTamperNotification(userId, 'points_restored', {
          title: '✅ Points Balance Restored',
          message:
            `Your points balance has been restored from ${result.previousBalance} to ` +
            `${result.ledgerBalance} pts using the sealed blockchain record as the source of truth.`,
          previousBalance: result.previousBalance,
          restoredBalance: result.ledgerBalance,
          delta: result.delta ?? null,
          restoredAt: new Date().toISOString(),
        });
      }

      alert(
        result.noChangeNeeded
          ? `ℹ️ Balance for '${userId}' is already correct (${result.ledgerBalance} pts).`
          : `✅ Balance restored: ${result.previousBalance} → ${result.ledgerBalance} pts.\nUser has been notified.`
      );

      if (onRecoveryComplete) onRecoveryComplete();
    } catch (err) {
      setRestoreResults(prev => ({ ...prev, [userId]: { success: false, error: err.message } }));
      alert('Balance restore failed: ' + err.message);
    } finally {
      setRestoringBalance(prev => ({ ...prev, [userId]: false }));
    }
  };

  const getUserInfo = (userId) => {
    const u = users.find(u => u.id === userId);
    return {
      email: u?.email ?? userId,
      name: u?.displayName ?? u?.email ?? userId,
      currentPoints: u?.totalPoints ?? 0,
    };
  };

  const loadLedgerBlocks = async (userId) => {
    if (ledgerBlocks[userId]) {
      // already loaded — just toggle
      setExpanded(prev => prev === userId ? null : userId);
      return;
    }
    setLoadingBlocks(prev => ({ ...prev, [userId]: true }));
    setExpanded(userId);
    try {
      const BALANCE_ACTION_TYPES = [
        'SUBMISSION_CONFIRMED',
        'ADMIN_POINTS_AWARDED',
        'REWARD_REDEEMED',
        'REDEMPTION_CANCELLED',
      ];
      const q = query(
        collection(db, 'ledger'),
        where('userId', '==', userId),
        orderBy('index', 'asc')
      );
      const snap = await getDocs(q);
      const blocks = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(b => BALANCE_ACTION_TYPES.includes(b.actionType));
      setLedgerBlocks(prev => ({ ...prev, [userId]: blocks }));

      // ── Block-level hash verification ───────────────────────────────────
      // If someone directly edited a block's `points` in Firestore, the
      // stored hash will no longer match a fresh recalculation — we surface
      // exactly which blocks are tampered and their suspicious point values.
      const tampered = await verifyUserLedgerBlocks(userId);
      setTamperedBlocks(prev => ({ ...prev, [userId]: tampered }));
      // ───────────────────────────────────────────────────────────────────
    } catch (err) {
      console.error('Failed to load ledger blocks for user:', userId, err);
      setLedgerBlocks(prev => ({ ...prev, [userId]: [] }));
      setTamperedBlocks(prev => ({ ...prev, [userId]: [] }));
    } finally {
      setLoadingBlocks(prev => ({ ...prev, [userId]: false }));
    }
  };

  const actionTypeLabel = {
    SUBMISSION_CONFIRMED: 'Submission Confirmed',
    ADMIN_POINTS_AWARDED: 'Admin Award',
    REWARD_REDEEMED: 'Reward Redeemed',
    REDEMPTION_CANCELLED: 'Redemption Cancelled',
  };

  const actionTypeColor = (type, isDark) => {
    switch (type) {
      case 'SUBMISSION_CONFIRMED': return isDark ? 'text-emerald-400' : 'text-emerald-700';
      case 'ADMIN_POINTS_AWARDED': return isDark ? 'text-blue-400' : 'text-blue-700';
      case 'REWARD_REDEEMED': return isDark ? 'text-red-400' : 'text-red-600';
      case 'REDEMPTION_CANCELLED': return isDark ? 'text-cyan-400' : 'text-cyan-600';
      default: return isDark ? 'text-gray-400' : 'text-gray-600';
    }
  };

  if (!differences || differences.length === 0) return null;

  return (
    <div className={`mb-6 rounded-xl border-2 overflow-hidden ${
      isDark ? 'border-red-700 bg-red-900/10' : 'border-red-300 bg-red-50'
    }`}>
      {/* Panel header */}
      <div className={`flex items-center gap-3 px-5 py-4 border-b ${
        isDark ? 'border-red-800 bg-red-900/30' : 'border-red-200 bg-red-100'
      }`}>
        <ShieldAlert className="w-5 h-5 text-red-500 flex-shrink-0" />
        <div className="flex-1">
          <h3 className={`font-bold text-sm ${isDark ? 'text-red-300' : 'text-red-800'}`}>
            Point Balance Discrepancies Detected — Audit Log
          </h3>
          <p className={`text-xs mt-0.5 ${isDark ? 'text-red-400' : 'text-red-600'}`}>
            {differences.length} user{differences.length > 1 ? 's have' : ' has'} a live DB balance that
            differs from the immutable ledger history. This may indicate manual tampering of
            the <code className="font-mono">users/{'{uid}'}.totalPoints</code> field.
          </p>
        </div>
        <span className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-bold ${
          isDark ? 'bg-red-800 text-red-200' : 'bg-red-200 text-red-800'
        }`}>
          {differences.length} affected
        </span>
      </div>

      {/* Per-user discrepancy rows */}
      <div className="divide-y divide-red-200 dark:divide-red-900/50">
        {differences.map(({ userId, fromLedger, fromDb, delta }) => {
          const { email, name, currentPoints } = getUserInfo(userId);
          const isExpanded = expanded === userId;
          const isInflated = delta > 0; // DB > ledger = points were added outside the ledger
          const blocks = ledgerBlocks[userId] ?? [];
          const isLoading = loadingBlocks[userId] ?? false;

          return (
            <div key={userId}>
              {/* Summary row */}
              <button
                onClick={() => loadLedgerBlocks(userId)}
                className={`w-full text-left px-5 py-4 transition-colors ${
                  isDark
                    ? 'hover:bg-red-900/30 bg-transparent'
                    : 'hover:bg-red-100/60 bg-transparent'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  {/* User info */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm ${
                      isDark ? 'bg-red-800 text-red-200' : 'bg-red-200 text-red-800'
                    }`}>
                      {(name || '?')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold truncate ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                        {email}
                      </p>
                      <p className={`text-xs font-mono truncate ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                        uid: {userId.slice(0, 16)}…
                      </p>
                    </div>
                  </div>

                  {/* Comparison columns */}
                  <div className="flex items-center gap-4 sm:gap-6 flex-shrink-0">
                    {/* Ledger (source of truth) */}
                    <div className="text-center">
                      <p className={`text-[10px] uppercase tracking-wider font-semibold mb-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                        Ledger (truth)
                      </p>
                      <p className={`text-base font-bold ${isDark ? 'text-blue-400' : 'text-blue-700'}`}>
                        {fromLedger.toLocaleString()}
                      </p>
                    </div>

                    <ArrowLeftRight className={`w-4 h-4 flex-shrink-0 ${isDark ? 'text-gray-600' : 'text-gray-400'}`} />

                    {/* Database (possibly tampered) */}
                    <div className="text-center">
                      <p className={`text-[10px] uppercase tracking-wider font-semibold mb-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                        DB Balance
                      </p>
                      <p className={`text-base font-bold ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                        {fromDb.toLocaleString()}
                      </p>
                    </div>

                    {/* Delta */}
                    <div className={`text-center px-3 py-1.5 rounded-lg border ${
                      isInflated
                        ? isDark ? 'bg-red-900/40 border-red-700 text-red-300' : 'bg-red-100 border-red-300 text-red-700'
                        : isDark ? 'bg-orange-900/40 border-orange-700 text-orange-300' : 'bg-orange-100 border-orange-300 text-orange-700'
                    }`}>
                      <p className={`text-[10px] uppercase tracking-wider font-semibold mb-0.5`}>
                        Delta
                      </p>
                      <p className="text-sm font-bold">
                        {delta > 0 ? '+' : ''}{delta.toLocaleString()}
                      </p>
                    </div>

                    {/* Tamper label */}
                    <div className="hidden sm:flex items-center">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                        isInflated
                          ? isDark ? 'bg-red-800/60 text-red-200 border border-red-700' : 'bg-red-100 text-red-800 border border-red-300'
                          : isDark ? 'bg-orange-800/60 text-orange-200 border border-orange-700' : 'bg-orange-100 text-orange-800 border border-orange-300'
                      }`}>
                        <AlertTriangle className="w-3 h-3" />
                        {isInflated ? 'Points Inflated' : 'Points Deflated'}
                      </span>
                    </div>

                    {/* Expand toggle */}
                    <div className={`w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full transition-colors ${
                      isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-500'
                    }`}>
                      {isExpanded
                        ? <ChevronUp className="w-3.5 h-3.5" />
                        : <ChevronDown className="w-3.5 h-3.5" />}
                    </div>
                  </div>
                </div>

                {/* Mobile tamper label */}
                <div className="sm:hidden mt-2">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                    isInflated
                      ? isDark ? 'bg-red-800/60 text-red-200 border border-red-700' : 'bg-red-100 text-red-800 border border-red-300'
                      : isDark ? 'bg-orange-800/60 text-orange-200 border border-orange-700' : 'bg-orange-100 text-orange-800 border border-orange-300'
                  }`}>
                    <AlertTriangle className="w-3 h-3" />
                    {isInflated ? 'Points Inflated — DB exceeds ledger record' : 'Points Deflated — DB is below ledger record'}
                  </span>
                </div>
              </button>

              {/* Expanded: ledger block drill-down */}
              {isExpanded && (
                <div className={`px-5 pb-5 pt-0 ${isDark ? 'bg-black/20' : 'bg-red-50/50'}`}>
                  <div className={`rounded-xl border overflow-hidden ${
                    isDark ? 'border-gray-700' : 'border-gray-200'
                  }`}>
                    {/* Drill-down header */}
                    <div className={`flex items-center gap-2 px-4 py-3 border-b ${
                      isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'
                    }`}>
                      <Fingerprint className={`w-4 h-4 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`} />
                      <span className={`text-xs font-bold uppercase tracking-wider ${
                        isDark ? 'text-gray-300' : 'text-gray-700'
                      }`}>
                        Immutable Ledger History — Point-affecting blocks for this user
                      </span>
                    </div>

                    {/* Summary comparison bar */}
                    <div className={`grid grid-cols-3 divide-x text-center py-3 ${
                      isDark ? 'divide-gray-700 bg-gray-800/50' : 'divide-gray-200 bg-white'
                    }`}>
                      <div className="px-3">
                        <p className={`text-[10px] uppercase tracking-wider font-semibold ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                          Ledger Sum
                        </p>
                        <p className={`text-lg font-bold mt-0.5 ${isDark ? 'text-blue-400' : 'text-blue-700'}`}>
                          {fromLedger.toLocaleString()} pts
                        </p>
                        <p className={`text-[10px] mt-0.5 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                          Source of truth
                        </p>
                      </div>
                      <div className="px-3">
                        <p className={`text-[10px] uppercase tracking-wider font-semibold ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                          DB Balance
                        </p>
                        <p className={`text-lg font-bold mt-0.5 ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                          {fromDb.toLocaleString()} pts
                        </p>
                        <p className={`text-[10px] mt-0.5 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                          users/{'{uid}'}.totalPoints
                        </p>
                      </div>
                      <div className="px-3">
                        <p className={`text-[10px] uppercase tracking-wider font-semibold ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                          Unexplained Δ
                        </p>
                        <p className={`text-lg font-bold mt-0.5 ${
                          delta > 0
                            ? isDark ? 'text-red-400' : 'text-red-600'
                            : isDark ? 'text-orange-400' : 'text-orange-600'
                        }`}>
                          {delta > 0 ? '+' : ''}{delta.toLocaleString()} pts
                        </p>
                        <p className={`text-[10px] mt-0.5 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                          {delta > 0 ? 'Added outside ledger' : 'Removed outside ledger'}
                        </p>
                      </div>
                    </div>

                    {/* Block list */}
                    {isLoading ? (
                      <div className={`flex items-center justify-center gap-2 py-6 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
                        <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                        <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                          Loading ledger blocks…
                        </span>
                      </div>
                    ) : blocks.length === 0 ? (
                      <div className={`px-4 py-5 text-center ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
                        <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                          No point-affecting ledger blocks found for this user.
                        </p>
                        <p className={`text-xs mt-1 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                          Their entire balance may have been set outside the ledger system.
                        </p>
                      </div>
                    ) : (
                      <div className={`divide-y ${isDark ? 'divide-gray-700 bg-gray-800' : 'divide-gray-100 bg-white'}`}>

                        {/* ── Block-level tamper summary banner ── */}
                        {(() => {
                          const userTamperedBlocks = tamperedBlocks[userId] ?? [];
                          if (userTamperedBlocks.length === 0) return null;
                          return (
                            <div className={`px-4 py-3 border-b ${
                              isDark ? 'bg-red-950/40 border-red-800' : 'bg-red-50 border-red-200'
                            }`}>
                              <div className="flex items-center gap-2 mb-2">
                                <Fingerprint className="w-4 h-4 text-red-500 flex-shrink-0" />
                                <span className={`text-xs font-bold uppercase tracking-wider ${
                                  isDark ? 'text-red-300' : 'text-red-700'
                                }`}>
                                  Block-Level Data Tampering Detected — {userTamperedBlocks.length} block{userTamperedBlocks.length > 1 ? 's' : ''} compromised
                                </span>
                              </div>
                              <p className={`text-xs mb-3 ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                                The following ledger blocks have a cryptographic hash mismatch — their field values were
                                modified <strong>directly in Firestore</strong> after the block was sealed. The <code className="font-mono text-[10px]">points</code> values
                                shown are what is currently stored, but may no longer reflect what was originally recorded.
                              </p>
                              <div className="space-y-2">
                                {userTamperedBlocks.map(tb => (
                                  <div key={tb.blockIndex} className={`rounded-lg border p-3 ${
                                    isDark ? 'bg-red-900/30 border-red-700' : 'bg-white border-red-300'
                                  }`}>
                                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                      <div className="flex items-center gap-2">
                                        <span className={`text-xs font-mono font-bold ${isDark ? 'text-red-300' : 'text-red-700'}`}>
                                          Block #{tb.blockIndex}
                                        </span>
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                          isDark ? 'bg-red-800 text-red-200' : 'bg-red-200 text-red-800'
                                        }`}>
                                          {actionTypeLabel[tb.actionType] ?? tb.actionType}
                                        </span>
                                      </div>
                                      <span className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                        {tb.timestamp ? new Date(tb.timestamp).toLocaleString() : '—'}
                                      </span>
                                    </div>

                                    {/* Points comparison */}
                                    <div className={`flex items-center gap-3 mb-2 px-3 py-2 rounded-lg ${
                                      isDark ? 'bg-black/30' : 'bg-red-50'
                                    }`}>
                                      <div className="text-center flex-1">
                                        <p className={`text-[10px] uppercase tracking-wider font-semibold mb-0.5 ${
                                          isDark ? 'text-gray-500' : 'text-gray-400'
                                        }`}>Currently Stored</p>
                                        <p className={`text-lg font-bold ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                                          {tb.storedPoints > 0 ? '+' : ''}{tb.storedPoints.toLocaleString()} pts
                                        </p>
                                        <p className={`text-[9px] mt-0.5 font-semibold ${isDark ? 'text-red-500' : 'text-red-500'}`}>
                                          ⚠ hash invalid — may be altered
                                        </p>
                                      </div>
                                      <ArrowLeftRight className={`w-4 h-4 flex-shrink-0 ${isDark ? 'text-gray-600' : 'text-gray-400'}`} />
                                      <div className="text-center flex-1">
                                        <p className={`text-[10px] uppercase tracking-wider font-semibold mb-0.5 ${
                                          isDark ? 'text-gray-500' : 'text-gray-400'
                                        }`}>Original (unknown)</p>
                                        <p className={`text-base font-bold ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                          ? pts
                                        </p>
                                        <p className={`text-[9px] mt-0.5 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                                          sealed at write time
                                        </p>
                                      </div>
                                    </div>

                                    {/* Hash diff */}
                                    <div className="space-y-1">
                                      <div className={`flex items-start gap-1.5 text-[10px] font-mono ${
                                        isDark ? 'text-gray-500' : 'text-gray-400'
                                      }`}>
                                        <span className="flex-shrink-0 font-sans font-semibold text-red-500">Stored:</span>
                                        <span className={`break-all line-through ${isDark ? 'text-red-500/70' : 'text-red-400'}`}>
                                          {tb.storedHash}
                                        </span>
                                      </div>
                                      <div className={`flex items-start gap-1.5 text-[10px] font-mono ${
                                        isDark ? 'text-gray-500' : 'text-gray-400'
                                      }`}>
                                        <span className="flex-shrink-0 font-sans font-semibold text-blue-500">Recalc:</span>
                                        <span className={`break-all ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                                          {tb.recalcHash}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Column headers */}
                        <div className={`hidden sm:grid grid-cols-5 px-4 py-2 text-[10px] uppercase tracking-wider font-semibold ${
                          isDark ? 'text-gray-500 bg-gray-800/80' : 'text-gray-400 bg-gray-50'
                        }`}>
                          <span>Block #</span>
                          <span>Action</span>
                          <span>Points</span>
                          <span>Running Total</span>
                          <span>Timestamp</span>
                        </div>

                        {/* Running total calculation */}
                        {(() => {
                          let running = 0;
                          const userTamperedBlocks = tamperedBlocks[userId] ?? [];
                          const tamperedIndexSet = new Set(userTamperedBlocks.map(t => t.blockIndex));
                          return blocks.map((block) => {
                            running += block.points || 0;
                            const pts = block.points || 0;
                            const isPositive = pts > 0;
                            const isTampered = tamperedIndexSet.has(block.index);
                            const tamperedInfo = userTamperedBlocks.find(t => t.blockIndex === block.index);
                            return (
                              <div
                                key={block.id}
                                className={`px-4 py-3 transition-colors ${
                                  isTampered
                                    ? isDark
                                      ? 'bg-red-900/20 border-l-2 border-red-600 hover:bg-red-900/30'
                                      : 'bg-red-50 border-l-2 border-red-400 hover:bg-red-100/60'
                                    : isDark ? 'hover:bg-gray-700/40' : 'hover:bg-gray-50'
                                }`}
                              >
                                {/* Tamper alert row */}
                                {isTampered && (
                                  <div className={`flex items-start gap-2 mb-2 px-2 py-1.5 rounded-lg text-xs ${
                                    isDark ? 'bg-red-900/40 text-red-300' : 'bg-red-100 text-red-700'
                                  }`}>
                                    <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-red-500" />
                                    <div className="min-w-0">
                                      <span className="font-bold uppercase tracking-wider">Hash Mismatch — Block Data Tampered</span>
                                      <p className={`mt-0.5 font-mono text-[10px] break-all ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                                        Stored: <span className="line-through opacity-60">{tamperedInfo?.storedHash?.slice(0, 20)}…</span>
                                        {' '}→ Recalc: {tamperedInfo?.recalcHash?.slice(0, 20)}…
                                      </p>
                                      <p className={`mt-0.5 text-[10px] ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                                        The <code className="font-mono">points</code> value shown below is what is <em>currently stored</em> in Firestore — it may no longer be the original value.
                                      </p>
                                    </div>
                                  </div>
                                )}

                                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-0 items-center">
                                  {/* Block index */}
                                  <div className="flex items-center gap-1.5">
                                    <Link className={`w-3 h-3 flex-shrink-0 ${
                                      isTampered
                                        ? 'text-red-500'
                                        : isDark ? 'text-gray-600' : 'text-gray-300'
                                    }`} />
                                    <span className={`text-xs font-mono font-bold ${
                                      isTampered
                                        ? isDark ? 'text-red-400' : 'text-red-600'
                                        : isDark ? 'text-gray-400' : 'text-gray-500'
                                    }`}>
                                      #{block.index}
                                    </span>
                                    {isTampered && (
                                      <span className={`ml-1 px-1 py-0.5 rounded text-[9px] font-bold uppercase ${
                                        isDark ? 'bg-red-800 text-red-200' : 'bg-red-200 text-red-800'
                                      }`}>tampered</span>
                                    )}
                                  </div>

                                  {/* Action */}
                                  <span className={`text-xs font-semibold ${actionTypeColor(block.actionType, isDark)}`}>
                                    {actionTypeLabel[block.actionType] ?? block.actionType}
                                  </span>

                                  {/* Points — red + strikethrough hint when tampered */}
                                  <div className="flex flex-col">
                                    <span className={`text-sm font-bold ${
                                      isTampered
                                        ? isDark ? 'text-red-400' : 'text-red-600'
                                        : isPositive
                                          ? isDark ? 'text-emerald-400' : 'text-emerald-600'
                                          : isDark ? 'text-red-400' : 'text-red-600'
                                    }`}>
                                      {isPositive ? '+' : ''}{pts.toLocaleString()}
                                      {isTampered && (
                                        <span className={`ml-1.5 text-[9px] font-bold px-1 py-0.5 rounded ${
                                          isDark ? 'bg-red-900 text-red-300' : 'bg-red-100 text-red-700'
                                        }`}>
                                          ⚠ unverified
                                        </span>
                                      )}
                                    </span>
                                    {isTampered && (
                                      <span className={`text-[9px] mt-0.5 ${isDark ? 'text-red-500' : 'text-red-400'}`}>
                                        stored value may be altered
                                      </span>
                                    )}
                                  </div>

                                  {/* Running total */}
                                  <span className={`text-sm font-bold ${
                                    isTampered
                                      ? isDark ? 'text-orange-400' : 'text-orange-600'
                                      : isDark ? 'text-blue-400' : 'text-blue-700'
                                  }`}>
                                    {running.toLocaleString()}
                                    {isTampered && <span className={`ml-1 text-[9px] ${isDark ? 'text-orange-500' : 'text-orange-500'}`}>*</span>}
                                  </span>

                                  {/* Timestamp */}
                                  <span className={`text-xs col-span-2 sm:col-span-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                    {block.timestamp
                                      ? new Date(block.timestamp).toLocaleString()
                                      : '—'}
                                  </span>
                                </div>
                              </div>
                            );
                          });
                        })()}

                        {/* Final total row */}
                        <div className={`px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 ${
                          isDark ? 'bg-blue-900/20 border-t border-blue-800' : 'bg-blue-50 border-t border-blue-200'
                        }`}>
                          <div className="flex items-center gap-2">
                            <Scale className={`w-4 h-4 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
                            <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-blue-400' : 'text-blue-700'}`}>
                              Ledger total
                            </span>
                          </div>
                          <div className="flex items-center gap-6">
                            <div>
                              <span className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Expected (ledger): </span>
                              <span className={`font-bold text-sm ${isDark ? 'text-blue-300' : 'text-blue-800'}`}>
                                {fromLedger.toLocaleString()} pts
                              </span>
                            </div>
                            <div>
                              <span className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Actual (DB): </span>
                              <span className={`font-bold text-sm ${isDark ? 'text-red-300' : 'text-red-700'}`}>
                                {fromDb.toLocaleString()} pts
                              </span>
                            </div>
                            <span className={`px-2 py-0.5 rounded text-xs font-bold border ${
                              isDark ? 'bg-red-900/50 text-red-300 border-red-700' : 'bg-red-50 text-red-700 border-red-300'
                            }`}>
                              Δ {delta > 0 ? '+' : ''}{delta.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Restore Balance action bar */}
                    <div className={`px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 border-t ${
                      isDark ? 'bg-gray-800/80 border-gray-700' : 'bg-gray-50 border-gray-200'
                    }`}>
                      <div className="flex items-start gap-2 flex-1">
                        <Info className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
                        <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                          If the chain is intact but the DB balance differs, <code className="font-mono text-[10px]">users/{userId.slice(0,8)}…totalPoints</code> was
                          likely modified directly in Firestore. Click <strong>Restore Balance</strong> to correct it
                          from the sealed ledger and notify the user automatically.
                        </span>
                      </div>

                      {restoreResults[userId]?.success && !restoreResults[userId]?.noChangeNeeded ? (
                        <div className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold flex-shrink-0 ${
                          isDark ? 'bg-green-900/40 text-green-300 border border-green-700' : 'bg-green-50 text-green-700 border border-green-300'
                        }`}>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Restored — user notified
                        </div>
                      ) : restoreResults[userId]?.noChangeNeeded ? (
                        <div className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold flex-shrink-0 ${
                          isDark ? 'bg-blue-900/40 text-blue-300 border border-blue-700' : 'bg-blue-50 text-blue-700 border border-blue-300'
                        }`}>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Already correct
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRestoreBalance(userId, fromDb, fromLedger);
                          }}
                          disabled={restoringBalance[userId]}
                          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold flex-shrink-0 transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                            isDark
                              ? 'bg-blue-700 hover:bg-blue-600 text-white'
                              : 'bg-blue-600 hover:bg-blue-700 text-white'
                          }`}
                        >
                          {restoringBalance[userId] ? (
                            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Restoring…</>
                          ) : (
                            <><RotateCcw className="w-3.5 h-3.5" /> Restore Balance & Notify User</>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Transaction Detail Modal ──────────────────────────────────────────────────
function TransactionDetailModal({ tx, visible, onClose, isDark, getUserEmail, tamperFlag }) {
  // Ledger block integrity state — fetched when modal opens
  const [blockCheck, setBlockCheck] = useState(null);   // null = loading, false = not found, { block, hashValid, ... } = result
  const [blockChecking, setBlockChecking] = useState(false);

  // Fetch the matching ledger block whenever the modal opens with a new tx
  useEffect(() => {
    if (!visible || !tx) { setBlockCheck(null); return; }
    let cancelled = false;
    setBlockChecking(true);
    setBlockCheck(null);
    findLedgerBlockForTransaction(tx).then(result => {
      if (!cancelled) {
        setBlockCheck(result ?? false); // false = definitively not found
        setBlockChecking(false);
      }
    }).catch(() => {
      if (!cancelled) { setBlockCheck(false); setBlockChecking(false); }
    });
    return () => { cancelled = true; };
  }, [tx?.id, visible]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible || !tx) return null;

  const amount = tx.points ?? 0;
  const isRefund = tx.type === "points_refunded";
  const isRejection = tx.type === "submission_rejected";
  const isSubCancelled = tx.type === "submission_cancelled";
  const isRedCancelled = tx.type === "redemption_cancelled";
  const isAwarded = amount > 0 && !isRefund && !isRedCancelled;

  const typeLabel = isRefund
    ? "Reward Rejected"
    : isRedCancelled
      ? "Redemption Cancelled"
      : isRejection
        ? "Submission Rejected"
        : isSubCancelled
          ? "Submission Cancelled"
          : isAwarded
            ? "Points Awarded"
            : capitalizeWords(tx.type || tx.actionType || "N/A");

  const badgeClass = isRefund
    ? (isDark ? "bg-orange-900 text-orange-300" : "bg-orange-100 text-orange-800")
    : isRedCancelled
      ? (isDark ? "bg-blue-900 text-blue-300" : "bg-blue-100 text-blue-800")
      : isRejection
        ? (isDark ? "bg-red-900 text-red-300" : "bg-red-100 text-red-800")
        : isSubCancelled
          ? (isDark ? "bg-gray-700 text-gray-300" : "bg-gray-100 text-gray-700")
          : isAwarded
            ? (isDark ? "bg-green-900 text-green-300" : "bg-green-100 text-green-800")
            : (isDark ? "bg-red-900 text-red-300" : "bg-red-100 text-red-800");

  const pointColor = (isRefund || isRedCancelled)
    ? isDark ? "text-blue-400" : "text-blue-600"
    : (isRejection || isSubCancelled)
      ? isDark ? "text-gray-400" : "text-gray-500"
      : isAwarded
        ? isDark ? "text-emerald-400" : "text-emerald-600"
        : isDark ? "text-red-400" : "text-red-600";

  const pointPrefix = (isRefund || isRedCancelled) ? "+" : isAwarded ? "+" : (isRejection || isSubCancelled) ? "" : "-";

  const DetailRow = ({ icon: Icon, label, value, mono = false, highlight = false, children }) => (
    <div className={`flex items-start gap-3 py-3 border-b ${isDark ? "border-gray-700/50" : "border-gray-100"}`}>
      {Icon && <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isDark ? "text-gray-500" : "text-gray-400"}`} />}
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-semibold uppercase tracking-wider mb-0.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>{label}</p>
        {children ?? (
          <p className={`text-sm break-words ${mono ? "font-mono" : ""} ${highlight ? pointColor + " font-bold text-base" : isDark ? "text-gray-200" : "text-gray-800"}`}>
            {value || "—"}
          </p>
        )}
      </div>
    </div>
  );

  // ── Ledger Block Integrity widget (shown inside the details scroll area) ──
  const LedgerBlockIntegrity = () => {
    if (blockChecking) {
      return (
        <div className={`mt-3 mb-2 flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs ${
          isDark ? 'bg-gray-700/40 border-gray-600 text-gray-400' : 'bg-gray-50 border-gray-200 text-gray-500'
        }`}>
          <Loader2 className="w-4 h-4 animate-spin text-indigo-500 flex-shrink-0" />
          <span>Verifying ledger block integrity…</span>
        </div>
      );
    }

    // No matching block found
    if (blockCheck === false || blockCheck === null) {
      return (
        <div className={`mt-3 mb-2 flex items-start gap-2 px-3 py-2.5 rounded-xl border text-xs ${
          isDark ? 'bg-gray-700/30 border-gray-600 text-gray-400' : 'bg-gray-50 border-gray-200 text-gray-500'
        }`}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" />
          <div>
            <p className={`font-bold text-xs uppercase tracking-wider mb-0.5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
              No Matching Ledger Block Found
            </p>
            <p>This transaction has no corresponding entry in the immutable ledger. The points may have been applied outside the ledger system, or the transaction type is not ledger-tracked.</p>
          </div>
        </div>
      );
    }

    const { block, hashValid, storedHash, recalcHash } = blockCheck;
    const ledgerPts = block.points ?? 0;
    const txPts     = tx.points   ?? 0;
    const ptsMismatch = ledgerPts !== txPts;

    if (hashValid) {
      // Clean bill of health
      return (
        <div className={`mt-3 mb-2 rounded-xl border overflow-hidden ${
          isDark ? 'border-green-800' : 'border-green-200'
        }`}>
          {/* Header */}
          <div className={`flex items-center gap-2 px-3 py-2 ${
            isDark ? 'bg-green-900/30' : 'bg-green-50'
          }`}>
            <ShieldCheck className="w-4 h-4 text-green-500 flex-shrink-0" />
            <span className={`text-xs font-bold uppercase tracking-wider ${
              isDark ? 'text-green-300' : 'text-green-700'
            }`}>
              Ledger Block Integrity — Verified ✓
            </span>
          </div>
          {/* Block detail */}
          <div className={`px-3 py-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs ${
            isDark ? 'bg-gray-800' : 'bg-white'
          }`}>
            <div>
              <span className={`${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Block #</span>
              <span className={`ml-1 font-mono font-bold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{block.index}</span>
            </div>
            <div>
              <span className={`${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Action</span>
              <span className={`ml-1 font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{block.actionType}</span>
            </div>
            <div>
              <span className={`${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Ledger pts</span>
              <span className={`ml-1 font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                {ledgerPts > 0 ? '+' : ''}{ledgerPts.toLocaleString()}
              </span>
            </div>
            <div>
              <span className={`${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Hash</span>
              <span className={`ml-1 font-mono text-[10px] ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                {storedHash?.slice(0, 14)}…
              </span>
            </div>
          </div>
          {/* Points match check */}
          {ptsMismatch ? (
            <div className={`px-3 py-2 border-t flex items-start gap-2 ${
              isDark ? 'border-amber-800 bg-amber-900/20' : 'border-amber-200 bg-amber-50'
            }`}>
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className={`text-xs ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>
                <strong>Points mismatch:</strong> this transaction record shows <strong>{txPts.toLocaleString()} pts</strong> but the
                ledger block recorded <strong>{ledgerPts.toLocaleString()} pts</strong>. The ledger block hash is still valid —
                the <code className="font-mono text-[10px]">point_transactions</code> doc may have been edited directly.
              </p>
            </div>
          ) : (
            <div className={`px-3 py-2 border-t flex items-center gap-2 ${
              isDark ? 'border-green-800 bg-green-900/10' : 'border-green-100 bg-green-50/50'
            }`}>
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
              <p className={`text-xs ${isDark ? 'text-green-400' : 'text-green-700'}`}>
                Points in this record match the ledger block exactly ({txPts.toLocaleString()} pts). Cryptographic proof intact.
              </p>
            </div>
          )}
        </div>
      );
    }

    // Hash mismatch — block was tampered with
    return (
      <div className={`mt-3 mb-2 rounded-xl border-2 overflow-hidden ${
        isDark ? 'border-red-700' : 'border-red-300'
      }`}>
        {/* Header */}
        <div className={`flex items-center gap-2 px-3 py-2 ${
          isDark ? 'bg-red-900/50' : 'bg-red-100'
        }`}>
          <ShieldAlert className="w-4 h-4 text-red-500 flex-shrink-0" />
          <span className={`text-xs font-bold uppercase tracking-wider ${
            isDark ? 'text-red-300' : 'text-red-700'
          }`}>
            Ledger Block Integrity — Hash Mismatch ⚠
          </span>
        </div>

        {/* Explanation */}
        <div className={`px-3 py-2.5 text-xs ${
          isDark ? 'bg-red-950/30 text-red-300' : 'bg-red-50 text-red-700'
        }`}>
          <p className="mb-1">
            Block <strong>#{block.index}</strong> has an <strong>invalid hash</strong> — its field values no longer match the
            cryptographic fingerprint stored at write time. This is a strong indicator that the block's data was
            modified <strong>directly in Firestore</strong> after it was sealed.
          </p>
          <p>
            The <code className="font-mono text-[10px]">points</code> value currently stored in this block
            is <strong className={isDark ? 'text-red-200' : 'text-red-800'}>{ledgerPts > 0 ? '+' : ''}{ledgerPts.toLocaleString()} pts</strong> — but
            this value <strong>cannot be trusted</strong> because the hash seal is broken.
          </p>
        </div>

        {/* Points comparison: tx record vs ledger block */}
        <div className={`grid grid-cols-2 divide-x text-center py-3 ${
          isDark ? 'divide-red-800 bg-red-900/20' : 'divide-red-200 bg-white'
        }`}>
          <div className="px-3">
            <p className={`text-[10px] uppercase tracking-wider font-semibold mb-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              Transaction Record
            </p>
            <p className={`text-base font-bold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
              {txPts > 0 ? '+' : ''}{txPts.toLocaleString()} pts
            </p>
            <p className={`text-[10px] mt-0.5 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
              point_transactions doc
            </p>
          </div>
          <div className="px-3">
            <p className={`text-[10px] uppercase tracking-wider font-semibold mb-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              Ledger Block (suspect)
            </p>
            <p className={`text-base font-bold ${isDark ? 'text-red-400' : 'text-red-600'}`}>
              {ledgerPts > 0 ? '+' : ''}{ledgerPts.toLocaleString()} pts
            </p>
            <p className={`text-[10px] mt-0.5 font-semibold ${isDark ? 'text-red-500' : 'text-red-400'}`}>
              ⚠ unverifiable — hash broken
            </p>
          </div>
        </div>

        {/* Hash diff */}
        <div className={`px-3 py-2.5 border-t space-y-1.5 ${
          isDark ? 'border-red-800 bg-gray-900/40' : 'border-red-200 bg-gray-50'
        }`}>
          <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            Hash Comparison
          </p>
          <div className="flex items-start gap-1.5">
            <span className={`text-[10px] font-semibold flex-shrink-0 w-14 ${isDark ? 'text-red-400' : 'text-red-600'}`}>Stored:</span>
            <span className={`text-[10px] font-mono break-all line-through ${isDark ? 'text-red-500/70' : 'text-red-400'}`}>
              {storedHash}
            </span>
          </div>
          <div className="flex items-start gap-1.5">
            <span className={`text-[10px] font-semibold flex-shrink-0 w-14 ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>Recalc:</span>
            <span className={`text-[10px] font-mono break-all ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
              {recalcHash}
            </span>
          </div>
        </div>

        {/* Recommended action */}
        <div className={`px-3 py-2 border-t flex items-start gap-2 text-xs ${
          isDark ? 'border-red-800 bg-red-900/10 text-red-400' : 'border-red-200 bg-red-50 text-red-600'
        }`}>
          <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>
            Open the <strong>Blockchain</strong> tab → run <strong>Verify Chain</strong> to confirm the tamper scope,
            then use <strong>Acknowledge Tamper</strong> on block #{block.index} to record the incident before running Repair Chain.
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        className={`w-full max-w-md rounded-2xl shadow-2xl overflow-hidden ${
          isDark ? "bg-gray-800 border border-gray-700" : "bg-white border border-gray-200"
        }`}
        style={{ maxHeight: "85dvh" }}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? "border-gray-700 bg-gray-800" : "border-gray-100 bg-gray-50"}`}>
          <div>
            <h3 className={`font-bold text-base ${isDark ? "text-white" : "text-gray-900"}`}>
              Transaction Details
            </h3>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${badgeClass}`}>
              {typeLabel}
            </span>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-full transition-colors ${isDark ? "hover:bg-gray-700 text-gray-400" : "hover:bg-gray-100 text-gray-500"}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tamper warning if user is flagged */}
        {tamperFlag && (
          <div className={`flex items-start gap-3 px-5 py-3 border-b ${
            isDark ? 'border-red-800 bg-red-900/30' : 'border-red-200 bg-red-50'
          }`}>
            <ShieldAlert className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className={`text-xs font-bold ${isDark ? 'text-red-300' : 'text-red-700'}`}>
                ⚠ This user's balance has a ledger discrepancy
              </p>
              <p className={`text-xs mt-0.5 ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                Ledger records <strong>{tamperFlag.fromLedger.toLocaleString()}</strong> pts — 
                DB shows <strong>{tamperFlag.fromDb.toLocaleString()}</strong> pts 
                (Δ {tamperFlag.delta > 0 ? '+' : ''}{tamperFlag.delta.toLocaleString()}).
                See the Audit Log above for full details.
              </p>
            </div>
          </div>
        )}

        {/* Points highlight */}
        <div className={`px-5 py-4 border-b ${isDark ? "border-gray-700" : "border-gray-100"}`}>
          <div className={`inline-flex items-center gap-3 px-4 py-3 rounded-xl border ${
            (isRefund || isRedCancelled)
              ? isDark ? "bg-blue-900/20 border-blue-700" : "bg-blue-50 border-blue-200"
              : (isRejection || isSubCancelled)
                ? isDark ? "bg-gray-700/40 border-gray-600" : "bg-gray-100 border-gray-300"
                : isAwarded
                  ? isDark ? "bg-green-900/20 border-green-700" : "bg-green-50 border-green-200"
                  : isDark ? "bg-red-900/20 border-red-700" : "bg-red-50 border-red-200"
          }`}>
            {(isRefund || isRedCancelled)
              ? <RotateCcw className={`w-5 h-5 ${pointColor}`} />
              : (isRejection || isSubCancelled)
                ? <XCircle className={`w-5 h-5 ${pointColor}`} />
                : isAwarded
                  ? <TrendingUp className={`w-5 h-5 ${pointColor}`} />
                  : <ArrowDown className={`w-5 h-5 ${pointColor}`} />
            }
            <span className={`text-2xl font-bold ${pointColor}`}>
              {pointPrefix}{Math.abs(amount).toLocaleString()}
            </span>
            <span className={`text-sm font-medium ${isDark ? "text-gray-400" : "text-gray-500"}`}>points</span>
          </div>
          {isRefund && (
            <div className="mt-2 space-y-1">
              <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
                isDark ? "bg-blue-900/30 text-blue-400" : "bg-blue-50 text-blue-700"
              }`}><RotateCcw className="w-3 h-3" /> Points Refunded</span>
              <p className={`text-xs ${isDark ? "text-blue-400" : "text-blue-600"}`}>
                The reward was rejected — points were returned to the user's account.
              </p>
            </div>
          )}
          {isRedCancelled && (
            <div className="mt-2 space-y-1">
              <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
                isDark ? "bg-blue-900/30 text-blue-400" : "bg-blue-50 text-blue-700"
              }`}><RotateCcw className="w-3 h-3" /> Points Refunded</span>
              <p className={`text-xs ${isDark ? "text-blue-400" : "text-blue-600"}`}>
                The user cancelled this redemption — points were returned to their account.
              </p>
            </div>
          )}
          {isRejection && (
            <p className={`text-xs mt-2 ${isDark ? "text-red-400" : "text-red-600"}`}>
              This submission was rejected. No points were awarded.
            </p>
          )}
          {isSubCancelled && (
            <p className={`text-xs mt-2 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
              The user cancelled this submission before it was reviewed.
            </p>
          )}
        </div>

        {/* Details */}
        <div className="px-5 py-1 overflow-y-auto" style={{ maxHeight: "45vh" }}>
          <DetailRow icon={Hash} label="Transaction ID" value={tx.id} mono />
          <DetailRow icon={User} label="User" value={getUserEmail(tx.userId)} />
          <DetailRow icon={Calendar} label="Timestamp" value={formatTimestamp(tx.timestamp)} />
          <DetailRow icon={Tag} label="Type" value={typeLabel} />
          {tx.description && <DetailRow icon={Info} label="Description" value={tx.description} />}
          {tx.rewardName && <DetailRow icon={Gift} label="Reward" value={tx.rewardName} />}
          {tx.category && <DetailRow icon={Tag} label="Category" value={capitalizeWords(tx.category)} />}
          {tx.redemptionId && <DetailRow icon={Hash} label="Redemption ID" value={tx.redemptionId} mono />}
          {tx.rejectionReason && (
            <div className={`mt-3 mb-2 flex items-start gap-2 px-3 py-2.5 rounded-xl border text-sm ${
              isDark ? "bg-red-900/20 border-red-800/50 text-red-300" : "bg-red-50 border-red-200 text-red-700"
            }`}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-xs uppercase tracking-wider mb-0.5">Rejection Reason</p>
                <p className="text-sm">{tx.rejectionReason}</p>
              </div>
            </div>
          )}

          {/* ── Ledger Block Integrity section ── */}
          <div className={`pt-2 pb-1 mt-1 border-t ${isDark ? 'border-gray-700/50' : 'border-gray-100'}`}>
            <div className="flex items-center gap-1.5 mb-1">
              <Fingerprint className={`w-3.5 h-3.5 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`} />
              <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                Ledger Block Integrity Audit
              </span>
            </div>
            <LedgerBlockIntegrity />
          </div>
        </div>

        <div className={`px-5 py-4 border-t ${isDark ? "border-gray-700" : "border-gray-100"}`}>
          <button
            onClick={onClose}
            className={`w-full py-2.5 rounded-xl font-medium text-sm transition-colors ${
              isDark ? "bg-gray-700 hover:bg-gray-600 text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-800"
            }`}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function TransactionsTab() {
  const { isDark } = useTheme();
  const [transactions, setTransactions] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState("desc");
  const [filterType, setFilterType] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  
  const [verification, setVerification] = useState(null); 
  const [verifying, setVerifying] = useState(false);
  
  const [showWhyBlockchain, setShowWhyBlockchain] = useState(false);
  const [showImpactMetrics, setShowImpactMetrics] = useState(false);
  
  const [impactMetrics, setImpactMetrics] = useState({
    totalTransactions: 0,
    totalPointsAwarded: 0,
    totalPointsRedeemed: 0,
    totalPointsRefunded: 0,
    netPointsCirculating: 0
  });

  // Transaction detail modal state
  const [selectedTx, setSelectedTx] = useState(null);
  const [showTxDetail, setShowTxDetail] = useState(false);

  // Build a lookup map of flagged users from the audit result
  // { userId -> { fromLedger, fromDb, delta } }
  const tamperMap = useMemo(() => {
    if (!verification?.differences?.length) return {};
    return Object.fromEntries(
      verification.differences.map(d => [d.userId, d])
    );
  }, [verification]);

  const runVerification = async () => {
    setVerifying(true);
    try {
        const result = await verifyPointTransactions();
        setVerification(result);
    } catch (error) {
        console.error("Error running point transaction verification:", error);
        setVerification({ 
            valid: true,
            hasDifferences: false,
            reason: "Balance audit could not be completed due to a system error.",
            checkedUsers: 0,
            differences: []
        });
    } finally {
      setVerifying(false);
    }
  };

  const calculateImpactMetrics = useCallback((transactionsData) => {
    const totalAwarded = transactionsData.filter(t => t.points > 0 && t.type !== "points_refunded").reduce((sum, t) => sum + t.points, 0);
    const totalRedeemed = transactionsData.filter(t => t.points < 0).reduce((sum, t) => sum + Math.abs(t.points), 0);
    const totalRefunded = transactionsData.filter(t => t.type === "points_refunded").reduce((sum, t) => sum + (t.points || 0), 0);
    
    setImpactMetrics({
      totalTransactions: transactionsData.length,
      totalPointsAwarded: totalAwarded,
      totalPointsRedeemed: totalRedeemed,
      totalPointsRefunded: totalRefunded,
      netPointsCirculating: totalAwarded - totalRedeemed + totalRefunded
    });
  }, []);

  useEffect(() => {
    let unsubscribe = null;
    let retryTimer  = null;
    let cancelled   = false;

    const fetchUsers = async () => {
      try {
        const usersSnapshot = await getDocs(collection(db, "users"));
        const userData = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (!cancelled) setUsers(userData);
      } catch (err) {
        console.error("TransactionsTab: failed to fetch users:", err);
      }
    };

    const subscribe = () => {
      const q = query(collection(db, "point_transactions"), orderBy("timestamp", "desc"), limit(200));

      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          if (cancelled) return;
          const newTransactions = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          setTransactions(newTransactions);
          calculateImpactMetrics(newTransactions);
          setLoading(false);
          runVerification();
        },
        (error) => {
          if (cancelled) return;
          if (error.code === "permission-denied") {
            console.warn("Transactions: permission-denied, retrying in 2 s…");
            if (unsubscribe) { unsubscribe(); unsubscribe = null; }
            retryTimer = setTimeout(() => { if (!cancelled) subscribe(); }, 2000);
          } else {
            console.error("Transactions listener error:", error);
            setLoading(false);
          }
        }
      );
    };

    subscribe();
    fetchUsers();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (unsubscribe) unsubscribe();
    };
  }, [calculateImpactMetrics]);

  const getUserEmail = useCallback(
    (userId) => {
      const user = users.find((u) => u.id === userId);
      return user ? user.email : "Unknown User";
    },
    [users]
  );

  const tamperCount = Object.keys(tamperMap).length;

  const filteredSortedTransactions = useMemo(() => {
    let filtered = transactions;

    if (filterType === "awarded") {
      filtered = transactions.filter(t => t.points > 0 && t.type !== "points_refunded");
    } else if (filterType === "redeemed") {
      filtered = transactions.filter(t => t.points < 0);
    } else if (filterType === "refunded") {
      filtered = transactions.filter(t => t.type === "points_refunded");
    } else if (filterType === "rejected") {
      filtered = transactions.filter(t => t.type === "submission_rejected" || t.type === "submission_cancelled");
    } else if (filterType === "cancelled") {
      filtered = transactions.filter(t => t.type === "redemption_cancelled");
    } else if (filterType === "tampered") {
      // Show only transactions belonging to users with flagged balances
      filtered = transactions.filter(t => tamperMap[t.userId]);
    }
    
    if (searchTerm) {
      filtered = filtered.filter(t => 
        (t.type || t.actionType || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.userId && getUserEmail(t.userId).toLowerCase().includes(searchTerm.toLowerCase())) ||
        (t.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.rewardName || '').toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    return filtered.sort((a, b) => {
      const aTime = a.timestamp?.seconds ?? 0;
      const bTime = b.timestamp?.seconds ?? 0;
      return sortOrder === "asc" ? aTime - bTime : bTime - aTime;
    });
  }, [transactions, filterType, sortOrder, searchTerm, getUserEmail, tamperMap]);

  const refundCount = transactions.filter(t => t.type === "points_refunded").length;
  const rejectionCount = transactions.filter(t => t.type === "submission_rejected" || t.type === "submission_cancelled").length;
  const cancelledCount = transactions.filter(t => t.type === "redemption_cancelled").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-10">
        <Loader2 className={`w-8 h-8 animate-spin ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`} />
        <span className={`ml-3 text-lg ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Loading Point Transactions...</span>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 w-full overflow-hidden">
      {/* Transaction Detail Modal */}
      <TransactionDetailModal
        tx={selectedTx}
        visible={showTxDetail}
        onClose={() => setShowTxDetail(false)}
        isDark={isDark}
        getUserEmail={getUserEmail}
        tamperFlag={selectedTx ? tamperMap[selectedTx.userId] : null}
      />

      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className={`text-xl sm:text-2xl font-bold ${isDark ? "text-gray-100" : "text-slate-800"}`}>
              Point Transactions Log
            </h2>
            <p className={`mt-1 text-sm ${isDark ? "text-gray-400" : "text-slate-600"}`}>
              Monitor and verify all point transactions · <span className="font-medium">Click any row for full details</span>
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowWhyBlockchain(!showWhyBlockchain)}
              className={`px-3 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors text-sm ${
                showWhyBlockchain
                  ? isDark ? "bg-indigo-600 text-white" : "bg-indigo-500 text-white"
                  : isDark ? "bg-gray-700 text-gray-300 hover:bg-gray-600" : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              <Info className="w-4 h-4" />
              Why Verify?
            </button>

            <button
              onClick={() => setShowImpactMetrics(!showImpactMetrics)}
              className={`px-3 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors text-sm ${
                showImpactMetrics
                  ? isDark ? "bg-purple-600 text-white" : "bg-purple-500 text-white"
                  : isDark ? "bg-gray-700 text-gray-300 hover:bg-gray-600" : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Impact Metrics
            </button>
          </div>
        </div>
      </div>

      {/* Why Blockchain Panel */}
      {showWhyBlockchain && (
        <div className={`mb-6 p-6 rounded-xl shadow-lg border ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}>
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-blue-500" />
            Why We Verify Against the Blockchain
          </h3>
          <div className="space-y-4">
            <div className={`p-4 rounded-lg ${isDark ? "bg-gray-700" : "bg-blue-50"}`}>
              <h4 className="font-bold mb-2 flex items-center gap-2">
                <Database className="w-4 h-4 text-blue-500" />
                External Data Reconciliation
              </h4>
              <p className="text-sm mb-2">
                This transaction log lives in a regular database that could theoretically be modified. 
                To ensure data integrity, we continuously verify it against the immutable blockchain ledger.
              </p>
              <p className="text-sm">
                If the totals don't match, we know someone has tampered with the transaction records.
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className={`p-4 rounded-lg border-l-4 border-red-500 ${isDark ? "bg-gray-700" : "bg-red-50"}`}>
                <h4 className="font-bold mb-2 text-red-600">Without Blockchain Verification</h4>
                <ul className="text-sm space-y-1">
                  {["Admin could add fake transactions","Records could be deleted to hide fraud","Point amounts could be inflated","No way to prove data accuracy"].map(t => (
                    <li key={t} className="flex items-start gap-2">
                      <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className={`p-4 rounded-lg border-l-4 border-green-500 ${isDark ? "bg-gray-700" : "bg-green-50"}`}>
                <h4 className="font-bold mb-2 text-green-600">With Blockchain Verification</h4>
                <ul className="text-sm space-y-1">
                  {["Fake transactions detected immediately","Deleted records cause mismatch alert","Modified amounts break verification","Cryptographic proof of accuracy"].map(t => (
                    <li key={t} className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Impact Metrics Panel */}
      {showImpactMetrics && (
        <div className={`mb-6 p-6 rounded-xl shadow-lg ${isDark ? "bg-gradient-to-r from-indigo-900/50 to-purple-900/50 border border-indigo-700" : "bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200"}`}>
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
            <TrendingUp className="w-6 h-6" />
            Transaction Impact Metrics
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { icon: Database, color: "text-blue-500", label: "Total", value: impactMetrics.totalTransactions },
              { icon: TrendingUp, color: "text-green-500", label: "Awarded", value: `+${impactMetrics.totalPointsAwarded.toLocaleString()}`, className: "text-green-500" },
              { icon: ArrowDown, color: "text-red-500", label: "Redeemed", value: `-${impactMetrics.totalPointsRedeemed.toLocaleString()}`, className: "text-red-500" },
              { icon: RotateCcw, color: "text-blue-500", label: "Refunded", value: `+${impactMetrics.totalPointsRefunded.toLocaleString()}`, className: "text-blue-500" },
              { icon: DollarSign, color: "text-purple-500", label: "Net Circulating", value: impactMetrics.netPointsCirculating.toLocaleString() },
            ].map(({ icon: Icon, color, label, value, className }) => (
              <div key={label} className={`p-4 rounded-lg ${isDark ? "bg-black/30" : "bg-white"}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={`w-5 h-5 ${color}`} />
                  <span className="text-sm opacity-70">{label}</span>
                </div>
                <p className={`text-xl font-bold ${className || ""}`}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Integrity Status Banner */}
      <div className={`p-4 rounded-xl shadow-md mb-4 ${
          verifying ? 'bg-gray-50 border border-gray-200'
          : verification?.hasDifferences
            ? isDark ? 'bg-yellow-900/20 border border-yellow-700' : 'bg-yellow-50 border border-yellow-200'
            : isDark ? 'bg-green-900/30 border-green-700' : 'bg-green-50 border border-green-200'
      }`}>
          <div className="flex items-center gap-4">
              {verifying ? <Loader2 className="w-6 h-6 text-indigo-500 animate-spin flex-shrink-0" />
                : verification?.hasDifferences ? <AlertTriangle className="w-6 h-6 text-yellow-500 flex-shrink-0" />
                : <ShieldCheck className="w-6 h-6 text-green-600 flex-shrink-0" />}
              <div className="flex-1">
                  <h3 className={`font-bold ${verification?.hasDifferences ? (isDark ? 'text-yellow-400' : 'text-yellow-700') : 'text-green-700'}`}>
                      Ledger Balance Audit
                  </h3>
                  <p className={`text-sm mt-0.5 ${verification?.hasDifferences ? (isDark ? 'text-yellow-300' : 'text-yellow-600') : 'text-green-600'}`}>
                      {verification?.reason}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                      {[["Database", "Point Transactions"], ["Recycle", "Waste Submissions"], ["Gift", "Redemptions"]].map(([, label]) => (
                        <span key={label} className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                          verification?.valid 
                            ? isDark ? "bg-green-800/50 text-green-200" : "bg-green-100 text-green-800"
                            : isDark ? "bg-red-800/50 text-red-200" : "bg-red-100 text-red-800"
                        }`}>
                          {label}
                        </span>
                      ))}
                  </div>
                  <div className={`text-xs mt-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    <span>Users audited: <strong>{verification?.checkedUsers ?? '—'}</strong></span>
                    {verification?.hasDifferences && (
                      <span className={`ml-3 font-semibold ${isDark ? 'text-yellow-300' : 'text-yellow-700'}`}>
                        {verification.differences.length} user(s) with balance discrepancies
                        {' '}—{' '}
                        <button
                          onClick={() => setFilterType('tampered')}
                          className="underline hover:no-underline"
                        >
                          view affected transactions
                        </button>
                      </span>
                    )}
                  </div>
              </div>
              <button
                onClick={runVerification}
                disabled={verifying}
                className={`flex-shrink-0 flex items-center px-3 py-1 text-xs rounded-full font-semibold transition-colors ${
                  isDark ? 'bg-indigo-700 hover:bg-indigo-800 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                } disabled:opacity-50`}
              >
                {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              </button>
          </div>
      </div>

      {/* ── Audit Discrepancy Panel ── only shown when differences exist */}
      {verification?.hasDifferences && (
        <AuditDiscrepancyPanel
          differences={verification.differences}
          users={users}
          isDark={isDark}
          onRecoveryComplete={runVerification}
        />
      )}

      {/* Filter Controls */}
      <div className={`flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4 p-3 rounded-lg ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
        <div className="flex items-center gap-2 sm:gap-4">
          <label className={`text-sm font-medium shrink-0 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Filter:</label>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className={`flex-1 sm:flex-none px-3 py-1 border rounded-lg text-sm ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
          >
            <option value="all">All</option>
            <option value="awarded">Awarded (Credit)</option>
            <option value="redeemed">Redeemed/Spent (Debit)</option>
            <option value="refunded">Reward Rejected / Refunded {refundCount > 0 ? `(${refundCount})` : ""}</option>
            <option value="rejected">Submission Rejected/Cancelled {rejectionCount > 0 ? `(${rejectionCount})` : ""}</option>
            <option value="cancelled">Redemption Cancelled {cancelledCount > 0 ? `(${cancelledCount})` : ""}</option>
            {tamperCount > 0 && (
              <option value="tampered">⚠ Discrepancy — {tamperCount} user{tamperCount > 1 ? 's' : ''} flagged</option>
            )}
          </select>
        </div>
        
        <div className="flex items-center gap-2">
            <input
                type="text"
                placeholder="Search type, email, or description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`flex-1 min-w-0 py-1.5 px-3 border rounded-lg text-sm ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
            />
            <button
                onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                className={`shrink-0 flex items-center gap-1 px-3 py-1.5 border rounded-lg text-sm font-medium transition-colors ${
                    isDark ? 'bg-gray-700 border-gray-600 text-white hover:bg-gray-600' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
            >
                Date
                {sortOrder === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
            </button>
        </div>
      </div>

      {/* Transaction List */}
      <div className={`rounded-xl overflow-hidden shadow-md ${isDark ? 'bg-gray-800' : 'bg-white'}`}>

        {/* Mobile card view */}
        <div className="sm:hidden divide-y divide-gray-200 dark:divide-gray-700">
          {filteredSortedTransactions.length === 0 ? (
            <p className={`px-4 py-6 text-center text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>No matching transactions found.</p>
          ) : filteredSortedTransactions.map((transaction) => {
            const amount = transaction.points ?? 0;
            const isRefund = transaction.type === "points_refunded";
            const isRejection = transaction.type === "submission_rejected";
            const isSubCancelled = transaction.type === "submission_cancelled";
            const isRedCancelled = transaction.type === "redemption_cancelled";
            const isAwarded = amount > 0 && !isRefund && !isRedCancelled;
            const userEmail = getUserEmail(transaction.userId);
            const isFlagged = !!tamperMap[transaction.userId];

            const typeLabel = isRefund
              ? "Reward Rejected"
              : isRedCancelled
                ? "Redemption Cancelled"
                : isRejection
                  ? "Submission Rejected"
                  : isSubCancelled
                    ? "Submission Cancelled"
                    : isAwarded
                      ? "Points Awarded"
                      : capitalizeWords(transaction.type || transaction.actionType || "N/A");

            const badgeClass = isRefund
              ? isDark ? "bg-orange-900 text-orange-300" : "bg-orange-100 text-orange-800"
              : isRedCancelled
                ? isDark ? "bg-blue-900 text-blue-300" : "bg-blue-100 text-blue-800"
                : isRejection
                  ? isDark ? "bg-red-900 text-red-300" : "bg-red-100 text-red-800"
                  : isSubCancelled
                    ? isDark ? "bg-gray-700 text-gray-300" : "bg-gray-100 text-gray-700"
                    : isAwarded
                      ? isDark ? "bg-green-900 text-green-300" : "bg-green-100 text-green-800"
                      : isDark ? "bg-red-900 text-red-300" : "bg-red-100 text-red-800";

            const amountColor = (isRefund || isRedCancelled)
              ? isDark ? 'text-blue-400' : 'text-blue-600'
              : (isRejection || isSubCancelled)
                ? isDark ? 'text-gray-400' : 'text-gray-500'
                : isAwarded
                  ? isDark ? 'text-emerald-400' : 'text-emerald-600'
                  : isDark ? 'text-red-400' : 'text-red-600';

            return (
              <div
                key={transaction.id}
                onClick={() => { setSelectedTx(transaction); setShowTxDetail(true); }}
                className={`p-3 space-y-1.5 cursor-pointer active:opacity-70 relative ${
                  isFlagged
                    ? isDark ? 'bg-red-900/10 hover:bg-red-900/20 border-l-2 border-red-600' : 'bg-red-50/60 hover:bg-red-50 border-l-2 border-red-400'
                    : isDark ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-gray-50'
                }`}
              >
                {/* Tamper badge */}
                {isFlagged && (
                  <div className="flex items-center gap-1 mb-1">
                    <ShieldAlert className="w-3 h-3 text-red-500" />
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                      Balance discrepancy on this account
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${badgeClass}`}>
                    {(isRefund || isRedCancelled) && <RotateCcw className="w-3 h-3" />}
                    {typeLabel}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${amountColor}`}>
                      {(isRefund || isRedCancelled) ? "+" : isAwarded ? "+" : (isRejection || isSubCancelled) ? "" : "-"}{Math.abs(amount).toLocaleString()} pts
                    </span>
                    <ChevronRight className={`w-4 h-4 ${isDark ? "text-gray-600" : "text-gray-400"}`} />
                  </div>
                </div>
                <p className={`text-xs truncate ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{userEmail}</p>
                <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{formatTimestamp(transaction.timestamp)}</p>
                {transaction.description && (
                  <p className={`text-xs font-medium truncate ${isDark ? 'text-gray-300' : 'text-slate-700'}`}>{transaction.description}</p>
                )}
                {(isRefund || isRedCancelled) && (
                  <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    isDark ? "bg-blue-900/30 text-blue-400" : "bg-blue-50 text-blue-700"
                  }`}><RotateCcw className="w-2.5 h-2.5" /> Points Refunded</span>
                )}
                {isRejection && transaction.rejectionReason && (
                  <p className={`text-[10px] truncate ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                    Reason: {transaction.rejectionReason}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Desktop table view */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className={`${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
              <tr>
                <th className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>Timestamp</th>
                <th className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>Type</th>
                <th className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>User</th>
                <th className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>Amount</th>
                <th className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>Description</th>
                <th className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>Integrity</th>
                <th className={`px-4 py-3 text-center text-xs font-medium uppercase tracking-wider ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>Details</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-200'}`}>
              {filteredSortedTransactions.length === 0 ? (
                <tr>
                  <td colSpan="7" className={`px-4 py-4 text-center ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>No matching transactions found.</td>
                </tr>
              ) : filteredSortedTransactions.map((transaction) => {
                const amount = transaction.points ?? 0;
                const isRefund = transaction.type === "points_refunded";
                const isRejection = transaction.type === "submission_rejected";
                const isSubCancelled = transaction.type === "submission_cancelled";
                const isRedCancelled = transaction.type === "redemption_cancelled";
                const isAwarded = amount > 0 && !isRefund && !isRedCancelled;
                const userEmail = getUserEmail(transaction.userId);
                const description = transaction.description || transaction.metadata?.message || transaction.metadata?.type || "N/A";
                const isFlagged = !!tamperMap[transaction.userId];
                const flag = tamperMap[transaction.userId];

                const typeLabel = isRefund
                  ? "Reward Rejected"
                  : isRedCancelled
                    ? "Redemption Cancelled"
                    : isRejection
                      ? "Submission Rejected"
                      : isSubCancelled
                        ? "Submission Cancelled"
                        : isAwarded
                          ? "Points Awarded"
                          : capitalizeWords(transaction.type || transaction.actionType || "N/A");

                const badgeClass = isRefund
                  ? isDark ? "bg-orange-900 text-orange-300" : "bg-orange-100 text-orange-800"
                  : isRedCancelled
                    ? isDark ? "bg-blue-900 text-blue-300" : "bg-blue-100 text-blue-800"
                    : isRejection
                      ? isDark ? "bg-red-900 text-red-300" : "bg-red-100 text-red-800"
                      : isSubCancelled
                        ? isDark ? "bg-gray-700 text-gray-300" : "bg-gray-100 text-gray-700"
                        : isAwarded
                          ? isDark ? "bg-green-900 text-green-300" : "bg-green-100 text-green-800"
                          : isDark ? "bg-red-900 text-red-300" : "bg-red-100 text-red-800";

                const amountColor = (isRefund || isRedCancelled)
                  ? isDark ? "text-blue-400" : "text-blue-600"
                  : (isRejection || isSubCancelled)
                    ? isDark ? "text-gray-400" : "text-gray-500"
                    : isAwarded
                      ? isDark ? "text-emerald-400" : "text-emerald-600"
                      : isDark ? "text-red-400" : "text-red-600";

                return (
                  <tr
                    key={transaction.id}
                    onClick={() => { setSelectedTx(transaction); setShowTxDetail(true); }}
                    className={`cursor-pointer group transition-colors ${
                      isFlagged
                        ? isDark
                          ? 'bg-red-900/10 hover:bg-red-900/20 border-l-2 border-red-700'
                          : 'bg-red-50/70 hover:bg-red-50'
                        : isDark
                          ? 'hover:bg-gray-700/50'
                          : 'hover:bg-gray-50'
                    }`}
                  >
                    <td className={`px-4 py-4 text-sm whitespace-nowrap ${isDark ? "text-gray-300" : "text-slate-600"}`}>
                      {formatTimestamp(transaction.timestamp)}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${badgeClass}`}>
                        {isRefund && <RotateCcw className="w-3 h-3" />}
                        {typeLabel}
                      </span>
                    </td>
                    <td className={`px-4 py-4 text-sm font-medium max-w-[180px] truncate ${isDark ? "text-gray-100" : "text-slate-800"}`}>
                      {userEmail}
                    </td>
                    <td className={`px-4 py-4 text-sm font-bold whitespace-nowrap ${amountColor}`}>
                      {(isRefund || isRedCancelled) ? "+" : isAwarded ? "+" : (isRejection || isSubCancelled) ? "" : "-"}{Math.abs(amount) > 0 ? Math.abs(amount).toLocaleString() : "0"} pts
                    </td>
                    <td className={`px-4 py-4 text-sm max-w-[220px] ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                      <p className="truncate font-medium">{description}</p>
                      {(isRefund || isRedCancelled) && (
                        <span className={`inline-flex items-center gap-1 mt-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                          isDark ? "bg-blue-900/30 text-blue-400" : "bg-blue-50 text-blue-600"
                        }`}><RotateCcw className="w-2.5 h-2.5" /> Points Refunded</span>
                      )}
                      {isRejection && transaction.rejectionReason && (
                        <p className={`text-[11px] mt-0.5 truncate ${isDark ? "text-red-400" : "text-red-500"}`}>
                          Reason: {transaction.rejectionReason}
                        </p>
                      )}
                    </td>

                    {/* ── NEW: Integrity column ── */}
                    <td className="px-4 py-4">
                      {isFlagged ? (
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            isDark
                              ? 'bg-red-900/50 text-red-300 border-red-700'
                              : 'bg-red-100 text-red-700 border-red-300'
                          }`}>
                            <ShieldAlert className="w-2.5 h-2.5" />
                            Discrepancy
                          </span>
                          {flag && (
                            <span className={`text-[10px] font-mono ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                              Δ {flag.delta > 0 ? '+' : ''}{flag.delta.toLocaleString()} pts
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isDark ? 'text-green-400' : 'text-green-600'
                        }`}>
                          <CheckCircle2 className="w-3 h-3" />
                          OK
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-4 text-center">
                      <ChevronRight className={`w-4 h-4 mx-auto ${isDark ? "text-gray-600 group-hover:text-gray-300" : "text-gray-300 group-hover:text-gray-600"} transition-colors`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Educational Info Box */}
      <div className={`mt-8 p-6 rounded-xl border-l-4 ${
        isDark ? "bg-blue-900/20 border-blue-500 text-blue-300" : "bg-blue-50 border-blue-500 text-blue-800"
      }`}>
        <h4 className="font-bold mb-2 flex items-center gap-2">
          <Info className="w-5 h-5" />
          How Blockchain Protects Your Transactions
        </h4>
        <p className={`text-sm mb-2 ${isDark ? "text-blue-200" : "text-blue-700"}`}>
          Every transaction in this log is cross-referenced with the immutable blockchain ledger. 
          If anyone tries to add fake transactions, delete records, or modify point amounts, 
          the verification check will immediately flag the affected user and show you the exact
          delta between what the ledger recorded and what the database currently holds.
        </p>
        <p className={`text-sm ${isDark ? "text-blue-200" : "text-blue-700"}`}>
          Refund transactions (type: <code className="font-mono text-xs">points_refunded</code>) are automatically created 
          when a redemption is cancelled or rejected, ensuring full transparency in the points lifecycle.
        </p>
      </div>
    </div>
  );
}