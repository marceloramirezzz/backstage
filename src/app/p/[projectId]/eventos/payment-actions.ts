"use server";

import { refresh } from "next/cache";
import { getPool } from "@/db/pool.ts";
import { text, whole } from "@/lib/form.ts";
import { requireUser } from "@/lib/session.ts";
import { ServiceError } from "@/services/errors.ts";
import { addPayment, removePayment, updatePayment } from "@/services/payments.ts";

export interface PaymentActionState {
  error?: string;
  // Bumped on every success, so the form knows to clear.
  done: number;
}

const MESSAGES: Partial<Record<ServiceError["code"], string>> = {
  forbidden: "Tu rol no puede editar los pagos recibidos de este evento.",
  not_found: "Este evento o este pago recibido ya no existe.",
  invalid_input: "Revisá la fecha y el monto (en guaraníes enteros, mayor a cero).",
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

const inputOf = (form: FormData) => ({
  date: text(form, "date"),
  amount: whole(text(form, "amount")),
  note: text(form, "note"),
});

export async function addEventPayment(
  prev: PaymentActionState,
  form: FormData,
): Promise<PaymentActionState> {
  const user = await requireUser();
  const error = await errorOf(() =>
    addPayment(getPool(), user, text(form, "projectId"), text(form, "eventId"), inputOf(form)),
  );
  return error ? { ...prev, error } : { done: prev.done + 1 };
}

export async function updateEventPayment(
  prev: PaymentActionState,
  form: FormData,
): Promise<PaymentActionState> {
  const user = await requireUser();
  const error = await errorOf(() =>
    updatePayment(getPool(), user, text(form, "projectId"), text(form, "eventId"), text(form, "paymentId"), inputOf(form)),
  );
  return error ? { ...prev, error } : { done: prev.done + 1 };
}

export async function removeEventPayment(
  projectId: string,
  eventId: string,
  paymentId: string,
): Promise<{ error?: string }> {
  const user = await requireUser();
  return { error: await errorOf(() => removePayment(getPool(), user, projectId, eventId, paymentId)) };
}
