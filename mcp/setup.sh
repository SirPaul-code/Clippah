#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20+ is required. Install Node.js LTS, then run this script again." >&2
  exit 1
fi
npm install --omit=dev
TOKEN="$(node server.js --print-token)"
echo "Clippah Agent setup complete."
echo "Pairing token: $TOKEN"
echo "Paste it once in Clippah Settings -> Agent Bridge."
echo "Use this MCP command: $(pwd)/server.js (with node)"
