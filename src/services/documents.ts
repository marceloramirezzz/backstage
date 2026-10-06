import type { Pool, PoolClient } from "pg";
import type { User } from "./accounts.ts";
import { EVENT_TYPE_LABELS, type BookingEventType } from "../lib/booking.ts";
import { todayIn } from "../lib/format.ts";
import { buildInvoiceModel, type InvoiceModel } from "../lib/invoice.ts";
import { buildQuoteModel, type QuoteModel } from "../lib/quote.ts";
import { ServiceError } from "./errors.ts";
import { isUuid } from "./ids.ts";
import { getPermissions } from "./permissions.ts";
import { inTransaction } from "./transaction.ts";

export type DocumentType = "quote" | "contract" | "invoice";

// What a quote is made from. A Booking Request has no price of its own, so
// whoever generates it states the amount (whole Guaraníes); an Event's quote
// uses its cachet.
export type QuoteSource = { eventId: string } | { bookingRequestId: string; amount: number };

// What a Document's number is recorded against.
type DocumentSource = { eventId: string } | { bookingRequestId: string };

export interface Quote {
  number: number;
  model: QuoteModel;
}

// The quote's content and its number, which is assigned the first time one is
// generated for this source and kept on every regeneration. Needs both
// "manage bookings" and "see total pay & expenses". The PDF is drawn from the
// model and never stored.
export async function generateQuote(
  pool: Pool,
  user: User,
  projectId: string,
  source: QuoteSource,
): Promise<Quote> {
  const permissions = await getPermissions(pool, user, projectId);
  if (!permissions.manageBookings || !permissions.seeTotalPayExpenses) {
    throw new ServiceError("forbidden", "You don't have permission to do that");
  }
  return inTransaction(pool, async (client) => {
    const draft = await loadQuoteSource(client, projectId, source);
    const number = await documentNumber(client, projectId, "quote", source);
    const { rows } = await client.query<{ name: string }>("SELECT name FROM projects WHERE id = $1", [projectId]);
    return { number, model: buildQuoteModel({ bandName: rows[0].name, number, issuedOn: todayIn(), ...draft }) };
  });
}

export interface Invoice {
  number: number;
  model: InvoiceModel;
}

// An Event's invoice: its cachet, the Payments received so far and the balance.
// Numbered like a quote: the first generation takes the Project's next invoice
// number and regenerations keep it, while the figures are always current. Same
// permissions as a quote. A statement, not a fiscal invoice.
export async function generateInvoice(
  pool: Pool,
  user: User,
  projectId: string,
  eventId: string,
): Promise<Invoice> {
  const permissions = await getPermissions(pool, user, projectId);
  if (!permissions.manageBookings || !permissions.seeTotalPayExpenses) {
    throw new ServiceError("forbidden", "You don't have permission to do that");
  }
  if (!isUuid(eventId)) throw new ServiceError("not_found", "Event not found");
  return inTransaction(pool, async (client) => {
    const { rows } = await client.query<{
      name: string;
      date: string;
      location: string | null;
      pay: number;
      clientName: string | null;
      bandName: string;
    }>(
      `SELECT e.name, to_char(e.date, 'YYYY-MM-DD') AS date, e.location, e.pay::float8 AS pay,
              (SELECT b.client_name FROM booking_requests b WHERE b.event_id = e.id) AS "clientName",
              (SELECT p.name FROM projects p WHERE p.id = e.project_id) AS "bandName"
       FROM events e WHERE e.id = $1 AND e.project_id = $2`,
      [eventId, projectId],
    );
    const event = rows[0];
    if (!event) throw new ServiceError("not_found", "Event not found");
    if (event.pay <= 0) throw new ServiceError("invalid_input", "The Event has no cachet to invoice");
    const { rows: payments } = await client.query<{ date: string; amount: number; note: string | null }>(
      `SELECT to_char(date, 'YYYY-MM-DD') AS date, amount::float8 AS amount, note
       FROM event_payments WHERE event_id = $1 ORDER BY date, created_at, id`,
      [eventId],
    );
    const number = await documentNumber(client, projectId, "invoice", { eventId });
    return {
      number,
      model: buildInvoiceModel({
        bandName: event.bandName,
        number,
        issuedOn: todayIn(),
        clientName: event.clientName,
        eventName: event.name,
        eventDate: event.date,
        location: event.location,
        cachet: event.pay,
        payments,
      }),
    };
  });
}

async function loadQuoteSource(client: PoolClient, projectId: string, source: QuoteSource) {
  if ("eventId" in source) {
    if (!isUuid(source.eventId)) throw new ServiceError("not_found", "Event not found");
    const { rows } = await client.query<{
      name: string;
      date: string;
      location: string | null;
      pay: number;
      clientName: string | null;
    }>(
      `SELECT e.name, to_char(e.date, 'YYYY-MM-DD') AS date, e.location, e.pay::float8 AS pay,
              (SELECT b.client_name FROM booking_requests b WHERE b.event_id = e.id) AS "clientName"
       FROM events e WHERE e.id = $1 AND e.project_id = $2`,
      [source.eventId, projectId],
    );
    const event = rows[0];
    if (!event) throw new ServiceError("not_found", "Event not found");
    if (event.pay <= 0) throw new ServiceError("invalid_input", "The Event has no cachet to quote");
    return {
      clientName: event.clientName,
      eventName: event.name,
      eventType: null,
      eventDate: event.date,
      location: event.location,
      amount: event.pay,
    };
  }
  if (!isUuid(source.bookingRequestId)) throw new ServiceError("not_found", "Request not found");
  if (!Number.isSafeInteger(source.amount) || source.amount <= 0) {
    throw new ServiceError("invalid_input", "A quote's amount must be a positive whole amount of Guaraníes");
  }
  const { rows } = await client.query<{
    clientName: string;
    eventType: BookingEventType;
    eventDate: string;
    venue: string | null;
    location: string | null;
  }>(
    `SELECT client_name AS "clientName", event_type AS "eventType",
            to_char(event_date, 'YYYY-MM-DD') AS "eventDate", venue, location
     FROM booking_requests WHERE id = $1 AND project_id = $2`,
    [source.bookingRequestId, projectId],
  );
  const request = rows[0];
  if (!request) throw new ServiceError("not_found", "Request not found");
  return {
    clientName: request.clientName,
    eventName: `${EVENT_TYPE_LABELS[request.eventType]} — ${request.clientName}`,
    eventType: request.eventType,
    eventDate: request.eventDate,
    location: [request.venue, request.location].filter(Boolean).join(", ") || null,
    amount: source.amount,
  };
}

// The source's number for this type, giving it the Project's next one if it has
// none yet. The sequence row is locked first, so two generations of the same
// source can't each take a number.
async function documentNumber(
  client: PoolClient,
  projectId: string,
  type: DocumentType,
  source: DocumentSource,
): Promise<number> {
  await client.query(
    `INSERT INTO document_sequences (project_id, type, last_number) VALUES ($1, $2, 0)
     ON CONFLICT DO NOTHING`,
    [projectId, type],
  );
  await client.query(`SELECT 1 FROM document_sequences WHERE project_id = $1 AND type = $2 FOR UPDATE`, [
    projectId,
    type,
  ]);
  const [column, sourceId] =
    "eventId" in source ? ["event_id", source.eventId] : ["booking_request_id", source.bookingRequestId];
  const { rows: existing } = await client.query<{ number: number }>(
    `SELECT number FROM documents WHERE project_id = $1 AND type = $2 AND ${column} = $3`,
    [projectId, type, sourceId],
  );
  if (existing[0]) return existing[0].number;
  const { rows } = await client.query<{ number: number }>(
    `UPDATE document_sequences SET last_number = last_number + 1
     WHERE project_id = $1 AND type = $2 RETURNING last_number AS number`,
    [projectId, type],
  );
  await client.query(`INSERT INTO documents (project_id, type, number, ${column}) VALUES ($1, $2, $3, $4)`, [
    projectId,
    type,
    rows[0].number,
    sourceId,
  ]);
  return rows[0].number;
}
