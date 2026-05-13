"use client";
import { useTransition, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { changePasswordAction, logoutAction, updateProfileAction } from "@/actions/auth";
import { AvatarUploader } from "@/components/avatar-uploader";

export function ProfileForms({
  initial,
}: {
  initial: { username: string; whatsapp?: string; my11circleName?: string; avatar?: string | null; bio?: string | null };
}) {
  const [pending, start] = useTransition();
  const [pwPending, pwStart] = useTransition();
  const [pwMsg, setPwMsg] = useState<string | null>(null);

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card>
        <h2 className="font-semibold mb-3">Profile</h2>
        <div className="mb-4 pb-4 border-b border-border">
          <AvatarUploader initial={initial.avatar ?? null} name={initial.username} />
        </div>
        <form
          action={(fd) =>
            start(async () => {
              const r = await updateProfileAction(fd);
              if (r.ok) toast.success("Profile updated");
              else toast.error(r.error);
            })
          }
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label htmlFor="username">Display name</Label>
            <Input id="username" name="username" defaultValue={initial.username} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="whatsapp">WhatsApp number</Label>
            <div className="flex items-stretch rounded-md border border-border focus-within:ring-2 focus-within:ring-ring overflow-hidden">
              <span className="px-3 flex items-center bg-muted text-sm text-muted-foreground select-none">
                +91
              </span>
              <input
                id="whatsapp"
                name="whatsapp"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                pattern="[0-9]{10}"
                defaultValue={(initial.whatsapp ?? "").replace(/^\+?91/, "")}
                placeholder="10-digit mobile"
                className="flex-1 bg-transparent px-3 py-2 text-sm outline-none"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="my11circleName">My11Circle name</Label>
            <Input
              id="my11circleName"
              name="my11circleName"
              defaultValue={initial.my11circleName ?? ""}
              placeholder="Exact My11Circle username"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bio">Bio</Label>
            <textarea
              id="bio"
              name="bio"
              defaultValue={initial.bio ?? ""}
              maxLength={280}
              rows={3}
              placeholder="Tell others about yourself (max 280 chars)"
              className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
            />
            <p className="text-[11px] text-muted-foreground">Visible to other players on your profile page.</p>
          </div>
          <Button loading={pending} variant="glow">{pending ? "Saving…" : "Save changes"}</Button>
        </form>
      </Card>

      <Card>
        <h2 className="font-semibold mb-3">Change password</h2>
        <form
          action={(fd) =>
            pwStart(async () => {
              const r = await changePasswordAction(fd);
              if (r.ok) {
                setPwMsg("Password updated");
                toast.success("Password updated");
              } else {
                setPwMsg(r.error);
                toast.error(r.error);
              }
            })
          }
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label htmlFor="current">Current password</Label>
            <Input id="current" name="current" type="password" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="next">New password</Label>
            <Input id="next" name="next" type="password" required minLength={4} />
          </div>
          {pwMsg && <p className="text-xs text-muted-foreground">{pwMsg}</p>}
          <Button loading={pwPending}>{pwPending ? "Updating…" : "Update password"}</Button>
        </form>

        <form action={logoutAction} className="mt-6">
          <Button type="submit" variant="outline" className="w-full">Log out</Button>
        </form>
      </Card>
    </div>
  );
}
