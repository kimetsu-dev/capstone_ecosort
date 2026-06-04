import React, { useState, useEffect } from "react";
import { db } from "../firebase";
import {
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";

// ─── Config ───────────────────────────────────────────────────────────────────
const SUPPORT_EMAIL = "official.ecosort@gmail.com";

// ─── Static FAQ data ──────────────────────────────────────────────────────────
const FAQ_ITEMS = [
  {
    id: 1, category: "Points & Rewards",
    q: "How are points calculated for my waste submissions?",
    a: "Points are assigned based on the type and weight of waste you submit. Each waste type has a base point value configured by admins. Heavier or rarer waste types earn proportionally more points — visible on your submission confirmation screen.",
  },
  {
    id: 2, category: "Points & Rewards",
    q: "Why haven't my points updated after a submission?",
    a: "Points are credited once an admin reviews and approves your submission. Once confirmed on-site, your points are updated immediately and reflected in real time in your account.",
  },
  {
    id: 4, category: "Submissions",
    q: "What happens after I submit waste?",
    a: "Your submission enters a 'pending' state while an admin reviews it on-site. Once confirmed, points are awarded to your account immediately. You'll receive a notification when it's approved or if there's an issue.",
  },
  {
    id: 5, category: "Account",
    q: "How do I change my display name or profile photo?",
    a: "Go to your Profile page and tap the edit icon next to your name or avatar. Changes are saved instantly and will reflect across the app, including on the Leaderboard.",
  },
  {
    id: 6, category: "Account",
    q: "I forgot my password — how do I reset it?",
    a: "Tap 'Forgot Password' on the Login screen and enter your email address. A reset link will arrive within a few minutes. If you don't see it, check your spam or junk folder.",
  },
  {
    id: 7, category: "Redemptions",
    q: "How do I redeem my points for rewards?",
    a: "Visit the Rewards page, browse available items, and tap Redeem on anything you have enough points for. You'll receive a confirmation and a redemption code. Track all past redemptions under My Redemptions.",
  },
  {
    id: 8, category: "Redemptions",
    q: "Can I cancel a redemption?",
    a: "Yes — as long as the item hasn't been claimed yet, you can cancel your redemption and your points will be refunded immediately. Go to My Redemptions, find the pending item, and tap Cancel. If the item is already claimed, please submit a support ticket.",
  },
];

const FAQ_CATEGORIES = ["All", ...new Set(FAQ_ITEMS.map((f) => f.category))];

// ─── Ticket categories ────────────────────────────────────────────────────────
const TICKET_CATS = [
  { value: "bug",        label: "Bug / App Error",  icon: "🐛", color: "#ef4444" },
  { value: "account",   label: "Account Issue",     icon: "👤", color: "#f97316" },
  { value: "points",    label: "Points / Rewards",  icon: "🪙", color: "#eab308" },
  { value: "submission",label: "Waste Submission",  icon: "♻️", color: "#22c55e" },
  { value: "other",     label: "Other / General",   icon: "💬", color: "#6366f1" },
];

const STATUS = {
  open:        { label: "Open",        bg: "#fef3c7", color: "#92400e", dot: "#f59e0b" },
  in_progress: { label: "In Progress", bg: "#dbeafe", color: "#1e40af", dot: "#3b82f6" },
  resolved:    { label: "Resolved",    bg: "#dcfce7", color: "#166534", dot: "#22c55e" },
  closed:      { label: "Closed",      bg: "#f3f4f6", color: "#374151", dot: "#9ca3af" },
};

const SEVERITY = {
  low:    { label: "Low",    color: "#22c55e" },
  medium: { label: "Medium", color: "#f59e0b" },
  high:   { label: "High",   color: "#ef4444" },
};

// ─── Design tokens ────────────────────────────────────────────────────────────
const V = {
  green:   "#166534",
  greenM:  "#16a34a",
  greenL:  "#dcfce7",
  border:  "var(--border, #e5e7eb)",
  surface: "var(--surface, #ffffff)",
  bg:      "var(--bg, #f9fafb)",
  text:    "var(--text-primary, #111827)",
  muted:   "var(--text-secondary, #6b7280)",
};

// ─── CSS injection ────────────────────────────────────────────────────────────
const KEYFRAMES = `
  @keyframes ecosort-spin { to { transform: rotate(360deg); } }
  @keyframes ecosort-pulse { 0%,100%{opacity:1}50%{opacity:.4} }
  @keyframes ecosort-fadein { from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none} }
  @keyframes ecosort-slidedown { from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none} }
`;
if (!document.getElementById("ecosort-support-kf")) {
  const s = document.createElement("style");
  s.id = "ecosort-support-kf";
  s.textContent = KEYFRAMES;
  document.head.appendChild(s);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateTime(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── Shared small components ──────────────────────────────────────────────────
function StatusBadge({ status }) {
  const c = STATUS[status] || STATUS.open;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: c.bg, color: c.color, flexShrink: 0,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot }} />
      {c.label}
    </span>
  );
}

function Spinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
      <div style={{
        width: 26, height: 26, borderRadius: "50%",
        border: "3px solid #e5e7eb", borderTopColor: V.green,
        animation: "ecosort-spin 0.7s linear infinite",
      }} />
    </div>
  );
}

function SectionHead({ title, sub }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <h2 style={{ margin: "0 0 5px", fontSize: 19, fontWeight: 900,
        color: V.text, letterSpacing: "-0.02em" }}>{title}</h2>
      {sub && <p style={{ margin: 0, fontSize: 13, color: V.muted, lineHeight: 1.5 }}>{sub}</p>}
    </div>
  );
}

// ─── Shared input styles ──────────────────────────────────────────────────────
const lbl = {
  display: "block", marginBottom: 8, fontSize: 11, fontWeight: 700,
  color: V.muted, textTransform: "uppercase", letterSpacing: "0.06em",
};
const inp = {
  width: "100%", boxSizing: "border-box",
  padding: "11px 13px", borderRadius: 10,
  border: `1.5px solid ${V.border}`,
  background: V.surface, color: V.text,
  fontSize: 14, outline: "none",
};
const errStyle = { margin: "5px 0 0", fontSize: 12, color: "#ef4444" };

// ═════════════════════════════════════════════════════════════════════════════
//  ROOT PAGE
// ═════════════════════════════════════════════════════════════════════════════
export default function Support() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("faq");
  const [optimisticTicket, setOptimisticTicket] = useState(null);

  const TABS = [
    { id: "faq",     label: "FAQ",          icon: "❓" },
    { id: "issues",  label: "Known Issues", icon: "📢" },
    { id: "submit",  label: "Contact Us",   icon: "✉️" },
    { id: "tickets", label: "My Tickets",   icon: "📋" },
  ];

  const GuestWall = ({ action }) => (
    <div style={{ textAlign: "center", padding: "48px 20px" }}>
      <div style={{ fontSize: 44, marginBottom: 12 }}>🔒</div>
      <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 900, color: V.text }}>
        Sign in required
      </h3>
      <p style={{ margin: "0 0 20px", fontSize: 14, color: V.muted, lineHeight: 1.6 }}>
        You need an account to {action}.<br />It only takes a minute to sign up!
      </p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
        <button onClick={() => navigate("/login")} style={{
          padding: "10px 24px", borderRadius: 10, border: "none",
          background: V.green, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
        }}>Sign In</button>
        <button onClick={() => navigate("/signup")} style={{
          padding: "10px 24px", borderRadius: 10,
          border: `1.5px solid ${V.border}`, background: "transparent",
          color: V.text, fontSize: 14, fontWeight: 600, cursor: "pointer",
        }}>Create Account</button>
      </div>
    </div>
  );

  return (
    <div style={{
      minHeight: "100vh",
      background: V.bg,
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    }}>

      {/* ── Fixed / sticky page header ──────────────────────────────────── */}
      <div style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: V.green,
        // Safe area support for notched phones
        paddingTop: "env(safe-area-inset-top, 0px)",
        boxShadow: "0 2px 16px rgba(22,101,52,0.18)",
      }}>
        {/* Decorative shimmer strip */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(ellipse at 90% 20%, #22c55e30 0%, transparent 60%)",
        }} />

        {/* Inner header row */}
        <div style={{
          position: "relative",
          maxWidth: 740,
          margin: "0 auto",
          padding: "14px 16px 16px",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}>
          {/* Back button */}
          <button
            onClick={() => navigate(-1)}
            aria-label="Go back"
            style={{
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
              width: 38,
              height: 38,
              borderRadius: 10,
              background: "rgba(255,255,255,0.15)",
              border: "1.5px solid rgba(255,255,255,0.28)",
              color: "#fff",
              fontSize: 17,
              fontWeight: 700,
              cursor: "pointer",
              backdropFilter: "blur(6px)",
              transition: "background .15s, transform .12s",
              lineHeight: 1,
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.28)";
              e.currentTarget.style.transform = "scale(1.07)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.15)";
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            ←
          </button>

          {/* Title + subtitle */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{
                fontSize: 24,
                lineHeight: 1,
                filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.2))",
              }}>🛠️</span>
              <div>
                <h1 style={{
                  margin: 0,
                  fontSize: 18,
                  fontWeight: 900,
                  color: "#fff",
                  letterSpacing: "-0.02em",
                  lineHeight: 1.2,
                }}>
                  Help & Support
                </h1>
                <p style={{
                  margin: 0,
                  fontSize: 12,
                  color: "#bbf7d0",
                  lineHeight: 1.3,
                  marginTop: 1,
                }}>
                  Answers, issues & support tickets
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Scrollable page body ─────────────────────────────────────────── */}
      <div style={{
        maxWidth: 740,
        margin: "0 auto",
        padding: "20px 16px 80px",
        // Safe area bottom padding for phones with home indicator
        paddingBottom: "calc(80px + env(safe-area-inset-bottom, 0px))",
        animation: "ecosort-slidedown .22s ease",
      }}>

        {/* ── Tab bar ────────────────────────────────────────────────────── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,1fr)",
          gap: 8,
          marginBottom: 20,
        }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                padding: "11px 6px", borderRadius: 12, cursor: "pointer", fontSize: 12,
                fontWeight: 700, border: `1.5px solid ${V.border}`, transition: "all .15s",
                ...(tab === t.id
                  ? {
                      background: V.green,
                      borderColor: V.green,
                      color: "#fff",
                      boxShadow: "0 4px 14px rgba(22,101,52,.22)",
                      transform: "translateY(-1px)",
                    }
                  : { background: V.surface, color: V.muted }),
              }}
            >
              <span style={{ fontSize: 18 }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Content card ─────────────────────────────────────────────── */}
        <div style={{
          background: V.surface,
          border: `1.5px solid ${V.border}`,
          borderRadius: 16,
          padding: "26px 20px",
          boxShadow: "0 1px 8px rgba(0,0,0,0.05)",
          animation: "ecosort-fadein .2s ease",
        }}>
          {tab === "faq"    && <FAQTab />}
          {tab === "issues" && <KnownIssuesTab />}
          {tab === "submit" && (currentUser
            ? <SubmitTab currentUser={currentUser} onSuccess={(id, ticketData) => {
                setOptimisticTicket(ticketData ? { id, ...ticketData } : null);
                setTab("tickets");
              }} />
            : <GuestWall action="submit a support ticket" />
          )}
          {tab === "tickets" && (currentUser
            ? <MyTicketsTab
                currentUser={currentUser}
                onNew={() => setTab("submit")}
                optimisticTicket={optimisticTicket}
                onSynced={() => setOptimisticTicket(null)}
              />
            : <GuestWall action="view your tickets" />
          )}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  FAQ TAB
// ═════════════════════════════════════════════════════════════════════════════
function FAQTab() {
  const [cat, setCat]       = useState("All");
  const [open, setOpen]     = useState(null);
  const [search, setSearch] = useState("");

  const visible = FAQ_ITEMS.filter((f) => {
    const mc = cat === "All" || f.category === cat;
    const ms = !search.trim() ||
      f.q.toLowerCase().includes(search.toLowerCase()) ||
      f.a.toLowerCase().includes(search.toLowerCase());
    return mc && ms;
  });

  return (
    <div>
      <SectionHead
        title="Frequently Asked Questions"
        sub="Quick answers to the most common questions about EcoSort."
      />

      {/* Search */}
      <div style={{ position: "relative", marginBottom: 14 }}>
        <span style={{
          position: "absolute", left: 12, top: "50%",
          transform: "translateY(-50%)", fontSize: 14, pointerEvents: "none",
        }}>🔍</span>
        <input
          style={{ ...inp, paddingLeft: 36, background: V.bg }}
          placeholder="Search questions…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Category pills */}
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 18 }}>
        {FAQ_CATEGORIES.map((c) => (
          <button key={c} onClick={() => setCat(c)} style={{
            padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
            cursor: "pointer", transition: "all .15s", border: `1.5px solid ${V.border}`,
            ...(cat === c
              ? { background: V.green, borderColor: V.green, color: "#fff" }
              : { background: "transparent", color: V.muted }),
          }}>{c}</button>
        ))}
      </div>

      {/* Accordion */}
      {visible.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: V.muted, fontSize: 14 }}>
          No results found. Try a different search.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {visible.map((item) => (
            <div key={item.id} style={{ borderRadius: 11, border: `1.5px solid ${V.border}`, overflow: "hidden" }}>
              <button onClick={() => setOpen(open === item.id ? null : item.id)} style={{
                width: "100%", display: "flex", justifyContent: "space-between",
                alignItems: "center", gap: 12, padding: "13px 16px",
                background: open === item.id ? V.greenL : V.bg,
                border: "none", cursor: "pointer", textAlign: "left", transition: "background .15s",
              }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: V.text, lineHeight: 1.4 }}>
                  {item.q}
                </span>
                <span style={{
                  fontSize: 17, color: V.muted, flexShrink: 0,
                  transition: "transform .2s",
                  transform: open === item.id ? "rotate(180deg)" : "none",
                }}>▾</span>
              </button>
              {open === item.id && (
                <div style={{
                  padding: "14px 16px", fontSize: 14, color: V.muted,
                  lineHeight: 1.75, background: V.surface,
                  borderTop: `1px solid ${V.border}`,
                  animation: "ecosort-fadein .15s ease",
                }}>
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  KNOWN ISSUES TAB
// ═════════════════════════════════════════════════════════════════════════════
function KnownIssuesTab() {
  const [issues, setIssues]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const unsub = onSnapshot(
      collection(db, "knownIssues"),
      (snap) => {
        if (!isMounted) return;
        const data = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((d) => d.visible === true)
          .sort((a, b) => {
            const ta = a.createdAt?.toMillis?.() ?? 0;
            const tb = b.createdAt?.toMillis?.() ?? 0;
            return tb - ta;
          });
        setIssues(data);
        setLoading(false);
      }, (err) => {
        console.error("knownIssues listener error:", err);
        if (isMounted) setLoading(false);
      });
    return () => { isMounted = false; unsub(); };
  }, []);

  return (
    <div>
      <SectionHead
        title="Known Issues & Status"
        sub="Active issues our team is tracking. Updates happen in real time."
      />

      {loading ? <Spinner /> : issues.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 20px" }}>
          <div style={{ fontSize: 44, marginBottom: 10 }}>🎉</div>
          <p style={{ fontSize: 15, color: V.muted, margin: 0 }}>
            No known issues right now — everything looks good!
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {issues.map((issue) => {
            const sev = SEVERITY[issue.severity] || SEVERITY.medium;
            return (
              <div key={issue.id} style={{
                padding: "17px 18px", borderRadius: 12,
                border: `1.5px solid ${V.border}`, background: V.bg,
                animation: "ecosort-fadein .2s ease",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8,
                  marginBottom: 10, flexWrap: "wrap" }}>
                  <StatusBadge status={issue.status} />
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: "3px 10px",
                    borderRadius: 20, border: `1px solid ${sev.color}60`, color: sev.color,
                  }}>
                    {sev.label} Severity
                  </span>
                  <span style={{ marginLeft: "auto", fontSize: 11, color: V.muted }}>
                    {fmtDate(issue.createdAt)}
                  </span>
                </div>
                <h4 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 800, color: V.text }}>
                  {issue.title}
                </h4>
                <p style={{ margin: "0 0 6px", fontSize: 13, color: V.muted, lineHeight: 1.65 }}>
                  {issue.description}
                </p>
                {issue.affectedAreas && (
                  <p style={{ margin: "0 0 8px", fontSize: 12, color: V.muted }}>
                    <strong>Affected:</strong> {issue.affectedAreas}
                  </p>
                )}
                {issue.workaround && (
                  <div style={{
                    marginTop: 10, padding: "9px 13px", borderRadius: 8,
                    background: "#fefce8", border: "1px solid #fde68a",
                    fontSize: 12, color: "#92400e", lineHeight: 1.55,
                  }}>
                    <strong>💡 Workaround:</strong> {issue.workaround}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{
        marginTop: 20, paddingTop: 16, borderTop: `1px solid ${V.border}`,
        fontSize: 13, color: V.muted, textAlign: "center",
      }}>
        Not seeing your issue here?{" "}
        <span style={{ color: V.green, fontWeight: 700 }}>
          Submit a ticket and our team will investigate.
        </span>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  SUBMIT / CONTACT TAB
// ═════════════════════════════════════════════════════════════════════════════
function SubmitTab({ currentUser, onSuccess }) {
  const [form, setForm]     = useState({ category: "", subject: "", message: "", priority: "medium" });
  const [errors, setErrors] = useState({});
  const [busy, setBusy]     = useState(false);
  const [done, setDone]     = useState(false);

  const F = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const validate = () => {
    const e = {};
    if (!form.category)                  e.category = "Please choose a category.";
    if (form.subject.trim().length < 5)  e.subject  = "Subject must be at least 5 characters.";
    if (form.message.trim().length < 20) e.message  = "Please describe your issue (min 20 characters).";
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      const newDocRef = await addDoc(collection(db, "supportTickets"), {
        userId:        currentUser.uid,
        userEmail:     currentUser.email,
        displayName:   currentUser.displayName || "Anonymous",
        category:      form.category,
        subject:       form.subject.trim(),
        message:       form.message.trim(),
        priority:      form.priority,
        status:        "open",
        adminResponse: "",
        createdAt:     serverTimestamp(),
        updatedAt:     serverTimestamp(),
      });
      setDone(true);
      setForm({ category: "", subject: "", message: "", priority: "medium" });
      setErrors({});
      setTimeout(() => {
        setDone(false);
        onSuccess(newDocRef.id, {
          userId:        currentUser.uid,
          userEmail:     currentUser.email,
          displayName:   currentUser.displayName || "Anonymous",
          category:      form.category,
          subject:       form.subject.trim(),
          message:       form.message.trim(),
          priority:      form.priority,
          status:        "open",
          adminResponse: "",
          createdAt:     { toMillis: () => Date.now() },
          updatedAt:     { toMillis: () => Date.now() },
        });
      }, 2800);
    } catch (e) {
      console.error("Ticket submit error:", e);
      setErrors({ submit: "Failed to submit. Please try again." });
    }
    setBusy(false);
  };

  if (done) return (
    <div style={{ textAlign: "center", padding: "52px 20px" }}>
      <div style={{ fontSize: 54, marginBottom: 14 }}>✅</div>
      <h3 style={{ margin: "0 0 8px", fontSize: 21, fontWeight: 900, color: V.text }}>
        Ticket Submitted!
      </h3>
      <p style={{ margin: 0, fontSize: 14, color: V.muted, lineHeight: 1.6 }}>
        We've received your request. Our team will respond in the app and via email.
        <br />Redirecting to My Tickets…
      </p>
    </div>
  );

  return (
    <div>
      <SectionHead
        title="Contact Support"
        sub={
          <>
            Fill out the form below, or email us at{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`}
              style={{ color: V.greenM, fontWeight: 700, textDecoration: "none" }}>
              {SUPPORT_EMAIL}
            </a>
          </>
        }
      />

      {/* Category */}
      <div style={{ marginBottom: 20 }}>
        <label style={lbl}>Category *</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
          {TICKET_CATS.map((c) => (
            <button key={c.value} onClick={() => F("category", c.value)} style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "9px 12px", borderRadius: 10, fontSize: 13,
              cursor: "pointer", transition: "all .15s", textAlign: "left",
              border: `1.5px solid ${form.category === c.value ? c.color : V.border}`,
              background: form.category === c.value ? c.color + "14" : V.surface,
              color: form.category === c.value ? c.color : V.muted,
              fontWeight: form.category === c.value ? 700 : 500,
            }}>
              <span style={{ fontSize: 15 }}>{c.icon}</span>{c.label}
            </button>
          ))}
        </div>
        {errors.category && <p style={errStyle}>{errors.category}</p>}
      </div>

      {/* Subject */}
      <div style={{ marginBottom: 20 }}>
        <label style={lbl}>Subject *</label>
        <input
          value={form.subject} maxLength={120}
          onChange={(e) => F("subject", e.target.value)}
          placeholder="Brief description of your issue"
          style={{ ...inp, ...(errors.subject ? { borderColor: "#ef4444" } : {}) }}
        />
        {errors.subject && <p style={errStyle}>{errors.subject}</p>}
      </div>

      {/* Message */}
      <div style={{ marginBottom: 20 }}>
        <label style={lbl}>Description *</label>
        <textarea
          value={form.message} rows={5} maxLength={2000}
          onChange={(e) => F("message", e.target.value)}
          placeholder="Describe your issue in detail. Include any relevant context."
          style={{ ...inp, resize: "vertical", fontFamily: "inherit",
            ...(errors.message ? { borderColor: "#ef4444" } : {}) }}
        />
        <div style={{ textAlign: "right", fontSize: 11, color: V.muted, marginTop: 3 }}>
          {form.message.length} / 2000
        </div>
        {errors.message && <p style={errStyle}>{errors.message}</p>}
      </div>

      {/* Priority */}
      <div style={{ marginBottom: 24 }}>
        <label style={lbl}>Priority</label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {Object.entries(SEVERITY).map(([k, cfg]) => (
            <button key={k} onClick={() => F("priority", k)} style={{
              padding: "8px 22px", borderRadius: 8, fontSize: 13,
              cursor: "pointer", transition: "all .15s",
              border: `1.5px solid ${form.priority === k ? cfg.color : V.border}`,
              background: form.priority === k ? cfg.color + "14" : "transparent",
              color: form.priority === k ? cfg.color : V.muted,
              fontWeight: form.priority === k ? 700 : 500,
            }}>{cfg.label}</button>
          ))}
        </div>
      </div>

      {errors.submit && <p style={{ ...errStyle, marginBottom: 12 }}>{errors.submit}</p>}

      <button onClick={handleSubmit} disabled={busy} style={{
        width: "100%", padding: 14, borderRadius: 12, border: "none",
        background: V.green, color: "#fff", fontSize: 15, fontWeight: 800,
        cursor: busy ? "not-allowed" : "pointer", letterSpacing: "-0.01em",
        opacity: busy ? 0.65 : 1, transition: "opacity .15s",
      }}>
        {busy ? "Submitting…" : "Submit Ticket →"}
      </button>

      <p style={{ marginTop: 14, fontSize: 12, color: V.muted, textAlign: "center" }}>
        Prefer email?{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}
          style={{ color: V.greenM, fontWeight: 700, textDecoration: "none" }}>
          {SUPPORT_EMAIL}
        </a>
      </p>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  MY TICKETS TAB
// ═════════════════════════════════════════════════════════════════════════════
function MyTicketsTab({ currentUser, onNew, optimisticTicket, onSynced }) {
  const [tickets, setTickets] = useState(
    optimisticTicket ? [optimisticTicket] : []
  );
  const [loading, setLoading] = useState(!optimisticTicket);
  const [expanded, setExp]    = useState(null);
  const [error, setError]     = useState(null);
  const syncedRef = React.useRef(false);

  const onSyncedRef = React.useRef(onSynced);
  React.useEffect(() => { onSyncedRef.current = onSynced; }, [onSynced]);

  useEffect(() => {
    if (!currentUser?.uid) return;

    let isMounted = true;

    const q = query(
      collection(db, "supportTickets"),
      where("userId", "==", currentUser.uid)
    );

    const sortTickets = (docs) =>
      docs.sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() ?? Date.now();
        const tb = b.createdAt?.toMillis?.() ?? Date.now();
        return tb - ta;
      });

    const unsub = onSnapshot(
      q,
      (snap) => {
        if (!isMounted) return;
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setTickets((prev) => {
          if (data.length === 0 && prev.length > 0) return prev;
          return sortTickets(data);
        });
        setError(null);
        setLoading(false);
        if (!syncedRef.current) {
          syncedRef.current = true;
          onSyncedRef.current?.();
        }
      },
      (err) => {
        console.warn("supportTickets listener error:", err.code, err.message);
        if (isMounted) {
          setError("Could not connect for live updates. Your tickets are shown from cache.");
          setLoading(false);
        }
      }
    );

    return () => { isMounted = false; unsub(); };
  }, [currentUser?.uid]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between",
        alignItems: "flex-start", marginBottom: 20 }}>
        <SectionHead
          title="My Tickets"
          sub="Track the status of your support requests in real time."
        />
        <button onClick={onNew} style={{
          flexShrink: 0, marginTop: 2, padding: "8px 18px", borderRadius: 10,
          border: "none", background: V.green, color: "#fff",
          fontSize: 13, fontWeight: 700, cursor: "pointer",
        }}>+ New Ticket</button>
      </div>

      {error && (
        <div style={{
          marginBottom: 16, padding: "10px 14px", borderRadius: 10,
          background: "#fffbeb", border: "1px solid #fde68a",
          fontSize: 13, color: "#92400e", display: "flex", gap: 8, alignItems: "center",
        }}>
          ⚠️ {error}
        </div>
      )}

      {loading ? <Spinner /> : tickets.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 20px" }}>
          <div style={{ fontSize: 44, marginBottom: 10 }}>📭</div>
          <p style={{ margin: "0 0 16px", fontSize: 14, color: V.muted }}>
            No tickets submitted yet.
          </p>
          <button onClick={onNew} style={{
            padding: "10px 24px", borderRadius: 10, border: "none",
            background: V.green, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
          }}>Submit your first ticket</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {tickets.map((t) => {
            const cat  = TICKET_CATS.find((c) => c.value === t.category);
            const isEx = expanded === t.id;
            const hasResponse = t.adminResponse && t.adminResponse.trim().length > 0;

            return (
              <div key={t.id} style={{
                borderRadius: 12,
                border: `1.5px solid ${hasResponse && !isEx ? "#bfdbfe" : V.border}`,
                overflow: "hidden",
                animation: "ecosort-fadein .18s ease",
              }}>
                {/* Header row */}
                <button
                  onClick={() => setExp(isEx ? null : t.id)}
                  style={{
                    width: "100%", display: "flex", justifyContent: "space-between",
                    alignItems: "center", gap: 10, padding: "13px 15px",
                    background: isEx ? "#f0fdf4" : hasResponse ? "#eff6ff" : V.bg,
                    border: "none", cursor: "pointer", textAlign: "left", flexWrap: "wrap",
                    transition: "background .15s",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 9, flex: 1, minWidth: 0 }}>
                    {hasResponse && (
                      <span style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: "#3b82f6", flexShrink: 0,
                        animation: isEx ? "none" : "ecosort-pulse 1.8s infinite",
                      }} />
                    )}
                    <span style={{
                      padding: "3px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                      flexShrink: 0,
                      background: (cat?.color || "#6b7280") + "18",
                      color: cat?.color || "#6b7280",
                    }}>
                      {cat?.icon} {cat?.label || t.category}
                    </span>
                    <span style={{
                      fontSize: 14, fontWeight: 700, color: V.text,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{t.subject}</span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <StatusBadge status={t.status} />
                    <span style={{ fontSize: 11, color: V.muted }}>{fmtDate(t.createdAt)}</span>
                    <span style={{
                      fontSize: 15, color: V.muted, transition: "transform .2s",
                      transform: isEx ? "rotate(180deg)" : "none",
                    }}>▾</span>
                  </div>
                </button>

                {/* Expanded body */}
                {isEx && (
                  <div style={{
                    padding: "16px 17px", background: V.surface,
                    borderTop: `1px solid ${V.border}`,
                    animation: "ecosort-fadein .15s ease",
                  }}>
                    {/* Meta row */}
                    <div style={{ display: "flex", gap: 16, fontSize: 12, color: V.muted,
                      marginBottom: 12, flexWrap: "wrap" }}>
                      <span>Submitted: <strong style={{ color: V.text }}>{fmtDateTime(t.createdAt)}</strong></span>
                      {t.updatedAt && (
                        <span>Updated: <strong style={{ color: V.text }}>{fmtDateTime(t.updatedAt)}</strong></span>
                      )}
                      <span>Priority: <strong style={{
                        color: t.priority === "high" ? "#ef4444"
                          : t.priority === "medium" ? "#f59e0b" : "#22c55e",
                      }}>{t.priority?.toUpperCase()}</strong></span>
                    </div>

                    {/* Original message */}
                    <p style={{ margin: "0 0 5px", fontSize: 11, fontWeight: 700,
                      color: V.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Your message
                    </p>
                    <p style={{ margin: "0 0 16px", fontSize: 14,
                      color: V.text, lineHeight: 1.65,
                      padding: "10px 12px", background: V.bg, borderRadius: 8 }}>
                      {t.message}
                    </p>

                    {/* Admin response — or waiting indicator */}
                    {hasResponse ? (
                      <div style={{
                        padding: "12px 14px", borderRadius: 10,
                        background: "#eff6ff", border: "1px solid #bfdbfe",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                          <span style={{ fontSize: 15 }}>💬</span>
                          <p style={{ margin: 0, fontSize: 11, fontWeight: 800,
                            color: "#1e40af", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                            Support Response
                          </p>
                        </div>
                        <p style={{ margin: 0, fontSize: 14, color: "#1e3a8a", lineHeight: 1.65 }}>
                          {t.adminResponse}
                        </p>
                      </div>
                    ) : (
                      <div style={{
                        display: "flex", alignItems: "center", gap: 8,
                        fontSize: 13, color: V.muted, fontStyle: "italic",
                        padding: "10px 12px", background: V.bg, borderRadius: 8,
                      }}>
                        <span style={{
                          width: 8, height: 8, borderRadius: "50%",
                          background: "#f59e0b", flexShrink: 0,
                          animation: "ecosort-pulse 1.5s infinite",
                        }} />
                        Awaiting response from our support team…
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}