import "server-only";
import { cookies } from "next/headers";
import { json } from "./api.ts";
import { commit } from "./persistence-runtime.ts";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from "./session.ts";
import { audit } from "./store.ts";
import type { User } from "./types.ts";

/** Opretter session efter fuldført login (adgangskode og evt. MFA). */
export async function issueSession(req: Request, user: User, viaMfa = false) {
  const token = await signSession({ uid: user.id, tid: user.tenantId, role: user.role });
  audit({ at: new Date().toISOString(), tenantId: user.tenantId, userId: user.id, action: "login", detail: viaMfa ? "med MFA" : undefined });
  await commit();
  // Native apps (Expo/Tauri) får tokenet i svaret og gemmer det i Keychain/Keystore. Web får det KUN som httpOnly-cookie.
  const native = req.headers.get("x-genfang-client") === "native";
  if (!native) (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_TTL_SECONDS,
  });
  return json(native ? { ok: true, token, expiresIn: SESSION_TTL_SECONDS, role: user.role } : { ok: true, role: user.role });
}
