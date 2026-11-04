// Evidence-based website audit. No model calls or AI ranking claims.
const dns=require('node:dns').promises, net=require('node:net'), http=require('node:http'), https=require('node:https'), zlib=require('node:zlib');
const SEARCH_BOTS=['Googlebot','OAI-SearchBot','PerplexityBot','Claude-SearchBot'];
const SOURCES=[{title:'Google: AI features and your website',url:'https://developers.google.com/search/docs/appearance/ai-features'},{title:'OpenAI: web crawlers',url:'https://platform.openai.com/docs/bots'},{title:'GEO research (KDD 2024)',url:'https://arxiv.org/abs/2311.09735'}];
function isPublicIp(address){
 if(net.isIPv4(address)){const[a,b,c]=address.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0||(b===88&&c===99)))||(a===198&&(b===18||b===19||(b===51&&c===100)))||(a===203&&b===0&&c===113));}
 if(!net.isIPv6(address))return false;
 const s=address.toLowerCase();return /^[23][0-9a-f]{3}:/.test(s)&&!/^2001:(?:0:|db8:|[01]?[0-9a-f]{1,2}:)/.test(s)&&!/^2002:/.test(s)&&!/^3fff:/.test(s);
}
function normalizeUrl(input){
 if(typeof input!=='string'||!input.trim()||input.length>500)throw Error('Skriv en gyldig hjemmesideadresse.');
 let raw=input.trim();if(!/^[a-z][a-z\d+.-]*:\/\//i.test(raw))raw='https://'+raw;
 let u;try{u=new URL(raw);}catch{throw Error('Skriv en gyldig hjemmesideadresse, fx dinvirksomhed.dk.');}
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password||(u.port&&!['80','443'].includes(u.port)))throw Error('Brug en offentlig http- eller https-adresse uden login eller særlig port.');
 const host=u.hostname.replace(/^\[|\]$/g,'').toLowerCase();
 if((!host.includes('.')&&!net.isIP(host))||/(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)||(net.isIP(host)&&!isPublicIp(host)))throw Error('Adressen skal være en offentlig hjemmeside.');
 u.hash='';return u;
}
async function safeFetch(input,options={}){
 let url=normalizeUrl(String(input)),deadline=Date.now()+(options.timeoutMs||8000);
 for(let hop=0;hop<=5;hop++){
  const remaining=deadline-Date.now();if(remaining<=0)throw Error('Hjemmesiden svarede ikke i tide. Prøv igen om lidt.');
  const hostname=url.hostname.replace(/^\[|\]$/g,'');let addresses,dnsTimer;
  try{addresses=await Promise.race([net.isIP(hostname)?Promise.resolve([{address:hostname,family:net.isIP(hostname)}]):(options.lookup||dns.lookup)(hostname,{all:true,verbatim:true}),new Promise((_,reject)=>{dnsTimer=setTimeout(()=>reject(Error('Hjemmesidens adresse svarede ikke i tide.')),remaining);})]);}finally{clearTimeout(dnsTimer);}
  if(!addresses.length||addresses.some(a=>!isPublicIp(a.address)))throw Error('Adressen skal være en offentlig hjemmeside.');
  const chosen=addresses.find(a=>a.family===4)||addresses[0];
  const response=await new Promise((resolve,reject)=>{
   let settled=false,timer;
   const finish=(err,data)=>{if(settled)return;settled=true;clearTimeout(timer);err?reject(err):resolve(data);};
   const req=(url.protocol==='https:'?https:http).request(url,{method:'GET',family:chosen.family,lookup:(_h,opts,cb)=>opts?.all?cb(null,[chosen]):cb(null,chosen.address,chosen.family),headers:{'User-Agent':'Mozilla/5.0 (compatible; MaryJuulTjek/2.0)',Accept:'text/html,text/plain;q=0.9,*/*;q=0.1','Accept-Encoding':'gzip, br, deflate'}},res=>{
    const status=res.statusCode;if(status>=300&&status<400&&res.headers.location){res.resume();finish(null,{redirect:res.headers.location});return;}
    let stream=res;const enc=res.headers['content-encoding'],decoder=enc==='gzip'?zlib.createGunzip():enc==='br'?zlib.createBrotliDecompress():enc==='deflate'?zlib.createInflate():null;
    if(decoder){stream=res.pipe(decoder);decoder.on('error',e=>{req.destroy();finish(e);});}
    const chunks=[];let size=0;
    stream.on('data',c=>{size+=c.length;if(size>2000000){req.destroy();stream.destroy();finish(Error('Siden er for stor til det gratis tjek. Prøv en mindre underside.'));}else chunks.push(c);});
    stream.on('end',()=>finish(null,{status,url:url.href,text:Buffer.concat(chunks).toString('utf8'),type:res.headers['content-type']||'',headers:res.headers}));
    res.on('aborted',()=>finish(Error('Hjemmesiden afbrød forbindelsen. Prøv igen.')));stream.on('error',e=>finish(e));
   });
   timer=setTimeout(()=>{req.destroy();finish(Error('Hjemmesiden svarede ikke i tide. Prøv igen om lidt.'));},Math.max(1,deadline-Date.now()));req.on('error',e=>finish(e));req.end();
  });
  if(!response.redirect)return response;url=normalizeUrl(new URL(response.redirect,url).href);
 }
 throw Error('Hjemmesiden viderestiller for mange gange.');
}
const decode=s=>String(s||'').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{const c=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return c<=0x10ffff?String.fromCodePoint(c):'';}).replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');
function contentHtml(html){return html.replace(/<!--[\s\S]*?-->/g,' ').replace(/<(head|script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi,' ');}
function visibleText(html){return decode(contentHtml(html).replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<!--[\s\S]*?-->/g,' ').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();}
function attrs(tag){const out={};for(const m of tag.matchAll(/([^\s=<>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))out[m[1].toLowerCase()]=decode(m[2]??m[3]??m[4]);return out;}
function metaContent(html,name){for(const tag of html.match(/<meta\b[^>]*>/gi)||[]){const a=attrs(tag);if((a.name||a.property||'').toLowerCase()===name.toLowerCase())return a.content||'';}return '';}
function structuredData(html){
 const items=[];let invalid=0;
 function visit(x){if(Array.isArray(x))return x.forEach(visit);if(!x||typeof x!=='object')return;if(x['@type'])items.push(x);for(const val of Object.values(x))if(val&&typeof val==='object')visit(val);}
 for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if((attrs(m[1]).type||'').toLowerCase()==='application/ld+json'){try{visit(JSON.parse(m[2]));}catch{invalid++;}}
 return{items,invalid,types:[...new Set(items.flatMap(x=>[].concat(x['@type']||[])))]};
}
function parseRobots(text,pathname='/'){
 const groups=[];let current=null,rulesStarted=false;
 for(const raw of text.split(/\r?\n/)){const line=raw.replace(/#.*/,'').trim(),colon=line.indexOf(':');if(colon<0)continue;const key=line.slice(0,colon).trim().toLowerCase(),value=line.slice(colon+1).trim();if(key==='user-agent'){if(!current||rulesStarted){current={agents:[],rules:[]};groups.push(current);rulesStarted=false;}current.agents.push(value.toLowerCase());}else if(current&&['allow','disallow'].includes(key)){rulesStarted=true;if(value)current.rules.push({allow:key==='allow',path:value});}}
 return SEARCH_BOTS.filter(bot=>{
  const matches=groups.map(g=>({...g,specificity:Math.max(-1,...g.agents.map(a=>a==='*'?0:bot.toLowerCase().includes(a)?a.length:-1))})),longest=Math.max(-1,...matches.map(g=>g.specificity));if(longest<0)return false;
  let winner=null;
  for(const group of matches.filter(g=>g.specificity===longest))for(const rule of group.rules){
   const parts=rule.path.split('*').map(p=>p.replace(/[.+?^${}()|[\]\\]/g,'\\$&'));
   let pattern='^'+parts.join('.*');if(pattern.endsWith('\\$'))pattern=pattern.slice(0,-2)+'$';
   if(!new RegExp(pattern).test(pathname))continue;const length=rule.path.replace(/[*$]/g,'').length;
   if(!winner||length>winner.length||(length===winner.length&&rule.allow))winner={...rule,length};
  }return winner&&!winner.allow;
 });
}
function readPageReferences(html,content,base,items){
 const canonicalTags=(html.match(/<link\b[^>]*>/gi)||[]).map(attrs).filter(a=>(a.rel||'').toLowerCase().split(/\s+/).includes('canonical'));
 const canonical=[];
 for(const tag of canonicalTags){try{const u=new URL(tag.href,base);if(tag.href&&['http:','https:'].includes(u.protocol)&&!u.username&&!u.password)canonical.push(u.href);}catch{}}
 const external=new Set(),host=base.hostname.replace(/^www\./,'');
 for(const tag of content.match(/<a\b[^>]*>/gi)||[]){try{const a=attrs(tag);if(!a.href)continue;const u=new URL(a.href,base);if(['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&u.hostname.replace(/^www\./,'')!==host)external.add(u.origin+u.pathname);}catch{}}
 const questions=new Set([...content.matchAll(/<(?:summary|h[2-4])\b[^>]*>([\s\S]*?)<\/(?:summary|h[2-4])>/gi)].map(m=>visibleText(m[1])).filter(t=>t.includes('?')&&t.length>=5&&t.length<=220));
 const rawDates=[...items.flatMap(x=>[x.dateModified]).filter(x=>typeof x==='string'),...(content.match(/<time\b[^>]*>/gi)||[]).map(t=>attrs(t).datetime).filter(Boolean)];
 const dates=[...new Set(rawDates.filter(x=>/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(x)&&Number.isFinite(Date.parse(x))))].slice(0,3);
 return{canonical,canonicalCount:canonicalTags.length,externalLinks:[...external],questionCount:questions.size,dates};
}
function makeGeoPlan(refs,businessName,hasPrice){
 return{version:'1.0',tasks:[
 {kind:'page',title:'Besvar spørgsmål før kunden køber',observation:refs.questionCount?`Vi genkendte ${refs.questionCount} spørgende overskrifter i sidens HTML. Svarenes indhold og rigtighed er ikke vurderet.`:'Vi genkendte ingen spørgende overskrifter i denne sides HTML. Andre formuleringer eller undersider kan besvare spørgsmålene.',action:'Saml spørgsmål fra rigtige kundehenvendelser. Dæk behov, sammenligning og beslutning, og giv et konkret svar lige under hvert spørgsmål.'},
 {kind:'page',title:'Gør pris og leverance klare',observation:hasPrice?'Mindst ét prisbeløb blev genkendt. Hvad beløbet dækker, er ikke verificeret.':'Ingen prisbeløb blev genkendt på denne side. De kan stå på en anden underside.',action:hasPrice?'Forklar, hvad prisen omfatter, hvilke vilkår der gælder, og om beløbet er én gang eller løbende. Kontrollér at oplysningerne er aktuelle.':'Vis relevante priser, eller forklar konkret, hvordan kunden får et tilbud, og hvad der bestemmer prisen.'},
 {kind:'page',title:'Underbyg påstande med dokumentation',observation:`Vi fandt ${refs.externalLinks.length} forskellige eksterne http(s)-links. De kan også være profiler eller vilkår; deres troværdighed er ikke undersøgt.`,action:'Brug virkelige erfaringer, dokumenterede resultater og relevante kilder. Angiv metode og periode, når du viser tal. Undlad at fremstille koncepter som kundecases.'},
 {kind:'manual',title:'Sammenhold virksomhedens oplysninger på nettet',observation:'Profiler, anmeldelser, kataloger og ekstern omtale er ikke hentet eller efterprøvet af dette tjek.',action:'Sammenlign navn, kontakt, priser og ydelser på din side, din virksomhedsprofil og de eksterne sider, kunderne bruger. Bed udgiveren om at rette dokumenterbare fejl.'},
 {kind:'page',title:'Hold de vigtige fakta opdaterede',observation:refs.dates.length?'En dateModified- eller time-dato blev genkendt: '+refs.dates.join(', ')+'. Datoen beviser ikke, at indholdet er opdateret.':'Ingen dateModified- eller time-dato blev genkendt. Det betyder ikke, at oplysningerne er forældede.',action:'Kontrollér især priser, åbningstider, tilgængelighed og vilkår. Ret selve oplysningerne, når noget ændrer sig, og brug en opdateringsdato, når den er relevant.'},
 {kind:'manual',title:'Undersøg faktiske AI-svar særskilt',observation:'Tjekket har ikke stillet spørgsmål til ChatGPT, Gemini eller andre AI-tjenester og måler ikke omtale eller konkurrenter.',action:'Vælg reelle kundespørgsmål. Gem spørgsmål, tjeneste/model, dato, hele svaret, kilder og nævnte konkurrenter. Gentag sammenlignelige tests. Hold omtaler, besøg og henvendelser adskilt.'}
 ],prompts:['Hvilke virksomheder kan hjælpe med [din ydelse] i [din by]?','Hvad skal jeg sammenligne, før jeg vælger [din type virksomhed]?',`Hvad tilbyder ${businessName}, hvad koster det, og hvordan tager jeg kontakt?`]};
}
async function analyse(input,options={}){
 const start=normalizeUrl(input),fetchPage=options.fetchPage||safeFetch,page=await fetchPage(start.href);
 if([401,403,429,503].includes(page.status))throw Error('Hjemmesiden afviser automatiske besøg. Derfor kan vi ikke give den en retvisende score. Prøv en anden side, eller kontakt mig.');
 if(page.status>=400)throw Error('Hjemmesiden svarer med fejl '+page.status+'. Tjek adressen.');
 if(!/\btext\/html\b|application\/xhtml\+xml/i.test(page.type||''))throw Error('Adressen skal pege på en HTML-hjemmeside.');
 const base=new URL(page.url),html=page.text,content=contentHtml(html),text=visibleText(content),sd=structuredData(html);
 const aux=async path=>{try{return await fetchPage(new URL(path,base).href,{timeoutMs:4500});}catch{return null;}};
 const [robots,llms]=await Promise.all([aux('/robots.txt'),aux('/llms.txt')]);const checks=[];
 const add=(id,status,title,explain,fix,points,max,group='technical')=>checks.push({id,status,title,explain,fix,points,max,group,evidenceUrl:base.href});
 const title=visibleText((html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||''),desc=metaContent(html,'description'),wordCount=text.split(/\s+/).filter(Boolean).length;
 add('https',base.protocol==='https:'?'ok':'bad','Sikker forbindelse',base.protocol==='https:'?'Den undersøgte side bruger HTTPS.':'Den undersøgte side bruger HTTP.','Slå HTTPS til hos din udbyder.',base.protocol==='https:'?10:0,10);
 add('text',wordCount>=100?'ok':wordCount>=30?'warn':'bad','Læsbar tekst',`Vi fandt cirka ${wordCount} ord i den HTML, serveren sendte. JavaScript er ikke kørt.`,'Sørg for, at vigtig information også står i sidens HTML.',wordCount>=100?15:wordCount>=30?7:0,15);
 add('metadata',title&&desc?'ok':'warn','Titel og beskrivelse',`${title?'Titel: “'+title.slice(0,100)+'”.':'Ingen sidetitel fundet.'} ${desc?'Metabeskrivelse fundet.':'Metabeskrivelse mangler.'}`,'Skriv en konkret titel og metabeskrivelse.',(title?5:0)+(desc?5:0),10);
 const h1s=[...content.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(m=>visibleText(m[1]));
 add('headings',h1s.length===1?'ok':'warn','Tydelig hovedoverskrift',`${h1s.length} H1-overskrift${h1s.length===1?'':'er'} fundet${h1s[0]?': “'+h1s[0].slice(0,90)+'”':''}.`,'Brug en tydelig hovedoverskrift, der forklarer tilbuddet.',h1s.length===1?10:h1s.length?5:0,10);
 const viewport=/width\s*=\s*device-width/i.test(metaContent(html,'viewport'));
 add('viewport',viewport?'ok':'warn','Mobilens grundopsætning',viewport?'Viewport er sat til skærmens bredde. Det visuelle layout er ikke testet.':'Viewport med device-width blev ikke fundet.','Tilføj viewport, og gennemgå siden på en telefon.',viewport?10:0,10);
 const noindex=/\b(?:noindex|none)\b/i.test(metaContent(html,'robots')+' '+metaContent(html,'googlebot')+' '+(page.headers?.['x-robots-tag']||''));
 add('indexing',noindex?'bad':'ok','Indekseringsdirektiver',noindex?'Et noindex-direktiv frabeder indeksering.':'Intet noindex-direktiv fundet i HTML eller HTTP-header. Faktisk indeksering er ikke undersøgt.','Fjern kun noindex, hvis siden skal være offentlig i søgninger.',noindex?0:10,10);
 const isRobotsText=robots&&robots.status===200&&!/html/i.test(robots.type||'')&&!/<(?:html|!doctype)/i.test(robots.text),robotsAbsent=robots&&[404,410].includes(robots.status),blocked=isRobotsText?parseRobots(robots.text,base.pathname+base.search):[],unknownRobots=!isRobotsText&&!robotsAbsent;
 add('robots',unknownRobots?'unknown':blocked.length?'bad':'ok','Søgerobotters adgang',unknownRobots?'robots.txt kunne ikke læses som en gyldig tekstfil. Adgang er uafklaret.':blocked.length?'Reglerne blokerer denne sti for: '+blocked.join(', ')+'.':robotsAbsent?'robots.txt findes ikke. Vi fandt derfor ingen regler her, der blokerer.':'Ingen matchende blokering for de undersøgte søgerobotter på denne sti. Det beviser ikke adgang gennem en firewall.','Gennemgå robots.txt for Googlebot og AI-søgerobotter. Træningsrobotter behøver ikke åbnes.',unknownRobots?null:blocked.length?0:15,15);
 const businesses=sd.items.filter(x=>[].concat(x['@type']||[]).some(t=>/Business$|Organization$|Store$|Salon$|Restaurant$|ProfessionalService$|CafeOrCoffeeShop$|DaySpa$|Bakery$|BarOrPub$/.test(t))),complete=businesses.some(x=>x.name&&(x.url||x.telephone||x.address));
 add('schema',complete?'ok':'warn','Virksomhedens strukturerede data',sd.invalid?`${sd.invalid} JSON-LD-blokke kunne ikke læses.`:complete?'JSON-LD med virksomhedsnavn og mindst én virksomhedsoplysning fundet. Rigtigheden er ikke verificeret.':businesses.length?'Virksomhedsdata fundet, men navn eller kontaktoplysninger mangler.':'Ingen virksomhedsdata genkendt. Det er ikke et krav for at blive vist i AI-svar.','Tilføj relevante virksomhedsdata, som stemmer med synlig tekst.',complete?10:businesses.length?5:0,10);
 const hasContact=/href\s*=\s*["'](?:tel:|mailto:)/i.test(content)||/(?:\+45\s*)?(?:\d{2}[ .-]){3}\d{2}\b/.test(text)||/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(text);
 add('contact',hasContact?'ok':'warn','Let at tage kontakt',hasContact?'Kontaktlink eller kontaktoplysning fundet i sidens kode.':'Ingen telefon eller e-mail genkendt på den undersøgte side.','Vis en opdateret telefon eller e-mail.',hasContact?10:0,10,'content');
 const faq=sd.types.includes('FAQPage')||/<(?:summary|h[2-4])\b[^>]*>[^<]{5,180}\?/i.test(content)||/ofte stillede spørgsmål|spørgsmål\s*(?:og|&|&amp;)\s*svar/i.test(text);
 add('answers',faq?'ok':'info','Svar på kundespørgsmål',faq?'Spørgsmålsoverskrifter eller FAQ-data fundet. Svarenes kvalitet er ikke vurderet.':'Ingen tydelige spørgsmål og svar genkendt. De kan stå på en anden underside.','Besvar kundernes reelle spørgsmål om fx pris, behandling og booking.',null,0,'content');
 const price=/\b\d[\d., ]*\s*(?:kr\.?|DKK|EUR)\b|[€$]\s*\d/.test(text);
 add('pricing',price?'ok':'info','Konkrete priser',price?'Prisbeløb fundet i den synlige tekst. Vi har ikke verificeret, om de er aktuelle.':'Ingen prisbeløb genkendt på denne side. Det kan være relevant at forklare pris eller tilbudsproces.','Vis priser eller forklar, hvordan kunden får et tilbud.',null,0,'content');
 const hasLlms=llms&&llms.status===200&&!/html/i.test(llms.type||'')&&/^#\s+\S/m.test(llms.text);
 add('llms','info','llms.txt · valgfri',hasLlms?'En llms.txt-fil blev fundet. Den giver ingen point i dette tjek.':'Ingen llms.txt-fil genkendt. Det trækker ikke scoren ned.','Filen er et frivilligt forslag; den er ikke et krav for Google eller en garanti for AI-omtale.',null,0,'context');
 const refs=readPageReferences(html,content,base,sd.items);
 add('canonical','info','Foretrukken sideadresse',refs.canonicalCount===1&&refs.canonical.length===1?'En canonical-adresse er angivet: '+refs.canonical[0]+'. Destination og indeksering er ikke verificeret.':refs.canonicalCount?'Canonical-angivelsen er ugyldig eller forekommer flere gange.':'Ingen canonical-adresse genkendt i sidens HTML. Det er ikke i sig selv en blokering for AI-søgning.','Gennemgå den foretrukne adresse, især hvis samme indhold findes på flere adresser.',null,0,'context');
 add('references','info','Eksterne referencer',`${refs.externalLinks.length} forskellige eksterne http(s)-links genkendt. Links er ikke det samme som troværdig dokumentation; indholdet bag dem er ikke undersøgt.`,'Underbyg væsentlige påstande med relevante, kontrollerbare kilder og egne dokumenterede erfaringer.',null,0,'context');
 const businessName=businesses.map(b=>b.name).find(n=>typeof n==='string'&&n.trim())?.trim().slice(0,100)||base.hostname;
 const geoPlan=makeGeoPlan(refs,businessName,price);
 const scored=checks.filter(c=>c.max>0&&c.points!==null),max=scored.reduce((n,c)=>n+c.max,0),points=scored.reduce((n,c)=>n+c.points,0);
 return{url:base.href,host:base.hostname.replace(/^www\./,''),score:Math.round(points/max*100),scoreLabel:'Teknisk grundlag',scoreVersion:'2.0',geoPlan,checkedAt:new Date().toISOString(),checks,coverage:{pages:1,renderedJavaScript:false,unknownChecks:checks.filter(c=>c.status==='unknown').length},priorities:checks.filter(c=>['bad','warn'].includes(c.status)).sort((a,b)=>(b.max-(b.points||0))-(a.max-(a.points||0))).slice(0,3).map(c=>({title:c.title,action:c.fix})),limitations:['Kun den indtastede side og robots.txt/llms.txt er undersøgt.','Scoren er vores vægtede tekniske tjekliste. Den måler ikke AI-omtale, placering, hastighed eller salg.','Omtale, kilder og konkurrenter i AI-svar kræver gentagne tests af relevante spørgsmål.','Planens manuelle opgaver og indholdstegn giver ikke point i den tekniske score.'],sources:SOURCES};
}
function publicError(e){if(/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ENETUNREACH|EHOSTUNREACH/.test(String(e.code||e.message)))return 'Vi kunne ikke hente hjemmesiden. Tjek adressen, og prøv igen.';if(/certificate|CERT_|TLS|SSL/i.test(String(e.code||e.message)))return 'Der er et problem med hjemmesidens sikre forbindelse. Prøv igen eller kontakt mig.';return e.message||'Tjekket kunne ikke gennemføres. Prøv igen.';}
async function handler(req,res){res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');if(!['POST','GET'].includes(req.method)){res.statusCode=405;res.setHeader('Allow','GET, POST');return res.end(JSON.stringify({error:'Metoden er ikke tilladt.'}));}try{const b=req.method==='POST'?(typeof req.body==='object'?req.body:JSON.parse(req.body||'{}')):{url:new URL(req.url,'http://local').searchParams.get('url')};const result=await analyse(b?.url);res.statusCode=200;res.end(JSON.stringify(result));}catch(e){res.statusCode=400;res.end(JSON.stringify({error:e instanceof SyntaxError?'Formularen kunne ikke læses. Prøv igen.':publicError(e)}));}}
module.exports=handler;Object.assign(module.exports,{analyse,normalizeUrl,isPublicIp,parseRobots,safeFetch,visibleText,metaContent,structuredData});
