import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createTestDb, type TestDb } from "../../test/test-db.ts";
import { verifiedUser } from "../../test/users.ts";
import { addGuest, setAttending } from "./attendance.ts";
import { createEvent, updateEvent } from "./events.ts";
import { addExpense } from "./expenses.ts";
import { acceptInvitation, sendInvitations } from "./invitations.ts";
import { createProject } from "./projects.ts";
import { createRole, deleteRole, listRoles } from "./roles.ts";
import {
  clearEventSplit,
  getDefaultSplit,
  getEventPayout,
  getEventSplit,
  listPersonTotals,
  setDefaultSplit,
  setEventSplit,
  type FullPayout,
} from "./splits.ts";

const EVENT = { name: "Casamiento Ríos", date: "2026-09-26", durationMinutes: 240, pay: 4_000_000 };
const VALID_ID = "00000000-0000-4000-8000-000000000000";

// A Project with its Owner (Admin Diego), two Members (Lucía, Rodrigo), a
// Roadie (Sofía) and an Event paying Gs. 4.000.000 with Gs. 500.000 of
// Expenses and one Guest at Gs. 350.000.
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
  const split = [
    { roleId: adminRole.id, kind: "percentage", value: 2500 },
    { roleId: memberRole.id, kind: "percentage", value: 7500 },
    { roleId: roadieRole.id, kind: "member_fixed", value: 300_000 },
  ] as const;
  return { owner, project, adminRole, memberRole, roadieRole, lucia, rodrigo, sofia, outsider, event, split: [...split] };
}

const full = (p: Awaited<ReturnType<typeof getEventPayout>>): FullPayout => {
  assert.equal(p.scope, "full");
  return p as FullPayout;
};
const shares = (p: FullPayout) =>
  Object.fromEntries(p.roles.flatMap((r) => r.attendees.map((a) => [a.displayName, a.amount])));

describe("payout splits", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("previews fixed amounts first, then percentages among those who played", async () => {
    const b = await band(db, "preview");
    await setDefaultSplit(db.pool, b.owner, b.project.id, b.split);
    const p = full(await getEventPayout(db.pool, b.owner, b.project.id, b.event.id));
    assert.equal(p.source, "default");
    assert.equal(p.net, 3_500_000);
    assert.equal(p.result.fixedTotal, 650_000);
    assert.equal(p.result.remainder, 2_850_000);
    assert.deepEqual(shares(p), {
      "preview-diego@example.com": 712_500,
      "preview-lucia@example.com": 1_068_750,
      "preview-rodrigo@example.com": 1_068_750,
      "preview-sofia@example.com": 300_000,
    });
    assert.deepEqual(p.guests, [{ id: p.guests[0].id, name: "Nahuel", amount: 350_000, fixedAmount: 350_000 }]);
  });

  it("shares a skipped Role's percentage when its Members didn't play", async () => {
    const b = await band(db, "absent");
    await setDefaultSplit(db.pool, b.owner, b.project.id, b.split);
    await setAttending(db.pool, b.owner, b.project.id, b.event.id, b.lucia.id, false);
    await setAttending(db.pool, b.owner, b.project.id, b.event.id, b.rodrigo.id, false);
    await setAttending(db.pool, b.owner, b.project.id, b.event.id, b.sofia.id, false);
    const p = full(await getEventPayout(db.pool, b.owner, b.project.id, b.event.id));
    // Only the Admin plays: fixed amounts of skipped Roles aren't paid, the Guest still is.
    assert.equal(p.result.fixedTotal, 350_000);
    assert.equal(p.roles.filter((r) => r.skipped).length, 2);
    assert.equal(shares(p)["absent-diego@example.com"], 3_150_000);
  });

  it("flags an over-allocated Event and pays nothing", async () => {
    const b = await band(db, "over");
    await setDefaultSplit(db.pool, b.owner, b.project.id, b.split);
    await addExpense(db.pool, b.owner, b.project.id, b.event.id, { name: "Sound", amount: 3_000_000 });
    const p = full(await getEventPayout(db.pool, b.owner, b.project.id, b.event.id));
    assert.equal(p.result.overAllocated, true);
    assert.equal(p.result.shortfall, 150_000);
    assert.ok(Object.values(shares(p)).every((a) => a === 0));
  });

  it("lets an Event override the default and go back to it", async () => {
    const b = await band(db, "override");
    await setDefaultSplit(db.pool, b.owner, b.project.id, b.split);
    await setEventSplit(db.pool, b.owner, b.project.id, b.event.id, [
      { roleId: b.memberRole.id, kind: "role_fixed", value: 1_000_000 },
      { roleId: b.adminRole.id, kind: "percentage", value: 10_000 },
    ]);
    const own = full(await getEventPayout(db.pool, b.owner, b.project.id, b.event.id));
    assert.equal(own.source, "event");
    assert.equal(shares(own)["override-lucia@example.com"], 500_000);
    assert.equal(shares(own)["override-sofia@example.com"] ?? 0, 0);
    assert.equal((await getEventSplit(db.pool, b.owner, b.project.id, b.event.id)).source, "event");

    await clearEventSplit(db.pool, b.owner, b.project.id, b.event.id);
    const back = full(await getEventPayout(db.pool, b.owner, b.project.id, b.event.id));
    assert.equal(back.source, "default");
    assert.equal(shares(back)["override-sofia@example.com"], 300_000);
  });

  it("keeps an Event's override when the default changes, and removes it with the Event", async () => {
    const b = await band(db, "sticky");
    await setEventSplit(db.pool, b.owner, b.project.id, b.event.id, [
      { roleId: b.adminRole.id, kind: "percentage", value: 10_000 },
    ]);
    await setDefaultSplit(db.pool, b.owner, b.project.id, b.split);
    const p = full(await getEventPayout(db.pool, b.owner, b.project.id, b.event.id));
    assert.equal(p.source, "event");
    assert.equal(shares(p)["sticky-diego@example.com"], 3_150_000);
  });

  it("requires percentages to add up to 100%", async () => {
    const b = await band(db, "pct");
    await assert.rejects(
      setDefaultSplit(db.pool, b.owner, b.project.id, [
        { roleId: b.adminRole.id, kind: "percentage", value: 2500 },
        { roleId: b.memberRole.id, kind: "percentage", value: 7000 },
      ]),
      { code: "invalid_input" },
    );
    await assert.rejects(
      setEventSplit(db.pool, b.owner, b.project.id, b.event.id, [
        { roleId: b.adminRole.id, kind: "percentage", value: 9000 },
      ]),
      { code: "invalid_input" },
    );
    // Fixed-only splits have no percentages to add up.
    await setDefaultSplit(db.pool, b.owner, b.project.id, [
      { roleId: b.roadieRole.id, kind: "member_fixed", value: 100_000 },
    ]);
  });

  it("rejects malformed rules", async () => {
    const b = await band(db, "bad");
    const bad = (rule: object) =>
      setDefaultSplit(db.pool, b.owner, b.project.id, [rule as never]);
    await assert.rejects(bad({ roleId: b.roadieRole.id, kind: "role_fixed", value: -1 }), { code: "invalid_input" });
    await assert.rejects(bad({ roleId: b.roadieRole.id, kind: "role_fixed", value: 1.5 }), { code: "invalid_input" });
    await assert.rejects(bad({ roleId: b.roadieRole.id, kind: "weekly", value: 1 }), { code: "invalid_input" });
    await assert.rejects(bad({ roleId: "nope", kind: "role_fixed", value: 1 }), { code: "invalid_input" });
    await assert.rejects(bad({ roleId: VALID_ID, kind: "role_fixed", value: 1 }), { code: "not_found" });
    await assert.rejects(
      setDefaultSplit(db.pool, b.owner, b.project.id, [
        { roleId: b.roadieRole.id, kind: "role_fixed", value: 1 },
        { roleId: b.roadieRole.id, kind: "role_fixed", value: 2 },
      ]),
      { code: "invalid_input" },
    );
    // Another Project's Role is not this Project's.
    const other = await band(db, "bad-other");
    await assert.rejects(
      setDefaultSplit(db.pool, b.owner, b.project.id, [
        { roleId: other.roadieRole.id, kind: "role_fixed", value: 1 },
      ]),
      { code: "not_found" },
    );
  });

  it("lets only Admins edit or read splits", async () => {
    const b = await band(db, "perm");
    for (const who of [b.lucia, b.sofia]) {
      await assert.rejects(setDefaultSplit(db.pool, who, b.project.id, []), { code: "forbidden" });
      await assert.rejects(getDefaultSplit(db.pool, who, b.project.id), { code: "forbidden" });
      await assert.rejects(setEventSplit(db.pool, who, b.project.id, b.event.id, []), { code: "forbidden" });
      await assert.rejects(clearEventSplit(db.pool, who, b.project.id, b.event.id), { code: "forbidden" });
      await assert.rejects(getEventSplit(db.pool, who, b.project.id, b.event.id), { code: "forbidden" });
      await assert.rejects(
        listPersonTotals(db.pool, who, b.project.id, { from: "2026-09-01", to: "2026-09-30" }),
        { code: "forbidden" },
      );
    }
    await assert.rejects(setDefaultSplit(db.pool, b.outsider, b.project.id, []), { code: "not_found" });
    await assert.rejects(getEventPayout(db.pool, b.outsider, b.project.id, b.event.id), { code: "not_found" });
  });

  it("shows Members, whatever their Role, only their own share", async () => {
    const b = await band(db, "own");
    await setDefaultSplit(db.pool, b.owner, b.project.id, b.split);
    assert.deepEqual(await getEventPayout(db.pool, b.lucia, b.project.id, b.event.id), {
      scope: "own",
      amount: 1_068_750,
      frozenAt: null,
    });
    // A Role that can't see pay still gets their own share, and nothing else.
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
  });

  it("drops a deleted Role's rules and fails on a missing Event", async () => {
    const b = await band(db, "gone");
    const extra = await createRole(db.pool, b.owner, b.project.id, {
      name: "Sonidista",
      toggles: { editRepertoireSetlistsEvents: false, removeMembers: false, seeTotalPayExpenses: false , manageBookings: false},
    });
    await setDefaultSplit(db.pool, b.owner, b.project.id, [
      { roleId: extra.id, kind: "role_fixed", value: 1 },
    ]);
    await setEventSplit(db.pool, b.owner, b.project.id, b.event.id, [
      { roleId: extra.id, kind: "role_fixed", value: 1 },
    ]);
    await deleteRole(db.pool, b.owner, b.project.id, extra.id);
    assert.deepEqual((await getDefaultSplit(db.pool, b.owner, b.project.id)).rules, []);
    assert.deepEqual((await getEventSplit(db.pool, b.owner, b.project.id, b.event.id)).rules, []);
    await assert.rejects(getEventPayout(db.pool, b.owner, b.project.id, VALID_ID), { code: "not_found" });
    await assert.rejects(getEventPayout(db.pool, b.owner, b.project.id, "nope"), { code: "not_found" });
  });

  it("totals each person's shows, earned (Paid) and expected (Confirmed) in a period", async () => {
    const b = await band(db, "totals");
    await setDefaultSplit(db.pool, b.owner, b.project.id, [
      { roleId: b.memberRole.id, kind: "member_fixed", value: 100_000 },
    ]);
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
    await setDefaultSplit(db.pool, b.owner, b.project.id, [
      { roleId: b.adminRole.id, kind: "percentage", value: 10_000 },
    ]);
    await updateEvent(db.pool, b.owner, b.project.id, b.event.id, { pay: 1_000_000 });
    const p = full(await getEventPayout(db.pool, b.owner, b.project.id, b.event.id));
    assert.equal(p.net, 500_000);
  });
});
