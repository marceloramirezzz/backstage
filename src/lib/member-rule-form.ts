import type { MemberRule } from "@/services/member-payout-math.ts";

// Money is typed as "300.000" (dots group thousands); NaN when it isn't whole guaraníes.
export function readAmount(value: string): number {
  const digits = value.replace(/[.\s]/g, "");
  return /^\d+$/.test(digits) ? Number(digits) : NaN;
}

// A signed amount, "+50.000" or "-20.000"; blank is 0. NaN when malformed.
export function readSignedAmount(value: string): number {
  const trimmed = value.trim().replace(/^[−–]/, "-");
  if (trimmed === "") return 0;
  const amount = readAmount(trimmed.replace(/^[+-]/, ""));
  return trimmed.startsWith("-") ? -amount : amount;
}

// The rule a form field pair holds: `equal` ignores the amount, `fixed` needs one.
export function readMemberRule(kind: string, value: string): MemberRule {
  if (kind === "equal") return { kind: "equal", value: 0 };
  return { kind: "fixed", value: readAmount(value) };
}

// "default" follows the Member's Project default; otherwise the rule replaces it.
export function readOverride(mode: string, value: string): MemberRule | null {
  return mode === "default" ? null : readMemberRule(mode, value);
}
