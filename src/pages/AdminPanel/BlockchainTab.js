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
  acknowledgeTamper
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
  Eye,
  BookOpen,
  Zap,
  Info,
  Lock,
  Globe,
  Fingerprint,
  TrendingUp
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
  const [repairResult, setRepairResult] = useState(null);
  const [acknowledgingTamper, setAcknowledgingTamper] = useState(false);
  
  // NEW: Educational panel states
  const [showWhyBlockchain, setShowWhyBlockchain] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
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
  const loadChainStatus = async (initial = false) => {
    setLoading(true);
    setRepairResult(null); 
    try {
      // 1. Get basic status
      const status = await getChainStatus();
      setChainStatus(status);
      setLatestHash(status.latestHash);
      setBlockCount(status.blockCount);

      if (status.initialized) {
        // 2. Run full integrity check (Structural + External Data Reconciliation)
        const fullVerification = await runAllIntegrityChecks();

        setChainStatus({ 
          ...status, 
          valid: fullVerification.valid, 
          message: fullVerification.message 
        });

        // Store detailed results
        setVerificationDetails(fullVerification.chainVerification); 
        setExternalDataStatus(fullVerification.dataVerification);

        // 3. Load latest blocks and anchors
        const latestBlocks = await getAllBlocks();
        setBlocks(latestBlocks);
        const allAnchors = await getAllAnchors();
        setAnchors(allAnchors);
        
        // 4. Calculate impact metrics
        calculateImpactMetrics(latestBlocks, allAnchors, fullVerification);
      } else {
        setVerificationDetails({ valid: false, message: "Blockchain is not initialized (No Genesis Block)." });
        setExternalDataStatus(null); 
        setBlocks([]);
        setAnchors([]);
      }

    } catch (error) {
      console.error("Error loading chain status:", error);
      setChainStatus(prev => ({ ...prev, valid: false, message: `Error: ${error.message}` }));
      setVerificationDetails({ valid: false, message: `Error during structural verification: ${error.message}` });
      setExternalDataStatus({ valid: false, reason: `Error during external data verification: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  // NEW: Calculate impact metrics
  const calculateImpactMetrics = (blocksData, anchorsData, verification) => {
    const totalPoints = blocksData.reduce((sum, block) => sum + Math.abs(block.points || 0), 0);
    
    setImpactMetrics({
      totalTransactions: blocksData.length,
      totalPointsProtected: totalPoints,
      integrityChecksPerformed: verification ? 1 : 0, // Increment in real app
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
              alert(`Chain Repair Complete! Repaired ${result.repairedCount} blocks. New Latest Hash: ${hashPreview}`);
              await loadChainStatus();
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
      await loadChainStatus();
    } catch (err) {
      alert("Failed to acknowledge tamper: " + err.message);
    } finally {
      setAcknowledgingTamper(false);
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
        <h2 className="text-2xl sm:text-3xl font-bold">Blockchain Admin Panel</h2>
        
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
            Why Blockchain?
          </button>
          
          <button
            onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
            className={`px-3 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors text-sm ${
              showTechnicalDetails 
                ? isDark ? "bg-purple-600 text-white" : "bg-purple-500 text-white"
                : isDark ? "bg-gray-700 text-gray-300 hover:bg-gray-600" : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Technical Details
          </button>
        </div>
      </div>

      {/* NEW: Why Blockchain Educational Panel */}
      {showWhyBlockchain && (
        <div className={`mb-6 p-6 rounded-xl shadow-lg border ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}>
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-blue-500" />
            Why We Use Blockchain Technology
          </h3>
          
          {/* Comparison Table */}
          <div className="overflow-x-auto mb-6 -mx-2">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className={isDark ? "bg-gray-700" : "bg-gray-100"}>
                  <th className="p-3 text-left font-semibold">Traditional Database</th>
                  <th className="p-3 text-left font-semibold text-green-600">With Blockchain</th>
                </tr>
              </thead>
              <tbody>
                <tr className={isDark ? "border-b border-gray-700" : "border-b border-gray-200"}>
                  <td className="p-3 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <span>Admin can edit/delete reward records</span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>Records are immutable - cannot be changed</span>
                    </div>
                  </td>
                </tr>
                <tr className={isDark ? "border-b border-gray-700" : "border-b border-gray-200"}>
                  <td className="p-3 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <span>Changes are invisible to users</span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>Every change leaves a permanent trace</span>
                    </div>
                  </td>
                </tr>
                <tr className={isDark ? "border-b border-gray-700" : "border-b border-gray-200"}>
                  <td className="p-3 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <span>Users must trust administrators</span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>Users can verify independently</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td className="p-3 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <span>Corruption can go undetected</span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>Tampering is immediately visible</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Key Benefits */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className={`p-4 rounded-lg ${isDark ? "bg-gray-700" : "bg-blue-50"}`}>
              <div className="flex items-start gap-3">
                <Lock className="w-5 h-5 text-blue-500 mt-1" />
                <div>
                  <h4 className="font-bold mb-1">Protects Real Value</h4>
                  <p className="text-sm opacity-80">Reward points have monetary value. Blockchain prevents unauthorized manipulation.</p>
                </div>
              </div>
            </div>
            
            <div className={`p-4 rounded-lg ${isDark ? "bg-gray-700" : "bg-green-50"}`}>
              <div className="flex items-start gap-3">
                <Eye className="w-5 h-5 text-green-500 mt-1" />
                <div>
                  <h4 className="font-bold mb-1">Transparency in Governance</h4>
                  <p className="text-sm opacity-80">Aligns with SDG 16 (Strong Institutions) through transparent reward distribution.</p>
                </div>
              </div>
            </div>
            
            <div className={`p-4 rounded-lg ${isDark ? "bg-gray-700" : "bg-purple-50"}`}>
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-purple-500 mt-1" />
                <div>
                  <h4 className="font-bold mb-1">Prevents Corruption</h4>
                  <p className="text-sm opacity-80">Makes it impossible for anyone to alter historical records without detection.</p>
                </div>
              </div>
            </div>
            
            <div className={`p-4 rounded-lg ${isDark ? "bg-gray-700" : "bg-orange-50"}`}>
              <div className="flex items-start gap-3">
                <Globe className="w-5 h-5 text-orange-500 mt-1" />
                <div>
                  <h4 className="font-bold mb-1">Builds Community Trust</h4>
                  <p className="text-sm opacity-80">Users can independently verify that the system is fair and accurate.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NEW: Technical Details Educational Panel */}
      {showTechnicalDetails && (
        <div className={`mb-6 p-6 rounded-xl shadow-lg border ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}>
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Fingerprint className="w-6 h-6 text-purple-500" />
            Blockchain Architecture & Cryptography
          </h3>
          
          <div className="space-y-4">
            {/* Block Structure */}
            <div className={`p-4 rounded-lg border-l-4 border-blue-500 ${isDark ? "bg-gray-700" : "bg-blue-50"}`}>
              <h4 className="font-bold mb-2">Block Structure</h4>
              <p className="text-sm mb-2">Each block contains:</p>
              <ul className="text-sm space-y-1 ml-4">
                <li>• Index (sequential number)</li>
                <li>• Timestamp (when created)</li>
                <li>• Data (transaction details)</li>
                <li>• Previous Hash (link to previous block)</li>
                <li>• Current Hash (SHA-256 cryptographic fingerprint)</li>
                <li>• Metadata (additional context)</li>
              </ul>
            </div>

            {/* Hash Chaining */}
            <div className={`p-4 rounded-lg border-l-4 border-green-500 ${isDark ? "bg-gray-700" : "bg-green-50"}`}>
              <h4 className="font-bold mb-2">Hash Chaining Mechanism</h4>
              <p className="text-sm">
                Each block's hash depends on its data AND the previous block's hash, creating an unbreakable chain. 
                If anyone tries to modify a past block, ALL subsequent hashes break, making tampering immediately detectable.
              </p>
            </div>

            {/* SHA-256 Example */}
            <div className={`p-4 rounded-lg ${isDark ? "bg-black/20" : "bg-gray-100"}`}>
              <h4 className="font-bold mb-2 flex items-center gap-2">
                <Hash className="w-4 h-4" />
                SHA-256 Hash Example
              </h4>
              <div className="space-y-2 font-mono text-xs overflow-hidden">
                <div className="truncate">
                  <span className="opacity-60">Input: </span>
                  <span className="text-blue-500">"transaction_123"</span>
                </div>
                <div className="truncate">
                  <span className="opacity-60">SHA-256: </span>
                  <span className="text-green-500">a7f8b9c0d1e2...</span>
                </div>
                <div className="border-t border-gray-300 dark:border-gray-600 my-2"></div>
                <div className="truncate">
                  <span className="opacity-60">Input: </span>
                  <span className="text-red-500">"transaction_124"</span>
                  <span className="opacity-60"> (changed 1 digit)</span>
                </div>
                <div className="truncate">
                  <span className="opacity-60">SHA-256: </span>
                  <span className="text-red-500">x1y2z3a4b5c6...</span>
                  <span className="opacity-60"> (completely different!)</span>
                </div>
              </div>
              <p className="text-sm mt-3 opacity-80">
                Even changing a single character completely changes the hash. This is the foundation of blockchain security.
              </p>
            </div>

            {/* Anchor System */}
            <div className={`p-4 rounded-lg border-l-4 border-purple-500 ${isDark ? "bg-gray-700" : "bg-purple-50"}`}>
              <h4 className="font-bold mb-2">Anchor Mechanism</h4>
              <p className="text-sm">
                Periodic anchors act as public checkpoints, providing additional verification points. 
                These are published hashes that serve as trusted reference points for the entire chain state.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* NEW: Impact Metrics Dashboard */}
      {chainStatus.initialized && (
        <div className={`mb-6 p-6 rounded-xl shadow-lg ${isDark ? "bg-gradient-to-r from-indigo-900/50 to-purple-900/50 border border-indigo-700" : "bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200"}`}>
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
            <TrendingUp className="w-6 h-6" />
            Blockchain Impact Metrics
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

        {/* Repair Chain Button — always visible when initialized so admin
             can run a repair at any time, not just when the UI detects failure */}
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
              <p className="text-sm">
                Repaired Blocks: {repairResult.repairedCount ?? 0}. Latest Hash: {repairResult.latestHash ? repairResult.latestHash.substring(0, 15) + '...' : 'N/A'}
              </p>
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

        {/* Overall Status and Actions Row */}
        <div className="flex flex-col sm:flex-row gap-4">
            {/* 1. Overall Blockchain Structural Integrity Card */}
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
                                Blockchain Structural Integrity
                            </h3>
                            <p className={`text-sm ${isDark ? "text-gray-300" : "text-gray-600"}`}>
                                {verificationDetails.message}
                            </p>
                            {!verificationDetails.valid && (
                              <div className="mt-3 space-y-2">
                                {/* Show tampered blocks if any */}
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
                        <div>
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

                            <p className={`text-sm ${isDark ? "text-gray-300" : "text-gray-600"}`}>
                                {externalDataStatus.reason} 
                            </p>
                            {!externalDataStatus.valid && (
                                <p className="text-xs mt-1">
                                    <strong className={isDark ? "text-red-300" : "text-red-800"}>Ledger Total: {externalDataStatus.ledgerTotal}</strong> | 
                                    <strong className={isDark ? "text-red-300" : "text-red-800"}> Ext. Total: {externalDataStatus.transactionsTotal}</strong>
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
        
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

      {/* Info Box - Enhanced with "Why Emerging Technology" */}
      <div className={`mt-8 p-6 rounded-xl border-l-4 ${
        isDark ? "bg-blue-900/20 border-blue-500 text-blue-300" : "bg-blue-50 border-blue-500 text-blue-800"
      }`}>
        <h4 className="font-bold mb-2 flex items-center gap-2">
          <Info className="w-5 h-5" />
          Why This Qualifies as Emerging Technology
        </h4>
        <p className={`text-sm mb-3 ${isDark ? "text-blue-200" : "text-blue-700"}`}>
          We apply blockchain principles used by Bitcoin and Ethereum to local governance - waste reward management. 
          Every transaction creates a cryptographic hash linked to the previous one. Publishing an "anchor" 
          saves the current state publicly. Anyone can verify the ledger by recalculating hashes.
        </p>
        <p className={`text-sm ${isDark ? "text-blue-200" : "text-blue-700"}`}>
          This technology transfer from financial systems to environmental governance represents an innovative 
          application of emerging blockchain technology, directly supporting SDG 16 (Strong Institutions) through 
          corruption-resistant, transparent systems.
        </p>
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