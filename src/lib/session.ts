import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getPool } from "@/db/pool.ts";
import { getSessionUser, type User } from "@/services/accounts.ts";
import { safeReturnPath } from "./return-path.ts";
import {
  RETURN_PATH_HEADER,
  SESSION_COOKIE,
  sessionCookieOptions,
  signInPath,
} from "./session-cookie.ts";

// The signed-in User for this request, or null. Resolved once per request.
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? getSessionUser(getPool(), token) : null;
});

// The signed-in User; anyone else is sent to sign-in and returned here after.
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (user) return user;
  redirect(signInPath(safeReturnPath((await headers()).get(RETURN_PATH_HEADER))));
}

// For Server Actions only: cookies can't be set while rendering.
export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);
}

// Clears the cookie and returns the token it held, if any.
export async function clearSessionCookie(): Promise<string | undefined> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  store.delete(SESSION_COOKIE);
  return token;
}
