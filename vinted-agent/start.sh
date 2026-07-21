#!/bin/bash
set -e

cd "$(dirname "$0")"

# ── 1. Proxy SOCKS5 local ────────────────────────────────────────────────────
pproxy -l http://:1080 &
PROXY_PID=$!

# ── 2. Tunnel ngrok ──────────────────────────────────────────────────────────
ngrok tcp 1080 --log=stdout > /tmp/ngrok-vinted.log 2>&1 &
NGROK_PID=$!

# ── 3. Récupère l'URL ngrok via son API locale ───────────────────────────────
echo "En attente de ngrok..."
for i in $(seq 1 15); do
    sleep 1
    NGROK_URL=$(curl -s localhost:4040/api/tunnels 2>/dev/null \
        | python3 -c "
import sys, json
try:
    tunnels = json.load(sys.stdin).get('tunnels', [])
    if tunnels:
        url = tunnels[0]['public_url'].replace('tcp://', 'http://')
        print(url)
except Exception:
    pass
" 2>/dev/null)
    if [ -n "$NGROK_URL" ]; then
        break
    fi
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

# ── 5. Rafraîchit les événements boutiques (incl. Play-in via navigateur) ────
# Idempotent (remplace par source) — non bloquant si un site est down.
# Le cron GitHub fait déjà les boutiques à fetch simple ; ici on fait TOUT,
# navigateur compris, puisque cette machine a Chromium.
echo "🗓  Scraping des événements boutiques..."
( cd .. && npm run scrape-events ) || echo "⚠  scrape-events a échoué (non bloquant), on continue"

# ── 6. Lance l'agent ─────────────────────────────────────────────────────────
python3 main.py
