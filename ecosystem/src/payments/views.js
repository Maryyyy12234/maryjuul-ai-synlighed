'use strict';
// PULS -> Betalinger og INDSIGT-analyse af betalinger. Kortbetalinger kommer KUN fra
// betalingsudbyderen. Kassesalg kommer KUN fra kassen. De lægges aldrig sammen.

const { percentChange, formatDKK } = require('../money');
const { localDate } = require('./engine');

const fmt = (o, cur) => (cur === 'DKK' ? formatDKK(o) : `${(o / 100).toFixed(2).replace('.', ',')} ${cur}`);
const inRange = (d, p) => d >= p.from && d <= p.to;

function createPaymentViews(platform, engine) {
  function scoped(actor, app) { platform.require(actor, app, 'read'); return engine.dataFor(actor.organization_id, app); }

  function dashboard(actor, { today, period }) {
    const d = scoped(actor, 'puls');
    if (!d.connections.length) return { available: false, message: 'Ingen betalingsudbyder er forbundet, eller PULS har ikke adgang til betalingsdata.' };
    const cur = new Map();
    const g = (c) => { if (!cur.has(c)) cur.set(c, { currency: c, todayOre: 0, todayCount: 0, awaitingOre: 0, awaitingCount: 0, oldestAwaiting: null, payouts: [], payoutsOre: 0, feesOre: 0, refundsOre: 0, refundsCount: 0, chargebacksOre: 0, txWithFee: 0, txInPeriod: 0 }); return cur.get(c); };
    for (const t of d.transactions) {
      if (t.status !== 'successful' && t.status !== 'refunded') continue;
      const day = localDate(t.occurred_at, t.timezone);
      const x = g(t.currency);
      if (day === today) { x.todayOre += t.amount_ore; x.todayCount++; }
      if (!t.payout_id) { x.awaitingOre += t.amount_ore; x.awaitingCount++; if (!x.oldestAwaiting || t.occurred_at < x.oldestAwaiting) x.oldestAwaiting = t.occurred_at; }
      if (inRange(day, period)) x.txInPeriod++;
    }
    for (const r of d.refunds) if (r.status !== 'failed' && inRange(localDate(r.occurred_at, r.timezone), period)) { const x = g(r.currency); x.refundsOre += r.amount_ore; x.refundsCount++; }
    for (const r of d.disputes) if (inRange(localDate(r.occurred_at, r.timezone), period)) g(r.currency).chargebacksOre += r.amount_ore;
    for (const f of d.fees) if (inRange(f.date, period)) { const x = g(f.currency); x.feesOre += f.amount_ore; }
    const feeRefs = new Set(d.fees.map((f) => f.transaction_ref));
    for (const t of d.transactions) if (feeRefs.has(t.external_ref) && inRange(localDate(t.occurred_at, t.timezone), period)) g(t.currency).txWithFee++;
    for (const p of d.payouts) if (inRange(p.date, period)) { const x = g(p.currency); x.payouts.push({ id: p.id, date: p.date, reference: p.reference, provider: p.provider, gross: fmt(p.gross_ore, p.currency), fees: fmt(p.fees_ore, p.currency), deductions: fmt(p.deductions_ore, p.currency), net: fmt(p.net_ore, p.currency), net_ore: p.net_ore, lines: p.lines.length }); x.payoutsOre += p.net_ore; }
    const rec = engine.reconcileFor(actor.organization_id);
    const open = rec.available ? rec.items.filter((i) => !i.resolved && !['matched', 'awaiting_settlement'].includes(i.status)) : [];
    return {
      available: true, today, period,
      definitions: {
        card: 'Gennemførte kortbetalinger registreret hos betalingsudbyderen. Ikke kassesalg og ikke bogført omsætning.',
        awaiting: 'Behandlet hos udbyderen, men endnu ikke registreret i en udbetaling. Det er IKKE penge på kontoen.',
        payouts: 'Udbetalinger som udbyderen har registreret. Bankens bogføring kan ligge en dag eller to senere.',
        fees: 'Kun gebyrer, der fremgår af udbyderens data. Mangler de, er tallet ikke 0 – det er ukendt.',
      },
      sources: d.connections.map((c) => ({ provider: c.provider_name, label: c.label, status: c.status_label, last_sync_at: c.last_sync_at, coverage_until: c.coverage_until, demo: c.demo, historical: c.status === 'disconnected' })),
      byCurrency: [...cur.values()].map((x) => ({
        ...x, labels: { today: fmt(x.todayOre, x.currency), awaiting: fmt(x.awaitingOre, x.currency), payouts: fmt(x.payoutsOre, x.currency), fees: fmt(x.feesOre, x.currency), refunds: fmt(x.refundsOre, x.currency), chargebacks: fmt(x.chargebacksOre, x.currency) },
        feeCoverage: x.txInPeriod === 0 ? 'ingen' : x.txWithFee === 0 ? 'mangler' : x.txWithFee < x.txInPeriod ? 'delvis' : 'fuld',
      })),
      reconciliation: rec.available ? {
        available: true,
        counts: Object.fromEntries(['matched', 'awaiting_payment', 'awaiting_settlement', 'deviation', 'unknown', 'needs_review'].map((s) => [s, rec.items.filter((i) => i.status === s && !i.resolved).length])),
        open: open.length,
      } : { available: false, reason: rec.reason },
    };
  }

  function worklist(actor) {
    platform.require(actor, 'puls', 'read');
    const rec = engine.reconcileFor(actor.organization_id);
    if (!rec.available) return rec;
    const order = { needs_review: 0, deviation: 1, unknown: 2, awaiting_payment: 3, awaiting_settlement: 4, matched: 5 };
    return { available: true, items: rec.items.map((i) => ({
      key: i.key, status: i.status, status_label: i.status_label, kind: i.kind, method: i.method, confidence: i.confidence || null, resolved: !!i.resolved, resolution: i.resolution || null,
      amount: fmt(i.amount_ore, i.currency), amount_ore: i.amount_ore, currency: i.currency, at: i.at, reasons: i.reasons, suggestion: !!i.suggestion,
      pos: i.pos ? { order: i.pos.order_name, gateway: i.pos.gateway, at: i.pos.at, amount: fmt(i.pos.amount_ore, i.pos.currency), split: i.pos.split, cancelled: i.pos.order_cancelled } : null,
      tx: i.tx ? { ref: i.tx.external_ref, provider: i.tx.provider, at: i.tx.occurred_at, status: i.tx.status, scheme: i.tx.card_scheme, terminal: i.tx.terminal_external_id, payout_date: i.tx.payout_date || null } : null,
      candidates: i.candidates || null,
    })).sort((a, b) => (a.resolved - b.resolved) || (order[a.status] - order[b.status]) || b.at.localeCompare(a.at)) };
  }

  // INDSIGT: betalingsudvikling (kræver datadeling til INDSIGT)
  function insights(actor, current, previous) {
    const d = scoped(actor, 'indsigt');
    if (!d.connections.length) return { available: false, message: 'INDSIGT har ikke adgang til betalingsdata.' };
    const sum = (p) => {
      const by = new Map();
      const g = (c) => { if (!by.has(c)) by.set(c, { currency: c, volumeOre: 0, count: 0, refundsOre: 0, refundsCount: 0, feesOre: 0, feeBaseOre: 0, bySchemeOre: {}, byTerminal: {} }); return by.get(c); };
      const feeByRef = new Map(d.fees.map((f) => [f.transaction_ref, f.amount_ore]));
      for (const t of d.transactions) if (['successful', 'refunded'].includes(t.status) && inRange(localDate(t.occurred_at, t.timezone), p)) {
        const x = g(t.currency); x.volumeOre += t.amount_ore; x.count++;
        const s = t.card_scheme || 'UKENDT'; x.bySchemeOre[s] = (x.bySchemeOre[s] || 0) + t.amount_ore;
        const term = t.terminal_external_id || 'Ukendt'; x.byTerminal[term] = (x.byTerminal[term] || 0) + 1;
        if (feeByRef.has(t.external_ref)) { x.feesOre += feeByRef.get(t.external_ref); x.feeBaseOre += t.amount_ore; }
      }
      for (const r of d.refunds) if (r.status !== 'failed' && inRange(localDate(r.occurred_at, r.timezone), p)) { const x = g(r.currency); x.refundsOre += r.amount_ore; x.refundsCount++; }
      return by;
    };
    const a = sum(current), b = sum(previous);
    const permille = (n, dd) => (dd ? Math.round((n * 1000) / dd) : null);
    return { available: true, current, previous, byCurrency: [...a.values()].map((x) => {
      const p = b.get(x.currency);
      const feeRate = permille(x.feesOre, x.feeBaseOre), prevFeeRate = p ? permille(p.feesOre, p.feeBaseOre) : null;
      const refundRate = permille(x.refundsOre, x.volumeOre), prevRefundRate = p ? permille(p.refundsOre, p.volumeOre) : null;
      return { currency: x.currency, volume: fmt(x.volumeOre, x.currency), volumeOre: x.volumeOre, count: x.count, avgOre: x.count ? Math.round(x.volumeOre / x.count) : null,
        volumeChange: percentChange(x.volumeOre, p?.volumeOre || 0), countChange: percentChange(x.count * 100, (p?.count || 0) * 100),
        refundRatePermille: refundRate, prevRefundRatePermille: prevRefundRate, feeRatePermille: feeRate, prevFeeRatePermille: prevFeeRate,
        feeNote: x.feeBaseOre ? (x.feeBaseOre < x.volumeOre ? 'Gebyrprocent bygger kun på de betalinger, hvor gebyret er kendt.' : null) : 'Ingen gebyrdata i perioden.',
        byScheme: Object.entries(x.bySchemeOre).map(([k, v]) => ({ scheme: k, volumeOre: v, volume: fmt(v, x.currency) })).sort((m, n) => n.volumeOre - m.volumeOre),
        byTerminal: Object.entries(x.byTerminal).map(([k, v]) => ({ terminal: k, count: v })) };
    }) };
  }

  return { dashboard, worklist, insights, fmt };
}

module.exports = { createPaymentViews };
