import type { Pool } from "pg";
import type { User } from "./accounts.ts";
import { ServiceError } from "./errors.ts";
import { requireEvent } from "./events.ts";
import { isUuid } from "./ids.ts";
import { EQUAL_SHARE, type MemberRule } from "./member-payout-math.ts";
import {
  defaultMemberRules,
  defaultRules,
  effectiveRules,
  eventMemberSettings,
  projectRoles,
  type Db,
  type FullPayout,
  type SplitRole,
} from "./payout-live.ts";
import type { SplitKind, SplitRule } from "./payout-math.ts";
import { eventPayout, syncSnapshot } from "./payout-snapshots.ts";
import { getPermissions, requirePermission, type RoleKind } from "./permissions.ts";
import { inTransaction } from "./transaction.ts";

export type { FullPayout, MemberRule, SplitKind, SplitRole, SplitRule };
export type { PayoutMember } from "./payout-live.ts";
export const SPLIT_KINDS = ["percentage", "role_fixed", "member_fixed"] as const;

export interface DefaultSplit {
  rules: SplitRule[];
  roles: SplitRole[];
}

// What everyone else gets: only their own share, null if they didn't play.
export interface OwnPayout {
  scope: "own";
  amount: number | null;
  // When the Event's Payout was frozen (it's Paid); null while it's live.
  frozenAt: string | null;
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

export const MEMBER_RULE_KINDS = ["equal", "fixed"] as const;

// A Member as the per-Member rules list them.
export interface MemberRuleRow {
  userId: string;
  displayName: string;
  roleName: string;
  roleKind: RoleKind;
  // Their Project default.
  rule: MemberRule;
}

export interface EventMemberRuleRow extends MemberRuleRow {
  // Replaces the default for this Event when set.
  override: MemberRule | null;
  // Signed amount added to their share for this Event only.
  ajuste: number;
}

async function memberRows(db: Db, projectId: string): Promise<Omit<MemberRuleRow, "rule">[]> {
  const { rows } = await db.query<Omit<MemberRuleRow, "rule">>(
    `SELECT u.id AS "userId", u.display_name AS "displayName", r.name AS "roleName", r.kind AS "roleKind"
     FROM memberships m JOIN users u ON u.id = m.user_id JOIN roles r ON r.id = m.role_id
     WHERE m.project_id = $1 ORDER BY lower(u.display_name), u.id`,
    [projectId],
  );
  return rows;
}

// Every Member's default rule in the Project. Admin only.
export async function getMemberRules(pool: Pool, user: User, projectId: string): Promise<MemberRuleRow[]> {
  await requirePermission(pool, user, projectId, "administer");
  const [members, defaults] = await Promise.all([memberRows(pool, projectId), defaultMemberRules(pool, projectId)]);
  return members.map((m) => ({ ...m, rule: defaults.get(m.userId) ?? EQUAL_SHARE }));
}

// Sets one Member's default rule: Equal share or a Fixed amount. Admin only.
export async function setMemberRule(
  pool: Pool,
  user: User,
  projectId: string,
  memberUserId: string,
  rule: MemberRule,
): Promise<void> {
  await requirePermission(pool, user, projectId, "administer");
  const clean = validateMemberRule(rule);
  await requireMember(pool, projectId, memberUserId);
  await pool.query(
    `INSERT INTO member_split_defaults (project_id, user_id, kind, value) VALUES ($1, $2, $3, $4)
     ON CONFLICT (project_id, user_id) DO UPDATE SET kind = excluded.kind, value = excluded.value`,
    [projectId, memberUserId, clean.kind, clean.value],
  );
}

// Every Member with their default, the Event's override of it and their Ajuste. Admin only.
export async function getEventMemberRules(
  pool: Pool,
  user: User,
  projectId: string,
  eventId: string,
): Promise<EventMemberRuleRow[]> {
  await requirePermission(pool, user, projectId, "administer");
  await requireEvent(pool, projectId, eventId);
  const [members, defaults, settings] = await Promise.all([
    memberRows(pool, projectId),
    defaultMemberRules(pool, projectId),
    eventMemberSettings(pool, eventId),
  ]);
  return members.map((m) => ({
    ...m,
    rule: defaults.get(m.userId) ?? EQUAL_SHARE,
    override: settings.get(m.userId)?.override ?? null,
    ajuste: settings.get(m.userId)?.ajuste ?? 0,
  }));
}

export interface EventMemberSettingInput {
  // Replaces the Member's default for this Event; null follows the default.
  override: MemberRule | null;
  // Signed whole Guaraníes added to their share; 0 for none.
  ajuste: number;
}

// Overrides one Member's rule and sets their Ajuste for one Event. Admin only.
export async function setEventMemberSetting(
  pool: Pool,
  user: User,
  projectId: string,
  eventId: string,
  memberUserId: string,
  input: EventMemberSettingInput,
): Promise<void> {
  await requirePermission(pool, user, projectId, "administer");
  const override = input.override === null ? null : validateMemberRule(input.override);
  if (!Number.isSafeInteger(input.ajuste)) {
    throw new ServiceError("invalid_input", "An Ajuste must be a whole amount of Guaraníes");
  }
  await requireEvent(pool, projectId, eventId);
  await requireMember(pool, projectId, memberUserId);
  await inTransaction(pool, async (client) => {
    if (!override && input.ajuste === 0) {
      await client.query("DELETE FROM event_member_settings WHERE event_id = $1 AND user_id = $2", [
        eventId,
        memberUserId,
      ]);
    } else {
      await client.query(
        `INSERT INTO event_member_settings (event_id, project_id, user_id, rule_kind, rule_value, ajuste)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (event_id, user_id) DO UPDATE
           SET rule_kind = excluded.rule_kind, rule_value = excluded.rule_value, ajuste = excluded.ajuste`,
        [eventId, projectId, memberUserId, override?.kind ?? null, override?.value ?? 0, input.ajuste],
      );
    }
    await syncSnapshot(client, projectId, eventId);
  });
}

function validateMemberRule(rule: MemberRule): MemberRule {
  if (!rule || !MEMBER_RULE_KINDS.includes(rule.kind)) {
    throw new ServiceError("invalid_input", "Unknown kind of payout rule");
  }
  if (rule.kind === "equal") return EQUAL_SHARE;
  if (!Number.isSafeInteger(rule.value) || rule.value < 0) {
    throw new ServiceError("invalid_input", "A fixed amount must be a whole, non-negative number");
  }
  return { kind: "fixed", value: rule.value };
}

async function requireMember(db: Db, projectId: string, userId: string): Promise<void> {
  const { rows } = isUuid(userId)
    ? await db.query("SELECT 1 FROM memberships WHERE project_id = $1 AND user_id = $2", [projectId, userId])
    : { rows: [] };
  if (!rows[0]) throw new ServiceError("not_found", "Member not found");
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
    await syncSnapshot(client, projectId, eventId);
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
  await inTransaction(pool, async (client) => {
    await client.query("DELETE FROM event_splits WHERE event_id = $1", [eventId]);
    await syncSnapshot(client, projectId, eventId);
  });
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
  const full = await eventPayout(pool, projectId, eventId);
  if (permissions.seeOthersPayoutSplits) return full;
  const mine = full.result.members.find((m) => m.userId === user.id);
  return { scope: "own", amount: mine ? mine.amount : null, frozenAt: full.frozenAt };
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
    const { result } = await eventPayout(pool, projectId, event.id);
    for (const share of result.members) {
      const person = members.find((m) => m.userId === share.userId);
      // A former Member keeps their share in the Paid Event, not in the roster.
      if (!person) continue;
      person.shows += 1;
      if (event.status === "paid") person.earned += share.amount;
      else person.expected += share.amount;
    }
  }
  return members;
}

export const isDay = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

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
