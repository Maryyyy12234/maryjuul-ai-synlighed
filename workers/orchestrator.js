'use strict';
// Shared job control for the four roles. One Node process, in-process queue,
// JSON files under DATA_DIR written atomically after every step.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {normalizeUrl}=require('../check.js');
const tjekker=require('./tjekker'),strateg=require('./strateg'),indhold=require('./indhold'),kontrol=require('./kontrol');
const {createAi}=require('./ai.js');

const STATE_LABEL={queued:'I kø',running:'Under behandling',ready:'Klar',needs_review:'Kræver gennemgang',failed:'Kunne ikke gennemføres'};
const ROLES=[tjekker,strateg,indhold,kontrol];
const MAX_REVISIONS=2;
const FLAG={ai:'AI-trin fejlede — kræver gennemgang',access:'Siden kunne ikke undersøges — kræver gennemgang',qc:'Kvalitetskontrollen blev ikke bestået efter '+MAX_REVISIONS+' rettelsesrunder',aiReview:'AI-gennemgangen pegede på forhold, der skal vurderes af et menneske',facts:'Grundoplysninger (navn, by eller ydelse) blev ikke fundet på siden'};

function jobKey(href,date=new Date()){return crypto.createHash('sha256').update(href+'|'+date.toISOString().slice(0,10)).digest('hex');}

class JobStore{
 constructor(dir){this.dir=dir;fs.mkdirSync(dir,{recursive:true});}
 file(id){if(!/^[a-f0-9]{20}$/.test(id))throw Error('ugyldigt id');return path.join(this.dir,id+'.json');}
 save(job){job.updatedAt=new Date().toISOString();const f=this.file(job.id),tmp=f+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(job,null,1));fs.renameSync(tmp,f);}
 load(id){try{return JSON.parse(fs.readFileSync(this.file(id),'utf8'));}catch{return null;}}
 all(){return fs.readdirSync(this.dir).filter(f=>/^[a-f0-9]{20}\.json$/.test(f)).map(f=>this.load(f.slice(0,20))).filter(Boolean);}
}

class Orchestrator{
 constructor({dataDir=process.env.DATA_DIR||path.join(__dirname,'..','data'),concurrency=Number(process.env.JOB_CONCURRENCY)||2,queueMax=50,jobTimeoutMs=90000,ai,env=process.env,fetch:fetchImpl,analyseOptions,now=()=>new Date()}={}){
  this.store=new JobStore(path.join(dataDir,'jobs'));
  this.ai=ai!==undefined?ai:createAi({env,fetch:fetchImpl,dataDir});
  Object.assign(this,{concurrency,queueMax,jobTimeoutMs,analyseOptions,now});
  this.queue=[];this.active=0;this.idle=[];
 }
 ctx(){return{ai:this.ai,analyseOptions:this.analyseOptions};}
 // Resume after a restart: queued jobs go back in the queue; a job that was
 // running is re-queued once, then marked failed.
 resume(){
  for(const job of this.store.all()){
   if(job.state==='queued')this.queue.push(job.id);
   else if(job.state==='running'){
    if((job.restarts||0)<1){job.restarts=(job.restarts||0)+1;job.state='queued';for(const s of job.steps)if(s.state==='running')s.state='pending';this.store.save(job);this.queue.push(job.id);}
    else{job.state='failed';job.error='Opgaven blev afbrudt af en genstart to gange.';for(const s of job.steps)if(s.state==='running')s.state='failed';this.store.save(job);}
   }
  }
  this.pump();return this;
 }
 create(url){
  const href=normalizeUrl(url).href,key=jobKey(href,this.now()),id=key.slice(0,20);
  const existing=this.store.load(id);if(existing)return{job:existing,created:false};
  if(this.queue.length>=this.queueMax){const e=Error('Der er mange opgaver i kø. Prøv igen om lidt.');e.code='QUEUE_FULL';throw e;}
  const now=this.now().toISOString();
  const job={id,key,url:href,state:'queued',createdAt:now,updatedAt:now,restarts:0,revisions:0,steps:ROLES.map(r=>({role:r.role,label:r.label,state:'pending'})),results:{},flags:[],notes:[],ai:{calls:0,log:[]},approvedAt:null};
  this.store.save(job);this.queue.push(id);this.pump();
  return{job,created:true};
 }
 get(id){try{return this.store.load(id);}catch{return null;}}
 list(){return this.store.all().sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
 approve(id){const job=this.get(id);if(!job)return null;if(!['ready','needs_review'].includes(job.state)){const e=Error('Opgaven kan ikke godkendes i tilstanden '+STATE_LABEL[job.state]+'.');e.code='BAD_STATE';throw e;}job.state='ready';job.approvedAt=this.now().toISOString();this.store.save(job);return job;}
 pump(){
  while(this.active<this.concurrency&&this.queue.length){const id=this.queue.shift();this.active++;this.execute(id).finally(()=>{this.active--;this.pump();if(!this.active&&!this.queue.length){const w=this.idle;this.idle=[];w.forEach(f=>f());}});}
 }
 whenIdle(){return !this.active&&!this.queue.length?Promise.resolve():new Promise(r=>this.idle.push(r));}
 async execute(id){
  const job=this.store.load(id);if(!job||job.state!=='queued')return;
  job.state='running';this.store.save(job);
  let timer;const timeout=new Promise((_,rej)=>{timer=setTimeout(()=>rej(Object.assign(Error('Opgaven tog mere end '+this.jobTimeoutMs/1000+' sekunder.'),{code:'JOB_TIMEOUT'})),this.jobTimeoutMs);});
  try{await Promise.race([this.steps(job),timeout]);}
  catch(e){
   job.state='failed';job.error=e.code==='JOB_TIMEOUT'?e.message:'Der opstod en fejl i et trin. Opgaven er stoppet uden resultat for det trin.';
   for(const s of job.steps)if(s.state==='running')s.state='failed';
   job.notes.push({role:'orchestrator',text:job.error});if(e.code!=='JOB_TIMEOUT')console.error('job failed',id,e);
   this.store.save(job);
  }finally{clearTimeout(timer);}
 }
 step(job,role){return job.steps.find(s=>s.role===role);}
 async runStep(job,role,fn){
  const s=this.step(job,role);if(s.state==='done'||s.state==='skipped')return;
  s.state='running';s.startedAt=new Date().toISOString();this.store.save(job);
  const out=await fn();
  job.results[role]=out;s.state=out?.skipped?'skipped':'done';s.finishedAt=new Date().toISOString();
  for(const n of out?.notes||[]){job.notes.push({role,...n});if(n.aiFailed&&!job.flags.includes(FLAG.ai))job.flags.push(FLAG.ai);}
  this.store.save(job);
 }
 async steps(job){
  const ctx=this.ctx();
  await this.runStep(job,'tjekker',()=>tjekker.run(job,ctx));
  const {check,facts}=job.results.tjekker;
  if(check.access!=='ok'&&!job.flags.includes(FLAG.access))job.flags.push(FLAG.access);
  if(check.access==='ok'&&(!facts?.name||!facts?.city||!facts?.service)&&!job.flags.includes(FLAG.facts))job.flags.push(FLAG.facts);
  await this.runStep(job,'strateg',()=>strateg.run(job,ctx));
  await this.runStep(job,'indhold',()=>indhold.run(job,ctx));
  await this.runStep(job,'kontrol',async()=>{
   let qc=kontrol.rules(job);const rounds=[];
   while(!qc.passed&&job.revisions<MAX_REVISIONS){
    job.revisions++;rounds.push({round:job.revisions,issues:qc.issues});
    const forStrateg=qc.issues.filter(i=>i.target==='strateg'),forIndhold=qc.issues.filter(i=>i.target==='indhold');
    if(forStrateg.length)job.results.strateg=strateg.revise(job,forStrateg);
    if(forIndhold.length)job.results.indhold=await indhold.revise(job,forIndhold,ctx);
    for(const n of job.results.indhold?.notes||[])if(n.aiFailed&&!job.flags.includes(FLAG.ai))job.flags.push(FLAG.ai);
    this.store.save(job);
    qc=kontrol.rules(job);
   }
   if(!qc.passed){
    // Cap reached: never ship what failed. Apply deterministic fixes and flag it.
    rounds.push({round:'slut',issues:qc.issues});
    const forIndhold=qc.issues.filter(i=>i.target==='indhold');
    if(forIndhold.length)job.results.indhold={...job.results.indhold,drafts:job.results.indhold.drafts.map(d=>indhold.ruleFix(d,forIndhold.filter(i=>i.itemId===d.id))).filter(d=>!forIndhold.some(i=>i.itemId===d.id&&i.rule==='empty'))};
    if(qc.issues.some(i=>i.target==='strateg'))job.results.strateg={...job.results.strateg,recommendations:strateg.baseline(check,facts).recommendations};
    if(!job.flags.includes(FLAG.qc))job.flags.push(FLAG.qc);
    const after=kontrol.rules(job);
    return{...after,passed:false,rounds,finalCheck:after.passed?'Rettet med faste regler efter sidste runde':'Stadig fejl efter faste rettelser',aiNotes:[],notes:[]};
   }
   const final=await kontrol.run(job,ctx);
   if(final.aiNotes.length&&!job.flags.includes(FLAG.aiReview))job.flags.push(FLAG.aiReview);
   return{...final,rounds};
  });
  const placeholderCount=(job.results.indhold?.drafts||[]).reduce((n,d)=>n+d.placeholders.length,0);
  job.placeholderCount=placeholderCount;
  job.state=job.flags.length?'needs_review':'ready';
  this.store.save(job);
 }
}

function publicView(job){
 const check=job.results?.tjekker?.check||null;
 return{id:job.id,state:job.state,stateLabel:STATE_LABEL[job.state],steps:job.steps.map(({role,label,state})=>({role,label,state})),createdAt:job.createdAt,updatedAt:job.updatedAt,check,publicNextSteps:check?check.nextSteps:[]};
}
module.exports={Orchestrator,JobStore,jobKey,publicView,STATE_LABEL,FLAG,MAX_REVISIONS};
