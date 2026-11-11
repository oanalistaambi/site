// Regressão do gerador de episódios do DOU (radar/gerador/radar_audio.py), bugs de 11/11/2026:
// 1) o workflow criou um episódio automático de 09/11 com atos que já estavam no episódio revisado de 10/11;
// 2) com os 4 episódios mais recentes sem áudio, o feed do podcast ficou vazio.
// Uso: node _testes/radar-episodios.mjs   (não precisa de servidor)
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const GERADOR = process.env.GERADOR || "radar/gerador/radar_audio.py";
let falhas = 0;
const ok = (c, m) => { if (!c) { falhas++; console.log("FALHA:", m); } else console.log("ok:", m); };

const dir = mkdtempSync(join(tmpdir(), "episodios-"));
const ep = (data, links, audio) => ({
  id: `dou-${data}`, fonte: "dou", data, dia_semana: "", titulo: "teste", origem: "revisado",
  capitulos: [{ titulo: "Abertura", tema: null, atos: [], fala: "a" },
              { titulo: "x", tema: "t", atos: links.map(l => ({ titulo: "ato", link: l })), fala: "b" },
              { titulo: "Fechamento", tema: null, atos: [], fala: "c" }],
  audio, duracao_s: audio ? 60 : null,
});
// episódio antigo COM áudio + 4 mais recentes SEM áudio; o de 10/11 já traz o ato publicado na extra de 09/11
writeFileSync(join(dir, "dou-2026-11-04.json"), JSON.stringify(ep("2026-11-04", ["https://www.in.gov.br/a"], "radar/audios/dou-2026-11-04-x.mp3")));
writeFileSync(join(dir, "dou-2026-11-06.json"), JSON.stringify(ep("2026-11-06", ["https://www.in.gov.br/b"], null)));
writeFileSync(join(dir, "dou-2026-11-10.json"), JSON.stringify(ep("2026-11-10", ["https://www.in.gov.br/extra-de-09"], null)));
writeFileSync(join(dir, "dou-2026-11-11.json"), JSON.stringify(ep("2026-11-11", ["https://www.in.gov.br/c"], null)));
writeFileSync(join(dir, "dou-2026-11-12.json"), JSON.stringify(ep("2026-11-12", ["https://www.in.gov.br/d"], null)));

const py = `
import importlib.util, json, sys
s = importlib.util.spec_from_file_location("ra", sys.argv[1]); m = importlib.util.module_from_spec(s); s.loader.exec_module(m)
# o mesmo ato da edição extra de 09/11, que já está no episódio salvo de 10/11
ato = {"data": "2026-11-09", "orgao": "MPA", "tipo": "Portaria", "titulo": "Portaria de teste", "ementa": "Institui a plataforma de teste.",
       "trechos": {"vigencia": None, "revoga": None}, "link": "https://www.in.gov.br/extra-de-09", "referencia": "DOU"}
r = m.episodios_dou(None, sys.argv[2], "2026-11-12", [ato])
pagina, podcast = r if isinstance(r, tuple) else (r, [])
print(json.dumps({"pagina": [e["id"] for e in pagina], "podcast": [e["id"] for e in podcast]}))
`;
let res;
try {
  res = JSON.parse(execFileSync("python3", ["-I", "-c", py, GERADOR, dir], { encoding: "utf8" }).trim().split("\n").pop());
} catch (e) { ok(false, "o gerador roda sem erro (" + String(e.message).split("\n")[0] + ")"); res = { pagina: [], podcast: [] }; }
const arquivos = readdirSync(dir);
ok(!arquivos.includes("dou-2026-11-09.json"), "ato que já está num episódio salvo não gera outro episódio (sem duplicar 09/11)");
ok(JSON.stringify(res.pagina) === JSON.stringify(["dou-2026-11-12", "dou-2026-11-11", "dou-2026-11-10", "dou-2026-11-06"]), `página com os 4 mais recentes (${res.pagina})`);
ok(res.podcast.includes("dou-2026-11-04"), `podcast mantém o episódio mais recente com áudio, fora da página (${res.podcast})`);
ok(arquivos.includes("dou-2026-11-04.json"), "o arquivo do episódio com áudio não é apagado");
rmSync(dir, { recursive: true, force: true });
console.log(falhas ? `${falhas} falha(s)` : "tudo certo");
process.exit(falhas ? 1 : 0);
