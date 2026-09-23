import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createTestDb, type TestDb } from "../../test/test-db.ts";
import { createProject } from "./projects.ts";

describe("createProject", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("makes the creator the first Admin of a new Project", async () => {
    const { rows } = await db.pool.query(
      "INSERT INTO users (email) VALUES ('a@example.com') RETURNING id",
    );
    const userId: string = rows[0].id;

    const project = await createProject(db.pool, { name: "Los Tigres", userId });

    const { rows: members } = await db.pool.query(
      `SELECT r.kind FROM memberships m JOIN roles r ON r.id = m.role_id
       WHERE m.project_id = $1 AND m.user_id = $2`,
      [project.id, userId],
    );
    assert.deepEqual(members, [{ kind: "admin" }]);
  });
});
