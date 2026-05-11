"use client";

import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-w-lg w-full rounded-3xl border border-border bg-background p-6 shadow-2xl">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-3 text-sm text-muted-foreground whitespace-pre-line">{description}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onCancel} disabled={loading} className="w-full sm:w-auto">
            {cancelLabel}
          </Button>
          <Button onClick={onConfirm} loading={loading} className="w-full sm:w-auto">
            {loading ? "Processing…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
