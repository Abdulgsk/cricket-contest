/**
 * Thin re-export so existing import paths keep working. The real panel and
 * supporting components live under `./work-items/`.
 */
export {
  WorkItemsPanel,
  type WorkItemRow,
  type WorkItemAssignee,
  type SavedView,
} from "./work-items/panel";
