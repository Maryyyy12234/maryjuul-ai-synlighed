(()=>{
'use strict';
const $=id=>document.getElementById(id);
const menu=document.querySelector('.menu-toggle'),mobile=$('mobile-menu');
menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'Luk menu':'Åbn menu');mobile.hidden=!open;});
mobile.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{mobile.hidden=true;menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','Åbn menu');}));
const dialog=$('project-dialog');
const projects={atelier:{title:'Atelier N°04',text:'Et indretningskoncept med rolige jordfarver, store billeder og en varm serifskrift. Udtrykket giver plads til materialer og stemning, mens kontaktvejen er enkel. Det er en visuel designretning, ikke en kundecase eller en færdig kundehjemmeside.'},som:{title:'SØM.',text:'Et modekoncept med et markant ordmærke, mørk olivengrøn og et enkelt hierarki. Retningen viser, hvordan få elementer kan skabe et genkendeligt udtryk. Det er et visuelt koncept, ikke en kundecase eller en webshop med produkter til salg.'}};
document.querySelectorAll('[data-project]').forEach(button=>button.addEventListener('click',()=>{const p=projects[button.dataset.project];$('dialog-preview').replaceChildren(button.querySelector('.work-image').cloneNode(true));$('dialog-title').textContent=p.title;$('dialog-text').textContent=p.text;dialog.showModal();}));
document.querySelector('.dialog-close').addEventListener('click',()=>dialog.close());$('dialog-contact').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
const examples={before:{title:'Dit hår.<br><em>Vores passion.</em>',text:'Velkommen til vores univers. Vi elsker at skabe smukke resultater og forkæle vores kunder med den bedste oplevelse.',tags:['Hvad kan jeg få?','Hvor?','Hvad koster det?'],comment:'Stemningen er der. Men kunden mangler stadig svar på ydelse, beliggenhed, pris og næste skridt.'},after:{title:'Dameklip i<br><em>Aarhus C.</em>',text:'Dameklip fra 495 kr. Prisen inkluderer vask og føn. Se ledige tider, og book direkte på hjemmesiden.',tags:['Ydelse','Sted','Pris & booking'],comment:'Konkrete oplysninger gør det lettere for både kunden og en søgetjeneste at forstå dit tilbud.'}};
document.querySelectorAll('[data-example]').forEach(button=>button.addEventListener('click',()=>{const example=examples[button.dataset.example];document.querySelectorAll('[data-example]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));$('example-title').innerHTML=example.title;$('example-text').textContent=example.text;$('example-comment').textContent=example.comment;$('example-tags').replaceChildren(...example.tags.map(tag=>el('span','',tag)));}));
const form=$('check-form'),input=$('site-url'),submit=$('check-submit'),error=$('check-error'),progress=$('check-progress'),result=$('audit-result');
let report=null;
const statusLabel={ok:'FUNDET',warn:'BØR FORBEDRES',unknown:'UAFKLARET',info:'GENEREL ANBEFALING'};
const groupLabel={access:'Adgang',technical:'Sidens grundlag',facts:'Virksomhedens fakta',services:'Ydelser, priser og booking',answers:'Svar og valgfrie filer'};
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function hostOf(data){try{return new URL(data.scope.finalUrl||data.scope.requestedUrl).hostname.replace(/^www\./,'');}catch{return '';}}
function render(data){
 report=data;$('result-host').textContent=hostOf(data);$('result-date').textContent='UNDERSØGT '+new Intl.DateTimeFormat('da-DK',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Copenhagen'}).format(new Date(data.checkedAt));
 const s=data.summary||{};
 $('result-summary').textContent=data.access!=='ok'?data.accessNote:'Fundet: '+s.found+'. Bør forbedres: '+s.improve+'. Uafklaret: '+s.unknown+'. Generelle anbefalinger: '+s.general+'. Tjekket bygger på én side og måler ikke, om din virksomhed bliver nævnt i AI-svar.';
 const priorities=$('result-priorities');priorities.replaceChildren();for(const p of data.nextSteps||[]){const li=el('li');li.append(el('strong','',p.title),document.createTextNode(' '+p.why));priorities.append(li);}$('priority-box').hidden=!priorities.children.length;
 const checks=$('result-checks');checks.replaceChildren();let lastGroup='';
 for(const c of data.checks){if(c.group!==lastGroup){lastGroup=c.group;checks.append(el('h4','check-group',groupLabel[c.group]||c.group));}const row=el('div','check-item'),status=Object.hasOwn(statusLabel,c.status)?c.status:'info';row.append(el('span','status-tag status-'+status,statusLabel[status]));const detail=el('div');detail.append(el('h4','',c.title),el('p','',c.explain));if(c.evidence)detail.append(el('p','evidence','Set på siden: '+c.evidence));if(c.fix&&c.status!=='ok')detail.append(el('p','fix',c.fix));row.append(detail);checks.append(row);}
 $('result-geo-plan').hidden=true;
 $('result-limitations').replaceChildren(el('li','',data.method),...(data.scope.notChecked||[]).map(x=>el('li','','Ikke undersøgt: '+x)),el('li','','Hentet: '+[...data.scope.pagesChecked.map(p=>p.url+' ('+p.status+')'),...data.scope.filesChecked].join(', ')+'. Varighed: '+(data.scope.durationMs/1000).toFixed(1)+' sek.'));
 const sources=$('result-sources');sources.replaceChildren();for(const source of data.sources||[]){try{const u=new URL(source.url);if(u.protocol!=='https:')continue;const a=el('a','',source.title);a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';sources.append(a);}catch{}}
 result.hidden=false;result.focus({preventScroll:true});result.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
}
form.addEventListener('submit',async e=>{
 e.preventDefault();error.hidden=true;input.removeAttribute('aria-invalid');const value=input.value.trim();
 if(!value){error.textContent='Skriv din hjemmesideadresse først.';error.hidden=false;input.setAttribute('aria-invalid','true');input.focus();return;}
 try{const normalized=/^[a-z][a-z\d+.-]*:\/\//i.test(value)?value:'https://'+value;const u=new URL(normalized);if(!['https:','http:'].includes(u.protocol)||!u.hostname.includes('.')||u.username||u.password)throw Error();}catch{error.textContent='Skriv en offentlig hjemmesideadresse, fx dinvirksomhed.dk.';error.hidden=false;input.setAttribute('aria-invalid','true');input.focus();return;}
 submit.disabled=true;submit.firstChild.textContent='Tjekker din hjemmeside… ';progress.hidden=false;result.hidden=true;form.setAttribute('aria-busy','true');$('progress-text').textContent='Henter din hjemmeside…';
 const slow=setTimeout(()=>{$('progress-text').textContent='Tjekket starter op. Første besøg kan tage omkring et minut.';},12000);const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),60000);
 try{
  const endpoint=location.hostname.endsWith('.chatgpt.site')?'https://maryjuul-ai-synlighed.onrender.com/api/check':'/api/check';
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:value}),signal:controller.signal,credentials:'omit'});
  let data;try{data=await response.json();}catch{throw Error('Tjekket svarede ikke som forventet. Prøv igen om lidt.');}
  if(!response.ok)throw Error(data.error||'Tjekket kunne ikke gennemføres. Prøv igen.');
  if(data.version!=='3'||!Array.isArray(data.checks)||!data.scope)throw Error('Resultatet kunne ikke læses. Prøv igen.');render(data);
 }catch(e){error.textContent=e.name==='AbortError'?'Tjekket tog for lang tid. Prøv igen — tjenesten kan være ved at starte op.':e instanceof TypeError?'Der er ikke forbindelse til tjekket lige nu. Prøv igen om lidt.':e.message;error.hidden=false;}
 finally{clearTimeout(slow);clearTimeout(timeout);submit.disabled=false;submit.firstChild.textContent='Tjek min hjemmeside ';progress.hidden=true;form.removeAttribute('aria-busy');}
});
$('download-report').addEventListener('click',()=>{
 if(!report)return;const host=hostOf(report),lines=['MARY JUUL — Hjemmesidetjek',report.scope.finalUrl||report.scope.requestedUrl,'Undersøgt: '+report.checkedAt,...(report.accessNote?['',report.accessNote]:[]),'','NÆSTE SKRIDT',...(report.nextSteps||[]).map((p,i)=>(i+1)+'. '+p.title+' — '+p.why),'','FUND',...report.checks.flatMap(c=>['['+(statusLabel[c.status]||'INFO')+'] '+c.title,c.explain,...(c.evidence?['Set på siden: '+c.evidence]:[]),...(c.fix&&c.status!=='ok'?['Forslag: '+c.fix]:[]),'']),'METODE',report.method,'','IKKE UNDERSØGT',...report.scope.notChecked,'','KILDER',...(report.sources||[]).map(s=>s.title+': '+s.url)];const blob=new Blob(['﻿'+lines.join('\n')],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='hjemmesidetjek-'+host.replace(/[^a-z0-9.-]/gi,'-')+'.txt';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
})();
