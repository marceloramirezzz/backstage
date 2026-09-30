import type { ReactNode } from "react";
import { SpotlightMark } from "@/components/ui/brand.tsx";

// The signed-out frame from the handoff's sign-in screen: spotlight mark,
// title and intro, then a card, then an optional line below it.
export function AuthScreen({
  title,
  intro,
  children,
  footer,
}: {
  title: ReactNode;
  intro: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-bg-0 p-6 max-desktop:px-4">
      <div className="flex w-full max-w-[400px] flex-col gap-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <SpotlightMark />
          <h1 className="m-0 text-[28px]/[32px] font-semibold tracking-[-0.02em]">{title}</h1>
          <p className="m-0 text-[14px] text-ink-muted">{intro}</p>
        </div>
        {children}
        {footer && <p className="m-0 text-center text-[14px] text-ink-muted">{footer}</p>}
      </div>
    </main>
  );
}

// The card holding an auth form (`bg-1` panel from the sign-in screen).
export const authCardClass =
  "flex flex-col gap-4 rounded-lg border border-line bg-bg-1 p-6 max-desktop:p-5";

// A form's outcome line: errors in the danger color, confirmations muted.
export function FormMessage({ tone, children }: { tone: "error" | "info"; children: ReactNode }) {
  return tone === "error" ? (
    <p role="alert" className="m-0 text-[13px]/[18px] text-status-cancelled">
      {children}
    </p>
  ) : (
    <p role="status" className="m-0 text-[13px]/[18px] text-ink-muted">
      {children}
    </p>
  );
}
