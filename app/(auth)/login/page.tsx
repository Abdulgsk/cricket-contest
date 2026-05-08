"use client";
import Link from "next/link";
import { useTransition, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { loginAction } from "@/actions/auth";

export default function LoginPage() {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      action={(fd) => {
        setErr(null);
        start(async () => {
          const r = await loginAction(fd);
          if (r && !r.ok) {
            setErr(r.error);
            toast.error(r.error);
          }
        });
      }}
      className="space-y-4"
    >
      <h1 className="text-2xl font-bold">Welcome back</h1>
      <p className="text-sm text-muted-foreground">Sign in to your fantasy account.</p>
      <div className="space-y-1.5">
        <Label htmlFor="userId">User ID</Label>
        <Input id="userId" name="userId" required autoComplete="username" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" required autoComplete="current-password" />
      </div>
      {err && <p className="text-xs text-danger">{err}</p>}
      <Button variant="glow" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <div className="flex justify-between text-xs text-muted-foreground">
        <Link href="/signup" className="hover:text-foreground">Create account</Link>
        <Link href="/forgot-password" className="hover:text-foreground">Forgot password?</Link>
      </div>
    </form>
  );
}
