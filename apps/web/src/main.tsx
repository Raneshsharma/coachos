import { FormEvent, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import type {
  CheckIn, ClientProfile, ClientProfilePatch, CoachUser,
  CoachWorkspace, PaymentSubscription, ProgramPlan, ProofCard, Message
} from "@coachos/domain";
import { Pill, SectionShell, StatCard } from "@coachos/ui";
import "./styles.css";
import { CompetitorsView } from "./views/CompetitorsView";

/* ────────────────────────────────────────
   TYPES
──────────────────────────────────────── */
type Dashboard = {
  activeClients: number; checkedInToday: number; dueRenewals: number;
  revenueSnapshotGbp: number;
  atRiskClients: Array<{ clientId: string; severity: "low"|"medium"|"high"; reasons: string[]; recommendedAction: string }>;
};
type CoachSession = { workspace: CoachWorkspace; coach: CoachUser; clients: ClientProfile[]; plans: ProgramPlan[]; subscriptions: PaymentSubscription[]; dashboard: Dashboard };
type ClientSession = { client: ClientProfile; plan: ProgramPlan | null; latestCheckIn: CheckIn | null; proofCard: ProofCard; messages: Message[] };
type ClientNote = { id: string; coachId: string; clientId: string; content: string; createdAt: string; updatedAt: string };
type BodyMetric = { id: string; clientId: string; measuredAt: string; weightKg: number | null; bodyFatPct: number | null; waistCm: number | null; hipsCm: number | null; armCm: number | null; thighCm: number | null; energyScore: number | null; sleepRating: number | null; notes: string | null };
type ToastType = "success" | "error" | "warning" | "info";
type ToastAction = { label: string; onClick: () => void };
type ToastOptions = {
  title?: string;
  action?: ToastAction;
  duration?: number;
};
type Toast = {
  id: number;
  message: string;
  type: ToastType;
  title?: string;
  action?: ToastAction;
  duration: number;
};
type NavId = "dashboard"|"clients"|"plans"|"portal"|"billing"|"settings"|"migration"|"competitors"|"groups"|"habits"|"exercises"|"calendar";
type CheckInWithDelta = CheckIn & { weightDelta: number | null; energyDelta: number | null; adherenceDelta: number | null };
type GroupProgram = { id: string; coachId: string; title: string; description: string; goal: string; memberIds: string[]; monthlyPriceGbp: number; status: "active"|"archived"|"upcoming"; createdAt: string };
type NutritionSwap = { id: string; planId: string; originalFood: { name: string; calories: number; proteinG: number; carbsG: number; fatG: number; portion: string }; swapSuggestion: { name: string; calories: number; proteinG: number; carbsG: number; fatG: number; portion: string; reasoning: string }; appliedAt: string | null };
type SwapSuggestion = { original: { name: string; calories: number; proteinG: number; carbsG: number; fatG: number; portion: string }; suggestion: { name: string; calories: number; proteinG: number; carbsG: number; fatG: number; portion: string; reasoning: string } | null };
type Habit = { id: string; clientId: string; title: string; target: number; frequency: "daily"|"weekly"; createdAt: string };
type HabitSummary = { habit: Habit; streak: number; todayDone: boolean; totalCompletions: number };
type Exercise = { id: string; name: string; bodyPart: string; equipment: string; goal: string; difficulty: "beginner"|"intermediate"|"advanced"; instructions: string };
type Recipe = { id: string; name: string; ingredients: string[]; steps: string[]; calories: number; proteinG: number; carbsG: number; fatG: number; prepTime: number; cookTime: number; tags: string[] };

/* ────────────────────────────────────────
   API HELPERS
──────────────────────────────────────── */
const isProd = import.meta.env.PROD;
const apiBase = isProd ? "/api" : "http://localhost:4000/api";

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, { headers: { "Content-Type": "application/json" }, ...init });
  if (!res.ok) throw new Error(`API error ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}

/* ────────────────────────────────────────
   TOAST HOOK
──────────────────────────────────────── */
const MAX_VISIBLE_TOASTS = 5;
const DEFAULT_DURATION = 4000;

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [queue, setQueue] = useState<Toast[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => {
      const next = prev.filter(t => t.id !== id);
      // Flush one from queue if we have space
      if (next.length < MAX_VISIBLE_TOASTS && queue.length > 0) {
        const [first, ...rest] = queue;
        setQueue(rest);
        // Schedule auto-dismiss for the queued toast
        setTimeout(() => setToasts(ts => ts.filter(t => t.id !== first.id)), first.duration);
        return [...next, first];
      }
      return next;
    });
  }, [queue]);

  const push = useCallback((
    message: string,
    type: ToastType = "success",
    options: ToastOptions = {}
  ) => {
    const id = ++counter.current;
    const duration = options.duration ?? DEFAULT_DURATION;
    const toast: Toast = {
      id,
      message,
      type,
      title: options.title,
      action: options.action,
      duration,
    };

    setToasts(prev => {
      if (prev.length >= MAX_VISIBLE_TOASTS) {
        // Queue it — don't overflow the screen
        setQueue(q => [...q, toast]);
        return prev;
      }
      // Auto-dismiss after duration
      setTimeout(() => dismiss(id), duration);
      return [...prev, toast];
    });

    return id;
  }, [dismiss]);

  const success = useCallback((message: string, options?: ToastOptions) =>
    push(message, "success", options), [push]);

  const error = useCallback((message: string, options?: ToastOptions) =>
    push(message, "error", { duration: 6000, ...options }), [push]);

  const warning = useCallback((message: string, options?: ToastOptions) =>
    push(message, "warning", { duration: 5000, ...options }), [push]);

  const info = useCallback((message: string, options?: ToastOptions) =>
    push(message, "info", options), [push]);

  return { toasts, push, dismiss, success, error, warning, info };
}

/* ────────────────────────────────────────
   CSV HELPER
──────────────────────────────────────── */
function csvToRows(csv: string) {
  const [, ...lines] = csv.trim().split("\n");
  return lines.map(l => l.split(",")).filter(p => p.length >= 4)
    .map(([name, email, goal, price]) => ({ name: name.trim(), email: email.trim(), goal: goal.trim(), monthlyPriceGbp: Number(price.trim()) }));
}

/* ────────────────────────────────────────
   SMALL COMPONENTS
──────────────────────────────────────── */
function Avatar({ name }: { name: string }) {
  const initials = name.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase();
  return <div className="client-avatar">{initials}</div>;
}

function StatusPill({ status }: { status: string }) {
  const tone = status === "at_risk" ? "pill-danger" : status === "trial" ? "pill-warning" : "pill-success";
  const label = status === "at_risk" ? "At risk" : status === "trial" ? "Trial" : "Active";
  return <span className={`pill ${tone}`}>{label}</span>;
}

function AdherenceBar({ score }: { score: number }) {
  const color = score < 50 ? "var(--danger)" : score < 75 ? "var(--warning)" : "var(--primary)";
  return (
    <div>
      <div className="inline-spread text-xs muted" style={{ marginBottom: 4 }}>
        <span>Adherence</span><span style={{ color }}>{score}%</span>
      </div>
      <div className="progress-bar-track">
        <div className="progress-bar-fill" style={{ width: `${score}%`, background: color }} />
      </div>
    </div>
  );
}

const TOAST_ICONS: Record<ToastType, string> = {
  success: "check_circle",
  error:   "error",
  warning: "warning",
  info:    "info",
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const [progress, setProgress] = useState(100);
  const [exiting, setExiting] = useState(false);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);

  const handleDismiss = () => {
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 280);
  };

  useEffect(() => {
    startRef.current = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      const pct = Math.max(0, 100 - (elapsed / toast.duration) * 100);
      setProgress(pct);
      if (pct > 0) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [toast.duration]);

  return (
    <div
      className={`toast toast--${toast.type}${exiting ? " toast--exiting" : ""}`}
      role="alert"
      aria-live="polite"
    >
      <span className="toast-icon material-symbols-outlined">
        {TOAST_ICONS[toast.type]}
      </span>

      <div className="toast-body">
        {toast.title
          ? <>
              <div className="toast-title">{toast.title}</div>
              <div className="toast-message">{toast.message}</div>
            </>
          : <div className="toast-message">{toast.message}</div>
        }
        {toast.action && (
          <button
            className="toast-action-btn"
            onClick={() => { toast.action!.onClick(); handleDismiss(); }}
          >
            {toast.action.label}
          </button>
        )}
      </div>

      <button
        className="toast-close"
        onClick={handleDismiss}
        aria-label="Dismiss notification"
      >
        <span className="material-symbols-outlined">close</span>
      </button>

      <div className="toast-progress">
        <div
          className={`toast-progress-bar toast-progress-bar--${toast.type}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function ToastContainer({
  toasts,
  onDismiss
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="toast-container" aria-label="Notifications">
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

/* ────────────────────────────────────────
   SIDEBAR
──────────────────────────────────────── */
function Sidebar({
  active, onNav, session, atRiskCount
}: { active: NavId; onNav: (id: NavId) => void; session: CoachSession | null; atRiskCount: number }) {
  const nav = (id: NavId, icon: string, label: string, badge?: number) => (
    <button key={id} className={`nav-item${active === id ? " active" : ""}`} onClick={() => onNav(id)}>
      <span className="nav-item-icon">{icon}</span>
      <span>{label}</span>
      {badge ? <span className="nav-item-badge">{badge}</span> : null}
    </button>
  );
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark">C</div>
        <div>
          <div className="sidebar-logo-name">CoachOS</div>
          <div className="sidebar-logo-tag">v1.0</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <span className="nav-section-label">Overview</span>
        {nav("dashboard", "◎", "Coach Dashboard", atRiskCount || undefined)}

        <span className="nav-section-label">Clients</span>
        {nav("clients", "⊞", "All Clients")}
        {nav("portal", "⊡", "Client Portal")}
        {nav("calendar", "▦", "Calendar")}
        {nav("plans", "✦", "AI Plans")}
        {nav("habits", "◉", "Habits")}
        {nav("exercises", "⬢", "Exercise Library")}
        {nav("groups", "⬡", "Group Programs")}

        <span className="nav-section-label">Preview</span>

        <span className="nav-section-label">Business</span>
        {nav("billing", "£", "Billing & MRR")}
        {nav("competitors", "⊕", "Competitors")}
        {nav("migration", "⇄", "Migration")}
        {nav("settings", "⚙", "Workspace")}
      </nav>

      {session && (
        <div className="sidebar-footer">
          <div className="workspace-chip">
            <div className="workspace-dot" />
            <div>
              <div style={{ fontWeight: 600, color: "var(--on-surface)", fontSize: "0.82rem" }}>{session.workspace.name}</div>
              <div style={{ fontSize: "0.7rem" }}>{session.coach.firstName} {session.coach.lastName}</div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

/* ────────────────────────────────────────
   VIEWS
──────────────────────────────────────── */

// ── DASHBOARD VIEW ──────────────────────
function DashboardView({ session, onNav, onSimulateCheckIn, onMarkPayment, push }: {
  session: CoachSession;
  onNav: (id: NavId) => void;
  onSimulateCheckIn: (clientId: string) => Promise<void>;
  onMarkPayment: (clientId: string) => Promise<void>;
  push: (message: string, type?: "success"|"error"|"info") => void;
}) {
  const { dashboard, workspace, clients } = session;
  const mrrGbp = session.subscriptions
    .filter(s => s.status === "active")
    .reduce((sum, s) => sum + s.amountGbp, 0);

  const today = new Date("2026-04-03");
  const dayName = today.toLocaleDateString("en-US", { weekday: "long" });
  const dateStr = today.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  // Upcoming renewals for the right panel
  const upcomingRenewals = session.subscriptions
    .filter(s => s.status === "active" || s.status === "past_due")
    .sort((a, b) => a.renewalDate.localeCompare(b.renewalDate))
    .slice(0, 3);

  return (
    <div className="page-view">
      {/* Editorial Hero */}
      <div className="editorial-hero">
        <div>
          <div className="editorial-hero-eyebrow">
            <span className="editorial-hero-date">{dayName}, {dateStr}</span>
          </div>
          <h1 className="editorial-hero-greeting">Good morning, {session.coach.firstName}.</h1>
          <p className="editorial-hero-message">{workspace.heroMessage}</p>
          <div className="inline" style={{ marginTop: "1.5rem" }}>
            <button onClick={() => onNav("clients")} style={{ padding: "0.6rem 1.25rem", borderRadius: "9999px", background: "#181c1c", color: "white", border: "none", fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "0.875rem", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.4rem", boxShadow: "0 4px 16px rgba(24,28,28,0.15)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>calendar_month</span>
              View Schedule
            </button>
            <button onClick={() => onNav("clients")} style={{ padding: "0.6rem 1.25rem", borderRadius: "9999px", background: "white", color: "#181c1c", border: "1.5px solid #e8e7f0", fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "0.875rem", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
              Client Notes
            </button>
          </div>
        </div>
        <div className="editorial-hero-right">
          {workspace.stripeConnected
            ? <span className="pill pill-success">● Stripe Connected</span>
            : <span className="pill pill-danger">● Stripe Disconnected</span>}
          {workspace.parallelRunDaysLeft > 0 && (
            <span className="pill pill-info">Parallel run: {workspace.parallelRunDaysLeft}d left</span>
          )}
        </div>
      </div>

      {/* Bento Stat Grid */}
      <div className="bento-grid">
        <div className="bento-card">
          <div className="bento-icon-wrap">
            <span className="material-symbols-outlined bento-icon">diversity_3</span>
          </div>
          <div className="bento-label">Active Clients</div>
          <div className="bento-value">{dashboard.activeClients}</div>
          <div className="bento-trend">↑ 12% this month</div>
        </div>
        <div className="bento-card">
          <div className="bento-icon-wrap">
            <span className="material-symbols-outlined bento-icon">payments</span>
          </div>
          <div className="bento-label">Monthly Revenue</div>
          <div className="bento-value">£{mrrGbp}</div>
          <div className="bento-trend">↑ 8% vs last month</div>
        </div>
        <div className="bento-card">
          <div className="bento-icon-wrap">
            <span className="material-symbols-outlined bento-icon">warning</span>
          </div>
          <div className="bento-label">At-Risk Flags</div>
          <div className="bento-value" style={{ color: dashboard.atRiskClients.length > 0 ? "var(--warning)" : undefined }}>{dashboard.atRiskClients.length}</div>
          <div className="bento-trend">{dashboard.atRiskClients.length === 0 ? "All clients on track" : "Needs attention"}</div>
        </div>
        <div className="bento-card">
          <div className="bento-icon-wrap">
            <span className="material-symbols-outlined bento-icon">check_circle</span>
          </div>
          <div className="bento-label">Checked In Today</div>
          <div className="bento-value">{dashboard.checkedInToday}</div>
          <div className="bento-trend">{clients.length - dashboard.checkedInToday} pending</div>
        </div>
      </div>

      {/* Dashboard Content: 2/3 + 1/3 split */}
      <div className="dashboard-content-grid">
        {/* Left: At-Risk Clients */}
        <div>
          <div className="section-meta">
            <h2 className="section-title" style={{ margin: 0 }}>At-Risk Clients</h2>
            <button className="ghost sm" onClick={() => onNav("clients")} style={{ fontSize: "0.8rem" }}>View Report</button>
          </div>
          <div className="at-risk-card">
            {dashboard.atRiskClients.length > 0 ? dashboard.atRiskClients.map(alert => {
              const client = clients.find(c => c.id === alert.clientId);
              const initials = client ? client.fullName.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase() : "??";
              const dotClass = alert.severity === "high" ? "at-risk-dot--danger" : alert.severity === "medium" ? "at-risk-dot--warning" : "at-risk-dot--success";
              const badgeClass = alert.severity === "high" ? "badge-danger" : alert.severity === "medium" ? "badge-warning" : "badge-success";
              const badgeLabel = alert.severity === "high" ? "High Risk" : alert.severity === "medium" ? "Stalled" : "Low Risk";
              return (
                <div key={alert.clientId} className="at-risk-row">
                  <div className="at-risk-client-info">
                    <div className="at-risk-avatar-wrap">
                      <div className="at-risk-avatar">{initials}</div>
                      <div className={`at-risk-avatar-dot ${dotClass}`}></div>
                    </div>
                    <div>
                      <div className="at-risk-client-name">{client?.fullName}</div>
                      <div className="at-risk-client-meta">Last activity: {alert.reasons[0]}</div>
                    </div>
                  </div>
                  <div className="at-risk-actions">
                    <div className="at-risk-status">
                      <span className="at-risk-status-label">Status</span>
                      <span className={`at-risk-status-badge ${badgeClass}`}>{badgeLabel}</span>
                    </div>
                    {client && (
                      <button className="at-risk-send-btn" onClick={() => onSimulateCheckIn(client.id)} title="Send nudge">
                        <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>send</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            }) : (
              <div style={{ padding: "3rem 2rem", textAlign: "center", color: "var(--text-muted)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: "2.5rem", display: "block", marginBottom: "0.75rem", color: "var(--primary)" }}>celebration</span>
                <p style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.25rem" }}>No at-risk clients today!</p>
                <p style={{ fontSize: "0.875rem" }}>All clients are on track. Check back tomorrow.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Side panels */}
        <div className="side-panel">
          {/* Upcoming */}
          <div className="upcoming-card">
            <h2 className="section-title" style={{ margin: "0 0 1.25rem" }}>Upcoming</h2>
            {upcomingRenewals.length > 0 ? upcomingRenewals.map(sub => {
              const client = clients.find(c => c.id === sub.clientId);
              if (!client) return null;
              return (
                <div key={sub.id} className="upcoming-item upcoming-item--primary">
                  <div className="upcoming-time">Renewal · {sub.renewalDate}</div>
                  <div className="upcoming-title">{client.fullName}</div>
                  <div className="upcoming-subtitle">{client.goal}</div>
                </div>
              );
            }) : (
              <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>No upcoming renewals.</p>
            )}
          </div>

          {/* AI Insight */}
          <div className="ai-insight-card">
            <h4 className="ai-insight-title">Coach AI Insight</h4>
            <p className="ai-insight-body">
              {dashboard.atRiskClients.length > 0
                ? `Based on recent activity, ${clients.find(c => c.id === dashboard.atRiskClients[0].clientId)?.fullName} may need a curriculum pivot to maintain momentum.`
                : "Your clients are progressing well. No urgent action items detected."}
            </p>
            <button className="ai-insight-btn" onClick={() => push("Draft email ready — review in your outbox", "success")}>Generate Draft Email</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────
   ADD CLIENT MODAL
──────────────────────────────────────── */
function AddClientModal({
  onClose,
  onSuccess,
  push,
}: {
  onClose: () => void;
  onSuccess: () => void;
  push: (message: string, type?: "success" | "error" | "info" | "warning", opts?: { title?: string; action?: { label: string; onClick: () => void } }) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    goal: "",
    monthlyPriceGbp: "",
    nextRenewalDate: "",
    status: "trialing" as "active" | "at_risk" | "trialing",
  });

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const set = (field: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setForm(f => ({ ...f, [field]: e.target.value }));
    if (errors[field]) setErrors(e => { const n = { ...e }; delete n[field]; return n; });
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.fullName.trim()) errs.fullName = "Full name is required.";
    else if (form.fullName.trim().length < 2) errs.fullName = "Name must be at least 2 characters.";
    if (!form.email.trim()) errs.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = "Enter a valid email address.";
    if (!form.goal.trim()) errs.goal = "Goal is required.";
    else if (form.goal.trim().length < 3) errs.goal = "Goal must be at least 3 characters.";
    if (!form.monthlyPriceGbp) errs.monthlyPriceGbp = "Monthly price is required.";
    else if (isNaN(Number(form.monthlyPriceGbp)) || Number(form.monthlyPriceGbp) < 0)
      errs.monthlyPriceGbp = "Enter a valid price (0 or more).";
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/clients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          email: form.email.trim().toLowerCase(),
          goal: form.goal.trim(),
          monthlyPriceGbp: Number(form.monthlyPriceGbp),
          nextRenewalDate: form.nextRenewalDate || undefined,
          status: form.status,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Server error" }));
        push(err.message ?? "Failed to add client.", "error");
        return;
      }

      const newClient = await res.json();
      push(`${newClient.fullName} added successfully!`, "success");
      onSuccess();
    } catch {
      push("Network error — please check your connection.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const fieldError = (name: string) =>
    errors[name] ? <span className="field-error">{errors[name]}</span> : null;

  const label = (text: string, htmlFor?: string) =>
    htmlFor
      ? <label className="form-label" htmlFor={htmlFor}>{text}</label>
      : <label className="form-label">{text}</label>;

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel add-client-modal" role="dialog" aria-modal="true" aria-labelledby="add-client-title">
        {/* Header */}
        <div className="add-client-header">
          <div className="add-client-icon-wrap">
            <span className="material-symbols-outlined add-client-icon">person_add</span>
          </div>
          <div>
            <h2 className="modal-title" id="add-client-title">Add New Client</h2>
            <p className="modal-subtitle">Fill in the details below to onboard a new client.</p>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Avatar preview */}
        {form.fullName.trim().length >= 2 && (
          <div className="add-client-avatar-preview">
            <div className="add-client-avatar">
              {form.fullName.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase()}
            </div>
            <div>
              <div className="add-client-avatar-name">{form.fullName.trim()}</div>
              <div className="add-client-avatar-email">{form.email || "email@example.com"}</div>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate>
          <div className="add-client-form-grid">
            {/* Full Name */}
            <div className="form-field">
              {label("Full Name *")}
              <input
                id="ac-fullName"
                className={`form-input${errors.fullName ? " form-input--error" : ""}`}
                type="text"
                placeholder="e.g. Jamie Chen"
                value={form.fullName}
                onChange={set("fullName")}
                autoFocus
                autoComplete="name"
              />
              {fieldError("fullName")}
            </div>

            {/* Email */}
            <div className="form-field">
              {label("Email Address *")}
              <input
                id="ac-email"
                className={`form-input${errors.email ? " form-input--error" : ""}`}
                type="email"
                placeholder="e.g. jamie@example.com"
                value={form.email}
                onChange={set("email")}
                autoComplete="email"
              />
              {fieldError("email")}
            </div>

            {/* Goal */}
            <div className="form-field form-field--full">
              {label("Primary Goal *")}
              <textarea
                id="ac-goal"
                className={`form-input form-textarea${errors.goal ? " form-input--error" : ""}`}
                placeholder="e.g. Lose 5kg body fat, build strength, run a marathon…"
                value={form.goal}
                onChange={set("goal")}
                rows={2}
              />
              {fieldError("goal")}
            </div>

            {/* Monthly Price */}
            <div className="form-field">
              {label("Monthly Price (GBP) *")}
              <div className="input-prefix-wrap">
                <span className="input-prefix">£</span>
                <input
                  id="ac-price"
                  className={`form-input input-prefix-field${errors.monthlyPriceGbp ? " form-input--error" : ""}`}
                  type="number"
                  min="0"
                  step="1"
                  placeholder="149"
                  value={form.monthlyPriceGbp}
                  onChange={set("monthlyPriceGbp")}
                />
              </div>
              {fieldError("monthlyPriceGbp")}
            </div>

            {/* Next Renewal Date */}
            <div className="form-field">
              {label("Next Renewal Date")}
              <input
                id="ac-renewal"
                className="form-input"
                type="date"
                value={form.nextRenewalDate}
                onChange={set("nextRenewalDate")}
              />
            </div>

            {/* Status */}
            <div className="form-field">
              {label("Client Status")}
              <select
                id="ac-status"
                className="form-input form-select"
                value={form.status}
                onChange={set("status")}
              >
                <option value="trialing">Trialing</option>
                <option value="active">Active</option>
                <option value="at_risk">At Risk</option>
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="add-client-actions">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? (
                <>
                  <span className="btn-spinner" />
                  Adding Client…
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>person_add</span>
                  Add Client
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── CLIENTS VIEW ──────────────────────
function ClientsView({
  session,
  onOpenClient,
  onAddClient,
}: {
  session: CoachSession;
  onOpenClient: (id: string) => void;
  onAddClient?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const filtered = useMemo(() => {
    let list = session.clients;
    if (filterStatus !== "all") list = list.filter(c => c.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.fullName.toLowerCase().includes(q) ||
        c.goal.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
      );
    }
    return list;
  }, [session.clients, filterStatus, search]);

  const activeClients = session.clients.filter(c => c.status === "active").length;
    const avgAdherence = session.clients.length
    ? Math.round(session.clients.reduce((s, c) => s + c.adherenceScore, 0) / session.clients.length)
    : 0;
  const mrr = session.subscriptions
    .filter(s => s.status === "active")
    .reduce((s, sub) => s + sub.amountGbp, 0);

  // Profile tab state
  const [profileClientId, setProfileClientId] = useState<string | null>(null);
  const profileClient = profileClientId ? session.clients.find(c => c.id === profileClientId) ?? null : null;
  const [activeTab, setActiveTab] = useState<'overview'|'notes'|'workouts'|'nutrition'|'progress'|'payments'>('overview');
  const [notes, setNotes] = useState<ClientNote[]>([]);
  const [metrics, setMetrics] = useState<BodyMetric[]>([]);

  // Load notes when profile opens
  useEffect(() => {
    if (profileClientId) {
      fetchJson<ClientNote[]>(`/clients/${profileClientId}/notes`).then(setNotes).catch(() => setNotes([]));
      fetchJson<BodyMetric[]>(`/clients/${profileClientId}/metrics`).then(setMetrics).catch(() => setMetrics([]));
    }
  }, [profileClientId]);

  const sortedCheckIns = profileClient ? [...(profileClient as any).checkIns ?? []].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()) : [];
  const latestCi = sortedCheckIns[0] ?? null;
  const clientPlan = profileClient ? (profileClient as any).plan ?? null : null;
  const clientSubscription = profileClient ? (profileClient as any).subscription ?? null : null;
  const subStatusLabel = clientSubscription?.status === 'past_due' ? 'Past Due' : clientSubscription?.status === 'trialing' ? 'Trialing' : clientSubscription?.status === 'cancelled' ? 'Cancelled' : 'Active';
  const statusBg = profileClient?.status === 'at_risk' ? 'var(--danger-light)' : profileClient?.status === 'trial' ? 'var(--warning-light)' : 'var(--primary-light)';
  const statusColor = profileClient?.status === 'at_risk' ? 'var(--danger-text)' : profileClient?.status === 'trial' ? 'var(--warning-text)' : 'var(--primary-dark)';
  const initials = profileClient ? profileClient.fullName.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase() : '';
  const statusLabel = filterStatus === "all" ? "active high-performers"
    : filterStatus === "active" ? "active clients"
    : filterStatus === "at_risk" ? "at-risk clients"
    : "trial clients";

  if (profileClient) {
    return (
      <div className="page-view">
        <button className="profile-back-btn" onClick={() => setProfileClientId(null)}>
          <span className="material-symbols-outlined">arrow_back</span>
          Back to Client Roster
        </button>
        <div className="profile-header">
          <div className="profile-avatar-wrap">
            <div className="profile-avatar" style={{ background: statusBg, color: statusColor }}>{initials}</div>
            {profileClient.status === 'at_risk' && (
              <div style={{ position: 'absolute', bottom: -2, right: -2, width: 14, height: 14, borderRadius: '50%', background: 'var(--danger)', border: '2px solid var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '0.55rem', color: 'white', fontWeight: 800 }}>!</span>
              </div>
            )}
          </div>
          <div className="profile-info">
            <h2 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: '1.4rem', color: 'var(--text-primary)', margin: '0 0 0.25rem 0', letterSpacing: '-0.02em' }}>{profileClient.fullName}</h2>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.8rem', color: 'var(--on-surface-variant)', margin: '0 0 0.5rem 0' }}>{profileClient.goal}</p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span className={`badge-${profileClient.status === 'at_risk' ? 'danger' : profileClient.status === 'trial' ? 'warning' : 'success'}`}>{profileClient.status === 'at_risk' ? 'At Risk' : profileClient.status === 'trial' ? 'Trial' : 'Active'}</span>
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.72rem', color: 'var(--outline)' }}>{profileClient.email}</span>
            </div>
          </div>
          <div className="profile-stats">
            <div style={{ textAlign: 'center' }}><div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: '1.5rem', color: profileClient.adherenceScore < 50 ? 'var(--danger)' : profileClient.adherenceScore < 75 ? 'var(--warning)' : 'var(--primary)' }}>{profileClient.adherenceScore}%</div><div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.62rem', color: 'var(--outline)', textTransform: 'uppercase' }}>Adherence</div></div>
            <div style={{ textAlign: 'center' }}><div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: '1.5rem', color: 'var(--text-primary)' }}>{latestCi?.progress.weightKg ?? '—'}</div><div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.62rem', color: 'var(--outline)', textTransform: 'uppercase' }}>Weight</div></div>
            <div style={{ textAlign: 'center' }}><div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: '1.5rem', color: 'var(--text-primary)' }}>£{clientSubscription?.amountGbp ?? '—'}</div><div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.62rem', color: 'var(--outline)', textTransform: 'uppercase' }}>MRR</div></div>
          </div>
        </div>

        <div className="profile-tabs">
          {(['overview', 'notes', 'workouts', 'nutrition', 'progress', 'payments'] as const).map(tab => (
            <button key={tab} className={`profile-tab${activeTab === tab ? ' active' : ''}`} onClick={() => setActiveTab(tab)}>
              <span className="material-symbols-outlined">{
                tab === 'overview' ? 'info' :
                tab === 'notes' ? 'edit_note' :
                tab === 'workouts' ? 'fitness_center' :
                tab === 'nutrition' ? 'restaurant' :
                tab === 'progress' ? 'show_chart' :
                'credit_card'
              }</span>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div className="profile-content">
          {activeTab === 'overview' && (
            <>
              <div className="profile-stats-grid">
                <div className="profile-stat-card card-glass"><div className="profile-stat-label">Adherence</div><div className="profile-stat-value" style={{ color: profileClient.adherenceScore < 50 ? 'var(--danger)' : profileClient.adherenceScore < 75 ? 'var(--warning)' : 'var(--primary)' }}>{profileClient.adherenceScore}%</div></div>
                <div className="profile-stat-card card-glass"><div className="profile-stat-label">Weight</div><div className="profile-stat-value">{latestCi?.progress.weightKg != null ? `${latestCi.progress.weightKg} kg` : '—'}</div><div className="profile-stat-sub">{latestCi ? new Date(latestCi.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'No data'}</div></div>
                <div className="profile-stat-card card-glass"><div className="profile-stat-label">Energy</div><div className="profile-stat-value">{latestCi?.progress.energyScore != null ? `${latestCi.progress.energyScore}/10` : '—'}</div></div>
                <div className="profile-stat-card card-glass"><div className="profile-stat-label">Steps</div><div className="profile-stat-value">{latestCi?.progress.steps != null ? latestCi.progress.steps.toLocaleString() : '—'}</div></div>
              </div>
              {profileClient.goal && (
                <div className="profile-goal-card card-glass" style={{ marginTop: '1rem' }}>
                  <h3 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', margin: '0 0 0.75rem 0' }}>Primary Goal</h3>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.85rem', color: 'var(--on-surface-variant)', lineHeight: 1.6, margin: 0 }}>{profileClient.goal}</p>
                </div>
              )}
              {latestCi && (
                <div style={{ marginTop: '1.25rem' }}>
                  <h3 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', margin: '0 0 0.75rem 0' }}>Latest Check-in</h3>
                  <div className="card-glass" style={{ padding: '1rem' }}>
                    <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>{new Date(latestCi.submittedAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</div>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                      {latestCi.progress.weightKg != null && <span className="checkin-chip"><span className="material-symbols-outlined" style={{ fontSize: '0.75rem' }}>monitor_weight</span>{latestCi.progress.weightKg} kg</span>}
                      {latestCi.progress.energyScore != null && <span className="checkin-chip"><span className="material-symbols-outlined" style={{ fontSize: '0.75rem' }}>bolt</span>{latestCi.progress.energyScore}/10</span>}
                      {latestCi.progress.steps != null && <span className="checkin-chip"><span className="material-symbols-outlined" style={{ fontSize: '0.75rem' }}>directions_walk</span>{latestCi.progress.steps.toLocaleString()}</span>}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          {activeTab === 'notes' && (
            notes.length === 0
              ? <div className="empty-state"><span className="material-symbols-outlined" style={{ fontSize: '2.5rem', color: 'var(--outline)' }}>note_add</span><p style={{ fontFamily: 'Inter, sans-serif', color: 'var(--outline)' }}>No coach notes yet.</p></div>
              : notes.map(note => (
                <div key={note.id} className="card-glass" style={{ marginBottom: '0.75rem', padding: '1rem' }}>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.88rem', color: 'var(--on-surface-variant)', lineHeight: 1.6, margin: '0 0 0.4rem 0' }}>{note.content}</p>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.7rem', color: 'var(--outline)', margin: 0 }}>{new Date(note.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </div>
              ))
          )}
          {activeTab === 'workouts' && (
            sortedCheckIns.length === 0 && !clientPlan
              ? <div className="empty-state"><span className="material-symbols-outlined" style={{ fontSize: '2.5rem', color: 'var(--outline)' }}>fitness_center</span><p style={{ fontFamily: 'Inter, sans-serif', color: 'var(--outline)' }}>No workout history yet.</p></div>
              : <>
                {clientPlan && (clientPlan as any).latestVersion?.workouts?.length > 0 && (
                  <div style={{ marginBottom: '1rem' }}>
                    <h3 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', margin: '0 0 0.75rem 0' }}>Current Programme</h3>
                    {(clientPlan as any).latestVersion.workouts.map((w: string, i: number) => (
                      <div key={i} className="card-glass" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem', marginBottom: '0.5rem', borderLeft: `3px solid ${i === 0 ? 'var(--primary)' : 'var(--surface-container)'}` }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: i === 0 ? 'var(--primary)' : 'var(--outline)', flexShrink: 0 }}>fitness_center</span>
                        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.85rem', color: 'var(--on-surface)' }}>{w}</span>
                      </div>
                    ))}
                  </div>
                )}
                {sortedCheckIns.length > 0 && (
                  <div>
                    <h3 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', margin: '0 0 0.75rem 0' }}>Session Log ({sortedCheckIns.length})</h3>
                    {sortedCheckIns.map((ci, i) => (
                      <div key={ci.id} className="card-glass" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>Session #{sortedCheckIns.length - i}</div>
                          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.75rem', color: 'var(--outline)' }}>{new Date(ci.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
                        </div>
                        {ci.progress.energyScore != null && <div style={{ textAlign: 'center' }}><div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: '1rem', color: ci.progress.energyScore <= 4 ? 'var(--danger)' : ci.progress.energyScore <= 6 ? 'var(--warning)' : 'var(--primary)' }}>{ci.progress.energyScore}/10</div><div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.62rem', color: 'var(--outline)', textTransform: 'uppercase' }}>Energy</div></div>}
                        {ci.progress.adherenceScore != null && <div style={{ textAlign: 'center' }}><div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: '1rem', color: ci.progress.adherenceScore >= 75 ? 'var(--primary)' : ci.progress.adherenceScore >= 50 ? 'var(--warning)' : 'var(--danger)' }}>{ci.progress.adherenceScore}%</div><div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.62rem', color: 'var(--outline)', textTransform: 'uppercase' }}>Adherence</div></div>}
                        {ci.progress.steps != null && <div style={{ textAlign: 'center' }}><div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: '1rem', color: 'var(--on-surface)' }}>{ci.progress.steps.toLocaleString()}</div><div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.62rem', color: 'var(--outline)', textTransform: 'uppercase' }}>Steps</div></div>}
                      </div>
                    ))}
                  </div>
                )}
              </>
          )}
          {activeTab === 'nutrition' && (
            clientPlan && (clientPlan as any).latestVersion?.nutrition?.length > 0
              ? <>
                {(clientPlan as any).latestVersion.explanation?.map((e: string, i: number) => (
                  <div key={i} className="card-glass" style={{ padding: '1rem', marginBottom: '0.75rem', borderLeft: '3px solid var(--primary)' }}>
                    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.85rem', color: 'var(--on-surface-variant)', lineHeight: 1.6, margin: 0 }}>{e}</p>
                  </div>
                ))}
                <h3 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', margin: '0 0 0.75rem 0' }}>Nutrition Guidelines</h3>
                {(clientPlan as any).latestVersion.nutrition.map((n: string, i: number) => (
                  <div key={i} className="card-glass" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.65rem 0.75rem', marginBottom: '0.5rem' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--primary)', flexShrink: 0 }}>restaurant</span>
                    <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.85rem', color: 'var(--on-surface)', lineHeight: 1.5 }}>{n}</span>
                  </div>
                ))}
              </>
              : <div className="empty-state"><span className="material-symbols-outlined" style={{ fontSize: '2.5rem', color: 'var(--outline)' }}>restaurant</span><p style={{ fontFamily: 'Inter, sans-serif', color: 'var(--outline)' }}>No nutrition plan assigned yet.</p></div>
          )}
          {activeTab === 'progress' && (
            metrics.length === 0
              ? <div className="empty-state"><span className="material-symbols-outlined" style={{ fontSize: '2.5rem', color: 'var(--outline)' }}>show_chart</span><p style={{ fontFamily: 'Inter, sans-serif', color: 'var(--outline)' }}>No body metrics recorded yet.</p></div>
              : (() => {
                const mSorted = [...metrics].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
                const latest = mSorted[mSorted.length - 1];
                const first = mSorted[0];
                const wDelta = latest && first && latest.weightKg && first.weightKg ? +(latest.weightKg - first.weightKg).toFixed(1) : null;
                return (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                      {[{l:'Weight',v:latest?.weightKg!=null?latest.weightKg+' kg':'—',d:wDelta!=null?(wDelta>0?'+':'')+wDelta+' kg':null,dc:wDelta!=null?(wDelta<0?'var(--primary)':'var(--danger)'):undefined},
                        {l:'Body Fat',v:latest?.bodyFatPct!=null?latest.bodyFatPct+'%':'—',d:null,dc:undefined},
                        {l:'Waist',v:latest?.waistCm!=null?latest.waistCm+' cm':'—',d:null,dc:undefined},
                        {l:'Energy',v:latest?.energyScore!=null?latest.energyScore+'/10':'—',d:null,dc:undefined},
                        {l:'Sleep',v:latest?.sleepRating!=null?latest.sleepRating+'/10':'—',d:null,dc:undefined},
                        {l:'Records',v:mSorted.length+'',d:null,dc:undefined}].map(m => (
                        <div key={m.l} className="card-glass" style={{ padding: '0.75rem', textAlign: 'center' }}>
                          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.65rem', color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>{m.l}</div>
                          <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-primary)' }}>{m.v}</div>
                          {m.d && <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.72rem', color: m.dc }}>{m.d}</div>}
                        </div>
                      ))}
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Inter, sans-serif', fontSize: '0.8rem' }}>
                        <thead><tr style={{ borderBottom: '1px solid var(--surface-container)' }}>{['Date','Weight','Body Fat','Waist','Hips','Arm','Thigh','Energy','Sleep'].map(h => <th key={h} style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: 'var(--outline)', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.68rem', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                        <tbody>
                          {[...mSorted].reverse().map(m => (
                            <tr key={m.id} style={{ borderBottom: '1px solid var(--surface-container)' }}>
                              <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: 'var(--text-primary)', fontWeight: 500 }}>{new Date(m.measuredAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}</td>
                              <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>{m.weightKg != null ? m.weightKg+' kg' : '—'}</td>
                              <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>{m.bodyFatPct != null ? m.bodyFatPct+'%' : '—'}</td>
                              <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>{m.waistCm != null ? m.waistCm+' cm' : '—'}</td>
                              <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>{m.hipsCm != null ? m.hipsCm+' cm' : '—'}</td>
                              <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>{m.armCm != null ? m.armCm+' cm' : '—'}</td>
                              <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>{m.thighCm != null ? m.thighCm+' cm' : '—'}</td>
                              <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>{m.energyScore != null ? m.energyScore+'/10' : '—'}</td>
                              <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>{m.sleepRating != null ? m.sleepRating+'/10' : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()
          )}
          {activeTab === 'payments' && (
            clientSubscription ? (
              <div>
                <div className="card-glass" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', margin: 0 }}>Active Subscription</h3>
                    <span style={{ padding: '0.25rem 0.75rem', borderRadius: 9999, fontSize: '0.75rem', fontFamily: 'Inter, sans-serif', fontWeight: 600, background: 'var(--primary-light)', color: 'var(--primary)' }}>{subStatusLabel}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                    <div><div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.65rem', color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Monthly Rate</div><div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>£{clientSubscription.amountGbp}</div></div>
                    <div><div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.65rem', color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Renewal Date</div><div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{clientSubscription.renewalDate || '—'}</div></div>
                    <div><div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.65rem', color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Client Since</div><div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{(profileClient as any).startDate || '—'}</div></div>
                  </div>
                </div>
                <div className="card-glass" style={{ padding: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                    <span className="material-symbols-outlined" style={{ color: 'var(--primary)', fontSize: '1rem' }}>receipt_long</span>
                    <h3 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', margin: 0 }}>Recent Payments</h3>
                  </div>
                  <div className="card-glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', marginBottom: '0.5rem', background: 'var(--surface-container-low)' }}>
                    <div><div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500 }}>Monthly subscription</div><div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.75rem', color: 'var(--outline)' }}>{clientSubscription.renewalDate || '—'}</div></div>
                    <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: '0.95rem', color: 'var(--primary)' }}>£{clientSubscription.amountGbp}.00</div>
                  </div>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.75rem', color: 'var(--outline)', textAlign: 'center', marginTop: '0.75rem' }}>Connect Stripe for auto-invoicing and full payment history.</p>
                </div>
              </div>
            ) : (
              <div className="empty-state"><span className="material-symbols-outlined" style={{ fontSize: '2.5rem', color: 'var(--outline)' }}>credit_card</span><p style={{ fontFamily: 'Inter, sans-serif', color: 'var(--outline)' }}>No active subscription.</p></div>
            )
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="page-view">

      {/* Editorial header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "2rem", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: "Manrope, sans-serif", fontSize: "2.25rem", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: "0.35rem" }}>
            Client Roster
          </h1>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: "0.875rem", color: "var(--on-surface-variant)", fontWeight: 500 }}>
            Curating growth for {activeClients} {statusLabel}.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          {/* Filter pills */}
          <div style={{ display: "flex", background: "var(--surface-container)", borderRadius: "9999px", padding: "3px" }}>
            {[
              { key: "all", label: "All" },
              { key: "active", label: "Active" },
              { key: "at_risk", label: "At Risk" },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilterStatus(f.key)}
                style={{
                  padding: "0.4rem 1rem",
                  borderRadius: "9999px",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "Inter, sans-serif",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  transition: "all 0.15s ease",
                  background: filterStatus === f.key ? "var(--surface-container-lowest)" : "transparent",
                  color: filterStatus === f.key ? "var(--primary)" : "var(--on-surface-variant)",
                  boxShadow: filterStatus === f.key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
          {/* Search */}
          <div style={{ position: "relative" }}>
            <span className="material-symbols-outlined" style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "var(--outline)", fontSize: "1.1rem" }}>search</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search clients, goals…"
              style={{
                padding: "0.5rem 1rem 0.5rem 2.5rem",
                borderRadius: "9999px",
                border: "1.5px solid var(--border)",
                background: "var(--bg-card)",
                fontFamily: "Inter, sans-serif",
                fontSize: "0.8rem",
                color: "var(--text-primary)",
                width: "220px",
                outline: "none",
                transition: "border-color 0.15s",
              }}
              onFocus={e => e.target.style.borderColor = "var(--primary)"}
              onBlur={e => e.target.style.borderColor = "var(--border)"}
            />
          </div>
        </div>
      </div>

      {/* Client cards grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1.5rem", marginBottom: "3rem" }}>
        {filtered.map(client => {
          const initials = client.fullName.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase();
          const adherenceColor = client.adherenceScore < 50 ? "var(--danger)"
            : client.adherenceScore < 75 ? "var(--tertiary)"
            : "var(--primary)";
          const statusBadgeClass = client.status === "at_risk" ? "badge-danger"
            : client.status === "trial" ? "badge-warning"
            : "badge-success";
          const statusLabel = client.status === "at_risk" ? "At Risk"
            : client.status === "trial" ? "Trial" : "Active";
          const avatarBg = client.status === "at_risk" ? "var(--danger-light)"
            : client.status === "trial" ? "var(--tertiary-fixed)"
            : "var(--primary-fixed-dim)";

          return (
            <div
              key={client.id}
              className="roster-card"
              onClick={() => setProfileClientId(client.id)}
              style={{ cursor: "pointer" }}
            >
              {/* Card header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                  <div style={{ width: 56, height: 56, borderRadius: "var(--r-lg)", background: avatarBg, display: "grid", placeItems: "center", fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "1rem", color: client.status === "at_risk" ? "var(--danger-text)" : client.status === "trial" ? "var(--on-tertiary-fixed-variant)" : "var(--primary)", flexShrink: 0 }}>
                    {initials}
                  </div>
                  <div>
                    <div style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "1rem", color: "var(--text-primary)", lineHeight: 1.2 }}>{client.fullName}</div>
                    <span className={`at-risk-status-badge ${statusBadgeClass}`} style={{ marginTop: "0.25rem", display: "inline-block" }}>{statusLabel}</span>
                  </div>
                </div>
                <div style={{ fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: "0.875rem", color: "var(--text-primary)", textAlign: "right" }}>
                  £{client.monthlyPriceGbp}<span style={{ color: "var(--on-surface-variant)", fontWeight: 400 }}>/mo</span>
                </div>
              </div>

              {/* Goal */}
              <div style={{ marginBottom: "1rem" }}>
                <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.6rem", fontWeight: 700, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.35rem" }}>Current Goal</div>
                <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.8rem", color: "var(--on-surface-variant)", fontWeight: 500, lineHeight: 1.4 }}>{client.goal}</div>
              </div>

              {/* Adherence bar */}
              <div style={{ marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "0.4rem" }}>
                  <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.6rem", fontWeight: 700, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Adherence</div>
                  <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.7rem", fontWeight: 700, color: adherenceColor }}>{client.adherenceScore}%</div>
                </div>
                <div style={{ height: 6, background: "rgba(235,238,237,0.5)", borderRadius: "9999px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${client.adherenceScore}%`, background: client.adherenceScore < 50 ? "var(--danger)" : client.adherenceScore < 75 ? `linear-gradient(90deg, var(--tertiary) 0%, var(--tertiary-container) 100%)` : "linear-gradient(90deg, var(--primary) 0%, var(--primary-container) 100%)", borderRadius: "9999px", transition: "width 0.6s cubic-bezier(0.34,1.56,0.64,1)" }} />
                </div>
              </div>

              {/* Card footer */}
              <div style={{ paddingTop: "1rem", borderTop: "1px solid var(--surface-container)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                {client.status === "at_risk" ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", color: "var(--danger)", fontFamily: "Inter, sans-serif", fontSize: "0.7rem", fontWeight: 700 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "0.9rem" }}>warning</span>
                    Needs attention
                  </div>
                ) : client.status === "trial" ? (
                  <div style={{ color: "var(--on-surface-variant)", fontFamily: "Inter, sans-serif", fontSize: "0.7rem", fontWeight: 500 }}>Trial active</div>
                ) : (
                  <div style={{ color: "var(--on-surface-variant)", fontFamily: "Inter, sans-serif", fontSize: "0.7rem", fontWeight: 500 }}>On track</div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", color: "var(--primary)", fontFamily: "Inter, sans-serif", fontSize: "0.75rem", fontWeight: 700 }}>
                  Open Dashboard <span className="material-symbols-outlined" style={{ fontSize: "0.9rem" }}>arrow_forward</span>
                </div>
              </div>
            </div>
          );
        })}

        {/* Onboard CTA */}
        <div
          onClick={onAddClient ?? (() => onOpenClient(""))}
          style={{ borderRadius: "var(--r-xl)", padding: "1.5rem", border: "2px dashed var(--outline-variant)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem", cursor: "pointer", transition: "all 0.2s ease", minHeight: "220px", textAlign: "center" }}
        >
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--surface-container)", display: "grid", placeItems: "center" }}>
            <span className="material-symbols-outlined" style={{ fontSize: "1.5rem", color: "var(--primary)" }}>person_add</span>
          </div>
          <div>
            <div style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "0.9rem", color: "var(--text-primary)", marginBottom: "0.25rem" }}>Onboard New Client</div>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.75rem", color: "var(--on-surface-variant)", maxWidth: "160px", margin: "0 auto" }}>Start a new coaching journey today.</div>
          </div>
        </div>
      </div>

      {/* Footer stats */}
      {filtered.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "3rem", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--surface-container)", paddingTop: "2rem" }}>
          <div style={{ display: "flex", gap: "3rem" }}>
            <div>
              <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.6rem", fontWeight: 700, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.25rem" }}>Total Monthly Revenue</div>
              <div style={{ fontFamily: "Manrope, sans-serif", fontSize: "1.75rem", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.04em" }}>£{mrr}</div>
            </div>
            <div>
              <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.6rem", fontWeight: 700, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.25rem" }}>Avg. Adherence</div>
              <div style={{ fontFamily: "Manrope, sans-serif", fontSize: "1.75rem", fontWeight: 800, color: avgAdherence < 60 ? "var(--warning)" : "var(--primary)", letterSpacing: "-0.04em" }}>{avgAdherence}%</div>
            </div>
            <div>
              <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.6rem", fontWeight: 700, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.25rem" }}>Total Clients</div>
              <div style={{ fontFamily: "Manrope, sans-serif", fontSize: "1.75rem", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.04em" }}>{session.clients.length}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.7rem", color: "var(--on-surface-variant)", fontWeight: 500 }}>
              Showing {filtered.length} of {session.clients.length}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── PLANS VIEW (AI Chat) ──────────────────────
type ChatMessage = { id: number; role: "user" | "ai"; text: string };

function PlansView({ session, onNav }: { session: CoachSession; onNav: (id: NavId) => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const counter = useRef(0);

  const curations = [
    {
      title: "Create a meal plan",
      desc: "Build a structured weekly nutrition program for your client",
      icon: "restaurant",
      tag: "Nutrition",
      color: "#d1fae5",
      iconColor: "#059669",
    },
    {
      title: "Design 4-week fat loss plan",
      desc: "Progressive overload program with cardio and nutrition targets",
      icon: "fitness_center",
      tag: "Training",
      color: "#fef3c7",
      iconColor: "#d97706",
    },
    {
      title: "Analyze biometric trends",
      desc: "Review client's progress photos, weight, and adherence scores",
      icon: "show_chart",
      tag: "Analytics",
      color: "#e0e7ff",
      iconColor: "#4f46e5",
    },
    {
      title: "Draft a monthly check-in report",
      desc: "Summarize progress, wins, and next steps for your client",
      icon: "description",
      tag: "Reporting",
      color: "#fce7f3",
      iconColor: "#db2777",
    },
  ];

  const quickGoals = [
    { label: "Current Focus", value: "Client Retention", accent: "#f97316" },
    { label: "Weekly Goal", value: "12 New Plans", accent: "#008767" },
    { label: "Open Tickets", value: "3", accent: "#4f46e5" },
  ];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    const userMsg: ChatMessage = { id: ++counter.current, role: "user", text: text.trim() };
    setMessages(m => [...m, userMsg]);
    setInput("");
    setIsTyping(true);

    await new Promise(r => setTimeout(r, 1400));

    const aiResponses = [
      "I've analyzed your client roster and identified Marcus as a prime candidate for a progressive overload program. Based on his recent adherence scores, I'd recommend a 4-week mesocycle with incremental load increases of 2.5–5% weekly. Want me to draft the full plan?",
      "Great question. For Ava's fat loss goal, I'm seeing consistent results over the past 6 weeks. Her current weekly calorie target of 1,800 kcal is well-calibrated. I can generate a refined meal plan with higher protein density if that aligns with your strategy.",
      "I've cross-referenced the latest check-in data. 4 of your 7 active clients are showing suboptimal adherence this week — likely due to the holiday period. I'd suggest a targeted re-engagement sequence. Shall I draft personalized check-in templates for each?",
      "Here's a structured monthly report for Marcus covering Week 1–4 of his transformation program. His body composition has shifted positively: -2.3kg body fat, +1.1kg lean mass. Adherence averaged 84%. Next phase recommendation: introduce deload week.",
    ];

    const aiMsg: ChatMessage = { id: ++counter.current, role: "ai", text: aiResponses[messages.length % aiResponses.length] };
    setIsTyping(false);
    setMessages(m => [...m, aiMsg]);
  };

  const handleCuration = (title: string) => {
    sendMessage(`I want to ${title.toLowerCase()}. Can you help me build this?`);
  };

  return (
    <div className="page-view plans-chat-view">
      {/* Main chat container */}
      <div className="plans-chat-layout">
        {/* Left: Chat Area */}
        <div className="plans-chat-main">
          {/* Header */}
          <div className="plans-chat-header">
            <div>
              <h1 className="plans-chat-title">
                Welcome to AuraCoach, Coach <span className="plans-name-highlight">{session.coach.firstName}</span>.
              </h1>
              <p className="plans-chat-subtitle">Your digital curator is ready. What shall we design today?</p>
            </div>
          </div>

          {/* Messages Area */}
          <div className="plans-messages">
            {messages.length === 0 && (
              <div className="plans-empty-hint">
                <span className="material-symbols-outlined plans-empty-icon">psychology</span>
                <p>Ask me anything about meal plans, workouts, biometrics, or client strategy.</p>
              </div>
            )}
            {messages.map(msg => (
              <div key={msg.id} className={`plans-msg plans-msg--${msg.role}`}>
                {msg.role === "ai" && (
                  <div className="plans-msg-avatar">
                    <svg width="18" height="18" viewBox="0 0 28 28" fill="none">
                      <circle cx="14" cy="14" r="14" fill="#008767"/>
                      <path d="M8 14c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                      <path d="M14 8v2M14 18v2M8 14H6M22 14h-2" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </div>
                )}
                <div className="plans-msg-bubble">
                  {msg.text}
                </div>
                {msg.role === "user" && (
                  <div className="plans-msg-avatar plans-msg-avatar--user">
                    {session.coach.firstName[0]}{session.coach.lastName[0]}
                  </div>
                )}
              </div>
            ))}
            {isTyping && (
              <div className="plans-msg plans-msg--ai">
                <div className="plans-msg-avatar">
                  <svg width="18" height="18" viewBox="0 0 28 28" fill="none">
                    <circle cx="14" cy="14" r="14" fill="#008767"/>
                    <path d="M8 14c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M14 8v2M14 18v2M8 14H6M22 14h-2" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
                <div className="plans-msg-bubble plans-msg-bubble--typing">
                  <span className="plans-typing-dot"></span>
                  <span className="plans-typing-dot"></span>
                  <span className="plans-typing-dot"></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar */}
          <div className="plans-input-area">
            <div className="plans-input-card">
              <div className="plans-input-icon">
                <svg width="20" height="20" viewBox="0 0 28 28" fill="none">
                  <circle cx="14" cy="14" r="14" fill="#008767"/>
                  <path d="M8 14c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M14 8v2M14 18v2M8 14H6M22 14h-2" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <input
                type="text"
                className="plans-input"
                placeholder="How can Aura AI help you today?"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendMessage(input)}
              />
              <button
                className="plans-ask-btn"
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || isTyping}
              >
                Ask
                <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>arrow_forward</span>
              </button>
            </div>

            {/* Suggested Curations */}
            <div className="plans-curations">
              <p className="plans-curations-label">Suggested Curations</p>
              <div className="plans-curations-grid">
                {curations.map(c => (
                  <button key={c.title} className="plans-curation-card" onClick={() => handleCuration(c.title)}>
                    <div className="plans-curation-icon-wrap" style={{ background: c.color }}>
                      <span className="material-symbols-outlined" style={{ color: c.iconColor, fontSize: "1.25rem" }}>{c.icon}</span>
                    </div>
                    <div className="plans-curation-text">
                      <span className="plans-curation-tag" style={{ color: c.iconColor }}>{c.tag}</span>
                      <p className="plans-curation-title">{c.title}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Goals Sidebar */}
        <div className="plans-sidebar">
          <div className="plans-sidebar-card">
            <h3 className="plans-sidebar-title">Current Session</h3>
            {quickGoals.map(item => (
              <div key={item.label} className="plans-goal-item">
                <div className="plans-goal-accent" style={{ background: item.accent }}></div>
                <div className="plans-goal-body">
                  <span className="plans-goal-label">{item.label}</span>
                  <span className="plans-goal-value">{item.value}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="plans-sidebar-card">
            <h3 className="plans-sidebar-title">Active Clients</h3>
            {session.clients.slice(0, 5).map(client => (
              <div key={client.id} className="plans-client-item">
                <div className="plans-client-avatar">{client.fullName.split(" ").map(p => p[0]).slice(0, 2).join("")}</div>
                <div>
                  <p className="plans-client-name">{client.fullName}</p>
                  <p className="plans-client-goal">{client.goal}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer Tagline */}
      <div className="plans-footer">
        <div className="plans-footer-line"></div>
        <p className="plans-footer-text">Empowering Human Coaching with Intelligence</p>
        <div className="plans-footer-line"></div>
      </div>
    </div>
  );
}

// ── CLIENT PORTAL VIEW ──────────────────────
function PortalView({ session, clientPortal, selectedClientId, onSwitchClient, onCheckIn, onSaveEdits, onSendMessage, onRefreshProof, onApprove, checkInHistory, onNav, push }: {
  session: CoachSession;
  clientPortal: ClientSession | null;
  selectedClientId: string | null;
  onSwitchClient: (id: string) => void;
  onCheckIn: (clientId: string) => Promise<void>;
  onSaveEdits: (draft: ClientProfilePatch) => Promise<void>;
  onSendMessage: (content: string) => Promise<void>;
  onRefreshProof: (clientId: string) => Promise<void>;
  onApprove: (planId: string) => Promise<void>;
  checkInHistory: CheckInWithDelta[];
  onNav: (id: NavId) => void;
  push: (message: string, type?: "success"|"error"|"info") => void;
}) {
  const sorted = useMemo(() =>
    [...session.clients].sort((a, b) => a.fullName.localeCompare(b.fullName)), [session.clients]);

  const [editDraft, setEditDraft] = useState<ClientProfilePatch>({});
  const [msgDraft, setMsgDraft] = useState("");
  const [activeTab, setActiveTab] = useState<"plan"|"meal"|"workout"|"messages"|"history">("plan");
  const feedRef = useRef<HTMLDivElement>(null);

  // Meal Planner state
  const [mealWeekOffset, setMealWeekOffset] = useState(0);
  const [editingMeal, setEditingMeal] = useState<{ day: string; slot: string } | null>(null);
  const [showArchitect, setShowArchitect] = useState(true);

  // Workout Plan state
  const [workoutExercises, setWorkoutExercises] = useState([
    { id: 1, name: "Jumping Jacks", tag: "Metabolic / Plyometric", sets: "3 Sets of 50", duration: "60 Seconds", advanced: "" },
    { id: 2, name: "High Knees", tag: "Agility / Power", sets: "Per Set: 30", duration: "45 Seconds", advanced: "Ankle Weights 1kg" },
    { id: 3, name: "Butt Kicks", tag: "Metabolic / Warmup", sets: "Fixed: 40", duration: "30 Seconds", advanced: "" },
  ]);
  const [workoutDiscarded, setWorkoutDiscarded] = useState(false);

  useEffect(() => {
    if (clientPortal) {
      setEditDraft({
        goal: clientPortal.client.goal,
        status: clientPortal.client.status,
        monthlyPriceGbp: clientPortal.client.monthlyPriceGbp,
        nextRenewalDate: clientPortal.client.nextRenewalDate
      });
    }
  }, [clientPortal]);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [clientPortal?.messages]);

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!msgDraft.trim()) return;
    await onSendMessage(msgDraft);
    setMsgDraft("");
  };

  const adherenceColor = (clientPortal?.client.adherenceScore ?? 0) < 50 ? "var(--danger)"
    : (clientPortal?.client.adherenceScore ?? 0) < 75 ? "var(--warning)" : "var(--primary)";

  const initials = clientPortal?.client.fullName.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase() ?? "";

  const tabItems = [
    { key: "plan" as const, label: "Overview" },
    { key: "meal" as const, label: "AI Meal Planning" },
    { key: "workout" as const, label: "AI Workout Plan" },
    { key: "messages" as const, label: "Messages", badge: clientPortal?.messages?.length ?? 0 },
    { key: "history" as const, label: "History" },
  ];

  // Parse macro values from nutrition strings (e.g. "Protein floor: 135g")
  const macros = useMemo(() => {
    if (!clientPortal?.plan) return null;
    const items = clientPortal.plan.latestVersion.nutrition;
    const calMatch = items.find(i => /calor/i.test(i))?.match(/(\d+)/);
    const protMatch = items.find(i => /protein/i.test(i))?.match(/(\d+)/);
    const fatMatch = items.find(i => /\bfat\b/i.test(i) && !/calor/i.test(i))?.match(/(\d+)/);
    const carbMatch = items.find(i => /carb/i.test(i))?.match(/(\d+)/);
    return {
      calories: calMatch ? Number(calMatch[1]) : 2150,
      proteinG: protMatch ? Number(protMatch[1]) : 150,
      fatG: fatMatch ? Number(fatMatch[1]) : 50,
      carbsG: carbMatch ? Number(carbMatch[1]) : 60,
    };
  }, [clientPortal?.plan]);

  return (
    <div className="page-view">
      {!clientPortal ? (
        <div className="empty-state">
          <span className="material-symbols-outlined" style={{ fontSize: "3rem", display: "block", marginBottom: "1rem", color: "var(--primary)" }}>group</span>
          <p style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "1.1rem", color: "var(--text-primary)" }}>No client selected</p>
          <p style={{ fontSize: "0.875rem" }}>Choose a client from the dropdown above to open their portal.</p>
        </div>
      ) : (
        <>
          {/* CLIENT HEADER */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1.75rem", gap: "1.5rem", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1.75rem" }}>
              <div style={{ position: "relative", flexShrink: 0 }}>
                <div style={{ width: 80, height: 80, borderRadius: "var(--r-xl)", background: "var(--surface-container)", border: "2px solid var(--surface-container-high)", display: "grid", placeItems: "center", fontFamily: "Manrope, sans-serif", fontWeight: 800, fontSize: "1.5rem", color: "var(--primary)", transform: "rotate(3deg)", boxShadow: "var(--shadow-editorial)" }}>
                  {initials}
                </div>
                <div style={{ position: "absolute", bottom: -8, right: -8, width: 28, height: 28, background: "var(--primary)", borderRadius: "50%", display: "grid", placeItems: "center", border: "3px solid var(--bg-page)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: "0.85rem", color: "white", fontWeight: 700 }}>verified</span>
                </div>
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.35rem", flexWrap: "wrap" }}>
                  <h1 style={{ fontFamily: "Manrope, sans-serif", fontSize: "2.25rem", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.04em", lineHeight: 1.1 }}>
                    {clientPortal.client.fullName}
                  </h1>
                  <span style={{ padding: "0.2rem 0.65rem", background: "var(--surface-container)", color: "var(--on-surface-variant)", borderRadius: "9999px", fontFamily: "Inter, sans-serif", fontSize: "0.55rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    Premium Member
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "1.25rem", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "var(--on-surface-variant)", fontFamily: "Inter, sans-serif", fontSize: "0.75rem" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "0.9rem", color: "var(--primary)" }}>calendar_today</span>
                    Joined {new Date(clientPortal.client.nextRenewalDate).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "var(--on-surface-variant)", fontFamily: "Inter, sans-serif", fontSize: "0.75rem" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "0.9rem", color: "var(--primary)" }}>location_on</span>
                    {clientPortal.client.email.split("@")[1]?.replace(".com", "").replace("example", "SF") ?? "San Francisco"}
                  </div>
                </div>
              </div>
            </div>
            <div style={{ background: "var(--surface-container)", borderRadius: "2rem", padding: "1.25rem 1.75rem", minWidth: 280 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.6rem", fontWeight: 700, color: "var(--on-surface-variant)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Client Adherence</span>
                <span style={{ fontFamily: "Manrope, sans-serif", fontSize: "1.5rem", fontWeight: 800, color: adherenceColor }}>{clientPortal.client.adherenceScore}%</span>
              </div>
              <div style={{ height: 8, background: "rgba(255,255,255,0.5)", borderRadius: "9999px", overflow: "hidden", marginBottom: "0.5rem" }}>
                <div style={{ height: "100%", width: `${clientPortal.client.adherenceScore}%`, background: "var(--primary)", borderRadius: "9999px", transition: "width 0.6s cubic-bezier(0.34,1.56,0.64,1)" }} />
              </div>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: "0.68rem", color: "var(--outline)", textAlign: "center", lineHeight: 1.5 }}>
                {clientPortal.client.adherenceScore >= 85
                  ? `${clientPortal.client.fullName.split(" ")[0]} is progressing excellently in all targets.`
                  : clientPortal.client.adherenceScore >= 60
                  ? `${clientPortal.client.fullName.split(" ")[0]} is on track but needs a push on mobility sessions.`
                  : `${clientPortal.client.fullName.split(" ")[0]} may need a curriculum pivot to maintain momentum.`}
              </p>
            </div>
          </div>

          {/* ACTION BAR */}
          <div className="portal-action-bar">
            <div className="portal-action-bar-left">
              <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.65rem", fontWeight: 700, color: "var(--on-surface-variant)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Active View:</span>
              <select
                className="portal-client-select"
                value={selectedClientId ?? ""}
                onChange={e => onSwitchClient(e.target.value)}
              >
                {sorted.map(c => <option key={c.id} value={c.id}>{c.fullName}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: "0.6rem" }}>
              <button onClick={() => onCheckIn(clientPortal.client.id)} style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.55rem 1.25rem", borderRadius: "9999px", border: "none", background: "linear-gradient(135deg, var(--primary) 0%, var(--primary-container) 100%)", fontFamily: "Inter, sans-serif", fontSize: "0.75rem", fontWeight: 700, color: "white", cursor: "pointer", boxShadow: "0 4px 16px rgba(0,135,103,0.25)", transition: "all 0.15s ease" }}>
                <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>check_circle</span>
                Submit Check-in
              </button>
            </div>
          </div>

          {/* TAB NAVIGATION */}
          <div className="portal-tab-row">
            {tabItems.map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`portal-tab-btn${activeTab === t.key ? " portal-tab-btn--active" : ""}`}
              >
                {t.label}
                {t.badge ? (
                  <span className="portal-tab-badge">{t.badge}</span>
                ) : null}
              </button>
            ))}
          </div>

          {/* OVERVIEW TAB */}
          {activeTab === "plan" && (
            <div>
              {clientPortal.plan ? (
                <>
                  <div className="portal-dashboard-row">
                    <div className="portal-goal-card">
                      <div className="portal-goal-header">
                        <div>
                          <div className="portal-goal-title">Primary Goal</div>
                          <div className="portal-goal-text">{clientPortal.client.goal}</div>
                        </div>
                        <span className="material-symbols-outlined" style={{ color: "var(--primary)", fontSize: "1.5rem" }}>track_changes</span>
                      </div>
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Manrope, sans-serif", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.5rem" }}>
                          <span>Current Progress</span>
                          <span style={{ color: "var(--primary)" }}>
                            {checkInHistory.length > 0
                              ? `${(checkInHistory.reduce((s, c) => s + (c.weightDelta ?? 0), 0)).toFixed(1)}kg lost`
                              : "Tracking started"}
                          </span>
                        </div>
                        <div style={{ height: 10, background: "var(--surface-container)", borderRadius: "9999px", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.min(clientPortal.client.adherenceScore, 100)}%`, background: "linear-gradient(90deg, var(--primary) 0%, var(--primary-container) 100%)", borderRadius: "9999px" }} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Inter, sans-serif", fontSize: "0.58rem", fontWeight: 700, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: "0.4rem" }}>
                          <span>Month 1</span><span>Month 3</span><span>Month 5</span>
                        </div>
                      </div>
                    </div>

                    <div className="portal-health-card">
                      <div className="portal-health-header">
                        <span className="material-symbols-outlined" style={{ color: "var(--tertiary)", fontSize: "1.1rem" }}>medical_services</span>
                        <h4>Health &amp; Considerations</h4>
                      </div>
                      <div>
                        <div className="portal-health-item">
                          <div className="portal-health-item-label">Managing Type 2 Diabetes</div>
                          <div className="portal-health-item-desc">Monitoring glucose levels pre/post activity.</div>
                        </div>
                        <div className="portal-health-item" style={{ borderLeftColor: "var(--outline)" }}>
                          <div className="portal-health-item-label">Low-impact focus</div>
                          <div className="portal-health-item-desc">Limit high-intensity bursts to protect joint integrity.</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="portal-dashboard-row">
                    <div className="portal-nutrition-card">
                      <div className="portal-nutrition-header">
                        <h4>Nutrition Strategy</h4>
                        <span className="portal-plan-badge">Active Plan</span>
                      </div>
                      <div className="portal-macro-grid">
                        <div className="portal-macro-chip">
                          <div className="portal-macro-label">Calories</div>
                          <div className="portal-macro-value">{macros?.calories}</div>
                          <div className="portal-macro-unit">KCAL</div>
                        </div>
                        <div className="portal-macro-chip">
                          <div className="portal-macro-label">Protein</div>
                          <div className="portal-macro-value" style={{ color: "var(--text-primary)" }}>{macros?.proteinG}g</div>
                          <div className="portal-macro-unit">40% Target</div>
                        </div>
                        <div className="portal-macro-chip">
                          <div className="portal-macro-label">Fats</div>
                          <div className="portal-macro-value" style={{ color: "var(--text-primary)" }}>{macros?.fatG}g</div>
                          <div className="portal-macro-unit">30% Target</div>
                        </div>
                        <div className="portal-macro-chip">
                          <div className="portal-macro-label">Carbs</div>
                          <div className="portal-macro-value" style={{ color: "var(--text-primary)" }}>{macros?.carbsG}g</div>
                          <div className="portal-macro-unit">30% Target</div>
                        </div>
                      </div>
                      <div className="portal-coach-note">
                        <span className="material-symbols-outlined portal-coach-note-icon">tips_and_updates</span>
                        <div className="portal-coach-note-text">
                          <strong>Coach's Note:</strong> Focus on complex carbohydrates from fibrous vegetables to maintain stable blood sugar levels.
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="portal-workouts-card" style={{ marginBottom: "1rem" }}>
                        <div className="portal-workouts-header">
                          <h4>Workouts</h4>
                          <div style={{ background: "rgba(0,135,103,0.1)", borderRadius: "var(--r-lg)", padding: "0.4rem", display: "grid", placeItems: "center" }}>
                            <span className="material-symbols-outlined" style={{ color: "var(--primary)", fontSize: "1rem" }}>fitness_center</span>
                          </div>
                        </div>
                        <div>
                          {clientPortal.plan.latestVersion.workouts.map((w, i) => (
                            <div key={i} className="portal-workout-item">
                              <div className={`portal-workout-dot${i > 0 ? " portal-workout-dot--dim" : ""}`} />
                              <div>
                                <div className="portal-workout-name">{w.split("(")[0].trim()}</div>
                                {w.includes("(") && (
                                  <div className="portal-workout-meta">{w.match(/\([^)]+\)/)?.[0].replace(/[()]/g, "")}</div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div style={{ marginTop: "1rem", paddingTop: "0.875rem", borderTop: "1px solid var(--surface-container)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.68rem", color: "var(--on-surface-variant)" }}>{clientPortal.plan.title}</span>
                          <span style={{ background: clientPortal.plan.latestVersion.status === "approved" ? "var(--success-light)" : "var(--warning-light)", color: clientPortal.plan.latestVersion.status === "approved" ? "var(--success-text)" : "var(--warning-text)", padding: "0.15rem 0.6rem", borderRadius: "9999px", fontFamily: "Inter, sans-serif", fontSize: "0.6rem", fontWeight: 700, textTransform: "capitalize" }}>
                            {clientPortal.plan.latestVersion.status}
                          </span>
                        </div>
                      </div>

                      <div className="portal-lifestyle-grid">
                        <div className="portal-lifestyle-card">
                          <span className="material-symbols-outlined portal-lifestyle-icon" style={{ color: "var(--primary-container)" }}>water_drop</span>
                          <div>
                            <div className="portal-lifestyle-label">Water Intake</div>
                            <div className="portal-lifestyle-value">3.5L</div>
                          </div>
                          <div className="portal-lifestyle-progress">
                            <div className="portal-lifestyle-progress-fill" style={{ width: "85%" }} />
                          </div>
                        </div>
                        <div className="portal-lifestyle-card">
                          <span className="material-symbols-outlined portal-lifestyle-icon" style={{ color: "var(--tertiary-fixed)" }}>footprint</span>
                          <div>
                            <div className="portal-lifestyle-label">Daily Steps</div>
                            <div className="portal-lifestyle-value">8,000</div>
                          </div>
                          <div className="portal-lifestyle-target">Target: 10,000</div>
                        </div>
                        <div className="portal-lifestyle-card portal-lifestyle-card--wide">
                          <div className="portal-supplements-header">
                            <span className="material-symbols-outlined portal-lifestyle-icon" style={{ color: "var(--tertiary)" }}>pill</span>
                            <h4>Supplements</h4>
                          </div>
                          <div className="portal-supplement-pills">
                            {["Vitamin D3", "Omega-3", "Magnesium"].map(s => (
                              <span key={s} className="portal-supplement-pill">{s}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  <span className="material-symbols-outlined" style={{ fontSize: "3rem", display: "block", marginBottom: "1rem", color: "var(--primary)" }}>library_books</span>
                  <p style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "1rem", color: "var(--text-primary)" }}>No approved plan yet</p>
                  <p style={{ fontSize: "0.875rem" }}>Generate one in AI Plans to get started.</p>
                </div>
              )}
            </div>
          )}

          {/* AI MEAL PLANNING TAB */}
          {activeTab === "meal" && (
            <div className="meal-planner">
              <div className="meal-planner-grid">
                <div className="meal-planner-header">
                  <div>
                    <div className="meal-planner-title">Weekly Meal Planner</div>
                    <div className="meal-week-nav">
                      <div className="meal-week-label">
                        <span className="material-symbols-outlined" style={{ fontSize: "0.9rem", color: "var(--primary)" }}>calendar_today</span>
                        Oct 23 – Oct 29, 2023
                      </div>
                      <button className="meal-week-nav-btn" onClick={() => setMealWeekOffset(o => o - 1)}>
                        <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>chevron_left</span>
                      </button>
                      <button className="meal-week-nav-btn" onClick={() => setMealWeekOffset(o => o + 1)}>
                        <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>chevron_right</span>
                      </button>
                    </div>
                  </div>
                  <button className="meal-save-btn" onClick={() => { push("Meal plan saved and assigned to " + (clientPortal?.client.fullName ?? "client")); setEditingMeal(null); }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "1rem", verticalAlign: "middle", marginRight: "0.35rem" }}>check_circle</span>
                    Save &amp; Assign
                  </button>
                </div>

                <div className="meal-calendar">
                  {/* Helper to render a day column */}
                  {[
                    { name: "Mon", date: 23, isToday: false, calTarget: 1800, proteinTarget: 150, carbsTarget: 210, fatTarget: 58, calCurrent: 1350,
                      meals: [
                        { slot: "Breakfast", name: "Greek Yogurt with Berries", cal: 320, protein: 24, cheat: false },
                        { slot: "Lunch", name: "Grilled Salmon Salad", cal: 480, protein: 38, cheat: false },
                        { slot: "Snacks", name: "Almonds & Apple", cal: 210, protein: 6, cheat: false },
                        { slot: "Dinner", name: "Sesame Tofu Stir-fry", cal: 540, protein: 22, cheat: false },
                      ],
                      cheatMeal: { name: "Classic Burger", cal: 850, protein: 28 }
                    },
                    { name: "Tue", date: 24, isToday: false, calTarget: 1800, proteinTarget: 150, carbsTarget: 210, fatTarget: 58, calCurrent: 1680,
                      meals: [
                        { slot: "Breakfast", name: "Oatmeal with Banana", cal: 380, protein: 12, cheat: false },
                        { slot: "Lunch", name: "Chicken Quinoa Bowl", cal: 520, protein: 42, cheat: false },
                        { slot: "Snacks", name: "Greek Yogurt", cal: 150, protein: 15, cheat: false },
                        { slot: "Dinner", name: "Baked Cod & Asparagus", cal: 430, protein: 40, cheat: false },
                      ],
                      cheatMeal: null
                    },
                    { name: "Wed", date: 25, isToday: false, calTarget: 1800, proteinTarget: 150, carbsTarget: 210, fatTarget: 58, calCurrent: 1920,
                      meals: [
                        { slot: "Breakfast", name: "Avocado Toast & Eggs", cal: 450, protein: 20, cheat: false },
                        { slot: "Lunch", name: "Turkey & Hummus Wrap", cal: 490, protein: 35, cheat: false },
                        { slot: "Snacks", name: "Mixed Nuts & Dates", cal: 280, protein: 8, cheat: false },
                        { slot: "Dinner", name: "Lean Beef Stir-fry", cal: 580, protein: 45, cheat: false },
                      ],
                      cheatMeal: { name: "Margherita Pizza", cal: 900, protein: 32 }
                    },
                    { name: "Thu", date: 26, isToday: true, calTarget: 1800, proteinTarget: 150, carbsTarget: 210, fatTarget: 58, calCurrent: 1120,
                      meals: [
                        { slot: "Breakfast", name: "Protein Smoothie Bowl", cal: 340, protein: 30, cheat: false },
                        { slot: "Lunch", name: "Tuna Nicoise Salad", cal: 420, protein: 40, cheat: false },
                        { slot: "Snacks", name: "Rice Cakes & Almond Butter", cal: 180, protein: 5, cheat: false },
                        { slot: "Dinner", name: "—", cal: 0, protein: 0, cheat: false },
                      ],
                      cheatMeal: null
                    },
                    { name: "Fri", date: 27, isToday: false, calTarget: 1800, proteinTarget: 150, carbsTarget: 210, fatTarget: 58, calCurrent: 0,
                      meals: [
                        { slot: "Breakfast", name: "—", cal: 0, protein: 0, cheat: false },
                        { slot: "Lunch", name: "—", cal: 0, protein: 0, cheat: false },
                        { slot: "Snacks", name: "—", cal: 0, protein: 0, cheat: false },
                        { slot: "Dinner", name: "—", cal: 0, protein: 0, cheat: false },
                      ],
                      cheatMeal: null
                    },
                    { name: "Sat", date: 28, isToday: false, calTarget: 1800, proteinTarget: 150, carbsTarget: 210, fatTarget: 58, calCurrent: 0,
                      meals: [
                        { slot: "Breakfast", name: "—", cal: 0, protein: 0, cheat: false },
                        { slot: "Lunch", name: "—", cal: 0, protein: 0, cheat: false },
                        { slot: "Snacks", name: "—", cal: 0, protein: 0, cheat: false },
                        { slot: "Dinner", name: "—", cal: 0, protein: 0, cheat: false },
                      ],
                      cheatMeal: null
                    },
                    { name: "Sun", date: 29, isToday: false, calTarget: 1800, proteinTarget: 150, carbsTarget: 210, fatTarget: 58, calCurrent: 0,
                      meals: [
                        { slot: "Breakfast", name: "—", cal: 0, protein: 0, cheat: false },
                        { slot: "Lunch", name: "—", cal: 0, protein: 0, cheat: false },
                        { slot: "Snacks", name: "—", cal: 0, protein: 0, cheat: false },
                        { slot: "Dinner", name: "—", cal: 0, protein: 0, cheat: false },
                      ],
                      cheatMeal: null
                    },
                  ].map((day) => {
                    const proteinPct = Math.round((day.proteinTarget / day.proteinTarget) * 100);
                    const carbsPct = Math.round((day.carbsTarget / day.carbsTarget) * 100);
                    const fatPct = Math.round((day.fatTarget / day.fatTarget) * 100);
                    const calPct = Math.round((day.calCurrent / day.calTarget) * 100);

                    return (
                      <div key={day.name} className="meal-day-col">
                        {/* Day header */}
                        <div className="meal-day-header">
                          <div className={`meal-day-name${day.isToday ? " meal-day-name--today" : ""}`}>{day.name}</div>
                          <div className="meal-day-date">{day.date}</div>
                        </div>

                        {/* Daily totals card */}
                        <div className="meal-daily-total">
                          <div className="meal-daily-total-header">
                            <span className="meal-daily-total-label">Daily Total</span>
                            <span className="meal-daily-total-cal">{day.calCurrent > 0 ? `${(day.calCurrent / 1000).toFixed(1)}k` : "0"} cal</span>
                          </div>
                          <div className="meal-daily-bar">
                            <div className="meal-daily-bar-fill" style={{ width: `${Math.min(calPct, 100)}%` }} />
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
                            <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.58rem", fontWeight: 700, color: "var(--on-surface-variant)", textTransform: "uppercase", letterSpacing: "0.04em" }}>P / C / F</span>
                            <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.58rem", fontWeight: 700, color: "var(--text-primary)" }}>
                              {day.proteinTarget}g · {day.carbsTarget}g · {day.fatTarget}g
                            </span>
                          </div>
                          <div className="meal-macro-mini-bars">
                            <div className="meal-macro-mini-bar">
                              <div className="meal-macro-mini-bar-fill meal-macro-mini-bar-fill--protein" style={{ width: `${Math.min(proteinPct, 100)}%` }} />
                            </div>
                            <div className="meal-macro-mini-bar">
                              <div className="meal-macro-mini-bar-fill meal-macro-mini-bar-fill--carbs" style={{ width: `${Math.min(carbsPct, 100)}%` }} />
                            </div>
                            <div className="meal-macro-mini-bar">
                              <div className="meal-macro-mini-bar-fill meal-macro-mini-bar-fill--fat" style={{ width: `${Math.min(fatPct, 100)}%` }} />
                            </div>
                          </div>
                        </div>

                        {/* Meal slots */}
                        {day.meals.map((meal) => (
                          <div key={meal.slot}>
                            <div className="meal-slot-label">{meal.slot}</div>
                            {meal.name === "—" ? (
                              <button className="meal-add-btn" title={`Add ${meal.slot}`} onClick={() => setEditingMeal({ day: day.name, slot: meal.slot })}>
                                <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>add</span>
                              </button>
                            ) : (
                              <div className="meal-item-card">
                                <button className="meal-item-edit" title="Edit meal" onClick={() => setEditingMeal({ day: day.name, slot: meal.slot })}>
                                  <span className="material-symbols-outlined" style={{ fontSize: "0.7rem" }}>edit</span>
                                </button>
                                <div className="meal-item-name">{meal.name}</div>
                                <div className="meal-item-cal">{meal.cal} kcal · {meal.protein}g P</div>
                              </div>
                            )}
                          </div>
                        ))}

                        {/* Cheat meal */}
                        {day.cheatMeal ? (
                          <>
                            <div className="meal-slot-label meal-slot-label--cheat">Cheat Meal</div>
                            <div className="meal-item-card meal-item-card--cheat">
                              <button className="meal-item-edit" title="Edit" onClick={() => setEditingMeal({ day: day.name, slot: "Cheat Meal" })}>
                                <span className="material-symbols-outlined" style={{ fontSize: "0.7rem" }}>edit</span>
                              </button>
                              <div className="meal-item-name">{day.cheatMeal.name}</div>
                              <div className="meal-item-cal meal-item-cal--cheat">{day.cheatMeal.cal} kcal · {day.cheatMeal.protein}g P</div>
                            </div>
                          </>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Meal Architect floating sidebar */}
              {showArchitect ? (
              <div className="meal-architect">
                <div className="meal-architect-label">Meal Architect</div>
                <div className="meal-architect-actions">
                  <button className="meal-architect-btn" onClick={() => { push("AI generating personalized meal plan for this week...", "info"); onNav("plans"); }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "1rem", fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                    <span>AI Generate</span>
                  </button>
                  <button className="meal-architect-btn" onClick={() => { push("Opening Smart Swap — managing nutrition swaps in Habits", "info"); onNav("habits"); }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>swap_horiz</span>
                    <span>Smart Swap</span>
                  </button>
                  <button className="meal-architect-btn" onClick={() => { push("Select a day and meal slot in the calendar to add a meal"); }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>restaurant_menu</span>
                    <span>Add Meal</span>
                  </button>
                  <button className="meal-architect-btn" onClick={() => { push("Macro targets saved — 150g protein, 210g carbs, 58g fat per day", "success"); }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>tune</span>
                    <span>Macro Setup</span>
                  </button>
                </div>
                <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "0.5rem", width: "100%", padding: "0 0.5rem" }}>
                  <button className="meal-architect-btn" style={{ justifyContent: "center" }} onClick={() => setShowArchitect(false)}>
                    <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>chevron_left</span>
                  </button>
                </div>
              </div>
              ) : (
              <button className="meal-architect-btn" style={{ alignSelf: "flex-start", width: "48px", height: "48px", borderRadius: "14px" }} onClick={() => setShowArchitect(true)} title="Show Meal Architect">
                <span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>chevron_right</span>
              </button>
              )}
            </div>
          )}

          {/* AI WORKOUT PLAN TAB */}
          {activeTab === "workout" && (
            <div>
              <div className="workout-designer">
                {/* Exercise Library Sidebar */}
                <div className="workout-library-sidebar">
                  <div>
                    <div className="workout-library-title">Exercise Library</div>
                    <div className="workout-library-subtitle">Drag to sequence</div>
                  </div>
                  {[
                    { icon: "arrow_warm_up", label: "Warm-up", active: true },
                    { icon: "fitness_center", label: "Strength", active: false },
                    { icon: "shutter_speed", label: "Hypertrophy", active: false },
                    { icon: "self_care", label: "Mobility", active: false },
                    { icon: "waves", label: "Cool-down", active: false },
                  ].map(item => (
                    <div key={item.label} className={`workout-lib-item${item.active ? " workout-lib-item--active" : ""}`}>
                      <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>{item.icon}</span>
                      <span>{item.label}</span>
                    </div>
                  ))}
                  <button className="workout-lib-add-btn" onClick={() => { const nextId = Math.max(0, ...workoutExercises.map(e => e.id)) + 1; setWorkoutExercises(prev => [...prev, { id: nextId, name: "New Exercise", tag: "Custom", sets: "3 Sets of 12", duration: "45 Seconds", advanced: "" }]); push("Custom exercise added to plan"); }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>add</span>
                    Add Custom Move
                  </button>
                </div>

                {/* Main Content */}
                <div className="workout-main">
                  {/* Header */}
                  <div className="workout-header">
                    <div className="workout-header-left">
                      <div className="workout-plan-title">High-Intensity Baseline</div>
                      <div className="workout-plan-desc">Design the movement flow for elite metabolic conditioning. Use the "Emerald Path" logic for progressive loading.</div>
                    </div>
                    <div className="workout-stats-pill">
                      <div className="workout-stat">
                        <div className="workout-stat-label">Total Duration</div>
                        <div className="workout-stat-value">42 <span className="workout-stat-unit">min</span></div>
                      </div>
                      <div className="workout-stat-divider" />
                      <div className="workout-stat">
                        <div className="workout-stat-label">Est. Burn</div>
                        <div className="workout-stat-value workout-stat-value--cal">520 <span className="workout-stat-unit">kcal</span></div>
                      </div>
                    </div>
                  </div>

                  {/* Exercise Timeline */}
                  <div className="workout-timeline">
                    {workoutExercises.map((ex, idx) => {
                      const exIcon = ex.name === "Jumping Jacks" ? "directions_run" : ex.name === "High Knees" ? "elevation" : ex.name === "Butt Kicks" ? "steps" : "fitness_center";
                      return (
                        <div key={ex.id} className={`workout-exercise-card${idx === 0 ? " workout-exercise-card--first" : ""}`}>
                          <div className={`workout-timeline-dot${idx > 0 ? " workout-timeline-dot--inactive" : ""}`} />
                          <div className="workout-exercise-icon">
                            <span className="material-symbols-outlined" style={{ fontSize: "2.5rem", color: "var(--primary)", opacity: 0.5, fontVariationSettings: "'wght' 200" }}>{exIcon}</span>
                          </div>
                          <div className="workout-exercise-content">
                            <div className="workout-exercise-header">
                              <div>
                                <div className="workout-exercise-title">{ex.name}</div>
                                <div className="workout-exercise-tag">{ex.tag}</div>
                              </div>
                              <div className="workout-exercise-actions">
                                <button title="Drag to reorder" style={{ cursor: "grab" }}><span className="material-symbols-outlined" style={{ fontSize: "0.9rem" }}>drag_indicator</span></button>
                                <button title="Delete" onClick={() => { setWorkoutExercises(prev => prev.filter(e => e.id !== ex.id)); push(`Removed "${ex.name}" from plan`); }}><span className="material-symbols-outlined" style={{ fontSize: "0.9rem" }}>delete</span></button>
                              </div>
                            </div>
                            <div className="workout-exercise-fields">
                              <div className="workout-field">
                                <div className="workout-field-label">Repetitions</div>
                                <div className="workout-field-input">
                                  <input type="text" value={ex.sets} onChange={e => setWorkoutExercises(prev => prev.map(x => x.id === ex.id ? { ...x, sets: e.target.value } : x))} />
                                  <span className="material-symbols-outlined" style={{ fontSize: "0.85rem", color: "var(--outline)" }}>unfold_more</span>
                                </div>
                              </div>
                              <div className="workout-field">
                                <div className="workout-field-label">Time / Duration</div>
                                <div className="workout-field-input">
                                  <input type="text" value={ex.duration} onChange={e => setWorkoutExercises(prev => prev.map(x => x.id === ex.id ? { ...x, duration: e.target.value } : x))} />
                                  <span className="material-symbols-outlined" style={{ fontSize: "0.85rem", color: "var(--outline)" }}>schedule</span>
                                </div>
                              </div>
                              <div className="workout-field">
                                <div className="workout-field-label">Advanced Options</div>
                                <div className={`workout-field-input${ex.advanced ? " workout-field-input--advanced" : ""}`}>
                                  <input type="text" value={ex.advanced} onChange={e => setWorkoutExercises(prev => prev.map(x => x.id === ex.id ? { ...x, advanced: e.target.value } : x))} placeholder="Add weight/height" />
                                  <span className="material-symbols-outlined" style={{ fontSize: "0.85rem", color: ex.advanced ? "var(--primary)" : "var(--outline)" }}>settings_input_component</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Session Context */}
                  <div className="workout-context">
                    <div>
                      <div className="workout-context-title">
                        <span className="material-symbols-outlined" style={{ fontSize: "1.25rem", color: "var(--primary)" }}>auto_fix_high</span>
                        Session Context
                      </div>
                      <div>
                        <div className="workout-rule-item">
                          <div className="workout-rule-left">
                            <span className="material-symbols-outlined" style={{ fontSize: "0.9rem", color: "var(--primary-container)" }}>timer</span>
                            Warm-up time
                          </div>
                          <div className="workout-rule-value">05:00</div>
                        </div>
                        <div className="workout-rule-item">
                          <div className="workout-rule-left">
                            <span className="material-symbols-outlined" style={{ fontSize: "0.9rem", color: "var(--primary-container)" }}>hotel_class</span>
                            Transition Rest
                          </div>
                          <div className="workout-rule-value">00:30</div>
                        </div>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.6rem", fontWeight: 700, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "0.75rem" }}>
                        Coach's Global Notes
                      </div>
                      <div className="workout-coach-notes">
                        <textarea defaultValue="Focus on breathing tempo and spinal alignment during transitions. Ensure high effort in the final 10 seconds of each plyometric burst." />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Action Bar */}
              <div className="workout-bottom-bar">
                <div className="workout-save-status">
                  <div className="workout-save-dot" />
                  Last saved 2m ago
                </div>
                <div className="workout-bottom-actions">
                  <button className="workout-discard-btn" onClick={() => { setWorkoutExercises([{ id: 1, name: "Jumping Jacks", tag: "Metabolic / Plyometric", sets: "3 Sets of 50", duration: "60 Seconds", advanced: "" }, { id: 2, name: "High Knees", tag: "Agility / Power", sets: "Per Set: 30", duration: "45 Seconds", advanced: "Ankle Weights 1kg" }, { id: 3, name: "Butt Kicks", tag: "Metabolic / Warmup", sets: "Fixed: 40", duration: "30 Seconds", advanced: "" }]); push("Workout draft discarded - reverted to last saved version"); }}>Discard Draft</button>
                  <button className="workout-publish-btn" onClick={async () => { if (clientPortal?.plan) { await onApprove(clientPortal.plan.id); push("Workout plan approved and published!", "success"); } else { push("No active plan to approve", "error"); } }}>Review &amp; Finalize</button>
                </div>
              </div>
            </div>
          )}

          {/* MESSAGES TAB */}
          {activeTab === "messages" && (
            <div className="panel">
              <div className="message-feed" ref={feedRef}>
                {(!clientPortal.messages || clientPortal.messages.length === 0)
                  ? <div className="empty-state" style={{ padding: "2rem 0" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: "2.5rem", display: "block", marginBottom: "0.75rem", color: "var(--outline)" }}>chat</span>
                      <p style={{ fontFamily: "Manrope, sans-serif", fontWeight: 600, color: "var(--text-primary)" }}>No messages yet</p>
                      <p style={{ fontSize: "0.8rem" }}>Start a conversation with {clientPortal.client.fullName.split(" ")[0]}.</p>
                    </div>
                  : clientPortal.messages.map(msg => (
                    <div key={msg.id} className={`message-bubble message-bubble--${msg.sender}`}>
                      <div className="message-text">{msg.content}</div>
                      <span className="message-meta">{new Date(msg.sentAt).toLocaleTimeString()}</span>
                    </div>
                  ))
                }
              </div>
              <form className="message-input-row" onSubmit={handleSendMessage}>
                <input value={msgDraft} onChange={e => setMsgDraft(e.target.value)} placeholder="Type a message…" />
                <button type="submit">Send</button>
              </form>
            </div>
          )}

          {/* HISTORY TAB */}
          {activeTab === "history" && (
            <div>
              {!checkInHistory.length ? (
                <div className="empty-state">
                  <span className="material-symbols-outlined" style={{ fontSize: "3rem", display: "block", marginBottom: "1rem", color: "var(--outline)" }}>timeline</span>
                  <p style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, color: "var(--text-primary)" }}>No check-in history yet</p>
                  <p style={{ fontSize: "0.875rem" }}>{clientPortal.client.fullName.split(" ")[0]} hasn't submitted a check-in yet.</p>
                </div>
              ) : (
                <div>
                  <div className="stat-grid" style={{ marginBottom: "2rem" }}>
                    <div className="stat-card stat-card--accent">
                      <div className="stat-card__label">Total Check-ins</div>
                      <div className="stat-card__value">{checkInHistory.length}</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-card__label">Avg Adherence</div>
                      <div className="stat-card__value" style={{ fontSize: "1.6rem" }}>
                        {Math.round(checkInHistory.reduce((s, c) => s + (c.adherenceDelta ?? 0), 0) / checkInHistory.length + 60)}%
                      </div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-card__label">Weight Trend</div>
                      <div className="stat-card__value" style={{ fontSize: "1.6rem", color: "var(--primary)" }}>
                        {(() => {
                          const deltas = checkInHistory.filter(c => c.weightDelta != null);
                          if (deltas.length < 2) return "—";
                          const net = deltas[deltas.length - 1].weightDelta! + deltas[0].weightDelta!;
                          return `${net > 0 ? "+" : ""}${net.toFixed(1)}kg`;
                        })()}
                      </div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-card__label">Avg Energy</div>
                      <div className="stat-card__value" style={{ fontSize: "1.6rem" }}>
                        {(checkInHistory.reduce((s, c) => s + c.progress.energyScore, 0) / checkInHistory.length).toFixed(1)}/10
                      </div>
                    </div>
                  </div>

                  <div className="panel" style={{ marginBottom: "1.5rem" }}>
                    <div className="section-header">
                      <h2>Weight Trend</h2>
                      <span className="pill pill-info">kg</span>
                    </div>
                    <div className="trend-chart">
                      {checkInHistory.map((checkIn) => {
                        const weights = checkInHistory.map(c => c.progress.weightKg).filter(w => w != null) as number[];
                        const maxW = Math.max(...weights);
                        const minW = Math.min(...weights);
                        const range = maxW - minW || 1;
                        const pct = ((checkIn.progress.weightKg! - minW) / range) * 100;
                        const hasWeight = checkIn.progress.weightKg != null;
                        return (
                          <div key={checkIn.id} className="trend-bar-wrap">
                            <div className="trend-bar-track">
                              <div className="trend-bar-fill trend-bar-fill--weight" style={{ height: hasWeight ? `${Math.max(8, pct)}%` : "8%", opacity: hasWeight ? 1 : 0.3 }} />
                            </div>
                            <span className="trend-bar-label">{checkIn.progress.weightKg != null ? `${checkIn.progress.weightKg}` : "—"}</span>
                            <span className="trend-bar-date">{new Date(checkIn.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="panel" style={{ marginBottom: "1.5rem" }}>
                    <div className="section-header">
                      <h2>Energy Score</h2>
                      <span className="pill pill-warning">/10</span>
                    </div>
                    <div className="trend-chart">
                      {checkInHistory.map((checkIn) => {
                        const pct = (checkIn.progress.energyScore / 10) * 100;
                        const color = checkIn.progress.energyScore <= 4 ? "var(--danger)" : checkIn.progress.energyScore <= 7 ? "var(--warning)" : "var(--primary)";
                        return (
                          <div key={checkIn.id} className="trend-bar-wrap">
                            <div className="trend-bar-track">
                              <div className="trend-bar-fill" style={{ height: `${pct}%`, background: color }} />
                            </div>
                            <span className="trend-bar-label" style={{ color }}>{checkIn.progress.energyScore}</span>
                            <span className="trend-bar-date">{new Date(checkIn.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="panel">
                    <div className="section-header"><h2>Check-In Log</h2></div>
                    <div className="timeline">
                      {[...checkInHistory].reverse().map((checkIn) => (
                        <div key={checkIn.id} className="timeline-item">
                          <div className="timeline-dot" />
                          <div className="timeline-content">
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                              <strong style={{ color: "var(--on-surface)" }}>
                                {new Date(checkIn.submittedAt).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
                              </strong>
                              <div style={{ display: "flex", gap: "0.4rem" }}>
                                {checkIn.weightDelta != null && (
                                  <span style={{ background: checkIn.weightDelta < 0 ? "var(--success-light)" : checkIn.weightDelta > 0 ? "var(--danger-light)" : "var(--surface-container)", color: checkIn.weightDelta < 0 ? "var(--success-text)" : checkIn.weightDelta > 0 ? "var(--danger-text)" : "var(--on-surface-variant)", padding: "0.15rem 0.6rem", borderRadius: "9999px", fontFamily: "Inter, sans-serif", fontSize: "0.65rem", fontWeight: 700 }}>
                                    {checkIn.weightDelta > 0 ? "+" : ""}{checkIn.weightDelta.toFixed(1)}kg
                                  </span>
                                )}
                                {checkIn.photoCount > 0 && (
                                  <span style={{ background: "var(--info-light)", color: "var(--info-text)", padding: "0.15rem 0.6rem", borderRadius: "9999px", fontFamily: "Inter, sans-serif", fontSize: "0.65rem", fontWeight: 700 }}>
                                    {checkIn.photoCount} photo{checkIn.photoCount > 1 ? "s" : ""}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.5rem", fontFamily: "Manrope, sans-serif", fontSize: "0.78rem", color: "var(--text-primary)" }}>
                              {checkIn.progress.weightKg != null && (
                                <span><strong>{checkIn.progress.weightKg}kg</strong></span>
                              )}
                              <span>{checkIn.progress.energyScore}/10 energy</span>
                              <span>{checkIn.progress.steps.toLocaleString()} steps</span>
                              {checkIn.progress.waistCm != null && (
                                <span>{checkIn.progress.waistCm}cm waist</span>
                              )}
                            </div>
                            {checkIn.progress.notes && (
                              <p style={{ fontFamily: "Inter, sans-serif", fontSize: "0.78rem", color: "var(--on-surface-variant)", margin: 0, fontStyle: "italic", lineHeight: 1.5 }}>"{checkIn.progress.notes}"</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── BILLING VIEW ──────────────────────
function BillingView({ session, onToggleBilling }: {
  session: CoachSession;
  onToggleBilling: (clientId: string, status: "active"|"past_due"|"cancelled") => Promise<void>;
}) {
  const subs = session.subscriptions;
  const mrrGbp = subs.filter(s => s.status === "active").reduce((sum, s) => sum + s.amountGbp, 0);
  const churnCount = subs.filter(s => s.status === "past_due").length;
  const trialingCount = subs.filter(s => s.status === "trialing").length;

  const vatRate = 0.20;
  const totalTaxGbp = mrrGbp * vatRate;

  return (
    <div className="page-view">
      <p className="eyebrow">Billing & Tax Compliance</p>
      <h1 className="page-title">Revenue & Invoicing</h1>
      <p className="page-subtitle">Auto-calculated UK VAT (20%) and compliance-ready PDFs for self-assessment.</p>

      <div className="stat-grid" style={{ marginBottom: "2rem" }}>
        <div className="stat-card stat-card--accent card-glass">
          <div className="stat-card__label">Monthly Recurring Revenue</div>
          <div className="stat-card__value">£{mrrGbp}</div>
        </div>
        <div className="stat-card card-glass" style={{ borderLeft: "3px solid var(--primary)" }}>
          <div className="stat-card__label">Est. VAT Collected (20%)</div>
          <div className="stat-card__value">£{totalTaxGbp.toFixed(2)}</div>
        </div>
        <div className="stat-card stat-card--danger card-glass">
          <div className="stat-card__label">Past Due</div>
          <div className="stat-card__value" style={{ color: "var(--danger)" }}>{churnCount}</div>
        </div>
        <div className="stat-card stat-card--warning card-glass">
          <div className="stat-card__label">Trialing</div>
          <div className="stat-card__value" style={{ color: "var(--warning)" }}>{trialingCount}</div>
        </div>
      </div>

      <div className="panel card-glass">
        <div className="section-header inline-spread">
          <h2>Client Subscriptions & Invoices</h2>
          <button className="secondary sm" onClick={() => downloadBulkTaxReport(subs, session.clients, session.workspace)}>📥 Bulk Download Tax Report</button>
        </div>
        <div className="stack compact">
          {subs.map(sub => {
            const client = session.clients.find(c => c.id === sub.clientId);
            const subVat = sub.amountGbp * vatRate;
            const subNet = sub.amountGbp - subVat;
            return (
              <div key={sub.id} className="row-line" style={{ background: "var(--surface-container-low)" }}>
                <div className="inline">
                  {client && <Avatar name={client.fullName} />}
                  <div>
                    <strong style={{ color: "var(--on-surface)" }}>{client?.fullName}</strong>
                    <p className="muted text-xs" style={{ margin: "0.1rem 0 0" }}>Renews {sub.renewalDate}</p>
                  </div>
                </div>
                <div className="inline" style={{ gap: "1.5rem" }}>
                  <div style={{ textAlign: "right", display: "flex", flexDirection: "column" }}>
                    <span style={{ fontWeight: 700, color: "var(--on-surface)" }}>£{sub.amountGbp.toFixed(2)}/mo</span>
                    <span className="muted text-xs">Net: £{subNet.toFixed(2)} + VAT: £{subVat.toFixed(2)}</span>
                  </div>
                  <span className={`pill ${sub.status === "past_due" ? "pill-danger" : sub.status === "trialing" ? "pill-warning" : "pill-success"}`}>
                    {sub.status}
                  </span>
                  <div className="inline compact">
                    <button className="ghost sm" onClick={() => client && generateInvoicePDF(sub, client, session.workspace)}>📄 PDF Invoice</button>
                    {sub.status === "active" ? (
                      <button className="secondary sm" onClick={() => onToggleBilling(sub.clientId, "past_due")}>Mark due</button>
                    ) : (
                      <button className="secondary sm" onClick={() => onToggleBilling(sub.clientId, "active")}>Recovered</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── MIGRATION VIEW ──────────────────────
function MigrationView({ onReload }: { onReload: () => Promise<void> }) {
  const [csvRows, setCsvRows] = useState("Name,Email,Goal,MonthlyPriceGbp\nEmma Walker,emma@example.com,Drop 6kg before wedding,179\nNoah Reed,noah@example.com,Improve strength and reduce body fat,149");
  const [preview, setPreview] = useState<any>(null);
  const [restoreJson, setRestoreJson] = useState("");
  const [loading, setLoading] = useState<string|null>(null);
  const { push } = useToast();

  const doPreview = async () => {
    const rows = csvToRows(csvRows);
    setPreview(await fetchJson("/import/preview", { method: "POST", body: JSON.stringify({ rows }) }));
  };
  const doCommit = async () => {
    setLoading("commit");
    try {
      const rows = csvToRows(csvRows);
      await fetchJson("/import/commit", { method: "POST", body: JSON.stringify({ rows }) });
      await onReload(); push("Clients imported successfully");
    } finally { setLoading(null); }
  };
  const doReset = async () => {
    setLoading("reset");
    try { await fetchJson("/admin/state/reset", { method: "POST", body: "{}" }); await onReload(); push("State reset to seed data"); }
    finally { setLoading(null); }
  };
  const doRestore = async (e: FormEvent) => {
    e.preventDefault();
    setLoading("restore");
    try { await fetchJson("/admin/state/import", { method: "POST", body: JSON.stringify(JSON.parse(restoreJson)) }); await onReload(); push("Snapshot restored"); }
    catch { push("Invalid JSON snapshot", "error"); }
    finally { setLoading(null); }
  };

  return (
    <div className="page-view">
      <p className="eyebrow">Migration Assistant</p>
      <h1 className="page-title">Data Migration</h1>
      <p className="page-subtitle">Import clients from CSV, export rollback bundles, and restore snapshots safely.</p>

      <div className="content-grid">
        <div className="panel">
          <div className="section-header"><h2>CSV Import</h2></div>
          <div className="stack">
            <textarea className="csv-box" value={csvRows} onChange={e => setCsvRows(e.target.value)} />
            <div className="inline">
              <button className="secondary" onClick={doPreview}>Preview</button>
              <button disabled={loading === "commit"} onClick={doCommit}>{loading === "commit" ? "Importing…" : "Commit rows"}</button>
            </div>
            {preview && (
              <div className="preview-table">
                <div className="inline" style={{ marginBottom: "0.75rem" }}>
                  <span className="pill pill-success">{preview.validRows} valid</span>
                  {preview.invalidRows > 0 && <span className="pill pill-danger">{preview.invalidRows} invalid</span>}
                </div>
                <div className="stack compact">
                  {preview.parsed.map((row: any) => (
                    <div key={row.row} className="row-line">
                      <span className="text-sm muted">Row {row.row}</span>
                      <span className="text-sm">{row.success ? row.data.name : row.issues.join(", ")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="panel">
            <div className="section-header"><h2>Export & Rollback</h2></div>
            <p className="muted text-sm" style={{ marginBottom: "1rem" }}>Download a portable JSON snapshot of all state — clients, plans, payments, and analytics.</p>
            <div className="inline">
              <a className="ghost-button" href={`${apiBase}/export`} target="_blank" rel="noreferrer">↓ Export bundle</a>
              <button className="danger" disabled={loading === "reset"} onClick={doReset}>{loading === "reset" ? "Resetting…" : "Reset to seed"}</button>
            </div>
          </div>

          <div className="panel">
            <div className="section-header"><h2>Restore Snapshot</h2></div>
            <form className="stack" onSubmit={doRestore}>
              <textarea className="csv-box" value={restoreJson} onChange={e => setRestoreJson(e.target.value)} placeholder='Paste exported JSON here…' />
              <button type="submit" disabled={loading === "restore"}>{loading === "restore" ? "Restoring…" : "Restore snapshot"}</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── SETTINGS VIEW ──────────────────────
function SettingsView({ session, onSave }: {
  session: CoachSession;
  onSave: (draft: any) => Promise<void>;
}) {
  const [draft, setDraft] = useState({
    name: session.workspace.name,
    brandColor: session.workspace.brandColor,
    accentColor: session.workspace.accentColor,
    heroMessage: session.workspace.heroMessage,
    stripeConnected: session.workspace.stripeConnected,
  });

  return (
    <div className="page-view">
      <p className="eyebrow">Workspace</p>
      <h1 className="page-title">Settings</h1>
      <p className="page-subtitle">Brand setup, Stripe connection, and rollback options.</p>

      <div className="panel" style={{ maxWidth: 640 }}>
        <form className="stack" onSubmit={async e => { e.preventDefault(); await onSave(draft); }}>
          <label>Workspace name
            <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
          </label>
          <label>Hero message
            <textarea value={draft.heroMessage} onChange={e => setDraft(d => ({ ...d, heroMessage: e.target.value }))} />
          </label>
          <div className="two-col">
            <label>Brand color<input type="color" value={draft.brandColor} onChange={e => setDraft(d => ({ ...d, brandColor: e.target.value }))} /></label>
            <label>Accent color<input type="color" value={draft.accentColor} onChange={e => setDraft(d => ({ ...d, accentColor: e.target.value }))} /></label>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={draft.stripeConnected} onChange={e => setDraft(d => ({ ...d, stripeConnected: e.target.checked }))} />
            Stripe GBP connected
          </label>
          <div className="inline">
            <button type="submit">Save settings</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────
   ONBOARDING WIZARD
──────────────────────────────────────── */
function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState({
    name: "My Coaching Business",
    brandColor: "#123f2d",
    accentColor: "#ff8757",
    heroMessage: "Elite coaching that adapts to your life.",
    stripeConnected: false,
  });

  const COACH_TYPES = [
    { id: "strength", label: "Strength & Conditioning" },
    { id: "nutrition", label: "Nutrition Coach" },
    { id: "wellness", label: "Wellness Coach" },
    { id: "endurance", label: "Endurance Coach" },
    { id: "powerlifting", label: "Powerlifting" },
    { id: "gym-owner", label: "Gym / Studio Owner" },
  ];

  const [coachTypes, setCoachTypes] = useState<string[]>([]);
  const STEPS = ["Workspace", "Coach Type", "Launch"];

  const next = () => {
    if (step < STEPS.length - 1) setStep(s => s + 1);
    else onComplete();
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onComplete()}>
      <div className="modal-panel">
        {/* Progress dots */}
        <div className="onboard-step-dots">
          {STEPS.map((_, i) => (
            <div key={i} className={`step-dot ${i === step ? "active" : i < step ? "done" : ""}`} />
          ))}
        </div>

        {/* Step 0 — Workspace Setup */}
        {step === 0 && (
          <div>
            <p className="eyebrow">Step 1 of {STEPS.length}</p>
            <h2 className="modal-title">Set up your workspace</h2>
            <p className="modal-subtitle">Personalise your coaching brand and messaging.</p>
            <div className="stack">
              <div className="onboard-field">
                <label>Workspace name<input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} /></label>
              </div>
              <div className="onboard-field">
                <label>Hero message<textarea value={draft.heroMessage} onChange={e => setDraft(d => ({ ...d, heroMessage: e.target.value }))} /></label>
              </div>
              <div className="two-col">
                <label>Brand color<input type="color" value={draft.brandColor} onChange={e => setDraft(d => ({ ...d, brandColor: e.target.value }))} style={{ padding: "0.25rem" }} /></label>
                <label>Accent color<input type="color" value={draft.accentColor} onChange={e => setDraft(d => ({ ...d, accentColor: e.target.value }))} style={{ padding: "0.25rem" }} /></label>
              </div>
            </div>
          </div>
        )}

        {/* Step 1 — Coach Type */}
        {step === 1 && (
          <div>
            <p className="eyebrow">Step 2 of {STEPS.length}</p>
            <h2 className="modal-title">What kind of coach are you?</h2>
            <p className="modal-subtitle">We'll tailor your experience — you can change this later.</p>
            <div className="coach-type-grid" style={{ marginTop: "1.5rem" }}>
              {COACH_TYPES.map(ct => (
                <button
                  key={ct.id}
                  className={`coach-type-card ${coachTypes.includes(ct.id) ? "selected" : ""}`}
                  onClick={() => setCoachTypes(prev =>
                    prev.includes(ct.id) ? prev.filter(c => c !== ct.id) : [...prev, ct.id]
                  )}
                >
                  {ct.label}
                </button>
              ))}
            </div>
            {coachTypes.length > 0 && (
              <p className="text-sm muted" style={{ marginTop: "0.75rem", textAlign: "center" }}>
                {coachTypes.length} selected
              </p>
            )}
          </div>
        )}

        {/* Step 2 — Launch */}
        {step === 2 && (
          <div style={{ textAlign: "center", padding: "1rem 0" }}>
            <p className="eyebrow">Step 3 of {STEPS.length}</p>
            <h2 className="modal-title">You're all set!</h2>
            <p className="modal-subtitle">Your workspace is ready. Let's go.</p>
            <div style={{ marginTop: "2rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div className="onboard-summary-item">
                <span className="onboard-summary-icon">🏋️</span>
                <span>CoachOS workspace created</span>
              </div>
              {coachTypes.length > 0 && (
                <div className="onboard-summary-item">
                  <span className="onboard-summary-icon">🎯</span>
                  <span>{coachTypes.length} coaching specialty{coachTypes.length > 1 ? "ies" : "y"} selected</span>
                </div>
              )}
              <div className="onboard-summary-item">
                <span className="onboard-summary-icon">📋</span>
                <span>Demo clients loaded and ready to explore</span>
              </div>
            </div>
          </div>
        )}

        <div className="onboard-actions">
          {step > 0 ? (
            <button className="secondary" onClick={() => setStep(s => s - 1)}>← Back</button>
          ) : (
            <div />
          )}
          <div className="inline">
            <span className="text-sm muted">{step + 1} / {STEPS.length}</span>
            <button onClick={next}>{step === STEPS.length - 1 ? "Launch CoachOS →" : "Continue →"}</button>
          </div>
        </div>
        <div className="onboard-skip" onClick={onComplete}>Skip onboarding — use defaults</div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────
   GROUP PROGRAMS VIEW
──────────────────────────────────────── */
function GroupsView({ session, onCreate, onUpdate, onArchive }: {
  session: CoachSession;
  onCreate: (payload: Partial<GroupProgram>) => Promise<void>;
  onUpdate: (programId: string, patch: Partial<GroupProgram>) => Promise<void>;
  onArchive: (programId: string) => Promise<void>;
}) {
  const [programs, setPrograms] = useState<GroupProgram[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { push } = useToast();

  useEffect(() => {
    fetchJson<GroupProgram[]>("/group-programs").then(setPrograms).catch(() => push("Failed to load programs", "error"));
  }, []);

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await fetchJson<GroupProgram[]>("/group-programs");
      setPrograms(data);
    } finally { setLoading(false); }
  };

  const handleArchive = async (id: string) => {
    await onArchive(id);
    await refresh();
    push("Program archived");
  };

  const handleCreate = async (payload: Partial<GroupProgram>) => {
    await onCreate(payload);
    await refresh();
    setShowCreate(false);
    push("Group program created");
  };

  const handleUpdate = async (id: string, patch: Partial<GroupProgram>) => {
    await onUpdate(id, patch);
    await refresh();
    setEditId(null);
    push("Program updated");
  };

  const activePrograms = programs.filter(p => p.status === "active");
  const archivedPrograms = programs.filter(p => p.status === "archived");

  const ProgramCard = ({ program }: { program: GroupProgram }) => {
    const members = session.clients.filter(c => program.memberIds.includes(c.id));
    return (
      <div className="program-card" onClick={() => setEditId(program.id)}>
        <div className="program-card-header">
          <div>
            <div className="program-card-title">{program.title}</div>
            <div className="program-card-goal">{program.goal}</div>
          </div>
          <span className={`pill ${program.status === "active" ? "pill-success" : program.status === "archived" ? "pill-muted" : "pill-info"}`}>
            {program.status}
          </span>
        </div>
        <div className="program-member-avatars">
          {members.map(m => <span key={m.id} className="member-chip">{m.fullName.split(" ")[0]}</span>)}
          {members.length === 0 && <span className="text-sm muted">No members yet</span>}
        </div>
        <div className="program-stats-row">
          <div className="program-stat">
            <span className="program-stat-label">Members</span>
            <span className="program-stat-value">{program.memberIds.length}</span>
          </div>
          <div className="program-stat">
            <span className="program-stat-label">Price/mo</span>
            <span className="program-stat-value">£{program.monthlyPriceGbp}</span>
          </div>
          <div className="program-stat">
            <span className="program-stat-label">Revenue/mo</span>
            <span className="program-stat-value">£{program.monthlyPriceGbp * program.memberIds.length}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="page-view">
      <p className="eyebrow">Group Coaching</p>
      <h1 className="page-title">Group Programs</h1>
      <p className="page-subtitle">Run coaching programmes for multiple clients simultaneously with shared tracking.</p>

      {programs.length === 0 && !showCreate && (
        <div className="panel">
          <div className="empty-state">
            <div className="empty-state-icon">👥</div>
            <p style={{ color: "var(--on-surface)", fontWeight: 600 }}>No group programs yet</p>
            <p className="muted text-sm">Create a programme to coach multiple clients together.</p>
          </div>
        </div>
      )}

      <div className="stack">
        {/* Active programs grid */}
        <div className="content-grid">
          {activePrograms.map(p => <ProgramCard key={p.id} program={p} />)}
          <div className="program-create-card" onClick={() => setShowCreate(true)}>
            <div className="program-create-card-icon">+</div>
            <div className="program-create-card-label">Create Program</div>
          </div>
        </div>

        {/* Archived */}
        {archivedPrograms.length > 0 && (
          <div>
            <p className="eyebrow" style={{ marginBottom: "0.5rem" }}>Archived</p>
            <div className="content-grid">
              {archivedPrograms.map(p => <ProgramCard key={p.id} program={p} />)}
            </div>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <CreateProgramModal
          clients={session.clients}
          onSave={handleCreate}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* Edit modal */}
      {editId && (
        <EditProgramModal
          program={programs.find(p => p.id === editId)!}
          clients={session.clients}
          onSave={patch => handleUpdate(editId, patch)}
          onArchive={() => handleArchive(editId)}
          onClose={() => setEditId(null)}
        />
      )}
    </div>
  );
}

function CreateProgramModal({ clients, onSave, onClose }: {
  clients: ClientProfile[];
  onSave: (p: Partial<GroupProgram>) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState(99);
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (id: string) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const handleSave = () => {
    onSave({
      id: `gp_${Date.now()}`,
      coachId: "coach_1",
      title,
      goal,
      description,
      memberIds: selected,
      monthlyPriceGbp: price,
      status: "active",
      createdAt: new Date().toISOString(),
    });
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel">
        <p className="eyebrow">New Group Program</p>
        <h2 className="modal-title">Create Program</h2>
        <p className="modal-subtitle">Set up a shared programme for multiple clients.</p>
        <div className="create-program-form">
          <label>Program title<input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Summer Fat-Loss Sprint" /></label>
          <label>Goal<input value={goal} onChange={e => setGoal(e.target.value)} placeholder="e.g. Lose 4kg before summer" /></label>
          <label>Description<textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief description of the programme..." /></label>
          <label>Monthly price (£)<input type="number" value={price} onChange={e => setPrice(Number(e.target.value))} /></label>
          <div>
            <label style={{ marginBottom: "0.5rem" }}>Assign clients</label>
            <div className="member-select-list">
              {clients.map(c => (
                <label key={c.id} className="member-checkbox-row">
                  <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} />
                  <Avatar name={c.fullName} />
                  <span>{c.fullName}</span>
                  <StatusPill status={c.status} />
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="onboard-actions">
          <button className="secondary" onClick={onClose}>Cancel</button>
          <button onClick={handleSave} disabled={!title.trim()}>Create Program</button>
        </div>
      </div>
    </div>
  );
}

function EditProgramModal({ program, clients, onSave, onArchive, onClose }: {
  program: GroupProgram;
  clients: ClientProfile[];
  onSave: (p: Partial<GroupProgram>) => void;
  onArchive: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(program.title);
  const [goal, setGoal] = useState(program.goal);
  const [description, setDescription] = useState(program.description);
  const [price, setPrice] = useState(program.monthlyPriceGbp);
  const [selected, setSelected] = useState<string[]>(program.memberIds);

  const toggle = (id: string) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel">
        <p className="eyebrow">Edit Program</p>
        <h2 className="modal-title">{program.title}</h2>
        <div className="create-program-form">
          <label>Program title<input value={title} onChange={e => setTitle(e.target.value)} /></label>
          <label>Goal<input value={goal} onChange={e => setGoal(e.target.value)} /></label>
          <label>Description<textarea value={description} onChange={e => setDescription(e.target.value)} /></label>
          <label>Monthly price (£)<input type="number" value={price} onChange={e => setPrice(Number(e.target.value))} /></label>
          <div>
            <label style={{ marginBottom: "0.5rem" }}>Members</label>
            <div className="member-select-list">
              {clients.map(c => (
                <label key={c.id} className="member-checkbox-row">
                  <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} />
                  <Avatar name={c.fullName} />
                  <span>{c.fullName}</span>
                  <StatusPill status={c.status} />
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="onboard-actions">
          <button className="danger" onClick={onArchive}>Archive Program</button>
          <div className="inline">
            <button className="secondary" onClick={onClose}>Cancel</button>
            <button onClick={() => onSave({ title, goal, description, memberIds: selected, monthlyPriceGbp: price })}>Save Changes</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────
   HABITS VIEW
──────────────────────────────────────── */
function HabitsView({ session }: { session: CoachSession }) {
  const [summaries, setSummaries] = useState<Map<string, HabitSummary[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [showAddHabit, setShowAddHabit] = useState<string | null>(null);
  const [newHabitTitle, setNewHabitTitle] = useState("");
  const [newHabitFreq, setNewHabitFreq] = useState<"daily"|"weekly">("daily");
  const { push } = useToast();

  useEffect(() => {
    Promise.all(
      session.clients.map(async (client) => {
        try {
          const data = await fetchJson<HabitSummary[]>(`/habits/summary?clientId=${client.id}`);
          return { clientId: client.id, data };
        } catch { return { clientId: client.id, data: [] }; }
      })
    ).then(results => {
      const map = new Map<string, HabitSummary[]>();
      for (const r of results) map.set(r.clientId, r.data);
      setSummaries(map);
    }).finally(() => setLoading(false));
  }, [session.clients]);

  const toggleCompletion = async (habitId: string, clientId: string) => {
    try {
      await fetchJson(`/habits/${habitId}/complete`, { method: "POST", body: JSON.stringify({}) });
      // Refresh
      const data = await fetchJson<HabitSummary[]>(`/habits/summary?clientId=${clientId}`);
      setSummaries(prev => new Map(prev).set(clientId, data));
    } catch { push("Failed to toggle habit", "error"); }
  };

  const sendNudge = async (clientId: string, habitTitle: string) => {
    await fetchJson("/analytics", {
      method: "POST",
      body: JSON.stringify({
        name: "habit_nudge_sent",
        actorId: clientId,
        occurredAt: new Date().toISOString(),
        metadata: { habit: habitTitle }
      })
    });
    push("Nudge sent to client ✓");
  };

  const addHabit = async (clientId: string) => {
    if (!newHabitTitle.trim()) return;
    try {
      await fetchJson("/habits", {
        method: "POST",
        body: JSON.stringify({ clientId, title: newHabitTitle, target: 1, frequency: newHabitFreq })
      });
      const data = await fetchJson<HabitSummary[]>(`/habits/summary?clientId=${clientId}`);
      setSummaries(prev => new Map(prev).set(clientId, data));
      setShowAddHabit(null);
      setNewHabitTitle("");
      push("Habit created");
    } catch { push("Failed to create habit", "error"); }
  };

  const today = new Date().toISOString().slice(0, 10);
  const completionRate = (clientId: string) => {
    const items = summaries.get(clientId) ?? [];
    if (!items.length) return 0;
    return Math.round((items.filter(i => i.todayDone).length / items.length) * 100);
  };

  return (
    <div className="page-view">
      <p className="eyebrow">Habit Coaching</p>
      <h1 className="page-title">Daily Habits & Nudges</h1>
      <p className="page-subtitle">Track streaks, send automated nudges, and build consistency with every client.</p>

      {loading ? (
        <div style={{ display: "grid", placeItems: "center", padding: "4rem" }}><div className="spinner" /></div>
      ) : (
        <div>
          {session.clients.map(client => {
            const items = summaries.get(client.id) ?? [];
            const rate = completionRate(client.id);
            return (
              <div key={client.id} className="habit-client-section">
                <div className="habit-client-header">
                  <Avatar name={client.fullName} />
                  <div>
                    <div className="habit-client-name">{client.fullName}</div>
                    <div className="habit-summary-stats">
                      <span className={`pill ${rate >= 70 ? "pill-success" : rate >= 40 ? "pill-warning" : "pill-danger"}`}>
                        {rate}% today
                      </span>
                      {items.map(i => i.streak > 0 && (
                        <span key={i.habit.id} className="habit-streak-badge">🔥 {i.streak}d streak</span>
                      ))}
                    </div>
                  </div>
                  <button className="ghost sm" style={{ marginLeft: "auto" }} onClick={() => setShowAddHabit(showAddHabit === client.id ? null : client.id)}>
                    + Add Habit
                  </button>
                </div>

                {showAddHabit === client.id && (
                  <div className="panel" style={{ marginBottom: "1rem" }}>
                    <div className="stack compact">
                      <input
                        value={newHabitTitle}
                        onChange={e => setNewHabitTitle(e.target.value)}
                        placeholder="e.g. Log meals in the app"
                      />
                      <div className="inline">
                        <select value={newHabitFreq} onChange={e => setNewHabitFreq(e.target.value as "daily"|"weekly")}>
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                        </select>
                        <button onClick={() => addHabit(client.id)}>Create</button>
                        <button className="secondary" onClick={() => setShowAddHabit(null)}>Cancel</button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="habit-card">
                  {items.length === 0 && (
                    <div className="empty-state" style={{ padding: "1.5rem" }}>
                      <p>No habits yet. Add one above.</p>
                    </div>
                  )}
                  {items.map(({ habit, streak, todayDone }) => (
                    <div key={habit.id} className="habit-item">
                      <input
                        type="checkbox"
                        className={`habit-checkbox${todayDone ? " checked" : ""}`}
                        checked={todayDone}
                        onChange={() => toggleCompletion(habit.id, client.id)}
                      />
                      <span className={`habit-title${todayDone ? " done" : ""}`}>{habit.title}</span>
                      <div className="habit-meta">
                        <span className="streak-flame">🔥 {streak}</span>
                        <span className="habit-frequency">{habit.frequency}</span>
                        {!todayDone && (
                          <button className="habit-nudge-btn" onClick={() => sendNudge(client.id, habit.title)}>
                            Send nudge
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────
   EXERCISES VIEW
──────────────────────────────────────── */
function ExercisesView() {
  const [search, setSearch] = useState("");
  const [bodyPart, setBodyPart] = useState("all");
  const [exercises, setExercises] = useState<Exercise[]>([]);

  const BODY_PARTS = ["all", "Chest", "Back", "Legs", "Shoulders", "Arms", "Core", "Cardio"];

  const load = async () => {
    const q = new URLSearchParams();
    if (search.trim()) q.set("search", search.trim());
    if (bodyPart !== "all") q.set("bodyPart", bodyPart);
    const suffix = q.toString() ? `?${q}` : "";
    const data = await fetchJson<Exercise[]>(`/exercises${suffix}`);
    setExercises(data);
  };

  useEffect(() => { load(); }, [bodyPart]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page-view">
      <p className="eyebrow">Exercise Library</p>
      <h1 className="page-title">Movement Database</h1>
      <p className="page-subtitle">{exercises.length} exercises across all movement patterns — tagged by body part, equipment, and difficulty.</p>

      <div className="panel">
        <div className="search-wrapper" style={{ marginBottom: "1rem" }}>
          <span className="search-icon">⌕</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search exercises…" />
        </div>
        <div className="exercise-filters">
          {BODY_PARTS.map(bp => (
            <button key={bp} className={`exercise-filter-pill${bodyPart === bp ? " active" : ""}`} onClick={() => setBodyPart(bp)}>
              {bp === "all" ? "All" : bp}
            </button>
          ))}
        </div>
      </div>

      <div className="exercise-grid">
        {exercises.map(ex => (
          <div key={ex.id} className="exercise-card">
            <div className="exercise-card-header">
              <div>
                <div className="exercise-name">{ex.name}</div>
                <div className="exercise-tags">
                  <span className="exercise-tag exercise-tag--bodypart">{ex.bodyPart}</span>
                  <span className="exercise-tag exercise-tag--equipment">{ex.equipment}</span>
                  <span className={`exercise-tag exercise-tag--difficulty`}>{ex.difficulty}</span>
                </div>
              </div>
            </div>
            <p className="exercise-instructions">{ex.instructions}</p>
            <div className="exercise-card-footer">
              <span className="pill pill-muted" style={{ fontSize: "0.72rem" }}>{ex.goal}</span>
            </div>
          </div>
        ))}
        {exercises.length === 0 && (
          <div className="empty-state" style={{ gridColumn: "1 / -1" }}>
            <div className="empty-state-icon">🏋️</div>
            <p>No exercises match your filters.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────
   CALENDAR VIEW
──────────────────────────────────────── */
type CalendarEvent = {
  id: string;
  date: string; // YYYY-MM-DD
  type: "check-in"|"renewal"|"billing"|"session"|"reminder";
  clientId?: string;
  clientName?: string;
  label: string;
  color: string;
};

function CalendarView({ session, onNav }: { session: CoachSession; onNav: (id: NavId) => void }) {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [monthOffset, setMonthOffset] = useState(0);

  const displayDate = useMemo(() => {
    const d = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    setViewDate(d);
    return d;
  }, [monthOffset]);

  const year = displayDate.getFullYear();
  const month = displayDate.getMonth();

  const events: CalendarEvent[] = useMemo(() => {
    const evs: CalendarEvent[] = [];
    // Renewal events
    session.subscriptions.forEach(sub => {
      if (sub.renewalDate && sub.status !== "cancelled") {
        const client = session.clients.find(c => c.id === sub.clientId);
        evs.push({
          id: sub.id,
          date: sub.renewalDate,
          type: "renewal",
          clientId: sub.clientId,
          clientName: client?.fullName,
          label: `Renewal: ${client?.fullName ?? "Client"}`,
          color: "var(--primary)",
        });
      }
    });
    // Billing events (same as renewal)
    session.subscriptions.forEach(sub => {
      if (sub.renewalDate && sub.status === "active") {
        const client = session.clients.find(c => c.id === sub.clientId);
        evs.push({
          id: `bill-${sub.id}`,
          date: sub.renewalDate,
          type: "billing",
          clientId: sub.clientId,
          clientName: client?.fullName,
          label: `Payment: £${sub.amountGbp}`,
          color: "var(--accent)",
        });
      }
    });
    // Check-in reminders (scheduled based on last check-in + 7 days)
    session.clients.forEach(client => {
      if (client.lastCheckInDate) {
        const last = new Date(client.lastCheckInDate);
        const next = new Date(last);
        next.setDate(next.getDate() + 7);
        // Only add if within this month
        if (next.getMonth() === month && next.getFullYear() === year) {
          evs.push({
            id: `checkin-reminder-${client.id}`,
            date: next.toISOString().split("T")[0],
            type: "check-in",
            clientId: client.id,
            clientName: client.fullName,
            label: `Check-in: ${client.fullName}`,
            color: "var(--tertiary)",
          });
        }
      }
    });
    return evs;
  }, [session, month, year]);

  const eventMap = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach(e => {
      const existing = map.get(e.date) ?? [];
      existing.push(e);
      map.set(e.date, existing);
    });
    return map;
  }, [events]);

  // Calendar grid
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const calendarDays: (number | null)[] = [
    ...Array(firstDay === 0 ? 6 : firstDay - 1).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ...Array(42 - (firstDay === 0 ? 6 : firstDay - 1) - daysInMonth).fill(null),
  ];

  const formatDate = (day: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const todayStr = today.toISOString().split("T")[0];

  const selectedEvents = selectedDate ? eventMap.get(selectedDate) ?? [] : [];
  const upcomingEvents = events
    .filter(e => e.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 8);

  const monthName = displayDate.toLocaleString("en-GB", { month: "long", year: "numeric" });
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const typeConfig = {
    "check-in": { icon: "monitor_heart", color: "var(--tertiary)", bg: "var(--tertiary-fixed)" },
    "renewal": { icon: "autorenew", color: "var(--primary)", bg: "var(--primary-light)" },
    "billing": { icon: "payments", color: "var(--accent)", bg: "var(--accent-light)" },
    "session": { icon: "event", color: "var(--secondary)", bg: "var(--secondary-fixed)" },
    "reminder": { icon: "notifications", color: "var(--warning)", bg: "var(--warning-light)" },
  };

  return (
    <div className="page-view">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "2rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: "0.72rem", fontWeight: 700, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 0.25rem" }}>Schedule</p>
          <h1 style={{ fontFamily: "Manrope, sans-serif", fontSize: "2.25rem", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.03em", margin: 0 }}>Calendar</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <button className="btn-ghost" onClick={() => setMonthOffset(o => o - 1)}>
            <span className="material-symbols-outlined" style={{ fontSize: "1.2rem" }}>chevron_left</span>
          </button>
          <span style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "1rem", color: "var(--text-primary)", minWidth: "160px", textAlign: "center" }}>{monthName}</span>
          <button className="btn-ghost" onClick={() => setMonthOffset(o => o + 1)}>
            <span className="material-symbols-outlined" style={{ fontSize: "1.2rem" }}>chevron_right</span>
          </button>
          {monthOffset !== 0 && (
            <button className="btn-ghost" onClick={() => setMonthOffset(0)} style={{ fontFamily: "Inter, sans-serif", fontSize: "0.75rem", fontWeight: 600, padding: "0.4rem 0.75rem" }}>Today</button>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "1.5rem", alignItems: "start" }}>
        {/* Calendar grid */}
        <div>
          <div className="card-glass" style={{ padding: "1rem" }}>
            {/* Day headers */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px", marginBottom: "4px" }}>
              {days.map(d => (
                <div key={d} style={{ textAlign: "center", fontFamily: "Inter, sans-serif", fontSize: "0.65rem", fontWeight: 700, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.05em", padding: "0.4rem 0" }}>{d}</div>
              ))}
            </div>
            {/* Day cells */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px" }}>
              {calendarDays.map((day, idx) => {
                if (!day) return <div key={`empty-${idx}`} />;
                const dateStr = formatDate(day);
                const dayEvents = eventMap.get(dateStr) ?? [];
                const isToday = dateStr === todayStr;
                const isSelected = dateStr === selectedDate;
                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                    style={{
                      border: "none",
                      background: isSelected ? "var(--primary-light)" : isToday ? "var(--surface-container)" : "transparent",
                      borderRadius: "var(--r-lg)",
                      padding: "0.5rem 0.25rem",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "2px",
                      minHeight: "60px",
                      transition: "background 0.15s",
                    }}
                  >
                    <span style={{
                      fontFamily: "Manrope, sans-serif",
                      fontWeight: 800,
                      fontSize: "0.9rem",
                      color: isToday ? "var(--primary)" : "var(--text-primary)",
                    }}>{day}</span>
                    {dayEvents.slice(0, 2).map(e => (
                      <div key={e.id} style={{
                        width: "100%",
                        padding: "1px 4px",
                        borderRadius: "9999px",
                        background: typeConfig[e.type]?.bg ?? "var(--surface-container)",
                        fontFamily: "Inter, sans-serif",
                        fontSize: "0.55rem",
                        fontWeight: 600,
                        color: typeConfig[e.type]?.color ?? "var(--on-surface)",
                        textAlign: "center",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}>{e.clientName ? e.clientName.split(" ")[0] : e.type}</div>
                    ))}
                    {dayEvents.length > 2 && (
                      <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.5rem", color: "var(--outline)" }}>+{dayEvents.length - 2}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Upcoming events strip */}
          <div style={{ marginTop: "1.5rem" }}>
            <h2 style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "1rem", color: "var(--text-primary)", marginBottom: "0.75rem" }}>Upcoming</h2>
            {upcomingEvents.length === 0 ? (
              <div className="empty-state" style={{ padding: "2rem" }}>
                <span className="material-symbols-outlined" style={{ fontSize: "2rem", color: "var(--outline)" }}>event_available</span>
                <p style={{ fontFamily: "Inter, sans-serif", color: "var(--outline)", fontSize: "0.85rem" }}>No upcoming events this month.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {upcomingEvents.map(e => {
                  const cfg = typeConfig[e.type];
                  const client = e.clientId ? session.clients.find(c => c.id === e.clientId) : null;
                  return (
                    <div key={e.id} className="card-glass" style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem", cursor: client ? "pointer" : "default" }} onClick={client ? () => { setSelectedDate(e.date); setMonthOffset(0); } : undefined}>
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: cfg?.bg, display: "grid", placeItems: "center", flexShrink: 0 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: "0.9rem", color: cfg?.color }}>{cfg?.icon}</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "0.82rem", color: "var(--text-primary)" }}>{e.label}</div>
                        <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.7rem", color: "var(--outline)" }}>{new Date(e.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</div>
                      </div>
                      {client && (
                        <button className="btn-ghost" style={{ fontFamily: "Inter, sans-serif", fontSize: "0.72rem", fontWeight: 600, padding: "0.3rem 0.6rem" }}
                          onClick={ev => { ev.stopPropagation(); onNav("clients"); }}>
                          View
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar: selected date detail */}
        <div>
          {selectedDate ? (
            <div className="card-glass" style={{ padding: "1.25rem", position: "sticky", top: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                <h3 style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "1rem", color: "var(--text-primary)", margin: 0 }}>
                  {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </h3>
                <button onClick={() => setSelectedDate(null)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--outline)", padding: "0.25rem" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>close</span>
                </button>
              </div>
              {selectedEvents.length === 0 ? (
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: "0.82rem", color: "var(--outline)" }}>No events on this day.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {selectedEvents.map(e => {
                    const cfg = typeConfig[e.type];
                    const client = e.clientId ? session.clients.find(c => c.id === e.clientId) : null;
                    return (
                      <div key={e.id} style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", padding: "0.75rem", borderRadius: "var(--r-lg)", background: cfg?.bg ?? "var(--surface-container)", borderLeft: `3px solid ${cfg?.color}` }}>
                        <span className="material-symbols-outlined" style={{ fontSize: "1rem", color: cfg?.color, flexShrink: 0 }}>{cfg?.icon}</span>
                        <div>
                          <div style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "0.82rem", color: "var(--text-primary)" }}>{e.label}</div>
                          {client && (
                            <button
                              onClick={() => onNav("clients")}
                              style={{ border: "none", background: "transparent", cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: "0.72rem", fontWeight: 600, color: cfg?.color, padding: "0.2rem 0", textDecoration: "underline" }}>
                              View client profile
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="card-glass" style={{ padding: "1.25rem", position: "sticky", top: "1rem" }}>
              <h3 style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)", marginBottom: "1rem" }}>This Month</h3>
              {[
                { type: "renewal" as const, label: "Renewals", icon: "autorenew", color: "var(--primary)", bg: "var(--primary-light)" },
                { type: "billing" as const, label: "Payments due", icon: "payments", color: "var(--accent)", bg: "var(--accent-light)" },
                { type: "check-in" as const, label: "Check-in reminders", icon: "monitor_heart", color: "var(--tertiary)", bg: "var(--tertiary-fixed)" },
              ].map(t => {
                const count = events.filter(e => e.type === t.type).length;
                return (
                  <div key={t.type} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.5rem 0", borderBottom: "1px solid var(--surface-container)" }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: t.bg, display: "grid", placeItems: "center" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: "0.85rem", color: t.color }}>{t.icon}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.8rem", fontWeight: 600, color: "var(--text-primary)" }}>{t.label}</div>
                    </div>
                    <span style={{ fontFamily: "Manrope, sans-serif", fontWeight: 800, fontSize: "1.1rem", color: count > 0 ? t.color : "var(--outline)" }}>{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────
   NUTRITION SWAP AGENT
──────────────────────────────────────── */
function NutritionSwapAgent({ planId, planNutrition }: { planId: string; planNutrition: string[] }) {
  const [foods, setFoods] = useState<Array<{ id: string; name: string; calories: number; proteinG: number; carbsG: number; fatG: number; portion: string; swapped: boolean }>>([]);
  const [activeSwap, setActiveSwap] = useState<number | null>(null);
  const [suggestion, setSuggestion] = useState<SwapSuggestion | null>(null);
  const [appliedCount, setAppliedCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [appliedSwaps, setAppliedSwaps] = useState<Set<string>>(new Set());
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<NutritionSwap[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Initialise food items from plan nutrition
  useEffect(() => {
    setFoods(planNutrition.map((n, i) => ({
      id: `food_${i}`,
      name: n.replace(/^[\d.,]+\s*(g|kcal|cals?|calories|protein|carbs|fat|kcal?)\s*/i, "").trim(),
      calories: 200 + Math.floor(Math.random() * 300),
      proteinG: 5 + Math.floor(Math.random() * 30),
      carbsG: 10 + Math.floor(Math.random() * 50),
      fatG: 3 + Math.floor(Math.random() * 20),
      portion: "per serving",
      swapped: false,
    })));
  }, [planNutrition]);

  const requestSwap = async (index: number) => {
    setActiveSwap(index);
    setLoading(true);
    setSuggestion(null);
    try {
      const food = foods[index];
      const result = await fetchJson<SwapSuggestion>("/nutrition/swap", {
        method: "POST",
        body: JSON.stringify({
          planId,
          originalFood: { name: food.name, calories: food.calories, proteinG: food.proteinG, carbsG: food.carbsG, fatG: food.fatG, portion: food.portion }
        })
      });
      setSuggestion(result);
    } catch {
      // Silent fail — agentic fallback
    } finally { setLoading(false); }
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const data = await fetchJson<NutritionSwap[]>(`/nutrition/swaps/${planId}`);
      setHistory(data);
      setShowHistory(true);
    } catch { /* ignore */ }
    setHistoryLoading(false);
  };

  const applySwap = async () => {
    if (!suggestion?.suggestion || activeSwap === null) return;
    try {
      await fetchJson("/nutrition/swap/apply", {
        method: "POST",
        body: JSON.stringify({
          planId,
          suggestion: suggestion.suggestion,
          originalFood: suggestion.original
        })
      });
      setFoods(prev => prev.map((f, i) => i === activeSwap ? { ...f, name: suggestion.suggestion!.name, calories: suggestion.suggestion!.calories, proteinG: suggestion.suggestion!.proteinG, carbsG: suggestion.suggestion!.carbsG, fatG: suggestion.suggestion!.fatG, swapped: true } : f));
      setAppliedSwaps(prev => new Set([...prev, foods[activeSwap].id]));
      setAppliedCount(c => c + 1);
    } catch { /* ignore */ }
    setSuggestion(null);
    setActiveSwap(null);
  };

  return (
    <div className="swap-agent">
      <div className="swap-agent-header">
        <span style={{ fontSize: "1.1rem" }}>🔄</span>
        <div>
          <h3 style={{ fontSize: "1rem", marginBottom: "0.1rem" }}>Nutrition Swap Agent</h3>
          <p className="text-sm muted" style={{ margin: 0 }}>Click any food to get AI macro-matched alternatives.</p>
        </div>
        <span className="swap-agent-badge">AI POWERED</span>
      </div>

      {foods.map((food, i) => (
        <div key={food.id}>
          <div className={`swap-food-item${food.swapped ? " swapped" : ""}${activeSwap === i ? " active" : ""}`} onClick={() => !food.swapped && requestSwap(i)}>
            <div>
              <div className="swap-food-name">{food.swapped ? "✓ " : ""}{food.name}</div>
              <div className="swap-food-macros">{food.calories} kcal · {food.proteinG}g P · {food.carbsG}g C · {food.fatG}g F</div>
            </div>
            {!food.swapped && <button className="swap-swap-btn" onClick={e => { e.stopPropagation(); requestSwap(i); }}>Swap</button>}
            {food.swapped && <span className="pill pill-success" style={{ fontSize: "0.72rem" }}>Swapped</span>}
          </div>

          {/* Swap result */}
          {activeSwap === i && (loading || suggestion) && (
            <div className="swap-result">
              {loading && <div style={{ display: "flex", justifyContent: "center", padding: "1rem" }}><div className="spinner" /></div>}
              {!loading && suggestion && suggestion.suggestion && (
                <>
                  <div className="swap-result-header">
                    <span className="swap-result-title">⚡ {suggestion.suggestion.name}</span>
                  </div>
                  <p className="swap-result-reason">"{suggestion.suggestion.reasoning}"</p>
                  <div className="swap-macro-compare">
                    {[
                      { label: "Calories", orig: suggestion.original.calories, swap: suggestion.suggestion.calories, unit: "" },
                      { label: "Protein", orig: suggestion.original.proteinG, swap: suggestion.suggestion.proteinG, unit: "g" },
                      { label: "Carbs", orig: suggestion.original.carbsG, swap: suggestion.suggestion.carbsG, unit: "g" },
                      { label: "Fat", orig: suggestion.original.fatG, swap: suggestion.suggestion.fatG, unit: "g" },
                    ].map(m => (
                      <div key={m.label} className="swap-macro-col">
                        <div className="swap-macro-label">{m.label}</div>
                        <div className="swap-macro-val" style={{ color: m.swap < m.orig ? "var(--primary)" : m.swap > m.orig ? "var(--warning)" : undefined }}>
                          {m.swap}{m.unit}
                        </div>
                        <div className="text-xs muted">{m.orig}{m.unit} orig</div>
                      </div>
                    ))}
                  </div>
                  <button className="swap-apply-btn" onClick={applySwap}>✓ Apply this swap</button>
                </>
              )}
              {!loading && suggestion && !suggestion.suggestion && (
                <p className="text-sm muted">No swap found for this item.</p>
              )}
            </div>
          )}
        </div>
      ))}

      <div className="swap-agent-footer">
        <span className="swap-applied-count">{appliedCount} swap{appliedCount !== 1 ? "s" : ""} applied</span>
        <div className="inline">
          <RecipePanel planNutrition={planNutrition} />
          <button className="swap-history-btn" onClick={loadHistory} disabled={historyLoading}>View history →</button>
        </div>
      </div>

      {showHistory && (
        <div className="swap-history-panel">
          <div className="swap-history-header">
            <h4>Swap History</h4>
            <button className="ghost sm" onClick={() => setShowHistory(false)}>✕</button>
          </div>
          {historyLoading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "1rem" }}><div className="spinner" /></div>
          ) : history.length === 0 ? (
            <p className="text-sm muted" style={{ padding: "0.75rem 0" }}>No swaps applied yet.</p>
          ) : (
            <div className="swap-history-list">
              {history.map(s => (
                <div key={s.id} className="swap-history-item">
                  <div className="swap-history-row">
                    <span className="swap-history-food swap-history-orig">{s.originalFood.name}</span>
                    <span className="swap-history-arrow">→</span>
                    <span className="swap-history-food swap-history-new">{s.swapSuggestion.name}</span>
                  </div>
                  <div className="swap-history-meta">
                    {s.originalFood.calories} kcal → {s.swapSuggestion.calories} kcal
                    {s.appliedAt && <span className="muted text-xs"> · {new Date(s.appliedAt).toLocaleDateString()}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────
   RECIPE PANEL
──────────────────────────────────────── */
function RecipePanel({ planNutrition }: { planNutrition: string[] }) {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedFood, setSelectedFood] = useState<string>("");
  const [showPanel, setShowPanel] = useState(false);

  const foodOptions = planNutrition.map((n, i) => ({
    id: `food_${i}`,
    name: n.replace(/^[\d.,]+\s*(g|kcal|cals?|calories|protein|carbs|fat|kcal?)\s*/i, "").trim().slice(0, 40)
  }));

  const generateRecipe = async (foodName: string) => {
    setLoading(true);
    try {
      const data = await fetchJson<Recipe>(`/recipes?food=${encodeURIComponent(foodName)}`);
      setRecipe(data);
      setShowPanel(true);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  return (
    <>
      <div className="inline" style={{ gap: "0.4rem" }}>
        <select
          value={selectedFood}
          onChange={e => setSelectedFood(e.target.value)}
          style={{ width: "auto", fontSize: "0.8rem", padding: "0.3rem 0.6rem" }}
        >
          <option value="">Pick a food…</option>
          {foodOptions.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
        </select>
        <button
          className="ghost sm"
          disabled={!selectedFood || loading}
          onClick={() => selectedFood && generateRecipe(selectedFood)}
        >
          {loading ? "…" : "🍳 Generate Recipe"}
        </button>
      </div>

      {showPanel && recipe && (
        <div className="recipe-panel">
          <div className="recipe-panel-header">
            <div>
              <div className="recipe-title">{recipe.name}</div>
              <div className="recipe-meta">
                <span className="recipe-meta-item">⏱ Prep {recipe.prepTime}min</span>
                <span className="recipe-meta-item">🔥 Cook {recipe.cookTime}min</span>
              </div>
            </div>
            <button className="icon" style={{ fontSize: "1rem" }} onClick={() => setShowPanel(false)}>✕</button>
          </div>
          <div className="recipe-macro-pills">
            {[
              { label: "Calories", value: recipe.calories, unit: "" },
              { label: "Protein", value: recipe.proteinG, unit: "g" },
              { label: "Carbs", value: recipe.carbsG, unit: "g" },
              { label: "Fat", value: recipe.fatG, unit: "g" },
            ].map(m => (
              <span key={m.label} className="pill pill-muted" style={{ fontSize: "0.78rem" }}>
                {m.label}: <strong>{m.value}{m.unit}</strong>
              </span>
            ))}
          </div>
          <div>
            <p className="eyebrow" style={{ marginBottom: "0.5rem" }}>Ingredients</p>
            <ul className="recipe-ingredient-list">
              {recipe.ingredients.map((ing, i) => <li key={i}>{ing}</li>)}
            </ul>
          </div>
          <div>
            <p className="eyebrow" style={{ marginBottom: "0.5rem" }}>Method</p>
            <ol className="recipe-step-list">
              {recipe.steps.map((step, i) => <li key={i}>{step}</li>)}
            </ol>
          </div>
        </div>
      )}
    </>
  );
}

/* ────────────────────────────────────────
   PDF INVOICE GENERATOR
──────────────────────────────────────── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const jspdf: { jsPDF: new (opts?: { orientation?: string; unit?: string; format?: string }) => Record<string, any> };

function generateInvoicePDF(subscription: PaymentSubscription, client: ClientProfile, workspace: CoachWorkspace) {
  const { jsPDF } = jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const brandColor = workspace.brandColor.replace("#", "");
  const r = parseInt(brandColor.slice(0, 2), 16);
  const g = parseInt(brandColor.slice(2, 4), 16);
  const b = parseInt(brandColor.slice(4, 6), 16);

  const vatRate = 0.20;
  const netAmount = subscription.amountGbp / (1 + vatRate);
  const vatAmount = subscription.amountGbp - netAmount;
  const invoiceNumber = `INV-${new Date().toISOString().slice(0, 7).replace("-", "")}-${client.id}`;
  const today = new Date().toLocaleDateString("en-GB");

  // Header band
  doc.setFillColor(r, g, b);
  doc.rect(0, 0, 210, 40, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.text("INVOICE", 20, 20);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(workspace.name, 20, 28);
  doc.setFontSize(8);
  doc.text("Tax Invoice · UK VAT Registered", 20, 34);

  // Invoice meta (right side)
  doc.setTextColor(r, g, b);
  doc.setFontSize(9);
  doc.text(`Invoice #: ${invoiceNumber}`, 130, 15);
  doc.text(`Date: ${today}`, 130, 21);
  doc.text(`Due: ${subscription.renewalDate}`, 130, 27);
  doc.text(`Status: ${subscription.status.toUpperCase()}`, 130, 33);

  // Bill To
  let y = 52;
  doc.setTextColor(60, 60, 60);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("BILL TO", 20, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(client.fullName, 20, y);
  y += 5;
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(client.email, 20, y);

  // Line items table header
  y += 12;
  doc.setFillColor(245, 245, 245);
  doc.rect(20, y, 170, 8, "F");
  doc.setTextColor(60, 60, 60);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("DESCRIPTION", 22, y + 5.5);
  doc.text("QTY", 120, y + 5.5);
  doc.text("NET", 140, y + 5.5);
  doc.text("VAT 20%", 160, y + 5.5);

  // Line item
  y += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(40, 40, 40);
  doc.text("Coaching Services — Monthly Subscription", 22, y);
  doc.text("1", 123, y);
  doc.text(`£${netAmount.toFixed(2)}`, 140, y);
  doc.text(`£${vatAmount.toFixed(2)}`, 160, y);

  // Divider
  y += 6;
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(20, y, 190, y);

  // Total
  y += 8;
  doc.setFillColor(r, g, b);
  doc.rect(130, y - 4, 60, 12, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("TOTAL (inc. VAT)", 133, y + 2);
  doc.setFontSize(12);
  doc.text(`£${subscription.amountGbp.toFixed(2)}`, 160, y + 3);

  // VAT summary
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(`Net amount: £${netAmount.toFixed(2)}    VAT rate: 20%    VAT: £${vatAmount.toFixed(2)}    Gross: £${subscription.amountGbp.toFixed(2)}`, 20, y);

  // Footer
  doc.setTextColor(150, 150, 150);
  doc.setFontSize(7);
  doc.text("This invoice is generated by CoachOS. VAT registered under UK law. Retain for your self-assessment records.", 20, 280);
  doc.text(`Subscription renews: ${subscription.renewalDate}`, 20, 285);

  doc.setDocumentProperties({ title: `Invoice ${invoiceNumber}`, author: workspace.name });
  doc.save(`${invoiceNumber}.pdf`);
}

function downloadBulkTaxReport(subscriptions: PaymentSubscription[], clients: ClientProfile[], workspace: CoachWorkspace) {
  const { jsPDF } = jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const brandColor = workspace.brandColor.replace("#", "");
  const r = parseInt(brandColor.slice(0, 2), 16);
  const g = parseInt(brandColor.slice(2, 4), 16);
  const b = parseInt(brandColor.slice(4, 6), 16);
  const vatRate = 0.20;

  doc.setFillColor(r, g, b);
  doc.rect(0, 0, 210, 20, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text(`${workspace.name} — HMRC Tax Report`, 20, 13);

  const today = new Date().toISOString().slice(0, 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(r, g, b);
  doc.text(`Generated: ${today}`, 20, 27);

  // Table header
  let y = 34;
  doc.setFillColor(245, 245, 245);
  doc.rect(20, y, 170, 7, "F");
  doc.setTextColor(60, 60, 60);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("CLIENT", 22, y + 5);
  doc.text("STATUS", 80, y + 5);
  doc.text("NET", 110, y + 5);
  doc.text("VAT", 130, y + 5);
  doc.text("GROSS", 155, y + 5);

  y += 9;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  let totalNet = 0, totalVat = 0, totalGross = 0;

  for (const sub of subscriptions) {
    const client = clients.find(c => c.id === sub.clientId);
    const net = sub.amountGbp / (1 + vatRate);
    const vat = sub.amountGbp - net;
    totalNet += net; totalVat += vat; totalGross += sub.amountGbp;

    doc.setTextColor(40, 40, 40);
    doc.text(client?.fullName ?? sub.clientId, 22, y);
    doc.setTextColor(sub.status === "active" ? 58 : 255, sub.status === "active" ? 180 : 115, sub.status === "active" ? 80 : 81);
    doc.text(sub.status.toUpperCase(), 80, y);
    doc.setTextColor(40, 40, 40);
    doc.text(`£${net.toFixed(2)}`, 110, y);
    doc.text(`£${vat.toFixed(2)}`, 130, y);
    doc.text(`£${sub.amountGbp.toFixed(2)}`, 155, y);

    y += 7;
    if (y > 270) { doc.addPage(); y = 20; }
  }

  // Totals
  y += 3;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(20, y, 190, y);
  y += 7;
  doc.setFillColor(r, g, b);
  doc.rect(105, y - 5, 85, 10, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("TOTALS", 108, y + 1);
  doc.text(`£${totalNet.toFixed(2)}`, 110, y + 1);
  doc.text(`£${totalVat.toFixed(2)}`, 130, y + 1);
  doc.text(`£${totalGross.toFixed(2)}`, 155, y + 1);

  doc.setDocumentProperties({ title: `Tax Report ${today}`, author: workspace.name });
  doc.save(`tax-report-${today}.pdf`);
}

/* ────────────────────────────────────────
   CLIENT APP PREVIEW
──────────────────────────────────────── */
type ClientAppTab = "today"|"plan"|"checkin"|"messages";

function ClientAppPreviewInner({ clientPortal }: { clientPortal: ClientSession }) {
  const [activeTab, setActiveTab] = useState<ClientAppTab>("today");
  const today = new Date();
  const firstName = clientPortal.client.fullName.split(" ")[0];
  const hour = today.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const todayIndex = (today.getDay() + 6) % 7;
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const plan = clientPortal.plan;
  const workouts = plan?.latestVersion.workouts ?? [];
  const nutrition = plan?.latestVersion.nutrition ?? [];
  const habits = [
    { title: "Log meals in the app", done: Math.random() > 0.5 },
    { title: "Hit 8,000 steps", done: Math.random() > 0.4 },
    { title: "Complete weekly check-in", done: false },
  ];
  const messages = clientPortal.messages ?? [];

  // Check-in form state
  const [checkInWeight, setCheckInWeight] = useState<string>(clientPortal.latestCheckIn?.progress.weightKg?.toString() ?? "");
  const [checkInEnergy, setCheckInEnergy] = useState<number>(clientPortal.latestCheckIn?.progress.energyScore ?? 7);
  const [checkInSteps, setCheckInSteps] = useState<string>(clientPortal.latestCheckIn?.progress.steps?.toString() ?? "");
  const [checkInNotes, setCheckInNotes] = useState("");
  const [checkInPhoto, setCheckInPhoto] = useState<string | null>(null);
  const [checkInSubmitting, setCheckInSubmitting] = useState(false);
  const [checkInSuccess, setCheckInSuccess] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setCheckInPhoto(ev.target?.result as string ?? null);
    reader.readAsDataURL(file);
  };

  const handleCheckInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkInWeight && !checkInSteps) return;
    setCheckInSubmitting(true);
    try {
      await fetchJson("/check-ins", {
        method: "POST",
        body: JSON.stringify({
          clientId: clientPortal.client.id,
          progress: {
            weightKg: parseFloat(checkInWeight) || 0,
            energyScore: checkInEnergy,
            steps: parseInt(checkInSteps) || 0,
            notes: checkInNotes,
          },
        })
      });
      setCheckInSuccess(true);
      setTimeout(() => setCheckInSuccess(false), 3000);
    } catch { /* silent */ }
    setCheckInSubmitting(false);
  };

  return (
    <div className="client-app">
      <div className="client-app-status-bar">
        <span className="client-app-status-bar-left">9:41</span>
        <span className="client-app-status-bar-right"><span>●●●●●</span><span>📶</span><span>🔋</span></span>
      </div>

      {activeTab === "today" && (
        <div className="client-app-header">
          <div className="client-app-greeting">{greeting}, {firstName}!</div>
          <div className="client-app-date">{today.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</div>
          <div className="client-app-streak-row">
            <span className="client-app-streak-badge">🔥 5 day streak</span>
            <span className="client-app-streak-badge" style={{ background: "rgba(96,165,250,0.12)", borderColor: "rgba(96,165,250,0.25)", color: "#60a5fa" }}>📋 {workouts.length} sessions this week</span>
          </div>
          <div className="client-app-stats-row" style={{ marginTop: 14 }}>
            <div className="client-app-stat-chip">
              <span className="client-app-stat-chip-label">Adherence</span>
              <span className="client-app-stat-chip-value" style={{ color: clientPortal.client.adherenceScore >= 70 ? "#3ae97a" : "#fbbf24" }}>{clientPortal.client.adherenceScore}%</span>
            </div>
            <div className="client-app-stat-chip">
              <span className="client-app-stat-chip-label">Energy</span>
              <span className="client-app-stat-chip-value">{clientPortal.latestCheckIn?.progress.energyScore ?? "—"}/10</span>
            </div>
            <div className="client-app-stat-chip">
              <span className="client-app-stat-chip-label">Renewal</span>
              <span className="client-app-stat-chip-value" style={{ fontSize: 13 }}>{clientPortal.client.nextRenewalDate.slice(5)}</span>
            </div>
          </div>
        </div>
      )}

      {activeTab === "today" && (
        <div className="client-app-section">
          {plan ? (
            <>
              <div className="client-app-section-title">Today's Focus</div>
              <div className="client-app-card">
                <div className="client-app-card-label">💪 Workout</div>
                <div className="client-app-card-title">{workouts[todayIndex] || workouts[0]}</div>
                <div className="client-app-card-chip">Approved</div>
              </div>
              <div className="client-app-card">
                <div className="client-app-card-label">🥗 Nutrition</div>
                <div className="client-app-card-title">{nutrition[todayIndex]?.split(":")[0] || "Moderate deficit"}</div>
                <div className="client-app-card-body">{nutrition[todayIndex] || nutrition[0]}</div>
              </div>
            </>
          ) : (
            <div className="client-app-card">
              <div className="client-app-card-title" style={{ color: "rgba(255,255,255,0.5)" }}>No plan yet</div>
              <div className="client-app-card-body">Your coach is preparing your programme. Check back soon!</div>
            </div>
          )}
          <div className="client-app-section-title" style={{ marginTop: 16 }}>Today's Habits</div>
          <div className="client-app-card">
            {habits.map((h, i) => (
              <div key={i} className="client-app-habit-item">
                <div className={`client-app-habit-check${h.done ? " checked" : ""}`}>{h.done ? "✓" : ""}</div>
                <span className={`client-app-habit-title${h.done ? " done" : ""}`}>{h.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "plan" && (
        <div className="client-app-section" style={{ paddingBottom: 80 }}>
          <div className="client-app-section-title" style={{ marginTop: 8 }}>This Week's Programme</div>
          {plan ? DAYS.map((day, i) => {
            const workout = workouts[i] || workouts[i % workouts.length];
            const isToday = i === todayIndex;
            return (
              <div key={day} className="client-app-day-card">
                <div className="client-app-day-card-header">
                  <span className={`client-app-day-label${isToday ? " today" : ""}`}>{isToday ? "● " : ""}{day}{isToday ? " — Today" : ""}</span>
                  <div className="client-app-day-chips">
                    {workout && <span className="client-app-day-chip client-app-day-chip--workout">💪</span>}
                    {nutrition[i] && <span className="client-app-day-chip client-app-day-chip--nutrition">🥗</span>}
                  </div>
                </div>
                <div className="client-app-day-detail">{workout}</div>
              </div>
            );
          }) : (
            <div className="client-app-card"><div className="client-app-card-body">No programme assigned yet.</div></div>
          )}
        </div>
      )}

      {activeTab === "checkin" && (
        <div className="client-app-checkin-form">
          <div className="client-app-section-title" style={{ marginTop: 8 }}>Submit Check-In</div>
          {checkInSuccess && (
            <div className="client-app-success-banner">✓ Check-in submitted!</div>
          )}
          <form onSubmit={handleCheckInSubmit}>
            <label className="client-app-form-label">Weight (kg)</label>
            <input className="client-app-input" type="number" placeholder="e.g. 73.4" value={checkInWeight} onChange={e => setCheckInWeight(e.target.value)} />
            <label className="client-app-form-label">Energy Level <span style={{ color: "var(--primary)", fontWeight: 700 }}>{checkInEnergy}/10</span></label>
            <input className="client-app-energy-slider" type="range" min="1" max="10" value={checkInEnergy} onChange={e => setCheckInEnergy(parseInt(e.target.value))} />
            <div className="client-app-energy-labels"><span>Exhausted</span><span>Energised</span></div>
            <label className="client-app-form-label">Steps Today</label>
            <input className="client-app-input" type="number" placeholder="e.g. 9845" value={checkInSteps} onChange={e => setCheckInSteps(e.target.value)} />
            <label className="client-app-form-label">Notes</label>
            <textarea className="client-app-input" placeholder="How are you feeling? Any highlights or challenges?" rows={3} style={{ resize: "none" }} value={checkInNotes} onChange={e => setCheckInNotes(e.target.value)} />
            <label className="client-app-form-label">Progress Photo</label>
            <input ref={photoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhotoChange} />
            <button type="button" className="client-app-photo-btn" onClick={() => photoInputRef.current?.click()}>
              <span>{checkInPhoto ? "✓" : "📷"}</span> {checkInPhoto ? "Photo selected" : "Add Progress Photo"}
            </button>
            {checkInPhoto && <img src={checkInPhoto} alt="Preview" style={{ width: "100%", borderRadius: "var(--r-lg)", marginTop: "0.5rem" }} />}
            <button type="submit" className="client-app-submit-btn" disabled={checkInSubmitting}>
              {checkInSubmitting ? "Submitting…" : "Submit Check-In"}
            </button>
          </form>
        </div>
      )}

      {activeTab === "messages" && (
        <>
          <div className="client-app-messages">
            {messages.length === 0 ? (
              <div className="client-app-card" style={{ alignSelf: "center", marginTop: 40 }}>
                <div className="client-app-card-body" style={{ textAlign: "center" }}>No messages yet. Say hello!</div>
              </div>
            ) : messages.map(msg => (
              <div key={msg.id}>
                <div className={`client-app-msg client-app-msg--${msg.sender}`}>{msg.content}</div>
                <div className={`client-app-msg-time client-app-msg-time--${msg.sender}`}>
                  {new Date(msg.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            ))}
          </div>
          <div className="client-app-message-input-row">
            <input className="client-app-message-input" placeholder="Type a message…" />
          </div>
        </>
      )}

      <div className="client-app-tabs">
        {([
          { id: "today" as ClientAppTab, icon: "🏠", label: "Today" },
          { id: "plan" as ClientAppTab, icon: "📋", label: "Plan" },
          { id: "checkin" as ClientAppTab, icon: "✅", label: "Check-In" },
          { id: "messages" as ClientAppTab, icon: "💬", label: "Messages" },
        ] as const).map(t => (
          <button key={t.id} className={`client-app-tab${activeTab === t.id ? " active" : ""}`} onClick={() => setActiveTab(t.id)}>
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ClientAppView({ session, clientPortal, onSwitchClient }: {
  session: CoachSession;
  clientPortal: ClientSession | null;
  onSwitchClient: (id: string) => void;
}) {
  const sorted = useMemo(() => [...session.clients].sort((a, b) => a.fullName.localeCompare(b.fullName)), [session.clients]);

  return (
    <div className="page-view">
      <p className="eyebrow">CoachOS Preview</p>
      <h1 className="page-title">Client App Preview</h1>
      <p className="page-subtitle">See exactly what your clients see — live mobile simulator.</p>

      <div className="client-app-split">
        <div className="coach-preview-panel">
          <h3>Preview as Client</h3>
          <div className="stack compact">
            <label>
              <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--on-surface)", marginBottom: "0.3rem", display: "block" }}>Select client</span>
              <select value={clientPortal?.client.id ?? ""} onChange={e => onSwitchClient(e.target.value)}>
                {sorted.map(c => <option key={c.id} value={c.id}>{c.fullName}</option>)}
              </select>
            </label>
            {clientPortal && (
              <div className="stack compact">
                <div className="row-line"><span className="text-sm muted">Adherence</span>
                  <span style={{ color: clientPortal.client.adherenceScore >= 70 ? "var(--primary)" : "var(--warning)", fontWeight: 700 }}>{clientPortal.client.adherenceScore}%</span>
                </div>
                <div className="row-line"><span className="text-sm muted">Status</span><StatusPill status={clientPortal.client.status} /></div>
                <div className="row-line"><span className="text-sm muted">Plan</span><span className="text-sm">{clientPortal.plan?.title ?? "None"}</span></div>
                <div className="row-line"><span className="text-sm muted">Messages</span><span className="text-sm">{clientPortal.messages?.length ?? 0}</span></div>
              </div>
            )}
          </div>
        </div>

        <div>
          {clientPortal ? (
            <>
              <div className="phone-frame">
                <div className="phone-notch" />
                <div className="phone-status-bar">
                  <span className="phone-status-bar-left">9:41</span>
                  <span className="phone-status-bar-right"><span>●●●●●</span><span>📶</span><span>🔋</span></span>
                </div>
                <div className="phone-viewport">
                  <ClientAppPreviewInner clientPortal={clientPortal} />
                </div>
                <div className="phone-home-bar" />
              </div>
              <p className="phone-preview-label">CoachOS Client App — {clientPortal.client.fullName}</p>
            </>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">📱</div>
              <p>Select a client to preview their experience.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [session, setSession] = useState<CoachSession | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [clientPortal, setClientPortal] = useState<ClientSession | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [proofCard, setProofCard] = useState<ProofCard | null>(null);
  const [checkInHistory, setCheckInHistory] = useState<CheckInWithDelta[]>([]);
  const [activeNav, setActiveNav] = useState<NavId>("dashboard");
  const [showAddClientModal, setShowAddClientModal] = useState(false);
  const { toasts, push, dismiss } = useToast();

  // Check if onboarding was already completed
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try { return localStorage.getItem("coachos_onboarded") !== "true"; }
    catch { return true; }
  });

  const switchClient = useCallback(async (clientId: string) => {
    setSelectedClientId(clientId);
    try {
      const [portal, checkIns] = await Promise.all([
        fetchJson<ClientSession>(`/session/client/${clientId}`),
        fetchJson<CheckIn[]>(`/check-ins?clientId=${clientId}`),
      ]);
      setClientPortal(portal);
      setProofCard(portal.proofCard);

      // Compute deltas relative to previous check-in
      const sorted = [...checkIns].sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());
      const withDeltas: CheckInWithDelta[] = sorted.map((c, i) => {
        const prev = sorted[i - 1];
        return {
          ...c,
          weightDelta: prev ? (c.progress.weightKg != null && prev.progress.weightKg != null ? +(c.progress.weightKg - prev.progress.weightKg).toFixed(1) : null) : null,
          energyDelta: prev ? c.progress.energyScore - prev.progress.energyScore : null,
          adherenceDelta: null,
        };
      });
      setCheckInHistory(withDeltas);
    } catch { push("Failed to load client portal", "error"); }
  }, [push]);

  const loadCoach = useCallback(async (preferredClientId?: string) => {
    const [coachSession, runtimeData] = await Promise.all([
      fetchJson<CoachSession>("/session/coach"),
      fetchJson("/runtime"),
    ]);
    setSession(coachSession);

    const nextId = preferredClientId && coachSession.clients.some(c => c.id === preferredClientId)
      ? preferredClientId
      : selectedClientId && coachSession.clients.some(c => c.id === selectedClientId)
        ? selectedClientId
        : coachSession.clients[0]?.id ?? null;

    if (nextId) await switchClient(nextId);
  }, [selectedClientId, switchClient]);

  useEffect(() => {
    loadCoach().catch(err => setLoadError(err instanceof Error ? err.message : "Connection failed — is the API running?"));
  }, []);

  const handleNavWithPortal = (id: NavId) => {
    setActiveNav(id);
    if (id === "portal" && session && !selectedClientId && session.clients[0]) {
      switchClient(session.clients[0].id);
    }
  };

  const handleGenerate = async (clientId: string) => {
    await fetchJson(`/plans/generate`, { method: "POST", body: JSON.stringify({ clientId }) });
    await loadCoach(clientId);
    push("Plan generated with DeepSeek-V3.1");
  };

  const handleApprove = async (planId: string) => {
    await fetchJson(`/plans/${planId}/approve`, { method: "POST" });
    await loadCoach(selectedClientId ?? undefined);
    push("Plan approved ✓");
  };

  const handleCheckIn = async (clientId: string) => {
    await fetchJson(`/check-ins`, { method: "POST", body: JSON.stringify({
      id: `checkin_${Date.now()}`, clientId, submittedAt: new Date().toISOString(),
      progress: { weightKg: 71.8, energyScore: 8, steps: 9860, waistCm: 76, notes: "Check-in submitted via portal." },
      photoCount: 1
    })});
    await loadCoach(clientId);
    push("Check-in recorded");
  };

  const handleSaveEdits = async (draft: ClientProfilePatch) => {
    if (!clientPortal) return;
    await fetchJson(`/clients/${clientPortal.client.id}`, { method: "PATCH", body: JSON.stringify(draft) });
    await loadCoach(clientPortal.client.id);
    push("Client updated");
  };

  const handleSendMessage = async (content: string) => {
    if (!clientPortal) return;
    await fetchJson(`/messages`, { method: "POST", body: JSON.stringify({ clientId: clientPortal.client.id, content, sender: "coach" }) });
    await switchClient(clientPortal.client.id);
  };

  const handleRefreshProof = async (clientId: string) => {
    const result = await fetchJson<ProofCard>(`/proof-cards/${clientId}`);
    setProofCard(result);
    if (clientPortal) setClientPortal(p => p ? { ...p, proofCard: result } : p);
    push("Proof card refreshed");
  };

  const handleToggleBilling = async (clientId: string, status: "active"|"past_due"|"cancelled") => {
    await fetchJson(`/billing/webhooks/stripe`, { method: "POST", body: JSON.stringify({ clientId, status }) });
    await loadCoach(selectedClientId ?? undefined);
    push(`Billing updated to ${status}`);
  };

  const handleSaveSettings = async (draft: any) => {
    await fetchJson<CoachWorkspace>("/onboarding", { method: "POST", body: JSON.stringify(draft) });
    await loadCoach(selectedClientId ?? undefined);
    push("Settings saved");
  };

  const handleAddClientSuccess = async () => {
    setShowAddClientModal(false);
    await loadCoach(selectedClientId ?? undefined);
  };

  const handleCreateGroupProgram = async (payload: Partial<GroupProgram>) => {
    await fetchJson<GroupProgram>("/group-programs", { method: "POST", body: JSON.stringify(payload) });
  };

  const handleUpdateGroupProgram = async (programId: string, patch: Partial<GroupProgram>) => {
    await fetchJson(`/group-programs/${programId}`, { method: "PATCH", body: JSON.stringify(patch) });
  };

  const handleArchiveGroupProgram = async (programId: string) => {
    await fetchJson(`/group-programs/${programId}`, { method: "DELETE" });
  };

  // Loading & error states
  if (!session) {
    if (loadError) {
      return (
        <div className="loading">
          <div className="loading-inner">
            <div className="loading-logo">C</div>
            <p style={{ color: "var(--danger)", fontWeight: 600 }}>⚠ Cannot connect to CoachOS API</p>
            <p className="muted text-sm" style={{ maxWidth: 380, textAlign: "center" }}>{loadError}</p>
            <p className="muted text-xs">Run: <code>npm run dev:api</code></p>
            <button onClick={() => { setLoadError(null); loadCoach().catch(e => setLoadError(e.message)); }}>Retry</button>
          </div>
        </div>
      );
    }
    return (
      <div className="loading">
        <div className="loading-inner">
          <div className="loading-logo">C</div>
          <div className="spinner" />
          <p className="muted">Loading CoachOS…</p>
        </div>
      </div>
    );
  }

  const atRiskCount = session.dashboard.atRiskClients.length;

  return (
    <div className="app-shell">
      <Sidebar active={activeNav} onNav={handleNavWithPortal} session={session} atRiskCount={atRiskCount} />

      <div className="page-content">
        {activeNav === "dashboard" && (
          <DashboardView
            session={session}
            onNav={handleNavWithPortal}
            onSimulateCheckIn={async id => { await handleCheckIn(id); push("Check-in recovery simulated"); }}
            onMarkPayment={async id => { await handleToggleBilling(id, "active"); }}
            push={push}
          />
        )}
        {activeNav === "clients" && (
          <ClientsView session={session} onOpenClient={id => { setActiveNav("portal"); switchClient(id); }} onAddClient={() => setShowAddClientModal(true)} />
        )}
        {activeNav === "plans" && (
          <PlansView session={session} onNav={handleNavWithPortal} />
        )}
        {activeNav === "portal" && (
          <PortalView
            session={session}
            clientPortal={clientPortal}
            selectedClientId={selectedClientId}
            onSwitchClient={switchClient}
            onCheckIn={handleCheckIn}
            onSaveEdits={handleSaveEdits}
            onSendMessage={handleSendMessage}
            onRefreshProof={handleRefreshProof}
            onApprove={handleApprove}
            checkInHistory={checkInHistory}
            onNav={setActiveNav}
            push={push}
          />
        )}
        {activeNav === "billing" && (
          <BillingView session={session} onToggleBilling={handleToggleBilling} />
        )}
        {activeNav === "migration" && (
          <MigrationView onReload={() => loadCoach(selectedClientId ?? undefined)} />
        )}
        {activeNav === "competitors" && (
          <CompetitorsView />
        )}
        {activeNav === "groups" && (
          <GroupsView
            session={session}
            onCreate={handleCreateGroupProgram}
            onUpdate={handleUpdateGroupProgram}
            onArchive={handleArchiveGroupProgram}
          />
        )}
        {activeNav === "habits" && (
          <HabitsView session={session} />
        )}
        {activeNav === "exercises" && (
          <ExercisesView />
        )}
        {activeNav === "calendar" && (
          <CalendarView session={session} onNav={setActiveNav} />
        )}
        {activeNav === "settings" && (
          <SettingsView session={session} onSave={handleSaveSettings} />
        )}
      </div>

      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {showAddClientModal && (
        <AddClientModal
          onClose={() => setShowAddClientModal(false)}
          onSuccess={handleAddClientSuccess}
          push={push}
        />
      )}

      {showOnboarding && (
        <OnboardingWizard
          onComplete={() => {
            setShowOnboarding(false);
            try { localStorage.setItem("coachos_onboarded", "true"); } catch { /* ignore */ }
            push("Welcome to CoachOS!", "success");
          }}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
