#!/bin/bash
# Dois cliques para abrir o Sistema Blatt no navegador (Mac).
cd "$(dirname "$0")" || exit 1
PORTA=4747

if ! command -v node >/dev/null 2>&1; then
  echo "Precisa do Node.js instalado. Baixe a versão LTS em https://nodejs.org"
  read -r -p "Enter para fechar"
  exit 1
fi

if curl -s -o /dev/null "http://localhost:$PORTA/api/info"; then
  open "http://localhost:$PORTA"
  exit 0
fi

(sleep 1 && open "http://localhost:$PORTA") &
echo "Sistema Blatt aberto. Deixe esta janela aberta enquanto usa o sistema."
node server.mjs
