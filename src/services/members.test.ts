import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createTestDb, type TestDb } from "../../test/test-db.ts";
import { verifiedUser } from "../../test/users.ts";
import type { User } from "./accounts.ts";
import { acceptInvitation, sendInvitations } from "./invitations.ts";
import {
  deleteProject,
  leaveProject,
  listMembers,
  removeMember,
  transferOwnership,
} from "./members.ts";
import { createProject, getProject, listProjects, type Project } from "./projects.ts";
import {
  changeMemberRole,
  createRole,
  listRoles,
  type Role,
  type RoleToggles,
} from "./roles.ts";

const NO_TOGGLES: RoleToggles = {
  editRepertoireSetlistsEvents: false,
  removeMembers: false,
  seeTotalPayExpenses: false,
  manageBookings: false,
};

async function roleOf(db: TestDb, owner: User, project: Project, kind: Role["kind"]) {
  const role = (await listRoles(db.pool, owner, project.id)).find((r) => r.kind === kind);
  assert.ok(role);
  return role;
}

async function join(db: TestDb, owner: User, project: Project, user: User, role: Role) {
  const [{ invitation }] = await sendInvitations(db.pool, owner, project.id, [
    { email: user.email, roleId: role.id },
  ]);
  await acceptInvitation(db.pool, user, invitation.id);
}

// A Project with its Owner, a second Admin, a plain Member, and a Member whose
// custom Role may remove Members.
async function band(db: TestDb, name: string) {
  const slug = name.toLowerCase().replaceAll(" ", "-");
  const owner = await verifiedUser(db, `${slug}-owner@example.com`);
  const admin = await verifiedUser(db, `${slug}-admin@example.com`);
  const member = await verifiedUser(db, `${slug}-member@example.com`);
  const other = await verifiedUser(db, `${slug}-other@example.com`);
  const remover = await verifiedUser(db, `${slug}-remover@example.com`);
  const project = await createProject(db.pool, owner, { name });
  const removerRole = await createRole(db.pool, owner, project.id, {
    name: "Roadie",
    toggles: { ...NO_TOGGLES, removeMembers: true },
  });
  await join(db, owner, project, admin, await roleOf(db, owner, project, "admin"));
  await join(db, owner, project, member, await roleOf(db, owner, project, "member"));
  await join(db, owner, project, other, await roleOf(db, owner, project, "member"));
  await join(db, owner, project, remover, removerRole);
  return { owner, admin, member, other, remover, project };
}

const isMember = async (db: TestDb, user: User, project: Project) =>
  (await listProjects(db.pool, user)).some((p) => p.id === project.id);

describe("listMembers", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("shows every Member to any Member with display name, Role and who owns the Project", async () => {
    const { owner, member, project } = await band(db, "list");

    const members = await listMembers(db.pool, member, project.id);

    assert.deepEqual(
      members.map((m) => [m.displayName, m.roleKind, m.roleName, m.isOwner]),
      [
        ["list-owner@example.com", "admin", "Admin", true],
        ["list-admin@example.com", "admin", "Admin", false],
        ["list-member@example.com", "member", "Member", false],
        ["list-other@example.com", "member", "Member", false],
        ["list-remover@example.com", "custom", "Roadie", false],
      ],
    );
    assert.equal(members[0].userId, owner.id);
    assert.equal(members[0].roleId, (await roleOf(db, owner, project, "admin")).id);
  });

  it("refuses someone who isn't a Member", async () => {
    const { project } = await band(db, "list-outsider");
    const outsider = await verifiedUser(db, "list-outsider@example.com");

    await assert.rejects(listMembers(db.pool, outsider, project.id), { code: "not_found" });
  });
});

describe("removeMember", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("lets an Admin remove a non-Admin", async () => {
    const { admin, member, project } = await band(db, "admin-removes");

    await removeMember(db.pool, admin, project.id, member.id);

    assert.equal(await isMember(db, member, project), false);
  });

  it("lets a custom Role with remove-members remove a non-Admin", async () => {
    const { remover, member, project } = await band(db, "perm-removes");

    await removeMember(db.pool, remover, project.id, member.id);

    assert.equal(await isMember(db, member, project), false);
  });

  it("refuses a Member without the permission", async () => {
    const { member, other, project } = await band(db, "no-perm");

    await assert.rejects(removeMember(db.pool, member, project.id, other.id), {
      code: "forbidden",
    });
    assert.equal(await isMember(db, other, project), true);
  });

  it("lets only an Admin remove an Admin", async () => {
    const { owner, admin, remover, project } = await band(db, "admin-target");
    const second = await verifiedUser(db, "admin-target-second@example.com");
    await join(db, owner, project, second, await roleOf(db, owner, project, "admin"));

    await assert.rejects(removeMember(db.pool, remover, project.id, admin.id), {
      code: "forbidden",
    });
    assert.equal(await isMember(db, admin, project), true);

    await removeMember(db.pool, second, project.id, admin.id);
    assert.equal(await isMember(db, admin, project), false);
  });

  it("never lets anyone remove the Owner, not even the Owner", async () => {
    const { owner, admin, remover, project } = await band(db, "owner-target");

    for (const actor of [admin, remover, owner]) {
      await assert.rejects(removeMember(db.pool, actor, project.id, owner.id), {
        code: "owner_protected",
      });
    }
    assert.equal(await isMember(db, owner, project), true);
  });

  it("reports a missing Member as not found", async () => {
    const { admin, project } = await band(db, "missing");
    const stranger = await verifiedUser(db, "missing-stranger@example.com");

    await assert.rejects(removeMember(db.pool, admin, project.id, stranger.id), {
      code: "not_found",
    });
    await assert.rejects(removeMember(db.pool, admin, project.id, "nope"), { code: "not_found" });
  });

  it("refuses someone who isn't a Member of the Project", async () => {
    const { member, project } = await band(db, "outsider-removes");
    const outsider = await verifiedUser(db, "outsider-removes@example.com");

    await assert.rejects(removeMember(db.pool, outsider, project.id, member.id), {
      code: "not_found",
    });
  });

  it("lets the removed Member be invited back", async () => {
    const { owner, admin, member, project } = await band(db, "reinvite");
    await removeMember(db.pool, admin, project.id, member.id);

    await join(db, owner, project, member, await roleOf(db, owner, project, "member"));

    assert.equal(await isMember(db, member, project), true);
  });
});

describe("demoting an Admin", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("is limited to Admins, and never the Owner", async () => {
    const { owner, admin, remover, project } = await band(db, "demote");
    const memberRole = await roleOf(db, owner, project, "member");

    await assert.rejects(changeMemberRole(db.pool, remover, project.id, admin.id, memberRole.id), {
      code: "forbidden",
    });
    await assert.rejects(changeMemberRole(db.pool, admin, project.id, owner.id, memberRole.id), {
      code: "owner_protected",
    });
    await changeMemberRole(db.pool, owner, project.id, admin.id, memberRole.id);
  });
});

describe("leaveProject", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("lets any Member leave", async () => {
    const { admin, member, project } = await band(db, "leave");

    await leaveProject(db.pool, member, project.id);
    await leaveProject(db.pool, admin, project.id);

    assert.equal(await isMember(db, member, project), false);
    assert.equal(await isMember(db, admin, project), false);
  });

  it("keeps the Owner until they transfer ownership", async () => {
    const { owner, admin, project } = await band(db, "owner-leaves");

    await assert.rejects(leaveProject(db.pool, owner, project.id), { code: "owner_protected" });
    assert.equal(await isMember(db, owner, project), true);

    await transferOwnership(db.pool, owner, project.id, admin.id);
    await leaveProject(db.pool, owner, project.id);

    assert.equal(await isMember(db, owner, project), false);
    assert.equal((await getProject(db.pool, admin, project.id)).ownerId, admin.id);
  });

  it("refuses someone who isn't a Member", async () => {
    const { project } = await band(db, "leave-outsider");
    const outsider = await verifiedUser(db, "leave-outsider@example.com");

    await assert.rejects(leaveProject(db.pool, outsider, project.id), { code: "not_found" });
  });
});

describe("transferOwnership", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("hands the Project to another Admin, who becomes protected", async () => {
    const { owner, admin, project } = await band(db, "transfer");

    await transferOwnership(db.pool, owner, project.id, admin.id);

    assert.equal((await getProject(db.pool, owner, project.id)).ownerId, admin.id);
    const members = await listMembers(db.pool, owner, project.id);
    assert.deepEqual(
      members.filter((m) => m.isOwner).map((m) => m.userId),
      [admin.id],
    );
    // The new Owner is protected; the old one is just an Admin now.
    await assert.rejects(removeMember(db.pool, owner, project.id, admin.id), {
      code: "owner_protected",
    });
    await removeMember(db.pool, admin, project.id, owner.id);
  });

  it("is the Owner's alone, even for another Admin", async () => {
    const { admin, remover, project } = await band(db, "transfer-forbidden");

    await assert.rejects(transferOwnership(db.pool, admin, project.id, admin.id), {
      code: "forbidden",
    });
    await assert.rejects(transferOwnership(db.pool, remover, project.id, admin.id), {
      code: "forbidden",
    });
    assert.notEqual((await getProject(db.pool, admin, project.id)).ownerId, admin.id);
  });

  it("only goes to another Admin of the Project", async () => {
    const { owner, member, remover, project } = await band(db, "transfer-target");
    const stranger = await verifiedUser(db, "transfer-target-stranger@example.com");

    for (const target of [owner, member, remover]) {
      await assert.rejects(transferOwnership(db.pool, owner, project.id, target.id), {
        code: "invalid_input",
      });
    }
    await assert.rejects(transferOwnership(db.pool, owner, project.id, stranger.id), {
      code: "not_found",
    });
    assert.equal((await getProject(db.pool, owner, project.id)).ownerId, owner.id);
  });
});

describe("deleteProject", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("lets the Owner delete the Project by typing its name, taking everything with it", async () => {
    const { owner, member, project } = await band(db, "Delete Me");
    await sendInvitations(db.pool, owner, project.id, [
      { email: "pending@example.com", roleId: (await roleOf(db, owner, project, "member")).id },
    ]);
    await db.pool.query(
      `INSERT INTO songs (project_id, name, duration_seconds, intensity)
       VALUES ($1, 'Song', 180, 'calm')`,
      [project.id],
    );

    await deleteProject(db.pool, owner, project.id, "Delete Me");

    assert.deepEqual(await listProjects(db.pool, owner), []);
    assert.deepEqual(await listProjects(db.pool, member), []);
    const { rows } = await db.pool.query("SELECT 1 FROM roles WHERE project_id = $1", [project.id]);
    assert.equal(rows.length, 0);
  });

  it("refuses a name that doesn't match", async () => {
    const { owner, project } = await band(db, "Keep Me");

    for (const typed of ["", "keep me", "Keep"]) {
      await assert.rejects(deleteProject(db.pool, owner, project.id, typed), {
        code: "invalid_input",
      });
    }
    assert.equal(await isMember(db, owner, project), true);
  });

  it("is the Owner's alone, even for another Admin", async () => {
    const { admin, member, project } = await band(db, "Not Yours");

    await assert.rejects(deleteProject(db.pool, admin, project.id, "Not Yours"), {
      code: "forbidden",
    });
    await assert.rejects(deleteProject(db.pool, member, project.id, "Not Yours"), {
      code: "forbidden",
    });
    assert.equal(await isMember(db, admin, project), true);
  });

  it("reports a Project the User doesn't belong to as not found", async () => {
    const { project } = await band(db, "Hidden");
    const outsider = await verifiedUser(db, "hidden-outsider@example.com");

    await assert.rejects(deleteProject(db.pool, outsider, project.id, "Hidden"), {
      code: "not_found",
    });
  });
});
