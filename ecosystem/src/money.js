'use strict';
// Penge håndteres som heltal i øre. Aldrig floating point.

class MoneyError extends Error {}

function assertOre(v, name = 'beløb') {
  if (!Number.isSafeInteger(v)) throw new MoneyError(`${name} skal være et helt antal øre`);
  return v;
}

// "1.234,56" | "1234.56" | "1234" -> øre. Parser tekst for at undgå float.
function parseDKK(input) {
  let s = String(input).trim().replace(/\s|kr\.?/gi, '');
  if (s.includes(',')) {
    // Dansk: punktum = tusindtal, komma = decimal
    if (!/^-?\d{1,3}(\.\d{3})*,\d{1,2}$|^-?\d+,\d{1,2}$/.test(s)) throw new MoneyError(`Ugyldigt beløb: ${input}`);
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, ''); // "84.500" = 84.500 kr.
  }
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) throw new MoneyError(`Ugyldigt beløb: ${input}`);
  const ore = Number(m[2]) * 100 + Number((m[3] || '0').padEnd(2, '0'));
  return assertOre(m[1] ? -ore : ore);
}

function formatDKK(ore) {
  assertOre(ore);
  const neg = ore < 0; const abs = Math.abs(ore);
  const kr = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const oere = String(abs % 100).padStart(2, '0');
  return `${neg ? '-' : ''}${kr},${oere} kr.`;
}

function sum(values) {
  return values.reduce((a, v) => assertOre(a + assertOre(v)), 0);
}

// Afrunding halvt-væk-fra-nul med BigInt.
function divRound(n, d) {
  const N = BigInt(n), D = BigInt(d);
  const q = N / D, r = N % D;
  const twice = (r < 0n ? -r : r) * 2n;
  const adj = twice >= (D < 0n ? -D : D) ? ((N < 0n) !== (D < 0n) ? -1n : 1n) : 0n;
  return q + adj;
}

// Procentvis ændring med én decimal. Returnerer aldrig en misvisende procent.
function percentChange(current, previous) {
  assertOre(current, 'nuværende'); assertOre(previous, 'tidligere');
  const diff = current - previous;
  if (previous === 0) {
    return { comparable: false, diff, reason: 'Procentvis sammenligning kan ikke beregnes, fordi den tidligere periode var 0.' };
  }
  if (previous < 0) {
    return { comparable: false, diff, reason: 'Procentvis sammenligning er misvisende, når den tidligere værdi er negativ.' };
  }
  const tenths = Number(divRound(BigInt(diff) * 1000n, previous)); // promille -> 0,1 %
  const sign = tenths > 0 ? '+' : tenths < 0 ? '-' : '';
  const a = Math.abs(tenths);
  return { comparable: true, diff, tenthsOfPercent: tenths, label: `${sign}${Math.floor(a / 10)},${a % 10} %` };
}

// Moms (25 % som standard). Beregner netto/moms ud fra brutto uden float.
function splitVat(grossOre, ratePct = 25) {
  assertOre(grossOre);
  const net = Number(divRound(BigInt(grossOre) * 100n, 100 + ratePct));
  return { gross: grossOre, net, vat: grossOre - net };
}

// Beløb fra API'er ("499.00", "12.345"): punktum er altid decimaltegn.
// Rundes til hele øre (halvt væk fra nul).
function parseApiAmount(input) {
  const s = String(input ?? '').trim();
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new MoneyError(`Ugyldigt API-beløb: ${input}`);
  const frac = (m[3] || '').padEnd(3, '0');
  let ore = BigInt(m[2]) * 100n + BigInt(frac.slice(0, 2));
  if (Number(frac[2]) >= 5) ore += 1n;
  const n = Number(m[1] ? -ore : ore);
  return assertOre(n);
}

module.exports = { MoneyError, parseDKK, parseApiAmount, formatDKK, sum, percentChange, splitVat, assertOre };
