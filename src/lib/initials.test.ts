import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { initials } from "./initials.ts";

describe("initials", () => {
  it("takes the first and last capitalised words", () => {
    assert.equal(initials("Los del Valle"), "LV");
    assert.equal(initials("Diego Acosta"), "DA");
    assert.equal(initials("Banda de la Costa Norte"), "BN");
  });

  it("uses the first two letters of a single word", () => {
    assert.equal(initials("Kchiporros"), "KC");
  });

  it("falls back to every word when none is capitalised", () => {
    assert.equal(initials("los pumas"), "LP");
  });

  it("handles accented letters and extra spaces", () => {
    assert.equal(initials("  Ángel   Ñandutí "), "ÁÑ");
  });

  it("returns an empty string for a blank name", () => {
    assert.equal(initials("   "), "");
  });
});
