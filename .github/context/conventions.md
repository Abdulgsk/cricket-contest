# Conventions

## TypeScript

- `strict: true`. Don't add `any` — narrow with `unknown` + type guards.
- Mongoose: type both the doc interface and the schema (see existing models).
- Server Action return type: `ActionResult<T> = ({ ok: true } & T) | { ok: false; error: string }`.

## Server vs Client components

- **Server by default.** Add `"use client"` only when needed (state, effects, browser APIs, event handlers, sonner toasts).
- Page files (`app/**/page.tsx`) and `layout.tsx` should be server components and call `requireUser()` / `requireRole(...)` directly.
- Data fetching is just `await connectDB(); await Model.find(...).lean()`. No client-side data fetch for SSR pages.

## Mutations

- Always via Server Actions in `actions/*.ts`.
- Validate with Zod schemas.
- `revalidatePath(...)` for every path whose SSR data is now stale.
- Return `{ ok: false, error }` with **user-friendly** messages — they're shown verbatim in `toast.error`.

## API routes

- `export const dynamic = "force-dynamic"` if you touch cookies/DB on every request.
- Return `NextResponse.json(...)`.
- Always handle `My11AuthError` / `My11NotReadyError` and return a friendly `{ ok: false, error: "..." }`.

## Toasts

- `sonner` — `import { toast } from "sonner"`. `toast.success` / `toast.error`. Don't `alert()`.

## UI primitives

Live in `components/ui/`:
- `Card` — default panel; `border-border/70 bg-card`
- `Button` — variants `default | outline | glow | destructive`; sizes `sm | md`
- `Input`, `Label`, `Badge`, `Spinner`

## Theme (HARD RULE — no hardcoded colors)

Themes are class-based on `<html>`: `theme-sand | theme-paper | theme-mist | theme-halo | theme-ink`. Only `ink` also carries `.dark`. The active theme is bootstrapped in `app/layout.tsx` via an inline script reading `localStorage.theme`.

Tokens live in `app/globals.css` as space-separated RGB triples under each `.theme-*` block: `--background --foreground --card --card-foreground --primary --primary-foreground --accent --muted --muted-foreground --border --ring --success --warning --danger`. Tailwind maps them via `@theme inline` so use the utility classes — never hex / rgb / hsl literals:

- Surfaces: `bg-background`, `bg-card`, `bg-muted`, `bg-popover`, `bg-primary`
- Text: `text-foreground`, `text-muted-foreground`, `text-primary`, `text-success`, `text-warning`, `text-danger`
- Borders / focus: `border-border`, `ring-ring`, `focus-visible:ring-ring`
- Opacity ramps: `bg-primary/15`, `border-border/60` — always vary the token, not the color

For inline SVG `stroke` / `fill`, canvas, or anywhere a string is required, use `rgb(var(--primary))` etc. **Do not** use `hsl(var(--primary))` (tokens are RGB triples, not HSL). **Do not** add fallback hex colors (`#22c55e`) — let the token resolve.

When introducing a new theme, every existing token must be defined for it; missing tokens fall back to `:root` (sand) which silently breaks dark themes.

Native form controls (`<input type="date">`, `<select>`, scrollbars) follow the theme via `color-scheme: dark` on `.dark` (set globally in `globals.css`). The webkit calendar indicator is force-inverted there too — don't override per-input.

Hydration: any `Date.toLocale*()` rendering must add `suppressHydrationWarning` on the wrapping element — the server renders UTC, the client renders local.

## Responsive (HARD RULE — every screen mobile-first)

Breakpoints (Tailwind defaults): `sm: 640px`, `md: 768px`, `lg: 1024px`, `xl: 1280px`. Design **mobile-first**: base classes target mobile, then add `sm:` / `md:` / `lg:` overrides for wider viewports.

- **Layout**: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3` — never assume horizontal real-estate. Tables get a wrapping `overflow-x-auto` or a stacked `md:hidden` card fallback for mobile (see audit log panel for the pattern).
- **Typography**: `text-base sm:text-lg` etc. — never lock to a fixed pixel size that's too small for phones (`text-xs` is the floor; for hint text use `text-[11px]` sparingly).
- **Spacing**: `p-3 sm:p-4` / `gap-2 sm:gap-4`. Padding should shrink on mobile.
- **Modals**: bottom-sheet on phones, centered on desktop — `items-end sm:items-center`, `rounded-t-2xl sm:rounded-2xl`, `slide-in-from-bottom-4 sm:slide-in-from-top-1`.
- **Tabs / pills**: wrap with `overflow-x-auto scrollbar-thin` so they don't blow out the viewport. Buttons keep `whitespace-nowrap`.
- **Touch targets**: minimum `h-9` (36px) for tappable controls. Avoid icon-only buttons under `h-8`.
- **Images / charts**: use `viewBox + preserveAspectRatio="none"` for sparklines and `w-full` containers — never set fixed pixel widths.
- **Navigation**: the sidebar collapses to a sheet under `md`. New top-level routes must be added to `NAV` in `components/nav.tsx` (auto-responsive).

## Premium UI patterns

- Card surfaces: `rounded-xl`, `border border-border/60`, sometimes `bg-gradient-to-br from-X/15 to-X/5`
- Backdrops for modals: `bg-black/70 backdrop-blur-md`
- Modal containers: `rounded-2xl border border-white/10 bg-popover/90 backdrop-blur-xl shadow-2xl ring-1 ring-black/10`
- Section headers in panels: `text-[10px] uppercase tracking-wider text-muted-foreground`
- Animations: `tailwindcss-animate` classes — `animate-in fade-in slide-in-from-top-1 duration-200` etc.
- Mobile: prefer bottom-sheet (`items-end sm:items-center`, `rounded-t-2xl sm:rounded-2xl`, `slide-in-from-bottom-4`).
- Always lock body scroll when a modal opens: `document.body.style.overflow = "hidden"` + cleanup.

## Polling

```ts
const visibleRef = useRef(true);
useEffect(() => {
  const onVis = () => { visibleRef.current = !document.hidden; if (!document.hidden) void load(); };
  document.addEventListener("visibilitychange", onVis);
  const id = window.setInterval(() => { if (visibleRef.current) void load(); }, refreshMs);
  return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
}, [refreshMs]);
```

## Error handling

- DB errors: log + return `{ ok: false, error: "Something went wrong" }`.
- My11 errors: narrow on `instanceof My11AuthError` / `My11NotReadyError`; map to friendly text.
- Don't swallow validation errors silently — propagate to the toast.

## Soft deletes (HARD RULE)

**Nothing the user generates is ever hard-deleted.** All "delete" actions are reversible flags:

- **Top-level docs** (`BugReport`, `WorkItem`) carry `deletedAt: Date | null` (indexed) and `deletedById: ObjectId | null`. Deletion = `updateOne({ _id, deletedAt: null }, { $set: { deletedAt: new Date(), deletedById: me._id } })`. Never `deleteOne` / `deleteMany` user content.
- **Embedded activity rows** (comments, system events in `bug.activity[]` / `workItem.activity[]`) carry `deletedAt`, `deletedById`, `deletedByName`, `deletedByHandle`. Deletion = `updateOne({ _id, "activity._id": new ObjectId(activityId) }, { $set: { "activity.$.deletedAt": now, "activity.$.deletedById": me._id, "activity.$.deletedByName": me.username, "activity.$.deletedByHandle": me.userId, "activity.$.text": "", "activity.$.mentions": [], "activity.$.reactions": [] } })`. The row stays in the array so thread ordering and permalinks survive. The UI renders a tombstone ("This message was deleted").
- **All list / detail queries** must include `{ deletedAt: null }` in their filter. This applies to:
  - `BugReport.find` / `findOne` / `findById` for reader paths.
  - `WorkItem.find` / `findOne` / `findById` for reader paths.
  - Every `countDocuments` used for badge counts (sidebar, admin tabs, developer dashboard).
  - CSV exports, duplicate-search, related-bug lookups.
- **Mutation paths** (assign, comment, status change) may continue using `findById` without the filter, since soft-deleted docs are not surfaced in any UI — but a top-level `deletedAt` check inside the mutation is welcome as defence-in-depth.
- **Idempotency**: comment-delete actions should treat an already-deleted activity as `{ ok: true }` (no-op) instead of erroring.
- **Audit**: every soft-delete writes `recordAudit({ category: "delete", action: "bug.report.delete" | "bug.comment.delete" | "workitem.delete" | "workitem.comment.delete", ... })`.
- **Subdoc `_id` cast**: when matching by activity `_id`, always wrap the string in `new mongoose.Types.ObjectId(...)`. Mongoose does not always auto-cast string IDs inside positional subdoc filters.

## Date / format helpers

- `lib/utils.ts::formatDate(date)` — IST-friendly display
- `lib/team-logos.ts` + `components/team-logo.tsx` — IPL team icons

## File link conventions in chat

Use markdown links with workspace-relative paths. Never wrap file paths in backticks. Examples:
- `[services/scoring.ts](services/scoring.ts)`
- `[lib/constants.ts](lib/constants.ts#L20-L30)`

## Pre-push checklist

1. `npm run build` passes (catches TS + Turbopack errors)
2. `npm run lint` clean
3. New env vars added to `.env.example`
4. Migrations / one-off scripts under `scripts/` with `:dry` and `:apply` variants
5. Touched a scoring rule? Re-run `npm run audit:history:points` and consider a backfill script

## What NOT to do

- Don't add `bcrypt` to passwords without explicit instruction.
- Don't move auth/role checks into `proxy.ts` based on JWT role (it can be stale).
- Don't read `UserMatchTeam.my11Username` as authoritative — read `User.my11circleName`.
- Don't put scoring math in components.
- Don't `alert()` / `confirm()` — use custom UI panels.
- Don't add real-world cricket stats to AI prompts. Only payload-derived numbers.
- Don't bypass the contest TTL cache with raw `fetchLeaderboardFromContestUrl` from a client-polled route.
