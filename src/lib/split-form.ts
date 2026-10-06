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
