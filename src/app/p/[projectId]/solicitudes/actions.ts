"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getPool } from "@/db/pool.ts";
import { BOOKING_STATUSES, type BookingStatus } from "@/lib/booking.ts";
import { text } from "@/lib/form.ts";
import { requireUser } from "@/lib/session.ts";
import { addBookingNote, deleteBookingRequest, setBookingStatus } from "@/services/booking-requests.ts";
import { ServiceError } from "@/services/errors.ts";

export interface NoteActionState {
  error?: string;
  // Bumped on every success, so the form knows to clear.
  done: number;
}

const MESSAGES: Partial<Record<ServiceError["code"], string>> = {
  forbidden: "Tu rol no puede trabajar las solicitudes.",
  not_found: "Esta solicitud ya no existe.",
  invalid_input: "Revisá los datos: la nota no puede estar vacía ni superar los 4000 caracteres.",
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

export async function changeRequestStatus(
  projectId: string,
  requestId: string,
  status: BookingStatus,
): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!BOOKING_STATUSES.includes(status)) return { error: "El estado no es válido." };
  return { error: await errorOf(() => setBookingStatus(getPool(), user, projectId, requestId, status)) };
}

export async function addRequestNote(prev: NoteActionState, form: FormData): Promise<NoteActionState> {
  const user = await requireUser();
  const error = await errorOf(() =>
    addBookingNote(getPool(), user, text(form, "projectId"), text(form, "requestId"), text(form, "body")),
  );
  return error ? { ...prev, error } : { done: prev.done + 1 };
}

export async function deleteRequest(projectId: string, requestId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  try {
    await deleteBookingRequest(getPool(), user, projectId, requestId);
  } catch (err) {
    // Already gone: the list is where they wanted to end up.
    if (!(err instanceof ServiceError && err.code === "not_found")) {
      const message = err instanceof ServiceError && MESSAGES[err.code];
      if (message) return { error: message };
      throw err;
    }
  }
  redirect(`/p/${projectId}/solicitudes`);
}
