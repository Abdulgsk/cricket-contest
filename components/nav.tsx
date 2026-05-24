"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown, Bug, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { BrandLogo } from "@/components/brand-logo";
import { BugReportButton } from "@/components/bug-report-button";

const NAV = [
  { href: "/dashboard", label: "Home" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/analytics", label: "Analytics" },
  { href: "/matches", label: "Matches" },
  { href: "/predictions", label: "Predictions" },
  { href: "/rivalry", label: "Rivalry" },
  { href: "/contests", label: "Contests" },
  { href: "/rules", label: "Rules" },
  { href: "/profile", label: "Profile" },
];

type NavItem = {
  href: string;
  label: string;
  children?: Array<{ href: string; label: string; icon?: React.ComponentType<{ className?: string }> }>;
};

export function Nav({
  role,
  hasAdminAccess = false,
  hasDeveloperAccess = false,
  rivalryUnseen = 0,
  assignedBugs = 0,
}: {
  role: "user" | "admin" | "superadmin";
  hasAdminAccess?: boolean;
  hasDeveloperAccess?: boolean;
  rivalryUnseen?: number;
  assignedBugs?: number;
}) {
  const path = usePathname();
  const sp = useSearchParams();
  const activeTab = sp.get("tab");
  const [open, setOpen] = useState(false);
  const [showMenuButton, setShowMenuButton] = useState(true);
  const showAdmin = role === "superadmin" || hasAdminAccess;
  const showDeveloper = role === "superadmin" || hasDeveloperAccess;
  const showDeveloperNav = showDeveloper || assignedBugs > 0;
  const items: NavItem[] = [
    ...NAV,
    ...(showDeveloperNav
      ? [
          {
            href: "/developer",
            label: "Developer",
            children: [
              { href: "/developer?tab=bugs", label: "Bug reports", icon: Bug },
              { href: "/developer?tab=workitems", label: "Work items", icon: Wrench },
            ],
          },
        ]
      : []),
    ...(showAdmin ? [{ href: "/admin", label: "Admin" }] : []),
  ];
  const [devOpen, setDevOpen] = useState(() => path.startsWith("/developer"));
  useEffect(() => {
    if (path.startsWith("/developer")) setDevOpen(true);
  }, [path]);

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
    items.map((it) => {
      const isActive = path === it.href || path.startsWith(it.href + "/");
      if (it.children && it.children.length > 0) {
        const expanded = devOpen || isActive;
        return (
          <div key={it.href} className="flex flex-col">
            <button
              type="button"
              onClick={() => setDevOpen((v) => !v)}
              aria-expanded={expanded}
              className={cn(
                "px-3 py-2 rounded-xl text-sm transition flex items-center justify-between gap-2 w-full",
                isActive
                  ? "bg-primary/15 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <span className="flex items-center gap-2">
                {it.label}
                {assignedBugs > 0 ? (
                  <span
                    aria-label={`${assignedBugs} item${assignedBugs === 1 ? "" : "s"} assigned to you`}
                    className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-warning text-white text-[10px] font-semibold"
                  >
                    {assignedBugs > 9 ? "9+" : assignedBugs}
                  </span>
                ) : null}
              </span>
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition", expanded && "rotate-180")}
              />
            </button>
            {expanded ? (
              <div className="ml-3 mt-1 flex flex-col gap-1 border-l border-border/50 pl-3">
                {it.children.map((c) => {
                  const Icon = c.icon;
                  const cTab = new URL(c.href, "http://x").searchParams.get("tab");
                  const childActive =
                    (path === "/developer" || path.startsWith("/developer/")) &&
                    activeTab === cTab;
                  return (
                    <Link
                      key={c.href}
                      href={c.href}
                      onClick={onClick}
                      className={cn(
                        "px-2.5 py-1.5 rounded-lg text-[13px] transition flex items-center gap-2",
                        childActive
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
                      <span>{c.label}</span>
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      }
      return (
        <Link
          key={it.href}
          href={it.href}
          onClick={onClick}
          className={cn(
            "px-3 py-2 rounded-xl text-sm transition flex items-center justify-between gap-2",
            isActive
              ? "bg-primary/15 text-primary font-medium"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
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
      );
    });

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
          <BugReportButton />
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
          className="md:hidden fixed top-0 left-0 z-50 h-dvh w-56 flex flex-col border-r border-border bg-card animate-in slide-in-from-left duration-200"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
          <div className="p-4 pb-2 shrink-0">
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
          </div>
          <nav className="flex-1 overflow-y-auto px-4 pb-3 flex flex-col gap-1">
            {renderLinks(() => setOpen(false))}
          </nav>
          <div className="shrink-0 border-t border-border/60 bg-card px-4 pt-3 pb-[max(env(safe-area-inset-bottom),12px)] flex flex-col gap-2">
            <ThemeToggle />
            <BugReportButton />
          </div>
        </aside>
      )}
    </>
  );
}
