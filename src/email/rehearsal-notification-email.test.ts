import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rehearsalNotificationEmail } from "./rehearsal-notification-email.ts";

const mailer = { appUrl: "https://backstage.test", async send() {} };

describe("rehearsalNotificationEmail", () => {
  it("states when and where, and links to the month", () => {
    const message = rehearsalNotificationEmail(mailer, "a@example.com", "Los Tigres", "p1", {
      id: "r1",
      date: "2027-05-01",
      startTime: "19:00",
      endTime: "21:00",
      location: null,
      notes: null,
    });
    assert.equal(message.to, "a@example.com");
    assert.match(message.subject, /Los Tigres/);
    assert.match(message.body, /19:00 – 21:00/);
    assert.match(message.body, /Lugar: Sin definir/);
    assert.doesNotMatch(message.body, /Notas:/);
    assert.match(message.body, /https:\/\/backstage\.test\/p\/p1\/calendario\?mes=2027-05/);
  });

  it("attaches an invite with the Rehearsal's stable identifier", () => {
    const message = rehearsalNotificationEmail(
      mailer,
      "a@example.com",
      "Los Tigres",
      "p1",
      { id: "r1", date: "2027-05-01", startTime: "19:00", endTime: "21:30", location: "Local", notes: "secreto" },
      new Date("2026-10-06T12:00:00Z"),
    );
    const [invite] = message.attachments!;
    assert.match(invite.contentType, /^text\/calendar.*method=REQUEST/);
    assert.match(invite.content, /METHOD:REQUEST/);
    assert.match(invite.content, /UID:rehearsal-r1@backstage/);
    assert.match(invite.content, /DTSTART:20270501T190000/);
    assert.match(invite.content, /DTEND:20270501T213000/);
    assert.match(invite.content, /LOCATION:Local/);
    assert.doesNotMatch(invite.content, /secreto/);
  });
});
