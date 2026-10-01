import type { Pool } from "pg";
import type { User } from "./accounts.ts";
import { ServiceError } from "./errors.ts";
import { isUuid } from "./ids.ts";
import { requireEdit, requireEvent } from "./events.ts";
import { getPermissions, type Permissions } from "./permissions.ts";

// A cost tied to one Event.
export interface Expense {
  id: string;
  name: string;
  // Whole Guaraníes.
  amount: number;
}

export interface ExpenseInput {
  name: string;
  amount: number;
}

export interface ExpenseSummary {
  pay: number;
  expenses: Expense[];
  total: number;
  // The Event's pay minus `total`; negative when Expenses exceed it.
  netPay: number;
}

// The Event's Expenses and net pay, or null for those who can't see totals:
// they never receive pay or Expenses.
export async function getExpenses(
  pool: Pool,
  user: User,
  projectId: string,
  eventId: string,
): Promise<ExpenseSummary | null> {
  const permissions = await getPermissions(pool, user, projectId);
  await requireEvent(pool, projectId, eventId);
  if (!permissions.seeTotalPayExpenses) return null;
  const { rows: expenses } = await pool.query<Expense>(
    `SELECT id, name, amount::float8 AS amount
     FROM event_expenses WHERE event_id = $1 ORDER BY created_at, id`,
    [eventId],
  );
  const { rows } = await pool.query<{ pay: number }>(
    "SELECT pay::float8 AS pay FROM events WHERE id = $1",
    [eventId],
  );
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);
  return { pay: rows[0].pay, expenses, total, netPay: rows[0].pay - total };
}

export async function addExpense(
  pool: Pool,
  user: User,
  projectId: string,
  eventId: string,
  input: ExpenseInput,
): Promise<Expense> {
  requireEditAndSee(await getPermissions(pool, user, projectId));
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) throw new ServiceError("invalid_input", "An Expense's name is required");
  const { amount } = input;
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new ServiceError("invalid_input", "An Expense's amount must be a whole amount of Guaraníes");
  }
  await requireEvent(pool, projectId, eventId);
  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO event_expenses (event_id, name, amount) VALUES ($1, $2, $3) RETURNING id",
    [eventId, name, amount],
  );
  return { id: rows[0].id, name, amount };
}

export async function removeExpense(
  pool: Pool,
  user: User,
  projectId: string,
  eventId: string,
  expenseId: string,
): Promise<void> {
  requireEditAndSee(await getPermissions(pool, user, projectId));
  await requireEvent(pool, projectId, eventId);
  const { rowCount } = isUuid(expenseId)
    ? await pool.query("DELETE FROM event_expenses WHERE id = $1 AND event_id = $2", [expenseId, eventId])
    : { rowCount: 0 };
  if (!rowCount) throw new ServiceError("not_found", "Expense not found");
}

// You can't edit what you can't see.
function requireEditAndSee(permissions: Permissions) {
  requireEdit(permissions);
  if (!permissions.seeTotalPayExpenses) {
    throw new ServiceError("forbidden", "You can't edit the Expenses of an Event you can't see them of");
  }
}
