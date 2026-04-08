import React, { useState } from "react";
import type { ClientProfile } from "@coachos/domain";

type PortalClient = {
  id: string;
  fullName: string;
  email: string;
  goal: string;
  status: string;
  adherenceScore: number;
  nextRenewalDate: string;
};

type ClientSessionData = {
  client: PortalClient;
  latestCheckIn?: {
    submittedAt: string;
    progress: { weightKg?: number; energyScore?: number; adherenceScore?: number };
  };
  plan?: { title?: string; latestVersion?: { workouts?: string[]; nutrition?: string[] } };
};

export function PortalView({ session, selectedClientId }: {
  session: any;
  selectedClientId: string | null;
}) {
  const client = selectedClientId
    ? session.clients.find((c: ClientProfile) => c.id === selectedClientId)
    : null;

  if (!client) {
    return (
      <div className="page-view">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", textAlign: "center" }}>
          <div style={{ width: 80, height: 80, borderRadius: "50%", background: "var(--primary-light)", display: "grid", placeItems: "center", marginBottom: "1.5rem" }}>
            <span className="material-symbols-outlined" style={{ fontSize: "2rem", color: "var(--primary)" }}>group</span>
          </div>
          <h2 style={{ fontFamily: "Manrope, sans-serif", fontWeight: 800, fontSize: "1.5rem", color: "var(--text-primary)", marginBottom: "0.5rem" }}>
            Client Portal
          </h2>
          <p style={{ fontFamily: "Inter, sans-serif", color: "var(--text-muted)", maxWidth: 400 }}>
            Select a client from the dropdown in the header to open their portal view.
          </p>
        </div>
      </div>
    );
  }

  const initials = client.fullName.split(" ").map((p: string) => p[0]).slice(0, 2).join("").toUpperCase();
  const adherenceColor = client.adherenceScore < 50 ? "var(--danger)" : client.adherenceScore < 75 ? "var(--warning)" : "var(--primary)";

  return (
    <div className="page-view">
      {/* Client header */}
      <div style={{ display: "flex", alignItems: "center", gap: "1.75rem", marginBottom: "2rem", flexWrap: "wrap" }}>
        <div style={{ width: 72, height: 72, borderRadius: "var(--r-xl)", background: "var(--primary-light)", border: "2px solid var(--surface-container)", display: "grid", placeItems: "center", fontFamily: "Manrope, sans-serif", fontWeight: 800, fontSize: "1.4rem", color: "var(--primary)" }}>
          {initials}
        </div>
        <div>
          <h1 style={{ fontFamily: "Manrope, sans-serif", fontSize: "2rem", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.03em", lineHeight: 1.1, margin: "0 0 0.35rem" }}>
            {client.fullName}
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
            <span className={`pill ${client.status === "at_risk" ? "pill-danger" : client.status === "trial" ? "pill-warning" : "pill-success"}`}>
              {client.status === "at_risk" ? "At Risk" : client.status === "trial" ? "Trial" : "Active"}
            </span>
            <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Renews {new Date(client.nextRenewalDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          </div>
        </div>
        <div style={{ marginLeft: "auto", background: "var(--surface-container)", borderRadius: "2rem", padding: "1rem 1.5rem" }}>
          <div style={{ textAlign: "center", marginBottom: "0.25rem" }}>
            <span style={{ fontFamily: "Manrope, sans-serif", fontWeight: 800, fontSize: "2rem", color: adherenceColor }}>{client.adherenceScore}%</span>
          </div>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.65rem", color: "var(--outline)", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center" }}>Adherence</div>
        </div>
      </div>

      {/* Goal card */}
      <div className="panel" style={{ maxWidth: 640, marginBottom: "1.5rem" }}>
        <h3 style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)", marginBottom: "0.5rem" }}>Primary Goal</h3>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: "0.9rem", color: "var(--text-muted)", lineHeight: 1.6, margin: 0 }}>
          {client.goal || <span style={{ fontStyle: "italic" }}>No goal set yet.</span>}
        </p>
      </div>

      {/* Quick stats */}
      <div className="content-grid" style={{ maxWidth: 640, gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className="stat-card">
          <div className="stat-card__label">
            <span className="material-symbols-outlined" style={{ fontSize: "0.9rem" }}>calendar_today</span>
            Member Since
          </div>
          <div className="stat-card__value" style={{ fontSize: "1.1rem" }}>
            {new Date(client.nextRenewalDate).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">
            <span className="material-symbols-outlined" style={{ fontSize: "0.9rem" }}>email</span>
            Contact
          </div>
          <div className="stat-card__value" style={{ fontSize: "0.85rem", fontWeight: 600 }}>{client.email}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">
            <span className="material-symbols-outlined" style={{ fontSize: "0.9rem" }}>workspace_premium</span>
            Plan Status
          </div>
          <div className="stat-card__value" style={{ fontSize: "0.9rem", color: "var(--primary)" }}>
            {client.status === "active" ? "Premium" : client.status === "trial" ? "Trial" : "Inactive"}
          </div>
        </div>
      </div>

      {/* Workspace branding note */}
      <div className="panel" style={{ maxWidth: 640, marginTop: "1.5rem", background: "var(--primary-light)", border: "1px solid var(--primary-mid)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span className="material-symbols-outlined" style={{ fontSize: "1.5rem", color: "var(--primary)" }}>verified</span>
          <div>
            <div style={{ fontFamily: "Manrope, sans-serif", fontWeight: 700, fontSize: "0.9rem", color: "var(--primary-dark)" }}>
              Welcome to {session.workspace.name}
            </div>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.75rem", color: "var(--primary)" }}>
              Your coaching programme is managed by {session.coach.firstName} {session.coach.lastName}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}