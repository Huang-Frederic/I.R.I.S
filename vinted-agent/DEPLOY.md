# Deploying the Vinted bot on a VPS

## Background

The bot (`vinted-agent/main.py`) runs on the owner's own machine, started by a launcher: `./start.sh` on WSL, `./start-mac.sh` on macOS or `start-windows.ps1` on Windows. A launcher starts a local proxy (`pproxy` behind an `ngrok` tunnel) that CapSolver can reach, exports its address as `VINTED_PROXY`, and then starts the bot. The launchers no longer scrape shop events: that job runs by itself on GitHub Actions, on a 30-minute schedule ([`.github/workflows/store-events.yml`](../.github/workflows/store-events.yml)).

This document describes how to run **only the bot**, without the proxy, as a systemd service on a Linux VPS, so that it no longer depends on a PC being switched on at home.

## What changes on a VPS

- **The CapSolver proxy (`VINTED_PROXY`) becomes optional.** It is only used to solve a DataDome CAPTCHA automatically, when Vinted shows one and `CAPSOLVER_KEY` is set (`vinted_api.py::_solve_datadome_capsolver`). Without those two variables the solver is skipped with a warning, and a post that runs into a CAPTCHA fails ("DataDome bloqué"); the bot itself keeps running. Normal operation does not need it.
- **There is no shop-events scrape to run.** It has nothing to do with Vinted and, as said above, it runs on GitHub Actions.
- **Cookies no longer have to be copied by hand.** The Supabase table `vinted_sessions` is the source of truth. Before every job, `_sync_cookies_from_supabase` rewrites the local `cookies_*.json` file from that table, and after the job `_sync_cookies_to_supabase` pushes the refreshed token back (both in `main.py`). As long as both accounts have a session in Supabase, the first job on the VPS creates the `cookies_*.json` files itself: there is nothing to transfer.
- **`vinted_users.json` must be recreated on the VPS.** It is gitignored, so it is never pushed. See step 5 below; it holds no secret.
- **`.env` must be recreated on the VPS** with the real values. See `vinted-agent/.env.example` for the variables the bot expects. It is never committed: copy it by hand (scp, or paste it over SSH).
- **Only one agent may run at a time.** At startup the bot puts every `processing` job of its accounts back to `pending`. A second agent running elsewhere (the home PC, say) would pick up the first one's job and post it twice. Stop the bot on every other machine before you start the service.
- **Set the VPS timezone.** The bot compares the machine's local time (a naive `datetime.now()` in `_scheduling_loop`) with the posting windows saved in `vinted_bot_schedule`. A VPS usually runs on UTC, which shifts the windows by one or two hours from Paris time. Set the zone the windows were written for, for example `sudo timedatectl set-timezone Europe/Paris`.

## One thing to watch (not blocking)

The VPS has a datacenter IP address instead of the home's residential one. Some sites, potentially Vinted and DataDome, are warier of datacenter addresses. The random delays already in the code between actions (45 to 90 s between jobs, 8 to 20 s before the photo upload, and so on; see `_dispatch_job` and the `process_*_job` functions in `main.py`) lower the risk, but if blocks or CAPTCHAs become more frequent after the move, this is the first suspect.

## Deployment steps

### 1. Prerequisites on the VPS

```bash
sudo apt update
sudo apt install -y python3.12 python3.12-venv git
```

The bot needs Python 3.10 or newer; 3.12 is just what these commands install.

### 2. Clone (or update) the repository

```bash
git clone https://github.com/Huang-Frederic/I.R.I.S.git
cd I.R.I.S/vinted-agent
```

### 3. Python environment

```bash
python3.12 -m venv env
source env/bin/activate
pip install -r requirements.txt
```

The virtual environment is called `env` here because the service file runs `env/bin/python3`. The macOS and Windows setup scripts (`setup-mac.sh`, `setup-windows.ps1`) create `.venv` instead. On a VPS you can use either name, as long as `ExecStart` in the service file points at the one you created.

### 4. Configuration (`.env`)

```bash
cp .env.example .env
nano .env   # fill in SUPABASE_URL and SUPABASE_KEY (the service role key, not the anon key)
```

### 5. `vinted_users.json`

This file holds no secret: only Supabase user ids, a display name and the name of a cookies file. The keys are the Supabase auth user ids of the accounts the bot serves (Supabase dashboard, Authentication, Users), the same ids that the app lists in `VINTED_USER_IDS`. Create the file with your own values:

```json
{
  "<owner-user-id>": {"cookies": "cookies_<account>.json", "name": "<display name>"},
  "<partner-user-id>": {"cookies": "cookies_<other-account>.json", "name": "<display name>"}
}
```

`cookies_<account>.json` is where the bot keeps that account's Vinted session on disk; any name works, as long as it is the same here and wherever the file is written (`import_cookies.py --user <account>` writes `cookies_<account>.json`). `name` only appears in the logs.

### 6. systemd service

```bash
# First edit vinted-agent/deploy/vinted-agent.service:
# replace every <TON_USER> ("your user", in French) and the repository path with the real ones.
sudo cp deploy/vinted-agent.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now vinted-agent
```

### 7. Check that it is running

```bash
sudo systemctl status vinted-agent
journalctl -u vinted-agent -f    # live logs, Ctrl+C to leave
```

You should see the startup line, then the heartbeat (`♥ ...`) every 30 seconds, and the same log lines as on the `/vinted/bot` dashboard.

## Updating after a new push

```bash
cd I.R.I.S/vinted-agent
git pull
source env/bin/activate && pip install -r requirements.txt   # if requirements.txt changed
sudo systemctl restart vinted-agent
```

## Security

- No inbound port needs to be opened: the bot only makes outbound requests (to Vinted and to Supabase).
- `chmod 600 .env vinted_users.json`, and the same for the `cookies_*.json` files once they exist (they hold live session tokens), to keep them readable by your user only.
- If the VPS also hosts a website, the bot shares its IP address with it: should Vinted ever flag the bot's traffic, the site would sit on the same address. The risk is low while the posting volume stays reasonable. A separate VPS is the zero-dependency option if it ever becomes necessary.
