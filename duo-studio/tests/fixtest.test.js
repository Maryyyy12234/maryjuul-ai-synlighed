/* Regressionstjek af tidligere rettede fejl.
   Udfaset med vilje (redesign nov. 2026): "Skriv mig op"-scroll til nyhedsbrev, mobil købsbar og forsidekarrusel.
   Bevaret: AI-mærker i kurv/kasse og at kassen beholder indtastning, når kurven ændres (kurvkoden er bevaret til lancering). */
const { chromium } = require('playwright');
const { BASE, seedCart, reporter, watch } = require('./helpers');
(async () => {
  const b = await chromium.launch(); const r = reporter('fixtest');
  for (const [label, w, h] of [['desktop', 1440, 900], ['mobil', 390, 844]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } }); const p = await ctx.newPage(); watch(p, r, label);

    // Udfasede funktioner må ikke komme tilbage
    await p.goto(BASE + '#forside'); await p.waitForTimeout(400);
    r.check(await p.locator('#nyhedsbrev, [data-notify], input[type="email"]').count() === 0, `${label} ingen nyhedsbrev-formular uden backend`);
    r.check(await p.locator('#dealTrack, [data-car], [data-live]').count() === 0, `${label} ingen automatisk karrusel på forsiden`);
    await p.goto(BASE + '#produkt-freja'); await p.waitForTimeout(300);
    r.check(await p.locator('#fxMbar').count() === 0, `${label} ingen mobil købsbar på produktsiden`);

    // AI-mærke i kurv og kasse (kurven lægges ind direkte)
    await seedCart(p, [{ id: 'everywhere-tee', size: 'M', color: 'Butter Yellow', qty: 1 }, { id: 'alma', size: null, color: 'Black', qty: 1 }]);
    await p.goto(BASE + '#kurv'); await p.waitForTimeout(400);
    r.check(await p.locator('.fx-tr .fx-ai').count() >= 1, `${label} AI-mærke på konceptbillede i kurven`);
    await p.goto(BASE + '#kassen'); await p.waitForTimeout(400);
    r.check(await p.locator('.fx-co-sum .fx-ai').count() >= 1, `${label} AI-mærke i kassens ordreoversigt`);

    // Kassen beholder indtastning ved kurvændring (minikurven åbnes via den bevarede data-open-mekanisme)
    await p.fill('#coEmail', 'a@b.dk'); await p.fill('#coCity', 'Aarhus');
    await p.evaluate(() => { const t = document.createElement('button'); t.dataset.open = 'cart'; t.id = 'testCartOpen'; document.body.append(t); t.click(); });
    await p.waitForTimeout(400);
    await p.click('#cart [data-q="0"][data-d="1"]'); await p.waitForTimeout(300);
    await p.click('#cart [data-rm="1"]'); await p.waitForTimeout(300);
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    const v = [await p.inputValue('#coEmail'), await p.inputValue('#coCity')];
    r.check(v[0] === 'a@b.dk' && v[1] === 'Aarhus', `${label} kassen beholder indtastning ved kurvændring (${v})`);
    r.check(await p.locator('.fx-co-li').count() === 1, `${label} ordreoversigt opdateret`);
    await ctx.close();
  }
  r.done(); await b.close();
})();
