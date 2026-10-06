import type { Pool } from "pg";
import type { User } from "./accounts.ts";
import { ServiceError } from "./errors.ts";
import { requireEdit, requireEvent } from "./events.ts";
import { isUuid } from "./ids.ts";
import { getPermissions, type Permissions } from "./permissions.ts";
import { isDay } from "./splits.ts";

// Money received from the client toward one Event.
export interface Payment {
  id: string;
  // YYYY-MM-DD.
  date: string;
  // Whole Guaraníes.
  amount: number;
  note: string | null;
}

export interface PaymentInput {
  date: string;
  amount: number;
  note?: string | null;
}

export interface PaymentSummary {
  pay: number;
  payments: Payment[];
  received: number;
  // The Event's pay minus `received`; negative when overpaid.
  balance: number;
}

const PAYMENT_COLUMNS = `p.id, to_char(p.date, 'YYYY-MM-DD') AS date, p.amount::float8 AS amount, p.note`;

// The Event's Payments, received and balance, or null for those who can't see
// totals: they never receive Payments.
export async function getPayments(
  pool: Pool,
  user: User,
  projectId: string,
  eventId: string,
): Promise<PaymentSummary | null> {
  const permissions = await getPermissions(pool, user, projectId);
  await requireEvent(pool, projectId, eventId);
  if (!permissions.seeTotalPayExpenses) return null;
  const { rows: payments } = await pool.query<Payment>(
    `SELECT ${PAYMENT_COLUMNS} FROM event_payments p
     WHERE p.event_id = $1 ORDER BY p.date, p.created_at, p.id`,
    [eventId],
  );
  const { rows } = await pool.query<{ pay: number }>("SELECT pay::float8 AS pay FROM events WHERE id = $1", [eventId]);
  const received = payments.reduce((sum, p) => sum + p.amount, 0);
  return { pay: rows[0].pay, payments, received, balance: rows[0].pay - received };
}

export async function addPayment(
  pool: Pool,
  user: User,
  projectId: string,
  eventId: string,
  input: PaymentInput,
): Promise<Payment> {
  requireEditAndSee(await getPermissions(pool, user, projectId));
  const { date, amount, note } = validate(input);
  await requireEvent(pool, projectId, eventId);
  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO event_payments (event_id, date, amount, note) VALUES ($1, $2, $3, $4) RETURNING id",
    [eventId, date, amount, note],
  );
  return { id: rows[0].id, date, amount, note };
}

export async function updatePayment(
  pool: Pool,
  user: User,
  projectId: string,
  eventId: string,
  paymentId: string,
  input: PaymentInput,
): Promise<Payment> {
  requireEditAndSee(await getPermissions(pool, user, projectId));
  const { date, amount, note } = validate(input);
  await requireEvent(pool, projectId, eventId);
  const { rowCount } = isUuid(paymentId)
    ? await pool.query(
        "UPDATE event_payments SET date = $3, amount = $4, note = $5 WHERE id = $1 AND event_id = $2",
        [paymentId, eventId, date, amount, note],
      )
    : { rowCount: 0 };
  if (!rowCount) throw new ServiceError("not_found", "Payment not found");
  return { id: paymentId, date, amount, note };
}

export async function removePayment(
  pool: Pool,
  user: User,
  projectId: string,
  eventId: string,
  paymentId: string,
): Promise<void> {
  requireEditAndSee(await getPermissions(pool, user, projectId));
  await requireEvent(pool, projectId, eventId);
  const { rowCount } = isUuid(paymentId)
    ? await pool.query("DELETE FROM event_payments WHERE id = $1 AND event_id = $2", [paymentId, eventId])
    : { rowCount: 0 };
  if (!rowCount) throw new ServiceError("not_found", "Payment not found");
}

function validate(input: PaymentInput): { date: string; amount: number; note: string | null } {
  const { date, amount } = input;
  if (!isDay(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
    throw new ServiceError("invalid_input", "A Payment's date must be a real YYYY-MM-DD day");
  }
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new ServiceError("invalid_input", "A Payment's amount must be a positive whole amount of Guaraníes");
  }
  if (input.note != null && typeof input.note !== "string") {
    throw new ServiceError("invalid_input", "A Payment's note must be text");
  }
  return { date, amount, note: input.note?.trim() || null };
}

// You can't edit what you can't see.
function requireEditAndSee(permissions: Permissions) {
  requireEdit(permissions);
  if (!permissions.seeTotalPayExpenses) {
    throw new ServiceError("forbidden", "You can't edit the Payments of an Event you can't see them of");
  }
}
