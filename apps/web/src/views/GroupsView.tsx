import React, { useEffect, useState } from "react";
import type { ClientProfile } from "@coachos/domain";
import { fetchJson } from "../main";

type GroupProgram = { id: string; coachId: string; title: string; description: string; goal: string; memberIds: string[]; monthlyPriceGbp: number; status: "active"|"archived"|"upcoming"; createdAt: string };

// ── Avatar helper ─────────────────────
function Avatar({ name }: { name: string }) {
  const initials = name.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase();
  return <div style={{ width: 28, height: 28, borderRadius: "var(--r-md)", background: "var(--primary-light)", color: "var(--primary)", display: "grid", placeItems: "center", fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "0.65rem", flexShrink: 0 }}>{initials}</div>;
}

// ── StatusPill helper ─────────────────
function StatusPill({ status }: { status: string }) {
  const tone = status === "at_risk" ? "pill-danger" : status === "trial" ? "pill-warning" : "pill-success";
  const label = status === "at_risk" ? "At risk" : status === "trial" ? "Trial" : "Active";
  return <span className={`pill ${tone}`} style={{ fontSize: "0.65rem" }}>{label}</span>;
}

// ── CreateProgramModal ─────────────────
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
          <label style={{ fontFamily: "Inter, sans-serif", fontSize: "0.72rem", fontWeight: 600, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "0.35rem" }}>
            Program title
            <input className="form-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Summer Fat-Loss Sprint" />
          </label>
          <label style={{ fontFamily: "Inter, sans-serif", fontSize: "0.72rem", fontWeight: 600, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "0.35rem" }}>
            Goal
            <input className="form-input" value={goal} onChange={e => setGoal(e.target.value)} placeholder="e.g. Lose 4kg before summer" />
          </label>
          <label style={{ fontFamily: "Inter, sans-serif", fontSize: "0.72rem", fontWeight: 600, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "0.35rem" }}>
            Description
            <textarea className="form-input form-textarea" value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief description of the programme..." rows={2} />
          </label>
          <label style={{ fontFamily: "Inter, sans-serif", fontSize: "0.72rem", fontWeight: 600, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "0.35rem" }}>
            Monthly price (£)
            <input className="form-input" type="number" value={price} onChange={e => setPrice(Number(e.target.value))} />
          </label>
          <div>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.72rem", fontWeight: 600, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "0.5rem" }}>Assign clients</div>
            <div className="member-select-list">
              {clients.map(c => (
                <label key={c.id} className="member-checkbox-row">
                  <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} />
                  <Avatar name={c.fullName} />
                  <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.82rem", color: "var(--text-primary)", flex: 1 }}>{c.fullName}</span>
                  <StatusPill status={c.status} />
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="onboard-actions">
          <button className="secondary" onClick={onClose}>Cancel</button>
          <button onClick={handleSave} disabled={!title.trim()} className="btn-primary">Create Program</button>
        </div>
      </div>
    </div>
  );
}

// ── EditProgramModal ──────────────────
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
          <label style={{ fontFamily: "Inter, sans-serif", fontSize: "0.72rem", fontWeight: 600, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "0.35rem" }}>
            Program title
            <input className="form-input" value={title} onChange={e => setTitle(e.target.value)} />
          </label>
          <label style={{ fontFamily: "Inter, sans-serif", fontSize: "0.72rem", fontWeight: 600, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "0.35rem" }}>
            Goal
            <input className="form-input" value={goal} onChange={e => setGoal(e.target.value)} />
          </label>
          <label style={{ fontFamily: "Inter, sans-serif", fontSize: "0.72rem", fontWeight: 600, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "0.35rem" }}>
            Description
            <textarea className="form-input form-textarea" value={description} onChange={e => setDescription(e.target.value)} rows={2} />
          </label>
          <label style={{ fontFamily: "Inter, sans-serif", fontSize: "0.72rem", fontWeight: 600, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "0.35rem" }}>
            Monthly price (£)
            <input className="form-input" type="number" value={price} onChange={e => setPrice(Number(e.target.value))} />
          </label>
          <div>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.72rem", fontWeight: 600, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "0.5rem" }}>Members</div>
            <div className="member-select-list">
              {clients.map(c => (
                <label key={c.id} className="member-checkbox-row">
                  <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} />
                  <Avatar name={c.fullName} />
                  <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.82rem", color: "var(--text-primary)", flex: 1 }}>{c.fullName}</span>
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
            <button onClick={() => onSave({ title, goal, description, memberIds: selected, monthlyPriceGbp: price })} className="btn-primary">Save Changes</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── GroupsView ─────────────────────────
export function GroupsView({ session, onCreate, onUpdate, onArchive }: {
  session: any;
  onCreate: (payload: Partial<GroupProgram>) => Promise<void>;
  onUpdate: (programId: string, patch: Partial<GroupProgram>) => Promise<void>;
  onArchive: (programId: string) => Promise<void>;
}) {
  const [programs, setPrograms] = useState<GroupProgram[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const push = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  useEffect(() => {
    fetchJson<GroupProgram[]>("/group-programs").then(setPrograms).catch(() => push("Failed to load programs"));
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
    const members = session.clients.filter((c: ClientProfile) => program.memberIds.includes(c.id));
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
          {members.map((m: ClientProfile) => <span key={m.id} className="member-chip">{m.fullName.split(" ")[0]}</span>)}
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
      {toastMsg && (
        <div style={{ position: "fixed", top: "1rem", right: "1rem", background: "var(--primary)", color: "white", padding: "0.75rem 1.25rem", borderRadius: "var(--r-lg)", boxShadow: "var(--shadow-primary)", zIndex: 9999, fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "0.85rem", animation: "fadeIn 0.2s ease" }}>
          {toastMsg}
        </div>
      )}

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
        <div className="content-grid">
          {activePrograms.map(p => <ProgramCard key={p.id} program={p} />)}
          <div className="program-create-card" onClick={() => setShowCreate(true)}>
            <div className="program-create-card-icon">+</div>
            <div className="program-create-card-label">Create Program</div>
          </div>
        </div>

        {archivedPrograms.length > 0 && (
          <div>
            <p className="eyebrow" style={{ marginBottom: "0.5rem" }}>Archived</p>
            <div className="content-grid">
              {archivedPrograms.map(p => <ProgramCard key={p.id} program={p} />)}
            </div>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateProgramModal
          clients={session.clients}
          onSave={handleCreate}
          onClose={() => setShowCreate(false)}
        />
      )}

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