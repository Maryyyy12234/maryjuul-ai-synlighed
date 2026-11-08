'use strict';
// Fælles sidemenu og brødkrumme for alle sider. Viser kun sider, der findes;
// sider der ikke er bygget, vises som "Ikke bygget" uden link.
(function () {
  const NAV = [
    { label: 'PULS', items: [{ href: '/puls/betalinger', text: 'Betalinger' }, { text: 'Økonomioverblik', disabled: true }] },
    { label: 'Indstillinger', items: [
      { text: 'Virksomhed', disabled: true }, { text: 'Medarbejdere', disabled: true },
      { text: 'Integrationer', children: [{ href: '/integrationer/kassesystemer', text: 'Kassesystemer' }, { href: '/integrationer/betalinger', text: 'Betalinger og terminaler' }] },
      { text: 'Abonnement', disabled: true },
    ] },
  ];
  const el = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) e.setAttribute(k, v === true ? '' : v); for (const c of kids.flat()) if (c != null) e.append(c instanceof Node ? c : document.createTextNode(c)); return e; };
  const here = location.pathname.replace(/\/$/, '') || '/integrationer/kassesystemer';
  const aside = document.querySelector('aside.sidebar[data-shell]');
  if (!aside) return;
  const nav = el('nav');
  for (const g of NAV) {
    nav.append(el('p', { class: 'nav-label' }, g.label));
    const ul = el('ul');
    for (const it of g.items) {
      if (it.disabled) { ul.append(el('li', {}, el('span', { class: 'nav-item is-disabled', 'aria-disabled': 'true' }, it.text, ' ', el('small', {}, 'Ikke bygget')))); continue; }
      if (it.children) {
        const active = it.children.some((c) => c.href === here);
        const sub = el('ul', { class: 'sub' }, it.children.map((c) => el('li', {}, el('a', { class: `nav-sub${c.href === here ? ' is-active' : ''}`, href: c.href, 'aria-current': c.href === here ? 'page' : null }, c.text))));
        ul.append(el('li', {}, el('span', { class: `nav-item${active ? ' is-active' : ''}` }, it.text), sub));
        continue;
      }
      ul.append(el('li', {}, el('a', { class: `nav-item${it.href === here ? ' is-active' : ''}`, href: it.href, 'aria-current': it.href === here ? 'page' : null }, it.text)));
    }
    nav.append(ul);
  }
  aside.replaceChildren(
    el('div', { class: 'org' }, el('span', { class: 'org-mark', 'aria-hidden': 'true' }), el('span', { class: 'org-name', 'data-bind': 'org' }, '…')),
    nav,
    el('p', { class: 'dev-note' }, 'Udviklingsversion uden login. Må ikke bruges med rigtige kundedata.'));
  // Mobil: kompakt sideskifter
  const top = document.querySelector('.topbar');
  if (top && !document.querySelector('.mobile-nav')) {
    const sel = el('select', { class: 'mobile-nav', 'aria-label': 'Skift side' },
      el('option', { value: '/puls/betalinger', selected: here === '/puls/betalinger' }, 'PULS · Betalinger'),
      el('option', { value: '/integrationer/kassesystemer', selected: here === '/integrationer/kassesystemer' }, 'Kassesystemer'),
      el('option', { value: '/integrationer/betalinger', selected: here === '/integrationer/betalinger' }, 'Betalinger og terminaler'));
    sel.addEventListener('change', () => { location.href = sel.value; });
    top.insertBefore(sel, top.children[1] || null);
  }
})();
