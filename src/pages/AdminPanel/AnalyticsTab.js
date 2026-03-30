// ─── AnalyticsTab.js ──────────────────────────────────────────────────────────
// Main Analytics Dashboard — fully responsive from 320 px upward.
// Tabs: Overview · Activity · Community · Rewards · Intelligence
// Full dark-mode support via ThemeContext (isDark).

import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { db } from '../../firebase';
import {
  collection, getDocs, query, orderBy, where, Timestamp,
} from 'firebase/firestore';

import {
  DATE_PRESETS, makeRange, toDate, fmtDay, fmtNum, fmtGrowth, trendSentence,
  fmtKg, kgTrendSentence,
} from './analyticsConstants';

import {
  AreaLineChart, DonutChart, HBarChart,
  DayHeatmap, HourBarChart, ForecastChart, GoalBar, VelocityChart,
  WasteKgChart, KgForecastChart,
} from './analyticsCharts';

import {
  Skeleton, Card, SecHead, KpiCard, ProgressCard,
  AlertCard, SuggestionCard, InsightItem, EmptyState, HealthPill,
} from './analyticsUIComponents';

import { runIntelligenceEngine } from './analyticsIntelligenceEngine';

// ─────────────────────────────────────────────────────────────────────────────
// Tab definitions
// ─────────────────────────────────────────────────────────────────────────────
const TAB_DEFS = [
  { id: 'overview',     label: 'Overview',     icon: '📊' },
  { id: 'activity',     label: 'Activity',     icon: '📈' },
  { id: 'community',    label: 'Community',    icon: '👥' },
  { id: 'rewards',      label: 'Rewards',      icon: '🎁' },
  { id: 'intelligence', label: 'Intelligence', icon: '🧠' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
const AnalyticsTab = () => {
  const { isDark } = useTheme() || {};

  // ── State ──────────────────────────────────────────────────────────────────
  const [loading,           setLoading]           = useState(true);
  const [activePreset,      setActivePreset]      = useState(30);
  const [dateRange,         setDateRange]         = useState(makeRange(30));
  const [activeTab,         setActiveTab]         = useState('overview');
  const [dismissedAlerts,   setDismissedAlerts]   = useState(new Set());
  const [monthlyGoal,       setMonthlyGoal]       = useState(100);
  const [editingGoal,       setEditingGoal]       = useState(false);
  const [goalInput,         setGoalInput]         = useState('100');

  const [kpi,               setKpi]               = useState({});
  const [trendData,         setTrendData]         = useState([]);
  const [kgTrendData,       setKgTrendData]       = useState([]);
  const [kgPredictions,     setKgPredictions]     = useState({});
  const [wasteTypes,        setWasteTypes]        = useState([]);
  const [topUsers,          setTopUsers]          = useState([]);
  const [allUsers,          setAllUsers]          = useState([]);
  const [allRedemptions,    setAllRedemptions]    = useState([]);
  const [rewardTrends,      setRewardTrends]      = useState([]);
  const [rewardPredictions, setRewardPredictions] = useState({ perReward: [], timeline: [], summary: {} });
  const [predictions,       setPredictions]       = useState({});
  const [intelligence,      setIntelligence]      = useState({
    alerts: [], rewardSuggestions: [], scheduleSuggestions: [], insightFeed: [],
    healthScores: {}, retentionStats: {}, dowCounts: Array(7).fill(0), hourCounts: Array(24).fill(0),
  });

  // ── Data loading ───────────────────────────────────────────────────────────
  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const startTs = Timestamp.fromDate(dateRange.start);
      const endTs   = Timestamp.fromDate(dateRange.end);

      let submissions = [];
      try {
        const snap = await getDocs(query(
          collection(db, 'waste_submissions'),
          where('submittedAt', '>=', startTs),
          where('submittedAt', '<=', endTs),
          orderBy('submittedAt', 'asc'),
        ));
        submissions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (indexErr) {
        console.warn('Analytics: composite index not ready, falling back to full scan.', indexErr?.message);
        const snap = await getDocs(collection(db, 'waste_submissions'));
        submissions = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .filter(s => {
            const d = toDate(s.submittedAt || s.createdAt);
            return d && d >= dateRange.start && d <= dateRange.end;
          });
      }

      const usersSnap = await getDocs(collection(db, 'users'));
      const users = usersSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(u => !u.role || u.role === 'resident');
      setAllUsers(users);

      let allRedemptions = [];
      try {
        const snap = await getDocs(collection(db, 'redemptions'));
        allRedemptions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (_) {}
      setAllRedemptions(allRedemptions);
      const redemptionsInRange = allRedemptions.filter(r => {
        const d = toDate(r.redeemedAt || r.createdAt);
        return d && d >= dateRange.start && d <= dateRange.end;
      });

      let reports = [];
      try {
        const snap = await getDocs(collection(db, 'violation_reports'));
        reports = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .filter(r => { const d = toDate(r.submittedAt || r.createdAt); return d && d >= dateRange.start && d <= dateRange.end; });
      } catch (_) {}

      // ── KPIs ───────────────────────────────────────────────────────────────
      const activeIds     = new Set(submissions.map(s => s.userId).filter(Boolean));
      const getSubKg      = s => Number(s.totalWeight || s.weight || s.kg || s.weightKg || 0);
      const totalKg       = submissions.reduce((s, sub) => s + getSubKg(sub), 0);
      const days          = Math.max(1, Math.round((dateRange.end - dateRange.start) / 86400000));
      const hasWeightData = submissions.some(s => getSubKg(s) > 0);

      const computedKpi = {
        totalSubmissions:   submissions.length,
        activeUsersInRange: activeIds.size,
        totalUsers:         users.length,
        avgDaily:           (submissions.length / days).toFixed(1),
        totalRedemptions:   redemptionsInRange.length,
        totalReports:       reports.length,
        totalKg:            hasWeightData ? totalKg.toFixed(1) : null,
        hasWeightData,
      };
      setKpi(computedKpi);

      // ── Trend ─────────────────────────────────────────────────────────────
      const dayMap = {};
      submissions.forEach(s => {
        const d = toDate(s.submittedAt);
        if (!d) return;
        const k = fmtDay(d);
        dayMap[k] = (dayMap[k] || 0) + 1;
      });
      const trend = Array.from({ length: days }, (_, i) => {
        const d = new Date(dateRange.start.getTime() + i * 86400000);
        const k = fmtDay(d);
        return { date: k, submissions: dayMap[k] || 0 };
      });
      let finalTrend = trend;
      if (trend.length > 60) {
        const weekly = [];
        for (let i = 0; i < trend.length; i += 7) {
          const chunk = trend.slice(i, i + 7);
          weekly.push({ date: chunk[0].date, submissions: chunk.reduce((s, c) => s + c.submissions, 0) });
        }
        finalTrend = weekly;
      }
      setTrendData(finalTrend);

      // ── Kg trend ──────────────────────────────────────────────────────────
      const kgDayMap = {};
      submissions.forEach(s => {
        const d = toDate(s.submittedAt);
        if (!d) return;
        const k = fmtDay(d);
        const kg = Number(s.totalWeight || s.weight || s.kg || s.weightKg || 0);
        if (!kgDayMap[k]) kgDayMap[k] = { kg: 0, count: 0 };
        kgDayMap[k].kg    += kg;
        kgDayMap[k].count += 1;
      });
      const kgTrend = Array.from({ length: days }, (_, i) => {
        const d = new Date(dateRange.start.getTime() + i * 86400000);
        const k = fmtDay(d);
        return { date: k, kg: parseFloat((kgDayMap[k]?.kg || 0).toFixed(2)), submissions: kgDayMap[k]?.count || 0 };
      });
      let finalKgTrend = kgTrend;
      if (kgTrend.length > 60) {
        const weekly = [];
        for (let i = 0; i < kgTrend.length; i += 7) {
          const chunk = kgTrend.slice(i, i + 7);
          weekly.push({
            date: chunk[0].date,
            kg: parseFloat(chunk.reduce((s, c) => s + c.kg, 0).toFixed(2)),
            submissions: chunk.reduce((s, c) => s + c.submissions, 0),
          });
        }
        finalKgTrend = weekly;
      }
      setKgTrendData(finalKgTrend);

      // ── Kg forecast ───────────────────────────────────────────────────────
      if (hasWeightData && finalKgTrend.length >= 7) {
        const half         = Math.max(1, Math.floor(finalKgTrend.length / 2));
        const recentKg     = finalKgTrend.slice(-half);
        const olderKg      = finalKgTrend.slice(0, finalKgTrend.length - half);
        const kgBucketDays = kgTrend.length > 60 ? 7 : 1;
        const avgKgBucket  = recentKg.reduce((s, d) => s + d.kg, 0) / recentKg.length;
        const avgKgDay     = avgKgBucket / kgBucketDays;
        const oldAvgKgDay  = olderKg.length
          ? (olderKg.reduce((s, d) => s + d.kg, 0) / olderKg.length) / kgBucketDays
          : avgKgDay;
        const minKgBase    = 0.1;
        const kgGrowth     = oldAvgKgDay >= minKgBase
          ? Math.max(-5, Math.min(5, (avgKgDay - oldAvgKgDay) / oldAvgKgDay))
          : 0;
        const kgDataPoints = finalKgTrend.filter(d => d.kg > 0).length;
        const kgConfidence =
          kgDataPoints >= 14 ? 'High'
          : kgDataPoints >= 7  ? 'Medium'
          : 'Low';
        setKgPredictions({
          nextMonthKg:      Math.max(0, parseFloat((avgKgDay * 30).toFixed(1))),
          avgKgPerDay:      parseFloat(avgKgDay.toFixed(2)),
          kgGrowth,
          kgGrowthRate:     oldAvgKgDay >= minKgBase ? fmtGrowth(kgGrowth) : '—',
          kgTrendSentence:  kgTrendSentence(kgGrowth),
          kgTrendDirection: kgGrowth >= 0 ? 'upward' : 'downward',
          kgConfidence,
          hasEnoughKgBase:  oldAvgKgDay >= minKgBase,
        });
      } else {
        setKgPredictions({});
      }

      // ── Waste types ───────────────────────────────────────────────────────
      const typeMap = {};
      submissions.forEach(s => {
        if (s.items && Array.isArray(s.items) && s.items.length > 0) {
          s.items.forEach(item => {
            const t = item.wasteType || item.type || 'Unknown';
            if (!typeMap[t]) typeMap[t] = { count: 0, kg: 0 };
            typeMap[t].count++;
            typeMap[t].kg += Number(item.weight || 0);
          });
        } else {
          const t = s.type || s.wasteType || s.category || 'Unknown';
          if (!typeMap[t]) typeMap[t] = { count: 0, kg: 0 };
          typeMap[t].count++;
          typeMap[t].kg += getSubKg(s);
        }
      });
      const computedWasteTypes = Object.entries(typeMap)
        .map(([name, v]) => ({ name, value: v.count, kg: parseFloat(v.kg.toFixed(2)) }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8);
      setWasteTypes(computedWasteTypes);

      // ── Top users ─────────────────────────────────────────────────────────
      const computedTopUsers = [...users]
        .filter(u => (u.points || u.totalPoints || 0) > 0)
        .sort((a, b) => (b.points || b.totalPoints || 0) - (a.points || a.totalPoints || 0))
        .slice(0, 10)
        .map(u => ({
          userId:      u.id,
          displayName: u.username || u.displayName || u.name || null,
          totalPoints: u.points || u.totalPoints || 0,
          createdAt:   u.createdAt || u.joinedAt || null,
        }));
      setTopUsers(computedTopUsers);

      // ── Reward trends ─────────────────────────────────────────────────────
      const rewardMap = {};
      allRedemptions.forEach(r => {
        const name = r.rewardName || r.reward || r.rewardId || 'Unknown';
        rewardMap[name] = (rewardMap[name] || 0) + 1;
      });
      const computedRewardTrends = Object.entries(rewardMap)
        .map(([rewardName, count]) => ({ rewardName, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
      setRewardTrends(computedRewardTrends);

      // ── Reward predictive analysis ─────────────────────────────────────────
      {
        const rewardTimeMap = {};
        allRedemptions.forEach(r => {
          const name = r.rewardName || r.reward || r.rewardId || 'Unknown';
          const d    = toDate(r.redeemedAt || r.createdAt);
          if (!d) return;
          const ws = new Date(d);
          ws.setDate(ws.getDate() - ws.getDay());
          const wk = ws.toISOString().slice(0, 10);
          if (!rewardTimeMap[name]) rewardTimeMap[name] = {};
          rewardTimeMap[name][wk] = (rewardTimeMap[name][wk] || 0) + 1;
        });
        const now   = new Date();
        const weeks = Array.from({ length: 12 }, (_, i) => {
          const d = new Date(now.getTime() - (11 - i) * 7 * 86400000);
          d.setDate(d.getDate() - d.getDay());
          return d.toISOString().slice(0, 10);
        });
        const globalTimeline = weeks.map(wk => {
          let total = 0;
          Object.values(rewardTimeMap).forEach(rm => { total += rm[wk] || 0; });
          return { week: new Date(wk).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), total };
        });
        const perReward = computedRewardTrends.map(({ rewardName, count }) => {
          const series = weeks.map(wk => rewardTimeMap[rewardName]?.[wk] || 0);
          const n = series.length;
          const sumX  = series.reduce((s, _, i) => s + i, 0);
          const sumY  = series.reduce((s, v) => s + v, 0);
          const sumXY = series.reduce((s, v, i) => s + i * v, 0);
          const sumX2 = series.reduce((s, _, i) => s + i * i, 0);
          const denom = (n * sumX2 - sumX * sumX) || 1;
          const slope = (n * sumXY - sumX * sumY) / denom;
          const intercept = (sumY - slope * sumX) / n;
          const nextWeekVal = Math.max(0, slope * n + intercept);
          const next30Days  = Math.max(0, Math.round(nextWeekVal * 4.3));
          const recentAvg   = series.slice(-4).reduce((s, v) => s + v, 0) / 4;
          const olderAvg    = series.slice(0, 4).reduce((s, v) => s + v, 0) / 4;
          const velocityPct = olderAvg >= 0.25
            ? Math.max(-500, Math.min(500, ((recentAvg - olderAvg) / olderAvg) * 100))
            : 0;
          const trend       = slope > 0.1 ? 'rising' : slope < -0.1 ? 'declining' : 'stable';
          const nonZeroWks  = series.filter(v => v > 0).length;
          const confidence  = nonZeroWks >= 6 ? 'High' : nonZeroWks >= 3 ? 'Medium' : 'Low';
          return { rewardName, totalCount: count, series, weeks, next30Days,
            velocityPct: parseFloat(velocityPct.toFixed(1)), trend, confidence,
            slope: parseFloat(slope.toFixed(3)) };
        });
        const risingCount    = perReward.filter(r => r.trend === 'rising').length;
        const decliningCount = perReward.filter(r => r.trend === 'declining').length;
        const totalNext30    = perReward.reduce((s, r) => s + r.next30Days, 0);
        const hotReward      = [...perReward].sort((a, b) => b.velocityPct - a.velocityPct)[0];
        const fadingReward   = [...perReward].filter(r => r.trend === 'declining')
                               .sort((a, b) => a.velocityPct - b.velocityPct)[0];
        setRewardPredictions({ perReward, timeline: globalTimeline,
          summary: { risingCount, decliningCount, totalNext30, hotReward, fadingReward } });
      }

      // ── Submission forecast ────────────────────────────────────────────────
      const bucketDays = trend.length > 60 ? 7 : 1;
      if (finalTrend.length >= 7) {
        const half      = Math.max(1, Math.floor(finalTrend.length / 2));
        const recent    = finalTrend.slice(-half);
        const older     = finalTrend.slice(0, finalTrend.length - half);
        const recentSum  = recent.reduce((s, d) => s + d.submissions, 0);
        const olderSum   = older.length ? older.reduce((s, d) => s + d.submissions, 0) : recentSum;
        const avgBucket  = recentSum / recent.length;
        const avgDay     = avgBucket / bucketDays;
        const oldAvgDay  = older.length
          ? (olderSum / older.length) / bucketDays
          : avgDay;
        const minMeaningfulBase = 0.5;
        const growth = oldAvgDay >= minMeaningfulBase
          ? (avgDay - oldAvgDay) / oldAvgDay
          : 0;
        const clampedGrowth = Math.max(-5, Math.min(5, growth));
        const totalSubmissionsInPeriod = finalTrend.reduce((s, d) => s + d.submissions, 0);
        const dataPoints = finalTrend.length;
        const confidence =
          dataPoints >= 14 && totalSubmissionsInPeriod >= 20 ? 'High'
          : dataPoints >= 7  && totalSubmissionsInPeriod >= 7  ? 'Medium'
          : 'Low';
        setPredictions({
          nextMonth:      Math.max(0, Math.round(avgDay * 30)),
          avgPerDay:      parseFloat(avgDay.toFixed(1)),
          growth:         clampedGrowth,
          growthRate:     oldAvgDay >= minMeaningfulBase ? fmtGrowth(clampedGrowth) : '—',
          trendSentence:  trendSentence(clampedGrowth),
          trendDirection: clampedGrowth >= 0 ? 'upward' : 'downward',
          confidence,
          hasEnoughBaseData: oldAvgDay >= minMeaningfulBase,
        });
      } else {
        setPredictions({ nextMonth: 0, avgPerDay: 0, growth: 0, growthRate: '—',
          trendSentence: 'Not enough data yet.', trendDirection: 'upward', confidence: 'Insufficient data',
          hasEnoughBaseData: false });
      }

      // ── Intelligence engine ────────────────────────────────────────────────
      setIntelligence(runIntelligenceEngine({
        submissions, users, allRedemptions, reports,
        trendData: finalTrend, wasteTypes: computedWasteTypes,
        rewardTrends: computedRewardTrends, kpi: computedKpi,
        dateRange, topUsers: computedTopUsers,
        kgTrendData: finalKgTrend,
      }));
      setDismissedAlerts(new Set());

    } catch (err) {
      console.error('Analytics error:', err);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handlePreset = (days) => { setActivePreset(days); setDateRange(makeRange(days)); };

  const handleExport = () => {
    const rows = [
      ['EcoSort Analytics Report'],
      ['Generated', new Date().toLocaleString()],
      ['Period', `${dateRange.start.toLocaleDateString()} – ${dateRange.end.toLocaleDateString()}`],
      [], ['KPI', 'Value'],
      ['Total Drop-offs',  kpi.totalSubmissions],
      ['Active Members',   kpi.activeUsersInRange],
      ['Total Members',    kpi.totalUsers],
      ['Avg/Day',          kpi.avgDaily],
      ['Rewards Claimed',  kpi.totalRedemptions],
      ['Violations',       kpi.totalReports],
      ['Total Waste (kg)', kpi.totalKg ?? 'N/A'],
      [], ['Date', 'Drop-offs'],
      ...trendData.map(d => [d.date, d.submissions]),
      [], ['Waste Type', 'Drop-offs', 'Kg'],
      ...wasteTypes.map(t => [t.name, t.value, t.kg ?? '']),
      [], ['Reward', 'Claims'],
      ...rewardTrends.map(r => [r.rewardName, r.count]),
      [], ['Rank', 'Member', 'Points'],
      ...topUsers.map((u, i) => [i + 1, u.displayName || `Member …${u.userId.slice(-6)}`, u.totalPoints]),
    ];
    const csv  = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `ecosort-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loading) return (
    <div className={`space-y-4 sm:space-y-6 p-3 sm:p-6 min-h-screen ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className="flex justify-between items-center gap-3">
        <Skeleton className="h-8 w-36 sm:w-56" />
        <Skeleton className="h-8 w-40 sm:w-72" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3">
        {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-20 sm:h-24" />)}
      </div>
      <Skeleton className="h-48 sm:h-56" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <Skeleton className="h-56 sm:h-64" /><Skeleton className="h-56 sm:h-64" />
      </div>
    </div>
  );

  // ── Derived display values ─────────────────────────────────────────────────
  const rangeLabel       = `${dateRange.start.toLocaleDateString()} – ${dateRange.end.toLocaleDateString()}`;
  const participationPct = kpi.totalUsers > 0 ? Math.round((kpi.activeUsersInRange / kpi.totalUsers) * 100) : 0;
  const avgKgPerSub      = kpi.hasWeightData && kpi.totalSubmissions > 0
    ? parseFloat((parseFloat(kpi.totalKg) / kpi.totalSubmissions).toFixed(2)) : null;
  const redeemRate       = kpi.activeUsersInRange > 0
    ? Math.min(100, Math.round((kpi.totalRedemptions / kpi.activeUsersInRange) * 100)) : 0;
  const redemptionsPerMember = kpi.activeUsersInRange > 0
    ? parseFloat((kpi.totalRedemptions / kpi.activeUsersInRange).toFixed(1)) : 0;
  const visibleAlerts    = intelligence.alerts.filter((_, i) => !dismissedAlerts.has(i));
  const hasCritical      = visibleAlerts.some(a => a.level === 'critical');

  const TABS = TAB_DEFS.map(t => ({
    ...t,
    badge:      t.id === 'intelligence' && visibleAlerts.length > 0 ? visibleAlerts.length : null,
    badgeColor: hasCritical ? 'bg-red-500' : 'bg-amber-400',
  }));

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={`space-y-4 sm:space-y-6 p-3 sm:p-6 min-h-screen transition-colors duration-300 ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>

      {/* ─── Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:justify-between sm:items-center gap-3">
        <div className="min-w-0">
          <h2 className={`text-xl sm:text-2xl font-extrabold tracking-tight ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>📊 Analytics</h2>
          <p className={`text-[11px] sm:text-xs mt-0.5 truncate ${isDark ? 'text-gray-400' : 'text-gray-400'}`}>{rangeLabel}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Date presets */}
          <div className={`flex gap-0.5 sm:gap-1 border rounded-xl p-1 flex-wrap ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            {DATE_PRESETS.map(({ label, days }) => (
              <button key={days} onClick={() => handlePreset(days)}
                className={`px-2 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-bold rounded-lg transition ${
                  activePreset === days
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'
                }`}>
                {label}
              </button>
            ))}
          </div>

          <button onClick={loadAnalytics} title="Refresh"
            className={`p-2 rounded-xl border text-sm shrink-0 transition ${isDark ? 'border-gray-700 bg-gray-800 text-gray-400 hover:bg-gray-700' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'}`}>
            🔄
          </button>

          <button onClick={handleExport}
            className="flex items-center gap-1.5 bg-emerald-600 text-white px-3 sm:px-4 py-2 rounded-xl hover:bg-emerald-700 transition text-xs sm:text-sm font-bold shrink-0">
            <span>📤</span>
            <span className="hidden sm:inline">Export CSV</span>
          </button>
        </div>
      </div>

      {/* ─── Tab bar ──────────────────────────────────────────────────────── */}
      <div className={`rounded-2xl border shadow-sm p-1 sm:p-1.5 flex gap-0.5 sm:gap-1 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            title={tab.label}
            className={`relative flex flex-col sm:flex-row items-center justify-center gap-0 sm:gap-2 px-1.5 sm:px-4 py-2 sm:py-2.5 rounded-xl font-semibold transition-all flex-1 min-w-0 ${
              activeTab === tab.id
                ? 'bg-emerald-600 text-white shadow-sm'
                : isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'
            }`}>
            <span className="text-base leading-none">{tab.icon}</span>
            <span className="hidden sm:inline text-sm whitespace-nowrap">{tab.label}</span>
            <span className="sm:hidden text-[9px] font-bold mt-0.5 leading-none">{tab.label.slice(0, 3)}</span>
            {tab.badge != null && (
              <span className={`absolute -top-1 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full text-[9px] font-extrabold text-white px-1 ${tab.badgeColor}`}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: OVERVIEW
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div className="space-y-4 sm:space-y-6">

          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3">
            {[
              { icon:'🗑️', value: fmtNum(kpi.totalSubmissions),   label:'Drop-offs',      bg:'from-green-50 to-emerald-50',  txt:'text-emerald-700', sub:`${kpi.avgDaily}/day avg` },
              { icon:'👥', value: fmtNum(kpi.activeUsersInRange), label:'Active Members', bg:'from-blue-50 to-sky-50',       txt:'text-sky-700',     sub:`${participationPct}% of total` },
              { icon:'🌍', value: fmtNum(kpi.totalUsers),         label:'Total Members',  bg:'from-cyan-50 to-teal-50',      txt:'text-teal-700',    sub:'registered accounts' },
              { icon:'⚖️', value: kpi.hasWeightData ? fmtKg(kpi.totalKg) : fmtNum(kpi.totalSubmissions),
                label: kpi.hasWeightData ? 'Waste Collected' : 'Drop-offs',
                bg:'from-lime-50 to-green-50', txt:'text-green-700',
                sub: avgKgPerSub ? `~${fmtKg(avgKgPerSub)} per visit` : 'no weight data',
                trend: kgPredictions.hasEnoughKgBase && kgPredictions.kgGrowthRate && kgPredictions.kgGrowthRate !== '—' ? kgPredictions.kgGrowthRate : undefined,
                trendPos: kgPredictions.kgTrendDirection === 'upward',
              },
              { icon:'🎁', value: fmtNum(kpi.totalRedemptions),  label:'Rewards Claimed', bg:'from-orange-50 to-amber-50',  txt:'text-amber-700',   sub:'this period' },
              { icon:'🚨', value: fmtNum(kpi.totalReports),      label:'Violations',      bg:'from-rose-50 to-pink-50',     txt:'text-rose-700',    sub: kpi.totalReports >= 5 ? '⚠ check needed' : 'no issues' },
              { icon:'📅', value: activePreset,                  label:'Days Selected',   bg:'from-violet-50 to-purple-50', txt:'text-purple-700',  sub: rangeLabel },
            ].map(c => <KpiCard key={c.label} {...c} />)}
          </div>

          {/* Program Health */}
          <Card>
            <SecHead icon="❤️" title="Program Health Check"
              subtitle="How well your waste collection program is running. Each score is out of 100." />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 lg:gap-4">
              <HealthPill label="Participation"    score={intelligence.healthScores.participation    ?? 0} sub="% members active" />
              <HealthPill label="Reward Use"       score={intelligence.healthScores.rewardEngagement ?? 0} sub="% claiming rewards" />
              <HealthPill label="Compliance"       score={intelligence.healthScores.compliance       ?? 100} sub="based on violations" />
              <HealthPill label="Retention"        score={intelligence.healthScores.retention        ?? 0} sub="returning members" />
              <HealthPill label="Data Depth"       score={intelligence.healthScores.forecast         ?? 0} sub="trend data available" />
            </div>
            <p className={`text-[10px] sm:text-[11px] mt-3 sm:mt-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              💡 70+ = Good · 40–70 = Fair · Below 40 = Needs attention
            </p>
          </Card>

          {/* Goal tracker */}
          <Card>
            <div className="flex items-start justify-between gap-3 mb-3 sm:mb-4 flex-wrap">
              <SecHead icon="🎯" title="Drop-off Goal"
                subtitle="Set a target and track progress for this period." />
              {!editingGoal ? (
                <button onClick={() => { setEditingGoal(true); setGoalInput(String(monthlyGoal)); }}
                  className="text-xs text-emerald-600 font-bold hover:underline shrink-0">
                  Edit goal
                </button>
              ) : (
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap shrink-0">
                  <input type="number" value={goalInput} onChange={e => setGoalInput(e.target.value)}
                    className={`w-16 sm:w-20 border rounded-lg px-2 py-1 text-sm text-center ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`} />
                  <button onClick={() => { setMonthlyGoal(Math.max(1, Number(goalInput))); setEditingGoal(false); }}
                    className="text-xs bg-emerald-600 text-white px-2.5 sm:px-3 py-1.5 rounded-lg font-bold">Save</button>
                  <button onClick={() => setEditingGoal(false)}
                    className={`text-xs px-2 py-1.5 ${isDark ? 'text-gray-400' : 'text-gray-400'}`}>Cancel</button>
                </div>
              )}
            </div>
            <GoalBar current={kpi.totalSubmissions || 0} goal={monthlyGoal}
              label={`Drop-offs this period (goal: ${fmtNum(monthlyGoal)})`} color="#3b82f6" />
          </Card>

          {/* Summary strip */}
          {kpi.totalSubmissions > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              <ProgressCard
                label="Member Participation"
                value={`${participationPct}%`}
                sub={`${kpi.activeUsersInRange} of ${kpi.totalUsers} members`}
                pct={participationPct}
                barColor={participationPct >= 70 ? 'bg-emerald-500' : participationPct >= 30 ? 'bg-amber-400' : 'bg-rose-500'}
                meaning={participationPct >= 70 ? 'Most members are involved!'
                  : participationPct >= 30 ? 'Decent. Send a reminder to boost this.'
                  : 'Low. Consider what\'s stopping members.'}
              />
              <ProgressCard
                label={kpi.hasWeightData ? 'Avg Weight / Drop-off' : 'Daily Drop-off Rate'}
                value={kpi.hasWeightData ? `${avgKgPerSub} kg` : `${kpi.avgDaily}/day`}
                sub={kpi.hasWeightData ? `${kpi.totalKg} kg total` : `${kpi.avgDaily} avg per day`}
                pct={kpi.hasWeightData ? Math.min(100, parseFloat(avgKgPerSub) * 10) : Math.min(100, parseFloat(kpi.avgDaily) * 10)}
                barColor="bg-teal-500"
                meaning={kpi.hasWeightData ? 'Weight per drop-off shows each visit\'s impact.'
                  : parseFloat(kpi.avgDaily) >= 5 ? 'Good daily rate!'
                  : 'Building the habit takes time.'}
              />
              <ProgressCard
                label="Reward Claim Rate"
                value={`${redeemRate}%`}
                sub={`${kpi.totalRedemptions} claimed by ${kpi.activeUsersInRange} members`}
                pct={redeemRate}
                barColor={redeemRate >= 40 ? 'bg-amber-400' : redeemRate >= 20 ? 'bg-amber-300' : 'bg-gray-300'}
                meaning={redeemRate >= 40 ? 'Members love the rewards!'
                  : redeemRate >= 20 ? 'Some engagement. Add cheaper rewards.'
                  : 'Few claims. Refresh the rewards catalog.'}
              />
              <ProgressCard
                label="Rule Compliance"
                value={kpi.totalReports === 0 ? '✅ Clean' : `${kpi.totalReports} issues`}
                sub={kpi.totalReports === 0 ? 'No violations this period'
                  : `${kpi.totalReports} report${kpi.totalReports !== 1 ? 's' : ''}`}
                pct={kpi.totalReports === 0 ? 100 : Math.max(0, 100 - kpi.totalReports * 10)}
                barColor={kpi.totalReports === 0 ? 'bg-emerald-500' : kpi.totalReports >= 5 ? 'bg-rose-500' : 'bg-amber-400'}
                meaning={kpi.totalReports === 0 ? 'No violations — all good.'
                  : kpi.totalReports >= 5 ? 'More than usual. Check the Reports tab.'
                  : 'A few minor issues.'}
              />
            </div>
          )}

          {/* Quick Insights strip */}
          {(() => {
            const allCards = [
              ...visibleAlerts.map(a => ({ ...a, _kind: 'alert', _alertIdx: intelligence.alerts.indexOf(a) })),
              ...intelligence.rewardSuggestions.map(s => ({ ...s, _kind: 'reward' })),
              ...intelligence.scheduleSuggestions.map(s => ({ ...s, _kind: 'schedule' })),
              ...intelligence.insightFeed.slice(0, 2).map(s => ({ ...s, _kind: 'insight' })),
            ].slice(0, 4);
            if (allCards.length === 0) return null;

            const STYLES = {
              critical: {
                bar: 'bg-red-500',
                border: isDark ? 'border-red-900' : 'border-red-200',
                bg: isDark ? 'bg-red-900/20' : 'bg-red-50',
                tag: isDark ? 'bg-red-900/50 text-red-300' : 'bg-red-100 text-red-700',
                tagText: '🔴 Urgent',
                title: isDark ? 'text-red-300' : 'text-gray-800',
                msg: isDark ? 'text-red-400' : 'text-gray-600',
              },
              warning: {
                bar: 'bg-amber-400',
                border: isDark ? 'border-amber-900' : 'border-amber-200',
                bg: isDark ? 'bg-amber-900/20' : 'bg-amber-50',
                tag: isDark ? 'bg-amber-900/50 text-amber-300' : 'bg-amber-100 text-amber-700',
                tagText: '🟡 Warning',
                title: isDark ? 'text-amber-300' : 'text-gray-800',
                msg: isDark ? 'text-amber-400' : 'text-gray-600',
              },
              success: {
                bar: 'bg-emerald-500',
                border: isDark ? 'border-emerald-900' : 'border-emerald-200',
                bg: isDark ? 'bg-emerald-900/20' : 'bg-emerald-50',
                tag: isDark ? 'bg-emerald-900/50 text-emerald-300' : 'bg-emerald-100 text-emerald-700',
                tagText: '🟢 Good news',
                title: isDark ? 'text-emerald-300' : 'text-gray-800',
                msg: isDark ? 'text-emerald-400' : 'text-gray-600',
              },
              info: {
                bar: 'bg-blue-400',
                border: isDark ? 'border-blue-900' : 'border-blue-200',
                bg: isDark ? 'bg-blue-900/20' : 'bg-blue-50',
                tag: isDark ? 'bg-blue-900/50 text-blue-300' : 'bg-blue-100 text-blue-700',
                tagText: '🔵 Info',
                title: isDark ? 'text-blue-300' : 'text-gray-800',
                msg: isDark ? 'text-blue-400' : 'text-gray-600',
              },
              reward: {
                bar: 'bg-violet-500',
                border: isDark ? 'border-violet-900' : 'border-violet-200',
                bg: isDark ? 'bg-violet-900/20' : 'bg-violet-50',
                tag: isDark ? 'bg-violet-900/50 text-violet-300' : 'bg-violet-100 text-violet-700',
                tagText: '🎁 Reward',
                title: isDark ? 'text-violet-300' : 'text-gray-800',
                msg: isDark ? 'text-violet-400' : 'text-gray-600',
              },
              schedule: {
                bar: 'bg-sky-500',
                border: isDark ? 'border-sky-900' : 'border-sky-200',
                bg: isDark ? 'bg-sky-900/20' : 'bg-sky-50',
                tag: isDark ? 'bg-sky-900/50 text-sky-300' : 'bg-sky-100 text-sky-700',
                tagText: '📅 Schedule',
                title: isDark ? 'text-sky-300' : 'text-gray-800',
                msg: isDark ? 'text-sky-400' : 'text-gray-600',
              },
              insight: {
                bar: 'bg-gray-400',
                border: isDark ? 'border-gray-700' : 'border-gray-200',
                bg: isDark ? 'bg-gray-800' : 'bg-gray-50',
                tag: isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600',
                tagText: '💡 Insight',
                title: isDark ? 'text-gray-200' : 'text-gray-800',
                msg: isDark ? 'text-gray-400' : 'text-gray-600',
              },
            };

            return (
              <Card className="!p-0 overflow-hidden">
                {/* Header */}
                <div className={`flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 border-b gap-2 flex-wrap ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-lg sm:text-xl">💡</span>
                    <div>
                      <p className={`text-xs sm:text-sm font-extrabold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>What you should know</p>
                      <p className={`text-[10px] sm:text-xs ${isDark ? 'text-gray-400' : 'text-gray-400'}`}>{allCards.length} item{allCards.length !== 1 ? 's' : ''} need attention</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {hasCritical && (
                      <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] sm:text-[11px] font-bold rounded-full animate-pulse">
                        ⚠️ Action needed
                      </span>
                    )}
                    <button onClick={() => setActiveTab('intelligence')}
                      className="text-[11px] sm:text-xs text-emerald-600 font-bold hover:underline whitespace-nowrap">
                      See all →
                    </button>
                  </div>
                </div>

                {/* Cards: 1 col xs, 2 col md */}
                <div className="p-3 sm:p-4 grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3">
                  {allCards.map((card, i) => {
                    const key = card._kind === 'alert' ? card.level : card._kind;
                    const s   = STYLES[key] || STYLES.insight;
                    return (
                      <div key={i} className={`relative flex gap-2 sm:gap-3 p-3 sm:p-4 rounded-xl border ${s.bg} ${s.border} overflow-hidden`}>
                        <div className={`absolute left-0 inset-y-0 w-1.5 ${s.bar} rounded-l-xl`} />
                        <span className="text-base sm:text-lg shrink-0 ml-1 mt-0.5">{card.icon}</span>
                        <div className="flex-1 min-w-0 space-y-1">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${s.tag}`}>{s.tagText}</span>
                          {card.title && <p className={`text-[11px] sm:text-xs font-bold ${s.title}`}>{card.title}</p>}
                          <p className={`text-[11px] sm:text-xs leading-relaxed ${s.msg}`}>{card.message}</p>
                        </div>
                        {card._kind === 'alert' && (
                          <button onClick={() => setDismissedAlerts(prev => new Set([...prev, card._alertIdx]))}
                            className={`shrink-0 text-xl leading-none self-start ${isDark ? 'text-gray-600 hover:text-gray-400' : 'text-gray-300 hover:text-gray-500'}`}>×</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })()}

        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: ACTIVITY
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'activity' && (
        <div className="space-y-4 sm:space-y-6">

          <Card>
            <SecHead icon="📈" title="Drop-off Activity Over Time"
              subtitle={`Each ${activePreset <= 60 ? 'day' : 'week'} during ${rangeLabel}`} />
            <AreaLineChart data={trendData} color="#10b981" height={200} yLabel="Drop-offs"
              emptyText="No drop-offs recorded in this period." />
            {trendData.length > 0 && (
              <p className={`text-[10px] sm:text-[11px] mt-2 sm:mt-3 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                💬 Dashed line = your average. Peaks and valleys show busy and quiet periods.
              </p>
            )}
          </Card>

          {trendData.length >= 7 && (
            <Card>
              <SecHead icon="🔮" title="What to Expect in the Next 30 Days"
                subtitle="Based on your recent drop-off pattern." />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 sm:mb-5">
                <div className={`border rounded-2xl p-3 sm:p-4 text-center ${isDark ? 'bg-indigo-900/30 border-indigo-800' : 'bg-indigo-50 border-indigo-100'}`}>
                  <p className={`text-2xl sm:text-3xl font-extrabold leading-none ${isDark ? 'text-indigo-300' : 'text-indigo-700'}`}>{fmtNum(predictions.nextMonth)}</p>
                  <p className={`text-[11px] sm:text-xs font-semibold mt-1 ${isDark ? 'text-indigo-400' : 'text-indigo-500'}`}>Estimated drop-offs next month</p>
                  <p className={`text-[10px] mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>~{fmtNum(predictions.avgPerDay)}/day</p>
                </div>
                <div className={`border rounded-2xl p-3 sm:p-4 text-center ${
                  predictions.trendDirection === 'upward'
                    ? isDark ? 'bg-emerald-900/30 border-emerald-800' : 'bg-emerald-50 border-emerald-100'
                    : isDark ? 'bg-rose-900/30 border-rose-800' : 'bg-rose-50 border-rose-100'
                }`}>
                  <p className={`text-2xl sm:text-3xl font-extrabold leading-none ${predictions.trendDirection === 'upward' ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : (isDark ? 'text-rose-400' : 'text-rose-600')}`}>
                    {predictions.hasEnoughBaseData ? predictions.growthRate : '—'}
                  </p>
                  <p className={`text-[11px] sm:text-xs font-semibold mt-1 ${predictions.trendDirection === 'upward' ? (isDark ? 'text-emerald-500' : 'text-emerald-500') : (isDark ? 'text-rose-500' : 'text-rose-500')}`}>
                    {predictions.hasEnoughBaseData ? 'vs previous period' : 'not enough prior data'}
                  </p>
                </div>
                <div className={`border rounded-2xl p-3 sm:p-4 text-center ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-100'}`}>
                  <p className={`text-sm sm:text-base font-extrabold leading-snug ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{predictions.trendSentence}</p>
                  <p className={`text-[10px] mt-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Confidence: <strong>{predictions.confidence}</strong></p>
                </div>
              </div>
              <ForecastChart history={trendData} forecastValue={predictions.nextMonth || 0} color="#10b981" height={180} />
              <p className={`text-[10px] mt-2 leading-relaxed ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                ℹ️ Forecast is based on your recent daily average (second half of selected period). A longer date range gives a more reliable estimate. Confidence: <strong>{predictions.confidence}</strong>.
              </p>
            </Card>
          )}

          {/* KG DESCRIPTIVE ANALYTICS */}
          {kpi.hasWeightData ? (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                {[
                  {
                    icon: '⚖️', label: 'Total Waste Collected',
                    value: fmtKg(kpi.totalKg),
                    sub: `across ${kpi.totalSubmissions} drop-offs`,
                    bg: 'from-teal-50 to-cyan-50', darkBg: 'from-teal-900/30 to-cyan-900/20',
                    txt: 'text-teal-700', darkTxt: 'text-teal-300',
                  },
                  {
                    icon: '📦', label: 'Avg per Drop-off',
                    value: fmtKg(avgKgPerSub),
                    sub: 'weight per visit',
                    bg: 'from-sky-50 to-blue-50', darkBg: 'from-sky-900/30 to-blue-900/20',
                    txt: 'text-sky-700', darkTxt: 'text-sky-300',
                  },
                  {
                    icon: '📅', label: 'Avg per Day',
                    value: fmtKg(kgPredictions.avgKgPerDay),
                    sub: 'on active days',
                    bg: 'from-indigo-50 to-violet-50', darkBg: 'from-indigo-900/30 to-violet-900/20',
                    txt: 'text-indigo-700', darkTxt: 'text-indigo-300',
                  },
                  {
                    icon: '📈', label: 'Next 30 Days (est.)',
                    value: kgPredictions.nextMonthKg != null ? fmtKg(kgPredictions.nextMonthKg) : '—',
                    sub: kgPredictions.kgGrowthRate ? `trend: ${kgPredictions.kgGrowthRate}` : 'not enough data',
                    bg: kgPredictions.kgTrendDirection === 'upward' ? 'from-emerald-50 to-green-50' : 'from-rose-50 to-pink-50',
                    darkBg: kgPredictions.kgTrendDirection === 'upward' ? 'from-emerald-900/30 to-green-900/20' : 'from-rose-900/30 to-pink-900/20',
                    txt: kgPredictions.kgTrendDirection === 'upward' ? 'text-emerald-700' : 'text-rose-700',
                    darkTxt: kgPredictions.kgTrendDirection === 'upward' ? 'text-emerald-300' : 'text-rose-300',
                  },
                ].map(c => (
                  <div key={c.label} className={`bg-gradient-to-br ${isDark ? c.darkBg : c.bg} rounded-2xl p-3 sm:p-4 border ${isDark ? 'border-gray-700' : 'border-white'} shadow-sm`}>
                    <span className="text-xl">{c.icon}</span>
                    <p className={`text-xl sm:text-2xl font-extrabold ${isDark ? c.darkTxt : c.txt} leading-none mt-1 break-all`}>{c.value}</p>
                    <p className={`text-[11px] sm:text-xs font-bold mt-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{c.label}</p>
                    <p className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{c.sub}</p>
                  </div>
                ))}
              </div>

              {/* Kg over time chart */}
              <Card>
                <SecHead icon="⚖️" title="Waste Weight Collected Over Time"
                  subtitle="How many kilograms of waste were brought in each day (or week). Taller peaks = more waste collected." />
                <WasteKgChart data={kgTrendData} height={200} />
                <p className={`text-[10px] sm:text-[11px] mt-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  💬 Use the toggle above the chart to compare weight (kg) side by side with number of drop-offs.
                </p>
              </Card>

              {/* Kg forecast */}
              {kgPredictions.nextMonthKg != null && kgTrendData.length >= 7 && (
                <Card>
                  <SecHead icon="🔮" title="How Much Waste Will Be Collected Next Month?"
                    subtitle="Based on your recent daily average — this is an estimate, not a guarantee." />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 sm:mb-5">
                    <div className={`border rounded-2xl p-3 sm:p-4 text-center ${isDark ? 'bg-teal-900/30 border-teal-800' : 'bg-teal-50 border-teal-100'}`}>
                      <p className={`text-2xl sm:text-3xl font-extrabold leading-none ${isDark ? 'text-teal-300' : 'text-teal-700'}`}>
                        {fmtKg(kgPredictions.nextMonthKg)}
                      </p>
                      <p className={`text-[11px] sm:text-xs font-semibold mt-1 ${isDark ? 'text-teal-400' : 'text-teal-500'}`}>Estimated kg next month</p>
                      <p className={`text-[10px] mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>~{fmtKg(kgPredictions.avgKgPerDay)}/day</p>
                    </div>
                    <div className={`border rounded-2xl p-3 sm:p-4 text-center ${
                      kgPredictions.kgTrendDirection === 'upward'
                        ? isDark ? 'bg-emerald-900/30 border-emerald-800' : 'bg-emerald-50 border-emerald-100'
                        : isDark ? 'bg-rose-900/30 border-rose-800' : 'bg-rose-50 border-rose-100'
                    }`}>
                      <p className={`text-2xl sm:text-3xl font-extrabold leading-none ${kgPredictions.kgTrendDirection === 'upward' ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : (isDark ? 'text-rose-400' : 'text-rose-600')}`}>
                        {kgPredictions.hasEnoughKgBase ? kgPredictions.kgGrowthRate : '—'}
                      </p>
                      <p className={`text-[11px] sm:text-xs font-semibold mt-1 ${kgPredictions.kgTrendDirection === 'upward' ? (isDark ? 'text-emerald-500' : 'text-emerald-500') : (isDark ? 'text-rose-500' : 'text-rose-500')}`}>
                        {kgPredictions.hasEnoughKgBase ? 'vs previous period' : 'not enough prior data'}
                      </p>
                      <p className={`text-[10px] mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                        {kgPredictions.kgTrendDirection === 'upward' ? '📈 Increasing' : '📉 Decreasing'}
                      </p>
                    </div>
                    <div className={`border rounded-2xl p-3 sm:p-4 text-center ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-100'}`}>
                      <p className={`text-sm sm:text-base font-extrabold leading-snug ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{kgPredictions.kgTrendSentence}</p>
                      <p className={`text-[10px] mt-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Confidence: <strong>{kgPredictions.kgConfidence}</strong></p>
                    </div>
                  </div>
                  <KgForecastChart kgHistory={kgTrendData} forecastKg={kgPredictions.nextMonthKg} height={180} />
                </Card>
              )}

              {/* Per waste-type kg breakdown */}
              {wasteTypes.some(w => w.kg > 0) && (
                <Card>
                  <SecHead icon="🏋️" title="Weight by Waste Type"
                    subtitle="Which type of waste is the heaviest? Longer bar = more kilograms collected." />
                  <div className="space-y-2 sm:space-y-3">
                    {[...wasteTypes].filter(w => w.kg > 0).sort((a, b) => b.kg - a.kg).map((w, i) => {
                      const maxKg = Math.max(...wasteTypes.map(x => x.kg), 1);
                      const pct   = Math.round((w.kg / maxKg) * 100);
                      const barColors = ['bg-teal-500','bg-sky-500','bg-indigo-500','bg-violet-500','bg-emerald-500','bg-cyan-500','bg-blue-500','bg-purple-500'];
                      return (
                        <div key={w.name}>
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-[11px] sm:text-xs font-semibold truncate max-w-[55%] ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{w.name}</span>
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{w.value} drop-off{w.value !== 1 ? 's' : ''}</span>
                              <span className={`text-[11px] sm:text-xs font-bold ${isDark ? 'text-teal-400' : 'text-teal-700'}`}>{fmtKg(w.kg)}</span>
                            </div>
                          </div>
                          <div className={`h-2.5 rounded-full overflow-hidden ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                            <div className={`h-full ${barColors[i % barColors.length]} rounded-full transition-all duration-700`}
                              style={{ width: `${Math.max(pct, 2)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className={`text-[10px] sm:text-[11px] mt-3 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    💬 Knowing which type weighs the most helps you plan collection vehicle capacity and recycler partnerships.
                  </p>
                </Card>
              )}
            </>
          ) : (
            /* No weight data nudge */
            <Card>
              <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4">
                <span className="text-3xl shrink-0">⚖️</span>
                <div>
                  <p className={`text-sm font-bold mb-1 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>Weight data is not being recorded</p>
                  <p className={`text-xs leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Right now you can only see the <strong>number</strong> of drop-offs, not how many kilograms of waste were collected.
                    To unlock weight charts and forecasts, make sure members enter the weight of their waste when submitting.
                  </p>
                  <p className={`text-[11px] mt-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    💡 Even an approximate weight (e.g. "1 bag ≈ 2 kg") gives you much more useful data than counts alone.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Waste type charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <Card>
              <SecHead icon="🥧" title="Waste Types — Share of Total"
                subtitle="Hover or tap a slice to see the percentage." />
              {wasteTypes.length === 0
                ? <EmptyState icon="♻️" title="No waste data yet" />
                : <DonutChart data={wasteTypes} size={200} />
              }
            </Card>
            <Card>
              <SecHead icon="📊" title="Waste Types — Count Breakdown"
                subtitle="Longer bar = more common." />
              {wasteTypes.length === 0
                ? <EmptyState icon="📭" title="No data in this period" />
                : <HBarChart data={wasteTypes} />
              }
            </Card>
          </div>

          {/* Heatmap + hours */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <Card>
              <SecHead icon="🗓️" title="Which Days Are Busiest?"
                subtitle="Darker = more drop-offs. Tap a cell for details." />
              <DayHeatmap counts={intelligence.dowCounts || Array(7).fill(0)} />
            </Card>
            <Card>
              <SecHead icon="🕐" title="What Time Are Members Most Active?"
                subtitle="Gold bar = peak hour. Tap a bar for details." />
              <HourBarChart hourCounts={intelligence.hourCounts || Array(24).fill(0)} />
            </Card>
          </div>

        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: COMMUNITY
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'community' && (
        <div className="space-y-4 sm:space-y-6">

          {/* Retention summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            {[
              { icon:'👤', label:'New Members Active', value: fmtNum(intelligence.retentionStats?.newUsers ?? 0),
                sub:'First time submitting',
                bg:'from-blue-50 to-sky-50', darkBg:'from-blue-900/30 to-sky-900/20',
                txt:'text-sky-700', darkTxt:'text-sky-300',
                meaning:'New members who participated this period.' },
              { icon:'🔄', label:'Returning Members', value: fmtNum(intelligence.retentionStats?.returning ?? 0),
                sub:`${intelligence.retentionStats?.retentionRate ?? 0}% retention`,
                bg:'from-emerald-50 to-teal-50', darkBg:'from-emerald-900/30 to-teal-900/20',
                txt:'text-emerald-700', darkTxt:'text-emerald-300',
                meaning:'Members who came back after participating before.' },
              { icon:'😴', label:'Inactive Members', value: fmtNum(Math.max(0, kpi.totalUsers - kpi.activeUsersInRange)),
                sub:'No drop-offs this period',
                bg:'from-rose-50 to-pink-50', darkBg:'from-rose-900/30 to-pink-900/20',
                txt:'text-rose-600', darkTxt:'text-rose-300',
                meaning:'A re-engagement reminder could bring these back.' },
            ].map(c => (
              <div key={c.label} className={`bg-gradient-to-br ${isDark ? c.darkBg : c.bg} rounded-2xl p-4 sm:p-5 border ${isDark ? 'border-gray-700' : 'border-white'} shadow-sm space-y-1`}>
                <span className="text-xl sm:text-2xl">{c.icon}</span>
                <p className={`text-2xl sm:text-3xl font-extrabold leading-none break-all ${isDark ? c.darkTxt : c.txt}`}>{c.value}</p>
                <p className={`text-xs sm:text-sm font-bold ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{c.label}</p>
                <p className={`text-[11px] sm:text-xs ${isDark ? 'text-gray-400' : 'text-gray-400'}`}>{c.sub}</p>
                <p className={`text-[10px] sm:text-[11px] rounded-lg px-2 py-1 mt-1 ${isDark ? 'bg-gray-700/60 text-gray-300' : 'bg-white/60 text-gray-500'}`}>💬 {c.meaning}</p>
              </div>
            ))}
          </div>

          <Card>
            <SecHead icon="🔄" title="Member Retention This Period"
              subtitle="How many of your active members have participated before." />
            <GoalBar
              current={intelligence.retentionStats?.returning ?? 0}
              goal={intelligence.retentionStats?.total || 1}
              label={`Returning members (${intelligence.retentionStats?.retentionRate ?? 0}% retention)`}
              color="#10b981"
            />
            <p className={`text-[10px] sm:text-[11px] mt-2 sm:mt-3 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              💬 Aim for 60%+ retention. If low, try a loyalty reward or "Welcome back" challenge.
            </p>
          </Card>

          <Card>
            <SecHead icon="🏆" title="Top Members by Points"
              subtitle="Points reflect total participation overall, not just this period." />
            {topUsers.length === 0
              ? <EmptyState icon="🏅" title="No point data yet" message="Points appear here once members start earning them." />
              : (
                <div className="space-y-1.5 sm:space-y-2">
                  {topUsers.map((u, i) => {
                    const medals = ['🥇','🥈','🥉'];
                    const pct    = topUsers[0].totalPoints > 0 ? Math.round((u.totalPoints / topUsers[0].totalPoints) * 100) : 0;
                    return (
                      <div key={u.userId} className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-2.5 rounded-xl transition ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}>
                        <span className="w-6 sm:w-7 text-center shrink-0">
                          {i < 3 ? <span className="text-sm sm:text-base">{medals[i]}</span>
                            : <span className={`text-xs font-bold ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>#{i + 1}</span>}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center mb-0.5">
                            <span className={`text-xs sm:text-sm font-semibold truncate ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                              {u.displayName || `Member …${u.userId.slice(-6)}`}
                            </span>
                            <span className={`text-xs font-bold ml-2 shrink-0 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>{fmtNum(u.totalPoints)} pts</span>
                          </div>
                          <div className={`h-1.5 sm:h-2 rounded-full overflow-hidden ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                            <div className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full transition-all duration-500"
                              style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            }
          </Card>

        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: REWARDS
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'rewards' && (
        <div className="space-y-4 sm:space-y-6">

          {rewardTrends.length === 0 ? (
            <Card>
              <EmptyState icon="🎁" title="No reward claims yet"
                message="Predictions and charts will appear once members start claiming rewards." />
            </Card>
          ) : (
            <>
              {/* KPI Summary strip */}
              {(() => {
                const totalClaims     = rewardTrends.reduce((s, r) => s + r.count, 0);
                const totalPointsSpent = allRedemptions.reduce((s, r) => s + Number(r.pointsSpent || r.cost || r.points || 0), 0);
                const avgCostPerClaim  = totalClaims > 0 ? Math.round(totalPointsSpent / totalClaims) : 0;
                const uniqueRedeemers  = new Set(allRedemptions.map(r => r.userId).filter(Boolean)).size;
                const claimRate        = kpi.activeUsersInRange > 0 ? Math.round((uniqueRedeemers / kpi.activeUsersInRange) * 100) : 0;
                const claimsPerMember  = uniqueRedeemers > 0 ? (totalClaims / uniqueRedeemers).toFixed(1) : '—';
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                    {[
                      { label: 'Total Claims',       value: fmtNum(totalClaims),  icon: '🎁', bg: 'from-amber-50 to-orange-50',   darkBg: 'from-amber-900/30 to-orange-900/20', txt: 'text-amber-700',   darkTxt: 'text-amber-300',   sub: `across ${rewardTrends.length} reward${rewardTrends.length !== 1 ? 's' : ''}` },
                      { label: 'Unique Redeemers',   value: fmtNum(uniqueRedeemers), icon: '🧑', bg: 'from-violet-50 to-purple-50', darkBg: 'from-violet-900/30 to-purple-900/20', txt: 'text-violet-700',  darkTxt: 'text-violet-300',  sub: `${claimRate}% of active members` },
                      { label: 'Claims per Member',  value: claimsPerMember,      icon: '🔄', bg: 'from-sky-50 to-blue-50',       darkBg: 'from-sky-900/30 to-blue-900/20',     txt: 'text-sky-700',     darkTxt: 'text-sky-300',     sub: 'avg among redeemers' },
                      { label: 'Avg Cost per Claim', value: totalPointsSpent > 0 ? `${fmtNum(avgCostPerClaim)} pts` : '—', icon: '💰', bg: 'from-emerald-50 to-teal-50', darkBg: 'from-emerald-900/30 to-teal-900/20', txt: 'text-emerald-700', darkTxt: 'text-emerald-300', sub: totalPointsSpent > 0 ? `${fmtNum(totalPointsSpent)} pts total` : 'no points data' },
                    ].map(({ label, value, icon, bg, darkBg, txt, darkTxt, sub }) => (
                      <div key={label} className={`bg-gradient-to-br ${isDark ? darkBg : bg} rounded-2xl p-3 sm:p-4 border ${isDark ? 'border-gray-700' : 'border-white'} shadow-sm`}>
                        <span className="text-xl">{icon}</span>
                        <p className={`text-xl sm:text-2xl font-extrabold leading-none mt-1 break-all ${isDark ? darkTxt : txt}`}>{value}</p>
                        <p className={`text-[11px] sm:text-xs font-bold mt-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{label}</p>
                        <p className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{sub}</p>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Forecast summary strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                {[
                  { label: 'Expected next 30 days', value: fmtNum(rewardPredictions.summary.totalNext30 || '—'), icon: '🔮', bg: 'from-indigo-900 to-purple-900', txt: 'text-white', sub: 'Based on 12-week trend', subTxt: 'text-indigo-300' },
                  { label: 'Growing in popularity', value: rewardPredictions.summary.risingCount ?? '—',         icon: '📈', bg: 'from-emerald-500 to-teal-600',  txt: 'text-white', sub: 'More claims than before',  subTxt: 'text-emerald-100' },
                  { label: 'Losing interest',       value: rewardPredictions.summary.decliningCount ?? '—',      icon: '📉', bg: 'from-rose-500 to-pink-600',      txt: 'text-white', sub: 'Fewer claims than before', subTxt: 'text-rose-100' },
                  { label: 'All-time claims',       value: fmtNum(rewardTrends.reduce((s, r) => s + r.count, 0)), icon: '🎁', bg: 'from-amber-400 to-orange-500',  txt: 'text-white', sub: `across ${rewardTrends.length} rewards`, subTxt: 'text-amber-100' },
                ].map(({ label, value, icon, bg, txt, sub, subTxt }) => (
                  <div key={label} className={`bg-gradient-to-br ${bg} rounded-2xl p-3 sm:p-4 border border-white/10 shadow-md`}>
                    <div className="text-xl sm:text-2xl mb-1.5 sm:mb-2">{icon}</div>
                    <div className={`text-xl sm:text-2xl font-extrabold ${txt} leading-none break-all`}>{value}</div>
                    <div className={`text-[10px] sm:text-[11px] font-semibold mt-1 ${txt} opacity-90 leading-tight`}>{label}</div>
                    <div className={`text-[9px] sm:text-[10px] mt-0.5 ${subTxt}`}>{sub}</div>
                  </div>
                ))}
              </div>

              {/* Hot & Fading */}
              {(rewardPredictions.summary.hotReward || rewardPredictions.summary.fadingReward) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  {rewardPredictions.summary.hotReward && (
                    <div className={`relative overflow-hidden border rounded-2xl p-4 sm:p-5 ${isDark ? 'bg-gradient-to-br from-emerald-900/40 to-teal-900/30 border-emerald-800' : 'bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200'}`}>
                      <div className="absolute -right-4 -top-4 text-5xl sm:text-6xl opacity-10 select-none">🔥</div>
                      <p className={`text-[10px] font-extrabold uppercase tracking-widest mb-1 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>🔥 Hottest reward</p>
                      <p className={`text-sm sm:text-base font-extrabold truncate ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{rewardPredictions.summary.hotReward.rewardName}</p>
                      <p className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        {rewardPredictions.summary.hotReward.velocityPct > 0
                          ? <><span className={`font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>+{rewardPredictions.summary.hotReward.velocityPct.toFixed(1)}%</span> growth in recent weeks</>
                          : <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>Recently gaining traction</span>
                        }
                      </p>
                      <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        ~<span className={`font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>{fmtNum(rewardPredictions.summary.hotReward.next30Days)} claims</span> expected next 30 days
                      </p>
                      <p className={`text-[10px] sm:text-[11px] mt-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>💬 Make sure you have enough stock to meet demand.</p>
                    </div>
                  )}
                  {rewardPredictions.summary.fadingReward && (
                    <div className={`relative overflow-hidden border rounded-2xl p-4 sm:p-5 ${isDark ? 'bg-gradient-to-br from-rose-900/40 to-pink-900/30 border-rose-800' : 'bg-gradient-to-br from-rose-50 to-pink-50 border-rose-200'}`}>
                      <div className="absolute -right-4 -top-4 text-5xl sm:text-6xl opacity-10 select-none">❄️</div>
                      <p className={`text-[10px] font-extrabold uppercase tracking-widest mb-1 ${isDark ? 'text-rose-400' : 'text-rose-600'}`}>❄️ Losing popularity</p>
                      <p className={`text-sm sm:text-base font-extrabold truncate ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{rewardPredictions.summary.fadingReward.rewardName}</p>
                      <p className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        Down <span className={`font-bold ${isDark ? 'text-rose-400' : 'text-rose-600'}`}>{Math.abs(rewardPredictions.summary.fadingReward.velocityPct).toFixed(1)}%</span> vs last month
                      </p>
                      <p className={`text-[10px] sm:text-[11px] mt-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>💬 Consider refreshing or replacing this reward.</p>
                    </div>
                  )}
                </div>
              )}

              {/* 12-week timeline */}
              <Card>
                <SecHead icon="📅" title="Reward Claims — Last 12 Weeks"
                  subtitle="Claims per week. Purple dot = forecast for next week." />
                {(() => {
                  const data = rewardPredictions.timeline || [];
                  if (!data.length) return <EmptyState icon="📭" title="Not enough data yet" />;
                  const timelineData = data.map(d => ({ date: d.week, submissions: d.total }));
                  const pr = rewardPredictions.perReward;
                  const projWeekly = pr.length > 0 ? Math.max(0, Math.round(pr.reduce((s, r) => s + (r.next30Days / 4.3), 0))) : 0;
                  return <ForecastChart history={timelineData} forecastValue={projWeekly} color="#f59e0b" height={180} />;
                })()}
              </Card>

              {/* Top Redeemers */}
              {(() => {
                const redeemCountMap = {};
                allRedemptions.forEach(r => {
                  if (!r.userId) return;
                  if (!redeemCountMap[r.userId]) redeemCountMap[r.userId] = { count: 0, points: 0, name: null };
                  redeemCountMap[r.userId].count += 1;
                  redeemCountMap[r.userId].points += Number(r.pointsSpent || r.cost || r.points || 0);
                  if (!redeemCountMap[r.userId].name) redeemCountMap[r.userId].name = r.userName || r.userDisplayName || null;
                });
                const userLookup = {};
                allUsers.forEach(u => { userLookup[u.id] = u.username || u.displayName || u.name || null; });
                const topRedeemers = Object.entries(redeemCountMap)
                  .map(([userId, v]) => ({ userId, ...v, name: userLookup[userId] || v.name || null }))
                  .sort((a, b) => b.count - a.count)
                  .slice(0, 8);
                if (topRedeemers.length === 0) return null;
                const maxCount = topRedeemers[0].count;
                const medals = ['🥇','🥈','🥉'];
                return (
                  <Card>
                    <SecHead icon="🏅" title="Top Redeemers"
                      subtitle="Members who have claimed the most rewards this period." />
                    <div className="space-y-1.5 sm:space-y-2">
                      {topRedeemers.map((u, i) => {
                        const pct = maxCount > 0 ? Math.round((u.count / maxCount) * 100) : 0;
                        const displayName = u.name || 'Unknown Member';
                        return (
                          <div key={u.userId} className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-2.5 rounded-xl transition ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}>
                            <span className="w-6 sm:w-7 text-center shrink-0">
                              {i < 3
                                ? <span className="text-sm sm:text-base">{medals[i]}</span>
                                : <span className={`text-xs font-bold ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>#{i + 1}</span>}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-center mb-0.5">
                                <span className={`text-xs sm:text-sm font-semibold truncate ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{displayName}</span>
                                <div className="flex items-center gap-2 ml-2 shrink-0">
                                  {u.points > 0 && <span className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{fmtNum(u.points)} pts</span>}
                                  <span className={`text-xs font-bold ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>{u.count} claim{u.count !== 1 ? 's' : ''}</span>
                                </div>
                              </div>
                              <div className={`h-1.5 sm:h-2 rounded-full overflow-hidden ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                                <div className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all duration-500"
                                  style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className={`text-[10px] sm:text-[11px] mt-3 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                      💬 Heavy redeemers are your most motivated members. Consider exclusive rewards or recognition for them.
                    </p>
                  </Card>
                );
              })()}

              {/* Redemption timing patterns */}
              {(() => {
                const rdowCounts  = Array(7).fill(0);
                const rhourCounts = Array(24).fill(0);
                allRedemptions.forEach(r => {
                  const d = toDate(r.redeemedAt || r.createdAt);
                  if (!d) return;
                  rdowCounts[d.getDay()]++;
                  rhourCounts[d.getHours()]++;
                });
                const hasData = rdowCounts.some(v => v > 0);
                if (!hasData) return null;
                const DOW_SHORT_LOCAL = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
                const peakDow   = rdowCounts.indexOf(Math.max(...rdowCounts));
                const peakHour  = rhourCounts.indexOf(Math.max(...rhourCounts));
                const maxDow    = Math.max(...rdowCounts, 1);
                const maxHour   = Math.max(...rhourCounts, 1);
                const ampm = peakHour >= 12 ? 'PM' : 'AM';
                const hr   = peakHour % 12 || 12;
                return (
                  <Card>
                    <SecHead icon="⏱️" title="When Do Members Redeem Rewards?"
                      subtitle="Day-of-week and hour patterns — send targeted reminders at peak times." />
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                      <div>
                        <p className={`text-[11px] sm:text-xs font-semibold mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>By day of week</p>
                        <div className="space-y-1.5">
                          {DOW_SHORT_LOCAL.map((day, i) => {
                            const val = rdowCounts[i];
                            const pct = Math.round((val / maxDow) * 100);
                            const isPeak = i === peakDow;
                            return (
                              <div key={day} className="flex items-center gap-2">
                                <span className={`text-[10px] w-7 shrink-0 font-semibold ${isPeak ? (isDark ? 'text-amber-400' : 'text-amber-600') : (isDark ? 'text-gray-500' : 'text-gray-500')}`}>{day}</span>
                                <div className={`flex-1 h-2 rounded-full overflow-hidden ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                                  <div className={`h-full rounded-full transition-all duration-500 ${isPeak ? 'bg-amber-400' : (isDark ? 'bg-amber-700' : 'bg-amber-200')}`}
                                    style={{ width: `${Math.max(pct, val > 0 ? 3 : 0)}%` }} />
                                </div>
                                <span className={`text-[10px] w-5 text-right shrink-0 font-bold ${isPeak ? (isDark ? 'text-amber-400' : 'text-amber-700') : (isDark ? 'text-gray-500' : 'text-gray-400')}`}>{val}</span>
                              </div>
                            );
                          })}
                        </div>
                        <p className={`text-[10px] mt-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Peak day: <strong className={isDark ? 'text-amber-400' : 'text-amber-700'}>{['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][peakDow]}</strong></p>
                      </div>
                      <div>
                        <p className={`text-[11px] sm:text-xs font-semibold mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>By hour of day</p>
                        <div className="flex items-end gap-px h-16" title="Hourly redemption distribution">
                          {rhourCounts.map((v, i) => {
                            const h = maxHour > 0 ? Math.max(v > 0 ? 3 : 0, (v / maxHour) * 60) : 0;
                            const isPeak = i === peakHour;
                            return (
                              <div key={i} className={`flex-1 rounded-sm ${isPeak ? 'bg-amber-400' : (isDark ? 'bg-amber-700' : 'bg-amber-200')}`}
                                style={{ height: h, alignSelf: 'flex-end' }}
                                title={`${i}:00 — ${v} claim${v !== 1 ? 's' : ''}`} />
                            );
                          })}
                        </div>
                        <div className={`flex justify-between text-[9px] mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                          <span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span>
                        </div>
                        <p className={`text-[10px] mt-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Peak hour: <strong className={isDark ? 'text-amber-400' : 'text-amber-700'}>{hr}:00 {ampm}</strong></p>
                      </div>
                    </div>
                    <p className={`text-[10px] sm:text-[11px] mt-3 border rounded-lg px-3 py-2 ${isDark ? 'bg-amber-900/20 border-amber-800 text-amber-300' : 'bg-amber-50 border-amber-100 text-gray-600'}`}>
                      💡 Schedule push notifications 1 hour before <strong>{hr}:00 {ampm}</strong> on <strong>{['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][peakDow]}s</strong> for the best redemption response.
                    </p>
                  </Card>
                );
              })()}

              {/* Category breakdown */}
              {(() => {
                const catMap = {};
                allRedemptions.forEach(r => {
                  const cat = r.rewardCategory || r.category || 'Uncategorized';
                  if (!catMap[cat]) catMap[cat] = { count: 0, points: 0 };
                  catMap[cat].count  += 1;
                  catMap[cat].points += Number(r.pointsSpent || r.cost || r.points || 0);
                });
                const cats = Object.entries(catMap)
                  .map(([name, v]) => ({ name, ...v }))
                  .sort((a, b) => b.count - a.count);
                if (cats.length < 2) return null;
                const maxCat = Math.max(...cats.map(c => c.count), 1);
                const catColors = ['bg-violet-500','bg-sky-500','bg-amber-400','bg-emerald-500','bg-rose-500','bg-teal-500','bg-indigo-500','bg-orange-400'];
                return (
                  <Card>
                    <SecHead icon="🗂️" title="Claims by Reward Category"
                      subtitle="Which categories members prefer — use this to guide catalog decisions." />
                    <div className="space-y-2 sm:space-y-3">
                      {cats.map((cat, i) => {
                        const pct = Math.round((cat.count / maxCat) * 100);
                        const totalClaims = cats.reduce((s, c) => s + c.count, 0);
                        const sharePct = totalClaims > 0 ? Math.round((cat.count / totalClaims) * 100) : 0;
                        return (
                          <div key={cat.name}>
                            <div className="flex items-center justify-between mb-1">
                              <span className={`text-[11px] sm:text-xs font-semibold truncate max-w-[55%] capitalize ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{cat.name}</span>
                              <div className="flex items-center gap-2">
                                {cat.points > 0 && <span className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{fmtNum(cat.points)} pts</span>}
                                <span className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{sharePct}%</span>
                                <span className={`text-[11px] sm:text-xs font-bold ${isDark ? 'text-violet-400' : 'text-violet-700'}`}>{cat.count} claim{cat.count !== 1 ? 's' : ''}</span>
                              </div>
                            </div>
                            <div className={`h-2.5 rounded-full overflow-hidden ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                              <div className={`h-full ${catColors[i % catColors.length]} rounded-full transition-all duration-700`}
                                style={{ width: `${Math.max(pct, 2)}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className={`text-[10px] sm:text-[11px] mt-3 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                      💬 Add more rewards in your most popular categories to keep members engaged.
                    </p>
                  </Card>
                );
              })()}

              {/* Stock health vs demand */}
              {(() => {
                const rewardsWithLowStock = rewardTrends.filter(r => r.stock != null && r.stock === 0);
                const rewardsWithWarnStock = rewardTrends.filter(r => r.stock != null && r.stock > 0 && r.stock <= 5);
                if (rewardsWithLowStock.length === 0 && rewardsWithWarnStock.length === 0) return null;
                return (
                  <Card>
                    <SecHead icon="📦" title="Stock Alerts vs Demand"
                      subtitle="Rewards that may run out before demand is met." />
                    <div className="space-y-2">
                      {rewardsWithLowStock.map(r => {
                        const pred = (rewardPredictions.perReward || []).find(p => p.rewardName === r.rewardName);
                        return (
                          <div key={r.rewardName} className={`flex items-start gap-2 p-3 rounded-xl border ${isDark ? 'bg-red-900/20 border-red-800' : 'bg-red-50 border-red-200'}`}>
                            <span className="text-base shrink-0">🚫</span>
                            <div className="flex-1 min-w-0">
                              <p className={`text-[11px] sm:text-xs font-bold truncate ${isDark ? 'text-red-300' : 'text-red-800'}`}>{r.rewardName} — Out of stock</p>
                              {pred && pred.next30Days > 0 && (
                                <p className={`text-[10px] mt-0.5 ${isDark ? 'text-red-400' : 'text-red-600'}`}>~{pred.next30Days} claims expected next 30 days but stock is 0. Restock immediately.</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {rewardsWithWarnStock.map(r => {
                        const pred = (rewardPredictions.perReward || []).find(p => p.rewardName === r.rewardName);
                        return (
                          <div key={r.rewardName} className={`flex items-start gap-2 p-3 rounded-xl border ${isDark ? 'bg-amber-900/20 border-amber-800' : 'bg-amber-50 border-amber-200'}`}>
                            <span className="text-base shrink-0">⚠️</span>
                            <div className="flex-1 min-w-0">
                              <p className={`text-[11px] sm:text-xs font-bold truncate ${isDark ? 'text-amber-300' : 'text-amber-800'}`}>{r.rewardName} — Only {r.stock} left</p>
                              {pred && pred.next30Days > 0 && (
                                <p className={`text-[10px] mt-0.5 ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>Predicted {pred.next30Days} claims next 30 days — stock may not cover demand.</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className={`text-[10px] sm:text-[11px] mt-3 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                      💬 Go to the Rewards tab → Adjust Inventory to restock before running out.
                    </p>
                  </Card>
                );
              })()}

              {/* Per-reward forecast cards */}
              <div>
                <div className="flex items-start gap-2 mb-3 sm:mb-4">
                  <span className="text-xl shrink-0">🎯</span>
                  <div>
                    <p className={`text-xs sm:text-sm font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Forecast for Each Reward</p>
                    <p className={`text-[11px] sm:text-xs ${isDark ? 'text-gray-400' : 'text-gray-400'}`}>12 weeks of history. Darker bars = more recent weeks.</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  {(rewardPredictions.perReward || []).map(r => {
                    const tColor = r.trend === 'rising' ? '#10b981' : r.trend === 'declining' ? '#ef4444' : '#6b7280';
                    const tBg    = r.trend === 'rising'
                      ? isDark ? 'bg-emerald-900/30 border-emerald-800' : 'bg-emerald-50 border-emerald-100'
                      : r.trend === 'declining'
                        ? isDark ? 'bg-rose-900/30 border-rose-800' : 'bg-rose-50 border-rose-100'
                        : isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-100';
                    const tLabel = r.trend === 'rising' ? '📈 Growing' : r.trend === 'declining' ? '📉 Declining' : '➡️ Stable';
                    const tTxt   = r.trend === 'rising'
                      ? isDark ? 'text-emerald-400' : 'text-emerald-700'
                      : r.trend === 'declining'
                        ? isDark ? 'text-rose-400' : 'text-rose-600'
                        : isDark ? 'text-gray-400' : 'text-gray-500';
                    const maxBar = Math.max(...r.series, 1);
                    const matchedTrend = rewardTrends.find(t => t.rewardName === r.rewardName);
                    const stock = matchedTrend?.stock;
                    const stockWarn = stock != null && stock <= 5;

                    return (
                      <div key={r.rewardName} className={`rounded-2xl border p-3 sm:p-4 ${tBg} space-y-2 sm:space-y-3`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className={`text-xs sm:text-sm font-extrabold truncate ${isDark ? 'text-gray-100' : 'text-gray-900'}`} title={r.rewardName}>{r.rewardName}</p>
                            <p className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{r.totalCount} all-time claims</p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tTxt} ${isDark ? 'bg-gray-700/60' : 'bg-white/70'}`}>{tLabel}</span>
                            {stock != null && (
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${stock === 0 ? (isDark ? 'bg-red-900/50 text-red-300' : 'bg-red-100 text-red-600') : stockWarn ? (isDark ? 'bg-amber-900/50 text-amber-300' : 'bg-amber-100 text-amber-700') : (isDark ? 'bg-emerald-900/50 text-emerald-300' : 'bg-emerald-100 text-emerald-700')}`}>
                                {stock === 0 ? '🚫 Out of stock' : `📦 ${stock} left`}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Mini sparkline bars */}
                        <div>
                          <p className={`text-[10px] mb-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Weekly claims (last 12 weeks + forecast)</p>
                          <div className="flex items-end gap-px h-8 sm:h-10">
                            {r.series.map((v, i) => {
                              const h = maxBar > 0 ? Math.max(2, (v / maxBar) * 36) : 2;
                              return (
                                <div key={i} className="flex-1 rounded-sm"
                                  style={{ height: h, alignSelf: 'flex-end', background: i >= 8 ? tColor : `${tColor}55` }}
                                  title={`Week ${i + 1}: ${v} claims`} />
                              );
                            })}
                            <div className="flex-1 rounded-sm opacity-70"
                              style={{ height: Math.max(2, Math.min(40, (r.next30Days / 4.3 / maxBar) * 40)), alignSelf: 'flex-end', background: '#8b5cf6' }}
                              title={`Forecast: ~${Math.round(r.next30Days / 4.3)}`} />
                          </div>
                          <div className={`flex justify-between text-[9px] mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                            <span>12 wks ago</span>
                            <span className="text-violet-500 font-bold">▶ forecast</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-1.5 sm:gap-2 text-center">
                          {[
                            { val: fmtNum(r.next30Days), lbl: 'Next 30 days', cls: isDark ? 'text-gray-100' : 'text-gray-900' },
                            { val: `${r.velocityPct >= 0 ? '+' : ''}${r.velocityPct}%`, lbl: 'Recent change', cls: r.velocityPct >= 0 ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : (isDark ? 'text-rose-400' : 'text-rose-500') },
                            { val: r.confidence, lbl: 'Accuracy', cls: r.confidence === 'High' ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : r.confidence === 'Medium' ? (isDark ? 'text-amber-400' : 'text-amber-500') : (isDark ? 'text-gray-400' : 'text-gray-400') },
                          ].map(({ val, lbl, cls }) => (
                            <div key={lbl} className={`rounded-xl p-1.5 sm:p-2 ${isDark ? 'bg-gray-700/50' : 'bg-white/70'}`}>
                              <p className={`text-xs sm:text-sm font-extrabold ${cls}`}>{val}</p>
                              <p className={`text-[9px] leading-tight ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{lbl}</p>
                            </div>
                          ))}
                        </div>

                        {stock != null && stockWarn && r.next30Days > 0 && (
                          <p className={`text-[10px] font-semibold px-2 py-1 rounded-lg ${stock === 0 ? (isDark ? 'bg-red-900/40 text-red-300' : 'bg-red-100 text-red-700') : (isDark ? 'bg-amber-900/40 text-amber-300' : 'bg-amber-100 text-amber-700')}`}>
                            {stock === 0
                              ? `🚨 Out of stock but ~${r.next30Days} claims expected. Restock now!`
                              : `⚠️ Only ${stock} units left vs ~${r.next30Days} predicted claims.`}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Velocity chart */}
              {(rewardPredictions.perReward || []).length > 1 && (
                <Card>
                  <SecHead icon="⚡" title="Which Rewards Are Growing vs Fading?"
                    subtitle="Green = gaining popularity · Red = losing interest · Longer bar = bigger change" />
                  <VelocityChart rewards={rewardPredictions.perReward || []} />
                </Card>
              )}

              {/* AI suggestions */}
              {intelligence.rewardSuggestions.length > 0 && (
                <Card>
                  <SecHead icon="💡" title="Tips to Improve Your Rewards Program"
                    subtitle="Based on your actual data." />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                    {intelligence.rewardSuggestions.map((s, i) => <SuggestionCard key={i} {...s} />)}
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: INTELLIGENCE
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'intelligence' && (
        <div className="space-y-4 sm:space-y-6">

          {/* Prediction panel — always dark gradient (intentional brand style) */}
          <div className="bg-gradient-to-br from-indigo-900 to-purple-900 rounded-2xl border border-indigo-800 p-4 sm:p-6 text-white relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10">
              <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-5">
                <span className="text-xl sm:text-2xl">🔮</span>
                <div>
                  <p className="text-sm sm:text-base font-extrabold text-white">What to Expect Next Month</p>
                  <p className="text-[10px] sm:text-xs text-indigo-300 mt-0.5">
                    Based on the last {activePreset} days
                    {predictions.confidence ? ` · Confidence: ${predictions.confidence}` : ''}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                {[
                  { label:'Estimated drop-offs', val: fmtNum(predictions.nextMonth), sub: `~${fmtNum(predictions.avgPerDay)}/day`, cls:'text-white text-2xl sm:text-3xl font-extrabold' },
                  { label:'Change vs before',    val: predictions.hasEnoughBaseData ? predictions.growthRate : '—',
                    sub: predictions.hasEnoughBaseData ? 'vs earlier in this period' : 'not enough prior data',
                    cls:`${predictions.trendDirection === 'upward' ? 'text-emerald-300' : 'text-rose-300'} text-2xl sm:text-3xl font-extrabold` },
                  { label:'Trend direction',     val: predictions.trendDirection === 'upward' ? '📈 Up' : '📉 Down', sub: predictions.trendSentence, cls:'text-base sm:text-lg font-bold text-white' },
                  { label:'How reliable',        val: predictions.confidence, sub: 'based on data available', cls:'text-amber-300 text-xl sm:text-2xl font-bold' },
                ].map(({ label, val, sub, cls }) => (
                  <div key={label} className="bg-white/10 rounded-xl p-3 sm:p-4 backdrop-blur-sm">
                    <p className="text-[10px] sm:text-[11px] text-indigo-200 mb-1.5 sm:mb-2">{label}</p>
                    <div className={`${cls} break-all leading-tight`}>{val ?? '—'}</div>
                    {sub && <p className="text-[9px] sm:text-[10px] text-indigo-300 mt-1 leading-relaxed">{sub}</p>}
                  </div>
                ))}
              </div>

              {/* Kg forecast row */}
              {kpi.hasWeightData && kgPredictions.nextMonthKg != null && (
                <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-white/10">
                  <p className="text-[10px] sm:text-xs text-indigo-300 mb-2 sm:mb-3">⚖️ Waste Weight Forecast</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                    {[
                      { label: 'Estimated kg next month',  val: fmtKg(kgPredictions.nextMonthKg),  sub: `~${fmtKg(kgPredictions.avgKgPerDay)}/day`,          cls: 'text-teal-300 text-2xl sm:text-3xl font-extrabold' },
                      { label: 'Weight change vs before',  val: kgPredictions.hasEnoughKgBase ? kgPredictions.kgGrowthRate : '—',
                        sub: kgPredictions.hasEnoughKgBase ? 'vs earlier in this period' : 'not enough prior data',
                        cls: `${kgPredictions.kgTrendDirection === 'upward' ? 'text-emerald-300' : 'text-rose-300'} text-2xl sm:text-3xl font-extrabold` },
                      { label: 'Weight trend',             val: kgPredictions.kgTrendDirection === 'upward' ? '📈 Up' : '📉 Down', sub: kgPredictions.kgTrendSentence, cls: 'text-base sm:text-lg font-bold text-white' },
                      { label: 'Forecast reliability',     val: kgPredictions.kgConfidence, sub: 'based on weight data available', cls: 'text-amber-300 text-xl sm:text-2xl font-bold' },
                    ].map(({ label, val, sub, cls }) => (
                      <div key={label} className="bg-white/10 rounded-xl p-3 sm:p-4 backdrop-blur-sm">
                        <p className="text-[10px] sm:text-[11px] text-teal-300 mb-1.5 sm:mb-2">{label}</p>
                        <div className={`${cls} break-all leading-tight`}>{val ?? '—'}</div>
                        {sub && <p className="text-[9px] sm:text-[10px] text-teal-400/80 mt-1 leading-relaxed">{sub}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Alerts */}
          {visibleAlerts.length === 0 ? (
            <Card>
              <SecHead icon="✅" title="No alerts right now"
                subtitle="Everything looks good. Check back after more activity." />
            </Card>
          ) : (
            <Card>
              <SecHead icon="🚨" title="Things That Need Your Attention"
                subtitle={`${visibleAlerts.length} alert${visibleAlerts.length !== 1 ? 's' : ''} — follow the suggested action for each`}
                badge={hasCritical ? 'Urgent' : undefined} badgeColor="bg-red-100 text-red-700" />
              <div className="space-y-2 sm:space-y-3">
                {visibleAlerts.map((alert, i) => (
                  <AlertCard key={i} alert={alert}
                    onDismiss={() => setDismissedAlerts(prev => new Set([...prev, intelligence.alerts.indexOf(alert)]))} />
                ))}
              </div>
            </Card>
          )}

          {/* Schedule suggestions */}
          {intelligence.scheduleSuggestions.length > 0 && (
            <Card>
              <SecHead icon="📅" title="Tips to Improve Your Collection Schedule"
                subtitle="Based on when members are most active" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                {intelligence.scheduleSuggestions.map((s, i) => <SuggestionCard key={i} {...s} />)}
              </div>
            </Card>
          )}

          {/* Insight feed */}
          {intelligence.insightFeed.length > 0 && (
            <Card>
              <SecHead icon="📖" title="Data Highlights"
                subtitle="Plain-language summaries of your most important numbers" />
              <div>
                {intelligence.insightFeed.map((item, i) => <InsightItem key={i} {...item} />)}
              </div>
            </Card>
          )}

        </div>
      )}

    </div>
  );
};

export default AnalyticsTab;