// The fixed vocabularies of a Booking Request, with the Spanish words the UI uses.

export const EVENT_TYPES = ["wedding", "corporate", "private_party", "festival", "bar_restaurant", "other"] as const;
export type BookingEventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<BookingEventType, string> = {
  wedding: "Boda",
  corporate: "Corporativo",
  private_party: "Fiesta privada",
  festival: "Festival",
  bar_restaurant: "Bar o restaurante",
  other: "Otro",
};

export const URGENCIES = ["low", "normal", "high", "urgent"] as const;
export type BookingUrgency = (typeof URGENCIES)[number];

export const URGENCY_LABELS: Record<BookingUrgency, string> = {
  low: "Baja",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};

export const BOOKING_STATUSES = ["new", "contacted", "quote_sent", "confirmed", "completed", "cancelled"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  new: "Nueva",
  contacted: "Contactado",
  quote_sent: "Cotización enviada",
  confirmed: "Confirmada",
  completed: "Completada",
  cancelled: "Cancelada",
};
