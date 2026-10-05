import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createTestDb, type TestDb } from "../../test/test-db.ts";
import { verifiedUser } from "../../test/users.ts";
import type { User } from "./accounts.ts";
import { acceptInvitation, sendInvitations } from "./invitations.ts";
import { createProject, type Project } from "./projects.ts";
import { createRole, listRoles, type RoleToggles } from "./roles.ts";
import { createSong, deleteSong, listSongs, updateSong, type SongInput } from "./songs.ts";

const NO_TOGGLES: RoleToggles = {
  editRepertoireSetlistsEvents: false,
  removeMembers: false,
  seeTotalPayExpenses: false,
  manageBookings: false,
};

// Invites the User with the Role and accepts, so they join the Project.
async function join(db: TestDb, owner: User, project: Project, user: User, roleId: string) {
  const [{ invitation }] = await sendInvitations(db.pool, owner, project.id, [
    { email: user.email, roleId },
  ]);
  await acceptInvitation(db.pool, user, invitation.id);
}

// A Project with its Owner (an Admin), a built-in Member, a custom Role that
// may edit the repertoire, one that may not, and a User from another Project.
async function band(db: TestDb, name: string) {
  const user = (who: string) => verifiedUser(db, `${name}-${who}@example.com`);
  const owner = await user("owner");
  const project = await createProject(db.pool, owner, { name });
  const memberRole = (await listRoles(db.pool, owner, project.id)).find((r) => r.kind === "member");
  assert.ok(memberRole);
  const editorRole = await createRole(db.pool, owner, project.id, {
    name: "Arreglador",
    toggles: { ...NO_TOGGLES, editRepertoireSetlistsEvents: true },
  });
  const roadieRole = await createRole(db.pool, owner, project.id, {
    name: "Roadie",
    toggles: { removeMembers: true, seeTotalPayExpenses: true, manageBookings: false, editRepertoireSetlistsEvents: false },
  });
  const [member, editor, roadie, outsider] = [
    await user("member"),
    await user("editor"),
    await user("roadie"),
    await user("outsider"),
  ];
  await join(db, owner, project, member, memberRole.id);
  await join(db, owner, project, editor, editorRole.id);
  await join(db, owner, project, roadie, roadieRole.id);
  await createProject(db.pool, outsider, { name: `${name} rivals` });
  return { project, owner, member, editor, roadie, outsider };
}

const BESAME: SongInput = { name: "Bésame mucho", key: "Dm", durationSeconds: 225, intensity: "calm" };

describe("createSong", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("adds a Song to the Repertoire", async () => {
    const owner = await verifiedUser(db, "create@example.com");
    const project = await createProject(db.pool, owner, { name: "Los del Valle" });

    const song = await createSong(db.pool, owner, project.id, BESAME);

    assert.deepEqual(song, { id: song.id, ...BESAME });
    assert.deepEqual(await listSongs(db.pool, owner, project.id), [song]);
  });

  it("accepts a duration up to 99:59", async () => {
    const owner = await verifiedUser(db, "longest@example.com");
    const project = await createProject(db.pool, owner, { name: "Los Largos" });

    const song = await createSong(db.pool, owner, project.id, { ...BESAME, durationSeconds: 5999 });

    assert.equal(song.durationSeconds, 5999);
  });

  it("trims the name and key, and leaves a blank key unset", async () => {
    const owner = await verifiedUser(db, "trim@example.com");
    const project = await createProject(db.pool, owner, { name: "Los Trim" });

    const song = await createSong(db.pool, owner, project.id, {
      ...BESAME,
      name: "  India ",
      key: "  ",
    });

    assert.equal(song.name, "India");
    assert.equal(song.key, null);
  });

  const invalid: [string, Partial<Record<keyof SongInput, unknown>>][] = [
    ["a blank name", { name: "   " }],
    ["an intensity outside calm, medium, danceable, energetic", { intensity: "loud" }],
    ["a key outside the listed notes", { key: "La menor" }],
    ["a zero duration", { durationSeconds: 0 }],
    ["a fractional duration", { durationSeconds: 3.5 }],
    ["a missing duration", { durationSeconds: undefined }],
    ["a duration of 100 minutes or more", { durationSeconds: 100 * 60 }],
  ];
  for (const [i, [what, change]] of invalid.entries()) {
    it(`refuses ${what}`, async () => {
      const owner = await verifiedUser(db, `invalid-${i}@example.com`);
      const project = await createProject(db.pool, owner, { name: "Los Inválidos" });

      await assert.rejects(
        createSong(db.pool, owner, project.id, { ...BESAME, ...change } as SongInput),
        { name: "ServiceError", code: "invalid_input" },
      );
      assert.deepEqual(await listSongs(db.pool, owner, project.id), []);
    });
  }
});

describe("updateSong", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("replaces a Song's name, key, duration and intensity", async () => {
    const owner = await verifiedUser(db, "update@example.com");
    const project = await createProject(db.pool, owner, { name: "Los Editados" });
    const song = await createSong(db.pool, owner, project.id, BESAME);
    const edited: SongInput = { name: "Bésame mucho (versión cumbia)", key: "Em", durationSeconds: 250, intensity: "danceable" };

    const updated = await updateSong(db.pool, owner, project.id, song.id, edited);

    assert.deepEqual(updated, { id: song.id, ...edited });
    assert.deepEqual(await listSongs(db.pool, owner, project.id), [updated]);
  });

  it("validates like createSong", async () => {
    const owner = await verifiedUser(db, "update-invalid@example.com");
    const project = await createProject(db.pool, owner, { name: "Los Validados" });
    const song = await createSong(db.pool, owner, project.id, BESAME);

    await assert.rejects(
      updateSong(db.pool, owner, project.id, song.id, { ...BESAME, intensity: "loud" as never }),
      { name: "ServiceError", code: "invalid_input" },
    );
    assert.deepEqual(await listSongs(db.pool, owner, project.id), [song]);
  });

  it("reports a Song from another Project, or a malformed id, as not found", async () => {
    const owner = await verifiedUser(db, "update-other@example.com");
    const project = await createProject(db.pool, owner, { name: "Los Propios" });
    const other = await createProject(db.pool, owner, { name: "Los Ajenos" });
    const song = await createSong(db.pool, owner, other.id, BESAME);

    for (const id of [song.id, "not-a-uuid"]) {
      await assert.rejects(updateSong(db.pool, owner, project.id, id, BESAME), {
        name: "ServiceError",
        code: "not_found",
      });
    }
  });
});

describe("deleteSong", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("removes the Song from the Repertoire", async () => {
    const owner = await verifiedUser(db, "delete@example.com");
    const project = await createProject(db.pool, owner, { name: "Los Borrados" });
    const song = await createSong(db.pool, owner, project.id, BESAME);
    const kept = await createSong(db.pool, owner, project.id, { ...BESAME, name: "India" });

    await deleteSong(db.pool, owner, project.id, song.id);

    assert.deepEqual(await listSongs(db.pool, owner, project.id), [kept]);
  });

  it("reports a Song from another Project, or one already deleted, as not found", async () => {
    const owner = await verifiedUser(db, "delete-other@example.com");
    const project = await createProject(db.pool, owner, { name: "Los Míos" });
    const other = await createProject(db.pool, owner, { name: "Los Otros" });
    const theirs = await createSong(db.pool, owner, other.id, BESAME);
    const gone = await createSong(db.pool, owner, project.id, BESAME);
    await deleteSong(db.pool, owner, project.id, gone.id);

    for (const id of [theirs.id, gone.id, "not-a-uuid"]) {
      await assert.rejects(deleteSong(db.pool, owner, project.id, id), {
        name: "ServiceError",
        code: "not_found",
      });
    }
    assert.deepEqual(await listSongs(db.pool, owner, other.id), [theirs]);
  });
});

describe("listSongs", () => {
  let db: TestDb;
  let owner: User;
  let project: Project;
  before(async () => {
    db = await createTestDb();
    owner = await verifiedUser(db, "search@example.com");
    project = await createProject(db.pool, owner, { name: "Los Buscados" });
    for (const [name, intensity] of [
      ["Colegiala", "danceable"],
      ["Bésame mucho", "calm"],
      ["Mis noches sin ti", "medium"],
      ["100% cumbia", "energetic"],
      ["La pollera colorá", "danceable"],
    ] as const) {
      await createSong(db.pool, owner, project.id, { ...BESAME, name, intensity });
    }
  });
  after(() => db.close());

  const names = async (filter?: Parameters<typeof listSongs>[3]) =>
    (await listSongs(db.pool, owner, project.id, filter)).map((s) => s.name);

  it("lists every Song by name", async () => {
    assert.deepEqual(await names(), [
      "100% cumbia",
      "Bésame mucho",
      "Colegiala",
      "La pollera colorá",
      "Mis noches sin ti",
    ]);
  });

  it("searches by any part of the name, ignoring case and accents", async () => {
    assert.deepEqual(await names({ search: "BESAME" }), ["Bésame mucho"]);
    assert.deepEqual(await names({ search: "colora" }), ["La pollera colorá"]);
    assert.deepEqual(await names({ search: " noches " }), ["Mis noches sin ti"]);
    assert.deepEqual(await names({ search: "la" }), ["Colegiala", "La pollera colorá"]);
  });

  it("matches % and _ literally", async () => {
    assert.deepEqual(await names({ search: "%" }), ["100% cumbia"]);
    assert.deepEqual(await names({ search: "_" }), []);
  });

  it("filters by intensity", async () => {
    assert.deepEqual(await names({ intensity: "danceable" }), ["Colegiala", "La pollera colorá"]);
    assert.deepEqual(await names({ search: "cole", intensity: "danceable" }), ["Colegiala"]);
  });
});

describe("Song permissions", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("lets Admins and Roles with the edit permission add Songs", async () => {
    const { project, owner, editor } = await band(db, "editors");

    await createSong(db.pool, owner, project.id, BESAME);
    await createSong(db.pool, editor, project.id, { ...BESAME, name: "Colegiala" });

    const names = (await listSongs(db.pool, owner, project.id)).map((s) => s.name);
    assert.deepEqual(names, ["Bésame mucho", "Colegiala"]);
  });

  it("refuses Members and Roles without the edit permission", async () => {
    const { project, owner, member, roadie } = await band(db, "readers");

    for (const user of [member, roadie]) {
      await assert.rejects(createSong(db.pool, user, project.id, BESAME), {
        name: "ServiceError",
        code: "forbidden",
      });
    }
    assert.deepEqual(await listSongs(db.pool, owner, project.id), []);
  });

  it("lets only Admins and Roles with the edit permission edit and delete Songs", async () => {
    const { project, owner, member, editor, roadie } = await band(db, "changers");
    const song = await createSong(db.pool, owner, project.id, BESAME);

    for (const user of [member, roadie]) {
      for (const attempt of [
        () => updateSong(db.pool, user, project.id, song.id, { ...BESAME, name: "Otra" }),
        () => deleteSong(db.pool, user, project.id, song.id),
      ]) {
        await assert.rejects(attempt(), { name: "ServiceError", code: "forbidden" });
      }
    }
    assert.deepEqual(await listSongs(db.pool, owner, project.id), [song]);

    const edited = await updateSong(db.pool, editor, project.id, song.id, { ...BESAME, key: "Am" });
    assert.equal(edited.key, "Am");
    await deleteSong(db.pool, editor, project.id, song.id);
    assert.deepEqual(await listSongs(db.pool, owner, project.id), []);
  });

  it("lets every Member browse the Repertoire", async () => {
    const { project, owner, member, roadie } = await band(db, "browsers");
    const song = await createSong(db.pool, owner, project.id, BESAME);

    for (const user of [member, roadie]) {
      assert.deepEqual(await listSongs(db.pool, user, project.id), [song]);
    }
  });

  it("reports another Project's Repertoire as not found", async () => {
    const { project, owner, outsider } = await band(db, "outsiders");
    const song = await createSong(db.pool, owner, project.id, BESAME);

    for (const attempt of [
      () => listSongs(db.pool, outsider, project.id),
      () => createSong(db.pool, outsider, project.id, BESAME),
      () => updateSong(db.pool, outsider, project.id, song.id, BESAME),
      () => deleteSong(db.pool, outsider, project.id, song.id),
    ]) {
      await assert.rejects(attempt(), { name: "ServiceError", code: "not_found" });
    }
  });
});
