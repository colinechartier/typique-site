#!/bin/bash
# Copie datée des notes internes (jamais publiées) dans iCloud Drive.
# Usage : bash tools/sauvegarde_notes.sh
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ICLOUD="$HOME/Library/Mobile Documents/com~apple~CloudDocs"
DEST="$ICLOUD/Sauvegardes TYPIQUE/notes/$(date +%Y-%m-%d_%H%M)"

if [ ! -d "$ICLOUD" ]; then
  echo "iCloud Drive introuvable : rien n'a été copié." >&2
  exit 1
fi

mkdir -p "$DEST" || exit 1

copies=0
for f in BRIEF.md VISUELS.md PLAN.md DROP02-A-REMPLIR.md; do
  if [ ! -f "$ROOT/$f" ]; then
    echo "Absent, non copié : $f"
  elif cp -p "$ROOT/$f" "$DEST/$f"; then
    copies=$((copies + 1))
  else
    echo "Échec de la copie : $f" >&2
  fi
done

echo "$copies fichier(s) copié(s) dans : $DEST"
