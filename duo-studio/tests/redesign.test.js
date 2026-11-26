/* DUO STUDIO – redesign-tjek. Kør: node build.js, server dist/ på :8765, derefter: node tests/redesign.test.js */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8765/';
(async () => {
  const b = await chromium.launch(); const bad = []; const ok = [];
  const check = (cond, msg) => (cond ? ok : bad).push(msg);
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => bad.push('JS-fejl: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') bad.push('Konsolfejl: ' + m.text()); });

  // Forside: én H1, hero-billede prioriteret, ingen købs-CTA, ingen formularer der lader som om
  await p.goto(BASE + '#forside'); await p.waitForTimeout(600);
  check(await p.locator('h1').count() === 1, 'forside: én H1');
  check((await p.locator('h1').textContent()).includes('Bløde former'), 'forside: H1-tekst');
  check(await p.locator('.h-hero-img img[fetchpriority="high"]').count() === 1, 'forside: hero-billede prioriteret');
  check(await p.locator('.h-hero .btn-p').textContent() === 'Se kollektionen', 'forside: én primær CTA "Se kollektionen"');
  check(await p.locator('.h-entry').count() === 3, 'forside: tre kollektionsindgange');
  const picks = await p.locator('.h-picks .fx-card').count(); check(picks >= 4 && picks <= 6, 'forside: 4–6 udvalgte styles');
  check(await p.locator('input[type="email"]').count() === 0, 'ingen e-mail-formular uden backend');
  check(await p.locator('#bagBtn').count() === 0, 'kurv er ikke i hovedmenuen');
  check(await p.locator('[data-live], [data-car], #dealTrack').count() === 0, 'ingen autoplay-karrusel på forsiden');
  check(await p.locator('text=/læg i kurv|til kassen|shop nu/i').count() === 0, 'ingen købs-handlinger på forsiden');

  // Alle ruter: én H1, ingen ødelagte billeder
  for (const r of ['#women', '#noir-edit', '#in-out', '#holly', '#collections', '#about', '#produkt-alma', '#produkt-bow-hoodie', '#produkt-soft-fit-wide-pants']) {
    await p.goto(BASE + r); await p.waitForTimeout(400);
    const n = await p.locator('h1').count(); check(n === 1, `${r}: én H1 (${n})`);
    const broken = await p.evaluate(() => [...document.images].filter(i => i.complete && i.naturalWidth === 0 && i.loading !== 'lazy').length);
    check(broken === 0, `${r}: ingen ødelagte billeder`);
  }

  // Shop: filtre og sortering virker
  await p.goto(BASE + '#women'); await p.waitForTimeout(400);
  const all = await p.locator('.fx-grid3 .fx-card').count();
  await p.click('[data-f="coll"][data-v="noir-edit"]'); await p.waitForTimeout(200);
  const noir = await p.locator('.fx-grid3 .fx-card').count(); check(noir === 3 && all > noir, `shop: filter Noir (${all} → ${noir})`);
  await p.click('[data-freset]'); await p.selectOption('#sortSel', 'navn'); await p.waitForTimeout(200);
  const names = await p.locator('.fx-grid3 .fx-card-h b').allTextContents();
  check(names.join() === [...names].sort((a, c) => a.localeCompare(c, 'da')).join(), 'shop: sortering A–Å');

  // Produktside: galleri, farver med navne, ingen køb
  await p.goto(BASE + '#produkt-bow-hoodie'); await p.waitForTimeout(400);
  const src0 = await p.locator('.fx-main img').getAttribute('src');
  await p.click('[data-pc="Powder Blue"]'); await p.waitForTimeout(200);
  check((await p.locator('.fx-main img').getAttribute('src')) !== src0, 'Holly: billede skifter med farve');
  check((await p.locator('#pdpCol').textContent()) === 'Powder Blue', 'Holly: farvenavn vises');
  check(await p.locator('.fx-col span').count() >= 3, 'farvenavne står ved swatches');
  const th = await p.locator('#pdpGal [data-img]').count(); await p.locator('#pdpGal [data-img]').nth(1).click(); await p.waitForTimeout(150);
  check(th > 1 && (await p.locator('#pdpGal [data-img="1"]').getAttribute('aria-selected')) === 'true', 'galleri: miniaturer virker');
  check(await p.locator('#addBtn, .fx-qty, #fxMbar').count() === 0, 'produktside: ingen antal/kurv-knapper');
  check(await p.locator('.fx-notice').count() === 1, 'produktside: neutral udviklingsnotits');
  await p.close();

  // Mobil: menu åbner/lukker med tastatur og fokus vender tilbage
  for (const [w, vh] of [[320, 640], [390, 844]]) {
    const m = await b.newPage({ viewport: { width: w, height: vh } });
    await m.goto(BASE + '#forside'); await m.waitForTimeout(400);
    const fold = await m.evaluate(() => ['.h-cap', '#hH1', '.h-hero .btn-p'].map(q => document.querySelector(q).getBoundingClientRect().bottom <= innerHeight));
    check(fold.every(Boolean), `${w}px: label, H1 og CTA synlige uden scroll (${fold})`);
    const im = await m.evaluate(() => { const i = document.querySelector('.h-hero-img img'); return getComputedStyle(i).objectFit + ' ' + Math.abs(i.getBoundingClientRect().width / i.getBoundingClientRect().height - 2 / 3).toFixed(3); });
    check(im.startsWith('contain') && parseFloat(im.split(' ')[1]) < 0.01, `${w}px: hero-billede bevarer proportioner (${im})`);
    check(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${w}px: intet vandret overløb`);
    const box = await m.locator('#menuBtn').boundingBox(); check(box.width >= 44 && box.height >= 44, `${w}px: menu-knap ≥ 44×44`);
    await m.focus('#menuBtn'); await m.keyboard.press('Enter'); await m.waitForTimeout(300);
    check((await m.getAttribute('#menuBtn', 'aria-expanded')) === 'true', `${w}px: menu åbner (aria-expanded)`);
    await m.keyboard.press('Escape'); await m.waitForTimeout(300);
    check((await m.getAttribute('#menuBtn', 'aria-expanded')) === 'false', `${w}px: Escape lukker menu`);
    check(await m.evaluate(() => document.activeElement && document.activeElement.id === 'menuBtn'), `${w}px: fokus tilbage på Menu`);
    await m.close();
  }
  console.log('[redesign] OK:', ok.length); if (bad.length) { console.log('FEJL:\n - ' + bad.join('\n - ')); process.exitCode = 1; } else console.log('INGEN PROBLEMER');
  await b.close();
})();
