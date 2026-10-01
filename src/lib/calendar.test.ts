import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addMonths,
  eventTimeRange,
  formatLongDate,
  formatMonthTitle,
  monthGrid,
  parseMonth,
} from "./calendar.ts";

describe("monthGrid", () => {
  it("covers whole weeks starting on Sunday, with the adjacent months' days outside", () => {
    const days = monthGrid("2026-09");

    assert.equal(days.length % 7, 0);
    assert.equal(days.length, 35);
    assert.deepEqual(days[0], { date: "2026-08-30", day: 30, outside: true });
    assert.deepEqual(days[2], { date: "2026-09-01", day: 1, outside: false });
    assert.deepEqual(days.at(-1), { date: "2026-10-03", day: 3, outside: true });
  });

  it("adds a sixth week when the month needs it", () => {
    // August 2025 starts on a Friday and has 31 days.
    assert.equal(monthGrid("2025-08").length, 42);
  });

  it("starts on the 1st when the month does", () => {
    assert.deepEqual(monthGrid("2026-02")[0], { date: "2026-02-01", day: 1, outside: false });
  });
});

describe("parseMonth", () => {
  it("accepts YYYY-MM and falls back otherwise", () => {
    assert.equal(parseMonth("2026-09", "2026-01"), "2026-09");
    for (const bad of [undefined, "", "2026-13", "2026-9", "septiembre", "2026-00"]) {
      assert.equal(parseMonth(bad, "2026-01"), "2026-01");
    }
  });
});

describe("addMonths", () => {
  it("moves across year boundaries", () => {
    assert.equal(addMonths("2026-12", 1), "2027-01");
    assert.equal(addMonths("2026-01", -1), "2025-12");
    assert.equal(addMonths("2026-09", 0), "2026-09");
  });
});

describe("eventTimeRange", () => {
  it("runs from the start time for the duration, past midnight too", () => {
    assert.equal(eventTimeRange("21:30", 120), "21:30 – 23:30");
    assert.equal(eventTimeRange("22:00", 240), "22:00 – 02:00");
    assert.equal(eventTimeRange("00:00", 1440), "00:00 – 00:00");
  });
});

describe("Spanish dates", () => {
  it("titles a month", () => {
    assert.equal(formatMonthTitle("2026-09"), "Septiembre 2026");
  });

  it("writes a long date", () => {
    assert.equal(formatLongDate("2026-09-26"), "Sábado 26 de septiembre");
  });
});
