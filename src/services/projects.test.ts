import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createTestDb, type TestDb } from "../../test/test-db.ts";
import { signUp, verifyEmail } from "./accounts.ts";
import { createProject } from "./projects.ts";

describe("createProject", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("makes the creator the first Admin of a new Project", async () => {
    const { verificationToken } = await signUp(db.pool, {
      email: "a@example.com",
      password: "a password",
      displayName: "A",
    });
    const user = await verifyEmail(db.pool, verificationToken);

    const project = await createProject(db.pool, user, { name: "Los Tigres" });

    const { rows: members } = await db.pool.query(
      `SELECT r.kind FROM memberships m JOIN roles r ON r.id = m.role_id
       WHERE m.project_id = $1 AND m.user_id = $2`,
      [project.id, user.id],
    );
    assert.deepEqual(members, [{ kind: "admin" }]);
  });

  it("refuses a User who hasn't verified their email", async () => {
    const { user } = await signUp(db.pool, {
      email: "b@example.com",
      password: "a password",
      displayName: "B",
    });

    await assert.rejects(createProject(db.pool, user, { name: "Los Leones" }), {
      name: "ServiceError",
      code: "email_not_verified",
    });
  });
});
