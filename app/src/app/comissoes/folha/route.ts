import { NextResponse } from "next/server";
import { paginaAviso, tokenDaSessao } from "@/lib/colaboradores";
import { pessoaCom } from "@/lib/comissoes";
import { perfilAtual } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const json = (x: unknown) => JSON.stringify(x).replace(/</g, "\\u003c");

/** Conferência entre a folha (Colaboradores e folha, setor Comercial) e o cadastro das Comissões. Só equipe e admin.
 *  Os dados vêm de com_conferencia_folha (sem CPF nem Pix). */
export async function GET(req: Request) {
  const p = await pessoaCom();
  if (!p) {
    if (!(await perfilAtual())) return NextResponse.redirect(new URL("/entrar?volta=/comissoes/folha", req.url));
    return paginaAviso("Sem acesso", "As comissões são vistas só pela equipe principal da Central.", 403);
  }
  const t = await tokenDaSessao();
  if (!t) return paginaAviso("Sessão não encontrada", "Clique em \"Entrar de novo\" e tente outra vez.");
  const central = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, token: t.token };
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Comissões × folha · Central LZ7</title><link rel="icon" href="/icon.png">
<style>body{font-family:Inter,system-ui,sans-serif;max-width:900px;margin:32px auto;padding:0 20px;color:#17201c;background:#f6f7f6;font-size:14px}
a{color:#124734;font-weight:600}h1{font-size:1.35rem;margin:8px 0 4px}.sub{color:#57635d;margin:0 0 18px}
.c{background:#fff;border:1px solid #e3e7e5;border-radius:10px;padding:16px 18px;margin-bottom:14px}.c h2{font-size:1rem;margin:0 0 4px}
.c p.n{color:#57635d;margin:0 0 10px}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:7px 6px;border-top:1px solid #eef1ef;vertical-align:top}
th{font-size:12px;color:#7f8a84;font-weight:600;border-top:0}.vazio{color:#7f8a84}.kpis{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.k{background:#fff;border:1px solid #e3e7e5;border-radius:10px;padding:10px 14px;min-width:150px}.k b{display:block;font-size:1.3rem}.k span{color:#57635d;font-size:12.5px}
button{background:#124734;color:#fff;border:0;border-radius:8px;padding:7px 12px;font-size:13px;cursor:pointer}button.sec{background:#fff;color:#124734;border:1px solid #cfd6d2}
button:disabled{opacity:.5}.barra{display:flex;gap:10px;align-items:center;margin-bottom:14px}.msg{color:#57635d}</style></head><body>
<p><a href="/comissoes#vendedores">‹ Comissões</a></p>
<h1>Comissões × Colaboradores e folha</h1>
<p class="sub">A folha é o cadastro principal de quem é do setor Comercial: nome, CPF, chave Pix e desligamento vêm de lá sozinhos.
Cargo, unidade, regra de comissão, salário base e "Nomes no Flow" continuam nas Comissões.</p>
<div class="barra"><button id="sinc">Sincronizar agora</button><span class="msg" id="msg"></span></div>
<div class="kpis" id="kpis"></div>
<div id="corpo"><div class="c vazio">Carregando…</div></div>
<script src="/colab-app/vendor/supabase.js"></script>
<script>
const C=${json(central)};
const sb=window.supabase.createClient(C.url,C.anon,{accessToken:async()=>C.token});
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]);
const dt=s=>/^\\d{4}-\\d{2}-\\d{2}$/.test(s||"")?s.split("-").reverse().join("/"):"—";
const msg=t=>{document.getElementById("msg").textContent=t||"";};
function bloco(titulo,nota,linhas,cab,linha){
  return '<div class="c"><h2>'+esc(titulo)+' <span class="vazio">('+linhas.length+')</span></h2><p class="n">'+nota+'</p>'+
    (linhas.length?'<table><thead><tr>'+cab.map(x=>'<th>'+x+'</th>').join("")+'</tr></thead><tbody>'+linhas.map(linha).join("")+'</tbody></table>':'<div class="vazio">Nada aqui.</div>')+'</div>';
}
async function carregar(){
  const {data:c,error}=await sb.rpc("com_conferencia_folha");
  if(error){ document.getElementById("corpo").innerHTML='<div class="c">Erro: '+esc(error.message)+'</div>'; return; }
  document.getElementById("kpis").innerHTML=
    '<div class="k"><b>'+c.comercial_folha+'</b><span>ativos no Comercial na folha</span></div>'+
    '<div class="k"><b>'+c.vinculados+'</b><span>ativos nas Comissões ligados à folha</span></div>'+
    '<div class="k"><b>'+c.pendentes.length+'</b><span>pendentes de cargo</span></div>';
  document.getElementById("corpo").innerHTML=
    bloco("Pendentes de cargo","Vieram da folha e ainda não têm unidade e cargo nas Comissões. Os pedidos deles ficam em \\"vendedor não cadastrado\\" até você abrir o cadastro em <b>Vendedores</b>, escolher unidade e cargo e conferir os \\"Nomes no Flow\\".",
      c.pendentes,["Nome","Unidade na folha","Admissão"],x=>'<tr><td><b>'+esc(x.nome)+'</b></td><td>'+esc(x.unidade_folha||"—")+'</td><td>'+dt(x.admissao)+'</td></tr>')+
    bloco("Data de início diferente da admissão","Nas Comissões a data de início define o 1º, 2º e 3º mês da meta, então ela não muda sozinha. Use a da folha só se for a correta para a meta.",
      c.admissao,["Nome","Início nas Comissões","Admissão na folha",""],x=>'<tr><td><b>'+esc(x.nome)+'</b></td><td>'+dt(x.comissoes)+'</td><td>'+dt(x.folha)+'</td><td><button class="sec" data-adm="'+esc(x.id)+'">Usar a da folha</button></td></tr>')+
    bloco("Ligados à folha, mas fora do setor Comercial","Continuam nas Comissões como estão. Se saíram das vendas, desligue ou ajuste o cargo nas Comissões.",
      c.fora_do_comercial,["Nome","Setor na folha"],x=>'<tr><td><b>'+esc(x.nome)+'</b></td><td>'+esc(x.setor||"—")+'</td></tr>')+
    bloco("Nas Comissões sem par na folha","Ativos nas Comissões que não foram encontrados na folha (nem pelo CPF, nem pelo nome). Representantes externos costumam ficar aqui. Se a pessoa está na folha com outro nome ou sem CPF, corrija lá que a ligação é feita sozinha.",
      c.sem_folha,["Nome"],x=>'<tr><td><b>'+esc(x.nome)+'</b></td></tr>');
  document.querySelectorAll("[data-adm]").forEach(b=>{ b.onclick=async()=>{
    if(!confirm("Usar a admissão da folha como data de início? Isso muda o mês da meta (1º, 2º e 3º mês) nas Comissões.")) return;
    b.disabled=true; const {error}=await sb.rpc("com_usar_admissao_folha",{p_pessoa:b.dataset.adm});
    if(error){ alert(error.message); b.disabled=false; return; } msg("Data de início atualizada."); carregar(); }; });
}
document.getElementById("sinc").onclick=async(e)=>{
  e.target.disabled=true; msg("Sincronizando…");
  const {data,error}=await sb.rpc("com_sincronizar_folha");
  e.target.disabled=false;
  if(error){ msg("Erro: "+error.message); return; }
  const n=k=>data[k]||0; msg("Pronto: "+n("criado")+" novo(s), "+n("atualizado")+" atualizado(s), "+n("desligado")+" desligado(s).");
  carregar();
};
carregar();
</script></body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
