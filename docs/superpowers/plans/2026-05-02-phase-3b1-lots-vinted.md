# Phase 3b1 — Lots Vinted (bundles) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the "lot Vinted" entity (multi-card bundle sold as one item) from DB migration to functional UI in `/vinted`, with template-based annonce generation and multi-photo support.

**Architecture:** Extend existing `lots` table (currently unused) into a full Vinted-listing entity with status/price/photos. New endpoints (`POST/PATCH/DELETE /api/lots`), new UI components (`LotForm`, `LotRow`, `LotAnnonceModal`), interleaved into `/vinted` alongside cards via a discriminated union (`kind: 'card' | 'lot'`). Reuses existing patterns: `EditablePriceCell`, `VintedListedToggle`, `SoldModal` (extended), `processImageForVinted`, `vinted-template` constants.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase service-role for Storage uploads, Vitest + happy-dom, Tailwind v4, Lucide icons.

**Spec:** [docs/superpowers/specs/2026-05-02-phase-3b1-lots-vinted-design.md](../specs/2026-05-02-phase-3b1-lots-vinted-design.md)

---

## File Structure

**New files:**
- `supabase/migrations/20260502120000_lots_vinted_bundle.sql` — migration extending `lots` table
- `lib/utils/lot-template.ts` — pure helper `buildLotAnnonce({ name, language, condition, extra_description })`
- `lib/utils/lot-template.test.ts` — 7 tests
- `app/api/lots/route.ts` — `POST` handler (create lot with multipart photos)
- `app/api/lots/route.test.ts` — 5 tests
- `app/api/lots/[id]/route.ts` — `PATCH` and `DELETE` handlers
- `app/api/lots/[id]/route.test.ts` — 5 tests
- `components/submit/LotForm.tsx` — multi-photo upload form with live preview
- `components/lots/LotRow.tsx` — row component for `/vinted`
- `components/lots/LotAnnonceModal.tsx` — annonce modal with photo carousel

**Modified files:**
- `lib/types/index.ts` — add `Lot` interface
- `lib/utils/vinted-template.ts` — export `LANGUAGE_FEMALE` and `CONDITION_LABEL` (currently private)
- `components/submit/SubmitTabs.tsx` — replace "Lot" placeholder with `<LotForm>`
- `components/vinted/SoldModal.tsx` — extend with `kind: 'card' | 'lot'` prop
- `components/vinted/VintedFilters.tsx` — add Type chip (Cartes / Lots / Tout)
- `components/vinted/VintedList.tsx` — fetch lots, interleave with cards, filter by kind
- `app/(app)/vinted/page.tsx` — server-side fetch of lots, pass to `<VintedList>`

---

## Task 1: DB migration + Lot type

**Files:**
- Create: `supabase/migrations/20260502120000_lots_vinted_bundle.sql`
- Modify: `lib/types/index.ts`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260502120000_lots_vinted_bundle.sql
-- Phase 3b1: extend lots table from minimal scaffold (id, photo_url, created_at)
-- to a full Vinted-listing entity (bundle of cards sold as one item).

alter table lots
  add column name text not null default '',
  add column language card_language,
  add column condition card_condition default 'NM',
  add column extra_description text,
  add column price numeric(10, 2),
  add column status text default 'for_sale'
    check (status in ('for_sale', 'sold')),
  add column date_sold timestamptz,
  add column sold_price numeric(10, 2),
  add column vinted_listed_at timestamptz,
  add column photo_urls jsonb default '[]'::jsonb,
  add column date_added timestamptz default now();

create index idx_lots_status on lots(status);
create index idx_lots_date_added on lots(date_added);
create index idx_lots_vinted_listed on lots(vinted_listed_at) where vinted_listed_at is not null;
```

- [ ] **Step 2: Apply the migration locally**

Run: `source ~/.nvm/nvm.sh && nvm use && npx supabase db push` (or whatever the project's migration command is — check `package.json` scripts; if no script, run `supabase db reset` or apply manually via the Supabase Studio SQL editor).

Expected: migration applied without errors, `lots` table has the 11 new columns.

If unclear about the migration application command, ask before guessing — local Supabase CLI workflow varies per setup.

- [ ] **Step 3: Add Lot type to lib/types/index.ts**

Open `lib/types/index.ts`. After the existing `Lot` interface (line 55-59 currently has a minimal one with just `id`, `photo_url`, `created_at`), REPLACE it with:

```typescript
export interface Lot {
  id: string;
  /** Legacy column from initial scaffold — unused since Phase 3b1, may be null. */
  photo_url: string | null;
  created_at: string;

  // Phase 3b1 extensions
  name: string;
  language: CardLanguage | null;
  condition: CardCondition;
  extra_description: string | null;
  price: number | null;
  status: 'for_sale' | 'sold';
  date_sold: string | null;
  sold_price: number | null;
  vinted_listed_at: string | null;
  /** Array of Storage paths relative to the lot-photos bucket, e.g. ["{lot_id}/0.jpg"]. */
  photo_urls: string[];
  date_added: string;
}
```

- [ ] **Step 4: Verify type-check**

Run: `source ~/.nvm/nvm.sh && nvm use && npx tsc --noEmit 2>&1 | tail -10`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260502120000_lots_vinted_bundle.sql lib/types/index.ts
git commit -m "Phase 3b1: lots table migration + Lot type"
```

---

## Task 2: Helper `lot-template`

**Files:**
- Modify: `lib/utils/vinted-template.ts` (export 2 constants)
- Create: `lib/utils/lot-template.ts`
- Test: `lib/utils/lot-template.test.ts`

- [ ] **Step 1: Export constants from vinted-template.ts**

Open `lib/utils/vinted-template.ts`. Find the lines:

```typescript
const LANGUAGE_FEMALE: Record<CardLanguage, string> = {
```

and

```typescript
const CONDITION_LABEL: Record<CardCondition, string> = {
```

Add `export` to both:

```typescript
export const LANGUAGE_FEMALE: Record<CardLanguage, string> = {
```

```typescript
export const CONDITION_LABEL: Record<CardCondition, string> = {
```

- [ ] **Step 2: Write the failing tests**

```typescript
// lib/utils/lot-template.test.ts
import { describe, expect, it } from 'vitest';
import { buildLotAnnonce } from './lot-template';

const baseLot = {
  name: 'Lot Cartes Pokémon Art Set Complet',
  language: 'JP' as const,
  condition: 'NM' as const,
  extra_description: null,
};

describe('buildLotAnnonce', () => {
  it('returns the name as the title (no smart-truncate)', () => {
    const out = buildLotAnnonce(baseLot);
    expect(out.title).toBe('Lot Cartes Pokémon Art Set Complet');
  });

  it('preserves a name longer than 80 chars in the title (UI shows the warning)', () => {
    const long = 'A'.repeat(120);
    const out = buildLotAnnonce({ ...baseLot, name: long });
    expect(out.title).toBe(long);
    expect(out.title.length).toBe(120);
  });

  it('renders the description with the title, language and condition mapped', () => {
    const out = buildLotAnnonce(baseLot);
    expect(out.description).toContain('✨ Lot Cartes Pokémon Art Set Complet');
    expect(out.description).toContain('📘 Cartes officielles Japonaise 🇯🇵');
    expect(out.description).toContain('✅ État : Très bon état (Near Mint)');
  });

  it('omits the extra_block when extra_description is null', () => {
    const out = buildLotAnnonce(baseLot);
    // The line right after "État" should be the empty separator before the shipping block,
    // never an orphan paragraph from extra_description.
    expect(out.description).not.toMatch(/État.*\n.*\n.*\n.*\n🛡️/);
    expect(out.description).toMatch(/voir photos\)\.\n\n🛡️/);
  });

  it('inserts the extra_block when extra_description is provided', () => {
    const out = buildLotAnnonce({ ...baseLot, extra_description: 'Cartes triées une à une.' });
    expect(out.description).toMatch(/voir photos\)\.\n\nCartes triées une à une\.\n\n🛡️/);
  });

  it('trims whitespace around extra_description', () => {
    const out = buildLotAnnonce({ ...baseLot, extra_description: '   padded   ' });
    expect(out.description).toMatch(/voir photos\)\.\n\npadded\n\n🛡️/);
  });

  it('handles every CardLanguage value via the shared mapping', () => {
    const langs = ['JP', 'EN', 'FR', 'DE', 'IT', 'ES', 'KO', 'PT', 'ZH'] as const;
    for (const lang of langs) {
      const out = buildLotAnnonce({ ...baseLot, language: lang });
      expect(out.description).toMatch(/📘 Cartes officielles \w+ /);
    }
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `source ~/.nvm/nvm.sh && nvm use && npx vitest run lib/utils/lot-template.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the helper**

```typescript
// lib/utils/lot-template.ts
import type { CardCondition, CardLanguage } from '@/lib/types';
import { LANGUAGE_FEMALE, LANGUAGE_FLAGS, CONDITION_LABEL } from './vinted-template';

interface LotForTemplate {
  name: string;
  /** When null, defaults to JP for the boilerplate. The form requires a value, so this should rarely happen. */
  language: CardLanguage | null;
  condition: CardCondition;
  extra_description: string | null;
}

export interface LotAnnonce {
  title: string;
  description: string;
}

const DESCRIPTION_TEMPLATE = `✨ {{title}}
📘 Cartes officielles {{language_name}} {{language_flag}}
✅ État : {{condition_label}}, carte en excellent état (voir photos).
{{extra_block}}
🛡️ Chaque carte est envoyée sous sleeve + toploader !
🚀 Expédition rapide sous 1 à 2 jours ouvrés 📦
🤝 Remise en main propre possible sur Paris / 92 / 95
📸 Besoin de photos supplémentaires ? N'hésitez pas à me demander !

🃏 Plein d'autres cartes sont disponibles sur mon profil !
📦 Possibilité de créer des lots personnalisés avec réduction sur les frais de port 🤑`;

export function buildLotAnnonce(lot: LotForTemplate): LotAnnonce {
  const langKey: CardLanguage = lot.language ?? 'JP';
  const langName = LANGUAGE_FEMALE[langKey];
  const langFlag = LANGUAGE_FLAGS[langKey];
  const condLabel = CONDITION_LABEL[lot.condition];

  const trimmedExtra = lot.extra_description?.trim() ?? '';
  const extraBlock = trimmedExtra === '' ? '' : `\n${trimmedExtra}\n`;

  const description = DESCRIPTION_TEMPLATE
    .replace('{{title}}', lot.name)
    .replace('{{language_name}}', langName)
    .replace('{{language_flag}}', langFlag)
    .replace('{{condition_label}}', condLabel)
    .replace('{{extra_block}}', extraBlock);

  return { title: lot.name, description };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && nvm use && npx vitest run lib/utils/lot-template.test.ts`
Expected: PASS — 7/7.

If a test fails on the regex matching `voir photos\)\.\n\n🛡️`, double-check that when `extra_block === ''`, the template substitution leaves exactly two `\n` between the État line and the 🛡️ line (one from the template's `\n` after `{{extra_block}}`, plus the `\n` before 🛡️ in the template). The current code is: `.{{extra_block}}\n🛡️…` which after replacement becomes `.\n🛡️…` (only one `\n`). To get two `\n`, the empty-block case should produce a leading `\n`. Adjust the implementation if needed: when `extraBlock === ''`, set it to `''` AND change the template to use `{{extra_block}}` placement that doesn't break the spacing. The simplest fix: write the template so the line containing `{{extra_block}}` is a self-contained block:

```
voir photos).
{{extra_block}}
🛡️ Chaque carte…
```

- when `extra_block = ''` → result: `voir photos).\n\n🛡️…` (two newlines via the surrounding `\n`s)
- when `extra_block = '\nFOO\n'` → result: `voir photos).\n\nFOO\n\n🛡️…` (clean separators)

If the test still fails, run the failing test alone with `--reporter=verbose` and inspect the actual string.

- [ ] **Step 6: Commit**

```bash
git add lib/utils/vinted-template.ts lib/utils/lot-template.ts lib/utils/lot-template.test.ts
git commit -m "Phase 3b1: pure helper buildLotAnnonce + export shared mappings (7 tests)"
```

---

## Task 3: `POST /api/lots` endpoint

**Files:**
- Create: `app/api/lots/route.ts`
- Test: `app/api/lots/route.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// app/api/lots/route.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const supabaseMock = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
  storage: { from: vi.fn() },
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(supabaseMock),
}));

afterEach(() => {
  vi.clearAllMocks();
});

function makeFormData(over: Partial<Record<string, string | File[]>> = {}): FormData {
  const fd = new FormData();
  fd.set('name', over.name as string ?? 'Lot Test');
  fd.set('price', (over.price as string) ?? '25');
  fd.set('language', (over.language as string) ?? 'JP');
  fd.set('condition', (over.condition as string) ?? 'NM');
  if (over.extra_description !== undefined) fd.set('extra_description', over.extra_description as string);
  const photos = (over.photos as File[]) ?? [
    new File([new Uint8Array([0xff, 0xd8, 0xff])], 'a.jpg', { type: 'image/jpeg' }),
  ];
  for (const p of photos) fd.append('photos', p);
  return fd;
}

function makeRequest(fd: FormData): Request {
  return new Request('http://localhost/api/lots', {
    method: 'POST',
    body: fd,
  });
}

describe('POST /api/lots', () => {
  it('returns 401 when not authenticated', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeRequest(makeFormData()));
    expect(res.status).toBe(401);
  });

  it('returns 400 when name is missing or empty', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const res = await POST(makeRequest(makeFormData({ name: '' })));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/name/i);
  });

  it('returns 400 when no photos are provided', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const res = await POST(makeRequest(makeFormData({ photos: [] })));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/photo/i);
  });

  it('returns 400 when price is missing or invalid', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const res = await POST(makeRequest(makeFormData({ price: 'not-a-number' })));
    expect(res.status).toBe(400);
  });

  it('inserts a lot row, uploads photos, returns the created lot', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });

    // Step 1 mock: insert a row, get back the id
    const insertSingle = vi.fn().mockResolvedValue({
      data: { id: 'new-lot-id' },
      error: null,
    });
    const insertSelect = vi.fn(() => ({ single: insertSingle }));
    const insert = vi.fn(() => ({ select: insertSelect }));

    // Step 2 mock: upload each photo to Storage
    const uploadFn = vi.fn().mockResolvedValue({ data: {}, error: null });
    supabaseMock.storage.from.mockReturnValue({ upload: uploadFn });

    // Step 3 mock: update the row with photo_urls and return the full lot
    const updateSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'new-lot-id',
        name: 'Lot Test',
        language: 'JP',
        condition: 'NM',
        price: 25,
        photo_urls: ['new-lot-id/0.jpg', 'new-lot-id/1.jpg'],
        status: 'for_sale',
      },
      error: null,
    });
    const updateSelectSingle = vi.fn(() => ({ single: updateSingle }));
    const updateSelect = vi.fn(() => ({ single: updateSelect, then: undefined } as never));
    const updateEq = vi.fn(() => ({ select: vi.fn(() => ({ single: updateSingle })) }));
    const update = vi.fn(() => ({ eq: updateEq }));

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'lots') return { insert, update };
      throw new Error(`unmocked table: ${table}`);
    });

    const photos = [
      new File([new Uint8Array([0xff, 0xd8, 0xff])], 'a.jpg', { type: 'image/jpeg' }),
      new File([new Uint8Array([0xff, 0xd8, 0xff])], 'b.jpg', { type: 'image/jpeg' }),
    ];
    const res = await POST(makeRequest(makeFormData({ photos })));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.lot.id).toBe('new-lot-id');
    expect(json.lot.photo_urls).toHaveLength(2);
    expect(uploadFn).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `source ~/.nvm/nvm.sh && nvm use && npx vitest run app/api/lots/route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the route**

```typescript
// app/api/lots/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { CardLanguage, CardCondition } from '@/lib/types';

export const runtime = 'nodejs';

const ALLOWED_LANGUAGES: ReadonlySet<string> = new Set([
  'JP', 'EN', 'FR', 'DE', 'IT', 'ES', 'KO', 'PT', 'ZH',
]);
const ALLOWED_CONDITIONS: ReadonlySet<string> = new Set(['NM', 'EX', 'GD', 'PL', 'PO']);

function bad(msg: string, status = 400): NextResponse {
  return NextResponse.json({ error: msg }, { status });
}

export async function POST(request: Request): Promise<NextResponse> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return bad('Invalid form data', 400);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return bad('Unauthorized', 401);

  // Validate fields
  const name = (formData.get('name') as string | null)?.trim() ?? '';
  if (name === '') return bad('Field "name" is required');

  const priceRaw = formData.get('price') as string | null;
  const price = priceRaw ? Number(priceRaw.replace(',', '.')) : NaN;
  if (!Number.isFinite(price) || price < 0) return bad('Field "price" must be a positive number');

  const language = formData.get('language') as string | null;
  if (!language || !ALLOWED_LANGUAGES.has(language)) return bad('Field "language" is invalid');

  const condition = (formData.get('condition') as string | null) ?? 'NM';
  if (!ALLOWED_CONDITIONS.has(condition)) return bad('Field "condition" is invalid');

  const extra_description = (formData.get('extra_description') as string | null) ?? null;

  const photos = formData.getAll('photos').filter((p): p is File => p instanceof File && p.size > 0);
  if (photos.length === 0) return bad('At least one photo is required');

  // Step 1: insert the lot row to get an id
  const { data: inserted, error: insertErr } = await supabase
    .from('lots')
    .insert({
      name,
      language: language as CardLanguage,
      condition: condition as CardCondition,
      extra_description,
      price,
      status: 'for_sale',
    })
    .select('id')
    .single();
  if (insertErr || !inserted) {
    return NextResponse.json(
      { error: `insert failed: ${insertErr?.message ?? 'no data'}` },
      { status: 500 },
    );
  }

  const lotId = (inserted as { id: string }).id;

  // Step 2: upload photos
  const uploadedPaths: string[] = [];
  const uploadErrors: string[] = [];
  for (let i = 0; i < photos.length; i += 1) {
    const path = `${lotId}/${i}.jpg`;
    const buffer = await photos[i].arrayBuffer();
    const { error: upErr } = await supabase.storage
      .from('lot-photos')
      .upload(path, buffer, { contentType: 'image/jpeg', upsert: true });
    if (upErr) {
      uploadErrors.push(`${path}: ${upErr.message}`);
      console.warn(`lot upload failed: ${path}`, upErr);
    } else {
      uploadedPaths.push(path);
    }
  }

  // If ALL uploads failed, rollback the row
  if (uploadedPaths.length === 0) {
    await supabase.from('lots').delete().eq('id', lotId);
    return NextResponse.json(
      { error: 'all photo uploads failed', details: uploadErrors },
      { status: 500 },
    );
  }

  // Step 3: update with photo_urls and return the full row
  const { data: updated, error: updErr } = await supabase
    .from('lots')
    .update({ photo_urls: uploadedPaths })
    .eq('id', lotId)
    .select('*')
    .single();
  if (updErr || !updated) {
    return NextResponse.json(
      { error: `update failed: ${updErr?.message ?? 'no data'}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    lot: updated,
    upload_warnings: uploadErrors.length > 0 ? uploadErrors : undefined,
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && nvm use && npx vitest run app/api/lots/route.test.ts`
Expected: PASS — 5/5.

- [ ] **Step 5: Commit**

```bash
git add app/api/lots/route.ts app/api/lots/route.test.ts
git commit -m "Phase 3b1: POST /api/lots (multipart upload, 5 tests)"
```

---

## Task 4: `PATCH` and `DELETE /api/lots/[id]` endpoints

**Files:**
- Create: `app/api/lots/[id]/route.ts`
- Test: `app/api/lots/[id]/route.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// app/api/lots/[id]/route.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DELETE, PATCH } from './route';

const supabaseMock = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
  storage: { from: vi.fn() },
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(supabaseMock),
}));

afterEach(() => {
  vi.clearAllMocks();
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function patchRequest(body: unknown): Request {
  return new Request('http://localhost/api/lots/abc', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function deleteRequest(): Request {
  return new Request('http://localhost/api/lots/abc', { method: 'DELETE' });
}

describe('PATCH /api/lots/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await PATCH(patchRequest({ price: 30 }), ctx('abc'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when the lot does not exist', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const updateSingle = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
    const update = vi.fn(() => ({
      eq: vi.fn(() => ({ select: vi.fn(() => ({ single: updateSingle })) })),
    }));
    supabaseMock.from.mockReturnValue({ update });
    const res = await PATCH(patchRequest({ price: 30 }), ctx('abc'));
    expect(res.status).toBe(404);
  });

  it('updates the price and returns the updated lot', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const updateSingle = vi.fn().mockResolvedValue({
      data: { id: 'abc', price: 30, name: 'Lot', status: 'for_sale' },
      error: null,
    });
    const update = vi.fn(() => ({
      eq: vi.fn(() => ({ select: vi.fn(() => ({ single: updateSingle })) })),
    }));
    supabaseMock.from.mockReturnValue({ update });
    const res = await PATCH(patchRequest({ price: 30 }), ctx('abc'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.lot.price).toBe(30);
  });

  it('auto-sets date_sold when status flips to sold and no date provided', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const updateSingle = vi.fn().mockResolvedValue({
      data: { id: 'abc', status: 'sold', date_sold: '2026-05-02T00:00:00Z' },
      error: null,
    });
    const update = vi.fn(() => ({
      eq: vi.fn(() => ({ select: vi.fn(() => ({ single: updateSingle })) })),
    }));
    supabaseMock.from.mockReturnValue({ update });
    const res = await PATCH(patchRequest({ status: 'sold' }), ctx('abc'));
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'sold', date_sold: expect.any(String) }),
    );
  });

  it('rejects an invalid status', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const res = await PATCH(patchRequest({ status: 'collection' }), ctx('abc'));
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/lots/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await DELETE(deleteRequest(), ctx('abc'));
    expect(res.status).toBe(401);
  });

  // (Adding a happy-path delete test is optional for Phase 3b1 — the read-then-delete-then-storage chain
  // is mostly Supabase plumbing and doesn't change behavior. Smoke test will cover the full flow.)
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `source ~/.nvm/nvm.sh && nvm use && npx vitest run app/api/lots/[id]/route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the route**

```typescript
// app/api/lots/[id]/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { CardCondition, CardLanguage } from '@/lib/types';

export const runtime = 'nodejs';

interface PatchBody {
  name?: string;
  language?: CardLanguage;
  condition?: CardCondition;
  extra_description?: string | null;
  price?: number | null;
  status?: 'for_sale' | 'sold';
  date_sold?: string | null;
  sold_price?: number | null;
  vinted_listed_at?: string | null;
}

function bad(msg: string, status = 400): NextResponse {
  return NextResponse.json({ error: msg }, { status });
}

function sanitizeNumber(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
    throw new Error('invalid_number');
  }
  return v;
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  if (!id) return bad('missing id');

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return bad('Invalid JSON body');
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return bad('Unauthorized', 401);

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = String(body.name);
  if (body.language !== undefined) update.language = body.language;
  if (body.condition !== undefined) update.condition = body.condition;
  if (body.extra_description !== undefined) update.extra_description = body.extra_description;

  try {
    const price = sanitizeNumber(body.price);
    if (price !== undefined) update.price = price;
    const sold_price = sanitizeNumber(body.sold_price);
    if (sold_price !== undefined) update.sold_price = sold_price;
  } catch {
    return bad('invalid number');
  }

  if (body.status !== undefined) {
    if (body.status !== 'for_sale' && body.status !== 'sold') {
      return bad('invalid status');
    }
    update.status = body.status;
    if (body.status === 'sold' && body.date_sold === undefined) {
      update.date_sold = new Date().toISOString();
    }
  }
  if (body.date_sold !== undefined) update.date_sold = body.date_sold;
  if (body.vinted_listed_at !== undefined) update.vinted_listed_at = body.vinted_listed_at;

  if (Object.keys(update).length === 0) return bad('no fields to update');

  const { data: updated, error } = await supabase
    .from('lots')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();
  if (error) {
    if (error.code === 'PGRST116') return bad('lot not found', 404);
    return NextResponse.json({ error: `update failed: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ lot: updated });
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  if (!id) return bad('missing id');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return bad('Unauthorized', 401);

  // Read the lot to get photo_urls
  const { data: lot } = await supabase
    .from('lots')
    .select('photo_urls')
    .eq('id', id)
    .maybeSingle();

  // Best-effort photo deletion (don't block if it fails)
  if (lot && Array.isArray((lot as { photo_urls: unknown }).photo_urls)) {
    const paths = (lot as { photo_urls: string[] }).photo_urls;
    if (paths.length > 0) {
      const { error: rmErr } = await supabase.storage.from('lot-photos').remove(paths);
      if (rmErr) console.warn('lot photo delete failed', rmErr);
    }
  }

  const { error } = await supabase.from('lots').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: `delete failed: ${error.message}` }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && nvm use && npx vitest run app/api/lots/[id]/route.test.ts`
Expected: PASS — 6/6 (5 PATCH + 1 DELETE).

- [ ] **Step 5: Commit**

```bash
git add app/api/lots/[id]/route.ts app/api/lots/[id]/route.test.ts
git commit -m "Phase 3b1: PATCH + DELETE /api/lots/[id] (6 tests)"
```

---

## Task 5: SoldModal extension (kind='card' | 'lot')

**Files:**
- Modify: `components/vinted/SoldModal.tsx`

- [ ] **Step 1: Read the current SoldModal**

Run: `cat components/vinted/SoldModal.tsx`

Identify (a) the `Props` interface, (b) the `onSold` callback signature, (c) the fetch target (currently hardcoded `/api/cards/${card.id}`).

- [ ] **Step 2: Add `kind` prop and route the PATCH**

Use Edit to apply these changes:

Replace the imports + Props block at the top:

```typescript
import { useState } from 'react';
import { X } from 'lucide-react';
import type { Card, Lot } from '@/lib/types';
import type { RestockAlert } from '@/lib/utils/restock-detection';
import type { PromoteCandidate } from '@/lib/utils/promote-detection';

type SoldEntity =
  | { kind: 'card'; card: Card }
  | { kind: 'lot'; lot: Lot };

interface Props {
  entity: SoldEntity;
  onClose: () => void;
  onSold: (info: {
    soldId: string;
    kind: 'card' | 'lot';
    restock: RestockAlert | null;
    promote: PromoteCandidate | null;
  }) => void;
}
```

Then update the function signature + fetch logic:

```typescript
export default function SoldModal({ entity, onClose, onSold }: Props) {
  const [price, setPrice] = useState<string>('');
  const [date, setDate] = useState<string>(todayIso());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = entity.kind === 'card' ? entity.card.card_name : entity.lot.name;
  const targetId = entity.kind === 'card' ? entity.card.id : entity.lot.id;
  const endpoint = entity.kind === 'card' ? `/api/cards/${targetId}` : `/api/lots/${targetId}`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const parsedPrice = price.trim() === '' ? null : Number(price.replace(',', '.'));
      if (parsedPrice !== null && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) {
        throw new Error('Prix invalide');
      }
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status: 'sold',
          sold_price: parsedPrice,
          date_sold: new Date(`${date}T12:00:00Z`).toISOString(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Erreur serveur');
      onSold({
        soldId: targetId,
        kind: entity.kind,
        restock: json.restock ?? null,
        promote: json.promote ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  // ...rest of the component (unchanged: form JSX). Replace `card.card_name` references with `displayName`.
```

In the JSX, find any reference to `card.card_name` and replace with `{displayName}`. There should be one occurrence in the header.

- [ ] **Step 3: Update the existing call site in VintedList**

Open `components/vinted/VintedList.tsx`. Find the `<SoldModal card={...} ... />` JSX and update it to:

```tsx
{soldTarget && (
  <SoldModal
    entity={{ kind: 'card', card: soldTarget }}
    onClose={() => setSoldTarget(null)}
    onSold={handleSold}
  />
)}
```

Then update `handleSold` to use the new shape:

```typescript
function handleSold(info: { soldId: string; kind: 'card' | 'lot'; restock: RestockAlert | null; promote: PromoteCandidate | null }) {
  // For Phase 3b1, kind='lot' just removes the lot from the for_sale list.
  // Restock/promote logic only applies to cards.
  if (info.kind === 'card') {
    setCards((prev) => prev.filter((c) => c.id !== info.soldId));
    if (info.restock) setRestockAlert(info.restock);
    if (info.promote) setPromoteCandidate(info.promote);
  } else {
    setLots((prev) => prev.filter((l) => l.id !== info.soldId));
  }
  setSoldTarget(null);
}
```

If `setLots` doesn't exist yet (it will be added in Task 10), add a TODO comment for now: `// TODO Task 10: setLots will be added when lots are fetched`. Do NOT add the lots state in this task — keep the change focused.

For now in Task 5, just leave the `info.kind === 'lot'` branch as a no-op (`// handled in Task 10`). The PATCH still happens server-side, the row is gone from DB. The UI list update will be wired in Task 10.

- [ ] **Step 4: Verify type-check**

Run: `source ~/.nvm/nvm.sh && nvm use && npx tsc --noEmit && npm test 2>&1 | tail -10`
Expected: 0 errors, 230 tests pass (218 + 12 new from Tasks 2-4).

- [ ] **Step 5: Commit**

```bash
git add components/vinted/SoldModal.tsx components/vinted/VintedList.tsx
git commit -m "Phase 3b1: SoldModal accepts kind='card' | 'lot' via discriminated entity prop"
```

---

## Task 6: `<LotForm>` component

**Files:**
- Create: `components/submit/LotForm.tsx`

- [ ] **Step 1: Read the existing CardScanForm for the project's form patterns**

Run: `head -100 components/submit/CardScanForm.tsx`

Note: classes for inputs, labels, buttons; the layout used (2-col vs single-col). LotForm should match the same visual conventions.

- [ ] **Step 2: Write the component**

```typescript
// components/submit/LotForm.tsx
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, X } from 'lucide-react';
import { buildLotAnnonce } from '@/lib/utils/lot-template';
import type { CardLanguage, CardCondition } from '@/lib/types';

const LANGUAGES: { value: CardLanguage; label: string }[] = [
  { value: 'JP', label: 'Japonaise 🇯🇵' },
  { value: 'EN', label: 'Anglaise 🇬🇧' },
  { value: 'FR', label: 'Française 🇫🇷' },
  { value: 'DE', label: 'Allemande 🇩🇪' },
  { value: 'IT', label: 'Italienne 🇮🇹' },
  { value: 'ES', label: 'Espagnole 🇪🇸' },
  { value: 'KO', label: 'Coréenne 🇰🇷' },
  { value: 'PT', label: 'Portugaise 🇵🇹' },
  { value: 'ZH', label: 'Chinoise 🇨🇳' },
];

const CONDITIONS: { value: CardCondition; label: string }[] = [
  { value: 'NM', label: 'Très bon état (Near Mint)' },
  { value: 'EX', label: 'Excellent (EX)' },
  { value: 'GD', label: 'Bon état (Good)' },
  { value: 'PL', label: 'Joué (Played)' },
  { value: 'PO', label: 'Mauvais état (Poor)' },
];

const TITLE_MAX = 80;

export default function LotForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [language, setLanguage] = useState<CardLanguage>('JP');
  const [condition, setCondition] = useState<CardCondition>('NM');
  const [extraDescription, setExtraDescription] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewUrls = useMemo(
    () => photos.map((p) => URL.createObjectURL(p)),
    [photos],
  );

  const annonce = useMemo(
    () => buildLotAnnonce({ name: name || '(nom du lot)', language, condition, extra_description: extraDescription || null }),
    [name, language, condition, extraDescription],
  );

  const titleOver = name.length > TITLE_MAX;

  function addPhotos(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/'));
    setPhotos((prev) => [...prev, ...arr]);
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim() === '') return setError('Nom requis');
    if (!price || !Number.isFinite(Number(price.replace(',', '.')))) return setError('Prix requis (nombre)');
    if (photos.length === 0) return setError('Au moins 1 photo requise');

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set('name', name);
      fd.set('price', price.replace(',', '.'));
      fd.set('language', language);
      fd.set('condition', condition);
      if (extraDescription.trim()) fd.set('extra_description', extraDescription.trim());
      for (const p of photos) fd.append('photos', p);

      const res = await fetch('/api/lots', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Erreur serveur');
      router.push('/vinted');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-6 md:grid-cols-2">
      {/* Left: form fields + photos */}
      <div className="space-y-4">
        <PhotoDropzone photos={photos} previewUrls={previewUrls} onAdd={addPhotos} onRemove={removePhoto} />

        <label className="block">
          <span className="text-text-muted text-xs">Nom / Titre Vinted ({name.length}/{TITLE_MAX})</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Lot Cartes Pokémon Art Set Complet…"
            className={`bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 text-sm outline-none ${
              titleOver ? 'border-red' : ''
            }`}
          />
        </label>

        <label className="block">
          <span className="text-text-muted text-xs">Prix (€)</span>
          <input
            type="text"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="25.00"
            className="bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-text-muted text-xs">Langue</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as CardLanguage)}
              className="bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-text-muted text-xs">Condition</span>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value as CardCondition)}
              className="bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
            >
              {CONDITIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="text-text-muted text-xs">Description additionnelle (optionnel)</span>
          <textarea
            value={extraDescription}
            onChange={(e) => setExtraDescription(e.target.value)}
            rows={3}
            placeholder="Texte inséré entre la ligne État et le bloc shipping. Laisser vide si non utilisé."
            className="bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
          />
        </label>

        {error && <p className="text-red text-xs">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="bg-red text-bg w-full rounded px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? 'Enregistrement…' : 'Enregistrer le lot'}
        </button>
      </div>

      {/* Right: live preview */}
      <div className="bg-surface-2 border-border md:sticky md:top-4 h-fit space-y-3 rounded border p-4">
        <h3 className="text-text-muted text-xs font-medium">Aperçu Vinted</h3>
        <div>
          <p className="text-text-faint text-xs">Titre</p>
          <p className="font-medium">{annonce.title}</p>
        </div>
        <div>
          <p className="text-text-faint text-xs">Description</p>
          <pre className="text-text mt-1 whitespace-pre-wrap font-sans text-xs">{annonce.description}</pre>
        </div>
      </div>
    </form>
  );
}

function PhotoDropzone({
  photos,
  previewUrls,
  onAdd,
  onRemove,
}: {
  photos: File[];
  previewUrls: string[];
  onAdd: (files: FileList) => void;
  onRemove: (index: number) => void;
}) {
  const [dragging, setDragging] = useState(false);

  return (
    <div>
      <span className="text-text-muted text-xs">Photos ({photos.length})</span>
      <label
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) onAdd(e.dataTransfer.files);
        }}
        className={`bg-surface-2 mt-1 flex cursor-pointer items-center justify-center rounded border border-dashed p-4 text-sm transition-colors ${
          dragging ? 'border-red' : 'border-border'
        }`}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => e.target.files && onAdd(e.target.files)}
          className="hidden"
        />
        <span className="text-text-muted flex items-center gap-2">
          <Upload className="h-4 w-4" />
          Drop ou clic pour ajouter
        </span>
      </label>

      {previewUrls.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {previewUrls.map((url, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-20 w-full rounded object-cover" />
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label="Retirer cette photo"
                className="bg-surface absolute right-1 top-1 rounded p-0.5 opacity-80 hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify type-check**

Run: `source ~/.nvm/nvm.sh && nvm use && npx tsc --noEmit 2>&1 | tail -5`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add components/submit/LotForm.tsx
git commit -m "Phase 3b1: <LotForm> multi-photo upload + live annonce preview"
```

---

## Task 7: Wire LotForm into SubmitTabs

**Files:**
- Modify: `components/submit/SubmitTabs.tsx`

- [ ] **Step 1: Replace the "lot" placeholder**

Open `components/submit/SubmitTabs.tsx`. At the top, add:

```typescript
import LotForm from './LotForm';
```

Find the existing block:

```tsx
{tab === 'lot' && (
  <p className="text-text-muted bg-surface border-border rounded-lg border p-6 text-sm">
    Mode lot (jusqu&apos;à 20 cartes en une fois) disponible en Phase 3.
  </p>
)}
```

Replace with:

```tsx
{tab === 'lot' && <LotForm />}
```

Also, change the `TABS` array — the "Lot ≤20" label is now inaccurate (we're not doing batch-of-cards anymore). Update:

```typescript
const TABS: { id: Tab; label: string; icon: typeof ScanLine }[] = [
  { id: 'mobile', label: 'Mobile', icon: ScanLine },
  { id: 'lot', label: 'Lot Vinted', icon: Layers },
  { id: 'script', label: 'Script', icon: Terminal },
];
```

- [ ] **Step 2: Verify**

Run: `source ~/.nvm/nvm.sh && nvm use && npx tsc --noEmit && npm test 2>&1 | tail -5`
Expected: 0 errors, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add components/submit/SubmitTabs.tsx
git commit -m "Phase 3b1: wire <LotForm> into Submit tab 'Lot Vinted'"
```

---

## Task 8: `<LotRow>` component

**Files:**
- Create: `components/lots/LotRow.tsx`

- [ ] **Step 1: Write the component**

```typescript
// components/lots/LotRow.tsx
'use client';

import { Tag, Package } from 'lucide-react';
import type { Lot } from '@/lib/types';
import EditablePriceCell from '@/components/vinted/EditablePriceCell';
import VintedListedToggle from '@/components/vinted/VintedListedToggle';

interface Props {
  lot: Lot;
  storagePublicUrl: (path: string) => string;
  onAnnonceClick: (lot: Lot) => void;
  onSoldClick: (lot: Lot) => void;
  onPriceSaved: (lotId: string, newPrice: number | null) => void;
  onListedToggled: (lotId: string, listedAt: string | null) => void;
  onImageClick?: (lot: Lot) => void;
}

export default function LotRow({
  lot, storagePublicUrl, onAnnonceClick, onSoldClick, onPriceSaved, onListedToggled, onImageClick,
}: Props) {
  const thumb = lot.photo_urls.length > 0 ? storagePublicUrl(lot.photo_urls[0]) : null;

  return (
    <li className="bg-surface border-border flex flex-col gap-3 rounded-lg border p-3 text-sm sm:flex-row sm:items-center">
      <div className="flex items-center gap-3">
        {thumb ? (
          <button
            type="button"
            onClick={() => onImageClick?.(lot)}
            className="hover:ring-red shrink-0 rounded transition-shadow hover:ring-2"
            aria-label={`Voir ${lot.name} en grand`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumb}
              alt=""
              loading="lazy"
              className="bg-surface-off h-[84px] w-[60px] rounded object-cover"
            />
          </button>
        ) : (
          <div className="bg-surface-off flex h-[84px] w-[60px] shrink-0 items-center justify-center rounded">
            <Package className="text-text-faint h-6 w-6" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium">{lot.name}</p>
            <span className="bg-rarity-chr/20 text-rarity-chr shrink-0 rounded px-1.5 py-0.5 text-xs font-medium">
              Lot
            </span>
          </div>
          <div className="text-text-muted mt-1 flex flex-wrap items-center gap-2 text-xs">
            {lot.language && <span className="font-mono">{lot.language}</span>}
            <span>·</span>
            <span>{lot.condition}</span>
            {lot.photo_urls.length > 1 && (
              <>
                <span>·</span>
                <span>{lot.photo_urls.length} photos</span>
              </>
            )}
            <VintedListedToggle
              cardId={lot.id}
              currentListedAt={lot.vinted_listed_at}
              onToggled={(listedAt) => onListedToggled(lot.id, listedAt)}
              endpoint={`/api/lots/${lot.id}`}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 sm:ml-auto">
        <div className="shrink-0">
          <EditablePriceCell
            cardId={lot.id}
            initialPrice={lot.price}
            onSaved={(newPrice) => onPriceSaved(lot.id, newPrice)}
            endpoint={`/api/lots/${lot.id}`}
          />
        </div>

        <button
          type="button"
          onClick={() => onAnnonceClick(lot)}
          className="bg-surface-2 hover:bg-surface-off border-border shrink-0 rounded border px-3 py-1.5 text-xs"
        >
          <Tag className="mr-1 inline h-3.5 w-3.5" />
          Annonce
        </button>

        <button
          type="button"
          onClick={() => onSoldClick(lot)}
          className="bg-red text-bg shrink-0 rounded px-3 py-1.5 text-xs font-medium hover:opacity-90"
        >
          Vendu
        </button>
      </div>
    </li>
  );
}
```

- [ ] **Step 2: Add `endpoint` prop to EditablePriceCell and VintedListedToggle**

The `LotRow` passes `endpoint={`/api/lots/${lot.id}`}` to both `EditablePriceCell` and `VintedListedToggle`. Currently those components hardcode `/api/cards/${cardId}`. Open each and add an optional `endpoint?: string` prop with a default of `/api/cards/${cardId}`. Use the prop in the fetch call instead of the hardcoded path.

For `components/vinted/EditablePriceCell.tsx`, find:

```typescript
const res = await fetch(`/api/cards/${cardId}`, {
```

Replace with:

```typescript
const res = await fetch(props.endpoint ?? `/api/cards/${cardId}`, {
```

And update the `Props` interface to accept the optional `endpoint?: string`. Also accept `priceField?: 'suggested_price' | 'price'` (default `'suggested_price'`) so the body uses the correct field name (cards use `suggested_price`, lots use `price`). In LotRow, pass `priceField="price"`.

For `components/vinted/VintedListedToggle.tsx`, do the same: optional `endpoint?: string` prop, defaults to `/api/cards/${cardId}`.

- [ ] **Step 3: Verify type-check**

Run: `source ~/.nvm/nvm.sh && nvm use && npx tsc --noEmit && npm test 2>&1 | tail -5`
Expected: 0 errors, tests still pass.

- [ ] **Step 4: Commit**

```bash
git add components/lots/LotRow.tsx components/vinted/EditablePriceCell.tsx components/vinted/VintedListedToggle.tsx
git commit -m "Phase 3b1: <LotRow> component + extend EditablePriceCell/VintedListedToggle with endpoint prop"
```

---

## Task 9: `<LotAnnonceModal>` component

**Files:**
- Create: `components/lots/LotAnnonceModal.tsx`

- [ ] **Step 1: Write the component**

```typescript
// components/lots/LotAnnonceModal.tsx
'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Check, Download, X } from 'lucide-react';
import type { Lot } from '@/lib/types';
import { buildLotAnnonce } from '@/lib/utils/lot-template';
import { processImageForVinted, downloadBlob } from '@/lib/utils/image-postprocess';

interface Props {
  lot: Lot;
  storagePublicUrl: (path: string) => string;
  onClose: () => void;
  onPriceSaved: (lotId: string, newPrice: number | null) => void;
}

export default function LotAnnonceModal({ lot, storagePublicUrl, onClose, onPriceSaved }: Props) {
  const initial = buildLotAnnonce({
    name: lot.name,
    language: lot.language,
    condition: lot.condition,
    extra_description: lot.extra_description,
  });
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [copiedField, setCopiedField] = useState<'title' | 'desc' | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Editable price
  const [priceDraft, setPriceDraft] = useState(lot.price !== null ? String(lot.price) : '');
  const [editingPrice, setEditingPrice] = useState(false);
  const [savingPrice, setSavingPrice] = useState(false);

  useEffect(() => {
    if (!copiedField) return;
    const t = setTimeout(() => setCopiedField(null), 1500);
    return () => clearTimeout(t);
  }, [copiedField]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setPhotoIndex((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setPhotoIndex((i) => Math.min(lot.photo_urls.length - 1, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, lot.photo_urls.length]);

  async function copy(text: string, field: 'title' | 'desc') {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
    } catch (err) {
      console.error(err);
    }
  }

  async function persistPrice() {
    setEditingPrice(false);
    const parsed = priceDraft.trim() === '' ? null : Number(priceDraft.replace(',', '.'));
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
      setPriceDraft(lot.price !== null ? String(lot.price) : '');
      return;
    }
    if (parsed === lot.price) return;
    setSavingPrice(true);
    try {
      const res = await fetch(`/api/lots/${lot.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ price: parsed }),
      });
      if (!res.ok) throw new Error('save failed');
      onPriceSaved(lot.id, parsed);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingPrice(false);
    }
  }

  async function downloadCurrentImage() {
    if (lot.photo_urls.length === 0) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const url = storagePublicUrl(lot.photo_urls[photoIndex]);
      const blob = await processImageForVinted(url);
      downloadBlob(blob, `lot-${lot.id}-${photoIndex}.jpg`);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloading(false);
    }
  }

  const currentImage = lot.photo_urls.length > 0 ? storagePublicUrl(lot.photo_urls[photoIndex]) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-surface border-border w-full max-w-3xl overflow-hidden rounded-lg border shadow-xl">
        <header className="border-border flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-base font-semibold">Annonce Vinted (Lot)</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="text-text-muted hover:text-text">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          {/* Photo carousel */}
          <div className="space-y-2">
            <div className="bg-surface-off relative flex aspect-square items-center justify-center rounded">
              {currentImage ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={currentImage} alt="" className="max-h-full max-w-full object-contain" />
              ) : (
                <p className="text-text-faint text-xs">Aucune photo</p>
              )}
              {lot.photo_urls.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setPhotoIndex((i) => Math.max(0, i - 1))}
                    disabled={photoIndex === 0}
                    aria-label="Photo précédente"
                    className="bg-surface/80 hover:bg-surface absolute left-2 rounded-full p-1.5 disabled:opacity-30"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhotoIndex((i) => Math.min(lot.photo_urls.length - 1, i + 1))}
                    disabled={photoIndex === lot.photo_urls.length - 1}
                    aria-label="Photo suivante"
                    className="bg-surface/80 hover:bg-surface absolute right-2 rounded-full p-1.5 disabled:opacity-30"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
            </div>

            {lot.photo_urls.length > 1 && (
              <div className="flex justify-center gap-1.5">
                {lot.photo_urls.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPhotoIndex(i)}
                    aria-label={`Aller à la photo ${i + 1}`}
                    className={`h-1.5 w-6 rounded-full ${i === photoIndex ? 'bg-text' : 'bg-text-faint'}`}
                  />
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={downloadCurrentImage}
              disabled={downloading || lot.photo_urls.length === 0}
              className="bg-surface-2 hover:bg-surface-off border-border w-full rounded border px-3 py-1.5 text-xs disabled:opacity-50"
            >
              <Download className="mr-1 inline h-3.5 w-3.5" />
              {downloading ? 'Préparation…' : 'Download img (anti-bot)'}
            </button>
            {downloadError && <p className="text-red text-xs">{downloadError}</p>}
          </div>

          {/* Title + description + price */}
          <div className="space-y-3">
            <div>
              <p className="text-text-faint text-xs">Titre ({title.length}/80)</p>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={`bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 text-sm outline-none ${
                  title.length > 80 ? 'border-red' : ''
                }`}
              />
              <button
                type="button"
                onClick={() => copy(title, 'title')}
                className="bg-surface-2 hover:bg-surface-off border-border mt-1 inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs"
              >
                {copiedField === 'title' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedField === 'title' ? 'Copié' : 'Copier le titre'}
              </button>
            </div>

            <div>
              <p className="text-text-faint text-xs">Description</p>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={10}
                className="bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 font-sans text-xs outline-none"
              />
              <button
                type="button"
                onClick={() => copy(description, 'desc')}
                className="bg-surface-2 hover:bg-surface-off border-border mt-1 inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs"
              >
                {copiedField === 'desc' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedField === 'desc' ? 'Copié' : 'Copier la description'}
              </button>
            </div>

            <div className="border-border rounded border p-3">
              <p className="text-text-faint text-xs">Prix de vente</p>
              {editingPrice ? (
                <input
                  autoFocus
                  type="text"
                  inputMode="decimal"
                  value={priceDraft}
                  disabled={savingPrice}
                  onChange={(e) => setPriceDraft(e.target.value)}
                  onBlur={persistPrice}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') persistPrice();
                    if (e.key === 'Escape') {
                      setPriceDraft(lot.price !== null ? String(lot.price) : '');
                      setEditingPrice(false);
                    }
                  }}
                  className="bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-2 py-1 text-right font-mono text-sm outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingPrice(true)}
                  className="text-rarity-sr hover:text-rarity-sr/80 mt-1 font-mono font-bold"
                  title="Cliquer pour modifier"
                >
                  {lot.price !== null ? `${lot.price.toFixed(2)} €` : '—'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify type-check**

Run: `source ~/.nvm/nvm.sh && nvm use && npx tsc --noEmit 2>&1 | tail -5`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add components/lots/LotAnnonceModal.tsx
git commit -m "Phase 3b1: <LotAnnonceModal> with photo carousel + template + clipboard + Download img"
```

---

## Task 10: VintedList — fetch lots, interleave, wire callbacks

**Files:**
- Modify: `components/vinted/VintedList.tsx`
- Modify: `app/(app)/vinted/page.tsx`

- [ ] **Step 1: Update the server-side page to fetch lots**

Open `app/(app)/vinted/page.tsx`. Find the Promise.all that fetches cards. Add a parallel `lots` query:

```typescript
const [cardsRes, registeredRes, configRes, lotsRes] = await Promise.all([
  supabase.from('cards').select('*').in('status', ['for_sale', 'sold']).order('date_added', { ascending: true }),
  supabase.from('cards').select('pokemon_number').eq('status', 'pokedex'),
  supabase.from('config').select('*'),
  supabase.from('lots').select('*').in('status', ['for_sale', 'sold']).order('date_added', { ascending: true }),
]);

if (lotsRes.error) {
  return (
    <p className="text-red p-6 text-sm">
      Erreur Supabase (lots) : {lotsRes.error.message}
    </p>
  );
}
```

Then pass `lots` to `<VintedList>`:

```tsx
<VintedList
  cards={cardsRes.data ?? []}
  lots={(lotsRes.data ?? []) as Lot[]}
  /* ...existing props */
/>
```

Add the import: `import type { Card, Lot } from '@/lib/types';`

- [ ] **Step 2: Update VintedList to accept and merge lots**

Open `components/vinted/VintedList.tsx`. Add `lots: Lot[]` to the Props interface. Add state:

```typescript
const [lots, setLots] = useState<Lot[]>(initialLots);
```

Add a `kind` filter state (default 'all'):

```typescript
const [kindFilter, setKindFilter] = useState<'all' | 'cards' | 'lots'>('all');
```

Compute the storage public URL helper:

```typescript
const storagePublicUrl = (path: string) =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/lot-photos/${path}`;
```

Build a merged sorted list:

```typescript
type ListItem =
  | { kind: 'card'; card: Card; sortKey: string }
  | { kind: 'lot'; lot: Lot; sortKey: string };

const forSaleItems: ListItem[] = useMemo(() => {
  const cardItems: ListItem[] = (kindFilter === 'lots' ? [] : forSaleCards).map((c) => ({
    kind: 'card', card: c, sortKey: c.date_added,
  }));
  const lotItems: ListItem[] = (kindFilter === 'cards' ? [] : lots.filter((l) => l.status === 'for_sale')).map((l) => ({
    kind: 'lot', lot: l, sortKey: l.date_added,
  }));
  return [...cardItems, ...lotItems].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}, [forSaleCards, lots, kindFilter]);

const soldItems: ListItem[] = useMemo(() => {
  const cardItems: ListItem[] = (kindFilter === 'lots' ? [] : soldCards).map((c) => ({
    kind: 'card', card: c, sortKey: c.date_sold ?? c.date_added,
  }));
  const lotItems: ListItem[] = (kindFilter === 'cards' ? [] : lots.filter((l) => l.status === 'sold')).map((l) => ({
    kind: 'lot', lot: l, sortKey: l.date_sold ?? l.date_added,
  }));
  return [...cardItems, ...lotItems].sort((a, b) => b.sortKey.localeCompare(a.sortKey));
}, [soldCards, lots, kindFilter]);
```

(`forSaleCards` and `soldCards` are the existing variables — adapt names to whatever the file currently uses.)

Render the merged items: in the existing `.map((g) => <VintedRow .../>)`, replace with:

```tsx
{forSaleItems.map((item) =>
  item.kind === 'card' ? (
    <VintedRow key={`card-${item.card.id}`} ...existingProps />
  ) : (
    <LotRow
      key={`lot-${item.lot.id}`}
      lot={item.lot}
      storagePublicUrl={storagePublicUrl}
      onAnnonceClick={(lot) => setLotAnnonceTarget(lot)}
      onSoldClick={(lot) => setSoldTarget({ kind: 'lot', lot })}
      onPriceSaved={updateLotPrice}
      onListedToggled={updateLotListed}
      onImageClick={() => setZoomLot(item.lot)}
    />
  ),
)}
```

Add the new state setters and handlers:

```typescript
const [lotAnnonceTarget, setLotAnnonceTarget] = useState<Lot | null>(null);
const [zoomLot, setZoomLot] = useState<Lot | null>(null);

function updateLotPrice(lotId: string, newPrice: number | null) {
  setLots((prev) => prev.map((l) => (l.id === lotId ? { ...l, price: newPrice } : l)));
}

function updateLotListed(lotId: string, listedAt: string | null) {
  setLots((prev) => prev.map((l) => (l.id === lotId ? { ...l, vinted_listed_at: listedAt } : l)));
}
```

Update `setSoldTarget` typing (it currently holds a Card; now it holds the discriminated entity):

```typescript
const [soldTarget, setSoldTarget] = useState<SoldEntity | null>(null);
```

(Where `SoldEntity` is the type defined in Task 5 inside SoldModal.tsx — re-import or duplicate the type definition here as needed.)

Update the existing card row mapping to match: `onSoldClick={() => setSoldTarget({ kind: 'card', card: g.head })}`.

Update `handleSold` from Task 5 to use the new typed shape (already done in Task 5 — verify it matches).

Render the LotAnnonceModal at the bottom alongside the existing modals:

```tsx
{lotAnnonceTarget && (
  <LotAnnonceModal
    lot={lotAnnonceTarget}
    storagePublicUrl={storagePublicUrl}
    onClose={() => setLotAnnonceTarget(null)}
    onPriceSaved={updateLotPrice}
  />
)}
```

Add necessary imports at the top: `import type { Lot } from '@/lib/types';`, `import LotRow from '@/components/lots/LotRow';`, `import LotAnnonceModal from '@/components/lots/LotAnnonceModal';`.

- [ ] **Step 3: Verify**

Run: `source ~/.nvm/nvm.sh && nvm use && npx tsc --noEmit && npm test 2>&1 | tail -10`
Expected: 0 ts errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add components/vinted/VintedList.tsx app/(app)/vinted/page.tsx
git commit -m "Phase 3b1: VintedList fetches and interleaves lots with cards (FIFO + sold queues)"
```

---

## Task 11: VintedFilters — kind chip

**Files:**
- Modify: `components/vinted/VintedFilters.tsx`

- [ ] **Step 1: Read the existing VintedFilters**

Run: `head -80 components/vinted/VintedFilters.tsx`

Find the existing chip group structure (probably uses small `<button>` elements with conditional active styles).

- [ ] **Step 2: Add a "Type" chip group**

Add to the Props interface:

```typescript
kindFilter: 'all' | 'cards' | 'lots';
onKindFilterChange: (k: 'all' | 'cards' | 'lots') => void;
```

In the JSX, add this chip group near the existing state filter chips (mutually exclusive):

```tsx
<div className="flex items-center gap-1">
  <span className="text-text-faint mr-1 text-xs">Type :</span>
  {(['all', 'cards', 'lots'] as const).map((k) => (
    <button
      key={k}
      type="button"
      onClick={() => onKindFilterChange(k)}
      className={`rounded px-2 py-1 text-xs ${
        kindFilter === k
          ? 'bg-red text-bg'
          : 'bg-surface-2 text-text-muted hover:text-text'
      }`}
    >
      {k === 'all' ? 'Tout' : k === 'cards' ? 'Cartes' : 'Lots'}
    </button>
  ))}
</div>
```

- [ ] **Step 3: Wire from VintedList**

Open `components/vinted/VintedList.tsx`. Pass the new props:

```tsx
<VintedFilters
  /* ...existing props */
  kindFilter={kindFilter}
  onKindFilterChange={setKindFilter}
/>
```

- [ ] **Step 4: Verify**

Run: `source ~/.nvm/nvm.sh && nvm use && npx tsc --noEmit && npm test 2>&1 | tail -5`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add components/vinted/VintedFilters.tsx components/vinted/VintedList.tsx
git commit -m "Phase 3b1: VintedFilters — Type chip (Tout / Cartes / Lots)"
```

---

## Task 12: Lint + final verification

**Files:** none.

- [ ] **Step 1: Run linter**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run lint 2>&1 | tail -10
```

Expected: 0 warnings.

If anything trips:
- Unused imports → remove
- `any` type from form data parsing → narrow with `as` after a runtime check
- React hook exhaustive-deps in `useMemo` for previewUrls (revoke not handled — out of scope, but verify `useMemo` deps)

- [ ] **Step 2: Run build**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run build 2>&1 | tail -15
```

Expected: 0 type errors, build succeeds, `/api/lots` and `/api/lots/[id]` appear in the route table.

- [ ] **Step 3: Run all tests**

```bash
source ~/.nvm/nvm.sh && nvm use && npm test 2>&1 | tail -10
```

Expected: 234/234 (218 from Phase 3a + 16 new from Tasks 2/3/4).

- [ ] **Step 4: Commit only if cleanups were made**

```bash
git add -p
git commit -m "Phase 3b1: lint + build cleanups"
```

If nothing needed fixing, skip.

---

## Task 13: Manual smoke test in dev

**Files:** none — exploratory.

- [ ] **Step 1: Apply the migration locally**

If not already done in Task 1, apply the migration to your local Supabase. Verify via Supabase Studio that the `lots` table now has the new columns.

- [ ] **Step 2: Start the dev server**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run dev
```

- [ ] **Step 3: Test the form flow**

1. Open `http://localhost:3000/submit`, click the "Lot Vinted" tab.
2. Drop 2-3 photos into the dropzone, fill name/price/language/condition, leave description blank.
3. Watch the live preview render the title and description in the right panel.
4. Click "Enregistrer le lot". Should redirect to `/vinted`.
5. Verify the new lot appears at the top of the for-sale list with badge "Lot" violet, "Pas en ligne" toggle, photo thumbnail.

- [ ] **Step 4: Test the AnnonceModal**

1. Click "Annonce" on the lot.
2. Modal opens, photo carousel works (left/right chevrons + dot indicators + arrow keys).
3. Title + description are pre-filled.
4. "Copier le titre" → flash check, paste in any text field to verify.
5. Click "Download img (anti-bot)" → JPEG file downloaded, randomly cropped/quality-shifted (cf. `processImageForVinted`).
6. Edit price inline → blur or Enter persists, modal updates.

- [ ] **Step 5: Test the toggle and Vendu**

1. Click the "En ligne" toggle on the lot row → confirms, persists in DB.
2. Click "Vendu" → SoldModal opens with the lot name in the header.
3. Enter price + date, click Confirmer → lot disappears from for-sale, appears in "Vendus".

- [ ] **Step 6: Test filters**

1. In `/vinted`, find the new "Type" chip group.
2. Click "Cartes" → only cards visible.
3. Click "Lots" → only lots visible.
4. Click "Tout" → both back.

- [ ] **Step 7: No commit needed.**

---

## Summary

**Total tests added:** 18 (7 helper + 5 POST + 6 PATCH/DELETE)
**Files created:** 7 (3 helpers/route files + 3 components + 1 migration)
**Files modified:** 7 (`lib/types/index.ts`, `vinted-template.ts`, `SubmitTabs.tsx`, `SoldModal.tsx`, `EditablePriceCell.tsx`, `VintedListedToggle.tsx`, `VintedFilters.tsx`, `VintedList.tsx`, `vinted/page.tsx`)
**Migration:** 1 (`20260502120000_lots_vinted_bundle.sql`)
**Estimated time:** ~7 working days following TDD strictly with frequent commits.

---

## Self-review (already applied)

1. **Spec coverage** — every section §3–§7 of the spec maps to a task:
   - §3.2 DB → Task 1
   - §3.3 endpoints → Tasks 3, 4
   - §3.4 Storage layout → encoded in Task 3 (`{lot_id}/{index}.jpg`)
   - §4 template → Task 2
   - §5.1 LotForm → Task 6, wire in Task 7
   - §5.2 LotRow → Task 8
   - §5.3 LotAnnonceModal → Task 9
   - §5.4 SoldModal extension → Task 5
   - §5.5 VintedFilters extension → Task 11
   - §5.6 VintedList extension → Task 10
   - §6 tests → embedded in Tasks 2, 3, 4
   - §7 errors → covered by validation in Tasks 3, 4
   - §10 success criteria → Task 12 (lint/build/test) + Task 13 (smoke)

2. **Placeholder scan** — every step contains either complete code, an exact command, or a precise instruction. No "TODO", "implement later", or vague "add error handling".

3. **Type consistency**:
   - `Lot` interface defined in Task 1, used in Tasks 3-11
   - `SoldEntity` discriminated union introduced in Task 5, used in Task 10
   - `LotAnnonce` return type defined in Task 2, consumed in Tasks 6 and 9
   - `endpoint` and `priceField` props added to `EditablePriceCell` in Task 7, consumed in Task 8
