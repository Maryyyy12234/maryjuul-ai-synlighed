'use strict';
const { createPlatform } = require('./platform');
const { createApprovals } = require('./approvals');
const { createLager } = require('./lager');
const { createPuls } = require('./puls');
const { createOverblik } = require('./overblik');
const { createIndsigt } = require('./indsigt');
const { createWorkers } = require('./workers');
const { createConnectorRegistry } = require('./pos/connectors');
const { createPosEngine } = require('./pos/engine');
const { createPosViews } = require('./pos/views');
const { createPosWorkers } = require('./pos/workers');
const { createVault } = require('./pos/crypto');

function createEcosystem(opts = {}) {
  const platform = createPlatform(opts);
  const approvals = createApprovals(platform);
  const lager = createLager(platform);
  const puls = createPuls(platform);
  const overblik = createOverblik(platform);
  const indsigt = createIndsigt(platform, { puls });
  const workers = createWorkers(platform, { lager, overblik, approvals });

  // Godkendt indkøbsforslag -> indkøbsKLADDE. Ikke en afsendt ordre.
  approvals.registerExecutor('lager.purchase_draft', (req, actor) =>
    lager.createPurchaseDraft(actor, { lines: req.payload.lines, approvalId: req.id }));

  const eco = { platform, approvals, lager, puls, overblik, indsigt, workers };

  // Kasseintegration (POS). Kræver en krypteringsnøgle til tokens.
  if (opts.pos) {
    const registry = createConnectorRegistry({ shopify: { ...opts.pos.shopify, now: platform.now } });
    const vault = createVault(opts.pos.vaultKey);
    const pos = createPosEngine({ platform, lager, registry, vault, webhookUri: opts.pos.webhookUri || null, now: platform.now });
    const posViews = createPosViews(platform, pos);
    const posWorkers = createPosWorkers({ platform, engine: pos, views: posViews, lager, overblik, approvals });
    Object.assign(eco, { pos, posViews, posWorkers, registry });
  }
  return eco;
}

module.exports = { createEcosystem };
