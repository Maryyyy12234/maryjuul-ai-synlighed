// Kører én gang ved serverstart, før der tages imod forespørgsler.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.DATABASE_URL) return;
  const { Pool } = await import("pg");
  const { StateStore } = await import("./lib/persist");
  const { setStateStore } = await import("./lib/persistence-runtime");
  const { hydrate, db } = await import("./lib/store");

  const url = process.env.DATABASE_URL;
  const internal = /\.internal|localhost|127\.0\.0\.1|^postgres(ql)?:\/\/[^@]+@dpg-[^.]+\//.test(url);
  const pool = new Pool({ connectionString: url, max: 3, ssl: internal ? false : { rejectUnauthorized: false } });
  const store = new StateStore((sql, params) => pool.query(sql, params as unknown[]));
  await store.init();
  const saved = await store.load();
  if (saved) {
    hydrate(saved);
    console.log("[genfang] tilstand indlæst fra Postgres");
  } else {
    await store.save(db()); // første start: gem syntetiske testdata
    console.log("[genfang] ny database – testdata gemt");
  }
  setStateStore(store);
}
