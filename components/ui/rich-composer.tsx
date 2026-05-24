"use client";

import * as React from "react";
import { toast } from "sonner";
import { Bold, Italic, Code, Link as LinkIcon, AtSign, Eye, Image as ImageIcon, X, Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MarkdownLite } from "@/components/ui/markdown";
import { Kbd } from "@/components/ui/kbd";
import { searchMentionableUsersAction } from "@/actions/bugs";

type MentionUser = { id: string; handle: string; name: string };

/** Compress + downscale an image File to a data URL <= ~600KB. */
async function compressImage(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("Image load failed"));
    im.src = dataUrl;
  });
  const MAX_DIM = 1600;
  let { width, height } = img;
  if (width > MAX_DIM || height > MAX_DIM) {
    const s = MAX_DIM / Math.max(width, height);
    width = Math.round(width * s);
    height = Math.round(height * s);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, width, height);
  for (const q of [0.82, 0.7, 0.55, 0.4]) {
    const out = canvas.toDataURL("image/jpeg", q);
    if (out.length < 600_000) return out;
  }
  return canvas.toDataURL("image/jpeg", 0.4);
}

export interface RichComposerProps {
  /** Submit handler. Receives the final markdown text. */
  onSubmit: (text: string) => Promise<{ ok: boolean; error?: string } | void>;
  placeholder?: string;
  submitLabel?: string;
  disabled?: boolean;
  /** Auto-focus on mount. */
  autoFocus?: boolean;
  /** If provided, screenshots are attached inline via markdown image refs. */
  onAttachScreenshot?: (dataUrl: string) => Promise<void> | void;
  /** Compact (single-line until typing) vs expanded mode. */
  compact?: boolean;
  /** Optional pre-fill (e.g. for edit-in-place). */
  initialValue?: string;
  /** Optional Cancel button (edit mode). */
  onCancel?: () => void;
  className?: string;
}

/**
 * RichComposer — markdown textarea with:
 *   - toolbar (B / I / code / link / @ / image / preview)
 *   - @mention popover (fetches users on the fly)
 *   - paste / drag-drop image → auto-compresses → inserts ![](data:…)
 *   - Cmd/Ctrl + Enter submits
 *   - Preview tab
 */
export function RichComposer({
  onSubmit,
  placeholder = "Write a comment…",
  submitLabel = "Comment",
  disabled,
  autoFocus,
  onAttachScreenshot,
  compact,
  initialValue = "",
  onCancel,
  className,
}: RichComposerProps) {
  const [value, setValue] = React.useState(initialValue);
  const [submitting, setSubmitting] = React.useState(false);
  const [mode, setMode] = React.useState<"write" | "preview">("write");
  const [expanded, setExpanded] = React.useState(!compact || !!initialValue);
  const taRef = React.useRef<HTMLTextAreaElement | null>(null);

  // mention popover state
  const [mention, setMention] = React.useState<{
    open: boolean;
    query: string;
    start: number;
    results: MentionUser[];
    cursor: number;
  }>({ open: false, query: "", start: 0, results: [], cursor: 0 });

  // auto-grow
  React.useEffect(() => {
    if (!taRef.current) return;
    taRef.current.style.height = "auto";
    taRef.current.style.height = Math.min(360, taRef.current.scrollHeight) + "px";
  }, [value, mode]);

  React.useEffect(() => {
    if (autoFocus) taRef.current?.focus();
  }, [autoFocus]);

  const insert = (before: string, after = "") => {
    const ta = taRef.current;
    if (!ta) return;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const next = value.slice(0, s) + before + value.slice(s, e) + after + value.slice(e);
    setValue(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = s + before.length;
      ta.selectionEnd = e + before.length;
    });
  };

  const wrap = (tag: string) => insert(tag, tag);

  const onKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention.open && mention.results.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMention((m) => ({ ...m, cursor: (m.cursor + 1) % m.results.length }));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMention((m) => ({
          ...m,
          cursor: (m.cursor - 1 + m.results.length) % m.results.length,
        }));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        applyMention(mention.results[mention.cursor]);
        return;
      }
      if (e.key === "Escape") {
        setMention((m) => ({ ...m, open: false }));
        return;
      }
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
    if (e.key === "Escape" && onCancel) {
      e.preventDefault();
      onCancel();
    }
  };

  const onChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setValue(v);
    const caret = e.target.selectionStart;
    // detect @mention trigger right behind the caret
    const before = v.slice(0, caret);
    const m = before.match(/(?:^|\s)@([a-z0-9_.-]{0,32})$/i);
    if (m) {
      const start = caret - m[0].length + (m[0].startsWith(" ") ? 1 : 0);
      const q = m[1];
      try {
        const r = await searchMentionableUsersAction(q);
        if (r.ok) {
          setMention({ open: true, query: q, start, results: r.results, cursor: 0 });
          return;
        }
      } catch {
        /* ignore */
      }
    }
    setMention((s) => ({ ...s, open: false }));
  };

  const applyMention = (u: MentionUser) => {
    const ta = taRef.current;
    if (!ta) return;
    const caret = ta.selectionStart;
    const before = value.slice(0, mention.start);
    const after = value.slice(caret);
    const insertText = `@${u.handle} `;
    const next = before + insertText + after;
    setValue(next);
    setMention((s) => ({ ...s, open: false }));
    requestAnimationFrame(() => {
      ta.focus();
      const pos = (before + insertText).length;
      ta.selectionStart = ta.selectionEnd = pos;
    });
  };

  const handleFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (arr.length === 0) return;
    for (const f of arr) {
      try {
        const data = await compressImage(f);
        if (onAttachScreenshot) {
          await onAttachScreenshot(data);
        } else {
          insert(`\n![screenshot](${data})\n`);
        }
      } catch {
        toast.error("Couldn't attach that image");
      }
    }
  };

  const submit = async () => {
    const text = value.trim();
    if (!text) return;
    setSubmitting(true);
    try {
      const r = await onSubmit(text);
      if (!r || r.ok) {
        setValue("");
        setMode("write");
        if (compact) setExpanded(false);
      } else if (r.error) {
        toast.error(r.error);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className={cn(
          "flex w-full items-center gap-2 rounded-2xl border border-border/60 bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground transition hover:bg-muted/50 hover:text-foreground",
          className,
        )}
      >
        <Send className="h-4 w-4 opacity-60" />
        {placeholder}
      </button>
    );
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/70 bg-card/70 shadow-sm backdrop-blur transition focus-within:border-primary/40 focus-within:shadow-md",
        className,
      )}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
      }}
    >
      {/* mode tabs */}
      <div className="flex items-center justify-between gap-2 border-b border-border/50 px-2 py-1.5">
        <div className="flex gap-0.5 text-[11px] font-medium">
          <TabBtn active={mode === "write"} onClick={() => setMode("write")}>
            Write
          </TabBtn>
          <TabBtn active={mode === "preview"} onClick={() => setMode("preview")}>
            <Eye className="mr-1 inline h-3 w-3" />
            Preview
          </TabBtn>
        </div>
        <div className="hidden gap-1 sm:flex">
          <ToolBtn title="Bold (⌘B)" onClick={() => wrap("**")}>
            <Bold className="h-3.5 w-3.5" />
          </ToolBtn>
          <ToolBtn title="Italic" onClick={() => wrap("*")}>
            <Italic className="h-3.5 w-3.5" />
          </ToolBtn>
          <ToolBtn title="Code" onClick={() => wrap("`")}>
            <Code className="h-3.5 w-3.5" />
          </ToolBtn>
          <ToolBtn title="Link" onClick={() => insert("[", "](https://)")}>
            <LinkIcon className="h-3.5 w-3.5" />
          </ToolBtn>
          <ToolBtn title="Mention" onClick={() => insert("@")}>
            <AtSign className="h-3.5 w-3.5" />
          </ToolBtn>
          <label className="inline-grid h-7 w-7 cursor-pointer place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground">
            <ImageIcon className="h-3.5 w-3.5" />
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files?.length) handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>

      {mode === "write" ? (
        <div className="relative">
          <textarea
            ref={taRef}
            value={value}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onPaste={(e) => {
              const items = Array.from(e.clipboardData.items)
                .filter((it) => it.kind === "file")
                .map((it) => it.getAsFile())
                .filter((f): f is File => !!f);
              if (items.length) {
                e.preventDefault();
                handleFiles(items);
              }
            }}
            disabled={disabled || submitting}
            placeholder={placeholder}
            rows={3}
            className="block w-full resize-none rounded-b-2xl bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/70"
          />
          {mention.open && mention.results.length > 0 ? (
            <div className="absolute bottom-full left-3 z-40 mb-1 w-64 overflow-hidden rounded-xl border border-border bg-popover/95 text-popover-foreground shadow-2xl backdrop-blur-md">
              {mention.results.map((u, i) => (
                <button
                  key={u.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applyMention(u);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] text-foreground",
                    i === mention.cursor
                      ? "bg-primary/15 text-primary"
                      : "hover:bg-muted hover:text-foreground",
                  )}
                >
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-muted text-[10px] font-bold text-foreground">
                    {u.name[0]?.toUpperCase()}
                  </span>
                  <span className="font-semibold">{u.name}</span>
                  <span className={cn(i === mention.cursor ? "text-primary/80" : "text-foreground/60")}>
                    @{u.handle}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="min-h-[80px] px-3 py-2.5">
          {value.trim() ? (
            <MarkdownLite text={value} />
          ) : (
            <span className="text-sm italic text-muted-foreground">Nothing to preview.</span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 px-2 py-1.5 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-2">
          <Kbd>⌘</Kbd>
          <span>+</span>
          <Kbd>↵</Kbd>
          <span>to send · drag / paste images</span>
        </div>
        <div className="flex items-center gap-2">
          {onCancel ? (
            <Button variant="ghost" size="sm" onClick={onCancel} type="button">
              Cancel
            </Button>
          ) : null}
          <Button
            size="sm"
            onClick={submit}
            disabled={disabled || submitting || !value.trim()}
            type="button"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TabBtn({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-2 py-1 transition",
        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function ToolBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}
