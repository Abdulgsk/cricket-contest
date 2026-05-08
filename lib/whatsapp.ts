// Meta WhatsApp Cloud API client (free 1,000 conv/mo).
// Sends a pre-approved template message. The template body must accept up to
// 3 body variables: {{1}}=teamA, {{2}}=teamB, {{3}}=match URL.
// For the default Meta test template "hello_world" we omit variables.
import { env } from "@/lib/env";

const GRAPH_VERSION = "v25.0";

/** Strip non-digits and any leading "+" / "whatsapp:" prefix. Cloud API expects digits only. */
function normalize(to: string): string {
  return to.replace(/^whatsapp:/i, "").replace(/\D+/g, "");
}

/**
 * Send a WhatsApp template reminder. Returns true on success, false otherwise.
 * Falls back silently when WhatsApp is not configured so callers can still
 * persist in-app notifications without crashing.
 */
export async function sendWhatsApp(
  to: string,
  vars: { teamA?: string; teamB?: string; url?: string } = {}
): Promise<boolean> {
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) return false;
  const phone = normalize(to);
  if (!phone) return false;

  const isHelloWorld = env.WHATSAPP_TEMPLATE_NAME === "hello_world";
  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to: phone,
    type: "template",
    template: {
      name: env.WHATSAPP_TEMPLATE_NAME,
      language: { code: env.WHATSAPP_TEMPLATE_LANG },
      ...(isHelloWorld
        ? {}
        : {
            components: [
              {
                type: "body",
                parameters: [
                  { type: "text", text: vars.teamA ?? "" },
                  { type: "text", text: vars.teamB ?? "" },
                  { type: "text", text: vars.url ?? "" },
                ],
              },
            ],
          }),
    },
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error("WhatsApp send failed:", res.status, txt.slice(0, 500));
      return false;
    }
    return true;
  } catch (e) {
    console.error("WhatsApp send error:", (e as Error).message);
    return false;
  }
}
