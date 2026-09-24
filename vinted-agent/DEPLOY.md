# Déployer le bot Vinted sur un VPS

## Contexte

Le bot (`vinted-agent/main.py`) tourne aujourd'hui sur la machine WSL de Fred,
lancé via `./start.sh`, qui combine plusieurs choses en une seule fois :
un proxy local (`pproxy` + tunnel `ngrok`) exposé pour CapSolver, un scraping
des événements boutiques (`npm run scrape-events`), puis le bot lui-même.

Ce document décrit comment faire tourner **uniquement le bot** — sans le
proxy ni le scraping d'événements, qui restent des affaires de la machine
de Fred — en tant que service systemd sur un VPS Linux, pour ne plus dépendre
d'un PC allumé à la maison.

## Ce qui change en le faisant tourner sur un VPS

- **Le proxy CapSolver (`VINTED_PROXY`) devient optionnel.** Il ne sert qu'à
  résoudre automatiquement un CAPTCHA DataDome si Vinted en présente un et que
  `CAPSOLVER_KEY` est configuré (`vinted_api.py::_solve_datadome_capsolver`).
  Sans ces deux variables, le bot loggue juste un avertissement et continue
  sans résolution automatique — ce n'est pas bloquant pour le fonctionnement
  normal. Le scraping d'événements (`npm run scrape-events`) n'a rien à voir
  avec Vinted et n'a pas besoin de tourner sur le VPS.
- **Les cookies n'ont plus besoin d'être copiés à la main.** Depuis peu, la
  table Supabase `vinted_sessions` est la source de vérité : avant chaque job,
  `_sync_cookies_from_supabase` réécrit le fichier local `cookies_*.json` à
  partir de cette table (`main.py::_sync_cookies_from_supabase`). Comme les
  deux comptes (Fred et Gilly) ont déjà une session à jour dans Supabase, le
  premier job sur le VPS créera lui-même les fichiers `cookies_*.json` — rien
  à transférer.
- **`vinted_users.json` doit être recréé sur le VPS** (il est gitignoré, donc
  jamais poussé) — voir plus bas, il ne contient aucun secret.
- **`.env` doit être recréé sur le VPS** avec les vraies valeurs — voir
  `vinted-agent/.env.example` pour la liste des variables attendues. Jamais
  commité, à copier à la main (scp, ou collé directement en SSH).

## Point de vigilance (pas bloquant)

Le VPS aura une IP de datacenter au lieu de l'IP résidentielle de la maison.
Certains sites (dont potentiellement Vinted/DataDome) sont plus méfiants
envers les IP de datacenter. Les délais aléatoires déjà en place entre les
actions (45-90s entre jobs, 8-20s avant upload photo, etc. — voir
`main.py::_dispatch_job`) réduisent ce risque, mais si des blocages ou
CAPTCHA apparaissent plus souvent après le déploiement, c'est le premier
suspect à vérifier.

## Étapes de déploiement

### 1. Prérequis sur le VPS

```bash
sudo apt update
sudo apt install -y python3.12 python3.12-venv git
```

### 2. Cloner (ou mettre à jour) le repo

```bash
git clone https://github.com/Huang-Frederic/I.R.I.S.git
cd I.R.I.S/vinted-agent
```

### 3. Environnement Python

```bash
python3.12 -m venv env
source env/bin/activate
pip install -r requirements.txt
```

### 4. Configuration (`.env`)

```bash
cp .env.example .env
nano .env   # remplis SUPABASE_URL et SUPABASE_KEY (service role, pas anon)
```

### 5. `vinted_users.json`

Ce fichier ne contient aucun secret (juste les UUID Supabase, un nom
d'affichage, et le nom du fichier de cookies) — colle-le tel quel :

```json
{
  "35385d3c-5966-4a10-8568-8d92d1be47e7": {"cookies": "cookies_fhuang5.json", "name": "Fred"},
  "a018a4ef-e02e-4a67-9732-9fafe3167e10": {"cookies": "cookies_hilyna.json", "name": "Gilly"}
}
```

### 6. Service systemd

```bash
# Édite d'abord vinted-agent/deploy/vinted-agent.service :
# remplace <TON_USER> et le chemin du repo par les vrais.
sudo cp deploy/vinted-agent.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now vinted-agent
```

### 7. Vérifier que ça tourne

```bash
sudo systemctl status vinted-agent
journalctl -u vinted-agent -f    # logs en direct, Ctrl+C pour quitter
```

Tu devrais voir le battement de cœur (`♥ ...`) toutes les 30s, et les mêmes
logs que côté dashboard `/vinted/bot`.

## Mettre à jour après un nouveau push

```bash
cd I.R.I.S/vinted-agent
git pull
source env/bin/activate && pip install -r requirements.txt   # si requirements.txt a changé
sudo systemctl restart vinted-agent
```

## Sécurité

- Aucun port entrant à ouvrir — le bot ne fait que des requêtes sortantes
  (Vinted, Supabase).
- `chmod 600 .env vinted_users.json` pour limiter la lecture à ton utilisateur.
- Le bot tourne sur la même machine que le site pro — voir la discussion sur
  le risque de mutualisation (automatisation Vinted vs hébergement du site)
  échangée avant ce déploiement : risque jugé faible tant que le volume de
  posts reste raisonnable, mais un VPS séparé reste l'option zéro-dépendance
  si besoin plus tard.
