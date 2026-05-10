# My11 Mini Browser Service

This is a separate service that owns My11Circle login state and returns JSON responses to the main app.

## Why this exists

- Main app never stores My11 cookies.
- Main app never automates browser login directly.
- Service stores browser state in `MINI_BROWSER_STATE_PATH`.
- Main app only talks to this service using a bearer token.

## Start

1. `cd mini-browser`
2. `cp .env.example .env`
3. `npm install`
4. `npm run dev`

## Endpoints

- `GET /health`
- `POST /v1/my11/session-status`
- `POST /v1/my11/login` (opens My11; complete phone/OTP in that browser)
- `POST /v1/my11/leaderboard` with `{ "contestUrl": "..." }`
- `POST /v1/my11/request` with `{ "url": "https://www.my11circle.com/...", "method": "GET|POST|...", "headers": {}, "body": {}, "responseType": "json|text" }`

All POST endpoints require: `Authorization: Bearer <MINI_BROWSER_API_TOKEN>`.

## Render Cold-Start Mitigation

To reduce cold starts, the service now supports prewarm + keepalive:

- `MINI_BROWSER_PREWARM_ON_BOOT=true`
- `MINI_BROWSER_KEEPALIVE_ENABLED=true`
- `MINI_BROWSER_KEEPALIVE_INTERVAL_MS=45000`
- `MINI_BROWSER_KEEPALIVE_TIMEOUT_MS=15000`
- `MINI_BROWSER_KEEPALIVE_URL=https://www.my11circle.com`

`GET /health` returns `warmState` so you can verify the browser/context is warm.

Important: on Render free plans, instances can still sleep when idle at platform level. For truly no-sleep behavior, use an always-on plan.

## Security notes

- Keep this service private (internal network / VPN / allowlist).
- Rotate `MINI_BROWSER_API_TOKEN` regularly.
- Do not expose this service directly to public internet without additional controls.
