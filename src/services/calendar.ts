import type { Pool } from "pg";
import type { User } from "./accounts.ts";
import { listEvents, type Event } from "./events.ts";
import { listRehearsals, type Rehearsal } from "./rehearsals.ts";

export interface CalendarRange {
  // Inclusive `YYYY-MM-DD` days.
  from: string;
  to: string;
  // Cancelled Events are left out unless asked for.
  includeCancelled?: boolean;
}

// What the Calendar shows for a range: the Project's Events (private ones
// included; any Member sees them) and Rehearsals.
export async function getCalendar(
  pool: Pool,
  user: User,
  projectId: string,
  { from, to, includeCancelled = false }: CalendarRange,
): Promise<{ events: Event[]; rehearsals: Rehearsal[] }> {
  const [events, rehearsals] = await Promise.all([
    listEvents(pool, user, projectId, { from, to }),
    listRehearsals(pool, user, projectId, { from, to }),
  ]);
  return {
    events: includeCancelled ? events : events.filter((e) => e.status !== "cancelled"),
    rehearsals,
  };
}
