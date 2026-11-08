'use strict';
// Afstemning af kassesalg (POS) mod betalingsudbyderens transaktioner. Ren funktion:
// samme input giver altid samme resultat. Gemmer intet og flytter aldrig penge.
//
// Rækkefølge:
// 1) Brugerens bekræftede par.
// 2) Sikker reference (samme betalingsreference i kassen og hos udbyderen) -> Matchet.
// 3) Forslag ud fra beløb + tidspunkt + salgssted -> ALTID "Kræver gennemgang".
// 4) Resten: Afventer betaling / Ukendt / Kræver gennemgang.
// Salg tælles aldrig dobbelt: afstemning kobler kun posterne. Summer kommer altid
// fra én kilde (kassesalg fra kassen, kortbetalinger fra udbyderen).

const STATUS = {
  matched: 'Matchet', awaiting_payment: 'Afventer betaling', awaiting_settlement: 'Afventer afregning',
  deviation: 'Afvigelse', unknown: 'Ukendt', needs_review: 'Kræver gennemgang',
};
const MIN = 60000;

function reconcile({ posPayments, transactions, terminalLocation = new Map(), decisions = new Map(), resolutions = new Map(), coverage = new Map(),
  now, windowMinutes = 10, awaitHours = 48, duplicateSeconds = 60, fmt = (o) => String(o) }) {
  const items = [];
  const usedPos = new Set(), usedTx = new Set();
  const txByKey = new Map(transactions.map((t) => [t.key, t]));
  const posByKey = new Map(posPayments.map((p) => [p.key, p]));
  const settle = (tx) => (tx.type === 'payment' && !tx.payout_id ? 'awaiting_settlement' : 'matched');
  const locOf = (tx) => terminalLocation.get(tx.terminal_key) || null;

  function pair(p, t, method, extra = {}) {
    usedPos.add(p.key); usedTx.add(t.key);
    const reasons = [];
    let status = settle(t);
    if (p.amount_ore !== t.amount_ore || p.currency !== t.currency) {
      status = 'deviation';
      reasons.push(`Beløbet afviger: kassen ${fmt(p.amount_ore, p.currency)}, udbyderen ${fmt(t.amount_ore, t.currency)}.`);
    }
    if (t.status === 'failed' || t.status === 'cancelled') { status = 'deviation'; reasons.push(`Udbyderen har status "${t.status}", men kassen har registreret betalingen.`); }
    if (status === 'awaiting_settlement') reasons.push('Betalingen er gennemført, men endnu ikke registreret i en udbetaling.');
    items.push({ key: `pair:${p.key}::${t.key}`, status, kind: p.kind, method, pos: p, tx: t, amount_ore: t.amount_ore, currency: t.currency, at: p.at, reasons, ...extra });
  }

  // 1) Brugerens bekræftelser
  for (const [k, d] of decisions) {
    if (d.decision !== 'confirmed') continue;
    const p = posByKey.get(d.pos), t = txByKey.get(d.tx);
    if (p && t && !usedPos.has(p.key) && !usedTx.has(t.key)) pair(p, t, 'confirmed', { decided_by: d.by, decided_at: d.at });
  }
  // 2) Sikre referencer
  const txByRef = new Map();
  for (const t of transactions) for (const r of [t.external_ref, t.provider_id].filter(Boolean)) txByRef.set(`${t.type}|${r}`, t);
  for (const p of posPayments) {
    if (usedPos.has(p.key) || !p.reference) continue;
    const t = txByRef.get(`${p.kind}|${p.reference}`);
    if (t && !usedTx.has(t.key)) pair(p, t, 'reference');
  }
  // 3) Forslag: samme type, valuta og beløb, tæt på i tid og samme salgssted
  const rejected = new Set([...decisions.values()].filter((d) => d.decision === 'rejected').map((d) => `${d.pos}::${d.tx}`));
  const candidates = (p) => transactions.filter((t) => !usedTx.has(t.key) && t.type === p.kind && t.currency === p.currency && t.amount_ore === p.amount_ore
    && !rejected.has(`${p.key}::${t.key}`) && ['successful', 'refunded', 'pending'].includes(t.status)
    && (t.time_known ? Math.abs(Date.parse(t.occurred_at) - Date.parse(p.at)) <= windowMinutes * MIN : t.local_date === p.local_date)
    && (!locOf(t) || !p.location || locOf(t) === p.location));
  const remainingPos = posPayments.filter((p) => !usedPos.has(p.key)).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const candByPos = new Map(remainingPos.map((p) => [p.key, candidates(p)]));
  const posPerTx = new Map();
  for (const [pk, cs] of candByPos) for (const t of cs) posPerTx.set(t.key, [...(posPerTx.get(t.key) || []), pk]);
  for (const p of remainingPos) {
    const cs = candByPos.get(p.key).filter((t) => !usedTx.has(t.key));
    if (!cs.length) continue;
    if (cs.length === 1 && (posPerTx.get(cs[0].key) || []).length === 1) {
      const t = cs[0];
      const dt = t.time_known ? Math.round(Math.abs(Date.parse(t.occurred_at) - Date.parse(p.at)) / 1000) : null;
      const sameLoc = locOf(t) && p.location && locOf(t) === p.location;
      usedPos.add(p.key); usedTx.add(t.key);
      items.push({ key: `pair:${p.key}::${t.key}`, status: 'needs_review', kind: p.kind, method: 'suggested', suggestion: true,
        confidence: sameLoc && dt != null && dt <= 120 ? 'høj' : 'middel', pos: p, tx: t, amount_ore: t.amount_ore, currency: t.currency, at: p.at,
        reasons: [`Forslag: samme beløb (${fmt(t.amount_ore, t.currency)})${dt != null ? `, ${dt < 60 ? `${dt} sek.` : `${Math.round(dt / 60)} min.`} fra hinanden` : ', samme dato (udbyderens fil har intet klokkeslæt)'}${sameLoc ? ' og samme butik' : locOf(t) ? '' : '. Terminalen er ikke koblet til en butik'}.`, 'Ingen fælles reference. Bekræft eller afvis.'] });
    } else {
      usedPos.add(p.key);
      items.push({ key: `pos:${p.key}`, status: 'needs_review', kind: p.kind, method: 'ambiguous', pos: p, candidates: cs.map((t) => t.key), amount_ore: p.amount_ore, currency: p.currency, at: p.at,
        reasons: [`${cs.length} mulige betalinger hos udbyderen med samme beløb og tidspunkt. Vælg den rigtige.`] });
    }
  }
  // 4a) Kassebetalinger uden modpart
  for (const p of posPayments) {
    if (usedPos.has(p.key)) continue;
    const age = now.getTime() - Date.parse(p.at);
    const covered = [...coverage.values()].some((until) => until && Date.parse(until) > Date.parse(p.at) + 60 * MIN);
    const waiting = age < awaitHours * 3600000 || !covered;
    items.push({ key: `pos:${p.key}`, status: waiting ? 'awaiting_payment' : 'needs_review', kind: p.kind, method: 'none', pos: p, amount_ore: p.amount_ore, currency: p.currency, at: p.at,
      reasons: [waiting ? 'Kortbetalingen er endnu ikke kommet med i udbyderens data.' : `Kassen har registreret en kortbetaling, som ikke findes hos betalingsudbyderen efter ${awaitHours} timer.`] });
  }
  // 4b) Udbyderposter uden kassesalg + chargebacks + mulige dubletter
  const leftovers = transactions.filter((t) => !usedTx.has(t.key));
  const dup = new Set();
  const pays = leftovers.filter((t) => t.type === 'payment' && t.status === 'successful').sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
  for (let i = 0; i < pays.length; i++) for (let j = i + 1; j < pays.length; j++) {
    const a = pays[i], b = pays[j];
    if (!a.time_known || !b.time_known) continue;
    if (Date.parse(b.occurred_at) - Date.parse(a.occurred_at) > duplicateSeconds * 1000) break;
    if (a.amount_ore === b.amount_ore && a.currency === b.currency && (a.terminal_key || null) === (b.terminal_key || null)) { dup.add(a.key); dup.add(b.key); }
  }
  for (const t of leftovers) {
    if (t.type === 'chargeback') {
      items.push({ key: `tx:${t.key}`, status: 'needs_review', kind: 'chargeback', method: 'none', tx: t, amount_ore: t.amount_ore, currency: t.currency, at: t.occurred_at,
        reasons: ['Kunden har fået pengene tilbageført via sin bank (chargeback). Tjek sagen hos betalingsudbyderen.'] });
      continue;
    }
    if (t.status === 'failed' || t.status === 'cancelled') continue; // gennemførte aldrig – ikke en afstemningssag
    const isDup = dup.has(t.key);
    items.push({ key: `tx:${t.key}`, status: isDup ? 'needs_review' : 'unknown', kind: t.type, method: 'none', tx: t, amount_ore: t.amount_ore, currency: t.currency, at: t.occurred_at,
      reasons: [isDup ? 'Mulig dublet: to betalinger med samme beløb på samme terminal inden for et minut.' : t.type === 'refund' ? 'Refundering hos udbyderen uden tilsvarende retur i kassen.' : 'Betaling hos udbyderen uden tilsvarende kassesalg.'] });
  }
  for (const it of items) {
    const r = resolutions.get(it.key);
    it.status_label = STATUS[it.status];
    if (r) Object.assign(it, { resolved: true, resolution: r });
  }
  return items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

module.exports = { reconcile, STATUS };
