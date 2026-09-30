import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Pool } from "pg";
import type { EmailMessage, Mailer } from "../email/mailer.ts";
import { ServiceError } from "./errors.ts";
import { hashToken, newToken } from "./tokens.ts";

export interface User {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
}

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const UNIQUE_VIOLATION = "23505";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const sessionExpiry = (now: Date) => new Date(now.getTime() + SESSION_TTL_MS);
const VERIFICATION_TTL_HOURS = 24;
const VERIFICATION_TTL_MS = VERIFICATION_TTL_HOURS * 60 * 60 * 1000;
const verificationExpiry = (now: Date) => new Date(now.getTime() + VERIFICATION_TTL_MS);

const USER_COLUMNS = `id, email, display_name AS "displayName",
  email_verified_at IS NOT NULL AS "emailVerified"`;

// Stored as "scrypt:<salt>:<hash>", both base64.
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt:${salt.toString("base64")}:${hash.toString("base64")}`;
}

async function passwordMatches(password: string, stored: string): Promise<boolean> {
  const [, salt, hash] = stored.split(":");
  const expected = Buffer.from(hash, "base64");
  const actual = await scryptAsync(password, Buffer.from(salt, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

const DUMMY_HASH = await hashPassword(randomBytes(16).toString("hex"));

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const MIN_PASSWORD_LENGTH = 8;
// Only catches typos like a missing "@"; the verification email is the real check.
const looksLikeEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// Creates a password User, signs them in and emails them a verification link.
export async function signUp(
  pool: Pool,
  mailer: Mailer,
  input: { email: string; password: string; displayName: string },
  now: Date = new Date(),
): Promise<{ user: User; sessionToken: string }> {
  const displayName = input.displayName.trim();
  if (!displayName) throw new ServiceError("invalid_input", "Display name is required");
  const email = normalizeEmail(input.email);
  if (!looksLikeEmail(email)) throw new ServiceError("invalid_input", "Email is not valid");
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new ServiceError("invalid_input", `Password must have at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  const verificationToken = newToken();
  const { rows } = await pool
    .query<User>(
      `WITH created AS (
         INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, $3)
         RETURNING ${USER_COLUMNS}
       ), token AS (
         INSERT INTO email_verification_tokens (token_hash, user_id, expires_at)
         SELECT $4, id, $5 FROM created
       )
       SELECT * FROM created`,
      [
        email,
        displayName,
        await hashPassword(input.password),
        hashToken(verificationToken),
        verificationExpiry(now),
      ],
    )
    .catch((err) => {
      if (err.code === UNIQUE_VIOLATION && err.constraint === "users_email_key") {
        throw new ServiceError("email_taken", "An account with this email already exists");
      }
      throw err;
    });
  const user = rows[0];
  const sessionToken = await startSession(pool, user.id, now);
  // The account exists either way; if this email is lost, the User can ask
  // for another from the app.
  await mailer.send(verificationEmail(mailer, user, verificationToken)).catch((err) => {
    console.error("Couldn't send the verification email after sign-up", err);
  });
  return { user, sessionToken };
}

// Emails a fresh verification link to the User with this email, if they
// haven't verified it yet; earlier links stop working. Quietly does nothing
// otherwise, so the caller can't tell whether the email has an account.
export async function requestVerificationEmail(
  pool: Pool,
  mailer: Mailer,
  email: string,
  now: Date = new Date(),
): Promise<void> {
  const verificationToken = newToken();
  const { rows } = await pool.query<User>(
    `WITH target AS (
       SELECT ${USER_COLUMNS} FROM users WHERE email = $1 AND email_verified_at IS NULL
     ), token AS (
       INSERT INTO email_verification_tokens (token_hash, user_id, expires_at)
       SELECT $2, id, $3 FROM target
       ON CONFLICT (user_id) DO UPDATE
       SET token_hash = excluded.token_hash, expires_at = excluded.expires_at,
         created_at = now()
     )
     SELECT * FROM target`,
    [normalizeEmail(email), hashToken(verificationToken), verificationExpiry(now)],
  );
  if (rows[0]) await mailer.send(verificationEmail(mailer, rows[0], verificationToken));
}

function verificationEmail(mailer: Mailer, user: User, token: string): EmailMessage {
  const link = new URL(`/verificar?token=${token}`, mailer.appUrl);
  return {
    to: user.email,
    subject: "Verificá tu correo en Backstage",
    body: `Hola, ${user.displayName}:

Para confirmar que este correo es tuyo, abrí este enlace:

${link}

El enlace vence en ${VERIFICATION_TTL_HOURS} horas. Sin verificarlo no vas a poder crear una banda ni aceptar invitaciones.

Si no creaste una cuenta en Backstage, ignorá este correo.
`,
  };
}

// Starts a 30-day session. Unverified Users may log in.
export async function logIn(
  pool: Pool,
  input: { email: string; password: string },
  now: Date = new Date(),
): Promise<{ user: User; sessionToken: string }> {
  const { rows } = await pool.query<User & { passwordHash: string | null }>(
    `SELECT ${USER_COLUMNS}, password_hash AS "passwordHash" FROM users WHERE email = $1`,
    [normalizeEmail(input.email)],
  );
  // Hash even when there's no password to check, so timing doesn't reveal
  // which emails have accounts.
  const { passwordHash, ...user } = rows[0] ?? { passwordHash: null };
  const matches = await passwordMatches(input.password, passwordHash ?? DUMMY_HASH);
  if (!passwordHash || !matches) {
    throw new ServiceError("invalid_credentials", "Invalid email or password");
  }
  return { user, sessionToken: await startSession(pool, user.id, now) };
}

async function startSession(pool: Pool, userId: string, now: Date): Promise<string> {
  const sessionToken = newToken();
  await pool.query(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
    [hashToken(sessionToken), userId, sessionExpiry(now)],
  );
  return sessionToken;
}

// Follows an email verification link, which also signs the User in, as
// only they could have opened it. Each link works once, within 24 hours.
export async function verifyEmail(
  pool: Pool,
  token: string,
  now: Date = new Date(),
): Promise<{ user: User; sessionToken: string }> {
  const { rows } = await pool.query<User>(
    `WITH used AS (
       DELETE FROM email_verification_tokens WHERE token_hash = $1
       RETURNING user_id, expires_at
     )
     UPDATE users SET email_verified_at = coalesce(email_verified_at, $2)
     WHERE id = (SELECT user_id FROM used WHERE expires_at > $2)
     RETURNING ${USER_COLUMNS}`,
    [hashToken(token), now],
  );
  const user = rows[0];
  if (!user) throw new ServiceError("invalid_token", "This verification link is not valid");
  return { user, sessionToken: await startSession(pool, user.id, now) };
}

// Resolves a session token to its User, or null if it's unknown or expired.
// Each use pushes expiry back to 30 days from now (sliding).
export async function getSessionUser(
  pool: Pool,
  sessionToken: string,
  now: Date = new Date(),
): Promise<User | null> {
  const { rows } = await pool.query<User>(
    `WITH renewed AS (
       UPDATE sessions SET expires_at = $3
       WHERE token_hash = $1 AND expires_at > $2
       RETURNING user_id
     )
     SELECT ${USER_COLUMNS} FROM users WHERE id = (SELECT user_id FROM renewed)`,
    [hashToken(sessionToken), now, sessionExpiry(now)],
  );
  return rows[0] ?? null;
}

export async function logOut(pool: Pool, sessionToken: string): Promise<void> {
  await pool.query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(sessionToken)]);
}

// What Google tells us about the person, taken from an ID token the caller has
// already verified.
export interface GoogleProfile {
  googleId: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

const googleDisplayName = (profile: GoogleProfile) =>
  profile.name.trim() || normalizeEmail(profile.email).split("@")[0];

// Signs in with Google, creating the User on first sign-in. Google Users
// count as verified.
export async function signInWithGoogle(
  pool: Pool,
  profile: GoogleProfile,
  now: Date = new Date(),
): Promise<{ user: User; sessionToken: string }> {
  // An unverified Google email proves nothing, so it can neither link to an
  // existing User nor create a verified one.
  if (!profile.emailVerified) {
    throw new ServiceError("email_not_verified", "Google hasn't verified this email address");
  }
  const client = await pool.connect();
  let user: User;
  try {
    await client.query("BEGIN");
    const { rows: linked } = await client.query<User>(
      `SELECT ${USER_COLUMNS} FROM users WHERE google_id = $1`,
      [profile.googleId],
    );
    const { rows: sameEmail } = await client.query<{
      id: string;
      emailVerified: boolean;
      hasGoogle: boolean;
    }>(
      `SELECT id, email_verified_at IS NOT NULL AS "emailVerified",
         google_id IS NOT NULL AS "hasGoogle"
       FROM users WHERE email = $1 FOR UPDATE`,
      [normalizeEmail(profile.email)],
    );
    if (linked[0]) {
      user = linked[0];
    } else if (sameEmail[0]?.hasGoogle) {
      throw new ServiceError("email_taken", "This email belongs to a different Google account");
    } else if (sameEmail[0]?.emailVerified) {
      const { rows } = await client.query<User>(
        `UPDATE users SET google_id = $2 WHERE id = $1 RETURNING ${USER_COLUMNS}`,
        [sameEmail[0].id, profile.googleId],
      );
      user = rows[0];
    } else if (sameEmail[0]) {
      // Nobody proved they own this address until now, so whoever set the
      // password may not be this person: drop their password, sessions and
      // pending verification, and take the Google name.
      const { id } = sameEmail[0];
      await client.query("DELETE FROM sessions WHERE user_id = $1", [id]);
      await client.query("DELETE FROM email_verification_tokens WHERE user_id = $1", [id]);
      const { rows } = await client.query<User>(
        `UPDATE users
         SET google_id = $2, email_verified_at = $3, password_hash = NULL, display_name = $4
         WHERE id = $1
         RETURNING ${USER_COLUMNS}`,
        [id, profile.googleId, now, googleDisplayName(profile)],
      );
      user = rows[0];
    } else {
      const { rows } = await client.query<User>(
        `INSERT INTO users (email, display_name, google_id, email_verified_at)
         VALUES ($1, $2, $3, $4)
         RETURNING ${USER_COLUMNS}`,
        [normalizeEmail(profile.email), googleDisplayName(profile), profile.googleId, now],
      );
      user = rows[0];
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    // A sign-up for the same email committed between our lookup and insert.
    if ((err as { constraint?: string }).constraint === "users_email_key") {
      throw new ServiceError("email_taken", "An account with this email already exists");
    }
    throw err;
  } finally {
    client.release();
  }
  return { user, sessionToken: await startSession(pool, user.id, now) };
}

// Gives a User without a password (e.g. Google-only) one, so they can also
// log in by email and password.
export async function addPassword(
  pool: Pool,
  user: User,
  input: { password: string },
): Promise<void> {
  const { rowCount } = await pool.query(
    "UPDATE users SET password_hash = $2 WHERE id = $1 AND password_hash IS NULL",
    [user.id, await hashPassword(input.password)],
  );
  if (!rowCount) throw new ServiceError("password_already_set", "This account already has a password");
}
