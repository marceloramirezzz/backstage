import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createTestDb, type TestDb } from "../../test/test-db.ts";
import { getSessionUser, logIn, logOut, signUp, verifyEmail } from "./accounts.ts";

const days = (n: number) => n * 24 * 60 * 60 * 1000;

describe("accounts", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("lets a new User log in with the email and password they signed up with", async () => {
    await signUp(db.pool, {
      email: "Ana@Example.com",
      password: "correct horse",
      displayName: "Ana",
    });

    const { user } = await logIn(db.pool, { email: "ana@example.com", password: "correct horse" });

    assert.equal(user.email, "ana@example.com");
    assert.equal(user.displayName, "Ana");
    assert.equal(user.emailVerified, false);
  });

  it("rejects a wrong password or an unknown email alike", async () => {
    await signUp(db.pool, { email: "bea@example.com", password: "right password", displayName: "Bea" });

    const invalid = { name: "ServiceError", code: "invalid_credentials" };
    await assert.rejects(logIn(db.pool, { email: "bea@example.com", password: "wrong password" }), invalid);
    await assert.rejects(logIn(db.pool, { email: "nobody@example.com", password: "right password" }), invalid);
  });

  it("allows only one User per email, ignoring case", async () => {
    await signUp(db.pool, { email: "cam@example.com", password: "first password", displayName: "Cam" });

    await assert.rejects(
      signUp(db.pool, { email: "CAM@example.com", password: "second password", displayName: "Other Cam" }),
      { name: "ServiceError", code: "email_taken" },
    );
    const { user } = await logIn(db.pool, { email: "cam@example.com", password: "first password" });
    assert.equal(user.displayName, "Cam");
  });

  it("requires a display name to sign up", async () => {
    await assert.rejects(
      signUp(db.pool, { email: "dan@example.com", password: "a password", displayName: "   " }),
      { name: "ServiceError", code: "invalid_input" },
    );
    await assert.rejects(logIn(db.pool, { email: "dan@example.com", password: "a password" }), {
      code: "invalid_credentials",
    });
  });

  it("marks the email verified when the verification link is followed, once", async () => {
    const { verificationToken } = await signUp(db.pool, {
      email: "eva@example.com",
      password: "a password",
      displayName: "Eva",
    });

    const verified = await verifyEmail(db.pool, verificationToken);

    assert.equal(verified.emailVerified, true);
    const { user } = await logIn(db.pool, { email: "eva@example.com", password: "a password" });
    assert.equal(user.emailVerified, true);
    await assert.rejects(verifyEmail(db.pool, verificationToken), { code: "invalid_token" });
    await assert.rejects(verifyEmail(db.pool, "not-a-real-token"), { code: "invalid_token" });
  });

  it("keeps a User logged in until they log out", async () => {
    await signUp(db.pool, { email: "fer@example.com", password: "a password", displayName: "Fer" });
    const { sessionToken } = await logIn(db.pool, { email: "fer@example.com", password: "a password" });

    assert.equal((await getSessionUser(db.pool, sessionToken))?.email, "fer@example.com");

    await logOut(db.pool, sessionToken);

    assert.equal(await getSessionUser(db.pool, sessionToken), null);
    assert.equal(await getSessionUser(db.pool, "not-a-real-token"), null);
  });

  it("ends a session after 30 days without use, counted from the last use", async () => {
    await signUp(db.pool, { email: "gus@example.com", password: "a password", displayName: "Gus" });
    const loginAt = new Date("2026-01-01T12:00:00Z");
    const at = (n: number) => new Date(loginAt.getTime() + days(n));
    const { sessionToken } = await logIn(
      db.pool,
      { email: "gus@example.com", password: "a password" },
      loginAt,
    );

    assert.notEqual(await getSessionUser(db.pool, sessionToken, at(29)), null);
    assert.notEqual(await getSessionUser(db.pool, sessionToken, at(58)), null);
    assert.equal(await getSessionUser(db.pool, sessionToken, at(89)), null);
  });

  it("has the database reject a User with no way to log in", async () => {
    await assert.rejects(
      db.pool.query("INSERT INTO users (email, display_name) VALUES ('hal@example.com', 'Hal')"),
      { code: "23514" }, // check_violation
    );
  });
});
