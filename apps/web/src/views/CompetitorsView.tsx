import React from "react";

export function CompetitorsView() {
  return (
    <div className="page-view">
      <p className="eyebrow">Strategic Insights</p>
      <h1 className="page-title">Competitor Analysis</h1>
      <p className="page-subtitle">Deep dive into Spur.fit, TrueCoach, and MyPTHub to highlight our market position.</p>

      <div className="content-grid">
        {/* Market Positioning Map */}
        <div className="panel card-glass" style={{ gridColumn: "1 / -1" }}>
          <div className="section-header">
            <h3>CoachOS vs Current Market</h3>
            <span className="pill pill-success">Advantage: AI Automation</span>
          </div>
          <div className="competitor-matrix">
            <div className="matrix-row matrix-header">
              <div>Feature Category</div>
              <div>Spur.fit</div>
              <div>TrueCoach</div>
              <div><strong>CoachOS</strong></div>
            </div>
            <div className="matrix-row">
              <div>Workout Builder</div>
              <div className="text-sm">Manual Folders</div>
              <div className="text-sm">Basic Library</div>
              <div className="text-sm" style={{ color: "var(--primary)" }}>AI 1-Click Generation</div>
            </div>
            <div className="matrix-row">
              <div>Nutrition Swap</div>
              <div className="text-sm">Static Meal Plans</div>
              <div className="text-sm">Macro Goals Only</div>
              <div className="text-sm" style={{ color: "var(--primary)" }}>Interactive Agentic Swap</div>
            </div>
            <div className="matrix-row">
              <div>Billing & Invoices</div>
              <div className="text-sm">Stripe Link Only</div>
              <div className="text-sm">Simple Receipts</div>
              <div className="text-sm" style={{ color: "var(--primary)" }}>Auto UK VAT (20%) + PDF</div>
            </div>
            <div className="matrix-row">
              <div>Client Feedback</div>
              <div className="text-sm">Passive Messages</div>
              <div className="text-sm">Email Digest</div>
              <div className="text-sm" style={{ color: "var(--primary)" }}>Active Habit Nudges</div>
            </div>
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="panel card-glass">
          <h3 style={{ marginBottom: "1rem" }}>Spur.fit Weaknesses</h3>
          <ul className="stack compact text-sm">
            <li><strong>Static Programs:</strong> They use multi-week calendars that remain static. We use <em>Adaptive Planning</em>.</li>
            <li><strong>Poor UK Tax Support:</strong> They lack automated UK VAT breakdown on invoices. Our P0 feature wins the UK market.</li>
            <li><strong>Manual Data Entry:</strong> Coaches have to manually map sets and reps. We use DeepSeek generation.</li>
          </ul>
        </div>

        <div className="panel card-glass">
          <h3 style={{ marginBottom: "1rem" }}>CoachOS UI/UX "Stitch" Advantage</h3>
          <ul className="stack compact text-sm">
            <li><strong>Dynamic Styling:</strong> Glassmorphic cards, contextual pills, polished active states.</li>
            <li><strong>One-Tap AI Actions:</strong> Replace static warning tables with inline, agent-driven resolution buttons.</li>
            <li><strong>Proof Engine:</strong> Converts standard metrics into visually branded Instagram-ready share cards.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
