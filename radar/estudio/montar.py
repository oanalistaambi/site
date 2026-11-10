"""Monta a mesa-redonda: uma fala por vez, cada personagem com sua voz, pausas curtas, vinheta e coro.

Uso: ROTEIRO=pilula-igam-18.json PARTES=/tmp/partes SAIDA=/tmp/pilula.mp3 python3 montar.py
Gera também SAIDA.tempo.json (início e fim de cada fala), usado pela cena animada (render.mjs).
Vozes de teste: edge-tts (as mesmas vozes neurais da Microsoft; para publicar, usar a Azure com chave oficial).
Pronúncia: ver pronuncia.json. Nunca usar voz clonada do dono."""
import asyncio, json, os, subprocess, sys
from pathlib import Path

AQUI = Path(__file__).parent
TMP = AQUI / os.environ.get("PARTES", "partes"); TMP.mkdir(exist_ok=True)
VOZES = {  # motor, voz, ajustes
    "clara": ("edge", "pt-BR-FranciscaNeural", "+4%", "+0Hz"),
    "marina": ("edge", "pt-BR-ThalitaMultilingualNeural", "-6%", "+0Hz"),  # estava rápida (168 palavras/min)
    "bento": ("edge", "pt-BR-AntonioNeural", "-4%", "-6Hz"),
    # quarta voz (Kokoro, gratuito) fica opcional: soou artificial no teste de 10/11/2026
    "tiao": (os.environ.get("TIAO_MOTOR", "kokoro"), os.environ.get("TIAO_VOZ", "pm_santa"), "+0%", "+0Hz"),
}
SR = 44100


def ff(*a):
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *a], check=True)


async def edge(txt, voz, rate, pitch, dest):
    import edge_tts
    for t in range(4):
        try:
            await edge_tts.Communicate(txt, voz, rate=rate, pitch=pitch).save(str(dest)); return
        except Exception as e:
            print("edge falhou, tentando de novo:", e); await asyncio.sleep(3)
    raise RuntimeError("edge-tts sem resposta")


def kokoro(txt, voz, dest):
    py = AQUI / "k12/bin/python"
    subprocess.run([str(py), str(AQUI / "kok.py"), voz, txt, str(dest)], check=True)


def wav(src, dest):
    ff("-i", str(src), "-ac", "1", "-ar", str(SR), "-af", "loudnorm=I=-18:TP=-2:LRA=7", str(dest))


def falar(quem, txt, dest):
    motor, voz, rate, pitch = VOZES[quem]
    import hashlib; h = hashlib.sha1((quem + txt).encode()).hexdigest()[:10]
    bruto = TMP / f"{h}.raw.{'mp3' if motor == 'edge' else 'wav'}"
    if not bruto.exists():
        if motor == "edge":
            asyncio.run(edge(txt, voz, rate, pitch, bruto))
        else:
            kokoro(txt, voz, bruto)
    wav(bruto, dest)


def vinheta(dest):  # acorde curto e suave (gerado aqui, sem direitos de terceiros)
    ff("-f", "lavfi", "-i", "sine=f=392:d=2.6", "-f", "lavfi", "-i", "sine=f=523.25:d=2.6",
       "-f", "lavfi", "-i", "sine=f=659.25:d=2.6",
       "-filter_complex", "[0][1][2]amix=inputs=3,volume=0.5,afade=t=in:d=0.3,afade=t=out:st=1.6:d=1.0,aecho=0.8:0.6:120:0.25",
       "-ac", "1", "-ar", str(SR), str(dest))


def main():
    d = json.load(open(AQUI / os.environ.get("ROTEIRO", "roteiro.json")))
    so = sys.argv[1:] and int(sys.argv[1])  # limite de falas (teste)
    partes = []
    pausa = TMP / "pausa.wav"; ff("-f", "lavfi", "-i", f"anullsrc=r={SR}:cl=mono", "-t", "0.35", str(pausa))
    falas = d["falas"][:so] if so else d["falas"]
    linha, t0 = [], 0.0
    for i, (quem, txt) in enumerate(falas):
        dest = TMP / f"{i:03d}-{quem}.wav"
        if quem == "vinheta":
            vinheta(dest)
        elif quem == "todos":
            vs = []
            for q in ("clara", "marina", "bento", "tiao"):
                p = TMP / f"{i:03d}-coro-{q}.wav"; falar(q, txt, p); vs.append(p)
            ins = sum((["-i", str(v)] for v in vs), [])
            ff(*ins, "-filter_complex", "amix=inputs=4:normalize=0,volume=0.6", str(dest))
        else:
            falar(quem, txt, dest)
        partes += [dest, pausa]
        dur = float(subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",str(dest)],capture_output=True,text=True).stdout)
        linha.append({"quem": quem, "texto": txt, "ini": round(t0, 3), "fim": round(t0 + dur, 3), "wav": str(dest)}); t0 += dur + 0.35
        print(f"{i+1}/{len(falas)} {quem}", flush=True)
    lista = TMP / "lista.txt"; lista.write_text("".join(f"file '{p}'\n" for p in partes))
    saida = AQUI / os.environ.get("SAIDA", "mesa-redonda.mp3")
    ff("-f", "concat", "-safe", "0", "-i", str(lista), "-ac", "1", "-ar", str(SR), "-b:a", "96k",
       "-metadata", "title=Ambiental Inteligência — Especial Minas (teste)", "-metadata", "artist=O Analista Ambiental", str(saida))
    json.dump(linha, open(saida.with_suffix(".tempo.json"), "w"), ensure_ascii=False, indent=1)
    print(saida)


if __name__ == "__main__":
    main()
