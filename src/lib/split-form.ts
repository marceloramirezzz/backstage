// `12,5` for 1250; whole percentages have no decimals.
export function basisPointsToPercent(bp: number): string {
  return String(bp / 100).replace(".", ",");
}
