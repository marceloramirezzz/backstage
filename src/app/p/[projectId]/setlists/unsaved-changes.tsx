"use client";

import { useRouter } from "next/navigation";
import { createContext, use, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Dialog } from "@/components/ui/dialog.tsx";

interface UnsavedChanges {
  // Whether the open Setlist has edits that aren't saved.
  dirty: boolean;
  setDirty: (dirty: boolean) => void;
  // Goes to `href`, asking first while there are unsaved edits.
  leave: (href: string) => void;
}

const UnsavedChangesContext = createContext<UnsavedChanges>({
  dirty: false,
  setDirty: () => {},
  leave: () => {},
});

export const useUnsavedChanges = () => use(UnsavedChangesContext);

// Keeps unsaved edits to a Setlist from being lost without asking: an app
// link (the Setlists list, the sidebar) asks first, and so does reloading or
// closing the tab.
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [dirty, setDirty] = useState(false);
  // Where the Member asked to go, while they decide.
  const [leaving, setLeaving] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    // Runs before Next's Link sees the click, so it can hold the navigation.
    const onClick = (e: MouseEvent) => {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      const link = (e.target as Element).closest("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.target || link.hasAttribute("download")) {
        return;
      }
      const url = new URL(link.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaving(url.pathname + url.search + url.hash);
    };
    addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  const leave = (href: string) => (dirty ? setLeaving(href) : router.push(href));

  const discard = () => {
    if (leaving === null) return;
    setDirty(false);
    setLeaving(null);
    router.push(leaving);
  };

  return (
    <UnsavedChangesContext value={{ dirty, setDirty, leave }}>
      {children}
      <Dialog open={leaving !== null} onClose={() => setLeaving(null)} title="Cambios sin guardar">
        <p className="m-0 text-[14px]/[20px] text-ink-muted">
          Esta setlist tiene cambios sin guardar. Si salís, se pierden.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setLeaving(null)} data-autofocus>
            Seguir editando
          </Button>
          <Button variant="danger" onClick={discard}>
            Descartar cambios
          </Button>
        </div>
      </Dialog>
    </UnsavedChangesContext>
  );
}
