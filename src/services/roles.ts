import type { Pool } from "pg";
import type { User } from "./accounts.ts";
import { ServiceError } from "./errors.ts";
import { isUuid } from "./ids.ts";
import {
  getPermissions,
  requirePermission,
  ROLE_TOGGLES_SQL,
  type RoleKind,
  type RoleToggles,
} from "./permissions.ts";

export type { RoleKind, RoleToggles };

export interface Role {
  id: string;
  name: string;
  kind: RoleKind;
  // Only custom Roles have toggles; the built-in ones are fixed.
  toggles: RoleToggles | null;
}

export interface RoleInput {
  name: string;
  toggles: RoleToggles;
}

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";

function isViolation(err: unknown, code: string, constraint: string): boolean {
  const pgErr = err as { code?: string; constraint?: string };
  return pgErr.code === code && pgErr.constraint === constraint;
}

const ROLE_COLUMNS = `r.id, r.name, r.kind, ${ROLE_TOGGLES_SQL} AS toggles`;

// Every Role in the Project, built-in first. Any Member can see them.
export async function listRoles(pool: Pool, user: User, projectId: string): Promise<Role[]> {
  await getPermissions(pool, user, projectId); // Members only
  const { rows } = await pool.query<Role>(
    `SELECT ${ROLE_COLUMNS} FROM roles r WHERE r.project_id = $1 ORDER BY r.kind, r.name`,
    [projectId],
  );
  return rows;
}

export async function createRole(
  pool: Pool,
  user: User,
  projectId: string,
  input: RoleInput,
): Promise<Role> {
  await requirePermission(pool, user, projectId, "administer");
  const { name, toggles } = validRoleInput(input);
  try {
    const { rows } = await pool.query<Role>(
      `INSERT INTO roles AS r (project_id, kind, name, can_edit_repertoire_setlists_events,
         can_remove_members, can_see_total_pay_expenses)
       VALUES ($1, 'custom', $2, $3, $4, $5) RETURNING ${ROLE_COLUMNS}`,
      [projectId, name, ...toggleValues(toggles)],
    );
    return rows[0];
  } catch (err) {
    throw asNameTaken(err);
  }
}

// Renames a custom Role and replaces its toggles. Its Members' permissions
// change with it.
export async function updateRole(
  pool: Pool,
  user: User,
  projectId: string,
  roleId: string,
  input: RoleInput,
): Promise<Role> {
  await requirePermission(pool, user, projectId, "administer");
  const { name, toggles } = validRoleInput(input);
  await assertCustomRole(pool, projectId, roleId);
  try {
    const { rows } = await pool.query<Role>(
      `UPDATE roles r SET name = $2, can_edit_repertoire_setlists_events = $3,
         can_remove_members = $4, can_see_total_pay_expenses = $5, updated_at = now()
       WHERE r.id = $1 AND r.project_id = $6 RETURNING ${ROLE_COLUMNS}`,
      [roleId, name, ...toggleValues(toggles), projectId],
    );
    // Deleted since the check above.
    if (!rows[0]) throw new ServiceError("not_found", "Role not found");
    return rows[0];
  } catch (err) {
    throw asNameTaken(err);
  }
}

// Deletes a custom Role. Blocked while any Member holds it or any pending
// Invitation offers it; past Invitations just lose their Role.
export async function deleteRole(
  pool: Pool,
  user: User,
  projectId: string,
  roleId: string,
): Promise<void> {
  await requirePermission(pool, user, projectId, "administer");
  await assertCustomRole(pool, projectId, roleId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Locking the Role holds off any Invitation sent for it meanwhile.
    await client.query("SELECT 1 FROM roles WHERE id = $1 AND project_id = $2 FOR UPDATE", [
      roleId,
      projectId,
    ]);
    const { rowCount: pending } = await client.query(
      `SELECT 1 FROM invitations WHERE role_id = $1 AND accepted_at IS NULL
         AND revoked_at IS NULL AND expires_at > now()`,
      [roleId],
    );
    if (pending) {
      throw new ServiceError("role_in_use", "Revoke this Role's pending Invitations before deleting it");
    }
    await client.query("DELETE FROM roles WHERE id = $1 AND project_id = $2", [roleId, projectId]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    if (isViolation(err, FOREIGN_KEY_VIOLATION, "memberships_project_id_role_id_fkey")) {
      throw new ServiceError("role_in_use", "Reassign this Role's Members before deleting it");
    }
    throw err;
  } finally {
    client.release();
  }
}

// Gives a Member a different Role, effective immediately. The Owner always
// stays an Admin, so their Role can't be changed.
export async function changeMemberRole(
  pool: Pool,
  user: User,
  projectId: string,
  memberUserId: string,
  roleId: string,
): Promise<void> {
  await requirePermission(pool, user, projectId, "administer");
  await findRoleKind(pool, projectId, roleId);
  if (!isUuid(memberUserId)) throw new ServiceError("not_found", "Member not found");
  const { rows } = await pool.query<{ isOwner: boolean }>(
    `SELECT p.owner_id = m.user_id AS "isOwner" FROM memberships m
     JOIN projects p ON p.id = m.project_id
     WHERE m.project_id = $1 AND m.user_id = $2`,
    [projectId, memberUserId],
  );
  if (!rows[0]) throw new ServiceError("not_found", "Member not found");
  if (rows[0].isOwner) {
    throw new ServiceError("owner_protected", "The Owner's Role can't be changed");
  }
  await pool.query(
    `UPDATE memberships SET role_id = $3, updated_at = now()
     WHERE project_id = $1 AND user_id = $2`,
    [projectId, memberUserId, roleId],
  );
}

function validRoleInput(input: RoleInput): RoleInput {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) throw new ServiceError("invalid_input", "Role name is required");
  // Copy only the known toggles, so nothing else can be granted.
  const { editRepertoireSetlistsEvents, removeMembers, seeTotalPayExpenses } = input.toggles ?? {};
  const toggles = { editRepertoireSetlistsEvents, removeMembers, seeTotalPayExpenses };
  if (!Object.values(toggles).every((t) => typeof t === "boolean")) {
    throw new ServiceError("invalid_input", "Every permission must be on or off");
  }
  return { name, toggles };
}

const toggleValues = (t: RoleToggles) => [
  t.editRepertoireSetlistsEvents,
  t.removeMembers,
  t.seeTotalPayExpenses,
];

function asNameTaken(err: unknown): unknown {
  if (isViolation(err, UNIQUE_VIOLATION, "roles_project_id_name_key")) {
    return new ServiceError("name_taken", "A Role with that name already exists");
  }
  return err;
}

async function findRoleKind(pool: Pool, projectId: string, roleId: string): Promise<RoleKind> {
  if (!isUuid(roleId)) throw new ServiceError("not_found", "Role not found");
  const { rows } = await pool.query<{ kind: RoleKind }>(
    "SELECT kind FROM roles WHERE id = $1 AND project_id = $2",
    [roleId, projectId],
  );
  if (!rows[0]) throw new ServiceError("not_found", "Role not found");
  return rows[0].kind;
}

async function assertCustomRole(pool: Pool, projectId: string, roleId: string): Promise<void> {
  if ((await findRoleKind(pool, projectId, roleId)) !== "custom") {
    throw new ServiceError("built_in_role", "The Admin and Member Roles can't be changed");
  }
}
