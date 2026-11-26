/* Brugerflow: shop (filtre/sortering), produktsider (galleri/farver), før-lancerings-adfærd, kurv- og kassekode.
   Udfaset med vilje: "Læg i kurv", antal-vælger og kurv-tæller i headeren (køb er ikke åbnet).
   Kurv og kasse er bevaret i koden og testes via localStorage + #kurv/#kassen. */
const { chromium } = require('playwright');
const { BASE, OUT, seedCart, reporter, watch } = require('./helpers');
(async () => {
  const b = await chromium.launch(); const r = reporter('flow');
  for (const [label, w, h] of [['desktop', 1440, 900], ['mobil', 390, 844]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } }); const p = await ctx.newPage(); watch(p, r, label);
    const ov = async tag => { const o = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); r.check(o <= 0, `${label} ${tag}: ingen vandret overflow (${o})`); };

    // SHOP
    await p.goto(BASE + '#women'); await p.waitForTimeout(500); await ov('shop');
    const n0 = await p.locator('.fx-grid3 .fx-card').count(); r.check(n0 === 11, `${label} shop viser 11 produkter (${n0})`);
    if (label === 'mobil') { await p.click('[data-fopen]'); await p.waitForTimeout(200); r.check(await p.isVisible('#fxFilters'), `${label} filterpanel åbner`); }
    await p.click('[data-f="coll"][data-v="holly"]'); await p.waitForTimeout(250);
    const colls = await p.$$eval('.fx-grid3 .fx-card', c => c.map(x => x.dataset.coll));
    r.check(colls.length === 2 && colls.every(c => c === 'holly'), `${label} kollektionsfilter Holly (${colls.length})`);
    await p.click('[data-f="cat"][data-v="bukser"]'); await p.waitForTimeout(250);
    r.check(await p.locator('.fx-grid3 .fx-card').count() === 1, `${label} kategori Bukser + Holly = 1`);
    await p.click('[data-freset]'); await p.waitForTimeout(250);
    await p.click('[data-f="color"][data-v="Midnight Navy"]'); await p.waitForTimeout(250);
    r.check(await p.locator('.fx-grid3 .fx-card').count() >= 2, `${label} farvefilter Midnight Navy`);
    await p.click('[data-freset]'); await p.waitForTimeout(250);
    if (label === 'mobil') { await p.click('[data-fclose]'); await p.waitForTimeout(250); r.check(!(await p.isVisible('#fxFilters')), `${label} filterpanel lukker`); }
    await p.selectOption('#sortSel', 'navn'); await p.waitForTimeout(250);
    r.check((await p.locator('.fx-grid3 .fx-card b').first().textContent()) === 'Alma', `${label} sortering A–Å starter med Alma`);
    r.check(await p.locator('.fx-grid3 .fx-card .fx-price').count() === 0, `${label} ingen gentaget "Pris følger" på kort`);
    await p.screenshot({ path: `${OUT}/flow-shop-${label}.png` });

    // PDP Holly: galleri og farver
    await p.goto(BASE + '#produkt-bow-hoodie'); await p.waitForTimeout(600); await ov('pdp holly');
    const src0 = await p.$eval('.fx-main img', i => i.getAttribute('src'));
    await p.click('[data-pc="Cherry Wine"]'); await p.waitForTimeout(250);
    const src1 = await p.$eval('.fx-main img', i => i.getAttribute('src'));
    r.check(src0.includes('white') && src1.includes('wine'), `${label} Holly farveskift ${src0} → ${src1}`);
    r.check((await p.textContent('#pdpCol')) === 'Cherry Wine', `${label} farvenavn opdateres`);
    r.check(await p.locator('.fx-thumbs button').count() >= 3, `${label} Holly har miniaturer`);
    // Før lancering: ingen købs-handlinger, neutral notits
    r.check(await p.locator('#addBtn, [data-pq], [data-ps], #bagBtn').count() === 0, `${label} ingen kurv/antal/størrelses-valg`);
    r.check(/Kan ikke købes endnu/.test(await p.textContent('.fx-notice')), `${label} neutral udviklingsnotits`);
    r.check(/Foreløbigt udvalg/.test(await p.textContent('.fx-info')), `${label} foreløbigt størrelsesudvalg vist som tekst`);

    // PDP Noir: koncept-farve forklares
    await p.goto(BASE + '#produkt-alma'); await p.waitForTimeout(500); await ov('pdp alma');
    await p.click('[data-pc="Chocolate Brown"]'); await p.waitForTimeout(150);
    r.check(/kun et koncept/.test(await p.textContent('#pdpColNote')), `${label} Noir koncept-farve forklares`);

    // PDP Penny: "Fuldend sættet"
    await p.goto(BASE + '#produkt-soft-fit-top'); await p.waitForTimeout(500); await ov('pdp penny');
    r.check(await p.locator('.fx-set .fx-card').count() === 1, `${label} "Fuldend sættet" vises`);

    // Kurv (bevaret kode)
    await seedCart(p, [{ id: 'bow-hoodie', size: 'M', color: 'Cherry Wine', qty: 2 }, { id: 'alma', size: null, color: 'Black', qty: 1 }]);
    await p.goto(BASE + '#kurv'); await p.waitForTimeout(400); await ov('kurv');
    r.check(await p.locator('.fx-tr:not(.fx-th)').count() === 2, `${label} kurvside 2 linjer`);
    r.check(/Cherry Wine/.test(await p.textContent('.fx-tr:not(.fx-th)')), `${label} kurvlinje viser farve`);
    await p.click('.fx-tr:not(.fx-th) [data-d="1"]'); await p.waitForTimeout(250);
    r.check(await p.evaluate(() => JSON.parse(localStorage.getItem('duo-cart'))[0].qty) === 3, `${label} antal + på kurvside`);

    // Kasse: validering og ingen betaling
    await p.goto(BASE + '#kassen'); await p.waitForTimeout(400); await ov('kasse');
    await p.click('#coForm [type=submit]'); await p.waitForTimeout(150);
    r.check(/Udfyld/.test(await p.textContent('#coNote')), `${label} kasse validerer tom formular`);
    for (const [id, v] of [['coEmail', 'test@eksempel.dk'], ['coFirst', 'A'], ['coLast', 'B'], ['coAddr', 'Vej 1'], ['coZip', '8000'], ['coCity', 'Aarhus']]) await p.fill('#' + id, v);
    await p.click('#coForm [type=submit]'); await p.waitForTimeout(150);
    r.check(/demo/.test(await p.textContent('#coNote')), `${label} kasse: demo-besked, ingen ordre`);
    r.check(await p.locator('input[autocomplete^="cc-"]').count() === 0, `${label} ingen kortfelter`);

    // Tøm kurv
    await p.goto(BASE + '#kurv'); await p.waitForTimeout(300);
    while (await p.locator('[data-rm]').count()) { await p.locator('[data-rm]').first().click(); await p.waitForTimeout(150); }
    r.check(await p.evaluate(() => JSON.parse(localStorage.getItem('duo-cart')).length) === 0, `${label} kurv kan tømmes`);
    await ctx.close();
  }
  r.done(); await b.close();
})();
