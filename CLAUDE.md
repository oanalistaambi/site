# Site oanalistaambiental.com — regras para toda sessão

HTML estático publicado pelo GitHub Pages a partir do `main` (domínio em `CNAME`). Sem build.
Fale com o dono (Francisco) sempre em português do Brasil.

## Testes: todo bug vira teste (regra de 10/11/2026)
- Antes de subir qualquer mudança: `npm test` (sobe um servidor local e roda todos os `_testes/*.mjs`).
  O mesmo roda no GitHub em todo PR (`.github/workflows/testes-site.yml`). Falhou, não mescle.
- **Corrigiu um bug? Crie antes um teste que reproduz o bug (falha), corrija, e veja o teste passar.**
  O teste fica em `_testes/` para o bug nunca voltar (teste de regressão).
- Regra nova de página ou ferramenta (cálculo, prazo, enquadramento) entra com o teste dela.
- `_testes/site-inteiro.mjs` abre TODAS as páginas no celular e no computador: HTTP 200, sem rolagem
  lateral, sem erro de JavaScript, título, descrição (50+ caracteres), idioma, og:image, alt nas imagens,
  links internos, imagem até 500 KB, menu do celular e o `sitemap.xml`. Página nova já entra sozinha.
- Pastas com `_` (como `_testes/`) não são publicadas.

## Conteúdo e arquivos
- Só dado público; nada de CPF, CNPJ, número de processo ou nome de empreendimento.
- Vídeo, áudio e pacote não entram no git (exceções em `.github/workflows/guarda-repositorio.yml`).
- Imagem nova: reduza antes (até 500 KB; a tela de celular pode ir a 720 px de largura).
- Página nova: título, descrição, `og:image`, `lang="pt-BR"` e entrada no `sitemap.xml`
  (ou `<meta name="robots" content="noindex">` se não for pública).
- Seja específico no pedido à IA e faça exatamente o que foi pedido; não "melhore" o que não foi pedido.

## Áudios do radar: regras do Francisco (24/11/2026), valem para todo áudio novo
- **Um formato só: `.ogg`.** O que for enviado ao Francisco vai só em `.ogg` (para o WhatsApp). Nada de mandar também `.mp3`.
  Se precisar enviar o episódio do podcast, converta com ffmpeg. No repositório o MP3 do episódio continua em `radar/audios/`, porque o feed do podcast exige.
- **Sem apresentação das vozes.** Nunca "eu sou a Clara", "eu sou o Bento". Abrir direto com o nome do programa e a edição ("Ambiental Inteligência, edição federal de ...").
- **Fechamento sem falar de IA.** Só: "Confira o texto oficial pelos links da página. Até a próxima!" (constante `FECHO` em `radar/gerador/radar_audio.py`).
  O aviso de que o resumo e as vozes são de IA continua escrito na página `radar-audio.html`; o áudio não repete.
- **Crédito do ElevenLabs:** só gravar quando o Francisco pedir. Em 24/11/2026 ele pediu pausa: "por hora não faça nada, nem gaste os créditos". A rotina diária está em pausa até ele liberar.
  Vozes Google (Clara e Bento, `radar/estudio/dupla/dupla.py` + glossário `radar/gerador/fonetica.py`) são a alternativa sem custo do ElevenLabs.
- **Filtro sindical (SINDSEMA):** o relatório semanal roda toda sexta, perto das 17h (agendamento "Filtro sindical semanal"), com áudio curto só se houver ato ALTO ou MÉDIO.
  O Francisco ainda não viu o áudio sindical porque a primeira rodada é na sexta 27/11/2026. Não esquecer. Este repositório é PÚBLICO: nada do filtro sindical (notas, registro, nomes) vai para cá.
- **Pasta temporária da sessão é apagada** sem aviso: scripts e o venv do Whisper somem. Tudo que precisa durar fica no repositório (como o `dupla.py`).
- **Github Actions:** em 16/11/2026 os checks passaram a falhar em 2 s sem runner (conta bloqueada). Enquanto for assim, o PR não é mesclado por mim; o Francisco mescla.
