"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { IconButton } from "./button.tsx";
import { iconProps } from "./icon-props.ts";

// A modal over the page (a floating layer, so `shadow-pop`), a bottom sheet
// under 640px. Escape, the close button and a click outside all close it;
// focus returns to whatever opened it. Opening focuses the element marked
// `data-autofocus`, if any, and starts its content afresh, so a past error or
// half-typed form doesn't linger.
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [openings, setOpenings] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setOpenings((n) => n + 1);
  }

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      // The dialog itself is only ever the target when the backdrop is clicked.
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="m-auto w-[440px] text-left max-w-[calc(100vw-32px)] rounded-lg bg-bg-2 p-0 text-ink shadow-pop backdrop:bg-bg-0/70 max-sm:mb-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none"
    >
      <div className="flex flex-col gap-4 p-6 max-sm:p-4 max-sm:pb-6">
        <div className="flex items-center justify-between gap-4">
          <h2 id={titleId} className="m-0 text-title">
            {title}
          </h2>
          <IconButton square aria-label="Cerrar" onClick={onClose}>
            <X {...iconProps} />
          </IconButton>
        </div>
        <div key={openings} className="contents">
          {children}
        </div>
      </div>
    </dialog>
  );
}
