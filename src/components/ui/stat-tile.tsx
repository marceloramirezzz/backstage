import type { ReactNode } from "react";

// A Resumen figure (`bs-stat`): label with icon, a big mono value and a
// one-line footnote; `lead` outlines it in the spotlight.
export function StatTile({
  label,
  icon,
  value,
  foot,
  lead,
}: {
  label: string;
  icon: ReactNode;
  value: string;
  foot: string;
  lead?: boolean;
}) {
  return (
    <div className={`grid gap-2 rounded-lg border bg-bg-2 p-4 ${lead ? "border-spotlight" : "border-line"}`}>
      <span className={`flex items-center gap-2 text-[13px]/[18px] font-medium ${lead ? "text-spotlight-ink" : "text-ink-muted"}`}>
        {icon}
        {label}
      </span>
      <span className="font-mono text-[28px]/[32px] font-medium tracking-[-0.02em] tabular-nums">{value}</span>
      <span className="text-[12px]/[16px] text-ink-muted">{foot}</span>
    </div>
  );
}
