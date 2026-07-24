# One-time bootstrap of the IRIS Vinted agent + events scraper on Windows.
# Places the exported env/cookies, then installs every dependency.
#
#   powershell -ExecutionPolicy Bypass -File .\setup-windows.ps1 [chemin\vers\iris-mac-transfer]
#
# Default transfer folder: <repo>\iris-mac-transfer. Then launch: .\start-windows.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot                       # vinted-agent\
$Root = (Resolve-Path "..").Path                  # repo root
$Transfer = if ($args[0]) { $args[0] } else { Join-Path $Root "iris-mac-transfer" }

Write-Host "> Bootstrap IRIS (Windows)"
Write-Host "  transfert : $Transfer"
if (-not (Test-Path $Transfer)) { throw "dossier de transfert introuvable : $Transfer" }

# 1. Fichiers d'environnement + cookies
Copy-Item (Join-Path $Transfer "env.local")         (Join-Path $Root ".env.local") -Force
Copy-Item (Join-Path $Transfer "vinted-agent.env")  ".\.env" -Force
Copy-Item (Join-Path $Transfer "vinted_users.json") ".\vinted_users.json" -Force
Copy-Item (Join-Path $Transfer "cookies*.json")     ".\" -Force
Write-Host "  OK  .env.local + vinted-agent\.env + vinted_users.json + cookies"

# 2. Venv Python + dépendances de l'agent
python -m venv .venv
.\.venv\Scripts\pip.exe install -q --upgrade pip
.\.venv\Scripts\pip.exe install -q -r requirements.txt pproxy
.\.venv\Scripts\python.exe -m playwright install chromium | Out-Null
Write-Host "  OK  venv Python + dépendances agent (+ pproxy)"

# 3. Node + Chromium pour le scraper d'événements
Push-Location $Root
npm install --silent
npx playwright install chromium | Out-Null
Pop-Location
Write-Host "  OK  npm install + Chromium (scraper événements)"

# 4. ngrok présent ?
if (-not (Get-Command ngrok -ErrorAction SilentlyContinue)) {
  Write-Host "  ATTENTION  ngrok absent — installe-le (winget install ngrok) puis :"
  Write-Host "             ngrok config add-authtoken <ton_token>"
} else {
  Write-Host "  OK  ngrok présent"
}

Write-Host ""
Write-Host "Setup termine. Lance maintenant :  .\start-windows.ps1"
Write-Host "(et tu peux supprimer $Transfer — il contient tes secrets)"
