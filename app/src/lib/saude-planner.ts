import "server-only";
// Aviso de sincronização parada: se as duas últimas rodadas de uma sincronização (Flow, Fiscal, DFC) falharam,
// cai a tarefa "Sincronização com falha: <nome>" no planner de cada administrador (id "saude-<recurso>"), com link para /sistema.
// Some sozinha quando a sincronização volta a dar certo. Roda no agendador do planner (15 min).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseServico } from "@/lib/supabase/servico";
import { DadosPlanner } from "@/lib/planner/dados";

const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

export async function refletirSaude() {
  const sb = supabaseServico();
  const [{ data: funcoes }, { data: admins }] = await Promise.all([
    sb.from("sync_funcoes").select("recurso, nome"),
    sb.from("perfis").select("id").eq("papel", "admin").eq("ativo", true),
  ]);
  if (!funcoes?.length || !admins?.length) return;
  const agora = Date.now();
  for (const f of funcoes) {
    const { data: rod } = await sb.from("sincronizacoes").select("sucesso, erro, iniciada_em").eq("recurso", f.recurso)
      .not("sucesso", "is", null).order("iniciada_em", { ascending: false }).limit(2);
    const falhou = (rod?.length ?? 0) === 2 && rod!.every((r) => r.sucesso === false);
    const id = `saude-${f.recurso}`;
    for (const a of admins) {
      const d = new DadosPlanner(a.id);
      const atual = await d.tarefa(id);
      if (!falhou) { if (atual) await d.apagarTarefa(id); continue; }
      if (atual) continue; // já avisado; não mexe para não reabrir o que a pessoa já viu
      await d.gravarTarefa({
        id, title: `Sincronização com falha: ${f.nome}`, start: hojeSP(), urgentDays: 0, important: true,
        desc: `As duas últimas rodadas falharam.\nÚltimo erro: ${rod![0].erro ?? "sem mensagem"}\nVeja em Sistema: /sistema`,
        cat: "GER", rec: { type: "none" }, time: "", subs: [], done: {}, subDone: {}, files: [], comments: [], dailyQ: 1,
        soCentral: true, link: { href: "/sistema", rotulo: "Sistema" }, createdAt: agora, updatedAt: agora,
      } as any);
    }
  }
}
