import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession, type SessionPayload } from "./session.ts";
import { getUser } from "./store.ts";

/** Læser session fra cookie (web) eller Bearer-token (fremtidige native apps). */
export async function getSession(): Promise<SessionPayload | null> {
  const h = await headers();
  const auth = h.get("authorization");
  const bearer = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
  const token = bearer ?? (await cookies()).get(SESSION_COOKIE)?.value;
  const s = await verifySession(token);
  // Sessionen gælder kun, hvis brugeren stadig findes i den samme virksomhed.
  if (!s || !getUser(s.tid, s.uid)) return null;
  return s;
}

/** Til server-sider: send til login, hvis der ikke er en gyldig session. */
export async function requireSession(): Promise<SessionPayload> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}
