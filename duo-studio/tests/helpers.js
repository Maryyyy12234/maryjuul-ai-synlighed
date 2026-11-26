/* Fælles hjælpere til DUO STUDIO-testene. */
const path = require('node:path');
const fs = require('node:fs');
const BASE = process.env.BASE || 'http://localhost:8765/';
const OUT = process.env.TEST_OUT || path.join(__dirname, '.out');
fs.mkdirSync(OUT, { recursive: true });

/* Kurven er skjult, indtil køb åbner (OPEN_FOR_SALE). Koden er bevaret, så den testes via localStorage. */
async function seedCart(page, lines) {
  await page.goto(BASE + '#forside');
  await page.evaluate(l => localStorage.setItem('duo-cart', JSON.stringify(l)), lines);
  await page.reload(); /* kurven læses ved sideindlæsning */
}

function reporter(name) {
  const ok = [], bad = [];
  return {
    check: (cond, msg) => (cond ? ok : bad).push(msg),
    fail: msg => bad.push(msg),
    done() {
      console.log(`[${name}] OK: ${ok.length}`);
      if (bad.length) { console.log(`[${name}] FEJL:\n - ` + bad.join('\n - ')); process.exitCode = 1; }
      else console.log(`[${name}] INGEN PROBLEMER`);
    }
  };
}

function watch(page, r, label) {
  page.on('pageerror', e => r.fail(`${label} JS-fejl: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') r.fail(`${label} konsolfejl: ${m.text()}`); });
  page.on('response', res => { if (res.status() >= 400) r.fail(`${label} HTTP ${res.status()} ${res.url()}`); });
}

module.exports = { BASE, OUT, seedCart, reporter, watch };
