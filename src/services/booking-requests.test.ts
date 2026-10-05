import assert from "node:assert/strict";
import { after, before, describe, it, mock } from "node:test";
import { memoryMailer, sentTo } from "../../test/mailer.ts";
import { createTestDb, type TestDb } from "../../test/test-db.ts";
import { verifiedUser } from "../../test/users.ts";
import type { Mailer } from "../email/mailer.ts";
import {
  getBookingRequest,
  listBookingRequests,
  RATE_LIMIT_PER_HOUR,
  submitBookingRequest,
  type BookingRequestInput,
} from "./booking-requests.ts";
import { acceptInvitation, sendInvitations } from "./invitations.ts";
import { saveLandingSettings } from "./landing-page.ts";
import { createProject } from "./projects.ts";
import { createRole, listRoles, type RoleToggles } from "./roles.ts";

const NO_TOGGLES: RoleToggles = {
  editRepertoireSetlistsEvents: false,
  removeMembers: false,
  seeTotalPayExpenses: false,
  manageBookings: false,
};

const valid: BookingRequestInput = {
  clientName: "Ana Benítez",
  phone: "0981 123 456",
  email: "ana@example.com",
  eventType: "wedding",
  eventDate: "2027-03-20",
  description: "Boda de 150 personas, necesitamos música para la fiesta.",
};

describe("Booking Requests", () => {
  let db: TestDb;
  let ipCounter = 0;
  before(async () => {
    db = await createTestDb();
  });
  after(async () => {
    await db.close();
  });

  // A fresh address per call, so rate limits never leak between tests.
  const ip = () => `10.0.0.${++ipCounter}`;

  async function join(project: { id: string }, owner: Awaited<ReturnType<typeof verifiedUser>>, email: string, roleId: string) {
    const user = await verifiedUser(db, email);
    const [{ invitation }] = await sendInvitations(db.pool, owner, project.id, [{ email, roleId }]);
    await acceptInvitation(db.pool, user, invitation.id);
    return user;
  }

  // A Project with its Landing page on, an Admin, a Member, a manager (custom
  // Role with manage bookings) and a roadie (custom Role without it).
  async function band(name: string, { landing = true } = {}) {
    const owner = await verifiedUser(db, `${name}-owner@example.com`);
    const project = await createProject(db.pool, owner, { name });
    if (landing) await saveLandingSettings(db.pool, owner, project.id, { enabled: true, slug: name });
    const roles = await listRoles(db.pool, owner, project.id);
    const memberRole = roles.find((r) => r.kind === "member")!;
    const managerRole = await createRole(db.pool, owner, project.id, {
      name: "Manager",
      toggles: { ...NO_TOGGLES, manageBookings: true },
    });
    const roadieRole = await createRole(db.pool, owner, project.id, { name: "Roadie", toggles: NO_TOGGLES });
    const member = await join(project, owner, `${name}-member@example.com`, memberRole.id);
    const manager = await join(project, owner, `${name}-manager@example.com`, managerRole.id);
    const roadie = await join(project, owner, `${name}-roadie@example.com`, roadieRole.id);
    return { owner, project, member, manager, roadie, slug: name };
  }

  const submit = (mailer: Mailer, slug: string, input: Partial<BookingRequestInput> = {}, from = ip()) =>
    submitBookingRequest(db.pool, mailer, slug, { ...valid, ...input }, from);

  describe("submitting", () => {
    it("stores a Nueva request on the Project whose page it was sent from", async () => {
      const b = await band("store");
      const other = await band("store-other");
      const mailer = memoryMailer();

      const { id } = await submit(mailer, b.slug, {
        venue: "Quinta Los Pinos",
        location: "San Lorenzo",
        guests: 150,
        urgency: "high",
        musicStyle: "cumbia y rock",
      });

      const request = await getBookingRequest(db.pool, b.owner, b.project.id, id);
      assert.deepEqual(request, {
        id,
        clientName: "Ana Benítez",
        phone: "0981 123 456",
        email: "ana@example.com",
        eventType: "wedding",
        eventDate: "2027-03-20",
        description: valid.description,
        venue: "Quinta Los Pinos",
        location: "San Lorenzo",
        guests: 150,
        urgency: "high",
        musicStyle: "cumbia y rock",
        status: "new",
        createdAt: request.createdAt,
      });
      assert.deepEqual(await listBookingRequests(db.pool, other.owner, other.project.id), []);
    });

    it("takes only a phone, or only an email", async () => {
      const b = await band("contact");
      const mailer = memoryMailer();
      await submit(mailer, b.slug, { email: undefined });
      await submit(mailer, b.slug, { phone: "" });
      const list = await listBookingRequests(db.pool, b.owner, b.project.id);
      assert.equal(list.length, 2);
    });

    it("rejects missing required fields and no contact, with a Spanish message", async () => {
      const b = await band("invalid");
      const mailer = memoryMailer();
      const bad: Partial<BookingRequestInput>[] = [
        { clientName: " " },
        { phone: "", email: "" },
        { phone: undefined, email: undefined },
        { email: "not an email" },
        { eventDate: "" },
        { eventDate: "2027-02-30" },
        { description: "  " },
        { eventType: "circus" as never },
        { guests: 0 },
        { urgency: "asap" as never },
      ];
      for (const patch of bad) {
        await assert.rejects(submit(mailer, b.slug, patch), (err: Error & { code?: string }) => {
          assert.equal(err.code, "invalid_input", JSON.stringify(patch));
          assert.match(err.message, /[a-záéíóúñ]/i);
          return true;
        });
      }
      assert.deepEqual(await listBookingRequests(db.pool, b.owner, b.project.id), []);
      assert.equal(mailer.sent.length, 0);
    });

    it("says what is missing when neither phone nor email is given", async () => {
      const b = await band("nocontact");
      await assert.rejects(submit(memoryMailer(), b.slug, { phone: "", email: "" }), {
        code: "invalid_input",
        message: "Dejanos un teléfono o un correo para poder responderte",
      });
    });

    it("stores nothing when the honeypot is filled", async () => {
      const b = await band("honeypot");
      const mailer = memoryMailer();
      await assert.rejects(
        submitBookingRequest(db.pool, mailer, b.slug, { ...valid, honeypot: "http://spam.example" }, ip()),
        { code: "invalid_input" },
      );
      assert.deepEqual(await listBookingRequests(db.pool, b.owner, b.project.id), []);
      assert.equal(mailer.sent.length, 0);
    });

    it("rate limits one address and stores nothing past the limit", async () => {
      const b = await band("rate");
      const mailer = memoryMailer();
      const spammer = ip();
      for (let i = 0; i < RATE_LIMIT_PER_HOUR; i++) await submit(mailer, b.slug, {}, spammer);
      const sent = mailer.sent.length;

      await assert.rejects(submit(mailer, b.slug, {}, spammer), { code: "rate_limited" });

      assert.equal((await listBookingRequests(db.pool, b.owner, b.project.id)).length, RATE_LIMIT_PER_HOUR);
      assert.equal(mailer.sent.length, sent);
      await submit(mailer, b.slug, {}, ip()); // someone else is fine
    });

    it("is unavailable when the Landing page is off, never set up, or the address is unknown", async () => {
      const off = await band("off");
      await saveLandingSettings(db.pool, off.owner, off.project.id, { enabled: false, slug: "off" });
      const never = await band("never", { landing: false });
      const mailer = memoryMailer();

      for (const slug of ["off", "never", "nobody-here"]) {
        await assert.rejects(submit(mailer, slug), { code: "not_found" });
      }
      assert.deepEqual(await listBookingRequests(db.pool, off.owner, off.project.id), []);
      assert.deepEqual(await listBookingRequests(db.pool, never.owner, never.project.id), []);
    });

    it("finds the Project from a slug in any case", async () => {
      const b = await band("shouty");
      await submit(memoryMailer(), "  SHOUTY ");
      assert.equal((await listBookingRequests(db.pool, b.owner, b.project.id)).length, 1);
    });
  });

  describe("emails", () => {
    it("sends every manager one email with all details and a link to the request", async () => {
      const b = await band("notify");
      const mailer = memoryMailer();

      const { id } = await submit(mailer, b.slug, {
        venue: "Quinta Los Pinos",
        location: "San Lorenzo",
        guests: 150,
        urgency: "urgent",
        musicStyle: "cumbia",
      });

      for (const manager of [b.owner, b.manager]) {
        const [email, ...rest] = sentTo(mailer, manager.email);
        assert.equal(rest.length, 0);
        assert.match(email.subject, /Ana Benítez/);
        for (const detail of [
          "Ana Benítez", "0981 123 456", "ana@example.com", "Boda", "2027-03-20",
          valid.description, "Quinta Los Pinos", "San Lorenzo", "150", "cumbia",
        ]) {
          assert.ok(email.body.includes(detail), `email lacks ${detail}`);
        }
        assert.ok(email.body.includes(`https://backstage.test/p/${b.project.id}/solicitudes/${id}`));
      }
    });

    it("sends nothing to Members without manage bookings", async () => {
      const b = await band("quiet");
      const mailer = memoryMailer();
      await submit(mailer, b.slug);
      assert.equal(sentTo(mailer, b.member.email).length, 0);
      assert.equal(sentTo(mailer, b.roadie.email).length, 0);
    });

    it("confirms to a client who gave an email, but not to a phone-only client", async () => {
      const b = await band("confirm");
      const mailer = memoryMailer();

      await submit(mailer, b.slug);
      const [confirmation, ...rest] = sentTo(mailer, "ana@example.com");
      assert.equal(rest.length, 0);
      assert.match(confirmation.subject, /recibimos/i);
      assert.ok(confirmation.body.includes("Ana Benítez"));
      assert.ok(confirmation.body.includes(b.project.name));

      const phoneOnly = memoryMailer();
      await submit(phoneOnly, b.slug, { email: undefined });
      assert.deepEqual(
        phoneOnly.sent.map((m) => m.to).sort(),
        [b.manager.email, b.owner.email].sort(),
      );
    });

    it("still saves the request when the mailer fails, and logs it", async () => {
      const b = await band("failing");
      const failing: Mailer = {
        appUrl: "https://backstage.test",
        async send() {
          throw new Error("provider down");
        },
      };
      const log = mock.method(console, "error", () => {});
      try {
        const { id } = await submit(failing, b.slug);
        const request = await getBookingRequest(db.pool, b.owner, b.project.id, id);
        assert.equal(request.status, "new");
        assert.ok(log.mock.callCount() >= 1);
      } finally {
        log.mock.restore();
      }
    });
  });

  describe("reading", () => {
    it("lists newest first for managers and Admins, and opens one", async () => {
      const b = await band("list");
      const mailer = memoryMailer();
      const first = await submit(mailer, b.slug, { clientName: "Primero" });
      const second = await submit(mailer, b.slug, { clientName: "Segundo" });

      for (const reader of [b.owner, b.manager]) {
        const list = await listBookingRequests(db.pool, reader, b.project.id);
        assert.deepEqual(list.map((r) => r.id), [second.id, first.id]);
        assert.equal((await getBookingRequest(db.pool, reader, b.project.id, first.id)).clientName, "Primero");
      }
    });

    it("keeps requests from Members without the permission", async () => {
      const b = await band("deny");
      const { id } = await submit(memoryMailer(), b.slug);
      for (const reader of [b.member, b.roadie]) {
        await assert.rejects(listBookingRequests(db.pool, reader, b.project.id), { code: "forbidden" });
        await assert.rejects(getBookingRequest(db.pool, reader, b.project.id, id), { code: "forbidden" });
      }
    });

    it("never shows another Project's request, even by id", async () => {
      const a = await band("iso-a");
      const other = await band("iso-b");
      const { id } = await submit(memoryMailer(), other.slug);

      await assert.rejects(getBookingRequest(db.pool, a.owner, a.project.id, id), { code: "not_found" });
      await assert.rejects(getBookingRequest(db.pool, a.owner, other.project.id, id), { code: "not_found" });
      await assert.rejects(getBookingRequest(db.pool, a.owner, a.project.id, "nope"), { code: "not_found" });
    });
  });
});
