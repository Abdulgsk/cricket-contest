import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  downloadMiniBrowserState,
  getMiniBrowserSessionStatus,
  getMiniBrowserRuntimeStatus,
  proxyMy11Request,
  startMiniBrowserLogin,
  uploadMiniBrowserState,
} from "@/lib/my11-mini-browser";

interface ProxyBody {
  action: "runtimeStatus" | "sessionStatus" | "requestJson" | "startLogin" | "uploadState" | "downloadState";
  url?: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
  state?: unknown;
}

function isAllowedMy11Url(value: string) {
  try {
    const url = new URL(value);
    return ["my11circle.com", "www.my11circle.com"].includes(url.hostname);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.userId || !["admin", "superadmin"].includes(session.role)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as ProxyBody;

    if (body.action === "runtimeStatus") {
      const data = await getMiniBrowserRuntimeStatus();
      return NextResponse.json({ ok: true, data });
    }

    if (body.action === "sessionStatus") {
      const data = await getMiniBrowserSessionStatus();
      return NextResponse.json({ ok: true, data });
    }

    if (body.action === "startLogin") {
      const data = await startMiniBrowserLogin();
      return NextResponse.json({ ok: true, data });
    }

    if (body.action === "uploadState") {
      const data = await uploadMiniBrowserState(body.state);
      return NextResponse.json({ ok: true, data });
    }

    if (body.action === "downloadState") {
      const data = await downloadMiniBrowserState();
      return NextResponse.json({ ok: true, data });
    }

    if (body.action !== "requestJson") {
      return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
    }

    if (!body.url || !isAllowedMy11Url(body.url)) {
      return NextResponse.json(
        { ok: false, error: "Only my11circle.com URLs are allowed" },
        { status: 400 }
      );
    }

    const data = await proxyMy11Request({
      url: body.url,
      method: body.method ?? "GET",
      headers: body.headers,
      body: body.body,
      responseType: "json",
    });

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
