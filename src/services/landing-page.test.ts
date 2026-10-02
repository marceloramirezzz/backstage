import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createTestDb, type TestDb } from "../../test/test-db.ts";
import { verifiedUser } from "../../test/users.ts";
import { createEvent, updateEvent } from "./events.ts";
import { acceptInvitation, sendInvitations } from "./invitations.ts";
import { getLandingSettings, getPublicLanding, saveLandingSettings } from "./landing-page.ts";
import { createProject } from "./projects.ts";
import { listRoles } from "./roles.ts";
import { createSelection } from "./selections.ts";
import { createSong } from "./songs.ts";

describe("Landing page", () => {
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
    return { owner, project };
  }

  describe("settings", () => {
    it("is off by default, with no address", async () => {
      const b = await band("default");
      assert.deepEqual(await getLandingSettings(db.pool, b.owner, b.project.id), { enabled: false, slug: null });
    });

    it("lets an Admin turn it on with an address, normalised to lowercase", async () => {
      const b = await band("on");
      const saved = await saveLandingSettings(db.pool, b.owner, b.project.id, { enabled: true, slug: "  Los-Del-Valle " });
      assert.deepEqual(saved, { enabled: true, slug: "los-del-valle" });
      assert.deepEqual(await getLandingSettings(db.pool, b.owner, b.project.id), saved);
    });

    it("keeps the address when turned off again", async () => {
      const b = await band("off");
      await saveLandingSettings(db.pool, b.owner, b.project.id, { enabled: true, slug: "off-band" });
      const saved = await saveLandingSettings(db.pool, b.owner, b.project.id, { enabled: false, slug: "off-band" });
      assert.deepEqual(saved, { enabled: false, slug: "off-band" });
    });

    it("needs an address to turn on", async () => {
      const b = await band("noslug");
      await assert.rejects(saveLandingSettings(db.pool, b.owner, b.project.id, { enabled: true, slug: " " }), {
        code: "invalid_input",
      });
    });

    it("rejects malformed addresses", async () => {
      const b = await band("malformed");
      for (const slug of ["ab", "has space", "-lead", "trail-", "dos--guiones", "ñandú", "a/b", "x".repeat(41)]) {
        await assert.rejects(saveLandingSettings(db.pool, b.owner, b.project.id, { enabled: false, slug }), {
          code: "invalid_input",
        });
      }
    });

    it("rejects an address another Banda has taken, whatever its case", async () => {
      const a = await band("taken-a");
      const c = await band("taken-b");
      await saveLandingSettings(db.pool, a.owner, a.project.id, { enabled: false, slug: "popular" });
      await assert.rejects(saveLandingSettings(db.pool, c.owner, c.project.id, { enabled: true, slug: "POPULAR" }), {
        code: "slug_taken",
      });
      // Its own address is fine to save again.
      await saveLandingSettings(db.pool, a.owner, a.project.id, { enabled: true, slug: "popular" });
    });

    it("rejects reserved words", async () => {
      const b = await band("reserved");
      for (const slug of ["p", "ingresar", "crear-cuenta", "bienvenida", "api"]) {
        await assert.rejects(saveLandingSettings(db.pool, b.owner, b.project.id, { enabled: true, slug }), {
          code: "slug_reserved",
        });
      }
    });

    it("is for Admins only, to read or write", async () => {
      const b = await band("perms");
      const member = await verifiedUser(db, "perms-member@example.com");
      const roles = await listRoles(db.pool, b.owner, b.project.id);
      const [{ invitation }] = await sendInvitations(db.pool, b.owner, b.project.id, [
        { email: member.email, roleId: roles.find((r) => r.kind === "member")!.id },
      ]);
      await acceptInvitation(db.pool, member, invitation.id);
      await assert.rejects(saveLandingSettings(db.pool, member, b.project.id, { enabled: true, slug: "perms-band" }), {
        code: "forbidden",
      });
      await assert.rejects(getLandingSettings(db.pool, member, b.project.id), { code: "forbidden" });
      const outsider = await verifiedUser(db, "perms-outsider@example.com");
      await assert.rejects(getLandingSettings(db.pool, outsider, b.project.id), { code: "not_found" });
    });
  });

  describe("public page", () => {
    const TODAY = "2026-10-02";

    async function publicBand(name: string) {
      const b = await band(name);
      await saveLandingSettings(db.pool, b.owner, b.project.id, { enabled: true, slug: name });
      const gig = async (
        gigName: string,
        date: string,
        status: "pending" | "confirmed" | "paid" | "cancelled",
        isPublic: boolean,
      ) => {
        const e = await createEvent(db.pool, b.owner, b.project.id, {
          name: gigName,
          date,
          durationMinutes: 120,
          location: "Bar La Esquina",
          pay: 1_000_000,
        });
        await updateEvent(db.pool, b.owner, b.project.id, e.id, { status, isPublic });
      };
      return { ...b, gig };
    }

    it("is not found when off, unknown or never configured", async () => {
      const b = await band("hidden");
      assert.equal(await getPublicLanding(db.pool, "hidden", TODAY), null);
      await saveLandingSettings(db.pool, b.owner, b.project.id, { enabled: false, slug: "hidden" });
      assert.equal(await getPublicLanding(db.pool, "hidden", TODAY), null);
      assert.equal(await getPublicLanding(db.pool, "nobody-here", TODAY), null);
      await saveLandingSettings(db.pool, b.owner, b.project.id, { enabled: true, slug: "hidden" });
      assert.equal((await getPublicLanding(db.pool, "HIDDEN", TODAY))?.name, "hidden");
    });

    it("shows only titles and intensity of Songs and Selections, never key or duration", async () => {
      const b = await publicBand("repertoire");
      const song = await createSong(db.pool, b.owner, b.project.id, {
        name: "Colegiala", key: "Dm", durationSeconds: 215, intensity: "danceable",
      });
      const other = await createSong(db.pool, b.owner, b.project.id, {
        name: "Bésame mucho", key: null, durationSeconds: 180, intensity: "calm",
      });
      await createSelection(db.pool, b.owner, b.project.id, {
        name: "Enganchado cumbia", durationSeconds: 600, intensity: "energetic", songIds: [song.id, other.id],
      });
      const page = await getPublicLanding(db.pool, "repertoire", TODAY);
      assert.deepEqual(page?.repertoire, [
        { name: "Bésame mucho", intensity: "calm" },
        { name: "Colegiala", intensity: "danceable" },
        { name: "Enganchado cumbia", intensity: "energetic" },
      ]);
    });

    it("lists only public Confirmed and Paid Events, upcoming and played", async () => {
      const b = await publicBand("visibility");
      await b.gig("Confirmed public", "2026-10-17", "confirmed", true);
      await b.gig("Paid public", "2026-09-26", "paid", true);
      await b.gig("Today", TODAY, "confirmed", true);
      await b.gig("Confirmed private", "2026-10-20", "confirmed", false);
      await b.gig("Paid private", "2026-09-20", "paid", false);
      await b.gig("Pending public", "2026-10-21", "pending", true);
      await b.gig("Cancelled public", "2026-10-22", "cancelled", true);
      const page = await getPublicLanding(db.pool, "visibility", TODAY);
      assert.deepEqual(
        page?.appearances.map((a) => [a.name, a.date, a.upcoming]),
        [
          ["Today", TODAY, true],
          ["Confirmed public", "2026-10-17", true],
          ["Paid public", "2026-09-26", false],
        ],
      );
      assert.equal(page?.appearances[0].location, "Bar La Esquina");
    });

    it("never mixes in another Banda's content", async () => {
      const a = await publicBand("mix-a");
      const c = await publicBand("mix-b");
      await a.gig("A gig", "2026-10-17", "confirmed", true);
      await createSong(db.pool, c.owner, c.project.id, { name: "Only B", key: null, durationSeconds: 100, intensity: "calm" });
      const page = await getPublicLanding(db.pool, "mix-a", TODAY);
      assert.deepEqual(page?.appearances.map((x) => x.name), ["A gig"]);
      assert.deepEqual(page?.repertoire, []);
    });
  });
});
