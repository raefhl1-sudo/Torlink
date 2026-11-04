// Browser stand-in for @netlify/blobs, used only by the in-browser preview build.
// Data is kept in localStorage (falls back to memory if storage is unavailable).
const mem = new Map<string, string>();
const P = "tlp:";
const ls = {
  get(k: string) { try { const v = localStorage.getItem(P + k); return v ?? (mem.get(k) ?? null) } catch { return mem.get(k) ?? null } },
  set(k: string, v: string) { mem.set(k, v); try { localStorage.setItem(P + k, v) } catch { } },
  del(k: string) { mem.delete(k); try { localStorage.removeItem(P + k) } catch { } },
  keys() {
    const out = new Set(mem.keys());
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; if (k.startsWith(P)) out.add(k.slice(P.length)) } } catch { }
    return [...out];
  },
};
export function getStore(_opts?: unknown) {
  return {
    async get(k: string) { const v = ls.get(k); return v == null ? null : JSON.parse(v) },
    async setJSON(k: string, v: unknown) { ls.set(k, JSON.stringify(v)); return { modified: true } },
    async list({ prefix }: { prefix: string }) { return { blobs: ls.keys().filter(k => k.startsWith(prefix)).map(key => ({ key })) } },
    async delete(k: string) { ls.del(k) },
  };
}
