"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { assignUserRoleAction } from "@/actions/admin";

type SystemRole = "user" | "admin" | "superadmin";

export type RoleOption = { id: string; name: string };

export function UserRoleAssign({
  userId,
  currentSystemRole,
  currentCustomRoleId,
  customRoles,
  self,
}: {
  userId: string;
  currentSystemRole: SystemRole;
  currentCustomRoleId: string | null;
  customRoles: RoleOption[];
  self: boolean;
}) {
  // Selection format: "sys:user" | "sys:admin" | "sys:superadmin" | "custom:<id>"
  const initial = currentCustomRoleId
    ? `custom:${currentCustomRoleId}`
    : `sys:${currentSystemRole}`;
  const [value, setValue] = useState(initial);
  const [pending, start] = useTransition();

  const apply = () => {
    start(async () => {
      const payload = value.startsWith("custom:")
        ? { targetUserId: userId, kind: "custom" as const, customRoleId: value.slice(7) }
        : { targetUserId: userId, kind: "system" as const, systemRole: value.slice(4) as SystemRole };
      const res = await assignUserRoleAction(payload);
      if (!res.ok) {
        toast.error(res.error ?? "Failed to update role");
        return;
      }
      toast.success("Role updated");
    });
  };

  if (self) return <span className="text-xs text-muted-foreground">Current account</span>;

  return (
    <div className="flex items-center gap-2">
      <select
        className="h-9 rounded-lg border border-border bg-card px-2 text-xs min-w-[160px]"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={pending}
      >
        <optgroup label="System">
          <option value="sys:user">User</option>
          <option value="sys:admin">Admin</option>
          <option value="sys:superadmin">Superadmin</option>
        </optgroup>
        {customRoles.length > 0 && (
          <optgroup label="Custom">
            {customRoles.map((r) => (
              <option key={r.id} value={`custom:${r.id}`}>
                {r.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <Button
        size="sm"
        variant="outline"
        loading={pending}
        onClick={apply}
        disabled={value === initial}
      >
        Apply
      </Button>
    </div>
  );
}
