"use server";

import { revalidatePath } from "next/cache";
import { assertFeature } from "@/lib/rbac";
import { connectDB } from "@/lib/db";
import { Settings, invalidateSettingsCache } from "@/models/Settings";
import {
  checkLogin,
  getSessionCookieMeta,
  my11SendOtp,
  my11VerifyOtp,
  saveSessionCookie,
} from "@/lib/my11-api";

const OTP_TTL_MS = 10 * 60 * 1000;

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string; raw?: unknown };

export async function getMy11CookieStatusAction(): Promise<
  ActionResult<{
    hasCookie: boolean;
    loggedIn: boolean;
    expiresAt: string | null;
    ageMs: number | null;
    pendingPhone: string | null;
  }>
> {
  const auth = await assertFeature("my11.cookie.capture");
  if (!auth.ok) return { ok: false, error: auth.error };
  await connectDB();
  const [meta, settings] = await Promise.all([
    getSessionCookieMeta(),
    Settings.findOne().select("+my11OtpState").lean(),
  ]);
  let loggedIn = false;
  if (meta.hasCookie) {
    const probe = await checkLogin().catch(() => ({ loggedIn: false }));
    loggedIn = probe.loggedIn;
  }
  const otp = (settings as unknown as { my11OtpState?: { phone?: string; requestedAt?: Date } | null })?.my11OtpState;
  const fresh = otp?.requestedAt && Date.now() - new Date(otp.requestedAt).getTime() < OTP_TTL_MS;
  return {
    ok: true,
    hasCookie: meta.hasCookie,
    loggedIn,
    expiresAt: meta.expiresAt,
    ageMs: meta.ageMs,
    pendingPhone: fresh && otp?.phone ? otp.phone : null,
  };
}

export async function sendMy11OtpAction(input: {
  phone: string;
  countryCode?: string;
}): Promise<ActionResult<{ flow: "login" | "register"; raw?: unknown }>> {
  const auth = await assertFeature("my11.cookie.capture");
  if (!auth.ok) return { ok: false, error: auth.error };
  const phone = (input.phone || "").replace(/\D/g, "");
  if (phone.length < 6) return { ok: false, error: "Enter a valid phone number." };
  try {
    const res = await my11SendOtp({ phone });
    console.log("[my11-cookie] sendOtp", {
      status: res.status,
      ok: res.ok,
      flow: res.flow,
      raw: res.raw,
    });
    if (!res.ok) {
      const blocked =
        typeof res.raw === "object" &&
        res.raw !== null &&
        (res.raw as { channel_blocked?: boolean }).channel_blocked === true;
      return {
        ok: false,
        error: blocked
          ? "My11 blocked this request (Channel blocked). The server-side OTP flow doesn't work from cloud IPs — please paste the cookie manually instead."
          : `My11 rejected OTP request (HTTP ${res.status}).`,
        raw: res.raw,
      };
    }
    await connectDB();
    await Settings.updateOne(
      {},
      {
        $set: {
          my11OtpState: {
            phone,
            countryCode: input.countryCode || "91",
            cookies: res.cookieHeader,
            verificationId: res.uniqueIdentifier ?? undefined,
            flow: res.flow,
            deviceId: res.deviceId,
            uniqueIdentifier: res.uniqueIdentifier ?? undefined,
            requestedAt: new Date(),
          },
        },
      },
      { upsert: true },
    );
    invalidateSettingsCache();
    return { ok: true, flow: res.flow, raw: res.raw };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function verifyMy11OtpAction(input: {
  otp: string;
}): Promise<ActionResult<{ loggedIn: boolean; capturedCookies: string[] }>> {
  const auth = await assertFeature("my11.cookie.capture");
  if (!auth.ok) return { ok: false, error: auth.error };
  const otp = (input.otp || "").replace(/\D/g, "");
  if (otp.length < 4) return { ok: false, error: "Enter the OTP." };
  await connectDB();
  const settings = await Settings.findOne()
    .select("+my11OtpState")
    .lean<{ my11OtpState?: { phone?: string; countryCode?: string; cookies?: string; flow?: "login" | "register"; deviceId?: string; uniqueIdentifier?: string; requestedAt?: Date } | null }>();
  const state = settings?.my11OtpState;
  if (!state?.phone || !state?.requestedAt || !state?.flow || !state?.deviceId) {
    return { ok: false, error: "Request an OTP first." };
  }
  if (Date.now() - new Date(state.requestedAt).getTime() > OTP_TTL_MS) {
    return { ok: false, error: "OTP expired. Request a new one." };
  }
  try {
    const res = await my11VerifyOtp({
      phone: state.phone,
      otp,
      flow: state.flow,
      deviceId: state.deviceId,
      uniqueIdentifier: state.uniqueIdentifier,
      priorCookies: state.cookies,
    });
    console.log("[my11-cookie] verifyOtp", {
      status: res.status,
      ok: res.ok,
      loggedIn: res.loggedIn,
      cookies: res.capturedCookies,
      raw: res.raw,
    });
    if (!res.ok) {
      return {
        ok: false,
        error: `My11 rejected the OTP (HTTP ${res.status}).`,
        raw: res.raw,
      };
    }
    if (!res.loggedIn) {
      return {
        ok: false,
        error:
          "OTP accepted but no SSID cookie was returned. My11 may have changed its login API — paste the cookie manually as a fallback.",
        raw: res.raw,
      };
    }
    await Settings.updateOne({}, { $set: { my11OtpState: null } });
    invalidateSettingsCache();
    revalidatePath("/settings/my11-cookie");
    return { ok: true, loggedIn: true, capturedCookies: res.capturedCookies };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function saveMy11CookieManualAction(input: {
  cookieHeader: string;
}): Promise<ActionResult<{ loggedIn: boolean }>> {
  const auth = await assertFeature("my11.cookie.capture");
  if (!auth.ok) return { ok: false, error: auth.error };
  const header = (input.cookieHeader || "").trim();
  if (!header.includes("SSID=")) {
    return { ok: false, error: "Cookie string must include SSID=…" };
  }
  try {
    await saveSessionCookie(header);
    const probe = await checkLogin().catch(() => ({ loggedIn: false }));
    revalidatePath("/settings/my11-cookie");
    return { ok: true, loggedIn: probe.loggedIn };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function clearMy11OtpStateAction(): Promise<ActionResult<unknown>> {
  const auth = await assertFeature("my11.cookie.capture");
  if (!auth.ok) return { ok: false, error: auth.error };
  await connectDB();
  await Settings.updateOne({}, { $set: { my11OtpState: null } });
  invalidateSettingsCache();
  return { ok: true };
}
