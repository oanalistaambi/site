#!/usr/bin/env bash
# Roda TODOS os testes do site (_testes/*.mjs) contra um servidor local, como o GitHub Pages.
# Uso: npm test   (ou: bash _testes/rodar-todos.sh)
# Sai com erro se qualquer teste falhar: é o que barra o PR no GitHub antes de publicar.
set -u
cd "$(dirname "$0")/.."
PORTA="${PORTA:-8765}"
export BASE="http://127.0.0.1:$PORTA"
servidor=""
if ! curl -s -o /dev/null "$BASE/"; then
  python3 -m http.server "$PORTA" --bind 127.0.0.1 >/dev/null 2>&1 &
  servidor=$!
  for _ in $(seq 1 30); do curl -s -o /dev/null "$BASE/" && break; sleep 0.3; done
fi
falhou=()
for t in _testes/*.mjs; do
  echo "== $t"
  if node "$t" > /tmp/teste-site.log 2>&1; then
    tail -n 1 /tmp/teste-site.log
  else
    grep -E "^FALHA|Error|erro" /tmp/teste-site.log | head -20
    falhou+=("$t")
  fi
done
[ -n "$servidor" ] && kill "$servidor" 2>/dev/null
echo
if [ ${#falhou[@]} -gt 0 ]; then
  echo "Testes com falha: ${falhou[*]}"
  exit 1
fi
echo "Todos os testes passaram."
