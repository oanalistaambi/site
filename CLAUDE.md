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
