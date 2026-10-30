#!/usr/bin/env python3
"""Radar do Diário Oficial da União (DOU), Seção 1, para a área ambiental.

Lê a "leitura do jornal" pública da Imprensa Nacional (www.in.gov.br/leiturajornal), que traz a lista de
todos os atos da Seção 1 do dia (e das edições extras), separa os atos gerais dos órgãos ambientais
(MMA, Conama, Ibama, ICMBio, SFB, ANA, ANM, MPA e leis/decretos com tema ambiental) e baixa o texto
integral só desses, para copiar a ementa, a vigência e a revogação. Grava um .json por dia.

Uso:
    python3 -I diario_uniao.py --data AAAA-MM-DD [--ate AAAA-MM-DD] --saida pasta

Só biblioteca padrão. Nada de nome, CPF, CNPJ ou número de processo (LGPD): atos de pessoal ou sobre uma
empresa ou pessoa específica ficam de fora.
"""
import argparse
import datetime as dt
import html
import importlib.util
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

LEITURA = "https://www.in.gov.br/leiturajornal?data={data}&secao={secao}"
ATO = "https://www.in.gov.br/web/dou/-/{url}"
SECOES = ("do1", "do1e")  # Seção 1 e Seção 1 extra (as extras A, B, C... vêm juntas em do1e)
UA = "Mozilla/5.0 (radar-diario; leitor de publicacoes ambientais; uso educacional)"
AQUI = os.path.dirname(os.path.abspath(__file__))

# Reaproveita do leitor de MG: limpeza de CPF/CNPJ/processo, contexto TLS e trechos de vigência/revogação.
_spec = importlib.util.spec_from_file_location("diario_mg", os.path.join(AQUI, "diario_mg.py"))
mg = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mg)

# Órgãos ambientais pela hierarquia do DOU (sigla curta para o áudio).
ORGAOS = [
    (r"Conselho Nacional do Meio Ambiente", "Conama"),
    (r"Instituto Brasileiro do Meio Ambiente", "Ibama"),
    (r"Instituto Chico Mendes", "ICMBio"),
    (r"Servi[çc]o Florestal Brasileiro", "Serviço Florestal Brasileiro"),
    (r"Conselho Nacional de Recursos H[íi]dricos", "Conselho Nacional de Recursos Hídricos"),
    (r"Ag[êe]ncia Nacional de [ÁA]guas", "ANA"),
    (r"Ag[êe]ncia Nacional de Minera[çc][ãa]o", "Agência Nacional de Mineração"),
    (r"^Minist[ée]rio do Meio Ambiente", "Ministério do Meio Ambiente"),
    (r"^Minist[ée]rio da Pesca", "Ministério da Pesca e Aquicultura"),
]
TEMA_AMBIENTAL = re.compile(r"meio ambiente|ambienta|licenciamento|recursos h[íi]dricos|outorga|flora|florest|fauna|pesca|"
                            r"aquicultura|barragem|barragens|minera[çc][ãa]o|desmatamento|unidades? de conserva|biodiversidade|"
                            r"Conama|Ibama|ICMBio|clima", re.I)
TIPOS_NORMATIVOS = re.compile(r"^(Lei|Decreto|Medida Provis|Resolu|Instru[çc][ãa]o Normativa|Portaria|Delibera|"
                              r"Aviso|Ato Declarat)", re.I)
EMENTA_VERBO = re.compile(r"^(Disp[õo]e|Estabelece|Altera|Institui|Regulamenta|Aprova|Define|Cria|Revoga|Prorroga|Suspende|"
                          r"Disciplina|Atualiza|Fixa|Torna p[úu]blic|Divulga|Reconhece|Dispensa|Amplia|Acrescenta|Consolida|"
                          r"Publica|Homologa a|Convoca|Abre consulta|Submete)", re.I)
PESSOAL = re.compile(r"nomea|exonera|designa[rç]|dispensa[r ]d|substitut|f[ée]rias|aposenta|cess[ãa]o d[eo] servidor|"
                     r"requisi[çc]|lota[çc][ãa]o|redistribu|progress[ãa]o|pens[ãa]o|servidor|cargo em comiss|fun[çc][ãa]o comissionada|"
                     r"di[áa]rias|afastamento|delega compet|subdelega", re.I)
ESPECIFICO = re.compile(r"\bLtda\b|(?-i:\bS\.?/?A\.(?=[\s,.;]|$)|\bS/A\b)|EIRELI|CNPJ|CPF|\bempresa\b|interessad[oa]|requerente|"
                        r"\bSr\.|\bSra\.|\bautos? de infra[çc][ãa]o n|homologa o resultado|torna sem efeito|"
                        r"\bextrato\b|licita[çc]|preg[ãa]o|resultado de julgamento|ad referendum|retifica|\bda embarca[çc][ãa]o\b|vistoriador|"
                        r"sob o n[º°o]|inscrit[oa] n[oa]|Autoriza[çc][ãa]o de Pesca d", re.I)
TIPO_AVISO_UTIL = re.compile(r"consulta p[úu]blica|audi[êe]ncia p[úu]blica", re.I)
LIMITE_POR_DIA = 80  # textos integrais baixados por dia, no máximo
PROC_UNIAO = re.compile(r"\b\d{5}\.\d{6}/\d{4}-\d{2}\b|\b\d{5}\.\d{3}\.\d{3}/\d{4}-\d{2}\b")


def baixar(url, tentativas=3):
    for i in range(tentativas):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
            with urllib.request.urlopen(req, timeout=90, context=mg._ctx()) as r:
                return r.read().decode("utf-8", "replace")
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if i + 1 < tentativas:
                time.sleep(5 * (i + 1))
                continue
            raise


def lista_do_dia(data, secao):
    """Atos da leitura do jornal (lista com título, órgão e começo do texto)."""
    h = baixar(LEITURA.format(data=data.strftime("%d-%m-%Y"), secao=secao))
    m = re.search(r'<script id="params" type="application/json">(.*?)</script>', h, re.S)
    if not m:
        raise ValueError("leitura do jornal sem a lista de atos (o portal mudou?)")
    return json.loads(m.group(1)).get("jsonArray") or []


def orgao_ambiental(hier):
    for rx, sigla in ORGAOS:
        if re.search(rx, hier, re.I):
            return sigla
    return None


def candidato(a):
    """Filtro pela lista: ato geral de órgão ambiental (ou lei/decreto com tema ambiental)."""
    hier, tipo = a.get("hierarchyStr") or "", a.get("artType") or ""
    titulo = (a.get("title") or "").strip()
    conteudo = re.sub(r"\s+", " ", a.get("content") or "")
    resto = conteudo[len(titulo):].strip() if conteudo.upper().startswith(titulo.upper()) else conteudo
    if not TIPOS_NORMATIVOS.search(tipo) or re.search(r"retifica", tipo + titulo, re.I):
        return None
    sigla = orgao_ambiental(hier)
    if sigla is None:
        geral = re.search(r"Presid[êe]ncia da Rep[úu]blica|Atos do Poder (Executivo|Legislativo)", hier, re.I)
        if not (geral and re.match(r"(Lei|Decreto|Medida)", tipo, re.I) and TEMA_AMBIENTAL.search(resto[:300])):
            return None
        sigla = "Presidência da República"
    if re.match(r"Aviso", tipo, re.I):
        if not TIPO_AVISO_UTIL.search(resto[:400]):
            return None
    elif not EMENTA_VERBO.search(resto):
        return None  # sem ementa normativa logo após o título: ato de pessoal, de caso concreto ou despacho
    return sigla  # pessoal/caso concreto: conferido na ementa do texto integral (o preâmbulo traria falso alarme)


def texto_integral(url_titulo):
    h = baixar(ATO.format(url=url_titulo))
    m = re.search(r'<div class="texto-dou">(.*?)</div>\s*</div>', h, re.S)
    if not m:
        return None
    pars = [html.unescape(re.sub(r"<[^>]+>", " ", p)) for p in re.findall(r"<p[^>]*>(.*?)</p>", m.group(1), re.S)]
    pars = [re.sub(r"\s+", " ", p).strip() for p in pars]
    em = re.search(r'<p class="ementa"[^>]*>(.*?)</p>', h, re.S)
    ementa = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", em.group(1)))).strip() if em else None
    campo = lambda k: (re.search(r'class="' + k + r'"[^>]*>(.*?)<', h, re.S) or [None, None])[1]
    return {"ementa": ementa, "texto": " ".join(p for p in pars if p),
            "edicao": (campo("edicao-dou-data") or "").strip(), "secao": (campo("secao-dou") or "").strip(),
            "pagina": (campo("secao-dou-data") or "").strip()}


def processar_dia(data):
    itens, vistos, total = [], set(), 0
    for secao in SECOES:
        try:
            lista = lista_do_dia(data, secao)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                continue
            raise
        total += len(lista)
        for a in lista:
            if not (a.get("pubName") or "").startswith("DO1") or a.get("urlTitle") in vistos:
                continue
            sigla = candidato(a)
            if not sigla or len(vistos) >= LIMITE_POR_DIA:
                continue
            vistos.add(a["urlTitle"])
            t = texto_integral(a["urlTitle"])
            time.sleep(1)  # educação com o servidor
            if not t or not t["ementa"]:
                continue
            # número de processo citado entre parênteses na ementa sai do texto; o ato continua
            em = re.sub(r"\s*\((?:processo|proc\.)[^)]*\)", "", t["ementa"], flags=re.I)
            ementa = mg.limpar(PROC_UNIAO.sub("[processo omitido]", em))
            if "omitido" in ementa or PESSOAL.search(ementa) or ESPECIFICO.search(ementa):
                continue
            tr = mg.trechos_do_texto(PROC_UNIAO.sub("", t["texto"]))
            itens.append({"orgao": sigla, "hierarquia": a.get("hierarchyStr"), "tipo": a.get("artType"),
                          "titulo": a.get("title", "").strip(), "ementa": ementa, "trechos": tr,
                          "link": ATO.format(url=a["urlTitle"]), "edicao": t["edicao"] or a.get("editionNumber"),
                          "secao": t["secao"] or "Seção 1", "pagina": t["pagina"] or a.get("numberPage"),
                          "publicado": a.get("pubDate")})
    if total == 0:
        return None
    return {"data": data.isoformat(), "fonte": "Diário Oficial da União, Seção 1 (Imprensa Nacional)",
            "lidos": total, "gerado_em": dt.datetime.now().isoformat(timespec="seconds"), "itens": itens}


def main():
    ap = argparse.ArgumentParser(description="Radar ambiental do Diário Oficial da União (Seção 1)")
    ap.add_argument("--data", required=True, help="AAAA-MM-DD")
    ap.add_argument("--ate", help="AAAA-MM-DD, último dia do intervalo (opcional)")
    ap.add_argument("--saida", required=True)
    a = ap.parse_args()
    dia = dt.date.fromisoformat(a.data)
    fim = dt.date.fromisoformat(a.ate) if a.ate else dia
    os.makedirs(a.saida, exist_ok=True)
    falhas = 0
    while dia <= fim:
        try:
            res = processar_dia(dia)
        except Exception as e:  # registra e segue para o próximo dia
            print(f"{dia}: ERRO {type(e).__name__}: {e}", file=sys.stderr)
            falhas += 1
            res = False
        if res is None:
            print(f"{dia}: sem edição publicada")
        elif res:
            with open(os.path.join(a.saida, dia.isoformat() + ".json"), "w", encoding="utf-8") as f:
                json.dump(res, f, ensure_ascii=False, indent=1)
            print(f"{dia}: {res['lidos']} atos lidos, {len(res['itens'])} ambientais gerais")
        dia += dt.timedelta(days=1)
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
