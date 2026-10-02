"use client";

import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { IconButton } from "@/components/ui/button.tsx";
import { iconProps } from "@/components/ui/icon-props.ts";
import { TopBar } from "@/components/ui/top-bar.tsx";

// The Banda layout: sidebar beside the page from 900px up, below that a
// drawer opened from the top bar.
export function AppShell({
  sidebar,
  topBar,
  topBarEnd,
  children,
}: {
  sidebar: ReactNode;
  topBar: ReactNode;
  topBarEnd?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    menuButton.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Following a link in the drawer closes it.
  const closeOnLink = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest("a")) setOpen(false);
  };

  return (
    <div className="min-h-screen desktop:grid desktop:grid-cols-[248px_minmax(0,1fr)]">
      {open && (
        <div aria-hidden className="fixed inset-0 z-40 bg-bg-0/70 desktop:hidden" onClick={close} />
      )}
      <div
        id="app-sidebar"
        onClick={closeOnLink}
        className={`${open ? "fixed inset-y-0 left-0 z-50 flex shadow-pop" : "hidden"} desktop:sticky desktop:top-0 desktop:z-auto desktop:flex desktop:h-screen desktop:shadow-none [&>aside]:h-full max-desktop:[&>aside]:overflow-y-auto max-desktop:[&>aside]:overflow-x-hidden`}
      >
        {sidebar}
        {open && (
          <IconButton
            aria-label="Cerrar menú"
            onClick={close}
            autoFocus
            className="absolute top-5 right-4 bg-bg-1 desktop:hidden"
          >
            <X {...iconProps} />
          </IconButton>
        )}
      </div>
      <div className="flex min-w-0 flex-col">
        <TopBar end={topBarEnd}>
          <IconButton
            ref={menuButton}
            aria-label="Abrir menú"
            aria-expanded={open}
            aria-controls="app-sidebar"
            onClick={() => setOpen(true)}
            className="desktop:hidden"
          >
            <Menu {...iconProps} />
          </IconButton>
          {topBar}
        </TopBar>
        {children}
      </div>
    </div>
  );
}
