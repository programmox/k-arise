#!/bin/bash
# Lanceur K-Arise pour macOS / Linux. Double-clique (Mac) ou execute ce fichier.
cd "$(dirname "$0")"
if command -v python3 >/dev/null 2>&1; then
  python3 devserver.py
elif command -v python >/dev/null 2>&1; then
  python devserver.py
else
  echo "Python n'est pas installe. Installe-le depuis https://www.python.org/downloads/"
  read -r -p "Appuie sur Entree pour fermer."
fi
