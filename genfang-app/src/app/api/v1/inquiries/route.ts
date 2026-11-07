import { authed, json } from "@/lib/api.ts";
import { listInquiries } from "@/lib/store.ts";

export async function GET(req: Request) {
  const a = await authed(req);
  if ("response" in a) return a.response;
  const filter = new URL(req.url).searchParams.get("filter") === "aabne" ? "aabne" : "alle";
  return json({ inquiries: listInquiries(a.session.tid, filter) });
}
