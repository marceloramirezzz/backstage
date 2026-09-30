"use server";

import { redirect } from "next/navigation";
import { getPool } from "@/db/pool.ts";
import { getMailer } from "@/email/app-mailer.ts";
import { logOut, requestVerificationEmail, verifyEmail } from "@/services/accounts.ts";
import { ServiceError } from "@/services/errors.ts";
import { clearSessionCookie, getCurrentUser, setSessionCookie } from "@/lib/session.ts";

export interface ConfirmEmailState {
  invalid: boolean;
}

// Follows the emailed link: verifies the User and signs them in, replacing
// whoever was signed in on this browser.
export async function confirmEmail(
  _prev: ConfirmEmailState,
  form: FormData,
): Promise<ConfirmEmailState> {
  let sessionToken: string;
  try {
    ({ sessionToken } = await verifyEmail(getPool(), String(form.get("token") ?? "")));
  } catch (err) {
    if (err instanceof ServiceError && err.code === "invalid_token") return { invalid: true };
    throw err;
  }
  const previous = await clearSessionCookie();
  if (previous) await logOut(getPool(), previous);
  await setSessionCookie(sessionToken);
  redirect("/");
}

export interface RequestLinkState {
  sent: boolean;
}

// Asks for a new link by email, from a page anyone can open. Never says
// whether the email has an account.
export async function requestVerificationLink(
  _prev: RequestLinkState,
  form: FormData,
): Promise<RequestLinkState> {
  // A failed send would otherwise show an error page only for real,
  // unverified accounts.
  await requestVerificationEmail(getPool(), getMailer(), String(form.get("email") ?? "")).catch(
    (err) => console.error("Couldn't send a requested verification email", err),
  );
  return { sent: true };
}

// Asks for a new link for the signed-in User, from the verify-email banner.
export async function resendMyVerificationLink(): Promise<RequestLinkState> {
  const user = await getCurrentUser();
  if (user) await requestVerificationEmail(getPool(), getMailer(), user.email);
  return { sent: true };
}
