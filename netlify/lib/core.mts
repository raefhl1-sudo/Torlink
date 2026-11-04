// TorLink core logic — storage-agnostic so it can be tested without Netlify.
// Data layout (Netlify Blobs, one site-wide store):
//   biz/<slug>                 business config
//   day/<slug>/<yyyy-mm-dd>    { bookings: Booking[] } for that day
//   tok/<token>                { slug, date } — index for the client's manage link
//   msgs/<slug>/<yyyy-mm>      { items: MsgLog[] } — WhatsApp message log per month

export interface KV {
  get(key: string, opts: { type: "json" }): Promise<any>;
  setJSON(key: string, value: any): Promise<unknown>;
  list(opts: { prefix: string }): Promise<{ blobs: { key: string }[] }>;
  delete(key: string): Promise<unknown>;
}
export type Env = (k: string) => string | undefined;
type L = { he: string; ar: string };

export interface Service { id: string; name: L; dur: number; price: number }
export interface Staff { id: string; name: L }
export interface Hours { open: boolean; from: string; to: string }
export interface Biz {
  slug: string; type: string; icon: string; name: L; pin: string; cutoff: number;
  services: Service[]; staff: Staff[]; hours: Hours[]; blocked: string[]; created: number;
}
export interface Booking {
  id: string; slug: string; date: string; time: string; dur: number;
  serviceId: string; serviceName: L; staffId: string; name: string; phone: string; price: number;
  status: "confirmed" | "arrived" | "noshow" | "cancelled"; lang: "he" | "ar";
  created: number; reminderSent?: boolean; history?: { type: string; at: number }[];
}
export type MsgType = "confirm" | "reminder" | "changed" | "cancelled";
export interface MsgLog { id: string; at: number; type: MsgType; bookingId: string; name: string; phone: string; status: "sent" | "demo" | "failed"; text: string; error?: string }

export class HttpError extends Error { constructor(public status: number, public code: string) { super(code) } }

/* ---------------- presets ---------------- */
const rid = (n = 8) => {
  const a = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(bytes, b => a[b % a.length]).join("");
};
export const newToken = () => rid(12);

export const PRESETS: Record<string, { icon: string; name: L; services: [string, string, number, number][]; staff: [string, string][] }> = {
  barber: {
    icon: "💈", name: { he: "ברבר סטודיו", ar: "باربر ستوديو" },
    services: [["תספורת גבר", "قص شعر رجالي", 30, 60], ["תספורת + זקן", "قص شعر + لحية", 45, 80], ["עיצוב זקן", "تصفيف لحية", 20, 40], ["תספורת ילד", "قص شعر أطفال", 25, 50], ["החלקה", "تمليس", 60, 150]],
    staff: [["מוחמד", "محمد"]],
  },
  nails: {
    icon: "💅", name: { he: "סטודיו ציפורניים", ar: "ستوديو أظافر" },
    services: [["בניית ציפורניים", "تركيب أظافر", 120, 250], ["מילוי", "تعبئة", 90, 180], ["לק ג׳ל", "جل", 60, 120], ["מניקור", "مانيكير", 45, 90], ["פדיקור", "باديكير", 60, 130]],
    staff: [["לינא", "لينا"]],
  },
};
const DEFAULT_HOURS: Hours[] = [0, 1, 2, 3, 4].map(() => ({ open: true, from: "09:00", to: "20:00" }))
  .concat([{ open: true, from: "08:00", to: "14:00" }, { open: false, from: "09:00", to: "18:00" }]);

export function buildBiz(slug: string, type: string, pin: string, name?: L): Biz {
  const p = PRESETS[type] || PRESETS.barber;
  return {
    slug, type: PRESETS[type] ? type : "barber", icon: p.icon, name: name || { ...p.name }, pin, cutoff: 3,
    services: p.services.map(([he, ar, dur, price]) => ({ id: rid(6), name: { he, ar }, dur, price })),
    staff: p.staff.map(([he, ar]) => ({ id: rid(6), name: { he, ar } })),
    hours: DEFAULT_HOURS.map(h => ({ ...h })), blocked: [], created: Date.now(),
  };
}

/* ---------------- Israel time helpers ---------------- */
const TZ = "Asia/Jerusalem";
const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
export function ilNow(ts = Date.now()) {
  const p: Record<string, string> = {};
  for (const x of fmt.formatToParts(new Date(ts))) p[x.type] = x.value;
  const h = p.hour === "24" ? 0 : +p.hour;
  return { date: `${p.year}-${p.month}-${p.day}`, min: h * 60 + +p.minute, hour: h };
}
export const toMin = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m };
export const toHM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export function addDays(date: string, n: number) {
  const [y, m, d] = date.split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return x.toISOString().slice(0, 10);
}
export const weekday = (date: string) => { const [y, m, d] = date.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
/** epoch ms of a wall-clock time in Israel */
export function ilEpoch(date: string, time: string) {
  const [y, m, d] = date.split("-").map(Number); const mins = toMin(time);
  const guess = Date.UTC(y, m - 1, d, 0, mins);
  const p = ilNow(guess); const [py, pm, pd] = p.date.split("-").map(Number);
  const off = Date.UTC(py, pm - 1, pd, 0, p.min) - guess;
  return guess - off;
}
const isDate = (s: any) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isTime = (s: any) => typeof s === "string" && /^\d{2}:\d{2}$/.test(s);

/* ---------------- storage helpers ---------------- */
export async function getBiz(kv: KV, slug: string): Promise<Biz | null> {
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) return null;
  return (await kv.get(`biz/${slug}`, { type: "json" })) || null;
}
export async function ensureDemo(kv: KV, env: Env) {
  let b = await getBiz(kv, "demo");
  if (!b) { b = buildBiz("demo", "barber", env("ADMIN_PIN") || "1234"); await kv.setJSON("biz/demo", b) }
  return b;
}
export const saveBiz = (kv: KV, b: Biz) => kv.setJSON(`biz/${b.slug}`, b);
export async function getDay(kv: KV, slug: string, date: string): Promise<Booking[]> {
  const d = await kv.get(`day/${slug}/${date}`, { type: "json" });
  return d?.bookings || [];
}
export const saveDay = (kv: KV, slug: string, date: string, bookings: Booking[]) => kv.setJSON(`day/${slug}/${date}`, { bookings });

export function publicBiz(b: Biz) {
  const { pin, blocked, ...rest } = b; return rest;
}
export function publicBooking(b: Booking) {
  const { phone, ...rest } = b; return { ...rest, phoneTail: phone.slice(-4) };
}

/* ---------------- availability ---------------- */
export function freeSlots(biz: Biz, dayBookings: Booking[], date: string, staffId: string, dur: number, ignoreId?: string, nowTs = Date.now()) {
  const h = biz.hours[weekday(date)];
  if (!h || !h.open) return [];
  const now = ilNow(nowTs);
  if (date < now.date) return [];
  const start = toMin(h.from), end = toMin(h.to);
  const busy = dayBookings.filter(b => b.staffId === staffId && b.status !== "cancelled" && b.id !== ignoreId).map(b => [toMin(b.time), toMin(b.time) + b.dur]);
  const out: number[] = [];
  for (let m = start; m + dur <= end; m += 15) {
    if (date === now.date && m <= now.min + 10) continue;
    if (busy.some(([a, z]) => m < z && m + dur > a)) continue;
    out.push(m);
  }
  return out;
}
export function slotsFor(biz: Biz, day: Booking[], date: string, dur: number, staffId: string, ignoreId?: string, nowTs = Date.now()) {
  if (staffId && staffId !== "any") return freeSlots(biz, day, date, staffId, dur, ignoreId, nowTs).map(m => ({ time: toHM(m), staffId }));
  const map = new Map<number, string>();
  for (const s of biz.staff) for (const m of freeSlots(biz, day, date, s.id, dur, ignoreId, nowTs)) if (!map.has(m)) map.set(m, s.id);
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([m, staffId]) => ({ time: toHM(m), staffId }));
}

/* ---------------- WhatsApp ---------------- */
const DAYS = { he: ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"], ar: ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"] };
export const dateText = (date: string, lang: "he" | "ar") => {
  const [, m, d] = date.split("-").map(Number);
  return `${lang === "ar" ? "" : "יום "}${DAYS[lang][weekday(date)]} ${d}/${m}`;
};
// Must match the templates submitted to Meta (see SETUP-WHATSAPP.md). {{1}} name {{2}} business {{3}} service {{4}} date {{5}} time {{6}} link
export const TEMPLATES: Record<"he" | "ar", Record<MsgType, string>> = {
  he: {
    confirm: "שלום {{1}}, התור שלך ב{{2}} נקבע ✅\n{{3}} · {{4}} בשעה {{5}}\nלשינוי או ביטול התור: {{6}}\nתודה!",
    reminder: "שלום {{1}} 👋 תזכורת: מחר, {{4}} בשעה {{5}}, יש לך תור ב{{2}} ({{3}}).\nלשינוי או ביטול: {{6}}\nנתראה!",
    changed: "שלום {{1}}, התור שלך ב{{2}} עודכן ✅\n{{3}} · {{4}} בשעה {{5}}\nלשינוי נוסף: {{6}}\nתודה!",
    cancelled: "שלום {{1}}, התור שלך ב{{2}} ({{3}}) ב{{4}} בשעה {{5}} בוטל.\nלקביעת תור חדש: {{6}}\nתודה!",
  },
  ar: {
    confirm: "مرحبا {{1}}، تم حجز موعدك في {{2}} ✅\n{{3}} · {{4}} الساعة {{5}}\nلتغيير أو إلغاء الموعد: {{6}}\nشكرًا!",
    reminder: "مرحبا {{1}} 👋 تذكير: غدًا، {{4}} الساعة {{5}}، لديك موعد في {{2}} ({{3}}).\nللتغيير أو الإلغاء: {{6}}\nنراك قريبًا!",
    changed: "مرحبا {{1}}، تم تعديل موعدك في {{2}} ✅\n{{3}} · {{4}} الساعة {{5}}\nلتغيير آخر: {{6}}\nشكرًا!",
    cancelled: "مرحبا {{1}}، تم إلغاء موعدك في {{2}} ({{3}}) يوم {{4}} الساعة {{5}}.\nلحجز موعد جديد: {{6}}\nشكرًا!",
  },
};
export function msgParams(b: Booking, biz: Biz, type: MsgType, siteUrl: string) {
  const lang = b.lang === "ar" ? "ar" : "he";
  const link = type === "cancelled" ? `${siteUrl}/b/${biz.slug}` : `${siteUrl}/m/${b.id}`;
  return [b.name, biz.name[lang] || biz.name.he, b.serviceName[lang] || b.serviceName.he, dateText(b.date, lang), b.time, link]
    .map(s => String(s).replace(/[\n\t]+/g, " ").replace(/ {4,}/g, " ").trim());
}
export const renderText = (type: MsgType, lang: "he" | "ar", params: string[]) =>
  TEMPLATES[lang][type].replace(/\{\{(\d)\}\}/g, (_, i) => params[+i - 1] ?? "");

export async function sendWhatsApp(env: Env, b: Booking, biz: Biz, type: MsgType, siteUrl: string, fetchImpl: typeof fetch = fetch): Promise<MsgLog> {
  const lang = b.lang === "ar" ? "ar" : "he";
  const params = msgParams(b, biz, type, siteUrl);
  const log: MsgLog = { id: rid(8), at: Date.now(), type, bookingId: b.id, name: b.name, phone: b.phone, status: "demo", text: renderText(type, lang, params) };
  const token = env("WA_TOKEN"), phoneId = env("WA_PHONE_ID");
  if (!token || !phoneId) return log; // demo mode: nothing is sent until Meta credentials are configured
  try {
    const res = await fetchImpl(`https://graph.facebook.com/${env("WA_API_VERSION") || "v23.0"}/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp", to: "972" + b.phone.replace(/^0/, ""), type: "template",
        template: {
          name: env(`WA_TPL_${type.toUpperCase()}`) || `torlink_${type}`,
          language: { code: lang },
          components: [{ type: "body", parameters: params.map(text => ({ type: "text", text })) }],
        },
      }),
    });
    const j: any = await res.json().catch(() => ({}));
    if (!res.ok) { log.status = "failed"; log.error = j?.error?.message || `HTTP ${res.status}` }
    else log.status = "sent";
  } catch (e: any) { log.status = "failed"; log.error = String(e?.message || e) }
  return log;
}
export async function logMsg(kv: KV, slug: string, m: MsgLog) {
  const key = `msgs/${slug}/${ilNow(m.at).date.slice(0, 7)}`;
  const doc = (await kv.get(key, { type: "json" })) || { items: [] };
  doc.items.push(m);
  if (doc.items.length > 3000) doc.items = doc.items.slice(-3000);
  await kv.setJSON(key, doc);
}
async function notify(kv: KV, env: Env, b: Booking, biz: Biz, type: MsgType, siteUrl: string, fetchImpl?: typeof fetch) {
  const m = await sendWhatsApp(env, b, biz, type, siteUrl, fetchImpl);
  await logMsg(kv, biz.slug, m);
  return { status: m.status, text: m.text, error: m.error };
}

/* ---------------- booking actions ---------------- */
const cleanPhone = (p: any) => String(p || "").replace(/\D/g, "").replace(/^972/, "0");

export async function createBooking(kv: KV, env: Env, biz: Biz, input: any, siteUrl: string, fetchImpl?: typeof fetch) {
  const svc = biz.services.find(s => s.id === input.serviceId);
  if (!svc) throw new HttpError(400, "bad_service");
  if (!isDate(input.date) || !isTime(input.time)) throw new HttpError(400, "bad_time");
  const name = String(input.name || "").trim().slice(0, 60);
  const phone = cleanPhone(input.phone);
  if (!name) throw new HttpError(400, "bad_name");
  if (!/^05\d{8}$/.test(phone)) throw new HttpError(400, "bad_phone");
  if (biz.blocked.includes(phone)) throw new HttpError(403, "blocked");
  const today = ilNow().date;
  if (input.date < today || input.date > addDays(today, 60)) throw new HttpError(400, "bad_time");
  const day = await getDay(kv, biz.slug, input.date);
  const free = slotsFor(biz, day, input.date, svc.dur, input.staffId || "any");
  const slot = free.find(s => s.time === input.time && (!input.staffId || input.staffId === "any" || s.staffId === input.staffId));
  if (!slot) throw new HttpError(409, "taken");
  const b: Booking = {
    id: newToken(), slug: biz.slug, date: input.date, time: input.time, dur: svc.dur,
    serviceId: svc.id, serviceName: { ...svc.name }, staffId: slot.staffId, name, phone, price: svc.price,
    status: "confirmed", lang: input.lang === "ar" ? "ar" : "he", created: Date.now(), history: [{ type: "confirm", at: Date.now() }],
  };
  day.push(b);
  await saveDay(kv, biz.slug, b.date, day);
  await kv.setJSON(`tok/${b.id}`, { slug: biz.slug, date: b.date });
  const message = await notify(kv, env, b, biz, "confirm", siteUrl, fetchImpl);
  return { booking: publicBooking(b), message };
}

export async function findByToken(kv: KV, token: string) {
  if (!/^[A-Za-z0-9]{8,20}$/.test(token)) throw new HttpError(404, "not_found");
  const idx = await kv.get(`tok/${token}`, { type: "json" });
  if (!idx) throw new HttpError(404, "not_found");
  const biz = await getBiz(kv, idx.slug);
  if (!biz) throw new HttpError(404, "not_found");
  const day = await getDay(kv, biz.slug, idx.date);
  const b = day.find(x => x.id === token);
  if (!b) throw new HttpError(404, "not_found");
  return { biz, day, b };
}
export function changeState(biz: Biz, b: Booking, nowTs = Date.now()) {
  if (b.status !== "confirmed") return { canChange: false, reason: b.status };
  const left = (ilEpoch(b.date, b.time) - nowTs) / 3600e3;
  if (left <= 0) return { canChange: false, reason: "passed" };
  if (left < biz.cutoff) return { canChange: false, reason: "too_late" };
  return { canChange: true, reason: "" };
}
export async function reschedule(kv: KV, env: Env, token: string, input: any, siteUrl: string, fetchImpl?: typeof fetch) {
  const { biz, day, b } = await findByToken(kv, token);
  const st = changeState(biz, b);
  if (!st.canChange) throw new HttpError(403, st.reason);
  if (!isDate(input.date) || !isTime(input.time)) throw new HttpError(400, "bad_time");
  const today = ilNow().date;
  if (input.date < today || input.date > addDays(today, 60)) throw new HttpError(400, "bad_time");
  const target = input.date === b.date ? day : await getDay(kv, biz.slug, input.date);
  const staffId = biz.staff.some(s => s.id === input.staffId) ? input.staffId : b.staffId;
  const ok = freeSlots(biz, target, input.date, staffId, b.dur, b.id).includes(toMin(input.time));
  if (!ok) throw new HttpError(409, "taken");
  const oldDate = b.date;
  b.date = input.date; b.time = input.time; b.staffId = staffId; b.reminderSent = false;
  (b.history ||= []).push({ type: "changed", at: Date.now() });
  if (oldDate === b.date) await saveDay(kv, biz.slug, b.date, day);
  else {
    await saveDay(kv, biz.slug, oldDate, day.filter(x => x.id !== b.id));
    target.push(b); await saveDay(kv, biz.slug, b.date, target);
    await kv.setJSON(`tok/${b.id}`, { slug: biz.slug, date: b.date });
  }
  const message = await notify(kv, env, b, biz, "changed", siteUrl, fetchImpl);
  return { booking: publicBooking(b), message };
}
export async function cancelByClient(kv: KV, env: Env, token: string, siteUrl: string, fetchImpl?: typeof fetch) {
  const { biz, day, b } = await findByToken(kv, token);
  const st = changeState(biz, b);
  if (!st.canChange) throw new HttpError(403, st.reason);
  b.status = "cancelled"; (b.history ||= []).push({ type: "cancelled", at: Date.now() });
  await saveDay(kv, biz.slug, b.date, day);
  const message = await notify(kv, env, b, biz, "cancelled", siteUrl, fetchImpl);
  return { booking: publicBooking(b), message };
}

/* ---------------- admin ---------------- */
export async function adminBookings(kv: KV, slug: string, from: string, to: string) {
  if (!isDate(from) || !isDate(to) || from > to) throw new HttpError(400, "bad_range");
  const dates: string[] = [];
  for (let d = from; d <= to && dates.length < 125; d = addDays(d, 1)) dates.push(d);
  const days = await Promise.all(dates.map(d => getDay(kv, slug, d)));
  return days.flat();
}
export async function adminSetStatus(kv: KV, env: Env, biz: Biz, date: string, id: string, status: string, siteUrl: string, fetchImpl?: typeof fetch) {
  if (!["confirmed", "arrived", "noshow", "cancelled"].includes(status)) throw new HttpError(400, "bad_status");
  const day = await getDay(kv, biz.slug, date);
  const b = day.find(x => x.id === id);
  if (!b) throw new HttpError(404, "not_found");
  const prev = b.status;
  b.status = status as Booking["status"];
  let message = null;
  if (status === "cancelled" && prev !== "cancelled") {
    (b.history ||= []).push({ type: "cancelled", at: Date.now() });
    await saveDay(kv, biz.slug, date, day);
    if (ilEpoch(b.date, b.time) > Date.now()) message = await notify(kv, env, b, biz, "cancelled", siteUrl, fetchImpl);
  } else await saveDay(kv, biz.slug, date, day);
  return { booking: b, message };
}
export function sanitizeConfig(biz: Biz, c: any): Biz {
  const L = (o: any): L => ({ he: String(o?.he || "").slice(0, 60), ar: String(o?.ar || "").slice(0, 60) });
  const out = { ...biz };
  if (c.name) out.name = L(c.name);
  if (Array.isArray(c.services) && c.services.length) out.services = c.services.slice(0, 40).map((s: any) => ({ id: /^[A-Za-z0-9]{3,12}$/.test(s.id) ? s.id : rid(6), name: L(s.name), dur: Math.min(480, Math.max(5, Math.round(+s.dur / 5) * 5 || 30)), price: Math.max(0, Math.round(+s.price || 0)) }));
  if (Array.isArray(c.staff) && c.staff.length) out.staff = c.staff.slice(0, 20).map((s: any) => ({ id: /^[A-Za-z0-9]{3,12}$/.test(s.id) ? s.id : rid(6), name: L(s.name) }));
  if (Array.isArray(c.hours) && c.hours.length === 7) out.hours = c.hours.map((h: any) => ({ open: !!h.open, from: isTime(h.from) ? h.from : "09:00", to: isTime(h.to) ? h.to : "18:00" }));
  if (c.cutoff != null) out.cutoff = Math.min(72, Math.max(0, +c.cutoff || 0));
  if (Array.isArray(c.blocked)) out.blocked = c.blocked.map(cleanPhone).filter((p: string) => /^05\d{8}$/.test(p)).slice(0, 500);
  if (typeof c.pin === "string" && /^\d{4,8}$/.test(c.pin)) out.pin = c.pin;
  return out;
}
export async function adminMessages(kv: KV, slug: string) {
  const ym = ilNow().date.slice(0, 7);
  const [y, m] = ym.split("-").map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const docs = await Promise.all([ym, prev].map(k => kv.get(`msgs/${slug}/${k}`, { type: "json" })));
  return docs.flatMap(d => d?.items || []).sort((a: MsgLog, b: MsgLog) => b.at - a.at).slice(0, 150);
}

/* ---------------- reminders (run hourly) ---------------- */
export async function runReminders(kv: KV, env: Env, siteUrl: string, nowTs = Date.now(), fetchImpl?: typeof fetch) {
  const now = ilNow(nowTs);
  const hour = +(env("REMINDER_HOUR") || 18);
  if (now.hour < hour) return { skipped: "before_hour", sent: 0 };
  const tomorrow = addDays(now.date, 1);
  const { blobs } = await kv.list({ prefix: "biz/" });
  let sent = 0;
  for (const { key } of blobs) {
    const biz: Biz = await kv.get(key, { type: "json" });
    if (!biz) continue;
    const day = await getDay(kv, biz.slug, tomorrow);
    let changed = false;
    for (const b of day) {
      if (b.status !== "confirmed" || b.reminderSent) continue;
      b.reminderSent = true; changed = true;
      if (nowTs - b.created < 3 * 3600e3) continue; // just booked — the confirmation is enough
      const m = await sendWhatsApp(env, b, biz, "reminder", siteUrl, fetchImpl);
      await logMsg(kv, biz.slug, m); sent++;
    }
    if (changed) await saveDay(kv, biz.slug, tomorrow, day);
  }
  return { sent };
}
