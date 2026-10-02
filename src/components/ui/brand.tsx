/* eslint-disable @next/next/no-img-element -- small fixed-size brand PNGs */
import Link from "next/link";

// The stage-door mark, white on dark grounds and black on light ones.
export function DoorMark({ className = "h-7" }: { className?: string }) {
  return (
    <>
      <img
        src="/brand/backstage-door-white.png"
        alt=""
        className={`block w-auto light:hidden ${className}`}
      />
      <img
        src="/brand/backstage-door-black.png"
        alt=""
        className={`hidden w-auto light:block ${className}`}
      />
    </>
  );
}

// Mark + "Backstage" (`bs-brand`).
// `px-3` lines it up with the sidebar's links; the top bar sets it flush.
export function BrandLockup({ href, className = "px-3" }: { href: string; className?: string }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 text-[17px]/[20px] font-semibold tracking-[-0.01em] text-ink no-underline hover:text-ink ${className}`}
    >
      <DoorMark />
      Backstage
    </Link>
  );
}

// The yellow mark, for splash screens on bg-0 only.
export function SpotlightMark({ className = "h-16" }: { className?: string }) {
  return <img src="/brand/backstage-door-spotlight.png" alt="Backstage" className={`w-auto ${className}`} />;
}

// `sm` is the handoff's `bs-avatar`; `md` the sidebar's User avatar; `lg`
// a Banda beside its Invitación.
const avatarSizes = {
  sm: "size-6 text-[11px]/[14px]",
  md: "size-8 text-[12px]/[16px]",
  lg: "size-9 text-[14px]/[20px]",
};

export function Avatar({
  initials,
  tone = "spotlight",
  size = "sm",
}: {
  initials: string;
  tone?: "spotlight" | "neutral";
  size?: keyof typeof avatarSizes;
}) {
  const colors = tone === "spotlight" ? "bg-spotlight text-on-spotlight" : "bg-bg-3 text-ink";
  return (
    <span
      aria-hidden
      className={`inline-grid shrink-0 place-items-center rounded-pill font-semibold ${colors} ${avatarSizes[size]}`}
    >
      {initials}
    </span>
  );
}
