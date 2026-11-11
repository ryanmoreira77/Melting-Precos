/* Melting Preços · opções de lucro por item e análise do pedido com IA
   opcoes(): calcula, para cada produto possível, custo (melhor fornecedor), preço de venda e lucro.
   analisarIA(): manda o pedido + opções para a Claude e recebe a escolha de maior lucro com justificativa. */
(function (G) {
  const L = {};
  const E = () => G.MeltEngine, U = () => G.MeltUtil;

  /* preço de venda de referência para um produto, na ordem: tabela do cliente > preço do pedido > sugerido */
  L.precoVenda = function (pid, item, cfg, precoCliente) {
    const pc = precoCliente && precoCliente(pid);
    if (pc && pc.preco) return { valor: pc.preco, fonte: "tabela do cliente" + (pc.data ? " (" + U().dt(pc.data) + ")" : "") };
    if (item && item.preco != null) return { valor: item.preco, fonte: "preço do pedido" };
    const info = E().info(pid); const pr = info ? E().preco(info, cfg) : null;
    return pr ? { valor: pr.sugerido, fonte: "sugerido (custo × markup)" } : null;
  };

  L.opcoes = function (item, cfg, precoCliente) {
    const Eng = E(); const vistos = new Map();
    const push = (pid, compat, motivo) => { if (!pid || !Eng.prod(pid)) return; const o = vistos.get(pid); if (!o || o.compatN < compat) vistos.set(pid, { pid, compatN: compat, motivo }); };
    for (const c of item.cands || []) if (c.score >= 45) push(c.pid, c.score >= 85 ? 3 : c.score >= 60 ? 2 : 1, c.why[0] || "");
    const base = item.pid ? Eng.info(item.pid) : null;
    if (base && base.irmaos) for (const x of base.irmaos) {
      if (/SLAB/.test(x.desc)) continue;
      const larg = item.spec && item.spec.larg;
      if (larg && x.spec.larg === larg) push(x.pid, 3, `mesma medida e largura ${larg} mm`);
      else if (!larg && base.spec && x.spec.larg === base.spec.larg) push(x.pid, 2, "mesma medida, outra marca");
    }
    // correia múltipla (power band): número de canais tem que bater com o item escolhido
    const canais = (d) => { const m = /POWER\s*BAND.*?-\s*(\d{1,2})\s*(?:REXON)?\s*$/i.exec(d || "") || /POWER\s*BAND\s+\S+\s+\d+\s*-\s*(\d{1,2})\b/i.exec(d || ""); return m ? +m[1] : /POWER\s*BAND/i.test(d || "") ? -1 : 0; };
    const cBase = base ? canais(base.desc) : null;
    if (cBase != null) for (const o of vistos.values()) { const c = canais((Eng.prod(o.pid) || [])[1]); if (o.pid !== item.pid && c !== cBase && !(c === -1 || cBase === -1)) { o.compatN = 1; o.motivo = c ? `power band de ${c} canais` : "correia simples, o pedido é power band"; } }
    const qtd = item.qtd || 1, out = [];
    for (const o of vistos.values()) {
      const info = Eng.info(o.pid); if (!info) continue;
      const mf = Eng.melhorFornecedor(info);
      const custo = mf && mf.preco ? mf.preco * (1 + (mf.ipi || 0) / 100) : (Eng.custoRef(info) || {}).valor;
      const pv = L.precoVenda(o.pid, item, cfg, precoCliente);
      if (custo == null || !pv) { out.push({ ...o, info, custo: null, venda: pv ? pv.valor : null, fonteVenda: pv ? pv.fonte : "", forn: mf ? mf.forn : "", lucroUn: null, lucroTot: null, margem: null }); continue; }
      const lucroUn = pv.valor - custo;
      out.push({ ...o, info, custo, forn: mf ? mf.forn : "", prazo: mf ? mf.prazo : 0, venda: pv.valor, fonteVenda: pv.fonte, lucroUn, lucroTot: lucroUn * qtd, margem: pv.valor ? lucroUn / pv.valor : null, saldo: info.saldo });
    }
    out.sort((a, b) => b.compatN - a.compatN || (b.lucroTot ?? -1e9) - (a.lucroTot ?? -1e9));
    // a melhor opção é a de maior lucro entre as compatíveis (compatN ≥ 2); se não houver, a de maior compatibilidade
    const comp = out.filter((x) => x.compatN >= 2 && x.lucroTot != null);
    // lucro parecido (até 3% de diferença): ganha a que chega antes ao cliente
    const du = (o) => (o.info.lt ? o.info.lt.du : 99);
    const pool = (comp.length ? comp : out.filter((x) => x.compatN >= 2)).slice().sort((a, b) => (b.lucroTot ?? -1e9) - (a.lucroTot ?? -1e9));
    const topo = pool[0], perto = topo && topo.lucroTot != null ? pool.filter((o) => o.lucroTot != null && o.lucroTot >= topo.lucroTot - Math.abs(topo.lucroTot) * 0.03) : [];
    const best = perto.length > 1 ? perto.sort((a, b) => du(a) - du(b) || b.lucroTot - a.lucroTot)[0] : topo;
    if (best) best.melhor = true;
    const rap = out.filter((x) => x.compatN >= 2 && x.info.lt).sort((a, b) => du(a) - du(b))[0];
    if (rap && best && du(rap) < du(best)) rap.maisRapido = true;
    // mostra as opções com custo; sem custo, só as de mesma especificação
    return out.filter((x) => x.custo != null || x.compatN >= 3 || x.pid === item.pid).slice(0, 6);
  };
  L.compatTxt = (n) => (n >= 3 ? "compatível" : n === 2 ? "provável" : "confirmar");

  /* ---------- IA ---------- */
  L.disponivel = async function () {
    const c = G.claude;
    if (c && c.use) { const s = await c.use("sample"); if (s) return { via: "claude", s }; }
    const St = G.MeltStore;
    if (St.supaConfigured()) { try { await St.initSupabase(); if (await St.supaSession()) return { via: "supabase" }; } catch {} }
    return null;
  };

  L.montarPrompt = function (doc, itens, cfg, cliente) {
    const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
    const dados = {
      cliente: cliente ? { nome: cliente.nome, precos_salvos: Object.keys(cliente.precos || {}).length, markup_especifico: cliente.markup || null, regras_e_casos: (cliente.notas || []).slice(0, 25).map((n) => [n.assunto, n.texto, n.codigos, n.valor].filter(Boolean).join(" · ")), observacoes: cliente.obs || undefined } : { nome: doc.cliente || "não informado", novo: true },
      regras: { markup_padrao: cfg.markup.padrao, markup_minimo: cfg.markup.minimo, validade_dias: cfg.proposta.validadeDias },
      itens: itens.map((it) => ({
        n: it.n, pedido: it.texto, detalhe: it.detalhe || undefined, qtd: it.qtd || 1, un: it.un || undefined, preco_do_cliente_no_pedido: it.preco ?? undefined, entrega: it.entrega || undefined, prazo_pedido_dias: it.prazoCliente || undefined,
        medida_lida: it.spec || undefined, produto_atual: it.pid || null,
        opcoes: (it.opcoes || []).map((o) => ({
          codigo: o.pid, descricao: o.info.desc, compatibilidade: L.compatTxt(o.compatN), motivo_compat: o.motivo,
          custo_unit_com_ipi: r2(o.custo), melhor_fornecedor: o.forn || undefined, prazo_fornecedor_dias: o.prazo || undefined,
          lead_time_dias_uteis: o.info.lt ? o.info.lt.du : undefined, lead_time_base: o.info.lt ? o.info.lt.baseTxt : undefined, lead_time_confirmar: o.info.lt && o.info.lt.confirmar ? true : undefined,
          preco_venda_ref: r2(o.venda), origem_preco: o.fonteVenda, preco_tabela_cadastro: r2(o.info.pv), lucro_unit: r2(o.lucroUn), margem_pct: o.margem != null ? Math.round(o.margem * 1000) / 10 : null,
          saldo: o.saldo ?? undefined, item_de_giro: o.info.giro || undefined, compras_12m: o.info.buys.filter((b) => b.sit !== "Cancelado").length,
        })),
        alertas: (it.alertas || []).slice(0, 4),
        sugestoes: it.sug ? [...it.sug.faltas.slice(0, 3).map((x) => ({ tipo: "substituto se faltar estoque", codigo: x.pid, descricao: x.desc, motivo: x.motivo, saldo: x.saldo ?? undefined, compras_12m: x.compras, lead_time_dias_uteis: x.lt ? x.lt.du : undefined })), ...it.sug.melhor.slice(0, 2).map((x) => ({ tipo: "rendimento melhor", codigo: x.pid, descricao: x.desc, motivo: x.motivo })), ...it.sug.combina.slice(0, 3).map((x) => ({ tipo: "combina com", codigo: x.pid, descricao: x.desc, motivo: x.motivo }))] : undefined,
      })),
    };
    return `Você é analista comercial da Melting, distribuidora de correias, mangueiras e peças de manutenção industrial em São Paulo.
Analise o pedido abaixo e, para cada item, escolha a opção que dá o MAIOR LUCRO sem trocar a especificação técnica pedida pelo cliente.
Regras:
- Só escolha opção com compatibilidade "compatível" ou "provável". Se a melhor for "confirmar", diga o que conferir com o cliente.
- Se houver preço do cliente no pedido ou na tabela do cliente, respeite-o (é preço já negociado); explique se a margem estiver abaixo do mínimo.
- Se não houver preço, sugira um preço de venda que fique acima do markup mínimo e próximo do markup padrão, considerando o preço de tabela.
- Indique o fornecedor de menor custo e alertas de prazo, saldo ou largura/medida diferente.
- lead_time_dias_uteis é o prazo médio real de entrega ao cliente. Com lucro parecido, prefira a opção que chega antes. Se o cliente pediu entrega (entrega ou prazo_pedido_dias) mais curta que o lead time, avise e, se houver, ofereça substituto mais rápido. lead_time_confirmar = true: diga para confirmar o prazo com Compras.
- Em cada item informe "prazo" com o lead time da opção escolhida (ex.: "5 dias úteis").
- Siga as regras_e_casos do cliente (marca preferida, códigos já definidos, condições do portal): elas vencem a regra geral.
- Em "sugestoes" de cada item há substitutos (se faltar estoque), opções de rendimento melhor e itens que combinam. Escolha no máximo uma que faça sentido oferecer e escreva em "sugestao_cliente" uma frase curta e natural, como um vendedor técnico falaria ao cliente (ex.: "Para esta transmissão, a AX-50 dentada dura mais e aguenta polias menores"). Deixe vazio se nenhuma fizer sentido.
- Use somente os números fornecidos. Não invente custos.
Responda SOMENTE com JSON neste formato:
{"resumo":"2 a 4 frases sobre o pedido e onde está o lucro","lucro_total_estimado":número,"itens":[{"n":"número do item","codigo":"código escolhido ou vazio","preco_venda":número ou null,"fornecedor":"","lucro_unit":número ou null,"margem_pct":número ou null,"prazo":"ex.: 5 dias úteis","motivo":"por que esta opção","alertas":["..."],"sugestao_codigo":"código da sugestão ou vazio","sugestao_cliente":"frase para o cliente ou vazio"}],"negociacao":["dicas curtas de compra ou venda"]}

DADOS:
${JSON.stringify(dados)}`;
  };

  L.analisarIA = async function (prompt) {
    const d = await L.disponivel();
    if (!d) throw { code: "sem_ia", message: "IA indisponível neste modo" };
    if (d.via === "claude") return d.s.json(prompt, { modelTier: "default" });
    const St = G.MeltStore, cfg = St.settings();
    const { data, error } = await St.supa.functions.invoke((cfg.ia && cfg.ia.funcao) || "analisar-pedido", { body: { prompt } });
    if (error || (data && data.erro)) throw new Error((data && data.erro) || error.message);
    return data.resultado;
  };
  G.MeltLucro = L;
})(window);
