'use strict';
// Customer report (Danish, printable). Built only from stored job data.
const {STATE_LABEL}=require('./orchestrator.js');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nl=s=>esc(s).replace(/\n/g,'<br>').replace(/\[UDFYLD:([^\]]*)\]/g,'<mark>[UDFYLD:$1]</mark>');
const STATUS={ok:'Fundet',warn:'Bør forbedres',unknown:'Uafklaret',info:'Generel anbefaling'};
const KIND={observeret:'Observeret problem',vurdering:'Faglig vurdering','kræver mere viden':'Kræver mere viden'};
const fmt=iso=>new Intl.DateTimeFormat('da-DK',{dateStyle:'long',timeStyle:'short',timeZone:'Europe/Copenhagen'}).format(new Date(iso));

function renderReport(job,{testdata=false}={}){
 const check=job.results?.tjekker?.check,recs=job.results?.strateg?.recommendations||[],drafts=job.results?.indhold?.drafts||[],aiTest=job.results?.strateg?.aiTest;
 if(!check)return '<!doctype html><meta charset="utf-8"><title>Rapport</title><p>Rapporten er ikke klar endnu.</p>';
 const host=new URL(check.scope.finalUrl||check.scope.requestedUrl).hostname.replace(/^www\./,'');
 const found=check.checks.filter(c=>c.status==='ok'&&c.evidence),warns=check.checks.filter(c=>c.status==='warn').sort((a,b)=>a.priority-b.priority),unknown=check.checks.filter(c=>c.status==='unknown');
 const draftLabel=job.approvedAt?'Godkendt af MARY JUUL '+fmt(job.approvedAt)+'. Teksterne er stadig forslag, indtil du selv lægger dem på siden.':'KLADDE. Ikke gennemgået og godkendt endnu. Intet er lagt på din hjemmeside.';
 return `<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rapport – ${esc(host)} – MARY JUUL</title>
<style>:root{--paper:#f6f3ec;--ink:#1f1a17;--wine:#632a39;--muted:#655d55;--line:#d9d0c2}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.6 Georgia,"Times New Roman",serif}main{max-width:820px;margin:0 auto;padding:48px 20px 80px}h1{font-size:clamp(34px,6vw,54px);line-height:1.05;margin:8px 0 12px;font-weight:400}h1 em{color:var(--wine)}h2{font-size:26px;font-weight:400;margin:48px 0 12px;border-top:1px solid var(--line);padding-top:22px}h2 span{color:var(--wine);font:600 12px/1 system-ui,sans-serif;letter-spacing:.12em;margin-right:10px}h3{font-size:18px;margin:18px 0 4px}.eyebrow,.tag{font:600 11px/1.4 system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--wine)}.meta{font:13px/1.6 system-ui,sans-serif;color:var(--muted)}.notice{border:1.5px solid var(--wine);padding:14px 16px;margin:20px 0;font:14px/1.5 system-ui,sans-serif}.test{background:var(--wine);color:var(--paper);padding:10px 16px;font:700 13px/1.4 system-ui,sans-serif;letter-spacing:.1em;text-align:center}.item{padding:12px 0;border-bottom:1px solid var(--line)}.item p{margin:4px 0}.ev{font:13px/1.5 ui-monospace,Menlo,monospace;color:var(--muted);word-break:break-word}.draft{background:#fbf8f1;border:1px solid var(--line);padding:16px;margin:12px 0}.draft .before{color:var(--muted);font-style:italic}mark{background:#ead9dc;color:var(--wine);padding:0 3px}ol,ul{padding-left:22px}a{color:var(--wine)}@media print{body{background:#fff}.draft{break-inside:avoid}}</style></head><body>
${testdata?'<div class="test">TESTDATA – eksempel lavet på en fiktiv testside, ikke en rigtig kunde</div>':''}
<main><span class="eyebrow">MARY JUUL · Hjemmesiderapport</span><h1>Rapport for<br><em>${esc(host)}</em></h1>
<p class="meta">Undersøgt ${esc(fmt(check.checkedAt))} · Status: ${esc(STATE_LABEL[job.state])} · Opgave ${esc(job.id)}</p>
<p class="notice"><strong>Et teknisk hjemmesidetjek er ikke en måling af omtale i ChatGPT eller andre AI-tjenester.</strong> Rapporten viser, hvad vi kunne se på siden, og hvad vi foreslår at forbedre.</p>
${job.flags?.length&&!job.approvedAt?'<div class="notice"><strong>Kræver gennemgang før brug:</strong><ul>'+job.flags.map(f=>'<li>'+esc(f)+'</li>').join('')+'</ul></div>':''}

<h2><span>1</span>Hvad blev undersøgt</h2>
<ul>${check.scope.pagesChecked.map(p=>'<li>Side: '+esc(p.url)+' (svar '+esc(p.status)+')</li>').join('')||'<li>Ingen sider. Vi fik ikke adgang.</li>'}${check.scope.filesChecked.map(f=>'<li>Fil: '+esc(f)+'</li>').join('')}</ul>
<p class="meta">Varighed ${(check.scope.durationMs/1000).toFixed(1)} sekunder. ${esc(check.method)}</p>
${check.access!=='ok'?'<p class="notice">'+esc(check.accessNote)+'</p>':''}

<h2><span>2</span>Vigtigste dokumenterede fund</h2>
${found.length?found.map(c=>`<div class="item"><span class="tag">${STATUS.ok}</span><h3>${esc(c.title)}</h3><p>${esc(c.explain)}</p><p class="ev">Set på siden: ${esc(c.evidence)}</p></div>`).join(''):'<p>Ingen dokumenterede fund, fordi siden ikke kunne undersøges.</p>'}
${warns.length?'<h3>Det, der bør forbedres</h3>'+warns.map(c=>`<div class="item"><span class="tag">${STATUS.warn} · prioritet ${esc(c.priority)}</span><h3>${esc(c.title)}</h3><p>${esc(c.explain)}</p>${c.evidence?'<p class="ev">Set på siden: '+esc(c.evidence)+'</p>':''}</div>`).join(''):''}

<h2><span>3</span>Prioriterede forbedringer</h2>
${job.results?.strateg?.rankNote?'<p class="meta">'+esc(job.results.strateg.rankNote)+'</p>':''}
<ol>${recs.map(r=>`<li class="item"><span class="tag">${esc(KIND[r.kind]||r.kind)}</span><p><strong>${esc(r.change)}</strong></p><p>Hvorfor: ${esc(r.why)}</p><p class="meta">Bygger på: ${esc(r.basedOn.map(id=>check.checks.find(c=>c.id===id)?.title||id).join(', '))} · Kræver fra dig: ${esc(r.needsFromClient)}${r.rank?' · Konsekvens '+r.rank.consequence+' × sikkerhed '+r.rank.certainty+' ÷ indsats '+r.rank.effort:''}</p></li>`).join('')}</ol>

<h2><span>4</span>Tekstforslag (KLADDE)</h2>
<p class="notice">${esc(draftLabel)} Felter markeret <mark>[UDFYLD: …]</mark> kræver oplysninger fra dig. Vi har ikke opfundet priser, erfaring eller anmeldelser.</p>
${drafts.length?drafts.map(d=>`<div class="draft"><span class="tag">${esc(d.label)}</span>${d.before?'<p class="before">Før: “'+esc(d.before)+'”</p><p><strong>Efter:</strong></p>':''}<p>${nl(d.text)}</p></div>`).join(''):'<p>Ingen tekstforslag, fordi siden ikke kunne undersøges.</p>'}
${aiTest?'<h3>Spørgsmål til en senere AI-test</h3><p class="meta">'+esc(aiTest.label)+'</p><ul>'+aiTest.questions.map(q=>'<li>'+nl(q)+'</li>').join('')+'</ul>':''}

<h2><span>5</span>Ikke afklaret</h2>
<ul>${unknown.map(c=>'<li>'+esc(c.title)+': '+esc(c.explain)+'</li>').join('')}${check.scope.notChecked.map(s=>'<li>'+esc(s)+'</li>').join('')}</ul>

<h2><span>6</span>Næste skridt</h2>
${check.nextSteps.length?'<ol>'+check.nextSteps.map(s=>'<li><strong>'+esc(s.title)+'.</strong> '+esc(s.why)+'</li>').join('')+'</ol>':'<p>Der er ingen akutte tekniske forbedringer fra tjekket.</p>'}
<p>Vil du have hjælp til forbedringerne, kan MARY JUUL lave en afgrænset gennemgang (AI-klar, prisudkast 1.495 kr.). Omfang, leverancer og pris aftales altid skriftligt, før arbejdet starter.</p>
<p class="meta">Kilder: ${check.sources.map(s=>'<a href="'+esc(s.url)+'">'+esc(s.title)+'</a>').join(' · ')}</p>
</main></body></html>`;
}
module.exports={renderReport};
