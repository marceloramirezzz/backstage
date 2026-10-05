import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createTestDb, type TestDb } from "../../test/test-db.ts";
import { verifiedUser } from "../../test/users.ts";
import {
  addGuest,
  getAttendance,
  removeGuest,
  setAttending,
} from "./attendance.ts";
import { createEvent, deleteEvent } from "./events.ts";
import { acceptInvitation, sendInvitations } from "./invitations.ts";
import { createProject } from "./projects.ts";
import { createRole, listRoles } from "./roles.ts";

const EVENT = { name: "Casamiento Ríos", date: "2026-09-26", durationMinutes: 240 };
const VALID_ID = "00000000-0000-4000-8000-000000000000";

// A Project with its Owner (Admin), a built-in Member, a Role that edits
// Events and one that edits them but can't see pay, plus an outsider and an Event.
async function band(db: TestDb, name: string) {
  const owner = await verifiedUser(db, `${name}-owner@example.com`);
  const project = await createProject(db.pool, owner, { name });
  const memberRole = (await listRoles(db.pool, owner, project.id)).find((r) => r.kind === "member");
  assert.ok(memberRole);
  const toggles = (seeTotalPayExpenses: boolean) => ({
    editRepertoireSetlistsEvents: true,
    removeMembers: false,
    seeTotalPayExpenses,
    manageBookings: false,
  });
  const director = await createRole(db.pool, owner, project.id, {
    name: "Director",
    toggles: toggles(false),
  });
  const productor = await createRole(db.pool, owner, project.id, {
    name: "Productor",
    toggles: toggles(true),
  });
  const hire = async (who: string, roleId: string) => {
    const user = await verifiedUser(db, `${name}-${who}@example.com`);
    const [{ invitation }] = await sendInvitations(db.pool, owner, project.id, [
      { email: user.email, roleId },
    ]);
    await acceptInvitation(db.pool, user, invitation.id);
    return user;
  };
  const member = await hire("member", memberRole.id);
  const dir = await hire("director", director.id);
  const prod = await hire("productor", productor.id);
  const outsider = await verifiedUser(db, `${name}-outsider@example.com`);
  await createProject(db.pool, outsider, { name: `${name} rivals` });
  const event = await createEvent(db.pool, owner, project.id, EVENT);
  return { owner, project, member, director: dir, productor: prod, outsider, event };
}

describe("attendance", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("starts a new Event with every Member attending and no Guests", async () => {
    const { owner, project, event } = await band(db, "default");

    const attendance = await getAttendance(db.pool, owner, project.id, event.id);

    assert.equal(attendance.members.length, 4);
    assert.ok(attendance.members.every((m) => m.attending));
    assert.deepEqual(attendance.guests, []);
  });

  it("counts a Member who joins after the Event as attending", async () => {
    const { owner, project, event } = await band(db, "late");
    const roleId = (await listRoles(db.pool, owner, project.id)).find((r) => r.kind === "member")!.id;
    const late = await verifiedUser(db, "late-joiner@example.com");
    const [{ invitation }] = await sendInvitations(db.pool, owner, project.id, [
      { email: late.email, roleId },
    ]);
    await acceptInvitation(db.pool, late, invitation.id);

    const attendance = await getAttendance(db.pool, owner, project.id, event.id);

    assert.equal(attendance.members.find((m) => m.userId === late.id)?.attending, true);
  });

  it("lets someone with the edit permission untick and re-tick another Member", async () => {
    const { owner, project, member, director, event } = await band(db, "untick");

    await setAttending(db.pool, director, project.id, event.id, member.id, false);
    const unticked = await getAttendance(db.pool, owner, project.id, event.id);
    await setAttending(db.pool, owner, project.id, event.id, member.id, true);
    const reticked = await getAttendance(db.pool, owner, project.id, event.id);

    assert.equal(unticked.members.find((m) => m.userId === member.id)?.attending, false);
    assert.equal(reticked.members.find((m) => m.userId === member.id)?.attending, true);
  });

  it("refuses to untick without the edit permission", async () => {
    const { owner, project, member, event } = await band(db, "no-edit");

    await assert.rejects(
      setAttending(db.pool, member, project.id, event.id, owner.id, false),
      { code: "forbidden" },
    );
    assert.equal(
      (await getAttendance(db.pool, owner, project.id, event.id)).members.every((m) => m.attending),
      true,
    );
  });

  it("lets an editor edit their own Attendance, but not a Member without the permission", async () => {
    const { owner, project, member, event } = await band(db, "own");

    await setAttending(db.pool, owner, project.id, event.id, owner.id, false);
    const unticked = await getAttendance(db.pool, owner, project.id, event.id);
    await assert.rejects(setAttending(db.pool, member, project.id, event.id, member.id, false), {
      code: "forbidden",
    });

    assert.equal(unticked.members.find((m) => m.userId === owner.id)?.attending, false);
    assert.equal(unticked.members.find((m) => m.userId === member.id)?.attending, true);
  });

  it("reports a User who isn't a Member of the Project as not found", async () => {
    const { owner, project, outsider, event } = await band(db, "stranger");

    await assert.rejects(setAttending(db.pool, owner, project.id, event.id, outsider.id, false), {
      code: "not_found",
    });
    await assert.rejects(setAttending(db.pool, owner, project.id, event.id, "nope", false), {
      code: "not_found",
    });
  });

  it("adds name-only Guests with a fixed amount and removes them", async () => {
    const { productor, owner, project, event } = await band(db, "guests");

    const guest = await addGuest(db.pool, productor, project.id, event.id, {
      name: "  Nahuel Ortiz ",
      amount: 350_000,
    });
    const listed = await getAttendance(db.pool, owner, project.id, event.id);
    await removeGuest(db.pool, productor, project.id, event.id, guest.id);
    const after = await getAttendance(db.pool, owner, project.id, event.id);

    assert.deepEqual(listed.guests, [{ id: guest.id, name: "Nahuel Ortiz", amount: 350_000 }]);
    assert.deepEqual(after.guests, []);
  });

  it("lets only those with the edit permission add or remove Guests", async () => {
    const { owner, project, member, event } = await band(db, "guest-perm");
    const guest = await addGuest(db.pool, owner, project.id, event.id, { name: "Nahuel", amount: 1 });

    await assert.rejects(addGuest(db.pool, member, project.id, event.id, { name: "X", amount: 1 }), {
      code: "forbidden",
    });
    await assert.rejects(removeGuest(db.pool, member, project.id, event.id, guest.id), {
      code: "forbidden",
    });
    assert.equal((await getAttendance(db.pool, owner, project.id, event.id)).guests.length, 1);
  });

  it("validates a Guest's name and amount", async () => {
    const { owner, project, event } = await band(db, "guest-invalid");

    for (const input of [
      { name: "  ", amount: 1 },
      { name: "A", amount: -1 },
      { name: "A", amount: 1.5 },
      { name: "A", amount: Number.NaN },
    ]) {
      await assert.rejects(addGuest(db.pool, owner, project.id, event.id, input), {
        code: "invalid_input",
      });
    }
  });

  it("hides Guests' amounts from Roles that can't see pay, and they can't set one", async () => {
    const { owner, director, productor, project, event } = await band(db, "guest-pay");
    await addGuest(db.pool, productor, project.id, event.id, { name: "Nahuel", amount: 350_000 });

    const seen = await getAttendance(db.pool, director, project.id, event.id);
    const blank = await addGuest(db.pool, director, project.id, event.id, { name: "Sin monto" });
    await assert.rejects(
      addGuest(db.pool, director, project.id, event.id, { name: "Con monto", amount: 5 }),
      { code: "forbidden" },
    );
    const full = await getAttendance(db.pool, owner, project.id, event.id);

    assert.equal(seen.guests[0].name, "Nahuel");
    assert.equal(seen.guests[0].amount, null);
    assert.equal(blank.amount, null);
    assert.deepEqual(full.guests.map((g) => g.amount), [350_000, 0]);
  });

  it("removes Guests and absences with their Event", async () => {
    const { owner, project, member, event } = await band(db, "cascade");
    await addGuest(db.pool, owner, project.id, event.id, { name: "Nahuel", amount: 1 });
    await setAttending(db.pool, owner, project.id, event.id, member.id, false);

    await deleteEvent(db.pool, owner, project.id, event.id);

    for (const table of ["event_guests", "event_absences"]) {
      const { rows } = await db.pool.query(`SELECT 1 FROM ${table} WHERE event_id = $1`, [event.id]);
      assert.equal(rows.length, 0);
    }
  });

  it("keeps Attendance private to the Project and to its own Events", async () => {
    const { outsider, project, event, owner } = await band(db, "privacy");

    await assert.rejects(getAttendance(db.pool, outsider, project.id, event.id), {
      code: "not_found",
    });
    await assert.rejects(getAttendance(db.pool, owner, project.id, VALID_ID), { code: "not_found" });
    await assert.rejects(addGuest(db.pool, owner, project.id, VALID_ID, { name: "A", amount: 1 }), {
      code: "not_found",
    });
    await assert.rejects(removeGuest(db.pool, owner, project.id, event.id, VALID_ID), {
      code: "not_found",
    });
  });
});
