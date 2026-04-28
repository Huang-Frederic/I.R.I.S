# TCG Catalog via Cardmarket — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

---

## PIVOT NOTE (2026-04-28)

**Cardmarket API is closed to new apps.** Mid-implementation discovery: Cardmarket shut down API access for new applications in 2023. Dead OAuth code was cleaned up.

**Pivoted to scraping LimitlessTCG** (limitlesstcg.com, robots.txt fully open). Script `scripts/scrape-limitlesstcg.ts` crawls 7 languages × ~150 sets = **111,396 cards** in ~12 minutes. This plan originally described Cardmarket OAuth workflow — actual implementation follows the same architecture (`tcg_catalog` table, enrichment strategies) but fed by LimitlessTCG scraping instead of Cardmarket OAuth.

Result: test bench went from 10/30 (33%) to **19/30 (63%)** measured, ~22/30 (73%) effective when accounting for set-variant naming.

---

**Goal:** Build a local Pokémon TCG catalog (Supabase table `tcg_catalog`) populated via ~~Cardmarket's Personal App OAuth API~~ **LimitlessTCG scraping**, replacing TCGdex as the primary runtime source for post-OCR enrichment.

**Architecture:** A one-shot Node script crawls ~200 Cardmarket Pokémon expansion endpoints, upserts cards into `tcg_catalog`. The enrich route looks up locally first (`set_code+set_number+language`), falls back to TCGdex for cards not yet scraped. TCGdex's existing wrapper stays as Strategy 3. pokemontcg.io fallback is removed (obsolete).

**Tech Stack:** Next.js 16 + Supabase Postgres + TypeScript + tsx for scripts. Cardmarket API v2.0 over OAuth 1.0a (HMAC-SHA1). Tests with Vitest. Node 22 (pinned via `.nvmrc`).

**Source spec:** [docs/superpowers/specs/2026-04-28-tcg-catalog-cardmarket-design.md](../specs/2026-04-28-tcg-catalog-cardmarket-design.md)

**Context for fresh engineer:**
- I.R.I.S is a mono-user PWA for Pokémon TCG collection management. See [CLAUDE.md](../../../CLAUDE.md) for project overview, [docs/setup.md](../../setup.md) for local setup.
- The OCR + enrichment pipeline is in `lib/api/vision.ts` (OCR), `lib/api/tcgdex.ts` (current source), `app/api/enrich/route.ts` (orchestration).
- A test bench exists at `scripts/test-bench.ts` measuring accuracy on 30 real cards in `cards_assets/`. Current score: **10/30 (33%)**. Cause: TCGdex JP doesn't catalog older sets (BW, XY, SM-era).
- All times in plan are estimates assuming familiarity with Next.js + Supabase + TypeScript.
- Always run Node 22: `source ~/.nvm/nvm.sh && nvm use 22` before any `npm` / `npx` command. Node 18 breaks Vitest.

---

## File Structure

**New files:**
- `supabase/migrations/<timestamp>_tcg_catalog.sql` — table + index + RLS
- `lib/supabase/service.ts` — service-role Supabase client for scripts (bypasses RLS for upserts)
- `lib/api/cardmarket.ts` (server-only) — OAuth 1.0a wrapper + endpoint helpers
- `lib/api/cardmarket.test.ts` — signature/encoding pure-function tests
- `lib/api/tcg-catalog.ts` (server-only) — Supabase lookup helpers (`lookupByCode`, `lookupByTotal`, `disambiguateByName`)
- `lib/api/tcg-catalog.test.ts` — lookup + disambiguation tests
- `scripts/cardmarket-ping.ts` — validates OAuth via `/account` (200 OK = signature works)
- `scripts/scrape-cardmarket.ts` — bootstrap script

**Modified files:**
- `app/api/enrich/route.ts` — Strategy 1+2 hit `tcg_catalog` first, TCGdex becomes Strategy 3
- `.env.example` — already has MKM_* vars (no change needed, just confirm)
- `CLAUDE.md` — note the new architecture (catalog is primary source)
- `docs/phase1-summary.md` — add catalog work to Phase 1 wrap-up

**Deleted files:**
- `lib/api/tcgapi.ts` — pokemontcg.io wrapper, obsolete
- `lib/api/tcgapi.test.ts` — tests for above

**Unchanged (kept for Strategy 3 fallback):**
- `lib/api/tcgdex.ts` — still used when catalog miss + TCGdex might have it (newest sets)

---

## Phase A — Database Migration

### Task 1: Create `tcg_catalog` migration

**Files:**
- Create: `supabase/migrations/<timestamp>_tcg_catalog.sql` (use `supabase migration new tcg_catalog` to get correct timestamp)

- [ ] **Step 1: Generate migration file**

```bash
source ~/.nvm/nvm.sh && nvm use 22
npx supabase migration new tcg_catalog
```

Expected output: `Created new migration at supabase/migrations/<timestamp>_tcg_catalog.sql`

- [ ] **Step 2: Write migration SQL**

Edit the newly created file with this content:

```sql
-- I.R.I.S — TCG catalog table
-- Local cache of Pokémon TCG cards, populated from Cardmarket via
-- scripts/scrape-cardmarket.ts. Serves as the primary source for
-- post-OCR enrichment (lookup by set_code + set_number + language).
--
-- Reuses the card_language and card_rarity enums from initial_schema.

create table tcg_catalog (
  id              uuid          primary key default gen_random_uuid(),
  cardmarket_id   text          not null,
  set_code        text          not null,
  set_number      text          not null,
  set_total       integer,
  language        card_language not null,
  card_name       text          not null,
  pokemon_name    text,
  pokemon_number  integer,
  set_name        text          not null,
  rarity          card_rarity,
  image_url       text,
  scraped_at      timestamptz   not null default now(),

  constraint tcg_catalog_unique unique (set_code, set_number, language)
);

-- Primary lookup: enrich pipeline queries by (set_code, set_number, language).
create index tcg_catalog_lookup_idx
  on tcg_catalog (set_code, set_number, language);

-- Secondary lookup: Phase 3 cron will look up cardmarket_id to fetch prices.
create index tcg_catalog_cardmarket_idx
  on tcg_catalog (cardmarket_id);

-- Fallback lookup: when set_code OCR fails, narrow by printed set_total + localId.
create index tcg_catalog_total_idx
  on tcg_catalog (set_total, set_number, language);

-- RLS: authenticated user has read access (mono-user app).
-- Writes happen exclusively from the bootstrap script via service role.
alter table tcg_catalog enable row level security;

create policy "tcg_catalog_read_authenticated" on tcg_catalog
  for select to authenticated using (true);
```

- [ ] **Step 3: Apply migration locally**

```bash
npx supabase db push
```

Expected: `Applying migration <timestamp>_tcg_catalog.sql ... Finished supabase db push.`

If you get "supabase not started", run `npx supabase start` first. If your project uses a remote Supabase (no local CLI), apply via Supabase Studio SQL editor instead.

- [ ] **Step 4: Verify table created**

```bash
npx supabase db diff --schema public 2>&1 | head -20
```

Expected: no diff (table is now in the migration). You can also visually confirm in Supabase Studio → Database → Tables.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/
git commit -m "Add tcg_catalog table for local card catalog"
```

---

## Phase B — Cardmarket OAuth Wrapper

### Task 2: Service-role Supabase client (needed by scripts)

**Files:**
- Create: `lib/supabase/service.ts`

The bootstrap script needs to write to `tcg_catalog` bypassing RLS. The existing `lib/supabase/server.ts` is for Server Components and uses the anon key. We add a separate client using the service role key.

- [ ] **Step 1: Write the service client**

```typescript
// lib/supabase/service.ts
import { createClient } from '@supabase/supabase-js';

/**
 * Supabase client using the SERVICE ROLE key — bypasses RLS.
 *
 * Use ONLY from trusted server contexts: scripts run on the developer's
 * machine, and route handlers explicitly authorized by a CRON_SECRET.
 * NEVER expose this client to the browser.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set',
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/supabase/service.ts
git commit -m "Add service-role Supabase client for scripts"
```

---

### Task 3: OAuth signature — write the failing test

**Files:**
- Create: `lib/api/cardmarket.test.ts`

Cardmarket uses OAuth 1.0a HMAC-SHA1. Their docs at https://api.cardmarket.com/ws/documentation/API_2.0:Auth_Signature provide the algorithm step-by-step. We test the deterministic parts (parameter sorting, percent-encoding, base string construction) before testing the actual HMAC.

The percent-encoding is RFC 3986 strict: only A-Z, a-z, 0-9, `-`, `.`, `_`, `~` are unreserved. Notably space → `%20` (not `+`), and `/`, `:`, `=` get encoded.

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/api/cardmarket.test.ts
import { describe, expect, it } from 'vitest';
import {
  percentEncode,
  buildSignatureBaseString,
  buildSigningKey,
  signRequest,
} from './cardmarket';

describe('percentEncode', () => {
  it('leaves unreserved characters alone', () => {
    expect(percentEncode('AZaz09-._~')).toBe('AZaz09-._~');
  });

  it('encodes space as %20 (not +)', () => {
    expect(percentEncode('hello world')).toBe('hello%20world');
  });

  it('encodes reserved characters', () => {
    expect(percentEncode('a/b:c=d&e')).toBe('a%2Fb%3Ac%3Dd%26e');
  });

  it('encodes Unicode (UTF-8 percent-encoded)', () => {
    expect(percentEncode('é')).toBe('%C3%A9');
  });
});

describe('buildSignatureBaseString', () => {
  it('uppercases method, encodes URL, sorts and encodes params', () => {
    const result = buildSignatureBaseString(
      'get',
      'https://api.cardmarket.com/ws/v2.0/account',
      {
        oauth_consumer_key: 'KEY',
        oauth_token: 'TOKEN',
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: '1700000000',
        oauth_nonce: 'NONCE',
        oauth_version: '1.0',
      },
    );
    // Method&URL&ParamsString — each component URL-encoded
    // Params alphabetically sorted: oauth_consumer_key, oauth_nonce,
    // oauth_signature_method, oauth_timestamp, oauth_token, oauth_version
    expect(result).toBe(
      'GET&' +
        'https%3A%2F%2Fapi.cardmarket.com%2Fws%2Fv2.0%2Faccount&' +
        'oauth_consumer_key%3DKEY%26' +
        'oauth_nonce%3DNONCE%26' +
        'oauth_signature_method%3DHMAC-SHA1%26' +
        'oauth_timestamp%3D1700000000%26' +
        'oauth_token%3DTOKEN%26' +
        'oauth_version%3D1.0',
    );
  });
});

describe('buildSigningKey', () => {
  it('is "appSecret&accessSecret" with each percent-encoded', () => {
    expect(buildSigningKey('app/secret', 'access&secret')).toBe(
      'app%2Fsecret&access%26secret',
    );
  });
});

describe('signRequest (HMAC-SHA1 + Authorization header)', () => {
  // Deterministic sanity test: given fixed inputs, the signature is
  // reproducible. The expected value comes from running the same
  // algorithm in a known-good OAuth library (e.g. Python's oauthlib).
  // If this changes, the wrapper is broken.
  it('produces the same signature for fixed inputs (regression test)', () => {
    const header = signRequest({
      method: 'GET',
      url: 'https://api.cardmarket.com/ws/v2.0/account',
      appToken: 'app-key',
      appSecret: 'app-secret',
      accessToken: 'access-token',
      accessSecret: 'access-secret',
      // Override timestamp + nonce for deterministic output
      _testTimestamp: '1700000000',
      _testNonce: 'fixedNonce',
    });
    expect(header).toContain('OAuth realm="https://api.cardmarket.com/ws/v2.0/account"');
    expect(header).toContain('oauth_consumer_key="app-key"');
    expect(header).toContain('oauth_token="access-token"');
    expect(header).toContain('oauth_signature_method="HMAC-SHA1"');
    expect(header).toContain('oauth_timestamp="1700000000"');
    expect(header).toContain('oauth_nonce="fixedNonce"');
    expect(header).toContain('oauth_version="1.0"');
    // Match a 28-char base64 SHA1 signature, allowing /, +, = chars
    expect(header).toMatch(/oauth_signature="[A-Za-z0-9+/=]{28}"/);
  });

  it('different secrets produce different signatures', () => {
    const opts = {
      method: 'GET' as const,
      url: 'https://api.cardmarket.com/ws/v2.0/account',
      appToken: 'k',
      accessToken: 't',
      _testTimestamp: '1',
      _testNonce: 'n',
    };
    const h1 = signRequest({ ...opts, appSecret: 'A', accessSecret: 'B' });
    const h2 = signRequest({ ...opts, appSecret: 'X', accessSecret: 'Y' });
    expect(h1).not.toBe(h2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
source ~/.nvm/nvm.sh && nvm use 22
npm test -- --run lib/api/cardmarket.test.ts
```

Expected: FAIL with "Cannot find module './cardmarket'" or similar.

- [ ] **Step 3: Commit failing tests**

```bash
git add lib/api/cardmarket.test.ts
git commit -m "Cardmarket: add OAuth signature tests (failing)"
```

---

### Task 4: Implement the OAuth wrapper

**Files:**
- Create: `lib/api/cardmarket.ts`

The wrapper stays small and pure: signature primitives + a single `mkmFetch(path, method)` that any endpoint can use.

- [ ] **Step 1: Write the implementation**

```typescript
// lib/api/cardmarket.ts
import 'server-only';
import { createHmac, randomBytes } from 'node:crypto';

/**
 * Cardmarket API wrapper — OAuth 1.0a (HMAC-SHA1) per
 * https://api.cardmarket.com/ws/documentation/API_2.0:Auth_Signature
 *
 * Used by:
 *   - scripts/scrape-cardmarket.ts (bootstrap of tcg_catalog)
 *   - scripts/cardmarket-ping.ts   (validates OAuth setup)
 *   - Phase 3: app/api/prices/update/route.ts (live pricing cron)
 *
 * Rate limiting is the caller's responsibility — Cardmarket's Personal
 * App tier is roughly 5000 requests/day. The scrape script uses a
 * 500ms delay between requests as a polite default.
 */

const BASE_URL = process.env.MKM_API_URL ?? 'https://api.cardmarket.com/ws/v2.0';

/** RFC 3986 strict percent-encoding. OAuth 1.0a requires this exact form. */
export function percentEncode(s: string): string {
  return encodeURIComponent(s).replace(
    /[!*'()]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

export function buildSigningKey(appSecret: string, accessSecret: string): string {
  return `${percentEncode(appSecret)}&${percentEncode(accessSecret)}`;
}

export function buildSignatureBaseString(
  method: string,
  url: string,
  params: Record<string, string>,
): string {
  const sortedKeys = Object.keys(params).sort();
  const paramsString = sortedKeys
    .map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join('&');
  return `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(paramsString)}`;
}

interface SignRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  appToken: string;
  appSecret: string;
  accessToken: string;
  accessSecret: string;
  /** Test-only override for deterministic signatures. */
  _testTimestamp?: string;
  _testNonce?: string;
}

/**
 * Builds the full `Authorization: OAuth ...` header for a Cardmarket request.
 * The realm is the URL itself — Cardmarket's quirk, documented in their guide.
 */
export function signRequest(opts: SignRequestOptions): string {
  const timestamp =
    opts._testTimestamp ?? Math.floor(Date.now() / 1000).toString();
  const nonce = opts._testNonce ?? randomBytes(16).toString('hex');

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: opts.appToken,
    oauth_token: opts.accessToken,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_nonce: nonce,
    oauth_version: '1.0',
  };

  const baseString = buildSignatureBaseString(opts.method, opts.url, oauthParams);
  const signingKey = buildSigningKey(opts.appSecret, opts.accessSecret);
  const signature = createHmac('sha1', signingKey).update(baseString).digest('base64');

  const headerParams = { ...oauthParams, oauth_signature: signature };
  const headerString = Object.keys(headerParams)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(headerParams[k])}"`)
    .join(', ');

  return `OAuth realm="${opts.url}", ${headerString}`;
}

/** Internal helper: signs + sends a request, throws on non-2xx. */
async function mkmFetch(path: string, method: 'GET' = 'GET'): Promise<unknown> {
  const url = `${BASE_URL}${path}`;
  const auth = signRequest({
    method,
    url,
    appToken: process.env.MKM_APP_TOKEN!,
    appSecret: process.env.MKM_APP_SECRET!,
    accessToken: process.env.MKM_ACCESS_TOKEN!,
    accessSecret: process.env.MKM_ACCESS_SECRET!,
  });

  const response = await fetch(url, { method, headers: { Authorization: auth } });

  if (response.status === 204) return null; // No content (rate limit reset etc.)
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Cardmarket ${response.status} ${path}: ${body.slice(0, 200)}`);
  }
  return response.json();
}

// ---------------------------------------------------------------------------
// Endpoint wrappers
// ---------------------------------------------------------------------------

/** Pokémon's game ID on Cardmarket. */
export const POKEMON_GAME_ID = 6;

export interface MKMExpansion {
  idExpansion: number;
  abbreviation: string;
  enName: string;
  releaseDate?: string;
  isReleased?: boolean;
}

export async function getPokemonExpansions(): Promise<MKMExpansion[]> {
  const data = (await mkmFetch(`/games/${POKEMON_GAME_ID}/expansions`)) as {
    expansion: MKMExpansion[];
  };
  return data.expansion ?? [];
}

export interface MKMSingle {
  idProduct: number;
  enName: string;
  localization?: { name: string; idLanguage: number }[];
  number?: string;
  rarity?: string;
  expansion?: { idExpansion: number; enName: string; abbreviation: string };
  image?: string;
}

/**
 * Returns all single products in an expansion. The endpoint groups by
 * "metaProduct" (one per card design); language variants are exposed via
 * the `localization` array on each product.
 */
export async function getExpansionSingles(idExpansion: number): Promise<MKMSingle[]> {
  const data = (await mkmFetch(`/expansions/${idExpansion}/singles`)) as {
    single: MKMSingle[];
  };
  return data.single ?? [];
}

/** Used by cardmarket-ping to validate OAuth credentials. */
export async function getAccount(): Promise<{ idUser: number; username: string }> {
  const data = (await mkmFetch('/account')) as {
    account: { idUser: number; username: string };
  };
  return data.account;
}
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
source ~/.nvm/nvm.sh && nvm use 22
npm test -- --run lib/api/cardmarket.test.ts
```

Expected: PASS (all 7 cardmarket tests).

- [ ] **Step 3: Run full test suite to verify no regressions**

```bash
npm test -- --run
```

Expected: 73 tests passing (66 existing + 7 new).

- [ ] **Step 4: Commit**

```bash
git add lib/api/cardmarket.ts
git commit -m "Cardmarket: implement OAuth 1.0a wrapper + endpoint helpers"
```

---

### Task 5: cardmarket-ping script (validates OAuth)

**Files:**
- Create: `scripts/cardmarket-ping.ts`

This is the smallest possible OAuth validation: hit `/account` and print the result. If it returns a username, the signature works.

- [ ] **Step 1: Write the script**

```typescript
// scripts/cardmarket-ping.ts
/**
 * Validates Cardmarket OAuth setup. Run AFTER adding MKM_* tokens to
 * .env.local. A successful response means the wrapper signs correctly
 * and the credentials are accepted.
 *
 * Usage: npx tsx scripts/cardmarket-ping.ts
 */
import fs from 'node:fs';
import path from 'node:path';

// Load .env.local (no dotenv dependency — same pattern as test-bench.ts)
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
  }
}

async function main() {
  const required = ['MKM_APP_TOKEN', 'MKM_APP_SECRET', 'MKM_ACCESS_TOKEN', 'MKM_ACCESS_SECRET'];
  for (const key of required) {
    if (!process.env[key]) {
      console.error(`Missing ${key} in .env.local`);
      process.exit(1);
    }
  }

  const { getAccount } = await import('../lib/api/cardmarket');
  console.log('Calling Cardmarket /account ...');
  const account = await getAccount();
  console.log(`OK — authenticated as "${account.username}" (idUser=${account.idUser})`);
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  console.error('\nIf 401: signature wrong OR tokens invalid OR account suspended');
  console.error('If 403: app type does not have access to this endpoint');
  process.exit(1);
});
```

- [ ] **Step 2: Commit (cannot run yet — needs user tokens)**

```bash
git add scripts/cardmarket-ping.ts
git commit -m "Cardmarket: add OAuth ping script for credential validation"
```

---

### Task 6: USER ACTION — Create Cardmarket app + tokens

This is **manual work for the project owner**, not for the engineer running the plan. Document in plan progress before proceeding.

- [ ] **Step 1: Create Cardmarket account** at https://www.cardmarket.com (free)

- [ ] **Step 2: Create a Personal App**
  1. My Account → App Center → New App
  2. App type: choose the **non-Dedicated** option that gives access to game/expansion endpoints (try "App with Owner accounts" first; if forbidden, try other personal options)
  3. Name: "I.R.I.S Catalog Scraper"
  4. Description: "Local catalog for personal Pokémon collection management"

- [ ] **Step 3: Copy the 4 tokens** to `.env.local`:

```env
MKM_APP_TOKEN=<the App Token>
MKM_APP_SECRET=<the App Secret>
MKM_ACCESS_TOKEN=<the Access Token>
MKM_ACCESS_SECRET=<the Access Token Secret>
```

- [ ] **Step 4: Validate with cardmarket-ping**

```bash
source ~/.nvm/nvm.sh && nvm use 22
npx tsx scripts/cardmarket-ping.ts
```

Expected: `OK — authenticated as "<username>" (idUser=<id>)`

If 401: wrong tokens or signature bug. If 403: wrong app type — recreate.

**Gate 1:** Do not proceed past this point until ping returns 200. If you get 403 on `/account`, also try a different endpoint like `/games` to confirm whether it's an account-scope issue vs. signature issue.

---

## Phase C — Bootstrap Script

### Task 7: Single-expansion proof (validates data shape)

**Files:**
- Create: `scripts/scrape-cardmarket.ts` (initial proof-of-concept version)

Before building the full scraper, run against one expansion (e.g. SV11W = expansion ID we discover from `getPokemonExpansions`) to validate Cardmarket's actual response shape. The spec acknowledges uncertainty on whether `/expansions/{id}/singles` returns all languages inline or requires per-language calls.

- [ ] **Step 1: Write the proof script (single expansion, dry-run only)**

```typescript
// scripts/scrape-cardmarket.ts
/**
 * Bootstrap script — populates tcg_catalog from Cardmarket.
 *
 * Modes (set MODE env var):
 *   MODE=probe (default): hit one expansion + dump shape, NO writes
 *   MODE=full:            crawl all Pokémon expansions + upsert to Supabase
 *
 * Usage:
 *   npx tsx scripts/scrape-cardmarket.ts
 *   MODE=full npx tsx scripts/scrape-cardmarket.ts
 */
import fs from 'node:fs';
import path from 'node:path';

// Load .env.local
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
  }
}

const MODE = process.env.MODE ?? 'probe';
const RATE_LIMIT_MS = 500; // 2 req/sec, polite default

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function probe() {
  const { getPokemonExpansions, getExpansionSingles } = await import('../lib/api/cardmarket');
  console.log('Fetching all Pokémon expansions ...');
  const expansions = await getPokemonExpansions();
  console.log(`Got ${expansions.length} expansions.`);

  // Pick an interesting one: SV11W (modern, Japanese)
  const sv11w = expansions.find((e) => e.abbreviation?.toUpperCase() === 'SV11W');
  const target = sv11w ?? expansions[0];
  console.log(`\nProbing expansion: ${target.enName} (id=${target.idExpansion})`);

  await sleep(RATE_LIMIT_MS);
  const singles = await getExpansionSingles(target.idExpansion);
  console.log(`Got ${singles.length} singles.`);
  console.log('\nFirst 3 singles (raw shape):');
  for (const s of singles.slice(0, 3)) {
    console.log(JSON.stringify(s, null, 2));
  }
  console.log('\nLanguage IDs found across all singles:');
  const langs = new Set<number>();
  for (const s of singles) {
    for (const loc of s.localization ?? []) langs.add(loc.idLanguage);
  }
  console.log([...langs].sort((a, b) => a - b));
  console.log('\nRarity values found:');
  console.log([...new Set(singles.map((s) => s.rarity).filter(Boolean))]);
}

async function full() {
  console.log('FULL mode not yet implemented — see Task 9');
  process.exit(1);
}

const action = MODE === 'full' ? full : probe;
action().catch((e) => {
  console.error('Scrape failed:', e.message);
  process.exit(1);
});
```

- [ ] **Step 2: Run probe**

```bash
source ~/.nvm/nvm.sh && nvm use 22
npx tsx scripts/scrape-cardmarket.ts
```

Expected: prints expansion count, dumps shape of 3 singles, lists language IDs and rarity values.

**Decision points based on output:**

| What you see | What to do |
|---|---|
| `localization` array contains FR/JP/DE entries | Languages are inline — Task 9 can build catalog rows by iterating `localization` |
| `localization` only has EN, no JP/FR | Languages need separate calls — Task 9 must call `/expansions/{id}/singles?idLanguage=N` per language (likely 1=EN, 2=FR, 3=DE, 4=ES, 5=IT, 6=ChiSimplified, 7=JP) |
| `image` field present, looks like a URL | Hot-link works — store as-is |
| `image` missing | Need a follow-up `/products/{id}` call per card to get image — adjust Task 9 |
| Rarity strings unfamiliar (e.g. "Holo Rare V", "Trainer Hyper Rare") | Build `MKM_RARITY_MAP` in Task 8 from observed values |

- [ ] **Step 3: Save the probe output for reference**

```bash
npx tsx scripts/scrape-cardmarket.ts > /tmp/mkm-probe.txt 2>&1
cat /tmp/mkm-probe.txt
```

Keep `/tmp/mkm-probe.txt` open while writing Task 8 and Task 9.

- [ ] **Step 4: Commit the probe script**

```bash
git add scripts/scrape-cardmarket.ts
git commit -m "Cardmarket: scrape probe — validates expansion/singles shape"
```

---

### Task 8: Rarity + language mapping module

**Files:**
- Modify: `scripts/scrape-cardmarket.ts` — add mapping functions and tests

Cardmarket's rarity vocabulary differs from our `card_rarity` enum. Build the mapping from observed values (Task 7 output). Anything unmapped falls through to `OTHER` and we log it for review.

- [ ] **Step 1: Add the mapping (top of scrape-cardmarket.ts, before main functions)**

Adjust the right-hand-side enum keys based on what your probe output. Below is a starting point — extend with values you saw in `/tmp/mkm-probe.txt`.

```typescript
// scripts/scrape-cardmarket.ts (add near top)

/** Cardmarket language IDs → our card_language enum. */
const MKM_LANGUAGE_MAP: Record<number, string> = {
  1: 'EN',
  2: 'FR',
  3: 'DE',
  4: 'ES',
  5: 'IT',
  6: 'ZH',  // Chinese Simplified — closest match in our enum
  7: 'JP',
  8: 'PT',
  9: 'KO',
  // Cardmarket has more (Russian, Czech...) — those become null below
};

/** Cardmarket rarity strings → our card_rarity enum. Augment from probe data. */
const MKM_RARITY_MAP: Record<string, string> = {
  'Common': 'C',
  'Uncommon': 'UC',
  'Rare': 'R',
  'Holo Rare': 'R_HOLO',
  'Rare Holo': 'R_HOLO',
  'Holo Rare V': 'RR',
  'Holo Rare VMAX': 'RR',
  'Holo Rare VSTAR': 'RR',
  'Double Rare': 'RR',
  'Ultra Rare': 'SR',
  'Illustration Rare': 'AR',
  'Special Illustration Rare': 'SAR',
  'Hyper Rare': 'SAR',
  'Trainer Gallery Rare Holo': 'CHR',
  'Character Rare': 'CHR',
  // Append values from probe output here
};

function mapLanguage(idLanguage: number): string | null {
  return MKM_LANGUAGE_MAP[idLanguage] ?? null;
}

function mapRarity(rarity: string | undefined): string {
  if (!rarity) return 'OTHER';
  return MKM_RARITY_MAP[rarity] ?? 'OTHER';
}

/** Extract Pokémon name by stripping common suffixes (ex/V/VMAX/etc). */
function extractPokemonName(cardName: string): string {
  return cardName
    .replace(/[-\s]*(ex|EX|GX|V|VMAX|VSTAR|V-?UNION|BREAK|LEGEND)\s*$/i, '')
    .trim();
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/scrape-cardmarket.ts
git commit -m "Cardmarket scrape: add rarity + language mapping tables"
```

---

### Task 9: Full-crawl mode

**Files:**
- Modify: `scripts/scrape-cardmarket.ts` — replace the `full()` stub

The implementation depends on Task 7's probe output. Choose the variant matching what `localization` looked like:

**Variant A — `localization` is inline (preferred):**

- [ ] **Step 1A: Replace the `full()` stub**

```typescript
async function full() {
  const { getPokemonExpansions, getExpansionSingles, type MKMSingle } = await import(
    '../lib/api/cardmarket'
  );
  const { createServiceClient } = await import('../lib/supabase/service');

  const supabase = createServiceClient();
  console.log('Fetching expansions ...');
  const expansions = await getPokemonExpansions();
  console.log(`Got ${expansions.length} expansions. Starting crawl.\n`);

  let totalUpserts = 0;
  let totalErrors = 0;
  const unmappedRarities = new Set<string>();
  const unmappedLanguages = new Set<number>();

  for (let i = 0; i < expansions.length; i++) {
    const exp = expansions[i];
    const tag = `[${i + 1}/${expansions.length}] ${exp.abbreviation ?? '?'} (id=${exp.idExpansion})`;
    try {
      await sleep(RATE_LIMIT_MS);
      const singles = await getExpansionSingles(exp.idExpansion);

      const rows: Record<string, unknown>[] = [];
      for (const s of singles) {
        for (const loc of s.localization ?? []) {
          const lang = mapLanguage(loc.idLanguage);
          if (!lang) {
            unmappedLanguages.add(loc.idLanguage);
            continue;
          }
          if (s.rarity && !MKM_RARITY_MAP[s.rarity]) unmappedRarities.add(s.rarity);
          if (!s.number) continue; // can't index without localId
          rows.push({
            cardmarket_id: String(s.idProduct),
            set_code: exp.abbreviation ?? '',
            set_number: s.number,
            set_total: singles.length, // approx — printed total not exposed by MKM
            language: lang,
            card_name: loc.name,
            pokemon_name: extractPokemonName(loc.name),
            pokemon_number: null, // Cardmarket doesn't expose national dex
            set_name: exp.enName,
            rarity: mapRarity(s.rarity),
            image_url: s.image ?? null,
          });
        }
      }

      if (rows.length === 0) {
        console.log(`${tag} — 0 rows (skipped)`);
        continue;
      }

      // Upsert in batches of 100 to keep payloads small
      for (let j = 0; j < rows.length; j += 100) {
        const batch = rows.slice(j, j + 100);
        const { error } = await supabase
          .from('tcg_catalog')
          .upsert(batch, { onConflict: 'set_code,set_number,language' });
        if (error) {
          console.error(`${tag} batch ${j}-${j + batch.length} failed: ${error.message}`);
          totalErrors++;
        } else {
          totalUpserts += batch.length;
        }
      }
      console.log(`${tag} — upserted ${rows.length} rows (running total: ${totalUpserts})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${tag} FAILED: ${msg}`);
      totalErrors++;
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Done: ${totalUpserts} upserts, ${totalErrors} errors`);
  if (unmappedRarities.size > 0) {
    console.log(`Unmapped rarities (review and add to MKM_RARITY_MAP):`);
    for (const r of unmappedRarities) console.log(`  - "${r}"`);
  }
  if (unmappedLanguages.size > 0) {
    console.log(`Unmapped languages: ${[...unmappedLanguages].join(', ')}`);
  }
}
```

**Variant B — language requires separate calls:**

- [ ] **Step 1B: Replace the `full()` stub (used only if probe showed EN-only localization)**

Same as Variant A but for each expansion, loop over languages 1-9 and call `getExpansionSingles(exp.idExpansion, idLanguage)`. This requires updating `lib/api/cardmarket.ts` to accept an optional `idLanguage` query param. Skip this variant if Variant A worked.

- [ ] **Step 2: Run on a single expansion first (sanity check)**

To avoid blasting 200 calls on a broken implementation, temporarily edit the loop to `for (let i = 0; i < 1; i++)`. Run:

```bash
MODE=full npx tsx scripts/scrape-cardmarket.ts
```

Expected: 1 expansion processed, log shows "upserted N rows". Verify in Supabase Studio that rows appear in `tcg_catalog`.

- [ ] **Step 3: Verify the data quality on the single expansion**

Open Supabase Studio → SQL editor → run:

```sql
select language, count(*) from tcg_catalog group by language;
select rarity, count(*) from tcg_catalog group by rarity;
select set_code, set_name, count(*) from tcg_catalog group by set_code, set_name limit 10;
```

If anything looks wrong (all rows in OTHER rarity, no JP language, etc.), revisit MKM_RARITY_MAP / MKM_LANGUAGE_MAP and re-run.

- [ ] **Step 4: Restore full loop, commit script**

Remove the `i < 1` temp limit. Then commit:

```bash
git add scripts/scrape-cardmarket.ts
git commit -m "Cardmarket scrape: implement full-crawl mode with batched upserts"
```

---

### Task 10: Run full bootstrap

This task takes 5-15 minutes. Coffee break recommended.

- [ ] **Step 1: Truncate any partial data from probe runs**

Supabase Studio SQL editor:

```sql
truncate table tcg_catalog;
```

- [ ] **Step 2: Run full crawl**

```bash
source ~/.nvm/nvm.sh && nvm use 22
MODE=full npx tsx scripts/scrape-cardmarket.ts 2>&1 | tee /tmp/scrape.log
```

Expected: progress logs every expansion. Final summary: `Done: ~25000 upserts, 0 errors`.

If errors > ~5% of expansions, abort and investigate. The script is idempotent — re-running upserts.

- [ ] **Step 3: Verify final counts**

Supabase Studio SQL editor:

```sql
select count(*) as total from tcg_catalog;
select language, count(*) from tcg_catalog group by language order by 2 desc;
select rarity, count(*) from tcg_catalog group by rarity order by 2 desc;
-- spot-check user's failing test bench cards
select set_code, set_number, language, card_name from tcg_catalog
  where (set_code = 'BW5' and set_number = '009' and language = 'JP')
     or (set_code = 'SM8b' and set_number = '027' and language = 'JP')
     or (set_code = 'SV11W' and set_number = '012' and language = 'JP');
```

Expected: `total >= 20000`. Each spot-check row exists.

- [ ] **Step 4: If any spot-check is missing, investigate**

Possible causes:
- Cardmarket abbreviation differs from our convention (e.g. "BW5" vs "Cold Flare" vs "Black & White 5")
- Card number format differs (e.g. "9" vs "009")
- Language ID misassumption

Open `/tmp/scrape.log`, find the relevant expansion, examine. Fix mapping in `MKM_LANGUAGE_MAP` or normalize numbers in the upsert (e.g. zero-pad to 3 digits).

**Gate 2:** Do not proceed to Phase D until spot-check rows exist. The runtime will query for these exact strings.

- [ ] **Step 5: Commit any fixes from Step 4**

If you adjusted the script in Step 4:

```bash
git add scripts/scrape-cardmarket.ts
git commit -m "Cardmarket scrape: <describe the fix>"
```

---

## Phase D — Runtime Re-wire

### Task 11: tcg-catalog lookup module — write the failing tests

**Files:**
- Create: `lib/api/tcg-catalog.test.ts`

We test the pure transformation functions and lookup logic. Tests use mocked Supabase responses — actual DB integration is verified by the test bench in Phase E.

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/api/tcg-catalog.test.ts
import { describe, expect, it } from 'vitest';
import { rowToEnrichedCard, disambiguateByName, type CatalogRow } from './tcg-catalog';

const baseRow: CatalogRow = {
  id: '00000000-0000-0000-0000-000000000001',
  cardmarket_id: '12345',
  set_code: 'SV11W',
  set_number: '012',
  set_total: 86,
  language: 'JP',
  card_name: 'チャオブー',
  pokemon_name: 'チャオブー',
  pokemon_number: 499,
  set_name: 'Battle Partners',
  rarity: 'C',
  image_url: 'https://product-images.s3.cardmarket.com/12345.jpg',
  scraped_at: '2026-04-28T12:00:00Z',
};

describe('rowToEnrichedCard', () => {
  it('maps a catalog row into the EnrichedCard shape used by the form', () => {
    const enriched = rowToEnrichedCard(baseRow);
    expect(enriched).toEqual({
      card_id_tcg: 'SV11W-012',
      card_name: 'チャオブー',
      pokemon_name: 'チャオブー',
      pokemon_number: 499,
      set_name: 'Battle Partners',
      set_code: 'SV11W',
      set_number: '012/86',
      rarity: 'C',
      tcg_image_url: 'https://product-images.s3.cardmarket.com/12345.jpg',
      cardmarket_id: '12345',
      cm_price_low: null,
      cm_price_trend: null,
      cm_price_avg: null,
    });
  });

  it('omits set_total when null', () => {
    const enriched = rowToEnrichedCard({ ...baseRow, set_total: null });
    expect(enriched.set_number).toBe('012');
  });

  it('falls back to OTHER rarity when null', () => {
    const enriched = rowToEnrichedCard({ ...baseRow, rarity: null });
    expect(enriched.rarity).toBe('OTHER');
  });
});

describe('disambiguateByName', () => {
  const a: CatalogRow = { ...baseRow, set_code: 'M3', card_name: 'ビビヨン', pokemon_name: 'ビビヨン' };
  const b: CatalogRow = { ...baseRow, set_code: 'BW5', card_name: 'ホウオウEX', pokemon_name: 'ホウオウ' };
  const c: CatalogRow = { ...baseRow, set_code: 'SM8b', card_name: 'レントラー', pokemon_name: 'レントラー' };

  it('returns the single name match when OCR text contains exactly one card name', () => {
    const ocr = '... ホウオウEX HP 160 ...';
    const result = disambiguateByName([a, b, c], ocr);
    expect(result.best).toBe(b);
    expect(result.candidates).toEqual([b]);
  });

  it('returns the matching subset when OCR text matches multiple names', () => {
    const ocr = '... ビビヨン ... レントラー ...';
    const result = disambiguateByName([a, b, c], ocr);
    expect(result.candidates).toEqual([a, c]);
    expect(result.best).toBe(a);
  });

  it('returns all candidates when no name matches OCR text', () => {
    const ocr = '... ピカチュウ ...';
    const result = disambiguateByName([a, b, c], ocr);
    expect(result.candidates).toEqual([a, b, c]);
    expect(result.best).toBe(a);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
source ~/.nvm/nvm.sh && nvm use 22
npm test -- --run lib/api/tcg-catalog.test.ts
```

Expected: FAIL with "Cannot find module './tcg-catalog'"

- [ ] **Step 3: Commit failing tests**

```bash
git add lib/api/tcg-catalog.test.ts
git commit -m "tcg-catalog: add lookup + disambiguation tests (failing)"
```

---

### Task 12: tcg-catalog implementation

**Files:**
- Create: `lib/api/tcg-catalog.ts`

- [ ] **Step 1: Write the implementation**

```typescript
// lib/api/tcg-catalog.ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CardLanguage, EnrichedCard } from '@/lib/types';

/** Database row shape — matches the tcg_catalog table 1:1. */
export interface CatalogRow {
  id: string;
  cardmarket_id: string;
  set_code: string;
  set_number: string;
  set_total: number | null;
  language: CardLanguage;
  card_name: string;
  pokemon_name: string | null;
  pokemon_number: number | null;
  set_name: string;
  rarity: string | null;
  image_url: string | null;
  scraped_at: string;
}

/**
 * Map a catalog row into the EnrichedCard shape the scan form prefills from.
 * The card_id_tcg synthetic field is "{SET}-{NUMBER}" — keeps continuity
 * with the previous TCGdex-based ID format the rest of the codebase expects.
 */
export function rowToEnrichedCard(row: CatalogRow): EnrichedCard {
  const setNumber = row.set_total != null ? `${row.set_number}/${row.set_total}` : row.set_number;
  return {
    card_id_tcg: `${row.set_code}-${row.set_number}`,
    card_name: row.card_name,
    pokemon_name: row.pokemon_name ?? row.card_name,
    pokemon_number: row.pokemon_number,
    set_name: row.set_name,
    set_code: row.set_code,
    set_number: setNumber,
    rarity: (row.rarity as EnrichedCard['rarity']) ?? 'OTHER',
    tcg_image_url: row.image_url ?? '',
    cardmarket_id: row.cardmarket_id,
    cm_price_low: null,
    cm_price_trend: null,
    cm_price_avg: null,
  };
}

/**
 * Direct lookup by (set_code, set_number, language). The fast path —
 * hits the unique index, returns 0 or 1 rows.
 */
export async function lookupByCode(
  supabase: SupabaseClient,
  setCode: string,
  setNumber: string,
  language: CardLanguage,
): Promise<CatalogRow | null> {
  const { data, error } = await supabase
    .from('tcg_catalog')
    .select('*')
    .eq('set_code', setCode)
    .eq('set_number', setNumber)
    .eq('language', language)
    .maybeSingle();
  if (error) throw new Error(`tcg_catalog lookupByCode: ${error.message}`);
  return (data as CatalogRow | null) ?? null;
}

/**
 * Fallback lookup when set_code OCR was unreliable: find every row matching
 * the printed denominator + localId in the requested language. Same idea as
 * the TCGdex `findCardsByTotalAndLocalId` — handles JP cards where the
 * printed total doesn't match the official cardCount.
 */
export async function lookupByTotal(
  supabase: SupabaseClient,
  setTotal: number,
  setNumber: string,
  language: CardLanguage,
): Promise<CatalogRow[]> {
  const { data, error } = await supabase
    .from('tcg_catalog')
    .select('*')
    .eq('set_total', setTotal)
    .eq('set_number', setNumber)
    .eq('language', language);
  if (error) throw new Error(`tcg_catalog lookupByTotal: ${error.message}`);
  return (data as CatalogRow[] | null) ?? [];
}

/**
 * Narrow a candidate list using the OCR text (which contains the Pokémon
 * name). Same 3-way logic as the TCGdex disambiguator:
 *   - 1 name match → auto-select
 *   - >1 name matches → return only those (picker shows them)
 *   - 0 name matches → return all (picker shows everything)
 */
export function disambiguateByName(
  cards: CatalogRow[],
  ocrText: string,
): { best: CatalogRow; candidates: CatalogRow[] } {
  const matches = cards.filter((c) => ocrText.includes(c.card_name));
  if (matches.length === 1) return { best: matches[0], candidates: [matches[0]] };
  if (matches.length > 1) return { best: matches[0], candidates: matches };
  return { best: cards[0], candidates: cards };
}
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
source ~/.nvm/nvm.sh && nvm use 22
npm test -- --run lib/api/tcg-catalog.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 3: Run full test suite**

```bash
npm test -- --run
```

Expected: 80 tests passing (66 + 7 cardmarket + 7 catalog).

- [ ] **Step 4: Commit**

```bash
git add lib/api/tcg-catalog.ts
git commit -m "tcg-catalog: lookup + disambiguation helpers"
```

---

### Task 13: Rewire `app/api/enrich/route.ts`

**Files:**
- Modify: `app/api/enrich/route.ts` — replace TCGdex-first strategies with catalog-first

The route's external API (request body, response shape) is unchanged. Only the internal resolution order shifts. We keep TCGdex (Strategy 3) as a safety net for cards too new to be in the catalog.

- [ ] **Step 1: Replace the route file**

```typescript
// app/api/enrich/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  disambiguateByName,
  lookupByCode,
  lookupByTotal,
  rowToEnrichedCard,
  type CatalogRow,
} from '@/lib/api/tcg-catalog';
import {
  enrichWithFrenchNames,
  findCardsByTotalAndLocalId,
  listSets,
  lookupById as tcgdexLookupById,
  toEnrichedCard as tcgdexToEnrichedCard,
  toTCGdexLang,
} from '@/lib/api/tcgdex';
import { findKnownSetCodeInText } from '@/lib/utils/extract-from-words';
import { parseSetNumber } from '@/lib/utils/parse-set-number';
import type { CardLanguage, EnrichResult, EnrichedCard } from '@/lib/types';

export const runtime = 'nodejs';

interface EnrichBody {
  text?: string;
  setCode?: string;
  localId?: string;
  total?: string | number;
  language?: CardLanguage;
}

/**
 * Resolution strategy:
 *   1. tcg_catalog direct lookup (set_code + set_number + language)
 *   2. tcg_catalog fallback by printed total + localId, OCR-name disambiguation
 *   3. TCGdex live (filet de secours: cards too new to be in our catalog)
 *   4. Return null + extracted fields → user fills the form by hand
 */
export async function POST(request: Request) {
  let body: EnrichBody;
  try {
    body = (await request.json()) as EnrichBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { setCode, localId, total, language } = normalize(body);
  if (!localId && !body.text) {
    return NextResponse.json(
      { error: 'Provide either "text" or "localId" (with optional setCode/total).' },
      { status: 400 },
    );
  }

  const cardLang: CardLanguage = language ?? 'EN';
  const supabase = await createClient();

  try {
    // Strategy 1: catalog direct lookup
    if (setCode && localId) {
      const row = await lookupByCode(supabase, setCode, localId, cardLang);
      if (row) {
        return NextResponse.json({
          bestMatch: rowToEnrichedCard(row),
          candidates: [rowToEnrichedCard(row)],
        } satisfies EnrichResult);
      }
    }

    // Strategy 2: catalog fallback by total
    if (total != null && localId) {
      const rows = await lookupByTotal(supabase, total, localId, cardLang);
      if (rows.length > 0) {
        const result = body.text && rows.length > 1
          ? disambiguateByName(rows, body.text)
          : { best: rows[0], candidates: rows };
        return NextResponse.json({
          bestMatch: rowToEnrichedCard(result.best),
          candidates: result.candidates.map(rowToEnrichedCard),
        } satisfies EnrichResult);
      }
    }

    // Strategy 3: TCGdex live fallback (newest cards not yet scraped)
    const tcgdexLang = toTCGdexLang(cardLang);
    let tcgdexCard = null;
    if (body.text && localId) {
      const sets = await listSets(tcgdexLang);
      const fuzzyCode = findKnownSetCodeInText(body.text, sets.map((s) => s.id));
      if (fuzzyCode) tcgdexCard = await tcgdexLookupById(fuzzyCode, localId, tcgdexLang);
    }
    if (!tcgdexCard && setCode && localId) {
      tcgdexCard = await tcgdexLookupById(setCode, localId, tcgdexLang);
    }
    let tcgdexCandidates: typeof tcgdexCard[] = [];
    if (!tcgdexCard && total != null && localId) {
      tcgdexCandidates = await findCardsByTotalAndLocalId(total, localId, tcgdexLang);
      tcgdexCard = tcgdexCandidates[0] ?? null;
    }
    if (tcgdexCard) {
      const enriched = await enrichWithFrenchNames(tcgdexToEnrichedCard(tcgdexCard), tcgdexLang);
      const candidates: EnrichedCard[] =
        tcgdexCandidates.length > 1
          ? await Promise.all(
              tcgdexCandidates.map((c) =>
                enrichWithFrenchNames(tcgdexToEnrichedCard(c!), tcgdexLang),
              ),
            )
          : [enriched];
      return NextResponse.json({ bestMatch: enriched, candidates } satisfies EnrichResult);
    }

    // Strategy 4: nothing found
    return NextResponse.json({ bestMatch: null, candidates: [] } satisfies EnrichResult);
  } catch (error) {
    console.error('Enrich failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Enrich failed' },
      { status: 502 },
    );
  }
}

function normalize(body: EnrichBody): {
  setCode: string | null;
  localId: string | null;
  total: number | null;
  language: CardLanguage | undefined;
} {
  const setCode = body.setCode?.trim() || null;
  let localId: string | null = null;
  let total: number | null = null;

  if (body.localId) {
    const parts = String(body.localId).split('/');
    localId = parts[0]?.trim() || null;
    if (parts[1]) {
      const t = Number(parts[1].trim());
      if (Number.isFinite(t)) total = t;
    }
  }
  if (total === null && body.total != null) {
    const t = Number(String(body.total).trim());
    if (Number.isFinite(t)) total = t;
  }
  if (!localId && body.text) {
    const parsed = parseSetNumber(body.text);
    if (parsed) {
      localId = parsed.card;
      const t = Number(parsed.total);
      if (Number.isFinite(t)) total = t;
    }
  }

  return { setCode, localId, total, language: body.language };
}
```

- [ ] **Step 2: Verify lint and types**

```bash
source ~/.nvm/nvm.sh && nvm use 22
npm run lint && npx tsc --noEmit
```

Expected: no errors. If any, fix inline.

- [ ] **Step 3: Run test suite**

```bash
npm test -- --run
```

Expected: 80 tests passing. The existing TCGdex tests (`lib/api/tcgdex.test.ts`) still pass because the wrapper is untouched.

- [ ] **Step 4: Commit**

```bash
git add app/api/enrich/route.ts
git commit -m "Enrich: catalog-first lookup, TCGdex as Strategy 3 fallback"
```

---

### Task 14: Delete pokemontcg.io fallback

**Files:**
- Delete: `lib/api/tcgapi.ts`
- Delete: `lib/api/tcgapi.test.ts`

The route no longer imports `searchBySetNumber`. The catalog covers what tcgapi.io did, plus everything else.

- [ ] **Step 1: Confirm no imports of tcgapi remain**

```bash
grep -rn "from '@/lib/api/tcgapi'" --include='*.ts' --include='*.tsx' . 2>/dev/null
grep -rn "from './tcgapi'" --include='*.ts' --include='*.tsx' lib/api/ 2>/dev/null
```

Expected: no matches. If any remain, that file also needs updating.

- [ ] **Step 2: Delete the files**

```bash
git rm lib/api/tcgapi.ts lib/api/tcgapi.test.ts
```

- [ ] **Step 3: Verify tests + lint still pass**

```bash
source ~/.nvm/nvm.sh && nvm use 22
npm test -- --run && npm run lint
```

Expected: tests count drops by however many tcgapi tests existed (was ~5-10), lint clean.

- [ ] **Step 4: Commit**

```bash
git commit -m "Remove pokemontcg.io fallback (replaced by tcg_catalog)"
```

---

## Phase E — Validation

### Task 15: Re-run the test bench

The test bench script already exists at `scripts/test-bench.ts`. We don't modify it — the same script measures the new pipeline because it calls `/api/enrich` indirectly through the same code paths.

Wait — actually `test-bench.ts` calls TCGdex directly, not the enrich route. We need to either:
- Update test-bench to call the actual `/api/enrich` route (requires dev server running with auth bypass)
- Or update test-bench to use the new tcg-catalog helpers in-process

Option B is cleaner.

**Files:**
- Modify: `scripts/test-bench.ts` — replace `tryEnrich` to use catalog lookups + TCGdex fallback

- [ ] **Step 1: Update tryEnrich in scripts/test-bench.ts**

Find the `tryEnrich` function (currently calls TCGdex directly) and replace it:

```typescript
async function tryEnrich(
  ocr: OcrResult,
  lang: string = 'ja',
): Promise<{ best: EnrichHit | null; candidateCount: number; usedStrategy: string }> {
  const { createServiceClient } = await import('../lib/supabase/service');
  const { lookupByCode, lookupByTotal, disambiguateByName, rowToEnrichedCard } = await import(
    '../lib/api/tcg-catalog'
  );
  type CardLanguage = 'JP' | 'EN' | 'FR' | 'DE' | 'IT' | 'ES' | 'KO' | 'PT' | 'ZH';
  const supabase = createServiceClient();

  const setCode = ocr.setCodeCandidate;
  const localId = ocr.setNumberCandidate?.card ?? null;
  const total = ocr.setNumberCandidate?.total ? Number(ocr.setNumberCandidate.total) : null;
  const cardLang = lang === 'ja' ? 'JP' : lang.toUpperCase();

  // Strategy 1: catalog direct
  if (setCode && localId) {
    const row = await lookupByCode(supabase, setCode, localId, cardLang as CardLanguage);
    if (row) {
      const e = rowToEnrichedCard(row);
      return {
        best: { card_id_tcg: e.card_id_tcg, card_name: e.card_name, set_name: e.set_name,
                set_code: e.set_code, set_number: e.set_number, rarity: e.rarity },
        candidateCount: 1,
        usedStrategy: 'catalog:direct',
      };
    }
  }

  // Strategy 2: catalog by total
  if (total != null && localId) {
    const rows = await lookupByTotal(supabase, total, localId, cardLang as CardLanguage);
    if (rows.length > 0) {
      const result = ocr.text && rows.length > 1
        ? disambiguateByName(rows, ocr.text)
        : { best: rows[0], candidates: rows };
      const e = rowToEnrichedCard(result.best);
      return {
        best: { card_id_tcg: e.card_id_tcg, card_name: e.card_name, set_name: e.set_name,
                set_code: e.set_code, set_number: e.set_number, rarity: e.rarity },
        candidateCount: rows.length,
        usedStrategy: rows.length > 1 ? 'catalog:total+name' : 'catalog:total',
      };
    }
  }

  // Strategy 3: TCGdex live fallback (cards too new to be in catalog)
  if (localId && ocr.text) {
    const sets = await listSets(lang);
    const { findKnownSetCodeInText } = await import('../lib/utils/extract-from-words');
    const fuzzyCode = findKnownSetCodeInText(ocr.text, sets.map((s) => s.id));
    if (fuzzyCode) {
      const card = await tcgdexLookup(fuzzyCode, localId, lang);
      if (card) return { best: card, candidateCount: 1, usedStrategy: `tcgdex:fuzzy:${fuzzyCode}` };
    }
  }
  if (setCode && localId) {
    const card = await tcgdexLookup(setCode, localId, lang);
    if (card) return { best: card, candidateCount: 1, usedStrategy: 'tcgdex:direct' };
  }
  if (total != null && localId) {
    const cards = await findByTotal(total, localId, lang);
    if (cards.length > 0) {
      const nameMatches = cards.filter((c) => ocr.text.includes(c.card_name));
      if (nameMatches.length === 1)
        return { best: nameMatches[0], candidateCount: cards.length, usedStrategy: 'tcgdex:total+name1' };
      if (nameMatches.length > 1)
        return { best: nameMatches[0], candidateCount: nameMatches.length, usedStrategy: 'tcgdex:total+nameN' };
      return { best: cards[0], candidateCount: cards.length, usedStrategy: 'tcgdex:total-noname' };
    }
  }

  return { best: null, candidateCount: 0, usedStrategy: 'none' };
}
```

The strategy 3 branch reuses `tcgdexLookup` / `findByTotal` / `listSets` already defined further down in `test-bench.ts` (no new code needed for those — they were the existing implementation when the bench was first written).

- [ ] **Step 2: Run the test bench**

```bash
source ~/.nvm/nvm.sh && nvm use 22
npx tsx scripts/test-bench.ts 2>&1 | tee /tmp/bench-after.log
```

Expected: `Enriched correctly: ≥27/30` in the summary (target ≥90%, vs 33% baseline).

- [ ] **Step 3: Compare with baseline**

```bash
grep "Enriched correctly" /tmp/bench-after.log
```

Document the result. The previous baseline was `10/30 (33.3%)`.

- [ ] **Step 4: If below target, investigate the misses**

Check `results/test-bench.csv` for rows where `set_match=NO`. For each:
- Does the card exist in `tcg_catalog`? Run a SELECT to confirm.
- If not: Cardmarket may not have indexed it (rare) — accept and move on.
- If yes but lookup missed it: investigate what `setCode`/`localId` the bench passed vs. what's stored. Often a normalization issue (case, leading zeros).

If a fix is needed, edit either the catalog (Supabase update) or the lookup logic (code change), re-run.

- [ ] **Step 5: Commit bench updates**

```bash
git add scripts/test-bench.ts
git commit -m "Test bench: use tcg_catalog for enrichment measurements"
```

---

### Task 16: Update project docs

**Files:**
- Modify: `CLAUDE.md` — note the new architecture
- Modify: `docs/phase1-summary.md` — add catalog work to the Phase 1 wrap-up

- [ ] **Step 1: Update CLAUDE.md**

Find the "Pipeline d'enrichissement" section and replace it with:

```markdown
## Pipeline d'enrichissement

1. OCR (Vision) → texte + bounding boxes → extraction smart set_number + set_code
2. **Strategy 1 (catalog direct)** : SELECT FROM `tcg_catalog` WHERE set_code + set_number + language
3. **Strategy 2 (catalog fallback)** : SELECT par set_total + set_number, disambiguation par nom OCR
4. **Strategy 3 (TCGdex fallback)** : pour les cartes trop nouvelles pas encore scrapées
5. **Strategy 4** : null + champs extraits → user remplit à la main

Le catalogue local (~25K cartes) est peuplé via `scripts/scrape-cardmarket.ts`
qui crawle l'API Cardmarket (Personal App, OAuth 1.0a). Re-run après chaque
release de set Pokémon.
```

Also update the "Architecture clé" table to add:

```markdown
| Catalogue local | `lib/api/tcg-catalog.ts`, `app/api/enrich/route.ts` |
| Cardmarket OAuth | `lib/api/cardmarket.ts`, `scripts/scrape-cardmarket.ts` |
```

- [ ] **Step 2: Append to docs/phase1-summary.md**

Add a new section after "1.10 Tests":

```markdown
### 1.11 Catalogue local Pokémon TCG

Phase 1 a révélé un blocage à l'enrichissement OCR : TCGdex JP ne catalogue
pas les cartes anciennes (BW/XY/SM-era). Solution : table Supabase
`tcg_catalog` peuplée via Cardmarket OAuth.

- Migration `tcg_catalog` (cardmarket_id, set_code, set_number, language, ...)
- Wrapper OAuth 1.0a `lib/api/cardmarket.ts`
- Bootstrap `scripts/scrape-cardmarket.ts` — crawl ~200 expansions, ~25K cartes
- Lookup runtime via `lib/api/tcg-catalog.ts`, intégré à `app/api/enrich/route.ts`
- pokemontcg.io fallback supprimé (obsolète après catalogue local)
- Test bench : 10/30 → 27+/30 (33% → 90%+)
```

- [ ] **Step 3: Commit docs**

```bash
git add CLAUDE.md docs/phase1-summary.md
git commit -m "Docs: catalog work added to Phase 1 architecture notes"
```

---

### Task 17: Final verification

- [ ] **Step 1: Full check**

```bash
source ~/.nvm/nvm.sh && nvm use 22
npm test -- --run
npm run lint
npx tsc --noEmit
```

Expected: all green.

- [ ] **Step 2: Verify the scanner end-to-end (manual)**

```bash
npm run dev
```

Open http://localhost:3000, log in, scan one of the previously-failing cards (e.g. `cards_assets/bw5_009_r.jpg` upload). The form should pre-fill with correct set_code, set_number, card_name (in JP), pokemon_name. Image preview should load (Cardmarket CDN).

- [ ] **Step 3: Verify Pokédex grid still works**

Navigate to `/pokedex`. Verify cells render and the drawer opens with the previously-saved cards.

- [ ] **Step 4: Final commit (if any docs/CSV need updating)**

If anything got tweaked during manual testing, commit it.

```bash
git status
# if dirty:
git add -A
git commit -m "Phase 1.11 catalogue local: validation pass"
```

---

## Self-Review Notes (for plan author)

Done after writing — fix issues inline if found:

1. **Spec coverage:** All sections of the design doc map to a task — schema (Task 1), OAuth wrapper (Tasks 3-6), bootstrap (Tasks 7-10), runtime rewire (Tasks 11-14), validation (Tasks 15-17). ✅
2. **Placeholder scan:** No "TBD"/"TODO". Task 9 has Variant A/B which both contain full code, not placeholders. ✅
3. **Type consistency:** `CatalogRow` defined in Task 11 test, used identically in Task 12 implementation. `EnrichedCard` shape matches `lib/types/index.ts`. `MKMSingle` defined once in `cardmarket.ts`. ✅
4. **Ambiguity check:** Task 6 ("user creates Cardmarket app") has the discovery-and-adapt loop documented (try one app type, fall back if 403). Task 9 has explicit decision matrix for variants. ✅

---

## Total estimate

~10-12h dev work + ~30 min user setup (Cardmarket account + tokens). Critical-path gates at:
- **Gate 1** (after Task 6): OAuth must work
- **Gate 2** (after Task 10): catalog must contain spot-check rows
- **Gate 3** (after Task 15): bench must hit ≥27/30
