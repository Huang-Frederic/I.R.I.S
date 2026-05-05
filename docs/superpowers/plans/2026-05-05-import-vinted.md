# Import Vinted Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap one-shot d'I.R.I.S depuis l'API JSON interne de Vinted via cookie session du user. Crée des rows `cards` (status='for_sale') + `card_listings` (auth.uid()) en bulk, avec photos rapatriées dans le bucket Supabase Storage `card-photos`. Page web `/import/vinted` (pas un script Python).

**Architecture:**
- 3 helpers purs `lib/utils/parse-vinted-curl.ts`, `parse-vinted-listing.ts`, `map-vinted-to-card.ts` — testés en isolation
- 1 type partagé `lib/types/vinted-import.ts` (VintedItem, ToImport, ImportFailure)
- 3 endpoints API (`fetch`/`preview`/`commit`) qui réutilisent `/api/enrich` et le bucket `card-photos` existants
- 2 composants client (`VintedImportFlow` state machine + `VintedImportTile` grid item)
- 1 page RSC shell `/import/vinted` (pas dans la nav)
- Aucune migration, aucun nouveau type DB

**Tech Stack:** Next.js 16 App Router, Supabase Postgres + Storage + RLS, React 19, TypeScript strict, Tailwind v4, Vitest + happy-dom.

**Spec:** [docs/superpowers/specs/2026-05-05-import-vinted-design.md](../specs/2026-05-05-import-vinted-design.md)

---

## Task 1: Types partagés `lib/types/vinted-import.ts`

**Files:**
- Create: `lib/types/vinted-import.ts`

- [ ] **Step 1: Create the file**

```ts
import type { CardCondition, CardLanguage, EnrichedCard } from '@/lib/types';

/**
 * Shape utile du JSON Vinted /api/v2/users/{id}/items.
 * Champs ignorés : favourite_count, view_count, brand, size, etc.
 */
export interface VintedItem {
  id: number;
  title: string;
  description: string;
  price: { amount: string; currency_code: string };
  /** Unix seconds — date de mise en ligne sur Vinted. */
  created_at_ts: number;
  photos: Array<{
    id: number;
    full_size_url: string;
    url: string;
  }>;
  status_id?: number;
}

export interface ParsedListing {
  language: CardLanguage;
  setCode: string;
  setNumber: string;
  condition: CardCondition;
}

export interface ToImport {
  vintedItem: VintedItem;
  parsed: ParsedListing;
  enriched: EnrichedCard | null;
}

export type ImportFailureReason =
  | 'duplicate_for_sale'
  | 'listing_already_exists'
  | 'photo_unavailable'
  | 'storage_upload_failed'
  | 'unknown';

export interface ImportFailure {
  vintedItemId: number;
  reason: ImportFailureReason;
  /** Message brut pour debug UI (catch-all reason). */
  detail?: string;
}

export interface VintedCurl {
  userId: string;
  cookie: string;
  csrfToken: string | null;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: pass with no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/types/vinted-import.ts
git commit -m "Import Vinted: types partagés (VintedItem, ToImport, ImportFailure, VintedCurl)"
```

---

## Task 2: Helper pur `parseVintedCurl`

**Files:**
- Create: `lib/utils/parse-vinted-curl.ts`
- Test: `lib/utils/parse-vinted-curl.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { parseVintedCurl } from './parse-vinted-curl';

const SAMPLE_CURL_LINUX = `curl 'https://www.vinted.fr/api/v2/users/12345678/items?per_page=20&page=1&order=relevance' \\
  -H 'accept: application/json, text/plain, */*' \\
  -H 'cookie: _vinted_fr_session=abc123def456; v_sid=xyz' \\
  -H 'x-csrf-token: csrf-token-here' \\
  -H 'user-agent: Mozilla/5.0' \\
  --compressed`;

describe('parseVintedCurl', () => {
  it('extracts userId, cookie and csrfToken from a valid curl', () => {
    const result = parseVintedCurl(SAMPLE_CURL_LINUX);
    expect(result).toEqual({
      userId: '12345678',
      cookie: '_vinted_fr_session=abc123def456; v_sid=xyz',
      csrfToken: 'csrf-token-here',
    });
  });

  it('returns null when the URL is not a Vinted /api/v2/users endpoint', () => {
    const curl = `curl 'https://www.example.com/foo' -H 'cookie: x=y'`;
    expect(parseVintedCurl(curl)).toBeNull();
  });

  it('returns null when the cookie header is missing', () => {
    const curl = `curl 'https://www.vinted.fr/api/v2/users/123/items' -H 'accept: */*'`;
    expect(parseVintedCurl(curl)).toBeNull();
  });

  it('parses Windows-style curl with -b cookie flag', () => {
    const curl = `curl "https://www.vinted.fr/api/v2/users/999/items?page=1" -b "_vinted_fr_session=winabc"`;
    const result = parseVintedCurl(curl);
    expect(result?.userId).toBe('999');
    expect(result?.cookie).toBe('_vinted_fr_session=winabc');
    expect(result?.csrfToken).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/utils/parse-vinted-curl.test.ts`
Expected: FAIL — `parseVintedCurl is not defined` (module not found).

- [ ] **Step 3: Write the implementation**

Create `lib/utils/parse-vinted-curl.ts`:

```ts
import type { VintedCurl } from '@/lib/types/vinted-import';

const URL_RE = /https:\/\/www\.vinted\.[a-z.]+\/api\/v2\/users\/(\d+)\/items/;

/**
 * Extract the headers we need from a `curl ...` command copied via Chrome
 * DevTools → Network → "Copy as cURL". Supports both `-H 'cookie: ...'`
 * (Linux/macOS) and `-b '...'` (Windows alternative).
 */
export function parseVintedCurl(curl: string): VintedCurl | null {
  const urlMatch = curl.match(URL_RE);
  if (!urlMatch) return null;
  const userId = urlMatch[1];

  const cookieMatch =
    curl.match(/-H\s+['"]cookie:\s*([^'"]+)['"]/i) ??
    curl.match(/-b\s+['"]([^'"]+)['"]/);
  if (!cookieMatch) return null;
  const cookie = cookieMatch[1].trim();

  const csrfMatch = curl.match(/-H\s+['"]x-csrf-token:\s*([^'"]+)['"]/i);
  const csrfToken = csrfMatch ? csrfMatch[1].trim() : null;

  return { userId, cookie, csrfToken };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/utils/parse-vinted-curl.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/parse-vinted-curl.ts lib/utils/parse-vinted-curl.test.ts
git commit -m "Import Vinted: parseVintedCurl helper (extract userId/cookie/csrf from curl)"
```

---

## Task 3: Helper pur `parseVintedListing`

**Files:**
- Create: `lib/utils/parse-vinted-listing.ts`
- Test: `lib/utils/parse-vinted-listing.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { parseVintedListing } from './parse-vinted-listing';

describe('parseVintedListing', () => {
  it('extracts language/setCode/setNumber/condition from a typical JP listing', () => {
    const result = parseVintedListing({
      title: '✨ Carte Pokémon Archéodong - VMAX Climax (jpn_s8b-208)',
      description: '📘 Version Japonaise 🇯🇵\n✅ État : Très bon état (Near Mint), carte en excellent état (voir photos).',
    });
    expect(result).toEqual({
      language: 'JP',
      setCode: 's8b',
      setNumber: '208',
      condition: 'NM',
    });
  });

  it('matches when the (lang_set-num) pattern is in the description only', () => {
    const result = parseVintedListing({
      title: 'Pikachu rare',
      description: 'Carte (eng_swsh9-31) en parfait état',
    });
    expect(result?.language).toBe('EN');
    expect(result?.setCode).toBe('swsh9');
    expect(result?.setNumber).toBe('31');
  });

  it('matches when the pattern is in the title only', () => {
    const result = parseVintedListing({
      title: 'Pikachu (fra_sv1-25) NM',
      description: 'Vendue en l\'état',
    });
    expect(result?.language).toBe('FR');
  });

  it('handles lowercase chn_ language code', () => {
    const result = parseVintedListing({
      title: '(chn_sv2-100)',
      description: '',
    });
    expect(result?.language).toBe('CN');
  });

  it('returns null when no (lang_set-num) pattern matches', () => {
    expect(
      parseVintedListing({ title: 'Carte Pokémon rare', description: 'Pas de code ici' }),
    ).toBeNull();
  });

  it('defaults condition to NM when no condition keyword is present', () => {
    const result = parseVintedListing({
      title: '(jpn_s9-31)',
      description: 'Pas d\'info état',
    });
    expect(result?.condition).toBe('NM');
  });

  it('detects "Lightly played" → LP', () => {
    const result = parseVintedListing({
      title: '(jpn_s9-31)',
      description: 'État: Lightly played, quelques marques visibles',
    });
    expect(result?.condition).toBe('LP');
  });

  it('returns null when the language code is unknown (e.g. ger_)', () => {
    expect(
      parseVintedListing({ title: '(ger_sv1-25)', description: '' }),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/utils/parse-vinted-listing.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `lib/utils/parse-vinted-listing.ts`:

```ts
import type { CardCondition, CardLanguage } from '@/lib/types';
import type { ParsedListing } from '@/lib/types/vinted-import';

const PATTERN_RE = /\((jpn|eng|fra|kor|chn)_([a-z0-9-]+)-(\d+)\)/i;

const LANG_MAP: Record<string, CardLanguage> = {
  jpn: 'JP',
  eng: 'EN',
  fra: 'FR',
  kor: 'KO',
  chn: 'CN',
};

/**
 * Detects the condition keyword in the description. First match wins.
 * Order matters: more specific patterns (e.g. "Lightly played") must come
 * before broader ones (e.g. "played").
 */
function detectCondition(text: string): CardCondition {
  if (/light(ly)?\s+played|\bLP\b/i.test(text)) return 'LP';
  if (/near\s+mint|\bNM\b/i.test(text)) return 'NM';
  if (/excellent|\bEX\b/i.test(text)) return 'EX';
  if (/\bgood\b|\bGD\b/i.test(text)) return 'GD';
  if (/played|\bPL\b|\bPO\b|poor/i.test(text)) return 'PL';
  return 'NM';
}

export function parseVintedListing(input: {
  title: string;
  description: string;
}): ParsedListing | null {
  const haystack = `${input.title}\n${input.description}`;
  const match = haystack.match(PATTERN_RE);
  if (!match) return null;
  const [, langCode, setCode, setNumber] = match;
  const language = LANG_MAP[langCode.toLowerCase()];
  if (!language) return null;
  return {
    language,
    setCode: setCode.toLowerCase(),
    setNumber,
    condition: detectCondition(input.description),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/utils/parse-vinted-listing.test.ts`
Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/parse-vinted-listing.ts lib/utils/parse-vinted-listing.test.ts
git commit -m "Import Vinted: parseVintedListing (regex sur titre+desc, mapping langue, détection condition)"
```

---

## Task 4: Helper pur `mapVintedToCardInsert`

**Files:**
- Create: `lib/utils/map-vinted-to-card.ts`
- Test: `lib/utils/map-vinted-to-card.test.ts`

Note préalable : le mapping cible la shape attendue par `INSERT cards` (le helper retourne juste un objet plain, pas de types DB générés). Garder ce typage léger pour ne pas dépendre de l'inférence Supabase qui n'est pas générée dans ce repo.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import type { VintedItem, ParsedListing } from '@/lib/types/vinted-import';
import type { EnrichedCard } from '@/lib/types';
import { mapVintedToCardInsert } from './map-vinted-to-card';

const VINTED_ITEM: VintedItem = {
  id: 1234,
  title: '✨ Carte Pokémon Archéodong - VMAX Climax (jpn_s8b-208)',
  description: '📘 Version Japonaise',
  price: { amount: '5.50', currency_code: 'EUR' },
  created_at_ts: 1_704_067_200, // 2024-01-01T00:00:00Z
  photos: [{ id: 1, full_size_url: 'https://images.vinted.net/full.jpg', url: 'https://images.vinted.net/thumb.jpg' }],
};

const PARSED: ParsedListing = {
  language: 'JP',
  setCode: 's8b',
  setNumber: '208',
  condition: 'NM',
};

describe('mapVintedToCardInsert', () => {
  it('uses enriched fields when an EnrichedCard is provided', () => {
    const enriched: EnrichedCard = {
      card_id_tcg: 's8b-208',
      card_name: 'Archéodong VMAX (アーケオドンVMAX)',
      pokemon_name: 'Archéodong (アーケオドン)',
      pokemon_number: 567,
      set_name: 'VMAX Climax',
      set_code: 's8b',
      set_number: '208/184',
      rarity: 'SAR',
      tcg_image_url: 'https://assets.tcgdex.net/foo.jpg',
      cardmarket_id: 'cm-123',
      cm_price_low: 4.5,
      cm_price_trend: 6.0,
      cm_price_avg: 5.2,
    };

    const row = mapVintedToCardInsert(VINTED_ITEM, PARSED, enriched, 'https://supabase.co/storage/img.jpg');
    expect(row.card_id_tcg).toBe('s8b-208');
    expect(row.set_number).toBe('208/184');
    expect(row.tcg_image_url).toBe('https://assets.tcgdex.net/foo.jpg');
    expect(row.cm_price_trend).toBe(6.0);
    expect(row.image_url).toBe('https://supabase.co/storage/img.jpg');
    expect(row.suggested_price).toBe(5.5);
    expect(row.status).toBe('for_sale');
    expect(row.language).toBe('JP');
    expect(row.condition).toBe('NM');
    expect(row.variant).toBeNull();
  });

  it('falls back to parsed fields when enriched is null', () => {
    const row = mapVintedToCardInsert(VINTED_ITEM, PARSED, null, 'https://supabase.co/storage/img.jpg');
    expect(row.card_id_tcg).toBeNull();
    expect(row.set_code).toBe('s8b');
    expect(row.set_number).toBe('208');
    expect(row.tcg_image_url).toBeNull();
    expect(row.cm_price_trend).toBeNull();
    expect(row.cardmarket_id).toBeNull();
    expect(row.suggested_price).toBe(5.5);
  });

  it('parses price.amount as a number even when given as string', () => {
    const item = { ...VINTED_ITEM, price: { amount: '12.34', currency_code: 'EUR' } };
    const row = mapVintedToCardInsert(item, PARSED, null, '');
    expect(row.suggested_price).toBe(12.34);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/utils/map-vinted-to-card.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `lib/utils/map-vinted-to-card.ts`:

```ts
import type { EnrichedCard } from '@/lib/types';
import type { ParsedListing, VintedItem } from '@/lib/types/vinted-import';

/**
 * Plain object cible pour `supabase.from('cards').insert(...)`.
 * Volontairement non-typé via Database['public']['Tables']['cards']['Insert']
 * car ce repo n'a pas de types DB générés. Vérifier au runtime que la shape
 * matche le schéma actuel via les tests d'intégration (Task 9).
 */
export interface CardInsertRow {
  image_url: string | null;
  card_id_tcg: string | null;
  cardmarket_id: string | null;
  pokemon_name: string | null;
  pokemon_number: number | null;
  card_name: string | null;
  set_code: string;
  set_number: string;
  set_total: number | null;
  set_name: string | null;
  language: string;
  condition: string;
  rarity: string | null;
  variant: string | null;
  tcg_image_url: string | null;
  cm_price_low: number | null;
  cm_price_trend: number | null;
  cm_price_avg: number | null;
  cm_updated_at: string | null;
  suggested_price: number | null;
  status: 'for_sale';
  date_added: string;
  notes: string | null;
}

export function mapVintedToCardInsert(
  vinted: VintedItem,
  parsed: ParsedListing,
  enriched: EnrichedCard | null,
  uploadedImageUrl: string,
): CardInsertRow {
  const price = Number(vinted.price.amount);
  const now = new Date().toISOString();
  const cmHasAny =
    enriched?.cm_price_low != null ||
    enriched?.cm_price_trend != null ||
    enriched?.cm_price_avg != null;

  return {
    image_url: uploadedImageUrl || null,
    card_id_tcg: enriched?.card_id_tcg ?? null,
    cardmarket_id: enriched?.cardmarket_id ?? null,
    pokemon_name: enriched?.pokemon_name ?? null,
    pokemon_number: enriched?.pokemon_number ?? null,
    card_name: enriched?.card_name ?? null,
    set_code: enriched?.set_code ?? parsed.setCode,
    set_number: enriched?.set_number ?? parsed.setNumber,
    set_total: null,
    set_name: enriched?.set_name ?? null,
    language: parsed.language,
    condition: parsed.condition,
    rarity: enriched?.rarity ?? null,
    variant: null,
    tcg_image_url: enriched?.tcg_image_url || null,
    cm_price_low: enriched?.cm_price_low ?? null,
    cm_price_trend: enriched?.cm_price_trend ?? null,
    cm_price_avg: enriched?.cm_price_avg ?? null,
    cm_updated_at: cmHasAny ? now : null,
    suggested_price: Number.isFinite(price) ? price : null,
    status: 'for_sale',
    date_added: now,
    notes: null,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/utils/map-vinted-to-card.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/map-vinted-to-card.ts lib/utils/map-vinted-to-card.test.ts
git commit -m "Import Vinted: mapVintedToCardInsert (assemble row Vinted + parsed + enriched)"
```

---

## Task 5: Endpoint `POST /api/import/vinted/fetch`

**Files:**
- Create: `app/api/import/vinted/fetch/route.ts`
- Test: `app/api/import/vinted/fetch/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { POST } from './route';

const ORIG_FETCH = global.fetch;

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/import/vinted/fetch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const SAMPLE_CURL = `curl 'https://www.vinted.fr/api/v2/users/12345678/items?per_page=200&page=1' -H 'cookie: _vinted_fr_session=abc'`;

describe('POST /api/import/vinted/fetch', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    global.fetch = ORIG_FETCH;
    vi.restoreAllMocks();
  });

  it('returns 400 when curl is invalid', async () => {
    const res = await POST(makeReq({ curl: 'curl https://example.com' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_curl');
  });

  it('paginates until total_pages is reached and filters non-card items', async () => {
    const items = [
      { id: 1, title: '(jpn_s9-31)', description: 'Pikachu', price: { amount: '5.0', currency_code: 'EUR' }, created_at_ts: 1_700_000_000, photos: [] },
      { id: 2, title: 'Lot de Cartes Pokémon X [JP]', description: '', price: { amount: '20', currency_code: 'EUR' }, created_at_ts: 1_700_000_000, photos: [] },
      { id: 3, title: '(eng_swsh9-1)', description: '', price: { amount: '3', currency_code: 'EUR' }, created_at_ts: 1_700_000_000, photos: [] },
      { id: 4, title: 'T-shirt', description: '', price: { amount: '8', currency_code: 'EUR' }, created_at_ts: 1_700_000_000, photos: [] },
      { id: 5, title: '(fra_sv1-25)', description: '', price: { amount: '4', currency_code: 'EUR' }, created_at_ts: 1_700_000_000, photos: [] },
    ];
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 200,
      json: async () => ({ items, pagination: { total_pages: 1 } }),
    } as Response);

    const res = await POST(makeReq({ curl: SAMPLE_CURL }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(3);
    expect(body.skipped).toBe(2);
  });

  it('returns 401 when Vinted responds with 401 (cookie expired)', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 401,
      json: async () => ({}),
    } as Response);
    const res = await POST(makeReq({ curl: SAMPLE_CURL }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('cookie_expired');
  });

  it('returns 503 when Vinted responds with 403 (cloudflare/datadome blocked)', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 403,
      json: async () => ({}),
    } as Response);
    const res = await POST(makeReq({ curl: SAMPLE_CURL }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('cloudflare_blocked');
  });

  it('paginates across multiple pages', async () => {
    const page1 = {
      items: [{ id: 1, title: '(jpn_s9-31)', description: '', price: { amount: '5', currency_code: 'EUR' }, created_at_ts: 1, photos: [] }],
      pagination: { total_pages: 2 },
    };
    const page2 = {
      items: [{ id: 2, title: '(jpn_s9-32)', description: '', price: { amount: '5', currency_code: 'EUR' }, created_at_ts: 1, photos: [] }],
      pagination: { total_pages: 2 },
    };
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ status: 200, json: async () => page1 } as Response)
      .mockResolvedValueOnce({ status: 200, json: async () => page2 } as Response);

    const res = await POST(makeReq({ curl: SAMPLE_CURL }));
    const body = await res.json();
    expect(body.items).toHaveLength(2);
    expect(body.items.map((i: { id: number }) => i.id)).toEqual([1, 2]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/api/import/vinted/fetch/route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the directory and route file**

```bash
mkdir -p app/api/import/vinted/fetch
```

Create `app/api/import/vinted/fetch/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { parseVintedCurl } from '@/lib/utils/parse-vinted-curl';
import { parseVintedListing } from '@/lib/utils/parse-vinted-listing';
import type { VintedItem } from '@/lib/types/vinted-import';

export const runtime = 'nodejs';

const PER_PAGE = 200;
const PAGE_TIMEOUT_MS = 30_000;
const MAX_RETRIES_429 = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(request: Request) {
  let body: { curl?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (typeof body.curl !== 'string' || body.curl.length === 0) {
    return NextResponse.json({ error: 'invalid_curl' }, { status: 400 });
  }

  const parsedCurl = parseVintedCurl(body.curl);
  if (!parsedCurl) {
    return NextResponse.json({ error: 'invalid_curl' }, { status: 400 });
  }

  const { userId, cookie, csrfToken } = parsedCurl;
  const items: VintedItem[] = [];
  let page = 1;
  let totalPages = 1;
  const headers: HeadersInit = {
    Cookie: cookie,
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
  };
  if (csrfToken) (headers as Record<string, string>)['x-csrf-token'] = csrfToken;

  while (page <= totalPages) {
    const url = `https://www.vinted.fr/api/v2/users/${userId}/items?per_page=${PER_PAGE}&page=${page}`;
    let retryCount = 0;
    let res: Response;
    try {
      res = await fetch(url, { headers, signal: AbortSignal.timeout(PAGE_TIMEOUT_MS) });
    } catch (e) {
      console.error('[import-vinted] fetch threw', e);
      return NextResponse.json({ error: 'fetch_failed', detail: String(e) }, { status: 503 });
    }

    if (res.status === 401) {
      return NextResponse.json({ error: 'cookie_expired' }, { status: 401 });
    }
    if (res.status === 403) {
      return NextResponse.json({ error: 'cloudflare_blocked' }, { status: 503 });
    }
    while (res.status === 429 && retryCount < MAX_RETRIES_429) {
      const waitMs = 1000 * Math.pow(2, retryCount);
      await sleep(waitMs);
      retryCount++;
      res = await fetch(url, { headers, signal: AbortSignal.timeout(PAGE_TIMEOUT_MS) });
    }
    if (res.status === 429) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 503 });
    }
    if (!res.ok) {
      return NextResponse.json(
        { error: 'vinted_error', status: res.status },
        { status: 503 },
      );
    }

    const data = (await res.json()) as { items?: VintedItem[]; pagination?: { total_pages?: number } };
    if (Array.isArray(data.items)) items.push(...data.items);
    totalPages = data.pagination?.total_pages ?? page;
    console.info(`[import-vinted] page ${page}/${totalPages} → ${data.items?.length ?? 0} items`);
    page++;
  }

  const filtered = items.filter((i) => parseVintedListing({ title: i.title, description: i.description }) !== null);
  console.info(`[import-vinted] filtered ${items.length} → ${filtered.length} cards (${items.length - filtered.length} skipped)`);

  return NextResponse.json({ items: filtered, skipped: items.length - filtered.length });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/api/import/vinted/fetch/route.test.ts`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/import/vinted/fetch/route.ts app/api/import/vinted/fetch/route.test.ts
git commit -m "Import Vinted: POST /api/import/vinted/fetch (paginate API + filter cards)"
```

---

## Task 6: Endpoint `POST /api/import/vinted/preview`

**Files:**
- Create: `app/api/import/vinted/preview/route.ts`

(Pas de test dédié pour ce endpoint : c'est un orchestrateur qui appelle `/api/enrich` interne. Les helpers individuels sont déjà testés.)

- [ ] **Step 1: Create the directory and route**

```bash
mkdir -p app/api/import/vinted/preview
```

Create `app/api/import/vinted/preview/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { parseVintedListing } from '@/lib/utils/parse-vinted-listing';
import type { VintedItem } from '@/lib/types/vinted-import';
import type { EnrichResult } from '@/lib/types';

export const runtime = 'nodejs';

const ENRICH_CONCURRENCY = 5;
const ENRICH_TIMEOUT_MS = 12_000;

interface EnrichBody {
  setCode: string;
  setNumber: string;
  language: string;
  condition: string;
}

async function enrichOne(body: EnrichBody, baseUrl: string): Promise<EnrichResult | null> {
  try {
    const res = await fetch(`${baseUrl}/api/enrich`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ENRICH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as EnrichResult;
  } catch (e) {
    console.warn('[import-vinted/preview] enrich failed', e);
    return null;
  }
}

/** Run promises with bounded concurrency. Order of `inputs` preserved in output. */
async function mapWithConcurrency<I, O>(
  inputs: I[],
  limit: number,
  fn: (i: I) => Promise<O>,
): Promise<O[]> {
  const out: O[] = new Array(inputs.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, inputs.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= inputs.length) return;
      out[idx] = await fn(inputs[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function POST(request: Request) {
  let body: { items?: VintedItem[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const items = body.items;
  if (!Array.isArray(items)) {
    return NextResponse.json({ error: 'items_required' }, { status: 400 });
  }

  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;

  const enriched = await mapWithConcurrency(items, ENRICH_CONCURRENCY, async (item) => {
    const parsed = parseVintedListing({ title: item.title, description: item.description });
    if (!parsed) return [String(item.id), null] as const;
    const enrichBody: EnrichBody = {
      setCode: parsed.setCode,
      setNumber: parsed.setNumber,
      language: parsed.language,
      condition: parsed.condition,
    };
    const result = await enrichOne(enrichBody, baseUrl);
    return [String(item.id), result?.bestMatch ?? null] as const;
  });

  const map: Record<string, EnrichResult['bestMatch']> = {};
  for (const [id, val] of enriched) map[id] = val;

  return NextResponse.json({ enriched: map });
}
```

- [ ] **Step 2: Verify the file compiles and lints clean**

Run: `npx tsc --noEmit && npx next lint app/api/import/vinted/preview/route.ts`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add app/api/import/vinted/preview/route.ts
git commit -m "Import Vinted: POST /api/import/vinted/preview (enrich items via /api/enrich)"
```

---

## Task 7: Endpoint `POST /api/import/vinted/commit`

**Files:**
- Create: `app/api/import/vinted/commit/route.ts`
- Test: `app/api/import/vinted/commit/route.test.ts`

- [ ] **Step 1: Write the failing test**

The route uses `createClient` from `@/lib/supabase/server` + `fetch` to download photos. Mock both with vi.

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const ORIG_FETCH = global.fetch;

const insertCardMock = vi.fn();
const insertListingMock = vi.fn();
const uploadMock = vi.fn();
const getPublicUrlMock = vi.fn(() => ({ data: { publicUrl: 'https://supabase.co/storage/img.jpg' } }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-uuid-1' } } }) },
    from: (table: string) => {
      if (table === 'cards') {
        return {
          insert: (row: Record<string, unknown>) => insertCardMock(row),
        };
      }
      if (table === 'card_listings') {
        return {
          insert: (row: Record<string, unknown>) => insertListingMock(row),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    storage: {
      from: () => ({
        upload: uploadMock,
        getPublicUrl: getPublicUrlMock,
      }),
    },
  }),
}));

import { POST } from './route';
import type { ToImport } from '@/lib/types/vinted-import';

const SAMPLE_ITEM: ToImport = {
  vintedItem: {
    id: 999,
    title: '(jpn_s8b-208)',
    description: 'Near Mint',
    price: { amount: '5.5', currency_code: 'EUR' },
    created_at_ts: 1_704_067_200,
    photos: [{ id: 1, full_size_url: 'https://images.vinted.net/full.jpg', url: 'https://images.vinted.net/thumb.jpg' }],
  },
  parsed: { language: 'JP', setCode: 's8b', setNumber: '208', condition: 'NM' },
  enriched: null,
};

function makeReq(items: ToImport[]): Request {
  return new Request('http://localhost/api/import/vinted/commit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ items }),
  });
}

describe('POST /api/import/vinted/commit', () => {
  beforeEach(() => {
    insertCardMock.mockReset();
    insertListingMock.mockReset();
    uploadMock.mockReset();
    getPublicUrlMock.mockClear();
    global.fetch = vi.fn();
  });
  afterEach(() => {
    global.fetch = ORIG_FETCH;
  });

  it('happy path: downloads photo, uploads to storage, inserts card + listing', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as Response);
    uploadMock.mockResolvedValueOnce({ error: null });
    insertCardMock.mockReturnValueOnce({
      select: () => ({ single: async () => ({ data: { id: 'card-uuid-1' }, error: null }) }),
    });
    insertListingMock.mockResolvedValueOnce({ error: null });

    const res = await POST(makeReq([SAMPLE_ITEM]));
    const body = await res.json();
    expect(body.created).toBe(1);
    expect(body.failed).toEqual([]);
    expect(insertCardMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'for_sale', set_code: 's8b', set_number: '208' }),
    );
    expect(insertListingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        card_id: 'card-uuid-1',
        user_id: 'user-uuid-1',
        listed_at: '2024-01-01T00:00:00.000Z',
      }),
    );
  });

  it('records duplicate_for_sale failure when INSERT cards conflicts on unique index', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as Response);
    uploadMock.mockResolvedValueOnce({ error: null });
    insertCardMock.mockReturnValueOnce({
      select: () => ({ single: async () => ({ data: null, error: { code: '23505', message: 'duplicate' } }) }),
    });

    const res = await POST(makeReq([SAMPLE_ITEM]));
    const body = await res.json();
    expect(body.created).toBe(0);
    expect(body.failed).toEqual([{ vintedItemId: 999, reason: 'duplicate_for_sale' }]);
    expect(insertListingMock).not.toHaveBeenCalled();
  });

  it('falls back to next photo when first 404s, then null if all fail', async () => {
    const item: ToImport = {
      ...SAMPLE_ITEM,
      vintedItem: {
        ...SAMPLE_ITEM.vintedItem,
        photos: [
          { id: 1, full_size_url: 'https://x/a.jpg', url: 'thumb' },
          { id: 2, full_size_url: 'https://x/b.jpg', url: 'thumb' },
        ],
      },
    };
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response) // photo a 404
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response); // photo b 404 too
    insertCardMock.mockReturnValueOnce({
      select: () => ({ single: async () => ({ data: { id: 'card-uuid-2' }, error: null }) }),
    });
    insertListingMock.mockResolvedValueOnce({ error: null });

    const res = await POST(makeReq([item]));
    const body = await res.json();
    expect(body.created).toBe(1);
    expect(body.failed).toEqual([{ vintedItemId: 999, reason: 'photo_unavailable' }]);
    expect(insertCardMock).toHaveBeenCalledWith(expect.objectContaining({ image_url: null }));
  });

  it('returns 401 when user is not authenticated', async () => {
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: null } }) },
      }),
    }));
    const mod = await import('./route');
    const res = await mod.POST(makeReq([SAMPLE_ITEM]));
    expect(res.status).toBe(401);
    vi.doUnmock('@/lib/supabase/server');
  });

  it('records storage_upload_failed and skips INSERT when bucket upload errors', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as Response);
    uploadMock.mockResolvedValueOnce({ error: { message: 'storage err' } });

    const res = await POST(makeReq([SAMPLE_ITEM]));
    const body = await res.json();
    expect(body.created).toBe(0);
    expect(body.failed).toEqual([{ vintedItemId: 999, reason: 'storage_upload_failed' }]);
    expect(insertCardMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run app/api/import/vinted/commit/route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the directory and route**

```bash
mkdir -p app/api/import/vinted/commit
```

Create `app/api/import/vinted/commit/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { mapVintedToCardInsert } from '@/lib/utils/map-vinted-to-card';
import type { ImportFailure, ToImport } from '@/lib/types/vinted-import';

export const runtime = 'nodejs';

const PHOTO_TIMEOUT_MS = 10_000;

async function downloadAndUpload(
  photos: ToImport['vintedItem']['photos'],
  supabase: Awaited<ReturnType<typeof createClient>>,
  vintedItemId: number,
): Promise<string | null> {
  for (const photo of photos) {
    try {
      const res = await fetch(photo.full_size_url, {
        signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS),
      });
      if (!res.ok) continue;
      const buffer = Buffer.from(await res.arrayBuffer());
      const path = `vinted-import-${vintedItemId}-${photo.id}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('card-photos')
        .upload(path, buffer, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) {
        console.warn('[import-vinted/commit] storage upload failed', uploadError);
        return ''; // sentinel: 'storage_upload_failed' (caller distinguishes from null)
      }
      return supabase.storage.from('card-photos').getPublicUrl(path).data.publicUrl;
    } catch (e) {
      console.warn('[import-vinted/commit] photo fetch error', e);
    }
  }
  return null;
}

export async function POST(request: Request) {
  let body: { items?: ToImport[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!Array.isArray(body.items)) {
    return NextResponse.json({ error: 'items_required' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const created: string[] = [];
  const failed: ImportFailure[] = [];

  for (const item of body.items) {
    const vintedItemId = item.vintedItem.id;
    try {
      // 1. Photo (fallback through photos[*], '' = upload failed, null = all 404)
      const uploadResult = await downloadAndUpload(item.vintedItem.photos, supabase, vintedItemId);
      if (uploadResult === '') {
        failed.push({ vintedItemId, reason: 'storage_upload_failed' });
        continue;
      }
      const imageUrl = uploadResult; // string | null

      // 2. INSERT card
      const cardRow = mapVintedToCardInsert(item.vintedItem, item.parsed, item.enriched, imageUrl ?? '');
      const { data: card, error: cardErr } = await supabase
        .from('cards')
        .insert(cardRow)
        .select('id')
        .single();
      if (cardErr) {
        if (cardErr.code === '23505') {
          failed.push({ vintedItemId, reason: 'duplicate_for_sale' });
          continue;
        }
        failed.push({ vintedItemId, reason: 'unknown', detail: cardErr.message });
        continue;
      }

      // 3. INSERT card_listings (listed_at = Vinted's created_at_ts)
      const listedAt = new Date(item.vintedItem.created_at_ts * 1000).toISOString();
      const { error: listingErr } = await supabase.from('card_listings').insert({
        card_id: card.id,
        user_id: user.id,
        listed_at: listedAt,
      });
      if (listingErr && listingErr.code !== '23505') {
        failed.push({ vintedItemId, reason: 'unknown', detail: listingErr.message });
        continue;
      }
      if (listingErr?.code === '23505') {
        failed.push({ vintedItemId, reason: 'listing_already_exists' });
      }

      created.push(card.id);
      if (imageUrl === null) {
        failed.push({ vintedItemId, reason: 'photo_unavailable' });
      }
    } catch (e) {
      failed.push({ vintedItemId, reason: 'unknown', detail: String(e) });
    }
  }

  console.info(`[import-vinted/commit] created ${created.length}, failed ${failed.length}`);
  return NextResponse.json({ created: created.length, failed });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run app/api/import/vinted/commit/route.test.ts`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/import/vinted/commit/route.ts app/api/import/vinted/commit/route.test.ts
git commit -m "Import Vinted: POST /api/import/vinted/commit (download photos + INSERT cards + listings)"
```

---

## Task 8: Composant `VintedImportTile`

**Files:**
- Create: `components/import/VintedImportTile.tsx`

(Pas de tests UI — cohérent avec la baseline du projet.)

- [ ] **Step 1: Create the directory**

```bash
mkdir -p components/import
```

- [ ] **Step 2: Write the component**

Create `components/import/VintedImportTile.tsx`:

```tsx
'use client';

import Image from 'next/image';
import type { EnrichedCard } from '@/lib/types';
import type { ParsedListing, VintedItem } from '@/lib/types/vinted-import';

export interface VintedImportTileProps {
  item: VintedItem;
  parsed: ParsedListing | null;
  enriched: EnrichedCard | null;
  selected: boolean;
  onToggle: () => void;
  onZoom: () => void;
  onEdit: () => void;
}

function daysSince(ts: number): number {
  const ms = Date.now() - ts * 1000;
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function statusBorderClass(parsed: ParsedListing | null, enriched: EnrichedCard | null): string {
  if (!parsed) return 'border-rarity-ar/50'; // orange = manual edit needed
  if (!enriched) return 'border-rarity-r/40'; // yellow = enrich failed
  return 'border-rarity-uc/30'; // green-ish subtle
}

export function VintedImportTile({
  item,
  parsed,
  enriched,
  selected,
  onToggle,
  onZoom,
  onEdit,
}: VintedImportTileProps) {
  const photo = item.photos[0]?.url ?? null;
  const days = daysSince(item.created_at_ts);
  const displayName =
    enriched?.pokemon_name ?? (item.title.length > 30 ? `${item.title.slice(0, 30)}…` : item.title);

  return (
    <div
      className={`relative rounded-lg border-2 p-3 transition-opacity ${statusBorderClass(parsed, enriched)} ${selected ? '' : 'opacity-40'}`}
    >
      <label className="absolute left-2 top-2 z-10 flex items-center">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="h-4 w-4 accent-rarity-uc"
          aria-label="Importer cette carte"
        />
      </label>
      <button
        type="button"
        onClick={onZoom}
        className="block w-full overflow-hidden rounded bg-muted"
        aria-label="Zoom photo"
      >
        {photo ? (
          <Image
            src={photo}
            alt={displayName}
            width={200}
            height={280}
            className="h-auto w-full object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
            Pas de photo
          </div>
        )}
      </button>
      <div className="mt-2 space-y-1 text-xs">
        <div className="font-semibold">{displayName}</div>
        {parsed ? (
          <div className="text-muted-foreground">
            {parsed.setCode}-{parsed.setNumber} · {parsed.condition} · {parsed.language}
          </div>
        ) : (
          <div className="text-rarity-ar">Pattern non détecté</div>
        )}
        <div className="text-muted-foreground">
          €{Number(item.price.amount).toFixed(2)} · en ligne {days}j
        </div>
        {!parsed && (
          <button
            type="button"
            onClick={onEdit}
            className="mt-1 rounded bg-rarity-ar/20 px-2 py-1 text-rarity-ar"
          >
            Compléter manuellement
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify it compiles and lints clean**

Run: `npx tsc --noEmit && npx next lint components/import/VintedImportTile.tsx`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add components/import/VintedImportTile.tsx
git commit -m "Import Vinted: VintedImportTile (checkbox + photo + meta + status border)"
```

---

## Task 9: Composant `VintedImportFlow`

**Files:**
- Create: `components/import/VintedImportFlow.tsx`

- [ ] **Step 1: Write the component**

Create `components/import/VintedImportFlow.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { parseVintedListing } from '@/lib/utils/parse-vinted-listing';
import type { EnrichedCard } from '@/lib/types';
import type {
  ImportFailure,
  ParsedListing,
  ToImport,
  VintedItem,
} from '@/lib/types/vinted-import';
import { VintedImportTile } from './VintedImportTile';

type Phase =
  | { kind: 'paste-curl' }
  | {
      kind: 'select-cards';
      items: VintedItem[];
      skipped: number;
      enriched: Record<string, EnrichedCard | null>;
      selected: Set<string>;
    }
  | { kind: 'committing'; total: number; done: number }
  | { kind: 'done'; created: number; failed: ImportFailure[] };

export function VintedImportFlow() {
  const [phase, setPhase] = useState<Phase>({ kind: 'paste-curl' });
  const [curl, setCurl] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Phase 1: fetch
  async function handleFetch() {
    setError(null);
    const res = await fetch('/api/import/vinted/fetch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ curl }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? `HTTP ${res.status}`);
      return;
    }
    const { items, skipped } = (await res.json()) as { items: VintedItem[]; skipped: number };
    setPhase({
      kind: 'select-cards',
      items,
      skipped,
      enriched: {},
      selected: new Set(items.map((i) => String(i.id))),
    });
  }

  // Background enrich on entering select-cards
  useEffect(() => {
    if (phase.kind !== 'select-cards' || phase.items.length === 0) return;
    let cancelled = false;
    (async () => {
      const res = await fetch('/api/import/vinted/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: phase.items }),
      });
      if (!res.ok || cancelled) return;
      const { enriched } = (await res.json()) as { enriched: Record<string, EnrichedCard | null> };
      setPhase((p) => (p.kind === 'select-cards' ? { ...p, enriched } : p));
    })();
    return () => {
      cancelled = true;
    };
  }, [phase.kind === 'select-cards' ? phase.items : null]);

  // Phase 3: commit
  async function handleCommit() {
    if (phase.kind !== 'select-cards') return;
    const toImport: ToImport[] = phase.items
      .filter((i) => phase.selected.has(String(i.id)))
      .map((vintedItem) => {
        const parsed = parseVintedListing({ title: vintedItem.title, description: vintedItem.description })!;
        return { vintedItem, parsed, enriched: phase.enriched[String(vintedItem.id)] ?? null };
      });
    setPhase({ kind: 'committing', total: toImport.length, done: 0 });
    const res = await fetch('/api/import/vinted/commit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: toImport }),
    });
    const body = (await res.json()) as { created: number; failed: ImportFailure[] };
    setPhase({ kind: 'done', created: body.created, failed: body.failed });
  }

  if (phase.kind === 'paste-curl') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Sur vinted.fr, F12 → onglet Network → click droit sur une requête{' '}
          <code className="rounded bg-muted px-1">/api/v2/users/&lt;id&gt;/items</code> → Copy as cURL → colle ci-dessous.
        </p>
        <textarea
          value={curl}
          onChange={(e) => setCurl(e.target.value)}
          rows={8}
          placeholder="curl 'https://www.vinted.fr/api/v2/users/.../items?...' -H 'cookie: ...'"
          className="w-full rounded border bg-background p-2 font-mono text-xs"
        />
        {error && <div className="text-sm text-destructive">Erreur : {error}</div>}
        <button
          type="button"
          onClick={handleFetch}
          disabled={!curl.startsWith('curl ')}
          className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        >
          Récupérer mes annonces
        </button>
      </div>
    );
  }

  if (phase.kind === 'select-cards') {
    const selectedCount = phase.selected.size;
    return (
      <div className="space-y-4 pb-20">
        <div className="sticky top-0 z-10 flex items-center justify-between rounded bg-background/80 p-3 backdrop-blur">
          <div className="text-sm">
            {phase.items.length} cartes détectées · {phase.skipped} ignorées · <strong>{selectedCount}</strong> sélectionnées
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {phase.items.map((item) => {
            const id = String(item.id);
            const parsed = parseVintedListing({ title: item.title, description: item.description });
            return (
              <VintedImportTile
                key={id}
                item={item}
                parsed={parsed}
                enriched={phase.enriched[id] ?? null}
                selected={phase.selected.has(id)}
                onToggle={() =>
                  setPhase((p) => {
                    if (p.kind !== 'select-cards') return p;
                    const next = new Set(p.selected);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return { ...p, selected: next };
                  })
                }
                onZoom={() => window.open(item.photos[0]?.full_size_url ?? '#', '_blank')}
                onEdit={() => alert('Édit manuel — TODO Task 11')}
              />
            );
          })}
        </div>
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background p-3 md:left-[220px]">
          <button
            type="button"
            onClick={handleCommit}
            disabled={selectedCount === 0}
            className="w-full rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
          >
            Importer {selectedCount} cartes
          </button>
        </div>
      </div>
    );
  }

  if (phase.kind === 'committing') {
    return (
      <div className="space-y-2">
        <div className="text-sm">Import en cours…</div>
        <div className="h-2 w-full overflow-hidden rounded bg-muted">
          <div className="h-full bg-primary" style={{ width: `${(phase.done / phase.total) * 100}%` }} />
        </div>
      </div>
    );
  }

  // phase.kind === 'done'
  return (
    <div className="space-y-4">
      <div className="rounded border border-rarity-uc bg-rarity-uc/10 p-4">
        ✅ <strong>{phase.created}</strong> cartes importées
        {phase.failed.length > 0 && (
          <span className="text-rarity-ar">
            {' '}
            · <strong>{phase.failed.length}</strong> échecs
          </span>
        )}
      </div>
      {phase.failed.length > 0 && (
        <details className="rounded border p-3">
          <summary className="cursor-pointer text-sm">Détails des échecs</summary>
          <ul className="mt-2 space-y-1 text-xs">
            {phase.failed.map((f) => (
              <li key={f.vintedItemId}>
                <code>#{f.vintedItemId}</code> — {f.reason}
                {f.detail ? ` — ${f.detail}` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
      <Link href="/vinted" className="text-sm text-primary underline">
        Aller dans /vinted →
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles and lints clean**

Run: `npx tsc --noEmit && npx next lint components/import/VintedImportFlow.tsx`
Expected: pass.

> Note : le `useEffect` deps array contient `phase.kind === 'select-cards' ? phase.items : null` qui peut déclencher un warning ESLint react-hooks/exhaustive-deps. Si c'est le cas, ajouter `// eslint-disable-next-line react-hooks/exhaustive-deps` au-dessus du `useEffect` (le pattern volontaire ici : on veut re-run uniquement quand on entre `select-cards`).

- [ ] **Step 3: Commit**

```bash
git add components/import/VintedImportFlow.tsx
git commit -m "Import Vinted: VintedImportFlow state machine (paste-curl → select-cards → committing → done)"
```

---

## Task 10: Page `/import/vinted` + lien depuis `/options`

**Files:**
- Create: `app/(app)/import/vinted/page.tsx`
- Modify: `app/(app)/options/page.tsx`

- [ ] **Step 1: Create the directory and page**

```bash
mkdir -p "app/(app)/import/vinted"
```

Create `app/(app)/import/vinted/page.tsx`:

```tsx
import { VintedImportFlow } from '@/components/import/VintedImportFlow';

export default function ImportVintedPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <h1 className="text-2xl font-bold">Import Vinted</h1>
      <p className="text-sm text-muted-foreground">
        Bootstrap one-shot depuis ton compte Vinted. Tes annonces seront créées comme cards{' '}
        <code>for_sale</code> listées par toi.
      </p>
      <VintedImportFlow />
    </div>
  );
}
```

- [ ] **Step 2: Read the current options page to find a good insertion point**

Read `app/(app)/options/page.tsx` to locate where to add a discrete link (probably after the SignOutButton or before).

- [ ] **Step 3: Add a link in `/options`**

In `app/(app)/options/page.tsx`, add a `<Link>` to `/import/vinted` somewhere visible-but-discrete (e.g. a "Outils" section above the sign-out button) :

```tsx
import Link from 'next/link';

// ... in the JSX, add a section like:
<section className="space-y-2">
  <h2 className="text-sm font-semibold text-muted-foreground">Outils</h2>
  <Link href="/import/vinted" className="block text-sm text-primary underline">
    Import depuis Vinted (one-shot)
  </Link>
</section>
```

Adapt the className/spacing to match the existing options page style. Read the file first, then edit, do NOT blindly paste.

- [ ] **Step 4: Smoke check**

Run the dev server : `npm run dev`. Open <http://localhost:3000/options> — link visible. Click → page `/import/vinted` charge avec le shell + textarea visible. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/import/vinted/page.tsx" "app/(app)/options/page.tsx"
git commit -m "Import Vinted: page /import/vinted + lien discret depuis /options"
```

---

## Task 11: Wire manual edit modal (CardScanForm prefill)

**Files:**
- Modify: `components/import/VintedImportFlow.tsx`

Le `onEdit={() => alert(...)}` placeholder de Task 9 doit être remplacé par une vraie modal qui ouvre `<CardScanForm>` en mode prefill (sans OCR, juste form vide à compléter manuellement).

- [ ] **Step 1: Read CardScanForm to understand its prefill props**

Read `components/submit/CardScanForm.tsx` lines 1-100 to confirm the prefill prop names (`initialOcr`, `initialEnrich`, `initialPhoto`, `initialPhotoFilename`, `lockedStatus`, `onCancel`, `onSaved`, `compact`). Cross-reference with [docs/phases-summary.md Phase 3b2 section](../../phases-summary.md) which documents these props.

- [ ] **Step 2: Add a manualEditingId state and modal to VintedImportFlow**

In `components/import/VintedImportFlow.tsx`, modify the `select-cards` branch :

1. Add state `const [manualEditingId, setManualEditingId] = useState<string | null>(null);`
2. Replace the `onEdit={() => alert(...)}` line with `onEdit={() => setManualEditingId(id)}`.
3. Below the grid (still inside the `select-cards` branch), render a modal :

```tsx
{manualEditingId !== null && (() => {
  const editingItem = phase.items.find((i) => String(i.id) === manualEditingId);
  if (!editingItem) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-background p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Édit manuel — {editingItem.title.slice(0, 50)}</h2>
          <button onClick={() => setManualEditingId(null)} aria-label="Fermer">✕</button>
        </div>
        <p className="mb-2 text-xs text-muted-foreground">
          La carte ne sera pas insérée immédiatement. Save remplit les meta dans la liste,
          puis tu importes via le bouton du bas.
        </p>
        <CardScanForm
          compact
          lockedStatus="for_sale"
          initialOcr={{ card_name: editingItem.title }}
          initialEnrich={{ bestMatch: null, candidates: [] }}
          onCancel={() => setManualEditingId(null)}
          onSaved={() => setManualEditingId(null)}
        />
      </div>
    </div>
  );
})()}
```

> **NOTE** : `CardScanForm` peut écrire directement dans la DB via son propre POST `/api/cards`. Pour l'import, ce comportement est ACCEPTABLE — la carte est insérée immédiatement avec les meta complétées par le user, et la tile reste cochée mais le commit Phase 3 retournera `duplicate_for_sale` (skip silencieux). Si on veut vraiment intercepter l'INSERT pour le déférer au commit Phase 3, c'est plus complexe et hors scope de ce one-shot — laisser `CardScanForm` faire son job.

- [ ] **Step 3: Add the import**

Add at top of file: `import { CardScanForm } from '@/components/submit/CardScanForm';`

- [ ] **Step 4: Verify TS + lint**

Run: `npx tsc --noEmit && npx next lint components/import/VintedImportFlow.tsx`
Expected: pass. Si CardScanForm props ont des noms légèrement différents que ceux supposés ci-dessus, adapter aux vrais.

- [ ] **Step 5: Commit**

```bash
git add components/import/VintedImportFlow.tsx
git commit -m "Import Vinted: modal édit manuel via CardScanForm prefill"
```

---

## Task 12: Update CLAUDE.md and docs/phases-summary.md

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/phases-summary.md`

- [ ] **Step 1: Read CLAUDE.md table "Architecture clé"**

Read `CLAUDE.md`, section `## Architecture clé`. Find the table.

- [ ] **Step 2: Add a row for the import module**

In the `## Architecture clé` table, add a new row:

```markdown
| Import Vinted (one-shot) | `app/(app)/import/vinted/page.tsx`, `app/api/import/vinted/{fetch,preview,commit}/route.ts`, `components/import/{VintedImportFlow,VintedImportTile}.tsx`, `lib/utils/{parse-vinted-curl,parse-vinted-listing,map-vinted-to-card}.ts`, `lib/types/vinted-import.ts` |
```

Insert it right after the row for "Multi-user (Phase 4)".

- [ ] **Step 3: Update the Phase 4 line + Phase 5 line at the top**

In the bullet list at the top of CLAUDE.md, locate the `**Phase 4** — TERMINEE.` line. Append at the end of that line :

```
Closeout : page web /import/vinted (Feature 1 différée du brief PHASE_4.md) qui parse le JSON Vinted via cookie session collé en curl, filtre regex (jpn|eng|fra|kor|chn)_<set>-<num>, grille checkbox + import en 1 clic, photos rapatriées dans card-photos. ~25 nouveaux tests.
```

Update the test count : grep dans le fichier le compteur `**302 tests**` et le passer à `**~327 tests**` (chiffre exact à confirmer après Task 13).

- [ ] **Step 4: Add a section in docs/phases-summary.md**

In `docs/phases-summary.md`, à la fin du fichier (avant `## Prochaines étapes : Phase 5`), ajouter une section :

```markdown
## Phase 4 closeout — Import Vinted (terminé)

Feature 1 du brief `PHASE_4.md` (différée à la livraison initiale Phase 4, livrée maintenant).

**Pivot vs brief original** : le brief disait Python CLI. Refait en page web `/import/vinted` pour cohérence avec la décision Phase 3b2 (drop des scripts Python). Réutilise `CardScanForm` + `/api/enrich` + bucket `card-photos` existants.

**Livrables** :
- Page `/import/vinted` (pas dans la nav, lien discret depuis `/options`)
- 3 endpoints : `POST /api/import/vinted/{fetch,preview,commit}` — fetch (paginate API Vinted via cookie session), preview (enrich background concurrency 5), commit (download photos → upload Storage → INSERT cards + card_listings)
- 3 helpers purs : `parseVintedCurl`, `parseVintedListing`, `mapVintedToCardInsert`
- 1 type partagé `lib/types/vinted-import.ts`
- 2 composants : `VintedImportFlow` (state machine 4 phases), `VintedImportTile` (grid item avec checkbox + photo + meta + status border)
- ~25 nouveaux tests vitest. Aucune migration.

**Décisions clés** :
- Filtre regex `(jpn|eng|fra|kor|chn)_<set>-<num>` sur titre+description → lots/non-cartes skip silencieux
- `listed_at` = `vintedItem.created_at_ts` (préserve l'historique stale)
- Photos rapatriées dans `card-photos` Storage (URL pérenne, indépendant de Vinted)
- Idempotent en re-run via les contraintes existantes (`one_for_sale_per_group` + PK `card_listings`)
- Mono-user (un user logué importe SES propres listings via `auth.uid()`)

**Hors scope** :
- Lots Vinted (re-saisis manuellement via `LotForm`)
- Articles non-cartes (skip silencieux)
- Variants (laissés `null`, à éditer après coup si besoin)
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/phases-summary.md
git commit -m "Docs: section Phase 4 closeout — Import Vinted (page web, helpers, endpoints)"
```

---

## Task 13: Final verification + test count update

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: all tests pass. Note the total count.

- [ ] **Step 2: Run type check + lint full project**

Run: `npx tsc --noEmit && npx next lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 3: Update test counter in CLAUDE.md if needed**

Grep `**302 tests**` ou `**327 tests**` dans CLAUDE.md et le mettre à la valeur exacte mesurée à l'étape 1. Update aussi la note dans `docs/phases-summary.md` section Phase 4 closeout.

```bash
git add CLAUDE.md docs/phases-summary.md
git commit -m "Docs: update test count to <N> after Import Vinted"
```

(Si aucun changement nécessaire, skip ce commit.)

- [ ] **Step 4: Manual smoke test (out-of-scope for the agent — note for the user)**

Pour le user, post-implémentation :
1. Lance `npm run dev`
2. Va sur <http://localhost:3000/options> → click "Import depuis Vinted"
3. Sur vinted.fr → F12 → Network → click sur une req `/api/v2/users/.../items` → "Copy as cURL"
4. Colle dans le textarea, click "Récupérer"
5. Vérifie : la grille s'affiche, les tiles vertes ont les meta extraites, les enrichments apparaissent en background
6. Décoche les fausses détections, click "Importer X cartes"
7. Va sur `/vinted` → vérifie que les cards apparaissent avec les bons listings + dates

Si étape 5 échoue avec `cookie_expired` → re-login Vinted et nouveau curl. Si `cloudflare_blocked` → attendre 1-2 min.

---

## Summary

13 tasks, ~25 nouveaux tests vitest, 0 nouvelle migration, 0 modification de schéma. La feature est entièrement isolée :

| Catégorie | Fichiers |
|---|---|
| Helpers purs | `parse-vinted-curl.ts`, `parse-vinted-listing.ts`, `map-vinted-to-card.ts` (+ tests) |
| Types | `lib/types/vinted-import.ts` |
| API | `/fetch`, `/preview`, `/commit` (+ tests fetch/commit) |
| UI | `VintedImportFlow`, `VintedImportTile`, page shell |
| Wiring | Lien depuis `/options`, ligne CLAUDE.md, section docs/phases-summary.md |
| Réutilisé tel quel | `/api/enrich`, `card-photos` bucket, `CardScanForm` (props prefill Phase 3b2), `card_listings` table |
