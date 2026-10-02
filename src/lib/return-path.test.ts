import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { safeReturnPath, withReturnPath } from "./return-path.ts";

describe("safeReturnPath", () => {
  it("keeps a local path with its query", () => {
    assert.equal(safeReturnPath("/p/123/calendario?mes=9"), "/p/123/calendario?mes=9");
  });

  it("drops anything that isn't a local path", () => {
    for (const unsafe of [
      null,
      undefined,
      "",
      "p/123",
      "https://evil.example/p/123",
      "//evil.example/p/123",
      "/\\evil.example",
      "javascript:alert(1)",
      "/\t/evil.example",
      "/\n/evil.example",
      "/\r/evil.example",
    ]) {
      assert.equal(safeReturnPath(unsafe), null, String(unsafe));
    }
  });
});

describe("withReturnPath", () => {
  it("carries the page to return to in `volver`, or nothing without one", () => {
    assert.equal(withReturnPath("/crear-cuenta", "/p/1?mes=9"), "/crear-cuenta?volver=%2Fp%2F1%3Fmes%3D9");
    assert.equal(withReturnPath("/crear-cuenta", null), "/crear-cuenta");
  });
});
