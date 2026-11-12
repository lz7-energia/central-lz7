import "server-only";
// API REST do ClickUp, chamada só pelo servidor. O token (pk_…) fica na variável CLICKUP_API_TOKEN, nunca no navegador.
/* eslint-disable @typescript-eslint/no-explicit-any */

const BASE = (process.env.CLICKUP_API_BASE || "https://api.clickup.com/api/v2").replace(/\/$/, "");
export const TEAM_ID = process.env.CLICKUP_TEAM_ID || "90171579328";
export const CAT2LIST: Record<string, string> = {
  FIS: "901717543629", CP: "901717854023", GER: "901717861956", CR: "901717862230", RH: "901717862338",
};
export const LIST2CAT: Record<string, string> = Object.fromEntries(Object.entries(CAT2LIST).map(([k, v]) => [v, k]));
export const PRIO_NUM: Record<string, number> = { urgent: 1, high: 2, normal: 3, low: 4 };
export const CLOSED = ["complete", "completed", "closed", "done", "concluído", "concluida", "concluída", "finalizado"];

export class ErroClickUp extends Error {
  constructor(public status: number, public codigo: string, message: string) { super(message); }
  /** Erro passageiro: vale tentar de novo uma vez. */
  get passageiro() { return this.status === 0 || this.status >= 500; }
  get limite() { return this.status === 429; }
  /** A tarefa não existe mais lá (ou não é mais acessível). */
  get naoEncontrada() { return this.status === 404 || /ITEM_0|not.?found|does not exist/i.test(this.codigo + " " + this.message); }
  /** O ClickUp respondeu e recusou: com certeza não criou nem alterou nada. */
  get recusado() { return this.status >= 400 && this.status < 500 && this.status !== 429 && this.status !== 408; }
}

export function mensagemDeErro(e: unknown): string {
  if (e instanceof ErroClickUp) {
    if (e.status === 401) return "token do ClickUp recusado — confira a variável CLICKUP_API_TOKEN";
    if (e.status === 403) return "sem permissão no ClickUp para essa ação";
    if (e.limite) return "limite de chamadas do ClickUp atingido — volto a tentar em 15 minutos; suas edições ficam guardadas";
    if (e.passageiro) return "ClickUp fora do ar, tento de novo depois";
    return `falha ao sincronizar (${e.codigo || e.status}: ${e.message.slice(0, 90)})`;
  }
  return `falha ao sincronizar (${String((e as Error)?.message || e).slice(0, 90)})`;
}

export class ClickUp {
  chamadas = 0;
  constructor(private token = process.env.CLICKUP_API_TOKEN || "") {
    if (!this.token) throw new ErroClickUp(401, "SEM_TOKEN", "CLICKUP_API_TOKEN não configurado no servidor");
  }
  async req(metodo: string, caminho: string, corpo?: any, form?: FormData): Promise<any> {
    this.chamadas++;
    let r: Response;
    try {
      r = await fetch(BASE + caminho, {
        method: metodo,
        headers: { Authorization: this.token, Accept: "application/json", ...(corpo ? { "Content-Type": "application/json" } : {}) },
        body: form ?? (corpo ? JSON.stringify(corpo) : undefined),
        cache: "no-store",
      });
    } catch (e) {
      throw new ErroClickUp(0, "REDE", String((e as Error).message || e));
    }
    const texto = await r.text();
    let json: any = null;
    try { json = texto ? JSON.parse(texto) : null; } catch { json = null; }
    if (!r.ok) throw new ErroClickUp(r.status, json?.ECODE || "", json?.err || texto.slice(0, 200) || `HTTP ${r.status}`);
    return json;
  }

  async membros(): Promise<{ id: number; nome: string; email: string }[]> {
    const r = await this.req("GET", "/team");
    const time = (r?.teams || []).find((t: any) => String(t.id) === TEAM_ID) || r?.teams?.[0];
    return (time?.members || []).map((m: any) => ({ id: m.user.id, nome: m.user.username || m.user.email, email: m.user.email }));
  }
  /** Tarefas abertas atribuídas à pessoa (até 10 páginas de 100). */
  async atribuidas(userId: number | string): Promise<any[]> {
    const todas: any[] = [];
    for (let page = 0; page < 10; page++) {
      const r = await this.req("GET", `/team/${TEAM_ID}/task?assignees[]=${userId}&include_closed=false&subtasks=false&page=${page}`);
      todas.push(...(r?.tasks || []));
      if (!r?.tasks?.length || r.last_page !== false) break;
    }
    return todas;
  }
  tarefa = (id: string) => this.req("GET", `/task/${id}?include_markdown_description=true`);
  criar = (lista: string, corpo: any) => this.req("POST", `/list/${lista}/task`, corpo);
  atualizar = (id: string, corpo: any) => this.req("PUT", `/task/${id}`, corpo);
  excluir = (id: string) => this.req("DELETE", `/task/${id}`);
  comentar = (id: string, texto: string) => this.req("POST", `/task/${id}/comment`, { comment_text: texto, notify_all: false });
  anexar(id: string, arquivo: Blob, nome: string) {
    const f = new FormData();
    f.append("attachment", arquivo, nome);
    return this.req("POST", `/task/${id}/attachment`, undefined, f);
  }
}
