"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getPool } from "@/db/pool.ts";
import { text, whole } from "@/lib/form.ts";
import { requireUser } from "@/lib/session.ts";
import { ServiceError } from "@/services/errors.ts";
import {
  createEvent,
  deleteEvent,
  updateEvent,
  type EventInput,
  type EventPatch,
  type EventStatus,
} from "@/services/events.ts";

export interface EventFormState {
  error?: string;
  // Bumped on every successful save, so the dialog knows to close.
  saved: number;
}

type ErrorMessages = Partial<Record<ServiceError["code"], string>>;

const FORBIDDEN = "Tu rol no puede editar eventos.";
const GONE = "Este evento ya no existe.";

// The message for a failed call, or a rethrow when it isn't expected.
function errorMessage(err: unknown, messages: ErrorMessages): string {
  const error = err instanceof ServiceError && messages[err.code];
  if (error) return error;
  throw err;
}

// Adds an Evento and opens it, or edits one when the form carries its id.
// `setlistId` is a template's id; on an edit, `keep` leaves the copy as is and
// `none` removes it.
export async function saveEvent(prev: EventFormState, form: FormData): Promise<EventFormState> {
  const user = await requireUser();
  const projectId = text(form, "projectId");
  const eventId = text(form, "eventId");
  const hours = whole(text(form, "hours"));
  const minutes = whole(text(form, "minutes"));
  const setlist = text(form, "setlistId");
  const input: EventInput = {
    name: text(form, "name"),
    date: text(form, "date"),
    startTime: text(form, "startTime") || null,
    location: text(form, "location"),
    durationMinutes: hours * 60 + minutes,
    status: text(form, "status") as EventStatus,
    isPublic: form.get("isPublic") === "on",
  };
  // The field is only there for those who may set the pay.
  if (form.has("pay")) input.pay = whole(text(form, "pay"));
  if (setlist === "none") input.setlistId = null;
  else if (setlist && setlist !== "keep") input.setlistId = setlist;

  let id = eventId;
  try {
    if (eventId) await updateEvent(getPool(), user, projectId, eventId, input as EventPatch);
    else ({ id } = await createEvent(getPool(), user, projectId, input));
  } catch (err) {
    const error = errorMessage(err, {
      invalid_input:
        "Revisá el nombre, la fecha, la duración y el cachet (en guaraníes enteros), y que la setlist siga existiendo.",
      forbidden: FORBIDDEN,
      not_found: GONE,
    });
    return { ...prev, error };
  }
  if (!eventId) redirect(`/p/${projectId}/eventos/${id}`);
  refresh();
  return { saved: prev.saved + 1 };
}

export interface EventActionState {
  error?: string;
  // Bumped on every success, so the caller knows to move on.
  done: number;
}

// Moves an Evento to another status.
export async function setEventStatus(
  projectId: string,
  eventId: string,
  status: EventStatus,
): Promise<{ error?: string }> {
  const user = await requireUser();
  try {
    await updateEvent(getPool(), user, projectId, eventId, { status });
  } catch (err) {
    return { error: errorMessage(err, { forbidden: FORBIDDEN, not_found: GONE }) };
  }
  refresh();
  return {};
}

export async function removeEvent(
  prev: EventActionState,
  form: FormData,
): Promise<EventActionState> {
  const user = await requireUser();
  try {
    await deleteEvent(getPool(), user, text(form, "projectId"), text(form, "eventId"));
  } catch (err) {
    // Already gone is what was asked for.
    if (!(err instanceof ServiceError && err.code === "not_found")) {
      return {
        ...prev,
        error: errorMessage(err, {
          forbidden: "Tu rol no puede eliminar este evento. Solo un Admin elimina uno pagado.",
        }),
      };
    }
  }
  refresh();
  return { done: prev.done + 1 };
}
