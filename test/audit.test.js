const {test}=require('node:test'),assert=require('node:assert/strict');
const {analyse,normalizeUrl,isPublicIp,parseRobots,safeFetch,metaContent,structuredData}=require('../check.js');
const {createServer}=require('../server.js');
const html=`<!doctype html><title>En lokal virksomhed</title><meta content="Vi hjælper kunder i Aarhus" name="description"><meta content="width=device-width, initial-scale=1" name="viewport"><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"ProfessionalService","name":"Test","telephone":"+4528346404"}]}</script><h1>Velkommen til virksomheden</h1><p>${'Nyttigt indhold om vores ydelser og priser. '.repeat(30)}</p><p>1.495 kr.</p><a href="tel:+4528346404">Kontakt</a><h2>Hvad koster det?</h2>`;
function fixture(settings={}){return async(url)=>{const path=new URL(url).pathname;if(path==='/robots.txt'){if(settings.robotsError)throw Error('timeout');return {status:settings.robotsStatus??200,type:'text/plain',text:settings.robots??'User-agent: *\nAllow: /'};}if(path==='/llms.txt')return{status:settings.llms?200:404,type:'text/plain',text:settings.llms?'# Test\nVirksomhedens fakta':''};return{status:settings.status??200,url,type:'text/html',text:settings.html??html,headers:settings.headers??{}};};}
test('rejects private, reserved and alternate IP spellings',()=>{for(const url of ['http://127.0.0.1','http://2130706433','http://0x7f000001','http://[::1]','http://[::ffff:7f00:1]','http://169.254.169.254','http://10.0.0.1','https://user:pass@example.com','https://example.com:8000','ftp://example.com','http://localhost'])assert.throws(()=>normalizeUrl(url),url);assert.equal(normalizeUrl('example.com').href,'https://example.com/');assert.equal(isPublicIp('2606:4700:4700::1111'),true);assert.equal(isPublicIp('2001:db8::1'),false);});
test('DNS lookup cannot smuggle a private target or mixed address set',async()=>{for(const addresses of [[{address:'127.0.0.1',family:4}],[{address:'1.1.1.1',family:4},{address:'10.0.0.1',family:4}]])await assert.rejects(()=>safeFetch('https://example.com',{lookup:async()=>addresses}),/offentlig/);});
test('robots follows longest path, explicit groups, merged groups and allow ties',()=>{assert.deepEqual(parseRobots('User-agent: *\nDisallow: /\nAllow: /public','/public/page'),[]);assert.deepEqual(parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: OAI-SearchBot\nAllow: /'),['Googlebot','PerplexityBot','Claude-SearchBot']);assert.equal(parseRobots('User-agent: OAI-SearchBot\nAllow: /\n\nUser-agent: OAI-SearchBot\nDisallow: /private','/private').includes('OAI-SearchBot'),true);assert.deepEqual(parseRobots('User-agent: *\nDisallow: /\nAllow: /'),[]);assert.deepEqual(parseRobots('User-agent: GPTBot\nDisallow: /'),[]);assert.equal(parseRobots('User-agent: *\nDisallow: /*?secret=$','/a?secret=').length,4);});
test('metadata attribute order and nested JSON-LD are read',()=>{assert.equal(metaContent(html,'description'),'Vi hjælper kunder i Aarhus');assert.equal(structuredData(html).types.includes('ProfessionalService'),true);});
test('a complete fixture gives full technical score and optional llms does not alter it',async()=>{const absent=await analyse('example.com',{fetchPage:fixture()}),present=await analyse('example.com',{fetchPage:fixture({llms:true})});assert.equal(absent.score,100);assert.equal(present.score,absent.score);assert.equal(absent.checks.find(c=>c.id==='llms').max,0);assert.equal(absent.coverage.pages,1);});
test('unknown robots is disclosed and excluded rather than passed',async()=>{const r=await analyse('example.com',{fetchPage:fixture({robotsError:true})});assert.equal(r.checks.find(c=>c.id==='robots').status,'unknown');assert.equal(r.coverage.unknownChecks,1);assert.equal(r.checks.find(c=>c.id==='robots').points,null);});
test('noindex header and search crawler blocking lower the actual checklist',async()=>{const r=await analyse('example.com',{fetchPage:fixture({headers:{'x-robots-tag':'noindex'},robots:'User-agent: OAI-SearchBot\nDisallow: /'})});assert.equal(r.checks.find(c=>c.id==='indexing').status,'bad');assert.equal(r.checks.find(c=>c.id==='robots').status,'bad');assert.equal(r.score,75);});
test('blocked sites and non-HTML are errors, never a made-up score',async()=>{await assert.rejects(()=>analyse('example.com',{fetchPage:fixture({status:403})}),/retvisende score/);await assert.rejects(()=>analyse('example.com',{fetchPage:async()=>({status:200,url:'https://example.com/',type:'application/pdf',text:'not a page'})}),/HTML/);});
test('server handles preflight, exact routes, invalid JSON, invalid URLs, size and methods',async t=>{
 const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const base='http://127.0.0.1:'+server.address().port;
 const r=await fetch(base+'/api/check',{method:'OPTIONS',headers:{Origin:'https://mary-juul-webdesign.mary2006.chatgpt.site','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'Content-Type'}});assert.equal(r.status,204);assert.equal(r.headers.get('access-control-allow-origin'),'https://mary-juul-webdesign.mary2006.chatgpt.site');
 assert.equal((await fetch(base+'/api/check',{method:'POST',headers:{Origin:'https://other.example'},body:'{}'})).status,403);
 assert.equal((await fetch(base+'/api/check',{method:'POST',body:'{'})).status,400);
 assert.equal((await fetch(base+'/api/check',{method:'POST',body:JSON.stringify({url:'http://127.0.0.1'})})).status,400);
 assert.equal((await fetch(base+'/api/check',{method:'POST',body:'x'.repeat(3000)})).status,413);
 assert.equal((await fetch(base+'/api/check',{method:'DELETE'})).status,405);
 assert.equal((await fetch(base+'/api/check-typo')).status,404);
 assert.equal((await (await fetch(base+'/healthz')).json()).version,'2.0');
 for(const p of ['/','/styles.css','/app.js','/assets/interior.jpg'])assert.equal((await fetch(base+p)).status,200,p);
});
test('scripts, comments, head and templates do not create visible content findings',async()=>{
 const hidden='<head><title>Test</title><meta name="viewport" content="width=device-width"><meta name="description" content="Test"></head><script>const example=\'<h1>Fake</h1><a href="tel:+4511223344">Kontakt</a><h2>Hvad koster det?</h2>\';</script><!-- <h1>Comment</h1> --><template><h1>Template</h1><p>'+('skjult indhold '.repeat(120))+'</p></template><main><p>Hej.</p></main>';
 const r=await analyse('example.com',{fetchPage:fixture({html:hidden})});
 assert.equal(r.checks.find(c=>c.id==='text').status,'bad');
 assert.equal(r.checks.find(c=>c.id==='headings').points,0);
 assert.equal(r.checks.find(c=>c.id==='contact').points,0);
 assert.equal(r.checks.find(c=>c.id==='answers').status,'info');
});
test('none is recognised as a noindex instruction in metadata and headers',async()=>{
 for(const options of [{html:html+'<meta name="robots" content="none">'},{headers:{'x-robots-tag':'none'}}]){
  const r=await analyse('example.com',{fetchPage:fixture(options)});
  assert.equal(r.checks.find(c=>c.id==='indexing').status,'bad');
 }
});
test('GEO plan distinguishes observed signals from manual tasks and never follows source links',async()=>{
 const calls=[],serve=fixture({html:html+'<link rel="canonical" href="/priser"><a href="https://source.example/report#one">Kilde</a><a href="https://source.example/report#two">Samme kilde</a><a href="javascript:alert(1)">Ugyldigt</a><a href="/kontakt">Internt</a><time datetime="2026-10-20">20. oktober</time>'});
 const r=await analyse('https://example.com/',{fetchPage:async(url,options)=>{calls.push(url);return serve(url,options);}});
 assert.equal(r.score,100);
 assert.equal(r.checks.find(c=>c.id==='references').max,0);
 assert.match(r.checks.find(c=>c.id==='references').explain,/1 forskellige/);
 assert.match(r.checks.find(c=>c.id==='canonical').explain,/https:\/\/example.com\/priser/);
 assert.equal(r.geoPlan.tasks.filter(t=>t.kind==='manual').length,2);
 assert.match(r.geoPlan.tasks.find(t=>t.title.includes('opdaterede')).observation,/2026-10-20/);
 assert.match(r.geoPlan.tasks.find(t=>t.title.includes('opdaterede')).observation,/beviser ikke/);
 assert.ok(r.geoPlan.prompts.some(p=>p.includes('Test')));
 assert.deepEqual(calls.sort(),['https://example.com/','https://example.com/llms.txt','https://example.com/robots.txt'].sort());
});
test('hidden references are ignored and unsupported canonical schemes are not exposed as valid',async()=>{
 const r=await analyse('example.com',{fetchPage:fixture({html:html+'<script>let s=\'<a href="https://hidden.example">Kilde</a>\';</script><!-- <a href="https://comment.example">Kilde</a> --><link rel="canonical" href="javascript:alert(1)">'})});
 assert.match(r.checks.find(c=>c.id==='references').explain,/0 forskellige/);
 assert.match(r.checks.find(c=>c.id==='canonical').explain,/ugyldig/);
 assert.equal(r.score,100);
});
test('a date or citation does not turn the technical score into an AI visibility score',async()=>{
 const baseline=await analyse('example.com',{fetchPage:fixture()});
 const enriched=await analyse('example.com',{fetchPage:fixture({html:html+'<time datetime="2026-11-04">I dag</time><a href="https://research.example/paper">Dokumentation</a>'})});
 assert.equal(enriched.score,baseline.score);
 assert.equal(enriched.scoreVersion,'2.0');
 assert.ok(enriched.geoPlan.tasks.some(t=>t.kind==='manual'&&t.observation.includes('har ikke stillet spørgsmål')));
 assert.match(baseline.geoPlan.tasks.find(t=>t.title.includes('opdaterede')).observation,/betyder ikke/);
});
