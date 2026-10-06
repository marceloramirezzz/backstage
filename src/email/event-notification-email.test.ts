import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryMailer } from "../../test/mailer.ts";
import { eventNotificationEmail } from "./event-notification-email.ts";

describe("event notification email", () => {
  const mailer = memoryMailer();

  it("carries the date with its year, the time, the location and a link to the Event", () => {
    const message = eventNotificationEmail(mailer, "ana@example.com", "Los Tigres", "p1", "e1", {
      name: "Fiesta",
      date: "2027-05-01",
      startTime: "21:30",
      location: "Club Centenario",
    });
    assert.equal(message.to, "ana@example.com");
    assert.match(message.subject, /Fiesta.*2027/);
    assert.match(message.body, /Hora: 21:30/);
    assert.match(message.body, /Lugar: Club Centenario/);
    assert.match(message.body, /Los Tigres/);
    assert.match(message.body, /https:\/\/backstage\.test\/p\/p1\/eventos\/e1/);
  });

  it("says so when the time or the location isn't settled", () => {
    const message = eventNotificationEmail(mailer, "ana@example.com", "Los Tigres", "p1", "e1", {
      name: "Fiesta",
      date: "2027-05-01",
      startTime: null,
      location: null,
    });
    assert.match(message.body, /Hora: Sin definir/);
    assert.match(message.body, /Lugar: Sin definir/);
  });
});
