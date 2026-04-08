import React, { useEffect, useMemo, useState } from "react";

type CoachSession = {
  workspace: any; coach: any; clients: any[]; plans: any[]; subscriptions: any[]; dashboard: any
};

type NavId = "dashboard"|"clients"|"plans"|"portal"|"billing"|"settings"|"migration"|"competitors"|"groups"|"habits"|"exercises"|"calendar"|"recipes";

type CalendarEvent = {
  id: string;
  date: string;
  type: "check-in"|"renewal"|"billing"|"session"|"reminder"|"blocked";
  clientId?: string;
  clientName?: string;
  label: string;
  color: string;
};

export function CalendarView({ session, onNav }: { session: CoachSession; onNav: (id: NavId) => void }) {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [monthOffset, setMonthOffset] = useState(0);
  const [blockedDates, setBlockedDates] = useState<Record<string, string[]>>({});
  const [newBlockComment, setNewBlockComment] = useState("");
  const [showBlockInput, setShowBlockInput] = useState(false);

  useEffect(() => {
    setShowBlockInput(false);
    setNewBlockComment("");
  }, [selectedDate]);

  const displayDate = useMemo(() => {
    const d = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    setViewDate(d);
    return d;
  }, [monthOffset]);

  const year = displayDate.getFullYear();
  const month = displayDate.getMonth();

  const events: CalendarEvent[] = useMemo(() => {
    const evs: CalendarEvent[] = [];
    (session.subscriptions as any[]).forEach((sub: any) => {
      if (sub.renewalDate && sub.status !== "cancelled") {
        const client = (session.clients as any[]).find((c: any) => c.id === sub.clientId);
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
    (session.subscriptions as any[]).forEach((sub: any) => {
      if (sub.renewalDate && sub.status === "active") {
        const client = (session.clients as any[]).find((c: any) => c.id === sub.clientId);
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
    (session.clients as any[]).forEach((client: any) => {
      if (client.lastCheckInDate) {
        const last = new Date(client.lastCheckInDate);
        const next = new Date(last);
        next.setDate(next.getDate() + 7);
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
    Object.entries(blockedDates).forEach(([date, comments]) => {
      comments.forEach((comment, i) => {
        evs.push({
          id: `blocked-${date}-${i}`,
          date,
          type: "blocked",
          label: comment,
          color: "var(--danger)",
        });
      });
    });
    return evs;
  }, [session, month, year, blockedDates]);

  const eventMap = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach(e => {
      const existing = map.get(e.date) ?? [];
      existing.push(e);
      map.set(e.date, existing);
    });
    return map;
  }, [events]);

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

  const typeConfig: Record<string, { icon: string; color: string; bg: string }> = {
    "check-in": { icon: "monitor_heart", color: "var(--tertiary)", bg: "var(--tertiary-fixed)" },
    "renewal": { icon: "autorenew", color: "var(--primary)", bg: "var(--primary-light)" },
    "billing": { icon: "payments", color: "var(--accent)", bg: "var(--accent-light)" },
    "session": { icon: "event", color: "var(--secondary)", bg: "var(--secondary-fixed)" },
    "reminder": { icon: "notifications", color: "var(--warning)", bg: "var(--warning-light)" },
    "blocked": { icon: "block", color: "var(--danger)", bg: "rgba(239,68,68,0.1)" },
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

      <div style={{ display: "grid", gridTemplateColumns: selectedDate ? "1fr 320px" : "1fr", gap: "1.5rem", alignItems: "start" }}>
        {/* Calendar grid */}
        <div>
          <div className="card-glass" style={{ padding: "1rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px", marginBottom: "4px" }}>
              {days.map(d => (
                <div key={d} style={{ textAlign: "center", fontFamily: "Inter, sans-serif", fontSize: "0.65rem", fontWeight: 700, color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.05em", padding: "0.4rem 0" }}>{d}</div>
              ))}
            </div>
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
                      position: "relative",
                    }}
                  >
                    {(blockedDates[dateStr]?.length ?? 0) > 0 && (
                      <div style={{ position: "absolute", top: "4px", right: "4px", width: "6px", height: "6px", borderRadius: "50%", background: "var(--danger)" }} />
                    )}
                    <span style={{ fontFamily: "Manrope, sans-serif", fontWeight: 800, fontSize: "0.9rem", color: isToday ? "var(--primary)" : "var(--text-primary)" }}>{day}</span>
                    {dayEvents.filter(e => e.type !== "blocked").slice(0, 2).map(e => (
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
                    {dayEvents.filter(e => e.type !== "blocked").length > 2 && (
                      <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.5rem", color: "var(--outline)" }}>+{dayEvents.filter(e => e.type !== "blocked").length - 2}</span>
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
                  const client = e.clientId ? (session.clients as any[]).find((c: any) => c.id === e.clientId) : null;
                  const isBlocked = e.type === "blocked";
                  return (
                    <div key={e.id} className="card-glass" style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem", cursor: (client || isBlocked) ? "pointer" : "default", borderLeft: isBlocked ? "3px solid var(--danger)" : undefined, opacity: isBlocked ? 0.85 : 1 }} onClick={() => { setSelectedDate(e.date); setMonthOffset(0); }}>
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: cfg?.bg, display: "grid", placeItems: "center", flexShrink: 0 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: "0.9rem", color: cfg?.color }}>{cfg?.icon}</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "0.82rem", color: isBlocked ? "var(--danger)" : "var(--text-primary)" }}>{e.label}</div>
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

        {/* Right sidebar — selected date detail or month summary */}
        {selectedDate ? (
          <div className="card-glass" style={{ padding: "1.25rem", position: "sticky", top: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)", margin: 0 }}>
                {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
              </h3>
              <button className="btn-ghost" onClick={() => setSelectedDate(null)} style={{ padding: "0.2rem", display: "grid", placeItems: "center" }}>
                <span className="material-symbols-outlined" style={{ fontSize: "1rem" }}>close</span>
              </button>
            </div>

            {/* Blocked dates for this day */}
            {(blockedDates[selectedDate]?.length ?? 0) > 0 && (
              <div style={{ marginBottom: "1rem" }}>
                <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.7rem", fontWeight: 700, color: "var(--danger)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.4rem" }}>Blocked</div>
                {blockedDates[selectedDate]!.map((comment, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.3rem 0.5rem", background: "rgba(239,68,68,0.08)", borderRadius: "var(--r-sm)", marginBottom: "0.3rem" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "0.8rem", color: "var(--danger)" }}>block</span>
                    <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.75rem", color: "var(--danger)", flex: 1 }}>{comment}</span>
                    <button
                      onClick={() => setBlockedDates(prev => {
                        const existing = [...(prev[selectedDate!] ?? [])];
                        existing.splice(i, 1);
                        if (existing.length === 0) {
                          const n = { ...prev };
                          delete n[selectedDate!];
                          return n;
                        }
                        return { ...prev, [selectedDate!]: existing };
                      })}
                      style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--outline)", fontSize: "0.75rem", padding: "0 0.2rem", flexShrink: 0, lineHeight: 1 }}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {showBlockInput ? (
              <div>
                <textarea
                  value={newBlockComment}
                  onChange={e => setNewBlockComment(e.target.value)}
                  placeholder="e.g. Going out for dinner with family..."
                  rows={2}
                  maxLength={200}
                  style={{ width: "100%", padding: "0.4rem 0.6rem", borderRadius: "var(--r-md)", border: "1.5px solid rgba(239,68,68,0.3)", background: "var(--surface-container)", color: "var(--text-primary)", fontFamily: "Inter, sans-serif", fontSize: "0.75rem", resize: "none", boxSizing: "border-box", marginBottom: "0.4rem" }}
                />
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <button
                    onClick={() => {
                      if (!newBlockComment.trim() || !selectedDate) return;
                      if ((blockedDates[selectedDate]?.length ?? 0) >= 10) return;
                      setBlockedDates(prev => ({
                        ...prev,
                        [selectedDate!]: [...(prev[selectedDate!] ?? []), newBlockComment.trim()],
                      }));
                      setNewBlockComment("");
                      setShowBlockInput(false);
                    }}
                    disabled={!newBlockComment.trim() || (blockedDates[selectedDate!]?.length ?? 0) >= 10}
                    style={{ flex: 1, padding: "0.4rem", borderRadius: "var(--r-sm)", border: "none", background: newBlockComment.trim() ? "var(--danger)" : "var(--surface-container)", color: newBlockComment.trim() ? "white" : "var(--outline)", fontFamily: "Inter, sans-serif", fontSize: "0.72rem", fontWeight: 700, cursor: newBlockComment.trim() ? "pointer" : "not-allowed" }}>
                    Add Block
                  </button>
                  <button
                    onClick={() => { setShowBlockInput(false); setNewBlockComment(""); }}
                    style={{ padding: "0.4rem 0.6rem", borderRadius: "var(--r-sm)", border: "1.5px solid var(--outline-variant)", background: "var(--surface-container)", color: "var(--outline)", fontFamily: "Inter, sans-serif", fontSize: "0.72rem", fontWeight: 600, cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
                {(blockedDates[selectedDate!]?.length ?? 0) >= 10 && (
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: "0.68rem", color: "var(--danger)", margin: "0.25rem 0 0" }}>Maximum 10 blocks per day.</p>
                )}
              </div>
            ) : (
              <button
                onClick={() => setShowBlockInput(true)}
                disabled={(blockedDates[selectedDate!]?.length ?? 0) >= 10}
                style={{ width: "100%", padding: "0.45rem 0.75rem", borderRadius: "var(--r-md)", border: "1.5px solid rgba(239,68,68,0.3)", background: (blockedDates[selectedDate!]?.length ?? 0) < 10 ? "rgba(239,68,68,0.06)" : "var(--surface-container)", color: (blockedDates[selectedDate!]?.length ?? 0) < 10 ? "var(--danger)" : "var(--outline)", fontFamily: "Inter, sans-serif", fontSize: "0.75rem", fontWeight: 600, cursor: (blockedDates[selectedDate!]?.length ?? 0) < 10 ? "pointer" : "not-allowed", display: "flex", alignItems: "center", gap: "0.4rem", justifyContent: "center" }}>
                <span className="material-symbols-outlined" style={{ fontSize: "0.9rem" }}>add</span>
                {(blockedDates[selectedDate!]?.length ?? 0) > 0 ? "Add another block" : "Block this date"}
              </button>
            )}

            {/* Events list */}
            {selectedEvents.filter(e => e.type !== "blocked").length === 0 ? (
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: "0.82rem", color: "var(--outline)", marginTop: "0.75rem" }}>No events on this day.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.75rem" }}>
                {selectedEvents.map(e => {
                  const cfg = typeConfig[e.type];
                  const client = e.clientId ? (session.clients as any[]).find((c: any) => c.id === e.clientId) : null;
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
  );
}