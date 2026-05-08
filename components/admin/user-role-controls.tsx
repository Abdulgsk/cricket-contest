"use client";
import { useTransition } from "react";
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
  const promote = (next: "user" | "admin" | "superadmin") =>
    start(async () => {
      try {
        await setRoleAction(userId, next);
        toast.success(`Role set to ${next}`);
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  if (self) return <span className="text-xs text-muted-foreground">(you)</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {role !== "user" && (
        <Button
          size="sm"
          variant="destructive"
          loading={pending}
          onClick={() => promote("user")}
          title="Revoke admin access"
        >
          Revoke
        </Button>
      )}
      {role !== "admin" && (
        <Button size="sm" variant="outline" loading={pending} onClick={() => promote("admin")}>
          Make admin
        </Button>
      )}
      {role !== "superadmin" && (
        <Button size="sm" variant="outline" loading={pending} onClick={() => promote("superadmin")}>
          Make super
        </Button>
      )}
    </div>
  );
}
