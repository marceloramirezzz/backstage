import { Settings } from "lucide-react";
import Link from "next/link";
import { iconProps } from "./icon-props.ts";

// The top bar's way to the User's settings.
export function SettingsLink() {
  return (
    <Link
      href="/ajustes"
      aria-label="Ajustes"
      title="Ajustes"
      className="inline-grid size-9 place-items-center rounded-pill border border-line text-ink no-underline hover:bg-bg-3 hover:text-ink"
    >
      <Settings {...iconProps} />
    </Link>
  );
}
