import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { googleErrorMessage, googleFailurePath } from "./google-errors.ts";

describe("googleErrorMessage", () => {
  it("has a Spanish message for each failure and none for anything else", () => {
    for (const reason of ["cancelled", "failed", "unverified", "taken"]) {
      assert.ok(googleErrorMessage(reason), reason);
    }
    assert.equal(googleErrorMessage("toString"), undefined);
    assert.equal(googleErrorMessage(undefined), undefined);
  });
});

describe("googleFailurePath", () => {
  it("returns to sign-in with the reason, keeping the return path", () => {
    assert.equal(googleFailurePath("failed", null), "/ingresar?google=failed");
    assert.equal(googleFailurePath("taken", "/p/1?mes=9"), "/ingresar?volver=%2Fp%2F1%3Fmes%3D9&google=taken");
  });
});
