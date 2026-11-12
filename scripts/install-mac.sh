#!/usr/bin/env bash
# Builds the Flip Timer desktop widget on this Mac and installs it into /Applications.
# Usage:  ./scripts/install-mac.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="Flip Timer"
DEST="/Applications/$APP_NAME.app"

say() { printf '\n\033[1;33m▸ %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*"; exit 1; }

[[ "$(uname)" == "Darwin" ]] || fail "This script is for macOS."

say "Checking tools"
xcode-select -p >/dev/null 2>&1 || fail "Xcode Command Line Tools missing — run: xcode-select --install"
command -v node >/dev/null || fail "Node.js missing — install it from https://nodejs.org (v20+)"
if ! command -v cargo >/dev/null; then
  [[ -f "$HOME/.cargo/env" ]] && source "$HOME/.cargo/env"
fi
command -v cargo >/dev/null || fail "Rust missing — install it with: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
echo "node $(node -v) · $(cargo --version) · $(uname -m)"

say "Installing JavaScript dependencies"
cd "$ROOT/desktop"
npm install --no-audit --no-fund

say "Building the app (first build takes a few minutes)"
npm run tauri build -- --bundles app

BUILT="$ROOT/desktop/src-tauri/target/release/bundle/macos/$APP_NAME.app"
[[ -d "$BUILT" ]] || fail "Build finished but $BUILT was not found."

say "Installing to $DEST"
osascript -e "tell application \"$APP_NAME\" to quit" >/dev/null 2>&1 || true
pkill -x "gumite-flip-widget" >/dev/null 2>&1 || true
pkill -x "$APP_NAME" >/dev/null 2>&1 || true
sleep 1
rm -rf "$DEST"
ditto "$BUILT" "$DEST"
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true

say "Launching"
open "$DEST"
printf '\n\033[1;32m✓ Installed %s.\033[0m Look for the flip icon in the menu bar.\n' "$APP_NAME"
echo "  Tip: Settings → Habits → Start at login."
