import type { ComponentProps } from "react";
import { STATUS_LABELS } from "@/lib/event-status.ts";
import type { EventStatus } from "@/services/events.ts";
import { STATUS_TONES } from "./status-label.tsx";

// A calendar entry (`bs-chip`): status line, name, time. Cancelled Events
// stay, struck through, so the band sees the date freed up. Set
// `aria-selected` while its quick-view is open.
export function EventChip({
  status,
  name,
  time,
  ...props
}: Omit<ComponentProps<"button">, "children"> & {
  status: EventStatus;
  name: string;
  // `22:00 – 02:00`; none while the start isn't settled.
  time: string | null;
}) {
  const tone = STATUS_TONES[status];
  return (
    <button
      type="button"
      {...props}
      className={`flex w-full cursor-pointer flex-col gap-0.5 rounded-sm border px-2 py-1.5 text-left aria-selected:border-ink aria-selected:bg-bg-3 ${tone.fill} ${tone.border}`}
    >
      <span className={`flex items-center gap-1 text-[11px]/[14px] font-medium ${tone.text}`}>
        <span aria-hidden className="inline-flex size-[11px] [&>svg]:size-[11px] [&>svg]:stroke-[2.25]">
          {tone.icon}
        </span>
        {STATUS_LABELS[status]}
      </span>
      <span
        className={`truncate text-[13px]/[18px] font-medium ${status === "cancelled" ? "text-ink-muted line-through" : "text-ink"}`}
      >
        {name}
      </span>
      {time && <span className="font-mono text-[11px]/[14px] text-ink-muted">{time}</span>}
    </button>
  );
}
