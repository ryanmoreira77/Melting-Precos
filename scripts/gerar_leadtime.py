"""
Junta o lead time (prazo de entrega) de cada produto na base data/data.js.

Uso:
    python scripts/gerar_leadtime.py CAMINHO/lead_time_produtos.csv [data/data.js]

O CSV vem do kit Melting (scripts/lead_time.py). Colunas usadas:
produto_id, lead_time_dias_uteis, base, n_vendas, n_ocs, confirmar.
Rode de novo sempre que atualizar o lead_time_produtos.csv (ou depois de gerar_base.py).
"""
import csv, gzip, base64, json, sys, os, re
CSV = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "..", "data", "data.js")
txt = open(OUT, encoding="utf-8").read()
b64 = re.search(r'MELT_DATA\s*=\s*"([^"]+)"', txt).group(1)
D = json.loads(gzip.decompress(base64.b64decode(b64)))
bases, lt = [], {}
for r in csv.DictReader(open(CSV, encoding="utf-8", errors="replace")):
    b = r["base"].strip()
    if b not in bases: bases.append(b)
    try: du = max(1, int(float(r["lead_time_dias_uteis"])))
    except ValueError: continue
    lt[r["produto_id"].strip()] = [du, bases.index(b), int(r["n_vendas"] or 0), int(r["n_ocs"] or 0), 1 if r["confirmar"].strip().lower() == "sim" else 0]
D["lt"] = {"bases": bases, "m": lt, "fonte": os.path.basename(CSV)}
novo = base64.b64encode(gzip.compress(json.dumps(D, separators=(",", ":")).encode(), 9)).decode()
open(OUT, "w", encoding="utf-8").write(txt.replace(b64, novo))
print(f"{len(lt)} produtos com lead time -> {OUT}")
