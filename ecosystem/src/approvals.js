'use strict';
// Godkendelsescenter. Alt, der påvirker penge, eksterne parter eller vigtige
// data, går herigennem. En AI-worker kan foreslå, men aldrig godkende.

const crypto = require('node:crypto');
const { AccessError, NotFoundError } = require('./platform');

const STATUSES = ['pending', 'approved', 'rejected', 'executed', 'failed'];

function createApprovals(platform) {
  const requests = new Map();
  const executors = new Map(); // kind -> async/sync function(request, actor) => result

  function registerExecutor(kind, fn) { executors.set(kind, fn); }

  // Hver godkendelse skal svare på: hvad ændres, hvorfor, hvem foreslår,
  // hvilke data ligger bag, og hvad sker der ved godkendelse.
  function propose(actor, { module, kind, title, change, reason, evidence, effect, payload, uncertainty = null }) {
    for (const [k, v] of Object.entries({ module, kind, title, change, reason, evidence, effect })) {
      if (v === undefined || v === null || v === '') throw new Error(`Godkendelse mangler feltet "${k}"`);
    }
    if (!executors.has(kind)) throw new Error(`Ingen handling registreret for "${kind}"`);
    platform.require(actor, module, actor.type === 'ai_worker' ? 'draft' : 'write');
    const req = {
      id: `apr_${crypto.randomUUID().slice(0, 12)}`, organization_id: actor.organization_id,
      module, kind, title, change, reason, evidence, effect, uncertainty, payload,
      proposed_by: actor.label, proposed_by_type: actor.type, status: 'pending',
      history: [{ status: 'pending', by: actor.label, at: platform.now().toISOString() }],
    };
    requests.set(req.id, req);
    platform.audit(actor.organization_id, actor, 'approval.proposed', req.id, { kind });
    return clone(req);
  }

  function find(actor, id) {
    const r = requests.get(id);
    if (!r || r.organization_id !== actor.organization_id) throw new NotFoundError('Godkendelsen findes ikke');
    return r;
  }

  function list(actor, status) {
    return [...requests.values()]
      .filter((r) => r.organization_id === actor.organization_id)
      .filter((r) => platform.can(actor, r.module, 'read'))
      .filter((r) => !status || r.status === status)
      .map(clone);
  }

  function decide(actor, id, decision, note = '') {
    if (actor.type !== 'user') throw new AccessError('Kun mennesker kan godkende eller afvise');
    if (!['approved', 'rejected'].includes(decision)) throw new Error('Beslutning skal være approved eller rejected');
    const r = find(actor, id);
    if (!platform.can(actor, r.module, 'approve')) throw new AccessError('Du har ikke rettighed til at godkende dette');
    if (r.status !== 'pending') throw new Error(`Godkendelsen er allerede ${r.status}`);
    r.status = decision; r.decided_by = actor.id;
    r.history.push({ status: decision, by: actor.label, note, at: platform.now().toISOString() });
    platform.audit(actor.organization_id, actor, `approval.${decision}`, id, { note });
    return clone(r);
  }

  // Udfører kun en godkendt anmodning, og kun én gang (idempotent).
  function execute(actor, id) {
    const r = find(actor, id);
    if (r.status === 'executed') return { alreadyExecuted: true, result: r.result };
    if (r.status !== 'approved') throw new AccessError('Kun godkendte anmodninger kan udføres');
    try {
      const result = executors.get(r.kind)(clone(r), actor);
      r.status = 'executed'; r.result = result;
      r.history.push({ status: 'executed', by: actor.label, at: platform.now().toISOString() });
      platform.audit(actor.organization_id, actor, 'approval.executed', id);
      return { alreadyExecuted: false, result };
    } catch (err) {
      r.status = 'failed'; r.error = err.message;
      r.history.push({ status: 'failed', by: actor.label, note: err.message, at: platform.now().toISOString() });
      platform.audit(actor.organization_id, actor, 'approval.failed', id, { error: err.message });
      throw err;
    }
  }

  return { STATUSES, registerExecutor, propose, list, decide, execute, get: (a, id) => clone(find(a, id)) };
}

const clone = (o) => structuredClone(o);
module.exports = { createApprovals };
