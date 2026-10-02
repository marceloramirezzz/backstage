import { generateCodeVerifier, generateState } from "arctic";
import { NextResponse } from "next/server";
import {
  GOOGLE_FLOW_COOKIE_OPTIONS,
  GOOGLE_RETURN_COOKIE,
  GOOGLE_STATE_COOKIE,
  GOOGLE_VERIFIER_COOKIE,
  googleClient,
} from "@/lib/google-client.ts";
import { googleFailurePath } from "@/lib/google-errors.ts";
import { requestOrigin } from "@/lib/origin.ts";
import { safeReturnPath } from "@/lib/return-path.ts";

// Sends the visitor to Google's consent screen, remembering state, the PKCE
// verifier and the page to return to for the callback.
export async function GET(request: Request) {
  const returnPath = safeReturnPath(new URL(request.url).searchParams.get("volver"));
  const state = generateState();
  const verifier = generateCodeVerifier();
  let url: URL;
  try {
    url = googleClient(await requestOrigin()).createAuthorizationURL(state, verifier, [
      "openid",
      "profile",
      "email",
    ]);
  } catch (err) {
    // Typically Google credentials missing from the environment.
    console.error("Google sign-in couldn't start", err);
    return NextResponse.redirect(new URL(googleFailurePath("failed", returnPath), request.url));
  }
  const response = NextResponse.redirect(url);
  response.cookies.set(GOOGLE_STATE_COOKIE, state, GOOGLE_FLOW_COOKIE_OPTIONS);
  response.cookies.set(GOOGLE_VERIFIER_COOKIE, verifier, GOOGLE_FLOW_COOKIE_OPTIONS);
  response.cookies.set(GOOGLE_RETURN_COOKIE, returnPath ?? "", GOOGLE_FLOW_COOKIE_OPTIONS);
  return response;
}
