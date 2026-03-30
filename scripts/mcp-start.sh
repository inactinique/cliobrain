#!/bin/bash
# MCP server launcher — coexists with Electron without conflicts.
#
# Problem: Electron compiles native modules (better-sqlite3, hnswlib-node) for
# its own Node ABI. The MCP server runs with system Node.js (different ABI).
# Copying binaries back and forth breaks one or the other.
#
# Solution: Use a separate .mcp-native/ directory with its own node_modules/
# containing system-Node-compiled natives. A symlink .mcp-native/dist → ../dist
# points to the project's compiled code. With --preserve-symlinks, Node resolves
# bare imports (like 'better-sqlite3') from .mcp-native/node_modules/ first,
# while the project's node_modules/ still serves non-native packages.
# Neither directory is modified — true coexistence.

set -e
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NATIVE_DIR="$PROJECT_DIR/.mcp-native"
EXPECTED_ABI=$(node -e "process.stdout.write(process.versions.modules)")
ABI_MARKER="$NATIVE_DIR/.abi-$EXPECTED_ABI"

# Build native modules for system Node.js if needed
if [ ! -f "$ABI_MARKER" ]; then
  echo "[mcp-start] Building native modules for Node.js ABI ${EXPECTED_ABI}..." >&2
  rm -rf "$NATIVE_DIR"
  mkdir -p "$NATIVE_DIR"

  cd "$NATIVE_DIR"
  echo '{"name":"mcp-native","version":"1.0.0","private":true,"type":"module"}' > package.json
  npm install better-sqlite3 hnswlib-node 2>&1 >&2

  touch "$ABI_MARKER"
  echo "[mcp-start] Build complete." >&2
fi

# Create symlink to project's dist (idempotent)
[ -L "$NATIVE_DIR/dist" ] || ln -sf "$PROJECT_DIR/dist" "$NATIVE_DIR/dist"

cd "$PROJECT_DIR"
exec node --preserve-symlinks --preserve-symlinks-main \
  "$NATIVE_DIR/dist/backend/mcp/cli.js" "$@"
