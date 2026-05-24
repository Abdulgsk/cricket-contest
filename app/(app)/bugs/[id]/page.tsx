import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser, userCan } from "@/lib/rbac";
import { getBugDetail } from "@/services/bug-detail";
import { BugDetailPanel } from "@/components/bug/bug-detail-panel";
import { BugActionBar } from "@/components/bug/bug-action-bar";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";

export const dynamic = "force-dynamic";

export default async function BugPermalinkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await requireUser();

  const bug = await getBugDetail(id);
  if (!bug) notFound();

  const canManage = userCan(me, "bugs.manage");
  const isReporter = bug.reporter.id === String(me._id);
  const isAssignee = bug.assignee?.id === String(me._id);

  // Anyone with the Developer flag (or who's directly involved) can view
  // and comment. Action buttons appear only for assignees / managers.
  if (
    !isReporter &&
    !isAssignee &&
    !canManage &&
    !userCan(me, "dev.member")
  ) {
    redirect("/dashboard");
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
