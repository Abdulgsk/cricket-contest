"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/actions/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { BrandLogo } from "@/components/brand-logo";

const NAV = [
  { href: "/dashboard", label: "Home" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/analytics", label: "Analytics" },
  { href: "/matches", label: "Matches" },
  { href: "/predictions", label: "Predictions" },
  { href: "/rivalry", label: "Rivalry" },
  { href: "/rules", label: "Rules" },
  { href: "/profile", label: "Profile" },
];

export function Nav({
  role,
  rivalryUnseen = 0,
}: {
  role: "user" | "admin" | "superadmin";
  rivalryUnseen?: number;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [showMenuButton, setShowMenuButton] = useState(true);
  const items = role === "admin" || role === "superadmin" ? [...NAV, { href: "/admin", label: "Admin" }] : NAV;

  // Close drawer when route changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [path]);

  // Lock body scroll while drawer is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    let lastY = window.scrollY;

    const onScroll = () => {
      const currentY = window.scrollY;
      if (currentY <= 16) {
        setShowMenuButton(true);
      } else if (currentY > lastY) {
        setShowMenuButton(false);
      } else if (currentY < lastY) {
        setShowMenuButton(true);
      }
      lastY = currentY;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const renderLinks = (onClick?: () => void) =>
    items.map((it) => (
      <Link
        key={it.href}
        href={it.href}
        onClick={onClick}
        className={cn(
          "px-3 py-2 rounded-xl text-sm transition flex items-center justify-between gap-2",
          path === it.href || path.startsWith(it.href + "/")
            ? "bg-primary/15 text-primary font-medium"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <span>{it.label}</span>
        {it.href === "/rivalry" && rivalryUnseen > 0 && (
          <span
            aria-label={`${rivalryUnseen} new rivalry update${rivalryUnseen === 1 ? "" : "s"}`}
            className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-danger text-white text-[10px] font-semibold"
          >
            {rivalryUnseen > 9 ? "9+" : rivalryUnseen}
          </span>
        )}
      </Link>
    ));

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 shrink-0 border-r border-border p-4 gap-2 sticky top-0 h-screen">
        <Link href="/" className="mb-6 px-2 inline-block">
          <BrandLogo size="md" />
        </Link>
        {renderLinks()}
        <div className="mt-auto pt-4">
          <ThemeToggle />
        </div>
        <div className="pt-2">
          <LogoutButton />
        </div>
      </aside>

      {/* Mobile hamburger button - top left, high z-index */}
      <button
        type="button"
        className={cn(
          "md:hidden fixed top-4 left-3 z-50 rounded-lg bg-background/85 p-2 shadow-sm backdrop-blur transition-transform duration-200 hover:bg-muted",
          open || showMenuButton ? "translate-y-0 opacity-100" : "-translate-y-16 opacity-0 pointer-events-none"
        )}
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Mobile drawer backdrop */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50 transition-opacity"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Mobile drawer - only render when open */}
      {open && (
        <aside
          className="md:hidden fixed top-0 left-0 z-50 h-full w-56 flex flex-col p-4 gap-3 border-r border-border bg-card animate-in slide-in-from-left duration-200"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="p-2 rounded-lg hover:bg-muted w-fit"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          {renderLinks(() => setOpen(false))}
          <div className="mt-auto pt-4">
            <ThemeToggle />
          </div>
          <div className="pt-2">
            <LogoutButton />
          </div>
        </aside>
      )}
    </>
  );
}

function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:bg-danger/10 hover:text-danger transition"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        Logout
      </button>
    </form>
  );
}
