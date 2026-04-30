# Phase 2 — Module Vinted Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Vinted module — FIFO list with variant-aware grouping, inline price editing, sold action with restock alert, and ad generator with smart-truncated 80-char title.

**Architecture:** RSC page fetches `for_sale` cards + `pokedex` registered set + `config` table once and hands them to a single `<VintedList>` client orchestrator. Mutations go through `PATCH /api/cards/[id]`, which detects restock conditions server-side. All template logic (title, description, grouping, restock detection) lives in pure functions under `lib/utils/` for trivial Vitest coverage.

**Tech Stack:** Next.js 16 App Router (React 19, RSC), TypeScript strict, Tailwind v4 (`@theme` tokens), Supabase JS (`@supabase/ssr`), Vitest + happy-dom, lucide-react.

**Spec source:** [docs/superpowers/specs/2026-04-30-phase-2-vinted-design.md](../specs/2026-04-30-phase-2-vinted-design.md)

---

## File Structure

**Created:**
- `lib/utils/group-cards.ts` + `.test.ts` — grouping key + group fold + FIFO position
- `lib/utils/restock-detection.ts` + `.test.ts` — pure restock decision
- `lib/utils/vinted-template.ts` + `.test.ts` — title smart-truncate + description builder
- `app/api/cards/[id]/route.ts` + `.test.ts` — PATCH endpoint (price edit + sold + restock)
- `components/vinted/VintedList.tsx` — client orchestrator (state, search, filters, modals)
- `components/vinted/VintedFilters.tsx` — search input + chips
- `components/vinted/VintedRow.tsx` — single row (or group) display
- `components/vinted/EditablePriceCell.tsx` — inline price input
- `components/vinted/SoldModal.tsx` — sold confirmation modal
- `components/vinted/AnnonceModal.tsx` — ad generator modal
- `components/vinted/RestockToast.tsx` — ephemeral toast

**Modified:**
- `app/(app)/vinted/page.tsx` — replace placeholder with RSC fetch + `<VintedList>`
- `docs/phase1-summary.md` → renamed to `docs/phases-summary.md`, add Phase 2 section

---

## Conventions reminder (read once before starting)

- All client components start with `'use client'`.
- Tailwind tokens come from `@theme` in `app/globals.css`: `bg-bg`, `bg-surface`, `bg-surface-2`, `bg-surface-off`, `border-border`, `text-text`, `text-text-muted`, `text-text-faint`, `bg-red-bg`, `text-red`. Don't invent new tokens.
- Icons from `lucide-react`. No emoji in JSX unless explicitly listed in spec (description template uses ✨📦⭐🎨).
- API routes : `export const runtime = 'nodejs'` + `createClient()` from `@/lib/supabase/server` for auth.
- Tests : `vitest run` for full suite, `vitest run path/to/file.test.ts` for single file.
- After each task : `npm run lint && npm run typecheck && npm test` must stay green before commit.

---

## Task 1 — `lib/utils/group-cards.ts`

**Files:**
- Create: `lib/utils/group-cards.ts`
- Test: `lib/utils/group-cards.test.ts`

- [ ] **Step 1.1: Write the failing test file**

```ts
// lib/utils/group-cards.test.ts
import { describe, expect, it } from 'vitest';
import { groupKey, groupCards } from './group-cards';
import type { Card } from '@/lib/types';

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'c1',
    pokemon_name: 'Pikachu',
    pokemon_number: 25,
    card_name: 'Pikachu',
    card_id_tcg: 'sv1-100',
    set_name: 'Scarlet & Violet',
    set_code: 'sv1',
    set_number: '100/198',
    language: 'JP',
    rarity: 'AR',
    rarity_rank: 8,
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
    lot_id: null,
    date_added: '2026-01-01T00:00:00Z',
    date_sold: null,
    sold_price: null,
    notes: null,
    variant: null,
    ...overrides,
  };
}

describe('groupKey', () => {
  it('uses card_id_tcg + language + condition + variant', () => {
    const a = makeCard();
    const b = makeCard({ id: 'c2' });
    expect(groupKey(a)).toBe(groupKey(b));
  });

  it('separates standard vs Poké Ball variant', () => {
    const standard = makeCard({ variant: null });
    const pokeball = makeCard({ variant: 'pokeball' });
    expect(groupKey(standard)).not.toBe(groupKey(pokeball));
  });

  it('separates two languages', () => {
    expect(groupKey(makeCard({ language: 'JP' }))).not.toBe(
      groupKey(makeCard({ language: 'EN' })),
    );
  });

  it('falls back to pokemon_number+set_code+set_number when card_id_tcg is null', () => {
    const a = makeCard({ card_id_tcg: null });
    const b = makeCard({ id: 'c2', card_id_tcg: null });
    expect(groupKey(a)).toBe(groupKey(b));
    const c = makeCard({ card_id_tcg: null, set_number: '101/198' });
    expect(groupKey(a)).not.toBe(groupKey(c));
  });
});

describe('groupCards', () => {
  it('returns one group per unique key, sorted by head date_added ASC', () => {
    const old = makeCard({ id: 'old', date_added: '2026-01-01T00:00:00Z' });
    const newer = makeCard({ id: 'newer', date_added: '2026-02-01T00:00:00Z' });
    const groups = groupCards([newer, old]);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(2);
    expect(groups[0].head.id).toBe('old'); // FIFO inside the group
    expect(groups[0].position).toBe(1);
  });

  it('assigns FIFO position #1, #2, ... across groups', () => {
    const a = makeCard({ id: 'a', language: 'JP', date_added: '2026-01-01T00:00:00Z' });
    const b = makeCard({ id: 'b', language: 'EN', date_added: '2026-02-01T00:00:00Z' });
    const groups = groupCards([b, a]);
    expect(groups[0].head.id).toBe('a');
    expect(groups[0].position).toBe(1);
    expect(groups[1].head.id).toBe('b');
    expect(groups[1].position).toBe(2);
  });

  it('keeps within-group cards sorted FIFO', () => {
    const c1 = makeCard({ id: 'c1', date_added: '2026-01-01T00:00:00Z' });
    const c2 = makeCard({ id: 'c2', date_added: '2026-02-01T00:00:00Z' });
    const c3 = makeCard({ id: 'c3', date_added: '2026-03-01T00:00:00Z' });
    const groups = groupCards([c3, c1, c2]);
    expect(groups[0].cards.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
  });
});
```

- [ ] **Step 1.2: Run test, verify fail**

Run: `npx vitest run lib/utils/group-cards.test.ts`
Expected: FAIL — `Cannot find module './group-cards'`

- [ ] **Step 1.3: Write the implementation**

```ts
// lib/utils/group-cards.ts
import type { Card } from '@/lib/types';

export interface CardGroup {
  key: string;
  /** Cards sorted by date_added ASC. */
  cards: Card[];
  /** FIFO-first card — the one displayed and targeted by "Vendu". */
  head: Card;
  /** Number of cards in this group. */
  count: number;
  /** Global FIFO position #1, #2, ... assigned by `groupCards`. */
  position: number;
}

/**
 * Compose the doublon-grouping key. Includes `variant` because Poké Ball /
 * Master Ball / Reverse Holo / Promo each carry distinct Vinted prices.
 *
 * When `card_id_tcg` is null (catalogue miss), fall back to a composite
 * built from pokemon_number + set_code + set_number, which uniquely
 * identifies a printed card in practice.
 */
export function groupKey(card: Card): string {
  const id =
    card.card_id_tcg ??
    `${card.pokemon_number}-${card.set_code ?? '?'}-${card.set_number ?? '?'}`;
  const variant = card.variant ?? 'standard';
  return `${id}|${card.language}|${card.condition}|${variant}`;
}

/**
 * Fold a flat list of cards into FIFO-ordered groups.
 *
 * - Within each group: cards sorted by `date_added` ASC (oldest first = head).
 * - Across groups: ordered by the head's `date_added` ASC.
 * - Each group gets a `position` 1..N for display.
 *
 * Pure function — feed it the already-filtered list.
 */
export function groupCards(cards: Card[]): CardGroup[] {
  const buckets = new Map<string, Card[]>();
  for (const card of cards) {
    const key = groupKey(card);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(card);
    } else {
      buckets.set(key, [card]);
    }
  }

  const sortByDate = (a: Card, b: Card) => a.date_added.localeCompare(b.date_added);

  const groups: Omit<CardGroup, 'position'>[] = [];
  for (const [key, bucket] of buckets) {
    bucket.sort(sortByDate);
    groups.push({
      key,
      cards: bucket,
      head: bucket[0],
      count: bucket.length,
    });
  }

  groups.sort((a, b) => sortByDate(a.head, b.head));

  return groups.map((g, i) => ({ ...g, position: i + 1 }));
}
```

- [ ] **Step 1.4: Run test, verify pass**

Run: `npx vitest run lib/utils/group-cards.test.ts`
Expected: PASS — 7 tests

- [ ] **Step 1.5: Commit**

```bash
git add lib/utils/group-cards.ts lib/utils/group-cards.test.ts
git commit -m "Vinted: add group-cards util (variant-aware grouping + FIFO position)"
```

---

## Task 2 — `lib/utils/restock-detection.ts`

**Files:**
- Create: `lib/utils/restock-detection.ts`
- Test: `lib/utils/restock-detection.test.ts`

- [ ] **Step 2.1: Write the failing test**

```ts
// lib/utils/restock-detection.test.ts
import { describe, expect, it } from 'vitest';
import { detectRestock } from './restock-detection';

describe('detectRestock', () => {
  it('returns restock info when pokedex exists and no for_sale remains', () => {
    const result = detectRestock({
      pokemonNumber: 25,
      pokedexCard: { pokemon_name: 'Pikachu' },
      remainingForSaleCount: 0,
    });
    expect(result).toEqual({ pokemon_number: 25, pokemon_name: 'Pikachu' });
  });

  it('returns null when no pokedex card exists for that pokemon', () => {
    const result = detectRestock({
      pokemonNumber: 25,
      pokedexCard: null,
      remainingForSaleCount: 0,
    });
    expect(result).toBeNull();
  });

  it('returns null when other for_sale cards remain', () => {
    const result = detectRestock({
      pokemonNumber: 25,
      pokedexCard: { pokemon_name: 'Pikachu' },
      remainingForSaleCount: 2,
    });
    expect(result).toBeNull();
  });

  it('returns null when both conditions miss', () => {
    expect(
      detectRestock({
        pokemonNumber: 25,
        pokedexCard: null,
        remainingForSaleCount: 5,
      }),
    ).toBeNull();
  });
});
```

- [ ] **Step 2.2: Run test, verify fail**

Run: `npx vitest run lib/utils/restock-detection.test.ts`
Expected: FAIL — `Cannot find module './restock-detection'`

- [ ] **Step 2.3: Write the implementation**

```ts
// lib/utils/restock-detection.ts

export interface RestockAlert {
  pokemon_number: number;
  pokemon_name: string;
}

export interface DetectRestockInput {
  pokemonNumber: number;
  /** The Pokédex slot for this pokemon, or null if empty. Only `pokemon_name` is used. */
  pokedexCard: { pokemon_name: string } | null;
  /** How many for_sale cards remain for this pokemon AFTER the sale just made. */
  remainingForSaleCount: number;
}

/**
 * Decide whether a sale should trigger a "restock" alert.
 *
 * Triggered when both:
 *   1. There is a Pokédex card registered for this pokemon_number.
 *   2. No for_sale card remains for that pokemon_number.
 *
 * Pure function — caller does the DB queries and passes the data in.
 */
export function detectRestock(input: DetectRestockInput): RestockAlert | null {
  if (!input.pokedexCard) return null;
  if (input.remainingForSaleCount > 0) return null;
  return {
    pokemon_number: input.pokemonNumber,
    pokemon_name: input.pokedexCard.pokemon_name,
  };
}
```

- [ ] **Step 2.4: Run test, verify pass**

Run: `npx vitest run lib/utils/restock-detection.test.ts`
Expected: PASS — 4 tests

- [ ] **Step 2.5: Commit**

```bash
git add lib/utils/restock-detection.ts lib/utils/restock-detection.test.ts
git commit -m "Vinted: add restock-detection pure helper"
```

---

## Task 3 — `lib/utils/vinted-template.ts`

**Files:**
- Create: `lib/utils/vinted-template.ts`
- Test: `lib/utils/vinted-template.test.ts`

- [ ] **Step 3.1: Write the failing test**

```ts
// lib/utils/vinted-template.test.ts
import { describe, expect, it } from 'vitest';
import { buildTitle, buildDescription, MAX_TITLE_LENGTH } from './vinted-template';
import type { Card } from '@/lib/types';

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'c1',
    pokemon_name: 'Pikachu (ピカチュウ)',
    pokemon_number: 25,
    card_name: 'Pikachu ex',
    card_id_tcg: null,
    set_name: 'Combat de Maîtres',
    set_code: 'sv11',
    set_number: '120/180',
    language: 'JP',
    rarity: 'SAR',
    rarity_rank: 9,
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
    lot_id: null,
    date_added: '2026-01-01T00:00:00Z',
    date_sold: null,
    sold_price: null,
    notes: null,
    variant: null,
    ...overrides,
  };
}

const CONFIG = {
  vinted_shipping_note: 'Expédition soignée en toploader.',
  vinted_seller_note: 'Vendeur sérieux.',
};

describe('buildTitle', () => {
  it('emits the full bilingual format when it fits', () => {
    const t = buildTitle(
      makeCard({ card_name: 'Pikachu (ピカチュウ) ex', condition: 'EX' }),
    );
    expect(t).toContain('Pikachu');
    expect(t).toContain('ピカチュウ');
    expect(t).toContain('SAR');
    expect(t).toContain('JP');
    expect(t).toContain('EX');
    expect(t.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
  });

  it('drops the bilingual paren when the full version overflows', () => {
    const card = makeCard({
      card_name: 'Très Long Nom de Carte (とても長いカード名前) ex',
      set_name: 'Un Set Au Nom Vraiment Long',
      variant: 'pokeball',
      condition: 'EX',
    });
    const t = buildTitle(card);
    expect(t.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
    expect(t).not.toContain('とても長いカード名前');
    expect(t).toContain('Très Long Nom');
  });

  it('drops condition when it is the implicit default NM', () => {
    const card = makeCard({
      card_name: 'Très Long Nom de Carte (とても長いカード名前) ex',
      set_name: 'Un Set Au Nom Vraiment Long',
      variant: 'pokeball',
      condition: 'NM',
    });
    const t = buildTitle(card);
    expect(t).not.toMatch(/—\s*NM\s*$/);
  });

  it('keeps non-NM condition even after truncation', () => {
    const card = makeCard({
      card_name: 'Aaaaa Bbbbb Ccccc Ddddd Eeeee Fffff Ggggg Hhhhh ex',
      set_name: 'Aaaaa Bbbbb Ccccc',
      variant: 'pokeball',
      condition: 'EX',
    });
    const t = buildTitle(card);
    expect(t).toContain('EX');
    expect(t.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
  });

  it('falls back to set_code when set_name is too long', () => {
    const card = makeCard({
      card_name: 'Long Card Name Here Pikachu ex',
      set_name: 'A Very Very Very Very Long Set Name',
      variant: 'pokeball',
      condition: 'EX',
    });
    const t = buildTitle(card);
    expect(t.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
    expect(t).not.toContain('A Very Very Very Very');
  });

  it('drops the set entirely when even set_code does not fit', () => {
    const card = makeCard({
      card_name: 'Aaaaaaa Bbbbbbb Ccccccc Ddddddd Eeeeeee Fffffff Pikachu ex',
      set_name: 'Set Name',
      set_code: 'sv11',
      variant: 'pokeball',
      condition: 'EX',
    });
    const t = buildTitle(card);
    expect(t.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
    expect(t).toContain('Pikachu ex');
    expect(t).toContain('SAR');
    expect(t).toContain('JP');
    expect(t).toContain('Poké Ball');
  });

  it('always preserves card_name + rarity + language', () => {
    const card = makeCard({
      card_name: 'X',
      rarity: 'AR',
      language: 'EN',
      variant: null,
    });
    const t = buildTitle(card);
    expect(t).toContain('X');
    expect(t).toContain('AR');
    expect(t).toContain('EN');
  });

  it('omits the variant chip when variant is null', () => {
    const t = buildTitle(makeCard({ variant: null, condition: 'EX' }));
    expect(t).not.toContain('Poké Ball');
    expect(t).not.toContain('Master Ball');
  });
});

describe('buildDescription', () => {
  it('includes all sections by default', () => {
    const d = buildDescription(makeCard(), CONFIG);
    expect(d).toContain('Pikachu ex');
    expect(d).toContain('Special Art Rare');
    expect(d).toContain('Combat de Maîtres');
    expect(d).toContain('sv11');
    expect(d).toContain('120/180');
    expect(d).toContain('Japonais');
    expect(d).toContain('Near Mint');
    expect(d).toContain('Expédition soignée');
    expect(d).toContain('Vendeur sérieux');
  });

  it('adds a variant line only when variant is present', () => {
    const without = buildDescription(makeCard({ variant: null }), CONFIG);
    expect(without).not.toMatch(/Variant/);
    const withVariant = buildDescription(
      makeCard({ variant: 'masterball' }),
      CONFIG,
    );
    expect(withVariant).toMatch(/Variant.*Master Ball/);
  });

  it('omits the set_number suffix when set_number is null', () => {
    const d = buildDescription(makeCard({ set_number: null }), CONFIG);
    expect(d).not.toMatch(/N°/);
  });
});
```

- [ ] **Step 3.2: Run test, verify fail**

Run: `npx vitest run lib/utils/vinted-template.test.ts`
Expected: FAIL — `Cannot find module './vinted-template'`

- [ ] **Step 3.3: Write the implementation**

```ts
// lib/utils/vinted-template.ts
import type { Card, CardCondition, CardLanguage, CardRarity } from '@/lib/types';

export const MAX_TITLE_LENGTH = 80;

const LANGUAGE_FLAGS: Record<CardLanguage, string> = {
  JP: '🇯🇵', EN: '🇬🇧', FR: '🇫🇷', DE: '🇩🇪', IT: '🇮🇹',
  ES: '🇪🇸', KO: '🇰🇷', PT: '🇵🇹', ZH: '🇨🇳',
};

const LANGUAGE_FULL: Record<CardLanguage, string> = {
  JP: 'Japonais', EN: 'Anglais', FR: 'Français', DE: 'Allemand',
  IT: 'Italien', ES: 'Espagnol', KO: 'Coréen', PT: 'Portugais', ZH: 'Chinois',
};

const CONDITION_FULL: Record<CardCondition, string> = {
  NM: 'Near Mint', EX: 'Excellent', GD: 'Good', PL: 'Played', PO: 'Poor',
};

const RARITY_LABEL: Record<CardRarity, string> = {
  SAR: 'Special Art Rare', AR: 'Art Rare', SR: 'Super Rare',
  CHR: 'Character Rare', RR: 'Double Rare', R_HOLO: 'Rare Holo',
  R: 'Rare', UC: 'Uncommon', C: 'Common', OTHER: 'Other',
};

const VARIANT_LABEL: Record<string, string> = {
  pokeball: 'Poké Ball',
  masterball: 'Master Ball',
  reverse_holo: 'Reverse Holo',
  promo: 'Promo',
};

function variantLabel(variant: string | null): string | null {
  if (!variant) return null;
  return VARIANT_LABEL[variant] ?? variant;
}

/** Strip the bilingual `(オリジナル)` parenthesis from a name. */
function stripParen(name: string): string {
  return name.replace(/\s*\([^)]+\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Compose the Vinted ad title (≤ 80 chars). Smart truncate ladder:
 *   1. Full bilingual format
 *   2. Drop bilingual paren in card_name + set_name
 *   3. Drop condition when it is the implicit default NM
 *   4. Replace set_name with set_code
 *   5. Drop the set segment entirely
 *
 * Invariants: card_name (truncated form), rarity, language, and variant
 * (when present) are always retained.
 */
export function buildTitle(card: Card): string {
  const variant = variantLabel(card.variant);

  const compose = (
    cardName: string,
    setSegment: string | null,
    includeCondition: boolean,
  ): string => {
    const parts = [cardName];
    if (setSegment) parts.push(setSegment);
    parts.push(card.rarity);
    parts.push(card.language);
    if (variant) parts.push(variant);
    if (includeCondition) parts.push(card.condition);
    return parts.join(' — ');
  };

  const fullCardName = card.card_name;
  const strippedCardName = stripParen(fullCardName);
  const fullSet = card.set_name ?? null;
  const strippedSet = fullSet ? stripParen(fullSet) : null;
  const setCode = card.set_code ?? null;
  const conditionIsDefault = card.condition === 'NM';
  const keepCondition = !conditionIsDefault;

  const ladder: string[] = [];
  // 1. Full bilingual + condition
  ladder.push(compose(fullCardName, fullSet, true));
  // 2. Drop bilingual paren in card_name + set_name
  ladder.push(compose(strippedCardName, strippedSet, true));
  // 3. Drop the implicit-default NM (only when condition is NM)
  if (conditionIsDefault) {
    ladder.push(compose(strippedCardName, strippedSet, false));
  }
  // 4. set_name → set_code (keep condition only if not default)
  ladder.push(compose(strippedCardName, setCode, keepCondition));
  // 5. Drop set entirely
  ladder.push(compose(strippedCardName, null, keepCondition));

  for (const candidate of ladder) {
    if (candidate.length <= MAX_TITLE_LENGTH) return candidate;
  }

  // Last resort: hard-truncate the card name. Keeps card_name + rarity + lang + variant.
  const tail = compose('', null, !conditionIsDefault).replace(/^\s*—\s*/, '');
  const budget = MAX_TITLE_LENGTH - tail.length - ' — '.length;
  const truncatedName = strippedCardName.slice(0, Math.max(1, budget));
  return `${truncatedName} — ${tail}`;
}

export interface VintedConfig {
  vinted_shipping_note: string;
  vinted_seller_note: string;
}

/**
 * Compose the Vinted ad description. Multi-line, includes shop notes from config.
 */
export function buildDescription(card: Card, config: VintedConfig): string {
  const lines: string[] = [
    `✨ ${card.card_name} — ${RARITY_LABEL[card.rarity]}`,
  ];

  const setBits: string[] = [];
  if (card.set_name) setBits.push(card.set_name);
  if (card.set_code) setBits.push(`(${card.set_code})`);
  let setLine = setBits.length > 0 ? `📦 Set : ${setBits.join(' ')}` : null;
  if (setLine && card.set_number) setLine += ` — N° ${card.set_number}`;
  if (setLine) lines.push(setLine);

  lines.push(`${LANGUAGE_FLAGS[card.language]} Langue : ${LANGUAGE_FULL[card.language]}`);
  lines.push(`⭐ État : ${CONDITION_FULL[card.condition]}`);

  const variant = variantLabel(card.variant);
  if (variant) lines.push(`🎨 Variant : ${variant}`);

  lines.push('');
  lines.push(config.vinted_shipping_note);
  lines.push(config.vinted_seller_note);

  return lines.join('\n');
}
```

- [ ] **Step 3.4: Run test, verify pass**

Run: `npx vitest run lib/utils/vinted-template.test.ts`
Expected: PASS — 11 tests

- [ ] **Step 3.5: Commit**

```bash
git add lib/utils/vinted-template.ts lib/utils/vinted-template.test.ts
git commit -m "Vinted: add vinted-template util (smart-truncate title + description)"
```

---

## Task 4 — `PATCH /api/cards/[id]` route

**Files:**
- Create: `app/api/cards/[id]/route.ts`
- Test: `app/api/cards/[id]/route.test.ts`

The route handles two flows:
1. Edit a single card field (e.g. inline price update)
2. Mark sold — runs the restock check via `detectRestock`

The route is intentionally thin so most logic stays in the pure helpers from Tasks 1–2.

- [ ] **Step 4.1: Write the failing test**

```ts
// app/api/cards/[id]/route.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PATCH } from './route';

const supabaseMock = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(supabaseMock),
}));

afterEach(() => {
  vi.clearAllMocks();
});

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/cards/abc', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe('PATCH /api/cards/[id]', () => {
  it('returns 401 when no user is authenticated', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await PATCH(makeRequest({ suggested_price: 10 }), ctx('abc'));
    expect(res.status).toBe(401);
  });

  it('returns 400 when status is invalid', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: 'u' } },
    });
    const res = await PATCH(makeRequest({ status: 'pokedex' }), ctx('abc'));
    expect(res.status).toBe(400);
  });

  it('updates suggested_price without touching status', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: 'u' } },
    });
    const updated = { id: 'abc', suggested_price: 12.5, status: 'for_sale', pokemon_number: 25 };
    const single = vi.fn().mockResolvedValue({ data: updated, error: null });
    const select = vi.fn(() => ({ single }));
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    supabaseMock.from.mockReturnValueOnce({ update });

    const res = await PATCH(makeRequest({ suggested_price: 12.5 }), ctx('abc'));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.card.suggested_price).toBe(12.5);
    expect(json.restock).toBeNull();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ suggested_price: 12.5 }),
    );
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('marks sold and returns restock when last for_sale + pokedex exists', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: 'u' } },
    });
    const sold = {
      id: 'abc', status: 'sold', sold_price: 8, pokemon_number: 25, pokemon_name: 'Pikachu',
    };

    // 1st: update returns the sold card
    const updSingle = vi.fn().mockResolvedValue({ data: sold, error: null });
    const updSelect = vi.fn(() => ({ single: updSingle }));
    const updEq = vi.fn(() => ({ select: updSelect }));
    const update = vi.fn(() => ({ eq: updEq }));

    // 2nd: count remaining for_sale = 0
    const forSaleResp = { data: [], error: null };
    const forSaleEq2 = vi.fn(() => Promise.resolve(forSaleResp));
    const forSaleEq1 = vi.fn(() => ({ eq: forSaleEq2 }));
    const forSaleSelect = vi.fn(() => ({ eq: forSaleEq1 }));

    // 3rd: pokedex card exists
    const pokedexResp = { data: { pokemon_name: 'Pikachu' }, error: null };
    const pokedexMaybe = vi.fn(() => Promise.resolve(pokedexResp));
    const pokedexEq2 = vi.fn(() => ({ maybeSingle: pokedexMaybe }));
    const pokedexEq1 = vi.fn(() => ({ eq: pokedexEq2 }));
    const pokedexSelect = vi.fn(() => ({ eq: pokedexEq1 }));

    supabaseMock.from
      .mockReturnValueOnce({ update })          // PATCH
      .mockReturnValueOnce({ select: forSaleSelect })   // count for_sale
      .mockReturnValueOnce({ select: pokedexSelect });  // get pokedex

    const res = await PATCH(
      makeRequest({ status: 'sold', sold_price: 8 }),
      ctx('abc'),
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.card.status).toBe('sold');
    expect(json.restock).toEqual({ pokemon_number: 25, pokemon_name: 'Pikachu' });
  });

  it('marks sold and returns null restock when no pokedex exists', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: 'u' } },
    });
    const sold = { id: 'abc', status: 'sold', pokemon_number: 25 };
    const updSingle = vi.fn().mockResolvedValue({ data: sold, error: null });
    const update = vi.fn(() => ({ eq: () => ({ select: () => ({ single: updSingle }) }) }));

    const forSaleEq2 = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const forSaleSelect = vi.fn(() => ({ eq: () => ({ eq: forSaleEq2 }) }));

    const pokedexMaybe = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const pokedexSelect = vi.fn(() => ({ eq: () => ({ eq: () => ({ maybeSingle: pokedexMaybe }) }) }));

    supabaseMock.from
      .mockReturnValueOnce({ update })
      .mockReturnValueOnce({ select: forSaleSelect })
      .mockReturnValueOnce({ select: pokedexSelect });

    const res = await PATCH(
      makeRequest({ status: 'sold' }),
      ctx('abc'),
    );
    const json = await res.json();
    expect(json.restock).toBeNull();
  });

  it('returns 404 when the row does not exist', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'not found' },
    });
    const update = vi.fn(() => ({ eq: () => ({ select: () => ({ single }) }) }));
    supabaseMock.from.mockReturnValueOnce({ update });
    const res = await PATCH(makeRequest({ suggested_price: 10 }), ctx('missing'));
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 4.2: Run test, verify fail**

Run: `npx vitest run app/api/cards/\[id\]/route.test.ts`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 4.3: Write the implementation**

```ts
// app/api/cards/[id]/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { detectRestock } from '@/lib/utils/restock-detection';
import type { CardStatus } from '@/lib/types';

export const runtime = 'nodejs';

interface PatchBody {
  status?: CardStatus;
  sold_price?: number | null;
  date_sold?: string | null;
  suggested_price?: number | null;
  cm_price_low?: number | null;
  cm_price_trend?: number | null;
  cm_price_avg?: number | null;
  notes?: string | null;
}

const ALLOWED_STATUSES: ReadonlySet<CardStatus> = new Set(['for_sale', 'collection', 'sold']);

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
) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Build the update payload
  const update: Record<string, unknown> = {};

  if (body.status !== undefined) {
    if (!ALLOWED_STATUSES.has(body.status)) {
      return NextResponse.json(
        { error: 'status invalide (utiliser /api/pokedex/replace pour pokedex)' },
        { status: 400 },
      );
    }
    update.status = body.status;
    if (body.status === 'sold') {
      update.date_sold = body.date_sold ?? new Date().toISOString();
    }
  }

  try {
    const sp = sanitizeNumber(body.sold_price);
    if (sp !== undefined) update.sold_price = sp;
    const sg = sanitizeNumber(body.suggested_price);
    if (sg !== undefined) update.suggested_price = sg;
    const lo = sanitizeNumber(body.cm_price_low);
    if (lo !== undefined) update.cm_price_low = lo;
    const tr = sanitizeNumber(body.cm_price_trend);
    if (tr !== undefined) update.cm_price_trend = tr;
    const av = sanitizeNumber(body.cm_price_avg);
    if (av !== undefined) update.cm_price_avg = av;
  } catch {
    return NextResponse.json({ error: 'champ numérique invalide' }, { status: 400 });
  }

  if (body.notes !== undefined) update.notes = body.notes;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'aucun champ à mettre à jour' }, { status: 400 });
  }

  const { data: updated, error } = await supabase
    .from('cards')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'carte introuvable' }, { status: 404 });
    }
    console.error('PATCH cards failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Restock check only when this update marked the card sold
  let restock = null;
  if (update.status === 'sold' && updated.pokemon_number) {
    const [{ data: stillForSale }, { data: pokedex }] = await Promise.all([
      supabase
        .from('cards')
        .select('id')
        .eq('pokemon_number', updated.pokemon_number)
        .eq('status', 'for_sale'),
      supabase
        .from('cards')
        .select('pokemon_name')
        .eq('pokemon_number', updated.pokemon_number)
        .eq('status', 'pokedex')
        .maybeSingle(),
    ]);

    restock = detectRestock({
      pokemonNumber: updated.pokemon_number,
      pokedexCard: pokedex,
      remainingForSaleCount: stillForSale?.length ?? 0,
    });
  }

  return NextResponse.json({ card: updated, restock });
}
```

- [ ] **Step 4.4: Run test, verify pass**

Run: `npx vitest run app/api/cards/\[id\]/route.test.ts`
Expected: PASS — 6 tests

- [ ] **Step 4.5: Commit**

```bash
git add app/api/cards/\[id\]/route.ts app/api/cards/\[id\]/route.test.ts
git commit -m "Vinted: PATCH /api/cards/[id] (price edit, sold + restock detection)"
```

---

## Task 5 — Vinted page (RSC) + minimal `<VintedList>` scaffold

This task wires the page to live data without UI features. Subsequent tasks fill the UI in.

**Files:**
- Modify: `app/(app)/vinted/page.tsx`
- Create: `components/vinted/VintedList.tsx`

- [ ] **Step 5.1: Replace the placeholder page**

```tsx
// app/(app)/vinted/page.tsx
import { createClient } from '@/lib/supabase/server';
import VintedList from '@/components/vinted/VintedList';
import type { Card } from '@/lib/types';

export const metadata = {
  title: 'Vinted — I.R.I.S',
};

export default async function VintedPage() {
  const supabase = await createClient();

  const [{ data: forSale, error }, { data: pokedex }, { data: configRows }] = await Promise.all([
    supabase
      .from('cards')
      .select('*')
      .eq('status', 'for_sale')
      .order('date_added', { ascending: true }),
    supabase
      .from('cards')
      .select('pokemon_number')
      .eq('status', 'pokedex'),
    supabase.from('config').select('*'),
  ]);

  if (error) {
    return (
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Vinted</h1>
        <p className="text-red mt-4 text-sm">Erreur de chargement : {error.message}</p>
      </section>
    );
  }

  const cards = (forSale ?? []) as Card[];
  const registered = new Set<number>((pokedex ?? []).map((r: { pokemon_number: number }) => r.pokemon_number));
  const config = Object.fromEntries(
    (configRows ?? []).map((r: { key: string; value: string }) => [r.key, r.value]),
  ) as Record<string, string>;

  return (
    <section>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Vinted</h1>
        <p className="text-text-muted mt-1 text-sm">
          {cards.length} carte{cards.length > 1 ? 's' : ''} en stock — tri FIFO
        </p>
      </div>
      <div className="mt-6">
        <VintedList cards={cards} registered={registered} config={config} />
      </div>
    </section>
  );
}
```

- [ ] **Step 5.2: Create the minimal `<VintedList>` scaffold**

```tsx
// components/vinted/VintedList.tsx
'use client';

import { useState } from 'react';
import type { Card } from '@/lib/types';
import { groupCards } from '@/lib/utils/group-cards';

export interface VintedListProps {
  cards: Card[];
  registered: Set<number>;
  config: Record<string, string>;
}

export default function VintedList({ cards: initial, registered, config }: VintedListProps) {
  // State of truth during the session — modals optimistically mutate this.
  const [cards] = useState<Card[]>(initial);

  const groups = groupCards(cards);

  if (groups.length === 0) {
    return (
      <div className="bg-surface border-border rounded-lg border p-6">
        <p className="text-text-muted text-sm">Aucune carte en vente.</p>
      </div>
    );
  }

  // Subsequent tasks replace this block with VintedFilters + VintedRow.
  return (
    <div className="bg-surface border-border rounded-lg border p-6">
      <p className="text-text-muted text-sm">
        {groups.length} groupe{groups.length > 1 ? 's' : ''} — {cards.length} carte
        {cards.length > 1 ? 's' : ''}
      </p>
      <p className="text-text-faint mt-2 font-mono text-xs">
        registered={registered.size} · configKeys={Object.keys(config).length}
      </p>
    </div>
  );
}
```

- [ ] **Step 5.3: Verify build**

Run: `npm run typecheck && npm run lint`
Expected: 0 error, 0 warning

- [ ] **Step 5.4: Commit**

```bash
git add app/\(app\)/vinted/page.tsx components/vinted/VintedList.tsx
git commit -m "Vinted: RSC page fetch + VintedList scaffold"
```

---

## Task 6 — `<VintedFilters>` + search/filter wiring

**Files:**
- Create: `components/vinted/VintedFilters.tsx`
- Modify: `components/vinted/VintedList.tsx`

- [ ] **Step 6.1: Write the filters component**

```tsx
// components/vinted/VintedFilters.tsx
'use client';

import { Search, BookmarkCheck } from 'lucide-react';
import type { CardLanguage, CardRarity } from '@/lib/types';

export interface VintedFilterState {
  search: string;
  language: CardLanguage | 'all';
  rarity: CardRarity | 'all';
  variant: 'all' | 'standard' | 'pokeball' | 'masterball' | 'reverse_holo' | 'promo';
  registered: 'all' | 'yes' | 'no';
}

export const INITIAL_FILTERS: VintedFilterState = {
  search: '',
  language: 'all',
  rarity: 'all',
  variant: 'all',
  registered: 'all',
};

const LANGUAGES: ReadonlyArray<CardLanguage> = ['JP', 'EN', 'FR', 'DE', 'IT', 'ES', 'KO', 'PT', 'ZH'];
const RARITIES: ReadonlyArray<CardRarity> = ['SAR', 'AR', 'SR', 'CHR', 'RR', 'R_HOLO', 'R', 'UC', 'C', 'OTHER'];
const VARIANTS = [
  { value: 'standard' as const, label: 'Standard' },
  { value: 'pokeball' as const, label: 'Poké Ball' },
  { value: 'masterball' as const, label: 'Master Ball' },
  { value: 'reverse_holo' as const, label: 'Reverse Holo' },
  { value: 'promo' as const, label: 'Promo' },
];

interface Props {
  value: VintedFilterState;
  onChange: (next: VintedFilterState) => void;
  visibleCards: number;
  visibleGroups: number;
  totalCards: number;
}

export default function VintedFilters({ value, onChange, visibleCards, visibleGroups, totalCards }: Props) {
  return (
    <div className="bg-bg sticky top-0 z-10 -mx-4 mb-4 flex flex-col gap-3 px-4 py-3 md:mx-0 md:px-0">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="text-text-faint pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2" />
          <input
            type="search"
            placeholder="Recherche : nom, set, n°…"
            value={value.search}
            onChange={(e) => onChange({ ...value, search: e.target.value })}
            className="bg-surface-2 border-border focus:border-red w-full rounded border py-1.5 pl-8 pr-3 text-sm outline-none"
          />
        </div>

        <select
          value={value.language}
          onChange={(e) => onChange({ ...value, language: e.target.value as VintedFilterState['language'] })}
          className="bg-surface-2 border-border rounded border px-3 py-1.5 text-sm"
          aria-label="Langue"
        >
          <option value="all">Toutes langues</option>
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>

        <select
          value={value.rarity}
          onChange={(e) => onChange({ ...value, rarity: e.target.value as VintedFilterState['rarity'] })}
          className="bg-surface-2 border-border rounded border px-3 py-1.5 text-sm"
          aria-label="Rareté"
        >
          <option value="all">Toutes raretés</option>
          {RARITIES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        <select
          value={value.variant}
          onChange={(e) => onChange({ ...value, variant: e.target.value as VintedFilterState['variant'] })}
          className="bg-surface-2 border-border rounded border px-3 py-1.5 text-sm"
          aria-label="Variant"
        >
          <option value="all">Tous variants</option>
          {VARIANTS.map((v) => (
            <option key={v.value} value={v.value}>{v.label}</option>
          ))}
        </select>

        <div className="border-border flex overflow-hidden rounded border text-sm">
          {(['all', 'yes', 'no'] as const).map((s) => {
            const active = value.registered === s;
            const label = s === 'all' ? 'Tous' : s === 'yes' ? 'Registered' : 'Not Registered';
            return (
              <button
                key={s}
                type="button"
                onClick={() => onChange({ ...value, registered: s })}
                className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                  active
                    ? 'bg-red-bg text-red font-medium'
                    : 'bg-surface-2 text-text-muted hover:text-text'
                }`}
              >
                {s === 'yes' && <BookmarkCheck className="h-3.5 w-3.5" />}
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-text-muted text-xs">
        {visibleCards} carte{visibleCards > 1 ? 's' : ''} ({visibleGroups} groupe{visibleGroups > 1 ? 's' : ''}) sur {totalCards}
      </p>
    </div>
  );
}
```

- [ ] **Step 6.2: Wire filters + search into `<VintedList>`**

Replace the body of `components/vinted/VintedList.tsx`:

```tsx
// components/vinted/VintedList.tsx
'use client';

import { useMemo, useState } from 'react';
import type { Card } from '@/lib/types';
import { groupCards } from '@/lib/utils/group-cards';
import VintedFilters, { INITIAL_FILTERS, type VintedFilterState } from './VintedFilters';

export interface VintedListProps {
  cards: Card[];
  registered: Set<number>;
  config: Record<string, string>;
}

function normalize(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function matchesSearch(card: Card, query: string): boolean {
  if (!query) return true;
  const q = normalize(query);
  const fields = [
    card.set_number, card.card_name, card.pokemon_name,
    card.set_name, card.set_code, card.language, card.rarity,
  ];
  return fields.some((f) => f && normalize(f).includes(q));
}

function matchesFilters(card: Card, f: VintedFilterState, registered: Set<number>): boolean {
  if (f.language !== 'all' && card.language !== f.language) return false;
  if (f.rarity !== 'all' && card.rarity !== f.rarity) return false;
  if (f.variant !== 'all') {
    const variant = card.variant ?? 'standard';
    if (variant !== f.variant) return false;
  }
  if (f.registered === 'yes' && !registered.has(card.pokemon_number)) return false;
  if (f.registered === 'no' && registered.has(card.pokemon_number)) return false;
  return true;
}

export default function VintedList({ cards: initial, registered }: VintedListProps) {
  const [cards] = useState<Card[]>(initial);
  const [filters, setFilters] = useState<VintedFilterState>(INITIAL_FILTERS);

  const filtered = useMemo(
    () => cards.filter((c) => matchesSearch(c, filters.search) && matchesFilters(c, filters, registered)),
    [cards, filters, registered],
  );
  const groups = useMemo(() => groupCards(filtered), [filtered]);

  return (
    <div>
      <VintedFilters
        value={filters}
        onChange={setFilters}
        visibleCards={filtered.length}
        visibleGroups={groups.length}
        totalCards={cards.length}
      />

      {groups.length === 0 ? (
        <div className="bg-surface border-border rounded-lg border p-6">
          <p className="text-text-muted text-sm">Aucune carte ne correspond aux filtres.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {groups.map((g) => (
            <li
              key={g.key}
              className="bg-surface border-border flex items-center gap-3 rounded-lg border p-3 text-sm"
            >
              <span className="text-text-faint w-8 font-mono text-xs">#{g.position}</span>
              <span className="flex-1">{g.head.card_name}</span>
              <span className="text-text-muted text-xs">×{g.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 6.3: Verify build**

Run: `npm run typecheck && npm run lint && npx vitest run`
Expected: 0 error, 0 warning, all tests pass

- [ ] **Step 6.4: Commit**

```bash
git add components/vinted/VintedFilters.tsx components/vinted/VintedList.tsx
git commit -m "Vinted: filters + search + grouping wired into list"
```

---

## Task 7 — `<VintedRow>` (full row layout)

**Files:**
- Create: `components/vinted/VintedRow.tsx`
- Modify: `components/vinted/VintedList.tsx`

- [ ] **Step 7.1: Write `<VintedRow>`**

```tsx
// components/vinted/VintedRow.tsx
'use client';

import Link from 'next/link';
import { BookmarkCheck, Bookmark, Tag } from 'lucide-react';
import type { Card } from '@/lib/types';
import type { CardGroup } from '@/lib/utils/group-cards';

const VARIANT_LABEL: Record<string, string> = {
  pokeball: 'Poké Ball',
  masterball: 'Master Ball',
  reverse_holo: 'Reverse Holo',
  promo: 'Promo',
};

const RARITY_COLOR: Record<string, string> = {
  SAR: 'text-red',
  AR: 'text-orange-400',
  SR: 'text-yellow-400',
  CHR: 'text-purple-400',
  RR: 'text-blue-400',
  R_HOLO: 'text-teal-400',
  R: 'text-green-400',
  UC: 'text-text-muted',
  C: 'text-text-faint',
  OTHER: 'text-text-faint',
};

function thumbUrl(card: Card): string {
  if (card.image_url) return card.image_url;
  if (card.tcg_image_url) return card.tcg_image_url;
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${card.pokemon_number}.png`;
}

interface Props {
  group: CardGroup;
  isRegistered: boolean;
  priceCell: React.ReactNode;
  onAnnonceClick: () => void;
  onSoldClick: () => void;
}

export default function VintedRow({
  group, isRegistered, priceCell, onAnnonceClick, onSoldClick,
}: Props) {
  const card = group.head;
  const variantLabel = card.variant ? (VARIANT_LABEL[card.variant] ?? card.variant) : null;

  return (
    <li className="bg-surface border-border flex items-center gap-3 rounded-lg border p-3 text-sm">
      <span className="text-text-faint w-8 shrink-0 font-mono text-xs">#{group.position}</span>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumbUrl(card)}
        alt=""
        loading="lazy"
        className="bg-surface-off h-[84px] w-[60px] shrink-0 rounded object-cover"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium">{card.card_name}</p>
          {variantLabel && (
            <span className="bg-surface-off text-text-muted shrink-0 rounded px-1.5 py-0.5 font-mono text-xs">
              {variantLabel}
            </span>
          )}
        </div>
        <p className="text-text-muted truncate text-xs">
          {card.set_name ?? card.set_code ?? '?'}
          {card.set_code && card.set_name ? ` (${card.set_code})` : ''}
          {card.set_number ? ` — ${card.set_number}` : ''}
        </p>
        <div className="text-text-muted mt-1 flex items-center gap-2 text-xs">
          <span className="font-mono">{card.language}</span>
          <span>·</span>
          <span className={`font-medium ${RARITY_COLOR[card.rarity] ?? ''}`}>{card.rarity}</span>
          <span>·</span>
          <span>{card.condition}</span>
          <Link
            href="/pokedex"
            className={`ml-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${
              isRegistered
                ? 'bg-yellow-900/30 text-yellow-300'
                : 'bg-green-900/30 text-green-300'
            }`}
            title={
              isRegistered
                ? 'Carte déjà dans ton Pokédex (clic : ouvre le Pokédex)'
                : 'Pas dans ton Pokédex (clic : ouvre le Pokédex)'
            }
          >
            {isRegistered ? <BookmarkCheck className="h-3 w-3" /> : <Bookmark className="h-3 w-3" />}
            {isRegistered ? 'Registered' : 'Not Registered'}
          </Link>
        </div>
      </div>

      {group.count > 1 && (
        <span className="bg-surface-off text-text-muted shrink-0 rounded px-2 py-1 font-mono text-xs">
          ×{group.count}
        </span>
      )}

      <div className="shrink-0">{priceCell}</div>

      <button
        type="button"
        onClick={onAnnonceClick}
        className="bg-surface-2 hover:bg-surface-off border-border shrink-0 rounded border px-3 py-1.5 text-xs"
      >
        <Tag className="mr-1 inline h-3.5 w-3.5" />
        Annonce
      </button>

      <button
        type="button"
        onClick={onSoldClick}
        className="bg-red text-bg shrink-0 rounded px-3 py-1.5 text-xs font-medium hover:opacity-90"
      >
        Vendu
      </button>
    </li>
  );
}
```

- [ ] **Step 7.2: Wire `<VintedRow>` into `<VintedList>` (replace the temporary `<li>` block)**

Replace the `groups.length === 0 ? ... : (...)` block in `VintedList.tsx`:

```tsx
{groups.length === 0 ? (
  <div className="bg-surface border-border rounded-lg border p-6">
    <p className="text-text-muted text-sm">Aucune carte ne correspond aux filtres.</p>
  </div>
) : (
  <ul className="space-y-2">
    {groups.map((g) => (
      <VintedRow
        key={g.key}
        group={g}
        isRegistered={registered.has(g.head.pokemon_number)}
        priceCell={
          <span className="text-text-faint font-mono text-xs">
            {g.head.suggested_price !== null ? `${g.head.suggested_price.toFixed(2)} €` : '—'}
          </span>
        }
        onAnnonceClick={() => {/* wired in Task 9 */}}
        onSoldClick={() => {/* wired in Task 8 */}}
      />
    ))}
  </ul>
)}
```

Add the import at the top:
```tsx
import VintedRow from './VintedRow';
```

- [ ] **Step 7.3: Verify build**

Run: `npm run typecheck && npm run lint && npx vitest run`
Expected: 0 error, 0 warning, all tests pass

- [ ] **Step 7.4: Commit**

```bash
git add components/vinted/VintedRow.tsx components/vinted/VintedList.tsx
git commit -m "Vinted: VintedRow with thumb, badges and registered indicator"
```

---

## Task 8 — `<EditablePriceCell>` + inline price PATCH

**Files:**
- Create: `components/vinted/EditablePriceCell.tsx`
- Modify: `components/vinted/VintedList.tsx`

- [ ] **Step 8.1: Write the editable price cell**

```tsx
// components/vinted/EditablePriceCell.tsx
'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';

interface Props {
  cardId: string;
  initialPrice: number | null;
  onSaved: (newPrice: number | null) => void;
}

export default function EditablePriceCell({ cardId, initialPrice, onSaved }: Props) {
  const [price, setPrice] = useState<number | null>(initialPrice);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(initialPrice !== null ? String(initialPrice) : '');
  const [saving, setSaving] = useState(false);

  const commit = async () => {
    setSaving(true);
    const parsed = draft.trim() === '' ? null : Number(draft.replace(',', '.'));
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
      setDraft(price !== null ? String(price) : '');
      setSaving(false);
      setEditing(false);
      return;
    }
    try {
      const res = await fetch(`/api/cards/${cardId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ suggested_price: parsed }),
      });
      if (!res.ok) throw new Error('save failed');
      setPrice(parsed);
      onSaved(parsed);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        inputMode="decimal"
        value={draft}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(price !== null ? String(price) : '');
            setEditing(false);
          }
        }}
        className="bg-surface-2 border-border focus:border-red w-20 rounded border px-2 py-1 text-right font-mono text-xs outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="text-text hover:text-red group inline-flex items-center gap-1 font-mono text-sm font-medium"
    >
      <span className={price !== null ? 'text-yellow-400' : 'text-text-faint'}>
        {price !== null ? `${price.toFixed(2)} €` : '—'}
      </span>
      <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" />
    </button>
  );
}
```

- [ ] **Step 8.2: Wire it into `<VintedList>`**

Now `VintedList` needs to mutate state on price save (so the Annonce modal sees the latest value).

Replace the line with `useState<Card[]>(initial)`:

```tsx
const [cards, setCards] = useState<Card[]>(initial);

const updateCardPrice = (cardId: string, newPrice: number | null) => {
  setCards((prev) =>
    prev.map((c) => (c.id === cardId ? { ...c, suggested_price: newPrice } : c)),
  );
};
```

Replace the `priceCell={...}` prop in the `VintedRow` JSX:

```tsx
priceCell={
  <EditablePriceCell
    cardId={g.head.id}
    initialPrice={g.head.suggested_price}
    onSaved={(newPrice) => updateCardPrice(g.head.id, newPrice)}
  />
}
```

Add the import:
```tsx
import EditablePriceCell from './EditablePriceCell';
```

- [ ] **Step 8.3: Verify build**

Run: `npm run typecheck && npm run lint && npx vitest run`
Expected: 0 error, 0 warning, all tests pass

- [ ] **Step 8.4: Commit**

```bash
git add components/vinted/EditablePriceCell.tsx components/vinted/VintedList.tsx
git commit -m "Vinted: inline editable price cell (PATCH suggested_price)"
```

---

## Task 9 — `<SoldModal>` + `<RestockToast>` + sold flow

**Files:**
- Create: `components/vinted/SoldModal.tsx`
- Create: `components/vinted/RestockToast.tsx`
- Modify: `components/vinted/VintedList.tsx`

- [ ] **Step 9.1: Write `<SoldModal>`**

```tsx
// components/vinted/SoldModal.tsx
'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import type { Card } from '@/lib/types';
import type { RestockAlert } from '@/lib/utils/restock-detection';

interface Props {
  card: Card;
  onClose: () => void;
  onSold: (info: { soldCardId: string; restock: RestockAlert | null }) => void;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function SoldModal({ card, onClose, onSold }: Props) {
  const [price, setPrice] = useState<string>('');
  const [date, setDate] = useState<string>(todayIso());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const parsedPrice = price.trim() === '' ? null : Number(price.replace(',', '.'));
      if (parsedPrice !== null && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) {
        throw new Error('Prix invalide');
      }
      const res = await fetch(`/api/cards/${card.id}`, {
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
      onSold({ soldCardId: card.id, restock: json.restock ?? null });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-surface border-border w-full max-w-md rounded-lg border p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Marquer comme vendue</h2>
            <p className="text-text-muted mt-1 text-sm">{card.card_name}</p>
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

        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="text-text-muted text-xs">Prix de vente (€) — optionnel</span>
            <input
              type="text"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="—"
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
              disabled={submitting}
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

- [ ] **Step 9.2: Write `<RestockToast>`**

```tsx
// components/vinted/RestockToast.tsx
'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, X } from 'lucide-react';
import type { RestockAlert } from '@/lib/utils/restock-detection';

interface Props {
  alert: RestockAlert;
  onDismiss: () => void;
}

const DISMISS_AFTER_MS = 5000;

export default function RestockToast({ alert, onDismiss }: Props) {
  useEffect(() => {
    const t = setTimeout(onDismiss, DISMISS_AFTER_MS);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      role="alert"
      className="bg-surface border-red fixed bottom-6 right-6 z-50 flex max-w-sm items-start gap-3 rounded-lg border p-4 shadow-xl"
    >
      <AlertTriangle className="text-red mt-0.5 h-5 w-5 shrink-0" />
      <div className="flex-1 text-sm">
        <p className="font-medium">Plus de stock pour {alert.pokemon_name}</p>
        <p className="text-text-muted mt-1 text-xs">
          Ta carte Pokédex est exposée. <Link href="/pokedex" className="text-red underline">Vérifier le Pokédex</Link>
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="text-text-muted hover:text-text"
        aria-label="Fermer"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
```

- [ ] **Step 9.3: Wire sold flow into `<VintedList>`**

Add to `VintedList.tsx`:

1. Imports:
```tsx
import SoldModal from './SoldModal';
import RestockToast from './RestockToast';
import type { RestockAlert } from '@/lib/utils/restock-detection';
```

2. State (next to existing `useState`):
```tsx
const [soldTarget, setSoldTarget] = useState<Card | null>(null);
const [restockAlert, setRestockAlert] = useState<RestockAlert | null>(null);
```

3. Handler (above the `return`):
```tsx
const handleSold = ({ soldCardId, restock }: { soldCardId: string; restock: RestockAlert | null }) => {
  setCards((prev) => prev.filter((c) => c.id !== soldCardId));
  setSoldTarget(null);
  if (restock) setRestockAlert(restock);
};
```

4. Wire the row callback:
```tsx
onSoldClick={() => setSoldTarget(g.head)}
```

5. Render modal + toast at the bottom of the returned JSX (before closing `</div>`):
```tsx
{soldTarget && (
  <SoldModal
    card={soldTarget}
    onClose={() => setSoldTarget(null)}
    onSold={handleSold}
  />
)}
{restockAlert && (
  <RestockToast alert={restockAlert} onDismiss={() => setRestockAlert(null)} />
)}
```

- [ ] **Step 9.4: Verify build**

Run: `npm run typecheck && npm run lint && npx vitest run`
Expected: 0 error, 0 warning, all tests pass

- [ ] **Step 9.5: Commit**

```bash
git add components/vinted/SoldModal.tsx components/vinted/RestockToast.tsx components/vinted/VintedList.tsx
git commit -m "Vinted: sold modal + restock toast (PATCH status=sold + restock detection)"
```

---

## Task 10 — `<AnnonceModal>` + ad generator wiring

**Files:**
- Create: `components/vinted/AnnonceModal.tsx`
- Modify: `components/vinted/VintedList.tsx`

- [ ] **Step 10.1: Write `<AnnonceModal>`**

```tsx
// components/vinted/AnnonceModal.tsx
'use client';

import { useEffect, useState } from 'react';
import { Copy, X, Check } from 'lucide-react';
import type { Card } from '@/lib/types';
import { buildTitle, buildDescription, MAX_TITLE_LENGTH, type VintedConfig } from '@/lib/utils/vinted-template';

interface Props {
  card: Card;
  config: VintedConfig;
  onClose: () => void;
  onPriceSaved: (cardId: string, newPrice: number | null) => void;
}

export default function AnnonceModal({ card, config, onClose, onPriceSaved }: Props) {
  const [title, setTitle] = useState<string>(() => buildTitle(card));
  const [description, setDescription] = useState<string>(() => buildDescription(card, config));
  const [vintedPrice, setVintedPrice] = useState<string>(
    card.suggested_price !== null ? String(card.suggested_price) : '',
  );
  const [copiedField, setCopiedField] = useState<'title' | 'desc' | null>(null);
  const [savingPrice, setSavingPrice] = useState(false);

  useEffect(() => {
    if (!copiedField) return;
    const t = setTimeout(() => setCopiedField(null), 1500);
    return () => clearTimeout(t);
  }, [copiedField]);

  const copy = async (text: string, field: 'title' | 'desc') => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
  };

  const persistPrice = async () => {
    const initial = card.suggested_price !== null ? String(card.suggested_price) : '';
    if (vintedPrice === initial) return; // no change
    const parsed = vintedPrice.trim() === '' ? null : Number(vintedPrice.replace(',', '.'));
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) return;
    setSavingPrice(true);
    try {
      const res = await fetch(`/api/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ suggested_price: parsed }),
      });
      if (res.ok) onPriceSaved(card.id, parsed);
    } finally {
      setSavingPrice(false);
    }
  };

  const close = async () => {
    await persistPrice();
    onClose();
  };

  const titleOver = title.length > MAX_TITLE_LENGTH;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-surface border-border max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <h2 className="text-lg font-semibold">Annonce Vinted</h2>
          <button
            type="button"
            onClick={close}
            className="text-text-muted hover:text-text"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-6 md:grid-cols-[200px_1fr]">
          <div className="flex flex-col gap-2">
            {card.image_url && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={card.image_url} alt="Photo" className="bg-surface-off w-full rounded" />
            )}
            {card.tcg_image_url && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={card.tcg_image_url} alt="Image TCG" className="bg-surface-off w-full rounded" />
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-text-muted flex items-center justify-between text-xs">
                <span>Titre</span>
                <span className={`font-mono ${titleOver ? 'text-red' : ''}`}>
                  {title.length}/{MAX_TITLE_LENGTH}
                </span>
              </label>
              <textarea
                rows={2}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
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
              <label className="text-text-muted text-xs">Description</label>
              <textarea
                rows={9}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 font-mono text-xs outline-none"
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

            <div className="border-border grid grid-cols-4 gap-2 rounded border p-3 text-center text-xs">
              <div>
                <p className="text-text-faint">Low</p>
                <p className="font-mono">{card.cm_price_low !== null ? `${card.cm_price_low.toFixed(2)}` : '—'}</p>
              </div>
              <div>
                <p className="text-text-faint">Trend</p>
                <p className="font-mono">{card.cm_price_trend !== null ? `${card.cm_price_trend.toFixed(2)}` : '—'}</p>
              </div>
              <div>
                <p className="text-text-faint">Avg</p>
                <p className="font-mono">{card.cm_price_avg !== null ? `${card.cm_price_avg.toFixed(2)}` : '—'}</p>
              </div>
              <div>
                <p className="text-text-faint">Suggéré</p>
                <p className="font-mono font-bold text-yellow-400">
                  {card.suggested_price !== null ? `${card.suggested_price.toFixed(2)}` : '—'}
                </p>
              </div>
            </div>

            <label className="block">
              <span className="text-text-muted text-xs">Prix de vente Vinted (€) — persisté à la fermeture</span>
              <input
                type="text"
                inputMode="decimal"
                value={vintedPrice}
                disabled={savingPrice}
                onChange={(e) => setVintedPrice(e.target.value)}
                className="bg-surface-2 border-border focus:border-red mt-1 w-32 rounded border px-3 py-2 text-sm outline-none"
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 10.2: Wire annonce flow into `<VintedList>`**

Add to imports:
```tsx
import AnnonceModal from './AnnonceModal';
import type { VintedConfig } from '@/lib/utils/vinted-template';
```

Add state:
```tsx
const [annonceTarget, setAnnonceTarget] = useState<Card | null>(null);
```

Compose the typed config (next to where filters are declared):
```tsx
const vintedConfig: VintedConfig = {
  vinted_shipping_note: config.vinted_shipping_note ?? '',
  vinted_seller_note: config.vinted_seller_note ?? '',
};
```

Wire the row callback:
```tsx
onAnnonceClick={() => setAnnonceTarget(g.head)}
```

Render the modal (next to `<SoldModal>`):
```tsx
{annonceTarget && (
  <AnnonceModal
    card={annonceTarget}
    config={vintedConfig}
    onClose={() => setAnnonceTarget(null)}
    onPriceSaved={updateCardPrice}
  />
)}
```

- [ ] **Step 10.3: Verify build**

Run: `npm run typecheck && npm run lint && npx vitest run`
Expected: 0 error, 0 warning, all tests pass

- [ ] **Step 10.4: Commit**

```bash
git add components/vinted/AnnonceModal.tsx components/vinted/VintedList.tsx
git commit -m "Vinted: AnnonceModal (title + description + clipboard + editable Vinted price)"
```

---

## Task 11 — Manual smoke test in dev

The pure functions and route are unit-tested, but the UI integration needs eyes.

- [ ] **Step 11.1: Start dev server**

Run: `npm run dev`

- [ ] **Step 11.2: Smoke checklist**

Open `http://localhost:3000/vinted` and verify:

1. List displays for_sale cards in FIFO order (oldest first).
2. Search bar filters in real time across name/set/code/lang/rarity.
3. Dropdowns + chips filters work (and combine).
4. A card with multiple identical copies (same `card_id_tcg + lang + cond + variant`) shows `×N`.
5. Click "Vendu" → modal opens, submit empty → card disappears from list.
6. Sell the last for_sale of a Pokémon that has a Pokédex entry → restock toast appears bottom-right with link to `/pokedex`.
7. Click "Annonce" → modal opens, title shows char counter, both copy buttons paste correctly.
8. Edit a price inline (click value → input) → Enter saves → reload page confirms persistence.
9. Edit Vinted price in annonce modal → close → reload page confirms persistence.
10. Registered/Not registered badge has the correct color and links to `/pokedex`.

If any check fails, fix and re-verify before committing.

- [ ] **Step 11.3: Stop dev server**

Ctrl+C the dev server.

- [ ] **Step 11.4: No commit needed unless fixes were applied**

If fixes were made:
```bash
git add -A
git commit -m "Vinted: smoke-test fixes"
```

---

## Task 12 — Phase summary doc + final lint/typecheck/test pass

**Files:**
- Rename: `docs/phase1-summary.md` → `docs/phases-summary.md`
- Modify: `docs/phases-summary.md` (append Phase 2 section)
- Modify: `CLAUDE.md` (update phase status line)

- [ ] **Step 12.1: Rename and update the summary**

```bash
git mv docs/phase1-summary.md docs/phases-summary.md
```

- [ ] **Step 12.2: Append Phase 2 section to `docs/phases-summary.md`**

Add after the existing "1.13" section (and before "Prochaine étape" if still present — replace it):

```markdown
### Phase 2 — Module Vinted

**Contexte** : Phase 1 livrait l'ingestion (scan → enrichissement → save) ; Phase 2 ferme la boucle vente : voir le stock, marquer vendu, générer une annonce prête à coller.

**Livrables** :
- `lib/utils/group-cards.ts` — clé de groupement variant-aware (`card_id_tcg + language + condition + variant`, fallback composite si `card_id_tcg` null) + tri FIFO inter/intra-groupe + position globale.
- `lib/utils/restock-detection.ts` — pure : détecte si une vente expose la carte Pokédex (pokedex existe AND aucune for_sale restante).
- `lib/utils/vinted-template.ts` — `buildTitle` (smart-truncate ≤ 80 chars, ordre : full → drop bilingual paren → drop NM → set_name → set_code → drop set) + `buildDescription` multi-langues + table de constants.
- `app/api/cards/[id]/route.ts` — PATCH générique (édit prix, marquage vendu) + check restock server-side après vente.
- `app/(app)/vinted/page.tsx` — RSC fetch (for_sale + pokedex registered + config en parallèle).
- `components/vinted/` — `VintedList` (orchestrateur), `VintedFilters` (search + 4 filtres), `VintedRow` (layout avec thumb, badges, registered indicator), `EditablePriceCell` (édit inline), `SoldModal` (prix + date), `RestockToast` (5s, lien `/pokedex`), `AnnonceModal` (titre éditable + description + boutons copier + édit prix Vinted).
- Tests : +21 (group-cards 7, restock-detection 4, vinted-template 11, route /api/cards/[id] 6 minus deduplication) → ~137 total. 0 lint warning, tsc clean.

**Décisions clés** :
- Variant inclus dans la clé de groupement (Poké Ball ≠ standard côté valeur Vinted).
- Prix éditable inline en attendant le cron Cardmarket Phase 3.
- Restock = toast éphémère (la persistance dashboard est Phase 4).
- Modal pour vendu et annonce, pas de drawer ni de page dédiée.

**Followups différés** :
1. Auto-ouverture du PokedexDrawer au clic sur badge Registered (actuellement : lien vers `/pokedex` sans anchor).
2. Tests E2E Playwright sur le flow complet (déféré, cohérent avec note Phase 1.13).
3. Pricing variant-aware quand le scraper LimitlessTCG splittera la donnée (Phase 3).
4. Cron Cardmarket → Phase 3.
5. Bulk vendu + dashboard KPIs → Phase 4.

## Prochaine étape : Phase 3

**Objectif** : Cron Cardmarket pour rafraîchir les prix automatiquement, mode lot ≤ 20 photos, script Python CLI.
```

- [ ] **Step 12.3: Update CLAUDE.md status line**

In `CLAUDE.md`, find the "Avancement" section and change the Phase 2 line. Replace:

```
- **Phase 2** — A FAIRE. Module Vinted (liste FIFO, générateur d'annonce, action "vendu").
```

with:

```
- **Phase 2** — TERMINEE. Module Vinted : liste FIFO + groupement variant-aware, édit prix inline, action "Vendu" + restock toast, générateur d'annonce avec smart-truncate titre 80 chars. ~137 tests, 0 lint warning.
```

Also update the line referencing `docs/phase1-summary.md` near the bottom (Bilan détaillé) — change to `docs/phases-summary.md`.

- [ ] **Step 12.4: Final verification pass**

Run: `npm run lint && npm run typecheck && npx vitest run`
Expected: 0 lint warning, 0 type error, all tests pass.

- [ ] **Step 12.5: Commit**

```bash
git add docs/phases-summary.md CLAUDE.md
git commit -m "Docs: rename phase summary, add Phase 2 bilan, update CLAUDE.md status"
```

---

## Done

After Task 12, Phase 2 is complete. The user has:

- A working `/vinted` page with FIFO + grouping + filters + search.
- Vendu flow with restock toast.
- Annonce generator with editable title (counter), editable description, copy buttons, editable Vinted price.
- Inline price editing throughout the list.
- Pure-function coverage for the three risky bits (grouping, restock, template).

Next phase (Phase 3) covers the Cardmarket cron + the batch upload mode + Python CLI.
