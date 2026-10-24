"""Junta as saídas JSON do radar (diario_mg.py) num arquivo leve para a página radar.html.

Uso: python3 -I gerar_site.py PASTA_DOS_JSON ../dados.json [dias]
Só entra o que é público e sem dado pessoal: contagens por órgão e atos gerais (lei, decreto, DN, resolução,
portaria normativa, edital, consulta). Atos de pessoal ou que citam pessoa ficam de fora.
"""
import json, re, sys
from collections import defaultdict
from pathlib import Path

PESSOAL = re.compile(r"\bSr\.|\bSra\.|servidor|Lei 869/1952|MASP|nomea|exonera|f[ée]rias|aposentad", re.I)
TIPOS_GERAIS = re.compile(r"lei|decreto|delibera|resolu|portaria|instru|nota|edital|consulta|audi[eê]ncia|aviso", re.I)


def limpa(txt):
    txt = re.sub(r"\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}", "[omitido]", txt or "")
    return re.sub(r"\s+", " ", txt).strip()


def main(pasta, saida, dias=10):
    arquivos = sorted(Path(pasta).glob("20??-??-??.json"))[-dias:]
    edicoes = []
    for arq in reversed(arquivos):
        d = json.loads(arq.read_text())
        mov = defaultdict(lambda: {"publicacoes": 0, "processos": 0, "decisoes": defaultdict(int)})
        atos = []
        for i in d.get("itens", []):
            if i["categoria"] == "contado":
                m = mov[(i["orgao"], i.get("grupo", ""))]
                m["publicacoes"] += 1
                m["processos"] += i.get("processos_aprox") or 0
                for v in i.get("verbos") or []:
                    m["decisoes"][v] += 1
            elif i["categoria"] == "listado":
                texto = (i.get("titulo") or "") + " " + (i.get("ementa") or "")
                if PESSOAL.search(texto) or not TIPOS_GERAIS.search(i.get("tipo") or ""):
                    continue
                atos.append({"orgao": i["orgao"], "tipo": i.get("tipo"), "numero": i.get("numero"),
                             "titulo": limpa(i.get("titulo")), "ementa": limpa(i.get("ementa"))[:400],
                             "relevancia": i.get("relevancia"), "trilha": i.get("trilha"),
                             "pagina": (i.get("paginas") or [None])[0],
                             "autenticidade": (i.get("autenticidade") or [None])[0]})
        edicoes.append({"data": d["data"], "atos": atos,
                        "movimento": [{"orgao": o, "grupo": g, "publicacoes": m["publicacoes"],
                                       "processos": m["processos"], "decisoes": dict(m["decisoes"])}
                                      for (o, g), m in sorted(mov.items())]})
    if not edicoes and Path(saida).exists():
        # Nenhuma edição lida (portal fora do ar, erro de certificado...): mantém o que já está publicado.
        print(f"{saida}: nenhuma edição lida; arquivo mantido como estava")
        return
    Path(saida).write_text(json.dumps({"atualizado_em": edicoes[0]["data"] if edicoes else None,
                                       "fonte": "Jornal Minas Gerais (Imprensa Oficial de MG), Diário do Executivo",
                                       "edicoes": edicoes}, ensure_ascii=False, indent=1))
    print(f"{saida}: {len(edicoes)} edições")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 10)
