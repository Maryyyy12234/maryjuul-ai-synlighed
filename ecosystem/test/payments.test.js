'use strict';
// Betalinger: SumUp (API), Nets/MyNets (filimport), afstemning, udbetalinger, workers.
// Alt kører mod simulerede udbydere (DEMO).
const test = require('node:test');
const assert = require('node:assert/strict');
const { setupShop } = require('./pos-helpers');

const TODAY = '2026-11-05';
const P30 = { from: '2026-10-07', to: '2026-11-05' };

async function shopWithSumUp(opts) {
  const s = await setupShop(opts);
  const c = await s.connectSumUp();
  return { ...s, payConn: c };
}
const at = (s, hhmm) => { s.clock.set(`${TODAY}T${hhmm}:00Z`); return s.clock.now().toISOString(); };
async function posSale(s, { variant = 'M', qty = 1, payments } = {}) {
  const r = s.fake.sell({ lines: [{ variantId: s.seed.hv[variant].id, qty }], locationId: s.seed.butik.id, payments });
  await s.deliver(r.webhooks); return r.order;
}
const items = (s) => s.paymentViews.worklist(s.owner).items;

test('SumUp: OAuth, tokens krypteres, paginering og udbetalinger hentes', async () => {
  const s = await shopWithSumUp();
  for (let i = 0; i < 7; i++) s.sumup.pay({ amountOre: 10000 + i, at: at(s, `08:0${i}`) });
  s.sumup.payout({ date: TODAY, reference: 'PO-1', codes: ['TDEMO0001', 'TDEMO0002'] });
  const run = await s.payments.runSync(s.owner, s.payConn.id, { mode: 'initial' });
  assert.equal(run.status, 'succeeded');
  assert.equal(run.counts.created, 7, 'alle sider hentes');
  const c = s.payments.listConnections(s.owner)[0];
  assert.equal(c.merchant_accounts[0].external_id, 'MDEMO123');
  assert.equal(c.counts.transactions, 7); assert.equal(c.counts.payouts, 1);
  assert.ok(!JSON.stringify(c).includes(s.sumup.state.tokens.access));
  assert.ok([...s.payments._debug.credentials.values()][0].startsWith('v1.'));
  // løbende synk: kun ændringer
  s.clock.addMinutes(10);
  s.sumup.pay({ amountOre: 5000, at: s.clock.now().toISOString() });
  const inc = await s.payments.runSync(s.owner, s.payConn.id);
  assert.equal(inc.counts.created, 1); // overlap i tid er bevidst; gentagne poster genkendes som dubletter
  // gentaget fuld synk giver ingen dubletter
  const again = await s.payments.runSync(s.owner, s.payConn.id, { mode: 'initial' });
  assert.equal(again.counts.created, 0);
  assert.equal(s.payments.listConnections(s.owner)[0].counts.transactions, 8);
});

test('Ingen kortdata gemmes – kun kortets brand', async () => {
  const s = await shopWithSumUp();
  s.sumup.pay({ amountOre: 89900, at: at(s, '09:00'), card: 'VISA_ELECTRON' });
  s.sumup.state.tx[0].card_number = '4111111111111111'; // selv hvis API'et sendte det
  await s.payments.runSync(s.owner, s.payConn.id, { mode: 'initial' });
  const t = [...s.payments._debug.transactions.values()][0];
  assert.equal(t.card_scheme, 'VISA');
  assert.ok(!JSON.stringify(t).includes('4111'));
});

test('Afstemning: sikker reference -> afventer afregning -> matchet efter udbetaling', async () => {
  const s = await shopWithSumUp();
  at(s, '10:00');
  const o = await posSale(s, { payments: [{ method: 'card', reference: 'TREF1' }] });
  s.sumup.pay({ amountOre: 49900, at: at(s, '10:00'), code: 'TREF1' });
  await s.payments.runSync(s.owner, s.payConn.id, { mode: 'initial' });
  let it = items(s).find((i) => i.pos?.order === o.name);
  assert.equal(it.method, 'reference'); assert.equal(it.status, 'awaiting_settlement'); assert.equal(it.status_label, 'Afventer afregning');
  s.sumup.payout({ date: '2026-11-07', reference: 'PO-9', codes: ['TREF1'] });
  s.clock.set('2026-11-07T12:00:00Z');
  await s.payments.runSync(s.owner, s.payConn.id);
  it = items(s).find((i) => i.pos?.order === o.name);
  assert.equal(it.status, 'matched');
  assert.equal(it.tx.payout_date, '2026-11-07');
});

test('Afstemning: forslag på beløb + tid godkendes aldrig automatisk', async () => {
  const s = await shopWithSumUp();
  at(s, '10:05');
  const o = await posSale(s, { variant: 'S' });
  s.sumup.pay({ amountOre: 49900, at: '2026-11-05T10:06:10Z' });
  await s.payments.runSync(s.owner, s.payConn.id, { mode: 'initial' });
  const it = items(s).find((i) => i.pos?.order === o.name);
  assert.equal(it.status, 'needs_review'); assert.equal(it.suggestion, true);
  assert.match(it.reasons.join(' '), /1 min\. fra hinanden/);
  // en AI-worker kan ikke bekræfte
  const w = s.platform.workerActor(s.org.id, 'payment-reconciliation', { module: 'puls', actions: ['read'] });
  assert.throws(() => s.payments.decide(w, it.key, 'confirm'), /Kun mennesker/);
  const after = s.payments.decide(s.owner, it.key, 'confirm');
  assert.equal(after.status, 'awaiting_settlement'); assert.equal(after.method, 'confirmed');
  assert.ok(s.platform.auditLog(s.owner).some((e) => e.action === 'payments.reconciliation_confirm'));
});

test('Afstemning: afvist forslag foreslås ikke igen', async () => {
  const s = await shopWithSumUp();
  at(s, '10:05');
  const o = await posSale(s, { variant: 'S' });
  s.sumup.pay({ amountOre: 49900, at: '2026-11-05T10:06:00Z' });
  await s.payments.runSync(s.owner, s.payConn.id, { mode: 'initial' });
  const it = items(s).find((i) => i.pos?.order === o.name);
  s.payments.decide(s.owner, it.key, 'reject');
  const now = items(s);
  assert.equal(now.find((i) => i.pos?.order === o.name).status, 'awaiting_payment');
  assert.equal(now.find((i) => i.tx && !i.pos).status, 'unknown');
});

test('Afstemning: flere ens betalinger -> vælg selv; beløbsafvigelse; kontant del ignoreres', async () => {
  const s = await shopWithSumUp();
  at(s, '11:00'); const a = await posSale(s, { variant: 'L' });
  at(s, '11:01'); await posSale(s, { variant: 'L' });
  s.sumup.pay({ amountOre: 49900, at: '2026-11-05T11:00:30Z' });
  s.sumup.pay({ amountOre: 49900, at: '2026-11-05T11:01:30Z' });
  at(s, '12:00'); const d = await posSale(s, { payments: [{ method: 'card', reference: 'TDEV' }] });
  s.sumup.pay({ amountOre: 48900, at: at(s, '12:00'), code: 'TDEV' });
  at(s, '13:00'); const split = await posSale(s, { variant: 'XS', qty: 2, payments: [{ method: 'card', amountOre: 50000, reference: 'TSPLIT' }, { method: 'cash' }] });
  s.sumup.pay({ amountOre: 50000, at: at(s, '13:00'), code: 'TSPLIT' });
  await s.payments.runSync(s.owner, s.payConn.id, { mode: 'initial' });
  const amb = items(s).find((i) => i.pos?.order === a.name);
  assert.equal(amb.method, 'ambiguous'); assert.equal(amb.candidates.length, 2);
  const chosen = s.payments.decide(s.owner, amb.key, 'confirm', { txKey: amb.candidates[0] });
  assert.equal(chosen.method, 'confirmed');
  const dev = items(s).find((i) => i.pos?.order === d.name);
  assert.equal(dev.status, 'deviation'); assert.match(dev.reasons[0], /afviger/);
  const sp = items(s).filter((i) => i.pos?.order === split.name);
  assert.equal(sp.length, 1, 'kun kortdelen afstemmes'); assert.equal(sp[0].pos.split, true); assert.equal(sp[0].status, 'awaiting_settlement');
});

test('Afstemning: to kort på samme ordre, refundering, chargeback, ukendt og mulig dublet', async () => {
  const s = await shopWithSumUp();
  at(s, '09:30'); const two = await posSale(s, { payments: [{ method: 'card', amountOre: 20000, reference: 'TC1' }, { method: 'card', reference: 'TC2' }] });
  s.sumup.pay({ amountOre: 20000, at: at(s, '09:30'), code: 'TC1' });
  s.sumup.pay({ amountOre: 29900, at: at(s, '09:30'), code: 'TC2' });
  at(s, '10:00'); const o = await posSale(s, { variant: 'S', payments: [{ method: 'card', reference: 'TR1' }] });
  s.sumup.pay({ amountOre: 49900, at: at(s, '10:00'), code: 'TR1' });
  at(s, '10:20'); await s.deliver(s.fake.refund({ orderId: o.id, qty: 1 }).webhooks);
  s.sumup.refund('TR1', 49900);
  s.sumup.state.tx[s.sumup.state.tx.length - 1].timestamp = '2026-11-05T10:20:40Z';
  s.sumup.pay({ amountOre: 30000, at: '2026-11-05T08:00:00Z', type: 'CHARGE_BACK' });
  s.sumup.pay({ amountOre: 12345, at: '2026-11-05T14:00:00Z' });
  s.sumup.pay({ amountOre: 7000, at: '2026-11-05T15:00:00Z' });
  s.sumup.pay({ amountOre: 7000, at: '2026-11-05T15:00:20Z' });
  at(s, '16:00');
  await s.payments.runSync(s.owner, s.payConn.id, { mode: 'initial' });
  const all = items(s);
  assert.equal(all.filter((i) => i.pos?.order === two.name && i.method === 'reference').length, 2);
  const ref = all.find((i) => i.kind === 'refund' && i.pos);
  assert.equal(ref.suggestion, true); assert.equal(ref.tx.provider, 'sumup');
  assert.equal(all.find((i) => i.kind === 'chargeback').status, 'needs_review');
  assert.equal(all.find((i) => i.tx?.ref && i.amount_ore === 12345).status, 'unknown');
  const dups = all.filter((i) => i.amount_ore === 7000);
  assert.ok(dups.every((i) => i.status === 'needs_review' && /dublet/.test(i.reasons[0])));
});

test('Kassebetaling uden kortbetaling: afventer først, kræver gennemgang efter 48 timer', async () => {
  const s = await shopWithSumUp();
  s.sumup.pay({ amountOre: 100, at: at(s, '08:00') });
  at(s, '09:00'); const o = await posSale(s);
  await s.payments.runSync(s.owner, s.payConn.id, { mode: 'initial' });
  assert.equal(items(s).find((i) => i.pos?.order === o.name).status, 'awaiting_payment');
  s.clock.set('2026-11-08T09:00:00Z');
  await s.payments.runSync(s.owner, s.payConn.id);
  assert.equal(items(s).find((i) => i.pos?.order === o.name).status, 'needs_review');
});

test('Intet tælles dobbelt: kassesalg og kortbetalinger holdes adskilt; LAGER påvirkes ikke', async () => {
  const s = await shopWithSumUp();
  at(s, '10:00'); await posSale(s, { payments: [{ method: 'card', reference: 'TX1' }] });
  const salesBefore = s.posViews.salesSummary(s.owner, { from: TODAY, to: TODAY }).byCurrency[0].salesExVatOre;
  const stockBefore = s.onHand('HOOD-M');
  const moves = s.platform.repo(s.owner, 'lager').list('stock_movements').length;
  s.sumup.pay({ amountOre: 49900, at: at(s, '10:00'), code: 'TX1' });
  s.sumup.pay({ amountOre: 25000, at: at(s, '10:30') });
  await s.payments.runSync(s.owner, s.payConn.id, { mode: 'initial' });
  assert.equal(s.posViews.salesSummary(s.owner, { from: TODAY, to: TODAY }).byCurrency[0].salesExVatOre, salesBefore);
  const dash = s.paymentViews.dashboard(s.owner, { today: TODAY, period: P30 });
  assert.equal(dash.byCurrency[0].todayOre, 74900); assert.equal(dash.byCurrency[0].todayCount, 2);
  assert.match(dash.definitions.card, /Ikke kassesalg/);
  assert.equal(s.onHand('HOOD-M'), stockBefore);
  assert.equal(s.platform.repo(s.owner, 'lager').list('stock_movements').length, moves);
  assert.equal(s.payments.APPS.includes('lager'), false);
});

test('Udbetalinger i bundter: brutto − gebyrer − fradrag = netto; afventer udbetaling; forsinkelse', async () => {
  const s = await shopWithSumUp();
  s.sumup.pay({ amountOre: 100000, at: '2026-11-01T10:00:00Z' });           // TDEMO0001
  s.sumup.pay({ amountOre: 50000, at: '2026-11-01T11:00:00Z' });            // TDEMO0002
  s.sumup.pay({ amountOre: 20000, at: '2026-11-01T12:00:00Z' });            // TDEMO0003 - udbetales ikke
  s.sumup.payout({ date: '2026-11-03', reference: 'PO-77', codes: ['TDEMO0001', 'TDEMO0002'], feePermille: 14 });
  s.sumup.deduction({ date: '2026-11-03', reference: 'PO-77', code: 'TDEMO0009', amountOre: 5000 });
  at(s, '12:00');
  await s.payments.runSync(s.owner, s.payConn.id, { mode: 'initial' });
  const dash = s.paymentViews.dashboard(s.owner, { today: TODAY, period: P30 }).byCurrency[0];
  assert.equal(dash.payouts.length, 1);
  const p = s.paymentViews.dashboard(s.owner, { today: TODAY, period: P30 }).byCurrency[0].payouts[0];
  assert.equal(p.gross, '1.500,00 kr.'); assert.equal(p.fees, '21,00 kr.'); assert.equal(p.deductions, '50,00 kr.'); assert.equal(p.net, '1.429,00 kr.');
  assert.equal(dash.feesOre, 2100); assert.equal(dash.feeCoverage, 'delvis');
  assert.equal(dash.awaitingOre, 20000); assert.equal(dash.awaitingCount, 1);
  const run = await s.paymentWorkers.settlementMonitor(s.org.id);
  const breakdown = run.output.findings.find((f) => f.type === 'payout_breakdown');
  assert.equal(breakdown.ok, true);
  assert.match(breakdown.observation, /brutto 1\.500,00 kr\. − gebyrer 21,00 kr\. − fradrag 50,00 kr\. = netto 1\.429,00 kr\./);
  const delayed = run.output.findings.find((f) => f.type === 'delayed');
  assert.equal(delayed, undefined, 'ikke forsinket endnu (4 dage, grænse 5)');
  s.clock.set('2026-11-08T12:00:00Z');
  const run2 = await s.paymentWorkers.settlementMonitor(s.org.id);
  assert.deepEqual(run2.output.findings.find((f) => f.type === 'delayed').refs, ['TDEMO0003']);
  assert.equal(run2.output.tasks.created.length, 1);
});

const NETS_CSV = [
  'Transaktions-ID;Dato;Tid;Beløb;Valuta;Korttype;Terminal;Forretningsnr;Type;Gebyr;Udbetalingsdato;Kortnummer',
  'N1001;05-11-2026;10:00;499,00;DKK;Visa/Dankort;T-01;5551234;Køb;1,25;07-11-2026;',
  'N1002;05-11-2026;10:30;899,00;DKK;Dankort;T-01;5551234;Køb;0,90;;',
  'N1003;05-11-2026;11:00;-499,00;DKK;Dankort;T-01;5551234;Retur;;;',
  'N1004;31-11-2026;12:00;100,00;DKK;Visa;T-02;5551234;Køb;;;',
  'N1005;05-11-2026;12:30;abc;DKK;Visa;T-02;5551234;Køb;;;',
  'N1006;05-11-2026;13:00;250,00;DKK;Visa;T-02;5551234;Køb;;;4571 9999 9999 9999',
  'N1007;05-11-2026;13:10;250,00;DKK;Visa;4111111111111111;5551234;Køb;;;',
  'N1008;05-11-2026;14:00;300,00;DKK;Mastercard;T-02;5551234;Chargeback;;;',
].join('\n');

test('Nets/MyNets: forhåndsvisning, kolonner, validering, kortdata blokeres, import og dubletter', async () => {
  const s = await setupShop();
  const c = s.payments.createFileConnection(s.owner, 'nets', { label: 'Nets – Butik Aarhus (DEMO)' });
  assert.equal(c.status, 'manual');
  const pv = s.payments.previewImport(s.owner, c.id, NETS_CSV, { fileName: 'mynets-nov.csv' });
  assert.deepEqual(pv.blockedColumns, ['Kortnummer']);
  assert.equal(pv.mapping.transaction_ref, 0); assert.equal(pv.mapping.fee, 9); assert.equal(pv.mapping.payout_date, 10);
  assert.equal(pv.valid_count, 5, 'N1006 er gyldig: kortnummer-kolonnen importeres aldrig');
  assert.ok(pv.preview.some((r) => r.external_ref === 'N1006'));
  assert.deepEqual(pv.errors.map((e) => e.line), [5, 6, 8]);
  assert.match(pv.errors.find((e) => e.line === 8).error, /kortnummer/);
  assert.equal(pv.preview[0].card_scheme, 'VISA_DANKORT');
  assert.equal(pv.preview[0].occurred_at, '2026-11-05T09:00:00.000Z');
  assert.equal(s.payments.listConnections(s.owner)[0].counts.transactions, 0, 'intet gemt før bekræftelse');
  const done = s.payments.confirmImport(s.owner, pv.id);
  assert.deepEqual(done.counts, { created: 5, updated: 0, duplicates: 0 });
  const conn = s.payments.listConnections(s.owner)[0];
  assert.deepEqual([conn.counts.transactions, conn.counts.refunds, conn.counts.disputes, conn.counts.payouts], [3, 1, 1, 1]);
  assert.equal(conn.terminals.length, 2); assert.equal(conn.merchant_accounts[0].external_id, '5551234');
  const stored = JSON.stringify([...s.payments._debug.transactions.values()]);
  assert.ok(!stored.includes('4571 9999') && !stored.includes('4111111111111111'));
  // samme fil igen
  const pv2 = s.payments.previewImport(s.owner, c.id, NETS_CSV);
  assert.ok(pv2.warnings.some((w) => /samme fil/.test(w)));
  assert.deepEqual(s.payments.confirmImport(s.owner, pv2.id).counts, { created: 0, updated: 0, duplicates: 5 });
  assert.throws(() => s.payments.confirmImport(s.owner, pv2.id), /allerede gennemført/);
  // annullér før import
  const pv3 = s.payments.previewImport(s.owner, c.id, NETS_CSV.replace('N1001', 'N9001'));
  assert.equal(s.payments.cancelImport(s.owner, pv3.id).status, 'cancelled');
  assert.throws(() => s.payments.confirmImport(s.owner, pv3.id), /annulleret/);
  assert.equal(s.payments.listConnections(s.owner)[0].counts.transactions, 3);
  assert.deepEqual(s.payments.importHistory(s.owner, c.id).map((i) => i.status), ['cancelled', 'imported', 'imported']);
  // eksplicit tilknytning til en blokeret kolonne afvises
  assert.throws(() => s.payments.previewImport(s.owner, c.id, NETS_CSV, { mapping: { transaction_ref: 11, date: 1, amount: 3 } }), /kortdata/);
  // ugyldige filer
  assert.throws(() => s.payments.previewImport(s.owner, c.id, ''), /tom/);
  assert.throws(() => s.payments.previewImport(s.owner, c.id, 'PK\u0003\u0004\u0000\u0000binær'), /XLSX/);
  const noMap = s.payments.previewImport(s.owner, c.id, 'a;b;c\n1;2;3');
  assert.deepEqual(noMap.missingRequired, ['Transaktionsreference', 'Dato', 'Beløb']);
});

test('Nets-fil uden klokkeslæt: forslag på samme dato; gebyr og afregning vises', async () => {
  const s = await setupShop();
  at(s, '10:00'); const o = await posSale(s);
  const c = s.payments.createFileConnection(s.owner, 'nets');
  const pv = s.payments.previewImport(s.owner, c.id, 'Transaktions-ID;Dato;Beløb;Gebyr;Udbetalingsdato\nX1;05.11.2026;499,00;1,25;07.11.2026');
  s.payments.confirmImport(s.owner, pv.id);
  const it = s.paymentViews.worklist(s.owner).items.find((i) => i.pos?.order === o.name);
  assert.equal(it.suggestion, true); assert.match(it.reasons[0], /samme dato/);
  const dash = s.paymentViews.dashboard(s.owner, { today: TODAY, period: { from: '2026-11-01', to: '2026-11-30' } }).byCurrency[0];
  assert.equal(dash.feesOre, 125); assert.equal(dash.payouts[0].net, '497,75 kr.');
});

test('Flere udbydere i samme virksomhed: SumUp + Nets', async () => {
  const s = await shopWithSumUp();
  const nets = s.payments.createFileConnection(s.owner, 'nets');
  s.payments.confirmImport(s.owner, s.payments.previewImport(s.owner, nets.id, NETS_CSV).id);
  s.sumup.pay({ amountOre: 10000, at: at(s, '10:00') });
  await s.payments.runSync(s.owner, s.payConn.id, { mode: 'initial' });
  const dash = s.paymentViews.dashboard(s.owner, { today: TODAY, period: P30 });
  assert.equal(dash.sources.length, 2);
  assert.equal(dash.byCurrency[0].todayOre, 49900 + 89900 + 25000 + 10000);
});

test('Sikkerhed: anden virksomhed, datadeling slået fra, afbrydelse', async () => {
  const s = await shopWithSumUp();
  s.sumup.pay({ amountOre: 10000, at: at(s, '10:00') });
  await s.payments.runSync(s.owner, s.payConn.id, { mode: 'initial' });
  const u = s.platform.createUser('Anden', 'x@example.dk');
  const org2 = s.platform.createOrganization('Anden ApS', 'detail', u);
  const o2 = s.platform.userActor(org2.id, u.id);
  s.platform.activateModule(o2, 'puls');
  assert.equal(s.payments.listConnections(o2).length, 0);
  assert.equal(s.paymentViews.dashboard(o2, { today: TODAY, period: P30 }).available, false);
  assert.throws(() => s.payments.previewImport(o2, s.payConn.id, NETS_CSV), /findes ikke/);
  await assert.rejects(s.payments.runSync(o2, s.payConn.id), /findes ikke/);
  const emp = s.platform.createUser('Ida', 'ida@example.dk');
  s.platform.inviteMember(s.owner, emp, 'member', ['puls']);
  assert.throws(() => s.payments.listConnections(s.platform.userActor(s.org.id, emp.id)), /ejer eller administrator/);
  s.payments.setTargets(s.owner, s.payConn.id, { puls: false });
  assert.equal(s.paymentViews.dashboard(s.owner, { today: TODAY, period: P30 }).available, false);
  s.payments.setTargets(s.owner, s.payConn.id, { puls: true });
  const d = s.payments.disconnect(s.owner, s.payConn.id);
  assert.equal(d.status, 'disconnected'); assert.equal(d.has_credentials, false);
  await assert.rejects(s.payments.runSync(s.owner, s.payConn.id), /afbrudt/);
  assert.equal(s.paymentViews.dashboard(s.owner, { today: TODAY, period: P30 }).sources[0].historical, true);
  const nets = s.payments.createFileConnection(s.owner, 'nets');
  s.payments.disconnect(s.owner, nets.id);
  assert.throws(() => s.payments.previewImport(s.owner, nets.id, NETS_CSV), /afbrudt/);
  assert.throws(() => s.payments.startConnect(s.owner, 'verifone'), /ikke bygget/);
});

test('Fejlende forbindelse: fornyelse, serverfejl og tilbagekaldt adgang', async () => {
  const s = await shopWithSumUp();
  s.sumup.pay({ amountOre: 10000, at: at(s, '10:00') });
  s.clock.addMinutes(120); s.sumup.state.failNext = 1;
  const r = await s.payments.runSync(s.owner, s.payConn.id, { mode: 'initial' });
  assert.equal(r.status, 'succeeded');
  assert.ok(s.sumup.state.calls.some((c) => c.grant === 'refresh_token'));
  s.sumup.state.tokens.access = 'revoked';
  const bad = await s.payments.runSync(s.owner, s.payConn.id);
  assert.equal(bad.status, 'failed');
  const c = s.payments.listConnections(s.owner)[0];
  assert.equal(c.status, 'requires_action'); assert.match(c.last_error, /Forbind igen/);
});

test('Workers: gennemgangsopgaver i OVERBLIK uden dubletter; refunderingsanalyse', async () => {
  const s = await shopWithSumUp();
  s.sumup.pay({ amountOre: 12345, at: '2026-11-04T10:00:00Z' });
  s.sumup.pay({ amountOre: 30000, at: '2026-11-04T11:00:00Z', type: 'CHARGE_BACK' });
  at(s, '12:00');
  await s.payments.runSync(s.owner, s.payConn.id, { mode: 'initial' });
  const r = await s.paymentWorkers.reconciliation(s.org.id);
  assert.equal(r.status, 'succeeded');
  assert.equal(r.output.tasks.created.length, 2);
  const titles = s.overblik.listTasks(s.owner).map((t) => t.title);
  assert.ok(titles.some((t) => /Chargeback på 300,00 kr\./.test(t)));
  assert.ok(titles.some((t) => /Kortbetaling TDEMO0001 på 123,45 kr\. har intet kassesalg/.test(t)));
  const r2 = await s.paymentWorkers.reconciliation(s.org.id);
  assert.equal(r2.output.tasks.created.length, 0);
  // løst sag forsvinder fra arbejdslisten
  const it = items(s).find((i) => i.kind === 'chargeback');
  assert.throws(() => s.payments.decide(s.owner, it.key, 'resolve', { note: ' ' }), /Skriv kort/);
  s.payments.decide(s.owner, it.key, 'resolve', { note: 'Sag vundet hos SumUp' });
  assert.equal(items(s).find((i) => i.kind === 'chargeback').resolved, true);
  // indsigt
  for (let i = 0; i < 5; i++) s.sumup.pay({ amountOre: 10000, at: `2026-10-2${i}T10:00:00Z` });
  s.sumup.refund('TDEMO0001', 12345);
  await s.payments.runSync(s.owner, s.payConn.id, { mode: 'initial' });
  const ins = await s.paymentWorkers.insights(s.org.id, { current: { from: '2026-11-01', to: TODAY }, previous: { from: '2026-10-01', to: '2026-10-31' } });
  assert.ok(ins.output.reports[0].findings.some((f) => /Usædvanligt mange refunderinger/.test(f)));
  assert.equal(ins.model, null); assert.equal(ins.cost_ore, 0);
});

test('Worker stopper med forklaring, når PULS ikke er aktiv', async () => {
  const s = await setupShop({ modules: ['lager', 'overblik'] });
  const r = await s.paymentWorkers.reconciliation(s.org.id);
  assert.equal(r.status, 'skipped'); assert.match(r.reason, /PULS er ikke aktiveret/);
});
