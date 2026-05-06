# Phase 5 — Dashboard + Backups (design)

**Date :** 2026-05-07
**Status :** spec validé, prêt pour writing-plans
**Phase précédente :** Phase 4 closeout (316 tests passing, 12 migrations live)

## Pourquoi cette phase

Phase 5 clôt le projet I.R.I.S. Trois besoins à servir :

1. **Visibilité** sur l'état de la collection et le coût opérationnel (Gemini OCR consomme des tokens, on veut savoir combien).
2. **Restauration des données fixes** (catalogue d'enrichissement scrapé sur LimitlessTCG) sans avoir à re-scraper 3h.
3. **Filet de sécurité** sur les données utilisateur irrécupérables (cards, lots, listings, snapshots) au cas où un bug, une mauvaise migration ou un accident Supabase corrompt la base.

Le scope est délibérément restreint : **pas de PWA polish dans ce spec** (install prompt + icônes restent à faire mais sont triviaux et non bloquants — voir "Hors scope").

## Périmètre

### Dans le scope

| Sous-projet | Livrable |
|---|---|
| 1. Dashboard | Page `/dashboard` (6e onglet de nav) — Option B "Analytics" : 4 graphs + 2 tables + KPI strip |
| 2. Snapshot données fixes | Scripts `npm run snapshot-catalog` / `npm run restore-catalog` + dump versionné en git |
| 3. Backup auto user data | GitHub Action quotidien → release assets I.R.I.S (rétention 30/12/12) |
| 4. Backup manuel | Bouton dans `/options` → dump JSON gzippé → bucket Supabase `manual-backups/` (jamais purgé) |
| 5. Tech debt opportuniste | Factoriser validation card form + extraire `PRICE_COEFFICIENT` |

### Hors scope (Phase 5+)

- **PWA install prompt + icônes 192/512 + manifest fine-tune** — punch list séparée, à faire après ce spec ou en // par un autre agent. Indépendant de Dashboard/Backups.
- **Backup automatique des photos uploadées dans le bucket Supabase Storage** — les photos sont remplaçables (re-scan) et alourdiraient le workflow. Reportable en v2 si besoin réel.
- **Backup du `tcg_catalog`** dans le flux auto daily — couvert par le sous-projet 2 (snapshot manuel git, baseline immuable).

## Sous-projet 1 — Dashboard

### Layout

```
┌─────────────────────────────────────────────────┐
│ KPI strip (4 tuiles, ligne d'ouverture)         │
│   Valeur stock | Coût 30j | Scans 30j | Restock │
├──────────────────────┬──────────────────────────┤
│ <CostBarChart>       │ <StockValueLineChart>    │
│ Bar stacked daily    │ Area chart for_sale +    │
│ Gemini + Vision (€)  │ collection (€)           │
│ 30 derniers jours    │ depuis snapshot zero     │
├──────────────────────┼──────────────────────────┤
│ <RarityDonut>        │ <ScanHeatmap>            │
│ SAR/AR/SR/CHR/RR/    │ 52 sem × 7 jours         │
│ R_HOLO/R/UC/C/OTHER  │ GitHub-style intensité   │
│ → drill /pokedex     │                          │
├──────────────────────┴──────────────────────────┤
│ <TopRaresList> — 10 rows par valeur EUR desc    │
│ → click row : ouvre PokedexDrawer de la carte   │
├─────────────────────────────────────────────────┤
│ <RestockAlertsList> — items en alerte restock   │
│ (réutilise lib/utils/restock-detection.ts)      │
└─────────────────────────────────────────────────┘
```

### Stack et architecture

- **Charting lib :** [Recharts](https://recharts.org/) (React-native, léger, déjà couvert par les types). Fallback : si `recharts` rajoute trop de bundle, basculer sur visx ou SVG custom — décision en plan d'implém, pas dans ce spec.
- **Server component** `app/(app)/dashboard/page.tsx` fait toutes les queries Supabase **en parallèle** via `Promise.all`. Passe les data en props aux composants client (Recharts est client-only).
- **Composants client** dans `components/dashboard/` :
  - `<DashboardKpiStrip>` — pure, reçoit les 4 chiffres
  - `<CostBarChart>` — bar stacked, hover tooltip = tokens in/out + count scans
  - `<StockValueLineChart>` — area chart 2 series
  - `<RarityDonut>` — onClick slice → `router.push('/pokedex?rarity=SAR')`
  - `<ScanHeatmap>` — grid 52×7, tooltip = date + count
  - `<TopRaresList>` — onClick row → ouvre `<PokedexDrawer>` (réutilise composant existant)
  - `<RestockAlertsList>` — réutilise `restock-detection.ts` côté server

### Migrations

`supabase/migrations/20260507000000_phase5_dashboard.sql` :

```sql
create table ocr_usage_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  engine text not null check (engine in ('gemini','vision')),
  tokens_in int,
  tokens_out int,
  cost_eur numeric(10,6) not null default 0,
  card_id uuid references cards(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null
);
create index ocr_usage_log_created_at_idx on ocr_usage_log (created_at desc);

-- RLS : reads partagés (les 2 users voient le coût total), no writes from clients
alter table ocr_usage_log enable row level security;
create policy ocr_usage_log_read on ocr_usage_log for select using (auth.uid() is not null);

create table stock_value_snapshots (
  date date primary key,
  value_for_sale numeric(12,2) not null default 0,
  value_collection numeric(12,2) not null default 0,
  count_for_sale int not null default 0,
  count_collection int not null default 0,
  created_at timestamptz not null default now()
);

alter table stock_value_snapshots enable row level security;
create policy stock_value_snapshots_read on stock_value_snapshots for select using (auth.uid() is not null);
```

### Modifs des routes existantes

- **`app/api/ocr/route.ts`** : après chaque scan (Gemini ou Vision), INSERT dans `ocr_usage_log`. `_usage` est déjà extrait par [`lib/api/gemini-vision.ts:208-216`](../../lib/api/gemini-vision.ts) ; pour Vision, on stocke `engine='vision'` + `cost_eur` calculé via le tarif Google ($1.50/1000 features × 0.92 EUR/USD ≈ €0.001380/scan).
- **`app/api/prices/update/route.ts`** (cron pricing 2 AM) : à la fin du run bulk, UPSERT dans `stock_value_snapshots` pour la date du jour. Ça garantit qu'on a 1 row/jour calé sur le moment où les prix sont les plus fiables.

### Drill-down validés

| Source | Cible |
|---|---|
| Donut rareté slice | `router.push('/pokedex?rarity=<key>')` |
| Top rares row | Ouvre `<PokedexDrawer cardId={...}>` |
| KPI scans (non cliquable) | — |
| Restock row (non cliquable v1) | — |

### Anti-features

- **Pas de date range picker** v1 — fenêtre fixe 30 jours pour les 2 graphs daily, 52 semaines pour la heatmap.
- **Pas d'export CSV** des graphs — les données sont en DB, exportables via psql si besoin réel.
- **Pas de comparatif "vs mois précédent"** sur les KPIs — YAGNI, le graph daily montre l'évolution.

## Sous-projet 2 — Snapshot données fixes (one-shot restorable)

### Périmètre

Tables purement "données de référence" :
- `tcg_catalog` (~52K rows JP/EN/FR + colonne `illustrator`)
- `rarity_ranks` (table de mapping raretés, petite)

`pokemon-names` reste hardcodé dans [`lib/data/pokemon-names.ts`](../../lib/data/pokemon-names.ts) — déjà sous git, rien à snapshotter.

### Fichiers

```
backups/
  tcg_catalog.jsonl.gz       (~7 Mo, versionné git)
  rarity_ranks.json          (<1 Ko, versionné git)
  README.md                  (workflow restore + dernière date snapshot)

scripts/
  snapshot-catalog.ts        SELECT * → JSONL streamé + gzipped
  restore-catalog.ts         gunzip + chunked bulk INSERT (chunks de 500)

package.json scripts :
  "snapshot-catalog": "tsx scripts/snapshot-catalog.ts"
  "restore-catalog":  "tsx scripts/restore-catalog.ts"
```

### Workflow (manuel, par convention)

1. Re-scrape : `npm run scrape -- --langs=jp,en,fr` (~12 min sans illustrator, ~3h avec)
2. Snapshot : `npm run snapshot-catalog` → regénère `backups/tcg_catalog.jsonl.gz` + met à jour `backups/README.md` avec `Last snapshot: YYYY-MM-DD HH:MM:SS UTC`
3. Commit : `git add backups/ && git commit -m "snapshot tcg_catalog YYYY-MM-DD"`

### Snapshot initial Phase 5

Lancer `npm run snapshot-catalog` dès le début de la Phase 5 et committer le résultat comme baseline. Garantit qu'on a une restauration possible avant même que la Phase 5 soit déployée.

### Restore

```bash
npm run restore-catalog
# Console : "About to TRUNCATE tcg_catalog (52341 rows) and INSERT 52341 rows from snapshot. Continue? [y/N]"
```

Le script demande une confirmation explicite avant TRUNCATE.

## Sous-projet 3 — Backup auto user data (GitHub Action → releases I.R.I.S)

### Tables backupées

```
cards, lots, card_listings, lot_listings,
user_profiles, config, ocr_usage_log, stock_value_snapshots
```

`tcg_catalog` et `rarity_ranks` sont **exclus** (couverts par sous-projet 2). `auth.*` est géré par Supabase.

### Workflow GitHub Action

`.github/workflows/backup.yml` :

```yaml
name: Daily backup

on:
  schedule:
    - cron: '0 3 * * *'  # 3 AM UTC every day
  workflow_dispatch:      # permet trigger manuel via UI GitHub

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install pg_dump 16
        run: |
          sudo apt-get update
          sudo apt-get install -y postgresql-client-16
      - name: Dump
        env:
          SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
        run: |
          pg_dump "$SUPABASE_DB_URL" \
            --data-only --no-owner --no-acl \
            --table=cards --table=lots \
            --table=card_listings --table=lot_listings \
            --table=user_profiles --table=config \
            --table=ocr_usage_log --table=stock_value_snapshots \
            | gzip > dump.sql.gz
      - name: Tag and upload
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          DATE=$(date -u +%Y-%m-%d)
          DAY_OF_WEEK=$(date -u +%u)  # 1=Mon, 7=Sun
          DAY_OF_MONTH=$(date -u +%d)
          WEEK=$(date -u +%G-W%V)
          MONTH=$(date -u +%Y-%m)

          # Daily (always)
          gh release create "backup-daily-$DATE" dump.sql.gz \
            --notes "Auto-backup $DATE" --prerelease

          # Weekly (Sunday)
          if [ "$DAY_OF_WEEK" = "7" ]; then
            gh release create "backup-weekly-$WEEK" dump.sql.gz \
              --notes "Weekly backup $WEEK" --prerelease
          fi

          # Monthly (1st)
          if [ "$DAY_OF_MONTH" = "01" ]; then
            gh release create "backup-monthly-$MONTH" dump.sql.gz \
              --notes "Monthly backup $MONTH" --prerelease
          fi
      - name: Rotate
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: bash scripts/backup/rotate.sh
```

### Rotation `scripts/backup/rotate.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

# Keep last 30 daily, 12 weekly, 12 monthly. Manual backups never deleted.
keep_recent() {
  local prefix=$1
  local count=$2
  gh release list --limit 1000 \
    | awk '{print $1}' \
    | grep "^${prefix}" \
    | sort -r \
    | tail -n +$((count + 1)) \
    | xargs -I{} -r gh release delete {} --yes --cleanup-tag
}

keep_recent "backup-daily-" 30
keep_recent "backup-weekly-" 12
keep_recent "backup-monthly-" 12
# backup-manual-* never touched
```

### Secrets GitHub à configurer

- `SUPABASE_DB_URL` — connexion Postgres directe (Supabase Dashboard → Settings → Database → Connection string → Direct connection, format `postgresql://postgres.<ref>:<pwd>@<host>:5432/postgres`)
- `GITHUB_TOKEN` — fourni automatiquement par Actions, scope `contents: write` activé dans le workflow

### Restore

```bash
gh release download backup-daily-2026-05-08 --pattern '*.sql.gz' --dir /tmp
gunzip /tmp/dump.sql.gz

# Le dump est --data-only : il ne fait PAS DROP/TRUNCATE.
# Si la DB cible a déjà des rows, il faut TRUNCATE avant pour éviter les conflits PK.
psql "$SUPABASE_DB_URL" -c "
  TRUNCATE cards, lots, card_listings, lot_listings,
           user_profiles, config, ocr_usage_log, stock_value_snapshots
  RESTART IDENTITY CASCADE;
"
psql "$SUPABASE_DB_URL" < /tmp/dump.sql
```

Documenté dans `backups/README.md` côté repo principal.

## Sous-projet 4 — Backup manuel (bouton dans /options)

### UX

Dans [`app/(app)/options/page.tsx`](../../app/(app)/options/page.tsx), nouvelle section sous SignOut :

```
┌─ Backup manuel ──────────────────────────────────┐
│ Créer un snapshot complet, gardé sans rotation. │
│                                                  │
│ [ Créer un backup maintenant ]                  │
│                                                  │
│ Backups manuels existants (3) :                  │
│   • 2026-05-07 14:30 — 1.2 Mo  [DL] [Suppr]      │
│   • 2026-05-06 09:12 — 1.1 Mo  [DL] [Suppr]      │
│   • 2026-04-30 18:01 — 0.9 Mo  [DL] [Suppr]      │
└──────────────────────────────────────────────────┘
```

Click "Créer un backup" :
1. Confirm modal : "Snapshot complet de toutes vos données. Gardé sans rotation. Continuer ?"
2. Sur confirm : POST `/api/backup/manual`, bouton disabled + spinner pendant ~5-10s
3. Réponse : toast vert "✓ Backup créé : iris-2026-05-07-143052.json.gz (1.2 Mo)"
4. La liste des backups manuels se refresh automatiquement

### Architecture

Composant `<ManualBackupSection>` dans `components/options/ManualBackupSection.tsx` :
- Server component qui list les fichiers du bucket `manual-backups/` (via supabase client server-side)
- Imbrique un client component `<ManualBackupButton>` pour le clic + confirm

API routes :
- `POST /api/backup/manual` — déclenche le dump
- `GET /api/backup/manual/[filename]` — génère un signed URL pour download (1h validité)
- `DELETE /api/backup/manual/[filename]` — supprime un backup

### Format du dump

JSON gzippé avec structure :

```json
{
  "version": "phase5",
  "created_at": "2026-05-07T14:30:52Z",
  "tables": {
    "cards": [ {...}, {...} ],
    "lots": [ {...}, {...} ],
    "card_listings": [ ... ],
    "lot_listings": [ ... ],
    "user_profiles": [ ... ],
    "config": [ ... ],
    "ocr_usage_log": [ ... ],
    "stock_value_snapshots": [ ... ]
  }
}
```

Chaque table est un `SELECT *` direct via supabase service-role client (bypass RLS pour avoir tout). Streamé via `JSON.stringify` puis `gzip-stream` pour rester sous le timeout Vercel 60s.

### Bucket Supabase

Nouveau bucket privé `manual-backups/` (création via SQL dans la migration Phase 5 ou via Supabase Studio à la main, documenté dans `docs/setup.md`).

Permissions :
- Read/Write réservés au service-role server-side (pas d'accès client direct)
- Naming convention : `iris-YYYY-MM-DD-HHMMSS.json.gz`

### Restore d'un backup manuel

Hors scope v1 : pas de bouton "Restaurer" en UI (trop dangereux). Documentation dans `docs/setup.md` : télécharger le JSON, lancer un script `scripts/restore-manual.ts` en local qui fait TRUNCATE + INSERT par table.

## Sous-projet 5 — Tech debt opportuniste

À traiter en passant pendant la Phase 5 (déjà flaggé dans phases-summary.md) :

1. **Factoriser validation card form** — extraire les ~56 lignes dupliquées entre [`app/api/cards/route.ts`](../../app/api/cards/route.ts) et [`app/api/cards/batch/route.ts`](../../app/api/cards/batch/route.ts) dans `lib/utils/validate-card-form.ts` (pure function, testée).
2. **Extraire `PRICE_COEFFICIENT = 0.85`** dupliqué entre les 2 routes cards → `lib/constants/pricing.ts`.

Pas de standardisation du shape des erreurs API dans ce spec — sujet trop transverse, à reporter.

## Migrations à appliquer manuellement post-merge

Dans l'ordre :

1. `supabase/migrations/20260507000000_phase5_dashboard.sql` (création `ocr_usage_log` + `stock_value_snapshots` + RLS reads)
2. Création manuelle du bucket privé `manual-backups/` via Supabase Studio (ou inclus dans la migration via `storage.buckets`)

## Tests à ajouter

- `lib/utils/validate-card-form.test.ts` (nouveau, après factorisation)
- `scripts/snapshot-catalog.test.ts` (round-trip : snapshot → restore vers DB de test → vérifie row count + checksum)
- Pas de tests de la GitHub Action elle-même (test-en-prod via `workflow_dispatch` après merge)

## Risques et mitigations

| Risque | Mitigation |
|---|---|
| Vercel 60s timeout sur le dump manuel si la DB grossit | v1 OK car ~5-10s aujourd'hui. Si > 30s observé : passer en background job (table `backup_jobs`) avec polling. |
| `pg_dump` 16 incompatible avec la version Postgres de Supabase | Vérifier Supabase tourne PG 15+ (cas standard). Sinon ajuster la version dans le workflow. |
| `SUPABASE_DB_URL` exposé via logs GitHub Action | `set +x` partout + utiliser `${{ secrets.* }}` jamais `echo`. |
| Bucket `manual-backups/` ouvert à l'erreur "DELETE pour de vrai" | UI a un confirm modal sur Suppr. Service-role only. Naming convention claire. |
| Snapshot `tcg_catalog` (~7 Mo) gonfle le repo git | Acceptable : un snapshot tous les 2-3 mois. Si gênant : passer à git-lfs (mais YAGNI v1). |

## Critères d'acceptation

- [ ] `/dashboard` charge en < 1.5s (perçu) avec data réelle
- [ ] Tous les graphs sont responsifs mobile
- [ ] `npm run snapshot-catalog` produit `backups/tcg_catalog.jsonl.gz` < 10 Mo
- [ ] `npm run restore-catalog` restaure correctement (round-trip test passe)
- [ ] GitHub Action tourne quotidienne sans erreur (vérifié sur 3 jours consécutifs)
- [ ] Bouton backup manuel produit un fichier téléchargeable < 30s
- [ ] Restore manuel via script local fonctionne (test sur DB locale Supabase)
- [ ] 0 lint warning, 0 type error, tous les tests passent
- [ ] Snapshot initial `tcg_catalog` committé en début de phase

## Punch list "hors-scope" pour after-Phase-5

Pour info, ce qui reste après ce spec et qui n'est PAS couvert ici :

- **PWA install prompt** (`<InstallPrompt>` qui listen `beforeinstallprompt`)
- **Icônes PWA 192/512** (à générer depuis le logo, push dans `public/icons/`)
- **Manifest fine-tune** (`scope`, `categories`, `screenshots`)
- **Standardiser le shape des erreurs API** (transverse)
- **Backup automatique des photos du bucket Supabase Storage** (si demandé)
- **UI de restore d'un backup manuel** (bouton "Restaurer" — risqué, à designer séparément)
