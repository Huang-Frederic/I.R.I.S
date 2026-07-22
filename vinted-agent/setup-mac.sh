#!/bin/bash
# One-time bootstrap of the IRIS Vinted agent + events scraper on macOS.
# Places the exported env/cookies, then installs every dependency.
#
#   ./setup-mac.sh [chemin/vers/iris-mac-transfer]
#
# Default transfer folder: <repo>/iris-mac-transfer (what you exported).
# After this, launch nightly with ./start-mac.sh
set -e
cd "$(dirname "$0")"                       # vinted-agent/
ROOT="$(cd .. && pwd)"                      # repo root
TRANSFER="${1:-$ROOT/iris-mac-transfer}"

echo "▸ Bootstrap IRIS (macOS)"
echo "  transfert : $TRANSFER"
[ -d "$TRANSFER" ] || { echo "❌ dossier de transfert introuvable : $TRANSFER"; exit 1; }

# ── 1. Fichiers d'environnement + cookies à leur place ───────────────────────
cp "$TRANSFER/env.local"          "$ROOT/.env.local"
cp "$TRANSFER/vinted-agent.env"   "./.env"
cp "$TRANSFER/vinted_users.json"  "./vinted_users.json"
cp "$TRANSFER"/cookies*.json      "./"
echo "  ✓ .env.local + vinted-agent/.env + vinted_users.json + cookies"

# ── 2. Environnement Python isolé + dépendances de l'agent ───────────────────
if ! command -v python3 >/dev/null 2>&1; then echo "❌ python3 requis (brew install python)"; exit 1; fi
python3 -m venv .venv
./.venv/bin/pip install -q --upgrade pip
./.venv/bin/pip install -q -r requirements.txt pproxy
./.venv/bin/python -m playwright install chromium >/dev/null 2>&1 || true
echo "  ✓ venv Python + dépendances agent (+ pproxy)"

# ── 3. Node + Chromium pour le scraper d'événements ──────────────────────────
if ! command -v npm >/dev/null 2>&1; then echo "❌ node/npm requis (brew install node)"; exit 1; fi
( cd "$ROOT" && npm install --silent && npx playwright install chromium >/dev/null 2>&1 )
echo "  ✓ npm install + Chromium (scraper événements)"

# ── 4. ngrok ─────────────────────────────────────────────────────────────────
if ! command -v ngrok >/dev/null 2>&1; then
  echo "  ⚠ ngrok absent — installe-le :  brew install ngrok/ngrok/ngrok"
  echo "     puis :  ngrok config add-authtoken <ton_token>"
else
  echo "  ✓ ngrok présent"
fi

echo ""
echo "✅ Setup terminé. Lance maintenant :  ./start-mac.sh"
echo "   (et tu peux supprimer le dossier $TRANSFER — il contient tes secrets)"
