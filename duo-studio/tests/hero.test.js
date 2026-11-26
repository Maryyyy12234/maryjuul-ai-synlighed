/* Signaturinteraktionen "DUO — to sider af dig": Dag/Aften-hero.
   Tester begge stemninger, CTA-destinationer, pointer, touch, tastatur, reduced motion og layout ved 320/390/768/1440 px. */
const { chromium } = require('playwright');
const { BASE, OUT, reporter, watch } = require('./helpers');
const split = p => p.$eval('#dh', e => parseFloat(getComputedStyle(e).getPropertyValue('--split')));
(async () => {
  const b = await chromium.launch(); const r = reporter('hero');

  // Layout og synlighed ved alle bredder
  for (const [w, h] of [[320, 640], [390, 844], [768, 1024], [1440, 900]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } }); watch(p, r, `${w}px`);
    await p.goto(BASE + '#forside'); await p.waitForTimeout(600);
    r.check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${w}px: intet vandret overløb`);
    const imgs = await p.$$eval('.dh-fig img', a => a.filter(i => i.offsetParent).map(i => [getComputedStyle(i).objectFit, Math.abs(i.getBoundingClientRect().width / i.getBoundingClientRect().height - 2 / 3) < 0.01, i.complete && i.naturalWidth > 0]));
    r.check(imgs.length >= 1 && imgs.every(([f, prop, ok]) => f === 'contain' && prop && ok), `${w}px: looks vises helt, i 2:3 og indlæst (${JSON.stringify(imgs)})`);
    const fold = await p.evaluate(() => ['#hH1 > span', '.dh-coll', '.dh .btn-p'].map(q => [...document.querySelectorAll(q)].filter(e => e.offsetParent).every(e => e.getBoundingClientRect().bottom <= innerHeight)));
    r.check(fold.every(Boolean), `${w}px: overskrift, kollektionsnavn og CTA synlige uden scroll (${fold})`);
    if (w < 900) {
      r.check(await p.$$eval('.dh-p', a => a.filter(e => e.offsetParent).length) === 1, `${w}px: ét look ad gangen`);
      const box = await p.locator('[data-mood-btn="night"]').boundingBox(); r.check(box.width >= 44 && box.height >= 44, `${w}px: Dag/Aften-knapper ≥ 44 px`);
      // Skift til Aften: billede, baggrund, navn og CTA skifter samlet
      const bg0 = await p.$eval('#dh', e => getComputedStyle(e).backgroundColor);
      await p.click('[data-mood-btn="night"]'); await p.waitForTimeout(500);
      const st = await p.evaluate(() => { const v = [...document.querySelectorAll('.dh-p')].find(e => e.offsetParent); return { coll: v.querySelector('.dh-coll').textContent, href: v.querySelector('.btn-p').getAttribute('href'), img: v.querySelector('img').getAttribute('src'), bg: getComputedStyle(document.querySelector('#dh')).backgroundColor, pressed: document.querySelector('[data-mood-btn="night"]').getAttribute('aria-pressed') }; });
      r.check(st.coll === 'Noir' && st.href === '#noir-edit' && /noir/.test(st.img) && st.bg !== bg0 && st.pressed === 'true', `${w}px: Aften skifter alt samlet (${JSON.stringify(st)})`);
      await p.screenshot({ path: `${OUT}/hero-${w}-aften.png` });
      // lodret scroll er normal
      await p.mouse.wheel(0, 600); await p.waitForTimeout(300);
      r.check(await p.evaluate(() => scrollY > 200), `${w}px: almindelig lodret scroll`);
    } else {
      r.check(await p.$$eval('.dh-p', a => a.filter(e => e.offsetParent).length) === 2, `${w}px: begge looks vises fra start`);
      r.check((await split(p)) === 50, `${w}px: start 50/50`);
    }
    await p.close();
  }

  // CTA-destinationer
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); watch(p, r, 'desktop');
  await p.goto(BASE + '#forside'); await p.waitForTimeout(500);
  await p.click('.dh-day .btn-p'); await p.waitForTimeout(400);
  r.check((await p.evaluate(() => location.hash)) === '#in-out', 'Dag-CTA → Penny (#in-out)');
  await p.goto(BASE + '#forside'); await p.waitForTimeout(400);
  await p.click('.dh-night .btn-p'); await p.waitForTimeout(400);
  r.check((await p.evaluate(() => location.hash)) === '#noir-edit', 'Aften-CTA → Noir (#noir-edit)');

  // Pointer (mus)
  await p.goto(BASE + '#forside'); await p.waitForTimeout(500);
  const hb = await p.locator('.dh-handle').boundingBox(); const db = await p.locator('#dh').boundingBox();
  await p.mouse.move(hb.x + hb.width / 2, hb.y + hb.height * 0.58); await p.mouse.down();
  await p.mouse.move(db.x + db.width * 0.62, hb.y + hb.height * 0.58, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(200);
  const s1 = await split(p); r.check(s1 >= 60 && s1 <= 64, `pointer: træk mod højre → Dag ${s1} %`);
  await p.mouse.move(db.x + db.width * 0.62, hb.y + hb.height * 0.58); await p.mouse.down();
  await p.mouse.move(db.x + db.width * 0.05, hb.y + hb.height * 0.58, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(200);
  r.check((await split(p)) === 35, `pointer: begrænses til 35 %`);
  r.check(await p.$$eval('.dh-fig img', a => a.every(i => { const b = i.getBoundingClientRect(); return b.width > 100 && Math.abs(b.width / b.height - 2 / 3) < 0.01; })), 'pointer: begge looks er hele ved yderposition');
  await p.screenshot({ path: `${OUT}/hero-1440-aften-stor.png` });

  // Tastatur
  await p.locator('.dh-handle').focus();
  await p.keyboard.press('End'); r.check((await split(p)) === 65 && (await p.getAttribute('.dh-handle', 'aria-valuenow')) === '65', 'tastatur: End → 65 %');
  await p.keyboard.press('ArrowLeft'); r.check((await split(p)) === 60, 'tastatur: ← flytter 5 %');
  await p.keyboard.press('Home'); r.check((await split(p)) === 35, 'tastatur: Home → 35 %');
  r.check(/Dag 35 %, Aften 65 %/.test(await p.getAttribute('.dh-handle', 'aria-valuetext')), 'tastatur: aria-valuetext opdateres');
  r.check((await p.getAttribute('.dh-handle', 'role')) === 'slider' && !!(await p.getAttribute('.dh-handle', 'aria-label')), 'skillelinje har rolle og tilgængeligt navn');
  await p.close();

  // Touch (rigtige touch-events via CDP)
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, hasTouch: true }); const t = await ctx.newPage(); watch(t, r, 'touch');
  await t.goto(BASE + '#forside'); await t.waitForTimeout(500);
  const th = await t.locator('.dh-handle').boundingBox(); const td = await t.locator('#dh').boundingBox();
  const cdp = await ctx.newCDPSession(t); const y = th.y + th.height * 0.58;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: th.x + th.width / 2, y }] });
  for (let k = 1; k <= 6; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: th.x + th.width / 2 - k * (td.width * 0.1 / 6), y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await t.waitForTimeout(200);
  const ts = await split(t); r.check(ts >= 38 && ts <= 42, `touch: træk mod venstre → Dag ${ts} %`);
  await ctx.close();

  // Reduced motion: ingen transitions, men alt virker og er synligt
  const rm = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }); const q = await rm.newPage(); watch(q, r, 'reduced');
  await q.goto(BASE + '#forside'); await q.waitForTimeout(300);
  r.check(await q.$eval('.dh-panels', e => getComputedStyle(e).transitionDuration.split(',').every(d => parseFloat(d) < 0.02)), 'reduced motion: ingen bevægelse på skillelinjen');
  await q.locator('.dh-handle').focus(); await q.keyboard.press('End');
  r.check((await split(q)) === 65, 'reduced motion: interaktionen virker stadig');
  r.check(await q.$$eval('.dh .btn-p', a => a.every(e => getComputedStyle(e).opacity === '1')), 'reduced motion: CTA synlige');
  await rm.close();
  r.done(); await b.close();
})();
