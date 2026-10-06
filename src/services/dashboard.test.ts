import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createTestDb, type TestDb } from "../../test/test-db.ts";
import { verifiedUser } from "../../test/users.ts";
import { setAttending } from "./attendance.ts";
import { getDashboard } from "./dashboard.ts";
import { createEvent, updateEvent } from "./events.ts";
import { addExpense } from "./expenses.ts";
import { acceptInvitation, sendInvitations } from "./invitations.ts";
import { addPayment } from "./payments.ts";
import { createProject } from "./projects.ts";
import { createRole, listRoles } from "./roles.ts";
import { setMemberRule } from "./splits.ts";

const SEPTEMBER = { from: "2026-09-01", to: "2026-09-30" };
const YEAR = { from: "2026-01-01", to: "2026-12-31" };

describe("Dashboard", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(async () => {
    await db.close();
  });

  // Diego (Admin) and Lucía (Member) split what is left equally; Roadie Sofía
  // has a custom Role without "see total pay" and gets a flat Gs. 100.000 per Event.
  async function band(name: string) {
    const owner = await verifiedUser(db, `${name}-diego@example.com`);
    const project = await createProject(db.pool, owner, { name });
    const roles = await listRoles(db.pool, owner, project.id);
    const memberRole = roles.find((r) => r.kind === "member")!;
    const roadieRole = await createRole(db.pool, owner, project.id, {
      name: "Roadie",
      toggles: { editRepertoireSetlistsEvents: false, removeMembers: false, seeTotalPayExpenses: false, manageBookings: false },
    });
    const hire = async (who: string, roleId: string) => {
      const user = await verifiedUser(db, `${name}-${who}@example.com`);
      const [{ invitation }] = await sendInvitations(db.pool, owner, project.id, [{ email: user.email, roleId }]);
      await acceptInvitation(db.pool, user, invitation.id);
      return user;
    };
    const lucia = await hire("lucia", memberRole.id);
    const sofia = await hire("sofia", roadieRole.id);
    await setMemberRule(db.pool, owner, project.id, sofia.id, { kind: "fixed", value: 100_000 });
    const gig = async (date: string, pay: number, status: "pending" | "confirmed" | "paid" | "cancelled") => {
      const event = await createEvent(db.pool, owner, project.id, { name: `Gig ${date}`, date, durationMinutes: 120, pay });
      await updateEvent(db.pool, owner, project.id, event.id, { status });
      return event;
    };
    return { owner, project, lucia, sofia, gig };
  }

  it("counts Confirmed and Paid shows; Cobrado is Payments received, Por cobrar the unpaid balance", async () => {
    const b = await band("figures");
    const paid1 = await b.gig("2026-09-05", 1_000_000, "paid");
    await b.gig("2026-09-12", 2_000_000, "paid");
    const confirmed = await b.gig("2026-09-19", 500_000, "confirmed");
    const pending = await b.gig("2026-09-20", 900_000, "pending");
    await b.gig("2026-09-21", 700_000, "cancelled");
    await addPayment(db.pool, b.owner, b.project.id, paid1.id, { date: "2026-09-01", amount: 1_000_000 });
    await addPayment(db.pool, b.owner, b.project.id, confirmed.id, { date: "2026-09-10", amount: 200_000 });
    await addPayment(db.pool, b.owner, b.project.id, pending.id, { date: "2026-09-11", amount: 50_000 });
    const d = await getDashboard(db.pool, b.owner, b.project.id, SEPTEMBER);
    assert.deepEqual(d, {
      scope: "band",
      shows: 3,
      paidShows: 2,
      confirmedShows: 1,
      earned: 1_250_000,
      // 0 (paid1) + 2.000.000 (paid2) + 300.000 (confirmed).
      expected: 2_300_000,
    });
  });

  it("does not take a Paid Event's pay as Cobrado without Payments", async () => {
    const b = await band("unrecorded");
    await b.gig("2026-09-05", 1_000_000, "paid");
    const d = await getDashboard(db.pool, b.owner, b.project.id, SEPTEMBER);
    assert.equal(d.scope === "band" && d.earned, 0);
  });

  it("dates Cobrado by the Payment and Por cobrar by the Event, each scoped to the period", async () => {
    const b = await band("dates");
    const gig = await b.gig("2026-10-10", 1_000_000, "confirmed");
    // A deposit in September for an October gig.
    await addPayment(db.pool, b.owner, b.project.id, gig.id, { date: "2026-09-15", amount: 400_000 });
    await addPayment(db.pool, b.owner, b.project.id, gig.id, { date: "2026-10-01", amount: 100_000 });
    const sept = await getDashboard(db.pool, b.owner, b.project.id, SEPTEMBER);
    assert.deepEqual(sept.scope === "band" && [sept.shows, sept.earned, sept.expected], [0, 400_000, 0]);
    const oct = await getDashboard(db.pool, b.owner, b.project.id, { from: "2026-10-01", to: "2026-10-31" });
    // The whole balance, whenever the Payments arrived.
    assert.deepEqual(oct.scope === "band" && [oct.shows, oct.earned, oct.expected], [1, 100_000, 500_000]);
  });

  it("never lets an overpaid Event reduce another's Por cobrar", async () => {
    const b = await band("overpaid");
    const a = await b.gig("2026-09-05", 100_000, "confirmed");
    await b.gig("2026-09-06", 500_000, "confirmed");
    await addPayment(db.pool, b.owner, b.project.id, a.id, { date: "2026-09-01", amount: 300_000 });
    const d = await getDashboard(db.pool, b.owner, b.project.id, SEPTEMBER);
    assert.equal(d.scope === "band" && d.expected, 500_000);
  });

  it("keeps Projects' Payments apart", async () => {
    const x = await band("apart-x");
    const y = await band("apart-y");
    const gig = await x.gig("2026-09-05", 1_000_000, "confirmed");
    await addPayment(db.pool, x.owner, x.project.id, gig.id, { date: "2026-09-01", amount: 1_000 });
    const d = await getDashboard(db.pool, y.owner, y.project.id, SEPTEMBER);
    assert.equal(d.scope === "band" && d.earned, 0);
  });

  it("scopes by period: month and year", async () => {
    const b = await band("scope");
    const early = await b.gig("2026-08-31", 100_000, "paid");
    const first = await b.gig("2026-09-01", 200_000, "paid");
    await b.gig("2026-09-30", 400_000, "confirmed");
    await b.gig("2026-10-01", 800_000, "confirmed");
    await addPayment(db.pool, b.owner, b.project.id, early.id, { date: "2026-08-31", amount: 100_000 });
    await addPayment(db.pool, b.owner, b.project.id, first.id, { date: "2026-09-01", amount: 200_000 });
    const month = await getDashboard(db.pool, b.owner, b.project.id, SEPTEMBER);
    assert.equal(month.shows, 2);
    assert.equal(month.scope === "band" && month.earned, 200_000);
    const year = await getDashboard(db.pool, b.owner, b.project.id, YEAR);
    assert.equal(year.shows, 4);
    assert.equal(year.scope === "band" && year.earned, 300_000);
    assert.equal(year.scope === "band" && year.expected, 1_200_000);
  });

  it("shows Members without a Role restriction the band totals", async () => {
    const b = await band("member");
    await b.gig("2026-09-05", 1_000_000, "paid");
    const d = await getDashboard(db.pool, b.lucia, b.project.id, SEPTEMBER);
    assert.equal(d.scope, "band");
  });

  it("gives a Role without see-total-pay only their own amounts and the shows count", async () => {
    const b = await band("restricted");
    const paid = await b.gig("2026-09-05", 1_000_000, "paid");
    await addExpense(db.pool, b.owner, b.project.id, paid.id, { name: "Van", amount: 100_000 });
    const confirmed = await b.gig("2026-09-19", 500_000, "confirmed");
    await b.gig("2026-09-20", 900_000, "pending");
    // Payments never reach a restricted Role's figures.
    await addPayment(db.pool, b.owner, b.project.id, paid.id, { date: "2026-09-02", amount: 1_000_000 });
    await addPayment(db.pool, b.owner, b.project.id, confirmed.id, { date: "2026-09-03", amount: 300_000 });
    const d = await getDashboard(db.pool, b.sofia, b.project.id, SEPTEMBER);
    assert.deepEqual(d, { scope: "own", shows: 2, earned: 100_000, expected: 100_000 });
    assert.ok(!("paidShows" in d));
  });

  it("counts only the Events the restricted Member played in toward their amounts", async () => {
    const b = await band("absent");
    await b.gig("2026-09-05", 1_000_000, "paid");
    const second = await b.gig("2026-09-12", 1_000_000, "paid");
    await setAttending(db.pool, b.owner, b.project.id, second.id, b.sofia.id, false);
    const d = await getDashboard(db.pool, b.sofia, b.project.id, SEPTEMBER);
    assert.equal(d.scope === "own" && d.earned, 100_000);
    assert.equal(d.shows, 2);
  });

  it("rejects outsiders and malformed periods", async () => {
    const b = await band("guards");
    const outsider = await verifiedUser(db, "guards-outsider@example.com");
    await assert.rejects(getDashboard(db.pool, outsider, b.project.id, SEPTEMBER), { code: "not_found" });
    await assert.rejects(getDashboard(db.pool, b.owner, b.project.id, { from: "x", to: "y" }), { code: "invalid_input" });
  });
});
