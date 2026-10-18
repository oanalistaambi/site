"""Radar de serviços: conta, por município, o que vence nas camadas públicas da IDE-Sisema e grava radar-servicos/dados.json.

Só números agregados. Não baixa nome, CPF, CNPJ nem número de processo (LGPD).
Uso: python3 -I radar-servicos/gerador/gerar.py radar-servicos/dados.json
"""
import csv, collections, datetime as dt, io, json, re, sys, time, unicodedata, urllib.parse, urllib.request

WFS = "https://geoserver.meioambiente.mg.gov.br/ows"
HOJE = dt.date.today()


def baixar(camada, campos):
    q = {"service": "WFS", "version": "2.0.0", "request": "GetFeature", "typeNames": "IDE:" + camada,
         "outputFormat": "csv", "propertyName": campos}
    for tentativa in range(3):
        try:
            txt = urllib.request.urlopen(WFS + "?" + urllib.parse.urlencode(q), timeout=900).read()
            return list(csv.DictReader(io.StringIO(txt.decode("utf-8", "replace"))))
        except Exception as e:  # o servidor do Estado às vezes cai; tenta de novo
            print("erro", camada, e, file=sys.stderr)
            time.sleep(30)
    raise SystemExit("não consegui baixar " + camada)


def chave(nome):
    """Nome do município sem acento e em minúsculas, porque a camada de Reserva Legal vem sem acento."""
    s = unicodedata.normalize("NFKD", (nome or "").strip()).encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", s)


def data(s):
    s = (s or "").strip()[:10]
    for f in ("%Y-%m-%d", "%d/%m/%Y"):
        try:
            return dt.datetime.strptime(s, f).date()
        except ValueError:
            pass


def soma_anos(d, n):
    try:
        return d.replace(year=d.year + n)
    except ValueError:
        return d.replace(year=d.year + n, day=28)


mun = collections.defaultdict(lambda: collections.Counter())
nomes = {}


def conta(nome, campo, n=1):
    k = chave(nome)
    if not k or "/" in k or " e outros" in k:  # pontos que atendem vários municípios ficam de fora da lista por cidade
        return
    nomes.setdefault(k, nome.strip())
    mun[k][campo] += n


em6, em12, em24 = (HOJE + dt.timedelta(days=d) for d in (183, 365, 730))

for r in baixar("ide_2103_mg_uso_insignificante_recursos_hidricos_pto", "dtvenc_4,mun_interv"):
    d = data(r["dtvenc_4"])
    if d and HOJE <= d <= em6:
        conta(r["mun_interv"], "insig_6m")
    elif d and d < HOJE:
        conta(r["mun_interv"], "insig_vencidas")
    conta(r["mun_interv"], "insig_total")

for r in baixar("ide_2103_mg_outorgas_uso_recursos_hidricos_pto", "diavenc_4,mesvenc_4,anovenc_4,muncap_4"):
    try:
        d = dt.date(int(float(r["anovenc_4"])), int(float(r["mesvenc_4"])), int(float(r["diavenc_4"])))
    except (ValueError, TypeError):
        continue
    if HOJE <= d <= em12:
        conta(r["muncap_4"], "outorga_12m")
    conta(r["muncap_4"], "outorga_total")

for r in baixar("ide_2101_mg_empreendimentos_licenciados_pto", "mun_solic,data_val"):
    d = data(r["data_val"])
    if d and HOJE <= d <= em24:
        conta(r["mun_solic"], "licenca_24m")
    conta(r["mun_solic"], "licenca_total")

for r in baixar("ide_2101_mg_historico_empreendi_lic_2013_2019_pto", "municipio,validade,publicacao"):
    m, p = re.match(r"(\d+)", r["validade"] or ""), data(r["publicacao"])
    if m and p and HOJE <= soma_anos(p, int(m.group(1))) <= em24:
        conta(r["municipio"], "licenca_24m")

for r in baixar("ide_2105_mg_area_autorizada_intervencao_ambiental_ief_pol", "municipio,ano"):
    try:
        if int(r["ano"]) >= HOJE.year - 2:
            conta(r["municipio"], "supressao_3anos")
    except ValueError:
        pass

for r in baixar("ide_210602_mg_imoveis_recomp_res_legal_declarado_car_pol", "municipio,rec_rl_ha"):
    try:
        ha = float(r["rec_rl_ha"] or 0)
    except ValueError:
        continue
    conta(r["municipio"], "rl_imoveis")
    mun[chave(r["municipio"])]["rl_ha"] += ha

campos = ["insig_6m", "insig_vencidas", "insig_total", "outorga_12m", "outorga_total", "licenca_24m", "licenca_total",
          "supressao_3anos", "rl_imoveis", "rl_ha"]
saida = {
    "atualizado_em": HOJE.isoformat(),
    "fonte": "IDE-Sisema (Semad/Igam/IEF/Feam), serviço WFS público; contagem automática, só números",
    "total": {c: round(sum(m[c] for m in mun.values())) for c in campos},
    "municipios": {nomes[k]: {c: round(v[c]) for c in campos if v[c]} for k, v in sorted(mun.items())},
}
open(sys.argv[1], "w", encoding="utf-8").write(json.dumps(saida, ensure_ascii=False, separators=(",", ":")))
print(json.dumps(saida["total"], ensure_ascii=False), len(saida["municipios"]), "municípios")
