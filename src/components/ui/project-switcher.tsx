"use client";

import { Check, ChevronDown, Mail, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Avatar } from "./brand.tsx";
import { CountBadge } from "./count-badge.tsx";
import { iconProps } from "./icon-props.ts";
import { initials } from "@/lib/initials.ts";

export interface ProjectOption {
  id: string;
  name: string;
}

const menuLinkClass =
  "flex h-9 items-center gap-2 rounded-md px-2 text-[14px]/[20px] font-medium text-ink no-underline hover:bg-bg-3 hover:text-ink";

// The top bar's Project chip (`bs-top-proj`), opening a list of the User's
// Projects to switch to, and the way to their pending Invitations or a new
// Project on the welcome screen.
export function ProjectSwitcher({
  current,
  projects,
  invitationCount,
}: {
  current: ProjectOption;
  projects: ProjectOption[];
  invitationCount: number;
}) {
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
    <div ref={root} className="relative min-w-0">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`Banda: ${current.name}. Cambiar de banda${invitationCount ? `. ${invitationLabel(invitationCount)}` : ""}`}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 max-w-full cursor-pointer items-center gap-2 rounded-pill border-0 bg-bg-3 pr-3 pl-1 text-[13px]/[18px] font-medium text-ink"
      >
        <Avatar initials={initials(current.name)} />
        <span className="truncate">{current.name}</span>
        <ChevronDown {...iconProps} className="shrink-0 text-ink-muted" />
        {invitationCount > 0 && <CountBadge n={invitationCount} />}
      </button>
      {open && (
        <div
          id={listId}
          className="absolute top-full left-0 z-30 mt-2 w-64 max-w-[calc(100vw-32px)] rounded-lg bg-bg-2 p-2 shadow-pop"
        >
          <div className="px-2 pt-1 pb-2 text-overline text-ink-subtle uppercase">Tus bandas</div>
          <ul className="grid gap-0.5">
            {projects.map((project) => {
              const isCurrent = project.id === current.id;
              return (
                <li key={project.id}>
                  <Link
                    href={`/p/${project.id}`}
                    aria-current={isCurrent ? "true" : undefined}
                    onClick={() => setOpen(false)}
                    className={menuLinkClass}
                  >
                    <Avatar
                      initials={initials(project.name)}
                      tone={isCurrent ? "spotlight" : "neutral"}
                    />
                    <span className="truncate">{project.name}</span>
                    {isCurrent && <Check {...iconProps} className="ml-auto shrink-0 text-spotlight-ink" />}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 grid gap-0.5 border-t border-line pt-2">
            <Link href="/bienvenida" onClick={() => setOpen(false)} className={menuLinkClass}>
              <Mail {...iconProps} className="shrink-0 text-ink-muted" />
              Invitaciones
              {invitationCount > 0 && (
                <span className="ml-auto">
                  <CountBadge n={invitationCount} label={invitationLabel(invitationCount)} />
                </span>
              )}
            </Link>
            <Link href="/bienvenida" onClick={() => setOpen(false)} className={menuLinkClass}>
              <Plus {...iconProps} className="shrink-0 text-ink-muted" />
              Crear una banda
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

const invitationLabel = (n: number) =>
  n === 1 ? "1 invitación pendiente" : `${n} invitaciones pendientes`;

