import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { memoryMailer, sentTo } from "../../test/mailer.ts";
import { createTestDb, type TestDb } from "../../test/test-db.ts";
import { verifiedUser } from "../../test/users.ts";
import { getCalendar } from "./calendar.ts";
import { createEvent, updateEvent } from "./events.ts";
import { acceptInvitation, sendInvitations } from "./invitations.ts";
import { createProject } from "./projects.ts";
import { createRehearsal, deleteRehearsal, listRehearsals, updateRehearsal, type RehearsalInput } from "./rehearsals.ts";
import { createRole, listRoles, type RoleToggles } from "./roles.ts";

const REHEARSAL: RehearsalInput = {
  date: "2026-09-10",
  startTime: "19:00",
  endTime: "21:00",
  location: "Local de ensayo",
  notes: "Traer cables",
};

const NO_TOGGLES: RoleToggles = {
  editRepertoireSetlistsEvents: false,
  removeMembers: false,
  seeTotalPayExpenses: false,
  manageBookings: false,
};

describe("Rehearsals and the Calendar", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(async () => {
    await db.close();
  });

  async function band(name: string) {
    const owner = await verifiedUser(db, `${name}-owner@example.com`);
    const project = await createProject(db.pool, owner, { name });
    const roles = await listRoles(db.pool, owner, project.id);
    const join = async (email: string, roleId: string) => {
      const user = await verifiedUser(db, email);
      const [{ invitation }] = await sendInvitations(db.pool, owner, project.id, [{ email, roleId }]);
      await acceptInvitation(db.pool, user, invitation.id);
      return user;
    };
    const editors = await createRole(db.pool, owner, project.id, {
      name: "Editors",
      toggles: { ...NO_TOGGLES, editRepertoireSetlistsEvents: true },
    });
    return {
      owner,
      project,
      member: await join(`${name}-member@example.com`, roles.find((r) => r.kind === "member")!.id),
      editor: await join(`${name}-editor@example.com`, editors.id),
    };
  }

  it("lets only those who can edit events create, edit and delete", async () => {
    const { owner, member, editor, project } = await band("perms");
    const mailer = memoryMailer();
    await assert.rejects(createRehearsal(db.pool, mailer, member, project.id, REHEARSAL), { code: "forbidden" });
    const made = await createRehearsal(db.pool, mailer, editor, project.id, REHEARSAL);
    assert.deepEqual({ ...made, id: undefined }, { ...REHEARSAL, id: undefined });

    await assert.rejects(updateRehearsal(db.pool, member, project.id, made.id, REHEARSAL), { code: "forbidden" });
    const edited = await updateRehearsal(db.pool, editor, project.id, made.id, {
      ...REHEARSAL,
      startTime: "20:00",
      location: " ",
      notes: null,
    });
    assert.equal(edited.startTime, "20:00");
    assert.equal(edited.location, null);
    assert.equal(edited.notes, null);

    await assert.rejects(deleteRehearsal(db.pool, member, project.id, made.id), { code: "forbidden" });
    await deleteRehearsal(db.pool, owner, project.id, made.id);
    assert.deepEqual(await listRehearsals(db.pool, member, project.id), []);
    await assert.rejects(deleteRehearsal(db.pool, owner, project.id, made.id), { code: "not_found" });
  });

  it("rejects malformed input", async () => {
    const { owner, project } = await band("invalid");
    const mailer = memoryMailer();
    for (const bad of [
      { ...REHEARSAL, date: "2026-02-30" },
      { ...REHEARSAL, startTime: "7pm" },
      { ...REHEARSAL, startTime: "21:00", endTime: "19:00" },
    ]) {
      await assert.rejects(createRehearsal(db.pool, mailer, owner, project.id, bad), { code: "invalid_input" });
    }
  });

  it("does not reach into another Project", async () => {
    const a = await band("iso-a");
    const b = await band("iso-b");
    const made = await createRehearsal(db.pool, memoryMailer(), a.owner, a.project.id, REHEARSAL);
    await assert.rejects(updateRehearsal(db.pool, b.owner, b.project.id, made.id, REHEARSAL), { code: "not_found" });
    await assert.rejects(listRehearsals(db.pool, b.owner, a.project.id), { code: "not_found" });
  });

  it("emails every Member only when notify is ticked", async () => {
    const { owner, member, editor, project } = await band("notify");
    const quiet = memoryMailer();
    await createRehearsal(db.pool, quiet, editor, project.id, REHEARSAL);
    assert.equal(quiet.sent.length, 0);

    const loud = memoryMailer();
    await createRehearsal(db.pool, loud, editor, project.id, REHEARSAL, { notify: true });
    assert.equal(loud.sent.length, 3);
    for (const who of [owner, member, editor]) assert.equal(sentTo(loud, who.email).length, 1);
    const body = sentTo(loud, member.email)[0].body;
    assert.match(body, /19:00 – 21:00/);
    assert.match(body, /Local de ensayo/);
    assert.match(body, /Traer cables/);
    assert.match(body, /\/calendario\?mes=2026-09/);
  });

  it("returns Events and Rehearsals for a range, hiding cancelled Events unless asked", async () => {
    const { owner, member, project } = await band("calendar");
    const event = (name: string, date: string) =>
      createEvent(db.pool, owner, project.id, { name, date, durationMinutes: 120 });
    await event("Inside", "2026-09-05");
    const cancelled = await event("Cancelled", "2026-09-06");
    await updateEvent(db.pool, owner, project.id, cancelled.id, { status: "cancelled" });
    await event("Outside", "2026-10-05");
    const mailer = memoryMailer();
    await createRehearsal(db.pool, mailer, owner, project.id, REHEARSAL);
    await createRehearsal(db.pool, mailer, owner, project.id, { ...REHEARSAL, date: "2026-10-10" });
    // Private by default, and still visible to a plain Member.
    const range = { from: "2026-09-01", to: "2026-09-30" };
    const shown = await getCalendar(db.pool, member, project.id, range);
    assert.deepEqual(shown.events.map((e) => e.name), ["Inside"]);
    assert.deepEqual(shown.rehearsals.map((r) => r.date), ["2026-09-10"]);

    const all = await getCalendar(db.pool, member, project.id, { ...range, includeCancelled: true });
    assert.deepEqual(all.events.map((e) => e.name), ["Inside", "Cancelled"]);
  });
});
