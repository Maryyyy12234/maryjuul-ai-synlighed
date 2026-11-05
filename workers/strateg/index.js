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
 canonical:{change:'Lad sidens canonical pege på sidens egen adresse.',why:'En canonical til et andet domæne kan få søgemaskiner til at vise en anden side.',needs:'Adgang til temaet eller CMS.'},
 booking:{change:'Tilføj en tydelig knap til booking eller kontakt højt på siden.',why:'Et klart næste skridt gør det let for kunden at handle.',needs:'Link til bookingsystem eller den foretrukne kontaktvej.'}
};
// Rank = kommerciel konsekvens × faktuel sikkerhed ÷ indsats (GEO-principper.md, punkt 9). Each 1-3.
const CONSEQUENCE={noindex:3,robots:3,https:2,prices:3,booking:3,contact:3,address:2,text:3,title:2,h1:2,description:1,schema:1,sitemap:1,lang:1,canonical:2,faq:2,sameas:1,reachable:3};
const EFFORT={noindex:1,robots:1,https:2,prices:1,booking:1,contact:1,address:1,text:3,title:1,h1:1,description:1,schema:2,sitemap:1,lang:1,canonical:1,faq:2,sameas:1,reachable:2};
const CERTAINTY={observeret:3,vurdering:2,'kræver mere viden':1};
const RANK_NOTE='Rækkefølgen er beregnet som kommerciel konsekvens × faktuel sikkerhed ÷ indsats (hver vurderet 1-3). Konsekvens og indsats er MARY JUULs faste skøn pr. type fund, ikke en måling.';
function rank(r){const id=r.basedOn?.[0],consequence=CONSEQUENCE[id]||2,effort=EFFORT[id]||2,certainty=CERTAINTY[r.kind]||1;return{...r,rank:{consequence,certainty,effort,value:Math.round(consequence*certainty/effort*100)/100}};}
const ranked=recs=>recs.map(rank).sort((a,b)=>b.rank.value-a.rank.value);
const offsite=check=>({change:'Kontrollér, at Google-virksomhedsprofil, kataloger og sociale profiler har samme navn, adresse, telefon, priser og åbningstider som hjemmesiden. Ret fejl ved kilden.',basedOn:[['schema','contact','address','sameas'].find(id=>check.checks.find(x=>x.id===id)?.status==='ok')||'sameas'],why:'AI-tjenester og søgemaskiner bruger også oplysninger fra andre steder end hjemmesiden. Tjekket har ikke set de profiler.',needsFromClient:'Links til virksomhedens profiler og adgang til Google-virksomhedsprofilen.',kind:'kræver mere viden'});
const FILLERS=[
 {id:'faq',when:c=>c,rec:{change:'Overvej korte svar på de spørgsmål, kunderne oftest stiller, fx om pris, sted og booking.',basedOn:['faq'],why:'Det er en faglig vurdering: svar på typiske spørgsmål kan gøre siden mere nyttig. Det er ikke en fejl, at de mangler.',needsFromClient:'De spørgsmål, kunderne faktisk stiller.',kind:'vurdering'}}
];

function suggestedQuestions(facts){
 const service=facts?.service||'[ydelse]',city=facts?.city||'[by]';
 return{label:'Forslag til en senere AI-test. Spørgsmålene er ikke afprøvet.',questions:[`Hvor kan jeg få ${service.toLowerCase()} i ${city}?`,`Hvad koster ${service.toLowerCase()} i ${city}?`,`Hvilke steder i ${city} kan du anbefale til ${service.toLowerCase()}, og hvorfor?`]};
}

function baseline(check,facts){
 if(check.access!=='ok')return{recommendations:[{id:'r1',change:'Undersøg, hvorfor tjekket ikke fik adgang til siden, og kør tjekket igen.',basedOn:['reachable'],why:check.accessNote||'Siden kunne ikke undersøges.',needsFromClient:'Oplysning om sikkerhedsindstillinger, firewall eller hosting.',kind:'kræver mere viden'}],aiTest:null};
 const order=Object.fromEntries(check.checks.map((c,i)=>[c.id,i]));
 const warns=check.checks.filter(c=>c.status==='warn'&&RULES[c.id]).sort((a,b)=>a.priority-b.priority||order[a.id]-order[b.id]);
 let recs=ranked(warns.map(c=>({change:RULES[c.id].change,basedOn:[c.id],why:RULES[c.id].why,needsFromClient:RULES[c.id].needs,kind:'observeret'}))).slice(0,4);
 const faq=check.checks.find(x=>x.id==='faq');
 if(recs.length<4&&faq&&/ingen tydelige spørgsmål/.test(faq.explain))recs.push(rank({...FILLERS[0].rec}));
 recs.push(rank(offsite(check)));
 return{recommendations:recs.map((r,i)=>({id:'r'+(i+1),...r})),aiTest:suggestedQuestions(facts),rankNote:RANK_NOTE};
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
  const r=await ctx.ai.callJson(job,{role:'GEO-strateg',task:'Forbedr formuleringen og prioriteringen af anbefalingerne ud fra fundene. Behold 3-5 anbefalinger, og behold anbefalingen om ens oplysninger på Google-virksomhedsprofil og kataloger (kind \"kræver mere viden\"). Hver anbefaling skal have {change, basedOn:[fund-id], why, needsFromClient, kind:"observeret"|"vurdering"|"kræver mere viden"}. "observeret" må kun bruges om fund med status warn. Opfind ikke konkurrenter eller kunders søgeadfærd. Svar som {"recommendations":[...]}.',content:{fund:check.checks.map(({id,status,explain,evidence})=>({id,status,explain,evidence})),grundforslag:recommendations},validate:d=>validate(d,check)});
  if(r.ok){recommendations=ranked(r.data.recommendations.map(x=>({change:x.change,basedOn:x.basedOn,why:x.why,needsFromClient:x.needsFromClient,kind:x.kind}))).map((x,i)=>({id:'r'+(i+1),...x}));source='ai';}
  else notes.push({aiFailed:true,text:'AI-trin fejlede ('+r.error+'). Regelbaserede anbefalinger bruges.'});
 }
 return{recommendations,aiTest:base.aiTest,rankNote:RANK_NOTE,source,notes};
}
// Revision after kontrol: drop or rebuild failing items from the baseline.
function revise(job,issues){
 const {check,facts}=job.results.tjekker,base=baseline(check,facts).recommendations,bad=new Set(issues.map(i=>i.itemId));
 const kept=job.results.strateg.recommendations.filter(r=>!bad.has(r.id));
 const recs=kept.length>=Math.min(3,base.length)?kept:base;
 return{...job.results.strateg,recommendations:recs.map((r,i)=>({...r,id:'r'+(i+1)})),source:job.results.strateg.source+'+revision'};
}
module.exports={RANK_NOTE,rank,role:'strateg',label:'Prioriterer forbedringer',run,revise,baseline,validate,KINDS};
