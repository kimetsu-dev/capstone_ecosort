// src/pages/AdminPanel/LedgerTab.js - ENHANCED VERSION

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { db } from '../../firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { 
  ShieldCheck, AlertTriangle, Link as LinkIcon, Hash, Clock, User, 
  Loader2, Search, Box, ChevronDown, ChevronUp, RotateCw, Database,
  Recycle, Gift, Info, CheckCircle2, ShieldAlert, TrendingUp
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
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
  const [txPointsTamperStatus, setTxPointsTamperStatus] = useState(null);
  
  const PAGE_SIZE = 25;
  const [currentPage, setCurrentPage] = useState(1);
  
  const [impactMetrics, setImpactMetrics] = useState({
    totalBlocks: 0,
    totalPointsTracked: 0,
    oldestBlock: null,
    newestBlock: null
  });

  // Refs to prevent race conditions during bulk repair updates
  const verificationCounter = useRef(0);
  const verificationTimeout = useRef(null);

  const formatTimestamp = (timestamp) => {
    if (timestamp?.toDate) {
        return timestamp.toDate().toLocaleString();
    }
    return new Date(timestamp).toLocaleString();
  };

  // Debounced verification to handle rapid bulk updates from repairChain()
  const runVerification = useCallback((immediate = false) => {
    // Clear any pending verification
    if (verificationTimeout.current) {
        clearTimeout(verificationTimeout.current);
    }

    const executeVerification = async () => {
        const currentRequest = ++verificationCounter.current;
        setVerifying(true);
        setIntegrityStatus("Running full integrity checks...");

        try {
            const fullVerification = await runAllIntegrityChecks();

            // ONLY update the UI if this is the most recent verification request
            if (currentRequest === verificationCounter.current) {
                setIsValid(fullVerification.valid);
                setIntegrityStatus(fullVerification.message);
                setChainVerification(fullVerification.chainVerification);
                setExternalDataStatus(fullVerification.dataVerification);
                setTxPointsTamperStatus(fullVerification.txPointsVerification);
                setVerifying(false);
            }
        } catch (error) {
            if (currentRequest === verificationCounter.current) {
                setIsValid(false);
                setIntegrityStatus(`Verification Error: ${error.message}`);
                console.error("Verification failed:", error);
                setVerifying(false);
            }
        }
    };

    if (immediate) {
        executeVerification();
    } else {
        // Wait 1 second after the last snapshot event before verifying
        verificationTimeout.current = setTimeout(executeVerification, 1000);
    }
  }, []); 

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
    const q = query(collection(db, "ledger"), orderBy("index", "desc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const newBlocks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setBlocks(newBlocks);
        calculateImpactMetrics(newBlocks);
        setLoading(false);
        // Call with immediate=false so it debounces during repairs
        runVerification(false);
    }, (error) => {
        console.error("Error fetching ledger blocks:", error);
        setIntegrityStatus("Error loading blocks.");
        setLoading(false);
    });

    return () => unsubscribe();
  }, [runVerification, calculateImpactMetrics]);

  const filteredBlocks = blocks.filter(block => 
    String(block.index).includes(searchTerm) ||
    block.hash.includes(searchTerm) ||
    block.prevHash.includes(searchTerm) ||
    (block.userId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (block.actionType || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSearchChange = (val) => {
    setSearchTerm(val);
    setCurrentPage(1);
  };

  const invalidBlockIndices = new Set(chainVerification?.invalidBlocks ?? []);

  // Build a set of blockIds that have tampered points (for per-row highlighting)
  const tamperedPointsBlockIds = new Set(
    (txPointsTamperStatus?.tampered ?? []).map(e => e.blockId)
  );
  // Also index tampered entries by blockId for quick tooltip/detail lookup
  const tamperedPointsMap = Object.fromEntries(
    (txPointsTamperStatus?.tampered ?? []).map(e => [e.blockId, e])
  );

  const totalPages = Math.max(1, Math.ceil(filteredBlocks.length / PAGE_SIZE));
  const paginatedBlocks = filteredBlocks.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  return (
    <div className="p-3 sm:p-6 w-full overflow-hidden">
      {/* Header with Educational Toggles */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-3">
        <h1 className={`text-2xl sm:text-3xl font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
          Immutable Ledger
        </h1>
        
      </div>

      {/* Ledger Impact Metrics */}
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
                              <div className={`text-xs flex items-center gap-2 flex-wrap ${isDark ? 'text-red-300' : 'text-red-700'}`}>
                                  <LinkIcon className="w-3 h-3" /> 
                                  Ledger Chain Broken at Blocks: {chainVerification.invalidBlocks.join(', ')}
                                  {chainVerification.invalidBlocks.length > 0 && (() => {
                                    const firstBroken = Math.min(...chainVerification.invalidBlocks);
                                    const posInFiltered = filteredBlocks.findIndex(b => b.index === firstBroken);
                                    if (posInFiltered === -1) return null;
                                    const targetPage = Math.ceil((posInFiltered + 1) / PAGE_SIZE);
                                    return (
                                      <button
                                        onClick={() => setCurrentPage(targetPage)}
                                        className={`ml-1 underline font-bold text-xs ${isDark ? 'text-red-200 hover:text-white' : 'text-red-800 hover:text-red-900'}`}
                                      >
                                        → Jump to Block #{firstBroken}
                                      </button>
                                    );
                                  })()}
                              </div>
                          )}
                          {externalDataStatus && !externalDataStatus.valid && (
                              <div className={`text-xs flex items-center gap-2 ${isDark ? 'text-red-300' : 'text-red-700'}`}>
                                  <Database className="w-3 h-3" /> 
                                  External Data Check Failed: {externalDataStatus.reason}
                              </div>
                          )}
                          {txPointsTamperStatus && !txPointsTamperStatus.valid && (
                              <div className={`text-xs flex items-center gap-2 ${isDark ? 'text-red-300' : 'text-red-700'}`}>
                                  <ShieldAlert className="w-3 h-3" /> 
                                  Transaction Points Tampered: {txPointsTamperStatus.tampered?.length ?? 0} block(s) affected. Go to Integrity Verification tab to restore.
                              </div>
                          )}
                      </div>
                  )}
              </div>
              <button
                onClick={() => runVerification(true)}
                disabled={verifying}
                className={`flex-shrink-0 flex items-center px-3 py-1 text-xs rounded-full font-semibold transition-colors ${
                  isDark ? 'bg-indigo-700 hover:bg-indigo-800 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                } disabled:opacity-50`}
              >
                {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCw className="w-4 h-4" />}
              </button>
          </div>
      </div>

      {/* External Data Integrity Alert */}
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

      {/* Transaction Points Tamper Banner — compact, links to Integrity Verification tab for recovery */}
      {txPointsTamperStatus && !txPointsTamperStatus.valid && !txPointsTamperStatus.skipped && (
        <div className={`flex items-start p-4 mb-6 rounded-xl border animate-in slide-in-from-top-2 fade-in ${
          isDark ? "bg-red-900/30 border-red-700 text-red-300" : "bg-red-50 border-red-200 text-red-800"
        }`}>
          <ShieldAlert className="w-5 h-5 mr-3 flex-shrink-0 mt-1" />
          <div className="flex-1">
            <h4 className="font-bold">POINTS INTEGRITY ALERT: Tampered Transaction Values</h4>
            <p className="text-sm mt-1 mb-2">{txPointsTamperStatus.reason}</p>
            <div className="space-y-1">
              {txPointsTamperStatus.tampered?.map(entry => (
                <div key={entry.blockId} className={`text-xs font-mono ${isDark ? 'text-red-200' : 'text-red-700'}`}>
                  Block #{entry.blockIndex} · {entry.actionType} · User: {entry.userId}
                  {entry.issue === 'POINTS_MISMATCH' && (
                    <span className="ml-2">
                      Sealed: <strong>{entry.sealedPoints} pts</strong> → Live: <strong className="text-red-500">{entry.livePoints} pts</strong>
                    </span>
                  )}
                  {entry.issue === 'TRANSACTION_DELETED' && (
                    <span className="ml-2 text-orange-400">Transaction document deleted</span>
                  )}
                </div>
              ))}
            </div>
            <p className={`text-xs mt-2 font-semibold ${isDark ? 'text-red-300' : 'text-red-700'}`}>
              → Go to the <strong>Integrity Verification</strong> tab to restore the correct values and fix the user balance.
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
              onChange={(e) => handleSearchChange(e.target.value)}
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
          {filteredBlocks.length > 0 && (
            <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              <span>
                Showing blocks {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, filteredBlocks.length)} of <strong>{filteredBlocks.length}</strong> total
                {invalidBlockIndices.size > 0 && (
                  <span className="ml-2 text-red-500 font-semibold">
                    · ⚠ {invalidBlockIndices.size} broken block{invalidBlockIndices.size > 1 ? 's' : ''}: #{[...invalidBlockIndices].sort((a,b)=>a-b).join(', #')}
                  </span>
                )}
                {tamperedPointsBlockIds.size > 0 && (
                  <span className="ml-2 text-orange-500 font-semibold">
                    · 🔢 {tamperedPointsBlockIds.size} tampered point value{tamperedPointsBlockIds.size > 1 ? 's' : ''}
                  </span>
                )}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-40 ${isDark ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-100'}`}
                >← Prev</button>
                <span className="text-xs">Page {currentPage} / {totalPages}</span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-40 ${isDark ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-100'}`}
                >Next →</button>
              </div>
            </div>
          )}

          {paginatedBlocks.map((block) => {
            const isBroken = invalidBlockIndices.has(block.index);
            const hasTamperedPoints = tamperedPointsBlockIds.has(block.id);
            const tamperedEntry = tamperedPointsMap[block.id];
            return (
            <div 
              key={block.id} 
              className={`p-3 sm:p-4 rounded-xl shadow-sm border overflow-hidden transition-colors ${
                isBroken
                  ? isDark ? 'bg-red-900/30 border-red-600 ring-1 ring-red-500' : 'bg-red-50 border-red-400 ring-1 ring-red-400'
                  : hasTamperedPoints
                    ? isDark ? 'bg-orange-900/30 border-orange-600 ring-1 ring-orange-500' : 'bg-orange-50 border-orange-400 ring-1 ring-orange-400'
                    : isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'
              }`}
            >
              {isBroken && (
                <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-lg text-xs font-bold ${isDark ? 'bg-red-800/50 text-red-200' : 'bg-red-100 text-red-700'}`}>
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  BROKEN / COMPROMISED — Hash chain is broken at this block. Run Repair Chain in the Integrity Verification tab.
                </div>
              )}

              {/* Tampered points warning banner (orange, separate from hash-broken red) */}
              {hasTamperedPoints && !isBroken && (
                <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-lg text-xs font-bold ${isDark ? 'bg-orange-800/50 text-orange-200' : 'bg-orange-100 text-orange-800'}`}>
                  <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" />
                  POINTS TAMPERED — Live transaction points differ from sealed ledger value.
                  {tamperedEntry?.issue === 'POINTS_MISMATCH' && (
                    <span className="ml-1 font-mono">
                      Sealed: {tamperedEntry.sealedPoints} pts · Live: {tamperedEntry.livePoints} pts
                    </span>
                  )}
                  {tamperedEntry?.issue === 'TRANSACTION_DELETED' && (
                    <span className="ml-1">Linked transaction document was deleted.</span>
                  )}
                  &nbsp;→ Restore in Blockchain tab.
                </div>
              )}

              <div className="flex justify-between items-start gap-2 min-w-0">
                  <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
                      <div className={`font-bold w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isBroken
                          ? isDark ? 'bg-red-800/60 text-red-300' : 'bg-red-200 text-red-700'
                          : hasTamperedPoints
                            ? isDark ? 'bg-orange-800/60 text-orange-300' : 'bg-orange-200 text-orange-700'
                            : isDark ? 'bg-indigo-900/50 text-indigo-300' : 'bg-indigo-50 text-indigo-700'
                      }`}>
                          <Box className='w-4 h-4 sm:w-5 sm:h-5'/>
                      </div>
                      <div className="min-w-0 flex-1">
                          <div className={`font-semibold text-sm sm:text-base truncate ${
                            isBroken
                              ? isDark ? 'text-red-300' : 'text-red-700'
                              : hasTamperedPoints
                                ? isDark ? 'text-orange-300' : 'text-orange-700'
                                : isDark ? 'text-white' : 'text-gray-800'
                          }`}>
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
                      {/* Show both sealed and live values when tampered */}
                      {hasTamperedPoints && tamperedEntry?.issue === 'POINTS_MISMATCH' ? (
                        <div className="text-right">
                          <div className={`font-bold text-base sm:text-xl line-through opacity-60 ${isDark ? 'text-orange-400' : 'text-orange-600'}`}>
                            {tamperedEntry.livePoints > 0 ? `+${tamperedEntry.livePoints}` : tamperedEntry.livePoints} Pts
                          </div>
                          <div className={`font-bold text-sm ${isDark ? 'text-green-400' : 'text-green-700'}`}>
                            Sealed: {tamperedEntry.sealedPoints > 0 ? `+${tamperedEntry.sealedPoints}` : tamperedEntry.sealedPoints} Pts
                          </div>
                        </div>
                      ) : (
                        <div className={`font-bold text-base sm:text-xl ${block.points > 0 ? 'text-green-500' : block.points < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                            {block.points > 0 ? `+${block.points}` : block.points} Pts
                        </div>
                      )}
                      <span className={`text-xs mt-1 px-2 py-0.5 rounded ${
                        isBroken || block.isValid === false
                          ? 'bg-red-500 text-white'
                          : hasTamperedPoints
                            ? 'bg-orange-500 text-white'
                            : isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'
                      }`}>
                          {isBroken || block.isValid === false
                            ? 'INVALID'
                            : hasTamperedPoints
                              ? 'TAMPERED'
                              : 'VALID'}
                      </span>
                  </div>
              </div>

              <div className={`mt-3 pt-3 border-t overflow-hidden ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
                  <div className="text-xs mb-1 overflow-hidden">
                      <span className={`font-semibold ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Hash:</span>
                      <code className={`block break-all font-mono text-[11px] ${isBroken ? isDark ? 'text-red-300' : 'text-red-600' : isDark ? "text-indigo-300" : "text-indigo-600"}`}>
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

              {expandedBlock === block.id && block.metadata && (
                  <div className="mt-2">
                      {(block.actionType === 'WASTE_SUBMIT' || block.actionType === 'REWARD_REDEEMED') && (
                          <div className={`p-3 mb-2 rounded-lg border-l-4 animate-in slide-in-from-top-2 fade-in ${isDark ? "bg-yellow-900/20 border-yellow-500 text-yellow-300" : "bg-yellow-50 border-yellow-500 text-yellow-800"}`}>
                              <p className="text-sm font-semibold flex items-center gap-2">
                                  <Info className="w-4 h-4" />
                                  Note on Status in Metadata
                              </p>
                              <p className="text-xs mt-1">
                                  This block records an immutable snapshot of the submission's state at the moment of creation. The subsequent approval/confirmation is recorded in a later block and in the live database, but this original record cannot be altered.
                              </p>
                          </div>
                      )}
                      <div className={`p-3 rounded-lg grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs border animate-in slide-in-from-top-2 fade-in ${
                        isDark ? "bg-black/20 border-gray-700" : "bg-gray-50 border-gray-100"
                      }`}>
                          {Object.entries(block.metadata).map(([key, value]) => (
                            <div
                              key={key}
                              className={`px-2 py-1 rounded truncate ${
                                key === 'txPoints'
                                  ? isDark ? 'bg-green-900/40 border border-green-700' : 'bg-green-50 border border-green-200'
                                  : isDark ? "bg-gray-700/50" : "bg-white border border-gray-100"
                              }`}
                            >
                               <span className={`mr-1 capitalize ${
                                 key === 'txPoints'
                                   ? isDark ? 'text-green-400' : 'text-green-700'
                                   : isDark ? "text-gray-400" : "text-gray-500"
                               }`}>{key}:</span>
                               <strong className={`${
                                 key === 'txPoints'
                                   ? isDark ? 'text-green-300' : 'text-green-800'
                                   : isDark ? "text-white" : "text-gray-800"
                               }`}>{String(value)}</strong>
                               {key === 'txPoints' && (
                                 <span className={`ml-1 text-[10px] ${isDark ? 'text-green-500' : 'text-green-600'}`}>🔒</span>
                               )}
                            </div>
                          ))}
                      </div>
                  </div>
              )}
            </div>
            );
          })}

          {totalPages > 1 && (
            <div className={`flex items-center justify-center gap-3 pt-2 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-40 ${isDark ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-100'}`}
              >« First</button>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-40 ${isDark ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-100'}`}
              >← Prev</button>
              <span className="text-xs">Page {currentPage} / {totalPages}</span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-40 ${isDark ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-100'}`}
              >Next →</button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-40 ${isDark ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-100'}`}
              >Last »</button>
            </div>
          )}

          {!loading && filteredBlocks.length === 0 && (
              <p className={`text-center py-10 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>No matching blocks found.</p>
          )}
        </div>
      )}

    </div>
  );
};

export default LedgerTab;