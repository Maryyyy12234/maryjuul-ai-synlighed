'use strict';
// Shopify-connector (læseadgang). Verificeret mod shopify.dev, november 2026:
// - Authorization code grant med state + HMAC-tjek af callback.
// - Udløbende offline-tokens (expiring=1): access 1 time, refresh 90 dage.
//   Ikke-udløbende tokens afvises af Admin API.
// - Webhooks: X-Shopify-Hmac-Sha256 = base64(HMAC-SHA256(rå body, client secret)).
//   X-Shopify-Webhook-Id bruges til at fjerne dubletter.
// - GraphQL Admin API 2026-10 (seneste stabile).
// Webhooks bruges kun som signal. Vi henter altid den aktuelle tilstand via
// GraphQL, så rækkefølge og gentagelser ikke kan give forkerte tal.

const crypto = require('node:crypto');
const { parseApiAmount } = require('../../money');

const API_VERSION = '2026-10';
const SCOPES = ['read_products', 'read_inventory', 'read_locations', 'read_orders'];
const WEBHOOK_TOPICS = [
  'ORDERS_CREATE', 'ORDERS_UPDATED', 'ORDERS_CANCELLED', 'REFUNDS_CREATE',
  'INVENTORY_LEVELS_UPDATE', 'PRODUCTS_CREATE', 'PRODUCTS_UPDATE', 'PRODUCTS_DELETE',
  'LOCATIONS_CREATE', 'LOCATIONS_UPDATE', 'APP_UNINSTALLED',
];
const QUANTITY_NAMES = ['available', 'on_hand', 'committed'];

class ShopifyAuthError extends Error { constructor(m) { super(m); this.code = 'AUTH'; } }
class ShopifyApiError extends Error { constructor(m, retryable = false) { super(m); this.code = 'API'; this.retryable = retryable; } }

const isValidShopDomain = (shop) => typeof shop === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop);

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function buildAuthUrl({ shop, clientId, redirectUri, state, scopes = SCOPES }) {
  if (!isValidShopDomain(shop)) throw new Error('Ugyldig Shopify-adresse. Brug formen dinbutik.myshopify.com');
  const q = new URLSearchParams({ client_id: clientId, scope: scopes.join(','), redirect_uri: redirectUri, state });
  return `https://${shop}/admin/oauth/authorize?${q}`;
}

function verifyCallbackHmac(query, secret) {
  const { hmac, ...rest } = query;
  if (!hmac) return false;
  const msg = Object.keys(rest).sort().map((k) => `${k}=${rest[k]}`).join('&');
  const digest = crypto.createHmac('sha256', secret).update(msg).digest('hex');
  return safeEqual(digest, hmac);
}

function verifyWebhook(rawBody, hmacHeader, secret) {
  if (!hmacHeader) return false;
  const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  return safeEqual(digest, hmacHeader);
}

async function tokenRequest(fetchImpl, shop, params, now) {
  const res = await fetchImpl(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams(params).toString(), signal: AbortSignal.timeout(30000),
  });
  if (res.status === 400 || res.status === 401) throw new ShopifyAuthError('Shopify afviste godkendelsen. Forbind butikken igen.');
  if (!res.ok) throw new ShopifyApiError(`Shopify svarede ${res.status} ved token-forespørgsel`, res.status >= 500);
  const j = await res.json();
  if (!j.access_token) throw new ShopifyAuthError('Shopify returnerede ingen adgangsnøgle');
  const t = now().getTime();
  return {
    accessToken: j.access_token, refreshToken: j.refresh_token || null, scopes: String(j.scope || '').split(',').filter(Boolean),
    expiresAt: j.expires_in ? new Date(t + j.expires_in * 1000).toISOString() : null,
    refreshExpiresAt: j.refresh_token_expires_in ? new Date(t + j.refresh_token_expires_in * 1000).toISOString() : null,
  };
}

const exchangeCode = ({ shop, code, clientId, clientSecret, fetch: f, now }) =>
  tokenRequest(f, shop, { client_id: clientId, client_secret: clientSecret, code, expiring: '1' }, now);
// NB: Parametre til refresh følger "Refresh an expiring offline token" på shopify.dev.
// Skal bekræftes mod en rigtig udviklingsbutik før produktion.
const refreshToken = ({ shop, refresh, clientId, clientSecret, fetch: f, now }) =>
  tokenRequest(f, shop, { client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token', refresh_token: refresh }, now);

// ---------- GraphQL-klient med throttling og genforsøg ----------
function createClient({ shop, getToken, onAuthError, fetch: f, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), maxRetries = 4 }) {
  async function graphql(query, variables = {}) {
    for (let attempt = 0; ; attempt++) {
      const token = await getToken();
      let res;
      try {
        res = await f(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
          method: 'POST', headers: { 'content-type': 'application/json', 'x-shopify-access-token': token },
          body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(30000),
        });
      } catch (e) {
        if (attempt < maxRetries) { await sleep(500 * 2 ** attempt); continue; }
        throw new ShopifyApiError(`Kunne ikke nå Shopify: ${e.message}`, true);
      }
      if (res.status === 401 || res.status === 403) {
        const body = await res.text();
        if (onAuthError) await onAuthError(res.status, body);
        throw new ShopifyAuthError(res.status === 403 && /scope|access/i.test(body)
          ? 'Appen mangler en tilladelse i Shopify. Forbind igen og godkend adgangene.'
          : 'Adgangen til Shopify er udløbet eller tilbagekaldt. Forbind butikken igen.');
      }
      if (res.status === 429 || res.status >= 500) {
        if (attempt < maxRetries) { await sleep(Number(res.headers?.get?.('retry-after') || 0) * 1000 || 1000 * 2 ** attempt); continue; }
        throw new ShopifyApiError(`Shopify svarede ${res.status} efter ${maxRetries + 1} forsøg`, true);
      }
      const j = await res.json();
      const throttled = (j.errors || []).some((e) => e.extensions?.code === 'THROTTLED');
      if (throttled) {
        const ts = j.extensions?.cost?.throttleStatus;
        const need = j.extensions?.cost?.requestedQueryCost || 100;
        const wait = ts ? Math.ceil(Math.max(0, need - ts.currentlyAvailable) / (ts.restoreRate || 50)) * 1000 : 1000;
        if (attempt < maxRetries) { await sleep(Math.max(wait, 250)); continue; }
        throw new ShopifyApiError('Shopify begrænser antallet af forespørgsler. Prøver igen senere.', true);
      }
      if (j.errors?.length) throw new ShopifyApiError(`Shopify GraphQL-fejl: ${j.errors.map((e) => e.message).join('; ')}`);
      return j.data;
    }
  }

  async function* paginate(query, variables, pick) {
    let cursor = null;
    do {
      const data = await graphql(query, { ...variables, cursor });
      const conn = pick(data);
      if (!conn) return;
      for (const n of conn.nodes) yield n;
      cursor = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
    } while (cursor);
  }

  return { graphql, paginate };
}

// ---------- Forespørgsler (felter tjekket mod Admin-skema 2026-10) ----------
const MONEY = 'shopMoney { amount currencyCode }';
const ORDER_FIELDS = `
  id name createdAt processedAt updatedAt cancelledAt sourceName test currencyCode taxesIncluded
  displayFinancialStatus
  retailLocation { id }
  subtotalPriceSet { ${MONEY} } totalDiscountsSet { ${MONEY} } totalTaxSet { ${MONEY} } totalPriceSet { ${MONEY} }
  currentSubtotalPriceSet { ${MONEY} } currentTotalDiscountsSet { ${MONEY} } currentTotalTaxSet { ${MONEY} } currentTotalPriceSet { ${MONEY} }
  totalRefundedSet { ${MONEY} }
  lineItems(first: 100) { nodes {
    id quantity currentQuantity sku title variantTitle
    variant { id } product { id productType }
    originalUnitPriceSet { ${MONEY} } discountedUnitPriceAfterAllDiscountsSet { ${MONEY} } totalDiscountSet { ${MONEY} }
    taxLines { ratePercentage priceSet { ${MONEY} } }
  } }
  transactions { id kind status gateway formattedGateway paymentId processedAt test amountSet { ${MONEY} } location { id } }
  refunds { id createdAt processedAt note totalRefundedSet { ${MONEY} }
    refundLineItems(first: 100) { nodes { id quantity restockType lineItem { id } subtotalSet { ${MONEY} } totalTaxSet { ${MONEY} } } } }`;

const Q = {
  shop: 'query EcoShop { shop { name myshopifyDomain ianaTimezone currencyCode } }',
  locations: 'query EcoLocations($cursor: String) { locations(first: 50, after: $cursor) { pageInfo { hasNextPage endCursor } nodes { id name isActive } } }',
  products: `query EcoProducts($cursor: String) { products(first: 25, after: $cursor) { pageInfo { hasNextPage endCursor } nodes {
    id title productType vendor status updatedAt
    variants(first: 100) { nodes { id title sku price selectedOptions { name value } inventoryItem { id tracked unitCost { amount currencyCode } } } } } } }`,
  product: `query EcoProduct($id: ID!) { product(id: $id) { id title productType vendor status updatedAt
    variants(first: 100) { nodes { id title sku price selectedOptions { name value } inventoryItem { id tracked unitCost { amount currencyCode } } } } } }`,
  inventory: `query EcoInventory($locationId: ID!, $cursor: String) { location(id: $locationId) { inventoryLevels(first: 100, after: $cursor) {
    pageInfo { hasNextPage endCursor } nodes { id updatedAt item { id } location { id } quantities(names: ["available", "on_hand", "committed"]) { name quantity } } } } }`,
  inventoryLevel: `query EcoInventoryLevel($itemId: ID!, $locationId: ID!) { inventoryItem(id: $itemId) { inventoryLevel(locationId: $locationId) {
    id updatedAt item { id } location { id } quantities(names: ["available", "on_hand", "committed"]) { name quantity } } } }`,
  orders: `query EcoOrders($cursor: String, $query: String) { orders(first: 25, after: $cursor, query: $query, sortKey: UPDATED_AT) {
    pageInfo { hasNextPage endCursor } nodes { ${ORDER_FIELDS} } } }`,
  order: `query EcoOrder($id: ID!) { order(id: $id) { ${ORDER_FIELDS} } }`,
  webhookCreate: `mutation EcoWebhookCreate($topic: WebhookSubscriptionTopic!, $uri: String!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: { uri: $uri }) { webhookSubscription { id } userErrors { field message } } }`,
};

// ---------- Normalisering til fælles POS-model ----------
const amt = (set) => (set && set.shopMoney ? parseApiAmount(set.shopMoney.amount) : 0);

function normalizeLocation(n) { return { externalId: n.id, name: n.name, active: n.isActive !== false }; }

function normalizeProduct(p) {
  return {
    externalId: p.id, title: p.title, category: p.productType || null, vendor: p.vendor || null,
    status: String(p.status || 'ACTIVE').toLowerCase(), updatedAt: p.updatedAt,
    variants: p.variants.nodes.map((v) => ({
      externalId: v.id, inventoryItemId: v.inventoryItem?.id || null, tracked: v.inventoryItem?.tracked !== false,
      title: v.title, sku: v.sku || null, priceOre: parseApiAmount(v.price),
      costOre: v.inventoryItem?.unitCost ? parseApiAmount(v.inventoryItem.unitCost.amount) : null,
      options: (v.selectedOptions || []).map((o) => ({ name: o.name, value: o.value })),
    })),
  };
}

function normalizeInventoryLevel(l) {
  const q = Object.fromEntries((l.quantities || []).map((x) => [x.name, x.quantity]));
  return { externalId: l.id, inventoryItemId: l.item.id, locationExternalId: l.location.id, updatedAt: l.updatedAt,
    available: q.available ?? null, onHand: q.on_hand ?? null, committed: q.committed ?? null };
}

function normalizeOrder(o) {
  return {
    externalId: o.id, name: o.name, channel: o.sourceName === 'pos' ? 'pos' : 'online', sourceName: o.sourceName || null,
    locationExternalId: o.retailLocation?.id || null, test: !!o.test,
    createdAt: o.createdAt, processedAt: o.processedAt, updatedAt: o.updatedAt, cancelledAt: o.cancelledAt || null,
    currency: o.totalPriceSet?.shopMoney?.currencyCode || o.currencyCode, taxesIncluded: !!o.taxesIncluded,
    payment: { status: o.displayFinancialStatus || null }, // POSPaymentSummary: kun status – aldrig kortdata
    totals: {
      subtotalOre: amt(o.subtotalPriceSet), discountsOre: amt(o.totalDiscountsSet), taxOre: amt(o.totalTaxSet), totalOre: amt(o.totalPriceSet),
      currentSubtotalOre: amt(o.currentSubtotalPriceSet), currentDiscountsOre: amt(o.currentTotalDiscountsSet),
      currentTaxOre: amt(o.currentTotalTaxSet), currentTotalOre: amt(o.currentTotalPriceSet), refundedOre: amt(o.totalRefundedSet),
    },
    lines: o.lineItems.nodes.map((l) => ({
      externalId: l.id, variantExternalId: l.variant?.id || null, productExternalId: l.product?.id || null,
      category: l.product?.productType || null, sku: l.sku || null, title: l.title, variantTitle: l.variantTitle || null,
      quantity: l.quantity, currentQuantity: l.currentQuantity,
      unitPriceOre: amt(l.originalUnitPriceSet), netUnitPriceOre: amt(l.discountedUnitPriceAfterAllDiscountsSet),
      discountOre: amt(l.totalDiscountSet),
      taxOre: (l.taxLines || []).reduce((a, t) => a + amt(t.priceSet), 0),
      taxRatePct: l.taxLines?.[0]?.ratePercentage ?? null,
    })),
    // Betalinger på ordren. Bevidst UDEN accountNumber, paymentDetails og receiptJson (kan indeholde kortdata).
    payments: (o.transactions || []).filter((x) => !x.test).map((x) => ({
      externalId: x.id, kind: x.kind, status: x.status, gateway: x.formattedGateway || x.gateway || null,
      method: /cash|kontant/i.test(`${x.gateway} ${x.formattedGateway}`) ? 'cash' : 'card_or_other',
      reference: x.paymentId || null, amountOre: amt(x.amountSet), currency: x.amountSet?.shopMoney?.currencyCode || o.currencyCode,
      processedAt: x.processedAt, locationExternalId: x.location?.id || o.retailLocation?.id || null,
    })),
    refunds: (o.refunds || []).map((r) => ({
      externalId: r.id, processedAt: r.processedAt || r.createdAt, note: r.note || null, totalOre: amt(r.totalRefundedSet),
      lines: r.refundLineItems.nodes.map((x) => ({ lineExternalId: x.lineItem.id, quantity: x.quantity, restockType: x.restockType,
        subtotalOre: amt(x.subtotalSet), taxOre: amt(x.totalTaxSet) })),
    })),
  };
}

// Webhook-topic -> hvad vi skal hente igen. Payload er REST-format.
function webhookToAction(topic, p) {
  switch (topic) {
    case 'orders/create': case 'orders/updated': case 'orders/cancelled': case 'orders/edited':
      return { type: 'order', id: p.admin_graphql_api_id || `gid://shopify/Order/${p.id}` };
    case 'refunds/create':
      return { type: 'order', id: `gid://shopify/Order/${p.order_id}` };
    case 'inventory_levels/update':
      return { type: 'inventory', itemId: `gid://shopify/InventoryItem/${p.inventory_item_id}`, locationId: `gid://shopify/Location/${p.location_id}` };
    case 'products/create': case 'products/update':
      return { type: 'product', id: p.admin_graphql_api_id || `gid://shopify/Product/${p.id}` };
    case 'products/delete':
      return { type: 'product_deleted', id: `gid://shopify/Product/${p.id}` };
    case 'locations/create': case 'locations/update':
      return { type: 'locations' };
    case 'app/uninstalled':
      return { type: 'uninstalled' };
    case 'customers/data_request': case 'customers/redact': case 'shop/redact':
      return { type: 'compliance', topic };
    default:
      return { type: 'ignored' };
  }
}

function createShopifyConnector(config) {
  const { clientId, clientSecret, fetch: f = globalThis.fetch, now = () => new Date(), sleep } = config; // sleep kan injiceres i tests
  const configured = !!(clientId && clientSecret);
  return {
    id: 'shopify', name: 'Shopify POS', status: configured ? 'available' : 'needs_setup',
    description: 'Fysisk kasse (Shopify POS) og webshop. Ordrer, varer, varianter, lokationer og lager.',
    scopes: SCOPES, apiVersion: API_VERSION, webhookTopics: WEBHOOK_TOPICS,
    capabilities: { orders: true, products: true, variants: true, inventory: true, locations: true, refunds: true, webhooks: true, write: false },
    isValidAccountId: isValidShopDomain,
    authUrl: (o) => buildAuthUrl({ ...o, clientId }),
    verifyCallback: (query) => verifyCallbackHmac(query, clientSecret),
    exchangeCode: ({ shop, code }) => exchangeCode({ shop, code, clientId, clientSecret, fetch: f, now }),
    refresh: ({ shop, refresh }) => refreshToken({ shop, refresh, clientId, clientSecret, fetch: f, now }),
    verifyWebhook: (raw, h) => verifyWebhook(raw, h, clientSecret),
    webhookMeta: (headers) => ({
      topic: headers['x-shopify-topic'], account: headers['x-shopify-shop-domain'], deliveryId: headers['x-shopify-webhook-id'],
      eventId: headers['x-shopify-event-id'] || null, triggeredAt: headers['x-shopify-triggered-at'] || null, hmac: headers['x-shopify-hmac-sha256'],
    }),
    webhookToAction,
    api({ shop, getToken, onAuthError }) {
      const c = createClient({ shop, getToken, onAuthError, fetch: f, sleep });
      const all = async (gen) => { const out = []; for await (const n of gen) out.push(n); return out; };
      return {
        shop: async () => (await c.graphql(Q.shop)).shop,
        locations: async () => (await all(c.paginate(Q.locations, {}, (d) => d.locations))).map(normalizeLocation),
        products: async () => (await all(c.paginate(Q.products, {}, (d) => d.products))).map(normalizeProduct),
        product: async (id) => { const p = (await c.graphql(Q.product, { id })).product; return p ? normalizeProduct(p) : null; },
        inventory: async (locationId) => (await all(c.paginate(Q.inventory, { locationId }, (d) => d.location?.inventoryLevels))).map(normalizeInventoryLevel),
        inventoryLevel: async (itemId, locationId) => { const l = (await c.graphql(Q.inventoryLevel, { itemId, locationId })).inventoryItem?.inventoryLevel; return l ? normalizeInventoryLevel(l) : null; },
        orders: async (sinceIso) => (await all(c.paginate(Q.orders, { query: sinceIso ? `updated_at:>='${sinceIso}'` : null }, (d) => d.orders))).map(normalizeOrder),
        order: async (id) => { const o = (await c.graphql(Q.order, { id })).order; return o ? normalizeOrder(o) : null; },
        async registerWebhooks(uri) {
          const results = [];
          for (const topic of WEBHOOK_TOPICS) {
            const r = (await c.graphql(Q.webhookCreate, { topic, uri })).webhookSubscriptionCreate;
            const taken = r.userErrors.some((e) => /already been taken|already exists/i.test(e.message));
            results.push({ topic, ok: !!r.webhookSubscription || taken, errors: taken ? [] : r.userErrors.map((e) => e.message) });
          }
          return results;
        },
      };
    },
  };
}

module.exports = { createShopifyConnector, API_VERSION, SCOPES, WEBHOOK_TOPICS, QUANTITY_NAMES, Q,
  isValidShopDomain, buildAuthUrl, verifyCallbackHmac, verifyWebhook, normalizeOrder, normalizeProduct, normalizeInventoryLevel,
  webhookToAction, ShopifyAuthError, ShopifyApiError };
