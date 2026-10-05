import type { Pool, PoolClient } from "pg";
import { computeMemberPayout, EQUAL_SHARE, type MemberPayoutResult, type MemberRule } from "./member-payout-math.ts";
import type { SplitKind, SplitRule } from "./payout-math.ts";
import type { RoleKind } from "./permissions.ts";

// A Role as the Split sees it.
export interface SplitRole {
  id: string;
  name: string;
  kind: RoleKind;
  // Members holding it now.
  memberCount: number;
}

// One attending Member's line of a Payout: the rule that applied and what they get.
export interface PayoutMember {
  userId: string;
  displayName: string;
  rule: MemberRule;
  // Whether the rule is the Event's override of the Member's default.
  overridden: boolean;
  // Signed amount added to their share for this Event only.
  ajuste: number;
  amount: number;
}

// An Event's Payout Split as an Admin sees it: the math and everyone's share.
// Snapshots frozen before per-Member rules (ADR 0003) lack `members` and carry
// the Role-based `source`, `rules` and `roles` instead.
export interface FullPayout {
  scope: "full";
  // When this Payout was frozen (the Event is Paid); null while it's a live preview.
  frozenAt: string | null;
  pay: number;
  expensesTotal: number;
  net: number;
  // The Event's band fund share of the net, in basis points.
  fundBasisPoints: number;
  // Expenses by category, in a stable order; only those with something spent.
  categories: { category: string; amount: number }[];
  result: MemberPayoutResult;
  // Who played and what each gets, in a stable order.
  members?: PayoutMember[];
  guests: { id: string; name: string; amount: number; fixedAmount: number }[];
  // Whoever takes what rounding leaves over.
  remainderRecipient: string | null;
  // Legacy Role-based snapshots only.
  source?: "default" | "event";
  rules?: SplitRule[];
  roles?: {
    roleId: string;
    name: string;
    roleKind: RoleKind;
    kind: SplitKind;
    value: number;
    skipped: boolean;
    amount: number;
    attendees: { userId: string; displayName: string; amount: number }[];
  }[];
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

// Each Member's rule in the Project (no row: Equal share).
export async function defaultMemberRules(db: Db, projectId: string): Promise<Map<string, MemberRule>> {
  const { rows } = await db.query<{ userId: string; kind: MemberRule["kind"]; value: number }>(
    `SELECT user_id AS "userId", kind, value::float8 AS value FROM member_split_defaults WHERE project_id = $1`,
    [projectId],
  );
  return new Map(rows.map((r) => [r.userId, { kind: r.kind, value: r.value }]));
}

export interface EventMemberSetting {
  // Replaces the Member's default when set.
  override: MemberRule | null;
  ajuste: number;
}

export async function eventMemberSettings(
  db: Db,
  eventId: string,
): Promise<Map<string, EventMemberSetting>> {
  const { rows } = await db.query<{
    userId: string;
    kind: MemberRule["kind"] | null;
    value: number;
    ajuste: number;
  }>(
    `SELECT user_id AS "userId", rule_kind AS kind, rule_value::float8 AS value, ajuste::float8 AS ajuste
     FROM event_member_settings WHERE event_id = $1`,
    [eventId],
  );
  return new Map(
    rows.map((r) => [r.userId, { override: r.kind ? { kind: r.kind, value: r.value } : null, ajuste: r.ajuste }]),
  );
}

// Computes an Event's Split from its Attendance, Guests, Expenses and the
// Members' rules, as they are now.
export async function livePayout(db: Db, projectId: string, eventId: string): Promise<FullPayout> {
  const [defaults, settings] = await Promise.all([defaultMemberRules(db, projectId), eventMemberSettings(db, eventId)]);
  const { rows: events } = await db.query<{ pay: number; expensesTotal: number; ownerId: string; fundBasisPoints: number }>(
    `SELECT e.pay::float8 AS pay, p.owner_id AS "ownerId", e.band_fund_basis_points AS "fundBasisPoints",
       (SELECT coalesce(sum(x.amount), 0)::float8 FROM event_expenses x WHERE x.event_id = e.id) AS "expensesTotal"
     FROM events e JOIN projects p ON p.id = e.project_id WHERE e.id = $1`,
    [eventId],
  );
  const { pay, expensesTotal, ownerId, fundBasisPoints } = events[0];
  const { rows: categories } = await db.query<{ category: string; amount: number }>(
    `SELECT category, sum(amount)::float8 AS amount FROM event_expenses
     WHERE event_id = $1 GROUP BY category ORDER BY min(created_at)`,
    [eventId],
  );
  const { rows: people } = await db.query<{ userId: string; displayName: string }>(
    `SELECT u.id AS "userId", u.display_name AS "displayName"
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
  const attending = people.map((p) => {
    const setting = settings.get(p.userId);
    const rule = setting?.override ?? defaults.get(p.userId) ?? EQUAL_SHARE;
    return { ...p, rule, overridden: !!setting?.override, ajuste: setting?.ajuste ?? 0 };
  });
  // The Owner takes the rounding; if they're not on an Equal share, the first who is.
  const equal = attending.filter((a) => a.rule.kind === "equal");
  const recipient = (equal.find((a) => a.userId === ownerId) ?? equal[0])?.userId ?? null;
  const net = pay - expensesTotal;
  const result = computeMemberPayout({ net, fundBasisPoints, attendees: attending, guests, remainderRecipient: recipient });
  return {
    scope: "full",
    frozenAt: null,
    pay,
    expensesTotal,
    net,
    fundBasisPoints,
    categories,
    result,
    members: attending.map((a) => ({
      userId: a.userId,
      displayName: a.displayName,
      rule: a.rule,
      overridden: a.overridden,
      ajuste: a.ajuste,
      amount: result.members.find((m) => m.userId === a.userId)!.amount,
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
