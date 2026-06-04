// src/pages/AdminPanel/BlockchainTab.js - ENHANCED VERSION

import React, { useEffect, useState } from 'react';

import { 
  createGenesisBlock,
  getChainStatus,
  runAllIntegrityChecks, 
  getAllBlocks,
  createPublicAnchor,
  getAllAnchors,
  generateAuditProof,
  repairChain,
  acknowledgeTamper,
  recoverTamperedPoints,
  restoreUserBalance,
  sendTamperNotification,
} from '../../utils/blockchainService';
import { 
  ShieldCheck, 
  AlertTriangle, 
  Hash, 
  Clock, 
  Loader2, 
  Anchor, 
  CheckCircle2, 
  RefreshCw, 
  FileText, 
  Copy, 
  Check, 
  Plus, 
  Wrench,
  Database,
  Recycle,
  Gift,
  Zap,
  Info,
  Lock,
  TrendingUp,
  ShieldAlert,
  RotateCcw,
  UserCheck,
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

const BlockchainTab = () => {
  const { isDark } = useTheme();
  const [blocks, setBlocks] = useState([]);
  const [anchors, setAnchors] = useState([]);
  const [chainStatus, setChainStatus] = useState({ valid: null, message: "Initializing...", blockCount: 0, latestIndex: -1, latestHash: null, initialized: false });
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [creatingGenesis, setCreatingGenesis] = useState(false);
  const [latestHash, setLatestHash] = useState(null);
  const [blockCount, setBlockCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [verificationDetails, setVerificationDetails] = useState(null); 
  const [externalDataStatus, setExternalDataStatus] = useState(null); 
  const [txPointsTamperStatus, setTxPointsTamperStatus] = useState(null);
  const [repairResult, setRepairResult] = useState(null);
  const [acknowledgingTamper, setAcknowledgingTamper] = useState(false);

  // Recovery state
  const [recoveringEntry, setRecoveringEntry] = useState(null); // blockId currently recovering
  const [recoveryResults, setRecoveryResults] = useState({});   // { blockId: result }
  const [restoringBalances, setRestoringBalances] = useState({}); // { userId: bool }
  const [balanceRestoreResults, setBalanceRestoreResults] = useState({}); // { userId: result }
  
  const [impactMetrics, setImpactMetrics] = useState({
    totalTransactions: 0,
    totalPointsProtected: 0,
    integrityChecksPerformed: 0,
    anchorsPublished: 0
  });

  // Helper function for display
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

  // Function to load the chain's integrity status
  // silent=true suppresses tamper/discrepancy notifications — used after a
  // restore or repair so the post-action refresh doesn't re-fire alerts for
  // the brief window where the ledger and balance are still converging.
  const loadChainStatus = async (initial = false, silent = false) => {
    setLoading(true);
    setRepairResult(null); 
    setRecoveryResults({});
    setBalanceRestoreResults({});
    try {
      // 1. Get basic status
      const status = await getChainStatus();
      setChainStatus(status);
      setLatestHash(status.latestHash);
      setBlockCount(status.blockCount);

      if (status.initialized) {
        // 2. Run full integrity check (Structural + Balance Reconciliation + TX Points Tamper)
        // Pass silent through so post-restore reloads don't spam notifications.
        const fullVerification = await runAllIntegrityChecks({ silent });

        setChainStatus({ 
          ...status, 
          valid: fullVerification.valid, 
          message: fullVerification.message 
        });

        // Store detailed results for each check
        setVerificationDetails(fullVerification.chainVerification); 
        setExternalDataStatus(fullVerification.dataVerification);
        setTxPointsTamperStatus(fullVerification.txPointsVerification);

        // 3. Load latest blocks and anchors
        const latestBlocks = await getAllBlocks();
        setBlocks(latestBlocks);
        const allAnchors = await getAllAnchors();
        setAnchors(allAnchors);
        
        // 4. Calculate impact metrics
        calculateImpactMetrics(latestBlocks, allAnchors, fullVerification);
      } else {
        setVerificationDetails({ valid: false, message: "Ledger is not initialized (No Genesis Block)." });
        setExternalDataStatus(null); 
        setTxPointsTamperStatus(null);
        setBlocks([]);
        setAnchors([]);
      }

    } catch (error) {
      console.error("Error loading chain status:", error);
      setChainStatus(prev => ({ ...prev, valid: false, message: `Error: ${error.message}` }));
      setVerificationDetails({ valid: false, message: `Error during structural verification: ${error.message}` });
      setExternalDataStatus({ valid: false, reason: `Error during external data verification: ${error.message}` });
      setTxPointsTamperStatus({ valid: false, tampered: [], reason: `Error during transaction points audit: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  // Calculate impact metrics
  const calculateImpactMetrics = (blocksData, anchorsData, verification) => {
    const totalPoints = blocksData.reduce((sum, block) => sum + Math.abs(block.points || 0), 0);
    
    setImpactMetrics({
      totalTransactions: blocksData.length,
      totalPointsProtected: totalPoints,
      integrityChecksPerformed: verification ? 1 : 0,
      anchorsPublished: anchorsData.length
    });
  };

  const handleCreateGenesis = async () => {
    setCreatingGenesis(true);
    try {
        await createGenesisBlock();
        await loadChainStatus();
    } catch (error) {
        alert("Failed to create Genesis Block: " + error.message);
    } finally {
        setCreatingGenesis(false);
    }
  }

  const handlePublishAnchor = async () => {
    setPublishing(true);
    try {
        const result = await createPublicAnchor();
        alert(`Anchor Published! Hash: ${result.latestHash.substring(0, 10)}...`);
        await loadChainStatus();
    } catch (error) {
        alert("Failed to publish anchor: " + error.message);
    } finally {
        setPublishing(false);
    }
  }

  const handleGenerateAuditProof = async () => {
    try {
      const proof = await generateAuditProof();
      const blob = new Blob([JSON.stringify(proof, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ecosort-audit-proof-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      alert("Failed to generate audit proof: " + error.message);
    }
  }
  
  const handleRepairChain = async () => {
    if (window.confirm("WARNING: This will attempt to correct prevHash links and re-calculate block hashes for the ENTIRE chain. Only run this if integrity checks fail. Continue?")) {
        setLoading(true);
        try {
            const result = await repairChain();
            setRepairResult(result);
            if (result.success) {
              const hashPreview = result.latestHash ? result.latestHash.substring(0, 10) + '...' : 'N/A';
              const pointsNote = result.restoredPointsCount > 0
                ? ` Also restored ${result.restoredPointsCount} block point value(s) from sealed txPoints.`
                : '';
              alert(`Chain Repair Complete! Repaired ${result.repairedCount} blocks. New Latest Hash: ${hashPreview}${pointsNote}`);
              await loadChainStatus(false, true);
            } else {
              alert(`Chain Repair Stopped:\n\n${result.message}`);
            }
        } catch (error) {
            alert("Chain Repair Failed: " + error.message);
        } finally {
            setLoading(false);
        }
    }
  }

  const handleAcknowledgeTamper = async (tamperedBlockIndices) => {
    if (!window.confirm(
      `This will write a corrective entry to the ledger acknowledging that block(s) #${tamperedBlockIndices.join(', ')} were externally modified.\n\nThe tampered block(s) are permanently preserved as evidence. After acknowledging, you can run Repair Chain to restore chain links.\n\nContinue?`
    )) return;

    setAcknowledgingTamper(true);
    try {
      for (const blockIndex of tamperedBlockIndices) {
        await acknowledgeTamper(blockIndex);
      }
      alert(`Tamper acknowledged and recorded on the ledger. You can now run Repair Chain.`);
      await loadChainStatus(false, true);
    } catch (err) {
      alert("Failed to acknowledge tamper: " + err.message);
    } finally {
      setAcknowledgingTamper(false);
    }
  };

  /**
   * Runs the full recovery pipeline for a single tampered point_transaction entry:
   * 1. Restores point_transaction.points from sealed metadata.txPoints in the ledger block.
   * 2. Re-derives users.totalPoints from ledger replay.
   */
  const handleRecoverTamperedEntry = async (entry) => {
    if (!window.confirm(
      `This will restore point_transaction '${entry.firestoreId}' from ${entry.livePoints} → ${entry.sealedPoints} pts using the ledger as source of truth, then recalculate user '${entry.userId}' balance from the ledger.\n\nContinue?`
    )) return;

    setRecoveringEntry(entry.blockId);
    try {
      const result = await recoverTamperedPoints(entry.blockId, entry.firestoreId, entry.userId);
      setRecoveryResults(prev => ({ ...prev, [entry.blockId]: result }));
      alert(
        `✅ Recovery complete for user '${entry.userId}'.\n` +
        `Transaction restored: ${result.txRestore.previousPoints} → ${result.txRestore.restoredPoints} pts.\n` +
        `Balance corrected: ${result.balanceRestore.previousBalance} → ${result.balanceRestore.ledgerBalance} pts.`
      );
      // Refresh the integrity status so the tampered entry disappears from the list
      await loadChainStatus(false, true);
    } catch (err) {
      setRecoveryResults(prev => ({ ...prev, [entry.blockId]: { success: false, error: err.message } }));
      alert("Recovery failed: " + err.message);
    } finally {
      setRecoveringEntry(null);
    }
  };

  /**
   * Restores a single user's balance from ledger replay only.
   * Used for the balance-difference entries in External Data Integrity.
   *
   * NOTE: The tamper-detected notification has already been sent automatically
   * by runAllIntegrityChecks() when the discrepancy was first detected.
   * Here we only send the "restored" confirmation once the fix is applied.
   */
  const handleRestoreBalance = async (userId) => {
    if (!window.confirm(
      `This will recalculate and restore the totalPoints balance for user '${userId}' by replaying their sealed ledger history.\n\nPre-integration points are preserved. Only post-integration points are recalculated.\n\nContinue?`
    )) return;

    setRestoringBalances(prev => ({ ...prev, [userId]: true }));
    try {
      const result = await restoreUserBalance(userId);
      setBalanceRestoreResults(prev => ({ ...prev, [userId]: result }));

      if (result.noChangeNeeded) {
        alert(`ℹ️ User '${userId}' balance is already correct (${result.ledgerBalance} pts). No change needed.`);
      } else {
        // Notify the user that their balance has been corrected
        await sendTamperNotification(userId, 'points_restored', {
          title: '✅ Points Balance Restored',
          message:
            `Your points balance has been restored from ${result.previousBalance} to ` +
            `${result.ledgerBalance} pts using the sealed ledger record as the source of truth.`,
          previousBalance: result.previousBalance,
          restoredBalance: result.ledgerBalance,
          delta: result.delta ?? null,
          restoredAt: new Date().toISOString(),
        });
        alert(`✅ Balance restored for user '${userId}': ${result.previousBalance} → ${result.ledgerBalance} pts.`);
        // Always reload so the restored user disappears from the differences list
        await loadChainStatus(false, true);
      }
    } catch (err) {
      setBalanceRestoreResults(prev => ({ ...prev, [userId]: { success: false, error: err.message } }));
      alert("Balance restore failed: " + err.message);
    } finally {
      setRestoringBalances(prev => ({ ...prev, [userId]: false }));
    }
  };

  useEffect(() => {
    loadChainStatus(true);
  }, []);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <div className={`p-3 sm:p-6 w-full overflow-hidden ${isDark ? "text-gray-100" : "text-gray-800"}`}>
      {/* Header with Educational Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
        <h2 className="text-2xl sm:text-3xl font-bold">Integrity Verification</h2>
      </div>

      {/* Impact Metrics Dashboard */}
      {chainStatus.initialized && (
        <div className={`mb-6 p-6 rounded-xl shadow-lg ${isDark ? "bg-gradient-to-r from-indigo-900/50 to-purple-900/50 border border-indigo-700" : "bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200"}`}>
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
            <TrendingUp className="w-6 h-6" />
            Integrity Metrics
          </h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className={`p-4 rounded-lg ${isDark ? "bg-black/30" : "bg-white"}`}>
              <div className="flex items-center gap-2 mb-2">
                <Database className="w-5 h-5 text-blue-500" />
                <span className="text-sm opacity-70">Total Blocks</span>
              </div>
              <p className="text-2xl font-bold">{impactMetrics.totalTransactions.toLocaleString()}</p>
            </div>
            
            <div className={`p-4 rounded-lg ${isDark ? "bg-black/30" : "bg-white"}`}>
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="w-5 h-5 text-green-500" />
                <span className="text-sm opacity-70">Points Protected</span>
              </div>
              <p className="text-2xl font-bold">{impactMetrics.totalPointsProtected.toLocaleString()}</p>
            </div>
            
            <div className={`p-4 rounded-lg ${isDark ? "bg-black/30" : "bg-white"}`}>
              <div className="flex items-center gap-2 mb-2">
                <Anchor className="w-5 h-5 text-purple-500" />
                <span className="text-sm opacity-70">Anchors Published</span>
              </div>
              <p className="text-2xl font-bold">{impactMetrics.anchorsPublished}</p>
            </div>
            
            <div className={`p-4 rounded-lg ${isDark ? "bg-black/30" : "bg-white"}`}>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-5 h-5 text-orange-500" />
                <span className="text-sm opacity-70">Integrity Score</span>
              </div>
              <p className="text-2xl font-bold">{chainStatus.valid ? "100%" : "FAIL"}</p>
            </div>
          </div>
        </div>
      )}

      {/* Main Controls Row */}
      <div className="flex flex-wrap gap-2 sm:gap-4 items-center mb-6">
        {/* Refresh Button */}
        <button
          onClick={loadChainStatus}
          disabled={loading || publishing || creatingGenesis}
          className={`px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition-colors ${
            loading
              ? isDark ? "bg-gray-700 text-gray-400" : "bg-gray-300 text-gray-600"
              : isDark ? "bg-indigo-600 hover:bg-indigo-700 text-white" : "bg-indigo-500 hover:bg-indigo-600 text-white"
          }`}
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
          Refresh Status
        </button>

        {/* Generate Genesis Block */}
        {!chainStatus.initialized && (
            <button
              onClick={handleCreateGenesis}
              disabled={loading || creatingGenesis}
              className={`px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition-colors ${
                creatingGenesis
                  ? isDark ? "bg-gray-700 text-gray-400" : "bg-gray-300 text-gray-600"
                  : isDark ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-emerald-500 hover:bg-emerald-600 text-white"
              }`}
            >
              {creatingGenesis ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
              Create Genesis Block
            </button>
        )}
        
        {/* Publish Anchor Button */}
        {chainStatus.initialized && (
            <button
                onClick={handlePublishAnchor}
                disabled={loading || publishing}
                className={`px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition-colors ${
                    publishing
                    ? isDark ? "bg-gray-700 text-gray-400" : "bg-gray-300 text-gray-600"
                    : isDark ? "bg-purple-600 hover:bg-purple-700 text-white" : "bg-purple-500 hover:bg-purple-600 text-white"
                }`}
            >
                {publishing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Anchor className="w-5 h-5" />}
                Publish New Anchor
            </button>
        )}
        
        {/* Generate Audit Proof */}
        {chainStatus.initialized && (
            <button
                onClick={handleGenerateAuditProof}
                disabled={loading}
                className={`px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition-colors ${
                    loading
                    ? isDark ? "bg-gray-700 text-gray-400" : "bg-gray-300 text-gray-600"
                    : isDark ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-blue-500 hover:bg-blue-600 text-white"
                }`}
            >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
                Generate Audit Proof (JSON)
            </button>
        )}

        {/* Repair Chain Button */}
        {chainStatus.initialized && (
             <button
                onClick={handleRepairChain}
                disabled={loading}
                className={`px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition-colors ${
                    loading
                    ? isDark ? "bg-gray-700 text-gray-400" : "bg-gray-300 text-gray-600"
                    : (verificationDetails && !verificationDetails.valid)
                        ? isDark ? "bg-red-600 hover:bg-red-700 text-white" : "bg-red-500 hover:bg-red-600 text-white"
                        : isDark ? "bg-orange-600 hover:bg-orange-700 text-white" : "bg-orange-500 hover:bg-orange-600 text-white"
                }`}
            >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wrench className="w-5 h-5" />}
                {(verificationDetails && !verificationDetails.valid) ? "⚠ Repair Chain" : "Repair Chain"}
            </button>
        )}
      </div>
      
      {/* Repair Result Status */}
      {repairResult && (
        <div className={`mb-6 p-4 rounded-xl shadow-lg ${
            repairResult.success 
                ? isDark ? "bg-emerald-900/30 border border-emerald-700 text-emerald-300" : "bg-emerald-50 border border-emerald-200 text-emerald-700"
                : isDark ? "bg-red-900/30 border border-red-700 text-red-300" : "bg-red-50 border border-red-200 text-red-700"
        }`}>
            <p className="font-semibold">{repairResult.success ? `✅ Repair Successful!` : `❌ Repair Stopped`}</p>
            {repairResult.success ? (
              <div className="text-sm space-y-0.5">
                <p>Repaired Blocks: {repairResult.repairedCount ?? 0}. Latest Hash: {repairResult.latestHash ? repairResult.latestHash.substring(0, 15) + '...' : 'N/A'}</p>
                {(repairResult.restoredPointsCount ?? 0) > 0 && (
                  <p className="font-semibold">
                    🔢 {repairResult.restoredPointsCount} block point value(s) restored from sealed <code className="font-mono text-xs">metadata.txPoints</code>.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm">{repairResult.message}</p>
            )}
        </div>
      )}

      {/* Chain Status Card */}
      <div className={`p-6 rounded-xl shadow-2xl ${isDark ? "bg-gray-800" : "bg-white border border-gray-200"}`}>
        <h3 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <Database className="w-6 h-6" />
            Chain Overview
        </h3>
        
        {/* Status Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className={`p-3 rounded-lg ${isDark ? "bg-gray-700" : "bg-gray-100"}`}>
                <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>Status</p>
                <p className={`font-bold text-lg ${
                    chainStatus.initialized 
                    ? isDark ? "text-emerald-400" : "text-emerald-600"
                    : isDark ? "text-red-400" : "text-red-600"
                }`}>
                    {chainStatus.initialized ? "Initialized" : "Uninitialized"}
                </p>
            </div>
            <div className={`p-3 rounded-lg ${isDark ? "bg-gray-700" : "bg-gray-100"}`}>
                <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>Total Blocks</p>
                <p className={`font-bold text-lg ${isDark ? "text-white" : "text-gray-800"}`}>
                    {blockCount.toLocaleString()}
                </p>
            </div>
            <div className={`p-3 rounded-lg ${isDark ? "bg-gray-700" : "bg-gray-100"}`}>
                <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>Latest Index</p>
                <p className={`font-bold text-lg ${isDark ? "text-white" : "text-gray-800"}`}>
                    {chainStatus.latestIndex > -1 ? `#${chainStatus.latestIndex.toLocaleString()}` : 'N/A'}
                </p>
            </div>
        </div>
        
        {/* Latest Hash */}
        {latestHash && (
          <div className="mb-4">
            <p className={`text-sm font-semibold mb-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                Latest Block Hash
            </p>
            <div className="flex items-center gap-2 min-w-0">
                <code className={`text-xs sm:text-sm break-all font-mono p-2 rounded-lg flex-1 min-w-0 ${isDark ? "bg-black/20 text-indigo-300" : "bg-gray-100 text-indigo-600"}`}>
                    {latestHash}
                </code>
                <button
                    onClick={() => copyToClipboard(latestHash)}
                    className={`p-2 rounded-lg transition-colors ${
                        isDark ? "hover:bg-gray-700" : "hover:bg-gray-100"
                    } ${copied ? (isDark ? "text-emerald-400" : "text-emerald-600") : (isDark ? "text-gray-400" : "text-gray-600")}`}
                    title="Copy Hash"
                >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
            </div>
          </div>
        )}

        {/* Integrity Cards Row */}
        <div className="flex flex-col sm:flex-row gap-4">
            {/* 1. Ledger Structural Integrity Card */}
            {verificationDetails && (
                <div 
                    className={`flex-1 p-4 rounded-xl shadow-lg transition-colors border ${
                        verificationDetails.valid
                            ? isDark ? "bg-emerald-900/30 border-emerald-700" : "bg-emerald-50 border-emerald-200"
                            : isDark ? "bg-red-900/30 border-red-700" : "bg-red-50 border-red-200"
                    }`}
                >
                    <div className="flex items-start gap-4">
                        {verificationDetails.valid 
                            ? <ShieldCheck className={`w-6 h-6 flex-shrink-0 ${isDark ? "text-emerald-400" : "text-emerald-600"}`} />
                            : <AlertTriangle className={`w-6 h-6 flex-shrink-0 ${isDark ? "text-red-400" : "text-red-600"}`} />}
                        <div>
                            <h3 className={`font-bold text-lg mb-1 ${isDark ? "text-white" : "text-gray-800"}`}>
                                Ledger Structural Integrity
                            </h3>
                            <p className={`text-sm ${isDark ? "text-gray-300" : "text-gray-600"}`}>
                                {verificationDetails.message}
                            </p>
                            {!verificationDetails.valid && (
                              <div className="mt-3 space-y-2">
                                {/* Show invalid blocks if any */}
                                {verificationDetails.invalidBlocks?.length > 0 && (
                                  <div className={`text-xs p-2 rounded-lg ${isDark ? 'bg-red-900/40 text-red-200' : 'bg-red-100 text-red-800'}`}>
                                    <strong>⚠ Invalid blocks detected:</strong> #{verificationDetails.invalidBlocks.join(', #')}
                                  </div>
                                )}
                                {/* If tampered data detected, show acknowledge flow first */}
                                {verificationDetails.invalidBlocks?.some(i =>
                                  verificationDetails.details?.find(d => d.index === i)?.issues?.some(iss => iss.includes('tampering'))
                                ) ? (
                                  <div className="space-y-1">
                                    <p className={`text-xs italic ${isDark ? 'text-red-300' : 'text-red-700'}`}>
                                      Data tampering detected. Acknowledge the tampered block(s) to record it on the ledger as evidence, then run Repair Chain to restore chain links.
                                    </p>
                                    <button
                                      onClick={() => handleAcknowledgeTamper(
                                        verificationDetails.invalidBlocks.filter(i =>
                                          verificationDetails.details?.find(d => d.index === i)?.issues?.some(iss => iss.includes('tampering'))
                                        )
                                      )}
                                      disabled={acknowledgingTamper}
                                      className={`text-xs px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors ${
                                        isDark ? 'bg-yellow-600 hover:bg-yellow-700 text-white' : 'bg-yellow-500 hover:bg-yellow-600 text-white'
                                      } disabled:opacity-50`}
                                    >
                                      {acknowledgingTamper
                                        ? <><Loader2 className="w-3 h-3 animate-spin"/> Acknowledging...</>
                                        : <><AlertTriangle className="w-3 h-3"/> Acknowledge Tamper & Record Evidence</>
                                      }
                                    </button>
                                  </div>
                                ) : (
                                  <p className={`text-xs italic ${isDark ? 'text-red-300' : 'text-red-700'}`}>
                                    Broken chain links detected (no data tampering). Click Repair Chain above to fix.
                                  </p>
                                )}
                              </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            
            {/* 2. External Data Integrity Card */}
            {externalDataStatus && (
                <div 
                    className={`flex-1 p-4 rounded-xl shadow-lg transition-colors border ${
                        externalDataStatus.valid
                            ? isDark ? "bg-emerald-900/30 border-emerald-700" : "bg-emerald-50 border-emerald-200"
                            : isDark ? "bg-red-900/30 border-red-700" : "bg-red-50 border-red-200"
                    }`}
                >
                    <div className="flex items-start gap-4">
                        {externalDataStatus.valid 
                            ? <CheckCircle2 className={`w-6 h-6 flex-shrink-0 ${isDark ? "text-emerald-400" : "text-emerald-600"}`} />
                            : <AlertTriangle className={`w-6 h-6 flex-shrink-0 ${isDark ? "text-red-400" : "text-red-600"}`} />}
                        <div className="flex-1 min-w-0">
                            <h3 className={`font-bold text-lg mb-1 ${isDark ? "text-white" : "text-gray-800"}`}>
                                External Data Integrity
                            </h3>
                            {/* Monitored collections badges */}
                            <div className="flex flex-wrap gap-2 mb-2">
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${isDark ? "bg-blue-900/40 text-blue-300 border-blue-700" : "bg-blue-100 text-blue-700 border-blue-200"}`}>
                                    <Database className="w-3 h-3 mr-1"/> Transactions
                                </span>
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${isDark ? "bg-green-900/40 text-green-300 border-green-700" : "bg-green-100 text-green-700 border-green-200"}`}>
                                    <Recycle className="w-3 h-3 mr-1"/> Waste
                                </span>
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${isDark ? "bg-orange-900/40 text-orange-300 border-orange-700" : "bg-orange-100 text-orange-700 border-orange-200"}`}>
                                    <Gift className="w-3 h-3 mr-1"/> Redemptions
                                </span>
                            </div>

                            {/* Pre-integration exclusion notice */}
                            {(externalDataStatus.preIntegrationBlocksSkipped ?? 0) > 0 && (
                              <div className={`mb-2 px-3 py-2 rounded-lg text-xs flex items-start gap-2 ${isDark ? 'bg-blue-900/30 border border-blue-800 text-blue-300' : 'bg-blue-50 border border-blue-200 text-blue-700'}`}>
                                <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                                <span>
                                  <strong>{externalDataStatus.preIntegrationBlocksSkipped} pre-integration block(s) excluded</strong> from this comparison.
                                  These existed before the ledger was integrated and their points are correctly reflected in existing user balances — excluding them prevents false mismatch alerts.
                                  {externalDataStatus.cutoffDate && (
                                    <span className="block mt-0.5 opacity-80">Ledger active since: {new Date(externalDataStatus.cutoffDate).toLocaleString()}</span>
                                  )}
                                </span>
                              </div>
                            )}

                            <p className={`text-sm ${isDark ? "text-gray-300" : "text-gray-600"}`}>
                                {externalDataStatus.reason} 
                            </p>
                            {!externalDataStatus.valid && (
                                <p className="text-xs mt-1">
                                    <strong className={isDark ? "text-red-300" : "text-red-800"}>Ledger Total: {externalDataStatus.ledgerTotal}</strong> | 
                                    <strong className={isDark ? "text-red-300" : "text-red-800"}> Ext. Total: {externalDataStatus.transactionsTotal}</strong>
                                </p>
                            )}

                            {/* Per-user balance difference table with restore buttons */}
                            {externalDataStatus.hasDifferences && externalDataStatus.differences?.length > 0 && (
                              <div className="mt-3 space-y-2">
                                <p className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-yellow-400' : 'text-yellow-700'}`}>
                                  ℹ️ Post-Integration Balance Differences — Review & Restore
                                </p>
                                <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                  These users have a live balance that doesn't match their post-integration ledger history. This may be a legitimate admin correction or unauthorized tampering. Use "Restore Balance" to re-derive from the ledger (pre-integration points are preserved).
                                </p>
                                {externalDataStatus.differences.map((diff) => {
                                  const restoreResult = balanceRestoreResults[diff.userId];
                                  const isRestoring = restoringBalances[diff.userId];
                                  return (
                                    <div
                                      key={diff.userId}
                                      className={`p-3 rounded-lg border text-xs ${
                                        isDark ? 'bg-yellow-900/20 border-yellow-800' : 'bg-yellow-50 border-yellow-200'
                                      }`}
                                    >
                                      <div className="flex items-start justify-between gap-2 flex-wrap">
                                        <div className="space-y-1 min-w-0">
                                          <span className={`font-mono font-bold break-all ${isDark ? 'text-yellow-300' : 'text-yellow-800'}`}>
                                            User: {diff.userId}
                                          </span>
                                          <div className="flex gap-3 flex-wrap">
                                            <span className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] ${isDark ? 'bg-green-900/40 text-green-300' : 'bg-green-100 text-green-800'}`}>
                                              Ledger (post-integration): {diff.fromLedger} pts
                                            </span>
                                            <span className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] ${isDark ? 'bg-red-900/40 text-red-300' : 'bg-red-100 text-red-800'}`}>
                                              Live balance: {diff.fromDb} pts
                                            </span>
                                            <span className={`px-2 py-0.5 rounded font-mono text-[11px] font-bold ${
                                              diff.delta > 0
                                                ? isDark ? 'bg-orange-900/40 text-orange-300' : 'bg-orange-100 text-orange-800'
                                                : isDark ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-100 text-blue-800'
                                            }`}>
                                              Δ {diff.delta > 0 ? '+' : ''}{diff.delta} pts
                                            </span>
                                          </div>
                                          {restoreResult && (
                                            <p className={`text-[11px] mt-1 ${
                                              restoreResult.success
                                                ? isDark ? 'text-emerald-400' : 'text-emerald-700'
                                                : isDark ? 'text-red-400' : 'text-red-700'
                                            }`}>
                                              {restoreResult.success
                                                ? restoreResult.noChangeNeeded
                                                  ? '✅ Balance already correct — no change needed.'
                                                  : `✅ Restored: ${restoreResult.previousBalance} → ${restoreResult.ledgerBalance} pts`
                                                : `❌ Failed: ${restoreResult.error}`}
                                            </p>
                                          )}
                                        </div>
                                        <button
                                          onClick={() => handleRestoreBalance(diff.userId)}
                                          disabled={isRestoring || !!restoreResult?.success}
                                          className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors disabled:opacity-50 ${
                                            restoreResult?.success
                                              ? isDark ? 'bg-emerald-700 text-white cursor-default' : 'bg-emerald-100 text-emerald-800 cursor-default'
                                              : isDark ? 'bg-yellow-600 hover:bg-yellow-700 text-white' : 'bg-yellow-500 hover:bg-yellow-600 text-white'
                                          }`}
                                        >
                                          {isRestoring
                                            ? <Loader2 className="w-3 h-3 animate-spin" />
                                            : restoreResult?.success
                                              ? <Check className="w-3 h-3" />
                                              : <UserCheck className="w-3 h-3" />
                                          }
                                          {isRestoring ? 'Restoring...' : restoreResult?.success ? 'Restored' : 'Restore Balance'}
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>

        {/* 3. Transaction Points Integrity Card */}
        {txPointsTamperStatus && (
          <div className={`mt-4 p-4 rounded-xl shadow-lg border ${
            txPointsTamperStatus.skipped
              ? isDark ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-200'
              : txPointsTamperStatus.valid
                ? isDark ? 'bg-emerald-900/30 border-emerald-700' : 'bg-emerald-50 border-emerald-200'
                : isDark ? 'bg-red-900/30 border-red-700' : 'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-start gap-4">
              <div className="mt-0.5 flex-shrink-0">
                {txPointsTamperStatus.skipped ? (
                  <Lock className={`w-6 h-6 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                ) : txPointsTamperStatus.valid ? (
                  <ShieldAlert className={`w-6 h-6 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                ) : (
                  <ShieldAlert className="w-6 h-6 text-red-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={`font-bold text-lg mb-1 ${isDark ? 'text-white' : 'text-gray-800'}`}>
                  Transaction Points Integrity
                </h3>

                {/* Stats badges */}
                {!txPointsTamperStatus.skipped && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${isDark ? "bg-blue-900/40 text-blue-300 border-blue-700" : "bg-blue-100 text-blue-700 border-blue-200"}`}>
                      <ShieldCheck className="w-3 h-3 mr-1"/> Verified: {txPointsTamperStatus.checkedCount ?? 0}
                    </span>
                    {(txPointsTamperStatus.skippedLegacy ?? 0) > 0 && (
                      <span
                        title="These blocks were written before the txPoints seal feature was introduced. They cannot be retroactively verified against point_transaction docs, but this is expected — it does not indicate tampering."
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border cursor-help ${isDark ? "bg-gray-700 text-gray-300 border-gray-600" : "bg-gray-100 text-gray-600 border-gray-300"}`}>
                        Pre-seal (unverifiable): {txPointsTamperStatus.skippedLegacy}
                      </span>
                    )}
                    {(txPointsTamperStatus.tampered?.length ?? 0) > 0 && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border bg-red-500 text-white border-red-600">
                        Tampered: {txPointsTamperStatus.tampered.length}
                      </span>
                    )}
                  </div>
                )}

                {/* Pre-seal explanation when legacy blocks are present */}
                {!txPointsTamperStatus.skipped && (txPointsTamperStatus.skippedLegacy ?? 0) > 0 && (
                  <div className={`mb-2 px-3 py-2 rounded-lg text-xs flex items-start gap-2 ${isDark ? 'bg-gray-700/60 border border-gray-600 text-gray-300' : 'bg-gray-50 border border-gray-200 text-gray-600'}`}>
                    <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>{txPointsTamperStatus.skippedLegacy} block(s) pre-date the tamper-seal feature</strong> and cannot be verified against point_transaction docs.
                      This is expected for transactions that occurred before the ledger was integrated — it does <em>not</em> indicate tampering.
                      Only blocks written after integration have tamper-detection coverage.
                    </span>
                  </div>
                )}

                <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                  {txPointsTamperStatus.reason}
                </p>

                {/* Tampered entries detail table with per-entry Restore button */}
                {txPointsTamperStatus.tampered?.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-red-400' : 'text-red-700'}`}>
                      🚨 Tampered Entries — Restore Required
                    </p>
                    {txPointsTamperStatus.tampered.map((entry) => {
                      const isThisRecovering = recoveringEntry === entry.blockId;
                      const recoveryResult   = recoveryResults[entry.blockId];
                      const alreadyDone      = !!recoveryResult?.success;

                      return (
                        <div
                          key={entry.blockId}
                          className={`p-3 rounded-lg border text-xs ${
                            isDark ? 'bg-red-900/30 border-red-800' : 'bg-red-50 border-red-200'
                          }`}
                        >
                          <div className="flex justify-between items-start gap-2 mb-1.5">
                            <span className={`font-bold ${isDark ? 'text-red-300' : 'text-red-800'}`}>
                              Block #{entry.blockIndex} · {entry.actionType}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex-shrink-0 ${
                              entry.issue === 'TRANSACTION_DELETED'
                                ? 'bg-orange-500 text-white'
                                : 'bg-red-500 text-white'
                            }`}>
                              {entry.issue === 'TRANSACTION_DELETED' ? 'Deleted' : 'Mismatch'}
                            </span>
                          </div>
                          <p className={`mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            {entry.detail}
                          </p>

                          {/* Points comparison */}
                          {entry.issue === 'POINTS_MISMATCH' && (
                            <div className="flex gap-3 mb-2 flex-wrap">
                              <span className={`px-2 py-1 rounded font-mono font-bold text-[11px] ${isDark ? 'bg-green-900/40 text-green-300' : 'bg-green-100 text-green-800'}`}>
                                Sealed (correct): {entry.sealedPoints} pts
                              </span>
                              <span className={`px-2 py-1 rounded font-mono font-bold text-[11px] ${isDark ? 'bg-red-900/40 text-red-300' : 'bg-red-100 text-red-800'}`}>
                                Live (tampered): {entry.livePoints} pts
                              </span>
                            </div>
                          )}

                          {/* Meta info row */}
                          <div className={`flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[10px] mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            <span>TX: {entry.firestoreId}</span>
                            <span>User: {entry.userId}</span>
                            <span>{entry.timestamp ? new Date(entry.timestamp).toLocaleString() : 'N/A'}</span>
                          </div>

                          {/* Recovery result feedback */}
                          {recoveryResult && (
                            <p className={`text-[11px] mb-2 font-semibold ${
                              recoveryResult.success
                                ? isDark ? 'text-emerald-400' : 'text-emerald-700'
                                : isDark ? 'text-red-400' : 'text-red-700'
                            }`}>
                              {recoveryResult.success
                                ? `✅ Restored: TX ${recoveryResult.txRestore.previousPoints} → ${recoveryResult.txRestore.restoredPoints} pts · Balance ${recoveryResult.balanceRestore.previousBalance} → ${recoveryResult.balanceRestore.ledgerBalance} pts`
                                : `❌ Recovery failed: ${recoveryResult.error}`}
                            </p>
                          )}

                          {/* Restore button — only shown for POINTS_MISMATCH (not TRANSACTION_DELETED) */}
                          {entry.issue === 'POINTS_MISMATCH' && (
                            <button
                              onClick={() => handleRecoverTamperedEntry(entry)}
                              disabled={isThisRecovering || alreadyDone || !!recoveringEntry}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 ${
                                alreadyDone
                                  ? isDark ? 'bg-emerald-700 text-white cursor-default' : 'bg-emerald-100 text-emerald-800 cursor-default'
                                  : isDark ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-red-500 hover:bg-red-600 text-white'
                              }`}
                            >
                              {isThisRecovering
                                ? <><Loader2 className="w-3 h-3 animate-spin"/> Recovering...</>
                                : alreadyDone
                                  ? <><Check className="w-3 h-3"/> Recovered</>
                                  : <><RotateCcw className="w-3 h-3"/> Restore Points & Fix Balance</>
                              }
                            </button>
                          )}
                        </div>
                      );
                    })}

                    {/* Bulk recovery note */}
                    {txPointsTamperStatus.tampered.filter(e => e.issue === 'POINTS_MISMATCH').length > 1 && (
                      <p className={`text-xs italic ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        Tip: After restoring all entries, run <strong>Repair Chain</strong> to re-seal any affected block hashes.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Global Integrity Message */}
        {chainStatus.valid !== null && (
            <div className={`mt-4 p-4 rounded-xl border-l-4 ${
                chainStatus.valid 
                ? isDark ? "bg-emerald-900/20 border-emerald-500 text-emerald-300" : "bg-emerald-50 border-emerald-500 text-emerald-800"
                : isDark ? "bg-red-900/20 border-red-500 text-red-300" : "bg-red-50 border-red-500 text-red-800"
            }`}>
                <p className="font-semibold">{chainStatus.valid ? "System Status: OK" : "System Status: ALERT"}</p>
                <p className="text-sm">{chainStatus.message}</p>
            </div>
        )}

      </div>
      
      {/* Anchors Section */}
      <div className={`mt-8 p-6 rounded-xl shadow-2xl ${isDark ? "bg-gray-800" : "bg-white border border-gray-200"}`}>
        <h3 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <Anchor className="w-6 h-6" />
            Public Anchors
        </h3>
        
        {anchors.length === 0 && !loading ? (
            <p className={`text-center py-4 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                No public anchors have been published yet.
            </p>
        ) : (
          <div className="space-y-3">
            {anchors.map((anchor, idx) => (
              <div 
                key={anchor.id}
                className={`p-4 rounded-lg border transition-colors ${idx === 0 ? isDark ? "bg-purple-900/30 border-purple-800" : "bg-purple-50 border-purple-200" : isDark ? "bg-gray-700/50 border-gray-600" : "bg-gray-50 border-gray-100"}`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      {idx === 0 && <span className={`text-xs font-bold px-2 py-0.5 rounded ${isDark ? "bg-purple-700 text-purple-200" : "bg-purple-200 text-purple-800"}`}>LATEST</span>}
                      <span className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}><Clock className="w-3 h-3 inline mr-1" />{anchor.publishedAt ? new Date(anchor.publishedAt).toLocaleString() : "Unknown"}</span>
                    </div>
                    <code className={`text-xs font-mono break-all ${isDark ? "text-indigo-300" : "text-indigo-600"}`}>{anchor.latestHash}</code>
                  </div>
                  <div className={`flex items-center gap-4 text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                    <span><strong className={isDark ? "text-white" : "text-gray-800"}>{anchor.blockCount}</strong> blocks</span>
                    <span>Index: <strong className={isDark ? "text-white" : "text-gray-800"}>#{anchor.latestBlockIndex}</strong></span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      
      {loading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Loader2 className="w-10 h-10 text-white animate-spin" />
        </div>
      )}
    </div>
  );
};

export default BlockchainTab;