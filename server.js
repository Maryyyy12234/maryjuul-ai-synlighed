const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),handler=require('./check.js');
const assets={'/assets/interior.jpg':['assets/interior.jpg','image/jpeg'],'/':['index.html','text/html; charset=utf-8'],'/index.html':['index.html','text/html; charset=utf-8'],'/styles.css':['styles.css','text/css; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/favicon.svg':['favicon.svg','image/svg+xml']};
const allowedOrigins=new Set(['https://mary-juul-webdesign.mary2006.chatgpt.site',...(process.env.CORS_ORIGINS||'').split(',').filter(Boolean)]),hits=new Map();let active=0;
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
function createServer(){return http.createServer((req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
 let pathname;try{pathname=new URL(req.url,'http://localhost').pathname;}catch{return json(res,400,{error:'Ugyldig adresse.'});}
 const origin=req.headers.origin;
 if(origin&&allowedOrigins.has(origin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Methods','POST, GET, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');}
 if(pathname==='/api/check'){
  if(origin&&!allowedOrigins.has(origin)&&origin!==`https://${req.headers.host}`&&origin!==`http://${req.headers.host}`)return json(res,403,{error:'Denne side må ikke starte et tjek.'});
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}if(!['GET','POST'].includes(req.method))return handler(req,res);
  const now=Date.now(),ip=(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',').at(-1).trim(),recent=(hits.get(ip)||[]).filter(t=>now-t<600000);
  if(recent.length>=20){res.setHeader('Retry-After','600');return json(res,429,{error:'Du har lavet mange tjek. Prøv igen om 10 minutter.'});}
  if(active>=6){res.setHeader('Retry-After','15');return json(res,503,{error:'Der er kø til tjekket. Prøv igen om et øjeblik.'});}
  recent.push(now);hits.set(ip,recent);active++;let size=0,body='',tooLarge=false,released=false;
  const release=()=>{if(!released){active--;released=true;}};
  req.on('data',c=>{size+=c.length;if(size>2048){tooLarge=true;return;}body+=c.toString();});
  req.on('end',async()=>{try{if(tooLarge)return json(res,413,{error:'Adressen er for lang.'});req.body=body;await handler(req,res);}finally{release();}});req.on('aborted',release);req.on('error',release);return;
 }
 if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');return json(res,405,{error:'Metoden er ikke tilladt.'});}
 if(pathname==='/healthz')return json(res,200,{status:'ok',version:'2.0',commit:process.env.RENDER_GIT_COMMIT||null});
 if(pathname==='/robots.txt'){res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});return res.end('User-agent: *\nAllow: /\nDisallow: /api/\n');}
 if(pathname==='/llms.txt'){res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});return res.end('# MARY JUUL\n\nWebdesign og digital synlighed for lokale virksomheder i Aarhus. Telefon: +45 28 34 64 04.\n\n## Ydelser\n- Teknisk hjemmesidetjek: gratis. Scoren måler teknisk grundlag, ikke AI-omtale.\n- AI-klar hjemmeside: 1.495 kr. Aftalte rettelser af tekst og teknik.\n- Ny hjemmeside: fra 4.500 kr.\n- Løbende hjælp: 399 kr./md. Omfang aftales skriftligt.\n');}
 const asset=assets[pathname];if(!asset)return json(res,404,{error:'Siden findes ikke.'});
 try{const data=fs.readFileSync(path.join(__dirname,asset[0]));res.writeHead(200,{'Content-Type':asset[1],'Cache-Control':pathname==='/'?'no-cache':'public, max-age=300'});res.end(req.method==='HEAD'?undefined:data);}catch{json(res,500,{error:'Siden kunne ikke indlæses.'});}
});}
const cleanup=setInterval(()=>{const cutoff=Date.now()-600000;for(const[ip,t]of hits)if(t.at(-1)<cutoff)hits.delete(ip);},60000);cleanup.unref();
if(require.main===module){const server=createServer();server.requestTimeout=10000;server.headersTimeout=10000;server.listen(Number(process.env.PORT||process.argv[process.argv.indexOf('--port')+1])||10000,'0.0.0.0',()=>console.log('MARY JUUL 2.0 ready'));process.on('SIGTERM',()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),25000).unref();});}
module.exports={createServer};
