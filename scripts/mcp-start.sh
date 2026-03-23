#!/bin/bash
# MCP server launcher — ensures native modules are compiled for system Node.js
# (not Electron's Node.js) before starting the server.

set -e
cd "$(dirname "$0")/.."

# Check if better-sqlite3 works with current Node.js
if ! node -e "require('better-sqlite3')" 2>/dev/null; then
  npm rebuild better-sqlite3 hnswlib-node --silent 2>/dev/null
fi

exec node dist/backend/mcp/cli.js "$@"
