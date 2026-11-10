# Estúdio do Ambiental Inteligência (protótipo, 10/11/2026)

Ferramentas para gerar, sem custo, a mesa-redonda em áudio e a "pílula" em vídeo vertical a partir do Diário Oficial.
Nada de áudio ou vídeo fica no git (regra do repositório): os arquivos gerados vão para a pasta indicada em `BASE`/`SAIDA`.

- `especial-minas-2026-11-semana1.json`: roteiro da mesa-redonda (DOE-MG de 4 a 7/11/2026).
- `pilula-igam-18.json`: roteiro curto (Portaria IGAM 18/2026) com três vozes.
- `montar.py`: gera o áudio fala por fala (vozes neurais da Microsoft; Kokoro opcional) e o arquivo de tempos.
- `cena.html` + `render.mjs`: estúdio animado (personagens originais em vetor, boca sincronizada pela amplitude,
  cartões com os dados, legenda) renderizado quadro a quadro com Playwright e ffmpeg, em 1080×1920.
- `pronuncia.json`: glossário de pronúncia das vozes sintéticas.

Regras: dados normativos só do texto publicado, link para o ato oficial, aviso de que personagens e vozes são IA,
sem CPF ou CNPJ, sem voz clonada do dono.

## Narrativa com personagem (pasta `narrativa/`)

Vídeo vertical com a consultora Ana (personagem original, estilo "boneco"), cenas que mudam conforme a fala
(rio, cano de lançamento, celular com o Diário, estrada dos prazos, medição, alerta) e legenda que pinta a palavra falada.
`narrar.py` gera a narração cena a cena com o tempo de cada palavra; `anim.html` desenha as cenas; `render.mjs` grava o MP4.
Para outro ato: escrever novas cenas em `cenas-*.json` e, se preciso, novos desenhos em `anim.html`.

## Diálogo animado (pasta `dialogo/`)

Ana (consultora) e Seu Zé (operador da estação de esgoto) conversando, com vozes diferentes e boca sincronizada
pela voz de cada um. Personagens articulados (braços e pernas em dois segmentos, caminhada, piscar, humor no rosto),
cenário em camadas com câmera, capítulos na tela, esquema, quadro de prazos, checklist e resumo final.
Ordem: `vozes.py` (falas com tempo de cada palavra) → `linha.py` (linha do tempo, mixagem com trilha e som do rio) → `render.mjs`.
