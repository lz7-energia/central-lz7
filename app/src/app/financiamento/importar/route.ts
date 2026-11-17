import { NextResponse } from "next/server";
import { paginaAviso, tokenDaSessao } from "@/lib/colaboradores";
import { pessoaFin } from "@/lib/financiamento";
import { perfilAtual } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const json = (x: unknown) => JSON.stringify(x).replace(/</g, "\\u003c");

/** Migração única do dados-atuais.json da plataforma antiga. Só o administrador. O arquivo é lido no navegador e gravado
 *  direto no banco (tem nomes de clientes e valores: não vai para o repositório). */
export async function GET(req: Request) {
  const p = await pessoaFin();
  if (!p) {
    if (!(await perfilAtual())) return NextResponse.redirect(new URL("/entrar?volta=/financiamento/importar", req.url));
    return paginaAviso("Sem acesso", "Seu perfil não tem acesso a este módulo.", 403);
  }
  if (p.papel !== "admin") return paginaAviso("Só o administrador", "Só o administrador pode fazer a migração.", 403);
  const t = await tokenDaSessao();
  if (!t) return paginaAviso("Sessão não encontrada", "Clique em \"Entrar de novo\" e tente outra vez.");
  const central = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, token: t.token };
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Migrar Financiamento e confirmação</title><link rel="icon" href="/icon.png">
<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;color:#14201a;background:#f1f5f2}
.c{background:#fff;border:1px solid #d8e2db;border-radius:10px;padding:20px;margin-bottom:16px}h1{font-size:1.4rem}label{display:block;font-weight:600;margin:12px 0 4px}
button{background:#124735;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:1rem;cursor:pointer}button:disabled{opacity:.5}
pre{background:#f6f9f7;border:1px solid #d8e2db;border-radius:8px;padding:12px;white-space:pre-wrap;font-size:.86rem;max-height:420px;overflow:auto}</style></head><body>
<p><a href="/financiamento">‹ Financiamento e confirmação</a></p>
<div class="c"><h1>Migrar dados da plataforma antiga</h1>
<p>Escolha o arquivo <b>dados-atuais.json</b> do pacote. Ele grava a base de cards, os removidos, as situações (com motivo, observação e rota), a lista de motivos e a última atualização concluída.</p>
<label>dados-atuais.json</label><input type="file" id="fj" accept=".json,application/json">
<p><label style="display:inline;font-weight:400"><input type="checkbox" id="limpar" checked> Apagar antes o que já estiver no módulo (para ficar idêntico ao arquivo)</label></p>
<button id="ir">Migrar</button></div>
<div class="c"><b>Andamento</b><pre id="log">Aguardando o arquivo…</pre></div>
<script src="/colab-app/vendor/supabase.js"></script>
<script>
const C=${json(central)};
const sb=window.supabase.createClient(C.url,C.anon,{accessToken:async()=>C.token});
const L=document.getElementById("log"); const log=t=>{L.textContent+="\\n"+t; L.scrollTop=1e9;};
const brl=v=>v.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
document.getElementById("ir").onclick=async()=>{
  const fj=document.getElementById("fj").files[0];
  if(!fj){ alert("Escolha o dados-atuais.json."); return; }
  const b=document.getElementById("ir"); b.disabled=true; L.textContent="Lendo o arquivo…";
  try{
    const d=JSON.parse(await fj.text());
    const p=d.pendentes; if(!p||!Array.isArray(p.fin)||!Array.isArray(p.conf)) throw new Error("O arquivo não tem a base de pendentes (pendentes.fin / pendentes.conf).");
    if(document.getElementById("limpar").checked){ const r=await sb.from("fin_docs").delete().in("colecao",["pendentes","situacoes","config","status"]); if(r.error) throw r.error; log("Dados anteriores apagados."); }
    const docs=[{colecao:"pendentes",id:"base",data:{arquivo:p.arquivo||null,importadoEm:p.importadoEm||null,fin:p.fin,conf:p.conf,removidos:p.removidos||[]}}];
    for(const [k,v] of Object.entries(d.situacoes||{})) docs.push({colecao:"situacoes",id:k,data:v});
    if(Array.isArray(d.motivosFunil)) docs.push({colecao:"config",id:"motivosFunil",data:{lista:d.motivosFunil,atualizadoEm:new Date().toISOString()}});
    for(const [k,v] of Object.entries(d.status||{})) docs.push({colecao:"status",id:k,data:v});
    for(let i=0;i<docs.length;i+=200){ const r=await sb.from("fin_docs").upsert(docs.slice(i,i+200)); if(r.error) throw r.error; }
    const soma=a=>a.reduce((s,x)=>s+(Number(x.v)||0),0);
    log("Financiamento: "+p.fin.length+" cards · "+brl(soma(p.fin)));
    log("Confirmação de pagamento: "+p.conf.length+" cards · "+brl(soma(p.conf)));
    log("Removidos: "+(p.removidos||[]).length+" · Situações: "+Object.keys(d.situacoes||{}).length+" (com rota: "+Object.values(d.situacoes||{}).filter(s=>s&&s.rota).length+") · Motivos: "+(d.motivosFunil||[]).length);
    log("\\nPronto. Abra o módulo: /financiamento");
  }catch(e){ log("\\nERRO: "+(e.message||e)); }
  b.disabled=false;
};
</script></body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
