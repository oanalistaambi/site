// Testes do motor js/memorial-geo.js: os mesmos casos do app Chão Geo MG (MemorialRumoTest.kt,
// ConferenciaPoligonalTest.kt e UtmTest.kt) e os formatos novos da página (tabela simples, rumo solto,
// lat/long de partida, KML, GeoJSON e shapefile).
// Uso: node _testes/memorial-geo-calculo.mjs
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const M = require("../js/memorial-geo.js");

let falhas = 0;
const ok = (c, m) => { if (!c) { falhas++; console.log("FALHA:", m); } else console.log("ok:", m); };
const perto = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- MemorialRumoTest.rumoViraAzimutePorQuadrante
ok(perto(M.azimuteDeRumo("NE", 45.5), 45.5), "rumo NE 45,5° = azimute 45,5°");
ok(perto(M.azimuteDeRumo("SE", 44.5), 135.5), "rumo SE 44,5° = azimute 135,5°");
ok(perto(M.azimuteDeRumo("SO", 44.5), 224.5), "rumo SO 44,5° = azimute 224,5°");
ok(perto(M.azimuteDeRumo("NW", 45.0), 315.0), "rumo NW 45° = azimute 315°");

// ---- Quadrado de 100 m descrito por azimute, rumo e grau decimal, com vírgula na distância.
const memorial = `Inicia-se no vértice ABCD-M-0001, de coordenadas E 612.000,00 m e N 7.795.000,00 m,
Meridiano Central nº 45 WGr, SIRGAS 2000; deste segue com azimute plano de 90°00'00" e
distância de 100,00 m até o vértice ABCD-M-0002; deste segue com rumo S 00°00'00" E e
distância de 100,00 m até ABCD-M-0003; deste segue com Az. 270,0000° e distância de
100,00 m até ABCD-M-0004; deste segue com azimute 0°00'00" e distância de 100,00 metros
até o vértice inicial.`;

{ // ladosSaoLidosNaOrdemComDistancia
  const ls = M.lados(M.normalizar(memorial));
  ok(igual(ls.map(l => l.azimuteGraus), [90, 180, 270, 0]), "lados lidos na ordem: 90, 180, 270, 0");
  ok(ls.every(l => perto(l.distanciaM, 100)), "todas as distâncias = 100 m");
}
{ // poligonalFechaEReconheceFusoECodigoSigef
  const r = M.analisar(memorial);
  ok(r.poligonal && r.poligonal.vertices.length === 4, "poligonal com 4 vértices");
  ok(/fecha exato/.test(M.resumoFechamento(r.poligonal)), "resumo: fecha exato");
  ok(r.poligonal.nomes[0] === "ABCD-M-0001", "nome do vértice de partida: ABCD-M-0001 (" + r.poligonal.nomes[0] + ")");
  ok(r.poligonal.nomes[2] === "ABCD-M-0003", "nome do 3º vértice sem a palavra 'vértice': ABCD-M-0003 (" + r.poligonal.nomes[2] + ")");
  ok(r.partida.fuso === 23 && r.fusoTexto === 23, "fuso 23 pelo Meridiano Central 45 WGr");
  ok(perto(r.poligonal.vertices[1][0], 612100, 1e-6), "E do 2º vértice = 612.100");
  ok(perto(r.poligonal.areaM2, 10000, 1e-6), "área = 1 ha");
  ok(r.datum === "SIRGAS 2000", "datum SIRGAS 2000");
}
{ // erroDeFechamentoEPrecisaoRelativa
  const ls = [0, 90, 180, 270].map(a => M.lado(a, 100, false, 0));
  ls[3] = M.lado(270, 99.5, false, 0);
  const p = M.percorrer(0, 0, ls);
  ok(perto(p.erroFechamentoM, 0.5), "erro de fechamento 0,5 m");
  ok(perto(p.precisaoRelativa, 799, 1e-6), "precisão relativa 1:799");
  ok(M.qualidadeFechamento(p).nivel === "ruim", "1:799 é fechamento ruim");
  ok(M.resumoFechamento(p) === "Fechamento: 0,50 m em 399,50 m de perímetro (1:799)", "resumo do fechamento como no app");
}
// Tabela como a do SIGEF: "Distância (m)" só no cabeçalho; latitude e longitude negativas.
const tabelaSigef = `Código | Longitude | Latitude | Altitude (m) | Código | Azimute | Distância (m)
ABCD-M-0001 -44°01'10,123" -19°52'30,456" 850,12 ABCD-M-0002 90°00'00" 100,00
ABCD-M-0002 -44°01'06,700" -19°52'30,456" 851,00 ABCD-M-0003 180°00'00" 100,00
ABCD-M-0003 -44°01'06,700" -19°52'33,700" 849,50 ABCD-M-0004 270°00'00" 100,00
ABCD-M-0004 -44°01'10,123" -19°52'33,700" 848,70 ABCD-M-0001 0°00'00" 100,00`;
{ // tabelaDeAzimutesSemUnidadeNaDistancia
  const ls = M.lados(M.normalizar(tabelaSigef));
  ok(igual(ls.map(l => l.azimuteGraus), [90, 180, 270, 0]), "tabela SIGEF: azimutes 90, 180, 270, 0");
  ok(ls.every(l => perto(l.distanciaM, 100)), "tabela SIGEF: distâncias 100 m");
  ok(perto(M.percorrer(0, 0, ls).erroFechamentoM, 0, 1e-6), "tabela SIGEF fecha");
  const r = M.analisar(tabelaSigef);
  ok(r.partidaLida && r.partidaLida.origem === "geo" && perto(r.partidaLida.lat, -(19 + 52 / 60 + 30.456 / 3600), 1e-9), "tabela SIGEF: partida em lat/long (-19°52'30,456\")");
  ok(r.partida.fuso === 23, "tabela SIGEF: fuso 23 pela longitude");
}
{ // tabelaUtmComLatitudeEmHemisferioNaoConfundeAzimute
  const t = `Vértice  E (m)  N (m)  Azimute  Distância (m)
P1  612.000,00  7.795.000,00  45°30'00"  1.234,56
P2  19°52'30" S  44°01'10" W  135°00'00"  12,5
P3  612.100,00  7.794.900,00  225°00'00"  80`;
  const ls = M.ladosDeTabela(M.normalizar(t));
  ok(igual(ls.map(l => l.azimuteGraus), [45.5, 135, 225]), "latitude com hemisfério não vira azimute nem rumo");
  ok(igual(ls.map(l => l.distanciaM), [1234.56, 12.5, 80]), "distâncias 1.234,56 / 12,5 / 80");
}
// semCabecalhoDeTabelaNaoLeLinhasSoltas
ok(M.ladosDeTabela('P1 45°30\'00" 100,00\nP2 90°00\'00" 50').length === 0, "sem cabeçalho a tabela não lê linhas soltas");
ok(M.lados('P1 45°30\'00" 100,00\nP2 90°00\'00" 50\nP3 180° 20').length === 0, "linha solta separada por espaço também não vale como tabela simples");

// ---- ConferenciaPoligonalTest: área escrita em vários formatos
ok(perto(M.areaEmM2("2,35 ha"), 23500, 1e-6), "2,35 ha");
ok(perto(M.areaEmM2("1.190,90 m²"), 1190.9, 1e-6), "1.190,90 m²");
ok(perto(M.areaEmM2("1.314 m²"), 1314, 1e-6), "1.314 m²");
ok(perto(M.areaEmM2("516.68 m²"), 516.68, 1e-6), "516.68 m²");
ok(perto(M.areaEmM2("9.1202 ha"), 91202, 1e-6), "9.1202 ha");
ok(perto(M.areaEmM2("22,0347 hectares"), 220347, 1e-6), "22,0347 hectares");

// ---- UtmTest: pontos conhecidos de MG e ida e volta
{
  const bh = M.projetar(-19.9167, -43.9345);
  ok(perto(bh.e, 611520.35, 0.5) && perto(bh.n, 7797383.36, 0.5) && bh.zona === 23, "UTM de BH (23S)");
  const udi = M.projetar(-18.9186, -48.2772);
  ok(perto(udi.e, 786799.30, 0.5) && perto(udi.n, 7905968.60, 0.5) && udi.zona === 22, "UTM de Uberlândia (22S)");
  const gv = M.projetar(-18.8511, -41.9494);
  ok(perto(gv.e, 189191.55, 0.5) && perto(gv.n, 7913061.47, 0.5) && gv.zona === 24, "UTM de Gov. Valadares (24S)");
  const [la, lo] = M.inverter(bh.e, bh.n, 23, true);
  ok(perto(la, -19.9167, 1e-8) && perto(lo, -43.9345, 1e-8), "UTM → lat/long volta ao ponto");
}

// ---- Formatos novos da página
{ // tabela simples: V1; azimute; distância (e rumo na coluna)
  const t = `E=612000,00 N=7795000,00 fuso 23
V1; 90°00'00"; 100,00
V2; S 0° E; 100
V3; 270°; 100,0 m
V4; N 0°00'00" W; 100`;
  const r = M.analisar(t);
  ok(r.lados.length === 4 && igual(r.lados.map(l => l.azimuteGraus), [90, 180, 270, 0]), "tabela simples com ';' e rumo na coluna");
  ok(igual(r.poligonal.nomes, ["V1", "V2", "V3", "V4"]), "nomes vindos da 1ª coluna");
  ok(perto(r.poligonal.erroFechamentoM, 0, 1e-6), "tabela simples fecha");
}
{ // tabela em markdown que uma IA devolve, com coluna de página
  const t = `Partida: E 612.000,00 m, N 7.795.000,00 m, fuso 23 S, SIRGAS 2000
| Vértice | Azimute ou rumo | Distância (m) | Página |
|---|---|---|---|
| V1 | 45°00'00" | 141,42 | 2 |
| V2 | S 45°00'00" E | 141,42 | 2 |
| V3 | 225°00'00" | 141,42 | 3 |
| V4 | N 45° W | 141,42 | 3 |`;
  const r = M.analisar(t);
  ok(igual(r.lados.map(l => +l.azimuteGraus.toFixed(6)), [45, 135, 225, 315]), "tabela markdown da IA: 45, 135, 225, 315");
  ok(perto(r.poligonal.areaM2, 141.42 * 141.42, 0.01), "tabela markdown: área ≈ 2 ha");
}
{ // rumo solto no texto corrido ("S 12° W") e "N 45°30' E"
  const t = `Ponto de partida de coordenadas N 7.800.000,000 m e E 600.000,000 m (UTM, fuso 23K). Daí segue N 45°30' E,
na distância de 200,00 m; daí, S 44°30' E, 200,00 m; daí S 45°30' W, 200,00 m; daí N 44°30' W, 200,00 m, ao ponto de partida.`;
  const r = M.analisar(t);
  ok(r.lados.length === 4 && r.lados.every(l => l.deRumo), "quatro rumos soltos reconhecidos");
  ok(perto(r.lados[0].azimuteGraus, 45.5) && perto(r.lados[2].azimuteGraus, 225.5), "N 45°30' E = 45,5°; S 45°30' W = 225,5°");
  ok(perto(r.partida.e, 600000) && perto(r.partida.n, 7800000) && r.partida.fuso === 23, "partida com N antes do E e fuso 23K");
  ok(r.poligonal.erroFechamentoM < 1e-6, "quadrado por rumos fecha");
}
{ // fuso não escrito: deduzido pelo que cai em MG, com aviso
  const r = M.analisar(`Vértice inicial de coordenadas E 612.000,00 m e N 7.795.000,00 m; azimute 90° e 10 m; azimute 180° e 10 m; azimute 270° e 10 m; azimute 0° e 10 m.`);
  ok(r.partida.fuso === 22 && r.avisos.some(a => /fusos 22 e 23/.test(a)), "fuso não escrito: cabe em 22 e 23, fica o primeiro (22, como no app) com aviso para escolher");
}
{ // SAD 69 recebe aviso, sem conversão
  const r = M.analisar(memorial.replace("SIRGAS 2000", "SAD 69"));
  ok(r.datum === "SAD 69" && r.avisos.some(a => /SAD 69.*sem converter/.test(a)), "SAD 69: aviso sem conversão");
  ok(perto(r.partida.e, 612000), "SAD 69: coordenada mantida como está");
}
{ // partida e fuso trocados pela pessoa
  const r = M.analisar(memorial, { e: 500000, n: 8000000, fuso: 22 });
  ok(r.partida.fuso === 22 && perto(r.poligonal.vertices[1][0], 500100), "partida e fuso informados na mão valem");
}
{ // área escrita confere; lados cruzados avisam
  const r = M.analisar(memorial + " Área total: 1,0000 ha.");
  ok(r.conferencias.some(c => c.nivel === "ok" && /Confere com a área escrita/.test(c.texto)), "área escrita confere");
  const cruz = M.analisar(memorial.replace('rumo S 00°00\'00" E', "azimute 225°00'00\""));
  ok(cruz.conferencias.some(c => /se cruzam/.test(c.texto)) || cruz.poligonal.qualidade.nivel === "ruim", "lado trocado é apontado");
  ok(M.ladosQueSeCruzam([[0, 0], [10, 10], [10, 0], [0, 10]]).length > 0, "gravata (lados cruzados) detectada");
  ok(M.ladosQueSeCruzam([[0, 0], [10, 0], [10, 10], [0, 10]]).length === 0, "quadrado sem cruzamento");
}
{ // sem lados ou sem partida: erro claro
  ok(/Nenhum lado/.test(M.analisar("texto qualquer").erro), "sem lados: mensagem clara");
  ok(/coordenada de partida/.test(M.analisar('azimute 90° e 10 m; azimute 180° e 10 m; azimute 270° e 10 m').erro), "sem partida: pede E, N e fuso");
}
{ // números
  ok(M.numeroMetrico("7.812.345") === 7812345 && M.numeroMetrico("612345.678") === 612345.678 && M.numeroMetrico("1.234,56") === 1234.56, "números no padrão do memorial");
  ok(M.dms(120.258333333) === "120°15'30\"" && M.dms(359.99999) === "0°00'00\"", "azimute em graus, minutos e segundos");
}

// ---- Memorial por coordenadas (porte de ExtratorDocumento.sequencias e ConferenciaPoligonal)
const reservaLegal = `Reserva Legal (UTM SIRGAS 2000, fuso 23)
Inicia-se no vértice V1 de coordenadas E 610.000,00 m e N 7.800.000,00 m;
deste segue até o vértice V2 de coordenadas E 610.100,00 m e N 7.800.000,00 m;
deste segue até o vértice V3 de coordenadas E 610.100,00 m e N 7.800.100,00 m;
deste segue até o vértice V4 de coordenadas E 610.000,00 m e N 7.800.100,00 m;
deste segue até o vértice V1 de coordenadas E 610.000,00 m e N 7.800.000,00 m, ponto inicial.
Área total da reserva: 1,0000 ha.`;
{ // ConferenciaPoligonalTest: memorial fechado confere com a área escrita
  const r = M.analisar(reservaLegal);
  ok(igual(r.fontes, ["coordenadas"]) && r.poligonal.vertices.length === 4, "memorial por coordenadas: 4 vértices, sem repetir o inicial");
  ok(r.conferencias.some(c => c.nivel === "ok" && /volta ao vértice inicial/.test(c.texto)), "volta ao vértice inicial");
  ok(r.conferencias.some(c => c.nivel === "ok" && /Confere com a área escrita/.test(c.texto)), "confere com a área escrita (1 ha)");
  ok(perto(r.poligonal.lados[0].distanciaM, 100, 0.01) && perto(r.poligonal.lados[3].distanciaM, 100, 0.01), "lados de 100 m, o último fecha o anel");
  ok(r.poligonal.erroFechamentoM === null && /sem erro de fechamento/.test(M.resumoFechamento(r.poligonal)), "por coordenadas não há erro de fechamento a calcular");
  ok(igual(r.poligonal.nomes, ["V1", "V2", "V3", "V4"]), "nomes dos vértices lidos do texto");
}
{ // ConferenciaPoligonalTest: dígito trocado vira salto apontado e lados cruzados são avisados
  const errado = reservaLegal.replace("N 7.800.100,00 m;\ndeste segue até o vértice V4", "N 7.808.100,00 m;\ndeste segue até o vértice V4");
  ok(M.analisar(errado).conferencias.some(c => /V3 parece fora do lugar/.test(c.texto)), "vértice com dígito trocado: V3 parece fora do lugar");
  const cruzado = reservaLegal.replace("E 610.100,00 m e N 7.800.100,00 m;\ndeste segue até o vértice V4 de coordenadas E 610.000,00 m",
    "E 610.000,00 m e N 7.800.100,00 m;\ndeste segue até o vértice V4 de coordenadas E 610.100,00 m");
  ok(M.analisar(cruzado).conferencias.some(c => /se cruzam/.test(c.texto)), "vértices fora de ordem: lados se cruzam");
}
{ // tabela só de coordenadas, linhas curtas (cada linha a menos de 40 caracteres da outra)
  const r = M.analisar(`Vértice | E (m) | N (m)
V1 | 610.000,00 | 7.800.000,00
V2 | 610.100,00 | 7.800.000,00
V3 | 610.100,00 | 7.800.100,00
V4 | 610.000,00 | 7.800.100,00
Coordenadas UTM, SIRGAS 2000, fuso 23 S.`);
  ok(r.fonte === "coordenadas" && perto(r.poligonal.areaM2, 10000, 1e-6), "tabela só de coordenadas: 1 ha");
}
{ // tabela da IA com coordenadas e azimute: as duas leituras, comparadas
  const t = `Partida: E 610.000,00 m, N 7.800.000,00 m, fuso 23, SIRGAS 2000
| Vértice | E (m) | N (m) | Azimute ou rumo | Distância (m) | Página |
|---|---|---|---|---|---|
| V1 | 610.000,00 | 7.800.000,00 | 90°00'00" | 100,00 | 2 |
| V2 | 610.100,00 | 7.800.000,00 | N 0° E | 100,00 | 2 |
| V3 | 610.100,00 | 7.800.100,00 | 270°00'00" | 100,00 | 3 |
| V4 | 610.000,00 | 7.800.100,00 | S 0° E | 100,00 | 3 |`;
  const r = M.analisar(t);
  ok(igual(r.fontes, ["azimute", "coordenadas"]) && r.fonte === "azimute" && r.outra.fonte === "coordenadas", "tabela com coordenadas e azimute: duas leituras");
  ok(r.conferencias.some(c => /maior diferença é de 0,00 m/.test(c.texto)), "as duas leituras conferem vértice a vértice");
  ok(M.analisar(t, { fonte: "coordenadas" }).poligonal.fonte === "coordenadas", "a pessoa escolhe desenhar pelas coordenadas");
}
{ // tabela SIGEF (lat/long por vértice): leitura pelas coordenadas
  const r = M.analisar(tabelaSigef, { fonte: "coordenadas" });
  ok(r.poligonal.vertices.length === 4 && r.poligonal.nomes[0] === "ABCD-M-0001" && r.poligonal.nomes[3] === "ABCD-M-0004", "tabela SIGEF: 4 vértices com o código de cada um");
}
ok(M.analisar(memorial).fontes.length === 1, "memorial só com a partida em coordenada não vira memorial por coordenadas");

// ---- Diagnóstico do fechamento
const exemplo = JSON.parse(readFileSync(new URL("../memorial-geo.html", import.meta.url), "utf8").match(/var EXEMPLO = (".*?");\n/)[1]);
{
  const base = M.analisar(exemplo);
  ok(base.poligonal.qualidade.nivel === "ok" && !base.diagnostico, "exemplo fecha bem e não pede diagnóstico");
  const casos = [
    ["742,69", "724,69", "distancia", h => perto(h.proposta.d, 742.69, 1e-6) && /invertidos/.test(h.como), "distância com dois dígitos invertidos"],
    ["875,47", "75,47", "distancia", h => perto(h.proposta.d, 875.47, 1e-6) && /faltando/.test(h.como), "distância com um dígito faltando"],
    ["67°58'10\"", "76°58'10\"", "angulo", h => M.dms(h.proposta.az) === "67°58'10\"", "azimute com graus invertidos"],
    ["rumo S 79°30'52\" E", "rumo N 79°30'52\" E", "quadrante", h => M.rumoTexto(h.proposta.az) === "S 79°30'52\" E", "rumo com quadrante trocado"],
  ];
  for (const [de, para, tipo, confere, rot] of casos) {
    const r = M.analisar(exemplo.replace(de, para));
    const h = r.diagnostico && r.diagnostico.hipoteses[0];
    ok(r.poligonal.qualidade.nivel !== "ok" && h && h.tipo === tipo && confere(h) && h.precisaoDepois > 100000, `diagnóstico: ${rot} (${h ? M.textoHipotese(h) : "nada"})`);
  }
  const semLado = M.analisar(exemplo.replace(/; deste, segue com azimute de [^;]*?até o vértice V-12/, ""));
  ok(semLado.diagnostico.hipoteses.length === 0 && perto(semLado.diagnostico.faltante.d, 630.06, 0.05) && M.dms(semLado.diagnostico.faltante.az) === "133°07'40\"",
    "lado que faltou: o vetor de fechamento dá o lado (133°07'40\", 630 m)");
  // Correção só para teste: muda o cálculo, não o texto, e fica avisada.
  const errado = exemplo.replace("742,69", "724,69");
  const h = M.analisar(errado).diagnostico.hipoteses[0];
  const t = M.analisar(errado, { correcoes: [{ lado: h.lado, az: h.proposta.az, d: h.proposta.d }] });
  ok(t.poligonal.qualidade.nivel === "ok" && t.conferencias.some(c => /Correção só para teste/.test(c.texto)) && /teste/.test(t.poligonal.correcaoDeTeste),
    "testar a correção faz fechar e deixa o aviso");
  ok(/"correcao_de_teste": "Correção só para teste/.test(M.geojson(t.poligonal, "x")) && /TESTE/.test(new TextDecoder().decode(M.shapefile(t.poligonal, "x").dbf)),
    "arquivos de uma correção em teste dizem que é teste");
  const rep = M.analisar(`E=612000,00 N=7795000,00 fuso 23\nV1; 90°; 100\nV2; 180°; 100\nV2; 180°; 100\nV3; 270°; 100\nV4; 0°; 100`);
  ok(rep.diagnostico.hipoteses.some(h => h.tipo === "extra"), "lado repetido aparece como lido a mais");
  const tira = rep.diagnostico.hipoteses.find(h => h.tipo === "extra");
  ok(M.analisar(`E=612000,00 N=7795000,00 fuso 23\nV1; 90°; 100\nV2; 180°; 100\nV2; 180°; 100\nV3; 270°; 100\nV4; 0°; 100`, { correcoes: [{ lado: tira.lado, remover: true }] }).poligonal.erroFechamentoM < 1e-6,
    "tirar o lado repetido fecha a poligonal");
  ok(Object.keys(M.variacoesDigitos("12.5")).includes("21.5") && Object.keys(M.variacoesDigitos("12.5")).includes("2.5") && Object.keys(M.variacoesDigitos("12.5")).includes("102.5"),
    "variações de dígitos: invertido, a mais e a menos");
}

// ---- CSV, DXF e memorial em texto
{
  const p = M.analisar(exemplo).poligonal;
  const c = M.csv(p).split("\r\n");
  ok(c[0] === "\uFEFFvertice;e_m;n_m;latitude;longitude;azimute_ate_o_proximo;azimute_graus_decimais;distancia_ate_o_proximo_m" && c.length === 32 && /^V-01;452318,400;7912640,250;-18,8777/.test(c[1]), "CSV: cabeçalho, 30 vértices, vírgula decimal");
  ok(c[1].split(";")[5] === `"354°52'30"""` && c[1].split(";")[6] === "354,875000", "CSV: azimute com aspas escapadas (RFC 4180) e em grau decimal");
  const d = M.dxf(p, "Fazenda Vereda do Exemplo (fictícia)").split("\r\n");
  const cont = k => d.filter((x, i) => i % 2 === 1 && x === k && d[i - 1] === "0").length;
  ok(d.includes("AC1009") && cont("POLYLINE") === 1 && cont("VERTEX") === 30 && cont("POINT") === 30 && cont("TEXT") === 30 && d[d.length - 2] === "EOF", "DXF R12: polilinha fechada, 30 vértices, pontos e nomes");
  ok(d[d.indexOf("POLYLINE") + 11] === "70" && d[d.indexOf("POLYLINE") + 12] === "1", "DXF: polilinha marcada como fechada");
  ok(!/[^\x00-\x7e\r\n]/.test(M.dxf(p, "Fazenda Vereda (fictícia)")), "DXF só em ASCII");
  const t = M.memorialTexto(p, "Fazenda Vereda do Exemplo (fictícia)");
  ok(/^MEMORIAL DESCRITIVO RECONSTRUÍDO/.test(t) && /Não é memorial de levantamento/.test(t) && /fuso 23 S/.test(t), "memorial em texto: cabeçalho e limite");
  for (const fonte of ["azimute", "coordenadas"]) {
    const r2 = M.analisar(t, { fonte });
    let maior = 0;
    r2.poligonal.vertices.forEach((v, i) => { maior = Math.max(maior, Math.hypot(v[0] - p.vertices[i][0], v[1] - p.vertices[i][1])); });
    ok(r2.poligonal.vertices.length === 30 && maior < 0.01 && perto(r2.poligonal.areaM2, p.areaM2, p.areaM2 * 1e-5), `memorial em texto relido pelos ${fonte === "azimute" ? "lados" : "coordenadas"}: mesmo polígono (dif. ${maior.toFixed(4)} m)`);
  }
  const ruim = M.analisar(exemplo.replace("742,69", "724,69")).poligonal;
  ok(M.analisar(M.memorialTexto(ruim, "x")).lados.length === 30, "a frase do fechamento ruim não vira lado ao reler");
}

// ---- Exportação
{
  const r = M.analisar(memorial);
  const g = JSON.parse(M.geojson(r.poligonal, "Teste"));
  const anel = g.features[0].geometry.coordinates[0];
  ok(g.type === "FeatureCollection" && anel.length === 5 && igual(anel[0], anel[4]), "GeoJSON: anel fechado");
  let s = 0; for (let i = 0; i < anel.length - 1; i++) s += (anel[i + 1][0] - anel[i][0]) * (anel[i + 1][1] + anel[i][1]);
  ok(s < 0, "GeoJSON: anel externo anti-horário (RFC 7946)");
  ok(g.features.length === 5 && g.features[1].properties.vertice === "ABCD-M-0001", "GeoJSON: vértices como pontos");
  const k = M.kml(r.poligonal, "Teste <&>");
  ok(/<kml xmlns="http:\/\/www.opengis.net\/kml\/2.2">/.test(k) && /<LinearRing><coordinates>/.test(k) && /Teste &lt;&amp;&gt;/.test(k), "KML válido e com texto escapado");
  const shp = M.shapefile(r.poligonal, "Teste");
  const dv = new DataView(shp.shp.buffer);
  ok(dv.getInt32(0, false) === 9994 && dv.getInt32(32, true) === 5 && dv.getInt32(24, false) * 2 === shp.shp.length, "SHP: cabeçalho, tipo polígono e tamanho");
  ok(dv.getInt32(100 + 8 + 4 + 32 + 4, true) === 5, "SHP: 5 pontos no anel (fechado)");
  ok(new DataView(shp.shx.buffer).getInt32(100, false) === 50 && shp.shx.length === 108, "SHX: índice do registro");
  ok(shp.dbf[0] === 3 && new DataView(shp.dbf.buffer).getUint32(4, true) === 1 && shp.dbf[shp.dbf.length - 1] === 0x1a, "DBF: uma linha");
  ok(/SIRGAS_2000_UTM_Zone_23S/.test(new TextDecoder().decode(shp.prj)) && /Central_Meridian",-45.0/.test(new TextDecoder().decode(shp.prj)), "PRJ: SIRGAS 2000 / UTM 23S, MC -45");
  const z = M.shapefileZip(r.poligonal, "Teste", "teste");
  const nomes = []; let o = 0; const dz = new DataView(z.buffer);
  while (dz.getUint32(o, true) === 0x04034b50) { const n = dz.getUint16(o + 26, true), t = dz.getUint32(o + 18, true); nomes.push(new TextDecoder().decode(z.slice(o + 30, o + 30 + n))); o += 30 + n + t; }
  ok(igual(nomes, ["teste.shp", "teste.shx", "teste.dbf", "teste.prj"]), "ZIP: os quatro arquivos");
  ok(M.crc32(new TextEncoder().encode("123456789")) === 0xcbf43926, "CRC-32 de referência");
  ok(M.epsg(23) === 31983, "EPSG 31983 = SIRGAS 2000 / UTM 23S");
}

console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
