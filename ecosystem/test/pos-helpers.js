'use strict';
const { createEcosystem } = require('../src');
const { createFakeShopify } = require('../src/pos/demo/fake-shopify');
const { seedClothingStore } = require('../src/pos/demo/seed');
const { newKey } = require('../src/pos/crypto');

const SECRET = 'demo-client-secret';

async function setupShop({ modules = ['overblik', 'puls', 'lager', 'indsigt'], targets, connect = true } = {}) {
  let t = Date.parse('2026-10-01T09:00:00Z');
  const clock = { now: () => new Date(t), set: (i) => { t = Date.parse(i); }, addMinutes: (m) => { t += m * 60000; } };
  const fake = createFakeShopify({ clientSecret: SECRET, now: clock.now });
  const seed = seedClothingStore(fake, clock);
  clock.set('2026-11-05T09:00:00Z');
  const eco = createEcosystem({ now: clock.now, pos: {
    vaultKey: newKey(), webhookUri: 'https://app.example.dk/webhooks/shopify',
    shopify: { clientId: 'demo-client-id', clientSecret: SECRET, fetch: fake.fetch, sleep: async () => {} },
  } });
  const user = eco.platform.createUser('Mikkel (DEMO)', 'mikkel@example.dk');
  const org = eco.platform.createOrganization('Demo Tøjbutik ApS (DEMO)', 'detail', user);
  const owner = eco.platform.userActor(org.id, user.id);
  for (const m of modules) eco.platform.activateModule(owner, m);
  let connection = null;
  if (connect) {
    const { state } = eco.pos.startConnect(owner, 'shopify', { account: fake.state.shop, targets });
    connection = await eco.pos.completeConnect('shopify', fake.approveInstall(state));
    await eco.pos.runSync(null, connection.id, { mode: 'initial' });
  }
  async function deliver(hooks) {
    const results = hooks.map((h) => eco.pos.receiveWebhook('shopify', h));
    await eco.pos.processQueue();
    return results;
  }
  const lagerActor = () => eco.platform.workerActor(org.id, 'test-reader', { module: 'lager', actions: ['read'] });
  function lagerProduct(sku) { return eco.platform.repo(owner, 'lager').list('products', (p) => p.sku === sku)[0]; }
  function onHand(sku, locationName) {
    const p = lagerProduct(sku);
    if (!locationName) return eco.lager.onHand(owner, p.id);
    const loc = eco.platform.repo(owner, 'lager').list('locations', (l) => l.name === locationName)[0];
    return eco.lager.onHand(owner, p.id, loc.id);
  }
  return { ...eco, clock, fake, seed, org, owner, user, connection, deliver, lagerActor, lagerProduct, onHand };
}

module.exports = { setupShop, SECRET };
