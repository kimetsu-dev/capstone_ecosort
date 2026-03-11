// ─── analyticsIntelligenceEngine.js ──────────────────────────────────────────
// Pure function — no React, no Firebase. Fully unit-testable.
//
// Derives actionable insights from raw analytics data and returns:
//   alerts              — things that need the admin's attention
//   rewardSuggestions   — tips to improve the rewards program
//   scheduleSuggestions — tips to improve collection scheduling
//   insightFeed         — plain-English summaries of key numbers
//   healthScores        — 0–100 scores for five program dimensions
//   retentionStats      — new vs returning user breakdown
//   dowCounts           — day-of-week submission counts (Array[7])
//   hourCounts          — hourly submission counts (Array[24])

import { toDate, DOW_FULL, fmtKg } from './analyticsConstants';

export const runIntelligenceEngine = ({
  submissions, users, allRedemptions, reports,
  trendData, wasteTypes, rewardTrends, kpi, dateRange, topUsers,
  kgTrendData = [],   // [{ date, kg, submissions }] — may be empty if no weight data
}) => {
  const alerts              = [];
  const rewardSuggestions   = [];
  const scheduleSuggestions = [];
  const insightFeed         = [];

  const days = Math.max(1, Math.round((dateRange.end - dateRange.start) / 86400000));

  // ── Pre-compute active user set ────────────────────────────────────────────
  const activeIds = new Set(submissions.map(s => s.userId).filter(Boolean));

  // ── Day-of-week and hour counts ────────────────────────────────────────────
  const dowCounts  = Array(7).fill(0);
  const hourCounts = Array(24).fill(0);
  submissions.forEach(s => {
    const d = toDate(s.submittedAt);
    if (!d) return;
    dowCounts[d.getDay()]++;
    hourCounts[d.getHours()]++;
  });

  // ── Retention: new vs returning ───────────────────────────────────────────
  // "Returning" = user submitted in this period AND has submissions before this period
  // We approximate: users who have totalPoints > 0 before this period started
  // (they earned points before, and they're active now)
  const returningIds = new Set(
    users
      .filter(u => {
        if (!activeIds.has(u.id)) return false;
        // If a user's account creation date is before this period, they're returning
        const created = toDate(u.createdAt || u.joinedAt || null);
        return created && created < dateRange.start;
      })
      .map(u => u.id)
  );
  const newActiveIds = new Set([...activeIds].filter(id => !returningIds.has(id)));
  const retentionStats = {
    returning:     returningIds.size,
    newUsers:      newActiveIds.size,
    total:         activeIds.size,
    retentionRate: activeIds.size > 0 ? Math.round((returningIds.size / activeIds.size) * 100) : 0,
  };

  // ── Health Scores (0–100) ──────────────────────────────────────────────────
  // Each score is a simple normalised value on a 0–100 scale.
  const participationPct = kpi.totalUsers > 0
    ? (kpi.activeUsersInRange / kpi.totalUsers) * 100 : 0;

  const redeemingIds = new Set(allRedemptions.map(r => r.userId).filter(Boolean));
  const redeemingActive = [...redeemingIds].filter(id => activeIds.has(id)).length;
  const rewardEngagePct = activeIds.size > 0
    ? (redeemingActive / activeIds.size) * 100 : 0;

  const reportRate = kpi.totalSubmissions > 0
    ? (kpi.totalReports / kpi.totalSubmissions) * 100 : 0;
  const complianceScore = Math.max(0, 100 - reportRate * 10);   // 1 report per 10 drops = 90

  const retentionScore = retentionStats.retentionRate;

  // Forecast confidence: more trend data = higher score
  const forecastScore = Math.min(100, (trendData.length / 30) * 100);

  const healthScores = {
    participation: Math.round(Math.min(100, participationPct * 1.4)),  // 70% participation = 100 score
    rewardEngagement: Math.round(Math.min(100, rewardEngagePct * 2)),  // 50% = 100
    compliance:    Math.round(complianceScore),
    retention:     Math.round(retentionScore),
    forecast:      Math.round(forecastScore),
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 1. SMART ALERTS
  // ══════════════════════════════════════════════════════════════════════════

  // Submission volume change week-over-week
  if (trendData.length >= 14) {
    const recent7 = trendData.slice(-7).reduce((s, d) => s + d.submissions, 0);
    const prior7  = trendData.slice(-14, -7).reduce((s, d) => s + d.submissions, 0);
    const dropPct = prior7 > 0 ? ((prior7 - recent7) / prior7) * 100 : 0;

    if (dropPct >= 30) {
      alerts.push({
        level: 'critical', icon: '📉',
        title: 'Big drop in waste drop-offs this week',
        message: `This week had ${recent7} drop-offs vs ${prior7} last week — a ${dropPct.toFixed(0)}% drop.`,
        action: 'Send a push notification or post an announcement to remind members to drop off waste.',
      });
    } else if (dropPct >= 15) {
      alerts.push({
        level: 'warning', icon: '⚠️',
        title: 'Drop-offs are slowing down',
        message: `This week had ${dropPct.toFixed(0)}% fewer drop-offs than last week (${recent7} vs ${prior7}).`,
        action: 'Monitor for another week. If it continues, consider a reminder or a new incentive.',
      });
    } else if (recent7 > prior7 * 1.2) {
      alerts.push({
        level: 'success', icon: '🚀',
        title: 'Drop-offs jumped this week!',
        message: `Activity increased by ${((recent7 / Math.max(prior7, 1) - 1) * 100).toFixed(0)}% this week (${recent7} vs ${prior7}).`,
        action: 'Great time to post a community update or thank members publicly.',
      });
    }
  }

  // Kg collected week-over-week alert (only when weight data is available)
  if (kgTrendData.length >= 14 && kpi.hasWeightData) {
    const recentKg = kgTrendData.slice(-7).reduce((s, d) => s + (d.kg || 0), 0);
    const priorKg  = kgTrendData.slice(-14, -7).reduce((s, d) => s + (d.kg || 0), 0);
    if (priorKg > 0) {
      const dropPct = ((priorKg - recentKg) / priorKg) * 100;
      if (dropPct >= 30) {
        alerts.push({
          level: 'critical', icon: '⚖️',
          title: 'Much less waste collected this week',
          message: `This week: ${fmtKg(recentKg)} vs last week: ${fmtKg(priorKg)} — a ${dropPct.toFixed(0)}% drop in weight.`,
          action: 'Check if members are skipping drop-offs or submitting without recording weight. Send a reminder.',
        });
      } else if (recentKg > priorKg * 1.25) {
        alerts.push({
          level: 'success', icon: '⚖️',
          title: 'More waste collected this week — nice!',
          message: `This week: ${fmtKg(recentKg)} vs last week: ${fmtKg(priorKg)} — a ${(((recentKg/Math.max(priorKg,1))-1)*100).toFixed(0)}% increase in weight.`,
          action: 'Great momentum! Share this milestone with your community.',
        });
      }
    }
  }

  // Hazardous waste spike
  const hazardous = ['hazardous','chemical','battery','batteries','e-waste','ewaste','toxic'];
  wasteTypes.forEach(wt => {
    if (hazardous.some(k => wt.name.toLowerCase().includes(k)) && wt.value >= 3) {
      alerts.push({
        level: 'warning', icon: '☣️',
        title: `Unusual amount of hazardous waste: ${wt.name}`,
        message: `${wt.value} drop-offs of "${wt.name}" were recorded this period.`,
        action: 'Make sure proper disposal procedures are in place and notify the relevant authority if needed.',
      });
    }
  });

  // Inactive members who used to participate
  const inactiveWithPoints = users.filter(u =>
    !activeIds.has(u.id) && (u.points || u.totalPoints || 0) > 0
  ).length;
  if (inactiveWithPoints >= 3) {
    alerts.push({
      level: 'info', icon: '😴',
      title: `${inactiveWithPoints} members haven't dropped off anything recently`,
      message: `These members have earned points before but were inactive this period.`,
      action: 'A friendly reminder notification or a bonus challenge could bring them back.',
    });
  }

  // High violation reports
  if (kpi.totalReports >= 5) {
    alerts.push({
      level: 'warning', icon: '🚨',
      title: `${kpi.totalReports} rule violations reported`,
      message: `That's more violations than usual for this period.`,
      action: 'Review the Reports tab for patterns — check if the same area or user is repeatedly flagged.',
    });
  }

  // No activity at all
  if (kpi.totalSubmissions === 0) {
    alerts.push({
      level: 'warning', icon: '📭',
      title: 'No drop-offs recorded in this period',
      message: 'Nobody has submitted any waste in the selected time range.',
      action: 'Check that the app is working correctly, or send a reminder to your members.',
    });
  }

  // Low new member activity
  if (retentionStats.newUsers > 0 && retentionStats.retentionRate < 30 && activeIds.size >= 5) {
    alerts.push({
      level: 'info', icon: '👋',
      title: 'Most active members are brand new',
      message: `Only ${retentionStats.retentionRate}% of active members this period are returning members.`,
      action: 'Consider a welcome challenge or onboarding reward to help new members build the habit.',
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 2. REWARD SUGGESTIONS
  // ══════════════════════════════════════════════════════════════════════════

  const redemptionRate = activeIds.size > 0 ? (redeemingActive / activeIds.size) * 100 : 0;
  if (redemptionRate < 20 && activeIds.size > 5) {
    rewardSuggestions.push({
      icon: '🎁', type: 'optimize',
      title: 'Most members are not using their rewards',
      message: `Only ${redemptionRate.toFixed(0)}% of active members (${redeemingActive} out of ${activeIds.size}) have claimed a reward. The rewards may be too expensive or not appealing enough.`,
    });
  }

  if (rewardTrends.length > 0) {
    const totalClaims = rewardTrends.reduce((s, r) => s + r.count, 0);
    const top = rewardTrends[0];
    if (totalClaims > 0 && top.count / totalClaims > 0.6) {
      rewardSuggestions.push({
        icon: '⚡', type: 'diversify',
        title: `One reward is too dominant (${((top.count / totalClaims) * 100).toFixed(0)}% of all claims)`,
        message: `"${top.rewardName}" is claimed much more than anything else. Try adding 2–3 new rewards so members have more variety.`,
      });
    }

    const unpopular = rewardTrends.filter(r => r.count <= 1);
    if (unpopular.length > 0) {
      rewardSuggestions.push({
        icon: '🗑️', type: 'remove',
        title: `${unpopular.length} reward${unpopular.length > 1 ? 's' : ''} almost nobody has claimed`,
        message: `"${unpopular.slice(0, 3).map(r => r.rewardName).join('", "')}"${unpopular.length > 3 ? ` and ${unpopular.length - 3} more` : ''} have 0 or 1 claim. Swap them out for something more attractive.`,
      });
    }
  }

  if (topUsers.length >= 3 && allRedemptions.length > 0) {
    const top3Ids = new Set(topUsers.slice(0, 3).map(u => u.userId));
    const eliteCount = allRedemptions.filter(r => top3Ids.has(r.userId)).length;
    const elitePct   = (eliteCount / allRedemptions.length) * 100;
    if (elitePct > 50) {
      rewardSuggestions.push({
        icon: '🏅', type: 'accessibility',
        title: 'Only the top 3 users are claiming rewards',
        message: `${elitePct.toFixed(0)}% of all reward claims come from just 3 members. Most members aren't earning enough points to reach any reward. Add some lower-cost options.`,
      });
    }
  }

  // Reward catalog is empty or very small
  if (rewardTrends.length === 0 && activeIds.size > 0) {
    rewardSuggestions.push({
      icon: '➕', type: 'optimize',
      title: 'No rewards have been claimed yet',
      message: 'Either no rewards exist or members haven\'t discovered them yet. Add at least 3 rewards with varying point costs to get people engaged.',
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 3. SCHEDULE SUGGESTIONS
  // ══════════════════════════════════════════════════════════════════════════

  if (submissions.length > 0) {
    const peakDay   = dowCounts.indexOf(Math.max(...dowCounts));
    const quietDay  = dowCounts.indexOf(Math.min(...dowCounts));

    scheduleSuggestions.push({
      icon: '📅', type: 'accessibility',
      title: `Best day to collect waste: ${DOW_FULL[peakDay]}`,
      message: `${DOW_FULL[peakDay]}s have the most drop-offs (${dowCounts[peakDay]} total). Scheduling collection on or right after ${DOW_FULL[peakDay]} means you'll capture the most waste.`,
    });

    if (dowCounts[quietDay] === 0) {
      scheduleSuggestions.push({
        icon: '❌', type: 'remove',
        title: `No activity on ${DOW_FULL[quietDay]}s`,
        message: `Nobody has submitted waste on ${DOW_FULL[quietDay]}s this period. You can skip scheduling collection on this day to save resources.`,
      });
    }

    const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
    if (hourCounts[peakHour] > 0) {
      const ampm = peakHour >= 12 ? 'PM' : 'AM';
      const hr   = peakHour % 12 || 12;
      scheduleSuggestions.push({
        icon: '⏰', type: 'accessibility',
        title: `Busiest time of day: ${hr}:00 ${ampm}`,
        message: `Most members submit waste around ${hr}:00 ${ampm}. Send push reminders 1–2 hours before this time to get the highest response.`,
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 4. INSIGHT FEED  (plain-English summaries)
  // ══════════════════════════════════════════════════════════════════════════

  // Top waste type
  if (wasteTypes.length > 0) {
    const top = wasteTypes[0];
    const pct = kpi.totalSubmissions > 0
      ? Math.round((top.value / kpi.totalSubmissions) * 100) : 0;
    insightFeed.push({
      icon: '♻️',
      title: `Most common waste: ${top.name}`,
      message: `"${top.name}" makes up ${pct}% of all drop-offs${top.kg ? ` (${top.kg} kg)` : ''}. Consider working with a ${top.name.toLowerCase()} recycler or running an awareness campaign about this type.`,
    });
  }

  // Participation
  if (kpi.totalUsers > 0) {
    const pct = Math.round((kpi.activeUsersInRange / kpi.totalUsers) * 100);
    insightFeed.push({
      icon: '👥',
      title: `${pct}% of members participated`,
      message: `${kpi.activeUsersInRange} out of ${kpi.totalUsers} registered members dropped off waste this period. ${
        pct >= 70 ? 'Excellent — your community is very engaged!'
        : pct >= 30 ? 'Decent participation, but there\'s room to improve. Try a reminder or a short challenge.'
        : 'This is quite low. Consider what might be stopping members from participating.'
      }`,
    });
  }

  // Retention
  if (retentionStats.total > 0) {
    insightFeed.push({
      icon: '🔄',
      title: `${retentionStats.retentionRate}% are returning members`,
      message: `${retentionStats.returning} returning + ${retentionStats.newUsers} new members were active this period. ${
        retentionStats.retentionRate >= 60 ? 'Good retention — members are coming back.'
        : 'A lot of one-time participants. Rewards and community challenges help build repeat habits.'
      }`,
    });
  }

  // Average daily activity
  const avgDaily = parseFloat(kpi.avgDaily) || 0;
  if (avgDaily > 0) {
    insightFeed.push({
      icon: '📊',
      title: `Average of ${avgDaily} drop-offs per day`,
      message: avgDaily >= 10
        ? 'Strong daily activity — the community is very engaged.'
        : avgDaily >= 3
        ? 'Steady but growing. There\'s still room to increase participation.'
        : 'Daily activity is low. A weekly nudge notification could help build the habit.',
    });
  }

  // Week-over-week trajectory
  if (trendData.length >= 14) {
    const r7 = trendData.slice(-7).reduce((s, d) => s + d.submissions, 0);
    const p7 = trendData.slice(-14, -7).reduce((s, d) => s + d.submissions, 0);
    if (p7 > 0) {
      const change = ((r7 - p7) / p7 * 100).toFixed(0);
      const isUp   = r7 >= p7;
      insightFeed.push({
        icon: isUp ? '📈' : '📉',
        title: `Week-over-week: ${change >= 0 ? '+' : ''}${change}%`,
        message: `Last 7 days had ${r7} drop-offs vs ${p7} the week before. At this pace, you can expect around ${Math.max(0, Math.round((r7 / 7) * 30))} drop-offs next month.`,
      });
    }
  }

  // ── Kg descriptive insights ───────────────────────────────────────────────
  if (kpi.hasWeightData && kgTrendData.length > 0) {
    const totalKg     = kgTrendData.reduce((s, d) => s + (d.kg || 0), 0);
    const daysWithKg  = kgTrendData.filter(d => d.kg > 0).length;
    const avgKgPerDay = daysWithKg > 0 ? totalKg / daysWithKg : 0;
    const peakDay     = kgTrendData.reduce((best, d) => (d.kg || 0) > (best.kg || 0) ? d : best, kgTrendData[0]);
    const avgKgPerSub = kpi.totalSubmissions > 0 ? totalKg / kpi.totalSubmissions : 0;

    insightFeed.push({
      icon: '⚖️',
      title: `${fmtKg(totalKg)} of waste collected this period`,
      message: `That is an average of ${fmtKg(avgKgPerDay)} per active day and ${fmtKg(avgKgPerSub)} per drop-off. ${
        avgKgPerSub >= 5  ? 'Members are bringing in good amounts each visit.'
        : avgKgPerSub >= 2 ? 'Decent amounts per visit. Encourage members to bring more each time.'
        : 'Small amounts per visit. A "bring more, earn more" incentive could increase this.'
      }`,
    });

    if (peakDay && peakDay.kg > 0) {
      insightFeed.push({
        icon: '📅',
        title: `Biggest collection day: ${peakDay.date}`,
        message: `${fmtKg(peakDay.kg)} was collected on this single day — the highest in the period. Check what happened (event, reminder sent?) and try to repeat it.`,
      });
    }

    // Waste type with most weight
    const topByKg = [...wasteTypes].filter(w => w.kg > 0).sort((a, b) => b.kg - a.kg)[0];
    if (topByKg) {
      insightFeed.push({
        icon: '🏋️',
        title: `Heaviest waste type: ${topByKg.name}`,
        message: `"${topByKg.name}" accounted for ${fmtKg(topByKg.kg)} — the most by weight. ${
          topByKg.name.toLowerCase().includes('plastic') ? 'Plastic takes up volume and weight — great recycling impact!'
          : topByKg.name.toLowerCase().includes('paper')  ? 'Paper/cardboard is one of the easiest to recycle in bulk.'
          : 'Tracking the heaviest type helps plan collection capacity.'
        }`,
      });
    }
  }

  return {
    alerts,
    rewardSuggestions,
    scheduleSuggestions,
    insightFeed,
    healthScores,
    retentionStats,
    dowCounts,
    hourCounts,
  };
};