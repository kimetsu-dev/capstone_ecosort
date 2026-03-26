import React, { useState, useEffect } from "react";
import { db } from "../../firebase";
import {
  collection, query, where, onSnapshot,
  doc, updateDoc, addDoc, deleteDoc, getDocs,
  serverTimestamp, writeBatch, increment,
} from "firebase/firestore";

// ─── Shared config ────────────────────────────────────────────────────────────
const TICKET_CATS = [
  { value: "bug",        label: "Bug / App Error",  icon: "🐛", color: "#ef4444" },
  { value: "account",   label: "Account Issue",     icon: "👤", color: "#f97316" },
  { value: "points",    label: "Points / Rewards",  icon: "🪙", color: "#eab308" },
  { value: "submission",label: "Waste Submission",  icon: "♻️", color: "#22c55e" },
  { value: "other",     label: "Other / General",   icon: "💬", color: "#6366f1" },
];

const STATUS_OPTS = [
  { value: "open",        label: "Open",        color: "#f59e0b" },
  { value: "in_progress", label: "In Progress", color: "#3b82f6" },
  { value: "resolved",    label: "Resolved",    color: "#22c55e" },
  { value: "closed",      label: "Closed",      color: "#9ca3af" },
];

const STATUS_CFG = {
  open:        { bg: "#fef3c7", color: "#92400e",  dot: "#f59e0b" },
  in_progress: { bg: "#dbeafe", color: "#1e40af",  dot: "#3b82f6" },
  resolved:    { bg: "#dcfce7", color: "#166534",  dot: "#22c55e" },
  closed:      { bg: "#f3f4f6", color: "#374151",  dot: "#9ca3af" },
};

const SEVERITIES = ["low", "medium", "high"];

const V = {
  green:   "#166534",
  greenM:  "#16a34a",
  border:  "var(--border, #e5e7eb)",
  surface: "var(--surface, #ffffff)",
  bg:      "var(--bg, #f9fafb)",
  text:    "var(--text-primary, #111827)",
  muted:   "var(--text-secondary, #6b7280)",
};

// ─── CSS injection ────────────────────────────────────────────────────────────
const KEYFRAMES_ID = "support-tab-kf";
if (!document.getElementById(KEYFRAMES_ID)) {
  const s = document.createElement("style");
  s.id = KEYFRAMES_ID;
  s.textContent = `
    @keyframes st-spin   { to { transform: rotate(360deg); } }
    @keyframes st-fadein { from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none} }
    @keyframes st-pulse  { 0%,100%{opacity:1}50%{opacity:.4} }
  `;
  document.head.appendChild(s);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function StatusBadge({ status }) {
  const c   = STATUS_CFG[status] || STATUS_CFG.open;
  const lbl = STATUS_OPTS.find((o) => o.value === status)?.label || status;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: c.bg, color: c.color, flexShrink: 0,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot }} />
      {lbl}
    </span>
  );
}

function Spinner({ size = 22 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      border: `2.5px solid #e5e7eb`, borderTopColor: V.green,
      animation: "st-spin .7s linear infinite", flexShrink: 0,
    }} />
  );
}

// ─── Form helpers ─────────────────────────────────────────────────────────────
const formLbl = {
  display: "block", marginBottom: 5, fontSize: 10, fontWeight: 800,
  color: "var(--text-secondary, #6b7280)", textTransform: "uppercase",
  letterSpacing: "0.07em",
};
const formInp = {
  width: "100%", boxSizing: "border-box", padding: "8px 11px",
  borderRadius: 8, border: "1.5px solid var(--border, #d1d5db)",
  background: "var(--surface, #fff)", color: "var(--text-primary, #111)",
  fontSize: 13, outline: "none",
};
const iconBtn = {
  padding: "5px 11px", borderRadius: 7, fontSize: 12, fontWeight: 700,
  cursor: "pointer", border: "1px solid var(--border, #e5e7eb)",
  background: "transparent",
};

// ═════════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
export default function SupportTab() {
  const [section,   setSection]   = useState("tickets");
  const [tickets,   setTickets]   = useState([]);
  const [issues,    setIssues]    = useState([]);
  const [selected,  setSelected]  = useState(null);
  const [reply,     setReply]     = useState("");
  const [saving,    setSaving]    = useState(false);
  const [filter,    setFilter]    = useState("all");

  // Known-issues form
  const [showForm,  setShowForm]  = useState(false);
  const [editId,    setEditId]    = useState(null);
  const [issueForm, setIssueForm] = useState(blankIssue());
  const [savingIss, setSavingIss] = useState(false);

  // Redemption panel

  function blankIssue() {
    return {
      title: "", description: "", severity: "medium",
      affectedAreas: "", workaround: "", status: "open", visible: true,
    };
  }

  // ── Firestore listeners ──────────────────────────────────────────────────
  useEffect(() => {
    // No orderBy — sort client-side to avoid any index dependency.
    return onSnapshot(
      query(collection(db, "supportTickets")),
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        data.sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() ?? 0;
          const tb = b.createdAt?.toMillis?.() ?? 0;
          return tb - ta;
        });
        setTickets(data);
      }
    );
  }, []);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, "knownIssues")),
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        data.sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() ?? 0;
          const tb = b.createdAt?.toMillis?.() ?? 0;
          return tb - ta;
        });
        setIssues(data);
      }
    );
  }, []);

  // Keep selected ticket in sync with live Firestore updates
  // so admin responses & status changes are reflected immediately
  useEffect(() => {
    if (!selected?.id) return;
    const live = tickets.find((t) => t.id === selected.id);
    if (live && JSON.stringify(live) !== JSON.stringify(selected)) {
      setSelected(live);
      // Sync reply box only if admin response was updated externally
      if (live.adminResponse !== selected.adminResponse) {
        setReply(live.adminResponse || "");
      }
    }
  }, [tickets, selected?.id]);

  // ── Ticket actions ───────────────────────────────────────────────────────
  const updateStatus = async (id, status) => {
    await updateDoc(doc(db, "supportTickets", id), {
      status, updatedAt: serverTimestamp(),
    });
    // Optimistic local update while listener catches up
    setSelected((t) => t?.id === id ? { ...t, status } : t);
  };

  const sendReply = async () => {
    if (!reply.trim() || !selected) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "supportTickets", selected.id), {
        adminResponse: reply.trim(),
        status: "in_progress",
        updatedAt: serverTimestamp(),
      });
      // Optimistic update — listener will also sync it
      setSelected((t) => ({
        ...t,
        adminResponse: reply.trim(),
        status: "in_progress",
      }));
      // Don't clear reply — keep it visible so admin can keep editing
    } catch (e) {
      console.error("sendReply error:", e);
    }
    setSaving(false);
  };

  const deleteTicket = async (id) => {
    if (!window.confirm("Delete this ticket permanently?")) return;
    await deleteDoc(doc(db, "supportTickets", id));
    if (selected?.id === id) setSelected(null);
  };


  // ── Known issue actions ──────────────────────────────────────────────────
  const openNew = () => { setIssueForm(blankIssue()); setEditId(null); setShowForm(true); };

  const openEdit = (issue) => {
    setIssueForm({
      title: issue.title || "", description: issue.description || "",
      severity: issue.severity || "medium", affectedAreas: issue.affectedAreas || "",
      workaround: issue.workaround || "", status: issue.status || "open",
      visible: issue.visible !== false,
    });
    setEditId(issue.id);
    setShowForm(true);
  };

  const saveIssue = async () => {
    if (!issueForm.title.trim() || !issueForm.description.trim()) return;
    setSavingIss(true);
    const payload = { ...issueForm, updatedAt: serverTimestamp() };
    if (editId) {
      await updateDoc(doc(db, "knownIssues", editId), payload);
    } else {
      await addDoc(collection(db, "knownIssues"), { ...payload, createdAt: serverTimestamp() });
    }
    setSavingIss(false);
    setShowForm(false);
    setEditId(null);
  };

  const deleteIssue = async (id) => {
    if (!window.confirm("Delete this known issue?")) return;
    await deleteDoc(doc(db, "knownIssues", id));
  };

  const toggleVisible = async (issue) => {
    await updateDoc(doc(db, "knownIssues", issue.id),
      { visible: !issue.visible, updatedAt: serverTimestamp() }
    );
  };

  // ── Derived ──────────────────────────────────────────────────────────────
  const filtered = filter === "all" ? tickets : tickets.filter((t) => t.status === filter);
  const counts   = STATUS_OPTS.reduce((a, s) => {
    a[s.value] = tickets.filter((t) => t.status === s.value).length;
    return a;
  }, {});

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", color: V.text }}>

      {/* Section nav */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { id: "tickets",     label: "🎫 Support Tickets", badge: counts.open },
          { id: "issues",      label: "📢 Known Issues",     badge: issues.length },
        ].map((s) => (
          <button key={s.id} onClick={() => {
            setSection(s.id);
          }} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "9px 20px", borderRadius: 10, fontWeight: 700,
            fontSize: 14, cursor: "pointer", transition: "all .15s",
            border: `1.5px solid ${V.border}`,
            ...(section === s.id
              ? { background: V.green, borderColor: V.green, color: "#fff" }
              : { background: V.surface, color: V.muted }),
          }}>
            {s.label}
            {s.badge > 0 && (
              <span style={{
                padding: "2px 7px", borderRadius: 20, fontSize: 11, fontWeight: 800,
                background: section === s.id ? "rgba(255,255,255,0.25)" : "#fef3c7",
                color: section === s.id ? "#fff" : "#92400e",
              }}>{s.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════ TICKETS ══════════════ */}
      {section === "tickets" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.45fr", gap: 14 }}>

          {/* Left — list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

            {/* Stat cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
              {STATUS_OPTS.map((s) => (
                <div key={s.value} style={{
                  padding: "9px 6px", borderRadius: 10, textAlign: "center",
                  border: `1px solid ${V.border}`, background: V.surface,
                  cursor: "pointer", transition: "border-color .15s",
                  ...(filter === s.value ? { borderColor: s.color } : {}),
                }} onClick={() => setFilter(filter === s.value ? "all" : s.value)}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%",
                    background: s.color, margin: "0 auto 4px" }} />
                  <div style={{ fontSize: 20, fontWeight: 900 }}>{counts[s.value] || 0}</div>
                  <div style={{ fontSize: 10, color: V.muted, fontWeight: 600 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Filter pills */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {["all", ...STATUS_OPTS.map((s) => s.value)].map((f) => (
                <button key={f} onClick={() => setFilter(f)} style={{
                  padding: "4px 12px", borderRadius: 20, fontSize: 11,
                  fontWeight: 700, cursor: "pointer",
                  border: `1.5px solid ${V.border}`,
                  ...(filter === f
                    ? { background: V.green, borderColor: V.green, color: "#fff" }
                    : { background: "transparent", color: V.muted }),
                }}>
                  {f === "all"
                    ? `All (${tickets.length})`
                    : STATUS_OPTS.find((o) => o.value === f)?.label}
                </button>
              ))}
            </div>

            {/* Ticket rows */}
            {filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 0",
                color: V.muted, fontSize: 13 }}>No tickets.</div>
            ) : filtered.map((t) => {
              const cat   = TICKET_CATS.find((c) => c.value === t.category);
              const isSel = selected?.id === t.id;
              const hasReply = t.adminResponse?.trim().length > 0;
              return (
                <div
                  key={t.id}
                  onClick={() => { setSelected(t); setReply(t.adminResponse || ""); }}
                  style={{
                    padding: "11px 13px", borderRadius: 10, cursor: "pointer",
                    transition: "all .1s",
                    border: `1.5px solid ${isSel ? V.green : V.border}`,
                    background: isSel ? "#f0fdf4" : V.surface,
                    animation: "st-fadein .15s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: cat?.color || "#9ca3af", flexShrink: 0,
                    }} />
                    <span style={{
                      flex: 1, fontSize: 13, fontWeight: 700,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      color: V.text,
                    }}>{t.subject}</span>
                    <StatusBadge status={t.status} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between",
                    fontSize: 11, color: V.muted, flexWrap: "wrap", gap: 4 }}>
                    <span>{t.userEmail}</span>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {hasReply && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "1px 6px",
                          borderRadius: 10, background: "#dbeafe", color: "#1e40af",
                        }}>replied</span>
                      )}
                      <span>{fmtDate(t.createdAt)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right — detail panel */}
          <div style={{
            padding: 20, borderRadius: 14, minHeight: 320,
            border: `1.5px solid ${V.border}`, background: V.surface,
            display: "flex", flexDirection: "column", gap: 0,
          }}>
            {!selected ? (
              <div style={{
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                flex: 1, minHeight: 260, color: V.muted, fontSize: 14,
              }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>👈</div>
                Select a ticket to view details
              </div>
            ) : (
              <div style={{ animation: "st-fadein .15s ease" }}>

                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between",
                  alignItems: "flex-start", marginBottom: 10 }}>
                  <div style={{ flex: 1, paddingRight: 12 }}>
                    <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 900, color: V.text }}>
                      {selected.subject}
                    </h3>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <StatusBadge status={selected.status} />
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 8,
                        background: selected.priority === "high" ? "#fef2f2"
                          : selected.priority === "medium" ? "#fffbeb" : "#f0fdf4",
                        color: selected.priority === "high" ? "#dc2626"
                          : selected.priority === "medium" ? "#d97706" : "#16a34a",
                      }}>
                        {selected.priority?.toUpperCase()} PRIORITY
                      </span>
                    </div>
                  </div>
                  <button onClick={() => deleteTicket(selected.id)} style={{
                    padding: "5px 11px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                    cursor: "pointer", border: "1px solid #fecaca",
                    background: "#fef2f2", color: "#dc2626", flexShrink: 0,
                  }}>🗑️ Delete</button>
                </div>

                {/* Meta */}
                <div style={{
                  display: "flex", gap: 14, fontSize: 11, color: V.muted,
                  marginBottom: 14, flexWrap: "wrap", paddingBottom: 12,
                  borderBottom: `1px solid ${V.border}`,
                }}>
                  <span>From: <strong style={{ color: V.text }}>{selected.userEmail}</strong></span>
                  <span>Submitted: <strong style={{ color: V.text }}>{fmtDate(selected.createdAt)}</strong></span>
                  <span>Category: <strong style={{ color: V.text }}>
                    {TICKET_CATS.find((c) => c.value === selected.category)?.label || selected.category}
                  </strong></span>
                </div>

                {/* User message */}
                <div style={{
                  padding: "11px 13px", borderRadius: 10, marginBottom: 14,
                  background: V.bg, border: `1px solid ${V.border}`,
                }}>
                  <p style={{ margin: "0 0 5px", fontSize: 10, fontWeight: 800,
                    color: V.muted, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                    User Message
                  </p>
                  <p style={{ margin: 0, fontSize: 13, color: V.text, lineHeight: 1.65 }}>
                    {selected.message}
                  </p>
                </div>

                {/* Status buttons */}
                <div style={{ display: "flex", alignItems: "center",
                  gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: V.muted }}>Status:</span>
                  {STATUS_OPTS.map((o) => (
                    <button key={o.value} onClick={() => updateStatus(selected.id, o.value)} style={{
                      padding: "5px 12px", borderRadius: 8, fontSize: 11,
                      fontWeight: 700, cursor: "pointer", transition: "all .1s",
                      border: `1.5px solid ${selected.status === o.value ? o.color : V.border}`,
                      background: selected.status === o.value ? o.color + "1a" : "transparent",
                      color: selected.status === o.value ? o.color : V.muted,
                    }}>{o.label}</button>
                  ))}
                </div>

                {/* Existing response preview */}
                {selected.adminResponse?.trim() && (
                  <div style={{
                    padding: "10px 12px", borderRadius: 9, marginBottom: 12,
                    background: "#eff6ff", border: "1px solid #bfdbfe",
                    fontSize: 13, color: "#1e3a8a", lineHeight: 1.6,
                  }}>
                    <p style={{ margin: "0 0 4px", fontSize: 10, fontWeight: 800,
                      color: "#1e40af", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Current Response
                    </p>
                    {selected.adminResponse}
                  </div>
                )}

                {/* Reply box */}
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <label style={{ fontSize: 10, fontWeight: 800, color: V.muted,
                    textTransform: "uppercase", letterSpacing: "0.07em" }}>
                    {selected.adminResponse?.trim() ? "Update Response" : "Admin Response"}
                  </label>
                  <textarea
                    rows={4}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Write a response visible to the user…"
                    style={{
                      padding: "9px 11px", borderRadius: 9, resize: "vertical",
                      border: `1.5px solid ${V.border}`, background: V.surface,
                      color: V.text, fontSize: 13, fontFamily: "inherit", outline: "none",
                    }}
                  />
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    {reply !== (selected.adminResponse || "") && (
                      <button
                        onClick={() => setReply(selected.adminResponse || "")}
                        style={{
                          padding: "8px 16px", borderRadius: 9, fontSize: 13,
                          cursor: "pointer", border: `1.5px solid ${V.border}`,
                          background: "transparent", color: V.muted,
                        }}
                      >
                        Discard
                      </button>
                    )}
                    <button
                      onClick={sendReply}
                      disabled={saving || !reply.trim() || reply.trim() === (selected.adminResponse || "").trim()}
                      style={{
                        padding: "8px 20px", borderRadius: 9, border: "none",
                        background: V.green, color: "#fff", fontSize: 13,
                        fontWeight: 800, cursor: "pointer",
                        opacity: saving || !reply.trim() || reply.trim() === (selected.adminResponse || "").trim()
                          ? 0.55 : 1,
                        display: "flex", alignItems: "center", gap: 6,
                      }}
                    >
                      {saving ? <><Spinner size={14} /> Saving…</> : "💬 Send Response"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}


      {/* ══════════════ KNOWN ISSUES ══════════════ */}
      {section === "issues" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between",
            alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <p style={{ margin: 0, fontSize: 13, color: V.muted }}>
              Known issues posted here are visible to all users on the Support page.
            </p>
            <button onClick={openNew} style={{
              padding: "9px 18px", borderRadius: 10, border: "none",
              background: V.green, color: "#fff", fontSize: 13,
              fontWeight: 800, cursor: "pointer",
            }}>+ Add Issue</button>
          </div>

          {/* Inline form */}
          {showForm && (
            <div style={{
              marginBottom: 16, padding: "20px", borderRadius: 12,
              border: "1.5px solid #bbf7d0", background: "#f0fdf4",
              animation: "st-fadein .15s ease",
            }}>
              <h4 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 900, color: V.green }}>
                {editId ? "Edit Issue" : "New Known Issue"}
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ gridColumn: "1/-1" }}>
                  <label style={formLbl}>Title *</label>
                  <input value={issueForm.title} placeholder="Brief issue title"
                    onChange={(e) => setIssueForm((f) => ({ ...f, title: e.target.value }))}
                    style={formInp} />
                </div>
                <div style={{ gridColumn: "1/-1" }}>
                  <label style={formLbl}>Description *</label>
                  <textarea rows={3} value={issueForm.description}
                    placeholder="Describe the issue in detail"
                    onChange={(e) => setIssueForm((f) => ({ ...f, description: e.target.value }))}
                    style={{ ...formInp, resize: "vertical", fontFamily: "inherit" }} />
                </div>
                <div>
                  <label style={formLbl}>Severity</label>
                  <select value={issueForm.severity} style={formInp}
                    onChange={(e) => setIssueForm((f) => ({ ...f, severity: e.target.value }))}>
                    {SEVERITIES.map((s) => (
                      <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={formLbl}>Status</label>
                  <select value={issueForm.status} style={formInp}
                    onChange={(e) => setIssueForm((f) => ({ ...f, status: e.target.value }))}>
                    {STATUS_OPTS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={formLbl}>Affected Areas</label>
                  <input value={issueForm.affectedAreas} placeholder="e.g. Submissions, Rewards"
                    onChange={(e) => setIssueForm((f) => ({ ...f, affectedAreas: e.target.value }))}
                    style={formInp} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                  <label style={formLbl}>Visible to Users</label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={issueForm.visible}
                      onChange={(e) => setIssueForm((f) => ({ ...f, visible: e.target.checked }))} />
                    {issueForm.visible ? "Visible" : "Hidden"}
                  </label>
                </div>
                <div style={{ gridColumn: "1/-1" }}>
                  <label style={formLbl}>Workaround (optional)</label>
                  <input value={issueForm.workaround}
                    placeholder="Any temporary workaround users can try"
                    onChange={(e) => setIssueForm((f) => ({ ...f, workaround: e.target.value }))}
                    style={formInp} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
                <button onClick={() => setShowForm(false)} style={{
                  padding: "7px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer",
                  border: `1.5px solid ${V.border}`, background: "transparent", color: V.muted,
                }}>Cancel</button>
                <button onClick={saveIssue}
                  disabled={savingIss || !issueForm.title.trim() || !issueForm.description.trim()}
                  style={{
                    padding: "7px 20px", borderRadius: 8, fontSize: 13, fontWeight: 800,
                    cursor: "pointer", border: "none", background: V.green, color: "#fff",
                    opacity: savingIss || !issueForm.title.trim() || !issueForm.description.trim() ? 0.55 : 1,
                  }}>
                  {savingIss ? "Saving…" : editId ? "Update" : "Add Issue"}
                </button>
              </div>
            </div>
          )}

          {/* Issue cards */}
          {issues.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: V.muted, fontSize: 13 }}>
              No known issues posted yet.
            </div>
          ) : (
            <div style={{ display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px,1fr))", gap: 12 }}>
              {issues.map((issue) => {
                const sc = STATUS_CFG[issue.status] || STATUS_CFG.open;
                return (
                  <div key={issue.id} style={{
                    padding: "15px 16px", borderRadius: 12,
                    opacity: issue.visible ? 1 : 0.6,
                    border: `1.5px solid ${V.border}`, background: V.surface,
                    animation: "st-fadein .15s ease",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                      <StatusBadge status={issue.status} />
                      <span style={{ marginLeft: "auto", fontSize: 11, color: V.muted }}>
                        {issue.visible ? "👁️ Visible" : "🙈 Hidden"}
                      </span>
                    </div>
                    <h4 style={{ margin: "0 0 5px", fontSize: 13, fontWeight: 800, color: V.text }}>
                      {issue.title}
                    </h4>
                    <p style={{
                      margin: "0 0 12px", fontSize: 12, color: V.muted, lineHeight: 1.5,
                      display: "-webkit-box", WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical", overflow: "hidden",
                    }}>{issue.description}</p>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => openEdit(issue)} style={iconBtn}>✏️ Edit</button>
                      <button onClick={() => toggleVisible(issue)} style={iconBtn}>
                        {issue.visible ? "🙈 Hide" : "👁️ Show"}
                      </button>
                      <button onClick={() => deleteIssue(issue.id)}
                        style={{ ...iconBtn, marginLeft: "auto",
                          border: "1px solid #fecaca", background: "#fef2f2", color: "#dc2626" }}>
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}