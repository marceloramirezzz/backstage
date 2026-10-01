import { EVENT_STATUSES, type EventStatus } from "@/services/events.ts";

// An Event's status as the UI names it.
export const STATUS_LABELS: Record<EventStatus, string> = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  paid: "Pagado",
  cancelled: "Cancelado",
};

export const STATUS_OPTIONS = EVENT_STATUSES.map((value) => ({
  value,
  label: STATUS_LABELS[value],
}));
