import "server-only";
// "Criar tarefa" de qualquer tela da Central: a tarefa entra no planner (de quem cria ou passada para outras pessoas,
// pelas mesmas regras do "Para quem" do planner) com um link de volta para onde foi criada (campo `link`).
import { after } from "next/server";
import { randomUUID } from "node:crypto";
import { DadosPlanner } from "@/lib/planner/dados";
import { colegas, distribuir } from "@/lib/planner/equipe";
import { sincronizar } from "@/lib/planner/sync";
import type { Tarefa } from "@/lib/planner/regras";

const SITE = process.env.SITE_URL || "https://central-lz7.vercel.app";
export const CATEGORIAS = { FIS: "Fiscal/Adm", CP: "Contas a Pagar", CR: "Contas a Receber", GER: "Gerencial", RH: "RH" } as const;

export type NovaTarefa = {
  titulo: string; data: string; hora?: string; importante?: boolean; cat?: string; obs?: string;
  para?: string[];                         // vazio = para mim; com pessoas = passar a tarefa
  link?: { href: string; rotulo: string }; // onde foi criada (caminho da Central, começando com "/")
};

/** Só caminhos internos da Central (evita link para fora). */
export function linkSeguro(l: NovaTarefa["link"]) {
  if (!l || typeof l.href !== "string") return null;
  const href = l.href.trim();
  if (!href.startsWith("/") || href.startsWith("//") || href.includes("\\") || href.length > 500) return null;
  return { href, rotulo: String(l.rotulo || "Abrir na Central").trim().slice(0, 140) };
}

/** Categoria do planner que combina com a tela. */
export function categoriaDoCaminho(caminho: string) {
  if (/^\/(recebiveis|financiamento|conciliacao|pedidos\?setor=financeiro)/.test(caminho)) return "CR";
  if (/^\/(rh|colaboradores|comissoes|pedidos\?setor=rh)/.test(caminho)) return "RH";
  if (/^\/(fiscal|painel|arquivos|pedidos\?setor=(fiscal|adm))/.test(caminho)) return "FIS";
  return "GER";
}

export async function criarTarefaLigada(autor: { id: string; nome: string; email: string }, e: NovaTarefa): Promise<{ erro?: string; id?: string; para?: string[] }> {
  const titulo = String(e.titulo || "").trim().slice(0, 200);
  if (!titulo) return { erro: "Escreva o que precisa ser feito." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e.data || ""))) return { erro: "Escolha a data." };
  const hora = /^\d{2}:\d{2}$/.test(String(e.hora || "")) ? String(e.hora) : "";
  const link = linkSeguro(e.link);
  const cat = e.cat && e.cat in CATEGORIAS ? e.cat : categoriaDoCaminho(link?.href || "");
  const time = await colegas();
  const para = [...new Set((e.para || []).map(String))].filter((id) => id !== autor.id && time.some((c) => c.id === id));

  const obs = String(e.obs || "").trim().slice(0, 4000);
  const desc = [obs, link ? `Na Central (${link.rotulo}): ${SITE}${link.href}` : ""].filter(Boolean).join("\n\n");
  const agora = Date.now();
  const id = "lig-" + randomUUID().replace(/-/g, "").slice(0, 16);
  const t: Tarefa = {
    id, title: titulo, desc, cat, start: e.data, time: hora, rec: { type: "none" },
    important: !!e.importante, dailyQ: 1, subs: [], done: {}, subDone: {}, files: [], comments: [],
    ...(link ? { link } : {}),
    ...(para.length ? { tipo: "tarefa", para } : {}),
    createdAt: agora, updatedAt: agora,
  };
  const d = new DadosPlanner(autor.id);
  await d.gravarTarefa(t);
  try { await distribuir(autor, t, null); } catch (err) { console.error("tarefa ligada", err); }
  // Tarefa só minha vai ao meu ClickUp; passada, cada pessoa recebe pela própria sincronização (feita no distribuir).
  if (!para.length) after(async () => { await sincronizar(autor.id, "edit", autor.email).catch(() => {}); });
  return { id, para };
}
