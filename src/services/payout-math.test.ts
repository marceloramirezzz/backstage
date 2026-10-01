import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computePayout, type PayoutInput } from "./payout-math.ts";

// The worked example from the design handoff: Casamiento Ríos.
const BASE: PayoutInput = {
  net: 3_500_000,
  rules: [
    { roleId: "admin", kind: "percentage", value: 2500 },
    { roleId: "member", kind: "percentage", value: 7500 },
    { roleId: "roadie", kind: "member_fixed", value: 300_000 },
  ],
  attendees: [
    { userId: "diego", roleId: "admin" },
    { userId: "lucia", roleId: "member" },
    { userId: "rodrigo", roleId: "member" },
    { userId: "sofia", roleId: "roadie" },
  ],
  guests: [{ id: "nahuel", amount: 350_000 }],
  remainderRecipient: "diego",
};

const amounts = (r: ReturnType<typeof computePayout>) =>
  Object.fromEntries(r.members.map((m) => [m.userId, m.amount]));

describe("computePayout", () => {
  it("takes fixed amounts off the net first, then divides the rest by percentage", () => {
    const r = computePayout(BASE);
    assert.equal(r.overAllocated, false);
    assert.equal(r.fixedTotal, 650_000);
    assert.equal(r.remainder, 2_850_000);
    assert.deepEqual(amounts(r), {
      diego: 712_500,
      lucia: 1_068_750,
      rodrigo: 1_068_750,
      sofia: 300_000,
    });
    assert.deepEqual(r.guests, [{ id: "nahuel", amount: 350_000 }]);
    assert.equal(r.unallocated, 0);
  });

  it("shares a fixed amount for the Role equally among its attendees", () => {
    const r = computePayout({
      ...BASE,
      guests: [],
      rules: [
        { roleId: "admin", kind: "percentage", value: 10_000 },
        { roleId: "member", kind: "role_fixed", value: 600_000 },
      ],
    });
    assert.equal(amounts(r).lucia, 300_000);
    assert.equal(amounts(r).rodrigo, 300_000);
    assert.equal(amounts(r).diego, 3_500_000 - 600_000);
  });

  it("skips a Role nobody attended and redistributes its percentage proportionally", () => {
    const r = computePayout({
      ...BASE,
      guests: [],
      rules: [
        { roleId: "admin", kind: "percentage", value: 2500 },
        { roleId: "member", kind: "percentage", value: 5000 },
        { roleId: "ghost", kind: "percentage", value: 2500 },
      ],
      attendees: BASE.attendees.filter((a) => a.roleId !== "roadie"),
    });
    // 25 : 50 among the Roles present => 1/3 and 2/3 of the net.
    assert.equal(r.roles.find((x) => x.roleId === "ghost")?.skipped, true);
    assert.equal(amounts(r).diego + amounts(r).lucia + amounts(r).rodrigo, 3_500_000);
    assert.equal(amounts(r).lucia, 1_166_666);
    assert.equal(amounts(r).rodrigo, 1_166_666);
    // The 2 Gs. of rounding go to the designated recipient.
    assert.equal(amounts(r).diego, 1_166_668);
  });

  it("doesn't pay the fixed amount of a skipped Role", () => {
    const r = computePayout({
      ...BASE,
      guests: [],
      attendees: BASE.attendees.filter((a) => a.roleId !== "roadie"),
    });
    assert.equal(r.fixedTotal, 0);
    assert.equal(r.remainder, 3_500_000);
  });

  it("gives the rounding remainder to the designated recipient", () => {
    const r = computePayout({
      net: 1_000_000,
      rules: [{ roleId: "member", kind: "percentage", value: 10_000 }],
      attendees: [
        { userId: "a", roleId: "member" },
        { userId: "b", roleId: "member" },
        { userId: "c", roleId: "member" },
      ],
      guests: [],
      remainderRecipient: "c",
    });
    assert.deepEqual(amounts(r), { a: 333_333, b: 333_333, c: 333_334 });
    assert.equal(r.members.reduce((s, m) => s + m.amount, 0), 1_000_000);
  });

  it("flags over-allocation and pays nobody, never a negative", () => {
    const r = computePayout({ ...BASE, net: 500_000 });
    assert.equal(r.overAllocated, true);
    assert.equal(r.shortfall, 150_000);
    assert.equal(r.remainder, 0);
    assert.ok(r.members.every((m) => m.amount === 0));
    assert.ok(r.guests.every((g) => g.amount === 0));
    // The claims stay visible: Sofía's 300.000 is still what the Role is owed.
    assert.equal(r.roles.find((x) => x.roleId === "roadie")?.amount, 300_000);
  });

  it("flags an Event whose Expenses exceed its pay", () => {
    const r = computePayout({ ...BASE, net: -200_000, guests: [], rules: [BASE.rules[0]] });
    assert.equal(r.overAllocated, true);
    assert.equal(r.shortfall, 200_000);
    assert.ok(r.members.every((m) => m.amount === 0));
  });

  it("is not over-allocated when fixed amounts exactly use the net", () => {
    const r = computePayout({ ...BASE, net: 650_000 });
    assert.equal(r.overAllocated, false);
    assert.equal(r.remainder, 0);
    assert.equal(amounts(r).sofia, 300_000);
  });

  it("leaves the remainder unallocated when no percentage Role attended", () => {
    const r = computePayout({
      ...BASE,
      guests: [],
      rules: [{ roleId: "roadie", kind: "member_fixed", value: 300_000 }],
    });
    assert.equal(r.unallocated, 3_200_000);
  });

  it("pays nothing to Roles without a rule", () => {
    const r = computePayout({ ...BASE, rules: [BASE.rules[0]] });
    assert.equal(amounts(r).lucia, 0);
  });

  it("stays exact on amounts beyond float precision for the intermediate product", () => {
    const r = computePayout({
      net: 9_000_000_000_000,
      rules: [
        { roleId: "a", kind: "percentage", value: 3333 },
        { roleId: "b", kind: "percentage", value: 6667 },
      ],
      attendees: [
        { userId: "x", roleId: "a" },
        { userId: "y", roleId: "b" },
      ],
      guests: [],
      remainderRecipient: "x",
    });
    assert.equal(amounts(r).x + amounts(r).y, 9_000_000_000_000);
    assert.equal(amounts(r).y, 6_000_300_000_000);
  });
});
