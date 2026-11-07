import { test } from "node:test";
import assert from "node:assert/strict";
import { checkReply } from "../../src/lib/guard.ts";
import { seed } from "../../src/lib/seed.ts";
import { zonedToUtc } from "../../src/lib/time.ts";
import { writeDraft } from "../../src/lib/workers/responder.ts";
import type { Inquiry } from "../../src/lib/types.ts";

const TZ = "Europe/Copenhagen";

test("Responder skriver ALDRIG et udkast, sikkerhedslaget ville blokere – hver halve time i 14 dage", () => {
  const start = zonedToUtc(2026, 11, 2, 0, 0, TZ);
  let checked = 0;
  for (let t = start; t < start + 14 * 86_400_000; t += 30 * 60_000) {
    const d = seed(t);
    const tenant = d.tenants[0];
    const base: Inquiry = { ...d.inquiries.find((i) => i.id === "inq_1039")!, draft: undefined };
    for (const inq of [base, { ...base, category: "tilbud" as const, subject: "Tilbud på køkkenarmatur", message: "Pris på montering af køkkenarmatur?" }, { ...d.inquiries[0], draft: undefined }]) {
      const draft = writeDraft(inq, tenant, d.slots, t);
      const r = checkReply(draft.text, { nowMs: t, tz: TZ, openingHours: tenant.openingHours, slots: d.slots, priceList: tenant.priceList, emergency: !!inq.emergency });
      assert.equal(r.ok, true, `${new Date(t).toISOString()} ${inq.subject}: ${JSON.stringify(r.issues)}\n${draft.text}`);
      checked++;
    }
  }
  assert.ok(checked > 1500);
});
