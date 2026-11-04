// In-browser preview: runs the real API handler (netlify/functions/api.mts) inside the page,
// so the app can be tried without a server. Built with esbuild into one inline script.
import api from "../netlify/functions/api.mts";
import { getStore } from "./blobs-stub";
import { ensureDemo, saveDay, getDay, addDays, ilNow, weekday, toHM, toMin, type KV, type Booking } from "../netlify/lib/core.mts";

const ENV: Record<string, string> = { ADMIN_PIN: "7693", PUBLIC_URL: "https://torlink.netlify.app" };
(globalThis as any).Netlify = { env: { get: (k: string) => ENV[k] } };
(window as any).__TL_PREVIEW = true;

const realFetch = window.fetch.bind(window);
let ready: Promise<void> | null = null;
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (u.startsWith("/api/")) {
    await (ready ||= seed());
    return api(new Request("https://torlink.netlify.app" + u, init), {} as any);
  }
  return realFetch(input as any, init);
}) as typeof fetch;

// Sample history so the calendar and report have something to show.
async function seed() {
  const kv = getStore() as unknown as KV;
  if (await kv.get("seeded", { type: "json" })) return;
  const env = (k: string) => ENV[k];
  const biz = await ensureDemo(kv, env);
  const people: [string, string][] = [["יוסף", "0521234567"], ["סאמי", "0547654321"], ["ראמי", "0509876543"], ["כרים", "0532223344"], ["נדים", "0584445566"], ["עלי", "0521112233"], ["ג׳ורג׳", "0549998877"], ["מאג׳ד", "0503334455"]];
  let r = 7; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  const now = ilNow();
  for (let off = -35; off <= 5; off++) {
    const date = addDays(now.date, off), h = biz.hours[weekday(date)];
    if (!h.open) continue;
    const day: Booking[] = await getDay(kv, biz.slug, date);
    let m = toMin(h.from) + (rnd() < 0.5 ? 0 : 30);
    while (true) {
      const sv = biz.services[Math.floor(rnd() * rnd() * biz.services.length)];
      if (m + sv.dur > toMin(h.to)) break;
      const fill = off < 0 ? 0.55 : off === 0 ? 0.4 : 0.3;
      if (rnd() < fill) {
        const past = off < 0 || (off === 0 && m + sv.dur < now.min);
        if (off >= 0 && !past && m <= now.min + 10 && off === 0) { m += 30; continue }
        const x = rnd();
        const [name, phone] = people[Math.floor(rnd() * people.length)];
        day.push({
          id: Math.random().toString(36).slice(2, 14).padEnd(12, "x"), slug: biz.slug, date, time: toHM(m), dur: sv.dur,
          serviceId: sv.id, serviceName: sv.name, staffId: biz.staff[0].id, name, phone, price: sv.price,
          status: past ? (x < 0.85 ? "arrived" : x < 0.94 ? "noshow" : "cancelled") : "confirmed",
          lang: "he", created: Date.now() - 86400e3 * 3, reminderSent: true,
        });
        m += sv.dur + (rnd() < 0.6 ? 0 : 15);
      } else m += 30;
    }
    await saveDay(kv, biz.slug, date, day);
  }
  await kv.setJSON("seeded", true);
}
