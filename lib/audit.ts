import { headers } from "next/headers";
import { AuditLog, type AuditCategory } from "@/models/AuditLog";
import type { IUser } from "@/models/User";

export type AuditActor =
  | (Partial<Pick<IUser, "_id" | "userId" | "username">> & { _id?: unknown })
  | null
  | undefined;

export type AuditInput = {
  action: string;
  category?: AuditCategory;
  actor?: AuditActor;
  /** Override actor identity (used for anonymous auth events). */
  actorId?: string | null;
  actorHandle?: string | null;
  actorUsername?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  meta?: Record<string, unknown>;
};

/**
 * Best-effort audit logger. Never throws — failures are logged to console so
 * the calling action/route keeps working.
 *
 * Note: `actor` is the preferred input (typically the user returned by
 * `requireUser()`); for anonymous auth events pass nothing and the function
 * will still write a row with `actorId: null`.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    let ip: string | null = null;
    let userAgent: string | null = null;
    try {
      const h = await headers();
      ip =
        h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        h.get("x-real-ip") ||
        null;
      userAgent = h.get("user-agent");
    } catch {
      // `headers()` is only available in a request scope; ignore otherwise.
    }
    await AuditLog.create({
      actorId: (input.actorId ?? (input.actor?._id as unknown) ?? null) as
        | string
        | null,
      actorHandle: input.actorHandle ?? input.actor?.userId ?? null,
      actorUsername: input.actorUsername ?? input.actor?.username ?? null,
      category: input.category ?? "action",
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      meta: input.meta,
      ip,
      userAgent,
    });
  } catch (err) {
    // Don't break the request because the audit insert failed.
    // eslint-disable-next-line no-console
    console.error("[audit] failed to record", input.action, err);
  }
}
