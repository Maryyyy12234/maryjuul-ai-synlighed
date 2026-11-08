'use strict';
// Det forbundne workflow fra masterprompten, afsnit 1.4.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./helpers');

function lowStockShop() {
  const s = setup();
  const loc = s.lager.createLocation(s.owner, 'Hovedlager');
  const p = s.lager.createProduct(s.owner, { name: 'Produkt A', sku: 'A-1', cost_ore: 4000, min_stock: 5, lead_time_days: 5 });
  s.lager.recordMovement(s.owner, { productId: p.id, locationId: loc.id, type: 'receipt', quantity: 258, reason: 'Start' });
  for (let d = 0; d < 28; d++) { s.clock.addDays(1); s.lager.recordMovement(s.owner, { productId: p.id, locationId: loc.id, type: 'sale', quantity: 8, reason: 'ordre' }); }
  return { ...s, loc, p };
}

test('lav beholdning -> forslag -> opgave -> ejer godkender -> indkøbskladde', () => {
  const s = lowStockShop();
  s.platform.grantSharing(s.owner, 'lager', 'overblik', 'tasks');

  const run = s.workers.inventoryPlanner(s.org.id);
  assert.equal(run.actionable, 1);
  const req = s.approvals.get(s.owner, run.approvalId);
  assert.equal(req.status, 'pending');
  assert.equal(req.proposed_by_type, 'ai_worker');
  for (const f of ['change', 'reason', 'evidence', 'effect']) assert.ok(req[f], f);
  assert.match(req.effect, /Intet sendes til leverandøren/);

  const task = s.platform.repo(s.owner, 'overblik').get('tasks', run.taskId);
  assert.equal(task.draft, true);
  assert.equal(task.approval_id, req.id);
  assert.equal(s.overblik.today(s.owner, { date: '2026-11-29', approvals: s.approvals }).counts.pendingApprovals, 1);

  // Ingen kladde før godkendelse
  assert.throws(() => s.approvals.execute(s.owner, req.id), /Kun godkendte/);
  s.approvals.decide(s.owner, req.id, 'approved', 'OK');
  const { result: po } = s.approvals.execute(s.owner, req.id);
  assert.equal(po.status, 'draft');
  assert.equal(po.sent, false);
  assert.equal(s.approvals.execute(s.owner, req.id).alreadyExecuted, true); // ikke dobbelt
  assert.equal(s.platform.repo(s.owner, 'lager').list('purchase_orders').length, 1);

  const actions = s.platform.auditLog(s.owner).map((e) => e.action);
  for (const a of ['worker.run', 'approval.proposed', 'approval.approved', 'approval.executed', 'purchase_orders.created']) assert.ok(actions.includes(a), a);
});

test('uden godkendt datadeling oprettes ingen opgave i OVERBLIK', () => {
  const s = lowStockShop();
  const run = s.workers.inventoryPlanner(s.org.id);
  assert.ok(run.approvalId);
  assert.equal(run.taskId, null);
});

test('AI-worker og medarbejdere uden rettighed kan ikke godkende', () => {
  const s = lowStockShop();
  const run = s.workers.inventoryPlanner(s.org.id);
  const worker = s.platform.workerActor(s.org.id, 'inventory-planner', { module: 'lager' });
  assert.throws(() => s.approvals.decide(worker, run.approvalId, 'approved'), /Kun mennesker/);
  const u = s.platform.createUser('Ida', 'ida@example.dk');
  s.platform.inviteMember(s.owner, u, 'member', ['lager']);
  assert.throws(() => s.approvals.decide(s.platform.userActor(s.org.id, u.id), run.approvalId, 'approved'), /ikke rettighed/);
  // worker kan ikke opdatere data direkte
  assert.throws(() => s.platform.repo(worker, 'lager').update('products', s.p.id, { min_stock: 0 }), /Mangler rettighed/);
});

test('afvist forslag kan ikke udføres og historikken bevares', () => {
  const s = lowStockShop();
  const run = s.workers.inventoryPlanner(s.org.id);
  const r = s.approvals.decide(s.owner, run.approvalId, 'rejected', 'For dyrt');
  assert.deepEqual(r.history.map((h) => h.status), ['pending', 'rejected']);
  assert.throws(() => s.approvals.execute(s.owner, run.approvalId), /Kun godkendte/);
  assert.throws(() => s.approvals.decide(s.owner, run.approvalId, 'approved'), /allerede/);
});

test('Operations Assistant finder opgaver uden ansvarlig', () => {
  const s = setup();
  for (let i = 0; i < 3; i++) s.overblik.createTask(s.owner, { title: `Opgave ${i}`, due_on: '2026-11-02' });
  s.overblik.createTask(s.owner, { title: 'Gammel', due_on: '2026-10-20', assignee_id: s.ownerUser.id });
  const run = s.workers.operationsAssistant(s.org.id, { date: '2026-11-01' });
  assert.equal(run.messages[0], '3 opgaver har deadline senest i morgen, men ingen ansvarlig. Vil du fordele dem?');
  assert.equal(run.overdue.length, 1);
});
