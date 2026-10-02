import { decodeIdToken, Google } from "arctic";
import type { GoogleProfile } from "@/services/accounts.ts";

export const GOOGLE_START_PATH = "/ingresar/google";
export const GOOGLE_CALLBACK_PATH = `${GOOGLE_START_PATH}/callback`;

// The cookies that carry the flow's state, PKCE verifier and return path from
// the redirect to Google back to the callback.
export const GOOGLE_STATE_COOKIE = "google_oauth_state";
export const GOOGLE_VERIFIER_COOKIE = "google_oauth_verifier";
export const GOOGLE_RETURN_COOKIE = "google_oauth_return";

// Long enough to finish Google's consent screen, short enough to expire unused.
export const GOOGLE_FLOW_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: GOOGLE_START_PATH,
  maxAge: 10 * 60,
} as const;

// Created per request: the redirect URI depends on the origin the visitor used.
export function googleClient(origin: string): Google {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set (run scripts/setup-google.sh)");
  }
  return new Google(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, origin + GOOGLE_CALLBACK_PATH);
}

// Swaps the authorization code for the person's profile. The ID token comes
// straight from Google's token endpoint over TLS, so its claims can be trusted
// without checking a signature.
export function exchangeGoogleCode(google: Google) {
  return async (code: string, verifier: string): Promise<GoogleProfile> => {
    const tokens = await google.validateAuthorizationCode(code, verifier);
    const claims = decodeIdToken(tokens.idToken()) as Record<string, unknown>;
    if (typeof claims.sub !== "string" || typeof claims.email !== "string") {
      throw new Error("Google's ID token has no sub or email");
    }
    return {
      googleId: claims.sub,
      email: claims.email,
      emailVerified: claims.email_verified === true || claims.email_verified === "true",
      name: typeof claims.name === "string" ? claims.name : "",
    };
  };
}
