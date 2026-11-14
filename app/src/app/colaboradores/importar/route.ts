import { NextResponse } from "next/server";
import { paginaAviso, pessoaColab, tokenDaSessao } from "@/lib/colaboradores";
import { perfilAtual } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const json = (x: unknown) => JSON.stringify(x).replace(/</g, "\\u003c");

/** Importação única dos dados da plataforma antiga (dados_plataforma.json + anexos/<assetId>.pdf). Só o administrador.
 *  Os arquivos são lidos no navegador e gravados direto no banco/bucket; nada passa pelo repositório. */
export async function GET(req: Request) {
  const p = await pessoaColab();
  if (!p) {
    const quem = await perfilAtual();
    if (!quem) return NextResponse.redirect(new URL("/entrar?volta=/colaboradores/importar", req.url));
    return paginaAviso("Sem acesso", "A plataforma de colaboradores é só da equipe da Central e do administrador.", 403);
  }
  if (p.papel !== "admin") return new NextResponse("Só o administrador pode importar.", { status: 403 });
  const t = await tokenDaSessao();
  if (!t) return paginaAviso("Sessão não encontrada", "Você está logado, mas o site não conseguiu ler a sessão para abrir a plataforma. Clique em \"Entrar de novo\" e tente outra vez.");
  const central = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, token: t.token };
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Importar plataforma de colaboradores</title><link rel="icon" href="/icon.png">
<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;color:#14201a;background:#f1f5f2}
.c{background:#fff;border:1px solid #d8e2db;border-radius:10px;padding:20px;margin-bottom:16px}h1{font-size:1.4rem}label{display:block;font-weight:600;margin:12px 0 4px}
button{background:#124735;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:1rem;cursor:pointer}button:disabled{opacity:.5}
pre{background:#f6f9f7;border:1px solid #d8e2db;border-radius:8px;padding:12px;white-space:pre-wrap;font-size:.86rem;max-height:420px;overflow:auto}.av{color:#9a5b00}</style></head><body>
<p><a href="/colaboradores">‹ Plataforma de colaboradores</a></p>
<div class="c"><h1>Importar dados da plataforma antiga</h1>
<p>Escolha o arquivo <b>dados_plataforma.json</b> e os PDFs da pasta <b>anexos</b> do pacote de migração. Os dados vão direto para o banco (com CPF, salários e dados bancários): não guarde cópias depois.</p>
<label>dados_plataforma.json</label><input type="file" id="fj" accept=".json,application/json">
<label>Anexos (selecione os PDFs da pasta anexos)</label><input type="file" id="fa" accept=".pdf,application/pdf" multiple>
<p><label style="display:inline;font-weight:400"><input type="checkbox" id="limpar" checked> Apagar antes os dados atuais da plataforma (para a importação ficar idêntica ao arquivo)</label></p>
<button id="ir">Importar</button></div>
<div class="c"><b>Andamento</b><pre id="log">Aguardando os arquivos…</pre></div>
<script src="/colab-app/vendor/supabase.js"></script>
<script>
const C=${json(central)};
const sb=window.supabase.createClient(C.url,C.anon,{accessToken:async()=>C.token});
const L=document.getElementById("log"); const log=t=>{L.textContent+="\\n"+t; L.scrollTop=1e9;};
const COLS=["colab","setores","produtos","itens","entregas","eventos","folhas","config","log"];
document.getElementById("ir").onclick=async()=>{
  const fj=document.getElementById("fj").files[0], fa=[...document.getElementById("fa").files].filter(f=>/\\.pdf$/i.test(f.name));
  if(!fj){ alert("Escolha o dados_plataforma.json."); return; }
  const b=document.getElementById("ir"); b.disabled=true; L.textContent="Lendo o arquivo…";
  try{
    const d=JSON.parse(await fj.text());
    if(document.getElementById("limpar").checked){
      const r=await sb.from("plat_docs").delete().in("colecao",COLS); if(r.error) throw r.error; log("Dados anteriores apagados.");
    }
    let total=0;
    for(const col of COLS){
      const docs=Object.entries(d[col]||{}).map(([id,data])=>({colecao:col,id,data}));
      for(let i=0;i<docs.length;i+=200){ const r=await sb.from("plat_docs").upsert(docs.slice(i,i+200)); if(r.error) throw r.error; }
      total+=docs.length; log(col+": "+docs.length);
    }
    log("Documentos importados: "+total);
    let ok=0;
    for(const f of fa){
      const id=f.name.replace(/\\.pdf$/i,"");
      const r=await fetch("/colaboradores/api/anexo",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,nome:f.name,tamanho:f.size,tipo:f.type})});
      const j=await r.json(); if(!r.ok) throw new Error(j.erro||"Falhou o anexo "+f.name);
      const up=await fetch(j.url,{method:"PUT",headers:{"Content-Type":f.type||"application/pdf","x-upsert":"true"},body:f});
      if(!up.ok) throw new Error("Falhou o envio de "+f.name); ok++; log("Anexo "+ok+"/"+fa.length+": "+f.name);
    }
    // confere se todo anexo citado na folha chegou
    const citados=new Set(); Object.values(d.folhas||{}).forEach(fo=>Object.values(fo.linhas||{}).forEach(l=>[...(l.comissoes||[]),...(l.docs||[])].forEach(a=>a&&a.assetId&&citados.add(a.assetId))));
    const enviados=new Set(fa.map(f=>f.name.replace(/\\.pdf$/i,""))); const faltam=[...citados].filter(x=>!enviados.has(x));
    log(faltam.length? "\\n⚠ Anexos citados na folha que não foram enviados: "+faltam.join(", ") : "\\nTodos os "+citados.size+" anexos citados nas folhas foram enviados.");
    log("\\nPronto. Abra a plataforma: /colaboradores");
  }catch(e){ log("\\nERRO: "+(e.message||e)); }
  b.disabled=false;
};
</script></body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
