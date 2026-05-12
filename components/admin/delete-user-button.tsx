"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteUserCascadeAction } from "@/actions/admin";

export function DeleteUserButton({
  userId,
  username,
  handle,
  self,
}: {
  userId: string;
  username: string;
  handle: string;
  self: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [pending, start] = useTransition();

  if (self) return null;

  const close = () => {
    if (pending) return;
    setOpen(false);
    setConfirmText("");
  };

  const submit = () => {
    start(async () => {
      const r = await deleteUserCascadeAction(userId, confirmText);
      if (r.ok) {
        const s = r.summary;
        toast.success(
          `Deleted @${handle} · ${s.predictions} preds, ${s.matchResults} results, ${s.rivalries} rivalries removed`
        );
        setOpen(false);
        setConfirmText("");
      } else {
        toast.error(r.error);
      }
    });
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="text-danger border-danger/40 hover:bg-danger/10"
        onClick={() => setOpen(true)}
      >
        🗑️ Delete
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-w-lg w-full rounded-3xl border border-danger/40 bg-background p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-danger">⚠️ Delete user permanently</h3>
            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
              <p>
                You are about to permanently delete{" "}
                <span className="font-semibold text-foreground">{username}</span>{" "}
                <span className="text-xs">(@{handle})</span>.
              </p>
              <p className="text-xs">
                This will cascade-delete all of their data:
              </p>
              <ul className="text-xs list-disc pl-5 space-y-0.5">
                <li>Predictions & match results (impacts leaderboard history)</li>
                <li>All rivalries (challenger or opponent)</li>
                <li>Custom pools they created (and all predictions on those pools)</li>
                <li>Notifications, bonus & prediction audit logs, daily facts</li>
                <li>Bounty references on matches and settings will be cleared</li>
              </ul>
              <p className="text-xs text-danger font-medium pt-2">
                This action is irreversible.
              </p>
            </div>

            <div className="mt-5 space-y-2">
              <label className="text-xs text-muted-foreground">
                Type <span className="font-mono font-bold text-danger">DELETE</span> to confirm:
              </label>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
                disabled={pending}
                autoFocus
              />
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                onClick={close}
                disabled={pending}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                onClick={submit}
                loading={pending}
                disabled={pending || confirmText !== "DELETE"}
                className="w-full sm:w-auto bg-danger hover:bg-danger/90 text-white"
              >
                {pending ? "Deleting…" : "Delete forever"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
