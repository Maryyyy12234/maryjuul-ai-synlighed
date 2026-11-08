'use strict';
// End-to-end: tøjbutik med Shopify POS (DEMO-data via simuleret Shopify).
const test = require('node:test');
const assert = require('node:assert/strict');
const { setupShop } = require('./pos-helpers');

const TODAY = { from: '2026-11-05', to: '2026-11-05' };

test('1. Forbindelse via OAuth: tokens krypteres, webhooks registreres, data importeres', async () => {
  const s = await setupShop();
  const c = s.pos.listConnections(s.owner)[0];
  assert.equal(c.status, 'connected');
  assert.equal(c.shop_name, 'Demo Tøjbutik (DEMO)');
  assert.deepEqual(c.apps_using_data, ['lager', 'puls', 'indsigt', 'overblik']);
  assert.equal(c.counts.products, 3);
  assert.equal(c.counts.variants, 9);
  assert.equal(c.counts.locations, 2);
  assert.equal(c.counts.orders, s.fake.state.orders.size);
  assert.equal(c.last_run.status, 'succeeded');
  // Token gemmes kun krypteret
  const sealed = [...s.pos._debug.credentials.values()][0];
  assert.ok(sealed.startsWith('v1.'));
  assert.ok(!sealed.includes(s.fake.state.tokens.access));
  assert.ok(!JSON.stringify(c).includes(s.fake.state.tokens.access));
  assert.equal(s.fake.state.webhooks.length, 11);
  // Produktet med varianter findes i LAGER, med Shopify som master
  const m = s.lagerProduct('HOOD-M');
  assert.equal(m.name, 'Oversized Hoodie – M');
  assert.equal(m.source_of_truth, 'shopify');
  assert.equal(m.price_ore, 49900);
  assert.equal(s.onHand('HOOD-M'), 5);
  assert.equal(s.onHand('TOTE-1'), 23);
  assert.equal(s.lagerProduct('TOTE-1').name, 'Mulepose');
});

test('OAuth afviser forfalsket svar, genbrugt state og forkert butik', async () => {
  const s = await setupShop({ connect: false });
  const { state } = s.pos.startConnect(s.owner, 'shopify', { account: s.fake.state.shop });
  const q = s.fake.approveInstall(state);
  await assert.rejects(s.pos.completeConnect('shopify', { ...q, hmac: 'f'.repeat(64) }), /verificeres|Ugyldig/);
  await assert.rejects(s.pos.completeConnect('shopify', q), /Ugyldig eller udløbet/); // state er brugt
  assert.throws(() => s.pos.startConnect(s.owner, 'shopify', { account: 'evil.com' }), /Ugyldig butiksadresse/);
  assert.throws(() => s.pos.startConnect(s.owner, 'zettle', { account: 'x' }), /ikke bygget/);
  const u = s.platform.createUser('Ida', 'ida@example.dk');
  s.platform.inviteMember(s.owner, u, 'admin', ['lager']);
  assert.throws(() => s.pos.startConnect(s.platform.userActor(s.org.id, u.id), 'shopify', { account: s.fake.state.shop }), /Kun ejeren/);
});

test('2–6. Fysisk salg: synkroniseres én gang og fordeles korrekt til LAGER, PULS og INDSIGT', async () => {
  const s = await setupShop();
  const movesBefore = s.platform.repo(s.owner, 'lager').list('stock_movements').length;
  const sale = s.fake.sell({ lines: [{ variantId: s.seed.hv.M.id, qty: 1 }], locationId: s.seed.butik.id });
  // Kun ordre-webhooken først: LAGER må IKKE trække noget fra selv
  await s.deliver([sale.webhooks[0]]);
  assert.equal(s.onHand('HOOD-M'), 5);
  await s.deliver([sale.webhooks[1]]);
  assert.equal(s.onHand('HOOD-M'), 4, 'LAGER viser Shopifys beholdning, ikke dobbelt fratræk');
  assert.equal(s.platform.repo(s.owner, 'lager').list('stock_movements').length, movesBefore + 1);
  const mv = s.platform.repo(s.owner, 'lager').list('stock_movements').pop();
  assert.equal(mv.source, 'shopify'); assert.equal(mv.type, 'count'); assert.equal(mv.before, 5); assert.equal(mv.after, 4);

  const p = s.posViews.salesSummary(s.owner, TODAY);
  const g = p.byCurrency[0];
  assert.equal(g.orders, 1); assert.equal(g.posOrders, 1);
  assert.equal(g.salesExVatOre, 39920); assert.equal(g.vatOre, 9980);
  assert.match(p.definition, /IKKE modtagne betalinger/);

  const a = s.posViews.analysis(s.owner, TODAY).byCurrency[0];
  assert.equal(a.orders, 1); assert.equal(a.units, 1);
  assert.deepEqual(a.bySize.map((x) => [x.key, x.units]), [['M', 1]]);
  assert.equal(a.byLocation[0].key, 'Butik Aarhus (DEMO)');
  assert.equal(a.aovOre, 39920);
});

test('Rabat, moms og kanal: online-ordre adskilles fra kassesalg', async () => {
  const s = await setupShop();
  const r1 = s.fake.sell({ lines: [{ variantId: s.seed.hv.L.id, qty: 2 }], locationId: s.seed.butik.id, discountOre: 10000 });
  const r2 = s.fake.sell({ lines: [{ variantId: s.seed.tote.variants[0].id, qty: 1 }], channel: 'online' });
  await s.deliver([...r1.webhooks, ...r2.webhooks]);
  const g = s.posViews.salesSummary(s.owner, TODAY).byCurrency[0];
  assert.equal(g.posOrders, 1); assert.equal(g.onlineOrders, 1);
  assert.equal(g.discountsOre, 10000);
  // (2×499 − 100) inkl. moms = 898 → ekskl. 718,40 ; mulepose 129 → 103,20
  assert.equal(g.salesExVatOre, 71840 + 10320);
});

test('7. OVERBLIK modtager opgaveforslag ved lav beholdning – kan accepteres, afvises og redigeres', async () => {
  const s = await setupShop();
  const sale = s.fake.sell({ lines: [{ variantId: s.seed.hv.M.id, qty: 1 }], locationId: s.seed.butik.id });
  await s.deliver(sale.webhooks);
  s.pos.setDefaults(s.owner, s.connection.id, { lead_time_days: 7 });
  const run = await s.posWorkers.inventoryMonitor(s.org.id);
  assert.equal(run.status, 'succeeded');
  const risky = run.output.findings.filter((f) => ['runs_out_soon', 'below_min', 'out_of_stock'].includes(f.type));
  assert.deepEqual(risky.map((f) => f.name), ['Størrelse M i Oversized Hoodie']);
  assert.match(risky[0].observation, /4 stk\. tilbage og rækker ca\. 3 dage/);
  assert.equal(run.output.taskIds.length, 1);
  const task = s.platform.repo(s.owner, 'overblik').get('tasks', run.output.taskIds[0]);
  assert.equal(task.title, 'Størrelse M i Oversized Hoodie er ved at være udsolgt. Gennemgå indkøbsforslaget.');
  assert.equal(task.draft, true);
  assert.match(task.description, /Butik Aarhus \(DEMO\): 4 stk\./);
  assert.ok(run.output.approvalId);
  const apr = s.approvals.get(s.owner, run.output.approvalId);
  assert.match(apr.effect, /Intet sendes til leverandøren/);
  assert.equal(s.platform.listNotifications(s.owner).length, 1);

  // Ingen dublet ved ny kørsel
  const again = await s.posWorkers.inventoryMonitor(s.org.id);
  assert.equal(again.output.taskIds.length, 0);

  const edited = s.overblik.editDraft(s.owner, task.id, { title: 'Bestil flere hoodies i M', assignee_id: s.user.id, organization_id: 'hack' });
  assert.equal(edited.title, 'Bestil flere hoodies i M'); assert.equal(edited.organization_id, s.org.id);
  assert.equal(s.overblik.acceptDraft(s.owner, task.id).suggestion_status, 'accepted');
  assert.throws(() => s.overblik.rejectDraft(s.owner, task.id), /Kun forslag/);
});

test('Afviste opgaveforslag lukkes, og godkendelse giver kun en kladde', async () => {
  const s = await setupShop();
  s.pos.setDefaults(s.owner, s.connection.id, { lead_time_days: 7 });
  const run = await s.posWorkers.inventoryMonitor(s.org.id);
  const t = s.overblik.rejectDraft(s.owner, run.output.taskIds[0], 'Vi har bestilt');
  assert.equal(t.status, 'cancelled'); assert.equal(t.suggestion_status, 'rejected');
  s.approvals.decide(s.owner, run.output.approvalId, 'approved');
  const { result } = s.approvals.execute(s.owner, run.output.approvalId);
  assert.equal(result.status, 'draft'); assert.equal(result.sent, false);
  assert.equal(s.onHand('HOOD-M'), 5, 'kassens lager ændres ikke af et godkendt forslag');
});

test('8. Retur registreres: lager tilbage, salg reduceret, refusion vist', async () => {
  const s = await setupShop();
  const sale = s.fake.sell({ lines: [{ variantId: s.seed.hv.M.id, qty: 1 }], locationId: s.seed.butik.id });
  await s.deliver(sale.webhooks);
  assert.equal(s.onHand('HOOD-M'), 4);
  const r = s.fake.refund({ orderId: sale.order.id, qty: 1, restock: true });
  await s.deliver(r.webhooks);
  assert.equal(s.onHand('HOOD-M'), 5);
  const g = s.posViews.salesSummary(s.owner, TODAY).byCurrency[0];
  assert.equal(g.refundedOre, 49900);
  assert.equal(g.salesExVatOre, 0);
  const a = s.posViews.analysis(s.owner, TODAY).byCurrency[0];
  assert.equal(a.units, 0);
  const order = [...s.pos._debug.orders.values()].find((o) => o.external_id === sale.order.id);
  assert.equal(order.refunds.length, 1); assert.equal(order.refunds[0].lines[0].restockType, 'RETURN');
});

test('Delvis retur og annullering', async () => {
  const s = await setupShop();
  const sale = s.fake.sell({ lines: [{ variantId: s.seed.hv.S.id, qty: 3 }], locationId: s.seed.butik.id });
  await s.deliver(sale.webhooks);
  await s.deliver(s.fake.refund({ orderId: sale.order.id, qty: 1 }).webhooks);
  let a = s.posViews.analysis(s.owner, TODAY).byCurrency[0];
  assert.equal(a.units, 2);
  assert.equal(a.netOre, 2 * 39920);
  await s.deliver(s.fake.cancel(sale.order.id).webhooks);
  assert.equal(s.posViews.analysis(s.owner, TODAY).available, false);
  assert.equal(s.posViews.salesSummary(s.owner, TODAY).byCurrency[0].cancelled, 1);
  assert.equal(s.onHand('HOOD-S'), 12);
});

test('9. Gentaget webhook giver ingen dobbeltregistrering', async () => {
  const s = await setupShop();
  const sale = s.fake.sell({ lines: [{ variantId: s.seed.hv.M.id, qty: 1 }], locationId: s.seed.butik.id });
  await s.deliver(sale.webhooks);
  const moves = s.platform.repo(s.owner, 'lager').list('stock_movements').length;
  const orders = s.pos.listConnections(s.owner)[0].counts.orders;
  const dup = await s.deliver(sale.webhooks);
  assert.deepEqual(dup.map((d) => d.result), ['duplicate', 'duplicate']);
  // Samme hændelse med nyt leverings-id (fx anden subscription) er også harmløs
  const redelivered = sale.webhooks.map((h) => ({ ...h, headers: { ...h.headers, 'X-Shopify-Webhook-Id': `${h.headers['X-Shopify-Webhook-Id']}-2` } }));
  await s.deliver(redelivered);
  assert.equal(s.platform.repo(s.owner, 'lager').list('stock_movements').length, moves);
  assert.equal(s.pos.listConnections(s.owner)[0].counts.orders, orders);
  assert.equal(s.onHand('HOOD-M'), 4);
  assert.equal(s.posViews.salesSummary(s.owner, TODAY).byCurrency[0].orders, 1);
});

test('Webhook med forkert signatur afvises', async () => {
  const s = await setupShop();
  const h = s.fake.sell({ lines: [{ variantId: s.seed.hv.M.id, qty: 1 }], locationId: s.seed.butik.id }).webhooks[0];
  const forged = { ...h, rawBody: h.rawBody.replace('}', ',"x":1}') };
  assert.equal(s.pos.receiveWebhook('shopify', forged).status, 401);
  assert.equal(s.pos.receiveWebhook('shopify', { ...h, headers: { ...h.headers, 'X-Shopify-Hmac-Sha256': undefined } }).status, 401);
});

test('10. Afbrydelse stopper fremtidig datadeling og sletter adgangsnøglen', async () => {
  const s = await setupShop();
  const c = s.pos.disconnect(s.owner, s.connection.id);
  assert.equal(c.status, 'disconnected');
  assert.equal(c.has_credentials, false);
  assert.ok(c.disconnect_consequences.length >= 4);
  const sale = s.fake.sell({ lines: [{ variantId: s.seed.hv.M.id, qty: 1 }], locationId: s.seed.butik.id });
  const res = await s.deliver(sale.webhooks);
  assert.deepEqual(res.map((r) => r.result), ['ignored', 'ignored']);
  assert.equal(s.onHand('HOOD-M'), 5);
  assert.equal(s.posViews.salesSummary(s.owner, TODAY).available, false);
  await assert.rejects(s.pos.runSync(s.owner, s.connection.id), /afbrudt/);
  // Historiske data markeres
  assert.equal(s.posViews.salesSummary(s.owner, { from: '2026-10-01', to: '2026-11-04' }).sources[0].historical, true);
  // Afbryd og slet
  const s2 = await setupShop();
  s2.pos.disconnect(s2.owner, s2.connection.id, { deleteData: true });
  assert.equal(s2.posViews.salesSummary(s2.owner, { from: '2026-10-01', to: '2026-11-04' }).available, false);
});

test('Ejeren styrer, hvilke apps der får kassedata', async () => {
  const s = await setupShop({ targets: { puls: false } });
  assert.equal(s.posViews.salesSummary(s.owner, { from: '2026-10-01', to: '2026-11-04' }).available, false);
  assert.ok(s.posViews.analysis(s.owner, { from: '2026-10-01', to: '2026-11-04' }).available);
  s.pos.setTargets(s.owner, s.connection.id, { puls: true });
  assert.ok(s.posViews.salesSummary(s.owner, { from: '2026-10-01', to: '2026-11-04' }).available);
  // LAGER slået fra fra starten: ingen varer i LAGER; slås til -> varer og lager kommer
  const s2 = await setupShop({ targets: { lager: false } });
  assert.equal(s2.platform.repo(s2.owner, 'lager').list('products').length, 0);
  s2.pos.setTargets(s2.owner, s2.connection.id, { lager: true });
  assert.equal(s2.onHand('HOOD-M'), 5);
});

test('Flere lokationer: beholdning pr. lokation og samlet', async () => {
  const s = await setupShop();
  assert.equal(s.onHand('HOOD-L', 'Butik Aarhus (DEMO)'), 13);
  assert.equal(s.onHand('HOOD-L', 'Baglager (DEMO)'), 10);
  assert.equal(s.onHand('HOOD-L'), 23);
});

test('Tidszone: salg kl. 00:30 dansk tid tæller på den danske dato', async () => {
  const s = await setupShop();
  s.clock.set('2026-11-05T23:30:00Z');
  const sale = s.fake.sell({ lines: [{ variantId: s.seed.hv.S.id, qty: 1 }], locationId: s.seed.butik.id });
  await s.deliver(sale.webhooks);
  assert.equal(s.posViews.salesSummary(s.owner, { from: '2026-11-06', to: '2026-11-06' }).byCurrency[0].orders, 1);
  assert.equal(s.posViews.salesSummary(s.owner, TODAY).available, false);
});

test('Tokens fornyes automatisk, og throttling/serverfejl håndteres', async () => {
  const s = await setupShop();
  s.clock.addMinutes(120); // adgangen er udløbet (1 time)
  s.fake.state.throttleNext = 1; s.fake.state.failNext = 1;
  const run = await s.pos.runSync(s.owner, s.connection.id, { mode: 'reconcile' });
  assert.equal(run.status, 'succeeded');
  assert.ok(s.fake.state.calls.some((c) => c.kind === 'token' && c.grant === 'refresh_token'));
});

test('Tilbagekaldt adgang giver "Kræver handling" – ingen falsk succes', async () => {
  const s = await setupShop();
  s.fake.state.tokens.access = 'revoked'; s.fake.state.tokens.expires = Date.parse('2027-01-01');
  const run = await s.pos.runSync(s.owner, s.connection.id, { mode: 'reconcile' });
  assert.equal(run.status, 'failed');
  const c = s.pos.listConnections(s.owner)[0];
  assert.equal(c.status, 'requires_action'); assert.equal(c.status_label, 'Kræver handling');
  assert.match(c.last_error, /Forbind butikken igen/);
});

test('Løbende synk og afstemning henter ordrer, som webhooks missede', async () => {
  const s = await setupShop();
  s.clock.addMinutes(30);
  s.fake.sell({ lines: [{ variantId: s.seed.hv.XL.id, qty: 1 }], locationId: s.seed.butik.id }); // webhooks går tabt
  const inc = await s.pos.runSync(s.owner, s.connection.id, { mode: 'incremental' });
  assert.equal(inc.counts.orders, 1);
  assert.equal(s.posViews.salesSummary(s.owner, TODAY).byCurrency[0].orders, 1);
  const rec = await s.pos.runSync(s.owner, s.connection.id, { mode: 'reconcile' });
  assert.equal(rec.counts.orders, 0); // intet nyt, ingen dubletter
  assert.equal(s.onHand('HOOD-XL'), 6); // lager rettes ved afstemning
});

test('Ældre version af en ordre overskriver ikke en nyere', async () => {
  const s = await setupShop();
  const sale = s.fake.sell({ lines: [{ variantId: s.seed.hv.S.id, qty: 2 }], locationId: s.seed.butik.id });
  await s.deliver(sale.webhooks);
  const { normalizeOrder } = require('../src/pos/connectors/shopify');
  const { Q } = require('../src/pos/connectors/shopify');
  const old = normalizeOrder((await (await s.fake.fetch(`https://${s.fake.state.shop}/admin/api/2026-10/graphql.json`, { method: 'POST', headers: { 'x-shopify-access-token': s.fake.state.tokens.access }, body: JSON.stringify({ query: Q.order, variables: { id: sale.order.id } }) })).json()).data.order);
  s.clock.addMinutes(5);
  await s.deliver(s.fake.refund({ orderId: sale.order.id, qty: 1 }).webhooks);
  const r = s.pos._debug.upsertOrder(s.connection.id, old); // forsinket, gammel version
  assert.equal(r.skipped, 'older');
  const o = [...s.pos._debug.orders.values()].find((x) => x.external_id === sale.order.id);
  assert.equal(o.lines[0].currentQuantity, 1);
});

test('Anden virksomhed kan ikke se forbindelsen eller kassedata', async () => {
  const s = await setupShop();
  const u = s.platform.createUser('Anden', 'anden@example.dk');
  const org2 = s.platform.createOrganization('Anden ApS', 'detail', u);
  const o2 = s.platform.userActor(org2.id, u.id);
  for (const m of ['puls', 'indsigt', 'lager']) s.platform.activateModule(o2, m);
  assert.equal(s.pos.listConnections(o2).length, 0);
  assert.equal(s.posViews.salesSummary(o2, { from: '2026-10-01', to: '2026-11-05' }).available, false);
  assert.throws(() => s.pos.disconnect(o2, s.connection.id), /findes ikke/);
  assert.throws(() => s.pos.setTargets(o2, s.connection.id, { puls: false }), /findes ikke/);
  await assert.rejects(s.pos.runSync(o2, s.connection.id), /findes ikke/);
});

test('Sales Monitor og Business Insights: tal fra kode, tydeligt datagrundlag', async () => {
  const s = await setupShop();
  const cur = { from: '2026-10-22', to: '2026-11-04' }, prev = { from: '2026-10-08', to: '2026-10-21' };
  const sm = await s.posWorkers.salesMonitor(s.org.id, { current: cur, previous: prev });
  assert.equal(sm.status, 'succeeded');
  assert.ok(sm.output.findings.some((f) => f.type === 'category_growth' && /T-shirts/.test(f.observation)));
  assert.ok(sm.output.findings.find((f) => f.type === 'top_seller'));
  const bi = await s.posWorkers.businessInsights(s.org.id, { current: cur, previous: prev });
  const rep = bi.output.reports[0];
  assert.match(rep.conclusion, /Salget ekskl\. moms blev/);
  assert.ok(rep.changes.some((c) => c.category === 'T-shirts' && c.direction === 'vækst'));
  assert.ok(rep.uncertainty.some((u) => /ikke hvorfor/.test(u)));
  assert.equal(bi.run_cost, undefined); assert.equal(bi.cost_ore, 0); assert.equal(bi.model, null);
  // Uafhængig kontrol af tal: salg ekskl. moms = sum af ordrernes (subtotal - moms)
  const raw = [...s.pos._debug.orders.values()].filter((o) => !o.cancelled_at && o.processed_at >= '2026-10-21T22:00:00Z' && o.processed_at < '2026-11-04T23:00:00Z');
  const expected = raw.reduce((a, o) => a + o.totals.currentSubtotalOre - o.totals.currentTaxOre, 0);
  assert.equal(s.posViews.analysis(s.owner, cur).byCurrency[0].netOre, expected);
});

test('Worker uden aktiv app stopper med forklaring', async () => {
  const s = await setupShop({ modules: ['lager', 'puls'] });
  const r = await s.posWorkers.salesMonitor(s.org.id, { current: TODAY, previous: TODAY });
  assert.equal(r.status, 'skipped'); assert.match(r.reason, /INDSIGT er ikke aktiveret/);
  s.pos.setDefaults(s.owner, s.connection.id, { lead_time_days: 7 });
  const inv = await s.posWorkers.inventoryMonitor(s.org.id);
  assert.equal(inv.output.taskIds.length, 0);
  assert.match(inv.output.skipped, /OVERBLIK/);
  assert.ok(inv.output.approvalId, 'indkøbsforslaget laves stadig i LAGER');
});

test('Operations Worker følger op på ventende forslag', async () => {
  const s = await setupShop();
  s.pos.setDefaults(s.owner, s.connection.id, { lead_time_days: 7 });
  await s.posWorkers.inventoryMonitor(s.org.id);
  s.clock.addMinutes(60 * 24 * 4);
  const r = await s.posWorkers.operations(s.org.id);
  assert.deepEqual(r.output.messages, ['1 opgaveforslag har ventet mere end 3 dage.', '1 forslag afventer din godkendelse.']);
});
