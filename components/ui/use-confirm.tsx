"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" paints red; "default" uses primary. */
  tone?: "default" | "danger";
};

type Resolver = (ok: boolean) => void;
type DialogState = ConfirmOptions & { id: number; resolve: Resolver };

const Ctx = React.createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

/**
 * App-wide confirm dialog. Wrap the layout once with <ConfirmProvider/>,
 * then call useConfirm() to await a yes/no decision instead of using
 * window.confirm.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = React.useState<DialogState | null>(null);
  const counter = React.useRef(0);

  const confirm = React.useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      counter.current += 1;
      setDialog({ id: counter.current, resolve, ...opts });
    });
  }, []);

  const close = React.useCallback(
    (ok: boolean) => {
      setDialog((prev) => {
        if (prev) prev.resolve(ok);
        return null;
      });
    },
    [],
  );

  React.useEffect(() => {
    if (!dialog) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        close(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, close]);

  return (
    <Ctx.Provider value={confirm}>
      {children}
      {dialog && typeof window !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[10000] flex items-center justify-center px-4">
              <div
                className="absolute inset-0 bg-background/70 backdrop-blur-sm"
                onClick={() => close(false)}
                aria-hidden
              />
              <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="confirm-title"
                className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl"
              >
                <div className="flex items-start gap-3 px-5 pt-5">
                  <div
                    className={
                      dialog.tone === "danger"
                        ? "grid h-9 w-9 shrink-0 place-items-center rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-300"
                        : "grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
                    }
                  >
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2
                      id="confirm-title"
                      className="text-[15px] font-semibold leading-tight"
                    >
                      {dialog.title}
                    </h2>
                    {dialog.description ? (
                      <p className="mt-1.5 text-[12.5px] text-muted-foreground">
                        {dialog.description}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => close(false)}
                    className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Close"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-4 flex items-center justify-end gap-2 border-t border-border/50 bg-card/40 px-5 py-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => close(false)}
                  >
                    {dialog.cancelLabel ?? "Cancel"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    autoFocus
                    onClick={() => close(true)}
                    className={
                      dialog.tone === "danger"
                        ? "!bg-rose-600 !text-white hover:!bg-rose-600/90"
                        : undefined
                    }
                  >
                    {dialog.confirmLabel ?? "Confirm"}
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </Ctx.Provider>
  );
}

/**
 * Returns an async confirm() that resolves to true/false.
 * Falls back to window.confirm if the provider is missing.
 */
export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
  const ctx = React.useContext(Ctx);
  return React.useCallback(
    (opts: ConfirmOptions) => {
      if (ctx) return ctx(opts);
      if (typeof window === "undefined") return Promise.resolve(false);
      return Promise.resolve(
        window.confirm(`${opts.title}\n\n${opts.description ?? ""}`),
      );
    },
    [ctx],
  );
}
