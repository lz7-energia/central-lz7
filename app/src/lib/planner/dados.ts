import "server-only";
// Leitura e gravação dos dados do planner no banco da Central (chave de serviço, sempre filtrando pela pessoa).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseServico } from "@/lib/supabase/servico";
import { mergeSettings, type Evento, type Tarefa } from "./regras";

/** Campos de controle da sincronização: quem grava é o servidor; o navegador nunca os sobrescreve. */
export const CAMPOS_DO_SERVIDOR = [
  "clickupId", "clickupUrl", "syncedAt", "cuUpdated", "cuName", "cuDesc", "cuDue", "cuPrio", "cuDone",
  "cuCreating", "cuNeedReopen", "cuRemoved", "cuErro",
  // tarefas entre a equipe (lib/planner/equipe.ts)
  "soCentral", "paraRecusas", "de", "origem", "origemHash",
] as const;

export type Estado = { tasks: Tarefa[]; events: Evento[]; settings: any; sync: any; status: any };

export class DadosPlanner {
  sb = supabaseServico();
  constructor(public userId: string) {}

  async estado(): Promise<Estado> {
    const [t, e, s, y] = await Promise.all([
      this.todas("planner_tasks"),
      this.todas("planner_events"),
      this.sb.from("planner_settings").select("data").eq("user_id", this.userId).maybeSingle(),
      this.sb.from("planner_sync_state").select("data, ultima_execucao, ultimo_status, ultima_mensagem").eq("user_id", this.userId).maybeSingle(),
    ]);
    return {
      tasks: t.map((r) => ({ ...r.data, id: r.id })),
      events: e.map((r) => ({ ...r.data, id: r.id })),
      settings: mergeSettings(s.data?.data),
      sync: y.data?.data || {},
      status: { em: y.data?.ultima_execucao, status: y.data?.ultimo_status, mensagem: y.data?.ultima_mensagem },
    };
  }
  private async todas(tabela: string): Promise<any[]> {
    const linhas: any[] = [];
    for (let de = 0; de < 200_000; ) {
      const { data, error } = await this.sb.from(tabela).select("id, data").eq("user_id", this.userId).order("id").range(de, de + 999);
      if (error) throw new Error(`${tabela}: ${error.message}`);
      if (!data?.length) break;
      linhas.push(...data);
      de += data.length;
    }
    return linhas;
  }
  async tarefa(id: string): Promise<Tarefa | null> {
    const { data } = await this.sb.from("planner_tasks").select("data").eq("user_id", this.userId).eq("id", id).maybeSingle();
    return data ? { ...data.data, id } : null;
  }
  async gravarTarefa(t: Tarefa) {
    const { error } = await this.sb.from("planner_tasks")
      .upsert({ user_id: this.userId, id: t.id, data: t, atualizado_em: new Date().toISOString() });
    if (error) throw new Error("tarefa: " + error.message);
  }
  /** Lê a versão atual do banco, aplica a mudança e grava (evita apagar uma edição feita no meio da sincronização). */
  async mudarTarefa(id: string, fn: (atual: Tarefa) => Tarefa | null): Promise<Tarefa | null> {
    const atual = await this.tarefa(id);
    if (!atual) return null;
    const nova = fn(atual);
    if (nova) await this.gravarTarefa(nova);
    return nova;
  }
  async apagarTarefa(id: string) {
    await this.sb.from("planner_tasks").delete().eq("user_id", this.userId).eq("id", id);
  }
  async sync(): Promise<any> {
    const { data } = await this.sb.from("planner_sync_state").select("data").eq("user_id", this.userId).maybeSingle();
    return data?.data || {};
  }
  /** Mescla campos no estado da sincronização (lendo a versão atual). */
  async mudarSync(patch: any | ((s: any) => any)) {
    const atual = await this.sync();
    const novo = typeof patch === "function" ? patch(atual) : { ...atual, ...patch };
    const { error } = await this.sb.from("planner_sync_state")
      .upsert({ user_id: this.userId, data: novo, atualizado_em: new Date().toISOString() });
    if (error) throw new Error("sync: " + error.message);
    return novo;
  }
  async travar(): Promise<boolean> {
    const { data, error } = await this.sb.rpc("planner_travar_sync", { p_user: this.userId });
    if (error) throw new Error("trava: " + error.message);
    return !!data;
  }
  async soltar(status: "ok" | "erro", mensagem: string) {
    await this.sb.from("planner_sync_state").update({
      sincronizando_ate: null, ultima_execucao: new Date().toISOString(), ultimo_status: status, ultima_mensagem: mensagem,
    }).eq("user_id", this.userId);
  }
}

/** Junta o que o navegador mandou com o que está no banco, preservando os campos do servidor. */
export function mesclarDoNavegador(nova: Tarefa, atual: Tarefa | null): Tarefa {
  if (!atual) {
    const limpa: any = { ...nova };
    for (const c of CAMPOS_DO_SERVIDOR) delete limpa[c];
    return limpa;
  }
  const r: any = { ...nova };
  for (const c of CAMPOS_DO_SERVIDOR) {
    if (atual[c] === undefined) delete r[c];
    else r[c] = atual[c];
  }
  // Anexos e comentários: as marcas de envio ao ClickUp são do servidor.
  const fa = new Map((atual.files || []).map((f: any) => [f.id, f]));
  r.files = (nova.files || []).map((f: any) => {
    const v: any = fa.get(f.id);
    return v ? { ...f, cu: v.cu, cuOnly: v.cuOnly, cuPending: v.cuPending } : f;
  });
  const ca = new Map((atual.comments || []).map((c: any) => [c.id, c]));
  r.comments = (nova.comments || []).map((c: any) => {
    const v: any = ca.get(c.id);
    return v ? { ...c, cu: v.cu } : c;
  });
  return r;
}
