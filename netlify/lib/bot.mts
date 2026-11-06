// TorLink WhatsApp bot — books, shows, moves and cancels appointments inside the WhatsApp chat.
// Buttons and lists drive the flow; when the business enables AI and ANTHROPIC_API_KEY is set,
// free text ("بدي دور بكرا بعد الظهر", "יש משהו מחר בערב?") is understood and jumps straight to the right step.
import { getPlatform, hasBot } from "./platform.mts";
import {
  HttpError, getBiz, getDay, slotsFor, createBooking, findByToken, changeState, reschedule, cancelByClient,
  clientBookings, getClients, msgParams, renderText, logMsg, addInbox, dateText, ilNow, ilEpoch, addDays,
  weekday, toMin, isDate, isTime, rid, dayOpen, isLive,
  type KV, type Env, type Biz, type Booking, type MsgType,
} from "./core.mts";

type Lang = "he" | "ar";
type Tod = "morning" | "noon" | "evening";
interface Sess {
  slug: string; lang: Lang; at: number; seen: string[];
  mode?: "book" | "move"; step?: string; svc?: string; staff?: string; tok?: string; dur?: number;
  date?: string; time?: string; name?: string; pname?: string; pdate?: string; tod?: Tod;
}
export interface Incoming {
  from: string;            // wa_id, e.g. 972501234567
  id: string;              // message id (dedupe)
  text?: string;           // typed text
  replyId?: string;        // button / list reply id
  kind?: string;           // original message type (audio, image…)
  phoneId?: string;        // the business number the message arrived on
  profileName?: string;
}
interface Ctx {
  kv: KV; env: Env; siteUrl: string; fetchImpl: typeof fetch; sim: boolean;
  phoneId: string; to: string; phone: string; out: any[];
  biz: Biz; sess: Sess; lang: Lang;
}

/* ---------------- texts ---------------- */
const T = {
  he: {
    hello: (biz: string, name: string) => `שלום${name ? " " + name : ""}! 👋\nכאן העוזר הדיגיטלי של *${biz}*.\nאפשר לקבוע, להזיז או לבטל תור ישר מכאן. במה אפשר לעזור?`,
    bBook: "📅 קביעת תור", bMy: "🗂️ התורים שלי", bHuman: "💬 דבר עם העסק", bMenu: "🏠 תפריט",
    svc: "איזה שירות תרצה/י?", svcBtn: "בחירת שירות", min: "דק׳",
    staff: "אצל מי?", any: "לא משנה – הכי מוקדם", staffBtn: "בחירה",
    day: "איזה יום מתאים לך?", dayBtn: "בחירת יום", slotsN: (n: number) => `${n} שעות פנויות`,
    noDays: "אין כרגע תורים פנויים בשבועות הקרובים 😕",
    tod: (d: string) => `ב${d} יש הרבה שעות פנויות. מתי נוח לך?`, morning: "🌅 בוקר", noon: "☀️ צהריים", evening: "🌙 ערב",
    times: (d: string) => `השעות הפנויות ב${d}:`, timeBtn: "בחירת שעה", more: "⏩ שעות נוספות", otherDay: "📆 יום אחר",
    noTimes: (d: string) => `ב${d} אין שעות פנויות. הנה ימים אחרים:`,
    notFree: (t: string) => `השעה ${t} כבר תפוסה 😕 הנה מה שפנוי:`,
    askName: "על איזה שם לרשום את התור?",
    badName: "רק השם בבקשה 🙂 (2–40 אותיות)",
    confirm: (s: string, d: string, t: string, p: number, who: string) => `לאשר את התור?\n\n✨ ${s}\n📅 ${d}\n🕐 ${t}${who ? `\n👤 ${who}` : ""}${p ? `\n💳 ₪${p}` : ""}`,
    bOk: "✅ אישור", bOther: "🔄 שעה אחרת", bAbort: "✖️ לא עכשיו",
    taken: "אוי, מישהו תפס את השעה הזאת הרגע 😅 הנה מה שעוד פנוי:",
    aborted: "בסדר גמור 🙂 אני כאן כשתצטרך/י.",
    none: "אין לך תורים קרובים אצלנו. לקבוע אחד?",
    pickBk: "התורים הקרובים שלך:", bkBtn: "בחירת תור",
    bk: (s: string, d: string, t: string) => `התור שלך:\n\n✨ ${s}\n📅 ${d}\n🕐 ${t}`,
    bMove: "🔄 להזיז", bCancel: "❌ לבטל", bFine: "👍 הכול טוב",
    tooLate: (h: number, ph: string) => `אי אפשר לשנות את התור פחות מ־${h} שעות לפניו.${ph ? `\nלשינוי דחוף: ${ph}` : ""}`,
    cancelQ: (s: string, d: string, t: string) => `לבטל את התור (${s}, ${d} בשעה ${t})?`, bYes: "כן, לבטל", bNo: "לא, להשאיר",
    moveQ: (d: string, t: string) => `להזיז את התור ל${d} בשעה ${t}?`,
    kept: "מעולה, התור נשאר במקומו 👍", fine: "נתראה! 🙌",
    human: (biz: string, link: string) => `העברתי את ההודעה ל${biz} 🙏 יחזרו אליך בהקדם.${link ? `\nאפשר גם ישירות: ${link}` : ""}`,
    noMedia: "אני עדיין לא שומע הקלטות ולא רואה תמונות 🙈 אפשר לכתוב לי או לבחור מהתפריט:",
    foreign: "קביעת תור בוואטסאפ זמינה למספרים ישראליים. אפשר לקבוע כאן:",
    unknown: "היי! 👋 כדי לקבוע תור, פתח/י את קישור הוואטסאפ מהדף של העסק, או שלח/י את קוד העסק (למשל #demo).",
    off: "קביעת תורים מתבצעת דרך הקישור:",
    didnt: "לא בטוח שהבנתי 🤔 בחר/י מה לעשות:",
  },
  ar: {
    hello: (biz: string, name: string) => `أهلا${name ? " " + name : ""}! 👋\nمعك المساعد الرقمي لـ *${biz}*.\nبتقدر/ي تحجز/ي، تغيّر/ي أو تلغي/ي دورك من هون. كيف بقدر أساعدك؟`,
    bBook: "📅 حجز دور", bMy: "🗂️ مواعيدي", bHuman: "💬 تواصل مع المحل", bMenu: "🏠 القائمة",
    svc: "شو الخدمة اللي بدك ياها؟", svcBtn: "اختيار خدمة", min: "دقيقة",
    staff: "عند مين؟", any: "مش مهم – أقرب دور", staffBtn: "اختيار",
    day: "أي يوم بناسبك؟", dayBtn: "اختيار يوم", slotsN: (n: number) => `${n} أوقات فاضية`,
    noDays: "ما في حاليا مواعيد فاضية بالأسابيع الجاي 😕",
    tod: (d: string) => `${d} في كثير أوقات فاضية. إيمتى بناسبك؟`, morning: "🌅 الصبح", noon: "☀️ الظهر", evening: "🌙 المسا",
    times: (d: string) => `الأوقات الفاضية ${d}:`, timeBtn: "اختيار ساعة", more: "⏩ أوقات أكثر", otherDay: "📆 يوم ثاني",
    noTimes: (d: string) => `${d} ما في أوقات فاضية. هاي أيام ثانية:`,
    notFree: (t: string) => `الساعة ${t} محجوزة 😕 هاي الأوقات الفاضية:`,
    askName: "على أي اسم نسجّل الدور؟",
    badName: "بس الاسم لو سمحت 🙂 (2–40 حرف)",
    confirm: (s: string, d: string, t: string, p: number, who: string) => `نأكد الدور؟\n\n✨ ${s}\n📅 ${d}\n🕐 ${t}${who ? `\n👤 ${who}` : ""}${p ? `\n💳 ₪${p}` : ""}`,
    bOk: "✅ تأكيد", bOther: "🔄 ساعة ثانية", bAbort: "✖️ مش هلأ",
    taken: "أوف، حدا حجز هاي الساعة هلأ 😅 هاي اللي لسا فاضي:",
    aborted: "ولا يهمك 🙂 أنا هون وقت ما بدك.",
    none: "ما عندك مواعيد قريبة عنا. بدك نحجزلك واحد؟",
    pickBk: "مواعيدك القريبة:", bkBtn: "اختيار موعد",
    bk: (s: string, d: string, t: string) => `موعدك:\n\n✨ ${s}\n📅 ${d}\n🕐 ${t}`,
    bMove: "🔄 تغيير", bCancel: "❌ إلغاء", bFine: "👍 تمام",
    tooLate: (h: number, ph: string) => `ما بنقدر نغيّر الموعد أقل من ${h} ساعات قبله.${ph ? `\nللتغيير المستعجل: ${ph}` : ""}`,
    cancelQ: (s: string, d: string, t: string) => `نلغي الموعد (${s}، ${d} الساعة ${t})؟`, bYes: "آه، إلغاء", bNo: "لا، خليه",
    moveQ: (d: string, t: string) => `ننقل الموعد لـ ${d} الساعة ${t}؟`,
    kept: "تمام، الموعد بضل زي ما هو 👍", fine: "منشوفك! 🙌",
    human: (biz: string, link: string) => `بعثت رسالتك لـ ${biz} 🙏 رح يرجعولك بأقرب وقت.${link ? `\nأو مباشرة: ${link}` : ""}`,
    noMedia: "لسا ما بسمع تسجيلات وما بشوف صور 🙈 اكتب/ي لي أو اختار/ي من القائمة:",
    foreign: "الحجز بالواتساب متاح للأرقام الإسرائيلية. بتقدر/ي تحجز/ي هون:",
    unknown: "أهلا! 👋 للحجز افتح/ي رابط الواتساب من صفحة المحل، أو ابعث/ي كود المحل (مثلا #demo).",
    off: "الحجز بصير من خلال الرابط:",
    didnt: "مش متأكد إني فهمت 🤔 اختار/ي شو بدك:",
  },
};

/* ---------------- WhatsApp sending ---------------- */
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
async function send(c: Ctx, msg: any) {
  c.out.push(msg);
  const token = c.env("WA_TOKEN");
  if (c.sim || !token || !c.phoneId) return true;
  try {
    const r = await c.fetchImpl(`https://graph.facebook.com/${c.env("WA_API_VERSION") || "v23.0"}/${c.phoneId}/messages`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: c.to, ...msg }),
    });
    if (!r.ok) console.error("wa send", r.status, await r.text().catch(() => ""));
    return r.ok;
  } catch (e) { console.error("wa send", e); return false }
}
const text = (c: Ctx, body: string) => send(c, { type: "text", text: { body: cut(body, 4000), preview_url: true } });
const buttons = (c: Ctx, body: string, btns: [string, string][]) => send(c, {
  type: "interactive",
  interactive: { type: "button", body: { text: cut(body, 1024) }, action: { buttons: btns.slice(0, 3).map(([id, title]) => ({ type: "reply", reply: { id, title: cut(title, 20) } })) } },
});
const list = (c: Ctx, body: string, btn: string, rows: { id: string; title: string; description?: string }[]) => send(c, {
  type: "interactive",
  interactive: {
    type: "list", body: { text: cut(body, 1024) },
    action: { button: cut(btn, 20), sections: [{ title: cut(c.biz.name[c.lang] || c.biz.name.he, 24), rows: rows.slice(0, 10).map(r => ({ id: r.id, title: cut(r.title, 24), ...(r.description ? { description: cut(r.description, 72) } : {}) })) }] },
  },
});

/* ---------------- helpers ---------------- */
const L = (c: Ctx, o: { he: string; ar: string }) => o[c.lang] || o.he;
const t = (c: Ctx) => T[c.lang];
const dText = (c: Ctx, d: string) => {
  const today = ilNow().date;
  const rel = d === today ? (c.lang === "ar" ? "اليوم" : "היום") : d === addDays(today, 1) ? (c.lang === "ar" ? "بكرا" : "מחר") : "";
  return rel ? `${rel}, ${dateText(d, c.lang)}` : dateText(d, c.lang);
};
const todOf = (time: string): Tod => (toMin(time) < 720 ? "morning" : toMin(time) < 960 ? "noon" : "evening");
const bizLink = (c: Ctx) => {
  const w = (c.biz.social.whatsapp || "").replace(/\D/g, "");
  if (w) return `https://wa.me/${w.startsWith("0") ? "972" + w.slice(1) : w}`;
  return c.biz.phone || "";
};
const menuBtns = (c: Ctx): [string, string][] => [["m:book", t(c).bBook], ["m:my", t(c).bMy], ["m:human", t(c).bHuman]];

async function knownName(c: Ctx) {
  if (c.sess.name) return c.sess.name;
  const cl = (await getClients(c.kv, c.biz.slug))[c.phone];
  return cl?.name || "";
}

/** free slots for the session's current flow (new booking or moving an existing one) */
async function slots(c: Ctx, date: string) {
  const day = await getDay(c.kv, c.biz.slug, date);
  if (c.sess.mode === "move" && c.sess.tok) return slotsFor(c.biz, day, date, c.sess.dur || 30, c.sess.staff || "any", c.sess.tok);
  const svc = c.biz.services.find(s => s.id === c.sess.svc);
  if (!svc) return [];
  return slotsFor(c.biz, day, date, svc.dur, c.sess.staff || "any");
}

/* ---------------- flow steps ---------------- */
async function menu(c: Ctx, greet = true) {
  c.sess.mode = undefined; c.sess.step = undefined;
  const body = greet ? t(c).hello(L(c, c.biz.name), await knownName(c) || c.sess.pname || "") : t(c).didnt;
  await buttons(c, body, menuBtns(c));
}

async function askService(c: Ctx) {
  c.sess.mode = "book"; c.sess.step = "svc";
  if (c.biz.services.length === 1) { c.sess.svc = c.biz.services[0].id; return askStaff(c) }
  await list(c, t(c).svc, t(c).svcBtn, c.biz.services.slice(0, 10).map(s => ({ id: `s|${s.id}`, title: L(c, s.name), description: `${s.dur} ${t(c).min}${s.price ? ` · ₪${s.price}` : ""}` })));
}
async function askStaff(c: Ctx) {
  if (c.biz.staff.length <= 1 || c.sess.staff) { c.sess.staff ||= "any"; return afterStaff(c) }
  c.sess.step = "staff";
  await list(c, t(c).staff, t(c).staffBtn, [{ id: "st|any", title: t(c).any }, ...c.biz.staff.slice(0, 9).map(s => ({ id: `st|${s.id}`, title: L(c, s.name) }))]);
}
async function afterStaff(c: Ctx) {
  const pd = c.sess.pdate; c.sess.pdate = undefined;
  if (pd) return askTime(c, pd, c.sess.tod);
  return askDay(c);
}

async function askDay(c: Ctx, intro?: string) {
  c.sess.step = "day";
  const today = ilNow().date, rows: { id: string; title: string; description: string }[] = [];
  const dates: string[] = [];
  for (let i = 0; i <= 45 && dates.length < 21; i++) {
    const d = addDays(today, i);
    if (dayOpen(c.biz, d)) dates.push(d);
  }
  const counts = await Promise.all(dates.map(async d => (await slots(c, d)).length));
  dates.forEach((d, i) => { if (counts[i] > 0 && rows.length < 10) rows.push({ id: `d|${d}`, title: dText(c, d), description: t(c).slotsN(counts[i]) }) });
  if (!rows.length) { await buttons(c, t(c).noDays, [["m:human", t(c).bHuman], ["m:menu", t(c).bMenu]]); return }
  await list(c, intro ? `${intro}\n\n${t(c).day}` : t(c).day, t(c).dayBtn, rows);
}

async function askTime(c: Ctx, date: string, tod?: Tod, page = 0, intro?: string) {
  c.sess.step = "time"; c.sess.date = date;
  const all = await slots(c, date);
  if (!all.length) return askDay(c, t(c).noTimes(dText(c, date)));
  let pool = all;
  if (tod) { const f = all.filter(s => todOf(s.time) === tod); if (f.length) pool = f }
  if (!tod && all.length > 10) {
    const parts = (["morning", "noon", "evening"] as Tod[]).map(p => [p, all.filter(s => todOf(s.time) === p).length] as const).filter(([, n]) => n > 0);
    if (parts.length > 1) {
      return buttons(c, (intro ? intro + "\n\n" : "") + t(c).tod(dText(c, date)), parts.map(([p, n]) => [`tod|${date}|${p}`, `${t(c)[p]} (${n})`]));
    }
  }
  const per = 8, start = page * per, chunk = pool.slice(start, start + per);
  const multi = c.biz.staff.length > 1;
  const rows = chunk.map(s => ({ id: `t|${date}|${s.time}|${s.staffId}`, title: `🕐 ${s.time}`, description: multi ? L(c, c.biz.staff.find(x => x.id === s.staffId)?.name || { he: "", ar: "" }) : "" }));
  if (start + per < pool.length) rows.push({ id: `tm|${date}|${tod || "all"}|${page + 1}`, title: t(c).more, description: "" });
  rows.push({ id: "re", title: t(c).otherDay, description: "" });
  await list(c, (intro ? intro + "\n\n" : "") + t(c).times(dText(c, date)), t(c).timeBtn, rows);
}

async function pickTime(c: Ctx, date: string, time: string, staffId: string) {
  c.sess.date = date; c.sess.time = time; c.sess.staff = staffId;
  if (c.sess.mode === "move") {
    c.sess.step = "confirm";
    return buttons(c, t(c).moveQ(dText(c, date), time), [["ok", t(c).bOk], ["re", t(c).bOther], ["keep", t(c).bNo]]);
  }
  const name = await knownName(c);
  if (!name) {
    c.sess.step = "name";
    const pn = (c.sess.pname || "").trim();
    if (pn && pn.length <= 18 && pn.length >= 2) return buttons(c, t(c).askName, [["nm", `✅ ${pn}`]]);
    return text(c, t(c).askName);
  }
  c.sess.name = name;
  return confirmBook(c);
}
async function confirmBook(c: Ctx) {
  c.sess.step = "confirm";
  const svc = c.biz.services.find(s => s.id === c.sess.svc)!;
  const who = c.biz.staff.length > 1 ? L(c, c.biz.staff.find(s => s.id === c.sess.staff)?.name || { he: "", ar: "" }) : "";
  await buttons(c, t(c).confirm(L(c, svc.name), dText(c, c.sess.date!), c.sess.time!, svc.price, who), [["ok", t(c).bOk], ["re", t(c).bOther], ["x", t(c).bAbort]]);
}

async function logSent(c: Ctx, b: Booking, type: MsgType, body: string, ok: boolean) {
  if (c.sim) return;
  await logMsg(c.kv, c.biz.slug, { id: rid(8), at: Date.now(), type, bookingId: b.id, name: b.name, phone: c.phone, status: !c.env("WA_TOKEN") ? "demo" : ok ? "sent" : "failed", text: body });
}
function asBooking(c: Ctx, pb: any): Booking { return { ...pb, phone: c.phone } }

async function doBook(c: Ctx) {
  const s = c.sess;
  if (!s.svc || !s.date || !s.time || !s.name) return menu(c);
  try {
    const r = await createBooking(c.kv, c.env, c.biz, { serviceId: s.svc, date: s.date, time: s.time, staffId: s.staff || "any", name: s.name, phone: c.phone, lang: c.lang, via: "bot" }, c.siteUrl);
    const b = asBooking(c, r.booking);
    let body = renderText("confirm", c.lang, msgParams({ ...b, lang: c.lang }, c.biz, "confirm", c.siteUrl));
    const club = r.club;
    if (club?.enabled) body += c.lang === "ar" ? `\n\n⭐ بطاقة النادي: ${club.progress}/${club.every}` : `\n\n⭐ כרטיסיית מועדון: ${club.progress}/${club.every}`;
    const ok = await text(c, body);
    await logSent(c, b, "confirm", body, ok);
    s.mode = undefined; s.step = undefined; s.svc = undefined; s.date = undefined; s.time = undefined; s.staff = undefined;
  } catch (e: any) {
    if (e instanceof HttpError && e.code === "taken") return askTime(c, s.date, undefined, 0, t(c).taken);
    if (e instanceof HttpError && e.code === "blocked") return human(c, "blocked");
    throw e;
  }
}

/** a booking the sender owns, or null */
async function own(c: Ctx, tok: string) {
  try { const r = await findByToken(c.kv, tok); return r.b.phone === c.phone && r.biz.slug === c.biz.slug ? r : null } catch { return null }
}
async function upcoming(c: Ctx) {
  const now = Date.now();
  return (await clientBookings(c.kv, c.biz.slug, c.phone)).filter(b => b.status === "confirmed" && ilEpoch(b.date, b.time) > now)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}
async function my(c: Ctx, then?: "cancel" | "move") {
  c.sess.mode = undefined; c.sess.step = undefined;
  const items = await upcoming(c);
  if (!items.length) return buttons(c, t(c).none, [["m:book", t(c).bBook], ["m:menu", t(c).bMenu]]);
  if (items.length === 1) {
    if (then === "cancel") return askCancel(c, items[0].id);
    if (then === "move") return startMove(c, items[0].id);
    return showBooking(c, items[0].id);
  }
  const pre = then === "cancel" ? "cx" : then === "move" ? "mv" : "bk";
  await list(c, t(c).pickBk, t(c).bkBtn, items.slice(0, 10).map(b => ({ id: `${pre}|${b.id}`, title: `${dateText(b.date, c.lang)} ${b.time}`, description: L(c, b.serviceName) })));
}
async function showBooking(c: Ctx, tok: string) {
  const r = await own(c, tok); if (!r) return my(c);
  const b = r.b;
  await buttons(c, t(c).bk(L(c, b.serviceName), dText(c, b.date), b.time), [[`mv|${b.id}`, t(c).bMove], [`cx|${b.id}`, t(c).bCancel], ["fine", t(c).bFine]]);
}
async function guard(c: Ctx, tok: string) {
  const r = await own(c, tok); if (!r) { await my(c); return null }
  const st = changeState(r.biz, r.b);
  if (!st.canChange) {
    if (st.reason === "too_late") await buttons(c, t(c).tooLate(r.biz.cutoff, bizLink(c)), [["m:human", t(c).bHuman], ["m:menu", t(c).bMenu]]);
    else await my(c);
    return null;
  }
  return r;
}
async function askCancel(c: Ctx, tok: string) {
  const r = await guard(c, tok); if (!r) return;
  await buttons(c, t(c).cancelQ(L(c, r.b.serviceName), dText(c, r.b.date), r.b.time), [[`cxy|${tok}`, t(c).bYes], ["keep", t(c).bNo]]);
}
async function doCancel(c: Ctx, tok: string) {
  const r = await guard(c, tok); if (!r) return;
  await cancelByClient(c.kv, c.env, tok, c.siteUrl, undefined, true);
  const b = { ...r.b, status: "cancelled" } as Booking;
  const body = renderText("cancelled", c.lang, msgParams({ ...b, lang: c.lang }, c.biz, "cancelled", c.siteUrl));
  const ok = await text(c, body);
  await logSent(c, b, "cancelled", body, ok);
}
async function startMove(c: Ctx, tok: string) {
  const r = await guard(c, tok); if (!r) return;
  Object.assign(c.sess, { mode: "move", tok, dur: r.b.dur, staff: r.b.staffId, svc: r.b.serviceId });
  await askDay(c);
}
async function doMove(c: Ctx) {
  const s = c.sess;
  if (!s.tok || !s.date || !s.time) return menu(c);
  try {
    await reschedule(c.kv, c.env, s.tok, { date: s.date, time: s.time, staffId: s.staff, via: "bot" }, c.siteUrl);
  } catch (e: any) {
    if (e instanceof HttpError && e.code === "taken") return askTime(c, s.date, undefined, 0, t(c).taken);
    if (e instanceof HttpError) return my(c);
    throw e;
  }
  const r = await own(c, s.tok);
  if (r) {
    const body = renderText("changed", c.lang, msgParams({ ...r.b, lang: c.lang }, c.biz, "changed", c.siteUrl));
    const ok = await text(c, body);
    await logSent(c, r.b, "changed", body, ok);
  }
  Object.assign(s, { mode: undefined, step: undefined, tok: undefined, date: undefined, time: undefined, staff: undefined, svc: undefined });
}
async function human(c: Ctx, why = "human", msg = "") {
  if (!c.sim) await addInbox(c.kv, c.biz.slug, { phone: c.phone, name: (await knownName(c)) || c.sess.pname || "", text: msg, kind: why });
  await text(c, t(c).human(L(c, c.biz.name), bizLink(c)));
}

/* ---------------- understanding free text ---------------- */
interface Parsed { intent: string; service?: string; date?: string; time?: string; tod?: Tod; answer?: string }
const RX = {
  cancel: /(לבטל|ביטול|בטל|إلغاء|الغاء|إلغي|الغي|ألغي|ابطل|بلغي|cancel)/i,
  move: /(להזיז|לשנות|לדחות|להקדים|تغيير|غير|غيّر|اغير|أغير|أجل|اجل|تأجيل|انقل|نقل)/i,
  my: /(התורים שלי|התור שלי|מתי התור|موعدي|مواعيدي|دوري|دوري امتى|ايمتى دوري)/i,
  human: /(נציג|לדבר עם|בן אדם|תתקשר|מישהו אמיתי|احكي مع|بدي احكي|موظف|انسان|تواصل)/i,
  book: /(תור|לקבוע|פנוי|יש מקום|دور|موعد|احجز|حجز|فاضي|في مجال)/i,
  menu: /^(תפריט|menu|قائمة|القائمة|start|התחל|0)$/i,
  hi: /^(היי|הי|שלום|אהלן|הלו|מה נשמע|hi|hello|hey|مرحبا|مرحبًا|اهلا|أهلا|هلا|السلام عليكم|سلام|مسا الخير|صباح الخير|بوكير طوف|ערב טוב|בוקר טוב)[\s!.,?🙂👋]*$/i,
};
function keywordParse(text: string): Parsed {
  const s = text.trim();
  const today = ilNow().date;
  const date = /(מחר|بكرا|بكره|بكرة|غدا|غدًا|bukra)/i.test(s) ? addDays(today, 1) : /(היום|اليوم|هلأ|עכשיו)/i.test(s) ? today : undefined;
  const tod: Tod | undefined = /(בוקר|الصبح|صباح|الصباح)/i.test(s) ? "morning" : /(צהריים|الظهر|ظهر)/i.test(s) ? "noon" : /(ערב|المسا|مسا|مساء|المساء)/i.test(s) ? "evening" : undefined;
  if (RX.menu.test(s) || RX.hi.test(s)) return { intent: "greeting" };
  if (RX.cancel.test(s)) return { intent: "cancel" };
  if (RX.move.test(s)) return { intent: "move" };
  if (RX.my.test(s)) return { intent: "my" };
  if (RX.human.test(s)) return { intent: "human" };
  if (RX.book.test(s) || date || tod) return { intent: "book", date, tod };
  return { intent: "other" };
}

async function aiParse(c: Ctx, text: string): Promise<Parsed | null> {
  const key = c.env("ANTHROPIC_API_KEY");
  if (!key || !c.biz.bot.ai) return null;
  const today = ilNow().date;
  const cal = Array.from({ length: 14 }, (_, i) => { const d = addDays(today, i); return `${d} = ${dateText(d, "he")} / ${dateText(d, "ar")}${i === 0 ? " (today)" : i === 1 ? " (tomorrow)" : ""}` }).join("\n");
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const info = [
    `Business: ${c.biz.name.he} / ${c.biz.name.ar} (${({ nails: "nail studio", beauty: "women's hair salon", cosmetics: "beauty / skin-care clinic", lashes: "lashes & brows studio" } as any)[c.biz.type] || "barbershop"})`,
    c.biz.address ? `Address: ${c.biz.address}` : "", c.biz.phone ? `Phone: ${c.biz.phone}` : "",
    `Opening hours: ${c.biz.hours.map((h, i) => `${days[i]} ${h.open ? h.from + "-" + h.to : "closed"}`).join(", ")}`,
    `Services:\n${c.biz.services.map(s => `- id=${s.id}: ${s.name.he} / ${s.name.ar}, ${s.dur} min, ₪${s.price}`).join("\n")}`,
    `Staff: ${c.biz.staff.map(s => s.name.he).join(", ")}`,
    c.biz.products.filter(p => p.active).length ? `Products for sale: ${c.biz.products.filter(p => p.active).map(p => `${p.name.he} ₪${p.price}`).join(", ")}` : "",
    c.biz.club.enabled ? `Loyalty club: every ${c.biz.club.rewardEvery} visits → ${c.biz.club.reward.he}` : "",
    `Cancellation: changes allowed until ${c.biz.cutoff} hours before the appointment`,
  ].filter(Boolean).join("\n");
  const system = `You route WhatsApp messages for an appointment-booking assistant in Israel. Customers write Hebrew or Arabic (often Palestinian colloquial, typos, mixed languages).
Reply with ONLY a JSON object, no prose:
{"intent":"book|my|cancel|move|question|human|greeting|other","service":"<service id or null>","date":"YYYY-MM-DD or null","time":"HH:MM or null","tod":"morning|noon|evening or null","answer":"<string or null>"}
- book: wants an appointment / asks what is free. Fill service/date/time/tod only when the customer said them. tod: morning <12:00, noon 12-16, evening >=16 ("אחה״צ"/"بعد الظهر" = noon).
- my: asks when/what their appointment is. cancel / move: wants to cancel / change their appointment.
- question: any other question about the business. Put a short, warm answer in "answer", in the customer's language and dialect, using ONLY the business info. If the info does not contain the answer, set answer to null.
- human: asks for a person / owner. greeting: hello only. other: anything else.
Calendar (use it, do not compute dates yourself):
${cal}

${info}`;
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await c.fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST", signal: ctl.signal,
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: c.env("BOT_MODEL") || "claude-haiku-5-5", max_tokens: 400, system, messages: [{ role: "user", content: text.slice(0, 800) }] }),
    });
    if (!r.ok) { console.error("ai", r.status, await r.text().catch(() => "")); return null }
    const j: any = await r.json();
    const raw = (j.content || []).map((x: any) => x.text || "").join("");
    const m = raw.match(/\{[\s\S]*\}/); if (!m) return null;
    const p = JSON.parse(m[0]);
    const out: Parsed = { intent: String(p.intent || "other") };
    if (p.service && c.biz.services.some(s => s.id === p.service)) out.service = p.service;
    if (isDate(p.date) && p.date >= today && p.date <= addDays(today, 60)) out.date = p.date;
    if (isTime(p.time)) out.time = p.time;
    if (["morning", "noon", "evening"].includes(p.tod)) out.tod = p.tod;
    if (typeof p.answer === "string" && p.answer.trim()) out.answer = p.answer.trim().slice(0, 900);
    return out;
  } catch (e) { console.error("ai", e); return null }
  finally { clearTimeout(timer) }
}

async function onText(c: Ctx, raw: string) {
  const s = c.sess, txt = raw.trim();
  if (s.step === "name" && !RX.menu.test(txt) && !RX.cancel.test(txt)) {
    const name = txt.replace(/[^\p{L}\p{M}\s'"׳״.-]/gu, "").replace(/\s+/g, " ").trim();
    if (name.length < 2 || name.length > 40) return text(c, t(c).badName);
    s.name = name; return confirmBook(c);
  }
  const p = (await aiParse(c, txt)) || keywordParse(txt);
  switch (p.intent) {
    case "greeting": return menu(c);
    case "my": return my(c);
    case "cancel": return my(c, "cancel");
    case "move": return my(c, "move");
    case "human": return human(c, "human", txt);
    case "question":
      if (p.answer) return buttons(c, p.answer, menuBtns(c));
      await addInbox(c.kv, c.biz.slug, { phone: c.phone, name: (await knownName(c)) || s.pname || "", text: txt, kind: "question" }).catch(() => { });
      return text(c, t(c).human(L(c, c.biz.name), bizLink(c)));
    case "book": {
      Object.assign(s, { mode: "book", svc: p.service || (c.biz.services.length === 1 ? c.biz.services[0].id : undefined), staff: undefined, tod: p.tod, pdate: p.date, tok: undefined });
      if (!s.svc) return askService(c);
      if (c.biz.staff.length > 1) return askStaff(c);
      s.staff = "any"; s.pdate = undefined;
      if (p.date && p.time) {
        const free = await slots(c, p.date);
        const hit = free.find(x => x.time === p.time);
        if (hit) return pickTime(c, p.date, hit.time, hit.staffId);
        return askTime(c, p.date, p.tod || todOf(p.time), 0, t(c).notFree(p.time));
      }
      if (p.date) return askTime(c, p.date, p.tod);
      return askDay(c);
    }
    default:
      // mid-flow free text that we didn't understand: repeat the current question instead of resetting
      if (s.step === "confirm" && s.mode === "book") return confirmBook(c);
      return menu(c, false);
  }
}

async function onReply(c: Ctx, id: string) {
  const s = c.sess;
  const [k, a, b, d] = id.split("|");
  switch (k) {
    case "m:book": Object.assign(s, { mode: "book", svc: undefined, staff: undefined, tok: undefined, pdate: undefined, tod: undefined }); return askService(c);
    case "m:my": return my(c);
    case "m:human": return human(c);
    case "m:menu": return menu(c);
    case "s": if (!c.biz.services.some(x => x.id === a)) return askService(c); s.mode = "book"; s.svc = a; s.staff = undefined; return askStaff(c);
    case "st": s.staff = a === "any" || c.biz.staff.some(x => x.id === a) ? a : "any"; return afterStaff(c);
    case "d": return isDate(a) ? askTime(c, a) : askDay(c);
    case "tod": return isDate(a) ? askTime(c, a, b as Tod) : askDay(c);
    case "tm": return isDate(a) ? askTime(c, a, b === "all" ? undefined : b as Tod, Math.min(20, +d || 0)) : askDay(c);
    case "t": {
      if (!isDate(a) || !isTime(b)) return askDay(c);
      if (!s.mode || (s.mode === "book" && !s.svc)) return menu(c, false);
      const free = await slots(c, a);
      const hit = free.find(x => x.time === b && (x.staffId === d || s.staff === "any" || !s.staff)) || free.find(x => x.time === b);
      if (!hit) return askTime(c, a, undefined, 0, t(c).taken);
      return pickTime(c, a, b, hit.staffId);
    }
    case "nm": if (s.step !== "name" || !s.pname) return menu(c); s.name = s.pname.trim(); return confirmBook(c);
    case "ok": return s.mode === "move" ? doMove(c) : s.mode === "book" ? doBook(c) : menu(c);
    case "re": return s.mode ? askDay(c) : menu(c);
    case "x": Object.assign(s, { mode: undefined, step: undefined }); return buttons(c, t(c).aborted, [["m:book", t(c).bBook], ["m:my", t(c).bMy]]);
    case "keep": Object.assign(s, { mode: undefined, step: undefined, tok: undefined }); return text(c, t(c).kept);
    case "fine": return text(c, t(c).fine);
    case "bk": return showBooking(c, a);
    case "cx": return askCancel(c, a);
    case "cxy": return doCancel(c, a);
    case "mv": return startMove(c, a);
    default: return menu(c);
  }
}

/* ---------------- entry point ---------------- */
const ARABIC = /[؀-ۿ]/, HEBREW = /[֐-׿]/;

/** Handles one incoming WhatsApp message. Returns the messages it sent (useful for tests and the in-app simulator). */
export async function handleIncoming(kv: KV, env: Env, siteUrl: string, m: Incoming, opts: { sim?: boolean; slug?: string; fetchImpl?: typeof fetch } = {}) {
  const out: any[] = [];
  const wa = m.from.replace(/\D/g, "");
  const phone = wa.startsWith("972") ? "0" + wa.slice(3) : wa;
  const key = `${opts.sim ? "botsim" : "bot"}/${wa}`;
  const prev: Sess | null = await kv.get(key, { type: "json" });
  if (prev?.seen?.includes(m.id)) return out; // Meta retried a message we already handled

  // which business is this chat with?
  const tag = m.text?.match(/#([a-z0-9-]{2,40})/i)?.[1]?.toLowerCase();
  let biz: Biz | null = null;
  for (const slug of [opts.slug, tag, m.phoneId && (await kv.get(`wapid/${m.phoneId}`, { type: "json" }))?.slug, prev?.slug, (await kv.get(`who/${phone}`, { type: "json" }))?.slug, env("WA_DEFAULT_SLUG")]) {
    if (slug && (biz = await getBiz(kv, String(slug)))) break;
  }
  const guessLang: Lang = m.text && ARABIC.test(m.text) ? "ar" : m.text && HEBREW.test(m.text) ? "he" : prev?.lang || "he";
  const fresh = !prev || prev.slug !== biz?.slug || Date.now() - prev.at > 3 * 3600e3;
  const sess: Sess = fresh ? { slug: biz?.slug || "", lang: guessLang, at: Date.now(), seen: prev?.seen || [], name: prev?.slug === biz?.slug ? prev?.name : undefined } : prev!;
  sess.at = Date.now(); sess.lang = m.text ? guessLang : sess.lang; sess.seen = [...(sess.seen || []), m.id].slice(-15);
  if (m.profileName) sess.pname = m.profileName.slice(0, 40);

  const c: Ctx = { kv, env, siteUrl, fetchImpl: opts.fetchImpl || fetch, sim: !!opts.sim, phoneId: m.phoneId || biz?.waPhoneId || env("WA_PHONE_ID") || "", to: wa, phone, out, biz: biz!, sess, lang: sess.lang };

  if (!biz) {
    c.biz = { name: { he: "TorLink", ar: "TorLink" } } as Biz;
    await text(c, T[c.lang].unknown);
    await kv.setJSON(key, sess); return out;
  }
  const botOk = biz.bot.enabled && isLive(biz) && hasBot(await getPlatform(kv), biz);
  if (!/^05\d{8}$/.test(phone) || !botOk) {
    await text(c, `${!botOk ? t(c).off : t(c).foreign}\n${siteUrl}/b/${biz.slug}`);
    await kv.setJSON(key, sess); return out;
  }

  try {
    if (m.replyId) await onReply(c, m.replyId);
    else if (m.text && m.text.replace(/#[a-z0-9-]+/ig, "").trim()) await onText(c, m.text.replace(/#[a-z0-9-]+/ig, "").trim());
    else if (m.text) await menu(c);
    else await buttons(c, t(c).noMedia, menuBtns(c));
  } catch (e) {
    console.error("bot", e);
    await text(c, c.lang === "ar" ? `صار خلل صغير 🙏 بتقدر/ي تحجز/ي هون: ${siteUrl}/b/${biz.slug}` : `משהו השתבש 🙏 אפשר לקבוע כאן: ${siteUrl}/b/${biz.slug}`);
  }
  await kv.setJSON(key, sess);
  return out;
}

/** Turns a Meta webhook body into Incoming messages. */
export function parseWebhook(body: any): Incoming[] {
  const out: Incoming[] = [];
  for (const e of body?.entry || []) for (const ch of e.changes || []) {
    const v = ch.value || {};
    const names: Record<string, string> = {};
    for (const ct of v.contacts || []) names[ct.wa_id] = ct.profile?.name || "";
    for (const msg of v.messages || []) {
      const inc: Incoming = { from: String(msg.from), id: String(msg.id), phoneId: v.metadata?.phone_number_id, profileName: names[msg.from], kind: msg.type };
      if (msg.type === "text") inc.text = msg.text?.body || "";
      else if (msg.type === "interactive") inc.replyId = msg.interactive?.button_reply?.id || msg.interactive?.list_reply?.id;
      else if (msg.type === "button") inc.text = msg.button?.text || msg.button?.payload || "";
      out.push(inc);
    }
  }
  return out;
}

/** X-Hub-Signature-256 check (only when WA_APP_SECRET is set). */
export async function validSignature(secret: string | undefined, raw: string, header: string | null) {
  if (!secret) return true;
  if (!header?.startsWith("sha256=")) return false;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(raw)));
  const hex = Array.from(sig, b => b.toString(16).padStart(2, "0")).join("");
  const got = header.slice(7);
  if (got.length !== hex.length) return false;
  let diff = 0; for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}
