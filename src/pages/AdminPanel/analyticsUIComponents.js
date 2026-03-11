// ─── analyticsUIComponents.js ─────────────────────────────────────────────────
// Reusable UI primitives — all fully responsive from 320 px upward.

import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Layout primitives
// ─────────────────────────────────────────────────────────────────────────────

export const Skeleton = ({ className = '' }) => (
  <div className={`animate-pulse bg-gray-200 rounded-xl ${className}`} />
);

export const Card = ({ children, className = '' }) => (
  <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5 ${className}`}>
    {children}
  </div>
);

export const SecHead = ({ icon, title, subtitle, badge, badgeColor = 'bg-gray-100 text-gray-500' }) => (
  <div className="flex items-start gap-2 sm:gap-3 mb-3 sm:mb-4">
    <span className="text-lg sm:text-xl shrink-0 mt-0.5">{icon}</span>
    <div className="flex-1 min-w-0">
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        <p className="text-xs sm:text-sm font-bold text-gray-900 leading-tight">{title}</p>
        {badge && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${badgeColor}`}>{badge}</span>
        )}
      </div>
      {subtitle && <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5 leading-relaxed">{subtitle}</p>}
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// KPI card — big number + label + optional sub + optional trend badge
// ─────────────────────────────────────────────────────────────────────────────
export const KpiCard = ({ icon, value, label, sub, bg, txt, trend, trendPos }) => (
  <div className={`bg-gradient-to-br ${bg} rounded-2xl p-3 sm:p-4 border border-white shadow-sm flex flex-col gap-1`}>
    <div className="flex items-start justify-between gap-1 min-w-0">
      <span className="text-xl sm:text-2xl shrink-0">{icon}</span>
      {trend && (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
          trendPos ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'
        }`}>
          {trend}
        </span>
      )}
    </div>
    {/* Value scales down on small screens */}
    <div className={`text-lg sm:text-xl lg:text-2xl font-extrabold ${txt} leading-none break-all`}>{value}</div>
    <div className="text-[10px] sm:text-[11px] text-gray-700 font-semibold leading-tight">{label}</div>
    {sub && <div className="text-[9px] sm:text-[10px] text-gray-400 leading-tight">{sub}</div>}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Progress card — value + bar + "what this means" line
// Bug fix: colour derived directly, not via brittle string-replace on Tailwind class
// ─────────────────────────────────────────────────────────────────────────────
const BAR_TO_TEXT = {
  'bg-emerald-500': 'text-emerald-600',
  'bg-amber-400':   'text-amber-500',
  'bg-amber-300':   'text-amber-400',
  'bg-teal-500':    'text-teal-600',
  'bg-rose-500':    'text-rose-600',
  'bg-gray-300':    'text-gray-500',
};

export const ProgressCard = ({ label, value, sub, pct, barColor, meaning }) => {
  const textColor = BAR_TO_TEXT[barColor] || 'text-gray-700';
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-4 space-y-1.5 sm:space-y-2">
      <p className="text-[10px] sm:text-[11px] text-gray-400 font-semibold leading-tight">{label}</p>
      <p className={`text-xl sm:text-2xl font-extrabold leading-none break-all ${textColor}`}>{value}</p>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} rounded-full transition-all duration-700`}
          style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
      <p className="text-[10px] text-gray-400 leading-snug">{sub}</p>
      {meaning && (
        <p className="text-[10px] sm:text-[11px] text-gray-600 bg-gray-50 rounded-lg px-2 py-1 leading-snug">
          💬 {meaning}
        </p>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Alert + suggestion cards
// ─────────────────────────────────────────────────────────────────────────────
export const ALERT_STYLES = {
  critical: { bar: 'bg-red-500',     bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-800',     tag: 'bg-red-100 text-red-700',        tagLabel: '🔴 Urgent'        },
  warning:  { bar: 'bg-amber-500',   bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-800',   tag: 'bg-amber-100 text-amber-700',    tagLabel: '🟡 Watch this'    },
  info:     { bar: 'bg-blue-500',    bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-800',    tag: 'bg-blue-100 text-blue-700',      tagLabel: '🔵 Good to know'  },
  success:  { bar: 'bg-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', tag: 'bg-emerald-100 text-emerald-700', tagLabel: '🟢 Great news!'  },
};

export const AlertCard = ({ alert, onDismiss }) => {
  const s = ALERT_STYLES[alert.level] || ALERT_STYLES.info;
  return (
    <div className={`relative flex gap-2 sm:gap-3 p-3 sm:p-4 rounded-xl border ${s.bg} ${s.border} overflow-hidden`}>
      <div className={`absolute left-0 inset-y-0 w-1.5 ${s.bar} rounded-l-xl`} />
      <span className="text-lg sm:text-xl shrink-0 ml-1">{alert.icon}</span>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${s.tag}`}>{s.tagLabel}</span>
          <p className={`text-[11px] sm:text-xs font-bold ${s.text}`}>{alert.title}</p>
        </div>
        <p className={`text-[11px] sm:text-xs leading-relaxed ${s.text} opacity-90`}>{alert.message}</p>
        {alert.action && (
          <p className={`text-[10px] sm:text-[11px] font-semibold ${s.text} opacity-70`}>
            👉 {alert.action}
          </p>
        )}
      </div>
      <button onClick={onDismiss}
        className={`shrink-0 text-xl leading-none opacity-30 hover:opacity-70 transition ${s.text} self-start`}>×</button>
    </div>
  );
};

const SUGGESTION_STYLES = {
  optimize:      { border: 'border-violet-200', bg: 'bg-violet-50', tag: 'bg-violet-100 text-violet-700', tagLabel: '💡 Optimize'     },
  diversify:     { border: 'border-blue-200',   bg: 'bg-blue-50',   tag: 'bg-blue-100 text-blue-700',     tagLabel: '🔀 Add variety'  },
  remove:        { border: 'border-rose-200',   bg: 'bg-rose-50',   tag: 'bg-rose-100 text-rose-700',     tagLabel: '🗑️ Remove'       },
  accessibility: { border: 'border-amber-200',  bg: 'bg-amber-50',  tag: 'bg-amber-100 text-amber-700',   tagLabel: '🎯 Improve reach'},
};

export const SuggestionCard = ({ icon, title, message, type }) => {
  const s = SUGGESTION_STYLES[type] || { border: 'border-gray-200', bg: 'bg-gray-50', tag: 'bg-gray-100 text-gray-600', tagLabel: '💬 Tip' };
  return (
    <div className={`p-3 sm:p-4 rounded-xl border ${s.bg} ${s.border} space-y-1.5`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-lg shrink-0">{icon}</span>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${s.tag}`}>{s.tagLabel}</span>
      </div>
      <p className="text-[11px] sm:text-xs font-bold text-gray-800">{title}</p>
      <p className="text-[11px] sm:text-xs text-gray-600 leading-relaxed">{message}</p>
    </div>
  );
};

export const InsightItem = ({ icon, title, message, color = 'text-gray-700' }) => (
  <div className="flex gap-2 sm:gap-3 py-2.5 sm:py-3 border-b border-gray-100 last:border-0">
    <span className="text-base sm:text-lg shrink-0 mt-0.5">{icon}</span>
    <div className="min-w-0">
      {title && <p className="text-[11px] sm:text-xs font-bold text-gray-800 mb-0.5">{title}</p>}
      <p className={`text-[11px] sm:text-xs leading-relaxed ${color}`}>{message}</p>
    </div>
  </div>
);

export const EmptyState = ({ icon = '📭', title, message }) => (
  <div className="flex flex-col items-center justify-center py-8 sm:py-10 gap-2 text-center">
    <span className="text-3xl sm:text-4xl">{icon}</span>
    {title && <p className="text-xs sm:text-sm font-bold text-gray-600">{title}</p>}
    {message && <p className="text-[11px] sm:text-xs text-gray-400 max-w-xs leading-relaxed">{message}</p>}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Health score pill — radial gauge, responsive size
// ─────────────────────────────────────────────────────────────────────────────
export const HealthPill = ({ label, score, sub }) => {
  const color =
    score >= 70 ? { ring: 'ring-emerald-400', text: 'text-emerald-600', bg: 'bg-emerald-50', fill: '#10b981', grade: 'Good' }
    : score >= 40 ? { ring: 'ring-amber-400', text: 'text-amber-600',   bg: 'bg-amber-50',   fill: '#f59e0b', grade: 'Fair' }
    :               { ring: 'ring-rose-400',  text: 'text-rose-600',    bg: 'bg-rose-50',    fill: '#ef4444', grade: 'Low'  };

  const r    = 26;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  return (
    // On mobile: compact flex-row. sm+: flex-col centered
    <div className={`flex flex-row sm:flex-col items-center gap-2 sm:gap-1.5 p-2 sm:p-3 rounded-2xl ${color.bg} ring-1 ${color.ring} min-w-0`}>
      {/* Radial gauge — 56 px on xs, 64 px on sm+ */}
      <div className="relative shrink-0" style={{ width: 56, height: 56 }}>
        <svg width={56} height={56} viewBox="0 0 56 56">
          <circle cx={28} cy={28} r={r} fill="none" stroke="#e5e7eb" strokeWidth="6" />
          <circle cx={28} cy={28} r={r} fill="none"
            stroke={color.fill} strokeWidth="6"
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeLinecap="round"
            transform="rotate(-90 28 28)" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-sm font-extrabold leading-none ${color.text}`}>{score}</span>
          <span className="text-[8px] text-gray-400">/ 100</span>
        </div>
      </div>
      {/* Text — left-aligned on xs, centered on sm+ */}
      <div className="flex-1 sm:flex-none sm:text-center min-w-0 overflow-hidden">
        <p className="text-[11px] font-bold text-gray-700 leading-tight truncate">{label}</p>
        <span className={`text-[10px] font-bold ${color.text}`}>{color.grade}</span>
        {sub && <p className="text-[10px] text-gray-500 leading-tight hidden sm:block truncate">{sub}</p>}
      </div>
    </div>
  );
};