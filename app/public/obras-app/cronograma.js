/* Central LZ7 — Cronograma de instalação (Central de Obras).
 * Regras e telas portadas do protótipo "Cronograma de Obras LZ7" (index.html: calendário, fila, alertas, relatórios, sugestão,
 * validações). Dados no Supabase (tabelas obra_*, view de regras e gatilhos de baseline/histórico no banco). Separado em telas:
 * Cronograma (#calendario, #fila, #alertas), Logística (#entregas), Indicadores (#relatorios), Equipes (#equipes), Configurações (#config).
 */
"use strict";
/* ---------- utilidades ---------- */
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const dt=s=>{const[a,b,c]=s.split('-').map(Number);return new Date(a,b-1,c)};
const add=(s,n)=>{const d=dt(s);d.setDate(d.getDate()+n);return iso(d)};
const diff=(a,b)=>Math.round((dt(a)-dt(b))/864e5);
const HOJE=iso(new Date());
const br=s=>s?s.slice(8)+'/'+s.slice(5,7):'—';
const brA=s=>s?s.slice(8)+'/'+s.slice(5,7)+'/'+s.slice(0,4):'—';
const dias=n=>n+(Math.abs(n)===1?' dia':' dias');
const MESES=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const DSEM=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
const seg=s=>{const d=dt(s);return add(s,-((d.getDay()+6)%7))};
const fds=s=>{const g=dt(s).getDay();return g===0||g===6};
const MINI=new Set(['de','da','do','das','dos','e']);
const nome=s=>String(s||'').toLowerCase().split(/\s+/).map((w,i)=>MINI.has(w)&&i?w:w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
const curto=s=>nome(s).split(' ').slice(0,3).join(' ');
const num=(n,d=0)=>Number(n||0).toLocaleString('pt-BR',{maximumFractionDigits:d,minimumFractionDigits:d});

/* ---------- estado ---------- */
// Central: dados no Supabase (tabelas obra_*), quem edita = perfil "obras" (o banco confere de novo).
const C=window.__CENTRAL;
const CFG0={metaDias:30,limiteDias:45,folgaDias:1,equipes:[],estruturas:[],motivos:['Chuva','Material atrasou','Cliente pediu','Equipe indisponível','Obra anterior atrasou','Outro'],topicos:[]};
const S={obras:new Map(),cfg:CFG0,pode:!!C.podeEditar,ok:false,view:'calendario',
  modo:'mes',ref:HOJE.slice(0,7)+'-01',mi:true,me:true,q:'',fil:'',eq:'',sel:null,
  rep:{mes:'',min:1,so:false},reprog:{},nomes:{},hist:{}};
const FIL={WB:'Wenceslau Braz',LD:'Londrina',PG:'Ponta Grossa'};
const filial=o=>o.filial||(FIL[o.cod.slice(0,2)]?o.cod.slice(0,2):'Outras');
const eqp=id=>S.cfg.equipes.find(e=>e.id===id);
const eqNome=id=>{const e=eqp(id);return e?e.nome:(id||'Sem equipe')};
const eqChip=(id,extra='')=>{const e=eqp(id);return e?`<span class="pill eq" style="--h:${e.h}">${esc(e.nome)}${extra}</span>`:'<span class="pill">Sem equipe</span>'};
// Nome que aparece: o nome do card (sem o código e a potência do padrão do Ploomes), senão o cliente.
const tit=o=>{const c=String(o.card||'').replace(/^[A-Z0-9-]{6,}\s*-\s*/,'').replace(/\s*\(\s*[\d.,]+\s*kwp\s*\)\s*$/i,'').trim();return c?(c===c.toUpperCase()?nome(c):c):nome(o.cliente)};

/* ---------- regras ---------- */
function calc(o){
  const fim=!!o.fimReal, ag=!!o.iniPrev;
  const st=fim?'final':(o.iniReal||(ag&&o.iniPrev<=HOJE&&o.matReal))?'inst':ag?'agend':o.matReal?'pronta':'aguard';
  const aberto=o.entrada?diff(o.fimReal||HOJE,o.entrada):null;
  const bIni=o.bIni||o.iniPrev||null,bFim=o.bFim||o.fimPrev||o.iniPrev||null;
  const desvio=bFim?(fim?diff(o.fimReal,bFim):(bFim<HOJE?diff(HOJE,bFim):0)):null;
  const durPrev=bIni&&bFim?diff(bFim,bIni)+1:null;
  const iR=o.iniReal||o.iniPrev||bIni;
  const durReal=fim&&iR?Math.max(1,diff(o.fimReal,iR)+1):null;
  const reprog=S.reprog[o.cod]||0;
  const cls=aberto==null?'':aberto<=S.cfg.metaDias?'ok':aberto<=S.cfg.limiteDias?'warn':'crit';
  return{st,aberto,bIni,bFim,desvio,durPrev,durReal,reprog,cls,iR};
}
const ST={aguard:'Aguardando material',pronta:'Pronta para agendar',agend:'Agendada',inst:'Em instalação',final:'Finalizada'};
function visiveis(){
  const q=S.q.trim().toLowerCase();
  return[...S.obras.values()].filter(o=>(!S.fil||filial(o)===S.fil)&&(!S.eq||(S.eq==='-'?!o.equipe:o.equipe===S.eq))&&
    (!q||(o.cod+' '+o.cliente+' '+(o.card||'')+' '+(o.nomeContrato||'')+' '+(o.cidade||'')+' '+(o.pedido||'')).toLowerCase().includes(q)));
}
function carga(excluir){ // equipe|dia -> obras em aberto
  const m=new Map();
  for(const o of S.obras.values()){
    if(o.fimReal||!o.equipe||!o.iniPrev||o.cod===excluir)continue;
    for(let d=o.iniPrev,f=o.fimPrev||o.iniPrev,i=0;d<=f&&i<200;d=add(d,1),i++){const k=o.equipe+'|'+d;(m.get(k)||m.set(k,[]).get(k)).push(o.cod)}
  }
  return m;
}
function alertas(){
  const A=[],c=S.cfg,push=(t,sev,o,tx)=>A.push({t,sev,cod:o.cod,o,tx});
  for(const o of S.obras.values()){
    if(o.fimReal)continue;const k=calc(o);
    if(o.fimPrev&&o.fimPrev<HOJE)push('atrasada','crit',o,`Deveria ter terminado em ${br(o.fimPrev)} (${dias(diff(HOJE,o.fimPrev))} de atraso)`);
    if(!o.matReal&&o.matPrev&&o.matPrev<HOJE)push('material','crit',o,`Material previsto para ${br(o.matPrev)} ainda não chegou (${dias(diff(HOJE,o.matPrev))})`);
    if(o.iniPrev&&!o.matReal){
      if(!o.matPrev)push('folga','crit',o,`Instalação marcada para ${br(o.iniPrev)} sem previsão de material`);
      else if(diff(o.iniPrev,o.matPrev)<c.folgaDias)push('folga','crit',o,`Instalação em ${br(o.iniPrev)} e material previsto para ${br(o.matPrev)}`);
    }
    if(o.matReal&&!o.iniPrev)push('semagenda','warn',o,`Material entregue há ${dias(diff(HOJE,o.matReal))} e ainda sem data de instalação`);
    if(!o.matReal&&!o.matPrev&&k.aberto>=3)push('semprev','warn',o,`Sem previsão de entrega do material (${dias(k.aberto)} desde a entrada)`);
    if(k.aberto>c.limiteDias)push('prazo','crit',o,`${dias(k.aberto)} em aberto (limite ${c.limiteDias})`);
    else if(k.aberto>c.metaDias)push('prazo','warn',o,`${dias(k.aberto)} em aberto (meta ${c.metaDias})`);
    const f=[];if(o.kwp==null)f.push('kWp');if(o.mod==null)f.push('módulos');if(!o.estrut)f.push('estrutura');if(o.iniPrev&&!o.equipe)f.push('equipe');
    if(f.length)push('dados','warn',o,'Falta informar: '+f.join(', '));
  }
  for(const[k,v]of carga()){const[e,d]=k.split('|');const q=eqp(e);if(d>=HOJE&&v.length>(q?.cap||1))
    A.push({t:'conflito',sev:'warn',cod:v[0],o:S.obras.get(v[0]),tx:`${eqNome(e)} tem ${v.length} obras em ${br(d)}: ${v.map(x=>curto(tit(S.obras.get(x)))).join(', ')}`,eq:e})}
  return A;
}
const TA={atrasada:'Instalação atrasada',material:'Material atrasado',folga:'Instalação marcada antes do material',conflito:'Equipe com obras no mesmo dia',
  semagenda:'Material entregue sem agendamento',semprev:'Sem previsão de material',prazo:'Prazo acima da meta',dados:'Cadastro incompleto'};
function sugerir(o){
  const cnt={},ativa=id=>eqp(id)?.ativa;
  for(const x of S.obras.values())if(x.equipe&&ativa(x.equipe)&&x.cidade===o.cidade)cnt[x.equipe]=(cnt[x.equipe]||0)+1;
  if(!Object.keys(cnt).length)for(const x of S.obras.values())if(x.equipe&&ativa(x.equipe)&&filial(x)===filial(o))cnt[x.equipe]=(cnt[x.equipe]||0)+1;
  const eq=Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a])[0]||null;
  const mat=o.matReal||o.matPrev;let d=add(HOJE,1);
  if(mat){const m=add(mat,o.matReal?0:S.cfg.folgaDias);if(m>d)d=m}
  const cg=carga(o.cod),cap=eqp(eq)?.cap||1;
  for(let i=0;i<90;i++,d=add(d,1)){if(fds(d))continue;if(!eq||(cg.get(eq+'|'+d)||[]).length<cap)break}
  return{eq,d};
}

/* ---------- calendário ---------- */
function eventos(){ // dia -> {inst:[],ent:[]}
  const m=new Map(),g=d=>m.get(d)||m.set(d,{inst:[],ent:[]}).get(d);
  for(const o of visiveis()){
    if(o.iniPrev){let a=o.iniPrev,b=o.fimReal||o.fimPrev||o.iniPrev;if(b<a)a=b;for(let d=a,i=0;d<=b&&i<200;d=add(d,1),i++)g(d).inst.push(o)}
    const e=o.matReal||o.matPrev;if(e)g(e).ent.push(o);
  }
  return m;
}
const chipInst=o=>{const e=eqp(o.equipe),late=!o.fimReal&&o.fimPrev<HOJE;
  return`<button class="chip ${e?'eq':''} ${o.fimReal?'fin':''} ${late?'late':''}" style="--h:${e?e.h:0};${e?'':'background:var(--surface2)'}" data-obra="${esc(o.cod)}" title="${esc(tit(o))} · ${esc(eqNome(o.equipe))} · ${br(o.iniPrev)} a ${br(o.fimReal||o.fimPrev)}">${o.fimReal?'✓ ':''}${esc(curto(tit(o)))}</button>`};
const chipEnt=o=>{const late=!o.matReal&&o.matPrev<HOJE;
  return`<button class="chip ent ${o.matReal?'feita':''} ${late?'late':''}" data-obra="${esc(o.cod)}" title="Entrega de material · ${esc(tit(o))}">${o.matReal?'✓ ':''}Entrega · ${esc(curto(tit(o)))}</button>`};
function vCal(){
  const ab=[...S.obras.values()].filter(o=>!o.fimReal),s0=seg(HOJE),s1=add(s0,6),al=alertas();
  const iw=ab.filter(o=>o.iniPrev&&o.iniPrev<=s1&&(o.fimPrev||o.iniPrev)>=s0).length;
  const ew=ab.filter(o=>!o.matReal&&o.matPrev>=s0&&o.matPrev<=s1).length;
  const kw=ab.reduce((a,o)=>a+(o.kwp||0),0),cr=al.filter(a=>a.sev==='crit').length;
  const y=+S.ref.slice(0,4),mo=+S.ref.slice(5,7);
  let h=`<div class="tiles">
   <div class="tile"><b>${ab.length}</b><span>obras em aberto · ${num(kw)} kWp</span></div>
   <div class="tile"><b>${iw}</b><span>instalações nesta semana</span></div>
   <div class="tile"><b>${ew}</b><span>entregas previstas nesta semana</span></div>
   <button class="tile ${cr?'crit':'ok'}" data-nav="alertas"><b>${cr}</b><span>alertas críticos</span></button></div>
  <div class="bar"><button class="btn" data-act="mes" data-d="-1" aria-label="Mês anterior">‹</button><h2>${MESES[mo-1]} ${y}</h2>
   <button class="btn" data-act="mes" data-d="1" aria-label="Próximo mês">›</button><button class="btn" data-act="mes" data-d="0">Hoje</button><span class="sp"></span>
   <label class="ck f"><input type="checkbox" id="mi" ${S.mi?'checked':''}> Instalações</label>
   <label class="ck f"><input type="checkbox" id="me" ${S.me?'checked':''}> Entregas</label>
   <div class="seg"><button data-act="modo" data-m="mes" class="${S.modo==='mes'?'on':''}">Mês</button><button data-act="modo" data-m="eq" class="${S.modo==='eq'?'on':''}">Por equipe</button></div></div>`;
  return h+(S.modo==='mes'?calMes():calEq());
}
function calMes(){
  const ev=eventos(),ini=seg(S.ref),ult=iso(new Date(+S.ref.slice(0,4),+S.ref.slice(5,7),0));
  let h='<div class="cal">'+DSEM.map(d=>`<div class="dw">${d}</div>`).join('');
  for(let d=ini;d<=ult||dt(d).getDay()!==1;d=add(d,1)){
    const e=ev.get(d)||{inst:[],ent:[]},borda=o=>o.iniPrev===d||(o.fimReal||o.fimPrev||o.iniPrev)===d,it=[...(S.mi?e.inst.filter(borda).map(chipInst):[]),...(S.me?e.ent.map(chipEnt):[]),...(S.mi?e.inst.filter(o=>!borda(o)).map(chipInst):[])];
    const out=d.slice(0,7)!==S.ref.slice(0,7);
    h+=`<div class="day ${out?'out':''} ${fds(d)?'we':''} ${d===HOJE?'today':''}"><button class="dn" data-act="dia" data-d="${d}" aria-label="Abrir dia ${br(d)}">${+d.slice(8)}</button>${it.slice(0,5).join('')}${it.length>5?`<button class="more" data-act="dia" data-d="${d}">+${it.length-5} mais</button>`:''}</div>`;
  }
  return h+'</div><p class="muted small" style="margin-top:8px">Cor = equipe. Tracejado = entrega de material. Faixa vermelha = atrasado. Clique no número do dia para ver tudo ou agendar uma obra.</p>';
}
function calEq(){
  const y=+S.ref.slice(0,4),mo=+S.ref.slice(5,7),n=new Date(y,mo,0).getDate(),d0=S.ref,dn=add(d0,n-1);
  const tpl=`grid-template-columns:150px repeat(${n},minmax(36px,1fr))`,cg=carga(),ob=visiveis();
  const cel=(i,L,x='')=>{const d=add(d0,i);return`<div class="tlc ${fds(d)?'we':''} ${d===HOJE?'today':''} ${x}" style="grid-column:${i+2};grid-row:1/span ${L}"></div>`};
  let h=`<div class="tlw"><div class="tl" style="min-width:${150+n*36}px"><div class="tlr hd" style="${tpl}"><div class="tll">Equipe</div>`;
  for(let i=0;i<n;i++){const d=add(d0,i);h+=`<div class="tlh ${d===HOJE?'today':''}">${DSEM[(dt(d).getDay()+6)%7][0]}<b>${i+1}</b></div>`}
  h+='</div>';
  if(S.me){const ev=eventos();h+=`<div class="tlr" style="${tpl}"><div class="tll">Entregas</div>`;
    for(let i=0;i<n;i++){const d=add(d0,i),e=(ev.get(d)||{ent:[]}).ent;h+=cel(i,1)+(e.length?`<button class="tlb" style="grid-column:${i+2};grid-row:1;text-align:center;padding:0;background:var(--surface2);border:1px dashed var(--muted)" data-act="dia" data-d="${d}" title="${e.length} entrega(s) em ${br(d)}">${e.length}</button>`:'')}
    h+='</div>'}
  if(S.mi)for(const e of S.cfg.equipes.filter(e=>e.ativa&&(!S.eq||S.eq===e.id))){
    const bars=ob.filter(o=>o.equipe===e.id&&o.iniPrev).map(o=>{let a=o.iniPrev,b=o.fimReal||o.fimPrev||o.iniPrev;if(b<a)a=b;return{o,a,b}}).filter(x=>x.a<=dn&&x.b>=d0).sort((p,q)=>p.a<q.a?-1:1);
    const lanes=[];for(const x of bars){let l=lanes.findIndex(z=>z<x.a);if(l<0){l=lanes.length;lanes.push('')}lanes[l]=x.b;x.l=l}
    const L=Math.max(1,lanes.length);
    h+=`<div class="tlr" style="${tpl}"><div class="tll" style="grid-row:1/span ${L}">${eqChip(e.id)}<span class="muted small">${esc(e.base||'')}</span></div>`;
    for(let i=0;i<n;i++)h+=cel(i,L,(cg.get(e.id+'|'+add(d0,i))||[]).length>(e.cap||1)?'conf':'');
    for(const x of bars){const a=Math.max(0,diff(x.a,d0)),b=Math.min(n-1,diff(x.b,d0)),late=!x.o.fimReal&&x.o.fimPrev<HOJE;
      h+=`<button class="tlb eq ${x.o.fimReal?'fin':''} ${late?'late':''}" style="--h:${e.h};grid-column:${a+2}/${b+3};grid-row:${x.l+1}" data-obra="${esc(x.o.cod)}" title="${esc(tit(x.o))} · ${br(x.o.iniPrev)} a ${br(x.o.fimReal||x.o.fimPrev)}">${x.o.fimReal?'✓ ':''}${esc(curto(tit(x.o)))}</button>`}
    h+='</div>';
  }
  return h+'</div></div><p class="muted small" style="margin-top:8px">Fundo amarelo = equipe com mais obras no dia do que a capacidade definida em Equipes e metas.</p>';
}
function mDia(d){
  const e=eventos().get(d)||{inst:[],ent:[]};
  modal(`<h2>${DSEM[(dt(d).getDay()+6)%7]}, ${brA(d)}</h2>
   <h3 class="sec" style="margin-top:0">Instalações (${e.inst.length})</h3><div class="list">${e.inst.map(o=>linha(o)).join('')||'<span class="muted">Nenhuma instalação.</span>'}</div>
   <h3 class="sec">Entregas de material (${e.ent.length})</h3><div class="list">${e.ent.map(o=>linha(o,o.matReal?'Entregue':'Prevista')).join('')||'<span class="muted">Nenhuma entrega.</span>'}</div>
   <div class="acts"><button class="btn p" data-act="escolher" data-d="${d}">Agendar obra neste dia</button><button class="btn" data-act="fechar">Fechar</button></div>`);
}
const linha=(o,x)=>{const k=calc(o);return`<button class="row" data-obra="${esc(o.cod)}"><span class="g"><b>${esc(tit(o))}</b><br><span class="muted small">${esc(o.cod)} · ${esc(o.cidade||'')}${o.kwp!=null?' · '+num(o.kwp,2)+' kWp':''}</span></span>${x?`<span class="pill">${x}</span>`:''}${eqChip(o.equipe)}<span class="pill ${k.st==='final'?'ok':'a'}">${ST[k.st]}</span></button>`};
function mEscolher(d){
  const f=[...S.obras.values()].filter(o=>!o.fimReal&&!o.iniPrev).sort(ordFila);
  modal(`<h2>Agendar para ${brA(d)}</h2><p class="muted">Escolha a obra. A equipe sugerida já vem preenchida e você confirma na ficha.</p>
   <div class="list" style="max-height:55vh;overflow:auto">${f.map(o=>`<button class="row" data-act="agendarEm" data-cod="${esc(o.cod)}" data-d="${d}"><span class="g"><b>${esc(tit(o))}</b><br><span class="muted small">${esc(o.cidade||'')} · ${o.mod??'?'} módulos</span></span>${matPill(o)}</button>`).join('')||'<span class="muted">Não há obras aguardando agendamento.</span>'}</div>
   <div class="acts"><button class="btn" data-act="fechar">Cancelar</button></div>`);
}

/* ---------- fila ---------- */
const ordFila=(a,b)=>(!!b.matReal-!!a.matReal)||((a.entrada||'')<(b.entrada||'')?-1:1);
function vFila(){
  const f=visiveis().filter(o=>!o.fimReal&&!o.iniPrev).sort(ordFila);
  if(!f.length)return'<div class="empty">Todas as obras em aberto já têm data de instalação.</div>';
  const pr=f.filter(o=>o.matReal).length;
  return`<p class="muted" style="max-width:75ch">${f.length} obras sem data de instalação, ${pr} delas com material já entregue. A ordem prioriza material entregue e depois a entrada mais antiga. A sugestão usa a equipe que mais atende a cidade e o primeiro dia útil livre dela.</p><div class="list">`+
  f.map(o=>{const k=calc(o),s=sugerir(o);
    return`<div class="row"><button class="g" data-obra="${esc(o.cod)}" style="border:0;background:none;text-align:left;padding:0"><b>${esc(tit(o))}</b><br><span class="muted small">${esc(o.cod)} · ${esc(o.cidade||'')} · ${o.mod??'?'} módulos${o.kwp!=null?' · '+num(o.kwp,2)+' kWp':''}</span></button>
    ${matPill(o)}<span class="pill ${k.cls}">${dias(k.aberto)} em aberto</span>
    <span class="small">Sugestão: ${s.eq?eqChip(s.eq):'<span class="muted">sem equipe</span>'} em <b>${br(s.d)}</b></span>
    <button class="btn s p" data-act="agendarEm" data-cod="${esc(o.cod)}" data-d="${s.d}" data-eq="${esc(s.eq||'')}">Agendar</button></div>`}).join('')+'</div>';
}

/* ---------- alertas ---------- */
function vAlertas(){
  const vis=new Set(visiveis().map(o=>o.cod)),al=alertas().filter(a=>a.t==='conflito'?(!S.eq||S.eq===a.eq):vis.has(a.cod));
  if(!al.length)return'<div class="empty"><h2>Nenhum alerta</h2><p>Tudo dentro do previsto.</p></div>';
  const cr=al.filter(a=>a.sev==='crit').length;
  let h=`<div class="tiles"><div class="tile crit"><b>${cr}</b><span>críticos</span></div><div class="tile warn"><b>${al.length-cr}</b><span>de atenção</span></div></div>`;
  for(const t of Object.keys(TA)){const l=al.filter(a=>a.t===t);if(!l.length)continue;
    h+=`<h3 class="sec">${TA[t]} <span class="pill ${l[0].sev}">${l.length}</span></h3><div class="list">`+l.map(a=>`<button class="row ${a.sev}" data-obra="${esc(a.cod)}"><span class="g"><b>${t==='conflito'?esc(a.tx):esc(tit(a.o))}</b>${t==='conflito'?'':`<br><span class="muted small">${esc(a.tx)}</span>`}</span>${t==='conflito'?'':eqChip(a.o.equipe)}</button>`).join('')+'</div>'}
  return h;
}

/* ---------- relatórios ---------- */
function dadosRel(){
  const ob=visiveis().filter(o=>!o.fora),fin=ob.filter(o=>o.fimReal),meses=[...new Set([...S.obras.values()].filter(o=>o.fimReal&&!o.fora).map(o=>o.fimReal.slice(0,7)))].sort();
  const sel=fin.filter(o=>!S.rep.mes||o.fimReal.slice(0,7)===S.rep.mes).map(o=>({o,k:calc(o)}));
  const com=sel.filter(x=>x.k.desvio!=null),atr=com.filter(x=>x.k.desvio>S.rep.min);
  return{ob,fin,meses,sel,com,atr};
}
const nomeMes=m=>MESES[+m.slice(5)-1]+'/'+m.slice(0,4);
function vRel(){
  const R=dadosRel(),{sel,com,atr}=R,N=S.rep.min;
  const noPrazo=com.filter(x=>x.k.desvio<=0).length,lt=sel.filter(x=>x.k.aberto!=null);
  const mLt=lt.length?lt.reduce((a,x)=>a+x.k.aberto,0)/lt.length:0,dentro=lt.filter(x=>x.k.aberto<=S.cfg.metaDias).length;
  const mAt=atr.length?atr.reduce((a,x)=>a+x.k.desvio,0)/atr.length:0,pior=[...atr].sort((a,b)=>b.k.desvio-a.k.desvio)[0];
  const per=S.rep.mes?'Em '+nomeMes(S.rep.mes):'No período todo';
  const abertas=R.ob.filter(o=>!o.fimReal&&calc(o).desvio>0).map(o=>({o,k:calc(o)})).sort((a,b)=>b.k.desvio-a.k.desvio);
  let h=`<div class="bar"><label class="f">Finalizadas em <select id="rmes"><option value="">Todo o período</option>${R.meses.map(m=>`<option value="${m}"${S.rep.mes===m?' selected':''}>${nomeMes(m)}</option>`).join('')}</select></label>
   <label class="f">Contar atraso maior que <span><input type="number" id="rmin" min="0" max="365" value="${N}" style="width:70px"> dias</span></label>
   <label class="ck f" style="align-self:flex-end;padding-bottom:7px"><input type="checkbox" id="rso" ${S.rep.so?'checked':''}> Mostrar só as atrasadas</label><span class="sp"></span>
   <button class="btn" data-act="copiarRel">Copiar resumo</button><button class="btn p" data-act="baixarRel" id="bx">Baixar Excel</button></div>
  <div class="resumo" id="resumo">${per}, ${sel.length} ${sel.length===1?'obra foi finalizada':'obras foram finalizadas'} e <b>${atr.length} ${atr.length===1?'atrasou':'atrasaram'} mais de ${dias(N)}</b> em relação à data programada.${pior?` A maior diferença foi ${esc(tit(pior.o))}: programada para ${br(pior.k.bFim)} e finalizada em ${br(pior.o.fimReal)}, ${dias(pior.k.desvio)} depois.`:''} O prazo médio da entrada até a finalização foi de ${num(mLt,1)} dias.</div>
  <div class="tiles"><div class="tile"><b>${sel.length}</b><span>finalizadas</span></div><div class="tile ok"><b>${noPrazo}</b><span>na data programada ou antes</span></div>
   <div class="tile ${atr.length?'crit':'ok'}"><b>${atr.length}</b><span>atrasaram mais de ${dias(N)}</span></div><div class="tile"><b>${num(mAt,1)}</b><span>dias de atraso médio (das atrasadas)</span></div>
   <div class="tile"><b>${num(mLt,1)}</b><span>dias da entrada à finalização</span></div><div class="tile"><b>${lt.length?Math.round(dentro/lt.length*100):0}%</b><span>dentro da meta de ${S.cfg.metaDias} dias</span></div></div>`;
  const lin=(S.rep.so?atr:sel).slice().sort((a,b)=>(b.k.desvio??-999)-(a.k.desvio??-999));
  h+=`<div class="rep"><table><thead><tr><th>Obra</th><th>Equipe</th><th>Programado</th><th>Realizado</th><th>Diferença</th><th>Reprogramações</th><th>Entrada → fim</th></tr></thead><tbody>`+
   (lin.map(({o,k})=>`<tr data-obra="${esc(o.cod)}"><td><b>${esc(tit(o))}</b><br><span class="muted small">${esc(o.cod)} · ${esc(o.cidade||'')}</span></td><td>${eqChip(o.equipe)}</td>
    <td>${k.bFim?`${br(k.bIni)} a ${br(k.bFim)}<br><span class="muted small">${dias(k.durPrev)}</span>`:'<span class="muted">sem programação</span>'}</td>
    <td>${br(k.iR)} a ${br(o.fimReal)}<br><span class="muted small">${k.durReal?dias(k.durReal):''}</span></td>
    <td>${k.desvio==null?'—':k.desvio>0?`<span class="pill crit">+${dias(k.desvio)}</span>`:k.desvio<0?`<span class="pill ok">${dias(k.desvio)}</span>`:'<span class="pill ok">na data</span>'}</td>
    <td>${k.reprog||'—'}</td><td><span class="pill ${k.cls}">${dias(k.aberto)}</span></td></tr>`).join('')||'<tr><td colspan="7" class="muted">Nenhuma obra neste filtro.</td></tr>')+'</tbody></table></div>';
  // por mês e por equipe
  const pm=R.meses.map(m=>{const l=R.fin.filter(o=>o.fimReal.slice(0,7)===m).map(o=>calc(o).aberto).filter(x=>x!=null);return{m,v:l.length?l.reduce((a,b)=>a+b,0)/l.length:0,n:l.length}});
  const mx=Math.max(S.cfg.limiteDias+10,...pm.map(x=>x.v));
  const pe={};for(const{o,k}of sel){const e=pe[o.equipe||'-']||(pe[o.equipe||'-']={n:0,a:0,s:0});e.n++;if(k.desvio>N)e.a++;e.s+=k.aberto||0}
  h+=`<div class="two"><div class="panel"><h3>Prazo médio da entrada à finalização, por mês</h3>${pm.map(x=>`<div class="hb"><span>${MESES[+x.m.slice(5)-1].slice(0,3)}/${x.m.slice(2,4)}</span><span class="tr"><i class="${x.v<=S.cfg.metaDias?'ok':x.v<=S.cfg.limiteDias?'warn':'crit'}" style="width:${x.v/mx*100}%"></i><u style="left:${S.cfg.metaDias/mx*100}%" title="Meta"></u></span><span>${num(x.v,1)} d</span></div>`).join('')}<p class="muted small">Traço vertical = meta de ${S.cfg.metaDias} dias.</p></div>
   <div class="panel"><h3>Por equipe (${S.rep.mes?nomeMes(S.rep.mes):'todo o período'})</h3>${Object.keys(pe).sort((a,b)=>pe[b].n-pe[a].n).map(e=>`<div class="row" style="border:0;padding:4px 0">${eqChip(e==='-'?null:e)}<span class="g small">${pe[e].n} finalizadas · ${pe[e].a} com atraso maior que ${dias(N)}</span><span class="small muted">${num(pe[e].s/pe[e].n,1)} d em média</span></div>`).join('')||'<span class="muted">Sem dados.</span>'}</div></div>`;
  if(abertas.length)h+=`<h3 class="sec">Em aberto, já passadas da data programada <span class="pill crit">${abertas.length}</span></h3><div class="list">${abertas.map(({o,k})=>`<button class="row crit" data-obra="${esc(o.cod)}"><span class="g"><b>${esc(tit(o))}</b><br><span class="muted small">Programada para terminar em ${br(k.bFim)}</span></span>${eqChip(o.equipe)}<span class="pill crit">+${dias(k.desvio)} até hoje</span></button>`).join('')}</div>`;
  return h+'<p class="muted small" style="max-width:75ch;margin-top:14px">A data programada é a primeira agenda registrada para a obra. Nas obras trazidas da planilha, vale a última previsão que estava anotada lá, por isso a maioria aparece na data. Daqui para frente, cada reprogramação fica guardada no histórico da obra.</p>';
}
function linhasRel(){const{sel,atr}=dadosRel();return(S.rep.so?atr:sel).map(({o,k})=>({'Código':o.cod,'Cliente':tit(o),'Cidade':o.cidade||'','Equipe':eqNome(o.equipe),'Entrada':brA(o.entrada),
  'Início programado':brA(k.bIni),'Fim programado':brA(k.bFim),'Dias programados':k.durPrev??'','Início realizado':brA(k.iR),'Finalizado em':brA(o.fimReal),'Dias realizados':k.durReal??'',
  'Diferença (dias)':k.desvio??'','Reprogramações':k.reprog,'Dias da entrada à finalização':k.aberto??''}))}

const matPill=o=>o.matReal?`<span class="pill ok">Material entregue ${br(o.matReal)}</span>`:o.matPrev?`<span class="pill ${o.matPrev<HOJE?'crit':''}">Material previsto ${br(o.matPrev)}</span>`:'<span class="pill warn">Material sem previsão</span>';
/* ---------- navegação e casca ---------- */
const TIT={calendario:'Cronograma de instalação',fila:'Fila de agendamento',alertas:'Alertas',entregas:'Agenda de entregas',relatorios:'Indicadores de obras',equipes:'Equipes de instalação',config:'Configurações do cronograma'};
function rota(){const h=location.hash.slice(1);S.view=TIT[h]?h:'calendario';render()}
addEventListener('hashchange',rota);
function casca(){
  document.querySelectorAll('[data-nav]').forEach(b=>b.classList.toggle('on',b.dataset.nav===S.view));
  $('#titulo').textContent=TIT[S.view];
  const fs=$('#ffil'),es=$('#feq');
  fs.innerHTML='<option value="">Todas as filiais</option>'+['WB','LD','PG','Outras'].map(f=>`<option value="${f}"${S.fil===f?' selected':''}>${FIL[f]||f}</option>`).join('');
  es.innerHTML='<option value="">Todas as equipes</option>'+S.cfg.equipes.map(e=>`<option value="${esc(e.id)}"${S.eq===e.id?' selected':''}>${esc(e.nome)}</option>`).join('')+`<option value="-"${S.eq==='-'?' selected':''}>Sem equipe</option>`;
  const al=alertas().filter(a=>a.sev==='crit').length,fl=[...S.obras.values()].filter(o=>!o.fimReal&&!o.iniPrev).length;
  $('#nAl').hidden=!al;$('#nAl').textContent=al;$('#nFila').hidden=!fl;$('#nFila').textContent=fl;$('#nFila').style.cssText='background:var(--surface2);color:var(--muted)';
  document.body.classList.toggle('ro',!S.pode);
  const filtros=!['equipes','config'].includes(S.view);['#fq','#ffil','#feq'].forEach(s=>$(s).hidden=!filtros);
}
function render(){
  casca();const v=$('#view');
  if(!S.ok){v.innerHTML='<div class="empty">Carregando obras…</div>';return}
  if(!S.obras.size&&!['equipes','config'].includes(S.view)){v.innerHTML=`<div class="empty"><h2>Nenhuma obra cadastrada</h2><p>Cadastre a primeira obra pelo contrato.</p>${S.pode?'<p><button class="btn p" data-act="nova">+ Nova obra</button></p>':''}</div>`;return}
  v.innerHTML=({calendario:vCal,fila:vFila,alertas:vAlertas,entregas:vEntregas,relatorios:vRel,equipes:vEquipes,config:vConfig})[S.view]();
}

/* ---------- entregas de material (Logística) ---------- */
function vEntregas(){
  const ab=visiveis().filter(o=>!o.fimReal),s0=seg(HOJE),fim=add(s0,13);
  const atras=ab.filter(o=>!o.matReal&&o.matPrev&&o.matPrev<HOJE).sort((a,b)=>a.matPrev<b.matPrev?-1:1);
  const prox=ab.filter(o=>!o.matReal&&o.matPrev&&o.matPrev>=HOJE&&o.matPrev<=fim).sort((a,b)=>a.matPrev<b.matPrev?-1:1);
  const sem=ab.filter(o=>!o.matReal&&!o.matPrev).sort((a,b)=>(a.entrada||'')<(b.entrada||'')?-1:1);
  const chegou=ab.filter(o=>o.matReal&&o.matReal>=add(HOJE,-7)).sort((a,b)=>a.matReal<b.matReal?1:-1);
  const lin=o=>`<div class="row"><button class="g" data-obra="${esc(o.cod)}" style="border:0;background:none;text-align:left;padding:0"><b>${esc(tit(o))}</b><br><span class="muted small">${esc(o.cod)} · ${esc(o.cidade||'')} · ${o.mod??'?'} módulos${o.envio?' · '+esc(o.envio):''}${o.kit?' · kit comprado':''}</span></button>${matPill(o)}${o.pagNa==='entrega'?'<span class="pill imp">Pagamento na entrega</span>':''}${o.iniPrev?`<span class="pill">Instalação ${br(o.iniPrev)}</span>`:''}${S.pode&&!o.matReal?`<button class="btn s" data-act="chegou" data-cod="${esc(o.cod)}">Chegou hoje</button>`:''}</div>`;
  const bloco=(t,l,cls)=>l.length?`<h3 class="sec">${t} <span class="pill ${cls||''}">${l.length}</span></h3><div class="list">${l.map(lin).join('')}</div>`:'';
  return `<div class="tiles"><div class="tile ${atras.length?'crit':'ok'}"><b>${atras.length}</b><span>entregas atrasadas</span></div><div class="tile"><b>${prox.length}</b><span>previstas nas próximas 2 semanas</span></div><div class="tile warn"><b>${sem.length}</b><span>sem previsão de entrega</span></div><div class="tile ok"><b>${chegou.length}</b><span>chegaram nos últimos 7 dias</span></div></div>`
    +bloco('Atrasadas',atras,'crit')+bloco('Próximas 2 semanas',prox)+bloco('Sem previsão',sem,'warn')+bloco('Chegaram nos últimos 7 dias',chegou,'ok')
    +(atras.length+prox.length+sem.length+chegou.length?'':'<div class="empty">Nenhuma entrega pendente.</div>');
}

/* ---------- gaveta da obra ---------- */
const inp=(f,l,v,t='text',x='',w='')=>`<label class="${w}">${l}<input type="${t}" id="o_${f}" data-f="${f}" value="${esc(v??'')}" ${x} ${S.pode?'':'disabled'}></label>`;
const sel=(f,l,v,ops,x='')=>`<label>${l}<select id="o_${f}" data-f="${f}" ${x} ${S.pode?'':'disabled'}><option value="">—</option>${ops.map(o=>{const[a,b]=Array.isArray(o)?o:[o,o];return`<option value="${esc(a)}"${a===v?' selected':''}>${esc(b)}</option>`}).join('')}</select></label>`;
const moeda=v=>v==null?'—':Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
function abrir(cod,pre){S.sel=cod;S.pre=pre||null;gaveta();$('#drawer').classList.add('on');$('#scrim').classList.add('on');fecharModal();carregarHist(cod)}
function fechar(){S.sel=null;$('#drawer').classList.remove('on');$('#scrim').classList.remove('on')}
function campoTopico(t,v,dis){
  const id=`data-top="${esc(t.id)}"`,d=dis?'disabled':'';
  if(t.tipo==='simnao')return`<select ${id} ${d}><option value="">—</option><option value="sim"${v==='sim'?' selected':''}>Sim</option><option value="nao"${v==='nao'?' selected':''}>Não</option></select>`;
  if(t.tipo==='lista')return`<select ${id} ${d}><option value="">—</option>${(t.opcoes||[]).map(o=>`<option${o===v?' selected':''}>${esc(o)}</option>`).join('')}</select>`;
  return`<input ${id} ${d} type="${t.tipo==='numero'?'number':t.tipo==='data'?'date':'text'}" value="${esc(v??'')}">`;
}
function topicosHtml(o){
  const fixos=S.cfg.topicos.filter(t=>t.ativo).map(t=>`<label class="topico"><span>${t.importante?'<span class="imp">★</span> ':''}${esc(t.nome)}</span>${campoTopico(t,(o.top||{})[t.id],!S.pode)}</label>`).join('');
  const extras=(o.topx||[]).map((t,i)=>`<label class="topico"><span>${t.importante?'<span class="imp">★</span> ':''}${esc(t.nome)}</span><span style="display:flex;gap:4px"><input data-topx="${i}" value="${esc(t.valor??'')}" ${S.pode?'':'disabled'} placeholder="anotação">${S.pode?`<button class="btn s d" data-act="tiraTopico" data-i="${i}" title="Excluir este tópico">×</button>`:''}</span></label>`).join('');
  return`<div class="fg" style="grid-template-columns:1fr">${fixos}${extras}</div>${S.pode?`<div class="acts"><button class="btn s" data-act="maisTopico">+ Tópico só desta obra</button></div>`:''}`;
}
function gaveta(){
  const o=S.obras.get(S.sel),d=$('#drawer');if(!o){fechar();return}
  const k=calc(o),p=S.pre||{},tinha=!!o.iniPrev,eqs=S.cfg.equipes.filter(e=>e.ativa||e.id===o.equipe).map(e=>[e.id,e.nome+(e.base?' · '+e.base:'')]);
  const sg=!tinha&&!o.fimReal?sugerir(o):null,vEq=p.eq||o.equipe||sg?.eq||'',vIni=p.d||o.iniPrev||sg?.d||'',vFim=p.d||o.fimPrev||sg?.d||'';
  const cid=[...new Set([...S.obras.values()].map(x=>x.cidade).filter(Boolean))].sort();
  const imp=[...S.cfg.topicos.filter(t=>t.ativo&&t.importante&&(o.top||{})[t.id]==='sim').map(t=>t.nome),...(o.topx||[]).filter(t=>t.importante).map(t=>t.nome)];
  d.innerHTML=`<div class="dh"><div style="flex:1"><h2>${esc(tit(o))}</h2><span class="muted">${esc(o.cod)}${o.nomeContrato?' · Contrato '+esc(o.nomeContrato):''}${o.pedido?' · Pedido '+esc(o.pedido):''} · ${esc(FIL[filial(o)]||filial(o))}</span></div><button class="x" data-act="fecharG" aria-label="Fechar">×</button></div>
  <div class="ln" style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 18px"><span class="pill ${k.st==='final'?'ok':'a'}">${ST[k.st]}</span>${k.aberto!=null?`<span class="pill ${k.cls}">${dias(k.aberto)} ${o.fimReal?'da entrada ao fim':'em aberto'}</span>`:''}${o.equipe?eqChip(o.equipe):''}${imp.map(n=>`<span class="pill imp">★ ${esc(n)}</span>`).join('')}${o.fora?'<span class="pill">fora dos indicadores</span>':''}</div>
  <div class="step done"><h3>Venda e contrato</h3><div class="fg">${inp('card','Nome do card',o.card,'text','','w')}${inp('cliente','Cliente',o.cliente,'text','','w')}${inp('nomeContrato','Nome do contrato',o.nomeContrato)}${inp('entrada','Data de entrada',o.entrada,'date')}
   ${inp('cidade','Cidade',o.cidade,'text','list="dlc"')}${sel('zona','Zona',o.zona,['Urbano','Rural'])}${inp('kwp','Potência (kWp)',o.kwp,'number','step="0.01" min="0"')}${inp('mod','Módulos',o.mod,'number','step="1" min="0"')}
   ${sel('estrut','Estrutura',o.estrut,S.cfg.estruturas)}${sel('envio','Envio do material',o.envio,['Estoque','Distribuidora'])}${inp('valor','Valor do contrato (R$)',o.valor,'number','step="0.01" min="0"')}${inp('assinado','Assinado em',o.assinado,'date')}
   ${inp('formaPag','Forma de pagamento',o.formaPag,'text','','w')}${sel('pagNa','Pagamento vinculado',o.pagNa,[['entrega','Na entrega do material'],['instalacao','Na instalação']])}${inp('pedido','Nº do pedido no Flow',o.pedido)}
   ${inp('end','Endereço',o.end,'text','','w')}${inp('cpf','CPF/CNPJ',o.cpf)}${inp('email','E-mail do cliente',o.email,'email')}</div><datalist id="dlc">${cid.map(c=>`<option value="${esc(c)}">`).join('')}</datalist>
   ${(o.equip||[]).length?`<ul class="equip">${o.equip.map(e=>`<li>${esc(e.quantidade)}× ${esc(e.produto)}</li>`).join('')}</ul>`:''}
   ${o.assinado?`<div class="note">Pelo contrato, a instalação é agendada em até 90 dias após o pagamento${o.financ?' (financiamento: depende da liberação)':''}.</div>`:''}</div>
  <div class="step"><h3>Tópicos</h3>${topicosHtml(o)}</div>
  <div class="step ${o.matReal?'done':'now'}"><h3>Material</h3><div class="fg">${inp('matPrev','Previsão de entrega',o.matPrev,'date')}${inp('matReal','Entregue em',o.matReal,'date')}</div>
   <div class="acts"><label class="ck f"><input type="checkbox" id="o_kit" data-f="kit" ${o.kit?'checked':''} ${S.pode?'':'disabled'}> Kit de estrutura comprado</label>${!o.matReal&&S.pode?'<button class="btn s" data-act="rapido" data-f="matReal">Chegou hoje</button>':''}</div></div>
  <div class="step ${tinha?'done':o.matReal?'now':''}"><h3>Agendamento</h3><div class="fg">${sel('equipe','Equipe',vEq,eqs,'data-ag')}<label>Início previsto<input type="date" id="o_iniPrev" value="${esc(vIni)}" ${S.pode?'':'disabled'}></label><label>Fim previsto<input type="date" id="o_fimPrev" value="${esc(vFim)}" ${S.pode?'':'disabled'}></label>
   ${tinha?`<label class="w">Motivo da reprogramação (obrigatório se mudar as datas)<select id="o_motivo" ${S.pode?'':'disabled'}><option value="">—</option>${S.cfg.motivos.map(m=>`<option>${esc(m)}</option>`).join('')}</select></label>`:''}</div>
   ${sg&&!p.d?`<div class="note">Sugestão preenchida: ${sg.eq?esc(eqNome(sg.eq)):'sem equipe habitual na cidade'}, primeiro dia útil livre em ${br(sg.d)}. Ajuste se precisar e salve.</div>`:''}
   ${tinha&&(k.bIni!==o.iniPrev||k.bFim!==o.fimPrev)?`<div class="note">Programação original: ${br(k.bIni)} a ${br(k.bFim)}. Reprogramada ${k.reprog?k.reprog+' vez(es)':''}.</div>`:''}
   <div class="err" id="e_ag"></div>${S.pode&&!o.fimReal?`<div class="acts"><button class="btn p" data-act="salvarAg">${tinha?'Salvar reprogramação':'Agendar instalação'}</button></div>`:''}</div>
  <div class="step ${o.fimReal?'done':k.st==='inst'?'now':''}"><h3>Instalação</h3><div class="fg">${inp('iniReal','Início realizado',o.iniReal,'date')}${inp('fimReal','Finalizada em',o.fimReal,'date')}</div>
   ${o.fimReal&&k.desvio!=null?`<div class="note">${k.desvio>0?`Finalizada ${dias(k.desvio)} depois da data programada (${br(k.bFim)}).`:k.desvio<0?`Finalizada ${dias(-k.desvio)} antes da data programada (${br(k.bFim)}).`:'Finalizada na data programada.'}${k.durPrev&&k.durReal?` Programada para ${dias(k.durPrev)}, levou ${dias(k.durReal)}.`:''}</div>`:''}
   ${S.pode&&!o.fimReal?`<div class="acts">${!o.iniReal?'<button class="btn s" data-act="rapido" data-f="iniReal">Iniciou hoje</button>':''}<button class="btn s" data-act="rapido" data-f="fimReal">Finalizou hoje</button></div>`:''}</div>
  <div class="step"><h3>Observações</h3><div class="fg"><label class="w"><span class="muted">Anotações da obra</span><textarea id="o_obs" data-f="obs" rows="2" ${S.pode?'':'disabled'}>${esc(o.obs||'')}</textarea></label>
   <label class="ck f"><input type="checkbox" data-f="fora" ${o.fora?'checked':''} ${S.pode?'':'disabled'}> Fora dos indicadores (ex.: licitação)</label></div><div class="err" id="e_o"></div></div>
  <div class="step ${o.ctPath?'done':''}"><h3>Contrato</h3>${o.ctPath?`<div class="acts"><a class="btn s" href="/obras/contrato/${encodeURIComponent(o.cod)}" target="_blank" rel="noopener">Abrir ${esc(o.ctNome||'contrato')}</a>${S.pode?'<button class="btn s d" data-act="removerCt">Remover</button>':''}</div>`:'<span class="muted">Nenhum contrato anexado.</span>'}
   ${S.pode?`<div class="fg" style="margin-top:8px"><label class="w">${o.ctPath?'Trocar o contrato (PDF)':'Anexar contrato (PDF)'}<input type="file" id="g_ct" accept=".pdf,application/pdf"></label></div>`:''}</div>
  <div class="step"><h3>Histórico</h3><ul class="hist" id="hist">${histHtml(o)}</ul>
   ${S.pode?`<div class="acts"><button class="btn s d" data-act="excluir">Excluir obra</button></div>`:''}</div>`;
}
const ROT={entrada:'Data de entrada',material_previsto:'Previsão de entrega',material_entregue:'Entrega do material',inicio_previsto:'Início previsto',fim_previsto:'Fim previsto',inicio_real:'Início realizado',fim_real:'Finalização',equipe_id:'Equipe',criada:'Obra criada',contrato_nome:'Contrato',nome_card:'Nome do card',pagamento_na:'Pagamento vinculado'};
const fv=(c,v)=>v==null||v===''?'vazio':c==='equipe_id'?eqNome(v):c==='criada'?({manual:'manual',contrato:'pelo contrato',planilha:'da planilha',flow:'do Flow'}[v]||v):/^\d{4}-\d\d-\d\d$/.test(v)?brA(v):v;
function histHtml(o){const h=S.hist[o.cod];if(!h)return'<li class="muted">Carregando…</li>';if(!h.length)return'<li class="muted">Sem alterações registradas.</li>';
  return h.map(x=>`<li><b>${esc(ROT[x.campo]||x.campo)}</b>${x.campo==='criada'?' '+esc(fv('criada',x.para)):`: ${x.de!=null?esc(fv(x.campo,x.de))+' → ':''}${esc(fv(x.campo,x.para))}`}${x.motivo?` · motivo: ${esc(x.motivo)}`:''}<br><span class="muted small">${new Date(x.em).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}${x.usuario?' · '+esc(S.nomes[x.usuario]||'alguém'):''}</span></li>`).join('')}
async function carregarHist(cod){
  const {data}=await sb.from('obra_historico').select('campo,de,para,motivo,usuario,em').eq('obra',cod).order('em',{ascending:false}).limit(200);
  S.hist[cod]=data||[];if(S.sel===cod){const el=$('#hist');if(el)el.innerHTML=histHtml(S.obras.get(cod))}
}

/* ---------- gravação ---------- */
// Nome na tela → coluna no banco
const COL={card:'nome_card',nomeContrato:'nome_contrato',cliente:'cliente',filial:'filial',cidade:'cidade',zona:'zona',kwp:'kwp',mod:'modulos',estrut:'estrutura',envio:'envio',
  cpf:'cpf_cnpj',end:'endereco',cep:'cep',email:'email_cliente',ger:'geracao_kwh',equip:'equipamentos',valor:'valor',formaPag:'forma_pagamento',financ:'financiamento',assinado:'assinado_em',
  pagNa:'pagamento_na',pedido:'pedido_flow',entrada:'entrada',matPrev:'material_previsto',matReal:'material_entregue',kit:'kit_comprado',equipe:'equipe_id',iniPrev:'inicio_previsto',
  fimPrev:'fim_previsto',bIni:'baseline_inicio',bFim:'baseline_fim',iniReal:'inicio_real',fimReal:'fim_real',obs:'observacoes',top:'topicos',topx:'topicos_extra',fora:'fora_indicadores',
  ctPath:'contrato_path',ctNome:'contrato_nome',origem:'origem'};
const daLinha=r=>{const o={cod:r.codigo};for(const[k,c]of Object.entries(COL))o[k]=r[c]??null;o.kwp=o.kwp==null?null:Number(o.kwp);o.valor=o.valor==null?null:Number(o.valor);o.top=r.topicos||{};o.topx=r.topicos_extra||[];o.equip=r.equipamentos||[];return o};
const paraBanco=patch=>{const p={};for(const[k,v]of Object.entries(patch))if(COL[k])p[COL[k]]=v;return p};
function msgErro(e){const m=String(e&&e.message||'');
  if(/motivo/i.test(m))return'Informe o motivo da reprogramação.';
  if(/42501|só pode consultar|row-level/i.test(m+(e&&e.code)))return'Seu perfil só pode consultar o cronograma.';
  if(/duplicate|23505/.test(m+(e&&e.code)))return'Já existe uma obra com esse código.';
  if(/check constraint|23514/i.test(m+(e&&e.code)))return'Alguma data não fecha com as outras (entrega antes da entrada, fim antes do início ou ano fora de 2024–2030). Confira.';
  return'Não foi possível salvar. Tente de novo.'}
async function salvar(cod,patch,motivo){
  if(!S.pode){toast('Seu perfil só pode consultar o cronograma.');return false}
  const {error}=await sb.rpc('obra_salvar',{p_codigo:cod,p_patch:paraBanco(patch),p_motivo:motivo||null});
  if(error){toast(msgErro(error));return false}
  const o=S.obras.get(cod);if(o)Object.assign(o,patch);toast('Salvo');recarregar();return true;
}
const dataOk=v=>!v||(/^\d{4}-\d\d-\d\d$/.test(v)&&v>='2024-01-01'&&v<='2030-12-31');
function validar(o,f,v){
  if(['entrada','matPrev','matReal','iniReal','fimReal','assinado'].includes(f)&&!dataOk(v))return'Data fora do intervalo aceito (2024 a 2030). Confira o ano.';
  const n={...o,[f]:v};
  if(f==='cliente'&&!v)return'O nome do cliente é obrigatório.';
  if(f==='entrada'&&!v)return'A data de entrada é obrigatória.';
  if((f==='matReal'||f==='iniReal'||f==='fimReal')&&v>HOJE)return'Essa data é de algo já realizado e não pode ficar no futuro.';
  const em=(...c)=>c.includes(f);
  if(em('matReal','entrada')&&n.matReal&&n.entrada&&n.matReal<n.entrada)return'A entrega do material não pode ser anterior à data de entrada.';
  if(em('matPrev','entrada')&&n.matPrev&&n.entrada&&n.matPrev<n.entrada)return'A previsão de entrega não pode ser anterior à data de entrada.';
  if(em('fimReal','iniReal')&&n.fimReal&&n.iniReal&&n.fimReal<n.iniReal)return'A finalização não pode ser anterior ao início realizado.';
  if(em('fimReal','entrada')&&n.fimReal&&n.entrada&&n.fimReal<n.entrada)return'A finalização não pode ser anterior à data de entrada.';
  if(f==='fimReal'&&v&&!n.matReal)return'Informe antes a data em que o material foi entregue.';
  if((f==='kwp'||f==='mod'||f==='valor')&&v!=null&&v<0)return'O valor não pode ser negativo.';
  return'';
}
async function campo(el){
  const o=S.obras.get(S.sel),f=el.dataset.f;if(!o||!f||el.dataset.ag!==undefined)return;
  let v=el.type==='checkbox'?el.checked:el.value.trim();
  if(el.type==='number')v=v===''?null:Number(v);if(v==='')v=null;
  if(f==='cliente'&&v)v=v.toUpperCase();
  if((o[f]??null)===v)return;
  const e=validar(o,f,v);$('#e_o').textContent=e;
  if(e){el.value=o[f]??'';toast(e);return}
  if(await salvar(o.cod,{[f]:v}))S.pre=null;
}
async function salvarTopico(el){
  const o=S.obras.get(S.sel);if(!o)return;
  if(el.dataset.top){const top={...(o.top||{})};const v=el.value.trim();if(v)top[el.dataset.top]=v;else delete top[el.dataset.top];await salvar(o.cod,{top})}
  else if(el.dataset.topx!==undefined){const topx=(o.topx||[]).map((t,i)=>i===+el.dataset.topx?{...t,valor:el.value.trim()}:t);await salvar(o.cod,{topx})}
}
async function salvarAg(){
  const o=S.obras.get(S.sel),eq=$('#o_equipe').value,ini=$('#o_iniPrev').value,fim=$('#o_fimPrev').value||ini,mot=$('#o_motivo')?.value||'',E=$('#e_ag');
  if(!eq){E.textContent='Escolha a equipe.';return}
  if(!ini||!dataOk(ini)||!dataOk(fim)){E.textContent='Informe datas válidas de início e fim.';return}
  if(fim<ini){E.textContent='O fim previsto não pode ser anterior ao início.';return}
  if(o.entrada&&ini<o.entrada){E.textContent='O início não pode ser anterior à data de entrada.';return}
  const tinha=!!o.iniPrev,mud=tinha&&(ini!==o.iniPrev||fim!==(o.fimPrev||o.iniPrev));
  if(mud&&!mot){E.textContent='Informe o motivo da reprogramação.';return}
  const oc=(carga(o.cod).get(eq+'|'+ini)||[]).length;E.textContent='';
  if(await salvar(o.cod,{equipe:eq,iniPrev:ini,fimPrev:fim},mud?mot:null)){S.pre=null;if(oc>=(eqp(eq)?.cap||1))toast(`Salvo. Atenção: ${eqNome(eq)} já tem ${oc} obra(s) em ${br(ini)}.`)}
}
async function rapido(f,cod){const o=S.obras.get(cod||S.sel);const e=validar(o,f,HOJE);if(e){const el=$('#e_o');if(el)el.textContent=e;toast(e);return}
  await salvar(o.cod,{[f]:HOJE})}
let confEx=0;
async function excluir(b){if(Date.now()-confEx>4000){confEx=Date.now();b.textContent='Clique de novo para confirmar a exclusão';return}
  const c=S.sel,{error}=await sb.from('obra_obras').delete().eq('codigo',c);if(error){toast(msgErro(error));return}fechar();toast('Obra excluída');recarregar()}

/* ---------- nova obra (pelo contrato) ---------- */
let NOVO=null; // {path, nome} do contrato enviado
const COD_OK=/^[A-Z0-9][A-Z0-9-]{3,30}$/;
function mNova(){
  NOVO=null;const eqs=S.cfg.equipes.filter(e=>e.ativa).map(e=>[e.id,e.nome+(e.base?' · '+e.base:'')]);
  modal(`<h2>Nova obra</h2>
   <div class="fg"><label class="w">Contrato em PDF: a Central lê os dados e guarda o arquivo na obra<input type="file" id="n_arq" accept=".pdf,application/pdf"></label></div>
   <div id="n_ct" hidden></div>
   <div class="fg" style="margin-top:10px">${inp('n_cod','Código da obra * (ex.: WB260500COL)','','text','style="text-transform:uppercase" maxlength="31"')}${inp('n_card','Nome do card *','')}${inp('n_contrato','Nome do contrato','','text','placeholder="ex.: 1114"')}
   ${inp('n_cliente','Cliente *','','text','','w')}${inp('n_entrada','Data de entrada *',HOJE,'date')}${inp('n_cidade','Cidade','')}${sel('n_zona','Zona','',['Urbano','Rural'])}
   ${inp('n_kwp','Potência (kWp)','','number','step="0.01" min="0"')}${inp('n_mod','Módulos','','number','step="1" min="0"')}${sel('n_estrut','Estrutura','',S.cfg.estruturas)}${sel('n_envio','Envio do material','Estoque',['Estoque','Distribuidora'])}
   ${inp('n_valor','Valor do contrato (R$)','','number','step="0.01" min="0"')}${inp('n_assinado','Assinado em','','date')}${inp('n_formaPag','Forma de pagamento','','text','','w')}
   ${sel('n_pagNa','Pagamento vinculado','',[['entrega','Na entrega do material'],['instalacao','Na instalação']])}${inp('n_matPrev','Previsão de entrega do material','','date')}
   ${inp('n_iniPrev','Previsão de instalação (início)','','date')}${inp('n_fimPrev','Previsão de instalação (fim)','','date')}${sel('n_equipe','Equipe (pode definir depois)','',eqs)}</div>
   <div class="err" id="e_n"></div><div class="acts"><button class="btn p" data-act="criar">Cadastrar obra</button><button class="btn" data-act="fechar">Cancelar</button></div>`);
}
async function api(corpo){const r=await fetch('/obras/api/contrato',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(corpo)});const j=await r.json().catch(()=>({}));if(!r.ok||j.erro)throw new Error(j.erro||'Não foi possível.');return j}
async function enviarPdf(file){
  if(!(file.type==='application/pdf'||/\.pdf$/i.test(file.name)))throw new Error('Só é possível anexar contrato em PDF.');
  if(file.size>20*1024*1024)throw new Error('O PDF passa de 20 MB.');
  const u=await api({acao:'url',nome:file.name});
  const {error}=await sb.storage.from('obra-contratos').uploadToSignedUrl(u.path,u.token,file,{contentType:'application/pdf'});
  if(error)throw new Error('Não foi possível enviar o PDF.');
  return u.path;
}
async function lerContrato(file){
  const N=$('#n_ct');N.hidden=false;N.className='note';N.textContent='Enviando e lendo o contrato…';
  try{
    const path=await enviarPdf(file);NOVO={path,nome:file.name.slice(0,150)};
    const d=(await api({acao:'ler',path,nome:file.name})).dados;
    if(!$('#n_ct'))return;
    NOVO.dados=d;
    const set=(id,v)=>{const el=$('#o_n_'+id);if(el&&v!=null&&v!==''&&!el.value)el.value=v};
    set('cod',d.codigo);set('card',d.nome_card);set('contrato',d.nome_contrato);set('cliente',d.cliente);set('cidade',d.cidade);set('zona',d.zona);set('kwp',d.kwp);set('mod',d.modulos);
    set('estrut',d.estrutura);set('valor',d.valor);set('assinado',d.assinado_em);set('formaPag',d.forma_pagamento);
    if(!d.lido){N.textContent='O contrato foi anexado, mas não consegui ler os dados (PDF digitalizado ou modelo diferente). Preencha à mão.';return}
    const lido=[d.cliente&&'cliente '+nome(d.cliente),d.cidade&&d.cidade+(d.zona?' ('+d.zona.toLowerCase()+')':''),d.kwp&&num(d.kwp,2)+' kWp',d.modulos&&d.modulos+' módulos',d.estrutura,d.valor&&moeda(d.valor),d.financiamento?'financiamento':null,d.assinado_em&&'assinado em '+brA(d.assinado_em)].filter(Boolean);
    N.className='lido';N.innerHTML=`Lido do contrato: ${esc(lido.join(' · '))}.${d.codigo?'':' <b>O contrato não traz o código da obra: digite o código.</b>'} Confira antes de cadastrar.`;
    if(!d.codigo)$('#o_n_cod').focus();
  }catch(e){N.textContent=e.message||'Não foi possível ler o contrato. Preencha à mão.';NOVO=null}
}
async function criar(){
  const g=f=>($('#o_n_'+f)?.value||'').trim(),E=$('#e_n'),cod=g('cod').toUpperCase(),ent=g('entrada'),mp=g('matPrev'),ini=g('iniPrev'),fim=g('fimPrev')||ini,eq=g('equipe');
  if(!COD_OK.test(cod)){E.textContent='Informe o código da obra (letras, números e hífen, ex.: WB260500COL).';return}
  if(!g('card')||!g('cliente')||!ent){E.textContent='Preencha o nome do card, o cliente e a data de entrada.';return}
  if(![ent,mp,ini,fim,g('assinado')].every(dataOk)){E.textContent='Há uma data fora do intervalo aceito (2024 a 2030). Confira o ano.';return}
  if(mp&&mp<ent){E.textContent='A previsão de entrega não pode ser anterior à data de entrada.';return}
  if(ini&&ini<ent){E.textContent='A previsão de instalação não pode ser anterior à data de entrada.';return}
  if(ini&&fim<ini){E.textContent='O fim da instalação não pode ser anterior ao início.';return}
  if(ini&&!eq){E.textContent='Para marcar a instalação, escolha a equipe (ou deixe as datas para depois).';return}
  if(S.obras.has(cod)){E.textContent='Já existe uma obra com esse código.';return}
  const n=x=>x===''?null:Number(x),d=NOVO&&NOVO.dados||{};
  const linha={codigo:cod,nome_card:g('card'),nome_contrato:g('contrato')||null,cliente:g('cliente').toUpperCase(),entrada:ent,cidade:g('cidade')||null,zona:g('zona')||null,
    kwp:n(g('kwp')),modulos:n(g('mod')),estrutura:g('estrut')||null,envio:g('envio')||null,valor:n(g('valor')),assinado_em:g('assinado')||null,forma_pagamento:g('formaPag')||null,
    pagamento_na:g('pagNa')||null,material_previsto:mp||null,equipe_id:eq||null,inicio_previsto:ini||null,fim_previsto:ini?fim:null,
    cpf_cnpj:d.cpf_cnpj||null,endereco:d.endereco||null,cep:d.cep||null,email_cliente:d.email_cliente||null,geracao_kwh:d.geracao_kwh||null,equipamentos:d.equipamentos||[],financiamento:d.financiamento??null,
    contrato_path:NOVO?NOVO.path:null,contrato_nome:NOVO?NOVO.nome:null,origem:NOVO?'contrato':'manual'};
  const {error}=await sb.from('obra_obras').insert(linha);
  if(error){E.textContent=msgErro(error);return}
  fecharModal();toast(ini&&mp&&diff(ini,mp)<S.cfg.folgaDias?'Obra cadastrada. Atenção: instalação muito próxima da entrega do material.':'Obra cadastrada');
  await recarregar();setTimeout(()=>abrir(cod),200);
}
async function anexar(cod,file){
  try{toast('Enviando o contrato…');const path=await enviarPdf(file);
    if(await salvar(cod,{ctPath:path,ctNome:file.name.slice(0,150)}))toast('Contrato anexado')}
  catch(e){toast(e.message||'Não foi possível anexar o contrato.')}
}
let confCt=0;
async function removerCt(b){if(Date.now()-confCt>4000){confCt=Date.now();b.textContent='Clique de novo para remover';return}
  await salvar(S.sel,{ctPath:null,ctNome:null})}

/* ---------- equipes (página) ---------- */
function vEquipes(){
  const c=S.cfg,dis=S.pode?'':'disabled';
  const carga30={};for(const o of S.obras.values())if(o.equipe&&o.iniPrev&&o.iniPrev>=HOJE&&o.iniPrev<=add(HOJE,30)&&!o.fimReal)carga30[o.equipe]=(carga30[o.equipe]||0)+1;
  return`<p class="muted" style="max-width:75ch">Cada equipe tem uma cor no calendário, uma base e quantas obras faz ao mesmo tempo (acima disso aparece alerta de conflito).${S.pode?'':' Você está em modo de consulta.'}</p>
   <div class="list" id="ceq">${c.equipes.map(e=>linhaEq(e,dis,carga30[e.id]||0)).join('')}</div>
   ${S.pode?`<div class="acts"><button class="btn s" data-act="novaEq">+ Adicionar equipe</button><button class="btn p" data-act="salvarEq">Salvar equipes</button><span class="err" id="e_c"></span></div>`:''}`;
}
const linhaEq=(e,dis,n)=>`<div class="row" data-eq="${esc(e.id)}" data-novo="${e.novo?1:''}" style="padding:8px 12px"><input type="color" data-k="cor" value="${hslHex(e.h)}" ${dis} title="Cor no calendário" style="width:34px;height:30px;padding:0;border:0;background:none">
  <input type="text" data-k="nome" value="${esc(e.nome)}" aria-label="Nome" placeholder="Nome da equipe" style="flex:1 1 120px" ${dis}><input type="text" data-k="base" value="${esc(e.base||'')}" placeholder="Base" style="flex:1 1 110px" ${dis}>
  <select data-k="filial" ${dis}><option value="">Filial</option>${Object.keys(FIL).map(f=>`<option${e.filial===f?' selected':''}>${f}</option>`).join('')}</select>
  <input type="text" data-k="membros" value="${esc(e.membros||'')}" placeholder="Quem é da equipe" style="flex:2 1 200px" ${dis}>
  <label class="f small">Obras por dia<input type="number" data-k="cap" min="1" max="9" value="${e.cap||1}" style="width:64px" ${dis}></label><label class="ck f"><input type="checkbox" data-k="ativa" ${e.ativa?'checked':''} ${dis}> Ativa</label>
  <span class="pill">${n} obra${n===1?'':'s'} nos próximos 30 dias</span></div>`;
function hslHex(h){const s=.55,l=.5,k=n=>(n+h/30)%12,a=s*Math.min(l,1-l),f=n=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));return'#'+[f(0),f(8),f(4)].map(x=>Math.round(x*255).toString(16).padStart(2,'0')).join('')}
function hexHue(hex){const[r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255),mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;if(!d)return 0;let h=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;return Math.round((h*60+360)%360)}
async function salvarEq(){
  const linhas=[...document.querySelectorAll('#ceq [data-eq]')].map(r=>{const g=k=>r.querySelector(`[data-k=${k}]`);const nomeEq=g('nome').value.trim();
    let id=r.dataset.eq;if(r.dataset.novo)id=(nomeEq.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'equipe').slice(0,24)+'-'+Math.random().toString(36).slice(2,5);
    return{id,nome:nomeEq,base:g('base').value.trim()||null,filial:g('filial').value||null,membros:g('membros').value.trim()||null,capacidade_dia:Math.min(9,Math.max(1,+g('cap').value||1)),ativa:g('ativa').checked,matiz:hexHue(g('cor').value)}}).filter(e=>e.nome);
  const {error}=await sb.from('obra_equipes').upsert(linhas);
  if(error){$('#e_c').textContent=msgErro(error);return}toast('Equipes salvas');await carregarCfg();render();
}

/* ---------- configurações (página) ---------- */
function vConfig(){
  const c=S.cfg,dis=S.pode?'':'disabled';
  return`<div class="two" style="margin-top:0"><div class="panel"><h3>Metas de prazo</h3><div class="fg">${inp('c_meta','Meta (dias da entrada ao fim)',c.metaDias,'number','min="1"')}${inp('c_lim','Limite crítico (dias)',c.limiteDias,'number','min="1"')}${inp('c_folga','Folga mínima entre material e instalação (dias)',c.folgaDias,'number','min="0"')}</div></div>
   <div class="panel"><h3>Motivos de reprogramação</h3><label class="f">Um por linha<textarea id="c_mot" rows="6" ${dis}>${esc(c.motivos.join('\n'))}</textarea></label></div>
   <div class="panel"><h3>Estruturas</h3><label class="f">Uma por linha<textarea id="c_est" rows="6" ${dis}>${esc(c.estruturas.join('\n'))}</textarea></label><p class="muted small">Estrutura que já está em obras não sai da lista (fica inativa).</p></div></div>
   <h3 class="sec">Tópicos das obras</h3><p class="muted small" style="max-width:75ch">Aparecem em todas as obras, na ficha. Os marcados como importantes ficam em destaque quando a resposta é "sim" (ou para tópicos de texto, quando preenchidos).</p>
   <div class="cfg-lista" id="ctop">${c.topicos.map(t=>linhaTop(t,dis)).join('')}</div>
   ${S.pode?`<div class="acts"><button class="btn s" data-act="novoTop">+ Tópico</button></div><div class="acts"><button class="btn p" data-act="salvarCfg">Salvar configurações</button><span class="err" id="e_c"></span></div>`:''}`;
}
const linhaTop=(t,dis)=>`<div class="row" data-top-id="${esc(t.id||'')}"><input type="text" data-k="nome" value="${esc(t.nome||'')}" placeholder="Ex.: Tem unidade beneficiária?" style="flex:2 1 220px" ${dis}>
  <select data-k="tipo" ${dis}>${[['simnao','Sim / não'],['texto','Texto'],['numero','Número'],['data','Data'],['lista','Lista de opções']].map(([v,r])=>`<option value="${v}"${t.tipo===v?' selected':''}>${r}</option>`).join('')}</select>
  <input type="text" data-k="opcoes" value="${esc((t.opcoes||[]).join('; '))}" placeholder="Opções (lista), separadas por ;" style="flex:1 1 160px" ${dis}>
  <label class="ck f"><input type="checkbox" data-k="importante" ${t.importante?'checked':''} ${dis}> Importante</label><label class="ck f"><input type="checkbox" data-k="ativo" ${t.ativo!==false?'checked':''} ${dis}> Ativo</label></div>`;
async function salvarCfg(){
  const E=$('#e_c'),meta=Math.max(1,+$('#o_c_meta').value||30),lim=Math.max(1,+$('#o_c_lim').value||45),folga=Math.max(0,+$('#o_c_folga').value||0);
  if(lim<meta){E.textContent='O limite crítico precisa ser maior ou igual à meta.';return}
  const mot=$('#c_mot').value.split('\n').map(s=>s.trim()).filter(Boolean),est=$('#c_est').value.split('\n').map(s=>s.trim()).filter(Boolean);
  const tops=[...document.querySelectorAll('#ctop [data-top-id]')].map((r,i)=>{const g=k=>r.querySelector(`[data-k=${k}]`);const t={nome:g('nome').value.trim(),tipo:g('tipo').value,opcoes:g('opcoes').value.split(';').map(s=>s.trim()).filter(Boolean),importante:g('importante').checked,ativo:g('ativo').checked,ordem:i};if(r.dataset.topId)t.id=r.dataset.topId;return t}).filter(t=>t.nome);
  const usadas=new Set([...S.obras.values()].map(o=>o.estrut).filter(Boolean));
  const ops=[sb.from('obra_config').upsert([{chave:'metas',valor:{meta_dias:meta,limite_dias:lim,folga_dias:folga}},{chave:'motivos_reprogramacao',valor:mot}]),
    sb.from('obra_estruturas').upsert(est.map((nm,i)=>({nome:nm,ativa:true,ordem:i}))),
    ...S.cfg.estruturasTodas.filter(e=>!est.includes(e)).map(e=>usadas.has(e)?sb.from('obra_estruturas').update({ativa:false}).eq('nome',e):sb.from('obra_estruturas').delete().eq('nome',e)),
    sb.from('obra_topicos').upsert(tops.filter(t=>t.id)),...(tops.some(t=>!t.id)?[sb.from('obra_topicos').insert(tops.filter(t=>!t.id))]:[])];
  const rs=await Promise.all(ops),err=rs.find(r=>r.error);
  if(err){E.textContent=msgErro(err.error);return}toast('Configurações salvas');await carregarCfg();render();
}

/* ---------- modal, aviso, eventos ---------- */
function modal(h){$('#mb').innerHTML=h;$('#modal').classList.add('on')}
function fecharModal(){$('#modal').classList.remove('on')}
let tt;function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('on'),3200)}
function banner(m){$('#banner').innerHTML=m?`<div class="banner">${esc(m)}</div>`:(!S.pode?'<div class="banner">Você está em modo de consulta. Quem edita o cronograma é a equipe de obras.</div>':'')}
document.addEventListener('click',async ev=>{
  const t=ev.target.closest('[data-nav],[data-act],[data-obra]');
  if(!t){if(ev.target.id==='scrim')fechar();if(ev.target.id==='modal')fecharModal();return}
  if(t.dataset.nav){location.hash=t.dataset.nav;if(S.view===t.dataset.nav)render();return}
  const a=t.dataset.act;
  if(!a&&t.dataset.obra){abrir(t.dataset.obra);return}
  if(a==='mes'){const d=+t.dataset.d;if(!d)S.ref=HOJE.slice(0,7)+'-01';else{const x=dt(S.ref);x.setMonth(x.getMonth()+d);S.ref=iso(x)}render()}
  else if(a==='modo'){S.modo=t.dataset.m;render()}
  else if(a==='dia')mDia(t.dataset.d);
  else if(a==='escolher')mEscolher(t.dataset.d);
  else if(a==='agendarEm')abrir(t.dataset.cod,{d:t.dataset.d,eq:t.dataset.eq||sugerir(S.obras.get(t.dataset.cod)).eq});
  else if(a==='fechar')fecharModal();
  else if(a==='fecharG')fechar();
  else if(a==='nova'){if(S.pode)mNova();else toast('Seu perfil só pode consultar o cronograma.')}
  else if(a==='criar')criar();
  else if(a==='novaEq'){$('#ceq').insertAdjacentHTML('beforeend',linhaEq({id:'novo-'+Date.now(),novo:true,nome:'',base:'',cap:1,ativa:true,h:(S.cfg.equipes.length*47+20)%360},'',0))}
  else if(a==='salvarEq')salvarEq();
  else if(a==='novoTop'){$('#ctop').insertAdjacentHTML('beforeend',linhaTop({tipo:'simnao',ativo:true},''))}
  else if(a==='salvarCfg')salvarCfg();
  else if(a==='salvarAg')salvarAg();
  else if(a==='rapido')rapido(t.dataset.f);
  else if(a==='chegou')rapido('matReal',t.dataset.cod);
  else if(a==='excluir')excluir(t);
  else if(a==='removerCt')removerCt(t);
  else if(a==='maisTopico'){const nm=prompt('Nome do tópico (só para esta obra):');if(nm&&nm.trim()){const o=S.obras.get(S.sel);await salvar(o.cod,{topx:[...(o.topx||[]),{id:Date.now().toString(36),nome:nm.trim().slice(0,120),valor:'',importante:confirm('Marcar como importante (aparece em destaque)?')}]});gaveta()}}
  else if(a==='tiraTopico'){const o=S.obras.get(S.sel);await salvar(o.cod,{topx:(o.topx||[]).filter((_,i)=>i!==+t.dataset.i)});gaveta()}
  else if(a==='copiarRel'){try{await navigator.clipboard.writeText($('#resumo').textContent);toast('Resumo copiado')}catch(e){toast('Não foi possível copiar.')}}
  else if(a==='baixarRel')baixarRel();
});
function baixarRel(){
  const L=linhasRel();if(!L.length){toast('Não há obras neste filtro.');return}
  if(!window.XLSX){toast('O gerador de planilha não carregou. Recarregue a página.');return}
  const ws=XLSX.utils.json_to_sheet(L),wb=XLSX.utils.book_new();ws['!cols']=Object.keys(L[0]).map(k=>({wch:Math.max(12,k.length+2)}));XLSX.utils.book_append_sheet(wb,ws,'Previsto x realizado');
  XLSX.writeFile(wb,`previsto-x-realizado-${S.rep.mes||'periodo-todo'}.xlsx`);toast('Relatório baixado');
}
document.addEventListener('change',ev=>{
  const t=ev.target;
  if(t.id==='ffil'){S.fil=t.value;render()}else if(t.id==='feq'){S.eq=t.value;render()}
  else if(t.id==='mi'){S.mi=t.checked;render()}else if(t.id==='me'){S.me=t.checked;render()}
  else if(t.id==='rmes'){S.rep.mes=t.value;render()}else if(t.id==='rmin'){S.rep.min=Math.max(0,+t.value||0);render()}else if(t.id==='rso'){S.rep.so=t.checked;render()}
  else if(t.id==='n_arq'&&t.files[0])lerContrato(t.files[0]);
  else if(t.id==='g_ct'&&t.files[0]&&S.sel)anexar(S.sel,t.files[0]);
  else if((t.dataset.top||t.dataset.topx!==undefined)&&t.closest('#drawer'))salvarTopico(t);
  else if(t.dataset.f&&t.closest('#drawer'))campo(t);
});
let tq;$('#fq').addEventListener('input',e=>{clearTimeout(tq);tq=setTimeout(()=>{S.q=e.target.value;render()},180)});
addEventListener('keydown',e=>{if(e.key==='Escape'){if($('#modal').classList.contains('on'))fecharModal();else fechar()}});

/* ---------- dados (Supabase) ---------- */
let token=C.token,tokenExp=C.tokenExp||0;
async function tokenAtual(){
  if(Date.now()/1000<tokenExp-120)return token;
  try{const r=await fetch('/obras/api/token',{cache:'no-store'});if(r.ok){const j=await r.json();if(j.token){token=j.token;tokenExp=j.exp||0}}else if(r.status===401)location.href='/entrar?volta=/obras/cronograma'}catch(_){}
  return token;
}
const sb=window.supabase.createClient(C.url,C.anon,{accessToken:tokenAtual});
async function carregarCfg(){
  const [cfg,eqs,est,tops]=await Promise.all([sb.from('obra_config').select('chave,valor'),sb.from('obra_equipes').select('*').order('nome'),sb.from('obra_estruturas').select('*').order('ordem'),sb.from('obra_topicos').select('*').order('ordem')]);
  const m=Object.fromEntries((cfg.data||[]).map(r=>[r.chave,r.valor])),metas=m.metas||{};
  S.cfg={metaDias:metas.meta_dias||30,limiteDias:metas.limite_dias||45,folgaDias:metas.folga_dias??1,motivos:m.motivos_reprogramacao||CFG0.motivos,
    equipes:(eqs.data||[]).map(e=>({id:e.id,nome:e.nome,base:e.base,filial:e.filial,membros:e.membros,h:e.matiz,cap:e.capacidade_dia,ativa:e.ativa})),
    estruturas:(est.data||[]).filter(e=>e.ativa).map(e=>e.nome),estruturasTodas:(est.data||[]).map(e=>e.nome),topicos:tops.data||[]};
}
async function lerTudo(tabela,cols){const out=[];for(let de=0;;){const {data,error}=await sb.from(tabela).select(cols).order(tabela==='obra_historico'?'id':'codigo').range(de,de+999);if(error)throw error;if(!data.length)break;out.push(...data);de+=data.length}return out} // o servidor pode devolver menos que 1000 por página
async function lerReprog(){const out=[];for(let de=0;;){const {data,error}=await sb.from('obra_historico').select('obra').in('campo',['inicio_previsto','fim_previsto']).not('de','is',null).order('id').range(de,de+999);if(error||!data.length)break;out.push(...data);de+=data.length}return out}
let carregando=null;
async function recarregar(){
  if(carregando)return carregando;
  carregando=(async()=>{
    const [linhas,rep]=await Promise.all([lerTudo('obra_obras','*'),lerReprog()]);
    S.obras=new Map(linhas.map(r=>[r.codigo,daLinha(r)]));
    S.reprog={};for(const h of rep)S.reprog[h.obra]=(S.reprog[h.obra]||0)+1;
    S.ok=true;banner();render();
    if(S.sel){const a=document.activeElement;if(!(a&&a.closest('#drawer')&&/INPUT|SELECT|TEXTAREA/.test(a.tagName)))gaveta()}
  })().catch(()=>{banner('Não foi possível carregar as obras. Recarregue a página.');S.ok=true;render()}).finally(()=>{carregando=null});
  return carregando;
}
(async function iniciar(){
  rota();
  try{await carregarCfg()}catch(e){}
  for(const p of C.perfis||[])S.nomes[p.id]=p.nome;
  await recarregar();
  let tm=null;const depois=()=>{clearTimeout(tm);tm=setTimeout(()=>{recarregar()},400)};
  sb.channel('obras').on('postgres_changes',{event:'*',schema:'public',table:'obra_obras'},depois)
    .on('postgres_changes',{event:'*',schema:'public',table:'obra_equipes'},()=>carregarCfg().then(render)).subscribe();
})();
