import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createTestDb, type TestDb } from "../../test/test-db.ts";
import { verifiedUser } from "../../test/users.ts";
import type { User } from "./accounts.ts";
import { getPermissions, type Permissions } from "./permissions.ts";
import { createProject, type Project } from "./projects.ts";
import {
  changeMemberRole,
  createRole,
  deleteRole,
  listRoles,
  updateRole,
  type Role,
  type RoleInput,
  type RoleToggles,
} from "./roles.ts";

const NO_TOGGLES: RoleToggles = {
  editRepertoireSetlistsEvents: false,
  removeMembers: false,
  seeTotalPayExpenses: false,
};

const ALL_TOGGLES: RoleToggles = {
  editRepertoireSetlistsEvents: true,
  removeMembers: true,
  seeTotalPayExpenses: true,
};

// No service adds Members until Invitations (#10), so join directly.
async function addMember(db: TestDb, project: Project, user: User, role: Role): Promise<void> {
  await db.pool.query(
    "INSERT INTO memberships (project_id, user_id, role_id) VALUES ($1, $2, $3)",
    [project.id, user.id, role.id],
  );
}

// No service sends Invitations until #10 either, so insert one directly.
async function invite(
  db: TestDb,
  project: Project,
  invitedBy: User,
  role: Role,
  email: string,
): Promise<string> {
  const { rows } = await db.pool.query<{ id: string }>(
    `INSERT INTO invitations (project_id, role_id, email, token, invited_by, expires_at)
     VALUES ($1, $2, $3, gen_random_uuid(), $4, now() + interval '7 days') RETURNING id`,
    [project.id, role.id, email, invitedBy.id],
  );
  return rows[0].id;
}

async function builtIn(db: TestDb, owner: User, project: Project, kind: Role["kind"]) {
  const role = (await listRoles(db.pool, owner, project.id)).find((r) => r.kind === kind);
  assert.ok(role);
  return role;
}

// A Project with its Owner and a second Member holding the built-in Member Role.
async function band(db: TestDb, name: string) {
  const owner = await verifiedUser(db, `${name}-owner@example.com`);
  const member = await verifiedUser(db, `${name}-member@example.com`);
  const project = await createProject(db.pool, owner, { name });
  await addMember(db, project, member, await builtIn(db, owner, project, "member"));
  return { owner, member, project };
}

describe("getPermissions", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("gives an Admin every permission", async () => {
    const { owner, project } = await band(db, "admin");

    assert.deepEqual(await getPermissions(db.pool, owner, project.id), {
      editRepertoireSetlistsEvents: true,
      removeMembers: true,
      seeTotalPayExpenses: true,
      seeOthersPayoutSplits: true,
      administer: true,
    } satisfies Permissions);
  });

  it("gives a Member the read-only baseline", async () => {
    const { member, project } = await band(db, "member");

    assert.deepEqual(await getPermissions(db.pool, member, project.id), {
      editRepertoireSetlistsEvents: false,
      removeMembers: false,
      seeTotalPayExpenses: true,
      seeOthersPayoutSplits: false,
      administer: false,
    } satisfies Permissions);
  });

  for (const toggle of Object.keys(NO_TOGGLES) as (keyof RoleToggles)[]) {
    it(`gives a custom Role exactly its ${toggle} toggle`, async () => {
      const { owner, project } = await band(db, `toggle-${toggle}`);
      const roadie = await verifiedUser(db, `${toggle}-roadie@example.com`);
      const role = await createRole(db.pool, owner, project.id, {
        name: "Roadie",
        toggles: { ...NO_TOGGLES, [toggle]: true },
      });
      await addMember(db, project, roadie, role);

      assert.deepEqual(await getPermissions(db.pool, roadie, project.id), {
        ...NO_TOGGLES,
        [toggle]: true,
        seeOthersPayoutSplits: false,
        administer: false,
      });
    });
  }

  it("gives a custom Role with every toggle all three, but still no Admin permissions", async () => {
    const { owner, project } = await band(db, "all-toggles");
    const roadie = await verifiedUser(db, "all-toggles-roadie@example.com");
    const role = await createRole(db.pool, owner, project.id, {
      name: "Manager",
      toggles: ALL_TOGGLES,
    });
    await addMember(db, project, roadie, role);

    assert.deepEqual(await getPermissions(db.pool, roadie, project.id), {
      ...ALL_TOGGLES,
      seeOthersPayoutSplits: false,
      administer: false,
    } satisfies Permissions);
  });

  it("never lets a custom Role see other Members' splits", async () => {
    const { owner, project } = await band(db, "splits");
    const roadie = await verifiedUser(db, "splits-roadie@example.com");
    // Smuggle in extra flags, as an untyped caller could, on create and on update.
    const smuggled = { ...ALL_TOGGLES, seeOthersPayoutSplits: true, administer: true } as RoleToggles;
    const role = await createRole(db.pool, owner, project.id, { name: "Manager", toggles: smuggled });
    await addMember(db, project, roadie, role);
    await updateRole(db.pool, owner, project.id, role.id, { name: "Manager", toggles: smuggled });

    const permissions = await getPermissions(db.pool, roadie, project.id);

    assert.equal(permissions.seeOthersPayoutSplits, false);
    assert.equal(permissions.administer, false);
  });

  it("refuses a User with no Membership in the Project", async () => {
    const { project } = await band(db, "outsider");
    const outsider = await verifiedUser(db, "outsider@example.com");

    await assert.rejects(getPermissions(db.pool, outsider, project.id), {
      name: "ServiceError",
      code: "not_found",
    });
  });
});

describe("custom Role CRUD", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("lets an Admin create a custom Role, listed alongside the built-in ones", async () => {
    const { owner, member, project } = await band(db, "create");

    const role = await createRole(db.pool, owner, project.id, {
      name: "  Roadie ",
      toggles: { ...NO_TOGGLES, editRepertoireSetlistsEvents: true },
    });

    assert.equal(role.name, "Roadie");
    assert.equal(role.kind, "custom");
    assert.deepEqual(role.toggles, { ...NO_TOGGLES, editRepertoireSetlistsEvents: true });
    const roles = await listRoles(db.pool, member, project.id);
    assert.deepEqual(
      roles.map((r) => [r.kind, r.name]),
      [
        ["admin", "Admin"],
        ["member", "Member"],
        ["custom", "Roadie"],
      ],
    );
    assert.deepEqual(roles[2], role);
  });

  it("refuses a blank or duplicate name, ignoring case", async () => {
    const { owner, project } = await band(db, "names");
    await createRole(db.pool, owner, project.id, { name: "Roadie", toggles: NO_TOGGLES });

    await assert.rejects(createRole(db.pool, owner, project.id, { name: " ", toggles: NO_TOGGLES }), {
      code: "invalid_input",
    });
    for (const name of ["Roadie", "ROADIE", "Admin", "admin", "mEmBeR"]) {
      await assert.rejects(createRole(db.pool, owner, project.id, { name, toggles: NO_TOGGLES }), {
        code: "name_taken",
      });
    }
  });

  it("refuses malformed input", async () => {
    const { owner, project } = await band(db, "malformed");
    const malformed = [
      { name: "Roadie" },
      { name: 42, toggles: NO_TOGGLES },
      { name: "Roadie", toggles: { ...NO_TOGGLES, removeMembers: "yes" } },
    ] as unknown as RoleInput[];

    for (const input of malformed) {
      await assert.rejects(createRole(db.pool, owner, project.id, input), {
        code: "invalid_input",
      });
    }
  });

  it("refuses a rename onto another Role's name in any case, but allows recasing its own", async () => {
    const { owner, project } = await band(db, "rename");
    await createRole(db.pool, owner, project.id, { name: "Crew", toggles: NO_TOGGLES });
    const role = await createRole(db.pool, owner, project.id, { name: "Roadie", toggles: NO_TOGGLES });

    for (const name of ["crew", "ADMIN"]) {
      await assert.rejects(
        updateRole(db.pool, owner, project.id, role.id, { name, toggles: NO_TOGGLES }),
        { code: "name_taken" },
      );
    }
    const recased = await updateRole(db.pool, owner, project.id, role.id, {
      name: "ROADIE",
      toggles: NO_TOGGLES,
    });
    assert.equal(recased.name, "ROADIE");
  });

  it("allows the same name in different Projects", async () => {
    const a = await band(db, "same-a");
    const b = await band(db, "same-b");

    await createRole(db.pool, a.owner, a.project.id, { name: "Roadie", toggles: NO_TOGGLES });
    await createRole(db.pool, b.owner, b.project.id, { name: "Roadie", toggles: NO_TOGGLES });
  });

  it("lets an Admin rename a custom Role and change its toggles", async () => {
    const { owner, project } = await band(db, "update");
    const role = await createRole(db.pool, owner, project.id, { name: "Roadie", toggles: NO_TOGGLES });

    const updated = await updateRole(db.pool, owner, project.id, role.id, {
      name: "Crew",
      toggles: ALL_TOGGLES,
    });

    assert.deepEqual(updated, { ...role, name: "Crew", toggles: ALL_TOGGLES });
    assert.deepEqual((await listRoles(db.pool, owner, project.id))[2], updated);
  });

  it("lets an Admin delete an unused custom Role", async () => {
    const { owner, project } = await band(db, "delete");
    const role = await createRole(db.pool, owner, project.id, { name: "Roadie", toggles: NO_TOGGLES });

    await deleteRole(db.pool, owner, project.id, role.id);

    const roles = await listRoles(db.pool, owner, project.id);
    assert.deepEqual(
      roles.map((r) => r.kind),
      ["admin", "member"],
    );
  });

  it("refuses to edit or delete the built-in Admin and Member Roles", async () => {
    const { owner, project } = await band(db, "builtin");

    for (const kind of ["admin", "member"] as const) {
      const role = await builtIn(db, owner, project, kind);
      await assert.rejects(
        updateRole(db.pool, owner, project.id, role.id, { name: "Boss", toggles: NO_TOGGLES }),
        { code: "built_in_role" },
      );
      await assert.rejects(deleteRole(db.pool, owner, project.id, role.id), {
        code: "built_in_role",
      });
    }
    assert.deepEqual(
      (await listRoles(db.pool, owner, project.id)).map((r) => r.name),
      ["Admin", "Member"],
    );
  });

  it("blocks deleting a Role a Member holds until they are reassigned", async () => {
    const { owner, member, project } = await band(db, "in-use");
    const role = await createRole(db.pool, owner, project.id, { name: "Roadie", toggles: NO_TOGGLES });
    await changeMemberRole(db.pool, owner, project.id, member.id, role.id);

    await assert.rejects(deleteRole(db.pool, owner, project.id, role.id), { code: "role_in_use" });

    await changeMemberRole(
      db.pool,
      owner,
      project.id,
      member.id,
      (await builtIn(db, owner, project, "member")).id,
    );
    await deleteRole(db.pool, owner, project.id, role.id);
  });

  it("blocks deleting a Role a pending Invitation offers until it is revoked", async () => {
    const { owner, project } = await band(db, "invited");
    const role = await createRole(db.pool, owner, project.id, { name: "Roadie", toggles: NO_TOGGLES });
    const invitationId = await invite(db, project, owner, role, "invited-roadie@example.com");

    await assert.rejects(deleteRole(db.pool, owner, project.id, role.id), { code: "role_in_use" });

    await db.pool.query("UPDATE invitations SET revoked_at = now() WHERE id = $1", [invitationId]);
    await deleteRole(db.pool, owner, project.id, role.id);
  });

  it("lets accepted and expired Invitations go without blocking a Role's deletion", async () => {
    const { owner, project } = await band(db, "past-invites");
    const role = await createRole(db.pool, owner, project.id, { name: "Roadie", toggles: NO_TOGGLES });
    const accepted = await invite(db, project, owner, role, "past-accepted@example.com");
    const expired = await invite(db, project, owner, role, "past-expired@example.com");
    await db.pool.query("UPDATE invitations SET accepted_at = now() WHERE id = $1", [accepted]);
    await db.pool.query("UPDATE invitations SET expires_at = now() WHERE id = $1", [expired]);

    await deleteRole(db.pool, owner, project.id, role.id);

    assert.deepEqual(
      (await listRoles(db.pool, owner, project.id)).map((r) => r.kind),
      ["admin", "member"],
    );
  });

  it("refuses Role changes from anyone but an Admin", async () => {
    const { owner, member, project } = await band(db, "forbidden");
    const crew = await verifiedUser(db, "forbidden-crew@example.com");
    const role = await createRole(db.pool, owner, project.id, { name: "Crew", toggles: ALL_TOGGLES });
    await addMember(db, project, crew, role);

    for (const actor of [member, crew]) {
      await assert.rejects(
        createRole(db.pool, actor, project.id, { name: "Mine", toggles: NO_TOGGLES }),
        { code: "forbidden" },
      );
      await assert.rejects(
        updateRole(db.pool, actor, project.id, role.id, { name: "Mine", toggles: NO_TOGGLES }),
        { code: "forbidden" },
      );
      await assert.rejects(deleteRole(db.pool, actor, project.id, role.id), { code: "forbidden" });
    }
    assert.deepEqual((await listRoles(db.pool, owner, project.id))[2], role);
  });

  it("refuses a Role from another Project", async () => {
    const a = await band(db, "cross-a");
    const b = await band(db, "cross-b");
    const other = await createRole(db.pool, b.owner, b.project.id, {
      name: "Roadie",
      toggles: NO_TOGGLES,
    });

    await assert.rejects(
      updateRole(db.pool, a.owner, a.project.id, other.id, { name: "Mine", toggles: NO_TOGGLES }),
      { code: "not_found" },
    );
    await assert.rejects(deleteRole(db.pool, a.owner, a.project.id, other.id), {
      code: "not_found",
    });
    await assert.rejects(changeMemberRole(db.pool, a.owner, a.project.id, a.member.id, other.id), {
      code: "not_found",
    });
  });

  it("refuses outsiders, even to list Roles", async () => {
    const { project } = await band(db, "list-outsider");
    const outsider = await verifiedUser(db, "list-outsider@example.com");

    await assert.rejects(listRoles(db.pool, outsider, project.id), { code: "not_found" });
    await assert.rejects(
      createRole(db.pool, outsider, project.id, { name: "Mine", toggles: NO_TOGGLES }),
      { code: "not_found" },
    );
  });
});

describe("changeMemberRole", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("takes effect immediately", async () => {
    const { owner, member, project } = await band(db, "immediate");
    const role = await createRole(db.pool, owner, project.id, {
      name: "Roadie",
      toggles: { ...NO_TOGGLES, removeMembers: true },
    });

    await changeMemberRole(db.pool, owner, project.id, member.id, role.id);
    assert.equal((await getPermissions(db.pool, member, project.id)).removeMembers, true);

    await changeMemberRole(
      db.pool,
      owner,
      project.id,
      member.id,
      (await builtIn(db, owner, project, "admin")).id,
    );
    assert.equal((await getPermissions(db.pool, member, project.id)).administer, true);
  });

  it("lets a custom Role's toggle edits reach its Members immediately", async () => {
    const { owner, member, project } = await band(db, "live-toggles");
    const role = await createRole(db.pool, owner, project.id, { name: "Roadie", toggles: NO_TOGGLES });
    await changeMemberRole(db.pool, owner, project.id, member.id, role.id);

    await updateRole(db.pool, owner, project.id, role.id, { name: "Roadie", toggles: ALL_TOGGLES });

    assert.equal((await getPermissions(db.pool, member, project.id)).seeTotalPayExpenses, true);
  });

  it("lets an Admin who isn't the Owner demote another Admin", async () => {
    const { owner, member, project } = await band(db, "demote");
    const other = await verifiedUser(db, "demote-other@example.com");
    const admin = await builtIn(db, owner, project, "admin");
    await changeMemberRole(db.pool, owner, project.id, member.id, admin.id);
    await addMember(db, project, other, admin);

    await changeMemberRole(
      db.pool,
      member,
      project.id,
      other.id,
      (await builtIn(db, owner, project, "member")).id,
    );

    assert.equal((await getPermissions(db.pool, other, project.id)).administer, false);
  });

  it("refuses anyone but an Admin, even a custom Role with every toggle", async () => {
    const { owner, member, project } = await band(db, "change-forbidden");
    const crew = await verifiedUser(db, "change-forbidden-crew@example.com");
    await addMember(
      db,
      project,
      crew,
      await createRole(db.pool, owner, project.id, { name: "Crew", toggles: ALL_TOGGLES }),
    );
    const admin = await builtIn(db, owner, project, "admin");

    for (const actor of [member, crew]) {
      await assert.rejects(changeMemberRole(db.pool, actor, project.id, actor.id, admin.id), {
        code: "forbidden",
      });
      assert.equal((await getPermissions(db.pool, actor, project.id)).administer, false);
    }
  });

  it("refuses to change the Owner's Role", async () => {
    const { owner, member, project } = await band(db, "owner");
    await changeMemberRole(
      db.pool,
      owner,
      project.id,
      member.id,
      (await builtIn(db, owner, project, "admin")).id,
    );
    const memberRole = await builtIn(db, owner, project, "member");

    for (const actor of [owner, member]) {
      await assert.rejects(changeMemberRole(db.pool, actor, project.id, owner.id, memberRole.id), {
        code: "owner_protected",
      });
    }
    assert.equal((await getPermissions(db.pool, owner, project.id)).administer, true);
  });

  it("refuses a User who isn't a Member", async () => {
    const { owner, project } = await band(db, "non-member");
    const outsider = await verifiedUser(db, "non-member-outsider@example.com");
    const memberRole = await builtIn(db, owner, project, "member");

    await assert.rejects(changeMemberRole(db.pool, owner, project.id, outsider.id, memberRole.id), {
      code: "not_found",
    });
  });
});
