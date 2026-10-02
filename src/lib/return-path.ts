// A path taken from the URL to return to after sign-in, or null unless it
// stays on this site. `//host` and `/\host` are read by browsers as other hosts,
// and URL parsers drop tabs and newlines, so `/<tab>/host` is one too.
export function safeReturnPath(path: string | null | undefined): string | null {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\") || /[\u0000-\u001f\u007f]/.test(path)) {
    return null;
  }
  return path;
}

// `path` carrying the page to return to afterwards, as the auth pages expect.
export function withReturnPath(path: string, returnPath?: string | null): string {
  return returnPath ? `${path}?volver=${encodeURIComponent(returnPath)}` : path;
}
