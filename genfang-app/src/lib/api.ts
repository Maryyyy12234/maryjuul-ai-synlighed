import "server-only";
import { NextResponse } from "next/server";
import type { ApiError } from "./types.ts";
import { getSession } from "./auth.ts";
import type { SessionPayload } from "./session.ts";

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

  if (req.method !== "GET" && req.method !== "HEAD" && !req.headers.get("authorization")) {
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
