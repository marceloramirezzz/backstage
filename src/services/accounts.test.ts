import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createTestDb, type TestDb } from "../../test/test-db.ts";
import {
  addPassword,
  getSessionUser,
  logIn,
  logOut,
  signInWithGoogle,
  signUp,
  verifyEmail,
  type GoogleProfile,
} from "./accounts.ts";

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

  describe("Google sign-in", () => {
    const googleProfile = (email: string, overrides: Partial<Omit<GoogleProfile, "email">> = {}) => ({
      googleId: overrides.googleId ?? `google-${email}`,
      email,
      emailVerified: overrides.emailVerified ?? true,
      name: overrides.name ?? "Google Name",
    });

    it("creates a verified User with the Google display name, and signs them back in", async () => {
      const first = await signInWithGoogle(db.pool, googleProfile("Ivo@Example.com", { name: "Ivo" }));

      assert.equal(first.user.email, "ivo@example.com");
      assert.equal(first.user.displayName, "Ivo");
      assert.equal(first.user.emailVerified, true);
      assert.equal((await getSessionUser(db.pool, first.sessionToken))?.id, first.user.id);

      const again = await signInWithGoogle(db.pool, googleProfile("ivo@example.com", { googleId: "google-Ivo@Example.com" }));
      assert.equal(again.user.id, first.user.id);
    });

    it("falls back to the email's name part when Google has no name", async () => {
      const { user } = await signInWithGoogle(db.pool, googleProfile("quin.r@example.com", { name: "  " }));

      assert.equal(user.displayName, "quin.r");
    });

    it("links to the existing User with the same email instead of creating another", async () => {
      const { user: existing, verificationToken } = await signUp(db.pool, {
        email: "joa@example.com",
        password: "a password",
        displayName: "Joa",
      });
      await verifyEmail(db.pool, verificationToken);

      const { user } = await signInWithGoogle(db.pool, googleProfile("JOA@example.com", { name: "Joa From Google" }));

      assert.equal(user.id, existing.id);
      assert.equal(user.displayName, "Joa");
      const { user: byPassword } = await logIn(db.pool, { email: "joa@example.com", password: "a password" });
      assert.equal(byPassword.id, existing.id);
    });

    it("shuts out whoever set the password when linking to an unverified User", async () => {
      // Someone signs up with an address they don't own and never verifies it.
      await signUp(db.pool, { email: "ona@example.com", password: "squatter password", displayName: "Squatter" });
      const squatter = await logIn(db.pool, { email: "ona@example.com", password: "squatter password" });

      const owner = await signInWithGoogle(db.pool, googleProfile("ona@example.com"));

      assert.equal(owner.user.emailVerified, true);
      assert.equal(owner.user.displayName, "Google Name");
      assert.equal(await getSessionUser(db.pool, squatter.sessionToken), null);
      await assert.rejects(logIn(db.pool, { email: "ona@example.com", password: "squatter password" }), {
        code: "invalid_credentials",
      });
    });

    it("won't re-link an email that belongs to a different Google account", async () => {
      const { user } = await signInWithGoogle(db.pool, googleProfile("pia@example.com", { googleId: "google-1" }));

      await assert.rejects(signInWithGoogle(db.pool, googleProfile("pia@example.com", { googleId: "google-2" })), {
        name: "ServiceError",
        code: "email_taken",
      });
      const original = await signInWithGoogle(db.pool, googleProfile("pia@example.com", { googleId: "google-1" }));
      assert.equal(original.user.id, user.id);
    });

    it("never links or signs in when Google hasn't verified the email", async () => {
      await signUp(db.pool, { email: "kai@example.com", password: "a password", displayName: "Kai" });
      const unverified = { name: "ServiceError", code: "email_not_verified" };

      await assert.rejects(signInWithGoogle(db.pool, googleProfile("kai@example.com", { emailVerified: false })), unverified);
      await assert.rejects(signInWithGoogle(db.pool, googleProfile("lia@example.com", { emailVerified: false })), unverified);

      // Kai wasn't linked (linking would verify them) and no User was created for Lia.
      const { user } = await logIn(db.pool, { email: "kai@example.com", password: "a password" });
      assert.equal(user.emailVerified, false);
      await signUp(db.pool, { email: "lia@example.com", password: "a password", displayName: "Lia" });
    });

    it("lets a Google-only User add a password and then log in either way", async () => {
      const profile = googleProfile("mia@example.com", { name: "Mia" });
      const { user } = await signInWithGoogle(db.pool, profile);
      await assert.rejects(logIn(db.pool, { email: "mia@example.com", password: "new password" }), {
        code: "invalid_credentials",
      });

      await addPassword(db.pool, { userId: user.id, password: "new password" });

      const byPassword = await logIn(db.pool, { email: "mia@example.com", password: "new password" });
      assert.equal(byPassword.user.id, user.id);
      const byGoogle = await signInWithGoogle(db.pool, profile);
      assert.equal(byGoogle.user.id, user.id);
    });

    it("won't replace a password the User already has", async () => {
      const { user } = await signUp(db.pool, { email: "noa@example.com", password: "old password", displayName: "Noa" });

      await assert.rejects(addPassword(db.pool, { userId: user.id, password: "new password" }), {
        name: "ServiceError",
        code: "password_already_set",
      });
      await logIn(db.pool, { email: "noa@example.com", password: "old password" });
    });
  });
});
