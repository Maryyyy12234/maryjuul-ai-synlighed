/* Responsiv regression på 5 skærmstørrelser: overflow, ødelagte billeder, links, interaktioner og fokus.
   Udfaset med vilje: forsidens kollektions-faner, nyhedsbrev-formular og "Læg i kurv"/størrelsesvalg (køb er ikke åbnet). */
const { chromium } = require('playwright');
const { BASE, OUT, reporter, watch } = require('./helpers');
(async () => {
  const b = await chromium.launch(); const r = reporter('test10'); const done = [];
  const overflow = async (p, tag) => { const [sw, iw] = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); r.check(sw <= iw, `${tag}: ingen overflow (${sw}>${iw})`); };
  const settle = async p => { await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise(res => setTimeout(res, 30)); } scrollTo(0, 0); }); await p.waitForTimeout(400); };
  const broken = async (p, tag) => { const bad = await p.evaluate(() => [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.src)); r.check(bad.length === 0, `${tag}: ingen ødelagte billeder ${bad.join(' ')}`); };
  const known = /^#(forside|shop|women|men|collections|about|noir-edit|in-out|penny|holly|noir|io-shop|io-looks|kollektionen|lookbook|kassen|kurv|produkt-(alma|freja|cleo|everywhere-tee|everywhere-stripe-pants|soft-fit-top|soft-fit-wide-pants|off-duty-zip|off-duty-stripe-pants|bow-hoodie|bow-wide-pants))$/;

  for (const [w, h, name] of [[320, 640, 's320'], [390, 844, 'm390'], [768, 1024, 't768'], [1024, 768, 'l1024'], [1440, 900, 'd1440']]) {
    const p = await b.newPage({ viewport: { width: w, height: h } }); watch(p, r, name);
    for (const [hash, tag] of [['#forside', 'home'], ['#women', 'shop'], ['#produkt-alma', 'alma'], ['#produkt-freja', 'freja'], ['#produkt-cleo', 'cleo'], ['#noir-edit', 'noir'], ['#in-out', 'inout'], ['#collections', 'collections'], ['#about', 'about'], ['#men', 'men'], ['#produkt-everywhere-tee', 'look1'], ['#produkt-soft-fit-wide-pants', 'look2'], ['#produkt-off-duty-zip', 'look3'], ['#holly', 'holly'], ['#produkt-bow-hoodie', 'bowset']]) {
      await p.goto(BASE + hash); await p.waitForTimeout(450);
      if (tag === 'home') await p.screenshot({ path: `${OUT}/${name}-home-fold.png` });
      await settle(p); await broken(p, `${name}/${tag}`); await overflow(p, `${name}/${tag}`);
      r.check(await p.locator('h1').count() === 1, `${name}/${tag}: én H1`);
    }
    // links peger kun på kendte ruter
    const hrefs = [];
    for (const pg of ['#forside', '#in-out', '#noir-edit', '#collections', '#about', '#produkt-soft-fit-top', '#holly', '#produkt-bow-hoodie']) {
      await p.goto(BASE + pg); await p.waitForTimeout(250);
      hrefs.push(...await p.evaluate(() => [...document.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href'))));
    }
    [...new Set(hrefs)].filter(x => !known.test(x)).forEach(x => r.fail(`${name}: ukendt link ${x}`));

    // forside: tre kollektionsindgange fører til kollektionerne
    await p.goto(BASE + '#forside'); await p.waitForTimeout(300);
    const entries = await p.$$eval('.h-entry', a => a.map(x => x.getAttribute('href')).join());
    r.check(entries === '#noir-edit,#in-out,#holly', `${name}: kollektionsindgange (${entries})`);
    r.check(await p.locator('input[type="email"]').count() === 0, `${name}: ingen nyhedsbrev-formular uden backend`);

    // shop: filter og sortering
    await p.goto(BASE + '#women'); await p.waitForTimeout(300);
    const js = sel => p.$eval(sel, e => e.click());
    await js('[data-f="cat"][data-v="sko"]'); await p.waitForTimeout(150);
    r.check(await p.locator('.fx-grid3 .fx-card').count() === 1, `${name}: filter sko = 1`);
    await js('[data-f="cat"][data-v="alle"]'); await p.waitForTimeout(150); await p.selectOption('#sortSel', 'navn'); await p.waitForTimeout(150);
    const names = await p.$$eval('.fx-grid3 .fx-card b', a => a.map(x => x.textContent));
    r.check(names.length === 11 && names.join() === [...names].sort((a, c) => a.localeCompare(c, 'da')).join(), `${name}: sortering A–Å`);
    await js('[data-f="coll"][data-v="in-out"]'); await p.waitForTimeout(150);
    r.check(await p.locator('.fx-grid3 .fx-card').count() === 6, `${name}: Penny-filter = 6`);

    // Penny mix & match
    await p.goto(BASE + '#in-out'); await p.waitForTimeout(400);
    await p.click('[data-mm="bot"] button:nth-child(3)');
    r.check(/Off-Duty Stripe Pants/.test(await p.$$eval('#mmStage .mm-item b', a => a.map(x => x.textContent).join('+'))), `${name}: mix & match`);

    // konceptprodukt: neutral status, tech pack-sektion
    await p.goto(BASE + '#produkt-off-duty-zip'); await p.waitForTimeout(300);
    r.check(/Kan ikke købes endnu/.test(await p.textContent('.fx-notice')), `${name}: udviklingsstatus vist`);
    await p.click('.fx-acc summary >> nth=3');
    r.check(await p.$eval('.fx-acc details:nth-child(4)', d => d.open), `${name}: tech pack-sektion åbner`);

    // Holly: galleri følger farve
    await p.goto(BASE + '#produkt-bow-hoodie'); await p.waitForTimeout(300);
    await p.click('[data-pc="Cherry Wine"]');
    const gal = await p.$$eval('#pdpGal img', a => a.map(i => i.getAttribute('src')).join(' '));
    r.check(/wine/.test(gal) && !/white/.test(gal), `${name}: Holly-galleri følger farven`);

    // billedstatus og Noir koncept-farve
    await p.goto(BASE + '#billeder'); await p.waitForTimeout(250);
    r.check(await p.locator('.mtable tbody tr').count() >= 30, `${name}: billedstatus-tabel`);
    await p.goto(BASE + '#produkt-alma'); await p.waitForTimeout(250);
    await p.click('[data-pc="Midnight Navy"]');
    r.check(/koncept/.test(await p.textContent('#pdpColNote')), `${name}: Noir koncept-farve forklares`);

    // synligt tastaturfokus
    await p.goto(BASE + '#forside'); await p.waitForTimeout(300);
    for (let k = 0; k < 3; k++) await p.keyboard.press('Tab');
    r.check(await p.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return false; const shows = el => { const cs = getComputedStyle(el); return cs.outlineStyle !== 'none' || cs.boxShadow !== 'none'; }; return shows(e) || [...e.children].some(shows); }), `${name}: synligt tastaturfokus`); /* skillelinjen viser fokus på sin DUO-knap */

    // Noir: Dag/Aften, lookbook, vend produkt
    await p.goto(BASE + '#noir-edit'); await p.waitForTimeout(400);
    await p.$eval('#dn', e => e.scrollIntoView()); await p.click('[data-mode="aften"]'); await p.waitForTimeout(700);
    r.check(await p.$eval('#dn', e => e.classList.contains('night')), `${name}: Aften-skift`);
    await p.$eval('#sec-lookbook', e => e.scrollIntoView()); await p.click('[data-lb="1"]'); await p.waitForTimeout(800);
    r.check(/^02/.test(await p.textContent('#lbCount')), `${name}: lookbook næste`);
    await p.$eval('.p-alma', e => e.scrollIntoView()); await p.click('.p-alma [data-flip]'); await p.waitForTimeout(500);
    r.check(await p.$eval('.p-alma', e => e.classList.contains('flipped')), `${name}: vend til bagside`);

    // skuffer og menu
    await p.goto(BASE + '#forside'); await p.waitForTimeout(300);
    await p.click('footer [data-open="policies"]'); await p.waitForTimeout(350);
    r.check(await p.$eval('#policies', e => e.classList.contains('open')), `${name}: politik-skuffe åbner`);
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    if (w >= 1000) {
      await p.click('header [data-open="sizeguide"]'); await p.waitForTimeout(500);
      r.check(await p.$eval('#sizeguide', e => e.classList.contains('open')), `${name}: størrelsesguide åbner`);
      await p.keyboard.press('Escape');
    } else {
      await p.click('#menuBtn'); await p.waitForTimeout(700); await p.screenshot({ path: `${OUT}/${name}-menu.png` });
      await p.click('#sheet a[href="#women"]'); await p.waitForTimeout(500);
      r.check(await p.isVisible('.fx-grid3'), `${name}: menu → shop`);
      await p.goto(BASE + '#produkt-freja'); await p.waitForTimeout(300); await p.click('.fx-info [data-open="sizeguide"]'); await p.waitForTimeout(500);
      r.check(await p.$eval('#sizeguide', e => e.classList.contains('open')), `${name}: størrelsesguide fra produktside`);
    }
    done.push(name); await p.close();
  }
  console.log('[test10] testet:', done.join(', ')); r.done(); await b.close();
})();
