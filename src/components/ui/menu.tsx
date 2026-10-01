"use client";

import { Ellipsis } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { IconButton } from "./button.tsx";
import { iconProps } from "./icon-props.ts";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  // Irreversible actions read in the danger color.
  danger?: boolean;
  onSelect: () => void;
}

// A row's "more actions" button (`bs-iconbtn-sq`) and the list it opens.
// Choosing an item closes the list and returns focus to the button first, so
// a dialog the item opens hands focus back there too.
export function Menu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative inline-flex">
      <IconButton
        ref={button}
        square
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
      >
        <Ellipsis {...iconProps} />
      </IconButton>
      {open && (
        <ul
          id={listId}
          className="absolute top-full right-0 z-30 mt-1 grid w-44 list-none gap-0.5 rounded-lg bg-bg-2 p-2 shadow-pop"
        >
          {items.map((item) => (
            <li key={item.label}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  button.current?.focus();
                  item.onSelect();
                }}
                className={`flex h-9 w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2 text-left text-[14px]/[20px] font-medium hover:bg-bg-3 ${item.danger ? "text-status-cancelled" : "text-ink"}`}
              >
                {item.icon}
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
