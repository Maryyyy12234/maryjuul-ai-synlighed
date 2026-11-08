'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./helpers');

test('virksomhed A kan ikke læse eller ændre virksomhed B\'s data', () => {
  const a = setup();
  const { platform, lager } = a;
  const otherUser = platform.createUser('Sara', 'sara@example.dk');
  const orgB = platform.createOrganization('Anden ApS', 'detail', otherUser);
  const ownerB = platform.userActor(orgB.id, otherUser.id);
  platform.activateModule(ownerB, 'lager');
  const pB = lager.createProduct(ownerB, { name: 'Hemmelig', sku: 'B-1' });

  assert.throws(() => platform.repo(a.owner, 'lager').get('products', pB.id), { code: 'NOT_FOUND' });
  assert.throws(() => platform.repo(a.owner, 'lager').update('products', pB.id, { name: 'Hacket' }), { code: 'NOT_FOUND' });
  assert.equal(platform.repo(a.owner, 'lager').list('products').length, 0);
  assert.throws(() => platform.userActor(orgB.id, a.ownerUser.id), { code: 'FORBIDDEN' });
  // organization_id kan ikke overskrives via input
  const p = platform.repo(a.owner, 'lager').insert('products', { name: 'x', sku: 'x', organization_id: orgB.id });
  assert.equal(p.organization_id, a.org.id);
});

test('en app, der ikke er købt, kan ikke bruges', () => {
  const s = setup({ industry: 'konsulent', modules: ['puls'] });
  assert.throws(() => s.lager.createProduct(s.owner, { name: 'x', sku: 'x' }), /LAGER er ikke aktiveret/);
  assert.deepEqual(s.platform.activeModules(s.org.id), ['puls']);
});

test('adgang pr. app: medarbejder i OVERBLIK kan ikke se PULS', () => {
  const s = setup();
  const u = s.platform.createUser('Ida', 'ida@example.dk');
  s.platform.inviteMember(s.owner, u, 'member', ['overblik']);
  const ida = s.platform.userActor(s.org.id, u.id);
  assert.ok(s.overblik.createTask(ida, { title: 'Åbn butik' }));
  assert.throws(() => s.puls.summary(ida, { from: '2026-10-01', to: '2026-10-31' }), /Mangler rettighed/);
  assert.throws(() => s.platform.activateModule(ida, 'lager'), /Kun ejeren/);
});

test('branche giver kun anbefalinger', () => {
  const s = setup({ industry: 'restaurant', modules: [] });
  assert.deepEqual(s.platform.recommendModules('restaurant'), { recommended: ['overblik', 'puls', 'indsigt'], optional: ['lager'] });
  s.platform.activateModule(s.owner, 'lager'); // restaurant må godt vælge LAGER
  assert.ok(s.platform.isModuleActive(s.org.id, 'lager'));
});

test('datadeling er eksplicit og forsvinder når en app afbrydes', () => {
  const s = setup();
  const txt = s.platform.sharingConsentText('puls', 'indsigt', 'financial_kpis');
  assert.match(txt, /kan INDSIGT bruge dine økonomiske nøgletal/);
  const period = { from: '2026-10-01', to: '2026-10-31' };
  assert.throws(() => s.indsigt.revenueChange(s.owner, period, period), /ikke godkendt/);
  s.platform.grantSharing(s.owner, 'puls', 'indsigt', 'financial_kpis');
  assert.ok(s.indsigt.revenueChange(s.owner, period, period));
  s.platform.deactivateModule(s.owner, 'puls');
  assert.equal(s.platform.isShared(s.org.id, 'puls', 'indsigt', 'financial_kpis'), false);
});

test('alle skrivninger havner i revisionsloggen', () => {
  const s = setup();
  s.overblik.createTask(s.owner, { title: 'Test' });
  const log = s.platform.auditLog(s.owner);
  assert.ok(log.some((e) => e.action === 'tasks.created' && e.actor === s.ownerUser.id));
  assert.ok(log.every((e) => e.organization_id === s.org.id));
});
