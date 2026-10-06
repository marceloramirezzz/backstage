import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { memoryMailer, sentTo } from "../../test/mailer.ts";
import { createTestDb, type TestDb } from "../../test/test-db.ts";
import { verifiedUser } from "../../test/users.ts";
import { getCalendarFeed, getCalendarFeedToken, regenerateCalendarFeedToken } from "./calendar-feed.ts";
import { createEvent, updateEvent } from "./events.ts";
import { acceptInvitation, sendInvitations } from "./invitations.ts";
import { createProject } from "./projects.ts";
import { createRehearsal } from "./rehearsals.ts";
import { listRoles } from "./roles.ts";
import { notifyAttendance } from "./event-notifications.ts";

describe("calendar feed", () => {
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
    const roles = await listRoles(db.pool, owner, project.id);
    const member = await verifiedUser(db, `${name}-member@example.com`);
    const [{ invitation }] = await sendInvitations(db.pool, owner, project.id, [
      { email: member.email, roleId: roles.find((r) => r.kind === "member")!.id },
    ]);
    await acceptInvitation(db.pool, member, invitation.id);
    return { owner, member, project };
  }

  it("serves only with a valid token, and regenerating invalidates the old one", async () => {
    const { owner, project } = await band("tokens");
    const token = await getCalendarFeedToken(db.pool, owner, project.id);
    assert.match(await getCalendarFeed(db.pool, token) ?? "", /BEGIN:VCALENDAR/);
    assert.equal(await getCalendarFeed(db.pool, "nope"), null);
    assert.equal(await getCalendarFeed(db.pool, ""), null);

    const fresh = await regenerateCalendarFeedToken(db.pool, owner, project.id);
    assert.notEqual(fresh, token);
    assert.equal(await getCalendarFeedToken(db.pool, owner, project.id), fresh);
    assert.equal(await getCalendarFeed(db.pool, token), null);
    assert.match(await getCalendarFeed(db.pool, fresh) ?? "", /BEGIN:VCALENDAR/);
  });

  it("gives each Project its own token, and only Admins see or change it", async () => {
    const a = await band("iso-a");
    const b = await band("iso-b");
    assert.notEqual(
      await getCalendarFeedToken(db.pool, a.owner, a.project.id),
      await getCalendarFeedToken(db.pool, b.owner, b.project.id),
    );
    await assert.rejects(getCalendarFeedToken(db.pool, a.member, a.project.id), { code: "forbidden" });
    await assert.rejects(regenerateCalendarFeedToken(db.pool, a.member, a.project.id), { code: "forbidden" });
    await assert.rejects(getCalendarFeedToken(db.pool, b.owner, a.project.id), { code: "not_found" });
  });

  it("lists Events and Rehearsals with titles, times and locations only", async () => {
    const { owner, project } = await band("content");
    const gig = await createEvent(db.pool, owner, project.id, {
      name: "Boda Gómez",
      date: "2027-05-01",
      startTime: "21:00",
      durationMinutes: 240,
      location: "Quinta Los Pinos",
      pay: 9_876_543,
    });
    await createEvent(db.pool, owner, project.id, {
      name: "Cancelado",
      date: "2027-05-02",
      durationMinutes: 60,
      status: "cancelled",
    });
    const rehearsal = await createRehearsal(db.pool, memoryMailer(), owner, project.id, {
      date: "2027-05-03",
      startTime: "19:00",
      endTime: "21:00",
      location: "Local",
      notes: "nota interna",
    });
    const token = await getCalendarFeedToken(db.pool, owner, project.id);
    const ics = (await getCalendarFeed(db.pool, token))!;

    assert.match(ics, new RegExp(`UID:event-${gig.id}@backstage`));
    assert.match(ics, /SUMMARY:Boda Gómez/);
    assert.match(ics, /DTSTART:20270501T210000/);
    assert.match(ics, /DTEND:20270502T010000/);
    assert.match(ics, /LOCATION:Quinta Los Pinos/);
    assert.match(ics, new RegExp(`UID:rehearsal-${rehearsal.id}@backstage`));
    assert.match(ics, /SUMMARY:Ensayo/);
    assert.match(ics, /DTEND:20270503T210000/);
    assert.doesNotMatch(ics, /Cancelado/);
    assert.doesNotMatch(ics, /9876543|9\.876|nota interna/);
  });

  it("keeps an Event's identifier when it is edited", async () => {
    const { owner, project } = await band("stable");
    const gig = await createEvent(db.pool, owner, project.id, { name: "Fiesta", date: "2027-06-01", durationMinutes: 60 });
    const token = await getCalendarFeedToken(db.pool, owner, project.id);
    await updateEvent(db.pool, owner, project.id, gig.id, { name: "Fiesta renombrada", date: "2027-06-02" });
    const ics = (await getCalendarFeed(db.pool, token))!;
    assert.equal(ics.match(/UID:/g)!.length, 1);
    assert.match(ics, new RegExp(`UID:event-${gig.id}@backstage`));
    assert.match(ics, /DTSTART;VALUE=DATE:20270602/);
  });

  it("attaches an invite to the Event and Rehearsal notification emails", async () => {
    const { owner, member, project } = await band("invites");
    const mailer = memoryMailer();
    const gig = await createEvent(db.pool, owner, project.id, {
      name: "Fiesta",
      date: "2027-06-01",
      startTime: "20:00",
      durationMinutes: 120,
    });
    await notifyAttendance(db.pool, mailer, owner, project.id, gig.id);
    const rehearsal = await createRehearsal(
      db.pool,
      mailer,
      owner,
      project.id,
      { date: "2027-06-02", startTime: "19:00", endTime: "20:00" },
      { notify: true },
    );
    const [eventMail] = sentTo(mailer, member.email).filter((m) => /Fiesta/.test(m.subject));
    assert.match(eventMail.attachments![0].content, new RegExp(`UID:event-${gig.id}@backstage`));
    const [rehearsalMail] = sentTo(mailer, member.email).filter((m) => /Ensayo/.test(m.subject));
    assert.match(rehearsalMail.attachments![0].content, new RegExp(`UID:rehearsal-${rehearsal.id}@backstage`));
  });
});
