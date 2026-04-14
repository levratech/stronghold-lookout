type Tone = "success" | "warning" | "danger" | "neutral";

export function StatusPill({
  tone,
  label,
}: {
  tone: Tone;
  label: string;
}) {
  return (
    <span className={`status-pill status-pill--${tone}`}>
      <span className="status-pill__dot" aria-hidden="true" />
      {label}
    </span>
  );
}
