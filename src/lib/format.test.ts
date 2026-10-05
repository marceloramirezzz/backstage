import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatClock,
  formatDuration,
  formatExpiresIn,
  formatGuaranies,
  formatTimeRange,
} from "./format.ts";

describe("formatGuaranies", () => {
  it("formats zero", () => {
    assert.equal(formatGuaranies(0), "Gs. 0");
  });

  it("leaves amounts under 1.000 ungrouped", () => {
    assert.equal(formatGuaranies(950), "Gs. 950");
  });

  it("groups thousands with dots", () => {
    assert.equal(formatGuaranies(1_000), "Gs. 1.000");
    assert.equal(formatGuaranies(400_000), "Gs. 400.000");
  });

  it("groups millions", () => {
    assert.equal(formatGuaranies(4_500_000), "Gs. 4.500.000");
    assert.equal(formatGuaranies(1_234_567_890), "Gs. 1.234.567.890");
  });

  it("puts the sign before the currency", () => {
    assert.equal(formatGuaranies(-400_000), "-Gs. 400.000");
  });
});

describe("formatTimeRange", () => {
  const at = (iso: string) => new Date(iso);

  it("uses 24-hour times joined by an en dash", () => {
    assert.equal(
      formatTimeRange(at("2026-09-26T21:30:00-03:00"), at("2026-09-26T23:30:00-03:00")),
      "21:30 – 23:30",
    );
  });

  it("pads single-digit hours and handles ranges past midnight", () => {
    assert.equal(
      formatTimeRange(at("2026-09-26T22:00:00-03:00"), at("2026-09-27T02:05:00-03:00")),
      "22:00 – 02:05",
    );
  });

  it("shows midnight as 00:00", () => {
    assert.equal(
      formatTimeRange(at("2026-09-26T22:00:00-03:00"), at("2026-09-27T00:00:00-03:00")),
      "22:00 – 00:00",
    );
  });

  it("reads the times in the given time zone", () => {
    assert.equal(
      formatTimeRange(at("2026-09-26T21:30:00Z"), at("2026-09-26T23:30:00Z"), "UTC"),
      "21:30 – 23:30",
    );
  });
});

describe("formatDuration", () => {
  it("shows hours and minutes", () => {
    assert.equal(formatDuration(130), "2h 10m");
  });

  it("omits a zero part", () => {
    assert.equal(formatDuration(45), "45m");
    assert.equal(formatDuration(120), "2h");
  });

  it("formats zero", () => {
    assert.equal(formatDuration(0), "0m");
  });
});

describe("formatClock", () => {
  it("shows minutes and seconds, zero-padded", () => {
    assert.equal(formatClock(252), "04:12");
    assert.equal(formatClock(0), "00:00");
    assert.equal(formatClock(59), "00:59");
  });

  it("adds hours past an hour", () => {
    assert.equal(formatClock(3_600 + 4 * 60 + 12), "1:04:12");
  });
});

describe("formatExpiresIn", () => {
  const now = new Date("2026-09-30T12:00:00Z");
  const hoursLater = (hours: number) => new Date(now.getTime() + hours * 60 * 60 * 1000);

  it("counts whole days left, rounding up", () => {
    assert.equal(formatExpiresIn(hoursLater(7 * 24), now), "vence en 7 días");
    assert.equal(formatExpiresIn(hoursLater(5 * 24 + 1), now), "vence en 6 días");
  });

  it("uses the singular for the last day", () => {
    assert.equal(formatExpiresIn(hoursLater(24), now), "vence en 1 día");
    assert.equal(formatExpiresIn(hoursLater(2), now), "vence en 1 día");
  });
});
