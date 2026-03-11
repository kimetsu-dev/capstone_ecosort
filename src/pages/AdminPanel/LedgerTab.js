// src/pages/AdminPanel/LedgerTab.js - ENHANCED VERSION

import React, { useEffect, useState, useCallback } from 'react';
import { db } from '../../firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { 
  ShieldCheck, 
  AlertTriangle, 
  Link as LinkIcon, 
  Hash, 
  Clock, 
  User, 
  Loader2, 
  Search,
  Box,
  ChevronDown,
  ChevronUp,
  RotateCw,
  Database,
  Recycle, 
  Gift,
  Info,
  BookOpen,
  Eye,
  Lock,
  Globe,
  Fingerprint,
  TrendingUp,
  CheckCircle2
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
// Import the central verification function
import { runAllIntegrityChecks } from '../../utils/blockchainService';

const LedgerTab = () => {
  const { isDark } = useTheme();
  const [blocks, setBlocks] = useState([]);
  const [integrityStatus, setIntegrityStatus] = useState("Verifying...");
  const [isValid, setIsValid] = useState(true);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedBlock, setExpandedBlock] = useState(null);
  const [chainVerification, setChainVerification] = useState(null);
  const [externalDataStatus, setExternalDataStatus] = useState(null);
  
  // NEW: Educational panel states
  const [showWhyBlockchain, setShowWhyBlockchain] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  
  // NEW: Impact metrics
  const [impactMetrics, setImpactMetrics] = useState({
    totalBlocks: 0,
    totalPointsTracked: 0,
    oldestBlock: null,
    newestBlock: null
  });

  // Helper function for display
  const formatTimestamp = (timestamp) => {
    if (timestamp?.toDate) {
        return timestamp.toDate().toLocaleString();
    }
    return new Date(timestamp).toLocaleString();
  };

  const runVerification = useCallback(async () => {
    setVerifying(true);
    setIntegrityStatus("Running full integrity checks...");
    try {
        const fullVerification = await runAllIntegrityChecks();

        // Update overall status
        setIsValid(fullVerification.valid);
        setIntegrityStatus(fullVerification.message);
        
        // Store detailed results
        setChainVerification(fullVerification.chainVerification);
        setExternalDataStatus(fullVerification.dataVerification);

    } catch (error) {
        setIsValid(false);
        setIntegrityStatus(`Verification Error: ${error.message}`);
        console.error("Verification failed:", error);
    } finally {
        setVerifying(false);
    }
  }, []); 

  // NEW: Calculate impact metrics
  const calculateImpactMetrics = useCallback((blocksData) => {
    if (blocksData.length === 0) return;
    
    const totalPoints = blocksData.reduce((sum, block) => sum + Math.abs(block.points || 0), 0);
    const sortedByTime = [...blocksData].sort((a, b) => 
      (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0)
    );
    
    setImpactMetrics({
      totalBlocks: blocksData.length,
      totalPointsTracked: totalPoints,
      oldestBlock: sortedByTime[0]?.timestamp,
      newestBlock: sortedByTime[sortedByTime.length - 1]?.timestamp
    });
  }, []);

  useEffect(() => {
    const q = query(collection(db, "ledger"), orderBy("index", "desc"), limit(50));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const newBlocks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setBlocks(newBlocks);
        calculateImpactMetrics(newBlocks);
        setLoading(false);
    }, (error) => {
        console.error("Error fetching ledger blocks:", error);
        setIntegrityStatus("Error loading blocks.");
        setLoading(false);
    });

    runVerification(); // Initial verification call

    return () => unsubscribe();
  }, [runVerification, calculateImpactMetrics]);

  const filteredBlocks = blocks.filter(block => 
    String(block.index).includes(searchTerm) ||
    block.hash.includes(searchTerm) ||
    block.prevHash.includes(searchTerm) ||
    (block.userId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (block.actionType || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-3 sm:p-6 w-full overflow-hidden">
      {/* Header with Educational Toggles */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-3">
        <h1 className={`text-2xl sm:text-3xl font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
          Immutable Ledger (Blockchain)
        </h1>
        
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
            Why We Use Blockchain for the Ledger
          </h3>
          
          {/* Comparison Table */}
          <div className="overflow-x-auto mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className={isDark ? "bg-gray-700" : "bg-gray-100"}>
                  <th className="p-3 text-left font-semibold">Traditional Database Ledger</th>
                  <th className="p-3 text-left font-semibold text-green-600">Blockchain Ledger</th>
                </tr>
              </thead>
              <tbody>
                <tr className={isDark ? "border-b border-gray-700" : "border-b border-gray-200"}>
                  <td className="p-3 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <span>Records can be altered after creation</span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>Records are immutable once written</span>
                    </div>
                  </td>
                </tr>
                <tr className={isDark ? "border-b border-gray-700" : "border-b border-gray-200"}>
                  <td className="p-3 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <span>No way to prove data hasn't been changed</span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>Cryptographic proof of data integrity</span>
                    </div>
                  </td>
                </tr>
                <tr className={isDark ? "border-b border-gray-700" : "border-b border-gray-200"}>
                  <td className="p-3 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <span>Audit trail can be manipulated</span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>Complete, unalterable audit trail</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td className="p-3 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <span>Verification requires trust in administrators</span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>Anyone can independently verify integrity</span>
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
                  <h4 className="font-bold mb-1">Permanent Record Keeping</h4>
                  <p className="text-sm opacity-80">Every transaction is permanently recorded. No one can delete or modify past records.</p>
                </div>
              </div>
            </div>
            
            <div className={`p-4 rounded-lg ${isDark ? "bg-gray-700" : "bg-green-50"}`}>
              <div className="flex items-start gap-3">
                <Eye className="w-5 h-5 text-green-500 mt-1" />
                <div>
                  <h4 className="font-bold mb-1">Complete Transparency</h4>
                  <p className="text-sm opacity-80">Full audit trail available for verification. Every change is traceable.</p>
                </div>
              </div>
            </div>
            
            <div className={`p-4 rounded-lg ${isDark ? "bg-gray-700" : "bg-purple-50"}`}>
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-purple-500 mt-1" />
                <div>
                  <h4 className="font-bold mb-1">Tamper Detection</h4>
                  <p className="text-sm opacity-80">Any attempt to alter historical data immediately breaks the chain and is detected.</p>
                </div>
              </div>
            </div>
            
            <div className={`p-4 rounded-lg ${isDark ? "bg-gray-700" : "bg-orange-50"}`}>
              <div className="flex items-start gap-3">
                <Globe className="w-5 h-5 text-orange-500 mt-1" />
                <div>
                  <h4 className="font-bold mb-1">Independent Verification</h4>
                  <p className="text-sm opacity-80">Users don't need to trust us - they can verify the data themselves.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NEW: Technical Details Panel */}
      {showTechnicalDetails && (
        <div className={`mb-6 p-6 rounded-xl shadow-lg border ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}>
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Fingerprint className="w-6 h-6 text-purple-500" />
            How the Immutable Ledger Works
          </h3>
          
          <div className="space-y-4">
            {/* Hash Linking */}
            <div className={`p-4 rounded-lg border-l-4 border-blue-500 ${isDark ? "bg-gray-700" : "bg-blue-50"}`}>
              <h4 className="font-bold mb-2 flex items-center gap-2">
                <LinkIcon className="w-4 h-4" />
                Hash Linking (Chain Structure)
              </h4>
              <p className="text-sm mb-2">
                Each block contains a hash (cryptographic fingerprint) of the previous block. This creates an unbreakable chain:
              </p>
              <div className="font-mono text-xs space-y-1 ml-4">
                <div>Block #1: Hash = abc123...</div>
                <div>Block #2: prevHash = abc123..., Hash = def456...</div>
                <div>Block #3: prevHash = def456..., Hash = ghi789...</div>
              </div>
              <p className="text-sm mt-2">
                If someone tries to change Block #1, its hash changes, which breaks Block #2, which breaks Block #3, and so on. 
                The entire chain becomes invalid.
              </p>
            </div>

            {/* Immutability Guarantee */}
            <div className={`p-4 rounded-lg border-l-4 border-green-500 ${isDark ? "bg-gray-700" : "bg-green-50"}`}>
              <h4 className="font-bold mb-2">Immutability Guarantee</h4>
              <p className="text-sm">
                Once a block is added to the ledger, it cannot be changed without:
              </p>
              <ul className="text-sm space-y-1 ml-4 mt-2">
                <li>• Recalculating the hash of the modified block</li>
                <li>• Recalculating ALL subsequent block hashes</li>
                <li>• Doing this faster than new blocks are added</li>
              </ul>
              <p className="text-sm mt-2 font-semibold">
                This is computationally infeasible, making the ledger effectively immutable.
              </p>
            </div>

            {/* SHA-256 Cryptography */}
            <div className={`p-4 rounded-lg ${isDark ? "bg-black/20" : "bg-gray-100"}`}>
              <h4 className="font-bold mb-2 flex items-center gap-2">
                <Hash className="w-4 h-4" />
                SHA-256 Cryptographic Hashing
              </h4>
              <p className="text-sm mb-2">
                We use SHA-256, the same algorithm as Bitcoin, to create block hashes:
              </p>
              <div className="space-y-2 font-mono text-xs">
                <div>
                  <span className="opacity-60">Input: </span>
                  <span className="text-blue-500">Block #5 data</span>
                </div>
                <div>
                  <span className="opacity-60">SHA-256: </span>
                  <span className="text-green-500">a7f8b9c0d1e2f3a4b5c6d7e8f9a0b1c2...</span>
                </div>
                <div className="border-t border-gray-300 dark:border-gray-600 my-2"></div>
                <div>
                  <span className="opacity-60">Input: </span>
                  <span className="text-red-500">Block #5 data (modified)</span>
                </div>
                <div>
                  <span className="opacity-60">SHA-256: </span>
                  <span className="text-red-500">x1y2z3a4b5c6d7e8f9a0b1c2d3e4f5a6...</span>
                  <span className="opacity-60"> (completely different!)</span>
                </div>
              </div>
            </div>

            {/* Verification Process */}
            <div className={`p-4 rounded-lg border-l-4 border-purple-500 ${isDark ? "bg-gray-700" : "bg-purple-50"}`}>
              <h4 className="font-bold mb-2">Integrity Verification Process</h4>
              <p className="text-sm">
                The system continuously verifies integrity by:
              </p>
              <ol className="text-sm space-y-1 ml-4 mt-2 list-decimal">
                <li>Recalculating the hash of each block from its data</li>
                <li>Comparing the calculated hash with the stored hash</li>
                <li>Verifying each block's prevHash matches the previous block's hash</li>
                <li>Checking external databases match the ledger totals</li>
              </ol>
              <p className="text-sm mt-2">
                Any mismatch immediately triggers an integrity alert.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* NEW: Ledger Impact Metrics */}
      <div className={`mb-6 p-6 rounded-xl shadow-lg ${isDark ? "bg-gradient-to-r from-indigo-900/50 to-purple-900/50 border border-indigo-700" : "bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200"}`}>
        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
          <TrendingUp className="w-6 h-6" />
          Ledger Statistics
        </h3>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className={`p-4 rounded-lg ${isDark ? "bg-black/30" : "bg-white"}`}>
            <div className="flex items-center gap-2 mb-2">
              <Database className="w-5 h-5 text-blue-500" />
              <span className="text-sm opacity-70">Total Blocks</span>
            </div>
            <p className="text-2xl font-bold">{impactMetrics.totalBlocks.toLocaleString()}</p>
          </div>
          
          <div className={`p-4 rounded-lg ${isDark ? "bg-black/30" : "bg-white"}`}>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-green-500" />
              <span className="text-sm opacity-70">Points Tracked</span>
            </div>
            <p className="text-2xl font-bold">{impactMetrics.totalPointsTracked.toLocaleString()}</p>
          </div>
          
          <div className={`p-4 rounded-lg ${isDark ? "bg-black/30" : "bg-white"}`}>
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-5 h-5 text-purple-500" />
              <span className="text-sm opacity-70">First Block</span>
            </div>
            <p className="text-sm font-bold">
              {impactMetrics.oldestBlock ? formatTimestamp(impactMetrics.oldestBlock).split(',')[0] : 'N/A'}
            </p>
          </div>
          
          <div className={`p-4 rounded-lg ${isDark ? "bg-black/30" : "bg-white"}`}>
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-5 h-5 text-orange-500" />
              <span className="text-sm opacity-70">Status</span>
            </div>
            <p className="text-xl font-bold">{isValid ? "SECURE" : "ALERT"}</p>
          </div>
        </div>
      </div>

      {/* INTEGRITY STATUS BANNER (Primary Status) */}
      <div className={`p-4 rounded-xl shadow-md mb-6 ${
          isValid
            ? 'bg-green-50 border border-green-200' 
            : 'bg-red-50 border border-red-200'
      } ${isDark ? (isValid ? 'bg-green-900/30 border-green-700' : 'bg-red-900/30 border-red-700') : ''}`}>
          <div className="flex items-center gap-4">
              {verifying ? (
                  <Loader2 className="w-6 h-6 text-indigo-500 animate-spin flex-shrink-0" />
              ) : isValid ? (
                  <ShieldCheck className="w-6 h-6 text-green-600 flex-shrink-0" />
              ) : (
                  <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0" />
              )}
              <div className="flex-1">
                  <h3 className={`font-bold ${isValid ? 'text-green-700' : 'text-red-700'}`}>
                      System Integrity Status: {isValid ? "SECURE" : "COMPROMISED"}
                  </h3>
                  <p className={`text-sm mt-0.5 ${isValid ? 'text-green-600' : 'text-red-600'}`}>
                      {integrityStatus}
                  </p>
                  
                  {/* Detailed Failure Reasons */}
                  {!isValid && (
                      <div className="mt-2 space-y-1">
                          {chainVerification && !chainVerification.valid && (
                              <div className={`text-xs flex items-center gap-2 ${isDark ? 'text-red-300' : 'text-red-700'}`}>
                                  <LinkIcon className="w-3 h-3" /> 
                                  Blockchain Broken at Blocks: {chainVerification.invalidBlocks.join(', ')}
                              </div>
                          )}
                          {externalDataStatus && !externalDataStatus.valid && (
                              <div className={`text-xs flex items-center gap-2 ${isDark ? 'text-red-300' : 'text-red-700'}`}>
                                  <Database className="w-3 h-3" /> 
                                  External Data Check Failed: {externalDataStatus.reason}
                              </div>
                          )}
                      </div>
                  )}
              </div>
              <button
                onClick={runVerification} 
                disabled={verifying}
                className={`flex-shrink-0 flex items-center px-3 py-1 text-xs rounded-full font-semibold transition-colors ${
                  isDark ? 'bg-indigo-700 hover:bg-indigo-800 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                } disabled:opacity-50`}
              >
                {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCw className="w-4 h-4" />}
              </button>
          </div>
      </div>

      {/* External Data Integrity Status */}
      {externalDataStatus && !externalDataStatus.valid && (
          <div className={`flex items-start p-4 mb-6 rounded-xl border animate-in slide-in-from-top-2 fade-in ${
              isDark ? "bg-red-900/30 border-red-700 text-red-300" : "bg-red-50 border-red-200 text-red-800"
          }`}>
              <AlertTriangle className="w-5 h-5 mr-3 flex-shrink-0 mt-1" />
              <div className="flex-1">
                  <h4 className="font-bold">EXTERNAL BREACH ALERT: Ledger Mismatch</h4>
                  <p className="text-sm mb-2">
                      {externalDataStatus.reason}
                  </p>
                  
                  {/* Visual indicators of the monitored collections */}
                  <div className="flex flex-wrap gap-2 mb-2">
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-bold ${isDark ? "bg-red-800/50 text-red-200 border border-red-700" : "bg-red-100 text-red-800 border border-red-200"}`}>
                        <Database className="w-3 h-3 mr-1"/> Point Transactions
                      </span>
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-bold ${isDark ? "bg-red-800/50 text-red-200 border border-red-700" : "bg-red-100 text-red-800 border border-red-200"}`}>
                        <Recycle className="w-3 h-3 mr-1"/> Waste Submissions
                      </span>
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-bold ${isDark ? "bg-red-800/50 text-red-200 border border-red-700" : "bg-red-100 text-red-800 border border-red-200"}`}>
                        <Gift className="w-3 h-3 mr-1"/> Redemptions
                      </span>
                  </div>

                  <p className="text-xs font-mono mt-1 opacity-70 break-all">
                      Immutable Ledger Total: {externalDataStatus.ledgerTotal} | External DB Total: {externalDataStatus.transactionsTotal}
                  </p>
              </div>
          </div>
      )}

      {/* Search Bar */}
      <div className="mb-4 relative">
          <input
              type="text"
              placeholder="Search by Hash, Index, or User ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full py-2 pl-10 pr-4 border rounded-lg ${isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
          />
          <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className={`w-8 h-8 animate-spin ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`} />
          <span className={`ml-3 text-lg ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Loading Ledger...</span>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredBlocks.map((block) => (
            <div 
              key={block.id} 
              className={`p-3 sm:p-4 rounded-xl shadow-sm border overflow-hidden ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}
            >
              <div className="flex justify-between items-start gap-2 min-w-0">
                  <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
                      <div className={`font-bold w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-indigo-900/50 text-indigo-300' : 'bg-indigo-50 text-indigo-700'}`}>
                          <Box className='w-4 h-4 sm:w-5 sm:h-5'/>
                      </div>
                      <div className="min-w-0 flex-1">
                          <div className={`font-semibold text-sm sm:text-base truncate ${isDark ? 'text-white' : 'text-gray-800'}`}>
                              Block #{block.index} - {block.actionType}
                          </div>
                          <div className={`text-xs sm:text-sm mt-1 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            <span className="flex items-center gap-1 min-w-0">
                                <User className="w-3 h-3 shrink-0" />
                                <span className="truncate">{block.userId}</span>
                            </span>
                            <span className="flex items-center gap-1 shrink-0">
                                <Clock className="w-3 h-3 shrink-0" /> {formatTimestamp(block.timestamp)}
                            </span>
                          </div>
                      </div>
                  </div>

                  <div className="text-right flex flex-col items-end shrink-0">
                      <div className={`font-bold text-base sm:text-xl ${block.points > 0 ? 'text-green-500' : block.points < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                          {block.points > 0 ? `+${block.points}` : block.points} Pts
                      </div>
                      <span className={`text-xs mt-1 px-2 py-0.5 rounded ${block.isValid === false ? 'bg-red-500 text-white' : isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                          {block.isValid === false ? 'INVALID' : 'VALID'}
                      </span>
                  </div>
              </div>

              {/* Hash Details */}
              <div className={`mt-3 pt-3 border-t overflow-hidden ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
                  <div className="text-xs mb-1 overflow-hidden">
                      <span className={`font-semibold ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Hash:</span>
                      <code className={`block break-all font-mono text-[11px] ${isDark ? "text-indigo-300" : "text-indigo-600"}`}>
                          {block.hash}
                      </code>
                  </div>
                  <div className="text-xs mb-3 overflow-hidden">
                      <span className={`font-semibold ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Previous Hash:</span>
                      <code className={`block break-all font-mono text-[11px] ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                          {block.prevHash}
                      </code>
                  </div>
              </div>

              {/* Metadata Toggle */}
              <button
                onClick={() => setExpandedBlock(expandedBlock === block.id ? null : block.id)}
                className={`text-xs font-medium mt-2 px-3 py-1 rounded-full border flex items-center gap-1 transition-colors ${
                    isDark 
                    ? "border-gray-700 text-gray-200 hover:bg-gray-700/50" 
                    : "border-gray-100 text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}
              >
                {expandedBlock === block.id ? (
                  <>Hide Metadata <ChevronUp className="w-3 h-3" /></>
                ) : (
                  <>View Metadata <ChevronDown className="w-3 h-3" /></>
                )}
              </button>

              {/* Metadata Dropdown */}
              {expandedBlock === block.id && block.metadata && (
                  <div className="mt-2">
                      {/* Explanation for initial status on submission blocks */}
                      {(block.actionType === 'WASTE_SUBMITTED' || block.actionType === 'REWARD_REDEEMED') && (
                          <div className={`p-3 mb-2 rounded-lg border-l-4 animate-in slide-in-from-top-2 fade-in ${isDark ? "bg-yellow-900/20 border-yellow-500 text-yellow-300" : "bg-yellow-50 border-yellow-500 text-yellow-800"}`}>
                              <p className="text-sm font-semibold flex items-center gap-2">
                                  <Info className="w-4 h-4" />
                                  Note on Status in Metadata
                              </p>
                              <p className="text-xs mt-1">
                                  This block records an **immutable snapshot** of the submission's state (*e.g., `pending_approval`*) **at the moment of creation**. The subsequent approval/confirmation is recorded in a **later block** (the points transaction block) and in the live database, but this original record in the chain cannot be altered.
                              </p>
                          </div>
                      )}

                      {/* Existing Metadata Display */}
                      <div className={`p-3 rounded-lg grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs border animate-in slide-in-from-top-2 fade-in ${
                        isDark ? "bg-black/20 border-gray-700" : "bg-gray-50 border-gray-100"
                      }`}>
                          {Object.entries(block.metadata).map(([key, value]) => (
                            <div key={key} className={`px-2 py-1 rounded truncate ${isDark ? "bg-gray-700/50" : "bg-white border border-gray-100"}`}>
                               <span className={`mr-1 capitalize ${isDark ? "text-gray-400" : "text-gray-500"}`}>{key}:</span>
                               <strong className={`${isDark ? "text-white" : "text-gray-800"}`}>{String(value)}</strong>
                            </div>
                          ))}
                      </div>
                  </div>
              )}
            </div>
          ))}
          {!loading && filteredBlocks.length === 0 && (
              <p className={`text-center py-10 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>No matching blocks found.</p>
          )}
        </div>
      )}

      {/* NEW: Educational Info Box */}
      <div className={`mt-8 p-6 rounded-xl border-l-4 ${
        isDark ? "bg-blue-900/20 border-blue-500 text-blue-300" : "bg-blue-50 border-blue-500 text-blue-800"
      }`}>
        <h4 className="font-bold mb-2 flex items-center gap-2">
          <Info className="w-5 h-5" />
          Understanding the Immutable Ledger
        </h4>
        <p className={`text-sm mb-2 ${isDark ? "text-blue-200" : "text-blue-700"}`}>
          This ledger uses blockchain technology to create a permanent, tamper-proof record of all waste reward transactions. 
          Each block is cryptographically linked to the previous one, making it impossible to alter historical data without detection.
        </p>
        <p className={`text-sm ${isDark ? "text-blue-200" : "text-blue-700"}`}>
          This ensures transparency and builds trust in the waste management reward system, directly supporting SDG 16 
          (Strong Institutions) by preventing corruption and ensuring accountability.
        </p>
      </div>
    </div>
  );
};

export default LedgerTab;