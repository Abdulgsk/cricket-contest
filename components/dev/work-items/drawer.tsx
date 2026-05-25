/**
 * Right-side detail drawer. URL-permalinked via `?item=<id>` so refresh +
 * back-button work. All editing happens here — the lists/board cards stay
 * compact.
 *
 * Sections (in order):
 *   1. Header: title + close + permalink
 *   2. Status / Priority / Assignee inline editors
 *   3. Due date + Story points + Tags
 *   4. Description (markdown-ish, kept plain)
 *   5. Subtasks (assignee or manager can tick)
 *   6. Attachments (image data-URLs, lightbox on click)
 *   7. Submission card (assignee-facing) + manager Accept / Request Changes
 *   8. Activity thread + comment composer
 *   9. Danger zone: Delete (manager only)
 */

"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  X,
  Loader2,
  Plus,
  Trash2,
  Link as LinkIcon,
  CheckCircle2,
  AlertOctagon,
  XCircle,
  Pencil,
  Paperclip,
  Megaphone,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActivityThread } from "@/components/activity-thread";
import { CommentComposer } from "@/components/comment-composer";
import { RequestChangesDialog } from "@/components/request-changes-dialog";
import {
  updateWorkItemAction,
  deleteWorkItemAction,
  setWorkItemTagsAction,
  setWorkItemPointsAction,
  setWorkItemDueAction,
  addWorkItemSubtaskAction,
  toggleWorkItemSubtaskAction,
  removeWorkItemSubtaskAction,
  addWorkItemAttachmentAction,
  removeWorkItemAttachmentAction,
  addWorkItemCommentAction,
  submitWorkItemResolutionAction,
  acceptWorkItemSubmissionAction,
  reopenWorkItemAction,
  requestWorkItemChangesAction,
} from "@/actions/work-items";
import {
  PRIORITY_META,
  PRIORITY_ORDER,
  STATUS_META,
  STATUS_ORDER,
  POINTS_OPTIONS,
  SUBMISSION_META,
  tagColor,
  dueState,
  relTime,
} from "./util";
import type {
  Priority,
  Status,
  SubmissionKind,
  WorkItemAssignee,
  WorkItemRow,
} from "./types";

/* -------------------------------------------------------------------------- */
/*  Image compression (reused pattern from bug-report-button)                  */
/* -------------------------------------------------------------------------- */

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
  for (const q of [0.82, 0.7, 0.6, 0.5, 0.4]) {
    const out = canvas.toDataURL("image/jpeg", q);
    if (out.length <= 700_000) return out;
  }
  return canvas.toDataURL("image/jpeg", 0.35);
}

/* -------------------------------------------------------------------------- */
/*  Drawer                                                                     */
/* -------------------------------------------------------------------------- */

export function Drawer({
  row,
  canManage,
  assignees,
  myUserId,
  onClose,
}: {
  row: WorkItemRow;
  canManage: boolean;
  assignees: WorkItemAssignee[];
  myUserId?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(row.title);
  const [editingDesc, setEditingDesc] = useState(false);
  const [draftDesc, setDraftDesc] = useState(row.description);
  const [tagDraft, setTagDraft] = useState("");
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [requestChangesOpen, setRequestChangesOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Escape closes drawer (unless lightbox open — escape closes lightbox first)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (lightbox) {
        setLightbox(null);
        return;
      }
      if (editingTitle || editingDesc || requestChangesOpen) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, editingTitle, editingDesc, requestChangesOpen, onClose]);

  // Lock background scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const isAssignee = myUserId && row.assignedToId === myUserId;
  const canSubmit = isAssignee && !row.needsReview && row.status !== "done";
  const due = dueState(row.dueAt);
  const stat = STATUS_META[row.status];
  const pri = PRIORITY_META[row.priority];

  const refresh = () => router.refresh();

  const run = (key: string, fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusyKey(key);
    start(async () => {
      try {
        const res = await fn();
        if (!res || res.ok === false) {
          toast.error(res?.error ?? "Action failed");
          return;
        }
        refresh();
      } finally {
        setBusyKey(null);
      }
    });
  };

  /* ---------------- Field handlers ---------------- */

  const onStatus = (s: Status) =>
    run(`status:${s}`, () => updateWorkItemAction({ id: row.id, status: s }));
  const onPriority = (p: Priority) =>
    run(`pri:${p}`, () => updateWorkItemAction({ id: row.id, priority: p }));
  const onAssign = (id: string) =>
    run(`assign:${id}`, () =>
      updateWorkItemAction({ id: row.id, assignedToId: id }),
    );
  const onDue = (val: string) =>
    run("due", () =>
      setWorkItemDueAction({
        id: row.id,
        dueAt: val ? new Date(val).toISOString() : null,
      }),
    );
  const onPoints = (val: string) =>
    run("points", () =>
      setWorkItemPointsAction({
        id: row.id,
        points: val === "" ? null : Number(val),
      }),
    );

  const onAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    const t = tagDraft.trim().toLowerCase();
    if (!t) return;
    if (row.tags.includes(t)) {
      setTagDraft("");
      return;
    }
    run("addTag", () =>
      setWorkItemTagsAction({ id: row.id, tags: [...row.tags, t] }),
    );
    setTagDraft("");
  };
  const onRemoveTag = (t: string) =>
    run(`rmTag:${t}`, () =>
      setWorkItemTagsAction({
        id: row.id,
        tags: row.tags.filter((x) => x !== t),
      }),
    );

  const onAddSubtask = (e: React.FormEvent) => {
    e.preventDefault();
    const t = subtaskDraft.trim();
    if (!t) return;
    run("addSub", () => addWorkItemSubtaskAction({ id: row.id, text: t }));
    setSubtaskDraft("");
  };
  const onToggleSub = (id: string, done: boolean) =>
    run(`sub:${id}`, () =>
      toggleWorkItemSubtaskAction({ id: row.id, subtaskId: id, done }),
    );
  const onRemoveSub = (id: string) =>
    run(`rmSub:${id}`, () =>
      removeWorkItemSubtaskAction({ id: row.id, subtaskId: id }),
    );

  const onTitleSave = () => {
    const next = draftTitle.trim();
    if (!next || next === row.title) {
      setEditingTitle(false);
      setDraftTitle(row.title);
      return;
    }
    setBusyKey("title");
    start(async () => {
      const res = await updateWorkItemAction({ id: row.id, title: next });
      setBusyKey(null);
      if (!res || res.ok === false) {
        toast.error(res?.error ?? "Could not save title");
        return;
      }
      setEditingTitle(false);
      refresh();
    });
  };
  const onDescSave = () => {
    setBusyKey("desc");
    start(async () => {
      const res = await updateWorkItemAction({
        id: row.id,
        description: draftDesc,
      });
      setBusyKey(null);
      if (!res || res.ok === false) {
        toast.error(res?.error ?? "Could not save description");
        return;
      }
      setEditingDesc(false);
      refresh();
    });
  };

  const onUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const f of Array.from(files).slice(0, 5)) {
        if (!f.type.startsWith("image/")) continue;
        try {
          const dataUrl = await compressImage(f);
          const res = await addWorkItemAttachmentAction({
            id: row.id,
            name: f.name,
            mime: "image/jpeg",
            dataUrl,
          });
          if (!res || res.ok === false) {
            toast.error(res?.error ?? "Upload failed");
          }
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Upload failed");
        }
      }
      refresh();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onRemoveAttachment = (id: string) =>
    run(`rmAtt:${id}`, () =>
      removeWorkItemAttachmentAction({ id: row.id, attachmentId: id }),
    );

  const onSubmitResolution = (kind: SubmissionKind, note: string) =>
    new Promise<void>((resolve) => {
      setBusyKey(`submit:${kind}`);
      start(async () => {
        const res = await submitWorkItemResolutionAction({
          id: row.id,
          kind,
          note,
        });
        setBusyKey(null);
        if (!res || res.ok === false) {
          toast.error(res?.error ?? "Submit failed");
          resolve();
          return;
        }
        toast.success("Submitted");
        refresh();
        resolve();
      });
    });

  const onAccept = () =>
    run("accept", () => acceptWorkItemSubmissionAction(row.id));
  const onReopen = () => run("reopen", () => reopenWorkItemAction(row.id));

  const onDelete = () => {
    if (!confirm(`Delete "${row.title}"? This is reversible by an admin.`)) return;
    run("delete", async () => {
      const res = await deleteWorkItemAction(row.id);
      if (res?.ok) {
        toast.success("Deleted");
        onClose();
      }
      return res;
    });
  };

  const onCopyLink = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("item", row.id);
    navigator.clipboard
      .writeText(url.toString())
      .then(() => toast.success("Link copied"))
      .catch(() => toast.error("Could not copy"));
  };

  const submissionMeta = row.submission ? SUBMISSION_META[row.submission.kind] : null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={row.title}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l border-border/60 bg-card shadow-2xl"
      >
        {/* Sticky header */}
        <header className="flex items-start gap-2 border-b border-border/60 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${stat.chip}`}
              >
                {stat.label}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${pri.chip}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${pri.dot}`} />
                {pri.label}
              </span>
              {row.needsReview && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-200">
                  Needs review
                </span>
              )}
              {due && (
                <span className={`text-[10px] ${due.tone}`}>{due.label}</span>
              )}
            </div>
            {editingTitle && canManage ? (
              <div className="mt-1.5 flex items-center gap-1">
                <input
                  autoFocus
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onTitleSave();
                    if (e.key === "Escape") {
                      setEditingTitle(false);
                      setDraftTitle(row.title);
                    }
                  }}
                  className="w-full rounded-lg border border-border bg-background px-2 py-1 text-base font-semibold"
                />
                <Button size="sm" onClick={onTitleSave} disabled={pending}>
                  {busyKey === "title" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    "Save"
                  )}
                </Button>
              </div>
            ) : (
              <h2 className="mt-1.5 flex items-center gap-1.5 text-base font-semibold leading-tight">
                <span className="break-words">{row.title}</span>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => {
                      setDraftTitle(row.title);
                      setEditingTitle(true);
                    }}
                    className="grid h-6 w-6 place-items-center rounded hover:bg-muted/40"
                    title="Edit title"
                  >
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}
              </h2>
            )}
            <p
              className="mt-0.5 text-[11px] text-muted-foreground"
              suppressHydrationWarning
            >
              Created by {row.createdByName} · {relTime(row.createdAt)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onCopyLink}
              className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted/40"
              title="Copy link"
            >
              <LinkIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted/40"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Scrollable body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {/* Status / Priority / Assignee */}
          {canManage && (
            <section className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <FieldGroup label="Status">
                <div className="flex flex-wrap gap-1">
                  {STATUS_ORDER.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => onStatus(s)}
                      disabled={pending || row.status === s}
                      className={
                        "rounded-md border px-2 py-1 text-[10px] font-semibold " +
                        (row.status === s
                          ? STATUS_META[s].chip + " ring-1 ring-current/30"
                          : "border-border/60 text-muted-foreground hover:bg-muted/30")
                      }
                    >
                      {STATUS_META[s].label}
                    </button>
                  ))}
                </div>
              </FieldGroup>
              <FieldGroup label="Priority">
                <div className="flex flex-wrap gap-1">
                  {PRIORITY_ORDER.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => onPriority(p)}
                      disabled={pending || row.priority === p}
                      className={
                        "rounded-md border px-2 py-1 text-[10px] font-semibold " +
                        (row.priority === p
                          ? PRIORITY_META[p].chip + " ring-1 ring-current/30"
                          : "border-border/60 text-muted-foreground hover:bg-muted/30")
                      }
                    >
                      {PRIORITY_META[p].label}
                    </button>
                  ))}
                </div>
              </FieldGroup>
              <FieldGroup label="Assignee">
                <select
                  value={row.assignedToId}
                  onChange={(e) => onAssign(e.target.value)}
                  disabled={pending}
                  className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                >
                  {assignees.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </FieldGroup>
            </section>
          )}

          {/* Due + Points + Tags */}
          {canManage && (
            <section className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <FieldGroup label="Due date">
                <input
                  type="date"
                  defaultValue={
                    row.dueAt ? new Date(row.dueAt).toISOString().slice(0, 10) : ""
                  }
                  onChange={(e) => onDue(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                />
              </FieldGroup>
              <FieldGroup label="Story points">
                <select
                  value={row.storyPoints == null ? "" : String(row.storyPoints)}
                  onChange={(e) => onPoints(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                >
                  <option value="">None</option>
                  {POINTS_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </FieldGroup>
              <FieldGroup label="Watchers">
                <div className="rounded-lg border border-border/60 bg-muted/20 px-2 py-1.5 text-xs text-muted-foreground">
                  {row.watcherCount}{" "}
                  {row.watcherCount === 1 ? "watcher" : "watchers"}
                </div>
              </FieldGroup>
            </section>
          )}

          {/* Tags */}
          <section>
            <SectionHeading label="Tags" />
            <div className="flex flex-wrap items-center gap-1">
              {row.tags.length === 0 && (
                <span className="text-[11px] text-muted-foreground/60">
                  No tags yet
                </span>
              )}
              {row.tags.map((t) => (
                <span
                  key={t}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${tagColor(t)}`}
                >
                  {t}
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => onRemoveTag(t)}
                      className="grid h-3.5 w-3.5 place-items-center rounded-full hover:bg-foreground/10"
                      aria-label={`Remove tag ${t}`}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </span>
              ))}
              {canManage && (
                <form onSubmit={onAddTag} className="inline-flex items-center">
                  <input
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    placeholder="+ tag"
                    maxLength={24}
                    className="w-20 rounded-full border border-dashed border-border bg-transparent px-2 py-0.5 text-[10px] focus:border-primary focus:outline-none"
                  />
                </form>
              )}
            </div>
          </section>

          {/* Description */}
          <section>
            <div className="mb-1 flex items-center justify-between">
              <SectionHeading label="Description" />
              {canManage && !editingDesc && (
                <button
                  type="button"
                  onClick={() => {
                    setDraftDesc(row.description);
                    setEditingDesc(true);
                  }}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Edit
                </button>
              )}
            </div>
            {editingDesc ? (
              <div className="space-y-2">
                <textarea
                  value={draftDesc}
                  onChange={(e) => setDraftDesc(e.target.value)}
                  rows={8}
                  maxLength={4000}
                  className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingDesc(false);
                      setDraftDesc(row.description);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button size="sm" onClick={onDescSave} disabled={pending}>
                    {busyKey === "desc" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      "Save"
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="whitespace-pre-wrap rounded-lg border border-border/40 bg-muted/10 px-3 py-2 text-sm leading-relaxed text-foreground/90">
                {row.description || (
                  <span className="text-muted-foreground/60">
                    No description yet.
                  </span>
                )}
              </p>
            )}
          </section>

          {/* Subtasks */}
          <section>
            <SectionHeading label={`Subtasks (${row.subtasks.length})`} />
            <ul className="space-y-1">
              {row.subtasks.map((s) => {
                const checkable = canManage || isAssignee;
                return (
                  <li
                    key={s.id}
                    className="flex items-start gap-2 rounded-lg border border-border/40 bg-background/40 px-2 py-1.5"
                  >
                    <input
                      type="checkbox"
                      checked={s.done}
                      disabled={!checkable || pending}
                      onChange={(e) => onToggleSub(s.id, e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
                    />
                    <span
                      className={
                        "min-w-0 flex-1 text-sm " +
                        (s.done ? "text-muted-foreground line-through" : "")
                      }
                    >
                      {s.text}
                    </span>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => onRemoveSub(s.id)}
                        className="grid h-6 w-6 place-items-center rounded hover:bg-muted/40 text-muted-foreground hover:text-danger"
                        aria-label="Remove subtask"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            {canManage && (
              <form onSubmit={onAddSubtask} className="mt-2 flex items-center gap-1">
                <input
                  value={subtaskDraft}
                  onChange={(e) => setSubtaskDraft(e.target.value)}
                  placeholder="Add a subtask…"
                  maxLength={200}
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <Button size="sm" type="submit" disabled={!subtaskDraft.trim() || pending}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </form>
            )}
          </section>

          {/* Attachments */}
          <section>
            <div className="mb-1 flex items-center justify-between">
              <SectionHeading
                label={`Attachments (${row.attachments.length}/10)`}
              />
              {canManage && row.attachments.length < 10 && (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => onUpload(e.target.files)}
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[11px] hover:bg-muted/40"
                  >
                    {uploading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Paperclip className="h-3 w-3" />
                    )}
                    Add image
                  </button>
                </>
              )}
            </div>
            {row.attachments.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/60">
                No attachments yet.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {row.attachments.map((a) => (
                  <div
                    key={a.id}
                    className="group relative aspect-square overflow-hidden rounded-lg border border-border/60 bg-muted/20"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={a.dataUrl}
                      alt={a.name}
                      onClick={() => setLightbox(a.dataUrl)}
                      className="h-full w-full cursor-zoom-in object-cover transition group-hover:scale-105"
                    />
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => onRemoveAttachment(a.id)}
                        className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-foreground/60 text-background opacity-0 group-hover:opacity-100"
                        aria-label="Remove attachment"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Submission card + manager controls */}
          {(row.submission || canSubmit) && (
            <section>
              <SectionHeading label="Submission" />
              {row.submission && submissionMeta ? (
                <div
                  className={`rounded-2xl border ${submissionMeta.ring} px-3 py-2.5`}
                >
                  <div
                    className={`flex items-center gap-2 text-sm font-semibold ${submissionMeta.tone}`}
                  >
                    <submissionMeta.Icon className="h-4 w-4" />
                    {submissionMeta.label}
                    <span
                      className="ml-auto text-[11px] font-normal text-muted-foreground"
                      suppressHydrationWarning
                    >
                      by {row.submission.submittedByName} ·{" "}
                      {relTime(row.submission.submittedAt)}
                    </span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground/90">
                    {row.submission.note}
                  </p>
                  {canManage && row.needsReview && !requestChangesOpen && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        onClick={onAccept}
                        disabled={pending}
                      >
                        {busyKey === "accept" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRequestChangesOpen(true)}
                      >
                        <Megaphone className="h-3.5 w-3.5" />
                        Request changes
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={onReopen}
                        disabled={pending}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reopen
                      </Button>
                    </div>
                  )}
                  {canManage && requestChangesOpen && (
                    <div className="mt-2.5">
                      <RequestChangesDialog
                        id={row.id}
                        onSubmit={async (input) => {
                          const res = await requestWorkItemChangesAction(input);
                          if (res?.ok) refresh();
                          return res ?? { ok: false, error: "Failed" };
                        }}
                        onDone={() => setRequestChangesOpen(false)}
                        onCancel={() => setRequestChangesOpen(false)}
                      />
                    </div>
                  )}
                </div>
              ) : (
                canSubmit && (
                  <SubmissionForm onSubmit={onSubmitResolution} pending={pending} />
                )
              )}
            </section>
          )}

          {/* Activity + comments */}
          <section>
            <SectionHeading label="Activity" />
            <ActivityThread
              entries={row.activity}
              workItemId={row.id}
              myUserId={myUserId}
              canManage={canManage}
            />
            <div className="mt-3">
              <CommentComposer
                id={row.id}
                onSend={async (p) => addWorkItemCommentAction(p)}
                placeholder="Add a comment… use @handle to mention"
              />
            </div>
          </section>

          {/* Danger zone */}
          {canManage && (
            <section className="rounded-2xl border border-danger/30 bg-danger/[0.04] px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-semibold text-danger">
                    Delete work item
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    Soft delete — can be restored from the audit log.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onDelete}
                  disabled={pending}
                  className="border-danger/40 text-danger hover:bg-danger/10"
                >
                  {busyKey === "delete" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  Delete
                </Button>
              </div>
            </section>
          )}
        </div>
      </aside>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[70] grid place-items-center bg-foreground/80 p-4"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="Attachment"
            className="max-h-full max-w-full rounded-lg shadow-2xl"
          />
        </div>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Small helpers                                                              */
/* -------------------------------------------------------------------------- */

function SectionHeading({ label }: { label: string }) {
  return (
    <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {label}
    </h3>
  );
}

function FieldGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <SectionHeading label={label} />
      {children}
    </div>
  );
}

function SubmissionForm({
  onSubmit,
  pending,
}: {
  onSubmit: (kind: SubmissionKind, note: string) => Promise<void>;
  pending: boolean;
}) {
  const [kind, setKind] = useState<SubmissionKind>("done");
  const [note, setNote] = useState("");
  const meta = SUBMISSION_META[kind];

  const KIND_OPTIONS: Array<{ kind: SubmissionKind; Icon: typeof CheckCircle2 }> = [
    { kind: "done", Icon: CheckCircle2 },
    { kind: "blocked", Icon: AlertOctagon },
    { kind: "wont_do", Icon: XCircle },
  ];

  return (
    <div className={`rounded-2xl border ${meta.ring} px-3 py-2.5`}>
      <p className="text-xs font-semibold text-foreground/80">
        Your update — manager will review
      </p>
      <div className="mt-2 flex gap-1">
        {KIND_OPTIONS.map((o) => {
          const m = SUBMISSION_META[o.kind];
          const active = o.kind === kind;
          return (
            <button
              key={o.kind}
              type="button"
              onClick={() => setKind(o.kind)}
              className={
                "flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition " +
                (active
                  ? m.ring + " " + m.tone + " ring-1 ring-current/30"
                  : "border-border/60 text-muted-foreground hover:bg-muted/30")
              }
            >
              <span className="inline-flex items-center gap-1">
                <o.Icon className="h-3 w-3" />
                {m.label}
              </span>
            </button>
          );
        })}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        maxLength={4000}
        placeholder="What did you do? Mention links, PRs, blockers…"
        className="mt-2 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <div className="mt-2 flex justify-end">
        <Button
          size="sm"
          disabled={note.trim().length < 3 || pending}
          onClick={() => onSubmit(kind, note.trim()).then(() => setNote(""))}
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Submit"}
        </Button>
      </div>
    </div>
  );
}
