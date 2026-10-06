#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20+ is required. Run ./setup.sh once." >&2
  exit 1
fi
if [ ! -d node_modules/@modelcontextprotocol ]; then
  npm install --omit=dev >&2
fi
exec node "$HERE/server.js"
