'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),handler=require('./check.js');
const VERSION='3.0';
const assets={'/assets/interior.jpg':['assets/interior.jpg','image/jpeg'],'/':['index.html','text/html; charset=utf-8'],'/index.html':['index.html','text/html; charset=utf-8'],'/styles.css':['styles.css','text/css; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/favicon.svg':['favicon.svg','image/svg+xml']};
const DEFAULT_ORIGINS=['https://uc6nzz-fg.myshopify.com','https://mary-juul-webdesign.mary2006.chatgpt.site'];
const PREVIEW_ORIGIN=/^https:\/\/[a-z0-9-]+\.shopifypreview\.com$/;
const LLMS_TXT=`# MARY JUUL

> Studie i Aarhus, der hjælper mindre virksomheder med at gøre deres hjemmeside tydelig for kunder, søgemaskiner og AI-tjenester (AI-synlighed/GEO).

## Ydelser og prisudkast
- Mini-tjek: 0 kr. Et første overblik over hjemmesiden og forslag til næste skridt. Tjekket er teknisk og måler ikke faktisk omtale i AI-tjenester.
- AI-klar: 1.495 kr. En afgrænset gennemgang af hjemmesiden og de forbedringer, der aftales.
- Ny hjemmeside: fra 4.500 kr. Design og opbygning med et aftalt omfang.
- Løbende hjælp: 399 kr./md. Vedligehold og mindre opdateringer efter aftale.

Omfang, leverancer og pris aftales skriftligt, før arbejdet starter.

## Gratis tjek
- POST /api/check med {"url":"dinvirksomhed.dk"} returnerer et teknisk hjemmesidetjek uden score.
`;

function originAllowed(origin,host){
 if(!origin)return false;
 const extra=(process.env.CORS_ORIGINS||'').split(',').map(s=>s.trim().replace(/\/$/,'')).filter(Boolean);
 return DEFAULT_ORIGINS.includes(origin)||extra.includes(origin)||PREVIEW_ORIGIN.test(origin)||origin===`https://${host}`||origin===`http://${host}`;
}
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}

// options.analyse is passed through to analyse() and exists only for local test
// fixtures (see test/audit.test.js). Production (`node server.js`) never sets it.
function createServer(options={}){
 const hits=new Map();let active=0;
 const maxActive=options.maxActive||6,maxPerIp=options.maxPerIp||20;
 const server=http.createServer((req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  let pathname;try{pathname=new URL(req.url,'http://localhost').pathname;}catch{return json(res,400,{error:'Ugyldig adresse.'});}
  const origin=req.headers.origin,allowed=originAllowed(origin,req.headers.host);
  if(allowed){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Methods','POST, GET, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Max-Age','600');}
  if(pathname==='/api/check'){
   if(origin&&!allowed)return json(res,403,{error:'Denne side må ikke starte et tjek.'});
   if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
   if(!['GET','POST'].includes(req.method))return handler(req,res);
   const now=Date.now(),ip=(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',').at(-1).trim(),recent=(hits.get(ip)||[]).filter(t=>now-t<600000);
   if(recent.length>=maxPerIp){res.setHeader('Retry-After','600');return json(res,429,{error:'Du har lavet mange tjek. Prøv igen om 10 minutter.'});}
   if(active>=maxActive){res.setHeader('Retry-After','15');return json(res,503,{error:'Der er kø til tjekket. Prøv igen om et øjeblik.'});}
   recent.push(now);hits.set(ip,recent);active++;let size=0,body='',tooLarge=false,released=false;
   const release=()=>{if(!released){active--;released=true;}};
   req.on('data',c=>{size+=c.length;if(size>2048){tooLarge=true;return;}body+=c.toString();});
   req.on('end',async()=>{try{if(tooLarge)return json(res,413,{error:'Adressen er for lang.'});req.body=body;await handler(req,res,options.analyse);}finally{release();}});req.on('aborted',release);req.on('error',release);return;
  }
  if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');return json(res,405,{error:'Metoden er ikke tilladt.'});}
  if(pathname==='/healthz')return json(res,200,{status:'ok',version:VERSION,api:'3',commit:process.env.RENDER_GIT_COMMIT||null});
  if(pathname==='/robots.txt'){res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});return res.end('User-agent: *\nAllow: /\nDisallow: /api/\n');}
  if(pathname==='/llms.txt'){res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});return res.end(LLMS_TXT);}
  const asset=assets[pathname];if(!asset)return json(res,404,{error:'Siden findes ikke.'});
  try{const data=fs.readFileSync(path.join(__dirname,asset[0]));res.writeHead(200,{'Content-Type':asset[1],'Cache-Control':pathname==='/'?'no-cache':'public, max-age=300'});res.end(req.method==='HEAD'?undefined:data);}catch{json(res,500,{error:'Siden kunne ikke indlæses.'});}
 });
 const cleanup=setInterval(()=>{const cutoff=Date.now()-600000;for(const[ip,t]of hits)if(t.at(-1)<cutoff)hits.delete(ip);},60000);cleanup.unref();
 server.on('close',()=>clearInterval(cleanup));
 return server;
}
if(require.main===module){const server=createServer();server.requestTimeout=10000;server.headersTimeout=10000;server.listen(Number(process.env.PORT||process.argv[process.argv.indexOf('--port')+1])||10000,'0.0.0.0',()=>console.log('MARY JUUL '+VERSION+' ready'));process.on('SIGTERM',()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),25000).unref();});}
module.exports={createServer,originAllowed,VERSION};
