import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { memoryMailer } from "../../test/mailer.ts";
import { createTestDb, type TestDb } from "../../test/test-db.ts";
import { verifiedUser } from "../../test/users.ts";
import { submitBookingRequest } from "./booking-requests.ts";
import { generateQuote } from "./documents.ts";
import { createEvent, deleteEvent } from "./events.ts";
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

describe("documents: quote numbering and generation", () => {
  let db: TestDb;
  let ip = 0;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  async function band(name: string) {
    const owner = await verifiedUser(db, `${name}-owner@example.com`);
    const project = await createProject(db.pool, owner, { name });
    await saveLandingSettings(db.pool, owner, project.id, { enabled: true, slug: name });
    const join = async (who: string, toggles: Partial<RoleToggles>) => {
      const role = await createRole(db.pool, owner, project.id, { name: who, toggles: { ...NO_TOGGLES, ...toggles } });
      const user = await verifiedUser(db, `${name}-${who}@example.com`);
      const [{ invitation }] = await sendInvitations(db.pool, owner, project.id, [{ email: user.email, roleId: role.id }]);
      await acceptInvitation(db.pool, user, invitation.id);
      return user;
    };
    const memberRole = (await listRoles(db.pool, owner, project.id)).find((r) => r.kind === "member")!;
    const member = await verifiedUser(db, `${name}-member@example.com`);
    const [{ invitation }] = await sendInvitations(db.pool, owner, project.id, [{ email: member.email, roleId: memberRole.id }]);
    await acceptInvitation(db.pool, member, invitation.id);
    return {
      owner,
      project,
      slug: name,
      member,
      bookingsOnly: await join("bookings", { manageBookings: true }),
      seeOnly: await join("seer", { seeTotalPayExpenses: true }),
      both: await join("both", { manageBookings: true, seeTotalPayExpenses: true }),
    };
  }

  const event = (b: Awaited<ReturnType<typeof band>>, name = "Boda", pay = 2_000_000) =>
    createEvent(db.pool, b.owner, b.project.id, { name, date: "2027-03-20", durationMinutes: 120, pay, location: "Luque" });
  const request = async (slug: string) =>
    (
      await submitBookingRequest(
        db.pool,
        memoryMailer(),
        slug,
        { clientName: "Ana Benítez", phone: "0981", eventType: "wedding", eventDate: "2027-03-20", description: "Boda", venue: "Quinta" },
        `10.2.0.${++ip}`,
      )
    ).id;

  it("numbers the first quote 1 and gives a regeneration the same number", async () => {
    const b = await band("first");
    const e = await event(b);

    const first = await generateQuote(db.pool, b.owner, b.project.id, { eventId: e.id });
    const again = await generateQuote(db.pool, b.both, b.project.id, { eventId: e.id });

    assert.equal(first.number, 1);
    assert.equal(again.number, 1);
    assert.equal(first.model.numberLabel, "COT-0001");
  });

  it("gives each new source the next number, from an Event or a Booking Request", async () => {
    const b = await band("sequence");
    const e1 = await event(b, "Uno");
    const e2 = await event(b, "Dos");
    const r = await request(b.slug);

    const n1 = await generateQuote(db.pool, b.owner, b.project.id, { eventId: e1.id });
    const n2 = await generateQuote(db.pool, b.owner, b.project.id, { eventId: e2.id });
    const n3 = await generateQuote(db.pool, b.owner, b.project.id, { bookingRequestId: r, amount: 900_000 });
    const back = await generateQuote(db.pool, b.owner, b.project.id, { eventId: e1.id });

    assert.deepEqual([n1.number, n2.number, n3.number, back.number], [1, 2, 3, 1]);
  });

  it("keeps numbers independent per Project", async () => {
    const a = await band("alpha");
    const z = await band("zulu");
    await generateQuote(db.pool, a.owner, a.project.id, { eventId: (await event(a)).id });
    await generateQuote(db.pool, a.owner, a.project.id, { eventId: (await event(a, "Otro")).id });

    const first = await generateQuote(db.pool, z.owner, z.project.id, { eventId: (await event(z)).id });

    assert.equal(first.number, 1);
  });

  it("never reuses a number after its source is deleted", async () => {
    const b = await band("gap");
    const e1 = await event(b, "Uno");
    await generateQuote(db.pool, b.owner, b.project.id, { eventId: e1.id });
    await deleteEvent(db.pool, b.owner, b.project.id, e1.id);

    const next = await generateQuote(db.pool, b.owner, b.project.id, { eventId: (await event(b, "Dos")).id });

    assert.equal(next.number, 2);
  });

  it("does not hand two numbers to concurrent generations of one source", async () => {
    const b = await band("race");
    const e = await event(b);

    const results = await Promise.all(
      [1, 2, 3, 4].map(() => generateQuote(db.pool, b.owner, b.project.id, { eventId: e.id })),
    );

    assert.deepEqual(new Set(results.map((r) => r.number)), new Set([1]));
  });

  it("builds an Event's quote from its cachet and a request's from the stated amount", async () => {
    const b = await band("content");
    const e = await event(b, "Cumple", 3_500_000);
    const r = await request(b.slug);

    const fromEvent = await generateQuote(db.pool, b.owner, b.project.id, { eventId: e.id });
    const fromRequest = await generateQuote(db.pool, b.owner, b.project.id, { bookingRequestId: r, amount: 1_250_000 });

    assert.equal(fromEvent.model.total, "Gs. 3.500.000");
    assert.equal(fromEvent.model.bandName, "content");
    assert.equal(fromEvent.model.clientName, null);
    assert.equal(fromRequest.model.total, "Gs. 1.250.000");
    assert.equal(fromRequest.model.clientName, "Ana Benítez");
    assert.ok(fromRequest.model.details.some(([, v]) => v === "Boda"));
  });

  it("names the client on the quote of an Event converted from a request", async () => {
    const b = await band("converted");
    const e = await event(b);
    const r = await request(b.slug);
    await db.pool.query("UPDATE booking_requests SET event_id = $2 WHERE id = $1", [r, e.id]);

    const quote = await generateQuote(db.pool, b.owner, b.project.id, { eventId: e.id });

    assert.equal(quote.model.clientName, "Ana Benítez");
  });

  it("requires both 'manage bookings' and 'see total pay & expenses'", async () => {
    const b = await band("perms");
    const e = await event(b);

    for (const user of [b.member, b.bookingsOnly, b.seeOnly]) {
      await assert.rejects(generateQuote(db.pool, user, b.project.id, { eventId: e.id }), { code: "forbidden" });
    }
    assert.equal((await generateQuote(db.pool, b.both, b.project.id, { eventId: e.id })).number, 1);
    const { rows } = await db.pool.query("SELECT 1 FROM documents WHERE project_id = $1", [b.project.id]);
    assert.equal(rows.length, 1);
  });

  it("treats another Project's Event or request as not found, and non-members as not found", async () => {
    const mine = await band("mine");
    const theirs = await band("theirs");
    const e = await event(theirs);
    const r = await request(theirs.slug);

    await assert.rejects(generateQuote(db.pool, mine.owner, mine.project.id, { eventId: e.id }), { code: "not_found" });
    await assert.rejects(
      generateQuote(db.pool, mine.owner, mine.project.id, { bookingRequestId: r, amount: 1000 }),
      { code: "not_found" },
    );
    await assert.rejects(generateQuote(db.pool, mine.owner, theirs.project.id, { eventId: e.id }), { code: "not_found" });
  });

  it("rejects a quote with nothing to charge, and takes no number for it", async () => {
    const b = await band("nopay");
    const free = await event(b, "Gratis", 0);
    const r = await request(b.slug);

    await assert.rejects(generateQuote(db.pool, b.owner, b.project.id, { eventId: free.id }), { code: "invalid_input" });
    await assert.rejects(
      generateQuote(db.pool, b.owner, b.project.id, { bookingRequestId: r, amount: 0 }),
      { code: "invalid_input" },
    );
    const paid = await event(b, "Pago");
    assert.equal((await generateQuote(db.pool, b.owner, b.project.id, { eventId: paid.id })).number, 1);
  });
});
