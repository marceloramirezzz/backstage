import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createTestDb, type TestDb } from "../../test/test-db.ts";
import { verifiedUser } from "../../test/users.ts";
import { getSessionUser, type GoogleProfile } from "./accounts.ts";
import { finishGoogleSignIn } from "./google-sign-in.ts";

const profile = (email: string, over: Partial<GoogleProfile> = {}): GoogleProfile => ({
  googleId: `google-${email}`,
  email,
  emailVerified: true,
  name: "Someone",
  ...over,
});

describe("finishGoogleSignIn", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  const saved = { state: "s1", verifier: "v1" };
  const exchange = (p: GoogleProfile) => async (code: string, verifier: string) => {
    assert.equal(code, "the-code");
    assert.equal(verifier, "v1");
    return p;
  };

  it("signs the User in with the exchanged profile", async () => {
    const result = await finishGoogleSignIn(
      db.pool,
      { code: "the-code", state: "s1" },
      saved,
      exchange(profile("new@example.com")),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal((await getSessionUser(db.pool, result.sessionToken))?.email, "new@example.com");
  });

  it("reaches the existing User with the same verified email", async () => {
    const existing = await verifiedUser(db, "linked@example.com");
    const result = await finishGoogleSignIn(
      db.pool,
      { code: "the-code", state: "s1" },
      saved,
      exchange(profile("linked@example.com")),
    );
    assert.equal(result.ok && result.user.id, existing.id);
  });

  it("fails as cancelled when Google reports access_denied", async () => {
    const result = await finishGoogleSignIn(
      db.pool,
      { error: "access_denied", state: "s1" },
      saved,
      exchange(profile("x@example.com")),
    );
    assert.deepEqual(result, { ok: false, reason: "cancelled" });
  });

  it("fails when the state is missing or doesn't match the saved one", async () => {
    for (const [params, s] of [
      [{ code: "the-code", state: "other" }, saved],
      [{ code: "the-code" }, saved],
      [{ code: "the-code", state: "s1" }, null],
    ] as const) {
      const result = await finishGoogleSignIn(db.pool, params, s, exchange(profile("y@example.com")));
      assert.deepEqual(result, { ok: false, reason: "failed" });
    }
  });

  it("fails when the code can't be exchanged", async () => {
    const result = await finishGoogleSignIn(db.pool, { code: "the-code", state: "s1" }, saved, async () => {
      throw new Error("invalid_grant");
    });
    assert.deepEqual(result, { ok: false, reason: "failed" });
  });

  it("fails as unverified when Google hasn't verified the email", async () => {
    const result = await finishGoogleSignIn(
      db.pool,
      { code: "the-code", state: "s1" },
      saved,
      exchange(profile("z@example.com", { emailVerified: false })),
    );
    assert.deepEqual(result, { ok: false, reason: "unverified" });
  });

  it("fails as taken when the email belongs to a different Google account", async () => {
    await finishGoogleSignIn(db.pool, { code: "the-code", state: "s1" }, saved, exchange(profile("dup@example.com")));
    const result = await finishGoogleSignIn(
      db.pool,
      { code: "the-code", state: "s1" },
      saved,
      exchange(profile("dup@example.com", { googleId: "someone-else" })),
    );
    assert.deepEqual(result, { ok: false, reason: "taken" });
  });
});
