// A path taken from the URL to return to after sign-in, or null unless it
// stays on this site. `//host` and `/\host` are read by browsers as other hosts.
export function safeReturnPath(path: string | null | undefined): string | null {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) {
    return null;
  }
  return path;
}
