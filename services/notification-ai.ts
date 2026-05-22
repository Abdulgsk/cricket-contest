/**
 * Tiny single-sentence narrator for in-app notifications. Uses Hugging Face
 * Inference Router (OpenAI-compatible) only. Falls back to a deterministic
 * sentence if HF_TOKEN isn't set or the call fails. Never throws.
 */
import OpenAI from "openai";
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

let hfClient: OpenAI | null = null;
function getHf(): OpenAI {
  if (!hfClient) {
    hfClient = new OpenAI({
      baseURL: "https://router.huggingface.co/v1",
      apiKey: env.HF_TOKEN,
    });
  }
  return hfClient;
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
  if (!env.HF_TOKEN) return fallback;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 6000);
  try {
    const models = (env.HF_MODEL || "")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);
    if (!models.length) models.push("meta-llama/Llama-3.1-8B-Instruct");
    const prompt = buildPrompt(ctx);

    for (const model of models) {
      try {
        const completion = await getHf().chat.completions.create(
          {
            model,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: prompt },
            ],
            temperature: 0.8,
            max_tokens: 120,
          },
          { signal: controller.signal },
        );
        const raw = completion.choices?.[0]?.message?.content ?? "";
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
