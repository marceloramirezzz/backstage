import type { ComponentProps, ReactNode } from "react";

// A labelled control (`bs-field`): label always visible, optional hint, and
// an error that replaces the hint and outlines the control.
export function Field({
  label,
  labelEnd,
  hint,
  error,
  children,
  className = "",
}: {
  label: ReactNode;
  // Something set at the end of the label row, e.g. a "forgot?" link.
  labelEnd?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`group grid gap-1.5 ${className}`} data-error={error ? "" : undefined}>
      <span className="flex justify-between text-[12px]/[16px] font-medium text-ink-muted">
        {label}
        {labelEnd}
      </span>
      {children}
      {(error || hint) && (
        <span
          className={`text-[12px]/[16px] ${error ? "text-status-cancelled" : "text-ink-muted"}`}
        >
          {error || hint}
        </span>
      )}
    </label>
  );
}

const control =
  "w-full rounded-md border border-line-control bg-bg-2 px-3 text-[14px]/[20px] text-ink group-data-error:border-status-cancelled";

const heights = { md: "h-9", lg: "h-11" };

export function Input({
  className = "",
  size = "md",
  ...props
}: Omit<ComponentProps<"input">, "size"> & { size?: keyof typeof heights }) {
  return (
    <input
      className={`${control} ${heights[size]} placeholder:text-ink-subtle ${className}`}
      {...props}
    />
  );
}

// The chevron is drawn with two gradients, as in the handoff.
const chevron =
  "appearance-none pr-8 bg-no-repeat bg-size-[5px_5px] bg-[linear-gradient(45deg,transparent_50%,currentColor_50%),linear-gradient(135deg,currentColor_50%,transparent_50%)] bg-position-[calc(100%-17px)_16px,calc(100%-12px)_16px]";

export function Select({
  className = "",
  pill = false,
  ...props
}: ComponentProps<"select"> & { pill?: boolean }) {
  return (
    <select
      className={`${control} h-9 ${chevron} ${pill ? "w-auto rounded-pill" : ""} ${className}`}
      {...props}
    />
  );
}
