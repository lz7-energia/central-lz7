/* Central LZ7 — Cronograma de instalação (Central de Obras).
 * Regras e telas portadas do protótipo "Cronograma de Obras LZ7" (index.html: calendário, fila, alertas, relatórios, sugestão,
 * validações). Dados no Supabase (tabelas obra_*, view de regras e gatilhos de baseline/histórico no banco).
 * Cada tela abre sozinha (24/11/2026), vinda dos cards: Cronograma (#calendario, com Calendário | Lista de projetos),
 * Logística (#entregas, #ind-logistica), Obras (#pendentes, #equipes, #indicadores, #config).
 * Quem edita: perfil obras. Área "logistica" edita entrega/material/dados do cliente; área "obras" também a instalação
 * (o banco confere: obra_area() no gatilho). Tags: qualquer perfil. Obra nova vem do Flow (obra_importar_flow).
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
const S={obras:new Map(),cfg:CFG0,pode:!!C.podeEditar,podeInst:!!C.podeEditar&&C.area!=='logistica',podePag:!!C.podePagamento,ok:false,view:'calendario',
  modo:'mes',ref:HOJE.slice(0,7)+'-01',mi:true,me:true,q:'',f:{tags:new Set(),cid:new Set(),fil:new Set(),eq:new Set(),st:new Set()},avisos:[],sel:null,lista:false,listaF:'abertas',
  rep:{mes:'',min:1,so:false},repL:{mes:''},reprog:{},reprogMat:{},hInst:[],hMat:[],nomes:{},hist:{}};
const INST=new Set(['equipe','iniPrev','fimPrev','iniReal','fimReal']); // campos da instalação: só a área de obras
const ed=f=>S.pode&&(!INST.has(f)||S.podeInst);
S.podeCt=S.pode||!!C.admin; // contrato e particularidades: também o administrador (obra_pode_contrato)
const CT=new Set(['ctPath','ctNome','partic']);
try{S.lista=localStorage.getItem('obraVista')==='lista'}catch(_){}
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
  const F=S.f;
  return[...S.obras.values()].filter(o=>(!F.fil.size||F.fil.has(filial(o)))&&(!F.eq.size||F.eq.has(o.equipe||'-'))&&(!F.tags.size||(o.tags||[]).some(t=>F.tags.has(t)))&&
    (!F.cid.size||F.cid.has(o.cidade||'—'))&&(!F.st.size||F.st.has(calc(o).st))&&
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
  const ab=visiveis().filter(o=>!o.fimReal),s0=seg(HOJE),s1=add(s0,6),vc=new Set(visiveis().map(o=>o.cod)),al=alertas().filter(x=>vc.has(x.cod));
  const iw=ab.filter(o=>o.iniPrev&&o.iniPrev<=s1&&(o.fimPrev||o.iniPrev)>=s0).length;
  const ew=ab.filter(o=>!o.matReal&&o.matPrev>=s0&&o.matPrev<=s1).length;
  const kw=ab.reduce((a,o)=>a+(o.kwp||0),0),cr=al.filter(a=>a.sev==='crit').length;
  const y=+S.ref.slice(0,4),mo=+S.ref.slice(5,7);
  let h=`<div class="tiles">
   <div class="tile"><b>${ab.length}</b><span>obras em aberto · ${num(kw)} kWp</span></div>
   <div class="tile"><b>${iw}</b><span>instalações nesta semana</span></div>
   <div class="tile"><b>${ew}</b><span>entregas previstas nesta semana</span></div>
   <button class="tile ${cr?'crit':'ok'}" data-nav="pendentes"><b>${cr}</b><span>alertas críticos</span></button></div>`;
  const vista=`<div class="seg"><button data-act="vista" data-v="cal" class="${S.lista?'':'on'}">Calendário</button><button data-act="vista" data-v="lista" class="${S.lista?'on':''}">Lista</button></div>${S.pode?'<button class="btn" data-act="nova" title="Para quando a obra não veio do Flow">+ Obra manual</button>':''}`;
  if(S.lista)return h+vLista(vista);
  h+=`<div class="bar">${vista}<button class="btn" data-act="mes" data-d="-1" aria-label="Mês anterior">‹</button><h2>${MESES[mo-1]} ${y}</h2>
   <button class="btn" data-act="mes" data-d="1" aria-label="Próximo mês">›</button><button class="btn" data-act="mes" data-d="0">Hoje</button><span class="sp"></span>
   <label class="ck f"><input type="checkbox" id="mi" ${S.mi?'checked':''}> Obras (instalações)</label>
   <label class="ck f"><input type="checkbox" id="me" ${S.me?'checked':''}> Logística (entregas)</label>
   <div class="seg"><button data-act="modo" data-m="mes" class="${S.modo==='mes'?'on':''}">Mês</button><button data-act="modo" data-m="eq" class="${S.modo==='eq'?'on':''}">Por equipe</button></div></div>`;
  return h+(S.modo==='mes'?calMes():calEq());
}
/* ---------- lista de projetos ---------- */
const corTag=t=>{const c=(S.cfg.tags||[]).find(x=>x.nome===t);return c?c.cor:160};
const tagPills=o=>(o.tags||[]).map(t=>`<span class="pill tag" style="--h:${corTag(t)}">${esc(t)}</span>`).join('');
function listaFiltrada(){const f=S.listaF;return visiveis().filter(o=>f==='todas'||(f==='finalizadas'?!!o.fimReal:!o.fimReal)).sort((a,b)=>(b.entrada||'').localeCompare(a.entrada||''))}
function vLista(vista){
  const l=listaFiltrada();
  const quando=(real,prev,orig)=>real?`${br(real)} <span class="pill ok">feito</span>${orig&&orig!==real?`<div class="orig">previsão original ${br(orig)}</div>`:''}`:prev?`${br(prev)}${orig&&orig!==prev?`<div class="orig">original ${br(orig)}</div>`:''}`:'<span class="muted">sem data</span>';
  return`<div class="bar">${vista}<label class="f">Mostrar <select id="lf"><option value="abertas"${S.listaF==='abertas'?' selected':''}>Em aberto</option><option value="finalizadas"${S.listaF==='finalizadas'?' selected':''}>Finalizadas</option><option value="todas"${S.listaF==='todas'?' selected':''}>Todas</option></select></label>
   <span class="muted small">${l.length} ${l.length===1?'obra':'obras'}</span><span class="sp"></span><button class="btn" data-act="baixarLista">Baixar Excel</button></div>
  <div class="rep"><table class="lista-proj"><thead><tr><th>Obra</th><th>Etapa</th><th>Entrega</th><th>Instalação</th><th>Equipe</th><th>Tags</th></tr></thead><tbody>`+
  (l.map(o=>{const k=calc(o);return`<tr data-obra="${esc(o.cod)}"><td><b>${esc(tit(o))}</b><br><span class="muted small">${esc(o.cod)}${o.cidade?' · '+esc(o.cidade):''}${o.kwp!=null?' · '+num(o.kwp,2)+' kWp':''}</span>${avisosFlow(o).length?'<br><span class="pill warn">ver aviso do Flow</span>':''}</td>
   <td><span class="pill ${k.st==='final'?'ok':'a'}">${ST[k.st]}</span>${o.osStatus?`<div class="orig">OS: ${esc(o.osStatus)}</div>`:''}</td>
   <td>${quando(o.matReal,o.matPrev,o.bMat)}</td><td>${quando(o.fimReal,o.iniPrev?(o.iniPrev+(o.fimPrev&&o.fimPrev!==o.iniPrev?'':'')):null,k.bIni)}${o.iniPrev&&o.fimPrev&&o.fimPrev!==o.iniPrev&&!o.fimReal?`<div class="orig">até ${br(o.fimPrev)}</div>`:''}</td>
   <td>${o.equipe?eqChip(o.equipe):'<span class="muted">—</span>'}</td><td><div class="tags">${tagPills(o)}</div></td></tr>`}).join('')||'<tr><td colspan="6" class="muted">Nenhuma obra neste filtro.</td></tr>')+'</tbody></table></div>';
}
function linhasLista(){return listaFiltrada().map(o=>{const k=calc(o);return{'Código':o.cod,'Obra':tit(o),'Cliente':o.cliente||'','Cidade':o.cidade||'','kWp':o.kwp??'','Etapa':ST[k.st],'Status da OS (Flow)':o.osStatus||'',
  'Entrada':brA(o.entrada),'Entrega: previsão original':brA(o.bMat),'Entrega: previsão atual':brA(o.matPrev),'Entregue em':brA(o.matReal),
  'Instalação: previsão original':brA(k.bIni),'Instalação: início previsto':brA(o.iniPrev),'Instalação: fim previsto':brA(o.fimPrev),'Finalizada em':brA(o.fimReal),
  'Equipe':o.equipe?eqNome(o.equipe):'','Tags':(o.tags||[]).join(', ')}})}
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
   <div class="acts">${S.podeInst?`<button class="btn p" data-act="escolher" data-d="${d}">Agendar obra neste dia</button>`:''}<button class="btn" data-act="fechar">Fechar</button></div>`);
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
    ${S.podeInst?`<button class="btn s p" data-act="agendarEm" data-cod="${esc(o.cod)}" data-d="${s.d}" data-eq="${esc(s.eq||'')}">Agendar</button>`:''}</div>`}).join('')+'</div>';
}

/* ---------- alertas ---------- */
const T_OBRAS=['atrasada','semagenda','conflito','prazo','dados'],T_LOG=['material','semprev','folga'];
function alertasDe(tipos){const vis=new Set(visiveis().map(o=>o.cod));return alertas().filter(a=>tipos.includes(a.t)&&(a.t==='conflito'?(!S.eq||S.eq===a.eq):vis.has(a.cod)))}
function vAlertas(tipos){
  const al=alertasDe(tipos);
  if(!al.length)return'';
  let h='';
  for(const t of Object.keys(TA).filter(x=>tipos.includes(x))){const l=al.filter(a=>a.t===t);if(!l.length)continue;
    h+=`<h3 class="sec">${TA[t]} <span class="pill ${l[0].sev}">${l.length}</span></h3><div class="list">`+l.map(a=>`<button class="row ${a.sev}" data-obra="${esc(a.cod)}"><span class="g"><b>${t==='conflito'?esc(a.tx):esc(tit(a.o))}</b>${t==='conflito'?'':`<br><span class="muted small">${esc(a.tx)}</span>`}</span>${t==='conflito'?'':eqChip(a.o.equipe)}</button>`).join('')+'</div>'}
  return h;
}

/* ---------- pendentes de obras ---------- */
function vPend(){
  const ab=visiveis().filter(o=>!o.fimReal),fila=ab.filter(o=>!o.iniPrev),atr=ab.filter(o=>o.fimPrev&&o.fimPrev<HOJE),al=alertasDe(T_OBRAS),vis=new Set(visiveis().map(o=>o.cod));
  return`<div class="tiles"><div class="tile ${fila.length?'warn':'ok'}"><b>${fila.length}</b><span>sem data de instalação</span></div><div class="tile ${atr.length?'crit':'ok'}"><b>${atr.length}</b><span>instalações atrasadas</span></div>
   <div class="tile ${al.filter(a=>a.sev==='crit').length?'crit':'ok'}"><b>${al.length}</b><span>alertas de obras</span></div></div>
   ${avisosHtml(S.avisos.filter(a=>vis.has(a.obra)))}
   <h3 class="sec">A agendar <span class="pill">${fila.length}</span>${S.pode?' <button class="btn s" data-act="nova" style="margin-left:8px">+ Obra manual</button>':''}</h3>${vFila()}${vAlertas(T_OBRAS)}`;
}
/* ---------- avisos da logística para a área de obras ---------- */
function avisosHtml(l,naObra){
  if(!l.length)return'';
  return`${naObra?'':`<h3 class="sec">Avisos da logística <span class="pill warn">${l.length}</span></h3>`}<div class="list">${l.map(a=>{const o=S.obras.get(a.obra);
    return`<div class="row warn">${naObra?'':`<button class="g" data-obra="${esc(a.obra)}" style="border:0;background:none;text-align:left;padding:0"><b>${esc(o?tit(o):a.obra)}</b><br>`}<span class="${naObra?'g ':''}small">${esc(a.texto)}</span>${naObra?'':'</button>'}
     <span class="muted small">${new Date(a.criado_em).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}</span>${S.pode||C.admin?`<button class="btn s" data-act="ciente" data-id="${a.id}">Ciente</button>`:''}</div>`}).join('')}</div>`;
}
async function ciente(id){const {error}=await sb.rpc('obra_aviso_ciente',{p_id:+id});if(error){toast('Não foi possível marcar.');return}S.avisos=S.avisos.filter(a=>a.id!==+id);toast('Ok');render();if(S.sel)gaveta()}
/* ---------- motivos das remarcações ---------- */
function painelMotivos(lista,titulo){
  const c={};let sem=0;for(const h of lista){if(h.motivo)c[h.motivo]=(c[h.motivo]||0)+1;else sem++}
  const linhas=Object.entries(c).sort((a,b)=>b[1]-a[1]);if(sem)linhas.push(['Sem motivo informado',sem]);
  return`<div class="panel"><h3>${titulo}</h3>${lista.length?linhas.map(([m,n])=>`<div class="row" style="border:0;padding:3px 0"><span class="g small">${esc(m)}</span><span class="pill">${n}</span></div>`).join(''):'<span class="muted">Nenhuma remarcação.</span>'}<p class="muted small">${lista.length} ${lista.length===1?'remarcação':'remarcações'} no filtro. O motivo é opcional.</p></div>`;
}
/* ---------- indicadores da logística ---------- */
function dadosLog(){
  const ob=visiveis().filter(o=>!o.fora),meses=[...new Set(ob.filter(o=>o.matReal).map(o=>o.matReal.slice(0,7)))].sort();
  const sel=ob.filter(o=>o.matReal&&(!S.repL.mes||o.matReal.slice(0,7)===S.repL.mes)).map(o=>{const b=o.bMat||o.matPrev||null;return{o,b,d:b?diff(o.matReal,b):null,r:S.reprogMat[o.cod]||0}});
  return{ob,meses,sel};
}
function vIndLog(){
  const{ob,meses,sel}=dadosLog(),com=sel.filter(x=>x.d!=null),noP=com.filter(x=>x.d<=0).length,atr=com.filter(x=>x.d>0);
  const mAt=atr.length?atr.reduce((a,x)=>a+x.d,0)/atr.length:0,mRem=sel.length?sel.reduce((a,x)=>a+x.r,0)/sel.length:0;
  const abertas=ob.filter(o=>!o.matReal&&(o.bMat||o.matPrev)&&(o.matPrev||o.bMat)<HOJE).sort((a,b)=>(a.matPrev||'')<(b.matPrev||'')?-1:1);
  const cods=new Set(sel.map(x=>x.o.cod)),mot=S.hMat.filter(h=>cods.has(h.obra));
  const per=S.repL.mes?'Em '+nomeMes(S.repL.mes):'No período todo';
  let h=`<div class="bar"><label class="f">Entregues em <select id="lmes"><option value="">Todo o período</option>${meses.map(m=>`<option value="${m}"${S.repL.mes===m?' selected':''}>${nomeMes(m)}</option>`).join('')}</select></label><span class="sp"></span><button class="btn p" data-act="baixarLog">Baixar Excel</button></div>
  <div class="resumo">${per}, ${sel.length} ${sel.length===1?'entrega foi feita':'entregas foram feitas'}: ${noP} na previsão original ou antes e <b>${atr.length} depois</b>${atr.length?`, em média ${num(mAt,1)} dias depois`:''}. Cada entrega foi remarcada ${num(mRem,1)} vez(es) em média.</div>
  <div class="tiles"><div class="tile"><b>${sel.length}</b><span>entregas feitas</span></div><div class="tile ok"><b>${noP}</b><span>na previsão original ou antes</span></div>
   <div class="tile ${atr.length?'crit':'ok'}"><b>${atr.length}</b><span>depois da previsão original</span></div><div class="tile"><b>${num(mAt,1)}</b><span>dias de atraso médio (das atrasadas)</span></div>
   <div class="tile"><b>${num(mRem,1)}</b><span>remarcações por entrega</span></div><div class="tile ${abertas.length?'crit':'ok'}"><b>${abertas.length}</b><span>em aberto, já passadas da previsão</span></div></div>`;
  const lin=sel.slice().sort((a,b)=>(b.d??-999)-(a.d??-999));
  h+=`<div class="rep"><table><thead><tr><th>Obra</th><th>Previsão original</th><th>Última previsão</th><th>Entregue em</th><th>Diferença</th><th>Remarcações</th></tr></thead><tbody>`+
   (lin.map(({o,b,d,r})=>`<tr data-obra="${esc(o.cod)}"><td><b>${esc(tit(o))}</b><br><span class="muted small">${esc(o.cod)} · ${esc(o.cidade||'')}</span></td><td>${br(b)}</td><td>${br(o.matPrev)}</td><td>${br(o.matReal)}</td>
    <td>${d==null?'—':d>0?`<span class="pill crit">+${dias(d)}</span>`:d<0?`<span class="pill ok">${dias(d)}</span>`:'<span class="pill ok">na data</span>'}</td><td>${r||'—'}</td></tr>`).join('')||'<tr><td colspan="6" class="muted">Nenhuma entrega neste filtro.</td></tr>')+'</tbody></table></div>';
  h+=`<div class="two">${painelMotivos(mot,'Motivos das remarcações de entrega')}<div class="panel"><h3>Em aberto, já passadas da previsão</h3>${abertas.map(o=>`<button class="row crit" data-obra="${esc(o.cod)}" style="width:100%"><span class="g"><b>${esc(tit(o))}</b><br><span class="muted small">Previsão ${br(o.matPrev)}${o.bMat&&o.bMat!==o.matPrev?' · original '+br(o.bMat):''}</span></span><span class="pill crit">+${dias(diff(HOJE,o.matPrev||o.bMat))}</span></button>`).join('')||'<span class="muted">Nenhuma.</span>'}</div></div>`;
  return h+'<p class="muted small" style="max-width:75ch;margin-top:14px">A previsão original é a primeira data de entrega marcada para a obra. Mudar a previsão não pede explicação; quando alguém escolhe um motivo, ele entra na contagem acima.</p>';
}
function linhasLog(){return dadosLog().sel.map(({o,b,d,r})=>({'Código':o.cod,'Obra':tit(o),'Cidade':o.cidade||'','Previsão original':brA(b),'Última previsão':brA(o.matPrev),'Entregue em':brA(o.matReal),'Diferença (dias)':d??'','Remarcações':r}))}

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
  {const cods=new Set(sel.map(x=>x.o.cod)),mot=S.hInst.filter(h=>cods.has(h.obra)),mR=sel.length?sel.reduce((a,x)=>a+(x.k.reprog||0),0)/sel.length:0;
   h+=`<div class="two">${painelMotivos(mot,'Motivos das remarcações de instalação')}<div class="panel"><h3>Remarcações</h3><p style="font-size:28px;margin:4px 0"><b>${num(mR,1)}</b></p><p class="muted small">vez(es) em média por obra finalizada no filtro. A data programada é a previsão original; ela não muda quando a obra é remarcada.</p></div></div>`}
  if(abertas.length)h+=`<h3 class="sec">Em aberto, já passadas da data programada <span class="pill crit">${abertas.length}</span></h3><div class="list">${abertas.map(({o,k})=>`<button class="row crit" data-obra="${esc(o.cod)}"><span class="g"><b>${esc(tit(o))}</b><br><span class="muted small">Programada para terminar em ${br(k.bFim)}</span></span>${eqChip(o.equipe)}<span class="pill crit">+${dias(k.desvio)} até hoje</span></button>`).join('')}</div>`;
  return h+'<p class="muted small" style="max-width:75ch;margin-top:14px">A data programada é a primeira agenda registrada para a obra. Nas obras trazidas da planilha, vale a última previsão que estava anotada lá, por isso a maioria aparece na data. Daqui para frente, cada reprogramação fica guardada no histórico da obra.</p>';
}
function linhasRel(){const{sel,atr}=dadosRel();return(S.rep.so?atr:sel).map(({o,k})=>({'Código':o.cod,'Cliente':tit(o),'Cidade':o.cidade||'','Equipe':eqNome(o.equipe),'Entrada':brA(o.entrada),
  'Início programado':brA(k.bIni),'Fim programado':brA(k.bFim),'Dias programados':k.durPrev??'','Início realizado':brA(k.iR),'Finalizado em':brA(o.fimReal),'Dias realizados':k.durReal??'',
  'Diferença (dias)':k.desvio??'','Reprogramações':k.reprog,'Dias da entrada à finalização':k.aberto??''}))}

const matPill=o=>o.matReal?`<span class="pill ok">Material entregue ${br(o.matReal)}</span>`:o.matPrev?`<span class="pill ${o.matPrev<HOJE?'crit':''}">Material previsto ${br(o.matPrev)}</span>`:'<span class="pill warn">Material sem previsão</span>';
/* ---------- navegação e casca ---------- */
const TIT={calendario:'Cronograma de instalação',entregas:'Entregas pendentes','ind-logistica':'Indicadores da logística',pendentes:'Instalações pendentes',equipes:'Equipes de instalação',indicadores:'Indicadores de obras',config:'Configurações do cronograma'};
const APELIDO={fila:'pendentes',alertas:'pendentes',relatorios:'indicadores'}; // endereços antigos
const VOLTA={calendario:['/obras','Início de Obras'],entregas:['/obras/logistica','Logística'],'ind-logistica':['/obras/logistica','Logística'],pendentes:['/obras/obras','Obras'],equipes:['/obras/obras','Obras'],indicadores:['/obras/obras','Obras'],config:['/obras/obras','Obras']};
function rota(){let h=location.hash.slice(1);if(h.startsWith('obra=')){S.abrirDepois=decodeURIComponent(h.slice(5));if(!TIT[S.view])S.view='calendario';render();abrirPendente();return}h=APELIDO[h]||h;S.view=TIT[h]?h:'calendario';render()}
function abrirPendente(){const c=S.abrirDepois;if(c&&S.ok&&S.obras.has(c)){S.abrirDepois=null;abrir(c)}}
addEventListener('hashchange',rota);
function casca(){
  $('#titulo').textContent=TIT[S.view];document.title=TIT[S.view]+' · Central de Obras';
  const[vh,vt]=VOLTA[S.view]||VOLTA.calendario,vo=$('#voltar');vo.href=vh;vo.textContent='‹ '+vt;
  if(!document.querySelector('.mf[open]'))montarFiltros();
  document.body.classList.toggle('ro',!S.pode);
  const filtros=!['equipes','config'].includes(S.view);$('#fq').hidden=!filtros;$('#filtros').hidden=!filtros;
}
/* ---------- filtros (vários ao mesmo tempo: dentro de um filtro vale qualquer um; entre filtros, todos) ---------- */
const NOMES_F={tags:'Tags',cid:'Cidade',fil:'Filial',eq:'Equipe',st:'Etapa'};
function opcoesFiltro(k){
  const ob=[...S.obras.values()];
  if(k==='tags')return(S.cfg.tags||[]).map(t=>[t.nome,t.nome]);
  if(k==='cid')return[...new Set(ob.map(o=>o.cidade||'—'))].sort((a,b)=>a.localeCompare(b)).map(c=>[c,c]);
  if(k==='fil')return['WB','LD','PG','Outras'].map(f=>[f,FIL[f]||f]);
  if(k==='eq')return[...S.cfg.equipes.map(e=>[e.id,e.nome]),['-','Sem equipe']];
  if(k==='st')return Object.entries(ST);
  return[];
}
const rotuloF=k=>NOMES_F[k]+(S.f[k].size?` (${S.f[k].size})`:'');
function montarFiltros(){
  const algum=Object.values(S.f).some(x=>x.size);
  $('#filtros').innerHTML=Object.keys(NOMES_F).map(k=>{const op=opcoesFiltro(k);if(!op.length)return'';
    return`<details class="mf ${S.f[k].size?'on':''}" data-k="${k}"><summary>${esc(rotuloF(k))}</summary><div class="mf-pop">${op.length>8?'<input type="search" class="mf-busca" placeholder="Buscar">':''}
     ${op.map(([v,r])=>`<label class="ck"><input type="checkbox" data-mf="${k}" value="${esc(v)}"${S.f[k].has(v)?' checked':''}> ${esc(r)}</label>`).join('')}</div></details>`}).join('')
   +(algum?'<button class="btn s" data-act="limparF">Limpar filtros</button>':'')
   +(algum?`<span class="muted small">${visiveis().length} de ${S.obras.size} obras</span>`:'');
}
document.addEventListener('toggle',e=>{if(e.target.classList?.contains('mf')&&e.target.open)document.querySelectorAll('.mf[open]').forEach(d=>{if(d!==e.target)d.open=false})},true);
document.addEventListener('click',e=>{if(!e.target.closest('.mf'))document.querySelectorAll('.mf[open]').forEach(d=>{d.open=false;montarFiltros()})});
document.addEventListener('input',e=>{if(e.target.classList.contains('mf-busca')){const q=e.target.value.toLowerCase();e.target.closest('.mf-pop').querySelectorAll('label').forEach(l=>l.hidden=!l.textContent.toLowerCase().includes(q))}});
function render(){
  casca();const v=$('#view');
  if(!S.ok){v.innerHTML='<div class="empty">Carregando obras…</div>';return}
  if(!S.obras.size&&!['equipes','config'].includes(S.view)){v.innerHTML=`<div class="empty"><h2>Nenhuma obra ainda</h2><p>As obras entram sozinhas quando o pedido de venda fica Aprovado ou Faturado no Flow.</p>${S.pode?'<p><button class="btn p" data-act="nova">+ Obra manual</button></p>':''}</div>`;return}
  v.innerHTML=({calendario:vCal,entregas:vEntregas,'ind-logistica':vIndLog,pendentes:vPend,equipes:vEquipes,indicadores:vRel,config:vConfig})[S.view]();
}

/* ---------- entregas de material (Logística) ---------- */
function vEntregas(){
  const ab=visiveis().filter(o=>!o.fimReal),s0=seg(HOJE),fim=add(s0,13);
  const atras=ab.filter(o=>!o.matReal&&o.matPrev&&o.matPrev<HOJE).sort((a,b)=>a.matPrev<b.matPrev?-1:1);
  const prox=ab.filter(o=>!o.matReal&&o.matPrev&&o.matPrev>=HOJE&&o.matPrev<=fim).sort((a,b)=>a.matPrev<b.matPrev?-1:1);
  const sem=ab.filter(o=>!o.matReal&&!o.matPrev).sort((a,b)=>(a.entrada||'')<(b.entrada||'')?-1:1);
  const chegou=ab.filter(o=>o.matReal&&o.matReal>=add(HOJE,-7)).sort((a,b)=>a.matReal<b.matReal?1:-1);
  const lin=o=>`<div class="row"><button class="g" data-obra="${esc(o.cod)}" style="border:0;background:none;text-align:left;padding:0"><b>${esc(tit(o))}</b><br><span class="muted small">${esc(o.cod)} · ${esc(o.cidade||'')} · ${o.mod??'?'} módulos${o.envio?' · '+esc(o.envio):''}${o.kit?' · kit comprado':''}</span></button>${matPill(o)}${pagPend(o).some(p=>p.etapa==='entrega')?'<span class="pill imp">Pagamento na entrega</span>':''}${o.iniPrev?`<span class="pill">Instalação ${br(o.iniPrev)}</span>`:''}${S.pode&&!o.matReal?`<button class="btn s" data-act="chegou" data-cod="${esc(o.cod)}">Chegou hoje</button>`:''}</div>`;
  const bloco=(t,l,cls)=>l.length?`<h3 class="sec">${t} <span class="pill ${cls||''}">${l.length}</span></h3><div class="list">${l.map(lin).join('')}</div>`:'';
  return `<div class="tiles"><div class="tile ${atras.length?'crit':'ok'}"><b>${atras.length}</b><span>entregas atrasadas</span></div><div class="tile"><b>${prox.length}</b><span>previstas nas próximas 2 semanas</span></div><div class="tile warn"><b>${sem.length}</b><span>obras novas sem previsão de entrega</span></div><div class="tile ok"><b>${chegou.length}</b><span>chegaram nos últimos 7 dias</span></div></div>`
    +bloco('Obras novas sem previsão de entrega',sem,'warn')+bloco('Atrasadas',atras,'crit')+bloco('Próximas 2 semanas',prox)+bloco('Chegaram nos últimos 7 dias',chegou,'ok')
    +vAlertas(['folga'])
    +(atras.length+prox.length+sem.length+chegou.length?'':'<div class="empty">Nenhuma entrega pendente.</div>');
}

/* ---------- gaveta da obra ---------- */
const inp=(f,l,v,t='text',x='',w='')=>`<label class="${w}">${l}<input type="${t}" id="o_${f}" data-f="${f}" value="${esc(v??'')}" ${x} ${ed(f)?'':'disabled'}></label>`;
const sel=(f,l,v,ops,x='')=>`<label>${l}<select id="o_${f}" data-f="${f}" ${x} ${ed(f)?'':'disabled'}><option value="">—</option>${ops.map(o=>{const[a,b]=Array.isArray(o)?o:[o,o];return`<option value="${esc(a)}"${a===v?' selected':''}>${esc(b)}</option>`}).join('')}</select></label>`;
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
  <div class="ln" style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 18px"><span class="pill ${k.st==='final'?'ok':'a'}">${ST[k.st]}</span>${k.aberto!=null?`<span class="pill ${k.cls}">${dias(k.aberto)} ${o.fimReal?'da entrada ao fim':'em aberto'}</span>`:''}${o.equipe?eqChip(o.equipe):''}${imp.map(n=>`<span class="pill imp">★ ${esc(n)}</span>`).join('')}${pagPend(o).map(p=>`<span class="pill imp">$ ${esc(ETAPA[p.etapa])}</span>`).join('')}${o.fora?'<span class="pill">fora dos indicadores</span>':''}${o.codProv?'<span class="pill warn">código provisório</span>':''}${tagPills(o)}</div>
  ${S.avisos.some(a=>a.obra===o.cod)?`<div class="step now"><h3>Avisos da logística</h3>${avisosHtml(S.avisos.filter(a=>a.obra===o.cod),true)}</div>`:''}
  ${o.partic?`<div class="note"><b>Particularidades e benefícios:</b> ${esc(o.partic)}</div>`:''}
  <div class="step"><h3>Flow</h3>${flowHtml(o)}</div>
  <div class="step"><h3>Tags</h3>${tagsHtml(o)}</div>
  <div class="step done"><h3>Venda e contrato</h3><div class="fg">${inp('card','Nome do card',o.card,'text','','w')}${inp('cliente','Cliente',o.cliente,'text','','w')}${inp('nomeContrato','Nome do contrato',o.nomeContrato)}${inp('entrada','Data de entrada',o.entrada,'date')}
   ${inp('cidade','Cidade',o.cidade,'text','list="dlc"')}${sel('zona','Zona',o.zona,['Urbano','Rural'])}${inp('kwp','Potência (kWp)',o.kwp,'number','step="0.01" min="0"')}${inp('mod','Módulos',o.mod,'number','step="1" min="0"')}
   ${sel('estrut','Estrutura',o.estrut,S.cfg.estruturas)}${sel('envio','Envio do material',o.envio,['Estoque','Distribuidora'])}${inp('valor','Valor do contrato (R$)',o.valor,'number','step="0.01" min="0"')}${inp('assinado','Assinado em',o.assinado,'date')}
   ${inp('formaPag','Forma de pagamento',o.formaPag,'text','','w')}${inp('pedido','Nº do pedido no Flow',o.pedido)}
   ${inp('end','Endereço',o.end,'text','','w')}${inp('cpf','CPF/CNPJ',o.cpf)}${inp('tel','Telefone / WhatsApp',o.tel,'tel')}${inp('email','E-mail do cliente',o.email,'email')}</div><datalist id="dlc">${cid.map(c=>`<option value="${esc(c)}">`).join('')}</datalist>
   ${(o.equip||[]).length?`<ul class="equip">${o.equip.map(e=>`<li>${esc(e.quantidade)}× ${esc(e.produto)}</li>`).join('')}</ul>`:''}
   ${o.assinado?`<div class="note">Pelo contrato, a instalação é agendada em até 90 dias após o pagamento${o.financ?' (financiamento: depende da liberação)':''}.</div>`:''}</div>
  <div class="step"><h3>Pagamento condicionado</h3>${pagHtml(o)}</div>
  <div class="step"><h3>Tópicos</h3>${topicosHtml(o)}</div>
  <div class="step ${o.matReal?'done':'now'}"><h3>Material (logística)</h3><div class="fg">${inp('matPrev','Previsão de entrega',o.matPrev,'date')}${inp('matReal','Entregue em',o.matReal,'date')}
   ${o.matPrev&&!o.matReal&&S.pode?`<label class="w">Motivo, se mudar a previsão (opcional)<select id="o_motivoMat"><option value="">—</option>${S.cfg.motivos.map(m=>`<option>${esc(m)}</option>`).join('')}</select></label>`:''}</div>
   ${o.bMat&&o.bMat!==(o.matReal||o.matPrev)?`<div class="note">Previsão original de entrega: ${br(o.bMat)}${S.reprogMat[o.cod]?' · remarcada '+S.reprogMat[o.cod]+' vez(es)':''}${o.matReal?` · entregue ${dias(Math.abs(diff(o.matReal,o.bMat)))} ${o.matReal>o.bMat?'depois':'antes'}`:''}.</div>`:''}
   <div class="acts"><label class="ck f"><input type="checkbox" id="o_kit" data-f="kit" ${o.kit?'checked':''} ${S.pode?'':'disabled'}> Kit de estrutura comprado</label>${!o.matReal&&S.pode?'<button class="btn s" data-act="rapido" data-f="matReal">Chegou hoje</button>':''}</div></div>
  <div class="step ${tinha?'done':o.matReal?'now':''}"><h3>Agendamento (obras)</h3><div class="fg">${sel('equipe','Equipe',vEq,eqs,'data-ag')}<label>Início previsto<input type="date" id="o_iniPrev" value="${esc(vIni)}" ${S.podeInst?'':'disabled'}></label><label>Fim previsto<input type="date" id="o_fimPrev" value="${esc(vFim)}" ${S.podeInst?'':'disabled'}></label>
   ${tinha?`<label class="w">Motivo, se mudar as datas (opcional)<select id="o_motivo" ${S.podeInst?'':'disabled'}><option value="">—</option>${S.cfg.motivos.map(m=>`<option>${esc(m)}</option>`).join('')}</select></label>`:''}</div>
   ${sg&&!p.d&&S.podeInst?`<div class="note">Sugestão preenchida: ${sg.eq?esc(eqNome(sg.eq)):'sem equipe habitual na cidade'}, primeiro dia útil livre em ${br(sg.d)}. Ajuste se precisar e salve.</div>`:''}
   ${tinha&&(k.bIni!==o.iniPrev||k.bFim!==o.fimPrev)?`<div class="note">Previsão original: ${br(k.bIni)} a ${br(k.bFim)}.${k.reprog?' Remarcada '+k.reprog+' vez(es).':''}</div>`:''}
   <div class="err" id="e_ag"></div>${S.podeInst&&!o.fimReal?`<div class="acts"><button class="btn p" data-act="salvarAg">${tinha?'Salvar reprogramação':'Agendar instalação'}</button></div>`:''}</div>
  <div class="step ${o.fimReal?'done':k.st==='inst'?'now':''}"><h3>Instalação</h3><div class="fg">${inp('iniReal','Início realizado',o.iniReal,'date')}${inp('fimReal','Finalizada em',o.fimReal,'date')}</div>
   ${o.fimReal&&k.desvio!=null?`<div class="note">${k.desvio>0?`Finalizada ${dias(k.desvio)} depois da data programada (${br(k.bFim)}).`:k.desvio<0?`Finalizada ${dias(-k.desvio)} antes da data programada (${br(k.bFim)}).`:'Finalizada na data programada.'}${k.durPrev&&k.durReal?` Programada para ${dias(k.durPrev)}, levou ${dias(k.durReal)}.`:''}</div>`:''}
   ${S.podeInst&&!o.fimReal?`<div class="acts">${!o.iniReal?'<button class="btn s" data-act="rapido" data-f="iniReal">Iniciou hoje</button>':''}<button class="btn s" data-act="rapido" data-f="fimReal">Finalizou hoje</button></div>`:''}</div>
  <div class="step"><h3>Observações</h3><div class="fg"><label class="w"><span class="muted">Anotações da obra</span><textarea id="o_obs" data-f="obs" rows="2" ${S.pode?'':'disabled'}>${esc(o.obs||'')}</textarea></label>
   <label class="ck f"><input type="checkbox" data-f="fora" ${o.fora?'checked':''} ${S.pode?'':'disabled'}> Fora dos indicadores (ex.: licitação)</label></div><div class="err" id="e_o"></div></div>
  <div class="step ${o.ctPath?'done':''}"><h3>Contrato</h3>${o.ctPath?`<div class="acts"><a class="btn s" href="/obras/contrato/${encodeURIComponent(o.cod)}" target="_blank" rel="noopener">Abrir ${esc(o.ctNome||'contrato')}</a>${S.podeCt?'<button class="btn s" data-act="conferirCt">Conferir com a obra</button><button class="btn s d" data-act="removerCt">Remover</button>':''}</div>`:'<span class="muted">Nenhum contrato anexado. Ao anexar, a Central lê o PDF e compara com os dados da obra (vindos do Flow).</span>'}
   ${S.podeCt?`<div class="fg" style="margin-top:8px"><label class="w">${o.ctPath?'Trocar o contrato (PDF)':'Anexar contrato (PDF)'}<input type="file" id="g_ct" accept=".pdf,application/pdf"></label></div>`:''}
   <div class="fg" style="margin-top:8px"><label class="w">Particularidades e benefícios<textarea id="o_partic" data-f="partic" rows="3" maxlength="2000" placeholder="Ex.: brinde, desconto, condição especial combinada com o cliente" ${S.podeCt?'':'disabled'}>${esc(o.partic||'')}</textarea></label></div></div>
  <div class="step"><h3>Histórico</h3><ul class="hist" id="hist">${histHtml(o)}</ul>
   ${S.podeInst?`<div class="acts"><button class="btn s d" data-act="excluir">Excluir obra</button></div>`:''}</div>`;
}
/* ---------- Flow e tags ---------- */
const CAMPO_FLOW={nome_card:['card','Nome do card'],cliente:['cliente','Cliente'],cpf_cnpj:['cpf','CPF/CNPJ'],endereco:['end','Endereço'],cep:['cep','CEP'],cidade:['cidade','Cidade'],telefone:['tel','Telefone'],
  email_cliente:['email','E-mail'],kwp:['kwp','Potência (kWp)'],equipamentos:['equip','Equipamentos'],valor:['valor','Valor'],financiamento:['financ','Financiamento']};
function avisosFlow(o){
  const a=[];
  if(o.codProv)a.push(`Código provisório: no Flow, o pedido ${esc(o.pedido||'')} está sem código de projeto no padrão (ex.: WB260500COL). Corrija lá e a obra troca de código sozinha.`);
  if(o.flowSit&&!['Aprovado','Faturado'].includes(o.flowSit))a.push(`O pedido saiu de aprovado no Flow (agora: ${esc(o.flowSit)}). Confira se a obra continua.`);
  if(o.fimReal&&o.osStatus&&!/^obra conclu/i.test(o.osStatus)&&!/cancel/i.test(o.osStatus))a.push(`Instalação concluída aqui, mas a OS no Flow está em "${esc(o.osStatus)}": falta mudar a OS.`);
  if(o.osStatus&&/cancel/i.test(o.osStatus))a.push('A OS foi cancelada no Flow.');
  return a;
}
const fmtFlow=(k,v)=>v==null?'vazio':k==='equipamentos'?(v||[]).map(e=>`${e.quantidade}× ${e.produto}`).join('; '):k==='valor'?moeda(v):k==='financiamento'?(v?'sim':'não'):k==='kwp'?num(v,2):String(v);
function flowHtml(o){
  if(!o.pedido&&!o.osFlow)return'<span class="muted">Sem pedido ligado no Flow (obra cadastrada antes da integração).</span>';
  const fv=o.flowVal||{},dif=(o.flowEd||[]).filter(k=>CAMPO_FLOW[k]&&k in fv&&JSON.stringify(fv[k])!==JSON.stringify(o[CAMPO_FLOW[k][0]]??null));
  return`<div class="flowbox"><b>Pedido ${esc(o.pedido||'—')}</b> · ${esc(o.flowSit||'situação não informada')}${o.osFlow?` · OS ${esc(o.osFlow)}: <b>${esc(o.osStatus||'—')}</b>`:''}${o.osCoord?` · coordenador ${esc(o.osCoord)}`:''}
   ${o.flowInfo?`<div class="info">${esc(o.flowInfo)}</div>`:''}
   ${o.flowAt?`<div class="muted small" style="margin-top:6px">Atualizado do Flow em ${new Date(o.flowAt).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}. Os dados do Flow se atualizam sozinhos enquanto ninguém muda o campo aqui.</div>`:''}</div>
   ${avisosFlow(o).map(t=>`<div class="note">${t}</div>`).join('')}
   ${dif.length?`<div class="note">Diferente do Flow (vale o da Central): ${dif.map(k=>`${CAMPO_FLOW[k][1]} (no Flow: ${esc(fmtFlow(k,fv[k]))})`).join(' · ')}</div>`:''}`;
}
function tagsHtml(o){
  const todas=(S.cfg.tags||[]).map(x=>x.nome).filter(t=>!(o.tags||[]).includes(t));
  return`<div class="tags">${(o.tags||[]).map(t=>`<span class="pill tag" style="--h:${corTag(t)}">${esc(t)}<button data-act="tiraTag" data-t="${esc(t)}" aria-label="Tirar a tag ${esc(t)}">×</button></span>`).join('')||'<span class="muted small">Nenhuma tag.</span>'}</div>
   <div class="acts" style="margin-top:6px"><input id="o_tag" list="dltag" maxlength="30" placeholder="Escolha da lista ou digite uma nova" style="flex:1"><datalist id="dltag">${todas.map(t=>`<option value="${esc(t)}">`).join('')}</datalist><button class="btn s" data-act="maisTag">Adicionar</button></div>`;
}
async function salvarTags(cod,tags){
  const {data,error}=await sb.rpc('obra_salvar_tags',{p_codigo:cod,p_tags:tags});
  if(error){toast(/15 tags/.test(error.message)?'No máximo 15 tags por obra.':'Não foi possível salvar a tag.');return}
  const o=S.obras.get(cod);if(o)o.tags=data||[];toast('Tags salvas');await carregarCfg();gaveta();carregarHist(cod);render();
}
/* ---------- conferência do contrato com a obra ---------- */
const sem=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
async function conferirCt(cod){
  const o=S.obras.get(cod);if(!o||!o.ctPath)return;
  modal('<h2>Conferindo o contrato…</h2><p class="muted">Lendo o PDF e comparando com a obra.</p>');
  let d;try{d=(await api({acao:'ler',path:o.ctPath,nome:o.ctNome||'contrato.pdf'})).dados}catch(e){modal(`<h2>Não deu para ler o contrato</h2><p>${esc(e.message)}</p><div class="acts"><button class="btn" data-act="fechar">Fechar</button></div>`);return}
  if(!d||!d.lido){modal('<h2>Não deu para ler o contrato</h2><p class="muted">PDF digitalizado ou modelo diferente. Confira à mão.</p><div class="acts"><button class="btn" data-act="fechar">Fechar</button></div>');return}
  const dig=s=>String(s||'').replace(/\D/g,'');
  const C=[['Cliente','cliente',d.cliente,(a,b)=>sem(a)===sem(b)],['CPF/CNPJ','cpf',d.cpf_cnpj,(a,b)=>dig(a)===dig(b)],['Cidade','cidade',d.cidade,(a,b)=>sem(a)===sem(b)],
    ['Potência (kWp)','kwp',d.kwp,(a,b)=>Math.abs(Number(a)-Number(b))<0.011],['Módulos','mod',d.modulos,(a,b)=>Number(a)===Number(b)],['Estrutura','estrut',d.estrutura,(a,b)=>sem(a)===sem(b)],
    ['Valor','valor',d.valor,(a,b)=>Math.abs(Number(a)-Number(b))<1],['Financiamento','financ',d.financiamento,(a,b)=>!!a===!!b]];
  const vazios={};let bate=0,difere=0;
  const lin=C.filter(c=>c[2]!=null&&c[2]!=='').map(([rot,k,vc,ig])=>{const vo=o[k];let st;
    if(vo==null||vo===''){st='<span class="muted">vazio na obra</span>';vazios[k]=vc}else if(ig(vo,vc)){st='<span class="conf-ok">✓ bate</span>';bate++}else{st='<span class="conf-x">✗ diferente</span>';difere++}
    const f=v=>k==='valor'?moeda(v):k==='financiamento'||k==='financ'?(v?'sim':'não'):k==='kwp'?num(v,2):esc(v);
    return`<tr><td>${rot}</td><td>${vo==null||vo===''?'—':f(vo)}</td><td>${f(vc)}</td><td>${st}</td></tr>`}).join('');
  S.ctVazios={cod,patch:vazios};
  modal(`<h2>Contrato × obra</h2><p class="muted">${bate} ${bate===1?'campo bate':'campos batem'}, <b>${difere} ${difere===1?'diferente':'diferentes'}</b>. A obra tem os dados do Flow; o contrato não muda nada sozinho.</p>
   <div class="rep"><table><thead><tr><th>Campo</th><th>Na obra</th><th>No contrato</th><th></th></tr></thead><tbody>${lin||'<tr><td colspan="4" class="muted">Nada para comparar.</td></tr>'}</tbody></table></div>
   <div class="acts">${Object.keys(vazios).length&&S.pode?'<button class="btn p" data-act="preencherCt">Preencher os vazios com o contrato</button>':''}<button class="btn" data-act="fechar">Fechar</button></div>`);
}
const ROT={tags:'Tags',codigo:'Código da obra',entrada:'Data de entrada',material_previsto:'Previsão de entrega',material_entregue:'Entrega do material',inicio_previsto:'Início previsto',fim_previsto:'Fim previsto',inicio_real:'Início realizado',fim_real:'Finalização',equipe_id:'Equipe',criada:'Obra criada',contrato_nome:'Contrato',nome_card:'Nome do card',pagamento_na:'Pagamento vinculado',pagamentos:'Pagamento condicionado'};
const fv=(c,v)=>v==null||v===''?'vazio':c==='equipe_id'?eqNome(v):c==='criada'?({manual:'manual',contrato:'pelo contrato',planilha:'da planilha',flow:'do Flow'}[v]||v):/^\d{4}-\d\d-\d\d$/.test(v)?brA(v):v;
function histHtml(o){const h=S.hist[o.cod];if(!h)return'<li class="muted">Carregando…</li>';if(!h.length)return'<li class="muted">Sem alterações registradas.</li>';
  return h.map(x=>`<li><b>${esc(ROT[x.campo]||x.campo)}</b>${x.campo==='criada'?' '+esc(fv('criada',x.para)):`: ${x.de!=null?esc(fv(x.campo,x.de))+' → ':''}${esc(fv(x.campo,x.para))}`}${x.motivo?` · motivo: ${esc(x.motivo)}`:''}<br><span class="muted small">${new Date(x.em).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}${x.usuario?' · '+esc(S.nomes[x.usuario]||'alguém'):''}</span></li>`).join('')}
/* ---------- pagamento condicionado (Financeiro) ---------- */
// Cada condição: parte da obra (entrega/instalação/conclusão), valor, quem da Central Administrativa é avisado (tarefa no planner
// na data da etapa, que acompanha a reprogramação) e quando foi recebido. Edita: obras, equipe e admin (o banco confere).
const ETAPA={entrega:'na entrega do material',instalacao:'no início da instalação',conclusao:'na conclusão da obra'};
const DATAS_PAG=['matPrev','matReal','iniPrev','fimPrev','iniReal','fimReal'];
const ADM=(C.perfis||[]).filter(p=>p.ativo&&p.papel!=='obras').sort((a,b)=>String(a.nome).localeCompare(String(b.nome)));
const pagPend=o=>(o.pag||[]).filter(p=>!p.recebido_em);
const dataEtapa=(o,e)=>e==='entrega'?[o.matReal,o.matPrev]:e==='instalacao'?[o.iniReal,o.iniPrev]:e==='conclusao'?[o.fimReal,o.fimPrev]:[null,null];
function avisarPadrao(){if(C.usuario&&ADM.some(p=>p.id===C.usuario.id))return C.usuario.id;try{const v=localStorage.getItem('obraAvisar');if(ADM.some(p=>p.id===v))return v}catch(_){}return''}
function linhaPag(o,p,ed){
  const d=ed?'':'disabled',[real,prev]=dataEtapa(o,p.etapa);
  const quando=!p.etapa?'':real?`Etapa feita em ${br(real)}`:prev?`Prevista para ${br(prev)}`:'Etapa ainda sem data';
  return`<div class="pagrow" data-pid="${esc(p.id)}"><div class="fg">
   <label>Pagamento condicionado<select data-p="etapa" ${d}><option value="">—</option>${Object.entries(ETAPA).map(([k,v])=>`<option value="${k}"${p.etapa===k?' selected':''}>${v.charAt(0).toUpperCase()+v.slice(1)}</option>`).join('')}</select></label>
   <label>Valor (R$, opcional)<input type="number" step="0.01" min="0" data-p="valor" value="${esc(p.valor??'')}" ${d}></label>
   <label>Avisar no planner de<select data-p="avisar" ${d}><option value="">Ninguém</option>${ADM.map(x=>`<option value="${esc(x.id)}"${p.avisar===x.id?' selected':''}>${esc(x.nome||'Sem nome')}</option>`).join('')}</select></label>
   <label>Recebido em<input type="date" data-p="recebido_em" value="${esc(p.recebido_em||'')}" ${d}></label>
   <label class="w">Observação<input type="text" maxlength="300" data-p="obs" value="${esc(p.obs||'')}" placeholder="ex.: 30% do contrato, cliente paga via Pix" ${d}></label></div>
   <div class="acts" style="margin-top:4px"><span class="muted small" style="flex:1">${quando}${p.recebido_em?' · recebido':''}</span>${ed?'<button class="btn s d" data-act="tiraPag">Tirar</button>':''}</div></div>`;
}
function pagHtml(o){
  const ed=S.podePag,l=o.pag||[];
  return`<div id="pags" class="pags">${l.map(p=>linhaPag(o,p,ed)).join('')}</div>${!l.length&&!ed?'<span class="muted">Sem pagamento condicionado.</span>':''}
   ${ed?`<div class="note" style="margin-top:6px">Quem for avisado recebe a tarefa "Receber" no planner na data da etapa; se a obra for reprogramada, a tarefa muda junto. Marcou "Recebido em", a tarefa sai.</div>
   <div class="err" id="e_pag"></div><div class="acts"><button class="btn s" data-act="maisPag">+ Condição de pagamento</button><button class="btn p" data-act="salvarPag">Salvar pagamento</button></div>`:''}`;
}
async function salvarPag(){
  const o=S.obras.get(S.sel),E=$('#e_pag');E.textContent='';
  const lista=[...document.querySelectorAll('#pags .pagrow')].map(r=>{const v=k=>r.querySelector(`[data-p="${k}"]`).value.trim();
    return{id:r.dataset.pid,etapa:v('etapa'),valor:v('valor')||null,avisar:v('avisar')||null,recebido_em:v('recebido_em')||null,obs:v('obs')||null}});
  if(lista.some(p=>!p.etapa)){E.textContent='Escolha a parte da obra em cada condição.';return}
  if(lista.some(p=>p.recebido_em&&!dataOk(p.recebido_em))){E.textContent='Data de recebimento inválida.';return}
  try{const r=await fetch('/obras/api/pagamento',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({acao:'salvar',codigo:o.cod,lista})});
    const j=await r.json().catch(()=>({}));if(!r.ok){E.textContent=j.erro||'Não foi possível salvar.';return}
    const av=lista.find(p=>p.avisar)?.avisar;if(av)try{localStorage.setItem('obraAvisar',av)}catch(_){}
    o.pag=lista;toast(j.aviso||'Pagamento salvo');recarregar();carregarHist(o.cod);
  }catch(e){E.textContent='Sem conexão. Tente de novo.'}
}
function refletir(cod){fetch('/obras/api/pagamento',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({acao:'refletir',codigo:cod})}).catch(()=>{})}
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
  ctPath:'contrato_path',ctNome:'contrato_nome',origem:'origem',pag:'pagamentos',tel:'telefone',tags:'tags',bMat:'baseline_material',
  partic:'particularidades',flowSit:'flow_situacao',osFlow:'os_flow',osStatus:'os_status',osCoord:'os_coordenador',flowInfo:'flow_info',flowVal:'flow_valores',flowEd:'flow_editado',flowAt:'flow_sincronizado_em',codProv:'codigo_provisorio'};
const SO_LEITURA=new Set(['tags','bMat','flowSit','osFlow','osStatus','osCoord','flowInfo','flowVal','flowEd','flowAt','codProv','bIni','bFim']);
const daLinha=r=>{const o={cod:r.codigo};for(const[k,c]of Object.entries(COL))o[k]=r[c]??null;o.kwp=o.kwp==null?null:Number(o.kwp);o.valor=o.valor==null?null:Number(o.valor);o.top=r.topicos||{};o.topx=r.topicos_extra||[];o.equip=r.equipamentos||[];o.pag=r.pagamentos||[];o.tags=r.tags||[];o.flowEd=r.flow_editado||[];o.flowVal=r.flow_valores||{};return o};
const paraBanco=patch=>{const p={};for(const[k,v]of Object.entries(patch))if(COL[k]&&!SO_LEITURA.has(k))p[COL[k]]=v;return p};
function msgErro(e){const m=String(e&&e.message||'');
  if(/log[íi]stica/i.test(m))return'Seu perfil (logística) não edita a instalação da obra.';
  if(/42501|só pode consultar|row-level/i.test(m+(e&&e.code)))return'Seu perfil só pode consultar o cronograma.';
  if(/duplicate|23505/.test(m+(e&&e.code)))return'Já existe uma obra com esse código.';
  if(/check constraint|23514/i.test(m+(e&&e.code)))return'Alguma data não fecha com as outras (entrega antes da entrada, fim antes do início ou ano fora de 2024–2030). Confira.';
  return'Não foi possível salvar. Tente de novo.'}
async function salvar(cod,patch,motivo){
  const soCt=Object.keys(patch).every(k=>CT.has(k));
  if(!S.pode&&!(soCt&&S.podeCt)){toast('Seu perfil só pode consultar o cronograma.');return false}
  const {error}=soCt?await sb.rpc('obra_salvar_contrato',{p_codigo:cod,p_patch:paraBanco(patch)})
    :await sb.rpc('obra_salvar',{p_codigo:cod,p_patch:paraBanco(patch),p_motivo:motivo||null});
  if(error){toast(msgErro(error));return false}
  const o=S.obras.get(cod);if(o)Object.assign(o,patch);toast('Salvo');
  if(o&&(o.pag||[]).some(p=>p.avisar)&&Object.keys(patch).some(k=>DATAS_PAG.includes(k)))refletir(cod);
  recarregar();return true;
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
  const mot=f==='matPrev'&&o.matPrev?($('#o_motivoMat')?.value||null):null;
  if(await salvar(o.cod,{[f]:v},mot))S.pre=null;
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
  const oc=(carga(o.cod).get(eq+'|'+ini)||[]).length;E.textContent='';
  if(await salvar(o.cod,{equipe:eq,iniPrev:ini,fimPrev:fim},mud?mot:null)){S.pre=null;if(oc>=(eqp(eq)?.cap||1))toast(`Salvo. Atenção: ${eqNome(eq)} já tem ${oc} obra(s) em ${br(ini)}.`)}
}
async function rapido(f,cod){const o=S.obras.get(cod||S.sel);const e=validar(o,f,HOJE);if(e){const el=$('#e_o');if(el)el.textContent=e;toast(e);return}
  await salvar(o.cod,{[f]:HOJE})}
let confEx=0;
async function excluir(b){if(Date.now()-confEx>4000){confEx=Date.now();b.textContent='Clique de novo para confirmar a exclusão';return}
  const c=S.sel,tinhaPag=(S.obras.get(c)?.pag||[]).some(p=>p.avisar),{error}=await sb.from('obra_obras').delete().eq('codigo',c);if(error){toast(msgErro(error));return}if(tinhaPag)refletir(c);fechar();toast('Obra excluída');recarregar()}

/* ---------- nova obra (pelo contrato) ---------- */
let NOVO=null; // {path, nome} do contrato enviado
const COD_OK=/^[A-Z0-9][A-Z0-9-]{3,30}$/;
function mNova(){
  NOVO=null;const eqs=S.cfg.equipes.filter(e=>e.ativa).map(e=>[e.id,e.nome+(e.base?' · '+e.base:'')]);
  modal(`<h2>Obra manual</h2><p class="muted small" style="max-width:70ch">Para quando a obra não veio do Flow. Se o pedido aparecer depois no Flow com o mesmo código, a Central liga os dois sozinha e só completa o que estiver vazio aqui (nada é duplicado).</p>
   <div class="fg"><label class="w">Contrato em PDF: a Central lê os dados e guarda o arquivo na obra<input type="file" id="n_arq" accept=".pdf,application/pdf"></label></div>
   <div id="n_ct" hidden></div>
   <div class="fg" style="margin-top:10px">${inp('n_cod','Código da obra * (ex.: WB260500COL)','','text','style="text-transform:uppercase" maxlength="31"')}${inp('n_card','Nome do card *','')}${inp('n_contrato','Nome do contrato','','text','placeholder="ex.: 1114"')}
   ${inp('n_cliente','Cliente *','','text','','w')}${inp('n_entrada','Data de entrada *',HOJE,'date')}${inp('n_cidade','Cidade','')}${sel('n_zona','Zona','',['Urbano','Rural'])}
   ${inp('n_kwp','Potência (kWp)','','number','step="0.01" min="0"')}${inp('n_mod','Módulos','','number','step="1" min="0"')}${sel('n_estrut','Estrutura','',S.cfg.estruturas)}${sel('n_envio','Envio do material','Estoque',['Estoque','Distribuidora'])}
   ${inp('n_valor','Valor do contrato (R$)','','number','step="0.01" min="0"')}${inp('n_assinado','Assinado em','','date')}${inp('n_formaPag','Forma de pagamento','','text','','w')}
   ${sel('n_pagNa','Pagamento condicionado','',Object.entries(ETAPA).map(([k,v])=>[k,v.charAt(0).toUpperCase()+v.slice(1)]))}${inp('n_matPrev','Previsão de entrega do material','','date')}
   ${S.podeInst?`${inp('n_iniPrev','Previsão de instalação (início)','','date')}${inp('n_fimPrev','Previsão de instalação (fim)','','date')}${sel('n_equipe','Equipe (pode definir depois)','',eqs)}`:''}</div>
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
    pagamentos:g('pagNa')?[{id:'p1',etapa:g('pagNa'),...(avisarPadrao()?{avisar:avisarPadrao()}:{})}]:[],material_previsto:mp||null,equipe_id:eq||null,inicio_previsto:ini||null,fim_previsto:ini?fim:null,
    cpf_cnpj:d.cpf_cnpj||null,endereco:d.endereco||null,cep:d.cep||null,email_cliente:d.email_cliente||null,geracao_kwh:d.geracao_kwh||null,equipamentos:d.equipamentos||[],financiamento:d.financiamento??null,
    contrato_path:NOVO?NOVO.path:null,contrato_nome:NOVO?NOVO.nome:null,origem:NOVO?'contrato':'manual'};
  const {error}=await sb.from('obra_obras').insert(linha);
  if(error){E.textContent=msgErro(error);return}
  if(linha.pagamentos.some(p=>p.avisar))refletir(cod);
  fecharModal();toast(ini&&mp&&diff(ini,mp)<S.cfg.folgaDias?'Obra cadastrada. Atenção: instalação muito próxima da entrega do material.':'Obra cadastrada');
  await recarregar();setTimeout(()=>abrir(cod),200);
}
async function anexar(cod,file){
  try{toast('Enviando o contrato…');const path=await enviarPdf(file);
    if(await salvar(cod,{ctPath:path,ctNome:file.name.slice(0,150)})){toast('Contrato anexado');conferirCt(cod)}}
  catch(e){toast(e.message||'Não foi possível anexar o contrato.')}
}
let confCt=0;
async function removerCt(b){if(Date.now()-confCt>4000){confCt=Date.now();b.textContent='Clique de novo para remover';return}
  await salvar(S.sel,{ctPath:null,ctNome:null})}

/* ---------- equipes (página) ---------- */
function vEquipes(){
  const c=S.cfg,dis=S.podeInst?'':'disabled';
  const carga30={};for(const o of S.obras.values())if(o.equipe&&o.iniPrev&&o.iniPrev>=HOJE&&o.iniPrev<=add(HOJE,30)&&!o.fimReal)carga30[o.equipe]=(carga30[o.equipe]||0)+1;
  return`<p class="muted" style="max-width:75ch">Cada equipe tem uma cor no calendário, uma base e quantas obras faz ao mesmo tempo (acima disso aparece alerta de conflito).${S.podeInst?'':' Você está em modo de consulta: quem edita as equipes é a área de obras.'}</p>
   <div class="list" id="ceq">${c.equipes.map(e=>linhaEq(e,dis,carga30[e.id]||0)).join('')}</div>
   ${S.podeInst?`<div class="acts"><button class="btn s" data-act="novaEq">+ Adicionar equipe</button><button class="btn p" data-act="salvarEq">Salvar equipes</button><span class="err" id="e_c"></span></div>`:''}`;
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
  const c=S.cfg,dis=S.podeInst?'':'disabled';
  return`<div class="two" style="margin-top:0"><div class="panel"><h3>Metas de prazo</h3><div class="fg">${inp('c_meta','Meta (dias da entrada ao fim)',c.metaDias,'number','min="1"')}${inp('c_lim','Limite crítico (dias)',c.limiteDias,'number','min="1"')}${inp('c_folga','Folga mínima entre material e instalação (dias)',c.folgaDias,'number','min="0"')}</div></div>
   <div class="panel"><h3>Motivos de remarcação (entrega e instalação)</h3><label class="f">Um por linha<textarea id="c_mot" rows="6" ${dis}>${esc(c.motivos.join('\n'))}</textarea></label></div>
   <div class="panel"><h3>Estruturas</h3><label class="f">Uma por linha<textarea id="c_est" rows="6" ${dis}>${esc(c.estruturas.join('\n'))}</textarea></label><p class="muted small">Estrutura que já está em obras não sai da lista (fica inativa).</p></div></div>
   <h3 class="sec">Tags</h3><p class="muted small" style="max-width:75ch">Lista única de tags: quem marca uma tag nova na obra já a coloca aqui ("retrofit" e "Retrofit" viram a mesma). Aqui dá para renomear, trocar a cor ou excluir (sai de todas as obras).</p>
   <div class="list" id="ctags">${(c.tags||[]).map(t=>`<div class="row" data-tag="${esc(t.nome)}" style="padding:6px 12px"><span class="pill tag" style="--h:${t.cor}">${esc(t.nome)}</span>
     ${S.pode||C.admin?`<input type="color" data-k="cor" value="${hslHex(t.cor)}" title="Cor" style="width:34px;height:28px;padding:0;border:0;background:none"><input type="text" data-k="nome" value="${esc(t.nome)}" maxlength="30" style="flex:1 1 160px">
     <button class="btn s" data-act="salvarTag">Salvar</button><button class="btn s d" data-act="excluirTag">Excluir</button>`:''}<span class="muted small">${[...S.obras.values()].filter(o=>(o.tags||[]).includes(t.nome)).length} obra(s)</span></div>`).join('')||'<span class="muted">Nenhuma tag ainda. Marque a primeira na ficha de uma obra.</span>'}</div>
   <h3 class="sec">Tópicos das obras</h3><p class="muted small" style="max-width:75ch">Aparecem em todas as obras, na ficha. Os marcados como importantes ficam em destaque quando a resposta é "sim" (ou para tópicos de texto, quando preenchidos).</p>
   <div class="cfg-lista" id="ctop">${c.topicos.map(t=>linhaTop(t,dis)).join('')}</div>
   ${S.podeInst?`<div class="acts"><button class="btn s" data-act="novoTop">+ Tópico</button></div><div class="acts"><button class="btn p" data-act="salvarCfg">Salvar configurações</button><span class="err" id="e_c"></span></div>`:''}`;
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
function banner(m){$('#banner').innerHTML=m?`<div class="banner">${esc(m)}</div>`:(!S.pode?`<div class="banner">Você está em modo de consulta. Quem edita o cronograma é a equipe de obras e logística. Tags você pode marcar.${S.podePag?' O pagamento condicionado de cada obra também.':''}</div>`:'')}
document.addEventListener('click',async ev=>{
  const t=ev.target.closest('[data-nav],[data-act],[data-obra]');
  if(!t){if(ev.target.id==='scrim')fechar();if(ev.target.id==='modal')fecharModal();return}
  if(t.dataset.nav){location.hash=t.dataset.nav;if(S.view===t.dataset.nav)render();return}
  if(t.dataset.act==='vista'){S.lista=t.dataset.v==='lista';try{localStorage.setItem('obraVista',S.lista?'lista':'cal')}catch(_){}render();return}
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
  else if(a==='maisPag'){$('#pags').insertAdjacentHTML('beforeend',linhaPag(S.obras.get(S.sel),{id:Date.now().toString(36),etapa:'',avisar:avisarPadrao()},true))}
  else if(a==='tiraPag'){t.closest('.pagrow').remove()}
  else if(a==='salvarPag')salvarPag();
  else if(a==='copiarRel'){try{await navigator.clipboard.writeText($('#resumo').textContent);toast('Resumo copiado')}catch(e){toast('Não foi possível copiar.')}}
  else if(a==='baixarRel')baixarRel();
  else if(a==='baixarLista')baixarXlsx(linhasLista(),'Projetos','lista-de-projetos');
  else if(a==='baixarLog')baixarXlsx(linhasLog(),'Entregas','indicadores-logistica-'+(S.repL.mes||'periodo-todo'));
  else if(a==='maisTag'){const o=S.obras.get(S.sel),v=($('#o_tag').value||'').trim();if(o&&v)salvarTags(o.cod,[...(o.tags||[]),v])}
  else if(a==='tiraTag'){const o=S.obras.get(S.sel);if(o)salvarTags(o.cod,(o.tags||[]).filter(x=>x!==t.dataset.t))}
  else if(a==='conferirCt')conferirCt(S.sel);
  else if(a==='ciente')ciente(t.dataset.id);
  else if(a==='limparF'){Object.values(S.f).forEach(x=>x.clear());montarFiltros();render()}
  else if(a==='salvarTag'||a==='excluirTag'){const r=t.closest('[data-tag]'),nm=r.dataset.tag;
    if(a==='excluirTag'){if(!confirm(`Excluir a tag "${nm}"? Ela sai de todas as obras.`))return;const {error}=await sb.rpc('obra_tag_excluir',{p_nome:nm});if(error){toast('Não foi possível excluir.');return}}
    else{const {error}=await sb.rpc('obra_tag_editar',{p_nome:nm,p_novo:r.querySelector('[data-k=nome]').value,p_cor:hexHue(r.querySelector('[data-k=cor]').value)});if(error){toast(/Já existe/.test(error.message)?error.message:'Não foi possível salvar a tag.');return}}
    toast('Tags salvas');await carregarCfg();await recarregar()}
  else if(a==='preencherCt'){const c=S.ctVazios;if(c&&c.cod){fecharModal();await salvar(c.cod,c.patch)}}
});
function baixarXlsx(L,aba,arq){
  if(!L.length){toast('Não há obras neste filtro.');return}
  if(!window.XLSX){toast('O gerador de planilha não carregou. Recarregue a página.');return}
  const ws=XLSX.utils.json_to_sheet(L),wb=XLSX.utils.book_new();ws['!cols']=Object.keys(L[0]).map(k=>({wch:Math.max(12,k.length+2)}));XLSX.utils.book_append_sheet(wb,ws,aba);
  XLSX.writeFile(wb,arq+'.xlsx');toast('Planilha baixada');
}
function baixarRel(){
  const L=linhasRel();if(!L.length){toast('Não há obras neste filtro.');return}
  if(!window.XLSX){toast('O gerador de planilha não carregou. Recarregue a página.');return}
  const ws=XLSX.utils.json_to_sheet(L),wb=XLSX.utils.book_new();ws['!cols']=Object.keys(L[0]).map(k=>({wch:Math.max(12,k.length+2)}));XLSX.utils.book_append_sheet(wb,ws,'Previsto x realizado');
  XLSX.writeFile(wb,`previsto-x-realizado-${S.rep.mes||'periodo-todo'}.xlsx`);toast('Relatório baixado');
}
document.addEventListener('change',ev=>{
  const t=ev.target;
  if(t.dataset.mf){const st=S.f[t.dataset.mf];if(t.checked)st.add(t.value);else st.delete(t.value);const d=t.closest('.mf');d.querySelector('summary').textContent=rotuloF(t.dataset.mf);d.classList.toggle('on',!!st.size);render();return}
  else if(t.id==='lf'){S.listaF=t.value;render()}else if(t.id==='lmes'){S.repL.mes=t.value;render()}
  else if(t.id==='mi'){S.mi=t.checked;render()}else if(t.id==='me'){S.me=t.checked;render()}
  else if(t.id==='rmes'){S.rep.mes=t.value;render()}else if(t.id==='rmin'){S.rep.min=Math.max(0,+t.value||0);render()}else if(t.id==='rso'){S.rep.so=t.checked;render()}
  else if(t.id==='n_arq'&&t.files[0])lerContrato(t.files[0]);
  else if(t.id==='g_ct'&&t.files[0]&&S.sel)anexar(S.sel,t.files[0]);
  else if((t.dataset.top||t.dataset.topx!==undefined)&&t.closest('#drawer'))salvarTopico(t);
  else if(t.id==='o_tag'||t.id==='o_motivoMat'||t.id==='o_motivo')return;
  else if(t.dataset.f&&t.closest('#drawer'))campo(t);
});
let tq;$('#fq').addEventListener('input',e=>{clearTimeout(tq);tq=setTimeout(()=>{S.q=e.target.value;render()},180)});
addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='o_tag'){e.preventDefault();$('[data-act=maisTag]')?.click();return}if(e.key==='Escape'){if($('#modal').classList.contains('on'))fecharModal();else fechar()}});

/* ---------- dados (Supabase) ---------- */
let token=C.token,tokenExp=C.tokenExp||0;
async function tokenAtual(forcar){
  if(!forcar&&Date.now()/1000<tokenExp-120)return token;
  try{const r=await fetch('/obras/api/token',{cache:'no-store',redirect:'manual'});if(r.ok){const j=await r.json();if(j.token){token=j.token;tokenExp=j.exp||0;window.centralSessao?.voltou()}}else if(r.status===401||r.type==='opaqueredirect')window.centralSessao?.expirou('/obras/cronograma')}catch(_){}
  return token;
}
const sb=window.supabase.createClient(C.url,C.anon,{accessToken:tokenAtual});
window.centralSessao?.manterVivo(tokenAtual);
async function carregarCfg(){
  const [cfg,eqs,est,tops,tgs]=await Promise.all([sb.from('obra_config').select('chave,valor'),sb.from('obra_equipes').select('*').order('nome'),sb.from('obra_estruturas').select('*').order('ordem'),sb.from('obra_topicos').select('*').order('ordem'),sb.from('obra_tags').select('nome,cor').order('nome')]);
  const m=Object.fromEntries((cfg.data||[]).map(r=>[r.chave,r.valor])),metas=m.metas||{};
  S.cfg={metaDias:metas.meta_dias||30,limiteDias:metas.limite_dias||45,folgaDias:metas.folga_dias??1,motivos:m.motivos_reprogramacao||CFG0.motivos,
    equipes:(eqs.data||[]).map(e=>({id:e.id,nome:e.nome,base:e.base,filial:e.filial,membros:e.membros,h:e.matiz,cap:e.capacidade_dia,ativa:e.ativa})),
    estruturas:(est.data||[]).filter(e=>e.ativa).map(e=>e.nome),estruturasTodas:(est.data||[]).map(e=>e.nome),topicos:tops.data||[],tags:tgs.data||[]};
}
async function lerTudo(tabela,cols){const out=[];for(let de=0;;){const {data,error}=await sb.from(tabela).select(cols).order(tabela==='obra_historico'?'id':'codigo').range(de,de+999);if(error)throw error;if(!data.length)break;out.push(...data);de+=data.length}return out} // o servidor pode devolver menos que 1000 por página
async function lerReprog(){const out=[];for(let de=0;;){const {data,error}=await sb.from('obra_historico').select('obra,campo,motivo,em').in('campo',['inicio_previsto','fim_previsto','material_previsto']).not('de','is',null).order('id').range(de,de+999);if(error||!data.length)break;out.push(...data);de+=data.length}return out}
let carregando=null;
async function recarregar(){
  if(carregando)return carregando;
  carregando=(async()=>{
    const [linhas,rep,av]=await Promise.all([lerTudo('obra_obras','*'),lerReprog(),sb.from('obra_avisos').select('id,obra,tipo,texto,criado_em').is('resolvido_em',null).order('criado_em',{ascending:false})]);
    S.avisos=av.data||[];
    S.obras=new Map(linhas.map(r=>[r.codigo,daLinha(r)]));
    // remarcações: instalação (início e fim mudados juntos contam uma vez) e entrega
    S.reprog={};S.reprogMat={};S.hInst=[];S.hMat=[];const vistos=new Set();
    for(const h of rep){if(h.campo==='material_previsto'){S.reprogMat[h.obra]=(S.reprogMat[h.obra]||0)+1;S.hMat.push(h);continue}
      const k=h.obra+'|'+h.em;if(vistos.has(k))continue;vistos.add(k);S.reprog[h.obra]=(S.reprog[h.obra]||0)+1;S.hInst.push(h)}
    S.ok=true;banner();render();abrirPendente();
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
    .on('postgres_changes',{event:'*',schema:'public',table:'obra_equipes'},()=>carregarCfg().then(render))
    .on('postgres_changes',{event:'*',schema:'public',table:'obra_avisos'},depois).subscribe();
})();
