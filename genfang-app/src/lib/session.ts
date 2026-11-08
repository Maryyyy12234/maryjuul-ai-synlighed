// Signerede sessioner (HMAC-SHA256 via Web Crypto – virker i Node, Edge og tests).
//
// Samme token kan bruges på to måder:
//  - Web/PWA: i en httpOnly, Secure, SameSite=Lax cookie (JavaScript kan ikke læse den).
//  - Senere Expo/Tauri: som "Authorization: Bearer <token>" gemt i Keychain/Keystore.
//
// Når den rigtige GENFANG-backend kobles på, kan dette erstattes af Supabase Auth-JWT'er
// uden at ændre siderne – de kalder kun getSession()/requireSession().

import type { Role, TenantId, UserId } from "./types.ts";

export const SESSION_COOKIE = "gf_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 timer

export interface SessionPayload {
  uid: UserId;
  tid: TenantId;
  role: Role;
  iat: number;
  exp: number;
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const DEV_FALLBACK = "dev-only-insecure-secret-change-me-0000000000";

export function sessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET mangler eller er kortere end 32 tegn.");
  }
  return DEV_FALLBACK;
}

async function key(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signSession(
  p: Omit<SessionPayload, "iat" | "exp">,
  opts: { secret?: string; now?: number; ttl?: number } = {},
): Promise<string> {
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  const payload: SessionPayload = { ...p, iat: now, exp: now + (opts.ttl ?? SESSION_TTL_SECONDS) };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await key(opts.secret ?? sessionSecret()), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export async function verifySession(
  token: string | undefined | null,
  opts: { secret?: string; now?: number } = {},
): Promise<SessionPayload | null> {
  if (!token || token.length > 2048) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      await key(opts.secret ?? sessionSecret()),
      fromB64url(sig) as BufferSource,
      enc.encode(body),
    );
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(fromB64url(body))) as SessionPayload;
    const now = Math.floor((opts.now ?? Date.now()) / 1000);
    if (typeof p.exp !== "number" || p.exp <= now) return null;
    if (typeof p.uid !== "string" || typeof p.tid !== "string") return null;
    return p;
  } catch {
    return null;
  }
}

/** Konstant-tid sammenligning af to strenge via SHA-256 (samme længde efter hash). */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/** Kortlivet billet mellem adgangskode og MFA-kode. Signeret med en ANDEN nøgle end sessioner,
 *  så en billet aldrig kan bruges som login. */
export const MFA_TICKET_TTL = 300;
export const mfaTicketSecret = () => `${sessionSecret()}::mfa-ticket`;
