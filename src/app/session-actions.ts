"use server";

import { redirect } from "next/navigation";
import { getPool } from "@/db/pool.ts";
import { getMailer } from "@/email/app-mailer.ts";
import { logIn, logOut, MIN_PASSWORD_LENGTH, signUp } from "@/services/accounts.ts";
import { ServiceError } from "@/services/errors.ts";
import { safeReturnPath } from "@/lib/return-path.ts";
import { clearSessionCookie, setSessionCookie } from "@/lib/session.ts";
import { signInPath } from "@/lib/session-cookie.ts";

export interface SignInState {
  email: string;
  error?: string;
}

// Never says which of the two was wrong.
const WRONG_CREDENTIALS = "El correo o la contraseña no son correctos.";

export async function signIn(_prev: SignInState, form: FormData): Promise<SignInState> {
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  let sessionToken: string;
  try {
    ({ sessionToken } = await logIn(getPool(), { email, password }));
  } catch (err) {
    if (err instanceof ServiceError && err.code === "invalid_credentials") {
      return { email, error: WRONG_CREDENTIALS };
    }
    throw err;
  }
  await setSessionCookie(sessionToken);
  // The home page sends the User on to their first Banda.
  redirect(safeReturnPath(String(form.get("volver") ?? "")) ?? "/");
}

export interface SignUpState {
  displayName: string;
  email: string;
  error?: string;
}

// Creates the account, signs the new User in and lands them in the app,
// where a banner asks them to verify their email.
export async function createAccount(_prev: SignUpState, form: FormData): Promise<SignUpState> {
  const displayName = String(form.get("displayName") ?? "");
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const failed = (error: string) => ({ displayName, email, error });
  if (password.length < MIN_PASSWORD_LENGTH) {
    return failed(`La contraseña necesita al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  let sessionToken: string;
  try {
    ({ sessionToken } = await signUp(getPool(), getMailer(), { email, password, displayName }));
  } catch (err) {
    if (err instanceof ServiceError && err.code === "email_taken") {
      return failed("Ya hay una cuenta con este correo. Ingresá con ella.");
    }
    if (err instanceof ServiceError && err.code === "invalid_input") {
      return failed("Revisá tu nombre y tu correo.");
    }
    throw err;
  }
  await setSessionCookie(sessionToken);
  redirect(safeReturnPath(String(form.get("volver") ?? "")) ?? "/");
}

export async function signOut(): Promise<void> {
  const token = await clearSessionCookie();
  if (token) await logOut(getPool(), token);
  redirect(signInPath());
}
