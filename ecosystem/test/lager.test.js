'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./helpers');

function shop(opts) {
  const s = setup(opts);
  const loc = s.lager.createLocation(s.owner, 'Hovedlager');
  const p = s.lager.createProduct(s.owner, { name: 'Produkt A', sku: 'A-1', cost_ore: 4000, min_stock: 5, lead_time_days: 5 });
  return { ...s, loc, p };
}

test('lagerbevægelser gemmer før/ændring/efter og årsag', () => {
  const s = shop();
  const m1 = s.lager.recordMovement(s.owner, { productId: s.p.id, locationId: s.loc.id, type: 'receipt', quantity: 50, reason: 'Levering' });
  assert.deepEqual([m1.before, m1.change, m1.after], [0, 50, 50]);
  const m2 = s.lager.recordMovement(s.owner, { productId: s.p.id, locationId: s.loc.id, type: 'count', quantity: 47, reason: 'Optælling' });
  assert.deepEqual([m2.before, m2.change, m2.after], [50, -3, 47]);
  assert.throws(() => s.lager.recordMovement(s.owner, { productId: s.p.id, locationId: s.loc.id, type: 'sale', quantity: 1 }), /årsag/);
  assert.throws(() => s.lager.recordMovement(s.owner, { productId: s.p.id, locationId: s.loc.id, type: 'sale', quantity: 99, reason: 'x' }), /negativ/);
});

test('beholdning pr. lokation og samlet', () => {
  const s = shop();
  const butik = s.lager.createLocation(s.owner, 'Butik');
  s.lager.recordMovement(s.owner, { productId: s.p.id, locationId: s.loc.id, type: 'receipt', quantity: 30, reason: 'Levering' });
  s.lager.recordMovement(s.owner, { productId: s.p.id, locationId: s.loc.id, type: 'transfer_out', quantity: 10, reason: 'Til butik', reference: 'T1' });
  s.lager.recordMovement(s.owner, { productId: s.p.id, locationId: butik.id, type: 'transfer_in', quantity: 10, reason: 'Fra lager', reference: 'T1' });
  assert.equal(s.lager.onHand(s.owner, s.p.id, s.loc.id), 20);
  assert.equal(s.lager.onHand(s.owner, s.p.id, butik.id), 10);
  assert.equal(s.lager.onHand(s.owner, s.p.id), 30);
});

test('webhook-events registreres kun én gang (idempotens)', () => {
  const s = shop();
  const args = { productId: s.p.id, locationId: s.loc.id, type: 'receipt', quantity: 5, reason: 'x', idempotencyKey: 'shopify:evt-1' };
  s.lager.recordMovement(s.owner, args);
  const again = s.lager.recordMovement(s.owner, args);
  assert.equal(again.duplicate, true);
  assert.equal(s.lager.onHand(s.owner, s.p.id), 5);
});

test('Shopify som master: LAGER overskriver ikke', () => {
  const s = shop();
  const sp = s.lager.createProduct(s.owner, { name: 'Shopify-vare', sku: 'S-1', source_of_truth: 'shopify' });
  assert.throws(() => s.lager.recordMovement(s.owner, { productId: sp.id, locationId: s.loc.id, type: 'adjustment', quantity: 5, reason: 'x' }), /Shopify er master/);
  assert.ok(s.lager.recordMovement(s.owner, { productId: sp.id, locationId: s.loc.id, type: 'adjustment', quantity: 5, reason: 'sync', source: 'shopify' }));
});

test('for lidt historik giver ingen prognose', () => {
  const s = shop();
  s.lager.recordMovement(s.owner, { productId: s.p.id, locationId: s.loc.id, type: 'receipt', quantity: 100, reason: 'x' });
  s.lager.recordMovement(s.owner, { productId: s.p.id, locationId: s.loc.id, type: 'sale', quantity: 3, reason: 'ordre' });
  const r = s.lager.reorderSuggestion(s.owner, s.p.id);
  assert.equal(r.status, 'insufficient_history');
  assert.match(r.reason, /For lidt historik/);
});

test('genbestilling: 8 solgt/dag, 34 tilbage => ca. 4 dages dækning', () => {
  const s = shop();
  s.lager.recordMovement(s.owner, { productId: s.p.id, locationId: s.loc.id, type: 'receipt', quantity: 258, reason: 'Start' });
  for (let d = 0; d < 28; d++) {
    s.clock.addDays(1);
    s.lager.recordMovement(s.owner, { productId: s.p.id, locationId: s.loc.id, type: 'sale', quantity: 8, reason: 'ordre' });
  }
  assert.equal(s.lager.onHand(s.owner, s.p.id), 34);
  const r = s.lager.reorderSuggestion(s.owner, s.p.id);
  assert.equal(r.status, 'reorder');
  assert.equal(r.daysOfCover, 4);
  assert.equal(r.reorderPoint, 8 * 5 + 24); // forbrug i leveringstid + sikkerhed (3 dage)
  assert.equal(r.suggestedQty, 8 * 35 + 24 - 34);
  assert.equal(r.estimatedCostOre, r.suggestedQty * 4000);
  assert.match(r.basis, /8,0 solgt\/dag/);
});
