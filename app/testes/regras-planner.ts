// Confere que as regras de datas do planner são IGUAIS no navegador (public/planner-app/planner.js, código original)
// e no servidor (src/lib/planner/regras.ts). As duas existem por necessidade (uma roda na tela, a outra no agendador);
// este teste garante que nunca fiquem diferentes. Rodar: TZ=America/Sao_Paulo npx tsx testes/regras-planner.ts
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { Regras, mergeSettings, addDays } from "../src/lib/planner/regras";

const js = readFileSync(new URL("../public/planner-app/planner.js", import.meta.url), "utf8");
const fim = js.indexOf("function currentOccs(");
if (fim < 0) throw new Error("não achei o fim do bloco de regras no planner.js");
/** Tela nova a cada configuração (a tela guarda os feriados do ano em cache, como faz ao abrir o planner). */
function tela() {
  const ctx: Record<string, unknown> = { console, structuredClone, Intl, Date, Math, JSON, Map, Set };
  vm.createContext(ctx);
  vm.runInContext(js.slice(0, fim) + "\n;globalThis.__t={occDates,mkOcc,holidays,isBiz,nthBiz,S};", ctx);
  return ctx.__t as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

let falhas = 0, casos = 0;
const igual = (a: unknown, b: unknown, o: string) => { casos++; if (JSON.stringify(a) !== JSON.stringify(b)) { falhas++; if (falhas <= 10) console.log("DIFERENTE:", o, "\n  tela:", JSON.stringify(a), "\n  servidor:", JSON.stringify(b)); } };

const recs = [
  { type: "none" }, { type: "daily" }, { type: "weekly", days: [1, 3, 5] }, { type: "monthly", day: 31 }, { type: "monthly", day: 5 },
  { type: "monthly", mode: "biz", n: 5 }, { type: "yearly" }, { type: "interval", every: 3 },
];
const eventos = [{ id: "e1", title: "Aniversário", date: "2026-03-10", kind: "holiday", yearly: true }];
for (const cfg of [{}, { facultativos: false }, { satCount: false }, { quintoDiaUtil: false }]) {
  const settings = mergeSettings(cfg);
  const T = tela();
  T.S.settings = JSON.parse(JSON.stringify(settings));
  T.S.events = new Map(eventos.map((e) => [e.id, e]));
  const R = new Regras(settings, eventos as any); // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const y of [2025, 2026, 2027, 2028]) igual([...T.holidays(y).keys()].sort(), [...R.holidays(y).keys()].sort(), `feriados ${y} ${JSON.stringify(cfg)}`);
  for (const rec of recs) for (const start of ["2026-01-31", "2026-02-28", "2026-11-20", "2027-03-01"]) {
    const t = { id: "t", title: "x", start, rec, done: {}, urgentDays: 7, important: true };
    for (const [a, n] of [["2026-01-01", 120], ["2026-11-01", 60], ["2027-01-01", 365]] as const)
      igual(T.occDates(t, a, addDays(a, n)), R.occDates(t as any, a, addDays(a, n)), `occDates ${JSON.stringify(rec)} ${start} ${a} ${JSON.stringify(cfg)}`); // eslint-disable-line @typescript-eslint/no-explicit-any
  }
}
console.log(falhas ? `FALHOU: ${falhas} de ${casos} comparações diferentes` : `OK: ${casos} comparações iguais`);
process.exit(falhas ? 1 : 0);
