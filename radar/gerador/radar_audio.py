#!/usr/bin/env python3
"""Radar em áudio: junta os atos ambientais dos 2 últimos dias com jornal (MG e DOU), separa por tema,
monta um roteiro curto por tema (cerca de 30 segundos) e, se houver chave do ElevenLabs, gera o MP3.

Uso:
    python3 -I radar_audio.py --mg PASTA_JSON_MG --dou PASTA_JSON_DOU --saida ../audio.json \
        --audios PASTA_MP3 [--existentes lista.txt] [--base-url URL] [--hoje AAAA-MM-DD]

Regras (não mudam):
- O roteiro só usa o que está publicado: título, ementa, frase de vigência e de revogação copiadas do texto.
  Quando falta algo, o áudio diz "confira o texto oficial". Nada é deduzido.
- LGPD: nada de nome de pessoa, CPF, CNPJ ou número de processo. Um ato que ainda tenha algo assim é descartado.
- A chave fica só na variável de ambiente ELEVENLABS_API_KEY (segredo do repositório). Sem ela, a página lê o
  roteiro com a voz do navegador.
- Áudio que já existe (mesmo roteiro, mesma voz) não é gerado de novo: o nome do arquivo leva o hash do roteiro.
"""
import argparse
import datetime as dt
import hashlib
import importlib.util
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

AQUI = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("diario_mg", os.path.join(AQUI, "diario_mg.py"))
mg = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mg)

VOZ = {"id": os.environ.get("RADAR_VOZ_ID", "XMies1moPVDGdidVT4IX"), "nome": "Jerri",
       "modelo": os.environ.get("RADAR_VOZ_MODELO", "eleven_multilingual_v2")}
DIAS = 2
PALAVRAS_MAX = 72  # ~31 s na voz Jerri (medido: 67 palavras = 28,7 s)
MAX_CARACTERES = int(os.environ.get("RADAR_MAX_CARACTERES", "8000"))  # teto de envio ao ElevenLabs por execução
F = re.I

TEMAS = [
    ("mineracao", "Mineração e barragens", r"minera|barrage|rejeito|\blavra\b|Ag[êe]ncia Nacional de Minera"),
    ("fiscalizacao", "Fiscalização, autos e sanções", r"auto[s]? de infra|infra[çc][õo]es|san[çc][õo]es|penalidade|multa|"
                                                       r"fiscaliza|embargo|apreens"),
    ("licenciamento", "Licenciamento ambiental", r"licenciamento|licen[çc]a[s]? ambienta|avalia[çc][ãa]o de impacto|"
                                                 r"\bEIA\b|DN COPAM 217|regulariza[çc][ãa]o ambiental"),
    ("agua", "Água, outorga e saneamento", r"outorga|recursos h[íi]dricos|bacia hidrogr|[áa]guas? (subterr|superf)|"
                                           r"\bANA\b|Ag[êe]ncia Nacional de [ÁA]guas|saneamento|abastecimento de [áa]gua|"
                                           r"esgot|Igam|CERH|Arsae|enquadramento dos corpos"),
    ("flora", "Flora, florestas e unidades de conservação", r"flor|vegeta|desmat|supress[ãa]o|madeira|carv[ãa]o|"
                                                            r"Mata Atl[âa]ntica|Cerrado|unidades? de conserva|parque|"
                                                            r"reserva legal|\bAPP\b|\bCAR\b|\bIEF\b|reflorest|"
                                                            r"Servi[çc]o Florestal"),
    ("fauna", "Fauna, pesca e aquicultura", r"fauna|pesca|pesqueir|aquicultura|defeso|esp[ée]cie|animais|silvestre|"
                                            r"ictio|piracema|estoque"),
    ("geral", "Outras normas ambientais", r"."),
]
INTERNO = re.compile(r"Regimento Interno|estrutura regimental|Comit[êe] de Governan|Pol[íi]tica de (Gest[ãa]o da )?Integridade|"
                     r"Avalia[çc][ãa]o de Desempenho|Grupo de Trabalho|Comiss[ãa]o de Acompanhamento|gest[ãa]o de riscos|"
                     r"planejamento estrat[ée]gico|Programa de Gest[ãa]o e Desempenho|teletrabalho|delega[çc][ãa]o de compet", F)
EMENTA_VERBO = re.compile(r"^(Disp[õo]e|Estabelece|Altera|Institui|Regulamenta|Aprova|Define|Cria|Revoga|Prorroga|Suspende|"
                          r"Disciplina|Atualiza|Fixa|Torna p[úu]blic|Divulga|Reconhece|Amplia|Acrescenta|Consolida|Convoca)", F)
LGPD = re.compile(r"\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}|\b\d{4,5}\.\d{2,6}[./]\d{3,7}/\d{4}-\d{2}\b|"
                  r"\bSr\.|\bSra\.|\bLtda\b|\bCPF\b|\bCNPJ\b|omitido", F)
ORDEM_TIPO = [r"^Lei", r"^(Decreto|Medida)", r"Conama|Delibera[çc][ãa]o Normativa|DN ", r"Instru[çc][ãa]o Normativa",
              r"^Resolu", r"^Portaria (Interministerial|Conjunta)", r"^Portaria", r"."]
MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro",
         "dezembro"]
FEMININOS = re.compile(r"^(Lei|Portaria|Resolu|Instru|Delibera|Medida|Nota|Consulta)", F)
SIGLAS_FALA = {"CONAMA": "Conama", "IBAMA": "Ibama", "ICMBIO": "ICMBio", "SEMAD": "Semad", "FEAM": "Feam", "IGAM": "Igam",
               "COPAM": "Copam", "ARSAE": "Arsae", "CONABIO": "Conabio", "SEINFRA": "Seinfra", "SERMOP": "Sermop",
               "SEPLAG": "Seplag", "SEAPA": "Seapa"}
PALAVRAS_COMUNS = {"LEI", "DE", "DA", "DO", "DOS", "DAS", "E", "EM", "ATO", "AO", "NA", "NO", "Nº", "N°", "Nº.", "MAIO"}


# ---------------------------------------------------------------- texto


def titulo_bonito(t):
    """'PORTARIA GM/MMA Nº 1.808, DE 22 DE OUTUBRO DE 2026' -> 'Portaria GM/MMA nº 1.808, de 22 de outubro de 2026'."""
    t = re.sub(r"\s+", " ", (t or "").strip()).rstrip(".")
    out = []
    for i, w in enumerate(t.split(" ")):
        nu = re.sub(r"[^\wÀ-ÿ/-]", "", w).upper()
        if any(p in SIGLAS_FALA for p in nu.split("/")):
            w = "/".join(SIGLAS_FALA.get(p, p) for p in w.upper().split("/"))
        elif w.isupper() and ("/" in w or "-" in w[1:] or (len(nu) <= 4 and nu not in PALAVRAS_COMUNS)):
            pass  # sigla: GM/MMA, IN, MPA, SFB
        else:
            w = w.lower()
        out.append(w)
    s = " ".join(out)
    s = re.sub(r"\bn[º°]\.?\s*", "nº ", s)
    s = re.sub(r"(nº [\d./-]*\d),?\s+(?:de\s+)?(\d{1,2}º? de [a-zç]+ de \d{4})$", r"\1, de \2", s)  # vírgula que falta no jornal
    return s[:1].upper() + s[1:]


def para_fala(t):
    t = re.sub(r"\s*\([^)]*\)", "", t)  # nomes científicos e siglas entre parênteses
    t = re.sub(r"\b[Nn]\.?\s?[º°]\.?\s*", "número ", t)
    t = re.sub(r"\bart\.\s*", "artigo ", t, flags=F)
    t = t.replace("§", "parágrafo ")
    t = re.sub(r"(\d+)/(\d{4})\b", r"\1 de \2", t)
    t = re.sub(r"\b([A-Z][A-Za-z]{1,7})/([A-Z][A-Za-z]{1,7})\b", r"\1 \2", t)  # GM/MMA -> GM MMA
    t = re.sub(r"\s+–\s+|\s+-\s+", ", ", t)
    t = re.sub(r"\b(" + "|".join(SIGLAS_FALA) + r")\b", lambda m: SIGLAS_FALA[m.group(1)], t)
    return re.sub(r"\s+", " ", t).strip()


def data_extenso(iso):
    d = dt.date.fromisoformat(iso)
    return f"{d.day}{'º' if d.day == 1 else ''} de {MESES[d.month - 1]}"


def cortar(frase, palavras):
    """Corta numa vírgula ou ponto-e-vírgula, sem passar do limite. None se nem o primeiro trecho cabe."""
    ws = frase.split()
    if len(ws) <= palavras:
        return frase, False
    trecho = " ".join(ws[:palavras])
    m = re.search(r"^(.*[,;])[^,;]*$", trecho)
    if not m or len(m.group(1).split()) < 8:
        return None, True
    return m.group(1).rstrip(",; "), True


# ---------------------------------------------------------------- atos


def atos_mg(pasta):
    atos = []
    for arq in sorted(Path(pasta).glob("20??-??-??.json")):
        d = json.loads(arq.read_text(encoding="utf-8"))
        for i in d.get("itens", []):
            if i.get("categoria") != "listado":
                continue
            tipo, ementa = i.get("tipo") or "", (i.get("ementa") or "").strip()
            if i["orgao"].startswith("Outro órgão") and tipo not in ("Lei", "Decreto"):
                continue
            if not EMENTA_VERBO.search(ementa) and not re.search(r"consulta p[úu]blica", ementa, F):
                continue
            pag = (i.get("paginas") or [None])[0]
            dados = json.dumps({"dataPublicacaoSelecionada": d["data"] + "T12:00:00", "paginaSelecionada": pag},
                               separators=(",", ":"))
            nome = titulo_bonito(i.get("titulo")) if re.match(r"^(LEI|DECRETO|DELIBERA|RESOLU|PORTARIA|INSTRU)", i.get("titulo") or "") \
                else f"Ato {'da' if i['orgao'] in ('Semad', 'Feam', 'Arsae', 'Copam') else 'do'} {i['orgao']}"
            atos.append({"fonte": "mg", "data": d["data"], "orgao": i["orgao"], "tipo": tipo, "titulo": nome,
                         "ementa": ementa, "trechos": i.get("trechos") or {},
                         "link": "https://www.jornalminasgerais.mg.gov.br/edicao-do-dia?dados=" + urllib.request.quote(dados),
                         "referencia": f"Jornal Minas Gerais, Diário do Executivo de {d['data'][8:]}/{d['data'][5:7]}/{d['data'][:4]}"
                                       + (f", p. {pag}" if pag else "")
                                       + (f", código de autenticidade {i['autenticidade'][0]}" if i.get("autenticidade") else "")})
    return atos


def atos_dou(pasta):
    atos = []
    for arq in sorted(Path(pasta).glob("20??-??-??.json")):
        d = json.loads(arq.read_text(encoding="utf-8"))
        for i in d.get("itens", []):
            atos.append({"fonte": "dou", "data": d["data"], "orgao": i["orgao"], "tipo": i.get("tipo") or "",
                         "titulo": titulo_bonito(i["titulo"]), "ementa": i["ementa"], "trechos": i.get("trechos") or {},
                         "link": i["link"],
                         "referencia": f"DOU de {d['data'][8:]}/{d['data'][5:7]}/{d['data'][:4]}, {i.get('secao') or 'Seção 1'}"
                                       + (f", p. {i['pagina']}" if i.get("pagina") else "")})
    return atos


def janela(pasta, hoje):
    """As 2 últimas datas com jornal publicado (lido), tenha ou não ato ambiental."""
    datas = sorted((p.stem for p in Path(pasta).glob("20??-??-??.json") if p.stem <= hoje), reverse=True)
    if datas and (dt.date.fromisoformat(hoje) - dt.date.fromisoformat(datas[0])).days > 4:
        return []  # jornal parado há dias: nada é "dos últimos 2 dias"
    return sorted(datas[:DIAS])


def tema_de(a):
    alvo = " ".join([a["orgao"], a["titulo"], a["ementa"]])
    for tid, nome, rx in TEMAS:
        if re.search(rx, alvo, F):
            return tid
    return "geral"


def peso(a):
    t = a["titulo"]
    return next(n for n, rx in enumerate(ORDEM_TIPO) if re.search(rx, t, F))


# ---------------------------------------------------------------- roteiro


def frase_ato(a):
    pub = "publicada" if FEMININOS.search(a["titulo"]) else "publicado"
    partes = [f"{a['titulo']}, {pub} em {data_extenso(a['data'])}."]
    ementa = a["ementa"].rstrip(". ")
    return partes, ementa


def roteiro(tema_nome, fonte, atos):
    jornal = "Diário Oficial de Minas Gerais" if fonte == "mg" else "Diário Oficial da União"
    abre = f"{tema_nome}, no {jornal}."
    fecha = "Confira o texto oficial no link da página."
    p = atos[0]
    cab, ementa = frase_ato(p)
    corpo = list(cab)
    n = lambda x: len(para_fala(x).split())  # conta o que a voz vai dizer
    usado = n(abre + " " + " ".join(cab) + " " + fecha)
    vig = (p["trechos"] or {}).get("vigencia")
    rev = (p["trechos"] or {}).get("revoga")
    extra = []
    if rev:
        extra.append(rev + ".")
    extra.append((vig + ".") if vig else "A data de vigência não foi identificada automaticamente.")
    reserva = sum(n(x) for x in extra)
    e, cortou = cortar(ementa, max(PALAVRAS_MAX - usado - reserva, 12))
    if e is None:
        corpo.append("A ementa é longa; leia o resumo completo no texto oficial.")
    else:
        corpo.append(e + "." if not cortou else e + ". A ementa continua no texto oficial.")
    corpo += extra
    resto = atos[1:]
    usado = n(abre + " " + " ".join(corpo) + " " + fecha)
    ditos = 0
    for k, a in enumerate(resto):
        frase = f"Também saiu: {re.sub(r',? de \d{1,2}º? de [a-zç]+ de \d{4}$', '', a['titulo'])}."
        aviso = 8 if k + 1 < len(resto) else 0  # "Há mais N atos deste tema na página."
        if usado + n(frase) + aviso > PALAVRAS_MAX + 4:
            break
        corpo.append(frase)
        usado += n(frase)
        ditos += 1
    if len(resto) > ditos:
        n = len(resto) - ditos
        corpo.append(f"Há mais {n} {'ato' if n == 1 else 'atos'} deste tema na página.")
    return " ".join([abre] + corpo + [fecha])


# ---------------------------------------------------------------- voz


def gerar_mp3(texto, destino, chave):
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{VOZ['id']}?output_format=mp3_44100_64"
    corpo = json.dumps({"text": texto, "model_id": VOZ["modelo"],
                        "voice_settings": {"stability": 0.55, "similarity_boost": 0.75, "style": 0.0,
                                           "use_speaker_boost": True}}).encode()
    req = urllib.request.Request(url, data=corpo, method="POST",
                                 headers={"xi-api-key": chave, "Content-Type": "application/json", "Accept": "audio/mpeg"})
    with urllib.request.urlopen(req, timeout=120, context=mg._ctx()) as r:
        dados = r.read()
    if len(dados) < 2000:
        raise ValueError("resposta curta demais para ser áudio")
    Path(destino).write_bytes(dados)
    return round(len(dados) * 8 / 64000)  # 64 kbit/s constante


# ---------------------------------------------------------------- montagem


def montar_fonte(fid, atos, pasta, hoje):
    datas = janela(pasta, hoje)
    sel = [a for a in atos if a["data"] in datas and not LGPD.search(" ".join([a["titulo"], a["ementa"]] +
                                                                              [v or "" for v in a["trechos"].values()]))]
    internos = [a for a in sel if INTERNO.search(a["ementa"])]
    publicos = [a for a in sel if a not in internos]
    temas = []
    for tid, nome, _ in TEMAS:
        grupo = [a for a in publicos if tema_de(a) == tid]
        grupo.sort(key=lambda a: (peso(a), -int(a["data"].replace("-", ""))))
        if not grupo:
            continue
        txt = roteiro(nome, fid, grupo)
        temas.append({"id": tid, "nome": nome, "roteiro": txt, "fala": para_fala(txt), "audio": None, "duracao_s": None,
                      "atos": [{k: a[k] for k in ("data", "orgao", "titulo", "ementa", "trechos", "link", "referencia")}
                               for a in grupo]})
    return {"id": fid, "janela": datas, "temas": temas,
            "internos": [{k: a[k] for k in ("data", "orgao", "titulo", "ementa", "link", "referencia")} for a in internos]}


def main():
    ap = argparse.ArgumentParser(description="Radar em áudio (MG e DOU)")
    ap.add_argument("--mg", required=True)
    ap.add_argument("--dou", required=True)
    ap.add_argument("--saida", required=True)
    ap.add_argument("--audios", required=True, help="pasta onde gravar os MP3 novos")
    ap.add_argument("--existentes", help="arquivo com os nomes dos MP3 que já estão publicados (um por linha)")
    ap.add_argument("--base-url", default="https://github.com/oanalistaambi/site/releases/download/radar-audios/")
    ap.add_argument("--hoje", default=dt.date.today().isoformat())
    a = ap.parse_args()
    anterior = {}
    if Path(a.saida).exists():
        anterior = {f["id"]: f for f in json.loads(Path(a.saida).read_text(encoding="utf-8")).get("fontes", [])}
    existentes = set(Path(a.existentes).read_text().split()) if a.existentes and Path(a.existentes).exists() else set()
    chave = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    os.makedirs(a.audios, exist_ok=True)
    fontes, enviados = [], 0
    for fid, nome, jornal, leitor, pasta in (
            ("mg", "Minas Gerais", "Jornal Minas Gerais, Diário do Executivo", atos_mg, a.mg),
            ("dou", "Federal (DOU)", "Diário Oficial da União, Seção 1", atos_dou, a.dou)):
        lidos = list(Path(pasta).glob("20??-??-??.json"))
        if not lidos and fid in anterior:
            f = dict(anterior[fid], aviso_leitura="A leitura de hoje falhou; mostrando a última leitura bem-sucedida.")
            fontes.append(f)
            print(f"{fid}: nenhuma edição lida hoje; mantida a anterior")
            continue
        f = dict(montar_fonte(fid, leitor(pasta), pasta, a.hoje), nome=nome, jornal=jornal)
        for t in f["temas"]:
            h = hashlib.sha1((t["fala"] + VOZ["id"] + VOZ["modelo"]).encode()).hexdigest()[:10]
            arq = f"{fid}-{t['id']}-{h}.mp3"
            ant = next((x for x in (anterior.get(fid) or {}).get("temas", []) if x.get("audio", "") and x["audio"].endswith(arq)), None)
            if arq in existentes:
                t["audio"], t["duracao_s"] = a.base_url + arq, (ant or {}).get("duracao_s")
            elif chave and enviados + len(t["fala"]) <= MAX_CARACTERES:
                try:
                    t["duracao_s"] = gerar_mp3(t["fala"], os.path.join(a.audios, arq), chave)
                    t["audio"] = a.base_url + arq
                    enviados += len(t["fala"])
                except (urllib.error.URLError, ValueError, TimeoutError) as e:
                    print(f"{arq}: sem áudio ({type(e).__name__}: {e}); a página usa a voz do navegador", file=sys.stderr)
            print(f"{fid}/{t['id']}: {len(t['atos'])} ato(s), {len(t['fala'].split())} palavras, "
                  f"áudio {'ok' if t['audio'] else 'não'}{' (' + str(t['duracao_s']) + ' s)' if t['duracao_s'] else ''}")
        fontes.append(f)
    saida = {"gerado_em": dt.datetime.now(dt.timezone(dt.timedelta(hours=-3))).isoformat(timespec="minutes"),
             "dias": DIAS, "voz": {"nome": VOZ["nome"] + " (voz sintética do ElevenLabs)", "modelo": VOZ["modelo"]},
             "fontes": fontes}
    Path(a.saida).write_text(json.dumps(saida, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{a.saida}: {sum(len(f['temas']) for f in fontes)} tema(s); {enviados} caracteres enviados ao ElevenLabs")
    return 0


if __name__ == "__main__":
    sys.exit(main())
