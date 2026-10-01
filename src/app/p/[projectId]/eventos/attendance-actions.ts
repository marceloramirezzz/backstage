"use server";

import { refresh } from "next/cache";
import { getPool } from "@/db/pool.ts";
import { text, whole } from "@/lib/form.ts";
import { requireUser } from "@/lib/session.ts";
import { addGuest, removeGuest, setAttending } from "@/services/attendance.ts";
import { ServiceError } from "@/services/errors.ts";

export interface AttendanceActionState {
  error?: string;
  // Bumped on every success, so the form knows to clear.
  done: number;
}

const MESSAGES: Partial<Record<ServiceError["code"], string>> = {
  forbidden: "Tu rol no puede editar la asistencia de este evento.",
  not_found: "Este evento o esta persona ya no existe.",
  invalid_input: "Revisá el nombre y el monto (en guaraníes enteros).",
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

export async function setMemberAttending(
  projectId: string,
  eventId: string,
  userId: string,
  attending: boolean,
): Promise<{ error?: string }> {
  const user = await requireUser();
  return { error: await errorOf(() => setAttending(getPool(), user, projectId, eventId, userId, attending)) };
}

export async function addEventGuest(
  prev: AttendanceActionState,
  form: FormData,
): Promise<AttendanceActionState> {
  const user = await requireUser();
  // The field is only there for those who may set the amount; blank means none.
  const amountText = text(form, "amount");
  const amount = !form.has("amount") ? undefined : amountText.trim() === "" ? 0 : whole(amountText);
  const error = await errorOf(() =>
    addGuest(getPool(), user, text(form, "projectId"), text(form, "eventId"), { name: text(form, "name"), amount }),
  );
  return error ? { ...prev, error } : { done: prev.done + 1 };
}

export async function removeEventGuest(
  projectId: string,
  eventId: string,
  guestId: string,
): Promise<{ error?: string }> {
  const user = await requireUser();
  return { error: await errorOf(() => removeGuest(getPool(), user, projectId, eventId, guestId)) };
}
