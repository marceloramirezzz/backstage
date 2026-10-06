import type { Pool } from "pg";
import type { User } from "./accounts.ts";
import { rehearsalNotificationEmail } from "../email/rehearsal-notification-email.ts";
import type { Mailer } from "../email/mailer.ts";
import { ServiceError } from "./errors.ts";
import { requireEdit } from "./events.ts";
import { isUuid } from "./ids.ts";
import { getPermissions } from "./permissions.ts";

export interface Rehearsal {
  id: string;
  // `2026-09-26`: a calendar day, with no time zone to shift it.
  date: string;
  // `19:00` local time.
  startTime: string;
  endTime: string;
  location: string | null;
  notes: string | null;
}

export interface RehearsalInput {
  date: string;
  startTime: string;
  endTime: string;
  location?: string | null;
  notes?: string | null;
}

const COLUMNS = `r.id, to_char(r.date, 'YYYY-MM-DD') AS date,
  to_char(r.start_time, 'HH24:MI') AS "startTime", to_char(r.end_time, 'HH24:MI') AS "endTime",
  r.location, r.notes`;

const invalid = (message: string) => new ServiceError("invalid_input", message);
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const blankToNull = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

function validInput(input: RehearsalInput) {
  const { date, startTime, endTime } = input;
  const match = typeof date === "string" ? date.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
  const day = match && new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
  if (!match || day!.getUTCMonth() !== +match[2] - 1 || day!.getUTCDate() !== +match[3]) {
    throw invalid("A Rehearsal's date must be a real day as YYYY-MM-DD");
  }
  if (!TIME.test(startTime) || !TIME.test(endTime)) throw invalid("A Rehearsal's times must be HH:MM");
  if (endTime <= startTime) throw invalid("A Rehearsal must end after it starts");
  return {
    date,
    startTime,
    endTime,
    location: blankToNull(input.location),
    notes: blankToNull(input.notes),
  };
}

// The Project's Rehearsals by date, optionally within `from`..`to` (inclusive
// `YYYY-MM-DD` days). Any Member can browse them.
export async function listRehearsals(
  pool: Pool,
  user: User,
  projectId: string,
  range: { from?: string; to?: string } = {},
): Promise<Rehearsal[]> {
  await getPermissions(pool, user, projectId);
  const { rows } = await pool.query<Rehearsal>(
    `SELECT ${COLUMNS} FROM rehearsals r
     WHERE r.project_id = $1 AND ($2::date IS NULL OR r.date >= $2) AND ($3::date IS NULL OR r.date <= $3)
     ORDER BY r.date, r.start_time, r.id`,
    [projectId, range.from ?? null, range.to ?? null],
  );
  return rows;
}

// Needs the edit-events permission. With `notify`, emails every Member of the
// Project (the creator included) a plain notice; one that fails is logged and
// skipped. Without it nobody is emailed.
export async function createRehearsal(
  pool: Pool,
  mailer: Mailer,
  user: User,
  projectId: string,
  input: RehearsalInput,
  { notify = false }: { notify?: boolean } = {},
): Promise<Rehearsal> {
  requireEdit(await getPermissions(pool, user, projectId));
  const f = validInput(input);
  const { rows } = await pool.query<Rehearsal>(
    `INSERT INTO rehearsals AS r (project_id, date, start_time, end_time, location, notes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${COLUMNS}`,
    [projectId, f.date, f.startTime, f.endTime, f.location, f.notes],
  );
  const rehearsal = rows[0];
  if (notify) await notifyMembers(pool, mailer, projectId, rehearsal);
  return rehearsal;
}

export async function updateRehearsal(
  pool: Pool,
  user: User,
  projectId: string,
  rehearsalId: string,
  input: RehearsalInput,
): Promise<Rehearsal> {
  requireEdit(await getPermissions(pool, user, projectId));
  const f = validInput(input);
  const { rows } = isUuid(rehearsalId)
    ? await pool.query<Rehearsal>(
        `UPDATE rehearsals r SET date = $3, start_time = $4, end_time = $5, location = $6,
           notes = $7, updated_at = now()
         WHERE r.id = $1 AND r.project_id = $2 RETURNING ${COLUMNS}`,
        [rehearsalId, projectId, f.date, f.startTime, f.endTime, f.location, f.notes],
      )
    : { rows: [] };
  if (!rows[0]) throw new ServiceError("not_found", "Rehearsal not found");
  return rows[0];
}

export async function deleteRehearsal(
  pool: Pool,
  user: User,
  projectId: string,
  rehearsalId: string,
): Promise<void> {
  requireEdit(await getPermissions(pool, user, projectId));
  const { rowCount } = isUuid(rehearsalId)
    ? await pool.query("DELETE FROM rehearsals WHERE id = $1 AND project_id = $2", [rehearsalId, projectId])
    : { rowCount: 0 };
  if (!rowCount) throw new ServiceError("not_found", "Rehearsal not found");
}

async function notifyMembers(pool: Pool, mailer: Mailer, projectId: string, rehearsal: Rehearsal) {
  const { rows } = await pool.query<{ email: string }>(
    `SELECT u.email FROM users u JOIN memberships m ON m.user_id = u.id
     WHERE m.project_id = $1 ORDER BY u.email`,
    [projectId],
  );
  const { rows: projects } = await pool.query<{ name: string }>("SELECT name FROM projects WHERE id = $1", [
    projectId,
  ]);
  for (const { email } of rows) {
    try {
      await mailer.send(rehearsalNotificationEmail(mailer, email, projects[0].name, projectId, rehearsal));
    } catch (err) {
      console.error(`Could not notify ${email} about a Rehearsal`, err);
    }
  }
}
