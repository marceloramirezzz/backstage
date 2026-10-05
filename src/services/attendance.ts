import type { Pool } from "pg";
import type { User } from "./accounts.ts";
import { ServiceError } from "./errors.ts";
import { isUuid } from "./ids.ts";
import { requireEdit, requireEvent } from "./events.ts";
import { liveMembers, type AttendanceMember } from "./payout-live.ts";
import { findSnapshot, syncSnapshot } from "./payout-snapshots.ts";
import { getPermissions } from "./permissions.ts";
import { inTransaction } from "./transaction.ts";

export type { AttendanceMember };

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
  // A Paid Event shows who played as of when it was frozen.
  const frozen = await findSnapshot(pool, eventId);
  if (frozen) {
    return {
      members: frozen.attendance,
      guests: frozen.payout.guests.map((g) => ({
        id: g.id,
        name: g.name,
        amount: permissions.seeTotalPayExpenses ? g.fixedAmount : null,
      })),
    };
  }
  const guests = await pool.query<Guest>(
    `SELECT id, name, CASE WHEN $2 THEN amount END::float8 AS amount
     FROM event_guests WHERE event_id = $1 ORDER BY created_at, id`,
    [eventId, permissions.seeTotalPayExpenses],
  );
  return { members: await liveMembers(pool, projectId, eventId), guests: guests.rows };
}

// Ticks or unticks a Member. Whoever can edit the Event may do it for any
// Member, themselves included.
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
  await requireEvent(pool, projectId, eventId);
  const { rows } = isUuid(memberUserId)
    ? await pool.query("SELECT 1 FROM memberships WHERE project_id = $1 AND user_id = $2", [
        projectId,
        memberUserId,
      ])
    : { rows: [] };
  if (!rows[0]) throw new ServiceError("not_found", "Member not found");
  await inTransaction(pool, async (client) => {
    await client.query(
      attending
        ? "DELETE FROM event_absences WHERE event_id = $1 AND user_id = $2"
        : `INSERT INTO event_absences (event_id, project_id, user_id) VALUES ($1, $3, $2)
           ON CONFLICT DO NOTHING`,
      attending ? [eventId, memberUserId] : [eventId, memberUserId, projectId],
    );
    await syncSnapshot(client, projectId, eventId);
  });
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
  return inTransaction(pool, async (client) => {
    const { rows } = await client.query<{ id: string }>(
      "INSERT INTO event_guests (event_id, name, amount) VALUES ($1, $2, $3) RETURNING id",
      [eventId, name, amount],
    );
    await syncSnapshot(client, projectId, eventId);
    return { id: rows[0].id, name, amount: permissions.seeTotalPayExpenses ? amount : null };
  });
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
  await inTransaction(pool, async (client) => {
    const { rowCount } = isUuid(guestId)
      ? await client.query("DELETE FROM event_guests WHERE id = $1 AND event_id = $2", [guestId, eventId])
      : { rowCount: 0 };
    if (!rowCount) throw new ServiceError("not_found", "Guest not found");
    await syncSnapshot(client, projectId, eventId);
  });
}
