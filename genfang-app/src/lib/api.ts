import "server-only";
import { NextResponse } from "next/server";
import type { ApiError } from "./types.ts";
import { getSession } from "./auth.ts";
import type { SessionPayload } from "./session.ts";
import type { Fail } from "./store.ts";

const NO_STORE = { "Cache-Control": "no-store, private", Vary: "Cookie, Authorization" };

export function json<T>(data: T, status = 200, extra: Record<string, string> = {}) {
  return NextResponse.json(data, { status, headers: { ...NO_STORE, ...extra } });
}

export function fail(code: ApiError["error"]["code"], message: string, status: number, extra: Record<string, string> = {}) {
  return json<ApiError>({ error: { code, message } }, status, extra);
}

/**
 * Kræver gyldig session. For cookie-baserede POST-kald kontrolleres desuden Origin,
 * så en fremmed hjemmeside ikke kan udløse en godkendelse (CSRF).
 * Bearer-kald (native apps) sender ikke cookies automatisk og er derfor ikke CSRF-udsatte.
 */
export async function authed(req: Request): Promise<{ session: SessionPayload } | { response: NextResponse }> {
  const session = await getSession();
  if (!session) return { response: fail("unauthorized", "Log ind igen.", 401) };

  if (req.method !== "GET" && req.method !== "HEAD" && !/^\s*Bearer\s+[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\s*$/i.test(req.headers.get("authorization") ?? "")) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    let sameOrigin = false;
    try {
      sameOrigin = !!origin && !!host && new URL(origin).host === host;
    } catch {
      sameOrigin = false;
    }
    if (!sameOrigin) return { response: fail("forbidden", "Ugyldig oprindelse.", 403) };
  }
  return { session };
}

export async function readJson(req: Request, maxBytes = 16_384): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new Error("too_large");
  return text ? JSON.parse(text) : {};
}

const FAIL_STATUS: Record<Fail["code"], number> = { not_found: 404, conflict: 409, invalid: 400, forbidden: 403, blocked: 422, stopped: 423 };

/** Oversætter et domæneresultat til HTTP – samme kontrakt for alle klienter. */
export function respond<T extends { ok: true }>(r: T | Fail, pick: (ok: T) => unknown) {
  if (r.ok) return json(pick(r as T));
  const f = r as Fail;
  return json({ error: { code: f.code, message: f.message }, current: f.current ?? null, guard: f.guard ?? null }, FAIL_STATUS[f.code]);
}

export function requireSuper(session: SessionPayload) {
  return session.role === "superadmin" && session.tid === "__platform__";
}
