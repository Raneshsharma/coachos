
function SessionBookingModal({
  client,
  onClose,
  onSuccess,
  push,
}: {
  client: { id: string; fullName: string };
  onClose: () => void;
  onSuccess: () => void;
  push: (message: string, type?: "success"|"error"|"info") => void;
}) {
  const [sessionType, setSessionType] = useState<"virtual"|"in-person">("virtual");
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().split("T")[0];
  });
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState("60");
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      await new Promise(r => setTimeout(r, 800)); // Simulate API call
      setSent(true);
      setTimeout(() => { onSuccess(); }, 1500);
    } catch {
      push("Failed to schedule session.", "error");
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        display: "grid", placeItems: "center", zIndex: 1000, backdropFilter: "blur(4px)",
      }}>
        <div className="card-glass" style={{ padding: "3rem", textAlign: "center", maxWidth: 400, animation: "fadeIn 0.3s ease" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--primary-light)", display: "grid", placeItems: "center", margin: "0 auto 1.5rem" }}>
            <span className="material-symbols-outlined" style={{ fontSize: "2rem", color: "var(--primary)" }}>check_circle</span>
          </div>
          <h2 style={{ fontFamily: "Manrope, sans-serif", fontWeight: 800, fontSize: "1.4rem", color: "var(--text-primary)", marginBottom: "0.5rem" }}>Session Scheduled!</h2>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: "0.875rem", color: "var(--on-surface-variant)" }}>
            Invitation sent to {client.fullName} for {new Date(date + "T" + time).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} at {time}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "grid", placeItems: "center", zIndex: 1000, backdropFilter: "blur(4px)",
    }}>
      <div className="card-glass" style={{ width: "100%", maxWidth: 480, padding: "2rem", animation: "slideUp 0.25s ease" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
          <div>
            <h2 style={{ fontFamily: "Manrope, sans-serif", fontWeight: 800, fontSize: "1.2rem", color: "var(--text-primary)", margin: "0 0 0.25rem" }}>Schedule Session</h2>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: "0.8rem", color: "var(--outline)", margin: 0 }}>{client.fullName}</p>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--outline)", padding: "0.5rem" }}>
            <span className="material-symbols-outlined" style={{ fontSize: "1.2rem" }}>close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Session type */}
          <div>
            <label style={{ display: "block", fontFamily: "Inter, sans-serif", fontSize: "0.72rem", fontWeight: 700, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem" }}>Session Type</label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              {(["virtual", "in-person"] as const).map(t => (
                <button key={t} type="button" onClick={() => setSessionType(t)} style={{
                  flex: 1, padding: "0.6rem", borderRadius: "var(--r-lg)",
                  border: `2px solid ${sessionType === t ? "var(--primary)" : "var(--border)"}`,
                  background: sessionType === t ? "var(--primary-light)" : "transparent",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
                  fontFamily: "Inter, sans-serif", fontSize: "0.82rem", fontWeight: 600,
                  color: sessionType === t ? "var(--primary)" : "var(--on-surface-variant)",
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>
                    {t === "virtual" ? "videocam" : "directions_walk"}
                  </span>
                  {t === "virtual" ? "Virtual" : "In-Person"}
                </button>
              ))}
            </div>
          </div>

          {/* Date and time */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label style={{ display: "block", fontFamily: "Inter, sans-serif", fontSize: "0.72rem", fontWeight: 700, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.4rem" }}>Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required
                style={{ width: "100%", padding: "0.6rem 0.75rem", borderRadius: "var(--r-lg)", border: "1.5px solid var(--border)", background: "var(--bg-card)", fontFamily: "Inter, sans-serif", fontSize: "0.85rem", color: "var(--text-primary)", outline: "none" }} />
            </div>
            <div>
              <label style={{ display: "block", fontFamily: "Inter, sans-serif", fontSize: "0.72rem", fontWeight: 700, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.4rem" }}>Time</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} required
                style={{ width: "100%", padding: "0.6rem 0.75rem", borderRadius: "var(--r-lg)", border: "1.5px solid var(--border)", background: "var(--bg-card)", fontFamily: "Inter, sans-serif", fontSize: "0.85rem", color: "var(--text-primary)", outline: "none" }} />
            </div>
          </div>

          {/* Duration */}
          <div>
            <label style={{ display: "block", fontFamily: "Inter, sans-serif", fontSize: "0.72rem", fontWeight: 700, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem" }}>Duration</label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              {["30", "45", "60", "90"].map(d => (
                <button key={d} type="button" onClick={() => setDuration(d)} style={{
                  flex: 1, padding: "0.5rem", borderRadius: "var(--r-lg)",
                  border: `2px solid ${duration === d ? "var(--primary)" : "var(--border)"}`,
                  background: duration === d ? "var(--primary-light)" : "transparent",
                  cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: "0.82rem", fontWeight: 600,
                  color: duration === d ? "var(--primary)" : "var(--on-surface-variant)",
                }}>{d}m</button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={{ display: "block", fontFamily: "Inter, sans-serif", fontSize: "0.72rem", fontWeight: 700, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.4rem" }}>Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Agenda, prep instructions, specific focus areas…"
              style={{ width: "100%", padding: "0.6rem 0.75rem", borderRadius: "var(--r-lg)", border: "1.5px solid var(--border)", background: "var(--bg-card)", fontFamily: "Inter, sans-serif", fontSize: "0.85rem", color: "var(--text-primary)", outline: "none", resize: "vertical" }} />
          </div>

          <div style={{ display: "flex", gap: "0.75rem", paddingTop: "0.5rem" }}>
            <button type="button" onClick={onClose} className="btn-ghost" style={{ flex: 1 }}>Cancel</button>
            <button type="submit" disabled={sending} style={{
              flex: 2, padding: "0.7rem", borderRadius: "var(--r-lg)", border: "none",
              background: sending ? "var(--surface-container)" : "var(--primary)",
              color: "white", fontFamily: "Inter, sans-serif", fontSize: "0.875rem", fontWeight: 700,
              cursor: sending ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
            }}>
              {sending ? (
                <><span className="material-symbols-outlined" style={{ fontSize: "1rem", animation: "spin 1s linear infinite" }}>progress_activity</span> Sending…</>
              ) : (
                <><span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>send</span> Send Invite</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
