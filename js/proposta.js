/* Melting · PDF da proposta comercial (jsPDF + AutoTable, carregados do cdnjs quando usados) */
(function (G) {
  const P = {};
  const JSPDF = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
  const AUTOTABLE = "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js";
  const AZUL = [18, 99, 164], AZUL2 = [39, 148, 210], CINZA = [86, 102, 118], LINHA = [211, 220, 229];

  P.carregar = async function () {
    const U = G.MeltUtil;
    if (!G.jspdf) await U.loadScript(JSPDF);
    if (!G.jspdf.jsPDF.API.autoTable) await U.loadScript(AUTOTABLE);
  };

  /* dados: {numero, data, validadeDias, cliente, contato, documento, itens:[{n, codigo, descricao, qtd, un, preco, prazo, semAtendimento}], cfg} */
  P.gerar = async function (dados) {
    await P.carregar();
    const { jsPDF } = G.jspdf;
    const U = G.MeltUtil, cfg = dados.cfg, emp = cfg.empresa || {};
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const W = 210, M = 14;
    const brl = (v) => (v == null ? "a confirmar" : U.brl(v));

    // cabeçalho
    if (G.MELT_LOGO) { try { pdf.addImage(G.MELT_LOGO, "PNG", M, 12, 62, 13.6); } catch (e) {} }
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(15); pdf.setTextColor(...AZUL);
    pdf.text("PROPOSTA COMERCIAL", W - M, 17, { align: "right" });
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(9.5); pdf.setTextColor(...CINZA);
    pdf.text(`Nº ${dados.numero}`, W - M, 22.5, { align: "right" });
    pdf.text(`Emitida em ${U.dt(dados.data)} · válida até ${U.dt(U.addDias(dados.data, +dados.validadeDias || 0))}`, W - M, 27, { align: "right" });
    pdf.setDrawColor(...AZUL); pdf.setLineWidth(0.8); pdf.line(M, 31, W - M, 31);

    // cliente
    let y = 39;
    pdf.setFontSize(8); pdf.setTextColor(...CINZA); pdf.text("CLIENTE", M, y);
    pdf.text("REFERÊNCIA", W / 2 + 10, y);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(11); pdf.setTextColor(20, 32, 43);
    const cli = pdf.splitTextToSize(dados.cliente || "—", W / 2 - M);
    pdf.text(cli, M, y + 5.5);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(10);
    pdf.text(dados.documento ? `Seu pedido / cotação ${dados.documento}` : "Solicitação do cliente", W / 2 + 10, y + 5.5);
    if (dados.contato) { pdf.setFontSize(9); pdf.setTextColor(...CINZA); pdf.text(dados.contato, M, y + 6 + cli.length * 5); }
    y += 12 + cli.length * 5;

    // itens
    const linhas = dados.itens.map((it) => it.semAtendimento
      ? [String(it.n).replace(/^0+(?=\d)/, ""), "—", it.descricao, U.num(it.qtd), it.un || "", "não atendemos", "", ""]
      : [String(it.n).replace(/^0+(?=\d)/, ""), it.codigo, it.descricao, U.num(it.qtd), it.un || "", brl(it.preco), it.preco != null ? U.brl(it.preco * (it.qtd || 1)) : "—", it.prazo || ""]);
    const total = dados.itens.reduce((s, it) => s + (!it.semAtendimento && it.preco != null ? it.preco * (it.qtd || 1) : 0), 0);
    pdf.autoTable({
      startY: y, margin: { left: M, right: M },
      head: [["Item", "Código", "Descrição", "Qtd", "Un", "Preço un.", "Total", "Prazo"]],
      body: linhas,
      foot: [["", "", "", "", "", "Total", U.brl(total), ""]],
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 2.2, lineColor: LINHA, lineWidth: 0.1, textColor: [20, 32, 43], valign: "top" },
      headStyles: { fillColor: AZUL, textColor: 255, fontStyle: "bold", fontSize: 8 },
      footStyles: { fillColor: [227, 239, 249], textColor: AZUL, fontStyle: "bold", fontSize: 9.5 },
      alternateRowStyles: { fillColor: [245, 248, 251] },
      columnStyles: { 0: { cellWidth: 11 }, 1: { cellWidth: 20 }, 2: { cellWidth: "auto" }, 3: { cellWidth: 13, halign: "right" }, 4: { cellWidth: 10 }, 5: { cellWidth: 24, halign: "right" }, 6: { cellWidth: 25, halign: "right" }, 7: { cellWidth: 20 } },
      didParseCell: (d) => { if (d.section === "foot" && (d.column.index === 5 || d.column.index === 6)) d.cell.styles.halign = "right"; },
    });
    y = pdf.lastAutoTable.finalY + 9;

    // sugestões oferecidas
    if ((dados.sugestoes || []).length) {
      if (y > 240) { pdf.addPage(); y = 20; }
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(10); pdf.setTextColor(...AZUL); pdf.text("SUGESTÕES MELTING PARA O SEU PEDIDO", M, y); y += 2;
      pdf.autoTable({ startY: y, margin: { left: M, right: M },
        head: [["Código", "Produto", "Por que", "Preço un."]],
        body: dados.sugestoes.map((x) => [x.pid, x.desc, x.frase, x.preco != null ? U.brl(x.preco) : "a confirmar"]),
        styles: { font: "helvetica", fontSize: 8, cellPadding: 2, lineColor: LINHA, lineWidth: 0.1, textColor: [20, 32, 43] },
        headStyles: { fillColor: AZUL2, textColor: 255, fontStyle: "bold", fontSize: 8 },
        columnStyles: { 0: { cellWidth: 18 }, 1: { cellWidth: 60 }, 2: { cellWidth: "auto" }, 3: { cellWidth: 24, halign: "right" } } });
      y = pdf.lastAutoTable.finalY + 9;
    }
    // condições
    const p = cfg.proposta || {};
    const cond = [["Validade da proposta", `${p.validadeDias} dias`], ["Condição de pagamento", p.pagamento || "—"], ["Frete", p.frete || "—"]];
    if (y > 250) { pdf.addPage(); y = 20; }
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(10); pdf.setTextColor(...AZUL); pdf.text("CONDIÇÕES COMERCIAIS", M, y); y += 5.5;
    pdf.setFontSize(9.5);
    for (const [k, v] of cond) { pdf.setFont("helvetica", "normal"); pdf.setTextColor(...CINZA); pdf.text(k, M, y); pdf.setTextColor(20, 32, 43); pdf.text(String(v), M + 48, y); y += 5; }
    if (emp.observacoes) {
      y += 3; pdf.setFontSize(8.5); pdf.setTextColor(...CINZA);
      const ob = pdf.splitTextToSize(emp.observacoes, W - 2 * M); pdf.text(ob, M, y); y += ob.length * 4;
    }
    // assinatura
    y += 8; if (y > 265) { pdf.addPage(); y = 25; }
    pdf.setFontSize(9.5); pdf.setTextColor(20, 32, 43);
    pdf.text(pdf.splitTextToSize(cfg.empresa.assinatura || "", 90), M, y);

    // rodapé em todas as páginas
    const n = pdf.getNumberOfPages();
    const rod = [emp.nome, emp.cnpj ? "CNPJ " + emp.cnpj : "", emp.endereco, emp.telefone, emp.email, emp.site].filter(Boolean).join("  ·  ");
    for (let i = 1; i <= n; i++) {
      pdf.setPage(i); pdf.setDrawColor(...AZUL2); pdf.setLineWidth(0.4); pdf.line(M, 284, W - M, 284);
      pdf.setFontSize(7.5); pdf.setTextColor(...CINZA);
      pdf.text(pdf.splitTextToSize(rod, W - 2 * M - 20), M, 288);
      pdf.text(`${i}/${n}`, W - M, 288, { align: "right" });
    }
    return { blob: pdf.output("blob"), base64: pdf.output("datauristring").split(",")[1], total };
  };
  G.MeltProposta = P;
})(window);
