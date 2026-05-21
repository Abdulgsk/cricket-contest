"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { logoutAction } from "@/actions/auth";

export function LogoutButton() {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const confirm = () => {
    start(async () => {
      await logoutAction();
    });
  };

  const dialog = open && (
    <div
      // Use an absurdly high z-index AND portal to <body> so the dialog
      // escapes every parent stacking context (sticky nav, transformed
      // containers, blurred backdrops, etc.).
      className="fixed inset-0 z-[2147483647] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md animate-in fade-in duration-150"
      onClick={() => !pending && setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Confirm logout"
        className="relative w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-white/10 bg-popover/95 backdrop-blur-xl shadow-2xl ring-1 ring-black/10 animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 border-b border-border/40 bg-gradient-to-br from-danger/15 to-danger/5 rounded-t-2xl">
          <h2 className="text-base font-semibold">Log out?</h2>
          <p className="text-xs text-muted-foreground mt-1">
            You&apos;ll need to sign in again to access the league.
          </p>
        </div>
        <div className="flex flex-col-reverse sm:flex-row gap-2 px-5 py-4">
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={pending}
            className="flex-1 h-10 rounded-xl border border-border text-sm font-medium hover:bg-muted/50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={pending}
            className="flex-1 h-10 rounded-xl bg-danger text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Logging out…" : "Yes, log out"}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:bg-danger/10 hover:text-danger transition"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        Logout
      </button>

      {mounted && dialog ? createPortal(dialog, document.body) : null}
    </>
  );
}
