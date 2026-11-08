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

const eco = createEcosystem({ now: clock.now, pos: { vaultKey, webhookUri: APP_URL.startsWith('https://') ? `${APP_URL}/webhooks/shopify` : null, shopify: shopifyConfig } });
eco.pos.setRedirectUri('shopify', `${APP_URL}/integrations/shopify/callback`);
const { platform, pos, posViews, posWorkers, overblik, approvals } = eco;
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

async function api(req, res, url) {
  // Simpel CSRF-beskyttelse: kun JSON fra samme oprindelse.
  if (req.method === 'POST') {
    const origin = req.headers.origin;
    if (origin && origin !== `http://${req.headers.host}` && origin !== APP_URL) return send(res, 403, { error: 'Ugyldig oprindelse' });
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) return send(res, 415, { error: 'Brug JSON' });
  }
  const body = req.method === 'POST' ? JSON.parse((await readBody(req)).toString('utf8') || '{}') : {};
  const m = url.pathname.match(/^\/api\/connections\/([\w-]+)\/(sync|targets|defaults|disconnect)$/);
  try {
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

server.listen(PORT, HOST, () => console.log(`Integrationscenter: http://${HOST}:${PORT}/integrationer/kassesystemer${DEMO ? '  (DEMO-tilstand)' : ''}`));
module.exports = { server };
