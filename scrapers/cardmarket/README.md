# Cardmarket Scraper (BrightData-powered)

> **Historique** : démarré comme un Apify Actor pour bypass le WAF Cloudflare
> de Cardmarket. L'approche a échoué (proxy résidentiel + Playwright headless
> flaggés systématiquement), donc on a basculé sur **BrightData Web Unlocker**
> qui résout captcha + bot fingerprint nativement. Le code est resté en
> structure d'Actor (Apify SDK encore utilisé pour les helpers Input/Output
> en local), mais la requête HTTP elle-même va via fetch() → BrightData.
> Aucun deploy sur Apify cloud, aucune dépendance résiduelle au service Apify.

## Architecture

```
src/
├── main.ts        # Entry point: charge l'input, dispatche les workers, agrège
├── scrape.ts      # Pure parser DOM (testable en happy-dom) → ScrapedCard[]
├── supabase.ts    # Client Supabase + helpers expansionAlreadyIndexed/upsertCards
└── types.ts       # Interfaces partagées
```

## Stack

- **Node 22+** (requis par les versions récentes de @supabase/supabase-js)
- **Playwright NON** (purgé) — on utilise `fetch()` direct via BrightData
- **jsdom** pour parser le HTML retourné par BrightData
- **dotenv** pour charger les credentials en local

## Usage

```bash
# Setup une fois (créer le compte BrightData + zone Web Unlocker)
# Récupère ton API token depuis https://brightdata.com/cp/api_tokens
echo "BRIGHTDATA_TOKEN=ton-token" >> .env
echo "BRIGHTDATA_ZONE=iris" >> .env  # ou le nom de ta zone
echo "SUPABASE_URL=https://xxx.supabase.co" >> .env
echo "SUPABASE_SERVICE_ROLE_KEY=eyJ..." >> .env

# Génère l'input depuis le repo principal (cardmarket_expansions.json → cardmarket-input.json)
cd ../..
npm run build-cardmarket-input

# Place l'input là où le SDK Apify le cherche
cp cardmarket-input.json scrapers/cardmarket/storage/key_value_stores/default/INPUT.json

# Run le scraper local
cd scrapers/cardmarket
npx tsx src/main.ts
```

Pour scraper une seule expansion (smoke test) :

```json
// storage/key_value_stores/default/INPUT.json
{
  "expansions": [
    { "idExpansion": 1521, "name": "Vigueur Spectrale", "slug": "Vigueur-Spectrale" }
  ],
  "skipExisting": false,
  "concurrency": 1
}
```

## Coût

~3000 requêtes (741 expansions × ~4 pages avg) à $1.50/CPM = **~$4.50** par backfill complet.
Free tier BrightData: $5 → potentiellement 1 backfill complet gratuit.

## Output

Upsert dans Supabase `cardmarket_card_index` :
- `id_product` (PK, FK vers cardmarket_products)
- `id_expansion`, `set_number`, `url_variant`, `language`, `url_path`

Snapshot après run : `npm run snapshot-cardmarket-index` (depuis le repo root) → `backups/cardmarket_card_index.jsonl.gz`.

## Failure modes connus

| Situation | Symptôme | Fix |
|---|---|---|
| FK violation `cardmarket_card_index_id_product_fkey` | Le scrape trouve des id_product pas dans `cardmarket_products` (daily dump pas à jour) | Run `npm run upload-cardmarket-dumps` puis re-scrape ces expansions seulement |
| BrightData proxy auth fail | `ERR_INVALID_AUTH_CREDENTIALS` | Vérifie le token + nom de zone dans `.env` |
| Cardmarket 403 Cloudflare | Inattendu avec BrightData (sinon contacter support BrightData) | Régénère le token, vérifie que la zone est `Web Unlocker` (pas datacenter) |

## Lien spec

[docs/superpowers/specs/2026-05-09-cardmarket-scraper-design.md](../../docs/superpowers/specs/2026-05-09-cardmarket-scraper-design.md)
