import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readAmount, readMemberRule, readOverride, readSignedAmount } from "./member-rule-form.ts";

describe("member rule form", () => {
  it("reads whole guaraníes, grouped or not", () => {
    assert.equal(readAmount("300.000"), 300_000);
    assert.equal(readAmount("300000"), 300_000);
    assert.ok(Number.isNaN(readAmount("")));
    assert.ok(Number.isNaN(readAmount("12,5")));
  });

  it("reads a signed Ajuste, blank being none", () => {
    assert.equal(readSignedAmount(""), 0);
    assert.equal(readSignedAmount("+50.000"), 50_000);
    assert.equal(readSignedAmount("-20.000"), -20_000);
    assert.equal(readSignedAmount("−20.000"), -20_000);
    assert.ok(Number.isNaN(readSignedAmount("abc")));
  });

  it("reads rules and overrides", () => {
    assert.deepEqual(readMemberRule("equal", "999"), { kind: "equal", value: 0 });
    assert.deepEqual(readMemberRule("fixed", "1.000"), { kind: "fixed", value: 1000 });
    assert.equal(readOverride("default", "5"), null);
    assert.deepEqual(readOverride("equal", ""), { kind: "equal", value: 0 });
  });
});
