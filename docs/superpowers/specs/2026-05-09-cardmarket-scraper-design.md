# Apify Cardmarket Scraper (one-shot backfill)

**Date:** 2026-05-09
**Status:** Draft
**Scope:** Cardmarket card index backfill (Phase 3 — pricing infrastructure)

## Goal

Porter le scraper Cardmarket (`scripts/scrape-cardmarket-cards.ts`) vers un Apify Actor pour scraper les ~741 expansions Pokémon en bypass de Cloudflare WAF, avec proxy résidentiel et browser fingerprinting natif. Output direct dans la table Supabase `cardmarket_card_index`. Cible: backfill one-shot pour réparer le mapping `cardmarket_id ↔ card_id` cassé par la formule SQL actuelle.

## Motivation

Le système actuel de mapping repose sur une formule SQL déterministe (voir [docs/CARDMARKET_MAPPING.md](../../CARDMARKET_MAPPING.md)) qui infère `cardmarket_id` depuis l'ordre d'allocation des `id_product` dans le daily dump Cardmarket. Cette heuristique:
- Couvre ~95% des cas en théorie
- En pratique a un drift important (mauvais mapping → prix délirants affichés à l'utilisateur)
- Ne couvre pas les promos atypiques (Battle Party Set, Void Blast, etc.)

Le scraper local existant (`scripts/scrape-cardmarket-cards.ts`, 640 lignes, basé sur `rebrowser-playwright`) fonctionne mais se fait flag par Cloudflare WAF dès qu'on bursts plusieurs expansions. Apify résout ce problème via:
- Proxies résidentiels (vraies IPs résidentielles, rotation automatique)
- Browser fingerprinting via Crawlee (TLS, headers, canvas)
- Smart retry + jitter par défaut

Une fois `cardmarket_id` correctement populé pour chaque carte:
- `cards.cardmarket_id (idProduct)` ↔ daily dump `price_guide_*.json` (keyed by idProduct) → prix corrects
- Plus besoin de scraper pour les prix (le daily dump suffit)

## Design

### Périmètre

One-shot backfill. Apify reste comme outil "au cas où" pour:
- Re-runs manuels en cas de drift détecté
- Nouvelles expansions ajoutées par Cardmarket (rare)

Pas de scheduler, pas de monitoring custom, pas d'automatisation. La formule SQL gère le quotidien; l'Actor Apify est l'outil de réparation.

### Code location

Nouveau dossier dédié à la racine du repo:

```
apify/
└── cardmarket-scraper/
    ├── .actor/
    │   └── actor.json         ← Apify metadata (name, version, computeUnits)
    ├── Dockerfile             ← auto-généré par `apify init`
    ├── package.json           ← deps: apify, playwright, @supabase/supabase-js
    ├── tsconfig.json
    ├── INPUT_SCHEMA.json      ← définit le format JSON d'input (validé par Apify UI)
    └── src/
        ├── main.ts            ← Actor.init() entry point
        ├── scrape.ts          ← parsing logic (port de scrape-cardmarket-cards.ts)
        └── supabase.ts        ← upsert helper avec service role
```

**Self-contained**: le dossier ne dépend pas du reste du repo I.R.I.S. Aucun path relatif vers `lib/`, `scripts/` ou `components/`. Les ~200 lignes de logique parsing critique (extraction idProduct depuis URL d'image, extraction set_number depuis URL slug) sont **dupliquées intentionnellement** depuis `scripts/scrape-cardmarket-cards.ts`. Coût: 200 lignes en double. Bénéfice: les 2 codepaths (Apify cloud vs local fallback) peuvent évoluer indépendamment.

### Apify Actor — flow

```
Actor.init()
  └─→ load INPUT (JSON: expansions[], skipExisting, concurrency, perPage)
  └─→ initialize Apify proxy (RESIDENTIAL group)
  └─→ initialize Supabase client (service role from secret env)

for each expansion (parallel, bounded by concurrency):
  if skipExisting:
    └─→ query Supabase: SELECT 1 FROM cardmarket_card_index WHERE id_expansion = ?
    └─→ if exists: skip
  for site = 1, 2, ..., until empty page:
    └─→ build URL: https://www.cardmarket.com/en/Pokemon/Products/Singles/{slug}?idCategory=51&idExpansion={id}&perSite={perPage}&site={site}
    └─→ Playwright launch (with Apify proxy)
    └─→ scrape .galleryBox elements, extract:
          - idProduct  (from <img src=".../51/{set}/{idProduct}/{idProduct}.jpg">)
          - set_number (from URL slug suffix, e.g. "BRS001" → 1)
          - url_variant (suffix V1/V2/null when multiple cards share set_number)
          - url_path   (the relative href, optional populated for deep-link)
    └─→ jitter 1-3s before next page
  └─→ batch upsert to cardmarket_card_index (50 rows/batch)

Actor.exit() with stats: { expansionsProcessed, rowsInserted, errors }
```

### Input schema (Apify UI)

```json
{
  "expansions": [
    { "idExpansion": 4434, "name": "Brilliant Stars", "slug": "Brilliant-Stars" },
    { "idExpansion": 5152, "name": "Surging Sparks", "slug": "Surging-Sparks" }
    // ... 741 entries
  ],
  "skipExisting": true,
  "concurrency": 3,
  "perPage": 30
}
```

L'input est **généré une fois en local** depuis `cardmarket_expansions.json` via un petit script utilitaire (`scripts/build-cardmarket-input.ts`), puis collé dans l'Apify UI au moment du run. Pas besoin d'API integration cardmarket→apify.

### Anti-bot configuration

- **Proxy**: `Actor.createProxyConfiguration({ groups: ['RESIDENTIAL'] })` — Apify gère la rotation automatiquement entre IPs résidentielles
- **Browser**: Playwright via `Actor.launchPlaywright({ proxyConfiguration: ... })` — Apify SDK injecte les bons args Chromium
- **Fingerprint**: Crawlee browser-pool fingerprint generator (UA, headers, canvas) appliqué automatiquement
- **Pace**: pause aléatoire 1-3s entre chaque page navigation
- **Retry**: 3 retries avec backoff exponentiel sur 403/timeout

### Sécurité Supabase

- `SUPABASE_URL` (public) → variable Apify standard
- `SUPABASE_SERVICE_ROLE_KEY` (secret) → **stocké en secret Apify** (chiffré, jamais visible dans logs/UI)
- Actor utilise `@supabase/supabase-js` standard avec service role pour bypass RLS sur `cardmarket_card_index`

### Run procedure

1. **One-time setup**:
   - `npm install -g apify-cli`
   - `apify login` (token depuis dashboard Apify)
   - `cd scrapers/cardmarket && apify push` → upload Actor sur Apify cloud

2. **Préparer l'input**:
   - `npm run build-cardmarket-input` (génère `cardmarket-input.json` depuis `cardmarket_expansions.json`)
   - Copier le contenu dans l'Apify UI Run config

3. **Configurer secrets dans Apify Console**:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

4. **Run l'Actor**:
   - Click "Start" dans Apify UI
   - Monitor logs en live
   - ETA: ~1h pour 741 expansions × ~4 pages avg avec concurrency=3

5. **Vérifier le résultat**:
   - Query Supabase: `SELECT count(*) FROM cardmarket_card_index` → devrait être ~25-30k rows
   - Re-run prix enrichment pour propager aux cartes

### Coût estimé

| Item | Quantité | Coût |
|---|---|---|
| Page loads (proxy résidentiel) | ~3000 | ~$2 |
| Compute units | ~5 CU | ~$1.50 |
| **Total** | | **~$3-5** |
| Tier gratuit Apify mensuel | $5/mois | -$5 |
| **Net** | | **~$0** (1ère fois) |

## Architecture

```
apify/
└── cardmarket-scraper/    ← NOUVEAU dossier self-contained
    └── ...

scripts/
├── scrape-cardmarket-cards.ts    ← reste comme fallback local (inchangé)
└── build-cardmarket-input.ts          ← NOUVEAU petit utilitaire pour générer l'input JSON

cardmarket_expansions.json        ← source de vérité pour les 741 expansions (existe)

supabase/migrations/
└── 20260508000000_cardmarket_card_index.sql  ← table cible (existe)
```

## Hors-scope (YAGNI)

- Pas de scheduler Apify (one-shot)
- Pas de monitoring custom (Apify UI suffit)
- Pas de rewrite avec Crawlee `PlaywrightCrawler` (port léger Playwright direct)
- Pas d'extraction des PRIX dans le HTML (le daily dump JSON les a déjà)
- Pas de gestion automatique des nouvelles expansions (la formule SQL ou un re-run manuel gèrent)
- Pas de notifications Slack/email à la fin du run
- Pas de tests unitaires sur l'Actor (test manuel via Apify UI sur 1 expansion d'abord)
- Pas de CI/CD pour le déploiement (manuel via `apify push`)

## Testing

Pas de tests automatisés. Validation manuelle en 2 étapes:

1. **Smoke test sur 1 expansion** (ex: "Brilliant Stars" idExpansion=4434):
   - Run Actor avec input de 1 expansion seulement
   - Vérifier rows insérées dans `cardmarket_card_index` (~120 cartes attendues)
   - Vérifier qu'aucun 403 Cloudflare dans les logs

2. **Run complet sur les 741 expansions**:
   - Run Actor avec input complet
   - Monitor en live, vérifier success rate par expansion
   - Si une expansion échoue: re-run manuel avec `skipExisting: true` (skipra les déjà OK)

## Risques

- **Cardmarket peut updater son DOM** → casser les sélecteurs CSS. Mitigation: les sélecteurs sont localisés dans `scrape.ts`, faciles à patcher en cas de break. Le scraper local existe en backup.
- **Apify proxies peuvent être ban par Cloudflare**: peu probable (résidentiels rotatés), mais si ça arrive, fallback sur Bright Data ou autre provider.
- **Rate limit Cardmarket**: avec concurrency=3 et 1-3s jitter, on est à ~1 req/s effective, bien en-dessous des seuils observés. Si on se fait quand même flag, baisser concurrency à 1.
- **Coût qui dérape**: tier gratuit $5/mois. Au-delà, monitoring du budget Apify (alerte par défaut à $10).
- **Daily dump JSON désync**: si Cardmarket update les idProducts entre notre scrape et le daily dump, drift temporaire. Re-run le daily dump update avant l'enrichment.
