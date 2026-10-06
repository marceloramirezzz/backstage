// The content of an invoice PDF, as plain strings ready to print. Pure, so the
// wording and figures are tested apart from the layout. A statement of cachet,
// Payments received and balance — not a fiscal invoice.

import { formatFullDate, formatGuaranies } from "./format.ts";

export interface InvoiceInput {
  bandName: string;
  number: number;
  // The day it was issued, YYYY-MM-DD.
  issuedOn: string;
  clientName: string | null;
  eventName: string;
  // YYYY-MM-DD
  eventDate: string;
  location: string | null;
  // Whole Guaraníes.
  cachet: number;
  payments: { date: string; amount: number; note: string | null }[];
}

export interface InvoiceModel {
  title: string;
  bandName: string;
  issuedOn: string;
  clientName: string | null;
  // Label/value lines describing the gig; empty values are left out.
  details: [string, string][];
  cachet: string;
  payments: { date: string; description: string; amount: string }[];
  received: string;
  // "Saldo pendiente" while money is owed, "Saldo a favor del cliente" when overpaid.
  balanceLabel: string;
  // Always printed unsigned; the label says which way it runs.
  balance: string;
  // `FAC-0007`
  numberLabel: string;
}

export const invoiceNumberLabel = (number: number) => `FAC-${String(number).padStart(4, "0")}`;

export function buildInvoiceModel(input: InvoiceInput): InvoiceModel {
  const received = input.payments.reduce((sum, p) => sum + p.amount, 0);
  const balance = input.cachet - received;
  const details: [string, string | null][] = [
    ["Evento", input.eventName],
    ["Fecha", formatFullDate(input.eventDate)],
    ["Lugar", input.location],
  ];
  return {
    title: `Factura ${invoiceNumberLabel(input.number)}`,
    bandName: input.bandName,
    issuedOn: formatFullDate(input.issuedOn),
    clientName: input.clientName,
    details: details.filter((d): d is [string, string] => d[1] !== null),
    cachet: formatGuaranies(input.cachet),
    payments: input.payments.map((p) => ({
      date: formatFullDate(p.date),
      description: p.note ?? "Pago recibido",
      amount: formatGuaranies(p.amount),
    })),
    received: formatGuaranies(received),
    balanceLabel: balance > 0 ? "Saldo pendiente" : balance < 0 ? "Saldo a favor del cliente" : "Saldo",
    balance: formatGuaranies(Math.abs(balance)),
    numberLabel: invoiceNumberLabel(input.number),
  };
}
