import { getPool } from "@/db/pool.ts";
import { getCalendarFeed } from "@/services/calendar-feed.ts";

// A Project's calendar feed. The secret token in the address is the only
// credential; any other one is a plain 404.
export async function GET(_request: Request, { params }: RouteContext<"/api/calendar/[token]">) {
  const { token } = await params;
  const ics = await getCalendarFeed(getPool(), token.replace(/\.ics$/, ""));
  if (!ics) return new Response("Not found", { status: 404 });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}
