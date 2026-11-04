// Local responsive preview; production continues to use server.js.
const { createServer } = require('./server.js');
const server = createServer();
const [serveApp] = server.listeners('request');
server.removeAllListeners('request');
server.on('request', (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname !== '/__preview') return serveApp(req, res);
  const width = [320, 390, 768, 1280].includes(Number(url.searchParams.get('width'))) ? Number(url.searchParams.get('width')) : 390;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(`<!doctype html><html lang="da"><meta charset="utf-8"><title>Responsive preview</title><style>body{margin:0;background:#e8e7e5;font:13px system-ui;color:#444}header{padding:15px 25px;background:white;display:flex;align-items:center;gap:25px}a{color:inherit}iframe{display:block;width:${width}px;height:810px;margin:22px auto;border:1px solid #c5c2bc;background:#f6f3ec;box-shadow:0 8px 35px #0001}a[aria-current]{font-weight:bold;color:#632a39}</style><header><strong>Visningsbredde</strong>${[320,390,768,1280].map(w=>`<a href="?width=${w}" ${w===width?'aria-current="page"':''}>${w} px</a>`).join('')}<a href="/">Desktop</a></header><iframe src="/" title="Hjemmeside ved ${width} pixels bredde"></iframe></html>`);
});
const at = process.argv.indexOf('--port');
const port = Number(process.env.PORT || (at >= 0 ? process.argv[at + 1] : 10000));
server.listen(port, '0.0.0.0', () => console.log('MARY JUUL development preview ready'));
