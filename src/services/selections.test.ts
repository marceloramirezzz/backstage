import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createTestDb, type TestDb } from "../../test/test-db.ts";
import { verifiedUser } from "../../test/users.ts";
import type { User } from "./accounts.ts";
import { acceptInvitation, sendInvitations } from "./invitations.ts";
import { createProject, type Project } from "./projects.ts";
import { createRole, listRoles } from "./roles.ts";
import {
  createSelection,
  deleteSelection,
  listSelections,
  updateSelection,
  type SelectionInput,
} from "./selections.ts";
import { createSong, deleteSong, listSongs, updateSong, type Song, type SongInput } from "./songs.ts";

const SONG: SongInput = { name: "Colegiala", key: "Am", durationSeconds: 210, intensity: "danceable" };

// A Project with its Owner and three Songs to build Selections from.
async function repertoire(db: TestDb, email: string) {
  const owner = await verifiedUser(db, email);
  const project = await createProject(db.pool, owner, { name: `Banda de ${email}` });
  const song = (name: string) => createSong(db.pool, owner, project.id, { ...SONG, name });
  const songs = [await song("La pollera colorá"), await song("Cariñito"), await song("Colegiala")];
  return { owner, project, songs };
}

// Builds a Selection from the given Songs, valid otherwise.
const medley = (songs: { id: string }[], name = "Enganchado cumbia") => ({
  name,
  durationSeconds: 750,
  intensity: "danceable" as const,
  songIds: songs.map((s) => s.id),
});

describe("createSelection", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("adds a Selection with its Songs in playing order", async () => {
    const { owner, project, songs } = await repertoire(db, "create@example.com");
    const [pollera, carinito, colegiala] = songs;

    const selection = await createSelection(db.pool, owner, project.id, {
      name: "Enganchado cumbia",
      durationSeconds: 750,
      intensity: "danceable",
      songIds: [pollera.id, carinito.id, colegiala.id],
    });

    assert.deepEqual(selection, {
      id: selection.id,
      name: "Enganchado cumbia",
      durationSeconds: 750,
      intensity: "danceable",
      songs: [pollera, carinito, colegiala],
    });
    assert.deepEqual(await listSelections(db.pool, owner, project.id), [selection]);
  });

  it("trims the name", async () => {
    const { owner, project, songs } = await repertoire(db, "trim@example.com");

    const selection = await createSelection(db.pool, owner, project.id, {
      ...medley(songs),
      name: "  Enganchado cachaca ",
    });

    assert.equal(selection.name, "Enganchado cachaca");
  });

  it("refuses a Selection inside a Selection", async () => {
    const { owner, project, songs } = await repertoire(db, "nested@example.com");
    const inner = await createSelection(db.pool, owner, project.id, medley(songs.slice(0, 2)));

    await assert.rejects(
      createSelection(db.pool, owner, project.id, medley([inner, songs[2]], "Enganchado doble")),
      { name: "ServiceError", code: "invalid_input" },
    );
    assert.deepEqual(await listSelections(db.pool, owner, project.id), [inner]);
  });

  it("refuses a Song from another Project", async () => {
    const { owner, project, songs } = await repertoire(db, "foreign@example.com");
    const other = await createProject(db.pool, owner, { name: "Los Ajenos" });
    const theirs = await createSong(db.pool, owner, other.id, SONG);

    await assert.rejects(
      createSelection(db.pool, owner, project.id, medley([songs[0], theirs])),
      { name: "ServiceError", code: "invalid_input" },
    );
    assert.deepEqual(await listSelections(db.pool, owner, project.id), []);
  });

  const invalid: [string, (songs: Song[]) => Partial<Record<keyof SelectionInput, unknown>>][] = [
    ["a blank name", () => ({ name: "  " })],
    ["a zero duration", () => ({ durationSeconds: 0 })],
    ["a fractional duration", () => ({ durationSeconds: 3.5 })],
    ["a duration of 100 minutes or more", () => ({ durationSeconds: 100 * 60 })],
    ["an intensity outside calm, medium, danceable, energetic", () => ({ intensity: "loud" })],
    ["a single Song", (songs) => ({ songIds: [songs[0].id] })],
    ["no Songs", () => ({ songIds: [] })],
    ["a missing Song list", () => ({ songIds: undefined })],
    ["the same Song twice", (songs) => ({ songIds: [songs[0].id, songs[1].id, songs[0].id] })],
    ["a malformed Song id", (songs) => ({ songIds: [songs[0].id, "not-a-uuid"] })],
  ];
  for (const [i, [what, change]] of invalid.entries()) {
    it(`refuses ${what}`, async () => {
      const { owner, project, songs } = await repertoire(db, `invalid-${i}@example.com`);

      await assert.rejects(
        createSelection(db.pool, owner, project.id, {
          ...medley(songs),
          ...change(songs),
        } as SelectionInput),
        { name: "ServiceError", code: "invalid_input" },
      );
      assert.deepEqual(await listSelections(db.pool, owner, project.id), []);
    });
  }
});

describe("updateSelection", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("replaces a Selection's details and its Songs, in their new order", async () => {
    const { owner, project, songs } = await repertoire(db, "update@example.com");
    const [pollera, carinito, colegiala] = songs;
    const selection = await createSelection(db.pool, owner, project.id, medley([pollera, carinito]));

    const updated = await updateSelection(db.pool, owner, project.id, selection.id, {
      name: "Enganchado cachaca",
      durationSeconds: 840,
      intensity: "energetic",
      songIds: [colegiala.id, pollera.id],
    });

    assert.deepEqual(updated, {
      id: selection.id,
      name: "Enganchado cachaca",
      durationSeconds: 840,
      intensity: "energetic",
      songs: [colegiala, pollera],
    });
    assert.deepEqual(await listSelections(db.pool, owner, project.id), [updated]);
    await deleteSong(db.pool, owner, project.id, carinito.id); // no longer in it
  });

  it("validates like createSelection", async () => {
    const { owner, project, songs } = await repertoire(db, "update-invalid@example.com");
    const selection = await createSelection(db.pool, owner, project.id, medley(songs));

    await assert.rejects(
      updateSelection(db.pool, owner, project.id, selection.id, medley([songs[0], selection])),
      { name: "ServiceError", code: "invalid_input" },
    );
    assert.deepEqual(await listSelections(db.pool, owner, project.id), [selection]);
  });

  it("reports a Selection from another Project, or a malformed id, as not found", async () => {
    const { owner, project, songs } = await repertoire(db, "update-other@example.com");
    const other = await createProject(db.pool, owner, { name: "Los Ajenos" });
    const theirSongs = [
      await createSong(db.pool, owner, other.id, SONG),
      await createSong(db.pool, owner, other.id, { ...SONG, name: "India" }),
    ];
    const theirs = await createSelection(db.pool, owner, other.id, medley(theirSongs));

    for (const id of [theirs.id, "not-a-uuid"]) {
      await assert.rejects(updateSelection(db.pool, owner, project.id, id, medley(songs)), {
        name: "ServiceError",
        code: "not_found",
      });
    }
    assert.deepEqual(await listSelections(db.pool, owner, other.id), [theirs]);
  });
});

describe("deleteSelection", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("removes the Selection, freeing its Songs to be deleted", async () => {
    const { owner, project, songs } = await repertoire(db, "delete@example.com");
    const selection = await createSelection(db.pool, owner, project.id, medley(songs));
    const kept = await createSelection(db.pool, owner, project.id, medley(songs.slice(1), "Otro"));

    await deleteSelection(db.pool, owner, project.id, selection.id);

    assert.deepEqual(await listSelections(db.pool, owner, project.id), [kept]);
    await deleteSong(db.pool, owner, project.id, songs[0].id);
  });

  it("reports a Selection from another Project, or one already deleted, as not found", async () => {
    const { owner, project, songs } = await repertoire(db, "delete-other@example.com");
    const other = await createProject(db.pool, owner, { name: "Los Otros" });
    const theirSongs = [
      await createSong(db.pool, owner, other.id, SONG),
      await createSong(db.pool, owner, other.id, { ...SONG, name: "India" }),
    ];
    const theirs = await createSelection(db.pool, owner, other.id, medley(theirSongs));
    const gone = await createSelection(db.pool, owner, project.id, medley(songs));
    await deleteSelection(db.pool, owner, project.id, gone.id);

    for (const id of [theirs.id, gone.id, "not-a-uuid"]) {
      await assert.rejects(deleteSelection(db.pool, owner, project.id, id), {
        name: "ServiceError",
        code: "not_found",
      });
    }
    assert.deepEqual(await listSelections(db.pool, owner, other.id), [theirs]);
  });
});

describe("listSelections", () => {
  let db: TestDb;
  let owner: User;
  let project: Project;
  before(async () => {
    db = await createTestDb();
    const band = await repertoire(db, "search@example.com");
    ({ owner, project } = band);
    for (const [name, intensity] of [
      ["Enganchado cumbia", "danceable"],
      ["Clásicos lentos", "calm"],
      ["100% polca", "energetic"],
      ["Enganchado cachaca", "energetic"],
    ] as const) {
      await createSelection(db.pool, owner, project.id, { ...medley(band.songs, name), intensity });
    }
  });
  after(() => db.close());

  const names = async (filter?: Parameters<typeof listSelections>[3]) =>
    (await listSelections(db.pool, owner, project.id, filter)).map((s) => s.name);

  it("lists every Selection by name", async () => {
    assert.deepEqual(await names(), [
      "100% polca",
      "Clásicos lentos",
      "Enganchado cachaca",
      "Enganchado cumbia",
    ]);
  });

  it("searches by any part of the name, ignoring case and accents", async () => {
    assert.deepEqual(await names({ search: "CLASICOS" }), ["Clásicos lentos"]);
    assert.deepEqual(await names({ search: " enganchado " }), [
      "Enganchado cachaca",
      "Enganchado cumbia",
    ]);
  });

  it("matches % and _ literally", async () => {
    assert.deepEqual(await names({ search: "%" }), ["100% polca"]);
    assert.deepEqual(await names({ search: "_" }), []);
  });

  it("filters by intensity", async () => {
    assert.deepEqual(await names({ intensity: "energetic" }), ["100% polca", "Enganchado cachaca"]);
    assert.deepEqual(await names({ search: "cachaca", intensity: "energetic" }), [
      "Enganchado cachaca",
    ]);
  });
});

describe("Songs in a Selection", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("can't be deleted until removed from it", async () => {
    const { owner, project, songs } = await repertoire(db, "in-use@example.com");
    await createSelection(db.pool, owner, project.id, medley(songs.slice(0, 2)));

    await assert.rejects(deleteSong(db.pool, owner, project.id, songs[0].id), {
      name: "ServiceError",
      code: "song_in_use",
    });
    const names = (await listSongs(db.pool, owner, project.id)).map((s) => s.name);
    assert.deepEqual(names, ["Cariñito", "Colegiala", "La pollera colorá"]);

    await deleteSong(db.pool, owner, project.id, songs[2].id); // in no Selection
  });

  it("show their edits in the Selection", async () => {
    const { owner, project, songs } = await repertoire(db, "edited@example.com");
    const selection = await createSelection(db.pool, owner, project.id, medley(songs.slice(0, 2)));

    const edited = await updateSong(db.pool, owner, project.id, songs[0].id, {
      ...SONG,
      name: "La pollera colorada",
      key: "G",
    });

    const [listed] = await listSelections(db.pool, owner, project.id);
    assert.deepEqual(listed.songs, [edited, songs[1]]);
    assert.equal(listed.id, selection.id);
  });
});

// Invites the User with the Role and accepts, so they join the Project.
async function join(db: TestDb, owner: User, project: Project, user: User, roleId: string) {
  const [{ invitation }] = await sendInvitations(db.pool, owner, project.id, [
    { email: user.email, roleId },
  ]);
  await acceptInvitation(db.pool, user, invitation.id);
}

// A repertoire whose Project also has a built-in Member, a custom Role that
// may edit the repertoire, one that may not, and a User from another Project.
async function band(db: TestDb, name: string) {
  const user = (who: string) => verifiedUser(db, `${name}-${who}@example.com`);
  const { owner, project, songs } = await repertoire(db, `${name}-owner@example.com`);
  const memberRole = (await listRoles(db.pool, owner, project.id)).find((r) => r.kind === "member");
  assert.ok(memberRole);
  const editorRole = await createRole(db.pool, owner, project.id, {
    name: "Arreglador",
    toggles: { editRepertoireSetlistsEvents: true, removeMembers: false, seeTotalPayExpenses: false , manageBookings: false},
  });
  const roadieRole = await createRole(db.pool, owner, project.id, {
    name: "Roadie",
    toggles: { editRepertoireSetlistsEvents: false, removeMembers: true, seeTotalPayExpenses: true , manageBookings: false},
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
  return { project, songs, owner, member, editor, roadie, outsider };
}

describe("Selection permissions", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("lets Admins and Roles with the edit permission add, edit and delete Selections", async () => {
    const { project, songs, owner, editor } = await band(db, "editors");

    const mine = await createSelection(db.pool, owner, project.id, medley(songs));
    const theirs = await createSelection(db.pool, editor, project.id, medley(songs, "Otro"));
    await updateSelection(db.pool, editor, project.id, mine.id, medley(songs.slice(1), "Editado"));
    await deleteSelection(db.pool, editor, project.id, theirs.id);

    const names = (await listSelections(db.pool, owner, project.id)).map((s) => s.name);
    assert.deepEqual(names, ["Editado"]);
  });

  it("refuses Members and Roles without the edit permission", async () => {
    const { project, songs, owner, member, roadie } = await band(db, "readers");
    const selection = await createSelection(db.pool, owner, project.id, medley(songs));

    for (const user of [member, roadie]) {
      for (const attempt of [
        () => createSelection(db.pool, user, project.id, medley(songs, "Otro")),
        () => updateSelection(db.pool, user, project.id, selection.id, medley(songs, "Otro")),
        () => deleteSelection(db.pool, user, project.id, selection.id),
      ]) {
        await assert.rejects(attempt(), { name: "ServiceError", code: "forbidden" });
      }
    }
    assert.deepEqual(await listSelections(db.pool, owner, project.id), [selection]);
  });

  it("lets every Member browse the Selections", async () => {
    const { project, songs, owner, member, roadie } = await band(db, "browsers");
    const selection = await createSelection(db.pool, owner, project.id, medley(songs));

    for (const user of [member, roadie]) {
      assert.deepEqual(await listSelections(db.pool, user, project.id), [selection]);
    }
  });

  it("reports another Project's Selections as not found", async () => {
    const { project, songs, owner, outsider } = await band(db, "outsiders");
    const selection = await createSelection(db.pool, owner, project.id, medley(songs));

    for (const attempt of [
      () => listSelections(db.pool, outsider, project.id),
      () => createSelection(db.pool, outsider, project.id, medley(songs)),
      () => updateSelection(db.pool, outsider, project.id, selection.id, medley(songs)),
      () => deleteSelection(db.pool, outsider, project.id, selection.id),
    ]) {
      await assert.rejects(attempt(), { name: "ServiceError", code: "not_found" });
    }
  });
});
