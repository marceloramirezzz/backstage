import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { basisPointsToPercent, percentToBasisPoints, readSplitRules } from "./split-form.ts";

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

  it("reads one rule per Role, skipping those marked none", () => {
    const form = new FormData();
    form.set("kind-a", "percentage");
    form.set("value-a", "100");
    form.set("kind-b", "member_fixed");
    form.set("value-b", "Gs. 300.000");
    form.set("kind-c", "none");
    form.set("value-c", "5");
    assert.deepEqual(readSplitRules(form, ["a", "b", "c"]), [
      { roleId: "a", kind: "percentage", value: 10_000 },
      { roleId: "b", kind: "member_fixed", value: 300_000 },
    ]);
  });

  it("passes a blank amount through as NaN", () => {
    const form = new FormData();
    form.set("kind-a", "role_fixed");
    form.set("value-a", "");
    assert.ok(Number.isNaN(readSplitRules(form, ["a"])[0].value));
  });
});
