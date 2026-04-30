# Seed script

One-shot script to wipe + re-populate the I.R.I.S DB with realistic test data based on `cards_assets/`.

## Run

```bash
source ~/.nvm/nvm.sh && nvm use 22
npx tsx scripts/seed/seed.ts
```

## What it does

1. **Wipes** all rows from the `cards` table (keeps the schema + buckets).
2. **Uploads** each photo from `cards_assets/` to the `card-photos` bucket.
3. **Fetches metadata** from TCGdex for each card (pokemon_name, set_name, tcg_image_url, etc.) using the parsed `set_code + set_number`.
4. **Inserts** ~30 rows spread across:
   - 2 sold (7%)
   - 5 pokedex (17%)
   - 5 collection (17%)
   - ~18 for_sale (~half listed on Vinted via `vinted_listed_at`)
5. `date_added` randomized over the last 30 days so some cards naturally fall into "À rafraîchir".

## Requirements

`.env.local` must define:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Mapping

`scripts/seed/cards-mapping.csv` documents the parsing of `cards_assets/` filenames. Edit if the auto-parser misses something.

## Filename format

Expected pattern: `<setcode>_<number>_<rarity>[_<variant>].jpg`

Examples:
- `bw4_044_r.jpg` — set BW4, card 044, rarity R
- `sv11w_012_c_mb.jpg` — set SV11W, card 012, rarity C, variant Master Ball
- `xy_087.jpg` — set XY, card 087 (no rarity suffix)
- `smp_001_p.jpg` — set SMP, card 001, variant Promo

Rarity codes: `c`, `r`, `rr`, `rrr`, `sr`, `ar`, `cr`, `a`, `h`, `k`, `p`  
Variant codes: `mb` (masterball), `pb` (pokeball), `rh` (reverse_holo), `p` (promo)
