#!/usr/bin/env bash
# Kotatsu installer. Safe to read before you run it.
#   curl -fsSL https://raw.githubusercontent.com/misocod/kotatsu/main/install.sh | bash
#
# What it does: checks this Mac, installs Node 22 with Homebrew when missing (asks first),
# clones into ~/.kotatsu/app, builds, writes your config and a launch agent, starts it,
# and opens setup in your browser. Nothing is opened to the internet: Tailscale stays private.
# It never uses sudo, except when you say yes to the sleep settings question.

set -euo pipefail

APP_DIR="${KOTATSU_HOME:-$HOME/.kotatsu/app}"
REPO="${KOTATSU_REPO:-https://github.com/misocod/kotatsu.git}"
LABEL="app.kotatsu.bridge"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DATA="$HOME/Library/Application Support/Kotatsu"
PORT="${PORT:-8787}"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
say() { printf '  %s\n' "$1"; }
ask() {
  printf '  %s [y/N] ' "$1"
  read -r answer || true
  [[ "${answer:-}" =~ ^[Yy]$ ]]
}
fail() { printf '\n  %s\n\n' "$1"; exit 1; }

bold "Kotatsu"
say "Installing to $APP_DIR"

# 1. macOS
[[ "$(uname -s)" == "Darwin" ]] || fail "Kotatsu runs on macOS only."
MACOS="$(sw_vers -productVersion)"
say "macOS $MACOS"
MODEL="$(sysctl -n hw.model)"
case "$MODEL" in
  MacBook*) say "This is a laptop. Kotatsu only works while it is awake and open." ;;
  *) say "This Mac can stay on, which is what Kotatsu wants." ;;
esac

# 2. Homebrew and Node
if ! command -v brew >/dev/null 2>&1; then
  if ask "Homebrew is missing. Install it now?"; then
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  else
    fail "Homebrew is needed for Node. Install it from brew.sh and run this again."
  fi
fi
eval "$(/opt/homebrew/bin/brew shellenv 2>/dev/null || /usr/local/bin/brew shellenv 2>/dev/null || true)"

need_node=""
if ! command -v node >/dev/null 2>&1; then
  need_node="yes"
else
  major="$(node -p 'process.versions.node.split(".")[0]')"
  [[ "$major" -ge 22 ]] || need_node="yes"
fi
if [[ -n "$need_node" ]]; then
  if ask "Node 22 is needed. Install it with Homebrew?"; then
    brew install node@22
    brew link --overwrite --force node@22 >/dev/null 2>&1 || true
    export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
  else
    fail "Node 22 is needed. brew install node@22, then run this again."
  fi
fi
say "Node $(node -v)"

# 3. The app
if [[ -d "$APP_DIR/.git" ]]; then
  say "Updating the copy already here"
  git -C "$APP_DIR" pull --ff-only || true
else
  mkdir -p "$(dirname "$APP_DIR")"
  git clone --depth 1 "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"
say "Installing packages"
npm ci --silent
say "Building the app"
npm run build --silent

# 4. Secrets that live only on this Mac
mkdir -p "$DATA" "$DATA/uploads"
chmod 700 "$DATA"
node packages/bridge/src/cli.ts vapid >/dev/null 2>&1 || true
AGENT_TOKEN="$(openssl rand -hex 32)"
node -e '
const fs = require("fs");
const file = process.argv[1];
const saved = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
saved.port = Number(process.argv[2]);
saved.agentToken = process.argv[3];
saved.hostName = require("os").hostname().replace(/\.local$/, "");
fs.writeFileSync(file, JSON.stringify(saved, null, 2), { mode: 0o600 });
' "$DATA/config.json" "$PORT" "$AGENT_TOKEN"
say "Config written to $DATA/config.json (only you can read it)"

# 5. Start at login
NODE_BIN="$(command -v node)"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$APP_DIR/node_modules/tsx/dist/cli.mjs</string>
    <string>$APP_DIR/packages/bridge/src/index.ts</string>
  </array>
  <key>WorkingDirectory</key><string>$APP_DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>NODE_ENV</key><string>production</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/kotatsu.log</string>
  <key>StandardErrorPath</key><string>/tmp/kotatsu.log</string>
</dict>
</plist>
PLISTEOF
chmod 600 "$PLIST"
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl kickstart -k "gui/$(id -u)/$LABEL" 2>/dev/null || true
say "Started, and it will start again at login"

# 6. Reach it from the phone
if command -v tailscale >/dev/null 2>&1 && tailscale status >/dev/null 2>&1; then
  tailscale serve --bg "$PORT" >/dev/null 2>&1 || true
  URL="$(tailscale serve status 2>/dev/null | grep -Eo 'https://[a-z0-9.-]+\.ts\.net' | head -1 || true)"
  [[ -n "$URL" ]] && say "Your address: $URL"
else
  say "Tailscale is not signed in yet. Install it, sign in, then run: tailscale serve --bg $PORT"
fi

# 7. Keep this Mac awake
if ask "Turn off sleep so Kotatsu stays reachable? (needs your password)"; then
  sudo pmset -a sleep 0 displaysleep 10 womp 1 autorestart 1
  say "Sleep is off, network wakes it, and it restarts after a power cut"
fi

bold "Done"
say "Setup opens at http://localhost:$PORT/setup"
say "Check anything later with: kotatsu doctor"
open "http://localhost:$PORT/setup" 2>/dev/null || true
