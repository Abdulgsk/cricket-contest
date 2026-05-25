import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser, userCan } from "@/lib/rbac";
import { getBugDetail } from "@/services/bug-detail";
import { BugDetailPanel } from "@/components/bug/bug-detail-panel";
import { BugActionBar } from "@/components/bug/bug-action-bar";
import { BugCongratsCard } from "@/components/bug/bug-congrats-card";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";

export const dynamic = "force-dynamic";

export default async function BugPermalinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const viewRaw = sp.view;
  const view = Array.isArray(viewRaw) ? viewRaw[0] : viewRaw;
  const me = await requireUser();

  const bug = await getBugDetail(id);
  if (!bug) notFound();

  const canManage = userCan(me, "dev.bug.manage");
  const isReporter = bug.reporter.id === String(me._id);
  const isAssignee = bug.assignee?.id === String(me._id);
  const isDeveloperMember = userCan(me, "dev.member");

  // Anyone with the Developer flag (or who's directly involved) can view
  // and comment. Action buttons appear only for assignees / managers.
  if (
    !isReporter &&
    !isAssignee &&
    !canManage &&
    !isDeveloperMember
  ) {
    redirect("/dashboard");
  }

  // Reporters of a CLOSED bug see the celebration card by default — even
  // managers/developers, because when you open YOUR OWN closed bug the
  // intent is "see the outcome", not "triage". Managers/devs can switch
  // to the full dev panel with ?view=dev (link is rendered on the card).
  const isClosed = bug.status === "resolved" || bug.status === "wont_fix";
  const showCongrats = isReporter && isClosed && view !== "dev";

  if (showCongrats) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-background to-muted/20">
        <BugCongratsCard
          bug={{
            id: bug.id,
            title: bug.title,
            status: bug.status as "resolved" | "wont_fix",
            resolvedAt: bug.resolvedAt,
            createdAt: bug.createdAt,
            assignee: bug.assignee
              ? { name: bug.assignee.name, handle: bug.assignee.handle }
              : null,
            submission: bug.submission
              ? {
                  kind: bug.submission.kind,
                  note: bug.submission.note,
                  submittedByName: bug.submission.submittedByName,
                  submittedAt: bug.submission.submittedAt,
                }
              : null,
          }}
          backHref={
            canManage || isDeveloperMember ? `/bugs/${bug.id}?view=dev` : "/dashboard"
          }
          backLabel={canManage || isDeveloperMember ? "Open full view" : "Dashboard"}
        />
      </div>
    );
  }

  let assignables: Array<{ id: string; handle: string; name: string }> = [];
  if (canManage) {
    await connectDB();
    const rows = await User.find({}).select("userId username").sort({ username: 1 }).lean();
    assignables = rows.map((u) => ({
      id: String(u._id),
      handle: u.userId,
      name: u.username,
    }));
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-background to-muted/20">
      <div className="mx-auto max-w-3xl px-3 pt-3 sm:px-6 sm:pt-4">
        <div className="mb-2 flex items-center gap-2 text-[12px] text-muted-foreground">
          <Link
            href={canManage ? "/developer?tab=bugs" : "/developer"}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {canManage ? "Bug queue" : "Developer"}
          </Link>
        </div>
      </div>
      <BugDetailPanel
        bug={bug}
        myUserId={String(me._id)}
        canManage={canManage}
        actions={
          isAssignee || canManage ? (
            <BugActionBar
              bug={bug}
              myUserId={String(me._id)}
              canManage={canManage}
              assignables={assignables}
            />
          ) : null
        }
      />
    </div>
  );
}
