import { cookies } from "next/headers";
import { fail, json, readJson } from "@/lib/api.ts";
import { rateLimit } from "@/lib/rate-limit.ts";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, safeEqual, signSession } from "@/lib/session.ts";
import { audit, findUserByEmail } from "@/lib/store.ts";

export const runtime = "nodejs";

function demoPassword(): string | null {
  const p = process.env.DEMO_PASSWORD;
  if (p && p.length >= 8) return p;
  return process.env.NODE_ENV === "production" ? null : "genfang-demo";
}

export async function POST(req: Request) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = (await readJson(req, 2048)) as typeof body;
  } catch {
    return fail("invalid", "Ugyldig forespørgsel.", 400);
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 200) : "";
  const password = typeof body.password === "string" ? body.password.slice(0, 200) : "";

  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const byIp = rateLimit(`login-ip:${ip}`, 20, 15 * 60_000);
  const byEmail = rateLimit(`login-email:${email}`, 5, 15 * 60_000);
  if (!byIp.ok || !byEmail.ok) {
    const retry = String(Math.max(byIp.retryAfterSec, byEmail.retryAfterSec));
    return fail("rate_limited", "For mange forsøg. Prøv igen om lidt.", 429, { "Retry-After": retry });
  }

  const expected = demoPassword();
  if (!expected) return fail("forbidden", "Login er ikke konfigureret på denne server.", 503);

  const user = email ? findUserByEmail(email) : undefined;
  // Sammenlign altid, så svartiden ikke afslører om e-mailen findes.
  const pwOk = await safeEqual(password, expected);
  if (!user || !pwOk) return fail("unauthorized", "Forkert e-mail eller adgangskode.", 401);

  const token = await signSession({ uid: user.id, tid: user.tenantId, role: user.role });
  audit({ at: new Date().toISOString(), tenantId: user.tenantId, userId: user.id, action: "login" });

  // Native apps (Expo/Tauri) får tokenet i svaret og gemmer det i Keychain/Keystore.
  // Web får det KUN som httpOnly-cookie.
  const native = req.headers.get("x-genfang-client") === "native";
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return json(native ? { ok: true, token, expiresIn: SESSION_TTL_SECONDS } : { ok: true });
}
