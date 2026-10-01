import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchesSearch } from "./search.ts";

describe("matchesSearch", () => {
  it("finds any part of the text, ignoring case and accents", () => {
    assert.equal(matchesSearch("Bésame mucho", "BESAME"), true);
    assert.equal(matchesSearch("Recuerdos de Ypacaraí", "ypacarai"), true);
    assert.equal(matchesSearch("Cariñito", "carinito"), true);
    assert.equal(matchesSearch("Sabor a mí", "sabor a mi"), true);
  });

  it("ignores spaces around the search", () => {
    assert.equal(matchesSearch("India", "  ind "), true);
  });

  it("matches everything when the search is blank", () => {
    assert.equal(matchesSearch("Galopera", ""), true);
    assert.equal(matchesSearch("Galopera", "   "), true);
  });

  it("doesn't match text that isn't there", () => {
    assert.equal(matchesSearch("Galopera", "polca"), false);
    assert.equal(matchesSearch("Mis noches sin ti", "noches con"), false);
  });
});
