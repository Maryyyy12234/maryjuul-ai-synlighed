'use strict';
// POS Connector Engine: fælles motor for alle kassesystemer.
// - Forbindelser (POSConnection) med krypterede tokens og ejerens valg af,
//   hvilke apps der må bruge data (targets).
// - Normaliserede data: POSLocation, POSProduct, POSVariant, POSOrder (+ linjer,
//   betalingsstatus og refusioner) og POSInventorySnapshot. Én kopi pr. organisation.
// - POSSyncRun (fuld import, løbende, afstemning) og POSWebhookEvent (kø med
//   dubletkontrol og genforsøg).
// - LAGER får lagerantal som optællinger fra kassen (kassen er master).
//   Salg trækkes ALDRIG fra lageret her, så der ikke tælles dobbelt.

const crypto = require('node:crypto');
const { AccessError, NotFoundError } = require('../platform');

const APPS = ['lager', 'puls', 'indsigt', 'overblik'];
const STATUS_LABEL = {
  connecting: 'Forbinder', connected: 'Forbundet', syncing: 'Synkroniserer', requires_action: 'Kræver handling',
  error: 'Fejl', disconnected: 'Frakoblet',
};
const MAX_EVENT_ATTEMPTS = 5;
const uid = (p) => `${p}_${crypto.randomUUID().slice(0, 12)}`;

function createPosEngine({ platform, lager, registry, vault, webhookUri = null, now = () => new Date() }) {
  const connections = new Map();
  const credentials = new Map();     // connectionId -> sealed tokens (aldrig i klartekst)
  const oauthStates = new Map();
  const locations = new Map();       // `${conn}|${ext}`
  const products = new Map();
  const variants = new Map();
  const variantByItem = new Map();   // `${conn}|${inventoryItemId}` -> variant key
  const orders = new Map();
  const inventory = new Map();       // `${conn}|${item}|${loc}`
  const syncRuns = [];
  const events = new Map();          // `${provider}|${deliveryId}`
  const lagerLinks = new Map();      // lagerProductId -> variant key
  const iso = () => now().toISOString();
  const k = (...a) => a.join('|');

  // ---------- Adgang ----------
  function requireOwner(actor) {
    if (!platform.isOwner(actor)) throw new AccessError('Kun ejeren kan forbinde, afbryde og styre datadeling for kassesystemer');
  }
  function requireAdmin(actor) {
    if (actor.type !== 'user' || !['owner', 'admin'].includes(actor.role)) throw new AccessError('Kræver ejer eller administrator');
  }
  function conn(actor, id) {
    const c = connections.get(id);
    if (!c || c.organization_id !== actor.organization_id) throw new NotFoundError('Forbindelsen findes ikke');
    return c;
  }
  function sanitizeTargets(t = {}) { return Object.fromEntries(APPS.map((a) => [a, t[a] !== false])); }

  // ---------- Forbind ----------
  function startConnect(actor, providerId, { account, targets } = {}) {
    requireOwner(actor);
    const connector = registry.get(providerId);
    if (connector.status !== 'available') throw new Error('Integrationen er ikke sat op på serveren endnu (mangler API-nøgler).');
    if (!connector.isValidAccountId(account)) throw new Error('Ugyldig butiksadresse. Brug formen dinbutik.myshopify.com');
    const state = crypto.randomBytes(16).toString('hex');
    oauthStates.set(state, { organization_id: actor.organization_id, provider: providerId, account, targets: sanitizeTargets(targets), by: actor.id, expires: now().getTime() + 10 * 60000 });
    return { state, authUrl: connector.authUrl({ shop: account, redirectUri: connector.redirectUri || null, state }) };
  }
  function setRedirectUri(providerId, uri) { registry.get(providerId).redirectUri = uri; }

  async function completeConnect(providerId, query, { demo = false } = {}) {
    const connector = registry.get(providerId);
    const st = oauthStates.get(query.state);
    oauthStates.delete(query.state);
    if (!st || st.provider !== providerId || st.expires < now().getTime()) throw new AccessError('Ugyldig eller udløbet forbindelsesanmodning. Start forfra.');
    if (!connector.verifyCallback(query)) throw new AccessError('Svaret fra Shopify kunne ikke verificeres');
    if (query.shop !== st.account) throw new AccessError('Butikken matcher ikke den, du startede med');
    const tokens = await connector.exchangeCode({ shop: st.account, code: query.code });
    const missing = connector.scopes.filter((s) => !tokens.scopes.includes(s));
    let c = [...connections.values()].find((x) => x.organization_id === st.organization_id && x.provider === providerId && x.account === st.account);
    if (!c) {
      c = { id: uid('posc'), organization_id: st.organization_id, provider: providerId, account: st.account, created_at: iso(),
        defaults: { min_stock: 2, lead_time_days: null }, cursor: null, webhooks: [], demo };
      connections.set(c.id, c);
    }
    Object.assign(c, { status: missing.length ? 'requires_action' : 'connected', scopes: tokens.scopes, targets: st.targets,
      connected_by: st.by, connected_at: iso(), disconnected_at: null, last_error: missing.length ? `Mangler tilladelser: ${missing.join(', ')}` : null });
    credentials.set(c.id, vault.seal(tokens));
    platform.audit(c.organization_id, { label: st.by, type: 'user' }, 'pos.connected', c.id, { provider: providerId, account: c.account, scopes: tokens.scopes, targets: c.targets });
    return publicConnection(c);
  }

  // ---------- Tokens ----------
  async function getToken(c) {
    const sealed = credentials.get(c.id);
    if (!sealed) throw new AccessError('Forbindelsen har ingen gyldig adgang');
    let t = vault.open(sealed);
    if (t.expiresAt && Date.parse(t.expiresAt) - 60000 < now().getTime()) {
      if (!t.refreshToken || (t.refreshExpiresAt && Date.parse(t.refreshExpiresAt) < now().getTime())) {
        markRequiresAction(c, 'Adgangen er udløbet. Forbind butikken igen.');
        throw new AccessError('Adgangen er udløbet');
      }
      t = await registry.get(c.provider).refresh({ shop: c.account, refresh: t.refreshToken });
      credentials.set(c.id, vault.seal(t));
      platform.audit(c.organization_id, { label: 'system:pos', type: 'system' }, 'pos.token_refreshed', c.id);
    }
    return t.accessToken;
  }
  function markRequiresAction(c, msg) { c.status = 'requires_action'; c.last_error = msg; }
  function api(c) {
    return registry.get(c.provider).api({ shop: c.account, getToken: () => getToken(c), onAuthError: (s, body) => markRequiresAction(c, s === 403 && /scope|access/i.test(body) ? 'Appen mangler en tilladelse i Shopify.' : 'Adgangen er udløbet eller tilbagekaldt. Forbind butikken igen.') });
  }

  // ---------- Normaliserede data (upserts) ----------
  function upsertLocation(c, n) {
    const key = k(c.id, n.externalId);
    const prev = locations.get(key);
    const row = { ...(prev || { id: uid('posl'), lager_location_id: null }), connection_id: c.id, organization_id: c.organization_id, external_id: n.externalId, name: n.name, active: n.active };
    locations.set(key, row);
    return row;
  }
  function upsertProduct(c, n) {
    const key = k(c.id, n.externalId);
    const prev = products.get(key);
    if (prev && prev.updated_at && n.updatedAt && Date.parse(prev.updated_at) > Date.parse(n.updatedAt)) return prev; // ældre version
    const row = { ...(prev || { id: uid('posp') }), connection_id: c.id, organization_id: c.organization_id, external_id: n.externalId,
      title: n.title, category: n.category, vendor: n.vendor, status: n.status, updated_at: n.updatedAt, deleted: false };
    products.set(key, row);
    for (const v of n.variants) {
      const vk = k(c.id, v.externalId);
      const pv = variants.get(vk);
      variants.set(vk, { ...(pv || { id: uid('posv'), lager_product_id: null }), connection_id: c.id, organization_id: c.organization_id,
        product_key: key, external_id: v.externalId, inventory_item_id: v.inventoryItemId, tracked: v.tracked, title: v.title, sku: v.sku,
        price_ore: v.priceOre, cost_ore: v.costOre, options: v.options });
      if (v.inventoryItemId) variantByItem.set(k(c.id, v.inventoryItemId), vk);
      syncLagerProduct(c, vk);
    }
    return row;
  }
  function upsertInventory(c, n) {
    const key = k(c.id, n.inventoryItemId, n.locationExternalId);
    const prev = inventory.get(key);
    if (prev && Date.parse(prev.updated_at) > Date.parse(n.updatedAt)) return { skipped: 'older' };
    const row = { id: prev?.id || uid('posi'), connection_id: c.id, organization_id: c.organization_id, inventory_item_id: n.inventoryItemId,
      location_external_id: n.locationExternalId, available: n.available, on_hand: n.onHand, committed: n.committed, updated_at: n.updatedAt, external_id: n.externalId };
    inventory.set(key, row);
    applyInventoryToLager(c, row);
    return row;
  }
  function upsertOrder(c, n) {
    const key = k(c.id, n.externalId);
    const prev = orders.get(key);
    if (prev && Date.parse(prev.updated_at) > Date.parse(n.updatedAt)) return { skipped: 'older', order: prev };
    // Samme tidsstempel kan dække over flere ændringer (sekundpræcision): sammenlign indholdet.
    const hash = crypto.createHash('sha256').update(JSON.stringify(n)).digest('hex');
    if (prev && prev.hash === hash) return { skipped: 'unchanged', order: prev };
    const row = { id: prev?.id || uid('poso'), connection_id: c.id, organization_id: c.organization_id, external_id: n.externalId, name: n.name,
      channel: n.channel, source_name: n.sourceName, location_external_id: n.locationExternalId, test: n.test,
      created_at: n.createdAt, processed_at: n.processedAt, updated_at: n.updatedAt, cancelled_at: n.cancelledAt,
      currency: n.currency, taxes_included: n.taxesIncluded, payment: n.payment, totals: n.totals,
      lines: n.lines, refunds: n.refunds, demo: !!c.demo, first_seen_at: prev?.first_seen_at || iso(), hash };
    orders.set(key, row);
    return { order: row, created: !prev };
  }

  // ---------- LAGER: kassen er master for lagerantal ----------
  function lagerEnabled(c) { return c.status !== 'disconnected' && c.targets?.lager && platform.isModuleActive(c.organization_id, 'lager'); }
  function lagerActor(c) { return platform.systemActor(c.organization_id, `pos-${c.provider}`, 'lager'); }
  function ensureLagerLocation(c, locExt) {
    const loc = locations.get(k(c.id, locExt));
    if (!loc) return null;
    if (!loc.lager_location_id) loc.lager_location_id = lager.createLocation(lagerActor(c), `${loc.name}`).id;
    return loc.lager_location_id;
  }
  function syncLagerProduct(c, vk) {
    if (!lagerEnabled(c)) return null;
    const v = variants.get(vk); const p = products.get(v.product_key);
    if (!v.tracked) return null;
    const name = v.title && v.title !== 'Default Title' ? `${p.title} – ${v.title}` : p.title;
    const a = lagerActor(c);
    if (!v.lager_product_id) {
      const lp = lager.createProduct(a, { name, sku: v.sku || v.external_id, category: p.category, cost_ore: v.cost_ore, price_ore: v.price_ore,
        min_stock: c.defaults.min_stock, lead_time_days: c.defaults.lead_time_days, source_of_truth: c.provider, external_ref: vk,
        variant_title: v.title, options: v.options });
      v.lager_product_id = lp.id; lagerLinks.set(lp.id, vk);
    } else {
      platform.repo(a, 'lager').update('products', v.lager_product_id, { name, cost_ore: v.cost_ore, price_ore: v.price_ore, category: p.category, status: p.deleted ? 'archived' : 'active' });
    }
    return v.lager_product_id;
  }
  function applyInventoryToLager(c, snap) {
    if (!lagerEnabled(c) || snap.available == null) return;
    const vk = variantByItem.get(k(c.id, snap.inventory_item_id));
    if (!vk) return;
    const pid = syncLagerProduct(c, vk);
    const lid = ensureLagerLocation(c, snap.location_external_id);
    if (!pid || !lid) return;
    const a = lagerActor(c);
    if (lager.onHand(a, pid, lid) === snap.available) return;
    lager.recordMovement(a, { productId: pid, locationId: lid, type: 'count', quantity: snap.available, source: c.provider,
      reason: 'Synkroniseret fra kassesystemet (kassen er master for lagerantal)', reference: snap.external_id,
      idempotencyKey: `${c.provider}:${snap.external_id}:${snap.updated_at}:${snap.available}`, allowNegative: true });
  }
  // Salgshistorik til LAGER-prognoser kommer fra kassedata, ikke fra lagerbevægelser.
  lager.setSalesProvider((actor, lagerProductId) => {
    const vk = lagerLinks.get(lagerProductId);
    if (!vk) return null;
    const v = variants.get(vk);
    const c = connections.get(v.connection_id);
    if (!c || c.organization_id !== actor.organization_id) return null;
    const out = [];
    for (const o of orders.values()) {
      if (o.connection_id !== c.id || o.cancelled_at || o.test) continue;
      for (const l of o.lines) if (l.variantExternalId === v.external_id && l.currentQuantity > 0) out.push({ at: o.processed_at, qty: l.currentQuantity });
    }
    return out;
  });

  // ---------- Synkronisering ----------
  async function runSync(actorOrSystem, connectionId, { mode = 'incremental' } = {}) {
    const c = connections.get(connectionId);
    if (!c || (actorOrSystem && actorOrSystem.organization_id && actorOrSystem.organization_id !== c.organization_id)) throw new NotFoundError('Forbindelsen findes ikke');
    if (actorOrSystem?.type === 'user') requireAdmin(actorOrSystem);
    if (c.status === 'disconnected') throw new Error('Forbindelsen er afbrudt');
    const run = { id: uid('possr'), connection_id: c.id, organization_id: c.organization_id, mode, status: 'running', started_at: iso(), finished_at: null,
      counts: { locations: 0, products: 0, variants: 0, inventory: 0, orders: 0, orders_skipped: 0 }, errors: [], triggered_by: actorOrSystem?.label || 'system' };
    syncRuns.push(run);
    const prevStatus = c.status;
    c.status = 'syncing';
    const step = async (name, fn) => { try { await fn(); } catch (e) { run.errors.push({ step: name, message: e.message, code: e.code || null }); if (e.code === 'AUTH' || e instanceof AccessError) throw e; } };
    try {
      const s = api(c);
      if (mode === 'initial' || !c.shop_name) await step('shop', async () => { const sh = await s.shop(); Object.assign(c, { shop_name: sh.name, timezone: sh.ianaTimezone, currency: sh.currencyCode }); });
      if (mode !== 'incremental') {
        await step('locations', async () => { for (const l of await s.locations()) { upsertLocation(c, l); run.counts.locations++; } });
        await step('products', async () => { for (const p of await s.products()) { upsertProduct(c, p); run.counts.products++; run.counts.variants += p.variants.length; } });
        await step('inventory', async () => {
          for (const loc of [...locations.values()].filter((x) => x.connection_id === c.id && x.active)) {
            for (const lvl of await s.inventory(loc.external_id)) { upsertInventory(c, lvl); run.counts.inventory++; }
          }
        });
      }
      await step('orders', async () => {
        // Afstemning og første import henter alt (Shopify giver 60 dage med read_orders).
        // Løbende synk henter ordrer ændret siden sidst, med 10 min overlap.
        const since = mode === 'incremental' && c.cursor ? new Date(Date.parse(c.cursor) - 600000).toISOString() : null;
        let max = c.cursor;
        for (const o of await s.orders(since)) {
          const r = upsertOrder(c, o);
          r.skipped ? run.counts.orders_skipped++ : run.counts.orders++;
          if (!max || Date.parse(o.updatedAt) > Date.parse(max)) max = o.updatedAt;
        }
        c.cursor = max;
      });
      if (mode === 'initial' && webhookUri && !c.webhooks.length) {
        await step('webhooks', async () => { c.webhooks = await s.registerWebhooks(webhookUri); });
      }
      run.status = run.errors.length ? 'partial' : 'succeeded';
      c.status = 'connected';
      c.last_sync_at = iso();
      if (!run.errors.length) { c.last_success_at = c.last_sync_at; c.last_error = null; } else c.last_error = run.errors.map((e) => e.message).join(' · ');
    } catch (e) {
      run.status = 'failed';
      if (!run.errors.length) run.errors.push({ step: 'connection', message: e.message, code: e.code || null });
      c.status = e.code === 'AUTH' || e instanceof AccessError ? 'requires_action' : 'error';
      c.last_error = e.message; c.last_sync_at = iso();
    } finally {
      run.finished_at = iso();
      if (c.status === 'syncing') c.status = prevStatus === 'syncing' ? 'connected' : prevStatus;
      platform.audit(c.organization_id, { label: run.triggered_by, type: 'system' }, 'pos.sync', run.id, { mode, status: run.status, counts: run.counts, errors: run.errors.length });
    }
    return { ...run };
  }

  // ---------- Webhooks ----------
  function lower(h) { return Object.fromEntries(Object.entries(h || {}).map(([a, b]) => [a.toLowerCase(), Array.isArray(b) ? b[0] : b])); }
  function receiveWebhook(providerId, { headers, rawBody }) {
    const connector = registry.get(providerId);
    const h = lower(headers);
    const meta = connector.webhookMeta(h);
    if (!connector.verifyWebhook(rawBody, meta.hmac)) return { status: 401, result: 'invalid_signature' };
    if (!meta.deliveryId) return { status: 400, result: 'missing_delivery_id' };
    const ek = k(providerId, meta.deliveryId);
    if (events.has(ek)) return { status: 200, result: 'duplicate', eventId: events.get(ek).id };
    let payload;
    try { payload = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody); } catch { return { status: 400, result: 'invalid_json' }; }
    const c = [...connections.values()].find((x) => x.provider === providerId && x.account === meta.account && x.status !== 'disconnected');
    const action = connector.webhookToAction(meta.topic, payload);
    const ev = { id: uid('posw'), provider: providerId, delivery_id: meta.deliveryId, event_id: meta.eventId, topic: meta.topic, account: meta.account,
      connection_id: c?.id || null, organization_id: c?.organization_id || null, action, received_at: iso(), triggered_at: meta.triggeredAt,
      status: c || action.type === 'compliance' ? 'queued' : 'ignored', ignored_reason: c ? null : 'Ingen aktiv forbindelse', attempts: 0, last_error: null };
    events.set(ek, ev);
    return { status: 200, result: ev.status, eventId: ev.id };
  }

  async function processEvent(ev) {
    const c = connections.get(ev.connection_id);
    if (ev.action.type === 'compliance') return handleCompliance(ev);
    if (!c || c.status === 'disconnected') { ev.status = 'ignored'; ev.ignored_reason = 'Forbindelsen er afbrudt'; return; }
    const s = api(c);
    switch (ev.action.type) {
      case 'order': { const o = await s.order(ev.action.id); if (o) upsertOrder(c, o); break; }
      case 'inventory': {
        if (!locations.has(k(c.id, ev.action.locationId))) for (const l of await s.locations()) upsertLocation(c, l);
        const l = await s.inventoryLevel(ev.action.itemId, ev.action.locationId); if (l) upsertInventory(c, l); break;
      }
      case 'product': { const p = await s.product(ev.action.id); if (p) upsertProduct(c, p); break; }
      case 'product_deleted': { const p = products.get(k(c.id, ev.action.id)); if (p) { p.deleted = true; p.status = 'archived'; } break; }
      case 'locations': for (const l of await s.locations()) upsertLocation(c, l); break;
      case 'uninstalled': disconnectInternal(c, 'Appen blev afinstalleret i Shopify', 'system:shopify'); break;
      default: break;
    }
    ev.status = 'processed';
  }

  function handleCompliance(ev) {
    // Vi henter og gemmer ikke kundedata (navne, e-mails, adresser) fra kassen.
    // shop/redact: slet alle data for butikken.
    if (ev.topic === 'shop/redact') {
      for (const c of [...connections.values()].filter((x) => x.account === ev.account)) purgeConnectionData(c);
    }
    ev.status = 'processed';
  }

  async function processQueue({ max = 100 } = {}) {
    let n = 0;
    for (const ev of [...events.values()].filter((e) => e.status === 'queued' || (e.status === 'retry' && Date.parse(e.next_attempt_at) <= now().getTime()))) {
      if (n++ >= max) break;
      ev.attempts++;
      try { await processEvent(ev); ev.processed_at = iso(); } catch (e) {
        ev.last_error = e.message;
        if (e.code === 'AUTH' || ev.attempts >= MAX_EVENT_ATTEMPTS) { ev.status = 'failed'; }
        else { ev.status = 'retry'; ev.next_attempt_at = new Date(now().getTime() + 30000 * 2 ** ev.attempts).toISOString(); }
      }
    }
    return n;
  }

  // ---------- Kontrol for ejeren ----------
  function setTargets(actor, connectionId, targets) {
    requireOwner(actor);
    const c = conn(actor, connectionId);
    c.targets = sanitizeTargets({ ...c.targets, ...targets });
    platform.audit(c.organization_id, actor, 'pos.targets_changed', c.id, { targets: c.targets });
    if (c.targets.lager) for (const vk of [...variants.keys()].filter((x) => variants.get(x).connection_id === c.id)) syncLagerProduct(c, vk);
    if (c.targets.lager) for (const s of inventory.values()) if (s.connection_id === c.id) applyInventoryToLager(c, s);
    return publicConnection(c);
  }
  function setDefaults(actor, connectionId, { min_stock, lead_time_days }) {
    requireAdmin(actor);
    const c = conn(actor, connectionId);
    if (min_stock != null) { if (!Number.isInteger(min_stock) || min_stock < 0) throw new Error('Minimumsbeholdning skal være 0 eller mere'); c.defaults.min_stock = min_stock; }
    if (lead_time_days !== undefined) { if (lead_time_days !== null && (!Number.isInteger(lead_time_days) || lead_time_days < 1)) throw new Error('Leveringstid skal være mindst 1 dag'); c.defaults.lead_time_days = lead_time_days; }
    for (const v of variants.values()) if (v.connection_id === c.id && v.lager_product_id) {
      platform.repo(lagerActor(c), 'lager').update('products', v.lager_product_id, { min_stock: c.defaults.min_stock, lead_time_days: c.defaults.lead_time_days });
    }
    platform.audit(c.organization_id, actor, 'pos.defaults_changed', c.id, { ...c.defaults });
    return publicConnection(c);
  }

  function disconnectInternal(c, reason, by) {
    c.status = 'disconnected'; c.disconnected_at = iso(); c.last_error = null; c.disconnect_reason = reason;
    credentials.delete(c.id);
    platform.audit(c.organization_id, { label: by, type: by.startsWith('system') ? 'system' : 'user' }, 'pos.disconnected', c.id, { reason });
  }
  function purgeConnectionData(c) {
    for (const m of [locations, products, variants, orders, inventory]) for (const [key, v] of m) if (v.connection_id === c.id) m.delete(key);
    c.data_deleted_at = iso();
  }
  function disconnect(actor, connectionId, { deleteData = false } = {}) {
    requireOwner(actor);
    const c = conn(actor, connectionId);
    disconnectInternal(c, deleteData ? 'Afbrudt af ejeren, data slettet' : 'Afbrudt af ejeren', actor.id);
    if (deleteData) purgeConnectionData(c);
    return publicConnection(c);
  }
  const DISCONNECT_CONSEQUENCES = [
    'Nye salg og lagerændringer fra kassen kommer ikke længere ind.',
    'Adgangsnøglen slettes med det samme. Beskeder fra kassen afvises.',
    'Allerede hentede tal bliver stående og markeres som historiske, medmindre du vælger at slette dem.',
    'Varer i LAGER fra kassen bliver ikke opdateret, og beholdningen kan blive forældet.',
    'Afinstallér også appen i Shopify for at fjerne adgangen helt i butikken.',
  ];

  // ---------- Læsning (bruges af apps, workers og UI) ----------
  function publicConnection(c) {
    const { cursor, ...rest } = c;
    const runs = syncRuns.filter((r) => r.connection_id === c.id);
    const evs = [...events.values()].filter((e) => e.connection_id === c.id);
    return {
      ...structuredClone(rest), status_label: STATUS_LABEL[c.status] || c.status,
      apps_using_data: APPS.filter((a) => c.status !== 'disconnected' && c.targets?.[a] && platform.isModuleActive(c.organization_id, a)),
      counts: {
        locations: [...locations.values()].filter((x) => x.connection_id === c.id).length,
        products: [...products.values()].filter((x) => x.connection_id === c.id && !x.deleted).length,
        variants: [...variants.values()].filter((x) => x.connection_id === c.id).length,
        orders: [...orders.values()].filter((x) => x.connection_id === c.id).length,
        pos_orders: [...orders.values()].filter((x) => x.connection_id === c.id && x.channel === 'pos').length,
      },
      last_run: runs.length ? structuredClone(runs[runs.length - 1]) : null,
      webhook_stats: { received: evs.length, failed: evs.filter((e) => e.status === 'failed').length, queued: evs.filter((e) => ['queued', 'retry'].includes(e.status)).length },
      disconnect_consequences: DISCONNECT_CONSEQUENCES,
      has_credentials: credentials.has(c.id),
    };
  }
  function listConnections(actor) {
    requireAdmin(actor);
    return [...connections.values()].filter((c) => c.organization_id === actor.organization_id).map(publicConnection);
  }
  function syncHistory(actor, connectionId) { requireAdmin(actor); conn(actor, connectionId); return syncRuns.filter((r) => r.connection_id === connectionId).map((r) => structuredClone(r)); }

  // Dataadgang for apps: kun forbindelser, hvor ejeren har slået appen til.
  function dataFor(orgId, app) {
    const cs = [...connections.values()].filter((c) => c.organization_id === orgId && c.targets?.[app] && !c.data_deleted_at);
    const ids = new Set(cs.map((c) => c.id));
    return {
      connections: cs.map((c) => ({ id: c.id, provider: c.provider, account: c.account, timezone: c.timezone || 'Europe/Copenhagen', status: c.status, demo: !!c.demo, historical: c.status === 'disconnected' })),
      orders: [...orders.values()].filter((o) => ids.has(o.connection_id)),
      variants: new Map([...variants.values()].filter((v) => ids.has(v.connection_id)).map((v) => [k(v.connection_id, v.external_id), v])),
      products: new Map([...products.values()].filter((p) => ids.has(p.connection_id)).map((p) => [k(p.connection_id, p.external_id), p])),
      locations: new Map([...locations.values()].filter((l) => ids.has(l.connection_id)).map((l) => [k(l.connection_id, l.external_id), l])),
    };
  }
  function variantForLagerProduct(lagerProductId) { const vk = lagerLinks.get(lagerProductId); return vk ? structuredClone(variants.get(vk)) : null; }
  function inventoryByLocation(orgId, lagerProductId) {
    const vk = lagerLinks.get(lagerProductId); if (!vk) return [];
    const v = variants.get(vk); if (v.organization_id !== orgId) return [];
    return [...inventory.values()].filter((s) => s.connection_id === v.connection_id && s.inventory_item_id === v.inventory_item_id)
      .map((s) => ({ location: locations.get(k(s.connection_id, s.location_external_id))?.name || s.location_external_id, available: s.available, updated_at: s.updated_at }));
  }

  // Til demo og tests: opret en forbindelse uden OAuth. Markeres tydeligt som demo.
  function createDemoConnection(actor, providerId, { account, tokens, targets }) {
    requireOwner(actor);
    const c = { id: uid('posc'), organization_id: actor.organization_id, provider: providerId, account, created_at: iso(), status: 'connected',
      scopes: tokens.scopes, targets: sanitizeTargets(targets), connected_by: actor.id, connected_at: iso(), defaults: { min_stock: 2, lead_time_days: null },
      cursor: null, webhooks: [], demo: true };
    connections.set(c.id, c);
    credentials.set(c.id, vault.seal(tokens));
    platform.audit(c.organization_id, actor, 'pos.connected', c.id, { provider: providerId, demo: true });
    return publicConnection(c);
  }

  return {
    APPS, STATUS_LABEL, startConnect, completeConnect, setRedirectUri, runSync, receiveWebhook, processQueue,
    setTargets, setDefaults, disconnect, listConnections, syncHistory, dataFor, variantForLagerProduct, inventoryByLocation,
    createDemoConnection, providers: () => registry.list(),
    _debug: { credentials, events, orders, upsertOrder: (connectionId, n) => upsertOrder(connections.get(connectionId), n) },
  };
}

module.exports = { createPosEngine, APPS };
