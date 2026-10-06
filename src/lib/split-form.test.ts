import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { basisPointsToPercent } from "./split-form.ts";

describe("split form", () => {
  it("formats basis points as a percentage", () => {
    assert.equal(basisPointsToPercent(2500), "25");
    assert.equal(basisPointsToPercent(1250), "12,5");
  });
});
