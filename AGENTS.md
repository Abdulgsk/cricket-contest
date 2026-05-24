<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Soft-delete policy (project rule)

User-generated content is never hard-deleted in this repo. Every "delete" is a flag update (`deletedAt` / `deletedById`, plus `deletedByName` / `deletedByHandle` on activity rows). Reader queries and badge counts must filter `{ deletedAt: null }`. Deleted comments stay in the activity array and the UI renders a tombstone. Full rule in `.github/context/conventions.md` (section "Soft deletes").
