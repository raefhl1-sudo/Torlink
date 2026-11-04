import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { runReminders, type KV } from "../lib/core.mts";

// Runs every hour. From REMINDER_HOUR (default 18:00 Israel time) it sends a WhatsApp
// reminder for every confirmed booking of tomorrow that hasn't had one yet.
export default async () => {
  const kv = getStore({ name: "torlink", consistency: "strong" }) as unknown as KV;
  const siteUrl = Netlify.env.get("PUBLIC_URL") || Netlify.env.get("URL") || "https://torlink.netlify.app";
  const res = await runReminders(kv, k => Netlify.env.get(k), siteUrl);
  console.log("reminders", res);
};

export const config: Config = {
  schedule: "5 * * * *", // every hour at :05 (UTC); the Israel-time check happens in code
};
