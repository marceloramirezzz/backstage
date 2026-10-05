import type { Pool, PoolClient } from "pg";
import type { User } from "./accounts.ts";
import { ServiceError } from "./errors.ts";
import { isUuid } from "./ids.ts";
import { getPermissions, type Permissions } from "./permissions.ts";
import { dropSnapshot, takeSnapshot } from "./payout-snapshots.ts";
import type { Intensity, Song } from "./songs.ts";
import { inTransaction } from "./transaction.ts";

export const EVENT_STATUSES = ["pending", "confirmed", "paid", "cancelled"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

// One entry of an Event's Setlist, as it was when copied: later edits to the
// Song or Selection never reach it.
export interface EventSetlistItem {
  kind: "song" | "selection";
  name: string;
  // Null for a Selection, which has none.
  key: string | null;
  durationSeconds: number;
  intensity: Intensity;
  // A Selection's Songs, as they were when copied.
  songs: Omit<Song, "id">[] | null;
}

// The Event's own copy of a template Setlist. Independent of it from the
// moment it's made.
export interface EventSetlist {
  // The template's name and category when it was copied.
  name: string;
  category: string | null;
  copiedAt: string;
  items: EventSetlistItem[];
  // The sum of its items' durations; unrelated to the Event's duration.
  durationSeconds: number;
}

export interface Event {
  id: string;
  name: string;
  // `2026-09-26`: a calendar day, with no time zone to shift it.
  date: string;
  // `22:00` local time; null while it isn't settled.
  startTime: string | null;
  location: string | null;
  // Cachet in whole Guaraníes. Null for those who can't see total pay.
  pay: number | null;
  // Null for those who can't see total pay.
  bandFundBasisPoints: number | null;
  // The whole gig, breaks and sound check included.
  durationMinutes: number;
  status: EventStatus;
  isPublic: boolean;
  setlist: EventSetlist | null;
}

export interface EventInput {
  name: string;
  date: string;
  startTime?: string | null;
  location?: string | null;
  // Defaults to 0. Needs both the edit and the see-pay permissions.
  pay?: number;
  // Share of the net kept for the band before the split, in basis points (0–50%). Defaults to 0;
  // needs both the edit and the see-pay permissions.
  bandFundBasisPoints?: number;
  durationMinutes: number;
  status?: EventStatus;
  isPublic?: boolean;
  // A template Setlist to copy into the Event.
  setlistId?: string | null;
}

// Only the fields given change. `setlistId` replaces the Event's Setlist with
// a fresh copy of that template, or removes it when null.
export type EventPatch = Partial<EventInput>;

// Expects the events table aliased as `e`; `$1` is whether the viewer sees pay.
const EVENT_COLUMNS = `e.id, e.name, to_char(e.date, 'YYYY-MM-DD') AS date,
  to_char(e.start_time, 'HH24:MI') AS "startTime", e.location,
  CASE WHEN $1 THEN e.pay::float8 END AS pay,
  CASE WHEN $1 THEN e.band_fund_basis_points END AS "bandFundBasisPoints",
  e.duration_minutes AS "durationMinutes", e.status, e.is_public AS "isPublic",
  CASE WHEN e.setlist_copied_at IS NOT NULL THEN json_build_object(
    'name', e.setlist_name, 'category', e.setlist_category, 'copiedAt', e.setlist_copied_at,
    'items', (SELECT coalesce(json_agg(json_build_object('kind', i.kind, 'name', i.name,
       'key', i.key, 'durationSeconds', i.duration_seconds, 'intensity', i.intensity,
       'songs', i.songs) ORDER BY i.position), '[]')
     FROM event_setlist_items i WHERE i.event_id = e.id),
    'durationSeconds', (SELECT coalesce(sum(i.duration_seconds), 0)::int
     FROM event_setlist_items i WHERE i.event_id = e.id)) END AS setlist`;

// The Project's Events by date, optionally within `from`..`to` (inclusive
// `YYYY-MM-DD` days). Any Member can browse them.
export async function listEvents(
  pool: Pool,
  user: User,
  projectId: string,
  range: { from?: string; to?: string } = {},
): Promise<Event[]> {
  const permissions = await getPermissions(pool, user, projectId);
  const from = range.from === undefined ? null : validDate(range.from);
  const to = range.to === undefined ? null : validDate(range.to);
  const { rows } = await pool.query<Event>(
    `SELECT ${EVENT_COLUMNS} FROM events e
     WHERE e.project_id = $2 AND ($3::date IS NULL OR e.date >= $3) AND ($4::date IS NULL OR e.date <= $4)
     ORDER BY e.date, e.start_time NULLS LAST, lower(e.name), e.id`,
    [permissions.seeTotalPayExpenses, projectId, from, to],
  );
  return rows;
}

export async function getEvent(
  pool: Pool,
  user: User,
  projectId: string,
  eventId: string,
): Promise<Event> {
  const permissions = await getPermissions(pool, user, projectId);
  if (!isUuid(eventId)) throw new ServiceError("not_found", "Event not found");
  return findEvent(pool, projectId, eventId, permissions);
}

export async function createEvent(
  pool: Pool,
  user: User,
  projectId: string,
  input: EventInput,
): Promise<Event> {
  const permissions = await getPermissions(pool, user, projectId);
  requireEdit(permissions);
  const { setlistId, ...fields } = validFields(input, permissions, { partial: false });
  return inTransaction(pool, async (client) => {
    const columns = Object.keys(fields);
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO events (project_id, ${columns.join(", ")})
       VALUES ($1, ${columns.map((_, i) => `$${i + 2}`).join(", ")}) RETURNING id`,
      [projectId, ...Object.values(fields)],
    );
    if (setlistId) await copySetlist(client, projectId, rows[0].id, setlistId);
    if (fields.status === "paid") await takeSnapshot(client, projectId, rows[0].id);
    return findEvent(client, projectId, rows[0].id, permissions);
  });
}

export async function updateEvent(
  pool: Pool,
  user: User,
  projectId: string,
  eventId: string,
  patch: EventPatch,
): Promise<Event> {
  const permissions = await getPermissions(pool, user, projectId);
  requireEdit(permissions);
  const { setlistId, ...fields } = validFields(patch, permissions, { partial: true });
  if (!isUuid(eventId)) throw new ServiceError("not_found", "Event not found");
  return inTransaction(pool, async (client) => {
    const columns = Object.keys(fields);
    const { rows: before } = await client.query<{ status: EventStatus; pay: string; fund: number }>(
      "SELECT status, pay, band_fund_basis_points AS fund FROM events WHERE id = $1 AND project_id = $2 FOR UPDATE",
      [eventId, projectId],
    );
    const { rowCount } = await client.query(
      `UPDATE events SET updated_at = now()${columns.map((c, i) => `, ${c} = $${i + 3}`).join("")}
       WHERE id = $1 AND project_id = $2`,
      [eventId, projectId, ...Object.values(fields)],
    );
    if (!rowCount) throw new ServiceError("not_found", "Event not found");
    if (setlistId) await copySetlist(client, projectId, eventId, setlistId);
    if (setlistId === null) await clearSetlist(client, eventId);
    // Paid freezes the payout; leaving Paid unfreezes it. Other edits to a Paid
    // Event leave the snapshot alone, only its pay or band fund re-freezes it.
    const paid = (fields.status ?? before[0].status) === "paid";
    const payChanged = fields.pay !== undefined && String(fields.pay) !== before[0].pay;
    const fundChanged = fields.band_fund_basis_points !== undefined && fields.band_fund_basis_points !== before[0].fund;
    if (!paid) await dropSnapshot(client, eventId);
    else if (before[0].status !== "paid" || payChanged || fundChanged) {
      await takeSnapshot(client, projectId, eventId);
    }
    return findEvent(client, projectId, eventId, permissions);
  });
}

// Deletes an Event with its Setlist copy. Only an Admin deletes a Paid one.
export async function deleteEvent(
  pool: Pool,
  user: User,
  projectId: string,
  eventId: string,
): Promise<void> {
  const permissions = await getPermissions(pool, user, projectId);
  requireEdit(permissions);
  if (!isUuid(eventId)) throw new ServiceError("not_found", "Event not found");
  // One statement, so the status can't change between the check and the delete.
  const { rowCount } = await pool.query(
    `DELETE FROM events WHERE id = $1 AND project_id = $2 AND (status <> 'paid' OR $3)`,
    [eventId, projectId, permissions.administer],
  );
  if (rowCount) return;
  const { rows } = await pool.query("SELECT 1 FROM events WHERE id = $1 AND project_id = $2", [
    eventId,
    projectId,
  ]);
  if (!rows[0]) throw new ServiceError("not_found", "Event not found");
  throw new ServiceError("forbidden", "Only an Admin can delete a Paid Event");
}

export function requireEdit(permissions: Permissions) {
  if (!permissions.editRepertoireSetlistsEvents) {
    throw new ServiceError("forbidden", "You don't have permission to do that");
  }
}

// Throws not found unless the Project has this Event.
export async function requireEvent(db: Pool | PoolClient, projectId: string, eventId: string) {
  const { rows } = isUuid(eventId)
    ? await db.query("SELECT 1 FROM events WHERE id = $1 AND project_id = $2", [eventId, projectId])
    : { rows: [] };
  if (!rows[0]) throw new ServiceError("not_found", "Event not found");
}

async function findEvent(
  db: Pool | PoolClient,
  projectId: string,
  eventId: string,
  permissions: Permissions,
): Promise<Event> {
  const { rows } = await db.query<Event>(
    `SELECT ${EVENT_COLUMNS} FROM events e WHERE e.id = $2 AND e.project_id = $3`,
    [permissions.seeTotalPayExpenses, eventId, projectId],
  );
  if (!rows[0]) throw new ServiceError("not_found", "Event not found");
  return rows[0];
}

// Replaces the Event's Setlist with a copy of the template as it is now.
async function copySetlist(
  client: PoolClient,
  projectId: string,
  eventId: string,
  setlistId: string,
) {
  const { rowCount } = await client.query(
    `UPDATE events e SET setlist_name = sl.name, setlist_category = sl.category,
       setlist_copied_at = now()
     FROM setlists sl WHERE e.id = $1 AND sl.id = $2 AND sl.project_id = e.project_id
       AND e.project_id = $3`,
    [eventId, setlistId, projectId],
  );
  if (!rowCount) {
    throw new ServiceError("invalid_input", "An Event's Setlist must be one of this Project's");
  }
  await client.query("DELETE FROM event_setlist_items WHERE event_id = $1", [eventId]);
  await client.query(
    `INSERT INTO event_setlist_items
       (event_id, position, kind, name, key, duration_seconds, intensity, songs, lyrics)
     SELECT $1, si.position, CASE WHEN si.song_id IS NOT NULL THEN 'song' ELSE 'selection' END,
       coalesce(s.name, sel.name), s.key, coalesce(s.duration_seconds, sel.duration_seconds),
       coalesce(s.intensity, sel.intensity),
       (SELECT jsonb_agg(jsonb_build_object('name', ss_song.name, 'key', ss_song.key,
          'durationSeconds', ss_song.duration_seconds, 'intensity', ss_song.intensity)
          ORDER BY ss.position)
        FROM selection_songs ss JOIN songs ss_song ON ss_song.id = ss.song_id
        WHERE ss.selection_id = si.selection_id),
       coalesce(s.lyrics, sel.lyrics)
     FROM setlist_items si
     LEFT JOIN songs s ON s.id = si.song_id
     LEFT JOIN selections sel ON sel.id = si.selection_id
     WHERE si.setlist_id = $2`,
    [eventId, setlistId],
  );
}

async function clearSetlist(client: PoolClient, eventId: string) {
  await client.query("DELETE FROM event_setlist_items WHERE event_id = $1", [eventId]);
  await client.query(
    `UPDATE events SET setlist_name = NULL, setlist_category = NULL, setlist_copied_at = NULL
     WHERE id = $1`,
    [eventId],
  );
}

const REQUIRED_FIELDS: (keyof EventInput)[] = ["name", "date", "durationMinutes"];

const invalid = (message: string) => new ServiceError("invalid_input", message);

// A real `YYYY-MM-DD` calendar day.
function validDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw invalid("An Event's date must be a day as YYYY-MM-DD");
  }
  const [y, m, d] = value.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  if (day.getUTCFullYear() !== y || day.getUTCMonth() !== m - 1 || day.getUTCDate() !== d) {
    throw invalid("An Event's date must be a real day");
  }
  return value;
}

const blankToNull = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

// The columns to write, validated, for the fields present (all required ones
// when creating). `setlistId` is returned apart: it isn't a column.
function validFields(
  input: EventPatch,
  permissions: Permissions,
  { partial }: { partial: boolean },
) {
  // Creating needs the required fields; updating only what it was given.
  const has = (key: keyof EventInput) =>
    input[key] !== undefined || (!partial && REQUIRED_FIELDS.includes(key));
  const out: Record<string, unknown> & { setlistId?: string | null } = {};

  if (has("name")) {
    const name = blankToNull(input.name);
    if (!name) throw invalid("Event name is required");
    out.name = name;
  }
  if (has("date")) out.date = validDate(input.date);
  if (has("startTime")) {
    const { startTime } = input;
    const wellFormed = typeof startTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(startTime);
    if (startTime !== null && !wellFormed) {
      throw invalid("An Event's start time must be HH:MM");
    }
    out.start_time = startTime;
  }
  if (has("location")) out.location = blankToNull(input.location);
  if (has("durationMinutes")) {
    const { durationMinutes } = input;
    if (!Number.isSafeInteger(durationMinutes) || (durationMinutes as number) <= 0) {
      throw invalid("An Event's duration must be a whole number of minutes");
    }
    out.duration_minutes = durationMinutes;
  }
  if (has("pay")) {
    const { pay } = input;
    if (!Number.isSafeInteger(pay) || (pay as number) < 0) {
      throw invalid("An Event's pay must be a whole amount of Guaraníes");
    }
    // You can't set what you can't see.
    if (!permissions.seeTotalPayExpenses) {
      throw new ServiceError("forbidden", "You can't set the pay of an Event you can't see it of");
    }
    out.pay = pay;
  }
  if (input.bandFundBasisPoints !== undefined) {
    const { bandFundBasisPoints: bp } = input;
    if (!Number.isSafeInteger(bp) || (bp as number) < 0 || (bp as number) > 5000) {
      throw invalid("An Event's band fund must be between 0% and 50%");
    }
    if (!permissions.seeTotalPayExpenses) {
      throw new ServiceError("forbidden", "You can't set the band fund of an Event you can't see the pay of");
    }
    out.band_fund_basis_points = bp;
  }
  if (has("status")) {
    if (!EVENT_STATUSES.includes(input.status as EventStatus)) throw invalid("Unknown Event status");
    out.status = input.status;
  }
  if (has("isPublic")) {
    if (typeof input.isPublic !== "boolean") throw invalid("An Event is either public or private");
    out.is_public = input.isPublic;
  }
  if (input.setlistId !== undefined) {
    const { setlistId } = input;
    if (setlistId !== null && !(typeof setlistId === "string" && isUuid(setlistId))) {
      throw invalid("An Event's Setlist must be one of this Project's");
    }
    out.setlistId = setlistId;
  }
  return out as Record<string, unknown> & { setlistId?: string | null };
}
