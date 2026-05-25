<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Soft-delete policy (project rule)

User-generated content is never hard-deleted in this repo. Every "delete" is a flag update (`deletedAt` / `deletedById`, plus `deletedByName` / `deletedByHandle` on activity rows). Reader queries and badge counts must filter `{ deletedAt: null }`. Deleted comments stay in the activity array and the UI renders a tombstone. Full rule in `.github/context/conventions.md` (section "Soft deletes").

## Theme & responsive (project rule)

**No hardcoded colors.** Use Tailwind utilities backed by theme tokens in `app/globals.css` — `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `text-success|warning|danger`, `bg-primary` etc. For SVG/canvas strings use `rgb(var(--primary))`. Never write hex literals, never `hsl(var(--…))` (tokens are RGB triples). Themes: `sand | paper | mist | halo | ink` (ink = `.dark`). Client `Date.toLocale*()` needs `suppressHydrationWarning`.

**Mobile-first.** Every screen must be designed base-up for phones, then promoted with `sm:` / `md:` / `lg:`. Tables get `overflow-x-auto` or a stacked-card fallback. Modals are bottom-sheets on mobile. Touch targets ≥ `h-9`. Full rules in `.github/context/conventions.md` (sections "Theme" and "Responsive").

