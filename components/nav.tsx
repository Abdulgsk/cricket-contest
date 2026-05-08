"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Home" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/matches", label: "Matches" },
  { href: "/predictions", label: "Predictions" },
  { href: "/rules", label: "Rules" },
  { href: "/profile", label: "Profile" },
];

export function Nav({ role }: { role: "user" | "admin" | "superadmin" }) {
  const path = usePathname();
  const items = role === "admin" || role === "superadmin" ? [...NAV, { href: "/admin", label: "Admin" }] : NAV;
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 shrink-0 border-r border-border p-4 gap-2 sticky top-0 h-screen">
        <Link href="/" className="font-bold text-lg mb-6 px-2">
          🏏 <span className="bg-gradient-to-r from-pink-400 to-sky-400 bg-clip-text text-transparent">Fantasy 13</span>
        </Link>
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className={cn(
              "px-3 py-2 rounded-xl text-sm transition",
              path === it.href || path.startsWith(it.href + "/")
                ? "bg-primary/15 text-primary font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {it.label}
          </Link>
        ))}
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 glass border-t border-border flex justify-around py-2 px-1 overflow-x-auto">
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className={cn(
              "flex-shrink-0 text-center text-xs font-medium py-2 px-3 rounded-lg min-w-0",
              path === it.href || path.startsWith(it.href + "/")
                ? "text-primary bg-primary/10"
                : "text-muted-foreground"
            )}
          >
            {it.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
