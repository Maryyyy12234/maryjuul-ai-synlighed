'use strict';
// Worker 1: Hjemmesidetjekker. Deterministic code only (check.js v3). No AI.
const {analyse}=require('../../check.js');

const unquote=s=>String(s||'').replace(/^“|”$/g,'').trim();
const usable=s=>s&&!/…$/.test(s)?s:null;

// Facts are read back out of the observed evidence, so later roles can only use
// what the check actually saw on the page.
function factsFrom(check){
 const ev=id=>{const c=check.checks.find(x=>x.id===id);return c&&c.status==='ok'?c.evidence:null;};
 const field=(s,name)=>{const m=String(s||'').match(new RegExp(name+': ([^·]+)'));return m?usable(m[1].trim()):null;};
 const schema=ev('schema'),contact=ev('contact'),address=usable(ev('address')),booking=ev('booking');
 const city=(address&&(address.match(/\b\d{4}\s+(.+)$/)||[])[1])||(field(schema,'adresse')||'').match(/\b\d{4}\s+(.+)$/)?.[1]||null;
 const h1=usable(unquote(ev('h1')));
 const service=h1&&city&&h1.toLowerCase().includes(' i '+city.toLowerCase().split(' ')[0])?h1.slice(0,h1.toLowerCase().lastIndexOf(' i ')).trim():null;
 const bookingHref=booking?(booking.split(' → ')[1]||null):null,bookingLabel=booking?unquote(booking.split(' → ')[0]):null;
 return{
  name:field(schema,'navn'),address:address||field(schema,'adresse'),city,
  phone:field(contact,'Telefon'),email:field(contact,'E-mail'),
  hours:field(schema,'åbningstider'),
  prices:(ev('prices')||'').split(' · ').map(s=>s.trim()).filter(s=>s&&!/…$/.test(s)),
  title:usable(unquote(ev('title'))),h1,description:usable(unquote(ev('description'))),
  service,booking:bookingHref?{label:bookingLabel,href:bookingHref,isBooking:/book|bestil|reserv/i.test(booking)}:null
 };
}

async function run(job,ctx={}){
 const check=await analyse(job.url,ctx.analyseOptions||{});
 return{check,facts:check.access==='ok'?factsFrom(check):null};
}
module.exports={role:'tjekker',label:'Henter og læser siden',run,factsFrom};
