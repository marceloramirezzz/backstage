"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  // Trailing count or tag.
  end?: ReactNode;
}

// The left rail (`bs-side`): brand, then groups of links, then a footer.
export function Sidebar({
  brand,
  children,
  footer,
  className = "",
}: {
  brand: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <aside
      className={`flex w-[248px] flex-col gap-4 border-r border-line bg-bg-1 p-5 ${className}`}
    >
      {brand}
      {children}
      {footer && <div className="mt-auto flex flex-col gap-2">{footer}</div>}
    </aside>
  );
}

export function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <div className="flex flex-col gap-2">
      <div className="px-3 text-overline text-ink-subtle uppercase">{label}</div>
      <nav aria-label={label} className="grid gap-0.5">
        {items.map((item) => {
          const current = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={current ? "page" : undefined}
              className="relative flex h-9 items-center gap-3 rounded-md px-3 text-[14px]/[20px] font-medium whitespace-nowrap text-ink-muted no-underline hover:bg-bg-3 hover:text-ink aria-[current=page]:bg-spotlight-soft aria-[current=page]:text-spotlight-ink aria-[current=page]:after:absolute aria-[current=page]:after:inset-y-1.5 aria-[current=page]:after:-right-[21px] aria-[current=page]:after:w-0.5 aria-[current=page]:after:rounded-[2px] aria-[current=page]:after:bg-spotlight"
            >
              {item.icon}
              {item.label}
              {item.end && <span className="ml-auto">{item.end}</span>}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
