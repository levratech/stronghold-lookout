import type { ReactNode } from "react";

export function Panel({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <div className="panel__eyebrow">{eyebrow}</div>
          <h2 className="panel__title">{title}</h2>
          {description ? <p className="panel__description">{description}</p> : null}
        </div>
        {actions}
      </div>
      <div className="panel__body">{children}</div>
    </section>
  );
}
