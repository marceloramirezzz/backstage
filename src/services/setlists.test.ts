import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createTestDb, type TestDb } from "../../test/test-db.ts";
import { verifiedUser } from "../../test/users.ts";
import type { User } from "./accounts.ts";
import { acceptInvitation, sendInvitations } from "./invitations.ts";
import { createProject, type Project } from "./projects.ts";
import { createRole, listRoles } from "./roles.ts";
import { createSelection, deleteSelection, listSelections, updateSelection } from "./selections.ts";
import {
  createSetlist,
  deleteSetlist,
  duplicateSetlist,
  listSetlists,
  updateSetlist,
  type SetlistInput,
} from "./setlists.ts";
import { createSong, deleteSong, listSongs, updateSong, type SongInput } from "./songs.ts";

const SONG: SongInput = {
  name: "Colegiala",
  key: "Am",
  durationSeconds: 210,
  intensity: "danceable",
};

// A Project with its Owner, three Songs and a Selection of the first two.
async function repertoire(db: TestDb, email: string) {
  const owner = await verifiedUser(db, email);
  const project = await createProject(db.pool, owner, { name: `Banda de ${email}` });
  const addSong = (name: string, durationSeconds: number) =>
    createSong(db.pool, owner, project.id, { ...SONG, name, durationSeconds });
  const songs = [
    await addSong("Bésame mucho", 225),
    await addSong("India", 245),
    await addSong("Galopera", 200),
  ];
  const selection = await createSelection(db.pool, owner, project.id, {
    name: "Enganchado cumbia",
    durationSeconds: 750,
    intensity: "danceable",
    songIds: [songs[0].id, songs[1].id],
  });
  return { owner, project, songs, selection };
}

// A well-formed id that names nothing.
const VALID_ID = "00000000-0000-4000-8000-000000000000";

// Setlist items pointing at a Song or a Selection.
const song = (s: { id: string }) => ({ kind: "song" as const, id: s.id });
const selection = (s: { id: string }) => ({ kind: "selection" as const, id: s.id });

describe("createSetlist", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("adds a Setlist of Songs and Selections in order, repeats allowed, totalling their durations", async () => {
    const { owner, project, songs, selection: medley } = await repertoire(db, "create@example.com");
    const [besame, india, galopera] = songs;

    const setlist = await createSetlist(db.pool, owner, project.id, {
      name: "Boda clásica",
      category: "boda",
      items: [song(besame), selection(medley), song(galopera), song(besame)],
    });

    assert.deepEqual(setlist, {
      id: setlist.id,
      name: "Boda clásica",
      category: "boda",
      items: [
        { kind: "song", item: besame },
        { kind: "selection", item: { ...medley, songs: [besame, india] } },
        { kind: "song", item: galopera },
        { kind: "song", item: besame },
      ],
      // 3:45 + 12:30 + 3:20 + 3:45
      durationSeconds: 1400,
    });
    assert.deepEqual(await listSetlists(db.pool, owner, project.id), [setlist]);
  });
  it("trims the name and category, and keeps no category when it's blank", async () => {
    const { owner, project, songs } = await repertoire(db, "trim@example.com");

    const setlist = await createSetlist(db.pool, owner, project.id, {
      name: "  Acústico corto ",
      category: "   ",
      items: [song(songs[0])],
    });

    assert.equal(setlist.name, "Acústico corto");
    assert.equal(setlist.category, null);
  });

  it("allows an empty Setlist, lasting nothing", async () => {
    const { owner, project } = await repertoire(db, "empty@example.com");

    const setlist = await createSetlist(db.pool, owner, project.id, {
      name: "Por armar",
      items: [],
    });

    assert.deepEqual(setlist.items, []);
    assert.equal(setlist.durationSeconds, 0);
  });

  it("refuses a Song or Selection from another Project", async () => {
    const other = await repertoire(db, "foreign-other@example.com");
    const { owner, project, songs } = await repertoire(db, "foreign@example.com");
    const theirs = await createProject(db.pool, owner, { name: "Los Ajenos" });
    const theirSong = await createSong(db.pool, owner, theirs.id, SONG);

    for (const items of [
      [song(songs[0]), song(theirSong)],
      [selection(other.selection)],
      [song(other.selection)], // a Selection passed off as a Song
    ]) {
      await assert.rejects(createSetlist(db.pool, owner, project.id, { name: "Mezcla", items }), {
        name: "ServiceError",
        code: "invalid_input",
      });
    }
    assert.deepEqual(await listSetlists(db.pool, owner, project.id), []);
  });

  const invalid: [string, Partial<Record<keyof SetlistInput, unknown>>][] = [
    ["a blank name", { name: "  " }],
    ["a missing item list", { items: undefined }],
    [
      "an item that's neither a Song nor a Selection",
      { items: [{ kind: "setlist", id: VALID_ID }] },
    ],
    ["a malformed item id", { items: [{ kind: "song", id: "not-a-uuid" }] }],
    ["an item that isn't an object", { items: [VALID_ID] }],
  ];
  for (const [i, [what, change]] of invalid.entries()) {
    it(`refuses ${what}`, async () => {
      const { owner, project, songs } = await repertoire(db, `invalid-${i}@example.com`);

      await assert.rejects(
        createSetlist(db.pool, owner, project.id, {
          name: "Boda clásica",
          items: [song(songs[0])],
          ...change,
        } as SetlistInput),
        { name: "ServiceError", code: "invalid_input" },
      );
      assert.deepEqual(await listSetlists(db.pool, owner, project.id), []);
    });
  }
});

describe("updateSetlist", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("renames a Setlist and replaces its items, in their new order", async () => {
    const { owner, project, songs, selection: medley } = await repertoire(db, "update@example.com");
    const [besame, india, galopera] = songs;
    const setlist = await createSetlist(db.pool, owner, project.id, {
      name: "Boda clásica",
      category: "boda",
      items: [song(besame), selection(medley), song(galopera)],
    });

    const updated = await updateSetlist(db.pool, owner, project.id, setlist.id, {
      name: "Cumbia toda la noche",
      category: "cumbia",
      items: [song(galopera), song(besame), selection(medley), song(galopera)],
    });

    assert.deepEqual(updated, {
      id: setlist.id,
      name: "Cumbia toda la noche",
      category: "cumbia",
      items: [
        { kind: "song", item: galopera },
        { kind: "song", item: besame },
        { kind: "selection", item: { ...medley, songs: [besame, india] } },
        { kind: "song", item: galopera },
      ],
      durationSeconds: 200 + 225 + 750 + 200,
    });
    assert.deepEqual(await listSetlists(db.pool, owner, project.id), [updated]);
  });

  it("validates like createSetlist, changing nothing", async () => {
    const { owner, project, songs } = await repertoire(db, "update-invalid@example.com");
    const setlist = await createSetlist(db.pool, owner, project.id, {
      name: "Boda clásica",
      items: [song(songs[0])],
    });
    const theirs = await repertoire(db, "update-invalid-other@example.com");

    for (const input of [
      { name: " ", items: [] },
      { name: "Otra", items: [song(songs[1]), song(theirs.songs[0])] },
    ]) {
      await assert.rejects(updateSetlist(db.pool, owner, project.id, setlist.id, input), {
        name: "ServiceError",
        code: "invalid_input",
      });
    }
    assert.deepEqual(await listSetlists(db.pool, owner, project.id), [setlist]);
  });

  it("reports a Setlist from another Project, or a malformed id, as not found", async () => {
    const { owner, project } = await repertoire(db, "update-other@example.com");
    const other = await createProject(db.pool, owner, { name: "Los Ajenos" });
    const theirs = await createSetlist(db.pool, owner, other.id, { name: "Ajena", items: [] });

    for (const id of [theirs.id, "not-a-uuid"]) {
      await assert.rejects(
        updateSetlist(db.pool, owner, project.id, id, { name: "Mía", items: [] }),
        { name: "ServiceError", code: "not_found" },
      );
    }
    assert.deepEqual(await listSetlists(db.pool, owner, other.id), [theirs]);
  });
});

describe("deleteSetlist", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("removes the Setlist, freeing its Songs to be deleted", async () => {
    const { owner, project, songs } = await repertoire(db, "delete@example.com");
    const setlist = await createSetlist(db.pool, owner, project.id, {
      name: "Boda clásica",
      items: [song(songs[2]), song(songs[2])],
    });
    const kept = await createSetlist(db.pool, owner, project.id, { name: "Otra", items: [] });

    await deleteSetlist(db.pool, owner, project.id, setlist.id);

    assert.deepEqual(await listSetlists(db.pool, owner, project.id), [kept]);
    await deleteSong(db.pool, owner, project.id, songs[2].id);
  });

  it("reports a Setlist from another Project, or one already deleted, as not found", async () => {
    const { owner, project } = await repertoire(db, "delete-other@example.com");
    const other = await createProject(db.pool, owner, { name: "Los Otros" });
    const theirs = await createSetlist(db.pool, owner, other.id, { name: "Ajena", items: [] });
    const gone = await createSetlist(db.pool, owner, project.id, { name: "Ida", items: [] });
    await deleteSetlist(db.pool, owner, project.id, gone.id);

    for (const id of [theirs.id, gone.id, "not-a-uuid"]) {
      await assert.rejects(deleteSetlist(db.pool, owner, project.id, id), {
        name: "ServiceError",
        code: "not_found",
      });
    }
    assert.deepEqual(await listSetlists(db.pool, owner, other.id), [theirs]);
  });
});

describe("duplicateSetlist", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("copies a Setlist's category and items under a new name, leaving the original as it was", async () => {
    const {
      owner,
      project,
      songs,
      selection: medley,
    } = await repertoire(db, "duplicate@example.com");
    const original = await createSetlist(db.pool, owner, project.id, {
      name: "Boda clásica",
      category: "boda",
      items: [song(songs[0]), selection(medley), song(songs[0])],
    });

    const copy = await duplicateSetlist(db.pool, owner, project.id, original.id, " Boda larga ");

    assert.notEqual(copy.id, original.id);
    assert.deepEqual(copy, { ...original, id: copy.id, name: "Boda larga" });
    assert.deepEqual(await listSetlists(db.pool, owner, project.id), [original, copy]);
  });

  it("makes an independent copy: editing one leaves the other", async () => {
    const { owner, project, songs } = await repertoire(db, "independent@example.com");
    const original = await createSetlist(db.pool, owner, project.id, {
      name: "Bar",
      items: [song(songs[0]), song(songs[1])],
    });
    const copy = await duplicateSetlist(db.pool, owner, project.id, original.id, "Bar (copia)");

    await updateSetlist(db.pool, owner, project.id, copy.id, {
      name: "Bar (copia)",
      items: [song(songs[2])],
    });
    await deleteSetlist(db.pool, owner, project.id, original.id);

    const [listed] = await listSetlists(db.pool, owner, project.id);
    assert.deepEqual(listed.items, [{ kind: "song", item: songs[2] }]);
  });

  it("refuses a blank name", async () => {
    const { owner, project } = await repertoire(db, "duplicate-blank@example.com");
    const original = await createSetlist(db.pool, owner, project.id, { name: "Bar", items: [] });

    await assert.rejects(duplicateSetlist(db.pool, owner, project.id, original.id, "  "), {
      name: "ServiceError",
      code: "invalid_input",
    });
    assert.deepEqual(await listSetlists(db.pool, owner, project.id), [original]);
  });

  it("reports a Setlist from another Project, or a malformed id, as not found", async () => {
    const { owner, project } = await repertoire(db, "duplicate-other@example.com");
    const other = await createProject(db.pool, owner, { name: "Los Otros" });
    const theirs = await createSetlist(db.pool, owner, other.id, { name: "Ajena", items: [] });

    for (const id of [theirs.id, "not-a-uuid"]) {
      await assert.rejects(duplicateSetlist(db.pool, owner, project.id, id, "Mía"), {
        name: "ServiceError",
        code: "not_found",
      });
    }
    assert.deepEqual(await listSetlists(db.pool, owner, project.id), []);
  });
});

describe("Songs and Selections in a Setlist", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("can't be deleted until removed from it", async () => {
    const { owner, project, songs, selection: medley } = await repertoire(db, "in-use@example.com");
    const setlist = await createSetlist(db.pool, owner, project.id, {
      name: "Boda clásica",
      items: [song(songs[2]), selection(medley)],
    });

    await assert.rejects(deleteSong(db.pool, owner, project.id, songs[2].id), {
      name: "ServiceError",
      code: "song_in_use",
    });
    await assert.rejects(deleteSelection(db.pool, owner, project.id, medley.id), {
      name: "ServiceError",
      code: "selection_in_use",
    });
    assert.equal((await listSongs(db.pool, owner, project.id)).length, 3);
    assert.equal((await listSelections(db.pool, owner, project.id)).length, 1);

    await updateSetlist(db.pool, owner, project.id, setlist.id, {
      name: "Boda clásica",
      items: [],
    });
    await deleteSelection(db.pool, owner, project.id, medley.id);
    await deleteSong(db.pool, owner, project.id, songs[2].id);
  });

  it("show their edits in the Setlist and its total", async () => {
    const { owner, project, songs, selection: medley } = await repertoire(db, "edited@example.com");
    await createSetlist(db.pool, owner, project.id, {
      name: "Boda clásica",
      items: [song(songs[2]), selection(medley), song(songs[2])],
    });

    const edited = await updateSong(db.pool, owner, project.id, songs[2].id, {
      ...SONG,
      name: "Galopera (versión larga)",
      durationSeconds: 300,
    });
    const editedMedley = await updateSelection(db.pool, owner, project.id, medley.id, {
      name: "Enganchado cumbia",
      durationSeconds: 600,
      intensity: "energetic",
      songIds: [songs[1].id, songs[0].id],
    });

    const [listed] = await listSetlists(db.pool, owner, project.id);
    assert.deepEqual(listed.items, [
      { kind: "song", item: edited },
      { kind: "selection", item: editedMedley },
      { kind: "song", item: edited },
    ]);
    assert.equal(listed.durationSeconds, 300 + 600 + 300);
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
// may edit setlists, one that may not, and a User from another Project.
async function band(db: TestDb, name: string) {
  const user = (who: string) => verifiedUser(db, `${name}-${who}@example.com`);
  const { owner, project, songs } = await repertoire(db, `${name}-owner@example.com`);
  const memberRole = (await listRoles(db.pool, owner, project.id)).find((r) => r.kind === "member");
  assert.ok(memberRole);
  const editorRole = await createRole(db.pool, owner, project.id, {
    name: "Director",
    toggles: {
      editRepertoireSetlistsEvents: true,
      removeMembers: false,
      seeTotalPayExpenses: false,
      manageBookings: false,
    },
  });
  const roadieRole = await createRole(db.pool, owner, project.id, {
    name: "Roadie",
    toggles: {
      editRepertoireSetlistsEvents: false,
      removeMembers: true,
      seeTotalPayExpenses: true,
      manageBookings: false,
    },
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

describe("Setlist permissions", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("lets Admins and Roles with the edit permission add, edit, duplicate and delete Setlists", async () => {
    const { project, songs, owner, editor } = await band(db, "editors");

    const mine = await createSetlist(db.pool, owner, project.id, { name: "Boda", items: [] });
    const theirs = await createSetlist(db.pool, editor, project.id, { name: "Bar", items: [] });
    await updateSetlist(db.pool, editor, project.id, mine.id, {
      name: "Boda clásica",
      items: [song(songs[0])],
    });
    await duplicateSetlist(db.pool, editor, project.id, mine.id, "Boda larga");
    await deleteSetlist(db.pool, editor, project.id, theirs.id);

    const names = (await listSetlists(db.pool, owner, project.id)).map((s) => s.name);
    assert.deepEqual(names, ["Boda clásica", "Boda larga"]);
  });

  it("refuses Members and Roles without the edit permission", async () => {
    const { project, owner, member, roadie } = await band(db, "readers");
    const setlist = await createSetlist(db.pool, owner, project.id, { name: "Boda", items: [] });

    for (const user of [member, roadie]) {
      for (const attempt of [
        () => createSetlist(db.pool, user, project.id, { name: "Otra", items: [] }),
        () => updateSetlist(db.pool, user, project.id, setlist.id, { name: "Otra", items: [] }),
        () => duplicateSetlist(db.pool, user, project.id, setlist.id, "Otra"),
        () => deleteSetlist(db.pool, user, project.id, setlist.id),
      ]) {
        await assert.rejects(attempt(), { name: "ServiceError", code: "forbidden" });
      }
    }
    assert.deepEqual(await listSetlists(db.pool, owner, project.id), [setlist]);
  });

  it("lets every Member see the Setlists and their totals", async () => {
    const { project, songs, owner, member, roadie } = await band(db, "browsers");
    const setlist = await createSetlist(db.pool, owner, project.id, {
      name: "Boda",
      items: [song(songs[0])],
    });

    for (const user of [member, roadie]) {
      assert.deepEqual(await listSetlists(db.pool, user, project.id), [setlist]);
    }
  });

  it("reports another Project's Setlists as not found", async () => {
    const { project, owner, outsider } = await band(db, "outsiders");
    const setlist = await createSetlist(db.pool, owner, project.id, { name: "Boda", items: [] });

    for (const attempt of [
      () => listSetlists(db.pool, outsider, project.id),
      () => createSetlist(db.pool, outsider, project.id, { name: "Otra", items: [] }),
      () => updateSetlist(db.pool, outsider, project.id, setlist.id, { name: "Otra", items: [] }),
      () => duplicateSetlist(db.pool, outsider, project.id, setlist.id, "Otra"),
      () => deleteSetlist(db.pool, outsider, project.id, setlist.id),
    ]) {
      await assert.rejects(attempt(), { name: "ServiceError", code: "not_found" });
    }
  });
});
