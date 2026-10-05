import type { Pool } from "pg";
import type { User } from "./accounts.ts";
import { ServiceError } from "./errors.ts";
import { isUuid } from "./ids.ts";
import { requireEdit, requireEvent } from "./events.ts";
import { inTransaction } from "./transaction.ts";
import { syncSnapshot } from "./payout-snapshots.ts";
import { getPermissions, type Permissions } from "./permissions.ts";

export const EXPENSE_CATEGORIES = ["transport", "sound", "rentals", "food", "other"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

// A cost tied to one Event.
export interface Expense {
  id: string;
  name: string;
  // Whole Guaraníes.
  amount: number;
  category: ExpenseCategory;
}

export interface ExpenseInput {
  name: string;
  amount: number;
  // Defaults to "other".
  category?: ExpenseCategory;
  // A Member of the Project; defaults to the band's cash.
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
    `SELECT x.id, x.name, x.amount::float8 AS amount, x.category
     FROM event_expenses x
     WHERE x.event_id = $1 ORDER BY x.created_at, x.id`,
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
  const category = input.category ?? "other";
  if (!EXPENSE_CATEGORIES.includes(category)) {
    throw new ServiceError("invalid_input", "Unknown kind of Expense");
  }
  await requireEvent(pool, projectId, eventId);
  return inTransaction(pool, async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO event_expenses (event_id, name, amount, category)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [eventId, name, amount, category],
    );
    await syncSnapshot(client, projectId, eventId);
    return { id: rows[0].id, name, amount, category };
  });
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
  await inTransaction(pool, async (client) => {
    const { rowCount } = isUuid(expenseId)
      ? await client.query("DELETE FROM event_expenses WHERE id = $1 AND event_id = $2", [expenseId, eventId])
      : { rowCount: 0 };
    if (!rowCount) throw new ServiceError("not_found", "Expense not found");
    await syncSnapshot(client, projectId, eventId);
  });
}

// You can't edit what you can't see.
function requireEditAndSee(permissions: Permissions) {
  requireEdit(permissions);
  if (!permissions.seeTotalPayExpenses) {
    throw new ServiceError("forbidden", "You can't edit the Expenses of an Event you can't see them of");
  }
}
