"use server";

import { refresh } from "next/cache";
import { getPool } from "@/db/pool.ts";
import { text, whole } from "@/lib/form.ts";
import { requireUser } from "@/lib/session.ts";
import { ServiceError } from "@/services/errors.ts";
import { addExpense, removeExpense, type ExpenseCategory } from "@/services/expenses.ts";

export interface ExpenseActionState {
  error?: string;
  // Bumped on every success, so the form knows to clear.
  done: number;
}

const MESSAGES: Partial<Record<ServiceError["code"], string>> = {
  forbidden: "Tu rol no puede editar los gastos de este evento.",
  not_found: "Este evento o este gasto ya no existe.",
  invalid_input: "Revisá el nombre, el monto (en guaraníes enteros) y quién lo pagó.",
};

// The message for a failed call, or a rethrow when it isn't expected.
async function errorOf(act: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await act();
  } catch (err) {
    const message = err instanceof ServiceError && MESSAGES[err.code];
    if (message) return message;
    throw err;
  }
  refresh();
}

export async function addEventExpense(
  prev: ExpenseActionState,
  form: FormData,
): Promise<ExpenseActionState> {
  const user = await requireUser();
  const error = await errorOf(() =>
    addExpense(getPool(), user, text(form, "projectId"), text(form, "eventId"), {
      name: text(form, "name"),
      amount: whole(text(form, "amount")),
      category: text(form, "category") as ExpenseCategory,
      // Empty means the band's cash paid.
    }),
  );
  return error ? { ...prev, error } : { done: prev.done + 1 };
}

export async function removeEventExpense(
  projectId: string,
  eventId: string,
  expenseId: string,
): Promise<{ error?: string }> {
  const user = await requireUser();
  return { error: await errorOf(() => removeExpense(getPool(), user, projectId, eventId, expenseId)) };
}
