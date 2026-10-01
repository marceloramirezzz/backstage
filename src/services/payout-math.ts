// The arithmetic of a Payout Split, with no I/O: given an Event's net pay, its
// Split rules and who attended, who gets what. Amounts are whole Guaraníes;
// percentages are basis points (hundredths of a percent, 10 000 = 100%).

export type SplitKind = "percentage" | "role_fixed" | "member_fixed";

export interface SplitRule {
  roleId: string;
  kind: SplitKind;
  // Basis points for a percentage, whole Guaraníes for the fixed kinds.
  value: number;
}

export interface PayoutInput {
  // Pay minus Expenses; may be negative.
  net: number;
  rules: SplitRule[];
  // Members who played, in a stable order.
  attendees: { userId: string; roleId: string }[];
  // Hired substitutes, each paid a fixed amount.
  guests: { id: string; amount: number }[];
  // Gets what rounding leaves over: one of the attendees, or null.
  remainderRecipient: string | null;
}

export interface RolePayout {
  roleId: string;
  kind: SplitKind;
  value: number;
  attendeeIds: string[];
  // Nobody attended: nothing paid, any percentage shared out.
  skipped: boolean;
  // What the Role's attendees receive in all.
  amount: number;
}

export interface PayoutResult {
  net: number;
  overAllocated: boolean;
  // How far the fixed amounts exceed the net (or Expenses exceed pay); 0 when not over-allocated.
  shortfall: number;
  // Fixed amounts (Roles and Guests) taken off the net first.
  fixedTotal: number;
  // What the percentages divide.
  remainder: number;
  roles: RolePayout[];
  members: { userId: string; roleId: string; amount: number }[];
  guests: { id: string; amount: number }[];
  // Net that nobody receives: no percentage Role attended, or no one to take the rounding.
  unallocated: number;
}

export function computePayout(input: PayoutInput): PayoutResult {
  const { net, rules, attendees, guests, remainderRecipient } = input;
  const roles: RolePayout[] = rules.map((rule) => {
    const attendeeIds = attendees.filter((a) => a.roleId === rule.roleId).map((a) => a.userId);
    return { ...rule, attendeeIds, skipped: attendeeIds.length === 0, amount: 0 };
  });
  const present = roles.filter((r) => !r.skipped);

  for (const role of present) {
    if (role.kind === "role_fixed") role.amount = role.value;
    if (role.kind === "member_fixed") role.amount = role.value * role.attendeeIds.length;
  }
  const fixedTotal =
    present.reduce((sum, r) => sum + (r.kind === "percentage" ? 0 : r.amount), 0) +
    guests.reduce((sum, g) => sum + g.amount, 0);

  const shortfall = Math.max(0, fixedTotal - net);
  const overAllocated = net < 0 || shortfall > 0;
  const members = attendees.map((a) => ({ userId: a.userId, roleId: a.roleId, amount: 0 }));

  if (overAllocated) {
    // Roles keep the fixed amount they claim, so the shortfall can be shown; nobody is paid it.
    for (const role of roles) if (role.kind === "percentage") role.amount = 0;
    return {
      net,
      overAllocated,
      shortfall: Math.max(shortfall, -net),
      fixedTotal,
      remainder: 0,
      roles,
      members,
      guests: guests.map((g) => ({ id: g.id, amount: 0 })),
      unallocated: 0,
    };
  }

  const remainder = net - fixedTotal;
  const percentRoles = present.filter((r) => r.kind === "percentage");
  const percentTotal = percentRoles.reduce((sum, r) => sum + r.value, 0);
  if (percentTotal > 0) {
    // Proportional to the Roles present, so a skipped Role's share is shared out.
    // BigInt: remainder × basis points can pass 2^53.
    for (const role of percentRoles) {
      role.amount = Number((BigInt(remainder) * BigInt(role.value)) / BigInt(percentTotal));
    }
  }

  // Each Role's amount, split equally among its attendees; what doesn't divide
  // evenly is rounding.
  let rounding = percentTotal > 0 ? remainder - percentRoles.reduce((sum, r) => sum + r.amount, 0) : 0;
  for (const role of present) {
    const each = role.kind === "member_fixed" ? role.value : Math.floor(role.amount / role.attendeeIds.length);
    for (const id of role.attendeeIds) members.find((m) => m.userId === id)!.amount = each;
    rounding += role.amount - each * role.attendeeIds.length;
  }

  let unallocated = percentTotal > 0 ? 0 : remainder;
  const recipient = members.find((m) => m.userId === remainderRecipient);
  if (recipient) recipient.amount += rounding;
  else unallocated += rounding;

  return {
    net,
    overAllocated,
    shortfall: 0,
    fixedTotal,
    remainder,
    roles,
    members,
    guests: guests.map((g) => ({ ...g })),
    unallocated,
  };
}
