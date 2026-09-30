import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { safeReturnPath } from "./return-path.ts";

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
    ]) {
      assert.equal(safeReturnPath(unsafe), null, String(unsafe));
    }
  });
});
