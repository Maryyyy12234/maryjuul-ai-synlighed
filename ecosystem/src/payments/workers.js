'use strict';
// AI-workers for betalinger. Fase 1: deterministiske regler. Ingen sprogmodel.
// Må ALDRIG refundere, hæve penge, ændre aftaler eller bankoplysninger.

const crypto = require('node:crypto');
const { localDate } = require('./engine');

const REGISTRY = [
  { id: 'payment-reconciliation', name: 'Payment Reconciliation', app: 'puls', level: 2, purpose: 'Afstemmer kassesalg mod kortbetalinger og opretter gennemgangsopgaver.',
    data: ['Kassebetalinger', 'Transaktioner fra betalingsudbyder'], actions: ['Opgaveforslag i OVERBLIK', 'Notifikation'] },
  { id: 'settlement-monitor', name: 'Settlement Monitor', app: 'puls', level: 2, purpose: 'Overvåger udbetalinger, forsinkelser og forskellen mellem brutto og netto.',
    data: ['Transaktioner', 'Udbetalinger', 'Gebyrer'], actions: ['Opgaveforslag i OVERBLIK', 'Notifikation'] },
  { id: 'payment-insights', name: 'Payment Insights', app: 'indsigt', level: 1, purpose: 'Analyserer betalingsvolumen, refunderinger og gebyrer over tid.',
    data: ['Transaktioner', 'Refunderinger', 'Gebyrer'], actions: ['Rapportkladde'] },
];

function createPaymentWorkers({ platform, engine, views, overblik }) {
  const runs = [];
  async function run(id, orgId, fn) {
    const meta = REGISTRY.find((w) => w.id === id);
    const r = { id: `run_${crypto.randomUUID().slice(0, 10)}`, worker: id, app: meta.app, organization_id: orgId, started_at: platform.now().toISOString(), status: 'running', model: null, cost_ore: 0 };
    runs.push(r);
    if (!platform.isModuleActive(orgId, meta.app)) { Object.assign(r, { status: 'skipped', reason: `${meta.app.toUpperCase()} er ikke aktiveret. Workeren kører ikke.`, finished_at: platform.now().toISOString() }); return structuredClone(r); }
    try { Object.assign(r, { status: 'succeeded', output: await fn() }); } catch (e) { Object.assign(r, { status: 'failed', error: e.message }); }
    r.finished_at = platform.now().toISOString();
    platform.audit(orgId, { label: `worker:${id}`, type: 'ai_worker' }, 'worker.run', r.id, { status: r.status });
    return structuredClone(r);
  }
  function overblikAllowed(orgId) { return platform.isModuleActive(orgId, 'overblik') && engine.dataFor(orgId, 'overblik').connections.some((c) => c.status !== 'disconnected'); }
  function proposeTasks(orgId, worker, list, max = 20) {
    if (!overblikAllowed(orgId)) return { created: [], skipped: list.length ? 'Ingen opgaver i OVERBLIK: appen er ikke aktiv, eller ejeren har ikke givet betalingsdata adgang til OVERBLIK.' : null };
    const ow = platform.workerActor(orgId, worker, { module: 'overblik', actions: ['read', 'draft'] });
    const open = new Set(overblik.listTasks(ow).filter((t) => t.dedupe_key && t.status !== 'cancelled' && t.status !== 'done').map((t) => t.dedupe_key));
    const created = [];
    for (const x of list) { if (created.length >= max) break; if (open.has(x.key)) continue; created.push(overblik.createTask(ow, { title: x.title, description: x.description, priority: x.priority || 'normal', dedupe_key: x.key })); }
    if (created.length) platform.notify(orgId, { module: 'overblik', title: `${created.length} betalingssager kræver gennemgang`, body: created.map((t) => t.title).join('\n'), source: worker });
    return { created: created.map((t) => t.id), capped: list.length > max ? list.length - max : 0 };
  }

  function reconciliation(orgId) {
    return run('payment-reconciliation', orgId, () => {
      const wl = views.worklist(platform.workerActor(orgId, 'payment-reconciliation', { module: 'puls', actions: ['read'] }));
      if (!wl.available) return { note: wl.reason, findings: [] };
      const open = wl.items.filter((i) => !i.resolved && ['needs_review', 'deviation', 'unknown'].includes(i.status));
      const title = (i) => i.kind === 'chargeback' ? `Chargeback på ${i.amount}: tjek sagen hos betalingsudbyderen`
        : i.status === 'deviation' ? `Afvigelse på ${i.amount}${i.pos ? ` (ordre ${i.pos.order})` : ''}: gennemgå betalingen`
        : i.suggestion ? `Bekræft match: ordre ${i.pos.order} og kortbetaling ${i.tx.ref} (${i.amount})`
        : i.status === 'unknown' ? `Kortbetaling ${i.tx.ref} på ${i.amount} har intet kassesalg`
        : `Gennemgå betaling på ${i.amount}${i.pos ? ` (ordre ${i.pos.order})` : ''}`;
      const tasks = proposeTasks(orgId, 'payment-reconciliation', open.map((i) => ({ key: `recon:${i.key}`, title: title(i), description: i.reasons.join('\n'), priority: i.status === 'deviation' || i.kind === 'chargeback' ? 'high' : 'normal' })));
      const counts = wl.items.reduce((m, i) => { if (!i.resolved) m[i.status] = (m[i.status] || 0) + 1; return m; }, {});
      return { counts, findings: open.map((i) => ({ key: i.key, status: i.status, explanation: i.reasons.join(' ') })), tasks };
    });
  }

  function settlementMonitor(orgId) {
    return run('settlement-monitor', orgId, () => {
      const d = engine.dataFor(orgId, 'puls');
      const nowT = platform.now().getTime();
      const findings = [];
      for (const c of d.connections.filter((x) => x.status !== 'disconnected')) {
        const txs = d.transactions.filter((t) => t.connection_id === c.id && t.status === 'successful');
        const pos = d.payouts.filter((p) => p.connection_id === c.id);
        const lagMs = (c.payout_lag_days + 2) * 86400000;
        const late = txs.filter((t) => !t.payout_id && nowT - Date.parse(t.occurred_at) > lagMs);
        if (txs.length && !pos.length) findings.push({ type: 'missing_settlement_data', connection: c.label, observation: `${c.provider_name}: Der er ${txs.length} betalinger, men ingen udbetalingsdata.`, uncertainty: c.kind === 'file' ? 'Importér afregningsrapporten fra MyNets, eller tilføj kolonner for udbetalingsdato.' : 'Udbyderen har måske ikke udbetalt endnu.' });
        else if (late.length) findings.push({ type: 'delayed', connection: c.label, count: late.length, oldest: late.map((t) => t.occurred_at).sort()[0],
          observation: `${c.provider_name}: ${late.length} betalinger er ikke udbetalt efter ${c.payout_lag_days + 2} dage (forventet ca. ${c.payout_lag_days} dage).`, refs: late.slice(0, 20).map((t) => t.external_ref) });
        for (const p of pos) {
          const linked = p.lines.filter((l) => l.type === 'PAYOUT');
          const grossTx = linked.reduce((s, l) => s + (txs.find((t) => t.external_ref === l.transaction_ref)?.amount_ore ?? NaN), 0);
          const expected = p.gross_ore - p.fees_ore - p.deductions_ore;
          findings.push({ type: 'payout_breakdown', connection: c.label, payout: p.reference || p.date,
            observation: `Udbetaling ${p.date}${p.reference ? ` (${p.reference})` : ''}: brutto ${views.fmt(p.gross_ore, p.currency)} − gebyrer ${views.fmt(p.fees_ore, p.currency)} − fradrag ${views.fmt(p.deductions_ore, p.currency)} = netto ${views.fmt(p.net_ore, p.currency)}.`,
            ok: expected === p.net_ore && (Number.isNaN(grossTx) || grossTx === p.gross_ore),
            difference: Number.isNaN(grossTx) ? null : grossTx - p.gross_ore,
            uncertainty: Number.isNaN(grossTx) ? 'Mindst én betaling i udbetalingen findes ikke i transaktionsdata.' : grossTx !== p.gross_ore ? 'Transaktionernes beløb stemmer ikke med udbetalingens bruttobeløb.' : null });
        }
      }
      const problems = findings.filter((f) => f.type === 'delayed' || f.type === 'missing_settlement_data' || (f.type === 'payout_breakdown' && !f.ok));
      const tasks = proposeTasks(orgId, 'settlement-monitor', problems.map((f) => ({ key: `settle:${f.type}:${f.connection}:${f.payout || ''}`, title: f.type === 'delayed' ? `Forsinket udbetaling: ${f.observation.split(':')[1].trim()}` : f.observation.split('.')[0], description: [f.observation, f.uncertainty].filter(Boolean).join('\n') })));
      return { findings, tasks };
    });
  }

  function insights(orgId, { current, previous }) {
    return run('payment-insights', orgId, () => {
      const r = views.insights(platform.workerActor(orgId, 'payment-insights', { module: 'indsigt', actions: ['read'] }), current, previous);
      if (!r.available) return { note: r.message, reports: [] };
      const pct = (pm) => (pm == null ? '–' : `${(pm / 10).toFixed(1).replace('.', ',')} %`);
      return { reports: r.byCurrency.map((x) => {
        const findings = [];
        findings.push(x.volumeChange.comparable ? `Kortbetalinger: ${x.volume} (${x.volumeChange.label} mod ${previous.from} – ${previous.to}).` : `Kortbetalinger: ${x.volume}. ${x.volumeChange.reason}`);
        if (x.refundRatePermille != null && x.prevRefundRatePermille != null && x.refundRatePermille - x.prevRefundRatePermille >= 20) findings.push(`Usædvanligt mange refunderinger: ${pct(x.refundRatePermille)} af volumen mod ${pct(x.prevRefundRatePermille)} før.`);
        if (x.feeRatePermille != null && x.prevFeeRatePermille != null && x.feeRatePermille !== x.prevFeeRatePermille) findings.push(`Gebyrsats: ${pct(x.feeRatePermille)} mod ${pct(x.prevFeeRatePermille)} før.`);
        return { currency: x.currency, findings, notes: [x.feeNote, 'Tallene viser, hvad der er sket, ikke hvorfor.'].filter(Boolean), data: x };
      }) };
    });
  }

  return { REGISTRY, reconciliation, settlementMonitor, insights, runs: (orgId) => runs.filter((r) => r.organization_id === orgId).map((r) => structuredClone(r)) };
}

module.exports = { createPaymentWorkers, PAYMENT_WORKERS: REGISTRY };
