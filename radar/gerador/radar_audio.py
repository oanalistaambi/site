#!/usr/bin/env python3
"""Radar em áudio.
- Minas Gerais: atos ambientais dos 2 últimos dias de jornal, um áudio curto (cerca de 30 segundos) por tema.
- Federal (DOU): um episódio por dia, de até uns 5 minutos, com capítulos (um por destaque), para os 4 últimos dias
  com destaque. O episódio fica salvo em radar/episodios/ e não é refeito; pode ser revisado à mão (origem "revisado").
Se houver chave do ElevenLabs, gera o MP3.

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
                     r"planejamento estrat[ée]gico|Programa de Gest[ãa]o e Desempenho|teletrabalho|delega[çc][ãa]o de compet|"
                     r"Prote[çc][ãa]o de Dados Pessoais|seguran[çc]a da informa[çc][ãa]o|Ass[ée]dio e [àa] Discrimina", F)
EMENTA_VERBO = re.compile(r"^(Disp[õo]e|Estabelece|Altera|Institui|Regulamenta|Aprova|Define|Cria|Revoga|Prorroga|Suspende|"
                          r"Disciplina|Atualiza|Fixa|Torna p[úu]blic|Divulga|Reconhece|Amplia|Acrescenta|Consolida|Convoca|Submete)", F)
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


_UN = "zero um dois três quatro cinco seis sete oito nove dez onze doze treze quatorze quinze dezesseis dezessete dezoito dezenove".split()
_DEZ = "_ _ vinte trinta quarenta cinquenta sessenta setenta oitenta noventa".split()
_CEM = "_ cento duzentos trezentos quatrocentos quinhentos seiscentos setecentos oitocentos novecentos".split()


def _ate_mil(n):
    if n == 100:
        return "cem"
    c, r = divmod(n, 100)
    p = [_CEM[c]] if c else []
    if r:
        p.append(_UN[r] if r < 20 else _DEZ[r // 10] + (" e " + _UN[r % 10] if r % 10 else ""))
    return " e ".join(p)


def por_extenso(n):
    """Inteiro (até 999.999) por extenso; a voz sintética erra números com ponto de milhar (ex.: 1.809, 5.050)."""
    m, r = divmod(n, 1000)
    if not m:
        return _ate_mil(r)
    mil = "mil" if m == 1 else _ate_mil(m) + " mil"
    if not r:
        return mil
    return mil + (" e " if r < 100 or r % 100 == 0 else " ") + _ate_mil(r)


def para_fala(t):
    t = re.sub(r"\s*\([^)]*\)", "", t)  # nomes científicos e siglas entre parênteses
    t = re.sub(r"\b[Nn]\.?\s?[º°]\.?\s*", "número ", t)
    t = re.sub(r"\bart\.\s*", "artigo ", t, flags=F)
    t = t.replace("§", "parágrafo ")
    t = re.sub(r"(\d+)/(\d{4})\b", r"\1 de \2", t)
    t = re.sub(r"(?<![\d.])(\d{1,3}(?:\.\d{3})+)(?![\d.])", lambda m: por_extenso(int(m.group(1).replace(".", ""))), t)
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


# ---------------------------------------------------------------- episódios do DOU (um por dia, até ~5 min)

DIAS_EPISODIOS = 4  # o dia mais recente e pelo menos os 3 anteriores com destaque
PALAVRAS_EPISODIO = 650  # ~4min40 na voz Jerri
DIAS_SEMANA = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"]
ORDINAIS = ["Primeiro", "Segundo", "Terceiro", "Quarto", "Quinto", "Sexto", "Sétimo", "Oitavo", "Nono", "Décimo"]
FECHO_AUTO = ("Este resumo foi montado automaticamente a partir do texto publicado e lido por uma voz sintética. "
              "Antes de aplicar qualquer regra, confira o texto oficial pelos links na página. Até a próxima edição!")


def nome_tema(a):
    if re.search(r"^Submete|consulta p[úu]blica", a["ementa"], F):
        return "Consulta pública"
    return next(nome for tid, nome, _ in TEMAS if tid == tema_de(a))


def episodio_auto(data, atos):
    """Episódio montado só com trechos copiados do ato (título, ementa, revogação e vigência)."""
    d = dt.date.fromisoformat(data)
    quando = f"{DIAS_SEMANA[d.weekday()]}, {data_extenso(data)} de {d.year}"
    atos = sorted(atos, key=peso)
    caps, usadas = [], 0
    abre = (f"Olá! Este é o Radar Ambiental do Diário Oficial da União, edição de {quando}. "
            f"Hoje {'é um destaque' if len(atos) == 1 else f'são {len(atos)} destaques'} da área ambiental.")
    caps.append({"titulo": "Abertura", "tema": None, "atos": [], "fala": abre})
    usadas += len(abre.split()) + 45  # reserva para o fechamento
    for k, a in enumerate(atos):
        cab, ementa = frase_ato(a)
        e, cortou = cortar(ementa, 70)
        txt = [f"{ORDINAIS[k] if k < len(ORDINAIS) else 'Outro'} destaque: " + cab[0],
               (e + "." + (" A ementa continua no texto oficial." if cortou else "")) if e else
               "A ementa é longa; leia o resumo completo no texto oficial."]
        tr = a.get("trechos") or {}
        if tr.get("revoga"):
            txt.append(tr["revoga"] + ".")
        txt.append((tr["vigencia"] + ".") if tr.get("vigencia") else "A data de vigência não foi identificada automaticamente.")
        fala = " ".join(txt)
        if usadas + len(fala.split()) > PALAVRAS_EPISODIO and caps[1:]:
            resto = len(atos) - k
            caps[-1]["fala"] += f" Há mais {resto} {'ato' if resto == 1 else 'atos'} deste dia na página."
            break
        usadas += len(fala.split())
        caps.append({"titulo": a["titulo"], "tema": nome_tema(a), "fala": fala,
                     "atos": [{"titulo": a["titulo"], "link": a["link"], "referencia": a["referencia"],
                               "vigencia": tr.get("vigencia") or "confira no texto oficial"}]})
    caps.append({"titulo": "Fechamento", "tema": None, "atos": [], "fala": FECHO_AUTO})
    return {"id": f"dou-{data}", "fonte": "dou", "data": data, "dia_semana": DIAS_SEMANA[d.weekday()],
            "titulo": " · ".join(dict.fromkeys(c["tema"] for c in caps[1:-1])) + f": {len(caps) - 2} destaque{'s' if len(caps) > 3 else ''}",
            "origem": "automatico", "capitulos": caps, "audio": None, "duracao_s": None}


def _dur(arq):
    import subprocess
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(arq)],
                         capture_output=True, text=True, check=True).stdout
    return float(out.strip())


def tts_trecho(texto, destino, chave, antes="", depois=""):
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{VOZ['id']}?output_format=mp3_44100_128"
    corpo = {"text": texto, "model_id": VOZ["modelo"], "previous_text": antes[-1000:], "next_text": depois[:1000],
             "voice_settings": {"stability": 0.5, "similarity_boost": 0.75, "style": 0.0, "use_speaker_boost": True}}
    req = urllib.request.Request(url, data=json.dumps(corpo).encode(), method="POST",
                                 headers={"xi-api-key": chave, "Content-Type": "application/json", "Accept": "audio/mpeg"})
    with urllib.request.urlopen(req, timeout=300, context=mg._ctx()) as r:
        dados = r.read()
    if len(dados) < 2000:
        raise ValueError("resposta curta demais para ser áudio")
    Path(destino).write_bytes(dados)


def sintetizar_episodio(ep, destino, chave):
    """Um pedido por capítulo (com o texto vizinho, para a entonação seguir natural), unidos com pausa curta.
    Grava o MP3 final e o instante de início de cada capítulo."""
    import subprocess
    import tempfile
    falas = [para_fala(c["fala"]) for c in ep["capitulos"]]
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        pausa = tmp / "pausa.mp3"
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", "0.8",
                        "-b:a", "128k", str(pausa)], check=True)
        partes, inicios, t = [], [], 0.0
        for i, f in enumerate(falas):
            p = tmp / f"cap{i:02d}.mp3"
            tts_trecho(f, p, chave, " ".join(falas[:i]), " ".join(falas[i + 1:]))
            inicios.append(round(t, 1))
            t += _dur(p) + (0.8 if i + 1 < len(falas) else 0)
            partes += [p] + ([pausa] if i + 1 < len(falas) else [])
        lista = tmp / "lista.txt"
        lista.write_text("".join(f"file '{p}'\n" for p in partes))
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lista),
                        "-ac", "1", "-ar", "44100", "-b:a", "96k", "-id3v2_version", "3",
                        "-metadata", f"title=Radar Ambiental do DOU, {ep['data']}", "-metadata", "artist=O Analista Ambiental",
                        str(destino)], check=True)
    for c, ini in zip(ep["capitulos"], inicios):
        c["inicio_s"] = ini
    ep["duracao_s"] = round(_dur(destino))
    ep["bytes"] = Path(destino).stat().st_size
    ep["publicado_em"] = dt.datetime.now(dt.timezone(dt.timedelta(hours=-3))).isoformat(timespec="seconds")
    return sum(len(f) for f in falas)


SITE = "https://www.oanalistaambiental.com/"
PODCAST = {
    "titulo": "Radar Ambiental do Diário Oficial",
    "autor": "O Analista Ambiental",
    "email": "contato@oanalistaambiental.com",
    "pagina": SITE + "radar-audio.html",
    "capa": SITE + "radar/podcast-capa.jpg",
    "descricao": ("Os destaques ambientais do Diário Oficial da União, todo dia útil, em poucos minutos: o que muda, para quem e "
                  "quando entra em vigor. Licenciamento, água e outorga, fiscalização, flora e unidades de conservação, fauna e "
                  "pesca, mineração e barragens, Conama, Ibama, ICMBio, ANA e MMA. Resumo e voz gerados por inteligência "
                  "artificial a partir do texto publicado; confira sempre o texto oficial pelos links de cada episódio. "
                  "Conteúdo informativo, sem dados pessoais."),
}


def gerar_feed(eps, destino):
    """RSS de podcast (Spotify, YouTube/YouTube Music, Apple Podcasts, Amazon) com os episódios que têm áudio."""
    from email.utils import format_datetime
    from xml.sax.saxutils import escape
    q = lambda s: escape(str(s), {'"': "&quot;"})
    agora = dt.datetime.now(dt.timezone(dt.timedelta(hours=-3)))
    itens = []
    for ep in sorted(eps, key=lambda e: e["data"], reverse=True):
        if not ep.get("audio"):
            continue
        url = ep["audio"] if ep["audio"].startswith("http") else SITE + ep["audio"]
        local = Path(ep["audio"])
        tam = local.stat().st_size if local.exists() else ep.get("bytes") or 0
        quando = dt.datetime.fromisoformat(ep.get("publicado_em") or ep["data"] + "T07:00:00-03:00")
        d = dt.date.fromisoformat(ep["data"])
        caps = [c for c in ep["capitulos"]]
        # linhas "0:00 título" viram capítulos no YouTube; os links levam ao texto oficial
        linhas = [f"{int(c.get('inicio_s') or 0) // 60}:{int(c.get('inicio_s') or 0) % 60:02d} {c['titulo']}" for c in caps]
        html = [f"<p>{q(ep['titulo'])}.</p>", "<p>" + "<br>".join(q(x) for x in linhas) + "</p>", "<p>Textos oficiais:</p><ul>"]
        texto = [ep["titulo"] + ".", "", *linhas, "", "Textos oficiais:"]
        for c in caps:
            for a in c.get("atos", []):
                html.append(f'<li><a href="{q(a["link"])}">{q(a["titulo"])}</a> (vigência: {q(a.get("vigencia") or "confira no texto")})</li>')
                texto.append(f"- {a['titulo']}: {a['link']}")
        aviso = ("Resumo e voz gerados por inteligência artificial a partir do texto publicado. "
                 "Antes de aplicar qualquer regra, confira o texto oficial. Página: " + PODCAST["pagina"])
        html += ["</ul>", f"<p>{q(aviso)}</p>"]
        texto += ["", aviso]
        itens.append(f"""  <item>
    <title>{q(f"DOU de {d.day:02d}/{d.month:02d}/{d.year}: {ep['titulo']}")}</title>
    <description><![CDATA[{"".join(html)}]]></description>
    <itunes:summary>{q(chr(10).join(texto))}</itunes:summary>
    <link>{q(PODCAST["pagina"])}</link>
    <guid isPermaLink="false">oanalistaambiental-{q(ep["id"])}</guid>
    <pubDate>{format_datetime(quando)}</pubDate>
    <enclosure url="{q(url)}" length="{tam}" type="audio/mpeg"/>
    <itunes:duration>{int(ep.get("duracao_s") or 0)}</itunes:duration>
    <itunes:episodeType>full</itunes:episodeType>
    <itunes:explicit>false</itunes:explicit>
    <itunes:image href="{q(PODCAST["capa"])}"/>
  </item>""")
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
  <title>{q(PODCAST["titulo"])}</title>
  <link>{q(PODCAST["pagina"])}</link>
  <atom:link href="{SITE}radar/podcast.xml" rel="self" type="application/rss+xml"/>
  <language>pt-br</language>
  <copyright>O Analista Ambiental</copyright>
  <description>{q(PODCAST["descricao"])}</description>
  <itunes:summary>{q(PODCAST["descricao"])}</itunes:summary>
  <itunes:author>{q(PODCAST["autor"])}</itunes:author>
  <itunes:owner><itunes:name>{q(PODCAST["autor"])}</itunes:name><itunes:email>{q(PODCAST["email"])}</itunes:email></itunes:owner>
  <itunes:image href="{q(PODCAST["capa"])}"/>
  <image><url>{q(PODCAST["capa"])}</url><title>{q(PODCAST["titulo"])}</title><link>{q(PODCAST["pagina"])}</link></image>
  <itunes:category text="News"><itunes:category text="Daily News"/></itunes:category>
  <itunes:category text="Government"/>
  <itunes:explicit>false</itunes:explicit>
  <itunes:type>episodic</itunes:type>
  <lastBuildDate>{format_datetime(agora)}</lastBuildDate>
{chr(10).join(itens)}
</channel>
</rss>
"""
    Path(destino).write_text(xml, encoding="utf-8")
    return len(itens)


def hash_episodio(ep):
    return hashlib.sha1(("|".join(c["fala"] for c in ep["capitulos"]) + VOZ["id"] + VOZ["modelo"]).encode()).hexdigest()[:10]


def episodios_dou(pasta, dir_ep, hoje, atos):
    """Garante um episódio salvo para cada dia lido com ato ambiental geral e devolve os DIAS_EPISODIOS mais recentes.
    Episódio já salvo (revisado ou automático) não é refeito: o roteiro e o áudio ficam como estão."""
    dir_ep = Path(dir_ep)
    dir_ep.mkdir(parents=True, exist_ok=True)
    por_dia = {}
    for a in atos:
        if a["data"] <= hoje and not INTERNO.search(a["ementa"]) and not LGPD.search(
                " ".join([a["titulo"], a["ementa"]] + [v or "" for v in a["trechos"].values()])):
            por_dia.setdefault(a["data"], []).append(a)
    for data, lista in por_dia.items():
        arq = dir_ep / f"dou-{data}.json"
        if not arq.exists():
            arq.write_text(json.dumps(episodio_auto(data, lista), ensure_ascii=False, indent=1), encoding="utf-8")
    eps = sorted((json.loads(p.read_text(encoding="utf-8")) for p in dir_ep.glob("dou-20??-??-??.json")),
                 key=lambda e: e["data"], reverse=True)
    eps = [e for e in eps if e["data"] <= hoje]
    manter, sair = eps[:DIAS_EPISODIOS], eps[DIAS_EPISODIOS:]
    for e in sair:
        (dir_ep / f"{e['id']}.json").unlink()
    return manter


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
    ap.add_argument("--no-repo", default="radar/audios",
                    help="pasta do site com MP3 gerados fora do workflow (sem o segredo); servidos como radar/audios/...")
    ap.add_argument("--gravar-no-repo", action="store_true",
                    help="grava os MP3 novos na pasta do site (--no-repo) em vez de --audios (para a release)")
    ap.add_argument("--episodios", default="radar/episodios", help="pasta dos episódios diários do DOU (ficam no site)")
    ap.add_argument("--feed", default="radar/podcast.xml", help="RSS do podcast (só o federal)")
    ap.add_argument("--hoje", default=dt.date.today().isoformat())
    a = ap.parse_args()
    url_repo = Path(a.no_repo).as_posix().rstrip("/") + "/"
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
        if fid == "dou":  # federal: um episódio por dia, no lugar dos áudios curtos por tema
            f["temas"] = []
            f["episodios"] = episodios_dou(pasta, a.episodios, a.hoje, leitor(pasta))
            f["janela"] = sorted(e["data"] for e in f["episodios"])
            for ep in f["episodios"]:
                arq = f"{ep['id']}-{hash_episodio(ep)}.mp3"
                no_repo = Path(a.no_repo) / arq
                if arq in existentes:
                    ep["audio"] = a.base_url + arq
                elif no_repo.exists():
                    ep["audio"] = url_repo + arq
                elif chave and len(ep["capitulos"]) > 2 and enviados + sum(len(c["fala"]) for c in ep["capitulos"]) <= MAX_CARACTERES:
                    destino = no_repo if a.gravar_no_repo else Path(a.audios) / arq
                    destino.parent.mkdir(parents=True, exist_ok=True)
                    try:
                        enviados += sintetizar_episodio(ep, destino, chave)
                        ep["audio"] = (url_repo if a.gravar_no_repo else a.base_url) + arq
                    except Exception as e:  # sem áudio hoje; a página oferece a voz do navegador
                        print(f"{arq}: sem áudio ({type(e).__name__}: {e})", file=sys.stderr)
                else:
                    ep["audio"] = None
                Path(a.episodios, f"{ep['id']}.json").write_text(json.dumps(ep, ensure_ascii=False, indent=1), encoding="utf-8")
                print(f"dou/{ep['id']}: {len(ep['capitulos']) - 2} destaque(s), {ep['origem']}, "
                      f"{sum(len(c['fala'].split()) for c in ep['capitulos'])} palavras, áudio {'ok' if ep['audio'] else 'não'}"
                      + (f" ({ep['duracao_s']} s)" if ep.get("duracao_s") else ""))
        for t in f["temas"]:
            h = hashlib.sha1((t["fala"] + VOZ["id"] + VOZ["modelo"]).encode()).hexdigest()[:10]
            arq = f"{fid}-{t['id']}-{h}.mp3"
            ant = next((x for x in (anterior.get(fid) or {}).get("temas", []) if x.get("audio", "") and x["audio"].endswith(arq)), None)
            no_repo = Path(a.no_repo) / arq
            if arq in existentes:
                t["audio"], t["duracao_s"] = a.base_url + arq, (ant or {}).get("duracao_s")
            elif no_repo.exists():  # gerado antes, sem o segredo, e guardado no site
                t["audio"], t["duracao_s"] = url_repo + arq, round(no_repo.stat().st_size * 8 / 64000)
            elif chave and enviados + len(t["fala"]) <= MAX_CARACTERES:
                try:
                    destino = no_repo if a.gravar_no_repo else Path(a.audios) / arq
                    destino.parent.mkdir(parents=True, exist_ok=True)
                    t["duracao_s"] = gerar_mp3(t["fala"], destino, chave)
                    t["audio"] = (url_repo if a.gravar_no_repo else a.base_url) + arq
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
    dou = next((f for f in fontes if f["id"] == "dou"), None)
    if dou and dou.get("episodios") is not None:
        print(f"{a.feed}: {gerar_feed(dou['episodios'], a.feed)} episódio(s) no podcast")
    print(f"{a.saida}: {sum(len(f['temas']) for f in fontes)} tema(s); {enviados} caracteres enviados ao ElevenLabs")
    return 0


if __name__ == "__main__":
    sys.exit(main())
