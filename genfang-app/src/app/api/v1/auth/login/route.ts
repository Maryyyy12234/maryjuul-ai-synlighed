import { fail, json, readJson } from "@/lib/api.ts";
import { clearKey, rateLimit } from "@/lib/rate-limit.ts";
import { MFA_TICKET_TTL, mfaTicketSecret, safeEqual, signSession } from "@/lib/session.ts";
import { issueSession } from "@/lib/issue-session.ts";
import { findUserByEmail, mfaEnabled } from "@/lib/store.ts";

export const runtime = "nodejs";

function ownerPassword(): string | null {
  const p = process.env.OWNER_PASSWORD;
  if (p && p.length >= 12) return p;
  return process.env.NODE_ENV === "production" ? null : "genfang-ejer-demo";
}

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
  const byIp = rateLimit(`login-ip:${ip}`, 30, 15 * 60_000);
  const byEmail = rateLimit(`login-email:${email}`, 5, 15 * 60_000);
  if (!byIp.ok || !byEmail.ok) {
    const retry = String(Math.max(byIp.retryAfterSec, byEmail.retryAfterSec));
    return fail("rate_limited", "For mange forsøg. Prøv igen om lidt.", 429, { "Retry-After": retry });
  }

  const user = email ? findUserByEmail(email) : undefined;
  // Platformens ejer har en separat, længere adgangskode.
  const expected = user?.role === "superadmin" ? ownerPassword() : demoPassword();
  if (!expected) return fail("forbidden", "Login er ikke konfigureret på denne server.", 503);

  // Sammenlign altid, så svartiden ikke afslører om e-mailen findes.
  const pwOk = await safeEqual(password, expected);
  if (!user || !pwOk) return fail("unauthorized", "Forkert e-mail eller adgangskode.", 401);

  clearKey(`login-email:${email}`); // kun fejlede forsøg tæller mod e-mail-grænsen
  if (mfaEnabled(user.tenantId, user.id)) {
    const ticket = await signSession({ uid: user.id, tid: user.tenantId, role: user.role }, { secret: mfaTicketSecret(), ttl: MFA_TICKET_TTL });
    return json({ ok: true, mfaRequired: true, ticket });
  }
  return issueSession(req, user);
}
