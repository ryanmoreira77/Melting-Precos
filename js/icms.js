/* Melting Preços · Conversor ICMS (regras da planilha conversor_icms_2025.xlsx)

   A "R$ Base 1" é o preço de tabela de SP, com ICMS de 18% e PIS/COFINS de 9,25% embutidos.
   Fator 0,74415 = (1 − 18%) × (1 − 9,25%): tira os impostos de SP e chega ao preço líquido.

   COTAÇÃO (Base 1 + desconto → preços para o cliente)
     sem impostos  N = Base 1 × (1 − desconto) × 0,74415
     com ICMS      P = N ÷ 0,9075 ÷ (1 − ICMS da UF)
     sem ICMS      CONSUMO:          P − (P + P × IPI) × ICMS     (o ICMS de consumo incide sobre o IPI)
                   INDUSTRIALIZAÇÃO: P × (1 − ICMS)
     IPI incluso   S = P × (1 + IPI)
     ICMS da UF: tabela de parâmetros (nacional ou importado; SP é 18% nos dois)

   REVERSÃO (preço do cliente → "preço c/ 18%" e desconto sobre a Base 1)
     SEM IMPOSTOS  Z = Y ÷ 0,74415
     COM IMPOSTOS  Z = Y × 0,9075 × (1 − ICMS) ÷ 0,74415
     SEM ICMS      volta para P (CONSUMO: Y ÷ (1 − ICMS × (1 + IPI)); INDUSTRIALIZAÇÃO: Y ÷ (1 − ICMS)) e usa a regra de COM IMPOSTOS
     IPI INCLUSO   P = Y ÷ (1 + IPI) e usa a regra de COM IMPOSTOS
     desconto equivalente = 1 − Z ÷ Base 1  (a planilha mostra Z ÷ Base 1 − 1, o mesmo número com sinal trocado) */
(function (G) {
  const I = {};
  const UF_PADRAO = { AC: [0.07, 0.04], AL: [0.07, 0.04], AM: [0.07, 0.04], AP: [0.07, 0.04], BA: [0.07, 0.04], CE: [0.07, 0.04], DF: [0.07, 0.04], ES: [0.07, 0.04], GO: [0.07, 0.04], MA: [0.07, 0.04], MG: [0.12, 0.04], MS: [0.07, 0.04], MT: [0.07, 0.04], PA: [0.07, 0.04], PB: [0.07, 0.04], PE: [0.07, 0.04], PI: [0.07, 0.04], PR: [0.12, 0.04], RJ: [0.12, 0.04], RN: [0.07, 0.04], RO: [0.07, 0.04], RR: [0.12, 0.04], RS: [0.12, 0.04], SC: [0.12, 0.04], SE: [0.07, 0.04], SP: [0.18, 0.18], TO: [0.07, 0.04] };
  I.UFS = Object.keys(UF_PADRAO);
  I.PARAMS = ["CONSUMO", "INDUSTRIALIZAÇÃO"];
  I.TIPOS = { "COM IMPOSTOS": "com ICMS (sem IPI)", "SEM IMPOSTOS": "sem impostos", "SEM ICMS": "sem ICMS", "IPI INCLUSO": "com ICMS e IPI" };

  /* parâmetros: config.js > conversor (alíquotas por UF editáveis em Ajustes) */
  I.par = function (cfg) {
    const c = (cfg && cfg.conversor) || {};
    const pis = c.pisCofins ?? 0.0925, icmsO = c.icmsOrigem ?? 0.18;
    return { pis, icmsO, fPis: 1 - pis, fLiq: (1 - icmsO) * (1 - pis), ufs: { ...UF_PADRAO, ...(c.icmsUF || {}) } };
  };
  /* origem: "I"/"IMP" = importado, o resto = nacional */
  I.importado = (origem) => /^I/i.test(String(origem || ""));
  I.aliquota = function (uf, origem, cfg) {
    const p = I.par(cfg), a = p.ufs[String(uf || "SP").toUpperCase()] || p.ufs.SP;
    return I.importado(origem) ? a[1] : a[0];
  };

  /* contexto de um produto: Base 1, IPI e origem do cadastro + UF/parâmetro/desconto do cliente */
  I.ctx = function (info, cfg, extra) {
    const c = (cfg && cfg.conversor) || {};
    return { base: info ? info.pv : null, ipi: info ? (info.ipi || 0) / 100 : 0, origem: info ? info.nacImp : "", uf: c.uf || "SP", param: c.parametro || "CONSUMO", desc: c.desconto || 0, qtd: 1, ...(extra || {}) };
  };

  /* preço líquido (sem impostos) → os quatro preços da planilha */
  function precos(N, x, cfg) {
    const p = I.par(cfg), icms = I.aliquota(x.uf, x.origem, cfg), ipi = x.ipi || 0;
    const P = N / p.fPis / (1 - icms);
    const O = x.param === "INDUSTRIALIZAÇÃO" ? P * (1 - icms) : P - (P + P * ipi) * icms;
    const S = P * (1 + ipi), q = x.qtd || 1;
    return { semImp: N, semIcms: O, comIcms: P, comIpi: S, icms, ipi, qtd: q, tot: { semImp: N * q, semIcms: O * q, comIcms: P * q, comIpi: S * q } };
  }

  /* COTAÇÃO: Base 1 com desconto */
  I.cotar = function (x, cfg) {
    if (x.base == null || !(x.base > 0)) return null;
    const p = I.par(cfg), desc = x.desc || 0;
    return { ...precos(x.base * (1 - desc) * p.fLiq, x, cfg), base: x.base, desc, base18: x.base * (1 - desc) };
  };

  /* preço c/ ICMS de um tipo qualquer → preço líquido (sem impostos) */
  I.liquido = function (y, tipo, x, cfg) {
    if (y == null || isNaN(y)) return null;
    const p = I.par(cfg), icms = I.aliquota(x.uf, x.origem, cfg), ipi = x.ipi || 0;
    let P;
    switch (tipo || "COM IMPOSTOS") {
      case "SEM IMPOSTOS": return y;
      case "SEM ICMS": P = x.param === "INDUSTRIALIZAÇÃO" ? y / (1 - icms) : y / (1 - icms * (1 + ipi)); break;
      case "IPI INCLUSO": P = y / (1 + ipi); break;
      default: P = y;
    }
    return P * p.fPis * (1 - icms);
  };

  /* REVERSÃO: preço do cliente → preço c/ 18% (equivalente à Base 1 com desconto) e desconto sobre a Base 1 */
  I.reverter = function (y, tipo, x, cfg) {
    const N = I.liquido(y, tipo, x, cfg); if (N == null) return null;
    const p = I.par(cfg), base18 = N / p.fLiq;
    return { ...precos(N, x, cfg), base18, desc: x.base ? 1 - base18 / x.base : null, base: x.base, tipo: tipo || "COM IMPOSTOS", precoCliente: y };
  };

  /* preço c/ ICMS que dá exatamente um preço líquido (para o piso de markup) */
  I.comIcmsDeLiquido = (N, x, cfg) => precos(N, x, cfg).comIcms;

  I.pct = (v, d = 2) => (v == null || isNaN(v) ? "—" : (v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: d }) + "%");
  G.MeltICMS = I;
})(window);
