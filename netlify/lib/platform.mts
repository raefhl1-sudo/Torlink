// Platform-level things: plans & prices, self sign-up, and the owner's (super) dashboard.
import { HttpError, getBiz, saveBiz, buildBiz, normalizeBiz, isLive, ilNow, addDays, notifyPlatform, rid, type KV, type Env, type Biz } from "./core.mts";

type L = { he: string; ar: string };
export interface Plan { id: string; name: L; price: number; bot: boolean; features: { he: string[]; ar: string[] } }
export interface Platform { plans: Plan[]; payInfo: L; contact: string }

export const DEFAULT_PLATFORM: Platform = {
  plans: [
    {
      id: "basic", name: { he: "בסיסי", ar: "أساسي" }, price: 149, bot: false,
      features: {
        he: ["קביעת תורים אונליין 24/7", "אישור ותזכורת אוטומטיים בוואטסאפ", "קישור אישי ללקוח לשינוי וביטול", "מועדון לקוחות וכרטיסייה", "חנות מוצרים", "דוחות + התראות לבעל העסק"],
        ar: ["حجز دور أونلاين 24/7", "تأكيد وتذكير أوتوماتيكي بالواتساب", "رابط شخصي للزبون للتغيير والإلغاء", "نادي زبائن وبطاقة", "متجر منتجات", "تقارير + تنبيهات لصاحب المحل"],
      },
    },
    {
      id: "pro", name: { he: "פרו", ar: "برو" }, price: 249, bot: true,
      features: {
        he: ["כל מה שיש בבסיסי", "בוט וואטסאפ שקובע תורים לבד", "מבין עברית וערבית מדוברת", "מעביר אליך רק מה שצריך אותך"],
        ar: ["كل اللي بالأساسي", "بوت واتساب بحجز الدور لحاله", "بفهم عبري وعربي محكي", "بحوّل إلك بس اللي بحتاجك"],
      },
    },
  ],
  payInfo: {
    he: "ההפעלה אחרי תשלום החודש הראשון. אחרי התשלום שלח צילום בוואטסאפ, והמערכת תופעל באותו יום.",
    ar: "التفعيل بعد دفع أول شهر. بعد الدفع ابعث صورة بالواتساب، والنظام بتفعّل بنفس اليوم.",
  },
  contact: "",
};

export async function getPlatform(kv: KV): Promise<Platform> {
  const p = await kv.get("platform/settings", { type: "json" });
  return p?.plans?.length ? p : DEFAULT_PLATFORM;
}
export const planOf = (p: Platform, id: string) => p.plans.find(x => x.id === id);
/** basic plan has no bot; businesses from before plans existed keep everything */
export const hasBot = (p: Platform, biz: Biz) => !biz.plan || planOf(p, biz.plan)?.bot !== false;

export function sanitizePlatform(c: any): Platform {
  const s = (v: any, n: number) => String(v || "").slice(0, n);
  const plans: Plan[] = (Array.isArray(c.plans) ? c.plans : []).slice(0, 4).map((x: any) => ({
    id: /^[a-z0-9-]{2,20}$/.test(x.id) ? x.id : rid(5).toLowerCase(),
    name: { he: s(x.name?.he, 30), ar: s(x.name?.ar, 30) }, price: Math.max(0, Math.round(+x.price || 0)), bot: !!x.bot,
    features: { he: (x.features?.he || []).slice(0, 10).map((f: any) => s(f, 80)).filter(Boolean), ar: (x.features?.ar || []).slice(0, 10).map((f: any) => s(f, 80)).filter(Boolean) },
  }));
  if (!plans.length) throw new HttpError(400, "no_plans");
  return { plans, payInfo: { he: s(c.payInfo?.he, 600), ar: s(c.payInfo?.ar, 600) }, contact: String(c.contact || "").replace(/\D/g, "").slice(0, 13) };
}

const RESERVED = new Set(["demo", "admin", "api", "super", "join", "www", "app", "torlink", "b", "m", "wa", "test"]);
export async function slugFree(kv: KV, slug: string) {
  return /^[a-z0-9-]{3,30}$/.test(slug) && !RESERVED.has(slug) && !(await getBiz(kv, slug));
}

export async function signup(kv: KV, env: Env, input: any) {
  const p = await getPlatform(kv);
  const slug = String(input.slug || "").toLowerCase().trim();
  if (!(await slugFree(kv, slug))) throw new HttpError(409, "slug_taken");
  const type = input.type === "nails" ? "nails" : "barber";
  const he = String(input.name?.he || "").trim().slice(0, 60), ar = String(input.name?.ar || "").trim().slice(0, 60);
  if (!he && !ar) throw new HttpError(400, "bad_name");
  const ownerName = String(input.ownerName || "").trim().slice(0, 60);
  if (ownerName.length < 2) throw new HttpError(400, "bad_name");
  const phone = String(input.phone || "").replace(/\D/g, "").replace(/^972/, "0");
  if (!/^05\d{8}$/.test(phone)) throw new HttpError(400, "bad_phone");
  const pin = String(input.pin || "");
  if (!/^\d{4,8}$/.test(pin)) throw new HttpError(400, "bad_pin_format");
  const plan = planOf(p, String(input.plan || "")) || p.plans[0];
  const biz = buildBiz(slug, type, pin, { he: he || ar, ar: ar || he });
  Object.assign(biz, {
    status: "pending", paidUntil: "", plan: plan.id, owner: { name: ownerName, phone }, phone,
    address: String(input.address || "").slice(0, 120),
    notify: { phone, lang: input.lang === "ar" ? "ar" : "he", onBook: true, onCancel: true, daily: true },
  });
  if (!plan.bot) biz.bot.enabled = false;
  await saveBiz(kv, biz);
  await notifyPlatform(env, biz, plan.name.he, plan.price).catch(() => { });
  return { slug, plan, payInfo: p.payInfo, contact: p.contact };
}

const addMonths = (date: string, n: number) => {
  const [y, m, d] = date.split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1 + n, d));
  if (x.getUTCDate() !== d) x.setUTCDate(0); // 31 Jan + 1 month → 28/29 Feb
  return x.toISOString().slice(0, 10);
};

export async function superList(kv: KV) {
  const p = await getPlatform(kv);
  const today = ilNow().date, from = addDays(today, -30);
  const { blobs } = await kv.list({ prefix: "biz/" });
  const items = await Promise.all(blobs.map(async ({ key }) => {
    const raw = await kv.get(key, { type: "json" }); if (!raw) return null;
    const b = normalizeBiz(raw);
    const days = (await kv.list({ prefix: `day/${b.slug}/` })).blobs.map(x => x.key.split("/")[2]).filter(d => d >= from && d <= addDays(today, 60));
    const docs = await Promise.all(days.map(d => kv.get(`day/${b.slug}/${d}`, { type: "json" })));
    const all = docs.flatMap(d => d?.bookings || []).filter((x: any) => x.status !== "cancelled");
    const bk = all.filter((x: any) => x.date <= today), upcoming = all.filter((x: any) => x.date > today && x.status === "confirmed").length;
    const clients = Object.keys((await kv.get(`clients/${b.slug}`, { type: "json" }))?.items || {}).length;
    const plan = planOf(p, b.plan);
    return {
      slug: b.slug, name: b.name, type: b.type, status: b.status, live: isLive(b, today), paidUntil: b.paidUntil, plan: b.plan,
      planName: plan?.name || null, price: plan?.price ?? 0, owner: b.owner, phone: b.phone || "", pin: b.pin, created: b.created,
      bookings30: bk.length, upcoming, revenue30: bk.filter((x: any) => x.status === "arrived").reduce((s: number, x: any) => s + (x.price || 0), 0), clients,
    };
  }));
  const list = items.filter(Boolean).sort((a: any, b: any) => b.created - a.created);
  const mrr = list.filter((x: any) => x.live && x.slug !== "demo").reduce((s: number, x: any) => s + x.price, 0);
  return { items: list, platform: p, mrr, today };
}

export async function superAction(kv: KV, input: any) {
  const biz = await getBiz(kv, String(input.slug || ""));
  if (!biz) throw new HttpError(404, "not_found");
  const today = ilNow().date;
  let pin: string | undefined;
  switch (input.action) {
    case "activate": {
      const months = Math.min(24, Math.max(1, Math.floor(+input.months || 1)));
      const base = biz.paidUntil && biz.paidUntil >= today ? biz.paidUntil : today;
      biz.paidUntil = addMonths(base, months); biz.status = "active"; break;
    }
    case "suspend": biz.status = "suspended"; break;
    case "resume": biz.status = "active"; break;
    case "plan": {
      const p = await getPlatform(kv), plan = planOf(p, String(input.plan));
      if (!plan) throw new HttpError(400, "bad_plan");
      biz.plan = plan.id; if (!plan.bot) biz.bot.enabled = false; break;
    }
    case "pin": pin = biz.pin = String(Math.floor(1000 + Math.random() * 9000)); break;
    default: throw new HttpError(400, "bad_action");
  }
  await saveBiz(kv, biz);
  return { ok: true, status: biz.status, paidUntil: biz.paidUntil, plan: biz.plan, pin };
}
