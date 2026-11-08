'use strict';
// Payment Connector Engine. Én fælles motor for alle betalingsudbydere:
// API (SumUp) og filimport (Nets/MyNets m.fl.). Flere forbindelser pr. virksomhed.
//
// Modeller: PaymentProvider (register), PaymentConnection, MerchantAccount, PaymentTerminal,
// PaymentTransaction, PaymentRefund, PaymentDispute, PaymentFee, PaymentSettlement (linjer),
// PaymentPayout (bundter), PaymentReconciliation (beslutninger), PaymentSyncRun, PaymentImport.
//
// Kortdata gemmes aldrig. Kun reference, type, status, beløb, valuta, tid, kortets brand,
// terminal og forretningsnummer.

const crypto = require('node:crypto');
const { AccessError, NotFoundError } = require('../platform');
const { prepare } = require('./file-import');
const { reconcile } = require('./reconcile');
const { formatDKK } = require('../money');

const APPS = ['puls', 'indsigt', 'overblik']; // LAGER får aldrig betalingsdata: en betaling siger ikke, hvilke varer der er solgt.
const STATUS_LABEL = { connected: 'Forbundet', syncing: 'Synkroniserer', requires_action: 'Kræver handling', error: 'Fejl', disconnected: 'Frakoblet', manual: 'Manuel import' };
const uid = (p) => `${p}_${crypto.randomUUID().slice(0, 12)}`;
const k = (...a) => a.join('|');
const localDate = (iso, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));

function createPaymentEngine({ platform, registry, vault, pos = null, now = () => new Date() }) {
  const connections = new Map(), credentials = new Map(), oauthStates = new Map();
  const accounts = new Map(), terminals = new Map();
  const transactions = new Map(), refunds = new Map(), disputes = new Map();
  const payoutRecords = new Map(), payouts = new Map(), fees = new Map();
  const syncRuns = [], imports = new Map();
  const decisions = new Map(), resolutions = new Map();
  const iso = () => now().toISOString();

  // ---------- Adgang ----------
  const requireOwner = (a) => { if (!platform.isOwner(a)) throw new AccessError('Kun ejeren kan forbinde, afbryde og styre datadeling for betalinger'); };
  const requireAdmin = (a) => { if (a.type !== 'user' || !['owner', 'admin'].includes(a.role)) throw new AccessError('Kræver ejer eller administrator'); };
  function conn(actor, id) { const c = connections.get(id); if (!c || c.organization_id !== actor.organization_id) throw new NotFoundError('Forbindelsen findes ikke'); return c; }
  const targets = (t = {}) => Object.fromEntries(APPS.map((a) => [a, t[a] !== false]));

  function newConnection(orgId, provider, kind, extra) {
    const c = { id: uid('payc'), organization_id: orgId, provider, kind, status: kind === 'file' ? 'manual' : 'connected', targets: targets(extra.targets),
      timezone: 'Europe/Copenhagen', payout_lag_days: kind === 'file' ? 3 : 3, created_at: iso(), last_sync_at: null, last_success_at: null, last_error: null,
      coverage_until: null, cursor: null, demo: !!extra.demo, label: extra.label || null, disconnected_at: null };
    connections.set(c.id, c);
    return c;
  }

  // ---------- Forbind: API (OAuth) ----------
  function startConnect(actor, providerId, { targets: t, redirectUri } = {}) {
    requireOwner(actor);
    const c = registry.get(providerId);
    if (c.status !== 'available') throw new Error('Integrationen er ikke sat op på serveren endnu (mangler API-nøgler).');
    const state = crypto.randomBytes(16).toString('hex');
    oauthStates.set(state, { organization_id: actor.organization_id, provider: providerId, targets: targets(t), by: actor.id, redirectUri, expires: now().getTime() + 600000 });
    return { state, authUrl: c.authUrl({ redirectUri, state }) };
  }
  async function completeConnect(providerId, { code, state }, { demo = false } = {}) {
    const st = oauthStates.get(state); oauthStates.delete(state);
    if (!st || st.provider !== providerId || st.expires < now().getTime()) throw new AccessError('Ugyldig eller udløbet forbindelsesanmodning. Start forfra.');
    if (!code) throw new AccessError('Udbyderen sendte ingen godkendelseskode');
    const connector = registry.get(providerId);
    const tokens = await connector.exchangeCode({ code, redirectUri: st.redirectUri });
    const c = newConnection(st.organization_id, providerId, 'api', { targets: st.targets, demo });
    c.connected_by = st.by; c.scopes = tokens.scopes;
    credentials.set(c.id, vault.seal(tokens));
    const merchant = await api(c).merchant();
    upsertAccount(c, merchant.merchant_code, merchant.name);
    c.label = merchant.name;
    platform.audit(c.organization_id, { label: st.by, type: 'user' }, 'payments.connected', c.id, { provider: providerId });
    return publicConnection(c);
  }
  async function getToken(c) {
    const sealed = credentials.get(c.id);
    if (!sealed) throw new AccessError('Forbindelsen har ingen gyldig adgang');
    let t = vault.open(sealed);
    if (t.expiresAt && Date.parse(t.expiresAt) - 60000 < now().getTime()) {
      if (!t.refreshToken) { c.status = 'requires_action'; c.last_error = 'Adgangen er udløbet. Forbind igen.'; throw new AccessError(c.last_error); }
      t = await registry.get(c.provider).refresh({ refresh: t.refreshToken });
      credentials.set(c.id, vault.seal(t));
      platform.audit(c.organization_id, { label: 'system:payments', type: 'system' }, 'payments.token_refreshed', c.id);
    }
    return t.accessToken;
  }
  const api = (c) => registry.get(c.provider).api({ getToken: () => getToken(c) });

  // ---------- Forbind: fil ----------
  function createFileConnection(actor, providerId, { label, targets: t } = {}) {
    requireOwner(actor);
    const info = registry.info(providerId);
    if (!info || info.kind !== 'file') throw new Error('Denne udbyder understøtter ikke filimport endnu');
    const c = newConnection(actor.organization_id, providerId, 'file', { label: label || info.name, targets: t });
    platform.audit(c.organization_id, actor, 'payments.file_connection_created', c.id, { provider: providerId });
    return publicConnection(c);
  }

  // ---------- Upserts ----------
  function upsertAccount(c, ext, name) {
    if (!ext) return null;
    const key = k(c.id, ext);
    if (!accounts.has(key)) accounts.set(key, { id: uid('paym'), organization_id: c.organization_id, connection_id: c.id, external_id: ext, name: name || ext });
    return accounts.get(key);
  }
  function upsertTerminal(c, ext) {
    if (!ext) return null;
    const key = k(c.id, ext);
    if (!terminals.has(key)) terminals.set(key, { id: uid('payt'), organization_id: c.organization_id, connection_id: c.id, external_id: ext, name: ext, pos_location: null });
    return terminals.get(key);
  }
  const mapFor = (type) => (type === 'refund' ? refunds : type === 'chargeback' ? disputes : transactions);
  // Returnerer 'created' | 'updated' | 'duplicate'
  function upsertTx(c, n, source) {
    const map = mapFor(n.type);
    const key = k(c.id, n.type, n.external_ref);
    const prev = map.get(key);
    const { line, fee_ore, net_ore, payout_ref, ...data } = n;
    const hash = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
    if (prev && prev.hash === hash) return 'duplicate';
    if (data.terminal_external_id) upsertTerminal(c, data.terminal_external_id);
    if (data.merchant_account) upsertAccount(c, data.merchant_account);
    const row = { ...(prev || { id: uid(n.type === 'refund' ? 'payr' : n.type === 'chargeback' ? 'payd' : 'payx'), first_seen_at: iso() }),
      organization_id: c.organization_id, connection_id: c.id, provider: c.provider, ...data, hash, source, updated_at: iso(),
      payout_id: prev?.payout_id || null };
    map.set(key, row);
    if (fee_ore != null) fees.set(k(c.id, 'tx', n.external_ref), { organization_id: c.organization_id, connection_id: c.id, transaction_ref: n.external_ref, amount_ore: fee_ore, currency: n.currency, date: localDate(n.occurred_at, c.timezone), source });
    if (n.payout_date && n.type === 'payment') {
      const net = net_ore != null ? net_ore : n.amount_ore - (fee_ore || 0);
      payoutRecords.set(k(c.id, `file:${n.external_ref}`), { connection_id: c.id, record_id: `file:${n.external_ref}`, type: 'PAYOUT', amount_ore: net, fee_ore: fee_ore || 0,
        currency: n.currency, date: n.payout_date, status: 'paid', reference: payout_ref || null, transaction_ref: n.external_ref });
    }
    return prev ? 'updated' : 'created';
  }
  // Udbetalinger bygges deterministisk ud fra alle udbetalingsposter for forbindelsen.
  function rebuildPayouts(c) {
    for (const [key, p] of payouts) if (p.connection_id === c.id) payouts.delete(key);
    for (const t of transactions.values()) if (t.connection_id === c.id) t.payout_id = null;
    for (const r of [...payoutRecords.values()].filter((x) => x.connection_id === c.id && x.status === 'paid')) {
      const pk = k(c.id, r.reference || 'uden-reference', r.date, r.currency);
      if (!payouts.has(pk)) payouts.set(pk, { id: `payo_${crypto.createHash('sha1').update(pk).digest('hex').slice(0, 12)}`, organization_id: c.organization_id, connection_id: c.id, provider: c.provider,
        reference: r.reference, date: r.date, currency: r.currency, gross_ore: 0, fees_ore: 0, deductions_ore: 0, net_ore: 0, lines: [] });
      const p = payouts.get(pk);
      p.net_ore += r.amount_ore; p.fees_ore += r.fee_ore;
      if (r.type === 'PAYOUT') p.gross_ore += r.amount_ore + r.fee_ore; else p.deductions_ore += Math.abs(r.amount_ore);
      p.lines.push({ record_id: r.record_id, type: r.type, transaction_ref: r.transaction_ref, amount_ore: r.amount_ore, fee_ore: r.fee_ore });
      if (r.type === 'PAYOUT' && r.transaction_ref) {
        const t = transactions.get(k(c.id, 'payment', r.transaction_ref));
        if (t) { t.payout_id = p.id; t.payout_date = r.date; }
        fees.set(k(c.id, 'payout', r.record_id), { organization_id: c.organization_id, connection_id: c.id, transaction_ref: r.transaction_ref, payout_id: p.id, amount_ore: r.fee_ore, currency: r.currency, date: r.date, source: 'payout' });
        fees.delete(k(c.id, 'tx', r.transaction_ref)); // samme gebyr tælles ikke to gange
      }
    }
  }

  // ---------- Synkronisering (API) ----------
  async function runSync(actorOrNull, connectionId, { mode = 'incremental' } = {}) {
    const c = connections.get(connectionId);
    if (!c || (actorOrNull && actorOrNull.organization_id !== c.organization_id)) throw new NotFoundError('Forbindelsen findes ikke');
    if (actorOrNull?.type === 'user') requireAdmin(actorOrNull);
    if (c.status === 'disconnected') throw new Error('Forbindelsen er afbrudt');
    if (c.kind !== 'api') throw new Error('Denne forbindelse bruger filimport');
    const run = { id: uid('paysr'), organization_id: c.organization_id, connection_id: c.id, mode, status: 'running', started_at: iso(),
      counts: { created: 0, updated: 0, duplicates: 0, payout_records: 0 }, errors: [], triggered_by: actorOrNull?.label || 'system' };
    syncRuns.push(run);
    c.status = 'syncing';
    try {
      const s = api(c);
      const acct = [...accounts.values()].find((a) => a.connection_id === c.id);
      const since = mode === 'incremental' && c.cursor ? c.cursor : null;
      const oldest = new Date(now().getTime() - 90 * 86400000).toISOString();
      for (const t of await s.transactions(acct.external_id, { changesSince: since, oldest })) {
        const r = upsertTx(c, t, 'api'); run.counts[r === 'duplicate' ? 'duplicates' : r]++;
      }
      const start = (since ? new Date(Date.parse(since) - 14 * 86400000) : new Date(oldest)).toISOString().slice(0, 10);
      for (const p of await s.payouts(acct.external_id, { start, end: localDate(iso(), c.timezone) })) {
        payoutRecords.set(k(c.id, p.record_id), { connection_id: c.id, ...p }); run.counts.payout_records++;
      }
      rebuildPayouts(c);
      c.cursor = run.started_at; c.coverage_until = run.started_at;
      run.status = 'succeeded'; c.status = 'connected'; c.last_success_at = iso(); c.last_error = null;
    } catch (e) {
      run.status = 'failed'; run.errors.push({ message: e.message, code: e.code || null });
      c.status = e.code === 'AUTH' || e instanceof AccessError ? 'requires_action' : 'error'; c.last_error = e.message;
    } finally {
      c.last_sync_at = iso(); run.finished_at = iso();
      platform.audit(c.organization_id, { label: run.triggered_by, type: 'system' }, 'payments.sync', run.id, { status: run.status, counts: run.counts });
    }
    return structuredClone(run);
  }

  // ---------- Filimport: forhåndsvis -> bekræft eller annullér ----------
  function previewImport(actor, connectionId, text, { mapping = null, fileName = 'fil.csv' } = {}) {
    requireAdmin(actor);
    const c = conn(actor, connectionId);
    if (c.status === 'disconnected') throw new Error('Forbindelsen er afbrudt');
    const prep = prepare(text, { mapping, timezone: c.timezone });
    const earlier = [...imports.values()].find((i) => i.connection_id === c.id && i.file_hash === prep.fileHash && i.status === 'imported');
    const existing = prep.valid.filter((r) => mapFor(r.type).has(k(c.id, r.type, r.external_ref))).length;
    const imp = { id: uid('payi'), organization_id: c.organization_id, connection_id: c.id, file_name: String(fileName).slice(0, 120), status: 'preview', created_at: iso(), created_by: actor.id,
      file_hash: prep.fileHash, mapping: prep.mapping, header: prep.header, row_count: prep.rowCount, valid_count: prep.valid.length, error_count: prep.errors.length,
      already_imported_count: existing, duplicate_file_of: earlier?.id || null, errors: prep.errors, _rows: prep.valid };
    imports.set(imp.id, imp);
    const { _rows, ...pub } = imp;
    return { ...structuredClone(pub), preview: prep.preview, missingRequired: prep.missingRequired, blockedColumns: prep.blockedColumns, fields: prep.fields,
      warnings: [earlier ? `Den samme fil blev importeret ${earlier.finished_at}. Eksisterende transaktioner springes over.` : null, existing ? `${existing} rækker findes allerede og bliver ikke talt med igen.` : null].filter(Boolean) };
  }
  function confirmImport(actor, importId) {
    requireAdmin(actor);
    const imp = imports.get(importId);
    if (!imp || imp.organization_id !== actor.organization_id) throw new NotFoundError('Importen findes ikke');
    if (imp.status !== 'preview') throw new Error(`Importen er allerede ${imp.status === 'imported' ? 'gennemført' : 'annulleret'}`);
    const c = connections.get(imp.connection_id);
    if (c.status === 'disconnected') throw new Error('Forbindelsen er afbrudt');
    const counts = { created: 0, updated: 0, duplicates: 0 };
    for (const r of imp._rows) { const res = upsertTx(c, r, `file:${imp.id}`); counts[res === 'duplicate' ? 'duplicates' : res]++; }
    rebuildPayouts(c);
    const latest = imp._rows.reduce((m, r) => (r.occurred_at > m ? r.occurred_at : m), c.coverage_until || '');
    c.coverage_until = latest || c.coverage_until;
    Object.assign(imp, { status: 'imported', finished_at: iso(), counts });
    delete imp._rows;
    c.last_sync_at = iso(); c.last_success_at = iso();
    platform.audit(c.organization_id, actor, 'payments.import', imp.id, { counts, errors: imp.error_count });
    const { errors, ...pub } = imp;
    return structuredClone(pub);
  }
  function cancelImport(actor, importId) {
    requireAdmin(actor);
    const imp = imports.get(importId);
    if (!imp || imp.organization_id !== actor.organization_id) throw new NotFoundError('Importen findes ikke');
    if (imp.status !== 'preview') throw new Error('Kun en forhåndsvisning kan annulleres');
    imp.status = 'cancelled'; imp.finished_at = iso(); delete imp._rows;
    platform.audit(imp.organization_id, actor, 'payments.import_cancelled', imp.id);
    return { id: imp.id, status: imp.status };
  }
  function importHistory(actor, connectionId) {
    requireAdmin(actor); conn(actor, connectionId);
    return [...imports.values()].filter((i) => i.connection_id === connectionId).map(({ _rows, ...i }) => structuredClone(i)).reverse();
  }

  // ---------- Kontrol ----------
  function setTargets(actor, id, t) { requireOwner(actor); const c = conn(actor, id); c.targets = targets({ ...c.targets, ...t }); platform.audit(c.organization_id, actor, 'payments.targets_changed', c.id, { targets: c.targets }); return publicConnection(c); }
  function mapTerminal(actor, terminalId, posLocationExternalId) {
    requireAdmin(actor);
    const t = [...terminals.values()].find((x) => x.id === terminalId && x.organization_id === actor.organization_id);
    if (!t) throw new NotFoundError('Terminalen findes ikke');
    t.pos_location = posLocationExternalId || null;
    platform.audit(actor.organization_id, actor, 'payments.terminal_mapped', t.id, { pos_location: t.pos_location });
    return { ...t };
  }
  function setPayoutLag(actor, id, days) { requireAdmin(actor); const c = conn(actor, id); if (!Number.isInteger(days) || days < 0 || days > 30) throw new Error('Udbetalingstid skal være 0–30 dage'); c.payout_lag_days = days; return publicConnection(c); }
  function disconnect(actor, id, { deleteData = false } = {}) {
    requireOwner(actor);
    const c = conn(actor, id);
    c.status = 'disconnected'; c.disconnected_at = iso(); credentials.delete(c.id);
    if (deleteData) {
      for (const m of [transactions, refunds, disputes, payoutRecords, payouts, fees, accounts, terminals]) for (const [key, v] of m) if (v.connection_id === c.id) m.delete(key);
      c.data_deleted_at = iso();
    }
    platform.audit(c.organization_id, actor, 'payments.disconnected', c.id, { deleteData });
    return publicConnection(c);
  }
  const DISCONNECT_CONSEQUENCES = [
    'Nye transaktioner, gebyrer og udbetalinger kommer ikke længere ind.',
    'Adgangsnøglen slettes med det samme. Filimport til forbindelsen lukkes.',
    'Hentede data bliver stående og markeres som historiske, medmindre du vælger at slette dem.',
    'Afstemningen kan ikke længere finde nye betalinger fra denne udbyder.',
  ];

  // ---------- Læsning ----------
  function publicConnection(c) {
    const info = registry.info(c.provider);
    const count = (m) => [...m.values()].filter((x) => x.connection_id === c.id).length;
    return {
      id: c.id, provider: c.provider, provider_name: info?.name || c.provider, kind: c.kind, status: c.status, status_label: STATUS_LABEL[c.status] || c.status,
      label: c.label, demo: c.demo, targets: { ...c.targets }, payout_lag_days: c.payout_lag_days,
      apps_using_data: APPS.filter((a) => c.status !== 'disconnected' && c.targets[a] && platform.isModuleActive(c.organization_id, a)),
      merchant_accounts: [...accounts.values()].filter((a) => a.connection_id === c.id).map((a) => ({ id: a.id, external_id: a.external_id, name: a.name })),
      terminals: [...terminals.values()].filter((t) => t.connection_id === c.id).map((t) => ({ id: t.id, external_id: t.external_id, pos_location: t.pos_location })),
      counts: { transactions: count(transactions), refunds: count(refunds), disputes: count(disputes), payouts: count(payouts) },
      data_shared: info?.data || [], last_sync_at: c.last_sync_at, last_success_at: c.last_success_at, last_error: c.last_error, coverage_until: c.coverage_until,
      disconnected_at: c.disconnected_at, data_deleted_at: c.data_deleted_at || null, created_at: c.created_at, has_credentials: credentials.has(c.id),
      last_run: syncRuns.filter((r) => r.connection_id === c.id).slice(-1)[0] || null, disconnect_consequences: DISCONNECT_CONSEQUENCES,
    };
  }
  function listConnections(actor) { requireAdmin(actor); return [...connections.values()].filter((c) => c.organization_id === actor.organization_id).map(publicConnection); }

  // Data til apps: kun forbindelser, hvor ejeren har slået appen til.
  function dataFor(orgId, app) {
    const cs = [...connections.values()].filter((c) => c.organization_id === orgId && c.targets[app] && !c.data_deleted_at);
    const ids = new Set(cs.map((c) => c.id));
    const pick = (m) => [...m.values()].filter((x) => ids.has(x.connection_id)).map((x) => ({ ...x, timezone: connections.get(x.connection_id).timezone }));
    return { connections: cs.map((c) => publicConnection(c)), transactions: pick(transactions), refunds: pick(refunds), disputes: pick(disputes), payouts: pick(payouts).map((p) => structuredClone(p)), fees: pick(fees),
      terminals: pick(terminals), raw: cs };
  }

  // ---------- Afstemning ----------
  function posPaymentsFor(orgId) {
    if (!pos) return { available: false, payments: [] };
    const d = pos.dataFor(orgId, 'puls');
    if (!d.connections.length) return { available: false, payments: [] };
    const out = [];
    for (const o of d.orders) {
      if (o.test) continue;
      const tz = d.connections.find((c) => c.id === o.connection_id)?.timezone || 'Europe/Copenhagen';
      for (const p of o.payments || []) {
        if (p.method === 'cash' || p.status !== 'SUCCESS' || !['SALE', 'CAPTURE', 'REFUND'].includes(p.kind)) continue;
        out.push({ key: `${o.connection_id}|${p.externalId}`, order_key: `${o.connection_id}|${o.external_id}`, order_name: o.name, kind: p.kind === 'REFUND' ? 'refund' : 'payment',
          amount_ore: p.amountOre, currency: p.currency, at: p.processedAt, local_date: localDate(p.processedAt, tz), location: p.locationExternalId, reference: p.reference, gateway: p.gateway,
          order_cancelled: !!o.cancelled_at, split: (o.payments || []).filter((x) => x.kind === 'SALE').length > 1 });
      }
    }
    return { available: true, payments: out };
  }
  function reconcileFor(orgId) {
    const d = dataFor(orgId, 'puls');
    const pp = posPaymentsFor(orgId);
    if (!d.connections.some((c) => c.status !== 'disconnected' || c.counts.transactions)) return { available: false, reason: 'Ingen betalingsdata endnu. Forbind en betalingsudbyder eller importér en rapport.', items: [] };
    if (!pp.available) return { available: false, reason: 'Afstemning kræver et forbundet kassesystem, som PULS må bruge.', items: [] };
    const tx = [...d.transactions, ...d.refunds, ...d.disputes].map((t) => ({ ...t, key: `${t.connection_id}|${t.type}|${t.external_ref}`, terminal_key: t.terminal_external_id ? `${t.connection_id}|${t.terminal_external_id}` : null, local_date: localDate(t.occurred_at, t.timezone) }));
    const terminalLocation = new Map(d.terminals.filter((t) => t.pos_location).map((t) => [`${t.connection_id}|${t.external_id}`, t.pos_location]));
    const coverage = new Map(d.raw.map((c) => [c.id, c.coverage_until]));
    // Kun kassebetalinger i den periode, hvor der findes betalingsdata, afstemmes.
    const firstTx = tx.reduce((m, t) => (!m || t.occurred_at < m ? t.occurred_at : m), null);
    if (!firstTx) return { available: true, items: [], coverage_from: null, note: 'Ingen transaktioner fra betalingsudbyderen endnu.' };
    const from = Date.parse(firstTx) - 3600000;
    const inScope = pp.payments.filter((p) => Date.parse(p.at) >= from);
    const items = reconcile({ posPayments: inScope, transactions: tx, terminalLocation, decisions: new Map([...decisions].filter(([, v]) => v.organization_id === orgId)),
      resolutions: new Map([...resolutions].filter(([, v]) => v.organization_id === orgId)), coverage, now: now(), fmt: (o, cur) => (cur === 'DKK' || !cur ? formatDKK(o) : `${(o / 100).toFixed(2)} ${cur}`) });
    return { available: true, items, coverage_from: new Date(from).toISOString(), excluded_before: pp.payments.length - inScope.length };
  }
  function decide(actor, itemKey, decision, { txKey = null, note = '' } = {}) {
    if (actor.type !== 'user') throw new AccessError('Kun mennesker kan godkende eller afvise et match');
    platform.require(actor, 'puls', 'write');
    const r = reconcileFor(actor.organization_id);
    const it = r.items.find((i) => i.key === itemKey);
    if (!it) throw new NotFoundError('Afstemningsposten findes ikke længere');
    if (decision === 'confirm' || decision === 'reject') {
      let posKey = it.pos?.key, tKey = it.tx?.key;
      if (it.method === 'ambiguous') { if (decision !== 'confirm' || !it.candidates.includes(txKey)) throw new Error('Vælg en af de mulige betalinger'); tKey = txKey; }
      else if (!it.suggestion) throw new Error('Kun forslag kan bekræftes eller afvises');
      decisions.set(`${posKey}::${tKey}`, { organization_id: actor.organization_id, pos: posKey, tx: tKey, decision: decision === 'confirm' ? 'confirmed' : 'rejected', by: actor.id, at: iso(), note });
    } else if (decision === 'resolve') {
      if (!note.trim()) throw new Error('Skriv kort, hvordan sagen er løst');
      resolutions.set(itemKey, { organization_id: actor.organization_id, note: note.slice(0, 500), by: actor.id, at: iso() });
    } else throw new Error('Ukendt beslutning');
    platform.audit(actor.organization_id, actor, `payments.reconciliation_${decision}`, itemKey, { note });
    return reconcileFor(actor.organization_id).items.find((i) => i.key === itemKey || (i.pos && i.pos.key === it.pos?.key)) || null;
  }

  return { APPS, startConnect, completeConnect, createFileConnection, runSync, previewImport, confirmImport, cancelImport, importHistory,
    setTargets, mapTerminal, setPayoutLag, disconnect, listConnections, dataFor, reconcileFor, decide, providers: () => registry.list(),
    syncHistory: (actor, id) => { requireAdmin(actor); conn(actor, id); return syncRuns.filter((r) => r.connection_id === id).map((r) => structuredClone(r)); },
    _debug: { credentials, transactions, payouts } };
}

module.exports = { createPaymentEngine, APPS, localDate };
