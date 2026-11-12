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

export interface Service { id: string; name: L; dur: number; price: number; icon?: string; img?: number }
export interface Staff { id: string; name: L; hours?: Hours[] | null }
export interface Hours { open: boolean; from: string; to: string; bFrom?: string; bTo?: string }
export interface Closure { id: string; from: string; to: string; staff: string; note: string }
export interface Notify { phone: string; lang: "he" | "ar"; onBook: boolean; onCancel: boolean; daily: boolean }
export interface Product { id: string; name: L; desc: L; price: number; stock: number; icon: string; active: boolean; img?: number; spin?: number; spinN?: number }
export interface Club { enabled: boolean; rewardEvery: number; reward: L }
/** prepaid package the business sells, e.g. "10 haircuts" */
export interface Package { id: string; name: L; serviceId: string; count: number; price: number; validDays: number; active: boolean }
/** a package a client bought; `uses` is the redeem log */
export interface Pack { id: string; pkgId: string; name: L; serviceId: string; total: number; left: number; price: number; bought: number; expires: string; method: string; uses: { at: number; bookingId?: string }[] }
export interface Biz {
  slug: string; type: string; icon: string; name: L; pin: string; cutoff: number;
  services: Service[]; staff: Staff[]; hours: Hours[]; blocked: string[]; created: number;
  products: Product[]; club: Club; address?: string; phone?: string;
  theme: Theme; social: Social; tagline: L; logoV: number; gallery: string[]; rating: { avg: number; count: number };
  bot: { enabled: boolean; ai: boolean }; waPhoneId?: string;
  status: "pending" | "active" | "suspended"; paidUntil: string; plan: string; owner: { name: string; phone: string };
  closed: Closure[]; notify: Notify; packages: Package[];
}
export interface Theme { accent: string; mode: "dark" | "light"; logoBg?: "light" | "dark" | ""; skin?: string }
export interface Social { instagram: string; facebook: string; tiktok: string; whatsapp: string; waze: string }
export interface Review { id: string; name: string; stars: number; text: string; at: number; service: L; reply?: string }
/** Customer-club record, kept up to date as bookings/orders change status */
export interface Client {
  phone: string; name: string; first: number; lang: "he" | "ar";
  bookings: number; visits: number; noshows: number; cancels: number; spend: number; productSpend: number;
  last: string; visitDates: string[]; services: Record<string, number>;
  notes: string; tags: string[]; birthday: string; rewardsUsed: number;
  packs?: Pack[]; card?: string;
}
export interface OrderItem { id: string; name: L; price: number; qty: number; icon: string }
export interface Order { id: string; code: string; slug: string; items: OrderItem[]; total: number; name: string; phone: string; note: string; status: "new" | "ready" | "picked" | "cancelled"; created: number; lang: "he" | "ar" }
export interface Booking {
  id: string; slug: string; date: string; time: string; dur: number;
  serviceId: string; serviceName: L; staffId: string; name: string; phone: string; price: number;
  status: "confirmed" | "arrived" | "noshow" | "cancelled"; lang: "he" | "ar";
  created: number; reminderSent?: boolean; history?: { type: string; at: number }[];
}
export type MsgType = "confirm" | "reminder" | "changed" | "cancelled" | "owner" | "daily";
export interface MsgLog { id: string; at: number; type: MsgType; bookingId: string; name: string; phone: string; status: "sent" | "demo" | "failed"; text: string; error?: string }

export class HttpError extends Error { constructor(public status: number, public code: string) { super(code) } }

/* ---------------- presets ---------------- */
export const rid = (n = 8) => {
  const a = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(bytes, b => a[b % a.length]).join("");
};
export const newToken = () => rid(12);

type PSvc = [string, string, number, number, string];
type PProd = [string, string, string, string, number, number, string];
export const PRESETS: Record<string, { icon: string; name: L; services: PSvc[]; staff: [string, string][]; products: PProd[]; reward: L }> = {
  barber: {
    icon: "scissors", name: { he: "ברבר סטודיו", ar: "باربر ستوديو" },
    services: [["תספורת גבר", "قص شعر رجالي", 30, 60, "scissors"], ["תספורת + זקן", "قص شعر + لحية", 45, 80, "crown"], ["עיצוב זקן", "تصفيف لحية", 20, 40, "sparkles"], ["תספורת ילד", "قص شعر أطفال", 25, 50, "smile"], ["החלקה", "تمليس", 60, 150, "wind"]],
    staff: [["מוחמד", "محمد"]],
    products: [
      ["ווקס לשיער – אחיזה חזקה", "واكس للشعر – تثبيت قوي", "גימור מט, מחזיק כל היום", "لمسة مطفأة، يثبت طوال اليوم", 55, 12, "gem"],
      ["שמן זקן פרימיום", "زيت لحية فاخر", "מרכך ומבריק, ריח עצי", "يُنعّم ويُلمّع، برائحة خشبية", 70, 8, "droplet"],
      ["שמפו לזקן", "شامبو للحية", "ניקוי עדין ליום-יום", "تنظيف لطيف يومي", 45, 10, "flask-conical"],
      ["פומייד מבריק", "بوميد لامع", "מראה קלאסי ומסודר", "مظهر كلاسيكي مرتب", 60, 6, "sparkles"],
      ["מסרק עץ לזקן", "مشط خشبي للحية", "עבודת יד, נגד חשמל סטטי", "صناعة يدوية، ضد الكهرباء الساكنة", 35, 15, "align-justify"],
      ["אפטרשייב מרגיע", "أفترشيف مهدئ", "מרגיע את העור אחרי גילוח", "يهدئ البشرة بعد الحلاقة", 50, 9, "spray-can"],
    ],
    reward: { he: "תספורת חינם", ar: "قصة شعر مجانية" },
  },
  nails: {
    icon: "sparkles", name: { he: "סטודיו ציפורניים", ar: "ستوديو أظافر" },
    services: [["בניית ציפורניים", "تركيب أظافر", 120, 250, "gem"], ["מילוי", "تعبئة", 90, 180, "repeat"], ["לק ג׳ל", "جل", 60, 120, "droplet"], ["מניקור", "مانيكير", 45, 90, "hand"], ["פדיקור", "باديكير", 60, 130, "footprints"]],
    staff: [["לינא", "لينا"]],
    products: [
      ["שמן קוטיקולה", "زيت الجلد المحيط بالأظافر", "מזין ומרכך", "مغذٍّ ومُنعّم", 40, 12, "droplet"],
      ["קרם ידיים", "كريم لليدين", "לחות עמוקה", "ترطيب عميق", 45, 10, "hand"],
      ["פצירה מקצועית", "مبرد احترافي", "לעיצוב מדויק", "لتشكيل دقيق", 20, 20, "align-justify"],
      ["לק ג׳ל לבית", "جل للمنزل", "מגוון גוונים", "ألوان متنوعة", 35, 15, "palette"],
    ],
    reward: { he: "מניקור חינם", ar: "مانيكير مجاني" },
  },
  beauty: {
    icon: "wind", name: { he: "סלון שיער", ar: "صالون شعر" },
    services: [["תספורת נשים", "قص شعر نسائي", 45, 120, "scissors"], ["פן", "سشوار", 30, 80, "wind"], ["צבע שורשים", "صبغة جذور", 90, 250, "palette"], ["גוונים", "هايلايت", 150, 450, "sparkles"], ["החלקה", "تمليس", 180, 700, "flame"]],
    staff: [["רים", "ريم"]],
    products: [
      ["מסכה משקמת לשיער", "ماسك مرمم للشعر", "לשיער צבוע ויבש", "للشعر المصبوغ والجاف", 75, 10, "droplet"],
      ["שמפו מקצועי", "شامبو احترافي", "ללא סולפטים", "بدون سلفات", 65, 12, "flask-conical"],
      ["סרום ברק", "سيروم لمعان", "נגד קרזול", "ضد التجعد", 90, 8, "sparkles"],
      ["ספריי הגנה מחום", "سبراي حماية من الحرارة", "לפני פן ומחליק", "قبل السشوار والمكواة", 55, 10, "spray-can"],
    ],
    reward: { he: "פן חינם", ar: "سشوار مجاني" },
  },
  cosmetics: {
    icon: "leaf", name: { he: "קליניקה לקוסמטיקה", ar: "عيادة تجميل" },
    services: [["טיפול פנים קלאסי", "علاج وجه كلاسيكي", 60, 250, "sparkles"], ["ניקוי עמוק", "تنظيف عميق", 75, 300, "droplet"], ["פילינג", "تقشير", 45, 220, "leaf"], ["עיצוב גבות", "تشقير حواجب", 20, 50, "brush"], ["הסרת שיער בשעווה", "إزالة شعر بالشمع", 30, 90, "flame"]],
    staff: [["נור", "نور"]],
    products: [
      ["קרם לחות", "كريم مرطب", "לכל סוגי העור", "لكل أنواع البشرة", 120, 10, "droplet"],
      ["סרום ויטמין C", "سيروم فيتامين C", "להבהרה וזוהר", "للتفتيح والنضارة", 160, 8, "sparkles"],
      ["קרם הגנה SPF50", "واقي شمس SPF50", "קל ולא שומני", "خفيف وغير دهني", 95, 12, "shield"],
      ["מי פנים", "تونر", "מאזן ומרענן", "يوازن وينعش", 70, 10, "leaf"],
    ],
    reward: { he: "עיצוב גבות חינם", ar: "تشقير حواجب مجاني" },
  },
  lashes: {
    icon: "star", name: { he: "סטודיו ריסים וגבות", ar: "ستوديو رموش وحواجب" },
    services: [["הרמת ריסים", "رفع رموش", 60, 180, "star"], ["הארכת ריסים", "تركيب رموش", 120, 350, "sparkles"], ["מילוי ריסים", "تعبئة رموش", 75, 200, "repeat"], ["עיצוב גבות", "تشقير حواجب", 20, 50, "brush"], ["הרמת גבות", "رفع حواجب", 45, 150, "crown"]],
    staff: [["לין", "لين"]],
    products: [
      ["סרום לצמיחת ריסים", "سيروم لتطويل الرموش", "תוצאות תוך 6 שבועות", "نتائج خلال 6 أسابيع", 120, 10, "sparkles"],
      ["סרום גבות", "سيروم حواجب", "לגבות מלאות", "لحواجب كثيفة", 110, 8, "brush"],
      ["מברשות ריסים", "فراشي رموش", "סט של 10", "طقم 10 قطع", 15, 30, "align-justify"],
    ],
    reward: { he: "עיצוב גבות חינם", ar: "تشقير حواجب مجاني" },
  },
};
/** which look each industry gets automatically */
export const TYPE_ACCENT: Record<string, string> = { barber: "#c9a45c", nails: "#d58fa6", beauty: "#c8a27a", cosmetics: "#7fa58b", lashes: "#b07c9e" };
export const ICONS = ["scissors", "crown", "sparkles", "smile", "wind", "gem", "repeat", "droplet", "hand", "footprints", "flask-conical", "align-justify", "spray-can", "palette", "brush", "package", "star", "heart", "flame", "leaf", "zap", "shield"];
const safeIcon = (s: any, d = "package") => (ICONS.includes(s) ? s : d);
const defaultClub = (type: string): Club => ({ enabled: true, rewardEvery: 10, reward: { ...(PRESETS[type] || PRESETS.barber).reward } });
/** fills fields added in later versions so older saved businesses keep working */
export function normalizeBiz(b: Biz): Biz {
  const p = PRESETS[b.type] || PRESETS.barber;
  if (!Array.isArray(b.products)) b.products = [];
  if (!b.club) b.club = defaultClub(b.type);
  if (!b.theme) b.theme = { accent: TYPE_ACCENT[b.type] || "#c9a45c", mode: "dark" };
  if (!b.theme.skin) b.theme.skin = "auto";
  if (!b.social) b.social = { instagram: "", facebook: "", tiktok: "", whatsapp: "", waze: "" };
  if (!b.tagline) b.tagline = { he: "", ar: "" };
  if (typeof b.logoV !== "number") b.logoV = 0;
  if (!Array.isArray(b.gallery)) b.gallery = [];
  if (!b.rating) b.rating = { avg: 0, count: 0 };
  if (!b.bot) b.bot = { enabled: true, ai: true };
  if (!b.status) b.status = "active"; // businesses created before subscriptions existed
  if (typeof b.paidUntil !== "string") b.paidUntil = "";
  if (typeof b.plan !== "string") b.plan = "";
  if (!b.owner) b.owner = { name: "", phone: b.phone || "" };
  if (!Array.isArray(b.closed)) b.closed = [];
  if (!b.notify) b.notify = { phone: (b.phone || "").replace(/\D/g, ""), lang: "he", onBook: true, onCancel: true, daily: true };
  if (!Array.isArray(b.packages)) b.packages = defaultPackages(b);
  if (!ICONS.includes(b.icon)) b.icon = p.icon;
  b.services.forEach((s, i) => { if (!s.icon) s.icon = p.services[i]?.[4] || "scissors" });
  return b;
}
/** a starter "10 visits" package on the main service, ~15% off */
export function defaultPackages(b: Biz): Package[] {
  const s = b.services[0]; if (!s) return [];
  const n = 10, price = Math.round(s.price * n * 0.85 / 10) * 10;
  return [{ id: rid(6), name: { he: `כרטיסייה · ${n} × ${s.name.he}`, ar: `بطاقة · ${n} × ${s.name.ar}` }, serviceId: s.id, count: n, price, validDays: 365, active: true }];
}
const DEFAULT_HOURS: Hours[] = [0, 1, 2, 3, 4].map(() => ({ open: true, from: "09:00", to: "20:00" }))
  .concat([{ open: true, from: "08:00", to: "14:00" }, { open: false, from: "09:00", to: "18:00" }]);

export function buildBiz(slug: string, type: string, pin: string, name?: L): Biz {
  const p = PRESETS[type] || PRESETS.barber;
  return normalizeBiz({
    slug, type: PRESETS[type] ? type : "barber", icon: p.icon, name: name || { ...p.name }, pin, cutoff: 3,
    services: p.services.map(([he, ar, dur, price, icon]) => ({ id: rid(6), name: { he, ar }, dur, price, icon })),
    staff: p.staff.map(([he, ar]) => ({ id: rid(6), name: { he, ar } })),
    hours: DEFAULT_HOURS.map(h => ({ ...h })), blocked: [], created: Date.now(),
    products: p.products.map(([he, ar, dhe, dar, price, stock, icon]) => ({ id: rid(6), name: { he, ar }, desc: { he: dhe, ar: dar }, price, stock, icon, active: true })),
    club: defaultClub(type),
  } as Biz);
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
export const isDate = (s: any) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const isTime = (s: any) => typeof s === "string" && /^\d{2}:\d{2}$/.test(s);

/* ---------------- storage helpers ---------------- */
export async function getBiz(kv: KV, slug: string): Promise<Biz | null> {
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) return null;
  const b = await kv.get(`biz/${slug}`, { type: "json" });
  return b ? normalizeBiz(b) : null;
}
/** one live demo per industry: /b/demo, /b/demo-nails, /b/demo-beauty, /b/demo-cosmetics, /b/demo-lashes */
export const DEMOS: Record<string, string> = { demo: "barber", "demo-nails": "nails", "demo-beauty": "beauty", "demo-cosmetics": "cosmetics", "demo-lashes": "lashes" };
export async function ensureDemo(kv: KV, env: Env, slug = "demo") {
  if (!DEMOS[slug]) slug = "demo";
  let b = await getBiz(kv, slug);
  if (!b) { b = buildBiz(slug, DEMOS[slug], env("ADMIN_PIN") || "1234"); await kv.setJSON(`biz/${slug}`, b) }
  return b;
}

/* ---------------- customer club ---------------- */
export async function getClients(kv: KV, slug: string): Promise<Record<string, Client>> {
  return (await kv.get(`clients/${slug}`, { type: "json" }))?.items || {};
}
export const saveClients = (kv: KV, slug: string, items: Record<string, Client>) => kv.setJSON(`clients/${slug}`, { items });
export function blankClient(phone: string, name: string, lang: "he" | "ar" = "he"): Client {
  return { phone, name, first: Date.now(), lang, bookings: 0, visits: 0, noshows: 0, cancels: 0, spend: 0, productSpend: 0, last: "", visitDates: [], services: {}, notes: "", tags: [], birthday: "", rewardsUsed: 0 };
}
/** moves a booking's effect on the client from status `prev` to `next` */
export function applyStatus(c: Client, b: Booking, prev: string | null, next: string | null) {
  if (prev === next) return;
  const sid = b.serviceId;
  if (prev === "arrived") {
    c.visits = Math.max(0, c.visits - 1); c.spend = Math.max(0, c.spend - b.price);
    const i = c.visitDates.lastIndexOf(b.date); if (i >= 0) c.visitDates.splice(i, 1);
    c.services[sid] = Math.max(0, (c.services[sid] || 1) - 1);
  } else if (prev === "noshow") c.noshows = Math.max(0, c.noshows - 1);
  else if (prev === "cancelled") c.cancels = Math.max(0, c.cancels - 1);
  if (next === "arrived") {
    c.visits++; c.spend += b.price; c.visitDates.push(b.date); c.visitDates.sort();
    if (c.visitDates.length > 60) c.visitDates = c.visitDates.slice(-60);
    c.services[sid] = (c.services[sid] || 0) + 1;
  } else if (next === "noshow") c.noshows++;
  else if (next === "cancelled") c.cancels++;
  c.last = c.visitDates[c.visitDates.length - 1] || "";
}
export async function touchClient(kv: KV, slug: string, phone: string, fn: (c: Client) => void, name?: string, lang?: "he" | "ar") {
  const items = await getClients(kv, slug);
  const c = items[phone] || (items[phone] = blankClient(phone, name || "", lang));
  if (name && !c.name) c.name = name;
  fn(c);
  await saveClients(kv, slug, items);
  return c;
}
export function clubCard(biz: Biz, c: Client | undefined) {
  const visits = c?.visits || 0, every = Math.max(2, biz.club.rewardEvery);
  const earned = Math.floor(visits / every), available = Math.max(0, earned - (c?.rewardsUsed || 0));
  const tier = visits >= 30 ? "vip" : visits >= 15 ? "gold" : visits >= 5 ? "silver" : "member";
  return { enabled: biz.club.enabled, visits, every, progress: visits % every, available, reward: biz.club.reward, tier, name: c?.name || "" };
}
/** rebuilds every client record from bookings (used for imports / sample data) */
export function buildClients(bookings: Booking[]): Record<string, Client> {
  const items: Record<string, Client> = {};
  for (const b of [...bookings].sort((a, z) => a.created - z.created)) {
    const c = items[b.phone] || (items[b.phone] = blankClient(b.phone, b.name, b.lang));
    c.first = Math.min(c.first, b.created); c.bookings++;
    applyStatus(c, b, null, b.status === "confirmed" ? null : b.status);
  }
  return items;
}

/* ---------------- media: logo + work gallery (data URLs kept as separate blobs) ---------------- */
const IMG_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
export async function setLogo(kv: KV, biz: Biz, dataUrl: string) {
  if (dataUrl === "") { await kv.delete(`media/${biz.slug}/logo`); biz.logoV = 0 }
  else {
    if (!IMG_RE.test(dataUrl) || dataUrl.length > 700_000) throw new HttpError(400, "bad_image");
    await kv.setJSON(`media/${biz.slug}/logo`, { src: dataUrl }); biz.logoV = Date.now();
  }
  await saveBiz(kv, biz); return biz;
}
export async function addGalleryImage(kv: KV, biz: Biz, dataUrl: string) {
  if (!IMG_RE.test(dataUrl) || dataUrl.length > 700_000) throw new HttpError(400, "bad_image");
  if (biz.gallery.length >= 12) throw new HttpError(400, "gallery_full");
  const id = rid(10);
  await kv.setJSON(`media/${biz.slug}/g/${id}`, { src: dataUrl });
  biz.gallery.unshift(id); await saveBiz(kv, biz); return biz;
}
export async function removeGalleryImage(kv: KV, biz: Biz, id: string) {
  biz.gallery = biz.gallery.filter(x => x !== id);
  await kv.delete(`media/${biz.slug}/g/${id}`); await saveBiz(kv, biz); return biz;
}
/** photo of a product (kind "p") or service (kind "s"); best as a transparent PNG cut-out for the 3D catalog */
export async function setItemImage(kv: KV, biz: Biz, kind: string, id: string, dataUrl: string) {
  const list: (Product | Service)[] = kind === "p" ? biz.products : kind === "s" ? biz.services : [];
  const it = list.find(x => x.id === id);
  if (!it) throw new HttpError(404, "not_found");
  const key = `media/${biz.slug}/${kind}/${id}`;
  if (dataUrl === "") { await kv.delete(key); it.img = 0 }
  else {
    if (!IMG_RE.test(dataUrl) || dataUrl.length > 900_000) throw new HttpError(400, "bad_image");
    await kv.setJSON(key, { src: dataUrl }); it.img = Date.now();
  }
  await saveBiz(kv, biz); return biz;
}
/** 360° view: frames cut from a short video of the product turning */
export async function setSpin(kv: KV, biz: Biz, id: string, frames: any) {
  const p = biz.products.find(x => x.id === id);
  if (!p) throw new HttpError(404, "not_found");
  const key = `media/${biz.slug}/r/${id}`;
  if (!Array.isArray(frames) || !frames.length) { await kv.delete(key); p.spin = 0; p.spinN = 0 }
  else {
    if (frames.length < 8 || frames.length > 48 || frames.some(f => typeof f !== "string" || !IMG_RE.test(f) || f.length > 160_000)) throw new HttpError(400, "bad_image");
    await kv.setJSON(key, { frames }); p.spin = Date.now(); p.spinN = frames.length;
  }
  await saveBiz(kv, biz); return biz;
}
export async function getSpin(kv: KV, slug: string, id: string) {
  if (!/^[A-Za-z0-9]{3,12}$/.test(id)) return null;
  return (await kv.get(`media/${slug}/r/${id}`, { type: "json" }))?.frames || null;
}
export async function getImage(kv: KV, slug: string, which: string): Promise<string | null> {
  if (!/^(logo|g\/[A-Za-z0-9]{6,14}|[ps]\/[A-Za-z0-9]{3,12})$/.test(which)) return null;
  return (await kv.get(`media/${slug}/${which}`, { type: "json" }))?.src || null;
}
export function decodeDataUrl(src: string) {
  const m = src.match(/^data:(image\/[a-z]+);base64,(.*)$/)!;
  const bin = atob(m[2]); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { type: m[1], bytes };
}

/* ---------------- reviews ---------------- */
export async function getReviews(kv: KV, slug: string): Promise<Review[]> {
  return (await kv.get(`reviews/${slug}`, { type: "json" }))?.items || [];
}
export async function addReview(kv: KV, token: string, input: any) {
  const { biz, day, b } = await findByToken(kv, token);
  if (b.status !== "arrived") throw new HttpError(403, "not_visited");
  if ((b as any).reviewed) throw new HttpError(409, "already_reviewed");
  const stars = Math.round(+input.stars);
  if (!(stars >= 1 && stars <= 5)) throw new HttpError(400, "bad_stars");
  const items = await getReviews(kv, biz.slug);
  const r: Review = { id: b.id, name: b.name.split(" ")[0], stars, text: String(input.text || "").trim().slice(0, 400), at: Date.now(), service: b.serviceName };
  items.unshift(r);
  await kv.setJSON(`reviews/${biz.slug}`, { items: items.slice(0, 1000) });
  (b as any).reviewed = stars; await saveDay(kv, biz.slug, b.date, day);
  const all = items.length, sum = items.reduce((a, x) => a + x.stars, 0);
  biz.rating = { avg: Math.round(sum / all * 10) / 10, count: all }; await saveBiz(kv, biz);
  return r;
}
/** what the public page shows: best recent reviews with text */
export const publicReviews = (items: Review[]) => items.filter(r => r.text && r.stars >= 4).slice(0, 12).map(({ id, ...r }) => r);

/* ---------------- store ---------------- */
export async function createOrder(kv: KV, biz: Biz, input: any) {
  const name = String(input.name || "").trim().slice(0, 60);
  const phone = cleanPhone(input.phone);
  if (!name) throw new HttpError(400, "bad_name");
  if (!/^05\d{8}$/.test(phone)) throw new HttpError(400, "bad_phone");
  if (!Array.isArray(input.items) || !input.items.length) throw new HttpError(400, "empty_cart");
  const items: OrderItem[] = [];
  for (const it of input.items.slice(0, 30)) {
    const p = biz.products.find(x => x.id === it.id && x.active);
    const qty = Math.max(1, Math.min(20, Math.floor(+it.qty || 1)));
    if (!p) throw new HttpError(400, "bad_product");
    if (p.stock < qty) throw new HttpError(409, "out_of_stock");
    items.push({ id: p.id, name: { ...p.name }, price: p.price, qty, icon: p.icon });
  }
  items.forEach(it => { biz.products.find(x => x.id === it.id)!.stock -= it.qty });
  await saveBiz(kv, biz);
  const o: Order = {
    id: rid(10), code: String(1000 + Math.floor(Math.random() * 9000)), slug: biz.slug, items,
    total: items.reduce((a, i) => a + i.price * i.qty, 0), name, phone, note: String(input.note || "").slice(0, 200),
    status: "new", created: Date.now(), lang: input.lang === "ar" ? "ar" : "he",
  };
  const key = `orders/${biz.slug}/${ilNow(o.created).date.slice(0, 7)}`;
  const doc = (await kv.get(key, { type: "json" })) || { items: [] };
  doc.items.push(o); await kv.setJSON(key, doc);
  await touchClient(kv, biz.slug, phone, () => { }, name, o.lang);
  return o;
}
const monthKeys = (n: number) => {
  const out: string[] = []; let [y, m] = ilNow().date.slice(0, 7).split("-").map(Number);
  for (let i = 0; i < n; i++) { out.push(`${y}-${String(m).padStart(2, "0")}`); m--; if (!m) { m = 12; y-- } }
  return out;
};
export async function adminOrders(kv: KV, slug: string, months = 3): Promise<Order[]> {
  const docs = await Promise.all(monthKeys(Math.min(12, months)).map(k => kv.get(`orders/${slug}/${k}`, { type: "json" })));
  return docs.flatMap(d => d?.items || []).sort((a: Order, b: Order) => b.created - a.created);
}
export async function adminOrderStatus(kv: KV, biz: Biz, id: string, status: string) {
  if (!["new", "ready", "picked", "cancelled"].includes(status)) throw new HttpError(400, "bad_status");
  for (const k of monthKeys(12)) {
    const key = `orders/${biz.slug}/${k}`;
    const doc = await kv.get(key, { type: "json" });
    const o: Order | undefined = doc?.items?.find((x: Order) => x.id === id);
    if (!o) continue;
    const prev = o.status; o.status = status as Order["status"];
    await kv.setJSON(key, doc);
    if (prev !== "cancelled" && status === "cancelled" || prev === "cancelled" && status !== "cancelled") {
      const sign = status === "cancelled" ? 1 : -1; // return to stock / take again
      o.items.forEach(it => { const p = biz.products.find(x => x.id === it.id); if (p) p.stock = Math.max(0, p.stock + sign * it.qty) });
      await saveBiz(kv, biz);
    }
    if ((prev === "picked") !== (status === "picked"))
      await touchClient(kv, biz.slug, o.phone, c => { c.productSpend = Math.max(0, c.productSpend + (status === "picked" ? o.total : -o.total)) }, o.name);
    return o;
  }
  throw new HttpError(404, "not_found");
}
export const saveBiz = (kv: KV, b: Biz) => kv.setJSON(`biz/${b.slug}`, b);
export async function getDay(kv: KV, slug: string, date: string): Promise<Booking[]> {
  const d = await kv.get(`day/${slug}/${date}`, { type: "json" });
  return d?.bookings || [];
}
export const saveDay = (kv: KV, slug: string, date: string, bookings: Booking[]) => kv.setJSON(`day/${slug}/${date}`, { bookings });

export function publicBiz(b: Biz) {
  const { pin, blocked, waPhoneId, owner, notify, paidUntil, ...rest } = b;
  return { ...rest, live: isLive(b), closed: b.closed.map(c => ({ from: c.from, to: c.to, staff: c.staff })), products: b.products.filter(p => p.active).map(p => ({ ...p, stock: Math.min(p.stock, 10) })) };
}
export function publicBooking(b: Booking) {
  const { phone, ...rest } = b; return { ...rest, phoneTail: phone.slice(-4) };
}

/* ---------------- availability ---------------- */
/** working hours of one staff member on a date (their own hours if set, else the business'), or null when off */
export function workHours(biz: Biz, date: string, staffId: string): Hours | null {
  const st = biz.staff.find(s => s.id === staffId);
  const h = (st?.hours && st.hours.length === 7 ? st.hours : biz.hours)[weekday(date)];
  if (!h || !h.open) return null;
  if (biz.closed.some(c => date >= c.from && date <= c.to && (c.staff === "all" || c.staff === staffId))) return null;
  return h;
}
/** is anyone working on this date? */
export const dayOpen = (biz: Biz, date: string) => biz.staff.some(s => workHours(biz, date, s.id));
export function isLive(biz: Biz, today = ilNow().date) {
  return biz.status === "active" && (!biz.paidUntil || biz.paidUntil >= addDays(today, -3)); // 3 days grace
}
export function freeSlots(biz: Biz, dayBookings: Booking[], date: string, staffId: string, dur: number, ignoreId?: string, nowTs = Date.now()) {
  const h = workHours(biz, date, staffId);
  if (!h) return [];
  const now = ilNow(nowTs);
  if (date < now.date) return [];
  const start = toMin(h.from), end = toMin(h.to);
  const busy = dayBookings.filter(b => b.staffId === staffId && b.status !== "cancelled" && b.id !== ignoreId).map(b => [toMin(b.time), toMin(b.time) + b.dur]);
  if (h.bFrom && h.bTo && isTime(h.bFrom) && isTime(h.bTo) && toMin(h.bTo) > toMin(h.bFrom)) busy.push([toMin(h.bFrom), toMin(h.bTo)]); // break
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
  const token = env("WA_TOKEN"), phoneId = biz.waPhoneId || env("WA_PHONE_ID");
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
/* ---------- messages to the business owner ---------- */
// Meta templates: torlink_owner {{1}} what happened {{2}} client {{3}} service {{4}} date {{5}} time {{6}} client phone
//                 torlink_daily {{1}} date {{2}} business {{3}} count {{4}} list {{5}} dashboard link
export const OWNER_TEMPLATES: Record<"he" | "ar", { owner: string; daily: string }> = {
  he: { owner: "🔔 {{1}}\n{{2}} · {{3}}\n{{4}} בשעה {{5}}\nטלפון: {{6}}", daily: "📋 מחר, {{1}}, יש ב{{2}} {{3}} תורים:\n{{4}}\nליומן: {{5}}" },
  ar: { owner: "🔔 {{1}}\n{{2}} · {{3}}\n{{4}} الساعة {{5}}\nهاتف: {{6}}", daily: "📋 بكرا، {{1}}، في {{2}} عندك {{3}} مواعيد:\n{{4}}\nلليومية: {{5}}" },
};
const OWNER_KIND = { he: { new: "תור חדש", changed: "תור הוזז", cancelled: "תור בוטל", signup: "עסק חדש נרשם ל-TorLink" }, ar: { new: "دور جديد", changed: "تم تغيير موعد", cancelled: "تم إلغاء موعد", signup: "محل جديد سجّل بـ TorLink" } };
const intl = (p: string) => { const d = p.replace(/\D/g, ""); return d.startsWith("0") ? "972" + d.slice(1) : d };
const cleanParam = (s: any) => String(s ?? "").replace(/[\n\t]+/g, " ").replace(/ {4,}/g, " ").trim() || "-";
export async function sendTemplate(env: Env, phoneId: string | undefined, to: string, name: string, lang: "he" | "ar", params: string[], fetchImpl: typeof fetch = fetch) {
  const token = env("WA_TOKEN"); phoneId ||= env("WA_PHONE_ID");
  if (!token || !phoneId) return { status: "demo" as const };
  try {
    const res = await fetchImpl(`https://graph.facebook.com/${env("WA_API_VERSION") || "v23.0"}/${phoneId}/messages`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: intl(to), type: "template", template: { name, language: { code: lang }, components: [{ type: "body", parameters: params.map(text => ({ type: "text", text })) }] } }),
    });
    const j: any = await res.json().catch(() => ({}));
    return res.ok ? { status: "sent" as const } : { status: "failed" as const, error: j?.error?.message || `HTTP ${res.status}` };
  } catch (e: any) { return { status: "failed" as const, error: String(e?.message || e) } }
}
export async function notifyOwner(kv: KV, env: Env, biz: Biz, kind: "new" | "changed" | "cancelled", b: Booking, fetchImpl?: typeof fetch) {
  const n = biz.notify;
  if (!n?.phone || (kind === "new" ? !n.onBook : !n.onCancel)) return;
  const lang = n.lang === "ar" ? "ar" : "he";
  const params = [OWNER_KIND[lang][kind], b.name, b.serviceName[lang] || b.serviceName.he, dateText(b.date, lang), b.time, b.phone].map(cleanParam);
  const r = await sendTemplate(env, biz.waPhoneId, n.phone, env("WA_TPL_OWNER") || "torlink_owner", lang, params, fetchImpl);
  await logMsg(kv, biz.slug, { id: rid(8), at: Date.now(), type: "owner", bookingId: b.id, name: b.name, phone: n.phone, status: r.status, text: OWNER_TEMPLATES[lang].owner.replace(/\{\{(\d)\}\}/g, (_, i) => params[+i - 1]), error: (r as any).error });
}
/** tells the platform owner (PLATFORM_PHONE) that a new business signed up */
export async function notifyPlatform(env: Env, biz: Biz, planName: string, price: number, fetchImpl?: typeof fetch) {
  const to = env("PLATFORM_PHONE"); if (!to) return;
  const params = [OWNER_KIND.he.signup, biz.owner.name, biz.name.he || biz.name.ar, planName, `₪${price}`, biz.owner.phone].map(cleanParam);
  await sendTemplate(env, undefined, to, env("WA_TPL_OWNER") || "torlink_owner", "he", params, fetchImpl);
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
export const cleanPhone = (p: any) => String(p || "").replace(/\D/g, "").replace(/^972/, "0");

export async function createBooking(kv: KV, env: Env, biz: Biz, input: any, siteUrl: string, fetchImpl?: typeof fetch) {
  if (!isLive(biz)) throw new HttpError(403, "inactive");
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
  await indexBooking(kv, biz.slug, phone, b.id);
  const c = await touchClient(kv, biz.slug, phone, c => { c.bookings++; if (!c.name) c.name = name }, name, b.lang);
  // the WhatsApp bot answers inside the open chat itself, so no template is needed
  const message = input.via === "bot" ? null : await notify(kv, env, b, biz, "confirm", siteUrl, fetchImpl);
  await notifyOwner(kv, env, biz, "new", b, fetchImpl);
  return { booking: publicBooking(b), message, club: clubCard(biz, c) };
}

/** per-client list of booking tokens (lets the bot find "my bookings") + which business the phone used last */
export async function indexBooking(kv: KV, slug: string, phone: string, token: string) {
  const key = `cb/${slug}/${phone}`;
  const d = (await kv.get(key, { type: "json" })) || { items: [] };
  d.items = [...d.items.filter((t: string) => t !== token), token].slice(-30);
  await kv.setJSON(key, d);
  await kv.setJSON(`who/${phone}`, { slug, at: Date.now() });
}
export async function clientBookings(kv: KV, slug: string, phone: string) {
  const d = await kv.get(`cb/${slug}/${phone}`, { type: "json" });
  const out: Booking[] = [];
  for (const t of (d?.items || []).slice().reverse()) {
    try { const { b } = await findByToken(kv, t); if (b.slug === slug) out.push(b) } catch { }
  }
  return out;
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
  if (b.status !== "confirmed") return { canChange: false, reason: b.status, canReview: b.status === "arrived" && !(b as any).reviewed };
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
  const message = input.via === "bot" ? null : await notify(kv, env, b, biz, "changed", siteUrl, fetchImpl);
  await notifyOwner(kv, env, biz, "changed", b, fetchImpl);
  return { booking: publicBooking(b), message };
}
export async function cancelByClient(kv: KV, env: Env, token: string, siteUrl: string, fetchImpl?: typeof fetch, silent = false) {
  const { biz, day, b } = await findByToken(kv, token);
  const st = changeState(biz, b);
  if (!st.canChange) throw new HttpError(403, st.reason);
  b.status = "cancelled"; (b.history ||= []).push({ type: "cancelled", at: Date.now() });
  await saveDay(kv, biz.slug, b.date, day);
  await touchClient(kv, biz.slug, b.phone, c => applyStatus(c, b, null, "cancelled"), b.name);
  const message = silent ? null : await notify(kv, env, b, biz, "cancelled", siteUrl, fetchImpl);
  await notifyOwner(kv, env, biz, "cancelled", b, fetchImpl);
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
  if (prev !== status) await touchClient(kv, biz.slug, b.phone, c => applyStatus(c, b, prev === "confirmed" ? null : prev, status === "confirmed" ? null : status), b.name);
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
  const okId = (id: any) => /^[A-Za-z0-9]{3,12}$/.test(id) ? id : rid(6);
  if (Array.isArray(c.services) && c.services.length) out.services = c.services.slice(0, 40).map((s: any) => ({ id: okId(s.id), name: L(s.name), dur: Math.min(480, Math.max(5, Math.round(+s.dur / 5) * 5 || 30)), price: Math.max(0, Math.round(+s.price || 0)), icon: safeIcon(s.icon, "scissors"), img: biz.services.find(o => o.id === s.id)?.img || 0 }));
  if (Array.isArray(c.products)) out.products = c.products.slice(0, 60).map((p: any) => ({ id: okId(p.id), name: L(p.name), desc: L(p.desc), price: Math.max(0, Math.round(+p.price || 0)), stock: Math.max(0, Math.floor(+p.stock || 0)), icon: safeIcon(p.icon), active: p.active !== false, img: biz.products.find(o => o.id === p.id)?.img || 0, spin: biz.products.find(o => o.id === p.id)?.spin || 0, spinN: biz.products.find(o => o.id === p.id)?.spinN || 0 }));
  if (c.club) out.club = { enabled: c.club.enabled !== false, rewardEvery: Math.min(50, Math.max(2, Math.floor(+c.club.rewardEvery || 10))), reward: L(c.club.reward) };
  if (c.theme) out.theme = { accent: /^#[0-9a-fA-F]{6}$/.test(c.theme.accent) ? c.theme.accent.toLowerCase() : out.theme.accent, mode: c.theme.mode === "light" ? "light" : "dark", logoBg: ["light", "dark"].includes(c.theme.logoBg) ? c.theme.logoBg : "", skin: ["auto", "noir", "blush", "luxe", "fresh"].includes(c.theme.skin) ? c.theme.skin : "auto" };
  if (c.tagline) out.tagline = L(c.tagline);
  if (c.social) {
    // keep only plain https links / handles; anything else is dropped
    const url = (v: any) => { const s = String(v || "").trim().slice(0, 200); return !s ? "" : /^https:\/\/[^\s"'<>]+$/.test(s) ? s : /^@?[\w.]{1,40}$/.test(s) ? s.replace(/^@/, "") : "" };
    out.social = { instagram: url(c.social.instagram), facebook: url(c.social.facebook), tiktok: url(c.social.tiktok), whatsapp: String(c.social.whatsapp || "").replace(/\D/g, "").slice(0, 13), waze: url(c.social.waze) };
  }
  if (typeof c.address === "string") out.address = c.address.slice(0, 120);
  if (typeof c.phone === "string") out.phone = c.phone.replace(/[^\d-]/g, "").slice(0, 15);
  const hrs = (arr: any) => arr.map((h: any) => ({ open: !!h.open, from: isTime(h.from) ? h.from : "09:00", to: isTime(h.to) ? h.to : "18:00", bFrom: isTime(h.bFrom) ? h.bFrom : "", bTo: isTime(h.bTo) ? h.bTo : "" }));
  if (Array.isArray(c.staff) && c.staff.length) out.staff = c.staff.slice(0, 20).map((s: any) => ({ id: /^[A-Za-z0-9]{3,12}$/.test(s.id) ? s.id : rid(6), name: L(s.name), hours: Array.isArray(s.hours) && s.hours.length === 7 ? hrs(s.hours) : null }));
  if (Array.isArray(c.hours) && c.hours.length === 7) out.hours = hrs(c.hours);
  if (Array.isArray(c.closed)) out.closed = c.closed.filter((x: any) => isDate(x.from) && isDate(x.to) && x.to >= x.from).slice(0, 100)
    .map((x: any) => ({ id: /^[A-Za-z0-9]{3,12}$/.test(x.id) ? x.id : rid(6), from: x.from, to: x.to, staff: x.staff === "all" || out.staff.some(s => s.id === x.staff) ? x.staff : "all", note: String(x.note || "").slice(0, 60) }))
    .filter((x: Closure) => x.to >= addDays(ilNow().date, -30));
  if (c.notify) out.notify = { phone: String(c.notify.phone || "").replace(/\D/g, "").slice(0, 13), lang: c.notify.lang === "ar" ? "ar" : "he", onBook: c.notify.onBook !== false, onCancel: c.notify.onCancel !== false, daily: c.notify.daily !== false };
  if (Array.isArray(c.packages)) out.packages = c.packages.slice(0, 20).map((k: any) => ({
    id: okId(k.id), name: L(k.name), serviceId: k.serviceId === "any" || out.services.some(x => x.id === k.serviceId) ? k.serviceId : "any",
    count: Math.min(100, Math.max(1, Math.floor(+k.count || 10))), price: Math.max(0, Math.round(+k.price || 0)),
    validDays: Math.min(1095, Math.max(0, Math.floor(+k.validDays || 0))), active: k.active !== false,
  }));
  if (c.bot) out.bot = { enabled: c.bot.enabled !== false, ai: c.bot.ai !== false };
  if (c.cutoff != null) out.cutoff = Math.min(72, Math.max(0, +c.cutoff || 0));
  if (Array.isArray(c.blocked)) out.blocked = c.blocked.map(cleanPhone).filter((p: string) => /^05\d{8}$/.test(p)).slice(0, 500);
  if (typeof c.pin === "string" && /^\d{4,8}$/.test(c.pin)) out.pin = c.pin;
  return out;
}
export async function adminUpdateClient(kv: KV, slug: string, input: any) {
  const phone = cleanPhone(input.phone);
  const items = await getClients(kv, slug);
  const c = items[phone];
  if (!c) throw new HttpError(404, "not_found");
  if (typeof input.name === "string" && input.name.trim()) c.name = input.name.trim().slice(0, 60);
  if (typeof input.notes === "string") c.notes = input.notes.slice(0, 1000);
  if (Array.isArray(input.tags)) c.tags = input.tags.map((x: any) => String(x).slice(0, 20)).slice(0, 10);
  if (typeof input.birthday === "string") c.birthday = /^\d{2}-\d{2}$/.test(input.birthday) ? input.birthday : "";
  if (input.redeem === true) {
    // shop staff gives the reward: only if one is actually available
    const biz = await getBiz(kv, slug);
    if (!biz || clubCard(biz, c).available < 1) throw new HttpError(400, "no_reward");
    c.rewardsUsed++;
  }
  await saveClients(kv, slug, items);
  return c;
}
/* ---------------- packages + "my card" (wallet-style page per client) ---------------- */
const packLive = (k: Pack, today = ilNow().date) => k.left > 0 && (!k.expires || k.expires >= today);
/** packs that can pay for a service (same service or "any"), soonest-expiring first */
export function usablePacks(c: Client | undefined, serviceId?: string) {
  return (c?.packs || []).filter(k => packLive(k) && (!serviceId || k.serviceId === "any" || k.serviceId === serviceId))
    .sort((a, z) => (a.expires || "9999").localeCompare(z.expires || "9999"));
}
async function ensureCard(kv: KV, slug: string, c: Client) {
  if (!c.card) { c.card = rid(14); await kv.setJSON(`card/${c.card}`, { slug, phone: c.phone }) }
  return c.card;
}
export async function sellPack(kv: KV, biz: Biz, input: any) {
  const phone = cleanPhone(input.phone);
  const pkg = biz.packages.find(k => k.id === input.pkgId);
  if (!pkg) throw new HttpError(400, "bad_package");
  if (!/^05\d{8}$/.test(phone)) throw new HttpError(400, "bad_phone");
  const items = await getClients(kv, biz.slug);
  const c = items[phone] || (items[phone] = blankClient(phone, String(input.name || "").trim().slice(0, 60)));
  const now = Date.now();
  (c.packs ||= []).push({
    id: rid(8), pkgId: pkg.id, name: { ...pkg.name }, serviceId: pkg.serviceId, total: pkg.count, left: pkg.count, price: pkg.price,
    bought: now, expires: pkg.validDays ? addDays(ilNow(now).date, pkg.validDays) : "",
    method: ["cash", "bit", "card", "transfer"].includes(input.method) ? input.method : "cash", uses: [],
  });
  c.productSpend += pkg.price;
  await ensureCard(kv, biz.slug, c);
  await saveClients(kv, biz.slug, items);
  return c;
}
/** use one entry; packId optional (picks the best pack for the service) */
export async function redeemPack(kv: KV, biz: Biz, input: any) {
  let phone = cleanPhone(input.phone);
  if (input.card) { // from the client's card page, opened on the owner's phone
    const idx = /^[A-Za-z0-9]{10,20}$/.test(input.card) && await kv.get(`card/${input.card}`, { type: "json" });
    if (!idx || idx.slug !== biz.slug) throw new HttpError(404, "not_found");
    phone = idx.phone;
  }
  const items = await getClients(kv, biz.slug), c = items[phone];
  if (!c) throw new HttpError(404, "not_found");
  const bookingId = typeof input.bookingId === "string" ? input.bookingId.slice(0, 20) : undefined;
  if (input.undo) {
    const k = (c.packs || []).find(x => x.id === input.packId);
    if (!k || !k.uses.length) throw new HttpError(400, "nothing_to_undo");
    k.uses.pop(); k.left = Math.min(k.total, k.left + 1);
  } else {
    if (bookingId && (c.packs || []).some(k => k.uses.some(u => u.bookingId === bookingId))) throw new HttpError(409, "already_used");
    const k = input.packId ? usablePacks(c).find(x => x.id === input.packId) : usablePacks(c, input.serviceId)[0];
    if (!k) throw new HttpError(400, "no_pack");
    k.left--; k.uses.push({ at: Date.now(), ...(bookingId ? { bookingId } : {}) });
  }
  await saveClients(kv, biz.slug, items);
  return c;
}
export async function cardLink(kv: KV, slug: string, phone: string) {
  phone = cleanPhone(phone);
  const items = await getClients(kv, slug), c = items[phone];
  if (!c) throw new HttpError(404, "not_found");
  const had = !!c.card, tok = await ensureCard(kv, slug, c);
  if (!had) await saveClients(kv, slug, items);
  return tok;
}
/** public card view: no phone number, only what the client needs to see */
export async function getCard(kv: KV, token: string) {
  if (!/^[A-Za-z0-9]{10,20}$/.test(token)) throw new HttpError(404, "not_found");
  const idx = await kv.get(`card/${token}`, { type: "json" });
  const biz = idx && await getBiz(kv, idx.slug);
  if (!biz) throw new HttpError(404, "not_found");
  const c = (await getClients(kv, biz.slug))[idx.phone];
  if (!c || c.card !== token) throw new HttpError(404, "not_found");
  const today = ilNow().date, nowMin = ilNow().min;
  const next = (await clientBookings(kv, biz.slug, c.phone))
    .filter(b => b.status === "confirmed" && (b.date > today || b.date === today && toMin(b.time) >= nowMin))
    .sort((a, z) => (a.date + a.time).localeCompare(z.date + z.time))[0];
  return {
    biz: publicBiz(biz), today,
    client: { name: c.name, since: c.first, phoneTail: c.phone.slice(-4), visits: c.visits },
    club: clubCard(biz, c),
    packs: (c.packs || []).filter(k => packLive(k, today) || k.bought > Date.now() - 90 * 864e5)
      .map(({ id, name, serviceId, total, left, expires, uses, bought }) => ({ id, name, serviceId, total, left, expires, bought, last: uses[uses.length - 1]?.at || 0, live: packLive({ left, expires } as Pack, today) })),
    next: next ? { token: next.id, date: next.date, time: next.time, service: next.serviceName, staffId: next.staffId } : null,
  };
}
/** messages the bot passed on to the business (questions it could not answer, "talk to a person") */
export async function addInbox(kv: KV, slug: string, item: { phone: string; name: string; text: string; kind: string }) {
  const d = (await kv.get(`inbox/${slug}`, { type: "json" })) || { items: [] };
  d.items.unshift({ ...item, id: rid(8), at: Date.now(), done: false });
  d.items = d.items.slice(0, 200);
  await kv.setJSON(`inbox/${slug}`, d);
}
export async function getInbox(kv: KV, slug: string) { return (await kv.get(`inbox/${slug}`, { type: "json" }))?.items || [] }
export async function inboxDone(kv: KV, slug: string, id: string) {
  const d = (await kv.get(`inbox/${slug}`, { type: "json" })) || { items: [] };
  const it = d.items.find((x: any) => x.id === id); if (it) it.done = true;
  await kv.setJSON(`inbox/${slug}`, d);
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
  const remindHour = +(env("REMINDER_HOUR") || 18), dailyHour = +(env("OWNER_DAILY_HOUR") || 20);
  if (now.hour < Math.min(remindHour, dailyHour)) return { skipped: "before_hour", sent: 0, daily: 0 };
  const tomorrow = addDays(now.date, 1);
  const { blobs } = await kv.list({ prefix: "biz/" });
  let sent = 0, daily = 0;
  for (const { key } of blobs) {
    const raw: Biz = await kv.get(key, { type: "json" });
    if (!raw) continue;
    const biz = normalizeBiz(raw);
    if (!isLive(biz, now.date)) continue;
    const day = await getDay(kv, biz.slug, tomorrow);
    if (now.hour >= remindHour) {
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
    // evening summary for the owner: tomorrow's list, once per day
    const n = biz.notify;
    if (now.hour >= dailyHour && n.daily && n.phone && !(await kv.get(`od/${biz.slug}/${tomorrow}`, { type: "json" }))) {
      await kv.setJSON(`od/${biz.slug}/${tomorrow}`, { at: nowTs });
      const lang = n.lang === "ar" ? "ar" : "he";
      const list = day.filter(b => b.status === "confirmed").sort((a, b) => a.time.localeCompare(b.time));
      if (!list.length && !dayOpen(biz, tomorrow)) continue;
      let txt = list.map(b => `${b.time} ${b.name} (${b.serviceName[lang] || b.serviceName.he})`).join(" | ");
      if (txt.length > 900) txt = txt.slice(0, 897) + "…";
      const params = [dateText(tomorrow, lang), biz.name[lang] || biz.name.he, String(list.length), txt || (lang === "ar" ? "ما في مواعيد بعد" : "אין עדיין תורים"), `${siteUrl}/admin/${biz.slug}`].map(cleanParam);
      const r = await sendTemplate(env, biz.waPhoneId, n.phone, env("WA_TPL_DAILY") || "torlink_daily", lang, params, fetchImpl);
      await logMsg(kv, biz.slug, { id: rid(8), at: nowTs, type: "daily", bookingId: "", name: biz.name[lang] || biz.name.he, phone: n.phone, status: r.status, text: OWNER_TEMPLATES[lang].daily.replace(/\{\{(\d)\}\}/g, (_, i) => params[+i - 1]), error: (r as any).error });
      daily++;
    }
  }
  return { sent, daily };
}
