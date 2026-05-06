# Import Vinted — Design Spec

> **Scope** : Feature 1 du brief `PHASE_4.md` (déférée Phase 4, livrée maintenant). Script one-shot pour seeder I.R.I.S avec les annonces Vinted déjà en ligne, sans tout re-scanner. Mono-user (Hisshiden), idempotent en cas de re-run, page web (pas un script Python).

> **Goal** : Bootstrap la DB depuis l'API JSON interne de Vinted via cookie session. Crée des rows `cards` (status='for_sale') + `card_listings` (auth.uid()) en bulk, avec photos rapatriées dans le bucket Supabase Storage `card-photos`.

## 1. Décisions structurantes (validées en brainstorming)

| Décision | Choix | Pourquoi |
|---|---|---|
| But | Créer cards depuis zéro | DB vide pour ce flow, pas de matching |
| Source data | API JSON Vinted via cookie session du user | Une seule action manuelle (copier 1 curl), JSON structuré, supporte drafts/reserved |
| Format script | Page web `/import/vinted` | Cohérent avec drop des scripts Python Phase 3b2, réutilise CardScanForm + /api/enrich existants |
| Filtrage | Regex `(jpn\|eng\|fra\|kor\|chn)_<set>-<num>` sur titre+description | Skip silencieux des lots, vêtements, autres articles |
| Validation | Grille checkbox + import en 1 clic | Plus rapide que 1-by-1 pour ~100-200 annonces |
| `listed_at` | Date réelle Vinted (`created_at_ts`) | Préserve l'historique → indicateur stale fonctionnel dès l'import |
| Photos | Download CDN Vinted → upload Supabase Storage `card-photos` | URL pérenne, indépendant de Vinted |
| Lots Vinted | Skip silencieux | Ne sont pas dans le scope (re-saisis manuellement plus tard via LotForm si besoin) |
| Migrations | Aucune | Réutilise tables `cards` + `card_listings` existantes |

## 2. Architecture

### 2.1 Nouvelle page

`app/(app)/import/vinted/page.tsx` — RSC shell minimal :

```tsx
export default function ImportVintedPage() {
  return (
    <div className="mx-auto max-w-6xl p-4">
      <h1 className="text-2xl font-bold">Import Vinted</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Bootstrap one-shot depuis ton compte Vinted. Tes annonces seront créées
        comme cards `for_sale` listées par toi.
      </p>
      <VintedImportFlow />
    </div>
  );
}
```

**Pas dans la nav.** Accessible par URL directe ou via un lien discret depuis `/options`.

### 2.2 Types partagés (`lib/types/vinted-import.ts`)

```ts
// Shape pertinente du JSON Vinted /api/v2/users/.../items
// (champs ignorés : favourite_count, view_count, brand, size, etc.)
export type VintedItem = {
  id: number;
  title: string;
  description: string;
  price: { amount: string; currency_code: string };
  created_at_ts: number;        // Unix seconds
  photos: Array<{
    id: number;
    full_size_url: string;
    url: string;
  }>;
  status_id: number;            // Vinted item status (ignore for now, on filtre via regex)
};

export type ToImport = {
  vintedItem: VintedItem;
  parsed: ParsedListing;        // depuis parse-vinted-listing
  enriched: EnrichedCard | null; // depuis /api/enrich
};

export type ImportFailureReason =
  | 'duplicate_for_sale'        // index one_for_sale_per_group violé
  | 'listing_already_exists'    // PK card_listings violée
  | 'photo_unavailable'         // toutes les photos[*] 404
  | 'storage_upload_failed'     // bucket upload échoué
  | 'unknown';                  // catch-all

export type ImportFailure = {
  vintedItemId: number;
  reason: ImportFailureReason;
  detail?: string;              // message d'erreur brut pour debug UI
};
```

### 2.3 3 endpoints API

| Endpoint | Body | Réponse |
|---|---|---|
| `POST /api/import/vinted/fetch` | `{ curl: string }` | `{ items: VintedItem[], skipped: number }` |
| `POST /api/import/vinted/preview` | `{ items: VintedItem[] }` | `{ enriched: Record<string, EnrichedCard \| null> }` |
| `POST /api/import/vinted/commit` | `{ items: ToImport[] }` | `{ created: number, failed: ImportFailure[] }` |

Tous derrière `proxy.ts` (auth Supabase requise). `card_listings.user_id` stamp depuis `auth.uid()` côté serveur — un user logué ne peut créer que SES propres listings.

## 3. Helpers purs

### 3.1 `lib/utils/parse-vinted-curl.ts`

```ts
export type VintedCurl = {
  userId: string;
  cookie: string;          // Cookie header complet (incl. _vinted_fr_session)
  csrfToken: string | null; // depuis x-csrf-token si présent
};

export function parseVintedCurl(curl: string): VintedCurl | null;
```

- Regex sur l'URL : `https://www\.vinted\.[a-z.]+/api/v2/users/(\d+)/items` → capture userId.
- Cookie : extrait depuis `-H 'Cookie: ...'` ou `-b '...'` (les 2 formats Chrome).
- CSRF token : depuis `-H 'x-csrf-token: ...'` si présent. Optionnel (Vinted GET ne l'exige pas toujours).
- Retourne `null` si l'URL ne matche pas Vinted.

### 3.2 `lib/utils/parse-vinted-listing.ts`

```ts
export type ParsedListing = {
  language: CardLanguage;
  setCode: string;
  setNumber: string;
  condition: CardCondition;
};

export function parseVintedListing(input: {
  title: string;
  description: string;
}): ParsedListing | null;
```

Logique :

1. Regex `/\((jpn|eng|fra|kor|chn)_([a-z0-9-]+)-(\d+)\)/i` sur `title + '\n' + description`.
2. Mapping langue : `jpn→JP`, `eng→EN`, `fra→FR`, `kor→KO`, `chn→CN`.
3. Condition : grep dans description, premier match gagne :
   - `/near mint|\bNM\b/i` → `NM`
   - `/excellent|\bEX\b/i` → `EX`
   - `/light(ly)? played|\bLP\b/i` → `LP`
   - `/\bgood\b|\bGD\b/i` → `GD`
   - `/played|\bPL\b/i` → `PL`
   - default → `NM`
4. Retourne `null` si la regex principale (étape 1) ne matche pas.

### 3.3 `lib/utils/map-vinted-to-card.ts`

```ts
export type CardInsert = Database['public']['Tables']['cards']['Insert'];

export function mapVintedToCardInsert(
  vinted: VintedItem,
  parsed: ParsedListing,
  enriched: EnrichedCard | null,
  uploadedImageUrl: string,
): CardInsert;
```

Champs mappés :

| Champ DB | Source |
|---|---|
| `image_url` | `uploadedImageUrl` (Supabase Storage public URL) |
| `card_id_tcg` | `enriched?.card_id_tcg ?? null` (format `swsh9-31`, conforme à `cards.card_id_tcg` des rows existantes) |
| `cardmarket_id` | `enriched?.cardmarket_id ?? null` |
| `pokemon_name` | `enriched?.pokemon_name ?? null` |
| `pokemon_name_fr` | `enriched?.pokemon_name_fr ?? null` |
| `pokemon_number` | `enriched?.pokemon_number ?? null` |
| `set_code` | `enriched?.set_code ?? parsed.setCode` |
| `set_number` | `enriched?.set_number ?? parsed.setNumber` |
| `set_total` | `enriched?.set_total ?? null` |
| `set_name` | `enriched?.set_name ?? null` |
| `set_name_fr` | `enriched?.set_name_fr ?? null` |
| `language` | `parsed.language` |
| `condition` | `parsed.condition` |
| `variant` | `null` (pas de signal fiable dans les annonces actuelles) |
| `rarity` | `enriched?.rarity ?? null` |
| `tcg_image_url` | `enriched?.image_url ?? null` |
| `cm_price_low/trend/avg` | `enriched?.cm_price_*` |
| `cm_updated_at` | `enriched?.cm_updated_at ?? null` |
| `suggested_price` | `Number(vinted.price.amount)` |
| `status` | `'for_sale'` |
| `date_added` | `new Date().toISOString()` (date d'import I.R.I.S) |
| `notes` | `null` |

## 4. Endpoints — détail

### 4.1 `POST /api/import/vinted/fetch`

```ts
// Pseudo-code
async function POST(req) {
  const { curl } = await req.json();
  const parsed = parseVintedCurl(curl);
  if (!parsed) return 400 { error: 'invalid_curl' };

  const items: VintedItem[] = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages) {
    const url = `https://www.vinted.fr/api/v2/users/${parsed.userId}/items?per_page=200&page=${page}`;
    const res = await fetch(url, {
      headers: {
        'Cookie': parsed.cookie,
        'User-Agent': 'Mozilla/5.0 (...)', // copier UA standard pour éviter blocs
        ...(parsed.csrfToken && { 'x-csrf-token': parsed.csrfToken }),
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 401) return 401 { error: 'cookie_expired' };
    if (res.status === 403) return 503 { error: 'cloudflare_blocked' };
    if (res.status === 429) {
      // Exponential backoff: 1s, 2s, 4s. Max 3 retries.
      // After 3 retries, return 503 + 'rate_limited'.
      const waitMs = 1000 * Math.pow(2, retryCount);
      await sleep(waitMs);
      retryCount++;
      continue; // retry same page
    }
    const data = await res.json();
    items.push(...data.items);
    totalPages = data.pagination.total_pages;
    page++;
  }

  // Filtrage : garde seulement les cards (regex match)
  const filtered = items.filter(i => parseVintedListing({ title: i.title, description: i.description }) !== null);
  return { items: filtered, skipped: items.length - filtered.length };
}
```

**Note auth** : pas de `auth.uid()` requis pour ce endpoint en pratique, mais on garde le proxy par cohérence.

### 4.2 `POST /api/import/vinted/preview`

Boucle parallèle (concurrency 5) sur les items, appelle `/api/enrich` interne pour chacun. Retourne `Map<vintedItemId, EnrichedCard | null>`. Best-effort : un échec individuel laisse `null` pour cet item.

### 4.3 `POST /api/import/vinted/commit`

```ts
async function POST(req) {
  const { items } = await req.json();  // ToImport = { vintedItem, parsed, enriched }
  const supabase = await createServerClient();
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) return 401;

  const created = []; const failed: ImportFailure[] = [];
  for (const item of items) {  // séquentiel
    try {
      // 1. Download photo (try [0], fallback [1], [2])
      const imageUrl = await downloadAndUploadPhoto(item.vintedItem.photos, supabase);
      // imageUrl peut être null si toutes les photos 404

      // 2. INSERT card
      const cardInsert = mapVintedToCardInsert(item.vintedItem, item.parsed, item.enriched, imageUrl ?? '');
      const { data: card, error: cardErr } = await supabase.from('cards').insert(cardInsert).select('id').single();
      if (cardErr) {
        if (cardErr.code === '23505') {
          failed.push({ vintedItemId: item.vintedItem.id, reason: 'duplicate_for_sale' });
          continue;
        }
        throw cardErr;
      }

      // 3. INSERT card_listings
      const listedAt = new Date(item.vintedItem.created_at_ts * 1000).toISOString();
      const { error: listingErr } = await supabase.from('card_listings').insert({
        card_id: card.id,
        user_id: userId,
        listed_at: listedAt,
      });
      if (listingErr && listingErr.code !== '23505') throw listingErr;

      created.push(card.id);
      if (!imageUrl) failed.push({ vintedItemId: item.vintedItem.id, reason: 'photo_unavailable' });
    } catch (e) {
      failed.push({ vintedItemId: item.vintedItem.id, reason: 'unknown', detail: String(e) });
    }
  }
  return { created: created.length, failed };
}
```

**Photo upload** : `downloadAndUploadPhoto` essaie `photos[0].full_size_url` → fetch (timeout 10s, 1 retry) → upload `card-photos/${randomId()}.jpg`. Fallback `photos[1]`, `photos[2]` si 404. Retourne `null` si toutes échouent.

## 5. Composants UI

### 5.1 `components/import/VintedImportFlow.tsx` (client)

```ts
type Phase =
  | { kind: 'paste-curl' }
  | {
      kind: 'select-cards';
      items: VintedItem[];
      skipped: number;
      enriched: Map<string, EnrichedCard | null>;
      selected: Set<string>;
      manualOverrides: Map<string, ParsedListing>;
    }
  | { kind: 'committing'; total: number; done: number }
  | { kind: 'done'; created: number; failed: ImportFailure[] };
```

State machine :

- **`paste-curl`** : `<textarea rows={10}>` + bouton "Récupérer mes annonces". Submit → `POST /fetch` → si OK transition `select-cards`, fire-and-forget `POST /preview` en background.
- **`select-cards`** : `<VintedImportTile>` grille. Sticky bottom bar avec count + bouton "Importer X cartes" → transition `committing`.
- **`committing`** : progress bar simple, pas de cancel. Sequential POST commit.
- **`done`** : récap "X importées · Y échecs", accordion failures avec raisons, lien `/vinted`. Bouton "Réessayer ces N échecs" (re-déclenche commit avec failed seulement).

### 5.2 `components/import/VintedImportTile.tsx`

Tile :

```
┌──────────────────────┐
│  [✓]    [📷 photo]   │
│                      │
│  Pikachu V           │
│  jpn_s9-31 · NM      │
│  €5,50 · 6m en ligne │
│  [Édit manuel]       │
└──────────────────────┘
```

Couleurs border :
- Vert subtle (`border-rarity-uc/30`) — parsed OK + enriched OK
- Jaune (`border-rarity-r/40`) — parsed OK, enriched fail (catalogue raté)
- Orange (`border-rarity-ar/50`) — parsed partial → édit manuel requis
- Désaturé `opacity-40` si décoché

Photo click → `<CardZoomModal>` existant.
Bouton "Édit manuel" → modal avec `<CardScanForm>` en mode prefill (props `initialOcr` + `initialEnrich` existants depuis Phase 3b2). Save dans la modal écrit dans `manualOverrides` du parent — pas d'INSERT direct, l'INSERT se fait à la phase commit.

## 6. Error handling & edge cases

### Phase 1 (fetch)

| Cas | Comportement |
|---|---|
| Curl mal formé | 400 + message "Copie depuis Chrome F12 → Network → click droit /api/v2/users/.../items → Copy as cURL" |
| Cookie expiré (401 Vinted) | 401 + "Re-login sur vinted.fr et copie un nouveau curl" |
| Cloudflare/DataDome 403 | 503 + "Vinted bloque la requête, attends 1-2 min" |
| Rate-limit 429 | Backoff exponentiel 3 retries (1s, 2s, 4s) puis 503 |
| Timeout >30s par page | Retourne items collectés + flag `partial: true` |

### Phase 2 (preview)

- Echec d'enrichissement sur 1 item → tile reste jaune, item sélectionnable (sera importé sans `card_id_tcg`).
- Pas de blocage UI : tout best-effort.

### Phase 3 (commit)

| Cas | Comportement |
|---|---|
| Photo CDN 404 | Fallback `photos[1]`, `photos[2]`. Si tout 404 → INSERT card sans `image_url`, push dans `failed[]` reason `photo_unavailable` mais carte créée |
| Photo download timeout >10s | Retry 1× puis fallback ci-dessus |
| Storage upload fail | Skip, push `failed[]` reason `storage_upload_failed`, PAS d'INSERT card |
| INSERT cards conflict `one_for_sale_per_group` | Skip, reason `duplicate_for_sale` (re-run safe) |
| INSERT card_listings PK violation | Skip, reason `listing_already_exists` |
| Supabase down mid-import | Pas de transaction globale, ce qui est INSERT reste INSERT. Re-cliquer "Réessayer" — idempotent grâce aux skips |

### Idempotence garantie par

- Index partiel `one_for_sale_per_group` empêche les doublons de cards en vente
- PK `(card_id, user_id)` sur `card_listings` empêche les doublons de listings
- Skips silencieux dans `failed[]` avec raison explicite, pas de crash

### Logging

- Côté serveur : `console.info('[import-vinted]', ...)` pour chaque page paginée + chaque INSERT + chaque skip
- Pas de table `import_log` dédiée (one-shot)
- Failures retournées à l'UI, pas persistées

## 7. Tests

### Helpers purs (vitest)

| Fichier | Tests | Cas |
|---|---|---|
| `lib/utils/parse-vinted-curl.test.ts` | 4 | curl complet · sans cookie · pas Vinted · escapes Windows |
| `lib/utils/parse-vinted-listing.test.ts` | 8 | titre seul · desc seule · les 2 · langue inconnue · `chn_*` lowercase · NM par défaut · "Près du Mint" détecté · regex partial fail |
| `lib/utils/map-vinted-to-card.test.ts` | 3 | enriched complet · sans enriched (fallback parser) · listed_at depuis `created_at_ts` |

### Routes API (vitest avec mock `fetch`)

| Fichier | Tests | Cas |
|---|---|---|
| `app/api/import/vinted/fetch/route.test.ts` | 5 | mock 2 pages · stop à `total_pages` · 401 propage · curl invalide → 400 · 5 items dont 2 lots → 3 + skipped=2 |
| `app/api/import/vinted/commit/route.test.ts` | 5 | INSERT happy path · conflict 23505 → failed sans crash · photo 404 → fallback puis null · auth.uid() bien stamped |

**Total** : ~25 nouveaux tests. Cible : **302 → ~327 tests passing**.

### Pas de tests UI

Cohérent avec le projet (aucun test composant React aujourd'hui, tests E2E Playwright déférés depuis Phase 1.13).

## 8. Recap livrables

### Fichiers créés

- `app/(app)/import/vinted/page.tsx`
- `app/api/import/vinted/fetch/route.ts` + test
- `app/api/import/vinted/preview/route.ts`
- `app/api/import/vinted/commit/route.ts` + test
- `components/import/VintedImportFlow.tsx`
- `components/import/VintedImportTile.tsx`
- `lib/utils/parse-vinted-curl.ts` + test
- `lib/utils/parse-vinted-listing.ts` + test
- `lib/utils/map-vinted-to-card.ts` + test
- Type partagé `lib/types/vinted-import.ts` (VintedItem, ImportFailure, etc.)

### Fichiers modifiés

- `app/(app)/options/page.tsx` — ajouter un lien discret vers `/import/vinted`
- `CLAUDE.md` — ajouter une ligne dans la table Architecture pour la nouvelle page
- `docs/phases-summary.md` — section "Phase 4 closeout — Import Vinted" en bas

### Pas modifié

- `lib/api/enrich/route.ts` — réutilisé tel quel via fetch interne
- `components/submit/CardScanForm.tsx` — réutilisé via props `initialOcr`/`initialEnrich` Phase 3b2 existants
- `components/vinted/CardZoomModal.tsx` — réutilisé tel quel
- Aucune migration DB

### Aucune modification de schéma

Réutilise `cards` + `card_listings` existantes. L'index partiel `one_for_sale_per_group` et la PK `(card_id, user_id)` garantissent l'idempotence du re-run.

## 9. Hors scope (non livré dans cette feature)

- **Lots Vinted** : skip silencieux, l'user les re-saisira manuellement via `LotForm` si besoin.
- **Articles non-cartes** (vêtements, etc.) : skip silencieux.
- **Variants** (Poké Ball, Master Ball, Reverse Holo, Stamp, Promo) : laissés `null` à l'import. L'user édite après coup via l'UI Vinted/Stock si besoin.
- **Multi-user** : seul le user logué peut importer ses propres listings. Hilyna fera son propre import si elle a aussi des annonces (mais le flow validé est : Hisshiden importe d'abord, Hilyna nettoie son Vinted et re-publie via toggle).
- **Persistence du log d'import** : pas de table `import_log`. Le récap final disparaît à la sortie de la page.
