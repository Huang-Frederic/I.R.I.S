# Handoff — Vinted "other_items" (Items) feature

Status snapshot as of **2026-10-05**, commit `377095b` on branch `prod`. Written so
a fresh agent (no prior context) can pick up exactly where this left off,
without re-deriving decisions already made. Read this before touching
anything under `other_items` / "Items" / `other-items`.

If you're not working on this area, skip this file — it's scoped to one
feature, not a general project primer (see README.md / docs/ARCHITECTURE.md
for that).

## Operating constraints (apply to this repo in general, not just this feature)

- **Branch**: always work on `prod`. **Never push to `main`.**
- **Commits**: single-sentence message, imperative mood, no `Co-Authored-By`
  trailer — the user (Fred) has explicitly asked these never appear.
- **Subagent model**: dispatch subagents on Sonnet only — the enterprise
  quota blocks every other model (Opus, Haiku, Fable included).
- **i18n**: 4 locale files kept in lockstep at identical line structure —
  `messages/en.json`, `messages/fr.json`, `messages/ja.json`,
  `messages/zh.json`. `messages/en.json` is also the typed-messages source
  (`global.d.ts` does `typeof import('./messages/en.json')`) — **forgetting
  to add a key there breaks the TypeScript build**, even if fr/ja/zh are
  updated. Fred is French-speaking; `fr.json` is the one he actually sees.
- **I.R.I.S** expands to "Intelligent Recognition Inventory System" — use
  that expansion in any user-facing copy that spells it out.
- Cardmarket's API is closed to new signups — don't propose it for pricing
  work.

## What `other_items` is

A third sellable entity alongside `cards` and `lots`: non-TCG products
(clothes, electronics, accessories — Fred's own real Vinted listings, e.g.
Uniqlo jackets, Nike Dunks, a robot vacuum). Built across ~20 commits from
2026-10-02 to 2026-10-03 (full list: `git log --oneline -40`, shown at the
top of this handoff's authoring commit). Spec: [superpowers/specs/2026-10-02-vinted-other-items-design.md](superpowers/specs/2026-10-02-vinted-other-items-design.md).
Plan: [superpowers/plans/2026-10-02-vinted-other-items.md](superpowers/plans/2026-10-02-vinted-other-items.md).

**Hard constraint carried through the whole feature: Fred-only.** Gilly
(the second account) must never see that this feature exists — not just
its data. This shaped the RLS design (hardcoded `auth.uid() = '<fred-uuid>'`
checks, not the usual `user_id = auth.uid()` ownership pattern) and caused
one real privacy bug (see "Bugs already found and fixed" below). Any new
code touching `other_items` needs the same instinct: ask "would Gilly even
see this button/row/filter exists?", not just "can she read the data?".

`FRED_USER_ID = '35385d3c-5966-4a10-8568-8d92d1be47e7'` is hardcoded in
several places (not an env var) — grep for it before assuming a user-id
check is parameterized:
- `lib/vinted/other-item-queue-sync.ts`
- `app/api/other-items/route.ts`, `app/api/other-items/[id]/route.ts`
- `supabase/migrations/20261002120000_other_items.sql` (RLS policies)
- `components/submit/SubmitTabs.tsx` (gates the "Objets" submit tab)

### Database

- `other_items` table — `supabase/migrations/20261002120000_other_items.sql`.
  Columns: `id, user_id, name, description, price, photo_urls (jsonb),
  vinted_catalog_id, vinted_catalog_path, brand_name, vinted_condition_id,
  size, status ('for_sale'|'collection'|'sold'), date_sold, sold_price,
  vinted_listed_at, date_added`. RLS: 4 policies, each hardcoded to
  Fred's UUID (select/insert/update/delete).
- `other_item_listings` — mirrors `card_listings`/`lot_listings`:
  `other_item_id, user_id, listed_at, vinted_listing_id, vinted_posted_at,
  repost_position`.
- Storage bucket `other-item-photos`, public, RLS-gated to Fred only
  (unlike `card-photos`/`lot-photos`, which have no per-user check).
- **Trigger** `other_items_status_update_queue_sync` —
  `supabase/migrations/20261002130100_other_items_status_update_queue_trigger.sql`.
  Fires `after update of status on other_items`, keeps `vinted_queue` in
  sync even when a row is edited directly via Supabase's Table Editor
  (which bypasses the Next.js app entirely — there's no other way to
  explain why this exists without that context). `security definer` so it
  isn't blocked by RLS regardless of how the triggering session
  authenticated.
- `lib/vinted/other-item-queue-sync.ts` — the app-level equivalent
  (`syncOtherItemQueueMembership`), called from the POST and PATCH API
  routes. Both the trigger and this function exist on purpose — belt and
  suspenders, not a duplicate to clean up.

### Bot (Python, `vinted-agent/`)

- `vinted-agent/main.py` — `build_other_item_title` /
  `build_other_item_description` (title = name truncated to 80 chars;
  description = ✨name / 📘brand / 📏size / ✅condition / free text /
  shipping boilerplate). **Deliberately has no `NO_VINTED_GO_WARNING`
  banner** — Fred explicitly rejected it for this entity type ("pas de
  Vinted Go" — these aren't offered through Vinted Go in the first place).
  Cards/lots keep the banner; don't "fix" other_items to match them.
  `process_other_item_job` posts it; `_block_for`/scheduler treat it like
  lots for quota/window purposes.
- `OTHER_ITEM_CONDITION_LABEL` is keyed by **Vinted's real condition ids**,
  which `other_items.vinted_condition_id` stores as-is: 6 neuf avec étiquette,
  1 neuf sans étiquette, 2 très bon état, 3 bon état, 4 satisfaisant, plus
  per-category extras (7 "certaines pièces ne fonctionnent pas" on
  appliances; perfume only accepts 6). The column used to hold a 1-5 scale
  that assumed Vinted's ids follow the label order — every item would have
  posted one grade lower than its description; remapped by
  `20261005120000_other_items_vinted_attributes.sql` (2026-10-05).
- `lib/utils/other-item-template.ts` (TypeScript) mirrors the Python
  builders **line-for-line** on purpose, so the in-app fiche preview shows
  exactly what the bot will actually post. If you change one, change both
  and check they still agree — there's no shared source of truth, just
  discipline.

### Size, color and per-category attributes (2026-10-05)

Clothing/shoe categories require a size and a color ("Le champ Taille doit
être renseigné"); neither was stored nor sent. Now:

- `other_items.vinted_size_id` (a size option id of the item's category —
  `size` keeps its label for the description) and `vinted_color_ids`
  (≤ 2 of Vinted's 29 global colors, `lib/data/vinted-colors.json`).
- Sizes, accepted conditions and whether a color is asked **depend on the
  category**, and Vinted only serves them one category at a time through an
  authenticated session: `POST /api/v2/item_upload/attributes` with
  `{"attributes":[{"code":"category","value":[<catalog_id>]}]}`. The app
  can't call it, so `vinted_catalog_attributes` (Fred-only RLS) caches them:
  the form/fiche insert a `pending` row (`useCatalogAttributes`), the bot
  fills it (`_attribute_requests_loop`, polls every 5 s) and refreshes it on
  every post in that category. Bot not running → the form says so and still
  lets the item be created; the size can be picked later in the fiche.
- Payload (matches Vinted's own upload form): `color_ids` top-level,
  `item_attributes += {"code": "size", "ids": [<size id>]}`, condition id
  sent raw (`create_listing(condition=None, condition_id=…)`).
- **Size ids aren't stable**: Vinted renumbers a category's sizes (on
  2026-10-05 men's parkas and men's sneakers got new groups and new ids within
  hours — L 209 → 2437, 45 790 → 2120). The bot (`resolve_size_id`) and the
  fiche (`resolveSizeOption`) keep a stored id while it's offered, otherwise
  find the stored `size` label again (exact, or a bare number → "EU 45") and
  save the new id; only an unmatched label is flagged.
- The bot validates size/color/condition against the live attributes
  **before** uploading photos (`catalog_attributes.listing_attribute_problems`),
  and keeps Vinted's own validation messages (`VintedValidationError`) instead
  of curl's empty "HTTP Error 400: ".

### Failed jobs go back to the queue (2026-10-05, all three entity types)

The scheduler and `POST /api/vinted/post-job` delete the queue row when they
create a post job; a failed job used to leave the item for sale but out of the
queue forever. `_fail_job(..., job=job, permanent=…)` now re-queues it at the
front (`_requeue_after_failure`, eligibility mirrors `queue-sync.ts` via
`scheduler.should_requeue`). A **permanent** failure (Vinted validation error,
missing attribute/photo) flags the row (`vinted_queue.failed_at`/`last_error`):
`_fetch_queue_front` skips it, `/vinted/bot` shows it in amber with the reason
and no quota slot, and editing the item (`PATCH /api/other-items/[id]` →
`clearOtherItemQueueFailure`) or "Poster maintenant" hands it back. Transient
failures (timeout, expired session) come back unflagged and retry at the next
slot.

### Lots enter the queue on their own (2026-10-07)

Until now nothing in the app put a lot in `vinted_queue`: lots only went
online through "Poster maintenant" (or a one-off script). `lib/vinted/lot-queue-sync.ts`
(`syncLotQueueMembership`) now does for lots what `queue-sync.ts` does for
cards, called (awaited, service client) from `POST /api/lots` and
`PATCH /api/lots/[id]`: a lot `for_sale` with a price > 0 enters every
`VINTED_USER_IDS` account's queue unless that account already has it online,
and leaves every queue otherwise. No `price_confirmed_at` gate — no cron ever
prices a lot. Selling a lot out also enqueues a `delete` job for the other
account's live ad (`enqueueLotCrossUserDeleteJobs`, handled by
`process_lot_job`). Selling one copy of a quantity>1 lot keeps the partner's ad
and re-queues the seller's account (`consumedListingUserId`). The bot's
`should_requeue` applies the same price rule.

### The bot follows the group priority (2026-10-07)

`vinted_bot_config.group_priority` (Settings → group priority on
`/vinted/bot`) used to only sort the page; the bot posted by raw
`vinted_queue.position`. `_fetch_queue_front` now reads every unflagged row
with its card language / lot brand and `scheduler.pick_queue_front` takes the
lowest position of the highest-priority group that still has rows
(`queue_group_key` mirrors `lib/vinted/group-key.ts`, Items are
`other-items`), else the lowest position overall — the first card the page
shows. Fred's order, set on both accounts: `["other-items", "Pokémon FR"]`,
then everything else.

### Frontend — main `/vinted` page (today's work, commits `f3c7647` + `377095b`)

Before today, `other_items` existed in the database/bot/creation-form but
was **completely invisible on the main Vinted page** — it only showed up
in the separate `/vinted/bot` monitoring grid. Today added:

- **"Items" filter** — a 5th button in the type filter
  (`all/cards/single/lot/items`), gated so it (and any Items rows) only
  render when `showOtherItems` is true, i.e. only for Fred
  (`components/vinted/VintedFilters.tsx`, `VintedFilterState.kindFilter`).
  "Tout" (`all`) also includes Items now, interleaved chronologically with
  cards/lots via the same bucket (offline/stale/fresh) logic.
- **Search** — `matchesOtherItemSearch` in `lib/utils/vinted-list-filters.ts`
  matches name/description/brand, same pattern as cards/lots.
- **Fiche (detail modal)** — `components/vinted/OtherItemAnnonceModal.tsx`,
  a near-direct port of `components/lots/LotAnnonceModal.tsx` (photo
  carousel, editable title/description with copy buttons, editable single
  price, "Remettre en stock" / "Supprimer"). **Deliberately has no
  Cardmarket section** (no price-comparison grid, no price-history chart)
  — other_items have no market-price data, this was an explicit
  requirement, not an oversight. `components/vinted/OtherItemRow.tsx` is
  the list row (thumbnail, name, brand badge, online/offline text badge —
  intentionally non-interactive, see "Scope cut" below).
- **New API route** `app/api/other-items/[id]/route.ts` (PATCH
  price/status/name/description, DELETE) — didn't exist before; the fiche
  needs it for price edits and retire/delete.
- **Types** — `OtherItem`, `OtherItemListing`, `OtherItemWithListings` added
  to `lib/types/index.ts` (didn't exist before today despite the table
  being 3 days old).
- `lib/utils/vinted-interleave.ts`'s `MixedRow` union gained a third arm
  (`{ kind: 'other_item'; item: OtherItemWithListings }`). The `items`
  parameter was added **at the end** of `interleaveCardsAndLots`'s
  signature with a `= []` default specifically so none of the ~8 existing
  call sites in `vinted-interleave.test.ts` needed touching — if you add a
  4th row kind later, keep that pattern (trailing optional param, not an
  inserted positional one).
- `components/vinted/hooks/useDataSync.ts` gained a 4th optional
  `initialOtherItems` param/return, same backward-compatible-default
  reasoning.

**Scope cut, deliberate — don't quietly add these back without asking:**
Fred's request was narrowly "a filter, make it searchable, give it a
fiche." Explicitly left out of today's work:
- No manual online/offline toggle for Items (the `ListingBadges` component
  that cards/lots use calls a generic `/api/listings` POST/DELETE keyed by
  `itemKind: 'card'|'lot'` — extending that to `'other_item'` was judged
  out of scope; `OtherItemRow` just shows a static En ligne/Pas en ligne
  label instead).
- No "mark as sold" flow for Items (no `OtherItemSoldRow`, no sold pile on
  the Items filter), even though the DB schema already has `status='sold'`,
  `date_sold`, `sold_price` columns ready for it.
- No bulk selection / bulk actions for Items.
- No category editing in the fiche (condition, size and colors are editable
  since 2026-10-05, in the "Attributs Vinted" block).

If Fred asks for any of the above, it's a new, reasonably small follow-up,
not a sign today's work was incomplete.

### Bug already found and fixed today (commit `377095b`)

Fred reported: "dans vinted bot, le bouton pour regarder sa fiche ne marche
pas" (on the separate `/vinted/bot` monitoring page, the "Voir l'annonce"
Eye-icon button did nothing for Items rows). Root cause: that page's
`viewListing()` function in `components/vinted/monitoring/MonitoringSection.tsx`
was an if-chain keyed on `cardId`/`lotId` only, with no `otherItemId`
branch — clicking silently fell through and did nothing (no error, no
console warning). Fixed by adding: a third `AnnonceTarget` union member, a
third `if (item.otherItemId)` branch calling a new
`fetchOtherItemAnnonceTarget` (added to `lib/vinted/fetch-annonce-target.ts`,
mirroring the existing card/lot fetchers), and a third conditional render
block reusing the same `OtherItemAnnonceModal` built for the main page
(different bucket, so it needed its own `otherItemStoragePublicUrl`
pointed at `other-item-photos` instead of `lot-photos`).

**If Fred reports another "button does nothing" on `/vinted/bot`**, check
`MonitoringSection.tsx`'s other id-keyed if-chains first —
`postNow`/`repostNow`/`persistRepostReorder` already handle all three kinds
(they were fixed earlier, in commit `631001e`, 2026-10-02), but
`viewListing` was missed until today. Grep for `cardId ? ... : lotId ? ...`
patterns to find any other place a 3rd branch might still be missing.

### Privacy bug already found and fixed (commit `daee28d`, 2026-10-02)

Pre-existing, legitimate `using(true)` SELECT policies on
`vinted_queue`/`vinted_post_jobs` (added before this feature so Fred and
Gilly can see each other's card/lot bot status) were never narrowed when
`other_item_id` was added to those tables — Gilly could see the *existence*
of Fred's queued Items (an "OTHER-ITEMS" group with "?" placeholder cards)
via the dashboard's partner-switch button. Fixed with RESTRICTIVE RLS
policies narrowing only the `other_item_id`-populated rows to Fred, leaving
card/lot cross-partner visibility untouched. Mentioned here because it's
the canonical example of the "existence, not just content" privacy bar
this feature has to clear — any new other_items-adjacent table or shared
view needs the same check.

## Docs that are now stale (not fixed in this handoff — flagging, not fixing)

- `docs/FEATURES.md` has no "Other items" / Items section at all — the
  Vinted section stops at "Lots (bundles)". The entire feature (DB table,
  bot integration, submit form, main-page filter/fiche) is undocumented
  there.
- `docs/TECH_DEBT.md`'s existing "`VintedList.tsx` — modal orchestration"
  entry predates today — `OtherItemAnnonceModal` is now a 4th modal in that
  same sold→restock→promote→partner-cleanup-adjacent orchestration mess
  (though Items don't participate in sold/restock/promote, so it's additive
  complexity, not a new tangle).
- `docs/CHANGELOG.md`'s phase-based history stops before this feature —
  if continuing that convention, this would be a new "Phase 3b" or similar
  entry.

If you're asked to bring docs up to date generally, those three are the
known gaps. Not done here because it wasn't asked for this round — just
the handoff.

## Verifying changes in this area

```bash
npx tsc --noEmit -p .                              # typecheck
npx vitest run                                      # full suite, ~2319 tests, all green as of this handoff
npx eslint <changed files>
npm run build                                       # catches Next.js-specific issues tsc/eslint miss
```

All four were green on commit `377095b`. The i18n typed-messages check
(`global.d.ts` → `messages/en.json`) only surfaces as a `tsc` error, not an
eslint one — if you add a translation key, add it to `en.json` first or
`tsc` will fail on every `t('newKey')` call site.

## Open threads (not started, for context only)

1. Nothing pending. The size attribute (former thread #1) shipped on
   2026-10-05 — see "Size, color and per-category attributes" above.