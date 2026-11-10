"""Vozes do Google (Chirp 3 HD) + tempo de cada palavra por alinhamento com o Whisper."""
import json, os, base64, urllib.request, re, difflib, unicodedata, numpy as np, subprocess
from faster_whisper import WhisperModel
K = os.environ["GOOGLE_TTS_API_KEY"]
VOZ = {"ana": ("pt-BR-Chirp3-HD-Callirrhoe", 1.0), "ze": ("pt-BR-Chirp3-HD-Algenib", 0.96), "lambi": ("pt-BR-Chirp3-HD-Leda", 1.1)}
GLOSSARIO = {"SOUT": "ˈsowtʃi"}  # pronúncia fonética (IPA) testada: sem isso a voz soletra "S-O-U-T"
def sint(txt, q, dest):
    nome, vel = VOZ[q]
    pron = [{"phrase": k, "phoneticEncoding": "PHONETIC_ENCODING_IPA", "pronunciation": v} for k, v in GLOSSARIO.items() if k in txt]
    body = {"input": {"text": txt, **({"customPronunciations": {"pronunciations": pron}} if pron else {})}, "voice": {"languageCode": "pt-BR", "name": nome}, "audioConfig": {"audioEncoding": "LINEAR16", "sampleRateHertz": 44100, "speakingRate": vel}}
    req = urllib.request.Request("https://texttospeech.googleapis.com/v1/text:synthesize", data=json.dumps(body).encode(), headers={"X-Goog-Api-Key": K, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=90) as r: open(dest, "wb").write(base64.b64decode(json.load(r)["audioContent"]))
def norm(w):
    w = unicodedata.normalize("NFKD", w.lower()); return "".join(c for c in w if not unicodedata.combining(c) and c.isalnum())
m = WhisperModel("medium", compute_type="int8")
d = json.load(open("dialogo.json")); k = 0; chars = 0
for c in d:
    for f in c["falas"]:
        q, txt = f[0], f[1]; quem = ["ana", "ze", "lambi"] if q == "todos" else [q]
        arqs = []
        for qq in quem:
            dest = f"f{k:02d}-{qq}.wav"; sint(txt, qq, dest); arqs.append(dest); chars += len(txt)
        if q == "todos":
            subprocess.run(["ffmpeg","-loglevel","error","-y",*sum([["-i",a] for a in arqs],[]),"-filter_complex",f"amix=inputs={len(arqs)}:normalize=0,volume=0.75",f"f{k:02d}.wav"],check=True)
        else: os.replace(arqs[0], f"f{k:02d}.wav")
        a = np.frombuffer(subprocess.run(["ffmpeg","-loglevel","error","-i",f"f{k:02d}.wav","-ac","1","-ar","16000","-f","f32le","-"],capture_output=True).stdout, np.float32)
        segs, _ = m.transcribe(a, language="pt", word_timestamps=True, initial_prompt="Igam, SOUT, Lambi, Seu Zé, outorga, efluente.")
        ws = [(w.start, w.end, w.word.strip()) for s in segs for w in s.words]
        tok = txt.split(); A = [norm(t) for t in tok]; B = [norm(w[2]) for w in ws]
        tempo = [None] * len(tok)
        for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, A, B).get_opcodes():
            if op == "equal":
                for i, j in zip(range(i1, i2), range(j1, j2)): tempo[i] = [ws[j][0], ws[j][1]]
            elif j2 > j1 and i2 > i1:  # trecho diferente (ex.: números): reparte o tempo do trecho
                t0, t1 = ws[j1][0], ws[j2 - 1][1]; n = i2 - i1
                for x, i in enumerate(range(i1, i2)): tempo[i] = [t0 + (t1 - t0) * x / n, t0 + (t1 - t0) * (x + 1) / n]
        dur = len(a) / 16000; last = 0.0
        for i in range(len(tok)):  # preenche lacunas
            if tempo[i] is None:
                nxt = next((tempo[j][0] for j in range(i + 1, len(tok)) if tempo[j]), dur); tempo[i] = [last, (last + nxt) / 2]
            last = tempo[i][1]
        f.append([[t[0], t[1], tok[i]] for i, t in enumerate(tempo)]); f.append(f"f{k:02d}.wav"); k += 1
        print(k, q, round(dur, 1), "s", flush=True)
json.dump(d, open("dialogo.t.json", "w"), ensure_ascii=False)
print("caracteres:", chars)
