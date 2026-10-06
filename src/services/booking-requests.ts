import type { Pool } from "pg";
import type { User } from "./accounts.ts";
import { bookingConfirmationEmail, newBookingRequestEmail } from "../email/booking-request-email.ts";
import type { EmailMessage, Mailer } from "../email/mailer.ts";
import {
  BOOKING_STATUSES,
  EVENT_TYPES,
  URGENCIES,
  type BookingEventType,
  type BookingStatus,
  type BookingUrgency,
} from "../lib/booking.ts";
import { ServiceError } from "./errors.ts";
import { isUuid } from "./ids.ts";
import { requirePermission } from "./permissions.ts";
import { hashToken } from "./tokens.ts";

// What a prospective client enters on the Landing page.
export interface BookingRequestInput {
  clientName: string;
  phone?: string;
  email?: string;
  eventType: BookingEventType;
  // YYYY-MM-DD
  eventDate: string;
  description: string;
  venue?: string;
  location?: string;
  guests?: number;
  urgency?: BookingUrgency;
  musicStyle?: string;
  // A hidden field only a bot fills in.
  honeypot?: string;
}

export interface BookingRequest {
  id: string;
  clientName: string;
  phone: string | null;
  email: string | null;
  eventType: BookingEventType;
  eventDate: string;
  description: string;
  venue: string | null;
  location: string | null;
  guests: number | null;
  urgency: BookingUrgency | null;
  musicStyle: string | null;
  status: BookingStatus;
  createdAt: string;
}

export const RATE_LIMIT_PER_HOUR = 5;
const MAX_TEXT = 200;
const MAX_DESCRIPTION = 4000;
const MAX_GUESTS = 100_000;

const invalid = (message: string) => new ServiceError("invalid_input", message);

// Trimmed text, null when blank; rejects anything over `max`.
function optionalText(value: unknown, max: number, what: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw invalid(`${what} no es válido`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw invalid(`${what} es demasiado largo`);
  return trimmed || null;
}

function validDay(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw invalid("Indicá la fecha del evento");
  }
  const [y, m, d] = value.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  if (day.getUTCFullYear() !== y || day.getUTCMonth() !== m - 1 || day.getUTCDate() !== d) {
    throw invalid("La fecha del evento no es válida");
  }
  return value;
}

function validInput(input: BookingRequestInput) {
  const clientName = optionalText(input.clientName, MAX_TEXT, "El nombre");
  if (!clientName) throw invalid("Indicá tu nombre");
  const phone = optionalText(input.phone, 40, "El teléfono");
  const email = optionalText(input.email, MAX_TEXT, "El correo")?.toLowerCase() ?? null;
  if (!phone && !email) throw invalid("Dejanos un teléfono o un correo para poder responderte");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw invalid("El correo no es válido");
  if (!EVENT_TYPES.includes(input.eventType)) throw invalid("Elegí el tipo de evento");
  const eventDate = validDay(input.eventDate);
  const description = optionalText(input.description, MAX_DESCRIPTION, "La descripción");
  if (!description) throw invalid("Contanos sobre el evento");
  let guests: number | null = null;
  if (input.guests !== undefined && input.guests !== null) {
    if (!Number.isInteger(input.guests) || input.guests < 1 || input.guests > MAX_GUESTS) {
      throw invalid("La cantidad de invitados no es válida");
    }
    guests = input.guests;
  }
  if (input.urgency !== undefined && input.urgency !== null && !URGENCIES.includes(input.urgency)) {
    throw invalid("La urgencia no es válida");
  }
  return {
    clientName,
    phone,
    email,
    eventType: input.eventType,
    eventDate,
    description,
    venue: optionalText(input.venue, MAX_TEXT, "El lugar"),
    location: optionalText(input.location, MAX_TEXT, "La ubicación"),
    guests,
    urgency: input.urgency ?? null,
    musicStyle: optionalText(input.musicStyle, MAX_TEXT, "El estilo musical"),
  };
}

// A prospective client's request, from the Landing page at `slug`. Anyone may
// send one while the page is on. The request is saved first; telling the
// Members who manage bookings and confirming to the client come after, and a
// failure there is logged, never raised. `ip` only rate limits.
export async function submitBookingRequest(
  pool: Pool,
  mailer: Mailer,
  slug: string,
  input: BookingRequestInput,
  ip: string,
): Promise<{ id: string }> {
  const { rows: pages } = await pool.query<{ projectId: string; projectName: string }>(
    `SELECT l.project_id AS "projectId", p.name AS "projectName" FROM landing_pages l
     JOIN projects p ON p.id = l.project_id
     WHERE l.slug = $1 AND l.enabled`,
    [String(slug).trim().toLowerCase()],
  );
  const page = pages[0];
  if (!page) throw new ServiceError("not_found", "Page not found");

  if (input.honeypot) throw invalid("No pudimos enviar tu solicitud");
  const fields = validInput(input);

  const ipHash = hashToken(ip);
  const { rows: recent } = await pool.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM booking_requests
     WHERE ip_hash = $1 AND created_at > now() - interval '1 hour'`,
    [ipHash],
  );
  if (recent[0].count >= RATE_LIMIT_PER_HOUR) {
    throw new ServiceError("rate_limited", "Enviaste muchas solicitudes. Probá de nuevo más tarde");
  }

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO booking_requests (project_id, client_name, phone, email, event_type, event_date,
       description, venue, location, guests, urgency, music_style, ip_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
    [
      page.projectId, fields.clientName, fields.phone, fields.email, fields.eventType, fields.eventDate,
      fields.description, fields.venue, fields.location, fields.guests, fields.urgency, fields.musicStyle,
      ipHash,
    ],
  );
  const id = rows[0].id;

  await notify(pool, mailer, page.projectId, page.projectName, id, fields);
  return { id };
}

// Best effort: the request is already saved.
async function notify(
  pool: Pool,
  mailer: Mailer,
  projectId: string,
  projectName: string,
  requestId: string,
  fields: ReturnType<typeof validInput>,
): Promise<void> {
  try {
    const { rows: managers } = await pool.query<{ email: string }>(
      `SELECT u.email FROM memberships m
       JOIN roles r ON r.id = m.role_id
       JOIN users u ON u.id = m.user_id
       WHERE m.project_id = $1 AND (r.kind = 'admin' OR (r.kind = 'custom' AND r.can_manage_bookings))
       ORDER BY u.email`,
      [projectId],
    );
    for (const { email } of managers) {
      await trySend(mailer, newBookingRequestEmail(mailer, email, projectName, projectId, requestId, fields));
    }
    if (fields.email) await trySend(mailer, bookingConfirmationEmail(fields.email, projectName, fields.clientName));
  } catch (err) {
    console.error("Could not notify about a new Booking Request", err);
  }
}

// One email that may fail without stopping the rest.
async function trySend(mailer: Mailer, message: EmailMessage): Promise<void> {
  try {
    await mailer.send(message);
  } catch (err) {
    console.error(`Could not send a Booking Request email to ${message.to}`, err);
  }
}

const REQUEST_COLUMNS = `id, client_name AS "clientName", phone, email, event_type AS "eventType",
  to_char(event_date, 'YYYY-MM-DD') AS "eventDate", description, venue, location, guests, urgency,
  music_style AS "musicStyle", status, created_at AS "createdAt"`;

export interface BookingRequestFilters {
  status?: BookingStatus;
  eventType?: BookingEventType;
  // Event date range, YYYY-MM-DD, both ends included.
  from?: string;
  to?: string;
}

export interface BookingNote {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
}

// The Project's requests, newest first, narrowed by every filter given. Needs
// "manage bookings".
export async function listBookingRequests(
  pool: Pool,
  user: User,
  projectId: string,
  filters: BookingRequestFilters = {},
): Promise<BookingRequest[]> {
  await requirePermission(pool, user, projectId, "manageBookings");
  const { status, eventType, from, to } = filters;
  if (status !== undefined && !BOOKING_STATUSES.includes(status)) throw invalid("El estado no es válido");
  if (eventType !== undefined && !EVENT_TYPES.includes(eventType)) throw invalid("El tipo de evento no es válido");
  if (from !== undefined) validDay(from);
  if (to !== undefined) validDay(to);
  const { rows } = await pool.query<BookingRequest>(
    `SELECT ${REQUEST_COLUMNS} FROM booking_requests
     WHERE project_id = $1
       AND ($2::booking_status IS NULL OR status = $2)
       AND ($3::booking_event_type IS NULL OR event_type = $3)
       AND ($4::date IS NULL OR event_date >= $4)
       AND ($5::date IS NULL OR event_date <= $5)
     ORDER BY created_at DESC, id`,
    [projectId, status ?? null, eventType ?? null, from ?? null, to ?? null],
  );
  return rows;
}

// Checks "manage bookings" and that the request belongs to the Project; a
// request elsewhere reads as not found.
async function requireRequest(pool: Pool, user: User, projectId: string, requestId: string): Promise<void> {
  await requirePermission(pool, user, projectId, "manageBookings");
  if (!isUuid(requestId)) throw new ServiceError("not_found", "Request not found");
  const { rows } = await pool.query(`SELECT 1 FROM booking_requests WHERE id = $1 AND project_id = $2`, [
    requestId,
    projectId,
  ]);
  if (!rows[0]) throw new ServiceError("not_found", "Request not found");
}

// Moves a request to any status, in any direction. Needs "manage bookings".
export async function setBookingStatus(
  pool: Pool,
  user: User,
  projectId: string,
  requestId: string,
  status: BookingStatus,
): Promise<BookingRequest> {
  await requireRequest(pool, user, projectId, requestId);
  if (!BOOKING_STATUSES.includes(status)) throw invalid("El estado no es válido");
  const { rows } = await pool.query<BookingRequest>(
    `UPDATE booking_requests SET status = $3 WHERE id = $1 AND project_id = $2 RETURNING ${REQUEST_COLUMNS}`,
    [requestId, projectId, status],
  );
  return rows[0];
}

const MAX_NOTE = 4000;
const NOTE_COLUMNS = `id, body, author_name AS "authorName", created_at AS "createdAt"`;

// Adds an internal note signed by the acting User. Needs "manage bookings".
export async function addBookingNote(
  pool: Pool,
  user: User,
  projectId: string,
  requestId: string,
  body: string,
): Promise<BookingNote> {
  await requireRequest(pool, user, projectId, requestId);
  const note = optionalText(body, MAX_NOTE, "La nota");
  if (!note) throw invalid("Escribí la nota");
  const { rows } = await pool.query<BookingNote>(
    `INSERT INTO booking_request_notes (request_id, author_id, author_name, body)
     VALUES ($1, $2, $3, $4) RETURNING ${NOTE_COLUMNS}`,
    [requestId, user.id, user.displayName, note],
  );
  return rows[0];
}

// The request's internal notes, oldest first. Needs "manage bookings".
export async function listBookingNotes(
  pool: Pool,
  user: User,
  projectId: string,
  requestId: string,
): Promise<BookingNote[]> {
  await requireRequest(pool, user, projectId, requestId);
  const { rows } = await pool.query<BookingNote>(
    `SELECT ${NOTE_COLUMNS} FROM booking_request_notes WHERE request_id = $1 ORDER BY created_at, id`,
    [requestId],
  );
  return rows;
}

// Deletes the request and, with it, its notes. Needs "manage bookings".
export async function deleteBookingRequest(
  pool: Pool,
  user: User,
  projectId: string,
  requestId: string,
): Promise<void> {
  await requireRequest(pool, user, projectId, requestId);
  await pool.query(`DELETE FROM booking_requests WHERE id = $1 AND project_id = $2`, [requestId, projectId]);
}

// One of the Project's requests. Needs "manage bookings"; another Project's
// request reads as not found.
export async function getBookingRequest(
  pool: Pool,
  user: User,
  projectId: string,
  requestId: string,
): Promise<BookingRequest> {
  await requirePermission(pool, user, projectId, "manageBookings");
  if (!isUuid(requestId)) throw new ServiceError("not_found", "Request not found");
  const { rows } = await pool.query<BookingRequest>(
    `SELECT ${REQUEST_COLUMNS} FROM booking_requests WHERE id = $1 AND project_id = $2`,
    [requestId, projectId],
  );
  if (!rows[0]) throw new ServiceError("not_found", "Request not found");
  return rows[0];
}
