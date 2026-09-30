import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { memoryMailer } from "../../test/mailer.ts";
import { createTestDb, type TestDb } from "../../test/test-db.ts";
import { verifiedUser } from "../../test/users.ts";
import { signUp } from "./accounts.ts";
import { createProject, getProject, listProjects } from "./projects.ts";

describe("createProject", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("makes the creator the Owner and an Admin of a new Project", async () => {
    const user = await verifiedUser(db, "a@example.com");

    const project = await createProject(db.pool, user, { name: "Los Tigres" });

    assert.equal(project.name, "Los Tigres");
    assert.equal(project.ownerId, user.id);
    const { rows: members } = await db.pool.query(
      `SELECT r.kind FROM memberships m JOIN roles r ON r.id = m.role_id
       WHERE m.project_id = $1 AND m.user_id = $2`,
      [project.id, user.id],
    );
    assert.deepEqual(members, [{ kind: "admin" }]);
  });

  it("seeds the built-in Admin and Member Roles", async () => {
    const user = await verifiedUser(db, "roles@example.com");

    const project = await createProject(db.pool, user, { name: "Los Pumas" });

    const { rows: roles } = await db.pool.query(
      "SELECT kind, name FROM roles WHERE project_id = $1 ORDER BY kind",
      [project.id],
    );
    assert.deepEqual(roles, [
      { kind: "admin", name: "Admin" },
      { kind: "member", name: "Member" },
    ]);
  });

  it("refuses a User who hasn't verified their email", async () => {
    const { user } = await signUp(db.pool, memoryMailer(), {
      email: "b@example.com",
      password: "a password",
      displayName: "B",
    });

    await assert.rejects(createProject(db.pool, user, { name: "Los Leones" }), {
      name: "ServiceError",
      code: "email_not_verified",
    });
    assert.deepEqual(await listProjects(db.pool, user), []);
  });

  it("refuses a blank name", async () => {
    const user = await verifiedUser(db, "blank@example.com");

    await assert.rejects(createProject(db.pool, user, { name: "   " }), {
      name: "ServiceError",
      code: "invalid_input",
    });
  });

  it("trims the name", async () => {
    const user = await verifiedUser(db, "trim@example.com");

    const project = await createProject(db.pool, user, { name: "  Los Osos " });

    assert.equal(project.name, "Los Osos");
  });
});

describe("createProject atomicity", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("leaves nothing behind when a later step fails", async () => {
    const user = await verifiedUser(db, "atomic@example.com");
    // Make the last step (the Owner's Membership) fail.
    await db.pool.query(`
      CREATE FUNCTION fail() RETURNS trigger LANGUAGE plpgsql
        AS $$ BEGIN RAISE EXCEPTION 'boom'; END $$;
      CREATE TRIGGER fail BEFORE INSERT ON memberships
        FOR EACH ROW EXECUTE FUNCTION fail();
    `);

    await assert.rejects(createProject(db.pool, user, { name: "Los Lobos" }), /boom/);

    assert.deepEqual(await listProjects(db.pool, user), []);
    // Roles are only readable through a Membership, so check for orphans directly.
    const { rows } = await db.pool.query("SELECT count(*)::int AS roles FROM roles");
    assert.deepEqual(rows, [{ roles: 0 }]);
  });
});

describe("listProjects and getProject", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("lists nothing for a User with no Memberships", async () => {
    const user = await verifiedUser(db, "new@example.com");

    assert.deepEqual(await listProjects(db.pool, user), []);
  });

  it("lists every Project the User belongs to, by name", async () => {
    const user = await verifiedUser(db, "multi@example.com");
    const other = await verifiedUser(db, "other@example.com");
    const zorros = await createProject(db.pool, user, { name: "Los Zorros" });
    const aguilas = await createProject(db.pool, user, { name: "Las Águilas" });
    await createProject(db.pool, other, { name: "Not Mine" });

    assert.deepEqual(await listProjects(db.pool, user), [aguilas, zorros]);
  });

  it("switches to a Project the User belongs to", async () => {
    const user = await verifiedUser(db, "switch@example.com");
    await createProject(db.pool, user, { name: "First" });
    const second = await createProject(db.pool, user, { name: "Second" });

    assert.deepEqual(await getProject(db.pool, user, second.id), second);
  });

  it("refuses a Project the User doesn't belong to", async () => {
    const owner = await verifiedUser(db, "owner@example.com");
    const outsider = await verifiedUser(db, "outsider@example.com");
    const project = await createProject(db.pool, owner, { name: "Private" });

    await assert.rejects(getProject(db.pool, outsider, project.id), {
      name: "ServiceError",
      code: "not_found",
    });
  });

  it("refuses an id that isn't a Project", async () => {
    const user = await verifiedUser(db, "bogus@example.com");

    await assert.rejects(getProject(db.pool, user, "not-a-uuid"), {
      name: "ServiceError",
      code: "not_found",
    });
  });
});
