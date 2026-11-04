(()=>{
'use strict';
const $=id=>document.getElementById(id);
const menu=document.querySelector('.menu-toggle'),mobile=$('mobile-menu');
menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'Luk menu':'Åbn menu');mobile.hidden=!open;});
mobile.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{mobile.hidden=true;menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','Åbn menu');}));
const dialog=$('project-dialog');
const projects={atelier:{title:'Atelier N°04',text:'Et indretningskoncept med rolige jordfarver, store billeder og en varm serifskrift. Udtrykket giver plads til materialer og stemning, mens kontaktvejen er enkel. Det er en visuel designretning, ikke en kundecase eller en færdig kundehjemmeside.'},som:{title:'SØM.',text:'Et modekoncept med et markant ordmærke, mørk olivengrøn og et enkelt hierarki. Retningen viser, hvordan få elementer kan skabe et genkendeligt udtryk. Det er et visuelt koncept, ikke en kundecase eller en webshop med produkter til salg.'}};
document.querySelectorAll('[data-project]').forEach(button=>button.addEventListener('click',()=>{const p=projects[button.dataset.project];$('dialog-title').textContent=p.title;$('dialog-text').textContent=p.text;dialog.showModal();}));
document.querySelector('.dialog-close').addEventListener('click',()=>dialog.close());$('dialog-contact').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
const form=$('check-form'),input=$('site-url'),submit=$('check-submit'),error=$('check-error'),progress=$('check-progress'),result=$('audit-result');
let report=null;
const statusLabel={ok:'FUNDET',warn:'TJEK',bad:'RET',info:'INFO',unknown:'UAFKLARET'};
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function render(data){
 report=data;$('result-host').textContent=data.host;$('result-score').textContent=data.score;$('result-date').textContent='UNDERSØGT '+new Intl.DateTimeFormat('da-DK',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Copenhagen'}).format(new Date(data.checkedAt));
 const unknown=data.coverage?.unknownChecks||0;
 $('result-summary').textContent=(data.score>=80?'Et godt teknisk udgangspunkt.':data.score>=50?'Der er et fundament at bygge videre på.':'Her er flere ting, der fortjener opmærksomhed.')+' Scoren bygger på de målte tekniske forhold fra én side.'+(unknown?' '+unknown+' forhold kunne ikke afklares og indgår ikke i scoren.':'')+' Den måler ikke, om din virksomhed bliver nævnt i AI-svar.';
 const priorities=$('result-priorities');priorities.replaceChildren();for(const p of data.priorities||[])priorities.append(el('li','',p.action));$('priority-box').hidden=!priorities.children.length;
 const checks=$('result-checks');checks.replaceChildren();for(const c of data.checks){const row=el('div','check-item'),status=Object.hasOwn(statusLabel,c.status)?c.status:'info';row.append(el('span','status-tag status-'+status,statusLabel[status]));const detail=el('div');detail.append(el('h4','',c.title),el('p','',c.explain));if(c.fix&&['bad','warn','unknown'].includes(c.status))detail.append(el('p','fix',c.fix));row.append(detail);checks.append(row);}
 $('result-limitations').replaceChildren(...(data.limitations||[]).map(s=>el('li','',s)));const sources=$('result-sources');sources.replaceChildren();for(const source of data.sources||[]){try{const u=new URL(source.url);if(u.protocol!=='https:')continue;const a=el('a','',source.title);a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';sources.append(a);}catch{}}
 result.hidden=false;result.focus({preventScroll:true});result.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
}
form.addEventListener('submit',async e=>{
 e.preventDefault();error.hidden=true;input.removeAttribute('aria-invalid');const value=input.value.trim();
 if(!value){error.textContent='Skriv din hjemmesideadresse først.';error.hidden=false;input.setAttribute('aria-invalid','true');input.focus();return;}
 try{const normalized=/^[a-z][a-z\d+.-]*:\/\//i.test(value)?value:'https://'+value;const u=new URL(normalized);if(!['https:','http:'].includes(u.protocol)||!u.hostname.includes('.')||u.username||u.password)throw Error();}catch{error.textContent='Skriv en offentlig hjemmesideadresse, fx dinvirksomhed.dk.';error.hidden=false;input.setAttribute('aria-invalid','true');input.focus();return;}
 submit.disabled=true;submit.firstChild.textContent='Tjekker din hjemmeside… ';progress.hidden=false;result.hidden=true;form.setAttribute('aria-busy','true');$('progress-text').textContent='Henter din hjemmeside…';
 const slow=setTimeout(()=>{$('progress-text').textContent='Tjekket starter op. Første besøg kan tage omkring et minut.';},12000);const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),85000);
 try{
  const endpoint=location.hostname.endsWith('.chatgpt.site')?'https://maryjuul-ai-synlighed.onrender.com/api/check':'/api/check';
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:value}),signal:controller.signal,credentials:'omit'});
  let data;try{data=await response.json();}catch{throw Error('Tjekket svarede ikke som forventet. Prøv igen om lidt.');}
  if(!response.ok)throw Error(data.error||'Tjekket kunne ikke gennemføres. Prøv igen.');
  if(!Array.isArray(data.checks)||!Number.isFinite(data.score)||data.score<0||data.score>100)throw Error('Resultatet kunne ikke læses. Prøv igen.');render(data);
 }catch(e){error.textContent=e.name==='AbortError'?'Tjekket tog for lang tid. Prøv igen — tjenesten kan være ved at starte op.':e instanceof TypeError?'Der er ikke forbindelse til tjekket lige nu. Prøv igen om lidt.':e.message;error.hidden=false;}
 finally{clearTimeout(slow);clearTimeout(timeout);submit.disabled=false;submit.firstChild.textContent='Tjek min hjemmeside ';progress.hidden=true;form.removeAttribute('aria-busy');}
});
$('download-report').addEventListener('click',()=>{
 if(!report)return;const lines=['MARY JUUL — Hjemmesidetjek',report.url,'Undersøgt: '+report.checkedAt,'Teknisk grundlag: '+report.score+'/100','','PRIORITETER',...(report.priorities||[]).map((p,i)=>(i+1)+'. '+p.action),'','FUND',...report.checks.flatMap(c=>['['+(statusLabel[c.status]||'INFO')+'] '+c.title,c.explain,...(c.fix&&['bad','warn','unknown'].includes(c.status)?['Forslag: '+c.fix]:[]),'']),'AFGRÆNSNING',...(report.limitations||[]),'','KILDER',...(report.sources||[]).map(s=>s.title+': '+s.url)];const blob=new Blob(['\ufeff'+lines.join('\n')],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='hjemmesidetjek-'+report.host.replace(/[^a-z0-9.-]/gi,'-')+'.txt';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
})();
