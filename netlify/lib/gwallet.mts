// Google Wallet "generic pass" for the client card (/c/<token>).
// Needs two env vars: GW_ISSUER_ID (from the Google Pay & Wallet console) and
// GW_KEY (the full service-account JSON key). Uses Web Crypto only, so it runs
// in Netlify Functions and in the browser preview bundle alike.
import type { Biz, Client } from "./core.mts";

type Env = (k: string) => string | undefined;
interface SaKey { client_email: string; private_key: string }

export function gwConfigured(env: Env) {
  return !!(env("GW_ISSUER_ID") && env("GW_KEY"));
}
function saKey(env: Env): SaKey {
  const k = JSON.parse(env("GW_KEY") || "{}");
  if (!k.client_email || !k.private_key) throw new Error("GW_KEY is not a service-account JSON key");
  return k;
}

const b64url = (buf: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof buf === "string" ? new TextEncoder().encode(buf) : buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
let keyCache: { pem: string; key: CryptoKey } | null = null;
async function signingKey(pem: string) {
  if (keyCache?.pem === pem) return keyCache.key;
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  keyCache = { pem, key };
  return key;
}
async function jwt(sa: SaKey, claims: Record<string, unknown>) {
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(claims));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", await signingKey(sa.private_key), new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`;
}

const lv = (he: string, ar: string) => ({
  defaultValue: { language: "he", value: he },
  translatedValues: ar && ar !== he ? [{ language: "ar", value: ar }] : [],
});
const ids = (env: Env, biz: Biz, c: Client) => {
  const iss = env("GW_ISSUER_ID")!;
  return { classId: `${iss}.torlink_${biz.slug.replace(/[^\w-]/g, "_")}`, objectId: `${iss}.card_${c.card}` };
};

/** the pass contents: balance of the best live package, club visits, QR = card URL */
export function passObject(env: Env, biz: Biz, c: Client, site: string) {
  const { classId, objectId } = ids(env, biz, c);
  const url = `${site}/c/${c.card}`;
  const today = new Date(Date.now() + 2 * 36e5).toISOString().slice(0, 10);
  const live = (c.packs || []).filter(k => k.left > 0 && (!k.expires || k.expires >= today))
    .sort((a, z) => (a.expires || "9999").localeCompare(z.expires || "9999"));
  const k = live[0];
  const rows: any[] = [];
  if (k) rows.push({ id: "left", ...{ localizedHeader: lv("כניסות שנותרו", "دخولات باقية"), localizedBody: lv(`${k.left} / ${k.total}`, `${k.left} / ${k.total}`) } });
  if (k?.expires) rows.push({ id: "exp", localizedHeader: lv("בתוקף עד", "صالحة لـ"), localizedBody: lv(k.expires.split("-").reverse().join("/"), k.expires.split("-").reverse().join("/")) });
  if (biz.club?.enabled) rows.push({ id: "visits", localizedHeader: lv("ביקורים", "زيارات"), localizedBody: lv(String(c.visits), String(c.visits)) });
  const logo = biz.logoV ? `${site}/api/img/${biz.slug}/logo?v=${biz.logoV}` : `${site}/wallet-logo.png`;
  return {
    id: objectId, classId, state: "ACTIVE",
    cardTitle: lv(biz.name.he, biz.name.ar),
    subheader: k ? lv(k.name.he, k.name.ar) : lv("כרטיס לקוח", "بطاقة زبون"),
    header: lv(c.name || "•••• " + c.phone.slice(-4), c.name || "•••• " + c.phone.slice(-4)),
    logo: { sourceUri: { uri: logo }, contentDescription: lv(biz.name.he, biz.name.ar) },
    hexBackgroundColor: /^#[0-9a-f]{6}$/i.test(biz.theme?.accent || "") ? biz.theme.accent : "#c9a45c",
    barcode: { type: "QR_CODE", value: url, alternateText: "•••• " + c.phone.slice(-4) },
    textModulesData: rows,
    linksModuleData: { uris: [
      { id: "card", uri: url, localizedDescription: lv("הכרטיס שלי", "بطاقتي") },
      { id: "book", uri: `${site}/b/${biz.slug}`, localizedDescription: lv("קביעת תור", "حجز دور") },
    ] },
  };
}

/** "Add to Google Wallet" link — the class and object are created when the client saves it */
export async function saveUrl(env: Env, biz: Biz, c: Client, site: string) {
  const sa = saKey(env), obj = passObject(env, biz, c, site);
  const token = await jwt(sa, {
    iss: sa.client_email, aud: "google", typ: "savetowallet", iat: Math.floor(Date.now() / 1000),
    origins: [site],
    payload: { genericClasses: [{ id: obj.classId }], genericObjects: [obj] },
  });
  return `https://pay.google.com/gp/v/save/${token}`;
}

let tokCache: { at: number; tok: string; email: string } | null = null;
async function accessToken(sa: SaKey, fetchImpl: typeof fetch) {
  const now = Math.floor(Date.now() / 1000);
  if (tokCache && tokCache.email === sa.client_email && tokCache.at > now + 60) return tokCache.tok;
  const assertion = await jwt(sa, { iss: sa.client_email, scope: "https://www.googleapis.com/auth/wallet_object.issuer", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
  const r = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${assertion}`,
  });
  const j: any = await r.json();
  if (!j.access_token) throw new Error("google token: " + JSON.stringify(j).slice(0, 200));
  tokCache = { at: now + (j.expires_in || 3600), tok: j.access_token, email: sa.client_email };
  return j.access_token as string;
}

/** push the new balance to a saved pass; silently does nothing if Wallet isn't set up or the client never saved it */
export async function syncPass(env: Env, biz: Biz, c: Client, site: string, fetchImpl: typeof fetch = fetch) {
  if (!gwConfigured(env) || !c.card || !c.gw) return;
  try {
    const obj = passObject(env, biz, c, site);
    const r = await fetchImpl(`https://walletobjects.googleapis.com/walletobjects/v1/genericObject/${encodeURIComponent(obj.id)}`, {
      method: "PUT", headers: { authorization: `Bearer ${await accessToken(saKey(env), fetchImpl)}`, "content-type": "application/json" },
      body: JSON.stringify(obj),
    });
    if (!r.ok && r.status !== 404) console.error("wallet sync", r.status, (await r.text()).slice(0, 300));
  } catch (e) { console.error("wallet sync", e) }
}
