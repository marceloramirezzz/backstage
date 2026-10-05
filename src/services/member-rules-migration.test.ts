import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import pg from "pg";
import { migrate } from "../db/migrate.ts";
import { createTestDb, type TestDb } from "../../test/test-db.ts";
import { verifiedUser } from "../../test/users.ts";
import { createEvent } from "./events.ts";
import { acceptInvitation, sendInvitations } from "./invitations.ts";
import { createProject } from "./projects.ts";
import { createRole, listRoles } from "./roles.ts";
import { getEventMemberRules, getEventPayout, getMemberRules, type FullPayout } from "./splits.ts";

// A frozen Paid Event as written before per-Member rules: Role-based.
const legacyPayload = (userId: string) => ({
  payout: {
    scope: "full",
    frozenAt: null,
    source: "default",
    rules: [],
    pay: 1_000_000,
    expensesTotal: 0,
    net: 1_000_000,
    result: {
      net: 1_000_000,
      overAllocated: false,
      fund: 0,
      shortfall: 0,
      fixedTotal: 0,
      remainder: 1_000_000,
      roles: [],
      members: [{ userId, roleId: "r", amount: 1_000_000 }],
      guests: [],
      unallocated: 0,
    },
    roles: [],
    guests: [],
    remainderRecipient: userId,
  },
  attendance: [],
});

describe("migration 022: per-Member payout rules", () => {
  let db: TestDb;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it("converts Role rules, leaves Paid snapshots untouched and keeps them readable", async () => {
    const owner = await verifiedUser(db, "mig-diego@example.com");
    const project = await createProject(db.pool, owner, { name: "mig" });
    const roles = await listRoles(db.pool, owner, project.id);
    const memberRole = roles.find((r) => r.kind === "member")!;
    const toggles = { editRepertoireSetlistsEvents: false, removeMembers: false, seeTotalPayExpenses: false, manageBookings: false };
    const roadie = await createRole(db.pool, owner, project.id, { name: "Roadie", toggles });
    const pooled = await createRole(db.pool, owner, project.id, { name: "Sonido", toggles });
    const hire = async (who: string, roleId: string) => {
      const user = await verifiedUser(db, `mig-${who}@example.com`);
      const [{ invitation }] = await sendInvitations(db.pool, owner, project.id, [{ email: user.email, roleId }]);
      await acceptInvitation(db.pool, user, invitation.id);
      return user;
    };
    const lucia = await hire("lucia", memberRole.id);
    const sofia = await hire("sofia", roadie.id);
    const tomas = await hire("tomas", pooled.id);
    const live = await createEvent(db.pool, owner, project.id, { name: "Live", date: "2026-09-26", durationMinutes: 60, pay: 1_000_000 });
    const paid = await createEvent(db.pool, owner, project.id, { name: "Paid", date: "2026-09-27", durationMinutes: 60, pay: 1_000_000, status: "paid" });

    // Go back to the schema before 022 and write Role-based rules the old way.
    await db.pool.query(`
      DROP TABLE member_split_defaults, event_member_settings;
      DROP TYPE member_rule_kind;
      DELETE FROM schema_migrations WHERE filename LIKE '022%'`);
    const pid = project.id;
    await db.pool.query(
      `INSERT INTO project_split_rules (project_id, role_id, kind, value) VALUES
         ($1, $2, 'member_fixed', 300000), ($1, $3, 'role_fixed', 500000), ($1, $4, 'percentage', 10000)`,
      [pid, roadie.id, pooled.id, memberRole.id],
    );
    await db.pool.query("INSERT INTO event_splits (event_id, project_id) VALUES ($1, $2)", [live.id, pid]);
    await db.pool.query(
      `INSERT INTO event_split_rules (event_id, project_id, role_id, kind, value) VALUES
         ($1, $2, $3, 'member_fixed', 200000), ($1, $2, $4, 'percentage', 10000)`,
      [live.id, pid, roadie.id, memberRole.id],
    );
    await db.pool.query("DELETE FROM event_payout_snapshots WHERE event_id = $1", [paid.id]);
    await db.pool.query("INSERT INTO event_payout_snapshots (event_id, payload) VALUES ($1, $2)", [
      paid.id,
      JSON.stringify(legacyPayload(lucia.id)),
    ]);
    const before = await db.pool.query("SELECT event_id, payload::text, taken_at FROM event_payout_snapshots ORDER BY event_id");

    const client = new pg.Client({ connectionString: db.pool.options.connectionString });
    await client.connect();
    try {
      await migrate(client, () => {});
    } finally {
      await client.end();
    }

    const defaults = Object.fromEntries((await getMemberRules(db.pool, owner, pid)).map((r) => [r.userId, r.rule]));
    assert.deepEqual(defaults[sofia.id], { kind: "fixed", value: 300_000 });
    // A role_fixed pool, a percentage and no rule at all are all Equal share.
    for (const who of [tomas, lucia, owner]) assert.deepEqual(defaults[who.id], { kind: "equal", value: 0 });

    const overrides = Object.fromEntries(
      (await getEventMemberRules(db.pool, owner, pid, live.id)).map((r) => [r.userId, r.override]),
    );
    assert.deepEqual(overrides[sofia.id], { kind: "fixed", value: 200_000 });
    assert.deepEqual(overrides[lucia.id], { kind: "equal", value: 0 });
    const untouched = await getEventMemberRules(db.pool, owner, pid, paid.id);
    assert.ok(untouched.every((r) => r.override === null));

    const after = await db.pool.query("SELECT event_id, payload::text, taken_at FROM event_payout_snapshots ORDER BY event_id");
    assert.deepEqual(after.rows, before.rows);

    // The old snapshot still reads, to Admins and to the Member it paid.
    const asAdmin = (await getEventPayout(db.pool, owner, pid, paid.id)) as FullPayout;
    assert.equal(asAdmin.scope, "full");
    assert.equal(asAdmin.result.members[0].amount, 1_000_000);
    const own = await getEventPayout(db.pool, lucia, pid, paid.id);
    assert.equal(own.scope === "own" && own.amount, 1_000_000);
  });
});
