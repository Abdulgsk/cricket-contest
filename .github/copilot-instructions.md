# GitHub Copilot Instructions — Cricket Contest

> Read this first on every fresh session. Then read the matching deep-dive file in `.github/context/` for the area you're working in.

## What this app is

A private fantasy cricket league management app for **13 friends**. Members play Dream11 / My11Circle externally; this app tracks everything around it: scoring, bonuses, penalties, predictions, rivalries, Civil War team battles, leaderboards, contests view of live my11 teams, analytics, AI-generated daily storylines, and full admin tooling.

## ⚠️ Stack notes that contradict training data

- **Next.js 16.2.6** with App Router + Turbopack. APIs differ from older versions. If unsure, read `node_modules/next/dist/docs/` before writing code.
- **Middleware is `proxy.ts`** at the repo root (was `middleware.ts` in 15.x). Export is `proxy()`, not `middleware()`.
- **Tailwind v4** — no `tailwind.config.js`. Theme is defined in `app/globals.css`.
- **React 19** — server components are the default; mark client components with `"use client"`.
- **Mongoose 9** — connection cached in `lib/db.ts`.
- **Plain-text passwords** stored in `User.password` (explicit league policy — do NOT add bcrypt without being asked).
- **Single dynamic param syntax**: `params: Promise<{ id: string }>` then `await params`.

## File-layout overview

```
app/
  (auth)/       login, signup, forgot-password
  (app)/        protected shell (dashboard, leaderboard, matches, predictions,
                profile, rules, analytics, contests, rivalry, players, admin)
  api/          REST endpoints (admin tools, contests, civil-war live,
                cron, players)
actions/        Server Actions ("use server") — only entry point for mutations
services/       Domain logic: scoring, prediction-engine, facts, civil-war,
                contest, ipl-sync, match-status, facts-ai, facts-analyzer,
                my11-name-verify
models/         Mongoose schemas (User, Role, Match, MatchResult, Prediction,
                Rivalry, CivilWar, CustomPool, BonusAuditLog,
                PredictionAuditLog, DailyFact, Notification, AuditLog,
                Settings, UserMatchTeam)
lib/            db, env, session, rbac, my11-api, my11circle, features,
                match-locks, constants, team-logos, utils, whatsapp,
                civil-war-breakdown
components/     UI primitives + page-level components (admin/, contest/,
                match/, rivalry/, ui/)
proxy.ts        Auth gate + path header injection
vercel.json     Single cron: /api/cron/daily-sync at 00:30 UTC
scripts/        One-off maintenance scripts (node .mjs)
```

## Hard rules

1. **Never put scoring logic on the client.** All point math lives in `services/scoring.ts`, `services/prediction-engine.ts`, `services/civil-war.ts`.
2. **Mutations go through `actions/*.ts`** (Server Actions). API routes are for reads, external integrations (my11, cron) and admin tools.
3. **Auth & RBAC via `lib/rbac.ts`** — `requireUser()`, `requireRole("superadmin")`, `requireAdminFeature(featureKey)`, `requireAdminAccess()`. Features are listed in `lib/features.ts::FEATURE_DEFS` (with label, description, group, sensitive flag). Only `"user"` and `"superadmin"` are usable system roles — the legacy `"admin"` role is inert. Everything in between is custom roles (`models/Role.ts`) or per-user grants stored in `User.permissionBitmap` (BigInt-as-string bitmask; legacy `enabledFeatures` array is read-only fallback). Edit them in the master-detail editor at `/admin/permissions` — never dual-write the legacy arrays.
4. **Mongo connection** — every entry point that touches the DB must `await connectDB()` from `lib/db.ts`.
5. **My11 calls** — go through `lib/my11-api.ts`. Live data; never DB-cached in a way that breaks freshness. Throws `My11AuthError`, `My11NotReadyError` — handle them.
6. **Scoring constants** live in `lib/constants.ts` (`RANK_POINTS`, `BONUSES`, `PENALTIES`, `PREDICTION_POINTS`, `MAX_BONUS_PER_MATCH`, `TOTAL_PLAYERS=13`). Don't hardcode numbers elsewhere.
7. **Single source of truth = `User.my11circleName`**. Denormalised copies (e.g. `UserMatchTeam.my11Username`) are kept in sync by the action that writes the name. Never read from copies as authoritative.
8. **Anti-hallucination AI** — every number in an AI fact must exist in the verified payload. See `services/facts-ai.ts::validateFacts`.
9. **Don't bypass admin approval flows** — my11 name changes, rivalry withdrawals, prediction resets all have explicit admin queues.
10. **No emojis in code unless they already exist in surrounding context** (UI uses some). Don't sprinkle them.
11. **Deletes are soft.** Never call `deleteOne`/`deleteMany`/`$pull` on user-generated content (`BugReport`, `WorkItem`, their embedded `activity[]`). Set `deletedAt`/`deletedById` (and `deletedByName`/`deletedByHandle` on activity rows); clear `text`/`mentions`/`reactions` on deleted comments. Every reader query and `countDocuments` must include `{ deletedAt: null }`. Deleted activity rows stay in the array and render as tombstones in the thread. See [.github/context/conventions.md#soft-deletes-hard-rule](.github/context/conventions.md#soft-deletes-hard-rule).
12. **No hardcoded colors — always use theme tokens.** Use `bg-*` / `text-*` / `border-*` utilities backed by CSS vars in `app/globals.css` (`--background --foreground --card --primary --muted --border --success --warning --danger` etc.). For inline SVG/canvas strings use `rgb(var(--primary))` — never hex literals, never `hsl(var(...))` (tokens are RGB). Themes: `sand | paper | mist | halo | ink` (ink is `.dark`). Native form controls follow `color-scheme` globally. Any `Date.toLocale*()` in client code needs `suppressHydrationWarning`. See [.github/context/conventions.md#theme-hard-rule--no-hardcoded-colors](.github/context/conventions.md#theme-hard-rule--no-hardcoded-colors).
13. **Mobile-first responsive — every screen.** Base classes target mobile; add `sm:` / `md:` / `lg:` for wider viewports. Tables get `overflow-x-auto` or a `md:hidden` stacked-card fallback. Modals are bottom-sheets on mobile, centered on desktop. Touch targets ≥ `h-9`. Never assume horizontal real-estate or fixed pixel widths. See [.github/context/conventions.md#responsive-hard-rule--every-screen-mobile-first](.github/context/conventions.md#responsive-hard-rule--every-screen-mobile-first).

## Build / dev commands

```bash
npm run dev              # next dev (+ mini-browser auto-spawn in some envs)
npm run build            # next build (Turbopack); always run before pushing
npm run lint             # eslint
npm run start            # production start
```

Maintenance scripts (one-off): `npm run audit:history:points`, `fix:history:points:{dry,apply}`, `backfill:consistency:{dry,apply}`.

## Deep-dive context

Read the matching file for the area you're working on:

- [.github/context/architecture.md](.github/context/architecture.md) — how requests flow through the system
- [.github/context/scoring.md](.github/context/scoring.md) — rank points, bonuses, penalties, predictions, rivalry, civil war
- [.github/context/data-model.md](.github/context/data-model.md) — Mongoose schemas + relationships
- [.github/context/my11-integration.md](.github/context/my11-integration.md) — my11circle API, cookies, mini-browser
- [.github/context/contests-feature.md](.github/context/contests-feature.md) — live + past contest view, compare, name verification
- [.github/context/civil-war.md](.github/context/civil-war.md) — rivalry-driven team battles, side randomization
- [.github/context/ai-facts.md](.github/context/ai-facts.md) — verified-numbers narrator (Gemini/OpenRouter/HF)
- [.github/context/admin.md](.github/context/admin.md) — feature gates, approval queues, settings
- [.github/context/conventions.md](.github/context/conventions.md) — code style, error handling, UI patterns

## What lives at the top of the repo

- `AGENTS.md` / `CLAUDE.md` — Next.js version warning (same as above)
- `README.md` — user-facing setup
- `.env.example` — required vars
- `extension/` — Chrome extension to sync my11 cookie to the app
- `public/team-logos/` — IPL team logo PNGs
