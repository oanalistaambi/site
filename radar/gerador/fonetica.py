"""Pronúncia das siglas e nomes difíceis nas vozes sintéticas (português do Brasil).

Curadoria de 12/11/2026: 84 termos do DOU, do Jornal Minas Gerais e do licenciamento lidos pelas vozes
Google Chirp 3 HD (Callirrhoe e Charon) e conferidos com o Whisper. Detalhes em radar/estudio/pronuncia.json.

Regra geral (como se fala no Brasil): sigla que forma sílaba lê-se como palavra (Ibama, Incra, Copam);
as outras, letra por letra (MMA, TCU, CBS). A voz já faz isso sozinha com a sigla em maiúsculas; só os
termos abaixo precisaram de ajuste.

ATENÇÃO: nunca escrever o nome da letra com acento ("éfe", "ésse", "é"): a voz lê "e acento agudo".
Para obrigar a soletrar, use pontos: "I.E.F.".

Só a fala muda; a página e a legenda continuam com a grafia oficial.
"""
import re

# grafia que vai para a voz (vale para qualquer voz: Google, ElevenLabs, navegador)
TEXTO = {
    "IDE-Sisema": "I.D.E. Sisema",  # saía "IDS Sema"
    "DOU": "D.O.U.",                # saía "DOE" / "d"
    "IEF": "I.E.F.",                # saía a palavra inglesa "if"
    "ZEE": "Z.E.E.",                # saía só "Z"
    "PISF": "P.I.S.F.",             # saía "PSF"
    "URFBio": "URF Bio",
    "ART": "A.R.T.",                # saía a palavra "arte"
}

# pronúncia em IPA (só a API do Google aceita; vai em customPronunciations)
IPA = {
    "Sisema": "siˈzɛmɐ",       # saía "sistema"
    "Feam": "feˈɐ̃",            # saía "fim"
    "Igam": "iˈɡɐ̃",            # saía "Igão" / "Wigan"
    "SOUT": "ˈsowtʃi",         # como "sôuti"
    "Sigef": "siˈʒɛfi",
    "Prevfogo": "pɾɛviˈfoɡu",  # saía "prefog"
    "Arsae": "aɾˈsaj",         # saía "ar sair"
    "EIA": "ˈɛja",             # o EIA/Rima: "éia rima"
    "Seplag": "seˈplaɡi",
    "Copam": "koˈpɐ̃",
    "PAE": "pe a ˈɛ",           # saía "pai"
    "Itabiruçu": "itabiɾuˈsu",
    "Embramine": "ẽbɾaˈmini",
    "Magban": "maɡiˈbɐ̃",
    "estéril": "isˈtɛɾiw",
}

_LIMITE = r"(?<![\w-]){}(?![\w-])"
_RE_TEXTO = re.compile("|".join(_LIMITE.format(re.escape(k)) + r"\.?" for k in sorted(TEXTO, key=len, reverse=True)))


def _troca(m):
    sigla = m.group(0)
    ponto = sigla.endswith(".")  # fim de frase: "o ZEE." não vira "Z.E.E.."
    novo = TEXTO[sigla.rstrip(".")]
    return novo if novo.endswith(".") or not ponto else novo + "."


def para_voz(t):
    """Troca as siglas pela grafia testada (maiúsculas e minúsculas exatas, palavra inteira)."""
    return _RE_TEXTO.sub(_troca, t)


def pronuncias(t):
    """Lista para o campo customPronunciations da API do Google, só com os termos presentes no texto."""
    return [{"phrase": k, "phoneticEncoding": "PHONETIC_ENCODING_IPA", "pronunciation": v}
            for k, v in IPA.items() if re.search(_LIMITE.format(re.escape(k)), t)]
