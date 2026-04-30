# Phase 3a — Cron Pricing TCGdex Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a daily Vercel cron that refreshes Cardmarket prices via TCGdex for `for_sale` cards, with a UI badge showing freshness + manual refresh button per row.

**Architecture:** Server route protected by `CRON_SECRET` (bulk mode) + by Supabase auth (single-card mode). Pure helpers categorize cards (tcgdex / backfill / skip), recalc `suggested_price` only when not manually touched, and format the staleness label. UI exposes the freshness via `<PriceFreshnessBadge>` + `<RefreshPriceButton>` integrated into `VintedRow`, `StockRow`, and `PokedexDrawer`.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Vitest + happy-dom, Supabase service-role client, TCGdex API (already wired in `lib/api/tcgdex.ts`), Tailwind v4 design tokens, Lucide icons.

**Spec:** [docs/superpowers/specs/2026-05-01-phase-3a-cron-pricing-design.md](../specs/2026-05-01-phase-3a-cron-pricing-design.md)

---

## File Structure

**New files:**
- `lib/utils/categorize-pricing-card.ts` — pure helper: returns `'tcgdex' | 'backfill' | 'skip'`
- `lib/utils/categorize-pricing-card.test.ts` — 5 tests
- `lib/utils/format-staleness.ts` — pure helper: returns `{ tone, label, daysSince }`
- `lib/utils/format-staleness.test.ts` — 4 tests
- `lib/utils/recalc-suggested-price.ts` — pure helper: returns the new `suggested_price` value
- `lib/utils/recalc-suggested-price.test.ts` — 5 tests
- `app/api/prices/update/route.ts` — `POST` handler, both bulk and single-card modes
- `app/api/prices/update/route.test.ts` — 7 integration tests with Supabase + fetch mocks
- `components/ui/PriceFreshnessBadge.tsx` — small inline badge
- `components/ui/RefreshPriceButton.tsx` — button with loading/success/error states
- `vercel.json` — cron schedule

**Modified files:**
- `.env.example` — add `CRON_SECRET=`
- `app/globals.css` — 4 new staleness color tokens
- `components/vinted/VintedRow.tsx` — wire badge + button into the price area
- `components/stock/StockRow.tsx` — same as VintedRow
- `components/pokedex/PokedexDrawer.tsx` — replace the "Pas encore de prix Cardmarket — viendra avec le cron Phase 3" placeholder ([line 147](../../../components/pokedex/PokedexDrawer.tsx#L147)) with the badge + button next to the price block

---

## Task 1: Helper `categorize-pricing-card`

**Files:**
- Create: `lib/utils/categorize-pricing-card.ts`
- Test: `lib/utils/categorize-pricing-card.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/utils/categorize-pricing-card.test.ts
import { describe, expect, it } from 'vitest';
import { categorizePricingCard } from './categorize-pricing-card';
import type { Card } from '@/lib/types';

function makeCard(over: Partial<Card> = {}): Card {
  return {
    id: 'card-1',
    pokemon_name: 'Pikachu',
    pokemon_number: 25,
    card_name: 'Pikachu ex',
    card_id_tcg: 'sv2a-25',
    set_name: '151',
    set_code: 'sv2a',
    set_number: '025/165',
    language: 'JP',
    rarity: 'AR',
    rarity_rank: 0,
    condition: 'NM',
    status: 'for_sale',
    image_url: null,
    tcg_image_url: null,
    cardmarket_id: null,
    cm_price_low: null,
    cm_price_trend: null,
    cm_price_avg: null,
    suggested_price: null,
    cm_updated_at: null,
    vinted_listed_at: null,
    lot_id: null,
    date_added: '2026-05-01T00:00:00Z',
    date_sold: null,
    sold_price: null,
    notes: null,
    variant: null,
    ...over,
  };
}

describe('categorizePricingCard', () => {
  it('returns "tcgdex" when card_id_tcg is set and variant is null', () => {
    expect(categorizePricingCard(makeCard())).toBe('tcgdex');
  });

  it('returns "skip" when variant is not null (preserves manual variant prices)', () => {
    expect(categorizePricingCard(makeCard({ variant: 'pokeball' }))).toBe('skip');
    expect(categorizePricingCard(makeCard({ variant: 'reverse_holo' }))).toBe('skip');
  });

  it('returns "backfill" when card_id_tcg is null but set_code+set_number+language are valid', () => {
    expect(
      categorizePricingCard(
        makeCard({ card_id_tcg: null, set_code: 'sv2a', set_number: '025/165', language: 'JP' }),
      ),
    ).toBe('backfill');
  });

  it('returns "skip" for languages not catalogued by TCGdex (KO, ZH)', () => {
    expect(categorizePricingCard(makeCard({ language: 'KO' }))).toBe('skip');
    expect(categorizePricingCard(makeCard({ language: 'ZH' }))).toBe('skip');
  });

  it('returns "skip" when set_code or set_number is missing (cannot lookup)', () => {
    expect(categorizePricingCard(makeCard({ card_id_tcg: null, set_code: null }))).toBe('skip');
    expect(categorizePricingCard(makeCard({ card_id_tcg: null, set_number: null }))).toBe('skip');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/utils/categorize-pricing-card.test.ts`
Expected: FAIL — `Cannot find module './categorize-pricing-card'`

- [ ] **Step 3: Write the helper**

```typescript
// lib/utils/categorize-pricing-card.ts
import type { Card, CardLanguage } from '@/lib/types';

export type PricingCategory = 'tcgdex' | 'backfill' | 'skip';

const TCGDEX_LANGUAGES: ReadonlySet<CardLanguage> = new Set([
  'JP', 'EN', 'FR', 'DE', 'IT', 'ES', 'PT',
]);

/**
 * Decide what the cron should do for one card.
 *
 *   tcgdex   — card_id_tcg known, fetch TCGdex directly
 *   backfill — card_id_tcg unknown but set_code/number/language are usable,
 *              try the catalog lookup first, then TCGdex
 *   skip     — variant != null (preserve manual prices), missing identifiers,
 *              or language not catalogued by TCGdex (KO, ZH)
 */
export function categorizePricingCard(card: Card): PricingCategory {
  if (card.variant !== null) return 'skip';
  if (!TCGDEX_LANGUAGES.has(card.language)) return 'skip';
  if (card.card_id_tcg !== null) return 'tcgdex';
  if (card.set_code && card.set_number) return 'backfill';
  return 'skip';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/utils/categorize-pricing-card.test.ts`
Expected: PASS — 5/5 tests

- [ ] **Step 5: Commit**

```bash
git add lib/utils/categorize-pricing-card.ts lib/utils/categorize-pricing-card.test.ts
git commit -m "Phase 3a: pure helper categorizePricingCard (5 tests)"
```

---

## Task 2: Helper `format-staleness`

**Files:**
- Create: `lib/utils/format-staleness.ts`
- Test: `lib/utils/format-staleness.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/utils/format-staleness.test.ts
import { describe, expect, it } from 'vitest';
import { formatStaleness } from './format-staleness';

const NOW = new Date('2026-05-01T12:00:00Z');
const dayMs = 24 * 60 * 60 * 1000;
const isoDaysAgo = (d: number) => new Date(NOW.getTime() - d * dayMs).toISOString();

describe('formatStaleness', () => {
  it('returns "never" when cm_updated_at is null', () => {
    expect(formatStaleness(null, NOW)).toEqual({
      tone: 'never',
      label: 'Jamais maj',
      daysSince: null,
    });
  });

  it('returns "fresh" when updated less than 24h ago', () => {
    expect(formatStaleness(isoDaysAgo(0), NOW)).toEqual({
      tone: 'fresh',
      label: 'Frais',
      daysSince: 0,
    });
  });

  it('returns "stale" between 1 and 7 days', () => {
    expect(formatStaleness(isoDaysAgo(3), NOW)).toEqual({
      tone: 'stale',
      label: 'Maj il y a 3j',
      daysSince: 3,
    });
    expect(formatStaleness(isoDaysAgo(7), NOW)).toEqual({
      tone: 'stale',
      label: 'Maj il y a 7j',
      daysSince: 7,
    });
  });

  it('returns "old" when more than 7 days', () => {
    expect(formatStaleness(isoDaysAgo(8), NOW)).toEqual({
      tone: 'old',
      label: 'Maj il y a 8j',
      daysSince: 8,
    });
    expect(formatStaleness(isoDaysAgo(45), NOW)).toEqual({
      tone: 'old',
      label: 'Maj il y a 45j',
      daysSince: 45,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/utils/format-staleness.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the helper**

```typescript
// lib/utils/format-staleness.ts
/**
 * Map cm_updated_at into a 4-tone freshness label for the UI.
 *
 *   < 24h     → "fresh" (no urgency)
 *   1–7 days  → "stale" (mild signal)
 *   > 7 days  → "old"   (strong signal)
 *   null      → "never" (never refreshed)
 */

export type StalenessTone = 'fresh' | 'stale' | 'old' | 'never';

export interface StalenessLabel {
  tone: StalenessTone;
  label: string;
  daysSince: number | null;
}

const dayMs = 24 * 60 * 60 * 1000;

export function formatStaleness(cm_updated_at: string | null, now: Date): StalenessLabel {
  if (cm_updated_at === null) {
    return { tone: 'never', label: 'Jamais maj', daysSince: null };
  }
  const elapsed = now.getTime() - new Date(cm_updated_at).getTime();
  const daysSince = Math.floor(elapsed / dayMs);
  if (daysSince < 1) return { tone: 'fresh', label: 'Frais', daysSince };
  if (daysSince <= 7) return { tone: 'stale', label: `Maj il y a ${daysSince}j`, daysSince };
  return { tone: 'old', label: `Maj il y a ${daysSince}j`, daysSince };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/utils/format-staleness.test.ts`
Expected: PASS — 4/4 tests

- [ ] **Step 5: Commit**

```bash
git add lib/utils/format-staleness.ts lib/utils/format-staleness.test.ts
git commit -m "Phase 3a: pure helper formatStaleness (4 tests)"
```

---

## Task 3: Helper `recalc-suggested-price`

**Files:**
- Create: `lib/utils/recalc-suggested-price.ts`
- Test: `lib/utils/recalc-suggested-price.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/utils/recalc-suggested-price.test.ts
import { describe, expect, it } from 'vitest';
import { recalcSuggestedPrice } from './recalc-suggested-price';

describe('recalcSuggestedPrice', () => {
  const coeff = 0.85;

  it('returns the existing suggested_price when newTrend is null', () => {
    expect(
      recalcSuggestedPrice({
        oldTrend: 10, newTrend: null, oldSuggested: 8.5, coeff,
      }),
    ).toBe(8.5);
  });

  it('computes from newTrend when oldSuggested was never set', () => {
    expect(
      recalcSuggestedPrice({
        oldTrend: null, newTrend: 12, oldSuggested: null, coeff,
      }),
    ).toBe(10.2);
  });

  it('recomputes when oldSuggested looks auto-derived (oldTrend × coeff)', () => {
    // oldSuggested = 10 * 0.85 = 8.5  → never edited manually
    expect(
      recalcSuggestedPrice({
        oldTrend: 10, newTrend: 12, oldSuggested: 8.5, coeff,
      }),
    ).toBe(10.2);
  });

  it('preserves oldSuggested when it does NOT match oldTrend × coeff (manual edit)', () => {
    // oldSuggested = 15.0 ≠ 10 * 0.85, so the user touched it. Don't overwrite.
    expect(
      recalcSuggestedPrice({
        oldTrend: 10, newTrend: 12, oldSuggested: 15, coeff,
      }),
    ).toBe(15);
  });

  it('preserves oldSuggested when there is no oldTrend baseline to compare against', () => {
    // Cannot tell if it was auto or manual without the baseline → respect.
    expect(
      recalcSuggestedPrice({
        oldTrend: null, newTrend: 12, oldSuggested: 9, coeff,
      }),
    ).toBe(9);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/utils/recalc-suggested-price.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the helper**

```typescript
// lib/utils/recalc-suggested-price.ts
/**
 * Decide the new suggested_price for a card after the cron pulls a new trend.
 *
 * Heuristic to respect manual edits: if the previous suggested_price was equal
 * (within 1 cent) to oldTrend × coeff, we assume it was auto-derived and we
 * recompute. Otherwise the user has touched it, so we keep their value.
 *
 * When oldTrend is null we have no baseline to make that decision, so we play
 * it safe and keep oldSuggested (only seed a fresh value when oldSuggested is
 * also null).
 */

const round2 = (x: number): number => Math.round(x * 100) / 100;

interface Args {
  oldTrend: number | null;
  newTrend: number | null;
  oldSuggested: number | null;
  coeff: number;
}

export function recalcSuggestedPrice(args: Args): number | null {
  if (args.newTrend === null) return args.oldSuggested;
  if (args.oldSuggested === null) return round2(args.newTrend * args.coeff);
  if (args.oldTrend === null) return args.oldSuggested;
  const expectedAuto = round2(args.oldTrend * args.coeff);
  const wasManual = Math.abs(args.oldSuggested - expectedAuto) > 0.01;
  if (wasManual) return args.oldSuggested;
  return round2(args.newTrend * args.coeff);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/utils/recalc-suggested-price.test.ts`
Expected: PASS — 5/5 tests

- [ ] **Step 5: Commit**

```bash
git add lib/utils/recalc-suggested-price.ts lib/utils/recalc-suggested-price.test.ts
git commit -m "Phase 3a: pure helper recalcSuggestedPrice (5 tests)"
```

---

## Task 4: Endpoint scaffold + auth (`POST /api/prices/update`)

**Files:**
- Create: `app/api/prices/update/route.ts`
- Test: `app/api/prices/update/route.test.ts`

- [ ] **Step 1: Write the failing auth tests**

```typescript
// app/api/prices/update/route.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const serviceMock = {
  from: vi.fn(),
};
const supabaseMock = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => serviceMock,
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(supabaseMock),
}));

const ORIGINAL_SECRET = process.env.CRON_SECRET;

beforeEach(() => {
  process.env.CRON_SECRET = 'test-secret';
});

afterEach(() => {
  process.env.CRON_SECRET = ORIGINAL_SECRET;
  vi.clearAllMocks();
});

function bulkRequest(authHeader?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (authHeader) headers['authorization'] = authHeader;
  return new Request('http://localhost/api/prices/update', {
    method: 'POST',
    headers,
  });
}

describe('POST /api/prices/update — auth', () => {
  it('returns 401 in bulk mode when no Authorization header is provided', async () => {
    const res = await POST(bulkRequest());
    expect(res.status).toBe(401);
  });

  it('returns 401 in bulk mode with a wrong secret', async () => {
    const res = await POST(bulkRequest('Bearer wrong'));
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/prices/update/route.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal route to make auth tests pass**

```typescript
// app/api/prices/update/route.ts
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

interface UpdateSummary {
  ok: boolean;
  total: number;
  updated: number;
  backfilled: number;
  skipped: number;
  errors: Array<{ card_id: string; message: string }>;
}

function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function POST(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const cardId = url.searchParams.get('card_id');

  if (cardId) {
    return handleSingleCard(cardId);
  }

  // Bulk mode: require CRON_SECRET via Bearer.
  const auth = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!auth || !secret || auth !== `Bearer ${secret}`) {
    return unauthorized();
  }

  return handleBulk();
}

async function handleBulk(): Promise<NextResponse> {
  const summary: UpdateSummary = {
    ok: true, total: 0, updated: 0, backfilled: 0, skipped: 0, errors: [],
  };
  return NextResponse.json(summary);
}

async function handleSingleCard(cardId: string): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return unauthorized();
  // Implementation comes in Task 6.
  return NextResponse.json({ ok: false, error: 'not_implemented' }, { status: 501 });
}
```

Touch the unused imports to silence the linter for now — keep `createServiceClient` ready for Task 5:

```typescript
// At the top of the file, after the imports, add:
void createServiceClient;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/prices/update/route.test.ts`
Expected: PASS — 2/2 tests

- [ ] **Step 5: Commit**

```bash
git add app/api/prices/update/route.ts app/api/prices/update/route.test.ts
git commit -m "Phase 3a: endpoint scaffold /api/prices/update with auth gate (2 tests)"
```

---

## Task 5: Bulk mode — full pipeline

**Files:**
- Modify: `app/api/prices/update/route.ts`
- Modify: `app/api/prices/update/route.test.ts`

- [ ] **Step 1: Add bulk-mode tests**

Append to `app/api/prices/update/route.test.ts`:

```typescript
// --- helpers for the bulk pipeline tests ---
function row(over: Record<string, unknown> = {}) {
  return {
    id: 'card-1', card_id_tcg: 'sv2a-25',
    set_code: 'sv2a', set_number: '025', language: 'JP',
    variant: null, cm_price_trend: null, suggested_price: null,
    ...over,
  };
}

function authedBulk(): Request {
  return new Request('http://localhost/api/prices/update', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer test-secret',
    },
  });
}

function setupServiceRead(rows: ReturnType<typeof row>[]) {
  const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
  const order = vi.fn(() => ({ limit }));
  const eq = vi.fn(() => ({ order }));
  serviceMock.from.mockImplementation((table: string) => {
    if (table === 'cards') {
      return { select: vi.fn(() => ({ eq })), update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })) };
    }
    if (table === 'config') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: { value: '0.85' }, error: null,
            }),
          })),
        })),
      };
    }
    throw new Error(`unmocked table: ${table}`);
  });
}

describe('POST /api/prices/update — bulk mode', () => {
  it('returns 200 with empty summary when no cards are eligible', async () => {
    setupServiceRead([]);
    const res = await POST(authedBulk());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.total).toBe(0);
    expect(json.updated).toBe(0);
  });

  it('skips cards with variant != null (preserves manual variant prices)', async () => {
    setupServiceRead([row({ id: 'a', variant: 'pokeball' })]);
    const res = await POST(authedBulk());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.skipped).toBe(1);
    expect(json.updated).toBe(0);
  });

  it('updates a tcgdex-categorized card with new prices and timestamp', async () => {
    setupServiceRead([row({ id: 'a' })]);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pricing: {
          cardmarket: { idProduct: 12345, low: 1.5, trend: 2.5, avg: 2.0 },
        },
      }),
    }) as unknown as typeof fetch;
    const res = await POST(authedBulk());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.updated).toBe(1);
    expect(json.skipped).toBe(0);
  });

  it('does not write prices when TCGdex returns pricing.cardmarket = null', async () => {
    setupServiceRead([row({ id: 'a' })]);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pricing: { cardmarket: null } }),
    }) as unknown as typeof fetch;
    const res = await POST(authedBulk());
    const json = await res.json();
    expect(json.updated).toBe(0);
    expect(json.skipped).toBe(1);
  });

  it('continues processing when TCGdex returns 500 on one card and adds to errors', async () => {
    setupServiceRead([row({ id: 'a' }), row({ id: 'b' })]);
    let call = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      call += 1;
      if (call === 1) return { ok: false, status: 500, text: async () => 'boom' };
      return {
        ok: true,
        json: async () => ({
          pricing: { cardmarket: { idProduct: 1, low: 1, trend: 1, avg: 1 } },
        }),
      };
    }) as unknown as typeof fetch;
    const res = await POST(authedBulk());
    const json = await res.json();
    expect(json.errors).toHaveLength(1);
    expect(json.errors[0].card_id).toBe('a');
    expect(json.updated).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/prices/update/route.test.ts`
Expected: FAIL — bulk-mode tests fail because `handleBulk` returns an empty summary regardless

- [ ] **Step 3: Implement `handleBulk` end-to-end**

Replace the entire `app/api/prices/update/route.ts` file with:

```typescript
// app/api/prices/update/route.ts
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createClient } from '@/lib/supabase/server';
import { categorizePricingCard } from '@/lib/utils/categorize-pricing-card';
import { recalcSuggestedPrice } from '@/lib/utils/recalc-suggested-price';
import { lookupByCode } from '@/lib/api/tcg-catalog';
import { toTCGdexLang } from '@/lib/api/tcgdex';
import type { Card, CardLanguage } from '@/lib/types';

export const runtime = 'nodejs';

const BATCH_SIZE = 200;
const PARALLELISM = 10;
const TCGDEX_BASE = 'https://api.tcgdex.net/v2';
const TCGDEX_TIMEOUT_MS = 15_000;

interface UpdateSummary {
  ok: boolean;
  total: number;
  updated: number;
  backfilled: number;
  skipped: number;
  errors: Array<{ card_id: string; message: string }>;
}

interface TCGdexCardmarket {
  idProduct?: number;
  low?: number;
  trend?: number;
  avg?: number;
}

interface TCGdexCardResponse {
  pricing?: { cardmarket?: TCGdexCardmarket | null };
}

function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function POST(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const cardId = url.searchParams.get('card_id');
  if (cardId) return handleSingleCard(cardId);

  const auth = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!auth || !secret || auth !== `Bearer ${secret}`) return unauthorized();

  return handleBulk();
}

async function handleBulk(): Promise<NextResponse> {
  const service = createServiceClient();
  const summary: UpdateSummary = {
    ok: true, total: 0, updated: 0, backfilled: 0, skipped: 0, errors: [],
  };

  const { data: rows, error } = await service
    .from('cards')
    .select('*')
    .eq('status', 'for_sale')
    .order('cm_updated_at', { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE);

  if (error) {
    return NextResponse.json(
      { ok: false, error: `read failed: ${error.message}` },
      { status: 500 },
    );
  }

  const cards = (rows ?? []) as Card[];
  summary.total = cards.length;
  if (cards.length === 0) return NextResponse.json(summary);

  const coeff = await readPriceCoefficient(service);

  for (let i = 0; i < cards.length; i += PARALLELISM) {
    const slice = cards.slice(i, i + PARALLELISM);
    await Promise.all(slice.map((card) => processCard(card, service, coeff, summary)));
  }

  return NextResponse.json(summary);
}

async function readPriceCoefficient(service: ReturnType<typeof createServiceClient>): Promise<number> {
  const { data } = await service
    .from('config')
    .select('value')
    .eq('key', 'price_coefficient')
    .single();
  const raw = (data as { value?: string } | null)?.value;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0.85;
}

async function processCard(
  card: Card,
  service: ReturnType<typeof createServiceClient>,
  coeff: number,
  summary: UpdateSummary,
): Promise<void> {
  const cat = categorizePricingCard(card);
  if (cat === 'skip') {
    summary.skipped += 1;
    return;
  }

  let cardIdTcg = card.card_id_tcg;
  let backfilled = false;

  if (cat === 'backfill') {
    try {
      const row = await lookupByCode(service, card.set_code!, card.set_number!, card.language);
      if (!row) {
        summary.skipped += 1;
        return;
      }
      cardIdTcg = `${row.set_code}-${row.set_number}`;
      backfilled = true;
    } catch (err) {
      summary.errors.push({ card_id: card.id, message: `backfill: ${(err as Error).message}` });
      return;
    }
  }

  if (!cardIdTcg) {
    summary.skipped += 1;
    return;
  }

  const fetched = await fetchTCGdexPricing(cardIdTcg, card.language);
  if (fetched.error) {
    summary.errors.push({ card_id: card.id, message: fetched.error });
    return;
  }
  const cm = fetched.cm;
  if (!cm || (cm.low == null && cm.trend == null && cm.avg == null)) {
    // No pricing data yet → don't bump cm_updated_at, retry tomorrow.
    summary.skipped += 1;
    return;
  }

  const newSuggested = recalcSuggestedPrice({
    oldTrend: card.cm_price_trend,
    newTrend: cm.trend ?? null,
    oldSuggested: card.suggested_price,
    coeff,
  });

  const update: Record<string, unknown> = {
    cm_price_low: cm.low ?? null,
    cm_price_trend: cm.trend ?? null,
    cm_price_avg: cm.avg ?? null,
    cm_updated_at: new Date().toISOString(),
    suggested_price: newSuggested,
  };
  if (cm.idProduct != null) update.cardmarket_id = String(cm.idProduct);
  if (backfilled) update.card_id_tcg = cardIdTcg;

  const { error: updErr } = await service.from('cards').update(update).eq('id', card.id);
  if (updErr) {
    summary.errors.push({ card_id: card.id, message: `update: ${updErr.message}` });
    return;
  }

  summary.updated += 1;
  if (backfilled) summary.backfilled += 1;
}

async function fetchTCGdexPricing(
  cardIdTcg: string,
  language: CardLanguage,
): Promise<{ cm?: TCGdexCardmarket | null; error?: string }> {
  const lang = toTCGdexLang(language);
  const url = `${TCGDEX_BASE}/${lang}/cards/${encodeURIComponent(cardIdTcg)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TCGDEX_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return { error: `tcgdex ${res.status}` };
    const json = (await res.json()) as TCGdexCardResponse;
    return { cm: json.pricing?.cardmarket ?? null };
  } catch (err) {
    return { error: `tcgdex fetch: ${(err as Error).message}` };
  } finally {
    clearTimeout(timer);
  }
}

async function handleSingleCard(cardId: string): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return unauthorized();
  // Implementation comes in Task 6.
  void cardId;
  return NextResponse.json({ ok: false, error: 'not_implemented' }, { status: 501 });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/prices/update/route.test.ts`
Expected: PASS — 7/7 tests (2 auth + 5 bulk)

If any test fails, read the error and fix the implementation. Common pitfall: the `from('cards').select(...).eq('status', 'for_sale').order(...).limit(...)` chain expects exactly that order in the mock. If you renamed any link, update either the mock or the route to match.

- [ ] **Step 5: Commit**

```bash
git add app/api/prices/update/route.ts app/api/prices/update/route.test.ts
git commit -m "Phase 3a: bulk pipeline /api/prices/update (5 integration tests)"
```

---

## Task 6: Single-card mode (`?card_id=...`)

**Files:**
- Modify: `app/api/prices/update/route.ts`
- Modify: `app/api/prices/update/route.test.ts`

- [ ] **Step 1: Add the single-card test**

Append to `app/api/prices/update/route.test.ts`:

```typescript
describe('POST /api/prices/update — single-card mode', () => {
  it('returns 401 when not authenticated', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
    const req = new Request('http://localhost/api/prices/update?card_id=abc', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns updated card on success', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });

    // Reuse setupServiceRead but for a single-card read instead of a list.
    const targetCard = row({ id: 'abc' });

    serviceMock.from.mockImplementation((table: string) => {
      if (table === 'cards') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: targetCard, error: null }),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: { ...targetCard, cm_price_trend: 2.5 },
                  error: null,
                }),
              })),
            })),
          })),
        };
      }
      if (table === 'config') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: { value: '0.85' }, error: null }),
            })),
          })),
        };
      }
      throw new Error(`unmocked table: ${table}`);
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        pricing: { cardmarket: { idProduct: 1, low: 1, trend: 2.5, avg: 2 } },
      }),
    }) as unknown as typeof fetch;

    const req = new Request('http://localhost/api/prices/update?card_id=abc', { method: 'POST' });
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.card.id).toBe('abc');
    expect(json.card.cm_price_trend).toBe(2.5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/prices/update/route.test.ts`
Expected: FAIL — single-card returns `501`

- [ ] **Step 3: Implement `handleSingleCard`**

Replace the `handleSingleCard` function in `app/api/prices/update/route.ts` with:

```typescript
async function handleSingleCard(cardId: string): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const service = createServiceClient();

  const { data: target, error: readErr } = await service
    .from('cards')
    .select('*')
    .eq('id', cardId)
    .single();
  if (readErr || !target) {
    return NextResponse.json({ ok: false, error: 'card_not_found' }, { status: 404 });
  }

  const card = target as Card;
  const cat = categorizePricingCard(card);
  if (cat === 'skip') {
    return NextResponse.json(
      { ok: false, error: 'card_not_eligible', reason: 'variant or missing identifiers' },
      { status: 422 },
    );
  }

  const coeff = await readPriceCoefficient(service);

  let cardIdTcg = card.card_id_tcg;
  let backfilled = false;
  if (cat === 'backfill') {
    const row = await lookupByCode(service, card.set_code!, card.set_number!, card.language);
    if (!row) {
      return NextResponse.json(
        { ok: false, error: 'no_catalog_match' },
        { status: 422 },
      );
    }
    cardIdTcg = `${row.set_code}-${row.set_number}`;
    backfilled = true;
  }

  const fetched = await fetchTCGdexPricing(cardIdTcg!, card.language);
  if (fetched.error) {
    return NextResponse.json(
      { ok: false, error: 'tcgdex_failed', message: fetched.error },
      { status: 502 },
    );
  }
  const cm = fetched.cm;
  if (!cm || (cm.low == null && cm.trend == null && cm.avg == null)) {
    return NextResponse.json(
      { ok: false, error: 'no_pricing_yet' },
      { status: 422 },
    );
  }

  const newSuggested = recalcSuggestedPrice({
    oldTrend: card.cm_price_trend,
    newTrend: cm.trend ?? null,
    oldSuggested: card.suggested_price,
    coeff,
  });

  const update: Record<string, unknown> = {
    cm_price_low: cm.low ?? null,
    cm_price_trend: cm.trend ?? null,
    cm_price_avg: cm.avg ?? null,
    cm_updated_at: new Date().toISOString(),
    suggested_price: newSuggested,
  };
  if (cm.idProduct != null) update.cardmarket_id = String(cm.idProduct);
  if (backfilled) update.card_id_tcg = cardIdTcg;

  const { data: updated, error: updErr } = await service
    .from('cards')
    .update(update)
    .eq('id', cardId)
    .select('*')
    .single();
  if (updErr) {
    return NextResponse.json(
      { ok: false, error: 'update_failed', message: updErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, card: updated });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/prices/update/route.test.ts`
Expected: PASS — 9/9 tests (2 auth + 5 bulk + 2 single-card)

- [ ] **Step 5: Commit**

```bash
git add app/api/prices/update/route.ts app/api/prices/update/route.test.ts
git commit -m "Phase 3a: single-card mode /api/prices/update?card_id=X (2 tests)"
```

---

## Task 7: Vercel cron + env vars

**Files:**
- Create: `vercel.json`
- Modify: `.env.example`

- [ ] **Step 1: Create `vercel.json`**

```json
{
  "crons": [
    {
      "path": "/api/prices/update",
      "schedule": "0 2 * * *"
    }
  ]
}
```

- [ ] **Step 2: Add `CRON_SECRET` to `.env.example`**

Read the current `.env.example`:

```bash
cat .env.example
```

Then add this section at the bottom (using the Edit tool — replace the last existing line you find with itself + the new content). The exact phrasing depends on the file's current end; the goal is to insert between the existing app section and EOF:

```bash
# Cron secret — protects /api/prices/update bulk mode from being hit by anyone
# but the Vercel scheduler. Generate with: openssl rand -hex 32
CRON_SECRET=
```

- [ ] **Step 3: Verify locally**

Run: `cat vercel.json && cat .env.example | tail -5`
Expected: both files present, `CRON_SECRET=` line visible.

- [ ] **Step 4: Commit**

```bash
git add vercel.json .env.example
git commit -m "Phase 3a: vercel.json cron schedule + CRON_SECRET in .env.example"
```

---

## Task 8: CSS staleness tokens

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Add the 4 staleness color tokens**

Use Edit on `app/globals.css`. Find this block ([app/globals.css:25-34](../../../app/globals.css#L25-L34)):

```css
  /* Rarity badges */
  --color-rarity-sar: #e05252;
  --color-rarity-ar: #e8942a;
  --color-rarity-sr: #e8af34;
  --color-rarity-chr: #a86fdf;
  --color-rarity-rr: #5591c7;
  --color-rarity-r-holo: #4f98a3;
  --color-rarity-r: #6daa45;
  --color-rarity-uc: #8a8885;
  --color-rarity-c: #55524f;
```

Insert these 4 lines IMMEDIATELY AFTER `--color-rarity-c: #55524f;`, before the closing `}` of `@theme`:

```css

  /* Pricing freshness */
  --color-staleness-fresh: #6daa45;
  --color-staleness-stale: #8a8885;
  --color-staleness-old:   #e8942a;
  --color-staleness-never: #55524f;
```

- [ ] **Step 2: Verify the change**

Run: `grep "staleness" app/globals.css`
Expected: 4 lines printed.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "Phase 3a: staleness color tokens (fresh/stale/old/never)"
```

---

## Task 9: `<PriceFreshnessBadge>` component

**Files:**
- Create: `components/ui/PriceFreshnessBadge.tsx`

- [ ] **Step 1: Write the component**

```typescript
// components/ui/PriceFreshnessBadge.tsx
'use client';

import { useEffect, useState } from 'react';
import { formatStaleness, type StalenessTone } from '@/lib/utils/format-staleness';

interface Props {
  cm_updated_at: string | null;
}

const TONE_CLASS: Record<StalenessTone, string> = {
  fresh: 'text-staleness-fresh',
  stale: 'text-staleness-stale',
  old:   'text-staleness-old',
  never: 'text-staleness-never',
};

/**
 * Small inline badge that maps cm_updated_at to a 4-tone freshness label.
 * Renders nothing on the server (cm_updated_at is per-card data; the label
 * depends on Date.now() which differs per render, so we keep it client-only
 * to avoid hydration noise).
 */
export default function PriceFreshnessBadge({ cm_updated_at }: Props) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); }, []);
  if (now === null) return null;

  const { tone, label } = formatStaleness(cm_updated_at, now);
  return (
    <span
      className={`text-xs ${TONE_CLASS[tone]}`}
      title="Date du dernier rafraîchissement Cardmarket via TCGdex"
    >
      {label}
    </span>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/ui/PriceFreshnessBadge.tsx
git commit -m "Phase 3a: <PriceFreshnessBadge> component"
```

---

## Task 10: `<RefreshPriceButton>` component

**Files:**
- Create: `components/ui/RefreshPriceButton.tsx`

- [ ] **Step 1: Write the component**

```typescript
// components/ui/RefreshPriceButton.tsx
'use client';

import { useState } from 'react';
import { RefreshCw, Check, AlertCircle } from 'lucide-react';
import type { Card } from '@/lib/types';

interface Props {
  cardId: string;
  /** Called with the freshly updated row when the cron returns it. */
  onRefreshed: (card: Card) => void;
}

type State = 'idle' | 'loading' | 'success' | 'error';

/**
 * Manual refresh trigger for a single card's Cardmarket pricing. Calls
 * POST /api/prices/update?card_id=X (single-card mode, behind the normal
 * Supabase auth — no CRON_SECRET).
 */
export default function RefreshPriceButton({ cardId, onRefreshed }: Props) {
  const [state, setState] = useState<State>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function refresh() {
    setState('loading');
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/prices/update?card_id=${encodeURIComponent(cardId)}`, {
        method: 'POST',
      });
      const json = (await res.json()) as { ok: boolean; card?: Card; error?: string };
      if (!res.ok || !json.ok || !json.card) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      onRefreshed(json.card);
      setState('success');
      setTimeout(() => setState('idle'), 1000);
    } catch (err) {
      setErrorMsg((err as Error).message);
      setState('error');
      setTimeout(() => setState('idle'), 2500);
    }
  }

  const icon =
    state === 'loading' ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> :
    state === 'success' ? <Check className="text-staleness-fresh h-3.5 w-3.5" /> :
    state === 'error'   ? <AlertCircle className="text-red h-3.5 w-3.5" /> :
                          <RefreshCw className="h-3.5 w-3.5" />;

  return (
    <button
      type="button"
      onClick={refresh}
      disabled={state === 'loading'}
      title={state === 'error' && errorMsg ? errorMsg : 'Rafraîchir le prix Cardmarket'}
      aria-label="Rafraîchir le prix"
      className="text-text-muted hover:text-text inline-flex items-center justify-center rounded p-1 transition-colors disabled:cursor-default"
    >
      {icon}
    </button>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/ui/RefreshPriceButton.tsx
git commit -m "Phase 3a: <RefreshPriceButton> component"
```

---

## Task 11: Wire badge + button into `VintedRow`

**Files:**
- Modify: `components/vinted/VintedRow.tsx`

- [ ] **Step 1: Add the imports**

Use Edit to add these imports at the top of [components/vinted/VintedRow.tsx](../../../components/vinted/VintedRow.tsx) (just below the existing `import VintedListedToggle...` line):

```typescript
import PriceFreshnessBadge from '@/components/ui/PriceFreshnessBadge';
import RefreshPriceButton from '@/components/ui/RefreshPriceButton';
```

- [ ] **Step 2: Extend the Props interface**

Find the `Props` interface ([VintedRow.tsx:35-49](../../../components/vinted/VintedRow.tsx#L35-L49)) and add this prop after `onMoveToPokedexClick`:

```typescript
  /** Called when the manual refresh of this card's price succeeds. */
  onPriceRefreshed?: (card: Card) => void;
```

Update the destructuring on the function signature ([VintedRow.tsx:51-53](../../../components/vinted/VintedRow.tsx#L51-L53)) to include `onPriceRefreshed`.

- [ ] **Step 3: Render the badge + button**

Find the price column block ([VintedRow.tsx:124-131](../../../components/vinted/VintedRow.tsx#L124-L131)):

```tsx
      <div className="flex flex-wrap items-center justify-end gap-2 sm:ml-auto">
        {group.count > 1 && (
          <span className="bg-surface-off text-text-muted shrink-0 rounded px-2 py-1 font-mono text-xs">
            ×{group.count}
          </span>
        )}

        <div className="shrink-0">{priceCell}</div>
```

Replace the `<div className="shrink-0">{priceCell}</div>` line with:

```tsx
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="flex items-center gap-1.5">
            {priceCell}
            {onPriceRefreshed && (
              <RefreshPriceButton cardId={card.id} onRefreshed={onPriceRefreshed} />
            )}
          </div>
          <PriceFreshnessBadge cm_updated_at={card.cm_updated_at} />
        </div>
```

- [ ] **Step 4: Wire the prop in the parent (`VintedList`)**

Open [components/vinted/VintedList.tsx](../../../components/vinted/VintedList.tsx). Find the `<VintedRow ...>` JSX (search for `VintedRow group={`). Add the new prop right above the closing `/>`:

```tsx
            onPriceRefreshed={(updated) => {
              setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
            }}
```

If `setCards` is not the actual local-state setter name in `VintedList`, look at how `onSoldClick` already mutates the list — match that pattern.

- [ ] **Step 5: Verify type-check + run all tests**

Run: `npx tsc --noEmit && npm test`
Expected: 0 ts errors, all existing tests still pass plus the 14 new ones from this phase (213 total if you started from 199).

- [ ] **Step 6: Commit**

```bash
git add components/vinted/VintedRow.tsx components/vinted/VintedList.tsx
git commit -m "Phase 3a: wire freshness badge + refresh button into VintedRow"
```

---

## Task 12: Wire badge + button into `StockRow`

**Files:**
- Modify: `components/stock/StockRow.tsx`
- Modify: `components/stock/StockList.tsx`

- [ ] **Step 1: Read `StockRow.tsx` end-to-end first**

Run: `cat components/stock/StockRow.tsx`

Identify (a) where the `Props` interface is, (b) where the price column or "Mettre en vente" button is rendered, (c) the props the parent passes today.

- [ ] **Step 2: Add the same wiring as Task 11**

Same imports at the top:

```typescript
import PriceFreshnessBadge from '@/components/ui/PriceFreshnessBadge';
import RefreshPriceButton from '@/components/ui/RefreshPriceButton';
```

Add a prop to `Props`:

```typescript
  onPriceRefreshed?: (card: Card) => void;
```

Render block (place it next to the existing price display — Stock currently has no inline price editor, so the badge alone communicates freshness; the refresh button still works to fetch a new price even if the user reads it elsewhere):

```tsx
{card.suggested_price !== null && (
  <div className="flex items-center gap-1.5">
    <span className="text-rarity-sr font-mono text-sm">
      {card.suggested_price.toFixed(2)} €
    </span>
    {onPriceRefreshed && (
      <RefreshPriceButton cardId={card.id} onRefreshed={onPriceRefreshed} />
    )}
  </div>
)}
<PriceFreshnessBadge cm_updated_at={card.cm_updated_at} />
```

If `StockRow` already shows a price somewhere, integrate next to it instead of duplicating — keep the refactor surgical.

- [ ] **Step 3: Wire the prop in `StockList.tsx`**

Same pattern as Task 11. Locate the `<StockRow ...>` element and add `onPriceRefreshed` that calls the local `setCards`-equivalent state mutator.

- [ ] **Step 4: Verify type-check + tests**

Run: `npx tsc --noEmit && npm test`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add components/stock/StockRow.tsx components/stock/StockList.tsx
git commit -m "Phase 3a: wire freshness badge + refresh button into StockRow"
```

---

## Task 13: Wire badge + button into `PokedexDrawer`

**Files:**
- Modify: `components/pokedex/PokedexDrawer.tsx`

- [ ] **Step 1: Add the imports**

At the top of [components/pokedex/PokedexDrawer.tsx](../../../components/pokedex/PokedexDrawer.tsx):

```typescript
import PriceFreshnessBadge from '@/components/ui/PriceFreshnessBadge';
import RefreshPriceButton from '@/components/ui/RefreshPriceButton';
```

- [ ] **Step 2: Replace the placeholder block**

Find the "Pas encore de prix Cardmarket" placeholder ([PokedexDrawer.tsx:138-148](../../../components/pokedex/PokedexDrawer.tsx#L138-L148)):

```tsx
      {(card.cm_price_low ?? card.cm_price_trend ?? card.cm_price_avg ?? card.suggested_price) !==
      null ? (
        <div className="bg-surface-2 grid grid-cols-2 gap-3 rounded-lg p-4 text-sm md:grid-cols-4">
          <Price label="Low" value={card.cm_price_low} />
          <Price label="Trend" value={card.cm_price_trend} />
          <Price label="Avg" value={card.cm_price_avg} />
          <Price label="Suggéré" value={card.suggested_price} highlight />
        </div>
      ) : (
        <p className="text-text-faint text-xs">Pas encore de prix Cardmarket — viendra avec le cron Phase 3.</p>
      )}
```

Replace with:

```tsx
      {(card.cm_price_low ?? card.cm_price_trend ?? card.cm_price_avg ?? card.suggested_price) !==
      null ? (
        <div className="bg-surface-2 flex flex-col gap-2 rounded-lg p-4 text-sm">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Price label="Low" value={card.cm_price_low} />
            <Price label="Trend" value={card.cm_price_trend} />
            <Price label="Avg" value={card.cm_price_avg} />
            <Price label="Suggéré" value={card.suggested_price} highlight />
          </div>
          <div className="flex items-center justify-between">
            <PriceFreshnessBadge cm_updated_at={card.cm_updated_at} />
            <RefreshPriceButton
              cardId={card.id}
              onRefreshed={() => {
                // Pokédex drawer reads from props; closing+reopening (or a
                // router.refresh) lets the parent re-fetch with fresh data.
                router.refresh();
              }}
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <p className="text-text-faint text-xs">Pas encore de prix Cardmarket.</p>
          <RefreshPriceButton
            cardId={card.id}
            onRefreshed={() => router.refresh()}
          />
        </div>
      )}
```

- [ ] **Step 3: Verify type-check + tests**

Run: `npx tsc --noEmit && npm test`
Expected: clean, 213/213 (or whatever the new total is).

- [ ] **Step 4: Commit**

```bash
git add components/pokedex/PokedexDrawer.tsx
git commit -m "Phase 3a: wire freshness badge + refresh button into PokedexDrawer"
```

---

## Task 14: Lint pass + final verification

**Files:** none

- [ ] **Step 1: Run linter**

Run: `npm run lint`
Expected: 0 warnings.

If anything trips, fix it inline. Common pitfalls:
- Unused import (e.g. forgot to use `PriceFreshnessBadge` in one of the modified files)
- `any` type leaking from one of the new tests — replace with proper types
- React hook rules (no early-return-before-hooks)

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: 0 type errors, 0 build errors.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: 213/213 (or 199 + the 14 new tests).

If a previously-passing test broke, investigate — almost certainly a side-effect of the wiring changes in Tasks 11–13.

- [ ] **Step 4: Commit (only if anything was fixed in the previous steps)**

```bash
git add -p   # be selective
git commit -m "Phase 3a: lint + build cleanups"
```

If nothing needed fixing, skip this commit.

---

## Task 15: Manual smoke test in dev

**Files:** none — exploratory work only.

- [ ] **Step 1: Generate a CRON_SECRET locally**

```bash
openssl rand -hex 32
```

Add the generated token to `.env.local` as `CRON_SECRET=<token>`.

- [ ] **Step 2: Start the dev server**

Run: `npm run dev`
Expected: server up at http://localhost:3000

- [ ] **Step 3: Hit the bulk endpoint with curl**

```bash
TOKEN=$(grep CRON_SECRET .env.local | cut -d= -f2)
curl -X POST -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/prices/update | jq
```

Expected: JSON `{ ok: true, total: N, updated: K, backfilled: M, skipped: S, errors: [...] }` with N matching the count of `for_sale` cards in your seeded DB.

If it returns 401 → check the token matches `.env.local` exactly.
If it returns 500 → read the Next.js dev console — most likely cause is a missing `SUPABASE_SERVICE_ROLE_KEY` or unreachable TCGdex (WSL2 firewall — try the same curl from the prod URL once deployed).

- [ ] **Step 4: Open `/vinted` in the browser**

Verify each `VintedRow`:
- Badge `Frais` (green) appears on rows updated by the curl above
- Badge `Maj il y a Nj` (gray/amber) on rows older than 1 day
- Badge `Jamais maj` (dark gray) on rows that were skipped (variants, KO/ZH, etc.)
- Refresh button (RefreshCw icon) is visible next to the price
- Click refresh → spinner → green check (1s) → row's badge flips to `Frais`

- [ ] **Step 5: Open `/stock` and `/pokedex` (drawer on a possessed card)**

Same checks. The `PokedexDrawer` shows the badge inside the price block; clicking refresh triggers `router.refresh()`.

- [ ] **Step 6: Test the negative paths**

- Click refresh on a card with `variant != null` → button should briefly show error, tooltip says `card_not_eligible` or similar.
- Manually edit `cards.set_code = NULL` for one row, then refresh → error tooltip.

- [ ] **Step 7: No commit needed for this task.**

---

## Task 16: Deploy + verify in Vercel

**Files:** none — operational work.

- [ ] **Step 1: Push the branch**

```bash
git push origin main
```

(Or whatever branch the user prefers. If a feature branch is requested, switch to it before committing in Tasks 1–14.)

- [ ] **Step 2: Add `CRON_SECRET` in Vercel Dashboard**

Vercel Dashboard → Project → Settings → Environment Variables → Add new:
- Name: `CRON_SECRET`
- Value: same token as `.env.local`
- Environments: Production + Preview

Re-deploy after adding the env var (a fresh build is needed for it to be picked up).

- [ ] **Step 3: Verify the cron is registered**

Vercel Dashboard → Project → Crons → confirm `/api/prices/update` appears with schedule `0 2 * * *`.

- [ ] **Step 4: Trigger a manual run**

Vercel Dashboard → Crons → click the row → "Run now". Then check the function logs:
- Must return 200
- JSON should show `total > 0`, `updated > 0`

If the function times out → check the count of `for_sale` cards. If > 200, the `LIMIT 200` cap is doing its job — wait for the next nightly run to chip away the rest.

- [ ] **Step 5: Wait for the next 02h00 UTC + verify**

The next morning, check Vercel Logs for the scheduled invocation. All `for_sale` cards should now have `cm_updated_at` within 24h.

---

## Summary

**Total tests added:** 14 (5 + 4 + 5 + 7 endpoint, with the bulk + single split into 5 + 2)
**Files created:** 8 (3 helpers, 3 tests, 1 endpoint, 1 endpoint test, 2 components, 1 vercel.json)
**Files modified:** 5 (`.env.example`, `app/globals.css`, `VintedRow`, `VintedList`, `StockRow`, `StockList`, `PokedexDrawer`)
**Migrations:** 0 (all DB columns already exist from Phase 1)
**Estimated time:** 5 working days following TDD strictly with frequent commits.

---

## Self-review checklist (already applied)

1. **Spec coverage** — every section in the spec maps to a task:
   - §3.1 endpoint + auth → Task 4
   - §3.2 vercel.json → Task 7
   - §3.3 bulk → Task 5
   - §3.4 single-card → Task 6
   - §4.1 categorize → Task 1
   - §4.2 recalc → Task 3
   - §4.3 staleness → Task 2 + Task 8 (CSS) + Task 9 (badge)
   - §4.4 fetch TCGdex → covered inside Task 5
   - §5 DB → no task needed (all columns exist)
   - §6 UI components → Tasks 9, 10, 11, 12, 13
   - §7 tests → embedded in Tasks 1–6
   - §8 errors → covered in Task 5/6 implementations
   - §9 env vars → Task 7
   - §11 critères → Tasks 14, 15, 16

2. **Placeholder scan** — no "TBD/TODO" left in any task. Each step shows actual code.

3. **Type consistency** — `categorizePricingCard` returns `'tcgdex' | 'backfill' | 'skip'` everywhere. `recalcSuggestedPrice` signature stable across Task 5 and Task 6 callers. `formatStaleness` returns the same `StalenessLabel` shape consumed by `<PriceFreshnessBadge>`.
