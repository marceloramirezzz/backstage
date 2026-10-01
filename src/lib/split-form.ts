import type { SplitKind, SplitRule } from "@/services/payout-math.ts";
import { whole } from "./form.ts";

// Percentages are typed as "25" or "12,5" and stored as basis points.

// NaN when it isn't a percentage with at most two decimals.
export function percentToBasisPoints(value: string): number {
  const cleaned = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return NaN;
  return Math.round(Number(cleaned) * 100);
}

// `12,5` for 1250; whole percentages have no decimals.
export function basisPointsToPercent(bp: number): string {
  return String(bp / 100).replace(".", ",");
}

export const NO_RULE = "none";

// The rules a split form holds: a `kind-<roleId>` and `value-<roleId>` field
// per Role, `none` meaning the Role gets nothing. A malformed value comes
// through as NaN for the service to reject.
export function readSplitRules(form: FormData, roleIds: string[]): SplitRule[] {
  const rules: SplitRule[] = [];
  for (const roleId of roleIds) {
    const kind = String(form.get(`kind-${roleId}`) ?? NO_RULE);
    if (kind === NO_RULE) continue;
    const value = String(form.get(`value-${roleId}`) ?? "");
    rules.push({
      roleId,
      kind: kind as SplitKind,
      value: kind === "percentage" ? percentToBasisPoints(value) : whole(value.replace(/\D/g, "")),
    });
  }
  return rules;
}
