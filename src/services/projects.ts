import type { Pool } from "pg";
import { ServiceError } from "./errors.ts";

export interface Project {
  id: string;
  name: string;
}

// Creates a Project with its built-in Admin and Member roles; the creator
// becomes its first Admin. The creator must have verified their email.
export async function createProject(
  pool: Pool,
  input: { name: string; userId: string },
): Promise<Project> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: creator } = await client.query<{ verified: boolean }>(
      "SELECT email_verified_at IS NOT NULL AS verified FROM users WHERE id = $1",
      [input.userId],
    );
    if (!creator[0]?.verified) {
      throw new ServiceError("email_not_verified", "Verify your email before creating a Project");
    }
    const { rows } = await client.query<Project>(
      "INSERT INTO projects (name) VALUES ($1) RETURNING id, name",
      [input.name],
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
      [project.id, input.userId, admin[0].id],
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
