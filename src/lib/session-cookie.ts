// The web session cookie, shared by the proxy (which can't reach the
// database) and the server code that resolves it.
export const SESSION_COOKIE = "session";

// Matches the server-side session lifetime; each request pushes both back.
const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;

export const sessionCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: SESSION_MAX_AGE_S,
} as const;

// Request header through which the proxy tells server code which page was
// asked for, so a signed-out visitor can be sent back to it after sign-in.
export const RETURN_PATH_HEADER = "x-return-path";

// Where signed-out visitors go, carrying the page to return to.
export function signInPath(returnPath?: string | null): string {
  return returnPath ? `/ingresar?volver=${encodeURIComponent(returnPath)}` : "/ingresar";
}
