'use strict';
// Udviklingsserver for Integrationscenteret (Kassesystemer).
// ADVARSEL: Der er endnu intet login. Serveren bruger én fast udviklingssession
// og må ikke køre offentligt. Den nægter at starte med NODE_ENV=production.
//
// Kør demo uden nøgler:    DEMO=1 node server.js
// Kør mod rigtig Shopify:  se docs/POS_INTEGRATION.md (kræver Partner-app og HTTPS-adresse)

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createEcosystem } = require('./src');
const { newKey } = require('./src/pos/crypto');
const { createFakeShopify } = require('./src/pos/demo/fake-shopify');
const { seedClothingStore } = require('./src/pos/demo/seed');
const { WORKER_REGISTRY } = require('./src/pos/workers');
const { PAYMENT_WORKERS } = require('./src/payments/workers');
const { createFakeSumUp } = require('./src/payments/demo/fake-sumup');

if (process.env.NODE_ENV === 'production') {
  console.error('Stop: serveren har endnu ikke login og må ikke køre i produktion.');
  process.exit(1);
}

const DEMO = process.env.DEMO === '1';
const PORT = Number(process.env.PORT || 4100);
const HOST = process.env.HOST || '127.0.0.1';
const APP_URL = (process.env.APP_URL || `http://${HOST}:${PORT}`).replace(/\/$/, '');
let vaultKey = process.env.TOKEN_ENCRYPTION_KEY;
if (!vaultKey) { vaultKey = newKey(); console.warn('TOKEN_ENCRYPTION_KEY mangler: bruger en midlertidig nøgle. Tokens overlever ikke en genstart.'); }

// ---------- Opsætning ----------
let fake = null, seed = null;
const clock = { now: () => new Date() };
let shopifyConfig = { clientId: process.env.SHOPIFY_CLIENT_ID, clientSecret: process.env.SHOPIFY_CLIENT_SECRET };
if (DEMO) {
  let t = Date.parse('2026-10-01T09:00:00Z');
  const demoClock = { now: () => new Date(t), set: (i) => { t = Date.parse(i); } };
  let seeding = true;
  fake = createFakeShopify({ clientSecret: 'demo-secret', now: () => (seeding ? demoClock.now() : new Date()) });
  seed = seedClothingStore(fake, demoClock);
  seeding = false;
  shopifyConfig = { clientId: 'demo-client-id', clientSecret: 'demo-secret', fetch: fake.fetch };
}

let sumupConfig = { clientId: process.env.SUMUP_CLIENT_ID, clientSecret: process.env.SUMUP_CLIENT_SECRET };
let fakeSumUp = null;
if (DEMO) { fakeSumUp = createFakeSumUp({ now: () => new Date() }); sumupConfig = { clientId: 'demo', clientSecret: 'demo', fetch: fakeSumUp.fetch }; }

const eco = createEcosystem({ now: clock.now, payments: { sumup: sumupConfig }, pos: { vaultKey, webhookUri: APP_URL.startsWith('https://') ? `${APP_URL}/webhooks/shopify` : null, shopify: shopifyConfig } });
eco.pos.setRedirectUri('shopify', `${APP_URL}/integrations/shopify/callback`);
const { platform, pos, posViews, posWorkers, overblik, approvals, payments, paymentViews, paymentWorkers } = eco;
const user = platform.createUser(DEMO ? 'Mikkel (DEMO)' : 'Udvikler', 'dev@example.dk');
const org = platform.createOrganization(DEMO ? 'Demo Tøjbutik ApS (DEMO)' : 'Udviklingsvirksomhed', 'detail', user);
const owner = platform.userActor(org.id, user.id);
for (const m of ['lager', 'puls', 'indsigt', 'overblik']) platform.activateModule(owner, m);

// ---------- Hjælpere ----------
const send = (res, status, body, headers = {}) => {
  const json = typeof body !== 'string';
  res.writeHead(status, { 'content-type': json ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(json ? JSON.stringify(body) : body);
};
function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('For stor forespørgsel')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Copenhagen' }).format(new Date());
const daysAgo = (n) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Copenhagen' }).format(new Date(Date.now() - n * 86400000));

function state() {
  const conns = pos.listConnections(owner).map((c) => ({ ...c, history: pos.syncHistory(owner, c.id).slice(-5).reverse() }));
  const lagerRepo = platform.repo(owner, 'lager');
  const lowStock = lagerRepo.list('products', (p) => p.external_ref && p.status === 'active')
    .map((p) => ({ name: p.name, sku: p.sku, onHand: eco.lager.onHand(owner, p.id), min: p.min_stock }))
    .filter((p) => p.onHand <= p.min).slice(0, 5);
  const last30 = { from: daysAgo(29), to: today() };
  const sales = posViews.salesSummary(owner, { from: today(), to: today() });
  const analysis = posViews.analysis(owner, last30);
  const suggestions = overblik.listTasks(owner).filter((t) => t.draft && t.suggestion_status === 'proposed');
  return {
    session: { organization: org.name, user: user.name, demo: DEMO, devOnly: true },
    modules: platform.activeModules(org.id),
    providers: pos.providers(), connections: conns,
    workers: WORKER_REGISTRY.map((w) => ({ ...w, lastRun: posWorkers.runs(org.id).filter((r) => r.worker === w.id).pop() || null })),
    apps: {
      lager: { lowStock, products: lagerRepo.list('products', (p) => p.external_ref).length },
      puls: sales.available ? { today: sales.byCurrency[0].labels.salesExVat, orders: sales.byCurrency[0].orders, refunded: sales.byCurrency[0].labels.refunded, definition: sales.definition } : { message: sales.message },
      indsigt: analysis.available ? { period: last30, top: analysis.byCurrency[0].topProducts.slice(0, 3).map((p) => ({ title: p.title, units: p.units })), bySize: (analysis.byCurrency[0].bySize || []).slice(0, 5), aov: analysis.byCurrency[0].aov } : { message: analysis.message },
      overblik: { suggestions: suggestions.map((t) => ({ id: t.id, title: t.title, description: t.description })) },
    },
    notifications: platform.listNotifications(owner).slice(-5).reverse(),
    demoVariants: DEMO ? seed.hoodie.variants.map((v) => ({ id: v.id, label: `Oversized Hoodie – ${v.title}` })).concat(seed.tee.variants.map((v) => ({ id: v.id, label: `Basic T-shirt – ${v.title}` }))) : [],
  };
}

function paymentsState() {
  const conns = payments.listConnections(owner).map((c) => ({ ...c, imports: c.kind === 'file' ? payments.importHistory(owner, c.id).slice(0, 5).map(({ errors, ...i }) => i) : [], history: c.kind === 'api' ? payments.syncHistory(owner, c.id).slice(-5).reverse() : [] }));
  const posLocations = [...pos.dataFor(org.id, 'puls').locations.values()].map((l) => ({ id: l.external_id, name: l.name }));
  return { session: { organization: org.name, demo: DEMO }, modules: platform.activeModules(org.id), providers: payments.providers(), connections: conns, posLocations,
    workers: PAYMENT_WORKERS.map((w) => ({ ...w, lastRun: paymentWorkers.runs(org.id).filter((r) => r.worker === w.id).pop() || null })) };
}

// DEMO: SumUp-transaktioner, der svarer til de seneste kortbetalinger i demo-kassen.
async function seedDemoSumUp() {
  const data = pos.dataFor(org.id, 'puls');
  const pays = data.orders.flatMap((o) => (o.payments || []).filter((p) => p.kind === 'SALE' && p.method !== 'cash').map((p) => ({ o, p })))
    .filter(({ p }) => Date.parse(p.processedAt) > Date.now() - 9 * 86400000).sort((a, b) => a.p.processedAt.localeCompare(b.p.processedAt));
  pays.forEach(({ o, p }, i) => {
    const t = fakeSumUp.pay({ amountOre: p.amountOre, at: new Date(Date.parse(p.processedAt) + 35000).toISOString(), card: ['VISA', 'MASTERCARD', 'VISA', 'MAESTRO'][i % 4] });
    if (i < pays.length - 3) { const fo = fake.state.orders.get(o.external_id); const ft = fo._tx.find((x) => x.id === p.externalId); ft.paymentId = t.transaction_code; }
  });
  const codes = fakeSumUp.state.tx.filter((t) => Date.parse(t.timestamp) < Date.now() - 4 * 86400000).map((t) => t.transaction_code);
  const byDay = new Map();
  for (const c of codes) { const d = fakeSumUp.state.tx.find((t) => t.transaction_code === c).timestamp.slice(0, 10); byDay.set(d, [...(byDay.get(d) || []), c]); }
  for (const [d, cs] of byDay) fakeSumUp.payout({ date: new Date(Date.parse(d) + 2 * 86400000).toISOString().slice(0, 10), reference: `PO-${d.replace(/-/g, '')}`, codes: cs });
  fakeSumUp.pay({ amountOre: 34900, at: new Date(Date.now() - 26 * 3600000).toISOString(), card: 'MASTERCARD' });
  fakeSumUp.pay({ amountOre: 49900, at: new Date(Date.now() - 50 * 3600000).toISOString(), type: 'CHARGE_BACK' });
  for (const c of pos.listConnections(owner)) await pos.runSync(owner, c.id, { mode: 'reconcile' });
}

const NETS_SAMPLE = ['Transaktions-ID;Dato;Tid;Beløb;Valuta;Korttype;Terminal;Forretningsnr;Type;Gebyr;Udbetalingsdato;Kortnummer',
  'N-DEMO-1001;06-11-2026;10:12;899,00;DKK;Visa/Dankort;T-AARHUS-1;5551234;Køb;1,80;09-11-2026;',
  'N-DEMO-1002;06-11-2026;11:40;249,00;DKK;Dankort;T-AARHUS-1;5551234;Køb;0,50;09-11-2026;',
  'N-DEMO-1003;06-11-2026;12:05;-249,00;DKK;Dankort;T-AARHUS-1;5551234;Retur;;;',
  'N-DEMO-1004;31-11-2026;13:00;100,00;DKK;Visa;T-AARHUS-2;5551234;Køb;;;',
  'N-DEMO-1005;06-11-2026;14:20;1.299,00;DKK;Mastercard;T-AARHUS-2;5551234;Køb;3,25;;4571 9999 9999 9999'].join('\n');

async function paymentsApi(req, res, url, body) {
  const m = url.pathname.match(/^\/api\/payments\/connections\/([\w-]+)\/(sync|targets|disconnect|lag)$/);
  if (req.method === 'GET' && url.pathname === '/api/payments/state') return send(res, 200, paymentsState());
  if (req.method === 'POST' && url.pathname === '/api/payments/connect') {
    if (body.provider === 'nets') return send(res, 200, payments.createFileConnection(owner, 'nets', { label: body.label || 'Nets / MyNets', targets: body.targets }));
    const { authUrl, state: st } = payments.startConnect(owner, body.provider, { targets: body.targets, redirectUri: `${APP_URL}/integrations/${body.provider}/callback` });
    if (DEMO && body.provider === 'sumup') {
      await seedDemoSumUp();
      const c = await payments.completeConnect('sumup', fakeSumUp.approve(st), { demo: true });
      await payments.runSync(owner, c.id, { mode: 'initial' });
      return send(res, 200, { connected: true, demo: true });
    }
    return send(res, 200, { authUrl });
  }
  if (m && req.method === 'POST') {
    const [, id, action] = m;
    if (action === 'sync') return send(res, 200, await payments.runSync(owner, id, { mode: body.mode || 'incremental' }));
    if (action === 'targets') return send(res, 200, payments.setTargets(owner, id, body.targets || {}));
    if (action === 'lag') return send(res, 200, payments.setPayoutLag(owner, id, Number(body.days)));
    if (action === 'disconnect') return send(res, 200, payments.disconnect(owner, id, { deleteData: !!body.deleteData }));
  }
  if (req.method === 'POST' && url.pathname === '/api/payments/imports/preview') {
    if (body.previousId) { try { payments.cancelImport(owner, body.previousId); } catch { /* allerede afsluttet */ } }
    return send(res, 200, payments.previewImport(owner, body.connectionId, String(body.text || ''), { mapping: body.mapping || null, fileName: body.fileName }));
  }
  const im = url.pathname.match(/^\/api\/payments\/imports\/([\w-]+)\/(confirm|cancel)$/);
  if (im && req.method === 'POST') return send(res, 200, im[2] === 'confirm' ? payments.confirmImport(owner, im[1]) : payments.cancelImport(owner, im[1]));
  const tm = url.pathname.match(/^\/api\/payments\/terminals\/([\w-]+)\/map$/);
  if (tm && req.method === 'POST') return send(res, 200, payments.mapTerminal(owner, tm[1], body.location || null));
  if (req.method === 'GET' && url.pathname === '/api/puls/payments') {
    return send(res, 200, { session: { organization: org.name, demo: DEMO }, dashboard: paymentViews.dashboard(owner, { today: today(), period: { from: daysAgo(29), to: today() } }), worklist: paymentViews.worklist(owner),
      workers: PAYMENT_WORKERS.map((w) => ({ ...w, lastRun: paymentWorkers.runs(org.id).filter((r) => r.worker === w.id).pop() || null })) });
  }
  if (req.method === 'POST' && url.pathname === '/api/payments/decide') return send(res, 200, payments.decide(owner, body.key, body.decision, { txKey: body.txKey, note: body.note || '' }) || {});
  const wm = url.pathname.match(/^\/api\/payments\/workers\/([\w-]+)\/run$/);
  if (wm && req.method === 'POST') {
    const fn = { 'payment-reconciliation': () => paymentWorkers.reconciliation(org.id), 'settlement-monitor': () => paymentWorkers.settlementMonitor(org.id),
      'payment-insights': () => paymentWorkers.insights(org.id, { current: { from: daysAgo(13), to: today() }, previous: { from: daysAgo(27), to: daysAgo(14) } }) }[wm[1]];
    if (!fn) return send(res, 404, { error: 'Ukendt worker' });
    return send(res, 200, await fn());
  }
  if (DEMO && req.method === 'GET' && url.pathname === '/api/payments/demo-file') return send(res, 200, { text: NETS_SAMPLE, fileName: 'mynets-demo.csv' });
  return null;
}

async function api(req, res, url) {
  // Simpel CSRF-beskyttelse: kun JSON fra samme oprindelse.
  if (req.method === 'POST') {
    const origin = req.headers.origin;
    if (origin && origin !== `http://${req.headers.host}` && origin !== APP_URL) return send(res, 403, { error: 'Ugyldig oprindelse' });
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) return send(res, 415, { error: 'Brug JSON' });
  }
  const body = req.method === 'POST' ? JSON.parse((await readBody(req, 12_000_000)).toString('utf8') || '{}') : {};
  const m = url.pathname.match(/^\/api\/connections\/([\w-]+)\/(sync|targets|defaults|disconnect)$/);
  try {
    if (url.pathname.startsWith('/api/payments') || url.pathname.startsWith('/api/puls')) { const r = await paymentsApi(req, res, url, body); if (r !== null) return; }
    if (req.method === 'GET' && url.pathname === '/api/state') return send(res, 200, state());
    if (req.method === 'POST' && url.pathname === '/api/connect') {
      const { authUrl, state: st } = pos.startConnect(owner, body.provider, { account: body.shop, targets: body.targets });
      if (DEMO) {
        // DEMO: simulerer at ejeren godkender appen i Shopify.
        const c = await pos.completeConnect('shopify', fake.approveInstall(st), { demo: true });
        await pos.runSync(owner, c.id, { mode: 'initial' });
        return send(res, 200, { connected: true, demo: true });
      }
      return send(res, 200, { authUrl });
    }
    if (m && req.method === 'POST') {
      const [, id, action] = m;
      if (action === 'sync') return send(res, 200, await pos.runSync(owner, id, { mode: body.mode || 'reconcile' }));
      if (action === 'targets') return send(res, 200, pos.setTargets(owner, id, body.targets || {}));
      if (action === 'defaults') return send(res, 200, pos.setDefaults(owner, id, body));
      if (action === 'disconnect') return send(res, 200, pos.disconnect(owner, id, { deleteData: !!body.deleteData }));
    }
    const w = url.pathname.match(/^\/api\/workers\/([\w-]+)\/run$/);
    if (w && req.method === 'POST') {
      const cur = { from: daysAgo(13), to: today() }, prev = { from: daysAgo(27), to: daysAgo(14) };
      const fn = { 'sales-monitor': () => posWorkers.salesMonitor(org.id, { current: cur, previous: prev }), 'inventory-monitor': () => posWorkers.inventoryMonitor(org.id),
        'business-insights': () => posWorkers.businessInsights(org.id, { current: cur, previous: prev }), operations: () => posWorkers.operations(org.id) }[w[1]];
      if (!fn) return send(res, 404, { error: 'Ukendt worker' });
      return send(res, 200, await fn());
    }
    const t = url.pathname.match(/^\/api\/tasks\/([\w-]+)\/(accept|reject|edit)$/);
    if (t && req.method === 'POST') {
      const r = t[2] === 'accept' ? overblik.acceptDraft(owner, t[1]) : t[2] === 'reject' ? overblik.rejectDraft(owner, t[1], body.reason) : overblik.editDraft(owner, t[1], body);
      return send(res, 200, r);
    }
    if (DEMO && req.method === 'POST' && url.pathname === '/api/demo/sale') {
      const sale = fake.sell({ lines: [{ variantId: body.variantId, qty: Math.max(1, Math.min(5, Number(body.qty) || 1)) }], locationId: seed.butik.id });
      const before = state().apps;
      for (const h of sale.webhooks) pos.receiveWebhook('shopify', h);
      await pos.processQueue();
      return send(res, 200, { order: sale.order.name, webhooks: sale.webhooks.length, before: before.puls, after: state().apps.puls });
    }
    return send(res, 404, { error: 'Findes ikke' });
  } catch (e) {
    return send(res, e.code === 'FORBIDDEN' ? 403 : e.code === 'NOT_FOUND' ? 404 : 400, { error: e.message });
  }
}

const UI = path.join(__dirname, 'ui');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const SECURITY_HEADERS = {
  'content-security-policy': "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === '/healthz') return send(res, 200, { ok: true, demo: DEMO });
    if (url.pathname === '/webhooks/shopify' && req.method === 'POST') {
      const raw = await readBody(req);
      const r = pos.receiveWebhook('shopify', { headers: req.headers, rawBody: raw });
      send(res, r.status, { result: r.result });
      setImmediate(() => pos.processQueue().catch((e) => console.error('Webhook-kø fejlede:', e.message)));
      return;
    }
    if (url.pathname === '/integrations/shopify/callback') {
      try {
        const c = await pos.completeConnect('shopify', Object.fromEntries(url.searchParams));
        pos.runSync(owner, c.id, { mode: 'initial' }).catch((e) => console.error('Første synk fejlede:', e.message));
        res.writeHead(302, { location: '/integrationer/kassesystemer?forbundet=1' }); return res.end();
      } catch (e) { res.writeHead(302, { location: `/integrationer/kassesystemer?fejl=${encodeURIComponent(e.message)}` }); return res.end(); }
    }
    if (url.pathname.startsWith('/api/')) return api(req, res, url);
    if (url.pathname === '/integrations/sumup/callback') {
      try {
        const c = await payments.completeConnect('sumup', Object.fromEntries(url.searchParams));
        payments.runSync(owner, c.id, { mode: 'initial' }).catch((e) => console.error('Første betalingssynk fejlede:', e.message));
        res.writeHead(302, { location: '/integrationer/betalinger?forbundet=1' }); return res.end();
      } catch (e) { res.writeHead(302, { location: `/integrationer/betalinger?fejl=${encodeURIComponent(e.message)}` }); return res.end(); }
    }
    const PAGES = { '/integrationer/betalinger': 'payments-integrations.html', '/puls/betalinger': 'puls-payments.html' };
    if (PAGES[url.pathname]) return send(res, 200, fs.readFileSync(path.join(UI, PAGES[url.pathname]), 'utf8'), { 'content-type': TYPES['.html'], ...SECURITY_HEADERS });
    if (url.pathname === '/' || url.pathname === '/integrationer' || url.pathname === '/integrationer/kassesystemer') {
      return send(res, 200, fs.readFileSync(path.join(UI, 'integrations.html'), 'utf8'), { 'content-type': TYPES['.html'], ...SECURITY_HEADERS });
    }
    const file = path.normalize(path.join(UI, url.pathname.replace(/^\/ui\//, '')));
    if (url.pathname.startsWith('/ui/') && file.startsWith(UI) && fs.existsSync(file)) {
      return send(res, 200, fs.readFileSync(file, 'utf8'), { 'content-type': TYPES[path.extname(file)] || 'text/plain', ...SECURITY_HEADERS });
    }
    send(res, 404, 'Findes ikke');
  } catch (e) { console.error(e); send(res, 500, { error: 'Serverfejl' }); }
});

// Løbende synk hvert 15. minut og genforsøg af webhooks hvert 30. sekund.
// (I produktion: et rigtigt jobsystem med kø, overvågning og stop-mulighed.)
setInterval(() => { for (const c of pos.listConnections(owner)) if (c.status === 'connected') pos.runSync(null, c.id, { mode: 'incremental' }).catch(() => {}); }, 15 * 60000).unref();
setInterval(() => pos.processQueue().catch(() => {}), 30000).unref();
// Betalinger: SumUp har ingen webhooks for terminalbetalinger, så vi henter hvert 15. minut.
setInterval(() => { for (const c of payments.listConnections(owner)) if (c.kind === 'api' && c.status === 'connected') payments.runSync(null, c.id).catch(() => {}); }, 15 * 60000).unref();

server.listen(PORT, HOST, () => console.log(`Integrationscenter: http://${HOST}:${PORT}/integrationer/kassesystemer${DEMO ? '  (DEMO-tilstand)' : ''}`));
module.exports = { server };
