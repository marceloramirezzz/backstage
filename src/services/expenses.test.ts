import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createTestDb, type TestDb } from "../../test/test-db.ts";
import { verifiedUser } from "../../test/users.ts";
import { createEvent, deleteEvent, updateEvent } from "./events.ts";
import { addExpense, getExpenses, removeExpense } from "./expenses.ts";
import { acceptInvitation, sendInvitations } from "./invitations.ts";
import { createProject } from "./projects.ts";
import { createRole, listRoles } from "./roles.ts";

const EVENT = { name: "Casamiento Ríos", date: "2026-09-26", durationMinutes: 240, pay: 3_000_000 };
const VALID_ID = "00000000-0000-4000-8000-000000000000";

// A Project with its Owner (Admin), a built-in Member (sees totals, can't edit), a Role that edits
// Events without seeing pay, one that sees pay without editing, and one that
// does both, plus an Event paying Gs. 3.000.000.
async function band(db: TestDb, name: string) {
  const owner = await verifiedUser(db, `${name}-owner@example.com`);
  const project = await createProject(db.pool, owner, { name });
  const memberRole = (await listRoles(db.pool, owner, project.id)).find((r) => r.kind === "member");
  assert.ok(memberRole);
  const roleWith = (roleName: string, edit: boolean, see: boolean) =>
    createRole(db.pool, owner, project.id, {
      name: roleName,
      toggles: { editRepertoireSetlistsEvents: edit, removeMembers: false, seeTotalPayExpenses: see , manageBookings: false},
    });
  const roles = {
    director: await roleWith("Director", true, false),
    contador: await roleWith("Contador", false, true),
    productor: await roleWith("Productor", true, true),
  };
  const hire = async (who: string, roleId: string) => {
    const user = await verifiedUser(db, `${name}-${who}@example.com`);
    const [{ invitation }] = await sendInvitations(db.pool, owner, project.id, [
      { email: user.email, roleId },
    ]);
    await acceptInvitation(db.pool, user, invitation.id);
    return user;
  };
  const member = await hire("member", memberRole.id);
  const director = await hire("director", roles.director.id);
  const contador = await hire("contador", roles.contador.id);
  const productor = await hire("productor", roles.productor.id);
  const outsider = await verifiedUser(db, `${name}-outsider@example.com`);
  await createProject(db.pool, outsider, { name: `${name} rivals` });
  const event = await createEvent(db.pool, owner, project.id, EVENT);
  return { owner, project, member, director, contador, productor, outsider, event };
}

describe("expenses", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("starts an Event with no Expenses and net pay equal to pay", async () => {
    const { owner, project, event } = await band(db, "empty");

    const summary = await getExpenses(db.pool, owner, project.id, event.id);

    assert.deepEqual(summary, { pay: 3_000_000, expenses: [], total: 0, netPay: 3_000_000 });
  });

  it("subtracts the sum of Expenses from pay to get net pay", async () => {
    const { owner, productor, project, event } = await band(db, "net");

    await addExpense(db.pool, owner, project.id, event.id, { name: "Alquiler de van", amount: 400_000 });
    await addExpense(db.pool, productor, project.id, event.id, { name: "Sonido", amount: 600_000 });
    const summary = await getExpenses(db.pool, owner, project.id, event.id);

    assert.deepEqual(summary?.expenses.map((e) => [e.name, e.amount]), [
      ["Alquiler de van", 400_000],
      ["Sonido", 600_000],
    ]);
    assert.equal(summary?.total, 1_000_000);
    assert.equal(summary?.netPay, 2_000_000);
  });

  it("follows pay when it is edited, and goes negative when Expenses exceed it", async () => {
    const { owner, project, event } = await band(db, "negative");
    await addExpense(db.pool, owner, project.id, event.id, { name: "Escenario", amount: 500_000 });

    await updateEvent(db.pool, owner, project.id, event.id, { pay: 200_000 });

    assert.equal((await getExpenses(db.pool, owner, project.id, event.id))?.netPay, -300_000);
  });

  it("lets those who see totals read Expenses, edit rights or not", async () => {
    const { owner, contador, project, event } = await band(db, "read");
    await addExpense(db.pool, owner, project.id, event.id, { name: "Van", amount: 100_000 });

    const summary = await getExpenses(db.pool, contador, project.id, event.id);

    assert.equal(summary?.total, 100_000);
    assert.equal(summary?.netPay, 2_900_000);
  });

  it("never gives Expenses to a Member who can't see totals, editors included", async () => {
    const { owner, director, project, event } = await band(db, "hidden");
    await addExpense(db.pool, owner, project.id, event.id, { name: "Van", amount: 100_000 });

    assert.equal(await getExpenses(db.pool, director, project.id, event.id), null);
  });

  it("lets only holders of both permissions add and remove Expenses", async () => {
    const { owner, member, director, contador, project, event } = await band(db, "both");
    const kept = await addExpense(db.pool, owner, project.id, event.id, { name: "Van", amount: 100_000 });

    for (const user of [member, director, contador]) {
      await assert.rejects(
        addExpense(db.pool, user, project.id, event.id, { name: "Extra", amount: 1 }),
        { code: "forbidden" },
      );
      await assert.rejects(removeExpense(db.pool, user, project.id, event.id, kept.id), {
        code: "forbidden",
      });
    }
    assert.equal((await getExpenses(db.pool, owner, project.id, event.id))?.expenses.length, 1);
  });

  it("removes an Expense", async () => {
    const { owner, project, event } = await band(db, "remove");
    const van = await addExpense(db.pool, owner, project.id, event.id, { name: "Van", amount: 100_000 });

    await removeExpense(db.pool, owner, project.id, event.id, van.id);

    assert.equal((await getExpenses(db.pool, owner, project.id, event.id))?.total, 0);
    await assert.rejects(removeExpense(db.pool, owner, project.id, event.id, van.id), {
      code: "not_found",
    });
  });

  it("rejects a blank name and an amount that isn't whole, non-negative Guaraníes", async () => {
    const { owner, project, event } = await band(db, "invalid");

    for (const input of [
      { name: "  ", amount: 1 },
      { name: "Van", amount: -1 },
      { name: "Van", amount: 1.5 },
      { name: "Van", amount: Number.NaN },
    ]) {
      await assert.rejects(addExpense(db.pool, owner, project.id, event.id, input), {
        code: "invalid_input",
      });
    }
  });

  it("only touches Events of the caller's Project", async () => {
    const { owner, outsider, project, event } = await band(db, "scope");
    const van = await addExpense(db.pool, owner, project.id, event.id, { name: "Van", amount: 1 });
    const other = await createProject(db.pool, outsider, { name: "scope other" });
    const otherEvent = await createEvent(db.pool, outsider, other.id, EVENT);

    await assert.rejects(getExpenses(db.pool, outsider, project.id, event.id), { code: "not_found" });
    await assert.rejects(addExpense(db.pool, owner, project.id, otherEvent.id, { name: "x", amount: 1 }), {
      code: "not_found",
    });
    await assert.rejects(removeExpense(db.pool, outsider, other.id, otherEvent.id, van.id), {
      code: "not_found",
    });
    await assert.rejects(getExpenses(db.pool, owner, project.id, VALID_ID), { code: "not_found" });
  });

  it("goes with its Event", async () => {
    const { owner, project, event } = await band(db, "cascade");
    await addExpense(db.pool, owner, project.id, event.id, { name: "Van", amount: 1 });

    await deleteEvent(db.pool, owner, project.id, event.id);

    const { rows } = await db.pool.query("SELECT 1 FROM event_expenses WHERE event_id = $1", [event.id]);
    assert.equal(rows.length, 0);
  });

  it("records an Expense's category", async () => {
    const { owner, project, event } = await band(db, "category");

    await addExpense(db.pool, owner, project.id, event.id, {
      name: "Van",
      amount: 100_000,
      category: "transport",
    });
    await addExpense(db.pool, owner, project.id, event.id, { name: "Cena", amount: 50_000 });
    const { expenses } = (await getExpenses(db.pool, owner, project.id, event.id))!;

    assert.equal(expenses[0].category, "transport");
    assert.equal(expenses[1].category, "other");
  });

  it("refuses an unknown category", async () => {
    const { owner, project, event } = await band(db, "badcategory");

    await assert.rejects(
      addExpense(db.pool, owner, project.id, event.id, {
        name: "Van",
        amount: 1,
        category: "bogus" as "other",
      }),
      { code: "invalid_input" },
    );
  });
});
