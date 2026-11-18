import { NextResponse } from "next/server";
import { paginaAviso, tokenDaSessao } from "@/lib/colaboradores";
import { pessoaCom } from "@/lib/comissoes";
import { perfilAtual } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const json = (x: unknown) => JSON.stringify(x).replace(/</g, "\\u003c");

/** Migração única do backup da plataforma Comissões LZ7 (backup-completo-AAAA-MM-DD.json: { colecao: { id: dados } }).
 *  Só o administrador. O arquivo é lido no navegador e gravado direto no banco, sem mudar ids nem conteúdo
 *  (tem CPF, chave Pix e salários: não vai para o repositório). */
export async function GET(req: Request) {
  const p = await pessoaCom();
  if (!p) {
    if (!(await perfilAtual())) return NextResponse.redirect(new URL("/entrar?volta=/comissoes/importar", req.url));
    return paginaAviso("Sem acesso", "As comissões são vistas só pela equipe principal da Central.", 403);
  }
  if (p.papel !== "admin") return paginaAviso("Só o administrador", "Só o administrador pode fazer a migração.", 403);
  const t = await tokenDaSessao();
  if (!t) return paginaAviso("Sessão não encontrada", "Clique em \"Entrar de novo\" e tente outra vez.");
  const central = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, token: t.token };
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Migrar Comissões LZ7</title><link rel="icon" href="/icon.png">
<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;color:#14201a;background:#f1f5f2}
.c{background:#fff;border:1px solid #d8e2db;border-radius:10px;padding:20px;margin-bottom:16px}h1{font-size:1.4rem}label{display:block;font-weight:600;margin:12px 0 4px}
button{background:#124735;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:1rem;cursor:pointer}button:disabled{opacity:.5}
pre{background:#f6f9f7;border:1px solid #d8e2db;border-radius:8px;padding:12px;white-space:pre-wrap;font-size:.86rem;max-height:420px;overflow:auto}</style></head><body>
<p><a href="/comissoes">‹ Comissões LZ7</a></p>
<div class="c"><h1>Migrar dados da plataforma Comissões LZ7</h1>
<p>Escolha o arquivo <b>backup-completo-2026-11-17.json</b> (pasta <i>dados</i> do pacote). Ele grava todos os documentos com os mesmos ids e o mesmo conteúdo: configuração, unidades, cargos, colaboradores, pedidos, ajustes, lançamentos, fechamentos, recibos, pagamentos e auditoria.</p>
<p><b>Faça isso antes de alguém abrir a plataforma</b>: com o banco vazio, a plataforma cria cadastros padrão. Se já tiver aberto, deixe marcada a opção abaixo.</p>
<label>Backup completo (.json)</label><input type="file" id="fj" accept=".json,application/json">
<p><label style="display:inline;font-weight:400"><input type="checkbox" id="limpar" checked> Apagar antes o que já estiver na plataforma (para ficar idêntico ao arquivo)</label></p>
<button id="ir">Migrar</button></div>
<div class="c"><b>Andamento</b><pre id="log">Aguardando o arquivo…</pre></div>
<script src="/colab-app/vendor/supabase.js"></script>
<script>
const C=${json(central)};
const COLECOES=["cfg","unidades","cargos","pessoas","pedidos","ajustes","apuracoes","lancamentos","fechamentos","recibos","pagamentos","auditoria"];
const ESPERADO={cfg:1,unidades:4,cargos:9,pessoas:22,pedidos:5,ajustes:9,lancamentos:1,fechamentos:1,recibos:17,pagamentos:1,auditoria:72};
const sb=window.supabase.createClient(C.url,C.anon,{accessToken:async()=>C.token});
const L=document.getElementById("log"); const log=t=>{L.textContent+="\\n"+t; L.scrollTop=1e9;};
document.getElementById("ir").onclick=async()=>{
  const fj=document.getElementById("fj").files[0];
  if(!fj){ alert("Escolha o arquivo de backup."); return; }
  const b=document.getElementById("ir"); b.disabled=true; L.textContent="Lendo o arquivo…";
  try{
    const d=JSON.parse(await fj.text());
    if(!d||typeof d!=="object"||!d.cfg||!d.pessoas) throw new Error("Este arquivo não é o backup da plataforma (faltam cfg e pessoas).");
    const desconhecidas=Object.keys(d).filter(k=>!COLECOES.includes(k));
    if(desconhecidas.length) throw new Error("Coleções desconhecidas no arquivo: "+desconhecidas.join(", "));
    const docs=[];
    for(const col of Object.keys(d)) for(const [id,data] of Object.entries(d[col]||{})) docs.push({colecao:col,id,data});
    if(document.getElementById("limpar").checked){ const r=await sb.from("com_docs").delete().in("colecao",COLECOES); if(r.error) throw r.error; log("Dados anteriores apagados."); }
    for(let i=0;i<docs.length;i+=20){ const r=await sb.from("com_docs").upsert(docs.slice(i,i+20)); if(r.error) throw r.error; log("Gravados "+Math.min(i+20,docs.length)+" de "+docs.length); }
    log("\\nConferência (no banco):");
    let ok=true;
    for(const col of COLECOES){
      const r=await sb.from("com_docs").select("id",{count:"exact",head:true}).eq("colecao",col); if(r.error) throw r.error;
      const esp=ESPERADO[col]??0; if(r.count!==esp) ok=false;
      log("  "+col+": "+r.count+(r.count===esp?"":" (o pacote de 17/11 tinha "+esp+")"));
    }
    const sf=await sb.rpc("com_sincronizar_folha");
    if(sf.error) log("\\nSincronização com a folha: erro ("+sf.error.message+")");
    else { const n=k=>sf.data[k]||0; log("\\nFolha (setor Comercial): "+n("atualizado")+" cadastro(s) atualizado(s), "+n("criado")+" novo(s) pendente(s) de cargo, "+n("desligado")+" desligado(s). Detalhes em /comissoes/folha"); }
    log(ok?"\\nTudo confere com o pacote. Abra a plataforma: /comissoes → Apuração → outubro/2026 (total R$ 25.578,68).":"\\nAs contagens diferem do pacote de 17/11 — confira se é o arquivo certo.");
  }catch(e){ log("\\nERRO: "+(e.message||e)); }
  b.disabled=false;
};
</script></body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
