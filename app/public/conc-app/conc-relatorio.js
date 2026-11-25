"use strict";
// Central (25/11/2026): relatório das conciliações em planilha, com os filtros do Histórico (conta, mês, situação, busca).
// O PDF continua sendo o "Exportar resumo em PDF" original, que já usa a mesma lista filtrada (listaHist).
// Planilha: aba "Resumo" (uma linha por conciliação) e aba "Lançamentos" (cada lançamento do extrato e do Flow, com a situação:
// conciliado, justificado, pendente ou excluído). Lê só o que já está salvo; não altera nenhuma conciliação.
async function exportarPlanilhaHist(){
  const msg=$("#histmsg"); const L=listaHist();
  if (!L.length){ msg.textContent="Nenhuma conciliação na lista."; return; }
  if (typeof XLSX==="undefined"){ msg.textContent="A biblioteca de planilhas não carregou. Recarregue a página."; return; }
  if (!S.db){ msg.textContent="O armazenamento não está disponível."; return; }
  msg.textContent="Montando a planilha…";
  const R=v=>v==null?null:v/100;
  const resumo=[["Conciliação","Conta","Início","Fim","Situação","Extrato conciliados","Extrato total","Flow conciliados","Flow total","Pendentes","Excluídos",
    "Diferença em aberto (R$)","Saldo final extrato (R$)","Saldo final Flow (R$)","Diferença de saldo (R$)","Justificativa"]];
  L.forEach(r=>{ const dS=(r.sFinE!=null&&r.sFinF!=null)?r.sFinE-r.sFinF:null;
    resumo.push([tituloResumo(r),r.banco,dBR(r.ini),dBR(r.fim),SIT[sitResumo(r)][1],r.mE,r.nE,r.mF,r.nF,(r.pE||0)+(r.pF||0),r.nExc||0,
      R(r.aberto??r.dif),R(r.sFinE),R(r.sFinF),R(dS),r.justif||""]); });
  const lanc=[["Conciliação","Conta","Origem","Data","Lançamento","Histórico","Título","Valor (R$)","Situação","Tipo ou motivo","Observação"]];
  let falhou=0;
  for (const r of L){
    let c; try{ const snap=await S.db.doc("conciliacoes/"+r.id).get(); if(!snap.exists){ falhou++; continue; } c=unpack(snap.data()); }catch(e){ falhou++; continue; }
    const mE=new Map(), mF=new Map(); (c.links||[]).forEach(l=>{ l.e.forEach(i=>mE.set(i,l)); l.f.forEach(i=>mF.set(i,l)); });
    const linha=(origem,i,m)=>{ const l=m.get(i.id), ex=(c.exc||{})[i.id], mo=(c.mot||{})[i.id]||{};
      const sit=l?"Conciliado":ex?"Excluído":mo.m?"Justificado":"Pendente";
      return [tituloResumo(r),r.banco,origem,dBR(i.d),i.h,(i.x&&i.x!==i.h)?i.x:"",i.n||"",i.v/100,sit,
        l?(TIPOS[l.tipo]||l.tipo):ex?(ex.m||""):(mo.m||""), l?(l.nota||""):ex?(ex.o||""):(mo.o||"")]; };
    (c.E||[]).forEach(i=>lanc.push(linha("Extrato",i,mE))); (c.F||[]).forEach(i=>lanc.push(linha("Flow",i,mF)));
  }
  const fmt=(ws,cols,ini)=>{ const rg=XLSX.utils.decode_range(ws["!ref"]); for(let r=ini;r<=rg.e.r;r++) cols.forEach(c=>{ const a=XLSX.utils.encode_cell({r,c}); if(ws[a]&&typeof ws[a].v==="number") ws[a].z="#,##0.00"; }); };
  const ws1=XLSX.utils.aoa_to_sheet(resumo); fmt(ws1,[11,12,13,14],1);
  ws1["!cols"]=[{wch:34},{wch:24},{wch:11},{wch:11},{wch:24},{wch:9},{wch:9},{wch:9},{wch:9},{wch:9},{wch:9},{wch:14},{wch:14},{wch:14},{wch:14},{wch:50}];
  ws1["!autofilter"]={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:resumo.length-1,c:resumo[0].length-1}})};
  const ws2=XLSX.utils.aoa_to_sheet(lanc); fmt(ws2,[7],1);
  ws2["!cols"]=[{wch:34},{wch:24},{wch:8},{wch:11},{wch:40},{wch:40},{wch:16},{wch:14},{wch:12},{wch:28},{wch:40}];
  ws2["!autofilter"]={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:lanc.length-1,c:lanc[0].length-1}})};
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws1,"Resumo"); XLSX.utils.book_append_sheet(wb,ws2,"Lançamentos");
  const nomeBanco=S.hbanco?(S.resumos.find(r=>r.bancoId===S.hbanco)||{}).banco:"";
  const parte=[nomeBanco,S.hmes||""].filter(Boolean).join("_").normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^A-Za-z0-9_-]+/g,"-");
  const nome=`Conciliacoes_${parte||new Date().toISOString().slice(0,10)}.xlsx`;
  await salvarArquivo(nome,new Blob([XLSX.write(wb,{type:"array",bookType:"xlsx"})]),msg);
  if (falhou) msg.textContent+=` (${falhou} conciliação(ões) não abriram e ficaram só no resumo)`;
}
