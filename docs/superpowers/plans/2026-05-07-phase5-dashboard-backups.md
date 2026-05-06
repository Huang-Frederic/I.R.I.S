# Phase 5 — Dashboard + Backups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Phase 5 Dashboard (4 graphs + 2 tables with mandatory cost graph), a one-shot snapshot of the tcg_catalog enrichment data, and two backup mechanisms (manual via /options + automatic daily via GitHub Action).

**Architecture:** Server components do parallel Supabase queries and pass raw data to client components for charting (Recharts). Two new tables (`ocr_usage_log` + `stock_value_snapshots`) feed the cost & stock-value graphs. Automated backups produce `pg_dump --data-only` SQL gzipped and uploaded as GitHub Releases; manual backups produce JSON gzipped files in a private Supabase Storage bucket.

**Tech Stack:** Next.js 16 (App Router) + TypeScript + Tailwind v4 + Supabase (postgres + storage) + Recharts + Vitest + GitHub Actions.

**Spec source:** `docs/superpowers/specs/2026-05-07-phase5-dashboard-backups-design.md`

**Execution order:** A (foundations) → B (snapshot catalog) → C (OCR tracking) → D (stock snapshot cron) → E (dashboard) → F (manual backup) → G (auto backup). C/D wire data collection BEFORE Dashboard (E) ships so there's data to display by then.

---

## File Structure

### New files

| Path | Purpose |
|---|---|
| `supabase/migrations/20260507000000_phase5_dashboard.sql` | Tables `ocr_usage_log` + `stock_value_snapshots` + RLS reads |
| `supabase/migrations/20260507100000_phase5_manual_backups_bucket.sql` | Private bucket `manual-backups/` |
| `lib/constants/pricing.ts` | `PRICE_COEFFICIENT` extracted |
| `lib/utils/validate-card-form.ts` | Pure card form validator (factored) |
| `lib/utils/validate-card-form.test.ts` | Tests for the validator |
| `lib/utils/ocr-cost.ts` | Vision cost calculator + Gemini cost re-export |
| `lib/utils/ocr-cost.test.ts` | Tests for cost calculator |
| `lib/utils/dashboard-queries.ts` | Pure aggregators (rarity counts, top rares, scan heatmap matrix) |
| `lib/utils/dashboard-queries.test.ts` | Tests for the aggregators |
| `lib/utils/stock-value.ts` | Pure helper computing stock values from a `Card[]` |
| `lib/utils/stock-value.test.ts` | Tests |
| `lib/utils/manual-dump.ts` | Pure helper building the JSON dump structure |
| `lib/utils/manual-dump.test.ts` | Tests |
| `app/(app)/dashboard/page.tsx` | Server component, parallel queries |
| `components/dashboard/DashboardKpiStrip.tsx` | Pure 4-tile KPI strip |
| `components/dashboard/CostBarChart.tsx` | Recharts bar stacked daily |
| `components/dashboard/StockValueLineChart.tsx` | Recharts area chart |
| `components/dashboard/RarityDonut.tsx` | Recharts donut with drill-down |
| `components/dashboard/ScanHeatmap.tsx` | Custom SVG heatmap 52×7 (no recharts dep) |
| `components/dashboard/TopRaresList.tsx` | List with PokedexDrawer drill |
| `components/dashboard/RestockAlertsList.tsx` | Server reads alerts + renders list |
| `components/options/ManualBackupSection.tsx` | Server component, lists existing manual backups |
| `components/options/ManualBackupButton.tsx` | Client component, button + confirm modal |
| `app/api/backup/manual/route.ts` | POST creates dump, GET lists existing |
| `app/api/backup/manual/[filename]/route.ts` | GET signed URL, DELETE |
| `scripts/snapshot-catalog.ts` | Dumps `tcg_catalog` + `rarity_ranks` to `backups/` |
| `scripts/restore-catalog.ts` | Restores from `backups/` (with confirm prompt) |
| `scripts/snapshot-catalog.test.ts` | Round-trip test |
| `backups/tcg_catalog.jsonl.gz` | Generated snapshot (initial commit during Phase 5) |
| `backups/rarity_ranks.json` | Generated snapshot |
| `backups/README.md` | Restore workflow docs (manual + auto) |
| `.github/workflows/backup.yml` | Daily backup workflow |
| `scripts/backup/rotate.sh` | Rotation logic for releases |

### Modified files

| Path | Change |
|---|---|
| `app/api/cards/route.ts` | Use `validateCardForm()` + import `PRICE_COEFFICIENT` |
| `app/api/cards/batch/route.ts` | Same factorization |
| `app/api/ocr/route.ts` | Insert `ocr_usage_log` row after each scan |
| `app/api/prices/update/route.ts` | UPSERT into `stock_value_snapshots` after bulk run |
| `app/(app)/options/page.tsx` | Mount `<ManualBackupSection>` |
| `components/layout/nav-items.ts` | Add `/dashboard` entry |
| `package.json` | Add scripts + Recharts dep |
| `vercel.json` | (no change — pricing cron stays as is) |

---

## Phase A — Foundations (migrations + tech debt)

### Task A1: Phase 5 migration (ocr_usage_log + stock_value_snapshots)

**Files:**
- Create: `supabase/migrations/20260507000000_phase5_dashboard.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- supabase/migrations/20260507000000_phase5_dashboard.sql
-- Phase 5 — Dashboard data collection tables.

create table ocr_usage_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  engine text not null check (engine in ('gemini', 'vision')),
  tokens_in int,
  tokens_out int,
  cost_eur numeric(10, 6) not null default 0,
  card_id uuid references cards (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null
);

create index ocr_usage_log_created_at_idx on ocr_usage_log (created_at desc);

alter table ocr_usage_log enable row level security;

-- Reads partagés entre les 2 users (cost total est une donnée commune).
-- Writes uniquement via service-role (route OCR côté serveur).
create policy ocr_usage_log_read on ocr_usage_log
  for select using (auth.uid() is not null);

create table stock_value_snapshots (
  date date primary key,
  value_for_sale numeric(12, 2) not null default 0,
  value_collection numeric(12, 2) not null default 0,
  count_for_sale int not null default 0,
  count_collection int not null default 0,
  created_at timestamptz not null default now()
);

alter table stock_value_snapshots enable row level security;

create policy stock_value_snapshots_read on stock_value_snapshots
  for select using (auth.uid() is not null);
```

- [ ] **Step 2: Document apply step (no auto-apply)**

The repo doesn't run `supabase db push` automatically (no Supabase CLI in CI). Add a note for the human operator:

```bash
# After commit, apply manually:
# 1. Open Supabase Studio → SQL Editor
# 2. Paste the migration content
# 3. Run
```

This step is just for the implementer's own awareness — no code change.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260507000000_phase5_dashboard.sql
git commit -m "feat(phase5): migration ocr_usage_log + stock_value_snapshots"
```

---

### Task A2: Extract PRICE_COEFFICIENT

**Files:**
- Create: `lib/constants/pricing.ts`
- Modify: `app/api/cards/route.ts:47` (remove inline const, import from new module)
- Modify: `app/api/cards/batch/route.ts` (same — search for `0.85` near `cm_price_trend`)

- [ ] **Step 1: Create the constants module**

```typescript
// lib/constants/pricing.ts

/**
 * Coefficient applied to Cardmarket trend price to derive the suggested
 * Vinted price. Single source of truth — both the form-save routes and
 * the daily cron (if it ever computes suggestions) must read from here.
 */
export const PRICE_COEFFICIENT = 0.85;
```

- [ ] **Step 2: Update `app/api/cards/route.ts`**

Replace line 47:
```typescript
const PRICE_COEFFICIENT = 0.85;
```
with:
```typescript
import { PRICE_COEFFICIENT } from '@/lib/constants/pricing';
```
(add the import near the other `import`s at the top, remove the inline const).

- [ ] **Step 3: Update `app/api/cards/batch/route.ts`**

Find the matching `0.85` literal (likely also assigned to `PRICE_COEFFICIENT`) and replace the same way.

- [ ] **Step 4: Run typecheck + tests**

```bash
npm run typecheck && npm test
```
Expected: PASS, no regressions (existing 316 tests still green).

- [ ] **Step 5: Commit**

```bash
git add lib/constants/pricing.ts app/api/cards/route.ts app/api/cards/batch/route.ts
git commit -m "refactor(cards): extract PRICE_COEFFICIENT to lib/constants/pricing"
```

---

### Task A3: Factor validate-card-form

**Files:**
- Create: `lib/utils/validate-card-form.ts`
- Create: `lib/utils/validate-card-form.test.ts`
- Modify: `app/api/cards/route.ts` (replace ~lines 7-108 with `validateCardForm()` call)
- Modify: `app/api/cards/batch/route.ts` (same)

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/utils/validate-card-form.test.ts
import { describe, expect, it } from 'vitest';
import { validateCardForm } from './validate-card-form';

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

describe('validateCardForm', () => {
  it('returns valid result for a complete for_sale card', () => {
    const result = validateCardForm(
      form({
        card_name: 'Pikachu',
        pokemon_number: '25',
        language: 'JP',
        rarity: 'AR',
        condition: 'NM',
        status: 'for_sale',
      }),
    );
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.parsed.card_name).toBe('Pikachu');
      expect(result.parsed.pokemon_number).toBe(25);
      expect(result.parsed.language).toBe('JP');
      expect(result.parsed.status).toBe('for_sale');
    }
  });

  it('rejects when card_name is missing', () => {
    const result = validateCardForm(
      form({ language: 'JP', rarity: 'AR' }),
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toMatch(/card_name/);
      expect(result.status).toBe(400);
    }
  });

  it('rejects pokemon_number out of range', () => {
    const result = validateCardForm(
      form({
        card_name: 'X',
        pokemon_number: '9999',
        language: 'JP',
        rarity: 'AR',
      }),
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toMatch(/pokemon_number/);
    }
  });

  it('accepts null pokemon_number for non-Pokémon cards (Trainers)', () => {
    const result = validateCardForm(
      form({
        card_name: "N's Plan",
        language: 'JP',
        rarity: 'UC',
      }),
    );
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.parsed.pokemon_number).toBeNull();
    }
  });

  it('rejects status=pokedex when pokemon_number is null', () => {
    const result = validateCardForm(
      form({
        card_name: 'Trainer',
        language: 'JP',
        rarity: 'C',
        status: 'pokedex',
      }),
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toMatch(/pokedex/);
    }
  });

  it('defaults condition=NM and status=for_sale when omitted', () => {
    const result = validateCardForm(
      form({ card_name: 'X', language: 'JP', rarity: 'C' }),
    );
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.parsed.condition).toBe('NM');
      expect(result.parsed.status).toBe('for_sale');
    }
  });

  it('rejects status=sold (only set internally on sale)', () => {
    const result = validateCardForm(
      form({
        card_name: 'X',
        language: 'JP',
        rarity: 'C',
        status: 'sold',
      }),
    );
    expect(result.valid).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- validate-card-form
```
Expected: FAIL — module does not exist yet.

- [ ] **Step 3: Implement validateCardForm**

```typescript
// lib/utils/validate-card-form.ts
import type { CardCondition, CardLanguage, CardRarity, CardStatus } from '@/lib/types';

const LANGUAGES: ReadonlySet<CardLanguage> = new Set([
  'JP', 'EN', 'FR', 'DE', 'IT', 'ES', 'KO', 'PT', 'ZH', 'CN',
]);
const CONDITIONS: ReadonlySet<CardCondition> = new Set(['NM', 'EX', 'GD', 'PL', 'PO']);
const STATUSES: ReadonlySet<CardStatus> = new Set(['pokedex', 'for_sale', 'collection', 'sold']);
const RARITIES: ReadonlySet<CardRarity> = new Set([
  'SAR', 'AR', 'SR', 'CHR', 'RR', 'R_HOLO', 'R', 'UC', 'C', 'OTHER',
]);

export interface ParsedCardForm {
  card_name: string;
  pokemon_name: string | null;
  pokemon_number: number | null;
  language: CardLanguage;
  rarity: CardRarity;
  condition: CardCondition;
  status: Exclude<CardStatus, 'sold'>;
}

export type ValidateCardFormResult =
  | { valid: true; parsed: ParsedCardForm }
  | { valid: false; error: string; status: number };

function str(form: FormData, key: string): string | null {
  const value = form.get(key);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function validateCardForm(formData: FormData): ValidateCardFormResult {
  const card_name = str(formData, 'card_name');
  if (!card_name) return { valid: false, error: 'card_name est requis', status: 400 };

  const pokemon_name = str(formData, 'pokemon_name');
  const pokemon_number_raw = str(formData, 'pokemon_number');

  let pokemon_number: number | null = null;
  if (pokemon_number_raw !== null && pokemon_number_raw !== '') {
    const parsed = Number(pokemon_number_raw);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 1025) {
      return { valid: false, error: 'pokemon_number doit être entre 1 et 1025', status: 400 };
    }
    pokemon_number = parsed;
  }

  const language = str(formData, 'language') as CardLanguage | null;
  if (!language || !LANGUAGES.has(language)) {
    return { valid: false, error: 'language invalide', status: 400 };
  }

  const rarity = str(formData, 'rarity') as CardRarity | null;
  if (!rarity || !RARITIES.has(rarity)) {
    return { valid: false, error: 'rarity invalide', status: 400 };
  }

  const condition = (str(formData, 'condition') as CardCondition | null) ?? 'NM';
  if (!CONDITIONS.has(condition)) {
    return { valid: false, error: 'condition invalide', status: 400 };
  }

  const status = (str(formData, 'status') as CardStatus | null) ?? 'for_sale';
  if (!STATUSES.has(status) || status === 'sold') {
    return { valid: false, error: 'status invalide', status: 400 };
  }

  if (status === 'pokedex' && pokemon_number === null) {
    return {
      valid: false,
      error: 'pokemon_number requis pour status=pokedex',
      status: 400,
    };
  }

  return {
    valid: true,
    parsed: {
      card_name,
      pokemon_name,
      pokemon_number,
      language,
      rarity,
      condition,
      status: status as Exclude<CardStatus, 'sold'>,
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- validate-card-form
```
Expected: PASS, all 7 cases green.

- [ ] **Step 5: Refactor `app/api/cards/route.ts` to use it**

Replace the inline LANGUAGES/CONDITIONS/STATUSES/RARITIES sets, the `str`/`num` helpers (keep `num` since it's still used for prices), and the validation block (lines ~65-108) with:

```typescript
import { validateCardForm } from '@/lib/utils/validate-card-form';
// (keep PRICE_COEFFICIENT import from previous task)

// Inside POST, after auth check:
const validation = validateCardForm(formData);
if (!validation.valid) {
  return NextResponse.json({ error: validation.error }, { status: validation.status });
}
const { card_name, pokemon_name, pokemon_number, language, rarity, condition, status } = validation.parsed;
```

Keep the `num()` helper (used for prices) and the rest of the file (image upload, pricing computation, conflict resolution) unchanged.

- [ ] **Step 6: Same refactor in `app/api/cards/batch/route.ts`**

Apply the same swap. The batch route validates per-row in a loop — call `validateCardForm` once on the shared form fields (the per-card variation is image + qty, not the validation fields).

- [ ] **Step 7: Run all tests + typecheck**

```bash
npm run typecheck && npm test
```
Expected: PASS, no regression in cards route tests.

- [ ] **Step 8: Commit**

```bash
git add lib/utils/validate-card-form.ts lib/utils/validate-card-form.test.ts app/api/cards/route.ts app/api/cards/batch/route.ts
git commit -m "refactor(cards): factor validateCardForm out of POST + batch routes"
```

---

## Phase B — Snapshot tcg_catalog (sub-projet 2)

### Task B1: snapshot-catalog.ts script

**Files:**
- Create: `scripts/snapshot-catalog.ts`

- [ ] **Step 1: Write the script**

```typescript
// scripts/snapshot-catalog.ts
//
// Streams all rows of tcg_catalog + rarity_ranks to versioned files
// in backups/. Run after every full re-scrape.
//
// Usage: npm run snapshot-catalog

import 'dotenv/config';
import { createWriteStream, writeFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { createServiceClient } from '../lib/supabase/service';

const BACKUPS_DIR = path.resolve(__dirname, '..', 'backups');
const PAGE_SIZE = 1000;

async function snapshotTcgCatalog(): Promise<number> {
  const service = createServiceClient();
  const out = createWriteStream(path.join(BACKUPS_DIR, 'tcg_catalog.jsonl.gz'));
  const gzip = createGzip();

  const lineGenerator = async function* () {
    let from = 0;
    let total = 0;
    while (true) {
      const { data, error } = await service
        .from('tcg_catalog')
        .select('*')
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(`tcg_catalog read failed: ${error.message}`);
      if (!data || data.length === 0) break;
      for (const row of data) {
        yield JSON.stringify(row) + '\n';
        total += 1;
      }
      if (data.length < PAGE_SIZE) {
        return total;
      }
      from += PAGE_SIZE;
    }
    return total;
  };

  let count = 0;
  const source = Readable.from(
    (async function* () {
      const gen = lineGenerator();
      for await (const line of gen) {
        count += 1;
        yield line;
      }
    })(),
  );

  await pipeline(source, gzip, out);
  return count;
}

async function snapshotRarityRanks(): Promise<number> {
  const service = createServiceClient();
  const { data, error } = await service.from('rarity_ranks').select('*');
  if (error) throw new Error(`rarity_ranks read failed: ${error.message}`);
  writeFileSync(
    path.join(BACKUPS_DIR, 'rarity_ranks.json'),
    JSON.stringify(data ?? [], null, 2),
  );
  return data?.length ?? 0;
}

async function main(): Promise<void> {
  mkdirSync(BACKUPS_DIR, { recursive: true });

  console.log('[snapshot-catalog] starting…');
  const catalogCount = await snapshotTcgCatalog();
  console.log(`  ✓ tcg_catalog: ${catalogCount} rows → backups/tcg_catalog.jsonl.gz`);

  const rarityCount = await snapshotRarityRanks();
  console.log(`  ✓ rarity_ranks: ${rarityCount} rows → backups/rarity_ranks.json`);

  console.log('[snapshot-catalog] done. Commit backups/ to git.');
}

main().catch((err) => {
  console.error('[snapshot-catalog] FAILED:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Add tsx dev dep + scripts entry**

Update `package.json`:

```json
{
  "scripts": {
    ...,
    "snapshot-catalog": "tsx scripts/snapshot-catalog.ts",
    "restore-catalog": "tsx scripts/restore-catalog.ts"
  },
  "devDependencies": {
    ...,
    "tsx": "^4.19.0"
  }
}
```

```bash
npm install
```

- [ ] **Step 3: Verify the script imports compile**

```bash
npx tsc --noEmit scripts/snapshot-catalog.ts
```
Expected: no errors. (Run won't actually execute it — just type-check.)

- [ ] **Step 4: Commit**

```bash
git add scripts/snapshot-catalog.ts package.json package-lock.json
git commit -m "feat(scripts): snapshot-catalog dumps tcg_catalog + rarity_ranks to backups/"
```

---

### Task B2: restore-catalog.ts script

**Files:**
- Create: `scripts/restore-catalog.ts`

- [ ] **Step 1: Write the restore script**

```typescript
// scripts/restore-catalog.ts
//
// Restores tcg_catalog + rarity_ranks from backups/.
// Asks for confirmation before TRUNCATEing.
//
// Usage: npm run restore-catalog

import 'dotenv/config';
import { createReadStream, readFileSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { createServiceClient } from '../lib/supabase/service';

const BACKUPS_DIR = path.resolve(__dirname, '..', 'backups');
const CHUNK_SIZE = 500;

async function countSnapshotRows(): Promise<number> {
  const stream = createReadStream(path.join(BACKUPS_DIR, 'tcg_catalog.jsonl.gz')).pipe(
    createGunzip(),
  );
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let count = 0;
  for await (const line of rl) {
    if (line.trim()) count += 1;
  }
  return count;
}

async function confirm(message: string): Promise<boolean> {
  if (process.env.SKIP_CONFIRM === '1') return true;
  process.stdout.write(message + ' [y/N] ');
  const answer = await new Promise<string>((resolve) => {
    process.stdin.once('data', (data) => resolve(data.toString().trim().toLowerCase()));
  });
  return answer === 'y' || answer === 'yes';
}

async function restoreTcgCatalog(): Promise<number> {
  const service = createServiceClient();

  const { error: truncErr } = await service.rpc('truncate_tcg_catalog');
  // Fallback: if RPC doesn't exist, use a service-level DELETE
  if (truncErr) {
    const { error: delErr } = await service.from('tcg_catalog').delete().neq('id', 0);
    if (delErr) throw new Error(`truncate fallback failed: ${delErr.message}`);
  }

  const stream = createReadStream(path.join(BACKUPS_DIR, 'tcg_catalog.jsonl.gz')).pipe(
    createGunzip(),
  );
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  let buffer: unknown[] = [];
  let total = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    buffer.push(JSON.parse(line));
    if (buffer.length >= CHUNK_SIZE) {
      const { error } = await service.from('tcg_catalog').insert(buffer);
      if (error) throw new Error(`insert chunk failed: ${error.message}`);
      total += buffer.length;
      buffer = [];
      process.stdout.write(`  inserted ${total} rows…\r`);
    }
  }
  if (buffer.length > 0) {
    const { error } = await service.from('tcg_catalog').insert(buffer);
    if (error) throw new Error(`insert final chunk failed: ${error.message}`);
    total += buffer.length;
  }
  process.stdout.write('\n');
  return total;
}

async function restoreRarityRanks(): Promise<number> {
  const service = createServiceClient();
  const rows = JSON.parse(
    readFileSync(path.join(BACKUPS_DIR, 'rarity_ranks.json'), 'utf-8'),
  ) as unknown[];
  const { error: delErr } = await service.from('rarity_ranks').delete().neq('rarity', '');
  if (delErr) throw new Error(`rarity_ranks delete failed: ${delErr.message}`);
  if (rows.length > 0) {
    const { error } = await service.from('rarity_ranks').insert(rows);
    if (error) throw new Error(`rarity_ranks insert failed: ${error.message}`);
  }
  return rows.length;
}

async function main(): Promise<void> {
  console.log('[restore-catalog] reading snapshot…');
  const expectedCount = await countSnapshotRows();
  console.log(`  snapshot contains ${expectedCount} tcg_catalog rows`);

  const ok = await confirm(
    `About to TRUNCATE tcg_catalog + rarity_ranks and restore ${expectedCount} rows. Continue?`,
  );
  if (!ok) {
    console.log('Aborted.');
    process.exit(0);
  }

  const inserted = await restoreTcgCatalog();
  console.log(`  ✓ tcg_catalog: ${inserted} rows restored`);

  const rarityCount = await restoreRarityRanks();
  console.log(`  ✓ rarity_ranks: ${rarityCount} rows restored`);

  console.log('[restore-catalog] done.');
}

main().catch((err) => {
  console.error('[restore-catalog] FAILED:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify type-check**

```bash
npx tsc --noEmit scripts/restore-catalog.ts
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add scripts/restore-catalog.ts
git commit -m "feat(scripts): restore-catalog reloads tcg_catalog + rarity_ranks"
```

---

### Task B3: Round-trip test

**Files:**
- Create: `scripts/snapshot-catalog.test.ts`

This is a unit test for the JSONL serialization/deserialization logic — NOT an integration test against a real DB.

- [ ] **Step 1: Refactor: extract pure encode/decode**

Pull the JSONL line generator into a pure helper inside `scripts/snapshot-catalog.ts`:

```typescript
// Add near the top of scripts/snapshot-catalog.ts (export for testing)
export function encodeJsonlLine(row: unknown): string {
  return JSON.stringify(row) + '\n';
}

export function decodeJsonlLine(line: string): unknown {
  return JSON.parse(line);
}
```

- [ ] **Step 2: Write the test**

```typescript
// scripts/snapshot-catalog.test.ts
import { describe, expect, it } from 'vitest';
import { encodeJsonlLine, decodeJsonlLine } from './snapshot-catalog';

describe('snapshot-catalog JSONL round-trip', () => {
  it('preserves a row through encode → decode', () => {
    const row = {
      id: 1,
      set_code: 'sv11',
      set_number: '125',
      language: 'JP',
      illustrator: 'mizue',
      pokemon_name: 'ピカチュウ',
    };
    const line = encodeJsonlLine(row);
    expect(line.endsWith('\n')).toBe(true);
    const back = decodeJsonlLine(line.trimEnd());
    expect(back).toEqual(row);
  });

  it('handles UTF-8 across all catalog languages', () => {
    const samples = [
      { lang: 'JP', name: 'リザードン' },
      { lang: 'CN', name: '喷火龙' },
      { lang: 'KO', name: '리자몽' },
      { lang: 'FR', name: 'Dracaufeu' },
    ];
    for (const row of samples) {
      const back = decodeJsonlLine(encodeJsonlLine(row).trimEnd());
      expect(back).toEqual(row);
    }
  });

  it('preserves null fields', () => {
    const row = { id: 1, illustrator: null, pokemon_number: null };
    const back = decodeJsonlLine(encodeJsonlLine(row).trimEnd());
    expect(back).toEqual(row);
  });
});
```

- [ ] **Step 3: Run test**

```bash
npm test -- snapshot-catalog
```
Expected: PASS, 3 tests green.

- [ ] **Step 4: Commit**

```bash
git add scripts/snapshot-catalog.ts scripts/snapshot-catalog.test.ts
git commit -m "test(snapshot-catalog): round-trip JSONL encode/decode"
```

---

### Task B4: backups/README.md + initial snapshot

**Files:**
- Create: `backups/README.md`
- Create: `backups/tcg_catalog.jsonl.gz` (generated)
- Create: `backups/rarity_ranks.json` (generated)

- [ ] **Step 1: Write the README**

```markdown
<!-- backups/README.md -->

# I.R.I.S — backups

## Two distinct things live here

### `tcg_catalog.jsonl.gz` + `rarity_ranks.json` — fixed enrichment data

These are versioned snapshots of the static data used to enrich scanned cards.
Regenerate after each full LimitlessTCG re-scrape:

```bash
npm run scrape -- --langs=jp,en,fr   # ~12 min (or ~3h with SCRAPE_ILLUSTRATOR=1)
npm run snapshot-catalog
git add backups/
git commit -m "snapshot tcg_catalog YYYY-MM-DD"
```

### Restore the catalog (e.g. after a wipe)

```bash
npm run restore-catalog
# Confirms before TRUNCATE. Set SKIP_CONFIRM=1 to bypass.
```

Requires `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.

## User data backups → GitHub Releases

Daily backups of `cards`, `lots`, `card_listings`, `lot_listings`,
`user_profiles`, `config`, `ocr_usage_log`, `stock_value_snapshots` run via
`.github/workflows/backup.yml` at 3 AM UTC.

Tags:
- `backup-daily-YYYY-MM-DD` (kept 30 days)
- `backup-weekly-YYYY-WXX` (kept 12 weeks, Sundays)
- `backup-monthly-YYYY-MM` (kept 12 months, 1st of month)
- `backup-manual-YYYY-MM-DD-HHMMSS` (NEVER auto-deleted) — triggered from /options

### Restore from a release backup

```bash
gh release download backup-daily-2026-05-08 --pattern '*.sql.gz' --dir /tmp
gunzip /tmp/dump.sql.gz

# The dump is --data-only — it does NOT DROP/TRUNCATE.
# Truncate first to avoid PK conflicts:
psql "$SUPABASE_DB_URL" -c "
  TRUNCATE cards, lots, card_listings, lot_listings,
           user_profiles, config, ocr_usage_log, stock_value_snapshots
  RESTART IDENTITY CASCADE;
"
psql "$SUPABASE_DB_URL" < /tmp/dump.sql
```

### Restore a manual backup (JSON format)

Manual backups (from /options) are JSON, not SQL. Use `scripts/restore-manual.ts`
(not yet implemented — out of scope v1; restore via psql + JSON parsing if needed).
```

- [ ] **Step 2: Generate the initial snapshot**

```bash
npm run snapshot-catalog
```
Expected output:
```
[snapshot-catalog] starting…
  ✓ tcg_catalog: <NNNN> rows → backups/tcg_catalog.jsonl.gz
  ✓ rarity_ranks: <N> rows → backups/rarity_ranks.json
[snapshot-catalog] done. Commit backups/ to git.
```

Verify the file size is reasonable:
```bash
ls -lh backups/
```
Expected: `tcg_catalog.jsonl.gz` between 5-15 Mo, `rarity_ranks.json` < 5 Ko.

- [ ] **Step 3: Commit the baseline snapshot**

```bash
git add backups/
git commit -m "data: initial Phase 5 snapshot of tcg_catalog + rarity_ranks"
```

---

## Phase C — OCR cost tracking foundation

### Task C1: ocr-cost helper

**Files:**
- Create: `lib/utils/ocr-cost.ts`
- Create: `lib/utils/ocr-cost.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/utils/ocr-cost.test.ts
import { describe, expect, it } from 'vitest';
import { computeVisionCostEur } from './ocr-cost';

describe('computeVisionCostEur', () => {
  it('returns 0 for 0 features', () => {
    expect(computeVisionCostEur(0)).toBe(0);
  });

  it('charges €0.001380 for 1 feature (1.5 USD/1000 × 0.92 EUR/USD)', () => {
    const result = computeVisionCostEur(1);
    expect(result).toBeCloseTo(0.00138, 6);
  });

  it('scales linearly', () => {
    const one = computeVisionCostEur(1);
    const ten = computeVisionCostEur(10);
    expect(ten).toBeCloseTo(one * 10, 6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- ocr-cost
```
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the helper**

```typescript
// lib/utils/ocr-cost.ts

/**
 * Google Vision pricing: $1.50 per 1000 features (TEXT_DETECTION).
 * Each detectText() call counts as 1 feature.
 */
const VISION_USD_PER_1K = 1.5;
const USD_TO_EUR = 0.92;

export function computeVisionCostEur(featureCount: number): number {
  return (featureCount * VISION_USD_PER_1K * USD_TO_EUR) / 1000;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- ocr-cost
```
Expected: PASS, 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/ocr-cost.ts lib/utils/ocr-cost.test.ts
git commit -m "feat(ocr-cost): Vision cost calculator (€/feature)"
```

---

### Task C2: Wire ocr_usage_log INSERT into OCR route

**Files:**
- Modify: `app/api/ocr/route.ts`

- [ ] **Step 1: Add the insert helper**

At the top of `app/api/ocr/route.ts`, add the import and a helper:

```typescript
import { createServiceClient } from '@/lib/supabase/service';
import { createClient } from '@/lib/supabase/server';
import { computeVisionCostEur } from '@/lib/utils/ocr-cost';

async function logOcrUsage(input: {
  engine: 'gemini' | 'vision';
  tokens_in: number | null;
  tokens_out: number | null;
  cost_eur: number;
}): Promise<void> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const service = createServiceClient();
    await service.from('ocr_usage_log').insert({
      engine: input.engine,
      tokens_in: input.tokens_in,
      tokens_out: input.tokens_out,
      cost_eur: input.cost_eur,
      user_id: user?.id ?? null,
    });
  } catch (err) {
    console.warn('[ocr_usage_log] insert failed (non-fatal):', err);
  }
}
```

- [ ] **Step 2: Call it after the Gemini path**

Just before `return NextResponse.json(ocrResult);` in the Gemini branch (around line 78), add:

```typescript
await logOcrUsage({
  engine: 'gemini',
  tokens_in: geminiResult._usage?.tokens_in ?? null,
  tokens_out: geminiResult._usage?.tokens_out ?? null,
  cost_eur: geminiResult._usage?.cost_eur ?? 0,
});
```

- [ ] **Step 3: Call it after the Vision path**

Just before `return NextResponse.json(ocrResult);` in the Vision branch (around line 91), add:

```typescript
await logOcrUsage({
  engine: 'vision',
  tokens_in: null,
  tokens_out: null,
  cost_eur: computeVisionCostEur(1),
});
```

- [ ] **Step 4: Run typecheck + existing tests**

```bash
npm run typecheck && npm test
```
Expected: PASS, no regressions.

- [ ] **Step 5: Commit**

```bash
git add app/api/ocr/route.ts
git commit -m "feat(ocr): record each scan in ocr_usage_log (Gemini + Vision)"
```

---

## Phase D — Stock value snapshot in cron

### Task D1: stock-value pure helper

**Files:**
- Create: `lib/utils/stock-value.ts`
- Create: `lib/utils/stock-value.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/utils/stock-value.test.ts
import { describe, expect, it } from 'vitest';
import { computeStockValue } from './stock-value';

const baseCard = {
  status: 'for_sale' as const,
  cm_price_avg: null,
  cm_price_trend: null,
  cm_price_low: null,
};

describe('computeStockValue', () => {
  it('returns zeros when no cards', () => {
    expect(computeStockValue([])).toEqual({
      value_for_sale: 0,
      value_collection: 0,
      count_for_sale: 0,
      count_collection: 0,
    });
  });

  it('prefers cm_price_avg, falls back to trend, then low', () => {
    const result = computeStockValue([
      { ...baseCard, cm_price_avg: 10 },
      { ...baseCard, cm_price_avg: null, cm_price_trend: 5 },
      { ...baseCard, cm_price_avg: null, cm_price_trend: null, cm_price_low: 2 },
      { ...baseCard, cm_price_avg: null, cm_price_trend: null, cm_price_low: null },
    ]);
    expect(result.value_for_sale).toBe(17);
    expect(result.count_for_sale).toBe(4);
  });

  it('separates for_sale and collection buckets', () => {
    const result = computeStockValue([
      { ...baseCard, cm_price_avg: 10, status: 'for_sale' },
      { ...baseCard, cm_price_avg: 20, status: 'collection' },
      { ...baseCard, cm_price_avg: 30, status: 'collection' },
    ]);
    expect(result.value_for_sale).toBe(10);
    expect(result.count_for_sale).toBe(1);
    expect(result.value_collection).toBe(50);
    expect(result.count_collection).toBe(2);
  });

  it('ignores sold and pokedex cards', () => {
    const result = computeStockValue([
      { ...baseCard, cm_price_avg: 100, status: 'sold' },
      { ...baseCard, cm_price_avg: 200, status: 'pokedex' },
    ]);
    expect(result.value_for_sale).toBe(0);
    expect(result.count_for_sale).toBe(0);
    expect(result.value_collection).toBe(0);
    expect(result.count_collection).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- stock-value
```
Expected: FAIL.

- [ ] **Step 3: Implement**

```typescript
// lib/utils/stock-value.ts
import type { CardStatus } from '@/lib/types';

export interface PricedCard {
  status: CardStatus;
  cm_price_avg: number | null;
  cm_price_trend: number | null;
  cm_price_low: number | null;
}

export interface StockValueResult {
  value_for_sale: number;
  value_collection: number;
  count_for_sale: number;
  count_collection: number;
}

function priceOf(card: PricedCard): number {
  return card.cm_price_avg ?? card.cm_price_trend ?? card.cm_price_low ?? 0;
}

export function computeStockValue(cards: readonly PricedCard[]): StockValueResult {
  const result: StockValueResult = {
    value_for_sale: 0,
    value_collection: 0,
    count_for_sale: 0,
    count_collection: 0,
  };
  for (const card of cards) {
    if (card.status === 'for_sale') {
      result.value_for_sale += priceOf(card);
      result.count_for_sale += 1;
    } else if (card.status === 'collection') {
      result.value_collection += priceOf(card);
      result.count_collection += 1;
    }
  }
  result.value_for_sale = Math.round(result.value_for_sale * 100) / 100;
  result.value_collection = Math.round(result.value_collection * 100) / 100;
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- stock-value
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/stock-value.ts lib/utils/stock-value.test.ts
git commit -m "feat(stock-value): pure helper for daily snapshot computation"
```

---

### Task D2: Wire snapshot into pricing cron

**Files:**
- Modify: `app/api/prices/update/route.ts`

- [ ] **Step 1: Add the snapshot call at the end of `handleBulk()`**

Just before `return NextResponse.json(summary);` at the end of `handleBulk()` (around line 89), add:

```typescript
await snapshotStockValue(service);
```

And add the helper function below `handleBulk`:

```typescript
import { computeStockValue } from '@/lib/utils/stock-value';

async function snapshotStockValue(
  service: ReturnType<typeof createServiceClient>,
): Promise<void> {
  try {
    const { data, error } = await service
      .from('cards')
      .select('status, cm_price_avg, cm_price_trend, cm_price_low')
      .in('status', ['for_sale', 'collection']);
    if (error) throw error;
    const snapshot = computeStockValue(data ?? []);
    const today = new Date().toISOString().slice(0, 10);
    const { error: upsertErr } = await service
      .from('stock_value_snapshots')
      .upsert({ date: today, ...snapshot }, { onConflict: 'date' });
    if (upsertErr) throw upsertErr;
  } catch (err) {
    console.warn('[stock_value_snapshots] upsert failed (non-fatal):', err);
  }
}
```

- [ ] **Step 2: Run typecheck + tests**

```bash
npm run typecheck && npm test
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/api/prices/update/route.ts
git commit -m "feat(prices-cron): UPSERT daily stock_value_snapshots after bulk run"
```

---

## Phase E — Dashboard

### Task E1: Install Recharts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install**

```bash
npm install recharts@^2.15.0
```

- [ ] **Step 2: Verify bundle size impact is acceptable**

```bash
npm run build 2>&1 | tail -20
```
Note the bundle size delta. Expected: Recharts adds ~50-80 Ko gzipped to first-load.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add recharts for dashboard"
```

---

### Task E2: dashboard-queries pure helpers

**Files:**
- Create: `lib/utils/dashboard-queries.ts`
- Create: `lib/utils/dashboard-queries.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// lib/utils/dashboard-queries.test.ts
import { describe, expect, it } from 'vitest';
import {
  buildHeatmapMatrix,
  buildRarityCounts,
  topRaresByPrice,
} from './dashboard-queries';

describe('buildRarityCounts', () => {
  it('counts cards per rarity', () => {
    const result = buildRarityCounts([
      { rarity: 'SAR' }, { rarity: 'SAR' }, { rarity: 'AR' }, { rarity: 'C' },
    ]);
    expect(result).toEqual([
      { rarity: 'SAR', count: 2 },
      { rarity: 'AR', count: 1 },
      { rarity: 'C', count: 1 },
    ]);
  });

  it('returns empty array for empty input', () => {
    expect(buildRarityCounts([])).toEqual([]);
  });
});

describe('topRaresByPrice', () => {
  it('returns N highest-priced cards descending', () => {
    const cards = [
      { id: 'a', cm_price_avg: 50, cm_price_trend: null, cm_price_low: null },
      { id: 'b', cm_price_avg: 100, cm_price_trend: null, cm_price_low: null },
      { id: 'c', cm_price_avg: null, cm_price_trend: 25, cm_price_low: null },
    ];
    const result = topRaresByPrice(cards, 2);
    expect(result.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('falls back to trend then low', () => {
    const cards = [
      { id: 'a', cm_price_avg: null, cm_price_trend: null, cm_price_low: 5 },
      { id: 'b', cm_price_avg: null, cm_price_trend: 10, cm_price_low: null },
    ];
    const result = topRaresByPrice(cards, 2);
    expect(result.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('skips cards with no price at all', () => {
    const cards = [
      { id: 'a', cm_price_avg: null, cm_price_trend: null, cm_price_low: null },
      { id: 'b', cm_price_avg: 10, cm_price_trend: null, cm_price_low: null },
    ];
    const result = topRaresByPrice(cards, 5);
    expect(result.map((c) => c.id)).toEqual(['b']);
  });
});

describe('buildHeatmapMatrix', () => {
  it('produces a 52x7 matrix with counts at the right cells', () => {
    // Anchor on a known Monday so test is deterministic.
    const anchor = new Date('2026-05-04T12:00:00Z'); // Monday
    const events = [
      { created_at: anchor.toISOString() }, // 0 weeks ago, day 0
      { created_at: anchor.toISOString() }, // same cell → count 2
      { created_at: '2026-04-27T12:00:00Z' }, // 1 week ago, day 0
    ];
    const matrix = buildHeatmapMatrix(events, anchor);
    expect(matrix.length).toBe(52);
    expect(matrix[0].length).toBe(7);
    expect(matrix[0][0]).toBe(2);
    expect(matrix[1][0]).toBe(1);
  });

  it('returns all-zero matrix for no events', () => {
    const matrix = buildHeatmapMatrix([], new Date('2026-05-04T12:00:00Z'));
    expect(matrix.length).toBe(52);
    expect(matrix.every((row) => row.every((c) => c === 0))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
npm test -- dashboard-queries
```
Expected: FAIL.

- [ ] **Step 3: Implement**

```typescript
// lib/utils/dashboard-queries.ts
import type { CardRarity } from '@/lib/types';

export function buildRarityCounts(
  cards: readonly { rarity: CardRarity }[],
): { rarity: CardRarity; count: number }[] {
  const counts = new Map<CardRarity, number>();
  for (const c of cards) {
    counts.set(c.rarity, (counts.get(c.rarity) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([rarity, count]) => ({ rarity, count }))
    .sort((a, b) => b.count - a.count);
}

interface PricedCard {
  cm_price_avg: number | null;
  cm_price_trend: number | null;
  cm_price_low: number | null;
}

function priceOf(card: PricedCard): number | null {
  return card.cm_price_avg ?? card.cm_price_trend ?? card.cm_price_low;
}

export function topRaresByPrice<T extends PricedCard>(
  cards: readonly T[],
  limit: number,
): T[] {
  return cards
    .filter((c) => priceOf(c) !== null)
    .map((c) => ({ card: c, price: priceOf(c)! }))
    .sort((a, b) => b.price - a.price)
    .slice(0, limit)
    .map(({ card }) => card);
}

/**
 * Builds a 52×7 matrix of scan counts.
 * Row 0 = current week, row 51 = 51 weeks ago.
 * Column 0 = Monday, column 6 = Sunday.
 * `anchor` is "today" — week boundaries computed from it.
 */
export function buildHeatmapMatrix(
  events: readonly { created_at: string }[],
  anchor: Date,
): number[][] {
  const matrix: number[][] = Array.from({ length: 52 }, () => Array(7).fill(0));

  // Find the Monday of the anchor week (UTC).
  const anchorDay = (anchor.getUTCDay() + 6) % 7; // 0 = Mon, 6 = Sun
  const monday0 = new Date(anchor);
  monday0.setUTCDate(anchor.getUTCDate() - anchorDay);
  monday0.setUTCHours(0, 0, 0, 0);

  for (const ev of events) {
    const ts = new Date(ev.created_at);
    // Day of week in our local Mon=0..Sun=6 system:
    const dow = (ts.getUTCDay() + 6) % 7;
    // Find the Monday of the event's week:
    const tsMidnight = new Date(ts);
    tsMidnight.setUTCHours(0, 0, 0, 0);
    const tsMonday = new Date(tsMidnight);
    tsMonday.setUTCDate(tsMidnight.getUTCDate() - dow);
    const weeksAgo = Math.round((monday0.getTime() - tsMonday.getTime()) / (7 * 86_400_000));
    if (weeksAgo >= 0 && weeksAgo < 52) {
      matrix[weeksAgo][dow] += 1;
    }
  }
  return matrix;
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
npm test -- dashboard-queries
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/dashboard-queries.ts lib/utils/dashboard-queries.test.ts
git commit -m "feat(dashboard): pure aggregators (rarity, top rares, heatmap)"
```

---

### Task E3: Dashboard page stub (placeholder, no broken imports)

**Files:**
- Create: `app/(app)/dashboard/page.tsx`

The full page is implemented in E10 (after all components exist). For now, create a minimal stub so the route exists and the build stays green during E4-E9.

- [ ] **Step 1: Write the stub**

```tsx
// app/(app)/dashboard/page.tsx
export const metadata = { title: 'Dashboard — I.R.I.S' };

export default function DashboardPage() {
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="text-text-muted mt-1 text-sm">En cours de construction…</p>
    </section>
  );
}
```

- [ ] **Step 2: Run typecheck + tests + build**

```bash
npm run typecheck && npm test && npm run build
```
Expected: PASS (build succeeds, no broken imports).

- [ ] **Step 3: Commit**

```bash
git add app/(app)/dashboard/page.tsx
git commit -m "feat(dashboard): stub page (full impl in E10)"
```

---

### Task E4: DashboardKpiStrip component

**Files:**
- Create: `components/dashboard/DashboardKpiStrip.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/dashboard/DashboardKpiStrip.tsx

interface Props {
  valueStock: number;
  cost30d: number;
  scans30d: number;
}

function formatEur(n: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2,
  }).format(n);
}

export default function DashboardKpiStrip({ valueStock, cost30d, scans30d }: Props) {
  return (
    <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
      <Tile label="Valeur stock" value={formatEur(valueStock)} />
      <Tile label="Coût OCR 30j" value={formatEur(cost30d)} />
      <Tile label="Scans 30j" value={String(scans30d)} />
      <Tile label="Restock alerts" value="—" />
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface border-border rounded-lg border p-4">
      <div className="text-text-muted text-xs uppercase tracking-wide">{label}</div>
      <div className="text-text mt-1.5 text-xl font-semibold">{value}</div>
    </div>
  );
}
```

(Note: "Restock alerts" tile shows "—" for now; populated by E10.)

- [ ] **Step 2: Commit**

```bash
git add components/dashboard/DashboardKpiStrip.tsx
git commit -m "feat(dashboard): KPI strip (valeur stock + coût + scans)"
```

---

### Task E5: CostBarChart component

**Files:**
- Create: `components/dashboard/CostBarChart.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/dashboard/CostBarChart.tsx
'use client';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface Entry {
  created_at: string;
  engine: 'gemini' | 'vision';
  cost_eur: number | string;
}

interface DailyAgg {
  day: string;
  gemini: number;
  vision: number;
}

function aggregateByDay(entries: readonly Entry[]): DailyAgg[] {
  const map = new Map<string, DailyAgg>();
  // Ensure we have a row for every day in the last 30 days even if 0 cost.
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    map.set(d, { day: d, gemini: 0, vision: 0 });
  }
  for (const e of entries) {
    const day = e.created_at.slice(0, 10);
    const row = map.get(day);
    if (!row) continue;
    row[e.engine] += Number(e.cost_eur);
  }
  return Array.from(map.values());
}

export default function CostBarChart({ data }: { data: readonly Entry[] }) {
  const daily = aggregateByDay(data);
  return (
    <div className="bg-surface border-border rounded-lg border p-4">
      <h3 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
        Coût OCR (30 jours)
      </h3>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={daily} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.1} />
            <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `€${v.toFixed(3)}`} />
            <Tooltip
              formatter={(v: number) => `€${v.toFixed(6)}`}
              labelStyle={{ color: '#222' }}
              contentStyle={{ fontSize: 11 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="gemini" stackId="cost" fill="#5591c7" name="Gemini" />
            <Bar dataKey="vision" stackId="cost" fill="#d97aa6" name="Vision" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/dashboard/CostBarChart.tsx
git commit -m "feat(dashboard): CostBarChart stacked Gemini/Vision daily"
```

---

### Task E6: StockValueLineChart component

**Files:**
- Create: `components/dashboard/StockValueLineChart.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/dashboard/StockValueLineChart.tsx
'use client';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface Snapshot {
  date: string;
  value_for_sale: number | string;
  value_collection: number | string;
}

export default function StockValueLineChart({ data }: { data: readonly Snapshot[] }) {
  const series = data.map((s) => ({
    date: s.date,
    for_sale: Number(s.value_for_sale),
    collection: Number(s.value_collection),
  }));

  if (series.length === 0) {
    return (
      <div className="bg-surface border-border rounded-lg border p-4">
        <h3 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
          Valeur stock dans le temps
        </h3>
        <p className="text-text-faint text-sm">
          Données disponibles à partir du premier passage du cron pricing (2 AM UTC).
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface border-border rounded-lg border p-4">
      <h3 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
        Valeur stock dans le temps
      </h3>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.1} />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `€${v.toFixed(0)}`} />
            <Tooltip formatter={(v: number) => `€${v.toFixed(2)}`} contentStyle={{ fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="for_sale" stackId="v" stroke="#5591c7" fill="#5591c7" fillOpacity={0.4} name="For Sale" />
            <Area type="monotone" dataKey="collection" stackId="v" stroke="#d97aa6" fill="#d97aa6" fillOpacity={0.4} name="Collection" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/dashboard/StockValueLineChart.tsx
git commit -m "feat(dashboard): StockValueLineChart area for_sale + collection"
```

---

### Task E7: RarityDonut component (with drill-down)

**Files:**
- Create: `components/dashboard/RarityDonut.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/dashboard/RarityDonut.tsx
'use client';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useRouter } from 'next/navigation';
import { RARITY_COLOR } from '@/lib/utils/labels';
import type { CardRarity } from '@/lib/types';

interface Slice {
  rarity: CardRarity;
  count: number;
}

export default function RarityDonut({ data }: { data: readonly Slice[] }) {
  const router = useRouter();

  if (data.length === 0) {
    return (
      <div className="bg-surface border-border rounded-lg border p-4">
        <h3 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
          Répartition rareté
        </h3>
        <p className="text-text-faint text-sm">Pas encore de cartes.</p>
      </div>
    );
  }

  return (
    <div className="bg-surface border-border rounded-lg border p-4">
      <h3 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
        Répartition rareté
      </h3>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={[...data]}
              dataKey="count"
              nameKey="rarity"
              innerRadius="55%"
              outerRadius="85%"
              onClick={(d) => router.push(`/pokedex?rarity=${d.rarity}`)}
              cursor="pointer"
            >
              {data.map((d) => (
                <Cell key={d.rarity} fill={RARITY_COLOR[d.rarity] ?? '#888'} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number, name: string) => [`${v} cartes`, name]} contentStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify RARITY_COLOR exports a hex string per rarity**

```bash
grep -n "RARITY_COLOR" lib/utils/labels.ts
```

If `RARITY_COLOR` returns Tailwind classes (not hex), add a parallel hex map next to it:

```typescript
// In lib/utils/labels.ts (add at the end)
export const RARITY_COLOR_HEX: Record<CardRarity, string> = {
  SAR: '#f5b942', AR: '#a47fd5', SR: '#e35a5a',
  CHR: '#7a55c4', RR: '#c4a155', R_HOLO: '#5fa9c4',
  R: '#88c45f', UC: '#888', C: '#aaa', OTHER: '#666',
};
```

And in `RarityDonut.tsx`, swap `RARITY_COLOR[d.rarity]` to `RARITY_COLOR_HEX[d.rarity]`.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/RarityDonut.tsx lib/utils/labels.ts
git commit -m "feat(dashboard): RarityDonut with drill-down to /pokedex?rarity=X"
```

---

### Task E8: ScanHeatmap component (custom SVG)

**Files:**
- Create: `components/dashboard/ScanHeatmap.tsx`

- [ ] **Step 1: Write the component**

```tsx
// components/dashboard/ScanHeatmap.tsx
'use client';

interface Props {
  matrix: number[][]; // 52 weeks × 7 days
}

const CELL = 10;
const GAP = 2;
const DOW_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function colorFor(count: number, max: number): string {
  if (count === 0) return 'var(--color-surface-2, #2a2a28)';
  const ratio = max === 0 ? 0 : count / max;
  if (ratio > 0.66) return '#5591c7';
  if (ratio > 0.33) return '#5591c7aa';
  return '#5591c755';
}

export default function ScanHeatmap({ matrix }: Props) {
  const max = Math.max(...matrix.flat(), 1);
  const width = 52 * (CELL + GAP) + 16;
  const height = 7 * (CELL + GAP) + 16;

  return (
    <div className="bg-surface border-border rounded-lg border p-4">
      <h3 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
        Activité scans (52 semaines)
      </h3>
      <div className="overflow-x-auto">
        <svg width={width} height={height} role="img" aria-label="Carte d'activité des scans">
          {DOW_LABELS.map((lbl, dow) => (
            <text
              key={dow}
              x={4}
              y={dow * (CELL + GAP) + CELL - 1}
              fontSize={8}
              fill="currentColor"
              opacity={0.5}
            >
              {lbl}
            </text>
          ))}
          {matrix.map((week, w) =>
            week.map((count, d) => (
              <rect
                key={`${w}-${d}`}
                x={16 + (51 - w) * (CELL + GAP)}
                y={d * (CELL + GAP)}
                width={CELL}
                height={CELL}
                fill={colorFor(count, max)}
                rx={2}
              >
                <title>{count} scans</title>
              </rect>
            )),
          )}
        </svg>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/dashboard/ScanHeatmap.tsx
git commit -m "feat(dashboard): ScanHeatmap 52w × 7d (custom SVG)"
```

---

### Task E9: TopRaresList component (with PokedexDrawer drill)

**Files:**
- Create: `components/dashboard/TopRaresList.tsx`

- [ ] **Step 1: Inspect the existing PokedexDrawer to understand its open/close API**

```bash
grep -n "export default\|export function\|interface .*Props" components/pokedex/PokedexDrawer.tsx | head -10
```

Note the prop signature. If it requires a `cardId` prop and exposes an `onClose`, use those.

- [ ] **Step 2: Write the component**

```tsx
// components/dashboard/TopRaresList.tsx
'use client';
import { useState } from 'react';
import { RARITY_COLOR } from '@/lib/utils/labels';
import PokedexDrawer from '@/components/pokedex/PokedexDrawer';
import type { Card } from '@/lib/types';

interface Props {
  cards: readonly (Pick<Card, 'id' | 'card_name' | 'pokemon_name' | 'image_url' | 'tcg_image_url' | 'rarity'> & {
    cm_price_avg: number | null;
    cm_price_trend: number | null;
    cm_price_low: number | null;
  })[];
}

function priceOf(c: Props['cards'][number]): number {
  return c.cm_price_avg ?? c.cm_price_trend ?? c.cm_price_low ?? 0;
}

export default function TopRaresList({ cards }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (cards.length === 0) {
    return (
      <div className="bg-surface border-border rounded-lg border p-4">
        <h3 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
          Top 10 cartes rares
        </h3>
        <p className="text-text-faint text-sm">Pas encore de cartes avec un prix.</p>
      </div>
    );
  }

  return (
    <div className="bg-surface border-border rounded-lg border p-4">
      <h3 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
        Top 10 cartes rares
      </h3>
      <ul className="divide-border divide-y">
        {cards.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => setOpenId(c.id)}
              className="hover:bg-surface-2 flex w-full items-center gap-3 px-2 py-2 text-left transition-colors"
            >
              <img
                src={c.image_url ?? c.tcg_image_url ?? ''}
                alt=""
                className="h-12 w-9 rounded object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="text-text truncate text-sm font-medium">{c.card_name}</div>
                <div className="text-text-muted text-xs">
                  <span className={RARITY_COLOR[c.rarity] ?? ''}>{c.rarity}</span>
                </div>
              </div>
              <div className="text-text shrink-0 font-mono text-sm">
                €{priceOf(c).toFixed(2)}
              </div>
            </button>
          </li>
        ))}
      </ul>
      {openId && (
        <PokedexDrawer cardId={openId} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}
```

(If `PokedexDrawer` has a different API than `cardId` + `onClose`, adapt the call accordingly — check Step 1.)

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/TopRaresList.tsx
git commit -m "feat(dashboard): TopRaresList with PokedexDrawer drill-down"
```

---

### Task E10: computeRestockAlerts helper + RestockAlertsList + full page

**Files:**
- Modify: `lib/utils/restock-detection.ts` (add `computeRestockAlerts`)
- Modify: `lib/utils/restock-detection.test.ts` (add test)
- Modify: `components/dashboard/DashboardKpiStrip.tsx` (add `restockCount` prop)
- Create: `components/dashboard/RestockAlertsList.tsx`
- Modify: `app/(app)/dashboard/page.tsx` (replace E3 stub with full impl)

- [ ] **Step 1: Add the failing test for computeRestockAlerts**

Append to `lib/utils/restock-detection.test.ts`:

```typescript
import { computeRestockAlerts } from './restock-detection';

describe('computeRestockAlerts', () => {
  it('aggregates by pokemon_number and returns alerts only where applicable', () => {
    const result = computeRestockAlerts([
      { pokemon_number: 25, pokemon_name: 'Pikachu', status: 'pokedex' },
      { pokemon_number: 25, pokemon_name: 'Pikachu', status: 'for_sale' }, // NOT alerted (1 for_sale remains)
      { pokemon_number: 6, pokemon_name: 'Charizard', status: 'pokedex' }, // alerted (no for_sale, no stock)
      { pokemon_number: 9, pokemon_name: 'Blastoise', status: 'pokedex' },
      { pokemon_number: 9, pokemon_name: 'Blastoise', status: 'collection' }, // NOT alerted (stock present)
    ]);
    expect(result.map((a) => a.pokemon_number)).toEqual([6]);
  });

  it('skips cards with null pokemon_number', () => {
    const result = computeRestockAlerts([
      { pokemon_number: null, pokemon_name: null, status: 'pokedex' },
    ]);
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
npm test -- restock-detection
```
Expected: FAIL — `computeRestockAlerts` not exported.

- [ ] **Step 3: Add the helper to restock-detection.ts**

Append to `lib/utils/restock-detection.ts`:

```typescript
export function computeRestockAlerts(
  cards: readonly {
    pokemon_number: number | null;
    pokemon_name: string | null;
    status: 'pokedex' | 'for_sale' | 'collection' | 'sold';
  }[],
): RestockAlert[] {
  const byPokemon = new Map<
    number,
    { pokedex: { pokemon_name: string } | null; for_sale: number; stock: number }
  >();
  for (const c of cards) {
    if (!c.pokemon_number) continue;
    const entry = byPokemon.get(c.pokemon_number) ?? { pokedex: null, for_sale: 0, stock: 0 };
    if (c.status === 'pokedex') entry.pokedex = { pokemon_name: c.pokemon_name ?? '?' };
    else if (c.status === 'for_sale') entry.for_sale += 1;
    else if (c.status === 'collection') entry.stock += 1;
    byPokemon.set(c.pokemon_number, entry);
  }
  return Array.from(byPokemon.entries())
    .map(([pokemon_number, { pokedex, for_sale, stock }]) =>
      detectRestock({
        pokemonNumber: pokemon_number,
        pokedexCard: pokedex,
        remainingForSaleCount: for_sale,
        remainingStockCount: stock,
      }),
    )
    .filter((a): a is RestockAlert => a !== null);
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
npm test -- restock-detection
```
Expected: PASS, both old and new tests green.

- [ ] **Step 5: Update `DashboardKpiStrip.tsx` to accept restockCount**

Replace the entire file with:

```tsx
// components/dashboard/DashboardKpiStrip.tsx

interface Props {
  valueStock: number;
  cost30d: number;
  scans30d: number;
  restockCount: number;
}

function formatEur(n: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2,
  }).format(n);
}

export default function DashboardKpiStrip({ valueStock, cost30d, scans30d, restockCount }: Props) {
  return (
    <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
      <Tile label="Valeur stock" value={formatEur(valueStock)} />
      <Tile label="Coût OCR 30j" value={formatEur(cost30d)} />
      <Tile label="Scans 30j" value={String(scans30d)} />
      <Tile label="Restock alerts" value={String(restockCount)} />
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface border-border rounded-lg border p-4">
      <div className="text-text-muted text-xs uppercase tracking-wide">{label}</div>
      <div className="text-text mt-1.5 text-xl font-semibold">{value}</div>
    </div>
  );
}
```

- [ ] **Step 6: Write RestockAlertsList (presentation only — receives alerts as prop)**

```tsx
// components/dashboard/RestockAlertsList.tsx
import Link from 'next/link';
import type { RestockAlert } from '@/lib/utils/restock-detection';

export default function RestockAlertsList({ alerts }: { alerts: readonly RestockAlert[] }) {
  if (alerts.length === 0) {
    return (
      <div className="bg-surface border-border rounded-lg border p-4">
        <h3 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
          Restock alerts
        </h3>
        <p className="text-text-faint text-sm">Aucune alerte. ✓</p>
      </div>
    );
  }
  return (
    <div className="bg-surface border-border rounded-lg border p-4">
      <h3 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
        Restock alerts ({alerts.length})
      </h3>
      <ul className="divide-border divide-y">
        {alerts.map((a) => (
          <li key={a.pokemon_number}>
            <Link
              href={`/pokedex?pokemon_number=${a.pokemon_number}`}
              className="hover:bg-surface-2 flex items-center justify-between px-2 py-2 transition-colors"
            >
              <span className="text-text text-sm">
                #{a.pokemon_number} — {a.pokemon_name}
              </span>
              <span className="text-red text-xs font-medium">À restocker</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 7: Replace the page.tsx stub with the full implementation**

Overwrite `app/(app)/dashboard/page.tsx` entirely:

```tsx
// app/(app)/dashboard/page.tsx
import { createClient } from '@/lib/supabase/server';
import { buildRarityCounts, topRaresByPrice, buildHeatmapMatrix } from '@/lib/utils/dashboard-queries';
import { computeStockValue } from '@/lib/utils/stock-value';
import { computeRestockAlerts } from '@/lib/utils/restock-detection';
import DashboardKpiStrip from '@/components/dashboard/DashboardKpiStrip';
import CostBarChart from '@/components/dashboard/CostBarChart';
import StockValueLineChart from '@/components/dashboard/StockValueLineChart';
import RarityDonut from '@/components/dashboard/RarityDonut';
import ScanHeatmap from '@/components/dashboard/ScanHeatmap';
import TopRaresList from '@/components/dashboard/TopRaresList';
import RestockAlertsList from '@/components/dashboard/RestockAlertsList';
import type { Card } from '@/lib/types';

export const metadata = { title: 'Dashboard — I.R.I.S' };
export const revalidate = 60;

export default async function DashboardPage() {
  const supabase = await createClient();
  const since30d = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const since52w = new Date(Date.now() - 52 * 7 * 86_400_000).toISOString();

  const [
    { data: pricedCards },
    { data: ocrLog30d },
    { data: stockSnapshots },
    { data: ocrLog52w },
    { data: restockRows },
  ] = await Promise.all([
    supabase
      .from('cards')
      .select('id, status, rarity, cm_price_avg, cm_price_trend, cm_price_low, card_name, pokemon_name, image_url, tcg_image_url')
      .in('status', ['for_sale', 'collection']),
    supabase
      .from('ocr_usage_log')
      .select('created_at, engine, cost_eur')
      .gte('created_at', since30d)
      .order('created_at', { ascending: true }),
    supabase
      .from('stock_value_snapshots')
      .select('*')
      .order('date', { ascending: true }),
    supabase
      .from('ocr_usage_log')
      .select('created_at')
      .gte('created_at', since52w),
    supabase
      .from('cards')
      .select('pokemon_number, pokemon_name, status')
      .not('pokemon_number', 'is', null),
  ]);

  const cards = (pricedCards ?? []) as unknown as (Card & {
    cm_price_avg: number | null;
    cm_price_trend: number | null;
    cm_price_low: number | null;
  })[];
  const stockValue = computeStockValue(cards);
  const cost30dTotal = (ocrLog30d ?? []).reduce(
    (sum, e) => sum + Number(e.cost_eur ?? 0),
    0,
  );
  const scans30d = (ocrLog30d ?? []).length;
  const rarityCounts = buildRarityCounts(cards);
  const topRares = topRaresByPrice(cards, 10);
  const heatmap = buildHeatmapMatrix(ocrLog52w ?? [], new Date());
  const alerts = computeRestockAlerts(restockRows ?? []);

  return (
    <section>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-text-muted mt-1 text-sm">
          État de la collection et de la consommation OCR.
        </p>
      </div>

      <DashboardKpiStrip
        valueStock={stockValue.value_for_sale + stockValue.value_collection}
        cost30d={cost30dTotal}
        scans30d={scans30d}
        restockCount={alerts.length}
      />

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <CostBarChart data={ocrLog30d ?? []} />
        <StockValueLineChart data={stockSnapshots ?? []} />
        <RarityDonut data={rarityCounts} />
        <ScanHeatmap matrix={heatmap} />
      </div>

      <div className="mt-4 grid gap-4">
        <TopRaresList cards={topRares} />
        <RestockAlertsList alerts={alerts} />
      </div>
    </section>
  );
}
```

- [ ] **Step 8: Run typecheck + tests + build**

```bash
npm run typecheck && npm test && npm run build
```
Expected: PASS, build succeeds.

- [ ] **Step 9: Commit**

```bash
git add lib/utils/restock-detection.ts lib/utils/restock-detection.test.ts components/dashboard/DashboardKpiStrip.tsx components/dashboard/RestockAlertsList.tsx app/(app)/dashboard/page.tsx
git commit -m "feat(dashboard): full page wired with all 4 graphs + 2 lists"
```

---

### Task E11: Add /dashboard to nav + verify everything compiles

**Files:**
- Modify: `components/layout/nav-items.ts`

- [ ] **Step 1: Add the dashboard nav item**

```typescript
// components/layout/nav-items.ts
import { LayoutDashboard, ScanLine, BookOpen, Package, Tag, Settings, BarChart3, type LucideIcon } from 'lucide-react';

export interface NavItem { href: string; label: string; icon: LucideIcon; }

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Home', icon: LayoutDashboard },
  { href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { href: '/submit', label: 'Scanner', icon: ScanLine },
  { href: '/pokedex', label: 'Pokédex', icon: BookOpen },
  { href: '/stock', label: 'Stock', icon: Package },
  { href: '/vinted', label: 'Vinted', icon: Tag },
  { href: '/options', label: 'Options', icon: Settings },
];
```

- [ ] **Step 2: Run typecheck + tests + build**

```bash
npm run typecheck && npm test && npm run build
```
Expected: PASS (all 320+ tests, no type errors, build succeeds).

- [ ] **Step 3: Manual smoke test**

```bash
npm run dev
```
Open `http://localhost:3000/dashboard` in browser. Verify:
- Nav shows "Dashboard" between "Home" and "Scanner"
- Page renders all 4 graphs (some may be empty if no data yet — expected)
- KPI strip shows 4 tiles
- No console errors

If `RarityDonut`, `CostBarChart`, etc., throw because Recharts complains about React 19 — pin to a Recharts version known to work with React 19, or wrap in a try-catch. Check Recharts changelog.

- [ ] **Step 4: Commit**

```bash
git add components/layout/nav-items.ts
git commit -m "feat(dashboard): add /dashboard nav entry"
```

---

## Phase F — Backup manuel (sub-projet 4)

### Task F1: Create the manual-backups bucket

**Files:**
- Create: `supabase/migrations/20260507100000_phase5_manual_backups_bucket.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260507100000_phase5_manual_backups_bucket.sql
-- Phase 5 — private bucket for manual backups triggered from /options.

insert into storage.buckets (id, name, public)
values ('manual-backups', 'manual-backups', false)
on conflict (id) do nothing;

-- No RLS policies on storage.objects for this bucket → only service-role
-- access (matches the design: API routes use service client to dump/list).
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260507100000_phase5_manual_backups_bucket.sql
git commit -m "feat(phase5): migration manual-backups storage bucket"
```

---

### Task F2: manual-dump pure helper

**Files:**
- Create: `lib/utils/manual-dump.ts`
- Create: `lib/utils/manual-dump.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/utils/manual-dump.test.ts
import { describe, expect, it } from 'vitest';
import { buildManualDump, manualBackupFilename } from './manual-dump';

describe('buildManualDump', () => {
  it('wraps tables in a versioned envelope', () => {
    const dump = buildManualDump({
      cards: [{ id: 'a' }, { id: 'b' }],
      lots: [],
      card_listings: [],
      lot_listings: [],
      user_profiles: [],
      config: [],
      ocr_usage_log: [],
      stock_value_snapshots: [],
    }, '2026-05-07T14:30:52.000Z');

    expect(dump.version).toBe('phase5');
    expect(dump.created_at).toBe('2026-05-07T14:30:52.000Z');
    expect(dump.tables.cards.length).toBe(2);
    expect(dump.tables.lots).toEqual([]);
  });
});

describe('manualBackupFilename', () => {
  it('produces a sortable filename in iris-YYYY-MM-DD-HHMMSS.json.gz format', () => {
    const name = manualBackupFilename(new Date('2026-05-07T14:30:52.000Z'));
    expect(name).toBe('iris-2026-05-07-143052.json.gz');
  });
});
```

- [ ] **Step 2: Run test**

```bash
npm test -- manual-dump
```
Expected: FAIL.

- [ ] **Step 3: Implement**

```typescript
// lib/utils/manual-dump.ts

export type ManualDumpTables = {
  cards: unknown[];
  lots: unknown[];
  card_listings: unknown[];
  lot_listings: unknown[];
  user_profiles: unknown[];
  config: unknown[];
  ocr_usage_log: unknown[];
  stock_value_snapshots: unknown[];
};

export interface ManualDump {
  version: 'phase5';
  created_at: string;
  tables: ManualDumpTables;
}

export function buildManualDump(tables: ManualDumpTables, createdAt: string): ManualDump {
  return { version: 'phase5', created_at: createdAt, tables };
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0');
}

export function manualBackupFilename(date: Date): string {
  const y = date.getUTCFullYear();
  const m = pad(date.getUTCMonth() + 1);
  const d = pad(date.getUTCDate());
  const h = pad(date.getUTCHours());
  const mi = pad(date.getUTCMinutes());
  const s = pad(date.getUTCSeconds());
  return `iris-${y}-${m}-${d}-${h}${mi}${s}.json.gz`;
}
```

- [ ] **Step 4: Run test**

```bash
npm test -- manual-dump
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/manual-dump.ts lib/utils/manual-dump.test.ts
git commit -m "feat(manual-dump): pure dump envelope + filename helper"
```

---

### Task F3: POST /api/backup/manual route

**Files:**
- Create: `app/api/backup/manual/route.ts`

- [ ] **Step 1: Write the route**

```typescript
// app/api/backup/manual/route.ts
import { NextResponse } from 'next/server';
import { gzipSync } from 'node:zlib';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { buildManualDump, manualBackupFilename, type ManualDumpTables } from '@/lib/utils/manual-dump';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TABLES = [
  'cards', 'lots', 'card_listings', 'lot_listings',
  'user_profiles', 'config', 'ocr_usage_log', 'stock_value_snapshots',
] as const satisfies readonly (keyof ManualDumpTables)[];

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();

  const tables: Partial<ManualDumpTables> = {};
  for (const t of TABLES) {
    const { data, error } = await service.from(t).select('*');
    if (error) {
      return NextResponse.json(
        { error: `Failed reading ${t}: ${error.message}` },
        { status: 500 },
      );
    }
    tables[t] = data ?? [];
  }

  const now = new Date();
  const dump = buildManualDump(tables as ManualDumpTables, now.toISOString());
  const json = JSON.stringify(dump);
  const gz = gzipSync(Buffer.from(json, 'utf-8'));
  const filename = manualBackupFilename(now);

  const { error: upErr } = await service.storage
    .from('manual-backups')
    .upload(filename, gz, { contentType: 'application/gzip', upsert: false });

  if (upErr) {
    return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    filename,
    size_bytes: gz.byteLength,
  });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();
  const { data, error } = await service.storage
    .from('manual-backups')
    .list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    backups: (data ?? []).map((f) => ({
      name: f.name,
      created_at: f.created_at,
      size_bytes: f.metadata?.size ?? null,
    })),
  });
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/api/backup/manual/route.ts
git commit -m "feat(backup): POST/GET /api/backup/manual (dump + list)"
```

---

### Task F4: GET signed URL + DELETE route

**Files:**
- Create: `app/api/backup/manual/[filename]/route.ts`

- [ ] **Step 1: Write the route**

```typescript
// app/api/backup/manual/[filename]/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';

const FILENAME_PATTERN = /^iris-\d{4}-\d{2}-\d{2}-\d{6}\.json\.gz$/;

interface Context {
  params: Promise<{ filename: string }>;
}

export async function GET(_request: Request, { params }: Context) {
  const { filename } = await params;
  if (!FILENAME_PATTERN.test(filename)) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();
  const { data, error } = await service.storage
    .from('manual-backups')
    .createSignedUrl(filename, 3600);

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Sign failed' }, { status: 500 });
  }

  return NextResponse.json({ signedUrl: data.signedUrl });
}

export async function DELETE(_request: Request, { params }: Context) {
  const { filename } = await params;
  if (!FILENAME_PATTERN.test(filename)) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();
  const { error } = await service.storage.from('manual-backups').remove([filename]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/backup/manual/[filename]/route.ts
git commit -m "feat(backup): GET signed URL + DELETE for manual backups"
```

---

### Task F5: ManualBackupSection (server) + ManualBackupButton (client)

**Files:**
- Create: `components/options/ManualBackupSection.tsx`
- Create: `components/options/ManualBackupButton.tsx`
- Modify: `app/(app)/options/page.tsx`

- [ ] **Step 1: Write the client button**

```tsx
// components/options/ManualBackupButton.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function ManualBackupButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/backup/manual', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `Erreur ${res.status}`);
      } else {
        router.refresh(); // server component re-fetches the list
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={busy}
        className="bg-red text-white hover:bg-red-dark inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60"
      >
        {busy ? 'Création en cours…' : 'Créer un backup maintenant'}
      </button>

      {error && <p className="text-red mt-2 text-xs">{error}</p>}

      {confirmOpen && (
        <div className="bg-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="bg-surface border-border w-full max-w-md rounded-lg border p-5"
            role="dialog"
            aria-modal="true"
          >
            <h3 className="text-text text-lg font-semibold">Confirmer le backup manuel</h3>
            <p className="text-text-muted mt-2 text-sm">
              Snapshot complet de toutes vos données. Gardé sans rotation. Continuer ?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={busy}
                className="text-text-muted hover:bg-surface-2 rounded-md px-3 py-1.5 text-sm transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={run}
                disabled={busy}
                className="bg-red text-white hover:bg-red-dark rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60"
              >
                {busy ? '…' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Write the server section**

```tsx
// components/options/ManualBackupSection.tsx
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import ManualBackupButton from './ManualBackupButton';
import ManualBackupRow from './ManualBackupRow';

export default async function ManualBackupSection() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const service = createServiceClient();
  const { data: files } = await service.storage
    .from('manual-backups')
    .list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

  return (
    <div className="bg-surface border-border rounded-lg border p-5">
      <h2 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
        Backup manuel
      </h2>
      <p className="text-text-muted mb-3 text-sm">
        Crée un snapshot complet, gardé sans rotation.
      </p>

      <ManualBackupButton />

      {files && files.length > 0 && (
        <div className="mt-5">
          <h3 className="text-text-muted mb-2 text-xs font-semibold uppercase tracking-wide">
            Backups existants ({files.length})
          </h3>
          <ul className="divide-border divide-y">
            {files.map((f) => (
              <ManualBackupRow
                key={f.name}
                name={f.name}
                createdAt={f.created_at ?? ''}
                sizeBytes={f.metadata?.size ?? null}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write the row (client, has DL + Delete actions)**

```tsx
// components/options/ManualBackupRow.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface Props {
  name: string;
  createdAt: string;
  sizeBytes: number | null;
}

function formatSize(b: number | null): string {
  if (b == null) return '?';
  const mb = b / (1024 * 1024);
  return mb < 1 ? `${(b / 1024).toFixed(0)} Ko` : `${mb.toFixed(1)} Mo`;
}

export default function ManualBackupRow({ name, createdAt, sizeBytes }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const res = await fetch(`/api/backup/manual/${name}`);
      const { signedUrl } = await res.json();
      if (signedUrl) window.location.href = signedUrl;
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Supprimer ${name} ?`)) return;
    setBusy(true);
    try {
      await fetch(`/api/backup/manual/${name}`, { method: 'DELETE' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const date = createdAt ? new Date(createdAt).toLocaleString('fr-FR') : '?';

  return (
    <li className="flex items-center justify-between py-2 text-sm">
      <span className="text-text-muted font-mono text-xs">
        {date} — {formatSize(sizeBytes)}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={download}
          disabled={busy}
          className="text-blue hover:underline disabled:opacity-60"
        >
          DL
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="text-red hover:underline disabled:opacity-60"
        >
          Suppr
        </button>
      </div>
    </li>
  );
}
```

- [ ] **Step 4: Mount in options page**

```tsx
// app/(app)/options/page.tsx — modify to add ManualBackupSection
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import ThemeToggle from '@/components/layout/ThemeToggle';
import SignOutButton from '@/components/layout/SignOutButton';
import ManualBackupSection from '@/components/options/ManualBackupSection';

export const metadata = { title: 'Options — I.R.I.S' };

export default async function OptionsPage() {
  const cookieStore = await cookies();
  const initialTheme = cookieStore.get('theme')?.value === 'light' ? 'light' : 'dark';

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <section>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Options</h1>
        <p className="text-text-muted mt-1 text-sm">Préférences et compte.</p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="bg-surface border-border rounded-lg border p-5">
          <h2 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
            Apparence
          </h2>
          <ThemeToggle initialTheme={initialTheme} />
        </div>

        <div className="bg-surface border-border rounded-lg border p-5">
          <h2 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
            Compte
          </h2>
          {user?.email && (
            <p className="text-text mb-3 break-all px-3 font-mono text-xs">{user.email}</p>
          )}
          <SignOutButton />
        </div>
      </div>

      <div className="mt-4">
        <ManualBackupSection />
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Run typecheck + tests + manual smoke**

```bash
npm run typecheck && npm test
npm run dev
# Open /options, click "Créer un backup maintenant", confirm.
# Wait ~5-10s, verify a row appears in the list.
# Click DL → file downloads. Click Suppr → row disappears after confirm.
```

- [ ] **Step 6: Commit**

```bash
git add components/options/ManualBackupSection.tsx components/options/ManualBackupButton.tsx components/options/ManualBackupRow.tsx app/(app)/options/page.tsx
git commit -m "feat(options): manual backup section with create/list/dl/delete"
```

---

## Phase G — Backup auto via GitHub Action (sub-projet 3)

### Task G1: rotate.sh script

**Files:**
- Create: `scripts/backup/rotate.sh`

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# scripts/backup/rotate.sh
# Keeps the N most recent releases per backup category.
# backup-manual-* are NEVER deleted (no entry below).

set -euo pipefail

keep_recent() {
  local prefix=$1
  local count=$2
  echo "[rotate] keeping last $count of '${prefix}*'"
  gh release list --limit 1000 \
    | awk '{print $1}' \
    | grep "^${prefix}" \
    | sort -r \
    | tail -n +$((count + 1)) \
    | while read -r tag; do
        echo "  delete: $tag"
        gh release delete "$tag" --yes --cleanup-tag
      done
}

keep_recent "backup-daily-"   30
keep_recent "backup-weekly-"  12
keep_recent "backup-monthly-" 12

echo "[rotate] done."
```

- [ ] **Step 2: Make executable + commit**

```bash
chmod +x scripts/backup/rotate.sh
git add scripts/backup/rotate.sh
git commit -m "feat(backup): rotate.sh keeps 30 daily / 12 weekly / 12 monthly"
```

---

### Task G2: GitHub Action workflow

**Files:**
- Create: `.github/workflows/backup.yml`

- [ ] **Step 1: Write the workflow**

```yaml
# .github/workflows/backup.yml
name: Daily backup

on:
  schedule:
    - cron: '0 3 * * *'  # 3 AM UTC every day
  workflow_dispatch:

permissions:
  contents: write

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install pg_dump 16
        run: |
          sudo apt-get update
          sudo apt-get install -y postgresql-client-16

      - name: Verify pg_dump version
        run: pg_dump --version

      - name: Dump user-data tables
        env:
          SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
        run: |
          set +x
          pg_dump "$SUPABASE_DB_URL" \
            --data-only --no-owner --no-acl \
            --table=public.cards \
            --table=public.lots \
            --table=public.card_listings \
            --table=public.lot_listings \
            --table=public.user_profiles \
            --table=public.config \
            --table=public.ocr_usage_log \
            --table=public.stock_value_snapshots \
            | gzip > dump.sql.gz
          ls -lh dump.sql.gz

      - name: Tag and upload releases
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          DATE=$(date -u +%Y-%m-%d)
          DAY_OF_WEEK=$(date -u +%u)   # 1=Mon..7=Sun
          DAY_OF_MONTH=$(date -u +%d)
          WEEK=$(date -u +%G-W%V)
          MONTH=$(date -u +%Y-%m)

          gh release create "backup-daily-$DATE" dump.sql.gz \
            --notes "Auto-backup $DATE" --prerelease

          if [ "$DAY_OF_WEEK" = "7" ]; then
            gh release create "backup-weekly-$WEEK" dump.sql.gz \
              --notes "Weekly backup $WEEK" --prerelease
          fi

          if [ "$DAY_OF_MONTH" = "01" ]; then
            gh release create "backup-monthly-$MONTH" dump.sql.gz \
              --notes "Monthly backup $MONTH" --prerelease
          fi

      - name: Rotate old releases
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: bash scripts/backup/rotate.sh
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/backup.yml
git commit -m "feat(backup): GitHub Action daily backup → releases"
```

---

### Task G3: User action — configure secret + first manual run

This task is for the human operator (cannot be automated by the implementing agent).

- [ ] **Step 1: Add SUPABASE_DB_URL secret**

In GitHub repo Settings → Secrets and variables → Actions → New repository secret:
- Name: `SUPABASE_DB_URL`
- Value: from Supabase Dashboard → Project Settings → Database → Connection string → "Direct connection" (URI format starting with `postgresql://`)

- [ ] **Step 2: Trigger the workflow manually**

In GitHub Actions tab → "Daily backup" → "Run workflow" → main branch → Run.

Verify:
- Workflow completes green
- A `backup-daily-YYYY-MM-DD` release appears under Releases tab
- The asset `dump.sql.gz` is downloadable

- [ ] **Step 3: Test restore on a local Supabase**

```bash
# Set up a local Supabase instance (one-time)
# Then:
gh release download backup-daily-2026-05-08 --pattern '*.sql.gz' --dir /tmp
gunzip /tmp/dump.sql.gz
psql "$LOCAL_SUPABASE_DB_URL" -c "TRUNCATE cards, lots, card_listings, lot_listings, user_profiles, config, ocr_usage_log, stock_value_snapshots RESTART IDENTITY CASCADE;"
psql "$LOCAL_SUPABASE_DB_URL" < /tmp/dump.sql
# Verify rows exist via psql or Studio.
```

(This is documented for the human; not a step the agent runs.)

---

## Final wrap-up

### Final task: docs sync + push

- [ ] **Step 1: Update CLAUDE.md and docs/phases-summary.md**

Mark Phase 5 as TERMINEE in `CLAUDE.md` line 23. Add a Phase 5 section to `docs/phases-summary.md` summarizing the deliverables.

- [ ] **Step 2: Final test + lint + typecheck**

```bash
npm run typecheck && npm test && npm run lint
```
Expected: PASS, all tests green, 0 lint warnings.

- [ ] **Step 3: Commit + push**

```bash
git add CLAUDE.md docs/phases-summary.md
git commit -m "docs: mark Phase 5 complete (Dashboard + Backups)"
git push origin main
```

(After push: ensure GitHub Action runs successfully on next 3 AM UTC trigger.)

---

## Spec coverage check

| Spec section | Tasks |
|---|---|
| Sub-projet 1 — Dashboard layout & components | E1 → E11 |
| Sub-projet 1 — migrations (`ocr_usage_log`, `stock_value_snapshots`) | A1 |
| Sub-projet 1 — OCR route INSERT | C1, C2 |
| Sub-projet 1 — pricing cron UPSERT | D1, D2 |
| Sub-projet 1 — drill-downs (donut → pokedex, top → drawer) | E7, E9 |
| Sub-projet 2 — snapshot tcg_catalog scripts | B1, B2 |
| Sub-projet 2 — round-trip test | B3 |
| Sub-projet 2 — initial baseline snapshot | B4 |
| Sub-projet 2 — backups/README.md | B4 |
| Sub-projet 3 — GitHub Action workflow | G2 |
| Sub-projet 3 — rotation script | G1 |
| Sub-projet 3 — secret config + first run | G3 |
| Sub-projet 4 — bucket creation | F1 |
| Sub-projet 4 — pure dump helper + tests | F2 |
| Sub-projet 4 — POST/GET /api/backup/manual | F3 |
| Sub-projet 4 — GET signed URL + DELETE | F4 |
| Sub-projet 4 — UI components in /options | F5 |
| Sub-projet 5 — extract PRICE_COEFFICIENT | A2 |
| Sub-projet 5 — factor validate-card-form | A3 |

All spec sections are covered.

## Hors-scope acknowledgment

The following are explicitly NOT in this plan (per spec section "Hors scope"):

- PWA install prompt + icônes 192/512 + manifest fine-tune
- Backup automatique des photos du bucket Storage
- UI de restore d'un backup manuel
- Standardisation du shape des erreurs API

These should be tracked separately in a follow-up plan after Phase 5 ships.
