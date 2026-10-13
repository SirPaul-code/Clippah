#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
VERSION="$(node -e "const fs=require('fs');console.log(JSON.parse(fs.readFileSync('manifest.json','utf8')).version)")"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
# Canonical runtime list also powers in-app updates.
mapfile -t FILES < <(node -e "const m=require('./runtime-files.json');if(m.schema!==1)process.exit(2);console.log(m.files.join('\\n'))")
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
