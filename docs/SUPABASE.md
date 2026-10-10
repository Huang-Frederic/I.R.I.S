# Supabase reference

The database, auth, storage and realtime reference for I.R.I.S. The source of truth is [`supabase/migrations/`](../supabase/migrations/): 71 files, from `20260425224142_initial_schema.sql` to `20261006120000_other_items_package_size.sql`. Together they create 33 public tables, 4 enums, 7 functions (5 callable, 2 trigger functions), 2 triggers, 1 `pg_cron` job and 4 storage buckets.

Everything here was checked against those files and against a local database built from them on 2026-10-10 (33 tables, row-level security enabled on every one, 82 policies on the public schema). Settings that live only in the Supabase dashboard (auth options, publications changed by hand) cannot be checked from the repository; where that matters, the text says so. For how the app uses this data, see [ARCHITECTURE.md](ARCHITECTURE.md); for provisioning a project, see [SETUP.md](SETUP.md).

## Table of contents

- [Overview](#overview)
- [Tables](#tables)
  - [Access codes](#access-codes)
  - [Shared inventory](#shared-inventory)
  - [Per-user listings and owner-only items](#per-user-listings-and-owner-only-items)
  - [Catalog and pricing](#catalog-and-pricing)
  - [Vinted bot](#vinted-bot)
  - [PTCG game analysis](#ptcg-game-analysis)
  - [Platform](#platform)
- [Enums and constrained columns](#enums-and-constrained-columns)
- [Functions and triggers](#functions-and-triggers)
- [Scheduled jobs](#scheduled-jobs)
- [Realtime](#realtime)
- [Storage buckets](#storage-buckets)
- [Row-level security](#row-level-security)
  - [Access patterns](#access-patterns)
  - [Why every signed-in user is trusted](#why-every-signed-in-user-is-trusted)
  - [The owner UUID](#the-owner-uuid)
  - [Restrictive policies](#restrictive-policies)
  - [Service-role writes](#service-role-writes)
- [Migrations](#migrations)
  - [Applying migrations](#applying-migrations)
  - [Adding a migration](#adding-a-migration)
  - [Migration index](#migration-index)
- [Backups and what they cover](#backups-and-what-they-cover)
- [Reset from scratch](#reset-from-scratch)
  - [Local database](#local-database)
  - [New hosted project](#new-hosted-project)
  - [Restoring catalog data](#restoring-catalog-data)
- [The 1000-row cap](#the-1000-row-cap)
- [Inspection queries](#inspection-queries)

## Overview

| What | Count | Notes |
|---|---|---|
| Public tables | 33 | Grouped below. All have row-level security enabled. |
| Enums | 4 | `card_language`, `card_condition`, `card_status`, `card_rarity`. |
| Functions | 7 | 5 callable (`replace_pokedex_card`, `insert_daily_price_snapshot`, `downsample_price_history`, `price_history_global_stats`, `price_history_top_movers`) and 2 trigger functions. |
| Triggers | 2 | `cards_set_rarity_rank`, `other_items_status_update_queue_sync`. |
| `pg_cron` jobs | 1 | `downsample-price-history`, Sundays 04:00 UTC. The extension must be enabled before the migrations run. |
| Storage buckets | 4 | `card-photos`, `lot-photos`, `other-item-photos` (public reads) and `manual-backups` (private). |
| Realtime tables | 1 | The migrations publish only `vinted_post_jobs`; the browser also subscribes to `card_listings`, which no migration publishes. |
| Migrations | 71 | `20260425224142` to `20261006120000`. |

Three facts shape the rest of this page:

- **Two collectors, one inventory.** `cards` and `lots` are open to every signed-in user. Per-user state (Vinted listings, the posting queue, PTCG games) is keyed on `user_id`. One feature, the Items (`other_items`), is restricted to a single hard-coded account.
- **The browser talks to the database directly.** It uses the anon key and the user's session, so row-level security is the real access control. Server routes use the same session client for user-initiated writes and the service role for infrastructure writes.
- **Signups must stay disabled.** The shared tables trust any signed-in session, so the project must contain only the intended accounts. See [Why every signed-in user is trusted](#why-every-signed-in-user-is-trusted).

## Tables

### Access codes

The Read and Write columns use these codes. "R" means `select`; "W" means `insert`, `update` and `delete` unless a note says otherwise.

| Code | Meaning |
|---|---|
| All | Any signed-in user (the `authenticated` role). |
| Own | Only rows whose `user_id` is the caller's (`user_id = auth.uid()`). |
| Parent | Inherited from the parent row through a policy that checks the parent's `user_id`. |
| Owner | Only the single account whose id is hard-coded in the policies. See [The owner UUID](#the-owner-uuid). |
| Service | No policy lets a signed-in user write. Rows are written with the service role, which bypasses row-level security. See [Service-role writes](#service-role-writes). |

### Shared inventory

| Table | Purpose and key columns | Read | Write |
|---|---|---|---|
| `cards` | One row per physical card. `status` (`card_status`), `language`, `condition`, `variant`, `rarity` (`rarity_rank` is filled by a trigger), `set_code`, `set_number`, `card_id_tcg`; Cardmarket data `cardmarket_id`, `cardmarket_url`, `cm_price_low`, `cm_price_trend`, `cm_price_avg`, `cm_updated_at`; `suggested_price` and `price_confirmed_at` (a card enters the Vinted queue only once its price is confirmed); `lot_id`; sale fields `date_sold`, `sold_price`, `sold_by_user_id`; trade fields `traded_at`, `traded_by_user_id`, `trade_photo_url`. | All | All |
| `lots` | Vinted listings that are not tracked card by card: bundles of cards, single cards from other games, goodies (`is_lot` tells a bundle from a single). `name`, `price`, `status` (`for_sale`, `collection`, `sold`), `quantity` (identical copies; selling one splits a sold clone off the row), `photo_urls` (jsonb array of storage paths), Vinted `catalog_id`, `brand_id`, `brand_name`, `brand_label`, `sold_by_user_id`. | All | All |
| `rarity_ranks` | Lookup `rarity` to `rank` and `label`, used by the `set_rarity_rank` trigger. Seeded by the first migration (`SAR` 9 down to `OTHER` 0). | All | Service |

Notes on `cards`:

- `one_pokedex_per_pokemon` is a partial unique index on `pokemon_number` where `status = 'pokedex'`: one Pokédex card per species.
- `one_for_sale_per_group` is a partial unique index on `coalesce(card_id_tcg, '')`, `language`, `condition`, `coalesce(variant, 'standard')` where `status = 'for_sale'`: one for-sale card per printing, language, condition and variant.
- `idx_cards_for_sale_cm_updated_at` indexes `cm_updated_at` (nulls first) where `status = 'for_sale'`. `idx_cards_search` is a GIN full-text index over the name, set and number columns.
- `pokemon_name` and `pokemon_number` are nullable (Trainers and Energies have neither); `pokemon_number` is still constrained to 1 through 1025 when set.

### Per-user listings and owner-only items

| Table | Purpose and key columns | Read | Write |
|---|---|---|---|
| `card_listings` | Which user has which card live on their own Vinted account. Primary key `(card_id, user_id)`; `listed_at`, `vinted_listing_id`, `vinted_posted_at`, `repost_position`. | All | Own |
| `lot_listings` | Same shape for lots. Primary key `(lot_id, user_id)`. | All | Own |
| `other_items` | Non-card Vinted products (clothes, electronics). `name`, `description`, `price`, `photo_urls`, `vinted_catalog_id`, `vinted_catalog_path`, `brand_name`, `vinted_condition_id`, `size`, `vinted_size_id`, `vinted_color_ids` (at most 2), `vinted_package_size_id`, `status` (`for_sale`, `collection`, `sold`). | Owner | Owner |
| `other_item_listings` | Listing state for `other_items`; same shape as `card_listings`. | Owner | Owner (and `user_id` must be the caller) |

### Catalog and pricing

| Table | Purpose and key columns | Read | Write |
|---|---|---|---|
| `tcg_catalog` | Local mirror of LimitlessTCG cards (EN, FR, JP). `set_code`, `set_number`, `set_total`, `language`, `card_name`, `pokemon_name`, `pokemon_number`, `set_name`, `rarity`, `image_url`, `illustrator`; unique on `(set_code, set_number, language)`. The committed snapshot holds 52,724 rows. | All | Service |
| `cardmarket_expansions` | Cardmarket expansions. `id_expansion` (primary key), `name` (French), `name_normalized`, `name_en`, `name_ja`, `set_prefix` (the prefix in Cardmarket image URLs, such as `BRS` or `sv2a`). The committed snapshot holds 741 rows, 645 with a `set_prefix`. | All | Service |
| `cardmarket_products` | Singles from Cardmarket's public product dump. `id_product`, `name`, `card_prefix`, `card_prefix_normalized`, `id_expansion` (foreign key), `id_metacard`. | All | Service |
| `cardmarket_pricing` | Price guide per product. `low`, `trend`, `avg`, `avg1`, `avg7`, `avg30`, the three holo variants, `updated_at`. | All | Service |
| `cardmarket_card_index` | Map `(id_expansion, set_number)` to `id_product`, built by the gallery scraper. `url_variant`, `url_path`, `language`. The committed snapshot holds 48,457 rows. | All | Service |
| `price_history` | Per-card price snapshots. Primary key `(card_id, granularity, bucket_date)`; `granularity` is `daily`, `weekly` or `monthly`; `cm_price_low`, `cm_price_trend`, `cm_price_avg`, `source_freshness_days`. Filled by `insert_daily_price_snapshot()` and thinned by `downsample_price_history()`. | All | Service |

How the Cardmarket tables fit together is described in [CARDMARKET_MAPPING.md](CARDMARKET_MAPPING.md).

### Vinted bot

| Table | Purpose and key columns | Read | Write |
|---|---|---|---|
| `vinted_post_jobs` | Job queue between the web app and the Python agent. Exactly one of `card_id`, `lot_id`, `other_item_id`; `user_id`; `job_type` (`post`, `repost`, `delete`); `status` (`pending`, `processing`, `done`, `error`); `triggered_by` (`schedule`, `manual`); `error`. Published to Realtime. | All (rows for Items: Owner) | Own; the agent writes with the service role |
| `vinted_queue` | Ordered "new posts" queue, one row per user and card, lot or item. `position`, `last_error` and `failed_at` (a failed row is flagged so the scheduler skips it). Unique per `(user_id, card_id)`, `(user_id, lot_id)`, `(user_id, other_item_id)`. | All (rows for Items: Owner) | Own |
| `vinted_bot_schedule` | Posting windows per user. `block` (`weekday` or `weekend`), `starts_at`, `ends_at`. | All | Own |
| `vinted_bot_config` | One row per user. `daily_quota` (default 8), `repost_after_days` (default 14), `group_priority` (jsonb list of group names). | All | Own (no delete) |
| `vinted_sessions` | Vinted cookies per user (`cookies` jsonb); the source of truth the agent syncs to its local files. | Own | Own (no delete); pasting a partner's cookies goes through `POST /api/vinted/sessions` with the service role |
| `vinted_agent_logs` | Mirror of the agent's log for the monitoring page. `level` (`info`, `warn`, `error`), `message`. | All | Service |
| `agent_heartbeats` | Agent liveness. `user_id` (primary key), `last_seen_at`. The agent upserts every 30 seconds; the UI polls and treats a heartbeat under 90 seconds old as online. | All | Service |
| `vinted_catalog_attributes` | Per-category Vinted attributes (sizes, accepted conditions, colour) used by the Items form. The app inserts a `pending` row; the bot, which holds the Vinted session, fills it. `catalog_id` (primary key), `status`, `size_options`, `size_required`, `condition_options`, `has_color`. | Owner | Owner (no delete); the bot writes with the service role |

### PTCG game analysis

| Table | Purpose and key columns | Read | Write |
|---|---|---|---|
| `ptcg_cards` | Game reference data from TCGdex (HP, attacks, abilities), distinct from `tcg_catalog`. Primary key `(ptcgl_id, language)`; `tcgdex_id`, `set_code`, `set_number`, `name`, `category`, `attacks`, `abilities`. | All | All (insert and update, no delete) |
| `ptcg_games` | One imported Pokémon TCG Live game. `raw_log` (the source of truth), `log_hash` (unique per user), `state`, `validation`, `result`, `my_archetype`, `opponent_archetype`, `my_archetype_dex`, `opponent_archetype_dex`, `my_key_card`, `opponent_key_card`, `play_score` (0 to 100), `went_first`. | Own | Own |
| `ptcg_analyses` | Analyses of a game, one row per run. `game_id`, `source` (`rules`, `llm`, `manual`), `verdict`, `moments`, `patterns` (GIN index), `checklist`. | Parent | Parent (insert and delete, no update) |
| `ptcg_drill_profiles` | Saved decklists for the prize-check Drill. `name`, `cards`, `target_ids`, `pokemon_number`. | Own | Own |
| `ptcg_tournaments` | Recorded tournaments. `name`, `played_at` (a date), `category`, `best_of` (1 or 3), `placement`, `my_archetype_dex`. | Own | Own |
| `ptcg_tournament_rounds` | Rounds of a tournament. `round_number` (unique per tournament), `opponent_archetype_dex`, `games` (jsonb), `outcome` (`id`, `no_show`, `bye`). | Parent | Parent |

### Platform

| Table | Purpose and key columns | Read | Write |
|---|---|---|---|
| `user_profiles` | Display names. `user_id` (primary key), `display_name`. The app falls back to the account's email when a row is missing. | All | Own (insert and update, no delete) |
| `config` | Key/value settings. Seeded with `price_coefficient` (`0.85`, no longer read by any code), `vinted_shipping_note` and `vinted_seller_note` (both used in Vinted listing text). | All | Service (no app write path; edit from the SQL editor) |
| `ocr_usage_log` | One row per OCR call. `engine` (`gemini` or `vision`), `tokens_in`, `tokens_out`, `cost_eur`, `card_id`, `user_id`. Feeds the dashboard cost tiles. | All | Service (`/api/ocr`) |
| `stock_value_snapshots` | Daily stock value. `date` (primary key), `value_for_sale`, `value_collection`, `value_pokedex` and the matching `count_*` columns. | All | Service (price refresh route) |
| `audit_logs` | Activity feed. `actor_type` (`user`, `agent`, `system`), `actor_user_id`, `action`, `entity_type`, `entity_id`, `details`. | All | Service |
| `store_events` | Local Pokémon shop events scraped by `scripts/store-events`. `source`, `shop_name`, `city`, `title`, `event_type`, `starts_at`, `ends_at`, `spots_left`, `url`, `price`, `external_id` (unique). | All | Service |

## Enums and constrained columns

| Enum | Values | Used by |
|---|---|---|
| `card_language` | `JP`, `EN`, `FR`, `DE`, `IT`, `ES`, `KO`, `PT`, `CN`, `ZH` | `cards.language`, `lots.language`, `tcg_catalog.language`, `ptcg_cards.language` |
| `card_condition` | `NM`, `EX`, `GD`, `PL`, `PO` | `cards.condition`, `lots.condition` |
| `card_status` | `pokedex`, `for_sale`, `collection`, `sold`, `traded` | `cards.status` |
| `card_rarity` | `SAR`, `AR`, `SR`, `CHR`, `RR`, `R_HOLO`, `R`, `UC`, `C`, `OTHER` | `cards.rarity`, `tcg_catalog.rarity`, `rarity_ranks.rarity` |

- `ZH` is deprecated. Postgres cannot drop an enum value, so `20260504000000_rename_zh_to_cn.sql` added `CN` before it and moved existing rows. The app writes `CN`; `/api/ocr` maps Gemini's `ZH` to `CN`.
- `traded` was added by `20260720100000_trade_status.sql`.

Columns that use a `check` constraint instead of an enum type:

| Column | Allowed values |
|---|---|
| `lots.status`, `other_items.status` | `for_sale`, `collection`, `sold` |
| `vinted_post_jobs.status` | `pending`, `processing`, `done`, `error` |
| `vinted_post_jobs.job_type` | `post`, `repost`, `delete` |
| `vinted_post_jobs.triggered_by` | `schedule`, `manual` |
| `vinted_post_jobs`, `vinted_queue` targets | Exactly one of `card_id`, `lot_id`, `other_item_id` is set (`vinted_post_jobs_one_target`, `vinted_queue_one_target`) |
| `vinted_bot_schedule.block` | `weekday`, `weekend` |
| `vinted_agent_logs.level` | `info`, `warn`, `error` |
| `vinted_catalog_attributes.status` | `pending`, `ready`, `error` |
| `ocr_usage_log.engine` | `gemini`, `vision` |
| `price_history.granularity` | `daily`, `weekly`, `monthly` |
| `audit_logs.actor_type` | `user`, `agent`, `system` |
| `store_events.event_type` | `league`, `tournament`, `prerelease`, `league_cup`, `league_challenge` |
| `ptcg_games.result` | `win`, `loss`, `tie` |
| `ptcg_analyses.source` | `rules`, `llm`, `manual` |
| `ptcg_tournaments.category` | `online`, `locals`, `challenge`, `cup`, `regionals`, `internationals`, `worlds` |
| `ptcg_tournaments.placement` | `no_placement`, `dropped`, `winner`, then `top_2` through `top_1024` |
| `ptcg_tournament_rounds.outcome` | `id`, `no_show`, `bye` (or null for a played round) |

## Functions and triggers

All functions are in the `public` schema and run with the caller's rights (`security invoker`), except `sync_other_item_queue_on_status_change`.

| Name | Defined in | Called by | What it does |
|---|---|---|---|
| `replace_pokedex_card(old_card_id uuid, old_new_status card_status, new_card_id uuid)` | `20260430200000` (replaces the 2-step version from `20260425224142`) | `POST /api/pokedex/replace`, with the user's session | Atomic Pokédex swap in three steps: park the old card in `collection`, promote the new card to `pokedex`, then move the old card to `old_new_status` (`for_sale` or `collection`). Parking first avoids collisions on `one_pokedex_per_pokemon` and `one_for_sale_per_group`. It still raises when a third card of the same for-sale group exists; the route turns that into a 409 `for_sale_conflict`. |
| `insert_daily_price_snapshot()` returns `int` | `20260513010000` | `/api/prices/snapshot` with the service role (Vercel cron, 23:55 UTC) | Upserts one `daily` row per priceable card (`status` in `for_sale`, `collection`, `pokedex`, with a `cm_price_avg`) into `price_history`. Idempotent within a day; returns the number of rows touched. |
| `downsample_price_history()` returns `void` | `20260513000000` | `pg_cron`, Sundays 04:00 UTC | Turns `daily` rows older than 90 days into `weekly` rows (median per week, keyed on the Monday), then `weekly` rows older than 365 days into `monthly` rows (median, keyed on the 1st). Each step deletes and inserts in one statement. |
| `price_history_global_stats(period_days int)` | `20260513400000` (redefines `20260513100000`) | `components/prices/StatsHeader.tsx`, user session | Returns `cards_up`, `cards_down`, `cards_stable` and `mean_volatility_pct` over the period. A card with no baseline, or a move under 0.01, counts as stable. |
| `price_history_top_movers(period_days int, direction text)` | `20260520000000` (redefines `20260513300000`) | `components/prices/TopMoversPanel.tsx`, user session | Top 10 cards for `direction` `up` or `down` by percentage change of `cm_price_avg`, comparing the latest daily row with the latest one at least `period_days` old. Only cards currently worth 1 EUR or more are considered. |
| `set_rarity_rank()` (trigger function) | `20260425224142` | Trigger `cards_set_rarity_rank`: before insert, or before update of `rarity`, on `cards` | Copies `rarity_ranks.rank` into `cards.rarity_rank` (0 when the rarity is unknown). |
| `sync_other_item_queue_on_status_change()` (trigger function) | `20261002130100` | Trigger `other_items_status_update_queue_sync`: after update of `status` on `other_items` | Keeps `vinted_queue` in step when an item is edited outside the app, for example in the table editor. `for_sale` and not yet listed adds the item at the end of the owner's queue; any other status removes it. It does not fire on insert (the API route handles that). `security definer` with `search_path = public`; the owner UUID is hard-coded in the function body. |

The two `price_history_*` functions are granted to `authenticated`.

## Scheduled jobs

One job lives in the database, scheduled with `pg_cron`:

| Job | Schedule (UTC) | Command |
|---|---|---|
| `downsample-price-history` | `0 4 * * 0` (Sundays 04:00) | `select downsample_price_history();` |

**`pg_cron` must be enabled before the migrations run.** `20260513000000_price_history.sql` calls `cron.schedule(...)` but nothing in the migration chain creates the extension. On a hosted project, enable it first (dashboard, Database, Extensions, `pg_cron`). Otherwise `supabase db push` stops at that migration with `schema "cron" does not exist`; the migrations before it stay applied, so enable the extension and push again. On a local stack the extension has to be created by an earlier migration; see [Local database](#local-database).

```sql
-- Is the job there?
select jobname, schedule, command, active from cron.job;

-- Run it by hand
select downsample_price_history();

-- Last runs
select status, start_time, return_message
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'downsample-price-history')
order by start_time desc
limit 5;
```

Everything else that runs on a schedule lives outside the database and is configured in [SETUP.md](SETUP.md). Their effect on the database:

| Scheduler | When (UTC) | Writes |
|---|---|---|
| Vercel cron `/api/prices/update?limit=700` | 08:00, 14:00, 20:00 | `cards` price columns, `stock_value_snapshots` |
| Vercel cron `/api/prices/snapshot` | 23:55 | `price_history` through `insert_daily_price_snapshot()` |
| GitHub Action `cardmarket-prices.yml` | 01:07 | `cardmarket_expansions`, `cardmarket_products`, `cardmarket_pricing` |
| GitHub Action `store-events.yml` | every 30 minutes | `store_events` |
| GitHub Action `backup.yml` | 03:00 | nothing; reads 8 tables with `pg_dump` |
| Vinted agent loops | continuous | `vinted_post_jobs`, `vinted_queue`, `agent_heartbeats`, `vinted_agent_logs`, `vinted_sessions`, `vinted_catalog_attributes`, `audit_logs`, the listing tables |

## Realtime

Only one table is published. `20260603000000_vinted_posting.sql` runs `alter publication supabase_realtime add table vinted_post_jobs;`, and a database built from the migrations has no other table in that publication.

| Subscriber | Table | Filter | Purpose |
|---|---|---|---|
| `components/vinted/monitoring/hooks/useActiveJob.ts` (browser) | `vinted_post_jobs` | All events, `user_id=eq.<me>` | Live "currently posting" state on `/vinted/bot`. |
| `vinted-agent/main.py` (service role) | `vinted_post_jobs` | `INSERT` | Wakes the agent as soon as a job is queued. It also drains pending jobs at startup. |
| `components/vinted/hooks/useRealtimeListingsRefresh.ts` (browser) | `card_listings` | All events, `user_id=eq.<me>` | Calls `router.refresh()` (debounced 2 seconds) when the partner's promote-after-sold changes this user's listing rows. |

**No migration enables Realtime for `card_listings`.** Unless it was enabled by hand in the dashboard (Database, Publications, `supabase_realtime`), the third subscription connects but never receives an event, and the page only picks up the change on its next navigation or manual refresh. To enable it:

```sql
alter publication supabase_realtime add table public.card_listings;
```

`agent_heartbeats` does not use Realtime: `lib/hooks/useAgentStatus.ts` polls it every 30 seconds.

## Storage buckets

| Bucket | Public read | Object paths | Written by | Storage policy |
|---|---|---|---|---|
| `card-photos` | Yes | `<card id>.jpg` (scan upload and photo replacement; deleting a card removes it), `<random uuid>.jpg` (batch import), `trades/<uuid>.jpg` (photo of a trade batch) | Any signed-in user | `authenticated_card_photos_all`: all operations for `authenticated` on this bucket |
| `lot-photos` | Yes | `<lot id>/<n>.jpg` | Any signed-in user | `authenticated_lot_photos_all`: all operations for `authenticated` |
| `other-item-photos` | Yes | `<other item id>/<n>.jpg` | Owner only | `fred only other_item_photos`: all operations, restricted to the owner UUID |
| `manual-backups` | No | `iris-YYYY-MM-DD-HHMMSS.json.gz` | Service role (`POST /api/backup/manual`) | None: only the service role can reach it. Downloads use a signed URL valid for one hour. |

"Public read" means anyone with an object's URL can fetch it without signing in (`<project url>/storage/v1/object/public/<bucket>/<path>`). The app builds those URLs itself. The photos are not secret, but they are not private either.

All four buckets are created by migrations (`20260425224142`, `20260507100000`, `20261002120000`). The photos in Storage are not part of any automated backup; see [Backups and what they cover](#backups-and-what-they-cover).

## Row-level security

Row-level security is enabled on all 33 tables, and no table is without a policy. There are 82 policies on the public schema (2 of them restrictive) and 3 on `storage.objects`. The service role bypasses all of them.

### Access patterns

| Pattern | Policy shape | Tables |
|---|---|---|
| Shared and open | `for all to authenticated using (true) with check (true)` | `cards`, `lots` |
| Shared read, per-user write | `select` open to `authenticated`; `insert`, `update`, `delete` require `user_id = auth.uid()` | `card_listings`, `lot_listings`, `vinted_queue`, `vinted_bot_schedule`, `vinted_bot_config`, `user_profiles`, `vinted_post_jobs` |
| Private to the user | Every defined operation requires `user_id = auth.uid()` | `ptcg_games`, `ptcg_drill_profiles`, `ptcg_tournaments`, `vinted_sessions` |
| Inherited from a parent | `exists (select 1 from <parent> where <parent>.id = <fk> and <parent>.user_id = auth.uid())` | `ptcg_analyses`, `ptcg_tournament_rounds` |
| Read-only reference data | `select` only; writes go through the service role | `rarity_ranks`, `config`, `tcg_catalog`, `cardmarket_*`, `price_history`, `ocr_usage_log`, `stock_value_snapshots`, `audit_logs`, `store_events`, `agent_heartbeats`, `vinted_agent_logs` |
| Shared reference, writable | `select`, `insert` and `update` open to `authenticated` | `ptcg_cards` |
| Owner only | `auth.uid() = '<owner uuid>'` | `other_items`, `other_item_listings`, `vinted_catalog_attributes`, bucket `other-item-photos` |

Details that the table hides:

- `vinted_post_jobs` has one "manage" policy for all operations (`user_id = auth.uid()`; inserts also require one target column to be set, whose existence check against the listing tables was removed in `20260616100000` and `20260616110000` because a first post has no listing row yet), plus a read policy open to all and one restrictive policy.
- `vinted_queue`, `vinted_bot_schedule`, `vinted_bot_config` and `vinted_agent_logs` have an owner-only `select` policy and, added later by `20260918141259`, a second `select` policy open to all, so each partner can see the other's bot status. Permissive policies are combined with OR, so the open one wins for reads.
- Gaps in the write policies: `user_profiles`, `vinted_bot_config`, `vinted_sessions` and `vinted_catalog_attributes` have no delete policy, and `ptcg_analyses` has no update policy (a re-analysis inserts a new row).

### Why every signed-in user is trusted

`cards` and `lots` carry no ownership column and grant every operation to `authenticated`. Nothing in the database tells the two collectors apart on those tables, and a stranger who could create an account would get the same access. The protection is that the project contains only the intended accounts: create them by hand and disable public signups in the dashboard (Authentication, Sign In / Providers, user signups). The app has no signup page; it only calls `signInWithPassword`. The anon key is public by design (it ships in the browser bundle), so while signups are open anyone can use it to create an account and get a session.

### The owner UUID

The Items feature is restricted to one account, and not through `user_id = auth.uid()`. The requirement was that the second account cannot use the feature at all, so the policies compare `auth.uid()` with one literal UUID. It appears in:

- the policies on `other_items`, `other_item_listings` and `vinted_catalog_attributes`, the storage policy on `other-item-photos`, the two restrictive policies below, and the body of `sync_other_item_queue_on_status_change()`;
- the application code, as `FRED_USER_ID` in `lib/vinted/other-item-queue-sync.ts` (API gating, queue sync, the submit tab), plus display-name maps in the dashboard and logs pages;
- the Python helper scripts and `vinted-agent/DEPLOY.md`.

The UUID starts with `35385d3c`. List every occurrence in tracked files with:

```bash
git grep -n 35385d3c
```

Two earlier migrations also name the original install's two user ids: `20260505000000_phase4_multi_user.sql` (listing backfill and `user_profiles` seed) and `20260505100000_sold_by_user.sql` (sold-by backfill). They are guarded or act on no rows, so they are harmless on an empty database.

To run your own instance with the Items feature, replace the UUID with your auth user id in the migrations before the first `db push` and in the code constants. On a project that has already been pushed, change the policies with a new migration instead of editing applied files. If you leave the UUID alone, nobody matches it and the Items feature stays unavailable; the Items tables are the only objects that depend on it.

### Restrictive policies

There are two, both from `20261002130000_other_items_restrict_cross_partner_read.sql`:

- `other_item rows in vinted_queue are fred only`
- `other_item rows in vinted_post_jobs are fred only`

Each is `as restrictive for select to authenticated using (other_item_id is null or auth.uid() = '<owner uuid>')`. The open cross-user read policies on those tables predate Items, and permissive policies are combined with OR, so adding an owner-only permissive policy would not have narrowed anything. A restrictive policy is combined with AND against the permissive ones: card and lot rows keep their cross-user visibility, and only rows with `other_item_id` set are hidden from everyone but the owner. They are the only restrictive policies in the schema.

### Service-role writes

The service role (`SUPABASE_SERVICE_ROLE_KEY`) bypasses row-level security. It is used by:

- **Next.js server code**, through `createServiceClient()` in `lib/supabase/service.ts` (marked `server-only`): `/api/prices/update` and `/api/prices/snapshot`, `/api/ocr` (usage log), `/api/backup/manual` and its `[filename]` route, `POST /api/vinted/sessions` (cross-user cookie paste, gated by `VINTED_USER_IDS`), the card and lot routes when they sync the partner's Vinted queue and enqueue cross-user delete jobs, `lib/utils/audit-log.ts`, and the manual backup list on the Options page.
- **Scripts and the Cardmarket scraper** under `scripts/` and `scrapers/cardmarket/`.
- **The Python agent**, whose `SUPABASE_KEY` is the service role key.
- **GitHub Actions** `cardmarket-prices.yml` and `store-events.yml`. `backup.yml` instead connects to Postgres directly with `SUPABASE_DB_URL`.
- **`pg_cron`**, which runs a job as the role that scheduled it.

Cross-user queue syncing needs the service role because the `vinted_queue` and `vinted_post_jobs` write policies are keyed on `user_id = auth.uid()`: a user's own session cannot touch the partner's rows.

## Migrations

### Applying migrations

```bash
npx supabase login                                  # once; opens the browser
npx supabase link --project-ref <PROJECT_REF>       # the subdomain of the project URL
npx supabase db push                                # applies, in order, the migrations the project does not have yet
```

`db push` asks for the database password chosen when the project was created. Enable `pg_cron` first (see [Scheduled jobs](#scheduled-jobs)). If some migrations were applied by hand in the SQL editor, tell the CLI so it does not run them again:

```bash
npx supabase migration repair --status applied <TIMESTAMP>
```

The chain replays on an empty database. `20260504000000_rename_zh_to_cn.sql` was rewritten to make that true: Postgres refuses to use a newly added enum value in the transaction that added it (SQLSTATE 55P04), and the CLI applies each file as one transaction, so its updates now run as dynamic SQL and only when a `ZH` row exists.

### Adding a migration

```bash
npx supabase migration new <descriptive_name>
# edit the generated file in supabase/migrations/
npx supabase db push
```

Lessons from the history of this folder:

- A file runs in one transaction. Do not use an enum value in the same file that adds it (`20260720100000_trade_status.sql` adds `traded` and only adds columns for that reason).
- Make data migrations safe to run twice or on an empty database (`20261005120000` is guarded on `vinted_size_id`; the phase 4 backfills check `auth.users`).
- Do not edit a migration that a live project has applied. Add a new one.

### Migration index

71 files, in the order they apply. The description of each comes from its header and body.

| # | File | What it does |
|---|---|---|
| 1 | `20260425224142_initial_schema.sql` | Enums, `rarity_ranks`, `lots` (minimal), `cards`, `config` (three seeded keys), trigger `cards_set_rarity_rank`, first `replace_pokedex_card`, buckets `card-photos` and `lot-photos`, open policies for authenticated users. |
| 2 | `20260428114538_tcg_catalog.sql` | `tcg_catalog` (LimitlessTCG mirror) with lookup indexes and authenticated read. |
| 3 | `20260429142350_add_cards_variant.sql` | `cards.variant`, free text; null means standard. |
| 4 | `20260430130000_phase21_vinted_unique_listed.sql` | Unique partial index `one_for_sale_per_group`; adds `cards.vinted_listed_at` (dropped by #9). |
| 5 | `20260430200000_fix_replace_pokedex_card_3step.sql` | Rewrites `replace_pokedex_card` as a three-step swap to avoid unique-index collisions. |
| 6 | `20260502120000_lots_vinted_bundle.sql` | Turns `lots` into a full listing entity (name, language, condition, price, status, photos, dates). |
| 7 | `20260504000000_rename_zh_to_cn.sql` | Adds `CN` to `card_language` (before the deprecated `ZH`) and moves existing `ZH` rows with dynamic SQL, so an empty database skips the updates. |
| 8 | `20260504100000_tcg_catalog_illustrator.sql` | `tcg_catalog.illustrator` and its index. |
| 9 | `20260505000000_phase4_multi_user.sql` | `card_listings`, `lot_listings`, `user_profiles`; guarded backfill from `vinted_listed_at`, then drops that column from `cards` and `lots`; policies. |
| 10 | `20260505100000_sold_by_user.sql` | `sold_by_user_id` on `cards` and `lots`, with a backfill for already-sold rows. |
| 11 | `20260506140000_pokemon_number_nullable.sql` | `cards.pokemon_number` becomes nullable (Trainers, Energies). |
| 12 | `20260506150000_pokemon_name_nullable.sql` | `cards.pokemon_name` becomes nullable. |
| 13 | `20260507000000_phase5_dashboard.sql` | `ocr_usage_log` and `stock_value_snapshots`. |
| 14 | `20260507100000_phase5_manual_backups_bucket.sql` | Private bucket `manual-backups`, with no storage policy (service role only). |
| 15 | `20260507200000_cardmarket_dumps.sql` | `cardmarket_expansions`, `cardmarket_products`, `cardmarket_pricing`. |
| 16 | `20260508000000_cardmarket_card_index.sql` | `cardmarket_card_index`. |
| 17 | `20260509000000_cardmarket_url_path.sql` | `cardmarket_card_index.url_path` and `cards.cardmarket_url`. |
| 18 | `20260510000000_cron_pricing_index.sql` | Partial index `idx_cards_for_sale_cm_updated_at`. |
| 19 | `20260510100000_multilang_names.sql` | `cards.pokemon_name_ocr`, `card_name_ocr`, `set_name_ja`; `cardmarket_expansions.name_en`, `name_ja` and their indexes. |
| 20 | `20260510200000_cardmarket_set_prefix.sql` | `cardmarket_expansions.set_prefix` with a first backfill from `url_path` (case-sensitive, so JP sets stayed null). |
| 21 | `20260510210000_cardmarket_set_prefix_fix.sql` | Resets and re-derives `set_prefix` with a case-insensitive majority vote; raises a notice with the counts. |
| 22 | `20260511000000_pokedex_snapshot_columns.sql` | `stock_value_snapshots.value_pokedex` and `count_pokedex`. |
| 23 | `20260513000000_price_history.sql` | `price_history`, `downsample_price_history()`, and the `pg_cron` job (needs `pg_cron`). |
| 24 | `20260513010000_insert_daily_price_snapshot.sql` | `insert_daily_price_snapshot()`. |
| 25 | `20260513100000_price_history_stats_rpc.sql` | First `price_history_global_stats`. |
| 26 | `20260513200000_stock_value_pokedex.sql` | Idempotent repeat of #22's columns, kept as the audit-trail entry. |
| 27 | `20260513300000_price_history_top_movers_rpc.sql` | First `price_history_top_movers`. |
| 28 | `20260513400000_price_history_global_stats_stable_fix.sql` | `price_history_global_stats` now counts cards without a baseline as stable. |
| 29 | `20260520000000_top_movers_left_join.sql` | `price_history_top_movers` rewritten with a left join and a baseline requirement. |
| 30 | `20260603000000_vinted_posting.sql` | `vinted_post_jobs`, temporary `cards.vinted_*` columns, and the table's addition to the `supabase_realtime` publication. |
| 31 | `20260605000000_vinted_jobs_user_id.sql` | `vinted_post_jobs.user_id`. |
| 32 | `20260606000000_vinted_jobs_type.sql` | `vinted_post_jobs.job_type` (`post`, `repost`). |
| 33 | `20260609000000_vinted_columns_per_user.sql` | Moves `vinted_listing_id` and `vinted_posted_at` from `cards` to `card_listings`; drops `cards.vinted_post_error`. |
| 34 | `20260615000000_vinted_lot_support.sql` | Lot support: `lot_listings.vinted_*`, `vinted_post_jobs.lot_id` with a one-target check, new job policy. |
| 35 | `20260616000000_lots_catalog_brand.sql` | `lots.catalog_id`, `brand_id`, `brand_name`. |
| 36 | `20260616100000_vinted_lot_job_rls_fix.sql` | Job policy: drops the lot-listing existence check, which blocked every first lot post. |
| 37 | `20260616110000_vinted_post_jobs_rls_v2.sql` | Same fix for cards; the policy becomes ownership plus "one target set". |
| 38 | `20260616120000_agent_heartbeats.sql` | `agent_heartbeats`. |
| 39 | `20260618000000_lots_is_lot_brand_label.sql` | `lots.is_lot` (backfilled from `catalog_id`) and `brand_label`. |
| 40 | `20260701000000_audit_logs.sql` | `audit_logs`. |
| 41 | `20260720100000_trade_status.sql` | `card_status` gains `traded`; `cards.traded_at`, `traded_by_user_id`, `trade_photo_url`. |
| 42 | `20260720110000_lots_quantity_stock.sql` | `lots.quantity`; lot status gains `collection`. |
| 43 | `20260720120000_store_events.sql` | `store_events`. |
| 44 | `20260721000000_store_events_ends_at.sql` | `store_events.ends_at`. |
| 45 | `20260721010000_store_events_spots_left.sql` | `store_events.spots_left`. |
| 46 | `20260725120000_ptcg_games.sql` | `ptcg_cards`, `ptcg_games`, `ptcg_analyses`. |
| 47 | `20260726010000_ptcg_cards_write_policy.sql` | Lets signed-in users insert and update `ptcg_cards`. |
| 48 | `20260726120000_ptcg_key_cards.sql` | `ptcg_games.my_key_card` and `opponent_key_card`. |
| 49 | `20260726160000_ptcg_play_score.sql` | `ptcg_games.play_score` (0 to 100). |
| 50 | `20260914165910_ptcg_drill_profiles.sql` | `ptcg_drill_profiles`. |
| 51 | `20260915084205_ptcg_drill_profiles_pokemon_number.sql` | `ptcg_drill_profiles.pokemon_number`. |
| 52 | `20260916135532_ptcg_games_archetype_dex.sql` | `ptcg_games.my_archetype_dex` and `opponent_archetype_dex`. |
| 53 | `20260916224727_ptcg_tournaments.sql` | `ptcg_tournaments` and `ptcg_tournament_rounds`. |
| 54 | `20260917100706_ptcg_games_went_first.sql` | `ptcg_games.went_first`. |
| 55 | `20260918114029_vinted_bot_foundations.sql` | `cards.price_confirmed_at`; `vinted_queue`, `vinted_bot_schedule`, `vinted_bot_config`, `vinted_sessions`, `vinted_agent_logs`; `job_type` gains `delete`. |
| 56 | `20260918141259_vinted_monitoring_read_policies.sql` | Cross-user `select` on the queue, schedule, config and agent logs. |
| 57 | `20260921081307_vinted_monitoring_post_jobs_read_policy.sql` | Same for `vinted_post_jobs`. |
| 58 | `20260921123018_vinted_bot_config_group_priority.sql` | `vinted_bot_config.group_priority`. |
| 59 | `20260921135551_vinted_repost_position.sql` | `repost_position` on `card_listings` and `lot_listings`. |
| 60 | `20260923123853_vinted_post_jobs_triggered_by.sql` | `vinted_post_jobs.triggered_by`. |
| 61 | `20260929120000_vinted_bot_schedule_weekday_weekend.sql` | Replaces `day_of_week` with `block` (`weekday` or `weekend`). |
| 62 | `20260929120500_vinted_bot_schedule_dedupe_blocks.sql` | Removes the duplicate rows the previous migration produced. |
| 63 | `20261002120000_other_items.sql` | `other_items`, bucket `other-item-photos`, owner-only policies. |
| 64 | `20261002120100_other_item_listings.sql` | `other_item_listings`, owner-only. |
| 65 | `20261002120200_vinted_queue_jobs_other_items.sql` | `other_item_id` on `vinted_queue` and `vinted_post_jobs`; three-way one-target checks; job policy extended. |
| 66 | `20261002130000_other_items_restrict_cross_partner_read.sql` | The two restrictive `select` policies that hide Items rows from the partner. |
| 67 | `20261002130100_other_items_status_update_queue_trigger.sql` | Trigger `other_items_status_update_queue_sync` and its function. |
| 68 | `20261005120000_other_items_vinted_attributes.sql` | Remaps `vinted_condition_id` to Vinted's real ids; adds `vinted_size_id` and `vinted_color_ids`; guarded to run once. |
| 69 | `20261005120100_vinted_queue_failure_flag.sql` | `vinted_queue.last_error` and `failed_at`. |
| 70 | `20261005120200_vinted_catalog_attributes.sql` | `vinted_catalog_attributes`, owner-only. |
| 71 | `20261006120000_other_items_package_size.sql` | `other_items.vinted_package_size_id`. |

## Backups and what they cover

| Data | Mechanism | Where it goes |
|---|---|---|
| `cards`, `lots`, `card_listings`, `lot_listings`, `user_profiles`, `config`, `ocr_usage_log`, `stock_value_snapshots` | GitHub Action `backup.yml`, daily 03:00 UTC, `pg_dump --data-only` | GitHub Releases: `backup-daily-YYYY-MM-DD` (last 30), `backup-weekly-YYYY-Www` (last 12, Sundays), `backup-monthly-YYYY-MM` (last 12, first of the month). Rotation is `scripts/backup/rotate.sh`. |
| The same 8 tables | Options page, "Sauvegarde manuelle", `POST /api/backup/manual` | `manual-backups` bucket as `iris-YYYY-MM-DD-HHMMSS.json.gz` (`{ version, created_at, tables }`). Never rotated. There is no restore script for this format. |
| `tcg_catalog`, `rarity_ranks` | `npm run snapshot-catalog` | `backups/tcg_catalog.jsonl.gz` and `backups/rarity_ranks.json`, committed. |
| `cardmarket_card_index`, `cardmarket_expansions` | `npm run snapshot-cardmarket-index` | `backups/cardmarket_card_index.jsonl.gz` and `backups/cardmarket_expansions.jsonl.gz`, committed. |
| `cardmarket_products`, `cardmarket_pricing` | Reloaded from Cardmarket's public dumps | No backup needed. |

**Not covered by any backup:** the Vinted bot tables (`vinted_*`, `agent_heartbeats`), `other_items` and `other_item_listings`, the PTCG tables, `price_history`, `audit_logs`, `store_events`, and every file in Storage (card, lot and item photos). Photos need a manual export from the dashboard.

Restoring from a release backup is described in [`backups/README.md`](../backups/README.md). One caution on top of it: the dump is data-only, and the `truncate ... cascade` it suggests also empties every table that references `cards` or `lots` by foreign key: `price_history`, `vinted_post_jobs` and `vinted_queue` (and `ocr_usage_log`, which is in the list anyway). Back those up first if you want to keep them.

## Reset from scratch

### Local database

The tested way to replay all 71 migrations on an empty database is the showcase stack: it builds a throwaway Supabase in Docker from this repository's migrations and loads sanitized fixtures. See [Run it locally without any keys](SETUP.md#run-it-locally-without-any-keys). It copies `supabase/` to a temporary folder, shifts every port by 1000, and applies the migrations (72 applied on 2026-10-10: the 71 plus the extension migration below).

`npx supabase db reset` against the repository's own `supabase/` folder replays the same chain. There is no `supabase/seed.sql`, so the tables stay empty apart from the rows the migrations insert (`rarity_ranks`, three `config` keys). The one prerequisite is `pg_cron`: no migration creates the extension, so it must exist before `20260513000000_price_history.sql` runs. The showcase stack handles this by adding a first migration, `00000000000000_showcase_extensions.sql`, to its temporary copy of `supabase/`:

```sql
create extension if not exists pg_cron with schema pg_catalog;
```

Do the same if you drive the Supabase CLI stack by hand, and keep that file out of the migrations you push to a hosted project (which enables the extension from the dashboard).

### New hosted project

Use this when changing region, or when the project is in a state you do not want to repair.

1. **Create the project** in the Supabase dashboard. Copy the project URL, the anon key and the service role key into `.env.local` (and into Vercel). The variables are listed in [SETUP.md](SETUP.md#environment-variables).
2. **Enable `pg_cron`** (Database, Extensions) before the first push.
3. **Re-link the CLI:** `npx supabase link --project-ref <NEW_PROJECT_REF>`. The link state is kept in `supabase/.temp/`, which is ignored by git.
4. **Apply the migrations:** `npx supabase db push`.
5. **Check the result** in the SQL editor:

   ```sql
   select count(*) from information_schema.tables
   where table_schema = 'public' and table_type = 'BASE TABLE';      -- 33
   select count(*) from supabase_migrations.schema_migrations;       -- 71
   select jobname from cron.job;                                     -- downsample-price-history
   select id, public from storage.buckets order by id;               -- 4 buckets
   ```

6. **Create the two accounts** (Authentication, Users, Add user), **disable public signups**, then insert their profiles:

   ```sql
   insert into user_profiles (user_id, display_name) values
     ('<user-1-uuid>', '<name 1>'),
     ('<user-2-uuid>', '<name 2>')
   on conflict (user_id) do nothing;
   ```

   The phase 4 migration seeds profiles only for the two original install UUIDs and only if they exist, so a fresh project always needs this insert. Put the same ids in `VINTED_USER_IDS` if both accounts use the Vinted bot, and read [The owner UUID](#the-owner-uuid) if you want the Items feature.
7. **Load the catalog and pricing data:** [Restoring catalog data](#restoring-catalog-data).
8. **Optional:** enable Realtime for `card_listings` (see [Realtime](#realtime)).
9. **Smoke test:** `rm -rf .next && npm run dev`, sign in, then open `/pokedex`, `/stock`, `/vinted`, `/dashboard` and `/options`.

To get a populated copy of the app without touching a real project, use the showcase stack instead of seeding by hand.

### Restoring catalog data

The catalog and Cardmarket tables are not in the migrations; they are restored from `backups/` or rebuilt. Order matters because of foreign keys:

1. `npm run restore-catalog`: `tcg_catalog` and `rarity_ranks`.
2. `npm run upload-cardmarket-dumps`: expansions from the committed `cardmarket_expansions.json`, plus `cardmarket_products` and `cardmarket_pricing` from Cardmarket's public dumps.
3. `npm run restore-cardmarket-expansions`: puts back `set_prefix`, `name_en` and `name_ja`, which the dump upload does not write.
4. `npm run restore-cardmarket-index`: `cardmarket_card_index`. It references `cardmarket_products`, so it must come after step 2.

All four read `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from `.env.local`; the restore scripts ask for confirmation unless `SKIP_CONFIRM=1`. Usage details are in [COMMANDS.md](COMMANDS.md#backups-and-snapshots).

`restore-catalog` empties `tcg_catalog` through an RPC named `truncate_tcg_catalog` when the project has one; no migration creates it, so on a project built from the migrations the script falls back to deleting every row (`id is not null`), and empties `rarity_ranks` the same way. Until 2026-10-11 those deletes compared the uuid `id` with `0` and the enum `rarity` with `''`, which Postgres rejects; if you meet that error, you are running an older copy of the script.

## The 1000-row cap

The Data API clamps every response to `max_rows`, 1000 by default (`[api] max_rows = 1000` in `supabase/config.toml`), even when a query asks for `.range(0, 1999)`. A read that can grow past 1000 rows silently truncates.

- Page through `.range()` with `fetchAllRows` in `lib/api/fetch-all.ts`. The query must apply a deterministic `.order()` (a unique column, or a tiebreak on one), or pages can overlap or skip rows.
- Keep `.in('col', ids)` lists short with `chunkArray` in the same file: the ids travel in the request URL.
- Scripts that read whole tables page by hand (`snapshot-catalog.ts`, `snapshot-cardmarket-index.ts`, the manual backup route).

## Inspection queries

Run these from the SQL editor, which connects as `postgres` and ignores row-level security (so `auth.uid()` is null there).

```sql
-- Cards by status
select status, count(*) from cards group by 1 order by 1;

-- Catalog by language (committed snapshot: EN 19,398, FR 14,667, JP 18,659)
select language, count(*) from tcg_catalog group by 1 order by 1;

-- Cardmarket coverage
select count(*) filter (where set_prefix is not null) as with_prefix, count(*) as expansions
from cardmarket_expansions;
select count(distinct id_expansion) as indexed_expansions, count(*) as indexed_cards
from cardmarket_card_index;

-- OCR spend, last 30 days
select date_trunc('day', created_at)::date as day, engine, count(*) as calls,
       round(sum(cost_eur)::numeric, 4) as eur
from ocr_usage_log
where created_at > now() - interval '30 days'
group by 1, 2
order by 1 desc, 2;

-- Listings live for more than 21 days (the app's "to refresh" threshold)
select c.card_name, l.user_id, l.vinted_posted_at
from card_listings l
join cards c on c.id = l.card_id
where l.vinted_listing_id is not null
  and l.vinted_posted_at < now() - interval '21 days'
order by l.vinted_posted_at;

-- Jobs the agent has not finished
select job_type, status, count(*) from vinted_post_jobs
where status in ('pending', 'processing') group by 1, 2;

-- Platform checks
select jobname, schedule, active from cron.job;
select schemaname, tablename from pg_publication_tables where pubname = 'supabase_realtime';
select id, public from storage.buckets order by id;
select tablename, count(*) as policies from pg_policies where schemaname = 'public' group by 1 order by 1;
```
