import { NextResponse, type NextRequest } from "next/server";
import { getPool } from "@/db/pool.ts";
import {
  exchangeGoogleCode,
  GOOGLE_RETURN_COOKIE,
  GOOGLE_STATE_COOKIE,
  GOOGLE_VERIFIER_COOKIE,
  googleClient,
} from "@/lib/google-client.ts";
import { googleFailurePath } from "@/lib/google-errors.ts";
import { requestOrigin } from "@/lib/origin.ts";
import { safeReturnPath } from "@/lib/return-path.ts";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/session-cookie.ts";
import { finishGoogleSignIn, type GoogleSignInResult } from "@/services/google-sign-in.ts";

// Where Google sends the visitor back. Signs them in like password sign-in
// does, or returns them to sign-in with the reason it failed.
export async function GET(request: NextRequest) {
  const origin = await requestOrigin();
  const query = request.nextUrl.searchParams;
  const state = request.cookies.get(GOOGLE_STATE_COOKIE)?.value;
  const verifier = request.cookies.get(GOOGLE_VERIFIER_COOKIE)?.value;
  const returnPath = safeReturnPath(request.cookies.get(GOOGLE_RETURN_COOKIE)?.value);

  let result: GoogleSignInResult;
  try {
    result = await finishGoogleSignIn(
      getPool(),
      {
        code: query.get("code") ?? undefined,
        state: query.get("state") ?? undefined,
        error: query.get("error") ?? undefined,
      },
      state && verifier ? { state, verifier } : null,
      exchangeGoogleCode(googleClient(origin)),
    );
  } catch (err) {
    // A database or configuration failure still sends the visitor back to sign-in.
    console.error("Google sign-in failed", err);
    result = { ok: false, reason: "failed" };
  }

  const destination = result.ok ? (returnPath ?? "/") : googleFailurePath(result.reason, returnPath);
  const response = NextResponse.redirect(new URL(destination, origin));
  for (const name of [GOOGLE_STATE_COOKIE, GOOGLE_VERIFIER_COOKIE, GOOGLE_RETURN_COOKIE]) {
    response.cookies.delete({ name, path: "/ingresar/google" });
  }
  if (result.ok) response.cookies.set(SESSION_COOKIE, result.sessionToken, sessionCookieOptions);
  return response;
}
