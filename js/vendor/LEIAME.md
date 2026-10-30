# Bibliotecas de terceiros (servidas pelo próprio site)

Usadas só pela página `memorial-geo.html` para ler PDF e foto no navegador. Nada é enviado a
servidor. Depois do primeiro uso, o service worker (`memorial-geo-sw.js`) guarda estes arquivos para
a leitura funcionar sem internet. As pastas levam a versão no nome: arquivo publicado não muda.

| Pasta | Pacote (npm) | Licença | O que tem |
|---|---|---|---|
| `pdfjs-6.4.299/` | `pdfjs-dist@6.4.299` (Mozilla pdf.js), build `legacy` | Apache 2.0 (`LICENSE`) | leitura do texto do PDF e desenho da página para o OCR; `wasm/` decodifica JBIG2, JPEG 2000 e cores (licenças em `wasm/`) |
| `tesseract-7.0.0/` | `tesseract.js@7.0.0` | Apache 2.0 (`LICENSE.md`) | OCR (reconhecimento de texto em imagem) |
| `tesseract-7.0.0/core/` | `tesseract.js-core@7.0.0`, só as versões LSTM | Apache 2.0 (`core/LICENSE`) | o motor Tesseract em WebAssembly (o navegador baixa só uma das três versões) |
| `tesseract-7.0.0/lang/` | `@tesseract.js-data/por@1.0.0`, `4.0.0_best_int` | Apache 2.0 (tessdata) | modelo do português |

Para trocar de versão: crie uma pasta nova com a versão no nome e mude os caminhos em
`js/memorial-geo-arquivo.js`.
