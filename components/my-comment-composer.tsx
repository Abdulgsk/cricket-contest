"use client";

import { CommentComposer } from "@/components/comment-composer";
import { addBugCommentAction } from "@/actions/bugs";
import { addWorkItemCommentAction } from "@/actions/work-items";

/**
 * Thin client wrapper so the server-rendered `/my-bugs` page can pick the
 * right server action by kind without importing both into a server component.
 */
export function MyCommentComposer({
  id,
  kind,
}: {
  id: string;
  kind: "bug" | "workitem";
}) {
  const onSend =
    kind === "bug" ? addBugCommentAction : addWorkItemCommentAction;
  return (
    <CommentComposer
      id={id}
      onSend={async (p) => onSend(p)}
      placeholder="Reply to the thread… (Enter to send)"
    />
  );
}
