import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import {
  HttpError, getBiz, ensureDemo, saveBiz, getDay, publicBiz, publicBooking, slotsFor, createBooking, findByToken,
  changeState, reschedule, cancelByClient, adminBookings, adminSetStatus, sanitizeConfig, adminMessages,
  sendWhatsApp, logMsg, buildBiz, ilNow, addDays, type KV, type Env, type Booking,
} from "../lib/core.mts";

const env: Env = k => Netlify.env.get(k);
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });

export default async (req: Request, context: Context) => {
  const kv = getStore({ name: "torlink", consistency: "strong" }) as unknown as KV;
  const url = new URL(req.url);
  const siteUrl = env("PUBLIC_URL") || url.origin;
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const body = req.method === "POST" || req.method === "PUT" ? await req.json().catch(() => ({})) : {};

  try {
    // ---------- public ----------
    if (parts[0] === "biz" && parts[1] && req.method === "GET") {
      const biz = parts[1] === "demo" ? await ensureDemo(kv, env) : await getBiz(kv, parts[1]);
      if (!biz) return json({ error: "not_found" }, 404);
      return json({ biz: publicBiz(biz), today: ilNow().date });
    }
    if (parts[0] === "slots" && req.method === "GET") {
      const slug = url.searchParams.get("slug") || "", date = url.searchParams.get("date") || "";
      const biz = await getBiz(kv, slug);
      if (!biz || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "bad_request" }, 400);
      let dur = biz.services.find(s => s.id === url.searchParams.get("service"))?.dur;
      const ignore = url.searchParams.get("ignore") || undefined;
      let staff = url.searchParams.get("staff") || "any";
      const day = await getDay(kv, slug, date);
      if (ignore) {
        // rescheduling: keep the booking's own duration; its slot counts as free
        const { b } = await findByToken(kv, ignore);
        dur = b.dur; if (staff === "any") staff = b.staffId;
      }
      if (!dur) return json({ error: "bad_service" }, 400);
      return json({ slots: slotsFor(biz, day, date, dur, staff, ignore) });
    }
    if (parts[0] === "book" && req.method === "POST") {
      const biz = await getBiz(kv, String(body.slug || ""));
      if (!biz) return json({ error: "not_found" }, 404);
      return json(await createBooking(kv, env, biz, body, siteUrl));
    }
    if (parts[0] === "booking" && parts[1]) {
      if (req.method === "GET" && !parts[2]) {
        const { biz, b } = await findByToken(kv, parts[1]);
        return json({ biz: publicBiz(biz), booking: publicBooking(b), ...changeState(biz, b), today: ilNow().date });
      }
      if (req.method === "POST" && parts[2] === "reschedule") return json(await reschedule(kv, env, parts[1], body, siteUrl));
      if (req.method === "POST" && parts[2] === "cancel") return json(await cancelByClient(kv, env, parts[1], siteUrl));
    }

    // ---------- admin (PIN per business) ----------
    if (parts[0] === "admin" && parts[1]) {
      const biz = parts[1] === "demo" ? await ensureDemo(kv, env) : await getBiz(kv, parts[1]);
      if (!biz) return json({ error: "not_found" }, 404);
      const pin = req.headers.get("x-admin-pin") || body.pin;
      if (!pin || pin !== biz.pin) return json({ error: "bad_pin" }, 401);
      const action = parts[2];
      if (action === "login" || (action === "config" && req.method === "GET"))
        return json({ biz, waConnected: !!(env("WA_TOKEN") && env("WA_PHONE_ID")), today: ilNow().date });
      if (action === "config" && req.method === "PUT") {
        const next = sanitizeConfig(biz, body);
        await saveBiz(kv, next);
        return json({ biz: next });
      }
      if (action === "bookings" && req.method === "GET") {
        const today = ilNow().date;
        const from = url.searchParams.get("from") || addDays(today, -3);
        const to = url.searchParams.get("to") || addDays(today, 14);
        return json({ bookings: await adminBookings(kv, biz.slug, from, to) });
      }
      if (action === "status" && req.method === "POST")
        return json(await adminSetStatus(kv, env, biz, String(body.date), String(body.id), String(body.status), siteUrl));
      if (action === "messages" && req.method === "GET")
        return json({ messages: await adminMessages(kv, biz.slug), waConnected: !!(env("WA_TOKEN") && env("WA_PHONE_ID")) });
      if (action === "test-message" && req.method === "POST") {
        const phone = String(body.phone || "").replace(/\D/g, "");
        if (!/^05\d{8}$/.test(phone)) return json({ error: "bad_phone" }, 400);
        const today = ilNow().date, svc = biz.services[0];
        const fake: Booking = { id: "TEST", slug: biz.slug, date: addDays(today, 1), time: "10:00", dur: svc.dur, serviceId: svc.id, serviceName: svc.name, staffId: biz.staff[0].id, name: body.lang === "ar" ? "تجربة" : "בדיקה", phone, price: svc.price, status: "confirmed", lang: body.lang === "ar" ? "ar" : "he", created: Date.now() };
        const m = await sendWhatsApp(env, fake, biz, "confirm", siteUrl);
        await logMsg(kv, biz.slug, m);
        return json({ message: m });
      }
    }

    // ---------- create a new business (for onboarding customers) ----------
    if (parts[0] === "super" && parts[1] === "create" && req.method === "POST") {
      const key = env("SUPER_KEY");
      if (!key || req.headers.get("x-super-key") !== key) return json({ error: "forbidden" }, 403);
      const slug = String(body.slug || "").toLowerCase();
      if (!/^[a-z0-9-]{2,40}$/.test(slug)) return json({ error: "bad_slug" }, 400);
      if (await getBiz(kv, slug)) return json({ error: "exists" }, 409);
      const pin = /^\d{4,8}$/.test(String(body.pin)) ? String(body.pin) : String(Math.floor(1000 + Math.random() * 9000));
      const biz = buildBiz(slug, String(body.type || "barber"), pin, body.name?.he ? { he: String(body.name.he), ar: String(body.name.ar || body.name.he) } : undefined);
      await saveBiz(kv, biz);
      return json({ biz, bookingUrl: `${siteUrl}/b/${slug}`, adminUrl: `${siteUrl}/admin/${slug}` });
    }

    return json({ error: "not_found" }, 404);
  } catch (e: any) {
    if (e instanceof HttpError) return json({ error: e.code }, e.status);
    console.error(e);
    return json({ error: "server_error" }, 500);
  }
};

export const config: Config = {
  path: "/api/*",
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
