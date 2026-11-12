import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import {
  HttpError, getBiz, ensureDemo, DEMOS, saveBiz, getDay, publicBiz, publicBooking, slotsFor, createBooking, findByToken,
  changeState, reschedule, cancelByClient, adminBookings, adminSetStatus, sanitizeConfig, adminMessages,
  sendWhatsApp, logMsg, buildBiz, ilNow, addDays, getClients, clubCard, createOrder, adminOrders, adminOrderStatus,
  adminUpdateClient, setLogo, setItemImage, setSpin, getSpin, addGalleryImage, removeGalleryImage, getImage, decodeDataUrl, getReviews, addReview, publicReviews,
  getInbox, inboxDone, sellPack, redeemPack, cardLink, getCard, cardClient,
  type KV, type Env, type Booking,
} from "../lib/core.mts";
import { gwConfigured, saveUrl, syncPass } from "../lib/gwallet.mts";
import { handleIncoming } from "../lib/bot.mts";
import { getPlatform, hasBot, planOf, signup, slugFree, superList, superAction, sanitizePlatform } from "../lib/platform.mts";
import { isLive } from "../lib/core.mts";

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
      const biz = DEMOS[parts[1]] ? await ensureDemo(kv, env, parts[1]) : await getBiz(kv, parts[1]);
      if (!biz) return json({ error: "not_found" }, 404);
      const waBot = biz.bot.enabled && isLive(biz) && hasBot(await getPlatform(kv), biz) ? (env("WA_DISPLAY_NUMBER") || "").replace(/\D/g, "") : "";
      return json({ biz: publicBiz(biz), today: ilNow().date, waBot });
    }
    // ---------- sales page & sign-up ----------
    if (parts[0] === "platform" && req.method === "GET") {
      const p = await getPlatform(kv);
      return json({ plans: p.plans, payInfo: p.payInfo, contact: p.contact });
    }
    if (parts[0] === "join" && parts[1] === "check" && req.method === "GET")
      return json({ free: await slugFree(kv, String(url.searchParams.get("slug") || "").toLowerCase()) });
    if (parts[0] === "join" && !parts[1] && req.method === "POST") return json(await signup(kv, env, body));

    if (parts[0] === "extras" && parts[1] && req.method === "GET") {
      const biz = await getBiz(kv, parts[1]);
      if (!biz) return json({ error: "not_found" }, 404);
      return json({ reviews: publicReviews(await getReviews(kv, biz.slug)) });
    }
    // images: /api/img/<slug>/logo  or  /api/img/<slug>/g/<id>   (?json=1 returns {src} for the in-browser preview)
    if (parts[0] === "img" && parts[1] && req.method === "GET") {
      const src = await getImage(kv, parts[1], parts.slice(2).join("/"));
      if (!src) return json({ error: "not_found" }, 404);
      if (url.searchParams.get("json")) return json({ src });
      const { type, bytes } = decodeDataUrl(src);
      return new Response(bytes, { headers: { "content-type": type, "cache-control": "public, max-age=31536000, immutable" } });
    }
    if (parts[0] === "spin" && parts[1] && parts[2] && req.method === "GET") {
      const frames = await getSpin(kv, parts[1], parts[2]);
      if (!frames) return json({ error: "not_found" }, 404);
      return new Response(JSON.stringify({ frames }), { headers: { "content-type": "application/json", "cache-control": "public, max-age=31536000, immutable" } });
    }
    if (parts[0] === "manifest" && parts[1] && req.method === "GET") {
      const biz = await getBiz(kv, parts[1]);
      if (!biz) return json({ error: "not_found" }, 404);
      const admin = url.searchParams.get("admin") === "1";
      const name = admin ? `TorLink · ${biz.name.he || biz.name.ar}` : (biz.name.he || biz.name.ar);
      const tl = [{ src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" }, { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }];
      return new Response(JSON.stringify({
        name, short_name: admin ? "TorLink" : name.slice(0, 12), start_url: admin ? `/admin/${biz.slug}` : /^[A-Za-z0-9]{10,20}$/.test(url.searchParams.get("card") || "") ? `/c/${url.searchParams.get("card")}` : `/b/${biz.slug}`, scope: "/", display: "standalone", dir: "rtl", lang: "he",
        background_color: admin ? "#0B0A09" : biz.theme.mode === "light" ? "#f7f5f1" : "#0e0e10", theme_color: admin ? "#0B0A09" : biz.theme.accent,
        icons: !admin && biz.logoV ? [{ src: `/api/img/${biz.slug}/logo?v=${biz.logoV}`, sizes: "512x512", type: "image/png", purpose: "any" }] : tl,
      }), { headers: { "content-type": "application/manifest+json", "cache-control": "no-cache" } });
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
    if (parts[0] === "order" && req.method === "POST") {
      const biz = await getBiz(kv, String(body.slug || ""));
      if (!biz) return json({ error: "not_found" }, 404);
      const order = await createOrder(kv, biz, body);
      return json({ order });
    }
    if (parts[0] === "card" && parts[1] && parts[2] === "google" && req.method === "GET") {
      if (!gwConfigured(env)) throw new HttpError(404, "wallet_off");
      const { biz, c, save } = await cardClient(kv, parts[1]);
      if (!c.gw) { c.gw = true; await save() }
      return json({ url: await saveUrl(env, biz, c, siteUrl) });
    }
    if (parts[0] === "card" && parts[1] && req.method === "GET") return json({ ...await getCard(kv, parts[1]), gw: gwConfigured(env) });
    if (parts[0] === "booking" && parts[1]) {
      if (req.method === "GET" && !parts[2]) {
        const { biz, b } = await findByToken(kv, parts[1]);
        const club = clubCard(biz, (await getClients(kv, biz.slug))[b.phone]);
        const card = await cardLink(kv, biz.slug, b.phone).catch(() => "");
        return json({ biz: publicBiz(biz), booking: publicBooking(b), ...changeState(biz, b), club, card, today: ilNow().date });
      }
      if (req.method === "POST" && parts[2] === "reschedule") return json(await reschedule(kv, env, parts[1], body, siteUrl));
      if (req.method === "POST" && parts[2] === "cancel") return json(await cancelByClient(kv, env, parts[1], siteUrl));
      if (req.method === "POST" && parts[2] === "review") return json({ review: await addReview(kv, parts[1], body) });
    }

    // ---------- admin (PIN per business) ----------
    if (parts[0] === "admin" && parts[1]) {
      const biz = DEMOS[parts[1]] ? await ensureDemo(kv, env, parts[1]) : await getBiz(kv, parts[1]);
      if (!biz) return json({ error: "not_found" }, 404);
      const pin = req.headers.get("x-admin-pin") || body.pin;
      if (!pin || pin !== biz.pin) return json({ error: "bad_pin" }, 401);
      const action = parts[2];
      if (action === "login" || (action === "config" && req.method === "GET"))
      {
        const p = await getPlatform(kv), plan = planOf(p, biz.plan);
        return json({
          biz, waConnected: !!(env("WA_TOKEN") && env("WA_PHONE_ID")), today: ilNow().date, waBot: (env("WA_DISPLAY_NUMBER") || "").replace(/\D/g, ""), botAi: !!env("ANTHROPIC_API_KEY"),
          sub: { status: biz.status, paidUntil: biz.paidUntil, live: isLive(biz), plan: plan ? { id: plan.id, name: plan.name, price: plan.price, bot: plan.bot } : null, payInfo: p.payInfo, contact: p.contact, plans: p.plans.map(x => ({ id: x.id, name: x.name, price: x.price, bot: x.bot })) },
        });
      }
      // chat simulator in the dashboard: runs the real bot without sending anything to WhatsApp
      if (action === "bot-sim" && req.method === "POST") {
        const phone = String(body.phone || "0500000000").replace(/\D/g, "");
        if (!/^05\d{8}$/.test(phone)) return json({ error: "bad_phone" }, 400);
        const out = await handleIncoming(kv, env, siteUrl, {
          from: "972" + phone.slice(1), id: "sim-" + Date.now() + Math.random(), text: body.text ? String(body.text).slice(0, 500) : undefined,
          replyId: body.replyId ? String(body.replyId).slice(0, 200) : undefined, profileName: body.profileName ? String(body.profileName).slice(0, 40) : undefined,
        }, { sim: true, slug: biz.slug });
        return json({ out });
      }
      if (action === "bot-sim-reset" && req.method === "POST") {
        const phone = String(body.phone || "0500000000").replace(/\D/g, "");
        await kv.delete(`botsim/972${phone.slice(1)}`);
        return json({ ok: true });
      }
      if (action === "inbox" && req.method === "GET") return json({ items: await getInbox(kv, biz.slug) });
      if (action === "inbox-done" && req.method === "POST") { await inboxDone(kv, biz.slug, String(body.id || "")); return json({ ok: true }) }
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
      if (action === "logo" && req.method === "PUT") return json({ biz: await setLogo(kv, biz, String(body.src ?? "")) });
      if (action === "spin" && req.method === "PUT") return json({ biz: await setSpin(kv, biz, String(body.id), body.frames) });
      if (action === "item-img" && req.method === "PUT") return json({ biz: await setItemImage(kv, biz, String(body.kind), String(body.id), String(body.src ?? "")) });
      if (action === "gallery" && req.method === "POST") return json({ biz: await addGalleryImage(kv, biz, String(body.src || "")) });
      if (action === "gallery-del" && req.method === "POST") return json({ biz: await removeGalleryImage(kv, biz, String(body.id || "")) });
      if (action === "reviews" && req.method === "GET") return json({ reviews: await getReviews(kv, biz.slug), rating: biz.rating });
      if (action === "review-reply" && req.method === "POST") {
        const items = await getReviews(kv, biz.slug), r = items.find(x => x.id === body.id);
        if (!r) return json({ error: "not_found" }, 404);
        r.reply = String(body.reply || "").slice(0, 300); await kv.setJSON(`reviews/${biz.slug}`, { items });
        return json({ review: r });
      }
      if (action === "clients" && req.method === "GET") return json({ clients: Object.values(await getClients(kv, biz.slug)) });
      if (action === "client" && req.method === "PUT") return json({ client: await adminUpdateClient(kv, biz.slug, body) });
      if (action === "pack-sell" || action === "pack-use") {
        if (req.method !== "POST") throw new HttpError(405, "method");
        const client = action === "pack-sell" ? await sellPack(kv, biz, body) : await redeemPack(kv, biz, body);
        await syncPass(env, biz, client, siteUrl);
        return json({ client });
      }
      if (action === "card-link" && req.method === "POST") return json({ token: await cardLink(kv, biz.slug, String(body.phone || "")) });
      if (action === "orders" && req.method === "GET") return json({ orders: await adminOrders(kv, biz.slug, +(url.searchParams.get("months") || 3)) });
      if (action === "order-status" && req.method === "POST") return json({ order: await adminOrderStatus(kv, biz, String(body.id), String(body.status)) });
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

    // ---------- platform owner dashboard ----------
    if (parts[0] === "super" && ["list", "biz", "settings"].includes(parts[1])) {
      const key = env("SUPER_KEY");
      if (!key || req.headers.get("x-super-key") !== key) return json({ error: "forbidden" }, 403);
      if (parts[1] === "list" && req.method === "GET") return json(await superList(kv));
      if (parts[1] === "biz" && req.method === "POST") return json(await superAction(kv, body));
      if (parts[1] === "settings" && req.method === "PUT") { const p = sanitizePlatform(body); await kv.setJSON("platform/settings", p); return json({ platform: p }) }
    }

    // ---------- give a business its own WhatsApp number (phone_number_id from Meta) ----------
    if (parts[0] === "super" && parts[1] === "wa-link" && req.method === "POST") {
      const key = env("SUPER_KEY");
      if (!key || req.headers.get("x-super-key") !== key) return json({ error: "forbidden" }, 403);
      const biz = await getBiz(kv, String(body.slug || ""));
      const pid = String(body.phoneId || "").replace(/\D/g, "");
      if (!biz || !pid) return json({ error: "bad_request" }, 400);
      if (biz.waPhoneId && biz.waPhoneId !== pid) await kv.delete(`wapid/${biz.waPhoneId}`);
      biz.waPhoneId = pid; await saveBiz(kv, biz); await kv.setJSON(`wapid/${pid}`, { slug: biz.slug });
      return json({ ok: true, slug: biz.slug, phoneId: pid });
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
