# Windows launcher — mirror of start.sh (WSL). Proxy + ngrok, refresh the store
# events, then run the Vinted agent. Run .\setup-windows.ps1 once first.
#
#   powershell -ExecutionPolicy Bypass -File .\start-windows.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# Prefer the venv from setup-windows.ps1; fall back to global tools.
$PyBin     = if (Test-Path ".\.venv\Scripts\python.exe") { ".\.venv\Scripts\python.exe" } else { "python" }
$PproxyBin = if (Test-Path ".\.venv\Scripts\pproxy.exe") { ".\.venv\Scripts\pproxy.exe" } else { "pproxy" }

# 1. Proxy SOCKS5 local + 2. tunnel ngrok (background)
$proxy = Start-Process -FilePath $PproxyBin -ArgumentList "-l","http://:1080" -PassThru -WindowStyle Hidden
$ngrok = Start-Process -FilePath "ngrok" -ArgumentList "tcp","1080","--log=stdout" `
                       -PassThru -WindowStyle Hidden -RedirectStandardOutput "$env:TEMP\ngrok-vinted.log"

try {
    # 3. Récupère l'URL ngrok via son API locale
    Write-Host "En attente de ngrok..."
    $NgrokUrl = $null
    for ($i = 0; $i -lt 15; $i++) {
        Start-Sleep -Seconds 1
        try {
            $tunnels = (Invoke-RestMethod "http://localhost:4040/api/tunnels").tunnels
            if ($tunnels) { $NgrokUrl = $tunnels[0].public_url -replace "tcp://","http://"; break }
        } catch { }
    }
    if (-not $NgrokUrl) {
        throw "ngrok n'a pas démarré (vérifie ton authtoken : ngrok config add-authtoken <token>)"
    }
    Write-Host "OK  Proxy pret : $NgrokUrl"
    $env:VINTED_PROXY = $NgrokUrl

    # 5. Rafraîchit les événements boutiques (incl. navigateur) — non bloquant
    Write-Host "Scraping des evenements boutiques..."
    Push-Location ..
    try { npm run scrape-events } catch { Write-Host "scrape-events a echoue (non bloquant), on continue" }
    Pop-Location

    # 6. Lance l'agent
    & $PyBin main.py
}
finally {
    Write-Host "Arret proxy + ngrok"
    Stop-Process -Id $proxy.Id, $ngrok.Id -ErrorAction SilentlyContinue
}
