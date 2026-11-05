// MARY JUUL website check, API v3.
// Evidence-based: every finding comes from the HTML, HTTP headers, robots.txt,
// sitemap.xml or llms.txt that were actually fetched. No model calls, no score,
// no claims about real mentions in AI services.
'use strict';
const dns=require('node:dns').promises, net=require('node:net'), http=require('node:http'), https=require('node:https'), zlib=require('node:zlib');

const VERSION='3';
const SEARCH_BOTS=['Googlebot','OAI-SearchBot','PerplexityBot','Claude-SearchBot'];
const PAGE_TIMEOUT_MS=8000, FILE_TIMEOUT_MS=4500, MAX_BYTES=2000000;
const SOURCES=[
 {title:'Google Search Central: AI-funktioner og din hjemmeside',url:'https://developers.google.com/search/docs/appearance/ai-features'},
 {title:'Google Search Central: robots.txt',url:'https://developers.google.com/search/docs/crawling-indexing/robots/intro'},
 {title:'OpenAI: søgerobotter (OAI-SearchBot)',url:'https://platform.openai.com/docs/bots'},
 {title:'Perplexity: søgerobotter (PerplexityBot)',url:'https://docs.perplexity.ai/guides/bots'},
 {title:'Schema.org: LocalBusiness',url:'https://schema.org/LocalBusiness'},
 {title:'GEO: Generative Engine Optimization (KDD 2024)',url:'https://arxiv.org/abs/2311.09735'}
];
const NOT_CHECKED=[
 'Faktisk omtale i ChatGPT, Gemini, Perplexity og andre AI-tjenester. Tjekket stiller ingen spørgsmål til AI-tjenester.',
 'Andre undersider end den indtastede adresse.',
 'Indhold, der først vises, når JavaScript kører.',
 'Hastighed, mobilvisning og design.',
 'Om Google-virksomhedsprofil, kataloger og sociale profiler siger det samme som hjemmesiden (navn, adresse, telefon, priser, åbningstider).',
 'Anmeldelser og omtale på andre hjemmesider.',
 'Om oplysningerne på siden er rigtige og opdaterede.'
];
const METHOD='Tjekket henter den indtastede side én gang, som en almindelig browser uden JavaScript, samt filerne robots.txt, sitemap.xml og llms.txt fra samme domæne. Vi læser kun det, serveren sender: tekst, overskrifter, metadata, strukturerede data og links. Hvert fund viser det, vi faktisk så. Tjekket giver ingen score, fordi en enkelt side ikke er grundlag nok for en samlet karakter. Det måler ikke, om virksomheden bliver nævnt i ChatGPT, Gemini eller andre AI-tjenester, og det vurderer ikke, om oplysningerne er rigtige. Hvis vi ikke får adgang til siden, står forholdet som uafklaret, ikke som en fejl på siden.';

class CheckError extends Error{constructor(message,code,extra={}){super(message);this.code=code;Object.assign(this,extra);}}
const invalid=msg=>new CheckError(msg,'INVALID_URL');

// ---------- Network safety (SSRF) ----------
function isPublicIp(address){
 if(net.isIPv4(address)){const[a,b,c]=address.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0||(b===88&&c===99)))||(a===198&&(b===18||b===19||(b===51&&c===100)))||(a===203&&b===0&&c===113));}
 if(!net.isIPv6(address))return false;
 const s=address.toLowerCase();return /^[23][0-9a-f]{3}:/.test(s)&&!/^2001:(?:0:|db8:|[01]?[0-9a-f]{1,2}:)/.test(s)&&!/^2002:/.test(s)&&!/^3fff:/.test(s);
}
function normalizeUrl(input){
 if(typeof input!=='string'||!input.trim()||input.length>500)throw invalid('Skriv en gyldig hjemmesideadresse, fx dinvirksomhed.dk.');
 let raw=input.trim();if(!/^[a-z][a-z\d+.-]*:\/\//i.test(raw))raw='https://'+raw;
 let u;try{u=new URL(raw);}catch{throw invalid('Skriv en gyldig hjemmesideadresse, fx dinvirksomhed.dk.');}
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password||(u.port&&!['80','443'].includes(u.port)))throw invalid('Brug en offentlig http- eller https-adresse uden login eller særlig port.');
 const host=u.hostname.replace(/^\[|\]$/g,'').toLowerCase();
 if((!host.includes('.')&&!net.isIP(host))||/(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)||(net.isIP(host)&&!isPublicIp(host)))throw invalid('Adressen skal være en offentlig hjemmeside.');
 u.hash='';return u;
}
// options.lookup / options.allowAddress / options.port exist ONLY for tests that run
// a local fixture server. Production code (server.js, worker.js) never sets them,
// and they can never come from request data.
async function safeFetch(input,options={}){
 const allow=options.allowAddress||isPublicIp;
 let url=normalizeUrl(String(input));const deadline=Date.now()+(options.timeoutMs||PAGE_TIMEOUT_MS);
 for(let hop=0;hop<=5;hop++){
  const remaining=deadline-Date.now();if(remaining<=0)throw new CheckError('Hjemmesiden svarede ikke i tide.','TIMEOUT');
  const hostname=url.hostname.replace(/^\[|\]$/g,'');let addresses,dnsTimer;
  try{addresses=await Promise.race([net.isIP(hostname)?Promise.resolve([{address:hostname,family:net.isIP(hostname)}]):(options.lookup||dns.lookup)(hostname,{all:true,verbatim:true}),new Promise((_,reject)=>{dnsTimer=setTimeout(()=>reject(new CheckError('Hjemmesidens adresse svarede ikke i tide.','TIMEOUT')),remaining);})]);}finally{clearTimeout(dnsTimer);}
  if(!addresses.length||addresses.some(a=>!allow(a.address)))throw new CheckError('Adressen skal være en offentlig hjemmeside.',hop===0?'INVALID_URL':'PRIVATE_REDIRECT');
  const chosen=addresses.find(a=>a.family===4)||addresses[0];
  const response=await new Promise((resolve,reject)=>{
   let settled=false,timer;
   const finish=(err,data)=>{if(settled)return;settled=true;clearTimeout(timer);err?reject(err):resolve(data);};
   const reqOptions={method:'GET',family:chosen.family,lookup:(_h,opts,cb)=>opts?.all?cb(null,[chosen]):cb(null,chosen.address,chosen.family),headers:{'User-Agent':'Mozilla/5.0 (compatible; MaryJuulTjek/3.0; +https://maryjuul-ai-synlighed.onrender.com)',Accept:'text/html,application/xhtml+xml,text/plain;q=0.9,application/xml;q=0.8,*/*;q=0.1','Accept-Language':'da,en;q=0.8','Accept-Encoding':'gzip, br, deflate'}};
   if(options.port)reqOptions.port=options.port;
   const req=(url.protocol==='https:'?https:http).request(url,reqOptions,res=>{
    const status=res.statusCode;if(status>=300&&status<400&&res.headers.location){res.resume();finish(null,{redirect:res.headers.location});return;}
    let stream=res;const enc=res.headers['content-encoding'],decoder=enc==='gzip'?zlib.createGunzip():enc==='br'?zlib.createBrotliDecompress():enc==='deflate'?zlib.createInflate():null;
    if(decoder){stream=res.pipe(decoder);decoder.on('error',e=>{req.destroy();finish(e);});}
    const chunks=[];let size=0;
    stream.on('data',c=>{size+=c.length;if(size>MAX_BYTES){req.destroy();stream.destroy();finish(new CheckError('Siden er for stor til det gratis tjek.','TOO_LARGE'));}else chunks.push(c);});
    stream.on('end',()=>finish(null,{status,url:url.href,text:Buffer.concat(chunks).toString('utf8'),type:res.headers['content-type']||'',headers:res.headers}));
    res.on('aborted',()=>finish(new CheckError('Hjemmesiden afbrød forbindelsen.','ECONNRESET')));stream.on('error',e=>finish(e));
   });
   timer=setTimeout(()=>{req.destroy();finish(new CheckError('Hjemmesiden svarede ikke i tide.','TIMEOUT'));},Math.max(1,deadline-Date.now()));req.on('error',e=>finish(e));req.end();
  });
  if(!response.redirect)return response;
  try{url=normalizeUrl(new URL(response.redirect,url).href);}catch{throw new CheckError('Hjemmesiden viderestiller til en adresse, vi ikke må besøge.','PRIVATE_REDIRECT');}
 }
 throw new CheckError('Hjemmesiden viderestiller for mange gange.','TOO_MANY_REDIRECTS');
}

// ---------- HTML helpers ----------
const decode=s=>String(s||'').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{const c=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return c>0&&c<=0x10ffff?String.fromCodePoint(c):'';}).replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');
function contentHtml(html){return html.replace(/<!--[\s\S]*?-->/g,' ').replace(/<(head|script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1>/gi,' ');}
function visibleText(html){return decode(contentHtml(html).replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();}
function attrs(tag){const out={};for(const m of tag.matchAll(/([^\s=<>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))out[m[1].toLowerCase()]=decode(m[2]??m[3]??m[4]);return out;}
function metaContent(html,name){for(const tag of html.match(/<meta\b[^>]*>/gi)||[]){const a=attrs(tag);if((a.name||a.property||'').toLowerCase()===name.toLowerCase())return a.content||'';}return '';}
const clip=(s,n=140)=>{s=String(s).replace(/\s+/g,' ').trim();return s.length>n?s.slice(0,n-1).trimEnd()+'…':s;};
const quote=s=>'“'+clip(s,120)+'”';
function structuredData(html){
 const items=[];let invalidBlocks=0;
 function visit(x){if(Array.isArray(x))return x.forEach(visit);if(!x||typeof x!=='object')return;if(x['@type'])items.push(x);for(const val of Object.values(x))if(val&&typeof val==='object')visit(val);}
 for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if((attrs(m[1]).type||'').toLowerCase()==='application/ld+json'){try{visit(JSON.parse(m[2].trim()));}catch{invalidBlocks++;}}
 return{items,invalid:invalidBlocks,types:[...new Set(items.flatMap(x=>[].concat(x['@type']||[])))]};
}

// ---------- robots.txt ----------
function robotsBlocks(text,pathname='/'){
 const groups=[];let current=null,rulesStarted=false;
 for(const raw of text.split(/\r?\n/)){const line=raw.replace(/#.*/,'').trim(),colon=line.indexOf(':');if(colon<0)continue;const key=line.slice(0,colon).trim().toLowerCase(),value=line.slice(colon+1).trim();if(key==='user-agent'){if(!current||rulesStarted){current={agents:[],rules:[]};groups.push(current);rulesStarted=false;}current.agents.push(value.toLowerCase());}else if(current&&['allow','disallow'].includes(key)){rulesStarted=true;if(value)current.rules.push({allow:key==='allow',path:value});}}
 const out=[];
 for(const bot of SEARCH_BOTS){
  const matches=groups.map(g=>({...g,specificity:Math.max(-1,...g.agents.map(a=>a==='*'?0:bot.toLowerCase().includes(a)?a.length:-1))})),longest=Math.max(-1,...matches.map(g=>g.specificity));if(longest<0)continue;
  let winner=null;
  for(const group of matches.filter(g=>g.specificity===longest))for(const rule of group.rules){
   const parts=rule.path.split('*').map(p=>p.replace(/[.+?^${}()|[\]\\]/g,'\\$&'));
   let pattern='^'+parts.join('.*');if(pattern.endsWith('\\$'))pattern=pattern.slice(0,-2)+'$';
   if(!new RegExp(pattern).test(pathname))continue;const length=rule.path.replace(/[*$]/g,'').length;
   if(!winner||length>winner.length||(length===winner.length&&rule.allow))winner={...rule,length,agent:longest===0?'*':bot};
  }
  if(winner&&!winner.allow)out.push({bot,rule:'User-agent: '+winner.agent+' / Disallow: '+winner.path});
 }
 return out;
}
const parseRobots=(text,pathname='/')=>robotsBlocks(text,pathname).map(b=>b.bot);
const sitemapLines=text=>[...String(text).matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map(m=>m[1]);

// ---------- Access / bot walls ----------
function botWall(page){
 const h=page.headers||{},text=String(page.text||'').slice(0,60000);
 if(String(h['cf-mitigated']||'').toLowerCase()==='challenge')return 'Cloudflare-sikkerhedskontrol (cf-mitigated: challenge)';
 if(/challenge-platform|cf-chl-|cf_chl_opt|__cf_chl_/i.test(text))return 'Cloudflare-sikkerhedskontrol';
 const title=visibleText((text.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'');
 if(/^(?:just a moment|attention required|checking your browser|one moment, please|please wait|access denied|ddos-guard)/i.test(title))return 'Sikkerhedskontrol: '+quote(title);
 if(/Incapsula incident|_Incapsula_Resource|Sucuri WebSite Firewall|perimeterx|px-captcha|datadome/i.test(text))return 'Sikkerhedskontrol fra en firewall-tjeneste';
 const words=visibleText(text).split(/\s+/).filter(Boolean).length;
 if(words<80&&/g-recaptcha|h-captcha|hcaptcha|cf-turnstile|captcha/i.test(text))return 'Captcha i stedet for indhold';
 return null;
}
function classifyFailure(e,requestedUrl){
 const code=String(e?.code||''),msg=String(e?.message||'');
 if(code==='TIMEOUT'||/ETIMEDOUT|ESOCKETTIMEDOUT/.test(code))return{access:'timeout',evidence:'Intet svar inden for '+PAGE_TIMEOUT_MS/1000+' sekunder',note:'Hjemmesiden svarede ikke inden for '+PAGE_TIMEOUT_MS/1000+' sekunder. Derfor har vi ikke kunnet undersøge den. Det siger ikke noget om, hvordan siden klarer sig. Prøv igen om lidt.'};
 if(/ENOTFOUND|EAI_AGAIN|ENODATA/.test(code))return{access:'unreachable',evidence:'Domænet blev ikke fundet ('+code+')',note:'Vi kunne ikke finde domænet '+new URL(requestedUrl).hostname+'. Tjek, at adressen er stavet rigtigt. Vi har ikke kunnet undersøge siden.'};
 if(/CERT|TLS|SSL|ERR_TLS|DEPTH_ZERO|SELF_SIGNED/i.test(code+' '+msg))return{access:'unreachable',evidence:'Fejl i den sikre forbindelse ('+(code||'TLS')+')',note:'Vi kunne ikke oprette en sikker forbindelse til hjemmesiden. Det kan skyldes et certifikat, der er udløbet eller sat forkert op. Vi har derfor ikke kunnet undersøge indholdet.'};
 if(code==='TOO_LARGE')return{access:'unreachable',evidence:'Siden er større end 2 MB',note:'Siden er for stor til det gratis tjek. Vi har derfor ikke undersøgt den. Prøv eventuelt en mindre underside.'};
 if(code==='TOO_MANY_REDIRECTS')return{access:'unreachable',evidence:'Mere end 5 viderestillinger',note:'Hjemmesiden viderestiller for mange gange. Vi har derfor ikke kunnet nå frem til selve siden.'};
 if(code==='PRIVATE_REDIRECT')return{access:'unreachable',evidence:'Viderestilling til en ikke-offentlig adresse',note:'Hjemmesiden viderestiller til en adresse, som ikke er offentlig. Af sikkerhedshensyn har vi ikke fulgt den.'};
 return{access:'unreachable',evidence:code?'Forbindelsesfejl ('+code+')':'Forbindelsesfejl',note:'Vi kunne ikke få forbindelse til hjemmesiden. Den kan være nede eller utilgængelig lige nu. Vi har derfor ikke kunnet undersøge den.'};
}
function classifyPage(page){
 const s=page.status;
 if([401,403,429,503].includes(s)){const wall=botWall(page);return{access:'blocked',evidence:'HTTP '+s+(wall?' · '+wall:''),note:(s===429?'Hjemmesiden bad os vente (HTTP 429), fordi den modtager mange besøg. ':s===503?'Hjemmesiden svarede, at den ikke er tilgængelig lige nu (HTTP 503). ':'Hjemmesiden afviste vores automatiske besøg (HTTP '+s+'). Det er ofte en sikkerhedsindstilling. ')+'Derfor har vi ikke kunnet undersøge siden, og resultatet siger ikke noget om, hvordan den klarer sig. Hvis søgemaskiner og AI-tjenester møder samme afvisning, kan det have betydning. Det kræver et kig på indstillingerne.'};}
 if(s>=400)return{access:'unreachable',evidence:'HTTP '+s,note:'Adressen svarede med fejlkode '+s+(s===404||s===410?' (siden findes ikke)':'')+'. Tjek, at adressen er rigtig. Vi har ikke kunnet undersøge indholdet.'};
 const wall=botWall(page);
 if(wall)return{access:'blocked',evidence:'HTTP '+s+' · '+wall,note:'Hjemmesiden viste en sikkerhedskontrol i stedet for indholdet. Derfor har vi ikke kunnet undersøge siden, og resultatet siger ikke noget om, hvordan den klarer sig. Hvis søgemaskiner og AI-tjenester møder samme kontrol, kan det have betydning. Det kræver et kig på indstillingerne.'};
 if(!/\btext\/html\b|application\/xhtml\+xml/i.test(page.type||''))return{access:'unreachable',evidence:'Indholdstype: '+clip(page.type||'ukendt',60),note:'Adressen viser ikke en almindelig hjemmeside (HTML), men fx en fil. Skriv adressen på din forside i stedet.'};
 return null;
}

// ---------- Check catalogue ----------
// Order here is the order in the response.
const CATALOGUE=[
 ['reachable','access','Siden kan hentes'],
 ['https','access','Sikker forbindelse (HTTPS)'],
 ['robots','access','Adgang for søgerobotter'],
 ['noindex','access','Må vises i søgeresultater'],
 ['sitemap','access','Oversigt over sider (sitemap.xml)'],
 ['title','technical','Sidetitel'],
 ['description','technical','Kort beskrivelse (metabeskrivelse)'],
 ['h1','technical','Hovedoverskrift (H1)'],
 ['lang','technical','Sprog angivet'],
 ['text','technical','Tekst uden JavaScript'],
 ['canonical','technical','Foretrukken adresse (canonical)'],
 ['schema','facts','Virksomhedsdata i koden (strukturerede data)'],
 ['contact','facts','Telefon eller e-mail på siden'],
 ['address','facts','Adresse på siden'],
 ['sameas','facts','Links til profiler i virksomhedsdata (sameAs)'],
 ['prices','services','Priser på siden'],
 ['booking','services','Vej til booking eller kontakt'],
 ['faq','answers','Svar på typiske spørgsmål'],
 ['llms','answers','llms.txt (valgfri fil)']
];
const STEP={
 https:['Skift til sikker forbindelse (HTTPS)','Browsere advarer mod sider uden HTTPS, og søgemaskiner foretrækker sikre sider.'],
 robots:['Giv søgerobotterne adgang i robots.txt','Når en søgerobot er blokeret, kan tjenesten ikke læse siden og bruge den i sine svar.'],
 noindex:['Fjern noindex, hvis siden skal kunne findes','Siden beder lige nu søgemaskiner om ikke at vise den.'],
 sitemap:['Tilføj en sitemap.xml','En oversigt over siderne gør det lettere for søgemaskiner at finde alle dine sider.'],
 title:['Skriv en tydelig sidetitel','Titlen er ofte det første, både kunder og søgetjenester ser.'],
 description:['Skriv en kort beskrivelse af siden','Beskrivelsen bruges ofte under titlen i søgeresultater.'],
 h1:['Tilføj en tydelig hovedoverskrift','Overskriften fortæller hurtigt, hvad siden handler om.'],
 lang:['Angiv sproget i sidens kode','Det hjælper søgetjenester med at forstå, at siden er på dansk.'],
 canonical:['Ret sidens canonical-adresse','Den peger på et andet domæne. Så kan søgemaskiner vise en anden side end din.'],
 text:['Gør den vigtigste tekst synlig uden JavaScript','Nogle tjenester læser kun den tekst, serveren sender. Ydelser, pris og kontakt bør stå der.'],
 schema:['Tilføj virksomhedsdata i sidens kode','Strukturerede data gør navn, adresse, telefon og åbningstider entydige for maskiner.'],
 contact:['Vis telefon eller e-mail tydeligt','Kunder og søgetjenester skal kunne se, hvordan man får fat i dig.'],
 address:['Vis adresse eller område på siden','Lokale spørgsmål som “i Aarhus” kræver, at stedet står tydeligt.'],
 prices:['Vis priser eller et prisniveau','Mange kunder spørger om pris, før de tager kontakt.'],
 booking:['Gør det let at booke eller tage kontakt','Et tydeligt næste skridt gør det let for kunden at handle.']
};

function checkPage(page,files,requested){
 const base=new URL(page.url),html=page.text,content=contentHtml(html),text=visibleText(content),sd=structuredData(html),out={};
 const set=(id,status,explain,evidence=null,fix=null,priority=null)=>{out[id]={status,explain,evidence:evidence==null?null:clip(evidence,200),fix,priority:status==='warn'?priority:null};};
 const words=text.split(/\s+/).filter(Boolean).length;

 set('reachable','ok','Siden svarede, og vi kunne læse den HTML, serveren sender.','HTTP '+page.status+' · '+base.href);

 if(base.protocol==='https:')set('https','ok','Siden bruger en sikker forbindelse.',base.href);
 else set('https','warn','Siden blev vist uden sikker forbindelse (http://). Browsere kan vise en advarsel.',base.href,'Slå HTTPS til hos din hosting-udbyder, og send http-adresser videre til https.',1);

 // robots.txt
 const r=files.robots;
 if(!r)set('robots','unknown','Vi kunne ikke hente robots.txt i tide. Derfor ved vi ikke, om søgerobotter er blokeret.');
 else if([404,410].includes(r.status))set('robots','ok','Der findes ingen robots.txt. Så er der heller ingen regler derfra, som blokerer søgerobotter.','robots.txt: HTTP '+r.status);
 else if(r.status>=400)set('robots','unknown','robots.txt svarede med fejl '+r.status+'. Derfor kan vi ikke se, hvilke regler der gælder.','robots.txt: HTTP '+r.status);
 else if(/html/i.test(r.type||'')||/<(?:html|!doctype)/i.test(r.text.slice(0,500)))set('robots','ok','Adressen /robots.txt viser en almindelig side og ikke en regelfil. Søgemaskiner læser det normalt som ingen regler.','robots.txt: HTTP '+r.status+' · '+clip(r.type||'',40));
 else{
  const blocked=robotsBlocks(r.text,base.pathname+base.search);
  if(blocked.length){const google=blocked.some(b=>b.bot==='Googlebot');set('robots','warn','robots.txt blokerer '+blocked.map(b=>b.bot).join(', ')+' fra denne side. Blokerede tjenester kan ikke læse siden.',blocked.map(b=>b.bot+': '+b.rule).join(' · '),'Tillad '+blocked.map(b=>b.bot).join(', ')+' i robots.txt. Robotter, der kun samler træningsdata (fx GPTBot), kan du stadig blokere.',google?1:2);}
  else set('robots','ok','Vi læste robots.txt. Ingen regel blokerer '+SEARCH_BOTS.join(', ')+' fra denne side. En firewall kan stadig blokere, det kan vi ikke se herfra.','robots.txt: '+r.text.split(/\r?\n/).filter(l=>l.trim()&&!l.trim().startsWith('#')).length+' linjer, ingen blokering for '+(base.pathname||'/'));
 }

 // noindex
 const metaRobots=[metaContent(html,'robots'),metaContent(html,'googlebot')].filter(Boolean).join(', '),header=String(page.headers?.['x-robots-tag']||'');
 if(/\b(?:noindex|none)\b/i.test(metaRobots))set('noindex','warn','Siden indeholder en instruks om, at søgemaskiner ikke må vise den (noindex).','<meta name="robots" content="'+metaRobots+'">','Fjern noindex, hvis siden skal kunne findes. Spørg din udvikler, hvis du er i tvivl.',1);
 else if(/\b(?:noindex|none)\b/i.test(header))set('noindex','warn','Serveren sender en instruks om, at søgemaskiner ikke må vise siden (noindex).','X-Robots-Tag: '+header,'Fjern noindex fra serverens indstillinger, hvis siden skal kunne findes.',1);
 else set('noindex','ok','Vi fandt ingen noindex-instruks i sidens kode eller svar. Om siden faktisk er i Googles indeks, er ikke undersøgt.',metaRobots?'<meta name="robots" content="'+metaRobots+'">':null);

 // sitemap
 const sm=files.sitemap;
 if(sm&&sm.ok)set('sitemap','ok','Vi fandt en sitemap.xml med en oversigt over sidens adresser.',sm.name+': '+sm.detail);
 else if(sm&&sm.missing)set('sitemap','warn','Vi fandt ingen sitemap.xml. Små sider kan godt findes uden, men filen gør det lettere for søgemaskiner at se alle sider.',sm.name+': '+sm.detail,'Tilføj en sitemap.xml. De fleste systemer som Shopify og WordPress kan lave den automatisk.',3);
 else set('sitemap','unknown','Vi kunne ikke hente sitemap.xml i tide. Derfor ved vi ikke, om den findes.',sm?.detail||null);

 // title / description / h1 / lang
 const title=visibleText((html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'');
 if(!title)set('title','warn','Siden har ingen sidetitel.',null,'Skriv en titel med ydelse, sted og navn, fx “Dameklip i Aarhus C | Salon Navn”.',2);
 else set('title','ok','Siden har en titel.'+(title.length>65?' Den er lang og kan blive forkortet i søgeresultater.':''),quote(title));
 const desc=metaContent(html,'description').trim();
 if(!desc)set('description','warn','Siden har ingen metabeskrivelse. Søgemaskiner vælger så selv en tekst fra siden.',null,'Skriv 1-2 sætninger om, hvad du tilbyder, hvor og til hvem.',3);
 else set('description','ok','Siden har en metabeskrivelse.',quote(desc));
 const h1s=[...content.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(m=>visibleText(m[1])).filter(Boolean);
 if(!h1s.length)set('h1','warn','Vi fandt ingen hovedoverskrift (H1) i sidens HTML.',null,'Tilføj én tydelig overskrift, der siger, hvad du tilbyder.',2);
 else set('h1','ok',h1s.length===1?'Siden har én hovedoverskrift.':'Siden har '+h1s.length+' hovedoverskrifter. Det er tilladt, men den første bør forklare tilbuddet.',quote(h1s[0]));
 const htmlTag=(html.match(/<html\b[^>]*>/i)||[''])[0],lang=attrs(htmlTag).lang;
 if(lang)set('lang','ok','Sidens sprog er angivet i koden.','lang="'+clip(lang,20)+'"');
 else set('lang','warn','Sidens sprog er ikke angivet i koden.',null,'Tilføj lang="da" på sidens <html>-element.',3);

 // text without JS
 const scripts=html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi)||[],scriptBytes=scripts.reduce((n,s)=>n+s.length,0);
 const noscript=(html.match(/<noscript\b[\s\S]*?<\/noscript>/gi)||[]).join(' ');
 const jsShell=/<div[^>]+id=["'](?:root|app|__next|__nuxt|___gatsby|svelte)["'][^>]*>\s*<\/div>/i.test(html)||/enable javascript|javascript (?:is )?required|aktiv[eé]r javascript|slå javascript til/i.test(noscript);
 const jsHeavy=jsShell||(scriptBytes>20000&&scriptBytes>text.length*8);
 const sample=quote(text.slice(0,120)||'(ingen tekst)');
 if(words<80&&jsHeavy)set('text','warn','Vi fandt kun cirka '+words+' ord i den HTML, serveren sender. Siden ser ud til at vise sin tekst med JavaScript. Google kan ofte læse den, men nogle AI-tjenester læser kun HTML. Det bør undersøges.',words+' ord · '+scripts.length+' scripts · '+sample,'Sørg for, at ydelser, priser og kontakt står i sidens HTML, fx med server-rendering.',2);
 else if(words<30)set('text','warn','Vi fandt kun cirka '+words+' ord i sidens HTML. Det er svært for kunder og søgetjenester at forstå tilbuddet ud fra så lidt tekst.',words+' ord · '+sample,'Beskriv med almindelige ord, hvad du tilbyder, hvor, og hvad det koster.',2);
 else if(words<80)set('text','warn','Vi fandt cirka '+words+' ord i sidens HTML. Der er plads til at forklare tilbuddet tydeligere.',words+' ord · '+sample,'Tilføj et par korte afsnit om dine ydelser, dit område og dine priser.',3);
 else set('text','ok','Vi fandt cirka '+words+' ord tekst i sidens HTML. Den kan læses uden JavaScript. Tekstens kvalitet er ikke vurderet.',words+' ord · '+sample);

 // canonical
 const canonTags=(html.match(/<link\b[^>]*>/gi)||[]).map(attrs).filter(a=>(a.rel||'').toLowerCase().split(/\s+/).includes('canonical'));
 let canonUrl=null;try{if(canonTags.length===1&&canonTags[0].href)canonUrl=new URL(canonTags[0].href,base);}catch{}
 const bare=h=>h.replace(/^www\./,'');
 if(!canonTags.length)set('canonical','info','Siden angiver ingen foretrukken adresse (canonical). Det er ikke en fejl. Det er mest relevant, hvis samme indhold findes på flere adresser.');
 else if(!canonUrl||!['http:','https:'].includes(canonUrl.protocol))set('canonical','info',canonTags.length>1?'Siden angiver flere canonical-adresser. Det bør gennemgås.':'Canonical-angivelsen kunne ikke læses som en gyldig adresse.',clip(canonTags.map(t=>t.href||'(tom)').join(' · '),160));
 else if(bare(canonUrl.hostname)!==bare(base.hostname))set('canonical','warn','Sidens canonical peger på et andet domæne. Søgemaskiner kan derfor vise den anden adresse i stedet for denne side.',canonUrl.href,'Lad canonical pege på sidens egen adresse, medmindre det andet domæne er det rigtige.',2);
 else set('canonical','ok',canonUrl.href.replace(/\/$/,'')===base.href.replace(/\/$/,'')?'Canonical peger på siden selv.':'Canonical peger på en anden side på samme domæne. Det kan være meningen, men bør gennemgås.',canonUrl.href);

 // structured data
 const businesses=sd.items.filter(x=>[].concat(x['@type']||[]).some(t=>typeof t==='string'&&t!=='Service'&&/(?:Business|Organization|Organisation|Corporation|Store|Shop|Salon|Restaurant|Service|Clinic|Dentist|Physician|Spa|Bakery|BarOrPub|Hotel)$/.test(t)));
 const fmtAddress=a=>typeof a==='string'?a:a&&typeof a==='object'?[a.streetAddress,[a.postalCode,a.addressLocality].filter(Boolean).join(' ')].filter(Boolean).join(', '):'';
 const fmtHours=b=>b.openingHours?[].concat(b.openingHours).join(', '):b.openingHoursSpecification?[].concat(b.openingHoursSpecification).length+' åbningstid(er) angivet':'';
 if(businesses.length){
  const b=businesses.find(x=>x.name)||businesses[0],fields={navn:b.name,adresse:fmtAddress(b.address),telefon:b.telephone,åbningstider:fmtHours(b),prisniveau:b.priceRange};
  const found=Object.entries(fields).filter(([,v])=>typeof v==='string'&&v.trim()),missing=Object.keys(fields).filter(k=>!found.some(([f])=>f===k));
  const evidence='@type: '+[].concat(b['@type']).join('/')+' · '+found.map(([k,v])=>k+': '+clip(v,50)).join(' · ');
  const core=fields.navn&&(fields.adresse||fields.telefon);
  if(core)set('schema','ok','Vi fandt virksomhedsdata (JSON-LD) med '+found.map(([k])=>k).join(', ')+'.'+(missing.length?' Mangler: '+missing.join(', ')+'.':'')+' Om oplysningerne er rigtige, er ikke kontrolleret.',evidence);
  else set('schema','warn','Vi fandt virksomhedsdata (JSON-LD), men '+(missing.length?missing.join(', '):'vigtige felter')+' mangler.',evidence,'Tilføj navn, adresse og telefon i de strukturerede data, så de matcher teksten på siden.',3);
 }else if(sd.invalid)set('schema','warn',sd.invalid+' blok(ke) med strukturerede data kunne ikke læses på grund af fejl i koden.',sd.invalid+' ugyldig(e) JSON-LD-blok(ke)','Ret fejlen i JSON-LD-koden, fx med Googles test for rich results.',2);
 else set('schema','warn','Vi fandt ingen virksomhedsdata (LocalBusiness eller Organization) i sidens kode. Det er ikke et krav, men det gør fakta som adresse og åbningstider entydige.',sd.types.length?'Fundne typer: '+sd.types.slice(0,5).join(', '):null,'Tilføj LocalBusiness-data med navn, adresse, telefon, åbningstider og prisniveau, som matcher teksten.',3);

 // contact: phone / e-mail
 const links=[...content.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map(m=>({...attrs(m[1]),label:visibleText(m[2])})).filter(a=>a.href);
 const telLink=links.find(a=>/^tel:/i.test(a.href)),mailLink=links.find(a=>/^mailto:/i.test(a.href));
 const phoneText=(text.match(/(?:(?:tlf|telefon|ring|mobil|phone)\.?:?\s*)(?:\+45\s?)?\d{2}\s?\d{2}\s?\d{2}\s?\d{2}(?!\d)|\+45\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{2}(?!\d)|(?<![\d.,])\d{2} \d{2} \d{2} \d{2}(?![\d.,])/i)||[])[0];
 const emailText=(text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.(?!png|jpe?g|gif|webp|svg)[a-z]{2,}\b/i)||[])[0];
 const phone=phoneText||(telLink&&decodeURIComponent(telLink.href.slice(4))),email=emailText||(mailLink&&decodeURIComponent(mailLink.href.slice(7).split('?')[0]));
 if(phone||email)set('contact','ok','Vi fandt '+[phone&&'telefon',email&&'e-mail'].filter(Boolean).join(' og ')+' på siden.',[phone&&'Telefon: '+clip(phone,30),email&&'E-mail: '+clip(email,60)].filter(Boolean).join(' · '));
 else set('contact','warn','Vi fandt ingen telefon eller e-mail i sidens tekst eller links. De kan stå på en anden underside.',null,'Vis telefon eller e-mail på forsiden, fx i bunden af siden.',2);

 // address
 const CITY=/(?:Aarhus|Århus|København|Kbh|Frederiksberg|Odense|Aalborg|Esbjerg|Randers|Kolding|Horsens|Vejle|Roskilde|Herning|Silkeborg|Viby|Risskov|Højbjerg|Brabrand|Åbyhøj|Skejby|Lystrup|Egå|Hasselager|Tilst|Skanderborg|Odder|Hinnerup|Hørning|Grenaa|Viborg|Fredericia|Næstved|Holstebro|Hellerup|Lyngby|Valby|Vanløse|Brønshøj|Amager|Nørrebro|Østerbro)/;
 const street=(text.match(/[A-ZÆØÅ][a-zæøåé]+(?:gade|vej|allé|alle|torv|plads|stræde|boulevard|vænge|parken|bakken|have|kaj|havn)\s+\d{1,4}[A-Za-z]?\b(?:,?\s*\d\.?\s*(?:sal|tv|th)\.?)?(?:,?\s*[1-9]\d{3}\s+[A-ZÆØÅ][a-zæøå]+(?:\s[A-ZÆØÅ]\b)?)?/)||[])[0];
 const postal=[...text.matchAll(/(?<![\d.,])([1-9]\d{3})\s+([A-ZÆØÅ][a-zæøå]+(?:\s[A-ZÆØÅ]\b)?)/g)].find(m=>CITY.test(m[2])||!(+m[1]>=1990&&+m[1]<=2035));
 const addr=street||postal?.[0];
 if(addr)set('address','ok','Vi fandt en adresse eller et postnummer i sidens tekst.',addr);
 else set('address','warn','Vi fandt ingen adresse eller postnummer i sidens tekst. Har du en fysisk adresse eller et fast område, bør det stå tydeligt.',null,'Skriv adresse og by, fx “Ryesgade 1, 8000 Aarhus C”, eller det område, du dækker.',2);

 // sameAs
 const sameAs=[...new Set(businesses.flatMap(b=>[].concat(b.sameAs||[])).filter(x=>typeof x==='string'&&/^https?:\/\//i.test(x)))];
 const profileLike=sameAs.filter(u=>/google\.[a-z.]+\/maps|maps\.app\.goo\.gl|g\.page|business\.google|facebook\.com|instagram\.com|linkedin\.com|tiktok\.com|youtube\.com|trustpilot\.|krak\.dk|degulesider\.dk|yelp\./i.test(u));
 if(sameAs.length)set('sameas','ok','Virksomhedsdata linker til '+sameAs.length+' profil'+(sameAs.length===1?'':'er')+' (sameAs). Om profilerne siger det samme som siden, er ikke undersøgt.',(profileLike.length?profileLike:sameAs).slice(0,3).join(' · '));
 else set('sameas','info','Vi fandt ingen sameAs-links i virksomhedsdata. Det er ikke en fejl. Links til fx Google-virksomhedsprofil eller sociale profiler kan gøre det tydeligt, at de hører til samme virksomhed.',null,'Tilføj sameAs med links til virksomhedens profiler i LocalBusiness-data.');

 // prices
 const priceRe=/(?:(?:fra|kun|pris|à)\s+)?(?<![\d.,])\d{1,3}(?:[.\s]\d{3})*(?:,\d{2}|,-)?\s?(?:kr\.?|DKK)(?![a-zæøå])|(?:kr\.?|DKK)\s?\d{1,3}(?:[.\s]\d{3})*(?:,\d{2}|,-)?|(?<![\d.,])\d{2,5},-/gi;
 const prices=[...new Set(text.match(priceRe)||[])].map(s=>s.trim());
 if(prices.length)set('prices','ok','Vi fandt '+prices.length+' prisangivelse'+(prices.length===1?'':'r')+' i sidens tekst. Om priserne er aktuelle, er ikke kontrolleret.',prices.slice(0,4).join(' · '));
 else set('prices','warn','Vi fandt ingen priser i kr. eller DKK på siden. De kan stå på en anden underside.',null,'Vis priser eller et “fra”-beløb på de vigtigste ydelser. Forklar ellers, hvordan kunden får et tilbud.',2);

 // booking / contact path
 const BOOK_HREF=/book|reserv|bestil|calendly|planway|simplybook|booksalon|fresha|treatwell|easytable|dinnerbooking|onlinebooq|timma|bookingkit|superb|tablebooker|setmore|acuity/i;
 const BOOK_TEXT=/\bbook|bestil|reserv|ledige tider|tidsbestilling|køb\b/i;
 const CONTACT=/kontakt|contact|skriv til|send en besked|ring til/i;
 const booking=links.find(a=>BOOK_TEXT.test(a.label)||BOOK_HREF.test(a.href)),contactLink=links.find(a=>CONTACT.test(a.label)||CONTACT.test(a.href))||telLink||mailLink;
 const form=/<form\b[\s\S]*?<(?:textarea|input[^>]+type=["']?email)/i.test(content);
 const showLink=a=>quote(a.label||a.href)+' → '+clip(a.href,80);
 if(booking)set('booking','ok','Vi fandt et link til booking eller bestilling.',showLink(booking));
 else if(contactLink||form)set('booking','ok','Vi fandt ingen bookingknap, men '+(contactLink?'et kontaktlink':'en kontaktformular')+'.',contactLink?showLink(contactLink):'Kontaktformular på siden');
 else set('booking','warn','Vi fandt ingen bookingknap, kontaktlink eller formular på siden.',null,'Tilføj en tydelig knap som “Book tid” eller “Kontakt os” højt på siden.',2);

 // FAQ (info only)
 const questions=[...new Set([...content.matchAll(/<(?:summary|h[2-4]|dt)\b[^>]*>([\s\S]*?)<\/(?:summary|h[2-4]|dt)>/gi)].map(m=>visibleText(m[1])).filter(t=>/\?$/.test(t)&&t.length>=8&&t.length<=200))];
 const faqPage=sd.types.includes('FAQPage');
 if(questions.length||faqPage)set('faq','info','Vi fandt '+(questions.length?questions.length+' spørgsmål som overskrifter':'')+(questions.length&&faqPage?' og ':'')+(faqPage?'FAQ-data i koden':'')+'. Svarenes kvalitet er ikke vurderet.',questions.length?questions.slice(0,2).map(quote).join(' · '):'@type: FAQPage');
 else set('faq','info','Vi fandt ingen tydelige spørgsmål og svar på siden. Det er ikke en fejl. Svar på typiske kundespørgsmål, fx om pris og booking, kan gøre siden mere nyttig. Det kræver en vurdering af din side.',null,'Overvej korte svar på de spørgsmål, kunderne oftest stiller.');

 // llms.txt (info only)
 const l=files.llms;
 if(l&&l.status===200&&!/html/i.test(l.type||'')&&l.text.trim())set('llms','info','Vi fandt en llms.txt-fil. Den er et frivilligt forslag og ikke en anerkendt standard. Google bruger den ikke, og den giver ingen garanti for omtale i AI-svar.',quote(l.text.split(/\r?\n/).find(x=>x.trim())||''));
 else set('llms','info','Vi fandt ingen llms.txt-fil. Det er ikke en fejl. Filen er et frivilligt forslag og ikke en anerkendt standard, og Google bruger den ikke.',l?'llms.txt: HTTP '+l.status:null,null);

 return out;
}

function buildResult({requested,started,access,note,accessEvidence,page,files,checks}){
 const list=CATALOGUE.map(([id,group,title])=>{
  const c=checks?.[id];
  if(c)return{id,group,title,status:c.status,explain:c.explain,evidence:c.evidence,fix:c.fix,priority:c.priority};
  if(id==='reachable')return{id,group,title,status:'unknown',explain:note,evidence:accessEvidence||null,fix:null,priority:null};
  return{id,group,title,status:'unknown',explain:'Ikke undersøgt, fordi vi ikke fik adgang til siden.',evidence:null,fix:null,priority:null};
 });
 const summary={found:0,improve:0,unknown:0,general:0};
 for(const c of list)summary[{ok:'found',warn:'improve',unknown:'unknown',info:'general'}[c.status]]++;
 const order=Object.fromEntries(CATALOGUE.map(([id],i)=>[id,i]));
 const nextSteps=list.filter(c=>c.status==='warn'&&STEP[c.id]).sort((a,b)=>a.priority-b.priority||order[a.id]-order[b.id]).slice(0,3).map(c=>({title:STEP[c.id][0],why:STEP[c.id][1]}));
 const notChecked=[...NOT_CHECKED];
 if(access!=='ok')notChecked.splice(1,0,'Selve siden og dens filer, fordi vi ikke fik adgang.');
 else for(const [name,f] of Object.entries(files||{}))if(!f||(name==='sitemap'&&!f.ok&&!f.missing))notChecked.push(name==='sitemap'?'sitemap.xml (svarede ikke i tide)':name+'.txt (svarede ikke i tide)');
 const filesChecked=[];
 if(files?.robots)filesChecked.push('robots.txt');
 if(files?.sitemap&&(files.sitemap.ok||files.sitemap.missing))filesChecked.push(files.sitemap.name);
 if(files?.llms)filesChecked.push('llms.txt');
 return{
  version:VERSION,checkedAt:new Date(started).toISOString(),access,accessNote:access==='ok'?null:note,
  scope:{requestedUrl:requested,finalUrl:page?.url||null,pagesChecked:page?[{url:page.url,status:page.status}]:[],filesChecked,durationMs:Date.now()-started,notChecked},
  summary,checks:list,nextSteps,method:METHOD,sources:SOURCES
 };
}

async function analyse(input,options={}){
 const started=Date.now(),start=normalizeUrl(input),requested=start.href;
 const fetchPage=options.fetchPage||((url,o={})=>safeFetch(url,{...options.fetchOptions,...o}));
 let page;
 try{page=await fetchPage(requested,{timeoutMs:options.pageTimeoutMs||PAGE_TIMEOUT_MS});}
 catch(e){
  if(e?.code==='INVALID_URL')throw e;
  const f=classifyFailure(e,requested);return buildResult({requested,started,access:f.access,note:f.note,accessEvidence:f.evidence,page:null});
 }
 const blocked=classifyPage(page);
 if(blocked)return buildResult({requested,started,access:blocked.access,note:blocked.note,accessEvidence:blocked.evidence,page});
 const base=new URL(page.url);
 const aux=async path=>{try{return await fetchPage(new URL(path,base).href,{timeoutMs:FILE_TIMEOUT_MS});}catch{return null;}};
 const [robots,llms,sitemapRaw]=await Promise.all([aux('/robots.txt'),aux('/llms.txt'),aux('/sitemap.xml')]);
 const readSitemap=(res,name)=>{
  if(!res)return null;
  const isXml=res.status===200&&/<(?:urlset|sitemapindex)\b/i.test(res.text.slice(0,5000));
  if(isXml){const index=/<sitemapindex\b/i.test(res.text),n=(res.text.match(/<loc>/gi)||[]).length;return{ok:true,name,detail:index?'oversigt med '+n+' under-sitemaps':n+' adresser'};}
  return{missing:res.status<500&&![401,403,429].includes(res.status),name,detail:'HTTP '+res.status+(res.status===200?' (ikke en sitemap-fil)':'')};
 };
 let sitemap=readSitemap(sitemapRaw,'sitemap.xml');
 if(!(sitemap&&sitemap.ok)&&robots&&robots.status===200){
  const listed=sitemapLines(robots.text).map(s=>{try{return new URL(s,base);}catch{return null;}}).find(u=>u&&u.hostname.replace(/^www\./,'')===base.hostname.replace(/^www\./,'')&&u.pathname!=='/sitemap.xml');
  if(listed){const alt=readSitemap(await aux(listed.href),listed.pathname.replace(/^\//,''));if(alt&&(alt.ok||!sitemap))sitemap=alt;}
 }
 const files={robots,sitemap,llms};
 const checks=checkPage(page,files,requested);
 return buildResult({requested,started,access:'ok',note:null,page,files,checks});
}

function publicError(e){return e?.code==='INVALID_URL'?e.message:'Tjekket kunne ikke gennemføres lige nu. Prøv igen om lidt.';}
async function handler(req,res,options={}){
 res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
 if(!['POST','GET'].includes(req.method)){res.statusCode=405;res.setHeader('Allow','GET, POST, OPTIONS');return res.end(JSON.stringify({error:'Metoden er ikke tilladt.'}));}
 let url;
 try{const b=req.method==='POST'?(typeof req.body==='object'&&req.body?req.body:JSON.parse(req.body||'{}')):{url:new URL(req.url,'http://local').searchParams.get('url')};url=b?.url;}
 catch{res.statusCode=400;return res.end(JSON.stringify({error:'Forespørgslen kunne ikke læses. Prøv igen.'}));}
 try{const result=await analyse(url,options);res.statusCode=200;res.end(JSON.stringify(result));}
 catch(e){if(e?.code==='INVALID_URL'){res.statusCode=400;}else{res.statusCode=503;res.setHeader('Retry-After','30');console.error('check failed',e);}res.end(JSON.stringify({error:publicError(e)}));}
}
module.exports=handler;
Object.assign(module.exports,{analyse,normalizeUrl,isPublicIp,parseRobots,robotsBlocks,safeFetch,visibleText,metaContent,structuredData,botWall,CheckError,VERSION});
