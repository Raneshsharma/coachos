import { FormEvent, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import type {
  CheckIn, ClientProfile, ClientProfilePatch, CoachUser,
  CoachWorkspace, PaymentSubscription, ProgramPlan, ProofCard, Message
} from "@coachos/domain";
import { Pill, SectionShell, StatCard } from "@coachos/ui";
import "./styles.css";

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
type NavId = "dashboard"|"clients"|"plans"|"portal"|"billing"|"analytics"|"settings"|"migration";

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
          <div className="sidebar-logo-tag">Phase 1 MVP</div>
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

        <span className="nav-section-label">Business</span>
        {nav("billing", "£", "Billing & MRR")}
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
                      <button className="secondary sm" onClick={() => onSimulateCheckIn(client.id)}>↩ Simulate check-in</button>
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
      <h1 className="page-title">Plan Drafts</h1>
      <p className="page-subtitle">AI drafts personalised plans. You always approve before anything reaches the client.</p>

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
                  <div className="inline inline-spread" style={{ marginBottom: "0.75rem" }}>
                    <strong style={{ color: "var(--on-surface)" }}>{plan.title}</strong>
                    <div className="inline">
                      <span className={`pill ${plan.latestVersion.status === "approved" ? "pill-success" : "pill-warning"}`}>
                        {plan.latestVersion.status}
                      </span>
                      {plan.latestVersion.status === "draft" && (
                        <button className="sm" onClick={() => onApprove(plan.id)}>✓ Approve</button>
                      )}
                      <button className="secondary sm" disabled={isGen} onClick={() => handleGenerate(client.id)}>
                        {isGen ? <><span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> Generating…</> : "⚡ Regenerate Plan"}
                      </button>
                    </div>
                  </div>
                  <p className="muted text-sm" style={{ marginBottom: "1rem" }}>{plan.latestVersion.explanation.join(" ")}</p>
                  <div className="plan-grid">
                    <div className="plan-box">
                      <h4>💪 Workouts</h4>
                      <ul>{plan.latestVersion.workouts.map(w => <li key={w}>{w}</li>)}</ul>
                    </div>
                    <div className="plan-box">
                      <h4>🥗 Nutrition</h4>
                      <ul>{plan.latestVersion.nutrition.map(n => <li key={n}>{n}</li>)}</ul>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="inline">
                  <button disabled={isGen} onClick={() => handleGenerate(client.id)}>
                    {isGen ? <><span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> Generating…</> : "⚡ Generate AI Plan"}
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
function PortalView({ session, clientPortal, selectedClientId, onSwitchClient, onCheckIn, onSaveEdits, onSendMessage, onRefreshProof }: {
  session: CoachSession;
  clientPortal: ClientSession | null;
  selectedClientId: string | null;
  onSwitchClient: (id: string) => void;
  onCheckIn: (clientId: string) => Promise<void>;
  onSaveEdits: (draft: ClientProfilePatch) => Promise<void>;
  onSendMessage: (content: string) => Promise<void>;
  onRefreshProof: (clientId: string) => Promise<void>;
}) {
  const sorted = useMemo(() =>
    [...session.clients].sort((a, b) => a.fullName.localeCompare(b.fullName)), [session.clients]);

  const [editDraft, setEditDraft] = useState<ClientProfilePatch>({});
  const [msgDraft, setMsgDraft] = useState("");
  const [activeTab, setActiveTab] = useState<"plan"|"edit"|"messages"|"proof">("plan");
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
            {(["plan","edit","messages","proof"] as const).map(t => (
              <button key={t} className={`tab${activeTab === t ? " active" : ""}`} onClick={() => setActiveTab(t)}>
                {t === "plan" ? "📋 Plan" : t === "edit" ? "✏ Edit" : t === "messages" ? `💬 Messages ${clientPortal.messages?.length ? `(${clientPortal.messages.length})` : ""}` : "🏆 Proof Card"}
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

  return (
    <div className="page-view">
      <p className="eyebrow">Billing & MRR</p>
      <h1 className="page-title">Revenue Dashboard</h1>
      <p className="page-subtitle">GBP recurring subscriptions, dunning, and payment recovery.</p>

      <div className="stat-grid" style={{ marginBottom: "2rem" }}>
        <div className="stat-card stat-card--accent">
          <div className="stat-card__label">Monthly Recurring Revenue</div>
          <div className="stat-card__value">£{mrrGbp}</div>
        </div>
        <div className="stat-card stat-card--danger">
          <div className="stat-card__label">Past Due</div>
          <div className="stat-card__value" style={{ color: "var(--danger)" }}>{churnCount}</div>
        </div>
        <div className="stat-card stat-card--warning">
          <div className="stat-card__label">Trialing</div>
          <div className="stat-card__value" style={{ color: "var(--warning)" }}>{trialingCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Total Subscriptions</div>
          <div className="stat-card__value">{subs.length}</div>
        </div>
      </div>

      <div className="panel">
        <div className="section-header"><h2>All Subscriptions</h2></div>
        <div className="stack compact">
          {subs.map(sub => {
            const client = session.clients.find(c => c.id === sub.clientId);
            return (
              <div key={sub.id} className="billing-status-row">
                <div className="inline">
                  {client && <Avatar name={client.fullName} />}
                  <div>
                    <strong style={{ color: "var(--on-surface)" }}>{client?.fullName}</strong>
                    <p className="muted text-xs" style={{ margin: "0.1rem 0 0" }}>Renews {sub.renewalDate}</p>
                  </div>
                </div>
                <div className="inline">
                  <span style={{ fontWeight: 700, color: "var(--on-surface)" }}>£{sub.amountGbp}/mo</span>
                  <span className={`pill ${sub.status === "past_due" ? "pill-danger" : sub.status === "trialing" ? "pill-warning" : "pill-success"}`}>
                    {sub.status}
                  </span>
                  <button className="secondary sm" onClick={() => onToggleBilling(sub.clientId, "past_due")}>Mark due</button>
                  <button className="sm" onClick={() => onToggleBilling(sub.clientId, "active")}>Mark active</button>
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
   APP ROOT
──────────────────────────────────────── */
function App() {
  const [session, setSession] = useState<CoachSession | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [clientPortal, setClientPortal] = useState<ClientSession | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [proofCard, setProofCard] = useState<ProofCard | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [runtime, setRuntime] = useState<RuntimeResponse | null>(null);
  const [activeNav, setActiveNav] = useState<NavId>("dashboard");
  const { toasts, push } = useToast();

  const switchClient = useCallback(async (clientId: string) => {
    setSelectedClientId(clientId);
    try {
      const portal = await fetchJson<ClientSession>(`/session/client/${clientId}`);
      setClientPortal(portal);
      setProofCard(portal.proofCard);
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
        {activeNav === "settings" && (
          <SettingsView session={session} onSave={handleSaveSettings} />
        )}
      </div>

      <ToastContainer toasts={toasts} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
