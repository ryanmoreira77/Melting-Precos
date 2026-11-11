/* Melting Preços · interface
   Abas: Painel, Analisar pedido, Calculadora, Clientes, Ajustes
   O banco de clientes guarda, para cada cliente, os preços praticados por produto. */
(function () {
  const U = window.MeltUtil, S = window.MeltStore, E = window.MeltEngine, L = window.MeltLucro;
  const { $, $$, esc } = U;
  const HOJE = U.hoje();
  const SAMPLE = window.MELT_SAMPLE || "";
  const LVL = { alerta: "Atenção", op: "Oportunidade", acao: "Ação", info: "Info", ok: "OK" };
  let DATA = null, REC = null, DOC = null, BACK = null, UNSUB = null, SAMPLER = null, USER = null;
  let CFG = S.settings(), SALDO = S.saldo.get();
  let CLIENTES = [];
  let APREND = { nao: [], sim: [], mapa: {} }, UNSUB_AP = null;
  let VIEW = "painel";

  /* ============ navegação ============ */
  const VIEWS = ["painel", "analisar", "calc", "itens", "clientes", "ajustes"];
  /* logo: repete a entrada 3D a cada troca de aba */
  let ULTIMA_ABA = null;
  function animarLogo() {
    document.querySelectorAll(".brand .logo, .brand-sub").forEach((el) => { el.style.animation = "none"; void el.offsetWidth; el.style.animation = ""; });
  }
  function show(v) {
    if (!VIEWS.includes(v)) v = "painel";
    VIEW = v;
    $$("nav.tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.v === v));
    if (!DATA) return;
    VIEWS.forEach((x) => ($("#v-" + x).hidden = x !== v));
    if (ULTIMA_ABA && ULTIMA_ABA !== v) animarLogo();
    ULTIMA_ABA = v;
    render(v);
  }
  function render(v) {
    ({ painel: renderPainel, calc: renderCalc, itens: renderItens, clientes: renderClientes, ajustes: renderAjustes }[v] || (() => {}))();
  }
  function go(v) { if (location.hash.slice(1) === v) show(v); else location.hash = v; }
  $$("nav.tabs button").forEach((b) => (b.onclick = () => go(b.dataset.v)));
  addEventListener("hashchange", () => show(location.hash.slice(1)));

  /* ============ base de dados ============ */
  async function loadData() {
    const bin = Uint8Array.from(atob(window.MELT_DATA), (c) => c.charCodeAt(0));
    const txt = await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
    DATA = JSON.parse(txt); window.MELT_DATA = null;
    const r = E.init(DATA); REC = DATA.rec; window.MeltSug.init(DATA, E);
    E.setSaldo(SALDO && SALDO.map);
    $("#status").textContent = `${r.produtos.toLocaleString("pt-BR")} produtos · ${r.compras.toLocaleString("pt-BR")} linhas de compra · base de ${U.dt(DATA.gerado)}`;
    $("#loading").hidden = true;
    show(location.hash.slice(1) || "painel");
    if (!DOC) { $("#txt").value = SAMPLE; analyze(SAMPLE, "PDF"); }
  }
  function startData() {
    const fail = (m) => ($("#loading").innerHTML = '<span class="lbl">' + esc(m) + "</span>");
    if (window.MELT_DATA) return loadData().catch((e) => fail("Não consegui abrir a base de dados: " + e.message));
    const s = document.createElement("script"); s.src = "data/data.js";
    s.onload = () => loadData().catch((e) => fail("Não consegui abrir a base de dados: " + e.message));
    s.onerror = () => fail("A base de dados (data/data.js) não carregou. Recarregue a página.");
    document.body.appendChild(s);
  }

  /* ============ banco de clientes ============ */
  async function initBackend() {
    if (UNSUB) { try { UNSUB(); } catch {} UNSUB = null; }
    BACK = await S.backend();
    $("#store-status").innerHTML = "Clientes " + esc(BACK.label) + (S.supaConfigured() && BACK.kind !== "supabase" && !window.claude ? ' · <a href="#" data-ir="ajustes">entrar no banco da empresa</a>' : "");
    if (UNSUB_AP) { try { UNSUB_AP(); } catch {} }
    UNSUB_AP = BACK.db.collection("aprendizado").onSnapshot((snap) => {
      const d = snap.docs.find((x) => x.id === "geral"); APREND = { nao: [], sim: [], mapa: {}, ...((d && d.data()) || {}) };
      E.setAprendizado(APREND); if (VIEW === "ajustes" && DATA) renderAjustes();
    }, () => {});
    UNSUB = BACK.db.collection("clientes").onSnapshot((snap) => {
      CLIENTES = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => c.nome).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      $("#cli-opts").innerHTML = CLIENTES.map((c) => `<option value="${esc(c.nome)}">`).join("");
      if (DATA && ["painel", "clientes"].includes(VIEW)) render(VIEW);
      if (DOC) renderCliBox();
    }, (e) => { $("#store-status").textContent = "Banco de clientes indisponível: " + (e.message || e.code); });
  }
  const slug = (n) => (E.key(n).toLowerCase().slice(0, 60) || "c" + Date.now());
  function clientePorNome(nome) {
    const k = E.norm(nome || "").replace(/\s+/g, " ").trim(); if (k.length < 3) return null;
    return CLIENTES.find((c) => E.norm(c.nome).trim() === k) || CLIENTES.find((c) => { const n = E.norm(c.nome).trim(); return n.length >= 5 && (k.includes(n) || n.includes(k)); }) || null;
  }
  const docCliente = () => (DOC && DOC.cliId ? CLIENTES.find((c) => c.id === DOC.cliId) || null : null);
  const precoCli = (cli, pid) => (cli && cli.precos && cli.precos[pid]) || null;
  const cfgCli = (cli) => (cli && cli.markup ? { ...CFG, markup: { ...CFG.markup, padrao: cli.markup, porCategoria: {} } } : CFG);
  async function salvarCliente(c) {
    const { id, ...d } = c; d.atualizado_em = new Date().toISOString(); if (!d.criado_em) d.criado_em = d.atualizado_em;
    await BACK.db.collection("clientes").doc(id).set(d);
    const i = CLIENTES.findIndex((x) => x.id === id); if (i >= 0) CLIENTES[i] = { id, ...d }; else CLIENTES.push({ id, ...d });
  }
  /* aprendizado: o que o usuário corrige vale para os próximos pedidos */
  let apT;
  function aprender(fn) {
    fn(APREND); APREND.nao = [...new Set(APREND.nao)].slice(-3000); APREND.sim = [...new Set(APREND.sim)].slice(-3000);
    E.setAprendizado(APREND);
    clearTimeout(apT); apT = setTimeout(() => { BACK && BACK.db.collection("aprendizado").doc("geral").set({ ...APREND, atualizado_em: new Date().toISOString() }).catch((e) => U.toast("Não salvou o aprendizado: " + (e.message || e.code))); }, 400);
  }
  const lembrarProduto = (it) => { if (it && it.texto && it.pid) aprender((a) => { a.mapa[E.chave(it.texto)] = it.pid; }); };
  const vazioCliente = (nome) => ({ id: slug(nome), nome, cnpj: "", contato: "", emails: "", telefone: "", markup: null, obs: "", precos: {} });

  /* ============ entrada de pedidos ============ */
  const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
  async function pdfText(file) {
    if (!window.pdfjsLib) { await U.loadScript(PDFJS + "pdf.min.js"); await U.loadScript(PDFJS + "pdf.worker.min.js"); pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.js"; }
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    let out = "";
    for (let i = 1; i <= pdf.numPages; i++) { const c = await (await pdf.getPage(i)).getTextContent(); out += E.linesFromPdfItems(c.items) + "\n"; }
    return out;
  }
  async function handleFile(f) {
    if (!f || !DATA) return;
    $("#inhint").textContent = "Lendo " + f.name + "…";
    try {
      const t = /\.pdf$/i.test(f.name) || f.type === "application/pdf" ? await pdfText(f) : await f.text();
      if (!t.trim()) throw new Error("o PDF não tem texto selecionável (pode ser imagem escaneada). Cole o texto ou use Ler com IA.");
      $("#txt").value = t; analyze(t, "PDF");
      $("#inhint").textContent = "Lido: " + f.name + ".";
    } catch (e) { $("#inhint").textContent = "Não consegui ler: " + e.message; }
  }
  $("#file").onchange = (e) => handleFile(e.target.files[0]);
  const drop = $("#drop");
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => handleFile(e.dataTransfer.files[0]));
  $("#go").onclick = () => DATA && analyze($("#txt").value, /\[\d{1,2}:\d{2}\]/.test($("#txt").value) ? "WhatsApp" : "");
  $("#ex").onclick = () => { if (!DATA) return; $("#txt").value = SAMPLE; analyze(SAMPLE, "PDF"); };
  $("#ia").onclick = async () => {
    const t = $("#txt").value.trim(); if (!t || !SAMPLER) return;
    const b = $("#ia"); b.disabled = true; b.textContent = "Lendo…";
    try {
      const r = await SAMPLER.json(`Você extrai itens de pedidos e cotações de uma distribuidora de correias, mangueiras e peças de manutenção industrial.
Leia o texto abaixo e responda SOMENTE com JSON no formato:
{"cliente":"", "documento":"", "data":"AAAA-MM-DD ou vazio", "itens":[{"texto":"descrição do item como o cliente escreveu, com medidas e marca", "qtd":número ou null, "un":"PC/M/KG/..." , "preco":número ou null, "codCli":"código do material do cliente ou vazio", "codMelting":"código Melting se aparecer ou vazio", "entrega":"AAAA-MM-DD ou vazio"}]}
Ignore saudações, endereços, condições comerciais e dados fiscais.

TEXTO:
${t.slice(0, 12000)}`, { modelTier: "quick" });
      const doc = { cliente: r.cliente || "", documento: r.documento || "", data: r.data || "", canal: "", formato: "Lido com IA",
        itens: (r.itens || []).map((x, i) => ({ n: String(i + 1).padStart(2, "0"), codCli: x.codCli || "", texto: x.texto || "", qtd: x.qtd ?? null, un: x.un || "", preco: x.preco ?? null, entrega: x.entrega || "", codMelting: x.codMelting || "", fabricante: "" })) };
      runDoc(doc, /\[\d{1,2}:\d{2}\]/.test(t) ? "WhatsApp" : "");
    } catch (e) { U.toast(e.code === "rate_limited" ? "Muitas leituras seguidas. Tente de novo em instantes." : "A leitura com IA falhou: " + (e.message || e.code)); }
    b.disabled = false; b.textContent = "Ler com IA";
  };

  /* ============ análise ============ */
  function analyze(text, canal) { runDoc(E.parseDoc(text || ""), canal); }
  function pick(it) { it.pid = it.cands[0] && it.cands[0].score >= 50 ? it.cands[0].pid : ""; it.proposto = null; it.prazoTxt = null; it.manual = false; }
  function runDoc(doc, canal) {
    doc.canal = canal || doc.canal || "PDF";
    for (const it of doc.itens) { it.cands = E.match(it); pick(it); }
    DOC = doc; DOC.ia = null;
    const cli = clientePorNome(doc.cliente); DOC.cliId = cli ? cli.id : null;
    $("#doc").hidden = false;
    $("#doc-title").textContent = doc.documento ? "Pedido " + doc.documento : "Pedido sem número";
    $("#doc-fmt").textContent = doc.formato + " · " + doc.itens.length + (doc.itens.length === 1 ? " item" : " itens");
    $("#d-cliente").value = doc.cliente; $("#d-documento").value = doc.documento; $("#d-data").value = doc.data || HOJE; $("#d-canal").value = doc.canal;
    renderItems(); renderCliBox(); renderIA();
  }
  /* preenche preço proposto e prazo uma vez, a partir do preço do cliente ou do sugerido */
  /* ordem do preço: tabela do cliente > preço que veio no pedido > sugerido (custo × markup) */
  function prep(it) {
    const cli = docCliente(), cfg = cfgCli(cli);
    const info = it.pid ? E.info(it.pid) : null;
    const pr = info ? E.preco(info, cfg) : null;
    const pz = info ? E.prazo(info, CFG, it.qtd) : null;
    const pc = info ? precoCli(cli, it.pid) : null;
    if (it.proposto == null) {
      if (pc) { it.proposto = pc.preco; it.fonte = `tabela do cliente (${U.dt(pc.data)})`; }
      else if (it.preco != null) { it.proposto = it.preco; it.fonte = "preço do pedido"; }
      else if (pr) { it.proposto = pr.sugerido; it.fonte = "sugerido (custo × markup)"; }
    }
    if (it.prazoTxt == null) it.prazoTxt = pz ? pz.txt : "";
    it.pz = pz;
    it.opcoes = L.opcoes(it, cfg, (pid) => precoCli(cli, pid));
    if (!it.sug || it.sugPid !== it.pid) { it.sug = window.MeltSug.para(it, cfg, HOJE); it.sugPid = it.pid; }
    it.oferecer = it.oferecer || [];
    it.alertas = info ? E.recommend(it, info, HOJE, CFG).filter((r) => r.lvl === "alerta").map((r) => r.tit + ": " + r.txt) : [];
    return { info, pr, pz, pc };
  }
  function renderItems() {
    const box = $("#items");
    document.body.classList.toggle("compacto", $("#compacto").checked);
    if (!DOC.itens.length) { box.innerHTML = '<div class="empty">Nenhum item reconhecido. Deixe uma linha por item, com quantidade e medida, ou use Ler com IA.</div>'; renderDocSum(); return; }
    const ign = DOC.ignoradas || [];
    box.innerHTML = DOC.itens.map((it, i) => itemHTML(it, i)).join("") + (ign.length ? `<details class="ignoradas"><summary>Linhas ignoradas <span class="muted mono">${ign.length}</span></summary><div class="in">
      <p class="hint">Cabeçalho, endereço, CNPJ, inscrição estadual, impostos, condições e conversa não viram item. Se alguma linha for produto, inclua.</p>
      <div class="tbl"><table><tbody>${ign.map((g, j) => `<tr><td>${esc(g.texto)}<div class="hint">${esc(g.motivo)}</div></td><td class="n">${g.bloco ? "" : `<button class="btn sm" data-incl="${j}">Incluir como item</button>`}</td></tr>`).join("")}</tbody></table></div></div></details>` : "");
    $$("[data-incl]", box).forEach((b) => (b.onclick = () => {
      const g = DOC.ignoradas.splice(+b.dataset.incl, 1)[0];
      if (!g.bloco) aprender((a) => { const k = E.chave(g.texto); a.nao = a.nao.filter((x) => x !== k); a.sim.push(k); });
      const it = { n: String(DOC.itens.length + 1).padStart(2, "0"), codCli: "", texto: g.texto, qtd: null, un: "", preco: null, entrega: "", codMelting: "", fabricante: "" };
      it.cands = E.match(it); pick(it);
      DOC.itens.push(it); rerenderItem(DOC.itens.length - 1);
    }));
    $$("[data-pick]", box).forEach((b) => (b.onclick = () => { const [i, pid] = b.dataset.pick.split("|"); const it = DOC.itens[+i]; it.pid = pid; it.proposto = null; it.prazoTxt = null; lembrarProduto(it); rerenderItem(+i); }));
    $$("[data-useop]", box).forEach((b) => (b.onclick = () => { const [i, pid] = b.dataset.useop.split("|"); const it = DOC.itens[+i]; const o = (it.opcoes || []).find((x) => x.pid === pid); it.pid = pid; it.proposto = o && o.venda != null ? Math.round(o.venda * 100) / 100 : null; it.fonte = o ? o.fonteVenda : ""; it.manual = true; it.prazoTxt = null; lembrarProduto(it); rerenderItem(+i); }));
    $$("[data-code]", box).forEach((inp) => (inp.onchange = () => { const it = DOC.itens[+inp.dataset.code]; it.codMelting = inp.value.trim(); it.cands = E.match(it); pick(it); if (it.pid && it.pid === it.codMelting) lembrarProduto(it); rerenderItem(+inp.dataset.code); }));
    $$("[data-prop]", box).forEach((inp) => (inp.oninput = () => { const it = DOC.itens[+inp.dataset.prop]; it.proposto = U.parseNum(inp.value); it.manual = true; it.fonte = "digitado"; propWarn(+inp.dataset.prop); renderDocSum(); refreshResp(); }));
    $$("[data-pz]", box).forEach((inp) => (inp.oninput = () => { DOC.itens[+inp.dataset.pz].prazoTxt = inp.value; refreshResp(); }));
    $$("[data-calc]", box).forEach((b) => (b.onclick = () => calcDoItem(+b.dataset.calc)));
    $$("[data-sgusar]", box).forEach((b) => (b.onclick = () => { const [i, pid] = b.dataset.sgusar.split("|"); const it = DOC.itens[+i]; it.pid = pid; it.proposto = null; it.prazoTxt = null; it.manual = false; rerenderItem(+i); U.toast("Item trocado para " + pid); }));
    $$("[data-sgadd]", box).forEach((b) => (b.onclick = () => {
      const [i, pid] = b.dataset.sgadd.split("|"); const base = DOC.itens[+i], p = E.prod(pid);
      const it = { n: String(DOC.itens.length + 1).padStart(2, "0"), codCli: "", texto: p[1], qtd: /^POLIA/.test(p[1]) ? 1 : base.qtd || 1, un: E.info(pid).un, preco: null, entrega: "", codMelting: pid, fabricante: "", sugeridoDe: base.n };
      it.cands = E.match(it); pick(it); DOC.itens.push(it); rerenderItem(DOC.itens.length - 1); U.toast(`Adicionado como item ${it.n} (sugestão do item ${base.n})`);
    }));
    $$("[data-sgof]", box).forEach((b) => (b.onclick = () => { const [i, pid] = b.dataset.sgof.split("|"); const it = DOC.itens[+i]; it.oferecer = it.oferecer.includes(pid) ? it.oferecer.filter((x) => x !== pid) : [...it.oferecer, pid]; rerenderItem(+i); }));
    $$("[data-naop]", box).forEach((b) => (b.onclick = (e) => {
      e.stopPropagation(); const i = +b.dataset.naop, it = DOC.itens[i];
      aprender((a) => { const k = E.chave(it.texto); a.sim = a.sim.filter((x) => x !== k); a.nao.push(k); });
      DOC.itens.splice(i, 1); (DOC.ignoradas = DOC.ignoradas || []).unshift({ texto: it.texto, motivo: "você marcou como não produto" });
      U.toast("Entendido: essa linha não vira mais item"); renderItems();
    }));
    $$("[data-toggle]", box).forEach((h) => (h.onclick = (e) => { if (!document.body.classList.contains("compacto") || e.target.closest("button,input,select,a")) return; h.closest(".item").classList.toggle("aberto"); }));
    DOC.itens.forEach((_, i) => propWarn(i));
    renderDocSum(); refreshResp();
  }
  function rerenderItem(i) { renderItems(); const el = document.getElementById("item-" + i); if (el) { el.classList.add("aberto"); el.scrollIntoView({ block: "nearest" }); } }
  function propWarn(i) {
    const it = DOC.itens[i], el = document.getElementById("pw-" + i); if (!el) return;
    const info = it.pid ? E.info(it.pid) : null, pr = info ? E.preco(info, cfgCli(docCliente())) : null;
    el.textContent = pr && it.proposto != null && it.proposto < pr.minimo ? `Abaixo do mínimo (${U.brl(pr.minimo)})` : pr && it.proposto != null ? `Markup ${(it.proposto / pr.custo).toFixed(2).replace(".", ",")}x` : "";
    el.className = "hint" + (pr && it.proposto != null && it.proposto < pr.minimo ? " warn-t" : "");
  }
  function renderDocSum() {
    if (!DOC) return;
    const ids = DOC.itens.filter((i) => i.pid).length;
    const tot = DOC.itens.reduce((s, i) => s + (i.proposto || 0) * (i.qtd || 1), 0);
    let custo = 0, comCusto = 0;
    for (const it of DOC.itens) { const o = (it.opcoes || []).find((x) => x.pid === it.pid); if (o && o.custo != null && it.proposto != null) { custo += o.custo * (it.qtd || 1); comCusto += it.proposto * (it.qtd || 1); } }
    const lucro = comCusto - custo;
    $("#doc-sum").innerHTML = `<span>Identificados <b>${ids}/${DOC.itens.length}</b></span>${(DOC.ignoradas || []).length ? `<span>Linhas ignoradas <b>${DOC.ignoradas.length}</b></span>` : ""}<span>Venda <b>${U.brl(tot)}</b></span><span>Custo (melhor fornecedor) <b>${comCusto ? U.brl(custo) : "sem custo confiável"}</b></span><span>Lucro <b class="${lucro < 0 ? "warn-t" : "lucro-t"}">${comCusto ? U.brl(lucro) : "—"}</b></span><span>Margem <b>${comCusto ? U.num((lucro / comCusto) * 100, 1) + "%" : "—"}</b></span>`;
  }

  function itemHTML(it, i) {
    const { info, pr, pz, pc } = prep(it);
    const recs = E.recommend(it, info, HOJE, CFG);
    const top = it.cands[0];
    const conf = !top ? "" : !it.pid ? "Sugestões parecidas: escolha uma ou digite o código" : top.score >= 90 ? "Identificação certa" : top.score >= 60 ? "Identificação provável" : "Identificação fraca, confira";
    const sp = it.spec ? `<span>Medida lida: <b>${esc(it.spec.perfil)} · ${U.num(it.spec.comp)} mm${it.spec.larg ? " · " + U.num(it.spec.larg) + " mm larg." : ""}</b></span>` : "";
    const main = recs.find((r) => r.lvl === "alerta") || recs.find((r) => r.lvl === "op") || recs[0];
    return `<article class="item" id="item-${i}">
  <div class="item-h" data-toggle="${i}">
    <div class="item-n">${esc(it.n)}<button class="naop" data-naop="${i}" title="Esta linha não é produto: o sistema aprende e não lê mais como item">não é produto</button></div>
    <div style="min-width:0"><div class="item-t">${esc(it.texto) || "<span class=muted>sem descrição</span>"}</div>${it.detalhe ? `<div class="hint">${esc(it.detalhe)}</div>` : ""}${it.sugeridoDe ? `<div class="hint">sugerido junto com o item ${esc(it.sugeridoDe)}</div>` : ""}
      <div class="item-meta">${it.codCli ? `<span>Cód. cliente <b class="mono">${esc(it.codCli)}</b></span>` : ""}${it.codMelting ? `<span>Cód. Melting no pedido <b class="mono">${esc(it.codMelting)}</b></span>` : ""}
      <span>Qtd <b class="mono">${it.qtd != null ? U.num(it.qtd) + " " + esc(it.un) : "—"}</b></span>${it.entrega ? `<span>Entrega <b>${U.dt(it.entrega)}</b></span>` : ""}${sp}</div></div>
    <div class="item-price">${it.preco != null ? `<div class="lbl">Preço do cliente</div><div class="v">${U.brl(it.preco)}</div>${it.qtd ? `<div class="hint">total ${U.brl(it.preco * it.qtd)}</div>` : ""}` : ""}</div>
  </div>
  <div class="item-sum">${info ? `<span class="mono">${esc(info.pid)}</span><span>${esc(info.desc)}</span><b class="mono">${U.brl(it.proposto)}</b>${ltChip(info.lt)}` : '<span class="chip op">Fora do cadastro</span>'}${main ? `<span class="chip ${main.lvl}">${esc(main.tit)}</span>` : ""}<span class="hint">clique para abrir</span></div>
  <div class="item-b">
    <div class="row" style="justify-content:space-between"><span class="lbl">${it.cands.length ? "Produto identificado · " + conf : "Nenhum produto parecido no cadastro"}</span>
      <label class="row hint" for="code-${i}">Código Melting <input type="text" id="code-${i}" data-code="${i}" value="${esc(it.pid)}" style="width:120px" class="mono"></label></div>
    ${it.cands.length ? `<div class="cands">${it.cands.map((c) => { const p = E.prod(c.pid); return `<button class="cand" data-pick="${i}|${esc(c.pid)}" aria-pressed="${c.pid === it.pid}" title="${esc(c.why.join(" · "))}"><span class="c">${esc(c.pid)}</span> ${esc(p[1])}</button>`; }).join("")}</div>` : ""}
    ${info ? prodHTML(info) : ""}
    ${info ? `<div class="proposta">
      <div><div class="lbl">Custo de referência</div><div class="v">${pr ? U.brl(pr.custo) : "—"}</div><div class="hint">${pr ? esc(pr.fonte) : "sem custo"}</div></div>
      <div><div class="lbl">Sugerido (${pr ? String(pr.mk).replace(".", ",") + "x" : "—"})</div><div class="v">${pr ? U.brl(pr.sugerido) : "—"}</div><div class="hint">mínimo ${pr ? U.brl(pr.minimo) : "—"}</div></div>
      <label for="prop-${i}"><span class="lbl">Preço proposto (un.)</span><input type="text" id="prop-${i}" data-prop="${i}" inputmode="decimal" value="${it.proposto != null ? it.proposto.toFixed(2).replace(".", ",") : ""}"><span class="hint">${esc(it.fonte || "")}</span><span id="pw-${i}" class="hint"></span><button class="linkbtn" data-calc="${i}">calcular preço</button></label>
      <label for="pz-${i}"><span class="lbl">Prazo</span><input type="text" id="pz-${i}" data-pz="${i}" value="${esc(it.prazoTxt)}" style="text-align:left"><span class="hint ${pz && pz.confirmar ? "warn-t" : ""}">${pz ? esc(pz.fonte) + (pz.corridos ? ` · ${pz.corridos} corridos` : "") + (pz.confirmar ? " · confirmar" : "") : ""}</span></label>
      <div><div class="lbl">Tabela do cliente</div><div class="v">${pc ? U.brl(pc.preco) : "—"}</div><div class="hint">${pc ? "salvo em " + U.dt(pc.data) : docCliente() ? "sem preço salvo" : "cliente não cadastrado"}</div></div>
    </div>` : ""}
    ${iaItemHTML(it)}
    ${opcoesHTML(it, i)}
    ${sugHTML(it, i, info)}
    <div class="recs">${recs.map((r) => `<div class="rec"><span><span class="chip ${r.lvl}">${LVL[r.lvl]}</span></span><div><div class="t">${esc(r.tit)}</div><p>${esc(r.txt)}</p></div></div>`).join("")}</div>
    ${info ? detailsHTML(info) : ""}
  </div></article>`;
  }
  /* lead time: chip curto e texto completo */
  const ltChip = (lt, extra) => lt ? `<span class="chip lt ${lt.confirmar ? "alerta" : lt.du <= 2 ? "ok" : ""}" title="Lead time: ${esc(lt.txt)} (${lt.dc} dias corridos) · base: ${esc(lt.baseTxt)}${lt.confirmar ? " · confirmar com Compras" : ""}">⏱ ${lt.du <= 1 ? "1 dia útil" : lt.du + " dias úteis"}${extra || ""}</span>` : "";
  const ltTxt = (lt) => lt ? `${lt.txt} (${lt.dc} corridos)` : "";
  function prodHTML(f) {
    const ult = f.buys.find((b) => b.sit !== "Cancelado");
    const facts = [
      ["Código", f.pid], ["Apelido", f.apelido], ["Família", f.familia], ["Marca", f.marca || "—"],
      ["Preço de tabela", f.pv != null ? U.brl(f.pv) + " / " + f.un : "—"],
      ["Último custo de entrada", f.custo != null ? U.brl(f.custo) + " · " + U.dt(f.dtCusto) : "—"],
      ["Última compra", ult ? `${U.brl(ult.preco)} · ${U.dt(ult.dt)}` : "sem compras 2024–26"],
      [f.saldo != null ? "Saldo em estoque" : "Compras 2024–26", f.saldo != null ? U.num(f.saldo) + " " + f.un : f.buys.filter((b) => b.sit !== "Cancelado").length + " linhas"],
      ["Lead time (entrega ao cliente)", f.lt ? `${ltTxt(f.lt)} · ${f.lt.baseTxt}${f.lt.nv ? " · " + f.lt.nv + " entrega(s)" : ""}${f.lt.confirmar ? " · confirmar com Compras" : ""}` : "sem dado"],
    ];
    return `<div><div class="row" style="gap:8px;margin-bottom:8px"><span class="pdesc">${esc(f.desc)}</span>${f.giro ? '<span class="chip giro">Item de giro</span>' : ""}${ltChip(f.lt)}${f.inativo ? '<span class="chip alerta">Inativo</span>' : ""}<span class="chip">${esc(f.nacImp || "")}</span><span class="chip">${esc(f.origem || "")}</span></div>
  <div class="facts">${facts.map(([k, v]) => `<div class="fact"><span class="lbl">${k}</span><span class="v">${esc(v)}</span></div>`).join("")}</div></div>`;
  }
  function priceSeries(f) {
    const by = {};
    for (const b of f.buys) if (b.sit !== "Cancelado" && b.preco && (b.moeda === "Real" || !b.moeda)) (by[b.forn] = by[b.forn] || []).push({ x: b.dt, y: b.preco });
    return Object.entries(by).sort((a, b) => b[1].length - a[1].length).slice(0, 5).map(([nome, pontos]) => ({ nome, pontos }));
  }
  function detailsHTML(f) {
    const b = f.buys.slice(0, 40), parts = [];
    const chart = U.lineChart(priceSeries(f));
    parts.push(`<details ${b.length ? "open" : ""}><summary>Histórico de compras <span class="muted mono">${f.buys.length}</span></summary><div class="in">${chart}${b.length ? `<div class="tbl"><table><thead><tr><th>Data</th><th>Fornecedor</th><th class="n">Qtd</th><th class="n">Preço un.</th><th class="n">IPI</th><th>Situação</th><th>Pedido cliente</th></tr></thead><tbody>${b.map((x) => `<tr><td class="code">${U.dt(x.dt)}</td><td>${esc(x.forn)}</td><td class="n">${U.num(x.qtd)} ${esc(x.un)}</td><td class="n">${x.moeda && x.moeda !== "Real" ? esc(x.moeda) + " " + U.num(x.preco) : U.brl(x.preco)}</td><td class="n">${x.ipi != null ? U.num(x.ipi) + "%" : ""}</td><td>${x.oc ? "OC " + esc(x.ordem) + " · " + esc(x.sit) : "histórico"}</td><td class="code">${esc(x.ped)}${x.ref ? " · ref " + esc(x.ref) : ""}</td></tr>`).join("")}</tbody></table></div>` : '<p class="hint">Nenhuma compra deste código em 2024–2026.</p>'}</div></details>`);
    if (f.forn.length) parts.push(`<details><summary>Fornecedores cadastrados <span class="muted mono">${f.forn.length}</span></summary><div class="in tbl"><table><thead><tr><th>Fornecedor</th><th>Cód. no fornecedor</th><th class="n">Prazo</th><th class="n">Múltiplo</th><th class="n">Mínimo</th></tr></thead><tbody>${f.forn.map((x) => `<tr><td>${esc(x.forn)}</td><td class="code">${esc(x.cod)}</td><td class="n">${x.prazo ? x.prazo + " d" : "—"}</td><td class="n">${x.mult ? U.num(x.mult) : ""}</td><td class="n">${x.min ? U.num(x.min) : ""}</td></tr>`).join("")}</tbody></table></div></details>`);
    if (f.irmaos && f.irmaos.length) parts.push(`<details><summary>Mesma medida no cadastro <span class="muted mono">${f.irmaos.length}</span></summary><div class="in tbl"><table><thead><tr><th>Código</th><th>Descrição</th><th class="n">Largura</th><th class="n">Compras</th><th class="n">Preço tabela</th><th class="n">Saldo</th><th class="n">Lead time</th></tr></thead><tbody>${f.irmaos.map((x) => { const lt = E.lt(x.pid); return `<tr><td class="code">${esc(x.pid)}</td><td>${esc(x.desc)}</td><td class="n">${x.spec.larg ? U.num(x.spec.larg) + " mm" : "—"}</td><td class="n">${x.n}</td><td class="n">${x.pv != null ? U.brl(x.pv) : "—"}</td><td class="n">${E.saldo(x.pid) != null ? U.num(E.saldo(x.pid)) : "—"}</td><td class="n">${lt ? lt.du + " d úteis" : "—"}</td></tr>`; }).join("")}</tbody></table></div></details>`);
    if (f.ficha) { const x = f.ficha; parts.push(`<details><summary>Ficha técnica</summary><div class="in"><div class="facts">${[["Material", x[3]], ["Espessura", x[4]], ["Polia mínima", x[5]], ["Temperatura", x[6]], ["Tração", x[7]], ["Aplicações", x[8]]].filter((y) => y[1]).map(([k, v]) => `<div class="fact"><span class="lbl">${k}</span><span class="v" style="font-family:var(--f-body)">${esc(v)}</span></div>`).join("")}</div><p class="hint">Fonte: ${esc(x[9])}</p></div></details>`); }
    return parts.join("");
  }
  $("#compacto").onchange = () => { S.ls.set("melting_compacto", $("#compacto").checked); if (DOC) renderItems(); };
  $("#compacto").checked = !!S.ls.get("melting_compacto", false);

  /* ============ cliente do pedido ============ */
  function vincularCliente() {
    if (!DOC) return;
    const cli = clientePorNome($("#d-cliente").value);
    const novoId = cli ? cli.id : null;
    if (novoId !== DOC.cliId) { DOC.cliId = novoId; for (const it of DOC.itens) if (!it.manual) it.proposto = null; renderItems(); }
    renderCliBox();
  }
  function renderCliBox() {
    if (!DOC) return;
    const cli = docCliente(), nome = $("#d-cliente").value.trim();
    const n = cli ? Object.keys(cli.precos || {}).length : 0;
    const usados = cli ? DOC.itens.filter((it) => it.pid && precoCli(cli, it.pid)).length : 0;
    $("#cli-box").innerHTML = cli
      ? `<span class="chip ok">Cliente cadastrado</span> <b>${esc(cli.nome)}</b> · ${n} preço(s) salvos · ${usados} item(ns) deste pedido com preço da tabela do cliente${cli.markup ? ` · markup próprio ${U.numIn(cli.markup)}x` : ""} <button class="linkbtn" id="cli-abrir">abrir ficha</button>${(cli.notas || []).length ? `<div class="cli-regras">${cli.notas.filter((n) => n.status !== "Informação").slice(0, 4).map((n) => `<div><b>${esc(n.assunto || n.status || "Regra")}:</b> ${esc(n.texto)}</div>`).join("")}${cli.notas.length > 4 ? `<div class="hint">+ ${cli.notas.length - 4} na ficha do cliente</div>` : ""}</div>` : ""}`
      : nome ? `<span class="chip">Cliente novo</span> "${esc(nome)}" ainda não está no banco. Clique em <b>Salvar preços no cliente</b> para cadastrar com os preços deste pedido.` : `<span class="chip">Sem cliente</span> Informe o cliente para usar a tabela de preços dele.`;
    const ab = $("#cli-abrir"); if (ab) ab.onclick = () => { CSEL = cli.id; go("clientes"); };
  }
  let cliT; $("#d-cliente").addEventListener("input", () => { clearTimeout(cliT); cliT = setTimeout(vincularCliente, 300); });
  $("#d-cliente").addEventListener("change", vincularCliente);

  $("#salvar-precos").onclick = async () => {
    if (!DOC || !BACK) return;
    const nome = $("#d-cliente").value.trim();
    if (!nome) { U.toast("Informe o nome do cliente"); $("#d-cliente").focus(); return; }
    const cli = docCliente() || clientePorNome(nome) || vazioCliente(nome);
    const precos = { ...(cli.precos || {}) }; let n = 0;
    for (const it of DOC.itens) {
      if (!it.pid || it.proposto == null) continue; const p = E.prod(it.pid);
      precos[it.pid] = { preco: Math.round(it.proposto * 100) / 100, data: HOJE, origem: "pedido " + ($("#d-documento").value.trim() || "sem número"), desc: p[1], un: it.un || E.info(it.pid).un, qtd: it.qtd ?? null, codCli: it.codCli || "" };
      n++;
    }
    if (!n) { U.toast("Nenhum item identificado com preço para salvar"); return; }
    try { await salvarCliente({ ...cli, nome: cli.nome || nome, precos }); DOC.cliId = cli.id; renderCliBox(); U.toast(`${n} preço(s) salvos em ${cli.nome || nome}`); }
    catch (e) { U.toast("Não salvou: " + (e.message || e.code)); }
  };

  /* ============ análise de lucro (automática e com IA) ============ */
  const nItem = (n) => String(n || "").replace(/^0+(?=\d)/, "");
  function iaDoItem(it) { return DOC && DOC.ia && (DOC.ia.itens || []).find((x) => nItem(x.n) === nItem(it.n)); }
  function analiseAuto() {
    // resumo sem IA: melhor opção compatível de cada item
    let lucro = 0, venda = 0; const linhas = [];
    for (const it of DOC.itens) {
      const best = (it.opcoes || []).find((o) => o.melhor);
      if (!best || best.lucroTot == null) { linhas.push(`Item ${nItem(it.n)}: sem custo ou produto identificado.`); continue; }
      lucro += best.lucroTot; venda += best.venda * (it.qtd || 1);
      if (best.pid !== it.pid) linhas.push(`Item ${nItem(it.n)}: trocar para ${best.pid} (${best.info.desc}) dá ${U.brl(best.lucroTot)} de lucro (${U.num(best.margem * 100, 1)}%).`);
      else if (best.margem < 1 - 1 / CFG.markup.minimo) linhas.push(`Item ${nItem(it.n)}: margem de ${U.num(best.margem * 100, 1)}% está abaixo do mínimo; reveja o preço ou compre de ${best.forn}.`);
      const lt = best.info.lt, pedido = it.entrega ? Math.round((new Date(it.entrega) - new Date(HOJE)) / 864e5) : it.prazoCliente;
      const temSaldo = best.info.saldo != null && best.info.saldo >= (it.qtd || 1);
      if (lt && pedido != null && !temSaldo && lt.dc > pedido) { const rap = (it.opcoes || []).find((o) => o.maisRapido); linhas.push(`Item ${nItem(it.n)}: cliente pede ${pedido} dias e o ${best.pid} leva ${lt.dc} dias corridos${rap ? `; o ${rap.pid} chega em ${rap.info.lt.du} dias úteis` : ""}.`); }
      else if (lt && lt.confirmar) linhas.push(`Item ${nItem(it.n)}: lead time de ${lt.txt}, confirme o prazo com Compras.`);
    }
    return { lucro, venda, linhas };
  }
  function renderIA() {
    const box = $("#ia-box"); if (!DOC) return;
    const r = DOC.ia;
    if (!r) { box.hidden = true; return; }
    box.hidden = false;
    if (r.auto) {
      const a = analiseAuto();
      box.innerHTML = `<div class="toolbar"><h3>Análise automática de lucro</h3><span class="chip">sem IA</span></div>
        <p class="hint">${esc(r.motivo)}</p>
        <div class="ia-num"><div><span class="lbl">Lucro estimado (melhores opções)</span><b>${U.brl(a.lucro)}</b></div><div><span class="lbl">Venda</span><b>${U.brl(a.venda)}</b></div><div><span class="lbl">Margem</span><b>${a.venda ? U.num((a.lucro / a.venda) * 100, 1) + "%" : "—"}</b></div></div>
        ${a.linhas.length ? `<ul>${a.linhas.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : "<p>Todos os itens já estão na opção de maior lucro.</p>"}
        <div class="row"><button class="btn sm pri" id="ia-aplicar">Aplicar as melhores opções</button></div>`;
    } else {
      box.innerHTML = `<div class="toolbar"><h3>Análise da IA</h3><span class="chip ok">Claude</span></div>
        <p>${esc(r.resumo || "")}</p>
        <div class="ia-num"><div><span class="lbl">Lucro total estimado</span><b>${U.brl(r.lucro_total_estimado)}</b></div><div><span class="lbl">Itens analisados</span><b>${(r.itens || []).length}</b></div></div>
        ${(r.negociacao || []).length ? `<div class="lbl">Negociação</div><ul>${r.negociacao.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
        <div class="row"><button class="btn sm pri" id="ia-aplicar">Aplicar sugestões da IA</button><span class="hint">Confira cada item: a IA usa só os custos e preços do sistema.</span></div>`;
    }
    $("#ia-aplicar").onclick = () => {
      let n = 0;
      for (const it of DOC.itens) {
        if (r.auto) { const b = (it.opcoes || []).find((o) => o.melhor); if (b && b.venda != null) { it.pid = b.pid; it.proposto = Math.round(b.venda * 100) / 100; it.manual = true; n++; } continue; }
        const x = iaDoItem(it); if (!x) continue;
        if (x.codigo && E.prod(String(x.codigo))) { it.pid = String(x.codigo); lembrarProduto(it); }
        if (x.preco_venda != null) { it.proposto = Math.round(+x.preco_venda * 100) / 100; it.manual = true; }
        n++;
      }
      renderItems(); U.toast(`Aplicado em ${n} item(ns)`);
    };
  }
  $("#ia-btn").onclick = async () => {
    if (!DOC || !DOC.itens.length) return;
    const b = $("#ia-btn"); b.disabled = true; b.textContent = "Analisando…";
    const box = $("#ia-box"); box.hidden = false; box.innerHTML = '<div class="loading"><span class="lbl">A IA está comparando custos, fornecedores e preços de cada item</span><div class="bar"></div></div>';
    try {
      for (const it of DOC.itens) prep(it);
      const prompt = L.montarPrompt({ cliente: $("#d-cliente").value.trim() }, DOC.itens, cfgCli(docCliente()), docCliente());
      DOC.ia = await L.analisarIA(prompt);
    } catch (e) {
      DOC.ia = { auto: true, motivo: e.code === "sem_ia" ? "A IA não está disponível nesta versão (abra pelo claude.ai ou configure a função analisar-pedido no Supabase). Abaixo, a análise automática pelas regras do sistema." : e.code === "rate_limited" ? "Muitas análises seguidas; tente a IA de novo em instantes. Abaixo, a análise automática." : "A IA não respondeu (" + (e.message || e.code) + "). Abaixo, a análise automática." };
    }
    renderItems(); renderIA();
    b.disabled = false; b.textContent = "Analisar lucro com IA";
  };

  function opcoesHTML(it, i) {
    const ops = it.opcoes || []; if (!ops.length) return "";
    const mMin = 1 - 1 / CFG.markup.minimo;
    return `<details class="opcoes" open><summary>Opções de lucro <span class="muted mono">${ops.length}</span></summary><div class="in"><div class="tbl"><table><thead><tr><th>Produto</th><th>Melhor fornecedor</th><th class="n">Custo c/ IPI</th><th class="n">Venda</th><th class="n">Lucro</th><th class="n">Margem</th><th></th></tr></thead><tbody>${ops.map((o) => `<tr class="${o.melhor ? "best" : ""} ${o.pid === it.pid ? "atual" : ""}">
      <td><span class="mono">${esc(o.pid)}</span> ${esc(o.info.desc)}<div class="row" style="gap:6px;margin-top:3px"><span class="chip ${o.compatN >= 3 ? "ok" : o.compatN === 2 ? "" : "alerta"}">${L.compatTxt(o.compatN)}</span>${o.melhor ? '<span class="chip ok">maior lucro</span>' : ""}${o.maisRapido ? '<span class="chip lt ok">mais rápido</span>' : ""}<span class="hint">${esc(o.motivo || "")}</span></div></td>
      <td>${esc(o.forn && o.custo != null ? o.forn : "sem compra recente")}${o.info.lt ? `<div class="hint ${o.info.lt.confirmar ? "warn-t" : ""}">chega em ${o.info.lt.du} d úteis</div>` : o.prazo ? `<div class="hint">fornecedor ${o.prazo} dias</div>` : ""}</td>
      <td class="n">${o.custo != null ? U.brl(o.custo) : E.custoSuspeito(o.info) ? `<span class="hint warn-t">cadastro ${U.brl(o.info.custo)} não confiável</span>` : "—"}</td>
      <td class="n">${o.venda != null ? U.brl(o.venda) : "—"}<div class="hint">${esc(o.fonteVenda || "")}</div></td>
      <td class="n">${o.lucroTot != null ? U.brl(o.lucroTot) : "—"}${o.lucroUn != null && (it.qtd || 1) > 1 ? `<div class="hint">${U.brl(o.lucroUn)} un.</div>` : ""}</td>
      <td class="n ${o.margem != null && o.margem < mMin ? "warn-t" : ""}">${o.margem != null ? U.num(o.margem * 100, 1) + "%" : "—"}</td>
      <td>${o.pid === it.pid ? '<span class="hint">em uso</span>' : `<button class="btn icon" data-useop="${i}|${esc(o.pid)}">Usar</button>`}</td></tr>`).join("")}</tbody></table></div>
      <p class="hint">Custo do fornecedor mais barato dos últimos 12 meses, com IPI. Venda: tabela do cliente, preço do pedido ou sugerido, nessa ordem. Prazo: lead time de entrega ao cliente; em lucro parecido, ganha a que chega antes.</p></div></details>`;
  }
  /* ---------- sugestões: substituto, complemento e upgrade ---------- */
  const SUGT = { faltas: ["Se faltar estoque", "Pode substituir"], melhor: ["Rendimento melhor", "Alternativa superior"], combina: ["Combina com", "Ofereça junto"] };
  function precoSug(pid) {
    const cli = docCliente(), pc = precoCli(cli, pid); if (pc) return { v: pc.preco, f: "tabela do cliente" };
    const info = E.info(pid), pr = info ? E.preco(info, cfgCli(cli)) : null;
    return pr ? { v: pr.sugerido, f: "sugerido" } : info && info.pv ? { v: info.pv, f: "tabela" } : null;
  }
  function sugHTML(it, i, info) {
    const s = it.sug; if (!s || !info) return "";
    const tot = s.faltas.length + s.melhor.length + s.combina.length; if (!tot) return "";
    const falta = info.saldo != null && info.saldo < (it.qtd || 1);
    const bloco = (k) => s[k].length ? `<div class="sug-g"><div class="sug-h"><span class="chip ${k === "melhor" ? "acao" : k === "faltas" ? (falta ? "alerta" : "") : "ok"}">${SUGT[k][0]}</span>${k === "faltas" && falta ? '<span class="hint warn-t">o saldo não cobre este pedido</span>' : ""}</div>
      ${s[k].map((x) => { const p = precoSug(x.pid); const of = it.oferecer.includes(x.pid); return `<div class="sug-i">
        <div><span class="mono">${esc(x.pid)}</span> ${esc(x.desc)}<div class="hint">${esc(x.motivo)}${x.compras ? ` · ${x.compras} compra(s) em 12 meses` : ""}${x.saldo != null ? ` · saldo ${U.num(x.saldo)}` : ""}${x.giro ? " · item de giro" : ""}${x.lt ? ` · chega em ${x.lt.du} d úteis${it.pz && it.pz.dias && x.lt.du < it.pz.dias ? ` <b class="ok-t">(${it.pz.dias - x.lt.du} d antes)</b>` : ""}` : ""}</div></div>
        <div class="n mono">${p ? U.brl(p.v) : "—"}<div class="hint">${p ? p.f : ""}</div></div>
        <div class="row sug-b">${k !== "combina" ? `<button class="btn icon" data-sgusar="${i}|${esc(x.pid)}">Usar no lugar</button>` : `<button class="btn icon" data-sgadd="${i}|${esc(x.pid)}">Adicionar ao pedido</button>`}<button class="btn icon ${of ? "on" : ""}" data-sgof="${i}|${esc(x.pid)}" aria-pressed="${of}">${of ? "Na resposta ✓" : "Oferecer na resposta"}</button></div></div>`; }).join("")}</div>` : "";
    return `<details class="sug" ${falta || s.melhor.length || s.combina.length ? "open" : ""}><summary>Sugestões para este item <span class="muted mono">${tot}</span></summary><div class="in">${bloco("faltas")}${bloco("melhor")}${bloco("combina")}</div></details>`;
  }
  function iaItemHTML(it) {
    const x = iaDoItem(it); if (!x) return "";
    return `<div class="ia-item"><div class="row"><span class="chip ok">IA</span><b>${x.codigo ? esc(x.codigo) + " · " : ""}${x.preco_venda != null ? U.brl(+x.preco_venda) : "sem preço"}</b>${x.margem_pct != null ? `<span class="hint">margem ${U.num(+x.margem_pct, 1)}%</span>` : ""}${x.fornecedor ? `<span class="hint">comprar de ${esc(x.fornecedor)}</span>` : ""}${x.prazo ? `<span class="hint">prazo ${esc(x.prazo)}</span>` : ""}</div><p>${esc(x.motivo || "")}</p>${x.sugestao_cliente ? `<p class="ia-sug"><b>Sugestão para o cliente:</b> ${esc(x.sugestao_cliente)}${x.sugestao_codigo ? ` <span class="mono">(${esc(x.sugestao_codigo)})</span>` : ""}</p>` : ""}${(x.alertas || []).length ? `<ul>${x.alertas.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}</div>`;
  }

  /* ============ resposta da cotação ============ */
  function respText() {
    const fmt = $("#resp-fmt").value, sem = $("#resp-sem").checked, p = CFG.proposta;
    const cli = $("#d-cliente").value.trim(), docn = $("#d-documento").value.trim();
    const linhas = []; let tot = 0, k = 0;
    for (const it of DOC.itens) {
      const pr = it.pid ? E.prod(it.pid) : null;
      if (!pr) { if (sem) linhas.push(fmt === "whats" ? `*${++k}.* ${it.texto}\n   Não trabalhamos com este item.` : `${++k}. ${it.texto}\n   Não trabalhamos com este item.`); continue; }
      const q = it.qtd || 1, un = it.un || E.info(it.pid).un, v = it.proposto;
      if (v != null) tot += v * q;
      const desc = `${U.num(q)} ${un} · ${pr[1]} (cód. ${pr[0]})`;
      const val = v != null ? `${U.brl(v)} un. · total ${U.brl(v * q)}` : "preço a confirmar";
      const pz = it.prazoTxt ? ` · prazo: ${it.prazoTxt}` : "";
      linhas.push(fmt === "whats" ? `*${++k}.* ${desc}\n   ${val}${pz}` : `${++k}. ${desc}\n   ${val}${pz}`);
    }
    const cond = [`Validade: ${p.validadeDias} dias`, `Pagamento: ${p.pagamento}`, `Frete: ${p.frete}`];
    const sug = sugOferecidas().map((x) => `${fmt === "whats" ? "• " : "- "}${x.desc} (cód. ${x.pid})${x.preco ? " · " + U.brl(x.preco) + " un." : ""} – ${x.frase}`);
    const blocoSug = sug.length ? (fmt === "whats" ? `\n\n*Sugestões Melting:*\n${sug.join("\n")}` : `\n\nSugestões Melting para o seu pedido:\n${sug.join("\n")}`) : "";
    if (fmt === "whats") return `Olá! Segue a cotação Melting${docn ? " referente ao pedido " + docn : ""}:\n\n${linhas.join("\n")}\n\n*Total: ${U.brl(tot)}*\n${cond.join(" · ")}${blocoSug}\n\nFico à disposição.\n${CFG.empresa.assinatura}`;
    return `Prezados,\n\nConforme solicitado${docn ? " (pedido/cotação " + docn + ")" : ""}, segue nossa proposta comercial nº ${propNum()}, também em anexo em PDF:\n\n${linhas.join("\n\n")}\n\nTotal: ${U.brl(tot)}\n\nCondições:\n${cond.map((c) => "- " + c).join("\n")}${blocoSug}\n\nFicamos à disposição para qualquer esclarecimento.\n\nAtenciosamente,\n${CFG.empresa.assinatura}`;
  }
  /* sugestões marcadas "Oferecer na resposta", com frase para o cliente */
  function sugOferecidas() {
    const out = [];
    for (const it of DOC.itens) for (const pid of it.oferecer || []) {
      const all = [...((it.sug || {}).faltas || []).map((x) => ({ ...x, k: "faltas" })), ...((it.sug || {}).melhor || []).map((x) => ({ ...x, k: "melhor" })), ...((it.sug || {}).combina || []).map((x) => ({ ...x, k: "combina" }))];
      const x = all.find((y) => y.pid === pid); if (!x) continue; const p = precoSug(pid);
      const ref = `item ${nItem(it.n)}`;
      const frase = x.k === "faltas" ? `alternativa para o ${ref} caso precise de entrega mais rápida (${x.motivo})` : x.k === "melhor" ? `opção de maior rendimento para o ${ref}: ${x.motivo}` : `complemento para o ${ref}: ${x.motivo.replace(/comprado junto em \d+ ordens de compra|pedido junto pelo cliente em \d+ pedido\(s\)/, "costuma ser usado junto")}`;
      const lt = E.lt(pid);
      out.push({ pid, desc: x.desc, preco: p ? p.v : null, frase: frase + (lt && x.k === "faltas" ? `; entrega em ${lt.txt}` : ""), item: it.n, tipo: SUGT[x.k][0], prazo: lt ? lt.txt : "" });
    }
    return out;
  }
  function refreshResp() {
    if ($("#resp").hidden || !DOC) return;
    $("#resp-txt").value = respText();
    if (!$("#em-num").value) $("#em-num").value = propNum();
    if (!DOC.assuntoEditado) $("#em-assunto").value = `Proposta comercial Melting nº ${propNum()}` + ($("#d-cliente").value.trim() ? " – " + $("#d-cliente").value.trim() : "") + ($("#d-documento").value.trim() ? " – ref. " + $("#d-documento").value.trim() : "");
    if (!$("#em-para").value) { const cli = docCliente(); const m = S.ls.get("melting_emails", {})[E.norm($("#d-cliente").value.trim())]; if (cli && cli.emails) $("#em-para").value = cli.emails; else if (m) { $("#em-para").value = m.para || ""; $("#em-cc").value = m.cc || ""; } }
    modoEnvio();
  }
  function propNum() {
    if (!DOC) return "";
    if ($("#em-num").value.trim()) return $("#em-num").value.trim();
    if (!DOC.propNum) { const d = new Date(); DOC.propNum = "MLT-" + d.toISOString().slice(2, 10).replace(/-/g, "") + "-" + String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0"); }
    return DOC.propNum;
  }
  $("#resp-btn").onclick = () => { $("#resp").hidden = !$("#resp").hidden; $("#resp-btn").textContent = $("#resp").hidden ? "Gerar resposta" : "Fechar resposta"; if (DOC && !DOC.propNum) $("#em-num").value = ""; refreshResp(); };
  $("#em-topo").onclick = () => {
    if (!DOC) return;
    if ($("#resp").hidden) { $("#resp").hidden = false; $("#resp-btn").textContent = "Fechar resposta"; refreshResp(); }
    $(".envio").scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => (listaEmails($("#em-para").value).length ? $("#em-enviar") : $("#em-para")).focus(), 350);
  };
  $("#em-assunto").oninput = () => { if (DOC) DOC.assuntoEditado = true; };
  $("#em-num").oninput = () => { if (DOC) { DOC.propNum = $("#em-num").value.trim(); refreshResp(); } };

  /* preço base da proposta */
  const BASE_TXT = { proposto: "Cada item fica com o preço que está no card.", tabela: "Usa o preço de venda do cadastro (dsps114).", sugerido: "Custo de referência × markup da categoria (Ajustes).", cliente: "Usa o preço que veio no pedido; itens sem preço ficam com o sugerido.", tabcli: "Usa o preço salvo na tabela deste cliente (aba Clientes).", lucro: "Troca cada item para a opção compatível de maior lucro e usa o preço de venda dela." };
  $("#resp-base").onchange = () => ($("#resp-base-info").textContent = BASE_TXT[$("#resp-base").value]);
  $("#resp-aplicar").onclick = () => {
    if (!DOC) return; const b = $("#resp-base").value; let n = 0;
    for (const it of DOC.itens) {
      if (b === "lucro") { const o = (it.opcoes || []).find((x) => x.melhor); if (o && o.venda != null) { it.pid = o.pid; it.proposto = Math.round(o.venda * 100) / 100; it.fonte = o.fonteVenda; it.manual = true; n++; } continue; }
      if (!it.pid) continue; const info = E.info(it.pid), pr = E.preco(info, cfgCli(docCliente())), pc = precoCli(docCliente(), it.pid);
      const v = b === "tabela" ? info.pv : b === "sugerido" ? pr && pr.sugerido : b === "cliente" ? it.preco ?? (pr && pr.sugerido) : b === "tabcli" ? pc && pc.preco : it.proposto;
      if (v != null) { it.proposto = Math.round(v * 100) / 100; it.manual = true; it.fonte = { tabela: "preço de tabela", sugerido: "sugerido", cliente: "preço do pedido", tabcli: "tabela do cliente" }[b] || it.fonte; n++; }
    }
    renderItems(); U.toast(`Preço aplicado em ${n} item(ns)`);
  };

  /* PDF e e-mail */
  function dadosProposta() {
    const sem = $("#resp-sem").checked;
    return {
      cfg: CFG, numero: propNum(), data: HOJE, validadeDias: CFG.proposta.validadeDias,
      cliente: $("#d-cliente").value.trim(), documento: $("#d-documento").value.trim(), contato: $("#em-para").value.trim(),
      itens: DOC.itens.filter((it) => it.pid || sem).map((it) => {
        const p = it.pid ? E.prod(it.pid) : null;
        return { n: it.n, codigo: p ? p[0] : "", descricao: p ? p[1] : it.texto, qtd: it.qtd || 1, un: it.un || (p ? E.info(it.pid).un : ""), preco: it.proposto, prazo: it.prazoTxt || "", semAtendimento: !p };
      }),
      sugestoes: sugOferecidas(),
    };
  }
  const nomePdf = () => `proposta-melting-${propNum().replace(/[^\w\-]+/g, "_")}.pdf`;
  $("#pdf-btn").onclick = async () => {
    if (!DOC || !DOC.itens.length) return;
    const b = $("#pdf-btn"); b.disabled = true; $("#em-status").textContent = "Gerando PDF…";
    try { const r = await MeltProposta.gerar(dadosProposta()); await U.saveFile(nomePdf(), r.blob); $("#em-status").textContent = "PDF gerado: " + nomePdf(); }
    catch (e) { $("#em-status").textContent = "Não gerou o PDF: " + e.message; }
    b.disabled = false;
  };
  const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
  const listaEmails = (v) => v.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
  async function podeSupabase() { try { if (!S.supaConfigured()) return false; await S.initSupabase(); return !!(await S.supaSession()); } catch { return false; } }
  async function modoEnvio() {
    const sb = await podeSupabase();
    $("#em-modo").textContent = sb ? "O e-mail sai direto pelo servidor da Melting (Supabase), com o PDF anexado."
      : "Ao clicar em Enviar e-mail, o PDF da proposta é baixado e o seu programa de e-mail abre com destinatário, assunto e texto prontos: anexe o PDF e envie. Para o e-mail sair direto, sem abrir o programa, configure o envio (ver README).";
    $("#em-enviar").textContent = "Enviar e-mail";
  }
  $("#em-enviar").onclick = async () => {
    if (!DOC) return;
    const para = listaEmails($("#em-para").value), cc = listaEmails($("#em-cc").value);
    const ruim = [...para, ...cc].filter((x) => !EMAIL_RE.test(x));
    if (!para.length) { $("#em-status").textContent = "Digite o e-mail do cliente."; $("#em-para").focus(); return; }
    if (ruim.length) { $("#em-status").textContent = "E-mail inválido: " + ruim.join(", "); return; }
    const em = S.ls.get("melting_emails", {}); em[E.norm($("#d-cliente").value.trim())] = { para: para.join(", "), cc: cc.join(", ") }; S.ls.set("melting_emails", em);
    const assunto = $("#em-assunto").value.trim(), texto = $("#resp-txt").value;
    const b = $("#em-enviar"); b.disabled = true; $("#em-status").textContent = "Gerando PDF…";
    try {
      const r = await MeltProposta.gerar(dadosProposta());
      if (await podeSupabase()) {
        $("#em-status").textContent = "Enviando…";
        const { data, error } = await S.supa.functions.invoke(CFG.supabase.funcaoEmail || "enviar-cotacao", { body: { para, cc, assunto, texto, responderPara: CFG.empresa.email || "", anexo: { nome: nomePdf(), base64: r.base64 } } });
        if (error || (data && data.erro)) throw new Error((data && data.erro) || error.message);
        $("#em-status").textContent = `Enviado para ${para.join(", ")} às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`;
      } else {
        await U.saveFile(nomePdf(), r.blob);
        const href = "mailto:" + encodeURIComponent(para.join(",")) + "?" + [cc.length ? "cc=" + encodeURIComponent(cc.join(",")) : "", "subject=" + encodeURIComponent(assunto), "body=" + encodeURIComponent(texto.length > 1800 ? texto.slice(0, 1800) + "\n\n(proposta completa no PDF em anexo)" : texto)].filter(Boolean).join("&");
        const a = document.createElement("a"); a.href = href; a.target = "_blank"; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove();
        $("#em-status").textContent = `PDF baixado (${nomePdf()}). Se o e-mail não abriu sozinho, copie o texto e envie para ${para.join(", ")}.`;
      }
      const cli = docCliente(); if (cli && !cli.emails) { try { await salvarCliente({ ...cli, emails: para.join(", ") }); } catch {} }
    } catch (e) { $("#em-status").textContent = "Não enviou: " + e.message; }
    b.disabled = false;
  };
  $("#resp-fmt").onchange = refreshResp; $("#resp-sem").onchange = refreshResp;
  ["#d-cliente", "#d-documento"].forEach((s) => ($(s).oninput = refreshResp));
  $("#resp-copy").onclick = () => U.copy($("#resp-txt").value, $("#resp-txt"));
  $("#d-xlsx").onclick = () => {
    if (!DOC || !DOC.itens.length) return;
    const cab = { Cliente: $("#d-cliente").value, Documento: $("#d-documento").value, Data: $("#d-data").value, Canal: $("#d-canal").value };
    const itens = [], recs = [], ops = [];
    for (const it of DOC.itens) {
      const info = it.pid ? E.info(it.pid) : null, pr = info ? E.preco(info, cfgCli(docCliente())) : null, rr = E.recommend(it, info, HOJE, CFG);
      const atual = (it.opcoes || []).find((o) => o.pid === it.pid), ia = iaDoItem(it);
      const main = rr.find((r) => r.lvl === "alerta") || rr.find((r) => r.lvl === "op");
      itens.push({ ...cab, Item: it.n, "Cód. cliente": it.codCli || "", "Pedido do cliente": it.texto, Qtd: it.qtd ?? "", Un: it.un || (info ? info.un : ""), Entrega: it.entrega || "", "Preço do cliente": it.preco ?? "",
        "Código Melting": it.pid || "", Produto: info ? info.desc : "fora do cadastro", "Custo de referência": pr ? Math.round(pr.custo * 100) / 100 : "", "Preço sugerido": pr ? pr.sugerido : "", "Preço proposto": it.proposto ?? "",
        "Total proposto": it.proposto != null ? Math.round(it.proposto * (it.qtd || 1) * 100) / 100 : "", Markup: pr && it.proposto ? Math.round((it.proposto / pr.custo) * 100) / 100 : "", Prazo: it.prazoTxt || "", "Lead time (dias úteis)": info && info.lt ? info.lt.du : "", "Lead time (dias corridos)": info && info.lt ? info.lt.dc : "", "Base do lead time": info && info.lt ? info.lt.baseTxt : "", "Confirmar prazo": info && info.lt && info.lt.confirmar ? "sim" : "", Saldo: info && info.saldo != null ? info.saldo : "",
        "Fonte do preço": it.fonte || "", "Custo melhor fornecedor": atual && atual.custo != null ? Math.round(atual.custo * 100) / 100 : "", "Melhor fornecedor": atual ? atual.forn : "",
        "Lucro total": atual && atual.custo != null && it.proposto != null ? Math.round((it.proposto - atual.custo) * (it.qtd || 1) * 100) / 100 : "", "Margem %": atual && atual.custo != null && it.proposto ? Math.round(((it.proposto - atual.custo) / it.proposto) * 1000) / 10 : "",
        "Principal alerta": main ? main.tit : "", "Sugestão da IA": ia ? `${ia.codigo || ""} ${ia.preco_venda != null ? U.brl(+ia.preco_venda) : ""} · ${ia.motivo || ""}`.trim() : "" });
      for (const o of it.opcoes || []) ops.push({ Item: it.n, "Código": o.pid, Produto: o.info.desc, Compatibilidade: L.compatTxt(o.compatN), "Melhor fornecedor": o.forn || "", "Custo c/ IPI": o.custo != null ? Math.round(o.custo * 100) / 100 : "", Venda: o.venda ?? "", "Origem do preço": o.fonteVenda || "", "Lucro un.": o.lucroUn != null ? Math.round(o.lucroUn * 100) / 100 : "", "Lucro total": o.lucroTot != null ? Math.round(o.lucroTot * 100) / 100 : "", "Margem %": o.margem != null ? Math.round(o.margem * 1000) / 10 : "", "Lead time (dias úteis)": o.info.lt ? o.info.lt.du : "", "Maior lucro": o.melhor ? "sim" : "", "Mais rápido": o.maisRapido ? "sim" : "" });
      for (const r of rr) recs.push({ Item: it.n, "Código Melting": it.pid || "", Tipo: LVL[r.lvl], Recomendação: r.tit, Detalhe: r.txt });
    }
    const nome = (DOC.documento || DOC.cliente || "pedido").replace(/[^\w\-]+/g, "_").slice(0, 40);
    U.exportXLSX(`pedido-${nome}-${HOJE}.xlsx`, { Pedido: itens, "Opções de lucro": ops, Recomendações: recs });
  };
  /* ============ calculadora de preço ============ */
  const K = Object.assign({ custo: null, ipi: 0, servico: 0, frete: 0, qtd: 1, lucro: 50, modo: "markup", impostos: 0, comissao: 0, outras: 0, arred: "nao", pid: "", item: null }, S.ls.get("melting_calc", {}), { item: null });
  let KCOT = null; // dados da última cotação feita (o resultado só muda ao clicar em Cotar produto)
  const KF = { custo: "#k-custo", ipi: "#k-ipi", servico: "#k-serv", frete: "#k-frete", qtd: "#k-qtd", lucro: "#k-lucro", impostos: "#k-imp", comissao: "#k-com", outras: "#k-out" };
  const RAPIDOS = [20, 30, 40, 50, 60, 80, 100];
  function calcDoItem(i) {
    const it = DOC.itens[i], info = it.pid ? E.info(it.pid) : null;
    if (info) {
      const ult = info.buys.find((b) => b.sit !== "Cancelado" && b.preco && (b.moeda === "Real" || !b.moeda));
      K.custo = ult ? ult.preco : info.custoAtual; K.ipi = ult ? ult.ipi || 0 : info.ipi || 0;
      K.pid = info.pid; K.qtd = it.qtd || 1; K.lucro = Math.round((E.markupDe(info, CFG) - 1) * 100); K.modo = "markup";
    }
    K.item = i; KCOT = null; go("calc");
  }
  function kRead() {
    for (const [k, sel] of Object.entries(KF)) K[k] = U.parseNum($(sel).value) ?? (k === "custo" ? null : k === "qtd" ? 1 : 0);
    K.modo = ($("input[name=k-modo]:checked") || {}).value || "markup"; K.arred = $("#k-arr").value;
    S.ls.set("melting_calc", { ...K, item: null });
  }
  function renderCalc() {
    for (const [k, sel] of Object.entries(KF)) if (document.activeElement !== $(sel)) $(sel).value = K[k] == null ? "" : U.numIn(K[k]);
    $$("input[name=k-modo]").forEach((r) => (r.checked = r.value === K.modo)); $("#k-arr").value = K.arred;
    const p = K.pid ? E.prod(K.pid) : null;
    const klt = p ? E.lt(p[0]) : null;
    $("#k-origem").textContent = p ? `Custo de ${p[0]} · ${p[1]}${klt ? ` · entrega em ${klt.txt}` : ""}` : "";
    const aplicar = K.item != null && DOC && DOC.itens[K.item];
    $("#k-aplicar").hidden = !aplicar; if (aplicar) $("#k-aplicar").textContent = "Usar no item " + DOC.itens[K.item].n;
    kOut();
  }
  function kOut() {
    $("#k-rapidos").innerHTML = RAPIDOS.map((v) => `<button class="chipbtn" data-kl="${v}" aria-pressed="${K.lucro === v}">${v}%</button>`).join("");
    $$("#k-rapidos [data-kl]").forEach((b) => (b.onclick = () => { K.lucro = +b.dataset.kl; $("#k-lucro").value = K.lucro; kRead(); kOut(); }));
    const ded0 = K.impostos + K.comissao + K.outras; $("#k-desp-t").textContent = ded0 ? U.num(ded0) + "%" : "nenhuma";
    const temRes = !!KCOT;
    $("#k-vazio").hidden = temRes; $("#k-res").hidden = !temRes;
    $("#k-stale").hidden = !temRes || JSON.stringify(kSnap()) === JSON.stringify(KCOT);
    if (!temRes) { $("#k-cen").innerHTML = '<p class="hint">Aparece depois de cotar.</p>'; return; }
    const K0 = K; { const K = KCOT; const ded = K.impostos + K.comissao + K.outras;
    if (!K.custo) {
      $("#k-preco").className = "preco-v"; $("#k-preco").textContent = "—"; $("#k-preco-sub").textContent = "Digite o custo do produto.";
      $("#k-bar").innerHTML = ""; $("#k-facts").innerHTML = ""; $("#k-cen").innerHTML = ""; return;
    }
    const r = MeltCalc.calc(K);
    if (r.erro) { $("#k-preco").className = "preco-v err"; $("#k-preco").textContent = r.erro; $("#k-dest").innerHTML = ""; $("#k-preco-sub").textContent = ""; $("#k-bar").innerHTML = ""; $("#k-facts").innerHTML = ""; }
    else {
      $("#k-preco").className = "preco-v"; $("#k-preco").textContent = U.brl(r.preco);
      $("#k-dest").innerHTML = `<div><span class="lbl">Custo total</span><b>${U.brl(r.custoTotal)}</b><small>produto + serviço + frete</small></div>
        <div class="lucro"><span class="lbl">Lucro em R$</span><b>${U.brl(r.lucroR)}</b><small>${K.qtd > 1 ? U.brl(r.lucroTotal) + " em " + U.num(K.qtd) + " un." : "por unidade, já sem impostos"}</small></div>
        <div class="lucro"><span class="lbl">Lucro em %</span><b>${U.num(r.markup * 100, 1)}%</b><small>sobre o custo · ${U.num(r.margem * 100, 1)}% sobre a venda</small></div>`;
      const partes = [r.servico ? "serviço" : "", r.frete ? "frete" : "", K.impostos ? "impostos" : "", K.comissao ? "comissão" : "", K.outras ? "outras despesas" : "", `margem de lucro de ${U.num(K.lucro)}% ${K.modo === "margem" ? "sobre a venda" : "sobre o custo"}`].filter(Boolean);
      $("#k-frase").innerHTML = `Após ${esc(partes.length > 1 ? partes.slice(0, -1).join(", ") + " e " + partes.slice(-1) : partes[0])}, o valor é <b>${U.brl(r.preco)}</b>` + (K.qtd > 1 ? ` por unidade (${U.brl(r.total)} em ${U.num(K.qtd)} un.).` : ".");
      $("#k-preco-sub").textContent = (K.arred !== "nao" ? `sem arredondar: ${U.brl(r.bruto)} · ` : "") + `por unidade` + (K.qtd > 1 ? ` · ${U.num(K.qtd)} un. = ${U.brl(r.total)}` : "");
      const w = (v) => Math.max(0, (v / r.preco) * 100).toFixed(2) + "%";
      $("#k-bar").innerHTML = `<span style="width:${w(r.custoProduto)};background:var(--c1)" title="Produto"></span><span style="width:${w(r.servico + r.frete)};background:var(--c2)" title="Serviço e frete"></span><span style="width:${w(r.despesas)};background:var(--c3)" title="Despesas"></span><span style="width:${w(r.lucroR)};background:var(--op)" title="Lucro"></span>`;
      const F = [["Custo do produto", U.brl(r.custoProduto), K.ipi ? "com " + U.num(K.ipi) + "% de IPI" : "sem IPI"], ["Serviço + frete", U.brl(r.servico + r.frete), `serviço ${U.brl(r.servico)} · frete ${U.brl(r.frete)}`], ["Custo total", U.brl(r.custoTotal), "produto + serviço + frete"], ["Despesas da venda", U.brl(r.despesas), U.num(ded) + "% do preço"], ["Lucro por unidade", U.brl(r.lucroR), K.qtd > 1 ? "total " + U.brl(r.lucroTotal) : ""],
        ["Markup sobre o custo", U.num(r.markup * 100, 1) + "%", "lucro ÷ custo"], ["Margem sobre a venda", U.num(r.margem * 100, 1) + "%", "lucro ÷ preço"], ["Multiplicador", U.num(r.fator, 3).replace(/(,\d*?)0+$/, "$1") + "x", "preço ÷ custo"]];
      $("#k-facts").innerHTML = F.map(([k, v, d]) => `<div class="fact"><span class="lbl">${k}</span><span class="v">${v}</span>${d ? `<span class="hint">${d}</span>` : ""}</div>`).join("");
    }
    const cen = RAPIDOS.concat(RAPIDOS.includes(K.lucro) ? [] : [K.lucro]).sort((a, b) => a - b);
    $("#k-cen").innerHTML = `<table><thead><tr><th class="n">Lucro</th><th class="n">Preço (markup)</th><th class="n">Preço (margem)</th><th class="n">Lucro R$ (${K.modo === "margem" ? "margem" : "markup"})</th></tr></thead><tbody>${cen.map((v) => {
      const a = MeltCalc.calc({ ...K, lucro: v, modo: "markup" }), b = MeltCalc.calc({ ...K, lucro: v, modo: "margem" }), c = K.modo === "margem" ? b : a;
      return `<tr class="click ${v === K.lucro ? "atual" : ""}" data-kc="${v}"><td class="n">${v}%</td><td class="n">${a.erro ? "—" : U.brl(a.preco)}</td><td class="n">${b.erro || b.fator > 15 ? "inviável" : U.brl(b.preco)}</td><td class="n">${c.erro ? "—" : U.brl(c.lucroR)}</td></tr>`; }).join("")}</tbody></table>`;
    $$("#k-cen [data-kc]").forEach((tr) => (tr.onclick = () => { K0.lucro = +tr.dataset.kc; $("#k-lucro").value = K0.lucro; kRead(); cotar(); }));
    }
  }
  const kSnap = () => { const { item, pid, ...x } = K; return x; };
  function cotar() {
    kRead();
    if (!K.custo) { U.toast("Digite o custo do produto"); $("#k-custo").focus(); return; }
    KCOT = kSnap(); kOut();
    if (innerWidth < 900) $("#k-res").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  $("#k-cotar").onclick = cotar;
  $$("#v-calc input[type=text]").forEach((i) => i.addEventListener("keydown", (e) => { if (e.key === "Enter" && i.id !== "k-busca") cotar(); }));
  Object.values(KF).forEach((sel) => ($(sel).oninput = () => { kRead(); kOut(); }));
  $$("input[name=k-modo]").forEach((r) => (r.onchange = () => { kRead(); kOut(); }));
  $("#k-arr").onchange = () => { kRead(); kOut(); };
  $("#k-copy").onclick = () => { if (!KCOT) return; const r = MeltCalc.calc(KCOT); if (!r.erro) U.copy(U.brl(r.preco)); };
  $("#k-limpar").onclick = () => { Object.assign(K, { custo: null, ipi: 0, servico: 0, frete: 0, qtd: 1, lucro: 50, modo: "markup", impostos: 0, comissao: 0, outras: 0, arred: "nao", pid: "", item: null }); KCOT = null; S.ls.set("melting_calc", K); renderCalc(); };
  $("#k-aplicar").onclick = () => {
    const it = DOC && DOC.itens[K.item]; if (!it || !KCOT) return; const r = MeltCalc.calc(KCOT); if (r.erro) return;
    it.proposto = Math.round(r.preco * 100) / 100; renderItems(); go("analisar"); U.toast(`Preço ${U.brl(it.proposto)} aplicado ao item ${it.n}`);
  };
  let kst;
  $("#k-busca").oninput = () => { clearTimeout(kst); kst = setTimeout(() => {
    const ids = E.search($("#k-busca").value, 6);
    $("#k-sug").innerHTML = ids.map((pid) => { const p = E.prod(pid); return `<button data-kp="${esc(pid)}"><span class="c">${esc(pid)}</span><span>${esc(p[1])}</span><span class="c">${p[9] != null ? U.brl(p[9]) : ""}</span></button>`; }).join("");
    $$("#k-sug [data-kp]").forEach((b) => (b.onclick = () => {
      const info = E.info(b.dataset.kp); const ult = info.buys.find((x) => x.sit !== "Cancelado" && x.preco && (x.moeda === "Real" || !x.moeda));
      K.custo = ult ? ult.preco : info.custoAtual; K.ipi = ult ? ult.ipi || 0 : info.ipi || 0; K.pid = info.pid;
      $("#k-busca").value = ""; $("#k-sug").innerHTML = ""; S.ls.set("melting_calc", { ...K, item: null }); renderCalc();
      U.toast(ult ? `Custo da última compra (${ult.forn}, ${U.dt(ult.dt)})` : "Custo de entrada do cadastro");
    }));
  }, 160); };

  /* ============ recomendações de estoque (no painel) ============ */
  let RTAB = "giro";
  function giroRows() {
    const has = !!(SALDO && SALDO.map);
    return REC.giro.map((r) => {
      const saldo = E.saldo(r.pid);
      let st = r.status, cob = null;
      if (has && saldo != null) { cob = r.qmes ? Math.round(saldo / (r.qmes / 30)) : null; st = saldo <= 0 ? "ruptura" : cob != null && cob < 45 ? "repor" : "ok"; }
      const sugest = has && saldo != null ? Math.max(Math.ceil((r.qmes || 0) * 2 - saldo), 0) : r.lote || 1;
      return { ...r, saldo, cob, st, sugest };
    });
  }
  const SL = { atrasado: "Compra atrasada", no_ciclo: "No ciclo de compra", parado: "Sem compra há +1 ano", ok: "Em dia", ruptura: "Sem saldo", repor: "Repor (< 45 dias)" };
  const RDEF = {
    giro: { t: "Reposição de itens de giro", d: () => (SALDO ? "Itens sem saldo ou com menos de 45 dias de cobertura" : "Itens de giro cujo ciclo de compra venceu e sem OC aberta"),
      count: () => giroRows().filter((r) => ["atrasado", "ruptura", "repor"].includes(r.st)).length,
      note: () => SALDO ? `Com o saldo importado: cobertura = saldo ÷ consumo médio diário (compras 2024–2026). Sugestão de compra cobre 2 meses de consumo.` : "Calculado pelo intervalo médio entre compras de 2024 a 2026. Sem o saldo de estoque, o status mostra se a compra está atrasada em relação ao ritmo normal do item. Importe o saldo para ver cobertura em dias." },
    enc: { t: "Sob encomenda recorrente", d: () => "Comprados várias vezes em 2026 para atender pedidos de clientes", count: () => REC.enc.length,
      note: () => "OCs de 2026 abertas com número de pedido do cliente na descrição (\"Ped.: …\"). Item comprado para 3 ou mais pedidos diferentes é forte candidato a estoque mínimo." },
    preco: { t: "Negociar com fornecedor", d: () => "Mesmo item comprado com diferença de preço acima de 30% em 12 meses", count: () => REC.preco.length,
      note: () => "Comparação do preço mediano por fornecedor nos últimos 12 meses (só compras em reais). A economia estimada é o que teria saído mais barato comprando tudo do fornecedor de menor preço." },
    margem: { t: "Preço de tabela abaixo do custo", d: () => "Preço de venda menor que o último custo + 15%", count: () => REC.margem.length,
      note: () => "Preço de venda do cadastro comparado com o último custo de OC de 2026 com IPI. Diferenças muito grandes, normalmente erro de unidade (mm × metro), foram retiradas." },
  };
  let LAST_ROWS = [];
  const ltCel = (pid) => { const lt = E.lt(pid); return lt ? `<span class="${lt.confirmar ? "warn-t" : ""}" title="${esc(lt.baseTxt)}">${lt.du} d úteis</span>` : "—"; };
  const ltXl = (pid) => { const lt = E.lt(pid); return { "Lead time (dias úteis)": lt ? lt.du : "", "Lead time (dias corridos)": lt ? lt.dc : "", "Base do lead time": lt ? lt.baseTxt : "" }; };
  function renderRec() {
    $("#rec-base").textContent = SALDO ? `com saldo de ${U.dt(SALDO.importado_em)}` : "sem saldo importado";
    $("#tiles").innerHTML = Object.entries(RDEF).map(([k, v]) => `<button class="tile" data-rt="${k}" aria-pressed="${k === RTAB}"><span class="lbl">${v.t}</span><span class="v">${v.count()}</span><p>${v.d()}</p></button>`).join("");
    $$("[data-rt]").forEach((b) => (b.onclick = () => { RTAB = b.dataset.rt; $("#rs").value = ""; renderRec(); }));
    $("#rec-note").textContent = RDEF[RTAB].note();
    const rs = $("#rs"); rs.hidden = RTAB !== "giro";
    const opts = SALDO ? ["ruptura", "repor", "ok", "atrasado", "no_ciclo", "parado"] : ["atrasado", "no_ciclo", "parado", "ok"];
    const cur = rs.value; rs.innerHTML = `<option value="">Todos os status</option>` + opts.map((o) => `<option value="${o}" ${o === cur ? "selected" : ""}>${SL[o]}</option>`).join("");
    const q = E.norm($("#rq").value.trim()), st = rs.value;
    const D = (pid) => (E.prod(pid) || [pid, "(sem cadastro)"])[1];
    const hit = (r, ...xs) => !q || E.norm([r.pid, D(r.pid), ...xs].join(" ")).includes(q);
    let head, rows, xl;
    if (RTAB === "giro") {
      const ord = { ruptura: 0, repor: 1, atrasado: 2, no_ciclo: 3, parado: 4, ok: 5 };
      const L = giroRows().filter((r) => (!st || r.st === st) && hit(r, r.ult_forn)).sort((a, b) => ord[a.st] - ord[b.st] || (b.valor_mes || 0) - (a.valor_mes || 0)).slice(0, 600);
      head = ["", "Código", "Descrição", "Status", SALDO ? "Saldo" : "Intervalo médio", SALDO ? "Cobertura" : "Última compra", "Consumo/mês", "Sugestão", "Lead time", "Últ. preço", "Últ. fornecedor"];
      rows = L.map((r) => [`<span class="sev ${r.st}"></span>`, r.pid, D(r.pid), SL[r.st], SALDO ? U.num(r.saldo) : r.intervalo + " d", SALDO ? (r.cob != null ? r.cob + " d" : "—") : "há " + r.dias + " d", U.num(r.qmes), U.num(r.sugest), ltCel(r.pid), U.brl(r.ult_preco), esc(r.ult_forn)]);
      xl = L.map((r) => ({ Código: r.pid, Descrição: D(r.pid), Status: SL[r.st], Saldo: r.saldo ?? "", "Cobertura (dias)": r.cob ?? "", "Intervalo médio (dias)": r.intervalo, "Dias desde a última compra": r.dias, "Consumo/mês": r.qmes, "Sugestão de compra": r.sugest, ...ltXl(r.pid), "Últ. preço": r.ult_preco, "Últ. fornecedor": r.ult_forn }));
    } else if (RTAB === "enc") {
      const L = REC.enc.filter((r) => hit(r, r.forn.join(" "), r.refs.join(" ")));
      head = ["Código", "Descrição", "Pedidos de cliente", "Qtd comprada", "Preço mediano", "Primeira", "Última", "Ref. cliente", "Fornecedor", "Lead time", "Saldo"];
      rows = L.map((r) => [r.pid, D(r.pid), r.n, U.num(r.qtd), U.brl(r.preco), U.dt(r.prim), U.dt(r.ult), esc(r.refs.join(", ")), esc(r.forn.join(", ")), ltCel(r.pid), E.saldo(r.pid) != null ? U.num(E.saldo(r.pid)) : "—"]);
      xl = L.map((r) => ({ Código: r.pid, Descrição: D(r.pid), "Pedidos de cliente": r.n, "Qtd comprada": r.qtd, "Preço mediano": r.preco, Primeira: r.prim, Última: r.ult, "Ref. cliente": r.refs.join(", "), Fornecedor: r.forn.join(", "), ...ltXl(r.pid), Giro: r.giro ? "sim" : "não" }));
    } else if (RTAB === "preco") {
      const L = REC.preco.filter((r) => hit(r, r.barato, r.caro));
      head = ["Código", "Descrição", "Mais barato", "Preço", "Mais caro", "Preço", "Diferença", "Qtd 12m", "Economia possível"];
      rows = L.map((r) => [r.pid, D(r.pid), esc(r.barato), U.brl(r.p_lo), esc(r.caro), U.brl(r.p_hi), r.dif + "%", U.num(r.qtd12), U.brl(r.economia)]);
      xl = L.map((r) => ({ Código: r.pid, Descrição: D(r.pid), "Mais barato": r.barato, "Preço menor": r.p_lo, "Mais caro": r.caro, "Preço maior": r.p_hi, "Diferença %": r.dif, "Qtd 12 meses": r.qtd12, "Economia possível": r.economia }));
    } else {
      const L = REC.margem.filter((r) => hit(r, r.forn));
      head = ["Código", "Descrição", "Preço tabela", "Último custo c/ IPI", "Tabela ÷ custo", "Sugerido", "Fornecedor", "Data"];
      rows = L.map((r) => { const i = E.info(r.pid); const pr = i ? E.preco(i, CFG) : null; return [r.pid, D(r.pid), U.brl(r.pv), U.brl(r.custo), U.num(r.mk) + "x", pr ? U.brl(pr.sugerido) : "—", esc(r.forn), U.dt(r.dt)]; });
      xl = L.map((r) => { const i = E.info(r.pid); const pr = i ? E.preco(i, CFG) : null; return { Código: r.pid, Descrição: D(r.pid), "Preço tabela": r.pv, "Último custo c/ IPI": r.custo, "Tabela ÷ custo": r.mk, "Preço sugerido": pr ? pr.sugerido : "", Fornecedor: r.forn, Data: r.dt }; });
    }
    LAST_ROWS = xl;
    const numCol = (h) => /Lead time|Intervalo|Última compra|Consumo|Lote|preço|Preço|Qtd|Pedidos|Diferença|Economia|custo|÷|Saldo|Cobertura|Sugest/.test(h);
    const di = head.indexOf("Descrição"), ci = head.indexOf("Código");
    $("#rtable").innerHTML = rows.length ? `<table><thead><tr>${head.map((h) => `<th class="${numCol(h) ? "n" : ""}">${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr class="click" data-open="${esc(r[ci])}">${r.map((c, j) => `<td class="${numCol(head[j]) ? "n" : j === ci ? "code" : ""}">${j === di ? esc(c) : c}</td>`).join("")}</tr>`).join("")}</tbody></table>`
      : '<div class="empty in">Nada encontrado com esse filtro.</div>';
    $$("#rtable [data-open]").forEach((tr) => (tr.onclick = (e) => { if (e.target.closest("button")) return; openProduct(tr.dataset.open); }));
  }
  $("#rq").oninput = () => renderRec(); $("#rs").onchange = () => renderRec();
  $("#rec-xlsx").onclick = () => {
    const D = (pid) => (E.prod(pid) || [pid, "(sem cadastro)"])[1];
    const giro = giroRows().map((r) => ({ Código: r.pid, Descrição: D(r.pid), Status: SL[r.st], Saldo: r.saldo ?? "", "Cobertura (dias)": r.cob ?? "", "Intervalo médio (dias)": r.intervalo, "Dias desde a última compra": r.dias, "Consumo/mês": r.qmes, "Lote típico": r.lote, "Sugestão de compra": r.sugest, ...ltXl(r.pid), "OC em aberto": r.aberto, "Últ. preço": r.ult_preco, "Últ. fornecedor": r.ult_forn }));
    const enc = REC.enc.map((r) => ({ Código: r.pid, Descrição: D(r.pid), "Pedidos de cliente": r.n, "Qtd comprada": r.qtd, "Preço mediano": r.preco, Primeira: r.prim, Última: r.ult, "Ref. cliente": r.refs.join(", "), Fornecedor: r.forn.join(", "), ...ltXl(r.pid), Giro: r.giro ? "sim" : "não", Saldo: E.saldo(r.pid) ?? "" }));
    const preco = REC.preco.map((r) => ({ Código: r.pid, Descrição: D(r.pid), "Mais barato": r.barato, "Preço menor": r.p_lo, "Mais caro": r.caro, "Preço maior": r.p_hi, "Diferença %": r.dif, "Qtd 12 meses": r.qtd12, "Economia possível": r.economia }));
    const margem = REC.margem.map((r) => { const i = E.info(r.pid); const pr = i ? E.preco(i, CFG) : null; return { Código: r.pid, Descrição: D(r.pid), "Preço tabela": r.pv, "Último custo c/ IPI": r.custo, "Tabela ÷ custo": r.mk, "Preço sugerido": pr ? pr.sugerido : "", Fornecedor: r.forn, Data: r.dt }; });
    const sheets = { "Reposição de giro": giro, "Sob encomenda": enc, "Negociar fornecedor": preco, "Tabela abaixo do custo": margem };
    if ($("#rq").value.trim() || $("#rs").value) sheets["Filtro atual"] = LAST_ROWS;
    U.exportXLSX(`estoque-recomendacoes-${HOJE}.xlsx`, sheets);
  };
  $("#saldo-file").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const rows = await U.readTable(f);
      if (!rows.length) throw new Error("arquivo vazio");
      const cols = Object.keys(rows[0]);
      const cId = cols.find((c) => /produto|c[oó]d|^id$|item/i.test(c)) || cols[0];
      const cSd = cols.find((c) => c !== cId && /saldo|estoque|disp|qtd|quant/i.test(c)) || cols[1];
      const map = {}; let n = 0;
      for (const r of rows) { const id = String(r[cId]).trim().replace(/\.0+$/, ""); const v = U.parseNum(r[cSd]); if (id && v != null) { map[id] = v; n++; } }
      if (!n) throw new Error(`não achei códigos e saldos (colunas lidas: ${cId} e ${cSd})`);
      SALDO = { importado_em: HOJE, arquivo: f.name, n, map, colunas: [cId, cSd] };
      if (!S.saldo.set(SALDO)) U.toast("Saldo carregado, mas grande demais para ficar salvo no navegador");
      E.setSaldo(map); U.toast(`Saldo importado: ${n} itens (colunas ${cId} / ${cSd})`); renderAjustes();
    } catch (err) { U.toast("Não consegui importar: " + err.message); }
    e.target.value = "";
  };
  $("#saldo-clear").onclick = () => { SALDO = null; S.saldo.clear(); E.setSaldo(null); renderAjustes(); };
  function openProduct(pid) {
    const p = E.prod(pid); if (!p) return;
    runDoc({ cliente: "", documento: "", data: HOJE, canal: "Verbal", formato: "Consulta de produto", itens: [{ n: "01", codCli: "", texto: p[1], qtd: null, un: "", preco: null, entrega: "", codMelting: pid, fabricante: "" }] }, "Verbal");
    $("#doc-title").textContent = "Ficha do produto " + pid;
    go("analisar"); scrollTo({ top: 0 });
  }

  /* ============ revisão de preços salvos ============ */
  function revisoes() {
    const out = [], mkMin = CFG.markup.minimo;
    for (const c of CLIENTES) for (const [pid, p] of Object.entries(c.precos || {})) {
      const info = E.info(pid); if (!info || !p.preco) continue;
      const cr = E.custoRef(info); const custo = cr ? cr.valor : null;
      const mk = custo ? p.preco / custo : null, dias = p.data ? U.dias(p.data, HOJE) : null;
      const pr = E.preco(info, cfgCli(c));
      const motivo = mk != null && mk < mkMin ? "margem abaixo do mínimo" : dias != null && dias > 180 ? `sem revisão há ${dias} dias` : "";
      out.push({ cli: c, pid, desc: info.desc, preco: p.preco, data: p.data, custo, mk, dias, sugerido: pr ? pr.sugerido : null, motivo, fonte: cr ? cr.fonte : "" });
    }
    return out;
  }

  /* ============ painel ============ */
  function renderPainel() {
    $("#p-data").textContent = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
    const rv = revisoes(), rev = rv.filter((r) => r.motivo).sort((a, b) => (a.mk ?? 9) - (b.mk ?? 9));
    const nPrecos = rv.length, comMk = rv.filter((r) => r.mk), mkMed = comMk.length ? comMk.reduce((s, r) => s + r.mk, 0) / comMk.length : null;
    const giroAt = giroRows().filter((r) => ["atrasado", "ruptura", "repor"].includes(r.st)).length;
    const T = [
      ["clientes", "Clientes cadastrados", CLIENTES.length, "no banco de preços", ""],
      ["clientes", "Preços salvos", nPrecos, "produto × cliente", ""],
      ["painel", "Preços para revisar", rev.length, "margem baixa ou sem revisão", rev.length ? "warn" : "good"],
      ["painel", "Markup médio praticado", mkMed ? U.num(mkMed, 2) + "x" : "—", "preço salvo ÷ custo atual", mkMed && mkMed < CFG.markup.minimo ? "warn" : ""],
      ["painel", SALDO ? "Giro sem saldo ou repor" : "Giro com compra atrasada", giroAt, "itens de giro", giroAt ? "warn" : ""],
      ["painel", "Tabela abaixo do custo", REC.margem.length, "preço do cadastro", REC.margem.length ? "warn" : ""],
    ];
    $("#p-tiles").innerHTML = T.map(([v, t, n, d, c]) => `<button class="tile ${c}" data-go="${v}"><span class="lbl">${t}</span><span class="v">${n}</span><p>${d}</p></button>`).join("");
    $$("#p-tiles [data-go]").forEach((b) => (b.onclick = () => go(b.dataset.go)));
    $("#p-rev").innerHTML = rev.length ? `<table><thead><tr><th>Cliente</th><th>Código</th><th>Produto</th><th class="n">Preço salvo</th><th class="n">Custo atual</th><th class="n">Markup</th><th class="n">Sugerido</th><th>Desde</th><th>Motivo</th></tr></thead><tbody>${rev.slice(0, 40).map((r) => `<tr class="click" data-cli="${esc(r.cli.id)}"><td>${esc(r.cli.nome)}</td><td class="code">${esc(r.pid)}</td><td>${esc(r.desc)}</td><td class="n">${U.brl(r.preco)}</td><td class="n">${U.brl(r.custo)}</td><td class="n ${r.mk != null && r.mk < CFG.markup.minimo ? "warn-t" : ""}">${r.mk ? U.num(r.mk, 2) + "x" : "—"}</td><td class="n">${U.brl(r.sugerido)}</td><td class="code">${U.dt(r.data)}</td><td>${esc(r.motivo)}</td></tr>`).join("")}</tbody></table>`
      : `<div class="empty in">${nPrecos ? "Nenhum preço precisa de revisão agora." : "Ainda não há preços salvos. Analise um pedido e use Salvar preços no cliente, ou cadastre na aba Clientes."}</div>`;
    $$("#p-rev [data-cli]").forEach((tr) => (tr.onclick = () => { CSEL = tr.dataset.cli; go("clientes"); }));
    // próximos pedidos (recorrência dos códigos de cliente nas OCs)
    const lim0 = U.addDias(HOJE, -30), lim1 = U.addDias(HOJE, 45);
    const P = REC.refs.filter((r) => r.prox >= lim0 && r.prox <= lim1).sort((a, b) => ((a.prox < HOJE) - (b.prox < HOJE)) || (a.prox < HOJE ? (a.prox > b.prox ? -1 : 1) : (a.prox < b.prox ? -1 : 1))).slice(0, 10);
    $("#p-prox").innerHTML = P.length ? `<div class="prox">${P.map((r) => { const late = r.prox < HOJE; const p = E.prod(r.pid); const cli = CLIENTES.find((c) => Object.values(c.precos || {}).some((x) => x.codCli && E.key(x.codCli) === E.key(r.ref))); return `<div class="prox-i" data-open="${esc(r.pid)}"><div class="prox-d ${late ? "late" : ""}">${U.dt(r.prox).slice(0, 5)}<small>${late ? "passou " + U.dias(r.prox, HOJE) + " d" : "em " + U.dias(HOJE, r.prox) + " d"}</small></div><div><div>${esc(p ? p[1] : r.pid)}</div><div class="hint">${esc(cli ? cli.nome : "ref. cliente " + r.ref)} · a cada ${r.intervalo} dias · ${r.n} pedidos · última ${U.dt(r.ult)}</div></div><div class="mono">${U.num(r.qtd_media, 1)}</div></div>`; }).join("")}</div>`
      : '<div class="empty in">Nenhum pedido recorrente previsto entre 30 dias atrás e os próximos 45 dias.</div>';
    $$("#p-prox [data-open]").forEach((d) => (d.onclick = () => openProduct(d.dataset.open)));
    // margem por cliente
    const mc = CLIENTES.map((c) => { const xs = rv.filter((r) => r.cli.id === c.id && r.mk); return { rotulo: c.nome, valor: xs.length ? xs.reduce((s, r) => s + r.mk, 0) / xs.length : 0, n: xs.length }; }).filter((x) => x.n).sort((a, b) => b.valor - a.valor).slice(0, 12);
    $("#p-margens").innerHTML = mc.length ? U.barChart(mc.map((x) => ({ ...x, cor: x.valor < CFG.markup.minimo ? "var(--warn)" : "var(--c1)" })), { fmt: (v) => U.num(v, 2) + "x" }) + '<p class="hint">Markup médio dos preços salvos sobre o custo atual de cada produto.</p>'
      : '<div class="empty in">Aparece quando houver preços salvos nos clientes.</div>';
    renderRec();
  }
  $("#p-rev-xlsx").onclick = () => U.exportXLSX(`precos-para-revisar-${HOJE}.xlsx`, { "Para revisar": revisoes().filter((r) => r.motivo).map((r) => ({ Cliente: r.cli.nome, Código: r.pid, Produto: r.desc, "Preço salvo": r.preco, "Data do preço": r.data || "", "Custo atual c/ IPI": r.custo != null ? Math.round(r.custo * 100) / 100 : "", Markup: r.mk ? Math.round(r.mk * 100) / 100 : "", "Preço sugerido": r.sugerido ?? "", Motivo: r.motivo, "Fonte do custo": r.fonte })) });

  /* ============ clientes ============ */
  let CSEL = null, CNOVO = null;
  function renderClientes() {
    const q = E.norm($("#c-q").value.trim());
    const L0 = CLIENTES.filter((c) => !q || E.norm(c.nome + " " + (c.cnpj || "")).includes(q));
    $("#c-list").innerHTML = L0.length ? L0.map((c) => `<button data-c="${esc(c.id)}" aria-pressed="${c.id === CSEL && !CNOVO}">${esc(c.nome)}<span>${Object.keys(c.precos || {}).length}</span></button>`).join("") : '<p class="hint">Nenhum cliente cadastrado ainda.</p>';
    $$("#c-list [data-c]").forEach((b) => (b.onclick = () => { CSEL = b.dataset.c; CNOVO = null; renderClientes(); }));
    const c = CNOVO || CLIENTES.find((x) => x.id === CSEL) || L0[0];
    if (!c) { $("#c-det").innerHTML = '<div class="empty">Cadastre o primeiro cliente em <b>Novo cliente</b>, ou analise um pedido e clique em <b>Salvar preços no cliente</b>.</div>'; return; }
    if (!CNOVO) CSEL = c.id;
    const rows = Object.entries(c.precos || {}).map(([pid, p]) => {
      const info = E.info(pid), cr = info ? E.custoRef(info) : null, custo = cr ? cr.valor : null;
      return { pid, p, info, custo, mk: custo && p.preco ? p.preco / custo : null };
    }).sort((a, b) => (a.info ? a.info.desc : a.pid).localeCompare(b.info ? b.info.desc : b.pid, "pt-BR"));
    const mkMin = CFG.markup.minimo;
    $("#c-det").innerHTML = `<div class="toolbar"><h2>${esc(c.nome || "Novo cliente")}</h2><div class="row">${CNOVO ? "" : `<button class="btn sm" id="cd-xlsx">Exportar Excel</button><button class="btn sm" id="cd-del">Excluir cliente</button>`}</div></div>
      <div class="row" id="cd-confirm" hidden><span class="hint">Excluir ${esc(c.nome)} e todos os preços dele?</span><button class="btn sm pri" id="cd-del-ok">Excluir</button><button class="btn sm" id="cd-del-no">Cancelar</button></div>
      ${(c.notas || []).length ? `<div class="panel"><div class="toolbar"><h3>Regras e casos <span class="muted mono">${c.notas.length}</span></h3><span class="hint">usadas pela IA na análise dos pedidos deste cliente</span></div>
        <div class="notas">${c.notas.map((n, k) => `<div class="nota"><span class="chip ${({ "Regra": "acao", "Caso resolvido": "ok", "A confirmar": "alerta", "A fazer": "alerta" })[n.status] || ""}">${esc(n.status || "Nota")}</span><div><div class="t">${esc(n.assunto || "")}</div><p>${esc(n.texto || "")}</p>${n.codigos || n.valor ? `<div class="hint">${esc([n.codigos, n.valor].filter(Boolean).join(" · "))}</div>` : ""}</div><button class="btn icon" data-nrm="${k}" aria-label="Remover">×</button></div>`).join("")}</div></div>` : ""}
      <div class="panel"><h3>Cadastro</h3>
        <div class="form2">
          <label><span class="lbl">Nome / razão social</span><input type="text" id="cd-nome" value="${esc(c.nome)}"></label>
          <label><span class="lbl">CNPJ</span><input type="text" id="cd-cnpj" value="${esc(c.cnpj || "")}"></label>
          <label><span class="lbl">Contato</span><input type="text" id="cd-contato" value="${esc(c.contato || "")}"></label>
          <label><span class="lbl">E-mails (vírgula)</span><input type="text" id="cd-emails" value="${esc(c.emails || "")}"></label>
          <label><span class="lbl">Telefone</span><input type="text" id="cd-tel" value="${esc(c.telefone || "")}"></label>
          <label><span class="lbl">Markup próprio (opcional)</span><input type="text" id="cd-mk" inputmode="decimal" value="${c.markup ? U.numIn(c.markup) : ""}" placeholder="usa o da categoria"></label>
        </div>
        <label class="stack"><span class="lbl">Observações</span><textarea id="cd-obs" style="min-height:60px">${esc(c.obs || "")}</textarea></label>
        <div class="row"><button class="btn sm pri" id="cd-salvar">${CNOVO ? "Cadastrar cliente" : "Salvar dados"}</button></div>
      </div>
      ${CNOVO ? "" : `<div class="panel"><div class="toolbar"><h3>Tabela de preços <span class="muted mono">${rows.length}</span></h3>
          <div class="row"><label class="btn sm" for="cd-imp">Importar CSV/Excel</label><input type="file" id="cd-imp" accept=".csv,.txt,.xlsx,.xls" hidden></div></div>
        <div class="row"><input type="text" id="cd-add-q" placeholder="Adicionar produto: código, apelido ou medida" style="flex:1;min-width:200px" autocomplete="off"><input type="text" id="cd-add-p" class="num" placeholder="preço" inputmode="decimal"><button class="btn sm" id="cd-add">Adicionar</button></div>
        <div id="cd-add-r" class="search-r"></div>
        ${rows.length ? `<div class="tbl"><table><thead><tr><th>Código</th><th>Produto</th><th>Un</th><th class="n">Preço do cliente</th><th>Atualizado</th><th>Origem</th><th class="n">Custo atual</th><th class="n">Markup</th><th class="n">Lucro un.</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr>
          <td class="code">${esc(r.pid)}</td><td>${esc(r.info ? r.info.desc : r.p.desc || "(fora do cadastro)")}${r.p.codCli ? `<div class="hint">cód. cliente ${esc(r.p.codCli)}</div>` : ""}</td><td>${esc(r.p.un || (r.info ? r.info.un : ""))}</td>
          <td class="n"><input type="text" class="num" data-cp="${esc(r.pid)}" value="${r.p.preco != null ? r.p.preco.toFixed(2).replace(".", ",") : ""}" aria-label="Preço"></td>
          <td class="code">${U.dt(r.p.data)}</td><td class="hint">${esc(r.p.origem || "")}</td>
          <td class="n">${r.custo != null ? U.brl(r.custo) : "—"}</td><td class="n ${r.mk != null && r.mk < mkMin ? "warn-t" : ""}">${r.mk ? U.num(r.mk, 2) + "x" : "—"}</td>
          <td class="n">${r.custo != null && r.p.preco ? U.brl(r.p.preco - r.custo) : "—"}</td>
          <td><button class="btn icon" data-crm="${esc(r.pid)}" aria-label="Remover">×</button></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty in">Sem preços ainda. Adicione acima, importe uma planilha (colunas código e preço) ou salve a partir de um pedido.</div>'}
      </div>`}`;
    const ler = () => ({ ...c, nome: $("#cd-nome").value.trim(), cnpj: $("#cd-cnpj").value.trim(), contato: $("#cd-contato").value.trim(), emails: $("#cd-emails").value.trim(), telefone: $("#cd-tel").value.trim(), markup: U.parseNum($("#cd-mk").value) || null, obs: $("#cd-obs").value.trim() });
    $("#cd-salvar").onclick = async () => {
      const d = ler(); if (!d.nome) { U.toast("Informe o nome do cliente"); return; }
      if (CNOVO) { const ex = clientePorNome(d.nome); if (ex && E.norm(ex.nome).trim() === E.norm(d.nome).trim()) { U.toast("Já existe um cliente com esse nome"); return; } d.id = slug(d.nome); }
      try { await salvarCliente(d); CSEL = d.id; CNOVO = null; U.toast("Cliente salvo"); renderClientes(); if (DOC) vincularCliente(); } catch (e) { U.toast("Não salvou: " + (e.message || e.code)); }
    };
    if (CNOVO) return;
    $("#cd-del").onclick = () => ($("#cd-confirm").hidden = false);
    $("#cd-del-no").onclick = () => ($("#cd-confirm").hidden = true);
    $("#cd-del-ok").onclick = async () => { try { await BACK.db.collection("clientes").doc(c.id).delete(); CLIENTES = CLIENTES.filter((x) => x.id !== c.id); CSEL = null; U.toast("Cliente excluído"); renderClientes(); } catch (e) { U.toast("Não excluiu: " + (e.message || e.code)); } };
    $("#cd-xlsx").onclick = () => U.exportXLSX(`precos-${slug(c.nome)}-${HOJE}.xlsx`, { [c.nome.slice(0, 31)]: linhasCliente(c) });
    const salvaPreco = async (pid, preco, origem) => { const precos = { ...(c.precos || {}) }; const info = E.info(pid); precos[pid] = { ...(precos[pid] || {}), preco, data: HOJE, origem, desc: info ? info.desc : (precos[pid] || {}).desc || "", un: (precos[pid] || {}).un || (info ? info.un : "") }; await salvarCliente({ ...ler(), precos }); };
    $$("[data-cp]").forEach((inp) => (inp.onchange = async () => { const v = U.parseNum(inp.value); if (v == null) return; try { await salvaPreco(inp.dataset.cp, v, "editado na ficha"); U.toast("Preço atualizado"); renderClientes(); } catch (e) { U.toast("Não salvou: " + (e.message || e.code)); } }));
    $$("[data-nrm]").forEach((b) => (b.onclick = async () => { const notas = (c.notas || []).filter((_, k) => k !== +b.dataset.nrm); try { await salvarCliente({ ...ler(), notas }); renderClientes(); } catch (e) { U.toast("Não removeu: " + (e.message || e.code)); } }));
    $$("[data-crm]").forEach((b) => (b.onclick = async () => { const precos = { ...(c.precos || {}) }; delete precos[b.dataset.crm]; try { await salvarCliente({ ...ler(), precos }); renderClientes(); } catch (e) { U.toast("Não removeu: " + (e.message || e.code)); } }));
    let sel = null, t;
    $("#cd-add-q").oninput = () => { clearTimeout(t); t = setTimeout(() => {
      const ids = E.search($("#cd-add-q").value, 6); sel = ids[0] || null;
      $("#cd-add-r").innerHTML = ids.map((pid, k) => { const p = E.prod(pid); return `<button data-cs="${esc(pid)}" class="${k === 0 ? "sel" : ""}"><span class="c">${esc(pid)}</span><span>${esc(p[1])}</span><span class="c">${p[11] != null ? "tabela " + U.brl(p[11]) : ""}</span></button>`; }).join("");
      $$("#cd-add-r [data-cs]").forEach((b) => (b.onclick = () => { sel = b.dataset.cs; $$("#cd-add-r button").forEach((x) => x.classList.toggle("sel", x === b)); const info = E.info(sel); const pr = E.preco(info, cfgCli(c)); if (!$("#cd-add-p").value && pr) $("#cd-add-p").value = U.numIn(pr.sugerido); $("#cd-add-p").focus(); }));
    }, 160); };
    $("#cd-add").onclick = async () => {
      if (!sel) { U.toast("Escolha um produto na lista"); return; }
      let v = U.parseNum($("#cd-add-p").value); if (v == null) { const pr = E.preco(E.info(sel), cfgCli(c)); v = pr ? pr.sugerido : null; }
      if (v == null) { U.toast("Informe o preço"); return; }
      try { await salvaPreco(sel, v, "cadastro manual"); U.toast("Produto adicionado"); renderClientes(); } catch (e) { U.toast("Não salvou: " + (e.message || e.code)); }
    };
    $("#cd-imp").onchange = async (ev) => {
      const f = ev.target.files[0]; if (!f) return;
      try {
        const rows = await U.readTable(f); if (!rows.length) throw new Error("arquivo vazio");
        const cols = Object.keys(rows[0]);
        const cId = cols.find((x) => /produto|c[oó]d|^id$|item/i.test(x)) || cols[0];
        const cPr = cols.find((x) => x !== cId && /pre[cç]o|valor|venda/i.test(x)) || cols[1];
        const precos = { ...(c.precos || {}) }; let n = 0, fora = 0;
        for (const r of rows) { const pid = String(r[cId]).trim().replace(/\.0+$/, ""); const v = U.parseNum(r[cPr]); if (!pid || v == null) continue; const info = E.info(pid); if (!info) fora++; precos[pid] = { preco: v, data: HOJE, origem: "importado de " + f.name, desc: info ? info.desc : "", un: info ? info.un : "" }; n++; }
        if (!n) throw new Error(`não achei códigos e preços (colunas lidas: ${cId} e ${cPr})`);
        await salvarCliente({ ...ler(), precos }); U.toast(`${n} preços importados${fora ? ` (${fora} códigos fora do cadastro)` : ""}`); renderClientes();
      } catch (e) { U.toast("Não importou: " + e.message); }
      ev.target.value = "";
    };
  }
  function linhasCliente(c) {
    return Object.entries(c.precos || {}).map(([pid, p]) => { const info = E.info(pid), cr = info ? E.custoRef(info) : null; return { Cliente: c.nome, Código: pid, Produto: info ? info.desc : p.desc || "", Un: p.un || (info ? info.un : ""), "Preço do cliente": p.preco, "Atualizado em": p.data || "", Origem: p.origem || "", "Cód. cliente": p.codCli || "", "Custo atual c/ IPI": cr ? Math.round(cr.valor * 100) / 100 : "", Markup: cr && p.preco ? Math.round((p.preco / cr.valor) * 100) / 100 : "", "Lucro un.": cr && p.preco ? Math.round((p.preco - cr.valor) * 100) / 100 : "" }; });
  }
  $("#c-q").oninput = () => renderClientes();
  $("#c-novo").onclick = () => { CNOVO = vazioCliente(""); CNOVO.id = ""; renderClientes(); $("#cd-nome").focus(); };
  /* ---------- importar Excel de clientes (cadastro, tabela de preços e regras/casos) ---------- */
  let IMP = null;
  const colDe = (cols, re, nao) => cols.find((c) => re.test(c) && !(nao && nao.test(c)));
  function lerImportacao(abas) {
    const plano = new Map(); // id -> {nome, novo, campos, precos:{}, notas:[]}
    const ignoradas = [];
    const alvo = (nome) => {
      nome = String(nome || "").trim(); if (!nome || /^total/i.test(nome)) return null;
      const ex = clientePorNome(nome); const id = ex ? ex.id : slug(nome);
      if (!plano.has(id)) plano.set(id, { id, nome: ex ? ex.nome : nome, novo: !ex, campos: {}, precos: {}, notas: [] });
      return plano.get(id);
    };
    for (const [aba, rows] of Object.entries(abas)) {
      if (!rows.length || /^(resumo|como preencher|leia-?me|instru)/i.test(aba)) continue;
      const cols = Object.keys(rows[0]);
      const cCli = colDe(cols, /^(cliente|nome|raz[aã]o)/i);
      if (!cCli) { ignoradas.push(`${aba}: sem coluna de cliente`); continue; }
      const cCod = colDe(cols, /^(c[oó]d(igo)?(\s*melting)?|produto_id|id produto)$/i), cPreco = colDe(cols, /pre[cç]o|valor de venda|^venda$/i, /custo|sugerido|tabela do cadastro/i);
      const outras = cols.filter((c) => c !== cCli);
      const cRegra = colDe(outras, /regra ou caso/i) || colDe(outras, /^regras?$|regra/i) || colDe(outras, /^casos?$/i), cTipo = colDe(cols, /^tipo$/i);
      let n = 0;
      for (const r of rows) {
        const nome = r[cCli];
        if (cCod && cPreco) {
          const pid = String(r[cCod]).trim().replace(/\.0+$/, ""), v = U.parseNum(r[cPreco]); if (!pid || v == null) continue;
          const t = alvo(nome); if (!t) continue; const info = E.info(pid);
          t.precos[pid] = { preco: v, data: HOJE, origem: "importado de Excel", desc: info ? info.desc : String(r[colDe(cols, /produto|descri/i)] || ""), un: info ? info.un : String(r[colDe(cols, /^un/i)] || "") };
          n++;
        } else if (cRegra) {
          if (cTipo && r[cTipo] && !/cliente/i.test(String(r[cTipo]))) continue; // fornecedores, mercado e pendências gerais não são cliente
          const tx = String(r[cRegra] ?? "").trim(); if (tx.length < 4 || /^[\d.,\s]+$/.test(tx)) continue; // ex.: aba de resumo com contagens
          const t = alvo(nome); if (!t) continue;
          const g = (re) => { const c = colDe(cols, re); return c ? String(r[c] ?? "").trim() : ""; };
          t.notas.push({ assunto: g(/assunto|tema/i), texto: String(r[cRegra] ?? "").trim(), codigos: g(/c[oó]digos|ids/i), valor: g(/^valor/i), status: g(/^status/i), local: g(/local|identifica/i) });
          const loc = g(/local|identifica/i); if (loc && !t.campos.obs) t.campos.obs = loc;
          n++;
        } else {
          const t = alvo(nome); if (!t) continue;
          const g = (re) => { const c = colDe(cols, re); return c ? String(r[c] ?? "").trim() : ""; };
          const mk = U.parseNum(g(/markup/i));
          Object.assign(t.campos, Object.fromEntries(Object.entries({ cnpj: g(/cnpj/i), contato: g(/contato/i), emails: g(/e-?mail/i), telefone: g(/telefone|fone/i), obs: g(/observa/i) }).filter(([, v]) => v)));
          if (mk) t.campos.markup = mk;
          n++;
        }
      }
      if (!n) ignoradas.push(`${aba}: nenhuma linha aproveitada`);
    }
    return { plano: [...plano.values()], ignoradas };
  }
  function renderImport() {
    const box = $("#c-imp-prev"); if (!IMP) { box.hidden = true; return; }
    const P = IMP.plano, novos = P.filter((p) => p.novo).length, np = P.reduce((s, p) => s + Object.keys(p.precos).length, 0), nn = P.reduce((s, p) => s + p.notas.length, 0);
    box.hidden = false;
    box.innerHTML = `<b>${esc(IMP.arquivo)}</b>
      <div class="hint">${P.length} cliente(s): ${novos} novo(s) e ${P.length - novos} já cadastrado(s) · ${np} preço(s) · ${nn} regra(s)/caso(s)</div>
      ${P.slice(0, 12).map((p) => `<div class="hint">• ${esc(p.nome)}${p.novo ? " (novo)" : ""}${Object.keys(p.precos).length ? ` · ${Object.keys(p.precos).length} preços` : ""}${p.notas.length ? ` · ${p.notas.length} regras` : ""}</div>`).join("")}${P.length > 12 ? `<div class="hint">… e mais ${P.length - 12}</div>` : ""}
      ${IMP.ignoradas.length ? `<div class="hint warn-t">Não aproveitado: ${esc(IMP.ignoradas.join("; "))}</div>` : ""}
      <label class="row hint toggle" for="c-imp-subst"><input type="checkbox" id="c-imp-subst"> Substituir as regras/casos que os clientes já têm (senão, soma)</label>
      <div class="row"><button class="btn sm pri" id="c-imp-ok" ${P.length ? "" : "disabled"}>Importar</button><button class="btn sm" id="c-imp-no">Cancelar</button></div>`;
    $("#c-imp-no").onclick = () => { IMP = null; renderImport(); };
    $("#c-imp-ok").onclick = async () => {
      const b = $("#c-imp-ok"); b.disabled = true; b.textContent = "Importando…"; const subst = $("#c-imp-subst").checked; let ok = 0;
      try {
        for (const p of IMP.plano) {
          const atual = CLIENTES.find((c) => c.id === p.id) || vazioCliente(p.nome);
          const notas = subst ? p.notas : [...(atual.notas || []), ...p.notas.filter((n) => !(atual.notas || []).some((x) => x.texto === n.texto))];
          await salvarCliente({ ...atual, ...p.campos, id: p.id, nome: atual.nome || p.nome, precos: { ...(atual.precos || {}), ...p.precos }, notas });
          ok++;
        }
        U.toast(`${ok} cliente(s) importado(s)`); IMP = null; renderImport(); renderClientes(); if (DOC) vincularCliente();
      } catch (e) { U.toast(`Parou no cliente ${ok + 1}: ${e.message || e.code}`); b.disabled = false; b.textContent = "Importar"; }
    };
  }
  $("#c-imp").onchange = async (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    try { const abas = await U.readWorkbook(f); IMP = { arquivo: f.name, ...lerImportacao(abas) }; renderImport(); }
    catch (e) { U.toast("Não consegui ler o arquivo: " + e.message); }
    ev.target.value = "";
  };
  $("#c-modelo").onclick = () => U.exportXLSX("modelo-importacao-clientes.xlsx", {
    "Clientes": [{ Cliente: "EXEMPLO INDÚSTRIA LTDA", CNPJ: "00.000.000/0001-00", Contato: "Fulano (compras)", "E-mails": "compras@exemplo.com.br", Telefone: "(11) 0000-0000", "Markup próprio": 1.8, Observações: "apague esta linha de exemplo" }],
    "Tabela de preços": [{ Cliente: "EXEMPLO INDÚSTRIA LTDA", Código: "916", Produto: "CORREIA EM V 5V-1500 SUPER HC", "Preço do cliente": 199.9 }],
    "Regras e casos": [{ "Cliente / caso": "EXEMPLO INDÚSTRIA LTDA", Tipo: "Cliente", Assunto: "Marca", "Regra ou caso": "Compra Gates em correia em V.", "Códigos / IDs": "", Valor: "", Status: "Regra" }],
    "Como preencher": [{ Aba: "Clientes", Uso: "Uma linha por cliente. Só a coluna Cliente é obrigatória." }, { Aba: "Tabela de preços", Uso: "Cliente + Código Melting + Preço do cliente. Um produto por linha." }, { Aba: "Regras e casos", Uso: "Cliente + Regra ou caso. Tipo diferente de Cliente (fornecedor, mercado) é ignorado." }, { Aba: "Geral", Uso: "Os nomes das colunas podem variar (ex.: 'Cliente / caso', 'Preço'); o sistema reconhece pelo nome. Também aceita o Excel exportado em Exportar todos." }],
  });

  $("#c-xlsx").onclick = () => {
    if (!CLIENTES.length) { U.toast("Nenhum cliente cadastrado"); return; }
    U.exportXLSX(`clientes-precos-${HOJE}.xlsx`, {
      Clientes: CLIENTES.map((c) => ({ Cliente: c.nome, CNPJ: c.cnpj || "", Contato: c.contato || "", "E-mails": c.emails || "", Telefone: c.telefone || "", "Markup próprio": c.markup || "", "Preços salvos": Object.keys(c.precos || {}).length, Observações: c.obs || "", "Atualizado em": (c.atualizado_em || "").slice(0, 10) })),
      "Tabela de preços": CLIENTES.flatMap(linhasCliente),
      "Regras e casos": CLIENTES.flatMap((c) => (c.notas || []).map((n) => ({ "Cliente / caso": c.nome, Tipo: "Cliente", "Local / identificação": n.local || "", Assunto: n.assunto || "", "Regra ou caso": n.texto, "Códigos / IDs": n.codigos || "", Valor: n.valor || "", Status: n.status || "" }))),
    });
  };

  /* ============ ajustes ============ */
  function renderAjustes() {
    const c = CFG;
    $("#aj-mk").value = U.numIn(c.markup.padrao); $("#aj-mkmin").value = U.numIn(c.markup.minimo);
    $("#aj-val").value = c.proposta.validadeDias; $("#aj-pag").value = c.proposta.pagamento; $("#aj-frete").value = c.proposta.frete;
    $("#aj-pzx").value = c.proposta.prazoExtraDias; $("#aj-pzp").value = c.proposta.prazoPadraoDias; $("#aj-ass").value = c.empresa.assinatura;
    $("#aj-enome").value = c.empresa.nome || ""; $("#aj-ecnpj").value = c.empresa.cnpj || ""; $("#aj-eend").value = c.empresa.endereco || ""; $("#aj-etel").value = c.empresa.telefone || ""; $("#aj-email-c").value = c.empresa.email || ""; $("#aj-esite").value = c.empresa.site || ""; $("#aj-obs").value = c.empresa.observacoes || "";
    $("#aj-surl").value = (c.supabase || {}).url || ""; $("#aj-skey").value = (c.supabase || {}).anonKey || "";
    const cnt = {}; for (const r of DATA.prod) cnt[r[4]] = (cnt[r[4]] || 0) + 1;
    const cats = Object.entries(cnt).map(([i, n]) => [DATA.dicts.ori[i], n]).filter(([o]) => o).sort((a, b) => b[1] - a[1]).slice(0, 30);
    $("#aj-cats").innerHTML = `<table><thead><tr><th>Categoria</th><th class="n">Produtos</th><th class="n">Markup</th></tr></thead><tbody>${cats.map(([o, n]) => `<tr><td>${esc(o)}</td><td class="n">${n.toLocaleString("pt-BR")}</td><td class="n"><input type="text" class="num" data-cat="${esc(o)}" value="${c.markup.porCategoria[o] ? U.numIn(c.markup.porCategoria[o]) : ""}" placeholder="${U.numIn(c.markup.padrao)}" aria-label="Markup ${esc(o)}"></td></tr>`).join("")}</tbody></table>`;
    $("#saldo-info").textContent = SALDO ? `Saldo: ${SALDO.arquivo} · ${SALDO.n.toLocaleString("pt-BR")} itens · importado em ${U.dt(SALDO.importado_em)}` : "Sem saldo importado";
    $("#saldo-clear").hidden = !SALDO;
    L.disponivel().then((d) => ($("#ia-status").textContent = d ? (d.via === "claude" ? "IA disponível pela sua conta do claude.ai." : "IA disponível pela função do Supabase.") : "IA indisponível nesta versão: o botão Analisar lucro com IA faz a análise automática pelas regras do sistema."));
    $("#ap-info").textContent = `${APREND.nao.length} linha(s) marcadas como "não é produto" · ${APREND.sim.length} incluída(s) como produto · ${Object.keys(APREND.mapa).length} escolha(s) de produto lembradas.`;
    renderSupaStatus();
  }
  $("#ap-limpar").onclick = () => ($("#ap-confirm").hidden = false);
  $("#ap-nao").onclick = () => ($("#ap-confirm").hidden = true);
  $("#ap-ok").onclick = () => { aprender((a) => { a.nao = []; a.sim = []; a.mapa = {}; }); $("#ap-confirm").hidden = true; renderAjustes(); U.toast("Aprendizado apagado"); };
  $("#ap-xlsx").onclick = () => U.exportXLSX(`aprendizado-${HOJE}.xlsx`, { "Não é produto": APREND.nao.map((t) => ({ Linha: t })), "É produto": APREND.sim.map((t) => ({ Linha: t })), "Produto escolhido": Object.entries(APREND.mapa).map(([t, pid]) => ({ "Texto do pedido": t, "Código Melting": pid, Produto: (E.prod(pid) || [pid, ""])[1] })) });
  async function renderSupaStatus() {
    const conf = S.supaConfigured();
    let sess = null; if (conf) { try { await S.initSupabase(); sess = await S.supaSession(); } catch (e) { $("#aj-sstatus").textContent = "Não conectou: " + e.message; } }
    $("#aj-login").hidden = !conf || !!sess; $("#aj-entrar").hidden = !conf || !!sess; $("#aj-sair").hidden = !sess;
    $("#aj-sstatus").textContent = !conf ? "Não configurado: o banco de clientes fica " + (BACK ? BACK.label : "neste navegador") + "." : sess ? "Conectado como " + sess.user.email + ": clientes e aprendizado no banco da empresa." : "Configurado para o projeto Melting. Entre com o seu e-mail e senha da equipe.";
    const locais = Object.keys(S.ls.get("melting_precos_clientes", {})).length;
    $("#aj-migrar-box").hidden = !(sess && BACK && BACK.kind === "supabase" && locais);
    $("#aj-migrar-info").textContent = locais ? `${locais} cliente(s) salvos só neste navegador` : "";
  }
  $("#aj-migrar").onclick = async () => {
    const loc = S.ls.get("melting_precos_clientes", {}), ap = S.ls.get("melting_precos_aprendizado", {}).geral;
    const b = $("#aj-migrar"); b.disabled = true; let n = 0;
    try {
      for (const [id, d] of Object.entries(loc)) {
        const atual = CLIENTES.find((c) => c.id === id);
        await salvarCliente(atual ? { ...d, ...atual, id, precos: { ...(d.precos || {}), ...(atual.precos || {}) }, notas: [...(atual.notas || []), ...(d.notas || []).filter((x) => !(atual.notas || []).some((y) => y.texto === x.texto))] } : { ...d, id });
        n++;
      }
      if (ap) aprender((a) => { a.nao.push(...(ap.nao || [])); a.sim.push(...(ap.sim || [])); Object.assign(a.mapa, ap.mapa || {}, { ...a.mapa }); });
      S.ls.set("melting_precos_clientes_backup", loc); S.ls.set("melting_precos_clientes", {});
      U.toast(`${n} cliente(s) enviados para o banco da empresa`); renderSupaStatus();
    } catch (e) { U.toast(`Parou no cliente ${n + 1}: ${e.message || e.code}`); }
    b.disabled = false;
  };
  $("#aj-save").onclick = () => {
    const pc = {}; $$("[data-cat]").forEach((i) => { const v = U.parseNum(i.value); if (v) pc[i.dataset.cat] = v; });
    const cur = S.userSettings();
    const patch = {
      markup: { padrao: U.parseNum($("#aj-mk").value) || 1.8, minimo: U.parseNum($("#aj-mkmin").value) || 1.3, porCategoria: pc },
      proposta: { validadeDias: +$("#aj-val").value || 10, pagamento: $("#aj-pag").value, frete: $("#aj-frete").value, prazoExtraDias: +$("#aj-pzx").value || 0, prazoPadraoDias: +$("#aj-pzp").value || 7 },
      empresa: { ...(cur.empresa || {}), assinatura: $("#aj-ass").value, nome: $("#aj-enome").value.trim(), cnpj: $("#aj-ecnpj").value.trim(), endereco: $("#aj-eend").value.trim(), telefone: $("#aj-etel").value.trim(), email: $("#aj-email-c").value.trim(), site: $("#aj-esite").value.trim(), observacoes: $("#aj-obs").value.trim() },
      supabase: { url: $("#aj-surl").value.trim(), anonKey: $("#aj-skey").value.trim() },
    };
    S.saveSettingsRaw({ ...cur, ...patch });
    CFG = S.settings();
    U.toast("Ajustes salvos"); renderSupaStatus(); initBackend();
  };
  $("#aj-reset").onclick = () => { S.resetSettings(); CFG = S.settings(); renderAjustes(); U.toast("Ajustes voltaram ao padrão"); };
  $("#aj-entrar").onclick = async () => { try { await S.login($("#aj-email").value.trim(), $("#aj-senha").value); $("#aj-senha").value = ""; await initBackend(); renderSupaStatus(); U.toast("Conectado ao histórico compartilhado"); } catch (e) { $("#aj-sstatus").textContent = "Não entrou: " + e.message; } };
  $("#aj-sair").onclick = async () => { await S.logout(); await initBackend(); renderSupaStatus(); };

  /* ============ itens: lista + ficha de preço e prazo ============ */
  let IT_LISTA = [], IT_N = 50, IT_SEL = null, IT_RANK = null, itst;
  function itRank() {
    if (IT_RANK) return IT_RANK;
    const n = new Map();
    for (const b of DATA.buys) if (b[6] !== "Cancelado") n.set(b[0], (n.get(b[0]) || 0) + 1);
    return (IT_RANK = [...n.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p).filter((p) => E.prod(p) && !/^ITEM DE MANUTEN/i.test(E.prod(p)[1])));
  }
  function itFiltro(pid, f) {
    const lt = E.lt(pid), info = () => E.info(pid);
    switch (f) {
      case "giro": return info().giro;
      case "saldo": return (E.saldo(pid) || 0) > 0;
      case "rapidos": return lt && lt.du <= 2;
      case "lentos": return lt && lt.du > 15;
      case "confirmar": return lt && lt.confirmar;
      case "precos": return CLIENTES.some((c) => c.precos && c.precos[pid]);
      default: return true;
    }
  }
  function itCalcula() {
    const q = $("#it-q").value.trim(), f = $("#it-f").value;
    let base;
    if (q) base = E.search(q, 300);
    else if (f === "precos") base = [...new Set(CLIENTES.flatMap((c) => Object.keys(c.precos || {})))].filter((p) => E.prod(p));
    else if (f === "saldo" && SALDO) base = Object.keys(SALDO.map || {}).filter((p) => E.prod(p));
    else base = itRank();
    IT_LISTA = [];
    for (const p of base) { if (itFiltro(p, f)) IT_LISTA.push(p); if (IT_LISTA.length >= 3000) break; }
  }
  function itLinha(pid) {
    const info = E.info(pid); if (!info) return null;
    const pr = E.preco(info, CFG), pz = E.prazo(info, CFG, 1);
    return { pid, info, pr, pz, lt: info.lt, suspeito: E.custoSuspeito(info) };
  }
  function renderItens() {
    if (!IT_LISTA.length && !$("#it-q").value.trim()) itCalcula();
    const rows = IT_LISTA.slice(0, IT_N).map(itLinha).filter(Boolean);
    $("#it-rows").innerHTML = rows.length ? rows.map((r) => `<tr data-ip="${esc(r.pid)}" tabindex="0" class="${r.pid === IT_SEL ? "sel" : ""}">
      <td class="code">${esc(r.pid)}</td><td>${esc(r.info.desc)}${r.info.giro ? ' <span class="chip giro">giro</span>' : ""}</td>
      <td class="n">${r.pr ? U.brl(r.pr.custo) + (r.suspeito ? ' <span class="warn-t" title="Custo do cadastro parece desatualizado">!</span>' : "") : "—"}</td>
      <td class="n">${r.pr ? U.brl(r.pr.sugerido) : "—"}</td><td class="n">${r.pr ? U.num(r.pr.mk, 2) + "x" : "—"}</td>
      <td class="n">${r.lt ? `<span class="${r.lt.confirmar ? "warn-t" : r.lt.du <= 2 ? "ok-t" : ""}">${r.lt.du} d úteis</span>` : "—"}</td>
      <td class="n">${E.saldo(r.pid) != null ? U.num(E.saldo(r.pid)) : "—"}</td></tr>`).join("") : `<tr><td colspan="7" class="hint">${$("#it-f").value === "saldo" && !SALDO ? 'Nenhum saldo importado. Importe a planilha de saldo em <a href="#" data-ir="ajustes">Ajustes</a>.' : $("#it-f").value === "precos" && !$("#it-q").value.trim() ? "Nenhum preço salvo em cliente ainda. Salve pelo Analisar pedido ou importe em Clientes." : "Nenhum item com esse filtro."}</td></tr>`;
    $("#it-cont").textContent = IT_LISTA.length ? `${U.num(Math.min(IT_N, IT_LISTA.length))} de ${U.num(IT_LISTA.length)}${IT_LISTA.length >= 3000 ? "+" : ""} itens` : "";
    $("#it-mais").hidden = IT_LISTA.length <= IT_N;
    $$("#it-rows [data-ip]").forEach((tr) => { tr.onclick = () => itAbrir(tr.dataset.ip); tr.onkeydown = (e) => { if (e.key === "Enter") itAbrir(tr.dataset.ip); }; });
    if (IT_SEL && !$("#it-det").hidden) itFicha(IT_SEL);
  }
  function itAbrir(pid) {
    IT_SEL = pid; $$("#it-rows tr").forEach((tr) => tr.classList.toggle("sel", tr.dataset.ip === pid));
    itFicha(pid);
    const el = $("#it-det"); el.hidden = false;
    el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    el.focus({ preventScroll: true });
    el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  }
  function itFicha(pid) {
    const r = itLinha(pid); if (!r) return;
    const { info, pr, pz, lt } = r, mf = E.melhorFornecedor(info);
    const margem = pr ? 1 - 1 / pr.mk : null;
    const cli = CLIENTES.filter((c) => c.precos && c.precos[pid]).map((c) => ({ nome: c.nome, ...c.precos[pid] }));
    const compras = info.buys.filter((b) => b.sit !== "Cancelado").slice(0, 6);
    const T = (lbl, v, sub, cls) => `<div class="tile ${cls || ""}"><span class="lbl">${lbl}</span><span class="v">${v}</span><p>${sub}</p></div>`;
    $("#it-det").innerHTML = `<div class="toolbar"><div><span class="code">${esc(pid)}</span><h2 style="margin:2px 0 0">${esc(info.desc)}</h2></div>
        <div class="row"><button class="btn sm" id="itd-calc">Cotar na calculadora</button><button class="btn sm pri" id="itd-ped">Abrir ficha completa</button><button class="btn sm" id="itd-topo">Voltar à lista</button></div></div>
      <div class="row">${info.giro ? '<span class="chip giro">Item de giro</span>' : ""}${ltChip(lt)}${info.un ? `<span class="chip">${esc(info.un)}</span>` : ""}${info.inativo ? '<span class="chip alerta">Inativo</span>' : ""}</div>
      <div class="tiles it-tiles">
        ${T("Custo de referência", pr ? U.brl(pr.custo) : "—", pr ? esc(pr.fonte) + (r.suspeito ? ' · <b class="warn-t">custo do cadastro parece desatualizado</b>' : "") : "sem compra nem custo no cadastro", r.suspeito ? "warn" : "")}
        ${T("Preço sugerido", pr ? U.brl(pr.sugerido) : "—", pr ? `mínimo ${U.brl(pr.minimo)} (markup ${U.num(CFG.markup.minimo, 2)}x)${info.pv ? ` · tabela ${U.brl(info.pv)}` : ""}` : "informe o custo na calculadora", "good")}
        ${T("Markup", pr ? U.num(pr.mk, 2) + "x" : "—", pr ? `margem de ${U.num(margem * 100, 1)}% sobre a venda · lucro ${U.brl(pr.sugerido - pr.custo)} por ${esc(info.un || "un")}` : "")}
        ${T("Prazo para o cliente", pz ? esc(pz.txt) : "—", pz ? esc(pz.fonte) + (pz.corridos ? ` · ${pz.corridos} dias corridos` : "") : "", pz && pz.confirmar ? "warn" : "")}
        ${T("Lead time", lt ? lt.du + (lt.du === 1 ? " dia útil" : " dias úteis") : "—", lt ? `${lt.dc} dias corridos · ${esc(lt.baseTxt)}${lt.nv ? ` · ${lt.nv} entrega(s)` : ""}${lt.confirmar ? ' · <b class="warn-t">confirmar com Compras</b>' : ""}` : "sem histórico de entrega", lt && lt.confirmar ? "warn" : "")}
      </div>
      <div class="facts">${[
        ["Saldo em estoque", E.saldo(pid) != null ? U.num(E.saldo(pid)) + " " + (info.un || "") : "sem saldo importado"],
        ["Melhor fornecedor (12 meses)", mf ? `${mf.forn || "cadastro"} · ${U.brl(mf.preco * (1 + (mf.ipi || 0) / 100))}${mf.prazo ? " · " + mf.prazo + " dias" : ""}` : "—"],
        ["Preço de tabela (cadastro)", info.pv != null ? U.brl(info.pv) : "—"],
        ["Compras 2024–26", info.buys.filter((b) => b.sit !== "Cancelado").length + " linhas"],
      ].map(([k, v]) => `<div class="fact"><span class="lbl">${k}</span><span class="v">${esc(v)}</span></div>`).join("")}</div>
      ${cli.length ? `<h3>Preço salvo por cliente</h3><div class="tbl"><table><thead><tr><th>Cliente</th><th class="n">Preço</th><th class="n">Markup sobre custo ref.</th><th>Data</th></tr></thead><tbody>${cli.map((c) => `<tr><td>${esc(c.nome)}</td><td class="n">${U.brl(c.preco)}</td><td class="n">${pr && c.preco ? U.num(c.preco / pr.custo, 2) + "x" : "—"}</td><td>${c.data ? U.dt(c.data) : ""}</td></tr>`).join("")}</tbody></table></div>` : ""}
      ${compras.length ? `<h3>Últimas compras</h3><div class="tbl"><table><thead><tr><th>Data</th><th>Fornecedor</th><th class="n">Qtd</th><th class="n">Preço</th><th class="n">IPI</th><th>Situação</th></tr></thead><tbody>${compras.map((b) => `<tr><td>${U.dt(b.dt)}</td><td>${esc(b.forn || "")}</td><td class="n">${b.qtd != null ? U.num(b.qtd) : ""}</td><td class="n">${b.preco ? U.brl(b.preco) : "—"}</td><td class="n">${b.ipi ? U.num(b.ipi) + "%" : ""}</td><td>${esc(b.sit || "")}</td></tr>`).join("")}</tbody></table></div>` : ""}`;
    $("#itd-topo").onclick = () => { const tr = $(`#it-rows [data-ip="${CSS.escape(pid)}"]`); (tr || $("#it-q")).scrollIntoView({ behavior: "smooth", block: "center" }); if (tr) tr.focus({ preventScroll: true }); };
    $("#itd-ped").onclick = () => openProduct(pid);
    $("#itd-calc").onclick = () => {
      const ult = info.buys.find((x) => x.sit !== "Cancelado" && x.preco && (x.moeda === "Real" || !x.moeda));
      K.custo = ult ? ult.preco : pr ? pr.custo : info.custoAtual; K.ipi = ult ? ult.ipi || 0 : info.ipi || 0; K.pid = pid; K.item = null;
      S.ls.set("melting_calc", K); go("calc");
    };
  }
  $("#it-q").oninput = () => { clearTimeout(itst); itst = setTimeout(() => { IT_N = 50; itCalcula(); renderItens(); }, 200); };
  $("#it-f").onchange = () => { IT_N = 50; itCalcula(); renderItens(); };
  $("#it-mais").onclick = () => { IT_N += 50; renderItens(); };
  $("#it-xlsx").onclick = () => {
    const rows = IT_LISTA.slice(0, 3000).map(itLinha).filter(Boolean).map((r) => ({ Código: r.pid, Descrição: r.info.desc, Un: r.info.un || "", "Custo de referência": r.pr ? r.pr.custo : "", "Origem do custo": r.pr ? r.pr.fonte : "", "Custo a conferir": r.suspeito ? "sim" : "", "Preço sugerido": r.pr ? r.pr.sugerido : "", "Preço mínimo": r.pr ? r.pr.minimo : "", Markup: r.pr ? r.pr.mk : "", "Preço de tabela": r.info.pv ?? "", Prazo: r.pz ? r.pz.txt : "", ...ltXl(r.pid), "Confirmar prazo": r.lt && r.lt.confirmar ? "sim" : "", Saldo: E.saldo(r.pid) ?? "", Giro: r.info.giro ? "sim" : "" }));
    U.exportXLSX(`itens-${HOJE}.xlsx`, { Itens: rows });
  };

  /* ============ busca rápida ============ */
  let SR = [], SI = 0, st;
  function openSearch() { if (!DATA) return; $("#search").hidden = false; $("#search-q").value = ""; $("#search-r").innerHTML = ""; $("#search-q").focus(); }
  function closeSearch() { $("#search").hidden = true; }
  function drawSearch() {
    $("#search-r").innerHTML = SR.length ? SR.map((pid, i) => { const p = E.prod(pid); const sd = E.saldo(pid); return `<button data-sp="${esc(pid)}" class="${i === SI ? "sel" : ""}"><span class="c">${esc(pid)}</span><span>${esc(p[1])}</span><span class="c">${p[11] != null ? U.brl(p[11]) : ""}${sd != null ? " · saldo " + U.num(sd) : ""}${(() => { const lt = E.lt(pid); return lt ? " · " + lt.du + " d úteis" : ""; })()}</span></button>`; }).join("") : ($("#search-q").value.trim() ? '<p class="hint">Nada encontrado.</p>' : "");
    $$("#search-r [data-sp]").forEach((b) => (b.onclick = () => { closeSearch(); openProduct(b.dataset.sp); }));
  }
  $("#search-q").oninput = () => { clearTimeout(st); st = setTimeout(() => { SR = E.search($("#search-q").value, 20); SI = 0; drawSearch(); }, 160); };
  $("#search-q").onkeydown = (e) => {
    if (e.key === "ArrowDown") { SI = Math.min(SI + 1, SR.length - 1); drawSearch(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { SI = Math.max(SI - 1, 0); drawSearch(); e.preventDefault(); }
    else if (e.key === "Enter") { const q = $("#search-q").value; SR = SR.length ? SR : E.search(q, 20); if (SR[SI]) { closeSearch(); openProduct(SR[SI]); } }
  };
  $("#search").onclick = (e) => { if (e.target.id === "search") closeSearch(); };
  $("#open-search").onclick = openSearch;
  addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openSearch(); }
    else if (e.key === "Escape" && !$("#search").hidden) closeSearch();
  });

  /* ============ início ============ */
  (async () => {
    const c = window.claude;
    if (c && c.use) {
      c.use("sample").then((s) => { if (s) { SAMPLER = s; $("#ia").hidden = false; } });
      c.use("user").then((u) => (USER = u));
    }
    await initBackend();
  })();
  startData();
})();

document.addEventListener("click", (e) => { const a = e.target.closest("[data-ir]"); if (!a) return; e.preventDefault(); const t = document.querySelector(`nav.tabs [data-v="${a.dataset.ir}"]`); if (t) t.click(); });
