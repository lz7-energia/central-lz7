/* Central LZ7 — leitura do extrato em PDF no próprio envio da Conciliação Bancária.
 * Tradução dos conversores da plataforma (conversores/*.py: Sicoob, Banco do Brasil, Cresol, PagueVeloz) para o navegador.
 * O texto vem do pdf.js montado em linhas como o `pdftotext -layout` (colunas pela posição na página).
 * Trava: saldo anterior + lançamentos tem de bater com TODOS os saldos diários impressos e com o saldo final; senão o
 * arquivo é recusado (envie o OFX). Resultado no mesmo formato do OFX lido pela plataforma: { acct, bankId, ini, fim, bal, items }.
 * O histórico é gravado como no OFX gerado pelos conversores (sem acento, maiúsculas, até 250 caracteres) e o FITID é
 * data + sequência do dia, igual ao ofx_comum.py: assim um PDF e o OFX convertido dele são o mesmo extrato para a Central.
 */
(function () {
  "use strict";
  if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = "/colab-app/vendor/pdf.worker.min.js";

  /* ---------- texto em linhas, como o pdftotext -layout ---------- */
  async function textoLayout(buf) {
    const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    const paginas = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const pg = await pdf.getPage(p);
      const tc = await pg.getTextContent();
      const itens = tc.items.filter((i) => i.str && i.str.trim()).map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: Math.abs(i.transform[3]) || 8 }));
      if (!itens.length) { paginas.push(""); continue; }
      const larguras = itens.filter((i) => i.s.length >= 3).map((i) => i.w / i.s.length).sort((a, b) => a - b);
      const cw = Math.max(2.5, larguras.length ? larguras[Math.floor(larguras.length / 2)] : 5);
      // agrupa por linha (mesma altura, com folga de 40% da altura da letra)
      itens.sort((a, b) => b.y - a.y || a.x - b.x);
      const linhas = [];
      for (const it of itens) {
        const l = linhas.find((l) => Math.abs(l.y - it.y) <= Math.max(2, it.h * 0.4));
        if (l) l.itens.push(it); else linhas.push({ y: it.y, itens: [it] });
      }
      linhas.sort((a, b) => b.y - a.y);
      const texto = linhas.map((l) => {
        l.itens.sort((a, b) => a.x - b.x);
        let s = "", fimAnt = null;
        for (const it of l.itens) {
          const col = Math.round(it.x / cw);
          if (fimAnt !== null) {
            const gap = it.x - fimAnt;
            if (col > s.length) s += " ".repeat(col - s.length);
            else if (gap > cw * 0.25 && !s.endsWith(" ")) s += " ";
          } else if (col > 0) s += " ".repeat(col);
          s += it.s; fimAnt = it.x + it.w;
        }
        return s.replace(/\s+$/, "");
      });
      paginas.push(texto.join("\n"));
    }
    return paginas.join("\n\f\n");
  }

  /* ---------- comum (ofx_comum.py) ---------- */
  const asciiOfx = (s) => String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\x00-\x7f]/g, "").replace(/&/g, "e").replace(/[<>]/g, "");
  const iso = (d) => d.slice(0, 4) + "-" + d.slice(4, 6) + "-" + d.slice(6, 8);
  const br = (c) => (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function conferir(saldoAnt, txs, saldosDia, saldoFinal) {
    const erros = [];
    for (const [d, sd] of saldosDia) {
      const calc = saldoAnt + txs.filter((t) => t.d <= d).reduce((s, t) => s + t.v, 0);
      if (calc !== sd) erros.push(`${iso(d).split("-").reverse().join("/")}: calculado ${br(calc)}, extrato ${br(sd)}`);
    }
    const tot = saldoAnt + txs.reduce((s, t) => s + t.v, 0);
    if (tot !== saldoFinal) erros.push(`final: calculado ${br(tot)}, extrato ${br(saldoFinal)}`);
    return erros;
  }
  function resultado(banco, { bankid, conta, ini, fim, txs, saldoAnt, saldoFinal, erros }) {
    if (saldoAnt == null) throw new Error(`${banco}: não encontrei o saldo anterior no PDF. Envie o OFX.`);
    if (saldoFinal == null) throw new Error(`${banco}: não encontrei o saldo final no PDF. Envie o OFX.`);
    if (!txs.length) throw new Error(`${banco}: nenhum lançamento encontrado no PDF.`);
    if (erros.length) throw new Error(`${banco}: a leitura do PDF não bate com os saldos impressos (${erros.slice(0, 3).join("; ")}${erros.length > 3 ? "…" : ""}). O arquivo foi recusado: envie o OFX.`);
    const seq = {};
    const items = txs.map((t) => {
      seq[t.d] = (seq[t.d] || 0) + 1;
      return { d: iso(t.d), v: t.v, h: asciiOfx(t.memo).toUpperCase().slice(0, 250).trim(), fid: t.d + String(seq[t.d]).padStart(3, "0") };
    }).filter((i) => i.v);
    return { acct: conta, bankId: bankid, ini: iso(ini), fim: iso(fim), bal: { v: saldoFinal, d: iso(fim) }, items, origemPdf: banco };
  }
  const exigir = (m, o) => { if (!m) throw new Error(`Não reconheci o ${o} no PDF. Envie o OFX.`); return m; };

  /* ---------- Sicoob (sicoob2ofx.py) ---------- */
  function sicoob(txt) {
    const lines = txt.split("\n").map((l) => l.replace(/\s+$/, ""));
    const per = exigir(txt.match(/PER[IÍ]ODO:\s*(\d\d)\/(\d\d)\/(\d{4})\s*-\s*(\d\d)\/(\d\d)\/(\d{4})/), "período");
    const ini = per[3] + per[2] + per[1], fim = per[6] + per[5] + per[4], ano = per[3];
    const coop = exigir(txt.match(/COOP\.:\s*([\d-]+)/), "número da cooperativa")[1];
    const conta = exigir(txt.match(/CONTA:\s*([\d.\-]+)/), "número da conta")[1];
    const money = (s) => parseInt(s.replace(/\./g, "").replace(",", ""), 10);
    const AMT = "([\\d.]+,\\d\\d)", soValor = new RegExp("^" + AMT + "$");
    const end = lines.findIndex((l) => l.trim() === "RESUMO");
    if (end < 0) throw new Error("Sicoob: não encontrei o bloco RESUMO no PDF. Envie o OFX.");
    const txs = [], daily = []; let saldoAnt = null, pendAmt = null, i = 0;
    while (i < end) {
      const s = lines[i].trim();
      if (!s || s === "\f") { i++; continue; }
      const mAmt = s.match(soValor);
      if (mAmt) { pendAmt = money(mAmt[1]); i++; continue; }
      const m = s.match(/^(\d\d)\/(\d\d)\s+(.*)$/);
      if (!m) { i++; continue; }
      const [, dd, mm, rest] = m;
      let hist, amt, sig;
      const m2 = rest.match(new RegExp("^(.*?)\\s+" + AMT + "([CD*])?$"));
      if (m2) { hist = m2[1].trim(); amt = money(m2[2]); sig = m2[3]; }
      else {
        hist = rest.trim(); amt = pendAmt; sig = null;
        const m3 = hist.match(/^(.*?)\s+([CD])$/);
        if (m3) { hist = m3[1].trim(); sig = m3[2]; }
      }
      pendAmt = null;
      let j = i + 1;
      if (!sig) {
        while (j < end && !lines[j].trim()) j++;
        if (j < end && ["C", "D", "*"].includes(lines[j].trim())) { sig = lines[j].trim(); j++; }
      }
      const det = [];
      while (j < end && lines[j].trim() && lines[j].trim() !== "\f" && !/^\d\d\/\d\d\s/.test(lines[j].trim()) && !soValor.test(lines[j].trim())) {
        det.push(lines[j].trim().replace(/\s+/g, " ")); j++;
      }
      i = j;
      const date = ano + mm + dd;
      if (amt == null) continue;
      const v = sig === "C" ? amt : -amt;
      if (hist.startsWith("SALDO ANTERIOR")) { saldoAnt = v; continue; }
      if (hist.startsWith("SALDO DO DIA")) { daily.push([date, v]); continue; }
      if (hist.startsWith("SALDO BLOQ")) continue;
      const extra = det.filter((d) => !d.startsWith("DOC.:") && !["Recebimento Pix", "Pagamento Pix", "Transferência Pix"].includes(d));
      txs.push({ d: date, v, memo: [hist, ...extra].join(" ").replace(/\s+/g, " ").trim() });
    }
    const saldoFinal = daily.length ? daily[daily.length - 1][1] : null;
    const erros = saldoAnt == null || saldoFinal == null ? [] : conferir(saldoAnt, txs, daily, saldoFinal);
    return resultado("Sicoob", { bankid: "0756", conta: conta.replace(/[.\-]/g, ""), ini, fim, txs, saldoAnt, saldoFinal, erros });
  }

  /* ---------- Banco do Brasil (bb2ofx.py) ---------- */
  function bb(txt) {
    const L = txt.split("\n").map((l) => l.replace(/\s+$/, ""));
    const conta = exigir(txt.match(/Conta corrente\s+([\d-]+)/), "número da conta")[1];
    const mes = exigir(txt.match(/(\d\d)\s*\/\s*(\d{4})\s*\n\s*extrato/), "mês do extrato");
    const mm = mes[1], aa = mes[2], ultimo = new Date(+aa, +mm, 0).getDate();
    const ini = `${aa}${mm}01`, fim = `${aa}${mm}${String(ultimo).padStart(2, "0")}`;
    const money = (s) => parseInt(s.replace(/\./g, "").replace(",", ""), 10);
    const R = /^\s*(\d\d)\/(\d\d)\/(\d{4})\s+(\d{4})\s+(\d{5})\s+(\d{3})\s+(.+?)\s{2,}(?:([\d.]+)\s+)?([\d.]+,\d\d) ([CD])(?:\s+([\d.]+,\d\d) ([CD]))?\s*$/;
    const txs = [], saldos = []; let saldoAnt = null, saldoFinal = null, i = 0;
    while (i < L.length) {
      const m = L[i].match(R);
      if (!m) { i++; continue; }
      const d = m[3] + m[2] + m[1], hist = m[7].trim();
      const v = money(m[9]) * (m[10] === "C" ? 1 : -1);
      let j = i + 1; const det = [];
      while (j < L.length && !R.test(L[j]) && !/^(https:\/\/|\*\*\*)/.test(L[j].trim()) && !/^\d\d\/\d\d\/\d{4},/.test(L[j].trim())) {
        if (L[j].trim() && L[j].trim() !== "\f") det.push(L[j].trim().replace(/\s+/g, " "));
        j++;
        if (det.length) break;
      }
      i = j;
      if (hist.endsWith("Saldo Anterior")) { saldoAnt = v; continue; }
      if (hist.replace(/ /g, "").endsWith("SALDO")) { saldoFinal = v; continue; }
      if (m[11]) saldos.push([txs.length + 1, money(m[11]) * (m[12] === "C" ? 1 : -1)]);
      txs.push({ d, v, memo: hist.replace(/^\d{3}\s+/, "") + (det.length ? " " + det[0] : "") });
    }
    const erros = [];
    if (saldoAnt != null) for (const [n, s] of saldos) {
      const calc = saldoAnt + txs.slice(0, n).reduce((a, t) => a + t.v, 0);
      if (calc !== s) erros.push(`lançamento ${n}: calculado ${br(calc)}, extrato ${br(s)}`);
    }
    if (saldoAnt != null && saldoFinal != null) erros.push(...conferir(saldoAnt, txs, [], saldoFinal));
    return resultado("Banco do Brasil", { bankid: "0001", conta: conta.replace(/-/g, ""), ini, fim, txs, saldoAnt, saldoFinal, erros });
  }

  /* ---------- Cresol (cresol2ofx.py) ---------- */
  function cresol(txt) {
    const conta = exigir(txt.match(/Conta\s+([\d-]+)/), "número da conta")[1];
    const p = exigir(txt.match(/Periodo de (\d\d)\/(\d\d)\/(\d{4}) a (\d\d)\/(\d\d)\/(\d{4})/), "período");
    const ini = p[3] + p[2] + p[1], fim = p[6] + p[5] + p[4];
    const mon = (s, v) => (s === "+" ? 1 : -1) * parseInt(v.replace(/\./g, "").replace(",", ""), 10);
    let L = txt.split("\n").map((l) => l.trim().replace(/\s{2,}/g, "  "))
      .filter((l) => l && l !== "\f" && !/^(Consulta Posição|Periodo de|Página |Lançamentos)/.test(l));
    const k0 = L.findIndex((l) => /^\d\d\/\d\d\/\d{4}\s+Saldo do Dia/.test(l));
    if (k0 < 0) throw new Error("Cresol: não encontrei o \"Saldo do Dia\" no PDF. Envie o OFX.");
    L = L.slice(k0);
    const SD = /^(\d\d)\/(\d\d)\/(\d{4})\s+Saldo do Dia:\s*([+-]) R\$ ([\d.,]+)$/;
    const IN = /^(\d\d)\/(\d\d)\/(\d{4})\s+(.+?)\s+([+-]) R\$ ([\d.,]+)$/;
    const SP = /^(\d\d)\/(\d\d)\/(\d{4})\s+([+-]) R\$ ([\d.,]+)$/;
    const SA = /^Saldo Anterior:\s*([+-]) R\$ ([\d.,]+)$/;
    let txs = []; const daily = {}; let saldoAnt = null, prev = null, i = 0, m;
    while (i < L.length) {
      const l = L[i];
      if ((m = l.match(SD))) { daily[m[3] + m[2] + m[1]] = mon(m[4], m[5]); prev = null; i++; continue; }
      if ((m = l.match(SA))) { saldoAnt = mon(m[1], m[2]); i++; continue; }
      if ((m = l.match(SP))) {
        const nxt = i + 1 < L.length && ![SD, IN, SP, SA].some((r) => r.test(L[i + 1])) ? L[i + 1] : "";
        txs.push({ d: m[3] + m[2] + m[1], v: mon(m[4], m[5]), memo: ((prev || "") + " " + nxt).trim() }); prev = null;
        i += nxt ? 2 : 1; continue;
      }
      if ((m = l.match(IN))) { txs.push({ d: m[3] + m[2] + m[1], v: mon(m[5], m[6]), memo: m[4] }); prev = null; i++; continue; }
      prev = prev === null ? l : prev + " " + l; i++;
    }
    // Regra: "DEPÓSITOS EM CHEQUES BLOQUEADOS" não entra (o banco só soma no "DESBLOQUEIO DE CHEQUE DEPOSITADO").
    txs = txs.filter((t) => !t.memo.toUpperCase().includes("CHEQUES BLOQUEADOS")).map((t, k) => ({ ...t, k }))
      .sort((a, b) => a.d.localeCompare(b.d) || a.k - b.k);
    const dias = Object.keys(daily).sort();
    const saldoFinal = dias.length ? daily[dias[dias.length - 1]] : null;
    const erros = saldoAnt == null || saldoFinal == null ? [] : conferir(saldoAnt, txs, dias.map((d) => [d, daily[d]]), saldoFinal);
    return resultado("Cresol", { bankid: "0133", conta: conta.replace(/-/g, ""), ini, fim, txs, saldoAnt, saldoFinal, erros });
  }

  /* ---------- PagueVeloz (pagueveloz2ofx.py) ---------- */
  function pagueveloz(txt) {
    const lines = txt.split("\n").map((l) => l.trim().replace(/\s{2,}/g, "  ")).filter((l) => l && l !== "\f");
    const per = exigir(txt.match(/Período:\s*(\d\d)\/(\d\d)\/(\d{4})\s*a\s*(\d\d)\/(\d\d)\/(\d{4})/), "período");
    const ini = per[3] + per[2] + per[1], fim = per[6] + per[5] + per[4];
    const conta = exigir(txt.match(/Conta:\s*([\d-]+)/), "número da conta")[1];
    const money = (s) => (s.includes("-R$") ? -1 : 1) * parseInt(s.split("R$")[1].replace(/[^\d]/g, ""), 10);
    const mf = txt.match(/Saldo Final do Período\s+(-?R\$ [\d.,]+)/);
    const saldoFinal = mf ? money(mf[1]) : null;
    const txs = [], daily = []; let dia = null, saldoAnt = null, m;
    for (const l of lines) {
      if ((m = l.match(/^(\d\d)\/(\d\d)\/(\d{4})\s+Saldo final do dia:\s*(-?R\$ [\d.,]+)/))) { dia = m[3] + m[2] + m[1]; daily.push([dia, money(m[4])]); continue; }
      if ((m = l.match(/^Saldo Anterior\s+(-?R\$ [\d.,]+)/))) { saldoAnt = money(m[1]); continue; }
      m = l.match(/^(.*?)\s+(-?R\$ [\d.,]+)$/);
      if (m && dia && !/^(Saldo Final|TIPO)/.test(l)) txs.push({ d: dia, v: money(m[2]), memo: m[1].replace(/\s+-\s*$/, "").replace(/  /g, " ") });
    }
    const ord = txs.map((t, k) => ({ ...t, k })).sort((a, b) => a.d.localeCompare(b.d) || a.k - b.k);
    const erros = saldoAnt == null || saldoFinal == null ? [] : conferir(saldoAnt, ord, daily, saldoFinal);
    return resultado("PagueVeloz", { bankid: "0000", conta: conta.replace(/-/g, ""), ini, fim, txs: ord, saldoAnt, saldoFinal, erros });
  }

  /* ---------- qual banco ---------- */
  function lerTexto(txt) {
    if (/Saldo final do dia/i.test(txt) && /Per[ií]odo:/.test(txt)) return pagueveloz(txt);
    if (/Saldo do Dia:/.test(txt) && /Periodo de/.test(txt)) return cresol(txt);
    if (/COOP\.:/.test(txt) && /PER[IÍ]ODO:/.test(txt)) return sicoob(txt);
    if (/Conta corrente/.test(txt) && /extrato/i.test(txt) && /Saldo Anterior/.test(txt)) return bb(txt);
    throw new Error("Não reconheci o banco deste PDF (a Central lê Sicoob, Banco do Brasil, Cresol e PagueVeloz). Envie o OFX ou o Excel do extrato.");
  }
  window.__CONC_PDF = async (buf) => {
    if (!window.pdfjsLib) throw new Error("A leitura de PDF não carregou. Recarregue a página ou envie o OFX.");
    let txt;
    try { txt = await textoLayout(buf); } catch (_) { throw new Error("Não consegui abrir este PDF. Envie o OFX ou o Excel do extrato."); }
    if (txt.replace(/\s/g, "").length < 50) throw new Error("Este PDF não tem texto (parece digitalizado). Envie o OFX ou o Excel do extrato.");
    return lerTexto(txt);
  };
  window.__CONC_PDF_TEXTO = lerTexto; // para testes com o texto do pdftotext
})();
