import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { linkToken, memoryMailer, sentTo } from "../../test/mailer.ts";
import { createTestDb, type TestDb } from "../../test/test-db.ts";
import {
  addPassword,
  getSessionUser,
  logIn,
  logOut,
  requestPasswordReset,
  requestVerificationEmail,
  resetPassword,
  signInWithGoogle,
  setDisplayName,
  setTheme,
  signUp,
  verifyEmail,
  type GoogleProfile,
} from "./accounts.ts";

const days = (n: number) => n * 24 * 60 * 60 * 1000;

describe("accounts", () => {
  let db: TestDb;
  const mailer = memoryMailer();
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("lets a new User log in with the email and password they signed up with", async () => {
    await signUp(db.pool, mailer, {
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
    await signUp(db.pool, mailer, { email: "bea@example.com", password: "right password", displayName: "Bea" });

    const invalid = { name: "ServiceError", code: "invalid_credentials" };
    await assert.rejects(logIn(db.pool, { email: "bea@example.com", password: "wrong password" }), invalid);
    await assert.rejects(logIn(db.pool, { email: "nobody@example.com", password: "right password" }), invalid);
  });

  it("allows only one User per email, ignoring case", async () => {
    await signUp(db.pool, mailer, { email: "cam@example.com", password: "first password", displayName: "Cam" });

    await assert.rejects(
      signUp(db.pool, mailer, { email: "CAM@example.com", password: "second password", displayName: "Other Cam" }),
      { name: "ServiceError", code: "email_taken" },
    );
    const { user } = await logIn(db.pool, { email: "cam@example.com", password: "first password" });
    assert.equal(user.displayName, "Cam");
  });

  it("requires a real-looking email and a password of at least 8 characters to sign up", async () => {
    const invalid = { name: "ServiceError", code: "invalid_input" };
    await assert.rejects(signUp(db.pool, mailer, { email: "not-an-email", password: "a password", displayName: "Rio" }), invalid);
    await assert.rejects(signUp(db.pool, mailer, { email: "rio@example.com", password: "1234567", displayName: "Rio" }), invalid);
    assert.equal(sentTo(mailer, "rio@example.com").length, 0);

    await signUp(db.pool, mailer, { email: " rio@example.com ", password: "12345678", displayName: "Rio" });
  });

  it("requires a display name to sign up", async () => {
    await assert.rejects(
      signUp(db.pool, mailer, { email: "dan@example.com", password: "a password", displayName: "   " }),
      { name: "ServiceError", code: "invalid_input" },
    );
    await assert.rejects(logIn(db.pool, { email: "dan@example.com", password: "a password" }), {
      code: "invalid_credentials",
    });
  });

  describe("email verification", () => {
    const verificationToken = (email: string) => linkToken(sentTo(mailer, email).at(-1)!, "/verificar");

    it("emails a verification link in Spanish to the new User's address", async () => {
      await signUp(db.pool, mailer, { email: "Eli@Example.com", password: "a password", displayName: "Eli" });

      const [email, ...others] = sentTo(mailer, "eli@example.com");
      assert.equal(others.length, 0);
      assert.equal(email.subject, "Verificá tu correo en Backstage");
      assert.match(email.body, /^Hola, Eli:/);
      assert.ok(verificationToken("eli@example.com"));
    });

    it("verifies the User and signs them in when the link is followed, once", async () => {
      await signUp(db.pool, mailer, { email: "eva@example.com", password: "a password", displayName: "Eva" });
      const token = verificationToken("eva@example.com");

      const { user, sessionToken } = await verifyEmail(db.pool, token);

      assert.equal(user.emailVerified, true);
      assert.equal((await getSessionUser(db.pool, sessionToken))?.id, user.id);
      const loggedIn = await logIn(db.pool, { email: "eva@example.com", password: "a password" });
      assert.equal(loggedIn.user.emailVerified, true);
      await assert.rejects(verifyEmail(db.pool, token), { code: "invalid_token" });
      await assert.rejects(verifyEmail(db.pool, "not-a-real-token"), { code: "invalid_token" });
    });

    it("rejects a link after 24 hours", async () => {
      const signedUpAt = new Date("2026-01-01T12:00:00Z");
      const at = (hours: number) => new Date(signedUpAt.getTime() + hours * 60 * 60 * 1000);
      await signUp(db.pool, mailer, { email: "ivy@example.com", password: "a password", displayName: "Ivy" }, signedUpAt);
      await signUp(db.pool, mailer, { email: "jon@example.com", password: "a password", displayName: "Jon" }, signedUpAt);

      await verifyEmail(db.pool, verificationToken("ivy@example.com"), at(23.9));
      await assert.rejects(verifyEmail(db.pool, verificationToken("jon@example.com"), at(24)), {
        code: "invalid_token",
      });
    });

    it("sends a fresh link on request, and only the newest one works", async () => {
      await signUp(db.pool, mailer, { email: "kim@example.com", password: "a password", displayName: "Kim" });
      const first = verificationToken("kim@example.com");

      await requestVerificationEmail(db.pool, mailer, "KIM@example.com");

      assert.equal(sentTo(mailer, "kim@example.com").length, 2);
      const newest = verificationToken("kim@example.com");
      await assert.rejects(verifyEmail(db.pool, first), { code: "invalid_token" });
      const { user } = await verifyEmail(db.pool, newest);
      assert.equal(user.emailVerified, true);
    });

    it("sends nothing on request for a verified User or an unknown email, alike", async () => {
      await signUp(db.pool, mailer, { email: "lu@example.com", password: "a password", displayName: "Lu" });
      await verifyEmail(db.pool, verificationToken("lu@example.com"));
      const sentBefore = mailer.sent.length;

      await requestVerificationEmail(db.pool, mailer, "lu@example.com");
      await requestVerificationEmail(db.pool, mailer, "nobody-here@example.com");

      assert.equal(mailer.sent.length, sentBefore);
    });
  });

  describe("password reset", () => {
    const resetToken = (email: string) => linkToken(sentTo(mailer, email).at(-1)!, "/restablecer");
    const newUser = (email: string) =>
      signUp(db.pool, mailer, { email, password: "old password", displayName: email });

    it("emails a reset link in Spanish, and the new password works after following it", async () => {
      await newUser("ada@example.com");

      await requestPasswordReset(db.pool, mailer, "ADA@example.com");

      const email = sentTo(mailer, "ada@example.com").at(-1)!;
      assert.equal(email.subject, "Restablecé tu contraseña de Backstage");
      assert.match(email.body, /^Hola, ada@example.com:/);
      await resetPassword(db.pool, resetToken("ada@example.com"), "new password");
      await logIn(db.pool, { email: "ada@example.com", password: "new password" });
      await assert.rejects(logIn(db.pool, { email: "ada@example.com", password: "old password" }), {
        code: "invalid_credentials",
      });
    });

    it("signs the User in and ends their other sessions", async () => {
      const { sessionToken: old } = await newUser("bo@example.com");
      await requestPasswordReset(db.pool, mailer, "bo@example.com");

      const { user, sessionToken } = await resetPassword(db.pool, resetToken("bo@example.com"), "new password");

      assert.equal((await getSessionUser(db.pool, sessionToken))?.id, user.id);
      assert.equal(await getSessionUser(db.pool, old), null);
    });

    it("works once", async () => {
      await newUser("cy@example.com");
      await requestPasswordReset(db.pool, mailer, "cy@example.com");
      const token = resetToken("cy@example.com");

      await resetPassword(db.pool, token, "new password");

      await assert.rejects(resetPassword(db.pool, token, "another password"), { code: "invalid_token" });
      await assert.rejects(resetPassword(db.pool, "not-a-real-token", "new password"), {
        code: "invalid_token",
      });
      await logIn(db.pool, { email: "cy@example.com", password: "new password" });
    });

    it("expires after 1 hour", async () => {
      const requestedAt = new Date("2026-01-01T12:00:00Z");
      const at = (minutes: number) => new Date(requestedAt.getTime() + minutes * 60 * 1000);
      await newUser("di@example.com");
      await newUser("ed@example.com");
      await requestPasswordReset(db.pool, mailer, "di@example.com", requestedAt);
      await requestPasswordReset(db.pool, mailer, "ed@example.com", requestedAt);

      await resetPassword(db.pool, resetToken("di@example.com"), "new password", at(59));
      await assert.rejects(resetPassword(db.pool, resetToken("ed@example.com"), "new password", at(60)), {
        code: "invalid_token",
      });
    });

    it("lets only the newest link work after asking again", async () => {
      await newUser("flo@example.com");
      await requestPasswordReset(db.pool, mailer, "flo@example.com");
      const first = resetToken("flo@example.com");
      await requestPasswordReset(db.pool, mailer, "flo@example.com");

      await assert.rejects(resetPassword(db.pool, first, "new password"), { code: "invalid_token" });
      await resetPassword(db.pool, resetToken("flo@example.com"), "new password");
    });

    it("keeps the link usable when the new password is too short", async () => {
      await newUser("gwen@example.com");
      await requestPasswordReset(db.pool, mailer, "gwen@example.com");
      const token = resetToken("gwen@example.com");

      await assert.rejects(resetPassword(db.pool, token, "short"), { code: "invalid_input" });

      await resetPassword(db.pool, token, "long enough now");
    });

    it("sends nothing for an unknown email or a User with no password, alike", async () => {
      await signInWithGoogle(db.pool, {
        googleId: "google-hal",
        email: "hal@example.com",
        emailVerified: true,
        name: "Hal",
      });
      const sentBefore = mailer.sent.length;

      await requestPasswordReset(db.pool, mailer, "hal@example.com");
      await requestPasswordReset(db.pool, mailer, "nobody-here@example.com");

      assert.equal(mailer.sent.length, sentBefore);
    });
  });

  it("keeps a User logged in until they log out", async () => {
    await signUp(db.pool, mailer, { email: "fer@example.com", password: "a password", displayName: "Fer" });
    const { sessionToken } = await logIn(db.pool, { email: "fer@example.com", password: "a password" });

    assert.equal((await getSessionUser(db.pool, sessionToken))?.email, "fer@example.com");

    await logOut(db.pool, sessionToken);

    assert.equal(await getSessionUser(db.pool, sessionToken), null);
    assert.equal(await getSessionUser(db.pool, "not-a-real-token"), null);
  });

  it("ends a session after 30 days without use, counted from the last use", async () => {
    await signUp(db.pool, mailer, { email: "gus@example.com", password: "a password", displayName: "Gus" });
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
      const { user: existing } = await signUp(db.pool, mailer, {
        email: "joa@example.com",
        password: "a password",
        displayName: "Joa",
      });
      await verifyEmail(db.pool, linkToken(sentTo(mailer, "joa@example.com")[0], "/verificar"));

      const { user } = await signInWithGoogle(db.pool, googleProfile("JOA@example.com", { name: "Joa From Google" }));

      assert.equal(user.id, existing.id);
      assert.equal(user.displayName, "Joa");
      const { user: byPassword } = await logIn(db.pool, { email: "joa@example.com", password: "a password" });
      assert.equal(byPassword.id, existing.id);
    });

    it("shuts out whoever set the password when linking to an unverified User", async () => {
      // Someone signs up with an address they don't own and never verifies it.
      await signUp(db.pool, mailer, { email: "ona@example.com", password: "squatter password", displayName: "Squatter" });
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
      await signUp(db.pool, mailer, { email: "kai@example.com", password: "a password", displayName: "Kai" });
      const unverified = { name: "ServiceError", code: "email_not_verified" };

      await assert.rejects(signInWithGoogle(db.pool, googleProfile("kai@example.com", { emailVerified: false })), unverified);
      await assert.rejects(signInWithGoogle(db.pool, googleProfile("lia@example.com", { emailVerified: false })), unverified);

      // Kai wasn't linked (linking would verify them) and no User was created for Lia.
      const { user } = await logIn(db.pool, { email: "kai@example.com", password: "a password" });
      assert.equal(user.emailVerified, false);
      await signUp(db.pool, mailer, { email: "lia@example.com", password: "a password", displayName: "Lia" });
    });

    it("lets a Google-only User add a password and then log in either way", async () => {
      const profile = googleProfile("mia@example.com", { name: "Mia" });
      const { user } = await signInWithGoogle(db.pool, profile);
      await assert.rejects(logIn(db.pool, { email: "mia@example.com", password: "new password" }), {
        code: "invalid_credentials",
      });

      await addPassword(db.pool, user, { password: "new password" });

      const byPassword = await logIn(db.pool, { email: "mia@example.com", password: "new password" });
      assert.equal(byPassword.user.id, user.id);
      const byGoogle = await signInWithGoogle(db.pool, profile);
      assert.equal(byGoogle.user.id, user.id);
    });

    it("won't add a password that's too short", async () => {
      const { user } = await signInWithGoogle(db.pool, googleProfile("ola@example.com", { name: "Ola" }));

      await assert.rejects(addPassword(db.pool, user, { password: "short" }), { name: "ServiceError", code: "invalid_input" });
      await assert.rejects(logIn(db.pool, { email: "ola@example.com", password: "short" }), { code: "invalid_credentials" });
    });

    it("won't replace a password the User already has", async () => {
      const { user } = await signUp(db.pool, mailer, { email: "noa@example.com", password: "old password", displayName: "Noa" });

      await assert.rejects(addPassword(db.pool, user, { password: "new password" }), {
        name: "ServiceError",
        code: "password_already_set",
      });
      await logIn(db.pool, { email: "noa@example.com", password: "old password" });
    });
  });

  describe("settings", () => {
    it("starts every User on the system theme", async () => {
      const { user } = await signUp(db.pool, mailer, { email: "tea@example.com", password: "a password", displayName: "Tea" });

      assert.equal(user.theme, "system");
    });

    it("remembers the chosen theme for every later session", async () => {
      const { user } = await signUp(db.pool, mailer, { email: "uri@example.com", password: "a password", displayName: "Uri" });

      await setTheme(db.pool, user, "light");

      const { user: second } = await logIn(db.pool, { email: "uri@example.com", password: "a password" });
      assert.equal(second.theme, "light");
      await setTheme(db.pool, user, "dark");
      const { user: third } = await logIn(db.pool, { email: "uri@example.com", password: "a password" });
      assert.equal(third.theme, "dark");
    });

    it("rejects a theme that doesn't exist", async () => {
      const { user } = await signUp(db.pool, mailer, { email: "val@example.com", password: "a password", displayName: "Val" });

      await assert.rejects(setTheme(db.pool, user, "neon" as "dark"), { name: "ServiceError", code: "invalid_input" });
      assert.equal((await logIn(db.pool, { email: "val@example.com", password: "a password" })).user.theme, "system");
    });

    it("changes the display name, trimmed", async () => {
      const { user, sessionToken } = await signUp(db.pool, mailer, { email: "wen@example.com", password: "a password", displayName: "Wen" });

      await setDisplayName(db.pool, user, "  Wendy Ruiz ");

      assert.equal((await getSessionUser(db.pool, sessionToken))?.displayName, "Wendy Ruiz");
    });

    it("won't blank the display name", async () => {
      const { user } = await signUp(db.pool, mailer, { email: "xia@example.com", password: "a password", displayName: "Xia" });

      await assert.rejects(setDisplayName(db.pool, user, "   "), { name: "ServiceError", code: "invalid_input" });
      assert.equal((await logIn(db.pool, { email: "xia@example.com", password: "a password" })).user.displayName, "Xia");
    });
  });
});
