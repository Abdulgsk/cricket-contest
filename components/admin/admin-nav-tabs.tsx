"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminNavTabs({
  items,
}: {
  items: Array<{ href: string; label: string }>;
}) {
  const pathname = usePathname() ?? "/admin";
  const isActive = (href: string) =>
    href === "/admin"
      ? pathname === "/admin"
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <nav
      aria-label="Admin sections"
      className="mt-3 -mx-3 sm:mx-0 flex gap-1.5 overflow-x-auto px-3 sm:px-0 text-sm scrollbar-thin scroll-smooth"
    >
      {items.map((it) => {
        const active = isActive(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={
              "rounded-xl px-3 py-1.5 whitespace-nowrap transition border " +
              (active
                ? "bg-primary/15 text-primary border-primary/30 font-medium shadow-sm"
                : "border-border bg-card/70 text-muted-foreground hover:bg-muted/50 hover:text-foreground")
            }
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
