import { FormEvent, useEffect, useMemo, useRef, useState, useCallback } from "react";
import * as React from "react";
import { createRoot } from "react-dom/client";
import type {
  CheckIn, ClientProfile, ClientProfilePatch, CoachUser,
  CoachWorkspace, PaymentSubscription, ProgramPlan, ProofCard, Message
} from "@coachos/domain";
import { Pill, SectionShell, StatCard } from "@coachos/ui";
import "./styles.css";
import { ExerciseLibraryView } from "./views/ExerciseLibraryView";
import { RecipeBrowserView } from "./views/RecipeBrowserView";
import { ClientCommandCenter } from "./ClientCommandCenter";

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   TYPES
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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
type NavId = "dashboard"|"clients"|"calendar"|"habits"|"exercises"|"recipes"|"business"|"settings"|"ai";
type CheckInWithDelta = CheckIn & { weightDelta: number | null; energyDelta: number | null; adherenceDelta: number | null };
type GroupProgram = { id: string; coachId: string; title: string; description: string; goal: string; memberIds: string[]; monthlyPriceGbp: number; status: "active"|"archived"|"upcoming"; createdAt: string };
type NutritionSwap = { id: string; planId: string; originalFood: { name: string; calories: number; proteinG: number; carbsG: number; fatG: number; portion: string }; swapSuggestion: { name: string; calories: number; proteinG: number; carbsG: number; fatG: number; portion: string; reasoning: string }; appliedAt: string | null };
type SwapSuggestion = { original: { name: string; calories: number; proteinG: number; carbsG: number; fatG: number; portion: string }; suggestion: { name: string; calories: number; proteinG: number; carbsG: number; fatG: number; portion: string; reasoning: string } | null };
type Habit = { id: string; clientId: string; title: string; target: number; frequency: "daily"|"weekly"; createdAt: string };
type HabitSummary = { habit: Habit; streak: number; todayDone: boolean; totalCompletions: number };
type Exercise = { id: string; name: string; bodyPart: string; equipment: string; goal: string; difficulty: "beginner"|"intermediate"|"advanced"; instructions: string };
type Recipe = { id: string; name: string; ingredients: string[]; steps: string[]; calories: number; proteinG: number; carbsG: number; fatG: number; prepTime: number; cookTime: number; tags: string[] };
type BookedSession = { id: string; clientId: string; clientName: string; sessionType: 'virtual' | 'in_person'; date: string; time: string; duration: number; notes: string; status: 'upcoming' | 'completed' | 'cancelled'; sessionNotes: string; completedAt: string | null; createdAt: string };

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   API HELPERS
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const isProd = import.meta.env.PROD;
const apiBase = isProd ? "/api" : "http://localhost:4000/api";

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, { headers: { "Content-Type": "application/json" }, ...init });
  if (!res.ok) throw new Error(`API error ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}
export { fetchJson };

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   TOAST HOOK
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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
        // Queue it â€” don't overflow the screen
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

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   CSV HELPER
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function csvToRows(csv: string) {
  const [, ...lines] = csv.trim().split("\n");
  return lines.map(l => l.split(",")).filter(p => p.length >= 4)
    .map(([name, email, goal, price]) => ({ name: name.trim(), email: email.trim(), goal: goal.trim(), monthlyPriceGbp: Number(price.trim()) }));
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   SMALL COMPONENTS
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   SIDEBAR
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function Sidebar({
  active, onNav, session, atRiskCount, notifications, setNotifications, showNotifications, setShowNotifications
}: {
  active: NavId;
  onNav: (id: NavId) => void;
  session: CoachSession | null;
  atRiskCount: number;
  notifications: Array<{ id: string; message: string; type: string; time: string; read: boolean }>;
  setNotifications: React.Dispatch<React.SetStateAction<Array<{ id: string; message: string; type: string; time: string; read: boolean }>>>;
  showNotifications: boolean;
  setShowNotifications: React.Dispatch<React.SetStateAction<boolean>>;
}) {
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

      <button
        onClick={() => setShowNotifications(v => !v)}
        style={{ position: 'relative', background: showNotifications ? 'var(--primary-light)' : 'none', border: 'none', cursor: 'pointer', padding: '0.5rem', borderRadius: 'var(--r-md)', display: 'grid', placeItems: 'center', alignSelf: 'flex-start', width: '36px', height: '36px', marginLeft: 'auto', marginBottom: '0.5rem' }}>
        <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', color: showNotifications ? 'var(--primary)' : 'var(--outline)' }}>notifications</span>
        {notifications.filter(n => !n.read).length > 0 && (
          <span style={{ position: 'absolute', top: '4px', right: '4px', background: 'var(--danger)', color: 'white', borderRadius: '50%', width: '14px', height: '14px', fontSize: '0.55rem', fontWeight: 800, display: 'grid', placeItems: 'center', fontFamily: 'Inter, sans-serif' }}>
            {notifications.filter(n => !n.read).length}
          </span>
        )}
      </button>
      {showNotifications && (
        <div style={{ background: 'var(--surface-container-low)', borderRadius: 'var(--r-lg)', border: '1px solid var(--outline-variant)', padding: '0.75rem', marginBottom: '0.75rem', maxHeight: '280px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h3 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-primary)', margin: 0 }}>Notifications</h3>
            {notifications.length > 0 && (
              <button onClick={() => setNotifications(ns => ns.map(n => ({ ...n, read: true })))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontFamily: 'Inter, sans-serif', fontSize: '0.7rem', fontWeight: 600 }}>Mark all read</button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.75rem', color: 'var(--outline)', textAlign: 'center', padding: '1rem 0' }}>No notifications yet</p>
          ) : (
            notifications.map(n => (
              <div key={n.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--surface-container)', display: 'flex', gap: '0.5rem', alignItems: 'flex-start', opacity: n.read ? 0.6 : 1 }}>
                {!n.read && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--primary)', flexShrink: 0, marginTop: '0.35rem' }} />}
                {n.read && <span style={{ width: '6px', height: '6px', flexShrink: 0, marginTop: '0.35rem' }} />}
                <div>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.75rem', color: 'var(--text-primary)', margin: 0 }}>{n.message}</p>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.65rem', color: 'var(--outline)', margin: '0.1rem 0 0 0' }}>{n.time}</p>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <nav className="sidebar-nav">
        {nav("dashboard", "\u25C9", "Dashboard", atRiskCount || undefined)}
        {nav("clients", "\u229E", "Clients")}
        {nav("ai", "\u2727", "AI Coach")}
        {nav("calendar", "\u25A6", "Calendar")}
        {nav("habits", "\u25C8", "Habits")}
        {nav("exercises", "\u2B22", "Exercises")}
        {nav("recipes", "\u2B21", "Recipes")}
        {nav("business", "\u00A3", "Business")}
        {nav("settings", "\u2B58", "Settings")}
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

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   VIEWS
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */


// â”€â”€ SESSION BOOKING MODAL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function SessionBookingModal({ client, onClose, onSuccess, onBookSession, push, clients }: {
  client: { id: string; fullName: string };
  onClose: () => void;
  onSuccess: () => void;
  onBookSession?: (session: BookedSession) => void;
  push: (msg: string, type?: string) => void;
  clients?: ClientProfile[];
}) {
  const [sessionType, setSessionType] = useState<'virtual' | 'in_person'>('virtual');
  const [selectedClientId, setSelectedClientId] = useState(client.id || "");
  const [isBlockTime, setIsBlockTime] = useState(false);
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });
  const [time, setTime] = useState('10:00');
  const [duration, setDuration] = useState('60');
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const clientList = clients || [client];
  const selectedClient = clientList.find(c => c.id === selectedClientId);
  const displayName = isBlockTime ? "Blocked Time" : (selectedClient?.fullName || client.fullName);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      if (!isBlockTime && selectedClientId) {
        await fetchJson(`/clients/${selectedClientId}/sessions`, {
          method: 'POST',
          body: JSON.stringify({ sessionType, date, time, duration: Number(duration), notes }),
        });
        if (onBookSession) {
          onBookSession({
            id: `bs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            clientId: selectedClientId,
            clientName: selectedClient?.fullName || client.fullName,
            sessionType,
            date, time,
            duration: Number(duration),
            notes,
            status: 'upcoming',
            sessionNotes: '',
            completedAt: null,
            createdAt: new Date().toISOString(),
          });
        }
      } else {
        if (onBookSession) {
          onBookSession({
            id: `block_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            clientId: "blocked",
            clientName: "⛔ Blocked",
            sessionType: 'virtual',
            date, time,
            duration: Number(duration),
            notes: notes || "Time blocked",
            status: 'cancelled' as any,
            sessionNotes: '',
            completedAt: null,
            createdAt: new Date().toISOString(),
          });
        }
      }
      setSuccess(true);
      setTimeout(() => { onSuccess(); push(isBlockTime ? 'Time blocked!' : `Session booked for ${displayName}!`, 'success'); }, 1200);
    } catch {
      push('Failed. Try again.', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)' }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--surface-container-low)', borderRadius: 'var(--r-xl)', padding: '1.75rem', width: 'min(480px, 95vw)', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.24)', border: '1px solid var(--outline-variant)' }}>
        {success ? (
          <div style={{ textAlign: 'center', padding: '2rem 0' }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.75rem', animation: 'fadeIn 0.4s ease' }}>check_circle</div>
            <h3 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, color: 'var(--primary)', marginBottom: '0.5rem' }}>{isBlockTime ? 'Time Blocked!' : 'Session Booked!'}</h3>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.85rem', color: 'var(--on-surface-variant)' }}>{isBlockTime ? 'Time slot marked as unavailable.' : `Invite sent to ${displayName}.`}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-primary)', margin: 0 }}>Book Session</h2>
              <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--outline)', padding: '0.25rem', display: 'grid', placeItems: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '1.25rem' }}>close</span>
              </button>
            </div>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.8rem', color: 'var(--outline)', marginBottom: '1rem' }}>
              {isBlockTime ? 'Block a time slot — no client will be assigned.' : `Schedule a session with ${displayName}.`}
            </p>

            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <label style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.72rem', fontWeight: 600, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Client</label>
                <button type="button" onClick={() => setIsBlockTime(!isBlockTime)}
                  style={{ padding: '0.25rem 0.65rem', borderRadius: 'var(--r-full)', border: `1.5px solid ${isBlockTime ? 'var(--danger)' : 'var(--outline-variant)'}`, background: isBlockTime ? 'var(--danger-light)' : 'transparent', color: isBlockTime ? 'var(--danger-text)' : 'var(--text-muted)', fontFamily: 'Inter, sans-serif', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}>
                  ⛔ Block Time
                </button>
              </div>
              {!isBlockTime && (
                <select value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 'var(--r-md)', border: '1.5px solid var(--outline-variant)', background: 'var(--surface-container)', color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif', fontSize: '0.85rem', outline: 'none' }}>
                  {clientList.map(c => (
                    <option key={c.id} value={c.id}>{c.fullName}</option>
                  ))}
                </select>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.72rem', fontWeight: 600, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.35rem' }}>Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} required style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 'var(--r-md)', border: '1.5px solid var(--outline-variant)', background: 'var(--surface-container)', color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif', fontSize: '0.85rem', boxSizing: 'border-box', outline: 'none' }} />
              </div>
              <div>
                <label style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.72rem', fontWeight: 600, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.35rem' }}>Time</label>
                <input type="time" value={time} onChange={e => setTime(e.target.value)} required style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 'var(--r-md)', border: '1.5px solid var(--outline-variant)', background: 'var(--surface-container)', color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif', fontSize: '0.85rem', boxSizing: 'border-box', outline: 'none' }} />
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.72rem', fontWeight: 600, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.35rem' }}>Duration</label>
              <select value={duration} onChange={e => setDuration(e.target.value)} style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 'var(--r-md)', border: '1.5px solid var(--outline-variant)', background: 'var(--surface-container)', color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif', fontSize: '0.85rem', outline: 'none' }}>
                <option value="30">30 min</option>
                <option value="45">45 min</option>
                <option value="60">60 min</option>
                <option value="90">90 min</option>
              </select>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.72rem', fontWeight: 600, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.35rem' }}>Session Type</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {(['virtual', 'in_person'] as const).map(type => (
                  <button type="button" key={type} onClick={() => setSessionType(type)} style={{ flex: 1, padding: '0.5rem', borderRadius: 'var(--r-md)', border: `1.5px solid ${sessionType === type ? 'var(--primary)' : 'var(--outline-variant)'}`, background: sessionType === type ? 'var(--primary-light)' : 'var(--surface-container)', color: sessionType === type ? 'var(--primary)' : 'var(--on-surface)', fontFamily: 'Inter, sans-serif', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>{type === 'virtual' ? 'videocam' : 'person_pin'}</span>
                    {type === 'virtual' ? 'Virtual' : 'In-Person'}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.72rem', fontWeight: 600, color: 'var(--outline)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.35rem' }}>Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Session focus, goals, topics to cover..." style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 'var(--r-md)', border: '1.5px solid var(--outline-variant)', background: 'var(--surface-container)', color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif', fontSize: '0.85rem', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
            </div>

            <button type="submit" disabled={sending} style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--r-lg)', border: 'none', background: sending ? 'var(--surface-container)' : 'var(--primary)', color: sending ? 'var(--outline)' : 'white', fontFamily: 'Manrope, sans-serif', fontSize: '0.85rem', fontWeight: 700, cursor: sending ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', transition: 'all 0.15s ease' }}>
              {sending ? (
                <><span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>progress_activity</span> Saving...</>
              ) : (
                <><span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>{isBlockTime ? 'block' : 'send'}</span>
                {isBlockTime ? 'Block Time Slot' : 'Book Session'}</>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// â”€â”€ DASHBOARD VIEW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function DashboardView({ session, onNav, onSimulateCheckIn, onMarkPayment, push, onLogWorkout, onOpenClientNotes, onAddClient }: {
  session: CoachSession;
  onNav: (id: NavId) => void;
  onSimulateCheckIn: (clientId: string) => Promise<void>;
  onMarkPayment: (clientId: string) => Promise<void>;
  push: (message: string, type?: "success"|"error"|"info") => void;
  onLogWorkout: () => void;
  onOpenClientNotes: () => void;
  onAddClient: () => void;
}) {
  const { dashboard, clients } = session;
  const mrrGbp = session.subscriptions
    .filter(s => s.status === "active")
    .reduce((sum, s) => sum + s.amountGbp, 0);

  const today = new Date();
  const dayName = today.toLocaleDateString("en-US", { weekday: "long" });
  const dateStr = today.toLocaleDateString("en-US", { month: "long", day: "numeric" });

  const atRiskCount = dashboard.atRiskClients.length;

  const todayStr = today.toISOString().split("T")[0];

  const todaySessions = useMemo(() => {
    const sessions: Array<{ time: string; clientId: string; clientName: string; type: string; isAtRisk: boolean }> = [];
    const renewalClients = session.subscriptions
      .filter(s => s.renewalDate === todayStr && s.status === "active")
      .map(s => clients.find(c => c.id === s.clientId))
      .filter(Boolean) as ClientProfile[];
    renewalClients.forEach((_, i) => {
      if (i < 3) sessions.push({
        time: `${9 + i * 2}:00`,
        clientId: clients[i]?.id ?? "",
        clientName: clients[i]?.fullName ?? "",
        type: "Renewal check-in",
        isAtRisk: dashboard.atRiskClients.some(a => a.clientId === clients[i]?.id),
      });
    });
    if (sessions.length === 0 && clients.length > 0) {
      const morningHours = ["10:00", "14:00"];
      clients.slice(0, Math.min(2, clients.length)).forEach((c, i) => {
        sessions.push({
          time: morningHours[i] ?? "10:00",
          clientId: c.id,
          clientName: c.fullName,
          type: c.status === "trial" ? "Trial review" : "Check-in",
          isAtRisk: dashboard.atRiskClients.some(a => a.clientId === c.id),
        });
      });
    }
    return sessions;
  }, [session.subscriptions, clients, dashboard.atRiskClients, todayStr]);

  const attentionClients = useMemo(() => {
    return clients
      .map(c => {
        const risk = dashboard.atRiskClients.find(a => a.clientId === c.id);
        const daysSinceCheckIn = c.lastCheckInDate
          ? Math.floor((Date.now() - new Date(c.lastCheckInDate).getTime()) / 86400000)
          : 999;
        let priority = 0;
        let reason = "";
        let action = "View";
        let severity: "high" | "medium" | "low" = "low";
        if (risk) {
          priority = risk.severity === "high" ? 100 : risk.severity === "medium" ? 70 : 30;
          reason = risk.reasons[0] ?? "Needs attention";
          action = risk.recommendedAction ?? "Nudge";
          severity = risk.severity;
        } else if (c.status === "trial" && !c.lastCheckInDate) {
          priority = 60;
          reason = "Trial ending soon â€” no check-in yet";
          action = "Follow up";
          severity = "medium";
        } else if (c.adherenceScore < 50) {
          priority = 55;
          reason = `Adherence at ${c.adherenceScore}%`;
          action = "Review";
          severity = "medium";
        } else if (daysSinceCheckIn > 7) {
          priority = 40;
          reason = daysSinceCheckIn > 99 ? "No check-in yet" : `No check-in for ${daysSinceCheckIn} days`;
          action = "Nudge";
          severity = "low";
        } else if (daysSinceCheckIn > 4) {
          priority = 20;
          reason = `Last check-in ${daysSinceCheckIn} days ago`;
          action = "Check in";
          severity = "low";
        }
        return { ...c, priority, reason, action, severity };
      })
      .filter(c => c.priority > 0)
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 8);
  }, [clients, dashboard.atRiskClients]);

  const totalClients = clients.length;

  const getInitials = (name: string) => name.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase();
  const statusLabel = (s: string) => s === "at_risk" ? "At risk" : s === "trial" ? "Trial" : s === "trialing" ? "Trial" : "Active";
  const statusColor = (s: string) => s === "at_risk" ? "var(--danger)" : s === "trial" || s === "trialing" ? "var(--warning)" : "var(--primary)";

  return (
    <div className="page-view">
      {/* â”€â”€ GREETING BANNER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="dash-greeting">
        <div className="dash-greeting-left">
          <h1>Good morning, {session.coach.firstName}.</h1>
          <p>{dayName}, {dateStr} &middot; <span style={{ color: "var(--primary)", fontWeight: 600 }}>{totalClients} clients</span> on your roster</p>
          {atRiskCount > 0 && (
            <div className="dash-attention-badge">
              <span className="material-symbols-outlined" style={{ fontSize: "0.85rem" }}>warning</span>
              {atRiskCount} client{atRiskCount !== 1 ? "s" : ""} need{atRiskCount === 1 ? "s" : ""} your attention today
            </div>
          )}
        </div>
      </div>

      {/* â”€â”€ TODAY'S SESSIONS + STATS ROW â”€â”€â”€â”€ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "2rem", marginBottom: "2rem", alignItems: "start" }}>
        <div className="card">
          <div className="flex items-center justify-between mb-md">
            <h2 style={{ fontFamily: "Manrope, sans-serif", fontWeight: 800, fontSize: "1rem", color: "var(--text-primary)", margin: 0 }}>Today's Sessions</h2>
            <button className="btn-ghost btn-xs" onClick={() => onNav("calendar")}>
              <span className="material-symbols-outlined" style={{ fontSize: "0.85rem" }}>calendar_month</span>
              Calendar
            </button>
          </div>
          {todaySessions.length > 0 ? (
            <div className="flex-col" style={{ gap: "0.25rem" }}>
              {todaySessions.map((s, i) => (
                <div key={i} className="session-row" style={{ cursor: "pointer" }} onClick={() => { onNav("clients"); }}>
                  <span className="session-time">{s.time}</span>
                  <span className="session-name">{s.clientName}</span>
                  <span className="session-type">{s.type}</span>
                  {s.isAtRisk && <span className="badge badge-warning">Risk</span>}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>No sessions scheduled today.</p>
          )}
          <button className="btn-secondary btn-sm" style={{ marginTop: "0.75rem", width: "100%" }} onClick={() => onNav("calendar")}>
            <span className="material-symbols-outlined" style={{ fontSize: "0.9rem" }}>add</span>
            Book Session
          </button>
        </div>

        <div className="card" style={{ minWidth: "240px" }}>
          <h2 style={{ fontFamily: "Manrope, sans-serif", fontWeight: 800, fontSize: "1rem", color: "var(--text-primary)", margin: "0 0 1rem" }}>Quick Stats</h2>
          <div className="stats-strip" style={{ flexDirection: "column", gap: "1rem" }}>
            <div className="stat-chip">
              <span className="stat-chip-label">Active Clients</span>
              <span className="stat-chip-value">{dashboard.activeClients}</span>
            </div>
            <div className="stat-chip">
              <span className="stat-chip-label">MRR</span>
              <span className="stat-chip-value">Â£{mrrGbp.toLocaleString()}</span>
            </div>
            <div className="stat-chip">
              <span className="stat-chip-label">At-Risk</span>
              <span className="stat-chip-value" style={{ color: atRiskCount > 0 ? "var(--warning)" : "var(--primary)" }}>{atRiskCount}</span>
            </div>
            <div className="stat-chip">
              <span className="stat-chip-label">Checked In Today</span>
              <span className="stat-chip-value">{dashboard.checkedInToday}/{totalClients}</span>
            </div>
          </div>
        </div>
      </div>

      {/* â”€â”€ WHO NEEDS ATTENTION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {attentionClients.length > 0 && (
        <div style={{ marginBottom: "2rem" }}>
          <div className="flex items-center justify-between mb-md">
            <h2 style={{ fontFamily: "Manrope, sans-serif", fontWeight: 800, fontSize: "1rem", color: "var(--text-primary)", margin: 0 }}>Who Needs Attention</h2>
            <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.75rem", color: "var(--text-muted)" }}>{attentionClients.length} client{attentionClients.length !== 1 ? "s" : ""} Â· scroll â†’</span>
          </div>
          <div className="h-scroll">
            {attentionClients.map(c => {
              const cardClass = c.severity === "high" ? "attention-card attention-card--danger" : c.severity === "medium" ? "attention-card attention-card--warning" : "attention-card";
              return (
                <div key={c.id} className={cardClass}>
                  <div className="attention-header">
                    <div className="attention-avatar">{getInitials(c.fullName)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="attention-name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.fullName}</div>
                      <div className="attention-reason">{c.reason}</div>
                    </div>
                  </div>
                  {c.adherenceScore !== undefined && (
                    <div className="progress-bar-track" style={{ height: "6px" }}>
                      <div className="progress-bar-fill" style={{ width: `${c.adherenceScore}%`, background: c.adherenceScore < 50 ? "var(--danger)" : c.adherenceScore < 75 ? "var(--warning)" : "var(--primary)" }} />
                    </div>
                  )}
                  <div className="flex items-center gap-sm">
                    <span className={`badge ${c.severity === "high" ? "badge-danger" : c.severity === "medium" ? "badge-warning" : "badge-neutral"}`}>
                      {c.severity === "high" ? "High" : c.severity === "medium" ? "Medium" : "Low"}
                    </span>
                    <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.7rem", color: "var(--text-muted)" }}>{c.action}</span>
                  </div>
                  <button className="attention-action-btn" onClick={() => onSimulateCheckIn(c.id)}>
                    <span className="material-symbols-outlined" style={{ fontSize: "0.85rem" }}>send</span>
                    {c.action}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* â”€â”€ QUICK ACTIONS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="flex items-center gap-md flex-wrap mb-xl">
        <button className="quick-action" onClick={onAddClient}>
          <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>person_add</span>
          Add Client
        </button>
        <button className="quick-action" onClick={() => onNav("ai")}>
          <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>auto_awesome</span>
          Generate Plan
        </button>
        <button className="quick-action" onClick={() => onNav("calendar")}>
          <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>calendar_month</span>
          Book Session
        </button>
        <button className="quick-action" onClick={onLogWorkout}>
          <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>fitness_center</span>
          Log Workout
        </button>
        <button className="quick-action" onClick={onOpenClientNotes}>
          <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>sticky_note_2</span>
          Client Notes
        </button>
      </div>

      {/* â”€â”€ ALL CLIENTS TABLE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="card">
        <div className="flex items-center justify-between mb-md">
          <h2 style={{ fontFamily: "Manrope, sans-serif", fontWeight: 800, fontSize: "1rem", color: "var(--text-primary)", margin: 0 }}>All Clients</h2>
          <button className="btn-ghost btn-xs" onClick={() => onNav("clients")}>
            View all
            <span className="material-symbols-outlined" style={{ fontSize: "0.85rem" }}>arrow_forward</span>
          </button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="compact-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Status</th>
                <th>Adherence</th>
                <th>Last Check-In</th>
                <th>Renewal</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clients.slice(0, 15).map(c => {
                const risk = dashboard.atRiskClients.find(a => a.clientId === c.id);
                const lastCheckIn = c.lastCheckInDate
                  ? new Date(c.lastCheckInDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                  : "Never";
                const renewal = c.nextRenewalDate
                  ? new Date(c.nextRenewalDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                  : "â€”";
                const sub = session.subscriptions.find(s => s.clientId === c.id);
                return (
                  <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => { onNav("clients"); }}>
                    <td>
                      <div className="flex items-center gap-sm">
                        <div style={{ width: "28px", height: "28px", borderRadius: "var(--r-sm)", background: "linear-gradient(135deg, var(--success-light) 0%, var(--primary-light) 100%)", display: "grid", placeItems: "center", fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "0.65rem", color: "var(--primary-dark)", flexShrink: 0 }}>
                          {getInitials(c.fullName)}
                        </div>
                        <span style={{ fontFamily: "Manrope, sans-serif", fontWeight: 600, color: "var(--text-primary)", fontSize: "0.85rem" }}>{c.fullName}</span>
                      </div>
                    </td>
                    <td>
                      <span style={{ color: statusColor(c.status), fontWeight: 600 }}>{statusLabel(c.status)}</span>
                      {risk && <span style={{ marginLeft: "0.35rem", fontFamily: "Inter, sans-serif", fontSize: "0.65rem", color: "var(--danger)", fontWeight: 700 }}>â€¢</span>}
                    </td>
                    <td>
                      <div className="flex items-center gap-sm">
                        <div className="progress-bar-track" style={{ width: "60px", height: "5px" }}>
                          <div className="progress-bar-fill" style={{ width: `${c.adherenceScore}%`, background: c.adherenceScore < 50 ? "var(--danger)" : c.adherenceScore < 75 ? "var(--warning)" : "var(--primary)" }} />
                        </div>
                        <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.75rem", fontWeight: 600, color: c.adherenceScore < 50 ? "var(--danger)" : c.adherenceScore < 75 ? "var(--warning)" : "var(--primary)" }}>{c.adherenceScore}%</span>
                      </div>
                    </td>
                    <td style={{ fontFamily: "Inter, sans-serif", fontSize: "0.8rem" }}>
                      {lastCheckIn}
                      {!c.lastCheckInDate && <span style={{ color: "var(--danger)", marginLeft: "0.25rem" }}>!</span>}
                    </td>
                    <td style={{ fontFamily: "Inter, sans-serif", fontSize: "0.8rem" }}>
                      {renewal}
                      {sub && <span style={{ marginLeft: "0.25rem", color: "var(--text-muted)", fontSize: "0.7rem" }}>Â£{sub.amountGbp}</span>}
                    </td>
                    <td>
                      <button className="btn-icon btn-xs" onClick={(e) => { e.stopPropagation(); onSimulateCheckIn(c.id); }} title="Send nudge" style={{ background: "none" }}>
                        <span className="material-symbols-outlined" style={{ fontSize: "0.9rem", color: "var(--primary)" }}>send</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
              {clients.length > 15 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "0.75rem", fontFamily: "Inter, sans-serif", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    +{clients.length - 15} more clients â€” <button onClick={() => onNav("clients")} style={{ background: "none", border: "none", color: "var(--primary)", cursor: "pointer", fontWeight: 700, fontFamily: "Inter, sans-serif", fontSize: "0.8rem", padding: 0 }}>view all</button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   ADD CLIENT MODAL
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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
      push("Network error â€” please check your connection.", "error");
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
                placeholder="e.g. Lose 5kg body fat, build strength, run a marathonâ€¦"
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
                <span className="input-prefix">Â£</span>
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
                  Adding Clientâ€¦
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


// â”€â”€ CLIENTS VIEW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ClientsView({
  session,
  onOpenClient,
  onAddClient,
  onStartSession,
  onBookSession,
  push,
}: {
  session: CoachSession;
  onOpenClient: (id: string) => void;
  onAddClient?: () => void;
  onStartSession?: (client: { id: string; fullName: string }) => void;
  onBookSession?: (session: BookedSession) => void;
  push: (message: string, type?: ToastType, opts?: { title?: string; action?: { label: string; onClick: () => void }; duration?: number }) => number;
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

  const [profileClientId, setProfileClientId] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  if (profileClientId) {
    if (profileError) {
      return (
    <div className="page-view ai-coach-bg">
          <div style={{ textAlign: "center", padding: "4rem 2rem" }}>
            <p style={{ color: "var(--danger)", fontFamily: "Inter, sans-serif", marginBottom: "1rem" }}>Error loading profile: {profileError}</p>
            <button className="btn-ghost" onClick={() => { setProfileClientId(null); setProfileError(null); }}>? Back to Clients</button>
          </div>
        </div>
      );
    }
    return (
      <ErrorBoundary onError={(e) => setProfileError(e)}>
        <ClientCommandCenter
          clientId={profileClientId}
          clients={session.clients}
          onBack={() => { setProfileClientId(null); onOpenClient(""); }}
          push={(msg, type) => { push(msg, (type ?? 'success') as ToastType); }}
        />
      </ErrorBoundary>
    );
  }

  const rosterStatusLabel = filterStatus === "all" ? "active high-performers"
    : filterStatus === "active" ? "active clients"
    : filterStatus === "at_risk" ? "at-risk clients"
    : "trial clients";

  return (
    <div className="page-view">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "2rem", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: "Manrope, sans-serif", fontSize: "2.25rem", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: "0.35rem" }}>
            Client Roster
          </h1>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: "0.875rem", color: "var(--on-surface-variant)", fontWeight: 500 }}>
            Curating growth for {activeClients} {rosterStatusLabel}.
          </p>
        </div>
        <div className="flex items-center gap-md flex-wrap">
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
          <div className="search-wrapper">
            <span className="search-icon material-symbols-outlined">search</span>
            <input
              className="input"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search clients, goalsâ€¦"
              style={{ width: "200px", fontSize: "0.8rem", padding: "0.5rem 1rem 0.5rem 2.5rem" }}
            />
          </div>
        </div>
      </div>

      {/* Client cards grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1.5rem", marginBottom: "3rem" }}>
        {filtered.map(client => {
          const ini = client.fullName.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase();
          const adhColor = client.adherenceScore < 50 ? "var(--danger)"
            : client.adherenceScore < 75 ? "var(--warning)"
            : "var(--primary)";
          const cardBadgeClass = client.status === "at_risk" ? "badge-danger"
            : client.status === "trial" ? "badge-warning"
            : "badge-success";
          const cardStatusLabel = client.status === "at_risk" ? "At Risk"
            : client.status === "trial" ? "Trial" : "Active";
          const cardAvBg = client.status === "at_risk" ? "var(--danger-light)"
            : client.status === "trial" ? "var(--warning-light)"
            : "var(--primary-light)";
          const cardAvColor = client.status === "at_risk" ? "var(--danger-text)"
            : client.status === "trial" ? "var(--warning-text)"
            : "var(--primary-dark)";
          const cardRiskClass = client.status === "at_risk" ? "client-card--at-risk"
            : client.status === "trial" ? "client-card--trial"
            : "client-card--active";

          return (
            <div
              key={client.id}
              className={`client-card ${cardRiskClass}`}
              onClick={() => { setProfileClientId(client.id); onOpenClient(client.id); }}
            >
              <div className="flex items-center justify-between" style={{ marginBottom: "1.25rem" }}>
                <div className="flex items-center gap-md">
                  <div className="attention-avatar" style={{ width: 52, height: 52, borderRadius: "var(--r-lg)", background: cardAvBg, color: cardAvColor, fontSize: "0.95rem" }}>
                    {ini}
                  </div>
                  <div>
                    <div className="attention-name">{client.fullName}</div>
                    <span className={`badge ${cardBadgeClass}`} style={{ marginTop: "0.2rem" }}>{cardStatusLabel}</span>
                  </div>
                </div>
                <div style={{ fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: "0.85rem", color: "var(--text-primary)", textAlign: "right" }}>
                  Â£{client.monthlyPriceGbp}<span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: "0.7rem" }}>/mo</span>
                </div>
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <div className="stat-chip-label" style={{ marginBottom: "0.35rem" }}>Current Goal</div>
                <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.8rem", color: "var(--on-surface-variant)", fontWeight: 500, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {client.goal}
                </div>
              </div>

              <div style={{ marginBottom: "1.25rem" }}>
                <div className="flex items-center justify-between" style={{ marginBottom: "0.35rem" }}>
                  <span className="stat-chip-label" style={{ margin: 0 }}>Adherence</span>
                  <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.7rem", fontWeight: 700, color: adhColor }}>{client.adherenceScore}%</span>
                </div>
                <div className="progress-bar-track" style={{ height: 6 }}>
                  <div className={`progress-bar-fill${client.adherenceScore < 50 ? " progress-bar-fill--danger" : client.adherenceScore < 75 ? " progress-bar-fill--warning" : ""}`} style={{ width: `${client.adherenceScore}%` }} />
                </div>
              </div>

              <div style={{ paddingTop: "0.85rem", borderTop: "1px solid var(--surface-container)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.7rem", color: client.status === "at_risk" ? "var(--danger)" : "var(--text-muted)", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.25rem" }}>
                  {client.status === "at_risk" ? (
                    <><span className="material-symbols-outlined" style={{ fontSize: "0.85rem" }}>warning</span> Needs attention</>
                  ) : client.status === "trial" ? "Trial active" : "On track"}
                </span>
                <span className="flex items-center gap-sm" style={{ fontFamily: "Inter, sans-serif", fontSize: "0.72rem", color: "var(--primary)", fontWeight: 700 }}>
                  View Profile <span className="material-symbols-outlined" style={{ fontSize: "0.8rem" }}>arrow_forward</span>
                </span>
              </div>
            </div>
          );
        })}

        <div
          onClick={onAddClient ?? (() => onOpenClient(""))}
          className="program-create-card"
          style={{ borderRadius: "var(--r-xl)", border: "2px dashed var(--outline-variant)", minHeight: "220px" }}
        >
          <span className="material-symbols-outlined program-create-card-icon" style={{ color: "var(--primary)" }}>person_add</span>
          <p className="program-create-card-label" style={{ color: "var(--primary)" }}>Onboard New Client</p>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: "0.75rem", color: "var(--on-surface-variant)", maxWidth: "160px", textAlign: "center", margin: 0 }}>
            Start a new coaching journey today.
          </p>
        </div>
      </div>

      {filtered.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "3rem", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--surface-container)", paddingTop: "2rem" }}>
          <div style={{ display: "flex", gap: "3rem" }}>
            <div>
              <div className="stat-chip-label" style={{ marginBottom: "0.25rem" }}>Total Monthly Revenue</div>
              <div className="stat-chip-value">Â£{mrr.toLocaleString()}</div>
            </div>
            <div>
              <div className="stat-chip-label" style={{ marginBottom: "0.25rem" }}>Avg. Adherence</div>
              <div className="stat-chip-value" style={{ color: avgAdherence < 60 ? "var(--warning)" : "var(--primary)" }}>{avgAdherence}%</div>
            </div>
            <div>
              <div className="stat-chip-label" style={{ marginBottom: "0.25rem" }}>Total Clients</div>
              <div className="stat-chip-value">{session.clients.length}</div>
            </div>
          </div>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.7rem", color: "var(--on-surface-variant)", fontWeight: 500 }}>
            Showing {filtered.length} of {session.clients.length}
          </div>
        </div>
      )}
    </div>
  );
}

// ── PLANS VIEW (AI Plan Generator) ──────────────────────
function PlansView({ session, onNav }: { session: CoachSession; onNav: (id: NavId) => void }) {
  const [selectedClientId, setSelectedClientId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [activePlan, setActivePlan] = useState<ProgramPlan | null>(null);
  const [editingWorkoutIdx, setEditingWorkoutIdx] = useState<number | null>(null);
  const [editingNutritionIdx, setEditingNutritionIdx] = useState<number | null>(null);
  const [editedWorkouts, setEditedWorkouts] = useState<string[]>([]);
  const [editedNutrition, setEditedNutrition] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);

  const sortedClients = useMemo(() =>
    [...session.clients].sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [session.clients]
  );

  useEffect(() => {
    if (!activePlan) return;
    setEditedWorkouts([...activePlan.latestVersion.workouts]);
    setEditedNutrition([...activePlan.latestVersion.nutrition]);
    setEditingWorkoutIdx(null);
    setEditingNutritionIdx(null);
  }, [activePlan]);

  const handleGenerate = async () => {
    if (!selectedClientId) return;
    setGenerating(true);
    try {
      const plan = await fetchJson<ProgramPlan>(`/plans/generate`, {
        method: "POST",
        body: JSON.stringify({ clientId: selectedClientId }),
      });
      setActivePlan(plan);
    } catch {
      alert("Failed to generate plan. Is the API running?");
    } finally {
      setGenerating(false);
    }
  };

  const handleApprove = async () => {
    if (!activePlan) return;
    setApproving(true);
    try {
      const approved = await fetchJson<ProgramPlan>(`/plans/${activePlan.id}/approve`, { method: "POST" });
      setActivePlan(approved);
    } catch {
      alert("Failed to approve plan.");
    } finally {
      setApproving(false);
    }
  };

  const handleSave = async () => {
    if (!activePlan) return;
    setSaving(true);
    try {
      const updated = await fetchJson<ProgramPlan>(`/plans/${activePlan.id}`, {
        method: "PATCH",
        body: JSON.stringify({ workouts: editedWorkouts, nutrition: editedNutrition }),
      });
      setActivePlan(updated);
      setEditingWorkoutIdx(null);
      setEditingNutritionIdx(null);
    } catch {
      alert("Failed to save changes.");
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = activePlan && (
    JSON.stringify(editedWorkouts) !== JSON.stringify(activePlan.latestVersion.workouts) ||
    JSON.stringify(editedNutrition) !== JSON.stringify(activePlan.latestVersion.nutrition)
  );

  const isDraft = activePlan?.latestVersion.status === "draft";
  const statusBadge = activePlan
    ? { draft: { bg: "#fef3c7", color: "#d97706", text: "Draft" }, approved: { bg: "#d1fae5", color: "#059669", text: "Approved" } }[activePlan.latestVersion.status]
    : null;

  return (
    <div className="page-view plans-chat-view">
      <div style={{ padding: "2rem 2rem 0", maxWidth: "900px", margin: "0 auto" }}>
        <div className="plans-chat-header">
          <h1 className="plans-chat-title">
            AI Plan Generator
          </h1>
          <p className="plans-chat-subtitle">Select a client and let DeepSeek draft a training &amp; nutrition plan.</p>
        </div>

        {/* Client Selector */}
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", marginBottom: "1.5rem" }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontFamily: "Inter, sans-serif", fontSize: "0.75rem", fontWeight: 600, color: "var(--on-surface-variant)", display: "block", marginBottom: "0.35rem" }}>Client</label>
            <select
              value={selectedClientId}
              onChange={e => { setSelectedClientId(e.target.value); setActivePlan(null); }}
              style={{ width: "100%", padding: "0.6rem 0.75rem", borderRadius: "var(--r-md)", border: "1.5px solid var(--outline-variant)", background: "white", fontFamily: "Inter, sans-serif", fontSize: "0.85rem", color: "var(--text-primary)", boxSizing: "border-box" }}
            >
              <option value="">â€” Select a client â€”</option>
              {sortedClients.map(c => (
                <option key={c.id} value={c.id}>{c.fullName} â€” {c.goal}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleGenerate}
            disabled={!selectedClientId || generating}
            style={{ padding: "0.6rem 1.5rem", borderRadius: "var(--r-md)", border: "none", background: generating ? "var(--outline)" : "var(--primary)", color: "white", fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "0.85rem", cursor: (!selectedClientId || generating) ? "not-allowed" : "pointer", whiteSpace: "nowrap", opacity: (!selectedClientId || generating) ? 0.6 : 1 }}
          >
            {generating ? "Generating..." : "Generate AI Plan"}
            <span className="material-symbols-outlined" style={{ fontSize: "1rem", verticalAlign: "middle", marginLeft: "0.35rem" }}>auto_awesome</span>
          </button>
        </div>

        {/* Plan Display */}
        {activePlan && (
          <div style={{ background: "white", border: "1px solid rgba(0,0,0,0.06)", borderRadius: "16px", padding: "1.5rem", marginBottom: "1.5rem", boxShadow: "0 4px 16px rgba(24,28,28,0.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <h2 style={{ fontFamily: "Manrope, sans-serif", fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{activePlan.title}</h2>
                {statusBadge && (
                  <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", padding: "0.15rem 0.5rem", borderRadius: "9999px", background: statusBadge.bg, color: statusBadge.color }}>
                    {statusBadge.text}
                  </span>
                )}
              </div>
              <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.7rem", color: "var(--on-surface-variant)" }}>
                v{activePlan.latestVersion.versionNumber} &middot; {new Date(activePlan.latestVersion.updatedAt).toLocaleDateString()}
              </span>
            </div>

            {activePlan.latestVersion.explanation.length > 0 && (
              <div style={{ background: "var(--surface-container)", borderRadius: "var(--r-md)", padding: "0.75rem 1rem", marginBottom: "1.25rem" }}>
                {activePlan.latestVersion.explanation.map((line, i) => (
                  <p key={i} style={{ fontFamily: "Inter, sans-serif", fontSize: "0.8rem", color: "var(--text-primary)", margin: i === 0 ? 0 : "0.35rem 0 0 0", lineHeight: 1.5 }}>{line}</p>
                ))}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
              {/* Workouts */}
              <div>
                <h3 style={{ fontFamily: "Manrope, sans-serif", fontSize: "0.9rem", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 0.75rem 0", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: "1.1rem", color: "var(--primary)" }}>fitness_center</span>
                  Workouts
                </h3>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {editedWorkouts.map((w, i) => (
                    <li key={i} style={{ marginBottom: "0.5rem" }}>
                      {editingWorkoutIdx === i ? (
                        <div style={{ display: "flex", gap: "0.35rem" }}>
                          <input
                            autoFocus
                            value={w}
                            onChange={e => setEditedWorkouts(prev => prev.map((x, j) => j === i ? e.target.value : x))}
                            onKeyDown={e => { if (e.key === "Enter") setEditingWorkoutIdx(null); if (e.key === "Escape") { setEditedWorkouts([...activePlan.latestVersion.workouts]); setEditingWorkoutIdx(null); } }}
                            style={{ flex: 1, padding: "0.35rem 0.5rem", borderRadius: "var(--r-sm)", border: "1.5px solid var(--primary)", background: "white", fontFamily: "Inter, sans-serif", fontSize: "0.8rem", color: "var(--text-primary)" }}
                          />
                          <button onClick={() => setEditingWorkoutIdx(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--primary)", padding: "0 0.25rem" }}><span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>check</span></button>
                        </div>
                      ) : (
                        <div
                          onClick={() => setEditingWorkoutIdx(i)}
                          style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", padding: "0.4rem 0.6rem", borderRadius: "var(--r-sm)", cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: "0.82rem", color: "var(--text-primary)", lineHeight: 1.4, background: "var(--surface-container)", border: "1px solid transparent", transition: "border-color 0.15s" }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--primary-light)"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "transparent"; }}
                          title="Click to edit"
                        >
                          <span style={{ color: "var(--outline)", flexShrink: 0, marginTop: 1 }}>{i + 1}.</span>
                          <span>{w}</span>
                        </div>
                      )}
                    </li>
                  ))}
                  <li>
                    <button
                      onClick={() => { setEditedWorkouts(prev => [...prev, ""]); setEditingWorkoutIdx(editedWorkouts.length); }}
                      style={{ background: "none", border: "1.5px dashed var(--outline-variant)", borderRadius: "var(--r-sm)", padding: "0.35rem 0.6rem", cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: "0.75rem", color: "var(--on-surface-variant)", width: "100%", textAlign: "left" }}
                    >
                      + Add workout line
                    </button>
                  </li>
                </ul>
              </div>

              {/* Nutrition */}
              <div>
                <h3 style={{ fontFamily: "Manrope, sans-serif", fontSize: "0.9rem", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 0.75rem 0", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: "1.1rem", color: "var(--primary)" }}>restaurant</span>
                  Nutrition
                </h3>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {editedNutrition.map((n, i) => (
                    <li key={i} style={{ marginBottom: "0.5rem" }}>
                      {editingNutritionIdx === i ? (
                        <div style={{ display: "flex", gap: "0.35rem" }}>
                          <input
                            autoFocus
                            value={n}
                            onChange={e => setEditedNutrition(prev => prev.map((x, j) => j === i ? e.target.value : x))}
                            onKeyDown={e => { if (e.key === "Enter") setEditingNutritionIdx(null); if (e.key === "Escape") { setEditedNutrition([...activePlan.latestVersion.nutrition]); setEditingNutritionIdx(null); } }}
                            style={{ flex: 1, padding: "0.35rem 0.5rem", borderRadius: "var(--r-sm)", border: "1.5px solid var(--primary)", background: "white", fontFamily: "Inter, sans-serif", fontSize: "0.8rem", color: "var(--text-primary)" }}
                          />
                          <button onClick={() => setEditingNutritionIdx(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--primary)", padding: "0 0.25rem" }}><span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>check</span></button>
                        </div>
                      ) : (
                        <div
                          onClick={() => setEditingNutritionIdx(i)}
                          style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", padding: "0.4rem 0.6rem", borderRadius: "var(--r-sm)", cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: "0.82rem", color: "var(--text-primary)", lineHeight: 1.4, background: "var(--surface-container)", border: "1px solid transparent", transition: "border-color 0.15s" }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--primary-light)"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "transparent"; }}
                          title="Click to edit"
                        >
                          <span style={{ color: "var(--outline)", flexShrink: 0, marginTop: 1 }}>{i + 1}.</span>
                          <span>{n}</span>
                        </div>
                      )}
                    </li>
                  ))}
                  <li>
                    <button
                      onClick={() => { setEditedNutrition(prev => [...prev, ""]); setEditingNutritionIdx(editedNutrition.length); }}
                      style={{ background: "none", border: "1.5px dashed var(--outline-variant)", borderRadius: "var(--r-sm)", padding: "0.35rem 0.6rem", cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: "0.75rem", color: "var(--on-surface-variant)", width: "100%", textAlign: "left" }}
                    >
                      + Add nutrition line
                    </button>
                  </li>
                </ul>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem", paddingTop: "1.25rem", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
              <button
                onClick={handleSave}
                disabled={!hasChanges || saving}
                style={{ padding: "0.55rem 1.25rem", borderRadius: "var(--r-md)", border: "1.5px solid var(--outline-variant)", background: "white", color: (!hasChanges || saving) ? "var(--outline)" : "var(--text-primary)", fontFamily: "Manrope, sans-serif", fontWeight: 600, fontSize: "0.8rem", cursor: (!hasChanges || saving) ? "not-allowed" : "pointer" }}
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
              {isDraft && (
                <button
                  onClick={handleApprove}
                  disabled={approving}
                  style={{ padding: "0.55rem 1.75rem", borderRadius: "var(--r-md)", border: "none", background: approving ? "var(--outline)" : "var(--primary)", color: "white", fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "0.8rem", cursor: approving ? "not-allowed" : "pointer" }}
                >
                  {approving ? "Approving..." : "Approve Plan"}
                  <span className="material-symbols-outlined" style={{ fontSize: "1rem", verticalAlign: "middle", marginLeft: "0.35rem" }}>verified</span>
                </button>
              )}
            </div>
          </div>
        )}

        {!activePlan && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "3rem 2rem", textAlign: "center", background: "white", border: "1px solid rgba(0,0,0,0.06)", borderRadius: "16px" }}>
            <span className="material-symbols-outlined" style={{ fontSize: "3rem", color: "var(--primary)", opacity: 0.3, marginBottom: "1rem" }}>auto_awesome</span>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: "0.9rem", color: "var(--on-surface-variant)", margin: 0, maxWidth: "400px" }}>
              Choose a client from the dropdown above and click "Generate AI Plan" to create a personalised training and nutrition programme.
            </p>
          </div>
        )}

        {/* Quick nav to client portal */}
        {activePlan && (
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <button
              onClick={() => onNav("clients")}
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: "0.8rem", color: "var(--primary)", fontWeight: 600 }}
            >
              Open Client Directory to assign plan &rarr;
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// â”€â”€ CLIENT PORTAL VIEW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  const [editing, setEditing] = useState<{
    goal?: boolean;
    health?: boolean;
    nutrition?: boolean;
    water?: boolean;
    steps?: boolean;
    supplements?: boolean;
  }>({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [tempHealth, setTempHealth] = useState<{ label: string; note: string }[]>([]);
  const [tempSupplements, setTempSupplements] = useState("");
  const [newHealthLabel, setNewHealthLabel] = useState("");
  const [newHealthNote, setNewHealthNote] = useState("");
  const [activeTab, setActiveTab] = useState<"plan"|"meal"|"workout"|"messages"|"history">("plan");
  const [showPhotos, setShowPhotos] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  // Meal Planner state
  const [mealWeekOffset, setMealWeekOffset] = useState(0);
  const [editingMeal, setEditingMeal] = useState<{ day: string; slot: string } | null>(null);
  const [showArchitect, setShowArchitect] = useState(true);
  const [mealWeek, setMealWeek] = useState([
    { name: "Mon", meals: [
      { slot: "Breakfast", name: "Greek Yogurt with Berries", cal: 320, protein: 24 },
      { slot: "Lunch", name: "Grilled Salmon Salad", cal: 480, protein: 38 },
      { slot: "Snacks", name: "Almonds & Apple", cal: 210, protein: 6 },
      { slot: "Dinner", name: "Sesame Tofu Stir-fry", cal: 540, protein: 22 },
    ]},
    { name: "Tue", meals: [
      { slot: "Breakfast", name: "Oatmeal with Banana", cal: 380, protein: 12 },
      { slot: "Lunch", name: "Chicken Quinoa Bowl", cal: 520, protein: 42 },
      { slot: "Snacks", name: "Greek Yogurt", cal: 150, protein: 15 },
      { slot: "Dinner", name: "Baked Cod & Asparagus", cal: 430, protein: 40 },
    ]},
    { name: "Wed", meals: [
      { slot: "Breakfast", name: "Avocado Toast & Eggs", cal: 450, protein: 20 },
      { slot: "Lunch", name: "Turkey & Hummus Wrap", cal: 490, protein: 35 },
      { slot: "Snacks", name: "Mixed Nuts & Dates", cal: 280, protein: 8 },
      { slot: "Dinner", name: "Lean Beef Stir-fry", cal: 580, protein: 45 },
    ]},
    { name: "Thu", meals: [
      { slot: "Breakfast", name: "Protein Smoothie Bowl", cal: 340, protein: 30 },
      { slot: "Lunch", name: "Tuna Nicoise Salad", cal: 420, protein: 40 },
      { slot: "Snacks", name: "Rice Cakes & Almond Butter", cal: 180, protein: 5 },
      { slot: "Dinner", name: "â€”", cal: 0, protein: 0 },
    ]},
    { name: "Fri", meals: [
      { slot: "Breakfast", name: "â€”", cal: 0, protein: 0 },
      { slot: "Lunch", name: "â€”", cal: 0, protein: 0 },
      { slot: "Snacks", name: "â€”", cal: 0, protein: 0 },
      { slot: "Dinner", name: "â€”", cal: 0, protein: 0 },
    ]},
    { name: "Sat", meals: [
      { slot: "Breakfast", name: "â€”", cal: 0, protein: 0 },
      { slot: "Lunch", name: "â€”", cal: 0, protein: 0 },
      { slot: "Snacks", name: "â€”", cal: 0, protein: 0 },
      { slot: "Dinner", name: "â€”", cal: 0, protein: 0 },
    ]},
    { name: "Sun", meals: [
      { slot: "Breakfast", name: "â€”", cal: 0, protein: 0 },
      { slot: "Lunch", name: "â€”", cal: 0, protein: 0 },
      { slot: "Snacks", name: "â€”", cal: 0, protein: 0 },
      { slot: "Dinner", name: "â€”", cal: 0, protein: 0 },
    ]},
  ]);
  const [savingMeal, setSavingMeal] = useState(false);
  const [foodSearch, setFoodSearch] = useState("");
  const [foodSuggestions, setFoodSuggestions] = useState<string[]>([]);
  const [searchingFood, setSearchingFood] = useState(false);

  // Profile section save handler
  const startEdit = useCallback((section: keyof typeof editing) => {
    if (!clientPortal) return;
    const c = clientPortal.client as any;
    setTempHealth([...(c.healthConditions ?? [])]);
    setTempSupplements((c.supplements ?? []).join(", "));
    setEditing({ [section]: true });
  }, [clientPortal]);

  const cancelEdit = useCallback(() => {
    setEditing({});
    setTempHealth([]);
    setTempSupplements("");
    setNewHealthLabel("");
    setNewHealthNote("");
  }, []);

  const saveProfile = useCallback(async (patch: ClientProfilePatch) => {
    setSavingProfile(true);
    try {
      await onSaveEdits(patch);
      setEditing({});
    } finally {
      setSavingProfile(false);
    }
  }, [onSaveEdits]);

  // Load nutrition from plan into mealWeek
  useEffect(() => {
    const nutrition = clientPortal?.plan?.latestVersion?.nutrition;
    if (!nutrition || nutrition.length === 0) return;
    try {
      const parsed = JSON.parse(nutrition[0]);
      if (Array.isArray(parsed) && parsed.length > 0 && Array.isArray(parsed[0]?.meals)) {
        setMealWeek(parsed);
      }
    } catch { /* keep default */ }
  }, [clientPortal?.plan]);

  // Food search
  useEffect(() => {
    if (!foodSearch.trim()) { setFoodSuggestions([]); return; }
    setSearchingFood(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetchJson<{name?: string; recipes?: string[]}>(`/recipes?food=${encodeURIComponent(foodSearch)}`);
        setFoodSuggestions(Array.isArray(res) ? res.slice(0, 5) : (res?.recipes ?? []));
      } catch { setFoodSuggestions([]); }
      finally { setSearchingFood(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [foodSearch]);

  const saveMealPlan = async () => {
    if (!clientPortal?.plan) return;
    setSavingMeal(true);
    try {
      const nutritionStrings = mealWeek.map(day =>
        `${day.name}: ${day.meals.filter(m => m.name !== "â€”").map(m => `${m.slot} â€” ${m.name} (${m.cal} cal, ${m.protein}g protein)`).join(" | ")}`
      );
      await fetchJson<any>(`/plans/${clientPortal.plan.id}`, { method: "PATCH", body: JSON.stringify({ nutrition: nutritionStrings }) });
      push("Meal plan saved to client profile!", "success");
    } catch { push("Failed to save meal plan", "error"); }
    finally { setSavingMeal(false); }
  };

  // Workout Plan state
  const [workoutExercises, setWorkoutExercises] = useState([
    { id: 1, name: "Jumping Jacks", tag: "Metabolic / Plyometric", sets: "3 Sets of 50", duration: "60 Seconds", advanced: "" },
    { id: 2, name: "High Knees", tag: "Agility / Power", sets: "Per Set: 30", duration: "45 Seconds", advanced: "Ankle Weights 1kg" },
    { id: 3, name: "Butt Kicks", tag: "Metabolic / Warmup", sets: "Fixed: 40", duration: "30 Seconds", advanced: "" },
  ]);
  const [workoutDiscarded, setWorkoutDiscarded] = useState(false);
  const [savingWorkout, setSavingWorkout] = useState(false);
  const [exerciseLibrary, setExerciseLibrary] = useState<{id:string;name:string;bodyPart:string;equipment:string}[]>([]);
  const [exerciseSearch, setExerciseSearch] = useState("");
  const [exerciseFilter, setExerciseFilter] = useState("all");
  const [loadingExercises, setLoadingExercises] = useState(false);

  // Load exercises when workout tab is active
  useEffect(() => {
    if (activeTab !== "workout") return;
    setLoadingExercises(true);
    fetchJson<{id:string;name:string;bodyPart:string;equipment:string}[]>(`/exercises`).then(exs => {
      setExerciseLibrary(exs);
    }).catch(() => {}).finally(() => setLoadingExercises(false));
  }, [activeTab]);

  const filteredExercises = exerciseLibrary.filter(e => {
    const matchesSearch = !exerciseSearch || e.name.toLowerCase().includes(exerciseSearch.toLowerCase());
    const matchesFilter = exerciseFilter === "all" || e.bodyPart?.toLowerCase() === exerciseFilter.toLowerCase();
    return matchesSearch && matchesFilter;
  });

  // Load workout exercises from plan when portal loads
  useEffect(() => {
    const workouts = clientPortal?.plan?.latestVersion?.workouts;
    if (!workouts || workouts.length === 0) return;
    try {
      // Try parsing as JSON exercise objects
      const parsed = JSON.parse(workouts[0]);
      if (Array.isArray(parsed)) {
        setWorkoutExercises(parsed.map((ex, i) => ({ ...ex, id: ex.id ?? i + 1 })));
      }
    } catch {
      // Fallback: convert legacy string array to exercise objects
      setWorkoutExercises(workouts.map((w, i) => ({
        id: i + 1, name: w, tag: "Custom", sets: "3 Sets of 12", duration: "45 Seconds", advanced: ""
      })));
    }
  }, [clientPortal?.plan]);

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
          {activeTab === "plan" && clientPortal && (
            <div>
              <div className="portal-dashboard-row">
                {/* PRIMARY GOAL */}
                <div className="portal-goal-card">
                  <div className="portal-goal-header">
                    <div>
                      <div className="portal-goal-title">Primary Goal</div>
                      {editing.goal ? (
                        <input
                          autoFocus
                          id="edit-goal"
                          defaultValue={(clientPortal.client as any).goal}
                          style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)", background: "var(--surface-container)", border: "1.5px solid var(--primary)", borderRadius: "var(--r-sm)", padding: "0.2rem 0.5rem", width: "100%", maxWidth: 260 }}
                          onKeyDown={e => { if (e.key === "Enter") saveProfile({ goal: (document.getElementById("edit-goal") as HTMLInputElement).value }); if (e.key === "Escape") cancelEdit(); }}
                        />
                      ) : (
                        <div className="portal-goal-text">{(clientPortal.client as any).goal || "Not set â€” click edit to add"}</div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
                      {editing.goal ? (
                        <>
                          <button onClick={() => saveProfile({ goal: (document.getElementById("edit-goal") as HTMLInputElement).value })} disabled={savingProfile} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--primary)", display: "grid", placeItems: "center" }} title="Save"><span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>check</span></button>
                          <button onClick={cancelEdit} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--outline)", display: "grid", placeItems: "center" }} title="Cancel"><span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>close</span></button>
                        </>
                      ) : (
                        <button onClick={() => startEdit("goal")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--outline)", display: "grid", placeItems: "center" }} title="Edit goal"><span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>edit</span></button>
                      )}
                      <span className="material-symbols-outlined" style={{ color: "var(--primary)", fontSize: "1.5rem" }}>track_changes</span>
                    </div>
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

                {/* HEALTH & CONSIDERATIONS */}
                <div className="portal-health-card">
                  <div className="portal-health-header">
                    <span className="material-symbols-outlined" style={{ color: "var(--tertiary)", fontSize: "1.1rem" }}>medical_services</span>
                    <h4>Health &amp; Considerations</h4>
                    <div style={{ marginLeft: "auto", display: "flex", gap: "0.2rem" }}>
                      {editing.health ? (
                        <>
                          <button onClick={() => saveProfile({ healthConditions: tempHealth })} disabled={savingProfile} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--primary)", display: "grid", placeItems: "center" }} title="Save"><span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>check</span></button>
                          <button onClick={cancelEdit} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--outline)", display: "grid", placeItems: "center" }} title="Cancel"><span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>close</span></button>
                        </>
                      ) : (
                        <button onClick={() => startEdit("health")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--outline)", display: "grid", placeItems: "center" }} title="Edit health"><span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>edit</span></button>
                      )}
                    </div>
                  </div>
                  {editing.health ? (
                    <div>
                      {tempHealth.map((h, i) => (
                        <div key={i} style={{ marginBottom: "0.6rem", padding: "0.5rem", background: "var(--surface-container)", borderRadius: "var(--r-sm)", borderLeft: "3px solid var(--tertiary)" }}>
                          <input value={h.label} placeholder="Condition (e.g. Knee injury)" style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "0.78rem", background: "transparent", border: "none", borderBottom: "1px solid var(--outline-variant)", padding: "0.1rem 0", width: "100%", color: "var(--text-primary)", display: "block" }} onChange={e => { const n = [...tempHealth]; n[i] = { label: e.target.value, note: n[i].note }; setTempHealth(n); }} />
                          <input value={h.note} placeholder="Coach note..." style={{ fontFamily: "Inter, sans-serif", fontSize: "0.72rem", background: "transparent", border: "none", padding: "0.1rem 0", width: "100%", color: "var(--on-surface-variant)", display: "block", marginTop: "0.2rem" }} onChange={e => { const n = [...tempHealth]; n[i] = { label: n[i].label, note: e.target.value }; setTempHealth(n); }} />
                          <button onClick={() => setTempHealth(n => n.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)", fontSize: "0.7rem", padding: "0.1rem 0", marginTop: "0.2rem" }}>Remove</button>
                        </div>
                      ))}
                      <button onClick={() => setTempHealth(n => [...n, { label: "", note: "" }])} style={{ background: "none", border: "1px dashed var(--outline-variant)", borderRadius: "var(--r-sm)", padding: "0.3rem 0.6rem", fontSize: "0.72rem", color: "var(--primary)", cursor: "pointer", fontFamily: "Inter, sans-serif" }}>+ Add condition</button>
                    </div>
                  ) : (
                    <div>
                      {((clientPortal.client as any).healthConditions?.length > 0
                        ? (clientPortal.client as any).healthConditions
                        : [{ label: "No health conditions recorded", note: "Click the edit icon above to add health considerations for this client" }]
                      ).map((h: any, i: number) => (
                        <div key={i} className="portal-health-item" style={{ borderLeftColor: i === 0 ? "var(--danger)" : "var(--outline)", opacity: (clientPortal.client as any).healthConditions?.length === 0 ? 0.5 : 1 }}>
                          <div className="portal-health-item-label">{h.label}</div>
                          <div className="portal-health-item-desc">{h.note}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="portal-dashboard-row">
                {/* NUTRITION STRATEGY */}
                <div className="portal-nutrition-card">
                  <div className="portal-nutrition-header">
                    <h4>Nutrition Strategy</h4>
                    <div style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
                      {editing.nutrition ? (
                        <>
                          <button onClick={() => {
                            const cal = parseInt((document.getElementById("edit-nut-cal") as HTMLInputElement)?.value) || null;
                            const prot = parseInt((document.getElementById("edit-nut-prot") as HTMLInputElement)?.value) || null;
                            const fat = parseInt((document.getElementById("edit-nut-fat") as HTMLInputElement)?.value) || null;
                            const carbs = parseInt((document.getElementById("edit-nut-carbs") as HTMLInputElement)?.value) || null;
                            const note = (document.getElementById("edit-nut-note") as HTMLTextAreaElement)?.value ?? "";
                            saveProfile({ nutritionCalories: cal, nutritionProteinG: prot, nutritionFatG: fat, nutritionCarbsG: carbs, nutritionCoachNote: note });
                          }} disabled={savingProfile} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--primary)", display: "grid", placeItems: "center" }} title="Save"><span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>check</span></button>
                          <button onClick={cancelEdit} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--outline)", display: "grid", placeItems: "center" }} title="Cancel"><span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>close</span></button>
                        </>
                      ) : (
                        <button onClick={() => startEdit("nutrition")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--outline)", display: "grid", placeItems: "center" }} title="Edit nutrition"><span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>edit</span></button>
                      )}
                      <span className="portal-plan-badge">{clientPortal.plan ? "Active Plan" : "Manual"}</span>
                    </div>
                  </div>
                  {editing.nutrition ? (
                    <div>
                      <div className="portal-macro-grid" style={{ marginBottom: "0.75rem" }}>
                        {[
                          { label: "Calories", id: "edit-nut-cal", key: "nutritionCalories", unit: "KCAL" },
                          { label: "Protein", id: "edit-nut-prot", key: "nutritionProteinG", unit: "g" },
                          { label: "Fats", id: "edit-nut-fat", key: "nutritionFatG", unit: "g" },
                          { label: "Carbs", id: "edit-nut-carbs", key: "nutritionCarbsG", unit: "g" },
                        ].map(m => (
                          <div key={m.id} className="portal-macro-chip" style={{ flexDirection: "column", alignItems: "center", gap: "0.2rem" }}>
                            <div className="portal-macro-label">{m.label}</div>
                            <input id={m.id} type="number" defaultValue={(clientPortal.client as any)[m.key] ?? ""} style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "1.1rem", color: "var(--text-primary)", background: "var(--surface-container)", border: "1.5px solid var(--primary)", borderRadius: "var(--r-sm)", padding: "0.2rem 0.4rem", width: "70px", textAlign: "center" }} />
                            <div className="portal-macro-unit">{m.unit}</div>
                          </div>
                        ))}
                      </div>
                      <textarea id="edit-nut-note" defaultValue={(clientPortal.client as any).nutritionCoachNote} placeholder="Coach's note for this client..." style={{ fontFamily: "Inter, sans-serif", fontSize: "0.75rem", color: "var(--text-primary)", background: "var(--surface-container)", border: "1.5px solid var(--primary)", borderRadius: "var(--r-sm)", padding: "0.4rem", width: "100%", minHeight: "60px", resize: "vertical" }} />
                    </div>
                  ) : (
                    <div>
                      <div className="portal-macro-grid">
                        {[
                          { label: "Calories", value: (clientPortal.client as any).nutritionCalories, unit: "KCAL" },
                          { label: "Protein", value: (clientPortal.client as any).nutritionProteinG, unit: "g" },
                          { label: "Fats", value: (clientPortal.client as any).nutritionFatG, unit: "g" },
                          { label: "Carbs", value: (clientPortal.client as any).nutritionCarbsG, unit: "g" },
                        ].map(m => (
                          <div key={m.label} className="portal-macro-chip">
                            <div className="portal-macro-label">{m.label}</div>
                            <div className="portal-macro-value">{m.value ?? "â€”"}</div>
                            <div className="portal-macro-unit">{m.unit}</div>
                          </div>
                        ))}
                      </div>
                      <div className="portal-coach-note">
                        <span className="material-symbols-outlined portal-coach-note-icon">tips_and_updates</span>
                        <div className="portal-coach-note-text">
                          <strong>Coach's Note:</strong> {(clientPortal.client as any).nutritionCoachNote || "Click the edit icon to add a coaching note."}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* RIGHT COLUMN */}
                <div>
                  {/* WORKOUTS */}
                  <div className="portal-workouts-card" style={{ marginBottom: "1rem" }}>
                    <div className="portal-workouts-header">
                      <h4>Workouts</h4>
                      <div style={{ background: "rgba(0,135,103,0.1)", borderRadius: "var(--r-lg)", padding: "0.4rem", display: "grid", placeItems: "center" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--primary)", fontSize: "1rem" }}>fitness_center</span>
                      </div>
                    </div>
                    {clientPortal.plan ? (
                      <>
                        <div>
                          {clientPortal.plan.latestVersion.workouts.map((w, i) => (
                            <div key={i} className="portal-workout-item">
                              <div className={`portal-workout-dot${i > 0 ? " portal-workout-dot--dim" : ""}`} />
                              <div>
                                <div className="portal-workout-name">{w.split("(")[0].trim()}</div>
                                {w.includes("(") && <div className="portal-workout-meta">{w.match(/\([^)]+\)/)?.[0].replace(/[()]/g, "")}</div>}
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
                      </>
                    ) : (
                      <div style={{ textAlign: "center", padding: "1.5rem 0.5rem", color: "var(--on-surface-variant)", fontFamily: "Inter, sans-serif", fontSize: "0.8rem" }}>
                        <span className="material-symbols-outlined" style={{ fontSize: "2rem", display: "block", marginBottom: "0.5rem", color: "var(--outline)" }}>fitness_center</span>
                        No workout plan yet.<br />Generate one in AI Plans.
                      </div>
                    )}
                  </div>

                  {/* LIFESTYLE GRID */}
                  <div className="portal-lifestyle-grid">
                    {/* WATER */}
                    <div className="portal-lifestyle-card">
                      <span className="material-symbols-outlined portal-lifestyle-icon" style={{ color: "var(--primary-container)" }}>water_drop</span>
                      <div style={{ flex: 1 }}>
                        <div className="portal-lifestyle-label">Water Target</div>
                        {editing.water ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", marginTop: "0.2rem" }}>
                            <input id="edit-water" type="number" min="1" max="10" defaultValue={(clientPortal.client as any).dailyWaterTarget ?? 3} style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "0.9rem", background: "var(--surface-container)", border: "1.5px solid var(--primary)", borderRadius: "var(--r-sm)", padding: "0.15rem 0.3rem", width: "50px", textAlign: "center" }} />
                            <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.7rem", color: "var(--on-surface-variant)" }}>L / day</span>
                            <button onClick={() => saveProfile({ dailyWaterTarget: parseInt((document.getElementById("edit-water") as HTMLInputElement).value) || 3 })} disabled={savingProfile} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--primary)", display: "grid", placeItems: "center" }}><span className="material-symbols-outlined" style={{ fontSize: "0.9rem" }}>check</span></button>
                            <button onClick={cancelEdit} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--outline)", display: "grid", placeItems: "center" }}><span className="material-symbols-outlined" style={{ fontSize: "0.9rem" }}>close</span></button>
                          </div>
                        ) : (
                          <>
                            <div className="portal-lifestyle-value">{(clientPortal.client as any).dailyWaterTarget ?? 3}L</div>
                            <div className="portal-lifestyle-progress"><div className="portal-lifestyle-progress-fill" style={{ width: `${Math.min(clientPortal.client.adherenceScore, 100)}%` }} /></div>
                            <button onClick={() => startEdit("water")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--outline)", fontSize: "0.65rem", fontFamily: "Inter, sans-serif", padding: "0", marginTop: "0.2rem", textDecoration: "underline" }}>Edit</button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* STEPS */}
                    <div className="portal-lifestyle-card">
                      <span className="material-symbols-outlined portal-lifestyle-icon" style={{ color: "var(--tertiary-fixed)" }}>footprint</span>
                      <div style={{ flex: 1 }}>
                        <div className="portal-lifestyle-label">Steps Target</div>
                        {editing.steps ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", marginTop: "0.2rem" }}>
                            <input id="edit-steps" type="number" min="1000" max="50000" defaultValue={(clientPortal.client as any).dailyStepsTarget ?? 10000} style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "0.9rem", background: "var(--surface-container)", border: "1.5px solid var(--primary)", borderRadius: "var(--r-sm)", padding: "0.15rem 0.3rem", width: "60px", textAlign: "center" }} />
                            <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.7rem", color: "var(--on-surface-variant)" }}>steps</span>
                            <button onClick={() => saveProfile({ dailyStepsTarget: parseInt((document.getElementById("edit-steps") as HTMLInputElement).value) || 10000 })} disabled={savingProfile} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--primary)", display: "grid", placeItems: "center" }}><span className="material-symbols-outlined" style={{ fontSize: "0.9rem" }}>check</span></button>
                            <button onClick={cancelEdit} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--outline)", display: "grid", placeItems: "center" }}><span className="material-symbols-outlined" style={{ fontSize: "0.9rem" }}>close</span></button>
                          </div>
                        ) : (
                          <>
                            <div className="portal-lifestyle-value">{((clientPortal.client as any).dailyStepsTarget ?? 10000).toLocaleString()}</div>
                            <div className="portal-lifestyle-target">Daily</div>
                            <button onClick={() => startEdit("steps")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--outline)", fontSize: "0.65rem", fontFamily: "Inter, sans-serif", padding: "0", marginTop: "0.2rem", textDecoration: "underline" }}>Edit</button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* SUPPLEMENTS */}
                    <div className="portal-lifestyle-card portal-lifestyle-card--wide">
                      <div className="portal-supplements-header">
                        <span className="material-symbols-outlined portal-lifestyle-icon" style={{ color: "var(--tertiary)" }}>pill</span>
                        <h4>Supplements</h4>
                        <div style={{ marginLeft: "auto", display: "flex", gap: "0.2rem" }}>
                          {editing.supplements ? (
                            <>
                              <button onClick={() => saveProfile({ supplements: tempSupplements.split(",").map(s => s.trim()).filter(Boolean) })} disabled={savingProfile} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--primary)", display: "grid", placeItems: "center" }} title="Save"><span className="material-symbols-outlined" style={{ fontSize: "0.9rem" }}>check</span></button>
                              <button onClick={cancelEdit} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--outline)", display: "grid", placeItems: "center" }} title="Cancel"><span className="material-symbols-outlined" style={{ fontSize: "0.9rem" }}>close</span></button>
                            </>
                          ) : (
                            <button onClick={() => startEdit("supplements")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--outline)", display: "grid", placeItems: "center" }} title="Edit supplements"><span className="material-symbols-outlined" style={{ fontSize: "0.9rem" }}>edit</span></button>
                          )}
                        </div>
                      </div>
                      {editing.supplements ? (
                        <div>
                          <input value={tempSupplements} onChange={e => setTempSupplements(e.target.value)} placeholder="Vitamin D3, Omega-3, Magnesium..." style={{ fontFamily: "Inter, sans-serif", fontSize: "0.75rem", background: "var(--surface-container)", border: "1.5px solid var(--primary)", borderRadius: "var(--r-sm)", padding: "0.4rem", width: "100%", color: "var(--text-primary)" }} />
                          <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.68rem", color: "var(--on-surface-variant)", marginTop: "0.3rem" }}>Separate supplements with commas</div>
                        </div>
                      ) : (
                        <div className="portal-supplement-pills">
                          {((clientPortal.client as any).supplements?.length > 0
                            ? (clientPortal.client as any).supplements
                            : ["No supplements added"]
                          ).map((s: string) => (
                            <span key={s} className="portal-supplement-pill" style={{ opacity: (clientPortal.client as any).supplements?.length === 0 ? 0.5 : 1 }}>{s}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
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
                        Oct 23 â€“ Oct 29, 2023
                      </div>
                      <button className="meal-week-nav-btn" onClick={() => setMealWeekOffset(o => o - 1)}>
                        <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>chevron_left</span>
                      </button>
                      <button className="meal-week-nav-btn" onClick={() => setMealWeekOffset(o => o + 1)}>
                        <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>chevron_right</span>
                      </button>
                    </div>
                  </div>
                  <button className="meal-save-btn" onClick={async () => { await saveMealPlan(); }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "1rem", verticalAlign: "middle", marginRight: "0.35rem" }}>check_circle</span>
                    {savingMeal ? "Saving..." : "Save & Assign"}
                  </button>
                  <button className="meal-save-btn" onClick={() => setEditingMeal(d => d === null ? { day: mealWeek[0]?.name, slot: "Breakfast" } : null)} style={{ background: editingMeal ? "var(--primary)" : "var(--surface-container)", color: editingMeal ? "white" : "var(--text-primary)", border: "1.5px solid var(--outline-variant)", marginLeft: "0.5rem" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "1rem", verticalAlign: "middle", marginRight: "0.35rem" }}>edit</span>
                    Edit Meals
                  </button>
                </div>

                {/* Inline Meal Editor */}
                {editingMeal && (
                  <div className="card-glass" style={{ padding: "0.75rem", marginBottom: "1rem" }}>
                    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
                      <select value={editingMeal.day} onChange={e => setEditingMeal(d => d ? { ...d, day: e.target.value } : null)} style={{ padding: "0.3rem 0.5rem", borderRadius: "var(--r-sm)", border: "1.5px solid var(--outline-variant)", background: "var(--surface-container)", color: "var(--text-primary)", fontFamily: "Inter, sans-serif", fontSize: "0.75rem" }}>
                        {mealWeek.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
                      </select>
                      <select value={editingMeal.slot} onChange={e => setEditingMeal(d => d ? { ...d, slot: e.target.value } : null)} style={{ padding: "0.3rem 0.5rem", borderRadius: "var(--r-sm)", border: "1.5px solid var(--outline-variant)", background: "var(--surface-container)", color: "var(--text-primary)", fontFamily: "Inter, sans-serif", fontSize: "0.75rem" }}>
                        {["Breakfast","Lunch","Snacks","Dinner"].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <input type="text" placeholder="Meal name (e.g. Grilled Chicken Salad)" value={(() => { const day = mealWeek.find(d => d.name === editingMeal.day); const meal = day?.meals.find(m => m.slot === editingMeal.slot); return meal?.name ?? ""; })()} onChange={e => setMealWeek(prev => prev.map(d => d.name === editingMeal.day ? { ...d, meals: d.meals.map(m => m.slot === editingMeal.slot ? { ...m, name: e.target.value } : m) } : d))} style={{ flex: 1, padding: "0.3rem 0.5rem", borderRadius: "var(--r-sm)", border: "1.5px solid var(--outline-variant)", background: "var(--surface-container)", color: "var(--text-primary)", fontFamily: "Inter, sans-serif", fontSize: "0.75rem" }} />
                      <input type="number" placeholder="Cal" value={(() => { const day = mealWeek.find(d => d.name === editingMeal.day); const meal = day?.meals.find(m => m.slot === editingMeal.slot); return meal?.cal || ""; })()} onChange={e => setMealWeek(prev => prev.map(d => d.name === editingMeal.day ? { ...d, meals: d.meals.map(m => m.slot === editingMeal.slot ? { ...m, cal: Number(e.target.value) || 0 } : m) } : d))} style={{ width: "60px", padding: "0.3rem 0.4rem", borderRadius: "var(--r-sm)", border: "1.5px solid var(--outline-variant)", background: "var(--surface-container)", color: "var(--text-primary)", fontFamily: "Inter, sans-serif", fontSize: "0.75rem" }} />
                      <input type="number" placeholder="Protein (g)" value={(() => { const day = mealWeek.find(d => d.name === editingMeal.day); const meal = day?.meals.find(m => m.slot === editingMeal.slot); return meal?.protein || ""; })()} onChange={e => setMealWeek(prev => prev.map(d => d.name === editingMeal.day ? { ...d, meals: d.meals.map(m => m.slot === editingMeal.slot ? { ...m, protein: Number(e.target.value) || 0 } : m) } : d))} style={{ width: "70px", padding: "0.3rem 0.4rem", borderRadius: "var(--r-sm)", border: "1.5px solid var(--outline-variant)", background: "var(--surface-container)", color: "var(--text-primary)", fontFamily: "Inter, sans-serif", fontSize: "0.75rem" }} />
                      <button onClick={() => setEditingMeal(null)} style={{ padding: "0.3rem 0.6rem", borderRadius: "var(--r-sm)", border: "none", background: "var(--surface-container)", color: "var(--outline)", fontFamily: "Inter, sans-serif", fontSize: "0.72rem", cursor: "pointer" }}>Done</button>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                      <input type="text" placeholder="Search foods to add..." value={foodSearch} onChange={e => setFoodSearch(e.target.value)} style={{ flex: 1, padding: "0.3rem 0.5rem", borderRadius: "var(--r-sm)", border: "1.5px solid var(--outline-variant)", background: "var(--surface-container)", color: "var(--text-primary)", fontFamily: "Inter, sans-serif", fontSize: "0.75rem" }} />
                      {searchingFood && <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.72rem", color: "var(--outline)" }}>Searching...</span>}
                    </div>
                    {foodSuggestions.length > 0 && (
                      <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        {foodSuggestions.map((s, i) => (
                          <button key={i} onClick={() => { const day = mealWeek.find(d => d.name === editingMeal.day); const meal = day?.meals.find(m => m.slot === editingMeal.slot); if (meal) { setMealWeek(prev => prev.map(d => d.name === editingMeal.day ? { ...d, meals: d.meals.map(m => m.slot === editingMeal.slot ? { ...m, name: s } : m) } : d)); setFoodSearch(""); setFoodSuggestions([]); } }} style={{ padding: "0.25rem 0.6rem", borderRadius: "var(--r-sm)", border: "1.5px solid var(--outline-variant)", background: "var(--surface-container)", color: "var(--text-primary)", fontFamily: "Inter, sans-serif", fontSize: "0.7rem", cursor: "pointer" }}>
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                    <div style={{ marginTop: "0.5rem", fontFamily: "Inter, sans-serif", fontSize: "0.7rem", color: "var(--outline)" }}>
                      Select day + slot above, then type or search to update the meal.
                    </div>
                  </div>
                )}

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
                        { slot: "Dinner", name: "â€”", cal: 0, protein: 0, cheat: false },
                      ],
                      cheatMeal: null
                    },
                    { name: "Fri", date: 27, isToday: false, calTarget: 1800, proteinTarget: 150, carbsTarget: 210, fatTarget: 58, calCurrent: 0,
                      meals: [
                        { slot: "Breakfast", name: "â€”", cal: 0, protein: 0, cheat: false },
                        { slot: "Lunch", name: "â€”", cal: 0, protein: 0, cheat: false },
                        { slot: "Snacks", name: "â€”", cal: 0, protein: 0, cheat: false },
                        { slot: "Dinner", name: "â€”", cal: 0, protein: 0, cheat: false },
                      ],
                      cheatMeal: null
                    },
                    { name: "Sat", date: 28, isToday: false, calTarget: 1800, proteinTarget: 150, carbsTarget: 210, fatTarget: 58, calCurrent: 0,
                      meals: [
                        { slot: "Breakfast", name: "â€”", cal: 0, protein: 0, cheat: false },
                        { slot: "Lunch", name: "â€”", cal: 0, protein: 0, cheat: false },
                        { slot: "Snacks", name: "â€”", cal: 0, protein: 0, cheat: false },
                        { slot: "Dinner", name: "â€”", cal: 0, protein: 0, cheat: false },
                      ],
                      cheatMeal: null
                    },
                    { name: "Sun", date: 29, isToday: false, calTarget: 1800, proteinTarget: 150, carbsTarget: 210, fatTarget: 58, calCurrent: 0,
                      meals: [
                        { slot: "Breakfast", name: "â€”", cal: 0, protein: 0, cheat: false },
                        { slot: "Lunch", name: "â€”", cal: 0, protein: 0, cheat: false },
                        { slot: "Snacks", name: "â€”", cal: 0, protein: 0, cheat: false },
                        { slot: "Dinner", name: "â€”", cal: 0, protein: 0, cheat: false },
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
                              {day.proteinTarget}g Â· {day.carbsTarget}g Â· {day.fatTarget}g
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
                            {meal.name === "â€”" ? (
                              <button className="meal-add-btn" title={`Add ${meal.slot}`} onClick={() => setEditingMeal({ day: day.name, slot: meal.slot })}>
                                <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>add</span>
                              </button>
                            ) : (
                              <div className="meal-item-card">
                                <button className="meal-item-edit" title="Edit meal" onClick={() => setEditingMeal({ day: day.name, slot: meal.slot })}>
                                  <span className="material-symbols-outlined" style={{ fontSize: "0.7rem" }}>edit</span>
                                </button>
                                <div className="meal-item-name">{meal.name}</div>
                                <div className="meal-item-cal">{meal.cal} kcal Â· {meal.protein}g P</div>
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
                              <div className="meal-item-cal meal-item-cal--cheat">{day.cheatMeal.cal} kcal Â· {day.cheatMeal.protein}g P</div>
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
                  <button className="meal-architect-btn" onClick={() => { push("AI generating personalized meal plan for this week...", "info"); onNav("ai"); }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "1rem", fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                    <span>AI Generate</span>
                  </button>
                  <button className="meal-architect-btn" onClick={() => { push("Opening Smart Swap â€” managing nutrition swaps in Habits", "info"); onNav("habits"); }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>swap_horiz</span>
                    <span>Smart Swap</span>
                  </button>
                  <button className="meal-architect-btn" onClick={() => { push("Select a day and meal slot in the calendar to add a meal"); }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>restaurant_menu</span>
                    <span>Add Meal</span>
                  </button>
                  <button className="meal-architect-btn" onClick={() => { push("Macro targets saved â€” 150g protein, 210g carbs, 58g fat per day", "success"); }}>
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
                    <input
                      type="text"
                      placeholder="Search exercises..."
                      value={exerciseSearch}
                      onChange={e => setExerciseSearch(e.target.value)}
                      style={{ width: "100%", padding: "0.3rem 0.5rem", borderRadius: "var(--r-sm)", border: "1.5px solid var(--outline-variant)", background: "var(--surface-container)", color: "var(--text-primary)", fontFamily: "Inter, sans-serif", fontSize: "0.72rem", marginBottom: "0.4rem", boxSizing: "border-box" }}
                    />
                    <select value={exerciseFilter} onChange={e => setExerciseFilter(e.target.value)} style={{ width: "100%", padding: "0.3rem 0.4rem", borderRadius: "var(--r-sm)", border: "1.5px solid var(--outline-variant)", background: "var(--surface-container)", color: "var(--text-primary)", fontFamily: "Inter, sans-serif", fontSize: "0.72rem", marginBottom: "0.5rem", boxSizing: "border-box" }}>
                      <option value="all">All</option>
                      <option value="chest">Chest</option>
                      <option value="back">Back</option>
                      <option value="legs">Legs</option>
                      <option value="shoulders">Shoulders</option>
                      <option value="arms">Arms</option>
                      <option value="core">Core</option>
                      <option value="cardio">Cardio</option>
                    </select>
                  </div>
                  <div style={{ overflowY: "auto", flex: 1, maxHeight: "320px" }}>
                    {loadingExercises ? (
                      <p style={{ fontFamily: "Inter, sans-serif", fontSize: "0.72rem", color: "var(--outline)", padding: "0.5rem" }}>Loading...</p>
                    ) : filteredExercises.length === 0 ? (
                      <p style={{ fontFamily: "Inter, sans-serif", fontSize: "0.72rem", color: "var(--outline)", padding: "0.5rem" }}>No exercises found.</p>
                    ) : (
                      filteredExercises.slice(0, 50).map(ex => (
                        <div key={ex.id} className="workout-lib-item" style={{ fontSize: "0.72rem", padding: "0.35rem 0.5rem", cursor: "pointer" }} onClick={() => {
                          const nextId = Math.max(0, ...workoutExercises.map(e => e.id)) + 1;
                          setWorkoutExercises(prev => [...prev, { id: nextId, name: ex.name, tag: ex.bodyPart || "Custom", sets: "3 Sets of 12", duration: "45 Seconds", advanced: "" }]);
                          push(`"${ex.name}" added to plan`);
                        }}>
                          <span className="material-symbols-outlined" style={{ fontSize: "0.8rem" }}>fitness_center</span>
                          <span style={{ fontFamily: "Inter, sans-serif" }}>{ex.name}</span>
                        </div>
                      ))
                    )}
                  </div>
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
                  {savingWorkout ? "Saving..." : "All changes saved"}
                </div>
                <div className="workout-bottom-actions">
                  <button className="workout-discard-btn" onClick={() => { setWorkoutExercises([{ id: 1, name: "Jumping Jacks", tag: "Metabolic / Plyometric", sets: "3 Sets of 50", duration: "60 Seconds", advanced: "" }, { id: 2, name: "High Knees", tag: "Agility / Power", sets: "Per Set: 30", duration: "45 Seconds", advanced: "Ankle Weights 1kg" }, { id: 3, name: "Butt Kicks", tag: "Metabolic / Warmup", sets: "Fixed: 40", duration: "30 Seconds", advanced: "" }]); push("Workout draft discarded - reverted to last saved version"); }}>Discard Draft</button>
                  <button className="workout-publish-btn" onClick={async () => { if (clientPortal?.plan) { setSavingWorkout(true); try { await fetchJson<any>(`/plans/${clientPortal.plan.id}`, { method: "PATCH", body: JSON.stringify({ workouts: JSON.stringify(workoutExercises) }) }); await onApprove(clientPortal.plan.id); push("Workout plan saved and published!", "success"); } catch { push("Failed to save workout plan", "error"); } finally { setSavingWorkout(false); } } else { push("No active plan â€” generate one from AI Plans first", "error"); } }}>Save &amp; Publish</button>
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
                <input value={msgDraft} onChange={e => setMsgDraft(e.target.value)} placeholder="Type a messageâ€¦" />
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
                          if (deltas.length < 2) return "â€”";
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
                            <span className="trend-bar-label">{checkIn.progress.weightKg != null ? `${checkIn.progress.weightKg}` : "â€”"}</span>
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
                  {/* Progress Photos */}
                  {checkInHistory.some(c => c.photoCount > 0) && (
                    <div className="panel" style={{ marginTop: "1.5rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                        <h2>Progress Photos</h2>
                        <button onClick={() => setShowPhotos(v => !v)}
                          style={{ padding: "0.35rem 1rem", borderRadius: "9999px", border: "1.5px solid var(--outline-variant)",
                            background: showPhotos ? "var(--primary)" : "transparent",
                            color: showPhotos ? "white" : "var(--text-primary)",
                            fontFamily: "Inter, sans-serif", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer" }}>
                          {showPhotos ? "Hide" : "View"} Photos
                        </button>
                      </div>
                      {showPhotos && (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "0.75rem" }}>
                          {checkInHistory.filter(c => c.photoCount > 0).map(ci => (
                            <div key={ci.id} style={{ borderRadius: "var(--r-lg)", overflow: "hidden", background: "var(--surface-container)", aspectRatio: "3/4" }}>
                              <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0.5rem" }}>
                                <span className="material-symbols-outlined" style={{ fontSize: "2rem", color: "var(--outline)" }}>photo</span>
                                <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.65rem", color: "var(--outline)", marginTop: "0.25rem" }}>
                                  {new Date(ci.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// â”€â”€ BILLING VIEW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
          <div className="stat-card__value">Â£{mrrGbp}</div>
        </div>
        <div className="stat-card card-glass" style={{ borderLeft: "3px solid var(--primary)" }}>
          <div className="stat-card__label">Est. VAT Collected (20%)</div>
          <div className="stat-card__value">Â£{totalTaxGbp.toFixed(2)}</div>
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
          <button className="secondary sm" onClick={() => downloadBulkTaxReport(subs, session.clients, session.workspace)}>ðŸ“¥ Bulk Download Tax Report</button>
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
                    <span style={{ fontWeight: 700, color: "var(--on-surface)" }}>Â£{sub.amountGbp.toFixed(2)}/mo</span>
                    <span className="muted text-xs">Net: Â£{subNet.toFixed(2)} + VAT: Â£{subVat.toFixed(2)}</span>
                  </div>
                  <span className={`pill ${sub.status === "past_due" ? "pill-danger" : sub.status === "trialing" ? "pill-warning" : "pill-success"}`}>
                    {sub.status}
                  </span>
                  <div className="inline compact">
                    <button className="ghost sm" onClick={() => client && generateInvoicePDF(sub, client, session.workspace)}>ðŸ“„ PDF Invoice</button>
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

// â”€â”€ MIGRATION VIEW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
              <button disabled={loading === "commit"} onClick={doCommit}>{loading === "commit" ? "Importingâ€¦" : "Commit rows"}</button>
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
            <p className="muted text-sm" style={{ marginBottom: "1rem" }}>Download a portable JSON snapshot of all state â€” clients, plans, payments, and analytics.</p>
            <div className="inline">
              <a className="ghost-button" href={`${apiBase}/export`} target="_blank" rel="noreferrer">â†“ Export bundle</a>
              <button className="danger" disabled={loading === "reset"} onClick={doReset}>{loading === "reset" ? "Resettingâ€¦" : "Reset to seed"}</button>
            </div>
          </div>

          <div className="panel">
            <div className="section-header"><h2>Restore Snapshot</h2></div>
            <form className="stack" onSubmit={doRestore}>
              <textarea className="csv-box" value={restoreJson} onChange={e => setRestoreJson(e.target.value)} placeholder='Paste exported JSON hereâ€¦' />
              <button type="submit" disabled={loading === "restore"}>{loading === "restore" ? "Restoringâ€¦" : "Restore snapshot"}</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

// â”€â”€ SETTINGS VIEW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function SettingsView({ session, onSave }: {
  session: CoachSession;
  onSave: (draft: any) => Promise<void>;
}) {
  const { workspace, coach, subscriptions } = session;
  const [draft, setDraft] = useState({
    name: workspace.name,
    brandColor: workspace.brandColor,
    accentColor: workspace.accentColor,
    heroMessage: workspace.heroMessage,
    stripeConnected: workspace.stripeConnected,
    coachFirstName: coach.firstName,
    coachLastName: coach.lastName,
    coachEmail: coach.email,
  });
  const [saving, setSaving] = useState(false);

  const mrrGbp = subscriptions
    .filter(s => s.status === "active")
    .reduce((sum, s) => sum + s.amountGbp, 0);

  const activeSubs = subscriptions.filter(s => s.status === "active").length;
  const trialSubs = subscriptions.filter(s => s.status === "trialing").length;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        name: draft.name,
        brandColor: draft.brandColor,
        accentColor: draft.accentColor,
        heroMessage: draft.heroMessage,
        stripeConnected: draft.stripeConnected,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-view">
      <p className="eyebrow">Settings</p>
      <h1 className="page-title">Workspace & Profile</h1>
      <p className="page-subtitle">Manage your brand, coach profile, and subscription info.</p>

      <div className="content-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Workspace Settings</h2>
              <p className="panel-body-text">Brand identity and messaging.</p>
            </div>
          </div>
          <form className="stack" onSubmit={handleSubmit}>
            <label>
              Workspace name
              <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
            </label>
            <label>
              Hero message
              <textarea value={draft.heroMessage} onChange={e => setDraft(d => ({ ...d, heroMessage: e.target.value }))} />
            </label>
            <div className="two-col">
              <label>
                Brand color
                <input type="color" value={draft.brandColor} onChange={e => setDraft(d => ({ ...d, brandColor: e.target.value }))} style={{ padding: '0.25rem 0.5rem', height: '2.5rem' }} />
              </label>
              <label>
                Accent color
                <input type="color" value={draft.accentColor} onChange={e => setDraft(d => ({ ...d, accentColor: e.target.value }))} style={{ padding: '0.25rem 0.5rem', height: '2.5rem' }} />
              </label>
            </div>
            <label className="toggle">
              <input type="checkbox" checked={draft.stripeConnected} onChange={e => setDraft(d => ({ ...d, stripeConnected: e.target.checked }))} />
              Stripe connected (GBP)
            </label>
            <div>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? "Saving..." : "Save Workspace"}
              </button>
            </div>
          </form>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Coach Profile</h2>
              <p className="panel-body-text">Your personal info shown to clients.</p>
            </div>
          </div>
          <div className="stack">
            <label>
              First name
              <input value={draft.coachFirstName} onChange={e => setDraft(d => ({ ...d, coachFirstName: e.target.value }))} />
            </label>
            <label>
              Last name
              <input value={draft.coachLastName} onChange={e => setDraft(d => ({ ...d, coachLastName: e.target.value }))} />
            </label>
            <label>
              Email
              <input value={draft.coachEmail} onChange={e => setDraft(d => ({ ...d, coachEmail: e.target.value }))} type="email" />
            </label>
          </div>
        </div>
      </div>

      <div className="panel" style={{ maxWidth: '640px' }}>
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Subscription Overview</h2>
            <p className="panel-body-text">Your workspace plan and current client subscriptions.</p>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem', marginBottom: '1.25rem' }}>
          <div style={{ background: 'var(--surface-container-low)', borderRadius: 'var(--r-lg)', padding: '1rem', textAlign: 'center' }}>
            <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: '1.4rem', color: 'var(--primary)' }}>&pound;{mrrGbp}</div>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.72rem', color: 'var(--outline)', marginTop: '0.2rem' }}>Monthly Revenue</div>
          </div>
          <div style={{ background: 'var(--surface-container-low)', borderRadius: 'var(--r-lg)', padding: '1rem', textAlign: 'center' }}>
            <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: '1.4rem', color: 'var(--primary)' }}>{activeSubs}</div>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.72rem', color: 'var(--outline)', marginTop: '0.2rem' }}>Active Clients</div>
          </div>
          <div style={{ background: 'var(--surface-container-low)', borderRadius: 'var(--r-lg)', padding: '1rem', textAlign: 'center' }}>
            <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: '1.4rem', color: trialSubs > 0 ? 'var(--warning)' : 'var(--outline)' }}>{trialSubs}</div>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.72rem', color: 'var(--outline)', marginTop: '0.2rem' }}>Trialing</div>
          </div>
        </div>
        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.78rem', color: 'var(--outline)' }}>
          Parallel run days left: <strong>{workspace.parallelRunDaysLeft}</strong>
        </p>
      </div>
    </div>
  );
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   WORKOUT LOGGER MODAL
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function WorkoutLoggerModal({ onClose, onSuccess, push, clients }: {
  onClose: () => void;
  onSuccess: () => void;
  push: (msg: string, type?: "success"|"error"|"info") => void;
  clients: ClientProfile[];
}) {
  const [selectedClientId, setSelectedClientId] = useState(clients[0]?.id ?? "");
  const [workoutDate, setWorkoutDate] = useState(new Date().toISOString().slice(0, 10));
  const [sessionType, setSessionType] = useState("strength");
  const [exercises, setExercises] = useState([{ name: "", sets: "", reps: "", weight: "", notes: "" }]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const addExercise = () => setExercises(prev => [...prev, { name: "", sets: "", reps: "", weight: "", notes: "" }]);
  const removeExercise = (i: number) => setExercises(prev => prev.filter((_, idx) => idx !== i));
  const updateExercise = (i: number, field: string, value: string) =>
    setExercises(prev => prev.map((ex, idx) => idx === i ? { ...ex, [field]: value } : ex));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientId) return;
    setSubmitting(true);
    try {
      const completed = exercises.filter(ex => ex.name.trim());
      await fetchJson("/check-ins", {
        method: "POST",
        body: JSON.stringify({
          clientId: selectedClientId,
          submittedAt: new Date(workoutDate).toISOString(),
          progress: {
            notes: `Workout â€” ${sessionType}. Exercises: ${completed.map(ex =>
              `${ex.name} ${ex.sets}Ã—${ex.reps}${ex.weight ? ` @${ex.weight}kg` : ""}`
            ).join(" | ")}`,
          },
        })
      });
      onSuccess();
    } catch { push("Failed to log workout", "error"); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel" style={{ maxWidth: 520 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
          <h2 style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "1.1rem", color: "var(--text-primary)", margin: 0 }}>Log Workout Session</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--outline)", fontSize: "1.2rem", padding: "0.25rem" }}>Ã—</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
            <div>
              <label style={{ fontFamily: "Inter, sans-serif", fontSize: "0.72rem", fontWeight: 600, color: "var(--outline)", textTransform: "uppercase", display: "block", marginBottom: "0.3rem" }}>Client</label>
              <select value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)} style={{ width: "100%", padding: "0.5rem 0.6rem", borderRadius: "var(--r-md)", border: "1.5px solid var(--outline-variant)", background: "var(--surface-container)", color: "var(--text-primary)", fontFamily: "Inter, sans-serif", fontSize: "0.82rem", boxSizing: "border-box" }}>
                {clients.map(c => <option key={c.id} value={c.id}>{c.fullName}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontFamily: "Inter, sans-serif", fontSize: "0.72rem", fontWeight: 600, color: "var(--outline)", textTransform: "uppercase", display: "block", marginBottom: "0.3rem" }}>Date</label>
              <input type="date" value={workoutDate} onChange={e => setWorkoutDate(e.target.value)} style={{ width: "100%", padding: "0.5rem 0.6rem", borderRadius: "var(--r-md)", border: "1.5px solid var(--outline-variant)", background: "var(--surface-container)", color: "var(--text-primary)", fontFamily: "Inter, sans-serif", fontSize: "0.82rem", boxSizing: "border-box" }} />
            </div>
          </div>
          <div style={{ marginBottom: "1rem" }}>
            <label style={{ fontFamily: "Inter, sans-serif", fontSize: "0.72rem", fontWeight: 600, color: "var(--outline)", textTransform: "uppercase", display: "block", marginBottom: "0.3rem" }}>Session Type</label>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {["strength","cardio","hiit","flexibility","other"].map(t => (
                <button key={t} type="button" onClick={() => setSessionType(t)} style={{ padding: "0.3rem 0.75rem", borderRadius: "var(--r-md)", border: "1.5px solid", borderColor: sessionType === t ? "var(--primary)" : "var(--outline-variant)", background: sessionType === t ? "var(--primary-container)" : "var(--surface-container)", color: sessionType === t ? "var(--primary)" : "var(--text-primary)", fontFamily: "Inter, sans-serif", fontSize: "0.72rem", fontWeight: 600, cursor: "pointer", textTransform: "capitalize" }}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <label style={{ fontFamily: "Inter, sans-serif", fontSize: "0.72rem", fontWeight: 600, color: "var(--outline)", textTransform: "uppercase" }}>Exercises</label>
              <button type="button" onClick={addExercise} style={{ padding: "0.2rem 0.5rem", borderRadius: "var(--r-sm)", border: "1.5px solid var(--outline-variant)", background: "var(--surface-container)", color: "var(--primary)", fontFamily: "Inter, sans-serif", fontSize: "0.7rem", fontWeight: 600, cursor: "pointer" }}>+ Add</button>
            </div>
            {exercises.map((ex, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: "0.4rem", marginBottom: "0.4rem", alignItems: "center" }}>
                <input value={ex.name} onChange={e => updateExercise(i, "name", e.target.value)} placeholder="Exercise name" style={{ padding: "0.35rem 0.5rem", borderRadius: "var(--r-sm)", border: "1.5px solid var(--outline-variant)", background: "var(--surface-container)", color: "var(--text-primary)", fontFamily: "Inter, sans-serif", fontSize: "0.75rem", boxSizing: "border-box" }} />
                <input value={ex.sets} onChange={e => updateExercise(i, "sets", e.target.value)} placeholder="Sets" style={{ padding: "0.35rem 0.4rem", borderRadius: "var(--r-sm)", border: "1.5px solid var(--outline-variant)", background: "var(--surface-container)", color: "var(--text-primary)", fontFamily: "Inter, sans-serif", fontSize: "0.75rem", boxSizing: "border-box" }} />
                <input value={ex.reps} onChange={e => updateExercise(i, "reps", e.target.value)} placeholder="Reps" style={{ padding: "0.35rem 0.4rem", borderRadius: "var(--r-sm)", border: "1.5px solid var(--outline-variant)", background: "var(--surface-container)", color: "var(--text-primary)", fontFamily: "Inter, sans-serif", fontSize: "0.75rem", boxSizing: "border-box" }} />
                <input value={ex.weight} onChange={e => updateExercise(i, "weight", e.target.value)} placeholder="kg" style={{ padding: "0.35rem 0.4rem", borderRadius: "var(--r-sm)", border: "1.5px solid var(--outline-variant)", background: "var(--surface-container)", color: "var(--text-primary)", fontFamily: "Inter, sans-serif", fontSize: "0.75rem", boxSizing: "border-box" }} />
                {exercises.length > 1 && (
                  <button type="button" onClick={() => removeExercise(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)", fontSize: "0.9rem", padding: "0.2rem" }}>Ã—</button>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", borderTop: "1px solid var(--surface-container)", paddingTop: "1rem" }}>
            <button type="button" onClick={onClose} style={{ padding: "0.5rem 1rem", borderRadius: "var(--r-md)", border: "1.5px solid var(--outline-variant)", background: "none", color: "var(--outline)", fontFamily: "Manrope, sans-serif", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
            <button type="submit" disabled={submitting || !selectedClientId} style={{ padding: "0.5rem 1.25rem", borderRadius: "var(--r-md)", border: "none", background: submitting || !selectedClientId ? "var(--surface-container)" : "var(--primary)", color: submitting || !selectedClientId ? "var(--outline)" : "white", fontFamily: "Manrope, sans-serif", fontSize: "0.82rem", fontWeight: 700, cursor: submitting || !selectedClientId ? "not-allowed" : "pointer" }}>
              {submitting ? "Saving..." : "Log Session"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   CLIENT NOTES MODAL
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function ClientNotesModal({ onClose, push, clients }: {
  onClose: () => void;
  push: (message: string, type?: "success"|"error"|"info") => void;
  clients: ClientProfile[];
}) {
  const [selectedClientId, setSelectedClientId] = useState(clients[0]?.id ?? "");
  const [activeTab, setActiveTab] = useState<"notes"|"chat">("notes");
  const [notes, setNotes] = useState<Array<{ id: string; clientId: string; content: string; createdAt: string; updatedAt: string }>>([]);
  const [messages, setMessages] = useState<Array<{ id: string; sender: string; content: string; sentAt: string }>>([]);
  const [newNote, setNewNote] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [submittingNote, setSubmittingNote] = useState(false);
  const [submittingMessage, setSubmittingMessage] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Load notes when client changes
  useEffect(() => {
    if (!selectedClientId) return;
    setLoadingNotes(true);
    fetchJson<typeof notes>(`/clients/${selectedClientId}/notes`)
      .then(data => { setNotes(data); })
      .catch(() => push("Failed to load notes.", "error"))
      .finally(() => setLoadingNotes(false));
  }, [selectedClientId]);

  // Load messages when switching to chat tab
  useEffect(() => {
    if (activeTab !== "chat" || !selectedClientId) return;
    setLoadingMessages(true);
    fetchJson<typeof messages>(`/messages/${selectedClientId}`)
      .then(data => { setMessages(data); setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100); })
      .catch(() => push("Failed to load messages.", "error"))
      .finally(() => setLoadingMessages(false));
  }, [activeTab, selectedClientId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (activeTab === "chat") messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeTab]);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim() || !selectedClientId) return;
    setSubmittingNote(true);
    try {
      const note = await fetchJson<{ id: string; clientId: string; content: string; createdAt: string; updatedAt: string }>(`/clients/${selectedClientId}/notes`, {
        method: "POST",
        body: JSON.stringify({ content: newNote.trim() }),
      });
      setNotes(prev => [note, ...prev]);
      setNewNote("");
      push("Note added.", "success");
    } catch { push("Failed to add note.", "error"); }
    finally { setSubmittingNote(false); }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedClientId) return;
    setSubmittingMessage(true);
    try {
      const msg = await fetchJson<{ id: string; sender: string; content: string; sentAt: string }>("/messages", {
        method: "POST",
        body: JSON.stringify({ clientId: selectedClientId, content: newMessage.trim() }),
      });
      setMessages(prev => [...prev, msg]);
      setNewMessage("");
    } catch { push("Failed to send message.", "error"); }
    finally { setSubmittingMessage(false); }
  };

  const formatTime = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel" style={{ maxWidth: 560, maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexShrink: 0 }}>
          <h2 style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "1.1rem", color: "var(--text-primary)", margin: 0 }}>Client Notes & Chat</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--outline)", fontSize: "1.2rem", padding: "0.25rem" }}>Ã—</button>
        </div>

        {/* Client selector */}
        <div style={{ marginBottom: "1rem", flexShrink: 0 }}>
          <select
            value={selectedClientId}
            onChange={e => setSelectedClientId(e.target.value)}
            style={{ width: "100%", padding: "0.5rem 0.6rem", borderRadius: "var(--r-md)", border: "1.5px solid var(--outline-variant)", background: "var(--surface-container)", color: "var(--text-primary)", fontFamily: "Inter, sans-serif", fontSize: "0.82rem", boxSizing: "border-box" }}
          >
            {clients.map(c => <option key={c.id} value={c.id}>{c.fullName}</option>)}
          </select>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1.5px solid var(--outline-variant)", marginBottom: "1rem", flexShrink: 0 }}>
          {(["notes", "chat"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "0.5rem 1rem", border: "none", background: "none", cursor: "pointer",
                fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "0.82rem",
                color: activeTab === tab ? "var(--primary)" : "var(--outline)",
                borderBottom: activeTab === tab ? "2px solid var(--primary)" : "2px solid transparent",
                marginBottom: "-1.5px", textTransform: "capitalize",
              }}
            >
              {tab === "notes" ? "Notes" : "Chat"}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {activeTab === "notes" ? (
            <div>
              {loadingNotes ? (
                <p style={{ color: "var(--outline)", fontFamily: "Inter, sans-serif", fontSize: "0.82rem" }}>Loading notes...</p>
              ) : notes.length === 0 ? (
                <p style={{ color: "var(--outline)", fontFamily: "Inter, sans-serif", fontSize: "0.82rem", textAlign: "center", padding: "2rem" }}>No notes yet. Add one below.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem" }}>
                  {notes.map(note => (
                    <div key={note.id} style={{ padding: "0.75rem", borderRadius: "var(--r-md)", background: "var(--surface-container)", borderLeft: "3px solid var(--primary)" }}>
                      <p style={{ fontFamily: "Inter, sans-serif", fontSize: "0.82rem", color: "var(--text-primary)", margin: "0 0 0.4rem" }}>{note.content}</p>
                      <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.68rem", color: "var(--outline)" }}>{formatTime(note.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              {loadingMessages ? (
                <p style={{ color: "var(--outline)", fontFamily: "Inter, sans-serif", fontSize: "0.82rem" }}>Loading messages...</p>
              ) : messages.length === 0 ? (
                <p style={{ color: "var(--outline)", fontFamily: "Inter, sans-serif", fontSize: "0.82rem", textAlign: "center", padding: "2rem" }}>No messages yet. Start a conversation below.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "0.75rem", maxHeight: 300, overflowY: "auto" }}>
                  {messages.map(msg => (
                    <div key={msg.id} style={{
                      display: "flex", justifyContent: msg.sender === "coach" ? "flex-end" : "flex-start",
                    }}>
                      <div style={{
                        maxWidth: "75%", padding: "0.5rem 0.75rem", borderRadius: "var(--r-lg)",
                        background: msg.sender === "coach" ? "var(--primary)" : "var(--surface-container)",
                        color: msg.sender === "coach" ? "white" : "var(--text-primary)",
                        fontFamily: "Inter, sans-serif", fontSize: "0.78rem",
                        borderBottomRightRadius: msg.sender === "coach" ? "4px" : "var(--r-lg)",
                        borderBottomLeftRadius: msg.sender === "client" ? "4px" : "var(--r-lg)",
                      }}>
                        <p style={{ margin: "0 0 0.2rem" }}>{msg.content}</p>
                        <span style={{ fontSize: "0.62rem", opacity: 0.7 }}>{formatTime(msg.sentAt)}</span>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input form */}
        <div style={{ borderTop: "1px solid var(--surface-container)", paddingTop: "1rem", marginTop: "0.5rem", flexShrink: 0 }}>
          {activeTab === "notes" ? (
            <form onSubmit={handleAddNote} style={{ display: "flex", gap: "0.5rem" }}>
              <textarea
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                placeholder="Add a note..."
                rows={2}
                style={{ flex: 1, padding: "0.5rem 0.6rem", borderRadius: "var(--r-md)", border: "1.5px solid var(--outline-variant)", background: "var(--surface-container)", color: "var(--text-primary)", fontFamily: "Inter, sans-serif", fontSize: "0.82rem", resize: "none", boxSizing: "border-box" }}
              />
              <button type="submit" disabled={submittingNote || !newNote.trim()} style={{ padding: "0.5rem 1rem", borderRadius: "var(--r-md)", border: "none", background: newNote.trim() && !submittingNote ? "var(--primary)" : "var(--surface-container)", color: newNote.trim() && !submittingNote ? "white" : "var(--outline)", fontFamily: "Manrope, sans-serif", fontSize: "0.8rem", fontWeight: 700, cursor: newNote.trim() && !submittingNote ? "pointer" : "not-allowed", alignSelf: "flex-end" }}>
                {submittingNote ? "..." : "Add"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSendMessage} style={{ display: "flex", gap: "0.5rem" }}>
              <input
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                style={{ flex: 1, padding: "0.5rem 0.75rem", borderRadius: "var(--r-md)", border: "1.5px solid var(--outline-variant)", background: "var(--surface-container)", color: "var(--text-primary)", fontFamily: "Inter, sans-serif", fontSize: "0.82rem", boxSizing: "border-box" }}
              />
              <button type="submit" disabled={submittingMessage || !newMessage.trim()} style={{ padding: "0.5rem 1rem", borderRadius: "var(--r-md)", border: "none", background: newMessage.trim() && !submittingMessage ? "var(--primary)" : "var(--surface-container)", color: newMessage.trim() && !submittingMessage ? "white" : "var(--outline)", fontFamily: "Manrope, sans-serif", fontSize: "0.8rem", fontWeight: 700, cursor: newMessage.trim() && !submittingMessage ? "pointer" : "not-allowed" }}>
                <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>send</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   ONBOARDING WIZARD
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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

        {/* Step 0 â€” Workspace Setup */}
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

        {/* Step 1 â€” Coach Type */}
        {step === 1 && (
          <div>
            <p className="eyebrow">Step 2 of {STEPS.length}</p>
            <h2 className="modal-title">What kind of coach are you?</h2>
            <p className="modal-subtitle">We'll tailor your experience â€” you can change this later.</p>
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

        {/* Step 2 â€” Launch */}
        {step === 2 && (
          <div style={{ textAlign: "center", padding: "1rem 0" }}>
            <p className="eyebrow">Step 3 of {STEPS.length}</p>
            <h2 className="modal-title">You're all set!</h2>
            <p className="modal-subtitle">Your workspace is ready. Let's go.</p>
            <div style={{ marginTop: "2rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div className="onboard-summary-item">
                <span className="onboard-summary-icon">ðŸ‹ï¸</span>
                <span>CoachOS workspace created</span>
              </div>
              {coachTypes.length > 0 && (
                <div className="onboard-summary-item">
                  <span className="onboard-summary-icon">ðŸŽ¯</span>
                  <span>{coachTypes.length} coaching specialty{coachTypes.length > 1 ? "ies" : "y"} selected</span>
                </div>
              )}
              <div className="onboard-summary-item">
                <span className="onboard-summary-icon">ðŸ“‹</span>
                <span>Demo clients loaded and ready to explore</span>
              </div>
            </div>
          </div>
        )}

        <div className="onboard-actions">
          {step > 0 ? (
            <button className="secondary" onClick={() => setStep(s => s - 1)}>â† Back</button>
          ) : (
            <div />
          )}
          <div className="inline">
            <span className="text-sm muted">{step + 1} / {STEPS.length}</span>
            <button onClick={next}>{step === STEPS.length - 1 ? "Launch CoachOS â†’" : "Continue â†’"}</button>
          </div>
        </div>
        <div className="onboard-skip" onClick={onComplete}>Skip onboarding â€” use defaults</div>
      </div>
    </div>
  );
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   GROUP PROGRAMS VIEW
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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
            <span className="program-stat-value">Â£{program.monthlyPriceGbp}</span>
          </div>
          <div className="program-stat">
            <span className="program-stat-label">Revenue/mo</span>
            <span className="program-stat-value">Â£{program.monthlyPriceGbp * program.memberIds.length}</span>
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
            <div className="empty-state-icon">ðŸ‘¥</div>
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
          <label>Monthly price (Â£)<input type="number" value={price} onChange={e => setPrice(Number(e.target.value))} /></label>
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
          <label>Monthly price (Â£)<input type="number" value={price} onChange={e => setPrice(Number(e.target.value))} /></label>
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

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   HABITS VIEW
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function HabitsView({ session }: { session: CoachSession }) {
  const [summaries, setSummaries] = useState<Map<string, HabitSummary[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [filterMode, setFilterMode] = useState<"all"|"with"|"without">("all");
  const [sortMode, setSortMode] = useState<"az"|"za"|"date">("az");
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
    push("Nudge sent to client âœ“");
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
          {/* Filter + Sort Bar */}
          <div className="card" style={{ padding: "0.75rem 1rem", marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--font-body)", fontSize: "0.7rem", fontWeight: 700, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Filter:</span>
            {(["all","with","without"] as const).map(f => (
              <button key={f} onClick={() => setFilterMode(f)}
                style={{ padding: "0.35rem 0.85rem", borderRadius: "var(--r-full)", border: `1.5px solid ${filterMode===f?"var(--primary)":"var(--border)"}`, background: filterMode===f?"var(--primary-light)":"transparent", color: filterMode===f?"var(--primary-dark)":"var(--text-secondary)", fontFamily: "var(--font-body)", fontSize: "0.72rem", fontWeight: 600, cursor: "pointer" }}>
                {f==="all"?"All":f==="with"?"Has Habits":"No Habits"}
              </button>
            ))}
            <span style={{ fontFamily: "var(--font-body)", fontSize: "0.7rem", fontWeight: 700, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.06em", marginLeft: "0.5rem" }}>Sort:</span>
            {(["az","za","date"] as const).map(s => (
              <button key={s} onClick={() => setSortMode(s)}
                style={{ padding: "0.35rem 0.7rem", borderRadius: "var(--r-full)", border: `1.5px solid ${sortMode===s?"var(--accent)":"var(--border)"}`, background: sortMode===s?"var(--accent-light)":"transparent", color: sortMode===s?"var(--accent-dark)":"var(--text-secondary)", fontFamily: "var(--font-body)", fontSize: "0.72rem", fontWeight: 600, cursor: "pointer" }}>
                {s==="az"?"A-Z":s==="za"?"Z-A":"By Date"}
              </button>
            ))}
          </div>
          {useMemo(() => {
            let list = [...session.clients];
            if (filterMode === "with") list = list.filter(c => (summaries.get(c.id) ?? []).length > 0);
            if (filterMode === "without") list = list.filter(c => (summaries.get(c.id) ?? []).length === 0);
            if (sortMode === "az") list.sort((a,b) => a.fullName.localeCompare(b.fullName));
            if (sortMode === "za") list.sort((a,b) => b.fullName.localeCompare(a.fullName));
            if (sortMode === "date") list.sort((a,b) => (a.nextRenewalDate||"").localeCompare(b.nextRenewalDate||""));
            return list;
          }, [filterMode, sortMode, summaries, session.clients]).map(client => {
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
                        <span key={i.habit.id} className="habit-streak-badge">ðŸ”¥ {i.streak}d streak</span>
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
                        <span className="streak-flame">ðŸ”¥ {streak}</span>
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

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   EXERCISES VIEW
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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
      <p className="page-subtitle">{exercises.length} exercises across all movement patterns â€” tagged by body part, equipment, and difficulty.</p>

      <div className="panel">
        <div className="search-wrapper" style={{ marginBottom: "1rem" }}>
          <span className="search-icon">âŒ•</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search exercisesâ€¦" />
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
            <div className="empty-state-icon">ðŸ‹ï¸</div>
            <p>No exercises match your filters.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   CALENDAR VIEW
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function CalendarView({ session, onNav, bookedSessions, onUpdateSessions, push, clients }: {
  session: CoachSession;
  onNav: (id: NavId) => void;
  bookedSessions: BookedSession[];
  onUpdateSessions: React.Dispatch<React.SetStateAction<BookedSession[]>>;
  push: (message: string, type?: ToastType, options?: ToastOptions) => number;
  clients: ClientProfile[];
}) {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string>(today.toISOString().split("T")[0]);
  const [bookingClient, setBookingClient] = useState<{ id: string; fullName: string } | null>(null);

  const monthName = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay();
  const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

  const prevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  const nextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));

  const getDateStr = (d: number) => { const dt = new Date(viewDate.getFullYear(), viewDate.getMonth(), d); return dt.toISOString().split("T")[0]; };
  const isToday = (d: number) => getDateStr(d) === today.toISOString().split("T")[0];
  const sessionsOnDate = (d: number) => bookedSessions.filter(s => s.date === getDateStr(d) && s.status !== 'cancelled');
  const selectedSessions = bookedSessions.filter(s => s.date === selectedDate && s.status !== 'cancelled');

  const markComplete = (id: string) => onUpdateSessions(prev => prev.map(s => s.id === id ? { ...s, status: 'completed' as const } : s));
  const cancelSession = (id: string) => onUpdateSessions(prev => prev.map(s => s.id === id ? { ...s, status: 'cancelled' as const } : s));

  return (
    <div className="page-view">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "2rem", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.03em", margin: "0 0 0.15rem" }}>Calendar</h1>
          <p style={{ fontFamily: "var(--font-body)", fontSize: "0.8rem", color: "var(--text-secondary)" }}>{bookedSessions.length} sessions · {bookedSessions.filter(s => s.status === 'completed').length} completed</p>
        </div>
        <button className="btn-primary btn-sm" onClick={() => { if (clients.length > 0) setBookingClient({ id: clients[0].id, fullName: clients[0].fullName }); }}>
          <span className="material-symbols-outlined" style={{ fontSize: "0.9rem" }}>add</span>
          Book Session
        </button>
      </div>

      {/* Month Calendar Card */}
      <div className="card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
        {/* Month Navigation */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
          <button className="btn-ghost btn-sm" onClick={prevMonth}><span className="material-symbols-outlined">chevron_left</span></button>
          <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "1.15rem", color: "var(--text-primary)", margin: 0 }}>{monthName}</h2>
          <button className="btn-ghost btn-sm" onClick={nextMonth}><span className="material-symbols-outlined">chevron_right</span></button>
        </div>

        {/* Day Headers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "0.25rem", marginBottom: "0.5rem" }}>
          {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => (
            <div key={d} style={{ textAlign: "center", fontFamily: "var(--font-body)", fontSize: "0.68rem", fontWeight: 700, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.06em", padding: "0.4rem 0" }}>{d}</div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "0.25rem" }}>
          {Array.from({ length: startOffset }).map((_, i) => <div key={`empty-${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateStr = getDateStr(day);
            const todayFlag = isToday(day);
            const sessions = sessionsOnDate(day);
            const isSelected = dateStr === selectedDate;
            return (
              <div key={day}
                onClick={() => setSelectedDate(dateStr)}
                style={{
                  padding: "0.35rem", borderRadius: "var(--r-md)", cursor: "pointer", textAlign: "center",
                  background: isSelected ? "var(--primary)" : todayFlag ? "var(--primary-light)" : "transparent",
                  border: isSelected ? "2px solid var(--primary-dark)" : todayFlag ? "2px solid var(--primary)" : "2px solid transparent",
                  transition: "all 0.15s",
                  minHeight: "56px",
                }}
              >
                <div style={{ fontFamily: "var(--font-heading)", fontWeight: todayFlag ? 800 : 600, fontSize: "0.85rem", color: isSelected ? "white" : "var(--text-primary)" }}>{day}</div>
                {sessions.length > 0 && (
                  <div style={{ display: "flex", justifyContent: "center", gap: "0.15rem", marginTop: "0.3rem", flexWrap: "wrap" }}>
                    {sessions.slice(0, 3).map(s => (
                      <div key={s.id} style={{ width: "6px", height: "6px", borderRadius: "50%", background: s.sessionType === 'virtual' ? "var(--info)" : "var(--accent)" }} title={`${s.clientName} - ${s.time}`} />
                    ))}
                    {sessions.length > 3 && <span style={{ fontFamily: "var(--font-body)", fontSize: "0.55rem", color: isSelected ? "white" : "var(--outline)" }}>+{sessions.length - 3}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Date Sessions */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: "1.5rem", alignItems: "start" }}>
        <div className="card">
          <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "1rem", color: "var(--text-primary)", margin: "0 0 1rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <span className="material-symbols-outlined" style={{ fontSize: "1.1rem", color: "var(--primary)" }}>event</span>
            {new Date(selectedDate + "T12:00:00").toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}
            <span className="badge badge-neutral" style={{ fontSize: "0.6rem" }}>{selectedSessions.length} sessions</span>
          </h2>
          {selectedSessions.length === 0 ? (
            <div style={{ padding: "2rem 0", textAlign: "center" }}>
              <span className="material-symbols-outlined" style={{ fontSize: "2rem", color: "var(--outline)", display: "block", marginBottom: "0.5rem" }}>event_busy</span>
              <p style={{ fontFamily: "var(--font-body)", fontSize: "0.85rem", color: "var(--outline)" }}>No sessions on this day.</p>
              <button className="btn-primary btn-sm" style={{ marginTop: "0.75rem" }} onClick={() => { if (clients.length > 0) setBookingClient({ id: clients[0].id, fullName: clients[0].fullName }); }}>
                + Book Session
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {selectedSessions.map(s => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem", borderRadius: "var(--r-md)", border: "1px solid var(--border-light)", background: "var(--surface-container)" }}>
                  <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: s.sessionType === 'virtual' ? "var(--info-light)" : "var(--accent-light)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "0.9rem", color: s.sessionType === 'virtual' ? "var(--info)" : "var(--accent-dark)" }}>{s.sessionType === 'virtual' ? "videocam" : "person_pin"}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "0.9rem", color: "var(--text-primary)" }}>{s.clientName}</div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: "0.72rem", color: "var(--outline)" }}>{s.time} · {s.duration}min · {s.sessionType === 'virtual' ? 'Virtual' : 'In-Person'}</div>
                  </div>
                  <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "0.9rem", color: "var(--primary)" }}>{s.time}</span>
                  <button className="btn-ghost btn-xs" onClick={() => markComplete(s.id)}><span className="material-symbols-outlined" style={{ fontSize: "0.85rem", color: "var(--success)" }}>check_circle</span></button>
                  <button className="btn-ghost btn-xs" onClick={() => cancelSession(s.id)}><span className="material-symbols-outlined" style={{ fontSize: "0.85rem", color: "var(--danger)" }}>cancel</span></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar Stats */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div className="card">
            <h3 style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "0.9rem", color: "var(--text-primary)", marginBottom: "1rem" }}>Overview</h3>
            {[
              { label: "Today", value: bookedSessions.filter(s => s.date === today.toISOString().split("T")[0] && s.status !== 'cancelled').length, icon: "today", color: "var(--primary)" },
              { label: "This Month", value: bookedSessions.filter(s => s.status !== 'cancelled' && s.date.startsWith(viewDate.toISOString().split("T")[0].substring(0,7))).length, icon: "calendar_month", color: "var(--info)" },
              { label: "Completed", value: bookedSessions.filter(s => s.status === 'completed').length, icon: "check_circle", color: "var(--success)" },
              { label: "Total", value: bookedSessions.length, icon: "event", color: "var(--text-primary)" },
            ].map(stat => (
              <div key={stat.label} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.5rem 0", borderBottom: "1px solid var(--border-light)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: "0.9rem", color: stat.color }}>{stat.icon}</span>
                <span style={{ flex: 1, fontFamily: "var(--font-body)", fontSize: "0.8rem", color: "var(--text-secondary)" }}>{stat.label}</span>
                <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "1rem", color: stat.value > 0 ? stat.color : "var(--outline)" }}>{stat.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {bookingClient && (
        <SessionBookingModal client={bookingClient} onClose={() => setBookingClient(null)} onSuccess={() => setBookingClient(null)}
          onBookSession={(s) => { onUpdateSessions(prev => [...prev, s]); push(`Session booked with ${s.clientName}`, 'success'); }}
          push={(msg, type) => { push(msg, type as any); }} clients={clients} />
      )}
    </div>
  );
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   NUTRITION SWAP AGENT
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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
      // Silent fail â€” agentic fallback
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
        <span style={{ fontSize: "1.1rem" }}>ðŸ”„</span>
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
              <div className="swap-food-name">{food.swapped ? "âœ“ " : ""}{food.name}</div>
              <div className="swap-food-macros">{food.calories} kcal Â· {food.proteinG}g P Â· {food.carbsG}g C Â· {food.fatG}g F</div>
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
                    <span className="swap-result-title">âš¡ {suggestion.suggestion.name}</span>
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
                  <button className="swap-apply-btn" onClick={applySwap}>âœ“ Apply this swap</button>
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
          <button className="swap-history-btn" onClick={loadHistory} disabled={historyLoading}>View history â†’</button>
        </div>
      </div>

      {showHistory && (
        <div className="swap-history-panel">
          <div className="swap-history-header">
            <h4>Swap History</h4>
            <button className="ghost sm" onClick={() => setShowHistory(false)}>âœ•</button>
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
                    <span className="swap-history-arrow">â†’</span>
                    <span className="swap-history-food swap-history-new">{s.swapSuggestion.name}</span>
                  </div>
                  <div className="swap-history-meta">
                    {s.originalFood.calories} kcal â†’ {s.swapSuggestion.calories} kcal
                    {s.appliedAt && <span className="muted text-xs"> Â· {new Date(s.appliedAt).toLocaleDateString()}</span>}
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

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   RECIPE PANEL
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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
          <option value="">Pick a foodâ€¦</option>
          {foodOptions.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
        </select>
        <button
          className="ghost sm"
          disabled={!selectedFood || loading}
          onClick={() => selectedFood && generateRecipe(selectedFood)}
        >
          {loading ? "â€¦" : "ðŸ³ Generate Recipe"}
        </button>
      </div>

      {showPanel && recipe && (
        <div className="recipe-panel">
          <div className="recipe-panel-header">
            <div>
              <div className="recipe-title">{recipe.name}</div>
              <div className="recipe-meta">
                <span className="recipe-meta-item">â± Prep {recipe.prepTime}min</span>
                <span className="recipe-meta-item">ðŸ”¥ Cook {recipe.cookTime}min</span>
              </div>
            </div>
            <button className="icon" style={{ fontSize: "1rem" }} onClick={() => setShowPanel(false)}>âœ•</button>
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

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   PDF INVOICE GENERATOR
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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
  doc.text("Tax Invoice Â· UK VAT Registered", 20, 34);

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
  doc.text("Coaching Services â€” Monthly Subscription", 22, y);
  doc.text("1", 123, y);
  doc.text(`Â£${netAmount.toFixed(2)}`, 140, y);
  doc.text(`Â£${vatAmount.toFixed(2)}`, 160, y);

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
  doc.text(`Â£${subscription.amountGbp.toFixed(2)}`, 160, y + 3);

  // VAT summary
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(`Net amount: Â£${netAmount.toFixed(2)}    VAT rate: 20%    VAT: Â£${vatAmount.toFixed(2)}    Gross: Â£${subscription.amountGbp.toFixed(2)}`, 20, y);

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
  doc.text(`${workspace.name} â€” HMRC Tax Report`, 20, 13);

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
    doc.text(`Â£${net.toFixed(2)}`, 110, y);
    doc.text(`Â£${vat.toFixed(2)}`, 130, y);
    doc.text(`Â£${sub.amountGbp.toFixed(2)}`, 155, y);

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
  doc.text(`Â£${totalNet.toFixed(2)}`, 110, y + 1);
  doc.text(`Â£${totalVat.toFixed(2)}`, 130, y + 1);
  doc.text(`Â£${totalGross.toFixed(2)}`, 155, y + 1);

  doc.setDocumentProperties({ title: `Tax Report ${today}`, author: workspace.name });
  doc.save(`tax-report-${today}.pdf`);
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   CLIENT APP PREVIEW
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
type ClientAppTab = "today"|"plan"|"checkin"|"messages";

function ClientAppPreviewInner({ clientPortal, onCheckInSuccess }: { clientPortal: ClientSession; onCheckInSuccess?: () => void }) {
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
      const result = await fetchJson<{id: string}>("/check-ins", {
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
      if (checkInPhoto && result?.id) {
        try {
          const [header, data] = checkInPhoto.split(",");
          const mime = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
          const binary = atob(data);
          const arr = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
          const blob = new Blob([arr], { type: mime });
          const formData = new FormData();
          formData.append("photo", blob, "photo.jpg");
          await fetch(`/api/check-ins/${result.id}/photo`, { method: "POST", body: formData });
        } catch { /* photo upload failed, non-critical */ }
      }
      setCheckInSuccess(true);
      setCheckInPhoto(null);
      setTimeout(() => setCheckInSuccess(false), 3000);
      onCheckInSuccess?.();
    } catch { /* silent */ }
    setCheckInSubmitting(false);
  };

  return (
    <div className="client-app">
      <div className="client-app-status-bar">
        <span className="client-app-status-bar-left">9:41</span>
        <span className="client-app-status-bar-right"><span>â—â—â—â—â—</span><span>ðŸ“¶</span><span>ðŸ”‹</span></span>
      </div>

      {activeTab === "today" && (
        <div className="client-app-header">
          <div className="client-app-greeting">{greeting}, {firstName}!</div>
          <div className="client-app-date">{today.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</div>
          <div className="client-app-streak-row">
            <span className="client-app-streak-badge">ðŸ”¥ 5 day streak</span>
            <span className="client-app-streak-badge" style={{ background: "rgba(96,165,250,0.12)", borderColor: "rgba(96,165,250,0.25)", color: "#60a5fa" }}>ðŸ“‹ {workouts.length} sessions this week</span>
          </div>
          <div className="client-app-stats-row" style={{ marginTop: 14 }}>
            <div className="client-app-stat-chip">
              <span className="client-app-stat-chip-label">Adherence</span>
              <span className="client-app-stat-chip-value" style={{ color: clientPortal.client.adherenceScore >= 70 ? "#3ae97a" : "#fbbf24" }}>{clientPortal.client.adherenceScore}%</span>
            </div>
            <div className="client-app-stat-chip">
              <span className="client-app-stat-chip-label">Energy</span>
              <span className="client-app-stat-chip-value">{clientPortal.latestCheckIn?.progress.energyScore ?? "â€”"}/10</span>
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
                <div className="client-app-card-label">ðŸ’ª Workout</div>
                <div className="client-app-card-title">{workouts[todayIndex] || workouts[0]}</div>
                <div className="client-app-card-chip">Approved</div>
              </div>
              <div className="client-app-card">
                <div className="client-app-card-label">ðŸ¥— Nutrition</div>
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
                <div className={`client-app-habit-check${h.done ? " checked" : ""}`}>{h.done ? "âœ“" : ""}</div>
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
                  <span className={`client-app-day-label${isToday ? " today" : ""}`}>{isToday ? "â— " : ""}{day}{isToday ? " â€” Today" : ""}</span>
                  <div className="client-app-day-chips">
                    {workout && <span className="client-app-day-chip client-app-day-chip--workout">ðŸ’ª</span>}
                    {nutrition[i] && <span className="client-app-day-chip client-app-day-chip--nutrition">ðŸ¥—</span>}
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
            <div className="client-app-success-banner">âœ“ Check-in submitted!</div>
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
              <span>{checkInPhoto ? "âœ“" : "ðŸ“·"}</span> {checkInPhoto ? "Photo selected" : "Add Progress Photo"}
            </button>
            {checkInPhoto && <img src={checkInPhoto} alt="Preview" style={{ width: "100%", borderRadius: "var(--r-lg)", marginTop: "0.5rem" }} />}
            <button type="submit" className="client-app-submit-btn" disabled={checkInSubmitting}>
              {checkInSubmitting ? "Submittingâ€¦" : "Submit Check-In"}
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
            <input className="client-app-message-input" placeholder="Type a messageâ€¦" />
          </div>
        </>
      )}

      <div className="client-app-tabs">
        {([
          { id: "today" as ClientAppTab, icon: "ðŸ ", label: "Today" },
          { id: "plan" as ClientAppTab, icon: "ðŸ“‹", label: "Plan" },
          { id: "checkin" as ClientAppTab, icon: "âœ…", label: "Check-In" },
          { id: "messages" as ClientAppTab, icon: "ðŸ’¬", label: "Messages" },
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
      <p className="page-subtitle">See exactly what your clients see â€” live mobile simulator.</p>

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
                  <span className="phone-status-bar-right"><span>â—â—â—â—â—</span><span>ðŸ“¶</span><span>ðŸ”‹</span></span>
                </div>
                <div className="phone-viewport">
                  {/* @ts-expect-error â€” loadCoach/selectedClientId declared later, visible at runtime */}
                  <ClientAppPreviewInner clientPortal={clientPortal} onCheckInSuccess={() => (loadCoach as any)((selectedClientId as any) ?? undefined)} />
                </div>
                <div className="phone-home-bar" />
              </div>
              <p className="phone-preview-label">CoachOS Client App â€” {clientPortal.client.fullName}</p>
            </>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">ðŸ“±</div>
              <p>Select a client to preview their experience.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AICoachView({ session, push }: { session: CoachSession; push: (message: string, type?: ToastType, options?: ToastOptions) => number }) {
  const [selectedClientId, setSelectedClientId] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user"|"ai"; content: string }>>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [fillLoading, setFillLoading] = useState(false);
  const [clientData, setClientData] = useState<ClientProfile | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const resultCardRef = useRef<HTMLDivElement>(null);

  const selectedClient = session.clients.find((c) => c.id === selectedClientId) ?? null;

  const QUICK_PROMPTS = {
    workout: [
      { label: "3-Day Split Plan", prompt: "Create a 3-day workout split plan for this week with exercises, sets, reps, and rest periods. Consider their medical conditions and fitness level." },
      { label: "Push/Pull/Legs", prompt: "Design a push/pull/legs routine with 4 exercises per day. Specify sets, reps, and any modifications needed for their conditions." },
      { label: "Home Workout", prompt: "Create a bodyweight-only home workout plan. No equipment needed. 5 exercises per session with progressions." },
      { label: "Weekly Schedule", prompt: "Create a full weekly workout schedule with rest days, cardio, and strength training balanced across the week." },
      { label: "Rehab Focus", prompt: "Design a workout plan that works around their medical conditions and injuries. Focus on safe, therapeutic exercises." },
    ],
    nutrition: [
      { label: "3-Meal Plan", prompt: "Create a 3-meal nutrition plan for today with quantified ingredients, macros per meal, and prep notes." },
      { label: "Weekly Meal Plan", prompt: "Create a 7-day meal plan with 3 meals per day. Each meal must have quantified ingredients and full macro breakdown." },
      { label: "Pre/Post Workout", prompt: "Suggest optimal pre-workout and post-workout meals with timing, ingredients, and macro breakdown." },
      { label: "Medical Diet", prompt: "Analyze their medical conditions and create a tailored meal plan that addresses those conditions with specific foods to eat and avoid." },
      { label: "Cheat Meal Plan", prompt: "Create a cheat-meal friendly 3-meal plan that stays within their macro targets. Make it satisfying but balanced." },
    ],
  };

  useEffect(() => {
    if (!selectedClientId) { setClientData(null); return; }
    const saved = localStorage.getItem(`coachos_chat_${selectedClientId}`);
    setMessages(saved ? JSON.parse(saved) : []);
    setHistoryOpen(false);
    fetchJson<ClientProfile>(`/clients/${selectedClientId}`)
      .then(setClientData)
      .catch(() => push("Failed to fetch client data", "error"));
  }, [selectedClientId]);

  // Save chat history when messages change
  useEffect(() => {
    if (selectedClientId && messages.length > 0) {
      localStorage.setItem(`coachos_chat_${selectedClientId}`, JSON.stringify(messages));
    }
  }, [messages, selectedClientId]);

  const sendPrompt = async (prompt: string) => {
    if (!selectedClientId || !prompt.trim()) return;
    setMessages((prev) => [...prev, { role: "user", content: prompt }]);
    setInput("");
    setLoading(true);
    try {
      const data = await fetchJson<{ content: string }>("/ai/coach", {
        method: "POST",
        body: JSON.stringify({ clientId: selectedClientId, prompt: prompt.trim() }),
      });
      setMessages((prev) => [...prev, { role: "ai", content: data.content }]);
    } catch {
      push("AI request failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); sendPrompt(input); };

  const sortedClients = useMemo(
    () => [...session.clients].sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [session.clients]
  );

  const aiMessages = useMemo(() => messages.filter((m) => m.role === "ai"), [messages]);
  const lastAi = aiMessages.length > 0 ? aiMessages[aiMessages.length - 1] : null;

  const assignPlan = async (content: string) => {
    try {
      const plans = await fetchJson<ProgramPlan[]>(`/plans?clientId=${selectedClientId}`);
      let planId = (plans[0] as any)?.id;
      if (!planId) {
        const gen = await fetchJson<ProgramPlan>("/plans/generate", { method: "POST", body: JSON.stringify({ clientId: selectedClientId }) });
        planId = (gen as any)?.id;
      }
      if (!planId) { push("Could not find or create a plan", "error"); return; }
      const isNutrition = content.includes("\uD83C\uDF7D\uFE0F") || content.includes("MEAL") || content.includes("Meal ");
      const isWorkout = content.includes("\uD83D\uDCAA") || content.includes("WORKOUT") || content.includes("Bench Press") || content.includes("Squat");
      const payload: Record<string, unknown> = {};
      if (isNutrition) payload.assignedNutrition = content;
      else if (isWorkout) payload.assignedWorkout = content;
      else payload.assignedPlan = content;
      await fetchJson(`/plans/${planId}`, { method: "PATCH", body: JSON.stringify(payload) });
      const assignName = selectedClient?.fullName.split(" ")[0] ?? "client";
      push(`Plan assigned to ${assignName}! Open their profile.`, "success");
    } catch { push("Failed to assign plan", "error"); }
  };

  const firstName = selectedClient?.fullName?.split(" ")[0] ?? "client";

  return (
    <div className="page-view">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.75rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontFamily: "Manrope, sans-serif", fontSize: "2rem", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: "0.25rem" }}>
            AI COACH
          </h1>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: "0.8rem", color: "var(--on-surface-variant)", fontWeight: 500 }}>
            Your Personal Training Intelligence
          </p>
        </div>
        <select
          value={selectedClientId}
          onChange={(e) => setSelectedClientId(e.target.value)}
          style={{
            padding: "0.55rem 2.25rem 0.55rem 1rem",
            borderRadius: "var(--r-full)",
            border: "1.5px solid var(--outline-variant)",
            background: "var(--surface-container)",
            color: "var(--text-primary)",
            fontFamily: "Inter, sans-serif",
            fontSize: "0.85rem",
            fontWeight: 600,
            outline: "none",
            cursor: "pointer",
            minWidth: "240px",
            appearance: "none",
            WebkitAppearance: "none",
            backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%2394a3b8' viewBox='0 0 16 16'%3E%3Cpath d='M7.247 11.14L2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z'/%3E%3C/svg%3E\")",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 0.75rem center",
          }}
        >
          <option value="">Select Client</option>
          {sortedClients.map((c) => (
            <option key={c.id} value={c.id}>{c.fullName}</option>
          ))}
        </select>
      </div>

      {selectedClient && clientData ? (
        <div style={{ display: "grid", gridTemplateColumns: "270px 1fr 220px", gap: "1.25rem", alignItems: "start" }}>
          <div style={{ position: "relative", borderRadius: "var(--r-xl)", padding: "2px", background: "linear-gradient(135deg, var(--primary), var(--accent))" }}>
            <div className="card-glass" style={{ padding: "1.25rem", borderRadius: "calc(var(--r-xl) - 2px)", background: "rgba(26,26,46,0.9)" }}>
              <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.58rem", fontWeight: 700, color: "var(--primary)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "0.75rem" }}>
                Client Context
              </div>

              <div style={{ marginBottom: "0.75rem" }}>
                <div style={{ fontFamily: "Manrope, sans-serif", fontWeight: 800, fontSize: "1rem", color: "var(--text-primary)", marginBottom: "0.1rem", lineHeight: 1.2 }}>
                  {selectedClient.fullName}
                </div>
                <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.68rem", color: "var(--outline)", wordBreak: "break-all" }}>
                  {selectedClient.email}
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.45rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
                <span className={`badge ${clientData.status === "at_risk" ? "badge-danger" : clientData.status === "trial" ? "badge-warning" : "badge-success"}`} style={{ fontSize: "0.62rem" }}>
                  {clientData.status === "at_risk" ? "At Risk" : clientData.status === "trial" ? "Trial" : "Active"}
                </span>
                <span className="badge badge-accent" style={{ fontSize: "0.62rem" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: "0.7rem" }}>trending_up</span>
                  {clientData.adherenceScore}%
                </span>
              </div>

              <div style={{ width: "100%", height: "5px", background: "var(--bg-elevated)", borderRadius: "var(--r-full)", marginBottom: "1rem", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${clientData.adherenceScore}%`, background: clientData.adherenceScore < 50 ? "var(--danger)" : clientData.adherenceScore < 75 ? "var(--warning)" : "var(--primary)", borderRadius: "var(--r-full)", transition: "width 0.6s ease" }} />
              </div>

              <div style={{ marginBottom: "0.5rem" }}>
                <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.55rem", fontWeight: 700, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.1rem" }}>
                  Goal
                </div>
                <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.78rem", color: "var(--text-primary)", fontWeight: 600, lineHeight: 1.3 }}>
                  {clientData.goal || "Not set"}
                </div>
              </div>

              {clientData.healthConditions.length > 0 && (
                <div style={{ marginBottom: "0.5rem", padding: "0.55rem", background: "var(--warning-light)", borderRadius: "var(--r-md)", border: "1px solid rgba(245,158,11,0.15)" }}>
                  <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.55rem", fontWeight: 700, color: "var(--warning-text)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.3rem", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "0.75rem" }}>warning</span>
                    Medical
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.22rem" }}>
                    {clientData.healthConditions.map((hc, i) => (
                      <span key={i} style={{ background: "var(--warning)", color: "#000", padding: "0.12rem 0.42rem", borderRadius: "var(--r-full)", fontFamily: "Inter, sans-serif", fontSize: "0.62rem", fontWeight: 600 }}>
                        {hc.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {clientData.supplements.length > 0 && (
                <div style={{ marginBottom: "0.5rem" }}>
                  <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.55rem", fontWeight: 700, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.22rem" }}>
                    Supplements
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.22rem" }}>
                    {clientData.supplements.map((s, i) => (
                      <span key={i} style={{ background: "var(--primary-container)", color: "var(--primary-mid)", padding: "0.12rem 0.42rem", borderRadius: "var(--r-full)", fontFamily: "Inter, sans-serif", fontSize: "0.62rem", fontWeight: 600 }}>
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {clientData.nutritionCalories != null && (
                <div style={{ marginBottom: "0.5rem", padding: "0.55rem", background: "var(--surface-container)", borderRadius: "var(--r-md)" }}>
                  <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.55rem", fontWeight: 700, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.3rem" }}>
                    Daily Macros
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.3rem" }}>
                    <div>
                      <div style={{ fontFamily: "Manrope, sans-serif", fontWeight: 800, fontSize: "0.88rem", color: "var(--primary)", lineHeight: 1 }}>{clientData.nutritionCalories}</div>
                      <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.52rem", color: "var(--outline)", textTransform: "uppercase" }}>Cal</div>
                    </div>
                    <div>
                      <div style={{ fontFamily: "Manrope, sans-serif", fontWeight: 800, fontSize: "0.88rem", color: "var(--accent)", lineHeight: 1 }}>{clientData.nutritionProteinG ?? "?"}g</div>
                      <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.52rem", color: "var(--outline)", textTransform: "uppercase" }}>Prot</div>
                    </div>
                    <div>
                      <div style={{ fontFamily: "Manrope, sans-serif", fontWeight: 800, fontSize: "0.88rem", color: "var(--info)", lineHeight: 1 }}>{clientData.nutritionCarbsG ?? "?"}g</div>
                      <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.52rem", color: "var(--outline)", textTransform: "uppercase" }}>Carbs</div>
                    </div>
                    <div>
                      <div style={{ fontFamily: "Manrope, sans-serif", fontWeight: 800, fontSize: "0.88rem", color: "var(--success)", lineHeight: 1 }}>{clientData.nutritionFatG ?? "?"}g</div>
                      <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.52rem", color: "var(--outline)", textTransform: "uppercase" }}>Fat</div>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.35rem" }}>
                <div>
                  <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.55rem", fontWeight: 700, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.08rem" }}>Water</div>
                  <div style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "0.78rem", color: "var(--info)" }}>{clientData.dailyWaterTarget}L</div>
                </div>
                <div>
                  <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.55rem", fontWeight: 700, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.08rem" }}>Steps / day</div>
                  <div style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "0.78rem", color: "var(--accent)" }}>{clientData.dailyStepsTarget?.toLocaleString()}</div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="card-glass" style={{ padding: "1.15rem", marginBottom: "1rem" }}>
              <form onSubmit={handleSubmit}>
                <div style={{ position: "relative" }}>
                  <span className="material-symbols-outlined" style={{ position: "absolute", left: "1rem", top: "50%", transform: "translateY(-50%)", color: "var(--primary)", fontSize: "1.15rem", pointerEvents: "none" }}>
                    smart_toy
                  </span>
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={`Ask anything about ${firstName}...`}
                    style={{
                      width: "100%",
                      padding: "0.72rem 3.25rem 0.72rem 2.75rem",
                      borderRadius: "var(--r-full)",
                      border: "1.5px solid var(--outline-variant)",
                      background: "var(--surface-container)",
                      color: "var(--text-primary)",
                      fontFamily: "Inter, sans-serif",
                      fontSize: "0.85rem",
                      outline: "none",
                      boxSizing: "border-box",
                      transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.boxShadow = "0 0 0 3px var(--primary-container)"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "var(--outline-variant)"; e.currentTarget.style.boxShadow = "none"; }}
                  />
                  <button
                    type="submit"
                    disabled={loading || !input.trim()}
                    style={{
                      position: "absolute",
                      right: "4px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: "36px",
                      height: "36px",
                      borderRadius: "50%",
                      border: "none",
                      background: loading || !input.trim() ? "var(--surface-container-high)" : "linear-gradient(135deg, var(--primary-dark), var(--primary))",
                      color: loading || !input.trim() ? "var(--outline)" : "white",
                      cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 0.2s ease",
                      boxShadow: loading || !input.trim() ? "none" : "0 2px 12px var(--primary-glow)",
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: "1.05rem" }}>auto_awesome</span>
                  </button>
                </div>
              </form>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.7rem" }}>
                {[
                  { label: "Weekly Workout", prompt: QUICK_PROMPTS.workout[3].prompt, icon: "fitness_center" },
                  { label: "Meal Plan", prompt: QUICK_PROMPTS.nutrition[0].prompt, icon: "restaurant" },
                  { label: "Progress Review", prompt: `Review ${firstName}'s current progress. Analyze their check-in metrics and suggest 3 actionable improvements.`, icon: "trending_up" },
                  { label: "Medical Diet", prompt: QUICK_PROMPTS.nutrition[3].prompt, icon: "medical_services" },
                ].map((chip) => (
                  <button
                    key={chip.label}
                    onClick={() => sendPrompt(chip.prompt)}
                    disabled={loading}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      padding: "0.25rem 0.7rem",
                      borderRadius: "var(--r-full)",
                      border: "1px solid var(--outline-variant)",
                      background: "var(--surface-container)",
                      color: loading ? "var(--outline)" : "var(--on-surface-variant)",
                      fontFamily: "Inter, sans-serif",
                      fontSize: "0.7rem",
                      fontWeight: 600,
                      cursor: loading ? "not-allowed" : "pointer",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.color = "var(--primary)"; e.currentTarget.style.background = "var(--primary-container)"; } }}
                    onMouseLeave={(e) => { if (!loading) { e.currentTarget.style.borderColor = "var(--outline-variant)"; e.currentTarget.style.color = "var(--on-surface-variant)"; e.currentTarget.style.background = "var(--surface-container)"; } }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: "0.75rem" }}>{chip.icon}</span>
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            {loading && (
              <div className="card-glass" style={{ padding: "1.5rem", animation: "fadeIn 0.3s ease", marginBottom: "0.75rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", marginBottom: "1rem" }}>
                  <div className="spinner" style={{ width: "20px", height: "20px", borderWidth: "2px" }} />
                  <span style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "0.85rem", color: "var(--text-primary)" }}>
                    Analysing {firstName}'s profile...
                  </span>
                </div>
                <div style={{ height: "10px", borderRadius: "var(--r-full)", background: "linear-gradient(90deg, var(--surface-container) 0%, var(--surface-container-high) 50%, var(--surface-container) 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s ease infinite", marginBottom: "0.45rem" }} />
                <div style={{ height: "10px", borderRadius: "var(--r-full)", width: "72%", background: "linear-gradient(90deg, var(--surface-container) 0%, var(--surface-container-high) 50%, var(--surface-container) 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s ease infinite", animationDelay: "0.15s", marginBottom: "0.45rem" }} />
                <div style={{ height: "10px", borderRadius: "var(--r-full)", width: "45%", background: "linear-gradient(90deg, var(--surface-container) 0%, var(--surface-container-high) 50%, var(--surface-container) 100%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s ease infinite", animationDelay: "0.3s" }} />
              </div>
            )}

            {!loading && lastAi && (
              <>
                {messages.filter(m => m.role === "user").map((msg, i) => (
                  <div key={i} className="card-glass" style={{ padding: "0.85rem 1.15rem", marginBottom: "0.5rem", animation: "fadeIn 0.3s ease", display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
                    <span style={{ width: "24px", height: "24px", borderRadius: "50%", background: "var(--surface-container-high)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: "0.8rem", color: "var(--on-surface-variant)" }}>person</span>
                    </span>
                    <div>
                      <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.62rem", fontWeight: 700, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: "0.15rem" }}>You</span>
                      <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{msg.content}</span>
                    </div>
                  </div>
                ))}
                <div ref={resultCardRef} className="card-glass" style={{ padding: "1.5rem", animation: "fadeIn 0.4s ease", marginBottom: "0.75rem", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: "-30%", right: "-10%", width: "140px", height: "140px", background: "var(--primary-glow)", borderRadius: "50%", filter: "blur(40px)", pointerEvents: "none", opacity: 0.4 }} />
                  <div style={{ position: "relative", zIndex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem", paddingBottom: "0.65rem", borderBottom: "1px solid var(--border)" }}>
                      <span style={{ width: "28px", height: "28px", borderRadius: "var(--r-md)", background: "linear-gradient(135deg, var(--primary-dark), var(--primary))", display: "grid", placeItems: "center" }}>
                        <span className="material-symbols-outlined" style={{ fontSize: "0.9rem", color: "white" }}>smart_toy</span>
                      </span>
                      <span style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "0.82rem", color: "var(--text-primary)" }}>CoachOS AI</span>
                      <span style={{ marginLeft: "auto", fontFamily: "Inter, sans-serif", fontSize: "0.62rem", color: "var(--outline)", background: "var(--surface-container)", padding: "0.12rem 0.5rem", borderRadius: "var(--r-full)", fontWeight: 600 }}>Generated</span>
                    </div>
                    <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.7, whiteSpace: "pre-wrap", maxHeight: "380px", overflowY: "auto" }}>
                      {lastAi.content.replace(/```json[\s\S]*?```/g, "").trim()}
                    </div>
                    <div style={{ display: "flex", gap: "0.45rem", marginTop: "0.9rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
                      <button
                        className="btn-primary btn-sm"
                        onClick={() => {
                          resultCardRef.current?.scrollIntoView({ behavior: "smooth" });
                          const el = resultCardRef.current;
                          if (el) {
                            el.style.boxShadow = "0 0 28px var(--primary-glow)";
                            el.style.transition = "box-shadow 0.3s ease";
                            setTimeout(() => { el.style.boxShadow = ""; }, 2000);
                          }
                        }}
                        style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "0.9rem" }}>visibility</span>
                        Review Plan
                      </button>
                      <button
                        className="btn-ghost btn-sm"
                        onClick={() => { navigator.clipboard.writeText(lastAi.content); push("Copied", "info"); }}
                        style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "0.9rem" }}>content_copy</span>
                        Copy
                      </button>
                      <button
                        className="btn-primary btn-sm"
                        onClick={() => assignPlan(lastAi.content)}
                        style={{ display: "flex", alignItems: "center", gap: "0.3rem", background: "linear-gradient(135deg, var(--accent-dark), var(--accent))", boxShadow: "0 2px 14px var(--accent-glow)", marginLeft: "auto" }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "0.9rem" }}>push_pin</span>
                        Assign to {firstName}
                      </button>
                      <button
                        className="btn-primary btn-sm"
                        onClick={async () => {
                          setFillLoading(true);
                          try {
                            const planData: Record<string, unknown> = { assignedPlan: lastAi.content, assignedAt: new Date().toISOString() };
                            const plans = await fetchJson<any[]>(`/plans?clientId=${selectedClientId}`);
                            let planId = plans?.[0]?.id;
                            if (!planId) {
                              const gen = await fetchJson<any>("/plans/generate", { method: "POST", body: JSON.stringify({ clientId: selectedClientId }) });
                              planId = gen?.id;
                            }
                            if (planId) {
                              await fetchJson(`/plans/${planId}`, { method: "PATCH", body: JSON.stringify(planData) });
                            }
                            localStorage.setItem(`coachos_pending_meal_${selectedClientId}`, lastAi.content);
                            localStorage.setItem("coachos_open_meal_planner", selectedClientId);
                            push(`Meal plan ready! Open ${firstName}'s profile to review.`, "success");
                          } catch { push("Failed to store plan", "error"); }
                          finally { setFillLoading(false); }
                        }}
                        disabled={fillLoading}
                        style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "0.9rem" }}>edit_calendar</span>
                        {fillLoading ? "Populating planner..." : "Fill Meal Planner"}
                      </button>
                      <button
                        className="btn-primary btn-sm"
                        onClick={() => {
                          setFillLoading(true);
                          localStorage.setItem(`coachos_pending_workout_${selectedClientId}`, lastAi.content);
                          localStorage.setItem("coachos_open_workout_planner", selectedClientId);
                          push(`Workout plan ready! Open ${firstName}'s profile to review.`, "success");
                          setTimeout(() => setFillLoading(false), 500);
                        }}
                        disabled={fillLoading}
                        style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "0.9rem" }}>fitness_center</span>
                        {fillLoading ? "Populating planner..." : "Fill Workout Planner"}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {!loading && messages.length === 0 && (
              <div className="card-glass" style={{ padding: "2.5rem 2rem", textAlign: "center", animation: "fadeIn 0.4s ease" }}>
                <span className="material-symbols-outlined" style={{ fontSize: "3rem", color: "var(--primary)", opacity: 0.25, display: "block", marginBottom: "0.75rem" }}>smart_toy</span>
                <h3 style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "1.05rem", color: "var(--text-primary)", marginBottom: "0.4rem" }}>
                  Start generating insights
                </h3>
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: "0.78rem", color: "var(--outline)", maxWidth: "400px", margin: "0 auto" }}>
                  Ask about {firstName}'s nutrition, workouts, progress, or use the quick action buttons to generate plans instantly.
                </p>
              </div>
            )}

            {aiMessages.length > 1 && (
              <div>
                <button
                  onClick={() => setHistoryOpen(!historyOpen)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.45rem",
                    padding: "0.6rem 0.9rem",
                    borderRadius: "var(--r-md)",
                    border: "1px solid var(--border)",
                    background: "var(--surface-container)",
                    color: "var(--on-surface-variant)",
                    fontFamily: "Inter, sans-serif",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--primary-mid)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "1rem", transition: "transform 0.2s ease", transform: historyOpen ? "rotate(180deg)" : "rotate(0)" }}>
                    expand_more
                  </span>
                  Previous Generations ({aiMessages.length - 1})
                </button>
                {historyOpen && (
                  <div style={{ marginTop: "0.45rem", display: "flex", flexDirection: "column", gap: "0.4rem", animation: "fadeIn 0.2s ease" }}>
                    {aiMessages.slice(0, -1).reverse().map((msg, i) => (
                      <div key={i} className="card-glass" style={{ padding: "0.85rem 1rem" }}>
                        <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.7rem", color: "var(--on-surface-variant)", lineHeight: 1.55, whiteSpace: "pre-wrap", maxHeight: "100px", overflowY: "hidden", position: "relative" }}>
                          {(msg.content.replace(/```json[\s\S]*?```/g, "").trim()).slice(0, 280)}{msg.content.length > 280 ? "..." : ""}
                        </div>
                        <div style={{ display: "flex", gap: "0.35rem", marginTop: "0.45rem" }}>
                          <button className="btn-ghost btn-xs" onClick={() => { navigator.clipboard.writeText(msg.content); push("Copied", "info"); }} style={{ fontSize: "0.62rem", padding: "0.15rem 0.5rem" }}>
                            <span className="material-symbols-outlined" style={{ fontSize: "0.7rem" }}>content_copy</span> Copy
                          </button>
                          <button className="btn-ghost btn-xs" onClick={() => assignPlan(msg.content)} style={{ fontSize: "0.62rem", padding: "0.15rem 0.5rem" }}>
                            <span className="material-symbols-outlined" style={{ fontSize: "0.7rem" }}>push_pin</span> Assign
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.58rem", fontWeight: 700, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.15rem" }}>
              Quick Actions
            </div>

            <button
              className="quick-action"
              onClick={() => sendPrompt(QUICK_PROMPTS.nutrition[0].prompt)}
              disabled={loading}
              style={{ justifyContent: "flex-start", fontSize: "0.75rem", width: "100%", boxSizing: "border-box" }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "0.95rem" }}>restaurant</span>
              Generate Meal Plan
            </button>
            <button
              className="quick-action"
              onClick={() => sendPrompt(QUICK_PROMPTS.nutrition[1].prompt)}
              disabled={loading}
              style={{ justifyContent: "flex-start", fontSize: "0.75rem", width: "100%", boxSizing: "border-box" }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "0.95rem" }}>calendar_month</span>
              Weekly Meal Plan
            </button>
            <button
              className="quick-action"
              onClick={() => sendPrompt(QUICK_PROMPTS.workout[0].prompt)}
              disabled={loading}
              style={{ justifyContent: "flex-start", fontSize: "0.75rem", width: "100%", boxSizing: "border-box" }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "0.95rem" }}>fitness_center</span>
              Generate Workout
            </button>
            <button
              className="quick-action"
              onClick={() => sendPrompt(QUICK_PROMPTS.nutrition[3].prompt)}
              disabled={loading}
              style={{ justifyContent: "flex-start", fontSize: "0.75rem", width: "100%", boxSizing: "border-box" }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "0.95rem" }}>medical_services</span>
              Medical Diet Analysis
            </button>
            <button
              className="quick-action"
              onClick={() => sendPrompt(QUICK_PROMPTS.nutrition[4].prompt)}
              disabled={loading}
              style={{ justifyContent: "flex-start", fontSize: "0.75rem", width: "100%", boxSizing: "border-box" }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "0.95rem" }}>bakery_dining</span>
              Cheat Meal Plan
            </button>

            <div style={{ height: "1px", background: "var(--border)", margin: "0.35rem 0" }} />

            <button
              className="quick-action"
              onClick={() => sendPrompt(`Send a personalised habit nudge to ${firstName}. Encourage them to stay on track with their daily habits. Make it motivational and specific to their goals.`)}
              disabled={loading}
              style={{ justifyContent: "flex-start", fontSize: "0.75rem", width: "100%", boxSizing: "border-box" }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "0.95rem" }}>notifications</span>
              Send Habit Nudge
            </button>
            <button
              className="quick-action"
              onClick={() => sendPrompt(`Write a motivational message for ${firstName}. Acknowledge their recent effort, celebrate small wins, and inspire them to keep pushing toward their goal: ${clientData.goal || "better health"}.`)}
              disabled={loading}
              style={{ justifyContent: "flex-start", fontSize: "0.75rem", width: "100%", boxSizing: "border-box" }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "0.95rem" }}>bolt</span>
              Send Motivation Nudge
            </button>
          </div>
        </div>
      ) : selectedClient && !clientData ? (
        <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
          <div className="spinner" style={{ margin: "0 auto 1rem" }} />
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: "0.85rem", color: "var(--outline)" }}>Loading client data...</p>
        </div>
      ) : (
        <div className="card" style={{ textAlign: "center", padding: "3.5rem 2rem" }}>
          <span className="material-symbols-outlined" style={{ fontSize: "3.5rem", color: "var(--primary)", opacity: 0.25, display: "block", marginBottom: "1rem" }}>smart_toy</span>
          <h2 style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "1.15rem", color: "var(--text-primary)", marginBottom: "0.4rem" }}>Select a client to begin</h2>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: "0.82rem", color: "var(--outline)", maxWidth: "400px", margin: "0 auto" }}>
            Choose a client from the dropdown above to access AI-powered coaching insights, generate workout plans, meal plans, and more.
          </p>
        </div>
      )}
    </div>
  );
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode; onError: (msg: string) => void }, { hasError: boolean }> {
  constructor(props: any) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) { this.props.onError(error.message); }
  render() { return this.state.hasError ? null : this.props.children; }
}

/* ============================================================================
   AI COPILOT PANEL COMPONENT
   ============================================================================ */
function AICopilotPanel({
  messages, input, loading, show, onClose, onSend, onInputChange, activeNav, selectedClientName
}: {
  messages: Array<{role: string, content: string, clients?: any[]}>;
  input: string;
  loading: boolean;
  show: boolean;
  onClose: () => void;
  onSend: () => void;
  onInputChange: (v: string) => void;
  activeNav: string;
  selectedClientName: string | null;
}) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (show) setTimeout(() => inputRef.current?.focus(), 100);
  }, [show]);

  const navLabels: Record<string, string> = {
    dashboard: "Dashboard", clients: "Clients", ai: "AI Coach", calendar: "Calendar",
    habits: "Habits", exercises: "Exercises", recipes: "Recipes", business: "Business", settings: "Settings"
  };

  if (!show) return null;

  return (
    <>
      <div className="copilot-overlay" onClick={onClose} />
      <div className="copilot-panel">
        <div className="copilot-header">
          <div className="copilot-header-left">
            <div className="copilot-header-icon">
              <span className="material-symbols-outlined" style={{ color: "white", fontSize: "1.1rem" }}>smart_toy</span>
            </div>
            <div>
              <div className="copilot-header-title">AI Copilot</div>
              <div className="copilot-header-subtitle">Powered by CoachOS AI</div>
            </div>
          </div>
          <button className="copilot-close" onClick={onClose}>
            <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>close</span>
          </button>
        </div>

        <div>
          <span className="copilot-context-badge">
            <span className="material-symbols-outlined" style={{ fontSize: "0.75rem" }}>visibility</span>
            Viewing: {navLabels[activeNav] ?? activeNav}
            {selectedClientName ? ` \u00B7 ${selectedClientName}` : ""}
          </span>
        </div>

        <div className="copilot-messages">
          {messages.length === 0 ? (
            <div className="copilot-empty">
              <span className="material-symbols-outlined copilot-empty-icon">smart_toy</span>
              <span className="copilot-empty-text">Ask me anything about your clients, plans, or business</span>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} className={`copilot-msg ${msg.role}`}>
                <div className="copilot-msg-label">{msg.role === "user" ? "You" : "AI Copilot"}</div>
                <div className="copilot-msg-bubble">
                  {msg.content}
                  {msg.clients && msg.clients.length > 0 && (
                    <div className="copilot-client-cards">
                      {msg.clients.map((c: any) => (
                        <div key={c.id} className="copilot-client-card">
                          <div className="copilot-client-card-dot" />
                          {c.fullName}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          {loading && (
            <div className="copilot-msg ai">
              <div className="copilot-msg-label">AI Copilot</div>
              <div className="copilot-msg-bubble" style={{ display: "flex", alignItems: "center", gap: "0.4rem", opacity: 0.7 }}>
                <div className="spinner" style={{ width: "16px", height: "16px", borderWidth: "2px" }} />
                Thinking...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="copilot-input-area">
          <input
            ref={inputRef}
            className="copilot-input"
            type="text"
            placeholder="Type a command..."
            value={input}
            onChange={e => onInputChange(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !loading && input.trim()) onSend(); }}
          />
          <button
            className="copilot-send-btn"
            disabled={loading || !input.trim()}
            onClick={onSend}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>send</span>
          </button>
        </div>
      </div>
    </>
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
  const [showWorkoutLogger, setShowWorkoutLogger] = useState(false);
  const [showClientNotesModal, setShowClientNotesModal] = useState(false);
  const [notifications, setNotifications] = useState<Array<{ id: string; message: string; type: string; time: string; read: boolean }>>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [bookedSessions, setBookedSessions] = useState<BookedSession[]>([]);
  const { toasts, push, dismiss } = useToast();
  const [showCopilot, setShowCopilot] = useState(false);
  const [copilotMessages, setCopilotMessages] = useState<Array<{role: string, content: string, clients?: any[]}>>([]);
  const [copilotInput, setCopilotInput] = useState("");
  const [copilotLoading, setCopilotLoading] = useState(false);

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

  const selectedClient = session?.clients?.find(c => c.id === selectedClientId) ?? null;

  const sendCopilotMessage = useCallback(async () => {
    if (!copilotInput.trim() || copilotLoading) return;
    const input = copilotInput.trim();
    setCopilotInput("");
    setCopilotMessages(prev => [...prev, { role: "user", content: input }]);
    setCopilotLoading(true);
    try {
      const res = await fetchJson<{ reply: string; actions: any[]; affectedClients: string[] }>("/ai/agent", {
        method: "POST",
        body: JSON.stringify({ command: input, context: { currentView: activeNav, selectedClientId } })
      });
      const clients = res.affectedClients?.length
        ? session?.clients?.filter(c => res.affectedClients.includes(c.id)) ?? []
        : [];
      setCopilotMessages(prev => [...prev, { role: "ai", content: res.reply, clients }]);
      await loadCoach(selectedClientId ?? undefined);
      push("AI Copilot: action completed", "success");
    } catch {
      setCopilotMessages(prev => [...prev, { role: "ai", content: "Sorry, something went wrong. Please try again." }]);
    } finally {
      setCopilotLoading(false);
    }
  }, [copilotInput, copilotLoading, activeNav, selectedClientId, session, loadCoach, push]);

  useEffect(() => {
    loadCoach().catch(err => setLoadError(err instanceof Error ? err.message : "Connection failed â€” is the API running?"));
  }, []);

  const handleNav = (id: NavId) => {
    setActiveNav(id);
  };

  const handleGenerate = async (clientId: string) => {
    await fetchJson(`/plans/generate`, { method: "POST", body: JSON.stringify({ clientId }) });
    await loadCoach(clientId);
    push("Plan generated with DeepSeek-V3.1");
  };

  const handleApprove = async (planId: string) => {
    await fetchJson(`/plans/${planId}/approve`, { method: "POST" });
    await loadCoach(selectedClientId ?? undefined);
    push("Plan approved âœ“");
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
    // Reload the client portal to reflect saved changes
    const [portal, checkIns] = await Promise.all([
      fetchJson<ClientSession>(`/session/client/${clientPortal.client.id}`),
      fetchJson<CheckIn[]>(`/check-ins?clientId=${clientPortal.client.id}`),
    ]);
    setClientPortal(portal);
    setProofCard(portal.proofCard);
    const sorted = [...checkIns].sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());
    const withDeltas: CheckInWithDelta[] = sorted.map((c, i) => {
      const prev = sorted[i - 1];
      return { ...c, weightDelta: prev && c.progress.weightKg != null && prev.progress.weightKg != null ? +(c.progress.weightKg - prev.progress.weightKg).toFixed(1) : null, energyDelta: prev ? c.progress.energyScore - prev.progress.energyScore : null, adherenceDelta: null };
    });
    setCheckInHistory(withDeltas);
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
            <p style={{ color: "var(--danger)", fontWeight: 600 }}>âš  Cannot connect to CoachOS API</p>
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
          <p className="muted">Loading CoachOSâ€¦</p>
        </div>
      </div>
    );
  }

  const atRiskCount = session.dashboard.atRiskClients.length;

  return (
    <div className="app-shell">
      <Sidebar active={activeNav} onNav={handleNav} session={session} atRiskCount={atRiskCount} notifications={notifications} setNotifications={setNotifications} showNotifications={showNotifications} setShowNotifications={setShowNotifications} />

      <div className="page-content">
        {activeNav === "dashboard" && (
          <DashboardView
            session={session}
            onNav={handleNav}
            onSimulateCheckIn={async id => { await handleCheckIn(id); push("Check-in recovery simulated"); }}
            onMarkPayment={async id => { await handleToggleBilling(id, "active"); }}
            push={push}
            onLogWorkout={() => setShowWorkoutLogger(true)}
            onOpenClientNotes={() => setShowClientNotesModal(true)}
            onAddClient={() => setShowAddClientModal(true)}
          />
        )}
        {activeNav === "clients" && (
          <ClientsView session={session} onOpenClient={id => switchClient(id)} onAddClient={() => setShowAddClientModal(true)} onStartSession={(client) => { push(`Session booked with ${client.fullName}`, 'success'); }} push={push} />
        )}
        {activeNav === "habits" && (
          <HabitsView session={session} />
        )}
        {activeNav === "exercises" && (
          <ExerciseLibraryView />
        )}
        {activeNav === "recipes" && (
          <RecipeBrowserView />
        )}
        {activeNav === "calendar" && (
          <CalendarView session={session} onNav={setActiveNav} bookedSessions={bookedSessions} onUpdateSessions={setBookedSessions} push={push} clients={session.clients} />
        )}
        {activeNav === "business" && (
          <BillingView session={session} onToggleBilling={handleToggleBilling} />
        )}
        {activeNav === "settings" && (
          <SettingsView session={session} onSave={handleSaveSettings} />
        )}
        {activeNav === "ai" && (
          <AICoachView session={session} push={push} />
        )}
      </div>

      {/* AI Copilot Floating Action Button */}
      <button
        className="copilot-fab"
        onClick={() => setShowCopilot(v => !v)}
        title={showCopilot ? "Close AI Copilot" : "Open AI Copilot"}
      >
        <span className="copilot-fab-label">AI Copilot</span>
        <span className="material-symbols-outlined" style={{ color: showCopilot ? "var(--accent)" : "var(--primary)", fontSize: "1.4rem", transition: "color 0.2s ease" }}>
          {showCopilot ? "close" : "auto_awesome"}
        </span>
      </button>

      <AICopilotPanel
        show={showCopilot}
        messages={copilotMessages}
        input={copilotInput}
        loading={copilotLoading}
        activeNav={activeNav}
        selectedClientName={selectedClient ? selectedClient.fullName : null}
        onClose={() => setShowCopilot(false)}
        onSend={sendCopilotMessage}
        onInputChange={setCopilotInput}
      />

      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {showAddClientModal && (
        <AddClientModal
          onClose={() => setShowAddClientModal(false)}
          onSuccess={handleAddClientSuccess}
          push={push}
        />
      )}

      {showWorkoutLogger && (
        <WorkoutLoggerModal
          clients={session.clients}
          onClose={() => setShowWorkoutLogger(false)}
          onSuccess={() => { setShowWorkoutLogger(false); push("Workout session logged!", "success"); }}
          push={push}
        />
      )}

      {showClientNotesModal && (
        <ClientNotesModal
          clients={session.clients}
          onClose={() => setShowClientNotesModal(false)}
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
