#!/usr/bin/env python3
"""Áudio informativo em dupla (Clara e Bento) com as vozes Google Chirp 3 HD pt-BR.

Uso:  python3 -I radar/estudio/dupla/dupla.py ROTEIRO.json PASTA_SAIDA [AAAA-MM-DD]

ROTEIRO.json: {"federal": [["f","fala da Clara"],["m","fala do Bento"], ...], "minas": [...]}
Gera, para cada chave, dupla-CHAVE-DATA.mp3 e .ogg (o .ogg é para o WhatsApp). Não vai para o git (áudio).
A chave do Google vem da variável de ambiente GOOGLE_TTS_API_KEY (nunca imprimir nem gravar em arquivo).
Pronúncia das siglas: radar/gerador/fonetica.py. Elenco: Clara = Callirrhoe, Bento = Charon.
Música de fundo sintética bem baixa, com redução automática enquanto alguém fala.
"""
import base64, importlib.util, json, os, subprocess, sys, urllib.request
from pathlib import Path
import numpy as np

AQUI = Path(__file__).resolve().parent
_s = importlib.util.spec_from_file_location("fonetica", AQUI.parents[1] / "gerador" / "fonetica.py")
fo = importlib.util.module_from_spec(_s); _s.loader.exec_module(fo)

SR = 44100
VOZ = {"f": "pt-BR-Chirp3-HD-Callirrhoe", "m": "pt-BR-Chirp3-HD-Charon"}
# nomes próprios que não estão no glossário geral (IPA)
EXTRA = {"Quinzinho": "kĩˈziɲu"}


def sintetizar(texto, voz, destino, chave):
    texto = fo.para_voz(texto)
    pron = fo.pronuncias(texto) + [{"phrase": k, "phoneticEncoding": "PHONETIC_ENCODING_IPA", "pronunciation": v}
                                   for k, v in EXTRA.items() if k in texto]
    corpo = {"input": {"text": texto, **({"customPronunciations": {"pronunciations": pron}} if pron else {})},
             "voice": {"languageCode": "pt-BR", "name": voz},
             "audioConfig": {"audioEncoding": "LINEAR16", "sampleRateHertz": SR}}
    req = urllib.request.Request("https://texttospeech.googleapis.com/v1/text:synthesize", data=json.dumps(corpo).encode(),
                                 headers={"X-Goog-Api-Key": chave, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=90) as r:
        Path(destino).write_bytes(base64.b64decode(json.load(r)["audioContent"]))


def ler(p):
    return np.frombuffer(Path(p).read_bytes()[44:], np.int16).astype(np.float32) / 32768


def ff(*a):
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *a], check=True)


def main():
    roteiro, saida = Path(sys.argv[1]), Path(sys.argv[2])
    data = sys.argv[3] if len(sys.argv) > 3 else "sem-data"
    chave = os.environ["GOOGLE_TTS_API_KEY"]
    saida.mkdir(parents=True, exist_ok=True)
    for nome, falas in json.loads(roteiro.read_text(encoding="utf-8")).items():
        voz = [np.zeros(int(2.0 * SR), np.float32)]
        for i, (q, t) in enumerate(falas):
            d = saida / f"d-{nome}-{i:02d}.wav"
            sintetizar(t, VOZ[q], d, chave)
            a = ler(d)
            a = a / (np.sqrt(np.mean(a[np.abs(a) > 0.01] ** 2)) + 1e-9) * 0.12  # as duas vozes no mesmo nível
            voz.append(a)
            prox = falas[i + 1][0] if i + 1 < len(falas) else None
            voz.append(np.zeros(int((0.28 if prox and prox != q else 0.65) * SR), np.float32))
        voz.append(np.zeros(int(1.5 * SR), np.float32))
        v = np.concatenate(voz); dur = len(v) / SR
        tt = np.arange(len(v)) / SR; m = np.zeros_like(tt)
        ac = [(220.0, 261.6, 329.6), (174.6, 220.0, 261.6), (196.0, 246.9, 293.7), (261.6, 329.6, 392.0)]
        for k in range(int(dur / 4) + 1):
            seg = (tt >= k * 4) & (tt < k * 4 + 4.5)
            e = np.clip((tt - k * 4) / 0.6, 0, 1) * np.clip((k * 4 + 4.5 - tt) / 0.6, 0, 1)
            for fr in ac[k % 4]:
                m += seg * e * (np.sin(2 * np.pi * fr * tt) + 0.25 * np.sin(2 * np.pi * fr * 2 * tt))
        (saida / "v.f32").write_bytes(v.tobytes()); (saida / "m.f32").write_bytes((m / np.abs(m).max() * 0.5).astype(np.float32).tobytes())
        mp3 = saida / f"dupla-{nome}-{data}.mp3"
        ff("-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", str(saida / "v.f32"), "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", str(saida / "m.f32"),
           "-filter_complex",
           f"[0]highpass=f=70,acompressor=threshold=-20dB:ratio=2.5:attack=8:release=150,loudnorm=I=-16:TP=-1.5,asplit[v][vs];"
           f"[1]lowpass=f=2000,volume=0.07,afade=t=in:d=0.8,afade=t=out:st={dur - 2.5}:d=2.5[mu];[mu][vs]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=450[md];"
           "[v][md]amix=inputs=2:normalize=0,alimiter=limit=0.95",
           "-ar", str(SR), "-ac", "1", "-b:a", "96k", "-metadata", f"title=Ambiental Inteligência, {nome}, {data} (dupla)", str(mp3))
        ff("-i", str(mp3), "-c:a", "libopus", "-b:a", "48k", "-ar", "48000", "-ac", "1", str(mp3.with_suffix(".ogg")))
        print(nome, round(dur, 1), "s")


if __name__ == "__main__":
    main()
