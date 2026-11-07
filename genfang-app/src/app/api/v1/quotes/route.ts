import { authed, json } from "@/lib/api.ts";
import { listQuotes } from "@/lib/store.ts";

export async function GET(req: Request) {
  const a = await authed(req);
  if ("response" in a) return a.response;
  return json({ quotes: listQuotes(a.session.tid) });
}
