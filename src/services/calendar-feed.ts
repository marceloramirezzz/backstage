import type { Pool } from "pg";
import type { User } from "./accounts.ts";
import { buildCalendar, type CalendarItem } from "../lib/ics.ts";
import { newToken } from "./tokens.ts";
import { requirePermission } from "./permissions.ts";

// The Project's feed token. Admin only: it is the key to the feed.
export async function getCalendarFeedToken(pool: Pool, user: User, projectId: string): Promise<string> {
  await requirePermission(pool, user, projectId, "administer");
  const { rows } = await pool.query<{ token: string }>(
    "SELECT calendar_token AS token FROM projects WHERE id = $1",
    [projectId],
  );
  return rows[0].token;
}

// Replaces the token, so the old address stops working. Admin only.
export async function regenerateCalendarFeedToken(
  pool: Pool,
  user: User,
  projectId: string,
): Promise<string> {
  await requirePermission(pool, user, projectId, "administer");
  const token = newToken();
  await pool.query("UPDATE projects SET calendar_token = $2 WHERE id = $1", [projectId, token]);
  return token;
}

// The `.ics` for the Project that holds `token`, or null for any other token.
// SEQUENCE follows the last edit, in step with the invites. The UIDs match
// `eventUid` and `rehearsalUid`. Only titles, times and locations: never pay, client, payout or notes.
// Cancelled Events are left out.
export async function getCalendarFeed(pool: Pool, token: string, now = new Date()): Promise<string | null> {
  const { rows: projects } = await pool.query<{ id: string; name: string }>(
    "SELECT id, name FROM projects WHERE calendar_token = $1",
    [token],
  );
  if (!projects[0]) return null;
  const { id, name } = projects[0];
  const { rows: events } = await pool.query<CalendarItem>(
    `SELECT 'event-' || e.id || '@backstage' AS uid, floor(extract(epoch FROM e.updated_at))::int AS sequence, e.name AS summary,
       to_char(e.date, 'YYYY-MM-DD') AS date, to_char(e.start_time, 'HH24:MI') AS "startTime",
       e.duration_minutes AS "durationMinutes", e.location
     FROM events e WHERE e.project_id = $1 AND e.status <> 'cancelled' ORDER BY e.date, e.id`,
    [id],
  );
  const { rows: rehearsals } = await pool.query<CalendarItem>(
    `SELECT 'rehearsal-' || r.id || '@backstage' AS uid, floor(extract(epoch FROM r.updated_at))::int AS sequence, 'Ensayo' AS summary,
       to_char(r.date, 'YYYY-MM-DD') AS date, to_char(r.start_time, 'HH24:MI') AS "startTime",
       (extract(epoch FROM r.end_time - r.start_time) / 60)::int AS "durationMinutes", r.location
     FROM rehearsals r WHERE r.project_id = $1 ORDER BY r.date, r.id`,
    [id],
  );
  return buildCalendar({ name, stamp: now, items: [...events, ...rehearsals] });
}
