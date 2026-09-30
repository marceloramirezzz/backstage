import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { memoryMailer } from "../../test/mailer.ts";
import { createTestDb, type TestDb } from "../../test/test-db.ts";
import { verifiedUser } from "../../test/users.ts";
import {
  acceptInvitation,
  getInvitationByToken,
  listInvitations,
  listMyInvitations,
  resendInvitation,
  revokeInvitation,
  sendInvitations,
} from "./invitations.ts";
import { getPermissions } from "./permissions.ts";
import { createProject, getProject } from "./projects.ts";
import { createRole, deleteRole, listRoles, type Role } from "./roles.ts";
import { signUp, type User } from "./accounts.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAfter = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);

async function builtIn(db: TestDb, owner: User, projectId: string, kind: Role["kind"]) {
  const role = (await listRoles(db.pool, owner, projectId)).find((r) => r.kind === kind);
  assert.ok(role);
  return role;
}

// Invites `email` with `role` and accepts, as a verified User.
async function join(db: TestDb, owner: User, projectId: string, role: Role, email: string) {
  const [{ invitation }] = await sendInvitations(db.pool, owner, projectId, [
    { email, roleId: role.id },
  ]);
  const user = await verifiedUser(db, email);
  await acceptInvitation(db.pool, user, invitation.id);
  return user;
}

// A Project with just its Owner.
async function band(db: TestDb, name: string) {
  const owner = await verifiedUser(db, `${name.replaceAll(" ", "-")}-owner@example.com`);
  const project = await createProject(db.pool, owner, { name });
  const memberRole = await builtIn(db, owner, project.id, "member");
  const adminRole = await builtIn(db, owner, project.id, "admin");
  return { owner, project, memberRole, adminRole };
}

describe("sendInvitations", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("is for Admins only", async () => {
    const { owner, project, memberRole, adminRole } = await band(db, "admins-only");
    const member = await join(db, owner, project.id, memberRole, "member@example.com");
    const admin = await join(db, owner, project.id, adminRole, "admin@example.com");
    const outsider = await verifiedUser(db, "outsider@example.com");
    const invite = [{ email: "new@example.com", roleId: memberRole.id }];

    await assert.rejects(sendInvitations(db.pool, member, project.id, invite), {
      code: "forbidden",
    });
    await assert.rejects(sendInvitations(db.pool, outsider, project.id, invite), {
      code: "not_found",
    });
    await sendInvitations(db.pool, admin, project.id, invite);
    assert.deepEqual(
      (await listInvitations(db.pool, owner, project.id)).map((i) => i.email),
      ["new@example.com"],
    );
  });

  it("invites several emails at once, each with a Role", async () => {
    const { owner, project, memberRole, adminRole } = await band(db, "several");

    const sent = await sendInvitations(db.pool, owner, project.id, [
      { email: "Drummer@Example.com ", roleId: memberRole.id },
      { email: "manager@example.com", roleId: adminRole.id },
    ]);

    assert.equal(sent.length, 2);
    assert.ok(sent.every((s) => s.token.length > 0));
    const listed = await listInvitations(db.pool, owner, project.id);
    assert.deepEqual(
      listed.map((i) => [i.email, i.roleName, i.expired]),
      [
        ["drummer@example.com", "Member", false],
        ["manager@example.com", "Admin", false],
      ],
    );
  });
});

describe("sendInvitations: who can be invited", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("allows only one pending Invitation per email per Project", async () => {
    const { owner, project, memberRole } = await band(db, "one-pending");
    const other = await band(db, "other-band");
    await sendInvitations(db.pool, owner, project.id, [
      { email: "twice@example.com", roleId: memberRole.id },
    ]);

    await assert.rejects(
      sendInvitations(db.pool, owner, project.id, [
        { email: "TWICE@example.com", roleId: memberRole.id },
      ]),
      { code: "already_invited" },
    );
    await sendInvitations(db.pool, other.owner, other.project.id, [
      { email: "twice@example.com", roleId: other.memberRole.id },
    ]);
  });

  it("refuses to invite an existing Member", async () => {
    const { owner, project, memberRole, adminRole } = await band(db, "existing");
    await join(db, owner, project.id, memberRole, "joined@example.com");

    for (const email of ["joined@example.com", "existing-owner@example.com"]) {
      await assert.rejects(
        sendInvitations(db.pool, owner, project.id, [{ email, roleId: adminRole.id }]),
        { code: "already_member" },
      );
    }
  });

  it("sends nothing when any email in the batch is refused", async () => {
    const { owner, project, memberRole } = await band(db, "all-or-nothing");
    await join(db, owner, project.id, memberRole, "in-band@example.com");

    await assert.rejects(
      sendInvitations(db.pool, owner, project.id, [
        { email: "fresh@example.com", roleId: memberRole.id },
        { email: "in-band@example.com", roleId: memberRole.id },
      ]),
      { code: "already_member" },
    );
    await assert.rejects(
      sendInvitations(db.pool, owner, project.id, [
        { email: "dup@example.com", roleId: memberRole.id },
        { email: "Dup@example.com", roleId: memberRole.id },
      ]),
      { code: "invalid_input" },
    );
    assert.deepEqual(await listInvitations(db.pool, owner, project.id), []);
  });

  it("replaces an expired Invitation with a new one", async () => {
    const { owner, project, memberRole, adminRole } = await band(db, "re-invite");
    const sentAt = new Date();
    await sendInvitations(
      db.pool,
      owner,
      project.id,
      [{ email: "again@example.com", roleId: memberRole.id }],
      sentAt,
    );
    const later = daysAfter(sentAt, 8);

    await sendInvitations(
      db.pool,
      owner,
      project.id,
      [{ email: "again@example.com", roleId: adminRole.id }],
      later,
    );

    const listed = await listInvitations(db.pool, owner, project.id, later);
    assert.deepEqual(
      listed.map((i) => [i.email, i.roleName, i.expired]),
      [["again@example.com", "Admin", false]],
    );
  });

  it("refuses a malformed email, a Role from another Project, or no emails", async () => {
    const { owner, project, memberRole } = await band(db, "bad-input");
    const other = await band(db, "bad-input-other");

    for (const email of ["", "no-at-sign", "two words@example.com", "@example.com", "a@"]) {
      await assert.rejects(
        sendInvitations(db.pool, owner, project.id, [{ email, roleId: memberRole.id }]),
        { code: "invalid_input" },
        email,
      );
    }
    for (const roleId of [other.memberRole.id, "not-a-uuid"]) {
      await assert.rejects(
        sendInvitations(db.pool, owner, project.id, [{ email: "x@example.com", roleId }]),
        { code: "not_found" },
      );
    }
    await assert.rejects(sendInvitations(db.pool, owner, project.id, []), {
      code: "invalid_input",
    });
  });
});

describe("acceptInvitation", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("makes the invitee a Member with the invited Role, via the emailed link", async () => {
    const { owner, project, memberRole } = await band(db, "accept");
    const [{ token }] = await sendInvitations(db.pool, owner, project.id, [
      { email: "singer@example.com", roleId: memberRole.id },
    ]);
    const singer = await verifiedUser(db, "singer@example.com");

    const landing = await getInvitationByToken(db.pool, token);
    assert.equal(landing.projectName, "accept");
    assert.equal(landing.roleName, "Member");
    assert.equal(landing.email, "singer@example.com");
    assert.equal(landing.invitedByName, owner.displayName);
    const joined = await acceptInvitation(db.pool, singer, landing.id);

    assert.deepEqual(joined, project);
    assert.deepEqual(await getProject(db.pool, singer, project.id), project);
    assert.equal((await getPermissions(db.pool, singer, project.id)).administer, false);
    assert.deepEqual(await listInvitations(db.pool, owner, project.id), []);
  });

  it("refuses a User who hasn't verified the invited email", async () => {
    const { owner, project, memberRole } = await band(db, "unverified");
    const [{ invitation }] = await sendInvitations(db.pool, owner, project.id, [
      { email: "bassist@example.com", roleId: memberRole.id },
    ]);
    const { user: bassist } = await signUp(db.pool, memoryMailer(), {
      email: "bassist@example.com",
      password: "a password",
      displayName: "Bassist",
    });

    await assert.rejects(acceptInvitation(db.pool, bassist, invitation.id), {
      code: "email_not_verified",
    });
    await assert.rejects(getProject(db.pool, bassist, project.id), { code: "not_found" });
  });

  it("refuses a User whose verified email isn't the invited one", async () => {
    const { owner, project, memberRole } = await band(db, "wrong-email");
    const [{ invitation }] = await sendInvitations(db.pool, owner, project.id, [
      { email: "keys@example.com", roleId: memberRole.id },
    ]);
    const intruder = await verifiedUser(db, "intruder@example.com");

    await assert.rejects(acceptInvitation(db.pool, intruder, invitation.id), {
      code: "forbidden",
    });
    await assert.rejects(getProject(db.pool, intruder, project.id), { code: "not_found" });
    assert.equal((await listInvitations(db.pool, owner, project.id)).length, 1);
  });

  it("reports an unknown or malformed Invitation as not found", async () => {
    const user = await verifiedUser(db, "nobody-invited@example.com");

    await assert.rejects(acceptInvitation(db.pool, user, "not-a-uuid"), { code: "not_found" });
    await assert.rejects(acceptInvitation(db.pool, user, crypto.randomUUID()), {
      code: "not_found",
    });
  });
});

describe("Invitation expiry", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("can be accepted until 7 days after sending", async () => {
    const { owner, project, memberRole } = await band(db, "in-time");
    const sentAt = new Date();
    const [{ invitation }] = await sendInvitations(
      db.pool,
      owner,
      project.id,
      [{ email: "late@example.com", roleId: memberRole.id }],
      sentAt,
    );
    const late = await verifiedUser(db, "late@example.com");

    const joined = await acceptInvitation(
      db.pool,
      late,
      invitation.id,
      new Date(daysAfter(sentAt, 7).getTime() - 1000),
    );

    assert.equal(joined.id, project.id);
  });

  it("can't be accepted or opened once 7 days have passed, and is listed as expired", async () => {
    const { owner, project, memberRole } = await band(db, "too-late");
    const sentAt = new Date();
    const [{ invitation, token }] = await sendInvitations(
      db.pool,
      owner,
      project.id,
      [{ email: "later@example.com", roleId: memberRole.id }],
      sentAt,
    );
    const later = await verifiedUser(db, "later@example.com");
    const expiredAt = daysAfter(sentAt, 7);

    await assert.rejects(acceptInvitation(db.pool, later, invitation.id, expiredAt), {
      code: "invitation_expired",
    });
    await assert.rejects(getInvitationByToken(db.pool, token, expiredAt), {
      code: "invitation_expired",
    });
    await assert.rejects(getProject(db.pool, later, project.id), { code: "not_found" });
    const [listed] = await listInvitations(db.pool, owner, project.id, expiredAt);
    assert.equal(listed.expired, true);
  });
});

describe("resendInvitation", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("sends a fresh link good for another 7 days; the old link stops working", async () => {
    const { owner, project, memberRole } = await band(db, "resend");
    const sentAt = new Date();
    const [first] = await sendInvitations(
      db.pool,
      owner,
      project.id,
      [{ email: "slow@example.com", roleId: memberRole.id }],
      sentAt,
    );
    const resentAt = daysAfter(sentAt, 10);

    const resent = await resendInvitation(db.pool, owner, project.id, first.invitation.id, resentAt);

    await assert.rejects(getInvitationByToken(db.pool, first.token, resentAt), {
      code: "invalid_token",
    });
    const landing = await getInvitationByToken(db.pool, resent.token, resentAt);
    assert.equal(landing.id, first.invitation.id);
    assert.equal(resent.invitation.expired, false);
    const slow = await verifiedUser(db, "slow@example.com");
    const joined = await acceptInvitation(
      db.pool,
      slow,
      landing.id,
      new Date(daysAfter(resentAt, 7).getTime() - 1000),
    );
    assert.equal(joined.id, project.id);
  });

  it("is for Admins only, and only for open Invitations", async () => {
    const { owner, project, memberRole } = await band(db, "resend-rules");
    const member = await join(db, owner, project.id, memberRole, "resend-member@example.com");
    const [{ invitation }] = await sendInvitations(db.pool, owner, project.id, [
      { email: "resend-me@example.com", roleId: memberRole.id },
    ]);

    await assert.rejects(resendInvitation(db.pool, member, project.id, invitation.id), {
      code: "forbidden",
    });
    await revokeInvitation(db.pool, owner, project.id, invitation.id);
    await assert.rejects(resendInvitation(db.pool, owner, project.id, invitation.id), {
      code: "not_found",
    });
    const accepted = await sendInvitations(db.pool, owner, project.id, [
      { email: "accepted@example.com", roleId: memberRole.id },
    ]);
    await acceptInvitation(
      db.pool,
      await verifiedUser(db, "accepted@example.com"),
      accepted[0].invitation.id,
    );
    for (const id of [accepted[0].invitation.id, "not-a-uuid"]) {
      await assert.rejects(resendInvitation(db.pool, owner, project.id, id), {
        code: "not_found",
      });
    }
  });

  it("refuses an expired Invitation whose Role has since been deleted", async () => {
    const { owner, project } = await band(db, "resend-deleted-role");
    const roadie = await createRole(db.pool, owner, project.id, {
      name: "Roadie",
      toggles: { editRepertoireSetlistsEvents: false, removeMembers: false, seeTotalPayExpenses: false },
    });
    const sentAt = new Date(Date.now() - 8 * DAY_MS);
    const [{ invitation }] = await sendInvitations(
      db.pool,
      owner,
      project.id,
      [{ email: "roadie@example.com", roleId: roadie.id }],
      sentAt,
    );
    await deleteRole(db.pool, owner, project.id, roadie.id);

    await assert.rejects(resendInvitation(db.pool, owner, project.id, invitation.id), {
      code: "not_found",
    });
  });
});

describe("revokeInvitation", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("withdraws the Invitation, so it can't be accepted and the email can be invited again", async () => {
    const { owner, project, memberRole } = await band(db, "revoke");
    const [{ invitation, token }] = await sendInvitations(db.pool, owner, project.id, [
      { email: "gone@example.com", roleId: memberRole.id },
    ]);
    const gone = await verifiedUser(db, "gone@example.com");

    await revokeInvitation(db.pool, owner, project.id, invitation.id);

    assert.deepEqual(await listInvitations(db.pool, owner, project.id), []);
    await assert.rejects(acceptInvitation(db.pool, gone, invitation.id), { code: "not_found" });
    await assert.rejects(getInvitationByToken(db.pool, token), { code: "invalid_token" });
    await sendInvitations(db.pool, owner, project.id, [
      { email: "gone@example.com", roleId: memberRole.id },
    ]);
  });

  it("is for Admins only, and only for open Invitations of that Project", async () => {
    const { owner, project, memberRole } = await band(db, "revoke-rules");
    const other = await band(db, "revoke-other");
    const member = await join(db, owner, project.id, memberRole, "revoke-member@example.com");
    const [{ invitation }] = await sendInvitations(db.pool, owner, project.id, [
      { email: "keep@example.com", roleId: memberRole.id },
    ]);

    await assert.rejects(revokeInvitation(db.pool, member, project.id, invitation.id), {
      code: "forbidden",
    });
    await assert.rejects(
      revokeInvitation(db.pool, other.owner, other.project.id, invitation.id),
      { code: "not_found" },
    );
    assert.equal((await listInvitations(db.pool, owner, project.id)).length, 1);
    await revokeInvitation(db.pool, owner, project.id, invitation.id);
    await assert.rejects(revokeInvitation(db.pool, owner, project.id, invitation.id), {
      code: "not_found",
    });
  });
});

describe("listMyInvitations", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("shows a User the pending Invitations addressed to their verified email", async () => {
    const rock = await band(db, "Rock band");
    const cumbia = await band(db, "Cumbia band");
    const jazz = await band(db, "Jazz band");
    const gone = await band(db, "Gone band");
    const old = await band(db, "Old band");
    const email = "popular@example.com";
    await sendInvitations(db.pool, rock.owner, rock.project.id, [
      { email, roleId: rock.adminRole.id },
    ]);
    await sendInvitations(db.pool, cumbia.owner, cumbia.project.id, [
      { email: "Popular@Example.com", roleId: cumbia.memberRole.id },
      { email: "someone-else@example.com", roleId: cumbia.memberRole.id },
    ]);
    const [revoked] = await sendInvitations(db.pool, gone.owner, gone.project.id, [
      { email, roleId: gone.memberRole.id },
    ]);
    await revokeInvitation(db.pool, gone.owner, gone.project.id, revoked.invitation.id);
    await sendInvitations(
      db.pool,
      old.owner,
      old.project.id,
      [{ email, roleId: old.memberRole.id }],
      new Date(Date.now() - 8 * DAY_MS),
    );
    const [accepted] = await sendInvitations(db.pool, jazz.owner, jazz.project.id, [
      { email, roleId: jazz.memberRole.id },
    ]);
    const popular = await verifiedUser(db, email);
    await acceptInvitation(db.pool, popular, accepted.invitation.id);

    const mine = await listMyInvitations(db.pool, popular);

    assert.deepEqual(
      mine.map((i) => [i.projectName, i.roleName, i.invitedByName]),
      [
        ["Cumbia band", "Member", cumbia.owner.displayName],
        ["Rock band", "Admin", rock.owner.displayName],
      ],
    );
  });

  it("shows nothing until the User has verified their email", async () => {
    const { owner, project, memberRole } = await band(db, "Waiting band");
    await sendInvitations(db.pool, owner, project.id, [
      { email: "pending@example.com", roleId: memberRole.id },
    ]);
    const { user } = await signUp(db.pool, memoryMailer(), {
      email: "pending@example.com",
      password: "a password",
      displayName: "Pending",
    });

    assert.deepEqual(await listMyInvitations(db.pool, user), []);
  });
});
