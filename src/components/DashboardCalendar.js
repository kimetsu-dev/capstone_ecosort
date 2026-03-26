import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { FiCalendar, FiMapPin, FiClock, FiChevronLeft, FiChevronRight, FiX } from "react-icons/fi";
import { Truck, Recycle } from "lucide-react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";

// ─── Shared helpers ───────────────────────────────────────────────────────────

const isSameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const DAYS_LONG = [
  "sunday", "monday", "tuesday", "wednesday",
  "thursday", "friday", "saturday",
];

/**
 * Returns true when `schedule` applies to `date`.
 *
 * Submission schedules always carry the full `operatingDays` map:
 *   { monday: { selected: true, startTime, endTime }, tuesday: { selected: false, ... }, … }
 * We check whether the weekday of `date` is marked selected.
 *
 * Legacy single-day fallback: if operatingDays is missing we fall back to
 * the `schedule.day` string (old format).
 *
 * Collection schedules use a single `day` string + `frequency` field.
 */
function isScheduledForDate(date, schedule) {
  const dayName = date
    .toLocaleDateString("en-US", { weekday: "long" })
    .toLowerCase();

  // ── Submission schedules ─────────────────────────────────────────────────
  if (schedule.type === "submission") {
    if (schedule.operatingDays && typeof schedule.operatingDays === "object") {
      return !!(schedule.operatingDays[dayName]?.selected);
    }
    return schedule.day === dayName;
  }

  // ── Collection schedules ─────────────────────────────────────────────────
  if (schedule.day !== dayName) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weeksDiff = Math.round(
    (date.getTime() - today.getTime()) / (7 * 24 * 60 * 60 * 1000)
  );

  switch (schedule.frequency) {
    case "weekly":
      return true;
    case "biweekly":
      return Math.abs(weeksDiff) % 2 === 0;
    case "monthly": {
      const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
      const targetDay = DAYS_LONG.indexOf(dayName);
      while (firstDay.getDay() !== targetDay) firstDay.setDate(firstDay.getDate() + 1);
      return date.getDate() === firstDay.getDate();
    }
    default:
      return false;
  }
}

function formatTime(start, end) {
  try {
    const to12 = (t) => {
      const [h, m] = t.split(":");
      const d = new Date();
      d.setHours(+h, +m);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    };
    return end ? `${to12(start)} – ${to12(end)}` : to12(start);
  } catch {
    return end ? `${start} – ${end}` : start;
  }
}

// ─── Schedule detail card ─────────────────────────────────────────────────────

const DAY_ORDER = [
  "monday","tuesday","wednesday","thursday","friday","saturday","sunday",
];

function buildDayRangeLabel(operatingDays) {
  if (!operatingDays) return null;
  const selected = DAY_ORDER.filter(d => operatingDays[d]?.selected);
  if (selected.length === 0) return null;
  if (selected.length === 7) return "Every day";
  const weekdays = ["monday","tuesday","wednesday","thursday","friday"];
  if (selected.length === 5 && weekdays.every(d => selected.includes(d))) return "Mon – Fri";
  if (selected.length >= 3) {
    const first = DAY_ORDER.indexOf(selected[0]);
    const isContiguous = selected.every((d, i) => DAY_ORDER.indexOf(d) === first + i);
    if (isContiguous) {
      return `${cap(selected[0].slice(0,3))} – ${cap(selected[selected.length-1].slice(0,3))}`;
    }
  }
  return selected.map(d => cap(d.slice(0,3))).join(", ");
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function ScheduleCard({ s, selectedDate, isDark }) {
  const isCollection = s.type === "collection";

  const resolveSelectedDayTime = () => {
    if (s.type === "submission" && s.operatingDays && selectedDate) {
      const dn = selectedDate.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
      const dd = s.operatingDays[dn];
      if (dd?.startTime) return formatTime(dd.startTime, dd.endTime);
    }
    if (s.startTime) return formatTime(s.startTime, s.endTime);
    if (s.time) return formatTime(s.time);
    return null;
  };

  const allSameTime = () => {
    if (!s.operatingDays) return true;
    const sel = DAY_ORDER.filter(d => s.operatingDays[d]?.selected).map(d => s.operatingDays[d]);
    if (sel.length <= 1) return true;
    const ref = `${sel[0].startTime}-${sel[0].endTime}`;
    return sel.every(d => `${d.startTime}-${d.endTime}` === ref);
  };

  const dayLabel        = buildDayRangeLabel(s.operatingDays);
  const selectedDayTime = resolveSelectedDayTime();
  const sameTime        = allSameTime();

  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border ${
      isCollection
        ? isDark ? "bg-blue-900/20 border-blue-800/40" : "bg-blue-50 border-blue-200"
        : isDark ? "bg-green-900/20 border-green-800/40" : "bg-green-50 border-green-200"
    }`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
        isCollection
          ? isDark ? "bg-blue-500/20" : "bg-blue-100"
          : isDark ? "bg-green-500/20" : "bg-green-100"
      }`}>
        {isCollection
          ? <Truck className={`w-4 h-4 ${isDark ? "text-blue-400" : "text-blue-600"}`} />
          : <Recycle className={`w-4 h-4 ${isDark ? "text-green-400" : "text-green-600"}`} />}
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-xs font-bold uppercase tracking-wide mb-1.5 ${
          isCollection
            ? isDark ? "text-blue-300" : "text-blue-700"
            : isDark ? "text-green-300" : "text-green-700"
        }`}>
          {isCollection ? "Waste Collection" : "Submission Drop-off"}
        </p>

        {(s.area || s.barangay) && (
          <p className={`text-xs flex items-center gap-1 mb-1 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
            <FiMapPin className="w-3 h-3 flex-shrink-0" />
            {s.area}{s.barangay ? `, ${s.barangay}` : ""}
          </p>
        )}

        {!isCollection && s.operatingDays && (
          <div className={`mt-1 rounded-lg p-2 text-[11px] space-y-0.5 ${isDark ? "bg-green-900/20" : "bg-green-50/80"}`}>
            {dayLabel && (
              <p className={`font-semibold mb-1 flex items-center gap-1 ${isDark ? "text-green-300" : "text-green-700"}`}>
                <FiCalendar className="w-3 h-3" />
                Open: {dayLabel}
              </p>
            )}
            {sameTime && selectedDayTime && (
              <p className={`flex items-center gap-1 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                <FiClock className="w-3 h-3 flex-shrink-0" />
                {selectedDayTime}
              </p>
            )}
            {!sameTime && DAY_ORDER
              .filter(d => s.operatingDays[d]?.selected)
              .map(d => {
                const dd = s.operatingDays[d];
                const isActiveDay = selectedDate &&
                  selectedDate.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase() === d;
                return (
                  <div key={d} className={`flex items-center gap-1 ${
                    isActiveDay
                      ? isDark ? "text-green-300 font-semibold" : "text-green-700 font-semibold"
                      : isDark ? "text-gray-400" : "text-gray-500"
                  }`}>
                    <span className="inline-block w-8 capitalize">{d.slice(0,3)}</span>
                    <span>{formatTime(dd.startTime, dd.endTime)}</span>
                    {isActiveDay && (
                      <span className={`ml-1 text-[9px] px-1 py-0.5 rounded-full font-bold ${isDark ? "bg-green-700 text-white" : "bg-green-600 text-white"}`}>today</span>
                    )}
                  </div>
                );
              })
            }
          </div>
        )}

        {isCollection && (
          <p className={`text-xs flex items-center gap-1 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
            <FiClock className="w-3 h-3 flex-shrink-0" />
            {selectedDayTime || "No time set"}
            {s.frequency && <span className="ml-1 opacity-70">• {s.frequency}</span>}
          </p>
        )}

        {isCollection && s.wasteTypes?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {s.wasteTypes.map((wt, i) => (
              <span key={i} className={`px-1.5 py-0.5 text-[10px] rounded-full ${isDark ? "bg-blue-500/20 text-blue-300" : "bg-blue-100 text-blue-700"}`}>{wt}</span>
            ))}
          </div>
        )}
        {!isCollection && s.allowedWasteTypes?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {s.allowedWasteTypes.map((wt, i) => (
              <span key={i} className={`px-1.5 py-0.5 text-[10px] rounded-full capitalize ${isDark ? "bg-green-500/20 text-green-300" : "bg-green-100 text-green-700"}`}>{wt}</span>
            ))}
          </div>
        )}

        {!isCollection && (
          <div className="flex items-center gap-3 mt-1.5">
            {s.maxSubmissionsPerDay && (
              <span className={`text-[10px] ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                Max {s.maxSubmissionsPerDay}/day
              </span>
            )}
            {s.requiresAppointment && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isDark ? "bg-orange-900/30 text-orange-400" : "bg-orange-50 text-orange-600"}`}>
                Appointment required
              </span>
            )}
          </div>
        )}

        {s.notes && (
          <p className={`text-[11px] mt-1.5 italic ${isDark ? "text-gray-500" : "text-gray-500"}`}>
            {s.notes}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Shared scroll-lock hook ──────────────────────────────────────────────────
function useScrollLock(active) {
  useEffect(() => {
    if (!active) return;
    const scrollY = window.scrollY;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    return () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      window.scrollTo(0, scrollY);
    };
  }, [active]);
}

// ─── Shared popup close handlers ─────────────────────────────────────────────
function usePopupClose(active, ref, onClose) {
  useEffect(() => {
    if (!active) return;
    const onMouse = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey   = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onMouse);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouse);
      document.removeEventListener("keydown", onKey);
    };
  }, [active, ref, onClose]);
}

// ═══════════════════════════════════════════════════════════════════════════════
// DashboardCalendar  ─  app / mobile version
//
// Renders as a small calendar icon button.
// Clicking it opens a portal popup showing the 7-day week strip + details.
// Mirrors the original behaviour exactly.
// ═══════════════════════════════════════════════════════════════════════════════

export function DashboardCalendar({
  selectedDate,
  setSelectedDate,
  isDark,
  schedules: schedulesProp = [],
  onOpenChange,
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [showPopup,  setShowPopup]  = useState(false);
  const [anchorDate, setAnchorDate] = useState(new Date(today));
  const [selectedDateSchedules, setSelectedDateSchedules] = useState([]);
  const popupRef = useRef(null);

  // Self-fetch schedules if none passed from parent
  const [localCol, setLocalCol] = useState([]);
  const [localSub, setLocalSub] = useState([]);
  const useLocal = !schedulesProp || schedulesProp.length === 0;

  useEffect(() => {
    if (!useLocal) return;
    const unsub = onSnapshot(
      query(collection(db, "collection_schedules"), where("isActive", "==", true)),
      (snap) => setLocalCol(snap.docs.map((d) => ({ id: d.id, type: "collection", ...d.data() })))
    );
    return () => unsub();
  }, [useLocal]);

  useEffect(() => {
    if (!useLocal) return;
    const unsub = onSnapshot(
      query(collection(db, "submission_schedules"), where("isActive", "==", true)),
      (snap) => setLocalSub(snap.docs.map((d) => ({ id: d.id, type: "submission", ...d.data() })))
    );
    return () => unsub();
  }, [useLocal]);

  const schedules = useLocal ? [...localCol, ...localSub] : schedulesProp;
  const colSch    = schedules.filter((s) => s.type === "collection");
  const subSch    = schedules.filter((s) => s.type === "submission");
  const hasCol    = (d) => colSch.some((s) => isScheduledForDate(d, s));
  const hasSub    = (d) => subSch.some((s) => isScheduledForDate(d, s));

  useEffect(() => {
    if (selectedDate)
      setSelectedDateSchedules(schedules.filter((s) => isScheduledForDate(selectedDate, s)));
  }, [schedules, selectedDate]);

  const open  = () => { setShowPopup(true);  onOpenChange?.(true);  };
  const close = () => { setShowPopup(false); onOpenChange?.(false); };
  const toggle = () => showPopup ? close() : open();

  useScrollLock(showPopup);
  usePopupClose(showPopup, popupRef, close);

  // 7-day strip
  const startOfWeek = (d) => {
    const s = new Date(d);
    s.setDate(s.getDate() - s.getDay() + 1); // Mon start
    s.setHours(0, 0, 0, 0);
    return s;
  };
  const wStart = startOfWeek(anchorDate);
  const days   = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(wStart); d.setDate(wStart.getDate() + i); return d;
  });

  const prevWeek = () => { const d = new Date(anchorDate); d.setDate(d.getDate() - 7); setAnchorDate(d); };
  const nextWeek = () => { const d = new Date(anchorDate); d.setDate(d.getDate() + 7); setAnchorDate(d); };

  const handleDay = (date) => {
    setSelectedDate(date);
    setSelectedDateSchedules(schedules.filter((s) => isScheduledForDate(date, s)));
  };

  const monthLabel = (() => {
    const s = days[0], e = days[6];
    return s.getMonth() === e.getMonth()
      ? s.toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : `${s.toLocaleDateString("en-US", { month: "short" })} – ${e.toLocaleDateString("en-US", { month: "short", year: "numeric" })}`;
  })();

  const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <>
      {/* ── Icon button ── */}
      <button
        onClick={toggle}
        className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl shadow-md transition-all active:scale-95 ${
          showPopup
            ? isDark ? "bg-emerald-700 text-white" : "bg-emerald-600 text-white"
            : isDark ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-emerald-500 hover:bg-emerald-600 text-white"
        }`}
        aria-label={showPopup ? "Close calendar" : "Open calendar"}
      >
        <FiCalendar className="w-4 h-4" />
        <span className="text-[10px] font-semibold leading-none">
          {showPopup ? "Close" : "Open"}
        </span>
      </button>

      {/* ── Portal popup ── */}
      {showPopup && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-start justify-center pt-16 px-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={close} />

          {/* Card */}
          <div
            ref={popupRef}
            className={`relative w-full max-w-md rounded-2xl overflow-hidden shadow-2xl border ${
              isDark ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200"
            }`}
            style={{ animation: "dc-appear 0.22s cubic-bezier(0.34,1.56,0.64,1) forwards" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`flex items-center justify-between px-5 py-4 border-b ${
              isDark ? "border-gray-700" : "border-gray-100"
            }`}>
              <div className="flex items-center gap-2">
                <FiCalendar className={`w-5 h-5 ${isDark ? "text-emerald-400" : "text-emerald-600"}`} />
                <span className={`font-bold text-base ${isDark ? "text-gray-100" : "text-gray-800"}`}>
                  Schedule Calendar
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className={`text-[10px] font-medium ${isDark ? "text-blue-400" : "text-blue-600"}`}>Collection</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span className={`text-[10px] font-medium ${isDark ? "text-green-400" : "text-green-600"}`}>Submission</span>
                </div>
                <button
                  onClick={close}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                    isDark ? "hover:bg-gray-700 text-gray-400" : "hover:bg-gray-100 text-gray-500"
                  }`}
                  aria-label="Close"
                >
                  <FiX className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="p-5">
              {/* Week nav */}
              <div className="flex items-center justify-between mb-3">
                <span className={`text-sm font-bold ${isDark ? "text-gray-200" : "text-gray-800"}`}>{monthLabel}</span>
                <div className="flex items-center gap-1">
                  <button onClick={prevWeek} className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${isDark ? "hover:bg-gray-700 text-gray-400" : "hover:bg-gray-100 text-gray-500"}`} aria-label="Previous week">
                    <FiChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => { setAnchorDate(new Date(today)); handleDay(new Date(today)); }}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors ${
                      isDark ? "bg-emerald-900/40 text-emerald-400 hover:bg-emerald-900/60" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    }`}
                  >Today</button>
                  <button onClick={nextWeek} className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${isDark ? "hover:bg-gray-700 text-gray-400" : "hover:bg-gray-100 text-gray-500"}`} aria-label="Next week">
                    <FiChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Day strip */}
              <div className="grid grid-cols-7 gap-1">
                {days.map((date, i) => {
                  const isToday    = isSameDay(date, today);
                  const isSelected = selectedDate && isSameDay(date, selectedDate);
                  const col        = hasCol(date);
                  const sub        = hasSub(date);
                  const isPast     = date < today;
                  return (
                    <button
                      key={i}
                      onClick={() => handleDay(date)}
                      disabled={isPast}
                      className={`flex flex-col items-center py-2 rounded-xl transition-all ${
                        isSelected
                          ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/30"
                          : isToday
                          ? isDark ? "bg-amber-900/40 border border-amber-600/60" : "bg-amber-50 border border-amber-300"
                          : isDark ? "hover:bg-gray-700/60" : "hover:bg-gray-50"
                      } ${isPast ? "opacity-35 cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      <span className={`text-[10px] font-semibold mb-0.5 ${
                        isSelected ? "text-emerald-100"
                        : isToday ? isDark ? "text-amber-400" : "text-amber-600"
                        : isDark ? "text-gray-500" : "text-gray-400"
                      }`}>{DAY_LABELS[i]}</span>
                      <span className={`text-sm font-bold leading-none ${
                        isSelected ? "text-white"
                        : isToday ? isDark ? "text-amber-300" : "text-amber-700"
                        : isPast ? isDark ? "text-gray-600" : "text-gray-300"
                        : isDark ? "text-gray-200" : "text-gray-800"
                      }`}>{date.getDate()}</span>
                      <div className="flex gap-0.5 mt-1 h-1.5">
                        {col && <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-white" : "bg-blue-500"}`} />}
                        {sub && <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-emerald-100" : "bg-green-500"}`} />}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Detail */}
              {selectedDate && selectedDateSchedules.length > 0 && (
                <div className={`mt-4 rounded-xl border p-3 space-y-2 ${isDark ? "bg-gray-800/60 border-gray-700" : "bg-gray-50 border-gray-200"}`}>
                  <p className={`text-xs font-semibold ${isDark ? "text-gray-300" : "text-gray-600"}`}>
                    {selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                  </p>
                  {selectedDateSchedules.map((s, idx) => (
                    <ScheduleCard key={s.id || idx} s={s} selectedDate={selectedDate} isDark={isDark} />
                  ))}
                </div>
              )}
              {selectedDate && selectedDateSchedules.length === 0 && (
                <p className={`mt-3 text-xs text-center ${isDark ? "text-gray-600" : "text-gray-400"}`}>
                  No schedules on {selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}.
                </p>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      <style>{`
        @keyframes dc-appear {
          from { opacity: 0; transform: scale(0.92) translateY(-16px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// InlineCalendar  ─  web Dashboard version
//
// Renders as a "View Calendar" icon button placed inside the card header.
// Clicking opens a portal popup with the full monthly grid + schedule details.
// ═══════════════════════════════════════════════════════════════════════════════

export function InlineCalendar({
  selectedDate,
  setSelectedDate,
  isDark,
  schedules = [],
  onOpenChange,
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [showPopup, setShowPopup] = useState(false);
  const [viewDate,  setViewDate]  = useState(() => {
    const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d;
  });
  const [selectedDateSchedules, setSelectedDateSchedules] = useState([]);
  const popupRef = useRef(null);

  const colSch = schedules.filter((s) => s.type === "collection");
  const subSch = schedules.filter((s) => s.type === "submission");
  const hasCol = (d) => colSch.some((s) => isScheduledForDate(d, s));
  const hasSub = (d) => subSch.some((s) => isScheduledForDate(d, s));

  useEffect(() => {
    if (selectedDate)
      setSelectedDateSchedules(schedules.filter((s) => isScheduledForDate(selectedDate, s)));
    else
      setSelectedDateSchedules([]);
  }, [selectedDate, schedules]);

  const close  = () => { setShowPopup(false); onOpenChange?.(false); };
  const toggle = () => {
    setShowPopup((prev) => {
      const next = !prev;
      onOpenChange?.(next);
      return next;
    });
  };

  useScrollLock(showPopup);
  usePopupClose(showPopup, popupRef, close);

  // Monthly grid
  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth     = new Date(year, month + 1, 0).getDate();
  const blanks   = Array(firstDayOfMonth).fill(null);
  const dayCells = Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1));
  const cells    = [...blanks, ...dayCells];
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));
  const goToday   = () => {
    const now = new Date(); now.setDate(1); now.setHours(0,0,0,0);
    setViewDate(now);
    setSelectedDate(new Date());
  };

  const monthLabel  = viewDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const WEEK_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <>
      {/* ── Icon button ── */}
      <button
        onClick={toggle}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl shadow-sm transition-all active:scale-95 ${
          showPopup
            ? isDark ? "bg-emerald-700 text-white" : "bg-emerald-600 text-white"
            : isDark ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-emerald-500 hover:bg-emerald-600 text-white"
        }`}
        aria-label={showPopup ? "Close calendar" : "View calendar"}
      >
        <FiCalendar className="w-3.5 h-3.5" />
        <span className="text-xs font-bold">{showPopup ? "Close" : "View Calendar"}</span>
      </button>

      {/* ── Portal popup ── */}
      {showPopup && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-start justify-center pt-14 px-4 pb-8 overflow-y-auto">
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={close} />

          {/* Card */}
          <div
            ref={popupRef}
            className={`relative w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl border ${
              isDark ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200"
            }`}
            style={{ animation: "dc-appear 0.22s cubic-bezier(0.34,1.56,0.64,1) forwards" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? "border-gray-700" : "border-gray-100"}`}>
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isDark ? "bg-emerald-900/40" : "bg-emerald-50"}`}>
                  <FiCalendar className={`w-5 h-5 ${isDark ? "text-emerald-400" : "text-emerald-600"}`} />
                </div>
                <div>
                  <h3 className={`font-bold text-base ${isDark ? "text-gray-100" : "text-gray-800"}`}>
                    Schedule Calendar
                  </h3>
                  <div className="flex items-center gap-3 mt-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      <span className={`text-[10px] font-medium ${isDark ? "text-blue-400" : "text-blue-600"}`}>Collection</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      <span className={`text-[10px] font-medium ${isDark ? "text-green-400" : "text-green-600"}`}>Submission</span>
                    </div>
                  </div>
                </div>
              </div>
              <button
                onClick={close}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${isDark ? "hover:bg-gray-700 text-gray-400" : "hover:bg-gray-100 text-gray-500"}`}
                aria-label="Close calendar"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6">
              {/* Month nav */}
              <div className="flex items-center justify-between mb-4">
                <button onClick={prevMonth} className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isDark ? "hover:bg-gray-700 text-gray-400" : "hover:bg-gray-100 text-gray-500"}`} aria-label="Previous month">
                  <FiChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-3">
                  <span className={`text-base font-bold ${isDark ? "text-gray-100" : "text-gray-800"}`}>{monthLabel}</span>
                  <button onClick={goToday} className={`text-[10px] font-bold px-2.5 py-1 rounded-full transition-colors ${isDark ? "bg-emerald-900/40 text-emerald-400 hover:bg-emerald-900/60" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}>Today</button>
                </div>
                <button onClick={nextMonth} className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isDark ? "hover:bg-gray-700 text-gray-400" : "hover:bg-gray-100 text-gray-500"}`} aria-label="Next month">
                  <FiChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Weekday headers */}
              <div className="grid grid-cols-7 mb-1">
                {WEEK_LABELS.map((label) => (
                  <div key={label} className={`text-center text-[10px] font-semibold py-1.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                    {label}
                  </div>
                ))}
              </div>

              {/* Day grid */}
              <div className="grid grid-cols-7 gap-0.5">
                {cells.map((date, i) => {
                  if (!date) return <div key={`blank-${i}`} className="aspect-square" />;
                  const isToday    = isSameDay(date, today);
                  const isSelected = selectedDate && isSameDay(date, selectedDate);
                  const isPast     = date < today;
                  const col        = hasCol(date);
                  const sub        = hasSub(date);
                  const hasBoth    = col && sub;
                  return (
                    <button
                      key={i}
                      onClick={() => { if (!isPast) setSelectedDate(new Date(date)); }}
                      disabled={isPast}
                      className={`
                        relative aspect-square flex flex-col items-center justify-center rounded-xl
                        text-sm font-semibold transition-all duration-150
                        ${isSelected
                          ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 scale-105"
                          : isToday
                          ? isDark ? "bg-amber-900/50 text-amber-300 border border-amber-600/60" : "bg-amber-50 text-amber-700 border border-amber-300"
                          : isPast
                          ? isDark ? "text-gray-700" : "text-gray-300"
                          : isDark ? "text-gray-200 hover:bg-gray-700/60" : "text-gray-700 hover:bg-gray-100"
                        }
                        ${isPast ? "cursor-not-allowed" : "cursor-pointer"}
                      `}
                      aria-label={`${date.toLocaleDateString()}${col ? " – Collection" : ""}${sub ? " – Submission" : ""}`}
                    >
                      <span className="leading-none">{date.getDate()}</span>
                      {(col || sub) && (
                        <div className="flex gap-0.5 mt-1 absolute bottom-1.5">
                          {hasBoth ? (
                            <>
                              <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-white" : "bg-blue-500"}`} />
                              <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-emerald-100" : "bg-green-500"}`} />
                            </>
                          ) : col ? (
                            <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-white" : "bg-blue-500"}`} />
                          ) : (
                            <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-emerald-100" : "bg-green-500"}`} />
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Selected day detail */}
              {selectedDate && selectedDateSchedules.length > 0 && (
                <div className={`mt-4 rounded-xl border p-3 space-y-2 ${isDark ? "bg-gray-800/60 border-gray-700" : "bg-gray-50 border-gray-200"}`}>
                  <p className={`text-xs font-bold ${isDark ? "text-gray-300" : "text-gray-600"}`}>
                    {selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                  </p>
                  {selectedDateSchedules.map((s, idx) => (
                    <ScheduleCard key={s.id || idx} s={s} selectedDate={selectedDate} isDark={isDark} />
                  ))}
                </div>
              )}
              {selectedDate && selectedDateSchedules.length === 0 && (
                <p className={`mt-3 text-xs text-center ${isDark ? "text-gray-600" : "text-gray-400"}`}>
                  No schedules on {selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}.
                </p>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      <style>{`
        @keyframes dc-appear {
          from { opacity: 0; transform: scale(0.92) translateY(-16px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </>
  );
}