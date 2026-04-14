import type { ReactNode } from "react";

export function MetricCard({
  eyebrow,
  value,
  detail,
  status,
}: {
  eyebrow: string;
  value: string;
  detail: string;
  status?: ReactNode;
}) {
  return (
    <article className="metric-card">
      <div className="metric-card__eyebrow">{eyebrow}</div>
      <div className="metric-card__value">{value}</div>
      <div className="metric-card__detail">{detail}</div>
      {status}
    </article>
  );
}
