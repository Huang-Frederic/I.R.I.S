#!/bin/bash
# macOS launcher — mirror of start.sh (WSL). Proxy + ngrok, refresh the store
# events, then run the Vinted agent. Run ./setup-mac.sh once first.
set -e
cd "$(dirname "$0")"

# Prefer the venv from setup-mac.sh; fall back to global tools.
PYBIN="./.venv/bin/python"; PPROXY_BIN="./.venv/bin/pproxy"
[ -x "$PYBIN" ]      || PYBIN="python3"
[ -x "$PPROXY_BIN" ] || PPROXY_BIN="pproxy"

# ── 1. Proxy SOCKS5 local ────────────────────────────────────────────────────
"$PPROXY_BIN" -l http://:1080 &
PROXY_PID=$!

# ── 2. Tunnel ngrok ──────────────────────────────────────────────────────────
ngrok tcp 1080 --log=stdout > /tmp/ngrok-vinted.log 2>&1 &
NGROK_PID=$!

# ── 3. Récupère l'URL ngrok via son API locale ───────────────────────────────
echo "En attente de ngrok..."
NGROK_URL=""
for i in $(seq 1 15); do
    sleep 1
    NGROK_URL=$(curl -s localhost:4040/api/tunnels 2>/dev/null \
        | python3 -c "
import sys, json
try:
    tunnels = json.load(sys.stdin).get('tunnels', [])
    if tunnels:
        print(tunnels[0]['public_url'].replace('tcp://', 'http://'))
except Exception:
    pass
" 2>/dev/null)
    [ -n "$NGROK_URL" ] && break
done

if [ -z "$NGROK_URL" ]; then
    echo "❌  ngrok n'a pas démarré (vérifie ton authtoken : ngrok config add-authtoken <token>)"
    kill $PROXY_PID $NGROK_PID 2>/dev/null
    exit 1
fi

echo "✅  Proxy prêt : $NGROK_URL"
export VINTED_PROXY="$NGROK_URL"

# ── 4. Nettoyage au Ctrl+C ───────────────────────────────────────────────────
cleanup() {
    echo ""
    echo "⊗  Arrêt proxy + ngrok"
    kill $PROXY_PID $NGROK_PID 2>/dev/null
}
trap cleanup EXIT INT TERM

# ── 5. Rafraîchit les événements boutiques (incl. navigateur) ────────────────
echo "🗓  Scraping des événements boutiques..."
( cd .. && npm run scrape-events ) || echo "⚠  scrape-events a échoué (non bloquant), on continue"

# ── 6. Lance l'agent ─────────────────────────────────────────────────────────
"$PYBIN" main.py
