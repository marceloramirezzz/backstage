import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createTestDb, type TestDb } from "../../test/test-db.ts";
import { verifiedUser } from "../../test/users.ts";
import { setAttending } from "./attendance.ts";
import { getDashboard } from "./dashboard.ts";
import { createEvent, updateEvent } from "./events.ts";
import { addExpense } from "./expenses.ts";
import { acceptInvitation, sendInvitations } from "./invitations.ts";
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

  it("counts Confirmed and Paid shows; Cobrado is Paid pay, Por cobrar is Confirmed", async () => {
    const b = await band("figures");
    await b.gig("2026-09-05", 1_000_000, "paid");
    await b.gig("2026-09-12", 2_000_000, "paid");
    await b.gig("2026-09-19", 500_000, "confirmed");
    await b.gig("2026-09-20", 900_000, "pending");
    await b.gig("2026-09-21", 700_000, "cancelled");
    const d = await getDashboard(db.pool, b.owner, b.project.id, SEPTEMBER);
    assert.deepEqual(d, { scope: "band", shows: 3, paidShows: 2, confirmedShows: 1, earned: 3_000_000, expected: 500_000 });
  });

  it("scopes by period: month and year", async () => {
    const b = await band("scope");
    await b.gig("2026-08-31", 100_000, "paid");
    await b.gig("2026-09-01", 200_000, "paid");
    await b.gig("2026-09-30", 400_000, "confirmed");
    await b.gig("2026-10-01", 800_000, "confirmed");
    const month = await getDashboard(db.pool, b.owner, b.project.id, SEPTEMBER);
    assert.equal(month.shows, 2);
    assert.equal(month.scope === "band" && month.earned, 200_000);
    const year = await getDashboard(db.pool, b.owner, b.project.id, YEAR);
    assert.equal(year.shows, 4);
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
    await b.gig("2026-09-19", 500_000, "confirmed");
    await b.gig("2026-09-20", 900_000, "pending");
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
