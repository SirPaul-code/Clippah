#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION="$(node -e "const fs=require('fs'); console.log(JSON.parse(fs.readFileSync('manifest.json','utf8')).version)")"

FILES=(
  manifest.json
  background.js
  content.js
  offscreen.html
  offscreen.js
  editor.html
  editor.css
  editor.js
)

for file in "${FILES[@]}"; do
  [[ -f "$file" ]] || { echo "Missing runtime file: $file" >&2; exit 1; }
done

mkdir -p dist
OUT="dist/Clippah-v${VERSION}.zip"
rm -f "$OUT"

zip -j "$OUT" "${FILES[@]}" >/dev/null
echo "Created: $OUT"
