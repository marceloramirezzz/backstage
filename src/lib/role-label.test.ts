import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { roleLabel } from "./role-label.ts";

describe("roleLabel", () => {
  it("names the built-in Roles in Spanish", () => {
    assert.equal(roleLabel("admin", "Admin"), "Admin");
    assert.equal(roleLabel("member", "Member"), "Miembro");
  });

  it("shows a custom Role by the name the Banda gave it", () => {
    assert.equal(roleLabel("custom", "Roadie"), "Roadie");
  });
});
