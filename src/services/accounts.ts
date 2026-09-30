import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Pool } from "pg";
import { ServiceError } from "./errors.ts";

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

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const newToken = () => randomBytes(32).toString("base64url");
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

// Creates a password User. Returns the token for their email verification link.
export async function signUp(
  pool: Pool,
  input: { email: string; password: string; displayName: string },
): Promise<{ user: User; verificationToken: string }> {
  const displayName = input.displayName.trim();
  if (!displayName) throw new ServiceError("invalid_input", "Display name is required");
  const verificationToken = newToken();
  const { rows } = await pool
    .query<User>(
      `WITH created AS (
         INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, $3)
         RETURNING ${USER_COLUMNS}
       ), token AS (
         INSERT INTO email_verification_tokens (token_hash, user_id)
         SELECT $4, id FROM created
       )
       SELECT * FROM created`,
      [
        normalizeEmail(input.email),
        displayName,
        await hashPassword(input.password),
        hashToken(verificationToken),
      ],
    )
    .catch((err) => {
      if (err.code === UNIQUE_VIOLATION && err.constraint === "users_email_key") {
        throw new ServiceError("email_taken", "An account with this email already exists");
      }
      throw err;
    });
  return { user: rows[0], verificationToken };
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

// Follows an email verification link. Each link works once.
export async function verifyEmail(
  pool: Pool,
  token: string,
  now: Date = new Date(),
): Promise<User> {
  const { rows } = await pool.query<User>(
    `WITH used AS (
       DELETE FROM email_verification_tokens WHERE token_hash = $1 RETURNING user_id
     )
     UPDATE users SET email_verified_at = coalesce(email_verified_at, $2)
     WHERE id = (SELECT user_id FROM used)
     RETURNING ${USER_COLUMNS}`,
    [hashToken(token), now],
  );
  if (!rows[0]) throw new ServiceError("invalid_token", "This verification link is not valid");
  return rows[0];
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
