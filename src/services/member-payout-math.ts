// The arithmetic of a per-Member Payout Split (ADR 0003), with no I/O: given an
// Event's net pay, each attending Member's rule and Ajuste, and its Guests,
// who gets what. Amounts are whole Guaraníes.

export type MemberRuleKind = "equal" | "fixed";

export interface MemberRule {
  kind: MemberRuleKind;
  // Whole Guaraníes for a fixed rule; 0 for an equal share.
  value: number;
}

// The rule everyone starts with.
export const EQUAL_SHARE: MemberRule = { kind: "equal", value: 0 };

export interface MemberPayoutInput {
  // Pay minus Expenses; may be negative.
  net: number;
  // Share of the net kept for the band before anything is split, in basis points. Defaults to 0.
  fundBasisPoints?: number;
  // Members who played, in a stable order, with the rule that applies to them and their signed Ajuste.
  attendees: { userId: string; rule: MemberRule; ajuste: number }[];
  // Hired substitutes, each paid a fixed amount.
  guests: { id: string; amount: number }[];
  // Gets what rounding leaves over: one of the attendees, or null.
  remainderRecipient: string | null;
}

export interface MemberPayoutResult {
  net: number;
  overAllocated: boolean;
  // Kept for the band off the net; 0 when over-allocated.
  fund: number;
  // How far the fund, fixed amounts and Ajustes exceed the net (or Expenses exceed pay, or a share would be negative); 0 when not over-allocated.
  shortfall: number;
  // Fixed amounts (Members and Guests) taken off the net first.
  fixedTotal: number;
  // The signed sum of the Ajustes, funded from (or returned to) the pot.
  adjustmentsTotal: number;
  // What the Equal-share Members divide.
  remainder: number;
  members: { userId: string; amount: number }[];
  guests: { id: string; amount: number }[];
  // Net that nobody receives (besides the fund): no Equal-share Member attended, or no one to take the rounding.
  unallocated: number;
}

export function computeMemberPayout(input: MemberPayoutInput): MemberPayoutResult {
  const { net, attendees, guests, remainderRecipient } = input;
  // Rounded down: the fund never takes more than its share.
  const fund = net > 0 ? Number((BigInt(net) * BigInt(input.fundBasisPoints ?? 0)) / BigInt(10_000)) : 0;
  const fixedTotal =
    attendees.reduce((sum, a) => sum + (a.rule.kind === "fixed" ? a.rule.value : 0), 0) +
    guests.reduce((sum, g) => sum + g.amount, 0);
  const adjustmentsTotal = attendees.reduce((sum, a) => sum + a.ajuste, 0);
  const equal = attendees.filter((a) => a.rule.kind === "equal");
  const remainder = net - fund - fixedTotal - adjustmentsTotal;
  const each = equal.length > 0 && remainder > 0 ? Math.floor(remainder / equal.length) : 0;

  const members = attendees.map((a) => ({
    userId: a.userId,
    amount: (a.rule.kind === "fixed" ? a.rule.value : each) + a.ajuste,
  }));
  // A negative Ajuste can take more than the share it adjusts; nobody is paid negatives.
  const negatives = members.reduce((sum, m) => sum + Math.max(0, -m.amount), 0);
  const shortfall = Math.max(0, -remainder) + negatives;
  const overAllocated = net < 0 || shortfall > 0;

  if (overAllocated) {
    return {
      net,
      overAllocated,
      fund: 0,
      shortfall: Math.max(shortfall, -net),
      fixedTotal,
      adjustmentsTotal,
      remainder: 0,
      members: members.map((m) => ({ ...m, amount: 0 })),
      guests: guests.map((g) => ({ id: g.id, amount: 0 })),
      unallocated: 0,
    };
  }

  // What doesn't divide evenly is rounding, and goes to one Equal-share Member.
  let unallocated = equal.length === 0 ? remainder : 0;
  const rounding = equal.length === 0 ? 0 : remainder - each * equal.length;
  const recipient = members.find((m) => m.userId === remainderRecipient);
  if (recipient && equal.some((a) => a.userId === recipient.userId)) recipient.amount += rounding;
  else unallocated += rounding;

  return {
    net,
    overAllocated,
    fund,
    shortfall: 0,
    fixedTotal,
    adjustmentsTotal,
    remainder,
    members,
    guests: guests.map((g) => ({ ...g })),
    unallocated,
  };
}
