'use strict';
const { createPlatform } = require('./platform');
const { createApprovals } = require('./approvals');
const { createLager } = require('./lager');
const { createPuls } = require('./puls');
const { createOverblik } = require('./overblik');
const { createIndsigt } = require('./indsigt');
const { createWorkers } = require('./workers');

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

  return { platform, approvals, lager, puls, overblik, indsigt, workers };
}

module.exports = { createEcosystem };
