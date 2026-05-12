"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setRoleAction } from "@/actions/admin";

export function UserRoleControls({
  userId,
  role,
  self,
}: {
  userId: string;
  role: "user" | "admin" | "superadmin";
  self: boolean;
}) {
  const [pending, start] = useTransition();
  const [nextRole, setNextRole] = useState<"user" | "admin" | "superadmin">(role);

  const applyRole = () =>
    start(async () => {
      try {
        await setRoleAction(userId, nextRole);
        toast.success(`Role set to ${nextRole}`);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });

  if (self) return <span className="text-xs text-muted-foreground">Current account</span>;

  return (
    <div className="flex items-center gap-2">
      <select
        className="h-9 rounded-lg border border-border bg-card px-2 text-xs"
        value={nextRole}
        onChange={(e) => setNextRole(e.target.value as "user" | "admin" | "superadmin")}
        disabled={pending}
      >
        <option value="user">User</option>
        <option value="admin">Admin</option>
        <option value="superadmin">Superadmin</option>
      </select>
      <Button
        size="sm"
        variant="outline"
        loading={pending}
        onClick={applyRole}
        disabled={nextRole === role}
      >
        Apply
      </Button>
    </div>
  );
}
