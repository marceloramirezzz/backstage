import type { Pool } from "pg";
import type { User } from "./accounts.ts";
import { ServiceError } from "./errors.ts";
import { isUuid } from "./ids.ts";

export type RoleKind = "admin" | "member" | "custom";

// The permissions a custom Role can switch on, each with its column on the
// roles table. Seeing other Members' payout splits is deliberately not among
// them (ADR 0002). A new toggle starts here.
export const ROLE_TOGGLE_COLUMNS = {
  editRepertoireSetlistsEvents: "can_edit_repertoire_setlists_events",
  removeMembers: "can_remove_members",
  seeTotalPayExpenses: "can_see_total_pay_expenses",
} as const;

export type RoleToggle = keyof typeof ROLE_TOGGLE_COLUMNS;
export type RoleToggles = Record<RoleToggle, boolean>;
export const ROLE_TOGGLES = Object.keys(ROLE_TOGGLE_COLUMNS) as RoleToggle[];

// What a Member may do in a Project. Code checks these, never Role names.
export interface Permissions extends RoleToggles {
  // Admin only, never grantable to any other Role.
  seeOthersPayoutSplits: boolean;
  // Admin-only actions: Roles, Invitations, Payout Splits, the Landing page.
  administer: boolean;
}

// The one place a Role turns into permissions: Admin has everything, Member
// the read-only baseline, a custom Role just its toggles.
function resolvePermissions(kind: RoleKind, toggles: RoleToggles | null): Permissions {
  switch (kind) {
    case "admin":
      return {
        editRepertoireSetlistsEvents: true,
        removeMembers: true,
        seeTotalPayExpenses: true,
        seeOthersPayoutSplits: true,
        administer: true,
      };
    case "member":
      return {
        editRepertoireSetlistsEvents: false,
        removeMembers: false,
        seeTotalPayExpenses: true,
        seeOthersPayoutSplits: false,
        administer: false,
      };
    case "custom":
      if (!toggles) throw new Error("A custom Role must have toggles");
      return {
        ...toggles,
        seeOthersPayoutSplits: false,
        administer: false,
      };
  }
}

// The acting User's permissions in a Project, read fresh from their current
// Membership. A Project they don't belong to is reported as not found.
export async function getPermissions(
  pool: Pool,
  user: User,
  projectId: string,
): Promise<Permissions> {
  if (!isUuid(projectId)) throw new ServiceError("not_found", "Project not found");
  const { rows } = await pool.query<{ kind: RoleKind; toggles: RoleToggles | null }>(
    `SELECT r.kind, ${ROLE_TOGGLES_SQL} AS toggles FROM memberships m
     JOIN roles r ON r.id = m.role_id
     WHERE m.user_id = $1 AND m.project_id = $2`,
    [user.id, projectId],
  );
  if (!rows[0]) throw new ServiceError("not_found", "Project not found");
  return resolvePermissions(rows[0].kind, rows[0].toggles);
}

// Throws unless the acting User holds `permission` in the Project.
export async function requirePermission(
  pool: Pool,
  user: User,
  projectId: string,
  permission: keyof Permissions,
): Promise<void> {
  const permissions = await getPermissions(pool, user, projectId);
  if (!permissions[permission]) {
    throw new ServiceError("forbidden", "You don't have permission to do that");
  }
}

// A Role row's toggles as a RoleToggles object, NULL for the built-in Roles.
// Expects the roles table aliased as `r`.
export const ROLE_TOGGLES_SQL = `CASE WHEN r.kind = 'custom' THEN json_build_object(${ROLE_TOGGLES.map(
  (t) => `'${t}', r.${ROLE_TOGGLE_COLUMNS[t]}`,
).join(", ")}) END`;
