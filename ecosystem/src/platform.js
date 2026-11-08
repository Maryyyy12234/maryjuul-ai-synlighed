'use strict';
// Fælles platform: virksomheder (tenants), medlemskaber, roller, app-aktivering,
// datadeling og revisionslog. In-memory reference-implementation; den samme
// adgangslogik håndhæves i databasen via RLS (se db/schema.sql).

const crypto = require('node:crypto');

const MODULES = Object.freeze(['overblik', 'puls', 'lager', 'indsigt']);
const ROLES = Object.freeze({
  owner:  { rank: 4, actions: ['read', 'write', 'approve', 'admin'] },
  admin:  { rank: 3, actions: ['read', 'write', 'approve'] },
  member: { rank: 2, actions: ['read', 'write'] },
  viewer: { rank: 1, actions: ['read'] },
});

class AccessError extends Error { constructor(m) { super(m); this.code = 'FORBIDDEN'; } }
class NotFoundError extends Error { constructor(m) { super(m); this.code = 'NOT_FOUND'; } }

const id = (p) => `${p}_${crypto.randomUUID().slice(0, 12)}`;

// Branchen giver kun anbefalinger. Den låser intet.
const INDUSTRY_RECOMMENDATIONS = Object.freeze({
  webshop:     { recommended: ['lager', 'puls', 'indsigt', 'overblik'], optional: [] },
  detail:      { recommended: ['lager', 'indsigt'], optional: ['puls', 'overblik'] },
  restaurant:  { recommended: ['overblik', 'puls', 'indsigt'], optional: ['lager'] },
  haandvaerk:  { recommended: ['overblik', 'puls', 'indsigt'], optional: [] },
  konsulent:   { recommended: ['overblik', 'puls', 'indsigt'], optional: [] },
  salon:       { recommended: ['overblik', 'puls'], optional: ['indsigt', 'lager'] },
  bureau:      { recommended: ['overblik', 'puls', 'indsigt'], optional: [] },
  engros:      { recommended: ['lager', 'puls', 'indsigt'], optional: ['overblik'] },
});

function createPlatform({ now = () => new Date() } = {}) {
  const db = {
    organizations: new Map(), users: new Map(), memberships: new Map(),
    modules: new Map(), sharing: new Map(), audit: [], rows: new Map(),
  };

  function audit(orgId, actor, action, entity, details = {}) {
    const entry = { id: id('aud'), organization_id: orgId, actor: actor.label, actor_type: actor.type, action, entity, details, at: now().toISOString() };
    db.audit.push(Object.freeze(entry));
    return entry;
  }

  function createUser(name, email) {
    const u = { id: id('usr'), name, email };
    db.users.set(u.id, u); return u;
  }

  function createOrganization(name, industry, owner) {
    const org = { id: id('org'), name, industry, created_at: now().toISOString() };
    db.organizations.set(org.id, org);
    db.memberships.set(`${org.id}:${owner.id}`, { organization_id: org.id, user_id: owner.id, role: 'owner', modules: [...MODULES] });
    audit(org.id, { label: owner.id, type: 'user' }, 'organization.created', org.id, { industry });
    return org;
  }

  function recommendModules(industry) {
    return INDUSTRY_RECOMMENDATIONS[industry] || { recommended: ['overblik'], optional: MODULES.filter((m) => m !== 'overblik') };
  }

  function membership(orgId, userId) {
    const m = db.memberships.get(`${orgId}:${userId}`);
    if (!m) throw new AccessError('Ingen adgang til denne virksomhed');
    return m;
  }

  // Aktør = bruger eller AI-worker. AI-workers kan aldrig godkende.
  function userActor(orgId, userId) {
    const m = membership(orgId, userId);
    return { type: 'user', id: userId, label: userId, organization_id: orgId, role: m.role, modules: m.modules };
  }
  function workerActor(orgId, workerName, { module, actions = ['read', 'draft'] }) {
    if (!db.organizations.has(orgId)) throw new NotFoundError('Ukendt virksomhed');
    return { type: 'ai_worker', id: workerName, label: `worker:${workerName}`, organization_id: orgId, role: 'worker', modules: [module], actions };
  }

  function isModuleActive(orgId, module) {
    const m = db.modules.get(`${orgId}:${module}`);
    return !!m && m.status === 'active';
  }

  function can(actor, module, action) {
    if (!isModuleActive(actor.organization_id, module)) return false;
    if (!actor.modules.includes(module)) return false;
    if (actor.type === 'ai_worker') return action !== 'approve' && action !== 'admin' && actor.actions.includes(action);
    return ROLES[actor.role].actions.includes(action);
  }

  function require(actor, module, action) {
    if (!isModuleActive(actor.organization_id, module)) throw new AccessError(`Appen ${module.toUpperCase()} er ikke aktiveret`);
    if (!can(actor, module, action)) throw new AccessError(`Mangler rettighed "${action}" i ${module.toUpperCase()}`);
  }

  function activateModule(actor, module, { trial = false } = {}) {
    if (!MODULES.includes(module)) throw new NotFoundError(`Ukendt app: ${module}`);
    if (actor.type !== 'user' || !ROLES[actor.role].actions.includes('admin')) throw new AccessError('Kun ejeren kan aktivere apps');
    db.modules.set(`${actor.organization_id}:${module}`, { organization_id: actor.organization_id, module, status: 'active', trial, activated_at: now().toISOString() });
    audit(actor.organization_id, actor, 'module.activated', module, { trial });
  }
  function deactivateModule(actor, module) {
    if (actor.type !== 'user' || actor.role !== 'owner') throw new AccessError('Kun ejeren kan deaktivere apps');
    const m = db.modules.get(`${actor.organization_id}:${module}`);
    if (m) m.status = 'inactive';
    // Afbrydelse fjerner også datadeling til/fra appen.
    for (const [k, s] of db.sharing) if (s.organization_id === actor.organization_id && (s.from === module || s.to === module)) db.sharing.delete(k);
    audit(actor.organization_id, actor, 'module.deactivated', module);
  }
  function activeModules(orgId) { return MODULES.filter((m) => isModuleActive(orgId, m)); }

  function inviteMember(actor, user, role, modules) {
    if (actor.type !== 'user' || actor.role !== 'owner') throw new AccessError('Kun ejeren kan invitere');
    if (!ROLES[role] || role === 'owner') throw new AccessError('Ugyldig rolle');
    db.memberships.set(`${actor.organization_id}:${user.id}`, { organization_id: actor.organization_id, user_id: user.id, role, modules: modules.filter((m) => MODULES.includes(m)) });
    audit(actor.organization_id, actor, 'member.invited', user.id, { role, modules });
  }
  function removeMember(actor, userId) {
    if (actor.type !== 'user' || actor.role !== 'owner') throw new AccessError('Kun ejeren kan fjerne adgang');
    if (userId === actor.id) throw new AccessError('Ejeren kan ikke fjerne sig selv');
    db.memberships.delete(`${actor.organization_id}:${userId}`);
    audit(actor.organization_id, actor, 'member.removed', userId);
  }

  // Eksplicit datadeling. Tekst vises til brugeren før godkendelse.
  const SHARING_TEXT = {
    'puls>indsigt:financial_kpis': 'Hvis du forbinder disse apps, kan INDSIGT bruge dine økonomiske nøgletal til at finde udviklinger og foreslå forbedringer.',
    'lager>indsigt:sales_and_stock': 'INDSIGT kan læse salg og lagerbeholdning fra LAGER for at beregne efterspørgsel og lagerbinding.',
    'lager>overblik:tasks': 'LAGER kan oprette forslag til opgaver i OVERBLIK, fx ved lav beholdning.',
    'puls>overblik:tasks': 'PULS kan oprette forslag til opfølgningsopgaver i OVERBLIK, fx ved forfaldne fakturaer.',
    'indsigt>overblik:tasks': 'INDSIGT kan oprette forslag til opgaver i OVERBLIK, når den finder væsentlige ændringer.',
  };
  function sharingConsentText(from, to, scope) { return SHARING_TEXT[`${from}>${to}:${scope}`] || null; }
  function grantSharing(actor, from, to, scope) {
    if (actor.type !== 'user' || actor.role !== 'owner') throw new AccessError('Kun ejeren kan godkende datadeling');
    const text = sharingConsentText(from, to, scope);
    if (!text) throw new NotFoundError('Ukendt datadeling');
    if (!isModuleActive(actor.organization_id, from) || !isModuleActive(actor.organization_id, to)) throw new AccessError('Begge apps skal være aktive');
    db.sharing.set(`${actor.organization_id}:${from}>${to}:${scope}`, { organization_id: actor.organization_id, from, to, scope, consent_text: text, granted_by: actor.id, granted_at: now().toISOString() });
    audit(actor.organization_id, actor, 'sharing.granted', `${from}>${to}`, { scope });
  }
  function revokeSharing(actor, from, to, scope) {
    if (actor.type !== 'user' || actor.role !== 'owner') throw new AccessError('Kun ejeren kan afbryde datadeling');
    db.sharing.delete(`${actor.organization_id}:${from}>${to}:${scope}`);
    audit(actor.organization_id, actor, 'sharing.revoked', `${from}>${to}`, { scope });
  }
  function isShared(orgId, from, to, scope) {
    return db.sharing.has(`${orgId}:${from}>${to}:${scope}`) && isModuleActive(orgId, from) && isModuleActive(orgId, to);
  }
  function requireSharing(orgId, from, to, scope) {
    if (!isShared(orgId, from, to, scope)) throw new AccessError(`Datadeling ${from.toUpperCase()} → ${to.toUpperCase()} (${scope}) er ikke godkendt`);
  }

  // Tenant-afgrænset dataadgang. Alle rækker får organization_id fra aktøren,
  // aldrig fra input, og læsning filtrerer altid på organization_id.
  function table(name) { if (!db.rows.has(name)) db.rows.set(name, new Map()); return db.rows.get(name); }
  function repo(actor, module) {
    const org = actor.organization_id;
    return {
      insert(tbl, data) {
        require(actor, module, actor.type === 'ai_worker' ? 'draft' : 'write');
        const row = { ...data, id: data.id || id(tbl.slice(0, 3)), organization_id: org, created_at: now().toISOString(), created_by: actor.label };
        table(tbl).set(row.id, row);
        audit(org, actor, `${tbl}.created`, row.id);
        return { ...row };
      },
      get(tbl, rowId) {
        require(actor, module, 'read');
        const row = table(tbl).get(rowId);
        if (!row || row.organization_id !== org) throw new NotFoundError('Findes ikke'); // samme svar som "findes ikke" – lækker ikke eksistens
        return { ...row };
      },
      list(tbl, filter = () => true) {
        require(actor, module, 'read');
        return [...table(tbl).values()].filter((r) => r.organization_id === org).filter(filter).map((r) => ({ ...r }));
      },
      update(tbl, rowId, patch) {
        require(actor, module, 'write');
        const row = table(tbl).get(rowId);
        if (!row || row.organization_id !== org) throw new NotFoundError('Findes ikke');
        const { id: _i, organization_id: _o, ...safe } = patch;
        Object.assign(row, safe, { updated_at: now().toISOString() });
        audit(org, actor, `${tbl}.updated`, rowId, { fields: Object.keys(safe) });
        return { ...row };
      },
    };
  }

  function auditLog(actor) {
    return db.audit.filter((a) => a.organization_id === actor.organization_id);
  }

  return {
    MODULES, createUser, createOrganization, recommendModules, userActor, workerActor,
    activateModule, deactivateModule, activeModules, isModuleActive, inviteMember, removeMember,
    can, require, sharingConsentText, grantSharing, revokeSharing, isShared, requireSharing,
    repo, audit, auditLog, now,
  };
}

module.exports = { createPlatform, AccessError, NotFoundError, MODULES };
