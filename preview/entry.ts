// In-browser preview: runs the real API handler (netlify/functions/api.mts) inside the page,
// so the app can be tried without a server. Built with esbuild into one inline script.
import api from "../netlify/functions/api.mts";
import { getStore } from "./blobs-stub";
import { ensureDemo, buildBiz, saveBiz, saveDay, getDay, addDays, ilNow, weekday, toHM, toMin, buildClients, saveClients, type KV, type Booking } from "../netlify/lib/core.mts";

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
  // optional demo profile (e.g. a nail studio for a sales demo): window.__TL_SEED = { type, name, staff, people, first, last, notes, reviews, ... }
  const cfg: any = (window as any).__TL_SEED || {};
  if (cfg.type && !(await kv.get("biz/demo", { type: "json" }))) {
    const nb = buildBiz("demo", cfg.type, ENV.ADMIN_PIN, cfg.name);
    if (cfg.staff) nb.staff[0].name = cfg.staff;
    await saveBiz(kv, nb);
  }
  const biz = await ensureDemo(kv, env);
  // weights: regulars come often, some customers stopped coming (to show "at risk" / "lost")
  const people: [string, string, number, number][] = cfg.people ? cfg.people.map((n: string, i: number) => [n, ["0521234567", "0547654321", "0509876543", "0532223344", "0584445566", "0521112233", "0549998877", "0503334455"][i], 3, i === 5 ? -40 : i === 6 ? -30 : 0]) : [["יוסף ח.", "0521234567", 3, 0], ["סאמי ע.", "0547654321", 3, 0], ["ראמי ס.", "0509876543", 3, 0], ["כרים ב.", "0532223344", 3, 0],
    ["נדים ח.", "0584445566", 3, 0], ["עלי מ.", "0521112233", 3, -40], ["ג׳ורג׳ ח.", "0549998877", 3, -30], ["מאג׳ד ק.", "0503334455", 3, 0]];
  const first = cfg.first || ["אחמד", "מוחמד", "חסן", "פאדי", "אמיר", "באסל", "וסים", "ח׳אלד", "סלים", "טארק", "נזאר", "איהאב", "רביע", "שאדי", "וליד", "מהדי", "האני", "עומר"];
  const last = cfg.last || ["א.", "ב.", "ג.", "ד.", "ח.", "ט.", "כ."];
  for (let i = 0; i < 110; i++) people.push([`${first[i % first.length]} ${last[i % last.length]}`, "05" + String(20000000 + i * 7919).slice(0, 8), 1, i % 9 === 0 ? -50 : 0]);
  const wsum = people.reduce((a, p) => a + p[2], 0);
  let r = 7; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  const pick = (off: number) => { for (let i = 0; i < 6; i++) { let x = rnd() * wsum; for (const p of people) { x -= p[2]; if (x <= 0) { if (p[3] === 0 || off < p[3]) return p; break } } } return people[0] };
  const now = ilNow();
  const all: Booking[] = [];
  for (let off = -90; off <= 5; off++) {
    const date = addDays(now.date, off), h = biz.hours[weekday(date)];
    if (!h.open) continue;
    const day: Booking[] = await getDay(kv, biz.slug, date);
    let m = toMin(h.from) + (rnd() < 0.5 ? 0 : 30);
    while (true) {
      const sv = biz.services[Math.floor(rnd() * rnd() * biz.services.length)];
      if (m + sv.dur > toMin(h.to)) break;
      const fill = off < 0 ? 0.42 : off === 0 ? 0.4 : 0.3;
      if (rnd() < fill) {
        const past = off < 0 || (off === 0 && m + sv.dur < now.min);
        if (off >= 0 && !past && m <= now.min + 10 && off === 0) { m += 30; continue }
        const x = rnd();
        const [name, phone] = pick(off);
        day.push({
          id: Math.random().toString(36).slice(2, 14).padEnd(12, "x"), slug: biz.slug, date, time: toHM(m), dur: sv.dur,
          serviceId: sv.id, serviceName: sv.name, staffId: biz.staff[0].id, name, phone, price: sv.price,
          status: past ? (x < 0.85 ? "arrived" : x < 0.94 ? "noshow" : "cancelled") : "confirmed",
          lang: cfg.lang || "he", created: Date.now() + off * 86400e3 - 86400e3 * 3, reminderSent: true,
        });
        m += sv.dur + (rnd() < 0.6 ? 0 : 15);
      } else m += 30;
    }
    await saveDay(kv, biz.slug, date, day);
    all.push(...day);
  }
  const clients = buildClients(all);
  clients["0521234567"].tags = ["vip", "regular"]; clients["0521234567"].notes = cfg.note || "פייד נמוך 0.5 בצדדים, מעדיף שעות בוקר";
  clients["0547654321"].tags = ["regular"]; clients["0547654321"].birthday = "14-03";
  await saveClients(kv, biz.slug, clients);
  // a few store orders
  const ym = now.date.slice(0, 7), P0 = biz.products;
  const mk = (code: string, name: string, phone: string, items: [number, number][], status: string, hoursAgo: number) => ({
    id: "o" + code, code, slug: biz.slug, name, phone, note: "", status, lang: "he", created: Date.now() - hoursAgo * 3600e3,
    items: items.map(([i, qty]) => { const p = P0[Math.min(i, P0.length - 1)]; return { id: p.id, name: p.name, price: p.price, qty, icon: p.icon } }),
    total: items.reduce((a, [i, q]) => a + P0[Math.min(i, P0.length - 1)].price * q, 0),
  });
  const on = (i: number, d: string) => cfg.people ? cfg.people[i].split(" ")[0] : d;
  await kv.setJSON(`orders/${biz.slug}/${ym}`, { items: [mk("4821", on(0, "יוסף"), "0521234567", [[1, 1], [0, 1]], "picked", 50), mk("5307", on(1, "סאמי"), "0547654321", [[0, 2]], "ready", 20), mk("6142", on(3, "כרים"), "0532223344", [[4, 1]], "new", 2)] });
  clients["0521234567"].productSpend = P0[1].price + P0[0].price; await saveClients(kv, biz.slug, clients);
  // sample reviews + branding so the showcase sections aren't empty in the demo
  const svcN = biz.services[0].name, svcB = biz.services[1].name;
  const rv = cfg.reviews ? cfg.reviews.map((r: any[]) => [r[0], r[1], r[2], r[3] ? svcB : svcN, r[4]]) : [[5, "יוסף", "הכי מקצועי בצפון, תמיד יוצא מרוצה", svcN, 2], [5, "סאמי", "יחס אישי ותספורת מדויקת. ממליץ!", svcB, 5], [4, "כרים", "שירות מהיר, הגעתי בזמן ולא חיכיתי", svcN, 9],
    [5, "נדים", "הזקן יצא מושלם", svcB, 14], [5, "ראמי", "מקום נקי, אווירה טובה ומחירים הוגנים", svcN, 20], [3, "עלי", "", svcN, 25]] as const;
  const items = rv.map(([stars, name, text, service, d], i) => ({ id: "seed" + i, name, stars, text, service, at: Date.now() - d * 86400e3, ...(i === 0 ? { reply: cfg.reply || "תודה יוסף, תמיד שמחים לראות אותך!" } : {}) }));
  await kv.setJSON(`reviews/${biz.slug}`, { items });
  const b2: any = await kv.get(`biz/${biz.slug}`, { type: "json" });
  b2.rating = { avg: Math.round(items.reduce((a, x) => a + x.stars, 0) / items.length * 10) / 10, count: items.length };
  b2.social = cfg.social || { instagram: "barber.studio", facebook: "", tiktok: "", whatsapp: "0521234567", waze: "" };
  b2.address = cfg.address ?? "שפרעם"; b2.tagline = cfg.tagline || { he: "הסטייל שלך מתחיל כאן", ar: "ستايلك يبدأ هنا" };
  await kv.setJSON(`biz/${biz.slug}`, b2);
  await kv.setJSON("seeded", true);
}
