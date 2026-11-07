import { test } from "node:test";
import assert from "node:assert/strict";
import { safeEqual, signSession, verifySession } from "../../src/lib/session.ts";
import { rateLimit, resetRateLimits } from "../../src/lib/rate-limit.ts";

const secret = "test-secret-test-secret-test-secret-123";
const base = { uid: "u_lars", tid: "t_hansen", role: "owner" as const };

test("gyldig session verificeres", async () => {
  const t = await signSession(base, { secret });
  const p = await verifySession(t, { secret });
  assert.equal(p?.uid, "u_lars");
  assert.equal(p?.tid, "t_hansen");
});

test("manipuleret tenant-id afvises", async () => {
  const t = await signSession(base, { secret });
  const [body, sig] = t.split(".");
  const payload = JSON.parse(Buffer.from(body, "base64url").toString());
  payload.tid = "t_nordlys";
  const forged = Buffer.from(JSON.stringify(payload)).toString("base64url") + "." + sig;
  assert.equal(await verifySession(forged, { secret }), null);
});

test("forkert hemmelighed afvises", async () => {
  const t = await signSession(base, { secret });
  assert.equal(await verifySession(t, { secret: secret + "x" }), null);
});

test("udløbet session afvises", async () => {
  const t = await signSession(base, { secret, now: Date.now() - 10 * 3600_000, ttl: 3600 });
  assert.equal(await verifySession(t, { secret }), null);
});

test("affald og tomme tokens afvises", async () => {
  for (const bad of [undefined, null, "", "abc", "a.b.c", "x".repeat(3000)]) {
    assert.equal(await verifySession(bad as string, { secret }), null);
  }
});

test("safeEqual", async () => {
  assert.equal(await safeEqual("abc", "abc"), true);
  assert.equal(await safeEqual("abc", "abd"), false);
  assert.equal(await safeEqual("abc", "abcd"), false);
});

test("rate limit blokerer efter grænsen og nulstilles efter vinduet", () => {
  resetRateLimits();
  const t0 = 1_000_000;
  for (let i = 0; i < 5; i++) assert.equal(rateLimit("k", 5, 1000, t0).ok, true);
  const blocked = rateLimit("k", 5, 1000, t0);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfterSec > 0);
  assert.equal(rateLimit("k", 5, 1000, t0 + 1001).ok, true);
});
