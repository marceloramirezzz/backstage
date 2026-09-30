"use server";

import { redirect } from "next/navigation";
import { getPool } from "@/db/pool.ts";
import { logIn, logOut } from "@/services/accounts.ts";
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

export async function signOut(): Promise<void> {
  const token = await clearSessionCookie();
  if (token) await logOut(getPool(), token);
  redirect(signInPath());
}
