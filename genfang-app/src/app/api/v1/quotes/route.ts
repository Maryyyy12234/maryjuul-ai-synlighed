import { authed, json } from "@/lib/api.ts";
import { listQuotes, quoteTotals } from "@/lib/store.ts";

export async function GET(req: Request) {
  const a = await authed(req);
  if ("response" in a) return a.response;
  const quotes = listQuotes(a.session.tid);
  return json({ quotes, totals: quoteTotals(quotes), provenance: "testdata" });
}
