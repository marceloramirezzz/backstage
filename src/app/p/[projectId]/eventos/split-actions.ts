"use server";

import { refresh } from "next/cache";
import { getPool } from "@/db/pool.ts";
import { text } from "@/lib/form.ts";
import { readSplitRules } from "@/lib/split-form.ts";
import { requireUser } from "@/lib/session.ts";
import { ServiceError } from "@/services/errors.ts";
import {
  clearEventSplit,
  setDefaultSplit,
  setEventSplit,
} from "@/services/splits.ts";

export interface SplitActionState {
  error?: string;
  // Bumped on every success, so the form knows it saved.
  done: number;
}

const MESSAGES: Partial<Record<ServiceError["code"], string>> = {
  forbidden: "Solo los admins editan el reparto.",
  not_found: "Este evento o este rol ya no existe.",
  invalid_input: "Revisá los montos: los porcentajes deben sumar 100 % y los fijos ser guaraníes enteros.",
};

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

const roleIdsOf = (form: FormData) => text(form, "roleIds").split(",").filter(Boolean);

export async function saveDefaultSplit(
  prev: SplitActionState,
  form: FormData,
): Promise<SplitActionState> {
  const user = await requireUser();
  const projectId = text(form, "projectId");
  const error = await errorOf(() => setDefaultSplit(getPool(), user, projectId, readSplitRules(form, roleIdsOf(form))));
  return error ? { ...prev, error } : { done: prev.done + 1 };
}

export async function saveEventSplit(
  prev: SplitActionState,
  form: FormData,
): Promise<SplitActionState> {
  const user = await requireUser();
  const error = await errorOf(() =>
    setEventSplit(
      getPool(),
      user,
      text(form, "projectId"),
      text(form, "eventId"),
      readSplitRules(form, roleIdsOf(form)),
    ),
  );
  return error ? { ...prev, error } : { done: prev.done + 1 };
}

export async function resetEventSplit(projectId: string, eventId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  return { error: await errorOf(() => clearEventSplit(getPool(), user, projectId, eventId)) };
}

