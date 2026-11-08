'use strict';
// LAGER: produkter, lokationer og sporbare lagerbevægelser + deterministiske
// genbestillingsberegninger. AI forklarer resultater; den beregner dem ikke.

const { AccessError } = require('./platform');

const MOVEMENT_TYPES = Object.freeze({
  receipt:    { sign: +1, label: 'Varemodtagelse' },
  sale:       { sign: -1, label: 'Salg' },
  reservation:{ sign: -1, label: 'Reservation' },
  return:     { sign: +1, label: 'Retur' },
  damaged:    { sign: -1, label: 'Beskadiget' },
  adjustment: { sign: 0,  label: 'Manuel korrektion' }, // fortegn angives i quantity
  count:      { sign: 0,  label: 'Optælling' },          // quantity = optalt antal
  transfer_out:{ sign: -1, label: 'Flytning (ud)' },
  transfer_in: { sign: +1, label: 'Flytning (ind)' },
});

const DAY = 86400000;
const MIN_HISTORY_DAYS = 14;
const MIN_SALES_EVENTS = 3;

function createLager(platform) {
  const idempotency = new Map(); // org:key -> movement
  // Når et kassesystem er master for lageret, trækkes salg IKKE fra lageret
  // her. Salgshistorikken kommer i stedet fra kassedata via en provider.
  let salesProvider = null;
  function setSalesProvider(fn) { salesProvider = fn; }

  function repo(actor) { return platform.repo(actor, 'lager'); }

  function createProduct(actor, p) {
    if (!p.name || !p.sku) throw new Error('Produkt kræver navn og SKU');
    return repo(actor).insert('products', {
      name: p.name, sku: p.sku, barcode: p.barcode || null, category: p.category || null,
      supplier_id: p.supplier_id || null, cost_ore: p.cost_ore ?? null, price_ore: p.price_ore ?? null,
      min_stock: p.min_stock ?? 0, lead_time_days: p.lead_time_days ?? null, status: 'active',
      source_of_truth: p.source_of_truth || 'lager', // 'shopify' = Shopify er master; LAGER må ikke overskrive
      external_ref: p.external_ref || null, variant_title: p.variant_title || null, options: p.options || [],
    });
  }

  function createLocation(actor, name) { return repo(actor).insert('locations', { name }); }

  function onHand(actor, productId, locationId = null) {
    const moves = repo(actor).list('stock_movements', (m) => m.product_id === productId && (!locationId || m.location_id === locationId));
    if (locationId) return moves.length ? moves[moves.length - 1].after : 0;
    const byLoc = new Map();
    for (const m of moves) byLoc.set(m.location_id, m.after);
    return [...byLoc.values()].reduce((a, b) => a + b, 0);
  }

  // Ingen stille ændringer: hver bevægelse gemmer før, ændring, efter, årsag og kilde.
  function recordMovement(actor, { productId, locationId, type, quantity, reason, reference = null, source = 'manual', idempotencyKey = null, allowNegative = false }) {
    const t = MOVEMENT_TYPES[type];
    if (!t) throw new Error(`Ukendt bevægelsestype: ${type}`);
    if (!Number.isInteger(quantity)) throw new Error('Antal skal være et helt tal');
    if (!reason) throw new Error('En lagerbevægelse kræver en årsag');
    if (idempotencyKey) {
      const prev = idempotency.get(`${actor.organization_id}:${idempotencyKey}`);
      if (prev) return { ...prev, duplicate: true };
    }
    const r = repo(actor);
    const product = r.get('products', productId);
    r.get('locations', locationId);
    if (product.source_of_truth === 'shopify' && source !== 'shopify') {
      throw new AccessError('Shopify er master for dette produkts lager. Ret beholdningen i Shopify.');
    }
    const before = onHand(actor, productId, locationId);
    let change;
    if (type === 'count') change = quantity - before;
    else if (t.sign === 0) change = quantity;
    else { if (quantity <= 0) throw new Error('Antal skal være positivt'); change = t.sign * quantity; }
    const after = before + change;
    if (after < 0 && !allowNegative) throw new Error(`Beholdningen kan ikke blive negativ (${before} → ${after})`);
    const mv = r.insert('stock_movements', {
      product_id: productId, location_id: locationId, type, before, change, after, reason, reference, source,
      occurred_at: platform.now().toISOString(),
    });
    if (idempotencyKey) idempotency.set(`${actor.organization_id}:${idempotencyKey}`, mv);
    return mv;
  }

  // Salgshastighed ud fra registrerede salg i et vindue. Returnerer
  // "insufficient" i stedet for at gætte, hvis historikken er for kort.
  function salesVelocity(actor, productId, { days = 28 } = {}) {
    const end = platform.now().getTime();
    const external = salesProvider ? salesProvider(actor, productId) : null;
    const sales = external
      ? external.map((e) => ({ occurred_at: e.at, change: -e.qty }))
      : repo(actor).list('stock_movements', (m) => m.product_id === productId && m.type === 'sale');
    if (!sales.length) return { sufficient: false, reason: 'Ingen registrerede salg endnu.' };
    const first = Math.min(...sales.map((s) => Date.parse(s.occurred_at)));
    const historyDays = Math.floor((end - first) / DAY);
    const windowDays = Math.min(days, Math.max(historyDays, 0));
    const inWindow = sales.filter((s) => Date.parse(s.occurred_at) > end - windowDays * DAY);
    if (historyDays < MIN_HISTORY_DAYS || inWindow.length < MIN_SALES_EVENTS) {
      return { sufficient: false, historyDays, salesEvents: inWindow.length,
        reason: `For lidt historik: ${historyDays} dage og ${inWindow.length} salg. Kræver mindst ${MIN_HISTORY_DAYS} dage og ${MIN_SALES_EVENTS} salg.` };
    }
    const units = inWindow.reduce((a, s) => a - s.change, 0);
    return { sufficient: true, windowDays, units, source: external ? 'kassesystem' : 'lagerbevægelser', perDayMilli: Math.round((units * 1000) / windowDays),
      period: { from: new Date(end - windowDays * DAY).toISOString().slice(0, 10), to: new Date(end).toISOString().slice(0, 10) } };
  }

  // Genbestillingspunkt = dagligt forbrug × leveringstid + sikkerhedslager.
  // Forslag = nok til at dække leveringstid + dækningsperiode, minus beholdning.
  function reorderSuggestion(actor, productId, { coverDays = 30, safetyDays = 3 } = {}) {
    const p = repo(actor).get('products', productId);
    const stock = onHand(actor, productId);
    const v = salesVelocity(actor, productId);
    const base = { productId, sku: p.sku, name: p.name, onHand: stock, minStock: p.min_stock };
    if (!v.sufficient) {
      const belowMin = stock <= p.min_stock;
      return { ...base, status: belowMin ? 'below_min_no_forecast' : 'insufficient_history', reason: v.reason,
        suggestedQty: belowMin ? Math.max(p.min_stock * 2 - stock, 0) : 0,
        basis: belowMin ? 'Under minimumsbeholdning. Forslaget er 2 × minimum minus beholdning, da salgshistorikken ikke er nok til en prognose.' : null };
    }
    if (p.lead_time_days == null) {
      return { ...base, status: 'missing_lead_time', reason: 'Leveringstid mangler på produktet eller leverandøren.', velocity: v };
    }
    const perDay = v.perDayMilli; // tusindedele enheder pr. dag
    const safety = Math.ceil((perDay * safetyDays) / 1000);
    const reorderPoint = Math.ceil((perDay * p.lead_time_days) / 1000) + Math.max(safety, p.min_stock);
    const daysOfCover = perDay > 0 ? Math.floor((stock * 1000) / perDay) : null;
    const target = Math.ceil((perDay * (p.lead_time_days + coverDays)) / 1000) + safety;
    const needs = stock <= reorderPoint;
    return {
      ...base, status: needs ? 'reorder' : 'ok', reorderPoint, daysOfCover,
      suggestedQty: needs ? Math.max(target - stock, 0) : 0,
      estimatedCostOre: needs && p.cost_ore != null ? Math.max(target - stock, 0) * p.cost_ore : null,
      velocity: v,
      basis: `Gns. ${(perDay / 1000).toFixed(1).replace('.', ',')} solgt/dag (${v.period.from} – ${v.period.to}), leveringstid ${p.lead_time_days} dage, sikkerhedslager ${Math.max(safety, p.min_stock)} stk.`,
    };
  }

  function createPurchaseDraft(actor, { lines, supplier_id = null, approvalId }) {
    // Kun en KLADDE. Afsendelse til leverandør er en separat, godkendt handling (ikke bygget).
    return repo(actor).insert('purchase_orders', { status: 'draft', supplier_id, lines, approval_id: approvalId, sent: false });
  }

  return { MOVEMENT_TYPES, setSalesProvider, createProduct, createLocation, onHand, recordMovement, salesVelocity, reorderSuggestion, createPurchaseDraft };
}

module.exports = { createLager, MOVEMENT_TYPES };
