// The hot-pink count (`bs-count`): something needs the User's attention.
// Capped at 99+; callers hide it at zero. Without a `label` it's hidden from
// assistive tech, for when the count is already spoken nearby.
export function CountBadge({ n, label }: { n: number; label?: string }) {
  return (
    <span
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className="inline-grid h-[18px] min-w-[22px] place-items-center rounded-pill bg-hot px-1.5 text-[11px]/[14px] font-semibold text-on-hot tabular-nums"
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}
