import { NextResponse } from "next/server";
import { paginaAviso, tokenDaSessao } from "@/lib/colaboradores";
import { pessoaConc } from "@/lib/conciliacao";

export const dynamic = "force-dynamic";
const json = (x: unknown) => JSON.stringify(x).replace(/</g, "\\u003c");

/** Migração única da plataforma de Conciliação Bancária (dados_completos.json: { colecoes: { bancos, conciliacoes, resumos,
 *  faltas, config } }). Só o administrador. Lido no navegador e gravado direto no banco, sem mudar ids nem conteúdo. */
export async function GET(req: Request) {
  const p = await pessoaConc();
  if (!p) return NextResponse.redirect(new URL("/entrar?volta=/conciliacao/importar", req.url));
  if (p.papel !== "admin") return paginaAviso("Só o administrador", "Só o administrador pode fazer a migração.", 403);
  const t = await tokenDaSessao();
  if (!t) return paginaAviso("Sessão não encontrada", "Clique em \"Entrar de novo\" e tente outra vez.");
  const central = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, token: t.token };
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Migrar Conciliação Bancária</title><link rel="icon" href="/icon.png">
<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;color:#14201a;background:#f1f5f2}
.c{background:#fff;border:1px solid #d8e2db;border-radius:10px;padding:20px;margin-bottom:16px}h1{font-size:1.4rem}label{display:block;font-weight:600;margin:12px 0 4px}
button{background:#124735;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:1rem;cursor:pointer}button:disabled{opacity:.5}
pre{background:#f6f9f7;border:1px solid #d8e2db;border-radius:8px;padding:12px;white-space:pre-wrap;font-size:.86rem;max-height:420px;overflow:auto}</style></head><body>
<p><a href="/conciliacao">‹ Conciliação Bancária</a></p>
<div class="c"><h1>Migrar dados da Conciliação Bancária</h1>
<p>Escolha o arquivo <b>dados_completos.json</b> do pacote de exportação. Ele grava contas, conciliações, resumos do Histórico, meses justificados e configuração com os mesmos ids e o mesmo conteúdo.</p>
<label>dados_completos.json</label><input type="file" id="fj" accept=".json,application/json">
<p><label style="display:inline;font-weight:400"><input type="checkbox" id="limpar" checked> Apagar antes o que já estiver na Conciliação (para ficar idêntico ao arquivo)</label></p>
<button id="ir">Migrar</button></div>
<div class="c"><b>Andamento</b><pre id="log">Aguardando o arquivo…</pre></div>
<script src="/colab-app/vendor/supabase.js"></script>
<script>
const C=${json(central)};
const COLECOES=["bancos","conciliacoes","resumos","faltas","config"];
const sb=window.supabase.createClient(C.url,C.anon,{accessToken:async()=>C.token});
const L=document.getElementById("log"); const log=t=>{L.textContent+="\\n"+t; L.scrollTop=1e9;};
document.getElementById("ir").onclick=async()=>{
  const fj=document.getElementById("fj").files[0];
  if(!fj){ alert("Escolha o arquivo dados_completos.json."); return; }
  const b=document.getElementById("ir"); b.disabled=true; L.textContent="Lendo o arquivo…";
  try{
    const d=JSON.parse(await fj.text()); const co=d&&d.colecoes;
    if(!co||!co.bancos||!co.conciliacoes) throw new Error("Este arquivo não é a exportação da Conciliação (faltam bancos e conciliacoes).");
    const desconhecidas=Object.keys(co).filter(k=>!COLECOES.includes(k)); if(desconhecidas.length) throw new Error("Coleções desconhecidas: "+desconhecidas.join(", "));
    const esperado={}; for(const k of COLECOES) esperado[k]=Object.keys(co[k]||{}).length;
    log("No arquivo: "+COLECOES.map(k=>k+" "+esperado[k]).join(", "));
    if(document.getElementById("limpar").checked){ const r=await sb.from("conc_docs").delete().in("colecao",COLECOES); if(r.error) throw r.error; log("Dados anteriores apagados."); }
    let n=0, total=COLECOES.reduce((s,k)=>s+esperado[k],0);
    for(const col of COLECOES){
      const docs=Object.entries(co[col]||{}).map(([id,data])=>({colecao:col,id,data}));
      const lote=col==="conciliacoes"?3:25;
      for(let i=0;i<docs.length;i+=lote){ const r=await sb.from("conc_docs").upsert(docs.slice(i,i+lote)); if(r.error) throw r.error; n+=Math.min(lote,docs.length-i); log("Gravados "+n+" de "+total); }
    }
    log("\\nConferência (no banco):"); let ok=true;
    for(const col of COLECOES){ const r=await sb.from("conc_docs").select("id",{count:"exact",head:true}).eq("colecao",col); if(r.error) throw r.error;
      if(r.count!==esperado[col]) ok=false; log("  "+col+": "+r.count+(r.count===esperado[col]?"":" (o arquivo tem "+esperado[col]+")")); }
    log(ok?"\\nTudo confere. Abra a Conciliação: /conciliacao":"\\nAs contagens não batem com o arquivo. Tente de novo.");
  }catch(e){ log("\\nERRO: "+(e.message||e)); }
  b.disabled=false;
};
</script></body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
