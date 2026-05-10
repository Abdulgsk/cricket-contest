# Cricket Contest – My11 Cookie Sync (Chrome Extension)

Tiny browser extension that reads your `my11circle.com` session cookies and POSTs them to your cricket-contest admin so the server can call My11 APIs directly (no Playwright, no captcha).

## One-time setup

1. **Set the shared secret on Vercel**

   Generate a random token and add it to Vercel env vars:

   ```bash
   openssl rand -hex 32
   ```

   Set `MY11_COOKIE_SYNC_TOKEN=<that value>` in Vercel project settings, then redeploy.

2. **Add an icon (optional)** — Drop any 128×128 `icon.png` into this folder. The extension still loads without it but Chrome will show a placeholder.

3. **Install in Chrome / Brave / Edge**

   - Open `chrome://extensions`
   - Enable **Developer mode** (top right)
   - Click **Load unpacked** → select this `extension/` folder

4. **Configure the extension**

   - Click the extension icon in your toolbar
   - **Admin endpoint:** `https://cricket-contest.vercel.app/api/admin/my11-cookie`
   - **Sync token:** the value from step 1
   - These are saved locally for next time

## Daily use

1. Open `https://www.my11circle.com` and log in normally (with OTP, in your real browser session).
2. Click the extension icon → **Sync My11 cookie**
3. Done — cricket-contest can now fetch leaderboards from any device, including mobile.

When the cookie expires (typically a few weeks), repeat steps 1–2.

## What it sends

Only these cookies, plus your bearer token in the `Authorization` header:

- `SSID` (the auth token)
- `SSIDuser`
- `NA_VISITOR`
- `sameSiteNoneSupported`
- `device.info.cookie`

Nothing else is read or transmitted.
