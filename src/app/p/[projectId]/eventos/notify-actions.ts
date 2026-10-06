"use server";

import { getPool } from "@/db/pool.ts";
import { getMailer } from "@/email/app-mailer.ts";
import { requireUser } from "@/lib/session.ts";
import { ServiceError } from "@/services/errors.ts";
import { notifyAttendance } from "@/services/event-notifications.ts";

// Emails the Members in the Event's Asistencia; reports how many were reached.
export async function notifyEventAttendance(
  projectId: string,
  eventId: string,
): Promise<{ error?: string; sent?: number }> {
  const user = await requireUser();
  try {
    return await notifyAttendance(getPool(), getMailer(), user, projectId, eventId);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "forbidden") return { error: "Tu rol no puede avisar a la banda." };
    if (err instanceof ServiceError && err.code === "not_found") return { error: "Este evento ya no existe." };
    throw err;
  }
}
