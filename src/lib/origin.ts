import { headers } from "next/headers";

// The site's origin as the visitor reached it, or "" when the request has no host.
export async function requestOrigin(): Promise<string> {
  const host = (await headers()).get("host");
  if (!host) return "";
  return `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
}
