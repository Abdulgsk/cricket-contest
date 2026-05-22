import { connectDB } from "@/lib/db";
import { BugReport } from "@/models/BugReport";
import { requireUser } from "@/lib/rbac";
import { Card, Badge } from "@/components/ui/card";
import { MyBugResolveForm } from "@/components/my-bug-resolve-form";

type BugStatus = "open" | "in_progress" | "resolved" | "wont_fix";
type Severity = "low" | "medium" | "high";

const severityTone = (s: Severity) =>
  s === "high" ? "danger" : s === "medium" ? "warning" : "default";

const statusTone = (s: BugStatus) =>
  s === "open"
    ? "warning"
    : s === "in_progress"
      ? "accent"
      : s === "resolved"
        ? "success"
        : "default";

export default async function MyBugsPage() {
  const me = await requireUser();
  await connectDB();

  const bugs = await BugReport.find({ assignedTo: me._id })
    .sort({ status: 1, createdAt: -1 })
    .limit(200)
    .lean();

  const open = bugs.filter((b) => b.status === "open" || b.status === "in_progress");
  const closed = bugs.filter((b) => b.status === "resolved" || b.status === "wont_fix");

  return (
    <div className="space-y-4">
      <Card className="border-border/70">
        <h1 className="text-lg font-semibold">My bugs</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Bugs that admins have assigned to you. Mark them resolved with a short note describing your fix.
        </p>
      </Card>

      <section className="space-y-2.5">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          To do ({open.length})
        </div>
        {open.length === 0 ? (
          <Card className="text-sm text-muted-foreground border-border/70">
            Nothing on your plate. 🎉
          </Card>
        ) : (
          open.map((b) => (
            <Card key={String(b._id)} className="border-border/70 space-y-2.5">
              <div className="flex items-start gap-2 flex-wrap">
                <h2 className="font-semibold text-sm">{b.title}</h2>
                <Badge tone={severityTone(b.severity)}>{b.severity}</Badge>
                <Badge tone={statusTone(b.status)}>{b.status.replace("_", " ")}</Badge>
              </div>
              <div className="text-[11px] text-muted-foreground">
                from <span className="text-foreground">{b.reporterName ?? "—"}</span>{" "}
                <span className="opacity-70">@{b.reporterHandle ?? "—"}</span> ·{" "}
                {new Date(b.createdAt).toLocaleString()}
                {b.pageUrl ? <span className="ml-1">· {b.pageUrl}</span> : null}
              </div>
              <div className="text-sm whitespace-pre-wrap text-foreground/90">
                {b.description}
              </div>
              {b.adminNotes ? (
                <div className="rounded-lg border border-border/60 bg-muted/40 p-2.5 text-xs">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                    Admin note
                  </div>
                  <div className="whitespace-pre-wrap text-foreground/90">{b.adminNotes}</div>
                </div>
              ) : null}
              <MyBugResolveForm id={String(b._id)} />
            </Card>
          ))
        )}
      </section>

      {closed.length > 0 && (
        <section className="space-y-2.5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Closed ({closed.length})
          </div>
          {closed.map((b) => (
            <Card key={String(b._id)} className="border-border/70 space-y-2 opacity-90">
              <div className="flex items-start gap-2 flex-wrap">
                <h2 className="font-semibold text-sm">{b.title}</h2>
                <Badge tone={severityTone(b.severity)}>{b.severity}</Badge>
                <Badge tone={statusTone(b.status)}>{b.status.replace("_", " ")}</Badge>
              </div>
              <div className="text-[11px] text-muted-foreground">
                resolved {b.resolvedAt ? new Date(b.resolvedAt).toLocaleString() : ""}
              </div>
              {b.resolutionNote ? (
                <div className="rounded-lg border border-success/30 bg-success/5 p-2.5 text-xs">
                  <div className="text-[10px] uppercase tracking-wider text-success font-semibold mb-1">
                    Your resolution note
                  </div>
                  <div className="whitespace-pre-wrap text-foreground/90">{b.resolutionNote}</div>
                </div>
              ) : null}
            </Card>
          ))}
        </section>
      )}
    </div>
  );
}
