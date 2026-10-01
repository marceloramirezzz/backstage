import type { ReactNode } from "react";

// The small outlined uppercase marker (`bs-tag`), in the muted ink the
// handoff uses to mark a row's type, e.g. an Enganchado in the Repertorio.
export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-[18px] items-center rounded-sm border border-ink-muted px-1.5 text-[10px]/[14px] font-semibold tracking-[.06em] text-ink-muted uppercase">
      {children}
    </span>
  );
}
