import type { Intensity } from "@/services/songs.ts";

// A Song's intensity as the UI names it, from calmest to most energetic.
export const INTENSITY_LABELS: Record<Intensity, string> = {
  calm: "Tranquila",
  medium: "Media",
  danceable: "Bailable",
  energetic: "Enérgica",
};
