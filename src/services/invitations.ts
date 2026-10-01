import type { Pool } from "pg";
import { normalizeEmail, type User } from "./accounts.ts";
import { isViolation, ServiceError, UNIQUE_VIOLATION } from "./errors.ts";
import { isUuid } from "./ids.ts";
import { requirePermission, type RoleKind } from "./permissions.ts";
import { PROJECT_COLUMNS, type Project } from "./projects.ts";
import { hashToken, newToken } from "./tokens.ts";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// An Invitation as the Project's Admins see it. `expired` ones stay listed
// until resent or revoked.
export interface Invitation {
  id: string;
  email: string;
  roleId: string | null;
  roleName: string | null;
  expiresAt: Date;
  expired: boolean;
}

// An Invitation plus the token for its emailed link, which is never stored.
export interface SentInvitation {
  invitation: Invitation;
  token: string;
}

// An Invitation as its invitee sees it, from the emailed link or their own
// list. One whose Role was deleted counts as expired, so it always has one.
export interface ReceivedInvitation {
  id: string;
  email: string;
  projectId: string;
  projectName: string;
  roleKind: RoleKind;
  roleName: string;
  invitedByName: string;
  expiresAt: Date;
}

// Joins an Invitation `i` to its Role `r`, if the Role still exists.
const INVITATION_ROLE = "LEFT JOIN roles r ON r.id = i.role_id";

// What the invitee is shown, from invitations `i` and the tables joined in
// RECEIVED_INVITATION_FROM.
const RECEIVED_INVITATION_COLUMNS = `i.id, i.email, i.project_id AS "projectId",
  p.name AS "projectName", r.kind AS "roleKind", r.name AS "roleName", u.display_name AS "invitedByName",
  i.expires_at AS "expiresAt"`;
const RECEIVED_INVITATION_FROM = `invitations i
  JOIN projects p ON p.id = i.project_id
  JOIN users u ON u.id = i.invited_by
  ${INVITATION_ROLE}`;

// Whether the invitee can no longer accept Invitation `i`, $2 being `now`.
// deleteRole judges expiry by the database clock, so a Role can be gone from
// an Invitation this clock still calls pending; acceptInvitation refuses it.
const EXPIRED_FOR_INVITEE = "(i.expires_at <= $2 OR i.role_id IS NULL)";

// An Invitation as Admins see it, from invitations `i` joined by
// INVITATION_ROLE. $1 is `now`.
const INVITATION_COLUMNS = `i.id, i.email, i.role_id AS "roleId", r.name AS "roleName",
  i.expires_at AS "expiresAt", i.expires_at <= $1 AS expired`;

// Invites each email to the Project with its Role, all or none. Returns each
// Invitation with the token for its emailed link. An email may have no
// account yet. An expired Invitation to the same email is replaced.
export async function sendInvitations(
  pool: Pool,
  user: User,
  projectId: string,
  invites: InvitationInput[],
  now: Date = new Date(),
): Promise<SentInvitation[]> {
  await requirePermission(pool, user, projectId, "administer");
  const valid = validInvites(invites);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const sent: SentInvitation[] = [];
    for (const { email, roleId } of valid) {
      // Key-share locked, so the Role can't be deleted before we commit.
      const { rowCount: roleFound } = await client.query(
        "SELECT 1 FROM roles WHERE id = $1 AND project_id = $2 FOR KEY SHARE",
        [roleId, projectId],
      );
      if (!roleFound) throw new ServiceError("not_found", "Role not found");
      const { rowCount: isMember } = await client.query(
        `SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id
         WHERE m.project_id = $1 AND u.email = $2`,
        [projectId, email],
      );
      if (isMember) throw new ServiceError("already_member", `${email} is already a Member`);
      await client.query(
        `UPDATE invitations SET revoked_at = $3
         WHERE project_id = $1 AND email = $2 AND accepted_at IS NULL AND revoked_at IS NULL
           AND expires_at <= $3`,
        [projectId, email, now],
      );
      const token = newToken();
      const { rows } = await client.query<Invitation>(
        `WITH i AS (
           INSERT INTO invitations (project_id, role_id, email, token_hash, invited_by, expires_at)
           VALUES ($2, $3, $4, $5, $6, $7) RETURNING *
         )
         SELECT ${INVITATION_COLUMNS} FROM i ${INVITATION_ROLE}`,
        [now, projectId, roleId, email, hashToken(token), user.id, expiry(now)],
      );
      sent.push({ invitation: rows[0], token });
    }
    await client.query("COMMIT");
    return sent;
  } catch (err) {
    await client.query("ROLLBACK");
    if (isViolation(err, UNIQUE_VIOLATION, "invitations_one_pending_per_email")) {
      throw new ServiceError("already_invited", "That email already has a pending Invitation");
    }
    throw err;
  } finally {
    client.release();
  }
}

export interface InvitationInput {
  email: string;
  roleId: string;
}

// Deliberately loose: the emailed link is the real check.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/;

function validInvites(invites: InvitationInput[]): InvitationInput[] {
  if (!invites.length) throw new ServiceError("invalid_input", "Enter at least one email");
  const valid = invites.map((invite) => {
    const email = typeof invite.email === "string" ? normalizeEmail(invite.email) : "";
    if (!EMAIL_PATTERN.test(email)) {
      throw new ServiceError("invalid_input", `"${email}" isn't a valid email address`);
    }
    if (!isUuid(invite.roleId)) throw new ServiceError("not_found", "Role not found");
    return { email, roleId: invite.roleId };
  });
  if (new Set(valid.map((i) => i.email)).size !== valid.length) {
    throw new ServiceError("invalid_input", "Each email can only be invited once");
  }
  return valid;
}

const expiry = (now: Date) => new Date(now.getTime() + INVITATION_TTL_MS);

// The Project's open Invitations: not yet accepted or revoked.
export async function listInvitations(
  pool: Pool,
  user: User,
  projectId: string,
  now: Date = new Date(),
): Promise<Invitation[]> {
  await requirePermission(pool, user, projectId, "administer");
  const { rows } = await pool.query<Invitation>(
    `SELECT ${INVITATION_COLUMNS} FROM invitations i ${INVITATION_ROLE}
     WHERE i.project_id = $2 AND i.accepted_at IS NULL AND i.revoked_at IS NULL
     ORDER BY i.email`,
    [now, projectId],
  );
  return rows;
}

// Sends an open Invitation again with a new link, good for another 7 days;
// the old link stops working. Works on expired Invitations too, unless their
// Role has been deleted since.
export async function resendInvitation(
  pool: Pool,
  user: User,
  projectId: string,
  invitationId: string,
  now: Date = new Date(),
): Promise<SentInvitation> {
  await requirePermission(pool, user, projectId, "administer");
  if (!isUuid(invitationId)) throw new ServiceError("not_found", "Invitation not found");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Locking the Invitation holds off a concurrent accept or revoke; key-share
    // locking its Role holds off deleteRole until the Invitation is pending
    // again, when deleteRole will see it and refuse.
    const { rowCount: found } = await client.query(
      `SELECT 1 FROM invitations i JOIN roles r ON r.id = i.role_id
       WHERE i.id = $1 AND i.project_id = $2 AND i.accepted_at IS NULL AND i.revoked_at IS NULL
       FOR UPDATE OF i FOR KEY SHARE OF r`,
      [invitationId, projectId],
    );
    if (!found) throw new ServiceError("not_found", "Invitation not found");
    const token = newToken();
    const { rows } = await client.query<Invitation>(
      `WITH i AS (
         UPDATE invitations SET token_hash = $3, expires_at = $4 WHERE id = $2 RETURNING *
       )
       SELECT ${INVITATION_COLUMNS} FROM i ${INVITATION_ROLE}`,
      [now, invitationId, hashToken(token), expiry(now)],
    );
    await client.query("COMMIT");
    return { invitation: rows[0], token };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Withdraws an open Invitation, expired or not. The email can then be invited again.
export async function revokeInvitation(
  pool: Pool,
  user: User,
  projectId: string,
  invitationId: string,
  now: Date = new Date(),
): Promise<void> {
  await requirePermission(pool, user, projectId, "administer");
  if (!isUuid(invitationId)) throw new ServiceError("not_found", "Invitation not found");
  const { rowCount } = await pool.query(
    `UPDATE invitations SET revoked_at = $3
     WHERE id = $1 AND project_id = $2 AND accepted_at IS NULL AND revoked_at IS NULL`,
    [invitationId, projectId, now],
  );
  if (!rowCount) throw new ServiceError("not_found", "Invitation not found");
}

// The pending Invitation behind an emailed link, for its landing page. Needs
// no login, so an invitee without an account can see what they're joining.
// A link to an accepted, revoked or expired Invitation says which, so the
// page can tell the invitee what to do; a resent Invitation's old link is
// simply invalid.
export async function getInvitationByToken(
  pool: Pool,
  token: string,
  now: Date = new Date(),
): Promise<ReceivedInvitation> {
  const { rows } = await pool.query<
    ReceivedInvitation & { expired: boolean; revoked: boolean; accepted: boolean }
  >(
    `SELECT ${RECEIVED_INVITATION_COLUMNS}, ${EXPIRED_FOR_INVITEE} AS expired,
       i.revoked_at IS NOT NULL AS revoked, i.accepted_at IS NOT NULL AS accepted
     FROM ${RECEIVED_INVITATION_FROM}
     WHERE i.token_hash = $1`,
    [hashToken(token), now],
  );
  if (!rows[0]) throw new ServiceError("invalid_token", "This Invitation link is not valid");
  const { expired, revoked, accepted, ...invitation } = rows[0];
  if (accepted) throw new ServiceError("invitation_accepted", "This Invitation was already accepted");
  if (revoked) throw new ServiceError("invitation_revoked", "This Invitation was revoked");
  if (expired) throw expiredError();
  return invitation;
}

const expiredError = () =>
  new ServiceError("invitation_expired", "This Invitation has expired; ask for a new one");

// The pending Invitations addressed to the User's email, once it's verified,
// so they can accept one without the emailed link.
export async function listMyInvitations(
  pool: Pool,
  user: User,
  now: Date = new Date(),
): Promise<ReceivedInvitation[]> {
  if (!user.emailVerified) return [];
  const { rows } = await pool.query<ReceivedInvitation>(
    `SELECT ${RECEIVED_INVITATION_COLUMNS} FROM ${RECEIVED_INVITATION_FROM}
     WHERE i.email = $1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL
       AND NOT ${EXPIRED_FOR_INVITEE}
     ORDER BY p.name, i.created_at`,
    [user.email, now],
  );
  return rows;
}

// Accepts an Invitation, making the acting User a Member with its Role.
// Returns the Project they joined.
export async function acceptInvitation(
  pool: Pool,
  user: User,
  invitationId: string,
  now: Date = new Date(),
): Promise<Project> {
  if (!user.emailVerified) {
    throw new ServiceError("email_not_verified", "Verify your email before accepting an Invitation");
  }
  if (!isUuid(invitationId)) throw new ServiceError("not_found", "Invitation not found");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Locked, so a concurrent accept, resend or revoke waits for this one.
    const { rows } = await client.query<{
      projectId: string;
      roleId: string | null;
      email: string;
      expired: boolean;
    }>(
      `SELECT project_id AS "projectId", role_id AS "roleId", email, expires_at <= $2 AS expired
       FROM invitations
       WHERE id = $1 AND accepted_at IS NULL AND revoked_at IS NULL FOR UPDATE`,
      [invitationId, now],
    );
    if (!rows[0]) throw new ServiceError("not_found", "Invitation not found");
    const { projectId, roleId, email, expired } = rows[0];
    if (email !== user.email) {
      throw new ServiceError("forbidden", "This Invitation is for a different email address");
    }
    // deleteRole judges expiry by the database clock, so a Role can be gone
    // from an Invitation this clock still calls pending.
    if (expired || !roleId) throw expiredError();
    await client.query("UPDATE invitations SET accepted_at = $2 WHERE id = $1", [
      invitationId,
      now,
    ]);
    await client.query(
      "INSERT INTO memberships (project_id, user_id, role_id) VALUES ($1, $2, $3)",
      [projectId, user.id, roleId],
    );
    const { rows: project } = await client.query<Project>(
      `SELECT ${PROJECT_COLUMNS} FROM projects p WHERE p.id = $1`,
      [projectId],
    );
    await client.query("COMMIT");
    return project[0];
  } catch (err) {
    await client.query("ROLLBACK");
    // Joined through a second Invitation sent while the first was accepted.
    if (isViolation(err, UNIQUE_VIOLATION, "memberships_project_id_user_id_key")) {
      throw new ServiceError("already_member", "You're already a Member of this Project");
    }
    throw err;
  } finally {
    client.release();
  }
}
