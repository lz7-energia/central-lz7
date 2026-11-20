"use server";

import { revalidatePath } from "next/cache";
import { perfilAtual, supabaseUsuario } from "@/lib/supabase/server";
import { refletirVeiculoNoPlanner } from "@/lib/frota-planner";

export type Resposta = { erro?: string; id?: string };
type Dados = Record<string, string | number | boolean | null | undefined>;

const txt = (v: unknown, max = 300) => { const s = String(v ?? "").trim(); return s ? s.slice(0, max) : null; };
const num = (v: unknown) => { const s = String(v ?? "").trim().replace(/\./g, "").replace(",", "."); if (!s) return null; const n = Number(s); return Number.isFinite(n) ? n : null; };
const inteiro = (v: unknown) => { const n = num(v); return n == null ? null : Math.round(n); };
const data = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : null);
const uuid = (v: unknown) => (/^[0-9a-f-]{36}$/i.test(String(v ?? "")) ? String(v) : null);

async function sessao() {
  const p = await perfilAtual();
  if (!p) throw new Error("login");
  return supabaseUsuario();
}
const pronto = (veiculoId?: string) => { revalidatePath("/frota"); if (veiculoId) revalidatePath(`/frota/${veiculoId}`); };
async function planner(veiculoId: string, antigo?: string | null) {
  try { await refletirVeiculoNoPlanner(veiculoId, antigo); } catch (e) { console.error("frota planner", e); }
}

export async function salvarVeiculo(d: Dados): Promise<Resposta> {
  const sb = await sessao();
  const placa = txt(d.placa, 10)?.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!placa || placa.length < 7) return { erro: "Informe a placa (7 letras/números)." };
  const id = uuid(d.id);
  const linha = {
    placa, modelo: txt(d.modelo, 80) ?? "", marca: txt(d.marca, 60), ano: txt(d.ano, 12), cor: txt(d.cor, 30),
    renavam: txt(d.renavam, 20), chassi: txt(d.chassi, 30), empresa_id: txt(d.empresa_id, 40), unidade_id: uuid(d.unidade_id),
    motorista_colab_id: txt(d.motorista_colab_id, 80), responsavel_id: uuid(d.responsavel_id),
    km_atual: inteiro(d.km_atual), revisao_km: inteiro(d.revisao_km), revisao_data: data(d.revisao_data),
    ativo: d.ativo === undefined ? true : !!d.ativo, obs: txt(d.obs, 2000),
  };
  let antigo: string | null = null;
  if (id) {
    const { data: a } = await sb.from("frota_veiculos").select("responsavel_id, km_atual").eq("id", id).maybeSingle();
    antigo = a?.responsavel_id ?? null;
    const km = linha.km_atual != null && linha.km_atual !== a?.km_atual ? { km_atualizado_em: new Date().toISOString().slice(0, 10) } : {};
    const { error } = await sb.from("frota_veiculos").update({ ...linha, ...km }).eq("id", id);
    if (error) return { erro: error.code === "23505" ? "Já existe um carro com essa placa." : "Não foi possível salvar." };
    await planner(id, antigo);
    pronto(id);
    return { id };
  }
  const { data: novo, error } = await sb.from("frota_veiculos").insert({ ...linha, km_atualizado_em: linha.km_atual != null ? new Date().toISOString().slice(0, 10) : null }).select("id").single();
  if (error) return { erro: error.code === "23505" ? "Já existe um carro com essa placa." : "Não foi possível salvar." };
  await planner(novo.id);
  pronto(novo.id);
  return { id: novo.id };
}

export async function excluirVeiculo(id: string): Promise<Resposta> {
  const sb = await sessao();
  const { data: a } = await sb.from("frota_veiculos").select("responsavel_id").eq("id", id).maybeSingle();
  const { error } = await sb.from("frota_veiculos").delete().eq("id", id);
  if (error) return { erro: "Não foi possível excluir." };
  await planner(id, a?.responsavel_id);
  pronto();
  return {};
}

const TABELAS = {
  documento: "frota_documentos", manutencao: "frota_manutencoes", multa: "frota_multas", abastecimento: "frota_abastecimentos",
} as const;
type Tipo = keyof typeof TABELAS;

function montar(tipo: Tipo, d: Dados): { linha?: Record<string, unknown>; erro?: string } {
  switch (tipo) {
    case "documento": {
      const t = txt(d.tipo, 60); if (!t) return { erro: "Escolha o tipo." };
      return { linha: { tipo: t, descricao: txt(d.descricao, 200), vencimento: data(d.vencimento), aviso_dias: inteiro(d.aviso_dias) ?? 30, valor: num(d.valor), obs: txt(d.obs, 1000) } };
    }
    case "manutencao": {
      const dt = data(d.data); if (!dt) return { erro: "Informe a data." };
      return { linha: { data: dt, km: inteiro(d.km), tipo: txt(d.tipo, 60) ?? "Outro", descricao: txt(d.descricao, 500), oficina: txt(d.oficina, 120), valor: num(d.valor) } };
    }
    case "multa": {
      const dt = data(d.data_infracao); if (!dt) return { erro: "Informe a data da infração." };
      const s = String(d.situacao || "pendente");
      return { linha: { data_infracao: dt, colab_id: txt(d.colab_id, 80), descricao: txt(d.descricao, 500), valor: num(d.valor), vencimento: data(d.vencimento),
        situacao: ["pendente", "paga", "recorrida", "cancelada"].includes(s) ? s : "pendente", obs: txt(d.obs, 1000) } };
    }
    case "abastecimento": {
      const dt = data(d.data); if (!dt) return { erro: "Informe a data." };
      return { linha: { data: dt, litros: num(d.litros), valor: num(d.valor), km: inteiro(d.km), colab_id: txt(d.colab_id, 80), posto: txt(d.posto, 120) } };
    }
  }
}

/** Cria ou altera um registro do carro (documento, manutenção, multa, abastecimento). */
export async function salvarRegistro(tipo: Tipo, veiculoId: string, d: Dados): Promise<Resposta> {
  if (!(tipo in TABELAS) || !uuid(veiculoId)) return { erro: "Dados inválidos." };
  const sb = await sessao();
  const { linha, erro } = montar(tipo, d);
  if (erro || !linha) return { erro };
  const id = uuid(d.id);
  const tabela = TABELAS[tipo];
  // motorista vazio na multa/abastecimento: o banco preenche pelo histórico (só na criação)
  if ((tipo === "multa" || tipo === "abastecimento") && !linha.colab_id && !id) delete linha.colab_id;
  const { error } = id
    ? await sb.from(tabela).update(linha).eq("id", id).eq("veiculo_id", veiculoId)
    : await sb.from(tabela).insert({ ...linha, veiculo_id: veiculoId });
  if (error) return { erro: "Não foi possível salvar." };
  if (tipo === "documento" || tipo === "multa") await planner(veiculoId);
  pronto(veiculoId);
  return {};
}

export async function excluirRegistro(tipo: Tipo, veiculoId: string, id: string): Promise<Resposta> {
  if (!(tipo in TABELAS) || !uuid(veiculoId) || !uuid(id)) return { erro: "Dados inválidos." };
  const sb = await sessao();
  const { error } = await sb.from(TABELAS[tipo]).delete().eq("id", id).eq("veiculo_id", veiculoId);
  if (error) return { erro: "Não foi possível excluir." };
  if (tipo === "documento" || tipo === "multa") await planner(veiculoId);
  pronto(veiculoId);
  return {};
}
