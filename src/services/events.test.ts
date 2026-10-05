import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createTestDb, type TestDb } from "../../test/test-db.ts";
import { verifiedUser } from "../../test/users.ts";
import type { User } from "./accounts.ts";
import {
  createEvent,
  deleteEvent,
  EVENT_STATUSES,
  getEvent,
  listEvents,
  updateEvent,
  type EventInput,
} from "./events.ts";
import { acceptInvitation, sendInvitations } from "./invitations.ts";
import { createProject, type Project } from "./projects.ts";
import { createRole, listRoles, type RoleToggles } from "./roles.ts";
import { createSelection, deleteSelection } from "./selections.ts";
import { createSetlist, deleteSetlist, updateSetlist } from "./setlists.ts";
import { createSong, deleteSong, updateSong } from "./songs.ts";

const EVENT: EventInput = {
  name: "Casamiento Ríos",
  date: "2026-09-26",
  startTime: "22:00",
  location: "Salón Las Palmeras",
  pay: 4_500_000,
  durationMinutes: 240,
};

// A well-formed id that names nothing.
const VALID_ID = "00000000-0000-4000-8000-000000000000";

// A Project with its Owner, two Songs, a Selection of both, and a template
// Setlist of Song, Selection, Song.
async function stage(db: TestDb, email: string) {
  const owner = await verifiedUser(db, email);
  const project = await createProject(db.pool, owner, { name: `Banda de ${email}` });
  const base = { key: "Am", durationSeconds: 200, intensity: "calm" as const };
  const besame = await createSong(db.pool, owner, project.id, { ...base, name: "Bésame mucho" });
  const india = await createSong(db.pool, owner, project.id, { ...base, name: "India" });
  const medley = await createSelection(db.pool, owner, project.id, {
    name: "Enganchado cumbia",
    durationSeconds: 750,
    intensity: "danceable",
    songIds: [besame.id, india.id],
  });
  const setlist = await createSetlist(db.pool, owner, project.id, {
    name: "Boda clásica",
    category: "boda",
    items: [
      { kind: "song", id: besame.id },
      { kind: "selection", id: medley.id },
      { kind: "song", id: india.id },
    ],
  });
  return { owner, project, besame, india, medley, setlist };
}

describe("events", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("creates an Event that is pending and private, and lists it by date", async () => {
    const { owner, project } = await stage(db, "create@example.com");

    const event = await createEvent(db.pool, owner, project.id, EVENT);
    await createEvent(db.pool, owner, project.id, {
      ...EVENT,
      name: "Bar La Esquina",
      date: "2026-09-11",
    });

    assert.deepEqual(event, {
      id: event.id,
      name: "Casamiento Ríos",
      date: "2026-09-26",
      startTime: "22:00",
      location: "Salón Las Palmeras",
      pay: 4_500_000,
      durationMinutes: 240,
      status: "pending",
      isPublic: false,
      bandFundBasisPoints: 0,
      setlist: null,
    });
    const names = (await listEvents(db.pool, owner, project.id)).map((e) => e.name);
    assert.deepEqual(names, ["Bar La Esquina", "Casamiento Ríos"]);
    assert.deepEqual(await getEvent(db.pool, owner, project.id, event.id), event);
  });

  it("trims the name and location, and takes no start time or location", async () => {
    const { owner, project } = await stage(db, "optional@example.com");

    const event = await createEvent(db.pool, owner, project.id, {
      name: "  Peña ",
      date: "2026-10-03",
      location: "  ",
      durationMinutes: 90,
    });

    assert.equal(event.name, "Peña");
    assert.equal(event.location, null);
    assert.equal(event.startTime, null);
    assert.equal(event.pay, 0);
  });

  it("lists only the Events in a date range", async () => {
    const { owner, project } = await stage(db, "range@example.com");
    for (const date of ["2026-08-31", "2026-09-01", "2026-09-30", "2026-10-01"]) {
      await createEvent(db.pool, owner, project.id, { ...EVENT, date });
    }

    const events = await listEvents(db.pool, owner, project.id, {
      from: "2026-09-01",
      to: "2026-09-30",
    });

    assert.deepEqual(
      events.map((e) => e.date),
      ["2026-09-01", "2026-09-30"],
    );
  });

  const invalid: [string, Partial<Record<keyof EventInput, unknown>>][] = [
    ["a blank name", { name: " " }],
    ["a missing date", { date: undefined }],
    ["an impossible date", { date: "2026-02-30" }],
    ["a malformed date", { date: "26/09/2026" }],
    ["a malformed start time", { startTime: "25:00" }],
    ["a zero duration", { durationMinutes: 0 }],
    ["a fractional duration", { durationMinutes: 90.5 }],
    ["a negative pay", { pay: -1 }],
    ["a fractional pay", { pay: 100.5 }],
    ["an unknown status", { status: "tentative" }],
    ["a non-boolean public flag", { isPublic: "yes" }],
    ["a malformed Setlist id", { setlistId: "nope" }],
  ];
  for (const [i, [what, change]] of invalid.entries()) {
    it(`refuses ${what}`, async () => {
      const { owner, project } = await stage(db, `invalid-${i}@example.com`);
      await assert.rejects(
        createEvent(db.pool, owner, project.id, { ...EVENT, ...change } as EventInput),
        { name: "ServiceError", code: "invalid_input" },
      );
      assert.deepEqual(await listEvents(db.pool, owner, project.id), []);
    });
  }

  it("moves freely between all four statuses", async () => {
    const { owner, project } = await stage(db, "status@example.com");
    const event = await createEvent(db.pool, owner, project.id, EVENT);

    for (const from of EVENT_STATUSES) {
      for (const to of EVENT_STATUSES) {
        await updateEvent(db.pool, owner, project.id, event.id, { status: from });
        const moved = await updateEvent(db.pool, owner, project.id, event.id, { status: to });
        assert.equal(moved.status, to, `${from} → ${to}`);
      }
    }
  });

  it("updates only the fields given", async () => {
    const { owner, project } = await stage(db, "patch@example.com");
    const event = await createEvent(db.pool, owner, project.id, EVENT);

    const edited = await updateEvent(db.pool, owner, project.id, event.id, {
      isPublic: true,
      location: null,
      startTime: null,
    });

    assert.deepEqual(edited, { ...event, isPublic: true, location: null, startTime: null });
  });

  it("keeps the Event's duration independent of its Setlist's total", async () => {
    const { owner, project, setlist } = await stage(db, "duration@example.com");

    const event = await createEvent(db.pool, owner, project.id, {
      ...EVENT,
      durationMinutes: 300,
      setlistId: setlist.id,
    });

    assert.equal(event.durationMinutes, 300);
    assert.notEqual(event.durationMinutes * 60, setlist.durationSeconds);
    const longer = await updateEvent(db.pool, owner, project.id, event.id, { durationMinutes: 45 });
    assert.equal(longer.durationMinutes, 45);
  });

  it("reports an unknown or foreign Event as not found", async () => {
    const { owner, project } = await stage(db, "missing@example.com");
    const other = await stage(db, "missing-other@example.com");
    const theirs = await createEvent(db.pool, other.owner, other.project.id, EVENT);

    for (const id of [VALID_ID, "nope", theirs.id]) {
      await assert.rejects(getEvent(db.pool, owner, project.id, id), { code: "not_found" });
      await assert.rejects(updateEvent(db.pool, owner, project.id, id, { name: "X" }), {
        code: "not_found",
      });
      await assert.rejects(deleteEvent(db.pool, owner, project.id, id), { code: "not_found" });
    }
    assert.equal((await getEvent(db.pool, other.owner, other.project.id, theirs.id)).name, EVENT.name);
  });
});

describe("an Event's Setlist", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("is a copy of the chosen template as it was then", async () => {
    const { owner, project, besame, india, medley, setlist } = await stage(
      db,
      "copy@example.com",
    );

    const event = await createEvent(db.pool, owner, project.id, { ...EVENT, setlistId: setlist.id });

    assert.ok(event.setlist);
    assert.equal(event.setlist.name, "Boda clásica");
    assert.equal(event.setlist.category, "boda");
    assert.equal(event.setlist.durationSeconds, 200 + 750 + 200);
    assert.deepEqual(
      event.setlist.items.map((i) => [i.kind, i.name, i.durationSeconds]),
      [
        ["song", "Bésame mucho", 200],
        ["selection", "Enganchado cumbia", 750],
        ["song", "India", 200],
      ],
    );
    assert.deepEqual(
      event.setlist.items[1].songs?.map((s) => s.name),
      [besame.name, india.name],
    );
    assert.equal(medley.songs.length, 2);
  });

  it("is never touched by later edits to the template, its Songs or its Selections", async () => {
    const { owner, project, besame, india, medley, setlist } = await stage(
      db,
      "independent@example.com",
    );
    const event = await createEvent(db.pool, owner, project.id, { ...EVENT, setlistId: setlist.id });
    const copied = (await getEvent(db.pool, owner, project.id, event.id)).setlist;

    await updateSetlist(db.pool, owner, project.id, setlist.id, {
      name: "Otra",
      category: "rock",
      items: [{ kind: "song", id: india.id }],
    });
    await updateSong(db.pool, owner, project.id, besame.id, {
      name: "Bésame (nueva versión)",
      key: "Dm",
      durationSeconds: 999,
      intensity: "energetic",
    });

    assert.deepEqual((await getEvent(db.pool, owner, project.id, event.id)).setlist, copied);
    // The Event doesn't hold the Repertoire's Songs, so they can go.
    assert.ok(medley);
  });

  it("lets its Songs and the template be deleted afterwards", async () => {
    const { owner, project, setlist } = await stage(db, "deletable@example.com");
    const event = await createEvent(db.pool, owner, project.id, { ...EVENT, setlistId: setlist.id });

    await deleteSetlist(db.pool, owner, project.id, setlist.id);

    const after = await getEvent(db.pool, owner, project.id, event.id);
    assert.equal(after.setlist?.items.length, 3);
    assert.equal(after.setlist?.name, "Boda clásica");
  });

  it("can be replaced by another template's copy, or cleared", async () => {
    const { owner, project, india, setlist } = await stage(db, "replace@example.com");
    const short = await createSetlist(db.pool, owner, project.id, {
      name: "Corta",
      items: [{ kind: "song", id: india.id }],
    });
    const event = await createEvent(db.pool, owner, project.id, { ...EVENT, setlistId: setlist.id });

    const swapped = await updateEvent(db.pool, owner, project.id, event.id, {
      setlistId: short.id,
    });
    assert.equal(swapped.setlist?.name, "Corta");
    assert.equal(swapped.setlist?.items.length, 1);

    const untouched = await updateEvent(db.pool, owner, project.id, event.id, { name: "Nuevo" });
    assert.equal(untouched.setlist?.name, "Corta");

    const cleared = await updateEvent(db.pool, owner, project.id, event.id, { setlistId: null });
    assert.equal(cleared.setlist, null);
  });

  it("refuses a template from another Project or one that doesn't exist, creating nothing", async () => {
    const { owner, project } = await stage(db, "foreign@example.com");
    const other = await stage(db, "foreign-other@example.com");

    for (const setlistId of [other.setlist.id, VALID_ID]) {
      await assert.rejects(createEvent(db.pool, owner, project.id, { ...EVENT, setlistId }), {
        code: "invalid_input",
      });
    }
    assert.deepEqual(await listEvents(db.pool, owner, project.id), []);
  });

  it("is deleted with its Event", async () => {
    const { owner, project, setlist } = await stage(db, "cascade@example.com");
    const event = await createEvent(db.pool, owner, project.id, { ...EVENT, setlistId: setlist.id });

    await deleteEvent(db.pool, owner, project.id, event.id);

    const { rows } = await db.pool.query("SELECT 1 FROM event_setlist_items WHERE event_id = $1", [
      event.id,
    ]);
    assert.equal(rows.length, 0);
  });

  it("doesn't stop a Song that was in it from being deleted", async () => {
    const { owner, project, besame, india, medley, setlist } = await stage(
      db,
      "song-gone@example.com",
    );
    const event = await createEvent(db.pool, owner, project.id, { ...EVENT, setlistId: setlist.id });
    await deleteSetlist(db.pool, owner, project.id, setlist.id);
    await deleteSelection(db.pool, owner, project.id, medley.id);

    await deleteSong(db.pool, owner, project.id, besame.id);
    await deleteSong(db.pool, owner, project.id, india.id);

    assert.equal((await getEvent(db.pool, owner, project.id, event.id)).setlist?.items.length, 3);
  });
});

// Invites the User with the Role and accepts, so they join the Project.
async function join(db: TestDb, owner: User, project: Project, user: User, roleId: string) {
  const [{ invitation }] = await sendInvitations(db.pool, owner, project.id, [
    { email: user.email, roleId },
  ]);
  await acceptInvitation(db.pool, user, invitation.id);
}

const toggles = (change: Partial<RoleToggles>): RoleToggles => ({
  editRepertoireSetlistsEvents: false,
  removeMembers: false,
  seeTotalPayExpenses: false,
  manageBookings: false,
  ...change,
});

// A Project with an Admin, a built-in Member, a Role that edits Events but
// can't see pay, one that edits and sees it, one that only sees it, a second
// Admin, and a User from elsewhere.
async function band(db: TestDb, name: string) {
  const { owner, project, setlist } = await stage(db, `${name}-owner@example.com`);
  const roles = await listRoles(db.pool, owner, project.id);
  const memberRole = roles.find((r) => r.kind === "member");
  const adminRole = roles.find((r) => r.kind === "admin");
  assert.ok(memberRole && adminRole);
  const roleIds = {
    director: (
      await createRole(db.pool, owner, project.id, {
        name: "Director",
        toggles: toggles({ editRepertoireSetlistsEvents: true }),
      })
    ).id,
    productor: (
      await createRole(db.pool, owner, project.id, {
        name: "Productor",
        toggles: toggles({ editRepertoireSetlistsEvents: true, seeTotalPayExpenses: true }),
      })
    ).id,
    roadie: (
      await createRole(db.pool, owner, project.id, {
        name: "Roadie",
        toggles: toggles({ seeTotalPayExpenses: true }),
      })
    ).id,
  };
  const hire = async (who: string, roleId: string) => {
    const user = await verifiedUser(db, `${name}-${who}@example.com`);
    await join(db, owner, project, user, roleId);
    return user;
  };
  const users = {
    member: await hire("member", memberRole.id),
    director: await hire("director", roleIds.director),
    productor: await hire("productor", roleIds.productor),
    roadie: await hire("roadie", roleIds.roadie),
    admin: await hire("admin", adminRole.id),
  };
  const outsider = await verifiedUser(db, `${name}-outsider@example.com`);
  await createProject(db.pool, outsider, { name: `${name} rivals` });
  return { owner, project, setlist, ...users, outsider };
}

describe("Event permissions", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("lets Admins and Roles with the edit permission create, update and delete Events", async () => {
    const { owner, project, director, productor } = await band(db, "editors");

    const mine = await createEvent(db.pool, owner, project.id, EVENT);
    const theirs = await createEvent(db.pool, director, project.id, { ...EVENT, pay: undefined });
    await updateEvent(db.pool, director, project.id, mine.id, { name: "Boda Ríos" });
    await updateEvent(db.pool, productor, project.id, theirs.id, { status: "confirmed" });
    await deleteEvent(db.pool, productor, project.id, theirs.id);

    const names = (await listEvents(db.pool, owner, project.id)).map((e) => e.name);
    assert.deepEqual(names, ["Boda Ríos"]);
  });

  it("refuses Members and Roles without the edit permission", async () => {
    const { owner, project, member, roadie } = await band(db, "readers");
    const event = await createEvent(db.pool, owner, project.id, EVENT);

    for (const user of [member, roadie]) {
      await assert.rejects(createEvent(db.pool, user, project.id, EVENT), { code: "forbidden" });
      await assert.rejects(updateEvent(db.pool, user, project.id, event.id, { name: "X" }), {
        code: "forbidden",
      });
      await assert.rejects(updateEvent(db.pool, user, project.id, event.id, { status: "paid" }), {
        code: "forbidden",
      });
      await assert.rejects(deleteEvent(db.pool, user, project.id, event.id), {
        code: "forbidden",
      });
    }
    assert.equal((await listEvents(db.pool, owner, project.id)).length, 1);
  });

  it("lets every Member see Events, but not a stranger", async () => {
    const { owner, project, member, director, roadie, outsider } = await band(db, "browse");
    const event = await createEvent(db.pool, owner, project.id, EVENT);

    for (const user of [member, director, roadie]) {
      assert.equal((await listEvents(db.pool, user, project.id)).length, 1);
      assert.equal((await getEvent(db.pool, user, project.id, event.id)).id, event.id);
    }
    await assert.rejects(listEvents(db.pool, outsider, project.id), { code: "not_found" });
    await assert.rejects(getEvent(db.pool, outsider, project.id, event.id), {
      code: "not_found",
    });
    await assert.rejects(createEvent(db.pool, outsider, project.id, EVENT), {
      code: "not_found",
    });
  });

  it("hides pay from Roles that can't see total pay", async () => {
    const { owner, project, member, director, productor, roadie } = await band(db, "pay-view");
    const event = await createEvent(db.pool, owner, project.id, EVENT);

    // The built-in Member sees totals; the Director's Role doesn't.
    assert.equal((await getEvent(db.pool, member, project.id, event.id)).pay, 4_500_000);
    assert.equal((await getEvent(db.pool, roadie, project.id, event.id)).pay, 4_500_000);
    assert.equal((await getEvent(db.pool, productor, project.id, event.id)).pay, 4_500_000);
    assert.equal((await getEvent(db.pool, director, project.id, event.id)).pay, null);
    const [listed] = await listEvents(db.pool, director, project.id);
    assert.equal(listed.pay, null);
    const edited = await updateEvent(db.pool, director, project.id, event.id, { name: "Otro" });
    assert.equal(edited.pay, null);
  });

  it("lets only those who edit and see pay set it", async () => {
    const { owner, project, admin, director, productor } = await band(db, "pay-edit");
    const event = await createEvent(db.pool, owner, project.id, EVENT);

    await assert.rejects(createEvent(db.pool, director, project.id, EVENT), { code: "forbidden" });
    await assert.rejects(updateEvent(db.pool, director, project.id, event.id, { pay: 1 }), {
      code: "forbidden",
    });
    await updateEvent(db.pool, productor, project.id, event.id, { pay: 5_000_000 });
    await updateEvent(db.pool, admin, project.id, event.id, { pay: 6_000_000 });

    assert.equal((await getEvent(db.pool, owner, project.id, event.id)).pay, 6_000_000);
  });

  it("lets only Admins delete a Paid Event", async () => {
    const { owner, project, admin, director, productor } = await band(db, "paid-delete");
    const paid = await createEvent(db.pool, owner, project.id, { ...EVENT, status: "paid" });

    for (const user of [director, productor]) {
      await assert.rejects(deleteEvent(db.pool, user, project.id, paid.id), { code: "forbidden" });
    }
    assert.equal((await listEvents(db.pool, owner, project.id)).length, 1);

    await deleteEvent(db.pool, admin, project.id, paid.id);
    assert.deepEqual(await listEvents(db.pool, owner, project.id), []);
  });

  it("lets an editor delete an Event that isn't Paid, and refuses once it's moved to Paid", async () => {
    const { owner, project, director } = await band(db, "paid-moves");
    const event = await createEvent(db.pool, owner, project.id, EVENT);
    await updateEvent(db.pool, owner, project.id, event.id, { status: "paid" });
    await assert.rejects(deleteEvent(db.pool, director, project.id, event.id), {
      code: "forbidden",
    });

    await updateEvent(db.pool, director, project.id, event.id, { status: "cancelled" });
    await deleteEvent(db.pool, director, project.id, event.id);

    assert.deepEqual(await listEvents(db.pool, owner, project.id), []);
  });
});
