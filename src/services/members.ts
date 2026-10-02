import type { Pool, PoolClient } from "pg";
import type { User } from "./accounts.ts";
import { ServiceError } from "./errors.ts";
import { isUuid } from "./ids.ts";
import { getPermissions, type RoleKind } from "./permissions.ts";
import { inTransaction } from "./transaction.ts";

// A Member as every Member sees them: display name and Role, no email.
export interface Member {
  userId: string;
  displayName: string;
  roleId: string;
  roleKind: RoleKind;
  roleName: string;
  isOwner: boolean;
}

// The Project's Members, the Owner first. Any Member can see them.
export async function listMembers(pool: Pool, user: User, projectId: string): Promise<Member[]> {
  await getPermissions(pool, user, projectId); // Members only
  const { rows } = await pool.query<Member>(
    `SELECT u.id AS "userId", u.display_name AS "displayName", r.id AS "roleId",
       r.kind AS "roleKind", r.name AS "roleName", p.owner_id = u.id AS "isOwner"
     FROM memberships m
     JOIN projects p ON p.id = m.project_id
     JOIN users u ON u.id = m.user_id
     JOIN roles r ON r.id = m.role_id
     WHERE m.project_id = $1
     ORDER BY (p.owner_id = u.id) DESC, u.display_name, m.created_at`,
    [projectId],
  );
  return rows;
}

// Removes a Member. Takes an Admin or the "remove members" permission, but only
// an Admin can remove an Admin, and nobody can remove the Owner: they must
// transfer ownership and leave.
export async function removeMember(
  pool: Pool,
  user: User,
  projectId: string,
  memberUserId: string,
): Promise<void> {
  const permissions = await getPermissions(pool, user, projectId);
  if (!permissions.removeMembers) {
    throw new ServiceError("forbidden", "You don't have permission to do that");
  }
  if (!isUuid(memberUserId)) throw new ServiceError("not_found", "Member not found");
  await inTransaction(pool, async (client) => {
    const ownerId = await lockProject(client, projectId);
    const target = await findMember(client, projectId, memberUserId);
    if (memberUserId === ownerId) throw ownerProtected("The Owner can't be removed");
    if (target.roleKind === "admin" && !permissions.administer) {
      throw new ServiceError("forbidden", "Only an Admin can remove an Admin");
    }
    await deleteMembership(client, projectId, memberUserId);
  });
}

// The acting User leaves the Project. The Owner can't until they hand it over.
export async function leaveProject(pool: Pool, user: User, projectId: string): Promise<void> {
  await getPermissions(pool, user, projectId); // Members only
  await inTransaction(pool, async (client) => {
    const ownerId = await lockProject(client, projectId);
    if (user.id === ownerId) {
      throw ownerProtected("Transfer ownership before leaving the Project");
    }
    await findMember(client, projectId, user.id);
    await deleteMembership(client, projectId, user.id);
  });
}

// Hands the Project to another Admin. Only the Owner can; the previous Owner
// stays an Admin, and the new one gets the Owner's protection.
export async function transferOwnership(
  pool: Pool,
  user: User,
  projectId: string,
  newOwnerId: string,
): Promise<void> {
  await getPermissions(pool, user, projectId); // Members only
  await inTransaction(pool, async (client) => {
    const ownerId = await lockProject(client, projectId);
    if (user.id !== ownerId) {
      throw new ServiceError("forbidden", "Only the Owner can transfer ownership");
    }
    if (!isUuid(newOwnerId)) throw new ServiceError("not_found", "Member not found");
    const target = await findMember(client, projectId, newOwnerId);
    if (newOwnerId === ownerId || target.roleKind !== "admin") {
      throw new ServiceError("invalid_input", "Ownership can only go to another Admin");
    }
    await client.query("UPDATE projects SET owner_id = $2 WHERE id = $1", [projectId, newOwnerId]);
  });
}

// Deletes the Project and everything in it. Only the Owner can, and only by
// typing the Project's exact name.
export async function deleteProject(
  pool: Pool,
  user: User,
  projectId: string,
  confirmName: string,
): Promise<void> {
  await getPermissions(pool, user, projectId); // Members only
  await inTransaction(pool, async (client) => {
    const { rows } = await client.query<{ name: string; ownerId: string }>(
      `SELECT name, owner_id AS "ownerId" FROM projects WHERE id = $1 FOR UPDATE`,
      [projectId],
    );
    // Deleted since the check above.
    if (!rows[0]) throw new ServiceError("not_found", "Project not found");
    if (user.id !== rows[0].ownerId) {
      throw new ServiceError("forbidden", "Only the Owner can delete the Project");
    }
    if (confirmName !== rows[0].name) {
      throw new ServiceError("invalid_input", "Type the Project's name to delete it");
    }
    // Children before parents, for the tables without a cascade. Events take
    // their Attendance, Expenses, Setlist copies, Splits and snapshots with
    // them; Setlists their items; Roles the default Split.
    for (const table of ["events", "setlists", "selections", "songs", "invitations"]) {
      await client.query(`DELETE FROM ${table} WHERE project_id = $1`, [projectId]);
    }
    await client.query("DELETE FROM memberships WHERE project_id = $1", [projectId]);
    await client.query("DELETE FROM roles WHERE project_id = $1", [projectId]);
    // The Owner's Membership is gone, which only the deferred check on
    // projects.owner_id could mind, and the Project goes before it runs.
    await client.query("DELETE FROM projects WHERE id = $1", [projectId]);
  });
}

// Locks the Project row, so ownership changes, leaving and removals take turns,
// and returns its Owner.
async function lockProject(client: PoolClient, projectId: string): Promise<string> {
  const { rows } = await client.query<{ ownerId: string }>(
    `SELECT owner_id AS "ownerId" FROM projects WHERE id = $1 FOR UPDATE`,
    [projectId],
  );
  if (!rows[0]) throw new ServiceError("not_found", "Project not found");
  return rows[0].ownerId;
}

async function findMember(
  client: PoolClient,
  projectId: string,
  userId: string,
): Promise<{ roleKind: RoleKind }> {
  const { rows } = await client.query<{ roleKind: RoleKind }>(
    `SELECT r.kind AS "roleKind" FROM memberships m JOIN roles r ON r.id = m.role_id
     WHERE m.project_id = $1 AND m.user_id = $2`,
    [projectId, userId],
  );
  if (!rows[0]) throw new ServiceError("not_found", "Member not found");
  return rows[0];
}

async function deleteMembership(client: PoolClient, projectId: string, userId: string) {
  await client.query("DELETE FROM memberships WHERE project_id = $1 AND user_id = $2", [
    projectId,
    userId,
  ]);
}

const ownerProtected = (message: string) => new ServiceError("owner_protected", message);
