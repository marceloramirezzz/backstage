import type { Pool } from "pg";
import type { User } from "./accounts.ts";
import { ServiceError } from "./errors.ts";
import { eventPayout } from "./payout-snapshots.ts";
import { getPermissions } from "./permissions.ts";
import { isDay, type PeriodRange } from "./splits.ts";

// Whole-band figures, for everyone who may see total pay.
export interface BandDashboard {
  scope: "band";
  // Confirmed and Paid Events.
  shows: number;
  paidShows: number;
  confirmedShows: number;
  // Payments received dated within the period.
  earned: number;
  // `pay` minus Payments received, for Confirmed and Paid Events.
  expected: number;
}

// What a Role without "see total pay & expenses" gets: the shows count and
// only their own shares, never a band-wide total.
export interface OwnDashboard {
  scope: "own";
  shows: number;
  earned: number;
  expected: number;
}

export type Dashboard = BandDashboard | OwnDashboard;

// The Resumen figures for Events dated within the period.
export async function getDashboard(
  pool: Pool,
  user: User,
  projectId: string,
  period: PeriodRange,
): Promise<Dashboard> {
  const permissions = await getPermissions(pool, user, projectId);
  if (!isDay(period.from) || !isDay(period.to)) {
    throw new ServiceError("invalid_input", "A period is a pair of YYYY-MM-DD days");
  }
  const { rows: events } = await pool.query<{ id: string; status: "confirmed" | "paid"; pay: number }>(
    `SELECT id, status, pay::float8 AS pay FROM events
     WHERE project_id = $1 AND status IN ('confirmed', 'paid') AND date BETWEEN $2 AND $3`,
    [projectId, period.from, period.to],
  );
  const paid = events.filter((e) => e.status === "paid");
  const confirmed = events.filter((e) => e.status === "confirmed");

  if (permissions.seeTotalPayExpenses) {
    const { rows } = await pool.query<{ earned: number; expected: number }>(
      `SELECT
         (SELECT COALESCE(SUM(p.amount), 0)::float8 FROM event_payments p
          JOIN events e ON e.id = p.event_id
          WHERE e.project_id = $1 AND p.date BETWEEN $2 AND $3) AS earned,
         (SELECT COALESCE(SUM(GREATEST(e.pay - COALESCE(r.received, 0), 0)), 0)::float8 FROM events e
          LEFT JOIN (SELECT event_id, SUM(amount) AS received FROM event_payments GROUP BY event_id) r
            ON r.event_id = e.id
          WHERE e.project_id = $1 AND e.status IN ('confirmed', 'paid') AND e.date BETWEEN $2 AND $3) AS expected`,
      [projectId, period.from, period.to],
    );
    return {
      scope: "band",
      shows: events.length,
      paidShows: paid.length,
      confirmedShows: confirmed.length,
      earned: rows[0].earned,
      expected: rows[0].expected,
    };
  }

  const share = async (list: typeof events) => {
    let total = 0;
    for (const e of list) {
      const { result } = await eventPayout(pool, projectId, e.id);
      total += result.members.find((m) => m.userId === user.id)?.amount ?? 0;
    }
    return total;
  };
  return { scope: "own", shows: events.length, earned: await share(paid), expected: await share(confirmed) };
}
