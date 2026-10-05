import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createTestDb, type TestDb } from "../../test/test-db.ts";
import { verifiedUser } from "../../test/users.ts";
import { addGuest, setAttending } from "./attendance.ts";
import { createEvent, updateEvent } from "./events.ts";
import { addExpense } from "./expenses.ts";
import { acceptInvitation, sendInvitations } from "./invitations.ts";
import { createProject } from "./projects.ts";
import { createRole, listRoles } from "./roles.ts";
import {
  getEventMemberRules,
  getEventPayout,
  getMemberRules,
  listPersonTotals,
  setEventMemberSetting,
  setMemberRule,
  type FullPayout,
} from "./splits.ts";

const EVENT = { name: "Casamiento Ríos", date: "2026-09-26", durationMinutes: 240, pay: 4_000_000 };
const VALID_ID = "00000000-0000-4000-8000-000000000000";

// A Project with its Owner (Admin Diego), two Members (Lucía, Rodrigo), a
// Roadie (Sofía) and an Event paying Gs. 4.000.000 with Gs. 500.000 of
// Expenses and one Guest at Gs. 350.000. Everyone is on Equal share.
async function band(db: TestDb, name: string) {
  const owner = await verifiedUser(db, `${name}-diego@example.com`);
  const project = await createProject(db.pool, owner, { name });
  const roles = await listRoles(db.pool, owner, project.id);
  const adminRole = roles.find((r) => r.kind === "admin")!;
  const memberRole = roles.find((r) => r.kind === "member")!;
  const roadieRole = await createRole(db.pool, owner, project.id, {
    name: "Roadie",
    toggles: { editRepertoireSetlistsEvents: false, removeMembers: false, seeTotalPayExpenses: false , manageBookings: false},
  });
  const hire = async (who: string, roleId: string) => {
    const user = await verifiedUser(db, `${name}-${who}@example.com`);
    const [{ invitation }] = await sendInvitations(db.pool, owner, project.id, [
      { email: user.email, roleId },
    ]);
    await acceptInvitation(db.pool, user, invitation.id);
    return user;
  };
  const lucia = await hire("lucia", memberRole.id);
  const rodrigo = await hire("rodrigo", memberRole.id);
  const sofia = await hire("sofia", roadieRole.id);
  const outsider = await verifiedUser(db, `${name}-outsider@example.com`);
  await createProject(db.pool, outsider, { name: `${name} rivals` });
  const event = await createEvent(db.pool, owner, project.id, EVENT);
  await addExpense(db.pool, owner, project.id, event.id, { name: "Van", amount: 500_000 });
  await addGuest(db.pool, owner, project.id, event.id, { name: "Nahuel", amount: 350_000 });
  return { owner, project, adminRole, memberRole, roadieRole, lucia, rodrigo, sofia, outsider, event };
}

const full = (p: Awaited<ReturnType<typeof getEventPayout>>): FullPayout => {
  assert.equal(p.scope, "full");
  return p as FullPayout;
};
const shares = (p: FullPayout) => Object.fromEntries(p.members!.map((m) => [m.displayName, m.amount]));
const FIXED = (value: number) => ({ kind: "fixed", value }) as const;
const EQUAL = { kind: "equal", value: 0 } as const;

describe("per-Member payout rules", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  const payout = async (b: Awaited<ReturnType<typeof band>>) =>
    full(await getEventPayout(db.pool, b.owner, b.project.id, b.event.id));

  it("splits the net after the Guest equally among attendees when nothing is configured", async () => {
    const b = await band(db, "plain");
    const p = await payout(b);
    assert.equal(p.net, 3_500_000);
    assert.equal(p.result.fixedTotal, 350_000);
    assert.equal(p.result.remainder, 3_150_000);
    assert.deepEqual(shares(p), {
      "plain-diego@example.com": 787_500,
      "plain-lucia@example.com": 787_500,
      "plain-rodrigo@example.com": 787_500,
      "plain-sofia@example.com": 787_500,
    });
    assert.equal(p.guests[0].amount, 350_000);
  });

  it("applies a Member's fixed default, Roles playing no part", async () => {
    const b = await band(db, "default");
    await setMemberRule(db.pool, b.owner, b.project.id, b.sofia.id, FIXED(300_000));
    const p = await payout(b);
    assert.deepEqual(p.members!.find((m) => m.userId === b.sofia.id)!.rule, FIXED(300_000));
    assert.equal(shares(p)["default-sofia@example.com"], 300_000);
    // 3.500.000 − 350.000 − 300.000 = 2.850.000 over three.
    assert.equal(shares(p)["default-lucia@example.com"], 950_000);
    const rules = await getMemberRules(db.pool, b.owner, b.project.id);
    assert.deepEqual(rules.find((r) => r.userId === b.sofia.id)!.rule, FIXED(300_000));
    // Back to an equal share.
    await setMemberRule(db.pool, b.owner, b.project.id, b.sofia.id, EQUAL);
    assert.equal(shares(await payout(b))["default-sofia@example.com"], 787_500);
  });

  it("lets an Event override one Member's rule and go back to the default", async () => {
    const b = await band(db, "override");
    await setMemberRule(db.pool, b.owner, b.project.id, b.sofia.id, FIXED(300_000));
    await setMemberRule(db.pool, b.owner, b.project.id, b.lucia.id, FIXED(100_000));
    // Sofía is on Equal share this Event, Rodrigo gets a fixed fee.
    await setEventMemberSetting(db.pool, b.owner, b.project.id, b.event.id, b.sofia.id, { override: EQUAL, ajuste: 0 });
    await setEventMemberSetting(db.pool, b.owner, b.project.id, b.event.id, b.rodrigo.id, { override: FIXED(200_000), ajuste: 0 });
    const p = await payout(b);
    assert.equal(p.members!.find((m) => m.userId === b.sofia.id)!.overridden, true);
    assert.equal(shares(p)["override-lucia@example.com"], 100_000);
    assert.equal(shares(p)["override-rodrigo@example.com"], 200_000);
    // 3.500.000 − 350.000 − 300.000 = 2.850.000 over Diego and Sofía.
    assert.equal(shares(p)["override-sofia@example.com"], 1_425_000);
    const rows = await getEventMemberRules(db.pool, b.owner, b.project.id, b.event.id);
    assert.deepEqual(rows.find((r) => r.userId === b.sofia.id)!.override, EQUAL);
    assert.deepEqual(rows.find((r) => r.userId === b.sofia.id)!.rule, FIXED(300_000));

    await setEventMemberSetting(db.pool, b.owner, b.project.id, b.event.id, b.sofia.id, { override: null, ajuste: 0 });
    assert.equal(shares(await payout(b))["override-sofia@example.com"], 300_000);
  });

  it("skips Members who didn't play, fixed or not", async () => {
    const b = await band(db, "absent");
    await setMemberRule(db.pool, b.owner, b.project.id, b.sofia.id, FIXED(300_000));
    await setAttending(db.pool, b.owner, b.project.id, b.event.id, b.sofia.id, false);
    await setAttending(db.pool, b.owner, b.project.id, b.event.id, b.rodrigo.id, false);
    const p = await payout(b);
    assert.equal(p.result.fixedTotal, 350_000);
    assert.equal(p.members!.length, 2);
    assert.equal(shares(p)["absent-diego@example.com"], 1_575_000);
  });

  it("adds an Ajuste to a share, funded from the pot, and keeps the totals whole", async () => {
    const b = await band(db, "ajuste");
    await setEventMemberSetting(db.pool, b.owner, b.project.id, b.event.id, b.lucia.id, { override: null, ajuste: 100_000 });
    await setEventMemberSetting(db.pool, b.owner, b.project.id, b.event.id, b.rodrigo.id, { override: null, ajuste: -40_000 });
    const p = await payout(b);
    assert.equal(p.result.adjustmentsTotal, 60_000);
    // 3.150.000 − 60.000 = 3.090.000 over four = 772.500.
    assert.equal(shares(p)["ajuste-lucia@example.com"], 872_500);
    assert.equal(shares(p)["ajuste-rodrigo@example.com"], 732_500);
    const total =
      p.members!.reduce((sum, m) => sum + m.amount, 0) + p.guests.reduce((sum, g) => sum + g.amount, 0);
    assert.equal(total + p.expensesTotal, p.pay);
    // Zero Ajuste and no override clears the row.
    await setEventMemberSetting(db.pool, b.owner, b.project.id, b.event.id, b.lucia.id, { override: null, ajuste: 0 });
    const { rowCount } = await db.pool.query("SELECT 1 FROM event_member_settings WHERE user_id = $1", [b.lucia.id]);
    assert.equal(rowCount, 0);
  });

  it("flags an over-allocated Event and pays nothing", async () => {
    const b = await band(db, "over");
    await setMemberRule(db.pool, b.owner, b.project.id, b.sofia.id, FIXED(3_300_000));
    const p = await payout(b);
    assert.equal(p.result.overAllocated, true);
    assert.equal(p.result.shortfall, 150_000);
    assert.ok(Object.values(shares(p)).every((a) => a === 0));
    assert.equal(p.guests[0].amount, 0);
  });

  it("counts Ajustes toward over-allocation", async () => {
    const b = await band(db, "ajover");
    await setEventMemberSetting(db.pool, b.owner, b.project.id, b.event.id, b.lucia.id, { override: null, ajuste: 3_200_000 });
    const p = await payout(b);
    assert.equal(p.result.overAllocated, true);
    assert.equal(p.result.shortfall, 50_000);
    assert.ok(Object.values(shares(p)).every((a) => a === 0));
  });

  it("sets the band fund aside first", async () => {
    const b = await band(db, "fund");
    await updateEvent(db.pool, b.owner, b.project.id, b.event.id, { bandFundBasisPoints: 1000 });
    const p = await payout(b);
    assert.equal(p.result.fund, 350_000);
    // 3.500.000 − 350.000 − 350.000 = 2.800.000 over four.
    assert.equal(shares(p)["fund-lucia@example.com"], 700_000);
  });

  it("validates rules and Members", async () => {
    const b = await band(db, "bad");
    const set = (rule: object, id = b.sofia.id) => setMemberRule(db.pool, b.owner, b.project.id, id, rule as never);
    await assert.rejects(set({ kind: "fixed", value: -1 }), { code: "invalid_input" });
    await assert.rejects(set({ kind: "fixed", value: 1.5 }), { code: "invalid_input" });
    await assert.rejects(set({ kind: "percentage", value: 10 }), { code: "invalid_input" });
    await assert.rejects(set(EQUAL, VALID_ID), { code: "not_found" });
    await assert.rejects(set(EQUAL, "nope"), { code: "not_found" });
    // Someone from another Project is not a Member of this one.
    await assert.rejects(set(EQUAL, b.outsider.id), { code: "not_found" });
    await assert.rejects(
      setEventMemberSetting(db.pool, b.owner, b.project.id, b.event.id, b.sofia.id, { override: null, ajuste: 1.5 }),
      { code: "invalid_input" },
    );
    await assert.rejects(
      setEventMemberSetting(db.pool, b.owner, b.project.id, VALID_ID, b.sofia.id, { override: null, ajuste: 1 }),
      { code: "not_found" },
    );
  });

  it("lets only Admins edit or read rules", async () => {
    const b = await band(db, "perm");
    for (const who of [b.lucia, b.sofia]) {
      await assert.rejects(setMemberRule(db.pool, who, b.project.id, b.sofia.id, EQUAL), { code: "forbidden" });
      await assert.rejects(getMemberRules(db.pool, who, b.project.id), { code: "forbidden" });
      await assert.rejects(
        setEventMemberSetting(db.pool, who, b.project.id, b.event.id, b.sofia.id, { override: null, ajuste: 1 }),
        { code: "forbidden" },
      );
      await assert.rejects(getEventMemberRules(db.pool, who, b.project.id, b.event.id), { code: "forbidden" });
      await assert.rejects(
        listPersonTotals(db.pool, who, b.project.id, { from: "2026-09-01", to: "2026-09-30" }),
        { code: "forbidden" },
      );
    }
    await assert.rejects(setMemberRule(db.pool, b.outsider, b.project.id, b.sofia.id, EQUAL), { code: "not_found" });
    await assert.rejects(getEventPayout(db.pool, b.outsider, b.project.id, b.event.id), { code: "not_found" });
  });

  it("shows Members, whatever their Role, only their own share", async () => {
    const b = await band(db, "own");
    await setMemberRule(db.pool, b.owner, b.project.id, b.sofia.id, FIXED(300_000));
    assert.deepEqual(await getEventPayout(db.pool, b.lucia, b.project.id, b.event.id), {
      scope: "own",
      amount: 950_000,
      frozenAt: null,
    });
    assert.deepEqual(await getEventPayout(db.pool, b.sofia, b.project.id, b.event.id), {
      scope: "own",
      amount: 300_000,
      frozenAt: null,
    });
    await setAttending(db.pool, b.owner, b.project.id, b.event.id, b.rodrigo.id, false);
    assert.deepEqual(await getEventPayout(db.pool, b.rodrigo, b.project.id, b.event.id), {
      scope: "own",
      amount: null,
      frozenAt: null,
    });
    await assert.rejects(getEventPayout(db.pool, b.owner, b.project.id, VALID_ID), { code: "not_found" });
    await assert.rejects(getEventPayout(db.pool, b.owner, b.project.id, "nope"), { code: "not_found" });
  });

  it("drops a leaving Member's rules with their Membership", async () => {
    const b = await band(db, "leave");
    await setMemberRule(db.pool, b.owner, b.project.id, b.sofia.id, FIXED(1));
    await setEventMemberSetting(db.pool, b.owner, b.project.id, b.event.id, b.sofia.id, { override: null, ajuste: 5 });
    await db.pool.query("DELETE FROM memberships WHERE project_id = $1 AND user_id = $2", [b.project.id, b.sofia.id]);
    const { rowCount } = await db.pool.query("SELECT 1 FROM member_split_defaults WHERE user_id = $1", [b.sofia.id]);
    assert.equal(rowCount, 0);
    assert.equal((await payout(b)).members!.length, 3);
  });

  it("totals each person's shows, earned (Paid) and expected (Confirmed) in a period", async () => {
    const b = await band(db, "totals");
    await setMemberRule(db.pool, b.owner, b.project.id, b.lucia.id, FIXED(100_000));
    await setMemberRule(db.pool, b.owner, b.project.id, b.rodrigo.id, FIXED(100_000));
    const mk = (date: string, status: "pending" | "confirmed" | "paid" | "cancelled") =>
      createEvent(db.pool, b.owner, b.project.id, { ...EVENT, name: status, date, status });
    await mk("2026-09-10", "paid");
    const confirmed = await mk("2026-09-12", "confirmed");
    await mk("2026-09-14", "pending");
    await mk("2026-09-15", "cancelled");
    await mk("2026-10-01", "paid");
    await setAttending(db.pool, b.owner, b.project.id, confirmed.id, b.rodrigo.id, false);

    const rows = await listPersonTotals(db.pool, b.owner, b.project.id, { from: "2026-09-01", to: "2026-09-30" });
    const of = (user: { id: string }) => rows.find((r) => r.userId === user.id)!;
    assert.deepEqual(
      { shows: of(b.lucia).shows, earned: of(b.lucia).earned, expected: of(b.lucia).expected },
      { shows: 2, earned: 100_000, expected: 100_000 },
    );
    assert.deepEqual(
      { shows: of(b.rodrigo).shows, earned: of(b.rodrigo).earned, expected: of(b.rodrigo).expected },
      { shows: 1, earned: 100_000, expected: 0 },
    );
    assert.equal(of(b.lucia).roleName, "Member");
    await assert.rejects(
      listPersonTotals(db.pool, b.owner, b.project.id, { from: "x", to: "y" }),
      { code: "invalid_input" },
    );
  });

  it("follows later pay edits live", async () => {
    const b = await band(db, "live");
    await updateEvent(db.pool, b.owner, b.project.id, b.event.id, { pay: 1_000_000 });
    assert.equal((await payout(b)).net, 500_000);
  });
});
