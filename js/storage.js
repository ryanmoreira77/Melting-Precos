/* Melting Preços · armazenamento
   - Ajustes e saldo importado: navegador (localStorage)
   - Banco de clientes e preços: Supabase (se configurado e logado) > banco do claude.ai > navegador
   Todos os bancos expõem a mesma interface: collection(nome).onSnapshot / doc(id).get/set/update/delete */
(function (G) {
  const S = {};
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  };
  S.ls = LS;

  /* ---------- ajustes: config.js + o que o usuário mudou na tela ---------- */
  const merge = (a, b) => { const o = Array.isArray(a) ? [...a] : { ...a }; for (const k in b || {}) o[k] = b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) ? merge(a[k] || {}, b[k]) : b[k]; return o; };
  const KEY_AJ = "melting_precos_ajustes";
  S.settings = () => {
    const user = LS.get(KEY_AJ, {}), out = merge(G.MELT_CONFIG || {}, user);
    if (user.markup && user.markup.porCategoria) out.markup.porCategoria = user.markup.porCategoria;
    return out;
  };
  S.saveSettingsRaw = (obj) => LS.set(KEY_AJ, obj);
  S.userSettings = () => LS.get(KEY_AJ, {});
  S.resetSettings = () => LS.set(KEY_AJ, {});

  /* ---------- banco no navegador ---------- */
  function localDB() {
    const subs = {};
    const key = (c) => "melting_precos_" + c;
    const read = (c) => LS.get(key(c), {});
    const write = (c, m) => { if (!LS.set(key(c), m)) throw { code: "quota", message: "o navegador não deixou salvar (espaço cheio)" }; (subs[c] || []).forEach((f) => f()); };
    return { collection(c) {
      const snap = () => ({ docs: Object.entries(read(c)).map(([id, d]) => ({ id, data: () => d })) });
      const q = { orderBy: () => q, limit: () => q,
        onSnapshot(fn) { const f = () => fn(snap()); (subs[c] = subs[c] || []).push(f); f(); return () => {}; },
        add: async (d) => { const id = "c" + Date.now(); const m = read(c); m[id] = d; write(c, m); return { id }; },
        doc: (id) => ({
          get: async () => { const d = read(c)[id]; return { id, exists: !!d, data: () => d }; },
          set: async (d) => { const m = read(c); m[id] = d; write(c, m); },
          update: async (d) => { const m = read(c); m[id] = { ...(m[id] || {}), ...d }; write(c, m); },
          delete: async () => { const m = read(c); delete m[id]; write(c, m); },
        }) };
      return q; } };
  }

  /* ---------- Supabase ---------- */
  const SUPA_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js";
  S.supa = null;
  S.supaConfigured = () => { const c = S.settings().supabase || {}; return !!(c.url && c.anonKey); };
  S.initSupabase = async () => {
    if (!S.supaConfigured()) return null;
    if (S.supa) return S.supa;
    if (!G.supabase) await G.MeltUtil.loadScript(SUPA_JS);
    const c = S.settings().supabase;
    S.supa = G.supabase.createClient(c.url, c.anonKey, { auth: { persistSession: true } });
    return S.supa;
  };
  S.supaSession = async () => { try { return S.supa ? (await S.supa.auth.getSession()).data.session : null; } catch { return null; } };
  S.login = async (email, senha) => { await S.initSupabase(); const { error } = await S.supa.auth.signInWithPassword({ email, password: senha }); if (error) throw error; };
  S.logout = async () => { if (S.supa) await S.supa.auth.signOut(); };
  const TABELA = { clientes: "mp_clientes", aprendizado: "mp_aprendizado" }; // prefixo mp_ = Melting Preços, para não colidir com outros sistemas no mesmo projeto
  function supaDB(sb) {
    return { collection(nome) {
      const T = TABELA[nome] || "mp_" + nome;
      const q = { orderBy: () => q, limit: () => q,
        onSnapshot(fn, err) {
          const load = async () => {
            const { data, error } = await sb.from(T).select("id,dados").limit(5000);
            if (error) return err && err({ code: "supabase", message: error.message });
            fn({ docs: data.map((r) => ({ id: r.id, data: () => r.dados })) });
          };
          load();
          const ch = sb.channel(T + "-rt").on("postgres_changes", { event: "*", schema: "public", table: T }, load).subscribe();
          const iv = setInterval(load, 60000);
          return () => { sb.removeChannel(ch); clearInterval(iv); };
        },
        add: async (d) => { const { data, error } = await sb.from(T).insert({ dados: d }).select("id").single(); if (error) throw error; return { id: data.id }; },
        doc: (id) => ({
          get: async () => { const { data } = await sb.from(T).select("dados").eq("id", id).maybeSingle(); return { id, exists: !!data, data: () => data && data.dados }; },
          set: async (d) => { const { error } = await sb.from(T).upsert({ id, dados: d, atualizado_em: new Date().toISOString() }); if (error) throw error; },
          update: async (d) => {
            const { data, error } = await sb.from(T).select("dados").eq("id", id).maybeSingle(); if (error) throw error;
            const r = await sb.from(T).upsert({ id, dados: { ...((data && data.dados) || {}), ...d }, atualizado_em: new Date().toISOString() }); if (r.error) throw r.error;
          },
          delete: async () => { const { error } = await sb.from(T).delete().eq("id", id); if (error) throw error; },
        }) };
      return q; } };
  }

  /* escolhe onde guardar; devolve {kind, db, label} */
  S.backend = async () => {
    try {
      if (S.supaConfigured()) { await S.initSupabase(); if (await S.supaSession()) return { kind: "supabase", db: supaDB(S.supa), label: "compartilhado (Supabase)" }; }
    } catch (e) { console.warn("Supabase indisponível", e); }
    const c = G.claude;
    if (c && c.use) { const db = await c.use("db"); if (db) return { kind: "claude", db, label: "salvo no claude.ai" }; }
    return { kind: "local", db: localDB(), label: "salvo neste navegador" };
  };

  /* ---------- saldo de estoque importado ---------- */
  S.saldo = {
    get: () => LS.get("melting_precos_saldo", null),
    set: (v) => LS.set("melting_precos_saldo", v),
    clear: () => { try { localStorage.removeItem("melting_precos_saldo"); } catch {} },
  };
  G.MeltStore = S;
})(window);
