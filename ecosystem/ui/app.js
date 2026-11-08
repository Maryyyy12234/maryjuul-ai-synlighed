'use strict';
// Integrationscenter: Kassesystemer. Vanilla JS. Al tekst ligger i T (klar til i18n).
// Alt indhold indsættes via textContent (ingen innerHTML), så data fra kassen ikke kan køre som kode.

const T = {
  da: {
    noConnections: 'Ingen kasse forbundet endnu', noConnectionsHelp: 'Vælg dit kassesystem nedenfor. Det tager cirka et minut.',
    lastSync: 'Seneste synkronisering', synced: 'Synkroniseres', usedBy: 'Bruges af', never: 'Aldrig',
    orders: 'ordrer', products: 'varer', variants: 'varianter', locations: 'lokationer', ofWhichPos: 'heraf fra kassen',
    syncNow: 'Synkronisér nu', retry: 'Prøv igen', reconnect: 'Forbind igen', disconnect: 'Afbryd', syncing: 'Synkroniserer …',
    sharing: 'Datadeling', sharingHelp: 'Du bestemmer, hvilke apps der må bruge kassedata. Ændringer gælder med det samme.',
    notActive: 'App ikke aktiveret', settings: 'Lagerindstillinger', minStock: 'Minimumsbeholdning', leadTime: 'Leveringstid (dage)', save: 'Gem',
    settingsHelp: 'Bruges til at beregne genbestilling. Kassen har ikke disse oplysninger.', history: 'Synkroniseringshistorik',
    connect: 'Forbind', connectShopify: 'Forbind Shopify', shopDomain: 'Butikkens Shopify-adresse', cancel: 'Annullér',
    comingSoon: 'Kommer senere', seePlan: 'Se plan', needsSetup: 'Kræver opsætning',
    needsSetupHelp: 'Serveren mangler Shopify-nøgler (SHOPIFY_CLIENT_ID og SHOPIFY_CLIENT_SECRET). Se docs/POS_INTEGRATION.md.',
    permissions: 'Shopify beder dig godkende læseadgang til:', readOnly: 'Kun læseadgang. Appen kan ikke ændre noget i din kasse.',
    run: 'Kør nu', notRun: 'Ikke kørt', level: 'Niveau',
    ok: 'Gemt.', connectedOk: 'Shopify er forbundet. Dine data hentes nu.',
    accept: 'Acceptér', reject: 'Afvis', edit: 'Redigér', noSuggestions: 'Ingen opgaveforslag.', noLow: 'Ingen varer under minimum.',
    salesToday: 'Registreret salg i dag', refunded: 'refunderet', topProducts: 'Mest solgte, 30 dage', bySize: 'Pr. størrelse', aov: 'Gns. ordre',
    disconnectedAt: 'Afbrudt', historical: 'Historiske data bevares', dataDeleted: 'Data slettet',
    demoFlow: (r) => [
      ['KASSE', `Ordre ${r.order} registreret`], ['SYNK', `${r.webhooks} signerede beskeder modtaget`],
      ['LAGER', 'Beholdning hentet fra Shopify'], ['PULS', `Salg i dag: ${r.after.today || '—'}`], ['INDSIGT', 'Salgstal opdateret'],
    ],
  },
};
const t = T.da;
const APP_INFO = {
  lager: { name: 'LAGER', what: 'Beholdning pr. variant og lokation. Kassen er master, så LAGER trækker ikke salg fra selv.' },
  puls: { name: 'PULS', what: 'Registreret salg, rabatter, refusioner og moms. Vises som kassedata, ikke som bogført omsætning.' },
  indsigt: { name: 'INDSIGT', what: 'Salg pr. vare, størrelse, kategori, butik og dag. Kun beregninger, dataene understøtter.' },
  overblik: { name: 'OVERBLIK', what: 'Opgaveforslag, fx ved lav beholdning. Du accepterer eller afviser selv.' },
};
const PROVIDER_MARK = { shopify: 'S', zettle: 'Z', lightspeed: 'L', shopbox: 'Sb', csv: 'CSV' };

// ---------- Små hjælpere ----------
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'text') el.textContent = v; else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
const $ = (s) => document.querySelector(s);
async function call(path, body) {
  const res = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Fejl ${res.status}`);
  return j;
}
function flash(msg, isErr = false) {
  const f = $('.flash'); f.textContent = msg; f.classList.toggle('err', isErr); f.hidden = false;
  clearTimeout(flash.t); flash.t = setTimeout(() => { f.hidden = true; }, isErr ? 8000 : 4000);
}
const dtf = new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
function when(iso) {
  if (!iso) return t.never;
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  const rel = mins < 1 ? 'lige nu' : mins < 60 ? `${mins} min. siden` : mins < 1440 ? `${Math.round(mins / 60)} t. siden` : dtf.format(new Date(iso));
  return rel;
}
async function busy(btn, label, fn) {
  const old = btn.textContent; btn.disabled = true; btn.textContent = label;
  try { await fn(); } catch (e) { flash(e.message, true); } finally { btn.disabled = false; btn.textContent = old; }
}

// ---------- Render ----------
let S = null;
async function load() {
  try { S = await call('/api/state'); render(); } catch (e) { flash(`Kunne ikke hente status: ${e.message}`, true); }
}

function render() {
  document.querySelector('[data-bind=org]').textContent = S.session.organization;
  $('[data-bind=demo]').hidden = !S.session.demo;
  renderConnections(); renderProviders(); renderUsage(); renderWorkers(); renderDemo();
}

function statusPill(status, label) { return h('span', { class: 'status', 'data-s': status }, label); }

function renderConnections() {
  const root = $('#connections'); root.replaceChildren();
  const list = S.connections;
  if (!list.length) {
    root.append(h('div', { class: 'card empty-card' }, h('strong', {}, t.noConnections), h('p', { class: 'hint' }, t.noConnectionsHelp)));
    return;
  }
  for (const c of list) root.append(connectionCard(c));
}

function connectionCard(c) {
  const prov = S.providers.find((p) => p.id === c.provider);
  const off = c.status === 'disconnected';
  const card = h('article', { class: 'card', 'aria-label': `${prov.name} ${c.account}` });
  card.append(h('div', { class: 'conn-head' },
    h('div', { class: 'conn-id' }, h('span', { class: 'logo', 'aria-hidden': 'true' }, PROVIDER_MARK[c.provider] || '?'),
      h('div', {}, h('p', { class: 'conn-title' }, c.shop_name || prov.name, c.demo ? h('span', { class: 'tag' }, 'DEMO') : null), h('p', { class: 'conn-sub' }, c.account))),
    statusPill(c.status, c.status_label)));

  const facts = h('dl', { class: 'facts' },
    h('div', { class: 'fact' }, h('dt', {}, off ? t.disconnectedAt : t.lastSync), h('dd', {}, off ? when(c.disconnected_at) : when(c.last_sync_at),
      c.last_sync_at && !off ? h('div', { class: 'mini' }, dtf.format(new Date(c.last_sync_at))) : h('div', { class: 'mini' }, off ? (c.data_deleted_at ? t.dataDeleted : t.historical) : ''))),
    h('div', { class: 'fact' }, h('dt', {}, t.synced), h('dd', {},
      h('span', { class: 'num' }, c.counts.orders), ` ${t.orders} `, h('span', { class: 'mini' }, `(${c.counts.pos_orders} ${t.ofWhichPos})`),
      h('div', { class: 'mini' }, `${c.counts.products} ${t.products} · ${c.counts.variants} ${t.variants} · ${c.counts.locations} ${t.locations}`))),
    h('div', { class: 'fact' }, h('dt', {}, t.usedBy), h('dd', {}, h('div', { class: 'chips' },
      ...['lager', 'puls', 'indsigt', 'overblik'].map((a) => h('span', { class: `chip${c.apps_using_data.includes(a) ? ' on' : ''}`, title: c.apps_using_data.includes(a) ? 'Bruger kassedata' : 'Bruger ikke kassedata' }, APP_INFO[a].name))))));
  card.append(facts);

  if (c.last_error) {
    const action = c.status === 'requires_action'
      ? h('button', { class: 'btn', onclick: () => openConnectForm(c.account) }, t.reconnect)
      : h('button', { class: 'btn', onclick: (e) => busy(e.target, t.syncing, async () => { await call(`/api/connections/${c.id}/sync`, { mode: 'reconcile' }); await load(); }) }, t.retry);
    card.append(h('div', { class: `alert ${c.status === 'error' ? 'err' : 'warn'}`, role: 'alert' }, h('span', {}, c.last_error), off ? null : action));
  }

  if (!off) {
    card.append(sharingPanel(c), settingsPanel(c), historyPanel(c));
    card.append(h('div', { class: 'conn-actions' },
      h('div', { class: 'left' }, h('button', { class: 'btn', onclick: (e) => busy(e.target, t.syncing, async () => { const r = await call(`/api/connections/${c.id}/sync`, { mode: 'reconcile' }); flash(r.status === 'succeeded' ? `Synkroniseret: ${r.counts.orders} nye eller ændrede ordrer.` : `Synkronisering: ${r.status}. ${r.errors.map((x) => x.message).join(' ')}`, r.status !== 'succeeded'); await load(); }) }, t.syncNow)),
      h('button', { class: 'btn btn-danger-quiet', onclick: () => openDisconnect(c) }, t.disconnect)));
  }
  return card;
}

function sharingPanel(c) {
  const d = h('details', { class: 'panel' }, h('summary', {}, t.sharing));
  const rows = ['lager', 'puls', 'indsigt', 'overblik'].map((a) => {
    const active = S.modules.includes(a);
    const id = `t-${c.id}-${a}`;
    const sw = h('input', { type: 'checkbox', class: 'switch', id, role: 'switch', checked: c.targets[a] && active, disabled: !active,
      onchange: async (e) => { try { await call(`/api/connections/${c.id}/targets`, { targets: { [a]: e.target.checked } }); flash(t.ok); await load(); } catch (err) { flash(err.message, true); e.target.checked = !e.target.checked; } } });
    return h('div', { class: 'target' }, h('label', { for: id }, h('strong', {}, APP_INFO[a].name)), h('p', {}, APP_INFO[a].what, active ? null : h('span', { class: 'off' }, ` ${t.notActive}.`)), sw);
  });
  d.append(h('div', { class: 'panel-body' }, h('p', { class: 'hint' }, t.sharingHelp), h('div', { class: 'targets' }, rows)));
  return d;
}

function settingsPanel(c) {
  const min = h('input', { type: 'number', min: '0', value: c.defaults.min_stock, name: 'min', inputmode: 'numeric' });
  const lead = h('input', { type: 'number', min: '1', value: c.defaults.lead_time_days ?? '', name: 'lead', placeholder: '—', inputmode: 'numeric' });
  const form = h('form', { class: 'row-fields', onsubmit: async (e) => { e.preventDefault(); try { await call(`/api/connections/${c.id}/defaults`, { min_stock: Number(min.value), lead_time_days: lead.value ? Number(lead.value) : null }); flash(t.ok); await load(); } catch (err) { flash(err.message, true); } } },
    h('label', { class: 'field field-sm' }, h('span', {}, t.minStock), min), h('label', { class: 'field field-sm' }, h('span', {}, t.leadTime), lead), h('button', { class: 'btn', type: 'submit' }, t.save));
  return h('details', { class: 'panel' }, h('summary', {}, t.settings), h('div', { class: 'panel-body' }, h('p', { class: 'hint' }, t.settingsHelp), form));
}

function historyPanel(c) {
  const labels = { initial: 'Første import', incremental: 'Løbende', reconcile: 'Afstemning' };
  const st = { succeeded: 'OK', partial: 'Delvist', failed: 'Fejlet', running: 'Kører' };
  const items = c.history.map((r) => h('li', {}, h('span', { class: 'num' }, dtf.format(new Date(r.started_at))), h('span', {}, `${labels[r.mode] || r.mode} · ${r.counts.orders} ordrer, ${r.counts.inventory} lagertal${r.errors.length ? ` · ${r.errors[0].message}` : ''}`), h('span', {}, st[r.status] || r.status)));
  return h('details', { class: 'panel' }, h('summary', {}, t.history), h('div', { class: 'panel-body' }, items.length ? h('ul', { class: 'history' }, items) : h('p', { class: 'empty' }, '—')));
}

function renderProviders() {
  const root = $('#providers'); root.replaceChildren();
  for (const p of S.providers) {
    const existing = S.connections.find((c) => c.provider === p.id && c.status !== 'disconnected');
    const li = h('li', { class: 'provider', id: `prov-${p.id}` }, h('span', { class: 'logo', 'aria-hidden': 'true' }, PROVIDER_MARK[p.id] || '?'),
      h('div', {}, h('p', { class: 'name' }, p.name), h('p', {}, p.description)));
    if (p.status === 'planned') {
      li.append(statusPill('planned', t.comingSoon));
      li.append(h('details', {}, h('summary', {}, t.seePlan), h('p', {}, p.todo), p.docs ? h('p', {}, 'Dokumentation: ', h('a', { href: p.docs, rel: 'noopener', target: '_blank' }, p.docs)) : null));
    } else if (p.status === 'needs_setup') {
      li.append(statusPill('needs_setup', t.needsSetup));
      li.append(h('details', {}, h('summary', {}, 'Hvorfor?'), h('p', {}, t.needsSetupHelp)));
    } else if (existing) {
      li.append(statusPill(existing.status, existing.status_label));
    } else {
      li.append(h('button', { class: 'btn btn-primary', onclick: () => openConnectForm() }, t.connect));
    }
    root.append(li);
  }
}

function openConnectForm(prefill = '') {
  const li = $('#prov-shopify');
  li.querySelector('.connect-form')?.remove();
  const p = S.providers.find((x) => x.id === 'shopify');
  const input = h('input', { type: 'text', name: 'shop', value: prefill || (S.session.demo ? 'demo-toejbutik.myshopify.com' : ''), placeholder: 'dinbutik.myshopify.com', autocomplete: 'off', spellcheck: 'false', required: true, 'aria-describedby': 'perm-help' });
  const checks = ['lager', 'puls', 'indsigt', 'overblik'].filter((a) => S.modules.includes(a)).map((a) => h('label', { class: 'check' }, h('input', { type: 'checkbox', name: a, checked: true }), h('span', {}, `${APP_INFO[a].name} – ${APP_INFO[a].what}`)));
  const form = h('form', { class: 'connect-form', onsubmit: async (e) => {
    e.preventDefault();
    const targets = Object.fromEntries(['lager', 'puls', 'indsigt', 'overblik'].map((a) => [a, !!form.querySelector(`[name=${a}]`)?.checked]));
    await busy(form.querySelector('[type=submit]'), 'Forbinder …', async () => {
      const r = await call('/api/connect', { provider: 'shopify', shop: input.value.trim(), targets });
      if (r.authUrl) { window.location.href = r.authUrl; return; }
      flash(t.connectedOk); await load();
    });
  } },
    h('label', { class: 'field' }, h('span', {}, t.shopDomain), input),
    h('div', { class: 'perm', id: 'perm-help' }, h('p', {}, t.permissions, ' ', ...p.scopes.map((s) => [h('code', {}, s), ' '])), h('p', {}, t.readOnly)),
    h('fieldset', { class: 'targets-pick' }, h('legend', { class: 'hint' }, 'Hvilke apps må bruge dataene?'), checks),
    h('div', { class: 'row-fields' }, h('button', { class: 'btn btn-primary', type: 'submit' }, t.connectShopify), h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => form.remove() }, t.cancel)));
  li.append(form); input.focus();
}

function openDisconnect(c) {
  const dlg = $('#dlg-disconnect');
  dlg.querySelector('[data-bind=dlg-account]').textContent = c.account;
  $('#dlg-consequences').replaceChildren(...c.disconnect_consequences.map((x) => h('li', {}, x)));
  $('#dlg-delete').checked = false;
  dlg.onclose = async () => {
    if (dlg.returnValue !== 'confirm') return;
    try { await call(`/api/connections/${c.id}/disconnect`, { deleteData: $('#dlg-delete').checked }); flash('Forbindelsen er afbrudt.'); await load(); } catch (e) { flash(e.message, true); }
  };
  dlg.showModal();
}

function renderUsage() {
  const live = S.connections.some((c) => c.status !== 'disconnected' || !c.data_deleted_at);
  $('#usage-block').hidden = !S.connections.length || !live;
  if ($('#usage-block').hidden) return;
  const a = S.apps;
  if (a.indsigt.period) $('[data-bind=period]').textContent = `Seneste 30 dage: ${a.indsigt.period.from} – ${a.indsigt.period.to}`;
  const col = (name, ...kids) => h('div', { class: 'use' }, h('h3', {}, name), ...kids);
  $('#usage').replaceChildren(
    col('LAGER', a.lager.lowStock.length ? h('ul', {}, a.lager.lowStock.map((p) => h('li', {}, h('span', {}, p.name), h('span', { class: 'num' }, `${p.onHand} stk.`)))) : h('p', { class: 'empty' }, t.noLow),
      h('p', { class: 'def' }, `${a.lager.products} varianter fra kassen. Under eller på minimum vises her.`)),
    col('PULS', a.puls.today ? [h('p', { class: 'big' }, a.puls.today), h('p', { class: 'def' }, `${t.salesToday}, ekskl. moms · ${a.puls.orders} ${a.puls.orders === 1 ? "ordre" : "ordrer"} · ${a.puls.refunded} ${t.refunded}`), h('p', { class: 'def' }, a.puls.definition)] : h('p', { class: 'empty' }, a.puls.message)),
    col('INDSIGT', a.indsigt.top ? [h('p', { class: 'def' }, t.topProducts), h('ul', {}, a.indsigt.top.map((p) => h('li', {}, h('span', {}, p.title), h('span', { class: 'num' }, `${p.units} stk.`)))),
      a.indsigt.bySize.length ? [h('p', { class: 'def' }, t.bySize), h('ul', {}, a.indsigt.bySize.map((s) => h('li', {}, h('span', {}, s.key), h('span', { class: 'num' }, `${s.units}`))))] : null,
      h('p', { class: 'def' }, `${t.aov}: ${a.indsigt.aov}`)] : h('p', { class: 'empty' }, a.indsigt.message)),
    col('OVERBLIK', a.overblik.suggestions.length ? a.overblik.suggestions.slice(0, 3).map((s) => h('div', { class: 'sugg' }, h('p', {}, s.title),
      h('div', { class: 'acts' },
        h('button', { class: 'btn btn-accent', onclick: (e) => busy(e.target, '…', async () => { await call(`/api/tasks/${s.id}/accept`, {}); flash('Opgaven er oprettet i OVERBLIK.'); await load(); }) }, t.accept),
        h('button', { class: 'btn', onclick: () => { const v = prompt('Ny titel', s.title); if (v) call(`/api/tasks/${s.id}/edit`, { title: v }).then(load).catch((e) => flash(e.message, true)); } }, t.edit),
        h('button', { class: 'btn btn-quiet', onclick: (e) => busy(e.target, '…', async () => { await call(`/api/tasks/${s.id}/reject`, { reason: 'Afvist i integrationscenter' }); await load(); }) }, t.reject))))
      : h('p', { class: 'empty' }, t.noSuggestions)),
  );
}

function renderWorkers() {
  $('#workers-block').hidden = !S.connections.some((c) => c.status !== 'disconnected');
  const tb = $('#workers tbody'); tb.replaceChildren();
  for (const w of S.workers) {
    const r = w.lastRun;
    const summary = !r ? t.notRun : r.status === 'skipped' ? r.reason : r.status === 'failed' ? `Fejl: ${r.error}`
      : `${when(r.finished_at)} · ${(r.output.findings || r.output.reports || r.output.messages || []).length} fund${r.output.taskIds?.length ? ` · ${r.output.taskIds.length} opgaveforslag` : ''}`;
    tb.append(h('tr', {},
      h('td', {}, h('strong', {}, w.name), h('div', { class: 'mini' }, w.purpose)),
      h('td', {}, h('span', { class: 'chip' }, w.app.toUpperCase())),
      h('td', { class: 'mini' }, w.actions.join(', ')),
      h('td', { class: 'mini' }, summary),
      h('td', {}, h('button', { class: 'btn', onclick: (e) => busy(e.target, 'Kører …', async () => { const res = await call(`/api/workers/${w.id}/run`, {}); flash(res.status === 'succeeded' ? `${w.name} er kørt.` : res.reason || res.error, res.status !== 'succeeded'); await load(); }) }, t.run))));
  }
}

function renderDemo() {
  const on = S.session.demo && S.connections.some((c) => c.status === 'connected');
  $('#demo-block').hidden = !on;
  if (!on) return;
  const sel = $('#demo-variant');
  if (!sel.options.length) sel.replaceChildren(...S.demoVariants.map((v) => h('option', { value: v.id }, v.label)));
}

$('#demo-sale')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  await busy(e.target.querySelector('[type=submit]'), 'Sælger …', async () => {
    const r = await call('/api/demo/sale', { variantId: fd.get('variantId'), qty: Number(fd.get('qty')) });
    $('#demo-flow').replaceChildren(...t.demoFlow(r).map(([k, v]) => h('li', {}, h('b', {}, k), h('span', {}, v))));
    await load();
  });
});

const qs = new URLSearchParams(location.search);
if (qs.get('forbundet')) flash(t.connectedOk);
if (qs.get('fejl')) flash(qs.get('fejl'), true);
load();
