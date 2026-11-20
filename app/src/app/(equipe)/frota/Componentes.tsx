"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Colab, Veiculo } from "@/lib/frota";
import type { Listas } from "@/lib/frota-dados";
import { excluirRegistro, excluirVeiculo, salvarRegistro, salvarVeiculo } from "./acoes";

type Valor = string | number | boolean | null | undefined;
type Linha = Record<string, Valor> & { id: string };

function SelectColab({ name, valor, colabs, vazio = "— ninguém —" }: { name: string; valor?: string | null; colabs: Colab[]; vazio?: string }) {
  const ativos = colabs.filter((c) => !c.desligado || c.id === valor);
  return (
    <select name={name} defaultValue={valor ?? ""}>
      <option value="">{vazio}</option>
      {ativos.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.setor ? ` · ${c.setor}` : ""}{c.desligado ? " (desligado)" : ""}</option>)}
    </select>
  );
}

/** Cadastro / edição do carro. */
export function FormVeiculo({ v, listas, aoTerminar }: { v?: Veiculo; listas: Listas; aoTerminar?: () => void }) {
  const router = useRouter();
  const [erro, setErro] = useState("");
  const [pendente, iniciar] = useTransition();
  const [empresa, setEmpresa] = useState(v?.empresa_id ?? "");
  const enviar = (form: FormData) => iniciar(async () => {
    setErro("");
    const d = Object.fromEntries(form.entries()) as Record<string, string>;
    const r = await salvarVeiculo({ ...d, id: v?.id, ativo: v ? form.get("ativo") === "on" : true });
    if (r.erro) { setErro(r.erro); return; }
    if (!v && r.id) router.push(`/frota/${r.id}`); else { aoTerminar?.(); router.refresh(); }
  });
  return (
    <form action={enviar} className="cartao frota-form">
      <div className="frota-grade">
        <label>Placa *<input name="placa" defaultValue={v?.placa ?? ""} required maxLength={8} placeholder="ABC1D23" style={{ textTransform: "uppercase" }} /></label>
        <label>Modelo<input name="modelo" defaultValue={v?.modelo ?? ""} placeholder="Strada 1.4" /></label>
        <label>Marca<input name="marca" defaultValue={v?.marca ?? ""} placeholder="Fiat" /></label>
        <label>Ano<input name="ano" defaultValue={v?.ano ?? ""} placeholder="2022/2023" /></label>
        <label>Cor<input name="cor" defaultValue={v?.cor ?? ""} /></label>
        <label>Renavam<input name="renavam" defaultValue={v?.renavam ?? ""} /></label>
        <label>Chassi<input name="chassi" defaultValue={v?.chassi ?? ""} /></label>
        <label>Empresa
          <select name="empresa_id" value={empresa} onChange={(e) => setEmpresa(e.target.value)}>
            <option value="">—</option>
            {listas.empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        </label>
        <label>Unidade
          <select name="unidade_id" defaultValue={v?.unidade_id ?? ""} key={empresa}>
            <option value="">—</option>
            {listas.unidades.filter((u) => u.empresa_id === empresa).map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </label>
        <label>Motorista (folha)<SelectColab name="motorista_colab_id" valor={v?.motorista_colab_id} colabs={listas.colabs} /></label>
        <label>Responsável na Central
          <select name="responsavel_id" defaultValue={v?.responsavel_id ?? ""}>
            <option value="">— ninguém —</option>
            {listas.perfis.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
          <span className="mudo pequeno">Recebe no planner os avisos de vencimento, revisão e multa.</span>
        </label>
        <label>Km atual<input name="km_atual" inputMode="numeric" defaultValue={v?.km_atual ?? ""} /></label>
        <label>Próxima revisão (km)<input name="revisao_km" inputMode="numeric" defaultValue={v?.revisao_km ?? ""} /></label>
        <label>Próxima revisão (data)<input name="revisao_data" type="date" defaultValue={v?.revisao_data ?? ""} /></label>
      </div>
      <label>Observações<textarea name="obs" rows={2} defaultValue={v?.obs ?? ""} /></label>
      {v && <label className="frota-check"><input type="checkbox" name="ativo" defaultChecked={v.ativo} /> Carro em uso (desmarque se foi vendido ou devolvido)</label>}
      {erro && <p className="erro">{erro}</p>}
      <div className="frota-acoes">
        <button className="botao" disabled={pendente}>{pendente ? "Salvando…" : v ? "Salvar" : "Cadastrar carro"}</button>
        {aoTerminar && <button type="button" className="botao secundario" onClick={aoTerminar}>Cancelar</button>}
      </div>
    </form>
  );
}

export function EditarVeiculo({ v, listas }: { v: Veiculo; listas: Listas }) {
  const [aberto, setAberto] = useState(false);
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  if (!aberto) return (
    <span className="frota-acoes">
      <button className="botao secundario pequeno" onClick={() => setAberto(true)}>Editar carro</button>
      <button className="link-acao" disabled={pendente} onClick={() => {
        if (!confirm(`Excluir o carro ${v.placa} com todo o histórico (documentos, manutenções, multas e abastecimentos)?`)) return;
        iniciar(async () => { const r = await excluirVeiculo(v.id); if (r.erro) alert(r.erro); else router.push("/frota"); });
      }}>Excluir</button>
    </span>
  );
  return <div style={{ flexBasis: "100%" }}><FormVeiculo v={v} listas={listas} aoTerminar={() => setAberto(false)} /></div>;
}

export type Campo = { nome: string; rotulo: string; tipo?: "text" | "date" | "number" | "select" | "textarea" | "colab"; opcoes?: string[] | Record<string, string>; obrigatorio?: boolean; dica?: string };

/** Lista + formulário de um tipo de registro do carro. */
export function Registros({ tipo, veiculoId, titulo, itens, campos, colunas, colabs, vazio, botao }: {
  tipo: "documento" | "manutencao" | "multa" | "abastecimento"; veiculoId: string; titulo: string;
  itens: Linha[]; campos: Campo[]; colunas: { rotulo: string; valor: (l: Linha) => React.ReactNode }[];
  colabs: Colab[]; vazio: string; botao: string;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState<Linha | "novo" | null>(null);
  const [erro, setErro] = useState("");
  const [pendente, iniciar] = useTransition();
  const enviar = (form: FormData) => iniciar(async () => {
    setErro("");
    const d = Object.fromEntries(form.entries()) as Record<string, string>;
    const r = await salvarRegistro(tipo, veiculoId, { ...d, id: editando && editando !== "novo" ? editando.id : undefined });
    if (r.erro) { setErro(r.erro); return; }
    setEditando(null); router.refresh();
  });
  const apagar = (l: Linha) => {
    if (!confirm("Excluir este registro?")) return;
    iniciar(async () => { const r = await excluirRegistro(tipo, veiculoId, l.id); if (r.erro) alert(r.erro); else router.refresh(); });
  };
  const atual = editando && editando !== "novo" ? editando : null;
  return (
    <section className="cartao frota-secao">
      <div className="cabecalho" style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>{titulo}</h2>
        {!editando && <button className="botao secundario pequeno" onClick={() => setEditando("novo")}>{botao}</button>}
      </div>
      {editando && (
        <form action={enviar} className="frota-form-registro" key={atual?.id ?? "novo"}>
          <div className="frota-grade">
            {campos.map((c) => (
              <label key={c.nome} className={c.tipo === "textarea" ? "largo" : ""}>{c.rotulo}{c.obrigatorio ? " *" : ""}
                {c.tipo === "colab" ? <SelectColab name={c.nome} valor={(atual?.[c.nome] as string) ?? ""} colabs={colabs} vazio="— motorista da data (automático) —" />
                  : c.tipo === "select" ? (
                    <select name={c.nome} defaultValue={String(atual?.[c.nome] ?? (Array.isArray(c.opcoes) ? c.opcoes[0] : Object.keys(c.opcoes || {})[0]) ?? "")}>
                      {(Array.isArray(c.opcoes) ? c.opcoes.map((o) => [o, o]) : Object.entries(c.opcoes || {})).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                    </select>)
                  : c.tipo === "textarea" ? <textarea name={c.nome} rows={2} defaultValue={String(atual?.[c.nome] ?? "")} />
                  : <input name={c.nome} type={c.tipo === "date" ? "date" : "text"} inputMode={c.tipo === "number" ? "decimal" : undefined}
                      required={c.obrigatorio} defaultValue={atual?.[c.nome] == null ? "" : String(atual[c.nome]).replace(c.tipo === "number" ? "." : "\u0000", ",")} />}
                {c.dica && <span className="mudo pequeno">{c.dica}</span>}
              </label>
            ))}
          </div>
          {erro && <p className="erro">{erro}</p>}
          <div className="frota-acoes">
            <button className="botao pequeno" disabled={pendente}>{pendente ? "Salvando…" : "Salvar"}</button>
            <button type="button" className="botao secundario pequeno" onClick={() => { setEditando(null); setErro(""); }}>Cancelar</button>
          </div>
        </form>
      )}
      {itens.length === 0 ? <p className="mudo">{vazio}</p> : (
        <div className="tabela-caixa"><table>
          <thead><tr>{colunas.map((c) => <th key={c.rotulo}>{c.rotulo}</th>)}<th></th></tr></thead>
          <tbody>{itens.map((l) => (
            <tr key={l.id}>
              {colunas.map((c) => <td key={c.rotulo}>{c.valor(l)}</td>)}
              <td className="acoes-linha">
                <button className="link-acao" onClick={() => setEditando(l)}>Editar</button>
                <button className="link-acao" disabled={pendente} onClick={() => apagar(l)}>Excluir</button>
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </section>
  );
}

const brl = (v: Valor) => (v == null || v === "" ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const dt = (v: Valor) => (v ? String(v).split("-").reverse().join("/") : "—");
const km = (v: Valor) => (v == null || v === "" ? "—" : `${Number(v).toLocaleString("pt-BR")} km`);

/** As quatro seções da página do carro (colunas montadas aqui, no navegador). */
export function Secoes({ veiculoId, docs, manutencoes, multas, abastecimentos, colabs, hoje }: {
  veiculoId: string; docs: Linha[]; manutencoes: Linha[]; multas: Linha[]; abastecimentos: Linha[]; colabs: Colab[]; hoje: string;
}) {
  const nome = (id: Valor) => (id ? colabs.find((c) => c.id === id)?.nome ?? "—" : "—");
  const venc = (l: Linha) => {
    if (!l.vencimento) return <span className="mudo">sem vencimento</span>;
    const v = String(l.vencimento), aviso = Number(l.aviso_dias ?? 30);
    const n = Math.round((Date.parse(v + "T12:00:00Z") - Date.parse(hoje + "T12:00:00Z")) / 86400000);
    return <span className={n < 0 ? "validade v-vencido" : n <= aviso ? "validade v-vencendo" : ""}>{dt(v)}{n < 0 ? " · vencido" : n <= aviso ? ` · ${n} dia${n === 1 ? "" : "s"}` : ""}</span>;
  };
  return (
    <>
      <Registros tipo="documento" veiculoId={veiculoId} titulo="Documentos e vencimentos" botao="+ Documento" colabs={colabs}
        vazio="Nenhum documento. Cadastre licenciamento, seguro e IPVA para receber o aviso no planner." itens={docs}
        campos={[
          { nome: "tipo", rotulo: "Tipo", tipo: "select", opcoes: ["Licenciamento (CRLV)", "Seguro", "IPVA", "Vistoria", "Outro"] },
          { nome: "descricao", rotulo: "Descrição", dica: "Ex.: apólice 123, seguradora X" },
          { nome: "vencimento", rotulo: "Vencimento", tipo: "date" },
          { nome: "aviso_dias", rotulo: "Avisar quantos dias antes", tipo: "number" },
          { nome: "valor", rotulo: "Valor (R$)", tipo: "number" },
          { nome: "obs", rotulo: "Observação", tipo: "textarea" },
        ]}
        colunas={[
          { rotulo: "Tipo", valor: (l) => <><b>{l.tipo}</b>{l.descricao ? <div className="pequeno mudo">{l.descricao}</div> : null}</> },
          { rotulo: "Vencimento", valor: venc },
          { rotulo: "Valor", valor: (l) => brl(l.valor) },
        ]} />
      <Registros tipo="manutencao" veiculoId={veiculoId} titulo="Manutenção" botao="+ Manutenção" colabs={colabs}
        vazio="Nenhuma manutenção registrada." itens={manutencoes}
        campos={[
          { nome: "data", rotulo: "Data", tipo: "date", obrigatorio: true },
          { nome: "tipo", rotulo: "Tipo", tipo: "select", opcoes: ["Revisão", "Troca de óleo", "Pneus", "Freios", "Elétrica", "Funilaria", "Outro"] },
          { nome: "km", rotulo: "Km", tipo: "number" },
          { nome: "oficina", rotulo: "Oficina" },
          { nome: "valor", rotulo: "Valor (R$)", tipo: "number" },
          { nome: "descricao", rotulo: "O que foi feito", tipo: "textarea" },
        ]}
        colunas={[
          { rotulo: "Data", valor: (l) => dt(l.data) },
          { rotulo: "Tipo", valor: (l) => <><b>{l.tipo}</b>{l.descricao ? <div className="pequeno mudo">{l.descricao}</div> : null}</> },
          { rotulo: "Km", valor: (l) => km(l.km) },
          { rotulo: "Oficina", valor: (l) => l.oficina || "—" },
          { rotulo: "Valor", valor: (l) => brl(l.valor) },
        ]} />
      <Registros tipo="multa" veiculoId={veiculoId} titulo="Multas" botao="+ Multa" colabs={colabs}
        vazio="Nenhuma multa." itens={multas}
        campos={[
          { nome: "data_infracao", rotulo: "Data da infração", tipo: "date", obrigatorio: true },
          { nome: "colab_id", rotulo: "Motorista", tipo: "colab", dica: "Vazio: quem dirigia o carro nessa data." },
          { nome: "descricao", rotulo: "Infração" },
          { nome: "valor", rotulo: "Valor (R$)", tipo: "number" },
          { nome: "vencimento", rotulo: "Vencimento", tipo: "date" },
          { nome: "situacao", rotulo: "Situação", tipo: "select", opcoes: { pendente: "Pendente", paga: "Paga", recorrida: "Recorrida", cancelada: "Cancelada" } },
          { nome: "obs", rotulo: "Observação", tipo: "textarea" },
        ]}
        colunas={[
          { rotulo: "Data", valor: (l) => dt(l.data_infracao) },
          { rotulo: "Motorista", valor: (l) => nome(l.colab_id) },
          { rotulo: "Infração", valor: (l) => l.descricao || "—" },
          { rotulo: "Valor", valor: (l) => brl(l.valor) },
          { rotulo: "Vencimento", valor: (l) => dt(l.vencimento) },
          { rotulo: "Situação", valor: (l) => <span className={`etiqueta ${l.situacao === "pendente" ? "amarelo" : l.situacao === "paga" ? "verde" : "cinza"}`}>{({ pendente: "Pendente", paga: "Paga", recorrida: "Recorrida", cancelada: "Cancelada" } as Record<string, string>)[String(l.situacao)]}</span> },
        ]} />
      <Registros tipo="abastecimento" veiculoId={veiculoId} titulo="Abastecimento" botao="+ Abastecimento" colabs={colabs}
        vazio="Nenhum abastecimento registrado." itens={abastecimentos}
        campos={[
          { nome: "data", rotulo: "Data", tipo: "date", obrigatorio: true },
          { nome: "litros", rotulo: "Litros", tipo: "number" },
          { nome: "valor", rotulo: "Valor (R$)", tipo: "number" },
          { nome: "km", rotulo: "Km no painel", tipo: "number", dica: "Atualiza o km do carro." },
          { nome: "colab_id", rotulo: "Motorista", tipo: "colab" },
          { nome: "posto", rotulo: "Posto" },
        ]}
        colunas={[
          { rotulo: "Data", valor: (l) => dt(l.data) },
          { rotulo: "Litros", valor: (l) => (l.litros == null ? "—" : `${Number(l.litros).toLocaleString("pt-BR")} L`) },
          { rotulo: "Valor", valor: (l) => brl(l.valor) },
          { rotulo: "Km", valor: (l) => km(l.km) },
          { rotulo: "Motorista", valor: (l) => nome(l.colab_id) },
          { rotulo: "Posto", valor: (l) => l.posto || "—" },
        ]} />
    </>
  );
}
