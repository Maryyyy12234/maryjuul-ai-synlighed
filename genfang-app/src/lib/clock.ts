// Ét sted at hente "nu". Gør det muligt at teste præcise tidspunkter (fx 16.42)
// uden at ændre maskinens ur. Testuret virker KUN når GENFANG_ENV=test er sat,
// og aldrig når appen kører på Vercel (VERCEL=1).
export function nowMs(): number {
  const fixed = process.env.GENFANG_TEST_NOW;
  if (fixed && process.env.GENFANG_ENV === "test" && !process.env.VERCEL) {
    const t = Date.parse(fixed);
    if (!Number.isNaN(t)) return t;
  }
  return Date.now();
}
export const now = () => new Date(nowMs());
