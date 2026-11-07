import { authed, json } from "@/lib/api.ts";
import { listWorkerRuns, workerStatuses } from "@/lib/store.ts";

export async function GET(req: Request) {
  const a = await authed(req);
  if ("response" in a) return a.response;
  return json({ workers: workerStatuses(a.session.tid), runs: listWorkerRuns(a.session.tid) });
}
