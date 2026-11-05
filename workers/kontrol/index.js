'use strict';
// Worker 4: Kvalitetskontrol. Fixed rules decide. An optional, separate AI review
// can only ADD points for human review; it can never approve anything.
const BANNED=[
 [/garant\w*/gi,'løfte om garanti'],[/\bnr\.?\s?1\b|\bnummer [ée]n\b|\bførsteplads\w*/gi,'løfte om placering'],[/\baltid\b/gi,'absolut påstand (“altid”)'],
 [/\b100\s?%/g,'absolut påstand (100 %)'],[/\bbedste i\b|\bmarkedets bedste\b|\bførende\b/gi,'udokumenteret superlativ'],
 [/\b(?:nævnt|anbefalet|vist|øverst|synlig)\s+i\s+(?:chatgpt|gemini|perplexity|copilot|claude|ai-svar|ai-tjenester)\b/gi,'løfte om AI-omtale'],[/\b(?:øverst|først)\s+(?:i|på)\s+google\b/gi,'løfte om placering']
];
const KIND_OBSERVED='observeret';
const strip=t=>String(t||'').replace(/\[UDFYLD:[^\]]*\]/g,' ');
const digits=s=>new Set(String(s||'').match(/\d+/g)||[]);

function bannedIn(text){const hits=[];for(const [re,why] of BANNED){for(const m of strip(text).matchAll(re))hits.push({token:m[0],why});}return hits;}

function rules(job){
 const {check}=job.results.tjekker,ids=new Map(check.checks.map(c=>[c.id,c]));
 const recs=job.results.strateg?.recommendations||[],drafts=job.results.indhold?.drafts||[];
 const issues=[],warnings=[];
 if(!recs.length)issues.push({target:'strateg',itemId:null,rule:'no_recommendations',reason:'Der er ingen anbefalinger. Kunden mangler et næste skridt.'});
 if(recs.length>5)issues.push({target:'strateg',itemId:null,rule:'too_many',reason:'Der må højst være 5 anbefalinger.'});
 if(check.access==='ok'&&recs.length&&recs.length<3)warnings.push('Kun '+recs.length+' anbefaling(er). Fundene giver ikke grundlag for flere.');
 for(const r of recs){
  const missing=(r.basedOn||[]).filter(id=>!ids.has(id));
  if(!r.basedOn?.length||missing.length)issues.push({target:'strateg',itemId:r.id,rule:'unknown_basis',reason:'Anbefalingen henviser ikke til et eksisterende fund'+(missing.length?' ('+missing.join(', ')+')':'')+'.'});
  else if(r.kind===KIND_OBSERVED){const notWarn=r.basedOn.filter(id=>ids.get(id).status!=='warn');if(notWarn.length)issues.push({target:'strateg',itemId:r.id,rule:'advice_as_finding',reason:'Anbefalingen er mærket som observeret problem, men fundet ('+notWarn.map(id=>id+': '+ids.get(id).status).join(', ')+') er ikke et dokumenteret problem.'});}
  for(const h of bannedIn(r.change+' '+r.why))issues.push({target:'strateg',itemId:r.id,rule:'banned_phrase',tokens:[h.token],reason:'Formuleringen “'+h.token+'” er et '+h.why+', som grundlaget ikke dækker.'});
  if(String(r.change).length>300)issues.push({target:'strateg',itemId:r.id,rule:'too_long',reason:'Anbefalingen er for lang til at være let at forstå.'});
 }
 // Facts corpus = only what the check actually observed on the page.
 const evidence=check.checks.map(c=>c.evidence||'').join(' \n ');
 const known=digits(evidence),lowerEvidence=evidence.toLowerCase();
 for(const d of drafts){
  const text=strip(d.text);
  const invented=[...digits(text)].filter(n=>!known.has(n));
  if(invented.length)issues.push({target:'indhold',itemId:d.id,rule:'invented_number',tokens:invented,reason:'Tekstforslaget indeholder tal ('+invented.join(', ')+'), som ikke står i det, tjekket fandt på siden. Priser og tal må ikke opfindes.'});
  const contacts=[...(text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+|https?:\/\/[^\s)]+/gi)||[])].filter(x=>!lowerEvidence.includes(x.toLowerCase()));
  if(contacts.length)issues.push({target:'indhold',itemId:d.id,rule:'invented_contact',tokens:contacts,reason:'Tekstforslaget indeholder kontaktoplysninger eller links, som ikke blev fundet på siden.'});
  for(const h of bannedIn(d.text))issues.push({target:'indhold',itemId:d.id,rule:'banned_phrase',tokens:[h.token],reason:'Formuleringen “'+h.token+'” er et '+h.why+'.'});
  if(!text.trim())issues.push({target:'indhold',itemId:d.id,rule:'empty',reason:'Tekstforslaget er tomt.'});
 }
 return{passed:!issues.length,issues,warnings};
}

async function run(job,ctx={}){
 const result=rules(job),notes=[];let aiNotes=[];
 if(result.passed&&ctx.ai&&job.results.tjekker.check.access==='ok'&&!ctx.skipAiReview){
  const r=await ctx.ai.callJson(job,{role:'Kvalitetskontrol',task:'Gennemgå anbefalinger og tekstforslag. Find påstande, der er mere sikre end fundene tillader, opdigtede oplysninger og generelle råd, der fremstilles som fund. Svar som {"issues":[{"itemId":"r1 eller d1","reason":"kort dansk begrundelse"}]}. Tom liste, hvis du ikke finder noget.',content:{fund:job.results.tjekker.check.checks.map(({id,status,evidence})=>({id,status,evidence})),anbefalinger:job.results.strateg.recommendations,kladder:job.results.indhold.drafts},validate:d=>Array.isArray(d?.issues)&&d.issues.every(i=>i&&typeof i.reason==='string')?null:'issues skal være en liste'});
  if(r.ok)aiNotes=r.data.issues.slice(0,10).map(i=>({itemId:typeof i.itemId==='string'?i.itemId:null,reason:String(i.reason).slice(0,300)}));
  else notes.push({aiFailed:true,text:'AI-gennemgang fejlede ('+r.error+'). Kun faste regler er brugt.'});
 }
 return{...result,aiNotes,notes};
}
module.exports={role:'kontrol',label:'Kontrollerer fakta og formuleringer',run,rules,bannedIn};
