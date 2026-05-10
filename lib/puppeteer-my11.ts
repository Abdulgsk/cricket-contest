import puppeteer, { Browser } from "puppeteer";

export interface LoginResult {
  cookie: string;
  sessionId: string;
  expiresAt: Date;
}

interface CapturedLeaderboardRequest {
  matchId: number;
  contestId: number;
  referer: string;
  sessionCookie: string;
}

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browser && browser.isConnected()) return browser;
  if (browser && !browser.isConnected()) {
    browser = null;
  }
  const isVercel = Boolean(process.env.VERCEL);
  const launched = await puppeteer.launch({
    // Local dev: open visible browser so admin can enter phone/OTP.
    // Vercel/serverless: must stay headless.
    headless: isVercel,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--single-process",
    ],
  });
  launched.on("disconnected", () => {
    browser = null;
  });
  browser = launched;
  return launched;
}

export async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

async function createPage() {
  const tryOpen = async () => {
    const br = await getBrowser();
    return br.newPage();
  };

  try {
    return await tryOpen();
  } catch {
    browser = null;
    return await tryOpen();
  }
}

function extractLeaderboardPath(url: string) {
  const m = url.match(/\/leaderboard\/(\d+)\/(\d+)/);
  if (!m) return null;
  return {
    matchId: m[1],
    contestId: m[2],
    url: `https://www.my11circle.com/lobby/contests/leaderboard/${m[1]}/${m[2]}`,
  };
}

export async function resolveContestUrlFromInvite(
  inviteUrl: string,
  sessionCookie?: string
): Promise<string | null> {
  const page = await createPage();
  try {
    if (sessionCookie?.trim()) {
      await page.setExtraHTTPHeaders({ cookie: sessionCookie.trim() });
    }

    await page.goto(inviteUrl, {
      waitUntil: "networkidle2",
      timeout: 45000,
    });

    for (let i = 0; i < 20; i++) {
      const current = page.url();
      const parsed = extractLeaderboardPath(current);
      if (parsed) return parsed.url;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const html = await page.content();
    const directPath = html.match(/\/leaderboard\/(\d+)\/(\d+)/);
    if (directPath) {
      return `https://www.my11circle.com/lobby/contests/leaderboard/${directPath[1]}/${directPath[2]}`;
    }

    const matchId = html.match(/"matchId"\s*:\s*(\d+)/)?.[1];
    const contestId = html.match(/"contestId"\s*:\s*(\d+)/)?.[1];
    if (matchId && contestId) {
      return `https://www.my11circle.com/lobby/contests/leaderboard/${matchId}/${contestId}`;
    }

    return null;
  } finally {
    await page.close().catch(() => {});
  }
}

export async function captureLeaderboardRequestFromManualClick(
  sessionCookie?: string,
  _startUrl = "https://www.my11circle.com/lobby/contests"
): Promise<CapturedLeaderboardRequest | null> {
  const page = await createPage();
  try {
    await page.setViewport({ width: 1280, height: 720 });
    if (sessionCookie?.trim()) {
      await page.setExtraHTTPHeaders({ cookie: sessionCookie.trim() });
    }

    const capturedPromise = new Promise<CapturedLeaderboardRequest | null>((resolve) => {
      let onRequest: ((request: import("puppeteer").HTTPRequest) => void) | null = null;
      const timeout = setTimeout(() => {
        if (onRequest) page.off("request", onRequest);
        resolve(null);
      }, 5 * 60 * 1000);

      onRequest = async (request: import("puppeteer").HTTPRequest) => {
        try {
          if (
            request.method() !== "POST" ||
            !request.url().includes("/api/lobbyApi/contests/v1/getLeaderBoard")
          ) {
            return;
          }

          const postData = request.postData();
          if (!postData) return;
          const parsed = JSON.parse(postData) as {
            matchId?: number;
            contestId?: number;
          };
          const matchId = Number(parsed.matchId);
          const contestId = Number(parsed.contestId);
          if (!Number.isFinite(matchId) || !Number.isFinite(contestId)) return;

          const headers = request.headers();
          const referer = headers.referer || page.url();
          const isLeaderboardTriggered =
            referer.includes("/leaderboard/") || page.url().includes("/leaderboard/");
          if (!isLeaderboardTriggered) return;

          const currentCookieString =
            headers.cookie || sessionCookie?.trim() || "";

          clearTimeout(timeout);
          if (onRequest) page.off("request", onRequest);
          resolve({
            matchId,
            contestId,
            referer,
            sessionCookie: currentCookieString,
          });
        } catch {
          // Ignore non-JSON or malformed payloads.
        }
      };

      page.on("request", onRequest);
    });

    // Always navigate to contests list, never auto-navigate to leaderboard or auto-reload
    // This ensures user must manually click to select a leaderboard
    await page.goto("https://www.my11circle.com/lobby/contests", {
      waitUntil: "networkidle2",
      timeout: 45000,
    });

    return await capturedPromise;
  } finally {
    await page.close().catch(() => {});
  }
}

export async function loginToMy11Circle(): Promise<LoginResult> {
  const page = await createPage();

  try {
    // Set viewport for better rendering
    await page.setViewport({ width: 1280, height: 720 });

    // Navigate to My11Circle
    await page.goto("https://www.my11circle.com", {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    // Wait for login button and click it
    try {
      const loginBtn = await page.$('a[href*="/login"], a[href*="/auth"], button[aria-label*="Login"], button[aria-label*="login"]');
      if (loginBtn) {
        await loginBtn.click();
        await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
      }
    } catch {
      // Continue if login click fails, page might already be on login screen
    }

    await page.waitForSelector('input[type="text"], input[type="tel"], input[type="number"]', {
      timeout: 20000,
    });

    // Robust wait: allow any UI flow and detect success by session cookies + leaving auth routes.
    const deadline = Date.now() + 5 * 60 * 1000;
    let authenticated = false;
    while (Date.now() < deadline) {
      const url = page.url().toLowerCase();
      const cookies = await page.cookies();
      const hasSessionCookie = cookies.some(
        (c) =>
          Boolean(c.value) && /ssid|jsessionid|session|token|auth/i.test(c.name)
      );
      const leftAuthScreen = !url.includes("/login") && !url.includes("/auth");

      if (hasSessionCookie && leftAuthScreen) {
        authenticated = true;
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    if (!authenticated) {
      throw new Error("Login timed out before authentication completed");
    }

    // Extract cookies
    const cookies = await page.cookies();
    const sessionCookie = cookies
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");

    if (!sessionCookie) {
      throw new Error("No session cookie found after login");
    }

    // Calculate expiry (default 24 hours from now)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    return {
      cookie: sessionCookie,
      sessionId: cookies.find((c) => c.name === "JSESSIONID")?.value || "unknown",
      expiresAt,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

// Alternative: For Vercel (serverless), use a simpler approach with direct HTTP
export async function extractMy11SessionViaAPI(phone: string, otp: string): Promise<LoginResult> {
  // Step 1: Send OTP request
  const otpRes = await fetch("https://www.my11circle.com/api/socialApi/v1/user/generateOtp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://www.my11circle.com",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    body: JSON.stringify({ mobile: phone, otpChannel: "sms" }),
  });

  if (!otpRes.ok) {
    throw new Error(`Failed to request OTP: ${otpRes.statusText}`);
  }

  // Step 2: Verify OTP
  const verifyRes = await fetch("https://www.my11circle.com/api/socialApi/v1/user/verifyOtp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://www.my11circle.com",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    body: JSON.stringify({ mobile: phone, otp }),
  });

  if (!verifyRes.ok) {
    throw new Error(`Failed to verify OTP: ${verifyRes.statusText}`);
  }

  const verifyData = (await verifyRes.json()) as Record<string, string | null | undefined>;
  const sessionId = verifyData.sessionId || verifyData.token;

  if (!sessionId) {
    throw new Error("No session ID returned from API");
  }

  // Step 3: Construct session cookie from response
  const setCookieHeaders = verifyRes.headers.getSetCookie();
  const sessionCookie = setCookieHeaders.join("; ");

  if (!sessionCookie) {
    throw new Error("No cookies in response from My11Circle");
  }

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  return {
    cookie: sessionCookie,
    sessionId,
    expiresAt,
  };
}
