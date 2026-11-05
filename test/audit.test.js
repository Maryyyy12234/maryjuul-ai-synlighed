'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {analyse,normalizeUrl,isPublicIp,parseRobots,safeFetch,metaContent,structuredData}=require('../check.js');
const {createServer}=require('../server.js');

const STATUSES=['ok','warn','unknown','info'],GROUPS=['access','facts','services','answers','technical'],ACCESS=['ok','blocked','timeout','unreachable'];
const html=`<!doctype html><html lang="da"><head><title>Salon Test – dameklip i Aarhus C</title><meta content="Dameklip og farve i Aarhus C. Se priser og book tid." name="description"><meta content="width=device-width, initial-scale=1" name="viewport"><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"HairSalon","name":"Salon Test","telephone":"+4512345678","address":{"@type":"PostalAddress","streetAddress":"Testgade 1","postalCode":"8000","addressLocality":"Aarhus C"},"openingHours":"Mo-Fr 09:00-17:00","priceRange":"$$"}]}</script></head><body><h1>Dameklip i Aarhus C</h1><p>${'Vi klipper, farver og rådgiver om pleje af dit hår. '.repeat(20)}</p><p>Dameklip fra 495 kr. inkl. vask og føn.</p><p>Testgade 1, 8000 Aarhus C · Tlf. 12 34 56 78 · hej@salontest.dk</p><a href="https://salontest.planway.com">Book tid</a><h2>Hvad koster en dameklip?</h2><p>Fra 495 kr.</p></body></html>`;
const minimal=`<!doctype html><html><head><title>X</title></head><body><div id="root"></div><script>${'x'.repeat(30000)}</script></body></html>`;

function fixture(settings={}){return async(url)=>{const p=new URL(url).pathname;
 if(p==='/robots.txt'){if(settings.robotsError)throw Object.assign(Error('timeout'),{code:'TIMEOUT'});return{status:settings.robotsStatus??200,url,type:'text/plain',text:settings.robots??'User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml',headers:{}};}
 if(p==='/llms.txt')return{status:settings.llms?200:404,url,type:'text/plain',text:settings.llms?'# Test\nVirksomhedens fakta':'',headers:{}};
 if(p==='/sitemap.xml')return settings.noSitemap?{status:404,url,type:'text/html',text:'nope',headers:{}}:{status:200,url,type:'application/xml',text:'<?xml version="1.0"?><urlset><url><loc>https://example.com/</loc></url></urlset>',headers:{}};
 if(settings.throws)throw settings.throws;
 return{status:settings.status??200,url,type:settings.type??'text/html; charset=utf-8',text:settings.html??html,headers:settings.headers??{}};};}

// A local fixture site reached through the real safeFetch. The SSRF guard stays on in
// production; tests inject a lookup + address allow-list + port, which only code can do.
async function localSite(t,routes){
 const server=http.createServer((req,res)=>{const r=routes[new URL(req.url,'http://x').pathname]||routes['*'];if(!r){res.writeHead(404);return res.end();}if(r==='hang')return;res.writeHead(r.status||200,{'Content-Type':r.type||'text/html; charset=utf-8',...(r.headers||{})});res.end(r.body||'');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 return{fetchOptions:{lookup:async()=>[{address:'127.0.0.1',family:4}],allowAddress:()=>true,port:server.address().port}};
}
function assertShape(r){
 assert.deepEqual(Object.keys(r).sort(),['access','accessNote','checkedAt','checks','method','nextSteps','scope','sources','summary','version'].sort());
 assert.equal(r.version,'3');assert.ok(!('score' in r));assert.ok(!JSON.stringify(r).includes('"score"'));
 assert.ok(ACCESS.includes(r.access));assert.equal(new Date(r.checkedAt).toISOString(),r.checkedAt);
 assert.equal(r.access==='ok',r.accessNote===null);
 assert.deepEqual(Object.keys(r.scope).sort(),['durationMs','filesChecked','finalUrl','notChecked','pagesChecked','requestedUrl'].sort());
 assert.ok(Number.isInteger(r.scope.durationMs)&&r.scope.durationMs>=0);
 assert.ok(r.scope.notChecked.some(s=>/ChatGPT/.test(s)&&/Gemini/.test(s)));
 assert.deepEqual(Object.keys(r.summary).sort(),['found','general','improve','unknown']);
 assert.equal(r.summary.found+r.summary.improve+r.summary.unknown+r.summary.general,r.checks.length);
 for(const c of r.checks){
  assert.deepEqual(Object.keys(c).sort(),['evidence','explain','fix','group','id','priority','status','title'].sort());
  assert.ok(STATUSES.includes(c.status),c.id);assert.ok(GROUPS.includes(c.group),c.id);
  assert.ok(typeof c.explain==='string'&&c.explain.length>0,c.id);
  if(c.status==='warn')assert.ok([1,2,3].includes(c.priority),c.id);else assert.equal(c.priority,null,c.id);
  assert.ok(c.evidence===null||typeof c.evidence==='string');
 }
 assert.equal(new Set(r.checks.map(c=>c.id)).size,r.checks.length);
 assert.ok(r.nextSteps.length<=3);for(const s of r.nextSteps)assert.deepEqual(Object.keys(s).sort(),['title','why']);
 assert.ok(typeof r.method==='string'&&/ikke/.test(r.method));
 for(const s of r.sources)assert.match(s.url,/^https:\/\//);
}
const byId=(r,id)=>r.checks.find(c=>c.id===id);

test('rejects private, reserved and alternate IP spellings',()=>{for(const url of ['http://127.0.0.1','http://2130706433','http://0x7f000001','http://[::1]','http://[::ffff:7f00:1]','http://169.254.169.254','http://10.0.0.1','https://user:pass@example.com','https://example.com:8000','ftp://example.com','http://localhost','','x'.repeat(600)])assert.throws(()=>normalizeUrl(url),url);assert.equal(normalizeUrl('example.com').href,'https://example.com/');assert.equal(isPublicIp('2606:4700:4700::1111'),true);assert.equal(isPublicIp('2001:db8::1'),false);});
test('DNS lookup cannot smuggle a private target or mixed address set',async()=>{for(const addresses of [[{address:'127.0.0.1',family:4}],[{address:'1.1.1.1',family:4},{address:'10.0.0.1',family:4}]])await assert.rejects(()=>safeFetch('https://example.com',{lookup:async()=>addresses}),e=>e.code==='INVALID_URL');});
test('analyse rejects a host that resolves to a private address instead of reporting on it',async()=>{await assert.rejects(()=>analyse('example.com',{fetchOptions:{lookup:async()=>[{address:'10.0.0.5',family:4}]}}),e=>e.code==='INVALID_URL');});
test('robots follows longest path, explicit groups, merged groups and allow ties',()=>{assert.deepEqual(parseRobots('User-agent: *\nDisallow: /\nAllow: /public','/public/page'),[]);assert.deepEqual(parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: OAI-SearchBot\nAllow: /'),['Googlebot','PerplexityBot','Claude-SearchBot']);assert.equal(parseRobots('User-agent: OAI-SearchBot\nAllow: /\n\nUser-agent: OAI-SearchBot\nDisallow: /private','/private').includes('OAI-SearchBot'),true);assert.deepEqual(parseRobots('User-agent: *\nDisallow: /\nAllow: /'),[]);assert.deepEqual(parseRobots('User-agent: GPTBot\nDisallow: /'),[]);assert.equal(parseRobots('User-agent: *\nDisallow: /*?secret=$','/a?secret=').length,4);});
test('metadata attribute order and nested JSON-LD are read',()=>{assert.equal(metaContent(html,'description'),'Dameklip og farve i Aarhus C. Se priser og book tid.');assert.ok(structuredData(html).types.includes('HairSalon'));});

test('contract shape: a complete site is all found, with evidence, and no score',async()=>{
 const r=await analyse('example.com',{fetchPage:fixture()});assertShape(r);
 assert.equal(r.access,'ok');assert.equal(r.scope.requestedUrl,'https://example.com/');assert.equal(r.scope.finalUrl,'https://example.com/');
 assert.deepEqual(r.scope.pagesChecked,[{url:'https://example.com/',status:200}]);assert.deepEqual(r.scope.filesChecked,['robots.txt','sitemap.xml','llms.txt']);
 const notOk=r.checks.filter(c=>!['ok','info'].includes(c.status)).map(c=>c.id);assert.deepEqual(notOk,[]);
 assert.equal(r.nextSteps.length,0);
 assert.match(byId(r,'title').evidence,/Salon Test/);assert.match(byId(r,'prices').evidence,/495 kr/);assert.match(byId(r,'contact').evidence,/12 34 56 78/);assert.match(byId(r,'contact').evidence,/hej@salontest\.dk/);
 assert.match(byId(r,'address').evidence,/8000 Aarhus C/);assert.match(byId(r,'booking').evidence,/Book tid/);assert.match(byId(r,'schema').evidence,/HairSalon/);assert.match(byId(r,'schema').explain,/åbningstider/);
 assert.equal(byId(r,'lang').evidence,'lang="da"');assert.match(byId(r,'sitemap').evidence,/1 adresser/);
});
test('missing FAQ and llms.txt are info, never warn; present is also info',async()=>{
 const absent=await analyse('example.com',{fetchPage:fixture({html:html.replace(/<h2>.*?<\/h2>/,'')})}),present=await analyse('example.com',{fetchPage:fixture({llms:true})});
 for(const r of [absent,present])for(const id of ['faq','llms']){assert.equal(byId(r,id).status,'info',id);assert.equal(byId(r,id).priority,null);}
 assert.match(byId(absent,'faq').explain,/ikke en fejl/);assert.match(byId(absent,'llms').explain,/ikke en anerkendt standard/);assert.match(byId(absent,'llms').explain,/Google/);
 assert.match(byId(present,'faq').evidence,/Hvad koster/);
 assert.ok(!absent.nextSteps.some(s=>/FAQ|llms/i.test(s.title)));
});
test('missing robots.txt is ok; unreadable robots is unknown; blocking is warn with evidence',async()=>{
 assert.equal(byId(await analyse('example.com',{fetchPage:fixture({robotsStatus:404,robots:''})}),'robots').status,'ok');
 const unknown=await analyse('example.com',{fetchPage:fixture({robotsError:true})});assert.equal(byId(unknown,'robots').status,'unknown');assert.ok(!unknown.scope.filesChecked.includes('robots.txt'));assert.ok(unknown.scope.notChecked.some(s=>s.startsWith('robots.txt')));
 const blocked=await analyse('example.com',{fetchPage:fixture({robots:'User-agent: OAI-SearchBot\nDisallow: /'})});const c=byId(blocked,'robots');
 assert.equal(c.status,'warn');assert.equal(c.priority,2);assert.match(c.evidence,/OAI-SearchBot: User-agent: OAI-SearchBot \/ Disallow: \//);
 assert.equal(byId(await analyse('example.com',{fetchPage:fixture({robots:'User-agent: *\nDisallow: /'})}),'robots').priority,1);
});
test('noindex in meta or header is a priority 1 warn and leads next steps',async()=>{
 for(const o of [{html:html.replace('</head>','<meta name="robots" content="noindex"></head>')},{headers:{'x-robots-tag':'none'}}]){const r=await analyse('example.com',{fetchPage:fixture(o)});assert.equal(byId(r,'noindex').status,'warn');assert.equal(byId(r,'noindex').priority,1);assert.match(r.nextSteps[0].title,/noindex/);assertShape(r);}
});
test('a bare page gives several warns, at most 3 next steps sorted by priority, nothing invented',async()=>{
 const r=await analyse('http://example.com',{fetchPage:fixture({html:'<html><head><title>Hej</title></head><body><p>Velkommen.</p></body></html>',noSitemap:true})});assertShape(r);
 assert.equal(r.nextSteps.length,3);assert.equal(r.nextSteps[0].title,'Skift til sikker forbindelse (HTTPS)');
 for(const id of ['h1','contact','address','prices','booking','text','lang','description','schema','sitemap'])assert.equal(byId(r,id).status,'warn',id);
 for(const id of ['contact','address','prices'])assert.equal(byId(r,id).evidence,null,id);
});
test('a JavaScript-only page is described carefully, not as missing content',async()=>{
 const r=await analyse('example.com',{fetchPage:fixture({html:minimal})});const c=byId(r,'text');
 assert.equal(c.status,'warn');assert.match(c.explain,/JavaScript/);assert.match(c.explain,/bør undersøges/);
});
test('scripts, comments, head and templates do not create visible content findings',async()=>{
 const hidden='<head><title>Test</title></head><script>const e=\'<h1>Fake</h1><a href="tel:+4511223344">Kontakt</a> 495 kr.\';</script><!-- <h1>Comment</h1> 12 34 56 78 --><template><h1>Template</h1></template><main><p>Hej.</p></main>';
 const r=await analyse('example.com',{fetchPage:fixture({html:hidden})});
 for(const id of ['h1','contact','prices','booking'])assert.equal(byId(r,id).status,'warn',id);
});
test('a page that times out becomes access timeout with every check unknown, never warn',async t=>{
 const site=await localSite(t,{'*':'hang'});
 const r=await analyse('http://slow.example',{...site,pageTimeoutMs:300});assertShape(r);
 assert.equal(r.access,'timeout');assert.match(r.accessNote,/svarede ikke/);
 assert.ok(r.checks.every(c=>c.status==='unknown'));assert.equal(r.summary.unknown,r.checks.length);assert.equal(r.nextSteps.length,0);
 assert.deepEqual(r.scope.pagesChecked,[]);assert.equal(r.scope.finalUrl,null);
});
test('HTTP 403 and a Cloudflare challenge are reported as blocked access, not as bad findings',async t=>{
 const site=await localSite(t,{'/':{status:403,body:'<html><title>Forbidden</title></html>'},'/cf':{status:200,body:'<html><head><title>Just a moment...</title></head><body><script src="/cdn-cgi/challenge-platform/h/b/orchestrate/jsch/v1"></script></body></html>'},'/cfh':{status:403,headers:{'cf-mitigated':'challenge'},body:'x'}});
 for(const p of ['/','/cf','/cfh']){
  const r=await analyse('http://blocked.example'+p,site);assertShape(r);
  assert.equal(r.access,'blocked',p);assert.ok(r.checks.every(c=>c.status==='unknown'),p);assert.ok(r.summary.improve===0);
  assert.match(r.accessNote,/ikke kunnet undersøge/);assert.ok(r.scope.notChecked.some(s=>/ikke fik adgang/.test(s)));
 }
 const cf=await analyse('http://blocked.example/cf',site);assert.match(byId(cf,'reachable').evidence,/Cloudflare/);
 const r429=await analyse('example.com',{fetchPage:fixture({status:429})});assert.equal(r429.access,'blocked');
});
test('unreachable hosts, 404 pages and non-HTML are unreachable with an explanation',async()=>{
 const dnsFail=await analyse('example.com',{fetchPage:fixture({throws:Object.assign(Error('getaddrinfo ENOTFOUND'),{code:'ENOTFOUND'})})});assert.equal(dnsFail.access,'unreachable');assert.match(dnsFail.accessNote,/domænet/);
 assert.equal((await analyse('example.com',{fetchPage:fixture({status:404})})).access,'unreachable');
 const pdf=await analyse('example.com',{fetchPage:fixture({type:'application/pdf'})});assert.equal(pdf.access,'unreachable');assertShape(pdf);
});
test('real safeFetch path against a local fixture site produces a full v3 report',async t=>{
 const site=await localSite(t,{'/':{body:html},'/robots.txt':{type:'text/plain',body:'User-agent: *\nAllow: /'},'/sitemap.xml':{type:'application/xml',body:'<urlset><url><loc>http://shop.example/</loc></url></urlset>'}});
 const r=await analyse('http://shop.example',site);assertShape(r);
 assert.equal(r.access,'ok');assert.equal(byId(r,'https').status,'warn');assert.equal(byId(r,'llms').status,'info');assert.equal(byId(r,'llms').evidence,'llms.txt: HTTP 404');
});

test('server: CORS, routes, invalid input, size and methods',async t=>{
 const prev=process.env.CORS_ORIGINS;process.env.CORS_ORIGINS='https://www.example.dk, https://other.example.dk';t.after(()=>{if(prev===undefined)delete process.env.CORS_ORIGINS;else process.env.CORS_ORIGINS=prev;});
 const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const base='http://127.0.0.1:'+server.address().port;
 const pre=origin=>fetch(base+'/api/check',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'Content-Type'}});
 for(const origin of ['https://uc6nzz-fg.myshopify.com','https://abc123-xyz.shopifypreview.com','https://mary-juul-webdesign.mary2006.chatgpt.site','https://www.example.dk','https://other.example.dk']){const r=await pre(origin);assert.equal(r.status,204,origin);assert.equal(r.headers.get('access-control-allow-origin'),origin);assert.match(r.headers.get('access-control-allow-headers'),/Content-Type/);}
 for(const origin of ['https://evil.example','https://evil.shopifypreview.com.attacker.dk','http://abc.shopifypreview.com','https://a.b.shopifypreview.com','https://uc6nzz-fg.myshopify.com.evil.dk']){const r=await pre(origin);assert.equal(r.status,403,origin);assert.equal(r.headers.get('access-control-allow-origin'),null);}
 assert.equal((await fetch(base+'/api/check',{method:'POST',headers:{Origin:'https://evil.example'},body:'{}'})).status,403);
 const bad=await fetch(base+'/api/check',{method:'POST',body:'{'});assert.equal(bad.status,400);assert.ok((await bad.json()).error);
 for(const url of ['ikke en adresse','http://127.0.0.1','http://10.0.0.1','http://169.254.169.254/latest/meta-data','']){const r=await fetch(base+'/api/check',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://uc6nzz-fg.myshopify.com'},body:JSON.stringify({url})});assert.equal(r.status,400,url);assert.equal(r.headers.get('access-control-allow-origin'),'https://uc6nzz-fg.myshopify.com');assert.match((await r.json()).error,/adresse|hjemmeside/i);}
 assert.equal((await fetch(base+'/api/check',{method:'POST',body:'x'.repeat(3000)})).status,413);
 assert.equal((await fetch(base+'/api/check',{method:'DELETE'})).status,405);
 assert.equal((await fetch(base+'/api/check-typo')).status,404);
 assert.equal((await (await fetch(base+'/healthz')).json()).version,'3.0');
 const llms=await (await fetch(base+'/llms.txt')).text();assert.doesNotMatch(llms,/28 ?34|\+45|Marie|Mary\b/);for(const s of ['Mini-tjek: 0 kr.','AI-klar: 1.495 kr.','Ny hjemmeside: fra 4.500 kr.','Løbende hjælp: 399 kr./md.'])assert.ok(llms.includes(s),s);
 for(const p of ['/','/styles.css','/app.js','/assets/interior.jpg']){const r=await fetch(base+p);assert.equal(r.status,200,p);if(p==='/'||p==='/app.js')assert.doesNotMatch(await r.text(),/28 ?34 ?64 ?04|28346404|Marie|Hej Mary|Mary Juul,/,p);}
});
test('server: rate limit and queue answer 429 and 503 with Retry-After',async t=>{
 const server=createServer({maxPerIp:1});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const base='http://127.0.0.1:'+server.address().port;
 await fetch(base+'/api/check',{method:'POST',body:JSON.stringify({url:'http://10.0.0.1'})});
 const r=await fetch(base+'/api/check',{method:'POST',body:JSON.stringify({url:'http://10.0.0.1'})});assert.equal(r.status,429);assert.equal(r.headers.get('retry-after'),'600');
});
test('server: end-to-end POST returns a v3 report from a local fixture site',async t=>{
 const site=await localSite(t,{'/':{body:html}});
 const server=createServer({analyse:site});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/check',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://abc.shopifypreview.com'},body:JSON.stringify({url:'http://shop.example'})});
 assert.equal(r.status,200);assert.equal(r.headers.get('access-control-allow-origin'),'https://abc.shopifypreview.com');
 const data=await r.json();assertShape(data);
});
