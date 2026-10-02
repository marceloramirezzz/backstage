"use server";

import { revalidatePath } from "next/cache";
import { getPool } from "@/db/pool.ts";
import { text } from "@/lib/form.ts";
import { requireUser } from "@/lib/session.ts";
import {
  addPassword,
  MIN_PASSWORD_LENGTH,
  setDisplayName,
  setTheme,
  THEMES,
  type Theme,
} from "@/services/accounts.ts";
import { ServiceError } from "@/services/errors.ts";

export interface SettingsState {
  // The value last submitted, so a failed save doesn't clear the field.
  value: string;
  saved: boolean;
  error?: string;
}

export async function saveDisplayName(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const user = await requireUser();
  const value = text(form, "displayName");
  try {
    await setDisplayName(getPool(), user, value);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "invalid_input") {
      return { value, saved: false, error: "Escribí tu nombre." };
    }
    throw err;
  }
  revalidatePath("/", "layout");
  return { value: value.trim(), saved: true };
}

export async function saveTheme(theme: Theme): Promise<void> {
  const user = await requireUser();
  // Called from the client with whatever it sends.
  if (!THEMES.includes(theme)) return;
  await setTheme(getPool(), user, theme);
  revalidatePath("/", "layout");
}

export async function savePassword(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const user = await requireUser();
  const password = text(form, "password");
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { value: "", saved: false, error: `La contraseña necesita al menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  }
  try {
    await addPassword(getPool(), user, { password });
  } catch (err) {
    if (err instanceof ServiceError && err.code === "password_already_set") {
      revalidatePath("/ajustes");
      return { value: "", saved: false, error: "Esta cuenta ya tiene una contraseña." };
    }
    throw err;
  }
  revalidatePath("/ajustes");
  return { value: "", saved: true };
}
