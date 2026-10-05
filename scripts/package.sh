#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
VERSION="$(node -e "const fs=require('fs');console.log(JSON.parse(fs.readFileSync('manifest.json','utf8')).version)")"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
FILES=(manifest.json background.js content.js offscreen.html offscreen.js editor.html editor.css editor.js options.html options.css options.js icons/icon-16.png icons/icon-32.png icons/icon-48.png icons/icon-128.png)
for file in "${FILES[@]}"; do
  [[ -f "$file" ]] || { echo "Missing runtime file: $file" >&2; exit 1; }
  mkdir -p "$STAGE/$(dirname "$file")"
  cp "$file" "$STAGE/$file"
done
mkdir -p dist
OUT="dist/Clippah-v${VERSION}.zip"
rm -f "$OUT"
(cd "$STAGE" && zip -qr "$ROOT/$OUT" .)
echo "Created: $OUT"
