'use strict';
// DEMO: Simuleret SumUp-API (de endpoints vi bruger). Kun til tests og demo.
const crypto = require('node:crypto');

function createFakeSumUp({ now, merchantCode = 'MDEMO123', pageSize = 3 }) {
  const s = { tx: [], payouts: [], tokens: null, pendingCode: null, failNext: 0, calls: [] };
  let seq = 0;
  const major = (ore) => Number((ore / 100).toFixed(2));
  function pay({ amountOre, at = now().toISOString(), card = 'VISA', status = 'SUCCESSFUL', type = 'PAYMENT', code = null }) {
    const t = { id: crypto.randomUUID(), transaction_code: code || `TDEMO${String(++seq).padStart(4, '0')}`, amount: major(amountOre), currency: 'DKK', timestamp: at,
      status, payment_type: 'POS', type, card_type: card, refunded_amount: 0, _changed: now().toISOString(), entry_mode: 'CONTACTLESS', product_summary: 'DEMO' };
    s.tx.push(t); return t;
  }
  function refund(code, amountOre) {
    const orig = s.tx.find((t) => t.transaction_code === code);
    orig.refunded_amount = major(Math.round(orig.refunded_amount * 100) + amountOre); orig.status = 'REFUNDED'; orig._changed = now().toISOString();
    return pay({ amountOre, type: 'REFUND', card: orig.card_type });
  }
  function payout({ date, reference, codes, feePermille = 14 }) {
    for (const code of codes) {
      const t = s.tx.find((x) => x.transaction_code === code);
      const gross = Math.round(t.amount * 100); const fee = Math.round((gross * feePermille) / 1000);
      s.payouts.push({ id: s.payouts.length + 1, type: 'PAYOUT', amount: major(gross - fee), date, currency: 'DKK', fee: major(fee), status: 'SUCCESSFUL', reference, transaction_code: code });
    }
  }
  function deduction({ date, reference, code, amountOre, type = 'REFUND_DEDUCTION' }) {
    s.payouts.push({ id: s.payouts.length + 1, type, amount: -major(amountOre), date, currency: 'DKK', fee: 0, status: 'SUCCESSFUL', reference, transaction_code: code });
  }
  const res = (status, body) => ({ status, ok: status < 300, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) });
  function issue() { s.tokens = { access: `sup_${crypto.randomBytes(6).toString('hex')}`, refresh: `supr_${crypto.randomBytes(6).toString('hex')}`, exp: now().getTime() + 3600000 }; return { access_token: s.tokens.access, refresh_token: s.tokens.refresh, expires_in: 3600, scope: 'transactions.history payouts.read user.profile_readonly' }; }
  async function fetch(url, opts = {}) {
    const u = new URL(url);
    if (u.hostname !== 'api.sumup.com') return res(404, {});
    if (u.pathname === '/token') {
      const p = Object.fromEntries(new URLSearchParams(opts.body)); s.calls.push({ kind: 'token', grant: p.grant_type });
      if (p.grant_type === 'authorization_code' && p.code === s.pendingCode) { s.pendingCode = null; return res(200, issue()); }
      if (p.grant_type === 'refresh_token' && s.tokens && p.refresh_token === s.tokens.refresh) return res(200, issue());
      return res(400, { error: 'invalid_grant' });
    }
    const auth = opts.headers?.authorization;
    if (!s.tokens || auth !== `Bearer ${s.tokens.access}` || now().getTime() > s.tokens.exp) return res(401, { error_code: 'NOT_AUTHORIZED' });
    if (s.failNext > 0) { s.failNext--; return res(503, {}); }
    s.calls.push({ kind: 'api', path: u.pathname });
    if (u.pathname === '/v0.1/me') return res(200, { merchant_profile: { merchant_code: merchantCode, company_name: 'Demo Tøjbutik (DEMO)', country: 'DK', default_currency: 'DKK' } });
    if (u.pathname === `/v2.1/merchants/${merchantCode}/transactions/history`) {
      const q = u.searchParams; const since = q.get('changes_since'); const oldest = q.get('oldest_time'); const offset = Number(q.get('offset') || 0);
      const list = s.tx.filter((t) => (since ? t._changed >= since : !oldest || t.timestamp >= oldest)).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      const page = list.slice(offset, offset + pageSize);
      const links = offset + pageSize < list.length ? [{ rel: 'next', href: `${since ? `changes_since=${since}&` : ''}order=ascending&limit=100&offset=${offset + pageSize}` }] : [];
      return res(200, { items: page.map(({ _changed, ...t }) => t), links });
    }
    if (u.pathname === `/v1.0/merchants/${merchantCode}/payouts`) {
      const q = u.searchParams;
      if (!q.get('start_date') || !q.get('end_date')) return res(400, { message: 'start_date and end_date required' });
      return res(200, s.payouts.filter((p) => p.date >= q.get('start_date') && p.date <= q.get('end_date')));
    }
    return res(404, {});
  }
  function approve(state) { s.pendingCode = crypto.randomBytes(6).toString('hex'); return { code: s.pendingCode, state }; }
  return { state: s, fetch, pay, refund, payout, deduction, approve, merchantCode };
}

module.exports = { createFakeSumUp };
