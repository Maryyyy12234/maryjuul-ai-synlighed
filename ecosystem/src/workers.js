'use strict';
// AI-workers. Fase 1 er deterministiske regler (ingen sprogmodel). Hver kørsel
// logges med input-omfang og output. En sprogmodel kan senere formulere
// teksten, men tal og beslutningsgrundlag kommer herfra.

const { formatDKK } = require('./money');

function createWorkers(platform, { lager, overblik, approvals }) {
  const runs = [];
  function logRun(orgId, worker, summary) {
    const run = { worker, organization_id: orgId, at: platform.now().toISOString(), ...summary };
    runs.push(run); platform.audit(orgId, { label: `worker:${worker}`, type: 'ai_worker' }, 'worker.run', worker, summary);
    return run;
  }

  // Inventory Planner: finder varer der bør genbestilles og sender ét samlet
  // indkøbsforslag til godkendelse. Opretter en opgave i OVERBLIK, hvis
  // ejeren har godkendt den datadeling.
  function inventoryPlanner(orgId) {
    const w = platform.workerActor(orgId, 'inventory-planner', { module: 'lager' });
    const products = platform.repo(w, 'lager').list('products', (p) => p.status === 'active');
    const suggestions = products.map((p) => lager.reorderSuggestion(w, p.id));
    const actionable = suggestions.filter((s) => ['reorder', 'below_min_no_forecast'].includes(s.status) && s.suggestedQty > 0);
    const notes = suggestions.filter((s) => ['insufficient_history', 'missing_lead_time'].includes(s.status)).map((s) => `${s.name}: ${s.reason}`);
    let approval = null, task = null;
    if (actionable.length) {
      const total = actionable.reduce((a, s) => a + (s.estimatedCostOre || 0), 0);
      const missingCost = actionable.some((s) => s.estimatedCostOre == null);
      approval = approvals.propose(w, {
        module: 'lager', kind: 'lager.purchase_draft',
        title: `Indkøbsforslag: ${actionable.length} ${actionable.length === 1 ? 'vare' : 'varer'}`,
        change: actionable.map((s) => `${s.name} (${s.sku}): bestil ${s.suggestedQty} stk.`).join('\n'),
        reason: actionable.map((s) => s.status === 'reorder'
          ? `${s.name}: ${s.onHand} stk. tilbage, rækker ca. ${s.daysOfCover} dage. Genbestillingspunkt ${s.reorderPoint}.`
          : `${s.name}: ${s.onHand} stk. er under minimum (${s.minStock}).`).join('\n'),
        evidence: actionable.map((s) => s.basis).join('\n'),
        effect: 'Der oprettes en indkøbskladde i LAGER. Intet sendes til leverandøren, og intet betales.',
        uncertainty: [missingCost ? 'Indkøbspris mangler på mindst én vare.' : null, `Anslået indkøb: ${formatDKK(total)} ekskl. moms.`].filter(Boolean).join(' '),
        payload: { lines: actionable.map((s) => ({ product_id: s.productId, sku: s.sku, qty: s.suggestedQty })) },
      });
      if (platform.isShared(orgId, 'lager', 'overblik', 'tasks')) {
        const ow = platform.workerActor(orgId, 'inventory-planner', { module: 'overblik' });
        task = overblik.createTask(ow, { title: `Tag stilling til indkøbsforslag (${actionable.length} varer)`, priority: 'high', approval_id: approval.id });
      }
    }
    return logRun(orgId, 'inventory-planner', { productsChecked: products.length, actionable: actionable.length, notes, approvalId: approval?.id || null, taskId: task?.id || null });
  }

  // Operations Assistant: opgaver uden ansvarlig med deadline snart + forsinkede.
  function operationsAssistant(orgId, { date }) {
    const w = platform.workerActor(orgId, 'operations-assistant', { module: 'overblik' });
    const open = overblik.listTasks(w).filter((t) => !['done', 'cancelled'].includes(t.status) && !t.draft);
    const tomorrow = new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10);
    const unassignedSoon = open.filter((t) => !t.assignee_id && t.due_on && t.due_on <= tomorrow);
    const overdue = open.filter((t) => t.due_on && t.due_on < date);
    const messages = [];
    if (unassignedSoon.length) messages.push(`${unassignedSoon.length} ${unassignedSoon.length === 1 ? 'opgave har' : 'opgaver har'} deadline senest i morgen, men ingen ansvarlig. Vil du fordele dem?`);
    if (overdue.length) messages.push(`${overdue.length} ${overdue.length === 1 ? 'opgave er' : 'opgaver er'} forsinket.`);
    return logRun(orgId, 'operations-assistant', { messages, unassignedSoon: unassignedSoon.map((t) => t.id), overdue: overdue.map((t) => t.id) });
  }

  return { inventoryPlanner, operationsAssistant, runs: (orgId) => runs.filter((r) => r.organization_id === orgId) };
}

module.exports = { createWorkers };
