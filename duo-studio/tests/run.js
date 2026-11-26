/* Kører alle testsuiter mod dist/ med en lokal server. Brug: npm test (bygger først). */
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const { spawn, execSync } = require('node:child_process');
const DIST = path.join(__dirname, '..', 'dist'), PORT = 8765;
const TYPES = { '.html': 'text/html; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.js': 'text/javascript', '.css': 'text/css' };
const SUITES = ['redesign.test.js', 'hero.test.js', 'flow.test.js', 'fixtest.test.js', 'test10.test.js'];
const TIMEOUT = 8 * 60 * 1000;
let globalRoot = ''; try { globalRoot = execSync('npm root -g').toString().trim(); } catch {}

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]); const f = path.join(DIST, u === '/' ? 'index.html' : u);
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
const runSuite = file => new Promise(resolve => {
  const t0 = Date.now();
  const child = spawn(process.execPath, [path.join(__dirname, file)], { stdio: 'inherit', env: { ...process.env, BASE: `http://localhost:${PORT}/`, NODE_PATH: [process.env.NODE_PATH, globalRoot].filter(Boolean).join(path.delimiter) } });
  const timer = setTimeout(() => { console.log(`[${file}] TIMEOUT efter ${TIMEOUT / 1000}s`); child.kill('SIGKILL'); }, TIMEOUT);
  child.on('exit', code => { clearTimeout(timer); resolve({ file, code, s: Math.round((Date.now() - t0) / 1000) }); });
});
server.listen(PORT, async () => {
  const only = process.argv.slice(2); const results = [];
  for (const s of SUITES.filter(s => !only.length || only.some(o => s.includes(o)))) results.push(await runSuite(s));
  server.close();
  console.log('\n=== Resultat ===');
  results.forEach(r => console.log(`${r.code === 0 ? 'BESTÅET' : 'FEJLET '}  ${r.file}  (${r.s}s)`));
  process.exit(results.every(r => r.code === 0) ? 0 : 1);
});
