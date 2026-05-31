"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import {
  sendMy11OtpAction,
  verifyMy11OtpAction,
  saveMy11CookieManualAction,
  clearMy11OtpStateAction,
} from "@/actions/my11-cookie";

type Message = { tone: "ok" | "err" | "info"; text: string } | null;

export function My11CookieCapture({ pendingPhone }: { pendingPhone: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [phone, setPhone] = useState(pendingPhone ?? "");
  const [countryCode, setCountryCode] = useState("91");
  const [otpSent, setOtpSent] = useState(Boolean(pendingPhone));
  const [otp, setOtp] = useState("");
  const [manualCookie, setManualCookie] = useState("");
  const [msg, setMsg] = useState<Message>(null);
  const [debug, setDebug] = useState<unknown>(null);

  function reset() {
    setOtp("");
    setOtpSent(false);
    setMsg(null);
    setDebug(null);
  }

  function sendOtp() {
    setMsg(null);
    setDebug(null);
    startTransition(async () => {
      const res = await sendMy11OtpAction({ phone, countryCode });
      if (!res.ok) {
        setMsg({ tone: "err", text: res.error });
        setDebug(res.raw ?? null);
        return;
      }
      setOtpSent(true);
      setMsg({ tone: "ok", text: "OTP sent. Check your phone." });
      setDebug(res.raw ?? null);
    });
  }

  function verifyOtp() {
    setMsg(null);
    setDebug(null);
    startTransition(async () => {
      const res = await verifyMy11OtpAction({ otp });
      if (!res.ok) {
        setMsg({ tone: "err", text: res.error });
        setDebug(res.raw ?? null);
        return;
      }
      setMsg({
        tone: "ok",
        text: `Logged in. Captured cookies: ${res.capturedCookies.join(", ") || "(none reported)"}.`,
      });
      reset();
      router.refresh();
    });
  }

  function saveManual() {
    setMsg(null);
    setDebug(null);
    startTransition(async () => {
      const res = await saveMy11CookieManualAction({ cookieHeader: manualCookie });
      if (!res.ok) {
        setMsg({ tone: "err", text: res.error });
        return;
      }
      setMsg({
        tone: res.loggedIn ? "ok" : "info",
        text: res.loggedIn
          ? "Cookie saved and My11 reports logged in."
          : "Cookie saved but My11 reports not logged in. Try a fresh value.",
      });
      setManualCookie("");
      router.refresh();
    });
  }

  function cancelOtp() {
    startTransition(async () => {
      await clearMy11OtpStateAction();
      reset();
      router.refresh();
    });
  }

  return (
    <>
      <Card>
        <CardTitle className="mb-3">Login with phone + OTP</CardTitle>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[6rem_1fr] gap-2">
            <div>
              <Label htmlFor="cc">Country</Label>
              <Input
                id="cc"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value.replace(/\D/g, ""))}
                disabled={otpSent || pending}
                inputMode="numeric"
              />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                disabled={otpSent || pending}
                inputMode="tel"
                placeholder="9876543210"
              />
            </div>
          </div>
          {!otpSent ? (
            <Button onClick={sendOtp} loading={pending} disabled={!phone}>
              Send OTP
            </Button>
          ) : (
            <>
              <div>
                <Label htmlFor="otp">OTP</Label>
                <Input
                  id="otp"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  disabled={pending}
                  inputMode="numeric"
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={verifyOtp} loading={pending} disabled={!otp}>
                  Verify
                </Button>
                <Button variant="outline" onClick={cancelOtp} disabled={pending}>
                  Cancel
                </Button>
              </div>
            </>
          )}
          {msg ? (
            <p
              className={
                msg.tone === "ok"
                  ? "text-sm text-success"
                  : msg.tone === "err"
                    ? "text-sm text-danger"
                    : "text-sm text-muted-foreground"
              }
            >
              {msg.text}
            </p>
          ) : null}
          {debug ? (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">My11 response</summary>
              <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-muted/40 p-2">
                {JSON.stringify(debug, null, 2)}
              </pre>
            </details>
          ) : null}
        </div>
      </Card>

      <Card>
        <CardTitle className="mb-3">Paste cookie manually (fallback)</CardTitle>
        <p className="text-xs text-muted-foreground mb-3">
          If OTP doesn’t work, log in on a real browser, copy the cookies from
          DevTools as a single header string (must include <code>SSID=…</code>),
          and paste below.
        </p>
        <div className="flex flex-col gap-3">
          <Textarea
            value={manualCookie}
            onChange={(e) => setManualCookie(e.target.value)}
            placeholder="SSID=...; SSIDuser=...; NA_VISITOR=...; ..."
            rows={4}
            disabled={pending}
          />
          <div>
            <Button
              onClick={saveManual}
              loading={pending}
              disabled={!manualCookie.includes("SSID=")}
            >
              Save cookie
            </Button>
          </div>
        </div>
      </Card>
    </>
  );
}
