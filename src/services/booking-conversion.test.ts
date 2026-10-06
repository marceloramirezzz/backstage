import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { memoryMailer, sentTo } from "../../test/mailer.ts";
import { createTestDb, type TestDb } from "../../test/test-db.ts";
import { verifiedUser } from "../../test/users.ts";
import { addGuest, setAttending } from "./attendance.ts";
import {
  convertBookingRequest,
  getBookingRequest,
  getEventBookingRequestId,
  submitBookingRequest,
} from "./booking-requests.ts";
import { notifyAttendance } from "./event-notifications.ts";
import { createEvent, deleteEvent, getEvent } from "./events.ts";
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

describe("converting a Booking Request and notifying Attendance", () => {
  let db: TestDb;
  let ipCounter = 0;
  before(async () => {
    db = await createTestDb();
  });
  after(async () => {
    await db.close();
  });

  async function band(name: string) {
    const owner = await verifiedUser(db, `${name}-owner@example.com`);
    const project = await createProject(db.pool, owner, { name });
    await saveLandingSettings(db.pool, owner, project.id, { enabled: true, slug: name });
    const roles = await listRoles(db.pool, owner, project.id);
    const memberRole = roles.find((r) => r.kind === "member")!;
    const join = async (email: string, roleId: string) => {
      const user = await verifiedUser(db, email);
      const [{ invitation }] = await sendInvitations(db.pool, owner, project.id, [{ email, roleId }]);
      await acceptInvitation(db.pool, user, invitation.id);
      return user;
    };
    const roleWith = (roleName: string, toggles: Partial<RoleToggles>) =>
      createRole(db.pool, owner, project.id, { name: roleName, toggles: { ...NO_TOGGLES, ...toggles } });
    const both = await roleWith("Both", { manageBookings: true, editRepertoireSetlistsEvents: true });
    const bookingsOnly = await roleWith("Bookings", { manageBookings: true });
    const eventsOnly = await roleWith("Events", { editRepertoireSetlistsEvents: true });
    return {
      owner,
      project,
      slug: name,
      member: await join(`${name}-member@example.com`, memberRole.id),
      both: await join(`${name}-both@example.com`, both.id),
      bookingsOnly: await join(`${name}-bookings@example.com`, bookingsOnly.id),
      eventsOnly: await join(`${name}-events@example.com`, eventsOnly.id),
    };
  }

  const request = async (slug: string, extra = {}) =>
    (
      await submitBookingRequest(
        db.pool,
        memoryMailer(),
        slug,
        {
          clientName: "Ana Benítez",
          email: "ana@example.com",
          eventType: "wedding",
          eventDate: "2027-03-20",
          description: "Boda",
          venue: "Quinta Los Pinos",
          location: "San Lorenzo",
          ...extra,
        },
        `10.1.0.${++ipCounter}`,
      )
    ).id;

  describe("conversion", () => {
    it("makes a Confirmed Event from the request's fields and links both ways", async () => {
      const b = await band("convert");
      const id = await request(b.slug);
      await db.pool.query("UPDATE booking_requests SET status = 'quote_sent' WHERE id = $1", [id]);

      const { eventId } = await convertBookingRequest(db.pool, b.both, b.project.id, id);

      const event = await getEvent(db.pool, b.both, b.project.id, eventId);
      assert.equal(event.name, "Boda — Ana Benítez");
      assert.equal(event.date, "2027-03-20");
      assert.equal(event.location, "Quinta Los Pinos, San Lorenzo");
      assert.equal(event.status, "confirmed");
      assert.equal((await getEvent(db.pool, b.owner, b.project.id, eventId)).pay, 0);
      assert.equal(event.isPublic, false);
      const linked = await getBookingRequest(db.pool, b.both, b.project.id, id);
      assert.equal(linked.eventId, eventId);
      assert.equal(linked.status, "quote_sent");
      assert.equal(await getEventBookingRequestId(db.pool, b.both, b.project.id, eventId), id);
    });

    it("uses whichever of venue and location exists, or none", async () => {
      const b = await band("location");
      const only = await request(b.slug, { venue: undefined });
      const none = await request(b.slug, { venue: undefined, location: undefined });
      const a = await convertBookingRequest(db.pool, b.owner, b.project.id, only);
      const c = await convertBookingRequest(db.pool, b.owner, b.project.id, none);
      assert.equal((await getEvent(db.pool, b.owner, b.project.id, a.eventId)).location, "San Lorenzo");
      assert.equal((await getEvent(db.pool, b.owner, b.project.id, c.eventId)).location, null);
    });

    it("cannot be done twice, even at once", async () => {
      const b = await band("twice");
      const id = await request(b.slug);
      const results = await Promise.allSettled([
        convertBookingRequest(db.pool, b.owner, b.project.id, id),
        convertBookingRequest(db.pool, b.owner, b.project.id, id),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
      assert.equal(failed.reason.code, "already_converted");
      const { rows } = await db.pool.query("SELECT 1 FROM events WHERE project_id = $1", [b.project.id]);
      assert.equal(rows.length, 1);
    });

    it("leaves Members, Attendance and emails alone", async () => {
      const b = await band("untouched");
      const id = await request(b.slug);
      const { eventId } = await convertBookingRequest(db.pool, b.owner, b.project.id, id);
      const { rows: absent } = await db.pool.query("SELECT 1 FROM event_absences WHERE event_id = $1", [eventId]);
      assert.equal(absent.length, 0);
      const { rows: members } = await db.pool.query("SELECT 1 FROM memberships WHERE project_id = $1", [
        b.project.id,
      ]);
      assert.equal(members.length, 5);
    });

    it("needs both permissions", async () => {
      const b = await band("perms");
      const id = await request(b.slug);
      for (const who of [b.member, b.bookingsOnly, b.eventsOnly]) {
        await assert.rejects(convertBookingRequest(db.pool, who, b.project.id, id), { code: "forbidden" });
      }
      assert.equal((await getBookingRequest(db.pool, b.owner, b.project.id, id)).eventId, null);
    });

    it("never converts another Project's request, and lets it be reconverted after the Event is deleted", async () => {
      const a = await band("scope-a");
      const other = await band("scope-b");
      const id = await request(other.slug);
      await assert.rejects(convertBookingRequest(db.pool, a.owner, a.project.id, id), { code: "not_found" });
      await assert.rejects(convertBookingRequest(db.pool, a.owner, a.project.id, "nope"), { code: "not_found" });
      const { eventId } = await convertBookingRequest(db.pool, other.owner, other.project.id, id);
      await deleteEvent(db.pool, other.owner, other.project.id, eventId);
      assert.equal((await getBookingRequest(db.pool, other.owner, other.project.id, id)).eventId, null);
    });

    it("shows the back-link only to those who manage bookings", async () => {
      const b = await band("backlink");
      const id = await request(b.slug);
      const { eventId } = await convertBookingRequest(db.pool, b.owner, b.project.id, id);
      assert.equal(await getEventBookingRequestId(db.pool, b.bookingsOnly, b.project.id, eventId), id);
      assert.equal(await getEventBookingRequestId(db.pool, b.eventsOnly, b.project.id, eventId), null);
      assert.equal(await getEventBookingRequestId(db.pool, b.member, b.project.id, eventId), null);
    });
  });

  describe("notifying Attendance", () => {
    it("emails exactly the attending Members with date, time and location", async () => {
      const b = await band("notify");
      const event = await createEvent(db.pool, b.owner, b.project.id, {
        name: "Fiesta",
        date: "2027-05-01",
        startTime: "21:30",
        location: "Club Centenario",
        durationMinutes: 120,
      });
      await setAttending(db.pool, b.owner, b.project.id, event.id, b.member.id, false);
      await addGuest(db.pool, b.owner, b.project.id, event.id, { name: "Suplente" });
      const mailer = memoryMailer();

      const result = await notifyAttendance(db.pool, mailer, b.both, b.project.id, event.id);

      const expected = [b.owner, b.both, b.bookingsOnly, b.eventsOnly].map((u) => u.email).sort();
      assert.equal(result.sent, 4);
      assert.deepEqual(mailer.sent.map((m) => m.to).sort(), expected);
      assert.equal(sentTo(mailer, b.member.email).length, 0);
      const body = mailer.sent[0].body;
      assert.match(body, /21:30/);
      assert.match(body, /Club Centenario/);
      assert.match(body, /2027/);
    });

    it("needs the edit-events permission", async () => {
      const b = await band("notify-gate");
      const event = await createEvent(db.pool, b.owner, b.project.id, {
        name: "Fiesta",
        date: "2027-05-01",
        durationMinutes: 120,
      });
      const mailer = memoryMailer();
      for (const who of [b.member, b.bookingsOnly]) {
        await assert.rejects(notifyAttendance(db.pool, mailer, who, b.project.id, event.id), { code: "forbidden" });
      }
      assert.equal(mailer.sent.length, 0);
    });

    it("keeps going when one email fails", async () => {
      const b = await band("notify-fail");
      const event = await createEvent(db.pool, b.owner, b.project.id, {
        name: "Fiesta",
        date: "2027-05-01",
        durationMinutes: 120,
      });
      const mailer = memoryMailer();
      const send = mailer.send;
      mailer.send = async (m) => {
        if (m.to === b.member.email) throw new Error("boom");
        return send(m);
      };
      const result = await notifyAttendance(db.pool, mailer, b.owner, b.project.id, event.id);
      assert.equal(result.sent, 4);
    });
  });
});
