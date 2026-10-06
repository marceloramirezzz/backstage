import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCalendar, type CalendarItem } from "./ics.ts";

const STAMP = new Date("2026-10-06T12:30:00Z");

const gig: CalendarItem = {
  uid: "event-1@backstage",
  summary: "Fiesta",
  date: "2027-05-01",
  startTime: "21:30",
  durationMinutes: 150,
  location: "Club Centenario",
};

const lines = (ics: string) => ics.split("\r\n");

describe("buildCalendar", () => {
  it("wraps items in a CRLF-terminated calendar", () => {
    const ics = buildCalendar({ name: "Los Tigres", stamp: STAMP, items: [gig] });
    assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
    const l = lines(ics);
    assert.equal(l[0], "BEGIN:VCALENDAR");
    assert.ok(l.includes("VERSION:2.0"));
    assert.ok(l.some((x) => x.startsWith("PRODID:")));
    assert.ok(l.includes("X-WR-CALNAME:Los Tigres"));
    assert.ok(!l.some((x) => x.startsWith("METHOD:")));
  });

  it("writes a timed item as floating local time with a stable UID", () => {
    const l = lines(buildCalendar({ name: "B", stamp: STAMP, items: [gig] }));
    assert.ok(l.includes("UID:event-1@backstage"));
    assert.ok(l.includes("DTSTAMP:20261006T123000Z"));
    assert.ok(l.includes("DTSTART:20270501T213000"));
    assert.ok(l.includes("DTEND:20270502T000000"));
    assert.ok(l.includes("SUMMARY:Fiesta"));
    assert.ok(l.includes("LOCATION:Club Centenario"));
  });

  it("writes an item with no start time as an all-day one", () => {
    const l = lines(
      buildCalendar({ name: "B", stamp: STAMP, items: [{ ...gig, startTime: null, location: null }] }),
    );
    assert.ok(l.includes("DTSTART;VALUE=DATE:20270501"));
    assert.ok(l.includes("DTEND;VALUE=DATE:20270502"));
    assert.ok(!l.some((x) => x.startsWith("LOCATION")));
  });

  it("escapes text and folds long lines at 75 octets", () => {
    const ics = buildCalendar({
      name: "B",
      stamp: STAMP,
      items: [{ ...gig, summary: "A, B; C\\D\nE", location: "ñ".repeat(80) }],
    });
    assert.ok(ics.includes("SUMMARY:A\\, B\\; C\\\\D\\nE\r\n"));
    for (const line of lines(ics)) assert.ok(Buffer.byteLength(line) <= 75, line);
    const unfolded = ics.replace(/\r\n /g, "");
    assert.ok(unfolded.includes(`LOCATION:${"ñ".repeat(80)}`));
  });

  it("adds METHOD and SEQUENCE for an invite", () => {
    const l = lines(
      buildCalendar({ name: "B", stamp: STAMP, method: "REQUEST", items: [{ ...gig, sequence: 7 }] }),
    );
    assert.ok(l.includes("METHOD:REQUEST"));
    assert.ok(l.includes("SEQUENCE:7"));
  });
});
