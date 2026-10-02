import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createTestDb, type TestDb } from "../../test/test-db.ts";
import { verifiedUser } from "../../test/users.ts";
import { addGuest, getAttendance, setAttending } from "./attendance.ts";
import { createEvent, updateEvent } from "./events.ts";
import { addExpense } from "./expenses.ts";
import { acceptInvitation, sendInvitations } from "./invitations.ts";
import { createProject } from "./projects.ts";
import { changeMemberRole, listRoles } from "./roles.ts";
import {
  getEventPayout,
  listPersonTotals,
  setDefaultSplit,
  setEventSplit,
  type FullPayout,
} from "./splits.ts";

const EVENT = { name: "Casamiento Ríos", date: "2026-09-26", durationMinutes: 240, pay: 4_000_000 };

// Admin Diego (Owner), Members Lucía and Rodrigo; default split gives Admins
// 25% and Members 75% of the net. Gs. 500.000 of Expenses, so net is 3.500.000.
async function band(db: TestDb, name: string) {
  const owner = await verifiedUser(db, `${name}-diego@example.com`);
  const project = await createProject(db.pool, owner, { name });
  const roles = await listRoles(db.pool, owner, project.id);
  const adminRole = roles.find((r) => r.kind === "admin")!;
  const memberRole = roles.find((r) => r.kind === "member")!;
  const hire = async (who: string) => {
    const user = await verifiedUser(db, `${name}-${who}@example.com`);
    const [{ invitation }] = await sendInvitations(db.pool, owner, project.id, [
      { email: user.email, roleId: memberRole.id },
    ]);
    await acceptInvitation(db.pool, user, invitation.id);
    return user;
  };
  const lucia = await hire("lucia");
  const rodrigo = await hire("rodrigo");
  await setDefaultSplit(db.pool, owner, project.id, [
    { roleId: adminRole.id, kind: "percentage", value: 2500 },
    { roleId: memberRole.id, kind: "percentage", value: 7500 },
  ]);
  const event = await createEvent(db.pool, owner, project.id, EVENT);
  await addExpense(db.pool, owner, project.id, event.id, { name: "Van", amount: 500_000 });
  const payout = async () => {
    const p = await getEventPayout(db.pool, owner, project.id, event.id);
    assert.equal(p.scope, "full");
    return p as FullPayout;
  };
  const status = (s: "pending" | "confirmed" | "paid" | "cancelled") =>
    updateEvent(db.pool, owner, project.id, event.id, { status: s });
  const shares = async () =>
    Object.fromEntries((await payout()).roles.flatMap((r) => r.attendees.map((a) => [a.displayName, a.amount])));
  return { owner, project, adminRole, memberRole, lucia, rodrigo, event, payout, status, shares };
}

describe("Paid snapshot", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("is live until the Event becomes Paid, and says it isn't frozen", async () => {
    const b = await band(db, "live");
    await b.status("confirmed");
    assert.equal((await b.payout()).frozenAt, null);
  });

  it("freezes the amounts when the Event becomes Paid", async () => {
    const b = await band(db, "freeze");
    const live = await b.shares();
    await b.status("paid");
    const p = await b.payout();
    assert.ok(p.frozenAt);
    assert.deepEqual(await b.shares(), live);
  });

  it("ignores later Role, Membership and default-split changes", async () => {
    const b = await band(db, "later");
    await b.status("paid");
    const frozen = await b.shares();
    await changeMemberRole(db.pool, b.owner, b.project.id, b.lucia.id, b.adminRole.id);
    await setDefaultSplit(db.pool, b.owner, b.project.id, [
      { roleId: b.adminRole.id, kind: "percentage", value: 10_000 },
    ]);
    const newcomer = await verifiedUser(db, "later-newcomer@example.com");
    const [{ invitation }] = await sendInvitations(db.pool, b.owner, b.project.id, [
      { email: newcomer.email, roleId: b.memberRole.id },
    ]);
    await acceptInvitation(db.pool, newcomer, invitation.id);
    assert.deepEqual(await b.shares(), frozen);
    const attendance = await getAttendance(db.pool, b.owner, b.project.id, b.event.id);
    assert.equal(attendance.members.length, 3);
    assert.ok(attendance.members.every((m) => m.attending));
  });

  it("keeps a removed Member's past share and attribution", async () => {
    const b = await band(db, "removed");
    await b.status("paid");
    const frozen = await b.shares();
    assert.ok(frozen[b.rodrigo.displayName] > 0);
    await db.pool.query("DELETE FROM memberships WHERE project_id = $1 AND user_id = $2", [
      b.project.id,
      b.rodrigo.id,
    ]);
    assert.deepEqual(await b.shares(), frozen);
    const attendance = await getAttendance(db.pool, b.owner, b.project.id, b.event.id);
    assert.ok(attendance.members.some((m) => m.userId === b.rodrigo.id && m.attending));
    // The period totals list current Members only, and don't trip on them.
    const totals = await listPersonTotals(db.pool, b.owner, b.project.id, {
      from: "2026-09-01",
      to: "2026-09-30",
    });
    assert.ok(!totals.some((t) => t.userId === b.rodrigo.id));
  });

  it("makes the numbers live again when leaving Paid", async () => {
    const b = await band(db, "unfreeze");
    await b.status("paid");
    await setDefaultSplit(db.pool, b.owner, b.project.id, [
      { roleId: b.adminRole.id, kind: "percentage", value: 10_000 },
    ]);
    assert.ok((await b.shares())[b.lucia.displayName] > 0);
    await b.status("confirmed");
    const p = await b.payout();
    assert.equal(p.frozenAt, null);
    assert.equal((await b.shares())[b.lucia.displayName], undefined);
  });

  it("takes a new snapshot when returning to Paid", async () => {
    const b = await band(db, "return");
    await b.status("paid");
    await b.status("confirmed");
    await setDefaultSplit(db.pool, b.owner, b.project.id, [
      { roleId: b.adminRole.id, kind: "percentage", value: 10_000 },
    ]);
    await b.status("paid");
    assert.equal((await b.shares())[b.lucia.displayName], undefined);
    assert.equal((await b.shares())[b.owner.displayName], 3_500_000);
  });

  it("re-freezes when a Paid Event's split or Attendance is edited", async () => {
    const b = await band(db, "refreeze");
    await b.status("paid");
    await setAttending(db.pool, b.owner, b.project.id, b.event.id, b.rodrigo.id, false);
    let shares = await b.shares();
    assert.equal(shares[b.rodrigo.displayName], undefined);
    assert.equal(shares[b.lucia.displayName], 2_625_000);
    await setEventSplit(db.pool, b.owner, b.project.id, b.event.id, [
      { roleId: b.memberRole.id, kind: "percentage", value: 10_000 },
    ]);
    shares = await b.shares();
    assert.equal(shares[b.lucia.displayName], 3_500_000);
    await addGuest(db.pool, b.owner, b.project.id, b.event.id, { name: "Nahuel", amount: 350_000 });
    const p = await b.payout();
    assert.equal(p.guests[0].amount, 350_000);
    // Later default-split changes still don't reach it.
    await setDefaultSplit(db.pool, b.owner, b.project.id, [
      { roleId: b.adminRole.id, kind: "percentage", value: 10_000 },
    ]);
    assert.equal((await b.shares())[b.lucia.displayName], 3_150_000);
  });

  it("re-freezes when a Paid Event's pay or Expenses change", async () => {
    const b = await band(db, "money");
    await b.status("paid");
    await updateEvent(db.pool, b.owner, b.project.id, b.event.id, { pay: 1_000_000 });
    assert.equal((await b.payout()).net, 500_000);
    await addExpense(db.pool, b.owner, b.project.id, b.event.id, { name: "Luz", amount: 100_000 });
    assert.equal((await b.payout()).net, 400_000);
  });

  it("shows Members their own frozen share only", async () => {
    const b = await band(db, "own");
    await b.status("paid");
    const own = await getEventPayout(db.pool, b.lucia, b.project.id, b.event.id);
    assert.deepEqual(own, { scope: "own", amount: 1_312_500, frozenAt: (await b.payout()).frozenAt });
  });

  it("counts a Paid Event's frozen amounts as earned", async () => {
    const b = await band(db, "totals");
    await b.status("paid");
    await setDefaultSplit(db.pool, b.owner, b.project.id, [
      { roleId: b.adminRole.id, kind: "percentage", value: 10_000 },
    ]);
    const totals = await listPersonTotals(db.pool, b.owner, b.project.id, {
      from: "2026-09-01",
      to: "2026-09-30",
    });
    assert.equal(totals.find((t) => t.userId === b.lucia.id)!.earned, 1_312_500);
  });

  it("freezes an Event created already Paid", async () => {
    const b = await band(db, "born");
    const born = await createEvent(db.pool, b.owner, b.project.id, { ...EVENT, status: "paid" });
    const p = await getEventPayout(db.pool, b.owner, b.project.id, born.id);
    assert.ok(p.frozenAt);
  });
});
