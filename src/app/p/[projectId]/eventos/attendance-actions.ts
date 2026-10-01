"use server";

import { refresh } from "next/cache";
import { getPool } from "@/db/pool.ts";
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
async function run(act: () => Promise<unknown>): Promise<string | undefined> {
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
  return { error: await run(() => setAttending(getPool(), user, projectId, eventId, userId, attending)) };
}

export async function addEventGuest(
  prev: AttendanceActionState,
  form: FormData,
): Promise<AttendanceActionState> {
  const user = await requireUser();
  const field = (name: string) => String(form.get(name) ?? "");
  const amount = form.has("amount") ? (field("amount").trim() === "" ? 0 : Number(field("amount"))) : undefined;
  const error = await run(() =>
    addGuest(getPool(), user, field("projectId"), field("eventId"), { name: field("name"), amount }),
  );
  return error ? { ...prev, error } : { done: prev.done + 1 };
}

export async function removeEventGuest(
  projectId: string,
  eventId: string,
  guestId: string,
): Promise<{ error?: string }> {
  const user = await requireUser();
  return { error: await run(() => removeGuest(getPool(), user, projectId, eventId, guestId)) };
}
