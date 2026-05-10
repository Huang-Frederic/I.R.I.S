# Scanner Enrich Pipeline Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the scanner enrich pipeline to use the freshly populated `cardmarket_card_index` as the primary source (Strategy 0), make set names canonical EN with optional JA suffix, make Pokémon/card names canonical FR with raw OCR in parentheses, constrain Gemini OCR against the official 741-expansion list, add a card-match preview thumbnail to the scanner UI, and fix a quick BatchForm thumbnail aspect bug.

**Architecture:** New DB columns store both canonical and OCR-raw versions of name fields. A new module `lib/api/cardmarket-enrich.ts` implements Strategy 0 lookup (Supabase-local, no network). Display helpers in `lib/utils/format-name.ts` compose the visible string at render time. The Gemini prompt gains a constraint section listing all valid expansion names. A small `CardMatchPreview` component shows the matched card in the scanner. All changes are additive — TCGdex stays as fallback, existing rows keep working until re-enriched.

**Tech Stack:** TypeScript + Next.js 15 App Router, Supabase (postgres), vitest + @testing-library/react + happy-dom, Tailwind v4.

**Branch policy:** Work on `prod` (per user memory). Do NOT push to `main`.

**Commit policy (per user memory):**
- Stop after `git add` and propose the commit message
- Let the user run `git commit` themselves
- Single-sentence commit messages, NO `Co-Authored-By: Claude` trailer

---

## Spec reference

Full design: [docs/superpowers/specs/2026-05-09-scanner-enrich-overhaul-design.md](../specs/2026-05-09-scanner-enrich-overhaul-design.md)

## File Structure

**Files created:**
- `supabase/migrations/20260510100000_multilang_names.sql` — adds 5 columns total
- `scripts/scrape-cardmarket-expansion-names.ts` — one-shot to populate `name_en`/`name_ja` via BrightData
- `lib/utils/format-name.ts` — pure display helpers
- `lib/utils/format-name.test.ts` — vitest unit tests
- `lib/api/cardmarket-enrich.ts` — Strategy 0 implementation (Supabase lookup → EnrichedCard)
- `lib/api/cardmarket-enrich.test.ts` — vitest unit tests with mocked Supabase
- `components/scanner/CardMatchPreview.tsx` — bottom-right thumbnail component

**Files modified:**
- `app/api/enrich/route.ts` — insert Strategy 0 call before existing strategies
- `lib/api/gemini-vision.ts` — append constraint section to PROMPT, fetch expansion list at server start
- `lib/types/index.ts` — extend `Card` interface with new columns
- `components/submit/CardScanForm.tsx` — mount `CardMatchPreview` next to existing `PokemonSpriteBadge` overlay
- `components/submit/BatchForm.tsx` — 1-line thumbnail aspect fix
- (display call sites in card list components — Vinted, Stock, Pokédex — pick up the helpers)

**Files NOT modified:**
- `scripts/scrape-cardmarket-cards.ts` (local Playwright fallback, untouched)
- `lib/api/tcgdex.ts` (kept as fallback chain for rarity/illustrator/dexId)
- The Apify scraper in `apify/cardmarket-scraper/` (one-shot tool, separate concern)

---

## Phase A — Foundation

### Task 1: DB migration — multilang name columns

**Files:**
- Create: `supabase/migrations/20260510100000_multilang_names.sql`
- Modify: `lib/types/index.ts`

#### Step 1.1 — Create the migration

- [ ] Create `supabase/migrations/20260510100000_multilang_names.sql` with this exact content:

```sql
-- Multilingual name columns for the scanner enrich overhaul.
--
-- Cards table: store the OCR-raw versions alongside the canonical FR/EN forms,
-- so the display layer can render "Canonical (OCR)" when they differ.
ALTER TABLE cards
  ADD COLUMN pokemon_name_ocr text,
  ADD COLUMN card_name_ocr text,
  ADD COLUMN set_name_ja text;

-- Cardmarket expansions: store English and Japanese display names alongside
-- the existing French name. Populated once via scripts/scrape-cardmarket-expansion-names.ts.
ALTER TABLE cardmarket_expansions
  ADD COLUMN name_en text,
  ADD COLUMN name_ja text;

-- Indexes for the constrained-OCR lookup path (validate set name match).
CREATE INDEX cardmarket_expansions_name_en_idx ON cardmarket_expansions (name_en);
CREATE INDEX cardmarket_expansions_name_ja_idx ON cardmarket_expansions (name_ja);
```

#### Step 1.2 — Apply the migration locally

- [ ] Run: `cd /home/fhuang5/Developer/I.R.I.S && export PATH=/home/fhuang5/.nvm/versions/node/v22.22.2/bin:$PATH && npx supabase migration up --linked`
- [ ] Expected: migration applied, output mentions `20260510100000_multilang_names`.
- [ ] Verify in Supabase SQL editor: `SELECT column_name FROM information_schema.columns WHERE table_name = 'cards' AND column_name IN ('pokemon_name_ocr', 'card_name_ocr', 'set_name_ja');` — should return 3 rows.

#### Step 1.3 — Extend the `Card` TypeScript interface

- [ ] In `lib/types/index.ts`, locate the `Card` interface. Find the line containing `pokemon_name?: string | null;`. Add directly after it:

```ts
  pokemon_name_ocr?: string | null;
  card_name_ocr?: string | null;
  set_name_ja?: string | null;
```

#### Step 1.4 — Verify TypeScript compiles

- [ ] Run: `npx tsc --noEmit`
- [ ] Expected: no errors. Existing code that does not yet read these columns continues to work; the columns are nullable.

#### Step 1.5 — Stage and propose commit

- [ ] Run: `git add supabase/migrations/20260510100000_multilang_names.sql lib/types/index.ts`
- [ ] Propose commit message:
  ```
  feat(db): add multilang name columns to cards and cardmarket_expansions
  ```
- [ ] Wait for the user to commit before proceeding.

---

## Phase B — Independent units (parallel-safe after Phase A)

### Task 2: BatchForm thumbnail aspect fix (1-line quick win)

**Files:**
- Modify: `components/submit/BatchForm.tsx` (1 line, around line 234)

#### Step 2.1 — Apply the fix

- [ ] In `components/submit/BatchForm.tsx`, locate this exact line:

```tsx
              <img src={URL.createObjectURL(p)} alt="" className="h-20 w-full rounded object-cover" />
```

- [ ] Replace with:

```tsx
              <img src={URL.createObjectURL(p)} alt="" className="aspect-[3/4] w-full rounded object-cover" />
```

#### Step 2.2 — Verify TypeScript compiles + lint passes

- [ ] Run: `npx tsc --noEmit && npx eslint components/submit/BatchForm.tsx`
- [ ] Expected: zero errors / warnings.

#### Step 2.3 — Stage and propose commit

- [ ] Run: `git add components/submit/BatchForm.tsx`
- [ ] Propose commit message:
  ```
  fix(batch): use 3:4 aspect ratio on photo thumbnails to match Samsung portrait capture
  ```

### Task 3: Display helpers with TDD

**Files:**
- Create: `lib/utils/format-name.ts`
- Create: `lib/utils/format-name.test.ts`

#### Step 3.1 — Write the failing test

- [ ] Create `lib/utils/format-name.test.ts` with this exact content:

```ts
import { describe, it, expect } from 'vitest';
import {
  displayPokemonName,
  displayCardName,
  displaySetName,
} from './format-name';

describe('displayPokemonName', () => {
  it('returns canonical when ocr is null', () => {
    expect(
      displayPokemonName({ pokemon_name: 'Dracaufeu', pokemon_name_ocr: null }),
    ).toBe('Dracaufeu');
  });

  it('returns canonical when ocr equals canonical (case/diacritics tolerant)', () => {
    expect(
      displayPokemonName({ pokemon_name: 'Dracaufeu', pokemon_name_ocr: 'DRACAUFEU' }),
    ).toBe('Dracaufeu');
    expect(
      displayPokemonName({ pokemon_name: 'Pichu', pokemon_name_ocr: 'pichu' }),
    ).toBe('Pichu');
  });

  it('appends ocr in parentheses when divergent', () => {
    expect(
      displayPokemonName({ pokemon_name: 'Dracaufeu', pokemon_name_ocr: 'Charizard' }),
    ).toBe('Dracaufeu (Charizard)');
    expect(
      displayPokemonName({ pokemon_name: 'Dracaufeu', pokemon_name_ocr: 'リザードン' }),
    ).toBe('Dracaufeu (リザードン)');
  });

  it('returns empty string when both are null', () => {
    expect(displayPokemonName({ pokemon_name: null, pokemon_name_ocr: null })).toBe('');
  });
});

describe('displayCardName', () => {
  it('returns canonical when ocr is null', () => {
    expect(
      displayCardName({ card_name: 'Dracaufeu ex', card_name_ocr: null }),
    ).toBe('Dracaufeu ex');
  });

  it('appends ocr when divergent', () => {
    expect(
      displayCardName({ card_name: 'Dracaufeu ex', card_name_ocr: 'Charizard ex' }),
    ).toBe('Dracaufeu ex (Charizard ex)');
  });
});

describe('displaySetName', () => {
  it('returns set_name as-is for non-JP cards', () => {
    expect(
      displaySetName({ language: 'EN', set_name: 'Brilliant Stars', set_name_ja: null }),
    ).toBe('Brilliant Stars');
    expect(
      displaySetName({ language: 'FR', set_name: 'Brilliant Stars', set_name_ja: '時空の裂け目' }),
    ).toBe('Brilliant Stars');
  });

  it('appends JA suffix only for JP cards with non-null set_name_ja', () => {
    expect(
      displaySetName({ language: 'JP', set_name: 'Crimson Haze', set_name_ja: '黒煙の覇者' }),
    ).toBe('Crimson Haze (黒煙の覇者)');
  });

  it('returns set_name without suffix when set_name_ja is null on JP card', () => {
    expect(
      displaySetName({ language: 'JP', set_name: 'Some Set', set_name_ja: null }),
    ).toBe('Some Set');
  });

  it('returns empty string when set_name is null', () => {
    expect(
      displaySetName({ language: 'EN', set_name: null, set_name_ja: null }),
    ).toBe('');
  });
});
```

#### Step 3.2 — Run the test to verify it fails

- [ ] Run: `npx vitest run lib/utils/format-name.test.ts`
- [ ] Expected: FAIL with `Cannot find module './format-name'`.

#### Step 3.3 — Implement the helpers

- [ ] Create `lib/utils/format-name.ts` with this exact content:

```ts
/**
 * Normalize a string for fuzzy equality: lowercase, strip combining marks
 * (NFD diacritics), collapse whitespace. Used to detect when an OCR-raw name
 * is "the same" as the canonical form, so we don't display "Dracaufeu (DRACAUFEU)".
 */
function normalize(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function displayPokemonName(card: {
  pokemon_name: string | null | undefined;
  pokemon_name_ocr: string | null | undefined;
}): string {
  const canonical = card.pokemon_name ?? '';
  const ocr = card.pokemon_name_ocr ?? '';
  if (!ocr) return canonical;
  if (normalize(ocr) === normalize(canonical)) return canonical;
  return `${canonical} (${ocr})`;
}

export function displayCardName(card: {
  card_name: string | null | undefined;
  card_name_ocr: string | null | undefined;
}): string {
  const canonical = card.card_name ?? '';
  const ocr = card.card_name_ocr ?? '';
  if (!ocr) return canonical;
  if (normalize(ocr) === normalize(canonical)) return canonical;
  return `${canonical} (${ocr})`;
}

export function displaySetName(card: {
  language: string | null | undefined;
  set_name: string | null | undefined;
  set_name_ja: string | null | undefined;
}): string {
  const base = card.set_name ?? '';
  if (card.language === 'JP' && card.set_name_ja) {
    return `${base} (${card.set_name_ja})`;
  }
  return base;
}
```

#### Step 3.4 — Run the test to verify it passes

- [ ] Run: `npx vitest run lib/utils/format-name.test.ts`
- [ ] Expected: All test cases PASS.

#### Step 3.5 — Stage and propose commit

- [ ] Run: `git add lib/utils/format-name.ts lib/utils/format-name.test.ts`
- [ ] Propose commit message:
  ```
  feat(format): add display helpers for canonical-vs-OCR name composition
  ```

### Task 4: CardMatchPreview component

**Files:**
- Create: `components/scanner/CardMatchPreview.tsx`

#### Step 4.1 — Create the component

- [ ] Create the directory if needed: `mkdir -p components/scanner`
- [ ] Create `components/scanner/CardMatchPreview.tsx` with this exact content:

```tsx
interface Props {
  imageUrl: string | null | undefined;
  className?: string;
}

export default function CardMatchPreview({ imageUrl, className }: Props) {
  if (!imageUrl) return null;
  return (
    <div
      className={`bg-white/10 backdrop-blur-sm rounded-lg p-1 shadow-md ${className ?? ''}`.trim()}
      aria-label="Carte matchée par l'API"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt=""
        aria-hidden
        className="aspect-[5/7] w-16 rounded object-contain"
      />
    </div>
  );
}
```

#### Step 4.2 — Verify TypeScript compiles + lint passes

- [ ] Run: `npx tsc --noEmit && npx eslint components/scanner/CardMatchPreview.tsx`
- [ ] Expected: zero errors / warnings.

#### Step 4.3 — Stage and propose commit

- [ ] Run: `git add components/scanner/CardMatchPreview.tsx`
- [ ] Propose commit message:
  ```
  feat(scanner): add CardMatchPreview component for bottom-right matched-card thumbnail
  ```

### Task 5: Scrape EN/JA expansion names

**Files:**
- Create: `scripts/scrape-cardmarket-expansion-names.ts`
- Modify: `package.json` (add npm script)

#### Step 5.1 — Create the script

- [ ] Create `scripts/scrape-cardmarket-expansion-names.ts` with this exact content:

```ts
/**
 * One-shot script: populate cardmarket_expansions.name_en and name_ja by
 * scraping the Cardmarket Pokemon dropdown from the /en/ and /ja/ locale
 * pages via BrightData Web Unlocker.
 *
 * Usage:
 *   BRIGHTDATA_TOKEN=... BRIGHTDATA_ZONE=iris npm run scrape-cm-expansion-names
 *
 * Idempotent — safe to re-run.
 */

import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
dotenvConfig({ path: path.resolve(__dirname, '..', '.env.local') });
dotenvConfig();

import { JSDOM } from 'jsdom';
import { createClient } from '@supabase/supabase-js';

const BRIGHTDATA_ENDPOINT = 'https://api.brightdata.com/request';
const BRIGHTDATA_TOKEN = process.env.BRIGHTDATA_TOKEN;
const BRIGHTDATA_ZONE = process.env.BRIGHTDATA_ZONE ?? 'iris';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!BRIGHTDATA_TOKEN) throw new Error('BRIGHTDATA_TOKEN required');
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(BRIGHTDATA_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${BRIGHTDATA_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ zone: BRIGHTDATA_ZONE, url, format: 'raw' }),
  });
  if (!res.ok) throw new Error(`BrightData ${res.status}: ${await res.text()}`);
  return res.text();
}

/**
 * Parse the expansion dropdown options from a CM Pokemon Singles page.
 * Returns an array of { idExpansion, name }.
 */
function parseExpansionDropdown(html: string): Array<{ idExpansion: number; name: string }> {
  const dom = new JSDOM(html);
  const options = dom.window.document.querySelectorAll<HTMLOptionElement>(
    'select[name="idExpansion"] option',
  );
  const out: Array<{ idExpansion: number; name: string }> = [];
  for (const opt of Array.from(options)) {
    const value = opt.getAttribute('value');
    const name = opt.textContent?.trim() ?? '';
    if (!value || value === '0' || !name) continue;
    const id = Number(value);
    if (!Number.isFinite(id) || id <= 0) continue;
    out.push({ idExpansion: id, name });
  }
  return out;
}

async function main(): Promise<void> {
  console.log('Fetching EN expansion list...');
  const enHtml = await fetchHtml(
    'https://www.cardmarket.com/en/Pokemon/Products/Singles?searchMode=v2&idCategory=51',
  );
  const enExpansions = parseExpansionDropdown(enHtml);
  console.log(`Parsed ${enExpansions.length} EN expansions`);

  console.log('Fetching JA expansion list...');
  const jaHtml = await fetchHtml(
    'https://www.cardmarket.com/ja/Pokemon/Products/Singles?searchMode=v2&idCategory=51',
  );
  const jaExpansions = parseExpansionDropdown(jaHtml);
  console.log(`Parsed ${jaExpansions.length} JA expansions`);

  const enById = new Map(enExpansions.map((e) => [e.idExpansion, e.name]));
  const jaById = new Map(jaExpansions.map((e) => [e.idExpansion, e.name]));

  // Union of all idExpansions seen in either dropdown.
  const allIds = new Set<number>([...enById.keys(), ...jaById.keys()]);
  console.log(`Will upsert ${allIds.size} expansions`);

  const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let updated = 0;
  let failed = 0;

  for (const id of allIds) {
    const { error } = await supabase
      .from('cardmarket_expansions')
      .update({
        name_en: enById.get(id) ?? null,
        name_ja: jaById.get(id) ?? null,
      })
      .eq('id_expansion', id);

    if (error) {
      console.error(`[${id}] update failed: ${error.message}`);
      failed++;
    } else {
      updated++;
    }
  }

  console.log(`Done. ${updated} updated, ${failed} failed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

#### Step 5.2 — Add npm script

- [ ] In `package.json`, locate the `"scripts"` object. Add this line right after the `"build-apify-input"` script:

```diff
     "build-apify-input": "tsx scripts/build-apify-input.ts",
+    "scrape-cm-expansion-names": "tsx scripts/scrape-cardmarket-expansion-names.ts",
```

#### Step 5.3 — Run the script

- [ ] Ensure `.env.local` has `BRIGHTDATA_TOKEN`, `BRIGHTDATA_ZONE`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Run: `npm run scrape-cm-expansion-names`
- [ ] Expected output:
  ```
  Fetching EN expansion list...
  Parsed ~741 EN expansions
  Fetching JA expansion list...
  Parsed ~250 JA expansions  (only the ~250 sets that have a JP release)
  Will upsert ~741 expansions
  Done. ~741 updated, 0 failed.
  ```
- [ ] Verify in SQL editor: `SELECT count(*) FROM cardmarket_expansions WHERE name_en IS NOT NULL;` → should be ~741.

#### Step 5.4 — Stage and propose commit

- [ ] Run: `git add scripts/scrape-cardmarket-expansion-names.ts package.json`
- [ ] Propose commit message:
  ```
  feat(scripts): add one-shot scraper to populate cardmarket_expansions name_en and name_ja
  ```

---

## Phase C — Pipeline integration

### Task 6: Strategy 0 module — cardmarket-enrich

**Files:**
- Create: `lib/api/cardmarket-enrich.ts`
- Create: `lib/api/cardmarket-enrich.test.ts`

#### Step 6.1 — Write the failing test

- [ ] Create `lib/api/cardmarket-enrich.test.ts` with this exact content:

```ts
import { describe, it, expect, vi } from 'vitest';
import { lookupCardmarketStrategy0 } from './cardmarket-enrich';

interface MockBuilder {
  select: () => MockBuilder;
  eq: (...args: unknown[]) => MockBuilder;
  single: () => Promise<{ data: unknown; error: unknown }>;
}

function mockSupabase(rows: Record<string, unknown>[] | null, error: unknown = null) {
  const builder: MockBuilder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    single: vi.fn(async () => ({ data: rows ? rows[0] ?? null : null, error })),
  };
  return {
    from: vi.fn(() => builder),
  };
}

describe('lookupCardmarketStrategy0', () => {
  it('returns null when set_name does not match any expansion', async () => {
    const supabase = mockSupabase(null);
    const result = await lookupCardmarketStrategy0(supabase as never, {
      setName: 'NonExistentSet',
      setNumber: '1',
      language: 'fr',
    });
    expect(result).toBeNull();
  });

  it('returns enriched card when both expansion and card_index hit', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'cardmarket_expansions') {
          return {
            select: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            single: vi.fn(async () => ({
              data: { id_expansion: 4434, name: 'Brilliant Stars', name_en: 'Brilliant Stars', name_ja: null },
              error: null,
            })),
          };
        }
        if (table === 'cardmarket_card_index') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn(async () => ({
              data: {
                id_product: 608425,
                id_expansion: 4434,
                set_number: '1',
                url_variant: null,
                url_path: '/fr/Pokemon/Products/Singles/Brilliant-Stars/Exeggcute-BRS001',
              },
              error: null,
            })),
          };
        }
        if (table === 'cardmarket_products') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn(async () => ({
              data: { id_product: 608425, name: 'Exeggcute' },
              error: null,
            })),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    const result = await lookupCardmarketStrategy0(supabase as never, {
      setName: 'Brilliant Stars',
      setNumber: '1',
      language: 'fr',
    });

    expect(result).not.toBeNull();
    expect(result!.cardmarket_id).toBe('608425');
    expect(result!.set_name).toBe('Brilliant Stars');
    expect(result!.set_name_ja).toBeNull();
    expect(result!.tcg_image_url).toContain('608425');
  });

  it('attaches set_name_ja when language is JP and the expansion has it', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'cardmarket_expansions') {
          return {
            select: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            single: vi.fn(async () => ({
              data: { id_expansion: 5000, name: 'Crimson Haze', name_en: 'Crimson Haze', name_ja: '黒煙の覇者' },
              error: null,
            })),
          };
        }
        if (table === 'cardmarket_card_index') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn(async () => ({
              data: { id_product: 700001, id_expansion: 5000, set_number: '5', url_variant: null, url_path: '/ja/...' },
              error: null,
            })),
          };
        }
        if (table === 'cardmarket_products') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn(async () => ({
              data: { id_product: 700001, name: 'Pikachu' },
              error: null,
            })),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    const result = await lookupCardmarketStrategy0(supabase as never, {
      setName: 'Crimson Haze',
      setNumber: '5',
      language: 'ja',
    });

    expect(result).not.toBeNull();
    expect(result!.set_name_ja).toBe('黒煙の覇者');
  });
});
```

#### Step 6.2 — Run the test to verify it fails

- [ ] Run: `npx vitest run lib/api/cardmarket-enrich.test.ts`
- [ ] Expected: FAIL with `Cannot find module './cardmarket-enrich'`.

#### Step 6.3 — Implement the module

- [ ] Create `lib/api/cardmarket-enrich.ts` with this exact content:

```ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

const CM_IMG_BASE = 'https://product-images.s3.cardmarket.com/51';

export interface CardmarketLookupInput {
  setName: string;
  setNumber: string;
  language: string;
}

export interface CardmarketLookupResult {
  cardmarket_id: string;
  cardmarket_url_path: string;
  card_name: string;
  set_name: string;
  set_name_ja: string | null;
  tcg_image_url: string;
}

/**
 * Strategy 0 of the enrich pipeline: resolve a card identity entirely from
 * our local Cardmarket-derived tables (no network).
 *
 * Steps:
 *   1. Resolve set_name (any locale) → id_expansion via cardmarket_expansions
 *      (matches against name, name_en, or name_ja).
 *   2. Lookup (id_expansion, set_number) in cardmarket_card_index → id_product.
 *   3. Fetch the product display name from cardmarket_products.
 *   4. Build the canonical S3 image URL from the cardmarket image pattern.
 *
 * Returns null on any miss — caller falls back to TCGdex strategies.
 */
export async function lookupCardmarketStrategy0(
  supabase: SupabaseClient,
  input: CardmarketLookupInput,
): Promise<CardmarketLookupResult | null> {
  const { setName, setNumber, language } = input;
  if (!setName || !setNumber) return null;

  // Step 1: resolve the expansion (case/locale tolerant via OR clause).
  const { data: expansion } = await supabase
    .from('cardmarket_expansions')
    .select('id_expansion, name, name_en, name_ja')
    .or(`name.eq.${setName},name_en.eq.${setName},name_ja.eq.${setName}`)
    .limit(1)
    .single();

  if (!expansion) return null;
  const idExpansion: number = expansion.id_expansion;
  const setNameEn: string | null = expansion.name_en ?? expansion.name ?? null;
  const setNameJa: string | null = expansion.name_ja ?? null;

  // Step 2: lookup the index row.
  const { data: indexRow } = await supabase
    .from('cardmarket_card_index')
    .select('id_product, url_path')
    .eq('id_expansion', idExpansion)
    .eq('set_number', setNumber)
    .single();

  if (!indexRow) return null;
  const idProduct: number = indexRow.id_product;
  const urlPath: string = indexRow.url_path ?? '';

  // Step 3: fetch the product name.
  const { data: product } = await supabase
    .from('cardmarket_products')
    .select('id_product, name')
    .eq('id_product', idProduct)
    .single();

  const cardName: string = product?.name ?? '';

  // Step 4: build the canonical S3 image URL.
  // Pattern: https://product-images.s3.cardmarket.com/51/{set_prefix}/{idProduct}/{idProduct}.jpg
  // The set_prefix is encoded in url_path; derive it as a fallback by parsing.
  // A simpler, robust path: just use {idProduct}/{idProduct}.jpg without the set prefix
  // — Cardmarket S3 also serves the image under that flat path.
  const imageUrl = `${CM_IMG_BASE}/${idProduct}/${idProduct}.jpg`;

  return {
    cardmarket_id: String(idProduct),
    cardmarket_url_path: urlPath,
    card_name: cardName,
    set_name: setNameEn ?? '',
    set_name_ja: language.toLowerCase() === 'ja' ? setNameJa : null,
    tcg_image_url: imageUrl,
  };
}
```

#### Step 6.4 — Run the test to verify it passes

- [ ] Run: `npx vitest run lib/api/cardmarket-enrich.test.ts`
- [ ] Expected: 3 tests PASS.

#### Step 6.5 — Stage and propose commit

- [ ] Run: `git add lib/api/cardmarket-enrich.ts lib/api/cardmarket-enrich.test.ts`
- [ ] Propose commit message:
  ```
  feat(enrich): add Strategy 0 cardmarket-only lookup module with TDD
  ```

### Task 7: Wire Strategy 0 into /api/enrich

**Files:**
- Modify: `app/api/enrich/route.ts`

#### Step 7.1 — Add the import + Strategy 0 call

- [ ] In `app/api/enrich/route.ts`, near the top of the file (after the existing strategy imports), add:

```ts
import { lookupCardmarketStrategy0 } from '@/lib/api/cardmarket-enrich';
```

- [ ] Locate where the strategy chain runs. The function dispatches strategies in order; insert a new `strategyCardmarketIndex` BEFORE `strategyCatalogByCode` (line ~187). Add this function:

```ts
async function strategyCardmarketIndex(ctx: StrategyContext): Promise<EnrichResult | null> {
  const { ocr, supabase } = ctx;
  if (!ocr.set_name || !ocr.set_number || !ocr.language) return null;
  const hit = await lookupCardmarketStrategy0(supabase, {
    setName: ocr.set_name,
    setNumber: String(ocr.set_number),
    language: ocr.language.toLowerCase(),
  });
  if (!hit) return null;
  return {
    bestMatch: {
      source: 'cardmarket-index',
      confidence: 0.95,
      card: {
        cardmarket_id: hit.cardmarket_id,
        card_name: hit.card_name,
        set_name: hit.set_name,
        set_name_ja: hit.set_name_ja,
        tcg_image_url: hit.tcg_image_url,
        // Other fields (rarity, pokemon_number, illustrator) intentionally
        // left null — TCGdex strategies will fill them via the merge below.
      } as Partial<EnrichedCard> as EnrichedCard,
    },
  };
}
```

- [ ] In the dispatch chain, prepend Strategy 0 before the existing strategies. Find the section that orchestrates the strategies (sequential `if (result) return result`). Add at the top:

```ts
// Strategy 0: local Cardmarket lookup (fast path, no network).
const cmIndexResult = await strategyCardmarketIndex(ctx);
// Continue to TCGdex strategies regardless — they fill complementary fields
// (rarity, pokemon_number, illustrator). We MERGE if both hit.
let bestMatch = cmIndexResult?.bestMatch ?? null;
```

- [ ] After all existing strategies have run and produced their `bestMatch`, MERGE: cardmarket fields take precedence for `cardmarket_id`/`set_name`/`set_name_ja`/`card_name`/`tcg_image_url`; TCGdex fields fill `rarity`/`pokemon_number`/`illustrator`/`pokemon_name`. Use this exact merge helper, added as a top-level function:

```ts
function mergeBestMatches(
  cm: BestMatch | null,
  tcg: BestMatch | null,
): BestMatch | null {
  if (!cm && !tcg) return null;
  if (!tcg) return cm;
  if (!cm) return tcg;
  return {
    source: `${cm.source}+${tcg.source}`,
    confidence: Math.max(cm.confidence, tcg.confidence),
    card: {
      ...tcg.card,
      // Cardmarket wins for these fields:
      cardmarket_id: cm.card.cardmarket_id ?? tcg.card.cardmarket_id,
      set_name: cm.card.set_name ?? tcg.card.set_name,
      set_name_ja: cm.card.set_name_ja ?? tcg.card.set_name_ja,
      card_name: cm.card.card_name ?? tcg.card.card_name,
      tcg_image_url: cm.card.tcg_image_url ?? tcg.card.tcg_image_url,
    },
  };
}
```

- [ ] Replace the final return of the orchestration with: `return { bestMatch: mergeBestMatches(cmIndexResult?.bestMatch ?? null, bestMatch) };` (where `bestMatch` is the result of the existing TCGdex strategies).

#### Step 7.2 — Verify TypeScript compiles + lint passes

- [ ] Run: `npx tsc --noEmit && npx eslint app/api/enrich/route.ts`
- [ ] Expected: zero errors / warnings. If the existing `BestMatch` / `EnrichedCard` types don't yet have `set_name_ja`, add it in `lib/types/index.ts` (already done in Task 1) — confirm.

#### Step 7.3 — Run the full test suite

- [ ] Run: `npx vitest run`
- [ ] Expected: all existing tests continue to pass + 3 new cardmarket-enrich tests + 4+ format-name tests.

#### Step 7.4 — Stage and propose commit

- [ ] Run: `git add app/api/enrich/route.ts`
- [ ] Propose commit message:
  ```
  feat(enrich): wire Strategy 0 cardmarket-index lookup as primary, merge with TCGdex fallback
  ```

### Task 8: Constrained OCR prompt

**Files:**
- Modify: `lib/api/gemini-vision.ts`

#### Step 8.1 — Add an expansion-list loader

- [ ] In `lib/api/gemini-vision.ts`, near the top imports, add:

```ts
import { createClient } from '@supabase/supabase-js';

let cachedExpansionList: string[] | null = null;

async function getExpansionConstraintList(): Promise<string[]> {
  if (cachedExpansionList) return cachedExpansionList;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await supabase
    .from('cardmarket_expansions')
    .select('name, name_en, name_ja');
  if (!data) return [];
  const set = new Set<string>();
  for (const row of data) {
    if (row.name) set.add(row.name);
    if (row.name_en) set.add(row.name_en);
    if (row.name_ja) set.add(row.name_ja);
  }
  cachedExpansionList = Array.from(set).sort();
  return cachedExpansionList;
}
```

#### Step 8.2 — Append the constraint section to PROMPT

- [ ] Replace the line `const PROMPT = \`...\`;` (currently around line 59-90) with a function that builds the prompt dynamically. Replace the entire block from `const PROMPT = \`Lis...` to the closing backtick `}\`;` (line 90) with:

```ts
async function buildPrompt(): Promise<string> {
  const list = await getExpansionConstraintList();
  const constraintBlock = list.length > 0
    ? `

CONTRAINTE EXTENSION — Le champ "set_name" DOIT correspondre EXACTEMENT à un des noms suivants (copie verbatim, accents et casse respectés). Si tu ne peux pas identifier le set avec une confiance > 80%, retourne null pour set_name plutôt qu'inventer.

Liste exhaustive (${list.length} entrées):
${list.map((n) => `- ${n}`).join('\n')}
`
    : '';

  return BASE_PROMPT + constraintBlock;
}

const BASE_PROMPT = `Lis une carte Pokémon JCC. Extrais ce qui est IMPRIMÉ sur la carte, ne traduis pas vers une autre langue. NE DEVINE PAS — si non lisible, mets null (sauf champs requis).

LOCALISATION :
- Numéro XXX/YYY (ex 012/086, 199/198, 175/175) : en bas, souvent à droite. Sans zéros initiaux dans la sortie.
- set_code : court code alphanumérique imprimé en bas, soit collé au numéro (cartes JP), soit dans un bloc séparé en bas-gauche près du logo de set (cartes EN/FR/DE/IT/ES/PT modernes).
- Nom du Pokémon : en HAUT.

CODES DE SET PAR LANGUE — extrais ce qui est imprimé, JAMAIS l'équivalent d'une autre langue :
- JP : codes mixed-case avec suffixes lettres → sv11W, s12a, BW4, sm8b, sv8a, XY9, smp, xyp
- EN : codes uppercase 3 lettres → OBF, MEW, JTG, SCR, PRE, PAL, BKP, BKT, AOR, STS, GEN, FCO, EVO, SVI
- FR/DE/IT/ES/PT : MÊMES codes uppercase 3 lettres que EN (BKP, OBF, MEW, SCR, PRE, JTG, …)
- CN (chinois) : codes 'cs'+suffixe → cs4bc, cs4aC, cs1c, csm1a (équivalent ZH)
- KO : codes similaires à JP ou EN selon la série

⚠️ ANTI-PIÈGE : si la carte est en alphabet latin (Pikachu, Dracaufeu, …), le set_code est OBLIGATOIREMENT en format EN/FR (3 lettres UPPERCASE comme BKP, OBF, MEW). N'INVENTE PAS de code JP (XY9, sv11W, BW5) sur une carte FR/EN — ce serait une hallucination.

{
  "card_name": "<nom haut, ex 'チャオブー' (JP), 'Pikachu ex' (EN), 'Dracaufeu ex' (FR)>",
  "pokemon_name": "<sans suffixe ex/V/VMAX, ex 'Pikachu' / 'Dracaufeu'>",
  "set_code": "<code exact tel qu'imprimé, casse sensible>",
  "set_number": "<XXX sans zéros initiaux: '12' pas '012'>",
  "set_total": <YYY ou null>,
  "language": "<JP|EN|FR|KO|CN (utilise CN pour chinois, pas ZH)>",
  "rarity": "<Common|Uncommon|Rare|Holo Rare|Double Rare|Ultra Rare|Art Rare|Special Art Rare|Secret Rare|Hyper Rare|Promo|Other ou null>",
  "confidence": "high|medium|low",
  "pokemon_number": <national dex 1-1025 si Pokémon, null pour Trainer/Energy/Stadium>,
  "pokemon_name_fr": "<nom FR standard (ex 'Gruikui', 'Dracaufeu'), null si non-Pokémon ou incertain>",
  "card_name_fr": "<traduction FR du nom COMPLET de la carte (ex 'Dracaufeu ex' pour 'リザードンex', 'Le Plan de N' pour 'Nの筋書き', 'Marnie' identique). Null si carte d\\u00e9j\\u00e0 en FR ou si traduction incertaine>",
  "set_name": "<nom extension imprimé (ex 'White Flare', 'BREAKpoint'), null si invisible>",
  "set_name_fr": "<traduction FR (ex 'Combat de Maîtres', 'Rupture Turbo'), null si incertain>",
  "illustrator": "<crédit illustrateur en bas de carte (ex 'Ryuta Fuse', 'YASHIRO Nanaco', 'kirisAki'), null si illisible>"
}`;
```

- [ ] In the function that calls Gemini (it currently uses `PROMPT` directly), replace `PROMPT` references with `await buildPrompt()`. The exact change depends on where PROMPT is consumed — locate the `generationConfig` block (line ~195) and ensure the prompt sent uses the dynamically-built version.

#### Step 8.3 — Verify TypeScript compiles + tests pass

- [ ] Run: `npx tsc --noEmit && npx vitest run lib/api/gemini-vision.test.ts`
- [ ] Expected: existing gemini-vision tests pass (no behavior change for normal calls; the constraint list just adds suffix to the prompt).

#### Step 8.4 — Stage and propose commit

- [ ] Run: `git add lib/api/gemini-vision.ts`
- [ ] Propose commit message:
  ```
  feat(ocr): inject expansion constraint list into Gemini prompt to reduce set_name hallucinations
  ```

---

## Phase D — Frontend integration

### Task 9: Mount CardMatchPreview + use display helpers

**Files:**
- Modify: `components/submit/CardScanForm.tsx`
- Modify: card list components that display names (e.g. `components/vinted/VintedRow.tsx`, `components/stock/StockList.tsx`, `components/pokedex/PokedexCell.tsx`)

#### Step 9.1 — Mount CardMatchPreview in CardScanForm

- [ ] In `components/submit/CardScanForm.tsx`, locate the existing `<PokemonSpriteBadge>` render block. It looks like:

```tsx
                    <PokemonSpriteBadge
                      pokemonNumber={form.pokemon_number === '' ? null : Number(form.pokemon_number)}
                      className="absolute top-2 right-2 z-10"
                    />
```

- [ ] Add the import at the top: `import CardMatchPreview from '@/components/scanner/CardMatchPreview';`
- [ ] Directly after the closing `/>` of the `<PokemonSpriteBadge>`, add:

```tsx
                    <CardMatchPreview
                      imageUrl={form.tcg_image_url}
                      className="absolute bottom-2 right-2 z-10"
                    />
```

#### Step 9.2 — Use display helpers in card lists

- [ ] In each of these files, replace direct reads of `card.pokemon_name` / `card.card_name` / `card.set_name` with the corresponding helper:
  - `components/vinted/VintedRow.tsx`
  - `components/stock/StockList.tsx`
  - `components/pokedex/PokedexCell.tsx`
  - `components/dashboard/LastSalesList.tsx`
  - `components/dashboard/TopRaresList.tsx`
  - `components/dashboard/PokedexCount.tsx`

- [ ] In each file: add `import { displayPokemonName, displayCardName, displaySetName } from '@/lib/utils/format-name';`.
- [ ] Wherever the JSX renders `{card.pokemon_name}`, replace with `{displayPokemonName(card)}`. Same for `{card.card_name}` → `{displayCardName(card)}` and `{card.set_name}` → `{displaySetName(card)}`.

The exact line numbers vary per file. Use grep to find each occurrence: `grep -rn "card.pokemon_name\|card.card_name\|card.set_name" components/vinted components/stock components/pokedex components/dashboard`.

#### Step 9.3 — Verify TypeScript compiles + lint + tests pass

- [ ] Run: `npx tsc --noEmit && npx eslint components/ && npx vitest run`
- [ ] Expected: zero errors, all 422+ tests passing.

#### Step 9.4 — Stage and propose commit

- [ ] Run: `git add components/`
- [ ] Propose commit message:
  ```
  feat(ui): use display helpers + mount CardMatchPreview in scanner overlay
  ```

---

## Self-Review Checklist (writer's verification before handoff)

- [x] **Spec coverage:**
  - Storage model (cards.pokemon_name_ocr, card_name_ocr, set_name_ja + cardmarket_expansions.name_en, name_ja) → Task 1
  - Display helpers (displayPokemonName, displayCardName, displaySetName) → Task 3
  - Strategy 0 cardmarket lookup → Tasks 6 + 7
  - Constrained OCR prompt with expansion list → Task 8
  - CardMatchPreview component → Task 4 + Task 9
  - BatchForm thumbnail fix → Task 2
  - Pre-populate name_en/name_ja from EN/JA dropdowns → Task 5
  - Display layer integration in card lists → Task 9
- [x] **Placeholder scan:** No "TBD" / "TODO" / vague steps. All code blocks complete.
- [x] **Type consistency:**
  - `Card` interface extended in Task 1 (Step 1.3) with the 3 new columns; helpers in Task 3 reference these names.
  - `CardmarketLookupResult` in Task 6 returns fields that Task 7 maps into `EnrichedCard`.
  - `mergeBestMatches` in Task 7 uses field names matching `BestMatch`.
- [x] **No new top-level dependencies:** all changes use existing packages (jsdom for the script, supabase-js, react, vitest).
- [x] **Phases ordered correctly:** Phase A (DB) blocks Phase C (Strategy 0 needs columns). Phase B is parallel-safe. Phase D depends on B + C.
