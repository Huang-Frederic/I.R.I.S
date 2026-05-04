# Phase 4 Multi-user Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pass IRIS de mono-user à 2-user (Hisshiden "Lui" + Hilyna "Elle") avec stock physique + Pokédex partagés mais cross-listing per-user sur leurs 2 comptes Vinted distincts.

**Architecture:**
- 3 nouvelles tables Supabase : `card_listings`, `lot_listings`, `user_profiles`. RLS shared SELECT, write per-user. `cards.vinted_listed_at` + `lots.vinted_listed_at` droppés (backfill vers les 2 nouvelles tables `*_listings` avant drop).
- Helpers purs `lib/utils/listings.ts` génériques (work pour cards et lots), nouveau composant générique `<ListingBadges>` qui remplace `<VintedListedToggle>`.
- Nouveau React context `useUserContext` chargé au layout pour exposer `myUserId`/`partnerUserId`/`partnerName`.
- `<VintedFilters>` étendu avec un axe multi-user (5 chips mutuellement exclusifs, ET avec axe d'état).
- `<SoldModal>`, `<BulkSoldModal>`, `<BulkSoldRecapModal>` reçoivent props partner pour bandeau d'avertissement.

**Tech Stack:** Next.js 16 App Router, Supabase Postgres + RLS, React 19 + Server Components, TypeScript strict, Tailwind v4, Vitest + happy-dom.

**Spec:** [docs/superpowers/specs/2026-05-04-phase-4-multi-user-design.md](../specs/2026-05-04-phase-4-multi-user-design.md)

---

## Task 1: Migration SQL — `card_listings` + `lot_listings` + `user_profiles`

**Files:**
- Create: `supabase/migrations/20260505000000_phase4_multi_user.sql`

- [ ] **Step 1: Write the migration SQL**

Create file `supabase/migrations/20260505000000_phase4_multi_user.sql` with:

```sql
-- Phase 4 — multi-user : per-user listings + display names + drop legacy columns
-- Spec: docs/superpowers/specs/2026-05-04-phase-4-multi-user-design.md

-- 1. Per-user listings tables (cards + lots)
create table card_listings (
  card_id uuid not null references cards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  listed_at timestamptz not null default now(),
  primary key (card_id, user_id)
);
create index idx_card_listings_user_listed
  on card_listings (user_id, listed_at desc);

create table lot_listings (
  lot_id uuid not null references lots(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  listed_at timestamptz not null default now(),
  primary key (lot_id, user_id)
);
create index idx_lot_listings_user_listed
  on lot_listings (user_id, listed_at desc);

-- 2. Display names table
create table user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null
);

-- 3. Backfill cards.vinted_listed_at / lots.vinted_listed_at → listings tables (Hisshiden's user_id)
insert into card_listings (card_id, user_id, listed_at)
select id, '35385d3c-5966-4a10-8568-8d92d1be47e7'::uuid, vinted_listed_at
from cards
where vinted_listed_at is not null;

insert into lot_listings (lot_id, user_id, listed_at)
select id, '35385d3c-5966-4a10-8568-8d92d1be47e7'::uuid, vinted_listed_at
from lots
where vinted_listed_at is not null;

-- 4. Seed user_profiles (Hisshiden + Hilyna — display "Lui" / "Elle")
insert into user_profiles (user_id, display_name) values
  ('35385d3c-5966-4a10-8568-8d92d1be47e7'::uuid, 'Lui'),
  ('a018a4ef-e02e-4a67-9732-9fafe3167e10'::uuid, 'Elle');

-- 5. Drop old per-card / per-lot vinted_listed_at columns + indexes
drop index if exists idx_cards_vinted_listed_at;
alter table cards drop column vinted_listed_at;
alter table lots drop column vinted_listed_at;

-- 6. RLS
alter table card_listings enable row level security;
alter table lot_listings enable row level security;
alter table user_profiles enable row level security;

create policy card_listings_select on card_listings for select to authenticated using (true);
create policy card_listings_insert on card_listings for insert to authenticated with check (user_id = auth.uid());
create policy card_listings_update on card_listings for update to authenticated using (user_id = auth.uid());
create policy card_listings_delete on card_listings for delete to authenticated using (user_id = auth.uid());

create policy lot_listings_select on lot_listings for select to authenticated using (true);
create policy lot_listings_insert on lot_listings for insert to authenticated with check (user_id = auth.uid());
create policy lot_listings_update on lot_listings for update to authenticated using (user_id = auth.uid());
create policy lot_listings_delete on lot_listings for delete to authenticated using (user_id = auth.uid());

create policy user_profiles_select on user_profiles for select to authenticated using (true);
create policy user_profiles_insert on user_profiles for insert to authenticated with check (user_id = auth.uid());
create policy user_profiles_update on user_profiles for update to authenticated using (user_id = auth.uid());
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260505000000_phase4_multi_user.sql
git commit -m "Phase 4: migration card_listings + lot_listings + user_profiles + drop vinted_listed_at"
```

> **Note opérationnelle (out-of-scope task)** : la migration s'applique manuellement via Supabase Studio (l'app n'utilise pas la CLI Supabase migrate). L'agent NE doit PAS l'appliquer — c'est une action user. Lui rappeler dans le smoke test final (Task 14).

---

## Task 2: Types TypeScript — drop `vinted_listed_at`, add `BaseListing`/`CardListing`/`LotListing`/`UserProfile`/`*WithListings`

**Files:**
- Modify: `lib/types/index.ts`

- [ ] **Step 1: Modify `lib/types/index.ts`**

Find the `Card` interface and remove the line `vinted_listed_at: string | null;`. Find the `Lot` interface and do the same.

Then add at the bottom of the file (or near the existing `Card`/`Lot` definitions, your call) :

```typescript
/** Common shape for both card_listings and lot_listings rows. */
export interface BaseListing {
  user_id: string;
  listed_at: string; // ISO timestamp
}

export interface CardListing extends BaseListing {
  card_id: string;
}

export interface LotListing extends BaseListing {
  lot_id: string;
}

export interface UserProfile {
  user_id: string;
  display_name: string;
}

/** Card hydrated avec ses card_listings (chargés en parallèle côté server). */
export interface CardWithListings extends Card {
  listings: CardListing[];
}

/** Lot hydrated avec ses lot_listings. */
export interface LotWithListings extends Lot {
  listings: LotListing[];
}
```

- [ ] **Step 2: Run tsc to see what breaks**

```bash
source ~/.nvm/nvm.sh && nvm use && npx tsc --noEmit 2>&1 | head -40
```

Expected: many errors referencing `vinted_listed_at` on `Card` or `Lot` — that's expected. Tasks 11-13 will clean them all up. For now, just verify the type changes are syntactically valid.

- [ ] **Step 3: Commit**

```bash
git add lib/types/index.ts
git commit -m "Phase 4: drop vinted_listed_at from Card+Lot, add CardListing/LotListing/UserProfile/*WithListings types"
```

---

## Task 3: Helper `lib/utils/listings.ts` — `getMyListing` / `getPartnerListing` / `isStaleForListing`

**Files:**
- Create: `lib/utils/listings.ts`
- Test: `lib/utils/listings.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/utils/listings.test.ts` :

```typescript
import { describe, expect, it } from 'vitest';
import {
  getMyListing,
  getPartnerListing,
  isStaleForListing,
} from './listings';
import type { BaseListing } from '@/lib/types';

const MY_ID = 'my-uuid';
const PARTNER_ID = 'partner-uuid';

describe('getMyListing', () => {
  it('returns the listing for myUserId when present', () => {
    const listings: BaseListing[] = [
      { user_id: MY_ID, listed_at: '2026-05-01T12:00:00Z' },
      { user_id: PARTNER_ID, listed_at: '2026-04-15T08:00:00Z' },
    ];
    expect(getMyListing(listings, MY_ID)).toEqual(listings[0]);
  });

  it('returns null when myUserId has no listing', () => {
    const listings: BaseListing[] = [{ user_id: PARTNER_ID, listed_at: '2026-04-15T08:00:00Z' }];
    expect(getMyListing(listings, MY_ID)).toBeNull();
  });

  it('returns null on empty listings', () => {
    expect(getMyListing([], MY_ID)).toBeNull();
  });
});

describe('getPartnerListing', () => {
  it('returns the listing for partnerUserId when present', () => {
    const listings: BaseListing[] = [
      { user_id: MY_ID, listed_at: '2026-05-01T12:00:00Z' },
      { user_id: PARTNER_ID, listed_at: '2026-04-15T08:00:00Z' },
    ];
    expect(getPartnerListing(listings, PARTNER_ID)).toEqual(listings[1]);
  });

  it('returns null when partnerUserId is null', () => {
    const listings: BaseListing[] = [{ user_id: MY_ID, listed_at: '2026-05-01T12:00:00Z' }];
    expect(getPartnerListing(listings, null)).toBeNull();
  });
});

describe('isStaleForListing', () => {
  it('returns false when listing is null', () => {
    expect(isStaleForListing(null, Date.now())).toBe(false);
  });

  it('returns false for fresh listing (< 21 days)', () => {
    const now = new Date('2026-05-04T00:00:00Z').getTime();
    const listing: BaseListing = { user_id: MY_ID, listed_at: '2026-05-01T00:00:00Z' };
    expect(isStaleForListing(listing, now)).toBe(false);
  });

  it('returns true for stale listing (> 21 days)', () => {
    const now = new Date('2026-05-04T00:00:00Z').getTime();
    const listing: BaseListing = { user_id: MY_ID, listed_at: '2026-04-01T00:00:00Z' };
    expect(isStaleForListing(listing, now)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
source ~/.nvm/nvm.sh && nvm use && npm test lib/utils/listings.test.ts 2>&1 | tail -10
```

Expected: FAIL — file `./listings` doesn't exist yet.

- [ ] **Step 3: Implement `lib/utils/listings.ts`**

```typescript
// lib/utils/listings.ts
import { isListingStale } from './listing-stale';
import type { BaseListing } from '@/lib/types';

/**
 * Returns the listing belonging to `myUserId`, or null if none exists.
 * Generic — works on any listings array (CardListing[] or LotListing[]).
 */
export function getMyListing<L extends BaseListing>(
  listings: L[],
  myUserId: string,
): L | null {
  return listings.find((l) => l.user_id === myUserId) ?? null;
}

/**
 * Returns the listing belonging to `partnerUserId`, or null. When
 * `partnerUserId` is null (partner account not yet provisioned), returns
 * null gracefully without scanning.
 */
export function getPartnerListing<L extends BaseListing>(
  listings: L[],
  partnerUserId: string | null,
): L | null {
  if (!partnerUserId) return null;
  return listings.find((l) => l.user_id === partnerUserId) ?? null;
}

/**
 * Wrap the existing `isListingStale` helper to operate on a per-user listing
 * row rather than the legacy `cards.vinted_listed_at` field.
 */
export function isStaleForListing(
  listing: BaseListing | null,
  now: number,
): boolean {
  if (!listing) return false;
  return isListingStale(listing.listed_at, now);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
source ~/.nvm/nvm.sh && nvm use && npm test lib/utils/listings.test.ts 2>&1 | tail -10
```

Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/utils/listings.ts lib/utils/listings.test.ts
git commit -m "Phase 4: lib/utils/listings.ts (getMyListing / getPartnerListing / isStaleForListing) + 8 tests"
```

---

## Task 4: Extend `lib/utils/vinted-filter.ts` — `passesMultiUserChip` + `MultiUserChip` type + `multiUserChip` field on state

**Files:**
- Modify: `lib/utils/vinted-filter.ts`
- Modify: `lib/utils/vinted-filter.test.ts` (add new test cases)

- [ ] **Step 1: Read current `vinted-filter.ts` to understand existing exports**

```bash
cat /home/fhuang5/Developer/I.R.I.S/lib/utils/vinted-filter.ts
```

Confirm `passesStateChips` and `shouldHideForSalePile` exist and that `ChipState` interface has `showOnline`/`showOffline`/`showStale`/`showSold`. The new `MultiUserChip` is independent of these.

- [ ] **Step 2: Write the failing tests for passesMultiUserChip**

Append to `lib/utils/vinted-filter.test.ts` :

```typescript
import { passesMultiUserChip } from './vinted-filter';
import type { BaseListing } from '@/lib/types';

const MY_ID = 'my-uuid';
const PARTNER_ID = 'partner-uuid';

interface FakeItem {
  status: string;
  listings: BaseListing[];
}

const noListings: FakeItem = { status: 'for_sale', listings: [] };
const onlyMine: FakeItem = {
  status: 'for_sale',
  listings: [{ user_id: MY_ID, listed_at: '2026-05-01T00:00:00Z' }],
};
const onlyPartner: FakeItem = {
  status: 'for_sale',
  listings: [{ user_id: PARTNER_ID, listed_at: '2026-04-15T00:00:00Z' }],
};
const cross: FakeItem = {
  status: 'for_sale',
  listings: [
    { user_id: MY_ID, listed_at: '2026-05-01T00:00:00Z' },
    { user_id: PARTNER_ID, listed_at: '2026-04-15T00:00:00Z' },
  ],
};
const mineButSold: FakeItem = {
  status: 'sold',
  listings: [{ user_id: MY_ID, listed_at: '2026-05-01T00:00:00Z' }],
};

describe('passesMultiUserChip', () => {
  it('chip "all" → always true', () => {
    expect(passesMultiUserChip(noListings, 'all', MY_ID, PARTNER_ID)).toBe(true);
    expect(passesMultiUserChip(onlyMine, 'all', MY_ID, PARTNER_ID)).toBe(true);
  });

  it('chip "mine" → true when I have a listing', () => {
    expect(passesMultiUserChip(onlyMine, 'mine', MY_ID, PARTNER_ID)).toBe(true);
    expect(passesMultiUserChip(onlyPartner, 'mine', MY_ID, PARTNER_ID)).toBe(false);
  });

  it('chip "partner" → true only when partner has a listing AND partnerUserId is set', () => {
    expect(passesMultiUserChip(onlyPartner, 'partner', MY_ID, PARTNER_ID)).toBe(true);
    expect(passesMultiUserChip(onlyMine, 'partner', MY_ID, PARTNER_ID)).toBe(false);
    expect(passesMultiUserChip(onlyPartner, 'partner', MY_ID, null)).toBe(false);
  });

  it('chip "cross" → true only when both have a listing', () => {
    expect(passesMultiUserChip(cross, 'cross', MY_ID, PARTNER_ID)).toBe(true);
    expect(passesMultiUserChip(onlyMine, 'cross', MY_ID, PARTNER_ID)).toBe(false);
    expect(passesMultiUserChip(onlyPartner, 'cross', MY_ID, PARTNER_ID)).toBe(false);
  });

  it('chip "none" → true only when nobody has a listing', () => {
    expect(passesMultiUserChip(noListings, 'none', MY_ID, PARTNER_ID)).toBe(true);
    expect(passesMultiUserChip(onlyMine, 'none', MY_ID, PARTNER_ID)).toBe(false);
  });

  it('chip "to_delete" → true when I have a listing AND status != for_sale', () => {
    expect(passesMultiUserChip(mineButSold, 'to_delete', MY_ID, PARTNER_ID)).toBe(true);
    expect(passesMultiUserChip(onlyMine, 'to_delete', MY_ID, PARTNER_ID)).toBe(false);
    expect(passesMultiUserChip(noListings, 'to_delete', MY_ID, PARTNER_ID)).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests to verify failure**

```bash
source ~/.nvm/nvm.sh && nvm use && npm test lib/utils/vinted-filter.test.ts 2>&1 | tail -10
```

Expected: FAIL — `passesMultiUserChip` not exported.

- [ ] **Step 4: Implement in `lib/utils/vinted-filter.ts`**

Append to the file (after `shouldHideForSalePile`) :

```typescript
import type { BaseListing } from '@/lib/types';

export type MultiUserChip = 'all' | 'mine' | 'partner' | 'cross' | 'none' | 'to_delete';

/**
 * Multi-user chip filter — independent axis from the state chips. Combined
 * via AND with `passesStateChips` at the call site.
 *
 *   - 'all' : no constraint (default)
 *   - 'mine' : I (myUserId) have a listing on this item
 *   - 'partner' : partnerUserId has a listing (false when partnerUserId null)
 *   - 'cross' : both
 *   - 'none' : neither
 *   - 'to_delete' : I have a listing AND item.status != 'for_sale'
 *     (i.e. the item was sold or moved to pokedex but my Vinted listing
 *     is still up — needs a manual cleanup)
 *
 * Generic — works for both cards and lots (both have `status` + `listings`).
 */
export function passesMultiUserChip(
  item: { status: string; listings: BaseListing[] },
  chip: MultiUserChip,
  myUserId: string,
  partnerUserId: string | null,
): boolean {
  const mine = item.listings.some((l) => l.user_id === myUserId);
  const partner = partnerUserId ? item.listings.some((l) => l.user_id === partnerUserId) : false;

  switch (chip) {
    case 'all': return true;
    case 'mine': return mine;
    case 'partner': return partner;
    case 'cross': return mine && partner;
    case 'none': return !mine && !partner;
    case 'to_delete': return mine && item.status !== 'for_sale';
  }
}
```

- [ ] **Step 5: Add `multiUserChip` to `VintedFilterState` (in `components/vinted/VintedFilters.tsx`)**

Open `components/vinted/VintedFilters.tsx`. Find `VintedFilterState` interface and add field:

```typescript
multiUserChip: MultiUserChip;
```

Find `INITIAL_FILTERS` const and add:

```typescript
multiUserChip: 'all',
```

Add to imports at top:

```typescript
import { type MultiUserChip } from '@/lib/utils/vinted-filter';
```

- [ ] **Step 6: Run all tests**

```bash
source ~/.nvm/nvm.sh && nvm use && npm test 2>&1 | tail -10
```

Expected: PASS (all previous tests + 6 new for `passesMultiUserChip`).

- [ ] **Step 7: Commit**

```bash
git add lib/utils/vinted-filter.ts lib/utils/vinted-filter.test.ts components/vinted/VintedFilters.tsx
git commit -m "Phase 4: passesMultiUserChip helper + MultiUserChip type + multiUserChip field on filter state"
```

---

## Task 5: API endpoints — `POST /api/listings` + `DELETE /api/listings/[kind]/[id]`

**Files:**
- Create: `app/api/listings/route.ts`
- Create: `app/api/listings/[kind]/[id]/route.ts`

- [ ] **Step 1: Create POST `/api/listings`**

Create `app/api/listings/route.ts` :

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

interface PostBody {
  kind?: 'card' | 'lot';
  id?: string;
}

/**
 * POST /api/listings — INSERT into card_listings or lot_listings.
 * Idempotent via ON CONFLICT (handled by primary key). RLS enforces
 * user_id = auth.uid() on insert.
 */
export async function POST(request: Request) {
  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { kind, id } = body;
  if (kind !== 'card' && kind !== 'lot') {
    return NextResponse.json({ error: 'kind must be "card" or "lot"' }, { status: 400 });
  }
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const table = kind === 'card' ? 'card_listings' : 'lot_listings';
  const fkColumn = kind === 'card' ? 'card_id' : 'lot_id';

  const { data, error } = await supabase
    .from(table)
    .upsert(
      { [fkColumn]: id, user_id: auth.user.id, listed_at: new Date().toISOString() },
      { onConflict: `${fkColumn},user_id`, ignoreDuplicates: false },
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
```

- [ ] **Step 2: Create DELETE `/api/listings/[kind]/[id]`**

Create `app/api/listings/[kind]/[id]/route.ts` :

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * DELETE /api/listings/[kind]/[id] — DELETE WHERE id = X AND user_id = auth.uid().
 * RLS additionally enforces user_id = auth.uid() so cross-user deletes are
 * impossible even if the route handler had a bug.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id } = await params;
  if (kind !== 'card' && kind !== 'lot') {
    return NextResponse.json({ error: 'kind must be "card" or "lot"' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const table = kind === 'card' ? 'card_listings' : 'lot_listings';
  const fkColumn = kind === 'card' ? 'card_id' : 'lot_id';

  const { error, count } = await supabase
    .from(table)
    .delete({ count: 'exact' })
    .eq(fkColumn, id)
    .eq('user_id', auth.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ deleted: count ?? 0 });
}
```

- [ ] **Step 3: Verify tsc + lint clean for these new files**

```bash
source ~/.nvm/nvm.sh && nvm use && npx tsc --noEmit 2>&1 | grep -E "app/api/listings" | head -5
source ~/.nvm/nvm.sh && nvm use && npm run lint 2>&1 | grep -E "app/api/listings" | head -5
```

Expected: no output (no errors specific to these files).

- [ ] **Step 4: Commit**

```bash
git add app/api/listings/route.ts "app/api/listings/[kind]/[id]/route.ts"
git commit -m "Phase 4: POST /api/listings + DELETE /api/listings/[kind]/[id] endpoints"
```

---

## Task 6: `useUserContext` hook + Provider

**Files:**
- Create: `lib/hooks/useUserContext.tsx`
- Modify: `app/(app)/layout.tsx` (wrap children with the provider)

- [ ] **Step 1: Read the current layout to understand its structure**

```bash
cat /home/fhuang5/Developer/I.R.I.S/app/\(app\)/layout.tsx
```

Note where the children are rendered and how supabase server client is set up.

- [ ] **Step 2: Create `lib/hooks/useUserContext.tsx`**

```tsx
// lib/hooks/useUserContext.tsx
'use client';

import { createContext, useContext, type ReactNode } from 'react';

export interface UserContextValue {
  myUserId: string;
  myName: string;
  partnerUserId: string | null;
  partnerName: string | null;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserContextProvider({
  value,
  children,
}: {
  value: UserContextValue;
  children: ReactNode;
}) {
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUserContext(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error('useUserContext must be used inside <UserContextProvider>');
  }
  return ctx;
}
```

- [ ] **Step 3: Wire the provider in `app/(app)/layout.tsx`**

Add at the top of the file (after existing imports):

```typescript
import { UserContextProvider, type UserContextValue } from '@/lib/hooks/useUserContext';
```

Inside the layout server component (after auth check, before rendering children), build the context value:

```typescript
// Load auth user + all user_profiles in parallel
const [{ data: authData }, { data: profiles }] = await Promise.all([
  supabase.auth.getUser(),
  supabase.from('user_profiles').select('*'),
]);
const myUserId = authData.user!.id;
const myProfile = profiles?.find((p) => p.user_id === myUserId) ?? null;
const partnerProfile = profiles?.find((p) => p.user_id !== myUserId) ?? null;

const userContextValue: UserContextValue = {
  myUserId,
  myName: myProfile?.display_name ?? authData.user!.email ?? 'Moi',
  partnerUserId: partnerProfile?.user_id ?? null,
  partnerName: partnerProfile?.display_name ?? null,
};
```

Then wrap the existing layout children with `<UserContextProvider value={userContextValue}>...</UserContextProvider>`.

- [ ] **Step 4: Verify tsc clean for new files**

```bash
source ~/.nvm/nvm.sh && nvm use && npx tsc --noEmit 2>&1 | grep -E "useUserContext|app/\(app\)/layout" | head -5
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add lib/hooks/useUserContext.tsx "app/(app)/layout.tsx"
git commit -m "Phase 4: useUserContext hook + Provider chargé au layout"
```

---

## Task 7: `<ListingBadges>` composant générique

**Files:**
- Create: `components/vinted/ListingBadges.tsx`

- [ ] **Step 1: Create the component**

```tsx
// components/vinted/ListingBadges.tsx
'use client';

import { useState } from 'react';
import { Globe, GlobeLock, AlertTriangle, X } from 'lucide-react';
import type { BaseListing } from '@/lib/types';
import {
  getMyListing,
  getPartnerListing,
  isStaleForListing,
} from '@/lib/utils/listings';
import ConfirmDialog from './ConfirmDialog';

interface Props {
  itemKind: 'card' | 'lot';
  itemId: string;
  itemStatus: string;
  listings: BaseListing[];
  myUserId: string;
  partnerUserId: string | null;
  partnerName: string | null;
  /** Called after a successful POST /api/listings — caller updates local state. */
  onListed: () => void;
  /** Called after a successful DELETE /api/listings/[kind]/[id]. */
  onUnlisted: () => void;
}

function daysSince(iso: string, now: number): number {
  return Math.floor((now - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

export default function ListingBadges({
  itemKind,
  itemId,
  itemStatus,
  listings,
  myUserId,
  partnerUserId,
  partnerName,
  onListed,
  onUnlisted,
}: Props) {
  const [now] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const mine = getMyListing(listings, myUserId);
  const partner = getPartnerListing(listings, partnerUserId);
  const stale = isStaleForListing(mine, now);
  const toDelete = mine !== null && itemStatus !== 'for_sale';

  async function postListing() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: itemKind, id: itemId }),
      });
      if (res.ok) onListed();
    } finally {
      setBusy(false);
    }
  }

  async function deleteListing() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/listings/${itemKind}/${itemId}`, {
        method: 'DELETE',
      });
      if (res.ok) onUnlisted();
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  // Layout: badges horizontal stack, max 3 + optional "list" / "unlist" button
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {mine && (
          <span className="bg-green/20 text-green inline-flex items-center gap-1 rounded px-1.5 py-0.5">
            <Globe className="h-3 w-3" />
            Listée par Moi · {daysSince(mine.listed_at, now)}j
            {stale && (
              <span className="bg-red text-bg ml-1 rounded px-1 py-0.5 text-[10px] font-medium">
                Stale
              </span>
            )}
          </span>
        )}

        {partner && partnerName && (
          <span className="bg-blue/20 text-blue inline-flex items-center gap-1 rounded px-1.5 py-0.5">
            <Globe className="h-3 w-3" />
            Listée par {partnerName}
          </span>
        )}

        {toDelete && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={busy}
            className="bg-red text-bg inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:opacity-90 disabled:opacity-50"
          >
            <AlertTriangle className="h-3 w-3" />
            À retirer
          </button>
        )}

        {!mine && (
          <button
            type="button"
            onClick={postListing}
            disabled={busy}
            className="bg-surface-2 hover:bg-surface-off border-border inline-flex items-center gap-1 rounded border px-1.5 py-0.5 disabled:opacity-50"
          >
            <GlobeLock className="h-3 w-3" />
            Mettre en ligne
          </button>
        )}

        {mine && !toDelete && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={busy}
            aria-label="Retirer mon annonce"
            className="text-text-muted hover:text-red inline-flex items-center rounded p-0.5 disabled:opacity-50"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Retirer ton annonce ?"
          message={
            toDelete
              ? `${itemKind === 'card' ? 'Cette carte' : 'Ce lot'} n'est plus disponible. Confirmer le retrait de ton annonce Vinted (côté IRIS) ?`
              : `Confirmer le retrait de ton annonce sur cette ${itemKind === 'card' ? 'carte' : 'lot'} ?`
          }
          confirmLabel="Retirer"
          onConfirm={deleteListing}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify ConfirmDialog signature matches**

```bash
grep -n "interface Props\|export default" /home/fhuang5/Developer/I.R.I.S/components/vinted/ConfirmDialog.tsx | head -5
```

If the props don't match (`title`, `message`, `confirmLabel`, `onConfirm`, `onCancel`), adjust the call to use the actual prop names.

- [ ] **Step 3: tsc check**

```bash
source ~/.nvm/nvm.sh && nvm use && npx tsc --noEmit 2>&1 | grep -E "ListingBadges" | head -5
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add components/vinted/ListingBadges.tsx
git commit -m "Phase 4: <ListingBadges> composant générique (cards + lots, vert/bleu/rouge + confirm dialog)"
```

---

## Task 8: Refactor `<VintedRow>` + `<LotRow>` — replace `<VintedListedToggle>` by `<ListingBadges>`

**Files:**
- Modify: `components/vinted/VintedRow.tsx`
- Modify: `components/lots/LotRow.tsx`

- [ ] **Step 1: Read current VintedRow Props to know what to update**

```bash
grep -n "interface Props\|VintedListedToggle\|onListedToggled" /home/fhuang5/Developer/I.R.I.S/components/vinted/VintedRow.tsx
```

Note the existing prop `onListedToggled`. We'll replace it with `onListed`/`onUnlisted` callbacks (matching `<ListingBadges>` API).

- [ ] **Step 2: Modify `components/vinted/VintedRow.tsx` Props + render**

In the `Props` interface:
- Remove: `onListedToggled: (cardId: string, listedAt: string | null) => void;`
- Add:
  ```typescript
  listings: BaseListing[];
  myUserId: string;
  partnerUserId: string | null;
  partnerName: string | null;
  onListingsChanged: () => void;
  ```
- Keep all other existing props.

Add to imports:
```typescript
import type { BaseListing } from '@/lib/types';
import ListingBadges from './ListingBadges';
```

In the JSX, find the `<VintedListedToggle ... />` and replace with:

```tsx
<ListingBadges
  itemKind="card"
  itemId={card.id}
  itemStatus={card.status}
  listings={group.head.listings ?? []}
  myUserId={myUserId}
  partnerUserId={partnerUserId}
  partnerName={partnerName}
  onListed={onListingsChanged}
  onUnlisted={onListingsChanged}
/>
```

> Note: `group.head.listings` requires `CardGroup` to carry a `CardWithListings` head. If the current type is `Card`, the parent component (`<VintedList>`) is hydrating with listings already (Task 10) — this is the prop type we expect.

- [ ] **Step 3: Repeat for `components/lots/LotRow.tsx`**

Same pattern. Add same 5 props. Replace `<VintedListedToggle ... />` with:

```tsx
<ListingBadges
  itemKind="lot"
  itemId={lot.id}
  itemStatus={lot.status}
  listings={lot.listings ?? []}
  myUserId={myUserId}
  partnerUserId={partnerUserId}
  partnerName={partnerName}
  onListed={onListingsChanged}
  onUnlisted={onListingsChanged}
/>
```

- [ ] **Step 4: tsc check**

```bash
source ~/.nvm/nvm.sh && nvm use && npx tsc --noEmit 2>&1 | head -20
```

Expected: errors in `<VintedList>` because the prop signature changed and we haven't updated the call sites yet — these will be fixed in Task 10.

- [ ] **Step 5: Commit**

```bash
git add components/vinted/VintedRow.tsx components/lots/LotRow.tsx
git commit -m "Phase 4: <VintedRow> + <LotRow> use <ListingBadges> instead of <VintedListedToggle>"
```

---

## Task 9: Extend `<VintedFilters>` — multi-user chips ligne

**Files:**
- Modify: `components/vinted/VintedFilters.tsx`

- [ ] **Step 1: Read current `<VintedFilters>` to see where the chips are rendered**

```bash
grep -n "showOnline\|showOffline\|showStale\|showSold\|chip" /home/fhuang5/Developer/I.R.I.S/components/vinted/VintedFilters.tsx | head -20
```

- [ ] **Step 2: Add the multi-user chip UI**

In the component body, just below the existing state-chips row, add a separator + a new row of chips. Required imports:

```typescript
import { User, Users } from 'lucide-react'; // any 2 distinct icons
```

In `Props`, the `value: VintedFilterState` already has `multiUserChip` (added in Task 4). Just add:

```typescript
hasPartner: boolean;
```

In the JSX (below the state chips, e.g. after the `Vendus` chip and before the search input — adjust based on existing layout):

```tsx
<div className="border-border my-1 border-t" />
<div className="flex flex-wrap items-center gap-1.5">
  <button
    type="button"
    onClick={() => onChange({ ...value, multiUserChip: 'all' })}
    className={chipClass(value.multiUserChip === 'all')}
  >
    <Users className="h-3.5 w-3.5" />
    Tous
  </button>
  <button
    type="button"
    onClick={() => onChange({ ...value, multiUserChip: 'mine' })}
    className={chipClass(value.multiUserChip === 'mine')}
  >
    <User className="h-3.5 w-3.5" />
    Mes annonces
  </button>
  {hasPartner && (
    <>
      <button
        type="button"
        onClick={() => onChange({ ...value, multiUserChip: 'partner' })}
        className={chipClass(value.multiUserChip === 'partner')}
      >
        <User className="h-3.5 w-3.5" />
        Ses annonces
      </button>
      <button
        type="button"
        onClick={() => onChange({ ...value, multiUserChip: 'cross' })}
        className={chipClass(value.multiUserChip === 'cross')}
      >
        <Users className="h-3.5 w-3.5" />
        Cross-listées
      </button>
    </>
  )}
  <button
    type="button"
    onClick={() => onChange({ ...value, multiUserChip: 'none' })}
    className={chipClass(value.multiUserChip === 'none')}
  >
    Non listées
  </button>
  {hasPartner && (
    <button
      type="button"
      onClick={() => onChange({ ...value, multiUserChip: 'to_delete' })}
      className={chipClass(value.multiUserChip === 'to_delete')}
    >
      À retirer
    </button>
  )}
</div>
```

Where `chipClass(active)` is a helper (define near the top of the component if not already present):

```typescript
function chipClass(active: boolean) {
  return active
    ? 'bg-red text-bg inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium'
    : 'bg-surface-2 hover:bg-surface-off border-border text-text-muted inline-flex items-center gap-1 rounded border px-2 py-1 text-xs';
}
```

> If a similar helper already exists (e.g. `stateChipClass`), reuse it instead of duplicating.

- [ ] **Step 3: tsc check**

```bash
source ~/.nvm/nvm.sh && nvm use && npx tsc --noEmit 2>&1 | grep -E "VintedFilters" | head -5
```

Expected: errors in `<VintedList>` because the new `hasPartner` prop isn't passed yet (Task 10 fixes this).

- [ ] **Step 4: Commit**

```bash
git add components/vinted/VintedFilters.tsx
git commit -m "Phase 4: VintedFilters — ajout axe multi-user chips (mine/partner/cross/none/to_delete) avec hasPartner gate"
```

---

## Task 10: `<VintedList>` — hydrate listings + wire `useUserContext` + plumb props

**Files:**
- Modify: `components/vinted/VintedList.tsx`
- Modify: `app/(app)/vinted/page.tsx`

- [ ] **Step 1: Update server-side query in `app/(app)/vinted/page.tsx`**

Find where `cards` and `lots` are loaded. Add parallel fetches for `card_listings`, `lot_listings`, and hydrate before passing to `<VintedList>`:

```typescript
// Add to the existing Promise.all
const [
  { data: cards }, { data: lots },
  { data: cardListings }, { data: lotListings },
] = await Promise.all([
  supabase.from('cards').select('*').in('status', ['for_sale', 'sold']),
  supabase.from('lots').select('*').in('status', ['for_sale', 'sold']),
  supabase.from('card_listings').select('*'),
  supabase.from('lot_listings').select('*'),
]);

const cardsWithListings = (cards ?? []).map((c) => ({
  ...c,
  listings: (cardListings ?? []).filter((l) => l.card_id === c.id),
}));
const lotsWithListings = (lots ?? []).map((l) => ({
  ...l,
  listings: (lotListings ?? []).filter((ll) => ll.lot_id === l.id),
}));
```

Pass `cardsWithListings` + `lotsWithListings` to `<VintedList>` instead of bare `cards` + `lots`.

- [ ] **Step 2: Update `<VintedList>` Props + state**

In `components/vinted/VintedList.tsx`:

```typescript
import type { CardWithListings, LotWithListings } from '@/lib/types';
import { useUserContext } from '@/lib/hooks/useUserContext';
import { passesMultiUserChip } from '@/lib/utils/vinted-filter';

export interface VintedListProps {
  cards: CardWithListings[];
  lots: LotWithListings[];
  registered: Set<number>;
  config: Record<string, string>;
}
```

Inside the component:

```typescript
const { myUserId, partnerUserId, partnerName } = useUserContext();
```

Find the `useMemo` filtering block. Wherever `passesStateChips(c, filters, now)` is called, also AND with `passesMultiUserChip(c, filters.multiUserChip, myUserId, partnerUserId)`. Same for the lots filter.

Replace `setCards` / `setLots` initial state types from `Card[]` / `Lot[]` to `CardWithListings[]` / `LotWithListings[]`.

- [ ] **Step 3: Add a `refreshFromServer` callback for ListingBadges**

The `<ListingBadges>` calls `onListed`/`onUnlisted` after a POST/DELETE. The simplest implementation: refresh the listings from server.

Add at the top of `<VintedList>`:

```typescript
const router = useRouter(); // already imported
async function onListingsChanged() {
  router.refresh();
}
```

Then pass `onListingsChanged={onListingsChanged}` to every `<VintedRow>` and `<LotRow>`. Also pass `myUserId` / `partnerUserId` / `partnerName`.

- [ ] **Step 4: Pass `hasPartner` to `<VintedFilters>`**

```tsx
<VintedFilters
  value={filters}
  onChange={setFilters}
  visibleCards={totalVisible}
  totalCards={cards.length}
  selectionMode={selectionMode}
  onToggleSelectionMode={toggleSelectionMode}
  hasPartner={partnerUserId !== null}
/>
```

- [ ] **Step 5: tsc + tests**

```bash
source ~/.nvm/nvm.sh && nvm use && npx tsc --noEmit 2>&1 | tail -10
source ~/.nvm/nvm.sh && nvm use && npm test 2>&1 | tail -10
```

Expected at this stage: tsc may still have errors around old `vinted_listed_at` references (Tasks 11-12 clean those). Tests should pass for the new helpers (Tasks 3-4).

- [ ] **Step 6: Commit**

```bash
git add components/vinted/VintedList.tsx "app/(app)/vinted/page.tsx"
git commit -m "Phase 4: VintedList hydrate listings + wire useUserContext + multi-user chip filtering"
```

---

## Task 11: SoldModal + BulkSoldModal — bandeau partner + side-effect DELETE my listing

**Files:**
- Modify: `components/vinted/SoldModal.tsx`
- Modify: `components/vinted/BulkSoldModal.tsx`
- Modify: `components/vinted/BulkSoldRecapModal.tsx`
- Modify: `components/vinted/VintedList.tsx` (handlers)

- [ ] **Step 1: SoldModal — add props + bandeau**

In `components/vinted/SoldModal.tsx`, add to Props:

```typescript
partnerListing: { user_id: string; listed_at: string } | null;
partnerName: string | null;
```

In the JSX, insert at the top of the modal body (before the existing form):

```tsx
{props.partnerListing && props.partnerName && (
  <div className="bg-red/20 border-red mb-4 rounded border px-3 py-2 text-sm">
    <p className="text-red font-medium">⚠ {props.partnerName} a aussi cette carte en ligne sur Vinted.</p>
    <p className="text-text-muted mt-1 text-xs">
      Si tu ne remets pas un autre exemplaire en vente, {props.partnerName} devra retirer son annonce manuellement.
    </p>
  </div>
)}
```

- [ ] **Step 2: BulkSoldModal — aggregate partner banner**

Add to Props:

```typescript
partnerName: string | null;
partnerListedItems: Array<{ name: string }>; // pre-filtered list
```

In the JSX, insert at the top of the modal body:

```tsx
{props.partnerName && props.partnerListedItems.length > 0 && (
  <div className="bg-red/20 border-red mb-4 rounded border px-3 py-2 text-sm">
    <p className="text-red font-medium">
      ⚠ {props.partnerName} a aussi {props.partnerListedItems.length} de ces cartes en ligne sur Vinted.
    </p>
    <ul className="text-text-muted mt-1 list-disc pl-5 text-xs">
      {props.partnerListedItems.slice(0, 5).map((it, i) => (
        <li key={i}>{it.name}</li>
      ))}
      {props.partnerListedItems.length > 5 && (
        <li>… et {props.partnerListedItems.length - 5} autres.</li>
      )}
    </ul>
  </div>
)}
```

- [ ] **Step 3: BulkSoldRecapModal — same pattern at the bottom**

Add a new prop `partnerListedItems` (same shape) + render a section near the bottom of the recap:

```tsx
{props.partnerListedItems && props.partnerListedItems.length > 0 && props.partnerName && (
  <div className="bg-surface-2 mt-4 rounded p-3 text-sm">
    <p className="font-medium">À demander à {props.partnerName} de retirer :</p>
    <ul className="text-text-muted mt-1 list-disc pl-5 text-xs">
      {props.partnerListedItems.map((it, i) => (
        <li key={i}>{it.name}</li>
      ))}
    </ul>
  </div>
)}
```

- [ ] **Step 4: Wire props from `<VintedList>`**

In `<VintedList>`, when opening the SoldModal, compute the partner listing:

```typescript
const partnerListing = soldTarget?.kind === 'card'
  ? getPartnerListing(soldTarget.card.listings, partnerUserId)
  : null; // lots not relevant for partner banner — actually compute too if you want consistency
```

Pass `partnerListing` + `partnerName` to `<SoldModal>`.

For `<BulkSoldModal>`, when opening, build:

```typescript
const partnerListedItems = bulkSelection
  .map((it) => {
    const listings = it.kind === 'card' ? it.card.listings : it.lot.listings;
    const name = it.kind === 'card' ? it.card.card_name : it.lot.name;
    if (getPartnerListing(listings, partnerUserId)) return { name };
    return null;
  })
  .filter((x): x is { name: string } => x !== null);
```

Pass `partnerListedItems` + `partnerName` to both `<BulkSoldModal>` and `<BulkSoldRecapModal>`.

- [ ] **Step 5: Side-effect — DELETE my listing after Sold confirmation**

In `<VintedList>`, in `handleSold` (single-card sold) AND `handleBulkSold` (bulk), after the PATCH /api/cards/[id] returns success, add:

```typescript
// Remove my own listing for this card if it exists. Fire-and-forget — the
// invariant "I'm not listed on a sold card from my POV" is best-effort UX.
fetch(`/api/listings/card/${cardId}`, { method: 'DELETE' }).catch(() => {
  // Silent — RLS allows me to delete my own only, error is non-fatal.
});
```

For lots, similarly with `/api/listings/lot/${lotId}`.

- [ ] **Step 6: tsc + tests**

```bash
source ~/.nvm/nvm.sh && nvm use && npx tsc --noEmit 2>&1 | tail -10
source ~/.nvm/nvm.sh && nvm use && npm test 2>&1 | tail -10
```

Expected: tsc clean for modal changes; tests still green.

- [ ] **Step 7: Commit**

```bash
git add components/vinted/SoldModal.tsx components/vinted/BulkSoldModal.tsx components/vinted/BulkSoldRecapModal.tsx components/vinted/VintedList.tsx
git commit -m "Phase 4: SoldModal + BulkSoldModal + Recap bandeaux partner + side-effect DELETE my listing"
```

---

## Task 12: Cleanup PATCH routes — remove `vinted_listed_at` from `/api/cards/[id]` and `/api/lots/[id]`

**Files:**
- Modify: `app/api/cards/[id]/route.ts`
- Modify: `app/api/lots/[id]/route.ts`

- [ ] **Step 1: Modify `app/api/cards/[id]/route.ts`**

Find the section dealing with `vinted_listed_at` (around line 88-99 per earlier grep). Remove the entire validation block + the corresponding field on `update`. Also remove the `vinted_listed_at?: string | null;` from the `PatchBody` interface.

- [ ] **Step 2: Modify `app/api/lots/[id]/route.ts`**

Same cleanup. Find the `vinted_listed_at` reference and remove validation + assignment + interface field.

- [ ] **Step 3: tsc + lint**

```bash
source ~/.nvm/nvm.sh && nvm use && npx tsc --noEmit 2>&1 | grep -E "vinted_listed_at" | head -5
source ~/.nvm/nvm.sh && nvm use && npm run lint 2>&1 | tail -5
```

Expected: no `vinted_listed_at` errors remaining.

- [ ] **Step 4: Commit**

```bash
git add "app/api/cards/[id]/route.ts" "app/api/lots/[id]/route.ts"
git commit -m "Phase 4: drop vinted_listed_at from PATCH /api/cards/[id] and /api/lots/[id]"
```

---

## Task 13: Drop `<VintedListedToggle>` + remove all references

**Files:**
- Delete: `components/vinted/VintedListedToggle.tsx`
- Verify: no other file imports it

- [ ] **Step 1: Verify no remaining importers**

```bash
grep -rn "VintedListedToggle" /home/fhuang5/Developer/I.R.I.S/{app,components,lib} --include='*.ts' --include='*.tsx' 2>&1
```

Expected: only the file itself appears (and zero importers post-Task 8). If any importers remain, fix them first.

- [ ] **Step 2: Delete the file**

```bash
rm /home/fhuang5/Developer/I.R.I.S/components/vinted/VintedListedToggle.tsx
```

- [ ] **Step 3: tsc**

```bash
source ~/.nvm/nvm.sh && nvm use && npx tsc --noEmit 2>&1 | tail -5
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Phase 4: drop VintedListedToggle component (replaced by ListingBadges in Task 8)"
```

---

## Task 14: Lint + tests + build + smoke test handoff

**Files:** none (verification only)

- [ ] **Step 1: Full check**

```bash
source ~/.nvm/nvm.sh && nvm use
echo "=== TSC ===" && npx tsc --noEmit 2>&1 | tail -5
echo "=== LINT ===" && npm run lint 2>&1 | tail -5
echo "=== TEST ===" && npm test 2>&1 | tail -10
echo "=== BUILD ===" && npm run build 2>&1 | tail -15
```

Expected:
- TSC : 0 errors
- LINT : 0 warnings
- TEST : 279 baseline + ~14 new (8 listings + 6 multi-user chip) = ~293 passing
- BUILD : success

- [ ] **Step 2: Final commit if any cleanup was needed**

If anything was fixed in step 1, commit. Otherwise skip.

```bash
git add -p
git commit -m "Phase 4: final cleanup post-verification"
```

- [ ] **Step 3: Smoke test handoff message to user**

The agent reports back to the user with this exact handoff:

> Phase 4 implementation complete. Before testing, **2 actions required by you**:
>
> 1. **Apply migration** via Supabase Studio → SQL Editor : copy-paste the content of `supabase/migrations/20260505000000_phase4_multi_user.sql` and run.
> 2. **Disable public signup** : Authentication → Settings → décocher "Enable email signups".
>
> Then `npm run dev` and smoke-test:
>
> - **Toi (Lui)** te connectes → vue Vinted. Toggle "Mettre en ligne" sur une carte → badge vert "Listée par Moi · 0j" apparaît.
> - **Elle** se connecte sur la même carte → badge bleu "Listée par Lui" visible.
> - **Elle** toggle → cross-listée des 2 côtés (vert + bleu chacun).
> - **Toi** marques cette carte Vendue via SoldModal → bandeau rouge "Elle a aussi cette carte en ligne".
> - **Elle** voit badge rouge "À retirer" sur cette carte. Click → confirm → listing supprimé.
> - **Filtres multi-user** : tester chaque chip (mine / partner / cross / none / to_delete) seul + en combo avec chip d'état.
> - **Bulk vendu** : sélectionner 2+ cartes dont au moins une cross-listée → BulkSoldModal montre bandeau partner + Recap montre la liste à retirer.

---

## Self-review

**1. Spec coverage check** :

| Spec section | Implemented in Task |
|---|---|
| §2.1 Migration SQL | Task 1 |
| §2.2 RLS rationale | Task 1 (policies inside migration) |
| §2.3 Auth setup (user action) | Task 14 step 3 (handoff message) |
| §3.1-§3.2 Types | Task 2 |
| §4.1 Helpers `listings.ts` | Task 3 |
| §4.2 `passesMultiUserChip` + `MultiUserChip` type | Task 4 |
| §5.1 POST /api/listings + DELETE | Task 5 |
| §5.2 PATCH /api/cards/[id] cleanup | Task 12 |
| §5.3 PATCH /api/lots/[id] cleanup | Task 12 |
| §6.1 useUserContext hook | Task 6 |
| §6.2 ListingBadges component | Task 7 |
| §6.3 VintedRow + LotRow refactor | Task 8 |
| §6.4 VintedFilters multi-user chips | Task 9 |
| §6.5 SoldModal banner | Task 11 |
| §6.6 BulkSoldModal + Recap banners + side-effect | Task 11 |
| §6.7 page /vinted query | Task 10 step 1 |
| §6.8-§6.9 Stock + Pokédex (no change) | (no task — explicit) |
| §7 Tests | Tasks 3, 4 (TDD inline) |
| §8 Cleanup VintedListedToggle | Task 13 |

All spec sections covered. ✓

**2. Placeholder scan** :

- No `TBD`, `TODO`, `implement later` in plan. ✓
- No "add appropriate error handling" — error handling is shown explicitly (e.g. `setBusy(false)` in finally, `RLS enforces user_id = auth.uid()`). ✓
- All TS/TSX code blocks are complete and self-contained. ✓
- Type names consistent: `BaseListing`, `CardListing`, `LotListing`, `CardWithListings`, `LotWithListings`, `MultiUserChip`, `UserContextValue` — used identically across all tasks. ✓

**3. Type consistency** :

- Helper signatures in Task 3 match usage in Task 7 (`<ListingBadges>`) and Task 11 (computing partnerListing). ✓
- API endpoint shapes (POST body, DELETE URL) consistent between Task 5 and Task 7. ✓
- `onListingsChanged` callback name consistent across `<VintedRow>` (Task 8) and `<VintedList>` (Task 10). ✓

Plan is internally consistent and spec-complete.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-04-phase-4-multi-user.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, two-stage review per task, fast iteration. Same workflow as Phase 3c.

**2. Inline Execution** — execute tasks in this session via executing-plans, batch execution with checkpoints.

**Which approach?**
