import type { ReactNode } from "react";

// The bar above each page (`bs-top`): leading controls, then `end` pushed right.
export function TopBar({ children, end }: { children: ReactNode; end?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center gap-4 border-b border-line bg-bg-1 px-6 py-3 max-desktop:px-4">
      {children}
      {end && <div className="ml-auto flex items-center gap-2">{end}</div>}
    </header>
  );
}
