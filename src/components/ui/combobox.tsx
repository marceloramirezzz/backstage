"use client";

import { Plus } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";
import { matchesSearch } from "@/lib/search.ts";
import { iconProps } from "./icon-props.ts";

export interface ComboboxOption {
  value: string;
  label: string;
  // Set after the label in the mono font, e.g. a duration.
  detail?: string;
}

export interface ComboboxGroup {
  label: string;
  options: ComboboxOption[];
}

// A dashed "add" field that searches its options as you type (ignoring case
// and accents) and hands the chosen one to `onSelect`, then empties itself
// for the next pick. Arrows move through the options, Enter or Tab (once
// something is typed) picks, Escape closes the list.
export function Combobox({
  groups,
  placeholder,
  label,
  onSelect,
}: {
  groups: ComboboxGroup[];
  placeholder: string;
  label: string;
  onSelect: (value: string) => void;
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const shown = groups
    .map((group) => ({
      ...group,
      options: group.options.filter((option) => matchesSearch(option.label, query)),
    }))
    .filter((group) => group.options.length > 0);
  const options = shown.flatMap((group) => group.options);
  const current = Math.min(active, options.length - 1);
  const optionId = (i: number) => `${listId}-${i}`;

  const pick = (option: ComboboxOption) => {
    onSelect(option.value);
    setQuery("");
    setActive(0);
    setOpen(false);
  };

  const moveTo = (i: number) => {
    setOpen(true);
    setActive(i);
    document.getElementById(optionId(i))?.scrollIntoView({ block: "nearest" });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!options.length) return;
      if (!open) return moveTo(current < 0 ? 0 : current);
      const step = e.key === "ArrowDown" ? 1 : -1;
      moveTo((current + step + options.length) % options.length);
    } else if (e.key === "Enter" && open && options[current]) {
      e.preventDefault(); // not the surrounding form's submit
      pick(options[current]);
    } else if (e.key === "Tab" && !e.shiftKey && open && query && options[current]) {
      e.preventDefault(); // completes the highlighted option; focus stays for the next pick
      pick(options[current]);
    } else if (e.key === "Escape" && open) {
      e.preventDefault(); // not a surrounding dialog's close
      setOpen(false);
    }
  };

  let index = -1;
  return (
    <div className="relative">
      <Plus
        {...iconProps}
        aria-hidden
        className="pointer-events-none absolute top-2.5 left-3 text-ink-subtle"
      />
      <input
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && current >= 0 ? optionId(current) : undefined}
        value={query}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onClick={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className="h-9 w-full rounded-md border border-dashed border-line-control bg-bg-2 pr-3 pl-9 text-[14px]/[20px] text-ink placeholder:text-ink-subtle"
      />
      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute inset-x-0 top-full z-10 mt-1 max-h-72 overflow-y-auto rounded-md border border-line bg-bg-2 py-1 shadow-pop"
        >
          {shown.length === 0 && (
            <p className="m-0 px-3 py-2 text-[13px]/[18px] text-ink-muted">Nada coincide.</p>
          )}
          {shown.map((group) => (
            <div key={group.label} role="group" aria-label={group.label}>
              <div
                aria-hidden
                className="px-3 pt-2 pb-1 text-[11px]/[14px] font-medium tracking-[.06em] text-ink-subtle uppercase"
              >
                {group.label}
              </div>
              {group.options.map((option) => {
                const i = ++index;
                return (
                  <div
                    key={option.value}
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === current}
                    // Keeps focus in the field, so it stays open for the next pick.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(option)}
                    onMouseMove={() => i !== current && setActive(i)}
                    className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-[14px]/[20px] ${
                      i === current ? "bg-bg-3" : ""
                    }`}
                  >
                    <span className="min-w-0 truncate">{option.label}</span>
                    {option.detail && (
                      <span className="shrink-0 font-mono text-[13px]/[18px] text-ink-muted">
                        {option.detail}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
