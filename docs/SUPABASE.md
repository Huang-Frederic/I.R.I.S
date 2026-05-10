# Supabase reference

This is your database reference — the full schema (14 tables), the migration timeline, the Row-Level Security policies that enforce per-user writes, the storage buckets for photos and backups, the RPCs that handle atomic Pokédex swaps, and the reset procedure when you need to spin up a fresh environment. Everything you need to understand and operate the I.R.I.S backend lives here.

## Table of contents

- [Tables overview](#tables-overview)
- [Migrations chronology](#migrations-chronology)
- [Row-Level Security policies](#row-level-security-policies)
- [Storage buckets](#storage-buckets)
- [Database functions / RPCs](#database-functions--rpcs)
- [Reset procedure](#reset-procedure)
- [Inspection queries](#inspection-queries)

---

## 🗂 Tables overview

You're looking at 14 tables split into four groups — core inventory (cards, lots, listings, profiles, config), catalog (LimitlessTCG mirror), Cardmarket pricing (expansions, products, pricing, fast-path index), and Dashboard (OCR logs, stock snapshots). Here's what each one holds and why it exists.

### Core inventory (Phase 1 + 4)

The inventory lives in `cards` and `lots`. The per-user Vinted listing states live in `card_listings` and `lot_listings`. User profiles hold display names; `config` is the small key/value store for app-wide settings (price coefficient, Vinted shipping note, etc.).

| Table | Purpose | Notes |
|---|---|---|
| `cards` | Every card in the collection | Status enum: `for_sale`, `collection`, `pokedex`, `sold`. Pricing columns (`cm_price_low/trend/avg`, `cm_updated_at`, `cardmarket_url`) are written by the daily cron. Unique partial index `one_pokedex_per_pokemon` enforces 1 card per Pokémon in `pokedex` status. Partial index on `(cm_updated_at asc nulls first) where status='for_sale'` backs the cron's bulk query. |
| `lots` | Bundle listings (multi-card packages) | Phase 3b1 added 10 columns + Phase 4 added `sold_by_user_id` for per-user attribution. |
| `user_profiles` | Display name + identity per auth user | Seeded conditionally for the original install UUIDs; fresh installs seed manually (see [SETUP.md §6](SETUP.md#6--database-migrations)). |
| `card_listings` | Per-user "listed on Vinted" state for cards | Composite PK `(card_id, user_id)`. RLS scoped: insert/delete only your own. |
| `lot_listings` | Per-user "listed on Vinted" state for lots | Same shape as `card_listings`. |
| `rarity_ranks` | Lookup table mapping each rarity enum value to a sortable rank + label | Seeded once at install, never written to from the app. |
| `config` | Small key/value store for app-wide settings (`price_coefficient`, `vinted_shipping_note`, `vinted_seller_note`) | Read by the API + UI; service-role write only. |

### Catalog (Phase 1.11 + 3c)

A local mirror of LimitlessTCG — roughly 52K cards across all languages, with indexes on set/number and illustrator.

| Table | Purpose | Row count |
|---|---|---|
| `tcg_catalog` | Local mirror of LimitlessTCG (~52K cards) | Indexes on `(set_code, set_number, language)`, `(set_total, set_number, language)` (fallback), `cardmarket_id` (cron lookup), and `illustrator` (single-column — disambiguation runs JS-side over the result set, no composite filter is needed). |

### Cardmarket pricing (Phase 6)

Cardmarket data comes from daily refreshed S3 dumps. Four tables: expansions metadata, product catalog, pricing data, and a fast-path lookup index built by a SQL formula derived from the dump itself (the Playwright scraper at [`scripts/scrape-cardmarket-cards.ts`](../scripts/scrape-cardmarket-cards.ts) is a fallback for wheel-type promo sets — see [CARDMARKET_MAPPING.md](CARDMARKET_MAPPING.md)).

| Table | Purpose | Row count |
|---|---|---|
| `cardmarket_expansions` | 741 expansions (idExpansion → name + name_normalized + `set_prefix`) | Source: FR-locale dropdown HTML. `set_prefix` (BRS/LOR/BKR/sv1a/sv2a/…) populated by the BrightData scraper, used by enrich Strategy 0 and the image-URL builder. |
| `cardmarket_products` | 67K product entries | From the public S3 dump `products_singles_6.json`. |
| `cardmarket_pricing` | 67K pricing rows (low / trend / avg + holo variants) | From the public S3 dump `price_guide_6.json`. Refreshed daily. |
| `cardmarket_card_index` | Fast-path lookup `(id_expansion, set_number) → id_product` | Populated by the BrightData scraper at [`scrapers/cardmarket/`](../scrapers/cardmarket/) — see [CARDMARKET_MAPPING.md](CARDMARKET_MAPPING.md). |

### Dashboard (Phase 5)

Two time-series tables power the dashboard KPIs and charts — OCR cost logs and daily stock value snapshots.

| Table | Purpose |
|---|---|
| `ocr_usage_log` | Per-OCR-call cost log (engine, tokens, EUR cost). Used by KPI tile + cost chart. |
| `stock_value_snapshots` | Daily snapshot of stock value, written by the pricing cron. Used by stock-value chart. |

---

## 📜 Migrations chronology

Migrations are applied chronologically and named by phase. All migration files live in [`supabase/migrations/`](../supabase/migrations/) and apply in alphabetical order (timestamp prefix). Here's the timeline.

| File | Purpose |
|---|---|
| `20260425224142_initial_schema.sql` | Enums + `cards`, `lots`, `rarity_ranks`, `config`. RPC `replace_pokedex_card`. Storage buckets `card-photos` + `lot-photos` with RLS. |
| `20260428114538_tcg_catalog.sql` | `tcg_catalog` table for the LimitlessTCG mirror. |
| `20260429142350_add_cards_variant.sql` | `variant text` column on `cards`. |
| `20260430130000_phase21_vinted_unique_listed.sql` | Unique partial index for for-sale per group. |
| `20260430200000_fix_replace_pokedex_card_3step.sql` | 3-step rewrite of `replace_pokedex_card` to fix unique-constraint collisions. |
| `20260502120000_lots_vinted_bundle.sql` | Extends `lots` with 11 columns for bundle listings. Adds `lot-photos` bucket. |
| `20260504000000_rename_zh_to_cn.sql` | Renames language enum `ZH` → `CN` end-to-end. |
| `20260504100000_tcg_catalog_illustrator.sql` | Adds `illustrator` column to `tcg_catalog` + index. |
| `20260505000000_phase4_multi_user.sql` | `user_profiles`, `card_listings`, `lot_listings`. Drops `vinted_listed_at` from cards/lots. RLS scoped by `auth.uid()` on listings. Seeds user profiles. |
| `20260505100000_sold_by_user.sql` | `sold_by_user_id` on cards + lots. |
| `20260506140000_pokemon_number_nullable.sql` | Allows null `pokemon_number` (Trainer / Energy cards). |
| `20260506150000_pokemon_name_nullable.sql` | Allows null `pokemon_name`. |
| `20260507000000_phase5_dashboard.sql` | `ocr_usage_log` + `stock_value_snapshots` tables. |
| `20260507100000_phase5_manual_backups_bucket.sql` | `manual-backups` storage bucket. |
| `20260507200000_cardmarket_dumps.sql` | `cardmarket_expansions`, `cardmarket_products`, `cardmarket_pricing`. |
| `20260508000000_cardmarket_card_index.sql` | `cardmarket_card_index` for fast-path lookup. |
| `20260509000000_cardmarket_url_path.sql` | Adds `url_path` to card_index + `cardmarket_url` to cards. |
| `20260510000000_cron_pricing_index.sql` | Partial index `cards (cm_updated_at asc nulls first) where status = 'for_sale'` — backs the cron's bulk query that picks the 200 oldest for-sale cards. |
| `20260510100000_multilang_names.sql` | Multilingual name columns: `cards.{pokemon_name_ocr,card_name_ocr,set_name_ja}` + `cardmarket_expansions.{name_en,name_ja}` for bilingual display. |
| `20260510200000_cardmarket_set_prefix.sql` | Adds `cardmarket_expansions.set_prefix` (S3 image-URL prefix like BRS/LOR/sv2a, used by enrich Strategy 0 + image builder). Initial backfill from `url_path` slug patterns. |
| `20260510210000_cardmarket_set_prefix_fix.sql` | Re-derive `set_prefix` with case-insensitive regex (handles JP codes like sv1a/sv2a) + majority-vote per expansion. Replaces buggy distinct-on-without-order-by from previous migration. |

### Apply

```bash
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push
```

If migrations were applied manually (via SQL Editor), tell the CLI:

```bash
npx supabase migration repair --status applied <TIMESTAMP>
```

### Add a new migration

```bash
npx supabase migration new <descriptive_name>
# edit the generated file in supabase/migrations/
npx supabase db push
```

---

## 🔐 Row-Level Security policies

Every table has RLS enabled. Read access is granted to any authenticated user — the app is a 2-user whitelist and the data is shared. Writes are scoped where it matters.

### Cards / lots — shared, mono-user

`cards` and `lots` are mono-user shared inventory. RLS grants `for all to authenticated` — any authenticated user can read and write any row. There is no per-row ownership; the two collectors are equal collaborators on the same pile of cards.

```sql
create policy "authenticated_all" on cards
  for all to authenticated using (true) with check (true);
-- same shape on lots
```

Mutations still flow through the API routes (which use the service client for consistency with the catalog/Cardmarket tables and to keep "infrastructure write" and "user write" in the same place), but RLS is the floor: a logged-in user *could* write directly via the SDK if they wanted to. The per-user write protection lives one layer up, on the listings tables.

### Catalog / Cardmarket — read-only

`tcg_catalog` and the four `cardmarket_*` tables are read-only to authenticated users. Writes happen exclusively from the bootstrap and dump-upload scripts via the service role.

```sql
create policy "<name>_read" on <table>
  for select to authenticated using (true);
```

### Listings — per-user writes

```sql
-- card_listings + lot_listings
create policy listings_read on card_listings
  for select using (auth.uid() is not null);

create policy listings_insert on card_listings
  for insert with check (auth.uid() = user_id);

create policy listings_delete on card_listings
  for delete using (auth.uid() = user_id);
```

This guarantees a user can only mark *their own* Vinted account as listing/unlisting a card.

### Storage buckets

`card-photos` and `lot-photos` accept upload/read from authenticated users only:

```sql
create policy card_photos_select on storage.objects
  for select using (bucket_id = 'card-photos' and auth.uid() is not null);

create policy card_photos_insert on storage.objects
  for insert with check (bucket_id = 'card-photos' and auth.uid() is not null);
```

`manual-backups` is service-role only (downloads use signed URLs with 1h expiry).

---

## 🪣 Storage buckets

Three buckets handle photos and backups. Card and lot photos use signed URLs. Manual backups are service-role only.

| Bucket | Public | Purpose |
|---|---|---|
| `card-photos` | Yes (signed URLs) | Card photos uploaded via scanner. |
| `lot-photos` | Yes (signed URLs) | Lot photos uploaded via the lot form. |
| `manual-backups` | No | Manual JSON backup dumps. Service-role write, signed URL read. |

---

## ⚡ Database functions / RPCs

One RPC handles the tricky case where you want to swap a Pokédex card but the slot is already occupied.

### `replace_pokedex_card(old_card_id uuid, new_card_id uuid, target_status text)`

Atomic Pokédex slot swap. Used when you want to put a freshly scanned card into a Pokédex slot already occupied by another card.

3-step transaction (rewritten in migration `fix_replace_pokedex_card_3step`):
1. Move the existing pokedex card to a temporary status to free the unique constraint.
2. Move the new card to `pokedex`.
3. Move the existing card to its final destination (`for_sale` or `collection`).

This avoids a unique-constraint collision on `one_pokedex_per_pokemon` that the naive 2-step approach would trigger.

Called from [`/api/pokedex/replace`](../app/api/pokedex/replace/route.ts).

---

## ♻️ Reset procedure

When you need to wipe everything and start fresh on a new Supabase project — region change, polluted state, whatever — here's the full reset choreography.

### 1. Create the new project
- New project on Supabase dashboard.
- Get the URL + anon key + service role key.
- Update `.env.local` with the new values.

### 2. Re-link the CLI
```bash
rm -rf .supabase                                    # clears local cache pointing to old project
npx supabase login                                   # if not already logged in
npx supabase link --project-ref <NEW_PROJECT_REF>
```

### 3. Apply all migrations
```bash
npx supabase db push --include-all
```

Verify in the SQL Editor:
```sql
\dt   -- should list all 12 user tables + storage buckets
```

### 4. Create the auth users
**Supabase dashboard → Authentication → Users → Add user → Create new user** (×2). Disable invite email.

Update `user_profiles` with the new UUIDs:
```sql
update user_profiles set display_name = 'Lui'  where user_id = '<user-1-uuid>';
update user_profiles set display_name = 'Elle' where user_id = '<user-2-uuid>';
```

### 5. Populate the catalog
```bash
npx tsx scripts/scrape-limitlesstcg.ts              # ~12 min, or 3h with SCRAPE_ILLUSTRATOR=1
```

### 6. Pull Cardmarket dumps
```bash
npm run upload-cardmarket-dumps                      # ~30 sec
```

### 7. Optional — populate the Cardmarket index
```bash
npx tsx scripts/recommend-scrape-targets.ts          # outputs targeted scrape command
npm run scrape-cardmarket -- <slugs>                 # ~10-20 min for typical user collection
```

### 8. Optional — seed test cards
```bash
npx tsx scripts/seed/seed.ts                         # ⚠️ wipes cards table, then inserts ~30 representative cards
```

### 9. Smoke test
```bash
rm -rf .next                                         # clear stale Next cache
npm run dev
```

Then click through:
- `/pokedex` — slots load, search works
- `/stock` — count chips work, +/- clones/deletes
- `/vinted` — chips filter correctly
- `/dashboard` — KPIs + charts render
- `/options` — theme toggle, sign out, manual backup all work

---

## 🔍 Inspection queries

A handful of useful queries to inspect your data — card distribution, catalog coverage, Cardmarket scrape progress, OCR cost breakdown, and stale Vinted listings that need a bump.

### Card distribution
```sql
select status, count(*) from cards group by 1 order by 1;
```

### Catalog by language
```sql
select language, count(*) from tcg_catalog group by 1 order by 1;
```

### Cardmarket scrape coverage
```sql
select count(distinct id_expansion) as scraped_expansions,
       count(*) as scraped_cards
from cardmarket_card_index;
```

### Recent OCR cost
```sql
select date_trunc('day', created_at) as day,
       engine,
       count(*),
       round(sum(cost_eur)::numeric, 4) as eur
from ocr_usage_log
where created_at > now() - interval '30 days'
group by 1, 2
order by 1 desc, 2;
```

### Stale listings (need a Vinted bump)
```sql
select c.card_name, l.listed_at
from card_listings l
join cards c on c.id = l.card_id
where l.user_id = auth.uid()
  and c.status = 'for_sale'
  and l.listed_at < now() - interval '28 days'
order by l.listed_at;
```
