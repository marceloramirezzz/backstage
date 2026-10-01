import { INTENSITY_LABELS } from "@/lib/intensity-label.ts";
import { INTENSITIES, type Intensity } from "@/services/songs.ts";

const BAR_HEIGHTS = ["h-1.5", "h-[9px]", "h-3", "h-[15px]"];

// Four rising bars, lit up to the Song's intensity, then its word.
export function IntensityMeter({ intensity }: { intensity: Intensity }) {
  const level = INTENSITIES.indexOf(intensity);
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className="inline-flex h-4 items-end gap-0.5">
        {BAR_HEIGHTS.map((height, i) => (
          <span
            key={height}
            className={`w-1 rounded-[1px] ${height} ${i <= level ? "bg-spotlight" : "bg-bg-3"}`}
          />
        ))}
      </span>
      <span className="text-[13px]/[18px] text-ink-muted">{INTENSITY_LABELS[intensity]}</span>
    </span>
  );
}
