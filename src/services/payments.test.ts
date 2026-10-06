import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createTestDb, type TestDb } from "../../test/test-db.ts";
import { verifiedUser } from "../../test/users.ts";
import { createEvent, getEvent, updateEvent } from "./events.ts";
import { acceptInvitation, sendInvitations } from "./invitations.ts";
import { addPayment, getPayments, removePayment, updatePayment } from "./payments.ts";
import { createProject } from "./projects.ts";
import { createRole, listRoles } from "./roles.ts";

const EVENT = { name: "Casamiento Ríos", date: "2026-09-26", durationMinutes: 240, pay: 3_000_000 };
const VALID_ID = "00000000-0000-4000-8000-000000000000";

describe("payments", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  // Same cast as the Expenses tests: an Admin, a built-in Member, and custom
  // Roles that edit without seeing pay, see without editing, or both.
  async function band(name: string) {
    const owner = await verifiedUser(db, `${name}-owner@example.com`);
    const project = await createProject(db.pool, owner, { name });
    const memberRole = (await listRoles(db.pool, owner, project.id)).find((r) => r.kind === "member");
    assert.ok(memberRole);
    const roleWith = (roleName: string, edit: boolean, see: boolean) =>
      createRole(db.pool, owner, project.id, {
        name: roleName,
        toggles: { editRepertoireSetlistsEvents: edit, removeMembers: false, seeTotalPayExpenses: see, manageBookings: false },
      });
    const hire = async (who: string, roleId: string) => {
      const user = await verifiedUser(db, `${name}-${who}@example.com`);
      const [{ invitation }] = await sendInvitations(db.pool, owner, project.id, [{ email: user.email, roleId }]);
      await acceptInvitation(db.pool, user, invitation.id);
      return user;
    };
    const member = await hire("member", memberRole.id);
    const director = await hire("director", (await roleWith("Director", true, false)).id);
    const contador = await hire("contador", (await roleWith("Contador", false, true)).id);
    const productor = await hire("productor", (await roleWith("Productor", true, true)).id);
    const outsider = await verifiedUser(db, `${name}-outsider@example.com`);
    await createProject(db.pool, outsider, { name: `${name} rivals` });
    const event = await createEvent(db.pool, owner, project.id, EVENT);
    return { owner, project, member, director, contador, productor, outsider, event };
  }

  it("starts an Event with no Payments and the whole pay as balance", async () => {
    const { owner, project, event } = await band("empty");

    assert.deepEqual(await getPayments(db.pool, owner, project.id, event.id), {
      pay: 3_000_000,
      payments: [],
      received: 0,
      balance: 3_000_000,
    });
  });

  it("records Payments in date order and shows received versus balance", async () => {
    const { owner, productor, project, event } = await band("record");

    await addPayment(db.pool, owner, project.id, event.id, { date: "2026-09-20", amount: 500_000 });
    await addPayment(db.pool, productor, project.id, event.id, { date: "2026-08-01", amount: 1_000_000, note: "Seña" });
    const summary = await getPayments(db.pool, owner, project.id, event.id);

    assert.deepEqual(summary?.payments.map((p) => [p.date, p.amount, p.note]), [
      ["2026-08-01", 1_000_000, "Seña"],
      ["2026-09-20", 500_000, null],
    ]);
    assert.equal(summary?.received, 1_500_000);
    assert.equal(summary?.balance, 1_500_000);
  });

  it("follows pay when it is edited, and lets the balance go negative when overpaid", async () => {
    const { owner, project, event } = await band("overpaid");
    await addPayment(db.pool, owner, project.id, event.id, { date: "2026-09-01", amount: 1_000_000 });

    await updateEvent(db.pool, owner, project.id, event.id, { pay: 400_000 });

    assert.equal((await getPayments(db.pool, owner, project.id, event.id))?.balance, -600_000);
  });

  it("edits a Payment", async () => {
    const { owner, project, event } = await band("edit");
    const p = await addPayment(db.pool, owner, project.id, event.id, { date: "2026-09-01", amount: 100_000, note: "Seña" });

    await updatePayment(db.pool, owner, project.id, event.id, p.id, { date: "2026-09-02", amount: 250_000 });
    const summary = await getPayments(db.pool, owner, project.id, event.id);

    assert.deepEqual(summary?.payments.map((x) => [x.date, x.amount, x.note]), [["2026-09-02", 250_000, null]]);
  });

  it("deletes a Payment", async () => {
    const { owner, project, event } = await band("delete");
    const p = await addPayment(db.pool, owner, project.id, event.id, { date: "2026-09-01", amount: 100_000 });

    await removePayment(db.pool, owner, project.id, event.id, p.id);

    assert.equal((await getPayments(db.pool, owner, project.id, event.id))?.received, 0);
    await assert.rejects(removePayment(db.pool, owner, project.id, event.id, p.id), { code: "not_found" });
    await assert.rejects(updatePayment(db.pool, owner, project.id, event.id, p.id, { date: "2026-09-01", amount: 1 }), {
      code: "not_found",
    });
    await assert.rejects(removePayment(db.pool, owner, project.id, event.id, "nope"), { code: "not_found" });
  });

  it("leaves the Event's status alone when the balance reaches zero", async () => {
    const { owner, project, event } = await band("status");
    await updateEvent(db.pool, owner, project.id, event.id, { status: "confirmed" });

    await addPayment(db.pool, owner, project.id, event.id, { date: "2026-09-01", amount: 3_000_000 });

    assert.equal((await getPayments(db.pool, owner, project.id, event.id))?.balance, 0);
    assert.equal((await getEvent(db.pool, owner, project.id, event.id)).status, "confirmed");
  });

  it("never gives Payments to anyone who can't see totals, editors included", async () => {
    const { owner, director, project, event } = await band("hidden");
    await addPayment(db.pool, owner, project.id, event.id, { date: "2026-09-01", amount: 100_000 });

    assert.equal(await getPayments(db.pool, director, project.id, event.id), null);
  });

  it("lets those who see totals read Payments, edit rights or not", async () => {
    const { owner, member, contador, project, event } = await band("read");
    await addPayment(db.pool, owner, project.id, event.id, { date: "2026-09-01", amount: 100_000 });

    assert.equal((await getPayments(db.pool, contador, project.id, event.id))?.received, 100_000);
    assert.equal((await getPayments(db.pool, member, project.id, event.id))?.received, 100_000);
  });

  it("lets only holders of both permissions add, edit and delete Payments", async () => {
    const { owner, productor, member, director, contador, project, event } = await band("both");
    const kept = await addPayment(db.pool, owner, project.id, event.id, { date: "2026-09-01", amount: 100_000 });
    const input = { date: "2026-09-02", amount: 1 };

    for (const user of [member, director, contador]) {
      await assert.rejects(addPayment(db.pool, user, project.id, event.id, input), { code: "forbidden" });
      await assert.rejects(updatePayment(db.pool, user, project.id, event.id, kept.id, input), { code: "forbidden" });
      await assert.rejects(removePayment(db.pool, user, project.id, event.id, kept.id), { code: "forbidden" });
    }
    await addPayment(db.pool, productor, project.id, event.id, input);
    assert.equal((await getPayments(db.pool, owner, project.id, event.id))?.payments.length, 2);
  });

  it("rejects bad dates and amounts that aren't whole, positive Guaraníes", async () => {
    const { owner, project, event } = await band("invalid");

    for (const input of [
      { date: "2026-09-01", amount: 0 },
      { date: "2026-09-01", amount: -5 },
      { date: "2026-09-01", amount: 1.5 },
      { date: "2026-09-01", amount: Number.NaN },
      { date: "mañana", amount: 1 },
      { date: "2026-02-31", amount: 1 },
      { date: "2026-09-01", amount: 1, note: 5 as unknown as string },
    ]) {
      await assert.rejects(addPayment(db.pool, owner, project.id, event.id, input), { code: "invalid_input" });
    }
    assert.equal((await getPayments(db.pool, owner, project.id, event.id))?.payments.length, 0);
  });

  it("treats a blank note as none", async () => {
    const { owner, project, event } = await band("note");
    const p = await addPayment(db.pool, owner, project.id, event.id, { date: "2026-09-01", amount: 1, note: "   " });
    assert.equal(p.note, null);
  });

  it("keeps Projects apart", async () => {
    const a = await band("iso-a");
    const b = await band("iso-b");
    const p = await addPayment(db.pool, a.owner, a.project.id, a.event.id, { date: "2026-09-01", amount: 1 });

    await assert.rejects(getPayments(db.pool, a.outsider, a.project.id, a.event.id), { code: "not_found" });
    await assert.rejects(addPayment(db.pool, a.outsider, a.project.id, a.event.id, { date: "2026-09-01", amount: 1 }), {
      code: "not_found",
    });
    // Another Project's Event, through my own Project.
    await assert.rejects(getPayments(db.pool, b.owner, b.project.id, a.event.id), { code: "not_found" });
    await assert.rejects(addPayment(db.pool, b.owner, b.project.id, a.event.id, { date: "2026-09-01", amount: 1 }), {
      code: "not_found",
    });
    await assert.rejects(removePayment(db.pool, b.owner, b.project.id, a.event.id, p.id), { code: "not_found" });
    await assert.rejects(getPayments(db.pool, a.owner, a.project.id, VALID_ID), { code: "not_found" });
  });
});
