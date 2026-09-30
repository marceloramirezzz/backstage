import type { Pool } from "pg";
import type { User } from "./accounts.ts";
import { ServiceError } from "./errors.ts";

export interface Project {
  id: string;
  name: string;
  ownerId: string;
}

const PROJECT_COLUMNS = `p.id, p.name, p.owner_id AS "ownerId"`;

// The Projects the acting User ($1) is a Member of.
const MEMBER_PROJECTS = `SELECT ${PROJECT_COLUMNS} FROM projects p
  JOIN memberships m ON m.project_id = p.id AND m.user_id = $1`;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Creates a Project with its built-in Admin and Member roles; the creator
// becomes its Owner and first Admin. The creator must have verified their email.
export async function createProject(
  pool: Pool,
  user: User,
  input: { name: string },
): Promise<Project> {
  if (!user.emailVerified) {
    throw new ServiceError("email_not_verified", "Verify your email before creating a Project");
  }
  const name = input.name.trim();
  if (!name) throw new ServiceError("invalid_input", "Project name is required");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<Project>(
      `INSERT INTO projects AS p (name, owner_id) VALUES ($1, $2) RETURNING ${PROJECT_COLUMNS}`,
      [name, user.id],
    );
    const project = rows[0];
    const { rows: admin } = await client.query<{ id: string }>(
      "INSERT INTO roles (project_id, kind, name) VALUES ($1, 'admin', 'Admin') RETURNING id",
      [project.id],
    );
    await client.query(
      "INSERT INTO roles (project_id, kind, name) VALUES ($1, 'member', 'Member')",
      [project.id],
    );
    await client.query(
      "INSERT INTO memberships (project_id, user_id, role_id) VALUES ($1, $2, $3)",
      [project.id, user.id, admin[0].id],
    );
    await client.query("COMMIT");
    return project;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// The Projects the User is a Member of, for the Project switcher. Empty for a
// User with no Memberships, who can only create a Project or accept an Invitation.
export async function listProjects(pool: Pool, user: User): Promise<Project[]> {
  const { rows } = await pool.query<Project>(
    `${MEMBER_PROJECTS} ORDER BY p.name, p.created_at`,
    [user.id],
  );
  return rows;
}

// Opens one of the User's Projects. A Project they don't belong to is
// reported as not found, so its existence isn't revealed.
export async function getProject(pool: Pool, user: User, projectId: string): Promise<Project> {
  if (!UUID_PATTERN.test(projectId)) throw new ServiceError("not_found", "Project not found");
  const { rows } = await pool.query<Project>(`${MEMBER_PROJECTS} WHERE p.id = $2`, [
    user.id,
    projectId,
  ]);
  if (!rows[0]) throw new ServiceError("not_found", "Project not found");
  return rows[0];
}
