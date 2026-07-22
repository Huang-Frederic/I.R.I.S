# Vinted Agent — Setup

## Onboarder une nouvelle machine (Mac / Windows)

Depuis une machine où tu as exporté tes envs dans un dossier `iris-mac-transfer/`
à la racine du repo (`env.local`, `vinted-agent.env`, `vinted_users.json`,
`cookies*.json`) :

**macOS**
```bash
cd vinted-agent
./setup-mac.sh        # une fois : place les envs + installe tout (venv, pproxy, npm, chromium)
./start-mac.sh        # chaque soir : proxy + ngrok + scraping événements + agent
```

**Windows** (PowerShell natif, sans WSL)
```powershell
cd vinted-agent
powershell -ExecutionPolicy Bypass -File .\setup-windows.ps1
powershell -ExecutionPolicy Bypass -File .\start-windows.ps1
```

Prérequis communs : `ngrok` installé + `ngrok config add-authtoken <token>`.
Les scripts placent `env.local`→`.env.local`, `vinted-agent.env`→`.env`, et les
cookies/`vinted_users.json` dans `vinted-agent/`. Supprime `iris-mac-transfer/`
après (il contient tes secrets — il est gitignoré, jamais committé).

Sur WSL, le launcher historique reste `./start.sh`.

## Prerequisites
- Python 3.12 in WSL
- `pip install -r requirements.txt` done

## Configuration

1. Fill `cookies.json` with values from the mitmproxy capture session.
2. Fill `.env`:
   - `SUPABASE_URL` — from Supabase dashboard → Settings → API
   - `SUPABASE_KEY` — service role key (not anon key)
   - `IRIS_USER_ID` — your user UUID from Supabase Auth → Users

## Run manually

```bash
cd vinted-agent
python main.py
```

## Auto-start on Windows boot via Task Scheduler

1. Open Task Scheduler → Create Basic Task
2. Name: "IRIS Vinted Agent"
3. Trigger: "When the computer starts"
4. Action: Start a program
   - Program: `C:\Windows\System32\wsl.exe`
   - Arguments: `-e bash -c "cd /home/fhuang5/Developer/I.R.I.S/vinted-agent && python main.py >> agent.log 2>&1"`
5. Check "Run whether user is logged on or not" → OK

The agent runs silently in the background. Logs go to `vinted-agent/agent.log`.

## Refreshing cookies

- `datadome` lasts ~1 year — replace if you see 403 errors
- `cf_clearance` lasts 24h — if blocked, browse vinted.com in Chrome, recapture via mitmproxy
- `access_token_web` is auto-refreshed by Vinted (7-day session)
