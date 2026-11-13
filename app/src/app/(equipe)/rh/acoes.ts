"use server";

import { revalidatePath } from "next/cache";
import { perfilAtual, supabaseUsuario } from "@/lib/supabase/server";
import { supabaseServico } from "@/lib/supabase/servico";
import { lerCurriculoPdf, type Leitura } from "@/lib/rh-curriculo";
import { refletirCandidatoNoPlanner } from "@/lib/rh-planner";
import { EM_ABERTO, dataDoBonus, padronizarNome, type Etapa } from "@/lib/rh";
import { hojeSP } from "@/lib/formato";

export type Resultado = { erro?: string; ok?: string; id?: number };
const BUCKET = "rh-curriculos";
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const txt = (v: FormDataEntryValue | null, n = 300) => String(v ?? "").trim().slice(0, n);

async function quem() {
  const p = await perfilAtual();
  return p && p.ativo && (p.papel === "equipe" || p.papel === "admin") ? p : null;
}
const atualizar = (vagaId?: number | null, candId?: number | null) => {
  revalidatePath("/rh");
  if (vagaId) revalidatePath(`/rh/vagas/${vagaId}`);
  if (candId) revalidatePath(`/rh/candidatos/${candId}`);
};

/* ---------- vagas ---------- */
export async function salvarVaga(_: Resultado, f: FormData): Promise<Resultado> {
  const p = await quem();
  if (!p) return { erro: "Sessão expirada. Entre de novo." };
  const sb = await supabaseUsuario();
  const id = Number(f.get("id")) || null;
  const cargo = txt(f.get("cargo"), 80);
  if (!cargo) return { erro: "Informe o cargo." };
  const previsao = txt(f.get("previsao"), 10);
  const aberta = txt(f.get("aberta_em"), 10);
  const fechada = txt(f.get("fechada_em"), 10);
  if ((previsao && !DATA.test(previsao)) || (aberta && !DATA.test(aberta)) || (fechada && !DATA.test(fechada))) return { erro: "Data inválida." };
  // Perguntas marcadas + novas criadas na hora (entram na lista geral).
  const perguntas = f.getAll("perguntas").map(Number).filter(Boolean);
  const novas = f.getAll("nova_pergunta").map((v) => String(v).trim()).filter(Boolean).slice(0, 20);
  const tiposNovas = f.getAll("nova_tipo").map(String);
  const opcoesNovas = f.getAll("nova_opcoes").map(String);
  for (let i = 0; i < novas.length; i++) {
    const tipo = ["sim_nao", "escolha", "numero", "texto"].includes(tiposNovas[i]) ? tiposNovas[i] : "sim_nao";
    const opcoes = tipo === "escolha" ? opcoesNovas[i].split(/[;\n]/).map((o) => o.trim()).filter(Boolean).slice(0, 20) : [];
    const { data, error } = await sb.from("rh_perguntas").insert({ texto: novas[i].slice(0, 200), tipo, opcoes, ordem: 50 }).select("id").single();
    if (error) return { erro: "Não foi possível criar a pergunta nova." };
    perguntas.push(data.id);
  }
  const campos = {
    cargo, area: txt(f.get("area"), 60) || "Comercial", local: txt(f.get("local"), 60) || null,
    quantidade: Math.max(1, Math.min(200, Number(f.get("quantidade")) || 1)), gestor: txt(f.get("gestor"), 80) || null,
    contrato: txt(f.get("contrato"), 40) || "PJ", descricao: txt(f.get("descricao"), 2000) || null,
    previsao: previsao || null, perguntas, ...(aberta ? { aberta_em: aberta } : {}),
    ...(f.has("fechada_em") ? { fechada_em: fechada || null } : {}),
  };
  const r = id
    ? await sb.from("rh_vagas").update(campos).eq("id", id).select("id").single()
    : await sb.from("rh_vagas").insert({ ...campos, criada_por: p.id }).select("id").single();
  if (r.error) return { erro: "Não foi possível salvar a vaga." };
  atualizar(r.data.id);
  return { ok: "Vaga salva.", id: r.data.id };
}

export async function fecharVaga(id: number, fechar: boolean): Promise<Resultado> {
  if (!(await quem())) return { erro: "Sessão expirada. Entre de novo." };
  const sb = await supabaseUsuario();
  const { error } = await sb.from("rh_vagas").update({ fechada_em: fechar ? new Date().toISOString().slice(0, 10) : null }).eq("id", id);
  if (error) return { erro: "Não foi possível salvar." };
  atualizar(id);
  return { ok: fechar ? "Vaga fechada." : "Vaga reaberta." };
}

/* ---------- currículo e candidato repetido ---------- */
export async function prepararCurriculo(nome: string, tamanho: number) {
  if (!(await quem())) return { erro: "Sessão expirada. Entre de novo." };
  if (tamanho > 20 * 1048576) return { erro: "O currículo passa de 20 MB." };
  const limpo = nome.replace(/[^\w.\- ()À-ú]/g, "_").slice(0, 120);
  const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}-${limpo}`;
  const { data, error } = await supabaseServico().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { erro: "Não foi possível preparar o envio." };
  return { path, url: data.signedUrl };
}

export type Repetido = { id: number; nome: string; vaga: string; etapa: string; motivo: string | null; quando: string };

export async function procurarRepetidos(whatsapp: string, email: string, exceto?: number): Promise<Repetido[]> {
  if (!(await quem())) return [];
  const tel = whatsapp.replace(/\D/g, ""), mail = email.trim().toLowerCase();
  const filtros = [tel.length >= 8 ? `whatsapp_norm.like.%${tel.slice(-8)}` : "", mail ? `email_norm.eq.${mail}` : ""].filter(Boolean);
  if (!filtros.length) return [];
  const sb = await supabaseUsuario();
  const { data } = await sb.from("rh_candidatos")
    .select("id, nome, etapa, parou_em, criado_em, rh_vagas(cargo, area, local), rh_motivos(texto)")
    .or(filtros.join(",")).order("criado_em", { ascending: false }).limit(10);
  return (data || []).filter((c) => c.id !== exceto).map((c) => {
    const v = c.rh_vagas as unknown as { cargo: string; area: string; local: string | null } | null;
    return { id: c.id, nome: c.nome, vaga: v ? `${v.cargo} · ${v.area}${v.local ? " " + v.local : ""}` : "", etapa: c.etapa,
      motivo: (c.rh_motivos as unknown as { texto: string } | null)?.texto ?? null, quando: c.criado_em };
  });
}

/** Lê o PDF enviado e devolve o que achou + candidatos repetidos. */
export async function lerCurriculo(path: string): Promise<{ leitura: Leitura; repetidos: Repetido[] }> {
  const vazio = { nome: "", email: "", whatsapp: "", cidade: "", lido: false };
  if (!(await quem())) return { leitura: vazio, repetidos: [] };
  if (!path.toLowerCase().endsWith(".pdf")) return { leitura: vazio, repetidos: [] };
  const { data } = await supabaseServico().storage.from(BUCKET).download(path);
  if (!data) return { leitura: vazio, repetidos: [] };
  const leitura = await lerCurriculoPdf(new Uint8Array(await data.arrayBuffer()));
  return { leitura, repetidos: await procurarRepetidos(leitura.whatsapp, leitura.email) };
}

/* ---------- candidatos ---------- */
export async function criarCandidato(_: Resultado, f: FormData): Promise<Resultado> {
  const p = await quem();
  if (!p) return { erro: "Sessão expirada. Entre de novo." };
  const vagaId = Number(f.get("vaga_id"));
  const nome = padronizarNome(txt(f.get("nome"), 120));
  if (!nome) return { erro: "Informe o nome do candidato." };
  const lgpd = f.get("lgpd") === "on";
  // Modo: inscrito (normal), abordado (busca ativa) ou historico (cadastro retroativo, sem planner).
  const modo = String(f.get("modo") || "inscrito");
  const data_ = (k: string) => { const v = txt(f.get(k), 10); return v && DATA.test(v) ? v : null; };
  const extra: Record<string, unknown> = { perfil_url: txt(f.get("perfil_url"), 500) || null };
  if (modo === "abordado") Object.assign(extra, { etapa: "abordado", contatado_em: data_("contatado_em") || hojeSP() });
  if (modo === "historico") {
    const resultado = String(f.get("resultado") || "");
    if (!["aprovado", "reprovado", "sem_interesse", "inscrito", "triagem", "gestor"].includes(resultado)) return { erro: "Escolha como terminou." };
    const inscrito = data_("inscrito_em");
    if (!inscrito) return { erro: "Informe a data da inscrição." };
    Object.assign(extra, { historico: true, etapa: resultado, inscrito_em: inscrito });
    const ent = data_("entrevista_data");
    if (ent) extra.entrevista_em = new Date(`${ent}T12:00:00-03:00`).toISOString();
    if (resultado === "aprovado") {
      const contr = data_("contratado_em");
      if (!contr) return { erro: "Informe a data da contratação." };
      extra.contratado_em = contr;
      if (f.get("bonus_pago") === "on") extra.bonus_pago_em = dataDoBonus(contr);
    }
    if (resultado === "reprovado" || resultado === "sem_interesse") {
      const motivo = Number(f.get("motivo_id")) || null;
      if (!motivo) return { erro: "Escolha o motivo." };
      const parou = String(f.get("parou_em") || "triagem");
      Object.assign(extra, { motivo_id: motivo, parou_em: ["abordado", "inscrito", "triagem", "gestor"].includes(parou) ? parou : "triagem" });
    }
  }
  const sb = await supabaseUsuario();
  const { data, error } = await sb.from("rh_candidatos").insert({
    ...extra,
    vaga_id: vagaId, nome, whatsapp: txt(f.get("whatsapp"), 30) || null, email: txt(f.get("email"), 120) || null,
    cidade: txt(f.get("cidade"), 80) || null, canal_id: Number(f.get("canal_id")) || null, indicado_por: txt(f.get("indicado_por"), 120) || null,
    curriculo_path: txt(f.get("curriculo_path"), 300) || null, curriculo_nome: txt(f.get("curriculo_nome"), 200) || null,
    observacao: txt(f.get("observacao"), 2000) || null, lgpd_autorizou: lgpd, lgpd_em: lgpd ? new Date().toISOString() : null, criado_por: p.id,
  }).select("id").single();
  if (error) return { erro: "Não foi possível salvar o candidato." };
  atualizar(vagaId);
  return { ok: modo === "historico" ? `${nome} entrou no histórico.` : `${nome} entrou em ${modo === "abordado" ? "Abordados" : "Inscritos"}.`, id: data.id };
}

export async function salvarCandidato(_: Resultado, f: FormData): Promise<Resultado> {
  if (!(await quem())) return { erro: "Sessão expirada. Entre de novo." };
  const id = Number(f.get("id"));
  const sb = await supabaseUsuario();
  const campos: Record<string, unknown> = {};
  for (const k of ["nome", "whatsapp", "email", "cidade", "indicado_por"]) if (f.has(k)) campos[k] = txt(f.get(k), 120) || null;
  if (f.has("nome") && !campos.nome) return { erro: "Informe o nome." };
  if (campos.nome) campos.nome = padronizarNome(String(campos.nome));
  if (f.has("perfil_url")) campos.perfil_url = txt(f.get("perfil_url"), 500) || null;
  for (const k of ["contatado_em", "inscrito_em", "contratado_em"]) if (f.has(k)) {
    const v = txt(f.get(k), 10);
    if (v && !DATA.test(v)) return { erro: "Data inválida." };
    if (k !== "contratado_em" || v) campos[k] = v || null;
  }
  if (f.has("canal_id")) campos.canal_id = Number(f.get("canal_id")) || null;
  if (f.has("observacao")) campos.observacao = txt(f.get("observacao"), 4000) || null;
  if (f.has("consideracao_gestor")) campos.consideracao_gestor = txt(f.get("consideracao_gestor"), 4000) || null;
  if (f.has("nota")) campos.nota = Number(f.get("nota")) || null;
  if (f.has("lgpd_presente")) {
    const lgpd = f.get("lgpd") === "on";
    campos.lgpd_autorizou = lgpd;
    campos.lgpd_em = lgpd ? new Date().toISOString() : null;
  }
  const resp: Record<string, string> = {};
  for (const [k, v] of f.entries()) if (k.startsWith("r_")) resp[k.slice(2)] = String(v).slice(0, 1000);
  if (Object.keys(resp).length || f.has("tem_respostas")) campos.respostas = resp;
  const { data, error } = await sb.from("rh_candidatos").update(campos).eq("id", id).select("vaga_id").single();
  if (error) return { erro: "Não foi possível salvar." };
  atualizar(data.vaga_id, id);
  return { ok: "Salvo." };
}

/** Muda de etapa. Não aprovado exige motivo e guarda onde parou; aprovado guarda a data de contratação. */
export async function moverCandidato(id: number, etapa: Etapa, extra: { motivo_id?: number | null; contratado_em?: string | null } = {}): Promise<Resultado> {
  if (!(await quem())) return { erro: "Sessão expirada. Entre de novo." };
  const sb = await supabaseUsuario();
  const { data: c } = await sb.from("rh_candidatos").select("etapa, vaga_id, recrutador_id").eq("id", id).single();
  if (!c) return { erro: "Candidato não encontrado." };
  const campos: Record<string, unknown> = { etapa };
  if (etapa === "reprovado" || etapa === "sem_interesse") {
    if (!extra.motivo_id) return { erro: "Escolha o motivo." };
    campos.motivo_id = extra.motivo_id;
    campos.parou_em = EM_ABERTO.includes(c.etapa) ? c.etapa : "gestor";
  } else {
    campos.motivo_id = null;
    campos.parou_em = null;
  }
  if (etapa === "aprovado") {
    const d = extra.contratado_em && DATA.test(extra.contratado_em) ? extra.contratado_em : new Date().toISOString().slice(0, 10);
    campos.contratado_em = d;
  } else campos.contratado_em = null;
  const { error } = await sb.from("rh_candidatos").update(campos).eq("id", id);
  if (error) return { erro: "Não foi possível mover." };
  await refletirCandidatoNoPlanner(id, c.recrutador_id);
  atualizar(c.vaga_id, id);
  return { ok: "Etapa atualizada." };
}

/** Marca (ou tira) a entrevista: vira tarefa com hora no planner de quem marcou e vai para o ClickUp. */
export async function marcarEntrevista(id: number, quando: string | null): Promise<Resultado> {
  const p = await quem();
  if (!p) return { erro: "Sessão expirada. Entre de novo." };
  if (quando && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(quando)) return { erro: "Escolha a data e a hora." };
  const sb = await supabaseUsuario();
  const { data: c } = await sb.from("rh_candidatos").select("vaga_id, recrutador_id, etapa").eq("id", id).single();
  if (!c) return { erro: "Candidato não encontrado." };
  const campos: Record<string, unknown> = {
    entrevista_em: quando ? new Date(`${quando}:00-03:00`).toISOString() : null,
    recrutador_id: quando ? p.id : c.recrutador_id,
  };
  // Marcar entrevista de quem está em "Inscritos" já passa para a Triagem.
  if (quando && (c.etapa === "inscrito" || c.etapa === "abordado")) campos.etapa = "triagem";
  const { error } = await sb.from("rh_candidatos").update(campos).eq("id", id);
  if (error) return { erro: "Não foi possível salvar." };
  await refletirCandidatoNoPlanner(id, c.recrutador_id);
  atualizar(c.vaga_id, id);
  return { ok: quando ? "Entrevista marcada e enviada para o seu planner." : "Entrevista desmarcada." };
}

export async function marcarBonusPago(id: number, pago: boolean): Promise<Resultado> {
  if (!(await quem())) return { erro: "Sessão expirada. Entre de novo." };
  const sb = await supabaseUsuario();
  const { data, error } = await sb.from("rh_candidatos").update({ bonus_pago_em: pago ? new Date().toISOString().slice(0, 10) : null }).eq("id", id).select("vaga_id").single();
  if (error) return { erro: "Não foi possível salvar." };
  await refletirCandidatoNoPlanner(id);
  atualizar(data.vaga_id, id);
  return { ok: pago ? "Bônus marcado como pago." : "Bônus voltou para pendente." };
}

export async function apagarCandidato(id: number): Promise<Resultado> {
  if (!(await quem())) return { erro: "Sessão expirada. Entre de novo." };
  const sb = await supabaseUsuario();
  const { data: c } = await sb.from("rh_candidatos").select("vaga_id, curriculo_path, recrutador_id").eq("id", id).single();
  if (!c) return { erro: "Candidato não encontrado." };
  await sb.from("rh_candidatos").update({ entrevista_em: null, etapa: "reprovado", contratado_em: null }).eq("id", id);
  await refletirCandidatoNoPlanner(id, c.recrutador_id);
  const { error } = await sb.from("rh_candidatos").delete().eq("id", id);
  if (error) return { erro: "Não foi possível apagar." };
  if (c.curriculo_path) await supabaseServico().storage.from(BUCKET).remove([c.curriculo_path]);
  atualizar(c.vaga_id);
  return { ok: "Candidato apagado." };
}

/* ---------- configurações (perguntas, motivos, canais, mensagens) ---------- */
type Lista = "rh_perguntas" | "rh_motivos" | "rh_canais" | "rh_mensagens";
export async function salvarItem(tabela: Lista, item: Record<string, unknown>): Promise<Resultado> {
  if (!(await quem())) return { erro: "Sessão expirada. Entre de novo." };
  if (!["rh_perguntas", "rh_motivos", "rh_canais", "rh_mensagens"].includes(tabela)) return { erro: "Lista inválida." };
  const permitidos: Record<Lista, string[]> = {
    rh_perguntas: ["texto", "tipo", "opcoes", "padrao", "ativo", "ordem"],
    rh_motivos: ["texto", "tipo", "ativo", "ordem"],
    rh_canais: ["nome", "eh_indicacao", "ativo", "ordem"],
    rh_mensagens: ["titulo", "texto", "ativo", "ordem"],
  };
  const campos = Object.fromEntries(Object.entries(item).filter(([k]) => permitidos[tabela].includes(k)));
  for (const k of ["texto", "nome", "titulo"]) if (k in campos && !String(campos[k] ?? "").trim()) return { erro: "Preencha o texto." };
  const sb = await supabaseUsuario();
  const id = Number(item.id) || null;
  const { error } = id ? await sb.from(tabela).update(campos).eq("id", id) : await sb.from(tabela).insert(campos);
  if (error) return { erro: error.message.includes("unique") ? "Já existe um item com esse nome." : "Não foi possível salvar." };
  revalidatePath("/rh/config");
  return { ok: "Salvo." };
}
