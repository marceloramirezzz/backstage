import { formatDuration } from "@/lib/format.ts";

// A Setlist's total as `56m` or `2h 35m`, to the nearest minute.
export const formatTotal = (seconds: number) => formatDuration(Math.round(seconds / 60));
