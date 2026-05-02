# Phase 3b2 — Bulk import (Python CLI + Web batch tab + optims partagées)

**Date** : 2026-05-02
**Statut** : Spec validé, prêt à planning
**Phase précédente** : 3b1 (Lots Vinted bundles, 240 tests)
**Périmètre** : ingestion en masse de cartes individuelles via 2 voies (script Python pour > 15 cartes, web tab pour ≤ 15 cartes), avec optimisations OCR partagées qui bénéficient AUSSI au scanner unitaire existant.

---

## 1. Contexte et motivation

L'OCR Gemini est la **seule ligne facturée** du projet ($0.0006/scan actuellement). Le scanner web envoie les photos brutes (4MB depuis téléphone) → ~4000 tokens image. Pour ingérer 200 cartes en bulk, ça coûterait $0.12. Pour 1000 cartes : $0.60. Pas catastrophique mais facilement réductible.

**3 leviers d'économie** :
1. **Resize image client-side** à 1024×1024 max (~258 tokens vs ~4000) → 15× moins cher
2. **Gemini Batch API** (`:batchGenerateContent`) → 50% off sur input + output, async
3. **Cache SHA256 local** → re-runs gratuits sur même fichier

**Côté UX**, le user veut 2 entry points pour le bulk :
- **Script Python** pour > 15 cartes (overnight, async, cheap via Batch API)
- **Web batch tab** pour ≤ 15 cartes (sync, no setup, depuis n'importe quel device)

Le scanner unitaire existant reste pour 1 carte à la flemme.

---

## 2. Objectifs et non-objectifs

### Objectifs

1. **Réduire le coût OCR du scanner web** via resize client-side (~15× moins cher, gain immédiat).
2. **Status fallback automatique** côté serveur : `for_sale` qui collisionne sur la contrainte unique → auto-route vers `collection` (Stock). Bénéficie aux 3 voies (web scanner, web batch tab, Python script).
3. **Python CLI 2-phase** : mode 1 (OCR + CSV) → review human → mode 2 (commit). Économie maximale via Batch API + cache SHA256 + pre-filter.
4. **Web batch tab** (`/submit` 4e onglet) pour batch web ≤ 15 photos sync.
5. **Helper partagé** `lib/utils/image-resize.ts` (canvas) réutilisé dans `CardScanForm`, `LotForm` (pour les photos lot), et la nouvelle batch tab.

### Non-objectifs

- ❌ **Pas de batch via l'app web** (sync uniquement côté web, le batch async = script). La web tab parallélise les fetch mais reste sync-per-card.
- ❌ **Pas d'OCR sur les photos de lots** Vinted (Phase 3b1 — un lot = une vente bundle, pas une carte individuelle).
- ❌ **Pas de mode auto-confirm** dans le script (le Y prompt sur fallback est obligatoire — sécurité).
- ❌ **Pas de TUI fancy** dans le script (juste prints + CSV + input prompts).
- ❌ **Pas de retry async automatique** (re-run le script, le cache SHA256 reprend où ça s'est arrêté).
- ❌ **Pas de support import Pokédex bulk** (default `for_sale`, override `--status` mais conflits probables).

---

## 3. Architecture

### 3.1 Flux web (existant + amélioré)

```
[Mobile photo] → CardScanForm
    ↓ (resize 1024×1024 via canvas) ← NOUVEAU
[POST /api/ocr] → Gemini sync → result
    ↓
[POST /api/enrich] → catalog lookup
    ↓
[POST /api/cards] → insert → ON CONFLICT for_sale → fallback collection ← NOUVEAU
    ↓
[Toast UI] : "Ajoutée en for_sale" OU "Ajoutée en collection (déjà en vente)"
```

### 3.2 Flux web batch (nouveau)

```
/submit onglet "Batch" → multi-photo dropzone (≤ 15)
    ↓ (resize chaque photo via canvas)
[Promise.all : POST /api/ocr × N, parallèle]
    ↓
[Promise.all : POST /api/enrich × N]
    ↓
[Review queue : carte par carte, Préc/Suiv, count input par carte, edit form]
    ↓
[Tout enregistrer] → POST /api/cards × (somme des counts) sequentially
    ↓
[Toast récap] : "12 cartes ajoutées (8 for_sale, 4 fallback collection)"
```

### 3.3 Flux script Python

```
Mode 1 : python add_cards.py /path/to/photos/
    ↓
[Pre-filter] (file size, aspect ratio, extension)
    ↓
[SHA256 hash + cache check] → skip si déjà OCR
    ↓
[Pillow resize] → 1024×1024 max, JPEG q85, in-memory
    ↓
[Gemini Batch API] :batchGenerateContent → operation
    ↓
[Polling] toutes les 30s jusqu'à done
    ↓
[Lookup catalog Python] (replicate de lookupByCode logic) OU [POST /api/enrich]
    ↓
[Write add_cards_results.csv] avec count=1 par défaut
    ↓
STOP : "Review the CSV, edit if needed, then run --commit"

Mode 2 : python add_cards.py /path/to/photos/ --commit add_cards_results.csv
    ↓
[Read CSV, skip rows status=SKIP]
    ↓
[Login Supabase] (email/password depuis .env) → JWT
    ↓
[Pour chaque ligne] : POST /api/cards × count, multipart avec photo originale (pas resized)
    ↓ (si réponse contient fallback: 'for_sale_to_collection')
[input("Cette carte est déjà en ligne, appuyez sur Y pour continuer (N=abort, A=accept all): ")]
    ↓
[Update CSV in-place] : final_status = "for_sale" | "collection" | "for_sale + 2× collection" | etc., final_id = uuid(s)
```

---

## 4. Status fallback côté serveur (`POST /api/cards`)

### 4.1 Logique

Aujourd'hui : si insert avec `status='for_sale'` collisionne sur l'index `one_for_sale_per_group` (Phase 2.1), l'endpoint renvoie 409.

Nouveau comportement :
1. Insert avec `status='for_sale'` → si succès : OK, retour standard (pas de `fallback` field)
2. Si Postgres renvoie 23505 (unique violation) sur l'index for_sale → retry l'insert avec `status='collection'`
3. Si le retry réussit : retour `{ card: ..., fallback: 'for_sale_to_collection' }`
4. Si le retry échoue (ne devrait pas, collection n'a pas de contrainte d'unicité) : 500

Ne s'applique QUE quand le user a explicitement demandé `for_sale`. Si le user demande `collection` direct, pas de retry, pas de fallback. Idem pour `pokedex` (déjà géré, garde son 409 friendly avec `existingCard`).

### 4.2 Réponse

Cas standard (pas de fallback) :
```json
{ "card": { "id": "...", "status": "for_sale", ... } }
```

Cas fallback :
```json
{
  "card": { "id": "...", "status": "collection", ... },
  "fallback": "for_sale_to_collection",
  "reason": "Une carte identique est déjà en vente"
}
```

### 4.3 UI consumer

**Web scanner (`CardScanForm`)** : après save, si `fallback` présent → toast info "Cette carte est déjà en vente, ajoutée à ton Stock".

**Web batch tab** : récap final regroupé : "12 cartes ajoutées (8 for_sale, 4 collection auto)".

**Python script mode 2** : prompt interactif Y/N/A à chaque fallback (cf. §6.2).

---

## 5. Helper `lib/utils/image-resize.ts` (browser canvas)

Pure helper réutilisable côté client.

```ts
export interface ResizeOptions {
  maxDimension?: number;  // default 1024
  quality?: number;       // 0-1, default 0.85
  mimeType?: string;      // default 'image/jpeg'
}

export async function resizeImageForOcr(
  file: File,
  options: ResizeOptions = {},
): Promise<File>;
```

Logique :
1. `createImageBitmap(file)` → bitmap
2. Calcule new dimensions : `scale = min(1, maxDim / max(width, height))`
3. `OffscreenCanvas` ou `<canvas>` → drawImage scaled
4. `canvas.toBlob({ type, quality })` → blob
5. Wrap dans `new File([blob], original.name, { type })`

Si l'image est déjà ≤ maxDimension, retourne le file original sans transformation (skip cycle).

Wire dans :
- `CardScanForm.tsx` → avant `POST /api/ocr` du scanner unitaire
- `LotForm.tsx` → avant upload chaque photo lot dans `/api/lots`
- Nouvelle web batch tab → avant chaque `POST /api/ocr` parallèle

---

## 6. Python CLI (`scripts/add_cards.py`)

### 6.1 Layout fichiers

```
scripts/
├── add_cards.py              # CLI principale, ~350 lignes
├── lib/
│   ├── __init__.py
│   ├── gemini_batch.py       # Batch API wrapper (submit, poll, parse), ~150 lignes
│   ├── iris_client.py        # Login Supabase + appels /api/enrich + /api/cards, ~120 lignes
│   ├── cache.py              # SHA256 + cache JSON, ~60 lignes
│   ├── image_utils.py        # Pillow resize + pre-filter, ~80 lignes
│   └── csv_io.py             # read/write/update CSV, ~80 lignes
├── tests/
│   ├── test_cache.py         # 4 tests
│   ├── test_image_utils.py   # 5 tests
│   ├── test_csv_io.py        # 3 tests
│   └── test_gemini_batch.py  # 3 tests (mock fetch)
├── requirements.txt          # google-generativeai, supabase, requests, Pillow, tabulate, pytest
└── .env.example              # GEMINI_API_KEY, POKEMANAGER_API_URL, POKEMANAGER_EMAIL, POKEMANAGER_PASSWORD
```

### 6.2 Mode 2 — Y prompt sur fallback

Quand le serveur renvoie `fallback: 'for_sale_to_collection'`, le script affiche :

```
[12/200] photo_042.jpg → Pikachu ex (sv2a-25 JP)
⚠️  Cette carte est déjà en ligne, fallback vers collection (Stock).
    Appuyez sur Y pour continuer, N pour abort, A pour accept all remaining: _
```

- **Y** : continue à la carte suivante
- **N** : abort le commit (les cartes déjà saved restent saved, le CSV reflète l'état partiel)
- **A** : passe en mode "accept all", plus de prompt jusqu'à la fin du run

Une fois `A` activé, les fallbacks suivants sont auto-acceptés et juste loggés dans le CSV.

### 6.3 CSV format

Colonnes (héritées du mode 1, complétées par mode 2) :

| Colonne | Mode 1 écrit | Mode 2 lit | Mode 2 écrit |
|---|---|---|---|
| `filename` | ✓ (basename) | ✓ | — |
| `count` | ✓ (default 1) | ✓ (user-edited) | — |
| `requested_status` | ✓ (default `for_sale`) | ✓ (`for_sale`/`collection`/`pokedex`/`SKIP`) | — |
| `card_name` | ✓ | ✓ | — |
| `set_code` | ✓ | ✓ | — |
| `set_number` | ✓ | ✓ | — |
| `language` | ✓ | ✓ | — |
| `condition` | ✓ (default `NM`) | ✓ | — |
| `variant` | ✓ (vide par défaut) | ✓ | — |
| `confidence` | ✓ (Gemini high/medium/low) | — | — |
| `ocr_error` | ✓ (texte si OCR a foiré) | — | — |
| `final_status` | (vide) | — | ✓ ("for_sale" / "collection" / "for_sale + 2× collection") |
| `final_ids` | (vide) | — | ✓ (uuids comma-separated) |
| `error` | (vide) | — | ✓ (si POST a échoué) |

### 6.4 Auth

Login Supabase via REST API (pas SDK pour rester léger) :
```python
res = requests.post(
    f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
    headers={"apikey": SUPABASE_ANON_KEY},
    json={"email": EMAIL, "password": PASSWORD},
)
jwt = res.json()["access_token"]
```
Puis `Authorization: Bearer {jwt}` sur les calls `/api/enrich` et `/api/cards`.

`.env` requis dans `scripts/` :
```
GEMINI_API_KEY=
POKEMANAGER_API_URL=https://pokemanager.vercel.app
POKEMANAGER_EMAIL=
POKEMANAGER_PASSWORD=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

---

## 7. Web batch tab (`/submit` 4e onglet "Batch")

### 7.1 UI

- Remplace l'onglet "Script" placeholder existant (le tab "Script" disparaît, on garde "Mobile" / "Lot Vinted" / "Batch").
- Multi-photo dropzone (cap 15 — limite douce, warning si dépasse mais pas blocked).
- Click "Analyser le batch" :
  - Pour chaque photo : `resizeImageForOcr` → `POST /api/ocr` (parallèle via `Promise.all`)
  - Puis pour chaque résultat OCR : `POST /api/enrich` (parallèle)
  - Spinner global "Analyse en cours… 8/15"
- File de revue : carte par carte, navigation Précédent/Suivant + compteur "3/15 validées"
  - Form pré-rempli (réutilise un sous-composant simplifié de `CardScanForm`)
  - Champs éditables : card_name, pokemon_number, set_code, set_number, language, rarity, condition, variant, count (default 1), status (default `for_sale`)
  - Bouton "Skip cette carte" (équivalent SKIP du CSV)
- Bouton "Tout enregistrer" en bas :
  - POST /api/cards séquentiel (pas parallèle pour respecter le serveur)
  - Suit les fallbacks via la réponse
  - Toast récap final

### 7.2 Composant principal

`components/submit/BatchForm.tsx` — orchestre le flow. Sous-composants :
- `BatchPhotoDropzone` (réutilise pattern `LotForm.PhotoDropzone`)
- `BatchReviewQueue` (file de revue avec navigation + form)
- `BatchSummary` (récap final avec breakdown for_sale/collection)

---

## 8. Tests

### 8.1 Côté TS

- `lib/utils/image-resize.test.ts` (4 tests) : noop si small / resize si large / preserve aspect ratio / quality / fallback to original on error
- `app/api/cards/route.test.ts` extension : 2 nouveaux tests pour le fallback (200 standard / 200 avec fallback flag)

### 8.2 Côté Python

- `scripts/tests/test_cache.py` : SHA256 stable / cache hit / cache miss / cache update
- `scripts/tests/test_image_utils.py` : pre-filter (file size, aspect ratio, extension) / resize logic / format passthrough
- `scripts/tests/test_csv_io.py` : read / write / update in-place
- `scripts/tests/test_gemini_batch.py` : submit (mock requests.post) / poll done / poll pending / parse response

Pas de test E2E : Batch API trop lent + coûte des tokens. Smoke test à la main.

**Total nouveaux tests : ~21 (6 TS + 15 Python)**.

---

## 9. Erreurs et fallbacks

| Erreur | Comportement |
|---|---|
| Gemini Batch timeout (>1h) | Abort polling, save partial results, CSV `error` rempli, re-run reprend depuis cache |
| Login Supabase échoue (401) | Abort tout le run avec message clair (mauvais email/password ou URL incorrecte) |
| `/api/enrich` 500 sur une carte | Mode 1 : marque CSV `ocr_error="enrich failed"`. Mode 2 : marque `error`. Continue les autres. |
| `/api/cards` 5xx sur une carte | Marque CSV `error`, continue les autres |
| `/api/cards` fallback for_sale → collection | Mode 2 prompt Y/N/A. Web : toast info |
| Photo Storage upload échoue | Le serveur insert quand même la card (`image_url=null`). Marque CSV `final_status="saved_no_photo"` |
| Hash SHA256 collision (extrêmement improbable) | Acceptable, le cache hit retourne le résultat de la 1ère image. Mode 1 le détectera pas, à investiguer si jamais ça arrive |

---

## 10. Variables d'environnement

Côté script Python (`scripts/.env`) :
- `GEMINI_API_KEY` — même clé que `.env.local`
- `POKEMANAGER_API_URL` — URL de l'app (ex: `https://pokemanager.vercel.app`)
- `POKEMANAGER_EMAIL` — email du user mono-utilisateur
- `POKEMANAGER_PASSWORD` — password
- `NEXT_PUBLIC_SUPABASE_URL` — pour l'auth REST
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — pour l'auth REST

Côté app : aucune nouvelle env var.

---

## 11. Volume estimé

| Bloc | Jours |
|---|---|
| Status fallback dans `/api/cards` + tests | 0.5 |
| `lib/utils/image-resize.ts` (canvas helper) + tests | 0.5 |
| Wire resize dans CardScanForm + LotForm | 0.5 |
| Python CLI mode 1 (OCR + Batch API + CSV) | 2.5 |
| Python CLI mode 2 (read CSV + commit + Y prompt) | 1 |
| Web batch tab (BatchForm + sous-composants + intégration SubmitTabs) | 1.5 |
| Smoke test e2e (10 photos via script + via web batch) | 0.5 |
| **Total** | **~7 jours** |

---

## 12. Critères de succès

- [ ] `npm test` : 246/246 (240 + 6 nouveaux TS) — Python tests gérés à part avec pytest
- [ ] `pytest scripts/tests/` : 15/15 verts
- [ ] `npm run lint` : 0 warning
- [ ] `npm run build` : 0 erreur typescript
- [ ] Resize image dans CardScanForm : photo 4MB → ~250KB envoyée à `/api/ocr` (vérifié via DevTools Network)
- [ ] POST /api/cards avec status=for_sale + carte déjà en for_sale : réponse 200 + `fallback: 'for_sale_to_collection'`
- [ ] Toast UI affiche le fallback dans le scanner web
- [ ] Web batch tab : drop 5 photos → analyse parallèle → review queue → commit → toast récap
- [ ] Script Python mode 1 sur 10 photos : génère CSV avec 10 lignes, latence < 5 min via Batch API
- [ ] Script Python mode 2 : commit le CSV, Y prompt sur les fallbacks, CSV mis à jour avec final_status

---

## 13. Suite

### Phase 4 (plus tard)

- Dashboard avec KPIs (incluant nombre de cartes en collection, lots vendus, etc.)
- Bulk vendu (sélection multi-rows)
- Polish PWA (install prompt, icônes 192/512)
- Périodique cleanup orphan photos Storage (cf. follow-up Phase 3b1)

### Followups différés (non-bloquants)

1. **Image resize côté serveur** en backup si le client envoie une image > 5MB malgré le helper (defensive). Pas critique.
2. **Compression progressive** : retry avec quality 0.7 si la première resize est encore > 1MB. Edge case.
3. **Cache invalidation** : pour l'instant le cache SHA256 ne se vide jamais. Si on change le prompt Gemini, les vieux résultats deviennent obsolètes. Futur : ajouter un `prompt_version` au cache.
4. **Mode interactif vrai** dans le script (1 carte à la fois avec confirmation y/n/e par carte) si le full-auto + Y prompt sur fallback s'avère insuffisant.
5. **Batch API pour les lots** Vinted (Phase 3b1 fait des uploads photo synchrones, on pourrait async les uploads pour les gros lots > 10 photos). Mineur.
6. **Pre-filter avancé** : détection ML rapide "est-ce une carte Pokémon ?" avant Gemini. Coûteux à implémenter, gain marginal.
