"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Send, Loader2, CornerDownLeft } from "lucide-react";

/**
 * Premium comment composer used by both bug reports and work items.
 *
 * Design notes:
 * - Outer shell is a single rounded card with a focus-within ring so the whole
 *   composer lights up when the user is typing (matches the polish on the
 *   admin queue cards).
 * - Textarea auto-grows up to a cap; no chrome inside the shell so it reads
 *   as one fluid surface.
 * - Footer shows a subtle Enter-hint + live character counter that turns
 *   warning at 90% capacity.
 * - Submit pill uses primary tone (filled) when there's content, ghost when
 *   empty. Keyboard: Enter sends, Shift+Enter newline, ⌘/Ctrl+Enter also sends.
 */
export function CommentComposer({
  id,
  onSend,
  placeholder = "Add a reply…",
  compact = false,
  maxLength = 4000,
}: {
  id: string;
  onSend: (input: { id: string; text: string }) => Promise<{ ok: boolean; error?: string }>;
  placeholder?: string;
  /** Drops the outer card chrome (used when embedded in a denser surface). */
  compact?: boolean;
  maxLength?: number;
}) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // Auto-grow up to ~8 lines.
  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = "0px";
    const next = Math.min(ta.scrollHeight, 220);
    ta.style.height = next + "px";
  }, [text]);

  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && !pending;
  const nearLimit = text.length >= Math.floor(maxLength * 0.9);
  const overLimit = text.length > maxLength;

  const submit = () => {
    if (!canSend || overLimit) return;
    start(async () => {
      const res = await onSend({ id, text: trimmed });
      if (!res.ok) {
        toast.error(res.error ?? "Couldn't post comment");
        return;
      }
      setText("");
      // Refocus so threading multiple replies feels fluid.
      requestAnimationFrame(() => ref.current?.focus());
    });
  };

  return (
    <div
      className={
        "group/composer transition-all " +
        (compact
          ? ""
          : "rounded-2xl border bg-card/60 backdrop-blur-sm overflow-hidden shadow-sm " +
            (focused
              ? "border-primary/50 ring-2 ring-primary/15"
              : "border-border/60 hover:border-border"))
      }
    >
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
            return;
          }
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        rows={1}
        maxLength={maxLength + 200 /* allow overshoot for friendlier error */}
        disabled={pending}
        placeholder={placeholder}
        className={
          "w-full resize-none bg-transparent px-3.5 py-3 text-sm leading-relaxed placeholder:text-muted-foreground/80 focus:outline-none " +
          (compact ? "min-h-[2.5rem]" : "min-h-[3rem]")
        }
        aria-label="Comment"
      />
      <div
        className={
          "flex items-center justify-between gap-2 px-3 pb-2.5 pt-1 " +
          (compact ? "" : "border-t border-border/40 bg-muted/20")
        }
      >
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="hidden sm:inline-flex items-center gap-1">
            <kbd className="inline-flex h-4 items-center rounded border border-border/60 bg-background px-1 font-mono text-[9px] text-foreground/70">
              Enter
            </kbd>
            <span>to send</span>
            <span className="opacity-40">·</span>
            <kbd className="inline-flex h-4 items-center rounded border border-border/60 bg-background px-1 font-mono text-[9px] text-foreground/70">
              Shift+↵
            </kbd>
            <span>newline</span>
          </span>
          <span
            className={
              "tabular-nums " +
              (overLimit
                ? "text-danger font-semibold"
                : nearLimit
                  ? "text-warning"
                  : "text-muted-foreground/70")
            }
          >
            {text.length}/{maxLength}
          </span>
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={!canSend || overLimit}
          className={
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition shadow-sm " +
            (canSend && !overLimit
              ? "bg-primary text-primary-foreground hover:brightness-110 active:scale-[0.98]"
              : "bg-muted text-muted-foreground cursor-not-allowed opacity-70")
          }
          aria-label="Send comment"
        >
          {pending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Sending…
            </>
          ) : (
            <>
              <Send className="h-3.5 w-3.5" />
              Send
              <CornerDownLeft className="h-3 w-3 opacity-60" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
