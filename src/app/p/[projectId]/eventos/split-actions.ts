"use server";

import { refresh } from "next/cache";
import { getPool } from "@/db/pool.ts";
import { text } from "@/lib/form.ts";
import { readMemberRule, readOverride, readSignedAmount } from "@/lib/member-rule-form.ts";
import { requireUser } from "@/lib/session.ts";
import { ServiceError } from "@/services/errors.ts";
import {
  setEventMemberSetting,
  setMemberRule,
} from "@/services/splits.ts";

export interface SplitActionState {
  error?: string;
  // Bumped on every success, so the form knows it saved.
  done: number;
}

const MESSAGES: Partial<Record<ServiceError["code"], string>> = {
  forbidden: "Solo los admins editan el reparto.",
  not_found: "Este evento o este rol ya no existe.",
  invalid_input: "Revisá los montos: deben ser guaraníes enteros.",
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

export async function saveMemberRule(prev: SplitActionState, form: FormData): Promise<SplitActionState> {
  const user = await requireUser();
  const rule = readMemberRule(text(form, "kind"), text(form, "value"));
  const error = await errorOf(() =>
    setMemberRule(getPool(), user, text(form, "projectId"), text(form, "userId"), rule),
  );
  return error ? { ...prev, error } : { done: prev.done + 1 };
}

export async function saveEventMemberSetting(prev: SplitActionState, form: FormData): Promise<SplitActionState> {
  const user = await requireUser();
  const override = readOverride(text(form, "mode"), text(form, "value"));
  const ajuste = readSignedAmount(text(form, "ajuste"));
  const error = await errorOf(() =>
    setEventMemberSetting(getPool(), user, text(form, "projectId"), text(form, "eventId"), text(form, "userId"), {
      override,
      ajuste,
    }),
  );
  return error ? { ...prev, error } : { done: prev.done + 1 };
}
