'use strict';
// SumUp (læseadgang). Kilde: SumUps officielle TypeScript-SDK (@sumup/sdk 0.2.3)
// og developer.sumup.com via søgning, november 2026.
// - Transaktioner: GET /v2.1/merchants/{merchant_code}/transactions/history
//   (scopes transactions.history), paginering via links[rel=next].href, changes_since til løbende synk.
// - Udbetalinger: GET /v1.0/merchants/{merchant_code}/payouts?start_date&end_date
//   (scope payouts.read). Typer: PAYOUT, REFUND_DEDUCTION, CHARGE_BACK_DEDUCTION, DD_RETURN_DEDUCTION, BALANCE_DEDUCTION.
// - Beløb er i hele valutaenheder (fx 899.0) og omregnes til øre uden float.
// - SumUp har webhooks for checkouts, men IKKE for terminalbetalinger -> vi poller.
// SKAL BEKRÆFTES mod developer.sumup.com før produktion (siden var blokeret i udviklingsmiljøet):
// OAuth-adresserne (/authorize og /token) og scope-navnet for profilopslag.

const { parseApiAmount } = require('../../money');

const BASE = 'https://api.sumup.com';
const SCOPES = ['transactions.history', 'payouts.read', 'user.profile_readonly'];

class SumUpAuthError extends Error { constructor(m) { super(m); this.code = 'AUTH'; } }

const amount = (n) => {
  if (n == null) return 0;
  const s = typeof n === 'number' ? n.toFixed(2) : String(n);
  return parseApiAmount(s.startsWith('-') ? s.slice(1) : s) * (s.startsWith('-') ? -1 : 1);
};

const STATUS = { SUCCESSFUL: 'successful', PENDING: 'pending', FAILED: 'failed', CANCELLED: 'cancelled', REFUNDED: 'refunded', CHARGE_BACK: 'chargeback' };
const TYPE = { PAYMENT: 'payment', REFUND: 'refund', CHARGE_BACK: 'chargeback' };
// Kun kortets brand gemmes – aldrig kortnummer eller andre kortdata.
const scheme = (c) => (!c ? null : ['VISA', 'VISA_ELECTRON', 'VISA_VPAY'].includes(c) ? 'VISA' : ['MASTERCARD', 'MAESTRO', 'AMEX'].includes(c) ? c : 'OTHER');

function normalizeTransaction(t) {
  return {
    external_ref: t.transaction_code || t.id, provider_id: t.id || null, type: TYPE[t.type] || 'payment',
    status: STATUS[t.status] || 'unknown', amount_ore: Math.abs(amount(t.amount)), currency: t.currency,
    occurred_at: new Date(t.timestamp).toISOString(), time_known: true, payment_method: t.payment_type === 'CASH' ? 'cash' : 'card',
    channel: t.payment_type === 'POS' ? 'terminal' : t.payment_type === 'ECOM' ? 'online' : (t.payment_type || 'unknown').toLowerCase(),
    card_scheme: scheme(t.card_type), refunded_ore: Math.abs(amount(t.refunded_amount)),
    payout_date: t.payout_date || null, terminal_external_id: null, merchant_account: null,
  };
}
function normalizePayoutRecord(p) {
  return { record_id: String(p.id), type: p.type, amount_ore: amount(p.amount), fee_ore: Math.abs(amount(p.fee)), currency: p.currency,
    date: p.date, status: p.status === 'SUCCESSFUL' ? 'paid' : 'failed', reference: p.reference || null, transaction_ref: p.transaction_code || null };
}

function createSumUpConnector({ clientId, clientSecret, fetch: f = globalThis.fetch, now = () => new Date(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) { // sleep kan injiceres i tests
  const configured = !!(clientId && clientSecret);
  async function token(params) {
    const res = await f(`${BASE}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params }).toString(), signal: AbortSignal.timeout(30000) });
    if (res.status === 400 || res.status === 401) throw new SumUpAuthError('SumUp afviste godkendelsen. Forbind igen.');
    if (!res.ok) throw new Error(`SumUp svarede ${res.status}`);
    const j = await res.json();
    const t = now().getTime();
    return { accessToken: j.access_token, refreshToken: j.refresh_token || null, scopes: String(j.scope || '').split(/[ ,]/).filter(Boolean),
      expiresAt: j.expires_in ? new Date(t + j.expires_in * 1000).toISOString() : null };
  }
  function api({ getToken }) {
    async function get(path, maxRetries = 4) {
      for (let attempt = 0; ; attempt++) {
        let res;
        try { res = await f(`${BASE}${path}`, { headers: { authorization: `Bearer ${await getToken()}`, accept: 'application/json' }, signal: AbortSignal.timeout(30000) }); }
        catch (e) { if (attempt < maxRetries) { await sleep(500 * 2 ** attempt); continue; } throw new Error(`Kunne ikke nå SumUp: ${e.message}`); }
        if (res.status === 401 || res.status === 403) throw new SumUpAuthError(res.status === 403 ? 'Appen mangler adgang i SumUp. Forbind igen og godkend adgangene.' : 'Adgangen til SumUp er udløbet. Forbind igen.');
        if (res.status === 429 || res.status >= 500) { if (attempt < maxRetries) { await sleep(Number(res.headers.get('retry-after') || 0) * 1000 || 1000 * 2 ** attempt); continue; } throw new Error(`SumUp svarede ${res.status} efter flere forsøg`); }
        if (!res.ok) throw new Error(`SumUp svarede ${res.status}`);
        return res.json();
      }
    }
    return {
      async merchant() { const me = await get('/v0.1/me'); const mp = me.merchant_profile || {}; return { merchant_code: mp.merchant_code, name: mp.company_name || mp.merchant_code, country: mp.country || null, currency: mp.default_currency || null }; },
      async transactions(merchantCode, { changesSince = null, oldest = null } = {}) {
        const q = new URLSearchParams({ order: 'ascending', limit: '100' });
        if (changesSince) q.set('changes_since', changesSince); else if (oldest) q.set('oldest_time', oldest);
        const out = []; let path = `/v2.1/merchants/${encodeURIComponent(merchantCode)}/transactions/history?${q}`;
        for (let page = 0; page < 1000; page++) {
          const j = await get(path);
          out.push(...(j.items || []).map(normalizeTransaction));
          const next = (j.links || []).find((l) => l.rel === 'next');
          if (!next) break;
          path = `/v2.1/merchants/${encodeURIComponent(merchantCode)}/transactions/history?${next.href.replace(/^\?/, '')}`;
        }
        return out;
      },
      async payouts(merchantCode, { start, end }) {
        const q = new URLSearchParams({ start_date: start, end_date: end, order: 'asc', limit: '1000', format: 'json' });
        return (await get(`/v1.0/merchants/${encodeURIComponent(merchantCode)}/payouts?${q}`)).map(normalizePayoutRecord);
      },
    };
  }
  return {
    id: 'sumup', name: 'SumUp', kind: 'api', status: configured ? 'available' : 'needs_setup', scopes: SCOPES,
    description: 'Kortterminaler (SumUp Air/Solo). Transaktioner, refunderinger, chargebacks, gebyrer og udbetalinger via API.',
    data: ['Transaktioner', 'Refunderinger', 'Chargebacks', 'Gebyrer', 'Udbetalinger'], webhooks: false,
    authUrl: ({ redirectUri, state }) => `${BASE}/authorize?${new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri || '', scope: SCOPES.join(' '), state })}`,
    exchangeCode: ({ code, redirectUri }) => token({ grant_type: 'authorization_code', code, redirect_uri: redirectUri || '' }),
    refresh: ({ refresh }) => token({ grant_type: 'refresh_token', refresh_token: refresh }),
    api,
  };
}

module.exports = { createSumUpConnector, normalizeTransaction, normalizePayoutRecord, SumUpAuthError, SCOPES };
