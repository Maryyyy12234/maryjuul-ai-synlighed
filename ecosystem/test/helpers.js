'use strict';
const { createEcosystem } = require('../src');

function setup({ industry = 'webshop', modules = ['overblik', 'puls', 'lager', 'indsigt'], start = '2026-11-01T09:00:00Z' } = {}) {
  let t = Date.parse(start);
  const clock = { now: () => new Date(t), set: (iso) => { t = Date.parse(iso); }, addDays: (d) => { t += d * 86400000; } };
  const eco = createEcosystem({ now: clock.now });
  const { platform } = eco;
  const ownerUser = platform.createUser('Mikkel', 'mikkel@example.dk');
  const org = platform.createOrganization('Testbutik ApS', industry, ownerUser);
  const owner = platform.userActor(org.id, ownerUser.id);
  for (const m of modules) platform.activateModule(owner, m);
  return { ...eco, clock, org, owner, ownerUser };
}
module.exports = { setup };
