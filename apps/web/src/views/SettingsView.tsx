import React, { useState } from "react";

type CoachSession = { workspace: any; coach: any; clients: any[]; plans: any[]; subscriptions: any[]; dashboard: any };
type DayKey = "monday"|"tuesday"|"wednesday"|"thursday"|"friday"|"saturday"|"sunday";

export function SettingsView({ session, onSave }: {
  session: CoachSession;
  onSave: (draft: any) => Promise<void>;
}) {
  const [draft, setDraft] = useState({
    name: session.workspace.name,
    brandColor: session.workspace.brandColor,
    accentColor: session.workspace.accentColor,
    heroMessage: session.workspace.heroMessage,
    stripeConnected: session.workspace.stripeConnected,
    coachGender: (session.coach as any).gender ?? "male",
  });
  const [notifPrefs, setNotifPrefs] = useState({
    enabled: true,
    clientCheckIn: true,
    sessionReminder: true,
    paymentReceived: true,
    newClientRequest: false,
    emailEnabled: true,
  });
  const [savingNotif, setSavingNotif] = useState(false);
  const [availHours, setAvailHours] = useState<Record<DayKey, {enabled:boolean;start:string;end:string}>>({
    monday: { enabled: true, start: "09:00", end: "17:00" },
    tuesday: { enabled: true, start: "09:00", end: "17:00" },
    wednesday: { enabled: true, start: "09:00", end: "17:00" },
    thursday: { enabled: true, start: "09:00", end: "17:00" },
    friday: { enabled: true, start: "09:00", end: "17:00" },
    saturday: { enabled: false, start: "10:00", end: "14:00" },
    sunday: { enabled: false, start: "10:00", end: "14:00" },
  });
  const [blockedDates, setBlockedDates] = useState<string[]>([]);
  const [savingAvail, setSavingAvail] = useState(false);

  const notifTypes = [
    { key: "clientCheckIn", label: "Client Check-in", desc: "When a client submits a check-in" },
    { key: "sessionReminder", label: "Session Reminder", desc: "30 min before a scheduled session" },
    { key: "paymentReceived", label: "Payment Received", desc: "When a client payment comes through" },
    { key: "newClientRequest", label: "New Client Request", desc: "When a new client signs up" },
  ];

  return (
    <div className="page-view">
      <p className="eyebrow">Workspace</p>
      <h1 className="page-title">Settings</h1>
      <p className="page-subtitle">Brand setup, Stripe connection, and rollback options.</p>

      <div className="panel" style={{ maxWidth: 640 }}>
        <form className="stack" onSubmit={async e => { e.preventDefault(); await onSave(draft); }}>
          <label style={{ fontFamily: "Inter, sans-serif", fontSize: "0.72rem", fontWeight: 600, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "0.35rem" }}>
            Workspace name
            <input
              className="form-input"
              value={draft.name}
              onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            />
          </label>
          <label style={{ fontFamily: "Inter, sans-serif", fontSize: "0.72rem", fontWeight: 600, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "0.35rem" }}>
            Hero message
            <textarea
              className="form-input form-textarea"
              value={draft.heroMessage}
              onChange={e => setDraft(d => ({ ...d, heroMessage: e.target.value }))}
              rows={2}
            />
          </label>
          <div className="two-col">
            <label style={{ fontFamily: "Inter, sans-serif", fontSize: "0.72rem", fontWeight: 600, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "0.35rem" }}>
              Brand color
              <input type="color" value={draft.brandColor} onChange={e => setDraft(d => ({ ...d, brandColor: e.target.value }))} style={{ width: "100%", height: 40, border: "none", cursor: "pointer" }} />
            </label>
            <label style={{ fontFamily: "Inter, sans-serif", fontSize: "0.72rem", fontWeight: 600, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "0.35rem" }}>
              Accent color
              <input type="color" value={draft.accentColor} onChange={e => setDraft(d => ({ ...d, accentColor: e.target.value }))} style={{ width: "100%", height: 40, border: "none", cursor: "pointer" }} />
            </label>
          </div>
          <label className="toggle" style={{ display: "flex", alignItems: "center", gap: "0.75rem", cursor: "pointer" }}>
            <input type="checkbox" checked={draft.stripeConnected} onChange={e => setDraft(d => ({ ...d, stripeConnected: e.target.checked }))} />
            <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.82rem", color: "var(--text-primary)" }}>Stripe GBP connected</span>
          </label>
          <div>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.72rem", fontWeight: 600, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "0.4rem" }}>Coach Mascot Gender</div>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              {(["male", "female"] as const).map(g => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setDraft(d => ({ ...d, coachGender: g }))}
                  style={{ flex: 1, padding: "0.5rem", borderRadius: "var(--r-md)", border: "1.5px solid", borderColor: draft.coachGender === g ? "var(--primary)" : "var(--outline-variant)", background: draft.coachGender === g ? "var(--primary-light)" : "var(--surface-container)", color: draft.coachGender === g ? "var(--primary)" : "var(--text-primary)", fontFamily: "Inter, sans-serif", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", textTransform: "capitalize" }}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
          <div className="inline">
            <button type="submit" className="btn-primary">Save settings</button>
          </div>
        </form>
      </div>

      {/* Notification Preferences */}
      <div style={{ maxWidth: 640, marginTop: "2rem" }}>
        <div className="panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
            <div>
              <h2 className="section-title" style={{ margin: 0 }}>Notification Preferences</h2>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: "0.8rem", color: "var(--outline)", margin: "0.25rem 0 0" }}>Control how you receive alerts from CoachOS.</p>
            </div>
            <label className="toggle" style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
              <input type="checkbox" checked={notifPrefs.enabled} onChange={e => setNotifPrefs(p => ({ ...p, enabled: e.target.checked }))} />
              <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.78rem", color: "var(--text-muted)" }}>In-App</span>
            </label>
          </div>

          <div className="stack compact">
            {notifTypes.map(nt => (
              <div key={nt.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.6rem 0", borderBottom: "1px solid var(--surface-container)" }}>
                <div>
                  <div style={{ fontFamily: "Manrope, sans-serif", fontWeight: 600, fontSize: "0.85rem", color: "var(--text-primary)" }}>{nt.label}</div>
                  <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.72rem", color: "var(--outline)" }}>{nt.desc}</div>
                </div>
                <label className="toggle" style={{ flexShrink: 0, display: "flex", alignItems: "center", cursor: "pointer" }}>
                  <input type="checkbox" checked={(notifPrefs as any)[nt.key]} onChange={e => setNotifPrefs(p => ({ ...p, [nt.key]: e.target.checked }))} disabled={!notifPrefs.enabled} />
                </label>
              </div>
            ))}
          </div>

          <div style={{ marginTop: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--surface-container)", paddingTop: "1rem" }}>
            <div>
              <div style={{ fontFamily: "Manrope, sans-serif", fontWeight: 600, fontSize: "0.85rem", color: "var(--text-primary)" }}>Email notifications</div>
              <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.72rem", color: "var(--outline)" }}>Receive summaries via email</div>
            </div>
            <label className="toggle" style={{ flexShrink: 0, display: "flex", alignItems: "center", cursor: "pointer" }}>
              <input type="checkbox" checked={notifPrefs.emailEnabled} onChange={e => setNotifPrefs(p => ({ ...p, emailEnabled: e.target.checked }))} disabled={!notifPrefs.enabled} />
            </label>
          </div>

          <div style={{ marginTop: "1rem" }}>
            <button
              onClick={async () => { setSavingNotif(true); await new Promise(r => setTimeout(r, 400)); setSavingNotif(false); }}
              disabled={savingNotif}
              className="btn-primary"
              style={{ padding: "0.5rem 1rem", borderRadius: "var(--r-md)", border: "none", fontFamily: "Manrope, sans-serif", fontSize: "0.8rem", fontWeight: 700, cursor: savingNotif ? "not-allowed" : "pointer" }}
            >
              {savingNotif ? "Saving..." : "Save Preferences"}
            </button>
          </div>
        </div>
      </div>

      {/* Availability Settings */}
      <div style={{ maxWidth: 640, marginTop: "2rem" }}>
        <div className="panel">
          <div>
            <h2 className="section-title">Schedule Availability</h2>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: "0.8rem", color: "var(--outline)", margin: "0.25rem 0 1.25rem" }}>Define your working hours so clients know when sessions are available.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0.75rem", marginBottom: "1.25rem" }}>
            {["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map((day, i) => {
              const dayKey = day.toLowerCase() as DayKey;
              const hours = availHours[dayKey] ?? { enabled: i < 5, start: "09:00", end: "17:00" };
              return (
                <div key={day} style={{ padding: "0.75rem", borderRadius: "var(--r-lg)", border: "1.5px solid var(--surface-container)", background: "var(--surface-container-low)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                    <span style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "0.82rem", color: "var(--text-primary)" }}>{day.slice(0,3)}</span>
                    <label className="toggle" style={{ transform: "scale(0.85)", display: "flex", alignItems: "center", cursor: "pointer" }}>
                      <input type="checkbox" checked={hours.enabled} onChange={e => setAvailHours(h => ({ ...h, [dayKey]: { ...(h[dayKey] ?? hours), enabled: e.target.checked } }))} />
                    </label>
                  </div>
                  {hours.enabled && (
                    <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
                      <input type="time" value={hours.start} onChange={e => setAvailHours(h => ({ ...h, [dayKey]: { ...(h[dayKey] ?? hours), start: e.target.value } }))} style={{ flex: 1, padding: "0.3rem 0.4rem", borderRadius: "var(--r-sm)", border: "1.5px solid var(--outline-variant)", background: "var(--surface-container)", color: "var(--text-primary)", fontFamily: "Inter, sans-serif", fontSize: "0.75rem" }} />
                      <span style={{ color: "var(--outline)", fontSize: "0.75rem" }}>–</span>
                      <input type="time" value={hours.end} onChange={e => setAvailHours(h => ({ ...h, [dayKey]: { ...(h[dayKey] ?? hours), end: e.target.value } }))} style={{ flex: 1, padding: "0.3rem 0.4rem", borderRadius: "var(--r-sm)", border: "1.5px solid var(--outline-variant)", background: "var(--surface-container)", color: "var(--text-primary)", fontFamily: "Inter, sans-serif", fontSize: "0.75rem" }} />
                    </div>
                  )}
                  {!hours.enabled && (
                    <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.72rem", color: "var(--outline)" }}>Unavailable</span>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.8rem", fontWeight: 600, color: "var(--outline)" }}>Block specific dates</span>
              <button
                onClick={() => setBlockedDates(prev => [...prev, ""])}
                style={{ padding: "0.25rem 0.5rem", borderRadius: "var(--r-sm)", border: "1.5px solid var(--outline-variant)", background: "var(--surface-container)", color: "var(--primary)", fontFamily: "Inter, sans-serif", fontSize: "0.72rem", fontWeight: 600, cursor: "pointer" }}
              >
                + Add date
              </button>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {blockedDates.map((d, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  <input type="date" value={d} onChange={e => setBlockedDates(prev => prev.map((x, j) => j === i ? e.target.value : x))} style={{ padding: "0.3rem 0.5rem", borderRadius: "var(--r-sm)", border: "1.5px solid var(--outline-variant)", background: "var(--surface-container)", color: "var(--text-primary)", fontFamily: "Inter, sans-serif", fontSize: "0.75rem" }} />
                  <button onClick={() => setBlockedDates(prev => prev.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)", fontSize: "0.9rem", padding: "0.1rem" }}>×</button>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={async () => { setSavingAvail(true); await new Promise(r => setTimeout(r, 400)); setSavingAvail(false); }}
            disabled={savingAvail}
            className="btn-primary"
            style={{ padding: "0.5rem 1rem", borderRadius: "var(--r-md)", border: "none", fontFamily: "Manrope, sans-serif", fontSize: "0.8rem", fontWeight: 700, cursor: savingAvail ? "not-allowed" : "pointer" }}
          >
            {savingAvail ? "Saving..." : "Save Availability"}
          </button>
        </div>
      </div>
    </div>
  );
}