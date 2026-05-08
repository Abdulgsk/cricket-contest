"use client";
import Link from "next/link";
import { useTransition, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { signupAction } from "@/actions/auth";

export default function SignupPage() {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      action={(fd) => {
        setErr(null);
        start(async () => {
          const r = await signupAction(fd);
          if (r && !r.ok) {
            setErr(r.error);
            toast.error(r.error);
          }
        });
      }}
      className="space-y-4"
    >
      <h1 className="text-2xl font-bold">Join the league</h1>
      <p className="text-sm text-muted-foreground">Create your fantasy account.</p>
      <div className="space-y-1.5">
        <Label htmlFor="userId">User ID (unique)</Label>
        <Input id="userId" name="userId" required minLength={2} autoComplete="username" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="username">Display name</Label>
        <Input id="username" name="username" required minLength={2} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" required minLength={4} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="whatsapp">WhatsApp number (optional)</Label>
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
            placeholder="10-digit mobile"
            className="flex-1 bg-transparent px-3 py-2 text-sm outline-none"
          />
        </div>
      </div>
      {err && <p className="text-xs text-danger">{err}</p>}
      <Button variant="glow" className="w-full" disabled={pending}>
        {pending ? "Creating…" : "Create account"}
      </Button>
      <p className="text-xs text-muted-foreground text-center">
        Already have an account? <Link href="/login" className="text-foreground underline">Sign in</Link>
      </p>
    </form>
  );
}
