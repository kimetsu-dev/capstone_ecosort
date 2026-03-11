// ─── analyticsCharts.js ───────────────────────────────────────────────────────
// All chart components — fully responsive from 320 px upward.
// Pure SVG / CSS. No third-party chart library.

import React, { useState, useRef, useCallback } from 'react';
import { PIE_COLORS, DOW_SHORT, fmtNum, fmtKg } from './analyticsConstants';

// ─────────────────────────────────────────────────────────────────────────────
// Shared helper — converts SVG-coordinate tooltip position to % so it stays
// correct regardless of how the SVG is scaled by the browser.
// ─────────────────────────────────────────────────────────────────────────────
const svgTooltipStyle = (svgX, svgW, svgY, svgH) => ({
  position: 'absolute',
  top:  `${(svgY / svgH) * 100}%`,
  left: `${(svgX / svgW) * 100}%`,
  transform: 'translate(-50%, -130%)',
  pointerEvents: 'none',
  zIndex: 20,
});

// ─────────────────────────────────────────────────────────────────────────────
// 1.  AREA LINE CHART
// ─────────────────────────────────────────────────────────────────────────────
export const AreaLineChart = ({
  data = [],
  color = '#10b981',
  height = 200,
  yLabel = 'Drop-offs',
  emptyText = 'No data in this period',
  goalLine = null,
}) => {
  const [tooltip, setTooltip] = useState(null);

  // SVG coordinate space — browser scales to fit container width automatically
  const W   = 800;
  const H   = height;
  const PAD = { top: 16, right: 20, bottom: 36, left: 44 };
  const cW  = W - PAD.left - PAD.right;
  const cH  = H - PAD.top  - PAD.bottom;

  if (!data.length) return (
    <div style={{ height }} className="flex flex-col items-center justify-center gap-2 text-gray-400">
      <span className="text-3xl">📭</span>
      <span className="text-sm">{emptyText}</span>
    </div>
  );

  const maxVal = Math.max(...data.map(d => d.submissions), goalLine || 0, 1);
  const xStep  = cW / Math.max(data.length - 1, 1);

  const pts = data.map((d, i) => ({
    x:     PAD.left + i * xStep,
    y:     PAD.top  + cH - (d.submissions / maxVal) * cH,
    label: d.date,
    val:   d.submissions,
  }));

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${pts[pts.length - 1].x},${PAD.top + cH} L${pts[0].x},${PAD.top + cH} Z`;

  const yTicks     = [0, 0.25, 0.5, 0.75, 1].map(r => ({ y: PAD.top + cH - r * cH, val: Math.round(r * maxVal) }));
  const labelEvery = Math.max(1, Math.ceil(data.length / 7));
  const xLabels    = pts.filter((_, i) => i % labelEvery === 0 || i === pts.length - 1);

  const avg   = data.reduce((s, d) => s + d.submissions, 0) / data.length;
  const avgY  = PAD.top + cH - (avg / maxVal) * cH;
  const goalY = goalLine != null ? PAD.top + cH - (goalLine / maxVal) * cH : null;
  const gradId = `ag-${color.replace('#', '')}`;

  return (
    <div className="relative">
      {/* preserveAspectRatio="xMidYMid meet" keeps text legible; width 100% fills container */}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height, display: 'block' }}
        preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={color} stopOpacity="0.20" />
            <stop offset="100%" stopColor={color} stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={t.y} x2={PAD.left + cW} y2={t.y} stroke="#f0f0f0" strokeWidth="1" />
            <text x={PAD.left - 6} y={t.y + 4} textAnchor="end" fontSize="11" fill="#9ca3af">{t.val}</text>
          </g>
        ))}

        <text x={10} y={PAD.top + cH / 2} textAnchor="middle" fontSize="11" fill="#9ca3af"
          transform={`rotate(-90,10,${PAD.top + cH / 2})`}>{yLabel}</text>

        {xLabels.map((p, i) => (
          <text key={i} x={p.x} y={H - 6} textAnchor="middle" fontSize="11" fill="#9ca3af">{p.label}</text>
        ))}

        {/* Average dashed line */}
        <line x1={PAD.left} y1={avgY} x2={PAD.left + cW} y2={avgY}
          stroke="#d1d5db" strokeWidth="1" strokeDasharray="4,3" />
        <text x={PAD.left + cW - 2} y={avgY - 4} textAnchor="end" fontSize="10" fill="#9ca3af">avg</text>

        {goalY != null && (
          <>
            <line x1={PAD.left} y1={goalY} x2={PAD.left + cW} y2={goalY}
              stroke="#10b981" strokeWidth="1.5" strokeDasharray="6,3" />
            <text x={PAD.left + cW - 2} y={goalY - 4} textAnchor="end" fontSize="10" fill="#10b981" fontWeight="bold">goal</text>
          </>
        )}

        <path d={areaPath} fill={`url(#${gradId})`} />
        <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

        {pts.map((p, i) => (
          <rect key={i} x={p.x - xStep / 2} y={PAD.top} width={xStep} height={cH}
            fill="transparent" style={{ cursor: 'pointer' }}
            onMouseEnter={() => setTooltip(p)} onMouseLeave={() => setTooltip(null)}
            onTouchStart={() => setTooltip(p)}  onTouchEnd={() => setTimeout(() => setTooltip(null), 1500)}
          />
        ))}
        {tooltip && <circle cx={tooltip.x} cy={tooltip.y} r="5" fill={color} stroke="white" strokeWidth="2" />}
      </svg>

      {tooltip && (
        <div style={svgTooltipStyle(tooltip.x, W, tooltip.y, H)}
          className="bg-gray-900 text-white text-xs px-2.5 py-1.5 rounded-lg shadow-xl whitespace-nowrap">
          <span className="font-semibold">{tooltip.label}</span>
          <span className="ml-2 font-bold" style={{ color }}>{fmtNum(tooltip.val)}</span>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 2.  DONUT CHART — fluid size, capped by container
// ─────────────────────────────────────────────────────────────────────────────
export const DonutChart = ({ data = [], size = 200 }) => {
  const [hovered, setHovered] = useState(null);
  // Cap at 200; on very small screens the card wrapper constrains it
  const S     = Math.min(size, 200);
  const R     = S * 0.36;
  const cx    = S / 2;
  const cy    = S / 2;
  const circ  = 2 * Math.PI * R;
  const total = data.reduce((s, d) => s + d.value, 0) || 1;

  let offset = 0;
  const segs = data.map((d, i) => {
    const pct  = d.value / total;
    const dash = pct * circ;
    const gap  = circ - dash;
    const seg  = { ...d, dash, gap, offset, color: PIE_COLORS[i % PIE_COLORS.length], pct };
    offset += dash;
    return seg;
  });

  const active = hovered != null ? segs[hovered] : null;
  const sw     = S * 0.11; // stroke-width proportional to chart size

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      {/* Donut — max-width so it doesn't blow out narrow cards */}
      <div className="relative" style={{ width: S, height: S, maxWidth: '100%' }}>
        <svg width={S} height={S} style={{ display: 'block' }}>
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="#f3f4f6" strokeWidth={sw} />
          {segs.map((s, i) => (
            <circle key={i} cx={cx} cy={cy} r={R} fill="none"
              stroke={s.color}
              strokeWidth={hovered === i ? sw * 1.25 : sw}
              strokeDasharray={`${s.dash} ${s.gap}`}
              strokeDashoffset={-s.offset + circ * 0.25}
              style={{ cursor: 'pointer', transition: 'stroke-width 0.15s' }}
              transform={`rotate(-90 ${cx} ${cy})`}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onTouchStart={() => setHovered(i)}
              onTouchEnd={() => setTimeout(() => setHovered(null), 1500)}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-2">
          {active ? (
            <>
              <span className="text-lg font-extrabold leading-none" style={{ color: active.color }}>
                {Math.round(active.pct * 100)}%
              </span>
              <span className="text-[9px] text-gray-500 mt-0.5 leading-tight">{active.name}</span>
              <span className="text-[9px] text-gray-400">{fmtNum(active.value)} drops</span>
            </>
          ) : (
            <>
              <span className="text-xl font-extrabold text-gray-800 leading-none">{fmtNum(total)}</span>
              <span className="text-[10px] text-gray-400 mt-0.5">total drops</span>
            </>
          )}
        </div>
      </div>

      {/* Legend — 2 columns, truncates long names */}
      <div className="w-full grid grid-cols-2 gap-x-3 gap-y-1.5 px-1">
        {data.slice(0, 8).map((d, i) => (
          <div key={i} className="flex items-center gap-1.5 min-w-0">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
            <span className="text-[11px] text-gray-600 truncate min-w-0">{d.name}</span>
            <span className="text-[11px] text-gray-400 ml-auto shrink-0">{Math.round((d.value / total) * 100)}%</span>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-gray-400 text-center">Tap or hover a slice to see details</p>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 3.  HORIZONTAL BAR CHART
// ─────────────────────────────────────────────────────────────────────────────
export const HBarChart = ({ data = [], showRank = true }) => {
  const [hovered, setHovered] = useState(null);
  const max = Math.max(...data.map(d => d.value), 1);

  return (
    <div className="space-y-2.5 sm:space-y-3">
      {data.map((d, i) => {
        const pct = Math.max(6, (d.value / max) * 100);
        return (
          <div key={d.name} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
            <div className="flex items-center justify-between mb-1 gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                {showRank && (
                  <span className="text-[10px] font-bold text-gray-300 w-4 shrink-0 text-right">#{i + 1}</span>
                )}
                <span className="text-[11px] sm:text-xs font-semibold text-gray-700 truncate" title={d.name}>{d.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] sm:text-xs font-bold text-gray-800 whitespace-nowrap">{fmtNum(d.value)}</span>
                {d.kg != null && d.kg > 0 && (
                  <span className="text-[10px] text-gray-400 whitespace-nowrap hidden sm:inline">{d.kg} kg</span>
                )}
              </div>
            </div>
            <div className="h-4 sm:h-5 bg-gray-100 rounded-full overflow-hidden relative">
              <div className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${pct}%`,
                  background: hovered === i ? PIE_COLORS[i % PIE_COLORS.length] : `${PIE_COLORS[i % PIE_COLORS.length]}cc`,
                }} />
              {pct > 22 && (
                <span className="absolute left-2.5 top-0 bottom-0 flex items-center text-[10px] text-white font-bold pointer-events-none">
                  {Math.round((d.value / max) * 100)}%
                </span>
              )}
            </div>
          </div>
        );
      })}
      <p className="text-[11px] text-gray-400 pt-1">Bar length = relative share. Number = actual count.</p>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 4.  DAY-OF-WEEK HEATMAP
// ─────────────────────────────────────────────────────────────────────────────
export const DayHeatmap = ({ counts = Array(7).fill(0) }) => {
  const [hovered, setHovered] = useState(null);
  const max     = Math.max(...counts, 1);
  const total   = counts.reduce((s, v) => s + v, 0) || 1;
  const peakIdx = counts.indexOf(Math.max(...counts));

  return (
    <div className="space-y-2.5 sm:space-y-3">
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {counts.map((v, i) => {
          const intensity = v / max;
          const isPeak    = i === peakIdx;
          return (
            <div key={i} className="flex flex-col items-center gap-0.5 sm:gap-1 cursor-default"
              onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}
              onTouchStart={() => setHovered(i)} onTouchEnd={() => setTimeout(() => setHovered(null), 1500)}
            >
              <div className="w-full rounded-lg sm:rounded-xl flex items-center justify-center font-bold transition-all duration-200 relative"
                style={{
                  height: 44,
                  fontSize: 11,
                  background: isPeak ? '#10b981' : intensity > 0 ? `rgba(16,185,129,${0.12 + intensity * 0.55})` : '#f3f4f6',
                  color: intensity > 0.5 || isPeak ? 'white' : '#374151',
                  outline: hovered === i ? '2px solid #10b981' : 'none',
                }}
              >
                {isPeak && <span className="absolute -top-1.5 text-[9px]">🔥</span>}
                {v > 0 ? fmtNum(v) : '—'}
              </div>
              <span className={`text-[9px] sm:text-[11px] font-semibold ${isPeak ? 'text-emerald-600' : 'text-gray-400'}`}>
                {DOW_SHORT[i]}
              </span>
            </div>
          );
        })}
      </div>

      {hovered !== null && counts[hovered] > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 sm:px-4 py-2 text-xs sm:text-sm text-gray-700">
          <strong>{DOW_SHORT[hovered]}:</strong> {fmtNum(counts[hovered])} drop-offs —{' '}
          {Math.round((counts[hovered] / total) * 100)}% of weekly activity
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="text-[10px] sm:text-[11px] text-gray-400 shrink-0">Less</span>
        <div className="flex gap-0.5 flex-1 h-2">
          {[0.1, 0.25, 0.45, 0.65, 0.85, 1].map((op, i) => (
            <div key={i} className="flex-1 rounded-sm" style={{ background: `rgba(16,185,129,${op})` }} />
          ))}
        </div>
        <span className="text-[10px] sm:text-[11px] text-gray-400 shrink-0">Most</span>
      </div>
      <p className="text-[10px] sm:text-[11px] text-gray-400">
        🔥 = busiest day. Schedule collections on or after that day.
      </p>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 5.  PEAK HOURS BAR CHART
//     Touch-friendly: tapping a bar shows the callout for 2 s.
//     On very small screens (≤ 360 px) shows every 4th label instead of every 3rd.
// ─────────────────────────────────────────────────────────────────────────────
export const HourBarChart = ({ hourCounts = Array(24).fill(0) }) => {
  const [hovered, setHovered] = useState(null);
  const max   = Math.max(...hourCounts, 1);
  const total = hourCounts.reduce((s, v) => s + v, 0) || 1;
  const peakH = hourCounts.indexOf(Math.max(...hourCounts));
  const containerRef = useRef(null);

  const fmtHour = (h) => `${h % 12 || 12}${h >= 12 ? 'PM' : 'AM'}`;

  // Show label every 4 hours, always show peak
  const showLabel = (i) => i % 4 === 0 || i === 23 || i === peakH;

  const handleTouch = useCallback((i) => {
    setHovered(i);
    setTimeout(() => setHovered(null), 2000);
  }, []);

  return (
    <div className="space-y-2" ref={containerRef}>
      {/* Bar area — 64px mobile, 80px sm+ */}
      <div className="flex items-end gap-px sm:gap-[2px] px-0.5 h-16 sm:h-20">
        {hourCounts.map((v, i) => {
          const barH   = max > 0 ? Math.max(2, (v / max) * 58) : 2;
          const isPeak = i === peakH;
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end cursor-default"
              onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}
              onTouchStart={() => handleTouch(i)}
            >
              <div className="w-full rounded-t-sm transition-all duration-200"
                style={{
                  height: barH,
                  background: isPeak ? '#f59e0b' : hovered === i ? '#10b981' : v > 0 ? '#10b98155' : '#e5e7eb',
                }} />
            </div>
          );
        })}
      </div>

      {/* X labels */}
      <div className="flex gap-px sm:gap-[2px] px-0.5">
        {hourCounts.map((_, i) => (
          <div key={i} className="flex-1 text-center overflow-hidden">
            {showLabel(i) && (
              <span className={`text-[8px] sm:text-[9px] leading-none ${i === peakH ? 'text-amber-500 font-bold' : 'text-gray-400'}`}>
                {fmtHour(i)}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Hover / tap callout */}
      {hovered !== null && hourCounts[hovered] > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 sm:px-4 py-2 text-xs sm:text-sm text-gray-700">
          <strong>{fmtHour(hovered)}:</strong> {fmtNum(hourCounts[hovered])} drop-offs —{' '}
          {Math.round((hourCounts[hovered] / total) * 100)}% of daily activity
        </div>
      )}

      <p className="text-[10px] sm:text-[11px] text-gray-400">
        🌟 Gold bar = busiest hour. Send reminders 1–2 hrs before this time.
      </p>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 6.  FORECAST CHART
// ─────────────────────────────────────────────────────────────────────────────
export const ForecastChart = ({
  history = [],
  forecastValue = 0,
  color = '#10b981',
  height = 180,
}) => {
  const [tooltip, setTooltip] = useState(null);

  const W   = 800;
  const H   = height;
  const PAD = { top: 16, right: 70, bottom: 36, left: 44 };
  const cW  = W - PAD.left - PAD.right;
  const cH  = H - PAD.top  - PAD.bottom;

  if (!history.length) return (
    <div style={{ height }} className="flex items-center justify-center text-xs sm:text-sm text-gray-400 text-center px-4">
      Not enough data yet — need at least 7 days.
    </div>
  );

  const fcastDay = forecastValue / 30;
  const maxVal   = Math.max(...history.map(d => d.submissions), fcastDay * 1.2, 1);
  const xStep    = cW / history.length;

  const histPts = history.map((d, i) => ({
    x:     PAD.left + i * xStep,
    y:     PAD.top  + cH - (d.submissions / maxVal) * cH,
    label: d.date,
    val:   d.submissions,
  }));

  const lastPt   = histPts[histPts.length - 1];
  const fcastX   = lastPt.x + xStep;
  const fcastY   = PAD.top + cH - (fcastDay / maxVal) * cH;
  const linePath = histPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${lastPt.x},${PAD.top + cH} L${histPts[0].x},${PAD.top + cH} Z`;
  const gradId   = `fc-${color.replace('#', '')}`;

  const yTicks     = [0, 0.5, 1].map(r => ({ y: PAD.top + cH - r * cH, val: Math.round(r * maxVal) }));
  const labelEvery = Math.max(1, Math.ceil(history.length / 6));

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height, display: 'block' }}
        preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Forecast zone */}
        <rect x={lastPt.x} y={PAD.top} width={xStep + 20} height={cH} fill="#8b5cf610" />
        <text x={lastPt.x + 4} y={PAD.top + 11} fontSize="10" fill="#8b5cf6">Forecast →</text>

        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={t.y} x2={PAD.left + cW + 20} y2={t.y} stroke="#f0f0f0" strokeWidth="1" />
            <text x={PAD.left - 6} y={t.y + 4} textAnchor="end" fontSize="11" fill="#9ca3af">{t.val}</text>
          </g>
        ))}

        {histPts.filter((_, i) => i % labelEvery === 0 || i === histPts.length - 1).map((p, i) => (
          <text key={i} x={p.x} y={H - 6} textAnchor="middle" fontSize="11" fill="#9ca3af">{p.label}</text>
        ))}

        <path d={areaPath} fill={`url(#${gradId})`} />
        <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

        {/* Forecast dot + label */}
        <line x1={lastPt.x} y1={lastPt.y} x2={fcastX} y2={fcastY}
          stroke="#8b5cf6" strokeWidth="2" strokeDasharray="6,4" />
        <circle cx={fcastX} cy={fcastY} r="6" fill="#8b5cf6" stroke="white" strokeWidth="2" />
        <text x={fcastX + 10} y={fcastY + 4} fontSize="11" fill="#8b5cf6" fontWeight="bold">
          ~{fmtNum(Math.round(fcastDay))}/day
        </text>

        {histPts.map((p, i) => (
          <rect key={i} x={p.x - xStep / 2} y={PAD.top} width={xStep} height={cH}
            fill="transparent" style={{ cursor: 'pointer' }}
            onMouseEnter={() => setTooltip(p)} onMouseLeave={() => setTooltip(null)}
            onTouchStart={() => setTooltip(p)} onTouchEnd={() => setTimeout(() => setTooltip(null), 1500)}
          />
        ))}
        {tooltip && <circle cx={tooltip.x} cy={tooltip.y} r="5" fill={color} stroke="white" strokeWidth="2" />}
      </svg>

      {tooltip && (
        <div style={svgTooltipStyle(tooltip.x, W, tooltip.y, H)}
          className="bg-gray-900 text-white text-xs px-2.5 py-1.5 rounded-lg shadow-xl whitespace-nowrap">
          {tooltip.label}: <strong>{fmtNum(tooltip.val)} drop-offs</strong>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-5 mt-2">
        {[
          { line: color,     dash: false, label: 'Actual drop-offs'    },
          { line: '#8b5cf6', dash: true,  label: 'Forecast'            },
          { bg: '#8b5cf610', label: 'Forecast zone'                    },
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-1.5">
            {item.bg
              ? <div className="w-4 h-3 rounded-sm" style={{ background: item.bg, border: '1px solid #e9d5ff' }} />
              : <div className="w-5 h-0" style={{ borderTop: `2px ${item.dash ? 'dashed' : 'solid'} ${item.line}` }} />
            }
            <span className="text-[10px] sm:text-[11px] text-gray-500">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 7.  GOAL PROGRESS BAR
// ─────────────────────────────────────────────────────────────────────────────
export const GoalBar = ({ current, goal, label = '', color = '#10b981' }) => {
  const pct     = goal > 0 ? Math.min(100, (current / goal) * 100) : 0;
  const reached = pct >= 100;
  const close   = pct >= 80;

  return (
    <div className="space-y-1.5 sm:space-y-2">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <span className="text-xs sm:text-sm font-semibold text-gray-700 min-w-0">{label}</span>
        <span className="text-xs text-gray-500 shrink-0">
          <span className="font-bold text-gray-900">{fmtNum(current)}</span> / {fmtNum(goal)}
        </span>
      </div>
      <div className="h-5 sm:h-6 bg-gray-100 rounded-full overflow-hidden relative">
        <div className="h-full rounded-full transition-all duration-700 flex items-center justify-end pr-2 sm:pr-3"
          style={{ width: `${Math.max(pct, 4)}%`, background: reached ? '#10b981' : close ? '#f59e0b' : color }}>
          {pct > 20 && <span className="text-[10px] sm:text-[11px] text-white font-bold">{Math.round(pct)}%</span>}
        </div>
        {pct <= 20 && (
          <span className="absolute left-2.5 top-0 bottom-0 flex items-center text-[11px] text-gray-500 font-bold">
            {Math.round(pct)}%
          </span>
        )}
      </div>
      <p className="text-[10px] sm:text-[11px] text-gray-500">
        {reached ? `🎉 Goal reached! You're at ${Math.round(pct)}%.`
          : close  ? `Almost there — ${fmtNum(goal - current)} more needed.`
          : `${fmtNum(goal - current)} more needed to hit the goal.`}
      </p>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 8.  VELOCITY CHART — bidirectional, responsive label width
// ─────────────────────────────────────────────────────────────────────────────
export const VelocityChart = ({ rewards = [] }) => {
  const [hovered, setHovered] = useState(null);
  const maxAbs = Math.max(...rewards.map(r => Math.abs(r.velocityPct)), 1);

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-[10px] sm:text-[11px] text-gray-400 px-1 mb-1">
        <span>← Less popular</span>
        <span className="font-semibold text-gray-500 hidden sm:inline">0% (no change)</span>
        <span>More popular →</span>
      </div>

      {rewards.map((r, i) => {
        const isPos = r.velocityPct >= 0;
        const barW  = Math.min(48, (Math.abs(r.velocityPct) / maxAbs) * 48);
        return (
          <div key={r.rewardName} className="flex items-center gap-1.5"
            onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
            {/* Name: takes up ~30% of width, truncated */}
            <span className="text-[10px] sm:text-[11px] text-gray-500 truncate text-right shrink-0"
              style={{ width: '28%' }}
              title={r.rewardName}>{r.rewardName}</span>

            {/* Bidirectional bar */}
            <div className="flex-1 flex items-center h-6">
              {/* Left (negative) half */}
              <div className="w-1/2 flex justify-end h-full items-center">
                {!isPos
                  ? <div className="h-3.5 rounded-l-full transition-all duration-300"
                      style={{ width: `${barW * 2}%`, background: hovered === i ? '#ef4444' : '#fca5a5' }} />
                  : <div className="h-3.5 bg-gray-100 rounded-l-full w-full" />
                }
              </div>
              <div className="w-px h-4 bg-gray-300 shrink-0" />
              {/* Right (positive) half */}
              <div className="w-1/2 flex justify-start h-full items-center">
                {isPos
                  ? <div className="h-3.5 rounded-r-full transition-all duration-300"
                      style={{ width: `${barW * 2}%`, background: hovered === i ? '#10b981' : '#6ee7b7' }} />
                  : <div className="h-3.5 bg-gray-100 rounded-r-full w-full" />
                }
              </div>
            </div>

            <span className={`text-[10px] sm:text-[11px] font-bold shrink-0 text-right ${isPos ? 'text-emerald-600' : 'text-rose-500'}`}
              style={{ width: '13%' }}>
              {isPos ? '+' : ''}{r.velocityPct}%
            </span>
          </div>
        );
      })}

      <p className="text-[10px] sm:text-[11px] text-gray-400 pt-1">
        Green = gaining popularity, red = losing it. Based on the last 4 weeks vs the 4 before that.
      </p>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 9.  WASTE KG AREA CHART — kg collected over time (dual: count + kg)
//     data: [{ date, submissions, kg }]
// ─────────────────────────────────────────────────────────────────────────────
export const WasteKgChart = ({ data = [], height = 200 }) => {
  const [tooltip, setTooltip] = useState(null);
  const [mode, setMode]       = useState('kg'); // 'kg' | 'both'

  const W   = 800;
  const H   = height;
  const PAD = { top: 20, right: 24, bottom: 40, left: 52 };
  const cW  = W - PAD.left - PAD.right;
  const cH  = H - PAD.top  - PAD.bottom;

  if (!data.length || !data.some(d => d.kg > 0)) return (
    <div style={{ height }} className="flex flex-col items-center justify-center gap-2 text-gray-400">
      <span className="text-3xl">⚖️</span>
      <span className="text-sm text-center">No weight data recorded yet.<br/>Ask members to enter weight when submitting.</span>
    </div>
  );

  const maxKg   = Math.max(...data.map(d => d.kg || 0), 1);
  const maxSubs = Math.max(...data.map(d => d.submissions || 0), 1);
  const xStep   = cW / Math.max(data.length - 1, 1);

  const kgPts = data.map((d, i) => ({
    x: PAD.left + i * xStep,
    y: PAD.top  + cH - ((d.kg || 0) / maxKg) * cH,
    label: d.date, val: d.kg || 0, subs: d.submissions || 0,
  }));

  const subsPts = data.map((d, i) => ({
    x: PAD.left + i * xStep,
    y: PAD.top  + cH - ((d.submissions || 0) / maxSubs) * cH,
  }));

  const kgLine   = kgPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const kgArea   = `${kgLine} L${kgPts[kgPts.length-1].x},${PAD.top+cH} L${kgPts[0].x},${PAD.top+cH} Z`;
  const subsLine = subsPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const yTicks     = [0, 0.25, 0.5, 0.75, 1].map(r => ({ y: PAD.top + cH - r * cH, val: fmtKg(r * maxKg) }));
  const labelEvery = Math.max(1, Math.ceil(data.length / 7));
  const xLabels    = kgPts.filter((_, i) => i % labelEvery === 0 || i === kgPts.length - 1);
  const avgKg      = data.reduce((s, d) => s + (d.kg || 0), 0) / data.length;
  const avgY       = PAD.top + cH - (avgKg / maxKg) * cH;

  return (
    <div>
      {/* Mode toggle */}
      <div className="flex gap-1 mb-2">
        {[{ id: 'kg', label: '⚖️ Weight only' }, { id: 'both', label: '📊 Weight + Count' }].map(m => (
          <button key={m.id} onClick={() => setMode(m.id)}
            className={`text-[10px] sm:text-[11px] font-bold px-2.5 py-1 rounded-lg border transition ${
              mode === m.id ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
            }`}>{m.label}</button>
        ))}
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height, display: 'block' }}
          preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="kg-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#0d9488" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#0d9488" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {yTicks.map((t, i) => (
            <g key={i}>
              <line x1={PAD.left} y1={t.y} x2={PAD.left + cW} y2={t.y} stroke="#f0f0f0" strokeWidth="1" />
              <text x={PAD.left - 6} y={t.y + 4} textAnchor="end" fontSize="10" fill="#9ca3af">{t.val}</text>
            </g>
          ))}

          <text x={12} y={PAD.top + cH / 2} textAnchor="middle" fontSize="10" fill="#9ca3af"
            transform={`rotate(-90,12,${PAD.top + cH / 2})`}>Weight</text>

          {xLabels.map((p, i) => (
            <text key={i} x={p.x} y={H - 6} textAnchor="middle" fontSize="10" fill="#9ca3af">{p.label}</text>
          ))}

          {/* Avg dashed line */}
          <line x1={PAD.left} y1={avgY} x2={PAD.left + cW} y2={avgY}
            stroke="#d1d5db" strokeWidth="1" strokeDasharray="4,3" />
          <text x={PAD.left + cW - 2} y={avgY - 4} textAnchor="end" fontSize="10" fill="#9ca3af">avg</text>

          <path d={kgArea} fill="url(#kg-grad)" />
          <path d={kgLine} fill="none" stroke="#0d9488" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

          {/* Optional count overlay */}
          {mode === 'both' && (
            <path d={subsLine} fill="none" stroke="#6366f1" strokeWidth="1.5"
              strokeDasharray="5,3" strokeLinejoin="round" strokeLinecap="round" />
          )}

          {kgPts.map((p, i) => (
            <rect key={i} x={p.x - xStep / 2} y={PAD.top} width={xStep} height={cH}
              fill="transparent" style={{ cursor: 'pointer' }}
              onMouseEnter={() => setTooltip(p)} onMouseLeave={() => setTooltip(null)}
              onTouchStart={() => setTooltip(p)} onTouchEnd={() => setTimeout(() => setTooltip(null), 1500)} />
          ))}
          {tooltip && <circle cx={tooltip.x} cy={tooltip.y} r="5" fill="#0d9488" stroke="white" strokeWidth="2" />}
        </svg>

        {tooltip && (
          <div style={svgTooltipStyle(tooltip.x, W, tooltip.y, H)}
            className="bg-gray-900 text-white text-xs px-2.5 py-1.5 rounded-lg shadow-xl whitespace-nowrap space-y-0.5">
            <p className="font-semibold">{tooltip.label}</p>
            <p>⚖️ <strong className="text-teal-300">{fmtKg(tooltip.val)}</strong> collected</p>
            {mode === 'both' && <p>📦 <strong className="text-indigo-300">{tooltip.subs}</strong> drop-offs</p>}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-2 text-[10px] sm:text-[11px] text-gray-500">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0" style={{ borderTop: '2.5px solid #0d9488' }} />
          <span>Kg collected</span>
        </div>
        {mode === 'both' && (
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-0" style={{ borderTop: '2px dashed #6366f1' }} />
            <span>No. of drop-offs</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0" style={{ borderTop: '1px dashed #d1d5db' }} />
          <span>Average</span>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 10. KG FORECAST CHART — history area + predicted bar + numeric callouts
//     kgHistory: [{ date, kg }]   forecastKg: number (next 30 days)
// ─────────────────────────────────────────────────────────────────────────────
export const KgForecastChart = ({ kgHistory = [], forecastKg = 0, color = '#0d9488', height = 180 }) => {
  const [tooltip, setTooltip] = useState(null);

  const W   = 800;
  const H   = height;
  const PAD = { top: 20, right: 30, bottom: 36, left: 52 };
  const cW  = W - PAD.left - PAD.right;
  const cH  = H - PAD.top  - PAD.bottom;

  const histData  = kgHistory.filter(d => d.kg != null && d.kg > 0);
  if (!histData.length) return null;

  const fcastDay  = forecastKg / 30;
  const maxVal    = Math.max(...histData.map(d => d.kg), fcastDay, 1);
  const xStep     = cW / Math.max(histData.length, 1);

  const histPts   = histData.map((d, i) => ({
    x: PAD.left + i * xStep,
    y: PAD.top  + cH - (d.kg / maxVal) * cH,
    label: d.date, val: d.kg,
  }));

  const lastPt    = histPts[histPts.length - 1];
  const fcastX    = Math.min(lastPt.x + xStep * 1.5, W - PAD.right - 10);
  const fcastY    = PAD.top + cH - (fcastDay / maxVal) * cH;

  const linePath  = histPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath  = `${linePath} L${lastPt.x},${PAD.top + cH} L${histPts[0].x},${PAD.top + cH} Z`;
  const yTicks    = [0, 0.5, 1].map(r => ({ y: PAD.top + cH - r * cH, val: fmtKg(r * maxVal) }));
  const labelEvery = Math.max(1, Math.ceil(histData.length / 6));
  const gradId    = 'kgfc-grad';

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height, display: 'block' }}
        preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={color} stopOpacity="0.20" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Forecast zone */}
        <rect x={lastPt.x} y={PAD.top} width={xStep * 2 + 20} height={cH} fill="#0d948810" />
        <text x={lastPt.x + 5} y={PAD.top + 12} fontSize="10" fill="#0d9488" fontWeight="600">Forecast →</text>

        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={t.y} x2={PAD.left + cW} y2={t.y} stroke="#f0f0f0" strokeWidth="1" />
            <text x={PAD.left - 6} y={t.y + 4} textAnchor="end" fontSize="10" fill="#9ca3af">{t.val}</text>
          </g>
        ))}

        {histPts.filter((_, i) => i % labelEvery === 0 || i === histPts.length - 1).map((p, i) => (
          <text key={i} x={p.x} y={H - 6} textAnchor="middle" fontSize="10" fill="#9ca3af">{p.label}</text>
        ))}

        <path d={areaPath} fill={`url(#${gradId})`} />
        <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

        {/* Forecast dashed line + dot */}
        <line x1={lastPt.x} y1={lastPt.y} x2={fcastX} y2={fcastY}
          stroke="#0d9488" strokeWidth="2" strokeDasharray="6,4" />
        <circle cx={fcastX} cy={fcastY} r="6" fill="#0d9488" stroke="white" strokeWidth="2" />
        <text x={fcastX + 10} y={fcastY + 4} fontSize="11" fill="#0d9488" fontWeight="bold">
          ~{fmtKg(fcastDay)}/day
        </text>

        {histPts.map((p, i) => (
          <rect key={i} x={p.x - xStep / 2} y={PAD.top} width={xStep} height={cH}
            fill="transparent" style={{ cursor: 'pointer' }}
            onMouseEnter={() => setTooltip(p)} onMouseLeave={() => setTooltip(null)}
            onTouchStart={() => setTooltip(p)} onTouchEnd={() => setTimeout(() => setTooltip(null), 1500)} />
        ))}
        {tooltip && <circle cx={tooltip.x} cy={tooltip.y} r="5" fill={color} stroke="white" strokeWidth="2" />}
      </svg>

      {tooltip && (
        <div style={svgTooltipStyle(tooltip.x, W, tooltip.y, H)}
          className="bg-gray-900 text-white text-xs px-2.5 py-1.5 rounded-lg shadow-xl whitespace-nowrap">
          {tooltip.label}: <strong className="text-teal-300">{fmtKg(tooltip.val)}</strong>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 mt-2 text-[10px] sm:text-[11px] text-gray-500">
        {[
          { line: color,     dash: false, label: 'Actual kg collected' },
          { line: color,     dash: true,  label: 'Forecast'            },
          { bg: '#0d948810', label: 'Forecast zone'                    },
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-1.5">
            {item.bg
              ? <div className="w-4 h-3 rounded-sm" style={{ background: item.bg, border: '1px solid #99f6e4' }} />
              : <div className="w-5 h-0" style={{ borderTop: `2px ${item.dash ? 'dashed' : 'solid'} ${item.line}` }} />
            }
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};