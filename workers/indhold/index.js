'use strict';
// Worker 3: Indholdsworker. Drafts only. Missing facts become [UDFYLD: ...].
// Without AI: templated drafts built only from observed facts.
const TYPES=['intro','service','faq','title_meta','cta','before_after'];
const U=s=>'[UDFYLD: '+s+']';
const placeholders=text=>(String(text).match(/\[UDFYLD:[^\]]*\]/g)||[]);

function templates(facts){
 const f=facts||{},name=f.name||U('virksomhedens navn'),city=f.city||U('by eller område'),service=f.service||U('jeres vigtigste ydelse');
 const lc=s=>s.startsWith('[')?s:s.charAt(0).toLowerCase()+s.slice(1);
 const price=f.prices?.[0]?f.prices[0].replace(/^(?:fra|kun|pris|à)\s+/i,'').replace(/\.$/,''):null;
 const href=f.booking?.href||'',next=f.booking?.isBooking?'Book tid direkte på siden.':/^mailto:/i.test(href)?'Skriv til os på e-mail.':/^tel:/i.test(href)?'Ring til os.':f.booking?'Kontakt os via kontaktsiden.':U('hvordan kunden booker eller kontakter jer');
 const DAYS={Mo:'man',Tu:'tir',We:'ons',Th:'tor',Fr:'fre',Sa:'lør',Su:'søn'},hours=f.hours?f.hours.replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su)\b/g,d=>DAYS[d]).replace(/-(?=[a-zæøå]{3}\b)/g,'–'):null;
 const priceLine=price?'Pris fundet på siden: '+price+'. '+U('tjek, hvilken ydelse prisen gælder, og hvad den dækker'):U('pris eller fra-pris');
 const drafts=[
  {type:'title_meta',label:'Sidetitel og metabeskrivelse',basedOn:['title','description'],text:`Titel: ${service} i ${city} | ${name}\nBeskrivelse: ${name} tilbyder ${lc(service)} i ${city}. ${price?'Se priser og '+(f.booking?.isBooking?'book tid':'kontakt')+' på siden.':U('fra-pris, hvis den må vises')}`},
  {type:'intro',label:'Introduktion til forsiden',basedOn:['h1','text','address'],text:`${name} tilbyder ${lc(service)} i ${city}. Vi hjælper ${U('målgruppe, fx travle forældre eller studerende')} med ${U('det kunden får ud af besøget')}. ${f.address?'Du finder os på '+f.address+'.':U('adresse eller område')}`},
  {type:'service',label:'Beskrivelse af en ydelse',basedOn:['prices'],text:`${service}\n${U('hvad kunden får, i 1-2 sætninger')}\n${priceLine}\n${U('varighed eller praktiske forhold, hvis relevant')}`},
  {type:'faq',label:'Spørgsmål og svar',basedOn:['faq','prices','address','booking'],text:[
   `Hvad koster ${lc(service)}?\n${priceLine}`,
   `Hvor ligger I?\n${f.address?'Du finder os på '+f.address+'.':U('adresse eller område')}`,
   `Hvornår har I åbent?\n${hours?'Åbningstider: '+hours+'.':U('åbningstider')}`,
   `Hvordan booker jeg?\n${next}`].join('\n\n')},
  {type:'cta',label:'Knaptekst og næste skridt',basedOn:['booking'],text:f.booking?.isBooking?'Knap: Book tid\nUnder knappen: Vælg en ledig tid. Det tager under et minut.':f.booking?(/^mailto:/i.test(href)?'Knap: Skriv til os':/^tel:/i.test(href)?'Knap: Ring til os':'Knap: Kontakt os')+'\nUnder knappen: '+U('hvor hurtigt I svarer, hvis I kan love det'):'Knap: '+U('Book tid eller Kontakt os')+'\nUnder knappen: '+U('hvad der sker, når kunden klikker')},
  {type:'before_after',label:'Før/efter: hovedoverskrift',basedOn:['h1','title'],before:f.h1||f.title||null,text:`${service} i ${city}. ${next}`}
 ];
 return drafts.map((d,i)=>({id:'d'+(i+1),...d,placeholders:placeholders(d.text)}));
}

function validate(data){
 const d=data?.drafts;
 if(!Array.isArray(d)||!d.length||d.length>8)return 'drafts skal være 1-8';
 for(const x of d){if(!x||!TYPES.includes(x.type)||typeof x.text!=='string'||typeof x.label!=='string'||!Array.isArray(x.basedOn))return 'ugyldigt udkast';if(x.before!=null&&typeof x.before!=='string')return 'ugyldigt før-felt';}
 return null;
}
const normalize=(list,facts)=>list.map((x,i)=>{const before=x.type==='before_after'?(facts?.h1||facts?.title||null):undefined;return{id:'d'+(i+1),type:x.type,label:x.label,basedOn:x.basedOn,...(x.type==='before_after'?{before}:{}),text:x.text,placeholders:placeholders(x.text)};});

const TASK='Skriv kladder til kundens hjemmeside ud fra planen og de observerede fakta. Typer: intro, service, faq, title_meta, cta, before_after. Brug kun fakta fra "fakta". Alt andet skrives som [UDFYLD: ...]. Ingen tal, priser, åbningstider, erfaring, anmeldelser, certificeringer eller leveringstider, som ikke står i fakta. Ingen garantier eller superlativer. Svar som {"drafts":[{type,label,basedOn:[fund-id],text}]}.';

async function run(job,ctx={}){
 const {check,facts}=job.results.tjekker;
 if(check.access!=='ok')return{skipped:true,drafts:[],source:'ingen',notes:[{text:'Ingen tekstforslag, fordi siden ikke kunne undersøges.'}]};
 let drafts=templates(facts),source='skabeloner';const notes=[];
 if(ctx.ai){
  const r=await ctx.ai.callJson(job,{role:'Indholdsworker',task:TASK,content:{plan:job.results.strateg.recommendations,fakta:facts,eksisterendeTekst:{titel:facts.title,overskrift:facts.h1,beskrivelse:facts.description}},validate});
  if(r.ok){drafts=normalize(r.data.drafts,facts);source='ai';}
  else notes.push({aiFailed:true,text:'AI-trin fejlede ('+r.error+'). Skabelon-tekster bruges.'});
 }
 return{drafts,source,notes};
}

// Revision after kontrol. Uses AI when available; otherwise (or when AI fails)
// a deterministic fix replaces the offending parts with [UDFYLD: ...].
function ruleFix(draft,issues){
 let text=draft.text;
 for(const i of issues){
  if(i.rule==='invented_number')for(const t of i.tokens||[])text=text.replace(new RegExp('(^|[^\\d\\[])'+t+'(?![\\d])','g'),(m,p)=>p+U('tal fra kunden'));
  if(i.rule==='banned_phrase')for(const t of i.tokens||[])text=text.replace(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'),U('formulering uden løfter'));
  if(i.rule==='invented_contact')for(const t of i.tokens||[])text=text.split(t).join(U('kontaktoplysning fra kunden'));
 }
 return{...draft,text,placeholders:placeholders(text)};
}
async function revise(job,issues,ctx={}){
 const current=job.results.indhold,notes=[...(current.notes||[])];
 if(ctx.ai){
  const r=await ctx.ai.callJson(job,{role:'Indholdsworker (rettelse)',task:TASK+' Ret disse fejl fra kvalitetskontrollen: '+JSON.stringify(issues.map(({itemId,rule,reason})=>({itemId,rule,reason}))),content:{kladder:current.drafts,fakta:job.results.tjekker.facts},validate});
  if(r.ok)return{...current,drafts:normalize(r.data.drafts,job.results.tjekker.facts),source:'ai+revision',notes};
  notes.push({aiFailed:true,text:'AI-rettelse fejlede ('+r.error+'). Fejlene er rettet med faste regler.'});
 }
 return{...current,drafts:current.drafts.map(d=>ruleFix(d,issues.filter(i=>i.itemId===d.id))),source:current.source+'+regelrettelse',notes};
}
module.exports={role:'indhold',label:'Skriver tekstforslag',run,revise,ruleFix,templates,validate,placeholders,TYPES};
