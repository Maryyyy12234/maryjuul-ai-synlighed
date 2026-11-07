import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { StateStore, type Query } from "../../src/lib/persist.ts";
import { seed } from "../../src/lib/seed.ts";

const mk = (pg: PGlite): Query => (sql, params) => pg.query(sql, params as unknown[]) as never;

test("tilstand gemmes og indlæses uændret (ægte Postgres)", async () => {
  const pg = new PGlite();
  const a = new StateStore(mk(pg));
  await a.init();
  assert.equal(await a.load(), null);
  const d = seed(Date.UTC(2026, 10, 5, 15, 54));
  d.inquiries[0].status = "godkendt";
  await a.save(d);
  const b = new StateStore(mk(pg));
  const loaded = await b.load();
  assert.deepEqual(loaded, JSON.parse(JSON.stringify(d)));
  await pg.close();
});

test("efterfølgende gemninger tæller versionen op og bevarer ændringer", async () => {
  const pg = new PGlite();
  const s = new StateStore(mk(pg));
  await s.init();
  const d = seed();
  await s.save(d);
  d.audit.push({ at: "x", tenantId: "t_hansen", userId: "u_lars", action: "approve" });
  await Promise.all([s.save(d), s.save(d), s.save(d)]); // samtidige kald køres i rækkefølge
  const r = await pg.query<{ version: number }>("select version from genfang_state");
  assert.equal(Number(r.rows[0].version), 4);
  const again = await new StateStore(mk(pg)).load();
  assert.equal(again!.audit.length, 1);
  await pg.close();
});

test("en forældet instans kan ikke overskrive nyere data", async () => {
  const pg = new PGlite();
  const first = new StateStore(mk(pg));
  await first.init();
  await first.save(seed());
  const stale = new StateStore(mk(pg));
  await stale.load();
  const fresh = new StateStore(mk(pg));
  await fresh.load();
  await fresh.save(seed());
  await assert.rejects(stale.save(seed()), /Versionskonflikt/);
  await pg.close();
});

test("ny instans uden load kan ikke overskrive eksisterende data", async () => {
  const pg = new PGlite();
  const a = new StateStore(mk(pg));
  await a.init();
  await a.save(seed());
  await assert.rejects(new StateStore(mk(pg)).save(seed()), /indlæs før/);
  await pg.close();
});
