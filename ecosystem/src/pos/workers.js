'use strict';
// AI-workers til kassedata. Fase 1: deterministiske regler (ingen sprogmodel,
// 0 kr. i AI-omkostning). Tal kommer fra kode. Workers opretter kun forslag,
// kladder og notifikationer – aldrig køb, betalinger eller ændringer i kassen.

const crypto = require('node:crypto');
const { formatDKK } = require('../money');

const SIZE_OPTION = /^(size|størrelse|str\.?)$/i;
const MAX_FINDINGS = 50;

const REGISTRY = [
  { id: 'sales-monitor', name: 'Sales Monitor', app: 'indsigt', level: 1, purpose: 'Finder bedst sælgende varer og væsentlige ændringer i salget.',
    data: ['Kassedata (ordrer, linjer, kategorier)'], actions: ['Læse kassedata'] },
  { id: 'inventory-monitor', name: 'Inventory Monitor', app: 'lager', level: 4, purpose: 'Finder varer med risiko for udsolgt og foreslår genbestilling.',
    data: ['Lagerbeholdning fra kassen', 'Salgshistorik fra kassen'], actions: ['Oprette indkøbsforslag til godkendelse', 'Oprette opgaveforslag i OVERBLIK', 'Sende notifikation'] },
  { id: 'business-insights', name: 'Business Insights', app: 'indsigt', level: 2, purpose: 'Skriver en kort rapport om udviklingen med tydeligt datagrundlag.',
    data: ['Kassedata'], actions: ['Oprette rapportkladde'] },
  { id: 'operations', name: 'Operations Worker', app: 'overblik', level: 3, purpose: 'Følger op på åbne forslag og godkendelser og giver ejeren besked.',
    data: ['Opgaver', 'Godkendelser'], actions: ['Sende notifikation'] },
];

function createPosWorkers({ platform, engine, views, lager, overblik, approvals }) {
  const runs = [];
  async function run(workerId, orgId, trigger, fn) {
    const meta = REGISTRY.find((w) => w.id === workerId);
    const r = { id: `run_${crypto.randomUUID().slice(0, 10)}`, worker: workerId, app: meta.app, organization_id: orgId, trigger,
      started_at: platform.now().toISOString(), status: 'running', model: null, cost_ore: 0 };
    runs.push(r);
    if (!platform.isModuleActive(orgId, meta.app)) {
      Object.assign(r, { status: 'skipped', reason: `${meta.app.toUpperCase()} er ikke aktiveret. Workeren kører ikke.`, finished_at: platform.now().toISOString() });
      return structuredClone(r);
    }
    try {
      const out = await fn();
      if (out.findings && out.findings.length > MAX_FINDINGS) { out.truncated = out.findings.length - MAX_FINDINGS; out.findings = out.findings.slice(0, MAX_FINDINGS); }
      Object.assign(r, { status: 'succeeded', output: out });
    } catch (e) {
      Object.assign(r, { status: 'failed', error: e.message });
    }
    r.finished_at = platform.now().toISOString();
    platform.audit(orgId, { label: `worker:${workerId}`, type: 'ai_worker' }, 'worker.run', r.id, { status: r.status, trigger });
    return structuredClone(r);
  }

  // ---------- Sales Monitor ----------
  function salesMonitor(orgId, { current, previous, trigger = 'manual' }) {
    return run('sales-monitor', orgId, trigger, () => {
      const a = platform.workerActor(orgId, 'sales-monitor', { module: 'indsigt', actions: ['read'] });
      const cmp = views.compare(a, current, previous);
      if (!cmp.available) return { findings: [], note: cmp.message };
      const findings = [];
      for (const g of cmp.byCurrency) {
        const cur = cmp.current.byCurrency.find((x) => x.currency === g.currency);
        const fm = (o) => views.fmt(o, g.currency);
        const top = cur.topProducts[0];
        if (top) findings.push({ type: 'top_seller', observation: `Mest solgte vare: ${top.title} (${top.units} stk., ${fm(top.netOre)} ekskl. moms).`,
          evidence: { period: current, units: top.units, netOre: top.netOre }, uncertainty: null });
        findings.push({ type: 'net_change', observation: g.net.comparable
          ? `Salget er ${g.net.diff >= 0 ? 'steget' : 'faldet'} ${g.net.label.replace(/^[+-]/, '')} (${fm(Math.abs(g.net.diff))}) sammenlignet med ${previous.from} – ${previous.to}.`
          : `Salget kan ikke sammenlignes procentvis: ${g.net.reason}`, evidence: { current: g.current, previous: g.previous }, uncertainty: null });
        for (const c of g.categories) {
          if (!c.change.comparable || Math.abs(c.change.tenthsOfPercent) < 150 || Math.abs(c.change.diff) < 50000) continue;
          findings.push({ type: c.change.diff > 0 ? 'category_growth' : 'category_decline',
            observation: `Kategori ${c.key}: ${c.change.label} (${fm(c.prevNetOre)} → ${fm(c.netOre)}).`,
            evidence: { units: [c.prevUnits, c.units], netOre: [c.prevNetOre, c.netOre] }, uncertainty: 'Årsagen fremgår ikke af kassedata.' });
        }
        const days = cur.byDay;
        if (days.length >= 7) {
          const avg = days.reduce((s, d) => s + d.netOre, 0) / days.length;
          const max = days.reduce((m, d) => (d.netOre > m.netOre ? d : m));
          if (max.netOre > avg * 2) findings.push({ type: 'unusual_day', observation: `${max.key} skiller sig ud: ${fm(max.netOre)} mod gennemsnitligt ${fm(Math.round(avg))} pr. dag.`,
            evidence: { day: max.key, netOre: max.netOre, avgOre: Math.round(avg), days: days.length }, uncertainty: 'Kan skyldes kampagne, event eller enkeltstående stort køb.' });
        }
      }
      return { findings };
    });
  }

  // ---------- Inventory Monitor ----------
  function label(v, fallbackName) {
    if (!v) return fallbackName;
    const size = v.options?.find((o) => SIZE_OPTION.test(o.name))?.value;
    const base = fallbackName.split(' – ')[0];
    return size ? `Størrelse ${size} i ${base}` : fallbackName;
  }

  function inventoryMonitor(orgId, { riskDays = 7, trigger = 'manual' } = {}) {
    return run('inventory-monitor', orgId, trigger, () => {
      const a = platform.workerActor(orgId, 'inventory-monitor', { module: 'lager', actions: ['read', 'draft'] });
      const prods = platform.repo(a, 'lager').list('products', (p) => p.status === 'active' && p.external_ref);
      const findings = [], risky = [], notes = [];
      for (const p of prods) {
        const s = lager.reorderSuggestion(a, p.id);
        const v = engine.variantForLagerProduct(p.id);
        const name = label(v, p.name);
        const vel = s.velocity?.sufficient ? s.velocity : (s.status === 'missing_lead_time' ? s.velocity : null);
        const cover = vel ? (vel.perDayMilli > 0 ? Math.floor((s.onHand * 1000) / vel.perDayMilli) : null) : null;
        let risk = null;
        if (s.onHand <= 0) risk = 'out_of_stock';
        else if (s.onHand <= p.min_stock) risk = 'below_min';
        else if (cover != null && cover <= riskDays) risk = 'runs_out_soon';
        if (s.status === 'missing_lead_time' && risk) notes.push(`${name}: leveringstid mangler, så antal til genbestilling kan ikke beregnes.`);
        if (!risk) {
          if (vel && vel.units <= 1 && s.onHand >= 10) findings.push({ type: 'slow_mover', observation: `${name} har solgt ${vel.units} stk. på ${vel.windowDays} dage og har ${s.onHand} på lager.`, evidence: { velocity: vel, onHand: s.onHand }, uncertainty: null });
          continue;
        }
        const where = engine.inventoryByLocation(orgId, p.id);
        const obs = risk === 'runs_out_soon'
          ? `${name} har ${s.onHand} stk. tilbage og rækker ca. ${cover} dage ved nuværende salg.`
          : risk === 'out_of_stock' ? `${name} er udsolgt.` : `${name} har ${s.onHand} stk. tilbage (minimum ${p.min_stock}).`;
        const f = { type: risk, productId: p.id, name, onHand: s.onHand, minStock: p.min_stock, daysOfCover: cover, suggestedQty: s.suggestedQty || 0,
          estimatedCostOre: s.estimatedCostOre ?? null, observation: obs,
          evidence: { byLocation: where, basis: s.basis || s.reason || null, salesPeriod: vel?.period || null }, uncertainty: vel ? null : 'For lidt salgshistorik til en prognose.' };
        findings.push(f); risky.push(f);
      }
      let approval = null; const tasks = [];
      const orderable = risky.filter((f) => f.suggestedQty > 0);
      if (orderable.length) {
        const total = orderable.reduce((s, f) => s + (f.estimatedCostOre || 0), 0);
        approval = approvals.propose(a, {
          module: 'lager', kind: 'lager.purchase_draft', title: `Indkøbsforslag: ${orderable.length} ${orderable.length === 1 ? 'vare' : 'varer'} fra kassedata`,
          change: orderable.map((f) => `${f.name}: bestil ${f.suggestedQty} stk.`).join('\n'),
          reason: orderable.map((f) => f.observation).join('\n'),
          evidence: orderable.map((f) => `${f.name}: ${f.evidence.basis || 'minimumsbeholdning'}`).join('\n'),
          effect: 'Der oprettes en indkøbskladde i LAGER. Intet sendes til leverandøren, intet betales, og lageret i kassen ændres ikke.',
          uncertainty: [orderable.some((f) => f.estimatedCostOre == null) ? 'Indkøbspris mangler på mindst én vare.' : null, total ? `Anslået indkøb: ${formatDKK(total)} ekskl. moms.` : null].filter(Boolean).join(' ') || null,
          payload: { lines: orderable.map((f) => ({ product_id: f.productId, qty: f.suggestedQty })) },
        });
      }
      const overblikAllowed = platform.isModuleActive(orgId, 'overblik') && engine.dataFor(orgId, 'overblik').connections.some((c) => !c.historical);
      if (risky.length && overblikAllowed) {
        const ow = platform.workerActor(orgId, 'inventory-monitor', { module: 'overblik', actions: ['read', 'draft'] });
        const open = overblik.listTasks(ow).filter((t) => t.dedupe_key && !['done', 'cancelled'].includes(t.status));
        for (const f of risky) {
          const key = `low_stock:${f.productId}`;
          if (open.some((t) => t.dedupe_key === key)) continue;
          tasks.push(overblik.createTask(ow, {
            title: `${f.name} er ved at være udsolgt. Gennemgå indkøbsforslaget.`,
            description: [f.observation, ...f.evidence.byLocation.map((l) => `${l.location}: ${l.available} stk.`)].join('\n'),
            priority: f.type === 'out_of_stock' ? 'high' : 'normal', approval_id: approval && f.suggestedQty > 0 ? approval.id : null, dedupe_key: key,
          }));
        }
        if (tasks.length) platform.notify(orgId, { module: 'overblik', title: `${tasks.length} ${tasks.length === 1 ? 'vare er' : 'varer er'} ved at være udsolgt`, body: tasks.map((t) => t.title).join('\n'), source: 'inventory-monitor' });
      }
      return { findings, notes, approvalId: approval?.id || null, taskIds: tasks.map((t) => t.id),
        skipped: risky.length && !overblikAllowed ? 'Ingen opgaver i OVERBLIK: appen er ikke aktiv, eller ejeren har ikke givet kassedata adgang til OVERBLIK.' : null };
    });
  }

  // ---------- Business Insights ----------
  function businessInsights(orgId, { current, previous, trigger = 'manual' }) {
    return run('business-insights', orgId, trigger, () => {
      const a = platform.workerActor(orgId, 'business-insights', { module: 'indsigt', actions: ['read'] });
      const cmp = views.compare(a, current, previous);
      if (!cmp.available) return { report: null, note: cmp.message };
      const reports = cmp.byCurrency.map((g) => {
        const cur = cmp.current.byCurrency.find((x) => x.currency === g.currency);
        const fm = (o) => views.fmt(o, g.currency);
        const growth = g.categories.filter((c) => c.change.comparable && c.change.diff > 0).sort((x, y) => y.change.diff - x.change.diff);
        const decline = g.categories.filter((c) => c.change.comparable && c.change.diff < 0).sort((x, y) => x.change.diff - y.change.diff);
        const actions = [];
        if (decline[0] && Math.abs(decline[0].change.tenthsOfPercent) >= 150) actions.push({ text: `Gennemgå udvalg og placering i kategorien ${decline[0].key}.`, basis: `Salget faldt ${decline[0].change.label.replace('-', '')} (${fm(decline[0].prevNetOre)} → ${fm(decline[0].netOre)}).` });
        if (cur.bySize?.length) {
          const totalUnits = cur.bySize.reduce((s, x) => s + x.units, 0);
          const s0 = cur.bySize[0];
          if (totalUnits >= 10) actions.push({ text: `Hold øje med beholdningen i størrelse ${s0.key}.`, basis: `Størrelse ${s0.key} stod for ${Math.round((s0.units * 100) / totalUnits)} % af de solgte enheder med størrelse (${s0.units} af ${totalUnits}).` });
        }
        return {
          currency: g.currency, period: current, comparedWith: previous,
          conclusion: g.net.comparable
            ? `Salget ekskl. moms blev ${fm(g.current.netOre)}, ${g.net.diff >= 0 ? 'en stigning' : 'et fald'} på ${g.net.label.replace(/^[+-]/, '')} i forhold til ${previous.from} – ${previous.to}.`
            : `Salget ekskl. moms blev ${fm(g.current.netOre)}. ${g.net.reason}`,
          kpis: [
            { name: 'Salg ekskl. moms', value: fm(g.current.netOre), change: g.net.comparable ? g.net.label : null },
            { name: 'Ordrer', value: String(g.current.orders), change: g.orders.comparable ? g.orders.label : null },
            { name: 'Gns. ordreværdi', value: fm(g.current.aovOre), change: g.aov.comparable ? g.aov.label : null },
          ],
          changes: [...growth.slice(0, 3).map((c) => ({ direction: 'vækst', category: c.key, text: `${c.key}: ${c.change.label} (${fm(c.prevNetOre)} → ${fm(c.netOre)})` })),
            ...decline.slice(0, 3).map((c) => ({ direction: 'fald', category: c.key, text: `${c.key}: ${c.change.label} (${fm(c.prevNetOre)} → ${fm(c.netOre)})` }))],
          actions,
          uncertainty: ['Tallene viser hvad der er sket, ikke hvorfor. Årsager er ikke undersøgt.',
            ...(cmp.current.sources.some((s) => s.demo) ? ['Rapporten bygger på DEMO-data.'] : []),
            ...(cmp.current.sources.some((s) => s.historical) ? ['Mindst én kasseforbindelse er afbrudt. Data efter afbrydelsen mangler.'] : [])],
          sources: cmp.current.sources,
        };
      });
      return { reports, status: 'draft' };
    });
  }

  // ---------- Operations Worker ----------
  function operations(orgId, { staleDays = 3, trigger = 'manual' } = {}) {
    return run('operations', orgId, trigger, () => {
      const ow = platform.workerActor(orgId, 'operations', { module: 'overblik', actions: ['read'] });
      const cutoff = platform.now().getTime() - staleDays * 86400000;
      const stale = overblik.listTasks(ow).filter((t) => t.draft && t.suggestion_status === 'proposed' && Date.parse(t.created_at) <= cutoff);
      const pending = platform.MODULES.filter((m) => platform.isModuleActive(orgId, m))
        .flatMap((m) => approvals.list(platform.workerActor(orgId, 'operations', { module: m, actions: ['read'] }), 'pending'));
      const messages = [];
      if (stale.length) messages.push(`${stale.length} ${stale.length === 1 ? 'opgaveforslag har' : 'opgaveforslag har'} ventet mere end ${staleDays} dage.`);
      if (pending.length) messages.push(`${pending.length} ${pending.length === 1 ? 'forslag afventer' : 'forslag afventer'} din godkendelse.`);
      if (messages.length) platform.notify(orgId, { module: 'overblik', title: 'Opfølgning', body: messages.join('\n'), source: 'operations' });
      return { messages, staleTaskIds: stale.map((t) => t.id), pendingApprovalIds: pending.map((p) => p.id) };
    });
  }

  return { REGISTRY, salesMonitor, inventoryMonitor, businessInsights, operations, runs: (orgId) => runs.filter((r) => r.organization_id === orgId).map((r) => structuredClone(r)) };
}

module.exports = { createPosWorkers, WORKER_REGISTRY: REGISTRY };
