/* Motor de recomendação Melting — leitura de pedidos, identificação de itens e regras */
(function (G) {
  const E = {};
  let SALDO = null, CODIGO = new Map(), INTERNO = new Map(), D, P, BY, FX, CUT, MPCUT, KIT, FTM, FTMPID, REF, APE, TOK, EQ, FICHA, GIRO, IDX, NPROD;

  /* ---------- aprendizado: correções do usuário ---------- */
  const APR = { nao: new Set(), sim: new Set(), mapa: new Map() };
  E.chave = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  E.setAprendizado = (a) => { APR.nao = new Set((a && a.nao) || []); APR.sim = new Set((a && a.sim) || []); APR.mapa = new Map(Object.entries((a && a.mapa) || {})); };
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  const key = (s) => norm(s).replace(/[^A-Z0-9]/g, "");
  const toks = (s) => norm(s).split(/[^A-Z0-9.]+/).map((t) => t.replace(/^\.+|\.+$/g, "")).filter(Boolean);
  const STOP = new Set("DE DA DO EM E COM PARA PC PCS PÇ UN UND EA EACH MM MT M X A O OS AS POR TIPO REF COD CODIGO ITEM QTD QTDE UNID".split(" "));
  E.norm = norm; E.key = key;

  function push(m, k, v) { if (!k) return; let a = m.get(k); if (!a) m.set(k, (a = [])); a.push(v); }

  let LT = {}, LTB = [];
  /* lead time (prazo de entrega) do kit Melting: dias úteis do pedido do cliente até a entrega */
  const LT_BASE_TXT = { "vendas": "mediana das entregas a clientes", "vendas (1 pedido)": "uma entrega a cliente", "estoque (item de giro)": "item de giro em estoque", "compras + 2": "prazo real de compra + 2 dias", "fornecedor + 2": "prazo do fornecedor + 2 dias", "família (compras reais)": "média da família (compras)", "família (prazo do fornecedor)": "média da família (fornecedor)", "família (mín. 5, sem estoque)": "média da família, sem estoque", "sem base (padrão 10)": "sem histórico, padrão 10 dias" };
  E.lt = function (pid) {
    const r = LT[pid]; if (!r) return null;
    const base = LTB[r[1]] || "", du = r[0], dc = Math.ceil((du * 7) / 5);
    const proprio = /^(vendas|estoque|compras|fornecedor)/.test(base);
    return { du, dc, base, baseTxt: LT_BASE_TXT[base] || base, nv: r[2], nc: r[3], confirmar: !!r[4], proprio, txt: du === 1 ? "1 dia útil" : du + " dias úteis", curto: du + "d úteis" };
  };
  E.ltTem = () => LTB.length > 0;
  E.init = function (data) {
    D = data; P = new Map(); BY = new Map(); FX = new Map(); CUT = new Map(); MPCUT = new Map(); KIT = new Map();
    FTM = new Map(); FTMPID = new Map(); REF = new Map(); APE = new Map(); TOK = new Map(); EQ = new Map(); FICHA = new Map();
    GIRO = new Set(D.giro); IDX = D.idx; LT = (D.lt && D.lt.m) || {}; LTB = (D.lt && D.lt.bases) || [];
    for (const r of D.prod) {
      P.set(r[0], r);
      push(APE, key(r[2]), r[0]);
      const m = /^FTM\s+(\d+)\s*\*/.exec(r[1]); if (m) FTMPID.set(m[1], r[0]);
    }
    NPROD = D.prod.length;
    for (const b of D.buys) { push(BY, b[0], b); if (b[11]) push(REF, key(b[11]), { pid: b[0], src: "pedido de cliente " + (b[10] || ""), dt: b[1] }); }
    for (const f of D.fxp) push(FX, f[0], f);
    for (const c of D.cortes) { CUT.set(c[0], c); push(MPCUT, c[2], c); if (c[5]) push(REF, key(c[5]), { pid: c[0], src: "ref. cliente no corte" }); }
    INTERNO = new Map();
    for (const k of D.kits) { KIT.set(k[0], k); if (k[1]) { CODIGO.set("SGM" + (+k[1]), k[0]); INTERNO.set("SGM" + (+k[1]), { tipo: "SGM", row: k }); } }
    for (const c of D.cortes) if (c[7]) { const t = c[1] ? "MECTROL" : "NITTA"; CODIGO.set(t + (+c[7]), c[0]); INTERNO.set(t + (+c[7]), { tipo: t, row: c }); }
    for (const r of D.prod) { const m = /^(FTM|NITTA|MECTROL|SGM)\s*-?\s*(\d+)\s*\*/.exec(r[1]); if (m && !CODIGO.has(m[1] + (+m[2]))) CODIGO.set(m[1] + (+m[2]), r[0]); }
    for (const t of D.ftm) { FTM.set(t[0], t); const pid = FTMPID.get(t[0]); if (t[9] && pid) push(REF, key(t[9]), { pid, src: "ref. cliente na FTM" }); }
    for (const e of D.equiv) push(EQ, key(e[1]), e);
    for (const f of D.fichas) FICHA.set(f[0], f);
    return { produtos: NPROD, compras: D.buys.length };
  };
  function tokIndex() {
    if (TOK.size) return;
    for (const r of D.prod) {
      const set = new Set(toks(r[1] + " " + r[2]));
      for (const t of [...set]) if (/\d/.test(t) && /[A-Z]/.test(t) && t.length <= 14) for (const x of t.split(/(?<=\d)(?=[A-Z])|(?<=[A-Z])(?=\d)/)) if (x.length >= 1) set.add(x);
      for (const t of set) if (!STOP.has(t)) push(TOK, t, r[0]);
    }
  }

  /* ---------- PDF: itens de texto do pdf.js -> linhas com espaçamento parecido com o layout ---------- */
  E.linesFromPdfItems = function (items) {
    const rows = [];
    for (const it of items) {
      if (!it.str || !it.str.trim()) continue;
      const y = it.transform[5], x = it.transform[4], w = it.width || it.str.length * 4;
      let row = rows.find((r) => Math.abs(r.y - y) < 2.5);
      if (!row) rows.push((row = { y, parts: [] }));
      row.parts.push({ x, w, s: it.str });
    }
    rows.sort((a, b) => b.y - a.y);
    return rows.map((r) => {
      r.parts.sort((a, b) => a.x - b.x);
      let out = "", end = null;
      for (const p of r.parts) {
        if (end !== null) { const gap = p.x - end; out += gap > 12 ? "     " : gap > 1.5 ? " " : ""; }
        out += p.s; end = p.x + p.w;
      }
      return out;
    }).join("\n");
  };

  const num = (s) => {
    if (s == null) return null; s = String(s).trim();
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^\d+,\d+$/.test(s)) s = s.replace(",", ".");
    else s = s.replace(/,(?=\d{3}\b)/g, "");
    const v = parseFloat(s); return isNaN(v) ? null : v;
  };
  E.num = num;
  const MESES = { JANEIRO: 1, FEVEREIRO: 2, MARCO: 3, ABRIL: 4, MAIO: 5, JUNHO: 6, JULHO: 7, AGOSTO: 8, SETEMBRO: 9, OUTUBRO: 10, NOVEMBRO: 11, DEZEMBRO: 12,
    JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, MAY: 5, JUNE: 6, JULY: 7, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12 };
  const MES3 = { JAN: 1, FEV: 2, FEB: 2, MAR: 3, ABR: 4, APR: 4, MAI: 5, MAY: 5, JUN: 6, JUL: 7, AGO: 8, AUG: 8, SET: 9, SEP: 9, OUT: 10, OCT: 10, NOV: 11, DEZ: 12, DEC: 12 };
  function parseDate(s) {
    s = norm(s);
    let m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s); if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    m = /([A-Z]+)\s+(\d{1,2}),?\s+(\d{4})/.exec(s); if (m && MESES[m[1]]) return `${m[3]}-${String(MESES[m[1]]).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    m = /(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return m[0];
    m = /(\d{1,2})[-\/ ]([A-Z]{3})[-\/ ](\d{4})/.exec(s); // 23-NOV-2026, 20-OUT-2026 (Oracle)
    if (m && MES3[m[2]]) return `${m[3]}-${String(MES3[m[2]]).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return "";
  }

  /* ---------- o que é produto e o que é dado do documento ---------- */
  // família do item → palavras que a identificam (português, abreviações do cadastro e inglês de pedidos SAP)
  const FAMILIAS = {
    CORREIA: "CORREIA CORREIAS CORR SLAB BELT BELTS TIMING V-BELT VBELT POLYBELT POWERBAND SIEGLING HABASIT CHIORINO AMMERAAL OPTIBELT BANDO MEGADYNE BRECOFLEX",
    MANGUEIRA: "MANGUEIRA MANGUEIRAS MANG MANGOTE HOSE HOSES TUBOFLEX FTM",
    TERMINAL: "TERMINAL TERMINAIS TERM FITTING FITTINGS CAPA FERRULE",
    ENGATE: "ENGATE ENGATES COUPLING COUPLER ACOPLAMENTO",
    CONEXAO: "CONEXAO CONEXOES CONEX CONECTOR CONNECTOR ADAPTADOR ADAPT ADAPTER NIPLE NIPPLE COTOVELO ELBOW CURVA TEE UNIAO LUVA REDUCAO BUJAO PLUG ESPIGAO JOELHO BANJO FLANGE FEMEA MACHO",
    POLIA: "POLIA POLIAS PULLEY SPROCKET ENGRENAGEM BUCHA BUSHING",
    BORRACHA: "BORRACHA BORRACHAS BORR RUBBER LENCOL LENCOIS SHEET PERFIL CORDAO ORING O-RING ANEL ANEIS GAXETA GASKET JUNTA VEDACAO SEAL RETENTOR COXIM GUARNICAO REVESTIMENTO EMBORRACHAMENTO PLACA CHAPA MANTA TARUGO",
    TUBO: "TUBO TUBOS TUBE TUBING TUBONYLON DUTO",
    PNEUMATICA: "PNEUMATICA CILINDRO CYLINDER VALVULA VALV VALVE REGULADOR FILTRO FILTER LUBRIFICADOR SILENCIADOR MANOMETRO",
    TRANSPORTE: "ESTEIRA ESTEIRAS CONVEYOR ROLETE ROLO RASPADOR TALISCA EMENDA GRAMPO FLEXCO CORRENTE CHAIN",
    FIXACAO: "ABRACADEIRA ABRACADEIRAS CLAMP CINTA PARAFUSO PORCA ARRUELA PINO MOLA SPRING ANILHA ROLAMENTO BEARING",
    QUIMICO: "ADESIVO COLA LOCTITE SILICONE VULCANIZADOR FITA",
    KIT: "KIT KITS SGM CONJUNTO JOGO",
    NITTA: "NITTA MECTROL MELTPOWER",
  };
  const MARCAS = "GATES OPTIBELT CONTITECH HABASIT SIEGLING CHIORINO AMMERAAL PARKER CAMOZZI FESTO REXON BANDO GOODYEAR SKF BINLONG DAYCO FENNER MEGADYNE BRECOFLEX VULCOPOWER HELLERMANN TECALON SMC MICRO METALPLAN VEDABRAS".split(" ");
  const VOCAB = new Map();
  for (const [fam, ws] of Object.entries(FAMILIAS)) for (const w of ws.split(" ")) VOCAB.set(w.replace(/[^A-Z]/g, ""), fam);
  for (const m of MARCAS) if (!VOCAB.has(m)) VOCAB.set(m, "MARCA");
  // perfis de correia em V / sincronizadora reconhecidos mesmo sem a palavra "correia" (A-50, 5V1500, SPB 2000, 225 3M 9, XL, AT10…)
  const PERFIL_V = /(?<![A-Za-z0-9:])[ABCDE]\s?-?\s?\d{2,3}(?![\d:,.])/; // A-50, B 60 (só maiúscula: "dias 16 e 31" não conta)
  const PERFIL_COD = /(?<![A-Z0-9:])(?:[358]VX?\s?-?\s?\d{3,4}|SP[ZABC]\s?-?\s?\d{3,5}|XP[ZABC]\s?-?\s?\d{3,5}|[ABC]X\s?-?\s?\d{2,3}|\d{2,5}\s?-?\s?(?:S?\d{1,2}M|HTD\d*M?|AT\d{1,2}|T\d{1,2}(?:[.,]5)?)\b|\d{3,4}\s?(?:XL|XXH|XH|MXL|L|H)\s?\d{3}\b)(?![:H]\d)/;
  // linhas de cabeçalho, endereço, impostos e conversa: nunca são itens
  const NAO_PRODUTO = /\b(INSCRI[CÇ][AÃ]O|INSC\.?\s*EST|I\.\s?E\.|CNPJ|CPF|CEP|ENDERE[CÇ]O|BAIRRO|CIDADE|MUNIC[IÍ]PIO|UF\s*:|TELEFONE|CELULAR|FONE|FAX|E-?MAIL|WWW\.|HTTPS?:|RAZ[AÃ]O SOCIAL|NOME FANTASIA|FORNECEDOR|CLIENTE\s*:|COMPRADOR|SOLICITANTE|VENDEDOR|REPRESENTANTE|CONTATO|DATA\s*(DE|DA|DO)?\s*(EMISS|ENTREGA|ORDEM|PEDIDO)?\s*:|EMISS[AÃ]O|VENCIMENTO|VALIDADE|P[AÁ]GINA|SUB-?TOTAL|VALOR TOTAL|TOTAL\s*(GERAL|DO PEDIDO|L[IÍ]QUIDO)?\s*:|CONDI[CÇ](?:[AÃ]O|[OÕ]ES)|PAGAMENTO|FRETE\s*:|TRANSPORTADORA|INCOTERM|BANCO|AG[EÊ]NCIA|CONTA CORRENTE|\bPIX\b|ICMS|\bIPI\b|\bPIS\b|COFINS|\bNCM\b|CFOP|NOTA FISCAL|OBSERVA[CÇ][AÃ]O|N[º°O]\.?\s*(DO )?PEDIDO|PEDIDO DE COMPRA\s*N|ORDEM DE COMPRA|HOR[AÁ]RIO|FUNCIONAMENTO|RECEBIMENTO|EXPEDIENTE|PORTARIA|DOCA|ALMOXARIFADO|LOCAL DE ENTREGA|ENDERE[CÇ]O DE ENTREGA|PRAZO DE ENTREGA|DATA DE ENTREGA|CENTRO DE CUSTO|REQUISI[CÇ][AÃ]O|APROVAD[OA] POR|APROVA[CÇ][AÃ]O|SUJEITO|FAVOR|MENCIONAR|DEVE(?:M|R[AÃ]O)? (?:CONSTAR|CONTER|SER)|\bNF\b|\bDANFE\b|MOEDA|\bBRL\b|\bDDL\b|SEGUNDA A SEXTA|SEGUNDA-FEIRA|SEXTA-FEIRA|\bLTDA\b|EIRELI|\bS\.?\s?\/?\s?A\.?$|\bME\s*$|MELTING PRODUTOS|PRODUTOS P(?:ARA|\.)? MANUTEN|VLR\.?\s*UNIT|VALOR UNIT|PRE[CÇ]O UNIT|QTDE?\.?\s+UN|UNID\.?\s+QTD|ITEM\s+(?:C[OÓ]D|DESCRI)|ATENCIOSAMENTE|OBRIGAD|BOM DIA|BOA TARDE|BOA NOITE|PREZAD|AGUARDO)\b|^(OL[AÁ]|OI|ATT|AV\.?|AVENIDA|RUA|ROD\.?|RODOVIA|ESTRADA|ALAMEDA)\b|@/i;
  // estes nunca são item, mesmo que a linha tenha número ou palavra parecida com produto
  const SEMPRE_FORA = /\b(INSCRI[CÇ][AÃ]O|INSC\.?\s*EST|CNPJ|CPF|CEP|TELEFONE|CELULAR|FONE|FAX|E-?MAIL|WWW\.|HTTPS?:|RAZ[AÃ]O SOCIAL|HOR[AÁ]RIO|FUNCIONAMENTO|EXPEDIENTE|\bLTDA\b|EIRELI|MELTING PRODUTOS|PRODUTOS P(?:ARA|\.)? MANUTEN|BAIRRO|MUNIC[IÍ]PIO|BLOCO|SALA|ANDAR|GALP[AÃ]O|QUADRA|LOTEAMENTO|DISTRITO INDUSTRIAL|CENTRO DE CUSTO|ICMS|COFINS|\bNCM\b|CFOP|BANCO|AG[EÊ]NCIA|\bPIX\b)\b|^(RUA|AV\.?|AVENIDA|ROD\.?|RODOVIA|ESTRADA|ALAMEDA)\s|@/i;
  const U2 = (v) => String(Math.round(v * 10) / 10).replace(".", ",");
  E.familiaDe = function (text) {
    for (const t of norm(text).split(/[^A-Z0-9-]+/)) { const k = t.replace(/[^A-Z]/g, ""); const f = VOCAB.get(k); if (f && f !== "MARCA") return f; }
    return null;
  };
  // devolve null se é produto, ou o motivo para ignorar a linha
  const FUNC = new Set("DE DO DA DOS DAS E OU O A OS AS QUE PARA COM EM NO NA NOS NAS SE SER SERA SERAO POR PELO PELA PELOS PELAS UM UMA AO AOS SEU SUA SEUS SUAS NAO MAIS ESTE ESTA DESTE DESTA NESTA NESTE QUALQUER QUAISQUER TODOS TODAS TODO TODA COMO ENTRE SOBRE APOS ATE CASO DEVE DEVERA DEVERAO CONFORME AINDA BEM ONDE QUANDO QUAL QUAIS SEM SOB SOMENTE APENAS TAMBEM THE AND OF TO IN FOR WITH".split(" "));
  E.prosa = function (t) {
    const ws = E.chave(t).split(" ").filter((w) => /^[A-Z]{1,}$/.test(w));
    const f = ws.filter((w) => FUNC.has(w)).length;
    return (ws.length >= 12 && f / ws.length >= 0.28) || ws.length >= 28 || (ws.length >= 9 && f >= 4 && /[.;:]\s*$/.test(t.trim()));
  };
  E.motivoNaoProduto = function (text) {
    const t = String(text || "").trim();
    if (t.length < 3) return "linha vazia";
    const k = E.chave(t);
    if (APR.sim.has(k)) return null;
    if (APR.nao.has(k)) return "você marcou como não produto";
    if (E.prosa(t)) return "texto corrido (termos, condições ou observações)";
    if (SEMPRE_FORA.test(t)) return "dado do documento (cadastro, endereço, contato ou impostos)";
    if (/\b\d{1,2}\s?(?:H|:\d{2}\s?H?)\s*(?:[AÀÁ]S?|ATE|-|A)\s*\d{1,2}(?::\d{2})?\s?H?\b/i.test(t) || /\b\d{1,2}:\d{2}\s?H\b/i.test(t)) return "horário";
    const up = norm(t);
    const palavras = up.split(/[^A-Z0-9-]+/).map((w) => w.replace(/[^A-Z]/g, ""));
    const forte = palavras.some((w) => VOCAB.has(w)) || PERFIL_COD.test(up) || PERFIL_V.test(t);
    if (NAO_PRODUTO.test(t) && !(forte && /\d/.test(t))) return "dado do documento ou conversa";
    if (forte) return null;
    // código conhecido: apelido do cadastro (com número) ou código de concorrente com equivalência
    const tt = toks(t);
    for (let i = 0; i < tt.length; i++) for (let j = 1; j <= 3 && i + j <= tt.length; j++) {
      const k = tt.slice(i, i + j).join("").replace(/[^A-Z0-9]/g, "");
      if (k.length >= 4 && /\d/.test(k) && /[A-Z]/.test(k) && (APE.has(k) || EQ.has(k))) return null;
    }
    if (/\b(?:c[oó]d(?:igo)?\.?(?:\s*melting)?|melting)\s*[:.]?\s*(?=[A-Z0-9]*\d)[A-Z0-9]{3,}\b/i.test(t)) return null;
    return "não parece produto (sem tipo de peça, perfil ou código conhecido)";
  };

  /* ---------- leitura do documento ---------- */
  E.parseDoc = function (text) {
    const lines = text.replace(/\r/g, "").split("\n");
    const doc = { cliente: "", documento: "", data: "", canal: "", itens: [] };
    const nomeEmp = /(?:Nome Empresarial|Raz[aã]o Social|Cliente|Comprador Empresa)\s*:\s*([^:]+?)(?:\s{3,}|$)/i;
    for (const l of lines) { const m = nomeEmp.exec(l); if (m && !/MELTING/i.test(m[1]) && m[1].trim().length > 3) { doc.cliente = m[1].trim(); break; } }
    for (const l of lines.slice(0, 40)) {
      const t = l.trim();
      if (!doc.cliente && /\b(LTDA|S\.?\/?A\b|EIRELI|INDUSTRIA|COMERCIAL)\b/i.test(t) && !/MELTING/i.test(t)) { const seg = t.split(/\s{3,}/).find((x) => /\b(LTDA|S\.?\/?A\b|EIRELI|INDUSTRIA|COMERCIAL)\b/i.test(x) && !/:/.test(x)); if (seg) doc.cliente = seg.trim(); }
      if (!doc.documento) { const mo = /^PEDIDO\s+(\d{5,})\b/i.exec(t); if (mo) { doc.documento = mo[1]; const d = parseDate(t); if (d) doc.data = d; } }
      let m = /(Ordem de Compra|Pedido|Cota[cç][aã]o|RFQ|Solicita[cç][aã]o)[^:\n]*?(?:N[uú]mero|N[º°o]\.?|#)?[^:\n]*:\s*([A-Z0-9\-\/\.]{4,})/i.exec(t);
      if (m && !doc.documento) doc.documento = m[2];
      m = /Data[^:\n]*:\s*(.+)$/i.exec(t); if (m && !doc.data) doc.data = parseDate(m[1]);
    }
    // nome da empresa quebrado em duas linhas (ex.: "PROCTER & GAMBLE INDUSTRIAL E" / "COMERCIAL LTDA")
    const ci = doc.cliente ? lines.findIndex((l) => l.trim().startsWith(doc.cliente)) : -1;
    if (ci > 0) { const prev = lines[ci - 1].trim().split(/\s{3,}/)[0]; if (/(\sE|&)$/.test(prev)) doc.cliente = prev + " " + doc.cliente; }
    if (ci >= 0 && /(\sE|&)$/.test(doc.cliente) && lines[ci + 1]) doc.cliente += " " + lines[ci + 1].trim().split(/\s{3,}/)[0];
    if (/S[aã]o Paulo|SAP NetWeaver|Ordem de Compra/i.test(text)) doc.canal = "PDF";
    { const q = /\b(?:FM\s*)?Quote\s*#?\s*(\d{4,})|Cota[cç][aã]o Melting\s*(?:n[º°o]\.?)?\s*(\d{4,})/i.exec(text); if (q) doc.refMelting = q[1] || q[2]; }

    // 0a) Mercado Eletrônico (Nestlé e outros portais ME): "1. - Correia ..." + bloco "Preço Unitário  Quantidade  Código"
    if (/Mercado Eletr[oô]nico|SERIAL ME|me\.com\.br/i.test(text) && /Itens\s*\(\d+\)/i.test(text)) {
      const mp = /PEDIDO\s+(\d{6,})/i.exec(text); if (mp) doc.documento = mp[1];
      const mc = /Criado em\s+(\d{2}\/\d{2}\/\d{4})/i.exec(text); if (mc) doc.data = parseDate(mc[1]);
      const im = lines.findIndex((l) => /^#ME\s*\d+/.test(l.trim()));
      if (im >= 0 && lines[im + 1]) doc.cliente = lines[im + 1].trim().split(/\s+-\s+/)[0];
      const PAG = /^\d{2}\/\d{2}\/\d{4},\s*\d{1,2}:\d{2}|^https?:\/\/\S*me\.com\.br/i;
      const INI = /^(\d{1,3})\.\s*-\s*(.+?)\s*(?:\[Ver (?:menos|mais)\])?\s*$/i;
      let cur = null, esp = "";
      for (const l of lines) {
        const t = l.trim(); if (!t || PAG.test(t)) continue;
        if (/^(Norma de Fornecimento|TERMOS E CONDI)/i.test(t)) break;
        const m = INI.exec(t);
        if (m && !cur || (m && esp === "")) { cur = { n: m[1].padStart(2, "0"), codCli: "", texto: m[2].trim(), detalhe: "", qtd: null, un: "", preco: null, entrega: "", codMelting: "", fabricante: "" }; doc.itens.push(cur); esp = "det"; continue; }
        if (!cur) continue;
        if (/^Pre[cç]o Unit[aá]rio\s+Quantidade/i.test(t)) { esp = "valores"; continue; }
        if (/^C[oó]digo Produto Cliente/i.test(t)) { esp = "codigo"; continue; }
        if (/^Prazo Para Entrega/i.test(t)) { esp = "prazo"; continue; }
        if (esp === "valores") { const v = /(?:BRL|R\$)\s*([\d.,]+)\s+([\d.,]+)\s+(\S+)/i.exec(t); if (v) { cur.preco = num(v[1]); cur.qtd = num(v[2]); cur.codCli = v[3].replace(/^0+(?=\d)/, ""); } esp = "itemfim"; continue; }
        if (esp === "codigo") { const v = t.split(/\s{2,}|\s+/); if (v.length >= 3) cur.un = v[v.length - 1].toUpperCase(); esp = "itemfim"; continue; }
        if (esp === "prazo") { const v = /^(\d+)\s*\(dias\)/i.exec(t); if (v) cur.prazoCliente = +v[1]; esp = "itemfim"; continue; }
        if (esp === "det" && cur.detalhe.length < 400) cur.detalhe += (cur.detalhe ? " " : "") + t;
        if (m && esp === "itemfim") { cur = { n: m[1].padStart(2, "0"), codCli: "", texto: m[2].trim(), detalhe: "", qtd: null, un: "", preco: null, entrega: "", codMelting: "", fabricante: "" }; doc.itens.push(cur); esp = "det"; }
      }
      for (const it of doc.itens) { it.detalhe = it.detalhe.replace(/N\s?U\s?M\s?E\s?R\s?O\s+D\s?E\s+DENTES/i, "NUMERO DE DENTES").replace(/\s+/g, " "); if (it.prazoCliente) it.detalhe += ` · prazo pedido: ${it.prazoCliente} dias`; }
      if (doc.itens.length) { doc.formato = "Mercado Eletrônico"; return doc; }
    }
    // 0) Layout Oracle (Alcoa/Alumar e outros): "1   23-NOV-2026   108 m   BRL   59.35   6,409.80" e a descrição na linha de baixo
    if (/\bItem\b.*Produto\s*\/\s*Servi[cç]o.*Quantidade/i.test(text)) {
      const ROW = /^\s*(\d{1,4})\s+(\d{1,2}-[A-Z]{3}-\d{4})\s+([\d.,]+)\s+([A-Za-zÇç]{1,5})\s+([A-Z]{3})\s+([\d.,]+)(?:\s+([\d.,]+))?(?:\s+([\d.,]+))?/i;
      const STOP = /^(Solicitante\s*:?\s*$|Entrega\s*\/\s*Faturamento|Total Geral|N[º°]\s|PEDIDO\s+\d|Item\s+Produto|LALU_|Comprador:|DE COMPRA$)/i;
      let cur = null, fase = 0;
      for (const l of lines) {
        const t = l.trim(); if (!t) continue;
        const m = ROW.exec(t);
        if (m) {
          const vals = [m[6], m[7], m[8]].filter(Boolean).map(num);
          cur = { n: m[1].padStart(2, "0"), codCli: "", texto: "", detalhe: "", qtd: num(m[3]), un: m[4].toUpperCase(), preco: vals[0], ipi: vals.length > 2 ? vals[1] : null, entrega: parseDate(m[2]), codMelting: "", fabricante: "" };
          doc.itens.push(cur); fase = 1; continue;
        }
        if (!cur) continue;
        if (STOP.test(t)) { if (/Total Geral|Entrega\s*\/\s*Faturamento|PEDIDO\s+\d/i.test(t)) cur = null; continue; }
        const limpo = t.replace(/Long Description\s*:?/i, "").replace(/^Solicitante\s*:?/i, "").replace(/\s{3,}Email\s*:?.*$/i, "").replace(/\s{3,}\S+@\S+.*$/, "").trim();
        if (!limpo || /@/.test(limpo) || /^Email\s*:?$/i.test(limpo) || /^[A-ZÀ-Ú ]+,\s*$/.test(limpo)) continue;
        if (fase === 1) { cur.texto = limpo.split(/\s{3,}/)[0]; fase = 2; }
        else if (cur.detalhe.length < 300) cur.detalhe += (cur.detalhe ? " " : "") + limpo;
      }
      if (doc.itens.length) { doc.formato = "Pedido Oracle"; return doc; }
    }

    // 1) Layout SAP (P&G, Unilever, Ambev...): "00010 31418124 DESCRICAO   1  EA - Each  31.59 / 1 ..."
    const SAP = /^\s*(\d{5})\s+([A-Z0-9\-\.]{4,})\s+(.+?)\s{2,}([\d.,]+)\s+([A-Z]{1,4})\s*-\s*[A-Za-z]+\s+([\d.,]+)\s*\/\s*[\d.,]+(?:.*?([A-Z][a-z]+\s+\d{1,2},\s*\d{4}|\d{2}\/\d{2}\/\d{4}))?/;
    let cur = null;
    const fim = /^(Contrato|Valor total|PROCTER|Numero da Ordem|Avenida|Página|Ordem de Compra|Fornecedor:|\d{5}-\d{3})/i;
    for (const l of lines) {
      const m = SAP.exec(l);
      if (m) {
        cur = { n: m[1], codCli: m[2], texto: m[3].trim(), qtd: num(m[4]), un: m[5], preco: num(m[6]), entrega: m[7] ? parseDate(m[7]) : "", codMelting: "", fabricante: "" };
        doc.itens.push(cur); continue;
      }
      if (!cur) continue;
      const t = l.trim(); if (!t) continue;
      let mm = /N[uú]mero da pe[cç]a do fabricante:*\s*(\S+)/i.exec(t); if (mm) { cur.codMelting = mm[1]; continue; }
      mm = /^Fabricante:*\s*(.+)$/i.exec(t); if (mm) { cur.fabricante = mm[1].trim(); continue; }
      if (fim.test(t)) { cur = null; continue; }
      if (/^(Consumption|Consumo)$/i.test(t.replace(/^\S+\s+/, "")) || /Consumption/i.test(t)) { cur.texto += " " + t.replace(/\s*\b(\d+\s*)?Consumption\b.*/i, "").trim(); continue; }
      if (t.length < 80) cur.texto += " " + t;
    }
    doc.itens.forEach((i) => (i.texto = i.texto.replace(/\s+/g, " ").trim()));
    if (doc.itens.length) { doc.formato = "Pedido SAP"; return doc; }

    // 2) Genérico (WhatsApp, e-mail, cotação em texto): uma linha = um item
    const QT = /(?:^|\s)(\d+(?:[.,]\d+)?)(\s*)(PCS?|P[CÇç]S?|PE[CÇç]AS?|UN|UND|UNID(?:ADES)?|M|MT|MTS|METROS?|EA|KG|CX|JG|JOGOS?|ROLOS?)(?![A-Za-z0-9])\.?/i;
    const QX = /^\s*(\d+(?:[.,]\d+)?)\s*(?:(?:x|-|un\.?)\s+|\s(?=[A-Za-zÀ-ú]{3,}))/i;
    let k = 0; doc.ignoradas = [];
    // termos e condições no fim do documento: nada dali é item
    const corte = lines.findIndex((l) => /^\s*(\d+\.\s*)?(TERMOS E CONDI|CONDI[CÇ][OÕ]ES GERAIS|NORMA DE FORNECIMENTO|CL[AÁ]USULAS GERAIS|TERMS AND CONDITIONS)/i.test(l));
    if (corte > 0) { doc.ignoradas.push({ texto: `${lines.length - corte} linhas a partir de "${lines[corte].trim().slice(0, 60)}"`, motivo: "termos e condições do documento", bloco: true }); lines.length = corte; }
    // se o documento tem cabeçalho de tabela ("Item  Descrição  Qtd"), só lê o que está entre ele e o rodapé
    const HEAD = /\b(ITEM|IT\.|SEQ|C[OÓ]D(?:IGO)?)\b.*\b(DESCRI|PRODUTO|MATERIAL)|\bDESCRI[CÇ][AÃ]O\b.*\b(QTD|QUANT|UN)/i;
    const FOOT = /^\s*(SUB-?TOTAL|TOTAL|VALOR TOTAL|OBSERVA|CONDI[CÇ]|INFORMA[CÇ][OÕ]ES ADICIONAIS|DADOS ADICIONAIS)/i;
    let ini = lines.findIndex((l) => HEAD.test(l)), fimT = -1;
    if (ini >= 0) { fimT = lines.findIndex((l, i) => i > ini && FOOT.test(l)); if (fimT < 0) fimT = lines.length; if (!lines.slice(ini + 1, fimT).some((l) => !E.motivoNaoProduto(l.trim()))) ini = -1; }
    for (const [li, l] of lines.entries()) {
      if (ini >= 0 && (li <= ini || li >= fimT)) { const t0 = l.trim(); if (t0.length >= 4) doc.ignoradas.push({ texto: t0, motivo: li === ini ? "cabeçalho da tabela de itens" : "fora da tabela de itens" }); continue; }
      let t = l.trim().replace(/^\[[^\]]*\]\s*[^:]{0,40}:\s*/, ""); // remove "[10:21] Fulano:"
      if (t.length < 3 || !/[A-Za-z]/.test(t)) continue;
      const mot = E.motivoNaoProduto(t);
      if (mot) { if (t.length >= 4) doc.ignoradas.push({ texto: t, motivo: mot }); continue; }
      let qtd = null, un = "", nItem = "";
      // número do item no início da linha ("1  CORREIA…", "02. MANGUEIRA…", "3) …")
      const NI = /^\s*(\d{1,3})(?:[.):](?=\s|[A-Za-zÀ-ú])\s*|\s?-\s+|\s{2,}|\s+(?=[A-Za-zÀ-ú])|\s(?=\d+(?:[.,]\d+)?\s*(?:x\s*)?[A-Za-zÀ-ú]{3,}))/;
      // quantidade no fim da linha ("… 4 PC", "…   20", "… 2 pç")
      const QF = /(?:^|\s)(\d+(?:[.,]\d+)?)\s*(PCS?|P[CÇç]S?|PE[CÇç]AS?|UN|UND|UNID(?:ADES)?|M|MT|MTS|METROS?|EA|KG|CX|JG|JOGOS?|ROLOS?)?\.?\s*$/i;
      let m = NI.exec(t), mf = QF.exec(t);
      const fimOk = mf && (mf[2] || /\s{2,}\d+(?:[.,]\d+)?\s*$/.test(t)) && !(mf[2] && mf[2].toUpperCase() === "M" && !/\s[\d.,]+\s+M\.?\s*$/i.test(t));
      if (fimOk && m && m.index === 0 && mf.index > m[0].length) { nItem = m[1]; qtd = num(mf[1]); un = (mf[2] || "").toUpperCase(); t = t.slice(m[0].length, mf.index).trim(); }
      else if (fimOk) { qtd = num(mf[1]); un = (mf[2] || "").toUpperCase(); t = t.slice(0, mf.index).trim(); }
      else if (m && m.index === 0 && QX.test(t.slice(m[0].length))) { nItem = m[1]; t = t.slice(m[0].length); const q = QX.exec(t); qtd = num(q[1]); t = t.slice(q[0].length); }
      else if ((m = QX.exec(t))) { qtd = num(m[1]); t = t.slice(m[0].length); }
      else if ((m = QT.exec(t)) && !(m[3].toUpperCase() === "M" && !m[2])) { qtd = num(m[1]); un = m[3].toUpperCase(); t = (t.slice(0, m.index) + " " + t.slice(m.index + m[0].length)).trim(); }
      else if ((m = /\b(?:qtd|qtde|quantidade)\.?\s*:?\s*(\d+(?:[.,]\d+)?)/i.exec(t))) { qtd = num(m[1]); t = t.replace(m[0], "").trim(); }
      const mc = /\b(?:c[oó]d(?:igo)?\.?(?:\s*melting)?|melting)\s*[:.]?\s*((?=[A-Z0-9]*\d)[A-Z0-9]{3,})\b/i.exec(t);
      ++k; doc.itens.push({ n: (nItem || String(k)).padStart(2, "0"), codCli: "", texto: t.replace(/^[-•*·]\s*/, ""), qtd, un, preco: null, entrega: "", codMelting: mc ? mc[1] : "", fabricante: "" });
    }
    doc.formato = "Texto livre";
    return doc;
  };

  /* ---------- especificação de correia sincronizadora ---------- */
  const PERFIS = "S14M|S8M|S5M|S3M|S2M|14M|8M|5M|3M|2M|HTD\\d+M|AT10|AT20|AT5|AT3|T10|T20|T5|T2\\.5|XXH|XH|MXL|XL|L|H|8MGT|5MGT|3MGT|GT\\d|8YU|14MGT";
  const SPEC = new RegExp("(?<![0-9])(\\d{2,5})\\s*[-\\s]?\\s*(" + PERFIS + ")(?![A-Z])(?:\\s*[-\\s]?\\s*(\\d{1,3}(?:[.,]\\d)?)\\b)?", "i");
  const U3 = (v) => String(v).replace(/\.0+$/, "");
  E.spec = function (text) {
    const t = norm(text);
    let m = /(\d+(?:[.,]\d+)?)\s*MM\s*P\b/.exec(t), w = /(\d+(?:[.,]\d+)?)\s*MM\s*W\b/.exec(t), l = /(\d+(?:[.,]\d+)?)\s*MM\s*L\b/.exec(t);
    if (m && l) return { perfil: num(m[1]) + "M", comp: num(l[1]), larg: w ? num(w[1]) : null, origem: "pedido" };
    m = /PASSO\s*:?\s*(\d+(?:[.,]\d+)?)\s*MM/.exec(t);
    if (m) {
      const p = num(m[1]);
      const lc = /COMP(?:RIMENTO)?(?:\s*(?:NOMINAL|PRIMITIVO|EXTERNO))?\.?\s*:?\s*(\d+(?:[.,]\d+)?)\s*(?:MM)?/.exec(t), dn = /(\d{2,4})\s*D\s?E?\s?NTES/.exec(t);
      w = /LARG(?:URA)?\.?\s*:?\s*(\d+(?:[.,]\d+)?)\s*(?:MM)?/.exec(t);
      const L0 = lc ? num(lc[1]) : dn ? num(dn[1]) * p : null, W0 = w ? num(w[1]) : null;
      const POL = [[2.032, "MXL"], [5.08, "XL"], [9.525, "L"], [12.7, "H"], [22.225, "XH"], [31.75, "XXH"]].find(([v]) => Math.abs(v - p) < 0.06);
      if (POL && L0) return { perfil: POL[1], comp: Math.round(L0 / 2.54), larg: W0 ? Math.round(W0 / 0.254) : null, origem: "pedido", mm: { comp: L0, larg: W0 } };
      if (L0) return { perfil: /TRAPEZ/.test(t) && !/HTD|CURVIL|ARREDOND/.test(t) ? "T" + U3(p) : U3(p) + "M", comp: L0, larg: W0, origem: "pedido" };
    }
    m = SPEC.exec(t);
    if (m && /SINCR|TIMING|DENT|HTD|POLY|GT|POWERGRIP|\d+\s*[-\s]?\s*(S?\d+M|T\d|AT\d|XL)|\d{3,4}\s?(?:XL|L|H|XH|XXH)\s?\d{3}/.test(t)) return { perfil: m[2], comp: num(m[1]), larg: m[3] ? num(m[3]) : null, origem: "texto" };
    return null;
  };

  /* ---------- identificação ---------- */
  E.match = function (item) {
    const cand = new Map();
    const add = (pid, score, why) => { if (!P.has(pid)) return; const c = cand.get(pid); if (!c || c.score < score) cand.set(pid, { pid, score, why: c ? c.why.concat(why).slice(0, 3) : [why] }); else c.why.push(why); };
    if (item.codMelting) add(String(item.codMelting), 100, "Código Melting informado no pedido");
    { const ap = APR.mapa.get(E.chave(item.texto)); if (ap) add(ap, 99, "você escolheu este produto antes para este texto"); }
    // códigos internos: FTM 21, NITTA 00026, MECTROL 123, SGM 009535
    item.ftm = null; item.interno = null;
    for (const m of norm(item.texto).matchAll(/\b(FTM|NITTA|MECTROL|SGM)\s*[-:N.]*\s*(\d{1,7})\b/g)) {
      const k = m[1] + (+m[2]), pid = CODIGO.get(k);
      if (pid) add(pid, 98, `${m[1]} ${m[2]} cadastrado`);
      if (m[1] === "FTM" && FTM.get(String(+m[2]))) {
        const t = FTM.get(String(+m[2])); item.ftm = { id: t[0], mm: t[1], mang: t[3], t1: t[5], t2: t[7], capa: t[8], ref: t[9] };
        tokIndex();
        const comp = (nome, fam) => [...new Set([...(APE.get(key(nome)) || []), ...(TOK.get(norm(nome)) || [])])].filter((x) => E.familiaDe(P.get(x)[1]) === fam).slice(0, 3);
        for (const x of comp(t[3], "MANGUEIRA")) add(x, 72, `Mangueira ${t[3]} da FTM ${t[0]}`);
        for (const tn of [t[5], t[7]]) if (tn) for (const x of comp(tn, "TERMINAL")) add(x, 62, `Terminal ${tn} da FTM ${t[0]}`);
      }
      const io = INTERNO.get(k);
      if (io && !item.interno) {
        const r = io.row;
        if (io.tipo === "SGM") { item.interno = { tipo: "Kit SGM " + r[1], texto: `Peça principal ${r[2]} ${r[3]} × ${r[4]}` + (r[5] ? `; componentes: ${r[5]}` : "") }; if (P.has(r[2])) add(r[2], 72, `Peça principal do kit SGM ${r[1]}`); }
        else { const mp = P.get(r[2]); item.interno = { tipo: `Corte ${io.tipo} ${r[7]}`, texto: `${r[3]} × ${r[4]} mm a partir da matéria-prima ${r[2]}${mp ? " " + mp[1] : ""}` + (r[5] ? ` · ref. cliente ${r[5]}` : "") + (r[6] ? ` · revestimento ${r[6]}` : "") }; if (mp) add(r[2], 72, `Matéria-prima do corte ${io.tipo} ${r[7]}`); }
      }
    }
    const interno = !!(item.ftm || item.interno);
    if (item.codCli) for (const r of REF.get(key(item.codCli)) || []) add(r.pid, 95, "Código do cliente " + item.codCli + " já usado em " + r.src);
    const tt = toks(item.texto);
    // apelidos (com junções de 1 a 3 tokens: "A 50" -> A50, "5V 1500" -> 5V1500)
    for (let i = 0; i < tt.length; i++) for (let j = 1; j <= 3 && i + j <= tt.length; j++) {
      const k = tt.slice(i, i + j).join("").replace(/[^A-Z0-9]/g, "");
      if (k.length < 3) continue;
      if (/\d/.test(k)) for (const pid of APE.get(k) || []) add(pid, 70 + j * 3, "Apelido " + P.get(pid)[2]);
      if (P.has(k) && k.length >= 5) add(k, 60, "Código " + k + " citado no texto");
      for (const e of EQ.get(k) || []) for (const pid of APE.get(key(e[2])) || []) add(pid, 68, `Equivalente Nitta de ${e[0] || ""} ${e[1]} → ${e[2]}`.trim());
    }
    // sincronizadoras: comprimento + perfil (+ largura)
    const sp = E.spec(item.texto + " " + (item.detalhe || ""));
    item.spec = sp;
    if (sp) {
      tokIndex();
      const a = TOK.get(String(sp.comp)) || [], b = new Set(TOK.get(norm(sp.perfil)) || []);
      for (const pid of a) if (b.has(pid)) {
        const ps = E.spec(P.get(pid)[1]);
        if (!ps || ps.comp !== sp.comp || norm(ps.perfil) !== norm(sp.perfil)) continue;
        const slab = /SLAB/.test(P.get(pid)[1]);
        let s = slab ? 52 : 58, why = `Perfil ${sp.perfil} · ${sp.comp} mm`;
        if (sp.larg && ps.larg === sp.larg) { s += 20; why += ` · largura ${sp.larg} mm igual`; }
        else if (sp.larg && ps.larg) why += ` · largura ${ps.larg} mm (pedido ${sp.larg})`;
        add(pid, s, why);
      }
    }
    const famQ = E.familiaDe(item.texto);
    const textoTodo = item.texto + " " + (item.detalhe || "");
    // tubos: o cliente costuma pedir diâmetro × PAREDE; o cadastro usa diâmetro externo × INTERNO (25 x 3 → 25 X 19)
    if (famQ === "TUBO" && !interno) {
      const mm = /(\d+(?:[.,]\d+)?)\s*(?:MM)?\s*X\s*(\d+(?:[.,]\d+)?)\s*(?:MM)?/i.exec(norm(item.texto));
      if (mm) {
        tokIndex();
        const D = num(mm[1]), b = num(mm[2]);
        const alvos = [[b, "interno " + U2(b)]]; if (b < D / 3) alvos.push([Math.round((D - 2 * b) * 10) / 10, `interno ${U2(D - 2 * b)} (parede ${U2(b)})`]);
        for (const pid of TOK.get(String(D).replace(".", ",")) || TOK.get(String(D)) || []) {
          const dd = norm(P.get(pid)[1]); if (E.familiaDe(dd) !== "TUBO") continue;
          for (const [id, why] of alvos) {
            const re = new RegExp("\\b" + String(D).replace(".", "[.,]") + "\\s*(?:MM)?\\s*X\\s*" + String(id).replace(".", "[.,]") + "(?:[.,]0)?(?![\\/\\d.,])");
            if (re.test(dd)) add(pid, 76, `Tubo ${U2(D)} mm externo × ${why}`);
          }
        }
      }
    }
    // busca por palavras (peso pela raridade do termo), dentro da mesma família quando ela é conhecida
    if (cand.size < 3 && !interno) {
      tokIndex();
      const tq = [...new Set(toks(textoTodo).filter((t) => !STOP.has(t) && t.length > 1))];
      const det = new Set(toks(item.detalhe || ""));
      const sc = new Map();
      for (const t of tq) { const l = TOK.get(t); if (!l || l.length > 20000) continue; const w = Math.log(NPROD / l.length) * (tt.includes(t) ? 1 : det.has(t) ? 0.5 : 1); for (const pid of l) sc.set(pid, (sc.get(pid) || 0) + w); }
      const max = tq.reduce((s, t) => s + (TOK.get(t) && TOK.get(t).length <= 20000 ? Math.log(NPROD / TOK.get(t).length) * (tt.includes(t) ? 1 : 0.5) : 0), 0) || 1;
      let ord = [...sc.entries()].sort((x, y) => y[1] - x[1]);
      if (famQ) { const f = ord.filter(([pid]) => E.familiaDe(P.get(pid)[1]) === famQ); if (f.length) ord = f; }
      ord.slice(0, 10).forEach(([pid, v]) => add(pid, Math.round(45 * v / max), "Descrição parecida"));
    }
    const qset = new Set(tt.filter((t) => !STOP.has(t) && t.length > 2));
    // medidas do pedido (números com 2+ dígitos ou decimais) para comparar com cada candidato
    const medQ = new Set((norm(textoTodo).match(/\d+(?:[.,]\d+)?/g) || []).map((x) => String(num(x))).filter((x) => x.length >= 2 || x.includes(".")));
    const inoxQ = /INOX/.test(norm(textoTodo)), carbQ = /CARBONO|DIN\s?2391|ST\s?52/.test(norm(textoTodo));
    for (const c of cand.values()) {
      const d = P.get(c.pid)[1];
      if (!/[A-Z]{2}/.test(d)) { c.score -= 40; continue; }
      if (famQ && c.score < 90) { const fd = E.familiaDe(d + " " + P.get(c.pid)[2]); if (fd === famQ) c.score += 10; else if (fd) c.score -= 15; }
      let ov = 0; for (const t of new Set(toks(d))) if (qset.has(t)) ov++;
      c.score += Math.min(8, ov * 2);
      if (c.score < 90 && medQ.size) {
        const medC = new Set((norm(d).match(/\d+(?:[.,]\d+)?/g) || []).map((x) => String(num(x))));
        let hit = 0; for (const x of medQ) if (medC.has(x)) hit++;
        c.score += Math.min(12, hit * 4);
      }
      const nd = norm(d);
      if (c.score < 90 && ((carbQ && /INOX/.test(nd)) || (inoxQ && !/INOX/.test(nd) && /ACO/.test(nd)))) c.score -= 15;
      const acoQ = carbQ || /\bACO\b/.test(norm(textoTodo));
      if (c.score < 99 && acoQ && /\b(PP|PVC|PEAD|PE|SILICONE|NYLON|PU|TPE|BORRACHA|POLIAMIDA)\b/.test(nd) && !/\bACO\b/.test(nd)) c.score -= 20;
    }
    const out = [...cand.values()].sort((a, b) => b.score - a.score || (BY.get(b.pid) || []).length - (BY.get(a.pid) || []).length);
    return out.slice(0, 8);
  };

  /* ---------- ficha completa do produto ---------- */
  E.prod = (pid) => P.get(pid);
  E.info = function (pid) {
    const r = P.get(pid); if (!r) return null;
    const d = D.dicts;
    const buys = (BY.get(pid) || []).map((b) => ({ dt: b[1], forn: d.forn[b[2]], qtd: b[3], preco: b[4], oc: b[5] === 1, sit: b[6], ordem: b[7], ipi: b[8], moeda: b[9] || "Real", ped: b[10], ref: b[11], un: b[12], qrec: b[13] })).sort((a, b) => (a.dt < b.dt ? 1 : -1));
    const ano = r[10] ? +r[10].slice(0, 4) : null;
    const info = {
      pid, desc: r[1], apelido: r[2], familia: d.fam[r[3]], origem: d.ori[r[4]], un: d.un[r[5]], ipi: r[6], inativo: !!r[7], marca: d.mar[r[8]],
      custo: r[9], dtCusto: r[10], pv: r[11], nacImp: r[12], custoAtual: r[9] && ano && IDX[ano] ? r[9] * IDX[ano] : r[9], idxAno: ano && IDX[ano] && IDX[ano] !== 1 ? IDX[ano] : null,
      giro: GIRO.has(pid), buys, saldo: SALDO && pid in SALDO ? SALDO[pid] : null,
      forn: (FX.get(pid) || []).map((f) => ({ forn: d.forn[f[1]], cod: f[2], prazo: f[3], mult: f[4], min: f[5] })),
      ficha: FICHA.get(pid) || null, spec: E.spec(r[1]), lt: E.lt(pid),
    };
    const c = CUT.get(pid);
    if (c) { const mp = P.get(c[2]); info.corte = { tipo: c[1] ? "MECTROL" : "NITTA", mp: c[2], mpDesc: mp ? mp[1] : "", larg: c[3], comp: c[4], ref: c[5], rev: c[6] }; }
    const mc = MPCUT.get(pid); if (mc) info.cortesDaMp = mc.length;
    const k = KIT.get(pid); if (k) info.kit = { sgm: k[1], ppid: k[2], pp: k[3], qtd: k[4], comps: k[5] };
    const fm = /^FTM\s+(\d+)\s*\*/.exec(r[1]); if (fm && FTM.get(fm[1])) { const t = FTM.get(fm[1]); info.ftm = { id: t[0], mm: t[1], mangId: t[2], mang: t[3], t1: t[5], t2: t[7], capa: t[8], ref: t[9] }; }
    // irmãos: mesma especificação em outras larguras/marcas, e slab do mesmo comprimento
    if (info.spec) {
      tokIndex();
      const a = TOK.get(String(info.spec.comp)) || [], b = new Set(TOK.get(norm(info.spec.perfil)) || []);
      info.irmaos = a.filter((x) => x !== pid && b.has(x)).map((x) => ({ pid: x, desc: P.get(x)[1], spec: E.spec(P.get(x)[1]), n: (BY.get(x) || []).length, pv: P.get(x)[11], custo: P.get(x)[9] }))
        .filter((x) => x.spec && x.spec.comp === info.spec.comp && norm(x.spec.perfil) === norm(info.spec.perfil)).slice(0, 14);
    }
    return info;
  };

  /* ---------- regras de recomendação ---------- */
  const brl = (v) => v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
  const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
  E.recommend = function (item, info, hoje, cfg) {
    const R = []; const add = (lvl, tit, txt) => R.push({ lvl, tit, txt });
    hoje = hoje || new Date().toISOString().slice(0, 10);
    if (item.interno) add("info", item.interno.tipo, item.interno.texto + (info ? "" : ". O código de venda não está no cadastro exportado: cote pela composição."));
    if (!info && item.interno) return R;
    if (item.ftm) {
      const f = item.ftm;
      add("info", "Mangueira montada FTM " + f.id, `Composição cadastrada: mangueira ${f.mang} × ${f.mm} mm, terminais ${f.t1 || "—"} / ${f.t2 || "—"}${f.capa ? ", capa " + f.capa : ""}${f.ref ? " (ref. cliente " + f.ref + ")" : ""}. Não há código de venda para esta FTM: cote pelos componentes.`);
      return R;
    }
    if (!info) {
      add("op", "Item fora do cadastro", "Não encontrei esse item no cadastro. Registre a cotação mesmo assim: se ele voltar a ser pedido, vira candidato a novo produto ou fornecedor.");
      return R;
    }
    if (info.inativo) add("alerta", "Produto inativo", "O cadastro está como inativo. Confirme se ainda é fornecido ou indique substituto.");
    // especificação
    if (item.spec && info.spec && item.spec.larg && info.spec.larg && item.spec.larg !== info.spec.larg)
    {
      const certo = (info.irmaos || []).filter((x) => !/SLAB/.test(x.desc) && x.spec.larg === item.spec.larg);
      add("alerta", "Conferir largura", `O pedido pede ${item.spec.larg} mm de largura, mas a descrição do cadastro indica ${info.spec.larg} mm (${info.desc}).` +
        (certo.length ? ` Existe no cadastro ${certo.map((x) => x.pid + " " + x.desc).join(" e ")}, com a largura pedida. Confirme com o cliente qual enviar e corrija o código no contrato.` : " Confirme com o cliente ou corte do slab na largura certa."));
    }
    const oc = info.buys.filter((b) => b.oc && b.sit !== "Cancelado");
    const ult = info.buys.find((b) => b.sit !== "Cancelado");
    // recorrência do cliente
    if (item.codCli) {
      const mesmos = info.buys.filter((b) => b.ref && key(b.ref) === key(item.codCli));
      if (mesmos.length) {
        const peds = [...new Set(mesmos.map((b) => b.ped))];
        add("op", "Pedido recorrente deste cliente", `O código ${item.codCli} já gerou ${peds.length} compra(s) sob encomenda (${peds.join(", ")}), a última em ${fmtD(mesmos[0].dt)}. Com este pedido são ${peds.length + 1} pedidos. Vale manter estoque mínimo em vez de comprar a cada pedido.`);
      }
    }
    const sobEnc = oc.filter((b) => b.ped);
    const pedsEnc = [...new Set(sobEnc.map((b) => b.ped))];
    if (pedsEnc.length >= 2) add("op", "Comprado sob encomenda com frequência", `${pedsEnc.length} pedidos de clientes diferentes geraram compra deste item em 2026 (${pedsEnc.slice(0, 4).join(", ")}). Candidato a item de estoque.`);
    else if (pedsEnc.length === 1) add("info", "Já comprado sob encomenda", `Em 2026 este item foi comprado para atender o pedido de cliente ${pedsEnc[0]} (${fmtD(sobEnc[sobEnc.length - 1].dt)}).`);
    if (info.saldo != null) {
      const q = item.qtd || 0;
      if (info.saldo <= 0) add("alerta", "Sem saldo em estoque", `Saldo importado: ${fmtN(info.saldo)} ${info.un}. Para atender, é preciso comprar.`);
      else if (q && info.saldo < q) add("alerta", "Saldo não cobre o pedido", `Saldo de ${fmtN(info.saldo)} ${info.un} para um pedido de ${fmtN(q)}. Faltam ${fmtN(q - info.saldo)}.`);
      else add("ok", "Atende do estoque", `Saldo de ${fmtN(info.saldo)} ${info.un}` + (q ? `, sobram ${fmtN(info.saldo - q)} depois deste pedido.` : "."));
    } else if (info.giro) add("ok", "Item de giro", "Está na lista de itens de giro. Confira o saldo antes de comprar (ou importe o saldo na aba Estoque).");
    // OC em aberto
    const ab = oc.filter((b) => /Aberto|Não Fechado/.test(b.sit));
    if (ab.length) add("info", "Já existe compra em aberto", ab.slice(0, 3).map((b) => `OC ${b.ordem}: ${b.qtd - (b.qrec || 0)} ${b.un || info.un} de ${b.forn} (${b.sit.toLowerCase()})`).join("; ") + ".");
    // fornecedores e preço
    const reais = info.buys.filter((b) => b.preco && (b.moeda === "Real" || !b.moeda) && b.sit !== "Cancelado");
    if (reais.length) {
      const porF = {}; for (const b of reais) { const c = b.preco * (1 + (b.ipi || 0) / 100); if (!porF[b.forn] || porF[b.forn].dt < b.dt) porF[b.forn] = { c, dt: b.dt, q: b.qtd, p: b.preco }; }
      const fs = Object.entries(porF).sort((a, b) => a[1].c - b[1].c);
      if (fs.length > 1 && fs[fs.length - 1][1].c / fs[0][1].c > 1.15)
        add("op", "Fornecedor mais barato", `${fs[0][0]} saiu a ${brl(fs[0][1].p)} (${fmtD(fs[0][1].dt)}, lote de ${fs[0][1].q}); ${fs[fs.length - 1][0]} saiu a ${brl(fs[fs.length - 1][1].p)} (${fmtD(fs[fs.length - 1][1].dt)}). Diferença de ${Math.round((fs[fs.length - 1][1].c / fs[0][1].c - 1) * 100)}%.`);
      const custoRef = ult && ult.preco && (ult.moeda === "Real" || !ult.moeda) ? ult.preco * (1 + (ult.ipi || 0) / 100) : null;
      if (item.preco && custoRef) {
        const mk = item.preco / custoRef, mkMin = cfg ? cfg.markup.minimo : 1.25;
        add(mk < mkMin ? "alerta" : "ok", "Preço do pedido x último custo", `Cliente paga ${brl(item.preco)}; última compra custou ${brl(custoRef)} com IPI (${ult.forn}, ${fmtD(ult.dt)}). Markup de ${mk.toFixed(2).replace(".", ",")}x` + (mk < mkMin ? `, abaixo do mínimo de ${String(mkMin).replace(".", ",")}x.` : ".") + (fs.length > 1 ? ` Comprando de ${fs[0][0]}, o markup sobe para ${(item.preco / fs[0][1].c).toFixed(2).replace(".", ",")}x.` : ""));
      }
      if (info.pv && custoRef && info.pv < custoRef * 1.15) add("alerta", "Preço de tabela desatualizado", `Preço de venda no cadastro (${brl(info.pv)}) está abaixo ou muito perto do último custo (${brl(custoRef)}). Atualize a tabela antes de cotar para outros clientes.`);
    } else if (info.custo && E.custoSuspeito(info)) {
      add("alerta", "Custo do cadastro não confiável", `O último custo de entrada está em ${brl(info.custo)} (${fmtD(info.dtCusto)}), muito abaixo do preço de tabela de ${brl(info.pv)}. Parece valor genérico: peça o custo ao comprador antes de fechar o preço.`);
    } else if (info.custo) {
      add("info", "Sem compras recentes", `Último custo de entrada: ${brl(info.custo)} em ${fmtD(info.dtCusto)}` + (info.idxAno ? `, que corrigido para 2026 fica em ${brl(info.custoAtual)}.` : "."));
    }
    // prazo: lead time real do item; sem ele, prazo cadastrado do fornecedor
    const lt = info.lt, diasPedidos = item.entrega ? daysBetween(hoje, item.entrega) : item.prazoCliente || null;
    if (lt) {
      const temSaldo = info.saldo != null && info.saldo >= (item.qtd || 1);
      const quando = item.entrega ? `Entrega pedida em ${fmtD(item.entrega)} (${diasPedidos} dias corridos)` : item.prazoCliente ? `Cliente pede ${item.prazoCliente} dias` : "";
      const lead = `Lead time ${lt.txt} (${lt.dc} corridos), base: ${lt.baseTxt}${lt.nv ? `, ${lt.nv} entrega(s)` : ""}.`;
      if (diasPedidos != null && !temSaldo && lt.dc > diasPedidos) add("alerta", "Prazo", `${quando}, mas este item costuma levar ${lt.dc} dias corridos. ${lead} Combine o prazo ou ofereça um substituto com estoque.`);
      else if (lt.confirmar) add("alerta", "Prazo a confirmar", `${lead} Confirme com Compras antes de prometer.`);
      else if (diasPedidos != null) add("ok", "Prazo", `${quando}. ${lead}`);
    } else if (item.entrega && info.forn.length) {
      const pz = Math.min(...info.forn.map((f) => f.prazo || 0).filter((x) => x > 0).concat([999]));
      const dias = daysBetween(hoje, item.entrega);
      if (pz < 999) add(pz > dias ? "alerta" : "info", "Prazo", `Entrega pedida em ${fmtD(item.entrega)} (${dias} dias). Menor prazo cadastrado de fornecedor: ${pz} dias.`);
    }
    // composição
    if (info.corte) add("info", "Produzido por corte", `Corte ${info.corte.tipo} de ${info.corte.larg} × ${info.corte.comp} mm a partir da matéria-prima ${info.corte.mp} (${info.corte.mpDesc}).`);
    if (info.kit) add("info", "Kit montado (SGM " + info.kit.sgm + ")", `Peça principal ${info.kit.ppid} ${info.kit.pp} × ${info.kit.qtd}` + (info.kit.comps ? `; componentes: ${info.kit.comps}.` : "."));
    if (info.ftm) add("info", "Mangueira montada FTM " + info.ftm.id, `${info.ftm.mang} × ${info.ftm.mm} mm, terminais ${info.ftm.t1 || "—"} / ${info.ftm.t2 || "—"}${info.ftm.capa ? ", capa " + info.ftm.capa : ""}.`);
    const suf = info.desc.trim().split(/\s+/).pop();
    const slabs = (info.irmaos || []).filter((x) => /SLAB/.test(x.desc));
    const slab = slabs.find((x) => x.desc.trim().split(/\s+/).pop() === suf) || slabs[0];
    if (slab && !/SLAB/.test(info.desc)) add("op", "Pode ser cortada do slab", `Existe o slab ${slab.pid} (${slab.desc}) no cadastro. Se a demanda continuar, comprar o slab e cortar nas larguras pedidas sai mais barato e mais rápido do que comprar peça a peça.`);
    // recomendação de compra
    if (oc.length || info.giro) {
      const q12 = info.buys.filter((b) => daysBetween(b.dt, hoje) <= 365 && b.sit !== "Cancelado").reduce((s, b) => s + (b.qtd || 0), 0);
      if (q12 && !(info.saldo != null && item.qtd && info.saldo - item.qtd > q12 / 4)) add("acao", "Sugestão de compra", `Nos últimos 12 meses foram comprados ${fmtN(q12)} ${info.un}. ` + (item.qtd ? `Para este pedido (${fmtN(item.qtd)} ${item.un || info.un}), ` : "") + `uma reposição de ${fmtN(Math.max(Math.ceil(q12 / 4), item.qtd || 1))} ${info.un} cobre cerca de 3 meses.`);
    }
    return R;
  };
  const fmtD = (s) => s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : "—";
  const fmtN = (v) => (v == null ? "—" : (+v).toLocaleString("pt-BR", { maximumFractionDigits: 2 }));
  E.fmtD = fmtD; E.fmtN = fmtN; E.brl = brl;

  /* ---------- saldo importado ---------- */
  E.setSaldo = (map) => { SALDO = map || null; };
  E.saldo = (pid) => (SALDO && pid in SALDO ? SALDO[pid] : null);

  /* ---------- custo de referência e preço sugerido ---------- */
  E.custoRef = function (info) {
    const ult = info.buys.find((b) => b.sit !== "Cancelado" && b.preco && (b.moeda === "Real" || !b.moeda));
    if (ult) return { valor: ult.preco * (1 + (ult.ipi || 0) / 100), fonte: `última compra · ${ult.forn} · ${fmtD(ult.dt)}` };
    if (info.custo && !E.custoSuspeito(info)) return { valor: info.custoAtual * (1 + (info.ipi || 0) / 100), fonte: `custo de entrada de ${fmtD(info.dtCusto)}` + (info.idxAno ? " corrigido para hoje" : "") };
    return null;
  };
  /* custo do cadastro que não dá para confiar: valor genérico (ex.: R$ 10,00) muito abaixo do preço de tabela, ou data 2000-01-01 */
  E.custoSuspeito = (info) => !!info.custo && ((info.pv && info.custo < info.pv * 0.12) || /^2000-01-01/.test(info.dtCusto || "") || (info.custo === 10 && info.pv > 40));
  E.markupDe = (info, cfg) => (cfg.markup.porCategoria && cfg.markup.porCategoria[info.origem]) || cfg.markup.padrao;
  E.preco = function (info, cfg) {
    const c = E.custoRef(info); if (!c) return null;
    const mk = E.markupDe(info, cfg);
    return { custo: c.valor, fonte: c.fonte, mk, sugerido: Math.round(c.valor * mk * 100) / 100, minimo: Math.round(c.valor * cfg.markup.minimo * 100) / 100 };
  };
  /* melhor fornecedor recente (menor custo com IPI nos últimos 12 meses, senão o último) */
  E.melhorFornecedor = function (info, hoje) {
    hoje = hoje || new Date().toISOString().slice(0, 10);
    const reais = info.buys.filter((b) => b.sit !== "Cancelado" && b.preco && (b.moeda === "Real" || !b.moeda));
    const rec = reais.filter((b) => daysBetween(b.dt, hoje) <= 365);
    const base = rec.length ? rec : reais;
    if (base.length) {
      const b = base.slice().sort((x, y) => x.preco * (1 + (x.ipi || 0) / 100) - y.preco * (1 + (y.ipi || 0) / 100))[0];
      const fx = info.forn.find((f) => f.forn === b.forn);
      return { forn: b.forn, preco: b.preco, ipi: b.ipi || 0, prazo: fx ? fx.prazo : 0, min: fx ? fx.min : 0, mult: fx ? fx.mult : 0 };
    }
    const pc = E.custoSuspeito(info) ? null : info.custoAtual;
    if (info.forn.length) { const f = info.forn[0]; return { forn: f.forn, preco: pc, ipi: info.ipi || 0, prazo: f.prazo, min: f.min, mult: f.mult }; }
    return { forn: "Sem fornecedor", preco: pc, ipi: info.ipi || 0, prazo: 0, min: 0, mult: 0 };
  };
  E.fornecedoresDe = (info) => [...new Set(info.buys.map((b) => b.forn).concat(info.forn.map((f) => f.forn)))];
  E.ajustaLote = (q, min, mult) => { q = Math.max(q || 0, min || 0); if (mult && mult > 1) q = Math.ceil(q / mult) * mult; return Math.ceil(q * 100) / 100; };
  /* prazo para a proposta */
  E.prazo = function (info, cfg, qtd) {
    if (info.saldo != null && info.saldo >= (qtd || 1)) return { dias: 0, txt: "pronta entrega", fonte: "saldo em estoque" };
    if (info.lt) return { dias: info.lt.du, corridos: info.lt.dc, txt: info.lt.du <= 1 ? "1 dia útil" : `${info.lt.du} dias úteis`, fonte: "lead time: " + info.lt.baseTxt, confirmar: info.lt.confirmar };
    const pzs = info.forn.map((f) => f.prazo || 0).filter((x) => x > 0);
    const base = pzs.length ? Math.min(...pzs) : cfg.proposta.prazoPadraoDias;
    const d = base + cfg.proposta.prazoExtraDias;
    return { dias: d, txt: `${d} dias`, fonte: pzs.length ? "fornecedor + " + cfg.proposta.prazoExtraDias + " dias" : "prazo padrão" };
  };
  /* consumo dos últimos 12 meses e sugestão de compra para ~3 meses */
  E.sugestaoCompra = function (info, qtdPedido, hoje) {
    hoje = hoje || new Date().toISOString().slice(0, 10);
    const q12 = info.buys.filter((b) => daysBetween(b.dt, hoje) <= 365 && b.sit !== "Cancelado").reduce((s, b) => s + (b.qtd || 0), 0);
    let q = Math.max(Math.ceil(q12 / 4), qtdPedido || 1);
    if (info.saldo != null) q = Math.max(0, q - Math.max(0, info.saldo - (qtdPedido || 0)));
    return { q12, qtd: q || qtdPedido || 1 };
  };
  /* histórico de um código de cliente nas OCs */
  E.refHist = (codCli) => (REF.get(key(codCli)) || []);
  /* busca rápida */
  E.search = function (q, lim = 20) {
    q = String(q || "").trim(); if (!q) return [];
    const out = new Map(); const add = (pid, s) => { if (P.has(pid) && (!out.has(pid) || out.get(pid) < s)) out.set(pid, s); };
    if (P.has(q)) add(q, 100);
    for (const pid of APE.get(key(q)) || []) add(pid, 90);
    if (out.size < lim) for (const c of E.match({ texto: q, codMelting: "", codCli: q })) add(c.pid, c.score);
    return [...out.entries()].sort((a, b) => b[1] - a[1] || (BY.get(b[0]) || []).length - (BY.get(a[0]) || []).length).slice(0, lim).map((x) => x[0]);
  };
  G.MeltEngine = E;
})(typeof window !== "undefined" ? window : globalThis);
