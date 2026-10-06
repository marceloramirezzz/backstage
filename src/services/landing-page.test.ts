import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createTestDb, type TestDb } from "../../test/test-db.ts";
import { verifiedUser } from "../../test/users.ts";
import { createEvent, updateEvent } from "./events.ts";
import { acceptInvitation, sendInvitations } from "./invitations.ts";
import {
  getLandingContent,
  getLandingProfile,
  getLandingSettings,
  getPublicLanding,
  saveLandingAlbum,
  saveLandingAudio,
  saveLandingContacts,
  saveLandingProfile,
  saveLandingSettings,
  saveLandingVideos,
} from "./landing-page.ts";
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

    it("turns a live page off when saved with the switch off and a blank address", async () => {
      const b = await band("blank-off");
      await saveLandingSettings(db.pool, b.owner, b.project.id, { enabled: true, slug: "blank-off" });
      const saved = await saveLandingSettings(db.pool, b.owner, b.project.id, { enabled: false, slug: "" });
      assert.deepEqual(saved, { enabled: false, slug: "blank-off" });
      assert.equal(await getPublicLanding(db.pool, "blank-off", "2026-10-02"), null);
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

  async function adminAndMember(name: string) {
    const b = await band(name);
    const member = await verifiedUser(db, `${name}-member@example.com`);
    const roles = await listRoles(db.pool, b.owner, b.project.id);
    const [{ invitation }] = await sendInvitations(db.pool, b.owner, b.project.id, [
      { email: member.email, roleId: roles.find((r) => r.kind === "member")!.id },
    ]);
    await acceptInvitation(db.pool, member, invitation.id);
    return { ...b, member };
  }

  describe("album", () => {
    const photo = (n: number, caption: string | null = null) => ({ url: `https://img.example/${n}.jpg`, caption });

    it("starts empty", async () => {
      const b = await band("album-empty");
      assert.deepEqual(await getLandingContent(db.pool, b.owner, b.project.id), { photos: [], contacts: [], audio: [], videos: [] });
    });

    it("keeps the order and captions it was saved with, trimming captions and blanking empty ones", async () => {
      const b = await band("album-order");
      const saved = await saveLandingAlbum(db.pool, b.owner, b.project.id, [
        photo(3, "  Festival del Lago "),
        photo(1),
        photo(2, "   "),
      ]);
      const expected = [photo(3, "Festival del Lago"), photo(1), photo(2)];
      assert.deepEqual(saved, expected);
      assert.deepEqual((await getLandingContent(db.pool, b.owner, b.project.id)).photos, expected);
    });

    it("replaces the whole album on each save, and can empty it", async () => {
      const b = await band("album-replace");
      await saveLandingAlbum(db.pool, b.owner, b.project.id, [photo(1), photo(2), photo(3)]);
      await saveLandingAlbum(db.pool, b.owner, b.project.id, [photo(2, "Reordered"), photo(1)]);
      assert.deepEqual((await getLandingContent(db.pool, b.owner, b.project.id)).photos, [photo(2, "Reordered"), photo(1)]);
      await saveLandingAlbum(db.pool, b.owner, b.project.id, []);
      assert.deepEqual((await getLandingContent(db.pool, b.owner, b.project.id)).photos, []);
    });

    it("rejects photos that are not https addresses, or are too many, and keeps the old album", async () => {
      const b = await band("album-invalid");
      await saveLandingAlbum(db.pool, b.owner, b.project.id, [photo(1)]);
      for (const url of ["", "http://img.example/1.jpg", "javascript:alert(1)", "img.example/1.jpg", "https://a b"]) {
        await assert.rejects(saveLandingAlbum(db.pool, b.owner, b.project.id, [{ url, caption: null }]), {
          code: "invalid_input",
        });
      }
      await assert.rejects(
        saveLandingAlbum(db.pool, b.owner, b.project.id, [{ url: photo(1).url, caption: "x".repeat(141) }]),
        { code: "invalid_input" },
      );
      await assert.rejects(
        saveLandingAlbum(db.pool, b.owner, b.project.id, Array.from({ length: 31 }, (_, i) => photo(i))),
        { code: "invalid_input" },
      );
      assert.deepEqual((await getLandingContent(db.pool, b.owner, b.project.id)).photos, [photo(1)]);
    });

    it("is for Admins only, to read or write", async () => {
      const b = await adminAndMember("album-perms");
      await assert.rejects(saveLandingAlbum(db.pool, b.member, b.project.id, [photo(1)]), { code: "forbidden" });
      await assert.rejects(getLandingContent(db.pool, b.member, b.project.id), { code: "forbidden" });
    });
  });

  describe("contacts", () => {
    it("keeps presets and Other with its label, in order", async () => {
      const b = await band("contacts-order");
      const saved = await saveLandingContacts(db.pool, b.owner, b.project.id, [
        { platform: "whatsapp", label: null, value: " +595 981 123-456 " },
        { platform: "instagram", label: null, value: "@losdelvalle.py" },
        { platform: "other", label: " Telegram ", value: "https://t.me/losdelvalle" },
      ]);
      const expected = [
        { platform: "whatsapp", label: null, value: "+595 981 123-456" },
        { platform: "instagram", label: null, value: "@losdelvalle.py" },
        { platform: "other", label: "Telegram", value: "https://t.me/losdelvalle" },
      ];
      assert.deepEqual(saved, expected);
      assert.deepEqual((await getLandingContent(db.pool, b.owner, b.project.id)).contacts, expected);
    });

    it("drops a label given to a preset", async () => {
      const b = await band("contacts-label");
      const [saved] = await saveLandingContacts(db.pool, b.owner, b.project.id, [
        { platform: "email", label: "Reservas", value: "band@example.com" },
      ]);
      assert.equal(saved.label, null);
    });

    it("replaces the whole list on each save", async () => {
      const b = await band("contacts-replace");
      await saveLandingContacts(db.pool, b.owner, b.project.id, [
        { platform: "email", label: null, value: "a@example.com" },
        { platform: "phone", label: null, value: "0981123456" },
      ]);
      await saveLandingContacts(db.pool, b.owner, b.project.id, [{ platform: "phone", label: null, value: "0981123456" }]);
      assert.equal((await getLandingContent(db.pool, b.owner, b.project.id)).contacts.length, 1);
    });

    it("rejects unknown platforms, Other without a label, bad values and too many, keeping the old list", async () => {
      const b = await band("contacts-invalid");
      await saveLandingContacts(db.pool, b.owner, b.project.id, [{ platform: "email", label: null, value: "a@example.com" }]);
      const bad = [
        { platform: "myspace", label: null, value: "x" },
        { platform: "other", label: null, value: "x" },
        { platform: "other", label: "  ", value: "x" },
        { platform: "other", label: "Telegram", value: " " },
        { platform: "email", label: null, value: "not-an-email" },
        { platform: "website", label: null, value: "javascript:alert(1)" },
        { platform: "phone", label: null, value: "12" },
        { platform: "other", label: "x".repeat(41), value: "x" },
        { platform: "other", label: "Telegram", value: "x".repeat(201) },
      ];
      for (const contact of bad) {
        await assert.rejects(
          // @ts-expect-error: deliberately not a ContactPlatform for some of them
          saveLandingContacts(db.pool, b.owner, b.project.id, [contact]),
          { code: "invalid_input" },
        );
      }
      await assert.rejects(
        saveLandingContacts(
          db.pool,
          b.owner,
          b.project.id,
          Array.from({ length: 13 }, () => ({ platform: "email" as const, label: null, value: "a@example.com" })),
        ),
        { code: "invalid_input" },
      );
      assert.equal((await getLandingContent(db.pool, b.owner, b.project.id)).contacts.length, 1);
    });

    it("is for Admins only", async () => {
      const b = await adminAndMember("contacts-perms");
      await assert.rejects(
        saveLandingContacts(db.pool, b.member, b.project.id, [{ platform: "email", label: null, value: "a@example.com" }]),
        { code: "forbidden" },
      );
    });
  });

  describe("profile", () => {
    const EMPTY = { tagline: null, genre: null, services: [], yearsActive: null, travelArea: null, about: null };
    const FULL = {
      tagline: "La fiesta que no para",
      genre: "Cumbia y rock",
      services: ["wedding", "festival"] as const,
      yearsActive: 12,
      travelArea: "Todo el Paraguay",
      about: "Nacimos en Asunción.\nTocamos de todo.",
    };

    it("starts empty", async () => {
      const b = await band("profile-empty");
      assert.deepEqual(await getLandingProfile(db.pool, b.owner, b.project.id), EMPTY);
    });

    it("keeps each field, trimmed, and can set it before an address is chosen", async () => {
      const b = await band("profile-set");
      const saved = await saveLandingProfile(db.pool, b.owner, b.project.id, {
        ...FULL,
        services: [...FULL.services],
        tagline: "  La fiesta que no para ",
      });
      assert.deepEqual(saved, { ...FULL, services: ["wedding", "festival"] });
      assert.deepEqual(await getLandingProfile(db.pool, b.owner, b.project.id), saved);
    });

    it("clears each field with blanks, and dedupes services", async () => {
      const b = await band("profile-clear");
      await saveLandingProfile(db.pool, b.owner, b.project.id, { ...FULL, services: [...FULL.services] });
      const saved = await saveLandingProfile(db.pool, b.owner, b.project.id, {
        tagline: " ",
        genre: "",
        services: ["bar_restaurant", "bar_restaurant"],
        yearsActive: null,
        travelArea: "  ",
        about: "",
      });
      assert.deepEqual(saved, { ...EMPTY, services: ["bar_restaurant"] });
      assert.deepEqual(await saveLandingProfile(db.pool, b.owner, b.project.id, EMPTY), EMPTY);
    });

    it("accepts only services from the list", async () => {
      const b = await band("profile-services");
      await assert.rejects(
        saveLandingProfile(db.pool, b.owner, b.project.id, { ...EMPTY, services: ["wedding", "hacking"] }),
        { code: "invalid_input" },
      );
      assert.deepEqual(await getLandingProfile(db.pool, b.owner, b.project.id), EMPTY);
    });

    it("rejects too-long text and bad years, keeping the old profile", async () => {
      const b = await band("profile-invalid");
      await saveLandingProfile(db.pool, b.owner, b.project.id, { ...EMPTY, tagline: "Keep" });
      for (const patch of [
        { tagline: "x".repeat(121) },
        { genre: "x".repeat(61) },
        { travelArea: "x".repeat(121) },
        { about: "x".repeat(2001) },
        { yearsActive: -1 },
        { yearsActive: 101 },
        { yearsActive: 1.5 },
      ]) {
        await assert.rejects(saveLandingProfile(db.pool, b.owner, b.project.id, { ...EMPTY, ...patch }), {
          code: "invalid_input",
        });
      }
      assert.equal((await getLandingProfile(db.pool, b.owner, b.project.id)).tagline, "Keep");
    });

    it("is for Admins only, to read or write", async () => {
      const b = await adminAndMember("profile-perms");
      await assert.rejects(saveLandingProfile(db.pool, b.member, b.project.id, EMPTY), { code: "forbidden" });
      await assert.rejects(getLandingProfile(db.pool, b.member, b.project.id), { code: "forbidden" });
    });
  });

  describe("audio", () => {
    const track = (n: number, title: string | null = null) => ({ url: `https://audio.example/${n}.mp3`, title });

    it("keeps order and titles, trimming and blanking, and replaces on each save", async () => {
      const b = await band("audio-order");
      const saved = await saveLandingAudio(db.pool, b.owner, b.project.id, [track(2, " Demo "), track(1, "  ")]);
      assert.deepEqual(saved, [track(2, "Demo"), track(1)]);
      assert.deepEqual((await getLandingContent(db.pool, b.owner, b.project.id)).audio, saved);
      await saveLandingAudio(db.pool, b.owner, b.project.id, []);
      assert.deepEqual((await getLandingContent(db.pool, b.owner, b.project.id)).audio, []);
    });

    it("rejects non-https addresses, long titles and too many, keeping the old list", async () => {
      const b = await band("audio-invalid");
      await saveLandingAudio(db.pool, b.owner, b.project.id, [track(1)]);
      for (const url of ["", "http://a.example/1.mp3", "javascript:alert(1)", "a.example/1.mp3", "https://a b"]) {
        await assert.rejects(saveLandingAudio(db.pool, b.owner, b.project.id, [{ url, title: null }]), {
          code: "invalid_input",
        });
      }
      await assert.rejects(saveLandingAudio(db.pool, b.owner, b.project.id, [track(1, "x".repeat(141))]), {
        code: "invalid_input",
      });
      await assert.rejects(
        saveLandingAudio(db.pool, b.owner, b.project.id, Array.from({ length: 11 }, (_, i) => track(i))),
        { code: "invalid_input" },
      );
      assert.deepEqual((await getLandingContent(db.pool, b.owner, b.project.id)).audio, [track(1)]);
    });

    it("is for Admins only", async () => {
      const b = await adminAndMember("audio-perms");
      await assert.rejects(saveLandingAudio(db.pool, b.member, b.project.id, [track(1)]), { code: "forbidden" });
    });
  });

  describe("videos", () => {
    const yt = (title: string | null = null) => ({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title });
    const vimeo = { url: "https://vimeo.com/76979871", title: null };

    it("keeps YouTube and Vimeo links in order, and replaces on each save", async () => {
      const b = await band("video-order");
      const saved = await saveLandingVideos(db.pool, b.owner, b.project.id, [vimeo, yt(" En vivo ")]);
      assert.deepEqual(saved, [vimeo, yt("En vivo")]);
      assert.deepEqual((await getLandingContent(db.pool, b.owner, b.project.id)).videos, saved);
      await saveLandingVideos(db.pool, b.owner, b.project.id, []);
      assert.deepEqual((await getLandingContent(db.pool, b.owner, b.project.id)).videos, []);
    });

    it("rejects any other host, keeping the old list", async () => {
      const b = await band("video-invalid");
      await saveLandingVideos(db.pool, b.owner, b.project.id, [vimeo]);
      for (const url of [
        "https://example.com/video.mp4",
        "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
        "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://www.youtube.com/",
        "https://tiktok.com/@a/video/1",
        "",
      ]) {
        await assert.rejects(saveLandingVideos(db.pool, b.owner, b.project.id, [{ url, title: null }]), {
          code: "invalid_input",
        });
      }
      await assert.rejects(
        saveLandingVideos(db.pool, b.owner, b.project.id, Array.from({ length: 7 }, () => vimeo)),
        { code: "invalid_input" },
      );
      assert.deepEqual((await getLandingContent(db.pool, b.owner, b.project.id)).videos, [vimeo]);
    });

    it("is for Admins only", async () => {
      const b = await adminAndMember("video-perms");
      await assert.rejects(saveLandingVideos(db.pool, b.member, b.project.id, [vimeo]), { code: "forbidden" });
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

    it("shows the album and contacts in order, live, with no draft", async () => {
      const b = await publicBand("album-public");
      let page = await getPublicLanding(db.pool, "album-public", TODAY);
      assert.deepEqual([page?.photos, page?.contacts], [[], []]);
      await saveLandingAlbum(db.pool, b.owner, b.project.id, [
        { url: "https://img.example/2.jpg", caption: "Segunda" },
        { url: "https://img.example/1.jpg", caption: null },
      ]);
      await saveLandingContacts(db.pool, b.owner, b.project.id, [
        { platform: "email", label: null, value: "band@example.com" },
        { platform: "other", label: "Telegram", value: "https://t.me/band" },
      ]);
      page = await getPublicLanding(db.pool, "album-public", TODAY);
      assert.deepEqual(page?.photos, [
        { url: "https://img.example/2.jpg", caption: "Segunda" },
        { url: "https://img.example/1.jpg", caption: null },
      ]);
      assert.deepEqual(page?.contacts, [
        { platform: "email", label: null, value: "band@example.com" },
        { platform: "other", label: "Telegram", value: "https://t.me/band" },
      ]);
    });

    it("never shows another Banda's album or contacts", async () => {
      const a = await publicBand("album-mix-a");
      await publicBand("album-mix-b");
      await saveLandingAlbum(db.pool, a.owner, a.project.id, [{ url: "https://img.example/a.jpg", caption: null }]);
      await saveLandingContacts(db.pool, a.owner, a.project.id, [{ platform: "email", label: null, value: "a@example.com" }]);
      const page = await getPublicLanding(db.pool, "album-mix-b", TODAY);
      assert.deepEqual([page?.photos, page?.contacts], [[], []]);
    });

    it("shows the profile, audio and videos live, each only when it has content", async () => {
      const b = await publicBand("rich");
      const bare = await getPublicLanding(db.pool, "rich", TODAY);
      assert.deepEqual(bare?.profile, {
        tagline: null, genre: null, services: [], yearsActive: null, travelArea: null, about: null,
      });
      assert.deepEqual([bare?.audio, bare?.videos], [[], []]);
      await saveLandingProfile(db.pool, b.owner, b.project.id, {
        tagline: "Hola", genre: null, services: ["wedding", "festival"], yearsActive: 0, travelArea: null, about: null,
      });
      await saveLandingAudio(db.pool, b.owner, b.project.id, [{ url: "https://audio.example/1.mp3", title: "Demo" }]);
      await saveLandingVideos(db.pool, b.owner, b.project.id, [
        { url: "https://youtu.be/dQw4w9WgXcQ", title: null },
        { url: "https://vimeo.com/76979871", title: "Vivo" },
      ]);
      const page = await getPublicLanding(db.pool, "rich", TODAY);
      assert.deepEqual(page?.profile, {
        tagline: "Hola", genre: null, services: ["wedding", "festival"], yearsActive: 0, travelArea: null, about: null,
      });
      assert.deepEqual(page?.audio, [{ url: "https://audio.example/1.mp3", title: "Demo" }]);
      assert.deepEqual(page?.videos, [
        { embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", title: null },
        { embedUrl: "https://player.vimeo.com/video/76979871", title: "Vivo" },
      ]);
    });

    it("never shows another Banda's profile, audio or videos", async () => {
      const a = await publicBand("rich-mix-a");
      await publicBand("rich-mix-b");
      await saveLandingProfile(db.pool, a.owner, a.project.id, {
        tagline: "A", genre: null, services: ["wedding"], yearsActive: 3, travelArea: null, about: null,
      });
      await saveLandingAudio(db.pool, a.owner, a.project.id, [{ url: "https://audio.example/a.mp3", title: null }]);
      await saveLandingVideos(db.pool, a.owner, a.project.id, [{ url: "https://vimeo.com/1", title: null }]);
      const page = await getPublicLanding(db.pool, "rich-mix-b", TODAY);
      assert.deepEqual([page?.profile.tagline, page?.profile.services, page?.audio, page?.videos], [null, [], [], []]);
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
