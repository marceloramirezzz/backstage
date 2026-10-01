"use client";

// A pill track of mutually exclusive view toggles (`bs-seg`); the chosen one
// takes the spotlight fill. Two to five options, one or two words each.
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex gap-0.5 rounded-pill border border-line bg-bg-2 p-[3px]"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className="h-[30px] cursor-pointer rounded-pill border-0 bg-transparent px-4 text-[13px]/[18px] font-medium text-ink-muted hover:text-ink aria-pressed:bg-spotlight aria-pressed:text-on-spotlight"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
