'use strict';
// DEMO: En simuleret Shopify-butik, der svarer som Shopifys Admin GraphQL API
// (de forespørgsler vi bruger), OAuth-token-endpointet og signerede webhooks.
// Bruges KUN til tests og demo. Den er ikke forbundet til en rigtig butik.

const crypto = require('node:crypto');

const money = (ore, cur = 'DKK') => ({ shopMoney: { amount: `${ore < 0 ? '-' : ''}${Math.trunc(Math.abs(ore) / 100)}.${String(Math.abs(ore) % 100).padStart(2, '0')}`, currencyCode: cur } });
const num = (gid) => Number(String(gid).split('/').pop());

function createFakeShopify({ shop = 'demo-toejbutik.myshopify.com', clientSecret, now, pageSize = 2 }) {
  let seq = 1000;
  const next = (type) => `gid://shopify/${type}/${++seq}`;
  const s = {
    shop, name: 'Demo Tøjbutik (DEMO)', timezone: 'Europe/Copenhagen', currency: 'DKK',
    locations: [], products: [], levels: new Map(), orders: new Map(), webhooks: [],
    tokens: null, pendingCode: null, throttleNext: 0, failNext: 0, calls: [],
  };
  const iso = () => now().toISOString();

  // ---------- Butiksdata ----------
  function addLocation(name) { const l = { id: next('Location'), name, isActive: true }; s.locations.push(l); return l; }
  function addProduct({ title, productType, variants }) {
    const p = { id: next('Product'), title, productType, vendor: 'DEMO', status: 'ACTIVE', updatedAt: iso(), variants: [] };
    for (const v of variants) {
      p.variants.push({ id: next('ProductVariant'), title: v.title, sku: v.sku, priceOre: v.priceOre, costOre: v.costOre ?? null,
        selectedOptions: v.options || [{ name: 'Størrelse', value: v.title }], itemId: next('InventoryItem'), tracked: true });
    }
    s.products.push(p); return p;
  }
  function setStock(itemId, locationId, available) {
    s.levels.set(`${itemId}|${locationId}`, { id: `gid://shopify/InventoryLevel/${num(itemId)}?inventory_item_id=${num(itemId)}&location_id=${num(locationId)}`, itemId, locationId, available, onHand: available, committed: 0, updatedAt: iso() });
  }
  function adjust(itemId, locationId, delta) {
    const l = s.levels.get(`${itemId}|${locationId}`) || (setStock(itemId, locationId, 0), s.levels.get(`${itemId}|${locationId}`));
    l.available += delta; l.onHand += delta; l.updatedAt = iso();
    return l;
  }
  const variantById = (id) => { for (const p of s.products) for (const v of p.variants) if (v.id === id) return { p, v }; throw new Error(`Ukendt variant ${id}`); };

  // ---------- Signerede webhooks ----------
  function webhook(topic, payload) {
    const rawBody = JSON.stringify(payload);
    return { headers: {
      'X-Shopify-Topic': topic, 'X-Shopify-Shop-Domain': shop, 'X-Shopify-API-Version': '2026-10',
      'X-Shopify-Webhook-Id': crypto.randomUUID(), 'X-Shopify-Event-Id': crypto.randomUUID(), 'X-Shopify-Triggered-At': iso(),
      'X-Shopify-Hmac-Sha256': crypto.createHmac('sha256', clientSecret).update(rawBody).digest('base64'),
    }, rawBody };
  }
  const invWebhook = (l) => webhook('inventory_levels/update', { inventory_item_id: num(l.itemId), location_id: num(l.locationId), available: l.available, updated_at: l.updatedAt });

  // ---------- Salg, retur, annullering (Shopify trækker selv lageret) ----------
  function sell({ lines, locationId = null, channel = 'pos', discountOre = 0 }) {
    const id = next('Order');
    const items = lines.map((ln, i) => {
      const { p, v } = variantById(ln.variantId);
      const lineDiscount = i === 0 ? discountOre : 0;
      const net = v.priceOre * ln.qty - lineDiscount;
      const tax = Math.round(net / 5); // 25 % moms inkl. i prisen
      return { id: next('LineItem'), quantity: ln.qty, currentQuantity: ln.qty, sku: v.sku, title: p.title, variantTitle: v.title,
        variant: { id: v.id }, product: { id: p.id, productType: p.productType }, _unit: v.priceOre, _net: net, _tax: tax, _disc: lineDiscount, _itemId: v.itemId };
    });
    const o = { id, name: `#${num(id)}`, createdAt: iso(), processedAt: iso(), updatedAt: iso(), cancelledAt: null, sourceName: channel === 'pos' ? 'pos' : 'web',
      test: false, currencyCode: 'DKK', taxesIncluded: true, displayFinancialStatus: 'PAID', retailLocation: channel === 'pos' ? { id: locationId } : null,
      _lines: items, _refunds: [], _locationId: locationId || s.locations[s.locations.length - 1].id };
    s.orders.set(id, o);
    const inv = items.map((it) => adjust(it._itemId, o._locationId, -it.quantity));
    return { order: o, webhooks: [webhook('orders/create', { id: num(id), admin_graphql_api_id: id }), ...inv.map(invWebhook)] };
  }
  function refund({ orderId, lineIndex = 0, qty = 1, restock = true }) {
    const o = s.orders.get(orderId); const it = o._lines[lineIndex];
    if (qty > it.currentQuantity) throw new Error('Kan ikke refundere mere end købt');
    const unitNet = Math.round(it._net / it.quantity);
    const amount = unitNet * qty; const tax = Math.round(amount / 5);
    it.currentQuantity -= qty;
    const r = { id: next('Refund'), createdAt: iso(), processedAt: iso(), note: 'DEMO retur', _amount: amount,
      lines: [{ id: next('RefundLineItem'), quantity: qty, restockType: restock ? 'RETURN' : 'NO_RESTOCK', lineItem: { id: it.id }, _sub: amount, _tax: tax }] };
    o._refunds.push(r); o.updatedAt = iso();
    const hooks = [webhook('refunds/create', { id: num(r.id), order_id: num(orderId) }), webhook('orders/updated', { id: num(orderId), admin_graphql_api_id: orderId })];
    if (restock) hooks.push(invWebhook(adjust(it._itemId, o._locationId, qty)));
    return { refund: r, webhooks: hooks };
  }
  function cancel(orderId) {
    const o = s.orders.get(orderId);
    o.cancelledAt = iso(); o.updatedAt = iso();
    const hooks = [webhook('orders/cancelled', { id: num(orderId), admin_graphql_api_id: orderId })];
    for (const it of o._lines) { if (it.currentQuantity) hooks.push(invWebhook(adjust(it._itemId, o._locationId, it.currentQuantity))); it.currentQuantity = 0; }
    return { webhooks: hooks };
  }

  // ---------- GraphQL-repræsentation ----------
  function orderGql(o) {
    const sub = o._lines.reduce((a, it) => a + Math.round((it._net / it.quantity) * it.currentQuantity), 0);
    const refundedTotal = o._refunds.reduce((a, r) => a + r._amount, 0);
    const origSub = o._lines.reduce((a, it) => a + it._net, 0);
    const origTax = o._lines.reduce((a, it) => a + it._tax, 0);
    const curTax = o._lines.reduce((a, it) => a + Math.round((it._tax * it.currentQuantity) / it.quantity), 0);
    const disc = o._lines.reduce((a, it) => a + it._disc, 0);
    const cancelled = !!o.cancelledAt;
    return {
      id: o.id, name: o.name, createdAt: o.createdAt, processedAt: o.processedAt, updatedAt: o.updatedAt, cancelledAt: o.cancelledAt,
      sourceName: o.sourceName, test: o.test, currencyCode: o.currencyCode, taxesIncluded: o.taxesIncluded, displayFinancialStatus: refundedTotal ? 'PARTIALLY_REFUNDED' : o.displayFinancialStatus,
      retailLocation: o.retailLocation,
      subtotalPriceSet: money(origSub), totalDiscountsSet: money(disc), totalTaxSet: money(origTax), totalPriceSet: money(origSub),
      currentSubtotalPriceSet: money(cancelled ? 0 : sub), currentTotalDiscountsSet: money(cancelled ? 0 : disc), currentTotalTaxSet: money(cancelled ? 0 : curTax), currentTotalPriceSet: money(cancelled ? 0 : sub),
      totalRefundedSet: money(refundedTotal),
      lineItems: { nodes: o._lines.map((it) => ({ id: it.id, quantity: it.quantity, currentQuantity: it.currentQuantity, sku: it.sku, title: it.title, variantTitle: it.variantTitle,
        variant: it.variant, product: it.product, originalUnitPriceSet: money(it._unit), discountedUnitPriceAfterAllDiscountsSet: money(Math.round(it._net / it.quantity)),
        totalDiscountSet: money(it._disc), taxLines: [{ ratePercentage: 25, priceSet: money(it._tax) }] })) },
      refunds: o._refunds.map((r) => ({ id: r.id, createdAt: r.createdAt, processedAt: r.processedAt, note: r.note, totalRefundedSet: money(r._amount),
        refundLineItems: { nodes: r.lines.map((x) => ({ id: x.id, quantity: x.quantity, restockType: x.restockType, lineItem: x.lineItem, subtotalSet: money(x._sub), totalTaxSet: money(x._tax) })) } })),
    };
  }
  const productGql = (p) => ({ id: p.id, title: p.title, productType: p.productType, vendor: p.vendor, status: p.status, updatedAt: p.updatedAt,
    variants: { nodes: p.variants.map((v) => ({ id: v.id, title: v.title, sku: v.sku, price: money(v.priceOre).shopMoney.amount, selectedOptions: v.selectedOptions,
      inventoryItem: { id: v.itemId, tracked: v.tracked, unitCost: v.costOre != null ? money(v.costOre).shopMoney : null } })) } });
  const levelGql = (l) => ({ id: l.id, updatedAt: l.updatedAt, item: { id: l.itemId }, location: { id: l.locationId },
    quantities: [{ name: 'available', quantity: l.available }, { name: 'on_hand', quantity: l.onHand }, { name: 'committed', quantity: l.committed }] });
  function page(list, cursor) {
    const start = cursor ? Number(cursor) : 0;
    const nodes = list.slice(start, start + pageSize);
    const more = start + pageSize < list.length;
    return { pageInfo: { hasNextPage: more, endCursor: more ? String(start + pageSize) : null }, nodes };
  }

  function graphql(query, v) {
    const op = /(?:query|mutation)\s+(\w+)/.exec(query)?.[1];
    switch (op) {
      case 'EcoShop': return { shop: { name: s.name, myshopifyDomain: shop, ianaTimezone: s.timezone, currencyCode: s.currency } };
      case 'EcoLocations': return { locations: page(s.locations, v.cursor) };
      case 'EcoProducts': return { products: page(s.products.map(productGql), v.cursor) };
      case 'EcoProduct': { const p = s.products.find((x) => x.id === v.id); return { product: p ? productGql(p) : null }; }
      case 'EcoInventory': return { location: { inventoryLevels: page([...s.levels.values()].filter((l) => l.locationId === v.locationId).map(levelGql), v.cursor) } };
      case 'EcoInventoryLevel': { const l = s.levels.get(`${v.itemId}|${v.locationId}`); return { inventoryItem: { inventoryLevel: l ? levelGql(l) : null } }; }
      case 'EcoOrders': {
        const since = v.query ? /updated_at:>='([^']+)'/.exec(v.query)?.[1] : null;
        const list = [...s.orders.values()].filter((o) => !since || Date.parse(o.updatedAt) >= Date.parse(since)).sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt)).map(orderGql);
        return { orders: page(list, v.cursor) };
      }
      case 'EcoOrder': { const o = s.orders.get(v.id); return { order: o ? orderGql(o) : null }; }
      case 'EcoWebhookCreate': s.webhooks.push({ topic: v.topic, uri: v.uri }); return { webhookSubscriptionCreate: { webhookSubscription: { id: next('WebhookSubscription') }, userErrors: [] } };
      default: throw new Error(`DEMO-Shopify kender ikke ${op}`);
    }
  }

  const response = (status, body, headers = {}) => ({ status, ok: status >= 200 && status < 300, headers: { get: (h) => headers[h.toLowerCase()] ?? null },
    json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
  function issueTokens() {
    s.tokens = { access: `shpat_demo_${crypto.randomBytes(6).toString('hex')}`, refresh: `shprt_demo_${crypto.randomBytes(6).toString('hex')}`, expires: now().getTime() + 3600000 };
    return { access_token: s.tokens.access, refresh_token: s.tokens.refresh, expires_in: 3600, refresh_token_expires_in: 7776000, scope: 'read_products,read_inventory,read_locations,read_orders' };
  }

  async function fetch(url, opts = {}) {
    const u = new URL(url);
    if (u.hostname !== shop) return response(404, 'not found');
    if (u.pathname === '/admin/oauth/access_token') {
      const p = Object.fromEntries(new URLSearchParams(opts.body));
      s.calls.push({ kind: 'token', grant: p.grant_type || 'authorization_code' });
      if (p.grant_type === 'refresh_token') return s.tokens && p.refresh_token === s.tokens.refresh ? response(200, issueTokens()) : response(401, { error: 'invalid_request' });
      if (p.code && p.code === s.pendingCode && p.expiring === '1') { s.pendingCode = null; return response(200, issueTokens()); }
      return response(400, { error: 'invalid_request' });
    }
    if (u.pathname === '/admin/api/2026-10/graphql.json') {
      const token = opts.headers['x-shopify-access-token'];
      if (!s.tokens || token !== s.tokens.access || now().getTime() > s.tokens.expires) return response(401, '[API] Invalid API key or access token');
      if (s.failNext > 0) { s.failNext--; return response(503, 'Service Unavailable'); }
      const { query, variables } = JSON.parse(opts.body);
      s.calls.push({ kind: 'graphql', op: /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] });
      if (s.throttleNext > 0) { s.throttleNext--; return response(200, { errors: [{ message: 'Throttled', extensions: { code: 'THROTTLED' } }], extensions: { cost: { requestedQueryCost: 50, throttleStatus: { maximumAvailable: 2000, currentlyAvailable: 0, restoreRate: 100 } } } }); }
      return response(200, { data: graphql(query, variables || {}) });
    }
    return response(404, 'not found');
  }

  // Simulerer at ejeren godkender appen i Shopify og bliver sendt tilbage.
  function approveInstall(state) {
    s.pendingCode = crypto.randomBytes(8).toString('hex');
    const q = { code: s.pendingCode, host: Buffer.from(`${shop}/admin`).toString('base64'), shop, state, timestamp: String(Math.floor(now().getTime() / 1000)) };
    const msg = Object.keys(q).sort().map((k) => `${k}=${q[k]}`).join('&');
    return { ...q, hmac: crypto.createHmac('sha256', clientSecret).update(msg).digest('hex') };
  }
  function issueTokensDirect() { const t = issueTokens(); return { accessToken: t.access_token, refreshToken: t.refresh_token, scopes: t.scope.split(','), expiresAt: new Date(s.tokens.expires).toISOString(), refreshExpiresAt: new Date(now().getTime() + 7776000000).toISOString() }; }

  return { state: s, fetch, addLocation, addProduct, setStock, adjust, sell, refund, cancel, approveInstall, issueTokensDirect, webhook, variantById };
}

module.exports = { createFakeShopify };
