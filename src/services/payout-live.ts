import type { Pool, PoolClient } from "pg";
import { computePayout, type PayoutResult, type SplitKind, type SplitRule } from "./payout-math.ts";
import type { RoleKind } from "./permissions.ts";

// A Role as the Split sees it.
export interface SplitRole {
  id: string;
  name: string;
  kind: RoleKind;
  // Members holding it now.
  memberCount: number;
}

// An Event's Payout Split as an Admin sees it: the math and everyone's share.
export interface FullPayout {
  scope: "full";
  // When this Payout was frozen (the Event is Paid); null while it's a live preview.
  frozenAt: string | null;
  // The Project's default, or this Event's own override.
  source: "default" | "event";
  rules: SplitRule[];
  pay: number;
  expensesTotal: number;
  net: number;
  result: PayoutResult;
  roles: {
    roleId: string;
    name: string;
    roleKind: RoleKind;
    kind: SplitKind;
    value: number;
    skipped: boolean;
    amount: number;
    attendees: { userId: string; displayName: string; amount: number }[];
  }[];
  guests: { id: string; name: string; amount: number; fixedAmount: number }[];
  // Whoever takes what rounding leaves over.
  remainderRecipient: string | null;
}

export type Db = Pool | PoolClient;

export async function defaultRules(db: Db, projectId: string): Promise<SplitRule[]> {
  const { rows } = await db.query<SplitRule>(
    `SELECT role_id AS "roleId", kind, value::float8 AS value
     FROM project_split_rules WHERE project_id = $1 ORDER BY role_id`,
    [projectId],
  );
  return rows;
}

export async function effectiveRules(db: Db, projectId: string, eventId: string) {
  const { rows: own } = await db.query("SELECT 1 FROM event_splits WHERE event_id = $1", [eventId]);
  if (!own[0]) return { source: "default" as const, rules: await defaultRules(db, projectId) };
  const { rows } = await db.query<SplitRule>(
    `SELECT role_id AS "roleId", kind, value::float8 AS value
     FROM event_split_rules WHERE event_id = $1 ORDER BY role_id`,
    [eventId],
  );
  return { source: "event" as const, rules: rows };
}

export async function projectRoles(db: Db, projectId: string): Promise<SplitRole[]> {
  const { rows } = await db.query<SplitRole>(
    `SELECT r.id, r.name, r.kind, count(m.user_id)::int AS "memberCount"
     FROM roles r LEFT JOIN memberships m ON m.role_id = r.id AND m.project_id = r.project_id
     WHERE r.project_id = $1 GROUP BY r.id ORDER BY r.kind, r.name`,
    [projectId],
  );
  return rows;
}

// Computes an Event's Split from its Attendance, Guests, Expenses and rules,
// as they are now.
export async function livePayout(db: Db, projectId: string, eventId: string): Promise<FullPayout> {
  const { source, rules } = await effectiveRules(db, projectId, eventId);
  const { rows: events } = await db.query<{ pay: number; expensesTotal: number; ownerId: string }>(
    `SELECT e.pay::float8 AS pay, p.owner_id AS "ownerId",
       (SELECT coalesce(sum(x.amount), 0)::float8 FROM event_expenses x WHERE x.event_id = e.id) AS "expensesTotal"
     FROM events e JOIN projects p ON p.id = e.project_id WHERE e.id = $1`,
    [eventId],
  );
  const { pay, expensesTotal, ownerId } = events[0];
  const { rows: attending } = await db.query<{ userId: string; displayName: string; roleId: string }>(
    `SELECT u.id AS "userId", u.display_name AS "displayName", m.role_id AS "roleId"
     FROM memberships m
     JOIN users u ON u.id = m.user_id
     WHERE m.project_id = $1
       AND NOT EXISTS (SELECT 1 FROM event_absences a WHERE a.event_id = $2 AND a.user_id = m.user_id)
     ORDER BY lower(u.display_name), u.id`,
    [projectId, eventId],
  );
  const { rows: guests } = await db.query<{ id: string; name: string; amount: number }>(
    "SELECT id, name, amount::float8 AS amount FROM event_guests WHERE event_id = $1 ORDER BY created_at, id",
    [eventId],
  );
  const projectRolesById = new Map((await projectRoles(db, projectId)).map((r) => [r.id, r]));
  // The Owner takes the rounding; if they didn't play, the first who did.
  const recipient = (attending.find((a) => a.userId === ownerId) ?? attending[0])?.userId ?? null;
  const net = pay - expensesTotal;
  const result = computePayout({ net, rules, attendees: attending, guests, remainderRecipient: recipient });
  const names = new Map(attending.map((a) => [a.userId, a.displayName]));
  return {
    scope: "full",
    frozenAt: null,
    source,
    rules,
    pay,
    expensesTotal,
    net,
    result,
    roles: result.roles.map((r) => ({
      roleId: r.roleId,
      name: projectRolesById.get(r.roleId)!.name,
      roleKind: projectRolesById.get(r.roleId)!.kind,
      kind: r.kind,
      value: r.value,
      skipped: r.skipped,
      amount: r.amount,
      attendees: r.attendeeIds.map((id) => ({
        userId: id,
        displayName: names.get(id) ?? "",
        amount: result.members.find((m) => m.userId === id)!.amount,
      })),
    })),
    guests: guests.map((g) => ({
      id: g.id,
      name: g.name,
      amount: result.guests.find((x) => x.id === g.id)!.amount,
      fixedAmount: g.amount,
    })),
    remainderRecipient: recipient,
  };
}


// A Member as Attendance lists them.
export interface AttendanceMember {
  userId: string;
  displayName: string;
  roleName: string;
  attending: boolean;
}

// Every Member of the Project, attending unless the Event lists them as absent.
export async function liveMembers(db: Db, projectId: string, eventId: string): Promise<AttendanceMember[]> {
  const { rows } = await db.query<AttendanceMember>(
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
  return rows;
}
