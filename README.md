# 🏏 Fantasy 13 — IPL Private League Management

A private Dream11-style league management web app for **13 friends**, built with Next.js 16,
TypeScript, Tailwind v4, MongoDB Atlas, and Vercel.

> Users join contests externally on Dream11. This app handles **everything around it**:
> leaderboard, bonuses, penalties, predictions (with locked suspense reveal), reminders,
> rankings, statistics, and admin tooling.

## Stack

- **Next.js 16** (App Router, Server Actions, `proxy.ts` middleware, Node runtime)
- **TypeScript** strict
- **Tailwind v4** + premium custom theme (no extra config)
- **MongoDB Atlas** + Mongoose
- **Recharts** for analytics
- **Sonner** for toasts
- **Twilio** WhatsApp Sandbox for reminders (optional)
- **Vercel Cron** for hourly reminder dispatch
- **Custom credentials auth**, JWT in `httpOnly` cookie
- **Plain-text passwords** (per league policy — see security note)

## Project layout

```
app/
  (auth)/                 login, signup, forgot-password
  (app)/                  protected app shell
    dashboard/            home
    leaderboard/          full table
    matches/              list + match detail (suspense + results)
    predictions/          your predictions
    profile/              edit profile + change password
    rules/                full rule book
    analytics/            recharts dashboard
    admin/                admin-only zone
  api/cron/reminders/     Vercel cron endpoint
actions/                  server actions (auth, admin, predictions)
services/                 scoring + prediction engines
models/                   Mongoose schemas
lib/                      db, env, session, rbac, utils, twilio, constants
components/               UI primitives + page-level components
proxy.ts                  route protection (Next.js 16 convention)
vercel.json               cron jobs
```

## Local setup

```bash
cp .env.example .env.local
# fill MONGODB_URI, AUTH_SECRET, SUPER_ADMIN_USER_ID, optional Twilio
npm install
npm run dev
```

`npm run dev` now starts both the Next.js app and the My11 mini-browser bridge in one command.

### My11 mini-browser bridge (required for production My11 sync)

The app now uses a separate mini-browser service for My11Circle login/session.
Set these in your main app environment:

- `MY11_MINI_BROWSER_URL` (example: `http://127.0.0.1:4010`)
- `MY11_MINI_BROWSER_TOKEN` (must match mini-browser token)
- `MY11_MINI_BROWSER_TIMEOUT_MS` (optional, default `30000`)

The standalone service is in [mini-browser/README.md](mini-browser/README.md).

For production on a Node host, use one process command:

```bash
npm run start
```

This starts both services together so you do not need two separate deployments.

Open http://localhost:3000 and **sign up using the same `userId` as `SUPER_ADMIN_USER_ID`**
to be auto-promoted to super-admin. All other users start as `user`.

## Deployment to Vercel (free)

1. Push this repo to GitHub.
2. Create a new Vercel project, import the repo.
3. Set environment variables in the Vercel dashboard:
   - `MONGODB_URI` — from MongoDB Atlas (allow-list `0.0.0.0/0` for Vercel)
   - `AUTH_SECRET` — long random string
   - `SUPER_ADMIN_USER_ID` — your handle
   - `CRON_SECRET` — long random string (Vercel sends this as `Authorization: Bearer …`)
   - `NEXT_PUBLIC_APP_URL` — your deployed URL
   - (optional) `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`
4. Deploy. The cron defined in `vercel.json` (`/api/cron/reminders`) runs every 15 minutes.
5. Sign up with the super-admin user ID. Promote other admins from **Admin → Users**.

### MongoDB Atlas quickstart
- Create a free **M0** cluster.
- Create a DB user, copy the SRV connection string.
- IP allow-list: add `0.0.0.0/0` (Vercel uses dynamic IPs).
- Use it as `MONGODB_URI`.

### Twilio WhatsApp Sandbox
- Create a free Twilio account, enable the WhatsApp Sandbox.
- Each player must `join <sandbox-keyword>` from their WhatsApp once.
- Their WhatsApp number (with `+countrycode`) goes in their profile.
- The cron runs every 15 minutes; ~1 hour before each match it pings any player who
  hasn't submitted a prediction.

## Scoring engine cheat-sheet

| Rank      | Pts |
| --------- | --- |
| 1         | 15  |
| 2         | 12  |
| 3         | 10  |
| 4         | 8   |
| 5         | 6   |
| 6         | 4   |
| 7         | 2   |
| 8 – 13    | 0   |

**Penalties** (stack): missed `-5`, `-5` extra for 2nd consecutive, `-10` extra for 3rd consecutive.

**Bonuses** (capped at **10 / match**):
- Consistency `+7` · 3 consecutive Top 5
- King Slayer `+5` · finish above current overall #1
- Comeback `+5` · climb 4+ leaderboard positions
- Risk `+8` · C+VC both <30% own AND finish Top 3
- Underdog `+6` · ranked 10–13 and finish Top 2
- Match Domination `+5` · win by 300+ Dream11 points
- Bounty `+3` · beat the bounty holder

**Predictions**:
- Winner `+5`, Top batter `+7`, Top bowler `+8`, all-three bonus `+20`.
- Locked instantly on submit. Hidden from everyone (including super-admin) until match starts.
- Admin can RESET (delete) a prediction before match starts but cannot view it.

Every awarded bonus is logged in `BonusAuditLog` and displayed transparently on the match
detail page.

## Security notes

- ⚠️ **Passwords are stored as plain text** per the explicit league spec. If this app ever
  goes beyond 13 trusted friends, change `actions/auth.ts` and `models/User.ts` to use
  `bcrypt` and never store plaintext.
- Sessions are signed JWTs in an `httpOnly`, `sameSite=lax` cookie.
- All scoring runs server-side only. Clients can never set their own points.
- Admin-only routes are guarded by `proxy.ts` AND `requireRole(...)` inside each layout.

## What ships in this build (Phase 1)

- ✅ Auth (signup / login / logout / change password / edit profile)
- ✅ Roles: user / admin / superadmin (auto-promotion via env)
- ✅ Mongoose models for all entities
- ✅ Match CRUD + result entry with full scoring engine
- ✅ Bonus engine (all 7 bonuses + 10-pt cap + special match modes)
- ✅ Penalty engine with consecutive-miss tracking
- ✅ Prediction submission with hard lock, hidden suspense pool, post-start reveal
- ✅ Leaderboard with full breakdown (league, predictions, bonus, penalty, wins, top-3, avg, missed)
- ✅ Match detail with bonus audit breakdown
- ✅ Admin dashboard, user role mgmt, settings (announcement + bounty)
- ✅ Recharts analytics page
- ✅ Premium dark UI (glassmorphism, gradients, mobile bottom nav)
- ✅ WhatsApp + in-app reminder cron
- ✅ Audit logs for every admin action

## Phase 2 (suggested next sprint — spec'd but not shipped here)

- 🎬 Animated suspense reveal at match start (Framer Motion + confetti)
- 🏅 Badges & Achievements (King Slayer, Consistency God, etc.)
- 🤝 Head-to-head rivalries
- 🤖 AI commentary generator
- 📅 Weekly awards (Player of the Week, Biggest Climber)
- 💬 Social wall / banter / reactions
- 🏏 Live IPL API auto-import (CricAPI/Cricbuzz)
- 📊 Per-user analytics (rank progression, momentum)
- 🎯 Final-week drama mode (title permutations)
- 🧠 ELO-style hidden power rankings & luck index

Data model and engines are already in place — Phase 2 is purely additive.
