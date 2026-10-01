import type { Pool, PoolClient } from "pg";
import type { User } from "./accounts.ts";
import { ServiceError } from "./errors.ts";
import { requireEvent } from "./events.ts";
import { isUuid } from "./ids.ts";
import { computePayout, type PayoutResult, type SplitKind, type SplitRule } from "./payout-math.ts";
import { getPermissions, requirePermission, type RoleKind } from "./permissions.ts";
import { inTransaction } from "./transaction.ts";

export type { SplitKind, SplitRule };
export const SPLIT_KINDS = ["percentage", "role_fixed", "member_fixed"] as const;

// A Role as the Split sees it.
export interface SplitRole {
  id: string;
  name: string;
  kind: RoleKind;
  // Members holding it now.
  memberCount: number;
}

export interface DefaultSplit {
  rules: SplitRule[];
  roles: SplitRole[];
}

// An Event's Payout Split as an Admin sees it: the math and everyone's share.
export interface FullPayout {
  scope: "full";
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
  guests: { id: string; name: string; amount: number }[];
  // Whoever takes what rounding leaves over.
  remainderRecipient: string | null;
}

// What everyone else gets: only their own share, null if they didn't play.
export interface OwnPayout {
  scope: "own";
  amount: number | null;
}

export type EventPayout = FullPayout | OwnPayout;

export interface PersonTotal {
  userId: string;
  displayName: string;
  roleName: string;
  roleKind: RoleKind;
  // Confirmed or Paid Events they played in.
  shows: number;
  // Their shares of Paid Events.
  earned: number;
  // Their shares of Confirmed Events not yet Paid.
  expected: number;
}

// Both bounds are inclusive `YYYY-MM-DD` days.
export interface PeriodRange {
  from: string;
  to: string;
}

// The Project's default Split and the Roles it covers. Admin only.
export async function getDefaultSplit(pool: Pool, user: User, projectId: string): Promise<DefaultSplit> {
  await requirePermission(pool, user, projectId, "administer");
  const [rules, roles] = await Promise.all([defaultRules(pool, projectId), projectRoles(pool, projectId)]);
  return { rules, roles };
}

// Replaces the Project's default Split. Admin only.
export async function setDefaultSplit(
  pool: Pool,
  user: User,
  projectId: string,
  rules: SplitRule[],
): Promise<void> {
  await requirePermission(pool, user, projectId, "administer");
  await validateRules(pool, projectId, rules);
  await inTransaction(pool, async (client) => {
    await client.query("DELETE FROM project_split_rules WHERE project_id = $1", [projectId]);
    for (const r of rules) {
      await client.query(
        "INSERT INTO project_split_rules (project_id, role_id, kind, value) VALUES ($1, $2, $3, $4)",
        [projectId, r.roleId, r.kind, r.value],
      );
    }
  });
}

// Whether the Event has its own Split, and its rules if so. Admin only.
export async function getEventSplit(
  pool: Pool,
  user: User,
  projectId: string,
  eventId: string,
): Promise<{ source: "default" | "event"; rules: SplitRule[]; roles: SplitRole[] }> {
  await requirePermission(pool, user, projectId, "administer");
  await requireEvent(pool, projectId, eventId);
  const { source, rules } = await effectiveRules(pool, projectId, eventId);
  return { source, rules, roles: await projectRoles(pool, projectId) };
}

// Gives the Event its own Split in place of the default. Admin only.
export async function setEventSplit(
  pool: Pool,
  user: User,
  projectId: string,
  eventId: string,
  rules: SplitRule[],
): Promise<void> {
  await requirePermission(pool, user, projectId, "administer");
  await requireEvent(pool, projectId, eventId);
  await validateRules(pool, projectId, rules);
  await inTransaction(pool, async (client) => {
    await client.query("DELETE FROM event_splits WHERE event_id = $1", [eventId]);
    await client.query("INSERT INTO event_splits (event_id, project_id) VALUES ($1, $2)", [
      eventId,
      projectId,
    ]);
    for (const r of rules) {
      await client.query(
        `INSERT INTO event_split_rules (event_id, project_id, role_id, kind, value)
         VALUES ($1, $2, $3, $4, $5)`,
        [eventId, projectId, r.roleId, r.kind, r.value],
      );
    }
  });
}

// Takes the Event back to the Project's default Split. Admin only.
export async function clearEventSplit(
  pool: Pool,
  user: User,
  projectId: string,
  eventId: string,
): Promise<void> {
  await requirePermission(pool, user, projectId, "administer");
  await requireEvent(pool, projectId, eventId);
  await pool.query("DELETE FROM event_splits WHERE event_id = $1", [eventId]);
}

// The live Payout preview of an Event. Admins get the whole math and every
// share; everyone else only their own.
export async function getEventPayout(
  pool: Pool,
  user: User,
  projectId: string,
  eventId: string,
): Promise<EventPayout> {
  const permissions = await getPermissions(pool, user, projectId);
  await requireEvent(pool, projectId, eventId);
  const full = await previewEvent(pool, projectId, eventId);
  if (permissions.seeOthersPayoutSplits) return full;
  const mine = full.result.members.find((m) => m.userId === user.id);
  return { scope: "own", amount: mine ? mine.amount : null };
}

// Each Member's shows and shares of Confirmed and Paid Events in the period.
// Admin only: it holds everyone's amounts.
export async function listPersonTotals(
  pool: Pool,
  user: User,
  projectId: string,
  period: PeriodRange,
): Promise<PersonTotal[]> {
  await requirePermission(pool, user, projectId, "administer");
  if (!isDay(period.from) || !isDay(period.to)) {
    throw new ServiceError("invalid_input", "A period is a pair of YYYY-MM-DD days");
  }
  const { rows: members } = await pool.query<PersonTotal>(
    `SELECT u.id AS "userId", u.display_name AS "displayName", r.name AS "roleName", r.kind AS "roleKind",
       0 AS shows, 0 AS earned, 0 AS expected
     FROM memberships m JOIN users u ON u.id = m.user_id JOIN roles r ON r.id = m.role_id
     WHERE m.project_id = $1 ORDER BY lower(u.display_name), u.id`,
    [projectId],
  );
  const { rows: events } = await pool.query<{ id: string; status: "confirmed" | "paid" }>(
    `SELECT id, status FROM events
     WHERE project_id = $1 AND status IN ('confirmed', 'paid') AND date BETWEEN $2 AND $3`,
    [projectId, period.from, period.to],
  );
  for (const event of events) {
    const { result } = await previewEvent(pool, projectId, event.id);
    for (const share of result.members) {
      const person = members.find((m) => m.userId === share.userId)!;
      person.shows += 1;
      if (event.status === "paid") person.earned += share.amount;
      else person.expected += share.amount;
    }
  }
  return members;
}

const isDay = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

type Db = Pool | PoolClient;

async function defaultRules(db: Db, projectId: string): Promise<SplitRule[]> {
  const { rows } = await db.query<SplitRule>(
    `SELECT role_id AS "roleId", kind, value::float8 AS value
     FROM project_split_rules WHERE project_id = $1 ORDER BY role_id`,
    [projectId],
  );
  return rows;
}

async function effectiveRules(db: Db, projectId: string, eventId: string) {
  const { rows: own } = await db.query("SELECT 1 FROM event_splits WHERE event_id = $1", [eventId]);
  if (!own[0]) return { source: "default" as const, rules: await defaultRules(db, projectId) };
  const { rows } = await db.query<SplitRule>(
    `SELECT role_id AS "roleId", kind, value::float8 AS value
     FROM event_split_rules WHERE event_id = $1 ORDER BY role_id`,
    [eventId],
  );
  return { source: "event" as const, rules: rows };
}

async function projectRoles(db: Db, projectId: string): Promise<SplitRole[]> {
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
async function previewEvent(db: Db, projectId: string, eventId: string): Promise<FullPayout> {
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
    })),
    remainderRecipient: recipient,
  };
}

// Rules must be well-formed, one per Role of this Project, with percentages
// adding up to exactly 100% whenever there are any.
async function validateRules(db: Db, projectId: string, rules: SplitRule[]): Promise<void> {
  if (!Array.isArray(rules)) throw new ServiceError("invalid_input", "A Split is a list of rules");
  const seen = new Set<string>();
  let percentTotal = 0;
  let percentRules = 0;
  for (const rule of rules) {
    if (!rule || typeof rule.roleId !== "string" || !isUuid(rule.roleId)) {
      throw new ServiceError("invalid_input", "A Split rule needs a Role");
    }
    if (seen.has(rule.roleId)) throw new ServiceError("invalid_input", "A Role can have only one rule");
    seen.add(rule.roleId);
    if (!SPLIT_KINDS.includes(rule.kind)) throw new ServiceError("invalid_input", "Unknown kind of split");
    if (!Number.isSafeInteger(rule.value) || rule.value < 0) {
      throw new ServiceError("invalid_input", "A Split amount must be a whole, non-negative number");
    }
    if (rule.kind === "percentage") {
      if (rule.value > 10_000) throw new ServiceError("invalid_input", "A percentage can't pass 100%");
      percentTotal += rule.value;
      percentRules += 1;
    }
  }
  if (percentRules > 0 && percentTotal !== 10_000) {
    throw new ServiceError("invalid_input", "Percentages must add up to 100%");
  }
  const roles = new Set((await projectRoles(db, projectId)).map((r) => r.id));
  if (rules.some((r) => !roles.has(r.roleId))) {
    throw new ServiceError("not_found", "Role not found");
  }
}
