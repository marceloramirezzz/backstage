import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { basisPointsToPercent, percentToBasisPoints } from "./split-form.ts";

describe("split form", () => {
  it("converts percentages to basis points and back", () => {
    assert.equal(percentToBasisPoints("25"), 2500);
    assert.equal(percentToBasisPoints("12,5"), 1250);
    assert.equal(percentToBasisPoints(" 33.33 "), 3333);
    assert.ok(Number.isNaN(percentToBasisPoints("12.345")));
    assert.ok(Number.isNaN(percentToBasisPoints("-5")));
    assert.ok(Number.isNaN(percentToBasisPoints("")));
    assert.equal(basisPointsToPercent(2500), "25");
    assert.equal(basisPointsToPercent(1250), "12,5");
  });
});
