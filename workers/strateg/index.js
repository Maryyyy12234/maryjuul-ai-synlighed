'use strict';
// Worker 2: GEO-strateg. Rule-based baseline always; optional AI refinement.
const KINDS=['observeret','vurdering','kræver mere viden'];

const RULES={
 https:{change:'Skift hjemmesiden til sikker forbindelse (HTTPS), og send http-adresser videre til https.',why:'Browsere advarer mod sider uden HTTPS. Søgemaskiner foretrækker sikre sider.',needs:'Adgang til hosting eller domæneudbyder.'},
 robots:{change:'Ret robots.txt, så de blokerede søgerobotter får adgang til siden.',why:'En blokeret søgerobot kan ikke læse siden og kan derfor ikke bruge den i sine svar.',needs:'Adgang til hjemmesidens indstillinger eller til den, der driver siden.'},
 noindex:{change:'Fjern noindex-instruksen, hvis siden skal kunne findes.',why:'Siden beder i dag søgemaskiner om ikke at vise den.',needs:'Bekræftelse på, at siden skal være offentlig, og adgang til CMS.'},
 sitemap:{change:'Tilføj en sitemap.xml med sidens vigtigste adresser.',why:'En oversigt gør det lettere for søgemaskiner at finde alle sider.',needs:'Adgang til CMS.'},
 title:{change:'Skriv en sidetitel med ydelse, sted og navn.',why:'Titlen er ofte det første, både kunder og søgetjenester ser.',needs:'Adgang til CMS.'},
 description:{change:'Skriv en kort metabeskrivelse om ydelse, sted og næste skridt.',why:'Beskrivelsen bruges ofte under titlen i søgeresultater.',needs:'Adgang til CMS.'},
 h1:{change:'Tilføj én tydelig hovedoverskrift, der siger, hvad virksomheden tilbyder.',why:'Overskriften fortæller hurtigt, hvad siden handler om.',needs:'Adgang til CMS.'},
 lang:{change:'Angiv dansk som sidens sprog i koden (lang="da").',why:'Det hjælper søgetjenester med at forstå sproget.',needs:'Adgang til temaet eller en udvikler.'},
 text:{change:'Sørg for, at ydelser, priser og kontakt står i sidens HTML og ikke kun vises med JavaScript.',why:'Nogle tjenester læser kun den tekst, serveren sender.',needs:'Adgang til hjemmesidens opsætning eller en udvikler.'},
 schema:{change:'Tilføj eller ret virksomhedsdata (LocalBusiness) med navn, adresse, telefon og åbningstider.',why:'Strukturerede data gør fakta entydige for maskiner, når de matcher teksten.',needs:'Bekræftede virksomhedsoplysninger og adgang til temaet.'},
 contact:{change:'Vis telefon eller e-mail tydeligt på forsiden.',why:'Kunder og søgetjenester skal kunne se, hvordan man får fat i virksomheden.',needs:'Den telefon eller e-mail, der må vises offentligt.'},
 address:{change:'Skriv adresse og by, eller det område virksomheden dækker, på forsiden.',why:'Lokale spørgsmål kræver, at stedet står tydeligt.',needs:'Adresse eller område.'},
 prices:{change:'Vis priser eller fra-priser på de vigtigste ydelser.',why:'Mange kunder spørger om pris, før de tager kontakt.',needs:'Aktuelle priser fra kunden.'},
 booking:{change:'Tilføj en tydelig knap til booking eller kontakt højt på siden.',why:'Et klart næste skridt gør det let for kunden at handle.',needs:'Link til bookingsystem eller den foretrukne kontaktvej.'}
};
const FILLERS=[
 {id:'faq',when:c=>c,rec:{change:'Overvej korte svar på de spørgsmål, kunderne oftest stiller, fx om pris, sted og booking.',basedOn:['faq'],why:'Det er en faglig vurdering: svar på typiske spørgsmål kan gøre siden mere nyttig. Det er ikke en fejl, at de mangler.',needsFromClient:'De spørgsmål, kunderne faktisk stiller.',kind:'vurdering'}},
 {id:'consistency',when:(c,check)=>['schema','contact','address'].some(id=>check.checks.find(x=>x.id===id)?.status==='ok'),rec:check=>({change:'Kontrollér, at navn, adresse, telefon og åbningstider er ens på hjemmesiden, Google-profilen og andre profiler.',basedOn:['schema','contact','address'].filter(id=>check.checks.find(x=>x.id===id)?.status==='ok'),why:'Tjekket har kun set denne side. Ens oplysninger på tværs af steder kræver en særskilt gennemgang.',needsFromClient:'Links til virksomhedens profiler.',kind:'kræver mere viden'})}
];

function suggestedQuestions(facts){
 const service=facts?.service||'[ydelse]',city=facts?.city||'[by]';
 return{label:'Forslag til en senere AI-test. Spørgsmålene er ikke afprøvet.',questions:[`Hvor kan jeg få ${service.toLowerCase()} i ${city}?`,`Hvad koster ${service.toLowerCase()} i ${city}?`,`Hvilke steder i ${city} kan du anbefale til ${service.toLowerCase()}, og hvorfor?`]};
}

function baseline(check,facts){
 if(check.access!=='ok')return{recommendations:[{id:'r1',change:'Undersøg, hvorfor tjekket ikke fik adgang til siden, og kør tjekket igen.',basedOn:['reachable'],why:check.accessNote||'Siden kunne ikke undersøges.',needsFromClient:'Oplysning om sikkerhedsindstillinger, firewall eller hosting.',kind:'kræver mere viden'}],aiTest:null};
 const order=Object.fromEntries(check.checks.map((c,i)=>[c.id,i]));
 const warns=check.checks.filter(c=>c.status==='warn'&&RULES[c.id]).sort((a,b)=>a.priority-b.priority||order[a.id]-order[b.id]);
 const recs=warns.slice(0,5).map(c=>({change:RULES[c.id].change,basedOn:[c.id],why:RULES[c.id].why,needsFromClient:RULES[c.id].needs,kind:'observeret'}));
 for(const f of FILLERS){if(recs.length>=3)break;const c=check.checks.find(x=>x.id===f.id);if(f.id==='faq'&&c&&/ingen tydelige spørgsmål/.test(c.explain))recs.push({...f.rec});else if(f.id==='consistency'&&f.when(c,check))recs.push(f.rec(check));}
 return{recommendations:recs.map((r,i)=>({id:'r'+(i+1),...r})),aiTest:suggestedQuestions(facts)};
}

function validate(data,check){
 const ids=new Set(check.checks.map(c=>c.id)),recs=data?.recommendations;
 if(!Array.isArray(recs)||recs.length<1||recs.length>5)return 'recommendations skal være 1-5';
 for(const r of recs){
  if(!r||typeof r.change!=='string'||typeof r.why!=='string'||typeof r.needsFromClient!=='string')return 'mangler felter';
  if(!KINDS.includes(r.kind))return 'ugyldig kind';
  if(!Array.isArray(r.basedOn)||!r.basedOn.length||!r.basedOn.every(id=>ids.has(id)))return 'basedOn skal pege på eksisterende fund';
 }
 return null;
}

async function run(job,ctx={}){
 const {check,facts}=job.results.tjekker;
 const base=baseline(check,facts),notes=[];
 let recommendations=base.recommendations,source='regler';
 if(ctx.ai&&check.access==='ok'){
  const r=await ctx.ai.callJson(job,{role:'GEO-strateg',task:'Forbedr formuleringen og prioriteringen af anbefalingerne ud fra fundene. Behold 3-5 anbefalinger. Hver anbefaling skal have {change, basedOn:[fund-id], why, needsFromClient, kind:"observeret"|"vurdering"|"kræver mere viden"}. "observeret" må kun bruges om fund med status warn. Opfind ikke konkurrenter eller kunders søgeadfærd. Svar som {"recommendations":[...]}.',content:{fund:check.checks.map(({id,status,explain,evidence})=>({id,status,explain,evidence})),grundforslag:recommendations},validate:d=>validate(d,check)});
  if(r.ok){recommendations=r.data.recommendations.map((x,i)=>({id:'r'+(i+1),change:x.change,basedOn:x.basedOn,why:x.why,needsFromClient:x.needsFromClient,kind:x.kind}));source='ai';}
  else notes.push({aiFailed:true,text:'AI-trin fejlede ('+r.error+'). Regelbaserede anbefalinger bruges.'});
 }
 return{recommendations,aiTest:base.aiTest,source,notes};
}
// Revision after kontrol: drop or rebuild failing items from the baseline.
function revise(job,issues){
 const {check,facts}=job.results.tjekker,base=baseline(check,facts).recommendations,bad=new Set(issues.map(i=>i.itemId));
 const kept=job.results.strateg.recommendations.filter(r=>!bad.has(r.id));
 const recs=kept.length>=Math.min(3,base.length)?kept:base;
 return{...job.results.strateg,recommendations:recs.map((r,i)=>({...r,id:'r'+(i+1)})),source:job.results.strateg.source+'+revision'};
}
module.exports={role:'strateg',label:'Prioriterer forbedringer',run,revise,baseline,validate,KINDS};
