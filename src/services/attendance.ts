import type { Pool } from "pg";
import type { User } from "./accounts.ts";
import { ServiceError } from "./errors.ts";
import { isUuid } from "./ids.ts";
import { requireEdit, requireEvent } from "./events.ts";
import { getPermissions } from "./permissions.ts";

export interface AttendanceMember {
  userId: string;
  displayName: string;
  roleName: string;
  attending: boolean;
}

// A name-only person hired for one Event.
export interface Guest {
  id: string;
  name: string;
  // Fixed amount in whole Guaraníes. Null for those who can't see pay.
  amount: number | null;
}

export interface Attendance {
  members: AttendanceMember[];
  guests: Guest[];
}

export interface GuestInput {
  name: string;
  // Defaults to 0. Needs both the edit and the see-pay permissions to set.
  amount?: number;
}

// Every Member of the Project, attending unless the Event lists them as
// absent, and the Event's Guests. Any Member can see it.
export async function getAttendance(
  pool: Pool,
  user: User,
  projectId: string,
  eventId: string,
): Promise<Attendance> {
  const permissions = await getPermissions(pool, user, projectId);
  await requireEvent(pool, projectId, eventId);
  const members = await pool.query<AttendanceMember>(
    `SELECT u.id AS "userId", u.display_name AS "displayName", r.name AS "roleName",
       a.user_id IS NULL AS attending
     FROM memberships m
     JOIN users u ON u.id = m.user_id
     JOIN roles r ON r.id = m.role_id
     LEFT JOIN event_absences a ON a.event_id = $2 AND a.user_id = m.user_id
     WHERE m.project_id = $1
     ORDER BY lower(u.display_name), u.id`,
    [projectId, eventId],
  );
  const guests = await pool.query<Guest>(
    `SELECT id, name, CASE WHEN $2 THEN amount END::float8 AS amount
     FROM event_guests WHERE event_id = $1 ORDER BY created_at, id`,
    [eventId, permissions.seeTotalPayExpenses],
  );
  return { members: members.rows, guests: guests.rows };
}

// Ticks or unticks a Member. Nobody edits their own, so a Member can't
// excuse themselves from the pay split (or add themselves back).
export async function setAttending(
  pool: Pool,
  user: User,
  projectId: string,
  eventId: string,
  memberUserId: string,
  attending: boolean,
): Promise<void> {
  const permissions = await getPermissions(pool, user, projectId);
  requireEdit(permissions);
  if (memberUserId === user.id) {
    throw new ServiceError("forbidden", "You can't edit your own Attendance");
  }
  await requireEvent(pool, projectId, eventId);
  const { rows } = isUuid(memberUserId)
    ? await pool.query("SELECT 1 FROM memberships WHERE project_id = $1 AND user_id = $2", [
        projectId,
        memberUserId,
      ])
    : { rows: [] };
  if (!rows[0]) throw new ServiceError("not_found", "Member not found");
  await pool.query(
    attending
      ? "DELETE FROM event_absences WHERE event_id = $1 AND user_id = $2"
      : `INSERT INTO event_absences (event_id, project_id, user_id) VALUES ($1, $3, $2)
         ON CONFLICT DO NOTHING`,
    attending ? [eventId, memberUserId] : [eventId, memberUserId, projectId],
  );
}

export async function addGuest(
  pool: Pool,
  user: User,
  projectId: string,
  eventId: string,
  input: GuestInput,
): Promise<Guest> {
  const permissions = await getPermissions(pool, user, projectId);
  requireEdit(permissions);
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) throw new ServiceError("invalid_input", "A Guest's name is required");
  const amount = input.amount ?? 0;
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new ServiceError("invalid_input", "A Guest's amount must be a whole amount of Guaraníes");
  }
  // You can't set what you can't see.
  if (amount !== 0 && !permissions.seeTotalPayExpenses) {
    throw new ServiceError("forbidden", "You can't set the amount of a Guest you can't see it of");
  }
  await requireEvent(pool, projectId, eventId);
  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO event_guests (event_id, name, amount) VALUES ($1, $2, $3) RETURNING id",
    [eventId, name, amount],
  );
  return { id: rows[0].id, name, amount: permissions.seeTotalPayExpenses ? amount : null };
}

export async function removeGuest(
  pool: Pool,
  user: User,
  projectId: string,
  eventId: string,
  guestId: string,
): Promise<void> {
  const permissions = await getPermissions(pool, user, projectId);
  requireEdit(permissions);
  await requireEvent(pool, projectId, eventId);
  const { rowCount } = isUuid(guestId)
    ? await pool.query("DELETE FROM event_guests WHERE id = $1 AND event_id = $2", [guestId, eventId])
    : { rowCount: 0 };
  if (!rowCount) throw new ServiceError("not_found", "Guest not found");
}
