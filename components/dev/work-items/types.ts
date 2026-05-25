/**
 * Shared types for the work-items UI.
 *
 * Kept lean: `WorkItemRow` is the projection the server hands the panel —
 * everything the UI needs without re-fetching. Add new fields here when the
 * server projection grows.
 */

import type { ActivityEntry } from "@/components/activity-thread";

export type Status = "open" | "in_progress" | "blocked" | "done";
export type Priority = "low" | "medium" | "high";
export type SubmissionKind = "done" | "blocked" | "wont_do";
export type ViewMode = "list" | "board" | "table" | "calendar" | "mine";

export type WorkItemSubmission = {
  kind: SubmissionKind;
  note: string;
  submittedAt: string;
  submittedByHandle: string;
  submittedByName: string;
};

export type SubtaskRow = {
  id: string;
  text: string;
  done: boolean;
};

export type AttachmentRow = {
  id: string;
  name: string;
  dataUrl: string;
  mime: string;
  bytes: number;
};

export type WorkItemRow = {
  id: string;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  createdByName: string;
  createdByHandle: string;
  assignedToId: string;
  assignedToName: string;
  assignedToHandle: string;
  dueAt: string | null;
  createdAt: string;
  tags: string[];
  order: number;
  storyPoints: number | null;
  watcherCount: number;
  subtasks: SubtaskRow[];
  attachments: AttachmentRow[];
  submission: WorkItemSubmission | null;
  needsReview: boolean;
  activity: ActivityEntry[];
};

export type WorkItemAssignee = { id: string; name: string; handle: string };

export type SavedView = {
  id: string;
  name: string;
  view: ViewMode;
  filters: Record<string, unknown>;
};

export type Filters = {
  status: Status[];
  priority: Priority[];
  assigneeIds: string[];
  tags: string[];
  search: string;
  /** "mine" / "unassigned" / "overdue" / "review" pre-baked filters. */
  quick: "all" | "mine" | "unassigned" | "overdue" | "review";
};

export const DEFAULT_FILTERS: Filters = {
  status: [],
  priority: [],
  assigneeIds: [],
  tags: [],
  search: "",
  quick: "all",
};
