import Link from "next/link";
import { Card, Badge } from "@/components/ui/card";

export type AuditRow = {
  _id: string;
  createdAt: string;
  category?: string;
  action: string;
  actorHandle?: string | null;
  actorUsername?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  meta?: Record<string, unknown> | null;
  ip?: string | null;
};

export type AuditFilter = {
  category?: string;
  action?: string;
  actor?: string;
  page?: string;
};

export function AuditLogPanel({
  rows,
  total,
  page,
  totalPages,
  distinctActions,
  filter,
}: {
  rows: AuditRow[];
  total: number;
  page: number;
  totalPages: number;
  distinctActions: string[];
  filter: AuditFilter;
}) {
  const queryString = (overrides: Record<string, string | undefined>) => {
    const next = { tab: "audit", ...filter, ...overrides };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, String(v));
    }
    const s = params.toString();
    return s ? `?${s}` : "";
  };

  const hasFilter = !!(filter.category || filter.action || filter.actor);

  return (
    <div className="space-y-4">
      <Card className="border-border/70">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">Audit log</h2>
            <p className="text-xs text-muted-foreground mt-1">
              {total.toLocaleString()} event{total === 1 ? "" : "s"} · showing page {page} of {totalPages}.
            </p>
          </div>
        </div>

        <form className="mt-4 flex flex-wrap gap-2 items-end" action="/developer" method="get">
          {/* preserve the active tab on submit */}
          <input type="hidden" name="tab" value="audit" />
          <div>
            <label className="block text-[10px] uppercase text-muted-foreground tracking-wider">Category</label>
            <select
              name="category"
              defaultValue={filter.category ?? ""}
              className="h-9 rounded-lg border border-border bg-card px-2 text-xs"
            >
              <option value="">All</option>
              <option value="create">create</option>
              <option value="update">update</option>
              <option value="delete">delete</option>
              <option value="auth">auth</option>
              <option value="action">action</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase text-muted-foreground tracking-wider">Action</label>
            <select
              name="action"
              defaultValue={filter.action ?? ""}
              className="h-9 rounded-lg border border-border bg-card px-2 text-xs min-w-[160px]"
            >
              <option value="">All</option>
              {distinctActions.sort().map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase text-muted-foreground tracking-wider">Actor handle/name</label>
            <input
              name="actor"
              defaultValue={filter.actor ?? ""}
              placeholder="e.g. mithun"
              className="h-9 rounded-lg border border-border bg-card px-2 text-xs"
            />
          </div>
          <button
            type="submit"
            className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium"
          >
            Apply
          </button>
          {hasFilter && (
            <Link
              href="/developer?tab=audit"
              className="h-9 px-3 inline-flex items-center rounded-lg border border-border text-xs"
            >
              Clear
            </Link>
          )}
        </form>
      </Card>

      <Card className="border-border/70">
        {/* Mobile: stacked cards */}
        <div className="md:hidden space-y-2">
          {rows.length === 0 && (
            <div className="p-6 text-center text-muted-foreground text-sm">
              No events match these filters.
            </div>
          )}
          {rows.map((r) => (
            <div
              key={r._id}
              className="rounded-xl border border-border/60 bg-card/70 p-3 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-[11px] text-muted-foreground">
                  {new Date(r.createdAt).toLocaleString()}
                </div>
                <Badge tone={categoryTone(r.category)}>{r.category ?? "action"}</Badge>
              </div>
              <div className="text-xs font-mono break-all">{r.action}</div>
              <div className="flex items-center justify-between text-[11px] gap-2">
                <div className="min-w-0">
                  {r.actorUsername || r.actorHandle ? (
                    <>
                      <div className="font-medium truncate">{r.actorUsername ?? "—"}</div>
                      {r.actorHandle && (
                        <div className="text-[10px] text-muted-foreground truncate">@{r.actorHandle}</div>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">system / anon</span>
                  )}
                </div>
                {r.targetType && (
                  <div className="text-right text-[10px] text-muted-foreground">
                    <div>{r.targetType}</div>
                    {r.targetId && <div className="break-all">{r.targetId}</div>}
                  </div>
                )}
              </div>
              {r.meta && (
                <details className="text-[11px] text-muted-foreground">
                  <summary className="cursor-pointer select-none">Details</summary>
                  <pre className="mt-1.5 whitespace-pre-wrap break-all">{safeStringify(r.meta)}</pre>
                </details>
              )}
            </div>
          ))}
        </div>

        {/* Desktop: table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr className="text-left">
                <th className="p-2">When</th>
                <th className="p-2">Actor</th>
                <th className="p-2">Category</th>
                <th className="p-2">Action</th>
                <th className="p-2">Target</th>
                <th className="p-2">Details</th>
                <th className="p-2 hidden lg:table-cell">IP</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground text-sm">
                    No events match these filters.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r._id} className="border-t border-border/40 align-top">
                  <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td className="p-2 text-xs">
                    {r.actorUsername || r.actorHandle ? (
                      <>
                        <div className="font-medium">{r.actorUsername ?? "—"}</div>
                        {r.actorHandle && (
                          <div className="text-[10px] text-muted-foreground">@{r.actorHandle}</div>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">system / anon</span>
                    )}
                  </td>
                  <td className="p-2">
                    <Badge tone={categoryTone(r.category)}>{r.category ?? "action"}</Badge>
                  </td>
                  <td className="p-2 text-xs font-mono">{r.action}</td>
                  <td className="p-2 text-[11px]">
                    {r.targetType ? (
                      <>
                        <div>{r.targetType}</div>
                        {r.targetId && (
                          <div className="text-[10px] text-muted-foreground break-all">{r.targetId}</div>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-2 text-[11px] text-muted-foreground max-w-[360px] truncate">
                    {r.meta ? safeStringify(r.meta) : "—"}
                  </td>
                  <td className="p-2 hidden lg:table-cell text-[10px] text-muted-foreground">
                    {r.ip ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-2 pt-3 text-xs">
            <div className="text-muted-foreground">
              Page {page} of {totalPages}
            </div>
            <div className="flex gap-2">
              <Link
                href={page > 1 ? `/developer${queryString({ page: String(page - 1) })}` : "#"}
                className={`px-3 py-1.5 rounded-lg border border-border ${
                  page > 1 ? "hover:bg-muted/50" : "opacity-40 pointer-events-none"
                }`}
              >
                ← Prev
              </Link>
              <Link
                href={
                  page < totalPages
                    ? `/developer${queryString({ page: String(page + 1) })}`
                    : "#"
                }
                className={`px-3 py-1.5 rounded-lg border border-border ${
                  page < totalPages ? "hover:bg-muted/50" : "opacity-40 pointer-events-none"
                }`}
              >
                Next →
              </Link>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function categoryTone(c?: string): "default" | "accent" | "warning" | "danger" {
  switch (c) {
    case "create":
      return "accent";
    case "update":
      return "default";
    case "delete":
      return "danger";
    case "auth":
      return "warning";
    default:
      return "default";
  }
}

function safeStringify(meta: Record<string, unknown>): string {
  try {
    return JSON.stringify(meta);
  } catch {
    return "[unserialisable]";
  }
}
