// Pronúncia das siglas nas vozes sintéticas (radar/gerador/fonetica.py) e fechamento curto dos episódios.
// Curadoria de 12/11/2026: os termos e as grafias foram testados nas vozes Google Chirp 3 HD e conferidos com o Whisper.
// Uso: node _testes/radar-fonetica.mjs   (não precisa de servidor)
import { execFileSync } from "node:child_process";

let falhas = 0;
const ok = (c, m) => { if (!c) { falhas++; console.log("FALHA:", m); } else console.log("ok:", m); };

const py = `
import importlib.util, json, sys
def carrega(n, p):
    s = importlib.util.spec_from_file_location(n, p); m = importlib.util.module_from_spec(s); s.loader.exec_module(m); return m
fo = carrega("fonetica", "radar/gerador/fonetica.py")
ra = carrega("ra", "radar/gerador/radar_audio.py")
casos = ["Segundo o DOU de hoje, o IEF e o IDE-Sisema.", "O PISF e o ZEE.", "IEFX, ief, DOUrado e PISFA ficam como estão.",
         "Portaria IEF/Semad nº 3."]
print(json.dumps({
  "voz": [fo.para_voz(c) for c in casos],
  "ipa": [p["phrase"] for p in fo.pronuncias("O Sisema, a Feam, o Igam e o SOUT. Sistema e Feamx não.")],
  "fala": ra.para_fala("O IEF publicou no DOU."),
  "valores": list(fo.TEXTO.values()),
  "fecho": ra.FECHO, "fecho_auto": ra.FECHO_AUTO,
}, ensure_ascii=False))
`;
const r = JSON.parse(execFileSync("python3", ["-I", "-c", py], { encoding: "utf8" }).trim().split("\n").pop());

ok(r.voz[0] === "Segundo o D.O.U. de hoje, o I.E.F. e o I.D.E. Sisema.", `DOU, IEF e IDE-Sisema soletrados com pontos (${r.voz[0]})`);
ok(r.voz[1] === "O P.I.S.F. e o Z.E.E.", `PISF e ZEE soletrados (${r.voz[1]})`);
ok(r.voz[2] === "IEFX, ief, DOUrado e PISFA ficam como estão.", "não mexe dentro de outra palavra nem em minúsculas");
ok(r.voz[3] === "Portaria I.E.F./Semad nº 3.", `sigla junto de barra também muda (${r.voz[3]})`);
ok(JSON.stringify(r.ipa) === JSON.stringify(["Sisema", "Feam", "Igam", "SOUT"]), `IPA só para os termos presentes, palavra inteira (${r.ipa})`);
ok(r.fala === "O I.E.F. publicou no D.O.U.", `o gerador do episódio usa a grafia da voz (${r.fala})`);
// regressão 12/11/2026: nome de letra com acento ("éfe", "ésse", "é") a voz do Google lê como "e acento agudo"
ok(r.valores.every(v => !/(^|[\s.])(é|éfe|ésse|érre|éle|ême|êne)(?=[\s.]|$)/i.test(v)), "nenhuma grafia usa nome de letra com acento");
// fechamento curto (pedido de 12/11/2026): sem dizer que a voz é sintética, uma frase só
for (const [nome, f] of [["revisado", r.fecho], ["automático", r.fecho_auto]]) {
  ok(!/sint[ée]tic/i.test(f), `fechamento ${nome} não fala em voz sintética`);
  ok(f.split(/\s+/).length <= 20 && /texto oficial/.test(f), `fechamento ${nome} curto e manda conferir o texto oficial (${f.split(/\s+/).length} palavras)`);
}
console.log(falhas ? `${falhas} falha(s)` : "tudo certo");
process.exit(falhas ? 1 : 0);
