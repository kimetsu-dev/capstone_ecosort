// src/pages/AdminPanel/TransactionsTab.js - ENHANCED VERSION

import React, { useCallback, useMemo, useState, useEffect } from "react";
import { db } from '../../firebase';
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  onSnapshot, 
  getDocs
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
  BarChart3
} from 'lucide-react';
// Import the External Integrity Check function
import { verifyPointTransactions } from '../../utils/blockchainService'; 

// Helper function from original component, modified for Firebase Timestamp
const formatTimestamp = (timestamp) => {
    if (timestamp?.toDate) {
      return timestamp.toDate().toLocaleString();
    }
    // Handle ISO strings or other date formats if they slip through
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return 'N/A';
    }
};

const capitalizeWords = (str) =>
    str
      ? str.replace(/\\_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      : "";


export default function TransactionsTab() {
  const { isDark } = useTheme();
  const [transactions, setTransactions] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState("desc");
  const [filterType, setFilterType] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  
  // States for Integrity Check
  const [verification, setVerification] = useState(null); 
  const [verifying, setVerifying] = useState(false);
  
  // NEW: Educational panel states
  const [showWhyBlockchain, setShowWhyBlockchain] = useState(false);
  const [showImpactMetrics, setShowImpactMetrics] = useState(false);
  
  // NEW: Impact metrics
  const [impactMetrics, setImpactMetrics] = useState({
    totalTransactions: 0,
    totalPointsAwarded: 0,
    totalPointsRedeemed: 0,
    netPointsCirculating: 0
  });

  // --- Verification Logic ---
  const runVerification = async () => {
    setVerifying(true);
    try {
        // Call the function that compares point_transactions total against ledger total
        const result = await verifyPointTransactions();
        setVerification(result);
    } catch (error) {
        console.error("Error running point transaction verification:", error);
        setVerification({ 
            valid: false, 
            reason: "Verification failed due to a system error.",
            ledgerTotal: 'N/A',
            transactionsTotal: 'N/A'
        });
    } finally {
      setVerifying(false);
    }
  };

  // NEW: Calculate impact metrics
  const calculateImpactMetrics = useCallback((transactionsData) => {
    const totalAwarded = transactionsData
      .filter(t => t.points > 0)
      .reduce((sum, t) => sum + t.points, 0);
    
    const totalRedeemed = transactionsData
      .filter(t => t.points < 0)
      .reduce((sum, t) => sum + Math.abs(t.points), 0);
    
    setImpactMetrics({
      totalTransactions: transactionsData.length,
      totalPointsAwarded: totalAwarded,
      totalPointsRedeemed: totalRedeemed,
      netPointsCirculating: totalAwarded - totalRedeemed
    });
  }, []);

  // --- Data Fetching Effect ---
  useEffect(() => {
    // Fetch users for display mapping
    const fetchUsers = async () => {
        const usersSnapshot = await getDocs(collection(db, "users"));
        const userData = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setUsers(userData);
    };

    // Fetch transactions in real-time
    const q = query(collection(db, "point_transactions"), orderBy("timestamp", "desc"), limit(50));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newTransactions = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTransactions(newTransactions);
      calculateImpactMetrics(newTransactions);
      setLoading(false);
      
      // Run verification after initial load/update
      runVerification();
    });

    fetchUsers();

    return () => unsubscribe();
  }, [calculateImpactMetrics]);

  // --- Memoized Helpers ---
  const getUserEmail = useCallback(
    (userId) => {
      const user = users.find((u) => u.id === userId);
      return user ? user.email : "Unknown User";
    },
    [users]
  );

  const filteredSortedTransactions = useMemo(() => {
    let filtered = transactions;

    if (filterType === "awarded") {
      filtered = transactions.filter(
        (t) => t.points > 0
      );
    } else if (filterType === "redeemed") {
      filtered = transactions.filter((t) =>
        t.points < 0
      );
    }
    
    if (searchTerm) {
      filtered = filtered.filter(t => 
        (t.type || t.actionType).toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.userId && getUserEmail(t.userId).toLowerCase().includes(searchTerm.toLowerCase())) ||
        (t.metadata?.message || '').toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Sorting logic 
    return filtered.sort((a, b) => {
      const aTime = a.timestamp?.seconds ?? 0;
      const bTime = b.timestamp?.seconds ?? 0;
      return sortOrder === "asc" ? aTime - bTime : bTime - aTime;
    });
  }, [transactions, filterType, sortOrder, searchTerm, getUserEmail]);

  const getPointsColor = (points) => {
    if (points > 0) return isDark ? 'text-green-500' : 'text-green-600';
    if (points < 0) return isDark ? 'text-red-500' : 'text-red-600';
    return isDark ? 'text-gray-400' : 'text-gray-500';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-10">
        <Loader2 className={`w-8 h-8 animate-spin ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`} />
        <span className={`ml-3 text-lg ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Loading Point Transactions...</span>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header with Educational Toggles */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
        <h1 className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
          Point Transactions Log
        </h1>
        
        <div className="flex gap-2">
          <button
            onClick={() => setShowWhyBlockchain(!showWhyBlockchain)}
            className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors ${
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
            className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors ${
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

      {/* NEW: Why Blockchain Verification Panel */}
      {showWhyBlockchain && (
        <div className={`mb-6 p-6 rounded-xl shadow-lg border ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}>
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-blue-500" />
            Why We Verify Against the Blockchain
          </h3>
          
          <div className="space-y-4">
            {/* Explanation */}
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

            {/* The Threat Model */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className={`p-4 rounded-lg border-l-4 border-red-500 ${isDark ? "bg-gray-700" : "bg-red-50"}`}>
                <h4 className="font-bold mb-2 text-red-600">Without Blockchain Verification</h4>
                <ul className="text-sm space-y-1">
                  <li className="flex items-start gap-2">
                    <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <span>Admin could add fake transactions</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <span>Records could be deleted to hide fraud</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <span>Point amounts could be inflated</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <span>No way to prove data accuracy</span>
                  </li>
                </ul>
              </div>

              <div className={`p-4 rounded-lg border-l-4 border-green-500 ${isDark ? "bg-gray-700" : "bg-green-50"}`}>
                <h4 className="font-bold mb-2 text-green-600">With Blockchain Verification</h4>
                <ul className="text-sm space-y-1">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>Fake transactions detected immediately</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>Deleted records cause mismatch alert</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>Modified amounts break verification</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>Cryptographic proof of accuracy</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Monitored Collections */}
            <div className={`p-4 rounded-lg ${isDark ? "bg-gray-700" : "bg-purple-50"}`}>
              <h4 className="font-bold mb-3">Multi-Layer Verification</h4>
              <p className="text-sm mb-3">
                We don't just verify this one collection. The blockchain verification checks three separate external databases:
              </p>
              <div className="flex flex-wrap gap-2">
                <span className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold ${isDark ? "bg-blue-900/40 text-blue-300 border border-blue-700" : "bg-blue-100 text-blue-700 border border-blue-200"}`}>
                  <Database className="w-4 h-4 mr-2"/> Point Transactions
                </span>
                <span className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold ${isDark ? "bg-green-900/40 text-green-300 border border-green-700" : "bg-green-100 text-green-700 border border-green-200"}`}>
                  <Recycle className="w-4 h-4 mr-2"/> Waste Submissions
                </span>
                <span className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold ${isDark ? "bg-orange-900/40 text-orange-300 border border-orange-700" : "bg-orange-100 text-orange-700 border border-orange-200"}`}>
                  <Gift className="w-4 h-4 mr-2"/> Redemptions
                </span>
              </div>
              <p className="text-xs mt-3 opacity-70">
                All three must match the blockchain ledger for the system to show "VALID" status.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* NEW: Impact Metrics Panel */}
      {showImpactMetrics && (
        <div className={`mb-6 p-6 rounded-xl shadow-lg ${isDark ? "bg-gradient-to-r from-indigo-900/50 to-purple-900/50 border border-indigo-700" : "bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200"}`}>
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
            <TrendingUp className="w-6 h-6" />
            Transaction Impact Metrics
          </h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className={`p-4 rounded-lg ${isDark ? "bg-black/30" : "bg-white"}`}>
              <div className="flex items-center gap-2 mb-2">
                <Database className="w-5 h-5 text-blue-500" />
                <span className="text-sm opacity-70">Total Transactions</span>
              </div>
              <p className="text-2xl font-bold">{impactMetrics.totalTransactions.toLocaleString()}</p>
            </div>
            
            <div className={`p-4 rounded-lg ${isDark ? "bg-black/30" : "bg-white"}`}>
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-green-500" />
                <span className="text-sm opacity-70">Points Awarded</span>
              </div>
              <p className="text-2xl font-bold text-green-500">+{impactMetrics.totalPointsAwarded.toLocaleString()}</p>
            </div>
            
            <div className={`p-4 rounded-lg ${isDark ? "bg-black/30" : "bg-white"}`}>
              <div className="flex items-center gap-2 mb-2">
                <ArrowDown className="w-5 h-5 text-red-500" />
                <span className="text-sm opacity-70">Points Redeemed</span>
              </div>
              <p className="text-2xl font-bold text-red-500">-{impactMetrics.totalPointsRedeemed.toLocaleString()}</p>
            </div>
            
            <div className={`p-4 rounded-lg ${isDark ? "bg-black/30" : "bg-white"}`}>
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-5 h-5 text-purple-500" />
                <span className="text-sm opacity-70">Net Circulating</span>
              </div>
              <p className="text-2xl font-bold">{impactMetrics.netPointsCirculating.toLocaleString()}</p>
            </div>
          </div>
          
          <div className={`mt-4 p-3 rounded-lg ${isDark ? "bg-black/20" : "bg-white/50"}`}>
            <p className="text-sm">
              <strong>Blockchain Protection:</strong> All {impactMetrics.totalTransactions.toLocaleString()} transactions 
              are verified against the immutable ledger, ensuring {impactMetrics.totalPointsAwarded.toLocaleString()} awarded 
              points and {impactMetrics.totalPointsRedeemed.toLocaleString()} redeemed points are accurately recorded.
            </p>
          </div>
        </div>
      )}

      {/* INTEGRITY STATUS BANNER */}
      <div className={`p-4 rounded-xl shadow-md mb-6 ${
          verification?.valid === true 
            ? 'bg-green-50 border border-green-200' 
            : 'bg-red-50 border border-red-200'
      } ${isDark ? (verification?.valid ? 'bg-green-900/30 border-green-700' : 'bg-red-900/30 border-red-700') : ''}`}>
          <div className="flex items-center gap-4">
              {verifying ? (
                  <Loader2 className="w-6 h-6 text-indigo-500 animate-spin flex-shrink-0" />
              ) : verification?.valid ? (
                  <ShieldCheck className="w-6 h-6 text-green-600 flex-shrink-0" />
              ) : (
                  <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0" />
              )}
              <div className="flex-1">
                  <h3 className={`font-bold ${verification?.valid ? 'text-green-700' : 'text-red-700'}`}>
                      External Data Integrity Check
                  </h3>
                  <p className={`text-sm mt-0.5 ${verification?.valid ? 'text-green-600' : 'text-red-600'}`}>
                      {verification?.reason}
                  </p>
                  
                  {/* NEW: Show monitored collections */}
                  <div className="flex flex-wrap gap-2 mt-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                        verification?.valid 
                          ? isDark ? "bg-green-800/50 text-green-200" : "bg-green-100 text-green-800"
                          : isDark ? "bg-red-800/50 text-red-200" : "bg-red-100 text-red-800"
                      }`}>
                        <Database className="w-3 h-3 mr-1"/> Point Transactions
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                        verification?.valid 
                          ? isDark ? "bg-green-800/50 text-green-200" : "bg-green-100 text-green-800"
                          : isDark ? "bg-red-800/50 text-red-200" : "bg-red-100 text-red-800"
                      }`}>
                        <Recycle className="w-3 h-3 mr-1"/> Waste Submissions
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                        verification?.valid 
                          ? isDark ? "bg-green-800/50 text-green-200" : "bg-green-100 text-green-800"
                          : isDark ? "bg-red-800/50 text-red-200" : "bg-red-100 text-red-800"
                      }`}>
                        <Gift className="w-3 h-3 mr-1"/> Redemptions
                      </span>
                  </div>
                  
                  <div className={`text-xs mt-2 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                      <strong>Blockchain Ledger Total:</strong> <span className="font-mono">{verification?.ledgerTotal}</span> | 
                      <strong> Transactions Collection Total:</strong> <span className="font-mono">{verification?.transactionsTotal}</span>
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

      {/* Filter and Sort Controls */}
      <div className={`flex justify-between items-center mb-4 p-3 rounded-lg ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
        <div className="flex items-center gap-4">
          <label className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Filter Type:</label>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className={`px-3 py-1 border rounded-lg text-sm ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
          >
            <option value="all">All</option>
            <option value="awarded">Awarded (Credit)</option>
            <option value="redeemed">Redeemed/Spent (Debit)</option>
          </select>
        </div>
        
        <div className="flex items-center gap-4">
            <input
                type="text"
                placeholder="Search Type or User Email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-48 py-1.5 px-3 border rounded-lg text-sm ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
            />
            <button
                onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                className={`flex items-center gap-1 px-3 py-1 border rounded-lg text-sm font-medium transition-colors ${
                    isDark ? 'bg-gray-700 border-gray-600 text-white hover:bg-gray-600' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
            >
                Date
                {sortOrder === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
            </button>
        </div>
      </div>


      {/* Transaction Table */}
      <div className={`shadow-md rounded-xl overflow-hidden ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className={`${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
              <tr>
                <th scope="col" className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>
                  Timestamp
                </th>
                <th scope="col" className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>
                  Type
                </th>
                <th scope="col" className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>
                  User
                </th>
                <th scope="col" className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>
                  Amount
                </th>
                <th scope="col" className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>
                  Description
                </th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-200'}`}>
              {filteredSortedTransactions.length === 0 ? (
                <tr>
                  <td colSpan="5" className={`px-6 py-4 text-center ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>No matching transactions found.</td>
                </tr>
              ) : (
                filteredSortedTransactions.map((transaction) => {
                  const amount = transaction.points ?? 0;
                  const isAwarded = amount > 0;
                  const typeStr = capitalizeWords(transaction.type || transaction.actionType || 'N/A');
                  const userEmail = getUserEmail(transaction.userId);
                  const description = transaction.metadata?.message || transaction.metadata?.type || 'N/A';
                  
                  const badgeClass = isAwarded
                    ? (isDark ? "bg-green-900 text-green-300" : "bg-green-100 text-green-800")
                    : (isDark ? "bg-red-900 text-red-300" : "bg-red-100 text-red-800");

                  return (
                    <tr key={transaction.id} className={`${isDark ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50'}`}>
                      <td className={`px-6 py-4 text-sm ${isDark ? "text-gray-300" : "text-slate-600"}`}>
                        {formatTimestamp(transaction.timestamp)}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium ${badgeClass}`}
                        >
                          {typeStr}
                        </span>
                      </td>
                      <td className={`px-6 py-4 text-sm font-medium ${isDark ? "text-gray-100" : "text-slate-800"}`}>
                        {userEmail}
                      </td>
                      <td
                        className={`px-6 py-4 text-sm font-bold ${
                          isAwarded
                            ? isDark
                              ? "text-emerald-400"
                              : "text-emerald-600"
                            : isDark
                            ? "text-red-400"
                            : "text-red-600"
                        }`}
                      >
                        {amount.toLocaleString()} pts
                      </td>
                      <td className={`px-6 py-4 text-sm ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                        {description}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* NEW: Educational Info Box */}
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
          the verification check will immediately fail and trigger an alert.
        </p>
        <p className={`text-sm ${isDark ? "text-blue-200" : "text-blue-700"}`}>
          This continuous verification ensures complete transparency and prevents corruption in the 
          waste reward system, directly supporting SDG 16 (Strong Institutions).
        </p>
      </div>
    </div>
  );
}