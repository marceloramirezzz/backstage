"use server";

import { redirect } from "next/navigation";
import { getPool } from "@/db/pool.ts";
import { getMailer } from "@/email/app-mailer.ts";
import { logOut, MIN_PASSWORD_LENGTH, requestPasswordReset, resetPassword } from "@/services/accounts.ts";
import { ServiceError } from "@/services/errors.ts";
import { clearSessionCookie, setSessionCookie } from "@/lib/session.ts";

export interface RequestResetState {
  sent: boolean;
}

// Asks for a reset link by email, from a page anyone can open. Never says
// whether the email has an account.
export async function requestReset(
  _prev: RequestResetState,
  form: FormData,
): Promise<RequestResetState> {
  // A failed send would otherwise show an error page only for real accounts.
  await requestPasswordReset(getPool(), getMailer(), String(form.get("email") ?? "")).catch((err) =>
    console.error("Couldn't send a password reset email", err),
  );
  return { sent: true };
}

export interface ResetPasswordState {
  invalid: boolean;
  error?: string;
}

// Follows the emailed link: sets the new password and signs the User in,
// replacing whoever was signed in on this browser.
export async function setNewPassword(
  _prev: ResetPasswordState,
  form: FormData,
): Promise<ResetPasswordState> {
  const password = String(form.get("password") ?? "");
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { invalid: false, error: `La contraseña necesita al menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  }
  let sessionToken: string;
  try {
    ({ sessionToken } = await resetPassword(getPool(), String(form.get("token") ?? ""), password));
  } catch (err) {
    if (err instanceof ServiceError && err.code === "invalid_token") return { invalid: true };
    throw err;
  }
  const previous = await clearSessionCookie();
  if (previous) await logOut(getPool(), previous);
  await setSessionCookie(sessionToken);
  redirect("/");
}
