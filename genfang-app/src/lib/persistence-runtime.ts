import "server-only";
import { StateStore } from "./persist.ts";
import { db } from "./store.ts";

// Holder forbindelsen til Postgres for hele serverprocessen.
const g = globalThis as unknown as { __gfState?: StateStore | null };

export function stateStore(): StateStore | null {
  return g.__gfState ?? null;
}
export function setStateStore(s: StateStore | null) {
  g.__gfState = s;
}

/** Gem den aktuelle tilstand. No-op uden DATABASE_URL (lokal udvikling og tests). */
export async function commit() {
  const s = stateStore();
  if (!s) return;
  try {
    await s.save(db());
  } catch (e) {
    console.error("[genfang] kunne ikke gemme tilstand:", (e as Error).message);
    throw e;
  }
}
