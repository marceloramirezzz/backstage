import type { Pool } from "pg";
import { signInWithGoogle, type GoogleProfile, type User } from "./accounts.ts";
import { ServiceError } from "./errors.ts";

export type GoogleFailure = "cancelled" | "failed" | "unverified" | "taken";

export type GoogleSignInResult =
  | { ok: true; user: User; sessionToken: string }
  | { ok: false; reason: GoogleFailure };

// What Google appended to the callback URL.
export interface GoogleCallbackParams {
  code?: string;
  state?: string;
  error?: string;
}

// What the start of the flow saved in the visitor's browser.
export interface SavedGoogleFlow {
  state: string;
  verifier: string;
}

// Finishes a Google flow: checks the callback against what the visitor's
// browser saved, swaps the code for a verified profile (`exchange`, the only
// part that talks to Google) and signs that profile in. Expected failures come
// back as a reason rather than throwing.
export async function finishGoogleSignIn(
  pool: Pool,
  params: GoogleCallbackParams,
  saved: SavedGoogleFlow | null,
  exchange: (code: string, verifier: string) => Promise<GoogleProfile>,
): Promise<GoogleSignInResult> {
  if (params.error) {
    return { ok: false, reason: params.error === "access_denied" ? "cancelled" : "failed" };
  }
  if (!saved || !params.code || params.state !== saved.state) {
    return { ok: false, reason: "failed" };
  }
  let profile: GoogleProfile;
  try {
    profile = await exchange(params.code, saved.verifier);
  } catch {
    return { ok: false, reason: "failed" };
  }
  try {
    const { user, sessionToken } = await signInWithGoogle(pool, profile);
    return { ok: true, user, sessionToken };
  } catch (err) {
    if (err instanceof ServiceError && err.code === "email_not_verified") {
      return { ok: false, reason: "unverified" };
    }
    if (err instanceof ServiceError && err.code === "email_taken") {
      return { ok: false, reason: "taken" };
    }
    throw err;
  }
}
