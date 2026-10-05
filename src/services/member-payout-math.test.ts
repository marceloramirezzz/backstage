import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeMemberPayout, type MemberPayoutInput } from "./member-payout-math.ts";

const EQUAL = { kind: "equal", value: 0 } as const;
const fixed = (value: number) => ({ kind: "fixed", value }) as const;

const BASE: MemberPayoutInput = {
  net: 3_500_000,
  attendees: [
    { userId: "diego", rule: EQUAL, ajuste: 0 },
    { userId: "lucia", rule: EQUAL, ajuste: 0 },
    { userId: "rodrigo", rule: EQUAL, ajuste: 0 },
    { userId: "sofia", rule: fixed(300_000), ajuste: 0 },
  ],
  guests: [{ id: "nahuel", amount: 350_000 }],
  remainderRecipient: "diego",
};

const amounts = (r: ReturnType<typeof computeMemberPayout>) =>
  Object.fromEntries(r.members.map((m) => [m.userId, m.amount]));

describe("computeMemberPayout", () => {
  it("gives everyone an equal share of the net when nothing is configured", () => {
    const r = computeMemberPayout({
      ...BASE,
      attendees: BASE.attendees.map((a) => ({ ...a, rule: EQUAL })),
      guests: [],
    });
    assert.equal(r.overAllocated, false);
    assert.equal(r.remainder, 3_500_000);
    assert.deepEqual(amounts(r), { diego: 875_000, lucia: 875_000, rodrigo: 875_000, sofia: 875_000 });
  });

  it("takes fixed amounts and Guests off first, then divides the rest equally", () => {
    const r = computeMemberPayout(BASE);
    assert.equal(r.fixedTotal, 650_000);
    assert.equal(r.remainder, 2_850_000);
    assert.deepEqual(amounts(r), { diego: 950_000, lucia: 950_000, rodrigo: 950_000, sofia: 300_000 });
    assert.deepEqual(r.guests, [{ id: "nahuel", amount: 350_000 }]);
    assert.equal(r.unallocated, 0);
  });

  it("sets the band fund aside before anything else", () => {
    const r = computeMemberPayout({ ...BASE, fundBasisPoints: 1000 });
    assert.equal(r.fund, 350_000);
    assert.equal(r.remainder, 2_500_000);
    assert.equal(amounts(r).lucia, 833_333);
    // The rounding goes to the recipient.
    assert.equal(amounts(r).diego, 833_334);
    assert.equal(r.unallocated, 0);
  });

  it("adds a signed Ajuste to a share, funded from the pot", () => {
    const r = computeMemberPayout({
      ...BASE,
      attendees: [
        { userId: "diego", rule: EQUAL, ajuste: 100_000 },
        { userId: "lucia", rule: EQUAL, ajuste: -50_000 },
        { userId: "sofia", rule: fixed(300_000), ajuste: 20_000 },
      ],
    });
    assert.equal(r.adjustmentsTotal, 70_000);
    // 3.500.000 − 350.000 guest − 300.000 fixed − 70.000 ajustes = 2.780.000 over two.
    assert.equal(r.remainder, 2_780_000);
    assert.deepEqual(amounts(r), { diego: 1_490_000, lucia: 1_340_000, sofia: 320_000 });
  });

  it("flags over-allocation and pays nothing", () => {
    const r = computeMemberPayout({
      ...BASE,
      net: 500_000,
      attendees: [
        { userId: "diego", rule: EQUAL, ajuste: 0 },
        { userId: "sofia", rule: fixed(300_000), ajuste: 0 },
      ],
    });
    assert.equal(r.overAllocated, true);
    assert.equal(r.shortfall, 150_000);
    assert.equal(r.fund, 0);
    assert.deepEqual(amounts(r), { diego: 0, sofia: 0 });
    assert.deepEqual(r.guests, [{ id: "nahuel", amount: 0 }]);
  });

  it("flags a negative net, and an Ajuste that would make a share negative", () => {
    assert.equal(computeMemberPayout({ ...BASE, net: -10 }).overAllocated, true);
    const r = computeMemberPayout({
      net: 1_000_000,
      attendees: [
        { userId: "diego", rule: EQUAL, ajuste: -600_000 },
        { userId: "lucia", rule: EQUAL, ajuste: 0 },
      ],
      guests: [],
      remainderRecipient: "diego",
    });
    // Pot 1.600.000 / 2 = 800.000 each; Diego −600.000 is fine.
    assert.equal(r.overAllocated, false);
    assert.deepEqual(amounts(r), { diego: 200_000, lucia: 800_000 + 0 });
    const bad = computeMemberPayout({
      net: 100_000,
      attendees: [
        { userId: "diego", rule: EQUAL, ajuste: -500_000 },
        { userId: "lucia", rule: EQUAL, ajuste: 0 },
      ],
      guests: [],
      remainderRecipient: "diego",
    });
    assert.equal(bad.overAllocated, true);
    assert.deepEqual(amounts(bad), { diego: 0, lucia: 0 });
  });

  it("leaves the remainder unallocated when nobody is on Equal share", () => {
    const r = computeMemberPayout({
      ...BASE,
      attendees: [{ userId: "sofia", rule: fixed(300_000), ajuste: 0 }],
    });
    assert.equal(r.unallocated, 2_850_000);
    assert.deepEqual(amounts(r), { sofia: 300_000 });
  });

  it("gives rounding only to an Equal-share recipient", () => {
    const r = computeMemberPayout({
      net: 1_000_000,
      attendees: [
        { userId: "sofia", rule: fixed(1), ajuste: 0 },
        { userId: "a", rule: EQUAL, ajuste: 0 },
        { userId: "b", rule: EQUAL, ajuste: 0 },
      ],
      guests: [],
      remainderRecipient: "sofia",
    });
    assert.equal(r.unallocated, 1);
    assert.equal(amounts(r).sofia, 1);
  });
});
