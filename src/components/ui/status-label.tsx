import { CircleDollarSign, Clock, Check, X } from "lucide-react";
import type { ReactNode } from "react";
import { STATUS_LABELS } from "@/lib/event-status.ts";
import type { EventStatus } from "@/services/events.ts";

// Each status's own color, icon and word: the status is never color alone.
export const STATUS_TONES: Record<
  EventStatus,
  { text: string; fill: string; border: string; icon: ReactNode }
> = {
  pending: {
    text: "text-status-pending",
    fill: "bg-status-pending-bg",
    border: "border-status-pending/35 hover:border-status-pending",
    icon: <Clock />,
  },
  confirmed: {
    text: "text-status-confirmed",
    fill: "bg-status-confirmed-bg",
    border: "border-status-confirmed/35 hover:border-status-confirmed",
    icon: <Check />,
  },
  paid: {
    text: "text-status-paid",
    fill: "bg-status-paid-bg",
    border: "border-status-paid/35 hover:border-status-paid",
    icon: <CircleDollarSign />,
  },
  cancelled: {
    text: "text-status-cancelled",
    fill: "bg-status-cancelled-bg",
    border: "border-status-cancelled/35 hover:border-status-cancelled",
    icon: <X />,
  },
};

// The status pill (`bs-status`): icon and word, for tables, the Evento page
// and the quick-view. The calendar grid uses EventChip instead.
export function StatusLabel({ status }: { status: EventStatus }) {
  const tone = STATUS_TONES[status];
  return (
    <span
      className={`inline-flex h-[22px] items-center gap-1 rounded-pill px-2 text-[12px]/[16px] font-medium ${tone.text} ${tone.fill}`}
    >
      <span aria-hidden className="inline-flex size-3 [&>svg]:size-3 [&>svg]:stroke-2">
        {tone.icon}
      </span>
      {STATUS_LABELS[status]}
    </span>
  );
}
