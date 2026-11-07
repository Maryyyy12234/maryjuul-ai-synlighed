import { cookies } from "next/headers";
import { json } from "@/lib/api.ts";
import { SESSION_COOKIE } from "@/lib/session.ts";

export async function POST() {
  (await cookies()).delete(SESSION_COOKIE);
  return json({ ok: true });
}
