// ─── analyticsConstants.js ────────────────────────────────────────────────────
// Shared constants and pure utility helpers for the Analytics module.
// No React imports — safe to use in any context including tests.

// ─── Date Presets ─────────────────────────────────────────────────────────────
export const DATE_PRESETS = [
  { label: '7 days',  days: 7   },
  { label: '30 days', days: 30  },
  { label: '90 days', days: 90  },
  { label: '1 year',  days: 365 },
];

// ─── Chart Colours ────────────────────────────────────────────────────────────
export const PIE_COLORS = [
  '#10b981','#3b82f6','#f59e0b','#ef4444',
  '#8b5cf6','#06b6d4','#ec4899','#84cc16',
];

/**
 * Returns a colour set (text/bg/bar/border/label) based on a numeric value
 * compared to "good" and "warn" thresholds (higher = better).
 */
export const statusColor = (value, { good, warn }) => {
  if (value >= good) return { text: 'text-emerald-600', bg: 'bg-emerald-50', bar: 'bg-emerald-500', border: 'border-emerald-200', dot: 'bg-emerald-500', label: 'Good' };
  if (value >= warn) return { text: 'text-amber-600',   bg: 'bg-amber-50',   bar: 'bg-amber-400',   border: 'border-amber-200',   dot: 'bg-amber-400',   label: 'Fair' };
  return               { text: 'text-rose-600',   bg: 'bg-rose-50',    bar: 'bg-rose-500',    border: 'border-rose-200',    dot: 'bg-rose-500',    label: 'Low'  };
};

// Short and full day-of-week names
export const DOW_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
export const DOW_FULL  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

// ─── Date Helpers ─────────────────────────────────────────────────────────────
export const makeRange = (days) => ({
  start: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
  end:   new Date(),
});

export const toDate = (val) => {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val.toDate === 'function') return val.toDate();
  if (typeof val === 'string' || typeof val === 'number') return new Date(val);
  return null;
};

// ─── Formatters ───────────────────────────────────────────────────────────────
export const fmtDay = (d) =>
  d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export const fmtNum = (n) => {
  if (n == null || n === '' || n === '—') return '—';
  const num = Number(n);
  return isNaN(num) ? '—' : num.toLocaleString();
};

/** "+12%" or "-5%" from a decimal ratio (0.12 = 12%). */
export const fmtGrowth = (growth) =>
  `${growth >= 0 ? '+' : ''}${(growth * 100).toFixed(1)}%`;

/** A plain-English sentence describing the growth direction. */
export const trendSentence = (growth) =>
  growth >  0.20 ? 'Activity is growing fast — great momentum!'
  : growth >  0.05 ? 'Slowly but steadily growing.'
  : growth > -0.05 ? 'Holding steady — no big changes.'
  : growth > -0.20 ? 'Starting to slow down. Consider sending a reminder.'
  : 'Activity has dropped significantly. Action recommended.';

/** Format kilograms — shows tonnes if ≥1000 kg */
export const fmtKg = (n) => {
  if (n == null || n === '' || isNaN(Number(n))) return '—';
  const num = Number(n);
  return num >= 1000 ? `${(num / 1000).toFixed(2)} t` : `${num.toFixed(1)} kg`;
};

/** Plain-English sentence about kg collection trend. */
export const kgTrendSentence = (growth) =>
  growth >  0.20 ? 'Waste collection is growing fast — great progress!'
  : growth >  0.05 ? 'Waste collection is slowly increasing.'
  : growth > -0.05 ? 'Amount collected is steady with no major changes.'
  : growth > -0.20 ? 'Less waste is being collected lately. Consider a reminder.'
  : 'Waste collection has dropped significantly. Action recommended.';