# Phase 3c — Bulk vendu + Gemini tokens optimization

**Date** : 2026-05-03
**Statut** : Spec validé, prêt à planning
**Phase précédente** : 3b2 v2 (Bulk import web, 242 tests)
**Périmètre** : 2 features indépendantes livrées ensemble :
1. **Bulk vendu** : sélection multi-cartes/lots dans `/vinted` → division prix total → marquage vendu groupé
2. **Gemini tokens optimization** : audit du coût + raccourcissement prompt + cap output + display debug UI

**Brief utilisateur** : [PHASE_3.md](../../../PHASE_3.md)

---

## 1. Contexte et motivation

### Bulk vendu

Aujourd'hui, marquer une carte comme vendue se fait individuellement via le bouton "Vendu" sur chaque `VintedRow`. Cas réel : l'utilisateur vend un paquet de 4 cartes ensemble à un acheteur Vinted pour un prix total négocié. Il doit aujourd'hui :
1. Cliquer "Vendu" sur la 1ère carte → estimer son prix individuel → confirmer
2. Répéter ×3 pour les autres cartes
3. Garder en tête le total + faire la division mentalement

**Friction** : 4 modales à valider, math mental, risque d'oubli si un acheteur prend 2 cartes + 1 lot. Bulk vendu résout ça avec une sélection multi-items + 1 modale qui répartit le prix.

### Gemini tokens optimization

L'OCR Gemini est la **seule ligne facturée** du projet. Aujourd'hui :
- Aucun monitoring du coût réel par scan (on a une estimation théorique dans `phases-summary.md` mais pas de mesure live)
- `usageMetadata` (présent dans la réponse Gemini) n'est pas extrait
- Le prompt fait ~500 tokens (verbosité accumulée au fil des itérations)
- Pas de `maxOutputTokens` → Gemini peut produire un JSON verbeux si la carte est ambiguë

**Objectif** : visualiser le coût réel par scan pour identifier les abus (re-scans inutiles, photos trop grosses, etc.) et compresser le prompt sans dégrader la qualité.

---

## 2. Objectifs et non-objectifs

### Objectifs

1. **Bulk vendu** : `/vinted` permet de sélectionner N items (cards ET lots), entrer un prix total, et marquer tous comme vendus avec sold_price réparti équitablement.
2. **Logging Gemini** : chaque appel `extractCardFromImage` log un résumé `[Gemini] {in}in / {out}out / {img}img — €X.XXXXXX`.
3. **Champ `_usage`** dans `OcrResult` propagé jusqu'au `CardScanForm`, affiché en debug discret (visible aussi dans le batch tab puisque c'est le même composant).
4. **Prompt raccourci** : ~500 → ~300 tokens, sans perte d'accuracy sur les 28/30 cas qui marchent.
5. **Cap `maxOutputTokens: 300`** pour éviter les dérives de verbosité.

### Non-objectifs

- ❌ **Pas de bulk vendu sur `/stock`** (Stock n'a pas de notion de "vente", on ne peut pas sold un item collection sans le passer en for_sale d'abord).
- ❌ **Pas de nouvel endpoint API** pour le bulk vendu (sequential PATCH côté client suffit).
- ❌ **Pas de persistance des tokens consommés en DB** — purement informatif (logging console + UI debug). La persistance pour le dashboard Phase 5 sera traitée séparément.
- ❌ **Pas de rate-limit côté client** (les ~5-10 PATCH séquentiels sont rapides, < 2s, et Vercel/Supabase n'ont pas de limite stricte sur ce volume).
- ❌ **Pas de modification du fallback Google Vision** (le `_usage` n'existe que si la branche Gemini a réussi).
- ❌ **Pas de switch vers Gemini Pro** ou autre modèle (le débat tarif a été tranché, on reste Flash Preview).
- ❌ **Pas de templates multiples** pour le prompt (un seul prompt, raccourci une bonne fois pour toutes).

---

## 3. Architecture — Bulk vendu

### 3.1 Vue d'ensemble

```
[/vinted page]
       ↓
[Bouton "Sélection multiple"] — toggle dans la barre de filtres
       ↓ (mode 'selection')
[Checkboxes apparaissent sur chaque VintedRow + LotRow]
[Boutons individuels "Annonce"/"Vendu" disabled]
       ↓ (user coche N items)
[<BulkSelectionBottomBar>] — fixed bottom, "N items sélectionnés · [Vendre]"
       ↓
[<BulkSoldModal>] — liste items + prix total + date + preview "X.XX € par item"
       ↓ (Confirmer)
[Boucle séquentielle : PATCH /api/cards/[id] OU /api/lots/[id] avec status='sold' + sold_price + date_sold]
       ↓
[Toast récap : "N items vendus à X.XX € chacun (Y restock alerts)"]
[Reset selection mode + refresh de la liste]
```

### 3.2 Composants

#### `<BulkSelectionToggle>` (small, dans `<VintedFilters>`)

Bouton à côté des chips Type. Texte : "Sélection multiple" / "Annuler la sélection". Icône `CheckSquare` Lucide. Toggle un état `selectionMode: boolean` géré par le parent `VintedList`.

#### `<BulkSelectionBottomBar>` (nouveau composant)

Position : `fixed bottom-0 left-0 right-0`, slide-in depuis le bas. Contenu :
- Compteur : `"3 cartes · 1 lot · 4 items au total"` (typage : si que cards → "3 cartes", si que lots → "2 lots", si mix → "X cartes · Y lots · Z items au total")
- Bouton primaire : `[Vendre la sélection (4)]` en `bg-red text-bg`
- Bouton secondaire : `[Annuler]` (vide la sélection, reste en mode selection)
- Z-index au-dessus de la `BottomNav` mobile (vérifier qu'elle ne chevauche pas — sur mobile, peut-être lift la BottomNav)

#### `<BulkSoldModal>` (nouveau composant, similaire à `<SoldModal>` existant)

Header : "Vente groupée — N items"

Body :
- Mini-liste scrollable des items (hauteur max 240px) :
  - Pour chaque card : thumb 40×56 + nom + langue/condition
  - Pour chaque lot : thumb (1ère photo) + nom + badge "Lot" violet
- Champ **"Prix total reçu (€)"** (input number, required, > 0)
- Champ **"Date de vente"** (input date, default `today` ISO)
- **Live preview** : `"X.XX € par item"` calculé via `splitPrice(total, n)`
- Footer : `[Annuler]` `[Confirmer la vente]`

Bouton "Confirmer" loading state (spinner) pendant la boucle PATCH. Désactivé si total ≤ 0.

#### Helper pur `lib/utils/split-bulk-price.ts`

```ts
/**
 * Split a total price equally across N items (in cents to avoid floats).
 * The LAST item gets the remainder so the sum matches the total exactly.
 *
 * splitPrice(100, 4) → [25, 25, 25, 25]
 * splitPrice(100, 3) → [33.33, 33.33, 33.34]
 * splitPrice(0, 5)   → [0, 0, 0, 0, 0]
 * splitPrice(80, 1)  → [80]
 * splitPrice(50, 0)  → throws (caller must guard)
 */
export function splitPrice(total: number, n: number): number[];
```

Logique : convertir en cents (`Math.round(total * 100)`), faire division entière + reste, le reste va sur le dernier.

### 3.3 Logique côté `<VintedList>`

Nouveaux states :
- `selectionMode: boolean` (default false)
- `selectedIds: Set<string>` (default empty Set, contient ids `card.id` ou `lot.id`)

Quand `selectionMode = true` :
- Toutes les rows reçoivent un nouveau prop `selected: boolean` + `onToggleSelect: () => void`
- Les boutons "Annonce" / "Vendu" individuels sont disabled (`actionsDisabled` prop)
- Si `selectedIds.size > 0`, render `<BulkSelectionBottomBar>` qui slide-in

Click "Vendre la sélection" → ouvre `<BulkSoldModal>` avec la liste des items selectionnés. Confirmer → handler async :

```typescript
async function handleBulkSold(totalPrice: number, dateSold: string, items: SelectedItem[]) {
  const prices = splitPrice(totalPrice, items.length);
  const results: BulkResult[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const sold_price = prices[i];
    try {
      const endpoint = item.kind === 'card'
        ? `/api/cards/${item.id}`
        : `/api/lots/${item.id}`;
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status: 'sold',
          sold_price,
          date_sold: new Date(`${dateSold}T12:00:00Z`).toISOString(),
        }),
      });
      const json = await res.json();
      results.push({ id: item.id, kind: item.kind, ok: res.ok, restock: json.restock, promote: json.promote, error: res.ok ? null : (json.error ?? 'unknown') });
    } catch (e) {
      results.push({ id: item.id, kind: item.kind, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}
```

### 3.4 Récap toast / état post-bulk

Après la boucle :
- Update local state : pour chaque succès, marquer la card/lot comme `status='sold'` (mêmes mutators existants `setCards` / `setLots`)
- Trigger un seul toast récap : `"4 vendus à 25.00 € chacun"`. Si erreurs : `"3 vendus, 1 échec"`. Si restock : ajouter sub-text `"2 alertes restock — voir Pokédex"`.
- Restock individuels : on n'ouvre PAS le `<RestockToast>` 4 fois (overload). Les flags sont noté dans le toast récap, l'user peut aller voir `/pokedex` lui-même.
- Promote (carte Stock candidate à promouvoir for_sale après vente) : aussi aggregated dans le toast, pas d'ouverture de `<PromoteAfterSoldModal>` (trop intrusif en bulk). L'user le verra au prochain scan ou via Stock.
- Quitte automatiquement le mode `selection`, vide `selectedIds`.

### 3.5 Edge cases

| Cas | Comportement |
|---|---|
| 0 items sélectionnés | Bottom-bar cachée, modale ne peut pas s'ouvrir |
| 1 seul item sélectionné | Modale s'ouvre quand même (UX cohérent), `splitPrice(100, 1) = [100]` |
| Total = 0 | Bouton "Confirmer" disabled |
| Total très petit (ex: 1€ pour 100 items) | OK, `splitPrice(1, 100) = [0.01, ..., 0, ..., 0.01]` (premiers items 1¢, derniers 0). Le user verra le preview avant de confirmer. |
| Filter change pendant selection | La sélection persiste sur les ids, mais les items hors filtre disparaissent visuellement. Au confirm, on traite tous les ids même hors filtre. |
| User passe en mode `selection` puis clique sur un toggle Vinted (`<VintedListedToggle>`) | Le toggle reste fonctionnel (pas disabled — c'est juste les boutons Annonce/Vendu qui sont disabled, pour pas confondre avec le bulk). |
| Mode selection + click sur thumb image (zoom) | Le zoom marche toujours (ouverture `<CardZoomModal>` existante). |

---

## 4. Architecture — Gemini tokens optimization

### 4.1 Modifs `lib/api/gemini-vision.ts`

#### Constantes (en haut du fichier)

```ts
const PROMPT_TOKEN_ESTIMATE = 300;  // mesuré après raccourcissement, à ajuster post-implem
const COST_USD_PER_M_INPUT = 0.075;
const COST_USD_PER_M_OUTPUT = 0.30;
const USD_TO_EUR = 0.92;
```

#### Raccourcissement du prompt

Le prompt actuel fait ~500 tokens (1717 chars). Cibles de réduction (sans perte de fonctionnalité) :
- Supprimer les paraphrases redondantes ("Pas deviner, lire ce qui est imprimé" répété)
- Compacter les exemples : 1 exemple par champ au lieu de 2-3
- Garder TOUTES les règles métier critiques :
  - Format `set_code` exact (sensible casse)
  - Zéros initiaux à enlever sur `set_number`
  - Distinction Trainer/Energy/Stadium pour `pokemon_number = null`
  - Suffixes `ex/V/VMAX` sur `card_name` mais pas sur `pokemon_name`
  - JP→FR via `pokemon_name_fr`, `set_name_fr`

Cible : ~250-300 tokens pour le prompt texte seul (sans l'image). À mesurer après raccourcissement et hardcoder dans `PROMPT_TOKEN_ESTIMATE`.

#### Ajout `maxOutputTokens`

```ts
generationConfig: {
  temperature: 0,
  responseMimeType: 'application/json',
  responseSchema: SCHEMA,
  maxOutputTokens: 300,  // sécurité contre verbosité
}
```

#### Extraction usageMetadata

Après `data = await response.json()` :

```ts
let usage: GeminiUsage | undefined;
const meta = (data as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } }).usageMetadata;
if (meta && typeof meta.promptTokenCount === 'number' && typeof meta.candidatesTokenCount === 'number') {
  const tokens_in = meta.promptTokenCount;
  const tokens_out = meta.candidatesTokenCount;
  const tokens_image = Math.max(0, tokens_in - PROMPT_TOKEN_ESTIMATE);
  const cost_usd = (tokens_in * COST_USD_PER_M_INPUT + tokens_out * COST_USD_PER_M_OUTPUT) / 1_000_000;
  const cost_eur = cost_usd * USD_TO_EUR;
  usage = { tokens_in, tokens_out, tokens_image, cost_eur };
  console.log(`[Gemini] ${tokens_in}in / ${tokens_out}out / ${tokens_image}img — €${cost_eur.toFixed(6)}`);
}
```

#### Signature retour

```ts
export interface GeminiUsage {
  tokens_in: number;
  tokens_out: number;
  tokens_image: number;  // estimated, not exact (Gemini doesn't break it down)
  cost_eur: number;
}

export interface GeminiCardExtraction {
  // ...existing fields...
  _usage?: GeminiUsage;  // optional, absent if usageMetadata not in response
}
```

### 4.2 Propagation `/api/ocr/route.ts` → CardScanForm

#### Type `OcrResult` (`lib/types/index.ts`)

Ajouter le champ optionnel :

```ts
export interface OcrResult {
  // ...existing fields...
  _usage?: GeminiUsage;
}
```

#### `/api/ocr/route.ts`

Inclure `_usage` dans la réponse JSON quand Gemini a retourné usage. Pas de _usage si fallback Google Vision (Vision ne fournit pas ces métriques).

#### `CardScanForm.tsx`

Trouver la zone "OCR fiable / OCR à vérifier" (autour de la ligne 769). Ajouter en bas de ce bloc :

```tsx
{ocr._usage && (
  <>
    <hr className="border-border my-2" />
    <p className="text-text-faint text-xs font-mono">
      {ocr._usage.tokens_in} in · {ocr._usage.tokens_out} out · ~{ocr._usage.tokens_image} img · €{ocr._usage.cost_eur.toFixed(6)}
    </p>
  </>
)}
```

Le composant `CardScanForm` est utilisé par le scanner mobile ET par la batch tab (Phase 3b2 v2 refactor) — donc le debug apparaît dans les 2 endroits gratuitement.

### 4.3 Estimation impact

| Métrique | Avant | Après | Gain |
|---|---|---|---|
| Prompt tokens (texte) | ~500 | ~300 | 40% |
| Output tokens cap | illimité (en pratique ~50) | 300 max | safety net |
| Image tokens (1600px) | ~600-800 | inchangé | 0 |
| Coût estimé / scan (image 1600px) | ~$0.000060 | ~$0.000045 | ~25% |

Le **vrai gain** n'est pas le 25% sur le prompt — c'est la **visibilité** sur le coût réel pour identifier :
- Re-scans inutiles (user qui spam le bouton "Re-rechercher")
- Photos anormalement grosses (resize qui n'a pas marché → image tokens explose)
- Cas où le coût/scan dépasse une borne raisonnable

---

## 5. Tests

### 5.1 Helpers purs

| Fichier | Cas | Volume |
|---|---|---|
| `lib/utils/split-bulk-price.test.ts` | total=100, n=4 → [25,25,25,25] / total=100, n=3 → [33.33, 33.33, 33.34] / total=0 → tous 0 / n=1 → [total] / n=0 throws / total avec floats (12.345 round to cents) | 6 tests |

### 5.2 Endpoints / API

Aucun nouveau endpoint. Les tests existants `app/api/cards/[id]/route.test.ts` et `app/api/lots/[id]/route.test.ts` couvrent déjà le PATCH avec status='sold'.

### 5.3 Gemini

`lib/api/gemini-vision.test.ts` (existant) : ajouter 2 tests
- "extracts _usage from response when usageMetadata is present" : mock fetch avec `usageMetadata: { promptTokenCount: 350, candidatesTokenCount: 80, totalTokenCount: 430 }` → assert `_usage.tokens_in === 350`, `_usage.tokens_image === 50`, `_usage.cost_eur > 0`
- "_usage is absent when usageMetadata is missing" : mock fetch sans `usageMetadata` → assert `_usage === undefined`, le reste du résultat reste valide

### 5.4 UI

Pas de tests sur les composants React (cohérent avec la convention projet). Smoke test à la main sur les flows :
- Scanner mobile : voir la ligne `[Gemini]` en console + le debug `{in} in · {out} out` sous le snippet OCR
- Batch tab : idem (chaque carte du batch montre son debug)
- Bulk vendu : sélectionner 3 cartes for_sale + 1 lot for_sale → "Vendre" → entrer 100€ → confirm → vérifier que 4 items sont passés en sold avec sold_price = 25.00€ (et 25.01€ pour le dernier si arrondi)

**Total nouveaux tests : ~8** (242 → 250).

---

## 6. Erreurs / fallbacks

| Erreur | Comportement |
|---|---|
| Bulk : un PATCH échoue mid-loop | Continue les autres, collect les erreurs, toast récap "3 vendus, 1 échec : Pikachu (réseau)" |
| Bulk : tous les PATCH échouent | Toast erreur "0 vendus, vérifier la connexion" |
| Bulk : user ferme la modale pendant la boucle | La boucle se termine quand même (Promise en cours), mais l'UI reset au mode selection |
| Gemini : `usageMetadata` absent (vieille version API ou erreur) | `_usage` est undefined, pas de log, pas de display UI. Le reste du flow OCR n'est pas affecté. |
| Gemini : `maxOutputTokens` atteint (réponse tronquée) | JSON parse échoue → la fonction retourne null → fallback Vision. Pas pire qu'avant. À monitorer en prod via les logs. |
| Gemini : prompt raccourci dégrade l'accuracy | À détecter via le bench `scripts/test-bench-gemini.ts` (à re-runner après la modif). Si chute > 5%, revenir au prompt précédent. |

---

## 7. Volume estimé

| Bloc | Jours |
|---|---|
| Helper `splitPrice` + tests | 0.25 |
| `<BulkSelectionToggle>` dans VintedFilters | 0.25 |
| `<BulkSelectionBottomBar>` + state mgmt VintedList | 0.5 |
| `<BulkSoldModal>` + integration | 0.75 |
| Bulk handler côté VintedList (boucle PATCH + récap toast) | 0.5 |
| Gemini : raccourcir prompt + measure PROMPT_TOKEN_ESTIMATE | 0.5 |
| Gemini : usage extraction + cost calc + tests | 0.5 |
| Gemini : propagation `_usage` jusqu'au UI debug ligne | 0.25 |
| Re-bench Gemini après prompt raccourci (sanity) | 0.25 |
| Lint + build + smoke test | 0.25 |
| **Total** | **~4 jours** |

---

## 8. Critères de succès

- [ ] `npm test` : 250/250 (242 baseline + 6 splitPrice + 2 Gemini usage)
- [ ] `npm run lint` : 0 warning
- [ ] `npm run build` : 0 type error
- [ ] `/vinted` : bouton "Sélection multiple" visible, click → mode selection actif, checkboxes apparaissent
- [ ] Sélectionner 3 cartes + 1 lot → bottom-bar `"3 cartes · 1 lot · 4 items au total · [Vendre la sélection (4)]"`
- [ ] Click "Vendre" → modale avec liste des 4 items, input "Prix total" + "Date" + preview "X.XX € par item"
- [ ] Confirmer 100€ → 4 items passent en sold, sold_price = 25.00 (3 premiers) + 25.00 (le dernier, total exact)
- [ ] Toast récap visible
- [ ] Scanner mobile : après un scan, ligne debug `{in} in · {out} out · ~{img} img · €X.XXXXXX` visible sous le snippet OCR
- [ ] Console contient `[Gemini] {in}in / {out}out / {img}img — €X.XXXXXX` après chaque scan
- [ ] Batch tab : chaque carte du batch affiche son debug Gemini
- [ ] Bench `scripts/test-bench-gemini.ts` passe à ≥ 28/30 (pas de régression accuracy après raccourcissement prompt)

---

## 9. Suite

### Phase 4 (suivante)

Multi-user (RLS Supabase) + Import one-shot du profil Vinted existant. Brief : [PHASE_4.md](../../../PHASE_4.md).

### Phase 5

Dashboard avec **tracking des tokens consommés et coût/jour** — utilisera la base posée en Phase 3c (`_usage` exposé) pour l'historiser en DB et l'afficher.

### Followups différés (non-bloquants)

1. **Persister `_usage` en DB** pour le dashboard Phase 5 — table `gemini_usage_log` ou colonne JSONB sur `cards` (à brainstormer Phase 5).
2. **Conversion EUR live** au lieu de hardcoder `USD_TO_EUR = 0.92` (call à un endpoint de change). YAGNI pour l'instant, le taux change peu.
3. **Bulk vendu sur Stock** (pour vendre des items collection en bloc en passant par for_sale temporaire). YAGNI.
4. **Bulk autres actions** (bulk delete, bulk move to Stock, bulk re-list). À évaluer après usage réel du bulk vendu.
5. **Alertes coût** quand un scan dépasse un seuil (ex: > 5¢) — pourrait indiquer une photo anormalement grosse.
6. **Cache prompt Gemini** : la doc Gemini mentionne du context caching qui réduirait encore le coût. Probablement pas dispo sur Flash Preview, à vérifier.
