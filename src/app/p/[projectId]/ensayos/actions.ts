"use server";

import { refresh } from "next/cache";
import { getPool } from "@/db/pool.ts";
import { getMailer } from "@/email/app-mailer.ts";
import { errorMessage } from "@/lib/error-message.ts";
import { text } from "@/lib/form.ts";
import { requireUser } from "@/lib/session.ts";
import { ServiceError } from "@/services/errors.ts";
import {
  createRehearsal,
  deleteRehearsal,
  updateRehearsal,
  type RehearsalInput,
} from "@/services/rehearsals.ts";

export interface RehearsalFormState {
  error?: string;
  // Bumped on every successful save, so the dialog knows to close.
  saved: number;
}

export interface RehearsalActionState {
  error?: string;
  // Bumped on every success, so the caller knows to move on.
  done: number;
}

const FORBIDDEN = "Tu rol no puede editar ensayos.";
const GONE = "Este ensayo ya no existe.";

// Adds an Ensayo, or edits one when the form carries its id. Only a new one
// can notify the Miembros.
export async function saveRehearsal(
  prev: RehearsalFormState,
  form: FormData,
): Promise<RehearsalFormState> {
  const user = await requireUser();
  const projectId = text(form, "projectId");
  const rehearsalId = text(form, "rehearsalId");
  const input: RehearsalInput = {
    date: text(form, "date"),
    startTime: text(form, "startTime"),
    endTime: text(form, "endTime"),
    location: text(form, "location"),
    notes: text(form, "notes"),
  };
  try {
    if (rehearsalId) await updateRehearsal(getPool(), user, projectId, rehearsalId, input);
    else {
      await createRehearsal(getPool(), getMailer(), user, projectId, input, {
        notify: form.get("notify") === "on",
      });
    }
  } catch (err) {
    const error = errorMessage(err, {
      invalid_input: "Revisá la fecha y las horas: el ensayo debe terminar después de empezar.",
      forbidden: FORBIDDEN,
      not_found: GONE,
    });
    return { ...prev, error };
  }
  refresh();
  return { saved: prev.saved + 1 };
}

export async function removeRehearsal(
  prev: RehearsalActionState,
  form: FormData,
): Promise<RehearsalActionState> {
  const user = await requireUser();
  try {
    await deleteRehearsal(getPool(), user, text(form, "projectId"), text(form, "rehearsalId"));
  } catch (err) {
    // Already gone is what was asked for.
    if (!(err instanceof ServiceError && err.code === "not_found")) {
      return { ...prev, error: errorMessage(err, { forbidden: FORBIDDEN }) };
    }
  }
  refresh();
  return { done: prev.done + 1 };
}
