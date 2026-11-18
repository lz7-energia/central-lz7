(() => {
"use strict";
/* ================= utilidades: datas, números, validação ================= */
class Erro extends Error {}
const falha = (msg) => { throw new Erro(msg); };

const centavos = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function validarCompetencia(c) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(c || ''))) falha('Competência inválida (use AAAA-MM).');
  return c;
}
const ultimoDia = (a, m) => new Date(Date.UTC(a, m, 0)).getUTCDate();
function limites(c) {
  validarCompetencia(c);
  const [a, m] = c.split('-').map(Number);
  return { inicio: `${c}-01`, fim: `${c}-${String(ultimoDia(a, m)).padStart(2, '0')}` };
}
function somarMeses(c, n) {
  const [a, m] = c.split('-').map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}
function diferencaMeses(de, ate) {
  const [a1, m1] = de.split('-').map(Number);
  const [a2, m2] = ate.split('-').map(Number);
  return (a2 * 12 + m2) - (a1 * 12 + m1);
}
const competenciaDe = (d) => (d ? String(d).slice(0, 7) : null);
// Brasil sem horário de verão desde 2019: São Paulo = UTC-3.
const dataSP = (d) => new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 10);
const hojeSP = () => dataSP(new Date());
const agoraISO = () => new Date().toISOString();
function diaMais(d, n) { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }

// Aceita ISO (com ou sem hora/fuso), DD/MM/AAAA, Date e serial do Excel. Devolve AAAA-MM-DD ou null.
function normalizarData(v) {
  if (v === null || v === undefined || v === '') return null;
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v)) return null;
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  if (typeof v === 'number') {
    if (v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 864e5).toISOString().slice(0, 10);
    return null;
  }
  const s = String(v).trim();
  if (/^\d{5}(\.\d+)?$/.test(s)) return normalizarData(Number(s));
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:?\d{2})?)?$/);
  if (!m) return null;
  if (m[2] && m[3]) { const d = new Date(s.replace(' ', 'T')); return isNaN(d) ? m[1] : dataSP(d); }
  return m[1];
}

// "R$ 1.234,56", "1234.56", 1234.56, "(1.000,00)" -> número.
function lerValor(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/R\$|\s/g, '');
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /-$/.test(s);
  s = s.replace(/[()\-+]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

const soDigitos = (s) => String(s ?? '').replace(/\D/g, '');
function cpfValido(cpf) {
  const d = soDigitos(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const n of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    if ((soma * 10) % 11 % 10 !== Number(d[n])) return false;
  }
  return true;
}
const formatarCpf = (cpf) => { const d = soDigitos(cpf); return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : (cpf || ''); };
const mascararCpf = (cpf) => { const d = soDigitos(cpf); return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : ''; };
const TIPOS_PIX = ['cpf', 'email', 'telefone', 'aleatoria', 'cnpj'];
function validarPix(tipo, chave) {
  if (!chave) return { tipo: null, chave: null };
  if (!TIPOS_PIX.includes(tipo)) falha('Escolha o tipo da chave Pix.');
  const c = String(chave).trim();
  if (tipo === 'cpf' && !cpfValido(c)) falha('Chave Pix (CPF) inválida.');
  if (tipo === 'cnpj' && soDigitos(c).length !== 14) falha('Chave Pix (CNPJ) inválida.');
  if (tipo === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) falha('Chave Pix (e-mail) inválida.');
  if (tipo === 'telefone' && ![10, 11, 12, 13].includes(soDigitos(c).length)) falha('Chave Pix (telefone) inválida.');
  if (tipo === 'aleatoria' && !/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(c)) falha('Chave Pix aleatória inválida.');
  return { tipo, chave: ['cpf', 'cnpj', 'telefone'].includes(tipo) ? soDigitos(c) : c };
}
function validarEmail(e) {
  if (!e) return null;
  const s = String(e).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) falha('E-mail inválido.');
  return s.toLowerCase();
}
function validarTelefone(t) {
  if (!t) return null;
  const d = soDigitos(t);
  if (d.length < 10 || d.length > 13) falha('Telefone inválido (informe DDD + número).');
  return d;
}
// Normaliza nomes para casar o vendedor da planilha com o cadastro.
const chaveNome = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const novoId = (pref = '') => `${pref}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const clonar = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));

/* ---------- valor por extenso (recibos) ---------- */
const UNI = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CEM = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
function ate999(n) {
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100); const r = n % 100; const p = [];
  if (c) p.push(CEM[c]);
  if (r) p.push(r < 20 ? UNI[r] : DEZ[Math.floor(r / 10)] + (r % 10 ? ` e ${UNI[r % 10]}` : ''));
  return p.join(' e ');
}
const ESCALAS = [['', ''], ['mil', 'mil'], ['milhão', 'milhões'], ['bilhão', 'bilhões']];
function inteiroPorExtenso(n) {
  if (n === 0) return 'zero';
  const g = [];
  for (let i = 0; n > 0; i++, n = Math.floor(n / 1000)) g.push({ v: n % 1000, i });
  const partes = g.filter((x) => x.v).reverse().map((x) => {
    if (x.i === 0) return { txt: ate999(x.v), v: x.v };
    if (x.i === 1) return { txt: x.v === 1 ? 'mil' : `${ate999(x.v)} mil`, v: x.v };
    return { txt: `${ate999(x.v)} ${x.v === 1 ? ESCALAS[x.i][0] : ESCALAS[x.i][1]}`, v: x.v };
  });
  return partes.reduce((acc, p, i) => (i === 0 ? p.txt : `${acc}${i === partes.length - 1 && (p.v < 100 || p.v % 100 === 0) ? ' e ' : ', '}${p.txt}`), '');
}
function reaisPorExtenso(valor) {
  const t = Math.round(Math.abs(Number(valor) || 0) * 100);
  const reais = Math.floor(t / 100); const cent = t % 100; const p = [];
  if (reais) p.push(`${inteiroPorExtenso(reais)}${reais >= 1e6 && reais % 1e6 === 0 ? ' de' : ''} ${reais === 1 ? 'real' : 'reais'}`);
  if (cent) p.push(`${inteiroPorExtenso(cent)} ${cent === 1 ? 'centavo' : 'centavos'}`);
  return p.length ? p.join(' e ') : 'zero real';
}

/* ================= regras de comissão, meta e bandeiras (iguais à plataforma local) ================= */
// Regras de comissão, meta e bandeiras. Funções puras: só recebem dados e devolvem resultado.


// Regra padrão: modelo da proposta "Assistente Comercial" de 15/09/2026.
const REGRA_PADRAO = Object.freeze({
  tipo: 'faixas',            // faixas | fixo
  modo_faixas: 'total',      // total = % da faixa sobre todo o faturado | escalonado = cada faixa só sobre sua parte
  percentual_fixo: 0,
  faixas: [
    { ate: 50000, percentual: 0 },
    { ate: 100000, percentual: 1.5 },
    { ate: 150000, percentual: 1.75 },
    { ate: 200000, percentual: 2 },
    { ate: 300000, percentual: 2.25 },
    { ate: null, percentual: 2.5 },
  ],
  taxa_cooperativa: 0,       // % descontado só da comissão (não incide sobre o bônus nem sobre o salário)
  bonus: { valor: 1000, gatilho: 100000 },
  salario_fixo: 0,
  beneficios: 750,
  meta: { usa: true, rampagem: [50000, 100000], padrao: 150000 },
  bandeiras: {
    usa: true,
    limite_vermelha: 50,     // abaixo disso: Bandeira Vermelha imediata
    limite_amarela: 71,      // de limite_vermelha até abaixo disso: faixa amarela
    limite_recuperacao: 81,  // a partir disso: recuperado
    zona_intermediaria: 'manter', // quem está em Amarela e fica entre 71% e 80%: manter | normalizar | escalar
  },
});

function num(v, nome, { min = 0, max = Infinity, nulo = false } = {}) {
  if (nulo && (v === null || v === undefined || v === '')) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new Erro(`Valor inválido em "${nome}".`);
  return n;
}

// Valida e completa uma regra vinda da tela.
function normalizarRegra(r = {}) {
  if (r.tipo === 'gestor') return normalizarRegraGestor(r);
  const tipo = r.tipo === 'fixo' ? 'fixo' : 'faixas';
  const modo = r.modo_faixas === 'escalonado' ? 'escalonado' : 'total';
  let faixas = [];
  if (tipo === 'faixas') {
    faixas = (r.faixas || []).map((f, i) => ({
      ate: num(f.ate, `faixa ${i + 1} — até`, { nulo: true }),
      percentual: num(f.percentual, `faixa ${i + 1} — %`, { max: 100 }),
    }));
    if (!faixas.length) throw new Erro('Informe ao menos uma faixa.');
    const abertas = faixas.filter((f) => f.ate === null);
    if (abertas.length !== 1) throw new Erro('A última faixa deve ser "acima de" (sem limite superior), e só ela.');
    faixas = faixas.filter((f) => f.ate !== null).sort((a, b) => a.ate - b.ate).concat(abertas);
    for (let i = 1; i < faixas.length - 1; i++) {
      if (faixas[i].ate === faixas[i - 1].ate) throw new Erro('Há duas faixas com o mesmo limite.');
    }
  }
  const bonusValor = num(r.bonus?.valor ?? 0, 'bônus');
  if (bonusValor > 0 && !(Number(r.bonus?.gatilho) > 0)) throw new Erro('Informe o gatilho do bônus (faturamento mínimo no mês).');
  const meta = r.meta || {};
  const band = r.bandeiras || {};
  const regra = {
    tipo,
    modo_faixas: modo,
    percentual_fixo: tipo === 'fixo' ? num(r.percentual_fixo, 'percentual fixo', { max: 100 }) : 0,
    faixas,
    taxa_cooperativa: num(r.taxa_cooperativa ?? 0, 'taxa da cooperativa', { max: 100 }),
    bonus: bonusValor > 0 ? { valor: bonusValor, gatilho: num(r.bonus.gatilho, 'gatilho do bônus') } : null,
    salario_fixo: num(r.salario_fixo ?? 0, 'salário fixo'),
    beneficios: num(r.beneficios ?? 0, 'benefícios'),
    meta: {
      usa: !!meta.usa,
      rampagem: (meta.rampagem || []).filter((v) => v !== '' && v !== null).map((v, i) => num(v, `meta do ${i + 1}º mês`)),
      padrao: meta.usa ? num(meta.padrao, 'meta mensal') : 0,
    },
    bandeiras: {
      usa: !!meta.usa && !!band.usa,
      limite_vermelha: num(band.limite_vermelha ?? 50, 'limite da vermelha', { max: 1000 }),
      limite_amarela: num(band.limite_amarela ?? 71, 'limite da amarela', { max: 1000 }),
      limite_recuperacao: num(band.limite_recuperacao ?? 81, 'limite de recuperação', { max: 1000 }),
      zona_intermediaria: ['manter', 'normalizar', 'escalar'].includes(band.zona_intermediaria) ? band.zona_intermediaria : 'manter',
    },
  };
  if (regra.meta.usa && regra.meta.padrao <= 0) throw new Erro('Informe a meta mensal.');
  const b = regra.bandeiras;
  if (b.usa && !(b.limite_vermelha <= b.limite_amarela && b.limite_amarela <= b.limite_recuperacao)) {
    throw new Erro('Os limites das bandeiras devem ser crescentes: vermelha ≤ amarela ≤ recuperação.');
  }
  return regra;
}

// Faixa que contém o total: "até X" inclui X; a seguinte começa acima de X.
function faixaDo(total, faixas) {
  let anterior = 0;
  for (let i = 0; i < faixas.length; i++) {
    const f = faixas[i];
    if (f.ate === null || total <= f.ate) return { indice: i, de: anterior, ate: f.ate, percentual: f.percentual };
    anterior = f.ate;
  }
  return null;
}

function calcularComissao(total, regra) {
  total = centavos(Math.max(0, Number(total) || 0));
  let comissao = 0;
  let percentual = 0;
  let faixa = null;
  if (regra.tipo === 'fixo') {
    percentual = regra.percentual_fixo;
    comissao = total * percentual / 100;
  } else if (regra.modo_faixas === 'escalonado') {
    let de = 0;
    for (const f of regra.faixas) {
      const teto = f.ate === null ? total : Math.min(total, f.ate);
      if (teto > de) comissao += (teto - de) * f.percentual / 100;
      if (f.ate === null || total <= f.ate) break;
      de = f.ate;
    }
    faixa = faixaDo(total, regra.faixas);
    percentual = total > 0 ? comissao / total * 100 : 0; // percentual efetivo
  } else {
    faixa = faixaDo(total, regra.faixas);
    percentual = faixa ? faixa.percentual : 0;
    comissao = total * percentual / 100;
  }
  comissao = centavos(comissao);
  const bonus = regra.bonus && total >= regra.bonus.gatilho ? centavos(regra.bonus.valor) : 0;
  const variavelBruto = centavos(comissao + bonus);
  const taxa = centavos(comissao * (regra.taxa_cooperativa || 0) / 100); // taxa da cooperativa só sobre a comissão (bônus fica fora)
  return {
    total,
    percentual: Math.round(percentual * 10000) / 10000,
    faixa,
    comissao,
    bonus,
    variavel_bruto: variavelBruto,
    taxa_cooperativa: taxa,
    variavel_liquido: centavos(variavelBruto - taxa),
  };
}

// Meta do mês conforme a rampagem: o mês da data de início é o 1º mês.
function metaDoMes(regra, dataInicio, competencia) {
  if (!regra.meta?.usa) return { meta: null, mes_rampagem: null };
  if (!dataInicio) return { meta: regra.meta.padrao, mes_rampagem: null };
  const n = diferencaMeses(competenciaDe(dataInicio), competencia) + 1;
  if (n < 1) return { meta: null, mes_rampagem: n };
  const ramp = regra.meta.rampagem || [];
  return { meta: n <= ramp.length ? ramp[n - 1] : regra.meta.padrao, mes_rampagem: n };
}

const NOMES = { normal: 'Normal', amarela: 'Bandeira Amarela', vermelha: 'Bandeira Vermelha' };

/*
 Máquina de bandeiras. Recebe o histórico mês a mês [{competencia, atingimento (%) | null, cfg}]
 em ordem cronológica e devolve, para cada mês, a bandeira em que o vendedor fica ao fechar o mês.
 atingimento null = mês sem meta (antes do início, cargo sem meta): não altera o estado.
*/
function calcularBandeiras(historico) {
  let estado = 'normal';
  let vermelhaPorBaixo = false; // a vermelha atual veio de um mês abaixo do limite da vermelha
  const saida = [];
  for (const h of historico) {
    const cfg = h.cfg;
    const entrada = estado;
    if (h.atingimento === null || h.atingimento === undefined || !cfg?.usa) {
      saida.push({ competencia: h.competencia, atingimento: null, entrada, bandeira: estado, evento: null, alerta: null });
      continue;
    }
    const p = h.atingimento;
    let evento = null;
    let alerta = null;
    let baixo = false;
    if (p >= cfg.limite_recuperacao) {
      if (estado !== 'normal') evento = 'Recuperado — bandeira encerrada';
      estado = 'normal';
    } else if (p < cfg.limite_vermelha) {
      baixo = true;
      if (estado === 'vermelha' && vermelhaPorBaixo) {
        evento = `2ª Bandeira Vermelha consecutiva abaixo de ${cfg.limite_vermelha}%`;
        alerta = 'desligamento';
      } else if (estado === 'vermelha') {
        evento = 'Não recuperou na Bandeira Vermelha';
        alerta = 'liberacao';
      } else {
        evento = `Bandeira Vermelha imediata (abaixo de ${cfg.limite_vermelha}%)`;
      }
      estado = 'vermelha';
    } else if (p < cfg.limite_amarela) {
      if (estado === 'normal') { estado = 'amarela'; evento = 'Entrou em Bandeira Amarela'; }
      else if (estado === 'amarela') { estado = 'vermelha'; evento = '2º mês em Bandeira Amarela — Bandeira Vermelha acionada'; }
      else { evento = 'Não recuperou na Bandeira Vermelha'; alerta = 'liberacao'; }
    } else {
      // Zona intermediária: entre o limite da amarela e o de recuperação.
      if (estado === 'amarela') {
        if (cfg.zona_intermediaria === 'normalizar') { estado = 'normal'; evento = 'Saiu da Bandeira Amarela (zona intermediária)'; }
        else if (cfg.zona_intermediaria === 'escalar') { estado = 'vermelha'; evento = 'Não recuperou — Bandeira Vermelha acionada'; }
        else evento = `Não atingiu ${cfg.limite_recuperacao}% — permanece em Bandeira Amarela`;
      } else if (estado === 'vermelha') {
        evento = 'Não recuperou na Bandeira Vermelha';
        alerta = 'liberacao';
      }
    }
    vermelhaPorBaixo = estado === 'vermelha' && baixo;
    saida.push({ competencia: h.competencia, atingimento: p, entrada, bandeira: estado, evento, alerta });
  }
  return saida;
}

// ---------------- Gestores (Supervisor e Coordenador) ----------------

// Supervisor Comercial — proposta de 2026: 0,25% sobre as vendas da unidade, bônus pela maior faixa,
// 2% sobre vendas diretas, unidade elegível com no mínimo 4 vendedores.
const REGRA_SUPERVISOR = Object.freeze({
  tipo: 'gestor',
  percentual_base: 0.25,
  bonus_faixas: [
    { a_partir: 700000, valor: 1500 },
    { a_partir: 1000000, valor: 4500 },
    { a_partir: 1300000, valor: 10000 },
    { a_partir: 1700000, valor: 20000 },
    { a_partir: 2200000, valor: 35000 },
  ],
  percentual_diretas: 2,
  base: { modo: 'propria', unidades: [] },
  minimo_vendedores: 4,
  equilibrio: { usa: false, minimo_unidades: 2, percentual_meta: 80 },
  taxa_cooperativa: 0,
  salario_fixo: 7000,
  beneficios: 0,
  meta: { usa: true },
  bandeiras: { usa: true, limite_vermelha: 50, limite_amarela: 80, limite_recuperacao: 81, zona_intermediaria: 'manter' },
});

// Coordenador Comercial: bônus pela faixa do faturamento global de PG, LD e WB, com condição de equilíbrio.
const REGRA_COORDENADOR = Object.freeze({
  ...REGRA_SUPERVISOR,
  percentual_base: 0,
  bonus_faixas: [
    { a_partir: 2500000, valor: 4000 },
    { a_partir: 3000000, valor: 7000 },
    { a_partir: 3500000, valor: 10000 },
    { a_partir: 4200000, valor: 13000 },
    { a_partir: 5000000, valor: 17000 },
    { a_partir: 6000000, valor: 25000 },
    { a_partir: 7000000, valor: 35000 },
  ],
  base: { modo: 'unidades', unidades: [] },
  minimo_vendedores: 0,
  equilibrio: { usa: true, minimo_unidades: 2, percentual_meta: 80 },
});

function normalizarRegraGestor(r) {
  const faixas = (r.bonus_faixas || [])
    .filter((f) => f && f.a_partir !== '' && f.a_partir !== null && f.a_partir !== undefined)
    .map((f, i) => ({ a_partir: num(f.a_partir, `bônus ${i + 1} — a partir de`), valor: num(f.valor, `bônus ${i + 1} — valor`) }))
    .sort((a, b) => a.a_partir - b.a_partir);
  for (let i = 1; i < faixas.length; i++) {
    if (faixas[i].a_partir === faixas[i - 1].a_partir) throw new Erro('Há duas faixas de bônus com o mesmo valor de faturamento.');
  }
  const modo = r.base?.modo === 'unidades' ? 'unidades' : 'propria';
  const unidades = modo === 'unidades' ? [...new Set((r.base?.unidades || []).map(String).filter(Boolean))] : [];
  if (modo === 'unidades' && !unidades.length) throw new Erro('Escolha as unidades que compõem a base do gestor.');
  const eq = r.equilibrio || {};
  const band = r.bandeiras || {};
  const regra = {
    tipo: 'gestor',
    percentual_base: num(r.percentual_base ?? 0, '% sobre as vendas da base', { max: 100 }),
    bonus_faixas: faixas,
    percentual_diretas: num(r.percentual_diretas ?? 0, '% sobre vendas diretas', { max: 100 }),
    base: { modo, unidades },
    minimo_vendedores: Math.round(num(r.minimo_vendedores ?? 0, 'mínimo de vendedores', { max: 1000 })),
    equilibrio: {
      usa: !!eq.usa,
      minimo_unidades: Math.round(num(eq.minimo_unidades ?? 2, 'unidades mínimas no equilíbrio', { max: 100 })),
      percentual_meta: num(eq.percentual_meta ?? 80, '% da meta no equilíbrio', { max: 1000 }),
    },
    taxa_cooperativa: num(r.taxa_cooperativa ?? 0, 'taxa da cooperativa', { max: 100 }),
    salario_fixo: num(r.salario_fixo ?? 0, 'salário fixo'),
    beneficios: num(r.beneficios ?? 0, 'benefícios'),
    meta: { usa: true },
    bandeiras: {
      usa: !!band.usa,
      limite_vermelha: num(band.limite_vermelha ?? 50, 'limite da vermelha', { max: 1000 }),
      limite_amarela: num(band.limite_amarela ?? 80, 'limite da amarela', { max: 1000 }),
      limite_recuperacao: num(band.limite_recuperacao ?? 81, 'limite de recuperação', { max: 1000 }),
      zona_intermediaria: ['manter', 'normalizar', 'escalar'].includes(band.zona_intermediaria) ? band.zona_intermediaria : 'manter',
    },
  };
  const b = regra.bandeiras;
  if (b.usa && !(b.limite_vermelha <= b.limite_amarela && b.limite_amarela <= b.limite_recuperacao)) {
    throw new Erro('Os limites das bandeiras devem ser crescentes: vermelha ≤ amarela ≤ recuperação.');
  }
  return regra;
}

// Maior faixa de bônus atingida (não acumulativa). Retorna o índice ou -1.
function indiceFaixaBonus(total, faixas) {
  let idx = -1;
  faixas.forEach((f, i) => { if (total >= f.a_partir) idx = i; });
  return idx;
}

/*
 Comissão do gestor.
 base_total: vendas da base (unidade do supervisor ou unidades do coordenador), já incluindo as vendas diretas.
 diretas_total: vendas feitas pelo próprio gestor.
 equipe: quantidade de vendedores da unidade (supervisor) — abaixo do mínimo, sem bônus por faixa (o % da base vale sempre, desde o primeiro real).
 unidades_atingimento: % da meta de cada unidade da base (equilíbrio do coordenador).
*/
function calcularGestor({ base_total: baseTotal, diretas_total: diretasTotal, base_comissao: baseComissao = null, equipe = 0, unidades_atingimento: ating = [] }, regra) {
  baseTotal = centavos(Math.max(0, Number(baseTotal) || 0));
  diretasTotal = centavos(Math.max(0, Number(diretasTotal) || 0));
  const elegivel = !regra.minimo_vendedores || equipe >= regra.minimo_vendedores;
  // % da base sobre as vendas da equipe (sem as vendas diretas do gestor, que levam só o % das diretas). Sem faixa de corte: desde o primeiro real.
  const comissaoBase = centavos(Math.max(0, baseComissao ?? baseTotal) * regra.percentual_base / 100);
  let idx = elegivel ? indiceFaixaBonus(baseTotal, regra.bonus_faixas) : -1;
  const idxAtingido = idx;
  let equilibrio = null;
  if (regra.equilibrio?.usa && idx >= 0) {
    const ok = ating.filter((a) => a !== null && a >= regra.equilibrio.percentual_meta).length;
    equilibrio = { unidades_ok: ok, exigido: regra.equilibrio.minimo_unidades, atendido: ok >= regra.equilibrio.minimo_unidades };
    if (!equilibrio.atendido) idx -= 1;
  }
  const bonus = idx >= 0 ? centavos(regra.bonus_faixas[idx].valor) : 0;
  const comissaoDiretas = centavos(diretasTotal * regra.percentual_diretas / 100);
  const comissao = centavos(comissaoBase + comissaoDiretas);
  const variavelBruto = centavos(comissao + bonus);
  const taxa = centavos(comissao * (regra.taxa_cooperativa || 0) / 100); // taxa da cooperativa só sobre a comissão (bônus fica fora)
  return {
    elegivel,
    base_total: baseTotal,
    diretas_total: diretasTotal,
    comissao_base: comissaoBase,
    comissao_diretas: comissaoDiretas,
    faixa_bonus_atingida: idxAtingido >= 0 ? regra.bonus_faixas[idxAtingido] : null,
    faixa_bonus_paga: idx >= 0 ? regra.bonus_faixas[idx] : null,
    equilibrio,
    comissao,
    bonus,
    variavel_bruto: variavelBruto,
    taxa_cooperativa: taxa,
    variavel_liquido: centavos(variavelBruto - taxa),
  };
}

/*
 Comissão de cada venda. A faixa vale sobre todo o faturado do mês, então cada pedido recebe
 valor × % efetivo (comissão ÷ total). Os centavos são distribuídos pelo maior resto, para que a soma
 dos pedidos feche exatamente com a comissão da linha. Para gestor, rateia a comissão das vendas diretas.
 O bônus é do mês e não é atribuído a nenhum pedido.
*/
function ratearComissao(pedidos, comissao, valorDe = (p) => p.valor_total || 0) {
  if (!pedidos?.length) return pedidos || [];
  const total = pedidos.reduce((t, p) => t + valorDe(p), 0);
  const pctEfetivo = total > 0 ? comissao / total * 100 : 0;
  const alvo = Math.round(comissao * 100);
  const base = pedidos.map((p) => {
    const exato = total > 0 ? valorDe(p) / total * alvo : 0;
    return { p, cents: Math.floor(exato), resto: exato - Math.floor(exato) };
  });
  let falta = alvo - base.reduce((t, x) => t + x.cents, 0);
  [...base].sort((x, y) => y.resto - x.resto).forEach((x) => { if (falta > 0) { x.cents += 1; falta -= 1; } });
  return base.map((x) => ({ ...x.p, percentual_comissao: Math.round(pctEfetivo * 10000) / 10000, comissao: x.cents / 100 }));
}
function comissaoPorPedido(linha) {
  const comissao = linha.tipo === 'gestor' ? (linha.comissao_diretas || 0) + (linha.comissao_base_diretas || 0) : (linha.comissao || 0);
  return ratearComissao(linha?.pedidos || [], comissao);
}
function anexarComissaoPorPedido(linha) {
  if (linha && Array.isArray(linha.pedidos)) linha.pedidos = comissaoPorPedido(linha);
  if (linha && Array.isArray(linha.pedidos_equipe)) linha.pedidos_equipe = ratearComissao(linha.pedidos_equipe, linha.comissao_base_equipe || 0, (p) => p.valor_supervisao ?? p.valor_total ?? 0);
  return linha;
}


/* ================= dados: memória local espelhando o banco compartilhado do artifact ================= */
/*
 Coleções (um documento por registro, exceto pedidos, agrupados por mês da emissão):
   unidades/{id}     {nome, sigla, ativa, responsaveis:[{id, pessoa_id, inicio, fim}]}
   cargos/{id}       {nome, publico, ativo, versoes:[{vigente_desde, regra, criado_em, criado_por}]}
   pessoas/{id}      {nome, cpf, ..., nomes_flow:[], vinculos:[{id, unidade_id, cargo_id, inicio, desligamento, motivo}]}
   pedidos/{AAAA-MM} {itens: {idPedido: {...}}}  -- vêm da planilha do Flow
   ajustes/{idPedido} {vendedor, valor, apagado} -- o que foi mudado na plataforma
   apuracoes/{AAAA-MM}, lancamentos, fechamentos, recibos, pagamentos, auditoria, cfg/geral
*/
const COLECOES = ['unidades', 'cargos', 'pessoas', 'pedidos', 'ajustes', 'apuracoes', 'lancamentos', 'fechamentos', 'recibos', 'pagamentos', 'cfg'];
const S = {
  unidades: new Map(), cargos: new Map(), pessoas: new Map(), pedidosMes: new Map(), pedidos: new Map(), porComp: new Map(),
  ajustes: new Map(), apuracoes: new Map(), lancamentos: new Map(), fechamentos: new Map(), recibos: new Map(), pagamentos: new Map(),
  cfg: {}, auditoria: [], carregadas: new Set(),
};
const USUARIO = { id: null, nome: '', podeEscrever: null };
let DB = null;
const NOMES_USUARIO = new Map(); // id de usuário -> nome exibido

// Pedido importado de planilha sem datas: o mês escolhido na importação manda.
const dataRefOriginal = (p) => (p.competencia ? `${p.competencia}-01` : p.data_emissao || p.data_aprovacao || null);
// Pedido remanejado na plataforma (ajustes/{id}.mes): passa a contar no mês escolhido.
const dataRef = (p) => { const m = S.ajustes.get(p.id)?.mes?.competencia; return m ? `${m}-01` : dataRefOriginal(p); };

function reindexarPedidos() {
  S.pedidos = new Map();
  S.porComp = new Map();
  for (const [mes, doc] of S.pedidosMes) {
    for (const [id, p] of Object.entries(doc.itens || {})) {
      const ped = { ...p, id, _doc: mes };
      S.pedidos.set(id, ped);
      const c = competenciaDe(dataRef(ped)) || 'sem-data';
      if (!S.porComp.has(c)) S.porComp.set(c, []);
      S.porComp.get(c).push(ped);
    }
  }
}

// Aplica um documento (ou a remoção dele) na memória local. Usado pelos snapshots e pelas gravações da própria página.
function aplicarDoc(col, id, data) {
  if (col === 'cfg') { if (id === 'geral') S.cfg = data ? clonar(data) : {}; return; }
  if (col === 'pedidos') {
    if (data) S.pedidosMes.set(id, clonar(data)); else S.pedidosMes.delete(id);
    reindexarPedidos();
    return;
  }
  const mapa = S[col];
  if (!mapa) return;
  if (data) mapa.set(id, { ...clonar(data), id }); else mapa.delete(id);
  if (col === 'ajustes') reindexarPedidos();
}

// Grava vários documentos: aplica na memória e envia ao banco, um de cada vez.
async function commit(escritas, auditoria) {
  if (!DB) falha('O banco de dados não está disponível nesta visualização. Abra a plataforma pelo link do artifact.');
  if (USUARIO.podeEscrever === false) falha('Seu acesso a esta plataforma é somente leitura.');
  for (const w of escritas) {
    const corpo = w.data === null ? null : limparParaBanco(w.data);
    if (corpo && JSON.stringify(corpo).length > 250000) falha('Registro grande demais para o banco (limite de 256 KB por documento).');
    aplicarDoc(w.col, w.id, corpo);
  }
  try {
    for (const w of escritas) {
      const ref = DB.doc(`${w.col}/${w.id}`);
      if (w.data === null) await ref.delete(); else await ref.set(limparParaBanco(w.data));
    }
    if (auditoria) await registrarAuditoria(auditoria);
  } catch (e) {
    if (e?.code === 'invalid_argument') { USUARIO.podeEscrever = false; falha('O banco recusou a gravação. Seu acesso pode ser somente leitura.'); }
    if (e?.code === 'quota_exceeded') falha('O banco do artifact está cheio. Apague registros antigos (ex.: auditoria) antes de continuar.');
    falha(`Não foi possível gravar (${e?.code || e?.message || 'erro'}). Tente de novo.`);
  }
  agendarRender();
}

// Remove campos internos (_doc) e undefined antes de gravar.
function limparParaBanco(o) {
  return JSON.parse(JSON.stringify(o, (k, v) => (k.startsWith('_') ? undefined : v)));
}

const SENSIVEIS = new Set(['cpf', 'pix_chave']);
async function registrarAuditoria({ entidade, entidade_id = null, acao, de = null, para = null }) {
  const limpar = (o) => {
    if (!o || typeof o !== 'object') return o ?? null;
    const c = clonar(o);
    for (const k of Object.keys(c)) if (SENSIVEIS.has(k) && c[k]) c[k] = '(protegido)';
    delete c.vinculos; delete c.versoes;
    return c;
  };
  const doc = { em: agoraISO(), autor: USUARIO.id || null, entidade, entidade_id: entidade_id === null ? null : String(entidade_id), acao, de: limpar(de), para: limpar(para) };
  const txt = JSON.stringify(doc);
  if (txt.length > 60000) { doc.de = null; doc.para = { resumo: 'registro grande — detalhes omitidos' }; }
  try { await DB.doc(`auditoria/${novoId('a')}`).set(doc); } catch { /* auditoria é melhor esforço */ }
}

// Nome de quem fez a ação: ids "u_..." são resolvidos pelo perfil; textos antigos (migrados) aparecem como estão.
function quem(id) {
  if (!id) return '';
  if (!String(id).startsWith('u_')) return String(id);
  return NOMES_USUARIO.get(id) || 'usuário';
}
let resolverNomesPendente = null;
function pedirNomes(ids) {
  const faltam = [...new Set(ids.filter((x) => x && String(x).startsWith('u_') && !NOMES_USUARIO.has(x)))];
  if (!faltam.length || !USER_API) return;
  faltam.forEach((x) => NOMES_USUARIO.set(x, 'usuário'));
  clearTimeout(resolverNomesPendente);
  resolverNomesPendente = setTimeout(async () => {
    try {
      const perfis = await USER_API.profiles(faltam.slice(0, 64));
      for (const id of faltam) if (perfis?.[id]?.name) NOMES_USUARIO.set(id, perfis[id].name);
      agendarRender();
    } catch { /* sem nomes */ }
  }, 50);
}

let USER_API = null;
const assinaturas = [];
async function conectar() {
  const claude = window.claude;
  if (!claude?.use) return { ok: false, motivo: 'Esta cópia da página não está aberta pelo Claude, então não há banco de dados.' };
  const [db, user] = await Promise.all([claude.use('db'), claude.use('user')]);
  USER_API = user;
  if (user) {
    try {
      const eu = await user.me();
      USUARIO.id = eu?.id || null;
      USUARIO.nome = eu?.name || '';
      if (USUARIO.id) NOMES_USUARIO.set(USUARIO.id, USUARIO.nome || 'você');
      const pode = await user.can('data.write');
      USUARIO.podeEscrever = pode === null ? null : !!pode;
    } catch { /* segue */ }
  }
  if (!db) return { ok: false, motivo: 'O banco de dados não está disponível nesta visualização. Entre com sua conta para usar a plataforma.' };
  DB = db;
  for (const col of COLECOES) {
    const un = db.collection(col).onSnapshot((snap) => {
      // Recarrega a coleção inteira a cada entrega (coleções pequenas).
      if (col === 'pedidos') S.pedidosMes = new Map();
      else if (col !== 'cfg') S[col] = new Map();
      for (const d of snap.docs) aplicarDoc(col, d.id, d.data());
      if (col === 'pedidos' || col === 'ajustes') reindexarPedidos();
      if (col === 'cfg' && !snap.docs.some((d) => d.id === 'geral')) S.cfg = {};
      S.carregadas.add(col);
      aoCarregar();
    }, (e) => { aviso(`Conexão com o banco interrompida (${e.code}). Recarregue a página.`, 'erro'); });
    assinaturas.push(un);
  }
  const unA = db.collection('auditoria').orderBy('em', 'desc').limit(200).onSnapshot((snap) => {
    S.auditoria = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    pedirNomes(S.auditoria.map((a) => a.autor));
    agendarRender();
  }, () => {});
  assinaturas.push(unA);
  return { ok: true };
}

let semeando = false;
function aoCarregar() {
  if (S.carregadas.size < COLECOES.length) return;
  if (!S.unidades.size && !S.cargos.size && !S.cfg.semeado && !semeando && USUARIO.podeEscrever !== false) {
    semeando = true;
    semearPadrao().catch((e) => aviso(e.message, 'erro')).finally(() => { semeando = false; });
  }
  const ids = [];
  for (const m of [S.lancamentos, S.fechamentos, S.recibos, S.pagamentos]) for (const x of m.values()) ids.push(x.autor, x.fechado_por, x.emitido_por);
  for (const a of S.ajustes.values()) ids.push(a.vendedor?.autor, a.valor?.autor, a.apagado?.autor);
  for (const a of S.apuracoes.values()) ids.push(a.fechada_por);
  pedirNomes(ids);
  agendarRender();
}

// Primeira abertura com banco vazio: as 4 unidades e os cargos das propostas.
async function semearPadrao() {
  const vig = '2026-01';
  const ws = [];
  const uni = [['LD', 'Londrina'], ['PG', 'Ponta Grossa'], ['WB', 'Wenceslau Braz'], ['REP', 'Representantes']];
  for (const [sigla, nome] of uni) ws.push({ col: 'unidades', id: `u-${sigla.toLowerCase()}`, data: { nome, sigla, ativa: true, criado_em: agoraISO(), responsaveis: [] } });
  const cargo = (id, nome, publico, regra) => ws.push({ col: 'cargos', id, data: { nome, publico, ativo: true, criado_em: agoraISO(), versoes: [{ vigente_desde: vig, regra: normalizarRegra(regra), criado_em: agoraISO(), criado_por: 'sistema' }] } });
  [['c-assist0', 'Assistente Comercial — Nível 0', 2410], ['c-assist1', 'Assistente Comercial — Nível 1', 2578], ['c-analista', 'Analista Comercial', 3043], ['c-senior', 'Analista Comercial Sênior', 3590]]
    .forEach(([id, nome, sal]) => cargo(id, nome, 'vendedor', { ...clonar(REGRA_PADRAO), salario_fixo: sal }));
  cargo('c-repres', 'Representante Comercial', 'vendedor', { tipo: 'fixo', percentual_fixo: 0, taxa_cooperativa: 0, bonus: null, salario_fixo: 0, beneficios: 0, meta: { usa: false }, bandeiras: { usa: false } });
  cargo('c-supervisor', 'Supervisor Comercial', 'gestor', clonar(REGRA_SUPERVISOR));
  cargo('c-coordenador', 'Coordenador Comercial', 'gestor', { ...clonar(REGRA_COORDENADOR), base: { modo: 'unidades', unidades: ['u-ld', 'u-pg', 'u-wb'] } });
  ws.push({ col: 'cfg', id: 'geral', data: { ...S.cfg, semeado: true } });
  await commit(ws, { entidade: 'sistema', acao: 'dados_iniciais' });
}

/* ================= cadastros: unidades, responsáveis, cargos e pessoas ================= */
function exigirData(v, nome) { const d = normalizarData(v); if (!d) falha(`Data inválida em "${nome}".`); return d; }
const porNome = (a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');

// Último registro com início <= data; empate na data: o inserido por último vale.
function ultimoAte(lista, data, filtro = () => true) {
  let best = null; let bi = -1;
  (lista || []).forEach((v, i) => { if (v.inicio <= data && filtro(v) && (!best || v.inicio > best.inicio || (v.inicio === best.inicio && i > bi))) { best = v; bi = i; } });
  return best;
}
const vinculoEm = (pessoaId, data) => ultimoAte(S.pessoas.get(pessoaId)?.vinculos, data);
const ultimoVinculoAtivo = (pessoaId, antesDe = '9999-12-31') => ultimoAte(S.pessoas.get(pessoaId)?.vinculos, antesDe, (v) => !v.desligamento);

// Vínculo que vale para a competência. Desligado durante o mês: vale o anterior (desligado_no_mes). Desligado o mês todo: null.
function vinculoDoMes(pessoaId, competencia) {
  const { inicio, fim } = limites(competencia);
  const v = vinculoEm(pessoaId, fim);
  if (!v) return null;
  if (!v.desligamento) return { ...v, data_ref: fim, desligado_no_mes: false };
  if (v.inicio <= inicio) return null;
  const ant = ultimoVinculoAtivo(pessoaId, diaMais(v.inicio, -1));
  return ant ? { ...ant, data_ref: diaMais(v.inicio, -1), desligado_no_mes: true } : null;
}

function responsavelEm(unidadeId, data) {
  const u = S.unidades.get(unidadeId);
  const r = ultimoAte(u?.responsaveis, data, (x) => !x.fim || x.fim >= data);
  return r ? { ...r, unidade_id: unidadeId, pessoa_nome: S.pessoas.get(r.pessoa_id)?.nome || '—' } : null;
}
function unidadesResponsavel(pessoaId, data) {
  return [...S.unidades.values()].filter((u) => (u.responsaveis || []).some((r) => r.pessoa_id === pessoaId && r.inicio <= data && (!r.fim || r.fim >= data))).map((u) => u.id);
}
// Gestor = responsável vigente da unidade da pessoa naquela data.
function gestorEm(pessoaId, data) {
  const v = vinculoEm(pessoaId, data);
  if (!v?.unidade_id) return { unidade_id: null, gestor_id: null, gestor_nome: null, proprio: false };
  const r = responsavelEm(v.unidade_id, data);
  if (!r) return { unidade_id: v.unidade_id, gestor_id: null, gestor_nome: null, proprio: false };
  if (r.pessoa_id === pessoaId) return { unidade_id: v.unidade_id, gestor_id: null, gestor_nome: null, proprio: true };
  return { unidade_id: v.unidade_id, gestor_id: r.pessoa_id, gestor_nome: r.pessoa_nome, proprio: false };
}
// Regra do cargo aplicada à pessoa: quem é marcado "sem taxa da cooperativa" (ex.: CLT, que tem INSS) fica com taxa 0.
function regraDaPessoa(pessoa, regraV) {
  if (!regraV || !pessoa?.isento_cooperativa || !regraV.regra?.taxa_cooperativa) return regraV;
  return { ...regraV, regra: { ...regraV.regra, taxa_cooperativa: 0 }, isento_cooperativa: true };
}
function regraVigente(cargoId, competencia) {
  const c = S.cargos.get(cargoId);
  let best = null;
  for (const v of c?.versoes || []) if (v.vigente_desde <= competencia && (!best || v.vigente_desde >= best.vigente_desde)) best = v;
  return best ? { ...best } : null;
}
/* Benefícios do cargo (informativos: pagos fora do recibo de comissão). Padrão = propostas de remuneração. */
const CARTAO = 'Pix';
function beneficiosPadrao(c) {
  const r = c?.versoes?.length ? [...c.versoes].sort((a, b) => (a.vigente_desde < b.vigente_desde ? 1 : -1))[0].regra : null;
  if (!r) return [];
  if (c.publico === 'gestor' || r.tipo === 'gestor') {
    const lista = [{ nome: 'Veículo e combustível', valor: null, forma: 'por conta da LZ7 Energia' }];
    if (r.base?.modo === 'unidades') lista.push({ nome: 'Despesas de deslocamento (hospedagem, alimentação em viagem, pedágios)', valor: null, forma: 'reembolso mediante prestação de contas' });
    else lista.push({ nome: 'Alimentação', valor: null, forma: 'Pix, crédito semanal, até R$ 60,00 por refeição com comprovante' });
    return lista;
  }
  if (Number(r.beneficios) === 750) return [
    { nome: 'Vale Alimentação', valor: 300, forma: CARTAO }, { nome: 'Vale Transporte', valor: 300, forma: CARTAO }, { nome: 'Auxílio Saúde', valor: 150, forma: CARTAO },
    { nome: 'Reembolso de refeição em atendimento', valor: null, forma: 'até R$ 25,00 por dia, quando necessário' },
  ];
  return Number(r.beneficios) > 0 ? [{ nome: 'Benefícios', valor: Number(r.beneficios), forma: CARTAO }] : [];
}
function beneficiosDoCargo(cargoId) {
  const c = cargoId ? S.cargos.get(cargoId) : null;
  if (!c) return [];
  return clonar(Array.isArray(c.beneficios_lista) ? c.beneficios_lista : beneficiosPadrao(c));
}
function normalizarBeneficios(lista) {
  return (lista || []).map((b) => ({ nome: String(b.nome || '').trim(), valor: b.valor === '' || b.valor === null || b.valor === undefined ? null : centavos(Number(b.valor)), forma: String(b.forma || '').trim() || null }))
    .filter((b) => b.nome).map((b) => { if (b.valor !== null && !(b.valor >= 0)) falha(`Valor inválido no benefício "${b.nome}".`); return b; });
}
const ultimaCompetenciaFechada = () => [...S.apuracoes.keys()].sort().pop() || null;
const mesFechado = (c) => S.apuracoes.has(c);
const nomeUnidade = (id) => S.unidades.get(id)?.nome || null;
const nomeCargo = (id) => S.cargos.get(id)?.nome || null;

/* ---------- unidades ---------- */
function listarUnidades() {
  const hoje = hojeSP();
  return [...S.unidades.values()].sort((a, b) => (b.ativa !== false) - (a.ativa !== false) || porNome(a, b)).map((u) => {
    const r = responsavelEm(u.id, hoje);
    const qtd = [...S.pessoas.values()].filter((p) => p.ativo && vinculoEm(p.id, hoje)?.unidade_id === u.id).length;
    const historico = [...(u.responsaveis || [])].sort((a, b) => (b.inicio > a.inicio ? 1 : -1)).map((h) => ({ ...h, nome: S.pessoas.get(h.pessoa_id)?.nome || '—' }));
    return { ...u, ativa: u.ativa !== false, responsavel_id: r?.pessoa_id || null, responsavel_nome: r?.pessoa_nome || null, responsavel_desde: r?.inicio || null, pessoas: qtd, historico };
  });
}
async function salvarUnidade(dados, id = null) {
  const nome = String(dados.nome || '').trim();
  if (!nome) falha('Informe o nome da unidade.');
  if ([...S.unidades.values()].some((u) => u.id !== id && chaveNome(u.nome) === chaveNome(nome))) falha('Já existe uma unidade com esse nome.');
  const sigla = String(dados.sigla || '').trim().toUpperCase() || null;
  const antes = id ? S.unidades.get(id) : null;
  if (id && !antes) falha('Unidade não encontrada.');
  const uid = id || novoId('u-');
  const data = { ...(antes ? clonar(antes) : { responsaveis: [], criado_em: agoraISO() }), nome, sigla, ativa: dados.ativa === undefined ? true : !!dados.ativa };
  delete data.id;
  await commit([{ col: 'unidades', id: uid, data }], { entidade: 'unidade', entidade_id: uid, acao: id ? 'alterar' : 'criar', de: antes ? { nome: antes.nome, sigla: antes.sigla } : null, para: { nome, sigla } });
  return uid;
}
// Troca o responsável a partir de uma data; quem assume recebe o título de supervisor.
async function definirResponsavel(unidadeId, pessoaId, inicio) {
  inicio = inicio ? exigirData(inicio, 'início') : hojeSP();
  const u = clonar(S.unidades.get(unidadeId));
  if (!u) falha('Unidade não encontrada.');
  delete u.id;
  u.responsaveis = u.responsaveis || [];
  const abertos = u.responsaveis.filter((r) => !r.fim).sort((a, b) => (b.inicio > a.inicio ? 1 : -1));
  const atual = abertos[0] || null;
  if (atual && atual.inicio > inicio) falha(`O responsável atual vale desde ${atual.inicio.split('-').reverse().join('/')}. Use uma data igual ou posterior.`);
  if (pessoaId && atual?.pessoa_id === pessoaId) return;
  if (atual) {
    if (atual.inicio === inicio) u.responsaveis = u.responsaveis.filter((r) => r !== atual);
    else atual.fim = diaMais(inicio, -1);
  }
  const ws = [];
  if (pessoaId) {
    const p = S.pessoas.get(pessoaId);
    if (!p || !p.ativo) falha('Pessoa não encontrada ou desligada.');
    u.responsaveis.push({ id: novoId('r'), pessoa_id: pessoaId, inicio, fim: null });
    const pp = clonar(p); delete pp.id; pp.supervisor = true; pp.atualizado_em = agoraISO();
    ws.push({ col: 'pessoas', id: pessoaId, data: pp });
  }
  ws.unshift({ col: 'unidades', id: unidadeId, data: u });
  await commit(ws, { entidade: 'unidade', entidade_id: unidadeId, acao: 'responsavel', de: atual ? { pessoa_id: atual.pessoa_id } : null, para: { pessoa_id: pessoaId || null, inicio } });
}

/* ---------- cargos ---------- */
function listarCargos() {
  const comp = hojeSP().slice(0, 7);
  const hoje = hojeSP();
  return [...S.cargos.values()].sort((a, b) => (b.ativo !== false) - (a.ativo !== false) || porNome(a, b)).map((c) => {
    const versoes = [...(c.versoes || [])].sort((a, b) => (b.vigente_desde > a.vigente_desde ? 1 : -1));
    const vig = regraVigente(c.id, comp) || versoes[versoes.length - 1] || null;
    const pessoas = [...S.pessoas.values()].filter((p) => p.ativo && vinculoEm(p.id, hoje)?.cargo_id === c.id).length;
    return { ...c, ativo: c.ativo !== false, regra: vig?.regra || null, vigente_desde: vig?.vigente_desde || null, versoes, pessoas };
  });
}
async function salvarCargo(dados, id = null) {
  const nome = String(dados.nome || '').trim();
  if (!nome) falha('Informe o nome do cargo.');
  if ([...S.cargos.values()].some((c) => c.id !== id && chaveNome(c.nome) === chaveNome(nome))) falha('Já existe um cargo com esse nome.');
  const publico = dados.publico === 'gestor' ? 'gestor' : 'vendedor';
  const beneficiosLista = dados.beneficios_lista ? normalizarBeneficios(dados.beneficios_lista) : null;
  if (beneficiosLista) dados = { ...dados, regra: { ...dados.regra, beneficios: centavos(beneficiosLista.reduce((s, b) => s + (b.valor || 0), 0)) } };
  const regra = normalizarRegra(dados.regra);
  const vigente = validarCompetencia(dados.vigente_desde || hojeSP().slice(0, 7));
  const fechada = ultimaCompetenciaFechada();
  const antes = id ? S.cargos.get(id) : null;
  if (id && !antes) falha('Cargo não encontrado.');
  const cid = id || novoId('c-');
  const data = antes ? clonar(antes) : { criado_em: agoraISO(), versoes: [] };
  delete data.id;
  Object.assign(data, { nome, publico, ativo: dados.ativo === undefined ? true : !!dados.ativo });
  if (beneficiosLista) data.beneficios_lista = beneficiosLista;
  const atualNaVigencia = id ? regraVigente(id, vigente)?.regra : null;
  if (!id || JSON.stringify(atualNaVigencia) !== JSON.stringify(regra)) {
    if (id && fechada && vigente <= fechada) falha(`A competência ${fechada} já está fechada. A nova regra deve valer a partir de uma competência posterior.`);
    const igual = data.versoes.find((v) => v.vigente_desde === vigente);
    if (igual) Object.assign(igual, { regra, criado_por: USUARIO.id, criado_em: agoraISO() });
    else data.versoes.push({ vigente_desde: vigente, regra, criado_por: USUARIO.id, criado_em: agoraISO() });
  }
  await commit([{ col: 'cargos', id: cid, data }], { entidade: 'cargo', entidade_id: cid, acao: id ? 'alterar' : 'criar', de: antes ? { nome: antes.nome } : null, para: { nome, vigente_desde: vigente, regra } });
  return cid;
}

/* ---------- pessoas ---------- */
function resumoPessoa(p, data = hojeSP()) {
  const v = p.ativo ? vinculoEm(p.id, data) : ultimoVinculoAtivo(p.id);
  const g = p.ativo ? gestorEm(p.id, data) : { gestor_id: null, gestor_nome: null, proprio: false };
  return {
    id: p.id, nome: p.nome, cpf_mascarado: mascararCpf(p.cpf), email: p.email || null, telefone: p.telefone || null,
    supervisor: !!p.supervisor, vendedor: p.vendedor !== false, ativo: !!p.ativo, data_inicio: p.data_inicio || null,
    salario_base: p.salario_base ?? null, isento_cooperativa: !!p.isento_cooperativa, desligado_em: p.desligado_em || null, motivo_desligamento: p.motivo_desligamento || null,
    nomes_flow: p.nomes_flow || [], pix_cadastrado: !!p.pix_chave,
    unidade_id: v?.unidade_id || null, unidade_nome: nomeUnidade(v?.unidade_id), cargo_id: v?.cargo_id || null, cargo_nome: nomeCargo(v?.cargo_id),
    gestor_id: g.gestor_id, gestor_nome: g.gestor_nome, responsavel_da_propria_unidade: g.proprio,
    responsavel_de: unidadesResponsavel(p.id, data).map(nomeUnidade),
  };
}
function listarPessoas({ situacao = 'ativos' } = {}) {
  return [...S.pessoas.values()]
    .filter((p) => (situacao === 'todos' ? true : situacao === 'desligados' ? !p.ativo : p.ativo))
    .sort(porNome).map((p) => resumoPessoa(p));
}
function obterPessoa(id) {
  const p = S.pessoas.get(id);
  if (!p) falha('Pessoa não encontrada.');
  const vinculos = [...(p.vinculos || [])].map((v, i) => ({ ...v, i })).sort((a, b) => (b.inicio > a.inicio ? 1 : b.inicio < a.inicio ? -1 : b.i - a.i))
    .map((v) => ({ ...v, unidade: nomeUnidade(v.unidade_id), cargo: nomeCargo(v.cargo_id) }));
  return { ...resumoPessoa(p), cpf: formatarCpf(p.cpf || ''), pix_tipo: p.pix_tipo || null, pix_chave: p.pix_chave || null, observacoes: p.observacoes || null, vinculos };
}
function salarioBase(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = typeof v === 'number' ? v : lerValor(v);
  if (n === null || n < 0) falha('Salário base inválido.');
  return centavos(n);
}
function prepararPessoa(dados, id) {
  const nome = String(dados.nome || '').trim().replace(/\s+/g, ' ');
  if (nome.split(' ').length < 2) falha('Informe o nome completo.');
  let cpf = null;
  if (dados.cpf) {
    if (!cpfValido(dados.cpf)) falha('CPF inválido.');
    cpf = soDigitos(dados.cpf);
    const dono = [...S.pessoas.values()].find((p) => p.cpf === cpf && p.id !== id);
    if (dono) falha(`CPF já cadastrado para ${dono.nome}.`);
  }
  const pix = validarPix(dados.pix_tipo, dados.pix_chave);
  const nomesFlow = [...new Set([nome, ...(dados.nomes_flow || [])].map((s) => String(s).trim()).filter(Boolean))];
  const chaves = new Map(nomesFlow.map((n) => [chaveNome(n), n]));
  for (const outra of S.pessoas.values()) {
    if (outra.id === id) continue;
    for (const n of outra.nomes_flow || []) if (chaves.has(chaveNome(n))) falha(`"${chaves.get(chaveNome(n))}" já está vinculado a ${outra.nome}.`);
  }
  if (dados.unidade_id && !S.unidades.has(dados.unidade_id)) falha('Unidade não encontrada.');
  if (dados.cargo_id && !S.cargos.has(dados.cargo_id)) falha('Cargo não encontrado.');
  const vendedor = dados.vendedor === undefined ? true : !!dados.vendedor;
  if (vendedor && !dados.unidade_id) falha('Escolha a unidade do vendedor.');
  if (vendedor && !dados.cargo_id) falha('Escolha o cargo/faixa de comissão do vendedor.');
  return {
    nome, cpf, email: validarEmail(dados.email), telefone: validarTelefone(dados.telefone), pix_tipo: pix.tipo, pix_chave: pix.chave,
    supervisor: !!dados.supervisor, isento_cooperativa: !!dados.isento_cooperativa, vendedor, data_inicio: dados.data_inicio ? exigirData(dados.data_inicio, 'data de início') : null,
    nomes_flow: nomesFlow, observacoes: dados.observacoes ? String(dados.observacoes).trim() : null, salario_base: salarioBase(dados.salario_base),
    unidade_id: dados.unidade_id || null, cargo_id: dados.cargo_id || null,
  };
}
async function criarPessoa(dados) {
  const p = prepararPessoa(dados, null);
  const id = novoId('p-');
  const { unidade_id: unidadeId, cargo_id: cargoId, ...resto } = p;
  const data = { ...resto, ativo: true, criado_em: agoraISO(), atualizado_em: agoraISO(), vinculos: [{ id: novoId('v'), unidade_id: unidadeId, cargo_id: cargoId, inicio: p.data_inicio || '2000-01-01', desligamento: false }] };
  await commit([{ col: 'pessoas', id, data }], { entidade: 'pessoa', entidade_id: id, acao: 'criar', para: p });
  return id;
}
async function atualizarPessoa(id, dados) {
  const antes = S.pessoas.get(id);
  if (!antes) falha('Pessoa não encontrada.');
  const p = prepararPessoa(dados, id);
  const data = clonar(antes); delete data.id;
  const { unidade_id: unidadeId, cargo_id: cargoId, ...resto } = p;
  Object.assign(data, resto, { atualizado_em: agoraISO() });
  const atual = vinculoEm(id, '9999-12-31');
  if (antes.ativo && (!atual || atual.unidade_id !== unidadeId || atual.cargo_id !== cargoId)) {
    const inicio = dados.vigencia ? exigirData(dados.vigencia, 'vigência da mudança') : hojeSP();
    if (atual && inicio < atual.inicio) falha(`O vínculo atual vale desde ${atual.inicio.split('-').reverse().join('/')}. Use uma vigência igual ou posterior.`);
    const fechada = ultimaCompetenciaFechada();
    if (fechada && inicio.slice(0, 7) <= fechada) falha(`A competência ${fechada} já está fechada. A mudança de unidade/cargo deve valer a partir de uma data posterior.`);
    const mesmo = atual && atual.inicio === inicio ? data.vinculos.find((v) => v.id === atual.id) : null;
    if (mesmo) Object.assign(mesmo, { unidade_id: unidadeId, cargo_id: cargoId });
    else data.vinculos.push({ id: novoId('v'), unidade_id: unidadeId, cargo_id: cargoId, inicio, desligamento: false });
  }
  await commit([{ col: 'pessoas', id, data }], { entidade: 'pessoa', entidade_id: id, acao: 'alterar', de: antes, para: p });
}
// Desligamento: sai das listas ativas, histórico preservado para readmissão.
async function desligarPessoa(id, { data, motivo } = {}) {
  const p = S.pessoas.get(id);
  if (!p) falha('Pessoa não encontrada.');
  if (!p.ativo) falha('Pessoa já está desligada.');
  const d = data ? exigirData(data, 'data do desligamento') : hojeSP();
  const ult = vinculoEm(id, '9999-12-31');
  if (ult && d < ult.inicio) falha(`O vínculo atual começa em ${ult.inicio.split('-').reverse().join('/')}. O desligamento deve ser igual ou posterior.`);
  const pp = clonar(p); delete pp.id;
  const mot = motivo ? String(motivo).trim() : null;
  pp.vinculos.push({ id: novoId('v'), unidade_id: null, cargo_id: null, inicio: diaMais(d, 1), desligamento: true, motivo: mot });
  Object.assign(pp, { ativo: false, desligado_em: d, motivo_desligamento: mot, atualizado_em: agoraISO() });
  const ws = [{ col: 'pessoas', id, data: pp }];
  const semResp = [];
  for (const u of S.unidades.values()) {
    const abertos = (u.responsaveis || []).filter((r) => r.pessoa_id === id && !r.fim);
    if (!abertos.length) continue;
    const uu = clonar(u); delete uu.id;
    uu.responsaveis = uu.responsaveis.filter((r) => !(r.pessoa_id === id && !r.fim && r.inicio > d)).map((r) => (r.pessoa_id === id && !r.fim ? { ...r, fim: d } : r));
    ws.push({ col: 'unidades', id: u.id, data: uu });
    semResp.push(u.nome);
  }
  await commit(ws, { entidade: 'pessoa', entidade_id: id, acao: 'desligar', para: { data: d, motivo: mot, unidades_sem_responsavel: semResp } });
  return { unidades_sem_responsavel: semResp };
}
async function readmitirPessoa(id, { data, unidade_id: unidadeId, cargo_id: cargoId, reiniciar_rampagem: reiniciar } = {}) {
  const p = S.pessoas.get(id);
  if (!p) falha('Pessoa não encontrada.');
  if (p.ativo) falha('Pessoa já está ativa.');
  const d = data ? exigirData(data, 'data de retorno') : hojeSP();
  if (p.desligado_em && d <= p.desligado_em) falha(`O retorno deve ser depois do desligamento (${p.desligado_em.split('-').reverse().join('/')}).`);
  const ant = ultimoVinculoAtivo(id);
  const unidade = unidadeId || ant?.unidade_id || null;
  const cargo = cargoId || ant?.cargo_id || null;
  if (p.vendedor !== false && (!unidade || !cargo)) falha('Escolha unidade e cargo para a readmissão.');
  const pp = clonar(p); delete pp.id;
  pp.vinculos.push({ id: novoId('v'), unidade_id: unidade, cargo_id: cargo, inicio: d, desligamento: false });
  Object.assign(pp, { ativo: true, desligado_em: null, motivo_desligamento: null, atualizado_em: agoraISO() });
  if (reiniciar) pp.data_inicio = d;
  await commit([{ col: 'pessoas', id, data: pp }], { entidade: 'pessoa', entidade_id: id, acao: 'readmitir', de: { desligado_em: p.desligado_em }, para: { data: d, unidade_id: unidade, cargo_id: cargo, reiniciar_rampagem: !!reiniciar } });
}
// Nome normalizado da planilha -> pessoa.
function mapaNomesFlow() {
  const mapa = new Map();
  for (const p of S.pessoas.values()) for (const n of p.nomes_flow || []) { const k = chaveNome(n); if (k && !mapa.has(k)) mapa.set(k, { id: p.id, nome: p.nome }); }
  return mapa;
}

/* ================= apuração mensal: pedidos -> vendedor -> comissão, meta e bandeira ================= */
const LIMITE_HISTORICO_MESES = 36;
const pedidoCancelado = (p) => !!p.data_cancelamento || /cancel/i.test(p.situacao || '') || /cancel/i.test(p.situacao_os || '');
const pedidoEmDigitacao = (p) => /digita/i.test(p.situacao || '');

function novoContexto() {
  return { pedidos: new Map(), mapaNomes: mapaNomesFlow(), vinculos: new Map(), vendasUnidade: new Map(), inicioApuracao: undefined };
}
const cargoInfo = (id) => (id ? S.cargos.get(id) || null : null);
const todasPessoas = () => [...S.pessoas.values()].sort(porNome);
function vinculoMes(ctx, pessoaId, comp) {
  const k = `${pessoaId}|${comp}`;
  if (!ctx.vinculos.has(k)) ctx.vinculos.set(k, vinculoDoMes(pessoaId, comp));
  return ctx.vinculos.get(k);
}
const ehGestorNoMes = (ctx, pessoa, comp) => cargoInfo(vinculoMes(ctx, pessoa.id, comp)?.cargo_id)?.publico === 'gestor';
const noIntervalo = (p, de, ate) => (!de || p.data_referencia >= de) && (!ate || p.data_referencia <= ate);

// Pedido com vendedor, valor e situação resolvidos (ajustes da plataforma aplicados).
function resolverPedido(ctx, p) {
  const aj = S.ajustes.get(p.id) || {};
  let pessoa = null; let origem = null;
  if (aj.vendedor?.pessoa_id) { pessoa = { id: aj.vendedor.pessoa_id, nome: S.pessoas.get(aj.vendedor.pessoa_id)?.nome || '—' }; origem = 'ajuste'; }
  else if (p.vendedor_flow) { const m = ctx.mapaNomes.get(chaveNome(p.vendedor_flow)); if (m) { pessoa = m; origem = 'flow'; } }
  let status = 'conta';
  if (aj.apagado) status = 'apagado';
  else if (aj.vendedor?.excluir) status = 'excluido';
  else if (pedidoCancelado(p)) status = 'cancelado';
  else if (pedidoEmDigitacao(p)) status = 'em_digitacao';
  else if (!pessoa && !p.vendedor_flow) status = 'sem_vendedor';
  else if (!pessoa) status = 'vendedor_nao_cadastrado';
  const flow = Number(p.valor_total) || 0;
  const ed = aj.valor && aj.valor.valor !== null && aj.valor.valor !== undefined ? aj.valor : null;
  return {
    id: p.id, numero: p.numero || p.id, cliente_codigo: p.cliente_codigo || null, cliente_nome: p.cliente_nome || null, codigo_projeto: p.codigo_projeto || null,
    valor_total: ed ? Number(ed.valor) : flow, valor_flow: flow,
    valor_editado: ed ? { valor: Number(ed.valor), valor_flow_na_edicao: ed.valor_flow ?? null, justificativa: ed.justificativa, autor: ed.autor, em: ed.em,
      flow_mudou: ed.valor_flow !== null && ed.valor_flow !== undefined && Math.abs(flow - ed.valor_flow) >= 0.01 } : null,
    vendedor_flow: p.vendedor_flow || null, situacao: p.situacao || null, situacao_os: p.situacao_os || null,
    cancelado_pela_os: !p.data_cancelamento && !/cancel/i.test(p.situacao || '') && /cancel/i.test(p.situacao_os || ''),
    data_emissao: p.data_emissao || null, data_aprovacao: p.data_aprovacao || null, data_referencia: dataRef(p), sem_data_emissao: !p.data_emissao && !p.competencia && !aj.mes, competencia_planilha: aj.mes?.competencia || p.competencia || null,
    remanejado: aj.mes ? { de: aj.mes.de, para: aj.mes.competencia, justificativa: aj.mes.justificativa, autor: aj.mes.autor, em: aj.mes.em } : null,
    margem_sup: aj.margem_sup || null,
    data_cancelamento: p.data_cancelamento || null,
    pessoa_id: pessoa?.id || null, pessoa_nome: pessoa?.nome || null, origem_vinculo: origem,
    ajuste: aj.vendedor ? { pessoa_id: aj.vendedor.pessoa_id || null, excluir: !!aj.vendedor.excluir, justificativa: aj.vendedor.justificativa, autor: aj.vendedor.autor } : null,
    apagado: aj.apagado ? { ...aj.apagado } : null,
    status,
  };
}
function pedidosDoMes(ctx, comp) {
  if (ctx.pedidos.has(comp)) return ctx.pedidos.get(comp);
  const lista = (S.porComp.get(comp) || []).map((p) => resolverPedido(ctx, p))
    .sort((a, b) => (a.data_referencia < b.data_referencia ? -1 : a.data_referencia > b.data_referencia ? 1 : (String(a.numero) < String(b.numero) ? -1 : String(a.numero) > String(b.numero) ? 1 : 0)));
  ctx.pedidos.set(comp, lista);
  return lista;
}
const totalDoVendedor = (ctx, comp, pessoaId) => pedidosDoMes(ctx, comp).filter((p) => p.status === 'conta' && p.pessoa_id === pessoaId).reduce((s, p) => s + p.valor_total, 0);

function inicioApuracao() {
  if (S.cfg.inicio_apuracao) return S.cfg.inicio_apuracao;
  const comps = [...S.porComp.keys()].filter((c) => c !== 'sem-data').sort();
  return comps[0] || null;
}
async function definirInicioApuracao(comp) {
  if (comp) validarCompetencia(comp);
  if (ultimaCompetenciaFechada()) falha('Já existe competência fechada: o início da apuração não pode mais ser alterado.');
  const antes = S.cfg.inicio_apuracao || null;
  await commit([{ col: 'cfg', id: 'geral', data: { ...S.cfg, inicio_apuracao: comp || null } }], { entidade: 'configuracao', entidade_id: 'inicio_apuracao', acao: 'alterar', de: { valor: antes }, para: { valor: comp || null } });
}

function historicoAtingimento(ctx, pessoa, ate) {
  let inicio = pessoa.data_inicio ? competenciaDe(pessoa.data_inicio) : null;
  if (!inicio) {
    const ini = (pessoa.vinculos || []).map((v) => v.inicio).filter((d) => d > '2000-01-01').sort()[0];
    inicio = ini ? competenciaDe(ini) : somarMeses(ate, -11);
  }
  if (ctx.inicioApuracao === undefined) ctx.inicioApuracao = inicioApuracao();
  if (ctx.inicioApuracao && inicio < ctx.inicioApuracao) inicio = ctx.inicioApuracao;
  if (diferencaMeses(inicio, ate) > LIMITE_HISTORICO_MESES) inicio = somarMeses(ate, -LIMITE_HISTORICO_MESES);
  const hist = [];
  for (let c = inicio; c <= ate; c = somarMeses(c, 1)) {
    const fech = S.apuracoes.get(c);
    if (fech) {
      const v = fech.resultado.vendedores.find((x) => x.pessoa_id === pessoa.id);
      hist.push({ competencia: c, atingimento: v ? v.atingimento : null, meta: v?.meta ?? null, total: v?.total ?? null, cfg: v?.regra?.bandeiras || null, congelado: true });
      continue;
    }
    const vinc = vinculoMes(ctx, pessoa.id, c);
    const regra = vinc?.cargo_id && !vinc.desligado_no_mes ? regraVigente(vinc.cargo_id, c)?.regra : null;
    if (!regra) { hist.push({ competencia: c, atingimento: null, cfg: null }); continue; }
    if (regra.tipo === 'gestor') {
      const b = baseDoGestor(ctx, pessoa, c, regra, {});
      hist.push({ competencia: c, total: b.base_total, meta: b.meta || null, atingimento: b.meta ? b.base_total / b.meta * 100 : null, cfg: regra.bandeiras });
      continue;
    }
    const { meta } = metaDoMes(regra, pessoa.data_inicio, c);
    const total = totalDoVendedor(ctx, c, pessoa.id);
    hist.push({ competencia: c, total, meta, atingimento: meta ? total / meta * 100 : null, cfg: regra.bandeiras });
  }
  return hist;
}
function bandeirasDe(ctx, pessoa, ate) {
  const hist = historicoAtingimento(ctx, pessoa, ate);
  const band = calcularBandeiras(hist);
  return hist.map((h, i) => ({ ...band[i], meta: h.meta ?? null, total: h.total ?? null, congelado: !!h.congelado }));
}
const lancamentosDe = (comp) => [...S.lancamentos.values()].filter((l) => l.competencia === comp).sort((a, b) => (a.criado_em > b.criado_em ? 1 : -1));

// Pedidos de meses fechados que depois foram cancelados ou mudaram de valor.
function divergenciasPosFechamento() {
  const saida = [];
  const lancados = new Set([...S.lancamentos.values()].map((l) => l.pedido_id).filter(Boolean));
  for (const [comp, f] of S.apuracoes) {
    for (const v of f.resultado.vendedores) {
      for (const p of v.pedidos || []) {
        if (lancados.has(p.id)) continue;
        const agora = S.pedidos.get(p.id);
        if (!agora) continue;
        const aj = S.ajustes.get(p.id);
        const efetivo = aj?.valor ? Number(aj.valor.valor) : Number(agora.valor_total) || 0;
        if (pedidoCancelado(agora) || aj?.apagado) saida.push({ tipo: 'cancelado_apos_fechamento', competencia: comp, pedido_id: p.id, numero: p.numero, pessoa_id: v.pessoa_id, pessoa_nome: v.nome, valor_apurado: p.valor_total, valor_atual: 0 });
        else if (Math.abs(efetivo - p.valor_total) >= 0.01) saida.push({ tipo: 'valor_alterado_apos_fechamento', competencia: comp, pedido_id: p.id, numero: p.numero, pessoa_id: v.pessoa_id, pessoa_nome: v.nome, valor_apurado: p.valor_total, valor_atual: efetivo });
      }
    }
  }
  return saida;
}
function participaDoMes(pessoa, comp, temMov, gestor = false) {
  const { inicio, fim } = limites(comp);
  if (temMov) return true;
  if (pessoa.vendedor === false && !gestor) return false;
  if (pessoa.data_inicio && pessoa.data_inicio > fim) return false;
  if (!pessoa.ativo && (!pessoa.desligado_em || pessoa.desligado_em < inicio)) return false;
  return true;
}
function finalizarLinha(ctx, linha, pessoa, comp, regra) {
  const meus = lancamentosDe(comp).filter((l) => l.pessoa_id === pessoa.id);
  const ajustes = centavos(meus.filter((l) => l.tipo !== 'desconto').reduce((s, l) => s + l.valor, 0));
  const descontos = centavos(-meus.filter((l) => l.tipo === 'desconto').reduce((s, l) => s + l.valor, 0));
  const sb = pessoa.salario_base !== null && pessoa.salario_base !== undefined ? Number(pessoa.salario_base) : (regra?.salario_fixo || 0);
  linha.lancamentos = meus.map((l) => ({ id: l.id, tipo: l.tipo || 'ajuste', valor: l.valor, motivo: l.motivo, pedido_id: l.pedido_id || null, autor: l.autor, criado_em: l.criado_em }));
  linha.ajustes = ajustes;
  linha.descontos = descontos;
  linha.a_pagar = centavos(linha.variavel_liquido + ajustes - descontos);
  linha.salario_fixo = regra?.salario_fixo || 0;
  linha.salario_base = centavos(sb);
  linha.salario_personalizado = pessoa.salario_base !== null && pessoa.salario_base !== undefined;
  linha.total_mes = centavos(linha.salario_base + linha.a_pagar);
  return anexarComissaoPorPedido(linha);
}
function aplicarBandeira(ctx, linha, pessoa, comp, regra, comBandeira) {
  const band = comBandeira && regra?.bandeiras?.usa ? bandeirasDe(ctx, pessoa, comp) : [];
  const u = band[band.length - 1] || null;
  linha.bandeira_entrada = u ? u.entrada : null;
  linha.bandeira = u ? u.bandeira : null;
  linha.evento_bandeira = u ? u.evento : null;
  linha.alerta_bandeira = u ? u.alerta : null;
}
function cabecalhoLinha(pessoa, corte, fim, vinc, regraV) {
  const g = gestorEm(pessoa.id, vinc?.data_ref || fim);
  return {
    pessoa_id: pessoa.id, nome: pessoa.nome, ativo: !!pessoa.ativo, desligado_em: pessoa.desligado_em || null,
    data_corte: corte, parcial: corte < fim,
    unidade_id: vinc?.unidade_id || null, unidade: nomeUnidade(vinc?.unidade_id), cargo_id: vinc?.cargo_id || null, cargo: nomeCargo(vinc?.cargo_id),
    gestor_id: g.gestor_id, gestor: g.gestor_nome, responsavel_da_unidade: g.proprio,
    regra_vigente_desde: regraV?.vigente_desde || null, regra: regraV?.regra || null, sem_regra: !regraV,
  };
}
/*
 Regra da supervisão: venda com margem abaixo de 18% conta proporcional na base e na meta do gestor
 (valor × margem ÷ 18%). Ex.: R$ 310.000 a 7% = lucro de R$ 21.700 = projeto de R$ 120.555,56 a 18%.
 Não muda a comissão do vendedor.
*/
const MARGEM_MINIMA_SUP = 18;
const valorSup = (p) => (p.margem_sup && Number.isFinite(Number(p.margem_sup.margem)) && p.margem_sup.margem < MARGEM_MINIMA_SUP
  ? centavos((p.valor_total || 0) * Math.max(0, p.margem_sup.margem) / MARGEM_MINIMA_SUP) : (p.valor_total || 0));
const resumoPedido = (p) => ({ id: p.id, numero: p.numero, cliente_codigo: p.cliente_codigo, cliente_nome: p.cliente_nome, codigo_projeto: p.codigo_projeto,
  valor_total: p.valor_total, valor_flow: p.valor_flow, valor_editado: p.valor_editado ? { justificativa: p.valor_editado.justificativa, autor: p.valor_editado.autor } : null,
  data_emissao: p.data_emissao, data_aprovacao: p.data_aprovacao, data_referencia: p.data_referencia, competencia_planilha: p.competencia_planilha, origem_vinculo: p.origem_vinculo,
  remanejado: p.remanejado ? { de: p.remanejado.de, justificativa: p.remanejado.justificativa } : null,
  margem_sup: p.margem_sup ? { margem: p.margem_sup.margem, justificativa: p.margem_sup.justificativa } : null, valor_supervisao: valorSup(p) });

function linhaVendedor(ctx, pessoa, comp, { de = null, ate = null, comBandeira = true } = {}) {
  const { fim } = limites(comp);
  const corte = ate && ate < fim ? ate : fim;
  const meus = pedidosDoMes(ctx, comp).filter((p) => p.pessoa_id === pessoa.id && p.status === 'conta' && noIntervalo(p, de, corte));
  const vinc = vinculoMes(ctx, pessoa.id, comp);
  const regraV = regraDaPessoa(pessoa, vinc?.cargo_id ? regraVigente(vinc.cargo_id, comp) : null);
  const regra = regraV?.regra || null;
  const total = centavos(meus.reduce((s, p) => s + p.valor_total, 0));
  const calc = calcularComissao(total, regra || { tipo: 'fixo', percentual_fixo: 0 });
  const { meta, mes_rampagem: mesRamp } = regra && regra.tipo !== 'gestor' ? metaDoMes(regra, pessoa.data_inicio, comp) : { meta: null, mes_rampagem: null };
  const ating = meta ? total / meta * 100 : null;
  const linha = {
    tipo: 'vendedor', ...cabecalhoLinha(pessoa, corte, fim, vinc, regraV),
    qtd_pedidos: meus.length, total, percentual: calc.percentual, faixa: calc.faixa, comissao: calc.comissao, bonus: calc.bonus,
    variavel_bruto: calc.variavel_bruto, taxa_cooperativa: calc.taxa_cooperativa, variavel_liquido: calc.variavel_liquido,
    meta, mes_rampagem: mesRamp, atingimento: ating === null ? null : Math.round(ating * 100) / 100, pedidos: meus.map(resumoPedido),
  };
  aplicarBandeira(ctx, linha, pessoa, comp, regra, comBandeira);
  return finalizarLinha(ctx, linha, pessoa, comp, regra);
}
function equipeDaUnidade(ctx, unidadeId, comp) {
  const eq = [];
  for (const p of todasPessoas()) {
    const v = vinculoMes(ctx, p.id, comp);
    if (!v || v.unidade_id !== unidadeId) continue;
    if (cargoInfo(v.cargo_id)?.publico === 'gestor') continue;
    if (!participaDoMes(p, comp, false)) continue;
    const regra = v.cargo_id ? regraVigente(v.cargo_id, comp)?.regra : null;
    const { meta } = regra && regra.tipo !== 'gestor' ? metaDoMes(regra, p.data_inicio, comp) : { meta: null };
    eq.push({ pessoa_id: p.id, nome: p.nome, meta: meta || 0 });
  }
  return eq;
}
function vendasPorUnidade(ctx, comp, de, ate) {
  const k = `${comp}|${de || ''}|${ate || ''}`;
  if (ctx.vendasUnidade.has(k)) return ctx.vendasUnidade.get(k);
  const mapa = new Map();
  for (const p of pedidosDoMes(ctx, comp)) {
    if (p.status !== 'conta' || !p.pessoa_id || !noIntervalo(p, de, ate)) continue;
    const u = vinculoMes(ctx, p.pessoa_id, comp)?.unidade_id;
    if (u) mapa.set(u, (mapa.get(u) || 0) + valorSup(p));
  }
  ctx.vendasUnidade.set(k, mapa);
  return mapa;
}
function unidadesDaBase(ctx, pessoa, comp, regra, dataR) {
  if (regra.base?.modo === 'unidades' && regra.base.unidades?.length) return regra.base.unidades;
  const resp = unidadesResponsavel(pessoa.id, dataR);
  if (resp.length) return resp;
  const v = vinculoMes(ctx, pessoa.id, comp);
  return v?.unidade_id ? [v.unidade_id] : [];
}
function baseDoGestor(ctx, pessoa, comp, regra, { de = null, ate = null } = {}) {
  const { fim } = limites(comp);
  const corte = ate && ate < fim ? ate : fim;
  const vendas = vendasPorUnidade(ctx, comp, de, corte);
  const ids = unidadesDaBase(ctx, pessoa, comp, regra, corte);
  const unidades = ids.map((id) => {
    const eq = equipeDaUnidade(ctx, id, comp);
    const meta = centavos(eq.reduce((s, e) => s + e.meta, 0));
    const total = centavos(vendas.get(id) || 0);
    return { unidade_id: id, unidade: nomeUnidade(id) || id, vendas: total, meta, equipe: eq.length, atingimento: meta ? Math.round(total / meta * 10000) / 100 : null };
  });
  const diretas = pedidosDoMes(ctx, comp).filter((p) => p.pessoa_id === pessoa.id && p.status === 'conta' && noIntervalo(p, de, corte));
  const diretasTotal = centavos(diretas.reduce((s, p) => s + p.valor_total, 0));
  const propria = vinculoMes(ctx, pessoa.id, comp)?.unidade_id;
  const fora = propria && ids.includes(propria) ? 0 : centavos(diretas.reduce((s, p) => s + valorSup(p), 0));
  const equipeLista = pedidosDoMes(ctx, comp).filter((p) => p.status === 'conta' && p.pessoa_id && p.pessoa_id !== pessoa.id && noIntervalo(p, de, corte) && ids.includes(vinculoMes(ctx, p.pessoa_id, comp)?.unidade_id));
  return { unidades, diretas, diretas_total: diretasTotal, equipe_lista: equipeLista, equipe_total: centavos(equipeLista.reduce((s, p) => s + valorSup(p), 0)),
    base_total: centavos(unidades.reduce((s, u) => s + u.vendas, 0) + fora),
    meta: centavos(unidades.reduce((s, u) => s + u.meta, 0)), equipe: unidades.reduce((s, u) => s + u.equipe, 0), corte };
}
// Base do gestor: vendas da equipe (sem as dele) a 0,25%; as vendas diretas dele levam só os 2%.
function dividirBase(ctx, pessoa, comp, b, calc, regra, de) {
  const pb = regra.percentual_base || 0;
  const ids = b.unidades.map((u) => u.unidade_id);
  const equipe = b.equipe_lista.map((p) => ({ ...resumoPedido(p), vendedor: p.pessoa_nome }));
  const comissaoBaseDiretas = 0;
  return { equipe_total: b.equipe_total, pedidos_equipe: equipe, comissao_base_diretas: comissaoBaseDiretas, comissao_base_equipe: centavos(calc.comissao_base - comissaoBaseDiretas) };
}
function linhaGestor(ctx, pessoa, comp, { de = null, ate = null, comBandeira = true } = {}) {
  const { fim } = limites(comp);
  const vinc = vinculoMes(ctx, pessoa.id, comp);
  const regraV = regraDaPessoa(pessoa, vinc?.cargo_id ? regraVigente(vinc.cargo_id, comp) : null);
  const regra = regraV.regra;
  const b = baseDoGestor(ctx, pessoa, comp, regra, { de, ate });
  const calc = calcularGestor({ base_total: b.base_total, diretas_total: b.diretas_total, base_comissao: b.equipe_total, equipe: b.equipe, unidades_atingimento: b.unidades.map((u) => u.atingimento) }, regra);
  const ating = b.meta ? b.base_total / b.meta * 100 : null;
  const linha = {
    tipo: 'gestor', ...cabecalhoLinha(pessoa, b.corte, fim, vinc, regraV), responsavel_da_unidade: true,
    qtd_pedidos: b.diretas.length, total: b.diretas_total, base_total: b.base_total, unidades_base: b.unidades, equipe: b.equipe,
    elegivel: calc.elegivel, percentual: regra.percentual_base, percentual_diretas: regra.percentual_diretas,
    comissao_base: calc.comissao_base, comissao_diretas: calc.comissao_diretas, faixa_bonus_atingida: calc.faixa_bonus_atingida, faixa_bonus_paga: calc.faixa_bonus_paga,
    equilibrio: calc.equilibrio, faixa: null, comissao: calc.comissao, bonus: calc.bonus, variavel_bruto: calc.variavel_bruto,
    taxa_cooperativa: calc.taxa_cooperativa, variavel_liquido: calc.variavel_liquido, meta: b.meta || null, mes_rampagem: null,
    atingimento: ating === null ? null : Math.round(ating * 100) / 100, pedidos: b.diretas.map(resumoPedido),
    ...dividirBase(ctx, pessoa, comp, b, calc, regra, de),
  };
  aplicarBandeira(ctx, linha, pessoa, comp, regra, comBandeira);
  return finalizarLinha(ctx, linha, pessoa, comp, regra);
}
function linhaPessoa(ctx, pessoa, comp, opts = {}) {
  const vinc = vinculoMes(ctx, pessoa.id, comp);
  const regra = vinc?.cargo_id ? regraVigente(vinc.cargo_id, comp)?.regra : null;
  return regra?.tipo === 'gestor' ? linhaGestor(ctx, pessoa, comp, opts) : linhaVendedor(ctx, pessoa, comp, opts);
}

function calcularAberta(ctx, comp, { de = null, ate = null } = {}) {
  const { fim } = limites(comp);
  const filtro = !!(de || ate);
  const pedidos = pedidosDoMes(ctx, comp).filter((p) => !filtro || noIntervalo(p, de, ate));
  const lancs = lancamentosDe(comp);
  const definitivos = filtro ? new Map() : new Map([...S.fechamentos.values()].filter((f) => f.competencia === comp && f.definitivo && !f.cancelado_em).map((f) => [f.pessoa_id, f]));
  const vendedores = []; const alertas = [];
  for (const pessoa of todasPessoas()) {
    const def = definitivos.get(pessoa.id);
    const gestor = ehGestorNoMes(ctx, pessoa, comp);
    const temMov = !!def || pedidos.some((p) => p.pessoa_id === pessoa.id && p.status === 'conta') || lancs.some((l) => l.pessoa_id === pessoa.id);
    if (!participaDoMes(pessoa, comp, temMov, gestor)) continue;
    let linha;
    if (def) {
      linha = { ...clonar(def.resultado), fechamento_definitivo: { id: def.id, data_corte: def.data_corte, fechado_em: def.fechado_em, fechado_por: def.fechado_por } };
      const depois = pedidos.filter((p) => p.pessoa_id === pessoa.id && p.status === 'conta' && p.data_referencia > def.data_corte);
      if (depois.length) alertas.push({ tipo: 'pedido_apos_fechamento_individual', pessoa_id: pessoa.id, valor: centavos(depois.reduce((s, p) => s + p.valor_total, 0)),
        mensagem: `${pessoa.nome}: ${depois.length} pedido(s) com data posterior ao fechamento definitivo de ${def.data_corte.split('-').reverse().join('/')} — não entram neste mês.` });
    } else {
      linha = linhaPessoa(ctx, pessoa, comp, { de, ate: ate || null, comBandeira: !filtro });
    }
    if (linha.sem_regra) alertas.push({ tipo: 'sem_regra', pessoa_id: pessoa.id, mensagem: `${pessoa.nome} não tem cargo com regra vigente em ${comp}.` });
    vendedores.push(linha);
  }
  for (const p of pedidos) {
    if (p.status === 'vendedor_nao_cadastrado') alertas.push({ tipo: 'vendedor_nao_cadastrado', pedido_id: p.id, valor: p.valor_total, mensagem: `Pedido ${p.numero}: vendedor "${p.vendedor_flow}" não está vinculado a nenhum cadastro.` });
    if (p.status === 'sem_vendedor') alertas.push({ tipo: 'sem_vendedor', pedido_id: p.id, valor: p.valor_total, mensagem: `Pedido ${p.numero} sem vendedor na planilha.` });
  }
  const semData = (S.porComp.get('sem-data') || []).filter((p) => !S.ajustes.get(p.id)?.apagado && !pedidoCancelado(p) && !pedidoEmDigitacao(p)).length;
  if (semData && !filtro) alertas.push({ tipo: 'sem_data', mensagem: `${semData} pedido(s) sem data de emissão nem de aprovação — não entram na apuração.` });
  const semEmissao = pedidos.filter((p) => p.status === 'conta' && p.sem_data_emissao);
  if (semEmissao.length && !filtro) alertas.push({ tipo: 'sem_data_emissao', mensagem: `${semEmissao.length} pedido(s) sem data de emissão — o mês foi definido pela data de aprovação (${semEmissao.slice(0, 8).map((p) => p.numero).join(', ')}${semEmissao.length > 8 ? '…' : ''}).` });
  for (const p of pedidos.filter((x) => x.valor_editado?.flow_mudou)) {
    alertas.push({ tipo: 'valor_editado_flow_mudou', pedido_id: p.id, mensagem: `Pedido ${p.numero}: o valor na planilha mudou depois da edição (era ${brlTxt(p.valor_editado.valor_flow_na_edicao)}, agora ${brlTxt(p.valor_flow)}). A comissão continua usando o valor editado; confira.` });
  }
  for (const g of vendedores.filter((v) => v.tipo === 'gestor' && v.elegivel === false && v.regra?.minimo_vendedores)) {
    alertas.push({ tipo: 'equipe_minima', pessoa_id: g.pessoa_id, mensagem: `${g.nome}: a base tem ${g.equipe} vendedor(es); o mínimo é ${g.regra.minimo_vendedores}. Sem bônus por faixa no período (os 0,25% da unidade e as vendas diretas continuam).` });
  }
  const r = montarResultado(comp, vendedores, pedidos, alertas);
  if (filtro) r.filtro = { de: de || limites(comp).inicio, ate: ate || fim };
  return r;
}
const brlTxt = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function montarResultado(comp, vendedores, pedidos, alertas) {
  const soma = (k) => centavos(vendedores.reduce((s, v) => s + (v[k] || 0), 0));
  const porUnidade = {};
  for (const v of vendedores.filter((x) => x.tipo !== 'gestor')) {
    const k = v.unidade || 'Sem unidade';
    porUnidade[k] = porUnidade[k] || { unidade: k, total: 0, a_pagar: 0, vendedores: 0 };
    porUnidade[k].total = centavos(porUnidade[k].total + v.total);
    porUnidade[k].a_pagar = centavos(porUnidade[k].a_pagar + v.a_pagar);
    porUnidade[k].vendedores++;
  }
  return {
    competencia: comp, periodo: limites(comp), vendedores,
    totais: {
      faturado: soma('total'), comissao: soma('comissao'), bonus: soma('bonus'), variavel_bruto: soma('variavel_bruto'), taxa_cooperativa: soma('taxa_cooperativa'),
      ajustes: soma('ajustes'), descontos: soma('descontos'), a_pagar: soma('a_pagar'), salarios: soma('salario_base'), total_mes: soma('total_mes'),
      pedidos_contabilizados: pedidos.filter((p) => p.status === 'conta' && p.pessoa_id).length, pedidos_no_periodo: pedidos.length,
      nao_atribuido: centavos(pedidos.filter((p) => ['vendedor_nao_cadastrado', 'sem_vendedor'].includes(p.status)).reduce((s, p) => s + p.valor_total, 0)),
      bandeiras: { amarela: vendedores.filter((v) => v.bandeira === 'amarela').length, vermelha: vendedores.filter((v) => v.bandeira === 'vermelha').length },
    },
    por_unidade: Object.values(porUnidade).sort((a, b) => a.unidade.localeCompare(b.unidade)),
    alertas,
  };
}
// Pagamentos, recibos e fechamentos individuais são sempre lidos ao vivo, mesmo em mês fechado.
function anexarFinanceiro(r) {
  const comp = r.competencia;
  for (const v of r.vendedores) if (v.pedidos?.some((p) => p.comissao === undefined)) anexarComissaoPorPedido(v);
  const pags = [...S.pagamentos.values()].filter((p) => p.competencia === comp).sort((a, b) => (a.data_pagamento + a.criado_em > b.data_pagamento + b.criado_em ? 1 : -1));
  const recs = [...S.recibos.values()].filter((x) => x.competencia === comp).sort((a, b) => a.numero - b.numero);
  const fechs = [...S.fechamentos.values()].filter((f) => f.competencia === comp).sort((a, b) => (a.fechado_em > b.fechado_em ? 1 : -1))
    .map((f) => ({ ...f, total: f.resultado?.total, a_pagar: f.resultado?.a_pagar }));
  const pagoPorRecibo = new Map(pags.filter((p) => p.recibo_id && !p.estornado_em).map((p) => [p.recibo_id, p.id]));
  let pago = 0; let pendente = 0; let qtd = 0;
  for (const v of r.vendedores) {
    const meus = pags.filter((p) => p.pessoa_id === v.pessoa_id);
    v.pagamentos = meus;
    v.recibos = recs.filter((x) => x.pessoa_id === v.pessoa_id).map((x) => ({ ...x, pagamento_id: pagoPorRecibo.get(x.id) || null }));
    v.fechamentos = fechs.filter((f) => f.pessoa_id === v.pessoa_id);
    v.pago = centavos(meus.filter((p) => !p.estornado_em).reduce((s, p) => s + p.valor, 0));
    v.saldo = centavos(v.a_pagar - v.pago);
    v.situacao_pagamento = v.a_pagar <= 0 && v.pago === 0 ? 'sem_valor' : Math.abs(v.saldo) < 0.01 ? 'pago' : v.pago === 0 ? 'pendente' : v.saldo > 0 ? 'parcial' : 'pago_a_maior';
    pago += v.pago;
    if (v.saldo > 0.005) { pendente += v.saldo; qtd++; }
  }
  r.totais.pago = centavos(pago);
  r.totais.saldo_pendente = centavos(pendente);
  r.totais.pendentes = qtd;
  return r;
}
function obterApuracao(comp, { de = null, ate = null } = {}) {
  validarCompetencia(comp);
  const ctx = novoContexto();
  const pos = divergenciasPosFechamento();
  if (de || ate) {
    const { inicio, fim } = limites(comp);
    de = de ? normalizarData(de) : inicio;
    ate = ate ? normalizarData(ate) : fim;
    if (!de || !ate || de > ate) falha('Intervalo de dias inválido.');
    if (de < inicio || ate > fim) falha(`O filtro de dias da apuração deve ficar dentro do mês (de ${inicio.split('-').reverse().join('/')} a ${fim.split('-').reverse().join('/')}).`);
    const r = calcularAberta(ctx, comp, { de, ate });
    return anexarFinanceiro({ ...r, status: mesFechado(comp) ? 'fechada' : 'aberta', filtrada: true, divergencias: [] });
  }
  const fech = S.apuracoes.get(comp);
  if (fech) return anexarFinanceiro({ ...clonar(fech.resultado), status: 'fechada', fechada_em: fech.fechada_em, fechada_por: fech.fechada_por, divergencias: pos });
  return anexarFinanceiro({ ...calcularAberta(ctx, comp), status: 'aberta', divergencias: pos, pode_fechar: podeFechar(comp) });
}
function podeFechar(comp) {
  const { fim } = limites(comp);
  if (fim >= hojeSP()) return { ok: false, motivo: 'O mês ainda não terminou.' };
  const ultima = ultimaCompetenciaFechada();
  if (!ultima) {
    const ini = inicioApuracao();
    if (ini && comp !== ini) return { ok: false, motivo: `O primeiro fechamento deve ser ${ini} (início da apuração). Para começar em outro mês, ajuste o início em Configurações.` };
    return { ok: true };
  }
  if (comp < ultima) return { ok: false, motivo: `Já existe competência posterior fechada (${ultima}).` };
  if (comp !== somarMeses(ultima, 1)) return { ok: false, motivo: `Feche antes ${somarMeses(ultima, 1)} — os meses são fechados em sequência por causa das bandeiras.` };
  return { ok: true };
}
async function fecharApuracao(comp) {
  validarCompetencia(comp);
  const pf = podeFechar(comp);
  if (!pf.ok) falha(pf.motivo);
  if (mesFechado(comp)) falha('Competência já fechada.');
  const r = calcularAberta(novoContexto(), comp);
  await commit([{ col: 'apuracoes', id: comp, data: { competencia: comp, fechada_em: agoraISO(), fechada_por: USUARIO.id, resultado: r } }],
    { entidade: 'apuracao', entidade_id: comp, acao: 'fechar', para: { totais: r.totais } });
}
async function reabrirApuracao(comp, justificativa) {
  if (!justificativa || String(justificativa).trim().length < 5) falha('Informe a justificativa da reabertura.');
  const ultima = ultimaCompetenciaFechada();
  if (comp !== ultima) falha(`Só é possível reabrir a última competência fechada (${ultima || 'nenhuma'}).`);
  const a = S.apuracoes.get(comp);
  await commit([{ col: 'apuracoes', id: comp, data: null }], { entidade: 'apuracao', entidade_id: comp, acao: 'reabrir', de: { totais: a.resultado.totais }, para: { justificativa } });
}
// Lançamentos do mês (fechamento da folha): somam ou descontam do valor a pagar e saem no recibo. A taxa da cooperativa não incide sobre eles.
const TIPOS_LANC = {
  bonus: { rotulo: 'Bônus extra', sinal: 1, dica: 'prêmio, campanha, meta especial' },
  reembolso: { rotulo: 'Reembolso', sinal: 1, dica: 'combustível, viagem, despesa com comprovante' },
  credito: { rotulo: 'Outro crédito', sinal: 1, dica: 'qualquer outro valor a receber' },
  ajuste: { rotulo: 'Ajuste', sinal: 0, dica: 'positivo soma, negativo desconta' },
  desconto: { rotulo: 'Desconto', sinal: -1, dica: 'multa, adiantamento, avaria' },
};
const rotuloLanc = (x) => TIPOS_LANC[x?.tipo || 'ajuste']?.rotulo || 'Ajuste';
function valorLanc(tipo, v) {
  let valor = Number(v);
  if (!Number.isFinite(valor) || valor === 0) falha('Informe um valor diferente de zero.');
  const sn = TIPOS_LANC[tipo].sinal;
  if (sn > 0) valor = Math.abs(valor); else if (sn < 0) valor = -Math.abs(valor);
  return centavos(valor);
}
async function lancar(dados) {
  const comp = validarCompetencia(dados.competencia);
  if (mesFechado(comp)) falha('Competência fechada. Faça o lançamento em uma competência aberta.');
  const tipo = TIPOS_LANC[dados.tipo] ? dados.tipo : 'ajuste';
  const valor = valorLanc(tipo, dados.valor);
  const motivo = String(dados.motivo || '').trim();
  if (motivo.length < 3) falha('Informe a descrição do lançamento.');
  const ids = [...new Set((dados.pessoas_ids || [dados.pessoa_id]).filter(Boolean))];
  if (!ids.length) falha('Escolha ao menos um colaborador.');
  for (const pid of ids) if (!S.pessoas.has(pid)) falha('Colaborador não encontrado.');
  const ws = ids.map((pid) => ({ col: 'lancamentos', id: novoId('l-'), data: { pessoa_id: pid, competencia: comp, valor, motivo, pedido_id: dados.pedido_id || null, autor: USUARIO.id, tipo, criado_em: agoraISO() } }));
  await commit(ws, { entidade: 'lancamento', entidade_id: ws.length === 1 ? ws[0].id : `${ws.length} lançamentos`, acao: 'criar', para: { tipo, valor, motivo, competencia: comp, pessoa_id: ids.length === 1 ? ids[0] : null, quantidade: ids.length } });
  return ws[0].id;
}
// Valores salvos para reutilizar nos lançamentos (cfg/geral.modelos_lancamento).
async function salvarModelosLanc(lista, auditoria) {
  const limpos = lista.map((m) => ({ id: m.id || novoId('m'), nome: String(m.nome || '').trim(), tipo: TIPOS_LANC[m.tipo] ? m.tipo : 'credito',
    valor: m.valor === '' || m.valor === null || m.valor === undefined || !Number.isFinite(Number(m.valor)) ? null : centavos(Math.abs(Number(m.valor))) })).filter((m) => m.nome);
  await commit([{ col: 'cfg', id: 'geral', data: { ...S.cfg, modelos_lancamento: limpos } }], auditoria);
}
async function excluirLancamento(id) {
  const l = S.lancamentos.get(id);
  if (!l) falha('Lançamento não encontrado.');
  if (mesFechado(l.competencia)) falha('Competência fechada.');
  await commit([{ col: 'lancamentos', id, data: null }], { entidade: 'lancamento', entidade_id: id, acao: 'excluir', de: l });
}
function exigirCompetenciaAberta(p) {
  const comp = competenciaDe(dataRef(p));
  if (comp && mesFechado(comp)) falha(`O pedido está na competência ${comp}, já fechada. Use um lançamento na competência aberta.`);
}
// Margem do pedido para a regra da supervisão (abaixo de 18% conta proporcional na base do gestor).
async function margemPedido(pedidoId, dados) {
  const p = pedidoOuErro(pedidoId);
  exigirCompetenciaAberta(p);
  const antes = S.ajustes.get(pedidoId)?.margem_sup || null;
  if (dados.remover) return gravarAjuste(pedidoId, { margem_sup: null }, { entidade: 'pedido', entidade_id: pedidoId, acao: 'remover_margem', de: antes });
  const m = typeof dados.margem === 'number' ? dados.margem : lerValor(dados.margem);
  if (m === null || !Number.isFinite(m) || m < 0 || m > 100) falha('Informe a margem em % (entre 0 e 100).');
  const novo = { margem: Math.round(m * 1e6) / 1e6, justificativa: String(dados.justificativa || '').trim() || null, autor: USUARIO.id, em: agoraISO() };
  return gravarAjuste(pedidoId, { margem_sup: novo }, { entidade: 'pedido', entidade_id: pedidoId, acao: 'margem', de: antes, para: { margem: novo.margem, justificativa: novo.justificativa } });
}
// Remaneja um pedido para outra competência (só na plataforma). Voltar ao mês de origem remove o ajuste.
async function remanejarPedido(pedidoId, dados) {
  const p = pedidoOuErro(pedidoId);
  exigirCompetenciaAberta(p);
  const antes = S.ajustes.get(pedidoId)?.mes || null;
  const original = competenciaDe(dataRefOriginal(p));
  if (dados.voltar) {
    if (!antes) falha('O pedido não foi remanejado.');
    if (original && mesFechado(original)) falha(`${nomeMesTxt(original)} já está fechado. Reabra o mês ou use um lançamento.`);
    return gravarAjuste(pedidoId, { mes: null }, { entidade: 'pedido', entidade_id: pedidoId, acao: 'voltar_mes', de: antes, para: { competencia: original } });
  }
  const comp = validarCompetencia(dados.competencia);
  const atual = competenciaDe(dataRef(p));
  if (comp === atual) falha('O pedido já está nesse mês.');
  if (mesFechado(comp)) falha(`${nomeMesTxt(comp)} já está fechado. Reabra a apuração do mês para receber o pedido.`);
  if (!dados.justificativa || String(dados.justificativa).trim().length < 5) falha('Informe a justificativa do remanejamento.');
  if (comp === original) return gravarAjuste(pedidoId, { mes: null }, { entidade: 'pedido', entidade_id: pedidoId, acao: 'voltar_mes', de: antes, para: { competencia: comp, justificativa: String(dados.justificativa).trim() } });
  const novo = { competencia: comp, de: original, justificativa: String(dados.justificativa).trim(), autor: USUARIO.id, em: agoraISO() };
  return gravarAjuste(pedidoId, { mes: novo }, { entidade: 'pedido', entidade_id: pedidoId, acao: 'remanejar', de: { competencia: atual }, para: { competencia: comp, justificativa: novo.justificativa } });
}
function pedidoOuErro(id) { const p = S.pedidos.get(id); if (!p) falha('Pedido não encontrado.'); return p; }
async function gravarAjuste(pedidoId, muda, auditoria) {
  const atual = clonar(S.ajustes.get(pedidoId) || {}); delete atual.id;
  Object.assign(atual, muda);
  for (const k of Object.keys(atual)) if (atual[k] === null || atual[k] === undefined) delete atual[k];
  await commit([{ col: 'ajustes', id: pedidoId, data: Object.keys(atual).length ? atual : null }], auditoria);
}
// Valor usado na comissão (ex.: desconto devolvido ao cliente). Só na plataforma.
async function editarValorPedido(pedidoId, dados) {
  const p = pedidoOuErro(pedidoId);
  exigirCompetenciaAberta(p);
  const antes = S.ajustes.get(pedidoId)?.valor || null;
  if (dados.remover) return gravarAjuste(pedidoId, { valor: null }, { entidade: 'pedido', entidade_id: pedidoId, acao: 'remover_valor_editado', de: antes });
  const valor = typeof dados.valor === 'number' ? dados.valor : lerValor(dados.valor);
  if (valor === null || !Number.isFinite(valor) || valor < 0) falha('Informe um valor válido (zero ou maior).');
  if (!dados.justificativa || String(dados.justificativa).trim().length < 5) falha('Informe a justificativa da alteração de valor.');
  const flow = Number(p.valor_total) || 0;
  if (Math.abs(valor - flow) < 0.005 && !antes) falha('O valor informado é igual ao da planilha.');
  const novo = { valor: centavos(valor), valor_flow: flow, justificativa: String(dados.justificativa).trim(), autor: USUARIO.id, em: agoraISO() };
  return gravarAjuste(pedidoId, { valor: novo }, { entidade: 'pedido', entidade_id: pedidoId, acao: 'editar_valor', de: antes, para: novo });
}
// Apagar da plataforma: sai da lista e da comissão; a importação seguinte não traz de volta.
async function apagarPedido(pedidoId, dados) {
  const p = pedidoOuErro(pedidoId);
  exigirCompetenciaAberta(p);
  const antes = S.ajustes.get(pedidoId)?.apagado || null;
  if (dados.restaurar) {
    if (!antes) falha('O pedido não está apagado.');
    return gravarAjuste(pedidoId, { apagado: null }, { entidade: 'pedido', entidade_id: pedidoId, acao: 'restaurar', de: antes });
  }
  if (!dados.justificativa || String(dados.justificativa).trim().length < 5) falha('Informe a justificativa para apagar o pedido.');
  const novo = { justificativa: String(dados.justificativa).trim(), autor: USUARIO.id, em: agoraISO() };
  return gravarAjuste(pedidoId, { apagado: novo }, { entidade: 'pedido', entidade_id: pedidoId, acao: 'apagar', para: { numero: p.numero, cliente: p.cliente_nome, valor: p.valor_total, justificativa: novo.justificativa } });
}
async function ajustarPedido(pedidoId, dados) {
  const p = pedidoOuErro(pedidoId);
  exigirCompetenciaAberta(p);
  const antes = S.ajustes.get(pedidoId)?.vendedor || null;
  if (dados.remover) return gravarAjuste(pedidoId, { vendedor: null }, { entidade: 'pedido', entidade_id: pedidoId, acao: 'remover_ajuste', de: antes });
  if (!dados.justificativa || String(dados.justificativa).trim().length < 5) falha('Informe a justificativa.');
  const pessoaId = dados.pessoa_id || null;
  if (!pessoaId && !dados.excluir) falha('Escolha o vendedor ou marque para excluir da apuração.');
  if (pessoaId && !S.pessoas.has(pessoaId)) falha('Vendedor não encontrado.');
  const novo = { pessoa_id: pessoaId, excluir: !!dados.excluir, justificativa: String(dados.justificativa).trim(), autor: USUARIO.id, em: agoraISO() };
  return gravarAjuste(pedidoId, { vendedor: novo }, { entidade: 'pedido', entidade_id: pedidoId, acao: 'ajustar', de: antes, para: novo });
}
function listarPedidos(comp, { de = null, ate = null } = {}) {
  const ctx = novoContexto();
  if (!de && !ate) return pedidosDoMes(ctx, validarCompetencia(comp));
  de = de ? normalizarData(de) : null;
  ate = ate ? normalizarData(ate) : null;
  if (!de || !ate || de > ate) falha('Intervalo de dias inválido.');
  if (diferencaMeses(competenciaDe(de), competenciaDe(ate)) > 24) falha('Intervalo muito longo (máximo de 24 meses).');
  const lista = [];
  for (let c = competenciaDe(de); c <= competenciaDe(ate); c = somarMeses(c, 1)) lista.push(...pedidosDoMes(ctx, c).filter((p) => noIntervalo(p, de, ate)));
  return lista;
}
function painelBandeiras(ate, meses = 12) {
  validarCompetencia(ate);
  const ctx = novoContexto();
  const de = somarMeses(ate, -(meses - 1));
  const competencias = [];
  for (let c = de; c <= ate; c = somarMeses(c, 1)) competencias.push(c);
  const linhas = [];
  for (const pessoa of todasPessoas().filter((p) => p.ativo)) {
    if (pessoa.vendedor === false && !ehGestorNoMes(ctx, pessoa, ate)) continue;
    const hist = bandeirasDe(ctx, pessoa, ate);
    const porComp = new Map(hist.map((h) => [h.competencia, h]));
    const r = resumoPessoa(pessoa);
    linhas.push({ pessoa_id: pessoa.id, nome: pessoa.nome, unidade: r.unidade_nome, gestor: r.gestor_nome, cargo: r.cargo_nome, gestor_cargo: ehGestorNoMes(ctx, pessoa, ate),
      atual: hist.length ? hist[hist.length - 1] : null, meses: competencias.map((c) => porComp.get(c) || { competencia: c, atingimento: null, bandeira: null }) });
  }
  return { competencias, linhas };
}

/* ================= fechamento individual, recibos e pagamentos ================= */
const EMPRESA_PADRAO = { razao_social: 'LZ7 Energia', cnpj: '', cidade: '' };
const empresa = () => ({ ...EMPRESA_PADRAO, ...(S.cfg.empresa || {}) });
async function salvarEmpresa(dados) {
  const antes = empresa();
  const novo = { razao_social: String(dados.razao_social || '').trim() || EMPRESA_PADRAO.razao_social, cnpj: String(dados.cnpj || '').trim(), cidade: String(dados.cidade || '').trim() };
  await commit([{ col: 'cfg', id: 'geral', data: { ...S.cfg, empresa: novo } }], { entidade: 'configuracao', entidade_id: 'empresa', acao: 'alterar', de: antes, para: novo });
}
function pessoaOuErro(id) { const p = S.pessoas.get(id); if (!p) falha('Colaborador não encontrado.'); return p; }
function corteValido(comp, data) {
  const { inicio, fim } = limites(comp);
  const hoje = hojeSP();
  if (inicio > hoje) falha('A competência é futura: ainda não há o que fechar.');
  let d = data ? normalizarData(data) : (hoje < fim ? hoje : fim);
  if (!d) falha('Data de corte inválida.');
  if (d < inicio) falha('A data de corte deve estar dentro do mês.');
  if (d > fim) d = fim;
  if (d > hoje) falha('A data de corte não pode ser futura.');
  return d;
}
// Posição do colaborador: congelada (mês fechado ou fechamento definitivo) ou calculada até 'ate'.
function posicao(pessoa, comp, ate) {
  const glob = S.apuracoes.get(comp);
  if (glob) { const v = glob.resultado.vendedores.find((x) => x.pessoa_id === pessoa.id); if (v) return { ...clonar(v), origem: 'mes_fechado' }; }
  const def = [...S.fechamentos.values()].find((f) => f.pessoa_id === pessoa.id && f.competencia === comp && f.definitivo && !f.cancelado_em);
  if (def) return { ...clonar(def.resultado), origem: 'fechamento_definitivo', fechamento_id: def.id };
  return { ...linhaPessoa(novoContexto(), pessoa, comp, { ate }), origem: 'calculado' };
}
async function fecharIndividual(dados) {
  const comp = validarCompetencia(dados.competencia);
  const pessoa = pessoaOuErro(dados.pessoa_id);
  if (mesFechado(comp)) falha('A competência já está fechada para todos.');
  const corte = corteValido(comp, dados.data_corte);
  const definitivo = !!dados.definitivo;
  if (definitivo && [...S.fechamentos.values()].some((f) => f.pessoa_id === pessoa.id && f.competencia === comp && f.definitivo && !f.cancelado_em)) {
    falha('Já existe fechamento definitivo deste colaborador nesta competência. Cancele-o antes de fechar de novo.');
  }
  const linha = linhaPessoa(novoContexto(), pessoa, comp, { ate: corte });
  const id = novoId('f-');
  const numero = Math.max(0, ...[...S.fechamentos.values()].map((f) => f.numero || 0)) + 1;
  const data = { numero, pessoa_id: pessoa.id, competencia: comp, data_corte: corte, definitivo, resultado: linha, fechado_por: USUARIO.id, fechado_em: agoraISO() };
  await commit([{ col: 'fechamentos', id, data }], { entidade: 'fechamento_individual', entidade_id: id, acao: 'fechar', para: { pessoa_id: pessoa.id, competencia: comp, data_corte: corte, definitivo, total: linha.total, a_pagar: linha.a_pagar } });
  return id;
}
async function cancelarFechamento(id, motivo) {
  const f = S.fechamentos.get(id);
  if (!f || f.cancelado_em) falha('Fechamento não encontrado ou já cancelado.');
  if (mesFechado(f.competencia)) falha('A competência já está fechada para todos. Reabra o mês antes.');
  if (!motivo || String(motivo).trim().length < 5) falha('Informe o motivo do cancelamento.');
  const data = clonar(f); delete data.id;
  Object.assign(data, { cancelado_em: agoraISO(), cancelado_por: USUARIO.id, motivo_cancelamento: String(motivo).trim() });
  await commit([{ col: 'fechamentos', id, data }], { entidade: 'fechamento_individual', entidade_id: id, acao: 'cancelar', para: { motivo } });
}
const totalPago = (pessoaId, comp) => centavos([...S.pagamentos.values()].filter((p) => p.pessoa_id === pessoaId && p.competencia === comp && !p.estornado_em).reduce((s, p) => s + p.valor, 0));
function obterFechamento(id) {
  const f = S.fechamentos.get(id);
  if (!f) falha('Fechamento não encontrado.');
  const p = S.pessoas.get(f.pessoa_id);
  return { ...f, nome: p?.nome, cpf: formatarCpf(p?.cpf || ''), empresa: empresa(), pago_ate_agora: totalPago(f.pessoa_id, f.competencia) };
}
function montarPagamento(dados) {
  const comp = validarCompetencia(dados.competencia);
  const pessoa = pessoaOuErro(dados.pessoa_id);
  const valor = centavos(Number(dados.valor));
  if (!(valor > 0)) falha('Informe um valor de pagamento maior que zero.');
  const data = dados.data_pagamento ? normalizarData(dados.data_pagamento) : hojeSP();
  if (!data) falha('Data de pagamento inválida.');
  const reciboId = dados.recibo_id || null;
  if (reciboId) {
    const rec = S.recibos.get(reciboId);
    if (!rec || rec.cancelado_em || rec.pessoa_id !== pessoa.id || rec.competencia !== comp) falha('Recibo inválido para este pagamento.');
    if ([...S.pagamentos.values()].some((p) => p.recibo_id === reciboId && !p.estornado_em)) falha('Este recibo já tem pagamento registrado.');
  }
  return { pessoa_id: pessoa.id, competencia: comp, valor, data_pagamento: data, forma: dados.forma || 'pix', observacao: dados.observacao ? String(dados.observacao).trim() : null, recibo_id: reciboId, autor: USUARIO.id, criado_em: agoraISO() };
}
async function registrarPagamento(dados) {
  const data = montarPagamento(dados);
  const id = novoId('g-');
  await commit([{ col: 'pagamentos', id, data }], { entidade: 'pagamento', entidade_id: id, acao: 'registrar', para: data });
  return id;
}
async function estornarPagamento(id, motivo) {
  const pg = S.pagamentos.get(id);
  if (!pg || pg.estornado_em) falha('Pagamento não encontrado ou já estornado.');
  if (!motivo || String(motivo).trim().length < 5) falha('Informe o motivo do estorno.');
  const data = clonar(pg); delete data.id;
  Object.assign(data, { estornado_em: agoraISO(), estornado_por: USUARIO.id, motivo_estorno: String(motivo).trim() });
  await commit([{ col: 'pagamentos', id, data }], { entidade: 'pagamento', entidade_id: id, acao: 'estornar', de: pg, para: { motivo } });
}
// Monta o conteúdo do recibo (sem gravar). Usado na pré-visualização e na emissão.
function prepararRecibo(dados) {
  const comp = validarCompetencia(dados.competencia);
  const pessoa = pessoaOuErro(dados.pessoa_id);
  const dataRecibo = dados.data_recibo ? normalizarData(dados.data_recibo) : hojeSP();
  if (!dataRecibo) falha('Data do recibo inválida.');
  const { inicio, fim } = limites(comp);
  if (dataRecibo < inicio) falha('O recibo não pode ter data anterior ao início da competência.');
  let linha; let fechamentoId = null;
  if (dados.fechamento_id) {
    const f = S.fechamentos.get(dados.fechamento_id);
    if (!f || f.cancelado_em || f.pessoa_id !== pessoa.id || f.competencia !== comp) falha('Fechamento inválido para este recibo.');
    linha = { ...clonar(f.resultado), origem: f.definitivo ? 'fechamento_definitivo' : 'fechamento_parcial' };
    fechamentoId = f.id;
  } else linha = posicao(pessoa, comp, dataRecibo < fim ? dataRecibo : fim);
  if (linha.pedidos?.some((p) => p.comissao === undefined)) anexarComissaoPorPedido(linha);
  const pagoAntes = totalPago(pessoa.id, comp);
  const saldo = centavos(linha.a_pagar - pagoAntes);
  const valor = dados.valor === undefined || dados.valor === null || dados.valor === '' || !Number.isFinite(Number(dados.valor)) ? saldo : centavos(Number(dados.valor));
  const conteudo = {
    empresa: empresa(), pessoa: { nome: pessoa.nome, cpf: formatarCpf(pessoa.cpf || ''), pix_tipo: pessoa.pix_tipo || null, pix_chave: pessoa.pix_chave || null },
    competencia: comp, periodo: { inicio, fim: linha.data_corte || fim }, parcial: !!linha.parcial, origem: linha.origem,
    linha: { ...linha, regra: linha.regra ? { tipo: linha.regra.tipo, taxa_cooperativa: linha.regra.taxa_cooperativa, bonus: linha.regra.bonus, modo_faixas: linha.regra.modo_faixas, percentual_base: linha.regra.percentual_base, percentual_diretas: linha.regra.percentual_diretas } : null },
    pago_antes: pagoAntes, saldo_antes: saldo,
    beneficios: beneficiosDoCargo(linha.cargo_id), salario_base: linha.salario_base ?? null,
  };
  const numero = Math.max(0, ...[...S.recibos.values()].map((r) => r.numero || 0)) + 1;
  return { pessoa, comp, dataRecibo, fechamentoId, valor, saldo, conteudo, numero };
}
// Campos do recibo que o usuário pode mudar (nome, CPF, título, texto, seções, salário exibido, observação, cidade).
function normalizarEdicao(e) {
  if (!e) return null;
  const t = (x) => (x === null || x === undefined ? '' : String(x).trim());
  const out = { titulo: t(e.titulo) || null, nome: t(e.nome) || null, cpf: t(e.cpf) || null, cidade: e.cidade === undefined ? null : t(e.cidade),
    texto: t(e.texto) || null, observacao: t(e.observacao) || null,
    salario: e.salario === '' || e.salario === null || e.salario === undefined || !Number.isFinite(Number(e.salario)) ? null : centavos(Number(e.salario)),
    mostrar: { ...MOSTRAR_RECIBO, ...(e.mostrar || {}) }, componentes: Array.isArray(e.componentes) ? normalizarComponentes(e.componentes) : null };
  for (const c of out.componentes || []) {
    if (c.valor !== null && c.valor < 0) falha(`Valor inválido em "${c.nome}".`);
    if (c.no_recibo && !(c.valor > 0)) falha(`Informe o valor de "${c.nome}" para somar ao recibo.`);
  }
  if (out.cpf && !cpfValido(out.cpf)) falha('O CPF informado no recibo é inválido.');
  if (out.cpf) out.cpf = formatarCpf(out.cpf);
  if (out.nome && out.nome.split(/\s+/).length < 2) falha('Informe o nome completo no recibo.');
  return out;
}
async function emitirRecibo(dados) {
  const r = prepararRecibo(dados);
  if (!r.pessoa.cpf && !normalizarEdicao(dados.edicao)?.cpf) falha(`Cadastre o CPF de ${r.pessoa.nome} antes de emitir o recibo.`);
  const valor = r.valor;
  if (!(valor > 0)) falha(r.saldo <= 0 ? 'Não há saldo a pagar para este colaborador nesta competência. Informe o valor manualmente se for o caso.' : 'Informe um valor maior que zero.');
  const edicao = normalizarEdicao(dados.edicao);
  if (edicao) r.conteudo.edicao = { ...edicao, em: agoraISO(), por: USUARIO.id };
  const { numero, pessoa, comp, dataRecibo, fechamentoId, conteudo } = r;
  const id = novoId('r-');
  const ws = [{ col: 'recibos', id, data: { numero, pessoa_id: pessoa.id, competencia: comp, data_recibo: dataRecibo, data_corte: conteudo.periodo.fim, valor, valor_total: centavos(valor + somaIncluidos(edicao?.componentes)), fechamento_id: fechamentoId, dados: conteudo, emitido_por: USUARIO.id, emitido_em: agoraISO() } }];
  if (dados.registrar_pagamento) {
    ws.push({ col: 'pagamentos', id: novoId('g-'), data: { pessoa_id: pessoa.id, competencia: comp, valor, data_pagamento: dataRecibo, forma: dados.forma || 'pix', observacao: null, recibo_id: id, autor: USUARIO.id, criado_em: agoraISO() } });
  }
  await commit(ws, { entidade: 'recibo', entidade_id: id, acao: 'emitir', para: { numero, pessoa_id: pessoa.id, competencia: comp, valor, data_recibo: dataRecibo, pagamento: !!dados.registrar_pagamento } });
  return { id, numero };
}
// Altera o que aparece num recibo já emitido. Valor só muda se o recibo não tiver pagamento.
async function salvarRecibo(id, { valor, data_recibo: dataRecibo, edicao }) {
  const rec = S.recibos.get(id);
  if (!rec) falha('Recibo não encontrado.');
  if (rec.cancelado_em) falha('Recibo cancelado não pode ser alterado.');
  const pago = [...S.pagamentos.values()].some((p) => p.recibo_id === id && !p.estornado_em);
  const data = clonar(rec); delete data.id;
  const de = { valor: rec.valor, data_recibo: rec.data_recibo };
  if (valor !== undefined && valor !== null && Math.abs(Number(valor) - rec.valor) >= 0.005) {
    if (pago) falha('Este recibo já tem pagamento registrado: o valor não pode mudar. Estorne o pagamento antes.');
    if (!(Number(valor) > 0)) falha('Informe um valor maior que zero.');
    data.valor = centavos(Number(valor));
  }
  if (dataRecibo) {
    const d = normalizarData(dataRecibo);
    if (!d || d < `${rec.competencia}-01`) falha('Data do recibo inválida (não pode ser anterior ao início da competência).');
    data.data_recibo = d;
  }
  data.dados.edicao = { ...normalizarEdicao(edicao), em: agoraISO(), por: USUARIO.id };
  data.valor_total = centavos(data.valor + somaIncluidos(data.dados.edicao.componentes));
  await commit([{ col: 'recibos', id, data }], { entidade: 'recibo', entidade_id: id, acao: 'alterar', de, para: { pessoa_id: rec.pessoa_id, competencia: rec.competencia, valor: data.valor, data_recibo: data.data_recibo } });
}
async function cancelarRecibo(id, motivo) {
  const rec = S.recibos.get(id);
  if (!rec || rec.cancelado_em) falha('Recibo não encontrado ou já cancelado.');
  if ([...S.pagamentos.values()].some((p) => p.recibo_id === id && !p.estornado_em)) falha('Este recibo tem pagamento registrado. Estorne o pagamento antes de cancelar o recibo.');
  if (!motivo || String(motivo).trim().length < 5) falha('Informe o motivo do cancelamento.');
  const data = clonar(rec); delete data.id;
  Object.assign(data, { cancelado_em: agoraISO(), cancelado_por: USUARIO.id, motivo_cancelamento: String(motivo).trim() });
  await commit([{ col: 'recibos', id, data }], { entidade: 'recibo', entidade_id: id, acao: 'cancelar', para: { motivo } });
}
function obterRecibo(id) {
  const rec = S.recibos.get(id);
  if (!rec) falha('Recibo não encontrado.');
  return { ...rec, pagamento: [...S.pagamentos.values()].find((p) => p.recibo_id === id && !p.estornado_em) || null };
}

/* ================= importação: planilha de pedidos do Flow e planilha de colaboradores ================= */
// Lê .xlsx/.xls/.csv como linhas (array de arrays). Usa o SheetJS carregado na página.
function lerPlanilhaArquivo(buf) {
  if (typeof XLSX === 'undefined') falha('A biblioteca de planilhas não carregou. Recarregue a página.');
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
}

// Campo da plataforma -> cabeçalhos aceitos (sem acento/maiúsculas). Exatos primeiro; depois "contém".
const CAMPOS_PEDIDO = [
  { campo: 'id', rotulo: 'ID do pedido', exatos: ['id', 'id do pedido', 'id pedido', 'codigo do pedido', 'id cab pedido venda'], contem: [] },
  { campo: 'numero', rotulo: 'Número do pedido', exatos: ['numero', 'n', 'no', 'n o', 'numero do pedido', 'numero pedido', 'pedido', 'pedido de venda', 'n pedido', 'nº', 'n do pedido'], contem: ['numero do pedido'] },
  { campo: 'cliente_nome', rotulo: 'Cliente', exatos: ['cliente', 'nome do cliente', 'razao social', 'cliente razao social', 'nome razao social', 'cliente nome', 'nome cliente'], contem: ['cliente'] },
  { campo: 'cliente_codigo', rotulo: 'Código do cliente', exatos: ['codigo do cliente', 'cod cliente', 'codigo cliente', 'id cliente', 'cliente codigo', 'cliente id'], contem: ['codigo do cliente'] },
  { campo: 'codigo_projeto', rotulo: 'Código do projeto', exatos: ['codigo do projeto', 'codigo projeto', 'projeto', 'obra projeto', 'obra'], contem: ['projeto'] },
  { campo: 'valor_total', rotulo: 'Valor total', exatos: ['valor total', 'valor total com desconto e frete', 'total', 'valor', 'valor do pedido', 'valor total do pedido', 'total do pedido'], contem: ['valor total'] },
  { campo: 'vendedor', rotulo: 'Vendedor (consultor)', exatos: ['consultor 1', 'consultor1', 'consultor', 'vendedor', 'representante', 'vendedor responsavel'], contem: ['consultor 1', 'vendedor'] },
  { campo: 'situacao', rotulo: 'Situação do pedido', exatos: ['situacao', 'status', 'situacao do pedido', 'status do pedido'], contem: [] },
  { campo: 'situacao_os', rotulo: 'Etapa da OS', exatos: ['etapa da os', 'status os', 'status da os', 'situacao os', 'situacao da os', 'etapa', 'os status', 'ordem de servico status', 'status o s'], contem: ['etapa', 'status da o'] },
  { campo: 'data_emissao', rotulo: 'Data de emissão', exatos: ['data emissao', 'data de emissao', 'emissao', 'dt emissao', 'data'], contem: ['emissao'] },
  { campo: 'data_aprovacao', rotulo: 'Data de aprovação', exatos: ['data aprovacao', 'data de aprovacao', 'aprovacao', 'dt aprovacao'], contem: ['aprovacao'] },
  { campo: 'data_cancelamento', rotulo: 'Data de cancelamento', exatos: ['data cancelamento', 'data de cancelamento', 'cancelamento', 'dt cancelamento'], contem: ['cancelamento'] },
];
const PADRAO_PROJETO = /\b[A-Z]{2}\d{6}[A-Z]{3}\b/;
const limparNomeCliente = (n) => (n ? (String(n).replace(/^\s*[A-Z]{2}\d{6}[A-Z]{3}\s*[-–—:]?\s*/i, '').trim() || String(n).trim()) : n);

// Acha a linha de cabeçalho e propõe a coluna de cada campo (usa o mapa salvo da última importação quando o cabeçalho bate).
function proporMapa(linhas) {
  let melhor = { linha: -1, mapa: {}, pontos: 0 };
  for (let i = 0; i < Math.min(linhas.length, 25); i++) {
    const cab = linhas[i].map((c) => chaveNome(c));
    const mapa = {}; const usados = new Set();
    for (const def of CAMPOS_PEDIDO) {
      let idx = cab.findIndex((c, j) => c && !usados.has(j) && def.exatos.includes(c));
      if (idx < 0) idx = cab.findIndex((c, j) => c && !usados.has(j) && def.contem.some((x) => c.includes(x)));
      if (idx >= 0) { mapa[def.campo] = idx; usados.add(idx); }
    }
    const pontos = Object.keys(mapa).length;
    if (pontos > melhor.pontos) melhor = { linha: i, mapa, pontos };
  }
  if (melhor.linha < 0 || melhor.pontos < 3) falha('Não encontrei a linha de cabeçalho da planilha (colunas como Número, Cliente, Valor total, Vendedor, Data de emissão).');
  const cabecalho = linhas[melhor.linha].map((c) => String(c ?? '').trim());
  // Mapa salvo: campo -> texto do cabeçalho.
  const salvo = S.cfg.mapa_pedidos || {};
  for (const [campo, titulo] of Object.entries(salvo)) {
    if (titulo === '') { delete melhor.mapa[campo]; continue; }
    const j = cabecalho.findIndex((c) => chaveNome(c) === chaveNome(titulo));
    if (j >= 0) melhor.mapa[campo] = j;
  }
  return { linhaCabecalho: melhor.linha, cabecalho, mapa: melhor.mapa };
}

// Converte as linhas em pedidos do mês escolhido. A planilha é a fonte do mês inteiro:
// o que está no mês e não veio nela sai; o que veio entra com o mês informado na importação.
// Chave de cada pedido: mês + nº do pedido (se a planilha tiver) ou mês + código do projeto (WB260447COL).
// Assim, reimportar o mesmo mês atualiza os mesmos pedidos e mantém os ajustes feitos na plataforma.
function chavePedidoPlanilha(mes, base) { return `${mes}_${String(base).replace(/[^A-Za-z0-9_\-.~:@+]/g, '-')}`.slice(0, 120); }
function analisarPedidos(linhas, { linhaCabecalho, mapa }, { mes } = {}) {
  if (!mes) falha('Informe de que mês é esta planilha.');
  validarCompetencia(mes);
  if (mesFechado(mes)) falha(`${nomeMesTxt(mes)} já está fechado. Reabra a apuração do mês para importar de novo.`);
  if (mapa.valor_total === undefined) falha('Escolha a coluna do valor total.');
  if (mapa.vendedor === undefined) falha('Escolha a coluna do vendedor (consultor).');
  if (mapa.numero === undefined && mapa.id === undefined && mapa.cliente_nome === undefined && mapa.codigo_projeto === undefined) falha('Escolha a coluna do cliente (ou do número do pedido).');
  const val = (l, campo) => (mapa[campo] === undefined ? '' : l[mapa[campo]]);
  const txt = (l, campo) => { const v = val(l, campo); return v === null || v === undefined ? '' : String(Object.prototype.toString.call(v) === '[object Date]' ? normalizarData(v) : v).trim(); };
  const itens = []; const erros = []; const porId = new Map();
  for (let i = linhaCabecalho + 1; i < linhas.length; i++) {
    const l = linhas[i];
    if (!l.some((c) => String(c ?? '').trim())) continue;
    const numero = txt(l, 'numero') || txt(l, 'id');
    if (/^total/i.test(numero) || /^total/i.test(txt(l, 'cliente_nome'))) continue;
    const valor = lerValor(val(l, 'valor_total'));
    const cliente = txt(l, 'cliente_nome');
    let projeto = txt(l, 'codigo_projeto');
    const m = (projeto.toUpperCase().match(PADRAO_PROJETO) || cliente.toUpperCase().match(PADRAO_PROJETO));
    if (m) projeto = m[0];
    const rotulo = numero || projeto || cliente || `linha ${i + 1}`;
    if (valor === null) { erros.push({ linha: i + 1, erro: `${rotulo}: valor total inválido ("${txt(l, 'valor_total')}")` }); continue; }
    const base = numero || projeto || chaveNome(limparNomeCliente(cliente)).replace(/ /g, '-');
    if (!base) { erros.push({ linha: i + 1, erro: 'sem número do pedido, código do projeto ou cliente' }); continue; }
    const id = chavePedidoPlanilha(mes, base);
    const vendedor = txt(l, 'vendedor');
    // Mesma chave em mais de uma linha (ex.: um pedido quebrado por tipo de item): soma os valores.
    if (porId.has(id)) {
      const it = porId.get(id);
      it.pedido.valor_total = centavos(it.pedido.valor_total + valor);
      it.linhas.push(i + 1);
      if (vendedor && it.pedido.vendedor_flow && chaveNome(vendedor) !== chaveNome(it.pedido.vendedor_flow)) erros.push({ linha: i + 1, erro: `${rotulo}: aparece de novo com outro vendedor (${vendedor}); valor somado ao de ${it.pedido.vendedor_flow} (linha ${it.linhas[0]})`, aviso: true });
      continue;
    }
    const p = {
      numero: numero || projeto || limparNomeCliente(cliente), cliente_codigo: txt(l, 'cliente_codigo') || null, cliente_nome: limparNomeCliente(cliente) || null, codigo_projeto: projeto || null,
      valor_total: centavos(valor), vendedor_flow: vendedor || null, situacao: txt(l, 'situacao') || null, situacao_os: txt(l, 'situacao_os') || null,
      data_emissao: normalizarData(val(l, 'data_emissao')), data_aprovacao: normalizarData(val(l, 'data_aprovacao')), data_cancelamento: normalizarData(val(l, 'data_cancelamento')),
      competencia: mes,
    };
    if (!vendedor) erros.push({ linha: i + 1, erro: `${rotulo}: sem vendedor — entra como "sem vendedor" até ser atribuído`, aviso: true });
    const it = { id, linhas: [i + 1], pedido: p };
    porId.set(id, it); itens.push(it);
  }
  for (const it of itens) if (it.linhas.length > 1) erros.push({ linha: it.linhas[0], erro: `${it.pedido.numero}: ${it.linhas.length} linhas (${it.linhas.join(', ')}) somadas em um pedido de ${brlTxt(it.pedido.valor_total)}`, aviso: true });
  const CAMPOS_CMP = ['numero', 'cliente_codigo', 'cliente_nome', 'codigo_projeto', 'valor_total', 'vendedor_flow', 'situacao', 'situacao_os', 'data_emissao', 'data_aprovacao', 'data_cancelamento', 'competencia'];
  let novos = 0; let alterados = 0; let iguais = 0;
  for (const it of itens) {
    const atual = S.pedidos.get(it.id);
    if (!atual) { it.acao = 'novo'; novos++; continue; }
    const mud = CAMPOS_CMP.filter((k) => (atual[k] ?? null) !== (it.pedido[k] ?? null));
    if (mud.length) { it.acao = 'alterado'; it.mudancas = mud; alterados++; } else { it.acao = 'igual'; iguais++; }
  }
  // Tudo o que hoje está no mês e não veio na planilha sai.
  const ids = new Set(itens.map((it) => it.id));
  // Pedido remanejado para este mês a partir de outro não sai (continua vindo da planilha do mês de origem).
  const remover = [...S.pedidos.values()].filter((p) => p._doc === mes && !ids.has(p.id)).map((p) => ({ id: p.id, pedido: p }));
  const total = centavos(itens.reduce((s, it) => s + it.pedido.valor_total, 0));
  return { mes, itens, remover, erros, total, resumo: { novos, alterados, iguais, removidos: remover.length, erros: erros.filter((e) => !e.aviso).length, avisos: erros.filter((e) => e.aviso).length }, meses: [mes] };
}
const nomeMesTxt = (c) => `${MESES[Number(c.slice(5, 7)) - 1]} de ${c.slice(0, 4)}`;

// Grava o mês: pedidos novos/alterados no documento do mês; os que saíram são retirados do documento onde estavam.
async function gravarPedidos(analise, { arquivo, mapaTitulos }) {
  const docs = new Map();
  const docDe = (mes) => { if (!docs.has(mes)) docs.set(mes, clonar(S.pedidosMes.get(mes) || { itens: {} })); const d = docs.get(mes); d.itens = d.itens || {}; return d; };
  const agora = agoraISO();
  for (const r of analise.remover) delete docDe(S.pedidos.get(r.id)?._doc || analise.mes).itens[r.id];
  for (const it of analise.itens) {
    const antigo = S.pedidos.get(it.id);
    if (antigo && antigo._doc !== analise.mes) delete docDe(antigo._doc).itens[it.id];
    if (it.acao === 'igual' && antigo?._doc === analise.mes) continue;
    docDe(analise.mes).itens[it.id] = { ...it.pedido, importado_em: agora, arquivo };
  }
  const ws = [...docs.entries()].map(([mes, d]) => {
    delete d.id;
    return { col: 'pedidos', id: mes, data: Object.keys(d.itens).length ? { ...d, atualizado_em: agora } : null };
  });
  const r = analise.resumo;
  const cfg = { ...S.cfg, mapa_pedidos: mapaTitulos, ultima_importacao: { em: agora, autor: USUARIO.id, arquivo, mes: analise.mes, novos: r.novos, alterados: r.alterados, iguais: r.iguais, removidos: r.removidos } };
  ws.push({ col: 'cfg', id: 'geral', data: cfg });
  await commit(ws, { entidade: 'importacao', entidade_id: arquivo, acao: 'importar_pedidos', para: { mes: analise.mes, novos: r.novos, alterados: r.alterados, iguais: r.iguais, removidos: r.removidos, total: analise.total } });
}

/* ---------- colaboradores ---------- */
const COLUNAS_PESSOA = [
  ['nome', 'Nome completo', ['nome completo', 'nome', 'colaborador', 'vendedor']],
  ['cpf', 'CPF', ['cpf']],
  ['email', 'E-mail', ['e mail', 'email']],
  ['telefone', 'Telefone', ['telefone', 'celular', 'whatsapp', 'fone']],
  ['unidade', 'Unidade', ['unidade', 'filial']],
  ['cargo', 'Cargo', ['cargo', 'cargo faixa', 'faixa', 'faixa de comissao']],
  ['data_inicio', 'Data de início', ['data de inicio', 'data inicio', 'inicio', 'admissao', 'data de admissao']],
  ['salario_base', 'Salário base', ['salario base', 'salario', 'salario fixo']],
  ['pix_tipo', 'Tipo da chave Pix', ['tipo da chave pix', 'tipo chave pix', 'tipo pix', 'tipo de pix']],
  ['pix_chave', 'Chave Pix', ['chave pix', 'pix']],
  ['nomes_flow', 'Nomes no Flow', ['nomes no flow', 'nome no flow', 'vendedor no flow', 'consultor no flow']],
];
function modeloColaboradoresCsv() {
  const u = listarUnidades().find((x) => x.ativa)?.nome || 'Londrina';
  const c = listarCargos().find((x) => x.ativo && x.publico !== 'gestor')?.nome || 'Analista Comercial';
  return '﻿' + [COLUNAS_PESSOA.map((x) => x[1]).join(';'),
    ['Fulano de Tal Exemplo', '529.982.247-25', 'fulano@exemplo.com', '(43) 99999-0000', u, c, '01/10/2026', '3.043,00', 'CPF', '529.982.247-25', 'Fulano Tal'].join(';')].join('\r\n') + '\r\n';
}
function tipoPixPlanilha(tipo, chave) {
  const t = chaveNome(tipo);
  if (t) {
    if (t.includes('cpf')) return 'cpf'; if (t.includes('cnpj')) return 'cnpj'; if (t.includes('mail')) return 'email';
    if (t.includes('tel') || t.includes('cel') || t.includes('fone')) return 'telefone'; if (t.includes('aleat') || t.includes('evp')) return 'aleatoria';
    falha(`Tipo de chave Pix desconhecido: "${tipo}".`);
  }
  const c = String(chave).trim();
  if (c.includes('@')) return 'email';
  if (/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(c)) return 'aleatoria';
  const d = soDigitos(c);
  if (d.length === 11 && cpfValido(d)) return 'cpf';
  if (d.length === 14) return 'cnpj';
  if (d.length >= 10) return 'telefone';
  falha('Não consegui identificar o tipo da chave Pix. Preencha a coluna "Tipo da chave Pix".');
}
const resolverUnidadeTxt = (v) => { const k = chaveNome(v); if (!k) return null; const u = [...S.unidades.values()].find((x) => chaveNome(x.nome) === k || chaveNome(x.sigla) === k); if (!u) falha(`Unidade "${v}" não existe. Cadastre-a em Unidades ou corrija o nome.`); return u.id; };
const resolverCargoTxt = (v) => { const k = chaveNome(v); if (!k) return null; const c = [...S.cargos.values()].find((x) => chaveNome(x.nome) === k); if (!c) falha(`Cargo "${v}" não existe. Use exatamente o nome de Cargos e faixas.`); return c.id; };

// Prévia (gravar=false) valida tudo sem gravar; com gravar=true cria/atualiza linha a linha.
async function processarColaboradores(linhas, { gravar }) {
  let cab = -1; let mapa = {};
  for (let i = 0; i < Math.min(linhas.length, 10); i++) {
    const ch = linhas[i].map((c) => chaveNome(c));
    if (ch.some((c) => ['nome', 'nome completo', 'colaborador'].includes(c))) {
      cab = i;
      for (const [campo, , al] of COLUNAS_PESSOA) { const idx = ch.findIndex((c) => al.includes(c)); if (idx >= 0) mapa[campo] = idx; }
      break;
    }
  }
  if (cab < 0) falha('Não encontrei a linha de cabeçalho com a coluna "Nome completo". Use o modelo da plataforma.');
  const res = []; const vistos = new Map();
  for (let i = cab + 1; i < linhas.length; i++) {
    const l = linhas[i];
    const val = (c) => { if (mapa[c] === undefined) return ''; const v = l[mapa[c]]; return v instanceof Date ? normalizarData(v) : String(v ?? '').trim(); };
    if (!l.some((c) => String(c ?? '').trim())) continue;
    const item = { linha: i + 1, nome: val('nome'), acao: null, erro: null, avisos: [] };
    try {
      let cpf = soDigitos(val('cpf')) || null;
      if (cpf && cpf.length < 11 && cpf.length >= 8) cpf = cpf.padStart(11, '0');
      const nomeK = chaveNome(val('nome'));
      for (const k of [cpf && `cpf:${cpf}`, nomeK && `nome:${nomeK}`].filter(Boolean)) if (vistos.has(k)) falha(`${k.startsWith('cpf') ? 'CPF' : 'Nome'} repetido na planilha (linha ${vistos.get(k)}).`);
      for (const k of [cpf && `cpf:${cpf}`, nomeK && `nome:${nomeK}`].filter(Boolean)) vistos.set(k, i + 1);
      const existente = (cpf && [...S.pessoas.values()].find((p) => p.cpf === cpf)) || [...S.pessoas.values()].find((p) => chaveNome(p.nome) === nomeK) || null;
      const dataIni = val('data_inicio') ? normalizarData(val('data_inicio')) : null;
      if (val('data_inicio') && !dataIni) falha(`Data de início inválida: "${val('data_inicio')}".`);
      const inf = {
        nome: val('nome'), cpf, email: val('email') || null, telefone: val('telefone') || null,
        unidade_id: resolverUnidadeTxt(val('unidade')), cargo_id: resolverCargoTxt(val('cargo')), data_inicio: dataIni,
        salario_base: val('salario_base') || null, pix_chave: val('pix_chave') || null,
        nomes_flow: val('nomes_flow') ? val('nomes_flow').split(/[|,;\n]/).map((x) => x.trim()).filter(Boolean) : null,
      };
      inf.pix_tipo = inf.pix_chave ? tipoPixPlanilha(val('pix_tipo'), inf.pix_chave) : null;
      if (existente && cpf && existente.cpf === cpf && nomeK && chaveNome(existente.nome) !== nomeK) falha(`O CPF ${formatarCpf(cpf)} já pertence a ${existente.nome}. Confira o CPF ou corrija o nome na planilha.`);
      if (existente) {
        if (!existente.ativo) falha(`${existente.nome} está desligado. Resgate em Vendedores > Desligados antes de importar.`);
        const at = obterPessoa(existente.id);
        const dados = {
          nome: inf.nome || at.nome, cpf: inf.cpf || soDigitos(at.cpf) || null, email: inf.email ?? at.email, telefone: inf.telefone ?? at.telefone,
          unidade_id: inf.unidade_id ?? at.unidade_id, cargo_id: inf.cargo_id ?? at.cargo_id, data_inicio: inf.data_inicio ?? at.data_inicio,
          salario_base: inf.salario_base ?? at.salario_base, pix_tipo: inf.pix_chave ? inf.pix_tipo : at.pix_tipo, pix_chave: inf.pix_chave ?? at.pix_chave,
          nomes_flow: [...new Set([...(at.nomes_flow || []), ...(inf.nomes_flow || [])])], supervisor: at.supervisor, isento_cooperativa: at.isento_cooperativa, vendedor: at.vendedor, observacoes: at.observacoes,
        };
        prepararPessoa(dados, existente.id);
        if (gravar) await atualizarPessoa(existente.id, dados);
        item.acao = 'atualizar';
        if (at.unidade_id !== dados.unidade_id || at.cargo_id !== dados.cargo_id) item.avisos.push('mudança de unidade/cargo vale a partir de hoje');
      } else {
        if (!inf.unidade_id) falha('Informe a unidade.');
        if (!inf.cargo_id) falha('Informe o cargo.');
        const dados = { ...inf, nomes_flow: inf.nomes_flow || [], vendedor: true };
        prepararPessoa(dados, null);
        if (gravar) await criarPessoa(dados);
        item.acao = 'criar';
      }
      if (!inf.cpf) item.avisos.push('sem CPF (necessário para o recibo)');
    } catch (e) { item.erro = e.message; item.acao = 'erro'; }
    res.push(item);
  }
  const resumo = { criar: res.filter((r) => r.acao === 'criar').length, atualizar: res.filter((r) => r.acao === 'atualizar').length, erros: res.filter((r) => r.acao === 'erro').length };
  return { gravado: !!gravar, resumo, linhas: res };
}

/* ================= interface: formatação, modais, avisos ================= */
const MAPA_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => (v === null || v === undefined ? '' : String(v).replace(/[&<>"']/g, (c) => MAPA_ESC[c]));
const fmtMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNum = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const brl = (v) => (v === null || v === undefined ? '—' : fmtMoeda.format(v));
const brlCurto = (v) => {
  if (v === null || v === undefined) return '—';
  if (Math.abs(v) >= 1e6) return `R$ ${fmtNum.format(v / 1e6)} mi`;
  if (Math.abs(v) >= 1e4) return `R$ ${fmtNum.format(Math.round(v / 100) / 10)} mil`;
  return fmtMoeda.format(v);
};
const pct = (v, casas = 2) => (v === null || v === undefined ? '—' : `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas })}%`);
const data = (s) => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—');
const dataHora = (s) => (s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const nomeMes = (c) => (c ? `${MESES[Number(c.slice(5, 7)) - 1]} de ${c.slice(0, 4)}` : '');
const mesCurto = (c) => `${MESES[Number(c.slice(5, 7)) - 1].slice(0, 3)}/${c.slice(2, 4)}`;

const BANDEIRA = { normal: { rotulo: 'Normal', classe: 'ok' }, amarela: { rotulo: 'Amarela', classe: 'amarela' }, vermelha: { rotulo: 'Vermelha', classe: 'vermelha' } };
function chipBandeira(b) {
  if (!b) return '<span class="fraco">—</span>';
  const x = BANDEIRA[b];
  return `<span class="chip ${x.classe}"><span class="ponto"></span>${x.rotulo}</span>`;
}
function classeAtingimento(p, cfg) {
  if (p === null || p === undefined) return '';
  const c = cfg || { limite_vermelha: 50, limite_amarela: 71 };
  if (p >= 100) return 'ok';
  if (p < c.limite_vermelha) return 'vermelha';
  if (p < c.limite_amarela) return 'amarela';
  return '';
}
function barraAtingimento(p, cfg) {
  if (p === null || p === undefined) return '<span class="fraco">sem meta</span>';
  return `<span class="atingimento ${classeAtingimento(p, cfg)}"><span class="trilho"><i style="width:${Math.min(100, p)}%"></i></span>${pct(p, 1)}</span>`;
}

function aviso(msg, tipo = '') {
  const el = document.createElement('div');
  el.className = `aviso ${tipo}`;
  el.textContent = msg;
  document.getElementById('avisos').append(el);
  setTimeout(() => el.remove(), tipo === 'erro' ? 7000 : 3500);
}

function modal({ titulo, corpo, rodape = '', largura = 640, aoAbrir }) {
  const camada = document.getElementById('camada');
  const wrap = document.createElement('div');
  wrap.className = 'fundo-modal';
  wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true" style="--larg:${largura}px">
    <div class="modal-cab"><h3>${esc(titulo)}</h3><button class="fechar" data-fechar aria-label="Fechar">×</button></div>
    <div class="modal-corpo">${corpo}</div>${rodape ? `<div class="modal-rodape">${rodape}</div>` : ''}</div>`;
  const fechar = () => { wrap.remove(); document.removeEventListener('keydown', tecla); };
  const tecla = (e) => { if (e.key === 'Escape' && camada.lastElementChild === wrap) fechar(); };
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) fechar(); });
  wrap.addEventListener('click', (e) => { if (e.target.closest('[data-fechar]')) fechar(); });
  document.addEventListener('keydown', tecla);
  camada.append(wrap);
  const el = wrap.querySelector('.modal');
  aoAbrir?.(el, fechar);
  el.querySelector('input:not([type=hidden]):not([readonly]):not([type=file]), select, textarea')?.focus();
  return { el, fechar };
}
function gaveta({ titulo, subtitulo = '', corpo, rodape = '', aoAbrir }) {
  const camada = document.getElementById('camada');
  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="gaveta-fundo" data-fechar></div>
    <aside class="gaveta" role="dialog" aria-modal="true">
      <div class="modal-cab"><div style="flex:1;min-width:0"><h3>${esc(titulo)}</h3>${subtitulo ? `<div class="subcab">${subtitulo}</div>` : ''}</div>
        <button class="fechar" data-fechar aria-label="Fechar">×</button></div>
      <div class="modal-corpo">${corpo}</div>${rodape ? `<div class="modal-rodape">${rodape}</div>` : ''}</aside>`;
  const fechar = () => { wrap.remove(); document.removeEventListener('keydown', tecla); };
  const tecla = (e) => { if (e.key === 'Escape' && camada.lastElementChild === wrap) fechar(); };
  wrap.addEventListener('click', (e) => { if (e.target.closest('[data-fechar]')) fechar(); });
  document.addEventListener('keydown', tecla);
  camada.append(wrap);
  aoAbrir?.(wrap.querySelector('.gaveta'), fechar);
  return { fechar };
}
function confirmar(titulo, texto, { botao = 'Confirmar', perigo = false, pedirTexto = null } = {}) {
  return new Promise((ok) => {
    let respondeu = false;
    const { el, fechar } = modal({
      titulo, largura: 460,
      corpo: `<p style="margin:0 0 ${pedirTexto ? 12 : 0}px">${texto}</p>${pedirTexto ? `<label class="campo">${esc(pedirTexto)}<textarea rows="3" data-texto id="confirmar-texto"></textarea></label>` : ''}`,
      rodape: `<button class="btn" data-fechar>Cancelar</button><button class="btn ${perigo ? 'perigo' : 'primario'}" data-ok>${esc(botao)}</button>`,
    });
    el.querySelector('[data-ok]').onclick = () => { respondeu = true; const t = el.querySelector('[data-texto]')?.value; fechar(); ok(pedirTexto ? (t || '') : true); };
    el.closest('.fundo-modal').addEventListener('click', (e) => { if (!respondeu && (e.target.closest('[data-fechar]') || e.target.classList.contains('fundo-modal'))) ok(false); });
  });
}
function lerForm(el) {
  const o = {};
  el.querySelectorAll('[name]').forEach((c) => {
    if (c.type === 'checkbox') o[c.name] = c.checked;
    else if (c.type === 'radio') { if (c.checked) o[c.name] = c.value; }
    else o[c.name] = c.value.trim();
  });
  return o;
}
function opcoes(lista, sel, { vazio = null, valor = 'id', rotulo = 'nome' } = {}) {
  return (vazio !== null ? `<option value="">${esc(vazio)}</option>` : '') +
    lista.map((x) => `<option value="${esc(x[valor])}" ${String(x[valor]) === String(sel ?? '') ? 'selected' : ''}>${esc(x[rotulo])}</option>`).join('');
}
async function comBotao(botao, fn) {
  const texto = botao.innerHTML;
  botao.disabled = true;
  try { return await fn(); }
  catch (e) { aviso(e.message || String(e), 'erro'); if (!(e instanceof Erro)) console.error(e); return undefined; }
  finally { botao.disabled = false; botao.innerHTML = texto; }
}
// Entrega um arquivo ao usuário pelo recurso de download do artifact.
let DOWNLOADS = null;
async function baixar(nome, conteudo) {
  if (!DOWNLOADS) DOWNLOADS = await window.claude?.use?.('downloads');
  if (!DOWNLOADS) falha('Download indisponível nesta visualização. Abra a plataforma pelo Claude com sua conta.');
  try { await DOWNLOADS.save({ filename: nome, data: conteudo }); }
  catch (e) { if (e?.code === 'declined' || e?.code === 'cancelled') return; falha(`Não foi possível baixar o arquivo (${e?.code || 'erro'}).`); }
}

const SVG = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONES = {
  apuracao: SVG('<path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 15l3-4 3 2 4-6"/>'),
  pedidos: SVG('<path d="M7 3h10l3 3v15H4V3z"/><path d="M8 9h8M8 13h8M8 17h5"/>'),
  bandeiras: SVG('<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>'),
  vendedores: SVG('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.8-3.4 3.2-5 6-5s5.2 1.6 6 5"/><path d="M16 4.5a3 3 0 0 1 0 6M21 20c-.5-2.4-1.8-3.9-3.6-4.6"/>'),
  unidades: SVG('<path d="M3 21h18"/><path d="M5 21V8l7-4 7 4v13"/><path d="M9 21v-5h6v5"/>'),
  cargos: SVG('<path d="M4 7h16v12H4z"/><path d="M9 7V5h6v2"/><path d="M4 12h16"/>'),
  config: SVG('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/>'),
  planilha: SVG('<path d="M4 4h16v16H4z"/><path d="M4 9h16M4 14h16M10 4v16"/>'),
  subir: SVG('<path d="M12 15V4"/><path d="M7 9l5-5 5 5"/><path d="M5 20h14"/>'),
  baixar: SVG('<path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/>'),
  mais: SVG('<path d="M12 5v14M5 12h14"/>'),
  cadeado: SVG('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  doc: SVG('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>'),
};

/* ================= documentos: recibo e relatório de fechamento (PDF) e exportação CSV ================= */
const PIX_ROTULO = { cpf: 'CPF', email: 'e-mail', telefone: 'telefone', aleatoria: 'chave aleatória', cnpj: 'CNPJ' };
const porExtensoData = (s) => `${Number(s.slice(8, 10))} de ${MESES[Number(s.slice(5, 7)) - 1]} de ${s.slice(0, 4)}`;
const VERDE = [18, 71, 52]; const TINTA = [23, 32, 28]; const CINZA = [87, 99, 93]; const LINHA = [223, 228, 225];

/*
 A fonte padrão do jsPDF (Helvetica, codificação WinAnsi) não tem "−", "≥", "→" e outros símbolos.
 Quando um texto tem um desses caracteres, o jsPDF imprime a linha inteira embaralhada (letras espaçadas e símbolos
 estranhos) — era o defeito do recibo, cujo demonstrativo usa "(−)" e "≥". Todo texto do PDF passa por aqui.
*/
const WINANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const TROCAS_PDF = { '\u2212': '-', '\u2010': '-', '\u2011': '-', '\u2012': '-', '\u2015': '—', '≥': '>=', '≤': '<=', '→': '->', '←': '<-', '⚠': '!', '✓': 'ok',
  '\u202f': ' ', '\u2009': ' ', '\u2007': ' ', '\u200b': '', '\ufeff': '' };
function pdfTxt(s) {
  if (typeof s !== 'string') return s;
  let o = '';
  for (const ch of s.normalize('NFC')) {
    if (TROCAS_PDF[ch] !== undefined) { o += TROCAS_PDF[ch]; continue; }
    const c = ch.codePointAt(0);
    o += (c < 256 && (c < 0x80 || c > 0x9f)) || WINANSI_EXTRA.includes(ch) ? ch : '?';
  }
  return o;
}
const limparCelulasPdf = (linhas) => (linhas ? linhas.map((l) => l.map((c) => (c && typeof c === 'object' ? { ...c, content: pdfTxt(String(c.content ?? '')) } : pdfTxt(String(c ?? ''))))) : linhas);
function novoPdf() {
  if (!window.jspdf?.jsPDF) falha('A biblioteca de PDF não carregou. Recarregue a página.');
  const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
  if (typeof doc.autoTable !== 'function') falha('A biblioteca de tabelas do PDF não carregou. Recarregue a página.');
  const texto = doc.text.bind(doc); const quebrar = doc.splitTextToSize.bind(doc); const largura = doc.getTextWidth.bind(doc); const tabela = doc.autoTable.bind(doc);
  doc.text = (t, ...r) => texto(Array.isArray(t) ? t.map(pdfTxt) : pdfTxt(String(t ?? '')), ...r);
  doc.splitTextToSize = (t, ...r) => quebrar(pdfTxt(String(t ?? '')), ...r);
  doc.getTextWidth = (t) => largura(pdfTxt(String(t ?? '')));
  doc.autoTable = (o) => tabela({ ...o, head: limparCelulasPdf(o.head), body: limparCelulasPdf(o.body), foot: limparCelulasPdf(o.foot) });
  doc.setFont('helvetica', 'normal');
  return doc;
}
const M = 16; const LARG = 210 - 2 * M;

function cabecalhoPdf(doc, emp, titulo, linhasDireita, valorCaixa) {
  doc.setTextColor(...TINTA); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text(emp.razao_social || 'LZ7 Energia', M, 20);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...CINZA);
  if (emp.cnpj) doc.text(`CNPJ ${emp.cnpj}`, M, 25);
  doc.setTextColor(...TINTA); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(titulo.toUpperCase(), 210 - M, 20, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  let y = 25.5;
  for (const l of linhasDireita) { doc.text(l, 210 - M, y, { align: 'right' }); y += 4.6; }
  if (valorCaixa) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    const w = doc.getTextWidth(valorCaixa) + 8;
    doc.setDrawColor(...TINTA); doc.setLineWidth(0.4); doc.rect(210 - M - w, y - 3.5, w, 8);
    doc.text(valorCaixa, 210 - M - 4, y + 2, { align: 'right' }); y += 9;
  }
  y = Math.max(y, 30) + 1;
  doc.setDrawColor(...VERDE); doc.setLineWidth(0.7); doc.line(M, y, 210 - M, y);
  return y + 7;
}
function secaoPdf(doc, y, txt) {
  if (y > 265) { doc.addPage(); y = 20; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...CINZA);
  doc.text(txt.toUpperCase(), M, y);
  doc.setTextColor(...TINTA);
  return y + 2.5;
}
function paragrafoPdf(doc, y, txt, { tam = 10.5, cor = TINTA, entrelinha = 1.55 } = {}) {
  doc.setFont('helvetica', 'normal'); doc.setFontSize(tam); doc.setTextColor(...cor);
  const linhas = doc.splitTextToSize(txt, LARG);
  for (const l of linhas) { if (y > 280) { doc.addPage(); y = 20; } doc.text(l, M, y); y += tam * 0.3528 * entrelinha; }
  doc.setTextColor(...TINTA);
  return y;
}
// Linhas do demonstrativo de cálculo (vendedor ou gestor), lançamentos e extras.
// Componentes pagos no recibo, separados por natureza (como nas propostas de remuneração).
function componentesVariavel(l) {
  if (l.tipo === 'gestor') return [
    { nome: 'Comissão sobre as vendas da unidade', natureza: 'Comissão', valor: l.comissao_base || 0 },
    { nome: 'Bônus mensal por faixa de faturamento', natureza: 'Bônus', valor: l.bonus || 0 },
    { nome: 'Comissão sobre vendas diretas', natureza: 'Comissão', valor: l.comissao_diretas || 0 },
  ].filter((c) => c.valor);
  return [
    { nome: 'Comissão sobre vendas', natureza: 'Comissão', valor: l.comissao || 0 },
    { nome: 'Bônus de performance', natureza: 'Bônus', valor: l.bonus || 0 },
  ].filter((c) => c.valor);
}
function linhasDemonstrativo(l, extras = []) {
  const r = l.regra || {};
  const rows = [];
  const neg = (t) => ({ content: t, styles: { textColor: CINZA } });
  const b = (t) => ({ content: t, styles: { fontStyle: 'bold' } });
  if (l.tipo === 'gestor') {
    rows.push([neg(`Vendas da base (${(l.unidades_base || []).map((u) => u.unidade).join(', ')}): ${brl(l.base_total)}`), neg('base de cálculo'), '']);
    if (l.percentual) rows.push([`Comissão — ${pct(l.percentual)} sobre as vendas da equipe${l.equipe_total !== undefined ? ` (${brl(l.equipe_total)}, sem as diretas)` : ""}`, 'Comissão', brl(l.comissao_base)]);
    if (l.bonus) rows.push([`Bônus mensal por faixa (a partir de ${brl(l.faixa_bonus_paga?.a_partir)}, não acumulativo)`, 'Bônus', brl(l.bonus)]);
    rows.push([`Comissão sobre vendas diretas (${l.qtd_pedidos}) — ${brl(l.total)} × ${pct(l.percentual_diretas)}`, 'Comissão', brl(l.comissao_diretas)]);
  } else {
    const faixa = r.tipo === 'fixo' ? `${pct(l.percentual)} sobre o faturado` : `${pct(l.percentual)} ${r.modo_faixas === 'escalonado' ? '(efetivo, escalonado)' : 'sobre o faturado'}`;
    rows.push([neg(`Total de vendas no período (${l.qtd_pedidos}): ${brl(l.total)}`), neg('base de cálculo'), '']);
    rows.push([`Comissão sobre vendas — ${faixa}`, 'Comissão', brl(l.comissao)]);
    if (l.bonus) rows.push([`Bônus de performance (vendas ≥ ${brl(r.bonus?.gatilho)}, pago uma vez no mês)`, 'Bônus', brl(l.bonus)]);
  }
  if (l.taxa_cooperativa) rows.push([`(−) Taxa de administração da cooperativa (${pct(r.taxa_cooperativa)} sobre a comissão)`, 'Dedução', `−${brl(l.taxa_cooperativa)}`]);
  for (const x of l.lancamentos || []) rows.push([`${x.valor < 0 ? '(−)' : '(+)'} ${rotuloLanc(x)}: ${x.motivo}`, rotuloLanc(x), brl(x.valor)]);
  rows.push([b('Remuneração variável líquida do período'), '', b(brl(l.a_pagar))]);
  for (const [rot, v, total] of extras) rows.push(total ? [b(rot), '', b(brl(v))] : [rot, '', brl(v)]);
  return rows;
}
// Quadro "remuneração do mês": o que entra neste documento e o que é pago por fora (salário e benefícios).
function dadosQuadro(l, { beneficios, salario, noRecibo }) {
  const body = [];
  if (salario !== null && salario !== undefined) body.push(['Salário fixo', 'Fixo', 'pago à parte', brl(salario), noRecibo ? 'não' : '—']);
  for (const x of beneficios || []) body.push([x.nome, /reembolso|presta[cç][aã]o de contas/i.test(`${x.nome} ${x.forma || ''}`) ? 'Reembolso' : 'Benefício', x.forma || '—', x.valor === null || x.valor === undefined ? 'variável' : brl(x.valor), noRecibo ? 'não' : '—']);
  for (const c of componentesVariavel(l)) body.push([c.nome, `Variável — ${c.natureza.toLowerCase()}`, noRecibo ? 'este recibo' : 'comissão do mês', brl(c.valor), noRecibo ? 'sim' : '—']);
  if (!body.length) return null;
  const head = [['COMPONENTE', 'NATUREZA', 'FORMA DE PAGAMENTO', 'VALOR', ...(noRecibo ? ['NESTE RECIBO'] : [])]];
  if (!noRecibo) for (const r of body) r.pop();
  return { head, body, colunas: { 1: { cellWidth: 30 }, 3: { halign: 'right', cellWidth: 26 }, ...(noRecibo ? { 4: { halign: 'center', cellWidth: 22 } } : {}) } };
}
function quadroRemuneracaoPdf(doc, y, l, opcoes) { const q = dadosQuadro(l, opcoes); return q ? tabelaPdf(doc, y, q) : y; }
function tabelaPdf(doc, y, { head, body, foot, colunas }) {
  doc.autoTable({
    startY: y, head, body, foot, margin: { left: M, right: M }, theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9, textColor: TINTA, cellPadding: { top: 1.6, bottom: 1.6, left: 1.5, right: 1.5 }, lineColor: LINHA, lineWidth: { bottom: 0.2 } },
    headStyles: { fontSize: 7.5, textColor: CINZA, fontStyle: 'bold' }, footStyles: { fontStyle: 'bold', lineWidth: { top: 0.4 }, lineColor: TINTA },
    columnStyles: colunas || {},
  });
  return doc.lastAutoTable.finalY + 6;
}
function demonstrativoPdf(doc, y, l, extras) {
  return tabelaPdf(doc, y, { head: [['DESCRIÇÃO', 'NATUREZA', 'VALOR']], body: linhasDemonstrativo(l, extras), colunas: { 1: { cellWidth: 24, textColor: CINZA }, 2: { halign: 'right', cellWidth: 34 } } });
}
function dadosVendas(l) {
  if (!l.pedidos?.length) return null;
  if (l.pedidos.some((p) => p.comissao === undefined)) anexarComissaoPorPedido(l);
  const soma = l.pedidos.reduce((s, p) => s + (p.comissao || 0), 0);
  const ed = l.pedidos.filter((p) => p.valor_editado);
  // Pedido sem número próprio (planilha só com projeto): não repete o código em duas colunas.
  const mesmo = (p) => p.numero && p.codigo_projeto && p.numero === p.codigo_projeto;
  return {
    head: [['PEDIDO', 'PROJETO / CLIENTE', 'MÊS / EMISSÃO', 'VALOR', '%', 'COMISSÃO']],
    body: l.pedidos.map((p) => [p.numero, (mesmo(p) ? [p.cliente_nome] : [p.codigo_projeto, p.cliente_nome]).filter(Boolean).join(' — ') || '—', (p.competencia_planilha ? mesCurto(p.competencia_planilha) : data(p.data_referencia || p.data_aprovacao)), `${p.valor_editado ? '* ' : ''}${brl(p.valor_total)}`, pct(p.percentual_comissao), brl(p.comissao)]),
    foot: [['Total', '', '', brl(l.total), '', brl(soma)]],
    colunas: { 0: { cellWidth: 26 }, 2: { cellWidth: 20 }, 3: { halign: 'right', cellWidth: 27 }, 4: { halign: 'right', cellWidth: 13 }, 5: { halign: 'right', cellWidth: 24 } },
    notas: [`Comissão por venda = valor do pedido × percentual da faixa atingida no período${l.tipo === 'gestor' ? ' (vendas diretas do gestor)' : ''}.${l.bonus ? ` O bônus de ${brl(l.bonus)} é do mês e não está distribuído entre as vendas.` : ''}`,
      ...(ed.length ? [`* Valor ajustado na plataforma: ${ed.map((p) => `pedido ${p.numero} — ${brl(p.valor_flow)} na planilha → ${brl(p.valor_total)} (${p.valor_editado.justificativa})`).join('; ')}.`] : [])],
  };
}
function vendasPdfDe(doc, y, v) {
  if (!v) return paragrafoPdf(doc, y + 3, 'Nenhuma venda no período.') + 4;
  y = tabelaPdf(doc, y, v);
  y -= 3;
  for (const n of v.notas) y = paragrafoPdf(doc, y, n, { tam: 8, cor: CINZA, entrelinha: 1.4 });
  return y + 3;
}
const vendasPdf = (doc, y, l) => vendasPdfDe(doc, y, dadosVendas(l));
function rodapePdf(doc, txt, cancelado) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    if (cancelado) { doc.setTextColor(232, 190, 186); doc.setFont('helvetica', 'bold'); doc.setFontSize(64); doc.text('CANCELADO', 105, 160, { align: 'center', angle: 18 }); }
    doc.setDrawColor(...LINHA); doc.setLineWidth(0.2); doc.line(M, 285, 210 - M, 285);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(138, 149, 143);
    doc.text(doc.splitTextToSize(`${txt}${n > 1 ? ` · página ${i} de ${n}` : ''}`, LARG), M, 289);
  }
}
/* ---------- recibo: modelo único para o PDF e para a pré-visualização ----------
 Leitura simples: declaração curta + uma tabela "Discriminação" com o que soma (+) e o que desconta (−) até o total.
 Reembolsos não entram no recibo.
*/
const MOSTRAR_RECIBO = { demonstrativo: true, vendas: true, pix: true };
const listaTxt = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);
const NATUREZAS_REC = ['Fixo', 'Benefício', 'Outro'];
const ehReembolso = (c) => c.natureza === 'Reembolso' || /reembolso|presta[cç][aã]o de contas/i.test(`${c.nome || ''} ${c.forma || ''}`);
// Salário e todos os benefícios do cargo (pagos por Pix). Alimentação/refeição não tem valor fixo: entra marcada e em branco para informar o valor do mês.
function componentesPadrao({ salario, beneficios, comSalario = true }) {
  const out = [];
  if (comSalario && Number(salario) > 0) out.push({ nome: 'Salário fixo', natureza: 'Fixo', forma: 'Pix', valor: centavos(salario), no_recibo: true });
  for (const b of beneficios || []) {
    const v = Number(b.valor) > 0 ? centavos(b.valor) : null;
    const daEmpresa = /por conta da/i.test(b.forma || ''); // ex.: veículo e combustível da LZ7 — não é pago em dinheiro
    out.push({ nome: b.nome, natureza: 'Benefício', forma: daEmpresa ? b.forma : 'Pix', valor: v, no_recibo: !daEmpresa });
  }
  return out;
}
function normalizarComponentes(lista) {
  return (lista || []).map((c) => ({ nome: String(c.nome || '').trim(), natureza: NATUREZAS_REC.includes(c.natureza) ? c.natureza : 'Outro', forma: String(c.forma || '').trim(),
    valor: c.valor === '' || c.valor === null || c.valor === undefined || !Number.isFinite(Number(c.valor)) ? null : centavos(Number(c.valor)), no_recibo: !!c.no_recibo })).filter((c) => c.nome);
}
const incluidosNoRecibo = (fixos) => (fixos || []).filter((c) => c.no_recibo && c.valor > 0);
const somaIncluidos = (fixos) => centavos(incluidosNoRecibo(fixos).reduce((t, c) => t + c.valor, 0));
const VERMELHO_PDF = [179, 38, 30];
const sinal = (v) => `${v < 0 ? '− ' : '+ '}${brl(Math.abs(v))}`;
// Linhas da discriminação: [descrição, detalhe, valor com sinal]. Soma exatamente o total do recibo.
function linhasDiscriminacao(l, d, fixos, valorComissao) {
  const r = l.regra || {};
  const linhas = [];
  const add = (rot, det, v) => { if (Math.abs(v) >= 0.005) linhas.push({ rot, det, v: centavos(v) }); };
  for (const c of incluidosNoRecibo(fixos)) add(c.nome, c.natureza === 'Fixo' ? 'salário do mês' : c.natureza === 'Benefício' ? `benefício${c.forma ? ` · ${c.forma}` : ''}` : (c.forma || ''), c.valor);
  if (l.tipo === 'gestor') {
    if (l.comissao_base_equipe !== undefined && l.percentual) {
      const nE = (l.pedidos_equipe || []).length;
      add('Comissão sobre vendas diretas', `${pct(l.percentual_diretas)} sobre ${brl(l.total)} (${l.qtd_pedidos} venda${l.qtd_pedidos === 1 ? '' : 's'})`, (l.comissao_diretas || 0) + (l.comissao_base_diretas || 0));
      const nProp = (l.pedidos_equipe || []).filter((p) => p.valor_supervisao !== undefined && Math.abs(p.valor_supervisao - p.valor_total) >= 0.01).length;
      add('Comissão sobre vendas da equipe', `${pct(l.percentual)} sobre ${brl(l.equipe_total)} (${nE} venda${nE === 1 ? '' : 's'}, sem as diretas${nProp ? `; ${nProp} proporcional à margem` : ''})`, l.comissao_base_equipe || 0);
    } else {
      add('Comissão sobre as vendas da unidade', `${pct(l.percentual)} sobre ${brl(l.base_total)}`, l.comissao_base || 0);
      add('Comissão sobre vendas diretas', `${pct(l.percentual_diretas)} sobre ${brl(l.total)}`, l.comissao_diretas || 0);
    }
    add('Bônus por faixa de vendas', l.faixa_bonus_paga ? `vendas da base a partir de ${brl(l.faixa_bonus_paga.a_partir)}` : '', l.bonus || 0);
  } else {
    add('Comissão sobre vendas', `${pct(l.percentual)} sobre ${brl(l.total)} (${l.qtd_pedidos} venda${l.qtd_pedidos === 1 ? '' : 's'})`, l.comissao || 0);
    add('Bônus de performance', r.bonus?.gatilho ? `vendas acima de ${brl(r.bonus.gatilho)}` : '', l.bonus || 0);
  }
  add('Taxa da cooperativa', `${pct(r.taxa_cooperativa)} sobre a comissão`, -(l.taxa_cooperativa || 0));
  for (const x of l.lancamentos || []) add(rotuloLanc(x), x.motivo, x.valor);
  add('Já pago nesta competência', 'pagamentos anteriores', -(d.pago_antes || 0));
  add('Diferença no valor deste recibo', 'valor informado na emissão', valorComissao - (d.saldo_antes ?? valorComissao));
  return linhas;
}
function textoPadraoRecibo({ nome, cpf, emp, valor, d, l, fixos }) {
  const inc = incluidosNoRecibo(fixos);
  const partes = [inc.some((c) => c.natureza === 'Fixo') ? 'salário' : null, inc.some((c) => c.natureza === 'Benefício') ? 'benefícios' : null, inc.some((c) => c.natureza === 'Outro') ? 'outros valores' : null,
    (l.comissao || l.comissao_base || l.comissao_diretas) ? 'comissão' : null, (l.bonus || (l.lancamentos || []).some((x) => x.tipo === 'bonus')) ? 'bônus' : null,
    (l.lancamentos || []).some((x) => x.tipo === 'reembolso') ? 'reembolso' : null].filter(Boolean);
  return `Eu, ${String(nome || '').toUpperCase()}, CPF nº ${cpf || '___.___.___-__'}, declaro que recebi de ${emp.razao_social}${emp.cnpj ? ` (CNPJ ${emp.cnpj})` : ''} a importância de ${brl(valor)} (${reaisPorExtenso(valor)}), referente a ${partes.length ? listaTxt(partes) : 'remuneração'} de ${nomeMes(d.competencia)} (período de ${data(d.periodo.inicio)} a ${data(d.periodo.fim)}${d.parcial ? ', apuração parcial' : ''}), conforme discriminado abaixo, dando plena quitação deste valor.`;
}
function vendasEquipeRecibo(l) {
  const ps = l.pedidos_equipe;
  if (!ps?.length) return null;
  if (ps.some((p) => p.comissao === undefined)) anexarComissaoPorPedido(l);
  const lista = l.pedidos_equipe;
  const cons = (p) => p.valor_supervisao ?? p.valor_total;
  const prop = lista.filter((p) => Math.abs(cons(p) - p.valor_total) >= 0.01);
  return {
    head: [['PEDIDO', 'VENDEDOR', 'CLIENTE', 'VENDA', 'CONSIDERADO', 'COMISSÃO']],
    body: lista.map((p) => [p.numero || p.codigo_projeto || '—', p.vendedor || '—', p.cliente_nome || '—', brl(p.valor_total), `${prop.includes(p) ? '* ' : ''}${brl(cons(p))}`, brl(p.comissao)]),
    foot: [[`Total (${pct(l.percentual)})`, '', '', brl(lista.reduce((t, p) => t + p.valor_total, 0)), brl(l.equipe_total), brl(lista.reduce((t, p) => t + (p.comissao || 0), 0))]],
    colunas: { 0: { cellWidth: 24 }, 1: { cellWidth: 32 }, 3: { halign: 'right', cellWidth: 24 }, 4: { halign: 'right', cellWidth: 25 }, 5: { halign: 'right', cellWidth: 19 } },
    notas: prop.length ? [`* Margem abaixo de ${MARGEM_MINIMA_SUP}%: conta proporcional (venda × margem ÷ ${MARGEM_MINIMA_SUP}%). ${prop.map((p) => `${p.numero} — margem ${pct(p.margem_sup.margem)}: ${brl(p.valor_total)} → ${brl(cons(p))}${p.margem_sup.justificativa ? ` (${p.margem_sup.justificativa})` : ''}`).join('; ')}.`] : [],
  };
}
function vendasRecibo(l) {
  if (!l.pedidos?.length) return null;
  if (l.pedidos.some((p) => p.comissao === undefined)) anexarComissaoPorPedido(l);
  const soma = l.pedidos.reduce((t, p) => t + (p.comissao || 0), 0);
  const ed = l.pedidos.filter((p) => p.valor_editado);
  return {
    head: [['PEDIDO', 'CLIENTE', 'VENDA', '%', 'COMISSÃO']],
    body: l.pedidos.map((p) => [p.numero || p.codigo_projeto || '—', p.cliente_nome || '—', `${p.valor_editado ? '* ' : ''}${brl(p.valor_total)}`, pct(p.percentual_comissao), brl(p.comissao)]),
    foot: [['Total', '', brl(l.total), '', brl(soma)]],
    colunas: { 0: { cellWidth: 28 }, 2: { halign: 'right', cellWidth: 28 }, 3: { halign: 'right', cellWidth: 13 }, 4: { halign: 'right', cellWidth: 26 } },
    notas: ed.length ? [`* Valor ajustado: ${ed.map((p) => `${p.numero} — ${brl(p.valor_flow)} na planilha, considerado ${brl(p.valor_total)} (${p.valor_editado.justificativa})`).join('; ')}.`] : [],
  };
}
/*
 base = recibo gravado ({numero, valor, data_recibo, dados, emitido_em, ...}) ou prévia ({numero, valor, data_recibo, dados, previa: true}).
 base.valor = parte da comissão; o total do recibo soma o salário e os benefícios marcados.
*/
function modeloRecibo(base) {
  const d = base.dados; const l = d.linha; const ed = d.edicao || {};
  const emp = { ...(d.empresa || empresa()) };
  const mostrar = { ...MOSTRAR_RECIBO, ...(ed.mostrar || {}) };
  const nome = ed.nome || d.pessoa.nome;
  const cpf = ed.cpf || d.pessoa.cpf;
  const beneficios = d.beneficios || beneficiosDoCargo(l.cargo_id);
  const salario = ed.salario ?? d.salario_base ?? l.salario_base ?? null;
  const fixos = Array.isArray(ed.componentes) ? normalizarComponentes(ed.componentes) : componentesPadrao({ salario, beneficios });
  const inc = incluidosNoRecibo(fixos);
  const total = centavos(base.valor + somaIncluidos(fixos));
  const linhas = linhasDiscriminacao(l, d, fixos, base.valor);
  const discriminacao = {
    head: [['DESCRIÇÃO', 'DETALHE', 'VALOR']],
    body: linhas.map((x) => [x.rot, { content: x.det || '', styles: { textColor: CINZA } }, x.v < 0 ? { content: sinal(x.v), styles: { textColor: VERMELHO_PDF } } : sinal(x.v)]),
    foot: [['Total recebido', '', brl(total)]],
    colunas: { 1: { cellWidth: 70 }, 2: { halign: 'right', cellWidth: 32 } },
  };
  const atual = S.pessoas.get(base.pessoa_id);
  const pixDe = d.pessoa.pix_chave ? d.pessoa : atual?.pix_chave ? atual : null;
  const texto = ed.texto || textoPadraoRecibo({ nome, cpf, emp, valor: total, d, l, fixos });
  return {
    empresa: emp, titulo: ed.titulo || (inc.length ? 'Recibo de pagamento' : 'Recibo de comissão'),
    numero: base.numero, numeroTxt: base.numero ? `Nº ${String(base.numero).padStart(6, '0')}` : '', previa: !!base.previa,
    valor: total, valor_comissao: base.valor, fixos, data_recibo: base.data_recibo, nome, cpf, texto,
    cidade: ed.cidade !== null && ed.cidade !== undefined ? ed.cidade : (emp.cidade || ''), observacao: ed.observacao || '',
    mostrar, linha: l, discriminacao,
    vendas: vendasRecibo(l), tituloVendas: l.tipo === 'gestor' ? `Vendas diretas do período — ${pct(l.percentual_diretas || 0)}` : 'Vendas do período',
    vendasEquipe: l.tipo === 'gestor' && l.percentual ? vendasEquipeRecibo(l) : null, tituloEquipe: `Vendas da equipe (base, sem as diretas) — ${pct(l.percentual)}`,
    pix: pixDe ? `Pix (${PIX_ROTULO[pixDe.pix_tipo] || 'chave'}): ${pixDe.pix_chave}${base.pagamento ? ` · pago em ${data(base.pagamento.data_pagamento)}` : ''}` : null,
    rodape: base.previa ? 'Pré-visualização — recibo ainda não emitido · Comissões LZ7'
      : `Recibo nº ${base.numero} emitido em ${data(base.emitido_em)} por ${quem(base.emitido_por)}${ed.em ? ` · alterado em ${data(ed.em)}` : ''} · Comissões LZ7${base.cancelado_em ? ` · CANCELADO em ${data(base.cancelado_em)}: ${base.motivo_cancelamento}` : ''}`,
    cancelado: !!base.cancelado_em,
  };
}
function pdfDoModelo(m) {
  const doc = novoPdf();
  let y = cabecalhoPdf(doc, m.empresa, m.titulo, [m.numeroTxt || 'PRÉVIA'], brl(m.valor));
  y = paragrafoPdf(doc, y, m.texto, { tam: 10.5, entrelinha: 1.6 }) + 5;
  if (m.mostrar.demonstrativo) {
    y = secaoPdf(doc, y, 'Discriminação');
    doc.autoTable({
      startY: y, head: m.discriminacao.head, body: m.discriminacao.body, foot: m.discriminacao.foot, margin: { left: M, right: M }, theme: 'plain',
      styles: { font: 'helvetica', fontSize: 10, textColor: TINTA, cellPadding: { top: 2.2, bottom: 2.2, left: 1.5, right: 1.5 }, lineColor: LINHA, lineWidth: { bottom: 0.2 } },
      headStyles: { fontSize: 7.5, textColor: CINZA, fontStyle: 'bold' }, footStyles: { fontStyle: 'bold', fontSize: 11.5, lineWidth: { top: 0.5 }, lineColor: TINTA },
      columnStyles: { ...m.discriminacao.colunas, 1: { ...m.discriminacao.colunas[1], fontSize: 8.5 } },
    });
    y = doc.lastAutoTable.finalY + 7;
  }
  if (m.mostrar.vendas) {
    y = secaoPdf(doc, y, m.tituloVendas);
    if (!m.vendas) y = paragrafoPdf(doc, y + 3, 'Nenhuma venda no período.', { tam: 9 }) + 4;
    else { y = tabelaPdf(doc, y, m.vendas); for (const n of m.vendas.notas) y = paragrafoPdf(doc, y - 3, n, { tam: 8, cor: CINZA, entrelinha: 1.4 }) + 3; }
    if (m.vendasEquipe) { y = secaoPdf(doc, y, m.tituloEquipe); y = tabelaPdf(doc, y, m.vendasEquipe); for (const n of m.vendasEquipe.notas) y = paragrafoPdf(doc, y - 3, n, { tam: 8, cor: CINZA, entrelinha: 1.4 }) + 3; }
  }
  if (m.mostrar.pix && m.pix) { y = secaoPdf(doc, y, 'Pagamento'); y = paragrafoPdf(doc, y + 3, m.pix, { tam: 10 }) + 2; }
  if (m.observacao) { y = secaoPdf(doc, y, 'Observações'); y = paragrafoPdf(doc, y + 3, m.observacao, { tam: 10 }) + 2; }
  if (y > 235) { doc.addPage(); y = 30; }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(...TINTA);
  doc.text(`${m.cidade || '______________________'}, ${porExtensoData(m.data_recibo)}.`, 210 - M, y + 10, { align: 'right' });
  const ya = y + 34;
  doc.setDrawColor(...TINTA); doc.setLineWidth(0.3); doc.line(105 - 55, ya, 105 + 55, ya);
  doc.setFont('helvetica', 'bold'); doc.text(String(m.nome || '').toUpperCase(), 105, ya + 5, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.text(`CPF ${m.cpf || ''}`, 105, ya + 10, { align: 'center' });
  rodapePdf(doc, m.rodape, m.cancelado);
  return doc;
}
const nomeArquivoRecibo = (m) => `Recibo ${m.numero ? String(m.numero).padStart(6, '0') : 'previa'} - ${m.nome}.pdf`;
function gerarPdfRecibo(id) {
  const m = modeloRecibo(obterRecibo(id));
  return { nome: nomeArquivoRecibo(m), blob: pdfDoModelo(m).output('blob') };
}
// Mesma informação do PDF, em HTML, para a pré-visualização na tela.
function htmlTabelaFolha(t, alinhar = {}) {
  const cel = (c, i, tag) => {
    const o = c && typeof c === 'object' ? c : { content: c };
    const cls = [alinhar[i] || '', o.styles?.fontStyle === 'bold' ? 'b' : '', o.styles?.textColor === VERMELHO_PDF ? 'neg' : o.styles?.textColor ? 'fr' : ''].filter(Boolean).join(' ');
    return `<${tag}${cls ? ` class="${cls}"` : ''}>${esc(o.content ?? '')}</${tag}>`;
  };
  return `<table>${t.head ? `<thead><tr>${t.head[0].map((c, i) => cel(c, i, 'th')).join('')}</tr></thead>` : ''}
    <tbody>${t.body.map((r) => `<tr>${r.map((c, i) => cel(c, i, 'td')).join('')}</tr>`).join('')}</tbody>
    ${t.foot ? `<tfoot><tr>${t.foot[0].map((c, i) => cel(c, i, 'td')).join('')}</tr></tfoot>` : ''}</table>`;
}
function htmlDoModelo(m) {
  const e = m.empresa;
  return `<div class="folha">${m.previa ? '<span class="f-previa">PRÉ-VISUALIZAÇÃO</span>' : ''}${m.cancelado ? '<div class="f-cancelado">CANCELADO</div>' : ''}
    <div class="f-cab"><div class="f-emp"><b>${esc(e.razao_social || 'LZ7 Energia')}</b>${e.cnpj ? `<small>CNPJ ${esc(e.cnpj)}</small>` : ''}</div>
      <div class="f-dir"><span class="f-tit">${esc(m.titulo)}</span><div class="f-num">${esc(m.numeroTxt || 'número definido na emissão')}</div><span class="f-valor">${brl(m.valor)}</span></div></div>
    <hr class="f-regua">
    <p class="f-texto">${esc(m.texto)}</p>
    ${m.mostrar.demonstrativo ? `<div class="f-sec">Discriminação</div><div class="f-discr">${htmlTabelaFolha(m.discriminacao, { 2: 'r' })}</div>` : ''}
    ${m.mostrar.vendas ? `<div class="f-sec">${esc(m.tituloVendas)}</div>${m.vendas ? `${htmlTabelaFolha(m.vendas, { 2: 'r', 3: 'r', 4: 'r' })}${m.vendas.notas.map((n) => `<p class="f-nota">${esc(n)}</p>`).join('')}` : '<p class="f-nota">Nenhuma venda no período.</p>'}${m.vendasEquipe ? `<div class="f-sec">${esc(m.tituloEquipe)}</div>${htmlTabelaFolha(m.vendasEquipe, { 3: 'r', 4: 'r', 5: 'r' })}${m.vendasEquipe.notas.map((n) => `<p class="f-nota">${esc(n)}</p>`).join('')}` : ''}` : ''}
    ${m.mostrar.pix && m.pix ? `<div class="f-sec">Pagamento</div><div>${esc(m.pix)}</div>` : ''}
    ${m.observacao ? `<div class="f-sec">Observações</div><div class="f-texto">${esc(m.observacao)}</div>` : ''}
    <div class="f-local">${esc(m.cidade || '______________________')}, ${m.data_recibo ? porExtensoData(m.data_recibo) : '—'}.</div>
    <div class="f-ass"><b>${esc(m.nome || '')}</b>CPF ${esc(m.cpf || '')}</div>
    <div class="f-rodape">${esc(m.rodape)}</div></div>`;
}
function gerarPdfFechamento(id) {
  const f = obterFechamento(id);
  const l = f.resultado;
  const tipo = f.definitivo ? 'Fechamento definitivo' : 'Fechamento parcial';
  const doc = novoPdf();
  let y = cabecalhoPdf(doc, f.empresa, 'Relatório de comissão', [tipo, nomeMes(f.competencia)]);
  y = tabelaPdf(doc, y - 3, { body: [
    ['Colaborador', `${l.nome}${f.cpf ? ` · CPF ${f.cpf}` : ''}`],
    ['Unidade / cargo', `${l.unidade || '—'} · ${l.cargo || '—'}`],
    ['Gestor', l.responsavel_da_unidade ? 'responsável da unidade' : (l.gestor || '—')],
    ['Período apurado', `${data(`${f.competencia}-01`)} a ${data(f.data_corte)}${f.definitivo ? '' : ' (posição parcial — o mês segue aberto)'}`],
    ...(l.meta ? [['Meta do mês', `${brl(l.meta)} · atingido ${pct(l.atingimento)} até a data`]] : []),
  ], colunas: { 0: { cellWidth: 36, textColor: CINZA } } });
  y = secaoPdf(doc, y, 'Demonstrativo');
  y = demonstrativoPdf(doc, y, l, [['(−) Pagamentos de comissão registrados até agora', -f.pago_ate_agora], ['Saldo de comissão a pagar nesta posição', l.a_pagar - f.pago_ate_agora, true]]);
  if (l.salario_base !== undefined) {
    y = secaoPdf(doc, y, 'Remuneração do mês — salário, benefícios, comissão e bônus');
    y = quadroRemuneracaoPdf(doc, y, l, { beneficios: f.beneficios || beneficiosDoCargo(l.cargo_id), salario: l.salario_base, noRecibo: false });
    y = tabelaPdf(doc, y - 3, { body: [[{ content: 'Total em dinheiro (salário + remuneração variável líquida)', styles: { fontStyle: 'bold' } }, { content: brl(l.salario_base + l.a_pagar), styles: { fontStyle: 'bold' } }]], colunas: { 1: { halign: 'right', cellWidth: 38 } } });
  }
  y = secaoPdf(doc, y, l.tipo === 'gestor' ? 'Vendas diretas no período' : 'Vendas no período');
  vendasPdf(doc, y, l);
  rodapePdf(doc, `${tipo} nº ${f.numero || ''} registrado em ${data(f.fechado_em)} por ${quem(f.fechado_por)} · Comissões LZ7${f.cancelado_em ? ` · CANCELADO: ${f.motivo_cancelamento}` : ''}`, !!f.cancelado_em);
  return { nome: `Comissao ${l.nome} - ${f.competencia}${f.definitivo ? '' : ` ate ${f.data_corte}`}.pdf`, blob: doc.output('blob') };
}
async function baixarRecibo(id) { const r = gerarPdfRecibo(id); await baixar(r.nome, r.blob); }
async function baixarFechamento(id) { const r = gerarPdfFechamento(id); await baixar(r.nome, r.blob); }

/* ---------- CSV da apuração ---------- */
const csvNum = (v) => (v === null || v === undefined ? '' : String(Math.round(Number(v) * 100) / 100).replace('.', ','));
const csvTxt = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function csvApuracao(ap) {
  const L = [];
  L.push(['Competência', 'Tipo', 'Colaborador', 'Unidade', 'Gestor', 'Cargo', 'Vendas', 'Vendas da base', 'Pedidos', '% aplicado', 'Comissão', 'Bônus', 'Variável bruto', 'Taxa cooperativa',
    'Ajustes', 'Descontos', 'Comissão a pagar', 'Salário base', 'Total do mês', 'Pago', 'Saldo', 'Meta', 'Atingimento %', 'Bandeira ao fechar'].join(';'));
  for (const v of ap.vendedores) {
    L.push([ap.competencia, v.tipo === 'gestor' ? 'Gestor' : 'Vendedor', v.nome, v.unidade, v.responsavel_da_unidade ? '(responsável)' : v.gestor, v.cargo, csvNum(v.total), v.tipo === 'gestor' ? csvNum(v.base_total) : '',
      v.qtd_pedidos, csvNum(v.percentual), csvNum(v.comissao), csvNum(v.bonus), csvNum(v.variavel_bruto), csvNum(v.taxa_cooperativa), csvNum(v.ajustes), csvNum(v.descontos),
      csvNum(v.a_pagar), csvNum(v.salario_base), csvNum(v.total_mes), csvNum(v.pago), csvNum(v.saldo), csvNum(v.meta), csvNum(v.atingimento), v.bandeira || ''].map(csvTxt).join(';'));
  }
  L.push('');
  L.push(['Pedido', 'Colaborador', 'Projeto', 'Código cliente', 'Cliente', 'Emissão', 'Aprovação', 'Valor na planilha', 'Valor considerado', 'Justificativa do valor', '% comissão', 'Comissão da venda'].join(';'));
  for (const v of ap.vendedores) for (const p of v.pedidos) {
    L.push([p.numero, v.nome, p.codigo_projeto, p.cliente_codigo, p.cliente_nome, p.data_emissao, p.data_aprovacao, csvNum(p.valor_flow ?? p.valor_total), csvNum(p.valor_total), p.valor_editado?.justificativa || '', csvNum(p.percentual_comissao), csvNum(p.comissao)].map(csvTxt).join(';'));
  }
  return '﻿' + L.join('\r\n') + '\r\n';
}

/* ================= tela: apuração mensal ================= */
const filtroAp = { unidade: '', busca: '', bandeira: '', pagamento: '', gestor: '' };
let reabrirPessoa = null;
const SITUACAO = {
  pendente: { rotulo: 'Pendente', classe: 'amarela' }, parcial: { rotulo: 'Pago parcial', classe: 'amarela' }, pago: { rotulo: 'Pago', classe: 'ok' },
  pago_a_maior: { rotulo: 'Pago a maior', classe: 'vermelha' }, sem_valor: { rotulo: 'Sem valor', classe: '' },
};
const chipSituacao = (s) => `<span class="chip ${SITUACAO[s].classe}">${SITUACAO[s].rotulo}</span>`;
function recarregar(pessoaId) { reabrirPessoa = pessoaId || null; rotear(); }
const SUB = (t) => `<div class="sub">${t}</div>`;

function telaApuracao(alvo) {
  const dias = estado.dias.de ? estado.dias : null;
  if (dias && dias.de.slice(0, 7) !== estado.competencia) {
    alvo.innerHTML = `<div class="alerta">O filtro de dias (${data(dias.de)} a ${data(dias.ate)}) está fora de ${esc(nomeMes(estado.competencia))}. Escolha dias dentro do mês ou limpe o filtro.</div>`;
    return;
  }
  const ap = obterApuracao(estado.competencia, dias ? { de: dias.de, ate: dias.ate } : {});
  const fechada = ap.status === 'fechada'; const filtrada = !!ap.filtrada; const t = ap.totais;
  pedirNomes([ap.fechada_por]);
  const unidades = [...new Set(ap.vendedores.map((v) => v.unidade).filter(Boolean))].sort();
  const gestores = [...new Set(ap.vendedores.filter((v) => v.tipo !== 'gestor').map((v) => (v.responsavel_da_unidade ? v.nome : v.gestor)).filter(Boolean))].sort();
  const semPedidos = !S.pedidos.size;
  alvo.innerHTML = `
    ${semPedidos ? `<div class="alerta info"><div><b>Nenhum pedido importado ainda.</b> Exporte os pedidos de venda do Flow em Excel e use <b>Importar planilha</b> no topo da tela.</div></div>` : ''}
    ${filtrada ? `<div class="faixa-filtro"><b>Filtro de dias:</b> pedidos emitidos de ${data(ap.filtro.de)} a ${data(ap.filtro.ate)}. Comissão e bônus calculados só sobre esse intervalo; fechamento, recibo e pagamento usam o mês inteiro.</div>` : ''}
    <div class="barra">
      <span class="chip ${fechada ? 'acento' : ''}">${fechada ? `${ICONES.cadeado.replace('<svg', '<svg width="12" height="12"')} Fechada` : 'Aberta'}</span>
      <span class="legenda-mes">${esc(nomeMes(ap.competencia))} · ${S.cfg.ultima_importacao?.mes === ap.competencia && !filtrada ? 'pedidos da planilha importada para este mês' : `pedidos emitidos de ${data(filtrada ? ap.filtro.de : ap.periodo.inicio)} a ${data(filtrada ? ap.filtro.ate : ap.periodo.fim)}`}${fechada && !filtrada ? ` · fechada em ${dataHora(ap.fechada_em)} por ${esc(quem(ap.fechada_por))}` : ''}</span>
      <span class="espaco"></span>
      <button class="btn" data-csv id="ap-csv">${ICONES.baixar}Exportar CSV</button>
      ${filtrada ? '' : fechada ? '<button class="btn" data-reabrir id="ap-reabrir">Reabrir mês</button>'
        : `<button class="btn primario" data-fechar-mes id="ap-fechar" ${ap.pode_fechar?.ok ? '' : 'disabled'} title="${esc(ap.pode_fechar?.motivo || 'Congela os valores do mês')}">${ICONES.cadeado}Fechar mês</button>`}
    </div>
    <div class="kpis">
      <div class="kpi"><small>Valor total dos pedidos</small><b>${brlCurto(t.faturado)}</b><div class="sub">${t.pedidos_contabilizados} pedidos atribuídos</div></div>
      <div class="kpi"><small>Comissão + bônus</small><b>${brlCurto(t.variavel_bruto)}</b><div class="sub">${brl(t.comissao)} + ${brl(t.bonus)}</div></div>
      <div class="kpi"><small>Taxa cooperativa · descontos</small><b>${brlCurto(t.taxa_cooperativa + (t.descontos || 0))}</b><div class="sub">${brl(t.taxa_cooperativa)} · ${brl(t.descontos || 0)}</div></div>
      <div class="kpi"><small>Comissão a pagar</small><b>${brlCurto(t.a_pagar)}</b><div class="sub">${t.ajustes ? `inclui lançamentos de ${brl(t.ajustes)}` : 'líquido de taxa e descontos'}</div></div>
      <div class="kpi"><small>Salários + comissão</small><b>${brlCurto(t.total_mes)}</b><div class="sub">salários ${brl(t.salarios)}</div></div>
      ${filtrada ? '' : `<div class="kpi"><small>Pendente de pagamento</small><b class="${t.saldo_pendente ? 'tom-amarela' : ''}">${brlCurto(t.saldo_pendente)}</b><div class="sub">${t.pendentes} colaborador(es) · pago ${brl(t.pago)}</div></div>
      <div class="kpi"><small>Bandeiras ao fechar</small><b>${t.bandeiras.amarela + t.bandeiras.vermelha}</b><div class="sub">${t.bandeiras.amarela} amarela · ${t.bandeiras.vermelha} vermelha</div></div>`}
      <div class="kpi"><small>Sem vendedor atribuído</small><b class="${t.nao_atribuido ? 'tom-vermelha' : ''}">${brlCurto(t.nao_atribuido)}</b><div class="sub">fora da apuração</div></div>
    </div>
    ${blocoAlertas(ap)}
    <div class="painel">
      <div class="painel-cab"><h2>Vendedores</h2><span class="espaco"></span>
        <input type="search" placeholder="Buscar" data-busca id="ap-busca" value="${esc(filtroAp.busca)}" class="busca-curta">
        <select data-unidade id="ap-unidade">${opcoes(unidades.map((u) => ({ id: u, nome: u })), filtroAp.unidade, { vazio: 'Todas as unidades' })}</select>
        <select data-gestor id="ap-gestor">${opcoes(gestores.map((g) => ({ id: g, nome: g })), filtroAp.gestor, { vazio: 'Todos os gestores' })}</select>
        ${filtrada ? '' : `<select data-pagamento id="ap-pagamento">${opcoes([{ id: 'pendentes', nome: 'Pendentes de pagamento' }, { id: 'pagos', nome: 'Pagos' }], filtroAp.pagamento, { vazio: 'Todos os pagamentos' })}</select>
        <select data-bandeira id="ap-bandeira">${opcoes(Object.entries(BANDEIRA).map(([id, b]) => ({ id, nome: b.rotulo })), filtroAp.bandeira, { vazio: 'Todas as bandeiras' })}</select>`}
      </div>
      <div class="rolagem" data-tabela></div>
    </div>
    <div class="painel bloco" data-painel-gestores>
      <div class="painel-cab"><h2>Gestores (supervisores e coordenador)</h2><span class="espaco"></span><span class="nota-cab">Comissão sobre as vendas da base + bônus por faixa + vendas diretas</span></div>
      <div class="rolagem" data-tabela-gestores></div>
    </div>
    ${ap.por_unidade.length > 1 ? `<div class="painel bloco"><div class="painel-cab"><h2>Por unidade</h2></div><div class="rolagem"><table class="tabela">
      <thead><tr><th>Unidade</th><th class="n">Vendedores</th><th class="n">Vendas</th><th class="n">Comissão a pagar</th></tr></thead>
      <tbody>${ap.por_unidade.map((u) => `<tr><td>${esc(u.unidade)}</td><td class="n">${u.vendedores}</td><td class="n">${brl(u.total)}</td><td class="n">${brl(u.a_pagar)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;

  const passa = (v) => (!filtroAp.unidade || v.unidade === filtroAp.unidade || (v.unidades_base || []).some((u) => u.unidade === filtroAp.unidade)) &&
    (!filtroAp.gestor || (v.tipo === 'gestor' ? v.nome === filtroAp.gestor : (v.responsavel_da_unidade ? v.nome : v.gestor) === filtroAp.gestor)) &&
    (filtrada || !filtroAp.bandeira || v.bandeira === filtroAp.bandeira) &&
    (filtrada || !filtroAp.pagamento || (filtroAp.pagamento === 'pendentes' ? v.saldo > 0.005 : v.situacao_pagamento === 'pago')) &&
    (!filtroAp.busca || v.nome.toLowerCase().includes(filtroAp.busca.toLowerCase()));
  const desenhar = () => {
    const vend = ap.vendedores.filter((v) => v.tipo !== 'gestor' && passa(v));
    const gest = ap.vendedores.filter((v) => v.tipo === 'gestor' && passa(v));
    alvo.querySelector('[data-tabela]').innerHTML = tabelaVendedores(vend, filtrada);
    alvo.querySelector('[data-tabela-gestores]').innerHTML = tabelaGestores(gest, filtrada);
    alvo.querySelector('[data-painel-gestores]').hidden = !ap.vendedores.some((v) => v.tipo === 'gestor');
    alvo.querySelectorAll('[data-pessoa]').forEach((tr) => {
      tr.onclick = (e) => { const v = ap.vendedores.find((x) => x.pessoa_id === tr.dataset.pessoa); if (e.target.closest('[data-pagar]')) pagar(ap, v); else detalhe(ap, v); };
    });
  };
  desenhar();
  alvo.querySelector('[data-busca]').oninput = (e) => { filtroAp.busca = e.target.value; desenhar(); };
  alvo.querySelector('[data-unidade]').onchange = (e) => { filtroAp.unidade = e.target.value; desenhar(); };
  alvo.querySelector('[data-gestor]').onchange = (e) => { filtroAp.gestor = e.target.value; desenhar(); };
  alvo.querySelector('[data-bandeira]')?.addEventListener('change', (e) => { filtroAp.bandeira = e.target.value; desenhar(); });
  alvo.querySelector('[data-pagamento]')?.addEventListener('change', (e) => { filtroAp.pagamento = e.target.value; desenhar(); });
  if (reabrirPessoa) { const v = ap.vendedores.find((x) => x.pessoa_id === reabrirPessoa); reabrirPessoa = null; if (v) detalhe(ap, v); }
  alvo.querySelector('[data-csv]').onclick = (e) => comBotao(e.currentTarget, () => baixar(`Comissoes LZ7 - ${ap.competencia}${filtrada ? ` (${ap.filtro.de} a ${ap.filtro.ate})` : ''}.csv`, csvApuracao(ap)));
  alvo.querySelector('[data-fechar-mes]')?.addEventListener('click', async (e) => {
    const ok = await confirmar(`Fechar ${nomeMes(ap.competencia)}?`, `Os valores de comissão, metas e bandeiras deste mês ficam congelados. Mudanças posteriores na planilha viram divergências, e correções entram como lançamento no mês seguinte.${ap.alertas.length ? `<br><br><b>Há ${ap.alertas.length} alerta(s) em aberto neste mês.</b>` : ''}`, { botao: 'Fechar mês' });
    if (ok) await comBotao(e.target, async () => { await fecharApuracao(ap.competencia); aviso('Mês fechado.'); rotear(); });
  });
  alvo.querySelector('[data-reabrir]')?.addEventListener('click', async () => {
    const just = await confirmar(`Reabrir ${nomeMes(ap.competencia)}?`, 'Os valores voltam a ser recalculados com os dados atuais. Só a última competência fechada pode ser reaberta.', { botao: 'Reabrir', perigo: true, pedirTexto: 'Justificativa (obrigatória)' });
    if (just === false) return;
    try { await reabrirApuracao(ap.competencia, just); aviso('Mês reaberto.'); rotear(); } catch (err) { aviso(err.message, 'erro'); }
  });
  alvo.querySelectorAll('[data-lancar-estorno]').forEach((b) => { b.onclick = () => novoLancamento({ pessoa_id: b.dataset.pessoa, pedido_id: b.dataset.pedido, motivo: b.dataset.motivo, tipo: 'ajuste' }); });
}

function blocoAlertas(ap) {
  const p = [];
  if (ap.alertas.length) {
    p.push(`<div class="alerta"><div><details class="alertas" ${ap.alertas.length <= 4 ? 'open' : ''}><summary>${ap.alertas.length} ponto(s) para conferir neste mês</summary>
      <ul>${ap.alertas.map((a) => `<li>${esc(a.mensagem)}${a.valor ? ` — ${brl(a.valor)}` : ''}</li>`).join('')}</ul>
      <div class="dica-alerta">Atribua o vendedor na tela <a href="#pedidos" data-ir="pedidos">Pedidos</a> ou inclua o nome que aparece na planilha no campo "Nomes no Flow" do cadastro.</div></details></div></div>`);
  }
  if (ap.divergencias?.length) {
    p.push(`<div class="alerta erro"><div><b>Pedidos alterados depois do fechamento</b><ul>${ap.divergencias.map((d) => `<li>Pedido ${esc(d.numero)} (${esc(d.pessoa_nome)}, apurado em ${esc(d.competencia)}):
      ${d.tipo === 'cancelado_apos_fechamento' ? 'cancelado ou apagado' : `valor mudou de ${brl(d.valor_apurado)} para ${brl(d.valor_atual)}`}.
      ${ap.status === 'aberta' ? `<button class="btn-link" data-lancar-estorno data-pessoa="${esc(d.pessoa_id)}" data-pedido="${esc(d.pedido_id)}" data-motivo="Pedido ${esc(d.numero)} ${d.tipo === 'cancelado_apos_fechamento' ? 'cancelado' : 'com valor alterado'} após o fechamento de ${esc(d.competencia)}">Lançar ajuste neste mês</button>` : ''}</li>`).join('')}</ul>
      <div>O valor do ajuste depende da regra (a faixa pode mudar). Informe a diferença de comissão.</div></div></div>`);
  }
  return p.join('');
}
const bandeiraCurta = (v) => (v.bandeira && v.bandeira !== 'normal' ? `<div class="mt3">${chipBandeira(v.bandeira)}${v.alerta_bandeira ? ` <span class="chip vermelha" title="${v.alerta_bandeira === 'desligamento' ? 'passível de desligamento' : 'passível de liberação'}">!</span>` : ''}</div>` : '');
function celulaNome(v) {
  const parc = (v.fechamentos || []).filter((f) => !f.cancelado_em && !f.definitivo);
  return `<td><b>${esc(v.nome)}</b>${v.ativo ? '' : ` <span class="chip" title="Desligado em ${data(v.desligado_em)}">desligado</span>`}
    ${v.fechamento_definitivo ? ` <span class="chip acento">fechado ${data(v.fechamento_definitivo.data_corte).slice(0, 5)}</span>` : ''}
    ${parc.length ? ` <span class="chip">parcial ${data(parc[parc.length - 1].data_corte).slice(0, 5)}</span>` : ''}${SUB(esc(v.cargo || 'sem cargo'))}</td>`;
}
function celulasFinais(v, filtrada) {
  const a = `<td class="n"><b>${brl(v.a_pagar)}</b>${v.descontos ? SUB(`<span class="tom-vermelha">descontos −${brl(v.descontos)}</span>`) : ''}${v.ajustes ? SUB(`lançamentos ${brl(v.ajustes)}`) : ''}</td>
    <td class="n">${brl(v.total_mes)}${SUB(`salário ${brl(v.salario_base)}${v.salario_personalizado ? '*' : ''}`)}</td>`;
  if (filtrada) return a;
  return `${a}<td class="nowrap">${chipSituacao(v.situacao_pagamento)}${v.saldo > 0.005 ? ' <button class="btn pequeno" data-pagar>Pagar</button>' : ''}${v.pago ? SUB(`pago ${brl(v.pago)}${Math.abs(v.saldo) >= 0.01 ? ` · saldo ${brl(v.saldo)}` : ''}`) : ''}</td>`;
}
function rodapeTab(lista, filtrada, antes) {
  const soma = (k) => lista.reduce((s, v) => s + (v[k] || 0), 0);
  return `<tfoot><tr>${antes}<td class="n">${brl(soma('a_pagar'))}</td><td class="n">${brl(soma('total_mes'))}${SUB(`salários ${brl(soma('salario_base'))}`)}</td>${filtrada ? '' : `<td>${SUB(`pago ${brl(soma('pago'))}<br>saldo ${brl(soma('saldo'))}`)}</td>`}</tr></tfoot>`;
}
function tabelaVendedores(lista, filtrada) {
  if (!lista.length) return '<div class="vazio">Nenhum vendedor neste filtro. Cadastre vendedores em <a href="#vendedores" data-ir="vendedores">Vendedores</a>.</div>';
  const soma = (k) => lista.reduce((s, v) => s + (v[k] || 0), 0);
  return `<table class="tabela"><thead><tr><th>Vendedor</th><th>Unidade / gestor</th><th class="n">Vendas</th><th>Meta e bandeira</th><th class="n">Faixa</th>
    <th class="n">Comissão a pagar</th><th class="n" title="Salário base + comissão a pagar">Total do mês</th>${filtrada ? '' : '<th>Pagamento da comissão</th>'}</tr></thead>
    <tbody>${lista.map((v) => `<tr class="clicavel" data-pessoa="${esc(v.pessoa_id)}">${celulaNome(v)}
      <td>${esc(v.unidade || '—')}${SUB(v.responsavel_da_unidade ? 'responsável da unidade' : esc(v.gestor || 'sem gestor'))}</td>
      <td class="n">${brl(v.total)}${SUB(`${v.qtd_pedidos} pedido${v.qtd_pedidos === 1 ? '' : 's'}`)}</td>
      <td>${filtrada ? '<span class="fraco">—</span>' : barraAtingimento(v.atingimento, v.regra?.bandeiras)}${v.meta && !filtrada ? SUB(`meta ${brlCurto(v.meta)}${v.mes_rampagem && v.mes_rampagem <= (v.regra?.meta?.rampagem?.length || 0) ? ` · ${v.mes_rampagem}º mês` : ''}`) : ''}${filtrada ? '' : bandeiraCurta(v)}</td>
      <td class="n">${v.regra?.tipo === 'fixo' ? pct(v.percentual) : (v.comissao ? pct(v.percentual) : '<span class="fraco">0%</span>')}</td>
      ${celulasFinais(v, filtrada)}</tr>`).join('')}</tbody>
    ${rodapeTab(lista, filtrada, `<td colspan="2">Total (${lista.length})</td><td class="n">${brl(soma('total'))}</td><td></td><td></td>`)}</table>`;
}
function tabelaGestores(lista, filtrada) {
  if (!lista.length) return '<div class="vazio">Nenhum gestor neste filtro. Atribua o cargo Supervisor ou Coordenador Comercial no cadastro e defina o responsável em Unidades.</div>';
  return `<table class="tabela"><thead><tr><th>Gestor</th><th>Base</th><th class="n">Vendas da base</th><th>Meta e bandeira</th><th class="n">Composição</th>
    <th class="n">Comissão a pagar</th><th class="n">Total do mês</th>${filtrada ? '' : '<th>Pagamento da comissão</th>'}</tr></thead>
    <tbody>${lista.map((v) => `<tr class="clicavel" data-pessoa="${esc(v.pessoa_id)}">${celulaNome(v)}
      <td class="quebra estreita">${esc((v.unidades_base || []).map((u) => u.unidade).join(', ') || '—')}${SUB(`${v.equipe} vendedor${v.equipe === 1 ? '' : 'es'}${v.elegivel === false ? ' · <span class="tom-vermelha">abaixo do mínimo</span>' : ''}`)}</td>
      <td class="n">${brl(v.base_total)}</td>
      <td>${filtrada ? '<span class="fraco">—</span>' : barraAtingimento(v.atingimento, v.regra?.bandeiras)}${v.meta && !filtrada ? SUB(`meta ${brlCurto(v.meta)}`) : ''}${filtrada ? '' : bandeiraCurta(v)}</td>
      <td class="n composicao">${[v.comissao_base ? `${pct(v.percentual)} base ${brl(v.comissao_base)}` : null, v.bonus ? `bônus ${brl(v.bonus)}` : null,
        v.faixa_bonus_atingida && v.equilibrio && !v.equilibrio.atendido ? '<span class="tom-vermelha">bônus desceu 1 faixa</span>' : null,
        v.comissao_diretas ? `diretas ${brl(v.comissao_diretas)}` : null].filter(Boolean).join('<br>') || '<span class="fraco">—</span>'}</td>
      ${celulasFinais(v, filtrada)}</tr>`).join('')}</tbody>
    ${rodapeTab(lista, filtrada, `<td colspan="5">Total (${lista.length})</td>`)}</table>`;
}
function descreverFaixa(v) {
  const r = v.regra;
  if (!r) return 'Sem regra vigente';
  if (r.tipo === 'fixo') return `${pct(r.percentual_fixo)} fixo sobre o faturado`;
  const f = v.faixa;
  if (!f) return '—';
  const ate = f.ate === null ? `acima de ${brl(f.de)}` : f.de ? `acima de ${brl(f.de)} até ${brl(f.ate)}` : `até ${brl(f.ate)}`;
  return `Faixa ${ate} → ${pct(f.percentual)}${r.modo_faixas === 'escalonado' ? ' (escalonado, % efetivo)' : ' sobre todo o faturado'}`;
}

function detalhe(ap, v) {
  const aberta = ap.status === 'aberta'; const r = v.regra; const filtrada = !!ap.filtrada; const gestor = v.tipo === 'gestor';
  const fechamentos = v.fechamentos || []; const recibos = v.recibos || []; const pagamentos = v.pagamentos || [];
  const podeFecharInd = aberta && !v.fechamento_definitivo && !filtrada;
  pedirNomes([...fechamentos.map((f) => f.fechado_por), ...recibos.map((x) => x.emitido_por), ...v.lancamentos.map((l) => l.autor)]);
  gaveta({
    titulo: v.nome,
    subtitulo: `${esc(v.cargo || 'sem cargo')} · ${esc(v.unidade || 'sem unidade')} · ${v.responsavel_da_unidade ? 'responsável da unidade' : `gestor: ${esc(v.gestor || '—')}`}`,
    corpo: `
      ${filtrada ? `<div class="alerta info">Visão filtrada de ${data(ap.filtro.de)} a ${data(ap.filtro.ate)}. Para fechar, emitir recibo ou pagar, limpe o filtro de dias.</div>` : `<div class="acoes-linha">
        ${podeFecharInd ? `<button class="btn" data-acao="fechar">${ICONES.cadeado}Fechar mês do colaborador</button>` : ''}
        <button class="btn" data-acao="recibo">${ICONES.doc}Gerar recibo</button><button class="btn primario" data-acao="pagar">Registrar pagamento</button></div>`}
      ${v.fechamento_definitivo ? `<div class="alerta info">Mês deste colaborador fechado em definitivo com corte em ${data(v.fechamento_definitivo.data_corte)}. Os valores abaixo estão congelados.</div>` : ''}
      <div class="secao">Situação de pagamento</div>
      <table class="conta"><tr><td>Comissão líquida a pagar${v.parcial ? ` (até ${data(v.data_corte)})` : ''}</td><td>${brl(v.a_pagar)}</td></tr>
        <tr><td>Pago</td><td>${brl(v.pago)}</td></tr><tr class="total"><td>Saldo ${chipSituacao(v.situacao_pagamento)}</td><td>${brl(v.saldo)}</td></tr></table>
      ${pagamentos.length ? `<table class="lista-docs mt8">${pagamentos.map((pg) => `<tr class="${pg.estornado_em ? 'cancelado' : ''}"><td>${data(pg.data_pagamento)}</td>
        <td>${esc(pg.forma || '')}${pg.recibo_id ? ` · recibo nº ${recibos.find((x) => x.id === pg.recibo_id)?.numero ?? ''}` : ''}${pg.observacao ? ` · ${esc(pg.observacao)}` : ''}</td><td class="n">${brl(pg.valor)}</td>
        <td class="dir">${pg.estornado_em ? `<span class="chip" title="${esc(pg.motivo_estorno || '')}">estornado</span>` : `<button class="btn-link" data-estornar="${esc(pg.id)}">estornar</button>`}</td></tr>`).join('')}</table>` : ''}
      <div class="secao">Cálculo de ${esc(nomeMes(ap.competencia))}${filtrada ? ' (filtrado)' : ''}</div>
      <table class="conta">${gestor ? `
        <tr><td>Vendas da base (${esc((v.unidades_base || []).map((u) => u.unidade).join(', '))})</td><td>${brl(v.base_total)}</td></tr>
        ${(v.unidades_base || []).map((u) => `<tr><td class="recuo">${esc(u.unidade)} — ${u.equipe} vendedor${u.equipe === 1 ? '' : 'es'}, meta ${brl(u.meta)}${u.atingimento !== null ? `, ${pct(u.atingimento, 1)}` : ''}</td><td>${brl(u.vendas)}</td></tr>`).join('')}
        <tr><td>${pct(v.percentual)} sobre as vendas da equipe${v.equipe_total !== undefined ? ` (${brl(v.equipe_total)}, sem as vendas diretas)` : ''}</td><td>${brl(v.comissao_base)}</td></tr>
        <tr><td>Bônus por faixa${v.elegivel === false ? ` — <b class="tom-vermelha">equipe abaixo do mínimo (${v.regra?.minimo_vendedores})</b>` : ''}${v.faixa_bonus_atingida ? ` (faixa atingida: a partir de ${brl(v.faixa_bonus_atingida.a_partir)})` : ' (nenhuma faixa atingida)'}
          ${v.equilibrio ? `<br><span class="${v.equilibrio.atendido ? 'fraco' : 'tom-vermelha'}">Equilíbrio: ${v.equilibrio.unidades_ok} de ${(v.unidades_base || []).length} unidades com ${pct(v.regra?.equilibrio?.percentual_meta)} da meta — exigido ${v.equilibrio.exigido}${v.equilibrio.atendido ? '' : ' → bônus desce uma faixa'}</span>` : ''}</td><td>${brl(v.bonus)}</td></tr>
        <tr><td>Vendas diretas (${v.qtd_pedidos} pedidos) × ${pct(v.percentual_diretas)} = ${brl(v.comissao_diretas)}</td><td>${brl(v.total)}</td></tr>` : `
        <tr><td>Total de vendas (${v.qtd_pedidos} pedidos${v.parcial ? ` até ${data(v.data_corte)}` : filtrada ? ' no intervalo' : ' no mês'})</td><td>${brl(v.total)}</td></tr>
        <tr><td>${esc(descreverFaixa(v))}</td><td>${brl(v.comissao)}</td></tr>
        <tr><td>Bônus de performance${r?.bonus ? ` (a partir de ${brl(r.bonus.gatilho)})` : ''}</td><td>${brl(v.bonus)}</td></tr>`}
        <tr><td>Variável bruto</td><td>${brl(v.variavel_bruto)}</td></tr>
        <tr><td>${S.pessoas.get(v.pessoa_id)?.isento_cooperativa ? 'Taxa da cooperativa — <b>não se aplica</b> (sem cooperativa no cadastro)' : `Taxa da cooperativa (${pct(r?.taxa_cooperativa || 0)} sobre a comissão)`}</td><td>${brl(-v.taxa_cooperativa)}</td></tr>
        ${v.lancamentos.map((l) => `<tr><td><b>${esc(rotuloLanc(l))}</b>: ${esc(l.motivo)} <span class="fraco">(${esc(quem(l.autor))})</span>
          ${aberta && !v.fechamento_definitivo && !filtrada ? `<button class="btn-link ml6" data-excluir-lanc="${esc(l.id)}">excluir</button>` : ''}</td><td>${brl(l.valor)}</td></tr>`).join('')}
        <tr class="total"><td>Comissão a pagar</td><td>${brl(v.a_pagar)}</td></tr>
        <tr><td>Salário base${v.salario_personalizado ? ' (definido no cadastro)' : ' (do cargo)'}</td><td>${brl(v.salario_base)}</td></tr>
        <tr class="total"><td>Total do mês (salário + comissão)</td><td>${brl(v.total_mes)}</td></tr></table>
      <div class="secao">Fechamentos do colaborador</div>
      ${fechamentos.length ? `<table class="lista-docs">${fechamentos.map((f) => `<tr class="${f.cancelado_em ? 'cancelado' : ''}">
        <td>${f.definitivo ? '<b>Definitivo</b>' : 'Parcial'} · corte ${data(f.data_corte)}</td><td>${esc(quem(f.fechado_por))} · ${dataHora(f.fechado_em)}</td><td class="n">${brl(f.a_pagar)}</td>
        <td class="dir nowrap"><button class="btn-link" data-pdf-fech="${esc(f.id)}">relatório (PDF)</button>
          ${!f.cancelado_em && aberta ? ` · <button class="btn-link" data-recibo-fech="${esc(f.id)}">recibo</button> · <button class="btn-link" data-cancelar-fech="${esc(f.id)}">cancelar</button>` : ''}
          ${f.cancelado_em ? `<span class="chip" title="${esc(f.motivo_cancelamento || '')}">cancelado</span>` : ''}</td></tr>`).join('')}</table>`
        : '<p class="nota">Nenhum. Use "Fechar mês do colaborador" para registrar uma posição parcial ou definitiva em qualquer data.</p>'}
      <div class="secao">Recibos</div>
      ${recibos.length ? `<table class="lista-docs">${recibos.map((x) => `<tr class="${x.cancelado_em ? 'cancelado' : ''}"><td>Nº ${String(x.numero).padStart(6, '0')}</td>
        <td>${data(x.data_recibo)} · período até ${data(x.data_corte)}</td>${(() => { let t = x.valor_total ?? x.valor; try { t = modeloRecibo(x).valor; } catch { /* usa o gravado */ } return `<td class="n">${brl(t)}${Math.abs(t - x.valor) >= 0.01 ? `<div class="sub">comissão ${brl(x.valor)}</div>` : ''}</td>`; })()}
        <td class="dir nowrap">${x.pagamento_id ? '<span class="chip ok">pago</span> ' : ''}<button class="btn-link" data-ver-recibo="${esc(x.id)}">${x.cancelado_em ? 'ver' : 'ver / editar'}</button> · <button class="btn-link" data-pdf-recibo="${esc(x.id)}">PDF</button>
          ${x.cancelado_em ? `<span class="chip" title="${esc(x.motivo_cancelamento || '')}">cancelado</span>`
            : `${x.pagamento_id ? '' : ` · <button class="btn-link" data-pagar-recibo="${esc(x.id)}" data-valor="${x.valor}">marcar pago</button>`} · <button class="btn-link" data-cancelar-recibo="${esc(x.id)}">cancelar</button>`}</td></tr>`).join('')}</table>`
        : '<p class="nota">Nenhum recibo emitido nesta competência.</p>'}
      <div class="secao">Meta e bandeira</div>
      <table class="conta"><tr><td>Meta do mês${gestor ? ' (soma das metas da equipe)' : v.mes_rampagem ? ` (${v.mes_rampagem}º mês do vendedor)` : ''}</td><td>${v.meta ? brl(v.meta) : 'sem meta'}</td></tr>
        <tr><td>Atingimento</td><td>${pct(v.atingimento)}</td></tr><tr><td>Bandeira durante o mês</td><td>${chipBandeira(v.bandeira_entrada)}</td></tr>
        <tr><td>Bandeira ao fechar o mês (vale para o mês seguinte)</td><td>${chipBandeira(v.bandeira)}</td></tr>
        ${v.evento_bandeira ? `<tr><td colspan="2" class="esq">${esc(v.evento_bandeira)}${v.alerta_bandeira ? ` — <b class="tom-vermelha">${v.alerta_bandeira === 'desligamento' ? 'passível de desligamento' : 'passível de liberação ao mercado'}</b>` : ''}</td></tr>` : ''}</table>
      <div class="secao">${gestor ? 'Vendas diretas do gestor' : 'Pedidos considerados'}</div>
      ${v.pedidos.length ? `<div class="rolagem"><table class="tabela"><thead><tr><th>Pedido</th><th>Cliente</th><th>Emissão</th><th class="n">Valor</th><th class="n">%</th><th class="n">Comissão</th></tr></thead>
        <tbody>${v.pedidos.map((p) => `<tr><td>${esc(p.numero)}${p.origem_vinculo === 'ajuste' ? ' <span class="chip">ajuste</span>' : ''}</td>
          <td class="quebra">${esc(p.cliente_nome || '—')}${p.codigo_projeto ? `<div class="sub">${esc(p.codigo_projeto)}</div>` : ''}</td>
          <td>${p.competencia_planilha ? `${mesCurto(p.competencia_planilha)}<div class="sub">${p.remanejado ? `<span class="tom-amarela" title="${esc(p.remanejado.justificativa)}">remanejado de ${p.remanejado.de ? mesCurto(p.remanejado.de) : 'outro mês'}</span>` : 'mês da planilha'}</div>` : `${data(p.data_referencia || p.data_aprovacao)}${!p.data_emissao && p.data_referencia ? '<div class="sub">aprovação</div>' : ''}`}</td>
          <td class="n">${brl(p.valor_total)}${p.valor_editado ? `<div class="sub tom-amarela" title="${esc(p.valor_editado.justificativa)}">editado · planilha ${brl(p.valor_flow)}</div>` : ''}</td>
          <td class="n">${pct(p.percentual_comissao)}</td><td class="n"><b>${brl(p.comissao)}</b></td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="3">Total</td><td class="n">${brl(v.total)}</td><td></td><td class="n">${brl(v.pedidos.reduce((s, p) => s + (p.comissao || 0), 0))}</td></tr></tfoot></table></div>
        <p class="nota mt6">Comissão por venda = valor × % da faixa atingida no mês${gestor ? ' (vendas diretas)' : ''}. Se a faixa mudar até o fim do mês, o valor de cada venda muda junto.${v.bonus ? ` O bônus de ${brl(v.bonus)} é do mês e não entra por venda.` : ''}</p>`
        : '<div class="vazio">Nenhum pedido no período.</div>'}`,
    rodape: aberta && !v.fechamento_definitivo && !filtrada ? `<button class="btn" data-novo-desc>${ICONES.mais}Desconto</button><button class="btn" data-novo-lanc>${ICONES.mais}Lançamento</button><span class="espaco"></span><button class="btn" data-fechar>Fechar</button>` : '<span class="espaco"></span><button class="btn" data-fechar>Fechar</button>',
    aoAbrir: (el, fechar) => {
      const acao = (nome, fn) => el.querySelector(`[data-acao="${nome}"]`)?.addEventListener('click', () => { fechar(); fn(); });
      acao('fechar', () => fecharIndividualModal(ap, v));
      acao('recibo', () => gerarReciboModal(ap, v));
      acao('pagar', () => pagar(ap, v));
      el.querySelector('[data-novo-lanc]')?.addEventListener('click', () => { fechar(); novoLancamento({ pessoa_id: v.pessoa_id, tipo: 'bonus' }); });
      el.querySelector('[data-novo-desc]')?.addEventListener('click', () => { fechar(); novoLancamento({ pessoa_id: v.pessoa_id, tipo: 'desconto' }); });
      el.querySelectorAll('[data-pdf-fech]').forEach((b) => { b.onclick = () => comBotao(b, () => baixarFechamento(b.dataset.pdfFech)); });
      el.querySelectorAll('[data-pdf-recibo]').forEach((b) => { b.onclick = () => comBotao(b, () => baixarRecibo(b.dataset.pdfRecibo)); });
      el.querySelectorAll('[data-ver-recibo]').forEach((b) => { b.onclick = () => { fechar(); reciboModal(ap, v, { reciboId: b.dataset.verRecibo }); }; });
      el.querySelectorAll('[data-recibo-fech]').forEach((b) => { b.onclick = () => { fechar(); gerarReciboModal(ap, v, b.dataset.reciboFech); }; });
      el.querySelectorAll('[data-pagar-recibo]').forEach((b) => { b.onclick = () => { fechar(); pagar(ap, v, { recibo_id: b.dataset.pagarRecibo, valor: Number(b.dataset.valor) }); }; });
      const comMotivo = (sel, titulo, texto, fn) => el.querySelectorAll(sel).forEach((b) => {
        b.onclick = async () => {
          const motivo = await confirmar(titulo, texto, { botao: 'Confirmar', perigo: true, pedirTexto: 'Motivo (obrigatório)' });
          if (motivo === false) return;
          try { await fn(b, motivo); fechar(); aviso('Feito.'); recarregar(v.pessoa_id); } catch (e) { aviso(e.message, 'erro'); }
        };
      });
      comMotivo('[data-estornar]', 'Estornar pagamento?', 'O valor volta a ficar pendente para o colaborador.', (b, m) => estornarPagamento(b.dataset.estornar, m));
      comMotivo('[data-cancelar-recibo]', 'Cancelar recibo?', 'O recibo continua registrado com a marca de cancelado.', (b, m) => cancelarRecibo(b.dataset.cancelarRecibo, m));
      comMotivo('[data-cancelar-fech]', 'Cancelar fechamento?', 'O fechamento fica registrado como cancelado. Se era definitivo, o mês do colaborador volta a ser calculado.', (b, m) => cancelarFechamento(b.dataset.cancelarFech, m));
      el.querySelectorAll('[data-excluir-lanc]').forEach((b) => {
        b.onclick = async () => {
          if (!(await confirmar('Excluir lançamento?', 'O lançamento será removido desta competência.', { botao: 'Excluir', perigo: true }))) return;
          try { await excluirLancamento(b.dataset.excluirLanc); fechar(); aviso('Lançamento excluído.'); recarregar(v.pessoa_id); } catch (e) { aviso(e.message, 'erro'); }
        };
      });
    },
  });
}
const hojeOuFim = (ap) => { const h = hojeSP(); return h < ap.periodo.fim ? h : ap.periodo.fim; };
function fecharIndividualModal(ap, v) {
  const { el, fechar } = modal({
    titulo: `Fechar mês — ${v.nome}`, largura: 560,
    corpo: `<p class="intro">Registra a posição do colaborador numa data e gera o relatório de comissão em PDF. Não depende do fechamento do mês para todos nem do recibo.</p>
      <div class="grade" style="--col:2">
        <label class="campo">Data de corte<span class="dica">entram os pedidos emitidos até esta data</span><input type="date" name="data_corte" id="fi-corte" value="${hojeOuFim(ap)}" min="${ap.periodo.inicio}" max="${hojeOuFim(ap)}"></label><span></span>
        <label class="marcar largo"><input type="radio" name="tipo" value="parcial" checked id="fi-parcial"> <span><b>Parcial</b> — posição até a data; o mês continua aberto e vendas posteriores entram no cálculo</span></label>
        <label class="marcar largo"><input type="radio" name="tipo" value="definitivo" id="fi-definitivo"> <span><b>Definitivo</b> — o mês deste colaborador fica congelado nesta posição; vendas posteriores ficam fora</span></label>
      </div>`,
    rodape: '<button class="btn" data-fechar>Cancelar</button><button class="btn primario" data-ok>Fechar e baixar relatório</button>',
  });
  el.querySelector('[data-ok]').onclick = (e) => comBotao(e.target, async () => {
    const d = lerForm(el);
    const id = await fecharIndividual({ pessoa_id: v.pessoa_id, competencia: ap.competencia, data_corte: d.data_corte, definitivo: d.tipo === 'definitivo' });
    fechar(); aviso('Fechamento registrado.'); recarregar(v.pessoa_id);
    await baixarFechamento(id).catch((err) => aviso(err.message, 'erro'));
  });
}
// Recibo: formulário com o que aparece no documento + pré-visualização ao vivo. Serve para emitir e para editar um já emitido.
function gerarReciboModal(ap, v, fechamentoId = null) { reciboModal(ap, v, { fechamentoId }); }
function reciboModal(ap, v, { fechamentoId = null, reciboId = null } = {}) {
  const existente = reciboId ? obterRecibo(reciboId) : null;
  const pago = !!existente?.pagamento; const cancelado = !!existente?.cancelado_em;
  const fech = fechamentoId ? (v.fechamentos || []).find((f) => f.id === fechamentoId) : null;
  const sugerido = existente ? existente.valor : fech ? Math.max(0, centavos(fech.a_pagar - v.pago)) : Math.max(0, v.saldo);
  const ed0 = existente?.dados?.edicao || {};
  let textoProprio = !!ed0.texto;
  let base = null; let erroBase = null;
  const pes = S.pessoas.get(v.pessoa_id);
  const salCad = v.salario_base;
  const n = (x) => (x === null || x === undefined ? '' : x);
  const mostrar = { ...MOSTRAR_RECIBO, ...(ed0.mostrar || {}) };
  const marca = (k, rot) => `<label class="marcar"><input type="checkbox" data-mostrar="${k}" id="re-m-${k}" ${mostrar[k] ? 'checked' : ''}> ${rot}</label>`;
  const travado = cancelado;
  const { el, fechar } = modal({
    titulo: existente ? `Recibo nº ${String(existente.numero).padStart(6, '0')} — ${v.nome}` : `Recibo — ${v.nome}`, largura: 1220,
    corpo: `<div class="recibo-edicao">
      <div class="re-form">
        <p class="intro">${existente ? `Emitido em ${data(existente.emitido_em)}${pago ? ' · <b>pago</b> (valor travado)' : ''}${cancelado ? ' · <b class="tom-vermelha">cancelado</b>' : ''}. As alterações mudam só o que aparece no documento; a comissão calculada não muda.`
          : fech ? `Com base no fechamento ${fech.definitivo ? 'definitivo' : 'parcial'} de ${data(fech.data_corte)}.` : `Com base na posição de ${esc(nomeMes(ap.competencia))} na data do recibo${ap.status === 'fechada' ? ' (mês fechado)' : ''}.`}</p>
        <div class="re-resumo"><table class="conta">
          <tr><td>Salário base <span class="fraco">(${v.salario_personalizado ? 'cadastro' : 'cargo'})</span></td><td>${brl(salCad)}</td></tr>
          <tr><td>Comissão a pagar no mês</td><td>${brl(v.a_pagar)}</td></tr>
          <tr><td>Já pago · saldo</td><td>${brl(v.pago)} · <b>${brl(v.saldo)}</b></td></tr>
          <tr class="total"><td>Total do mês (salário + comissão)</td><td>${brl(v.total_mes)}</td></tr></table></div>
        <div class="grade" style="--col:2">
          <label class="campo">Data do recibo<input type="date" name="data_recibo" id="rc-data" value="${existente ? existente.data_recibo : hojeSP()}" min="${ap.periodo.inicio}" ${travado ? 'disabled' : ''}></label>
          <label class="campo">Comissão e lançamentos (R$)<span class="dica">líquido; sem salário e benefícios</span><input type="number" step="0.01" min="0" name="valor" id="rc-valor" value="${Number(sugerido).toFixed(2)}" ${pago || travado ? 'disabled' : ''}></label>
          <label class="campo largo">Nome no recibo<input type="text" name="nome" id="rc-nome" value="${esc(ed0.nome || existente?.dados?.pessoa?.nome || pes?.nome || v.nome)}" ${travado ? 'disabled' : ''}></label>
          <label class="campo">CPF no recibo<input type="text" name="cpf" id="rc-cpf" inputmode="numeric" value="${esc(ed0.cpf || existente?.dados?.pessoa?.cpf || formatarCpf(pes?.cpf || ''))}" placeholder="000.000.000-00" ${travado ? 'disabled' : ''}></label>
          <label class="campo">Cidade da assinatura<input type="text" name="cidade" id="rc-cidade" value="${esc(ed0.cidade ?? empresa().cidade ?? '')}" placeholder="ex.: Wenceslau Braz/PR" ${travado ? 'disabled' : ''}></label>
          <label class="campo largo">Título<input type="text" name="titulo" id="rc-titulo" value="${esc(ed0.titulo || '')}" placeholder="automático" ${travado ? 'disabled' : ''}></label>
        </div>
        <label class="campo">Texto da declaração<span class="dica" data-dica-texto></span>
          <textarea name="texto" id="rc-texto" rows="8" ${travado ? 'disabled' : ''}></textarea></label>
        <div class="secao">O que aparece no recibo</div>
        <div class="re-marcas">${marca('demonstrativo', 'Discriminação')}${marca('vendas', 'Lista de vendas')}${marca('pix', 'Chave Pix')}</div>
        <div class="secao">Salário e benefícios no recibo</div>
        <p class="nota">Linhas marcadas entram somadas no recibo; desmarcadas não aparecem. Alimentação sem valor fixo: informe o valor do mês ou desmarque.</p>
        <div data-comps></div>
        <div class="barra"><button class="btn pequeno" data-add-comp ${travado ? 'disabled' : ''}>${ICONES.mais}Incluir linha</button><button class="btn-link" data-padrao-comp ${travado ? 'disabled' : ''}>restaurar salário e benefícios do cadastro</button></div>
        <div class="re-total" data-total></div>
        <label class="campo">Observação<span class="dica">aparece antes da assinatura</span><textarea name="observacao" id="rc-obs" rows="2" ${travado ? 'disabled' : ''}>${esc(ed0.observacao || '')}</textarea></label>
        ${existente ? '' : '<label class="marcar"><input type="checkbox" name="registrar_pagamento" id="rc-pagar"> Registrar também o pagamento da comissão (sai do pendente)</label>'}
      </div>
      <div class="re-previa"><div class="secao">Pré-visualização</div><div class="folha-wrap" data-previa></div></div>
    </div>`,
    rodape: `${existente || travado ? '' : '<button class="btn" data-pdf-previa>' + ICONES.baixar + 'Baixar prévia</button>'}<span class="espaco"></span><button class="btn" data-fechar>${travado ? 'Fechar' : 'Cancelar'}</button>
      ${existente ? `<button class="btn" data-baixar>${ICONES.baixar}Baixar PDF</button>${travado ? '' : '<button class="btn primario" data-ok>Salvar e baixar PDF</button>'}` : '<button class="btn primario" data-ok>Emitir e baixar PDF</button>'}`,
  });
  const salBase = existente ? (existente.dados.salario_base ?? existente.dados.linha?.salario_base ?? null) : salCad;
  const bensBase = existente?.dados?.beneficios || beneficiosDoCargo(v.cargo_id);
  const padraoComps = () => componentesPadrao({ salario: ed0.salario ?? salBase, beneficios: bensBase, comSalario: true });
  let comps = Array.isArray(ed0.componentes) ? clonar(ed0.componentes) : padraoComps();
  const caixa = el.querySelector('[data-comps]');
  const dis = travado ? 'disabled' : '';
  const desenharComps = () => {
    caixa.innerHTML = comps.map((c, i) => `<div class="re-comp" data-i="${i}">
      <div class="re-comp-l1"><input type="text" data-c="nome" value="${esc(c.nome)}" placeholder="Ex.: Vale Alimentação" aria-label="Componente" ${dis}>
        <input type="number" step="0.01" min="0" data-c="valor" value="${c.valor ?? ''}" placeholder="variável" aria-label="Valor" ${dis}></div>
      <div class="re-comp-l2"><select data-c="natureza" aria-label="Natureza" ${dis}>${NATUREZAS_REC.map((x) => `<option ${x === c.natureza ? 'selected' : ''}>${x}</option>`).join('')}</select>
        <input type="text" data-c="forma" value="${esc(c.forma || '')}" placeholder="forma de pagamento" aria-label="Forma de pagamento" ${dis}></div>
      <div class="re-comp-l3"><label class="marcar"><input type="checkbox" data-c="no_recibo" ${c.no_recibo ? 'checked' : ''} ${dis}> Incluir no recibo</label>
        ${travado ? '' : '<button class="btn-link tom-vermelha" data-rem-comp>remover</button>'}</div></div>`).join('') || '<p class="nota">Nenhuma linha. Use "Incluir linha".</p>';
  };
  const lerCampoComp = (e) => {
    const box = e.target.closest('.re-comp'); const k = e.target.dataset.c;
    if (!box || !k) return;
    const c = comps[Number(box.dataset.i)];
    c[k] = k === 'no_recibo' ? e.target.checked : k === 'valor' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value;
  };
  caixa.addEventListener('input', lerCampoComp);
  caixa.addEventListener('change', (e) => { lerCampoComp(e); desenhar(); });
  caixa.addEventListener('click', (e) => { if (e.target.closest('[data-rem-comp]')) { e.preventDefault(); comps.splice(Number(e.target.closest('.re-comp').dataset.i), 1); desenharComps(); desenhar(); } });
  el.querySelector('[data-add-comp]').onclick = (e) => { e.preventDefault(); comps.push({ nome: '', natureza: 'Benefício', forma: 'Pix', valor: null, no_recibo: false }); desenharComps(); caixa.querySelector('.re-comp:last-child [data-c=nome]')?.focus(); };
  el.querySelector('[data-padrao-comp]').onclick = (e) => { e.preventDefault(); comps = padraoComps(); desenharComps(); desenhar(); };
  desenharComps();
  const g = (nm) => el.querySelector(`[name=${nm}]`);
  const txt = g('texto'); const dica = el.querySelector('[data-dica-texto]'); const previa = el.querySelector('[data-previa]');
  const lerEdicao = () => ({
    nome: g('nome').value.trim(), cpf: g('cpf').value.trim(), cidade: g('cidade').value, titulo: g('titulo').value.trim(),
    texto: textoProprio ? txt.value : null, observacao: g('observacao').value, salario: null, componentes: clonar(comps),
    mostrar: Object.fromEntries([...el.querySelectorAll('[data-mostrar]')].map((c) => [c.dataset.mostrar, c.checked])),
  });
  const calcularBase = () => {
    erroBase = null;
    if (existente) { base = clonar(existente); return; }
    try {
      const r = prepararRecibo({ pessoa_id: v.pessoa_id, competencia: ap.competencia, data_recibo: g('data_recibo').value, valor: g('valor').value, fechamento_id: fechamentoId });
      base = { previa: true, numero: null, pessoa_id: v.pessoa_id, valor: r.valor, data_recibo: r.dataRecibo, dados: r.conteudo };
    } catch (e) { base = null; erroBase = e.message; }
  };
  const desenhar = () => {
    if (!base) { previa.innerHTML = `<div class="alerta erro"><div>${esc(erroBase || 'Não foi possível montar o recibo.')}</div></div>`; return; }
    const val = Number(g('valor').value);
    const b = { ...base, valor: Number.isFinite(val) && g('valor').value !== '' ? centavos(val) : base.valor, data_recibo: normalizarData(g('data_recibo').value) || base.data_recibo };
    let ed;
    try { ed = normalizarEdicao(lerEdicao()); } catch { ed = { ...lerEdicao(), cpf: g('cpf').value.trim(), mostrar: { ...MOSTRAR_RECIBO, ...lerEdicao().mostrar } }; }
    b.dados = { ...b.dados, edicao: { ...(b.dados.edicao || {}), ...ed } };
    if (!textoProprio) b.dados.edicao.texto = null;
    const m = modeloRecibo(b);
    if (!textoProprio && document.activeElement !== txt) txt.value = m.texto;
    dica.textContent = textoProprio ? 'texto personalizado — nome, CPF e valor não se atualizam sozinhos aqui' : 'gerado automaticamente com nome, CPF e valor; ao editar, fica fixo';
    dica.innerHTML = `${esc(dica.textContent)}${textoProprio ? ' · <button class="btn-link" data-restaurar-texto>restaurar texto padrão</button>' : ''}`;
    dica.querySelector('[data-restaurar-texto]')?.addEventListener('click', (e) => { e.preventDefault(); textoProprio = false; desenhar(); });
    previa.innerHTML = htmlDoModelo(m);
    const semValor = comps.filter((c) => c.no_recibo && String(c.nome || '').trim() && !(Number(c.valor) > 0));
    el.querySelector('[data-total]').innerHTML = `Salário e benefícios ${brl(centavos(m.valor - m.valor_comissao))} + comissão e lançamentos ${brl(m.valor_comissao)} = <b>total ${brl(m.valor)}</b>${semValor.length ? `<div class="tom-vermelha">Informe o valor de: ${esc(semValor.map((c) => c.nome).join(', '))}</div>` : ''}`;
    return m;
  };
  if (textoProprio) txt.value = ed0.texto;
  calcularBase(); desenhar();
  let t = null;
  el.querySelector('.re-form').addEventListener('input', (e) => {
    if (e.target === txt) textoProprio = true;
    clearTimeout(t); t = setTimeout(() => { if (e.target === g('data_recibo')) calcularBase(); desenhar(); }, 120);
  });
  el.querySelector('.re-form').addEventListener('change', (e) => { if (e.target === g('data_recibo')) { calcularBase(); desenhar(); } });
  el.querySelector('[data-pdf-previa]')?.addEventListener('click', (e) => comBotao(e.currentTarget, async () => {
    const m = desenhar(); if (!m) falha(erroBase || 'Recibo inválido.');
    await baixar(nomeArquivoRecibo(m), pdfDoModelo(m).output('blob'));
  }));
  el.querySelector('[data-baixar]')?.addEventListener('click', (e) => comBotao(e.currentTarget, () => baixarRecibo(existente.id)));
  el.querySelector('[data-ok]')?.addEventListener('click', (e) => comBotao(e.currentTarget, async () => {
    const edicao = lerEdicao();
    normalizarEdicao(edicao);
    if (existente) {
      await salvarRecibo(existente.id, { valor: pago ? undefined : Number(g('valor').value), data_recibo: g('data_recibo').value, edicao });
      fechar(); aviso(`Recibo nº ${existente.numero} atualizado.`); recarregar(v.pessoa_id);
      await baixarRecibo(existente.id).catch((err) => aviso(err.message, 'erro'));
      return;
    }
    const r = await emitirRecibo({ pessoa_id: v.pessoa_id, competencia: ap.competencia, data_recibo: g('data_recibo').value, valor: Number(g('valor').value), registrar_pagamento: g('registrar_pagamento').checked, fechamento_id: fechamentoId, edicao });
    fechar(); aviso(`Recibo nº ${r.numero} emitido.`); recarregar(v.pessoa_id);
    await baixarRecibo(r.id).catch((err) => aviso(err.message, 'erro'));
  }));
}
function pagar(ap, v, { recibo_id: reciboId = null, valor = null } = {}) {
  const p = S.pessoas.get(v.pessoa_id);
  const pix = p?.pix_chave ? `${PIX_ROTULO[p.pix_tipo] || 'Pix'}: ${p.pix_chave}` : '';
  const { el, fechar } = modal({
    titulo: `Pagamento — ${v.nome}`, largura: 500,
    corpo: `<p class="intro">${esc(nomeMes(ap.competencia))} · a pagar ${brl(v.a_pagar)} · pago ${brl(v.pago)} · <b>saldo ${brl(v.saldo)}</b>
      ${pix ? `<br>Chave Pix — <span class="mono selecionavel">${esc(pix)}</span> <button class="btn-link" data-copiar>copiar</button>` : '<br><span class="tom-amarela">Sem chave Pix cadastrada.</span>'}</p>
      <div class="grade" style="--col:2">
        <label class="campo">Valor (R$)<input type="number" step="0.01" name="valor" id="pg-valor" value="${(valor ?? Math.max(0, v.saldo)).toFixed(2)}"></label>
        <label class="campo">Data do pagamento<input type="date" name="data_pagamento" id="pg-data" value="${hojeSP()}"></label>
        <label class="campo">Forma<select name="forma" id="pg-forma"><option value="pix">Pix</option><option value="transferencia">Transferência</option><option value="outro">Outro</option></select></label>
        <label class="campo">Observação<input type="text" name="observacao" id="pg-obs"></label>
      </div>`,
    rodape: '<button class="btn" data-fechar>Cancelar</button><button class="btn primario" data-ok>Marcar como pago</button>',
  });
  el.querySelector('[data-copiar]')?.addEventListener('click', async (e) => {
    try { await navigator.clipboard.writeText(p.pix_chave); aviso('Chave Pix copiada.'); }
    catch { const s = window.getSelection(); const r = document.createRange(); r.selectNodeContents(el.querySelector('.selecionavel')); s.removeAllRanges(); s.addRange(r); aviso('Selecione e copie a chave (Ctrl+C).'); }
  });
  el.querySelector('[data-ok]').onclick = (e) => comBotao(e.target, async () => {
    const d = lerForm(el);
    await registrarPagamento({ ...d, valor: Number(d.valor), pessoa_id: v.pessoa_id, competencia: ap.competencia, recibo_id: reciboId });
    fechar(); aviso('Pagamento registrado.'); recarregar();
  });
}
function novoLancamento(inicial = {}) {
  const ativos = listarPessoas();
  const todas = listarPessoas({ situacao: 'todos' });
  const unico = !!inicial.pessoa_id;
  const modelos = S.cfg.modelos_lancamento || [];
  const m0 = inicial.modelo_id ? modelos.find((m) => m.id === inicial.modelo_id) : null;
  const tipo0 = m0?.tipo || inicial.tipo || 'bonus';
  const { el, fechar } = modal({
    titulo: 'Novo lançamento', largura: 620,
    corpo: `<p class="intro">Fica salvo na competência, soma (ou desconta) no valor a pagar e sai no recibo. A taxa da cooperativa não incide sobre lançamentos.</p>
      <div class="grade" style="--col:2">
        ${modelos.length ? `<label class="campo largo">Usar valor salvo<select data-modelo id="lc-modelo">${opcoes(modelos.map((m) => ({ id: m.id, nome: `${m.nome} — ${rotuloLanc(m)}${m.valor ? ` · ${brl(m.valor)}` : ''}` })), m0?.id, { vazio: '— nenhum —' })}</select></label>` : ''}
        <label class="campo">Tipo<select name="tipo" id="lc-tipo">${Object.entries(TIPOS_LANC).map(([k, t]) => `<option value="${k}" ${k === tipo0 ? 'selected' : ''}>${t.rotulo}</option>`).join('')}</select><span class="dica" data-dica-tipo></span></label>
        <label class="campo">Competência<input type="month" name="competencia" id="lc-comp" value="${estado.competencia}"></label>
        <label class="campo largo">Descrição<input type="text" name="motivo" id="lc-motivo" value="${esc(m0?.nome || inicial.motivo || '')}" placeholder="ex.: Bônus campanha de outubro · Reembolso combustível viagem PG"></label>
        <label class="campo">Valor (R$)<input type="number" step="0.01" name="valor" id="lc-valor" value="${m0?.valor ?? ''}"></label>
        <div class="campo fim"><label class="marcar"><input type="checkbox" name="salvar_modelo" id="lc-salvar-modelo"> Guardar em "valores salvos"</label></div>
        ${unico ? `<label class="campo largo">Colaborador<select name="pessoa_id" id="lc-pessoa">${opcoes(todas, inicial.pessoa_id)}</select></label>` : `
        <div class="campo largo"><span>Colaboradores</span>
          <div class="barra" style="margin:4px 0 6px"><input type="search" data-busca-pes id="lc-busca" placeholder="Buscar" class="busca-curta"><button class="btn-link" data-todos>marcar todos</button><button class="btn-link" data-nenhum>limpar</button><span class="nota" data-qtd></span></div>
          <div class="lista-pessoas">${ativos.map((p) => `<label class="marcar" data-nome="${esc(chaveNome(p.nome))}"><input type="checkbox" data-pes value="${esc(p.id)}"> ${esc(p.nome)} <span class="fraco">· ${esc(p.unidade_nome || '—')}</span></label>`).join('')}</div></div>`}
      </div>`,
    rodape: `<button class="btn" data-fechar>Cancelar</button><button class="btn primario" data-salvar>Lançar</button>`,
  });
  const g = (n) => el.querySelector(`[name=${n}]`);
  const dica = () => { el.querySelector('[data-dica-tipo]').textContent = TIPOS_LANC[g('tipo').value].dica; };
  g('tipo').onchange = dica; dica();
  el.querySelector('[data-modelo]')?.addEventListener('change', (e) => {
    const m = modelos.find((x) => x.id === e.target.value); if (!m) return;
    g('tipo').value = m.tipo; g('motivo').value = m.nome; if (m.valor) g('valor').value = m.valor; dica();
  });
  const marcados = () => [...el.querySelectorAll('[data-pes]:checked')].map((c) => c.value);
  const contar = () => { const q = el.querySelector('[data-qtd]'); if (q) q.textContent = `${marcados().length} selecionado(s)`; };
  el.querySelectorAll('[data-pes]').forEach((c) => { c.onchange = contar; });
  el.querySelector('[data-busca-pes]')?.addEventListener('input', (e) => { const k = chaveNome(e.target.value); el.querySelectorAll('.lista-pessoas [data-nome]').forEach((x) => { x.hidden = !!k && !x.dataset.nome.includes(k); }); });
  el.querySelector('[data-todos]')?.addEventListener('click', (e) => { e.preventDefault(); el.querySelectorAll('.lista-pessoas [data-nome]:not([hidden]) [data-pes]').forEach((c) => { c.checked = true; }); contar(); });
  el.querySelector('[data-nenhum]')?.addEventListener('click', (e) => { e.preventDefault(); el.querySelectorAll('[data-pes]').forEach((c) => { c.checked = false; }); contar(); });
  contar();
  el.querySelector('[data-salvar]').onclick = (e) => comBotao(e.target, async () => {
    const tipo = g('tipo').value;
    const ids = unico ? [g('pessoa_id').value] : marcados();
    await lancar({ tipo, competencia: g('competencia').value, motivo: g('motivo').value, valor: Number(g('valor').value), pessoas_ids: ids, pedido_id: inicial.pedido_id || null });
    if (g('salvar_modelo').checked && !modelos.some((m) => chaveNome(m.nome) === chaveNome(g('motivo').value) && m.tipo === tipo)) {
      await salvarModelosLanc([...modelos, { nome: g('motivo').value, tipo, valor: Math.abs(Number(g('valor').value)) }], { entidade: 'configuracao', entidade_id: 'modelos_lancamento', acao: 'criar', para: { nome: g('motivo').value, tipo } });
    }
    fechar(); aviso(ids.length > 1 ? `${ids.length} lançamentos gravados.` : 'Lançamento gravado.');
    if (unico) recarregar(ids[0]); else rotear();
  });
}
function modeloLancModal(m = null) {
  const modelos = S.cfg.modelos_lancamento || [];
  const { el, fechar } = modal({
    titulo: m ? `Editar "${m.nome}"` : 'Novo valor salvo', largura: 480,
    corpo: `<div class="grade" style="--col:2">
      <label class="campo largo">Nome / descrição<input type="text" name="nome" id="ml-nome" value="${esc(m?.nome || '')}" placeholder="ex.: Ajuda de custo combustível"></label>
      <label class="campo">Tipo<select name="tipo" id="ml-tipo">${Object.entries(TIPOS_LANC).map(([k, t]) => `<option value="${k}" ${k === (m?.tipo || 'reembolso') ? 'selected' : ''}>${t.rotulo}</option>`).join('')}</select></label>
      <label class="campo">Valor padrão (R$)<span class="dica">opcional — pode mudar ao lançar</span><input type="number" step="0.01" min="0" name="valor" id="ml-valor" value="${m?.valor ?? ''}"></label></div>`,
    rodape: `${m ? '<button class="btn perigo" data-remover>Remover</button>' : ''}<span class="espaco"></span><button class="btn" data-fechar>Cancelar</button><button class="btn primario" data-salvar>Salvar</button>`,
  });
  el.querySelector('[data-salvar]').onclick = (e) => comBotao(e.target, async () => {
    const d = lerForm(el);
    if (!d.nome) falha('Informe o nome.');
    const lista = m ? modelos.map((x) => (x.id === m.id ? { ...x, ...d } : x)) : [...modelos, d];
    await salvarModelosLanc(lista, { entidade: 'configuracao', entidade_id: 'modelos_lancamento', acao: m ? 'alterar' : 'criar', para: { nome: d.nome, tipo: d.tipo } });
    fechar(); aviso('Valor salvo.'); rotear();
  });
  el.querySelector('[data-remover]')?.addEventListener('click', (e) => comBotao(e.currentTarget, async () => {
    await salvarModelosLanc(modelos.filter((x) => x.id !== m.id), { entidade: 'configuracao', entidade_id: 'modelos_lancamento', acao: 'excluir', de: { nome: m.nome } });
    fechar(); aviso('Removido.'); rotear();
  }));
}

/* ================= tela: lançamentos do mês (fechamento da folha) ================= */
function telaLancamentos(alvo) {
  const comp = estado.competencia; const fechado = mesFechado(comp);
  const lancs = lancamentosDe(comp);
  const modelos = S.cfg.modelos_lancamento || [];
  pedirNomes(lancs.map((l) => l.autor));
  const porTipo = Object.keys(TIPOS_LANC).map((k) => ({ k, qtd: lancs.filter((l) => (l.tipo || 'ajuste') === k).length, soma: centavos(lancs.filter((l) => (l.tipo || 'ajuste') === k).reduce((t, l) => t + l.valor, 0)) })).filter((x) => x.qtd);
  const total = centavos(lancs.reduce((t, l) => t + l.valor, 0));
  const nomeP = (id) => S.pessoas.get(id)?.nome || '—';
  alvo.innerHTML = `
    ${fechado ? `<div class="alerta"><div>${esc(nomeMes(comp))} está fechado: os lançamentos ficam só para consulta. Lance no mês aberto.</div></div>` : ''}
    <div class="barra">
      <span class="legenda-mes">${esc(nomeMes(comp))} · ${lancs.length} lançamento(s) · total ${brl(total)}</span>
      ${porTipo.map((x) => `<span class="chip ${x.soma < 0 ? 'vermelha' : 'ok'}">${esc(TIPOS_LANC[x.k].rotulo)}: ${brl(x.soma)}</span>`).join('')}
      <span class="espaco"></span>
      <button class="btn primario" data-novo id="lt-novo" ${fechado ? 'disabled' : ''}>${ICONES.mais}Novo lançamento</button>
    </div>
    <div class="painel"><div class="painel-cab"><h2>Lançamentos de ${esc(nomeMes(comp))}</h2><span class="espaco"></span><span class="nota-cab">bônus, reembolsos, créditos, ajustes e descontos — entram no valor a pagar e no recibo</span></div>
      <div class="rolagem">${lancs.length ? `<table class="tabela"><thead><tr><th>Colaborador</th><th>Tipo</th><th>Descrição</th><th class="n">Valor</th><th>Lançado por</th><th></th></tr></thead>
        <tbody>${[...lancs].sort((a, b) => porNome({ nome: nomeP(a.pessoa_id) }, { nome: nomeP(b.pessoa_id) })).map((l) => `<tr><td><b>${esc(nomeP(l.pessoa_id))}</b></td>
          <td><span class="chip ${l.valor < 0 ? 'vermelha' : 'ok'}">${esc(rotuloLanc(l))}</span></td><td class="quebra">${esc(l.motivo)}</td>
          <td class="n ${l.valor < 0 ? 'tom-vermelha' : ''}">${l.valor < 0 ? '− ' : '+ '}${brl(Math.abs(l.valor))}</td><td class="pequena">${esc(quem(l.autor))} · ${dataHora(l.criado_em)}</td>
          <td class="dir">${fechado ? '' : `<button class="btn-link tom-vermelha" data-excluir="${esc(l.id)}">excluir</button>`}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="3">Total</td><td class="n">${brl(total)}</td><td colspan="2"></td></tr></tfoot></table>`
        : '<div class="vazio">Nenhum lançamento neste mês. Use <b>Novo lançamento</b> para registrar bônus, reembolsos ou descontos do fechamento.</div>'}</div></div>
    <div class="painel bloco"><div class="painel-cab"><h2>Valores salvos</h2><span class="espaco"></span><span class="nota-cab">para reutilizar todo mês</span>
        <button class="btn pequeno" data-novo-modelo id="lt-modelo">${ICONES.mais}Novo valor salvo</button></div>
      <div class="rolagem">${modelos.length ? `<table class="tabela"><thead><tr><th>Nome</th><th>Tipo</th><th class="n">Valor padrão</th><th></th></tr></thead>
        <tbody>${modelos.map((m) => `<tr><td><b>${esc(m.nome)}</b></td><td>${esc(rotuloLanc(m))}</td><td class="n">${m.valor ? brl(m.valor) : '<span class="fraco">a definir</span>'}</td>
          <td class="dir nowrap">${fechado ? '' : `<button class="btn pequeno primario" data-usar="${esc(m.id)}">Lançar</button> `}<button class="btn pequeno" data-editar-modelo="${esc(m.id)}">Editar</button></td></tr>`).join('')}</tbody></table>`
        : '<div class="vazio">Nenhum valor salvo. Cadastre os que se repetem (ex.: ajuda de custo, bônus de campanha) para lançar com um clique.</div>'}</div></div>`;
  alvo.querySelector('[data-novo]').onclick = () => novoLancamento({});
  alvo.querySelector('[data-novo-modelo]').onclick = () => modeloLancModal(null);
  alvo.querySelectorAll('[data-usar]').forEach((b) => { b.onclick = () => novoLancamento({ modelo_id: b.dataset.usar }); });
  alvo.querySelectorAll('[data-editar-modelo]').forEach((b) => { b.onclick = () => modeloLancModal(modelos.find((m) => m.id === b.dataset.editarModelo)); });
  alvo.querySelectorAll('[data-excluir]').forEach((b) => {
    b.onclick = async () => {
      if (!(await confirmar('Excluir lançamento?', 'O valor sai do mês e do recibo.', { botao: 'Excluir', perigo: true }))) return;
      try { await excluirLancamento(b.dataset.excluir); aviso('Lançamento excluído.'); rotear(); } catch (e) { aviso(e.message, 'erro'); }
    };
  });
}

/* ================= tela: pedidos do mês e importação da planilha ================= */
const STATUS_PED = {
  conta: { rotulo: 'Na apuração', classe: 'ok' }, vendedor_nao_cadastrado: { rotulo: 'Vendedor não cadastrado', classe: 'vermelha' },
  sem_vendedor: { rotulo: 'Sem vendedor', classe: 'vermelha' }, cancelado: { rotulo: 'Cancelado', classe: '' }, em_digitacao: { rotulo: 'Em digitação', classe: '' },
  excluido: { rotulo: 'Excluído manualmente', classe: 'amarela' }, apagado: { rotulo: 'Apagado', classe: 'vermelha' },
};
const filtroPed = { status: '', busca: '' };

function telaPedidos(alvo) {
  const dias = estado.dias.de ? estado.dias : null;
  const pedidos = listarPedidos(estado.competencia, dias ? { de: dias.de, ate: dias.ate } : {});
  const pessoas = listarPessoas({ situacao: 'todos' });
  const periodoTxt = dias ? `de ${data(dias.de)} a ${data(dias.ate)}` : `em ${esc(nomeMes(estado.competencia))}`;
  const cont = {};
  for (const p of pedidos) cont[p.status] = (cont[p.status] || 0) + 1;
  const ult = S.cfg.ultima_importacao;
  if (ult) pedirNomes([ult.autor]);
  alvo.innerHTML = `
    <div class="alerta info"><div>Pedidos com <b>data de emissão</b> ${periodoTxt} (ou importados para este mês, quando a planilha não tem data). Entram na comissão todos os pedidos, em qualquer situação, <b>exceto cancelados</b> (no pedido ou na OS) <b>e em digitação</b>.
      A comissão é calculada sobre o <b>valor total do pedido</b>, que pode ser editado aqui com justificativa. O vendedor da planilha é casado com o cadastro pelo nome; pedido de vendedor não cadastrado fica fora até o cadastro.
      Ajustes feitos aqui ficam só nesta plataforma — nada é alterado no Flow.</div></div>
    <div class="painel">
      <div class="painel-cab">
        <h2>${pedidos.length - (cont.apagado || 0)} pedidos</h2>
        <span class="nota-cab">${ult ? `última planilha: ${esc(ult.arquivo || '')} · ${dataHora(ult.em)} por ${esc(quem(ult.autor))}` : 'nenhuma planilha importada ainda'}</span>
        <span class="espaco"></span>
        <input type="search" placeholder="Pedido, projeto, cliente ou vendedor" data-busca id="pd-busca" value="${esc(filtroPed.busca)}" class="busca-larga">
        <select data-status id="pd-status">${opcoes(Object.entries(STATUS_PED).map(([id, s]) => ({ id, nome: `${s.rotulo} (${cont[id] || 0})` })), filtroPed.status, { vazio: 'Todas as situações' })}</select>
        <button class="btn primario" data-importar id="pd-importar">${ICONES.subir}Importar planilha</button>
      </div>
      <div class="rolagem" data-tabela></div>
    </div>`;
  const desenhar = () => {
    const b = filtroPed.busca.toLowerCase();
    const lista = pedidos.filter((p) => (filtroPed.status ? p.status === filtroPed.status : p.status !== 'apagado') &&
      (!b || [p.numero, p.cliente_nome, p.cliente_codigo, p.codigo_projeto, p.vendedor_flow, p.pessoa_nome].some((x) => String(x || '').toLowerCase().includes(b))));
    const total = lista.reduce((s, p) => s + p.valor_total, 0);
    alvo.querySelector('[data-tabela]').innerHTML = lista.length ? `<table class="tabela">
      <thead><tr><th>Pedido</th><th>Projeto</th><th>Cliente</th><th>Emissão</th><th>Aprovação</th><th>Situação</th><th>Vendedor na planilha</th><th>Vendedor na apuração</th><th class="n">Valor total (base)</th><th>Status</th><th></th></tr></thead>
      <tbody>${lista.map((p) => `<tr>
        <td><b>${esc(p.numero)}</b></td><td class="mono">${esc(p.codigo_projeto || '—')}</td>
        <td class="quebra">${esc(p.cliente_nome || '—')}${p.cliente_codigo ? `<div class="sub">cód. ${esc(p.cliente_codigo)}</div>` : ''}</td>
        <td>${p.competencia_planilha ? `<b>${mesCurto(p.competencia_planilha)}</b><div class="sub">${p.remanejado ? '' : 'mês da planilha'}</div>` : `<b>${data(p.data_emissao)}</b>`}${p.remanejado ? `<div class="sub tom-amarela" title="${esc(p.remanejado.justificativa)}">remanejado de ${p.remanejado.de ? mesCurto(p.remanejado.de) : 'outro mês'}</div>` : ''}${p.margem_sup ? `<div class="sub ${p.margem_sup.margem < MARGEM_MINIMA_SUP ? 'tom-amarela' : ''}" title="${esc(p.margem_sup.justificativa || '')}">margem ${pct(p.margem_sup.margem)}${p.margem_sup.margem < MARGEM_MINIMA_SUP ? ` · supervisão ${brl(valorSup(p))}` : ''}</div>` : ''}</td><td>${data(p.data_aprovacao)}</td>
        <td>${esc(p.situacao || '—')}${p.situacao_os ? `<div class="sub ${p.cancelado_pela_os ? 'tom-vermelha' : ''}">OS: ${esc(p.situacao_os)}</div>` : ''}</td>
        <td>${esc(p.vendedor_flow || '—')}</td>
        <td>${esc(p.pessoa_nome || '—')}${p.origem_vinculo === 'ajuste' ? ` <span class="chip" title="${esc(p.ajuste?.justificativa)}">ajuste</span>` : ''}</td>
        <td class="n">${brl(p.valor_total)}${p.valor_editado ? `<div class="sub tom-amarela" title="${esc(p.valor_editado.justificativa)}">editado · planilha ${brl(p.valor_flow)}${p.valor_editado.flow_mudou ? ' (mudou)' : ''}</div>` : ''}</td>
        <td><span class="chip ${STATUS_PED[p.status].classe}" ${p.apagado ? `title="${esc(p.apagado.justificativa)}"` : ''}>${STATUS_PED[p.status].rotulo}</span></td>
        <td class="nowrap">${p.apagado ? `<button class="btn pequeno" data-restaurar="${esc(p.id)}">Restaurar</button>`
          : `<button class="btn pequeno" data-valor="${esc(p.id)}">Valor</button> <button class="btn pequeno" data-mes-ped="${esc(p.id)}">Mês</button> <button class="btn pequeno" data-margem="${esc(p.id)}">Margem</button> <button class="btn pequeno" data-ajustar="${esc(p.id)}">Ajustar</button> <button class="btn pequeno perigo" data-apagar="${esc(p.id)}">Apagar</button>`}</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="8">Total do filtro</td><td class="n">${brl(total)}</td><td colspan="2"></td></tr></tfoot></table>`
      : `<div class="vazio">${S.pedidos.size ? 'Nenhum pedido neste filtro.' : 'Nenhum pedido ainda. Exporte os pedidos de venda do Flow em Excel e clique em <b>Importar planilha</b>.'}</div>`;
    const ach = (id) => pedidos.find((p) => p.id === id);
    alvo.querySelectorAll('[data-valor]').forEach((b) => { b.onclick = () => editarValor(ach(b.dataset.valor)); });
    alvo.querySelectorAll('[data-mes-ped]').forEach((b) => { b.onclick = () => remanejarModal(ach(b.dataset.mesPed)); });
    alvo.querySelectorAll('[data-margem]').forEach((b) => { b.onclick = () => margemModal(ach(b.dataset.margem)); });
    alvo.querySelectorAll('[data-ajustar]').forEach((b) => { b.onclick = () => ajustarModal(ach(b.dataset.ajustar), pessoas); });
    alvo.querySelectorAll('[data-apagar]').forEach((b) => { b.onclick = () => apagarModal(ach(b.dataset.apagar)); });
    alvo.querySelectorAll('[data-restaurar]').forEach((b) => {
      b.onclick = async () => {
        const p = ach(b.dataset.restaurar);
        if (!(await confirmar(`Restaurar o pedido ${p.numero}?`, 'Ele volta para a lista e para a apuração.', { botao: 'Restaurar' }))) return;
        try { await apagarPedido(p.id, { restaurar: true }); aviso('Pedido restaurado.'); rotear(); } catch (e) { aviso(e.message, 'erro'); }
      };
    });
  };
  desenhar();
  alvo.querySelector('[data-busca]').oninput = (e) => { filtroPed.busca = e.target.value; desenhar(); };
  alvo.querySelector('[data-status]').onchange = (e) => { filtroPed.status = e.target.value; desenhar(); };
  alvo.querySelector('[data-importar]').onclick = () => importarPedidosModal();
}

function ajustarModal(p, pessoas) {
  const a = p.ajuste;
  const { el, fechar } = modal({
    titulo: `Pedido ${p.numero}`, largura: 560,
    corpo: `<p class="intro">${esc(p.cliente_nome || '')} · ${brl(p.valor_total)} · vendedor na planilha: <b>${esc(p.vendedor_flow || 'nenhum')}</b></p>
      <div class="grade" style="--col:1">
        <label class="campo">Atribuir ao vendedor<select name="pessoa_id" id="aj-pessoa">${opcoes(pessoas, a?.pessoa_id, { vazio: '— manter o da planilha —' })}</select></label>
        <label class="marcar"><input type="checkbox" name="excluir" id="aj-excluir" ${a?.excluir ? 'checked' : ''}> Excluir este pedido da apuração</label>
        <label class="campo">Justificativa<textarea name="justificativa" id="aj-just" rows="3">${esc(a?.justificativa || '')}</textarea></label>
        ${p.vendedor_flow && !p.pessoa_nome ? `<div class="alerta info"><div>Dica: se "${esc(p.vendedor_flow)}" é sempre a mesma pessoa, inclua esse nome no campo <b>Nomes no Flow</b> do cadastro do vendedor — todos os pedidos dele passam a ser atribuídos automaticamente.</div></div>` : ''}
      </div>`,
    rodape: `${a ? '<button class="btn perigo" data-remover>Remover ajuste</button>' : ''}<span class="espaco"></span><button class="btn" data-fechar>Cancelar</button><button class="btn primario" data-salvar>Salvar ajuste</button>`,
  });
  el.querySelector('[data-salvar]').onclick = (e) => comBotao(e.target, async () => {
    const d = lerForm(el);
    await ajustarPedido(p.id, { pessoa_id: d.pessoa_id || null, excluir: d.excluir, justificativa: d.justificativa });
    fechar(); aviso('Ajuste salvo.'); rotear();
  });
  el.querySelector('[data-remover]')?.addEventListener('click', async () => {
    if (!(await confirmar('Remover ajuste?', 'O pedido volta a usar o vendedor que vem da planilha.', { botao: 'Remover', perigo: true }))) return;
    try { await ajustarPedido(p.id, { remover: true }); fechar(); aviso('Ajuste removido.'); rotear(); } catch (e) { aviso(e.message, 'erro'); }
  });
}
function editarValor(p) {
  const ed = p.valor_editado;
  const { el, fechar } = modal({
    titulo: `Valor do pedido ${p.numero}`, largura: 520,
    corpo: `<p class="intro">${esc([p.codigo_projeto, p.cliente_nome].filter(Boolean).join(' — '))} · vendedor: <b>${esc(p.pessoa_nome || p.vendedor_flow || '—')}</b></p>
      <table class="conta mb14"><tr><td>Valor na planilha do Flow</td><td>${brl(p.valor_flow)}</td></tr>${ed ? `<tr><td>Valor considerado hoje</td><td><b>${brl(p.valor_total)}</b></td></tr>` : ''}</table>
      <div class="grade" style="--col:1">
        <label class="campo">Valor para a comissão (R$)<input name="valor" id="vl-valor" inputmode="decimal" value="${ed ? String(p.valor_total).replace('.', ',') : ''}" placeholder="ex.: 60.000,00"></label>
        <div data-dif class="nota"></div>
        <label class="campo">Justificativa<textarea name="justificativa" id="vl-just" rows="3" placeholder="ex.: desconto de R$ 10.000,00 devolvido ao cliente">${esc(ed?.justificativa || '')}</textarea></label>
        <div class="alerta info"><div>A alteração vale só para a comissão nesta plataforma — o pedido no Flow não é alterado. Fica registrada na auditoria e aparece no relatório e no recibo.</div></div>
      </div>`,
    rodape: `${ed ? '<button class="btn perigo" data-remover>Voltar ao valor da planilha</button>' : ''}<span class="espaco"></span><button class="btn" data-fechar>Cancelar</button><button class="btn primario" data-salvar>Salvar valor</button>`,
  });
  const inp = el.querySelector('[name=valor]');
  const dif = () => { const v = lerValor(inp.value); el.querySelector('[data-dif]').textContent = v !== null && inp.value ? `Diferença em relação à planilha: ${brl(v - p.valor_flow)}` : ''; };
  inp.oninput = dif; dif();
  el.querySelector('[data-salvar]').onclick = (e) => comBotao(e.target, async () => {
    const v = lerValor(inp.value);
    if (!inp.value || v === null) falha('Informe o valor.');
    await editarValorPedido(p.id, { valor: v, justificativa: el.querySelector('[name=justificativa]').value });
    fechar(); aviso('Valor salvo. A comissão foi recalculada.'); rotear();
  });
  el.querySelector('[data-remover]')?.addEventListener('click', async () => {
    if (!(await confirmar('Voltar ao valor da planilha?', `O pedido volta a contar ${brl(p.valor_flow)} na comissão.`, { botao: 'Voltar', perigo: true }))) return;
    try { await editarValorPedido(p.id, { remover: true }); fechar(); aviso('Valor da planilha restaurado.'); rotear(); } catch (e) { aviso(e.message, 'erro'); }
  });
}
function margemModal(p) {
  const r = p.margem_sup;
  const { el, fechar } = modal({
    titulo: `Margem do pedido ${p.numero}`, largura: 520,
    corpo: `<p class="intro">${esc(p.cliente_nome || '')} · ${brl(p.valor_total)} · vendedor: <b>${esc(p.pessoa_nome || p.vendedor_flow || '—')}</b></p>
      <div class="grade" style="--col:2">
        <label class="campo">Margem (%)<input type="number" step="0.01" min="0" max="100" name="margem" id="mg-margem" value="${r?.margem ?? ''}"></label>
        <label class="campo">Conta na supervisão<input type="text" readonly data-considerado id="mg-cons"></label>
        <label class="campo largo">Observação<input type="text" name="justificativa" id="mg-just" value="${esc(r?.justificativa || '')}" placeholder="ex.: kit pronto com 5,97% de desconto"></label>
      </div>
      <div class="alerta info"><div>Margem de ${MARGEM_MINIMA_SUP}% ou mais: a venda conta integral. Abaixo disso, conta proporcional na base e na meta do supervisor (venda × margem ÷ ${MARGEM_MINIMA_SUP}%). A comissão do vendedor não muda.</div></div>`,
    rodape: `${r ? '<button class="btn perigo" data-remover>Remover margem</button>' : ''}<span class="espaco"></span><button class="btn" data-fechar>Cancelar</button><button class="btn primario" data-salvar>Salvar</button>`,
  });
  const atual = () => { const m = Number(el.querySelector('[name=margem]').value); el.querySelector('[data-considerado]').value = el.querySelector('[name=margem]').value === '' ? '' : brl(valorSup({ valor_total: p.valor_total, margem_sup: { margem: m } })); };
  el.querySelector('[name=margem]').oninput = atual; atual();
  el.querySelector('[data-salvar]').onclick = (e) => comBotao(e.target, async () => { await margemPedido(p.id, lerForm(el)); fechar(); aviso('Margem gravada.'); rotear(); });
  el.querySelector('[data-remover]')?.addEventListener('click', (e) => comBotao(e.currentTarget, async () => { await margemPedido(p.id, { remover: true }); fechar(); aviso('Margem removida.'); rotear(); }));
}
function remanejarModal(p) {
  const atual = competenciaDe(p.data_referencia);
  const r = p.remanejado;
  const sugestao = somarMeses(atual, 1);
  const { el, fechar } = modal({
    titulo: `Remanejar o pedido ${p.numero}`, largura: 520,
    corpo: `<p class="intro">${esc([p.codigo_projeto !== p.numero ? p.codigo_projeto : null, p.cliente_nome].filter(Boolean).join(' — '))} · ${brl(p.valor_total)} · vendedor: <b>${esc(p.pessoa_nome || p.vendedor_flow || '—')}</b></p>
      <table class="conta"><tr><td>Mês atual na comissão</td><td><b>${esc(nomeMes(atual))}</b></td></tr>${r ? `<tr><td>Mês de origem (planilha)</td><td>${esc(nomeMes(r.de))}</td></tr>` : ''}</table>
      <div class="grade" style="--col:2">
        <label class="campo">Mover para<input type="month" name="competencia" id="rm-mes" value="${sugestao}"></label><span></span>
        <label class="campo largo">Justificativa<textarea name="justificativa" id="rm-just" rows="3" placeholder="ex.: venda fechada em outubro, mas o pedido só foi emitido em novembro">${esc(r?.justificativa || '')}</textarea></label>
      </div>
      <div class="alerta info"><div>O pedido sai da comissão de ${esc(nomeMes(atual))} e entra na do mês escolhido — faixa, meta e bandeira dos dois meses são recalculadas. Só na plataforma: o Flow não muda. Reimportar a planilha do mês de origem mantém o remanejamento.</div></div>`,
    rodape: `${r ? '<button class="btn perigo" data-voltar>Voltar ao mês de origem</button>' : ''}<span class="espaco"></span><button class="btn" data-fechar>Cancelar</button><button class="btn primario" data-salvar>Remanejar</button>`,
  });
  el.querySelector('[data-salvar]').onclick = (e) => comBotao(e.target, async () => {
    const d = lerForm(el);
    await remanejarPedido(p.id, d);
    fechar(); aviso(`Pedido ${p.numero} agora conta em ${nomeMes(d.competencia)}.`); rotear();
  });
  el.querySelector('[data-voltar]')?.addEventListener('click', (e) => comBotao(e.currentTarget, async () => {
    await remanejarPedido(p.id, { voltar: true });
    fechar(); aviso(`Pedido ${p.numero} voltou para ${nomeMes(r.de)}.`); rotear();
  }));
}
function apagarModal(p) {
  const { el, fechar } = modal({
    titulo: `Apagar o pedido ${p.numero}?`, largura: 500,
    corpo: `<p class="intro">${esc([p.codigo_projeto, p.cliente_nome].filter(Boolean).join(' — '))} · ${brl(p.valor_total)} · vendedor: <b>${esc(p.pessoa_nome || p.vendedor_flow || '—')}</b></p>
      <div class="grade" style="--col:1">
        <label class="campo">Justificativa<textarea name="justificativa" id="ap-just" rows="3" placeholder="ex.: pedido duplicado, venda desfeita"></textarea></label>
        <div class="alerta info"><div>O pedido sai da lista e da comissão, só nesta plataforma — no Flow ele continua existindo e uma nova importação da planilha não o traz de volta. Para ver ou restaurar, escolha a situação <b>Apagado</b> no filtro.</div></div>
      </div>`,
    rodape: '<span class="espaco"></span><button class="btn" data-fechar>Cancelar</button><button class="btn perigo" data-salvar>Apagar pedido</button>',
  });
  el.querySelector('[data-salvar]').onclick = (e) => comBotao(e.target, async () => {
    await apagarPedido(p.id, { justificativa: el.querySelector('[name=justificativa]').value });
    fechar(); aviso('Pedido apagado da plataforma.'); rotear();
  });
}

// Importação: escolhe o arquivo, confere as colunas, vê a prévia e grava.
function importarPedidosModal() {
  let linhas = null; let proposta = null; let analise = null; let arquivo = '';
  const mesEscolhido = () => el.querySelector('[data-mes]').value;
  const { el, fechar } = modal({
    titulo: 'Importar planilha de pedidos de venda', largura: 900,
    corpo: `<p class="intro">Envie a planilha de pedidos de venda do Flow (<b>.xlsx</b>, <b>.xls</b> ou <b>.csv</b>) e diga de que mês ela é. Bastam as colunas <b>Cliente</b>, <b>Consultor</b> e <b>Valor total</b>.
      <b>Todos os pedidos da planilha entram na comissão do mês escolhido</b>, e ela passa a ser a lista completa daquele mês: o que estava no mês e não veio nela sai.
      Ao reimportar o mesmo mês, os ajustes feitos aqui (valor editado, vendedor atribuído, apagados) são mantidos.</p>
      <div class="barra mt6"><label class="campo">Esta planilha é de qual mês? *<input type="month" id="ip-mes" data-mes class="mes-fixo" value="${esc(estado.competencia)}"></label></div>
      <label class="arquivo" id="ip-zona"><input type="file" accept=".xlsx,.xls,.csv" data-arquivo id="ip-arquivo"><span>${ICONES.planilha}<b>Escolher planilha</b> ou arrastar o arquivo para cá</span></label>
      <div data-mapa></div><div data-previa></div>`,
    rodape: '<span class="espaco"></span><button class="btn" data-fechar>Cancelar</button><button class="btn primario" data-gravar disabled>Importar pedidos</button>',
  });
  const mapaEl = el.querySelector('[data-mapa]'); const previa = el.querySelector('[data-previa]'); const gravar = el.querySelector('[data-gravar]');
  const titulosDoMapa = () => Object.fromEntries(CAMPOS_PEDIDO.map((c) => [c.campo, proposta.mapa[c.campo] === undefined ? '' : proposta.cabecalho[proposta.mapa[c.campo]]]));
  const analisar = () => {
    try {
      analise = analisarPedidos(linhas, proposta, { mes: mesEscolhido() });
      const r = analise.resumo;
      previa.innerHTML = `<div class="barra mt12"><span class="chip ok">${r.novos} novo(s)</span><span class="chip acento">${r.alterados} alterado(s)</span><span class="chip">${r.iguais} sem mudança</span>
          ${r.removidos ? `<span class="chip vermelha">${r.removidos} sai(em) do mês</span>` : ''}<span class="chip ${r.erros ? 'vermelha' : ''}">${r.erros} com erro</span>${r.avisos ? `<span class="chip amarela">${r.avisos} aviso(s)</span>` : ''}
          <span class="nota">${analise.itens.length} pedido(s) · ${brl(analise.total)} → comissão de <b>${esc(nomeMes(analise.mes))}</b></span></div>
        ${analise.erros.length ? `<div class="alerta ${r.erros ? 'erro' : ''}"><div><ul>${analise.erros.slice(0, 12).map((x) => `<li>Linha ${x.linha}: ${esc(x.erro)}</li>`).join('')}${analise.erros.length > 12 ? `<li>… e mais ${analise.erros.length - 12}</li>` : ''}</ul></div></div>` : ''}
        <div class="rolagem previa"><table class="tabela"><thead><tr><th>Pedido / projeto</th><th>Cliente</th><th>Vendedor</th><th>Situação</th><th class="n">Valor</th><th>Ação</th></tr></thead>
          <tbody>${analise.itens.slice(0, 500).map((it) => `<tr><td class="mono">${esc(it.pedido.numero)}</td><td class="quebra">${esc(it.pedido.cliente_nome || '—')}</td>
            <td>${esc(it.pedido.vendedor_flow || '—')}</td><td>${esc(it.pedido.situacao || '—')}</td><td class="n">${brl(it.pedido.valor_total)}</td>
            <td><span class="chip ${it.acao === 'novo' ? 'ok' : it.acao === 'alterado' ? 'acento' : ''}" title="${esc((it.mudancas || []).join(', '))}">${it.acao === 'igual' ? 'sem mudança' : it.acao}</span></td></tr>`).join('')}
            ${analise.remover.slice(0, 300).map((x) => `<tr class="apagado"><td class="mono">${esc(x.pedido.numero || x.id)}</td><td class="quebra">${esc(x.pedido.cliente_nome || '—')}</td>
            <td>${esc(x.pedido.vendedor_flow || '—')}</td><td>${esc(x.pedido.situacao || '—')}</td><td class="n">${brl(x.pedido.valor_total)}</td><td><span class="chip vermelha">sai do mês</span></td></tr>`).join('')}
            ${analise.itens.length || analise.remover.length ? '' : '<tr><td colspan="6" class="vazio">Nenhum pedido na planilha.</td></tr>'}</tbody></table></div>`;
      gravar.disabled = !(r.novos + r.alterados + r.removidos) || r.erros > 0;
    } catch (e) { previa.innerHTML = `<div class="alerta erro"><div>${esc(e.message)}</div></div>`; gravar.disabled = true; }
  };
  const desenharMapa = () => {
    const ops = proposta.cabecalho.map((c, i) => ({ id: String(i), nome: c || `(coluna ${i + 1})` }));
    mapaEl.innerHTML = `<div class="secao">Colunas reconhecidas — confira e ajuste se precisar</div>
      <div class="grade mapa-colunas" style="--col:3">${CAMPOS_PEDIDO.map((c) => `<label class="campo">${esc(c.rotulo)}${['valor_total', 'vendedor', 'cliente_nome'].includes(c.campo) ? ' *' : ''}
        <select data-campo="${c.campo}" id="ip-${c.campo}">${opcoes(ops, proposta.mapa[c.campo] ?? '', { vazio: '— não usar —' })}</select></label>`).join('')}</div>
      <p class="nota mt6">Cabeçalho na linha ${proposta.linhaCabecalho + 1} da planilha. As escolhas ficam salvas para a próxima importação.</p>`;
    mapaEl.querySelectorAll('[data-campo]').forEach((s) => { s.onchange = () => { if (s.value === '') delete proposta.mapa[s.dataset.campo]; else proposta.mapa[s.dataset.campo] = Number(s.value); analisar(); }; });
  };
  const carregar = async (arq) => {
    if (!arq) return;
    if (arq.size > 15e6) { aviso('Arquivo muito grande (máximo 15 MB).', 'erro'); return; }
    arquivo = arq.name;
    previa.innerHTML = '<div class="vazio">Lendo a planilha…</div>'; mapaEl.innerHTML = '';
    try {
      linhas = lerPlanilhaArquivo(await arq.arrayBuffer());
      proposta = proporMapa(linhas);
      el.querySelector('#ip-zona').classList.add('feito');
      el.querySelector('#ip-zona span').innerHTML = `${ICONES.planilha}<b>${esc(arq.name)}</b> · ${linhas.length} linhas · trocar arquivo`;
      desenharMapa(); analisar();
    } catch (e) { previa.innerHTML = `<div class="alerta erro"><div>${esc(e.message)}</div></div>`; gravar.disabled = true; }
  };
  el.querySelector('[data-arquivo]').onchange = (e) => carregar(e.target.files[0]);
  el.querySelector('[data-mes]').onchange = () => { if (proposta) analisar(); };
  const zona = el.querySelector('#ip-zona');
  ['dragover', 'dragleave', 'drop'].forEach((t) => zona.addEventListener(t, (e) => { e.preventDefault(); zona.classList.toggle('sobre', t === 'dragover'); if (t === 'drop') carregar(e.dataTransfer.files[0]); }));
  gravar.onclick = (e) => comBotao(e.target, async () => {
    await gravarPedidos(analise, { arquivo, mapaTitulos: titulosDoMapa() });
    aviso(`${nomeMes(analise.mes)}: ${analise.itens.length} pedido(s) importado(s)${analise.resumo.removidos ? `, ${analise.resumo.removidos} retirado(s)` : ''}.`);
    if (estado.competencia !== analise.mes) irParaMes(analise.mes);
    fechar(); rotear();
  });
}

/* ================= tela: bandeiras ================= */
function telaBandeiras(alvo) {
  const d = painelBandeiras(estado.competencia, 12);
  const comAlerta = d.linhas.filter((l) => l.atual?.alerta);
  const celula = (m) => {
    if (m.atingimento === null || m.atingimento === undefined || !m.bandeira) return '<td class="celula"><span class="cel nada">—</span></td>';
    const t = [m.evento, m.meta ? `meta ${brl(m.meta)}` : '', m.total !== null && m.total !== undefined ? `vendido ${brl(m.total)}` : '', m.congelado ? 'mês fechado' : 'mês aberto'].filter(Boolean).join(' · ');
    return `<td class="celula"><span class="cel ${m.bandeira}" title="${esc(t)}">${pct(m.atingimento, 0)}${m.congelado || m.alerta ? `<small>${m.congelado ? 'fechado' : ''}${m.alerta ? ' ⚠' : ''}</small>` : ''}</span></td>`;
  };
  alvo.innerHTML = `
    <div class="barra"><div class="legenda">
      <span><span class="chip ok"><span class="ponto"></span>Normal</span></span>
      <span><span class="chip amarela"><span class="ponto"></span>Amarela</span> 50% a 70% da meta</span>
      <span><span class="chip vermelha"><span class="ponto"></span>Vermelha</span> abaixo de 50%, ou 2 meses seguidos em Amarela</span>
      <span>Recupera com 81% ou mais no mês seguinte</span><span>Gestores: amarela de 50% a 79% da meta da base</span></div></div>
    ${comAlerta.length ? `<div class="alerta erro"><div><b>Atenção em ${esc(nomeMes(estado.competencia))}</b><ul>${comAlerta.map((l) => `<li>${esc(l.nome)}: ${esc(l.atual.evento)} — ${l.atual.alerta === 'desligamento' ? 'passível de desligamento' : 'passível de liberação ao mercado'}</li>`).join('')}</ul></div></div>` : ''}
    <div class="painel"><div class="painel-cab"><h2>Últimos 12 meses até ${esc(nomeMes(estado.competencia))}</h2><span class="espaco"></span><span class="nota-cab">Cada célula: % da meta e a bandeira resultante ao fechar o mês</span></div>
      <div class="rolagem">${d.linhas.length ? `<table class="tabela matriz"><thead><tr><th>Vendedor</th><th>Unidade</th><th>Gestor</th>${d.competencias.map((c) => `<th class="centro">${mesCurto(c)}</th>`).join('')}<th>Situação atual</th></tr></thead>
        <tbody>${d.linhas.map((l) => `<tr><td><b>${esc(l.nome)}</b>${l.gestor_cargo ? ' <span class="chip gestor">gestor</span>' : ''}<div class="sub">${esc(l.cargo || '')}${l.gestor_cargo ? ' · meta da base' : ''}</div></td>
          <td>${esc(l.unidade || '—')}</td><td>${esc(l.gestor || '—')}</td>${l.meses.map(celula).join('')}
          <td>${chipBandeira(l.atual?.bandeira)}${l.atual?.alerta ? ` <span class="chip vermelha">${l.atual.alerta === 'desligamento' ? 'desligamento' : 'liberação'}</span>` : ''}</td></tr>`).join('')}</tbody></table>`
        : '<div class="vazio">Nenhum vendedor ativo com cargo que use meta.</div>'}</div></div>`;
}

/* ================= telas: vendedores, unidades, cargos e configurações ================= */
const filtroVend = { busca: '', unidade: '', aba: 'ativos' };
const TIPOS_PIX_OP = [{ id: 'cpf', nome: 'CPF' }, { id: 'email', nome: 'E-mail' }, { id: 'telefone', nome: 'Telefone' }, { id: 'aleatoria', nome: 'Chave aleatória' }, { id: 'cnpj', nome: 'CNPJ' }];
const fone = (t) => { const d = String(t || ''); if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`; if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`; return d || '—'; };

function telaVendedores(alvo) {
  const ativos = listarPessoas(); const desligados = listarPessoas({ situacao: 'desligados' });
  const unidades = listarUnidades(); const cargos = listarCargos(); const aba = filtroVend.aba;
  alvo.innerHTML = `
    <div class="barra">
      <div class="abas"><button class="aba ${aba === 'ativos' ? 'ativa' : ''}" data-aba="ativos">Ativos <span>${ativos.length}</span></button>
        <button class="aba ${aba === 'desligados' ? 'ativa' : ''}" data-aba="desligados">Desligados <span>${desligados.length}</span></button></div>
      <input type="search" placeholder="Buscar por nome" data-busca id="vd-busca" value="${esc(filtroVend.busca)}">
      <select data-unidade id="vd-unidade">${opcoes(unidades, filtroVend.unidade, { vazio: 'Todas as unidades' })}</select>
      <span class="espaco"></span>
      <button class="btn" data-importar id="vd-importar">${ICONES.subir}Importar planilha</button>
      <button class="btn primario" data-novo id="vd-novo">${ICONES.mais}Novo colaborador</button>
    </div>
    ${aba === 'desligados' ? '<div class="alerta info"><div>Colaboradores desligados ficam aqui com todo o histórico (vendas, apurações, recibos e pagamentos). Use <b>Resgatar</b> para readmitir.</div></div>' : ''}
    <div class="painel"><div class="rolagem" data-tabela></div></div>`;
  const desenhar = () => {
    const b = filtroVend.busca.toLowerCase();
    const lista = (aba === 'desligados' ? desligados : ativos).filter((p) => (!b || p.nome.toLowerCase().includes(b)) && (!filtroVend.unidade || p.unidade_id === filtroVend.unidade));
    const t = alvo.querySelector('[data-tabela]');
    if (!lista.length) { t.innerHTML = `<div class="vazio">${aba === 'desligados' ? 'Nenhum colaborador desligado.' : 'Nenhum vendedor cadastrado neste filtro.'}</div>`; return; }
    t.innerHTML = aba === 'desligados' ? `<table class="tabela"><thead><tr><th>Nome</th><th>Última unidade</th><th>Último cargo</th><th>Início</th><th>Desligado em</th><th>Motivo</th><th></th></tr></thead>
      <tbody>${lista.map((p) => `<tr><td><b>${esc(p.nome)}</b></td><td>${esc(p.unidade_nome || '—')}</td><td>${esc(p.cargo_nome || '—')}</td><td>${data(p.data_inicio)}</td>
        <td>${data(p.desligado_em)}</td><td class="quebra">${esc(p.motivo_desligamento || '—')}</td>
        <td class="dir nowrap"><button class="btn pequeno" data-ver="${esc(p.id)}">Ver cadastro</button> <button class="btn pequeno primario" data-resgatar="${esc(p.id)}">Resgatar</button></td></tr>`).join('')}</tbody></table>`
      : `<table class="tabela"><thead><tr><th>Nome</th><th>Unidade</th><th>Gestor</th><th>Cargo / faixa</th><th>Início</th><th class="n">Salário base</th><th>CPF</th><th>E-mail</th><th>Telefone</th><th>Pix</th><th>Nomes no Flow</th></tr></thead>
      <tbody>${lista.map((p) => `<tr class="clicavel" data-id="${esc(p.id)}">
        <td><b>${esc(p.nome)}</b> ${p.supervisor ? '<span class="chip acento">supervisor</span>' : ''} ${p.vendedor ? '' : '<span class="chip">não vende</span>'}</td>
        <td>${esc(p.unidade_nome || '—')}</td><td>${p.responsavel_da_propria_unidade ? '<span class="fraco">responsável da unidade</span>' : esc(p.gestor_nome || '—')}</td>
        <td>${esc(p.cargo_nome || '—')}</td><td>${data(p.data_inicio)}</td>
        <td class="n">${p.salario_base !== null && p.salario_base !== undefined ? brl(p.salario_base) : '<span class="fraco">do cargo</span>'}</td>
        <td class="mono">${esc(p.cpf_mascarado || '—')}</td><td>${esc(p.email || '—')}</td><td>${fone(p.telefone)}</td>
        <td>${p.pix_cadastrado ? '<span class="chip ok">cadastrado</span>' : '<span class="fraco">—</span>'}</td>
        <td class="quebra pequena">${esc(p.nomes_flow.join(' · '))}</td></tr>`).join('')}</tbody></table>`;
    alvo.querySelectorAll('[data-id]').forEach((tr) => { tr.onclick = () => formularioPessoa(tr.dataset.id, unidades, cargos); });
    alvo.querySelectorAll('[data-ver]').forEach((b) => { b.onclick = () => formularioPessoa(b.dataset.ver, unidades, cargos); });
    alvo.querySelectorAll('[data-resgatar]').forEach((b) => { b.onclick = () => resgatar(desligados.find((p) => p.id === b.dataset.resgatar), unidades, cargos); });
  };
  desenhar();
  alvo.querySelectorAll('[data-aba]').forEach((b) => { b.onclick = () => { filtroVend.aba = b.dataset.aba; rotear(); }; });
  alvo.querySelector('[data-busca]').oninput = (e) => { filtroVend.busca = e.target.value; desenhar(); };
  alvo.querySelector('[data-unidade]').onchange = (e) => { filtroVend.unidade = e.target.value; desenhar(); };
  alvo.querySelector('[data-novo]').onclick = () => formularioPessoa(null, unidades, cargos);
  alvo.querySelector('[data-importar]').onclick = () => importarColaboradoresModal();
}
const ACAO_IMP = { criar: ['ok', 'criar'], atualizar: ['acento', 'atualizar'], erro: ['vermelha', 'erro'] };
function importarColaboradoresModal() {
  let linhas = null;
  const { el, fechar } = modal({
    titulo: 'Importar colaboradores', largura: 860,
    corpo: `<p class="intro">Envie uma planilha <b>.xlsx</b> ou <b>.csv</b> com uma linha por colaborador. Colunas reconhecidas: Nome completo, CPF, E-mail, Telefone, Unidade (nome ou sigla), Cargo (nome exato), Data de início, Salário base, Tipo da chave Pix, Chave Pix, Nomes no Flow.
      Se o CPF (ou o nome) já existir, o cadastro é <b>atualizado</b> só com o que vier preenchido.</p>
      <div class="barra"><input type="file" accept=".xlsx,.xls,.csv" data-arquivo id="ic-arquivo"><button class="btn pequeno" data-modelo>${ICONES.baixar}Baixar modelo</button></div>
      <div data-previa></div>`,
    rodape: '<span class="espaco"></span><button class="btn" data-fechar>Cancelar</button><button class="btn primario" data-gravar disabled>Importar linhas válidas</button>',
  });
  const previa = el.querySelector('[data-previa]'); const gravar = el.querySelector('[data-gravar]');
  const mostrar = (r) => {
    previa.innerHTML = `<div class="barra"><span class="chip ok">${r.resumo.criar} novo(s)</span><span class="chip acento">${r.resumo.atualizar} atualização(ões)</span>
      <span class="chip ${r.resumo.erros ? 'vermelha' : ''}">${r.resumo.erros} com erro</span>${r.gravado ? '<b class="tom-ok">Importação concluída.</b>' : '<span class="nota">Prévia — nada foi gravado ainda.</span>'}</div>
      <div class="rolagem previa"><table class="tabela"><thead><tr><th class="n">Linha</th><th>Nome</th><th>Ação</th><th>Observação</th></tr></thead>
      <tbody>${r.linhas.map((l) => `<tr><td class="n">${l.linha}</td><td>${esc(l.nome || '—')}</td><td><span class="chip ${ACAO_IMP[l.acao][0]}">${ACAO_IMP[l.acao][1]}</span></td>
        <td class="quebra ${l.erro ? 'tom-vermelha' : ''}">${esc(l.erro || l.avisos.join(' · ') || '')}</td></tr>`).join('') || '<tr><td colspan="4" class="vazio">Nenhuma linha encontrada.</td></tr>'}</tbody></table></div>`;
    gravar.disabled = r.gravado || !(r.resumo.criar + r.resumo.atualizar);
  };
  el.querySelector('[data-modelo]').onclick = (e) => comBotao(e.currentTarget, () => baixar('Modelo colaboradores - Comissoes LZ7.csv', modeloColaboradoresCsv()));
  el.querySelector('[data-arquivo]').onchange = async (e) => {
    const arq = e.target.files[0]; if (!arq) return;
    previa.innerHTML = '<div class="vazio">Lendo a planilha…</div>';
    try { linhas = lerPlanilhaArquivo(await arq.arrayBuffer()); mostrar(await processarColaboradores(linhas, { gravar: false })); }
    catch (err) { previa.innerHTML = `<div class="alerta erro"><div>${esc(err.message)}</div></div>`; gravar.disabled = true; }
  };
  gravar.onclick = (e) => comBotao(e.target, async () => {
    const r = await processarColaboradores(linhas, { gravar: true });
    mostrar(r); aviso(`${r.resumo.criar} criado(s), ${r.resumo.atualizar} atualizado(s).`);
    await registrarAuditoria({ entidade: 'importacao', acao: 'importar_pessoas', para: r.resumo });
    el.querySelector('[data-fechar]').textContent = 'Fechar';
  });
}
function desligarModal(p, fecharForm) {
  const { el, fechar } = modal({
    titulo: `Excluir ${p.nome}`, largura: 520,
    corpo: `<p class="intro">O colaborador sai da lista de ativos e vai para a aba <b>Desligados</b>. Nada é apagado: vendas, apurações, recibos e pagamentos continuam no histórico, e ele pode ser resgatado depois.</p>
      ${p.responsavel_de?.length ? `<div class="alerta"><div>É responsável por <b>${esc(p.responsavel_de.join(', '))}</b>. A unidade ficará sem responsável a partir do dia seguinte ao desligamento — defina o novo em Unidades.</div></div>` : ''}
      <div class="grade" style="--col:2"><label class="campo">Data do desligamento<span class="dica">vendas emitidas até esta data continuam sendo dele</span><input type="date" name="data" id="dl-data" value="${hojeSP()}"></label>
        <label class="campo largo">Motivo<textarea name="motivo" id="dl-motivo" rows="2" placeholder="Opcional"></textarea></label></div>`,
    rodape: '<button class="btn" data-fechar>Cancelar</button><button class="btn perigo" data-ok>Excluir colaborador</button>',
  });
  el.querySelector('[data-ok]').onclick = (e) => comBotao(e.target, async () => {
    const r = await desligarPessoa(p.id, lerForm(el));
    fechar(); fecharForm?.();
    aviso(r.unidades_sem_responsavel?.length ? `Colaborador excluído. ${r.unidades_sem_responsavel.join(', ')} ficou sem responsável.` : 'Colaborador movido para Desligados.');
    rotear();
  });
}
function resgatar(p, unidades, cargos) {
  const minimo = p.desligado_em ? diaMais(p.desligado_em, 1) : hojeSP();
  const padrao = hojeSP() > minimo ? hojeSP() : minimo;
  const { el, fechar } = modal({
    titulo: `Resgatar ${p.nome}`, largura: 560,
    corpo: `<p class="intro">Desligado em ${data(p.desligado_em)}. O colaborador volta com o histórico completo; os meses em que esteve desligado não geram meta nem bandeira.</p>
      <div class="grade" style="--col:2"><label class="campo">Data de retorno<input type="date" name="data" id="rg-data" value="${padrao}" min="${minimo}"></label><span></span>
        <label class="campo">Unidade<select name="unidade_id" id="rg-unidade">${opcoes(unidades.filter((u) => u.ativa), p.unidade_id, { vazio: 'Escolha…' })}</select></label>
        <label class="campo">Cargo / faixa<select name="cargo_id" id="rg-cargo">${opcoes(cargos.filter((c) => c.ativo), p.cargo_id, { vazio: 'Escolha…' })}</select></label>
        <label class="marcar largo"><input type="checkbox" name="reiniciar_rampagem" id="rg-ramp"> Reiniciar rampagem de metas a partir do retorno (1º mês = mês do retorno)</label></div>`,
    rodape: '<button class="btn" data-fechar>Cancelar</button><button class="btn primario" data-ok>Resgatar</button>',
  });
  el.querySelector('[data-ok]').onclick = (e) => comBotao(e.target, async () => {
    const d = lerForm(el);
    await readmitirPessoa(p.id, { ...d, unidade_id: d.unidade_id || null, cargo_id: d.cargo_id || null });
    fechar(); filtroVend.aba = 'ativos'; aviso(`${p.nome} está ativo novamente.`); rotear();
  });
}
function formularioPessoa(id, unidades, cargos) {
  const p = id ? obterPessoa(id) : { vendedor: true, ativo: true, nomes_flow: [] };
  const original = { unidade_id: p.unidade_id, cargo_id: p.cargo_id };
  const cargosAtivos = cargos.filter((c) => c.ativo || c.id === p.cargo_id);
  const { el, fechar } = modal({
    titulo: id ? p.nome : 'Novo colaborador', largura: 760,
    corpo: `<div class="secao">Dados pessoais</div>
      <div class="grade" style="--col:3">
        <label class="campo dois">Nome completo<input type="text" name="nome" id="ps-nome" value="${esc(p.nome || '')}"></label>
        <label class="campo">CPF<input type="text" name="cpf" id="ps-cpf" inputmode="numeric" value="${esc(p.cpf || '')}" placeholder="000.000.000-00"></label>
        <label class="campo dois">E-mail<input type="email" name="email" id="ps-email" value="${esc(p.email || '')}"></label>
        <label class="campo">Telefone<input type="tel" name="telefone" id="ps-tel" value="${esc(p.telefone || '')}" placeholder="(43) 99999-9999"></label>
        <label class="campo">Tipo da chave Pix<select name="pix_tipo" id="ps-pixtipo">${opcoes(TIPOS_PIX_OP, p.pix_tipo, { vazio: '—' })}</select></label>
        <label class="campo dois">Chave Pix<input type="text" name="pix_chave" id="ps-pix" value="${esc(p.pix_chave || '')}"></label>
      </div>
      ${id && !p.ativo ? `<div class="alerta mt12"><div>Desligado em ${data(p.desligado_em)}${p.motivo_desligamento ? ` — ${esc(p.motivo_desligamento)}` : ''}. Unidade e cargo mudam só no resgate.</div></div>` : ''}
      <div class="secao">Vínculo comercial</div>
      <div class="grade" style="--col:3">
        <label class="campo">Unidade<select name="unidade_id" id="ps-unidade">${opcoes(unidades.filter((u) => u.ativa || u.id === p.unidade_id), p.unidade_id, { vazio: 'Escolha…' })}</select></label>
        <label class="campo">Gestor<span class="dica">automático: responsável da unidade</span><input type="text" data-gestor id="ps-gestor" readonly></label>
        <label class="campo">Cargo / faixa de comissão<select name="cargo_id" id="ps-cargo">${opcoes(cargosAtivos, p.cargo_id, { vazio: 'Escolha…' })}</select></label>
        <label class="campo">Data de início<span class="dica">o mês de início é o 1º mês da rampagem de metas</span><input type="date" name="data_inicio" id="ps-inicio" value="${esc(p.data_inicio || '')}"></label>
        <label class="campo">Salário base (R$)<span class="dica" data-dica-salario>vazio = usa o salário fixo do cargo</span><input type="number" step="0.01" min="0" name="salario_base" id="ps-salario" value="${p.salario_base ?? ''}"></label>
        <label class="campo" data-vigencia hidden>Mudança vale a partir de<span class="dica">meses anteriores continuam com o vínculo antigo</span><input type="date" name="vigencia" id="ps-vigencia" value="${hojeSP()}"></label>
        <div class="campo marcas"><label class="marcar"><input type="checkbox" name="vendedor" id="ps-vendedor" ${p.vendedor ? 'checked' : ''}> Participa da apuração de vendas</label>
          <label class="marcar"><input type="checkbox" name="supervisor" id="ps-supervisor" ${p.supervisor ? 'checked' : ''}> Supervisor</label>
          <label class="marcar"><input type="checkbox" name="isento_cooperativa" id="ps-isento" ${p.isento_cooperativa ? 'checked' : ''}> Sem taxa da cooperativa (CLT/INSS)</label></div>
        <label class="campo largo">Nomes no Flow<span class="dica">um por linha — como o vendedor aparece na coluna de vendedor/consultor da planilha. O nome completo já é incluído.</span>
          <textarea name="nomes_flow" id="ps-nomes" rows="2">${esc((p.nomes_flow || []).filter((n) => n !== p.nome).join('\n'))}</textarea></label>
        <label class="campo largo">Observações<textarea name="observacoes" id="ps-obs" rows="2">${esc(p.observacoes || '')}</textarea></label>
      </div>
      ${p.responsavel_de?.length ? `<div class="alerta info mt12"><div>Responsável por: <b>${esc(p.responsavel_de.join(', '))}</b>. A troca de responsável é feita em Unidades.</div></div>` : ''}
      ${p.vinculos?.length ? `<div class="secao">Histórico de vínculos</div><ul class="historico">${p.vinculos.map((v) => (v.desligamento ? `<li><b>desligado</b> a partir de ${data(v.inicio)}${v.motivo ? ` — ${esc(v.motivo)}` : ''}</li>`
        : `<li>desde ${v.inicio === '2000-01-01' ? 'o cadastro' : data(v.inicio)}: ${esc(v.unidade || 'sem unidade')} · ${esc(v.cargo || 'sem cargo')}</li>`)).join('')}</ul>` : ''}`,
    rodape: `${id && p.ativo ? '<button class="btn perigo" data-excluir>Excluir colaborador</button>' : ''}<span class="espaco"></span><button class="btn" data-fechar>Cancelar</button><button class="btn primario" data-salvar>Salvar</button>`,
  });
  el.querySelector('[data-excluir]')?.addEventListener('click', () => desligarModal(p, fechar));
  if (id && !p.ativo) el.querySelectorAll('[name=unidade_id], [name=cargo_id]').forEach((x) => { x.disabled = true; });
  const selU = el.querySelector('[name=unidade_id]'); const selC = el.querySelector('[name=cargo_id]');
  const atualizar = () => {
    const c = cargos.find((x) => x.id === selC.value);
    el.querySelector('[data-dica-salario]').textContent = c?.regra?.salario_fixo ? `vazio = usa o do cargo (${brl(c.regra.salario_fixo)})` : 'vazio = usa o salário fixo do cargo';
    const u = unidades.find((x) => x.id === selU.value);
    el.querySelector('[data-gestor]').value = !u ? '' : !u.responsavel_id ? 'unidade sem responsável' : u.responsavel_id === id ? 'é o responsável da unidade' : u.responsavel_nome;
    el.querySelector('[data-vigencia]').hidden = !(id && p.ativo && ((original.unidade_id || '') !== selU.value || (original.cargo_id || '') !== selC.value));
  };
  selU.onchange = atualizar; selC.onchange = atualizar; atualizar();
  el.querySelector('[data-salvar]').onclick = (e) => comBotao(e.target, async () => {
    const d = lerForm(el);
    d.nomes_flow = d.nomes_flow.split('\n').map((s) => s.trim()).filter(Boolean);
    d.unidade_id = d.unidade_id || null; d.cargo_id = d.cargo_id || null;
    if (el.querySelector('[data-vigencia]').hidden) delete d.vigencia;
    if (id && !p.ativo) { d.unidade_id = p.unidade_id; d.cargo_id = p.cargo_id; }
    if (id) await atualizarPessoa(id, d); else await criarPessoa(d);
    fechar(); aviso('Cadastro salvo.'); rotear();
  });
}

/* ---------- unidades ---------- */
function telaUnidades(alvo) {
  const unidades = listarUnidades(); const pessoas = listarPessoas();
  alvo.innerHTML = `<div class="barra"><span class="nota">Os vendedores de uma unidade passam automaticamente a responder ao responsável dela.</span><span class="espaco"></span>
      <button class="btn primario" data-nova id="un-nova">${ICONES.mais}Nova unidade</button></div>
    <div class="painel"><div class="rolagem"><table class="tabela"><thead><tr><th>Unidade</th><th>Sigla</th><th>Responsável (supervisor)</th><th>Desde</th><th class="n">Pessoas ativas</th><th>Histórico</th><th></th></tr></thead>
      <tbody>${unidades.map((u) => `<tr><td><b>${esc(u.nome)}</b> ${u.ativa ? '' : '<span class="chip">inativa</span>'}</td><td>${esc(u.sigla || '—')}</td>
        <td>${u.responsavel_nome ? esc(u.responsavel_nome) : '<span class="chip amarela">sem responsável</span>'}</td><td>${data(u.responsavel_desde)}</td><td class="n">${u.pessoas}</td>
        <td class="quebra pequena">${u.historico.slice(0, 3).map((h) => `${esc(h.nome)} (${data(h.inicio)}${h.fim ? ` a ${data(h.fim)}` : ' em diante'})`).join('<br>') || '—'}</td>
        <td class="dir nowrap"><button class="btn pequeno" data-resp="${esc(u.id)}">Trocar responsável</button> <button class="btn pequeno" data-editar="${esc(u.id)}">Editar</button></td></tr>`).join('')}</tbody></table></div></div>`;
  alvo.querySelector('[data-nova]').onclick = () => editarUnidade(null);
  alvo.querySelectorAll('[data-editar]').forEach((b) => { b.onclick = () => editarUnidade(unidades.find((u) => u.id === b.dataset.editar)); });
  alvo.querySelectorAll('[data-resp]').forEach((b) => { b.onclick = () => trocarResponsavel(unidades.find((u) => u.id === b.dataset.resp), pessoas); });
}
function editarUnidade(u) {
  const { el, fechar } = modal({
    titulo: u ? `Editar ${u.nome}` : 'Nova unidade', largura: 480,
    corpo: `<div class="grade" style="--col:2"><label class="campo largo">Nome<input type="text" name="nome" id="ue-nome" value="${esc(u?.nome || '')}"></label>
      <label class="campo">Sigla<input type="text" name="sigla" id="ue-sigla" value="${esc(u?.sigla || '')}" maxlength="6"></label>
      <div class="campo fim">${u ? `<label class="marcar"><input type="checkbox" name="ativa" id="ue-ativa" ${u.ativa ? 'checked' : ''}> Ativa</label>` : ''}</div></div>`,
    rodape: '<button class="btn" data-fechar>Cancelar</button><button class="btn primario" data-salvar>Salvar</button>',
  });
  el.querySelector('[data-salvar]').onclick = (e) => comBotao(e.target, async () => { await salvarUnidade(lerForm(el), u?.id || null); fechar(); aviso('Unidade salva.'); rotear(); });
}
function trocarResponsavel(u, pessoas) {
  const { el, fechar } = modal({
    titulo: `Responsável — ${u.nome}`, largura: 520,
    corpo: `<p class="intro">Atual: <b>${esc(u.responsavel_nome || 'nenhum')}</b>. Qualquer pessoa cadastrada pode ser responsável; quem assume recebe o título de supervisor.</p>
      <div class="grade" style="--col:2"><label class="campo largo">Novo responsável<select name="pessoa_id" id="rs-pessoa">${opcoes(pessoas, u.responsavel_id, { vazio: '— sem responsável —' })}</select></label>
        <label class="campo">Vale a partir de<span class="dica">o anterior responde até a véspera</span><input type="date" name="inicio" id="rs-inicio" value="${hojeSP()}"></label></div>`,
    rodape: '<button class="btn" data-fechar>Cancelar</button><button class="btn primario" data-salvar>Confirmar</button>',
  });
  el.querySelector('[data-salvar]').onclick = (e) => comBotao(e.target, async () => { const d = lerForm(el); await definirResponsavel(u.id, d.pessoa_id || null, d.inicio); fechar(); aviso('Responsável atualizado.'); rotear(); });
}

/* ---------- cargos e faixas ---------- */
const brlK = (v) => (v >= 1000 ? `${(v / 1000).toLocaleString('pt-BR')}k` : String(v));
function resumoFaixas(r) {
  if (!r) return '—';
  if (r.tipo === 'gestor') return [r.percentual_base ? `${pct(r.percentual_base)} sobre a base` : null, r.bonus_faixas.length ? `bônus em ${r.bonus_faixas.length} faixas (${brlK(r.bonus_faixas[0].a_partir)}+)` : null, r.percentual_diretas ? `${pct(r.percentual_diretas)} vendas diretas` : null].filter(Boolean).join(' · ');
  if (r.tipo === 'fixo') return `${pct(r.percentual_fixo)} fixo`;
  return r.faixas.map((f) => `${f.ate === null ? '>' : '≤'}${f.ate === null ? brlK(r.faixas[r.faixas.length - 2]?.ate || 0) : brlK(f.ate)}: ${pct(f.percentual)}`).join(' · ') + (r.modo_faixas === 'escalonado' ? ' (escalonado)' : '');
}
function telaCargos(alvo) {
  const cargos = listarCargos();
  alvo.innerHTML = `<div class="barra"><span class="nota">Cada cargo tem sua regra. Ao mudar uma regra, escolha a partir de qual competência ela vale — meses anteriores continuam com a regra antiga.</span><span class="espaco"></span>
      <button class="btn" data-novo-gestor id="cg-gestor">${ICONES.mais}Novo cargo de gestor</button><button class="btn primario" data-novo id="cg-novo">${ICONES.mais}Novo cargo de vendedor</button></div>
    <div class="painel"><div class="rolagem"><table class="tabela"><thead><tr><th>Cargo</th><th>Comissão</th><th class="n">Taxa coop.</th><th>Bônus</th><th>Meta</th><th>Bandeiras</th><th class="n">Salário fixo</th><th>Vigente desde</th><th class="n">Pessoas</th></tr></thead>
      <tbody>${cargos.map((c) => { const r = c.regra; return `<tr class="clicavel" data-id="${esc(c.id)}">
        <td><b>${esc(c.nome)}</b> ${c.ativo ? '' : '<span class="chip">inativo</span>'} ${c.publico === 'gestor' ? '<span class="chip acento">gestor</span>' : ''}</td>
        <td class="quebra pequena">${esc(resumoFaixas(r))}</td>
        <td class="n">${r ? (r.taxa_cooperativa ? pct(r.taxa_cooperativa) : '<span class="chip amarela">0% — definir</span>') : '—'}</td>
        <td>${r?.tipo === 'gestor' ? (r.bonus_faixas.length ? `${brl(r.bonus_faixas[0].valor)} a ${brl(r.bonus_faixas[r.bonus_faixas.length - 1].valor)}` : '—') : r?.bonus ? `${brl(r.bonus.valor)} a partir de ${brl(r.bonus.gatilho)}` : '<span class="fraco">—</span>'}</td>
        <td>${r?.tipo === 'gestor' ? 'soma das metas da equipe' : r?.meta?.usa ? `${r.meta.rampagem.map(brlK).join(' → ')}${r.meta.rampagem.length ? ' → ' : ''}${brlK(r.meta.padrao)}` : '<span class="fraco">sem meta</span>'}</td>
        <td>${r?.bandeiras?.usa ? 'sim' : '<span class="fraco">não</span>'}</td><td class="n">${r?.salario_fixo ? brl(r.salario_fixo) : '—'}</td>
        <td>${esc(c.vigente_desde || '—')}${c.versoes.length > 1 ? ` <span class="fraco">(${c.versoes.length} versões)</span>` : ''}</td><td class="n">${c.pessoas}</td></tr>`; }).join('')}</tbody></table></div></div>`;
  alvo.querySelector('[data-novo]').onclick = () => editarCargo(null);
  alvo.querySelector('[data-novo-gestor]').onclick = () => editarGestor(null);
  alvo.querySelectorAll('[data-id]').forEach((tr) => { tr.onclick = () => { const c = cargos.find((x) => x.id === tr.dataset.id); if (c.publico === 'gestor' || c.regra?.tipo === 'gestor') editarGestor(c); else editarCargo(c); }; });
}
const PADRAO_CARGO = { tipo: 'faixas', modo_faixas: 'total', percentual_fixo: 0, faixas: [{ ate: 50000, percentual: 0 }, { ate: 100000, percentual: 1.5 }, { ate: null, percentual: 2 }], taxa_cooperativa: 0, bonus: null, salario_fixo: 0, beneficios: 0, meta: { usa: false, rampagem: [], padrao: 0 }, bandeiras: { usa: false, limite_vermelha: 50, limite_amarela: 71, limite_recuperacao: 81, zona_intermediaria: 'manter' } };
const GESTOR_PADRAO = { tipo: 'gestor', percentual_base: 0.25, percentual_diretas: 2, minimo_vendedores: 4, bonus_faixas: [{ a_partir: 700000, valor: 1500 }], base: { modo: 'propria', unidades: [] }, equilibrio: { usa: false, minimo_unidades: 2, percentual_meta: 80 }, taxa_cooperativa: 0, salario_fixo: 7000, beneficios: 0, bandeiras: { usa: true, limite_vermelha: 50, limite_amarela: 80, limite_recuperacao: 81, zona_intermediaria: 'manter' } };
const vv = (x) => (x === null || x === undefined ? '' : x);
// Lista editável de benefícios (aparece no recibo como informativo, fora do valor pago).
const secaoBeneficiosHtml = `<div class="secao">Benefícios (informativo — pagos fora do recibo de comissão)</div>
  <table class="faixas-editor beneficios-editor"><tbody data-beneficios></tbody></table><button class="btn pequeno mt6" data-add-beneficio>${ICONES.mais}Benefício</button>
  <p class="nota mt6">Aparecem no recibo e no relatório discriminados da comissão e do bônus, como na proposta. Valor vazio = sem valor fixo (ex.: reembolso mediante comprovante).</p>`;
function montarEditorBeneficios(el, lista) {
  const tb = el.querySelector('[data-beneficios]');
  const desenhar = () => {
    tb.innerHTML = lista.map((b, i) => `<tr><td><input type="text" data-bn="${i}" value="${esc(b.nome)}" placeholder="Ex.: Vale Alimentação"></td>
      <td>R$ <input type="number" step="0.01" min="0" data-bv="${i}" value="${vv(b.valor)}" class="curto" placeholder="—"></td>
      <td><input type="text" data-bf="${i}" value="${esc(b.forma || '')}" placeholder="forma de pagamento"></td><td><button class="btn-link" data-br="${i}">remover</button></td></tr>`).join('')
      || '<tr><td class="fraco" colspan="4">Nenhum benefício.</td></tr>';
    tb.querySelectorAll('[data-bn]').forEach((x) => { x.oninput = () => { lista[x.dataset.bn].nome = x.value; }; });
    tb.querySelectorAll('[data-bv]').forEach((x) => { x.oninput = () => { lista[x.dataset.bv].valor = x.value === '' ? null : Number(x.value); }; });
    tb.querySelectorAll('[data-bf]').forEach((x) => { x.oninput = () => { lista[x.dataset.bf].forma = x.value; }; });
    tb.querySelectorAll('[data-br]').forEach((x) => { x.onclick = () => { lista.splice(Number(x.dataset.br), 1); desenhar(); }; });
  };
  el.querySelector('[data-add-beneficio]').onclick = () => { lista.push({ nome: '', valor: null, forma: 'Pix' }); desenhar(); };
  desenhar();
  return lista;
}
const versoesHtml = (c) => (c?.versoes?.length ? `<div class="secao">Versões da regra</div><ul class="historico">${c.versoes.map((x) => `<li>a partir de ${esc(x.vigente_desde)}${x.criado_por ? ` — ${esc(quem(x.criado_por))}` : ''}</li>`).join('')}</ul>` : '');

function editarGestor(c) {
  const unidades = listarUnidades();
  const r = clonar(c?.regra?.tipo === 'gestor' ? c.regra : GESTOR_PADRAO);
  const { el, fechar } = modal({
    titulo: c ? c.nome : 'Novo cargo de gestor', largura: 840,
    corpo: `<div class="grade" style="--col:3"><label class="campo dois">Nome do cargo<input type="text" name="nome" id="gg-nome" value="${esc(c?.nome || '')}" placeholder="Ex.: Supervisor Comercial"></label>
        <label class="campo">Regra vale a partir de<span class="dica">competência</span><input type="month" name="vigente_desde" id="gg-vig" value="${hojeSP().slice(0, 7)}"></label></div>
      <div class="secao">Base de cálculo</div>
      <div class="grade" style="--col:2"><label class="campo">Vendas consideradas<select name="base_modo" id="gg-modo"><option value="propria" ${r.base.modo !== 'unidades' ? 'selected' : ''}>Unidade(s) em que a pessoa é responsável (supervisor)</option>
          <option value="unidades" ${r.base.modo === 'unidades' ? 'selected' : ''}>Unidades escolhidas abaixo (coordenador)</option></select></label>
        <div class="campo" data-unidades-base><span>Unidades da base</span><div class="tags">${unidades.map((u) => `<label class="marcar"><input type="checkbox" data-unidade-base value="${esc(u.id)}" ${r.base.unidades.includes(u.id) ? 'checked' : ''}> ${esc(u.nome)}</label>`).join('')}</div></div></div>
      <p class="nota mt6">As vendas diretas do gestor sempre somam na base. A meta da base é a soma das metas individuais (com rampagem) dos vendedores das unidades.</p>
      <div class="secao">Comissão</div>
      <div class="grade" style="--col:4"><label class="campo">% sobre as vendas da base<input type="number" step="0.01" name="percentual_base" id="gg-pb" value="${vv(r.percentual_base)}"></label>
        <label class="campo">% sobre vendas diretas<input type="number" step="0.01" name="percentual_diretas" id="gg-pd" value="${vv(r.percentual_diretas)}"></label>
        <label class="campo">Mínimo de vendedores<span class="dica">abaixo: sem bônus (o % da base vale sempre)</span><input type="number" step="1" min="0" name="minimo_vendedores" id="gg-min" value="${vv(r.minimo_vendedores)}"></label>
        <label class="campo">Taxa da cooperativa (%)<span class="dica">só sobre a comissão (não sobre o bônus)</span><input type="number" step="0.01" name="taxa_cooperativa" id="gg-tx" value="${vv(r.taxa_cooperativa)}"></label></div>
      <div class="secao">Bônus por faixa de vendas da base (não acumulativo: vale a maior faixa)</div>
      <table class="faixas-editor"><tbody data-faixas></tbody></table><button class="btn pequeno mt6" data-add-faixa>${ICONES.mais}Faixa</button>
      <div class="secao">Equilíbrio entre unidades</div>
      <label class="marcar"><input type="checkbox" name="eq_usa" id="gg-eq" ${r.equilibrio.usa ? 'checked' : ''}> Exigir que um número mínimo de unidades atinja um % da própria meta; se não, o bônus desce uma faixa</label>
      <div class="grade mt8" style="--col:4"><label class="campo">Unidades mínimas<input type="number" step="1" min="1" name="eq_min" id="gg-eqmin" value="${vv(r.equilibrio.minimo_unidades)}"></label>
        <label class="campo">% da meta de cada unidade<input type="number" step="0.1" name="eq_pct" id="gg-eqpct" value="${vv(r.equilibrio.percentual_meta)}"></label></div>
      <div class="secao">Salário e bandeiras</div>
      <div class="grade" style="--col:4"><label class="campo">Salário fixo (R$)<input type="number" step="0.01" name="salario_fixo" id="gg-sal" value="${vv(r.salario_fixo)}"></label>
        <label class="campo">Vermelha abaixo de (%)<input type="number" step="0.1" name="band_vermelha" id="gg-bv" value="${vv(r.bandeiras.limite_vermelha)}"></label>
        <label class="campo">Amarela abaixo de (%)<input type="number" step="0.1" name="band_amarela" id="gg-ba" value="${vv(r.bandeiras.limite_amarela)}"></label>
        <label class="campo">Recupera a partir de (%)<input type="number" step="0.1" name="band_recuperacao" id="gg-br" value="${vv(r.bandeiras.limite_recuperacao)}"></label></div>
      <div class="barra mt8"><label class="marcar"><input type="checkbox" name="band_usa" id="gg-band" ${r.bandeiras.usa ? 'checked' : ''}> Aplicar bandeiras sobre o atingimento da meta da base</label>
        ${c ? `<label class="marcar"><input type="checkbox" name="ativo" id="gg-ativo" ${c.ativo ? 'checked' : ''}> Ativo</label>` : ''}</div>
      ${secaoBeneficiosHtml}
      <div class="secao">Simular</div>
      <div class="grade" style="--col:4"><label class="campo">Vendas da base (R$)<input type="number" step="1000" data-sim-base id="gg-sb" value="1050000"></label>
        <label class="campo">Vendas diretas (R$)<input type="number" step="1000" data-sim-diretas id="gg-sd" value="0"></label>
        <label class="campo">Vendedores na equipe<input type="number" data-sim-equipe id="gg-se" value="7"></label>
        <label class="campo">Unidades ≥ % exigido<input type="number" data-sim-ok id="gg-so" value="3"></label></div>
      <button class="btn pequeno mt8" data-simular>Calcular</button><div data-sim class="mt8"></div>${versoesHtml(c)}`,
    rodape: '<span class="espaco"></span><button class="btn" data-fechar>Cancelar</button><button class="btn primario" data-salvar>Salvar</button>',
  });
  const beneficios = montarEditorBeneficios(el, c ? beneficiosDoCargo(c.id) : [{ nome: 'Veículo e combustível', valor: null, forma: 'por conta da LZ7 Energia' }]);
  const fx = el.querySelector('[data-faixas]');
  const desenharF = () => {
    fx.innerHTML = r.bonus_faixas.map((f, i) => `<tr><td>A partir de R$</td><td><input type="number" step="1000" data-de="${i}" value="${f.a_partir}"></td>
      <td>bônus R$ <input type="number" step="100" data-val="${i}" value="${f.valor}" class="curto"></td><td><button class="btn-link" data-rem="${i}">remover</button></td></tr>`).join('');
    fx.querySelectorAll('[data-de]').forEach((x) => { x.oninput = () => { r.bonus_faixas[x.dataset.de].a_partir = Number(x.value); }; });
    fx.querySelectorAll('[data-val]').forEach((x) => { x.oninput = () => { r.bonus_faixas[x.dataset.val].valor = Number(x.value); }; });
    fx.querySelectorAll('[data-rem]').forEach((x) => { x.onclick = () => { r.bonus_faixas.splice(Number(x.dataset.rem), 1); desenharF(); }; });
  };
  desenharF();
  el.querySelector('[data-add-faixa]').onclick = () => { const u = r.bonus_faixas[r.bonus_faixas.length - 1]; r.bonus_faixas.push({ a_partir: u ? u.a_partir + 500000 : 500000, valor: u ? u.valor : 0 }); desenharF(); };
  const modo = el.querySelector('[name=base_modo]');
  const vis = () => { el.querySelector('[data-unidades-base]').classList.toggle('apagado', modo.value !== 'unidades'); };
  modo.onchange = vis; vis();
  const g = (n) => el.querySelector(`[name=${n}]`); const n = (x) => (g(x).value === '' ? null : Number(g(x).value));
  const montar = () => ({ nome: g('nome').value, publico: 'gestor', ativo: g('ativo') ? g('ativo').checked : true, vigente_desde: g('vigente_desde').value, beneficios_lista: beneficios,
    regra: { tipo: 'gestor', percentual_base: n('percentual_base') || 0, percentual_diretas: n('percentual_diretas') || 0, minimo_vendedores: n('minimo_vendedores') || 0, taxa_cooperativa: n('taxa_cooperativa') || 0,
      salario_fixo: n('salario_fixo') || 0, bonus_faixas: r.bonus_faixas, base: { modo: modo.value, unidades: [...el.querySelectorAll('[data-unidade-base]:checked')].map((x) => x.value) },
      equilibrio: { usa: g('eq_usa').checked, minimo_unidades: n('eq_min'), percentual_meta: n('eq_pct') },
      bandeiras: { usa: g('band_usa').checked, limite_vermelha: n('band_vermelha'), limite_amarela: n('band_amarela'), limite_recuperacao: n('band_recuperacao'), zona_intermediaria: 'manter' } } });
  el.querySelector('[data-simular]').onclick = (e) => comBotao(e.target, async () => {
    const regra = normalizarRegra(montar().regra);
    const ok = Number(el.querySelector('[data-sim-ok]').value) || 0;
    const qtd = Math.max(ok, regra.base.modo === 'unidades' ? regra.base.unidades.length : 1);
    const x = calcularGestor({ base_total: Number(el.querySelector('[data-sim-base]').value) || 0, diretas_total: Number(el.querySelector('[data-sim-diretas]').value) || 0,
      equipe: Number(el.querySelector('[data-sim-equipe]').value) || 0, unidades_atingimento: Array.from({ length: qtd }, (_, i) => (i < ok ? 100 : 0)) }, regra);
    el.querySelector('[data-sim]').innerHTML = `<table class="conta sim"><tr><td>${pct(regra.percentual_base)} sobre a base</td><td>${brl(x.comissao_base)}</td></tr>
      <tr><td>Bônus${x.elegivel ? '' : ' (equipe abaixo do mínimo)'}${x.equilibrio && !x.equilibrio.atendido ? ' (desceu uma faixa pelo equilíbrio)' : ''}</td><td>${brl(x.bonus)}</td></tr><tr><td>${pct(regra.percentual_diretas)} sobre vendas diretas</td><td>${brl(x.comissao_diretas)}</td></tr>
      <tr><td>Taxa da cooperativa</td><td>${brl(-x.taxa_cooperativa)}</td></tr><tr class="total"><td>Variável líquido</td><td>${brl(x.variavel_liquido)}</td></tr>
      <tr><td>+ salário fixo</td><td>${brl(regra.salario_fixo)}</td></tr><tr class="total"><td>Ganho total</td><td>${brl(x.variavel_liquido + regra.salario_fixo)}</td></tr></table>`;
  });
  el.querySelector('[data-salvar]').onclick = (e) => comBotao(e.target, async () => { await salvarCargo(montar(), c?.id || null); fechar(); aviso('Cargo salvo.'); rotear(); });
}
function editarCargo(c) {
  const r = clonar(c?.regra || PADRAO_CARGO);
  if (!r.faixas?.length) r.faixas = clonar(PADRAO_CARGO.faixas);
  let beneficios = null;
  const { el, fechar } = modal({
    titulo: c ? c.nome : 'Novo cargo', largura: 820,
    corpo: `<div class="grade" style="--col:3">
        <label class="campo dois">Nome do cargo<input type="text" name="nome" id="cv-nome" value="${esc(c?.nome || '')}" placeholder="Ex.: Analista Comercial Sênior"></label>
        <label class="campo">Regra vale a partir de<span class="dica">competência</span><input type="month" name="vigente_desde" id="cv-vig" value="${hojeSP().slice(0, 7)}"></label>
        <label class="campo">Tipo de comissão<select name="tipo" id="cv-tipo"><option value="faixas" ${r.tipo === 'faixas' ? 'selected' : ''}>Faixas por faturamento do mês</option><option value="fixo" ${r.tipo === 'fixo' ? 'selected' : ''}>Percentual fixo</option></select></label>
        <label class="campo" data-so="faixas">Aplicação das faixas<select name="modo_faixas" id="cv-modo"><option value="total" ${r.modo_faixas !== 'escalonado' ? 'selected' : ''}>% da faixa sobre todo o faturado</option><option value="escalonado" ${r.modo_faixas === 'escalonado' ? 'selected' : ''}>Escalonado (cada faixa só sobre sua parte)</option></select></label>
        <label class="campo" data-so="fixo">Percentual fixo (%)<input type="number" step="0.01" name="percentual_fixo" id="cv-fixo" value="${vv(r.percentual_fixo)}"></label>
        <label class="campo">Taxa da cooperativa (%)<span class="dica">só sobre a comissão (não sobre o bônus)</span><input type="number" step="0.01" name="taxa_cooperativa" id="cv-tx" value="${vv(r.taxa_cooperativa)}"></label>
        ${c ? `<div class="campo fim"><label class="marcar"><input type="checkbox" name="ativo" id="cv-ativo" ${c.ativo ? 'checked' : ''}> Ativo</label></div>` : ''}
      </div>
      <div data-so="faixas"><div class="secao">Faixas de faturamento no mês</div><table class="faixas-editor"><tbody data-faixas></tbody></table>
        <button class="btn pequeno mt6" data-add-faixa>${ICONES.mais}Faixa</button><p class="nota mt6">"Até" inclui o valor; a faixa seguinte começa acima dele. A última faixa não tem limite.</p></div>
      <div class="secao">Bônus e valores fixos</div>
      <div class="grade" style="--col:4"><label class="campo">Bônus (R$)<span class="dica">0 = sem bônus</span><input type="number" step="0.01" name="bonus_valor" id="cv-bv" value="${vv(r.bonus?.valor || 0)}"></label>
        <label class="campo">Gatilho do bônus (R$)<span class="dica">faturado ≥ este valor</span><input type="number" step="0.01" name="bonus_gatilho" id="cv-bg" value="${vv(r.bonus?.gatilho || '')}"></label>
        <label class="campo">Salário fixo (R$)<span class="dica">usado quando o cadastro não tem salário</span><input type="number" step="0.01" name="salario_fixo" id="cv-sal" value="${vv(r.salario_fixo)}"></label></div>
      ${secaoBeneficiosHtml}
      <div class="secao">Meta mensal</div>
      <label class="marcar"><input type="checkbox" name="meta_usa" id="cv-meta" ${r.meta?.usa ? 'checked' : ''}> Este cargo tem meta mensal</label>
      <div class="grade mt8" style="--col:4" data-meta><label class="campo">1º mês (R$)<input type="number" step="0.01" name="meta_m1" id="cv-m1" value="${vv(r.meta?.rampagem?.[0])}"></label>
        <label class="campo">2º mês (R$)<input type="number" step="0.01" name="meta_m2" id="cv-m2" value="${vv(r.meta?.rampagem?.[1])}"></label>
        <label class="campo">3º mês (R$)<span class="dica">vazio = já usa a padrão</span><input type="number" step="0.01" name="meta_m3" id="cv-m3" value="${vv(r.meta?.rampagem?.[2])}"></label>
        <label class="campo">Meta padrão (R$)<span class="dica">depois da rampagem</span><input type="number" step="0.01" name="meta_padrao" id="cv-mp" value="${vv(r.meta?.padrao)}"></label></div>
      <div data-meta><div class="secao">Bandeiras de desempenho</div>
        <label class="marcar"><input type="checkbox" name="band_usa" id="cv-band" ${r.bandeiras?.usa ? 'checked' : ''}> Aplicar bandeiras a este cargo</label>
        <div class="grade mt8" style="--col:4"><label class="campo">Vermelha abaixo de (%)<input type="number" step="0.1" name="band_vermelha" id="cv-bv2" value="${vv(r.bandeiras?.limite_vermelha ?? 50)}"></label>
          <label class="campo">Amarela abaixo de (%)<input type="number" step="0.1" name="band_amarela" id="cv-ba" value="${vv(r.bandeiras?.limite_amarela ?? 71)}"></label>
          <label class="campo">Recupera a partir de (%)<input type="number" step="0.1" name="band_recuperacao" id="cv-br" value="${vv(r.bandeiras?.limite_recuperacao ?? 81)}"></label>
          <label class="campo">Em Amarela e entre as faixas<select name="band_zona" id="cv-zona"><option value="manter" ${r.bandeiras?.zona_intermediaria === 'manter' ? 'selected' : ''}>Mantém Amarela</option>
            <option value="normalizar" ${r.bandeiras?.zona_intermediaria === 'normalizar' ? 'selected' : ''}>Volta ao normal</option><option value="escalar" ${r.bandeiras?.zona_intermediaria === 'escalar' ? 'selected' : ''}>Passa a Vermelha</option></select></label></div></div>
      <div class="secao">Simular</div>
      <div class="barra"><input type="text" data-sim-valores id="cv-sim" value="50000, 80000, 100000, 150000, 200000, 300000, 350000" class="sim-valores"><button class="btn pequeno" data-simular>Calcular</button></div>
      <div data-sim></div>${versoesHtml(c)}`,
    rodape: '<span class="espaco"></span><button class="btn" data-fechar>Cancelar</button><button class="btn primario" data-salvar>Salvar</button>',
  });
  const fx = el.querySelector('[data-faixas]');
  const desenharF = () => {
    fx.innerHTML = r.faixas.map((f, i) => `<tr><td>${f.ate === null ? 'Acima da anterior' : 'Até R$'}</td><td>${f.ate === null ? '' : `<input type="number" step="0.01" data-ate="${i}" value="${f.ate}">`}</td>
      <td><input type="number" step="0.01" data-perc="${i}" value="${f.percentual}" class="curto"> %</td><td>${f.ate !== null && r.faixas.length > 1 ? `<button class="btn-link" data-rem="${i}">remover</button>` : ''}</td></tr>`).join('');
    fx.querySelectorAll('[data-ate]').forEach((x) => { x.oninput = () => { r.faixas[x.dataset.ate].ate = x.value === '' ? 0 : Number(x.value); }; });
    fx.querySelectorAll('[data-perc]').forEach((x) => { x.oninput = () => { r.faixas[x.dataset.perc].percentual = Number(x.value); }; });
    fx.querySelectorAll('[data-rem]').forEach((x) => { x.onclick = () => { r.faixas.splice(Number(x.dataset.rem), 1); desenharF(); }; });
  };
  desenharF();
  beneficios = montarEditorBeneficios(el, c ? beneficiosDoCargo(c.id) : []);
  el.querySelector('[data-add-faixa]').onclick = () => { const lim = r.faixas.filter((f) => f.ate !== null); const u = lim.length ? lim[lim.length - 1].ate : 0; r.faixas.splice(r.faixas.length - 1, 0, { ate: u + 50000, percentual: 0 }); desenharF(); };
  const tipo = el.querySelector('[name=tipo]'); const metaUsa = el.querySelector('[name=meta_usa]');
  const vis = () => { el.querySelectorAll('[data-so]').forEach((x) => { x.hidden = x.dataset.so !== tipo.value; }); el.querySelectorAll('[data-meta]').forEach((x) => { x.hidden = !metaUsa.checked; }); };
  tipo.onchange = vis; metaUsa.onchange = vis; vis();
  const montar = () => {
    const g = (k) => el.querySelector(`[name=${k}]`); const n = (k) => (g(k).value === '' ? null : Number(g(k).value));
    return { nome: g('nome').value, publico: 'vendedor', ativo: g('ativo') ? g('ativo').checked : true, vigente_desde: g('vigente_desde').value, beneficios_lista: beneficios,
      regra: { tipo: tipo.value, modo_faixas: g('modo_faixas').value, percentual_fixo: n('percentual_fixo') || 0, faixas: r.faixas, taxa_cooperativa: n('taxa_cooperativa') || 0,
        bonus: n('bonus_valor') ? { valor: n('bonus_valor'), gatilho: n('bonus_gatilho') } : null, salario_fixo: n('salario_fixo') || 0,
        meta: { usa: metaUsa.checked, rampagem: [n('meta_m1'), n('meta_m2'), n('meta_m3')].filter((x) => x !== null), padrao: n('meta_padrao') || 0 },
        bandeiras: { usa: g('band_usa').checked, limite_vermelha: n('band_vermelha'), limite_amarela: n('band_amarela'), limite_recuperacao: n('band_recuperacao'), zona_intermediaria: g('band_zona').value } } };
  };
  el.querySelector('[data-simular]').onclick = (e) => comBotao(e.target, async () => {
    const regra = normalizarRegra(montar().regra);
    const valores = el.querySelector('[data-sim-valores]').value.split(/[;,\s]+/).map((x) => Number(x.replace(/\./g, ''))).filter((x) => Number.isFinite(x) && x >= 0);
    const res = valores.map((v) => calcularComissao(v, regra));
    el.querySelector('[data-sim]').innerHTML = `<div class="rolagem"><table class="tabela"><thead><tr><th class="n">Faturado</th><th class="n">%</th><th class="n">Comissão</th><th class="n">Bônus</th><th class="n">Taxa coop.</th><th class="n">Líquido</th></tr></thead>
      <tbody>${res.map((x) => `<tr><td class="n">${brl(x.total)}</td><td class="n">${pct(x.percentual)}</td><td class="n">${brl(x.comissao)}</td><td class="n">${brl(x.bonus)}</td><td class="n">${brl(-x.taxa_cooperativa)}</td><td class="n"><b>${brl(x.variavel_liquido)}</b></td></tr>`).join('')}</tbody></table></div>`;
  });
  el.querySelector('[data-salvar]').onclick = (e) => comBotao(e.target, async () => { await salvarCargo(montar(), c?.id || null); fechar(); aviso('Cargo salvo.'); rotear(); });
}

/* ---------- configurações ---------- */
const ACOES_AUD = { criar: 'criou', alterar: 'alterou', excluir: 'excluiu', fechar: 'fechou', reabrir: 'reabriu', desligar: 'desligou', readmitir: 'readmitiu', responsavel: 'trocou o responsável',
  ajustar: 'ajustou', remover_ajuste: 'removeu o ajuste', editar_valor: 'editou o valor', remanejar: 'remanejou de mês', margem: 'informou a margem', remover_margem: 'removeu a margem', voltar_mes: 'voltou ao mês de origem', remover_valor_editado: 'voltou ao valor da planilha', apagar: 'apagou', restaurar: 'restaurou',
  registrar: 'registrou', estornar: 'estornou', emitir: 'emitiu', cancelar: 'cancelou', importar_pedidos: 'importou pedidos', importar_pessoas: 'importou colaboradores', dados_iniciais: 'criou os dados iniciais' };
function telaConfiguracoes(alvo) {
  const emp = empresa(); const ult = S.cfg.ultima_importacao; const fechada = ultimaCompetenciaFechada();
  alvo.innerHTML = `
    <div class="painel"><div class="painel-cab"><h2>Pedidos de venda</h2></div><div class="painel-corpo">
      <table class="conta info largura-media"><tr><td>Fonte</td><td>Planilha exportada do Flow (Vendas → Pedidos de venda → exportar)</td></tr>
        <tr><td>Pedidos na plataforma</td><td>${S.pedidos.size}</td></tr>
        <tr><td>Última importação</td><td>${ult ? `${esc(ult.arquivo || '')} · ${dataHora(ult.em)} · ${esc(quem(ult.autor))} · ${ult.novos} novos, ${ult.alterados} alterados` : '—'}</td></tr>
        ${S.cfg.migrado_de ? `<tr><td>Dados trazidos da</td><td>${esc(S.cfg.migrado_de)} em ${dataHora(S.cfg.migrado_em)}</td></tr>` : ''}</table>
      <div class="barra mt12"><button class="btn primario" data-importar id="cf-importar">${ICONES.subir}Importar planilha de pedidos</button></div></div></div>
    <div class="painel bloco"><div class="painel-cab"><h2>Início da apuração</h2></div><div class="painel-corpo">
      <p class="intro">Primeiro mês fechado pela plataforma. Meses anteriores não geram bandeira. ${fechada ? `Já existe competência fechada (${fechada}); não pode mais ser alterado.` : ''}</p>
      <div class="barra"><input type="month" id="cf-inicio" value="${esc(S.cfg.inicio_apuracao || '')}" ${fechada ? 'disabled' : ''} class="mes-fixo">
        <button class="btn" data-inicio ${fechada ? 'disabled' : ''}>Salvar</button><span class="nota">vazio = mês do pedido mais antigo (${esc(inicioApuracao() || '—')})</span></div></div></div>
    <div class="painel bloco"><div class="painel-cab"><h2>Dados da empresa nos recibos</h2></div><div class="painel-corpo">
      <div class="grade" style="--col:3"><label class="campo">Razão social<input type="text" name="razao_social" id="cf-razao" value="${esc(emp.razao_social)}"></label>
        <label class="campo">CNPJ<input type="text" name="cnpj" id="cf-cnpj" value="${esc(emp.cnpj)}"></label>
        <label class="campo">Cidade (local da assinatura)<input type="text" name="cidade" id="cf-cidade" value="${esc(emp.cidade)}"></label></div>
      <div class="barra mt12"><button class="btn" data-empresa>Salvar dados da empresa</button></div></div></div>
    <div class="painel bloco"><div class="painel-cab"><h2>Acesso</h2></div><div class="painel-corpo">
      <p class="intro"><!-- Central: acesso pelo login do site -->Só a equipe principal da Central (perfis equipe e administrador) abre esta plataforma, e o banco confere isso a cada leitura e gravação.
        CPF e chave Pix ficam guardados no banco da Central e aparecem mascarados nas listas; a auditoria não guarda esses campos.</p>
      <p class="nota">${USUARIO.podeEscrever === false ? 'Seu acesso atual é somente leitura.' : `Conectado como ${esc(USUARIO.nome || 'você')}.`}</p></div></div>
    <div class="painel bloco"><div class="painel-cab"><h2>Auditoria</h2><span class="espaco"></span><span class="nota-cab">últimas ${S.auditoria.length} ações</span></div>
      <div class="rolagem auditoria">${S.auditoria.length ? `<table class="tabela"><thead><tr><th>Quando</th><th>Quem</th><th>O quê</th><th>Registro</th></tr></thead>
        <tbody>${S.auditoria.map((a) => `<tr><td>${dataHora(a.em)}</td><td>${esc(quem(a.autor) || 'sistema')}</td><td>${esc(ACOES_AUD[a.acao] || a.acao)}${ENT_AUD[a.entidade] ? ` · ${esc(ENT_AUD[a.entidade])}` : ''}</td>
          <td class="quebra pequena">${esc(descricaoAuditoria(a))}</td></tr>`).join('')}</tbody></table>` : '<div class="vazio">Nenhuma ação registrada ainda.</div>'}</div></div>`;
  alvo.querySelector('[data-importar]').onclick = () => importarPedidosModal();
  alvo.querySelector('[data-inicio]').onclick = (e) => comBotao(e.target, async () => { await definirInicioApuracao(alvo.querySelector('#cf-inicio').value || null); aviso('Início da apuração salvo.'); rotear(); });
  alvo.querySelector('[data-empresa]').onclick = (e) => comBotao(e.target, async () => { await salvarEmpresa(lerForm(alvo.querySelector('.grade'))); aviso('Dados da empresa salvos.'); rotear(); });
}
const ENT_AUD = { pessoa: 'colaborador', pedido: 'pedido', fechamento_individual: 'fechamento do colaborador', apuracao: 'mês', lancamento: 'lançamento', configuracao: 'configuração', unidade: 'unidade', cargo: 'cargo', recibo: 'recibo', pagamento: 'pagamento' };
function descricaoAuditoria(a) {
  const p = a.para || {};
  const nomeP = (id) => S.pessoas.get(id)?.nome || null;
  if (a.entidade === 'pessoa') return nomeP(a.entidade_id) || a.entidade_id;
  if (a.entidade === 'pedido') return `pedido ${S.pedidos.get(a.entidade_id)?.numero || a.entidade_id}${p.justificativa ? ` — ${p.justificativa}` : ''}${p.valor !== undefined && a.acao === 'editar_valor' ? ` — ${brl(p.valor)}` : ''}`;
  if (a.entidade === 'lancamento' || a.entidade === 'pagamento' || a.entidade === 'recibo') return [nomeP(p.pessoa_id), p.competencia, p.valor !== undefined ? brl(p.valor) : null, p.motivo].filter(Boolean).join(' · ');
  if (a.entidade === 'importacao') return [a.entidade_id, p.novos !== undefined ? `${p.novos} novos, ${p.alterados} alterados` : null, p.criar !== undefined ? `${p.criar} criados, ${p.atualizar} atualizados` : null].filter(Boolean).join(' · ');
  if (a.entidade === 'fechamento_individual') return [nomeP(p.pessoa_id), p.competencia, p.data_corte ? `corte ${data(p.data_corte)}` : null, p.motivo].filter(Boolean).join(' · ') || a.entidade_id;
  if (a.entidade === 'apuracao') return a.entidade_id;
  if (a.entidade === 'unidade') return S.unidades.get(a.entidade_id)?.nome || a.entidade_id;
  if (a.entidade === 'cargo') return S.cargos.get(a.entidade_id)?.nome || a.entidade_id;
  return a.entidade_id || '';
}

/* ================= casca: menu, competência, filtro de dias e roteamento ================= */
const TELAS = {
  apuracao: { titulo: 'Apuração mensal', icone: 'apuracao', fn: telaApuracao, menu: 'Apuração', mes: true, dias: true, grupo: 'Comissões' },
  pedidos: { titulo: 'Pedidos do mês', icone: 'pedidos', fn: telaPedidos, menu: 'Pedidos', mes: true, dias: true, grupo: 'Comissões' },
  lancamentos: { titulo: 'Lançamentos do mês', icone: 'mais', fn: telaLancamentos, menu: 'Lançamentos', mes: true, grupo: 'Comissões' },
  bandeiras: { titulo: 'Bandeiras de desempenho', icone: 'bandeiras', fn: telaBandeiras, menu: 'Bandeiras', mes: true, grupo: 'Comissões' },
  vendedores: { titulo: 'Vendedores', icone: 'vendedores', fn: telaVendedores, menu: 'Vendedores', grupo: 'Cadastros' },
  unidades: { titulo: 'Unidades', icone: 'unidades', fn: telaUnidades, menu: 'Unidades', grupo: 'Cadastros' },
  cargos: { titulo: 'Cargos e faixas', icone: 'cargos', fn: telaCargos, menu: 'Cargos e faixas', grupo: 'Cadastros' },
  configuracoes: { titulo: 'Importação e sistema', icone: 'config', fn: telaConfiguracoes, menu: 'Importação e sistema', grupo: 'Sistema' },
};
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem storage */ } };
const ler = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const estado = {
  tela: (() => { const h = (location.hash || '').replace('#', ''); return TELAS[h] ? h : (TELAS[ler('tela')] ? ler('tela') : 'apuracao'); })(),
  dias: { de: '', ate: '' },
  competencia: (() => { const c = ler('competencia'); return /^\d{4}-\d{2}$/.test(c || '') ? c : somarMeses(hojeSP().slice(0, 7), -1); })(),
  conectado: false, motivo: '',
};
const raiz = document.getElementById('app');

function montarCasca() {
  const grupos = {};
  for (const [id, t] of Object.entries(TELAS)) (grupos[t.grupo] = grupos[t.grupo] || []).push([id, t]);
  raiz.innerHTML = `<div class="casca">
    <nav class="lateral" aria-label="Menu">
      <div class="marca"><span class="selo">LZ7</span><div><b>Comissões LZ7</b><small>Energia</small></div></div>
      <div class="menu">${Object.entries(grupos).map(([g, itens]) => `<div class="grupo">${g}</div>${itens.map(([id, t]) => `<a href="#${id}" data-tela="${id}">${ICONES[t.icone]}<span>${t.menu}</span></a>`).join('')}`).join('')}</div>
      <div class="rodape-lateral" data-usuario>Conectando…</div>
    </nav>
    <div class="principal">
      <header class="topo">
        <h1 data-titulo></h1>
        <input type="month" class="mes" data-mes id="topo-mes" aria-label="Competência">
        <span class="filtro-dias" data-dias><span>Dias</span><input type="date" data-de id="topo-de" aria-label="De"><span>a</span><input type="date" data-ate id="topo-ate" aria-label="Até">
          <button class="btn-link" data-limpar-dias hidden>limpar</button></span>
        <span class="espaco"></span>
        <span class="sync" data-sync></span>
        <button class="btn" data-importar-topo id="topo-importar">${ICONES.subir}Importar planilha</button>
      </header>
      <div data-faixa></div>
      <main class="conteudo" data-conteudo><div class="vazio">Conectando ao banco de dados…</div></main>
    </div></div>`;
  const mes = raiz.querySelector('[data-mes]'); mes.value = estado.competencia;
  mes.onchange = () => {
    if (!/^\d{4}-\d{2}$/.test(mes.value)) return;
    estado.competencia = mes.value; guardar('competencia', mes.value);
    if (estado.dias.de && estado.dias.de.slice(0, 7) !== mes.value) { estado.dias = { de: '', ate: '' }; de.value = ''; ate.value = ''; limpar.hidden = true; }
    rotear();
  };
  const de = raiz.querySelector('[data-de]'); const ate = raiz.querySelector('[data-ate]'); const limpar = raiz.querySelector('[data-limpar-dias]');
  const aplicar = () => { if (de.value && !ate.value) ate.value = de.value; estado.dias = { de: de.value, ate: de.value ? ate.value : '' }; limpar.hidden = !estado.dias.de; rotear(); };
  de.onchange = aplicar; ate.onchange = aplicar;
  limpar.onclick = () => { de.value = ''; ate.value = ''; aplicar(); };
  raiz.querySelector('[data-importar-topo]').onclick = () => { if (!estado.conectado) return aviso(estado.motivo || 'Banco ainda não conectado.', 'erro'); importarPedidosModal(); };
  raiz.addEventListener('click', (e) => {
    const a = e.target.closest('[data-tela], [data-ir]');
    if (!a) return;
    e.preventDefault();
    irPara(a.dataset.tela || a.dataset.ir);
  });
}
function irPara(tela) {
  estado.tela = TELAS[tela] ? tela : 'apuracao';
  guardar('tela', estado.tela);
  try { history.replaceState(null, '', `#${estado.tela}`); } catch { /* sem histórico */ }
  rotear();
  raiz.querySelector('.principal')?.scrollIntoView({ block: 'start' });
}
function irParaMes(c) {
  estado.competencia = c; guardar('competencia', c);
  const m = raiz.querySelector('header [data-mes]'); if (m) m.value = c;
  if (estado.dias.de && estado.dias.de.slice(0, 7) !== c) estado.dias = { de: '', ate: '' };
}
function atualizarTopo() {
  const ult = S.cfg.ultima_importacao;
  const el = raiz.querySelector('[data-sync]');
  if (el) el.innerHTML = ult ? `Última planilha${ult.mes ? ` (${mesCurto(ult.mes)})` : ''}<br><b>${dataHora(ult.em)}</b>` : (S.pedidos.size ? 'Pedidos trazidos da plataforma local' : 'Nenhuma planilha importada');
  const u = raiz.querySelector('[data-usuario]');
  if (u) u.innerHTML = estado.conectado ? `${esc(USUARIO.nome || 'Conectado')}${USUARIO.podeEscrever === false ? '<br><span class="fonte-demo">SOMENTE LEITURA</span>' : ''}` : esc(estado.motivo ? 'Sem banco de dados' : 'Conectando…');
  const f = raiz.querySelector('[data-faixa]');
  if (f) f.innerHTML = !estado.conectado && estado.motivo ? `<div class="faixa-aviso">${esc(estado.motivo)}</div>` : USUARIO.podeEscrever === false ? '<div class="faixa-aviso">Seu acesso é somente leitura: você vê os dados, mas não consegue alterar. Peça acesso de colaborador a quem compartilhou a plataforma.</div>' : '';
}
function rotear() {
  pendenteRender = false;
  const tela = TELAS[estado.tela];
  raiz.querySelectorAll('[data-tela]').forEach((a) => a.classList.toggle('ativo', a.dataset.tela === estado.tela));
  raiz.querySelector('[data-titulo]').textContent = tela.titulo;
  raiz.querySelector('[data-mes]').hidden = !tela.mes;
  raiz.querySelector('[data-dias]').hidden = !tela.dias;
  atualizarTopo();
  const alvo = raiz.querySelector('[data-conteudo]');
  if (!estado.conectado) { alvo.innerHTML = `<div class="vazio">${esc(estado.motivo || 'Conectando ao banco de dados…')}</div>`; return; }
  if (S.carregadas.size < COLECOES.length) { alvo.innerHTML = '<div class="vazio">Carregando os dados…</div>'; return; }
  const rolagem = window.scrollY;
  try { tela.fn(alvo); } catch (e) { alvo.innerHTML = `<div class="alerta erro"><div>${esc(e.message)}</div></div>`; if (!(e instanceof Erro)) console.error(e); }
  window.scrollTo(0, rolagem);
}
// Redesenha quando os dados mudam (inclusive por outra pessoa), sem atrapalhar quem está digitando.
let pendenteRender = false; let timerRender = null;
function agendarRender() {
  pendenteRender = true;
  clearTimeout(timerRender);
  timerRender = setTimeout(() => {
    const ativo = document.activeElement;
    if (ativo && ativo.closest?.('[data-conteudo]') && /INPUT|TEXTAREA|SELECT/.test(ativo.tagName)) return;
    if (pendenteRender) rotear();
  }, 160);
}
document.addEventListener('focusout', () => { if (pendenteRender) agendarRender(); });

async function iniciar() {
  montarCasca();
  rotear();
  try {
    const r = await conectar();
    estado.conectado = r.ok; estado.motivo = r.motivo || '';
  } catch (e) { estado.conectado = false; estado.motivo = `Não foi possível conectar ao banco (${e?.message || e}).`; }
  rotear();
}
iniciar();

})();
