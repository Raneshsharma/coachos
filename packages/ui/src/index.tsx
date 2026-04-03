import type { PropsWithChildren, ReactNode } from "react";

type ShellProps = PropsWithChildren<{
  eyebrow?: string;
  title: string;
  body?: string;
  actions?: ReactNode;
}>;

export function SectionShell({ eyebrow, title, body, actions, children }: ShellProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h2>{title}</h2>
          {body ? <p className="muted">{body}</p> : null}
        </div>
        {actions ? <div className="panel-actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function StatCard({
  label,
  value,
  tone = "default"
}: {
  label: string;
  value: string;
  tone?: "default" | "accent" | "warning";
}) {
  return (
    <div className={`stat-card stat-card-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function Pill({ children, tone = "default" }: PropsWithChildren<{ tone?: "default" | "danger" | "success" }>) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}
