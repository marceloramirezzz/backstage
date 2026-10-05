import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createTestDb, type TestDb } from "../../test/test-db.ts";
import { verifiedUser } from "../../test/users.ts";
import { createEvent } from "./events.ts";
import { loadTeleprompter, saveLyrics } from "./lyrics.ts";
import { createProject } from "./projects.ts";
import { createSelection } from "./selections.ts";
import { createSetlist } from "./setlists.ts";
import { createSong } from "./songs.ts";

const SONG = { key: null, durationSeconds: 200, intensity: "medium" } as const;

describe("lyrics and the teleprompter", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  async function stage(email: string) {
    const owner = await verifiedUser(db, email);
    const project = await createProject(db.pool, owner, { name: "Los Letristas" });
    const besame = await createSong(db.pool, owner, project.id, { ...SONG, name: "Bésame", key: "Am" });
    const india = await createSong(db.pool, owner, project.id, { ...SONG, name: "India" });
    const medley = await createSelection(db.pool, owner, project.id, {
      name: "Enganchado",
      durationSeconds: 400,
      intensity: "medium",
      songIds: [besame.id, india.id],
    });
    return { owner, project, besame, india, medley };
  }

  it("plays a Song's lyrics, none yet", async () => {
    const { owner, project, besame } = await stage("none@example.com");

    const prompter = await loadTeleprompter(db.pool, owner, project.id, { kind: "song", id: besame.id });

    assert.deepEqual(prompter, {
      title: "Bésame",
      items: [{ kind: "song", name: "Bésame", key: "Am", lyrics: null }],
    });
  });

  it("saves lyrics, keeping their line breaks and indentation, and blank clears them", async () => {
    const { owner, project, besame, medley } = await stage("save@example.com");

    await saveLyrics(db.pool, owner, project.id, { kind: "song", id: besame.id }, "  Verso\r\n\r\nCoro  \n\n");
    await saveLyrics(db.pool, owner, project.id, { kind: "selection", id: medley.id }, "Medley");

    const song = await loadTeleprompter(db.pool, owner, project.id, { kind: "song", id: besame.id });
    const selection = await loadTeleprompter(db.pool, owner, project.id, { kind: "selection", id: medley.id });
    assert.equal(song.items[0].lyrics, "  Verso\n\nCoro");
    assert.equal(selection.items[0].lyrics, "Medley");

    await saveLyrics(db.pool, owner, project.id, { kind: "song", id: besame.id }, "  \n ");
    const cleared = await loadTeleprompter(db.pool, owner, project.id, { kind: "song", id: besame.id });
    assert.equal(cleared.items[0].lyrics, null);
  });

  it("plays a Setlist in order, as its Songs are now", async () => {
    const { owner, project, besame, india, medley } = await stage("setlist@example.com");
    const setlist = await createSetlist(db.pool, owner, project.id, {
      name: "Boda",
      items: [
        { kind: "song", id: india.id },
        { kind: "selection", id: medley.id },
        { kind: "song", id: besame.id },
      ],
    });
    await saveLyrics(db.pool, owner, project.id, { kind: "song", id: besame.id }, "Bésame mucho");

    const prompter = await loadTeleprompter(db.pool, owner, project.id, { kind: "setlist", id: setlist.id });

    assert.equal(prompter.title, "Boda");
    assert.deepEqual(
      prompter.items.map((i) => [i.kind, i.name, i.lyrics]),
      [
        ["song", "India", null],
        ["selection", "Enganchado", null],
        ["song", "Bésame", "Bésame mucho"],
      ],
    );
  });

  it("plays an Event's Setlist as it was when copied, not as the Song is now", async () => {
    const { owner, project, besame, medley } = await stage("event@example.com");
    await saveLyrics(db.pool, owner, project.id, { kind: "song", id: besame.id }, "Letra vieja");
    await saveLyrics(db.pool, owner, project.id, { kind: "selection", id: medley.id }, "Medley viejo");
    const setlist = await createSetlist(db.pool, owner, project.id, {
      name: "Boda",
      items: [
        { kind: "song", id: besame.id },
        { kind: "selection", id: medley.id },
      ],
    });
    const event = await createEvent(db.pool, owner, project.id, {
      name: "Casamiento",
      date: "2030-01-05",
      durationMinutes: 60,
      setlistId: setlist.id,
    });
    await saveLyrics(db.pool, owner, project.id, { kind: "song", id: besame.id }, "Letra nueva");

    const prompter = await loadTeleprompter(db.pool, owner, project.id, { kind: "event", id: event.id });

    assert.equal(prompter.title, "Casamiento");
    assert.deepEqual(
      prompter.items.map((i) => [i.kind, i.name, i.lyrics]),
      [
        ["song", "Bésame", "Letra vieja"],
        ["selection", "Enganchado", "Medley viejo"],
      ],
    );
  });

  it("keeps lyrics to Project Members", async () => {
    const { owner, project, besame } = await stage("perm@example.com");
    const stranger = await verifiedUser(db, "perm-stranger@example.com");

    await assert.rejects(
      saveLyrics(db.pool, stranger, project.id, { kind: "song", id: besame.id }, "x"),
      { code: "not_found" },
    );
    await assert.rejects(
      loadTeleprompter(db.pool, stranger, project.id, { kind: "song", id: besame.id }),
      { code: "not_found" },
    );
    await assert.rejects(
      loadTeleprompter(db.pool, owner, project.id, { kind: "song", id: "nope" }),
      { code: "not_found" },
    );
  });

  it("refuses lyrics that are too long", async () => {
    const { owner, project, besame } = await stage("long@example.com");

    await assert.rejects(
      saveLyrics(db.pool, owner, project.id, { kind: "song", id: besame.id }, "a".repeat(20_001)),
      { code: "invalid_input" },
    );
  });
});
