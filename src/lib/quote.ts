// The content of a quote PDF, as plain strings ready to print. Pure, so the
// wording and figures are tested apart from the layout.

import { EVENT_TYPE_LABELS, type BookingEventType } from "./booking.ts";
import { formatFullDate, formatGuaranies } from "./format.ts";

export interface QuoteInput {
  bandName: string;
  number: number;
  // The day it was issued, YYYY-MM-DD.
  issuedOn: string;
  clientName: string | null;
  eventName: string;
  eventType: BookingEventType | null;
  // YYYY-MM-DD
  eventDate: string;
  location: string | null;
  // Whole Guaraníes.
  amount: number;
}

export interface QuoteModel {
  title: string;
  bandName: string;
  issuedOn: string;
  clientName: string | null;
  // Label/value lines describing the gig; empty values are left out.
  details: [string, string][];
  total: string;
  // `COT-0007`
  numberLabel: string;
}

export const quoteNumberLabel = (number: number) => `COT-${String(number).padStart(4, "0")}`;

export function buildQuoteModel(input: QuoteInput): QuoteModel {
  const details: [string, string | null][] = [
    ["Evento", input.eventName],
    ["Tipo de evento", input.eventType ? EVENT_TYPE_LABELS[input.eventType] : null],
    ["Fecha", formatFullDate(input.eventDate)],
    ["Lugar", input.location],
  ];
  return {
    title: `Cotización ${quoteNumberLabel(input.number)}`,
    bandName: input.bandName,
    issuedOn: formatFullDate(input.issuedOn),
    clientName: input.clientName,
    details: details.filter((d): d is [string, string] => d[1] !== null),
    total: formatGuaranies(input.amount),
    numberLabel: quoteNumberLabel(input.number),
  };
}
