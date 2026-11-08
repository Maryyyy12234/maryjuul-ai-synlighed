// Verificering af signerede webhooks fra Resend (Svix-format).
// Signatur: base64(HMAC-SHA256(secret, `${id}.${timestamp}.${body}`)), secret = base64 efter "whsec_".
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifySvix(body: string, headers: { id: string | null; timestamp: string | null; signature: string | null }, secret: string, nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !secret) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > toleranceSec) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  for (const part of signature.split(" ")) {
    const [ver, sig] = part.split(",");
    if (ver !== "v1" || !sig) continue;
    const got = Buffer.from(sig, "base64");
    if (got.length === expected.length && timingSafeEqual(got, expected)) return true;
  }
  return false;
}

export function parseAddress(from: string): { name: string; email?: string } {
  const m = from.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || m[2].split("@")[0], email: m[2].trim().toLowerCase() };
  const e = from.trim().toLowerCase();
  return { name: e.split("@")[0], email: e.includes("@") ? e : undefined };
}
