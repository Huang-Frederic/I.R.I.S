# Phase 3c — Bulk vendu + Gemini tokens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-item bulk-sold flow in `/vinted` (cards + lots, equal price split with last-item remainder) AND instrument Gemini OCR with token-usage logging + cost calculation in EUR + UI debug line.

**Architecture:** Bulk vendu uses sequential client-side PATCH (no new endpoint), with new `<BulkSelectionToggle>` / `<BulkSelectionBottomBar>` / `<BulkSoldModal>` components. The existing `VintedRow` / `LotRow` get optional `selectionMode` + `selected` props. Gemini work : extract `usageMetadata` from API response, compute EUR cost via fixed `USD_TO_EUR`, log line + propagate `_usage` field through `OcrResult` → `CardScanForm` debug UI.

**Tech Stack:** Next.js 16, TypeScript strict, Vitest, Tailwind v4, Lucide icons. No new packages.

**Spec:** [docs/superpowers/specs/2026-05-03-phase-3c-bulk-vendu-tokens-design.md](../specs/2026-05-03-phase-3c-bulk-vendu-tokens-design.md)

---

## File Structure

**New files:**
- `lib/utils/split-bulk-price.ts` — pure helper, last item gets remainder
- `lib/utils/split-bulk-price.test.ts` — 6 tests
- `components/vinted/BulkSelectionBottomBar.tsx` — fixed-bottom slide-in bar
- `components/vinted/BulkSoldModal.tsx` — modal with item list + price total + date + preview

**Modified files:**
- `lib/api/gemini-vision.ts` — constants, `maxOutputTokens`, prompt shortened, extract `usageMetadata`, `_usage` field
- `lib/api/gemini-vision.test.ts` — 2 new tests for `_usage` extraction
- `lib/types/index.ts` — add `GeminiUsage` + `_usage` field on `OcrResult`
- `app/api/ocr/route.ts` — propagate `_usage` from gemini result to JSON response
- `components/submit/CardScanForm.tsx` — render `<hr />` + debug line below the OCR snippet when `ocr._usage` present
- `components/vinted/VintedFilters.tsx` — add `<BulkSelectionToggle>` button next to existing filter chips, lift `selectionMode` toggle via callback
- `components/vinted/VintedList.tsx` — `selectionMode` + `selectedIds` state, propagate to rows, render bottom-bar + modal, bulk handler with sequential PATCH + recap toast
- `components/vinted/VintedRow.tsx` — accept optional `selectionMode`, `selected`, `onToggleSelect` props; render checkbox when in mode; disable Annonce/Vendu buttons in mode
- `components/lots/LotRow.tsx` — same as VintedRow

---

## Task 1: Helper `splitPrice`

**Files:**
- Create: `lib/utils/split-bulk-price.ts`
- Test: `lib/utils/split-bulk-price.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/utils/split-bulk-price.test.ts
import { describe, expect, it } from 'vitest';
import { splitPrice } from './split-bulk-price';

describe('splitPrice', () => {
  it('splits evenly when total divides cleanly', () => {
    expect(splitPrice(100, 4)).toEqual([25, 25, 25, 25]);
    expect(splitPrice(80, 4)).toEqual([20, 20, 20, 20]);
  });

  it('puts the remainder on the LAST item when not evenly divisible', () => {
    expect(splitPrice(100, 3)).toEqual([33.33, 33.33, 33.34]);
    expect(splitPrice(50, 3)).toEqual([16.66, 16.66, 16.68]);
  });

  it('returns zeros when total is 0', () => {
    expect(splitPrice(0, 4)).toEqual([0, 0, 0, 0]);
  });

  it('returns the total in a single-element array when n=1', () => {
    expect(splitPrice(80, 1)).toEqual([80]);
    expect(splitPrice(33.33, 1)).toEqual([33.33]);
  });

  it('throws when n=0 (caller must guard)', () => {
    expect(() => splitPrice(100, 0)).toThrow();
  });

  it('handles decimal totals via cent-rounding', () => {
    // 12.345 → 1234 cents (rounded), split by 2 → [617, 617] cents → [6.17, 6.17]
    expect(splitPrice(12.345, 2)).toEqual([6.17, 6.17]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `source ~/.nvm/nvm.sh && nvm use && npx vitest run lib/utils/split-bulk-price.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the helper**

```typescript
// lib/utils/split-bulk-price.ts
/**
 * Split a total price equally across N items, rounded to cents.
 * The LAST item gets the remainder so the sum matches the input total exactly.
 *
 * Why this matters: 100€ split among 3 items naively gives 33.33 × 3 = 99.99
 * (1¢ short). Banking rule: last bucket absorbs the rounding error.
 *
 * Examples:
 *   splitPrice(100, 4) → [25, 25, 25, 25]
 *   splitPrice(100, 3) → [33.33, 33.33, 33.34]   (sum = 100.00)
 *   splitPrice(0, 5)   → [0, 0, 0, 0, 0]
 *   splitPrice(80, 1)  → [80]
 *   splitPrice(50, 0)  → throws (caller must guard against empty selection)
 */
export function splitPrice(total: number, n: number): number[] {
  if (n <= 0) {
    throw new Error(`splitPrice: n must be > 0, got ${n}`);
  }
  // Work in cents (integer math) to avoid float drift.
  const totalCents = Math.round(total * 100);
  const baseCents = Math.floor(totalCents / n);
  const remainderCents = totalCents - baseCents * n;
  const out: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = baseCents / 100;
  }
  // Put the remainder on the last item.
  out[n - 1] = (baseCents + remainderCents) / 100;
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && nvm use && npx vitest run lib/utils/split-bulk-price.test.ts`
Expected: PASS — 6/6.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/split-bulk-price.ts lib/utils/split-bulk-price.test.ts
git commit -m "Phase 3c: pure helper splitPrice (last item absorbs remainder, 6 tests)"
```

---

## Task 2: Gemini constants + maxOutputTokens + usageMetadata extraction

**Files:**
- Modify: `lib/api/gemini-vision.ts`
- Modify: `lib/api/gemini-vision.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `lib/api/gemini-vision.test.ts`. Find the existing `describe('gemini-vision', ...)` block. Add two new tests inside it, after the existing "extracts valid card data successfully" test:

```typescript
  it('extracts _usage from response when usageMetadata is present', async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  card_name: 'Pikachu',
                  set_code: 'SV1',
                  set_number: '1',
                  language: 'EN',
                  confidence: 'high',
                }),
              },
            ],
          },
        },
      ],
      usageMetadata: {
        promptTokenCount: 350,
        candidatesTokenCount: 80,
        totalTokenCount: 430,
      },
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    }) as unknown as typeof fetch;

    const result = await extractCardFromImage(Buffer.from('fake'));
    expect(result?._usage).toBeDefined();
    expect(result?._usage?.tokens_in).toBe(350);
    expect(result?._usage?.tokens_out).toBe(80);
    // tokens_image = 350 (in) - PROMPT_TOKEN_ESTIMATE (300) = 50
    expect(result?._usage?.tokens_image).toBe(50);
    // cost: (350 * 0.075 + 80 * 0.30) / 1M = 0.0000263 USD * 0.92 = 0.0000242 EUR
    expect(result?._usage?.cost_eur).toBeCloseTo(0.0000242, 7);
  });

  it('omits _usage when usageMetadata is missing', async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  card_name: 'Pikachu',
                  set_code: 'SV1',
                  set_number: '1',
                  language: 'EN',
                  confidence: 'high',
                }),
              },
            ],
          },
        },
      ],
      // no usageMetadata
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    }) as unknown as typeof fetch;

    const result = await extractCardFromImage(Buffer.from('fake'));
    expect(result).not.toBeNull();
    expect(result?._usage).toBeUndefined();
    expect(result?.card_name).toBe('Pikachu');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `source ~/.nvm/nvm.sh && nvm use && npx vitest run lib/api/gemini-vision.test.ts`
Expected: FAIL — `_usage` is not in the result type yet.

- [ ] **Step 3: Add constants + interface + maxOutputTokens + extraction logic**

Open `lib/api/gemini-vision.ts`. After the `import 'server-only';` line at the top, add the constants block:

```typescript
// Gemini Flash Preview pricing (cf. spec §4.1).
const PROMPT_TOKEN_ESTIMATE = 300; // mesuré post-shortening (Task 3), ajuster si bench différe
const COST_USD_PER_M_INPUT = 0.075;
const COST_USD_PER_M_OUTPUT = 0.30;
const USD_TO_EUR = 0.92;
```

After the existing `GeminiCardExtraction` interface, add the usage interface:

```typescript
export interface GeminiUsage {
  tokens_in: number;
  tokens_out: number;
  /** Estimated image tokens (Gemini doesn't break this out, derived = promptTokenCount - PROMPT_TOKEN_ESTIMATE). */
  tokens_image: number;
  cost_eur: number;
}
```

Modify the `GeminiCardExtraction` interface — add the optional field:

```typescript
export interface GeminiCardExtraction {
  // ...existing fields stay unchanged...
  _usage?: GeminiUsage;
}
```

In the `generationConfig` block (around line 99), add `maxOutputTokens: 300`:

```typescript
generationConfig: {
  temperature: 0,
  responseMimeType: 'application/json',
  responseSchema: SCHEMA,
  maxOutputTokens: 300,
},
```

After parsing the response (around line 117 where you find `const data = (await response.json()) as GeminiResp;`), update the `GeminiResp` interface inline + add the usage extraction block right before the existing `parsed` line:

Replace:

```typescript
interface GeminiResp {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}
const data = (await response.json()) as GeminiResp;
const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
if (!text) return null;

const parsed = JSON.parse(text) as Partial<GeminiCardExtraction>;
```

With:

```typescript
interface GeminiResp {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}
const data = (await response.json()) as GeminiResp;
const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
if (!text) return null;

// Extract usage if present. Best-effort — absent if API doesn't return it.
let usage: GeminiUsage | undefined;
const meta = data.usageMetadata;
if (meta && typeof meta.promptTokenCount === 'number' && typeof meta.candidatesTokenCount === 'number') {
  const tokens_in = meta.promptTokenCount;
  const tokens_out = meta.candidatesTokenCount;
  const tokens_image = Math.max(0, tokens_in - PROMPT_TOKEN_ESTIMATE);
  const cost_usd = (tokens_in * COST_USD_PER_M_INPUT + tokens_out * COST_USD_PER_M_OUTPUT) / 1_000_000;
  const cost_eur = cost_usd * USD_TO_EUR;
  usage = { tokens_in, tokens_out, tokens_image, cost_eur };
  console.log(`[Gemini] ${tokens_in}in / ${tokens_out}out / ${tokens_image}img — €${cost_eur.toFixed(6)}`);
}

const parsed = JSON.parse(text) as Partial<GeminiCardExtraction>;
```

Then, in the existing return block at the bottom of the function (around lines 135-151), add the `_usage` field at the end of the returned object:

```typescript
    return {
      // ...existing fields stay unchanged...
      set_name_fr: parsed.set_name_fr || null,
      _usage: usage,  // NEW: undefined if usageMetadata was absent
    };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && nvm use && npx vitest run lib/api/gemini-vision.test.ts`
Expected: PASS — all existing tests + 2 new ones.

- [ ] **Step 5: Commit**

```bash
git add lib/api/gemini-vision.ts lib/api/gemini-vision.test.ts
git commit -m "Phase 3c: extract usageMetadata + cost EUR + maxOutputTokens=300 (2 tests)"
```

---

## Task 3: Shorten the Gemini prompt

**Files:**
- Modify: `lib/api/gemini-vision.ts`

This task has NO new tests. Goal: reduce the `PROMPT` constant from ~500 tokens to ~250-300 tokens without losing accuracy. After shortening, optionally re-bench via `scripts/test-bench-gemini.ts` (Task 10).

- [ ] **Step 1: Replace the PROMPT constant**

Open `lib/api/gemini-vision.ts`. Find the existing `PROMPT` constant (around lines 26-50). Replace its entire content with this shortened version (preserves all business rules):

```typescript
const PROMPT = `Lis une carte Pokémon JCC et retourne le JSON ci-dessous. NE DEVINE PAS — si non lisible, mets null (sauf champs requis).

ZONE BAS : ligne fine sous le texte d'attaque avec illustrateur, numéro XXX/YYY (ex 012/086), et code d'extension court (ex SV11W, BW5, sm8b — casse exacte).
ZONE HAUT : nom du Pokémon (langue de la carte).

{
  "card_name": "<nom haut, ex 'チャオブー' ou 'Pikachu ex'>",
  "pokemon_name": "<sans suffixe ex/V/VMAX, ex 'Pikachu'>",
  "set_code": "<code exact, casse sensible>",
  "set_number": "<XXX sans zéros initiaux: '12' pas '012'>",
  "set_total": <YYY ou null>,
  "language": "<JP|EN|FR|DE|IT|ES|PT|KO|ZH>",
  "rarity": "<Common|Uncommon|Rare|Holo Rare|Double Rare|Ultra Rare|Art Rare|Special Art Rare|Secret Rare|Hyper Rare|Promo|Other ou null>",
  "confidence": "high|medium|low",
  "pokemon_number": <national dex 1-1025 si carte Pokémon, null pour Trainer/Energy/Stadium>,
  "pokemon_name_fr": "<nom FR standard (ex 'Gruikui'), null si non-Pokémon ou incertain>",
  "set_name": "<nom extension imprimé (ex 'White Flare'), null si invisible>",
  "set_name_fr": "<traduction FR (ex 'Combat de Maîtres'), null si incertain>"
}`;
```

This compresses ~1717 chars → ~890 chars. Token estimate (assume ~4 chars/token) : 500 → 220.

- [ ] **Step 2: Verify tests still pass**

Run: `source ~/.nvm/nvm.sh && nvm use && npx vitest run lib/api/gemini-vision.test.ts`
Expected: PASS — the test mocks bypass the actual prompt, so shortening doesn't affect them.

If the existing test "extracts valid card data successfully" fails, it's because the test mock structure changed — re-read and adapt.

- [ ] **Step 3: Update PROMPT_TOKEN_ESTIMATE if needed**

The `PROMPT_TOKEN_ESTIMATE = 300` set in Task 2 was a pre-shortening guess. After the shortening above, the real prompt is closer to ~220 tokens. Update the constant:

```typescript
const PROMPT_TOKEN_ESTIMATE = 220; // mesuré post-shortening Task 3
```

This affects the `tokens_image` computation but the cost calc is unchanged (tokens_image is informational, cost is based on actual `tokens_in`).

- [ ] **Step 4: Update the test that asserts on tokens_image**

In `lib/api/gemini-vision.test.ts`, the test "extracts _usage from response when usageMetadata is present" hardcoded `tokens_image: 50` based on `350 - 300 = 50`. Now the math is `350 - 220 = 130`. Update:

```typescript
    // tokens_image = 350 (in) - PROMPT_TOKEN_ESTIMATE (220) = 130
    expect(result?._usage?.tokens_image).toBe(130);
```

- [ ] **Step 5: Run tests to confirm**

Run: `source ~/.nvm/nvm.sh && nvm use && npx vitest run lib/api/gemini-vision.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/api/gemini-vision.ts lib/api/gemini-vision.test.ts
git commit -m "Phase 3c: shorten Gemini prompt 500→220 tokens (PROMPT_TOKEN_ESTIMATE updated)"
```

---

## Task 4: Propagate `_usage` through `OcrResult` + `/api/ocr`

**Files:**
- Modify: `lib/types/index.ts`
- Modify: `app/api/ocr/route.ts`

- [ ] **Step 1: Add `_usage` field to `OcrResult` and re-export `GeminiUsage`**

Open `lib/types/index.ts`. Find the `OcrResult` interface (around line 82). Add the `_usage` field at the end:

```typescript
export interface OcrResult {
  // ...existing fields stay unchanged...
  setName?: string | null;
  setNameFr?: string | null;

  /** Gemini token usage + EUR cost. Absent if Vision fallback was used. */
  _usage?: GeminiUsage;
}
```

Also add the `GeminiUsage` re-export at the same level (right above or below `OcrResult`):

```typescript
export type { GeminiUsage } from '@/lib/api/gemini-vision';
```

If the project's lint config doesn't allow `export type ... from '@/lib/api/...'` (cross-package import in types), copy the interface inline instead:

```typescript
export interface GeminiUsage {
  tokens_in: number;
  tokens_out: number;
  tokens_image: number;
  cost_eur: number;
}
```

…and remove the `export interface GeminiUsage` from `lib/api/gemini-vision.ts` (re-import from `@/lib/types` instead).

Use whichever pattern matches the existing project conventions. If unsure, copy inline (simpler).

- [ ] **Step 2: Propagate `_usage` from `/api/ocr/route.ts`**

Open `app/api/ocr/route.ts`. Find where the Gemini result is converted to the response JSON. The response currently has `text`, `confidence`, `words`, `setNumberCandidate`, `setCodeCandidate`, plus optional Gemini-only fields.

Add `_usage: gemini._usage` (or whatever variable holds the Gemini result) to the response object. Look for the existing OCR response construction — should be a single object literal.

Concretely : if you find a block like

```typescript
return NextResponse.json({
  text: ...,
  confidence: ...,
  words: ...,
  setNumberCandidate: ...,
  setCodeCandidate: ...,
  pokemonNumber: gemini?.pokemon_number ?? null,
  pokemonNameFr: gemini?.pokemon_name_fr ?? null,
  setName: gemini?.set_name ?? null,
  setNameFr: gemini?.set_name_fr ?? null,
});
```

Add `_usage: gemini?._usage` at the end. The field is optional; when Vision fallback was used (`gemini` is null), `_usage` will be undefined.

- [ ] **Step 3: Verify type-check + tests**

Run: `source ~/.nvm/nvm.sh && nvm use && npx tsc --noEmit && npm test 2>&1 | tail -10`
Expected: 0 ts errors, all tests pass (244 = 242 baseline + 2 from Task 2).

- [ ] **Step 4: Commit**

```bash
git add lib/types/index.ts app/api/ocr/route.ts
git commit -m "Phase 3c: propagate _usage through OcrResult + /api/ocr response"
```

---

## Task 5: Display debug line in `<CardScanForm>`

**Files:**
- Modify: `components/submit/CardScanForm.tsx`

- [ ] **Step 1: Find the OCR snippet block**

Run: `grep -n 'OCR fiable\|OCR à vérifier' components/submit/CardScanForm.tsx`

You should find a block (around lines 769-798 in current state) that renders an info panel with "OCR fiable" or "OCR à vérifier" + confidence percent + catalog match info. We'll add the debug line at the END of this block.

- [ ] **Step 2: Add the debug line**

Inside that block, after the existing `<div className="flex items-start gap-2">…</div>` (the part with the confidence text and catalog match), add:

```tsx
{ocr?._usage && (
  <>
    <hr className="border-border my-2" />
    <p className="text-text-faint font-mono text-xs">
      {ocr._usage.tokens_in} in · {ocr._usage.tokens_out} out · ~{ocr._usage.tokens_image} img · €{ocr._usage.cost_eur.toFixed(6)}
    </p>
  </>
)}
```

The variable holding the OCR result inside this component might be called `ocr`, `ocrResult`, `ocrData`, or similar — search the file to find the actual name (it's the one set by the `await ocrRes.json()` call in `handleFile`).

If the OCR result is stored across MULTIPLE state variables (e.g., `confidence`, `ocrText` separately) without a single `ocr` object, you may need to ALSO store `_usage` in its own state slot:

```typescript
const [ocrUsage, setOcrUsage] = useState<GeminiUsage | null>(null);
// ... in handleFile after parsing ocr response:
setOcrUsage(ocr._usage ?? null);
```

Then render `{ocrUsage && (...)}`.

Use the pattern that best matches the existing CardScanForm structure.

- [ ] **Step 3: Verify type-check + tests**

Run: `source ~/.nvm/nvm.sh && nvm use && npx tsc --noEmit && npm test 2>&1 | tail -5`
Expected: 0 ts errors, tests still pass.

- [ ] **Step 4: Commit**

```bash
git add components/submit/CardScanForm.tsx
git commit -m "Phase 3c: display Gemini usage debug line in CardScanForm OCR snippet"
```

---

## Task 6: `<BulkSelectionToggle>` + extend `<VintedFilters>`

**Files:**
- Modify: `components/vinted/VintedFilters.tsx`

- [ ] **Step 1: Add `selectionMode` prop + render toggle button**

Open `components/vinted/VintedFilters.tsx`. Add new props to the `Props` interface:

```typescript
interface Props {
  // ...existing props (value, onChange, visibleCards, totalCards)...
  selectionMode: boolean;
  onToggleSelectionMode: () => void;
}
```

Update the function signature destructuring to include them.

In the JSX, add a new button next to the existing chip groups. Place it logically (e.g., right after the "Type" chip group at the top). Use `CheckSquare` / `Square` icons from `lucide-react`:

```tsx
import { CheckSquare, Square } from 'lucide-react';
// ...inside the JSX, after the Type chip group:
<button
  type="button"
  onClick={onToggleSelectionMode}
  className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs ${
    selectionMode
      ? 'bg-red text-bg'
      : 'bg-surface-2 text-text-muted hover:text-text'
  }`}
  title={selectionMode ? 'Annuler la sélection' : 'Activer la sélection multiple'}
>
  {selectionMode ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
  {selectionMode ? 'Annuler la sélection' : 'Sélection multiple'}
</button>
```

- [ ] **Step 2: Update `<VintedList>` to pass the new props (stub for now)**

Open `components/vinted/VintedList.tsx`. Find the `<VintedFilters ...>` JSX. Add `selectionMode={false}` and `onToggleSelectionMode={() => {}}` as temporary stubs. We'll wire them properly in Task 9.

```tsx
<VintedFilters
  value={filters}
  onChange={setFilters}
  visibleCards={totalVisible}
  totalCards={cards.length}
  selectionMode={false}
  onToggleSelectionMode={() => {}}
/>
```

- [ ] **Step 3: Verify type-check + tests**

Run: `source ~/.nvm/nvm.sh && nvm use && npx tsc --noEmit && npm test 2>&1 | tail -5`
Expected: 0 ts errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add components/vinted/VintedFilters.tsx components/vinted/VintedList.tsx
git commit -m "Phase 3c: <VintedFilters> bouton 'Sélection multiple' (stubbed in VintedList)"
```

---

## Task 7: `<BulkSelectionBottomBar>` component

**Files:**
- Create: `components/vinted/BulkSelectionBottomBar.tsx`

- [ ] **Step 1: Write the component**

```typescript
// components/vinted/BulkSelectionBottomBar.tsx
'use client';

import { ShoppingCart, X } from 'lucide-react';

interface Props {
  cardCount: number;
  lotCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

function pluralize(n: number, singular: string, plural?: string): string {
  return n === 1 ? `${n} ${singular}` : `${n} ${plural ?? singular + 's'}`;
}

function buildCounterText(cardCount: number, lotCount: number): string {
  if (cardCount === 0 && lotCount === 0) return 'Aucun item';
  if (cardCount > 0 && lotCount === 0) return pluralize(cardCount, 'carte');
  if (cardCount === 0 && lotCount > 0) return pluralize(lotCount, 'lot');
  return `${pluralize(cardCount, 'carte')} · ${pluralize(lotCount, 'lot')} · ${cardCount + lotCount} items au total`;
}

export default function BulkSelectionBottomBar({ cardCount, lotCount, onConfirm, onCancel }: Props) {
  const total = cardCount + lotCount;
  if (total === 0) return null;

  return (
    <div className="bg-surface border-border fixed inset-x-0 bottom-0 z-40 border-t shadow-lg md:left-[220px]">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 p-3">
        <p className="text-text text-sm font-medium">
          {buildCounterText(cardCount, lotCount)}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-text-muted hover:text-text inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm"
          >
            <X className="h-4 w-4" />
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="bg-red text-bg inline-flex items-center gap-1.5 rounded px-4 py-1.5 text-sm font-medium hover:opacity-90"
          >
            <ShoppingCart className="h-4 w-4" />
            Vendre la sélection ({total})
          </button>
        </div>
      </div>
    </div>
  );
}
```

The `md:left-[220px]` accounts for the 220px desktop sidebar (cf. existing `BottomNav` pattern). On mobile, full width.

- [ ] **Step 2: Verify type-check**

Run: `source ~/.nvm/nvm.sh && nvm use && npx tsc --noEmit 2>&1 | tail -5`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add components/vinted/BulkSelectionBottomBar.tsx
git commit -m "Phase 3c: <BulkSelectionBottomBar> fixed-bottom slide-in component"
```

---

## Task 8: `<BulkSoldModal>` component

**Files:**
- Create: `components/vinted/BulkSoldModal.tsx`

- [ ] **Step 1: Write the component**

```typescript
// components/vinted/BulkSoldModal.tsx
'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { Card, Lot } from '@/lib/types';
import { splitPrice } from '@/lib/utils/split-bulk-price';

export type BulkSoldItem =
  | { kind: 'card'; card: Card }
  | { kind: 'lot'; lot: Lot };

interface Props {
  items: BulkSoldItem[];
  onClose: () => void;
  onConfirm: (totalPrice: number, dateSold: string) => Promise<void>;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function thumbUrl(item: BulkSoldItem): string | null {
  if (item.kind === 'card') {
    if (item.card.image_url) return item.card.image_url;
    if (item.card.tcg_image_url) return item.card.tcg_image_url;
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${item.card.pokemon_number}.png`;
  }
  // Lot: first photo if any (resolve to public URL via Storage)
  if (item.lot.photo_urls.length === 0) return null;
  const path = item.lot.photo_urls[0];
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/lot-photos/${path}`;
}

function displayName(item: BulkSoldItem): string {
  return item.kind === 'card' ? item.card.card_name : item.lot.name;
}

function displaySubText(item: BulkSoldItem): string {
  if (item.kind === 'card') {
    return `${item.card.language} · ${item.card.condition}`;
  }
  return `Lot${item.lot.language ? ' · ' + item.lot.language : ''}${item.lot.condition ? ' · ' + item.lot.condition : ''}`;
}

export default function BulkSoldModal({ items, onClose, onConfirm }: Props) {
  const [priceStr, setPriceStr] = useState('');
  const [date, setDate] = useState(todayIso());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalPrice = useMemo(() => {
    const parsed = priceStr.trim() === '' ? 0 : Number(priceStr.replace(',', '.'));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }, [priceStr]);

  const perItem = useMemo(() => {
    if (totalPrice <= 0 || items.length === 0) return null;
    return splitPrice(totalPrice, items.length);
  }, [totalPrice, items.length]);

  const valid = totalPrice > 0 && items.length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(totalPrice, new Date(`${date}T12:00:00Z`).toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-surface border-border w-full max-w-lg rounded-lg border p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Vente groupée</h2>
            <p className="text-text-muted mt-1 text-sm">{items.length} items à marquer comme vendus</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <ul className="mb-4 max-h-60 space-y-1.5 overflow-y-auto pr-1">
          {items.map((item, i) => {
            const thumb = thumbUrl(item);
            return (
              <li key={`${item.kind}-${item.kind === 'card' ? item.card.id : item.lot.id}`} className="bg-surface-2 flex items-center gap-2 rounded p-2 text-sm">
                {thumb ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={thumb} alt="" className="bg-surface-off h-10 w-7 shrink-0 rounded object-cover" />
                ) : (
                  <div className="bg-surface-off h-10 w-7 shrink-0 rounded" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {item.kind === 'lot' && <span className="bg-rarity-chr/20 text-rarity-chr mr-1.5 rounded px-1 py-0.5 text-[10px]">Lot</span>}
                    {displayName(item)}
                  </p>
                  <p className="text-text-muted text-xs">{displaySubText(item)}</p>
                </div>
                {perItem && (
                  <p className="text-rarity-sr shrink-0 font-mono text-xs">
                    {perItem[i].toFixed(2)} €
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="text-text-muted text-xs">Prix total reçu (€)</span>
            <input
              type="text"
              inputMode="decimal"
              value={priceStr}
              onChange={(e) => setPriceStr(e.target.value)}
              placeholder="100.00"
              autoFocus
              className="bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
            />
          </label>

          <label className="block">
            <span className="text-text-muted text-xs">Date de vente</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
            />
          </label>

          {perItem && totalPrice > 0 && (
            <p className="text-text-muted text-xs">
              Réparti : {perItem.length === 1
                ? `${perItem[0].toFixed(2)} €`
                : `${perItem[0].toFixed(2)} € × ${perItem.length - 1} + ${perItem[perItem.length - 1].toFixed(2)} € (dernier)`}
            </p>
          )}

          {error && <p className="text-red text-xs">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="bg-surface-2 hover:bg-surface-off border-border rounded border px-4 py-1.5 text-sm"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={!valid || submitting}
              className="bg-red text-bg rounded px-4 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? 'Enregistrement…' : 'Confirmer la vente'}
            </button>
          </div>
        </form>
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
git add components/vinted/BulkSoldModal.tsx
git commit -m "Phase 3c: <BulkSoldModal> with item list + total price + date + per-item preview"
```

---

## Task 9: Wire bulk vendu in `<VintedList>` + extend `<VintedRow>` and `<LotRow>` with selection

**Files:**
- Modify: `components/vinted/VintedRow.tsx`
- Modify: `components/lots/LotRow.tsx`
- Modify: `components/vinted/VintedList.tsx`

- [ ] **Step 1: Add selection props to `<VintedRow>`**

Open `components/vinted/VintedRow.tsx`. Add to the Props interface:

```typescript
  /** When true, show a checkbox on the left and disable Annonce/Vendu buttons. */
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
```

Update the destructuring to accept them. In the JSX, add a checkbox at the beginning of the row (before the thumb image), shown only in selection mode:

```tsx
{selectionMode && (
  <input
    type="checkbox"
    checked={!!selected}
    onChange={onToggleSelect}
    onClick={(e) => e.stopPropagation()}
    aria-label={selected ? 'Désélectionner' : 'Sélectionner'}
    className="h-5 w-5 shrink-0 cursor-pointer"
  />
)}
```

Also disable the Annonce + Vendu buttons when in selection mode:

```tsx
<button
  type="button"
  onClick={onAnnonceClick}
  disabled={selectionMode}
  className="bg-surface-2 hover:bg-surface-off border-border shrink-0 rounded border px-3 py-1.5 text-xs disabled:opacity-40"
>
  ...
</button>

<button
  type="button"
  onClick={onSoldClick}
  disabled={selectionMode}
  className="bg-red text-bg shrink-0 rounded px-3 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-40"
>
  Vendu
</button>
```

- [ ] **Step 2: Add the same props to `<LotRow>`**

Open `components/lots/LotRow.tsx`. Apply the same Props additions (`selectionMode`, `selected`, `onToggleSelect`), the same checkbox render at the left, and the same disabled state on Annonce + Vendu.

- [ ] **Step 3: Wire state + handlers in `<VintedList>`**

Open `components/vinted/VintedList.tsx`. Add new state at the top of the component:

```typescript
const [selectionMode, setSelectionMode] = useState(false);
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
const [bulkSoldOpen, setBulkSoldOpen] = useState(false);
```

Add these helpers:

```typescript
function toggleSelect(id: string) {
  setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}

function toggleSelectionMode() {
  setSelectionMode((m) => {
    if (m) {
      // Exiting selection mode → clear selection
      setSelectedIds(new Set());
    }
    return !m;
  });
}

function cancelSelection() {
  setSelectedIds(new Set());
  setSelectionMode(false);
}
```

Replace the `selectionMode={false}` / `onToggleSelectionMode={() => {}}` stubs in `<VintedFilters>` with the real values:

```tsx
<VintedFilters
  value={filters}
  onChange={setFilters}
  visibleCards={totalVisible}
  totalCards={cards.length}
  selectionMode={selectionMode}
  onToggleSelectionMode={toggleSelectionMode}
/>
```

In the existing `groups.map((g) => <VintedRow ...>)` JSX, add the new props:

```tsx
<VintedRow
  key={g.key}
  group={g}
  /* ...existing props... */
  selectionMode={selectionMode}
  selected={selectedIds.has(g.head.id)}
  onToggleSelect={() => toggleSelect(g.head.id)}
/>
```

In the `forSaleLots.map((l) => <LotRow ...>)` JSX (and the `soldLotsList.map(...)` if applicable — no, sold lots are not selectable for re-sale), add the same props:

```tsx
<LotRow
  key={`lot-${l.id}`}
  lot={l}
  /* ...existing props... */
  selectionMode={selectionMode}
  selected={selectedIds.has(l.id)}
  onToggleSelect={() => toggleSelect(l.id)}
/>
```

Sold rows (cards or lots) should NOT show the checkbox — they're already sold. So don't pass `selectionMode` to the sold row maps, OR explicitly pass `selectionMode={false}` for them.

After the closing `</ul>` for the list, render the bottom-bar + modal:

```tsx
{selectionMode && (() => {
  const selectedCards = cards.filter((c) => c.status === 'for_sale' && selectedIds.has(c.id));
  const selectedLots = lots.filter((l) => l.status === 'for_sale' && selectedIds.has(l.id));
  return (
    <BulkSelectionBottomBar
      cardCount={selectedCards.length}
      lotCount={selectedLots.length}
      onCancel={cancelSelection}
      onConfirm={() => setBulkSoldOpen(true)}
    />
  );
})()}

{bulkSoldOpen && (() => {
  const selectedCards = cards.filter((c) => c.status === 'for_sale' && selectedIds.has(c.id));
  const selectedLots = lots.filter((l) => l.status === 'for_sale' && selectedIds.has(l.id));
  const items: BulkSoldItem[] = [
    ...selectedCards.map((c) => ({ kind: 'card' as const, card: c })),
    ...selectedLots.map((l) => ({ kind: 'lot' as const, lot: l })),
  ];
  return (
    <BulkSoldModal
      items={items}
      onClose={() => setBulkSoldOpen(false)}
      onConfirm={async (totalPrice, dateSoldIso) => {
        await handleBulkSold(items, totalPrice, dateSoldIso);
        setBulkSoldOpen(false);
        cancelSelection();
      }}
    />
  );
})()}
```

Add the imports at the top:

```typescript
import BulkSelectionBottomBar from './BulkSelectionBottomBar';
import BulkSoldModal, { type BulkSoldItem } from './BulkSoldModal';
import { splitPrice } from '@/lib/utils/split-bulk-price';
```

- [ ] **Step 4: Implement the `handleBulkSold` async handler**

Add this function in `<VintedList>`:

```typescript
async function handleBulkSold(items: BulkSoldItem[], totalPrice: number, dateSoldIso: string) {
  const prices = splitPrice(totalPrice, items.length);
  let successCount = 0;
  let failCount = 0;
  let restockCount = 0;
  const errors: string[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const sold_price = prices[i];
    const id = item.kind === 'card' ? item.card.id : item.lot.id;
    const endpoint = item.kind === 'card' ? `/api/cards/${id}` : `/api/lots/${id}`;
    try {
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status: 'sold',
          sold_price,
          date_sold: dateSoldIso,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        failCount += 1;
        errors.push(`${item.kind === 'card' ? item.card.card_name : item.lot.name}: ${json.error ?? 'erreur'}`);
        continue;
      }
      successCount += 1;
      // Update local state to mark this item as sold
      if (item.kind === 'card') {
        setCards((prev) => prev.map((c) => (c.id === id ? { ...c, status: 'sold' as const, sold_price, date_sold: dateSoldIso } : c)));
        if (json.restock) restockCount += 1;
      } else {
        setLots((prev) => prev.map((l) => (l.id === id ? { ...l, status: 'sold' as const, sold_price, date_sold: dateSoldIso } : l)));
      }
    } catch (e) {
      failCount += 1;
      errors.push(`${item.kind === 'card' ? item.card.card_name : item.lot.name}: ${e instanceof Error ? e.message : 'network'}`);
    }
  }

  // Show recap via console + alert (the project doesn't have a global toast lib;
  // alert is the fastest path. Future enhancement: replace with a proper toast component.)
  const restockSuffix = restockCount > 0 ? ` · ${restockCount} alerte${restockCount > 1 ? 's' : ''} restock — voir Pokédex` : '';
  if (failCount === 0) {
    console.log(`[bulk-sold] ${successCount} vendus${restockSuffix}`);
    alert(`✓ ${successCount} items vendus${restockSuffix}`);
  } else {
    console.warn(`[bulk-sold] ${successCount} vendus, ${failCount} échec(s)`, errors);
    alert(`${successCount} vendus, ${failCount} échec(s)${restockSuffix}\n\n${errors.join('\n')}`);
  }
}
```

If the codebase has a better toast pattern (search for `Toast` or `setRestockAlert`), prefer that over `alert`. Look at how `RestockToast` is currently used in `VintedList` — if it's a simple state setter + render, mimic the pattern with a new `bulkRecap` state. Otherwise `alert` is acceptable for this iteration.

- [ ] **Step 5: Verify type-check + tests + lint**

```bash
source ~/.nvm/nvm.sh && nvm use && npx tsc --noEmit 2>&1 | tail -5
source ~/.nvm/nvm.sh && nvm use && npm run lint 2>&1 | tail -5
source ~/.nvm/nvm.sh && nvm use && npm test 2>&1 | tail -10
```

Expected: 0 ts errors, 0 lint warnings, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add components/vinted/VintedRow.tsx components/lots/LotRow.tsx components/vinted/VintedList.tsx
git commit -m "Phase 3c: wire bulk vendu (selection state + checkbox rows + bottom-bar + modal + sequential PATCH)"
```

---

## Task 10: Final lint + build + tests + bench Gemini sanity

**Files:** none.

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
- TEST : 250 / 250 (242 baseline + 6 splitPrice + 2 Gemini usage)
- BUILD : success

- [ ] **Step 2: Re-bench Gemini after prompt shortening (optional but recommended)**

If `scripts/test-bench-gemini.ts` exists and the user has photos in `cards_assets/`, run:

```bash
source ~/.nvm/nvm.sh && nvm use && npx tsx scripts/test-bench-gemini.ts
```

Expected: ≥ 28/30 (current baseline). If < 28, the prompt was too aggressively shortened and needs more context restored. Re-add the most-impactful instructions to the prompt and re-bench.

If the bench script doesn't exist or photos aren't there, SKIP this step and document in the smoke test (Task 11).

- [ ] **Step 3: Commit only if cleanups were needed**

If anything was fixed in steps 1-2, commit. Otherwise skip.

```bash
git add -p
git commit -m "Phase 3c: lint + cleanups"
```

---

## Task 11: Manual smoke test (user handoff)

**Files:** none — exploratory.

- [ ] **Step 1: Smoke-test bulk vendu**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run dev
```

1. Open `http://localhost:3000/vinted`.
2. Click "Sélection multiple" button (top of filters area).
3. Expected: button changes to "Annuler la sélection", checkboxes appear on all `for_sale` rows (cards + lots).
4. Annonce/Vendu buttons on each row are disabled (greyed out).
5. Check 3 cards + 1 lot. Bottom-bar appears: `"3 cartes · 1 lot · 4 items au total · [Annuler] [Vendre la sélection (4)]"`.
6. Click "Vendre la sélection". Modal opens with:
   - Liste des 4 items (thumbs + noms + condition/langue + badge "Lot" pour le lot)
   - Input "Prix total reçu (€)"
   - Date input prefilled today
7. Type `100`. Preview live : `"25.00 € × 3 + 25.00 € (dernier)"` (ou similaire).
8. Click "Confirmer la vente". Loading state. After completion: alert récap, mode selection se ferme, les 4 items disparaissent de la liste for_sale.
9. Vérifier dans `/vinted` filter "Vendus" que les 4 items apparaissent avec `sold_price = 25.00€` chacun.

- [ ] **Step 2: Smoke-test Gemini debug**

1. Sur `/submit` onglet "Mobile", scanner une carte.
2. Console : voir une ligne `[Gemini] {N}in / {M}out / {K}img — €X.XXXXXX` pendant le scan.
3. Sur le formulaire, sous le snippet "OCR fiable" : ligne discrète `{N} in · {M} out · ~{K} img · €X.XXXXXX`.
4. Sur `/submit` onglet "Batch", drop 2-3 photos, lancer l'analyse, ouvrir la 1ère carte du batch : la même ligne debug doit apparaître (même composant).

- [ ] **Step 3: Bonus — verify alert restock dans le récap bulk**

1. En mode normal, marquer une carte Pokédex comme registered (depuis `/pokedex` drawer).
2. Avoir au moins 1 autre carte for_sale du MÊME `pokemon_number`.
3. Mode bulk, sélectionner cette carte, la vendre. Le récap doit mentionner "1 alerte restock".

- [ ] **Step 4: No commit needed.**

---

## Summary

**Total tests added:** 8 (6 splitPrice + 2 Gemini usage)
**Files created:** 4 (1 helper + 1 test + 2 components)
**Files modified:** 7 (gemini-vision.ts + test, types, /api/ocr, CardScanForm, VintedFilters, VintedList, VintedRow, LotRow — that's 8 actually but one is the test file)
**Estimated time:** ~4 working days following TDD with frequent commits.

---

## Self-review (already applied)

1. **Spec coverage** — every section of the spec maps to a task:
   - §3.2 components → Tasks 6 (BulkSelectionToggle), 7 (BulkSelectionBottomBar), 8 (BulkSoldModal), 9 (VintedRow / LotRow extension)
   - §3.3 logique VintedList → Task 9
   - §3.4 récap toast → Task 9 (handleBulkSold)
   - §4.1 Gemini constants + maxOutputTokens + extraction → Task 2
   - §4.1 prompt shortening → Task 3
   - §4.2 propagation _usage UI → Tasks 4 + 5
   - §5 tests → Task 1 (splitPrice 6 tests) + Task 2 (Gemini 2 tests)
   - §8 critères de succès → Task 10 + Task 11

2. **Placeholder scan** — every step contains complete code or exact commands. The `PROMPT_TOKEN_ESTIMATE = 220` after Task 3 might end up off — caller validates via Task 10 bench. If the bench changes the math, the test in Task 2 needs the same update (already noted in Task 3 step 4).

3. **Type consistency** — `GeminiUsage` defined in Task 2 (gemini-vision.ts) and re-exported / re-defined in Task 4 (lib/types). `BulkSoldItem` defined in Task 8 (BulkSoldModal) and used in Task 9 (VintedList). `splitPrice` exported in Task 1 and consumed in Tasks 8 (preview) + 9 (handleBulkSold). All consistent.
