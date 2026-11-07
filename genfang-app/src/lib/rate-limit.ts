// Simpel fast-vindue rate limiter i hukommelsen.
// Fint til én testinstans. I produktion: brug en delt lagring (fx Upstash Redis eller en
// Postgres-tabel), fordi Vercel kan køre flere instanser samtidig.

const g = globalThis as unknown as { __gfRate?: Map<string, { count: number; resetAt: number }> };
const buckets = (g.__gfRate ??= new Map());

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()) {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSec: 0 };
  }
  b.count += 1;
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }
  const ok = b.count <= limit;
  return { ok, remaining: Math.max(0, limit - b.count), retryAfterSec: ok ? 0 : Math.ceil((b.resetAt - now) / 1000) };
}

export function resetRateLimits() {
  buckets.clear();
}
