# Vinted Agent — Setup

Pour un déploiement sur un VPS Linux (service systemd, sans proxy/scraping
d'événements), voir [DEPLOY.md](./DEPLOY.md).

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

**Une seule instance à la fois** : au démarrage, l'agent remet en `pending`
tous les jobs `processing` des comptes qu'il gère — si une autre machine est
en train de poster, son job serait repris et posté deux fois. Coupe le bot
ailleurs avant de le lancer.

## Configuration

`.env` (voir `.env.example`) :
- `SUPABASE_URL` — Supabase dashboard → Settings → API
- `SUPABASE_KEY` — service role key (pas la clé anon)
- `CAPSOLVER_KEY` / `VINTED_PROXY` — optionnels, résolution auto d'un CAPTCHA
  DataDome ; les launchers exportent eux-mêmes `VINTED_PROXY` (tunnel ngrok)

`vinted_users.json` : UUID Supabase → fichier de cookies + nom affiché (format
dans [DEPLOY.md](./DEPLOY.md)).

## Run manually

Sans proxy ni ngrok (pas de résolution auto de CAPTCHA) :

```bash
cd vinted-agent
.venv/bin/python main.py
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

## Cookies

La table Supabase `vinted_sessions` est la source de vérité : avant chaque job
l'agent réécrit le `cookies_*.json` local depuis cette table, et y repousse le
token rafraîchi après le job. Rien à copier entre machines.

Si une session expire (403, déconnexion) : exporte les cookies de vinted.fr
depuis Chrome (Cookie-Editor), convertis l'export avec
`python import_cookies.py <export.json> --user fhuang5` (ou `hilyna`), puis
colle le contenu du `cookies_*.json` obtenu dans les réglages du suivi sur
`/vinted/bot` — le formulaire refuse l'export brut de Cookie-Editor (tableau).
