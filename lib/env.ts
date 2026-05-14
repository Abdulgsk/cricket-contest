// Centralized env access. Throws clearly if required vars are missing at runtime.
export const env = {
  MONGODB_URI: process.env.MONGODB_URI ?? "",
  AUTH_SECRET: process.env.AUTH_SECRET ?? "dev-insecure-secret-change-me",
  SUPER_ADMIN_USER_ID: (process.env.SUPER_ADMIN_USER_ID ?? "").toLowerCase(),
  // Meta WhatsApp Cloud API (free 1,000 conv/mo)
  WHATSAPP_TOKEN: process.env.WHATSAPP_TOKEN ?? "",
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
  // Approved template name. Body must accept 3 vars: {{1}}=teamA {{2}}=teamB {{3}}=URL.
  // Defaults to Meta's test template "hello_world" (no vars) for initial smoke testing.
  WHATSAPP_TEMPLATE_NAME: process.env.WHATSAPP_TEMPLATE_NAME ?? "hello_world",
  WHATSAPP_TEMPLATE_LANG: process.env.WHATSAPP_TEMPLATE_LANG ?? "en_US",
  CRON_SECRET: process.env.CRON_SECRET ?? "",
  APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  IPL_SEASON: process.env.IPL_SEASON ?? String(new Date().getUTCFullYear()),
  MY11_COOKIE_SYNC_TOKEN: process.env.MY11_COOKIE_SYNC_TOKEN ?? "",
  MY11CIRCLE_USER_AGENT:
    process.env.MY11CIRCLE_USER_AGENT ??
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  // Google Gemini API (used by services/facts-ai.ts to narrate verified stats)
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? "",
  GEMINI_MODEL: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
  // OpenRouter (preferred — OpenAI-compatible). If set, used instead of Gemini.
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? "",
  // Comma-separated list of OpenRouter models to try in order on failure / 429.
  // Faster / smaller free models first so we don't burn the budget on a slow one.
  OPENROUTER_MODEL:
    process.env.OPENROUTER_MODEL ??
    "meta-llama/llama-3.3-70b-instruct:free,google/gemini-2.0-flash-exp:free,deepseek/deepseek-chat-v3.1:free",
  // Hugging Face Inference Router (OpenAI-compatible). Preferred when HF_TOKEN
  // is set. Comma-separated model list — try in order on failure / 429.
  HF_TOKEN: process.env.HF_TOKEN ?? "",
  HF_MODEL:
    process.env.HF_MODEL ??
    "deepseek-ai/DeepSeek-R1:novita,meta-llama/Llama-3.3-70B-Instruct:novita",
};

export function requireEnv(key: keyof typeof env): string {
  const v = env[key];
  if (typeof v !== "string" || !v) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return v;
}
