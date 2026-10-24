#!/usr/bin/env python3
"""Radar do Diário Oficial de Minas Gerais (Jornal "Minas Gerais", Diário do Executivo).

Lê as edições publicadas na API pública do portal www.jornalminasgerais.mg.gov.br,
separa só o que é da área ambiental (Semad, Copam, Feam, IEF, Igam, CERH, Arsae e atos
ambientais de outros órgãos) e grava um resumo .md e um .json por edição.

Uso:
    python3 -I diario_mg.py --data AAAA-MM-DD [--ate AAAA-MM-DD] --saida pasta [--cache pasta]

Só biblioteca padrão + o programa pdftotext (poppler-utils).
Regras e palavras-chave: regras.json (mesma pasta). Detalhes: LEIA.md.
"""
import argparse
import base64
import datetime as dt
import json
import os
import re
import ssl
import subprocess
import sys
import tempfile
import time
import unicodedata
import urllib.error
import urllib.request

API = "https://www.jornalminasgerais.mg.gov.br/api/v1/"
PORTAL = "https://www.jornalminasgerais.mg.gov.br/edicao-do-dia"
AUTENTICIDADE = "https://www.jornalminasgerais.mg.gov.br/autenticidade"
UA = "radar-diario-mg/1.0 (leitor de publicacoes ambientais; uso educacional)"
AQUI = os.path.dirname(os.path.abspath(__file__))
FLAGS = re.I | re.S

# ---------------------------------------------------------------- rede


def _ctx():
    caf = os.environ.get("SSL_CERT_FILE") or os.environ.get("REQUESTS_CA_BUNDLE")
    if not caf and os.path.exists("/root/.ccr/ca-bundle.crt"):
        caf = "/root/.ccr/ca-bundle.crt"
    ctx = ssl.create_default_context(cafile=caf) if caf else ssl.create_default_context()
    # Desde 22/10/2026 o portal envia o intermediário errado na cadeia (Valid em vez de Sectigo DV R36).
    # Carregamos o intermediário certo, que é verificado contra a raiz Sectigo R46 do sistema.
    for pem in sorted(os.listdir(os.path.join(AQUI, "certs"))) if os.path.isdir(os.path.join(AQUI, "certs")) else []:
        ctx.load_verify_locations(os.path.join(AQUI, "certs", pem))
    return ctx


def http(url, metodo="GET", corpo=None, token=None, tentativas=3):
    cab = {"User-Agent": UA, "Accept": "application/json"}
    dados = None
    if corpo is not None:
        dados = json.dumps(corpo).encode()
        cab["Content-Type"] = "application/json"
    if token:
        cab["Authorization"] = "Bearer " + token
    for i in range(tentativas):
        try:
            req = urllib.request.Request(url, data=dados, headers=cab, method=metodo)
            with urllib.request.urlopen(req, timeout=90, context=_ctx()) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429 and i + 1 < tentativas:  # muitas requisições: espera e tenta de novo
                time.sleep(10 * (i + 1))
                continue
            raise
        except urllib.error.URLError:
            if i + 1 < tentativas:
                time.sleep(5)
                continue
            raise


def baixar_edicao(data, cache):
    """Devolve (metadados, [(nome_caderno, caminho_pdf)]) ou (None, []) se não houve jornal."""
    arq = os.path.join(cache, f"edicao_{data}.json")
    if os.path.exists(arq):
        with open(arq, encoding="utf-8") as f:
            j = json.load(f)
    else:
        j = http(API + f"Jornal/ObterEdicaoPorDataPublicacao?dataPublicacao={data}")
        with open(arq, "w", encoding="utf-8") as f:
            json.dump(j, f)
        time.sleep(1)  # educação com o servidor
    d = j.get("dados")
    if not d or not d.get("cadernos"):
        return None, []
    pdfs = []
    principal = d.get("arquivoCadernoPrincipal") or {}
    nome_p = principal.get("descricaoCaderno", "Diário do Executivo")
    if principal.get("arquivo"):
        pdfs.append((nome_p, _salvar_pdf(principal["arquivo"], os.path.join(cache, f"{data}_principal.pdf"))))
    # Edição extra do Executivo, se houver (caderno separado; usa o token anônimo do próprio portal).
    token = None
    for c in d["cadernos"]:
        nome = c.get("descricao", "")
        if nome == nome_p or "Executivo" not in nome:
            continue
        destino = os.path.join(cache, f"{data}_caderno_{c['id']}.pdf")
        if not os.path.exists(destino):
            if token is None:
                token = http(API + "Autenticacao/Autenticar", "POST", {}).get("dados")
            jj = http(API + f"Caderno/ObterArquivoCadernoPorId?id={c['id']}", token=token)
            b64 = (jj.get("dados") or {}).get("arquivo")
            if not b64:
                continue
            _salvar_pdf(b64, destino)
            time.sleep(1)
        pdfs.append((nome, destino))
    return d, pdfs


def _salvar_pdf(b64, destino):
    if not os.path.exists(destino):
        bruto = base64.b64decode(b64)  # envelope PKCS#7 (assinatura digital) com o PDF dentro
        i, j = bruto.find(b"%PDF"), bruto.rfind(b"%%EOF")
        if i < 0 or j < 0:
            raise ValueError("arquivo do caderno não contém PDF")
        with open(destino, "wb") as f:
            f.write(bruto[i:j + 5])
    return destino


# ---------------------------------------------------------------- texto

RE_MARCA = re.compile(r"(^|[\s-])\d{1,2} \d{6,8} - \d{1,2}$")  # fim de cada matéria no jornal
RE_AUT = re.compile(r"sob o n[uú]mero (\d{10,})")
RE_LIXO = [
    re.compile(r"^MINAS GERAIS$"),
    re.compile(r"^Di[aá]rio do Executivo$"),
    re.compile(r"^(\d+ – )?(segunda|ter[cç]a|quarta|quinta|sexta)-feira, \d+ DE .+ DE \d{4}( – \d+)?$", re.I),
    re.compile(r"^(\d+ – )?(s[aá]bado|domingo), \d+ DE .+ DE \d{4}( – \d+)?$", re.I),
    re.compile(r"^Documento assinado eletronicamente"),
    re.compile(r"^A autenticidade deste documento"),
    re.compile(r"(\.\s){4,}\.?\s*\d+$"),  # sumário
]
RE_CHEFE = re.compile(r"^(Secret[aá]ri[oa](-Geral| Adjunt[oa])?|Diretora?-Geral|Diretora?-Presidente|Presidente|"
                      r"Comandante-Geral|Chefe da Pol[ií]cia Civil|Controladora?-Geral|Advogad[oa]-Geral|Reitora?|"
                      r"Ouvidora?-Geral|Chefe do Gabinete Militar)\s?:")
RE_ENTIDADE = re.compile(r"^(Secretaria de Estado|Secretaria-Geral|Pol[ií]cia (Militar|Civil)|Corpo de Bombeiros|Instituto |"
                         r"Funda[cç][aã]o |Departamento |Ag[eê]ncia |Companhia |Universidade |Empresa |Hospital |Junta |"
                         r"Controladoria-Geral|Advocacia-Geral|Gabinete Militar|Ouvidoria-Geral|Loteria |Conselho Estadual de |"
                         r"Governo do Estado|Editais e Avisos|Escola de Sa[uú]de|Imprensa Oficial|Rede Minas|Codemig|Cemig|Copasa|Gasmig|Prodemge)")


def pdf_para_linhas(pdf):
    """Lista de (pagina, texto) já sem cabeçalho/rodapé, e {pagina: código de autenticidade}."""
    txt = subprocess.run(["pdftotext", "-enc", "UTF-8", pdf, "-"], capture_output=True, check=True).stdout.decode("utf-8", "replace")
    linhas, aut = [], {}
    for n, pag in enumerate(txt.split("\f"), start=1):
        m = RE_AUT.search(pag.replace("\n", " "))
        if m:
            aut[n] = m.group(1)
        for ln in pag.split("\n"):
            ln = ln.strip()
            if not ln or any(r.search(ln) for r in RE_LIXO) or ln.startswith("http://www.jornalminasgerais") or "sob o número" in ln:
                continue
            linhas.append((n, ln))
    return linhas, aut


def norm(s):
    s = unicodedata.normalize("NFKD", s)
    return re.sub(r"\s+", " ", "".join(c for c in s if not unicodedata.combining(c))).strip().lower()


class Detector:
    def __init__(self, regras, secoes_api):
        self.amb = [(o, re.compile("^" + o["cabecalho"].replace(" ", r"\s+") + r"$", re.I)) for o in regras["orgaos_ambientais"]]
        self.secoes = {norm(s): s for s in secoes_api}

    def orgao(self, texto):
        """Se 'texto' (1 a 3 linhas juntas) é um cabeçalho de órgão, devolve (sigla_ou_None, nome)."""
        t = re.sub(r"\s+", " ", texto).strip()
        if len(t) > 120 or t.endswith((".", ",", ";", ":")):
            return None
        for o, r in self.amb:
            if r.match(t):
                return (o["sigla"], o["nome"])
        if norm(t) in self.secoes:
            return (None, self.secoes[norm(t)])
        return None


def segmentar(linhas, det):
    """Divide o caderno em matérias e marca o órgão de cada uma."""
    materias, atual, org = [], [], (None, "Governo do Estado")
    i = 0
    while i < len(linhas):
        pag, ln = linhas[i]
        if RE_MARCA.search(ln):
            if atual:
                materias.append({"orgao": org, "linhas": atual})
            atual = []
            i += 1
            continue
        achou = None
        # cabeçalho com linha de chefe logo abaixo (Secretário:, Diretor-Geral:, Presidente: ...)
        for k in (5, 4, 3, 2, 1):
            if i + k < len(linhas) and RE_CHEFE.match(linhas[i + k][1]):
                bloco = " ".join(x[1] for x in linhas[i:i + k])
                o = det.orgao(bloco)
                if o is None and RE_ENTIDADE.match(bloco) and len(bloco) < 120:
                    o = (None, bloco)
                if o:
                    achou = (o, k + 1)
                    break
        # cabeçalho sem chefe: só no começo da matéria (ex.: Copam, Editais e Avisos)
        if achou is None and len(atual) < 4:
            for k in (4, 3, 2, 1):
                o = det.orgao(" ".join(x[1] for x in linhas[i:i + k]))
                if o:
                    achou = (o, k)
                    break
        if achou is None and len(atual) == 0:
            l1 = ln
            k = 2 if re.search(r"\b(de|do|da|dos|das|e)$|[,–-]$", l1) and i + 1 < len(linhas) else 1
            bloco = " ".join(x[1] for x in linhas[i:i + k])
            if RE_ENTIDADE.match(bloco) and len(bloco) < 90 and not re.search(r"[.;:]$", bloco) \
                    and (i + k < len(linhas) and not linhas[i + k][1][:1].islower()):
                achou = ((None, bloco), k)
        if achou:
            if atual and len(atual) > 2:  # sobras de tabela da matéria anterior
                materias.append({"orgao": org, "linhas": atual})
            atual = []
            org = achou[0]
            i += achou[1]
            continue
        atual.append((pag, ln))
        i += 1
    if atual:
        materias.append({"orgao": org, "linhas": atual})
    return materias


# ---------------------------------------------------------------- classificação

RE_CPF = re.compile(r"\*{3}\.?\s?\d{3}\.\d{3}-\*{2}|\d{3}\.\d{3}\.\d{3}-\d{2}")
RE_CNPJ = re.compile(r"\d{2}\.?\d{3}\.?\d{3}/\d{4}-?\d{2}")
RE_MASP = re.compile(r"MASP:?\s*[\d.\s]+-\s?\d", re.I)
RE_PROC = re.compile(r"\b\d{4}\.\d{2}\.\d{7}/\d{4}-\d{2}\b|\b(PA|Processo|Proc\.)(\s+(SLA|SEI|n[º°o]\.?|/SLA/N[º°]|/N[º°]))*\s*:?\s*[\d./-]{4,}", re.I)
RE_TITULO = re.compile(r"^(LEI|DECRETO|DELIBERA[CÇ][AÃ]O|RESOLU[CÇ][AÃ]O|PORTARIA|INSTRU[CÇ][AÃ]O|NOTA T[EÉ]CNICA|EDITAL|AVISO|"
                       r"COMUNICADO|CONSULTA|AUDI[EÊ]NCIA|ATO|RETIFICA|INFORMA|EXTRATO|TERMO|NOTIFICA)[^a-z]{3,}$")
RE_EMENTA = re.compile(r"((Disp[õo]e|Estabelece|Altera|Institui|Regulamenta|Aprova|Define|Cria|Revoga|Prorroga|Suspende|Delega|"
                       r"Torna p[úu]blic[oa]|Convoca|Divulga|Homologa|Fixa|Autoriza|Reconhece|Atualiza|Disciplina)\b(?:[^.]|\.(?=\d)|(?<=n[º°o])\.|(?<=\bart)\.){10,500}\.)")
RE_NUM = re.compile(r"N[º°o]\.?\s*[.:]*\s*([\d][\d./-]*\d|\d)", re.I)


def limpar(texto, nomes_chefes=()):
    t = RE_CPF.sub("[CPF omitido]", texto)
    t = RE_CNPJ.sub("[CNPJ omitido]", t)
    t = RE_MASP.sub("[MASP omitido]", t)
    t = RE_PROC.sub("[processo omitido]", t)
    for n in nomes_chefes:
        if n:
            t = t.replace(n, "[nome omitido]")
    return re.sub(r"\s+", " ", t).strip()


def primeiro(regras_lista, chave, texto):
    for r in regras_lista:
        if re.search(r["regex"], texto, FLAGS):
            return r[chave]
    return None


def classificar(m, regras, data, caderno, aut):
    sigla, nome_org = m["orgao"]
    linhas = m["linhas"]
    texto = "\n".join(l for _, l in linhas)
    pags = sorted({p for p, _ in linhas})
    cabeca = texto[:700]
    # título = primeira linha em maiúsculas com cara de ato, nas 6 primeiras linhas
    titulo = ""
    for _, l in linhas[:6]:
        if RE_TITULO.match(l) or (l.isupper() and len(l) > 12):
            titulo = l
            break
    titulo_cmp = titulo
    if titulo and len(titulo) < 40:  # título quebrado em duas linhas
        idx = [l for _, l in linhas[:8]].index(titulo) if titulo in [l for _, l in linhas[:8]] else -1
        if idx >= 0 and idx + 1 < len(linhas) and linhas[idx + 1][1].isupper():
            titulo_cmp = titulo + " " + linhas[idx + 1][1]
    if sigla is not None and not re.search(regras["sinal_ambiental"], texto[:1500], FLAGS):
        return None  # cabeçalho herdado por engano (colunas fora de ordem): o texto não é da área ambiental
    if sigla is not None:
        for oc in regras.get("orgao_pelo_conteudo", []):
            if re.search(oc["regex"], texto[:1500], FLAGS):
                sigla = oc["sigla"]
                break
    base = {"data": data, "caderno": caderno, "orgao": sigla or nome_org, "orgao_nome": nome_org,
            "paginas": pags, "autenticidade": [aut.get(p) for p in pags if aut.get(p)]}

    if sigla is None:
        if nome_org not in regras["secoes_com_busca_por_palavra"]:
            return None
        achadas = {p for p in regras["palavras_ambientais"] if re.search(p, texto[:1500], FLAGS)}
        if len(achadas) < regras["minimo_palavras_ambientais"]:
            return None
        if nome_org != "Editais e Avisos" and not re.match(r"^(LEI|DECRETO N|RESOLU|DELIBERA)", titulo_cmp or "", re.I):
            return None
        base["orgao"] = "Outro órgão (" + nome_org + ")"

    alvo_ign = (titulo_cmp + "\n" + cabeca[:400])
    if any(re.search(p, alvo_ign, FLAGS) for p in regras["ignorar_compras"]):
        return dict(base, categoria="ignorado", motivo="licitação/contrato")
    if any(re.search(p, alvo_ign, FLAGS) for p in regras["ignorar_pessoal"]) or (len(texto) < 3000 and re.search(r"\bMASP\b", texto)):
        return dict(base, categoria="ignorado", motivo="pessoal")

    tipo = primeiro(regras["tipos"], "tipo", titulo_cmp) if titulo_cmp else None
    normativo = tipo in ("Lei", "Decreto", "Deliberação Normativa", "Resolução conjunta", "Resolução",
                         "Instrução de serviço", "Nota técnica", "Portaria", "Consulta pública", "Deliberação")
    grupo = primeiro(regras["grupos_contados"], "grupo", cabeca)
    if grupo and not (normativo and re.search(RE_EMENTA.pattern, texto[:1500], FLAGS) and not re.search(r"torna p[úu]blic", cabeca, re.I)):
        verbos = [k for k, r in regras["verbos_decisao"].items() if re.search(r, texto, FLAGS)]
        mods = [k for k, r in regras["modalidades"].items() if re.search(r, texto, FLAGS)]
        n_proc = len(re.findall(r"\b(PA|Processo|Proc\.)\b[^\n,;]{0,25}?\d{3,}", texto, re.I))
        prazo = None
        mp = re.search(r"prazo de (\d+ \([^)]+\) )?(\d+ )?dias[^.]{0,120}", texto, re.I)
        if mp:
            prazo = limpar(mp.group(0))
        reuniao = None
        mr = re.search(r"(\d+ª Reuni[ãa]o (Ordin[áa]ria|Extraordin[áa]ria)[^,.;]{0,120})", texto)
        if mr:
            reuniao = limpar(mr.group(1))
        return dict(base, categoria="contado", grupo=grupo, verbos=verbos, modalidades=mods,
                    processos_aprox=max(n_proc, 1), prazo=prazo, reuniao=reuniao)

    # item a listar (ato geral, normativo ou de interesse coletivo)
    numero = None
    mn = RE_NUM.search(titulo_cmp or "")
    if mn:
        numero = mn.group(1).rstrip(".,")
    corpo = texto[len(titulo):] if titulo else texto
    me = RE_EMENTA.search(corpo[:2500])
    if not titulo and not me:
        return dict(base, categoria="ignorado", motivo="fragmento sem título (sobra de tabela ou continuação)")
    if me:
        ementa = me.group(1)
    else:
        ementa = re.split(r"(?<=[.;:])\s", re.sub(r"\s+", " ", corpo).strip(), maxsplit=2)
        ementa = " ".join(ementa[:2])[:400]
    ementa = limpar(ementa)
    if len(ementa) > 420:
        ementa = ementa[:417].rsplit(" ", 1)[0] + "..."
    if re.search(regras.get("empresa_citada", "$^"), ementa + " " + texto[:600], FLAGS) and tipo not in ("Lei", "Decreto", "Deliberação Normativa"):
        return dict(base, categoria="contado", grupo="Ato sobre empresa/empreendimento específico", verbos=[], modalidades=[],
                    processos_aprox=1, prazo=None, reuniao=None)
    alvo = (titulo_cmp + " " + ementa)
    relev = primeiro(regras["relevancia"], "classe", alvo) or "notícia"
    if tipo in ("Aviso / comunicado", "Retificação", "Ato", None) and relev == "nova regra":
        relev = "notícia"
    if sigla == "Arsae" and tipo not in ("Resolução", "Deliberação", "Resolução conjunta"):
        relev = "notícia"
    trilha = primeiro(regras["trilhas"], "trilha", alvo + " " + texto[:1500]) or "Trilha 1 · Órgãos e sistemas"
    return dict(base, categoria="listado", tipo=tipo or "Publicação", numero=numero, titulo=limpar(titulo_cmp),
                ementa=ementa, relevancia=relev, trilha=trilha, trechos=trechos_do_texto(corpo), sugestao=sugerir(relev, tipo, numero, sigla or nome_org, trilha, ementa))


RE_VIGOR = re.compile(r"(?:Esta|Este|A presente|O presente)\s+[^.;]{0,60}?\bentra(?:rá)?\s+em\s+vigor\b"
                      r"(?:[^.;]|\.(?=\d)|(?<=n[º°o])\.|(?<=\bart)\.){0,200}", re.I)
RE_REVOGA = re.compile(r"(?:Fica(?:m)?\s+revogad[oa]s?|Revoga(?:m)?-se)\b(?:[^.]|\.(?=\d)|(?<=n[º°o])\.|(?<=\bart)\.){0,400}?(?:\.(?!\d)|$)", re.I)


def _frase(m, limite):
    t = re.sub(r"\s+", " ", m.group(0)).strip().rstrip(".;, ")
    t = re.sub(r",\s*(aplicando|ressalvad|exceto|salvo|observad|produzindo)[^.]*$", "", t)  # só a regra principal
    if len(t.split()) > limite:
        return None  # longo demais para dizer em poucos segundos: o áudio manda conferir o texto
    return t


def trechos_do_texto(texto):
    """Vigência e revogação copiadas do texto publicado (nunca deduzidas). None quando não achou."""
    t = re.sub(r"\s+", " ", texto)
    mv = RE_VIGOR.search(t)
    mr = RE_REVOGA.search(t)
    return {"vigencia": _frase(mv, 30) if mv else None,
            "revoga": limpar(_frase(mr, 28)) if mr and _frase(mr, 28) else None}


def sugerir(relev, tipo, numero, org, trilha, ementa):
    ato = f"{tipo or 'publicação'}{(' nº ' + numero) if numero else ''} ({org})"
    if relev == "nova regra":
        return (f"Post: \"Saiu no Diário: {ato} — o que muda para o consultor\" (ler o texto integral antes). "
                f"Aula: revisar a {trilha} e citar o ato como fonte; se mexe em passo a passo, conferir a tela do sistema.")
    if relev == "mudança de procedimento":
        return (f"Aula: checar se a {trilha} ensina o procedimento antigo; atualizar roteiro/manual conferido. "
                f"Post curto: \"Atenção, mudou: {ato}\".")
    if relev == "prazo":
        return (f"Post de alerta com a data-limite ({ato}); lembrete no tira-dúvidas/live. Aula: só se o tema virar rotina na {trilha}.")
    return f"Nota no resumo semanal/live ({ato}); sem atualização de aula por ora."


# ---------------------------------------------------------------- relatório

ORDEM_REL = ["nova regra", "mudança de procedimento", "prazo", "notícia"]


def processar_dia(data, cache, regras):
    meta, pdfs = baixar_edicao(data, cache)
    if meta is None:
        return None
    secoes_api = []
    for c in meta["cadernos"]:
        secoes_api += [s["descricao"] for s in c.get("secoes", [])]
    det = Detector(regras, secoes_api)
    itens = []
    for nome, pdf in pdfs:
        linhas, aut = pdf_para_linhas(pdf)
        chefes = [re.split(r":\s*", l, maxsplit=1)[1] for _, l in linhas if RE_CHEFE.match(l) and ":" in l]
        for m in segmentar(linhas, det):
            r = classificar(m, regras, data, nome, aut)
            if r:
                if r["categoria"] == "listado":
                    r["ementa"] = limpar(r["ementa"], chefes)
                itens.append(r)
    return {"data": data, "fonte": "Jornal Minas Gerais (Imprensa Oficial de MG) — Diário do Executivo",
            "portal": PORTAL, "autenticidade_url": AUTENTICIDADE,
            "api": API + f"Jornal/ObterEdicaoPorDataPublicacao?dataPublicacao={data}",
            "cadernos_lidos": [n for n, _ in pdfs], "gerado_em": dt.datetime.now().isoformat(timespec="seconds"),
            "itens": itens}


def br(d):
    return dt.date.fromisoformat(d).strftime("%d/%m/%Y")


def ref(it):
    p = ", ".join(str(x) for x in it["paginas"][:3])
    a = it["autenticidade"][0] if it["autenticidade"] else None
    return f"p. {p}" + (f" · autenticidade {a}" if a else "")


def gerar_md(res):
    d = res["data"]
    L = [f"# Radar do Diário Oficial de MG — {br(d)}", "",
         f"Fonte: {res['fonte']} de {br(d)} ({', '.join(res['cadernos_lidos'])}). "
         f"Abrir a edição: {PORTAL} (escolher a data) · conferir página: {AUTENTICIDADE} (código da página).", "",
         "> Gerado automaticamente. **Nada aqui vai ao ar sem leitura humana do texto integral** e sem o \"sim\" do dono. "
         "Atos sobre empreendimentos e pessoas aparecem só como contagem (LGPD).", ""]
    lis = [i for i in res["itens"] if i["categoria"] == "listado"]
    con = [i for i in res["itens"] if i["categoria"] == "contado"]
    ign = [i for i in res["itens"] if i["categoria"] == "ignorado"]
    L.append(f"**Resumo:** {len(lis)} ato(s) para olhar · {len(con)} publicação(ões) de casos contadas · {len(ign)} ignorada(s) (pessoal/compras).")
    L.append("")
    L.append("## Atos para o consultor")
    if not lis:
        L.append("")
        L.append("Nenhum ato geral/normativo ambiental identificado nesta edição.")
    for rel in ORDEM_REL:
        grupo = [i for i in lis if i["relevancia"] == rel]
        if not grupo:
            continue
        L += ["", f"### {rel.capitalize()} ({len(grupo)})", ""]
        for i in grupo:
            num = f" nº {i['numero']}" if i["numero"] else ""
            L.append(f"- **{i['orgao']} · {i['tipo']}{num}** — {i['ementa']}  ")
            L.append(f"  Título no jornal: _{i['titulo'] or '(sem título destacado)'}_ · {ref(i)} · {i['trilha']}  ")
            L.append(f"  Sugestão: {i['sugestao']}")
    L += ["", "## Movimento do dia (contado, sem nomes)", "",
          "| Órgão | Tipo de publicação | Publicações | Processos (aprox.) | Decisões citadas | Modalidades |",
          "|---|---|---:|---:|---|---|"]
    tab = {}
    for i in con:
        k = (i["orgao"], i["grupo"])
        t = tab.setdefault(k, {"n": 0, "p": 0, "v": {}, "m": {}})
        t["n"] += 1
        t["p"] += i["processos_aprox"]
        for v in i["verbos"]:
            t["v"][v] = t["v"].get(v, 0) + 1
        for v in i["modalidades"]:
            t["m"][v] = t["m"].get(v, 0) + 1
    for (o, g), t in sorted(tab.items()):
        vs = ", ".join(f"{k} ({n})" for k, n in sorted(t["v"].items(), key=lambda x: -x[1])) or "—"
        ms = ", ".join(f"{k} ({n})" for k, n in sorted(t["m"].items(), key=lambda x: -x[1])) or "—"
        L.append(f"| {o} | {g} | {t['n']} | {t['p']} | {vs} | {ms} |")
    if not tab:
        L.append("| — | — | 0 | 0 | — | — |")
    extras = [i for i in con if i.get("prazo") or i.get("reuniao")]
    if extras:
        L += ["", "Prazos e reuniões citados nessas publicações (sem nomes):", ""]
        vistos = set()
        for i in extras:
            s = "; ".join(x for x in (i.get("reuniao"), i.get("prazo")) if x)
            if s in vistos:
                continue
            vistos.add(s)
            L.append(f"- {i['orgao']} · {i['grupo']}: {s} ({ref(i)})")
    ig = {}
    for i in ign:
        ig[(i["orgao"], i["motivo"])] = ig.get((i["orgao"], i["motivo"]), 0) + 1
    L += ["", "## Ignorados (só contagem)", ""]
    L += [f"- {o}: {n} ato(s) de {m}" for (o, m), n in sorted(ig.items())] or ["- nenhum"]
    L += ["", "## Olho humano", "",
          "- Ler o texto integral de cada ato listado antes de postar ou mexer em aula (a ementa é recorte automático).",
          "- A classificação de relevância é por palavra-chave: confirme se é mesmo \"nova regra\" ou \"mudança de procedimento\".",
          "- Tabelas e quadros do PDF podem sair embaralhados; contagem de processos é aproximada.", ""]
    return "\n".join(L)


def main():
    ap = argparse.ArgumentParser(description="Radar ambiental do Diário Oficial de MG")
    ap.add_argument("--data", required=True, help="AAAA-MM-DD (ou 'hoje')")
    ap.add_argument("--ate", help="AAAA-MM-DD, último dia do intervalo (opcional)")
    ap.add_argument("--saida", required=True, help="pasta onde gravar AAAA-MM-DD.md e .json")
    ap.add_argument("--cache", help="pasta para os PDFs baixados (padrão: pasta temporária)")
    ap.add_argument("--regras", default=os.path.join(AQUI, "regras.json"))
    a = ap.parse_args()
    ini = dt.date.today() if a.data == "hoje" else dt.date.fromisoformat(a.data)
    fim = dt.date.fromisoformat(a.ate) if a.ate else ini
    with open(a.regras, encoding="utf-8") as f:
        regras = json.load(f)
    cache = a.cache or os.path.join(tempfile.gettempdir(), "diario-mg-cache")
    os.makedirs(cache, exist_ok=True)
    os.makedirs(a.saida, exist_ok=True)
    dia, falhas = ini, 0
    while dia <= fim:
        ds = dia.isoformat()
        try:
            res = processar_dia(ds, cache, regras)
        except Exception as e:  # registra e segue para o próximo dia
            print(f"{ds}: ERRO {type(e).__name__}: {e}", file=sys.stderr)
            falhas += 1
            dia += dt.timedelta(days=1)
            continue
        if res is None:
            print(f"{ds}: sem edição publicada")
        else:
            with open(os.path.join(a.saida, ds + ".json"), "w", encoding="utf-8") as f:
                json.dump(res, f, ensure_ascii=False, indent=1)
            with open(os.path.join(a.saida, ds + ".md"), "w", encoding="utf-8") as f:
                f.write(gerar_md(res))
            n = {c: sum(1 for i in res["itens"] if i["categoria"] == c) for c in ("listado", "contado", "ignorado")}
            print(f"{ds}: {n['listado']} listados, {n['contado']} contados, {n['ignorado']} ignorados")
        dia += dt.timedelta(days=1)
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
