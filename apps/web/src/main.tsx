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
type AnalyticsResponse = { events: Array<{ name: string; actorId: string; occurredAt: string; metadata: Record<string, string|number|boolean> }>; summary: { totalEvents: number; topEvents: Array<{ name: string; count: number }>; lastEventAt: string | null } };
type RuntimeResponse = { storage: string; stateFilePath: string | null; services: { planGeneration: string; proofCards: string; billing: string } };
type Toast = { id: number; message: string; type: "success"|"error"|"info" };
type NavId = "dashboard"|"clients"|"plans"|"portal"|"billing"|"analytics"|"settings"|"migration"|"competitors"|"groups"|"habits"|"exercises"|"clientApp";
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
function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);
  const push = useCallback((message: string, type: Toast["type"] = "success") => {
    const id = ++counter.current;
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);
  return { toasts, push };
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

function ToastContainer({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast--${t.type}`}>
          <span>{t.type === "success" ? "✓" : t.type === "error" ? "✗" : "ℹ"}</span>
          <span>{t.message}</span>
        </div>
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
        {nav("dashboard", "◎", "Morning Dashboard", atRiskCount || undefined)}
        {nav("analytics", "↗", "Analytics")}

        <span className="nav-section-label">Clients</span>
        {nav("clients", "⊞", "All Clients")}
        {nav("portal", "⊡", "Client Portal")}
        {nav("plans", "✦", "AI Plans")}
        {nav("habits", "◉", "Habits")}
        {nav("exercises", "⬢", "Exercise Library")}
        {nav("groups", "⬡", "Group Programs")}

        <span className="nav-section-label">Preview</span>
        {nav("clientApp", "◈", "Client App")}

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
function DashboardView({ session, onNav, onSimulateCheckIn, onMarkPayment }: {
  session: CoachSession;
  onNav: (id: NavId) => void;
  onSimulateCheckIn: (clientId: string) => Promise<void>;
  onMarkPayment: (clientId: string) => Promise<void>;
}) {
  const { dashboard, workspace, clients } = session;
  const mrrGbp = session.subscriptions
    .filter(s => s.status === "active")
    .reduce((sum, s) => sum + s.amountGbp, 0);

  return (
    <div className="page-view">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <p className="eyebrow">Morning Dashboard</p>
          <h1>Good morning, {session.coach.firstName}. 👋</h1>
          <p className="hero-copy" style={{ marginTop: "0.5rem" }}>{workspace.heroMessage}</p>
        </div>
        <div style={{ textAlign: "right" }}>
          {workspace.stripeConnected
            ? <span className="pill pill-success">● Stripe Connected</span>
            : <span className="pill pill-danger">● Stripe Disconnected</span>}
          {workspace.parallelRunDaysLeft > 0 && (
            <div style={{ marginTop: "0.75rem" }}>
              <span className="pill pill-info">Parallel run: {workspace.parallelRunDaysLeft}d left</span>
            </div>
          )}
        </div>
      </div>

      {/* Key metrics */}
      <div className="stat-grid">
        <div className="stat-card stat-card--accent">
          <div className="stat-card__label">Active Clients</div>
          <div className="stat-card__value">{dashboard.activeClients}</div>
        </div>
        <div className="stat-card stat-card--accent">
          <div className="stat-card__label">Monthly Revenue</div>
          <div className="stat-card__value">£{mrrGbp}</div>
        </div>
        <div className="stat-card stat-card--warning">
          <div className="stat-card__label">At-Risk Flags</div>
          <div className="stat-card__value" style={{ color: "var(--warning)" }}>{dashboard.atRiskClients.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Checked In Today</div>
          <div className="stat-card__value">{dashboard.checkedInToday}</div>
        </div>
        <div className="stat-card stat-card--danger">
          <div className="stat-card__label">Renewals Due</div>
          <div className="stat-card__value" style={{ color: "var(--danger)" }}>{dashboard.dueRenewals}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Total Clients</div>
          <div className="stat-card__value">{clients.length}</div>
        </div>
      </div>

      {/* At-risk clients */}
      {dashboard.atRiskClients.length > 0 ? (
        <div className="panel">
          <div className="section-header">
            <div>
              <p className="eyebrow" style={{ marginBottom: "0.25rem" }}>Action Required</p>
              <h2>At-Risk Clients</h2>
            </div>
          </div>
          <div className="stack compact">
            {dashboard.atRiskClients.map(alert => {
              const client = clients.find(c => c.id === alert.clientId);
              return (
                <div key={alert.clientId} className="alert-card">
                  <div className="inline inline-spread" style={{ marginBottom: "0.5rem" }}>
                    <div className="inline">
                      {client && <Avatar name={client.fullName} />}
                      <div>
                        <strong style={{ color: "var(--on-surface)" }}>{client?.fullName}</strong>
                        <p className="muted text-sm" style={{ margin: 0 }}>{client?.goal}</p>
                      </div>
                    </div>
                    <span className={`pill pill-${alert.severity === "high" ? "danger" : "warning"}`}>
                      {alert.severity} risk
                    </span>
                  </div>
                  <p className="text-sm" style={{ color: "var(--on-surface-variant)", marginBottom: "0.75rem" }}>
                    {alert.reasons.join(" · ")}
                  </p>
                  <p className="text-sm muted" style={{ marginBottom: "0.75rem" }}>{alert.recommendedAction}</p>
                  {client && (
                    <div className="inline">
                      <button className="secondary sm" onClick={() => onSimulateCheckIn(client.id)}>↩ Log recovery check-in</button>
                      <button className="secondary sm" onClick={() => onMarkPayment(client.id)}>£ Mark payment recovered</button>
                      <button className="ghost sm" onClick={() => onNav("portal")}>Open portal →</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="panel">
          <div className="empty-state">
            <div className="empty-state-icon">🎉</div>
            <p style={{ color: "var(--on-surface)", fontWeight: 600 }}>No at-risk clients today!</p>
            <p className="muted text-sm">All clients are on track. Check back tomorrow.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── CLIENTS VIEW ──────────────────────
function ClientsView({ session, onOpenClient }: { session: CoachSession; onOpenClient: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ClientProfile[]>(session.clients);

  const runSearch = async (e?: FormEvent) => {
    e?.preventDefault();
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (search.trim()) q.set("search", search.trim());
      if (filterStatus !== "all") q.set("status", filterStatus);
      const suffix = q.toString() ? `?${q}` : "";
      setResults(await fetchJson<ClientProfile[]>(`/clients${suffix}`));
    } finally { setLoading(false); }
  };

  useEffect(() => { setResults(session.clients); }, [session.clients]);

  return (
    <div className="page-view">
      <p className="eyebrow">All Clients</p>
      <h1 className="page-title">Client Roster</h1>
      <p className="page-subtitle">Search, filter and manage all your coaching clients.</p>

      <div className="panel">
        <form className="stack" onSubmit={runSearch}>
          <div className="two-col">
            <label>
              Search
              <div className="search-wrapper">
                <span className="search-icon">⌕</span>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, email or goal…" />
              </div>
            </label>
            <label>
              Status
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="at_risk">At risk</option>
                <option value="trial">Trial</option>
              </select>
            </label>
          </div>
          <div className="inline">
            <button type="submit" disabled={loading}>{loading ? "Searching…" : "Search"}</button>
            <button type="button" className="secondary" onClick={() => { setSearch(""); setFilterStatus("all"); setResults(session.clients); }}>Clear</button>
          </div>
        </form>
      </div>

      <div className="stack compact">
        {results.length === 0 && <div className="empty-state"><div className="empty-state-icon">🔍</div><p>No clients found.</p></div>}
        {results.map(client => (
          <div key={client.id} className="client-card">
            <div className="inline inline-spread">
              <div className="inline">
                <Avatar name={client.fullName} />
                <div>
                  <strong style={{ color: "var(--on-surface)" }}>{client.fullName}</strong>
                  <p className="muted text-sm" style={{ margin: "0.15rem 0 0" }}>{client.goal}</p>
                </div>
              </div>
              <div className="inline">
                <StatusPill status={client.status} />
                <span className="muted text-sm">£{client.monthlyPriceGbp}/mo</span>
                <button className="secondary sm" onClick={() => onOpenClient(client.id)}>Open →</button>
              </div>
            </div>
            <div style={{ marginTop: "1rem" }}>
              <AdherenceBar score={client.adherenceScore} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── PLANS VIEW ──────────────────────
function PlansView({ session, onGenerate, onApprove }: {
  session: CoachSession;
  onGenerate: (clientId: string) => Promise<void>;
  onApprove: (planId: string) => Promise<void>;
}) {
  const [generating, setGenerating] = useState<string | null>(null);

  const sorted = useMemo(() =>
    [...session.clients].sort((a, b) => a.fullName.localeCompare(b.fullName)), [session.clients]);

  const handleGenerate = async (clientId: string) => {
    setGenerating(clientId);
    try { await onGenerate(clientId); } finally { setGenerating(null); }
  };

  return (
    <div className="page-view">
      <p className="eyebrow">AI Coaching Engine</p>
      <h1 className="page-title">Adaptive Plans & Schedule</h1>
      <p className="page-subtitle">AI drafts dynamic weekly calendars. You retain final approval before publishing to client apps.</p>

      <div className="stack">
        {sorted.map(client => {
          const plan = session.plans.find(p => p.clientId === client.id);
          const isGen = generating === client.id;
          
          return (
            <div key={client.id} className="client-card">
              <div className="inline inline-spread" style={{ marginBottom: "1rem" }}>
                <div className="inline">
                  <Avatar name={client.fullName} />
                  <div>
                    <strong style={{ color: "var(--on-surface)" }}>{client.fullName}</strong>
                    <p className="muted text-sm" style={{ margin: "0.1rem 0 0" }}>{client.goal}</p>
                  </div>
                </div>
                <StatusPill status={client.status} />
              </div>

              {plan ? (
                <div>
                  <div className="inline inline-spread" style={{ marginBottom: "1rem" }}>
                    <strong style={{ color: "var(--on-surface)", fontSize: "1.05rem" }}>{plan.title}</strong>
                    <div className="inline">
                      <span className={`pill ${plan.latestVersion.status === "approved" ? "pill-success" : "pill-warning"}`}>
                        {plan.latestVersion.status}
                      </span>
                      {plan.latestVersion.status === "draft" && (
                        <button className="sm" onClick={() => onApprove(plan.id)}>✓ Approve Schedule</button>
                      )}
                      <button className="secondary sm" disabled={isGen} onClick={() => handleGenerate(client.id)}>
                        {isGen ? <><span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> Adapting…</> : "⚡ One-Tap Auto-Adjust"}
                      </button>
                    </div>
                  </div>
                  
                  {/* Adaptive AI Reasoning */}
                  <div className="panel card-glass" style={{ marginBottom: "1.5rem", padding: "1.25rem 1.5rem" }}>
                    <div className="inline" style={{ marginBottom: "0.5rem" }}>
                      <span className="eyebrow" style={{ color: "var(--primary)" }}>AI Strategic Reasoning</span>
                    </div>
                    <p className="text-sm" style={{ color: "var(--on-surface)" }}>
                      {plan.latestVersion.explanation.join(" ")}
                      {!plan.latestVersion.explanation.length && "DeepSeek analysis: Client adherence dropped below optimal levels. Calories slightly adjusted to improve sustainability while maintaining progression."}
                    </p>
                  </div>

                  {/* Calendar View */}
                  <p className="eyebrow" style={{ marginBottom: "0.5rem" }}>Weekly Schedule</p>
                  <div className="calendar-grid">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, i) => {
                      const workout = plan.latestVersion.workouts[i] || plan.latestVersion.workouts[i % plan.latestVersion.workouts.length];
                      const meal = plan.latestVersion.nutrition[i] || plan.latestVersion.nutrition[i % plan.latestVersion.nutrition.length];
                      
                      return (
                        <div key={day} className="calendar-day">
                          <div className="calendar-day-header">{day}</div>
                          <div className="calendar-day-content">
                            {workout && <div className="calendar-item workout-item">💪 {workout}</div>}
                            {meal && <div className="calendar-item nutrition-item">🥗 {meal}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="inline">
                  <button disabled={isGen} onClick={() => handleGenerate(client.id)}>
                    {isGen ? <><span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> Generating…</> : "⚡ Generate AI Schedule"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── CLIENT PORTAL VIEW ──────────────────────
function PortalView({ session, clientPortal, selectedClientId, onSwitchClient, onCheckIn, onSaveEdits, onSendMessage, onRefreshProof, checkInHistory, onNav }: {
  session: CoachSession;
  clientPortal: ClientSession | null;
  selectedClientId: string | null;
  onSwitchClient: (id: string) => void;
  onCheckIn: (clientId: string) => Promise<void>;
  onSaveEdits: (draft: ClientProfilePatch) => Promise<void>;
  onSendMessage: (content: string) => Promise<void>;
  onRefreshProof: (clientId: string) => Promise<void>;
  checkInHistory: CheckInWithDelta[];
  onNav: (id: NavId) => void;
}) {
  const sorted = useMemo(() =>
    [...session.clients].sort((a, b) => a.fullName.localeCompare(b.fullName)), [session.clients]);

  const [editDraft, setEditDraft] = useState<ClientProfilePatch>({});
  const [msgDraft, setMsgDraft] = useState("");
  const [activeTab, setActiveTab] = useState<"plan"|"edit"|"messages"|"proof"|"history">("plan");
  const feedRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="page-view">
      <p className="eyebrow">Client Portal</p>
      <h1 className="page-title">Client View</h1>
      <p className="page-subtitle">Manage plans, check-ins, messages and proof cards for each client.</p>

      {/* Client selector */}
      <div className="client-selector-header">
        <label style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ whiteSpace: "nowrap", fontSize: "0.85rem", fontWeight: 600 }}>Select client</span>
          <select value={selectedClientId ?? ""} onChange={e => onSwitchClient(e.target.value)} style={{ flex: 1 }}>
            {sorted.map(c => <option key={c.id} value={c.id}>{c.fullName} — {c.status}</option>)}
          </select>
        </label>
        {clientPortal && (
          <button onClick={() => onCheckIn(clientPortal.client.id)}>↩ Submit check-in</button>
        )}
        {clientPortal && (
          <button className="ghost" onClick={() => onNav("clientApp")}>📱 Preview Client App</button>
        )}
      </div>

      {!clientPortal ? (
        <div className="empty-state"><div className="empty-state-icon">💁</div><p>Select a client above to open their portal.</p></div>
      ) : (
        <div>
          {/* Client header */}
          <div className="panel" style={{ marginBottom: "1rem" }}>
            <div className="inline inline-spread">
              <div className="inline">
                <Avatar name={clientPortal.client.fullName} />
                <div>
                  <h2 style={{ fontSize: "1.1rem" }}>{clientPortal.client.fullName}</h2>
                  <p className="muted text-sm">{clientPortal.client.goal}</p>
                </div>
              </div>
              <div className="inline">
                <StatusPill status={clientPortal.client.status} />
                <span className="muted text-sm">£{clientPortal.client.monthlyPriceGbp}/mo</span>
              </div>
            </div>
            <div style={{ marginTop: "1rem" }}>
              <AdherenceBar score={clientPortal.client.adherenceScore} />
            </div>
          </div>

          {/* Tabs */}
          <div className="tabs">
            {(["plan","edit","messages","proof","history"] as const).map(t => (
              <button key={t} className={`tab${activeTab === t ? " active" : ""}`} onClick={() => setActiveTab(t)}>
                {t === "plan" ? "📋 Plan" : t === "edit" ? "✏ Edit" : t === "messages" ? `💬 Messages ${clientPortal.messages?.length ? `(${clientPortal.messages.length})` : ""}` : t === "proof" ? "🏆 Proof Card" : "📊 History"}
              </button>
            ))}
          </div>

          {/* Tab panels */}
          {activeTab === "plan" && (
            <div>
              {clientPortal.plan ? (
                <div>
                  <div className="inline inline-spread" style={{ marginBottom: "1rem" }}>
                    <strong style={{ color: "var(--on-surface)" }}>{clientPortal.plan.title}</strong>
                    <span className={`pill ${clientPortal.plan.latestVersion.status === "approved" ? "pill-success" : "pill-warning"}`}>
                      {clientPortal.plan.latestVersion.status}
                    </span>
                  </div>
                  <div className="plan-grid">
                    <div className="plan-box">
                      <h4>💪 Workouts</h4>
                      <ul>{clientPortal.plan.latestVersion.workouts.map(w => <li key={w}>{w}</li>)}</ul>
                    </div>
                    <div className="plan-box">
                      <h4>🥗 Nutrition</h4>
                      <ul>{clientPortal.plan.latestVersion.nutrition.map(n => <li key={n}>{n}</li>)}</ul>
                    </div>
                  </div>
                  {/* Nutrition Swap Agent */}
                  <NutritionSwapAgent
                    planId={clientPortal.plan.id}
                    planNutrition={clientPortal.plan.latestVersion.nutrition}
                  />
                </div>
              ) : (
                <div className="empty-state"><div className="empty-state-icon">📋</div><p>No approved plan yet. Generate one in AI Plans.</p></div>
              )}
            </div>
          )}

          {activeTab === "edit" && (
            <div className="panel">
              <form className="stack" onSubmit={async e => { e.preventDefault(); await onSaveEdits(editDraft); }}>
                <div className="two-col">
                  <label>Goal
                    <textarea value={editDraft.goal ?? ""} onChange={e => setEditDraft(d => ({ ...d, goal: e.target.value }))} />
                  </label>
                  <div className="stack">
                    <label>Status
                      <select value={editDraft.status ?? "active"} onChange={e => setEditDraft(d => ({ ...d, status: e.target.value as ClientProfile["status"] }))}>
                        <option value="active">Active</option>
                        <option value="at_risk">At risk</option>
                        <option value="trial">Trial</option>
                      </select>
                    </label>
                    <label>Monthly price (£)
                      <input type="number" value={editDraft.monthlyPriceGbp ?? 0} onChange={e => setEditDraft(d => ({ ...d, monthlyPriceGbp: Number(e.target.value) }))} />
                    </label>
                    <label>Next renewal date
                      <input type="date" value={editDraft.nextRenewalDate ?? ""} onChange={e => setEditDraft(d => ({ ...d, nextRenewalDate: e.target.value }))} />
                    </label>
                  </div>
                </div>
                <div className="inline">
                  <button type="submit">Save changes</button>
                </div>
              </form>
            </div>
          )}

          {activeTab === "messages" && (
            <div className="panel">
              <div className="message-feed" ref={feedRef}>
                {(!clientPortal.messages || clientPortal.messages.length === 0)
                  ? <div className="empty-state" style={{ padding: "2rem 0" }}><div className="empty-state-icon">💬</div><p>No messages yet.</p></div>
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

          {activeTab === "proof" && (
            <div className="proof-card">
              <div className="inline inline-spread" style={{ marginBottom: "1rem" }}>
                <div>
                  <p className="eyebrow" style={{ marginBottom: "0.25rem" }}>Proof Engine v1</p>
                  <h3 style={{ marginBottom: 0 }}>{clientPortal.proofCard?.headline}</h3>
                </div>
                <button className="secondary sm" onClick={() => onRefreshProof(clientPortal.client.id)}>↻ Refresh</button>
              </div>
              <p className="muted" style={{ marginBottom: "1.5rem" }}>{clientPortal.proofCard?.body}</p>
              <div className="stat-grid">
                {clientPortal.proofCard?.stats.map(s => (
                  <div key={s.label} className="stat-card">
                    <div className="stat-card__label">{s.label}</div>
                    <div className="stat-card__value" style={{ fontSize: "1.4rem" }}>{s.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "history" && (
            <div>
              {!checkInHistory.length ? (
                <div className="empty-state">
                  <div className="empty-state-icon">📊</div>
                  <p>No check-in history for this client yet.</p>
                </div>
              ) : (
                <div>
                  {/* Summary stats */}
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

                  {/* Weight trend chart */}
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
                              <div
                                className="trend-bar-fill trend-bar-fill--weight"
                                style={{ height: hasWeight ? `${Math.max(8, pct)}%` : "8%", opacity: hasWeight ? 1 : 0.3 }}
                              />
                            </div>
                            <span className="trend-bar-label">{checkIn.progress.weightKg != null ? `${checkIn.progress.weightKg}` : "—"}</span>
                            <span className="trend-bar-date">{new Date(checkIn.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Energy trend chart */}
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

                  {/* Steps trend chart */}
                  <div className="panel" style={{ marginBottom: "1.5rem" }}>
                    <div className="section-header">
                      <h2>Daily Steps</h2>
                      <span className="pill pill-info">steps</span>
                    </div>
                    <div className="trend-chart">
                      {checkInHistory.map((checkIn) => {
                        const steps = checkIn.progress.steps;
                        const maxSteps = Math.max(...checkInHistory.map(c => c.progress.steps), 1);
                        const pct = (steps / maxSteps) * 100;
                        return (
                          <div key={checkIn.id} className="trend-bar-wrap">
                            <div className="trend-bar-track">
                              <div className="trend-bar-fill trend-bar-fill--steps" style={{ height: `${Math.max(8, pct)}%` }} />
                            </div>
                            <span className="trend-bar-label">{(steps / 1000).toFixed(1)}k</span>
                            <span className="trend-bar-date">{new Date(checkIn.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Timeline entries */}
                  <div className="panel">
                    <div className="section-header"><h2>Check-In Log</h2></div>
                    <div className="timeline">
                      {[...checkInHistory].reverse().map((checkIn) => (
                        <div key={checkIn.id} className="timeline-item">
                          <div className="timeline-dot" />
                          <div className="timeline-content">
                            <div className="inline inline-spread" style={{ marginBottom: "0.5rem" }}>
                              <strong style={{ color: "var(--on-surface)" }}>
                                {new Date(checkIn.submittedAt).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
                              </strong>
                              <div className="inline">
                                {checkIn.weightDelta != null && (
                                  <span className={`pill ${checkIn.weightDelta < 0 ? "pill-success" : checkIn.weightDelta > 0 ? "pill-danger" : "pill-muted"}`}>
                                    {checkIn.weightDelta > 0 ? "+" : ""}{checkIn.weightDelta.toFixed(1)}kg
                                  </span>
                                )}
                                {checkIn.photoCount > 0 && (
                                  <span className="pill pill-info">📷 {checkIn.photoCount}</span>
                                )}
                              </div>
                            </div>
                            <div className="inline gap-2" style={{ flexWrap: "wrap", marginBottom: "0.5rem" }}>
                              {checkIn.progress.weightKg != null && (
                                <span className="text-sm"><strong>{checkIn.progress.weightKg}kg</strong></span>
                              )}
                              <span className="text-sm">⚡ {checkIn.progress.energyScore}/10</span>
                              <span className="text-sm">👟 {checkIn.progress.steps.toLocaleString()} steps</span>
                              {checkIn.progress.waistCm != null && (
                                <span className="text-sm">📏 {checkIn.progress.waistCm}cm waist</span>
                              )}
                            </div>
                            {checkIn.progress.notes && (
                              <p className="text-sm muted" style={{ margin: 0, fontStyle: "italic" }}>"{checkIn.progress.notes}"</p>
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
        </div>
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

// ── ANALYTICS VIEW ──────────────────────
function AnalyticsView({ analytics, runtime }: { analytics: AnalyticsResponse | null; runtime: RuntimeResponse | null }) {
  if (!analytics) return <div className="page-view"><div className="spinner" /></div>;
  return (
    <div className="page-view">
      <p className="eyebrow">Analytics</p>
      <h1 className="page-title">Product Instrumentation</h1>
      <p className="page-subtitle">Onboarding, plan generation, check-ins, payments, and proof events.</p>

      <div className="stat-grid">
        <div className="stat-card stat-card--accent">
          <div className="stat-card__label">Total Events</div>
          <div className="stat-card__value">{analytics.summary.totalEvents}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Last Event</div>
          <div className="stat-card__value" style={{ fontSize: "1rem" }}>{analytics.summary.lastEventAt ? analytics.summary.lastEventAt.slice(0, 10) : "—"}</div>
        </div>
      </div>

      <div className="content-grid">
        <div className="panel">
          <div className="section-header"><h2>Top Events</h2></div>
          <div className="stack compact">
            {analytics.summary.topEvents.map(e => (
              <div key={e.name} className="row-line">
                <code style={{ fontSize: "0.8rem" }}>{e.name}</code>
                <span className="pill">{e.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="section-header"><h2>Recent Events</h2></div>
          <div className="stack compact analytics-feed">
            {[...analytics.events].reverse().slice(0, 8).map((e, i) => (
              <div key={i} className="row-line">
                <div>
                  <code style={{ fontSize: "0.78rem", color: "var(--primary)" }}>{e.name}</code>
                  <p className="muted text-xs">{e.occurredAt.slice(0, 19).replace("T", " ")}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {runtime && (
        <div className="panel" style={{ marginTop: "1.5rem" }}>
          <div className="section-header"><h2>Runtime Adapters</h2></div>
          <div className="stack compact">
            {[
              ["Storage", runtime.storage],
              ["AI Provider", runtime.services.planGeneration],
              ["Proof Engine", runtime.services.proofCards],
              ["Billing", runtime.services.billing],
              ["State file", runtime.stateFilePath ?? "In-memory"],
            ].map(([k, v]) => (
              <div key={k} className="row-line">
                <span className="muted text-sm">{k}</span>
                <code style={{ fontSize: "0.8rem" }}>{v}</code>
              </div>
            ))}
          </div>
        </div>
      )}
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

  const STEPS = ["Workspace", "Clients", "Stripe"];

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

        {/* Step 1 — Client Import */}
        {step === 1 && (
          <div>
            <p className="eyebrow">Step 2 of {STEPS.length}</p>
            <h2 className="modal-title">Import your clients</h2>
            <p className="modal-subtitle">Start with 3 demo clients or import your own from a CSV.</p>
            <div className="panel" style={{ marginTop: "1rem" }}>
              <p className="text-sm" style={{ color: "var(--on-surface-variant)", marginBottom: "1rem" }}>3 demo clients are pre-loaded for you to explore CoachOS immediately:</p>
              <div className="stack compact">
                {["Sophie Patel — Active", "Liam Carter — At risk", "Ava Thompson — Trial"].map(name => (
                  <div key={name} className="row-line">
                    <Avatar name={name.split(" — ")[0]} />
                    <span className="text-sm" style={{ color: "var(--on-surface)" }}>{name.split(" — ")[0]}</span>
                    <span className={`pill ${name.includes("Active") ? "pill-success" : name.includes("At risk") ? "pill-danger" : "pill-warning"}`}>
                      {name.split(" — ")[1]}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-sm muted" style={{ marginTop: "1rem" }}>You can add more clients later via the Migration view or CSV import.</p>
            </div>
          </div>
        )}

        {/* Step 2 — Stripe */}
        {step === 2 && (
          <div>
            <p className="eyebrow">Step 3 of {STEPS.length}</p>
            <h2 className="modal-title">Connect billing</h2>
            <p className="modal-subtitle">Enable UK VAT-ready invoicing and automated recurring payments.</p>
            <div className="panel" style={{ marginTop: "1rem" }}>
              <div className="inline inline-spread" style={{ marginBottom: "1rem" }}>
                <div className="inline">
                  <span style={{ fontSize: "1.5rem" }}>💳</span>
                  <div>
                    <strong style={{ color: "var(--on-surface)" }}>Stripe GBP</strong>
                    <p className="muted text-sm" style={{ margin: 0 }}>Accept £ payments with full UK VAT support</p>
                  </div>
                </div>
                <label className="toggle">
                  <input type="checkbox" checked={draft.stripeConnected} onChange={e => setDraft(d => ({ ...d, stripeConnected: e.target.checked }))} />
                </label>
              </div>
              {draft.stripeConnected && (
                <div className="pill pill-success" style={{ width: "fit-content" }}>
                  ● Stripe connected — VAT invoicing enabled
                </div>
              )}
              {!draft.stripeConnected && (
                <p className="text-sm muted">You can connect Stripe later in Workspace settings. Demo mode is fully functional without it.</p>
              )}
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
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [runtime, setRuntime] = useState<RuntimeResponse | null>(null);
  const [checkInHistory, setCheckInHistory] = useState<CheckInWithDelta[]>([]);
  const [activeNav, setActiveNav] = useState<NavId>("dashboard");
  const { toasts, push } = useToast();

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
    const [coachSession, analyticsData, runtimeData] = await Promise.all([
      fetchJson<CoachSession>("/session/coach"),
      fetchJson<AnalyticsResponse>("/analytics"),
      fetchJson<RuntimeResponse>("/runtime"),
    ]);
    setSession(coachSession);
    setAnalytics(analyticsData);
    setRuntime(runtimeData);

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
          />
        )}
        {activeNav === "clients" && (
          <ClientsView session={session} onOpenClient={id => { setActiveNav("portal"); switchClient(id); }} />
        )}
        {activeNav === "plans" && (
          <PlansView session={session} onGenerate={handleGenerate} onApprove={handleApprove} />
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
            checkInHistory={checkInHistory}
            onNav={setActiveNav}
          />
        )}
        {activeNav === "billing" && (
          <BillingView session={session} onToggleBilling={handleToggleBilling} />
        )}
        {activeNav === "analytics" && (
          <AnalyticsView analytics={analytics} runtime={runtime} />
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
        {activeNav === "clientApp" && (
          <ClientAppView
            session={session}
            clientPortal={clientPortal}
            onSwitchClient={switchClient}
          />
        )}
        {activeNav === "settings" && (
          <SettingsView session={session} onSave={handleSaveSettings} />
        )}
      </div>

      <ToastContainer toasts={toasts} />

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
