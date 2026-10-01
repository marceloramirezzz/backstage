import type { ComponentProps } from "react";

// Pill actions from the handoff's `bs-btn`. One `primary` per view; `inverse`
// is reserved for the sidebar's create action; `danger` for irreversible ones.
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "inverse";
export type ButtonSize = "md" | "sm" | "lg";

const base =
  "inline-flex items-center gap-2 rounded-pill border font-medium whitespace-nowrap cursor-pointer no-underline transition-[background-color,box-shadow,border-color] duration-150 disabled:opacity-45 disabled:cursor-not-allowed disabled:shadow-none aria-disabled:opacity-45 aria-disabled:cursor-not-allowed";

// Each sets its own border color: two border-color utilities on one element
// resolve by stylesheet order, not class order.
const variants: Record<ButtonVariant, string> = {
  primary: "border-transparent bg-spotlight text-on-spotlight hover:shadow-glow",
  secondary: "bg-transparent text-ink border-line-control hover:bg-bg-3",
  ghost: "border-transparent bg-transparent text-ink-muted hover:bg-bg-3 hover:text-ink",
  danger: "bg-transparent text-status-cancelled border-status-cancelled hover:bg-status-cancelled-bg",
  inverse: "border-transparent bg-ink text-bg-0",
};

// `lg` is the 44px height the sign-in form and the inverse button use.
const sizes: Record<ButtonSize, string> = {
  md: "h-9 px-4 text-[14px]/[20px]",
  sm: "h-[30px] px-3 text-[13px]/[20px]",
  lg: "h-11 px-4 text-[14px]/[20px]",
};

// The classes, for links styled as buttons.
export function buttonClass({
  variant = "secondary",
  size = "md",
  className = "",
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string {
  return `${base} ${variants[variant]} ${sizes[size]} ${className}`;
}

export function Button({
  variant,
  size,
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type={type} className={buttonClass({ variant, size, className })} {...props} />;
}

// Icon-only round button (`bs-iconbtn`), or the smaller square one table
// rows use (`bs-iconbtn-sq`). Always give it an `aria-label`.
export function IconButton({
  className = "",
  type = "button",
  square = false,
  ...props
}: ComponentProps<"button"> & { "aria-label": string; square?: boolean }) {
  const shape = square
    ? "size-[30px] rounded-md border-line"
    : "size-9 rounded-pill border-line-control";
  return (
    <button
      type={type}
      className={`inline-grid shrink-0 cursor-pointer place-items-center border bg-transparent text-ink-muted hover:bg-bg-3 hover:text-ink ${shape} ${className}`}
      {...props}
    />
  );
}
