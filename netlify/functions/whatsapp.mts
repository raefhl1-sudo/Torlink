import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import type { KV, Env } from "../lib/core.mts";
import { handleIncoming, parseWebhook, validSignature } from "../lib/bot.mts";

// Meta WhatsApp Cloud API webhook.
//  GET  → subscription check (hub.verify_token must equal WA_VERIFY_TOKEN)
//  POST → incoming customer messages, answered by the booking bot
const env: Env = k => Netlify.env.get(k);

export default async (req: Request) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const ok = url.searchParams.get("hub.mode") === "subscribe" && !!env("WA_VERIFY_TOKEN") && url.searchParams.get("hub.verify_token") === env("WA_VERIFY_TOKEN");
    return ok ? new Response(url.searchParams.get("hub.challenge") || "", { status: 200 }) : new Response("forbidden", { status: 403 });
  }
  if (req.method !== "POST") return new Response("method", { status: 405 });
  const raw = await req.text();
  if (!(await validSignature(env("WA_APP_SECRET"), raw, req.headers.get("x-hub-signature-256")))) return new Response("bad signature", { status: 401 });
  let body: any; try { body = JSON.parse(raw) } catch { return new Response("ok") }
  const kv = getStore({ name: "torlink", consistency: "strong" }) as unknown as KV;
  const siteUrl = env("PUBLIC_URL") || env("URL") || url.origin;
  for (const m of parseWebhook(body)) {
    try { await handleIncoming(kv, env, siteUrl, m) } catch (e) { console.error("webhook", e) }
    // blue ticks: mark the customer's message as read
    if (env("WA_TOKEN") && m.phoneId) fetch(`https://graph.facebook.com/${env("WA_API_VERSION") || "v23.0"}/${m.phoneId}/messages`, {
      method: "POST", headers: { Authorization: `Bearer ${env("WA_TOKEN")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: m.id }),
    }).catch(() => { });
  }
  return new Response("ok"); // always 200 so Meta doesn't retry
};

export const config: Config = { path: "/wa/webhook" };
