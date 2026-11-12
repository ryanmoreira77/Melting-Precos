"""
Gera data/data.js a partir das planilhas exportadas do sistema.

Uso:
    python scripts/gerar_base.py PASTA_DOS_CSV [data/data.js]

A pasta precisa ter: produtos.csv, dsps114_precos.csv, compras_2024_2025.csv,
compras_2026_ordens.csv, fornecedor_x_produto.csv, cortes_nitta_mectrol.csv,
kits_sgm.csv, ftm_mangueiras_montadas.csv, equivalencias_correias_planas.csv,
fichas_tecnicas.csv, itens_de_giro.csv, indice_precos.csv
Requer: pip install pandas numpy
"""
import pandas as pd, numpy as np, json, re, gzip, base64, sys, glob, os
D = sys.argv[1] if len(sys.argv) > 1 else "planilhas"
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "..", "data", "data.js")
def rd(n, **k):
    nome = n.split("-", 1)[1] if re.match(r"^[0-9a-f]{8}-", n) else n
    achados = glob.glob(os.path.join(D, nome)) or glob.glob(os.path.join(D, "*" + nome))
    if not achados: sys.exit(f"Arquivo não encontrado na pasta {D}: {nome}")
    return pd.read_csv(achados[0], low_memory=False, **k)

def s(x):
    if x is None or (isinstance(x, float) and np.isnan(x)): return ""
    if isinstance(x, float) and x.is_integer(): return str(int(x))
    return str(x).strip()
def n(x, d=2):
    try:
        v = float(x)
        if np.isnan(v): return None
        return round(v, d)
    except: return None

class Dict:
    def __init__(s_): s_.l=[]; s_.m={}
    def __call__(s_, v):
        v = s(v)
        if v not in s_.m: s_.m[v]=len(s_.l); s_.l.append(v)
        return s_.m[v]
FAM, ORI, MAR, FOR, UN = Dict(), Dict(), Dict(), Dict(), Dict()

# ---------- produtos + preços
p = rd("26e28ad9-produtos.csv", dtype=str)
pr = rd("29cf964d-dsps114_precos.csv", dtype={"produto_id": str})
pr = pr.drop_duplicates("produto_id").set_index("produto_id")
prod = []
for r in p.itertuples(index=False):
    pid = s(r.produto_id)
    q = pr.loc[pid] if pid in pr.index else None
    prod.append([pid, s(r.descricao), s(r.apelido), FAM(r.familia), ORI(r.origem), UN(r.unidade),
                 n(r.ipi_pct), 1 if s(r.situacao) == "I" else 0,
                 MAR(q.marca) if q is not None else 0,
                 n(q.ult_custo_entrada, 4) if q is not None else None,
                 s(q.dt_ult_entrada) if q is not None else "",
                 n(q.pr_venda) if q is not None else None,
                 s(q.origem) if q is not None else ""])
known = set(x[0] for x in prod)
# prices for ids missing in produtos
for pid, q in pr.iterrows():
    if pid not in known:
        prod.append([pid, s(q.apelido), s(q.apelido), FAM(""), ORI(""), UN(q.um), n(q.ipi_pct), 0, MAR(q.marca),
                     n(q.ult_custo_entrada, 4), s(q.dt_ult_entrada), n(q.pr_venda), s(q.origem)])

# ---------- compras
c1 = rd("ef6803be-compras_2024_2025.csv")
o = rd("7781173d-compras_2026_ordens.csv")
buys = []  # pid, date, forn, qty, price, src(0 hist / 1 oc), situacao, oc, ipi, moeda, ped, ref, un, qrec
for r in c1.itertuples(index=False):
    buys.append([s(r.produto_id), s(r.data), FOR(r.fornecedor), n(r.qtd, 3), n(r.preco_unit, 4), 0, "", "", None, "", "", "", "", None])
REF = re.compile(r"Ref(?:\.?\s*Cliente)?\.?\s*:\s*([\w\.\-/]+)", re.I)
PED = re.compile(r"Ped(?:\.?\s*Cliente)?\.?\s*:\s*([\w\-/]+)", re.I)
for r in o.itertuples(index=False):
    d = s(r.descricao)
    ref = REF.search(d); ped = PED.search(d)
    buys.append([s(r.produto_id), s(r.emissao), FOR(r.fornecedor), n(r.qtd_pedida, 3), n(r.preco_unit, 4), 1, s(r.situacao),
                 s(r.ordem_compra), n(r.pct_ipi), s(r.moeda), ped.group(1) if ped else "", ref.group(1) if ref else "", s(r.un), n(r.qtd_recebida, 3)])

# ---------- fornecedor x produto
fx = rd("8c122b92-fornecedor_x_produto.csv")
fxp = [[s(r.produto_id), FOR(r.fornecedor), s(r.codigo_no_fornecedor), int(r.prazo_dias or 0), n(r.qtd_multipla), n(r.qtd_minima)] for r in fx.itertuples(index=False)]

# ---------- cortes
k = rd("b887d512-cortes_nitta_mectrol.csv")
cortes = [[s(r.produto_id), 0 if r.tipo == "NITTA" else 1, s(r.materia_prima_id), n(r.largura_mm, 1), n(r.comprimento_mm, 1), s(r.ref_cliente), s(r.revestimento), s(r.corte_id)] for r in k.itertuples(index=False)]

# ---------- kits SGM
g = rd("9428ae03-kits_sgm.csv")
kits = [[s(r.produto_id), s(r.sgm), s(r.peca_principal_id), s(r.peca_principal), n(r.qtd_principal, 3), s(r.componentes)] for r in g.itertuples(index=False)]

# ---------- FTM
t = rd("7c58bfd7-ftm_mangueiras_montadas.csv")
ftm = [[s(r.ftm_id), n(r.metragem_mm, 0), s(r.mangueira_id), s(r.mangueira), s(r.terminal1_id), s(r.terminal1), s(r.terminal2_id), s(r.terminal2), s(r.capa), s(r.ref_cliente)] for r in t.itertuples(index=False)]

# ---------- equivalências, fichas, giro, índice
eq = rd("db3951a5-equivalencias_correias_planas.csv")
equiv = [[s(r.marca), s(r.codigo), s(r.equivalente_nitta), s(r.obs)] for r in eq.itertuples(index=False)]
fi = rd("4235201f-fichas_tecnicas.csv")
fichas = [[s(r.produto_id), s(r.ap), s(r.marca), s(r.material), s(r.espessura), s(r.polia_min), s(r.temp), s(r.tracao), s(r.aplicacoes)[:160], s(r.fonte)] for r in fi.itertuples(index=False)]
giro = [s(x) for x in rd("13ae0059-itens_de_giro.csv").produto_id]
idx = {int(r.ano): float(r.multiplicador_para_2026) for r in rd("c97ba1f4-indice_precos.csv").itertuples(index=False)}

# ================== ANÁLISES GLOBAIS ==================
P = {x[0]: x for x in prod}
B = pd.DataFrame(buys, columns="pid dt forn qty price src sit oc ipi moeda ped ref un qrec".split())
B["dt"] = pd.to_datetime(B.dt, errors="coerce")
B = B[B.sit != "Cancelado"]
TODAY = pd.Timestamp.today().normalize()
FORL = FOR.l

# 1) Comprados sob encomenda (com pedido de cliente) de forma recorrente -> candidatos a estoque
oc = B[B.src == 1]
enc = oc[oc.ped != ""]
g1 = enc.groupby("pid").agg(n_ped=("ped", "nunique"), qtd=("qty", "sum"), ult=("dt", "max"), prim=("dt", "min"),
                            preco=("price", "median"), refs=("ref", lambda x: sorted(set(v for v in x if v))[:4]),
                            forn=("forn", lambda x: sorted(set(FORL[v] for v in x))[:3]))
g1 = g1[g1.n_ped >= 2].sort_values(["n_ped", "qtd"], ascending=False)
rec_enc = []
for pid, r in g1.head(150).iterrows():
    pp = P.get(pid)
    rec_enc.append({"pid": pid, "n": int(r.n_ped), "qtd": n(r.qtd, 1), "ult": r.ult.strftime("%Y-%m-%d"), "prim": r.prim.strftime("%Y-%m-%d"),
                    "preco": n(r.preco), "refs": r.refs, "forn": r.forn, "giro": pid in giro})

# 2) Itens de giro: ciclo de compra e atraso
hist = B[B.pid.isin(set(giro))].copy()
rec_giro = []
for pid, gg in hist.groupby("pid"):
    gg = gg.sort_values("dt")
    datas = gg.dt.dropna().drop_duplicates()
    if len(datas) < 3: continue
    span_m = max((datas.max() - datas.min()).days / 30.4, 1)
    qtot = gg.qty.sum()
    intervalo = (datas.max() - datas.min()).days / (len(datas) - 1)
    dias = (TODAY - datas.max()).days
    aberto = gg[(gg.src == 1) & gg.sit.isin(["Aberto Total", "Aberto Parcial", "Não Fechado"])].qty.sum()
    status = "parado" if dias > 365 else "atrasado" if dias > intervalo * 1.5 and aberto == 0 else ("no_ciclo" if dias > intervalo * 0.8 and aberto == 0 else "ok")
    last = gg.iloc[-1]
    rec_giro.append({"pid": pid, "compras": int(len(datas)), "intervalo": round(intervalo), "dias": int(dias),
                     "qmes": n(qtot / span_m, 1), "lote": n(gg.qty.median(), 1), "aberto": n(aberto, 1),
                     "ult_preco": n(last.price), "ult_forn": FORL[last.forn], "status": status,
                     "valor_mes": n(qtot / span_m * (gg.price.median() or 0), 0)})
rec_giro.sort(key=lambda r: ({"atrasado": 0, "no_ciclo": 1, "parado": 2, "ok": 3}[r["status"]], -(r["valor_mes"] or 0)))

# 3) Mesmo item, preços muito diferentes entre fornecedores (12 meses)
rec = B[(B.dt >= TODAY - pd.Timedelta(days=365)) & (B.moeda.isin(["", "Real"]))]
rec_preco = []
for pid, gg in rec.groupby("pid"):
    pf = gg.groupby("forn").price.median()
    if len(pf) < 2: continue
    lo, hi = pf.min(), pf.max()
    if lo <= 0 or hi / lo < 1.3 or hi / lo > 4: continue
    q12 = gg.qty.sum()
    rec_preco.append({"pid": pid, "barato": FORL[pf.idxmin()], "p_lo": n(lo), "caro": FORL[pf.idxmax()], "p_hi": n(hi),
                      "dif": round((hi / lo - 1) * 100), "qtd12": n(q12, 1), "economia": n((hi - lo) * gg[gg.forn == pf.idxmax()].qty.sum(), 0)})
rec_preco.sort(key=lambda r: -(r["economia"] or 0))

# 4) Preço de venda de cadastro abaixo do último custo de compra
rec_margem = []
lastb = B[B.src == 1].sort_values("dt").groupby("pid").tail(1).set_index("pid")
for pid, r in lastb.iterrows():
    pp = P.get(pid)
    if not pp or not pp[11] or not r.price or r.moeda not in ("", "Real"): continue
    custo = r.price * (1 + (r.ipi or 0) / 100)
    if pp[11] >= 1 and custo * 0.35 < pp[11] < custo * 1.15:
        rec_margem.append({"pid": pid, "pv": pp[11], "custo": n(custo), "forn": FORL[r.forn], "dt": r["dt"].strftime("%Y-%m-%d"),
                           "mk": n(pp[11] / custo, 2)})
rec_margem.sort(key=lambda r: r["mk"])

# 5) Recorrência por código do cliente (Ref.) -> próxima data prevista
rec_ref = []
rr = oc[(oc.ref != "") & (oc.ped != "")]
for (ref, pid), gg in rr.groupby(["ref", "pid"]):
    peds = gg.groupby("ped").agg(dt=("dt", "min"), qtd=("qty", "sum")).sort_values("dt")
    if len(peds) < 2: continue
    datas = peds.dt.tolist()
    interv = (datas[-1] - datas[0]).days / (len(datas) - 1)
    if interv < 3: continue
    prox = datas[-1] + pd.Timedelta(days=round(interv))
    rec_ref.append({"ref": ref, "pid": pid, "n": int(len(peds)), "intervalo": round(interv), "ult": datas[-1].strftime("%Y-%m-%d"),
                    "prox": prox.strftime("%Y-%m-%d"), "qtd_media": n(peds.qtd.mean(), 1),
                    "peds": [[k, v["dt"].strftime("%Y-%m-%d"), n(v["qtd"], 1)] for k, v in peds.iterrows()][-8:]})
rec_ref.sort(key=lambda r: r["prox"])

out = {
    "gerado": TODAY.strftime("%Y-%m-%d"),
    "dicts": {"fam": FAM.l, "ori": ORI.l, "mar": MAR.l, "forn": FOR.l, "un": UN.l},
    "prod": prod, "buys": buys, "fxp": fxp, "cortes": cortes, "kits": kits, "ftm": ftm,
    "equiv": equiv, "fichas": fichas, "giro": giro, "idx": idx,
    "rec": {"enc": rec_enc, "giro": rec_giro, "refs": rec_ref, "preco": rec_preco[:200], "margem": rec_margem[:300]},
}
raw = json.dumps(out, ensure_ascii=False, separators=(",", ":")).encode()
gz = gzip.compress(raw, 9)
print("raw", len(raw) / 1e6, "gz", len(gz) / 1e6, file=sys.stderr)
print("refs recorrentes", len(rec_ref), file=sys.stderr)
print("counts enc", len(rec_enc), "giro", len(rec_giro), sum(r['status']=='atrasado' for r in rec_giro), "preco", len(rec_preco), "margem", len(rec_margem), file=sys.stderr)
with open(OUT, "w") as f:
    f.write("window.MELT_DATA=\"" + base64.b64encode(gz).decode() + "\";")
print("Base gerada em", os.path.abspath(OUT), file=sys.stderr)
