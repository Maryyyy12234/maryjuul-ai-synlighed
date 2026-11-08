// TOTP (RFC 6238) til MFA – virker med Google Authenticator, Microsoft Authenticator, 1Password m.fl.
// Den hemmelige nøgle gemmes krypteret (AES-256-GCM) med en nøgle afledt af SESSION_SECRET.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export function hotp(secret: Buffer, counter: number, digits = 6): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", secret).update(msg).digest();
  const o = h[h.length - 1] & 0xf;
  const code = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(code % 10 ** digits).padStart(digits, "0");
}

export const STEP = 30;
export const stepAt = (ms: number) => Math.floor(ms / 1000 / STEP);

/** Returnerer det tidstrin koden matcher (±1 trin for ur-forskel), ellers null. */
export function verifyTotp(secretB32: string, code: string, nowMs: number, lastUsedStep?: number): number | null {
  const c = String(code ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const key = base32Decode(secretB32);
  const now = stepAt(nowMs);
  for (const step of [now, now - 1, now + 1]) {
    if (lastUsedStep !== undefined && step <= lastUsedStep) continue; // samme kode kan ikke genbruges
    if (hotp(key, step) === c) return step;
  }
  return null;
}

export const newSecret = () => base32Encode(randomBytes(20));

export function otpauthUri(secretB32: string, account: string, issuer = "GENFANG") {
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP}`;
}

function key(material: string) {
  return createHash("sha256").update(`genfang-mfa:${material}`).digest();
}
export function encryptSecret(secretB32: string, material: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(material), iv);
  const enc = Buffer.concat([c.update(secretB32, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}
export function decryptSecret(blob: string, material: string): string {
  const [iv, tag, enc] = blob.split(".").map((p) => Buffer.from(p, "base64url"));
  const d = createDecipheriv("aes-256-gcm", key(material), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}
