import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rehearsalNotificationEmail } from "./rehearsal-notification-email.ts";

const mailer = { appUrl: "https://backstage.test", async send() {} };

describe("rehearsalNotificationEmail", () => {
  it("states when and where, and links to the month", () => {
    const message = rehearsalNotificationEmail(mailer, "a@example.com", "Los Tigres", "p1", {
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
});
