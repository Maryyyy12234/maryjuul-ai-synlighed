'use strict';
// Betalingssider: Integrationer -> Betalinger og terminaler, og PULS -> Betalinger.
// Al tekst indsættes via textContent. Ingen kortdata vises nogensinde (vi har dem ikke).

const T = {
  status: { matched: 'Matchet', awaiting_payment: 'Afventer betaling', awaiting_settlement: 'Afventer afregning', deviation: 'Afvigelse', unknown: 'Ukendt', needs_review: 'Kræver gennemgang' },
  kind: { payment: 'Betaling', refund: 'Refundering', chargeback: 'Chargeback' },
  apps: { puls: ['PULS', 'Kortbetalinger, gebyrer, udbetalinger og afstemning.'], indsigt: ['INDSIGT', 'Udvikling i betalinger, refunderinger og gebyrer.'], overblik: ['OVERBLIK', 'Opgaveforslag ved afvigelser og forsinkede udbetalinger.'] },
};
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === 'class') el.className = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v); }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
const $ = (s) => document.querySelector(s);
const put = (el, ...items) => el.replaceChildren(...items.flat(Infinity).filter((x) => x != null && x !== false));
const PROVIDER = { sumup: 'SumUp', nets: 'Nets / Nexi', zettle: 'Zettle', verifone: 'Verifone', worldline: 'Worldline' };
async function call(path, body) {
  const res = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Fejl ${res.status}`);
  return j;
}
function flash(msg, err = false) { const f = $('.flash'); f.textContent = msg; f.classList.toggle('err', err); f.hidden = false; clearTimeout(flash.t); flash.t = setTimeout(() => { f.hidden = true; }, err ? 8000 : 4000); }
const dtf = new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const df = new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'short', year: 'numeric' });
const when = (iso) => (iso ? dtf.format(new Date(iso)) : 'Aldrig');
async function busy(btn, label, fn) { const old = btn.textContent; btn.disabled = true; btn.textContent = label; try { await fn(); } catch (e) { flash(e.message, true); } finally { btn.disabled = false; btn.textContent = old; } }
const pill = (s, label) => h('span', { class: 'status', 'data-s': s }, label);
function setHeader(session) { document.querySelector('[data-bind=org]').textContent = session.organization; $('[data-bind=demo]').hidden = !session.demo; }

// =================== Integrationer -> Betalinger ===================
let S = null;
async function loadIntegrations() { try { S = await call('/api/payments/state'); setHeader(S.session); renderConnections(); renderProviders(); } catch (e) { flash(e.message, true); } }

function renderConnections() {
  const root = $('#connections'); root.replaceChildren();
  if (!S.connections.length) { root.append(h('div', { class: 'card empty-card' }, h('strong', {}, 'Ingen betalingsudbyder forbundet endnu'), h('p', { class: 'hint' }, 'Vælg din udbyder nedenfor. Bruger du Nets, importerer du rapporten fra MyNets.'))); return; }
  for (const c of S.connections) root.append(connectionCard(c));
}
function connectionCard(c) {
  const off = c.status === 'disconnected';
  const card = h('article', { class: 'card', 'aria-label': c.provider_name });
  card.append(h('div', { class: 'conn-head' },
    h('div', { class: 'conn-id' }, h('span', { class: 'logo', 'aria-hidden': 'true' }, c.provider === 'nets' ? 'N' : c.provider === 'sumup' ? 'Su' : '?'),
      h('div', {}, h('p', { class: 'conn-title' }, c.label || c.provider_name, c.demo ? h('span', { class: 'tag' }, 'DEMO') : null),
        h('p', { class: 'conn-sub' }, c.merchant_accounts.length ? `Forretningsnr. ${c.merchant_accounts.map((a) => a.external_id).join(', ')}` : c.provider_name))),
    pill(c.status, c.status_label)));
  card.append(h('dl', { class: 'facts' },
    h('div', { class: 'fact' }, h('dt', {}, c.kind === 'file' ? 'Seneste import' : 'Seneste synkronisering'), h('dd', {}, when(c.last_sync_at), h('div', { class: 'mini' }, c.coverage_until ? `Data til og med ${when(c.coverage_until)}` : 'Ingen data endnu'))),
    h('div', { class: 'fact' }, h('dt', {}, 'Data der deles'), h('dd', {}, h('span', { class: 'num' }, c.counts.transactions), ' betalinger', h('div', { class: 'mini' }, `${c.counts.refunds} refunderinger · ${c.counts.disputes} chargebacks · ${c.counts.payouts} udbetalinger`))),
    h('div', { class: 'fact' }, h('dt', {}, 'Bruges af'), h('dd', {}, h('div', { class: 'chips' }, ['puls', 'indsigt', 'overblik'].map((a) => h('span', { class: `chip${c.apps_using_data.includes(a) ? ' on' : ''}` }, T.apps[a][0])))))));
  if (c.last_error) card.append(h('div', { class: `alert ${c.status === 'error' ? 'err' : 'warn'}`, role: 'alert' }, h('span', {}, c.last_error)));
  if (!off) {
    const sharing = h('details', { class: 'panel' }, h('summary', {}, 'Datadeling'), h('div', { class: 'panel-body' }, h('div', { class: 'targets' }, ['puls', 'indsigt', 'overblik'].map((a) => {
      const active = S.modules.includes(a); const id = `pt-${c.id}-${a}`;
      return h('div', { class: 'target' }, h('label', { for: id }, h('strong', {}, T.apps[a][0])), h('p', {}, T.apps[a][1], active ? '' : ' App ikke aktiveret.'),
        h('input', { type: 'checkbox', role: 'switch', class: 'switch', id, checked: c.targets[a] && active, disabled: !active, onchange: async (e) => { try { await call(`/api/payments/connections/${c.id}/targets`, { targets: { [a]: e.target.checked } }); flash('Gemt.'); await loadIntegrations(); } catch (err) { flash(err.message, true); } } }));
    }))), h('p', { class: 'note-lager' }, 'LAGER får aldrig betalingsdata. En kortbetaling fortæller ikke, hvilke varer der er solgt – lageret styres af kassesystemet.'));
    const terms = h('details', { class: 'panel' }, h('summary', {}, `Terminaler (${c.terminals.length})`), h('div', { class: 'panel-body' },
      h('p', { class: 'hint' }, 'Kobl hver terminal til en butik i kassesystemet. Så bliver forslagene til afstemning mere sikre.'),
      c.terminals.length ? h('div', { class: 'terminals' }, c.terminals.map((t) => h('div', { class: 'terminal-row' }, h('span', { class: 'num' }, t.external_id),
        h('select', { 'aria-label': `Butik for terminal ${t.external_id}`, onchange: async (e) => { try { await call(`/api/payments/terminals/${t.id}/map`, { location: e.target.value }); flash('Gemt.'); } catch (err) { flash(err.message, true); } } },
          h('option', { value: '' }, 'Ikke koblet'), S.posLocations.map((l) => h('option', { value: l.id, selected: t.pos_location === l.id }, l.name)))))) : h('p', { class: 'empty' }, 'Udbyderen har ikke sendt terminal-id\'er.')));
    const lagInput = h('input', { type: 'number', min: '0', max: '30', value: c.payout_lag_days, inputmode: 'numeric' });
    const settings = h('details', { class: 'panel' }, h('summary', {}, 'Udbetalingstid'), h('div', { class: 'panel-body' },
      h('p', { class: 'hint' }, 'Hvor mange dage går der normalt, før udbyderen udbetaler? Bruges til at opdage forsinkelser.'),
      h('form', { class: 'row-fields', onsubmit: async (e) => { e.preventDefault(); try { await call(`/api/payments/connections/${c.id}/lag`, { days: Number(lagInput.value) }); flash('Gemt.'); await loadIntegrations(); } catch (err) { flash(err.message, true); } } },
        h('label', { class: 'field field-sm' }, h('span', {}, 'Dage'), lagInput), h('button', { class: 'btn', type: 'submit' }, 'Gem'))));
    const hist = c.kind === 'file'
      ? h('details', { class: 'panel' }, h('summary', {}, 'Importhistorik'), h('div', { class: 'panel-body' }, c.imports.length ? h('ul', { class: 'history' }, c.imports.map((i) => h('li', {}, h('span', { class: 'num' }, when(i.created_at)), h('span', {}, `${i.file_name} · ${i.valid_count} gyldige, ${i.error_count} fejl${i.counts ? ` · ${i.counts.created} nye, ${i.counts.duplicates} dubletter` : ''}`), h('span', {}, { imported: 'Importeret', cancelled: 'Annulleret', preview: 'Forhåndsvist' }[i.status])))) : h('p', { class: 'empty' }, 'Ingen importer endnu.')))
      : h('details', { class: 'panel' }, h('summary', {}, 'Synkroniseringshistorik'), h('div', { class: 'panel-body' }, c.history.length ? h('ul', { class: 'history' }, c.history.map((r) => h('li', {}, h('span', { class: 'num' }, when(r.started_at)), h('span', {}, `${r.counts.created} nye · ${r.counts.duplicates} dubletter · ${r.counts.payout_records} udbetalingsposter${r.errors.length ? ` · ${r.errors[0].message}` : ''}`), h('span', {}, { succeeded: 'OK', failed: 'Fejlet', running: 'Kører' }[r.status] || r.status)))) : h('p', { class: 'empty' }, '—')));
    card.append(sharing, terms, settings, hist, h('div', { class: 'conn-actions' },
      h('div', { class: 'left' }, c.kind === 'file'
        ? h('button', { class: 'btn btn-primary', onclick: () => openImport(c.id) }, 'Importér fil')
        : h('button', { class: 'btn', onclick: (e) => busy(e.target, 'Synkroniserer …', async () => { const r = await call(`/api/payments/connections/${c.id}/sync`, {}); flash(r.status === 'succeeded' ? `Hentet: ${r.counts.created} nye betalinger.` : `Fejl: ${r.errors.map((x) => x.message).join(' ')}`, r.status !== 'succeeded'); await loadIntegrations(); }) }, 'Synkronisér nu')),
      h('button', { class: 'btn btn-danger-quiet', onclick: () => openDisconnect(c) }, 'Afbryd')));
  }
  return card;
}
function renderProviders() {
  const root = $('#providers'); root.replaceChildren();
  for (const p of S.providers) {
    const existing = S.connections.find((c) => c.provider === p.id && c.status !== 'disconnected');
    const li = h('li', { class: 'provider' }, h('span', { class: 'logo', 'aria-hidden': 'true' }, { nets: 'N', sumup: 'Su', zettle: 'Z', verifone: 'V', worldline: 'W' }[p.id]), h('div', {}, h('p', { class: 'name' }, p.name), h('p', {}, p.description)));
    if (p.status === 'file') li.append(existing ? h('button', { class: 'btn', onclick: () => openImport(existing.id) }, 'Manuel import') : h('button', { class: 'btn', onclick: (e) => busy(e.target, '…', async () => { const c = await call('/api/payments/connect', { provider: 'nets' }); await loadIntegrations(); openImport(c.id); }) }, 'Manuel import'));
    else if (p.status === 'available') li.append(existing ? pill(existing.status, existing.status_label) : h('button', { class: 'btn btn-primary', onclick: (e) => busy(e.target, 'Forbinder …', async () => { const r = await call('/api/payments/connect', { provider: p.id }); if (r.authUrl) { location.href = r.authUrl; return; } flash('SumUp er forbundet. Betalinger og udbetalinger er hentet.'); await loadIntegrations(); }) }, 'Forbind'));
    else if (p.status === 'needs_setup') li.append(pill('needs_setup', 'Kræver opsætning'));
    else li.append(pill('planned', 'Integration under udvikling'));
    if (p.research || p.status === 'needs_setup') li.append(h('details', {}, h('summary', {}, p.status === 'needs_setup' ? 'Hvorfor?' : 'Se research'),
      h('p', {}, p.status === 'needs_setup' ? 'Serveren mangler SumUp-nøgler (SUMUP_CLIENT_ID og SUMUP_CLIENT_SECRET). Se docs/PAYMENTS.md.' : p.research), p.next ? h('p', {}, `Næste skridt: ${p.next}`) : null,
      p.docs ? h('p', {}, 'Kilde: ', h('a', { href: p.docs, target: '_blank', rel: 'noopener' }, p.docs)) : null));
    root.append(li);
  }
}
function openDisconnect(c) {
  const dlg = $('#dlg-disconnect');
  dlg.querySelector('[data-bind=dlg-account]').textContent = c.label || c.provider_name;
  $('#dlg-consequences').replaceChildren(...c.disconnect_consequences.map((x) => h('li', {}, x)));
  $('#dlg-delete').checked = false;
  dlg.onclose = async () => { if (dlg.returnValue !== 'confirm') return; try { await call(`/api/payments/connections/${c.id}/disconnect`, { deleteData: $('#dlg-delete').checked }); flash('Forbindelsen er afbrudt.'); await loadIntegrations(); } catch (e) { flash(e.message, true); } };
  dlg.showModal();
}

// ---------- Importguide ----------
let IMP = null;
function openImport(connectionId) {
  IMP = { connectionId, text: null, fileName: null, preview: null };
  const dlg = $('#dlg-import');
  dlg.querySelector('[data-close]').onclick = async () => { if (IMP?.preview?.status === 'preview') { try { await call(`/api/payments/imports/${IMP.preview.id}/cancel`, {}); } catch { /* */ } } dlg.close(); loadIntegrations(); };
  renderImportStep1(); dlg.showModal();
}
const steps = (n) => h('div', { class: 'steps' }, ['1. Vælg fil', '2. Kontrollér', '3. Færdig'].map((s, i) => h('span', { class: i + 1 === n ? 'on' : '' }, s)));
function renderImportStep1() {
  const file = h('input', { type: 'file', accept: '.csv,text/csv,text/plain', id: 'imp-file' });
  const go = async (text, name) => { IMP.text = text; IMP.fileName = name; await doPreview(null); };
  file.addEventListener('change', async () => { const f = file.files[0]; if (!f) return; if (f.size > 10 * 1024 * 1024) return flash('Filen er for stor (maks. 10 MB).', true); try { await go(await f.text(), f.name); } catch (e) { flash(e.message, true); } });
  put($('#imp-body'), steps(1), h('div', { class: 'dropzone' },
    h('label', { for: 'imp-file' }, h('strong', {}, 'Vælg en CSV-fil fra MyNets')), file,
    h('p', { class: 'hint' }, 'I MyNets: Transaktioner → vælg periode og salgssted → Eksportér som CSV. Har du en XLSX-fil, så gem den som CSV i Excel først. Intet gemmes, før du har set forhåndsvisningen og trykket Importér.'),
    S.session.demo ? h('button', { class: 'btn', type: 'button', onclick: (e) => busy(e.target, '…', async () => { const d = await call('/api/payments/demo-file'); await go(d.text, d.fileName); }) }, 'Brug eksempelfil (DEMO)') : null));
}
async function doPreview(mapping) {
  const prev = IMP.preview?.status === 'preview' ? IMP.preview.id : null;
  IMP.preview = await call('/api/payments/imports/preview', { connectionId: IMP.connectionId, text: IMP.text, fileName: IMP.fileName, mapping, previousId: prev });
  renderImportStep2();
}
function renderImportStep2() {
  const p = IMP.preview;
  const selects = {};
  const grid = h('div', { class: 'map-grid' }, Object.entries(p.fields).map(([f, def]) => {
    const sel = h('select', { id: `map-${f}` }, h('option', { value: '' }, def.required ? '— vælg —' : '— ikke med —'),
      p.header.map((col, i) => h('option', { value: String(i), selected: p.mapping[f] === i, disabled: p.blockedColumns.includes(col) }, p.blockedColumns.includes(col) ? `${col} (blokeret: kortdata)` : col)));
    selects[f] = sel;
    return h('label', { class: 'field' }, h('span', {}, def.label, def.required ? ' *' : ''), sel);
  }));
  const cols = ['Reference', 'Tidspunkt', 'Type', 'Beløb', 'Kort', 'Terminal', 'Gebyr', 'Udbetaling'];
  const fmtOre = (o) => (o == null ? '' : (o / 100).toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const table = h('div', { class: 'scroll-x' }, h('table', { class: 'table' }, h('thead', {}, h('tr', {}, cols.map((c) => h('th', { scope: 'col' }, c)))),
    h('tbody', {}, p.preview.map((r) => h('tr', {}, h('td', {}, r.external_ref), h('td', {}, r.time_known ? dtf.format(new Date(r.occurred_at)) : df.format(new Date(r.occurred_at))), h('td', {}, T.kind[r.type]), h('td', { class: 'num' }, `${fmtOre(r.amount_ore)} ${r.currency}`), h('td', {}, r.card_scheme || ''), h('td', {}, r.terminal_external_id || ''), h('td', { class: 'num' }, fmtOre(r.fee_ore)), h('td', {}, r.payout_date || ''))))));
  const canImport = !p.missingRequired.length && p.valid_count > 0;
  put($('#imp-body'), steps(2),
    h('p', { class: 'hint' }, `${p.file_name} · ${p.row_count} rækker. Kolonnerne er gættet ud fra overskrifterne – ret dem, hvis noget er forkert.`),
    p.blockedColumns.length ? h('p', { class: 'blocked' }, `Blokeret og ignoreret (kan indeholde kortdata): ${p.blockedColumns.join(', ')}. Disse kolonner gemmes aldrig.`) : null,
    grid, h('div', { class: 'row-fields' }, h('button', { class: 'btn', type: 'button', onclick: (e) => busy(e.target, 'Opdaterer …', async () => { const m = {}; for (const [f, s] of Object.entries(selects)) if (s.value !== '') m[f] = Number(s.value); await doPreview(m); }) }, 'Opdatér forhåndsvisning')),
    p.missingRequired.length ? h('ul', { class: 'errlist' }, h('li', {}, `Vælg kolonne for: ${p.missingRequired.join(', ')}`)) : null,
    h('div', { class: 'counts' }, h('span', {}, h('b', {}, p.valid_count), ' gyldige'), h('span', {}, h('b', {}, p.error_count), ' med fejl'), h('span', {}, h('b', {}, p.already_imported_count), ' findes allerede')),
    p.warnings.length ? h('ul', { class: 'warnlist' }, p.warnings.map((w) => h('li', {}, w))) : null,
    p.errors.length ? h('ul', { class: 'errlist', 'aria-label': 'Fejl i filen' }, p.errors.slice(0, 50).map((e) => h('li', {}, `Linje ${e.line}: ${e.error}`))) : null,
    p.preview.length ? [h('p', { class: 'hint' }, `Forhåndsvisning (de første ${p.preview.length} gyldige rækker):`), table] : null,
    h('div', { class: 'dlg-actions' },
      h('button', { class: 'btn btn-quiet', type: 'button', onclick: (e) => busy(e.target, '…', async () => { await call(`/api/payments/imports/${p.id}/cancel`, {}); IMP.preview.status = 'cancelled'; $('#dlg-import').close(); flash('Importen er annulleret. Intet er gemt.'); loadIntegrations(); }) }, 'Annullér'),
      h('button', { class: 'btn btn-primary', type: 'button', disabled: !canImport, onclick: (e) => busy(e.target, 'Importerer …', async () => { const r = await call(`/api/payments/imports/${p.id}/confirm`, {}); IMP.preview.status = 'imported'; renderImportStep3(r); }) }, `Importér ${p.valid_count} rækker`)));
}
function renderImportStep3(r) {
  put($('#imp-body'), steps(3), h('div', { class: 'counts' }, h('span', {}, h('b', {}, r.counts.created), ' nye'), h('span', {}, h('b', {}, r.counts.updated), ' opdaterede'), h('span', {}, h('b', {}, r.counts.duplicates), ' dubletter sprunget over'), h('span', {}, h('b', {}, r.error_count), ' afviste rækker')),
    h('p', { class: 'hint' }, 'Afviste rækker er ikke gemt. Ret dem i MyNets-eksporten og importér igen – allerede importerede rækker tælles ikke to gange.'),
    h('div', { class: 'dlg-actions' }, h('a', { class: 'btn', href: '/puls/betalinger' }, 'Se i PULS'), h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { $('#dlg-import').close(); loadIntegrations(); } }, 'Færdig')));
}

// =================== PULS -> Betalinger ===================
let P = null, tab = 'review';
const TABS = [['review', 'Kræver handling', (i) => !i.resolved && ['needs_review', 'deviation', 'unknown'].includes(i.status)], ['waiting', 'Afventer', (i) => !i.resolved && ['awaiting_payment', 'awaiting_settlement'].includes(i.status)],
  ['matched', 'Matchet', (i) => !i.resolved && i.status === 'matched'], ['resolved', 'Løst', (i) => i.resolved]];
async function loadPuls() { try { P = await call('/api/puls/payments'); setHeader(P.session); renderPuls(); } catch (e) { flash(e.message, true); } }
function renderPuls() {
  const d = P.dashboard;
  ['kpi-block', 'work-block', 'payout-block', 'workers-block'].forEach((id) => { $(`#${id}`).hidden = !d.available; });
  if (!d.available) { $('#empty').replaceChildren(h('div', { class: 'card empty-card' }, h('strong', {}, 'Ingen betalingsdata endnu'), h('p', { class: 'hint' }, d.message), h('p', {}, h('a', { class: 'btn btn-primary', href: '/integrationer/betalinger' }, 'Forbind betalingsudbyder')))); return; }
  $('#empty').replaceChildren();
  const g = d.byCurrency[0] || { labels: {}, payouts: [] };
  const open = d.reconciliation.available ? d.reconciliation.counts.needs_review + d.reconciliation.counts.deviation + d.reconciliation.counts.unknown : null;
  const kpi = (title, value, def, extra = {}) => h('div', { class: `kpi${extra.attention ? ' attention' : ''}` }, h('dt', {}, h('span', {}, title), extra.tag ? h('span', { class: 'mini' }, extra.tag) : null), h('dd', {}, h('span', { class: 'big' }, value), h('span', { class: 'def' }, def)));
  $('#kpis').replaceChildren(
    kpi('Dagens kortbetalinger', g.labels.today || '0,00 kr.', `${g.todayCount || 0} betalinger · ${df.format(new Date(d.today))}`),
    kpi('Afventer udbetaling', g.labels.awaiting || '0,00 kr.', g.awaitingCount ? `${g.awaitingCount} betalinger, ældste ${df.format(new Date(g.oldestAwaiting))}. Ikke penge på kontoen.` : 'Alt er udbetalt.'),
    kpi('Udbetalinger', g.labels.payouts || '0,00 kr.', `${(g.payouts || []).length} udbetalinger · 30 dage`),
    kpi('Betalingsgebyrer', g.feeCoverage === 'mangler' || g.feeCoverage === 'ingen' ? 'Ukendt' : g.labels.fees, g.feeCoverage === 'fuld' ? 'Fra udbyderens data · 30 dage' : g.feeCoverage === 'delvis' ? 'Kun for udbetalte betalinger · 30 dage' : 'Udbyderens data indeholder ingen gebyrer endnu'),
    kpi('Refunderinger', g.labels.refunds || '0,00 kr.', `${g.refundsCount || 0} ${g.refundsCount === 1 ? 'refundering' : 'refunderinger'} · 30 dage${g.chargebacksOre ? ` · chargebacks ${g.labels.chargebacks}` : ''}`),
    kpi('Afstemning', open == null ? '—' : String(open), d.reconciliation.available ? `kræver handling · ${d.reconciliation.counts.matched} matchet` : d.reconciliation.reason, { attention: open > 0 }));
  $('#sources').textContent = `Kilder: ${d.sources.map((s) => `${s.label || s.provider} (${s.status}${s.coverage_until ? `, data til ${when(s.coverage_until)}` : ''}${s.demo ? ', DEMO' : ''}${s.historical ? ', afbrudt' : ''})`).join(' · ')}. ${d.definitions.card}`;
  renderTabs(); renderWork();
  $('#payouts tbody').replaceChildren(...(g.payouts || []).map((p) => h('tr', {}, h('td', { 'data-label': 'Dato' }, df.format(new Date(p.date)), h('div', { class: 'mini' }, p.reference || '')), h('td', { 'data-label': 'Udbyder' }, PROVIDER[p.provider] || p.provider), h('td', { class: 'num', 'data-label': 'Brutto' }, p.gross), h('td', { class: 'num', 'data-label': 'Gebyrer' }, p.fees), h('td', { class: 'num', 'data-label': 'Fradrag' }, p.deductions), h('td', { class: 'num', 'data-label': 'Netto' }, h('strong', {}, p.net)))));
  if (!(g.payouts || []).length) $('#payouts tbody').append(h('tr', {}, h('td', { colspan: '6', class: 'empty' }, 'Ingen registrerede udbetalinger i perioden.')));
  $('#workers tbody').replaceChildren(...P.workers.map((w) => h('tr', {}, h('td', {}, h('strong', {}, w.name), h('div', { class: 'mini' }, w.purpose)), h('td', {}, h('span', { class: 'chip' }, w.app.toUpperCase())),
    h('td', { class: 'mini' }, w.lastRun ? (w.lastRun.status === 'succeeded' ? `${when(w.lastRun.finished_at)} · ${w.lastRun.output.tasks?.created?.length ?? 0} nye opgaver` : w.lastRun.reason || w.lastRun.error) : 'Ikke kørt'),
    h('td', {}, h('button', { class: 'btn', onclick: (e) => busy(e.target, 'Kører …', async () => { const r = await call(`/api/payments/workers/${w.id}/run`, {}); flash(r.status === 'succeeded' ? `${w.name} er kørt.` : r.reason || r.error, r.status !== 'succeeded'); await loadPuls(); }) }, 'Kør nu')))));
}
function renderTabs() {
  if (!P.worklist.available) { $('#tabs').replaceChildren(); return; }
  $('#tabs').replaceChildren(...TABS.map(([id, label, fn]) => h('button', { class: 'tab', role: 'tab', 'aria-selected': String(tab === id), onclick: () => { tab = id; renderTabs(); renderWork(); } }, label, h('span', { class: 'n' }, P.worklist.items.filter(fn).length))));
}
function renderWork() {
  const ul = $('#work');
  if (!P.worklist.available) { ul.replaceChildren(h('li', { class: 'wi' }, h('p', { class: 'hint' }, P.worklist.reason))); return; }
  const fn = TABS.find((t) => t[0] === tab)[2];
  ul.replaceChildren(...P.worklist.items.filter(fn).slice(0, 100).map(workItem));
}
function workItem(i) {
  const side = (label, content) => h('div', { class: 'side' }, h('b', {}, label), ...content);
  const posSide = i.pos ? [h('span', {}, `Ordre ${i.pos.order} · ${i.pos.amount}`), h('span', { class: 'mini' }, `${when(i.pos.at)} · ${i.pos.gateway || 'Kort'}${i.pos.split ? ' · delt betaling' : ''}`)] : [h('span', { class: 'none' }, 'Intet kassesalg fundet')];
  const txSide = i.tx ? [h('span', {}, `${i.tx.ref} · ${i.amount}`), h('span', { class: 'mini' }, `${when(i.tx.at)} · ${PROVIDER[i.tx.provider] || i.tx.provider}${i.tx.scheme ? ` · ${i.tx.scheme}` : ''}${i.tx.terminal ? ` · ${i.tx.terminal}` : ''}${i.tx.payout_date ? ` · udbetalt ${i.tx.payout_date}` : ''}`)]
    : i.candidates ? [h('span', {}, `${i.candidates.length} mulige betalinger`)] : [h('span', { class: 'none' }, 'Ikke fundet hos udbyderen')];
  const actions = [];
  const decide = async (decision, extra = {}) => { await call('/api/payments/decide', { key: i.key, decision, ...extra }); flash(decision === 'confirm' ? 'Match bekræftet.' : decision === 'reject' ? 'Forslag afvist.' : 'Markeret som løst.'); await loadPuls(); };
  if (!i.resolved) {
    if (i.suggestion) actions.push(h('button', { class: 'btn btn-accent', onclick: (e) => busy(e.target, '…', () => decide('confirm')) }, 'Bekræft match'), h('button', { class: 'btn', onclick: (e) => busy(e.target, '…', () => decide('reject')) }, 'Afvis'));
    else if (i.candidates) { const sel = h('select', { 'aria-label': 'Vælg betaling' }, i.candidates.map((c) => h('option', { value: c }, c.split('|').pop()))); actions.push(sel, h('button', { class: 'btn btn-accent', onclick: (e) => busy(e.target, '…', () => decide('confirm', { txKey: sel.value })) }, 'Vælg')); }
    if (['needs_review', 'deviation', 'unknown'].includes(i.status) && !i.suggestion) actions.push(h('button', { class: 'btn', onclick: () => { const dlg = $('#dlg-resolve'); $('#res-note').value = ''; dlg.onclose = async () => { if (dlg.returnValue === 'confirm') { try { await decide('resolve', { note: $('#res-note').value }); } catch (e) { flash(e.message, true); } } }; dlg.showModal(); } }, 'Markér som løst'));
  }
  return h('li', { class: `wi${i.resolved ? ' resolved' : ''}` },
    h('div', { class: 'wi-amount' }, i.amount, h('small', {}, T.kind[i.kind] || i.kind), pill(i.status, i.status_label), i.confidence ? h('small', {}, `Sikkerhed: ${i.confidence}`) : null),
    h('div', { class: 'wi-body' }, h('div', { class: 'wi-sides' }, side('KASSEN', posSide), side('BETALINGSUDBYDER', txSide)),
      h('div', { class: 'wi-reasons' }, i.reasons.map((r) => h('span', {}, r)), i.resolution ? h('span', {}, `Løst: ${i.resolution.note}`) : null)),
    h('div', { class: 'wi-actions' }, actions));
}

// =================== Start ===================
const qs = new URLSearchParams(location.search);
if (qs.get('forbundet')) flash('Forbindelsen er oprettet.');
if (qs.get('fejl')) flash(qs.get('fejl'), true);
if (document.body.dataset.page === 'integrations') loadIntegrations(); else loadPuls();
