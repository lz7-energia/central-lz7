/* Planner Eisenhower — Central LZ7. Reaproveitado do planner-index.html; dados no banco da Central e ClickUp pelo servidor. */
const CATS={FIS:'Fiscal/Adm',CP:'Contas a Pagar',CR:'Contas a Receber',GER:'Gerencial',RH:'RH'};
const DEF={theme:'normal',urgentDays:7,qNames:['Prioridade máxima','Importante','Rápido','Pode esperar'],counters:{quad:true,cat:true,progress:true},facultativos:true,quintoDiaUtil:true,satCount:true,name:''};
const WD=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const $=s=>document.querySelector(s);
const pad=n=>String(n).padStart(2,'0');
const ds=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const pd=s=>{const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d,12);};
const addDays=(s,n)=>{const d=pd(s);d.setDate(d.getDate()+n);return ds(d);};
const diffDays=(a,b)=>Math.round((pd(b)-pd(a))/86400000);
const todayS=()=>ds(new Date());
const dow=s=>pd(s).getDay();
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=p=>p+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const fmt=(s,o)=>pd(s).toLocaleDateString('pt-BR',o);
const fmtShort=s=>fmt(s,{day:'2-digit',month:'2-digit'});
const weekStart=s=>addDays(s,-dow(s));
const monthStart=s=>s.slice(0,8)+'01';
const monthEnd=s=>{const d=pd(s);return ds(new Date(d.getFullYear(),d.getMonth()+1,0,12));};

const S={tasks:new Map(),events:new Map(),settings:JSON.parse(JSON.stringify(DEF)),
  ui:{mode:'all',cursor:todayS(),tab:'home',modeByTab:{agenda:'week',matrix:'all',summary:'week'},showFilters:false,cats:new Set(),quads:new Set(),status:'all',alertOpen:null,matrixDone:false},
  mode:'loading',db:null,loaded:{t:false,e:false,s:false},changes:[],detected:false,edit:null};

/* ---------- feriados e dias úteis ---------- */
function easter(y){const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31),da=((h+l-7*m+114)%31)+1;return ds(new Date(y,mo-1,da,12));}
let holCache={};
function holidays(y){
  if(holCache[y])return holCache[y];
  const m=new Map();
  [['01-01','Confraternização Universal'],['04-21','Tiradentes'],['05-01','Dia do Trabalho'],['09-07','Independência'],['10-12','N. Sra. Aparecida'],['11-02','Finados'],['11-15','Proclamação da República'],['11-20','Consciência Negra'],['12-25','Natal']]
    .forEach(([md,n])=>m.set(y+'-'+md,{name:n,type:'nacional'}));
  const e=easter(y);
  m.set(addDays(e,-2),{name:'Sexta-feira Santa',type:'nacional'});
  if(S.settings.facultativos){
    m.set(addDays(e,-48),{name:'Carnaval',type:'facultativo'});
    m.set(addDays(e,-47),{name:'Carnaval',type:'facultativo'});
    m.set(addDays(e,60),{name:'Corpus Christi',type:'facultativo'});
  }
  for(const ev of S.events.values()){
    if(ev.kind!=='holiday'||!ev.date)continue;
    const d=ev.yearly?y+ev.date.slice(4):ev.date;
    if(d.startsWith(y+'-'))m.set(d,{name:ev.title,type:'proprio',id:ev.id});
  }
  return holCache[y]=m;
}
const isHoliday=s=>holidays(+s.slice(0,4)).get(s);
const isBiz=s=>{const w=dow(s);return w!==0&&w!==6&&!isHoliday(s);};
const prevBiz=s=>{let i=0;while(!isBiz(s)&&i++<20)s=addDays(s,-1);return s;};
function nthBiz(y,m,n){const sat=S.settings.satCount!==false;let d=ds(new Date(y,m,1,12)),c=0;while(pd(d).getMonth()===m){const ok=sat?(dow(d)!==0&&!isHoliday(d)):isBiz(d);if(ok&&++c===n)return dow(d)===6?prevBiz(d):d;d=addDays(d,1);}return null;}

/* ---------- ocorrências ---------- */
function occDates(t,a,b){
  const r=t.rec||{type:'none'},st=t.start,out=[];
  if(!st)return out;
  if(r.type==='none'){if(st>=a&&st<=b)out.push(st);return out;}
  if(r.type==='daily'){let d=a<st?st:a;while(d<=b){if(isBiz(d))out.push(d);d=addDays(d,1);}return out;}
  if(r.type==='weekly'){
    let d=a;const end=addDays(b,7);
    while(d<=end){if(dow(d)===r.weekday&&d>=st){const o=prevBiz(d);if(o>=a&&o<=b)out.push(o);}d=addDays(d,1);}
    return out;
  }
  let y=+a.slice(0,4),m=+a.slice(5,7)-1;let ey=+b.slice(0,4),em=+b.slice(5,7);if(em>11){em=0;ey++;}
  while(y<ey||(y===ey&&m<=em)){
    let nom=null;const last=new Date(y,m+1,0).getDate();
    if(r.type==='monthly')nom=ds(new Date(y,m,Math.min(r.day||1,last),12));
    else if(r.type==='bday')nom=nthBiz(y,m,r.n||1);
    else if(r.type==='yearly'&&m===+st.slice(5,7)-1)nom=ds(new Date(y,m,Math.min(+st.slice(8,10),last),12));
    if(nom){const o=r.type==='bday'?nom:prevBiz(nom);if(o>=a&&o<=b&&nom>=st)out.push(o);}
    m++;if(m>11){m=0;y++;}
  }
  return out;
}
const urgentDays=t=>(typeof t.urgentDays==='number'&&t.urgentDays>=0)?t.urgentDays:(S.settings.urgentDays||7);
const URG=['overdue','today','critical','urgent'];
function mkOcc(t,d){
  const done=!!(t.done&&t.done[d]),left=diffDays(todayS(),d);
  let stage,q;
  if(t.rec&&t.rec.type==='daily'){stage='daily';q=t.dailyQ||1;}
  else{
    const U=urgentDays(t);
    stage=left<0?'overdue':left===0?'today':left<=Math.min(2,U)?'critical':left<=U?'urgent':left<=Math.max(2*U,1)?'warming':'calm';
    const u=URG.includes(stage);q=t.important?(u?1:2):(u?3:4);
  }
  if(done)stage='done';
  const subs=t.subs||[],sd=(t.subDone&&t.subDone[d])||[];
  return {t,date:d,key:t.id+'|'+d,done,left,stage,q,subTotal:subs.length,subDone:subs.filter(s=>sd.includes(s.id)).length};
}
function currentOccs(){
  const today=todayS(),out=[];
  for(const t of S.tasks.values()){
    const r=t.rec||{type:'none'};
    if(r.type==='none'){const o=mkOcc(t,t.start);if(!o.done||o.left>=-7)out.push(o);continue;}
    if(r.type==='daily'){const n=occDates(t,today,addDays(today,14)).find(d=>!(t.done&&t.done[d]))||occDates(t,today,addDays(today,14))[0];if(n)out.push(mkOcc(t,n));continue;}
    const from=addDays(today,-90)>t.start?addDays(today,-90):t.start;
    if(from<today)occDates(t,from,addDays(today,-1)).forEach(d=>{if(!(t.done&&t.done[d]))out.push(mkOcc(t,d));});
    const nx=occDates(t,today,addDays(today,400)).find(d=>!(t.done&&t.done[d]));
    if(nx)out.push(mkOcc(t,nx));
  }
  return out;
}
function rangeOccs(a,b){const out=[];for(const t of S.tasks.values())occDates(t,a,b).forEach(d=>out.push(mkOcc(t,d)));return out;}
function periodRange(){
  const c=S.ui.cursor;
  if(S.ui.mode==='day')return[c,c];
  if(S.ui.mode==='week'){const a=weekStart(c);return[a,addDays(a,6)];}
  if(S.ui.mode==='month')return[monthStart(c),monthEnd(c)];
  return null;
}
function periodOccs(){const r=periodRange();return r?rangeOccs(r[0],r[1]):currentOccs();}
const passCat=o=>!S.ui.cats.size||S.ui.cats.has(o.t.cat);
const passQ=o=>!S.ui.quads.size||S.ui.quads.has(o.q);
const passSt=o=>S.ui.status==='all'||(S.ui.status==='pending'?!o.done:o.done);
const filt=l=>l.filter(o=>passCat(o)&&passQ(o)&&passSt(o));
const RANK={overdue:0,today:1,critical:2,urgent:3,daily:4,warming:5,calm:6,done:9};
const byUrg=l=>l.sort((x,y)=>(x.done-y.done)||(RANK[x.stage]-RANK[y.stage])||x.date.localeCompare(y.date)||(x.t.time||'99').localeCompare(y.t.time||'99')||x.t.title.localeCompare(y.t.title));
const byTime=l=>l.sort((x,y)=>(x.done-y.done)||(!x.t.time-!y.t.time)||(x.t.time||'').localeCompare(y.t.time||'')||(RANK[x.stage]-RANK[y.stage])||x.t.title.localeCompare(y.t.title));

function eachMonth(a,b,fn){let y=+a.slice(0,4),m=+a.slice(5,7)-1;const ey=+b.slice(0,4),em=+b.slice(5,7)-1;while(y<ey||(y===ey&&m<=em)){fn(y,m);m++;if(m>11){m=0;y++;}}}
function eventsIn(a,b){
  const out=[];
  for(let y=+a.slice(0,4);y<=+b.slice(0,4);y++){
    for(const[d,h]of holidays(y))if(d>=a&&d<=b)out.push({date:d,title:h.name+(h.type==='facultativo'?' (facultativo)':''),kind:'holiday',id:h.id||'',nat:h.type!=='proprio'});
    for(const ev of S.events.values()){
      if(ev.kind==='holiday'||!ev.date)continue;
      const d=ev.yearly?y+ev.date.slice(4):ev.date;
      if(d>=a&&d<=b&&(ev.yearly||d.startsWith(y+'-')))out.push({date:d,title:ev.title,kind:'important',id:ev.id});
    }
  }
  if(S.settings.quintoDiaUtil)eachMonth(a,b,(y,m)=>{const d=nthBiz(y,m,5);if(d&&d>=a&&d<=b)out.push({date:d,title:'5º dia útil',kind:'marker',id:''});});
  return out;
}
const evByDate=list=>{const m={};list.forEach(e=>(m[e.date]=m[e.date]||[]).push(e));return m;};

/* ---------- persistência (Central LZ7: banco da Central pelas rotas /planner/api) ---------- */
const API='/planner/api';
async function api(path,opt){
  opt=opt||{};
  let r;
  try{r=await fetch(API+path,{method:opt.method||'GET',headers:opt.body!==undefined?{'Content-Type':'application/json'}:{},body:opt.body!==undefined?JSON.stringify(opt.body):undefined,credentials:'same-origin',cache:'no-store'});}
  catch(e){const x=new Error('sem conexão');x.code='offline';throw x;}
  if(r.status===401){location.href='/entrar?volta=/planner';const x=new Error('login');x.code='revoked';throw x;}
  const j=await r.json().catch(()=>({}));
  if(!r.ok||(j&&j.erro)){const x=new Error((j&&j.erro)||('HTTP '+r.status));x.code='server';throw x;}
  return j;
}
const queues={};let pendingSaves=0;
function enqueue(path,fn){pendingSaves++;queues[path]=(queues[path]||Promise.resolve()).then(fn).catch(e=>{console.error(e);showNotice(errMsg(e),true);}).finally(()=>{pendingSaves--;});return queues[path];}
function errMsg(e){const c=e&&e.code;if(c==='offline')return'Sem conexão com a Central. Suas alterações não foram salvas; tente de novo em instantes.';if(c==='revoked')return'Sua sessão terminou. Entre de novo na Central.';if(c==='server'&&e.message)return'Não foi possível salvar: '+e.message;return'Falha ao salvar. Tente de novo em instantes.';}
const plain=o=>JSON.parse(JSON.stringify(o));
function saveTask(t,o){
  S.tasks.set(t.id,t);render();
  const c=plain(t);
  enqueue('tasks/'+t.id,()=>api('/tarefa',{method:'POST',body:c}).then(j=>{const cur=S.tasks.get(t.id);if(j&&j.tarefa&&cur&&(cur.updatedAt||0)===(c.updatedAt||0)){S.tasks.set(t.id,j.tarefa);}}));
  if(!(o&&o.fromSync))schedulePush();
}
function removeTask(id){S.tasks.delete(id);render();enqueue('tasks/'+id,()=>api('/tarefa?id='+encodeURIComponent(id),{method:'DELETE'}));schedulePush();}
function saveEvent(e){S.events.set(e.id,e);holCache={};render();const c=plain(e);enqueue('events/'+e.id,()=>api('/evento',{method:'POST',body:c}));}
function removeEvent(id){S.events.delete(id);holCache={};render();enqueue('events/'+id,()=>api('/evento?id='+encodeURIComponent(id),{method:'DELETE'}));}
function saveSettings(s){S.settings=s;holCache={};applyTheme();render();const c=plain(s);enqueue('config/settings',()=>api('/config',{method:'POST',body:c}));}
function mergeSettings(s){s=s||{};return{...plain(DEF),...s,counters:{...DEF.counters,...(s.counters||{})},qNames:(Array.isArray(s.qNames)&&s.qNames.length===4)?s.qNames:DEF.qNames.slice()};}
function applyState(j){
  S.tasks=new Map((j.tasks||[]).map(t=>[t.id,t]));
  S.events=new Map((j.events||[]).map(e=>[e.id,e]));
  S.settings=mergeSettings(j.settings);S.sync=j.sync||{};S.usage=(S.sync&&S.sync.usage)||{stamps:[]};
  S.cuConfigured=!!j.clickupConfigurado;S.lastStatus=j.status||{};
  S.equipe=j.equipe||[];S.eu=j.pessoa||{};S.avisos=j.avisos||[];
  if(!S.lastSyncAt&&S.lastStatus.em&&S.lastStatus.status==='ok')S.lastSyncAt=new Date(S.lastStatus.em).getTime();
  holCache={};applyTheme();
}
async function loadState(){const j=await api('/estado');if(pendingSaves>0)return;applyState(j);render();}
async function init(){
  applyTheme();render();
  S.assets=true;
  S.dl={save:o=>{const b=new Blob([o.data],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=o.filename;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1500);return Promise.resolve();}};
  for(let i=0;;i++){
    try{const j=await api('/estado');applyState(j);break;}
    catch(e){if(e&&e.code==='revoked')return;showNotice('Ainda não consegui carregar seus dados. Verifique a conexão; continuo tentando.',true);await new Promise(r=>setTimeout(r,Math.min(15000,2000*(i+1))));}
  }
  clearNotice();S.mode='db';finish();
}
function finish(){
  if(S.detected)return;S.detected=true;detectChanges();render();
  setTimeout(()=>runSync('load'),800);
  setInterval(()=>{if(document.visibilityState==='visible')runSync('timer');},60*60000);
  // Outros aparelhos: relê os dados a cada 30 s com a página visível e nada sendo editado.
  setInterval(()=>{if(document.visibilityState==='visible'&&!$('#modal-root').innerHTML&&!S.syncing&&pendingSaves===0)loadState().catch(()=>{});},30000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){loadState().catch(()=>{});runSync('focus');}});
}
function detectChanges(){
  let prev=null;try{prev=JSON.parse(localStorage.getItem('planner_q')||'null');}catch(e){}
  const cur={},ch=[];
  for(const o of currentOccs()){if(o.done||o.stage==='daily')continue;cur[o.key]=o.q;if(prev&&prev[o.key]&&prev[o.key]!==o.q&&(o.q===1||o.q===3))ch.push(o);}
  try{localStorage.setItem('planner_q',JSON.stringify(cur));}catch(e){}
  S.changes=ch;
}

/* ---------- sincronização ClickUp (Central LZ7: roda no servidor, pela API REST do ClickUp) ---------- */
const syncOn=()=>S.mode==='db'&&!!S.cuConfigured&&!!S.sync&&!!S.sync.enabled;
const noPush=t=>!!(S.sync&&(S.sync.noPush||[]).includes(t.clickupId));
let pushTimer=null;
// "Logo depois de cada edição": espera 2,5 s sem novas edições e manda o servidor sincronizar.
function schedulePush(){if(!syncOn())return;clearTimeout(pushTimer);pushTimer=setTimeout(()=>runSync('edit'),2500);}
const DAY=86400000;
function usage24(){const n=Date.now();return((S.usage&&S.usage.stamps)||[]).filter(x=>n-x<DAY).length;}
function syncStatus(st,msg){S.syncState=st;S.syncMsg=msg||'';renderSyncPill();}
function renderSyncPill(){
  const p=document.getElementById('syncpill');if(!p)return;
  if(S.mode!=='db'||!S.cuConfigured){p.style.display='none';return;}
  p.style.display='';
  if(!S.sync||!S.sync.enabled){p.textContent='⟳ ClickUp: desligado';p.className='';p.title='Ligue em ⚙ Configurações → ClickUp';return;}
  const st=S.syncState;
  p.className=st==='err'?'sync-err':st==='run'?'sync-run':'';
  p.textContent=st==='run'?'⟳ Sincronizando…':st==='err'?'⚠ ClickUp: '+S.syncMsg:S.lastSyncAt?'✓ ClickUp '+new Date(S.lastSyncAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'⟳ ClickUp';
  p.title=(st==='err'?S.syncMsg+' — clique para tentar de novo':'Clique para sincronizar agora')+' · '+usage24()+' chamadas ao ClickUp nas últimas 24h';
  if(st==='err')showNotice('Sincronização com o ClickUp: '+S.syncMsg,true);else if(st==='ok'&&$('#notice').textContent.startsWith('Sincronização com o ClickUp'))clearNotice();
}
async function runSync(why){
  if(!syncOn())return;
  if(S.syncing){S.syncAgain=true;return;}
  S.syncing=true;syncStatus('run');
  try{
    while(pendingSaves>0)await new Promise(r=>setTimeout(r,300));
    const r=await api('/sync',{method:'POST',body:{why}});
    (r.avisos||[]).forEach((m,i)=>setTimeout(()=>toast(m),i*2300));
    if(r.ocupado){syncStatus(S.syncState==='err'?'err':'ok',S.syncMsg);}
    else if(r.desligado){syncStatus('ok');}
    else if(!r.ok)syncStatus('err',r.mensagem);
    else{S.lastSyncAt=r.em||Date.now();syncStatus('ok');}
    if(pendingSaves===0){try{const j=await api('/estado');if(pendingSaves===0){applyState(j);render();}}catch(e){}}
  }catch(e){console.error('sync',e);syncStatus('err',e&&e.code==='offline'?'sem conexão com a Central':(e&&e.message)||'falha ao sincronizar');}
  finally{S.syncing=false;if(S.syncAgain){S.syncAgain=false;setTimeout(()=>runSync('again'),1500);}}
}

/* ---------- UI helpers ---------- */
function showNotice(m,err){const n=$('#notice');n.textContent=m;n.className=err?'err':'';}
function clearNotice(){const n=$('#notice');n.textContent='';n.className='';}
let tt;function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('show'),2200);}
function applyTheme(){let th=S.settings.theme||'normal';if(th==='auto')th=(window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'normal';document.documentElement.dataset.theme=th;}
if(window.matchMedia)matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(S.settings.theme==='auto')applyTheme();});

function card(o,opt={}){
  const t=o.t,icon={overdue:'🔴',today:'📌',critical:'🔥'}[o.stage]||'';
  const meta=[];
  if(opt.showDate)meta.push(fmtShort(o.date));
  if(t.time)meta.push(t.time);
  if(!o.done&&o.stage!=='daily'){if(o.left<0)meta.push('atrasada há '+(-o.left)+' d');else if(o.left===0)meta.push('vence hoje');else if(['warming','urgent','critical'].includes(o.stage))meta.push('faltam '+o.left+' d');}
  if(o.stage==='daily')meta.push('diária');
  if(o.subTotal)meta.push('☑ '+o.subDone+'/'+o.subTotal);
  if(t.files&&t.files.length)meta.push('📎 '+t.files.length);
  if(t.desc&&t.desc.trim())meta.push('📝');
  if(t.comments&&t.comments.length)meta.push('💬 '+t.comments.length);
  if(t.rec&&t.rec.type!=='none'&&t.rec.type!=='daily')meta.push('↻');
  if(t.para&&t.para.length)meta.push((t.tipo==='call'?'📞 com ':'→ ')+t.para.map(id=>primeiro(nomeDe(id))).join(', '));
  const drag=(!t.rec||t.rec.type==='none')?' draggable="true"':'';
  return `<div class="card q${o.q} st-${o.stage}${o.done?' is-done':''}${opt.compact?' compact':''}" data-action="open-occ" data-key="${esc(o.key)}"${drag} title="${esc(t.title)}">
<button class="chk" data-action="toggle-done" data-key="${esc(o.key)}" aria-label="${o.done?'Reabrir':'Concluir'}">${o.done?'✓':''}</button>
<div class="cbody"><div class="ctitle">${icon?`<span class="ic">${icon}</span>`:''}${esc(t.title)}</div>${opt.compact||!meta.length?'':`<div class="cmeta">${esc(meta.join(' · '))}</div>`}</div>
<span class="tag" title="${esc(CATS[t.cat]||t.cat)}">${esc(t.cat)}</span></div>`;
}
const evChip=e=>`<div class="ev k-${e.kind}" data-action="open-ev" data-id="${esc(e.id)}" data-nat="${e.nat?1:0}" title="${esc(e.title)}">${e.kind==='holiday'?'◆ ':e.kind==='important'?'★ ':''}${esc(e.title)}</div>`;

/* ---------- render ---------- */
function render(){
  renderSyncPill();
  document.querySelectorAll('#modes button').forEach(b=>b.classList.toggle('on',b.dataset.mode===S.ui.mode));
  renderTabs();$('#alerts').innerHTML='';
  const home=S.ui.tab==='home';
  $('#toolbar').style.display=home?'none':'';
  const allBtn=document.querySelector('#modes [data-mode=all]');if(allBtn)allBtn.style.display=S.ui.tab==='matrix'?'':'none';
  renderNav();
  if(S.mode==='loading'){$('#counters').innerHTML='';$('#view').innerHTML='<div class="loading">Carregando seu planner…</div>';return;}
  if(home){$('#counters').innerHTML='';$('#view').innerHTML=avisosHTML()+renderHome();return;}
  const base=periodOccs();
  const nf=S.ui.cats.size+S.ui.quads.size+(S.ui.status!=='all'?1:0);
  const fb=$('#fbtn');fb.textContent='Filtros'+(nf?' ('+nf+')':'')+(S.ui.showFilters?' ▴':' ▾');fb.classList.toggle('on',S.ui.showFilters||nf>0);
  if(S.ui.showFilters)renderCounters(base);else $('#counters').innerHTML='';
  const list=filt(base);
  $('#view').innerHTML=avisosHTML()+(S.ui.tab==='summary'?renderSummary():S.ui.tab==='matrix'?renderMatrix(list):renderAgenda(list));
}
/* ---------- equipe: tarefas e calls entre as pessoas (Central LZ7) ---------- */
const nomeDe=id=>{const c=(S.equipe||[]).find(x=>x.id===id);return c?c.nome:'alguém';};
const primeiro=n=>(n||'').trim().split(/\s+/)[0];
function avisosHTML(){const a=S.avisos||[];if(!a.length)return'';return`<div class="eq-avisos"><div class="eq-avisos-h"><b>🔔 ${a.length===1?'1 novidade':a.length+' novidades'} da equipe</b><button class="ghost" data-action="eq-lidos">Ok, vi</button></div>${a.map(x=>`<div class="eq-aviso"${x.tarefa_id&&S.tasks.has(x.tarefa_id)?` data-action="eq-abrir" data-id="${esc(x.tarefa_id)}"`:''}>${esc(x.texto)}</div>`).join('')}</div>`;}
function eqStatusTxt(st){return!st||st==='pendente'?'⏳ pendente':st==='concluiu'?'✓ concluiu':'✕ '+st;}

function renderNav(){
  const m=S.ui.mode,c=S.ui.cursor;let label='Tarefas atuais';
  if(m==='day')label=fmt(c,{weekday:'short',day:'2-digit',month:'short',year:'numeric'});
  if(m==='week'){const a=weekStart(c),b=addDays(a,6);label=fmt(a,{day:'2-digit',month:'short'})+' – '+fmt(b,{day:'2-digit',month:'short',year:'numeric'});}
  if(m==='month')label=fmt(c,{month:'long',year:'numeric'});
  $('#nav').innerHTML=m==='all'?`<span class="label">${label}</span>`:`<button data-action="prev" aria-label="Anterior">‹</button><span class="label">${esc(label)}</span><button data-action="next" aria-label="Próximo">›</button><button data-action="today">Hoje</button>`;
}
function alertSets(){
  const cur=S.mode==='loading'?[]:currentOccs().filter(o=>!o.done);
  return{overdue:byUrg(cur.filter(o=>o.stage==='overdue')),today:byUrg(cur.filter(o=>o.stage==='today')),critical:byUrg(cur.filter(o=>o.stage==='critical'))};
}
function renderAlerts(){
  const a=alertSets(),ch=S.changes||[];
  if(!a.overdue.length&&!a.today.length&&!a.critical.length&&!ch.length){$('#alerts').innerHTML='';return;}
  const b=(k,n,txt)=>n?`<button class="abtn k-${k}${S.ui.alertOpen===k?' on':''}" data-action="alert" data-kind="${k}">${txt}</button>`:'';
  let body='';
  if(S.ui.alertOpen==='changes')body=`<div class="alist">${ch.map(o=>`<div class="chg">⚠️ <b>${esc(o.t.title)}</b> subiu para <b>${esc(S.settings.qNames[o.q-1])}</b> · ${fmtShort(o.date)}</div>`).join('')}<div><button class="ghost" data-action="dismiss-changes">Dispensar avisos</button></div></div>`;
  else if(S.ui.alertOpen&&a[S.ui.alertOpen])body=`<div class="alist">${a[S.ui.alertOpen].map(o=>card(o,{showDate:true})).join('')}</div>`;
  $('#alerts').innerHTML=`<div class="alerts"><div class="alert-row"><span class="lbl">Atenção</span>
${b('changes',ch.length,'⚠️ '+ch.length+(ch.length>1?' entraram em urgência':' entrou em urgência'))}
${b('overdue',a.overdue.length,'🔴 '+a.overdue.length+(a.overdue.length>1?' atrasadas':' atrasada'))}
${b('today',a.today.length,'📌 '+a.today.length+' vence'+(a.today.length>1?'m':'')+' hoje')}
${b('critical',a.critical.length,'🔥 '+a.critical.length+(a.critical.length>1?' críticas':' crítica'))}</div>${body}</div>`;
}
function renderTabs(){
  const a=alertSets(),n=a.overdue.length+a.today.length+a.critical.length;
  $('#tabs').innerHTML=`<button class="${S.ui.tab==='home'?'on':''}" data-action="tab" data-tab="home">Início</button><button class="${S.ui.tab==='agenda'?'on':''}" data-action="tab" data-tab="agenda">Agenda</button><button class="${S.ui.tab==='matrix'?'on':''}" data-action="tab" data-tab="matrix">Matriz${n?`<span class="badge">${n}</span>`:''}</button><button class="${S.ui.tab==='summary'?'on':''}" data-action="tab" data-tab="summary">Resumo</button>`;
}
function renderCounters(base){
  const c=S.settings.counters,parts=[];
  if(c.quad){const l=base.filter(o=>!o.done&&passCat(o));parts.push(`<div class="cgroup"><span class="gl">Quadrantes</span>${[1,2,3,4].map(q=>`<button class="chip qc${q}${S.ui.quads.has(q)?' on':''}" data-action="fq" data-q="${q}">${esc(S.settings.qNames[q-1])}<span class="n">${l.filter(o=>o.q===q).length}</span></button>`).join('')}</div>`);}
  if(c.cat){const l=base.filter(o=>!o.done&&passQ(o));parts.push(`<div class="cgroup"><span class="gl">Categorias</span>${Object.keys(CATS).map(k=>`<button class="chip${S.ui.cats.has(k)?' on':''}" data-action="fc" data-c="${k}" title="${esc(CATS[k])}">${esc(CATS[k])}<span class="n">${l.filter(o=>o.t.cat===k).length}</span></button>`).join('')}</div>`);}
  parts.push(`<div class="cgroup"><span class="gl">Status</span>${[['all','Todas'],['pending','Pendentes'],['done','Concluídas']].map(([k,l])=>`<button class="chip${S.ui.status===k?' on':''}" data-action="fs" data-s="${k}">${l}</button>`).join('')}</div>`);
  if(c.progress){const l=base.filter(o=>passCat(o)&&passQ(o)),d=l.filter(o=>o.done).length,p=l.length?Math.round(d/l.length*100):0;parts.push(`<div class="prog">${d} de ${l.length} concluídas<span class="bar"><i style="width:${p}%"></i></span>${p}%</div>`);}
  if(S.ui.cats.size||S.ui.quads.size||S.ui.status!=='all')parts.push(`<button class="ghost chip" data-action="clear-f">Limpar filtros</button>`);
  $('#counters').innerHTML=`<div class="counters">${parts.join('')}</div>`;
}
function renderAgenda(list){
  const m=S.ui.mode,today=todayS();
  if(m==='all'){
    if(!list.length&&!S.tasks.size)return`<div class="empty">Nenhuma tarefa ainda. Comece em <b>+ Tarefa</b>.</div>`;
    const late=byUrg(list.filter(o=>o.date<today)),fut=list.filter(o=>o.date>=today);
    const maxD=fut.reduce((a,o)=>o.date>a?o.date:a,addDays(today,30));
    const evs=evByDate(eventsIn(today,maxD<addDays(today,120)?maxD:addDays(today,120)));
    const g={};fut.forEach(o=>(g[o.date]=g[o.date]||[]).push(o));
    const dates=[...new Set([...Object.keys(g),...Object.keys(evs)])].sort();
    let h='';
    if(late.length)h+=`<div class="list-group"><h3 class="late">Atrasadas</h3><div class="list-items">${late.map(o=>card(o,{showDate:true})).join('')}</div></div>`;
    dates.forEach(d=>{const lbl=d===today?'Hoje':d===addDays(today,1)?'Amanhã':fmt(d,{weekday:'long',day:'2-digit',month:'long'});h+=`<div class="list-group"><h3>${esc(lbl)}</h3><div class="list-items">${(evs[d]||[]).map(evChip).join('')}${byTime(g[d]||[]).map(o=>card(o)).join('')}</div></div>`;});
    return h||`<div class="empty">Nada com esses filtros.</div>`;
  }
  const [a,b]=periodRange();
  if(m==='day'){
    const d=a,evs=eventsIn(d,d),untimed=byUrg(list.filter(o=>!o.t.time)),timed=list.filter(o=>o.t.time);
    let hs=[];for(let i=6;i<=22;i++)hs.push(i);timed.forEach(o=>{const hh=+o.t.time.slice(0,2);if(!hs.includes(hh))hs.push(hh);});hs.sort((x,y)=>x-y);
    const nowH=new Date().getHours();
    return`<div class="day" data-drop="${d}"><div class="allday"><span class="gl">${esc(fmt(d,{weekday:'long',day:'2-digit',month:'long'}))}${isBiz(d)?'':' · dia não útil'} — dia inteiro</span>${evs.map(evChip).join('')}${untimed.map(o=>card(o)).join('')||(evs.length?'':'<span class="hint">Nada sem horário.</span>')}</div>
${hs.map(hh=>`<div class="hrow${d===today&&hh===nowH?' now':''}"><span class="hl">${pad(hh)}:00</span><div class="hslot">${byTime(timed.filter(o=>+o.t.time.slice(0,2)===hh)).map(o=>card(o)).join('')}</div></div>`).join('')}</div>`;
  }
  if(m==='week'){
    const evs=evByDate(eventsIn(a,b));let h='<div class="wgrid">';
    for(let i=0;i<7;i++){const d=addDays(a,i),items=byTime(list.filter(o=>o.date===d));
      h+=`<div class="wcol${isBiz(d)?'':' nonbiz'}${d===today?' today':''}" data-drop="${d}"><button class="whead" data-action="goto-day" data-date="${d}">${esc(fmt(d,{weekday:'short'}))}<small>${fmt(d,{day:'2-digit',month:'short'})}</small></button><div class="wbody">${(evs[d]||[]).map(evChip).join('')}${items.map(o=>card(o)).join('')}</div></div>`;}
    return h+'</div>';
  }
  const ga=weekStart(a),gb=addDays(weekStart(b),6),cm=a.slice(0,7);
  const gl=filt(rangeOccs(ga,gb)),evs=evByDate(eventsIn(ga,gb));
  let h='<div class="mhead">'+['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(x=>`<div>${x}</div>`).join('')+'</div><div class="mgridc">';
  for(let d=ga;d<=gb;d=addDays(d,1)){
    const items=byTime(gl.filter(o=>o.date===d)),e=evs[d]||[];
    h+=`<div class="mcell${d.slice(0,7)!==cm?' out':''}${d===today?' today':''}${isBiz(d)?'':' nonbiz'}" data-drop="${d}"><button class="mnum" data-action="goto-day" data-date="${d}">${+d.slice(8)}</button>${e.map(evChip).join('')}${items.slice(0,3).map(o=>card(o,{compact:true})).join('')}${items.length>3?`<button class="more" data-action="day-pop" data-date="${d}">+${items.length-3} mais</button>`:''}</div>`;
  }
  return h+'</div>';
}
function renderMatrix(list){
  const n=S.settings.qNames,sub=['Urgente · Importante','Não urgente · Importante','Urgente · Não importante','Não urgente · Não importante'];
  return`<div class="mtx">${[1,2,3,4].map(q=>{
    if(S.ui.quads.size&&!S.ui.quads.has(q))return'';
    const l=list.filter(o=>o.q===q),pend=byUrg(l.filter(o=>!o.done)),dn=l.filter(o=>o.done);
    return`<section class="quad qd${q}"><header><b>${esc(n[q-1])}</b><span class="cnt">${pend.length}</span><small>${sub[q-1]}</small></header><div class="qlist">${pend.map(o=>card(o,{showDate:true})).join('')||'<span class="hint">Nada aqui.</span>'}${S.ui.matrixDone?dn.map(o=>card(o,{showDate:true})).join(''):''}</div>${dn.length?`<button class="qdone" data-action="toggle-mdone">✓ ${dn.length} concluída${dn.length>1?'s':''} · ${S.ui.matrixDone?'ocultar':'mostrar'}</button>`:''}</section>`;}).join('')}</div>`;
}

/* ---------- início ---------- */
function setTab(t){if(S.ui.tab!=='home')S.ui.modeByTab[S.ui.tab]=S.ui.mode;S.ui.tab=t;if(t!=='home')S.ui.mode=S.ui.modeByTab[t]||'week';if(t!=='matrix'&&S.ui.mode==='all')S.ui.mode='week';}
function renderHome(){
  const today=todayS(),h=new Date().getHours(),nm=(S.settings.name||'').trim();
  const greet=(h<5?'Boa noite':h<12?'Bom dia':h<18?'Boa tarde':'Boa noite')+(nm?', '+nm:'');
  const wa=weekStart(today),wk=rangeOccs(wa,addDays(wa,6)),wd=wk.filter(o=>o.done).length,wp=wk.length?Math.round(wd/wk.length*100):0;
  const cur=currentOccs().filter(o=>!o.done);
  const now=byUrg(cur.filter(o=>o.stage==='overdue'||o.stage==='critical'));
  const ch=S.changes||[];
  const todayL=byTime(rangeOccs(today,today)),todayE=eventsIn(today,today);
  const tl=todayL.map(o=>`<div class="tlrow"><span class="tlh">${o.t.time?esc(o.t.time):'dia'}</span><div class="tlc">${card(o)}</div></div>`).join('');
  const qc=[1,2,3,4].map(q=>`<button class="hq hq${q}" data-action="home-q" data-q="${q}"><b>${cur.filter(o=>o.q===q).length}</b><span>${esc(S.settings.qNames[q-1])}</span></button>`).join('');
  let next='';
  for(let i=1;i<=7;i++){const d=addDays(today,i),l=byTime(rangeOccs(d,d).filter(o=>!o.done)),e=eventsIn(d,d);
    const txt=l.length===0?(e.length?'':'livre'):l.length<=2?l.map(o=>o.t.title).join(' · '):l.length+' tarefas';
    const hot=l.some(o=>URG.includes(o.stage));
    next+=`<button class="nxrow" data-action="day-pop" data-date="${d}"><span class="nxd">${esc(fmt(d,{weekday:'short',day:'2-digit'}))}</span><span class="nxt${l.length?'':' muted'}">${hot?'🔥 ':''}${esc(txt)}${e.length?`<span class="nxe">${e.map(x=>(x.kind==='holiday'?'◆ ':x.kind==='important'?'★ ':'')+esc(x.title)).join(' · ')}</span>`:''}</span></button>`;}
  return`<div class="home">
<div class="hhead"><div><div class="hgreet">${esc(greet)}</div><div class="hsub">${esc(fmt(today,{weekday:'long',day:'numeric',month:'long'}))} · semana com ${wd} de ${wk.length} feitas</div></div>
<div class="prog"><span class="bar"><i style="width:${wp}%"></i></span>${wp}%</div></div>
<div class="hgrid"><div class="hcol">
<section class="hbox hnow${now.length?' hot':''}"><h3>${now.length?'Agora · '+now.length+(now.length>1?' precisam':' precisa')+' de você':'Agora'}</h3>
${ch.length?`<button class="hchg" data-action="home-changes">⚠️ ${ch.length} ${ch.length>1?'tarefas subiram':'tarefa subiu'} de quadrante desde a última visita ${S.ui.showChanges?'▴':'▾'}</button>${S.ui.showChanges?`<div class="alist">${ch.map(o=>`<div class="chg"><b>${esc(o.t.title)}</b> → ${esc(S.settings.qNames[o.q-1])} · ${fmtShort(o.date)}</div>`).join('')}<div><button class="ghost" data-action="dismiss-changes">Dispensar</button></div></div>`:''}`:''}
<div class="list-items">${now.map(o=>card(o,{showDate:true})).join('')||'<span class="hint">Nada atrasado nem crítico. 👌</span>'}</div></section>
<section class="hbox"><h3>Hoje${todayL.length?' · '+todayL.filter(o=>o.done).length+' de '+todayL.length:''}</h3>${todayE.map(evChip).join('')}${tl||'<span class="hint">Nada marcado para hoje.</span>'}</section>
</div><div class="hcol">
<section class="hbox"><h3>Sua matriz</h3><div class="hqgrid">${qc}</div></section>
<section class="hbox"><h3>Próximos 7 dias</h3><div class="nx">${next}</div></section>
</div></div></div>`;
}

/* ---------- resumo ---------- */
function summaryRange(){const r=periodRange();if(r)return r;const a=weekStart(todayS());return[a,addDays(a,6)];}
function summaryData(){
  const [a,b]=summaryRange(),today=todayS();
  const all=rangeOccs(a,b).filter(passCat);
  const done=all.filter(o=>o.done),pend=all.filter(o=>!o.done);
  const late=pend.filter(o=>o.date<today&&o.stage!=='daily'),missedDaily=pend.filter(o=>o.date<today&&o.stage==='daily'),upcoming=pend.filter(o=>o.date>=today);
  const pct=all.length?Math.round(done.length/all.length*100):0;
  return{a,b,all,done,pend,late,missedDaily,upcoming,pct};
}
function summaryLabel(a,b){return a===b?fmt(a,{day:'2-digit',month:'2-digit',year:'numeric'}):fmt(a,{day:'2-digit',month:'2-digit'})+' a '+fmt(b,{day:'2-digit',month:'2-digit',year:'numeric'});}
function motivation(D){
  const nm=(S.settings.name||'').trim(),past=D.b<todayS();
  if(!D.all.length)return{ic:'🌤️',title:'Período livre',text:'Nenhuma tarefa por aqui. Bom momento para planejar o que vem.'};
  if(D.late.length){const top=byUrg(D.late.slice()).slice(0,3).map(o=>o.t.title).join(', ');return{ic:'💪',title:(nm?nm+', você':'Você')+' tem '+D.late.length+(D.late.length>1?' tarefas atrasadas':' tarefa atrasada'),text:'Bora colocar em dia! Comece por: '+top+'.',tone:'late'};}
  if(D.pct===100)return{ic:'🎉',title:'Parabéns'+(nm?', '+nm:'')+'!',text:'Você concluiu tudo do período. Seu plano está 100% em dia.',tone:'win'};
  if(past)return{ic:'📋',title:'Período encerrado com '+D.pct+'%',text:D.pend.length+' item(ns) ficaram sem marcar.',tone:'late'};
  if(D.pct>=70)return{ic:'🚀',title:'Quase lá'+(nm?', '+nm:'')+'!',text:'Faltam só '+D.upcoming.length+' para bater a meta do período. Nada atrasado.',tone:'ok'};
  return{ic:'✅',title:'Você está no ritmo'+(nm?', '+nm:'')+'!',text:'Nada atrasado. Faltam '+D.upcoming.length+' tarefa(s) até o fim do período.',tone:'ok'};
}
function renderSummary(){
  const D=summaryData(),M=motivation(D),C=2*Math.PI*44,qn=S.settings.qNames;
  const bar=(d,t)=>`<span class="bar sbar"><i style="width:${t?Math.round(d/t*100):0}%"></i></span><span class="hint">${d}/${t}</span>`;
  const catRows=Object.keys(CATS).map(k=>{const l=D.all.filter(o=>o.t.cat===k);return l.length?`<div class="srow"><span>${esc(CATS[k])}</span>${bar(l.filter(o=>o.done).length,l.length)}</div>`:'';}).join('')||'<span class="hint">Sem tarefas.</span>';
  const qRows=[1,2,3,4].map(q=>{const l=D.all.filter(o=>o.q===q);return l.length?`<div class="srow"><span>${esc(qn[q-1])}</span>${bar(l.filter(o=>o.done).length,l.length)}</div>`:'';}).join('')||'<span class="hint">Sem tarefas.</span>';
  const g={};D.done.forEach(o=>(g[o.date]=g[o.date]||[]).push(o));
  const doneList=Object.keys(g).sort().map(d=>`<div class="sday"><b>${esc(fmt(d,{weekday:'short',day:'2-digit',month:'2-digit'}))}</b>${g[d].map(o=>`<div class="sdone">✓ ${esc(o.t.title)} <span class="tag">${esc(o.t.cat)}</span></div>`).join('')}</div>`).join('')||'<span class="hint">Nada concluído ainda neste período.</span>';
  const pendList=byUrg(D.pend.slice()).map(o=>card(o,{showDate:true})).join('')||'<span class="hint">Nada pendente. 👏</span>';
  return`<div class="sum">
<div class="shero tone-${M.tone||'ok'}"><svg viewBox="0 0 100 100" class="ring" role="img" aria-label="${D.pct}% concluído"><circle cx="50" cy="50" r="44" class="rbg"/><circle cx="50" cy="50" r="44" class="rfg" stroke-dasharray="${C}" stroke-dashoffset="${C*(1-D.pct/100)}"/><text x="50" y="56" text-anchor="middle">${D.pct}%</text></svg>
<div class="stext"><div class="speriod">${S.ui.mode==='all'?'Esta semana · ':''}${esc(summaryLabel(D.a,D.b))}</div><div class="stitle">${M.ic} ${esc(M.title)}</div><div>${esc(M.text)}</div>
<div class="sstats"><span><b>${D.done.length}</b> de ${D.all.length} concluídas</span><span class="${D.late.length?'lt':''}"><b>${D.late.length}</b> atrasadas</span><span><b>${D.upcoming.length}</b> por vir</span>${D.missedDaily.length?`<span><b>${D.missedDaily.length}</b> diárias não marcadas</span>`:''}</div>
<div class="smeta">🎯 Meta do período: 100% · ${D.pct===100?'batida!':'faltam '+D.pend.length}</div></div></div>
<div class="sgrid"><div class="scard"><h3>Por categoria</h3>${catRows}</div><div class="scard"><h3>Por quadrante</h3>${qRows}</div></div>
<div class="sgrid"><div class="scard"><h3>O que foi feito</h3>${doneList}</div><div class="scard"><h3>Pendentes</h3><div class="list-items">${pendList}</div></div></div>
<div class="sactions"><button data-action="copy-summary">Copiar resumo</button>${S.dl?'<button data-action="csv-summary">Baixar relatório (.csv)</button>':''}<span class="hint">Use as setas de período (Dia, Semana, Mês) para ver semanas anteriores.</span></div>
</div>`;
}
function summaryText(){
  const D=summaryData(),qn=S.settings.qNames,L=[];
  L.push('Resumo — '+summaryLabel(D.a,D.b));
  L.push('Concluídas: '+D.done.length+' de '+D.all.length+' ('+D.pct+'%) · Atrasadas: '+D.late.length+' · Por vir: '+D.upcoming.length);
  L.push('');L.push('✓ Concluídas:');byTime(D.done.slice()).sort((x,y)=>x.date.localeCompare(y.date)).forEach(o=>L.push('- '+fmtShort(o.date)+' · '+o.t.title+' ('+(CATS[o.t.cat]||o.t.cat)+')'));
  if(D.pend.length){L.push('');L.push('⏳ Pendentes:');byUrg(D.pend.slice()).forEach(o=>L.push('- '+fmtShort(o.date)+' · '+o.t.title+' ('+(CATS[o.t.cat]||o.t.cat)+') · '+qn[o.q-1]+(o.stage==='overdue'?' · ATRASADA':'')));}
  return L.join('\n');
}
function summaryCSV(){
  const D=summaryData(),qn=S.settings.qNames,q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
  const rows=[['Data','Hora','Tarefa','Categoria','Quadrante','Status','Subtarefas']];
  D.all.slice().sort((x,y)=>x.date.localeCompare(y.date)).forEach(o=>rows.push([fmt(o.date,{day:'2-digit',month:'2-digit',year:'numeric'}),o.t.time||'',o.t.title,CATS[o.t.cat]||o.t.cat,qn[o.q-1],o.done?'Concluída':o.stage==='overdue'?'Atrasada':'Pendente',o.subTotal?o.subDone+'/'+o.subTotal:'']));
  return '\ufeff'+rows.map(r=>r.map(q).join(';')).join('\r\n');
}
function openDayPop(d){
  const l=byTime(filt(rangeOccs(d,d))),e=eventsIn(d,d);
  $('#modal-root').innerHTML=`<div class="overlay" data-action="overlay"><div class="modal" role="dialog" aria-label="Dia"><div class="vhead"><h2 style="text-transform:capitalize">${esc(fmt(d,{weekday:'long',day:'2-digit',month:'long'}))}</h2><button data-action="goto-day" data-date="${d}">Abrir na agenda</button></div>
<div class="list-items">${e.map(evChip).join('')}${l.map(o=>card(o)).join('')||'<span class="hint">Nada neste dia.</span>'}</div>
<div class="mactions"><span class="hint">${l.filter(o=>o.done).length} de ${l.length} concluídas</span><div class="r"><button data-action="close">Fechar</button></div></div></div></div>`;
  S.dayPop=d;
}

/* ---------- ações ---------- */
function toggleDone(key){
  const i=key.lastIndexOf('|'),id=key.slice(0,i),d=key.slice(i+1),t=S.tasks.get(id);if(!t)return;
  const done={...(t.done||{})},was=!!done[d];
  if(was)delete done[d];else done[d]=true;
  const cut=addDays(todayS(),-400);for(const k in done)if(k<cut)delete done[k];
  const nt={...t,done,updatedAt:Date.now()};saveTask(nt);
  if(S.edit&&S.edit.t.id===id)S.edit.t.done=done;
  toast(was?'Reaberta: '+t.title:'Concluída: '+t.title);
}
function toggleSub(id,d,sid){
  const t=S.tasks.get(id);if(!t)return;
  const sd={...(t.subDone||{})},arr=new Set(sd[d]||[]);
  arr.has(sid)?arr.delete(sid):arr.add(sid);sd[d]=[...arr];
  const cut=addDays(todayS(),-400);for(const k in sd)if(k<cut||!sd[k].length)delete sd[k];
  saveTask({...t,subDone:sd,updatedAt:Date.now()});
  if(S.edit&&S.edit.t.id===id)S.edit.t.subDone=sd;
}
function shift(dir){
  const c=S.ui.cursor,m=S.ui.mode;
  if(m==='day')S.ui.cursor=addDays(c,dir);
  else if(m==='week')S.ui.cursor=addDays(c,7*dir);
  else if(m==='month'){const d=pd(c);S.ui.cursor=ds(new Date(d.getFullYear(),d.getMonth()+dir,1,12));}
  render();
}

/* ---------- modal tarefa ---------- */
function closeModal(){$('#modal-root').innerHTML='';S.edit=null;S.editEv=null;}
function openTask(id,occDate){
  const t=id?S.tasks.get(id):{id:null,title:'',cat:'FIS',rec:{type:'none'},start:S.ui.mode==='all'?todayS():S.ui.cursor,time:'',important:true,dailyQ:1,urgentDays:null,subs:[]};
  if(!t)return;
  S.edit={t:plain(t),occDate:occDate||null,del:false,err:'',mode:id?'view':'edit'};
  renderTaskModal();
}
function recFields(e){
  const r=e.rec,dateF=lbl=>`<div class="fld"><label for="f-date">${lbl}</label><input type="date" id="f-date" value="${esc(e.start||'')}"></div>`;
  if(r.type==='none')return dateF('Data');
  if(r.type==='daily')return`<div class="row2">${dateF('Começa em')}<div class="fld"><label for="f-dq">Quadrante fixo</label><select id="f-dq">${[1,2,3,4].map(q=>`<option value="${q}"${e.dailyQ===q?' selected':''}>${esc(S.settings.qNames[q-1])}</option>`).join('')}</select></div></div><p class="hint">Diárias acontecem nos dias úteis e ficam fixas no quadrante escolhido.</p>`;
  if(r.type==='weekly')return`<div class="row2"><div class="fld"><label for="f-wd">Dia da semana</label><select id="f-wd">${WD.map((w,i)=>`<option value="${i}"${r.weekday===i?' selected':''}>${w}</option>`).join('')}</select></div>${dateF('Começa em')}</div>`;
  if(r.type==='monthly')return`<div class="row2"><div class="fld"><label for="f-day">Dia do mês</label><input type="number" id="f-day" min="1" max="31" value="${r.day||''}"></div>${dateF('Começa em')}</div>`;
  if(r.type==='bday')return`<div class="row2"><div class="fld"><label for="f-n">Qual dia útil</label><input type="number" id="f-n" min="1" max="23" value="${r.n||''}"></div>${dateF('Começa em')}</div>`;
  if(r.type==='yearly')return dateF('Data (repete todo ano)');
  return'';
}
function renderTaskModal(){
  const ov0=document.querySelector('.overlay'),sc=ov0?ov0.scrollTop:0;
  if(S.edit.mode==='view')return renderTaskView(sc);
  const E=S.edit,e=E.t,isNew=!e.id,stored=e.id?S.tasks.get(e.id):null;
  let occ='';
  if(false&&stored&&E.occDate){
    const o=mkOcc(stored,E.occDate),sd=(stored.subDone&&stored.subDone[E.occDate])||[];
    const st={overdue:'🔴 Atrasada',today:'📌 Vence hoje',critical:'🔥 Crítica',urgent:'⚠️ Urgente',warming:'🌡️ Esquentando',calm:'😌 Tranquila',daily:'Diária',done:'✓ Concluída'}[o.stage];
    occ=`<div class="occbox"><div class="ot">${esc(fmt(E.occDate,{weekday:'long',day:'2-digit',month:'long'}))} · ${st} · ${esc(S.settings.qNames[o.q-1])}</div>
${(stored.subs||[]).map(s=>`<label><input type="checkbox" data-action="toggle-sub" data-sid="${esc(s.id)}"${sd.includes(s.id)?' checked':''}> ${esc(s.text)}</label>`).join('')}
<div style="margin-top:8px"><button class="${o.done?'':'primary'}" data-action="toggle-done" data-key="${esc(o.key)}">${o.done?'Reabrir esta ocorrência':'Concluir esta ocorrência'}</button></div></div>`;
  }
  const rt=e.rec.type,daily=rt==='daily';
  $('#modal-root').innerHTML=`<div class="overlay" data-action="overlay"><div class="modal" role="dialog" aria-label="Tarefa">
<h2>${isNew?'Nova tarefa':'Tarefa'}</h2>${occ}
<div class="fld"><label for="f-title">Título</label><input type="text" id="f-title" value="${esc(e.title)}" placeholder="Apuração PIS/COFINS"></div>
<div class="fld"><label for="f-desc">Descrição</label><textarea id="f-desc" rows="3" placeholder="Detalhes, passos, onde encontrar os arquivos…">${esc(e.desc||'')}</textarea></div>
<div class="row2"><div class="fld"><label for="f-cat">Categoria</label><select id="f-cat">${Object.entries(CATS).map(([k,v])=>`<option value="${k}"${e.cat===k?' selected':''}>${v}</option>`).join('')}</select></div>
<div class="fld"><label for="f-rec">Repetição</label><select id="f-rec">${[['none','Não repete'],['daily','Diária (dias úteis)'],['weekly','Semanal'],['monthly','Mensal (dia fixo)'],['bday','Mensal (Nº dia útil)'],['yearly','Anual']].map(([k,v])=>`<option value="${k}"${rt===k?' selected':''}>${v}</option>`).join('')}</select></div></div>
${recFields(e)}
${rt!=='none'&&rt!=='daily'&&rt!=='bday'?'<p class="hint">Se o prazo cair em fim de semana ou feriado, a tarefa antecipa para o dia útil anterior.</p>':''}
<div class="row2"><div class="fld"><label for="f-time">Hora (opcional)</label><input type="time" id="f-time" value="${esc(e.time||'')}"></div>
${daily?'':`<div class="fld"><label for="f-ud">Vira urgente quantos dias antes</label><input type="number" id="f-ud" min="0" max="60" value="${typeof e.urgentDays==='number'?e.urgentDays:''}" placeholder="Padrão (${S.settings.urgentDays} dias)"><span class="hint">0 = só no próprio dia</span></div>`}</div>
${eqForm(e)}
${daily?'':`<div class="fld"><span class="flabel">Importância</span><div class="radios"><label><input type="radio" name="f-imp" value="1"${e.important?' checked':''}> Importante</label><label><input type="radio" name="f-imp" value="0"${!e.important?' checked':''}> Não importante</label></div></div>`}
<div class="fld"><span class="flabel">Subtarefas${(e.subs||[]).length>1?' · arraste ⋮⋮ ou use as setas para reordenar':''}</span><div class="subs">${(e.subs||[]).map((s,i,arr)=>`<div class="subrow" draggable="true" data-sub-row="${esc(s.id)}"><span class="handle" aria-hidden="true">⋮⋮</span><input type="text" data-sub-input="${esc(s.id)}" value="${esc(s.text)}"><button class="ghost mv" data-action="mv-sub" data-sid="${esc(s.id)}" data-dir="-1" aria-label="Subir"${i===0?' disabled':''}>▲</button><button class="ghost mv" data-action="mv-sub" data-sid="${esc(s.id)}" data-dir="1" aria-label="Descer"${i===arr.length-1?' disabled':''}>▼</button><button class="ghost" data-action="del-sub" data-sid="${esc(s.id)}" aria-label="Remover">✕</button></div>`).join('')}
<div class="subrow"><input type="text" id="f-newsub" placeholder="Nova subtarefa"><button data-action="add-sub">Adicionar</button></div></div></div>
<div class="fld"><span class="flabel">Anexos</span><div class="files">${(e.files||[]).map(f=>`<div class="filerow"><a href="${esc(f.url)}" target="_blank" rel="noopener">📎 ${esc(f.name)}${f.cuOnly?' (no ClickUp)':f.cu?' ✓ClickUp':''}</a><span class="hint">${fmtSize(f.size)}</span><button class="ghost" data-action="del-file" data-fid="${esc(f.id)}" aria-label="Remover anexo">✕</button></div>`).join('')}
${S.assets?`<label class="upl"><input type="file" id="f-file" multiple > ${E.uploading?'Enviando…':'+ Anexar arquivo'}</label><span class="hint">${e.clickupId&&syncOn()?'Vai também para a tarefa no ClickUp (Excel e Word inclusive).':'Aceita qualquer arquivo (PDF, imagens, Excel, Word…) até 20 MB.'}</span>`:'<span class="hint">Anexos indisponíveis nesta visualização.</span>'}</div></div>
${e.clickupUrl?`<p class="hint"><a href="${esc(e.clickupUrl)}" target="_blank" rel="noopener">Abrir no ClickUp ↗</a></p>`:''}
${E.err?`<p class="err">${esc(E.err)}</p>`:''}
<div class="mactions">${isNew?'<span></span>':`<button class="danger${E.del?' armed':''}" data-action="del-task">${E.del?(e.clickupId&&syncOn()&&!noPush(e)?'Confirmar: excluir aqui e no ClickUp':'Confirmar exclusão'):'Excluir'}</button>`}<div class="r"><button data-action="${isNew?'close':'cancel-edit'}">Cancelar</button><button class="primary" data-action="save-task">Salvar</button></div></div>
</div></div>`;
  const rec=$('#f-rec');rec.addEventListener('change',()=>{readForm();const e2=S.edit.t,st=e2.start||todayS();e2.rec={type:rec.value};if(rec.value==='weekly')e2.rec.weekday=dow(st);if(rec.value==='monthly')e2.rec.day=+st.slice(8);if(rec.value==='bday')e2.rec.n=5;renderTaskModal();});
  const ns=$('#f-newsub');ns.addEventListener('keydown',ev=>{if(ev.key==='Enter'){ev.preventDefault();addSub();}});
  const ff=$('#f-file');if(ff)ff.addEventListener('change',()=>uploadFiles(ff.files));
  const eqt=$('#f-eqtipo');if(eqt)eqt.addEventListener('change',()=>{readForm();renderTaskModal();});
  const ov=document.querySelector('.overlay');if(ov)ov.scrollTop=sc;
  if(isNew&&!sc)setTimeout(()=>{const f=$('#f-title');f&&f.focus({preventScroll:true});},30);
}
const STL={overdue:'🔴 Atrasada',today:'📌 Vence hoje',critical:'🔥 Crítica',urgent:'⚠️ Urgente',warming:'🌡️ Esquentando',calm:'😌 Tranquila',daily:'Diária',done:'✓ Concluída'};
function recText(t){const r=t.rec||{type:'none'};return r.type==='none'?'Não repete':r.type==='daily'?'Diária (dias úteis)':r.type==='weekly'?'Toda '+WD[r.weekday].toLowerCase():r.type==='monthly'?'Todo dia '+r.day:r.type==='bday'?'Todo '+r.n+'º dia útil':'Todo ano em '+fmtShort(t.start);}
function renderTaskView(sc){
  const E=S.edit,st=S.tasks.get(E.t.id);if(!st){closeModal();return;}
  E.t=plain(st);const t=E.t,d=E.occDate||t.start,o=mkOcc(t,d),sd=(t.subDone&&t.subDone[d])||[];
  const subs=t.subs||[],files=t.files||[],cm=(t.comments||[]).slice().sort((a,b)=>a.at-b.at);
  const when=fmt(d,{weekday:'long',day:'2-digit',month:'long'})+(t.time?' · '+t.time:'');
  $('#modal-root').innerHTML=`<div class="overlay" data-action="overlay"><div class="modal" role="dialog" aria-label="Tarefa">
<div class="vhead"><h2>${esc(t.title)}</h2><button data-action="edit-task">✎ Editar</button></div>
<div class="vchips"><span class="vchip q${o.q}">${esc(S.settings.qNames[o.q-1])}</span><span class="vchip">${STL[o.stage]}</span><span class="vchip">${esc(CATS[t.cat]||t.cat)}</span><span class="vchip">${esc(recText(t))}</span></div>
<div class="occbox"><div class="ot">${esc(when)}</div>
${subs.map(s=>`<label><input type="checkbox" data-action="toggle-sub" data-sid="${esc(s.id)}"${sd.includes(s.id)?' checked':''}> <span${sd.includes(s.id)?' class="strike"':''}>${esc(s.text)}</span></label>`).join('')}
<div class="subrow" style="margin-top:6px"><input type="text" id="v-newsub" placeholder="Adicionar subtarefa"><button data-action="add-sub-v">Adicionar</button></div>
<div style="margin-top:10px"><button class="${o.done?'':'primary'}" data-action="toggle-done" data-key="${esc(o.key)}">${o.done?'Reabrir':'✓ Concluir'}${t.rec&&t.rec.type!=='none'?' esta ocorrência':''}</button></div></div>
${eqView(t)}
${t.desc&&t.desc.trim()?`<div class="sec">Descrição</div><div class="vdesc">${esc(t.desc)}</div>`:''}
${files.length?`<div class="sec">Anexos</div><div class="files">${files.map(f=>`<div class="filerow"><a href="${esc(f.url)}" target="_blank" rel="noopener">📎 ${esc(f.name)}</a><span class="hint">${fmtSize(f.size)}</span></div>`).join('')}</div>`:''}
<div class="sec">Comentários${cm.length?' ('+cm.length+')':''}</div>
<div class="comments">${cm.map(c=>`<div class="cmt"><div class="cmt-h"><span>${c.cu?'✓ClickUp · ':''}${esc(new Date(c.at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}))}${c.occ&&t.rec&&t.rec.type!=='none'?' · ocorrência de '+fmtShort(c.occ):''}</span><button class="ghost" data-action="del-comment" data-cid="${esc(c.id)}" aria-label="Apagar comentário">✕</button></div><div class="cmt-b">${esc(c.text)}</div></div>`).join('')}
<textarea id="v-comment" rows="2" placeholder="Escreva um comentário"></textarea><div><button data-action="add-comment">Comentar</button></div></div>
${t.clickupUrl?`<p class="hint"><a href="${esc(t.clickupUrl)}" target="_blank" rel="noopener">Abrir no ClickUp ↗</a>${noPush(t)?' · não sincroniza (não atribuída a você)':syncOn()?' · sincronizada':''}</p>`:syncOn()?(t.cuCreating&&!t.cuErro?`<p class="hint">Criando no ClickUp… o vínculo aparece na próxima sincronização.</p>`:`<p class="hint">${t.cuErro?'<span class="err">O ClickUp recusou: '+esc(t.cuErro)+'</span> · ':''}Só no planner. <button class="ghost" data-action="cu-send">Enviar ao ClickUp</button></p>`):''}
<div class="mactions"><span></span><div class="r"><button data-action="close">Fechar</button></div></div>
</div></div>`;
  const ns=$('#v-newsub');ns.addEventListener('keydown',ev=>{if(ev.key==='Enter'){ev.preventDefault();addSubView();}});
  const ov=document.querySelector('.overlay');if(ov)ov.scrollTop=sc||0;
}
function eqView(t){
  if(t.origem){const E=S.edit;return`<div class="eq-box"><div>${t.tipo==='call'?'📞 <b>'+esc(t.de&&t.de.nome)+'</b> convidou você para esta call.':'<b>'+esc(t.de&&t.de.nome)+'</b> te passou esta tarefa.'}</div>${E.recusando?`<textarea id="v-motivo" rows="2" placeholder="Motivo (vai para ${esc(primeiro(t.de&&t.de.nome))})"></textarea><div class="eq-acoes"><button class="danger" data-action="eq-recusar-ok">Confirmar recusa</button><button class="ghost" data-action="eq-recusar-nao">Voltar</button></div>${E.erroRecusa?`<p class="err">${esc(E.erroRecusa)}</p>`:''}`:`<div class="eq-acoes"><button class="ghost" data-action="eq-recusar">Recusar…</button></div>`}</div>`;}
  if(!t.para||!t.para.length)return'';
  const st=t.paraStatus||{},rep=t.rec&&t.rec.type!=='none';
  return`<div class="eq-box"><div class="sec" style="margin-top:0">${t.tipo==='call'?'📞 Call com':'Passada para'}</div>${t.para.map(id=>`<div class="eq-pessoa"><span>${esc(nomeDe(id))}</span>${t.tipo==='call'?(String(st[id]||'').startsWith('recusou')?`<span class="eq-st recusou">✕ ${esc(st[id])}</span>`:''):rep?'':`<span class="eq-st ${String(st[id]||'pendente').split(':')[0]}">${esc(eqStatusTxt(st[id]))}</span>`}</div>`).join('')}</div>`;
}
async function eqRecusar(){const m=($('#v-motivo')||{}).value||'';if(!m.trim()){S.edit.erroRecusa='Escreva o motivo.';renderTaskModal();return;}
  const id=S.edit.t.id;try{const r=await api('/equipe',{method:'POST',body:{acao:'recusar',id,motivo:m}});if(r&&r.erro){S.edit.erroRecusa=r.erro;renderTaskModal();return;}}catch(e){S.edit.erroRecusa='Não foi possível recusar.';renderTaskModal();return;}
  S.tasks.delete(id);closeModal();render();toast('Recusada. Avisamos quem mandou.');}
function addSubView(){const inp=$('#v-newsub'),txt=inp?inp.value.trim():'';if(!txt)return;const st=S.tasks.get(S.edit.t.id);if(!st)return;saveTask({...st,subs:[...(st.subs||[]),{id:uid('s'),text:txt}],updatedAt:Date.now()});renderTaskModal();const n=$('#v-newsub');n&&n.focus({preventScroll:true});}
function addComment(){const inp=$('#v-comment'),txt=inp?inp.value.trim():'';if(!txt)return;const st=S.tasks.get(S.edit.t.id);if(!st)return;saveTask({...st,comments:[...(st.comments||[]),{id:uid('c'),text:txt,at:Date.now(),occ:S.edit.occDate||null}],updatedAt:Date.now()});renderTaskModal();}
function delComment(cid){const st=S.tasks.get(S.edit.t.id);if(!st)return;saveTask({...st,comments:(st.comments||[]).filter(c=>c.id!==cid),updatedAt:Date.now()});renderTaskModal();}
const fmtSize=b=>!b?'':b<1048576?Math.max(1,Math.round(b/1024))+' KB':(b/1048576).toFixed(1)+' MB';
async function uploadFiles(list){
  if(!S.assets||!list||!list.length)return;
  readForm();S.edit.uploading=true;renderTaskModal();
  const added=[],stT=S.edit.t.id&&S.tasks.get(S.edit.t.id);
  for(const f of list){
    if(f.size>20*1048576){toast(f.name+': maior que 20 MB');continue;}
    try{
      const prep=await api('/anexo',{method:'POST',body:{name:f.name,size:f.size,type:f.type}});
      const r=await fetch(prep.signedUrl,{method:'PUT',headers:{'Content-Type':f.type||'application/octet-stream','x-upsert':'false'},body:f});
      if(!r.ok)throw new Error('HTTP '+r.status);
      added.push({id:prep.id,path:prep.path,url:API+'/anexo/abrir?p='+encodeURIComponent(prep.path),name:f.name,size:f.size,type:f.type||'',cu:false,cuPending:!!(stT&&stT.clickupId&&syncOn()&&!noPush(stT))});
    }catch(err){console.warn(err);toast(f.name+': não foi possível enviar');}
  }
  if(!S.edit)return;
  S.edit.uploading=false;S.edit.t.files=[...(S.edit.t.files||[]),...added];
  const st=S.edit.t.id&&S.tasks.get(S.edit.t.id);
  if(st&&added.length)saveTask({...st,files:[...(st.files||[]),...added],updatedAt:Date.now()});
  renderTaskModal();if(added.length)toast(added.length+' anexo(s) adicionado(s)');
}
function removeFile(fid){
  readForm();const e=S.edit.t,f=(e.files||[]).find(x=>x.id===fid);e.files=(e.files||[]).filter(x=>x.id!==fid);
  const st=e.id&&S.tasks.get(e.id);if(st)saveTask({...st,files:(st.files||[]).filter(x=>x.id!==fid),updatedAt:Date.now()});
  if(f&&f.path)api('/anexo?path='+encodeURIComponent(f.path),{method:'DELETE'}).catch(()=>{});
  renderTaskModal();
}
function moveSub(sid,to){
  readForm();const a=S.edit.t.subs||[],i=a.findIndex(s=>s.id===sid);if(i<0)return;
  const [it]=a.splice(i,1);a.splice(Math.max(0,Math.min(a.length,to)),0,it);
  renderTaskModal();
}
function eqForm(e){
  if(e.origem)return`<p class="hint eq-hint">Recebida de <b>${esc((e.de&&e.de.nome)||'alguém')}</b>. Se essa pessoa mudar título, data ou descrição, a sua cópia acompanha.</p>`;
  if(!(S.equipe||[]).length)return'';
  const tp=e.para&&e.para.length||e.eqAberto?(e.tipo==='call'?'call':'tarefa'):'eu',sel=new Set(e.para||[]);
  return`<div class="fld eq-fld"><label for="f-eqtipo">Para quem</label><select id="f-eqtipo"><option value="eu"${tp==='eu'?' selected':''}>Só para mim</option><option value="tarefa"${tp==='tarefa'?' selected':''}>Passar tarefa para alguém da equipe</option><option value="call"${tp==='call'?' selected':''}>Call ou conversa com a equipe</option></select>${tp==='eu'?'':`<div class="eq-pessoas">${S.equipe.map(c=>`<label><input type="checkbox" name="f-eqp" value="${esc(c.id)}"${sel.has(c.id)?' checked':''}> ${esc(c.nome)}</label>`).join('')}</div><span class="hint">${tp==='call'?'Entra no planner de todos os escolhidos (e no seu), com a hora.':'Entra no planner de quem você escolher; aqui fica para você acompanhar quem já concluiu.'}</span>`}</div>`;
}
function readForm(){
  const e=S.edit.t,v=id=>{const el=document.getElementById(id);return el?el.value:undefined;};
  if(v('f-eqtipo')!==undefined){const tp=v('f-eqtipo');if(tp==='eu'){e.para=[];delete e.tipo;e.eqAberto=false;}else{e.tipo=tp;e.eqAberto=true;const marc=[...document.querySelectorAll('input[name=f-eqp]')];if(marc.length)e.para=marc.filter(x=>x.checked).map(x=>x.value);}}
  if(v('f-title')!==undefined)e.title=v('f-title').trim();
  if(v('f-desc')!==undefined)e.desc=v('f-desc');
  if(v('f-cat')!==undefined)e.cat=v('f-cat');
  if(v('f-date')!==undefined)e.start=v('f-date');
  if(v('f-wd')!==undefined)e.rec.weekday=+v('f-wd');
  if(v('f-day')!==undefined)e.rec.day=parseInt(v('f-day'))||0;
  if(v('f-n')!==undefined)e.rec.n=parseInt(v('f-n'))||0;
  if(v('f-dq')!==undefined)e.dailyQ=+v('f-dq');
  if(v('f-time')!==undefined)e.time=v('f-time');
  const imp=document.querySelector('input[name=f-imp]:checked');if(imp)e.important=imp.value==='1';
  if(v('f-ud')!==undefined){const raw=v('f-ud').trim(),n=parseInt(raw);e.urgentDays=(raw!==''&&n>=0)?n:null;}
  document.querySelectorAll('[data-sub-input]').forEach(inp=>{const s=(e.subs||[]).find(x=>x.id===inp.dataset.subInput);if(s)s.text=inp.value;});
}
function addSub(){readForm();const inp=$('#f-newsub'),txt=inp?inp.value.trim():'';if(!txt)return;S.edit.t.subs=[...(S.edit.t.subs||[]),{id:uid('s'),text:txt}];renderTaskModal();const n=$('#f-newsub');n&&n.focus({preventScroll:true});}
function saveTaskForm(){
  readForm();const e=S.edit.t,r=e.rec;let err='';
  if(!e.title)err='Dê um título para a tarefa.';
  else if(!e.start)err='A data é obrigatória.';
  else if(r.type==='monthly'&&!(r.day>=1&&r.day<=31))err='Informe um dia do mês entre 1 e 31.';
  else if(r.type==='bday'&&!(r.n>=1&&r.n<=23))err='Informe qual dia útil (1 a 23).';
  else if(e.eqAberto&&!(e.para&&e.para.length))err='Escolha pelo menos uma pessoa da equipe.';
  else if(e.eqAberto&&e.tipo==='call'&&!e.time)err='Informe a hora da call.';
  if(err){S.edit.err=err;renderTaskModal();return;}
  const stored=e.id?S.tasks.get(e.id):null;
  delete e.eqAberto;
  const t={...e,subs:(e.subs||[]).filter(s=>s.text.trim()),done:stored?stored.done||{}:{},subDone:stored?stored.subDone||{}:{},comments:stored?stored.comments||[]:[],updatedAt:Date.now()};
  if(!t.id){t.id=uid('t');t.createdAt=Date.now();}
  saveTask(t);toast('Tarefa salva');
  if(stored&&S.edit.occDate){S.edit={t:plain(t),occDate:S.edit.occDate,del:false,err:'',mode:'view'};renderTaskModal();}else closeModal();
}

/* ---------- modal evento ---------- */
function openEvent(id,date){
  const e=id?S.events.get(id):{id:null,title:'',date:date||(S.ui.mode==='all'?todayS():S.ui.cursor),kind:'important',yearly:false};
  if(!e)return;S.editEv={e:plain(e),del:false,err:''};renderEventModal();
}
function renderEventModal(){
  const E=S.editEv,e=E.e;
  $('#modal-root').innerHTML=`<div class="overlay" data-action="overlay"><div class="modal" role="dialog" aria-label="Evento">
<h2>${e.id?'Evento':'Novo evento'}</h2>
<div class="fld"><label for="e-title">Título</label><input type="text" id="e-title" value="${esc(e.title)}" placeholder="Feriado municipal"></div>
<div class="row2"><div class="fld"><label for="e-date">Data</label><input type="date" id="e-date" value="${esc(e.date)}"></div>
<div class="fld"><label for="e-kind">Tipo</label><select id="e-kind"><option value="important"${e.kind==='important'?' selected':''}>Data importante</option><option value="holiday"${e.kind==='holiday'?' selected':''}>Feriado / ponte (dia não útil)</option></select></div></div>
<div class="fld"><div class="radios"><label><input type="checkbox" id="e-yearly"${e.yearly?' checked':''}> Repete todo ano</label></div></div>
<p class="hint">Feriados e pontes contam como dia não útil: prazos que caírem neles antecipam.</p>
${E.err?`<p class="err">${esc(E.err)}</p>`:''}
<div class="mactions">${e.id?`<button class="danger${E.del?' armed':''}" data-action="del-ev">${E.del?'Confirmar exclusão':'Excluir'}</button>`:'<span></span>'}<div class="r"><button data-action="close">Cancelar</button><button class="primary" data-action="save-ev">Salvar</button></div></div>
</div></div>`;
}
function saveEventForm(){
  const e=S.editEv.e;e.title=$('#e-title').value.trim();e.date=$('#e-date').value;e.kind=$('#e-kind').value;e.yearly=$('#e-yearly').checked;
  if(!e.title||!e.date){S.editEv.err='Título e data são obrigatórios.';renderEventModal();return;}
  if(!e.id)e.id=uid('e');saveEvent({...e});closeModal();toast('Evento salvo');
}

/* ---------- modal configurações ---------- */
function openSettings(){
  const s=S.settings;
  $('#modal-root').innerHTML=`<div class="overlay" data-action="overlay"><div class="modal" role="dialog" aria-label="Configurações">
<h2>Configurações</h2>
<div class="fld"><span class="flabel">Tema</span><div class="radios">${[['normal','Normal'],['pastel','Pastel'],['dark','Escuro'],['auto','Automático (segue o sistema)']].map(([k,l])=>`<label><input type="radio" name="s-theme" value="${k}"${s.theme===k?' checked':''}> ${l}</label>`).join('')}</div></div>
<div class="fld"><label for="s-name">Seu nome (para as mensagens do Resumo)</label><input type="text" id="s-name" value="${esc(s.name||'')}" placeholder="Como quer ser chamado"></div>
<div class="fld"><label for="s-ud">Padrão: vira urgente quantos dias antes do prazo</label><input type="number" id="s-ud" min="1" max="60" value="${s.urgentDays}"><span class="hint">Esquenta no dobro desse prazo; crítica nos últimos 2 dias. Tarefas com aviso próprio não mudam.</span></div>
<div class="sec">Nomes dos quadrantes</div>
<div class="row2">${s.qNames.map((n,i)=>`<div class="fld"><label for="s-q${i}">Q${i+1} · ${['Urgente + importante','Importante','Urgente','Nenhum dos dois'][i]}</label><input type="text" id="s-q${i}" value="${esc(n)}"></div>`).join('')}</div>
<div class="sec">Contadores</div>
<div class="radios"><label><input type="checkbox" id="s-cq"${s.counters.quad?' checked':''}> Por quadrante</label><label><input type="checkbox" id="s-cc"${s.counters.cat?' checked':''}> Por categoria</label><label><input type="checkbox" id="s-cp"${s.counters.progress?' checked':''}> Progresso do período</label></div>
<div class="sec">Calendário</div>
<div class="radios" style="flex-direction:column;gap:6px"><label><input type="checkbox" id="s-fac"${s.facultativos?' checked':''}> Carnaval e Corpus Christi contam como dia não útil</label><label><input type="checkbox" id="s-5du"${s.quintoDiaUtil?' checked':''}> Marcar o 5º dia útil de cada mês</label><label><input type="checkbox" id="s-sat"${s.satCount!==false?' checked':''}> Contar o sábado no Nº dia útil (regra da CLT); se cair no sábado, antecipa para sexta</label></div>
${S.cuConfigured?`<div class="sec">ClickUp</div>
<div class="radios" style="flex-direction:column;gap:6px"><label><input type="checkbox" id="s-cu"${S.sync&&S.sync.enabled?' checked':''}> Sincronizar com o ClickUp (tarefas abertas atribuídas a você, nos dois sentidos)</label></div>
<div class="fld" style="margin-top:8px"><label for="s-cuuser">Seu usuário no ClickUp</label><select id="s-cuuser"><option value="">Carregando…</option></select><span class="hint" id="s-cuhint">A sincronização roda no servidor a cada 15 minutos e logo depois de cada edição.</span></div>`:''}
<div class="sec">Dados</div>
<label class="upl small"><input type="file" id="s-import" accept="application/json,.json"> Importar tarefas (JSON)</label>
<span class="hint" style="display:block;margin-top:6px">Junta as tarefas do arquivo às que já estão aqui, sem apagar nada. Importe antes de ligar o ClickUp.</span>
<div class="mactions"><span class="hint">Salvo online</span><div class="r"><button data-action="close">Cancelar</button><button class="primary" data-action="save-settings">Salvar</button></div></div>
</div></div>`;
}
async function fillCuUsers(){
  const sel=$('#s-cuuser');if(!sel)return;
  try{const j=await api('/clickup');const cur=(S.sync&&S.sync.clickupUserId)||j.sugerido||'';
    sel.innerHTML='<option value="">Escolha…</option>'+(j.membros||[]).map(m=>`<option value="${m.id}"${String(m.id)===String(cur)?' selected':''}>${esc(m.nome)}${m.email?' · '+esc(m.email):''}</option>`).join('');
    if(j.erro){const h=$('#s-cuhint');if(h){h.textContent=j.erro;h.className='err';}}
  }catch(e){sel.innerHTML='<option value="">Não consegui listar os membros</option>';}
}
async function importJSON(file){
  if(!file)return;
  let data;try{data=JSON.parse(await file.text());}catch(e){toast('O arquivo não é um JSON válido');return;}
  try{const r=await api('/importar',{method:'POST',body:data});toast(r.tarefas+' tarefa(s) e '+r.eventos+' evento(s) importados');closeModal();await loadState();detectChanges();render();}
  catch(e){toast('Não foi possível importar: '+((e&&e.message)||'erro'));}
}
function saveSettingsForm(){
  const cuBox=$('#s-cu'),cuSel=$('#s-cuuser');
  if(cuBox){const en=cuBox.checked,uidv=cuSel&&cuSel.value?+cuSel.value:null;
    if(en&&!uidv){toast('Escolha seu usuário no ClickUp');return;}
    if(en!==!!(S.sync&&S.sync.enabled)||(uidv&&uidv!==(S.sync&&S.sync.clickupUserId))){
      enqueue('config/sync',()=>api('/clickup',{method:'POST',body:{enabled:en,clickupUserId:uidv}}).then(j=>{S.sync=j.sync||S.sync;render();if(en)runSync('manual');}));
    }}
  const th=document.querySelector('input[name=s-theme]:checked');
  const ud=parseInt($('#s-ud').value);
  const q=[0,1,2,3].map(i=>$('#s-q'+i).value.trim()||DEF.qNames[i]);
  saveSettings({...S.settings,theme:th?th.value:'normal',urgentDays:ud>0?ud:7,qNames:q,counters:{quad:$('#s-cq').checked,cat:$('#s-cc').checked,progress:$('#s-cp').checked},facultativos:$('#s-fac').checked,quintoDiaUtil:$('#s-5du').checked,satCount:$('#s-sat').checked,name:$('#s-name').value.trim()});
  closeModal();toast('Configurações salvas');
}

/* ---------- eventos de UI ---------- */
document.addEventListener('click',ev=>{
  const el=ev.target.closest('[data-action]');if(!el)return;
  const a=el.dataset.action;
  if(a==='overlay'){if(ev.target===el){S.dayPop=null;closeModal();}return;}
  if(el.tagName!=='INPUT')ev.preventDefault();
  ev.stopPropagation();
  switch(a){
    case 'mode':S.ui.mode=el.dataset.mode;S.ui.modeByTab[S.ui.tab]=S.ui.mode;if(el.dataset.mode!=='all'&&!S.ui.cursor)S.ui.cursor=todayS();render();break;
    case 'prev':shift(-1);break;
    case 'next':shift(1);break;
    case 'today':S.ui.cursor=todayS();render();break;
    case 'tab':setTab(el.dataset.tab);render();break;
    case 'toggle-filters':S.ui.showFilters=!S.ui.showFilters;render();break;
    case 'home-q':setTab('matrix');S.ui.mode='all';S.ui.modeByTab.matrix='all';S.ui.quads=new Set([+el.dataset.q]);render();break;
    case 'home-changes':S.ui.showChanges=!S.ui.showChanges;render();break;
    case 'goto-day':S.ui.cursor=el.dataset.date;setTab('agenda');S.ui.mode='day';S.ui.modeByTab.agenda='day';S.dayPop=null;closeModal();render();break;
    case 'fq':{const q=+el.dataset.q;S.ui.quads.has(q)?S.ui.quads.delete(q):S.ui.quads.add(q);render();break;}
    case 'fc':{const c=el.dataset.c;S.ui.cats.has(c)?S.ui.cats.delete(c):S.ui.cats.add(c);render();break;}
    case 'fs':S.ui.status=el.dataset.s;render();break;
    case 'clear-f':S.ui.cats.clear();S.ui.quads.clear();S.ui.status='all';render();break;
    case 'alert':S.ui.alertOpen=S.ui.alertOpen===el.dataset.kind?null:el.dataset.kind;renderAlerts();break;
    case 'dismiss-changes':S.changes=[];S.ui.showChanges=false;S.ui.alertOpen=null;renderAlerts();break;
    case 'toggle-mdone':S.ui.matrixDone=!S.ui.matrixDone;render();break;
    case 'toggle-done':{if(S.edit&&S.edit.mode==='edit'&&$('#modal-root').innerHTML)readForm();toggleDone(el.dataset.key);if(S.edit&&$('#modal-root').innerHTML)renderTaskModal();else if(S.dayPop&&$('#modal-root').innerHTML)openDayPop(S.dayPop);break;}
    case 'open-occ':{const k=el.dataset.key,i=k.lastIndexOf('|');openTask(k.slice(0,i),k.slice(i+1));break;}
    case 'toggle-sub':{if(S.edit.mode==='edit')readForm();toggleSub(S.edit.t.id,S.edit.occDate,el.dataset.sid);renderTaskModal();break;}
    case 'new-task':openTask(null);break;
    case 'new-event':openEvent(null);break;
    case 'settings':openSettings();fillCuUsers();{const fi=$('#s-import');if(fi)fi.addEventListener('change',()=>importJSON(fi.files[0]));}break;
    case 'sync-now':if(syncOn()){runSync('manual');}else toast('Sincronização desligada — ligue em ⚙ Configurações → ClickUp');break;
    case 'cu-send':{const st=S.tasks.get(S.edit.t.id);if(st){saveTask({...st,cuForce:true,updatedAt:Date.now()});toast('Enviando ao ClickUp…');runSync('send');}break;}
    case 'close':if(S.edit&&S.dayPop){S.edit=null;openDayPop(S.dayPop);}else{S.dayPop=null;closeModal();}break;
    case 'day-pop':openDayPop(el.dataset.date);break;
    case 'copy-summary':{const txt=summaryText();try{navigator.clipboard.writeText(txt).then(()=>toast('Resumo copiado'),()=>toast('Não foi possível copiar aqui'));}catch(x){toast('Não foi possível copiar aqui');}break;}
    case 'csv-summary':{const [a,b]=summaryRange();S.dl.save({filename:'resumo-'+a+'_a_'+b+'.csv',data:summaryCSV()}).then(()=>toast('Relatório salvo'),e=>{if(e&&e.code!=='declined')toast('Não foi possível baixar aqui');});break;}
    case 'edit-task':S.edit.mode='edit';S.edit.del=false;S.edit.err='';renderTaskModal();break;
    case 'cancel-edit':if(S.edit.occDate){S.edit.mode='view';renderTaskModal();}else closeModal();break;
    case 'add-sub-v':addSubView();break;
    case 'add-comment':addComment();break;
    case 'del-comment':delComment(el.dataset.cid);break;
    case 'save-task':saveTaskForm();break;
    case 'eq-lidos':{const ids=(S.avisos||[]).map(x=>x.id);S.avisos=[];render();api('/equipe',{method:'POST',body:{acao:'lidos',ids}}).catch(()=>{});break;}
    case 'eq-abrir':openTask(el.dataset.id);break;
    case 'eq-recusar':S.edit.recusando=true;S.edit.erroRecusa='';renderTaskModal();break;
    case 'eq-recusar-nao':S.edit.recusando=false;renderTaskModal();break;
    case 'eq-recusar-ok':eqRecusar();break;
    case 'add-sub':addSub();break;
    case 'mv-sub':{const a=S.edit.t.subs||[],i=a.findIndex(x=>x.id===el.dataset.sid);moveSub(el.dataset.sid,i+(+el.dataset.dir));break;}
    case 'del-file':removeFile(el.dataset.fid);break;
    case 'del-sub':readForm();S.edit.t.subs=S.edit.t.subs.filter(s=>s.id!==el.dataset.sid);renderTaskModal();break;
    case 'del-task':if(S.edit.del){removeTask(S.edit.t.id);closeModal();toast('Tarefa excluída');}else{readForm();S.edit.del=true;renderTaskModal();}break;
    case 'open-ev':if(el.dataset.id)openEvent(el.dataset.id);else toast(el.dataset.nat==='1'?'Feriado nacional (automático)':el.textContent.trim());break;
    case 'save-ev':saveEventForm();break;
    case 'del-ev':if(S.editEv.del){removeEvent(S.editEv.e.id);closeModal();toast('Evento excluído');}else{S.editEv.del=true;renderEventModal();}break;
    case 'save-settings':saveSettingsForm();break;
  }
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#modal-root').innerHTML){S.dayPop=null;closeModal();}});
let dragKey=null,dragSub=null;
document.addEventListener('dragstart',e=>{const r=e.target.closest&&e.target.closest('.subrow[draggable]');if(!r)return;if(e.target.tagName==='INPUT'){e.preventDefault();return;}dragSub=r.dataset.subRow;r.classList.add('dragging');try{e.dataTransfer.setData('text/plain',dragSub);e.dataTransfer.effectAllowed='move';}catch(x){}},true);
document.addEventListener('dragover',e=>{if(!dragSub)return;const r=e.target.closest&&e.target.closest('.subrow[data-sub-row]');if(!r)return;e.preventDefault();document.querySelectorAll('.sub-over').forEach(x=>x!==r&&x.classList.remove('sub-over'));r.classList.add('sub-over');});
document.addEventListener('drop',e=>{if(!dragSub)return;const r=e.target.closest&&e.target.closest('.subrow[data-sub-row]');const id=dragSub;dragSub=null;document.querySelectorAll('.sub-over,.dragging').forEach(x=>x.classList.remove('sub-over','dragging'));if(!r||r.dataset.subRow===id)return;e.preventDefault();e.stopPropagation();const a=S.edit.t.subs||[];moveSub(id,a.findIndex(x=>x.id===r.dataset.subRow));},true);
document.addEventListener('dragend',()=>{dragSub=null;document.querySelectorAll('.sub-over,.dragging').forEach(x=>x.classList.remove('sub-over','dragging'));},true);
document.addEventListener('dragstart',e=>{const c=e.target.closest&&e.target.closest('.card[draggable]');if(!c)return;dragKey=c.dataset.key;try{e.dataTransfer.setData('text/plain',dragKey);e.dataTransfer.effectAllowed='move';}catch(x){}});
document.addEventListener('dragover',e=>{const z=e.target.closest&&e.target.closest('[data-drop]');if(!z||!dragKey)return;e.preventDefault();document.querySelectorAll('.drop-on').forEach(x=>x!==z&&x.classList.remove('drop-on'));z.classList.add('drop-on');});
document.addEventListener('dragleave',e=>{const z=e.target.closest&&e.target.closest('[data-drop]');if(z&&!z.contains(e.relatedTarget))z.classList.remove('drop-on');});
document.addEventListener('drop',e=>{const z=e.target.closest&&e.target.closest('[data-drop]');document.querySelectorAll('.drop-on').forEach(x=>x.classList.remove('drop-on'));if(!z||!dragKey)return;e.preventDefault();const id=dragKey.slice(0,dragKey.lastIndexOf('|')),t=S.tasks.get(id),nd=z.dataset.drop;dragKey=null;if(!t||t.start===nd)return;saveTask({...t,start:nd,updatedAt:Date.now()});toast('Movida para '+fmtShort(nd));});
document.addEventListener('dragend',()=>{dragKey=null;document.querySelectorAll('.drop-on').forEach(x=>x.classList.remove('drop-on'));});
let lastDay=todayS();setInterval(()=>{if(todayS()!==lastDay){lastDay=todayS();render();}},60000);
init();
