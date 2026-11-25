"use strict";
/* ============ utilidades ============ */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const BRL = c => (c/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const BRLn = c => (c/100).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
const dBR = d => d ? d.slice(8,10)+"/"+d.slice(5,7)+"/"+d.slice(0,4) : "";
const dShort = d => d ? d.slice(8,10)+"/"+d.slice(5,7) : "";
const dayDiff = (a,b) => Math.round((Date.parse(a)-Date.parse(b))/864e5);
const norm = s => String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toUpperCase().replace(/\s+/g," ").trim();
const STOP = new Set(["PIX","RECEBIDO","ENVIADO","LTDA","ME","EPP","DE","DA","DO","DOS","DAS","E","CLIENTE","FORNECEDOR","TITULO","RECEBIDO","EM","VALOR","PAGO","PAGAMENTO","BOLETO","TED","SA","S/A","KWP","COL","SGL","FMA","FCT"]);
const toks = s => new Set(norm(s).replace(/[^A-Z ]/g," ").split(" ").filter(w => w.length>2 && !STOP.has(w)));
const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const sum = arr => arr.reduce((a,b)=>a+b,0);

const MOTIVOS = ["Não lançado no Flow","Não consta no extrato","Duplicidade no Flow","Tarifa / encargo bancário","Rendimento / aplicação automática","Estorno / devolução","Data fora do período","Lançado em outra conta","Valor divergente","Transferência entre contas","Outro"];
const TIPOS = {exato:"1:1 exato", data:"1:1 data próxima", agrupado:"Agrupado", manual:"Manual", sugestao:"Sugestão aceita", interno:"Anulação no mesmo lado"};
const cat = (h,x) => { const t=norm(h+" "+(x||"")); if(/TRANSF(?!\.?RECEB)|LZ7 ENERGIA|41\.466\.492/.test(t)) return "transf"; if(/RENDIMENTO|REND PAGO|APLIC AUT/.test(t)) return "rend"; if(/TAR\/|TARIFA|CUSTAS|TARIFAS/.test(t)) return "tar"; return ""; };
const sim = (a,b) => { let s=0; const ca=cat(a.h,a.x), cb=cat(b.h,b.x); if(ca&&ca===cb) s+=20; else if(ca&&cb&&ca!==cb) s-=10; const ta=toks(a.h+" "+(a.x||"")), tb=toks(b.h+" "+(b.x||"")); ta.forEach(w=>{ if(tb.has(w)) s+=10; }); return s; };
const EXC_MOT = ["Lançamento não reconhecido","Duplicidade no Flow","Lançamento de outra conta","Erro de importação","Já conciliado em outro período","Outro"];
const AGG = /BOLETOS? RECEBIDOS|SISPAG|BUSINESS|PAGAMENTOS|PAGTO FORNEC|TRIBUTOS|LIQUIDACAO|COBRANCA|LOTE/;

/* ============ estado ============ */
const S = { db:null, user:null, dl:null, bancos:[], resumos:[], cur:null,
  selE:new Set(), selF:new Set(), focus:null, fE:"", fF:"", concFiltro:"", showConc:false,
  tab:"conc", pend:{ext:null, flow:null, bancoId:""}, tol:3, msg:null,
  dirty:false, saving:false, saveLabel:"Conectando…", writable:true, ignoredOnce:new Set(), delArm:null, bancoEdit:null };

/* ============ leitura de arquivos ============ */
function parseOFX(text){
  const g = (b,k) => { const m = b.match(new RegExp("<"+k+">([^\\r\\n<]*)")); return m ? m[1].trim() : ""; };
  const ofxD = s => s ? s.slice(0,4)+"-"+s.slice(4,6)+"-"+s.slice(6,8) : "";
  const items = [];
  (text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/g) || []).forEach(b => {
    const v = Math.round(parseFloat(g(b,"TRNAMT").replace(",","."))*100);
    if (!v) return;
    items.push({d:ofxD(g(b,"DTPOSTED")), v, h:g(b,"MEMO") || g(b,"NAME"), fid:g(b,"FITID")}); // Central: FITID guardado
  });
  const lb=(text.match(/<LEDGERBAL>[\s\S]*?(<\/LEDGERBAL>|<\/STMTRS>)/)||[""])[0];
  const bal = lb && g(lb,"BALAMT") ? {v:Math.round(parseFloat(g(lb,"BALAMT").replace(",","."))*100), d:ofxD(g(lb,"DTASOF"))} : null;
  return { acct:g(text,"ACCTID"), bankId:g(text,"BANKID"), ini:ofxD(g(text,"DTSTART")), fim:ofxD(g(text,"DTEND")), bal, items };
}
function cellDate(x){
  if (x instanceof Date) return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0");
  if (typeof x === "number" && x>20000 && x<80000){ const d = new Date(Math.round((x-25569)*864e5)); return d.toISOString().slice(0,10); }
  const m = String(x||"").trim().match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (!m) return "";
  const y = m[3].length===2 ? "20"+m[3] : m[3];
  return y+"-"+m[2].padStart(2,"0")+"-"+m[1].padStart(2,"0");
}
function cellMoney(x){
  if (x==null || x==="") return 0;
  if (typeof x === "number") return Math.round(x*100);
  let s = String(x).replace(/R\$|\s/g,"");
  let neg = /^\(.*\)$/.test(s) || /-$/.test(s) || /^-/.test(s) || /D$/i.test(s);
  s = s.replace(/[()\-+DC]/gi,"");
  if (s.includes(",")) s = s.replace(/\./g,"").replace(",",".");
  const v = Math.round(parseFloat(s)*100);
  return isNaN(v) ? 0 : (neg ? -v : v);
}
function sheetRows(buf){
  const wb = XLSX.read(buf,{type:"array",cellDates:true});
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:""});
}
function findHeader(rows, test){
  for (let i=0;i<Math.min(rows.length,40);i++){ const h = rows[i].map(norm); if (test(h)) return i; }
  return -1;
}
function parseFlow(rows){
  const hi = findHeader(rows, h => h.includes("DATA") && (h.includes("CREDITO") || h.includes("DEBITO") || h.includes("VALOR")));
  if (hi<0) throw new Error("Não encontrei o cabeçalho do relatório do Flow (colunas Data, Crédito, Débito).");
  const H = rows[hi].map(norm), ix = n => H.indexOf(n);
  const cD=ix("DATA"), cT=ix("TITULO"), cA=ix("APELIDO"), cB=ix("BANCO"), cH=ix("HISTORICO"), cC=ix("CREDITO"), cDb=ix("DEBITO"), cV=ix("VALOR");
  const items=[], bancos={};
  for (const r of rows.slice(hi+1)){
    const d = cellDate(r[cD]); if (!d) continue;
    let v = cV>=0 ? cellMoney(r[cV]) : cellMoney(r[cC]) + (cDb>=0 ? -Math.abs(cellMoney(r[cDb])) : 0);
    if (cV<0 && cC>=0 && cellMoney(r[cC])<0) v = cellMoney(r[cC]);
    if (!v) continue;
    const b = cB>=0 ? String(r[cB]).trim() : "";
    bancos[b] = (bancos[b]||0)+1;
    items.push({d, v, h:String(cA>=0?r[cA]:"").trim() || String(r[cH]||"").slice(0,80), x:String(cH>=0?r[cH]:"").trim().slice(0,140), n:String(cT>=0?r[cT]:"").trim(), b});
  }
  return {items, bancos};
}
function parseExtratoPlanilha(rows){
  const hi = findHeader(rows, h => h.includes("DATA") && h.some(c => c.startsWith("VALOR") || c==="CREDITO" || c==="DEBITO"));
  if (hi<0) throw new Error("Não encontrei as colunas Data e Valor no extrato em planilha.");
  const H = rows[hi].map(norm);
  const cD = H.indexOf("DATA");
  const cV = H.findIndex(c => c.startsWith("VALOR"));
  const cC = H.indexOf("CREDITO"), cDb = H.indexOf("DEBITO");
  const cH = H.findIndex(c => /LANCAMENTO|HISTORICO|DESCRICAO|MEMO/.test(c));
  const items=[];
  for (const r of rows.slice(hi+1)){
    const d = cellDate(r[cD]); if (!d) continue;
    const h = String(cH>=0?r[cH]:"").trim();
    if (/^SALDO|SALDO (ANTERIOR|DO DIA|TOTAL)/.test(norm(h))) continue;
    const v = cV>=0 ? cellMoney(r[cV]) : cellMoney(r[cC]) - Math.abs(cellMoney(r[cDb]));
    if (v) items.push({d,v,h});
  }
  const ds = items.map(i=>i.d).sort();
  return {acct:"", bankId:"", ini:ds[0]||"", fim:ds[ds.length-1]||"", items};
}
async function readExtrato(file){
  const buf = await file.arrayBuffer();
  if (/\.ofx$/i.test(file.name) || /OFXHEADER|<OFX>/.test(new TextDecoder("latin1").decode(buf.slice(0,400))))
    return parseOFX(new TextDecoder("windows-1252").decode(buf));
  if (/\.pdf$/i.test(file.name)){ // Central: PDF do banco lido no próprio envio (conferido pelos saldos diários)
    if (typeof window.__CONC_PDF!=="function") throw new Error("A leitura de PDF não carregou. Recarregue a página ou envie o OFX.");
    return await window.__CONC_PDF(buf, file.name);
  }
  return parseExtratoPlanilha(sheetRows(buf));
}

/* ============ conciliação automática ============ */
function maps(c){
  const mE=new Map(), mF=new Map();
  c.links.forEach(l => { l.e.forEach(i=>mE.set(i,l)); l.f.forEach(i=>mF.set(i,l)); });
  return {mE,mF};
}
function subsetSum(cands, target, maxK){
  const arr = cands.slice().sort((a,b)=>b.a-a.a), n = arr.length;
  const suf = new Array(n+1).fill(0); for (let i=n-1;i>=0;i--) suf[i]=suf[i+1]+arr[i].a;
  let nodes=0; const pick=[];
  function dfs(i,rem){
    if (rem===0) return pick.length>=2;
    if (++nodes>200000 || pick.length>=maxK) return false;
    for (let j=i;j<n;j++){
      if (j>i && arr[j].a===arr[j-1].a) continue;
      if (arr[j].a>rem) continue;
      if (suf[j]<rem) return false;
      pick.push(arr[j].id); if (dfs(j+1,rem-arr[j].a)) return true; pick.pop();
    }
    return false;
  }
  return dfs(0,target) ? pick.slice() : null;
}
function autoMatch(c){
  c.links = [];
  const E=c.E, F=c.F, tol=c.tol??3;
  const uE=new Set(E.map(i=>i.id)), uF=new Set(F.map(i=>i.id));
  const link=(e,f,tipo)=>{ c.links.push({id:uid(),e,f,tipo,dif:0}); e.forEach(i=>uE.delete(i)); f.forEach(i=>uF.delete(i)); };
  // 1) mesmo valor, mesma data
  const byKey=new Map();
  F.forEach(f=>{ const k=f.d+"|"+f.v; if(!byKey.has(k)) byKey.set(k,[]); byKey.get(k).push(f.id); });
  const fBy=new Map(F.map(f=>[f.id,f]));
  E.forEach(e=>{ const l=byKey.get(e.d+"|"+e.v); if(!l) return; const fr=l.filter(id=>uF.has(id)); if(!fr.length) return;
    let best=fr[0]; if(fr.length>1){ let bs=-1e9; fr.forEach(id=>{ const sc=sim(e,fBy.get(id)); if(sc>bs){bs=sc;best=id;} }); }
    link([e.id],[best],"exato"); });
  // 2) mesmo valor, data próxima
  E.filter(e=>uE.has(e.id)).forEach(e=>{
    let best=null, bc=1e9;
    F.forEach(f=>{ if(!uF.has(f.id)||f.v!==e.v) return; const dd=Math.abs(dayDiff(f.d,e.d)); if(dd>tol) return;
      const cost=dd*15-sim(e,f); if(cost<bc){bc=cost;best=f.id;} });
    if(best) link([e.id],[best],"data");
  });
  // 3) lançamentos agregados do banco (boletos, sispag, business…) contra vários do Flow
  const fById=new Map(F.map(f=>[f.id,f]));
  // Central: 3a) primeiro, todos os lotes de um mesmo dia juntos contra os títulos do Flow do mesmo dia (cada SISPAG/lote fecha
  // com os títulos pagos no dia). Só vale se todos os lotes do dia encaixarem; senão segue o passo 3 original abaixo.
  const lotesDia=new Map();
  E.filter(e=>uE.has(e.id) && AGG.test(norm(e.h))).forEach(e=>{ const k=e.d+"|"+Math.sign(e.v); if(!lotesDia.has(k)) lotesDia.set(k,[]); lotesDia.get(k).push(e); });
  lotesDia.forEach((lotes,k)=>{
    const [dia,sg]=k.split("|");
    const doDia=[...uF].map(id=>fById.get(id)).filter(f=>f.d===dia&&String(Math.sign(f.v))===sg);
    if (doDia.length<2 || doDia.length>45) return;
    const tentar=ordem=>{ let livres=doDia.slice(); const plano=[];
      for (const e of ordem){ const r=subsetSum(livres.map(f=>({id:f.id,a:Math.abs(f.v)})),Math.abs(e.v),15); if(!r) return null;
        plano.push([e,r]); const usados=new Set(r); livres=livres.filter(f=>!usados.has(f.id)); }
      return plano; };
    const desc=lotes.slice().sort((a,b)=>Math.abs(b.v)-Math.abs(a.v));
    const plano=tentar(desc) || (lotes.length>1 ? tentar(desc.slice().reverse()) : null);
    if (plano) plano.forEach(([e,r])=>link([e.id],r,"agrupado"));
  });
  E.filter(e=>uE.has(e.id) && AGG.test(norm(e.h))).sort((a,b)=>Math.abs(b.v)-Math.abs(a.v)).forEach(e=>{
    for (const win of [0,1,tol]){
      const cands=[...uF].map(id=>fById.get(id)).filter(f=>Math.sign(f.v)===Math.sign(e.v)&&Math.abs(dayDiff(f.d,e.d))<=win).map(f=>({id:f.id,a:Math.abs(f.v)}));
      if (cands.length<2 || cands.length>45) continue;
      const r=subsetSum(cands,Math.abs(e.v),15);
      if (r){ link([e.id],r,"agrupado"); break; }
    }
  });
}
function suggestions(c){
  const {mE,mF}=maps(c), tol=c.tol??3, ign=new Set(c.ign||[]), X=c.exc||{};
  const pE=c.E.filter(e=>!mE.has(e.id)&&!X[e.id]), pF=c.F.filter(f=>!mF.has(f.id)&&!X[f.id]);
  const out=[], used=new Set();
  const add=(tipo,e,f,txt)=>{ const key=tipo+":"+[...e,...f].sort().join(","); if(ign.has(key)||[...e,...f].some(i=>used.has(i))) return; [...e,...f].forEach(i=>used.add(i)); out.push({key,tipo,e,f,txt}); };
  const near=(a,b,w)=>Math.abs(dayDiff(a.d,b.d))<=w;
  // um do extrato = vários do Flow
  pE.forEach(e=>{ for(const w of [0,1]){ const cands=pF.filter(f=>!used.has(f.id)&&Math.sign(f.v)===Math.sign(e.v)&&near(e,f,w)).map(f=>({id:f.id,a:Math.abs(f.v)})); if(cands.length<2||cands.length>40) continue; const r=subsetSum(cands,Math.abs(e.v),8); if(r){ add("1xN",[e.id],r,"1 lançamento do extrato = "+r.length+" do Flow"); break; } } });
  // um do Flow = vários do extrato
  pF.forEach(f=>{ if(used.has(f.id)) return; const cands=pE.filter(e=>!used.has(e.id)&&Math.sign(e.v)===Math.sign(f.v)&&near(e,f,1)).map(e=>({id:e.id,a:Math.abs(e.v)})); if(cands.length<2||cands.length>40) return; const r=subsetSum(cands,Math.abs(f.v),8); if(r) add("Nx1",r,[f.id],r.length+" lançamentos do extrato = 1 do Flow"); });
  // mesmo valor com data além da tolerância
  pE.forEach(e=>{ if(used.has(e.id)) return; const f=pF.find(f=>!used.has(f.id)&&f.v===e.v&&Math.abs(dayDiff(f.d,e.d))<=15); if(f) add("data",[e.id],[f.id],"Mesmo valor, "+Math.abs(dayDiff(f.d,e.d))+" dias de diferença"); });
  // estorno no mesmo lado (somam zero)
  for (const [side,list] of [["E",pE],["F",pF]]) list.forEach(a=>{ if(used.has(a.id)) return; const b=list.find(b=>b!==a&&!used.has(b.id)&&b.v===-a.v&&Math.abs(dayDiff(a.d,b.d))<=tol+2); if(b) add("zero", side==="E"?[a.id,b.id]:[], side==="F"?[a.id,b.id]:[], side==="E"?"Lançamento e estorno no extrato (somam zero)":"Lançamento e estorno no Flow (somam zero)"); });
  return out;
}
// pendente do Flow que tem "gêmeo" (mesma data e valor) no Flow, conciliado ou não
function dupFlow(c){
  const {mF}=maps(c), X=c.exc||{}, cnt=new Map(), dup=new Map();
  c.F.forEach(f=>{ if(X[f.id]) return; const k=f.d+"|"+f.v; cnt.set(k,(cnt.get(k)||[]).concat(f)); });
  cnt.forEach(list=>{ if(list.length<2) return; const pend=list.filter(f=>!mF.has(f.id)); const ok=list.filter(f=>mF.has(f.id));
    pend.forEach(f=>{ const twin=ok[0]||pend.find(g=>g!==f); if(twin) dup.set(f.id,twin.id); }); });
  return dup;
}

/* ============ números da conciliação ============ */
function stats(c){
  const {mE,mF}=maps(c);
  const X=c.exc||{};
  const s={nE:c.E.length,nF:c.F.length, inE:0,outE:0,inF:0,outF:0, mE:0,mF:0, pE:[],pF:[], xE:[],xF:[], byTipo:{}, difManual:0};
  c.E.forEach(e=>{ e.v>0?s.inE+=e.v:s.outE+=e.v; if(mE.has(e.id)) s.mE++; else if(X[e.id]) s.xE.push(e); else s.pE.push(e); });
  c.F.forEach(f=>{ f.v>0?s.inF+=f.v:s.outF+=f.v; if(mF.has(f.id)) s.mF++; else if(X[f.id]) s.xF.push(f); else s.pF.push(f); });
  c.links.forEach(l=>{ const t=s.byTipo[l.tipo]||(s.byTipo[l.tipo]={n:0,v:0,nE:0,nF:0}); t.n++; t.nE+=l.e.length; t.nF+=l.f.length; t.v+=sum(l.e.map(id=>itemE(c,id).v)); s.difManual+=l.dif||0; });
  s.liqE=s.inE+s.outE; s.liqF=s.inF+s.outF; s.dif=s.liqE-s.liqF;
  s.vpE=sum(s.pE.map(i=>i.v)); s.vpF=sum(s.pF.map(i=>i.v)); s.vxE=sum(s.xE.map(i=>i.v)); s.vxF=sum(s.xF.map(i=>i.v));
  s.aberto=s.vpE-s.vpF;
  s.semMotivo=[...s.pE,...s.pF].filter(i=>!(c.mot[i.id]&&c.mot[i.id].m)).length;
  s.fechada = s.pE.length+s.pF.length>0 ? s.semMotivo===0 : true;
  return s;
}
const diaAntes = d => { const x=new Date(d+"T12:00:00"); x.setDate(x.getDate()-1); return x.toISOString().slice(0,10); };
function saldos(c, s){
  s = s || stats(c); const S0=c.saldos||{}, has=v=>v!=null&&v!=="";
  const r={ eI:has(S0.eI)?S0.eI:null, fI:has(S0.fI)?S0.fI:null, eFi:has(S0.eF)?S0.eF:null, fFi:has(S0.fF)?S0.fF:null };
  r.aj = (S0.aj||[]); r.ajE = sum(r.aj.filter(a=>a.lado==="E").map(a=>a.v)); r.ajF = sum(r.aj.filter(a=>a.lado==="F").map(a=>a.v));
  r.eFc = r.eI!=null ? r.eI+s.liqE+r.ajE : null;  r.fFc = r.fI!=null ? r.fI+s.liqF+r.ajF : null;
  r.eF = r.eFi!=null ? r.eFi : r.eFc;       r.fF = r.fFi!=null ? r.fFi : r.fFc;
  r.chkE = r.eFi!=null&&r.eFc!=null ? r.eFi-r.eFc : null;   // ≠0: extrato incompleto ou saldo digitado errado
  r.chkF = r.fFi!=null&&r.fFc!=null ? r.fFi-r.fFc : null;
  r.difI = r.eI!=null&&r.fI!=null ? r.eI-r.fI : null;
  r.difF = r.eF!=null&&r.fF!=null ? r.eF-r.fF : null;
  if (r.difF!=null){
    r.ponte = [
      ["Saldo final do extrato", r.eF, "b"],
      ["(−) Diferença já existente no saldo inicial", -(r.difI||0)],
      ["(−) Lançamentos só no extrato", -s.vpE],
      ["(+) Lançamentos só no Flow", s.vpF],
      ["(−) Excluídos do extrato", -s.vxE],
      ["(+) Excluídos do Flow", s.vxF],
      ["(−) Diferenças aceitas em vínculos manuais", -s.difManual],
      ["(−) Ajustes de saldo do extrato", -r.ajE],
      ["(+) Ajustes de saldo do Flow", r.ajF]];
    r.ajustado = sum(r.ponte.map(x=>x[1]));
    r.naoExpl = r.ajustado - r.fF;
  }
  r.origem = S0.origem||{};
  return r;
}
const RESP_PADRAO="VICTOR";
/* ---------- encadeamento entre meses da mesma conta ---------- */
const ymMais = (ym,k) => { let [a,m]=ym.split("-").map(Number); m+=k; while(m>12){m-=12;a++;} while(m<1){m+=12;a--;} return `${a}-${String(m).padStart(2,"0")}`; };
const ymNome = ym => ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][+ym.slice(5,7)-1]+"/"+ym.slice(0,4);
function resumoDoMes(bancoId, ym, exceto){
  return S.resumos.filter(r=>r.bancoId===bancoId && String(r.fim).slice(0,7)===ym && r.id!==exceto)
    .sort((a,b)=>String(b.atualizadoEm).localeCompare(String(a.atualizadoEm)))[0] || null;
}
const FECHADAS = new Set(["conciliada","justificada","manual"]);
// compara o final de um mês com o inicial do seguinte (null quando algum saldo não foi informado)
function elo(ant, cur){
  if (!ant || !cur) return null;
  const dE = ant.fE==null||cur.iE==null ? null : cur.iE-ant.fE, dF = ant.fF==null||cur.iF==null ? null : cur.iF-ant.fF;
  return { dE, dF, ok: (dE==null||dE===0) && (dF==null||dF===0), incompleto: dE==null||dF==null };
}
const saldosDoResumo = r => r ? { iE:r.sIniE??null, iF:r.sIniF??null, fE:r.sFinE??null, fF:r.sFinF??null } : null;
// todas as quebras de encadeamento do histórico, por conta
function quebrasEncadeamento(){
  const out=[], porConta={};
  S.resumos.forEach(r=>{ (porConta[r.bancoId]=porConta[r.bancoId]||{})[String(r.fim).slice(0,7)]=resumoDoMes(r.bancoId,String(r.fim).slice(0,7)); });
  Object.values(porConta).forEach(meses=>{ Object.keys(meses).sort().forEach(ym=>{
    const ant=meses[ymMais(ym,-1)], cur=meses[ym]; const e=elo(saldosDoResumo(ant),saldosDoResumo(cur));
    if (e && !e.ok) out.push({ant, cur, ...e});
  }); });
  return out;
}
async function propagar(c, manual){
  if (!S.db || !c) return {msg:"Armazenamento indisponível."};
  const rs=saldos(c), ym=String(c.fim).slice(0,7), nx=resumoDoMes(c.bancoId, ymMais(ym,1), c.id);
  if (!nx) return {msg:`Não há conciliação de ${ymNome(ymMais(ym,1))} desta conta.`};
  if (rs.eF==null && rs.fF==null) return {msg:"Informe os saldos finais antes de atualizar o mês seguinte."};
  if ((nx.sIniE??null)===rs.eF && (nx.sIniF??null)===rs.fF) return {msg:`${ymNome(ymMais(ym,1))} já começa com estes saldos.`, ok:true};
  const orig=`final de ${ymNome(ym)}`, now=new Date().toISOString();
  const sd={ origem:{} }; if (rs.eF!=null){ sd.eI=rs.eF; sd.origem.eI=orig; } if (rs.fF!=null){ sd.fI=rs.fF; sd.origem.fI=orig; }
  const fechadoProx = FECHADAS.has(nx.status);
  const dE = rs.eF!=null && nx.sIniE!=null ? rs.eF-nx.sIniE : null, dF = rs.fF!=null && nx.sIniF!=null ? rs.fF-nx.sIniF : null;
  try{
    await S.db.doc("conciliacoes/"+nx.id).update({ saldos: sd });
    await S.db.doc("resumos/"+nx.id).update({ sIniE: rs.eF??nx.sIniE??null, sIniF: rs.fF??nx.sIniF??null,
      revisar: { de: tituloDe(c), em: now, por: c.responsavel||RESP_PADRAO, dE, dF, fechada: fechadoProx, manual: !!manual } });
    return { ok:true, msg:`Saldo inicial de ${ymNome(ymMais(ym,1))} atualizado${fechadoProx?" (ela estava fechada e ficou marcada para revisar)":""}.` };
  }catch(e){ return { msg:"Não atualizou o mês seguinte ("+(e.code||"erro")+")." }; }
}
const MESES=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const tituloPadrao = c => `${c.banco} · ${MESES[+c.fim.slice(5,7)-1]}/${c.fim.slice(0,4)}`;
const tituloDe = c => (c.titulo||"").trim() || tituloPadrao(c);
function situacao(c, s){
  s = s || stats(c);
  if (c.fech && c.fech.manual) return {k:"manual", txt:"Fechada manualmente", cls:"ok", pdf:"FECHADA MANUALMENTE"};
  if (s.pE.length+s.pF.length===0 && !s.difManual) return {k:"conciliada", txt:"Conciliada", cls:"ok", pdf:"CONCILIADA"};
  if (s.fechada) return {k:"justificada", txt:"Fechada com justificativas", cls:"neu", pdf:"FECHADA COM DIVERGÊNCIAS JUSTIFICADAS"};
  return {k:"andamento", txt:"Em andamento", cls:"warn", pdf:"EM ANDAMENTO (há divergências sem justificativa)"};
}
let _idxE=null,_idxF=null,_idxC=null;
function reindex(c){ _idxC=c; _idxE=new Map(c.E.map(i=>[i.id,i])); _idxF=new Map(c.F.map(i=>[i.id,i])); }
function itemE(c,id){ if(_idxC!==c) reindex(c); return _idxE.get(id); }
function itemF(c,id){ if(_idxC!==c) reindex(c); return _idxF.get(id); }

/* ============ persistência ============ */
function pack(c){
  return { v:1, id:c.id, bancoId:c.bancoId, banco:c.banco, ini:c.ini, fim:c.fim, tol:c.tol, arquivos:c.arquivos,
    criadoEm:c.criadoEm, atualizadoEm:new Date().toISOString(), responsavel:c.responsavel||"", conclusao:c.conclusao||"",
    E:c.E.map(i=>i.fid?[i.d,i.v,i.h,i.fid]:[i.d,i.v,i.h]), F:c.F.map(i=>[i.d,i.v,i.h,i.x||"",i.n||""]),
    links:c.links.map(l=>[l.id,l.e,l.f,l.tipo,l.dif||0,l.nota||""]), mot:c.mot, exc:c.exc||{}, notaExc:!!c.notaExc, atualizacoes:c.atualizacoes||[], saldos:c.saldos||{}, titulo:c.titulo||"", justif:c.justif||"", fech:c.fech||null, ign:c.ign||[], auto:false };
}
function unpack(d){
  const c={ id:d.id, bancoId:d.bancoId||"", banco:d.banco||"", ini:d.ini||"", fim:d.fim||"", tol:d.tol??3, arquivos:d.arquivos||{},
    criadoEm:d.criadoEm||"", responsavel:d.responsavel||RESP_PADRAO, conclusao:d.conclusao||"", mot:JSON.parse(JSON.stringify(d.mot||{})), exc:JSON.parse(JSON.stringify(d.exc||{})), notaExc:!!d.notaExc, atualizacoes:JSON.parse(JSON.stringify(d.atualizacoes||[])), saldos:JSON.parse(JSON.stringify(d.saldos||{})), titulo:d.titulo||"", justif:d.justif||"", fech:d.fech?{...d.fech}:null, ign:[...(d.ign||[])],
    E:(d.E||[]).map((r,i)=>({id:"e"+i,d:r[0],v:r[1],h:r[2],fid:r[3]||""})), F:(d.F||[]).map((r,i)=>({id:"f"+i,d:r[0],v:r[1],h:r[2],x:r[3],n:r[4]})),
    links:(d.links||[]).map(r=>({id:r[0],e:[...r[1]],f:[...r[2]],tipo:r[3],dif:r[4]||0,nota:r[5]||""})) };
  if (d.auto || !d.links) autoMatch(c);
  return c;
}
function resumo(c){
  const s=stats(c);
  return { id:c.id, bancoId:c.bancoId, banco:c.banco, ini:c.ini, fim:c.fim, nE:s.nE, nF:s.nF, mE:s.mE, mF:s.mF, pE:s.pE.length, pF:s.pF.length, nExc:s.xE.length+s.xF.length, semMotivo:s.semMotivo, dif:s.dif, aberto:s.aberto, fechada:s.fechada, sFinE:saldos(c,s).eF, sFinF:saldos(c,s).fF, sIniE:saldos(c,s).eI, sIniF:saldos(c,s).fI, titulo:tituloDe(c), status:situacao(c,s).k, revisar:(S.resumos.find(x=>x.id===c.id)||{}).revisar||null, justif:(c.justif||"").slice(0,200), fech:c.fech||null, atualizadoEm:new Date().toISOString() };
}
let saveTimer=null;
function markDirty(){ S.dirty=true; setSave("Alterações não salvas"); clearTimeout(saveTimer); saveTimer=setTimeout(saveNow,1200); }
async function saveNow(){
  if (!S.cur || !S.db || !S.writable) { if(!S.db) setSave("Sem armazenamento: o trabalho fica só nesta aba"); return; }
  if (S.saving) { clearTimeout(saveTimer); saveTimer=setTimeout(saveNow,800); return; }
  S.saving=true; S.dirty=false; setSave("Salvando…");
  try{
    const body=pack(S.cur);
    // Central: sem o corte do histórico do Flow em 60 caracteres (o limite de 250 mil caracteres era do artifact)
    await S.db.doc("conciliacoes/"+S.cur.id).set(body);
    await S.db.doc("resumos/"+S.cur.id).set(resumo(S.cur));
    setSave("Salvo às "+new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}));
    if (S.cfg && S.cfg.autoEnc){
      const rs=saldos(S.cur), key=S.cur.id+"|"+rs.eF+"|"+rs.fF;
      if (S.lastProp!==key){ S.lastProp=key; const r=await propagar(S.cur,false); if (r && r.ok && !/já começa/.test(r.msg)) setSave(r.msg); }
    }
  }catch(e){
    if (e && e.code==="invalid_argument") { S.writable=false; setSave("Somente leitura: seu acesso não permite salvar"); }
    else if (e && e.code==="conflict") { S.writable=false; S.conflito=true; // Central: outra pessoa salvou antes
      setSave("Não salvou: outra pessoa alterou esta conciliação");
      S.msg={k:"bad",t:"Outra pessoa salvou esta conciliação depois que você a abriu. Para não apagar o trabalho dela, suas últimas alterações não foram salvas. Abra a conciliação de novo pelo Histórico para continuar."}; renderConc(); }
    else if (e && e.code==="conciliacao_fechada") { setSave("Conciliação fechada: reabra para alterar"); } // Central
    else if (e && e.code==="quota_exceeded") setSave("Espaço cheio: exclua conciliações antigas no Histórico");
    else { S.dirty=true; setSave("Não salvou ("+(e&&e.code||"erro")+"). Tentando de novo…"); setTimeout(saveNow,4000); }
  }finally{ S.saving=false; }
}
function setSave(t){ S.saveLabel=t; const el=$("#savechip"); if(el) el.textContent=t; }

/* ============ ações ============ */
// Central: conciliação fechada fica bloqueada até "Reabrir" (o banco também recusa a gravação).
const MUDA = new Set(["link","excsel","excopen","excdup","restore","updopen","updapply","undo","acc","ign","accall","rematch","ajadd","ajsave","ajdel","puxarant"]);
function bloqueada(){ if (S.cur && S.cur.fech){ setSave("Conciliação fechada: clique em Reabrir para alterar"); return true; } return false; }
function act(name, el, ev){
  const c=S.cur;
  if (MUDA.has(name) && bloqueada()) return;
  switch(name){
    case "tab": S.tab=el.dataset.tab; renderAll(); break;
    case "conciliar": runImport(); break;
    case "nova": S.upd=null; S.cur=null; S.pend={ext:null,flow:null,bancoId:""}; S.msg=null; clearSel(); renderAll(); break;
    case "pick": { // clique na linha
      if (ev.target.closest("select,input:not([type=checkbox]),button")) return;
      const id=el.dataset.id, side=el.dataset.side, set=side==="E"?S.selE:S.selF;
      if (set.has(id)) { set.delete(id); if(S.focus===id) S.focus=null; } else { set.add(id); S.focus=id; }
      renderBench(); renderSelbar(); break; }
    case "clearsel": clearSel(); renderBench(); renderSelbar(); break;
    case "link": {
      const e=[...S.selE], f=[...S.selF];
      const se=sum(e.map(id=>itemE(c,id).v)), sf=sum(f.map(id=>itemF(c,id).v));
      const single = (e.length===0||f.length===0);
      const dif = single ? (e.length?se:sf) : se-sf;
      const nota = ($("#selnota")||{}).value||"";
      if (dif!==0 && !nota.trim()) { $("#selnota").focus(); $("#selnota").placeholder="Explique a diferença para conciliar"; return; }
      c.links.push({id:uid(),e,f,tipo:single?"interno":"manual",dif,nota:nota.trim()});
      [...e,...f].forEach(id=>delete c.mot[id]);
      clearSel(); markDirty(); renderConc(); break; }
    case "excsel": {
      const m=($("#excmot")||{}).value||"", o=(($("#excobs")||{}).value||"").trim();
      if (!m){ const el2=$("#excmot"); if(el2){ el2.focus(); el2.classList.add("need"); } return; }
      c.exc=c.exc||{}; const em=new Date().toISOString(), por=c.responsavel||RESP_PADRAO;
      [...S.selE,...S.selF].forEach(id=>{ c.exc[id]={m,o,em,por}; delete c.mot[id]; });
      S.excOpen=false; clearSel(); markDirty(); renderConc(); break; }
    case "excopen": S.excOpen=true; renderSelbar(); { const e2=$("#excmot"); if(e2) e2.focus(); } break;
    case "excdup": { c.exc=c.exc||{}; const tw=dupFlow(c).get(el.dataset.id); const t=tw?itemF(c,tw):null;
      c.exc[el.dataset.id]={m:"Duplicidade no Flow",tw:tw||"",o:t?`Mesmo valor e data de "${t.h}"${t.x&&t.x!==t.h?" ("+t.x.slice(0,50)+")":""}`:"",em:new Date().toISOString(),por:c.responsavel||RESP_PADRAO};
      delete c.mot[el.dataset.id]; S.selF.delete(el.dataset.id); if(S.focus===el.dataset.id) S.focus=null; markDirty(); renderConc(); break; }
    case "restore": { delete c.exc[el.dataset.id]; markDirty(); renderConc(); break; }
    case "expexc": exportarExcluidos(el.dataset.fmt); break;
    case "expdat": exportarDatas(el.dataset.fmt); break;
    case "updopen": S.upd={ext:null,flow:null,prev:null,err:null}; renderConc(); { const p=$("#updpanel"); if(p) p.scrollIntoView({block:"nearest"}); } break;
    case "updcancel": S.upd=null; renderConc(); break;
    case "updapply": aplicarUpdate(); break;
    case "toggledat": S.showDat=!S.showDat; renderDatas(); break;
    case "toggleexc": S.showExc=!S.showExc; renderExcluidos(); break;
    case "undo": { c.links=c.links.filter(l=>l.id!==el.dataset.id); markDirty(); renderConc(); break; }
    case "acc": { const s=suggestions(c).find(x=>x.key===el.dataset.key); if(!s) return;
      c.links.push({id:uid(),e:s.e,f:s.f,tipo:s.tipo==="zero"?"interno":"sugestao",dif:0,nota:s.txt}); [...s.e,...s.f].forEach(id=>delete c.mot[id]); markDirty(); renderConc(); break; }
    case "ign": { c.ign=c.ign||[]; c.ign.push(el.dataset.key); markDirty(); renderConc(); break; }
    case "accall": { suggestions(c).filter(s=>s.tipo!=="data").forEach(s=>{ c.links.push({id:uid(),e:s.e,f:s.f,tipo:s.tipo==="zero"?"interno":"sugestao",dif:0,nota:s.txt}); }); markDirty(); renderConc(); break; }
    case "rematch": { const keep=c.links.filter(l=>["manual","sugestao","interno"].includes(l.tipo)); const used=new Set(keep.flatMap(l=>[...l.e,...l.f]));
      const tmp={...c,E:c.E.filter(i=>!used.has(i.id)),F:c.F.filter(i=>!used.has(i.id)),links:[]}; autoMatch(tmp); c.links=[...keep,...tmp.links]; markDirty(); renderConc(); break; }
    case "toggleconc": S.showConc=!S.showConc; renderConciliados(); break;
    case "pdf": gerarPDF(); break;
    case "audopen": S.audOpen=!S.audOpen; renderAuditoria(); break; // Central
    case "fechar": {
      const s=stats(c), rs=saldos(c,s), temPend = s.pE.length+s.pF.length>0 || s.difManual || rs.difF || rs.naoExpl;
      if (temPend && !(c.justif||"").trim()){ const t=$("#justif"); t.classList.add("need"); t.focus(); $("#fechmsg").textContent="Escreva a justificativa antes de fechar."; return; }
      c.fech={manual:true, por:c.responsavel||RESP_PADRAO, em:new Date().toISOString()}; markDirty(); renderConc(); break; }
    case "reabrir": c.fech=null; markDirty(); renderConc(); break;
    case "ajadd": S.ajForm=el.dataset.lado; renderSaldos(); { const i=$("#aj_v"); if(i) i.focus(); } break;
    case "ajcancel": S.ajForm=null; renderSaldos(); break;
    case "ajsave": {
      const vv=cellMoney(($("#aj_v").value||"").trim()), j=($("#aj_j").value||"").trim(), m=$("#ajmsg");
      if (!vv){ m.textContent="Informe o valor do ajuste."; m.style.color="var(--bad)"; $("#aj_v").focus(); return; }
      if (!j){ m.textContent="Escreva a justificativa do ajuste."; m.style.color="var(--bad)"; $("#aj_j").focus(); return; }
      c.saldos=c.saldos||{}; c.saldos.aj=[...(c.saldos.aj||[]), {id:uid(), lado:S.ajForm, v:vv, j, por:c.responsavel||RESP_PADRAO, em:new Date().toISOString()}];
      S.ajForm=null; markDirty(); renderSaldos(); renderFechamento(); atualizaPill(); break; }
    case "ajdel": {
      if (S.delArm!=="aj"+el.dataset.id){ S.delArm="aj"+el.dataset.id; renderSaldos(); return; }
      S.delArm=null; c.saldos.aj=(c.saldos.aj||[]).filter(a=>a.id!==el.dataset.id); markDirty(); renderSaldos(); renderFechamento(); atualizaPill(); break; }
    case "hsort": break;
    case "exphist": exportarResumoHist(); break;
    case "exphistx": exportarPlanilhaHist(); break; // Central: planilha (conc-relatorio.js)
    case "puxarant": {
      const ym=String(c.fim).slice(0,7), ant=resumoDoMes(c.bancoId,ymMais(ym,-1),c.id); if(!ant) return;
      c.saldos=c.saldos||{}; c.saldos.origem=c.saldos.origem||{};
      if (ant.sFinE!=null){ c.saldos.eI=ant.sFinE; c.saldos.origem.eI=`final de ${ymNome(ymMais(ym,-1))}`; }
      if (ant.sFinF!=null){ c.saldos.fI=ant.sFinF; c.saldos.origem.fI=`final de ${ymNome(ymMais(ym,-1))}`; }
      markDirty(); renderSaldos(); renderFechamento(); atualizaPill(); break; }
    case "enviarprox": { el.disabled=true; (async()=>{ await saveNow(); const r=await propagar(c,true); const m=$("#encmsg"); if(m){ m.textContent=r.msg; m.style.color=r.ok?"var(--ok)":"var(--bad)"; } })(); break; }
    case "revok": { const meu=S.resumos.find(x=>x.id===c.id); if(meu) delete meu.revisar; markDirty(); renderSaldos(); break; }
    case "fjopen": S.fjForm=el.dataset.id; renderHist(); { const i=$("#fjtxt"); if(i) i.focus(); } break;
    case "fjcancel": S.fjForm=null; renderHist(); break;
    case "fjsave": {
      const txt=($("#fjtxt").value||"").trim(), ms=[...document.querySelectorAll(".fjm:checked")].map(x=>x.value), m=$("#fjmsg");
      if (!ms.length){ m.textContent="Marque pelo menos um mês."; m.style.color="var(--bad)"; return; }
      if (!txt){ m.textContent="Escreva a justificativa."; m.style.color="var(--bad)"; $("#fjtxt").focus(); return; }
      if (!S.db){ m.textContent="Armazenamento indisponível nesta visualização."; return; }
      const id=el.dataset.id, por=RESP_PADRAO, em=new Date().toISOString();
      (async()=>{ try{ for (const mm of ms) await S.db.doc("faltas/"+id+"_"+mm).set({bancoId:id, mes:mm, justif:txt, por, em}); S.fjForm=null; }
        catch(e){ m.textContent = e.code==="invalid_argument" ? "Seu acesso não permite salvar." : "Não salvou ("+(e.code||"erro")+")."; m.style.color="var(--bad)"; } })();
      break; }
    case "fjdel": {
      const key="fj"+el.dataset.id+el.dataset.ms;
      if (S.delArm!==key){ S.delArm=key; renderHist(); return; }
      S.delArm=null; (async()=>{ for (const mm of el.dataset.ms.split(",")) { try{ await S.db.doc("faltas/"+el.dataset.id+"_"+mm).delete(); }catch(_){} } })(); break; }
    case "open": abrir(el.dataset.id); break;
    case "del": if (S.delArm===el.dataset.id) { excluir(el.dataset.id); } else { S.delArm=el.dataset.id; renderHist(); } break;
    case "bsave": salvarBanco(); break;
    case "bedit": S.bancoEdit=el.dataset.id; renderBancos(); break;
    case "bdel": if (S.delArm==="b"+el.dataset.id){ S.db&&S.db.doc("bancos/"+el.dataset.id).delete(); S.delArm=null; } else { S.delArm="b"+el.dataset.id; renderBancos(); } break;
    case "bcancel": S.bancoEdit=null; renderBancos(); break;
    case "fromofx": { const x=S.pend.ext; S.bancoEdit="new"; S.tab="bancos"; S.bancoDraft={nome:"",empresa:"",banco:x&&x.bankId==="0341"?"Itaú":"",nomeFlow:"",conta:x?x.acct:""}; renderAll(); break; }
  }
}
function clearSel(){ S.selE.clear(); S.selF.clear(); S.focus=null; S.excOpen=false; }
document.addEventListener("keydown", ev => { if (ev.key==="Enter" && (ev.target.id==="aj_v"||ev.target.id==="aj_j")){ ev.preventDefault(); const b=document.querySelector('[data-act="ajsave"]'); if(b) b.click(); } });
document.addEventListener("click", ev => { const el=ev.target.closest("[data-act]"); if(!el) return;
  const sec=el.closest("#view-conc section[id]"); S.anchor = sec ? sec.id : (el.closest("#selbar") ? "bench" : null);
  act(el.dataset.act, el, ev); });
document.addEventListener("change", ev => {
  const t=ev.target;
  if (S.cur && S.cur.fech && (t.dataset.mot || (t.classList && t.classList.contains("sd")) || t.id==="notaExc")){ bloqueada(); renderConc(); return; } // Central
  if (t.dataset.mot && S.cur){ const id=t.dataset.mot; S.cur.mot[id]={...(S.cur.mot[id]||{}),m:t.value}; markDirty(); renderStats(); renderFechamento(); atualizaPill(); }
  if (t.id==="bancoSel"){ S.pend.bancoId=t.value; }
  if (t.classList && t.classList.contains("sd") && S.cur){
    const k=t.id.slice(3); S.cur.saldos=S.cur.saldos||{}; S.cur.saldos.origem=S.cur.saldos.origem||{};
    if (t.value.trim()===""){ delete S.cur.saldos[k]; } else { S.cur.saldos[k]=cellMoney(t.value); }
    delete S.cur.saldos.origem[k]; markDirty(); renderSaldos(); renderFechamento(); atualizaPill();
  }
  if (t.id==="notaExc" && S.cur){ S.cur.notaExc=t.checked; markDirty(); }
  if (t.id==="hsort"){ S.hsort=t.value; try{ localStorage.setItem("conc_hsort",t.value); }catch(_){} renderHist(); }
  if (t.id==="autoenc"){ S.cfg=S.cfg||{}; S.cfg.autoEnc=t.checked; if (S.db) S.db.doc("config/geral").set({...S.cfg}).catch(()=>{}); }
  if (t.id==="hsit"){ S.hsit=t.value; renderHist(); }
  if (t.id==="hbanco"||t.id==="hmes"){ S[t.id]=t.value; renderHist(); } // Central: filtros por conta e mês
  if (t.id==="tol"){ S.tol=Math.max(0,Math.min(15,parseInt(t.value)||0)); }
  if (t.id==="fileExt"||t.id==="fileFlow") loadFile(t.id==="fileExt"?"ext":"flow", t.files[0]);
  if (t.id==="fileUExt"||t.id==="fileUFlow") loadFile(t.id==="fileUExt"?"uext":"uflow", t.files[0]);
});
let inputTimer=null;
document.addEventListener("input", ev => {
  const t=ev.target;
  if (S.cur && S.cur.fech && (t.dataset.obs || ["titulo","justif","resp","concl"].includes(t.id))){ bloqueada(); return; } // Central
  if (t.dataset.obs && S.cur){ const id=t.dataset.obs; S.cur.mot[id]={...(S.cur.mot[id]||{}),o:t.value}; markDirty(); }
  if (t.id==="fE"||t.id==="fF"){ S[t.id]=t.value; clearTimeout(inputTimer); inputTimer=setTimeout(renderBench,180); }
  if (t.id==="concFiltro"){ S.concFiltro=t.value; clearTimeout(inputTimer); inputTimer=setTimeout(renderConciliados,180); }
  if (t.id==="titulo" && S.cur){ S.cur.titulo=t.value; markDirty(); }
  if (t.id==="justif" && S.cur){ S.cur.justif=t.value; t.classList.remove("need"); markDirty(); }
  if (t.id==="hq"){ S.hq=t.value; clearTimeout(inputTimer); inputTimer=setTimeout(()=>{ renderHist(); const i=$("#hq"); if(i){ i.focus(); i.setSelectionRange(i.value.length,i.value.length);} },180); }
  if ((t.id==="resp"||t.id==="concl") && S.cur){ S.cur[t.id==="resp"?"responsavel":"conclusao"]=t.value; markDirty(); }
  if (t.id==="selnota") renderSelbarState();
});
["dragover","dragleave","drop"].forEach(tp=>document.addEventListener(tp, ev=>{
  const z=ev.target.closest&&ev.target.closest(".drop"); if(!z) return; ev.preventDefault();
  z.classList.toggle("over", tp==="dragover");
  if (tp==="drop" && ev.dataTransfer.files[0]) loadFile(z.dataset.kind, ev.dataTransfer.files[0]);
}));

async function loadFile(kind, file){
  if (!file) return;
  if (kind==="uext"||kind==="uflow"){
    const u=S.upd; if(!u) return; u.err=null;
    try{
      if (kind==="uext"){ const x=await readExtrato(file); x.nome=file.name; if(!x.items.length) throw new Error("O extrato não tem lançamentos."); u.ext=x; }
      else { if (typeof XLSX==="undefined") throw new Error("A biblioteca de planilhas não carregou. Recarregue a página.");
        const x=parseFlow(sheetRows(await file.arrayBuffer())); x.nome=file.name; if(!x.items.length) throw new Error("O relatório do Flow não tem lançamentos com valor."); u.flow=x; }
      u.prev=previewUpdate(S.cur,u.ext,u.flow);
    }catch(e){ u.err=(kind==="uext"?"Extrato: ":"Flow: ")+e.message; }
    renderConc(); return;
  }
  S.msg=null;
  try{
    if (kind==="ext"){
      const x=await readExtrato(file); x.nome=file.name;
      if (!x.items.length) throw new Error("O extrato não tem lançamentos.");
      S.pend.ext=x;
      const acct=String(x.acct||"").replace(/\D/g,"");
      const b=acct && S.bancos.find(b=>{ const k=String(b.conta||"").replace(/\D/g,""); return k && (acct.endsWith(k)||k.endsWith(acct)); });
      if (b) S.pend.bancoId=b.id;
    } else {
      if (typeof XLSX==="undefined") throw new Error("A biblioteca de planilhas não carregou. Recarregue a página.");
      const x=parseFlow(sheetRows(await file.arrayBuffer())); x.nome=file.name;
      if (!x.items.length) throw new Error("O relatório do Flow não tem lançamentos com valor.");
      S.pend.flow=x;
    }
  }catch(e){ S.msg={k:"bad",t:(kind==="ext"?"Extrato: ":"Flow: ")+e.message}; }
  renderConc();
}
function filtraFlow(flow, b, ini, fim){
  let F=flow.items; const avisos=[];
  const nomes=Object.keys(flow.bancos).filter(Boolean);
  if (b && b.nomeFlow && nomes.length){
    const alvo=norm(b.nomeFlow); const fil=F.filter(i=>norm(i.b)===alvo);
    if (!fil.length) return {erro:`O relatório do Flow não tem lançamentos da conta "${b.nomeFlow}". Contas no arquivo: ${nomes.join(", ")}. Ajuste o "Nome no Flow" na aba Bancos.`};
    if (fil.length<F.length) avisos.push(`${F.length-fil.length} lançamentos de outras contas do Flow foram ignorados.`);
    F=fil;
  }
  const fora=F.filter(i=>i.d<ini||i.d>fim).length;
  if (fora){ avisos.push(`${fora} lançamentos do Flow fora do período do extrato (${dBR(ini)} a ${dBR(fim)}) foram ignorados.`); F=F.filter(i=>i.d>=ini&&i.d<=fim); }
  return {F, avisos};
}
const periodo = x => [x.ini||x.items.map(i=>i.d).sort()[0], x.fim||x.items.map(i=>i.d).sort().pop()];
function runImport(){
  const {ext,flow,bancoId}=S.pend; const b=S.bancos.find(x=>x.id===bancoId);
  if (!ext||!flow){ S.msg={k:"warn",t:"Carregue o extrato e o relatório do Flow."}; return renderConc(); }
  if (!b){ S.msg={k:"warn",t:"Escolha a conta bancária. Se ela ainda não existe, cadastre na aba Bancos."}; return renderConc(); }
  const [ini,fim]=periodo(ext);
  const ff=filtraFlow(flow,b,ini,fim); if (ff.erro){ S.msg={k:"bad",t:ff.erro}; return renderConc(); }
  const F=ff.F, avisos=ff.avisos;
  const c={ id:"c"+uid(), bancoId:b.id, banco:b.nome, ini, fim, tol:S.tol, criadoEm:new Date().toISOString(), titulo:`${b.nome} · ${MESES[+fim.slice(5,7)-1]}/${fim.slice(0,4)}`, justif:"", fech:null,
    arquivos:{extrato:ext.nome, flow:flow.nome, avisos}, mot:{}, exc:{}, ign:[], responsavel:RESP_PADRAO, conclusao:"",
    E:ext.items.map((i,k)=>({id:"e"+k,d:i.d,v:i.v,h:i.h,fid:i.fid||""})), F:F.map((i,k)=>({id:"f"+k,d:i.d,v:i.v,h:i.h,x:i.x,n:i.n})), links:[] }; // Central: fid
  c.saldos={origem:{}};
  const ant=S.resumos.find(r=>r.bancoId===b.id && r.fim===diaAntes(ini));
  if (ant){ if(ant.sFinE!=null){ c.saldos.eI=ant.sFinE; c.saldos.origem.eI="final da conciliação anterior"; } if(ant.sFinF!=null){ c.saldos.fI=ant.sFinF; c.saldos.origem.fI="final da conciliação anterior"; } }
  if (ext.bal && ext.bal.d===fim){ c.saldos.eF=ext.bal.v; c.saldos.origem.eF="OFX"; }
  autoMatch(c);
  S.cur=c; clearSel(); S.msg=avisos.length?{k:"warn",t:avisos.join(" ")}:null; S.showConc=false;
  S.rendered=null; markDirty(); renderConc(); window.scrollTo({top:0});
}
/* ============ atualizar arquivos de uma conciliação ============ */
const keyE = i => i.d+"|"+i.v+"|"+norm(i.h);
const keyF = i => i.d+"|"+i.v+"|"+norm(i.h)+"|"+(i.n||"");
function remap(oldL, newL, kf){
  const pool=new Map(); newL.forEach(n=>{ const k=kf(n); if(!pool.has(k)) pool.set(k,[]); pool.get(k).push(n.id); });
  const m=new Map(); oldL.forEach(o=>{ const a=pool.get(kf(o)); if(a&&a.length) m.set(o.id,a.shift()); });
  return m;
}
// Central: o mesmo lançamento do extrato é reconhecido primeiro pelo FITID do OFX (com data e valor);
// o que não tiver FITID dos dois lados (planilha, conciliações antigas) cai na chave antiga data|valor|histórico.
function remapE(oldL, newL){
  const kfid = i => i.fid ? i.fid+"|"+i.d+"|"+i.v : null;
  const m=new Map(), usados=new Set(), pool=new Map();
  newL.forEach(n=>{ const k=kfid(n); if(!k) return; if(!pool.has(k)) pool.set(k,[]); pool.get(k).push(n.id); });
  oldL.forEach(o=>{ const k=kfid(o); const a=k&&pool.get(k); if(a&&a.length){ const n=a.shift(); m.set(o.id,n); usados.add(n); } });
  const resto=remap(oldL.filter(o=>!m.has(o.id)), newL.filter(n=>!usados.has(n.id)), keyE);
  resto.forEach((n,o)=>m.set(o,n));
  return m;
}
function previewUpdate(c, ext, flow){
  const b=S.bancos.find(x=>x.id===c.bancoId);
  if (ext && ext.acct && b && b.conta){ const a=String(ext.acct).replace(/\D/g,""), k=String(b.conta).replace(/\D/g,""); if(k && !(a.endsWith(k)||k.endsWith(a))) return {erro:`Este extrato é da conta ${ext.acct}, mas a conciliação é de ${c.banco} (conta ${b.conta}).`}; }
  const [ini,fim] = ext ? periodo(ext) : [c.ini,c.fim];
  const avisos=[];
  const E = ext ? ext.items.map((i,k)=>({id:"e"+k,d:i.d,v:i.v,h:i.h,fid:i.fid||""})) : c.E.map(i=>({...i})); // Central: fid
  let F;
  if (flow){ const ff=filtraFlow(flow,b,ini,fim); if(ff.erro) return {erro:ff.erro}; F=ff.F.map((i,k)=>({id:"f"+k,d:i.d,v:i.v,h:i.h,x:i.x,n:i.n})); avisos.push(...ff.avisos); }
  else { F=c.F.filter(i=>i.d>=ini&&i.d<=fim).map(i=>({...i})); if (ini<c.ini||fim>c.fim) avisos.push(`O período passou para ${dBR(ini)} a ${dBR(fim)}. Carregue também o relatório do Flow desse período, senão os novos dias ficam só no extrato.`); }
  const mE = ext ? remapE(c.E,E) : new Map(E.map(i=>[i.id,i.id])); // Central: casa primeiro pelo FITID
  const mF = flow ? remap(c.F,F,keyF) : new Map(F.map(i=>[i.id,i.id]));
  const sd=JSON.parse(JSON.stringify(c.saldos||{origem:{}})); sd.origem=sd.origem||{};
  if (ext && ext.bal && ext.bal.d===fim){ sd.eF=ext.bal.v; sd.origem.eF="OFX"; }
  else if (ext && fim!==c.fim && sd.origem.eF==="OFX"){ delete sd.eF; delete sd.origem.eF; }
  const nc={ ...c, saldos:sd, ini, fim, E, F, links:[], mot:{}, exc:{}, ign:[], arquivos:{...c.arquivos, extrato:ext?ext.nome:c.arquivos.extrato, flow:flow?flow.nome:c.arquivos.flow, avisos} };
  const perdidos=[], corrigidos=[], sumiram=[];
  c.links.forEach(l=>{ const e=l.e.map(id=>mE.get(id)), f=l.f.map(id=>mF.get(id));
    if (e.every(Boolean)&&f.every(Boolean)) nc.links.push({...l,e,f}); else perdidos.push(l); });
  Object.entries(c.mot||{}).forEach(([id,v])=>{ const n=(id[0]==="e"?mE:mF).get(id); if(n) nc.mot[n]=v; });
  Object.entries(c.exc||{}).forEach(([id,v])=>{ const isE=id[0]==="e", n=(isE?mE:mF).get(id), it=isE?itemE(c,id):itemF(c,id);
    if (n){ const tw=v.tw?mF.get(v.tw):""; nc.exc[n]={...v,tw:tw||""}; } else (isE?sumiram:corrigidos).push({it,x:v}); });
  // pareamento automático só do que ficou sem vínculo
  const used=new Set(nc.links.flatMap(l=>[...l.e,...l.f])), X=nc.exc;
  const tmp={...nc, E:E.filter(i=>!used.has(i.id)&&!X[i.id]), F:F.filter(i=>!used.has(i.id)&&!X[i.id]), links:[]};
  autoMatch(tmp); nc.links.push(...tmp.links);
  const novosE = ext ? E.length-mE.size : 0, novosF = flow ? F.length-mF.size : 0;
  const remE = ext ? c.E.length-mE.size : 0, remF = c.F.length-mF.size;
  const s0=stats(c), s1=stats(nc);
  return { nc, avisos, novosE, novosF, remE, remF, perdidos, corrigidos, sumiram, autoNovos:tmp.links.length, s0, s1,
    perdManuais: perdidos.filter(l=>["manual","sugestao","interno"].includes(l.tipo)) };
}
function aplicarUpdate(){
  const u=S.upd; if(!u||!u.prev||u.prev.erro) return;
  const p=u.prev, nc=p.nc;
  const reg={ em:new Date().toISOString(), por:nc.responsavel||RESP_PADRAO, extrato:u.ext?u.ext.nome:"", flow:u.flow?u.flow.nome:"",
    novosE:p.novosE, novosF:p.novosF, remE:p.remE, remF:p.remF, perdidos:p.perdidos.length, corrigidos:p.corrigidos.length, autoNovos:p.autoNovos };
  nc.atualizacoes=[...(S.cur.atualizacoes||[]), reg];
  S.cur=nc; reindex(nc); S.upd=null; clearSel();
  const t=[`Arquivos atualizados.`, p.novosE?`${p.novosE} lançamento(s) novos no extrato.`:"", p.novosF?`${p.novosF} novos no Flow.`:"", p.autoNovos?`${p.autoNovos} vínculo(s) automáticos novos.`:"",
    p.corrigidos.length?`${p.corrigidos.length} excluído(s) não estão mais no Flow (corrigidos).`:"", p.perdidos.length?`${p.perdidos.length} vínculo(s) desfeitos porque um dos lançamentos mudou ou saiu do arquivo; os itens voltaram para pendentes.`:""].filter(Boolean).join(" ");
  S.msg={k:p.perdManuais.length?"warn":"ok",t}; S.rendered=null; markDirty(); renderConc(); window.scrollTo({top:0});
}
function updPanelHTML(){
  const u=S.upd, c=S.cur; if(!u) return "";
  const p=u.prev;
  const z=(kind,id,x,label,hint)=>`<label class="drop ${x?"done":""}" data-kind="${kind}"><span class="tagline"><span class="src ${kind==="uext"?"e":"f"}">${kind==="uext"?"EXTRATO":"FLOW"}</span></span>
    ${x?`<b>${esc(x.nome)}</b><span class="small muted">${x.items.length} lançamentos${x.ini?` · ${dBR(x.ini)} a ${dBR(x.fim)}`:""}</span>`:`<b>${label}</b><span class="small muted">${hint}</span>`}<input type="file" id="${id}" accept="${kind==="uext"?".ofx,.pdf,.xlsx,.xls,.csv":".xlsx,.xls,.csv"}"></label>`;
  const d=(a,b)=>{ const x=b-a; return x? `<span class="${x>0?"neg":"pos"}">${x>0?"+":""}${x}</span>`:"="; };
  let pv="";
  if (p && p.erro) pv=`<div class="msg bad">${esc(p.erro)}</div>`;
  else if (p){
    const linhas=[
      ["Lançamentos no extrato", p.s0.nE, p.s1.nE, p.novosE||p.remE?`${p.novosE} novos · ${p.remE} saíram`:""],
      ["Lançamentos no Flow", p.s0.nF, p.s1.nF, u.flow?`${p.novosF} novos · ${p.remF} saíram`:(p.remF?`${p.remF} fora do novo período`:"")],
      ["Pendentes só no extrato", p.s0.pE.length, p.s1.pE.length, ""],
      ["Pendentes só no Flow", p.s0.pF.length, p.s1.pF.length, ""],
      ["Excluídos", p.s0.xE.length+p.s0.xF.length, p.s1.xE.length+p.s1.xF.length, p.corrigidos.length?`${p.corrigidos.length} corrigidos no Flow`:""]];
    pv=`<div class="tbl" style="margin-top:4px"><table><thead><tr><th>Antes × depois</th><th class="r">Antes</th><th class="r">Depois</th><th class="r">Δ</th><th>Detalhe</th></tr></thead><tbody>
      ${linhas.map(r=>`<tr><td>${r[0]}</td><td class="r num">${r[1]}</td><td class="r num">${r[2]}</td><td class="r num">${d(r[1],r[2])}</td><td class="small muted">${r[3]}</td></tr>`).join("")}
      <tr><td><b>Diferença em aberto</b></td><td class="r num">${BRLn(p.s0.aberto)}</td><td class="r num"><b>${BRLn(p.s1.aberto)}</b></td><td></td><td></td></tr></tbody></table></div>
      <div class="small" style="padding:8px 0;display:flex;flex-direction:column;gap:4px">
        <span>Mantidos: ${p.nc.links.length-p.autoNovos} vínculo(s), justificativas e exclusões dos lançamentos que continuam iguais.</span>
        ${p.autoNovos?`<span>Novos vínculos automáticos: ${p.autoNovos}.</span>`:""}
        ${p.perdidos.length?`<span style="color:var(--warn)">${p.perdidos.length} vínculo(s) serão desfeitos${p.perdManuais.length?`, ${p.perdManuais.length} deles feitos à mão`:""}: um dos lançamentos mudou (data, valor ou descrição) ou saiu do arquivo. Os itens voltam para pendentes.</span>`:""}
        ${p.sumiram.length?`<span style="color:var(--warn)">${p.sumiram.length} lançamento(s) excluídos do extrato não estão no novo arquivo.</span>`:""}
        ${p.avisos.map(a=>`<span class="muted">${esc(a)}</span>`).join("")}
      </div>`;
  }
  return `<section class="panel" id="updpanel">
    <div class="phead"><div><h3>Atualizar arquivos da conciliação</h3><div class="small muted">Envie o extrato novo, o relatório do Flow novo ou os dois. O que você já conciliou, justificou ou excluiu é mantido para os lançamentos que continuam iguais.</div></div>
      <button class="btn sm ghost" data-act="updcancel">Fechar</button></div>
    <div style="padding:14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px">
      ${z("uext","fileUExt",u.ext,"Novo extrato","OFX, PDF do banco ou Excel da mesma conta · arraste ou clique")}
      ${z("uflow","fileUFlow",u.flow,"Novo relatório do Flow","Excel do movimento bancário · arraste ou clique")}
    </div>
    ${u.err?`<div class="msg bad" style="margin:0 14px 12px">${esc(u.err)}</div>`:""}
    <div style="padding:0 14px 14px">${pv}
      <div class="actions" style="justify-content:flex-end"><button class="btn ghost" data-act="updcancel">Cancelar</button><button class="btn pri" data-act="updapply" ${p&&!p.erro?"":"disabled"}>Aplicar atualização</button></div></div>
  </section>`;
}
async function abrir(id){
  if (!S.db) return;
  setSave("Abrindo…");
  try{ const snap=await S.db.doc("conciliacoes/"+id).get(); if(!snap.exists){ setSave("Conciliação não encontrada"); return; }
    // Central: ao abrir de novo depois de um conflito, volta a salvar.
    const d=snap.data(); S.upd=null; if (S.conflito){ S.conflito=false; S.writable=S.writable0!==false; } S.cur=unpack(d); clearSel(); S.msg=null; S.tab="conc"; renderAll(); setSave(S.writable?"Aberta":"Somente leitura"); // Central: diretoria vê que é só leitura
    if (d.auto) markDirty();
  }catch(e){ setSave("Não abriu ("+(e.code||"erro")+")"); }
}
async function excluir(id){
  S.delArm=null;
  try{ await S.db.doc("resumos/"+id).delete(); await S.db.doc("conciliacoes/"+id).delete(); if(S.cur&&S.cur.id===id) S.cur=null; }catch(e){ setSave("Não excluiu ("+(e.code||"erro")+")"); }
  renderAll();
}
async function salvarBanco(){
  const g=id=>($("#"+id).value||"").trim();
  const b={nome:g("bNome"),empresa:g("bEmp"),banco:g("bBanco"),nomeFlow:g("bFlow"),conta:g("bConta")};
  if (!b.nome){ $("#bNome").focus(); return; }
  if (!S.db){ setSave("Sem armazenamento disponível"); return; }
  const id = S.bancoEdit && S.bancoEdit!=="new" ? S.bancoEdit : "b"+uid();
  try{ await S.db.doc("bancos/"+id).set(b); S.bancoEdit=null; S.bancoDraft=null; if(S.pend.ext&&!S.pend.bancoId) S.pend.bancoId=id; renderBancos(); }
  catch(e){ setSave(e.code==="invalid_argument"?"Seu acesso não permite cadastrar bancos":"Não salvou o banco ("+(e.code||"erro")+")"); }
}

/* ============ renderização ============ */
function renderAll(){
  document.querySelectorAll(".tab").forEach(t=>t.setAttribute("aria-selected", String(t.dataset.tab===S.tab)));
  $("#view-conc").hidden=S.tab!=="conc"; $("#view-hist").hidden=S.tab!=="hist"; $("#view-bancos").hidden=S.tab!=="bancos";
  if (S.tab==="conc") renderConc(); if (S.tab==="hist") renderHist(); if (S.tab==="bancos") renderBancos();
  renderSelbar();
}
function renderConc(){
  const v=$("#view-conc");
  if (!S.cur){ S.rendered=null; v.innerHTML=importHTML(); renderSelbar(); return; }
  const c=S.cur;
  // posição antes de redesenhar (mesma conciliação): âncora = seção onde o usuário clicou, ou a mesa de conciliação
  let pos=null;
  if (S.rendered===c.id){
    const anc=(S.anchor && document.getElementById(S.anchor)) || $("#bench");
    const bn=$("#bench");
    pos={ id:anc?anc.id:null, top:anc?anc.getBoundingClientRect().top:0, y:window.scrollY, bench:bn?bn.getBoundingClientRect().top:null,
      rows:[...document.querySelectorAll("#bench .rows")].map(r=>r.scrollTop),
      tbls:[...document.querySelectorAll("#view-conc .tbl-scroll")].map(r=>[(r.closest("section[id]")||{}).id,r.scrollTop]) };
  }
  S.rendered=c.id; S.lastFocus=S.focus;
  _renderConcBody(v,c);
  if (pos){
    [...document.querySelectorAll("#bench .rows")].forEach((r,k)=>{ r.scrollTop=pos.rows[k]||0; });
    pos.tbls.forEach(([sid,t])=>{ const r=sid&&document.querySelector("#"+sid+" .tbl-scroll"); if(r) r.scrollTop=t; });
    const a2=pos.id && document.getElementById(pos.id), bn=$("#bench");
    if (a2) window.scrollBy(0, a2.getBoundingClientRect().top-pos.top);
    else if (bn && pos.bench!=null) window.scrollBy(0, bn.getBoundingClientRect().top-pos.bench);
    else window.scrollTo(0,pos.y);
  }
}
function _renderConcBody(v,c){
  v.innerHTML=`
  <section class="ctitle">
    <div style="min-width:0;flex:1"><div class="label">Conciliação · <span class="pill ${situacao(c).cls}" id="sitpill">${situacao(c).txt}</span></div>
      <input type="text" id="titulo" class="titleinput" value="${esc(c.titulo||"")}" placeholder="${esc(tituloPadrao(c))}" aria-label="Título da conciliação" title="Clique para renomear">
      <div class="meta">${esc(c.banco)} · ${dBR(c.ini)} a ${dBR(c.fim)}</div>
      <div class="meta">${esc(c.arquivos.extrato||"")} × ${esc(c.arquivos.flow||"")} · tolerância ${c.tol} dia(s)${(c.atualizacoes||[]).length?` · atualizada ${c.atualizacoes.length}× · última ${new Date(c.atualizacoes[c.atualizacoes.length-1].em).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"})}`:""}</div></div>
    <div class="actions">
      <button class="btn" data-act="updopen" ${S.upd?"disabled":""}>Atualizar arquivos</button>
      <button class="btn" data-act="rematch" title="Refaz o pareamento automático e mantém o que você conciliou à mão">Reprocessar</button>
      <button class="btn" data-act="nova">Nova conciliação</button>
    </div>
  </section>
  ${S.msg?`<div class="msg ${S.msg.k}">${esc(S.msg.t)}</div>`:""}
  ${updPanelHTML()}
  <div id="stats"></div>
  <section class="panel" id="saldos"></section>
  <section id="sugs"></section>
  <section class="bench" id="bench"></section>
  <section class="panel" id="excluidos" hidden></section>
  <section class="panel" id="datasdiv" hidden></section>
  <section class="panel" id="conciliados"></section>
  <section class="panel" id="fechamento"></section>
  <section class="panel" id="relatorio"></section>
  <section class="panel" id="auditoria"></section>`; // Central: histórico de alterações
  renderStats(); renderSaldos(); renderSugs(); renderBench(); renderExcluidos(); renderDatas(); renderConciliados(); renderFechamento(); renderRelatorio(); renderSelbar(); renderAuditoria();
}
// Central: histórico de alterações (quem vinculou, excluiu, justificou, ajustou saldo, fechou, trocou arquivos e quando).
const AUD_ROT={criar:"Criou a conciliação",excluir:"Excluiu",vincular:"Vinculou",desvincular:"Desfez vínculo",excluir_lancamento:"Excluiu lançamento",restaurar_lancamento:"Restaurou lançamento",
  justificar:"Justificou pendente",ajuste_saldo:"Ajuste de saldo",remover_ajuste:"Removeu ajuste de saldo",saldo:"Saldo",fechar:"Fechou",reabrir:"Reabriu",justificativa_fechamento:"Justificativa do não fechamento",
  atualizar_arquivos:"Atualizou arquivos",titulo:"Renomeou",alterar:"Alterou"};
const SALDO_ROT={eI:"inicial do extrato",fI:"inicial do Flow",eF:"final do extrato",fF:"final do Flow"};
async function renderAuditoria(){
  const el=$("#auditoria"); if(!el||!S.cur) return; const c=S.cur;
  if (!S.audOpen){ el.innerHTML=`<div class="phead"><div><h3>Histórico de alterações</h3><div class="small muted">Quem vinculou, excluiu, justificou, ajustou saldo, fechou ou trocou arquivos, e quando.</div></div><button class="btn sm" data-act="audopen">Mostrar</button></div>`; return; }
  el.innerHTML=`<div class="phead"><div><h3>Histórico de alterações</h3></div><button class="btn sm ghost" data-act="audopen">Ocultar</button></div><div class="small muted" style="padding:10px 14px">Carregando…</div>`;
  let L=[]; try{ L=await window.__CONC_AUDITORIA(c.id); }catch(e){ el.querySelector(".small").textContent="Não foi possível carregar o histórico."; return; }
  if (S.cur!==c) return;
  const it=id=>{ if(!id) return ""; const i=id[0]==="e"?itemE(c,id):itemF(c,id); return i?`${id[0]==="e"?"Extrato":"Flow"} ${dShort(i.d)} ${esc(i.h)} ${BRLn(i.v)}`:esc(id); };
  const det=a=>{ const d=a.detalhe||{};
    switch(a.acao){
      case "vincular": case "desvincular": return [...(d.extrato||[]),...(d.flow||[])].map(it).join("<br>")+(d.tipo?` <span class="muted">(${esc(TIPOS[d.tipo]||d.tipo)}${d.dif?`, diferença ${BRLn(d.dif)}`:""}${d.nota?`: ${esc(d.nota)}`:""})</span>`:"");
      case "excluir_lancamento": case "restaurar_lancamento": return it(d.item)+(d.motivo?` <span class="muted">· ${esc(d.motivo)}${d.obs?": "+esc(d.obs):""}</span>`:"");
      case "justificar": return it(d.item)+` <span class="muted">· ${esc(d.motivo||"sem justificativa")}</span>`;
      case "ajuste_saldo": case "remover_ajuste": return `${d.lado==="E"?"Extrato":"Flow"} ${BRLn(d.valor||0)} · ${esc(d.justificativa||"")}`;
      case "saldo": return `${SALDO_ROT[d.campo]||d.campo}: ${d.de!=null?BRLn(d.de):"—"} → ${d.para!=null?BRLn(d.para):"—"}${d.origem?` <span class="muted">(${esc(d.origem)})</span>`:""}`;
      case "fechar": case "justificativa_fechamento": return esc(d.justificativa||d.texto||"");
      case "atualizar_arquivos": return esc([d.extrato,d.flow].filter(Boolean).join(" × "))+` <span class="muted">· ${d.novosE||0} novos no extrato, ${d.novosF||0} no Flow, ${d.perdidos||0} vínculos desfeitos</span>`;
      case "titulo": return `${esc(d.de||"")} → ${esc(d.para||"")}`;
      default: return esc(d.titulo||"");
    } };
  el.innerHTML=`<div class="phead"><div><h3>Histórico de alterações</h3><div class="small muted">${L.length} registro(s)${L.length>=300?" (os 300 mais recentes)":""}</div></div><button class="btn sm ghost" data-act="audopen">Ocultar</button></div>
    <div class="tbl tbl-scroll" style="max-height:420px"><table><thead><tr><th>Quando</th><th>Quem</th><th>O quê</th><th>Detalhe</th></tr></thead><tbody>
    ${L.length?L.map(a=>`<tr><td class="num small" style="white-space:nowrap">${new Date(a.em).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"})}</td><td class="small">${esc(a.por||"")}</td><td class="small">${esc(AUD_ROT[a.acao]||a.acao)}</td><td class="small">${det(a)}</td></tr>`).join(""):`<tr><td colspan="4" class="small muted">Nada registrado ainda. As alterações feitas a partir da Central aparecem aqui.</td></tr>`}
    </tbody></table></div>`;
}
function renderExcluidos(){
  const el=$("#excluidos"); if(!el) return; const c=S.cur, X=c.exc||{}, ids=Object.keys(X);
  el.hidden=!ids.length; if(!ids.length){ el.innerHTML=""; return; }
  const rows=ids.map(id=>({id,i:id[0]==="e"?itemE(c,id):itemF(c,id),x:X[id]})).filter(r=>r.i).sort((a,b)=>a.i.d.localeCompare(b.i.d));
  const tE=sum(rows.filter(r=>r.id[0]==="e").map(r=>r.i.v)), tF=sum(rows.filter(r=>r.id[0]==="f").map(r=>r.i.v));
  el.innerHTML=`<div class="phead"><div><h3>Excluídos da conciliação <span class="muted small">(${rows.length})</span></h3>
    <div class="small muted">Extrato <span class="num">${BRL(tE)}</span> · Flow <span class="num">${BRL(tF)}</span> · aparecem no relatório com o motivo</div></div>
    <div class="actions"><button class="btn sm pri" data-act="expexc" data-fmt="xlsx">Exportar Excel</button><button class="btn sm" data-act="expexc" data-fmt="pdf">Exportar PDF</button><button class="btn sm" data-act="toggleexc">${S.showExc?"Recolher":"Ver lista"}</button></div></div>
  <div class="small muted" id="expmsg" style="padding:0 14px"></div>
  ${S.showExc?`<div class="tbl"><table><thead><tr><th>Origem</th><th>Data</th><th>Lançamento</th><th class="r">Valor</th><th>Motivo</th><th>Registro</th><th></th></tr></thead><tbody>
  ${rows.map(r=>`<tr><td><span class="src ${r.id[0]}">${r.id[0]==="e"?"EXT":"FLOW"}</span></td><td class="num">${dShort(r.i.d)}</td>
    <td><div>${esc(r.i.h)}</div>${r.i.x&&r.i.x!==r.i.h?`<div class="small muted">${esc(r.i.x)}</div>`:""}</td>
    <td class="r num ${r.i.v<0?"neg":""}">${BRLn(r.i.v)}</td>
    <td><b class="small">${esc(r.x.m)}</b>${r.x.o?`<div class="small muted">${esc(r.x.o)}</div>`:""}</td>
    <td class="small muted">${esc(r.x.por||"")}${r.x.em?`<br>${new Date(r.x.em).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"})}`:""}</td>
    <td><button class="btn sm ghost" data-act="restore" data-id="${r.id}">Restaurar</button></td></tr>`).join("")}
  </tbody></table></div>`:""}`;
}
function importHTML(){
  const {ext,flow,bancoId}=S.pend;
  const opts=S.bancos.map(b=>`<option value="${esc(b.id)}" ${b.id===bancoId?"selected":""}>${esc(b.nome)}</option>`).join("");
  const extInfo = ext ? `<b>${esc(ext.nome)}</b><span class="small muted">${ext.items.length} lançamentos · ${dBR(ext.ini)} a ${dBR(ext.fim)}${ext.acct?` · conta ${esc(ext.acct)}`:""}${ext.origemPdf?` · PDF ${esc(ext.origemPdf)} conferido pelos saldos`:""}</span>` : `<b>Extrato do banco</b><span class="small muted">OFX (recomendado), PDF (Sicoob, BB, Cresol, PagueVeloz) ou Excel/CSV · arraste ou clique</span>`;
  const flowInfo = flow ? `<b>${esc(flow.nome)}</b><span class="small muted">${flow.items.length} lançamentos · contas: ${esc(Object.keys(flow.bancos).filter(Boolean).join(", ")||"—")}</span>` : `<b>Movimento bancário do Flow</b><span class="small muted">Excel exportado do Everflow · arraste ou clique</span>`;
  const semConta = ext && !bancoId && ext.acct;
  return `
  <section><div class="label">Nova conciliação</div></section>
  <div class="panel import" style="margin-top:8px">
    <div class="field"><label class="label" for="bancoSel">Conta bancária</label>
      <select id="bancoSel"><option value="">${S.bancos.length?"Escolha a conta…":"Nenhum banco cadastrado"}</option>${opts}</select>
      ${semConta?`<span class="small muted">Conta ${esc(ext.acct)} não cadastrada. <button class="btn sm" data-act="fromofx">Cadastrar</button></span>`:`<span class="small muted">Detectada pelo número da conta no OFX.</span>`}</div>
    <label class="drop ${ext?"done":""}" data-kind="ext"><span class="tagline"><span class="src e">EXTRATO</span></span>${extInfo}<input type="file" id="fileExt" accept=".ofx,.pdf,.xlsx,.xls,.csv"></label>
    <label class="drop ${flow?"done":""}" data-kind="flow"><span class="tagline"><span class="src f">FLOW</span></span>${flowInfo}<input type="file" id="fileFlow" accept=".xlsx,.xls,.csv"></label>
    <div class="go"><label class="tol" for="tol">Tolerância de data <input type="number" id="tol" min="0" max="15" value="${S.tol}"> dias</label>
      <button class="btn pri" data-act="conciliar" ${ext&&flow?"":"disabled"}>Conciliar</button></div>
  </div>
  ${S.msg?`<div class="msg ${S.msg.k}">${esc(S.msg.t)}</div>`:""}
  <section class="panel" style="padding:16px">
    <h3 style="font-size:15px">Como a conciliação funciona</h3>
    <p class="muted small" style="max-width:72ch;margin:6px 0 0">Primeiro pareia lançamentos de mesmo valor e mesma data. Depois aceita a mesma data com até a tolerância de dias. Por fim, quebra os lançamentos agregados do banco (BOLETOS RECEBIDOS, SISPAG, BUSINESS) na soma exata de títulos do Flow do mesmo dia. O que sobrar aparece em duas colunas para você vincular à mão ou justificar, e tudo entra no relatório em PDF.</p>
  </section>
  ${S.resumos.length?`<section><div class="label" style="margin-bottom:8px">Últimas conciliações</div><div class="panel hist">${histRows(S.resumos.slice().sort(ORDENS["upd-desc"][1]).slice(0,4))}</div></section>`:""}`;
}
function renderStats(){
  const el=$("#stats"); if(!el||!S.cur) return; const s=stats(S.cur);
  const pct=s.nE?Math.round(100*s.mE/s.nE):0;
  el.innerHTML=`<div class="stats">
    <div class="stat"><div class="label">Extrato conciliado</div><div class="v">${s.mE} / ${s.nE}</div><div class="bar"><i style="width:${pct}%"></i></div><div class="s">${pct}% · Flow ${s.mF} / ${s.nF}</div></div>
    <div class="stat"><div class="label"><span class="src e">EXT</span> Só no extrato</div><div class="v">${s.pE.length}</div><div class="s num">${BRL(s.vpE)}</div></div>
    <div class="stat"><div class="label"><span class="src f">FLOW</span> Só no Flow</div><div class="v">${s.pF.length}</div><div class="s num">${BRL(s.vpF)}</div></div>
    <div class="stat"><div class="label">Diferença em aberto</div><div class="v ${s.aberto===0?"pos":"neg"}">${BRL(s.aberto)}</div><div class="s">Bruta ${BRL(s.dif)}${s.xE.length+s.xF.length?` · ${s.xE.length+s.xF.length} excluído(s)`:""}</div><div class="s">${s.semMotivo?`<span class="pill warn">${s.semMotivo} sem justificativa</span>`:`<span class="pill ok">Todas justificadas</span>`}</div></div>
  </div>`;
}
function renderSaldos(){
  const el=$("#saldos"); if(!el||!S.cur) return; const c=S.cur, s=stats(c), r=saldos(c,s), o=r.origem;
  const ajCell=(lado,tot)=>`<div class="ajcell">${tot?`<span class="num">${BRLn(tot)}</span>`:`<span class="muted">—</span>`}<button class="btn sm ghost" data-act="ajadd" data-lado="${lado}" title="Ajustar o saldo calculado com justificativa">+ ajuste</button></div>`;
  const inp=(id,v,orig)=>`<input type="text" inputmode="decimal" class="num sd" id="${id}" value="${v!=null?BRLn(v):""}" placeholder="informar" title="${orig?"Preenchido a partir de: "+esc(orig):""}">${orig?`<div class="small muted">${esc(orig)}</div>`:""}`;
  const v=x=>x==null?`<span class="muted">—</span>`:BRLn(x);
  const chk=x=>x==null?`<span class="muted small">informe os dois saldos</span>`:x===0?`<span class="pill ok">Fecha</span>`:`<span class="pill bad">Dif. ${BRLn(x)}</span>`;
  const dI=diaAntes(c.ini);
  const ym=String(c.fim).slice(0,7), ant=resumoDoMes(c.bancoId,ymMais(ym,-1),c.id), prx=resumoDoMes(c.bancoId,ymMais(ym,1),c.id);
  const eAnt=elo(saldosDoResumo(ant),{iE:r.eI,iF:r.fI}), eNx=prx?elo({fE:r.eF,fF:r.fF},saldosDoResumo(prx)):null;
  const meu=S.resumos.find(x=>x.id===c.id), rev=meu&&meu.revisar;
  const dTxt=e=>[e.dE?`extrato ${BRL(e.dE)}`:"",e.dF?`Flow ${BRL(e.dF)}`:""].filter(Boolean).join(" · ");
  const encHTML=`<div class="enc">
    ${rev?`<div class="encrev"><b>Revisar:</b> o saldo inicial foi atualizado a partir de "${esc(rev.de)}" em ${new Date(rev.em).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"})}${rev.dE||rev.dF?` (variação: ${[rev.dE?"extrato "+BRL(rev.dE):"",rev.dF?"Flow "+BRL(rev.dF):""].filter(Boolean).join(" · ")})`:""}. Confira saldos e fechamento. <button class="btn sm" data-act="revok">Marcar como revisado</button></div>`:""}
    <div class="encrow"><span class="label">← ${ymNome(ymMais(ym,-1))}</span>
      ${!ant?`<span class="small muted">sem conciliação salva</span>`
      : eAnt&&eAnt.ok&&!eAnt.incompleto?`<span class="pill ok">Encadeado</span><span class="small muted">final de ${ymNome(ymMais(ym,-1))} = inicial deste mês</span>`
      : eAnt&&!eAnt.ok?`<span class="pill bad">Não encadeia</span><span class="small">inicial deste mês difere do final de ${ymNome(ymMais(ym,-1))}: ${dTxt(eAnt)}</span><button class="btn sm" data-act="puxarant">Usar saldo final de ${ymNome(ymMais(ym,-1))}</button><button class="btn sm ghost" data-act="open" data-id="${esc(ant.id)}">Abrir ${ymNome(ymMais(ym,-1))}</button>`
      : `<span class="small muted">saldos incompletos para comparar</span>${ant.sFinE!=null||ant.sFinF!=null?`<button class="btn sm" data-act="puxarant">Usar saldo final de ${ymNome(ymMais(ym,-1))}</button>`:""}`}</div>
    <div class="encrow"><span class="label">${ymNome(ymMais(ym,1))} →</span>
      ${!prx?`<span class="small muted">sem conciliação salva</span>`
      : eNx&&eNx.ok&&!eNx.incompleto?`<span class="pill ok">Encadeado</span><span class="small muted">final deste mês = inicial de ${ymNome(ymMais(ym,1))}</span>`
      : `<span class="pill ${eNx&&!eNx.ok?"bad":"neu"}">${eNx&&!eNx.ok?"Não encadeia":"Incompleto"}</span><span class="small">${eNx&&!eNx.ok?`inicial de ${ymNome(ymMais(ym,1))} difere do final deste mês: ${dTxt({dE:eNx.dE==null?null:-eNx.dE,dF:eNx.dF==null?null:-eNx.dF})}`:"saldos incompletos para comparar"}${FECHADAS.has(prx.status)?` · ${ymNome(ymMais(ym,1))} está fechada`:""}</span><button class="btn sm" data-act="enviarprox">Atualizar ${ymNome(ymMais(ym,1))} com estes saldos</button>`}</div>
    <label class="small enctog"><input type="checkbox" id="autoenc" ${S.cfg&&S.cfg.autoEnc?"checked":""}> Atualizar automaticamente o saldo inicial do mês seguinte quando os saldos finais mudarem (vale para todas as contas)</label>
    <span class="small muted" id="encmsg"></span>
  </div>`;
  el.innerHTML=`<div class="phead"><div><h3>Saldos</h3><div class="small muted">Saldo inicial = fechamento de ${dBR(dI)} · saldo final = fechamento de ${dBR(c.fim)}</div></div>
    ${r.difF!=null?(r.difF===0?`<span class="pill ok">Saldos finais iguais</span>`:`<span class="pill warn">Saldos finais diferem em ${BRL(r.difF)}</span>`):""}</div>
  <div class="tbl"><table class="sdt"><thead><tr><th></th><th class="r">Saldo inicial</th><th class="r">Movimento do mês</th><th class="r">Ajustes</th><th class="r">Final calculado</th><th class="r">Final informado</th><th>Conferência</th></tr></thead><tbody>
    <tr><td><span class="src e">EXTRATO</span></td><td class="r">${inp("sd_eI",r.eI,o.eI)}</td><td class="r num">${BRLn(s.liqE)}</td><td class="r">${ajCell("E",r.ajE)}</td><td class="r num">${v(r.eFc)}</td><td class="r">${inp("sd_eF",r.eFi,o.eF)}</td><td>${chk(r.chkE)}</td></tr>
    <tr><td><span class="src f">FLOW</span></td><td class="r">${inp("sd_fI",r.fI,o.fI)}</td><td class="r num">${BRLn(s.liqF)}</td><td class="r">${ajCell("F",r.ajF)}</td><td class="r num">${v(r.fFc)}</td><td class="r">${inp("sd_fF",r.fFi,o.fF)}</td><td>${chk(r.chkF)}</td></tr>
    <tr class="sdtot"><td><b>Extrato − Flow</b></td><td class="r num"><b>${v(r.difI)}</b></td><td class="r num"><b>${BRLn(s.dif)}</b></td><td class="r num">${r.ajE||r.ajF?BRLn(r.ajE-r.ajF):"—"}</td><td class="r num">${r.eFc!=null&&r.fFc!=null?BRLn(r.eFc-r.fFc):"—"}</td><td class="r num"><b>${v(r.difF)}</b></td><td></td></tr>
  </tbody></table></div>
  ${S.ajForm?`<div class="ajform"><span class="src ${S.ajForm==="E"?"e":"f"}">${S.ajForm==="E"?"EXTRATO":"FLOW"}</span>
      <label class="small" for="aj_v">Valor do ajuste</label><input type="text" inputmode="decimal" id="aj_v" class="num" placeholder="-8.750,00">
      <input type="text" id="aj_j" placeholder="Justificativa (obrigatória). Ex.: cheque 001055 depositado em 30/09, bloqueado, compensado em 01/10" style="flex:1;min-width:220px">
      <button class="btn ghost" data-act="ajcancel">Cancelar</button><button class="btn pri" data-act="ajsave">Adicionar ajuste</button>
      <div class="small muted" id="ajmsg" style="flex-basis:100%">Valor com sinal: negativo reduz o saldo calculado, positivo aumenta.</div></div>`:""}
  ${r.aj.length?`<div class="ajlist"><div class="label" style="padding:10px 14px 4px">Ajustes de saldo</div><div class="tbl"><table><tbody>
    ${r.aj.map(a=>`<tr><td style="width:80px"><span class="src ${a.lado==="E"?"e":"f"}">${a.lado==="E"?"EXTRATO":"FLOW"}</span></td><td class="r num" style="width:130px">${BRLn(a.v)}</td><td>${esc(a.j)}<div class="small muted">${esc(a.por||"")}${a.em?" · "+new Date(a.em).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"}):""}</div></td><td class="r" style="width:90px"><button class="btn sm ${S.delArm==="aj"+a.id?"danger":"ghost"}" data-act="ajdel" data-id="${esc(a.id)}">${S.delArm==="aj"+a.id?"Confirmar":"Remover"}</button></td></tr>`).join("")}
  </tbody></table></div></div>`:""}
  ${r.ponte?`<div class="ponte"><div class="label" style="padding:12px 14px 6px">Do saldo do extrato ao saldo do Flow</div><div class="tbl"><table><tbody>
    ${r.ponte.filter((x,i)=>i===0||x[1]).map(x=>`<tr><td>${x[2]?"<b>"+x[0]+"</b>":x[0]}</td><td class="r num">${x[2]?"<b>"+BRLn(x[1])+"</b>":BRLn(x[1])}</td></tr>`).join("")}
    <tr class="sdtot"><td><b>= Saldo do Flow explicado</b></td><td class="r num"><b>${BRLn(r.ajustado)}</b></td></tr>
    <tr><td>Saldo final do Flow</td><td class="r num">${BRLn(r.fF)}</td></tr>
    <tr><td><b>Diferença não explicada</b></td><td class="r num">${r.naoExpl===0?`<span class="pill ok">0,00</span>`:`<span class="pill bad">${BRLn(r.naoExpl)}</span>`}</td></tr>
  </tbody></table></div>
  ${r.naoExpl!==0?`<div class="small" style="padding:0 14px 12px;color:var(--bad)">Algum saldo informado não corresponde aos lançamentos dos arquivos. Veja a coluna Conferência: o extrato ou o relatório do Flow pode estar incompleto, ou o saldo foi digitado errado.</div>`:""}</div>`
  :`<div class="small muted" style="padding:10px 14px 14px">Informe o saldo inicial do extrato e do Flow para comparar os saldos finais. O saldo final do Flow vem do relatório de saldos do Flow; o do extrato, do próprio banco.</div>`}${encHTML}`;
}
function itemLine(c,id){ const i=id[0]==="e"?itemE(c,id):itemF(c,id); return `<span class="side"><span class="num">${dShort(i.d)}</span> <span class="t">${esc(i.h)}</span> <span class="num ${i.v<0?"neg":""}">${BRLn(i.v)}</span></span>`; }
function renderSugs(){
  const el=$("#sugs"); if(!el) return; const c=S.cur, L=suggestions(c);
  if (!L.length){ el.innerHTML=""; return; }
  const auto=L.filter(s=>s.tipo!=="data").length;
  el.innerHTML=`<div class="panel"><div class="phead"><h3>Sugestões para revisar <span class="muted small">(${L.length})</span></h3>${auto>1?`<button class="btn sm" data-act="accall">Aceitar todas as somas exatas</button>`:""}</div>
  <div class="sugs">${L.map(s=>`<div class="sug"><span class="kind">${esc(s.txt)}</span>
    <div class="sides">${s.e.map(id=>`<span class="src e">EXT</span>${itemLine(c,id)}`).join(" ")}${s.e.length&&s.f.length?`<span class="eq">=</span>`:""}${s.f.map(id=>`<span class="src f">FLOW</span>${itemLine(c,id)}`).join(" ")}</div>
    <div class="actions"><button class="btn sm pri" data-act="acc" data-key="${esc(s.key)}">Conciliar</button><button class="btn sm ghost" data-act="ign" data-key="${esc(s.key)}">Ignorar</button></div></div>`).join("")}</div></div>`;
}
function score(a,b){
  let s=0; const av=Math.abs(a.v), bv=Math.abs(b.v);
  if (Math.sign(a.v)!==Math.sign(b.v)) return -1;
  if (av===bv) s+=60; else if (Math.abs(av-bv)/Math.max(av,1)<=0.02) s+=25;
  s+=Math.max(0,20-5*Math.abs(dayDiff(a.d,b.d)));
  const ta=toks(a.h+" "+(a.x||"")), tb=toks(b.h+" "+(b.x||"")); let n=0; ta.forEach(w=>{ if(tb.has(w)) n++; });
  s+=Math.min(30,n*12);
  return s;
}
function renderBench(){
  const el=$("#bench"); if(!el) return; const c=S.cur, {mE,mF}=maps(c), dup=dupFlow(c);
  const focusItem=S.focus?(S.focus[0]==="e"?itemE(c,S.focus):itemF(c,S.focus)):null;
  const col=(side)=>{
    const isE=side==="E", X=c.exc||{}, list=(isE?c.E:c.F).filter(i=>!(isE?mE:mF).has(i.id)&&!X[i.id]);
    const q=norm(isE?S.fE:S.fF), sel=isE?S.selE:S.selF;
    let rows=list.filter(i=>!q||norm(i.h+" "+(i.x||"")+" "+BRLn(i.v)+" "+dBR(i.d)).includes(q));
    let sc=new Map();
    if (focusItem && (focusItem.id[0]==="e")!==isE && !sel.size){ rows.forEach(i=>sc.set(i.id,score(focusItem,i))); rows.sort((a,b)=>sc.get(b.id)-sc.get(a.id)||a.d.localeCompare(b.d)); }
    const tot=sum(list.map(i=>i.v));
    return `<div class="panel col">
      <div class="phead"><div class="t"><span class="src ${isE?"e":"f"}">${isE?"EXTRATO":"FLOW"}</span><h3>${isE?"Só no extrato":"Só no Flow"}</h3><span class="muted small">${list.length} · <span class="num">${BRL(tot)}</span></span></div>
        <input type="text" class="search" id="${isE?"fE":"fF"}" placeholder="Filtrar nome, valor, data" value="${esc(isE?S.fE:S.fF)}"></div>
      <div class="rows">${rows.length?rows.map(i=>{
        const m=c.mot[i.id]||{}, s=sc.get(i.id)||0;
        return `<div class="row ${sel.has(i.id)?"sel":""} ${S.focus===i.id?"focus":""}" data-act="pick" data-id="${i.id}" data-side="${side}">
          <input type="checkbox" tabindex="-1" ${sel.has(i.id)?"checked":""} aria-label="Selecionar">
          <span class="d">${dShort(i.d)}</span>
          <div class="h"><div class="t1">${esc(i.h)}${s>=60?`<span class="badge prov">provável</span>`:""}${!isE&&dup.has(i.id)?`<span class="badge dup">possível duplicidade</span>`:""}</div>${!isE&&dup.has(i.id)?`<div class="t2 dupnote">Igual a "${esc(itemF(c,dup.get(i.id)).h)}"${mF.has(dup.get(i.id))?", já conciliado":""} · <button class="btn sm" data-act="excdup" data-id="${i.id}">Excluir como duplicidade</button></div>`:""}${i.x&&i.x!==i.h?`<div class="t2" title="${esc(i.x)}">${esc(i.x)}</div>`:""}</div>
          <span class="val num ${i.v<0?"neg":""}">${BRLn(i.v)}</span>
          <div class="why"><select data-mot="${i.id}" aria-label="Motivo"><option value="">Justificativa…</option>${MOTIVOS.map(o=>`<option ${m.m===o?"selected":""}>${o}</option>`).join("")}</select>
            <input type="text" data-obs="${i.id}" placeholder="Observação" value="${esc(m.o||"")}" aria-label="Observação"></div>
        </div>`;}).join(""):`<div class="empty">${list.length?"Nada com esse filtro.":"Tudo conciliado deste lado."}</div>`}</div></div>`;
  };
  const keep = document.activeElement && (document.activeElement.id==="fE"||document.activeElement.id==="fF") ? document.activeElement.id : null;
  const pos = keep ? document.activeElement.selectionStart : 0;
  const scroll=[...el.querySelectorAll(".rows")].map(r=>r.scrollTop);
  const novoFoco = S.focus && S.focus!==S.lastFocus; S.lastFocus=S.focus;
  // lista oposta volta ao topo só quando é reordenada (novo item em foco e nada marcado nela ainda)
  const oposta = novoFoco && !(S.focus[0]==="e" ? S.selF.size : S.selE.size) ? (S.focus[0]==="e" ? 1 : 0) : -1;
  const y=window.scrollY;
  el.innerHTML=col("E")+col("F");
  [...el.querySelectorAll(".rows")].forEach((r,k)=>{ r.scrollTop = k===oposta ? 0 : (scroll[k]||0); });
  if (Math.abs(window.scrollY-y)>1) window.scrollTo(0,y);
  if (keep){ const i=$("#"+keep); i.focus(); try{i.setSelectionRange(pos,pos);}catch(_){} }
}
function renderSelbar(){
  const bar=$("#selbar"); const n=S.selE.size+S.selF.size;
  if (!S.cur||S.tab!=="conc"||!n){ bar.hidden=true; return; }
  const c=S.cur, se=sum([...S.selE].map(id=>itemE(c,id).v)), sf=sum([...S.selF].map(id=>itemF(c,id).v));
  const single=!S.selE.size||!S.selF.size, dif=single?(S.selE.size?se:sf):se-sf;
  bar.hidden=false;
  bar.innerHTML=`<div class="wrap">
    <div class="grp"><span class="src e">EXT</span><span>${S.selE.size}</span><span class="num">${BRL(se)}</span></div>
    <div class="grp"><span class="src f">FLOW</span><span>${S.selF.size}</span><span class="num">${BRL(sf)}</span></div>
    <div class="grp"><span class="muted">${single?"Soma":"Diferença"}</span><span class="num dif ${dif===0?"zero":"nz"}">${BRL(dif)}</span></div>
    <span class="sp"></span>
    ${dif!==0?`<input type="text" id="selnota" placeholder="Motivo da diferença (obrigatório)">`:""}
    <button class="btn ghost" data-act="clearsel">Limpar</button>
    ${S.excOpen?"":`<button class="btn danger" data-act="excopen">Excluir da conciliação</button>`}
    <button class="btn pri" id="btnLink" data-act="link" ${single&&dif!==0?"disabled":""}>Conciliar seleção</button></div>
    ${S.excOpen?`<div class="wrap excrow"><span class="small"><b>Excluir ${n} lançamento(s).</b> Ficam fora da conciliação e aparecem no relatório.</span>
      <select id="excmot" aria-label="Motivo da exclusão"><option value="">Motivo (obrigatório)…</option>${EXC_MOT.map(m=>`<option>${m}</option>`).join("")}</select>
      <input type="text" id="excobs" placeholder="Observação">
      <span class="sp"></span><button class="btn ghost" data-act="clearsel">Cancelar</button><button class="btn danger" data-act="excsel">Confirmar exclusão</button></div>`:""}`;
  renderSelbarState();
}
function renderSelbarState(){ /* botão já reflete estado; nota é validada no clique */ }
function renderConciliados(){
  const el=$("#conciliados"); if(!el) return; const c=S.cur, s=stats(c);
  const q=norm(S.concFiltro);
  const tipoTxt=Object.entries(s.byTipo).map(([k,v])=>`${TIPOS[k]||k}: ${v.n}`).join(" · ");
  let body="";
  if (S.showConc){
    const L=c.links.map(l=>({l, e:l.e.map(id=>itemE(c,id)), f:l.f.map(id=>itemF(c,id))}))
      .filter(r=>!q||norm([...r.e,...r.f].map(i=>i.h+" "+(i.x||"")+" "+BRLn(i.v)+" "+dBR(i.d)).join(" ")+" "+(TIPOS[r.l.tipo]||"")).includes(q))
      .sort((a,b)=>((a.e[0]||a.f[0]).d).localeCompare((b.e[0]||b.f[0]).d));
    body=`<div class="tbl tbl-scroll"><table><thead><tr><th>Data</th><th>Extrato</th><th class="r">Valor</th><th>Flow</th><th class="r">Valor</th><th>Tipo</th><th></th></tr></thead><tbody>
    ${L.map(r=>`<tr><td class="num">${dShort((r.e[0]||r.f[0]).d)}</td>
      <td><div class="stack">${r.e.map(i=>`<div>${esc(i.h)}</div>`).join("")||"<span class='muted'>—</span>"}</div></td>
      <td class="r"><div class="stack">${r.e.map(i=>`<div class="num">${BRLn(i.v)}</div>`).join("")}</div></td>
      <td><div class="stack">${r.f.map(i=>`<div>${dShort(i.d)!==dShort((r.e[0]||r.f[0]).d)?`<span class="num muted">${dShort(i.d)}</span> `:""}${esc(i.h)}</div>`).join("")||"<span class='muted'>—</span>"}</div></td>
      <td class="r"><div class="stack">${r.f.map(i=>`<div class="num">${BRLn(i.v)}</div>`).join("")}</div></td>
      <td><span class="tipo">${TIPOS[r.l.tipo]||r.l.tipo}</span>${r.l.dif?`<div class="small warn" style="color:var(--warn)">dif. ${BRLn(r.l.dif)}</div>`:""}${r.l.nota&&r.l.tipo!=="sugestao"?`<div class="small muted">${esc(r.l.nota)}</div>`:""}</td>
      <td><button class="btn sm ghost" data-act="undo" data-id="${r.l.id}">Desfazer</button></td></tr>`).join("")}
    </tbody></table></div>`;
  }
  const keep=document.activeElement&&document.activeElement.id==="concFiltro";
  el.innerHTML=`<div class="phead"><div><h3>Conciliados <span class="muted small">(${c.links.length} vínculos · ${s.mE} do extrato · ${s.mF} do Flow)</span></h3><div class="small muted">${tipoTxt}</div></div>
    <div class="actions">${S.showConc?`<input type="text" id="concFiltro" placeholder="Filtrar" value="${esc(S.concFiltro)}">`:""}<button class="btn sm" data-act="toggleconc">${S.showConc?"Recolher":"Ver lista"}</button></div></div>${body}`;
  if (keep){ const i=$("#concFiltro"); i.focus(); i.setSelectionRange(i.value.length,i.value.length); }
}
function atualizaPill(){ const p=$("#sitpill"); if(p&&S.cur){ const x=situacao(S.cur); p.className="pill "+x.cls; p.textContent=x.txt; } }
function renderFechamento(){
  const el=$("#fechamento"); if(!el||!S.cur) return; const c=S.cur, s=stats(c), sit=situacao(c,s), rs=saldos(c,s);
  const pend=[];
  if (s.pE.length) pend.push(`${s.pE.length} lançamento(s) só no extrato (${BRL(s.vpE)})`);
  if (s.pF.length) pend.push(`${s.pF.length} lançamento(s) só no Flow (${BRL(s.vpF)})`);
  if (s.semMotivo) pend.push(`${s.semMotivo} pendente(s) sem justificativa individual`);
  if (s.difManual) pend.push(`diferenças aceitas em vínculos manuais: ${BRL(s.difManual)}`);
  if (rs.difF) pend.push(`saldos finais diferem em ${BRL(rs.difF)}`);
  if (rs.naoExpl) pend.push(`diferença de saldo não explicada: ${BRL(rs.naoExpl)}`);
  const f=c.fech;
  el.innerHTML=`<div class="phead"><div><h3>Fechamento da conciliação</h3><div class="small muted">Situação atual: <span class="pill ${sit.cls}">${sit.txt}</span></div></div></div>
  <div class="fech">
    <div><div class="label">O que impede o fechamento</div>${pend.length?`<ul>${pend.map(p=>`<li>${esc(p)}</li>`).join("")}</ul>`:`<div class="small" style="margin-top:6px;color:var(--ok)">Nada. A conciliação fecha sem pendências.</div>`}</div>
    <div class="field"><label class="label" for="justif">Justificativa do não fechamento</label>
      <textarea id="justif" rows="3" placeholder="Explique por que a conciliação não fecha ou foi fechada com diferença. Ex.: SISPAG de 28/07 com diferença de R$ 4,10 em apuração com o banco.">${esc(c.justif||"")}</textarea>
      <span class="small muted">Vai para o relatório da diretoria e aparece no Histórico.</span></div>
    <div class="field" style="min-width:200px">${f&&f.manual?`<div class="fechbox"><b>Fechada manualmente</b><br>${esc(f.por||"")}${f.em?` · ${new Date(f.em).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"})}`:""}</div><button class="btn" data-act="reabrir">Reabrir</button>`
      :`<button class="btn pri" data-act="fechar">Marcar como fechada</button><span class="small muted" id="fechmsg">${pend.length?"Com pendências, a justificativa é obrigatória.":""}</span>`}</div>
  </div>`;
}
function renderRelatorio(){
  const el=$("#relatorio"); if(!el) return; const c=S.cur;
  el.innerHTML=`<div class="phead"><h3>Relatório para a diretoria</h3><span class="small muted">PDF com objetivo, dados, análise, conclusão e anexo dos conciliados</span></div>
  <div class="rep">
    <div class="field"><label class="label" for="resp">Responsável</label><input type="text" id="resp" value="${esc(c.responsavel||"")}" placeholder="Nome de quem conciliou"></div>
    <div class="field"><label class="label" for="concl">Conclusão / observações</label><textarea id="concl" rows="2" placeholder="Ex.: diferenças de rendimento serão lançadas no Flow; duplicidades estornadas em 16/10.">${esc(c.conclusao||"")}</textarea></div>
    <div class="field"><button class="btn pri" data-act="pdf">Gerar PDF</button><span class="small muted" id="pdfmsg"></span></div>
  </div>
  ${Object.keys(c.exc||{}).length?`<div class="small muted" style="padding:0 16px 14px;display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center">
    <span>Os ${Object.keys(c.exc).length} lançamento(s) excluídos não entram neste relatório; os números consideram o Flow já corrigido.</span>
    <label style="display:inline-flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" id="notaExc" ${c.notaExc?"checked":""}> Citar a quantidade e o total excluído em uma linha</label></div>`:""}`;
}
const SIT={manual:["ok","Fechada manualmente"],conciliada:["ok","Conciliada"],justificada:["neu","Fechada com justificativas"],andamento:["warn","Em andamento"]};
const sitResumo = r => r.status && SIT[r.status] ? r.status : (r.pE+r.pF===0 ? "conciliada" : r.fechada ? "justificada" : "andamento");
const tituloResumo = r => r.titulo || `${r.banco} · ${MESES[+String(r.fim).slice(5,7)-1]}/${String(r.fim).slice(0,4)}`;
const ORDENS={ "fim-desc":["Período (mais recente)",(a,b)=>String(b.fim).localeCompare(String(a.fim))||tituloResumo(a).localeCompare(tituloResumo(b),"pt-BR")],
  "fim-asc":["Período (mais antigo)",(a,b)=>String(a.fim).localeCompare(String(b.fim))||tituloResumo(a).localeCompare(tituloResumo(b),"pt-BR")],
  "nome-asc":["Nome (A–Z)",(a,b)=>tituloResumo(a).localeCompare(tituloResumo(b),"pt-BR",{numeric:true})||String(b.fim).localeCompare(String(a.fim))],
  "nome-desc":["Nome (Z–A)",(a,b)=>tituloResumo(b).localeCompare(tituloResumo(a),"pt-BR",{numeric:true})],
  "upd-desc":["Última alteração",(a,b)=>String(b.atualizadoEm).localeCompare(String(a.atualizadoEm))] };
try{ S.hsort=localStorage.getItem("conc_hsort")||"fim-desc"; }catch(_){ S.hsort="fim-desc"; }
if (!ORDENS[S.hsort]) S.hsort="fim-desc";
function histRows(list){
  return list.map(r=>{
    const sk=sitResumo(r), st=`<span class="pill ${SIT[sk][0]}">${SIT[sk][1]}</span>${r.revisar?` <span class="pill warn">Revisar</span>`:""}`;
    const ym=String(r.fim).slice(0,7), ant=resumoDoMes(r.bancoId,ymMais(ym,-1),r.id), e=elo(saldosDoResumo(ant),saldosDoResumo(r));
    const encTxt = e && !e.ok ? `<div class="jf">Não encadeia com ${ymNome(ymMais(ym,-1))}: ${[e.dE?"extrato "+BRL(e.dE):"",e.dF?"Flow "+BRL(e.dF):""].filter(Boolean).join(" · ")}</div>` : "";
    return `<div class="row2"><div><div class="tt">${esc(tituloResumo(r))}</div><div class="small muted">${esc(r.banco)} · ${dBR(r.ini)} a ${dBR(r.fim)} · atualizada ${r.atualizadoEm?new Date(r.atualizadoEm).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"}):""}</div>${r.justif?`<div class="jf">Justificativa: ${esc(r.justif)}</div>`:""}${encTxt}</div>
      <div class="small">${r.mE}/${r.nE} do extrato · ${r.pE+r.pF} pendentes<br><span class="num ${(r.aberto??r.dif)?"neg":"pos"}">em aberto ${BRL(r.aberto??r.dif)}</span>${r.nExc?` · ${r.nExc} excluído(s)`:""}</div>
      <div>${st}</div>
      <button class="btn sm" data-act="open" data-id="${esc(r.id)}">Abrir</button>
      <button class="btn sm ${S.delArm===r.id?"danger":"ghost"}" data-act="del" data-id="${esc(r.id)}">${S.delArm===r.id?"Confirmar exclusão":"Excluir"}</button></div>`;}).join("");
}
function renderHist(){
  const v=$("#view-hist");
  const fs=S.hsit||"", L=listaHist();
  v.innerHTML=`<section><div class="label">Histórico</div><h2 style="font-size:22px;margin-top:2px">Conciliações salvas</h2>
    <div class="histbar"><span class="small muted">${L.length} de ${S.resumos.length}${L.length?` · <button class="btn sm pri" data-act="exphist" style="margin-left:8px">Exportar resumo em PDF</button> <button class="btn sm" data-act="exphistx">Exportar planilha</button>`:""} <span id="histmsg"></span></span>
      <div class="ctl"><input type="text" id="hq" placeholder="Buscar título, banco ou mês" value="${esc(S.hq||"")}">
        ${/* Central: filtros por conta e por mês (o PDF e a planilha saem com o filtro) */""}<select id="hbanco" aria-label="Filtrar por conta"><option value="">Todas as contas</option>${[...new Map(S.resumos.map(r=>[r.bancoId,r.banco])).entries()].sort((a,b)=>String(a[1]).localeCompare(String(b[1]))).map(([id,n])=>`<option value="${esc(id)}" ${S.hbanco===id?"selected":""}>${esc(n)}</option>`).join("")}</select>
        <select id="hmes" aria-label="Filtrar por mês"><option value="">Todos os meses</option>${[...new Set(S.resumos.map(r=>String(r.fim).slice(0,7)))].sort().reverse().map(m=>`<option value="${m}" ${S.hmes===m?"selected":""}>${ymNome(m)}</option>`).join("")}</select>
        <select id="hsit" aria-label="Filtrar por situação"><option value="">Todas as situações</option>${Object.entries(SIT).map(([k,v])=>`<option value="${k}" ${fs===k?"selected":""}>${v[1]}</option>`).join("")}</select>
        <select id="hsort" aria-label="Ordenar">${Object.entries(ORDENS).map(([k,v])=>`<option value="${k}" ${S.hsort===k?"selected":""}>${v[0]}</option>`).join("")}</select></div></div></section>
  ${faltasHTML()}
  ${(()=>{ const Q=quebrasEncadeamento(); if(!Q.length) return ""; return `<section class="panel" style="padding:12px 16px"><div class="label" style="color:var(--bad)">${Q.length} quebra(s) de encadeamento de saldo</div>
    <div class="small" style="margin-top:6px;display:flex;flex-direction:column;gap:4px">${Q.map(q=>`<div class="fjrow"><span><b>${esc(q.cur.banco)}</b>: final de ${ymNome(String(q.ant.fim).slice(0,7))} → inicial de ${ymNome(String(q.cur.fim).slice(0,7))} · ${[q.dE?"extrato "+BRL(q.dE):"",q.dF?"Flow "+BRL(q.dF):""].filter(Boolean).join(" · ")}</span><button class="btn sm" data-act="open" data-id="${esc(q.cur.id)}">Abrir ${ymNome(String(q.cur.fim).slice(0,7))}</button></div>`).join("")}</div></section>`; })()}
  <section class="panel hist">${L.length?histRows(L):`<div class="empty">${!S.resumos.length?(S.db?"Nenhuma conciliação salva ainda. Elas aparecem aqui assim que você concilia.":"O armazenamento não está disponível nesta visualização."):"Nenhuma conciliação com esse filtro."}</div>`}</section>`;
}
function renderBancos(){
  const v=$("#view-bancos"); const ed=S.bancoEdit;
  const cur = ed && ed!=="new" ? S.bancos.find(b=>b.id===ed)||{} : (S.bancoDraft||{});
  v.innerHTML=`<section><div class="label">Cadastro</div><h2 style="font-size:22px;margin-top:2px">Contas bancárias</h2>
    <p class="muted small" style="max-width:72ch;margin:4px 0 0">"Nome no Flow" é o texto exato da coluna Banco no relatório de movimento (ex.: Itaú - Energia). "Conta no OFX" é o número que vem no extrato e serve para reconhecer a conta sozinho.</p></section>
  <section class="panel">
    <div class="bform">
      <div class="field"><label class="label" for="bNome">Nome da conta</label><input type="text" id="bNome" value="${esc(cur.nome||"")}" placeholder="Itaú da Mobi"></div>
      <div class="field"><label class="label" for="bEmp">Empresa</label><input type="text" id="bEmp" value="${esc(cur.empresa||"")}" placeholder="LZ7 Mobi"></div>
      <div class="field"><label class="label" for="bBanco">Banco</label><input type="text" id="bBanco" value="${esc(cur.banco||"")}" placeholder="Itaú"></div>
      <div class="field"><label class="label" for="bFlow">Nome no Flow</label><input type="text" id="bFlow" value="${esc(cur.nomeFlow||"")}" placeholder="Itaú - Mobi"></div>
      <div class="field"><label class="label" for="bConta">Conta no OFX</label><input type="text" id="bConta" value="${esc(cur.conta||"")}" placeholder="Agência + conta"></div>
      <div class="actions">${ed?`<button class="btn ghost" data-act="bcancel">Cancelar</button>`:""}<button class="btn pri" data-act="bsave">${ed&&ed!=="new"?"Salvar alterações":"Adicionar conta"}</button></div>
    </div>
    <div class="tbl"><table><thead><tr><th>Conta</th><th>Empresa</th><th>Banco</th><th>Nome no Flow</th><th>Conta no OFX</th><th></th></tr></thead><tbody>
    ${S.bancos.length?S.bancos.map(b=>`<tr><td><b>${esc(b.nome)}</b></td><td>${esc(b.empresa||"")}</td><td>${esc(b.banco||"")}</td><td>${esc(b.nomeFlow||"")}</td><td class="num">${esc(b.conta||"")}</td>
      <td class="r"><button class="btn sm ghost" data-act="bedit" data-id="${esc(b.id)}">Editar</button> <button class="btn sm ${S.delArm==="b"+b.id?"danger":"ghost"}" data-act="bdel" data-id="${esc(b.id)}">${S.delArm==="b"+b.id?"Confirmar":"Excluir"}</button></td></tr>`).join("")
      :`<tr><td colspan="6" class="muted" style="padding:20px 12px">Nenhuma conta cadastrada. Adicione a primeira acima.</td></tr>`}
    </tbody></table></div>
  </section>`;
}

/* ============ baixas com data divergente ============ */
function divergenciasData(c){
  const out=[];
  c.links.forEach(l=>{
    if (!l.e.length || !l.f.length) return;
    const es=l.e.map(id=>itemE(c,id)), ref=es.slice().sort((a,b)=>a.d.localeCompare(b.d))[0];
    l.f.forEach(fid=>{ const f=itemF(c,fid); if(!f) return;
      const e = es.length===1 ? es[0] : (es.find(x=>x.v===f.v) || ref);
      if (f.d===e.d) return;
      out.push({ eid:e.id, fid, dExt:e.d, dFlow:f.d, dias:dayDiff(f.d,e.d), ext:e.h, extV:e.v, flow:f.h, hist:(f.x&&f.x!==f.h)?f.x:"", titulo:f.n||"", v:f.v, tipo:TIPOS[l.tipo]||l.tipo, grupo:l.e.length+l.f.length>2 });
    });
  });
  return out.sort((a,b)=>Math.abs(b.dias)-Math.abs(a.dias)||a.dExt.localeCompare(b.dExt));
}
function faixasDiv(L){
  const F=[["1 dia",1,1],["2 a 3 dias",2,3],["4 a 7 dias",4,7],["8 a 15 dias",8,15],["Mais de 15 dias",16,1e9]];
  return F.map(([n,a,b])=>{ const r=L.filter(x=>Math.abs(x.dias)>=a&&Math.abs(x.dias)<=b); return {n,q:r.length,v:sum(r.map(x=>Math.abs(x.v))),ant:r.filter(x=>x.dias<0).length,pos:r.filter(x=>x.dias>0).length}; }).filter(x=>x.q);
}
const diasTxt = d => d>0 ? `${d} dia${d>1?"s":""} depois` : `${-d} dia${d<-1?"s":""} antes`;
function renderDatas(){
  const el=$("#datasdiv"); if(!el) return; const c=S.cur, L=divergenciasData(c);
  el.hidden=!L.length; if(!L.length){ el.innerHTML=""; return; }
  el.innerHTML=`<div class="phead"><div><h3>Baixas com data divergente <span class="muted small">(${L.length})</span></h3>
    <div class="small muted">Conciliadas, mas a data de baixa no Flow é diferente da data do extrato · <span class="num">${BRL(sum(L.map(x=>Math.abs(x.v))))}</span> · maior diferença ${Math.max(...L.map(x=>Math.abs(x.dias)))} dia(s)</div></div>
    <div class="actions"><button class="btn sm pri" data-act="expdat" data-fmt="xlsx">Exportar Excel</button><button class="btn sm" data-act="expdat" data-fmt="pdf">Exportar PDF</button><button class="btn sm" data-act="toggledat">${S.showDat?"Recolher":"Ver lista"}</button></div></div>
  <div class="small muted" id="datmsg" style="padding:0 14px"></div>
  ${S.showDat?`<div class="tbl tbl-scroll"><table><thead><tr><th>Data extrato</th><th>Baixa no Flow</th><th>Diferença</th><th>Lançamento no Flow</th><th>Título</th><th class="r">Valor</th><th>Extrato</th><th>Vínculo</th></tr></thead><tbody>
  ${L.map(r=>`<tr><td class="num">${dBR(r.dExt)}</td><td class="num"><b>${dBR(r.dFlow)}</b></td><td><span class="pill ${Math.abs(r.dias)>3?"warn":"neu"}">${diasTxt(r.dias)}</span></td>
    <td><div>${esc(r.flow)}</div>${r.hist?`<div class="small muted">${esc(r.hist.slice(0,80))}</div>`:""}</td><td class="num">${esc(r.titulo)}</td>
    <td class="r num ${r.v<0?"neg":""}">${BRLn(r.v)}</td><td class="small">${esc(r.ext)}</td><td class="small muted">${esc(r.tipo)}</td></tr>`).join("")}
  </tbody></table></div>`:""}`;
}
function linhasDatasXlsx(L){
  return L.map(r=>[dBR(r.dExt),dBR(r.dFlow),r.dias,r.flow,r.hist,r.titulo,r.v/100,r.ext,r.tipo,"Alterar a data de baixa no Flow para "+dBR(r.dExt),"",""]);
}
const HEAD_DAT=["Data no extrato","Data de baixa no Flow","Dias (Flow − extrato)","Lançamento no Flow","Histórico","Título","Valor (R$)","Lançamento no extrato","Vínculo","Ação no Flow","Corrigido no Flow? (S/N)","Corrigido por / data"];
function sheetDatas(L, titulo){
  const aoa=[[titulo],[],HEAD_DAT,...linhasDatasXlsx(L)];
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"]=[12,14,10,36,40,11,13,40,16,36,14,20].map(w=>({wch:w}));
  ws["!autofilter"]={ref:XLSX.utils.encode_range({s:{r:2,c:0},e:{r:2+L.length,c:HEAD_DAT.length-1}})};
  for (let r=3;r<aoa.length;r++){ const a=XLSX.utils.encode_cell({r,c:6}); if(ws[a]) ws[a].z="#,##0.00"; }
  return ws;
}
async function exportarDatas(fmt){
  const c=S.cur, msg=$("#datmsg"), L=divergenciasData(c);
  if (!L.length){ msg.textContent="Não há baixas com data divergente."; return; }
  const base=`Datas_divergentes_${norm(c.banco).replace(/[^A-Z0-9]+/g,"_")}_${c.ini.slice(0,7)}`;
  const tit=`Baixas com data divergente · ${c.banco} · ${dBR(c.ini)} a ${dBR(c.fim)} · gerado em ${new Date().toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"})}`;
  if (fmt==="xlsx"){
    if (typeof XLSX==="undefined"){ msg.textContent="A biblioteca de planilhas não carregou. Recarregue a página."; return; }
    const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,sheetDatas(L,tit),"Datas divergentes");
    const fx=faixasDiv(L); const ws2=XLSX.utils.aoa_to_sheet([["Faixa","Qtde","Baixa antes do banco","Baixa depois do banco","Valor (R$)"],...fx.map(x=>[x.n,x.q,x.ant,x.pos,x.v/100])]);
    ws2["!cols"]=[{wch:16},{wch:8},{wch:20},{wch:20},{wch:14}];
    XLSX.utils.book_append_sheet(wb,ws2,"Resumo por faixa");
    return salvarArquivo(base+".xlsx", new Blob([XLSX.write(wb,{type:"array",bookType:"xlsx"})]), msg);
  }
  if (!window.jspdf){ msg.textContent="A biblioteca de PDF não carregou. Recarregue a página."; return; }
  const doc=new window.jspdf.jsPDF({unit:"mm",format:"a4",orientation:"landscape"}); const M=12, INK=[23,33,31], MUT=[91,104,102];
  doc.setFont("helvetica","bold"); doc.setFontSize(15); doc.setTextColor(...INK); doc.text("Baixas com data divergente",M,16);
  doc.setFont("helvetica","normal"); doc.setFontSize(9.5); doc.setTextColor(...MUT); doc.text(tit.replace("Baixas com data divergente · ","LZ7 Energia · "),M,22);
  doc.text("Lançamentos conciliados cuja data de baixa no Flow difere da data do extrato. Marque cada linha quando a data for corrigida.",M,27);
  doc.autoTable({startY:31,margin:{left:M,right:M},theme:"grid",
    head:[["Extrato","Baixa Flow","Diferença","Lançamento no Flow","Título","Valor (R$)","Lançamento no extrato","Feito"]],
    body:L.map(r=>[dBR(r.dExt),dBR(r.dFlow),diasTxt(r.dias),r.flow+(r.hist?"\n"+r.hist.slice(0,80):""),r.titulo,BRLn(r.v),r.ext,""]),
    styles:{font:"helvetica",fontSize:7.8,cellPadding:1.5,textColor:INK,lineColor:[213,220,220],lineWidth:.15,valign:"top"},
    headStyles:{fillColor:[234,238,238],textColor:INK,fontStyle:"bold"},
    columnStyles:{0:{cellWidth:19},1:{cellWidth:19,fontStyle:"bold"},2:{cellWidth:24},3:{cellWidth:72},4:{cellWidth:18},5:{halign:"right",cellWidth:22},6:{cellWidth:85},7:{cellWidth:14}}});
  const n=doc.getNumberOfPages(); for(let p=1;p<=n;p++){ doc.setPage(p); doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(...MUT); doc.text(`Página ${p} de ${n}`,285,203,{align:"right"}); }
  return salvarArquivo(base+".pdf", doc.output("blob"), msg);
}

/* ============ relatório de excluídos (para corrigir no Flow) ============ */
const ACAO = {
  "Duplicidade no Flow": "Excluir ou estornar este lançamento no Flow. O lançamento gêmeo já está conciliado com o extrato.",
  "Lançamento de outra conta": "Mover o lançamento para a conta bancária correta no Flow.",
  "Erro de importação": "Conferir o lançamento no Flow e no arquivo de origem; corrigir valor, data ou conta.",
  "Já conciliado em outro período": "Conferir a data do lançamento no Flow e ajustar para o período correto.",
  "Lançamento não reconhecido": "Verificar com o responsável; se não procede, excluir do Flow (ou contestar no banco, se for do extrato)."
};
function linhasExcluidos(c){
  const X=c.exc||{};
  return Object.keys(X).map(id=>{
    const isE=id[0]==="e", i=isE?itemE(c,id):itemF(c,id), x=X[id]; if(!i) return null;
    let tw=x.tw?itemF(c,x.tw):null;
    if (!tw && !isE && x.m==="Duplicidade no Flow") tw=c.F.find(f=>f.id!==id&&f.d===i.d&&f.v===i.v)||null;
    const acao = isE ? (x.m==="Lançamento não reconhecido" ? "Identificar o lançamento no banco; se procede, lançar no Flow; se não, contestar com o banco." : "Lançar no Flow ou registrar o ajuste correspondente.")
                     : (ACAO[x.m] || "Corrigir conforme a observação.");
    return { origem:isE?"Extrato":"Flow", data:dBR(i.d), lanc:i.h, hist:(i.x&&i.x!==i.h)?i.x:"", titulo:i.n||"", valor:i.v/100,
      motivo:x.m, obs:x.o||"", acao, gemeo: tw ? `${tw.h}${tw.x&&tw.x!==tw.h?" · "+tw.x.slice(0,60):""}` : "",
      por:x.por||"", em:x.em?new Date(x.em).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"}):"", _d:i.d };
  }).filter(Boolean).sort((a,b)=>a.origem.localeCompare(b.origem)||a._d.localeCompare(b._d));
}
async function salvarArquivo(nome,blob,msgEl){
  if (!S.dl){ msgEl.textContent="Este visualizador não permite baixar arquivos. Abra a página no claude.ai."; return; }
  msgEl.textContent="Confirme o download…";
  try{ await S.dl.save({filename:nome,data:blob}); msgEl.textContent="Arquivo gerado: "+nome; }
  catch(e){ msgEl.textContent = e.code==="declined" ? "Download cancelado." : e.code==="rate_limited" ? "Aguarde um instante e tente de novo." : "Não foi possível baixar ("+(e.code||"erro")+")."; }
}
async function exportarExcluidos(fmt){
  const c=S.cur, msg=$("#expmsg"), L=linhasExcluidos(c);
  if (!L.length){ msg.textContent="Não há lançamentos excluídos."; return; }
  const base=`Excluidos_${norm(c.banco).replace(/[^A-Z0-9]+/g,"_")}_${c.ini.slice(0,7)}`;
  if (fmt==="xlsx"){
    if (typeof XLSX==="undefined"){ msg.textContent="A biblioteca de planilhas não carregou. Recarregue a página."; return; }
    const head=["Origem","Data","Lançamento","Histórico","Título","Valor (R$)","Motivo da exclusão","Observação","Ação no Flow","Lançamento gêmeo (já conciliado)","Excluído por","Excluído em","Corrigido no Flow? (S/N)","Corrigido por / data"];
    const aoa=[[`Lançamentos excluídos da conciliação · ${c.banco} · ${dBR(c.ini)} a ${dBR(c.fim)}`],[`Gerado em ${new Date().toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"})}${c.responsavel?" · Responsável: "+c.responsavel:""}`],[],head,
      ...L.map(r=>[r.origem,r.data,r.lanc,r.hist,r.titulo,r.valor,r.motivo,r.obs,r.acao,r.gemeo,r.por,r.em,"",""])];
    const tE=sum(L.filter(r=>r.origem==="Extrato").map(r=>Math.round(r.valor*100)))/100, tF=sum(L.filter(r=>r.origem==="Flow").map(r=>Math.round(r.valor*100)))/100;
    aoa.push([],["Total Extrato","","","","",tE],["Total Flow","","","","",tF]);
    const ws=XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"]=[8,11,38,44,10,13,26,36,52,44,18,16,14,20].map(w=>({wch:w}));
    ws["!merges"]=[{s:{r:0,c:0},e:{r:0,c:9}},{s:{r:1,c:0},e:{r:1,c:9}}];
    ws["!autofilter"]={ref:XLSX.utils.encode_range({s:{r:3,c:0},e:{r:3+L.length,c:head.length-1}})};
    for (let r=4;r<aoa.length;r++){ const a=XLSX.utils.encode_cell({r,c:5}); if(ws[a]&&typeof ws[a].v==="number") ws[a].z="#,##0.00"; }
    // resumo por motivo
    const g={}; L.forEach(r=>{ const k=r.origem+"|"+r.motivo; (g[k]=g[k]||{o:r.origem,m:r.motivo,n:0,v:0}); g[k].n++; g[k].v+=Math.round(r.valor*100); });
    const ws2=XLSX.utils.aoa_to_sheet([["Origem","Motivo","Qtde","Valor (R$)"],...Object.values(g).map(x=>[x.o,x.m,x.n,x.v/100])]);
    ws2["!cols"]=[{wch:10},{wch:32},{wch:8},{wch:14}];
    for (let r=1;r<=Object.keys(g).length;r++){ const a=XLSX.utils.encode_cell({r,c:3}); ws2[a].z="#,##0.00"; }
    const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,"Excluídos"); XLSX.utils.book_append_sheet(wb,ws2,"Resumo por motivo");
    const LD=divergenciasData(c); if (LD.length) XLSX.utils.book_append_sheet(wb,sheetDatas(LD,`Baixas com data divergente · ${c.banco} · ${dBR(c.ini)} a ${dBR(c.fim)}`),"Datas divergentes");
    const buf=XLSX.write(wb,{type:"array",bookType:"xlsx"});
    return salvarArquivo(base+".xlsx", new Blob([buf]), msg);
  }
  if (!window.jspdf){ msg.textContent="A biblioteca de PDF não carregou. Recarregue a página."; return; }
  const doc=new window.jspdf.jsPDF({unit:"mm",format:"a4",orientation:"landscape"}); const M=12, INK=[23,33,31], MUT=[91,104,102];
  doc.setFont("helvetica","bold"); doc.setFontSize(15); doc.setTextColor(...INK); doc.text("Lançamentos excluídos da conciliação",M,16);
  doc.setFont("helvetica","normal"); doc.setFontSize(9.5); doc.setTextColor(...MUT);
  doc.text(`LZ7 Energia · ${c.banco} · Período ${dBR(c.ini)} a ${dBR(c.fim)} · Gerado em ${new Date().toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"})}${c.responsavel?" · Responsável: "+c.responsavel:""}`,M,22);
  doc.text("Lista de trabalho para corrigir no Flow. Marque cada linha quando a correção for feita.",M,27);
  doc.autoTable({startY:31,margin:{left:M,right:M},theme:"grid",
    head:[["Origem","Data","Lançamento / histórico","Valor (R$)","Motivo","Ação no Flow","Gêmeo já conciliado","Feito"]],
    body:L.map(r=>[r.origem,r.data,r.lanc+(r.hist?"\n"+r.hist.slice(0,90):"")+(r.titulo?"\nTítulo "+r.titulo:""),BRLn(Math.round(r.valor*100)),r.motivo+(r.obs?"\n"+r.obs:""),r.acao,r.gemeo,""]),
    styles:{font:"helvetica",fontSize:7.8,cellPadding:1.5,textColor:INK,lineColor:[213,220,220],lineWidth:.15,valign:"top"},
    headStyles:{fillColor:[234,238,238],textColor:INK,fontStyle:"bold"},
    columnStyles:{0:{cellWidth:15},1:{cellWidth:18},2:{cellWidth:62},3:{halign:"right",cellWidth:22},4:{cellWidth:38},5:{cellWidth:56},6:{cellWidth:48},7:{cellWidth:14}}});
  let y=doc.lastAutoTable.finalY+6;
  const tE=sum(L.filter(r=>r.origem==="Extrato").map(r=>Math.round(r.valor*100))), tF=sum(L.filter(r=>r.origem==="Flow").map(r=>Math.round(r.valor*100)));
  if (y>185){ doc.addPage(); y=16; }
  doc.setFont("helvetica","bold"); doc.setFontSize(9.5); doc.setTextColor(...INK);
  doc.text(`${L.length} lançamento(s) · Total Extrato R$ ${BRLn(tE)} · Total Flow R$ ${BRLn(tF)}`,M,y);
  const n=doc.getNumberOfPages(); for(let p=1;p<=n;p++){ doc.setPage(p); doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(...MUT); doc.text(`Página ${p} de ${n}`,285,203,{align:"right"}); }
  return salvarArquivo(base+".pdf", doc.output("blob"), msg);
}

/* ============ resumo do histórico em PDF ============ */
// contas cadastradas (e as que aparecem nas conciliações) × meses do primeiro ao último, sem buracos
function faltantes(meses){
  meses = meses || [...new Set(S.resumos.map(r=>String(r.fim).slice(0,7)))].sort();
  if (!meses.length) return {bancos:[],todosMeses:[],faltam:[],justif:[]};
  const contas=new Map(); S.bancos.forEach(b=>contas.set(b.id,b.nome)); S.resumos.forEach(r=>{ if(!contas.has(r.bancoId)) contas.set(r.bancoId,r.banco); });
  const bancos=[...contas.entries()].map(([k,v])=>[k,v||String(k)]).sort((a,b)=>a[1].localeCompare(b[1],"pt-BR"));
  const todosMeses=[]; { let [a,m]=meses[0].split("-").map(Number); const [b,n]=meses[meses.length-1].split("-").map(Number); while(a<b||(a===b&&m<=n)){ todosMeses.push(`${a}-${String(m).padStart(2,"0")}`); m++; if(m>12){m=1;a++;} } }
  const faltam=[], justif=[]; bancos.forEach(([id,nome])=>todosMeses.forEach(mm=>{
    if (S.resumos.some(r=>r.bancoId===id&&String(r.fim).slice(0,7)===mm)) return;
    const j=(S.faltasJ||{})[id+"_"+mm];
    if (j && j.justif) justif.push([nome,mm,j,id]); else faltam.push([nome,mm,id]); }));
  return {bancos,todosMeses,faltam,justif};
}
const mesCurto = m => MESES[+m.slice(5,7)-1]+"/"+m.slice(0,4);
function faltasHTML(){
  const f=faltantes(); if(!f.faltam.length && !f.justif.length) return "";
  const g={}; f.faltam.forEach(([n,m,id])=>{ (g[id]=g[id]||{n,ms:[]}).ms.push(m); });
  const form = S.fjForm && g[S.fjForm] ? g[S.fjForm] : null;
  const jg={}; f.justif.forEach(([n,m,j,id])=>{ const k=id+"|"+j.justif; (jg[k]=jg[k]||{n,id,j,ms:[]}).ms.push(m); });
  return `<section class="panel" style="padding:12px 16px">
    ${f.faltam.length?`<div class="label" style="color:var(--bad)">Faltam ${f.faltam.length} conciliação(ões)</div>
    <div class="small" style="margin-top:6px;display:flex;flex-direction:column;gap:6px">${Object.entries(g).map(([id,x])=>`<div class="fjrow"><span><b>${esc(x.n)}</b>: ${x.ms.map(mesCurto).join(", ")}</span>
      ${S.fjForm===id?"":`<button class="btn sm ghost" data-act="fjopen" data-id="${esc(id)}">Justificar</button>`}</div>
      ${S.fjForm===id?`<div class="fjform"><div class="fjmeses">${x.ms.map(m=>`<label><input type="checkbox" class="fjm" value="${m}" checked> ${mesCurto(m)}</label>`).join("")}</div>
        <input type="text" id="fjtxt" placeholder="Justificativa. Ex.: conta aberta em setembro/2026; não havia movimento antes." style="flex:1;min-width:240px">
        <button class="btn ghost" data-act="fjcancel">Cancelar</button><button class="btn pri" data-act="fjsave" data-id="${esc(id)}">Salvar justificativa</button>
        <div class="small muted" id="fjmsg" style="flex-basis:100%">Os meses justificados deixam de contar como "falta" e aparecem no resumo em PDF com a justificativa.</div></div>`:""}`).join("")}</div>`
    :`<div class="label" style="color:var(--ok)">Nenhuma conciliação faltando</div>`}
    ${f.justif.length?`<div class="label" style="margin-top:12px">Meses sem conciliação justificados</div>
    <div class="small" style="margin-top:6px;display:flex;flex-direction:column;gap:4px">${Object.values(jg).map(x=>`<div class="fjrow"><span><b>${esc(x.n)}</b>: ${x.ms.map(mesCurto).join(", ")} <span class="muted">· ${esc(x.j.justif)}${x.j.por?" · "+esc(x.j.por):""}</span></span>
      <button class="btn sm ${S.delArm==="fj"+x.id+x.ms.join()?"danger":"ghost"}" data-act="fjdel" data-id="${esc(x.id)}" data-ms="${x.ms.join(",")}">${S.delArm==="fj"+x.id+x.ms.join()?"Confirmar":"Remover"}</button></div>`).join("")}</div>`:""}
  </section>`;
}
function listaHist(){
  const q=norm(S.hq||""), fs=S.hsit||"";
  return S.resumos.filter(r=>(!q||norm(tituloResumo(r)+" "+r.banco+" "+dBR(r.ini)+" "+dBR(r.fim)+" "+(r.justif||"")).includes(q)) && (!fs||sitResumo(r)===fs)
    && (!S.hbanco||r.bancoId===S.hbanco) && (!S.hmes||String(r.fim).slice(0,7)===S.hmes)).sort(ORDENS[S.hsort][1]); // Central: conta e mês
}
async function exportarResumoHist(){
  const msg=$("#histmsg"); const L=listaHist();
  if (!L.length){ msg.textContent="Nenhuma conciliação na lista."; return; }
  if (!window.jspdf || !(new window.jspdf.jsPDF()).autoTable){ msg.textContent="A biblioteca de PDF não carregou. Recarregue a página."; return; }
  const doc=new window.jspdf.jsPDF({unit:"mm",format:"a4",orientation:"landscape"}); const W=297, M=12;
  const TEAL=[13,107,95], INK=[23,33,31], MUT=[91,104,102], OK=[31,122,63], WARN=[164,98,0];
  const R=v=>v==null?"—":BRLn(v); const mesTxt=f=>`${MESES[+String(f).slice(5,7)-1]}/${String(f).slice(0,4)}`;
  const st={styles:{font:"helvetica",fontSize:8,cellPadding:1.5,textColor:INK,lineColor:[213,220,220],lineWidth:.15,valign:"middle"},headStyles:{fillColor:[234,238,238],textColor:INK,fontStyle:"bold"},margin:{left:M,right:M},theme:"grid"};
  let y=16;
  const h=t=>{ if(y>180){doc.addPage();y=16;} doc.setFont("helvetica","bold"); doc.setFontSize(11.5); doc.setTextColor(...TEAL); doc.text(t,M,y); y+=1.5; doc.setDrawColor(...TEAL); doc.setLineWidth(.3); doc.line(M,y,W-M,y); y+=5; doc.setTextColor(...INK); };
  doc.setFont("helvetica","bold"); doc.setFontSize(16); doc.setTextColor(...INK); doc.text("Resumo das conciliações bancárias",M,y); y+=6;
  doc.setFont("helvetica","normal"); doc.setFontSize(9.5); doc.setTextColor(...MUT);
  const meses=[...new Set(L.map(r=>String(r.fim).slice(0,7)))].sort();
  const {bancos,todosMeses,faltam,justif}=faltantes(meses);
  const filtro=[S.hbanco?`conta "${(S.resumos.find(r=>r.bancoId===S.hbanco)||{}).banco||""}"`:"", S.hmes?`mês ${ymNome(S.hmes)}`:"", S.hq?`busca "${S.hq}"`:"", S.hsit?`situação "${SIT[S.hsit][1]}"`:""].filter(Boolean).join(" · "); // Central: conta e mês
  doc.text(`LZ7 Energia · ${L.length} conciliação(ões) · ${bancos.length} conta(s) · ${mesTxt(meses[0]+"-01")} a ${mesTxt(meses[meses.length-1]+"-01")} · emitido em ${new Date().toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"})}${filtro?" · filtro: "+filtro:""}`,M,y); y+=8;

  // 1. Situação geral
  h("1. Situação geral");
  const cnt=k=>L.filter(r=>sitResumo(r)===k).length;
  const pend=L.filter(r=>sitResumo(r)==="andamento");
  doc.autoTable({...st,startY:y,tableWidth:150,head:[["Situação","Qtde"]],body:[["Conciliada",cnt("conciliada")],["Fechada com justificativas",cnt("justificada")],["Fechada manualmente",cnt("manual")],["Em andamento",cnt("andamento")],[{content:"Total feitas",styles:{fontStyle:"bold"}},{content:L.length,styles:{fontStyle:"bold"}}],[{content:"Faltam fazer",styles:{fontStyle:"bold",textColor:[179,38,30]}},{content:faltam.length,styles:{fontStyle:"bold",textColor:[179,38,30]}}],...(justif.length?[["Sem conciliação, justificado",justif.length]]:[])],columnStyles:{1:{halign:"right",cellWidth:25}}});
  y=doc.lastAutoTable.finalY+7;

  // 2. Mapa conta × mês
  h("2. Mapa por conta e mês");
  const curto={conciliada:"Conciliada",justificada:"Justificada",manual:"Fechada manual",andamento:"Em andamento"};
  const cor={conciliada:OK,justificada:TEAL,manual:TEAL,andamento:WARN};
  const body2=bancos.map(([id,nome])=>[nome,...todosMeses.map(m=>{ const rs=S.resumos.filter(r=>r.bancoId===id&&String(r.fim).slice(0,7)===m); if(!rs.length) return (S.faltasJ||{})[id+"_"+m]?.justif ? "Justificado" : "FALTA"; return rs.map(r=>curto[sitResumo(r)]).join(" / "); })]);
  doc.autoTable({...st,startY:y,head:[["Conta",...todosMeses.map(m=>mesTxt(m+"-01"))]],body:body2,
    didParseCell:d=>{ if(d.section!=="body"||d.column.index===0) return; const t=String(d.cell.raw);
      if(t==="FALTA"){ d.cell.styles.textColor=[179,38,30]; d.cell.styles.fontStyle="bold"; d.cell.styles.fillColor=[249,225,223]; return; }
      if(t==="Justificado"){ d.cell.styles.textColor=MUT; d.cell.styles.fontStyle="italic"; d.cell.styles.fillColor=[241,243,243]; return; }
      const k=Object.keys(curto).find(k=>t.startsWith(curto[k])); if(k){ d.cell.styles.textColor=cor[k]; d.cell.styles.fontStyle="bold"; } }});
  y=doc.lastAutoTable.finalY+4;
  doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(...MUT); doc.text("FALTA = conta cadastrada sem conciliação salva naquele mês." + (justif.length?" Justificado = mês sem conciliação com justificativa (ver tabela abaixo).":""),M,y); doc.setTextColor(...INK);
  { const Q=quebrasEncadeamento(); y+=6;
    doc.setFont("helvetica","bold"); doc.setFontSize(9.5); doc.text(Q.length?"Quebras no encadeamento de saldos (final de um mês × inicial do seguinte)":"Encadeamento de saldos: o saldo final de cada mês é igual ao inicial do mês seguinte em todas as contas comparáveis.",M,y); y+=3;
    if (Q.length){ doc.autoTable({...st,startY:y,tableWidth:200,head:[["Conta","De → Para","Δ Extrato","Δ Flow"]],body:Q.map(q=>[q.cur.banco,`${ymNome(String(q.ant.fim).slice(0,7))} → ${ymNome(String(q.cur.fim).slice(0,7))}`,q.dE?R(q.dE):"0,00",q.dF?R(q.dF):"0,00"]),columnStyles:{2:{halign:"right"},3:{halign:"right"}}}); y=doc.lastAutoTable.finalY; }
  }
  y=doc.lastAutoTable.finalY+7;

  y+=7;
  if (faltam.length){
    h("3. Conciliações que faltam");
    const porConta={}; faltam.forEach(([n,m])=>{ (porConta[n]=porConta[n]||[]).push(mesTxt(m+"-01")); });
    doc.autoTable({...st,startY:y,tableWidth:200,head:[["Conta","Meses sem conciliação","Qtde"]],body:Object.entries(porConta).map(([n,ms])=>[n,ms.join(", "),ms.length]),columnStyles:{0:{cellWidth:70},2:{halign:"right",cellWidth:16}}});
    y=doc.lastAutoTable.finalY+7;
  }
  if (justif.length){
    h((faltam.length?4:3)+". Meses sem conciliação justificados");
    const jg={}; justif.forEach(([n,m,j])=>{ const k=n+"|"+j.justif; (jg[k]=jg[k]||{n,j:j.justif,ms:[]}).ms.push(mesTxt(m+"-01")); });
    doc.autoTable({...st,startY:y,head:[["Conta","Meses","Justificativa"]],body:Object.values(jg).map(x=>[x.n,x.ms.join(", "),x.j]),columnStyles:{0:{cellWidth:70},1:{cellWidth:60}}});
    y=doc.lastAutoTable.finalY+7;
  }
  // Detalhe
  const nD=3+(faltam.length?1:0)+(justif.length?1:0);
  doc.addPage(); y=16; h(nD+". Detalhe por conciliação");
  const body3=L.map(r=>{ const k=sitResumo(r); const dS=(r.sFinE!=null&&r.sFinF!=null)?r.sFinE-r.sFinF:null;
    return [tituloResumo(r), r.banco, `${dBR(r.ini)} a ${dBR(r.fim)}`, SIT[k][1], `${r.mE}/${r.nE}`, `${r.mF}/${r.nF}`, (r.pE||0)+(r.pF||0), r.nExc||0, R(r.aberto??r.dif), R(r.sFinE), R(r.sFinF), R(dS)]; });
  doc.autoTable({...st,startY:y,head:[["Conciliação","Conta","Período","Situação","Extrato conc.","Flow conc.","Pend.","Excl.","Dif. em aberto","Saldo final extrato","Saldo final Flow","Dif. saldo"]],body:body3,
    columnStyles:{0:{cellWidth:44},1:{cellWidth:32},2:{cellWidth:30},3:{cellWidth:26},4:{halign:"right"},5:{halign:"right"},6:{halign:"right"},7:{halign:"right"},8:{halign:"right"},9:{halign:"right"},10:{halign:"right"},11:{halign:"right"}},
    didParseCell:d=>{ if(d.section!=="body") return;
      if(d.column.index===3){ const k=Object.keys(SIT).find(k=>SIT[k][1]===d.cell.raw); if(k){ d.cell.styles.textColor=cor[k]; d.cell.styles.fontStyle="bold"; } }
      if([8,11].includes(d.column.index) && d.cell.raw!=="—" && d.cell.raw!=="0,00") d.cell.styles.textColor=[179,38,30]; }});
  y=doc.lastAutoTable.finalY+7;

  // 4. Justificativas e pendências
  const J=L.filter(r=>(r.justif||"").trim() || sitResumo(r)==="manual" || sitResumo(r)==="andamento");
  if (J.length){
    h((nD+1)+". Justificativas e pendências");
    doc.autoTable({...st,startY:y,head:[["Conciliação","Situação","Justificativa / observação"]],
      body:J.map(r=>{ const k=sitResumo(r); const f=r.fech&&r.fech.manual?`Fechada manualmente${r.fech.por?" por "+r.fech.por:""}${r.fech.em?" em "+new Date(r.fech.em).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"}):""}. `:"";
        const p=k==="andamento"?`${(r.pE||0)+(r.pF||0)} pendente(s), ${r.semMotivo||0} sem justificativa, diferença em aberto R$ ${R(r.aberto??r.dif)}. `:"";
        return [tituloResumo(r), SIT[k][1], (f+p+(r.justif||"")).trim()||"—"]; }),
      columnStyles:{0:{cellWidth:60},1:{cellWidth:40}}});
    y=doc.lastAutoTable.finalY+7;
  }
  // Conclusão
  h((nD+(J.length?2:1))+". Conclusão");
  const fech=L.length-pend.length;
  const txt=`${fech} de ${L.length} conciliação(ões) estão fechadas (${cnt("conciliada")} conciliada(s) sem pendências, ${cnt("justificada")} com justificativas e ${cnt("manual")} fechada(s) manualmente).`+
    (pend.length?` Em andamento: ${pend.map(r=>tituloResumo(r)).join("; ")}.`:" Não há conciliações em andamento.")+
    (justif.length?` ${justif.length} mês(es) sem conciliação têm justificativa registrada (ver seção própria).`:"")+
    (faltam.length?` Faltam ${faltam.length} conciliação(ões) entre ${mesTxt(todosMeses[0]+"-01")} e ${mesTxt(todosMeses[todosMeses.length-1]+"-01")}, considerando as ${bancos.length} contas cadastradas.`:` Não há conciliações faltando de ${mesTxt(todosMeses[0]+"-01")} a ${mesTxt(todosMeses[todosMeses.length-1]+"-01")}.`);
  doc.setFont("helvetica","normal"); doc.setFontSize(9.5); const Lx=doc.splitTextToSize(txt,W-2*M); doc.text(Lx,M,y);
  const n=doc.getNumberOfPages(); for(let i=1;i<=n;i++){ doc.setPage(i); doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(...MUT); doc.text("Resumo das conciliações bancárias · LZ7 Energia",M,203); doc.text(`Página ${i} de ${n}`,W-M,203,{align:"right"}); }
  const nome=`Resumo_conciliacoes_${new Date().toISOString().slice(0,10)}.pdf`;
  if (!S.dl){ msg.textContent="Este visualizador não permite baixar arquivos. Abra a página no claude.ai."; return; }
  msg.textContent="Confirme o download…";
  try{ await S.dl.save({filename:nome,data:doc.output("blob")}); msg.textContent="PDF gerado: "+nome; }
  catch(e){ msg.textContent = e.code==="declined" ? "Download cancelado." : e.code==="rate_limited" ? "Aguarde um instante e tente de novo." : "Não foi possível baixar ("+(e.code||"erro")+")."; }
}

/* ============ PDF ============ */
async function gerarPDF(){
  // relatório da diretoria: base sem os lançamentos excluídos (tratados como corrigidos no Flow)
  const c0=S.cur, X0=c0.exc||{}, msg=$("#pdfmsg");
  const xs=Object.keys(X0).map(id=>id[0]==="e"?itemE(c0,id):itemF(c0,id)).filter(Boolean);
  const c={...c0, E:c0.E.filter(i=>!X0[i.id]), F:c0.F.filter(i=>!X0[i.id]), exc:{}};
  const s=stats(c);
  if (!window.jspdf || !window.jspdf.jsPDF || !(new window.jspdf.jsPDF()).autoTable){ msg.textContent="A biblioteca de PDF não carregou. Recarregue a página."; return; }
  const doc=new window.jspdf.jsPDF({unit:"mm",format:"a4"}); const W=210, M=16;
  const TEAL=[13,107,95], INK=[23,33,31], MUT=[91,104,102];
  let y=18;
  const h1=(t)=>{ if(y>255){doc.addPage();y=20;} doc.setFont("helvetica","bold"); doc.setFontSize(12.5); doc.setTextColor(...TEAL); doc.text(t,M,y); y+=2; doc.setDrawColor(...TEAL); doc.setLineWidth(.3); doc.line(M,y,W-M,y); y+=6; doc.setTextColor(...INK); };
  const para=(t,sz=10)=>{ doc.setFont("helvetica","normal"); doc.setFontSize(sz); const L=doc.splitTextToSize(t,W-2*M); if(y+L.length*4.6>280){doc.addPage();y=20;} doc.text(L,M,y); y+=L.length*4.6+2; };
  const tbl=(head,body,opts={})=>{ doc.autoTable({startY:y,head:[head],body,margin:{left:M,right:M},theme:"grid",styles:{font:"helvetica",fontSize:8.5,cellPadding:1.6,textColor:INK,lineColor:[213,220,220],lineWidth:.15},headStyles:{fillColor:[234,238,238],textColor:INK,fontStyle:"bold"},...opts}); y=doc.lastAutoTable.finalY+7; };
  const R=v=>BRLn(v);

  doc.setFont("helvetica","bold"); doc.setFontSize(17); doc.setTextColor(...INK); doc.text("Relatório de Conciliação Bancária",M,y); y+=7;
  doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.setTextColor(...MUT);
  doc.setFont("helvetica","bold"); doc.setTextColor(...INK); doc.setFontSize(12); doc.text(tituloDe(c0),M,y); y+=5.5;
  doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.setTextColor(...MUT);
  doc.text(`LZ7 Energia · ${c.banco} · Período ${dBR(c.ini)} a ${dBR(c.fim)}`,M,y); y+=5;
  doc.text(`Emitido em ${new Date().toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"})}${c.responsavel?" · Responsável: "+c.responsavel:""}`,M,y); y+=4;
  const sit=situacao(c0);
  doc.setFont("helvetica","bold"); doc.setTextColor(...(sit.k==="conciliada"?[31,122,63]:sit.k==="andamento"?[164,98,0]:TEAL)); doc.text("Situação: "+sit.pdf,M,y+1); y+=5;
  if (sit.k==="manual" && c0.fech){ doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(...MUT); doc.text(`Fechada manualmente${c0.fech.por?" por "+c0.fech.por:""}${c0.fech.em?" em "+new Date(c0.fech.em).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"}):""}.`,M,y+1); y+=4; }
  y+=5; doc.setTextColor(...INK);

  h1("1. Objetivo");
  para(`Conferir os lançamentos do extrato bancário da conta ${c.banco} com o relatório de movimento bancário do Flow no período de ${dBR(c.ini)} a ${dBR(c.fim)}, identificando o que foi confirmado nas duas fontes e explicando cada divergência.`);

  h1("2. Dados utilizados");
  tbl(["Fonte","Arquivo","Lançamentos","Entradas (R$)","Saídas (R$)","Líquido (R$)"],[
    ["Extrato bancário",c.arquivos.extrato||"",s.nE,R(s.inE),R(s.outE),R(s.liqE)],
    ["Flow (movimento bancário)",c.arquivos.flow||"",s.nF,R(s.inF),R(s.outF),R(s.liqF)]],
    {columnStyles:{2:{halign:"right"},3:{halign:"right"},4:{halign:"right"},5:{halign:"right"}}});
  if (c0.notaExc && xs.length) para(`${xs.length} lançamento(s) foram retirados da base desta análise por estarem em correção no Flow (duplicidades e erros de cadastro), somando R$ ${R(sum(xs.map(i=>i.v)))}. O detalhamento consta em relatório próprio.`,9);
  if ((c0.atualizacoes||[]).length){ const u=c0.atualizacoes[c0.atualizacoes.length-1]; para(`Arquivos atualizados ${c0.atualizacoes.length} vez(es) durante a conciliação; última atualização em ${new Date(u.em).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"})}${u.por?" por "+u.por:""}.`,9); }
  para(`Critérios: valor idêntico; data igual ou com até ${c.tol} dia(s) de diferença; lançamentos agregados do banco (boletos recebidos, SISPAG, BUSINESS) conciliados pela soma exata dos títulos do Flow do mesmo dia; vínculos manuais registrados pelo responsável.`+((c.arquivos.avisos||[]).length?" Observações da importação: "+c.arquivos.avisos.join(" "):""),9);

  h1("3. Análise");
  { const s0=stats(c0), rs=saldos(c0,s0);
    doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.text("3.1 Saldos",M,y); y+=4;
    if (rs.eI==null && rs.fI==null && rs.eFi==null && rs.fFi==null){ para("Saldos não informados nesta conciliação.",9); }
    else {
      const fAdj = rs.fF!=null ? rs.fF - s0.vxF : null, fAdjI = rs.fI;   // Flow considerado já corrigido
      const V=x=>x==null?"—":R(x);
      const temAj = rs.ajE||rs.ajF;
      const rowsS=[["Extrato bancário",V(rs.eI),R(s0.liqE),...(temAj?[R(rs.ajE)]:[]),V(rs.eF)],
        ["Flow"+(s0.vxF?" (após correções)":""),V(fAdjI),R(s0.liqF-s0.vxF),...(temAj?[R(rs.ajF)]:[]),V(fAdj)],
        [{content:"Diferença (extrato − Flow)",styles:{fontStyle:"bold"}},V(rs.difI),R(s0.liqE-s0.liqF+s0.vxF),...(temAj?[R(rs.ajE-rs.ajF)]:[]),{content:rs.eF!=null&&fAdj!=null?R(rs.eF-fAdj):"—",styles:{fontStyle:"bold"}}]];
      tbl(["Fonte",`Saldo em ${dBR(diaAntes(c0.ini))}`,"Movimento do mês",...(temAj?["Ajustes"]:[]),`Saldo em ${dBR(c0.fim)}`],rowsS,
        {columnStyles:{1:{halign:"right"},2:{halign:"right"},3:{halign:"right"},4:{halign:"right"}}});
      if (rs.aj.length) tbl(["Ajuste de saldo","Valor (R$)","Justificativa"],rs.aj.map(a=>[a.lado==="E"?"Extrato":"Flow",R(a.v),a.j]),{columnStyles:{0:{cellWidth:24},1:{halign:"right",cellWidth:28}}});
      if (rs.eF!=null && fAdj!=null){
        const L=[["Saldo final do extrato",R(rs.eF)]];
        if (rs.difI) L.push(["(−) Diferença já existente no saldo inicial",R(-rs.difI)]);
        if (s0.vpE) L.push(["(−) Lançamentos só no extrato",R(-s0.vpE)]);
        if (s0.vpF) L.push(["(+) Lançamentos só no Flow",R(s0.vpF)]);
        if (s0.vxE) L.push(["(−) Lançamentos do extrato em análise",R(-s0.vxE)]);
        if (s0.difManual) L.push(["(−) Diferenças aceitas em vínculos manuais",R(-s0.difManual)]);
        if (rs.ajE) L.push(["(−) Ajustes de saldo do extrato",R(-rs.ajE)]);
        if (rs.ajF) L.push(["(+) Ajustes de saldo do Flow",R(rs.ajF)]);
        const expl=rs.eF-(rs.difI||0)-s0.vpE+s0.vpF-s0.vxE-s0.difManual-rs.ajE+rs.ajF;
        L.push([{content:"= Saldo do Flow explicado",styles:{fontStyle:"bold"}},{content:R(expl),styles:{fontStyle:"bold"}}],["Saldo final do Flow",R(fAdj)],[{content:"Diferença não explicada",styles:{fontStyle:"bold"}},{content:R(expl-fAdj),styles:{fontStyle:"bold",textColor:expl-fAdj?[179,38,30]:[31,122,63]}}]);
        tbl(["Do saldo do extrato ao saldo do Flow","Valor (R$)"],L,{columnStyles:{1:{halign:"right"}},tableWidth:120});
      }
      if (rs.chkE) para(`Atenção: o saldo final informado do extrato difere em R$ ${R(rs.chkE)} do calculado (saldo inicial + movimento). O arquivo do extrato pode estar incompleto.`,9);
      if (rs.chkF) para(`Atenção: o saldo final informado do Flow difere em R$ ${R(rs.chkF)} do calculado (saldo inicial + movimento). O relatório do Flow pode estar incompleto.`,9);
    }
  }
  doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.text("3.2 Resumo da conciliação",M,y); y+=4;
  const tipoRows=Object.entries(s.byTipo).map(([k,v])=>[TIPOS[k]||k,v.n,v.nE,v.nF,R(v.v)]);
  tbl(["Tipo de vínculo","Vínculos","Itens extrato","Itens Flow","Valor (R$)"],[...tipoRows,
    [{content:"Total conciliado",styles:{fontStyle:"bold"}},c.links.length,s.mE,s.mF,""],
    ["Pendente: só no extrato","",s.pE.length,"",R(s.vpE)],["Pendente: só no Flow","","",s.pF.length,R(s.vpF)],
    ...(s.xE.length+s.xF.length?[["Excluído da conciliação","",s.xE.length,s.xF.length,""]]:[])],
    {columnStyles:{1:{halign:"right"},2:{halign:"right"},3:{halign:"right"},4:{halign:"right"}}});

  doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.text("3.3 Composição da diferença",M,y); y+=4;
  tbl(["Item","Valor (R$)"],[
    ["Líquido do extrato no período",R(s.liqE)],["(−) Líquido do Flow no período",R(-s.liqF)],
    [{content:"Diferença líquida",styles:{fontStyle:"bold"}},{content:R(s.dif),styles:{fontStyle:"bold"}}],
    ["Explicada por: lançamentos só no extrato",R(s.vpE)],["Explicada por: lançamentos só no Flow (sinal invertido)",R(-s.vpF)],
    ["Explicada por: diferenças aceitas em vínculos manuais",R(s.difManual)],
    ...(s.vxE||s.vxF?[["Explicada por: excluídos do extrato",R(s.vxE)],["Explicada por: excluídos do Flow (sinal invertido)",R(-s.vxF)]]:[])],{columnStyles:{1:{halign:"right"}}});

  const grp={}; [...s.pE.map(i=>["Extrato",i]),...s.pF.map(i=>["Flow",i])].forEach(([o,i])=>{ const m=(c.mot[i.id]&&c.mot[i.id].m)||"Sem justificativa"; const k=m+"|"+o; (grp[k]=grp[k]||{m,o,n:0,v:0}); grp[k].n++; grp[k].v+=i.v; });
  if (Object.keys(grp).length){
    doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.text("3.4 Divergências por motivo",M,y); y+=4;
    tbl(["Motivo","Origem","Qtde","Valor (R$)"],Object.values(grp).sort((a,b)=>Math.abs(b.v)-Math.abs(a.v)).map(g=>[g.m,g.o,g.n,R(g.v)]),{columnStyles:{2:{halign:"right"},3:{halign:"right"}}});
    doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.text("3.5 Detalhe das divergências",M,y); y+=4;
    const det=[...s.pE.map(i=>["Extrato",i]),...s.pF.map(i=>["Flow",i])].sort((a,b)=>a[1].d.localeCompare(b[1].d));
    tbl(["Origem","Data","Descrição","Valor (R$)","Motivo","Observação"],det.map(([o,i])=>[o,dBR(i.d),i.h,R(i.v),(c.mot[i.id]&&c.mot[i.id].m)||"Sem justificativa",(c.mot[i.id]&&c.mot[i.id].o)||""]),
      {columnStyles:{0:{cellWidth:15},1:{cellWidth:18},2:{cellWidth:52},3:{halign:"right",cellWidth:22},4:{cellWidth:32}},
       didParseCell:d=>{ if(d.section==="body"&&d.column.index===4&&d.cell.raw==="Sem justificativa") d.cell.styles.textColor=[179,38,30]; }});
  }
  const LD=divergenciasData(c);
  if (LD.length){
    if(y>235){doc.addPage();y=20;}
    doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.text("Baixas com data divergente",M,y); y+=5;
    para(`${LD.length} lançamento(s) do Flow foram conciliados por valor, mas com data de baixa diferente da data do extrato, somando R$ ${R(sum(LD.map(x=>Math.abs(x.v))))}. Maior diferença: ${Math.max(...LD.map(x=>Math.abs(x.dias)))} dia(s). As datas estão em correção no Flow.`,9);
    tbl(["Faixa de diferença","Qtde","Baixa antes do banco","Baixa depois do banco","Valor (R$)"],faixasDiv(LD).map(x=>[x.n,x.q,x.ant,x.pos,R(x.v)]),{columnStyles:{1:{halign:"right"},2:{halign:"right"},3:{halign:"right"},4:{halign:"right"}}});
  }
  const xl=[...s.xE.map(i=>["Extrato",i]),...s.xF.map(i=>["Flow",i])].sort((a,b)=>a[1].d.localeCompare(b[1].d));
  if (xl.length){
    doc.setFont("helvetica","bold"); doc.setFontSize(10); if(y>250){doc.addPage();y=20;} doc.text("Lançamentos excluídos da conciliação",M,y); y+=4;
    tbl(["Origem","Data","Lançamento","Valor (R$)","Motivo","Observação / registro"],xl.map(([o,i])=>{ const x=c.exc[i.id]; return [o,dBR(i.d),i.h+(i.x&&i.x!==i.h?"\n"+i.x.slice(0,70):""),R(i.v),x.m,[x.o,(x.por?x.por+" · ":"")+(x.em?new Date(x.em).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"}):"")].filter(Boolean).join("\n")]; }),
      {columnStyles:{0:{cellWidth:15},1:{cellWidth:18},2:{cellWidth:50},3:{halign:"right",cellWidth:22},4:{cellWidth:30}}});
  }
  const manuais=c.links.filter(l=>l.dif);
  if (manuais.length){
    doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.text("3.6 Vínculos manuais com diferença",M,y); y+=4;
    tbl(["Extrato","Flow","Diferença (R$)","Justificativa"],manuais.map(l=>[l.e.map(id=>itemE(c,id).h+" "+R(itemE(c,id).v)).join("\n"),l.f.map(id=>itemF(c,id).h+" "+R(itemF(c,id).v)).join("\n"),R(l.dif),l.nota||""]),{columnStyles:{2:{halign:"right"}}});
  }

  h1("4. Conclusão");
  const pct=s.nE?(100*s.mE/s.nE).toFixed(1).replace(".",","):"0";
  para(`${s.mE} de ${s.nE} lançamentos do extrato (${pct}%) e ${s.mF} de ${s.nF} lançamentos do Flow foram confirmados nas duas fontes. `+
    (s.pE.length+s.pF.length===0 ? "Não há divergências no período." :
     `Restam ${s.pE.length} lançamento(s) só no extrato (R$ ${R(s.vpE)}) e ${s.pF.length} só no Flow (R$ ${R(s.vpF)}). Diferença líquida bruta de R$ ${R(s.dif)}; diferença em aberto, após vínculos e exclusões, de R$ ${R(s.aberto)}. `+
     (s.xE.length+s.xF.length?`${s.xE.length+s.xF.length} lançamento(s) foram excluídos da conciliação com motivo registrado (ver seção de excluídos). `:"")+
     (s.semMotivo?`${s.semMotivo} divergência(s) ainda sem justificativa.`:"Todas as divergências têm justificativa registrada.")));
  { const s0=stats(c0), rs=saldos(c0,s0); if (rs.eF!=null && rs.fF!=null){ const d=rs.eF-(rs.fF-s0.vxF); para(d===0?`Os saldos finais em ${dBR(c0.fim)} são iguais no extrato e no Flow: R$ ${R(rs.eF)}.`:`Saldo final em ${dBR(c0.fim)}: extrato R$ ${R(rs.eF)} e Flow R$ ${R(rs.fF-s0.vxF)}, diferença de R$ ${R(d)}.`); } }
  if (LD.length) para(`${LD.length} baixa(s) no Flow com data diferente do extrato devem ter a data ajustada para manter o fluxo de caixa diário correto.`);
  if ((c0.justif||"").trim()) { if(y>255){doc.addPage();y=20;} doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.text("Justificativa do não fechamento",M,y); y+=5; para(c0.justif.trim()); }
  if (c.conclusao) { doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.text("Observações do responsável",M,y); y+=5; para(c.conclusao); }

  doc.addPage(); y=20; h1("5. Anexos");
  doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.text("Anexo A · Lançamentos conciliados",M,y); y+=4;
  const anexo=c.links.map(l=>({l,e:l.e.map(id=>itemE(c,id)),f:l.f.map(id=>itemF(c,id))})).sort((a,b)=>((a.e[0]||a.f[0]).d).localeCompare((b.e[0]||b.f[0]).d))
    .map(r=>[dBR((r.e[0]||r.f[0]).d), r.e.map(i=>i.h).join("\n")||"—", r.e.map(i=>R(i.v)).join("\n"), r.f.map(i=>i.h+(r.e[0]&&i.d!==r.e[0].d?` (baixa ${dShort(i.d)})`:"")).join("\n")||"—", r.f.map(i=>R(i.v)).join("\n"), TIPOS[r.l.tipo]||r.l.tipo]);
  tbl(["Data","Extrato","Valor","Flow","Valor","Tipo"],anexo,{styles:{font:"helvetica",fontSize:7.5,cellPadding:1.2,textColor:INK,lineColor:[213,220,220],lineWidth:.15},columnStyles:{0:{cellWidth:17},1:{cellWidth:48},2:{halign:"right",cellWidth:19},3:{cellWidth:52},4:{halign:"right",cellWidth:19}}});

  const n=doc.getNumberOfPages();
  for (let p=1;p<=n;p++){ doc.setPage(p); doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(...MUT);
    doc.text(`Conciliação ${c.banco} · ${dBR(c.ini)} a ${dBR(c.fim)}`,M,290); doc.text(`Página ${p} de ${n}`,W-M,290,{align:"right"}); }

  reindex(c0);
  const nome=`Conciliacao_${norm(tituloDe(c0)).replace(/[^A-Z0-9]+/g,"_").replace(/^_|_$/g,"")}.pdf`;
  if (!S.dl){ msg.textContent="Este visualizador não permite baixar arquivos. Abra a página no claude.ai."; return; }
  msg.textContent="Confirme o download…";
  try{ await S.dl.save({filename:nome,data:doc.output("blob")}); msg.textContent="PDF gerado: "+nome; }
  catch(e){ msg.textContent = e.code==="declined" ? "Download cancelado." : e.code==="rate_limited" ? "Aguarde um instante e tente de novo." : "Não foi possível baixar ("+(e.code||"erro")+")."; }
}

/* ============ inicialização ============ */
renderAll();
(async()=>{
  const C=window.claude;
  if (!C||!C.use){ setSave("Armazenamento indisponível nesta visualização"); return; }
  const [db,user,dl]=await Promise.all([C.use("db"),C.use("user"),C.use("downloads")]);
  S.db=db; S.user=user; S.dl=dl;
  if (user){ try{ const me=await user.me(); S.meName=me&&me.name||""; }catch(_){}
    try{ const w=await user.can("data.write"); if(w===false){ S.writable=false; } }catch(_){} }
  S.writable0=S.writable; // Central
  if (!db){ setSave("Armazenamento indisponível: o trabalho fica só nesta aba"); return; }
  setSave(S.writable?"Pronto":"Somente leitura");
  db.collection("bancos").onSnapshot(snap=>{
    S.bancos=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(a.nome).localeCompare(String(b.nome),"pt-BR"));
    if (S.pend.ext && !S.pend.bancoId && S.pend.ext.acct){ const a=S.pend.ext.acct.replace(/\D/g,""); const b=S.bancos.find(b=>{const k=String(b.conta||"").replace(/\D/g,""); return k&&(a.endsWith(k)||k.endsWith(a));}); if(b) S.pend.bancoId=b.id; }
    if (S.tab==="bancos") renderBancos(); else if (S.tab==="conc" && !S.cur) renderConc();
  }, e=>setSave("Erro ao ler bancos ("+e.code+")"));
  let first=true;
  db.doc("config/geral").onSnapshot(snap=>{ S.cfg = snap.exists ? {...snap.data()} : {autoEnc:false}; if (S.cur && S.tab==="conc") renderSaldos(); }, ()=>{});
  db.collection("faltas").onSnapshot(snap=>{
    S.faltasJ={}; snap.docs.forEach(d=>{ S.faltasJ[d.id]=d.data(); });
    if (S.tab==="hist") renderHist();
  }, ()=>{});
  db.collection("resumos").onSnapshot(snap=>{
    S.resumos=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(b.atualizadoEm).localeCompare(String(a.atualizadoEm)));
    if (S.tab==="hist") renderHist(); else if (S.tab==="conc" && !S.cur) renderConc();
    if (first && !snap.metadata.fromCache){ first=false; if (!S.cur && S.resumos.length) abrir(S.resumos[0].id); }
  }, e=>setSave("Erro ao ler histórico ("+e.code+")"));
})();
