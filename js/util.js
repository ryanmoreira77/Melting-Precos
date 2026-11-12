/* Melting · utilitários: DOM, formatação, cópia, arquivos, planilhas e gráficos em SVG */
(function (G) {
  const U = {};
  U.$ = (s, r = document) => r.querySelector(s);
  U.$$ = (s, r = document) => [...r.querySelectorAll(s)];
  U.esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  U.hoje = () => new Date().toISOString().slice(0, 10);
  U.addDias = (iso, d) => { const x = new Date(iso + "T12:00:00"); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
  U.dias = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 864e5);
  U.brl = (v) => v == null || isNaN(v) ? "—" : (+v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
  U.num = (v, d = 2) => v == null || isNaN(v) ? "—" : (+v).toLocaleString("pt-BR", { maximumFractionDigits: d });
  U.dt = (s) => s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : "—";
  U.mes = (s) => ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][+s.slice(5, 7) - 1] + "/" + s.slice(2, 4);

  /* número digitado em pt-BR ("1.234,56" ou "12,5") */
  U.parseNum = (v) => {
    if (v == null || v === "") return null; if (typeof v === "number") return v;
    let s = String(v).trim().replace(/\s|R\$/g, "");
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(",", ".");
    const n = parseFloat(s); return isNaN(n) ? null : n;
  };
  U.numIn = (v) => (v == null ? "" : String(Math.round(v * 100) / 100).replace(".", ","));
  U.brlK = (v) => (v >= 1000 ? "R$ " + (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil" : U.brl(v).replace(",00", ""));
  let th;
  U.toast = (m) => { const t = U.$("#toast"); if (!t) return; t.textContent = m; t.hidden = false; clearTimeout(th); th = setTimeout(() => (t.hidden = true), 2800); };

  U.loadScript = (src) => new Promise((ok, ko) => {
    if (U.loadScript.done && U.loadScript.done[src]) return ok();
    const s = document.createElement("script"); s.src = src;
    s.onload = () => { (U.loadScript.done = U.loadScript.done || {})[src] = 1; ok(); };
    s.onerror = () => ko(new Error("sem internet para carregar " + src.split("/").slice(-1)[0]));
    document.head.appendChild(s);
  });

  U.copy = async (text, el) => {
    try { await navigator.clipboard.writeText(text); U.toast("Copiado"); }
    catch { if (el) { el.focus(); el.select(); } U.toast("Selecionei o texto: use Ctrl+C"); }
  };

  /* salvar arquivo: no claude.ai usa a capacidade downloads; no arquivo local, link de download */
  U.saveFile = async (filename, blob) => {
    const c = G.claude;
    if (c && c.use) {
      const dl = await c.use("downloads");
      if (dl) { try { await dl.save({ filename, data: blob }); return; } catch (e) { if (e && e.code === "unavailable") {} else return; } }
    }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };

  /* planilhas (SheetJS) */
  const XLSX_JS = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
  U.exportXLSX = async (filename, sheets) => {
    try { await U.loadScript(XLSX_JS); }
    catch { // sem internet: exporta CSV da primeira aba
      const [nome, rows] = Object.entries(sheets)[0];
      return U.saveFile(filename.replace(/\.xlsx$/, ".csv"), new Blob(["﻿" + U.toCSV(rows)], { type: "text/csv" }));
    }
    const wb = G.XLSX.utils.book_new();
    for (const [nome, rows] of Object.entries(sheets)) {
      const ws = G.XLSX.utils.json_to_sheet(rows.length ? rows : [{ "": "sem dados" }]);
      ws["!cols"] = Object.keys(rows[0] || { a: 1 }).map((k) => ({ wch: Math.min(60, Math.max(10, k.length + 2, ...rows.slice(0, 200).map((r) => String(r[k] ?? "").length))) }));
      G.XLSX.utils.book_append_sheet(wb, ws, nome.slice(0, 31));
    }
    const out = G.XLSX.write(wb, { bookType: "xlsx", type: "array" });
    await U.saveFile(filename, new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  };
  U.toCSV = (rows) => {
    if (!rows.length) return "";
    const k = Object.keys(rows[0]); const q = (v) => { v = String(v ?? ""); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return [k.join(";"), ...rows.map((r) => k.map((x) => q(r[x])).join(";"))].join("\n");
  };
  /* lê CSV ou XLSX e devolve linhas como objetos */
  /* lê todas as abas de um Excel (ou um CSV) e devolve {aba: [linhas como objetos]};
     o cabeçalho é a primeira linha (entre as 15 primeiras) que tem pelo menos 2 células de texto e uma com "cliente", "código" ou "produto" */
  U.readWorkbook = async (file) => {
    if (!/\.(xlsx|xls)$/i.test(file.name)) return { [file.name]: await U.readTable(file) };
    await U.loadScript(XLSX_JS);
    const wb = G.XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
    const out = {};
    for (const nome of wb.SheetNames) {
      const m = G.XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, defval: "", raw: true });
      let h = m.slice(0, 15).findIndex((r) => r.filter((c) => typeof c === "string" && c.trim()).length >= 2 && r.some((c) => String(c).length < 30 && /cliente|c[oó]d|produto|nome/i.test(String(c))));
      if (h < 0) h = 0;
      const head = (m[h] || []).map((c) => String(c).trim());
      out[nome] = m.slice(h + 1).filter((r) => r.some((c) => String(c).trim())).map((r) => { const o = {}; head.forEach((k, i) => { if (k) o[k] = r[i] ?? ""; }); return o; });
    }
    return out;
  };
  U.readTable = async (file) => {
    if (/\.(xlsx|xls)$/i.test(file.name)) {
      await U.loadScript(XLSX_JS);
      const wb = G.XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
      return G.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
    }
    const t = (await file.text()).replace(/^﻿/, "");
    const lines = t.split(/\r?\n/).filter((l) => l.trim());
    const sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ";" : ",";
    const split = (l) => { const o = []; let cur = "", inq = false; for (const ch of l) { if (ch === '"') inq = !inq; else if (ch === sep && !inq) { o.push(cur); cur = ""; } else cur += ch; } o.push(cur); return o.map((x) => x.trim()); };
    const head = split(lines[0]);
    return lines.slice(1).map((l) => { const v = split(l); const o = {}; head.forEach((h, i) => (o[h] = v[i] ?? "")); return o; });
  };

  /* ---------- gráficos SVG (cores vêm das variáveis CSS) ---------- */
  const SER = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)"];
  U.serieCor = (i) => SER[i % SER.length];
  // séries: [{nome, pontos:[{x:'AAAA-MM-DD', y:number}]}]
  U.lineChart = (series, { h = 170, fmtY = U.brl } = {}) => {
    const W = 640, H = h, L = 64, R = 12, T = 12, B = 26;
    const pts = series.flatMap((s) => s.pontos);
    if (pts.length < 2) return "";
    const xs = pts.map((p) => +new Date(p.x)), ys = pts.map((p) => p.y);
    let x0 = Math.min(...xs), x1 = Math.max(...xs); if (x0 === x1) { x0 -= 864e5 * 15; x1 += 864e5 * 15; }
    let y1 = Math.max(...ys) * 1.12, y0 = 0;
    const sx = (x) => L + ((x - x0) / (x1 - x0)) * (W - L - R), sy = (y) => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
    const ticks = [0, 0.5, 1].map((f) => y0 + f * (y1 - y0));
    const mx = [x0, (x0 + x1) / 2, x1].map((x) => new Date(x).toISOString().slice(0, 10));
    let g = ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${sy(t)}" y2="${sy(t)}" class="grid"/><text x="${L - 6}" y="${sy(t) + 4}" text-anchor="end" class="ax">${U.esc(fmtY(t))}</text>`).join("");
    g += mx.map((d, i) => `<text x="${sx(+new Date(d))}" y="${H - 6}" text-anchor="${["start", "middle", "end"][i]}" class="ax">${U.mes(d)}</text>`).join("");
    series.forEach((s, i) => {
      const p = s.pontos.slice().sort((a, b) => (a.x < b.x ? -1 : 1));
      if (p.length > 1) g += `<polyline fill="none" stroke="${U.serieCor(i)}" stroke-width="2" points="${p.map((q) => sx(+new Date(q.x)) + "," + sy(q.y)).join(" ")}"/>`;
      g += p.map((q) => `<circle cx="${sx(+new Date(q.x))}" cy="${sy(q.y)}" r="3.5" fill="${U.serieCor(i)}"><title>${U.esc(s.nome)} · ${U.dt(q.x)} · ${U.esc(fmtY(q.y))}</title></circle>`).join("");
    });
    const leg = series.map((s, i) => `<span class="leg"><i style="background:${U.serieCor(i)}"></i>${U.esc(s.nome)}</span>`).join("");
    return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Preço de compra por fornecedor">${g}</svg><div class="legs">${leg}</div></div>`;
  };
  // barras horizontais: [{rotulo, valor, cor?}]
  U.barChart = (itens, { fmt = U.brl } = {}) => {
    if (!itens.length) return "";
    const max = Math.max(...itens.map((i) => i.valor)) || 1;
    return `<div class="bars">${itens.map((i, k) => `<div class="bar-row"><span class="bar-l">${U.esc(i.rotulo)}</span><span class="bar-t"><span class="bar-f" style="width:${Math.max(2, (i.valor / max) * 100)}%;background:${i.cor || U.serieCor(k)}"></span></span><span class="bar-v mono">${U.esc(fmt(i.valor))}</span></div>`).join("")}</div>`;
  };
  // colunas por mês com duas séries (ganho/perdido)
  U.colChart = (meses, series, { h = 160, fmt = U.brl } = {}) => {
    if (!meses.length) return "";
    const W = 640, H = h, L = 64, R = 8, T = 10, B = 24;
    const max = Math.max(1, ...series.flatMap((s) => s.valores));
    const bw = (W - L - R) / meses.length, inner = Math.min(22, (bw - 8) / series.length);
    const sy = (v) => T + (1 - v / max) * (H - T - B);
    let g = [0, 0.5, 1].map((f) => `<line x1="${L}" x2="${W - R}" y1="${sy(f * max)}" y2="${sy(f * max)}" class="grid"/><text x="${L - 6}" y="${sy(f * max) + 4}" text-anchor="end" class="ax">${U.esc(fmt(f * max))}</text>`).join("");
    meses.forEach((m, i) => {
      const cx = L + bw * i + bw / 2;
      series.forEach((s, j) => { const v = s.valores[i]; const x = cx - (inner * series.length) / 2 + j * inner; g += `<rect x="${x}" y="${sy(v)}" width="${inner - 2}" height="${Math.max(0, H - B - sy(v))}" fill="${s.cor}" rx="2"><title>${U.esc(s.nome)} ${U.esc(m)}: ${U.esc(fmt(v))}</title></rect>`; });
      g += `<text x="${cx}" y="${H - 6}" text-anchor="middle" class="ax">${U.esc(m)}</text>`;
    });
    const leg = series.map((s) => `<span class="leg"><i style="background:${s.cor}"></i>${U.esc(s.nome)}</span>`).join("");
    return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img">${g}</svg><div class="legs">${leg}</div></div>`;
  };
  G.MeltUtil = U;
})(window);
