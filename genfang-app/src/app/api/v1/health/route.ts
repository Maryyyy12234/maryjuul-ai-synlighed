import { json } from "@/lib/api.ts";

export function GET() {
  return json({ ok: true, app: "genfang-app", mode: "testversion-syntetiske-data" });
}
