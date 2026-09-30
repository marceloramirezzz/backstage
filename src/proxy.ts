import { NextResponse, type NextRequest } from "next/server";
import {
  RETURN_PATH_HEADER,
  SESSION_COOKIE,
  sessionCookieOptions,
  signInPath,
} from "@/lib/session-cookie.ts";

// Gate for app routes. Only checks that a session cookie is present: the
// pages resolve it for real, and use the return path set here to send a
// visitor with a stale cookie back through sign-in.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const returnPath = pathname + search;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.redirect(new URL(signInPath(returnPath), request.url));
  }
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(RETURN_PATH_HEADER, returnPath);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  // The server-side session slides on use; keep the cookie in step.
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return response;
}

export const config = {
  matcher: ["/p/:path*", "/bienvenida"],
};
