/**
 * Tiny single-sentence narrator for in-app notifications. Uses Google Gemini
 * REST. Falls back to a deterministic sentence if GEMINI_API_KEY isn't set or
 * the call fails. Never throws.
 */
import { env } from "@/lib/env";

type AiContext = {
  /** Short label for the kind of moment ("30-min siren", "results in", etc.). */
  occasion: string;
  /** Anything useful: team names, minutes-to-start, winners, points. */
  facts: Record<string, string | number | null | undefined>;
};

const SYSTEM_PROMPT =
  "You are a witty cricket commentator writing short in-app notifications for a private fantasy league of 13 friends. " +
  "Reply with ONE short sentence (max 18 words), no quotes, no emoji, no hashtags, no markdown, no <think> blocks. " +
  "Be playful but never insulting. Use only the facts provided.";

function buildPrompt(ctx: AiContext): string {
  const factLines = Object.entries(ctx.facts)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
  return `Occasion: ${ctx.occasion}\nFacts:\n${factLines}\n\nWrite the one-sentence notification body.`;
}

function sanitize(text: string, max = 200): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^["'`*_\s]+/, "")
    .replace(/["'`*_\s]+$/, "")
    .replace(/\s+/g, " ")
    .slice(0, max)
    .trim();
}

/** Returns an AI-written sentence, or the provided fallback. Never throws. */
export async function generateNotificationLine(
  ctx: AiContext,
  fallback: string,
): Promise<string> {
  if (!env.GEMINI_API_KEY) return fallback;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 6000);
  try {
    const models = (env.GEMINI_MODEL || "")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);
    if (!models.length) models.push("gemini-flash-latest");
    const prompt = buildPrompt(ctx);

    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          model,
        )}:generateContent`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-goog-api-key": env.GEMINI_API_KEY,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.8,
              maxOutputTokens: 200,
            },
          }),
          signal: controller.signal,
        });
        if (!res.ok) continue;
        const data = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const raw =
          data.candidates?.[0]?.content?.parts
            ?.map((p) => p.text ?? "")
            .join("") ?? "";
        const cleaned = sanitize(raw);
        if (cleaned.length >= 5) return cleaned;
      } catch {
        // try next model
      }
    }
  } finally {
    clearTimeout(t);
  }
  return fallback;
}
