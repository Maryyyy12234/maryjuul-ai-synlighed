'use strict';
// Kør: npm run demo. Viser det forbundne workflow i terminalen med testdata.
const { createEcosystem } = require('./src');

let t = Date.parse('2026-10-11T08:00:00Z');
const eco = createEcosystem({ now: () => new Date(t) });
const { platform, lager, overblik, approvals, workers } = eco;

const user = platform.createUser('Mikkel', 'mikkel@example.dk');
const org = platform.createOrganization('Demo Webshop ApS', 'webshop', user);
const owner = platform.userActor(org.id, user.id);
console.log('Anbefalede apps for webshop:', platform.recommendModules('webshop').recommended.join(', '));
for (const m of ['lager', 'overblik']) platform.activateModule(owner, m);
console.log('\nSamtykke:', platform.sharingConsentText('lager', 'overblik', 'tasks'));
platform.grantSharing(owner, 'lager', 'overblik', 'tasks');

const loc = lager.createLocation(owner, 'Hovedlager');
const p = lager.createProduct(owner, { name: 'Keramikkop, sand', sku: 'KOP-01', cost_ore: 4000, min_stock: 5, lead_time_days: 5 });
lager.recordMovement(owner, { productId: p.id, locationId: loc.id, type: 'receipt', quantity: 258, reason: 'Startbeholdning' });
for (let d = 0; d < 28; d++) { t += 86400000; lager.recordMovement(owner, { productId: p.id, locationId: loc.id, type: 'sale', quantity: 8, reason: 'Webordre' }); }

const run = workers.inventoryPlanner(org.id);
const req = approvals.get(owner, run.approvalId);
console.log(`\n— ${req.title} —\nHvad ændres:\n${req.change}\nHvorfor:\n${req.reason}\nData:\n${req.evidence}\nVed godkendelse: ${req.effect}\nUsikkerhed: ${req.uncertainty}`);

const today = overblik.today(owner, { date: new Date(t).toISOString().slice(0, 10), approvals });
console.log(`\nOVERBLIK: ${today.headline}`); today.items.forEach((i) => console.log(' •', i.title));

approvals.decide(owner, req.id, 'approved', 'Ok');
const { result } = approvals.execute(owner, req.id);
console.log(`\nGodkendt. Indkøbskladde oprettet: status=${result.status}, sendt=${result.sent}`);
console.log(`Revisionslog: ${platform.auditLog(owner).length} hændelser`);
