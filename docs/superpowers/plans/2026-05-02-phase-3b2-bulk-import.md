# Phase 3b2 — Bulk import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build cost-optimized bulk card import via two entry points (Python CLI for >15 cards using Gemini Batch API, web batch tab for ≤15 cards using sync OCR), plus shared optimizations (server-side status fallback, lower image resize default).

**Architecture:** Status fallback is added to existing `POST /api/cards` (transforms 409 conflict on for_sale unique index into auto-retry with status=collection + `fallback` flag in response). The existing `lib/utils/resize-image.ts` helper is already wired in CardScanForm — we lower its default and wire it into LotForm + the new web batch tab. The Python CLI is a 2-phase tool (mode 1 = OCR + CSV; mode 2 = commit with Y/N/A prompt on each fallback) using direct Gemini Batch API + Supabase REST auth.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Vitest, Tailwind v4, Lucide icons (web). Python 3.12 + Pillow + requests + pytest (script).

**Spec:** [docs/superpowers/specs/2026-05-02-phase-3b2-bulk-import-design.md](../specs/2026-05-02-phase-3b2-bulk-import-design.md)

---

## File Structure

**New files (web):**
- `components/submit/BatchForm.tsx` — orchestrator for the new "Batch" tab
- `components/submit/BatchReviewQueue.tsx` — review one card at a time with Préc/Suiv

**New files (Python script):**
- `scripts/add_cards.py` — CLI entry (~350 lines)
- `scripts/lib/__init__.py` — empty
- `scripts/lib/cache.py` — SHA256 hash + JSON cache (~60 lines)
- `scripts/lib/image_utils.py` — Pillow resize + pre-filter (~80 lines)
- `scripts/lib/csv_io.py` — read/write/update CSV in-place (~80 lines)
- `scripts/lib/gemini_batch.py` — Batch API wrapper (submit/poll/parse, ~150 lines)
- `scripts/lib/iris_client.py` — Supabase login + `/api/enrich` + `/api/cards` (~120 lines)
- `scripts/tests/__init__.py` — empty
- `scripts/tests/test_cache.py` — 4 tests
- `scripts/tests/test_image_utils.py` — 5 tests
- `scripts/tests/test_csv_io.py` — 3 tests
- `scripts/tests/test_gemini_batch.py` — 3 tests
- `scripts/requirements.txt` — Python deps
- `scripts/.env.example` — config template
- `scripts/.gitignore` — ignore `.env`, `.cache/`, `*.csv`
- `scripts/README.md` — minimal usage doc (the user explicitly noted "no autonomous Python prose" — keep it terse, just a usage example)

**Modified files:**
- `app/api/cards/route.ts` — status fallback logic (replace 409 with retry + `fallback` field)
- `app/api/cards/route.test.ts` — 2 new tests for fallback behavior
- `lib/utils/resize-image.ts` — lower default `maxDim` from 1600 to 1024
- `components/submit/LotForm.tsx` — wire `resizeImage` before pushing photos to FormData
- `components/submit/SubmitTabs.tsx` — replace "Script" tab with "Batch" tab rendering `<BatchForm>`
- `components/submit/CardScanForm.tsx` — show toast when `fallback: 'for_sale_to_collection'` in POST /api/cards response

---

## Task 1: Server-side status fallback in `/api/cards`

**Files:**
- Modify: `app/api/cards/route.ts`
- Modify: `app/api/cards/route.test.ts`

- [ ] **Step 1: Read the current POST handler to find the conflict catch**

```bash
sed -n '180,210p' app/api/cards/route.ts
```

You'll find a block around line 195-205 that catches `error.code === '23505'` and returns `409 { error: 'for_sale_conflict' }`. We're replacing the 409-return with an auto-retry.

- [ ] **Step 2: Write the failing tests**

Append to `app/api/cards/route.test.ts`. Find a place near the existing POST tests (search for `describe('POST /api/cards'` or similar — if no such describe exists, add one).

```typescript
describe('POST /api/cards — for_sale fallback to collection', () => {
  it('retries with status=collection when for_sale conflicts and returns fallback flag', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });

    // 1st insert (for_sale) → 23505 conflict
    // 2nd insert (collection) → success with returned row
    let insertCall = 0;
    const insertSingle = vi.fn().mockImplementation(async () => {
      insertCall += 1;
      if (insertCall === 1) {
        return { data: null, error: { code: '23505', message: 'one_for_sale_per_group' } };
      }
      return {
        data: { id: 'new-card-id', status: 'collection', card_name: 'Pikachu' },
        error: null,
      };
    });
    const insertSelect = vi.fn(() => ({ single: insertSingle }));
    const insert = vi.fn(() => ({ select: insertSelect }));
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'cards') return { insert };
      throw new Error(`unmocked table: ${table}`);
    });

    const fd = new FormData();
    fd.set('pokemon_name', 'Pikachu');
    fd.set('pokemon_number', '25');
    fd.set('card_name', 'Pikachu');
    fd.set('language', 'JP');
    fd.set('rarity', 'C');
    fd.set('condition', 'NM');
    fd.set('status', 'for_sale');

    const req = new Request('http://localhost/api/cards', { method: 'POST', body: fd });
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.card.status).toBe('collection');
    expect(json.fallback).toBe('for_sale_to_collection');
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry when status was not for_sale (collection conflict bubbles up as 500)', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });

    const insertSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'some_other_constraint' },
    });
    const insertSelect = vi.fn(() => ({ single: insertSingle }));
    const insert = vi.fn(() => ({ select: insertSelect }));
    supabaseMock.from.mockReturnValue({ insert });

    const fd = new FormData();
    fd.set('pokemon_name', 'Pikachu');
    fd.set('pokemon_number', '25');
    fd.set('card_name', 'Pikachu');
    fd.set('language', 'JP');
    fd.set('rarity', 'C');
    fd.set('condition', 'NM');
    fd.set('status', 'collection');

    const req = new Request('http://localhost/api/cards', { method: 'POST', body: fd });
    const res = await POST(req);
    expect(res.status).toBe(500);
    expect(insert).toHaveBeenCalledTimes(1);  // no retry
  });
});
```

The existing `supabaseMock` and `vi.mock('@/lib/supabase/server', ...)` from the test file are reused. If those don't exist (the test file is empty or shaped differently), look at `app/api/cards/[id]/route.test.ts` for the pattern and adapt.

- [ ] **Step 3: Run tests to verify they fail**

Run: `source ~/.nvm/nvm.sh && nvm use && npx vitest run app/api/cards/route.test.ts`
Expected: FAIL — fallback tests fail because the route returns 409 instead.

- [ ] **Step 4: Implement the fallback logic**

In `app/api/cards/route.ts`, find the catch block around line 195-205 that detects `error.code === '23505'` and returns 409. Replace the 409-return with an auto-retry when the requested status was `for_sale`.

Concretely, find the existing block (it looks roughly like):

```typescript
if (
  error.code === '23505' ||
  /one_for_sale_per_group|duplicate key|unique constraint/i.test(error.message ?? '')
) {
  return NextResponse.json(
    { error: 'for_sale_conflict', message: 'Un exemplaire de cette carte est déjà en vente sur Vinted.' },
    { status: 409 },
  );
}
```

Replace with:

```typescript
const isUniqueViolation =
  error.code === '23505' ||
  /one_for_sale_per_group|duplicate key|unique constraint/i.test(error.message ?? '');

if (isUniqueViolation && status === 'for_sale') {
  // Auto-fallback: retry as collection. The unique index only covers for_sale,
  // so this insert won't collide. We surface the fallback to the caller via
  // the `fallback` field so UIs can show a toast.
  const fallbackInsert = await supabase
    .from('cards')
    .insert({ ...row, status: 'collection' })
    .select('*')
    .single();
  if (fallbackInsert.error) {
    return NextResponse.json(
      { error: `fallback failed: ${fallbackInsert.error.message}` },
      { status: 500 },
    );
  }
  return NextResponse.json({
    card: fallbackInsert.data,
    fallback: 'for_sale_to_collection',
    reason: 'Une carte identique est déjà en vente, ajoutée à ton Stock',
  });
}

if (isUniqueViolation) {
  // Conflict on a constraint we can't auto-resolve (e.g., the user explicitly
  // requested status='collection' and somehow conflicted, or pokedex slot taken).
  return NextResponse.json(
    { error: 'for_sale_conflict', message: 'Conflit de contrainte unique non résolvable.' },
    { status: 409 },
  );
}
```

Note: `row` here is the object passed to the original `insert(row)`. Look at the existing code to find what variable holds it (might be called `cardData`, `payload`, `row`, etc.). Use the same variable, just override `status` to `'collection'` for the fallback.

- [ ] **Step 5: Run tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && nvm use && npx vitest run app/api/cards/route.test.ts`
Expected: PASS — all existing tests + 2 new fallback tests.

If a previously-passing test now breaks (a test that expected the 409 conflict response), update that test to reflect the new behavior: it should now expect a 200 with `fallback` flag.

- [ ] **Step 6: Commit**

```bash
git add app/api/cards/route.ts app/api/cards/route.test.ts
git commit -m "Phase 3b2: status fallback for_sale → collection auto on unique conflict"
```

---

## Task 2: Lower resize default + wire into LotForm

**Files:**
- Modify: `lib/utils/resize-image.ts`
- Modify: `components/submit/LotForm.tsx`

- [ ] **Step 1: Lower the default in resize-image.ts**

Open `lib/utils/resize-image.ts`. Find the line:

```typescript
const { maxDim = 1600, quality = 0.85 } = options;
```

Change to:

```typescript
const { maxDim = 1024, quality = 0.85 } = options;
```

This affects EVERY caller that doesn't override `maxDim`. The CardScanForm calls `resizeImage(file)` with no options, so it'll automatically pick up the new default. Same for any future caller.

- [ ] **Step 2: Wire resize into LotForm**

Open `components/submit/LotForm.tsx`. Find the `addPhotos` function. Update it to call `resizeImage` on each new file before adding to state.

Replace:

```typescript
function addPhotos(files: FileList | File[]) {
  const arr = Array.from(files).filter((f) => f.type.startsWith('image/'));
  setPhotos((prev) => [...prev, ...arr]);
}
```

With:

```typescript
async function addPhotos(files: FileList | File[]) {
  const arr = Array.from(files).filter((f) => f.type.startsWith('image/'));
  // Resize each photo client-side before storing in state. Reduces upload
  // payload (Vercel proxy limit ~25MB now, but smaller is faster regardless).
  const resized = await Promise.all(
    arr.map(async (f) => {
      try {
        const blob = await resizeImage(f);
        return new File([blob], f.name, { type: 'image/jpeg' });
      } catch {
        // If resize fails (e.g. corrupt image), keep the original — server will reject if needed
        return f;
      }
    }),
  );
  setPhotos((prev) => [...prev, ...resized]);
}
```

Add the import at the top of `LotForm.tsx` (search for the existing imports near line 1-10):

```typescript
import { resizeImage } from '@/lib/utils/resize-image';
```

Update the dropzone's `onDrop` handler — `onDrop={(e) => { ...; if (e.dataTransfer.files.length) onAdd(e.dataTransfer.files); }}` — and the file input `onChange` to await the now-async `addPhotos`. Wrap them in IIFEs:

```tsx
onDrop={(e) => {
  e.preventDefault();
  setDragging(false);
  if (e.dataTransfer.files.length) void onAdd(e.dataTransfer.files);
}}
```

```tsx
onChange={(e) => { if (e.target.files) void onAdd(e.target.files); }}
```

(The `void` keyword tells TS we intentionally don't await the Promise here — the photos appear in state when ready.)

- [ ] **Step 3: Verify type-check + tests + lint**

```bash
source ~/.nvm/nvm.sh && nvm use && npx tsc --noEmit 2>&1 | tail -5
source ~/.nvm/nvm.sh && nvm use && npm test 2>&1 | tail -8
source ~/.nvm/nvm.sh && nvm use && npm run lint 2>&1 | tail -5
```

Expected: 0 ts errors, all existing tests pass (242 tests after Task 1's +2), 0 lint warnings.

- [ ] **Step 4: Commit**

```bash
git add lib/utils/resize-image.ts components/submit/LotForm.tsx
git commit -m "Phase 3b2: lower resize default to 1024px + wire into LotForm photo upload"
```

---

## Task 3: Web scanner toast on fallback

**Files:**
- Modify: `components/submit/CardScanForm.tsx`

- [ ] **Step 1: Read the current save logic**

Run: `grep -n "fetch.*api/cards\|fallback\|toast\|save" components/submit/CardScanForm.tsx | head -20`

Identify where the form POSTs to `/api/cards` and parses the response.

- [ ] **Step 2: Surface the fallback in the UI**

The CardScanForm probably has a save handler (look for `handleSave` or `submit` or similar). After parsing the response, check for `fallback`:

```typescript
const json = await saveRes.json();
if (!saveRes.ok) throw new Error(json.error ?? 'Save failed');

// If the server auto-fallbacked from for_sale to collection, surface it.
if (json.fallback === 'for_sale_to_collection') {
  // Show a toast. The codebase doesn't have a global toast lib; the simplest
  // path is to use the existing inline message slot. Look for `setSuccessMsg`
  // or `setStatus` or whatever the form uses to display a success indicator.
  // If no such state exists, add one and render it as a small banner above
  // the form fields with class `text-rarity-ar text-xs` and the reason text.
}
```

If the form doesn't already have a success/info display, add a small state + render block:

```tsx
const [infoMsg, setInfoMsg] = useState<string | null>(null);
// ...after save response:
if (json.fallback === 'for_sale_to_collection') {
  setInfoMsg(json.reason ?? 'Carte ajoutée à ton Stock (déjà en vente)');
}
// In the JSX, add somewhere near the top of the form:
{infoMsg && (
  <p className="bg-rarity-ar/20 text-rarity-ar rounded px-3 py-2 text-sm">
    {infoMsg}
  </p>
)}
```

The message stays until the next save attempt clears it.

If there's an existing toast/notification pattern (like `RestockToast` from Phase 2), reuse it instead of inventing a new one.

- [ ] **Step 3: Verify type-check + tests**

```bash
source ~/.nvm/nvm.sh && nvm use && npx tsc --noEmit 2>&1 | tail -5
source ~/.nvm/nvm.sh && nvm use && npm test 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add components/submit/CardScanForm.tsx
git commit -m "Phase 3b2: web scanner shows toast when fallback for_sale → collection"
```

---

## Task 4: Python script scaffold

**Files:**
- Create: `scripts/requirements.txt`
- Create: `scripts/.env.example`
- Create: `scripts/.gitignore`
- Create: `scripts/README.md`
- Create: `scripts/lib/__init__.py`
- Create: `scripts/tests/__init__.py`

- [ ] **Step 1: Create requirements.txt**

```
google-generativeai>=0.8.0
requests>=2.31.0
Pillow>=10.0.0
tabulate>=0.9.0
python-dotenv>=1.0.0
pytest>=8.0.0
```

- [ ] **Step 2: Create .env.example**

```
# Gemini Batch API
GEMINI_API_KEY=

# IRIS app endpoints (script POSTs to /api/enrich and /api/cards)
POKEMANAGER_API_URL=http://localhost:3000

# Supabase auth — script logs in as the mono-user via REST API
POKEMANAGER_EMAIL=
POKEMANAGER_PASSWORD=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

- [ ] **Step 3: Create .gitignore**

```
.env
.cache/
add_cards_results*.csv
__pycache__/
*.pyc
.pytest_cache/
```

- [ ] **Step 4: Create README.md**

```markdown
# IRIS bulk import script

Python CLI to OCR and import a folder of card photos in bulk via Gemini Batch API.

## Setup

```bash
cd scripts/
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your credentials
```

## Usage

Mode 1 (OCR + write CSV):

```bash
python add_cards.py /path/to/photos/
```

Mode 2 (commit after CSV review):

```bash
python add_cards.py /path/to/photos/ --commit add_cards_results.csv
```

## Tests

```bash
pytest tests/
```
```

- [ ] **Step 5: Create empty `__init__.py` files**

```bash
mkdir -p scripts/lib scripts/tests
touch scripts/lib/__init__.py scripts/tests/__init__.py
```

- [ ] **Step 6: Commit**

```bash
git add scripts/
git commit -m "Phase 3b2: Python script scaffold (requirements, env, gitignore, README)"
```

---

## Task 5: `scripts/lib/cache.py` (SHA256 + JSON cache)

**Files:**
- Create: `scripts/lib/cache.py`
- Create: `scripts/tests/test_cache.py`

- [ ] **Step 1: Write the failing tests**

```python
# scripts/tests/test_cache.py
import json
import tempfile
from pathlib import Path

import pytest

from scripts.lib.cache import compute_sha256, load_cache, save_cache, get_cached, set_cached


def test_compute_sha256_stable_for_same_content(tmp_path):
    p1 = tmp_path / "a.bin"
    p2 = tmp_path / "b.bin"
    p1.write_bytes(b"hello world")
    p2.write_bytes(b"hello world")
    assert compute_sha256(p1) == compute_sha256(p2)


def test_compute_sha256_differs_for_different_content(tmp_path):
    p1 = tmp_path / "a.bin"
    p2 = tmp_path / "b.bin"
    p1.write_bytes(b"hello world")
    p2.write_bytes(b"hello there")
    assert compute_sha256(p1) != compute_sha256(p2)


def test_load_cache_returns_empty_dict_when_file_missing(tmp_path):
    cache_path = tmp_path / "missing.json"
    assert load_cache(cache_path) == {}


def test_set_then_get_roundtrip(tmp_path):
    cache_path = tmp_path / "c.json"
    cache = load_cache(cache_path)
    set_cached(cache, "abc123", {"card_name": "Pikachu", "set_code": "sv2a"})
    save_cache(cache_path, cache)
    reloaded = load_cache(cache_path)
    assert get_cached(reloaded, "abc123")["card_name"] == "Pikachu"
    assert get_cached(reloaded, "missing") is None
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/fhuang5/Developer/I.R.I.S
source scripts/.venv/bin/activate 2>/dev/null || python -m venv scripts/.venv && source scripts/.venv/bin/activate
pip install -q -r scripts/requirements.txt
PYTHONPATH=. pytest scripts/tests/test_cache.py -v
```

Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```python
# scripts/lib/cache.py
"""SHA256-based OCR result cache.

Stored as a flat JSON dict: { sha256_hex: { ocr: {...}, scanned_at: iso, filename: str } }.
"""

import hashlib
import json
from pathlib import Path
from typing import Any


def compute_sha256(path: Path) -> str:
    """Stream-hash a file in 64KB chunks to avoid loading the whole image in memory."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def load_cache(path: Path) -> dict[str, Any]:
    """Load the cache JSON, or return an empty dict if the file does not exist."""
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def save_cache(path: Path, cache: dict[str, Any]) -> None:
    """Write the cache atomically (write to temp + rename)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(cache, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


def get_cached(cache: dict[str, Any], sha: str) -> dict[str, Any] | None:
    """Return the cached entry for `sha`, or None if not cached."""
    return cache.get(sha)


def set_cached(cache: dict[str, Any], sha: str, entry: dict[str, Any]) -> None:
    """In-place update of the cache. Caller is responsible for save_cache later."""
    cache[sha] = entry
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
PYTHONPATH=. pytest scripts/tests/test_cache.py -v
```

Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/cache.py scripts/tests/test_cache.py
git commit -m "Phase 3b2: scripts/lib/cache.py — SHA256 + JSON cache (4 tests)"
```

---

## Task 6: `scripts/lib/image_utils.py` (Pillow resize + pre-filter)

**Files:**
- Create: `scripts/lib/image_utils.py`
- Create: `scripts/tests/test_image_utils.py`

- [ ] **Step 1: Write the failing tests**

```python
# scripts/tests/test_image_utils.py
import io
from pathlib import Path

import pytest
from PIL import Image

from scripts.lib.image_utils import should_skip_prefilter, resize_for_gemini, MIN_FILE_SIZE_BYTES


def make_image(tmp_path: Path, name: str, size: tuple[int, int], color: str = "red", fmt: str = "JPEG") -> Path:
    p = tmp_path / name
    img = Image.new("RGB", size, color)
    img.save(p, format=fmt, quality=85)
    return p


def test_prefilter_skips_files_below_min_size(tmp_path):
    p = tmp_path / "tiny.jpg"
    p.write_bytes(b"\xff\xd8\xff\xd9")  # 4-byte JPEG marker, way under min
    skip, reason = should_skip_prefilter(p)
    assert skip is True
    assert "size" in reason.lower()


def test_prefilter_skips_aberrant_aspect_ratio(tmp_path):
    # 4000x100 = aspect ratio 40, way out of card range
    p = make_image(tmp_path, "wide.jpg", (4000, 100))
    # Pad the file size to be over MIN_FILE_SIZE_BYTES so the size check passes
    if p.stat().st_size < MIN_FILE_SIZE_BYTES:
        p.write_bytes(p.read_bytes() + b"\x00" * (MIN_FILE_SIZE_BYTES + 100))
    skip, reason = should_skip_prefilter(p)
    assert skip is True
    assert "aspect" in reason.lower()


def test_prefilter_skips_non_image_extension(tmp_path):
    p = tmp_path / "doc.txt"
    p.write_bytes(b"not an image" * 5000)
    skip, reason = should_skip_prefilter(p)
    assert skip is True


def test_prefilter_passes_valid_card_photo(tmp_path):
    # ~card-shaped: 1500x2100 portrait
    p = make_image(tmp_path, "card.jpg", (1500, 2100))
    skip, reason = should_skip_prefilter(p)
    assert skip is False
    assert reason == ""


def test_resize_caps_largest_dimension_to_1024(tmp_path):
    # Source is 4000x3000 (16MP)
    p = make_image(tmp_path, "big.jpg", (4000, 3000))
    out_bytes = resize_for_gemini(p)
    img = Image.open(io.BytesIO(out_bytes))
    assert max(img.size) <= 1024
    # Aspect ratio preserved (within 1px rounding)
    assert abs((img.size[0] / img.size[1]) - (4000 / 3000)) < 0.01
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
PYTHONPATH=. pytest scripts/tests/test_image_utils.py -v
```

Expected: FAIL.

- [ ] **Step 3: Write the implementation**

```python
# scripts/lib/image_utils.py
"""Local pre-filter and Pillow resize for Gemini OCR cost optimization."""

import io
from pathlib import Path

from PIL import Image

# Files smaller than this are almost certainly thumbnails or corrupt
MIN_FILE_SIZE_BYTES = 50 * 1024  # 50 KB

# Pokémon cards are ~63x88mm = aspect ratio 0.72 (portrait) or 1.39 (landscape).
# Allow [0.4, 2.5] to accept slight variations and rotated photos.
MIN_ASPECT_RATIO = 0.4
MAX_ASPECT_RATIO = 2.5

# Allowed extensions
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

# Gemini OCR works fine on 1024×1024 max — this is the sweet spot for cost.
GEMINI_MAX_DIM = 1024
GEMINI_QUALITY = 85


def should_skip_prefilter(path: Path) -> tuple[bool, str]:
    """Return (skip, reason) — skip if file is obviously not a card photo."""
    if path.suffix.lower() not in IMAGE_EXTENSIONS:
        return True, f"unsupported extension {path.suffix}"

    size = path.stat().st_size
    if size < MIN_FILE_SIZE_BYTES:
        return True, f"file size {size}B too small (min {MIN_FILE_SIZE_BYTES}B)"

    try:
        with Image.open(path) as img:
            w, h = img.size
            if w == 0 or h == 0:
                return True, "zero dimension"
            ratio = w / h
            if ratio < MIN_ASPECT_RATIO or ratio > MAX_ASPECT_RATIO:
                return True, f"aspect ratio {ratio:.2f} out of card range [{MIN_ASPECT_RATIO}, {MAX_ASPECT_RATIO}]"
    except Exception as e:
        return True, f"PIL open failed: {e}"

    return False, ""


def resize_for_gemini(path: Path) -> bytes:
    """Open, resize to GEMINI_MAX_DIM max dim (preserving aspect ratio), encode JPEG.

    Returns the resulting JPEG bytes (in-memory, no temp file).
    """
    with Image.open(path) as img:
        # Convert to RGB if needed (PNG with alpha, etc.)
        if img.mode != "RGB":
            img = img.convert("RGB")
        img.thumbnail((GEMINI_MAX_DIM, GEMINI_MAX_DIM), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=GEMINI_QUALITY)
        return buf.getvalue()
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
PYTHONPATH=. pytest scripts/tests/test_image_utils.py -v
```

Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/image_utils.py scripts/tests/test_image_utils.py
git commit -m "Phase 3b2: scripts/lib/image_utils.py — Pillow resize + pre-filter (5 tests)"
```

---

## Task 7: `scripts/lib/csv_io.py` (CSV read/write/update)

**Files:**
- Create: `scripts/lib/csv_io.py`
- Create: `scripts/tests/test_csv_io.py`

- [ ] **Step 1: Write the failing tests**

```python
# scripts/tests/test_csv_io.py
import csv
from pathlib import Path

import pytest

from scripts.lib.csv_io import CSV_COLUMNS, write_results, read_for_commit, update_row_in_place


def test_write_results_creates_csv_with_all_columns(tmp_path):
    p = tmp_path / "out.csv"
    rows = [
        {
            "filename": "a.jpg", "count": 1, "requested_status": "for_sale",
            "card_name": "Pikachu", "set_code": "sv2a", "set_number": "25",
            "language": "JP", "condition": "NM", "variant": "",
            "confidence": "high", "ocr_error": "",
            "final_status": "", "final_ids": "", "error": "",
        },
    ]
    write_results(p, rows)
    with open(p, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        assert reader.fieldnames == CSV_COLUMNS
        first = next(reader)
        assert first["filename"] == "a.jpg"
        assert first["count"] == "1"


def test_read_for_commit_skips_status_skip(tmp_path):
    p = tmp_path / "in.csv"
    rows = [
        {**{c: "" for c in CSV_COLUMNS}, "filename": "a.jpg", "count": "1", "requested_status": "for_sale"},
        {**{c: "" for c in CSV_COLUMNS}, "filename": "b.jpg", "count": "1", "requested_status": "SKIP"},
        {**{c: "" for c in CSV_COLUMNS}, "filename": "c.jpg", "count": "2", "requested_status": "collection"},
    ]
    write_results(p, rows)
    commit_rows = read_for_commit(p)
    assert len(commit_rows) == 2
    assert commit_rows[0]["filename"] == "a.jpg"
    assert commit_rows[1]["filename"] == "c.jpg"


def test_update_row_in_place_writes_final_status(tmp_path):
    p = tmp_path / "in.csv"
    rows = [
        {**{c: "" for c in CSV_COLUMNS}, "filename": "a.jpg", "count": "1", "requested_status": "for_sale"},
        {**{c: "" for c in CSV_COLUMNS}, "filename": "b.jpg", "count": "1", "requested_status": "for_sale"},
    ]
    write_results(p, rows)
    update_row_in_place(p, filename="a.jpg", final_status="collection", final_ids="uuid-1", error="")
    # Re-read to verify
    with open(p, encoding="utf-8") as f:
        reader = list(csv.DictReader(f))
    a_row = next(r for r in reader if r["filename"] == "a.jpg")
    assert a_row["final_status"] == "collection"
    assert a_row["final_ids"] == "uuid-1"
    b_row = next(r for r in reader if r["filename"] == "b.jpg")
    assert b_row["final_status"] == ""  # untouched
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
PYTHONPATH=. pytest scripts/tests/test_csv_io.py -v
```

Expected: FAIL.

- [ ] **Step 3: Write the implementation**

```python
# scripts/lib/csv_io.py
"""CSV read / write / in-place update for the OCR results file.

Mode 1 writes a fresh CSV. Mode 2 reads it (skipping status=SKIP rows),
then updates rows in-place with the commit outcome (final_status, final_ids,
error) so the user can re-run mode 2 and resume from a partial state.
"""

import csv
from pathlib import Path
from typing import Any

CSV_COLUMNS = [
    "filename",
    "count",
    "requested_status",
    "card_name",
    "set_code",
    "set_number",
    "language",
    "condition",
    "variant",
    "confidence",
    "ocr_error",
    "final_status",
    "final_ids",
    "error",
]


def write_results(path: Path, rows: list[dict[str, Any]]) -> None:
    """Write the result CSV. Each row is a dict with the keys in CSV_COLUMNS;
    missing keys default to empty string."""
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            normalized = {c: str(row.get(c, "") or "") for c in CSV_COLUMNS}
            writer.writerow(normalized)


def read_for_commit(path: Path) -> list[dict[str, str]]:
    """Read the CSV and return rows EXCLUDING those marked SKIP. Used by mode 2."""
    rows: list[dict[str, str]] = []
    with open(path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if (row.get("requested_status") or "").strip().upper() == "SKIP":
                continue
            rows.append(row)
    return rows


def update_row_in_place(
    path: Path,
    filename: str,
    final_status: str = "",
    final_ids: str = "",
    error: str = "",
) -> None:
    """Read the CSV, update the row matching `filename`, write back. O(N) per call
    but our N is small (< 1000) and the user runs commit once."""
    with open(path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    for row in rows:
        if row.get("filename") == filename:
            row["final_status"] = final_status
            row["final_ids"] = final_ids
            row["error"] = error
            break
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
PYTHONPATH=. pytest scripts/tests/test_csv_io.py -v
```

Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/csv_io.py scripts/tests/test_csv_io.py
git commit -m "Phase 3b2: scripts/lib/csv_io.py — CSV read/write/update (3 tests)"
```

---

## Task 8: `scripts/lib/gemini_batch.py` (Batch API wrapper)

**Files:**
- Create: `scripts/lib/gemini_batch.py`
- Create: `scripts/tests/test_gemini_batch.py`

- [ ] **Step 1: Write the failing tests**

```python
# scripts/tests/test_gemini_batch.py
from unittest.mock import patch, Mock

import pytest

from scripts.lib.gemini_batch import build_request_payload, parse_batch_response, BatchOcrResult


def test_build_request_payload_wraps_image_with_prompt():
    image_bytes = b"\xff\xd8\xff" + b"\x00" * 100
    payload = build_request_payload(image_bytes, request_id="req-001")
    assert payload["request_id"] == "req-001"
    parts = payload["request"]["contents"][0]["parts"]
    assert any("Pokémon" in p.get("text", "") for p in parts)  # prompt present
    assert any("inline_data" in p for p in parts)  # image present


def test_parse_batch_response_extracts_card_data():
    raw = {
        "responses": [
            {
                "request_id": "req-001",
                "response": {
                    "candidates": [{
                        "content": {
                            "parts": [{
                                "text": '{"card_name":"Pikachu ex","set_code":"sv2a","set_number":"25","language":"JP","confidence":"high"}'
                            }]
                        }
                    }]
                }
            },
            {
                "request_id": "req-002",
                "response": {"error": {"message": "rate limited"}}
            },
        ]
    }
    results = parse_batch_response(raw)
    assert len(results) == 2
    assert results[0].request_id == "req-001"
    assert results[0].ocr is not None
    assert results[0].ocr["card_name"] == "Pikachu ex"
    assert results[0].error is None
    assert results[1].request_id == "req-002"
    assert results[1].ocr is None
    assert "rate limited" in (results[1].error or "")


def test_parse_batch_response_handles_malformed_json_in_text():
    raw = {
        "responses": [
            {
                "request_id": "req-001",
                "response": {
                    "candidates": [{
                        "content": {
                            "parts": [{"text": "not valid json"}]
                        }
                    }]
                }
            },
        ]
    }
    results = parse_batch_response(raw)
    assert len(results) == 1
    assert results[0].ocr is None
    assert results[0].error is not None
    assert "json" in results[0].error.lower()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
PYTHONPATH=. pytest scripts/tests/test_gemini_batch.py -v
```

Expected: FAIL.

- [ ] **Step 3: Write the implementation**

```python
# scripts/lib/gemini_batch.py
"""Wrapper for Gemini Batch API (asynchronous, ~50% cheaper than sync).

Flow:
  1. Build a payload with N request entries (one per card image)
  2. Submit via POST :batchGenerateContent → returns operation name
  3. Poll GET /operations/{name} every 30s until done
  4. Parse the response into BatchOcrResult dataclasses
"""

import base64
import json
import time
from dataclasses import dataclass
from typing import Any

import requests

GEMINI_MODEL = "gemini-3-flash-preview"
GEMINI_BASE = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}"
POLL_INTERVAL_SEC = 30
POLL_TIMEOUT_SEC = 60 * 60  # 1 hour

# Same prompt as lib/api/gemini-vision.ts — kept in sync manually since the
# script is decoupled from the Next.js app.
PROMPT = """Tu regardes la photo d'une carte Pokémon JCC. Extrais les informations imprimées sur la carte.

EN BAS DE LA CARTE (sous le texte d'attaque/description), une ligne en petit contient typiquement :
1. Nom de l'illustrateur (ex: "Illus. Tecziro")
2. Numéro de carte au format XXX/YYY (ex: "012/086", "111/172")
3. Code d'extension court (ex: "SV11W", "BW5", "sm8b", "XY8b") — minuscules/majuscules sensibles, lis exactement comme imprimé

EN HAUT DE LA CARTE : nom du Pokémon (en JP/EN/FR/etc selon la langue de la carte).

Retourne le JSON suivant. NE DEVINE PAS, lis ce qui est imprimé. Si tu ne peux pas lire un champ, mets null sauf pour les requis.

{
  "card_name": "<nom complet imprimé en haut, ex: 'チャオブー', 'Pikachu ex'>",
  "pokemon_name": "<nom Pokémon sans suffixe ex/V/VMAX, ex: 'チャオブー', 'Pikachu'>",
  "set_code": "<code extension exact, ex: 'SV11W', 'BW5n'>",
  "set_number": "<XXX du XXX/YYY, sans zéros initiaux: '12' pas '012'>",
  "set_total": <YYY integer ou null>,
  "language": "<JP|EN|FR|DE|IT|ES|PT|KO|ZH selon la langue imprimée>",
  "rarity": "<Common|Uncommon|Rare|Holo Rare|Double Rare|Ultra Rare|Art Rare|Special Art Rare|Secret Rare|Hyper Rare|Promo|Other ou null>",
  "confidence": "high|medium|low",
  "pokemon_number": <numéro national du Pokédex (1-1025) si c'est une carte Pokémon, null pour Trainers/Energies/Stadium/etc>,
  "pokemon_name_fr": "<nom français standard du Pokémon (ex: 'Gruikui' pour チャオブー / Tepig), null si non-Pokémon ou si tu n'es pas sûr du nom français>",
  "set_name": "<nom de l'extension tel qu'imprimé en bas de la carte si visible (ex: 'ホワイトフレア', 'White Flare', 'Battle Partners'), null si non visible>",
  "set_name_fr": "<nom français de cette extension (ex: 'Combat de Maîtres'), null si tu n'es pas sûr>"
}"""


@dataclass
class BatchOcrResult:
    request_id: str
    ocr: dict[str, Any] | None
    error: str | None


def build_request_payload(image_bytes: bytes, request_id: str) -> dict[str, Any]:
    """Build a single request entry for the batch payload."""
    return {
        "request_id": request_id,
        "request": {
            "contents": [
                {
                    "parts": [
                        {"text": PROMPT},
                        {
                            "inline_data": {
                                "mime_type": "image/jpeg",
                                "data": base64.b64encode(image_bytes).decode("ascii"),
                            }
                        },
                    ],
                }
            ],
            "generationConfig": {
                "temperature": 0,
                "responseMimeType": "application/json",
            },
        },
    }


def submit_batch(api_key: str, requests_payload: list[dict[str, Any]]) -> str:
    """POST the batch payload and return the operation name (e.g. 'operations/abc123')."""
    url = f"{GEMINI_BASE}:batchGenerateContent?key={api_key}"
    res = requests.post(url, json={"requests": requests_payload}, timeout=60)
    res.raise_for_status()
    body = res.json()
    op_name = body.get("name")
    if not op_name:
        raise RuntimeError(f"Batch submit did not return operation name: {body}")
    return op_name


def poll_until_done(api_key: str, operation_name: str) -> dict[str, Any]:
    """Poll the operation every POLL_INTERVAL_SEC until done. Returns the final response payload."""
    url = f"https://generativelanguage.googleapis.com/v1beta/{operation_name}?key={api_key}"
    deadline = time.time() + POLL_TIMEOUT_SEC
    while time.time() < deadline:
        res = requests.get(url, timeout=30)
        res.raise_for_status()
        body = res.json()
        if body.get("done"):
            return body.get("response", {})
        time.sleep(POLL_INTERVAL_SEC)
    raise TimeoutError(f"Batch operation {operation_name} did not complete within {POLL_TIMEOUT_SEC}s")


def parse_batch_response(raw: dict[str, Any]) -> list[BatchOcrResult]:
    """Convert the batch response into a list of BatchOcrResult."""
    results: list[BatchOcrResult] = []
    for entry in raw.get("responses", []):
        rid = entry.get("request_id", "")
        response = entry.get("response", {})
        if "error" in response:
            results.append(BatchOcrResult(request_id=rid, ocr=None, error=str(response["error"].get("message") or response["error"])))
            continue
        try:
            parts = response.get("candidates", [{}])[0].get("content", {}).get("parts", [])
            text = next((p.get("text") for p in parts if "text" in p), None)
            if text is None:
                results.append(BatchOcrResult(request_id=rid, ocr=None, error="no text part in response"))
                continue
            ocr = json.loads(text)
            results.append(BatchOcrResult(request_id=rid, ocr=ocr, error=None))
        except json.JSONDecodeError as e:
            results.append(BatchOcrResult(request_id=rid, ocr=None, error=f"json parse failed: {e}"))
        except Exception as e:
            results.append(BatchOcrResult(request_id=rid, ocr=None, error=str(e)))
    return results
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
PYTHONPATH=. pytest scripts/tests/test_gemini_batch.py -v
```

Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/gemini_batch.py scripts/tests/test_gemini_batch.py
git commit -m "Phase 3b2: scripts/lib/gemini_batch.py — Batch API wrapper (3 tests)"
```

---

## Task 9: `scripts/lib/iris_client.py` (Supabase login + app endpoints)

**Files:**
- Create: `scripts/lib/iris_client.py`

(No tests for this module — it's pure HTTP wiring with external dependencies. Smoke test will verify in Task 13.)

- [ ] **Step 1: Write the implementation**

```python
# scripts/lib/iris_client.py
"""Thin client for the IRIS app endpoints used by the bulk import script.

Auth: logs in once with email+password via Supabase REST API, stores the JWT,
includes it in subsequent calls to /api/enrich and /api/cards.
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests


@dataclass
class IrisConfig:
    api_url: str            # e.g. https://pokemanager.vercel.app
    supabase_url: str       # e.g. https://abc.supabase.co
    supabase_anon_key: str
    email: str
    password: str


class IrisClient:
    def __init__(self, config: IrisConfig):
        self.config = config
        self._jwt: str | None = None

    def login(self) -> None:
        """Get the JWT from Supabase Auth REST API. Sets self._jwt on success."""
        url = f"{self.config.supabase_url}/auth/v1/token?grant_type=password"
        res = requests.post(
            url,
            headers={"apikey": self.config.supabase_anon_key, "Content-Type": "application/json"},
            json={"email": self.config.email, "password": self.config.password},
            timeout=30,
        )
        res.raise_for_status()
        body = res.json()
        token = body.get("access_token")
        if not token:
            raise RuntimeError(f"Login did not return access_token: {body}")
        self._jwt = token

    def _headers(self, json_body: bool = True) -> dict[str, str]:
        if self._jwt is None:
            raise RuntimeError("Not logged in. Call login() first.")
        h = {"Authorization": f"Bearer {self._jwt}"}
        if json_body:
            h["Content-Type"] = "application/json"
        return h

    def enrich(self, ocr_fields: dict[str, Any]) -> dict[str, Any]:
        """POST /api/enrich with the OCR fields. Returns { bestMatch, candidates }."""
        url = f"{self.config.api_url}/api/enrich"
        res = requests.post(url, json=ocr_fields, headers=self._headers(), timeout=30)
        res.raise_for_status()
        return res.json()

    def create_card(self, fields: dict[str, str], photo_path: Path) -> dict[str, Any]:
        """POST /api/cards (multipart) with the card fields + photo file.
        Returns { card, fallback?, reason? } on 200."""
        url = f"{self.config.api_url}/api/cards"
        with open(photo_path, "rb") as f:
            files = {"image": (photo_path.name, f, "image/jpeg")}
            data = {k: str(v) if v is not None else "" for k, v in fields.items()}
            res = requests.post(
                url,
                files=files,
                data=data,
                headers={"Authorization": f"Bearer {self._jwt}"},  # no Content-Type for multipart
                timeout=60,
            )
        if res.status_code >= 500:
            res.raise_for_status()
        return res.json()  # may include error fields if 4xx; caller decides
```

- [ ] **Step 2: Verify it imports cleanly (no test, just syntax)**

```bash
PYTHONPATH=. python -c "from scripts.lib.iris_client import IrisClient, IrisConfig; print('ok')"
```

Expected: prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/iris_client.py
git commit -m "Phase 3b2: scripts/lib/iris_client.py — Supabase login + app endpoints client"
```

---

## Task 10: `scripts/add_cards.py` mode 1 (OCR + CSV)

**Files:**
- Create: `scripts/add_cards.py`

- [ ] **Step 1: Write the CLI entry point with mode 1 only**

```python
#!/usr/bin/env python3
"""IRIS bulk import script.

Mode 1 (default):
    python add_cards.py /path/to/photos/

Reads all images from the folder, applies pre-filter + SHA256 cache,
resizes to 1024×1024 max, submits to Gemini Batch API, polls until done,
calls /api/enrich for each result, writes add_cards_results.csv.

Mode 2 (commit):
    python add_cards.py /path/to/photos/ --commit add_cards_results.csv

(Implemented in a follow-up task.)
"""

import argparse
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

from scripts.lib.cache import compute_sha256, load_cache, save_cache, get_cached, set_cached
from scripts.lib.image_utils import should_skip_prefilter, resize_for_gemini, IMAGE_EXTENSIONS
from scripts.lib.gemini_batch import (
    build_request_payload,
    submit_batch,
    poll_until_done,
    parse_batch_response,
)
from scripts.lib.csv_io import write_results, CSV_COLUMNS
from scripts.lib.iris_client import IrisClient, IrisConfig


CACHE_PATH = Path(".cache/ocr-cache.json")
DEFAULT_CSV = Path("add_cards_results.csv")


def collect_images(folder: Path) -> list[Path]:
    """Return all image files in the folder (non-recursive), sorted by name."""
    if not folder.is_dir():
        raise FileNotFoundError(f"Not a directory: {folder}")
    files = sorted(
        p for p in folder.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS
    )
    return files


def mode_one(folder: Path, output_csv: Path, api_key: str, iris: IrisClient) -> None:
    """Mode 1: OCR + enrich + write CSV."""
    images = collect_images(folder)
    print(f"[mode 1] Found {len(images)} image(s) in {folder}")

    cache = load_cache(CACHE_PATH)
    rows = []  # CSV rows (one per image, even skipped ones — for transparency)
    to_ocr = []  # (sha, image_bytes_resized, original_path)

    # Pass 1: pre-filter, hash, cache check, resize
    for path in images:
        skip, reason = should_skip_prefilter(path)
        if skip:
            rows.append({
                "filename": path.name, "count": 1, "requested_status": "SKIP",
                "ocr_error": reason,
            })
            print(f"  ⏭  {path.name}: {reason}")
            continue

        sha = compute_sha256(path)
        cached = get_cached(cache, sha)
        if cached:
            ocr = cached["ocr"]
            rows.append(_row_from_ocr(path, ocr, source="cache"))
            print(f"  ✓ {path.name}: cache hit")
            continue

        try:
            resized = resize_for_gemini(path)
            to_ocr.append((sha, resized, path))
        except Exception as e:
            rows.append({
                "filename": path.name, "count": 1, "requested_status": "SKIP",
                "ocr_error": f"resize failed: {e}",
            })
            print(f"  ⏭  {path.name}: resize failed ({e})")

    # Pass 2: submit batch + poll if anything new to OCR
    if to_ocr:
        print(f"[mode 1] Submitting {len(to_ocr)} image(s) to Gemini Batch API…")
        payload = [
            build_request_payload(image_bytes=img, request_id=sha)
            for sha, img, _ in to_ocr
        ]
        op_name = submit_batch(api_key, payload)
        print(f"[mode 1] Operation: {op_name}. Polling…")
        raw = poll_until_done(api_key, op_name)
        results = parse_batch_response(raw)
        print(f"[mode 1] Got {len(results)} response(s).")

        # Index by request_id (= sha) for matching back to paths
        result_by_sha = {r.request_id: r for r in results}
        for sha, _img, path in to_ocr:
            r = result_by_sha.get(sha)
            if r is None or r.ocr is None:
                rows.append({
                    "filename": path.name, "count": 1, "requested_status": "SKIP",
                    "ocr_error": (r.error if r else "no response from batch"),
                })
                continue
            set_cached(cache, sha, {"ocr": r.ocr, "filename": path.name})
            rows.append(_row_from_ocr(path, r.ocr, source="gemini"))
            print(f"  ✓ {path.name}: {r.ocr.get('card_name', '?')}")

        save_cache(CACHE_PATH, cache)

    # Pass 3: enrich each row that has OCR data via /api/enrich
    print(f"[mode 1] Enriching via /api/enrich…")
    iris.login()
    for row in rows:
        if row.get("requested_status") == "SKIP":
            continue
        ocr_for_enrich = {
            "text": row.get("card_name", ""),
            "setCode": row.get("set_code", ""),
            "localId": row.get("set_number", ""),
            "language": row.get("language", "JP"),
        }
        try:
            enrich = iris.enrich(ocr_for_enrich)
            best = enrich.get("bestMatch")
            if best:
                # Override with enriched values where available
                row["card_name"] = best.get("card_name") or row["card_name"]
                row["set_code"] = best.get("set_code") or row["set_code"]
                row["set_number"] = best.get("set_number") or row["set_number"]
            else:
                row["ocr_error"] = (row.get("ocr_error") or "") + "; no catalog match"
        except Exception as e:
            row["ocr_error"] = (row.get("ocr_error") or "") + f"; enrich failed: {e}"

    write_results(output_csv, rows)
    print(f"\n[mode 1] Wrote {len(rows)} row(s) to {output_csv}")
    print(f"[mode 1] STOP. Review the CSV, edit if needed, then run with --commit {output_csv}")


def _row_from_ocr(path: Path, ocr: dict, source: str) -> dict:
    """Build a CSV row from a Gemini OCR result."""
    return {
        "filename": path.name,
        "count": 1,
        "requested_status": "for_sale",
        "card_name": ocr.get("card_name", ""),
        "set_code": ocr.get("set_code", ""),
        "set_number": ocr.get("set_number", ""),
        "language": ocr.get("language", "JP"),
        "condition": "NM",
        "variant": "",
        "confidence": ocr.get("confidence", ""),
        "ocr_error": "",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="IRIS bulk import script")
    parser.add_argument("folder", type=Path, help="Folder containing card photos")
    parser.add_argument("--commit", type=Path, default=None, help="Commit a previously-generated CSV")
    parser.add_argument("--output", type=Path, default=DEFAULT_CSV, help="Output CSV path (mode 1)")
    args = parser.parse_args()

    load_dotenv(Path(__file__).parent / ".env")
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("ERROR: GEMINI_API_KEY missing in scripts/.env", file=sys.stderr)
        return 1

    iris_config = IrisConfig(
        api_url=os.environ.get("POKEMANAGER_API_URL", "http://localhost:3000"),
        supabase_url=os.environ.get("NEXT_PUBLIC_SUPABASE_URL", ""),
        supabase_anon_key=os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", ""),
        email=os.environ.get("POKEMANAGER_EMAIL", ""),
        password=os.environ.get("POKEMANAGER_PASSWORD", ""),
    )
    iris = IrisClient(iris_config)

    if args.commit:
        print("ERROR: --commit not implemented yet (Task 11)", file=sys.stderr)
        return 1
    else:
        mode_one(args.folder, args.output, api_key, iris)
        return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Verify it imports cleanly**

```bash
PYTHONPATH=. python -c "import scripts.add_cards; print('ok')"
```

Expected: `ok`.

- [ ] **Step 3: Verify CLI usage prints help**

```bash
PYTHONPATH=. python scripts/add_cards.py --help
```

Expected: argparse help with `folder`, `--commit`, `--output`.

- [ ] **Step 4: Commit**

```bash
git add scripts/add_cards.py
git commit -m "Phase 3b2: scripts/add_cards.py mode 1 (OCR + Batch API + CSV write)"
```

---

## Task 11: `scripts/add_cards.py` mode 2 (commit + Y/N/A prompt)

**Files:**
- Modify: `scripts/add_cards.py`

- [ ] **Step 1: Add the mode_two function**

In `scripts/add_cards.py`, ABOVE the `def main()` function, add:

```python
def mode_two(folder: Path, csv_path: Path, iris: IrisClient) -> int:
    """Mode 2: read CSV, commit each row via POST /api/cards, prompt on fallback."""
    from scripts.lib.csv_io import read_for_commit, update_row_in_place

    rows = read_for_commit(csv_path)
    print(f"[mode 2] Committing {len(rows)} row(s) from {csv_path}")

    iris.login()
    accept_all = False  # set to True if the user presses 'A' once
    aborted = False

    for i, row in enumerate(rows, start=1):
        filename = row["filename"]
        count = int(row.get("count") or "1")
        photo_path = folder / filename
        if not photo_path.exists():
            print(f"  ✗ {filename}: photo missing in {folder}")
            update_row_in_place(csv_path, filename=filename, error="photo file missing")
            continue

        final_ids: list[str] = []
        final_statuses: list[str] = []
        last_error = ""

        for copy_idx in range(count):
            try:
                resp = iris.create_card(
                    {
                        "card_name": row["card_name"],
                        "pokemon_name": row.get("card_name", ""),  # fallback
                        "pokemon_number": "",
                        "set_code": row["set_code"],
                        "set_number": row["set_number"],
                        "language": row["language"],
                        "rarity": "OTHER",  # enrich result already wrote this if known
                        "condition": row.get("condition", "NM"),
                        "variant": row.get("variant", ""),
                        "status": row.get("requested_status", "for_sale"),
                    },
                    photo_path,
                )

                if resp.get("error"):
                    last_error = resp["error"]
                    print(f"  ✗ [{i}/{len(rows)}] {filename} copy {copy_idx+1}/{count}: {last_error}")
                    break  # stop trying more copies of this card

                card = resp.get("card", {})
                final_ids.append(card.get("id", ""))
                fallback = resp.get("fallback")
                if fallback == "for_sale_to_collection":
                    final_statuses.append("collection")
                    print(f"\n  ⚠  [{i}/{len(rows)}] {filename}: cette carte est déjà en ligne, ajoutée à Stock.")
                    if not accept_all:
                        choice = input("    Y=continue, N=abort, A=accept all remaining: ").strip().upper()
                        if choice == "A":
                            accept_all = True
                        elif choice == "N":
                            aborted = True
                            break
                        # else assume Y → continue
                else:
                    final_statuses.append(card.get("status", row.get("requested_status", "")))
            except Exception as e:
                last_error = str(e)
                print(f"  ✗ [{i}/{len(rows)}] {filename} copy {copy_idx+1}/{count}: {last_error}")
                break

        update_row_in_place(
            csv_path,
            filename=filename,
            final_status=" + ".join(final_statuses) if final_statuses else "",
            final_ids=", ".join(final_ids),
            error=last_error,
        )
        if aborted:
            print(f"\n[mode 2] User aborted. {i} of {len(rows)} row(s) processed.")
            return 1

    print(f"\n[mode 2] Done. {len(rows)} row(s) processed. CSV updated in-place.")
    return 0
```

- [ ] **Step 2: Wire mode_two into main()**

Replace the `if args.commit:` block at the end of `main()`:

```python
    if args.commit:
        return mode_two(args.folder, args.commit, iris)
    else:
        mode_one(args.folder, args.output, api_key, iris)
        return 0
```

- [ ] **Step 3: Verify CLI behavior with --help**

```bash
PYTHONPATH=. python scripts/add_cards.py --help
```

Expected: still shows the same options, no error.

```bash
PYTHONPATH=. python -c "from scripts.add_cards import mode_two; print('ok')"
```

Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
git add scripts/add_cards.py
git commit -m "Phase 3b2: scripts/add_cards.py mode 2 (commit + Y/N/A prompt on fallback)"
```

---

## Task 12: Web batch tab — `<BatchForm>` component

**Files:**
- Create: `components/submit/BatchForm.tsx`
- Create: `components/submit/BatchReviewQueue.tsx`

- [ ] **Step 1: Write `<BatchReviewQueue>` (handles 1-card form + Préc/Suiv navigation)**

```typescript
// components/submit/BatchReviewQueue.tsx
'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import type { CardLanguage, CardCondition, CardRarity, CardStatus } from '@/lib/types';

export interface QueueItem {
  filename: string;
  photoPreviewUrl: string;
  card_name: string;
  pokemon_name: string;
  pokemon_number: number | null;
  set_code: string;
  set_number: string;
  language: CardLanguage;
  rarity: CardRarity;
  condition: CardCondition;
  variant: string;
  count: number;
  requested_status: CardStatus | 'SKIP';
}

interface Props {
  items: QueueItem[];
  onUpdate: (index: number, patch: Partial<QueueItem>) => void;
  onSkip: (index: number) => void;
}

export default function BatchReviewQueue({ items, onUpdate, onSkip }: Props) {
  const [index, setIndex] = useState(0);

  if (items.length === 0) {
    return <p className="text-text-muted text-sm">Aucune carte à valider.</p>;
  }

  const item = items[index];
  const validatedCount = items.filter((i) => i.requested_status !== 'SKIP').length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-text-muted text-xs">
          Card {index + 1} / {items.length} ({validatedCount} validées)
        </p>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            aria-label="Précédent"
            className="bg-surface-2 disabled:opacity-30 rounded p-1.5"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setIndex((i) => Math.min(items.length - 1, i + 1))}
            disabled={index === items.length - 1}
            aria-label="Suivant"
            className="bg-surface-2 disabled:opacity-30 rounded p-1.5"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.photoPreviewUrl} alt={item.filename} className="w-full rounded" />
          <p className="text-text-faint mt-1 text-xs">{item.filename}</p>
        </div>

        <div className="space-y-2">
          <Field label="Card name" value={item.card_name} onChange={(v) => onUpdate(index, { card_name: v })} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Set code" value={item.set_code} onChange={(v) => onUpdate(index, { set_code: v })} />
            <Field label="Set #" value={item.set_number} onChange={(v) => onUpdate(index, { set_number: v })} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <SelectField
              label="Langue"
              value={item.language}
              options={['JP', 'EN', 'FR', 'KO', 'ZH']}
              onChange={(v) => onUpdate(index, { language: v as CardLanguage })}
            />
            <SelectField
              label="Cond."
              value={item.condition}
              options={['NM', 'EX', 'GD', 'PL', 'PO']}
              onChange={(v) => onUpdate(index, { condition: v as CardCondition })}
            />
            <NumberField
              label="Count"
              value={item.count}
              onChange={(v) => onUpdate(index, { count: v })}
            />
          </div>
          <SelectField
            label="Status"
            value={item.requested_status}
            options={['for_sale', 'collection', 'pokedex']}
            onChange={(v) => onUpdate(index, { requested_status: v as CardStatus })}
          />
          <button
            type="button"
            onClick={() => onSkip(index)}
            className="bg-surface-2 hover:bg-surface-off text-red border-border mt-2 inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Skip cette carte
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-text-muted text-xs">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
      />
    </label>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-text-muted text-xs">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="text-text-muted text-xs">{label}</span>
      <input
        type="number"
        min={1}
        value={value}
        onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1))}
        className="bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
      />
    </label>
  );
}
```

- [ ] **Step 2: Write `<BatchForm>` (orchestrates upload → OCR → review → commit)**

```typescript
// components/submit/BatchForm.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, X, Loader2 } from 'lucide-react';
import { resizeImage } from '@/lib/utils/resize-image';
import BatchReviewQueue, { type QueueItem } from './BatchReviewQueue';
import type { OcrResult, EnrichResult } from '@/lib/types';

const MAX_PHOTOS = 15;

type Phase = 'pick' | 'analyzing' | 'review' | 'committing' | 'done';

interface CommitSummary {
  total: number;
  for_sale: number;
  collection: number;
  fallback: number;
  failed: number;
}

export default function BatchForm() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('pick');
  const [photos, setPhotos] = useState<File[]>([]);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<CommitSummary | null>(null);

  function addPhotos(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/'));
    setPhotos((prev) => [...prev, ...arr].slice(0, MAX_PHOTOS));
  }

  async function analyze() {
    setPhase('analyzing');
    setProgress(0);
    const newItems: QueueItem[] = [];

    // Resize → OCR → enrich, parallel but with progress reporting
    const tasks = photos.map(async (file, i) => {
      const blob = await resizeImage(file);
      const fd = new FormData();
      fd.append('image', blob, file.name);
      const ocrRes = await fetch('/api/ocr', { method: 'POST', body: fd });
      const ocr = await ocrRes.json() as OcrResult;
      const enrichRes = await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: ocr.text,
          setCode: ocr.setCodeCandidate,
          localId: ocr.setNumberCandidate?.card,
          // Default language for enrich lookup; user can refine in the review queue
          language: 'JP',
        }),
      });
      const enrich = await enrichRes.json() as EnrichResult;
      const best = enrich.bestMatch;
      const item: QueueItem = {
        filename: file.name,
        photoPreviewUrl: URL.createObjectURL(file),
        card_name: best?.card_name ?? '',
        pokemon_name: best?.pokemon_name ?? '',
        pokemon_number: best?.pokemon_number ?? null,
        set_code: best?.set_code ?? '',
        set_number: best?.set_number ?? '',
        language: 'JP',
        rarity: best?.rarity ?? 'OTHER',
        condition: 'NM',
        variant: '',
        count: 1,
        requested_status: 'for_sale',
      };
      newItems[i] = item;
      setProgress((p) => p + 1);
    });
    await Promise.all(tasks);
    setItems(newItems);
    setPhase('review');
  }

  function updateItem(index: number, patch: Partial<QueueItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function skipItem(index: number) {
    updateItem(index, { requested_status: 'SKIP' });
  }

  async function commit() {
    setPhase('committing');
    const commitItems = items.filter((i) => i.requested_status !== 'SKIP');
    let for_sale = 0, collection = 0, fallback = 0, failed = 0;

    for (const item of commitItems) {
      const photo = photos.find((p) => p.name === item.filename);
      if (!photo) { failed += 1; continue; }
      for (let copy = 0; copy < item.count; copy += 1) {
        const blob = await resizeImage(photo);
        const fd = new FormData();
        fd.append('image', blob, item.filename);
        fd.append('card_name', item.card_name);
        fd.append('pokemon_name', item.pokemon_name || item.card_name);
        fd.append('pokemon_number', String(item.pokemon_number ?? ''));
        fd.append('set_code', item.set_code);
        fd.append('set_number', item.set_number);
        fd.append('language', item.language);
        fd.append('rarity', item.rarity);
        fd.append('condition', item.condition);
        if (item.variant) fd.append('variant', item.variant);
        fd.append('status', item.requested_status as string);

        try {
          const res = await fetch('/api/cards', { method: 'POST', body: fd });
          const json = await res.json();
          if (!res.ok) { failed += 1; continue; }
          if (json.fallback === 'for_sale_to_collection') { fallback += 1; collection += 1; }
          else if (json.card?.status === 'for_sale') { for_sale += 1; }
          else if (json.card?.status === 'collection') { collection += 1; }
        } catch {
          failed += 1;
        }
      }
    }
    setSummary({ total: commitItems.length, for_sale, collection, fallback, failed });
    setPhase('done');
  }

  // RENDER
  if (phase === 'done' && summary) {
    return (
      <div className="space-y-3">
        <h3 className="text-base font-semibold">Récap</h3>
        <p className="text-sm">
          {summary.for_sale} en vente · {summary.collection} en collection (dont {summary.fallback} auto-fallback) · {summary.failed} échecs
        </p>
        <button
          type="button"
          onClick={() => router.push('/vinted')}
          className="bg-red text-bg rounded px-4 py-2 text-sm font-medium"
        >
          Voir le résultat
        </button>
      </div>
    );
  }

  if (phase === 'review') {
    return (
      <div className="space-y-4">
        <BatchReviewQueue items={items} onUpdate={updateItem} onSkip={skipItem} />
        <button
          type="button"
          onClick={commit}
          className="bg-red text-bg w-full rounded px-4 py-2 text-sm font-medium"
        >
          Tout enregistrer
        </button>
      </div>
    );
  }

  if (phase === 'analyzing' || phase === 'committing') {
    return (
      <div className="text-text-muted flex items-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        {phase === 'analyzing'
          ? `Analyse en cours… ${progress}/${photos.length}`
          : 'Enregistrement…'}
      </div>
    );
  }

  // phase === 'pick'
  return (
    <div className="space-y-4">
      <PhotoDropzone photos={photos} onAdd={addPhotos} onRemove={(i) => setPhotos((prev) => prev.filter((_, j) => j !== i))} />
      <button
        type="button"
        onClick={analyze}
        disabled={photos.length === 0}
        className="bg-red text-bg w-full rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        Analyser {photos.length} photo(s)
      </button>
    </div>
  );
}

function PhotoDropzone({
  photos, onAdd, onRemove,
}: { photos: File[]; onAdd: (files: FileList) => void; onRemove: (index: number) => void }) {
  const [dragging, setDragging] = useState(false);
  return (
    <div>
      <span className="text-text-muted text-xs">Photos ({photos.length}/{MAX_PHOTOS})</span>
      <label
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) onAdd(e.dataTransfer.files);
        }}
        className={`bg-surface-2 mt-1 flex cursor-pointer items-center justify-center rounded border border-dashed p-4 text-sm ${dragging ? 'border-red' : 'border-border'}`}
      >
        <input type="file" accept="image/*" multiple onChange={(e) => e.target.files && onAdd(e.target.files)} className="hidden" />
        <span className="text-text-muted flex items-center gap-2">
          <Upload className="h-4 w-4" />
          Drop ou clic pour ajouter (max {MAX_PHOTOS})
        </span>
      </label>
      {photos.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {photos.map((p, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={URL.createObjectURL(p)} alt="" className="h-20 w-full rounded object-cover" />
              <button type="button" onClick={() => onRemove(i)} className="bg-surface absolute right-1 top-1 rounded p-0.5">
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

- [ ] **Step 3: Verify type-check + lint**

```bash
source ~/.nvm/nvm.sh && nvm use && npx tsc --noEmit 2>&1 | tail -10
source ~/.nvm/nvm.sh && nvm use && npm run lint 2>&1 | tail -10
```

Expected: 0 ts errors, 0 lint warnings.

- [ ] **Step 4: Commit**

```bash
git add components/submit/BatchForm.tsx components/submit/BatchReviewQueue.tsx
git commit -m "Phase 3b2: <BatchForm> + <BatchReviewQueue> components for web batch tab"
```

---

## Task 13: Wire BatchForm into SubmitTabs

**Files:**
- Modify: `components/submit/SubmitTabs.tsx`

- [ ] **Step 1: Replace the Script tab with the Batch tab**

Open `components/submit/SubmitTabs.tsx`. Update imports:

```typescript
import { ScanLine, Layers, Package } from 'lucide-react';
import CardScanForm from './CardScanForm';
import LotForm from './LotForm';
import BatchForm from './BatchForm';
```

Update the `Tab` type and TABS:

```typescript
type Tab = 'mobile' | 'lot' | 'batch';

const TABS: { id: Tab; label: string; icon: typeof ScanLine }[] = [
  { id: 'mobile', label: 'Mobile', icon: ScanLine },
  { id: 'lot', label: 'Lot Vinted', icon: Layers },
  { id: 'batch', label: 'Batch', icon: Package },
];
```

Update the conditional render at the bottom:

```tsx
{tab === 'mobile' && <CardScanForm />}
{tab === 'lot' && <LotForm />}
{tab === 'batch' && <BatchForm />}
```

(The "Script" tab is removed entirely since the Python script is run from the terminal, not the web UI. Users find documentation in `scripts/README.md`.)

- [ ] **Step 2: Verify**

```bash
source ~/.nvm/nvm.sh && nvm use && npx tsc --noEmit 2>&1 | tail -5
source ~/.nvm/nvm.sh && nvm use && npm run lint 2>&1 | tail -5
source ~/.nvm/nvm.sh && nvm use && npm test 2>&1 | tail -5
```

Expected: 0 errors, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add components/submit/SubmitTabs.tsx
git commit -m "Phase 3b2: replace Script tab with Batch tab in SubmitTabs"
```

---

## Task 14: Final lint + verification

**Files:** none

- [ ] **Step 1: Run all checks**

```bash
source ~/.nvm/nvm.sh && nvm use > /dev/null
echo "=== TSC ==="
npx tsc --noEmit 2>&1 | tail -5
echo "=== LINT ==="
npm run lint 2>&1 | tail -5
echo "=== VITEST ==="
npm test 2>&1 | tail -10
echo "=== BUILD ==="
npm run build 2>&1 | tail -15
echo "=== PYTEST ==="
PYTHONPATH=. pytest scripts/tests/ -v 2>&1 | tail -20
```

Expected:
- 0 ts errors
- 0 lint warnings
- 242/242 vitest passing (240 baseline + 2 new from Task 1)
- Build successful
- 15/15 pytest passing

- [ ] **Step 2: Commit only if cleanups were made**

```bash
git add -p
git commit -m "Phase 3b2: lint + cleanups"
```

If nothing needed fixing, skip.

---

## Task 15: Manual smoke test (user handoff)

**Files:** none — exploratory.

- [ ] **Step 1: Smoke-test the web batch tab**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run dev
```

1. Open `http://localhost:3000/submit` → click "Batch" tab.
2. Drop 3-5 card photos.
3. Click "Analyser" → spinner with progress (3/5, 4/5, 5/5).
4. Review queue: navigate Préc/Suiv, edit fields, set count=2 on one card, mark one as SKIP.
5. Click "Tout enregistrer" → spinner.
6. Récap : "X en vente · Y en collection (dont Z auto-fallback) · 0 échecs".
7. Verify in `/vinted` and `/stock` that the cards are present with correct status.

- [ ] **Step 2: Smoke-test the Python script (mode 1)**

```bash
cd scripts/
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with real GEMINI_API_KEY, POKEMANAGER_API_URL, EMAIL, PASSWORD, SUPABASE_URL, ANON_KEY
PYTHONPATH=.. python add_cards.py /path/to/test/photos/
```

Expected:
- Pre-filter logs (`⏭` for skipped)
- Cache hits if you re-run on the same folder
- Batch API submit + poll messages
- `add_cards_results.csv` written in cwd
- "STOP. Review the CSV…" message at the end

- [ ] **Step 3: Smoke-test the Python script (mode 2)**

```bash
PYTHONPATH=.. python add_cards.py /path/to/test/photos/ --commit add_cards_results.csv
```

Expected:
- Login OK
- Each row processed
- Y prompt appears on rows that fallback for_sale → collection
- CSV updated in-place with `final_status`, `final_ids`

- [ ] **Step 4: Smoke-test the for_sale fallback in the web scanner**

1. Use the Mobile tab to scan a card that's already in for_sale (any duplicate).
2. After save, an info toast/banner appears: "Carte ajoutée à ton Stock (déjà en vente)".
3. Verify the card landed in `/stock`.

- [ ] **Step 5: No commit needed for this task.**

---

## Summary

**Total tests added:** 17 (2 vitest for fallback + 15 pytest for Python)
**Files created:** 14 (2 web components + 12 Python files)
**Files modified:** 4 (`/api/cards/route.ts`, `resize-image.ts`, `LotForm.tsx`, `SubmitTabs.tsx`, `CardScanForm.tsx`)
**Estimated time:** ~7 working days following TDD strictly with frequent commits.

---

## Self-review (already applied)

1. **Spec coverage** — every section in the spec maps to a task:
   - §4 Status fallback → Task 1
   - §5 Image resize helper → Task 2 (already exists, lower default + wire)
   - §6.1-§6.2 Python CLI mode 1 + 2 → Tasks 4-11
   - §6.3 CSV format → Task 7
   - §6.4 Auth → Task 9
   - §7 Web batch tab → Tasks 12-13
   - §8 Tests → embedded in each TDD task
   - §9 Errors → Task 1 (server fallback), Task 11 (Y/N/A prompt)
   - §10 Env vars → Task 4 (.env.example)
   - §12 Critères de succès → Task 14 (lint/build/test) + Task 15 (smoke)

2. **Placeholder scan** — every step contains complete code or exact commands. The TODO comment in `BatchForm.tsx` (`TODO let user override at queue stage`) is a known followup, not a plan failure (the language defaults to JP, the user can edit per-card in the review queue via the SelectField — actually that's already wired). Will remove that TODO comment in Task 12 implementation.

3. **Type consistency** — `QueueItem` defined in Task 12 and used in Task 12 only. `BatchOcrResult` defined in Task 8 and used in Task 10. `IrisConfig` / `IrisClient` defined in Task 9 and used in Tasks 10, 11. CSV columns defined in Task 7 and consumed in Tasks 10, 11. All consistent.
