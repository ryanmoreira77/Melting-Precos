/* Melting Preços · sugestões por item
   - faltas:  o que pode substituir se faltar estoque (mesma medida em outra marca/construção, equivalência Nitta)
   - combina: o que costuma ir junto (comprado na mesma OC ou no mesmo pedido de cliente, terminais/capas da FTM, polias do mesmo perfil)
   - melhor:  o que rende mais (correia em V dentada no lugar da lisa, sincronizadora GT no lugar da HTD, marca premium) */
(function (G) {
  const S = {};
  let D = null, E = null, OC = new Map(), PED = new Map(), DO_OC = new Map(), DO_PED = new Map(), VB = new Map(), POLIAS = [], GTI = new Map(), FTM_COMP = new Map();
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  const key = (s) => norm(s).replace(/[^A-Z0-9]/g, "");
  const push = (m, k, v) => { if (!k) return; let a = m.get(k); if (!a) m.set(k, (a = [])); a.push(v); };
  const VREG = /CORREIA EM V\s+(SPZ|SPA|SPB|SPC|XPZ|XPA|XPB|XPC|3VX|5VX|8VX|3V|5V|8V|AX|BX|CX|A|B|C|D|E)\s*-?\s*(\d{2,5})\b/;
  const DENTADA = { A: "AX", B: "BX", C: "CX", "3V": "3VX", "5V": "5VX", "8V": "8VX", SPZ: "XPZ", SPA: "XPA", SPB: "XPB", SPC: "XPC" };
  const LISA = Object.fromEntries(Object.entries(DENTADA).map(([a, b]) => [b, a]));
  const PREMIUM = /GATES|OPTIBELT|CONTITECH|MEGADYNE|BANDO|HI-?POWER|SUPER HC|TEXROPE|VULCOPOWER|POWERGRIP|PREDATOR/;
  const GTRE = /(\d{3,5})\s*-?\s*(\d{1,2})M\s?GT\d?\s*-?\s*(\d{1,3})\b/;

  S.init = function (data, engine) {
    D = data; E = engine;
    // compras juntas: mesma OC e mesmo pedido de cliente
    for (const b of D.buys) {
      if (b[5] !== 1 || b[6] === "Cancelado") continue;
      if (b[7]) { push(OC, b[7], b[0]); push(DO_OC, b[0], b[7]); }
      if (b[10]) { push(PED, b[10], b[0]); push(DO_PED, b[0], b[10]); }
    }
    // correias em V por perfil + comprimento
    for (const r of D.prod) {
      const d = norm(r[1]);
      const m = VREG.exec(d); if (m) push(VB, m[1] + "|" + m[2], r[0]);
      if (/^POLIA/.test(d)) POLIAS.push(r[0]);
      const g = GTRE.exec(d); if (g && /CORREIA/.test(d)) push(GTI, `${g[1]}|${g[2]}|${g[3]}`, r[0]);
    }
    // FTM: mangueira -> terminais e capas mais usados
    for (const t of D.ftm) {
      const k = key(t[3]); if (!k) continue;
      let m = FTM_COMP.get(k); if (!m) FTM_COMP.set(k, (m = new Map()));
      for (const [nome, tipo] of [[t[5], "terminal"], [t[7], "terminal"], [t[8], "capa"]]) if (nome) { const kk = tipo + "|" + nome; m.set(kk, (m.get(kk) || 0) + 1); }
    }
  };

  const compras12 = (info, hoje) => info.buys.filter((b) => b.sit !== "Cancelado" && (new Date(hoje) - new Date(b.dt)) / 864e5 <= 365).length;
  function linha(pid, motivo, tipo, hoje, extra) {
    const info = E.info(pid); if (!info) return null;
    const cr = E.custoRef(info);
    return { pid, desc: info.desc, motivo, tipo, saldo: info.saldo, compras: compras12(info, hoje), giro: info.giro, pv: info.pv, custo: cr ? cr.valor : null, un: info.un, inativo: info.inativo, lt: info.lt || null, ...(extra || {}) };
  }
  const ltd = (x) => (x.lt ? x.lt.du : 99);
  const ordenar = (xs) => xs.filter(Boolean).filter((x) => !x.inativo).sort((a, b) => ((b.saldo > 0) - (a.saldo > 0)) || (b.giro - a.giro) || (ltd(a) - ltd(b)) || (b.compras - a.compras) || ((a.custo ?? 1e9) - (b.custo ?? 1e9)));

  S.para = function (item, cfg, hoje) {
    hoje = hoje || new Date().toISOString().slice(0, 10);
    const out = { faltas: [], combina: [], melhor: [] };
    if (!item.pid || !D) return out;
    const info = E.info(item.pid); if (!info) return out;
    const d = norm(info.desc), pid = item.pid, vistos = new Set([pid]);
    const add = (lista, p, motivo, tipo, extra) => { if (vistos.has(p)) return; const l = linha(p, motivo, tipo, hoje, extra); if (l) { vistos.add(p); out[lista].push(l); } };

    /* ---- correia em V ---- */
    const v = VREG.exec(d);
    if (v) {
      const [_, perfil, comp] = v;
      for (const p of VB.get(perfil + "|" + comp) || []) add("faltas", p, `mesma medida ${perfil}-${comp}, outra marca ou linha`, "substituto");
      const dent = DENTADA[perfil];
      if (dent) for (const p of VB.get(dent + "|" + comp) || []) add("melhor", p, `dentada ${dent}-${comp}: dissipa mais calor, trabalha melhor em polias pequenas e dura mais que a lisa ${perfil}`, "upgrade");
      if (LISA[perfil]) for (const p of VB.get(LISA[perfil] + "|" + comp) || []) add("faltas", p, `versão lisa ${LISA[perfil]}-${comp} (mesma medida; rende menos que a dentada)`, "substituto");
      // polias do mesmo perfil, só as que a Melting já comprou
      const perfisPolia = new Set([perfil, LISA[perfil] || perfil, dent || perfil]);
      for (const p of POLIAS) {
        const pd = norm(E.prod(p)[1]);
        if (![...perfisPolia].some((x) => new RegExp("(^|[^A-Z0-9])\\d?\\s?" + x + "\\s?\\d?($|[^A-Z0-9])").test(pd.replace(/^POLIA/, "")))) continue;
        const pi = E.info(p); if (!pi || !pi.buys.length) continue;
        add("combina", p, `polia para perfil ${perfil}`, "complemento");
        if (out.combina.length > 6) break;
      }
    }

    /* ---- correia sincronizadora ---- */
    if (info.spec && /SINCR|TIMING|CORREIA/.test(d) && !v) {
      for (const x of info.irmaos || []) {
        if (/SLAB/.test(x.desc)) continue;
        if (x.spec.larg === info.spec.larg) add(PREMIUM.test(norm(x.desc)) && !PREMIUM.test(d) ? "melhor" : "faltas", x.pid, PREMIUM.test(norm(x.desc)) && !PREMIUM.test(d) ? "mesma medida em marca premium: mais vida útil e menos parada" : `mesma medida ${info.spec.comp} ${info.spec.perfil} ${info.spec.larg ?? ""}, outra marca`, PREMIUM.test(norm(x.desc)) && !PREMIUM.test(d) ? "upgrade" : "substituto");
        else if (item.qtd && x.spec.larg && info.spec.larg && x.spec.larg > info.spec.larg) add("faltas", x.pid, `mesma medida em largura ${x.spec.larg} mm: dá para cortar na largura ${info.spec.larg}`, "substituto");
      }
      const slab = (info.irmaos || []).find((x) => /SLAB/.test(x.desc));
      if (slab) add("faltas", slab.pid, "slab do mesmo comprimento: corte na largura pedida", "substituto");
      const mm = /^(\d+)M$/.exec(String(info.spec.perfil || ""));
      if (mm && info.spec.larg) for (const p of GTI.get(`${info.spec.comp}|${mm[1]}|${info.spec.larg}`) || []) add("melhor", p, `perfil GT (${mm[1]}MGT) na mesma medida: transmite mais torque que a HTD e com menos ruído. Confira se o cliente aceita a troca`, "upgrade");
      // polias do mesmo perfil e largura compatível
      const perf = String(info.spec.perfil || "").toUpperCase();
      for (const p of POLIAS) {
        const sp = E.spec(E.prod(p)[1]); if (!sp || String(sp.perfil).toUpperCase() !== perf) continue;
        if (info.spec.larg && sp.larg && (sp.larg < info.spec.larg || sp.larg > info.spec.larg * 1.6)) continue;
        const pi = E.info(p); if (!pi) continue;
        add("combina", p, `polia ${perf}${sp.larg ? " para largura " + sp.larg : ""}`, "complemento");
        if (out.combina.length > 5) break;
      }
    }

    /* ---- mangueira: terminais e capas das montagens FTM ---- */
    if (/MANG/.test(d)) {
      const ks = new Set([key(info.apelido), ...norm(info.desc).split(/\s+/).map(key).filter((k) => k.length >= 4)]);
      let m = null; for (const k of ks) if (FTM_COMP.has(k)) { m = FTM_COMP.get(k); break; }
      if (m) for (const [kk, n] of [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
        const [tipo, nome] = kk.split("|"); const p = E.search(nome, 1)[0];
        if (p) add("combina", p, `${tipo} usado com esta mangueira em ${n} montagem(ns) FTM`, "complemento");
      }
    }

    /* ---- equivalência (correias planas Nitta) ---- */
    for (const c of item.cands || []) if (c.why.some((w) => /Equivalente Nitta/.test(w)) && c.pid !== pid) add("faltas", c.pid, c.why.find((w) => /Equivalente/.test(w)), "substituto");

    /* ---- comprados juntos (mesma OC / mesmo pedido de cliente) ---- */
    const junto = new Map();
    const marca = (p, campo) => { const j = junto.get(p) || { oc: 0, ped: 0 }; j[campo]++; junto.set(p, j); };
    for (const oc of new Set(DO_OC.get(pid) || [])) for (const p of new Set(OC.get(oc) || [])) if (p !== pid) marca(p, "oc");
    for (const pd of new Set(DO_PED.get(pid) || [])) for (const p of new Set(PED.get(pd) || [])) if (p !== pid) marca(p, "ped");
    [...junto.entries()].map(([p, j]) => [p, j, j.ped * 3 + j.oc]).filter(([, j]) => j.ped >= 1 || j.oc >= 2).sort((a, b) => b[2] - a[2]).slice(0, 5)
      .forEach(([p, j]) => add("combina", p, j.ped ? `pedido junto pelo cliente em ${j.ped} pedido(s)` : `comprado junto em ${j.oc} ordens de compra`, "complemento"));

    out.faltas = ordenar(out.faltas).slice(0, 5);
    out.melhor = ordenar(out.melhor).slice(0, 3);
    const pol = out.combina.filter((x) => /^POLIA/.test(norm(x.desc))).sort((a, b) => b.compras - a.compras).slice(0, 3);
    out.combina = [...out.combina.filter((x) => !/^POLIA/.test(norm(x.desc))), ...pol].slice(0, 6);
    return out;
  };
  G.MeltSug = S;
})(window);
