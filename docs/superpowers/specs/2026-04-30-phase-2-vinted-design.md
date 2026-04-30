# Phase 2 — Module Vinted (design)

**Date :** 2026-04-30
**Statut :** Design validé, prêt pour implémentation
**Spec source :** [context.md §5.3](../../../context.md), [phase1-summary.md §Prochaine étape](../../phase1-summary.md)

---

## Objectif

Construire le module Vinted : liste FIFO des cartes `status='for_sale'`, action "Vendu" avec alerte restock, et générateur d'annonce (titre + description prêts à coller).

À la sortie de Phase 2, l'utilisateur peut :

1. Voir toutes ses cartes à vendre triées FIFO, groupées par doublon (clé incluant `variant`).
2. Rechercher / filtrer par langue, rareté, variant, statut Pokédex.
3. Éditer le prix suggéré inline (en attendant le cron Cardmarket Phase 3).
4. Marquer une carte vendue avec prix optionnel, et recevoir une alerte si c'est la dernière carte d'un Pokémon enregistré au Pokédex.
5. Générer un titre Vinted ≤ 80 caractères + une description complète, avec photo et image TCG côte à côte pour la mise en ligne.

---

## Décisions d'arbitrage (validées)

| Sujet | Décision |
|---|---|
| Clé de groupement doublons | `card_id_tcg + language + condition + variant` — variant inclus car valeur Vinted distincte |
| Action "Vendu" | Modal toujours (prix optionnel, skippable en 1 Enter) |
| Annonce UI | Modal (pas drawer ni page dédiée) |
| Prix manquants | Champ éditable inline, persiste en DB via `PATCH /api/cards/[id]` |
| Format titre | Smart truncate avec ordre de chute défini |
| Alerte restock | Toast éphémère 5s avec lien vers `/pokedex` |

---

## Architecture

### Pattern : RSC + îlot client

Identique au Pokédex : la page server fetche tout en une fois (cards + config + set des registered), passe à un orchestrateur client qui gère filtres, recherche, groupement et modals.

Justification : volumes attendus (quelques centaines de cartes) tiennent largement en mémoire client, comme la grille Pokédex de 1025 cellules. Évite un endpoint `GET` superflu.

### Structure de fichiers

```
app/(app)/vinted/page.tsx            # RSC: fetch initial → <VintedList>
app/api/cards/[id]/route.ts          # NEW — PATCH carte (status, prix, vendu)

components/vinted/
  VintedList.tsx                     # Client orchestrateur (search, filtres, groupement)
  VintedRow.tsx                      # Une ligne (carte ou groupe)
  VintedFilters.tsx                  # Search + chips (langue, rareté, variant, registered)
  EditablePriceCell.tsx              # Input prix inline
  SoldModal.tsx                      # Modal vendu
  AnnonceModal.tsx                   # Modal annonce
  RestockToast.tsx                   # Toast éphémère post-vente

lib/utils/
  vinted-template.ts (+ .test.ts)    # Pure: buildTitle/buildDescription + smart truncate
  group-cards.ts (+ .test.ts)        # Pure: clé de groupement + tri FIFO intra-groupe
```

### DB

**Aucune migration nécessaire.** Toutes les colonnes existent déjà dans la migration initiale `20260425224142_initial_schema.sql` et la migration variant `20260429142350_add_cards_variant.sql` :

- `status`, `sold_price`, `date_sold`, `suggested_price`, `cm_price_*`, `cm_updated_at`
- `variant` (Phase 1.13)
- `lot_id`, `date_added`, `notes`

---

## Data flow

### Page server (RSC)

```ts
// app/(app)/vinted/page.tsx
const supabase = await createClient();

const [{ data: cards }, { data: registered }, { data: configRows }] = await Promise.all([
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

const registeredSet = new Set(registered?.map(r => r.pokemon_number) ?? []);
const config = Object.fromEntries(configRows?.map(r => [r.key, r.value]) ?? []);

return <VintedList cards={cards ?? []} registered={registeredSet} config={config} />;
```

### Client orchestrateur

`VintedList` maintient :

- `cards` (state local, init depuis props) — source de vérité pendant la session, permet optimistic updates
- `searchQuery` (debounced 300ms)
- `filters: { language?, rarity?, variant?, registered? }`
- `selectedCardForSold`, `selectedCardForAnnonce` (modal control)
- `restockAlert` (state pour `<RestockToast>`)

Pipeline de rendu :

```
cards
  → filterBySearch(searchQuery)
  → filterByChips(filters, registeredSet)
  → groupByKey()                       // clé = card_id_tcg + language + condition + variant
  → assignFifoPosition()               // #1, #2, ...
  → render <VintedRow>
```

Mutations :

- Édit prix inline → `PATCH /api/cards/[id] { suggested_price }` → mise à jour state local
- "Vendu" → ouvre `<SoldModal>` → submit → `PATCH /api/cards/[id] { status: 'sold', sold_price?, date_sold: now }` → si réponse `restock !== null` → set `restockAlert` → optimistic remove de la carte du state local

---

## API : `PATCH /api/cards/[id]`

### Corps de requête (JSON)

```ts
{
  status?: 'sold' | 'for_sale' | 'collection',
  sold_price?: number | null,
  date_sold?: string | null,        // ISO timestamp
  suggested_price?: number | null,
  cm_price_low?: number | null,
  cm_price_trend?: number | null,
  cm_price_avg?: number | null,
  notes?: string | null,
}
```

### Validation

- Auth via Supabase (401 sinon)
- `id` valide UUID (400 sinon)
- `status` ∈ {`sold`, `for_sale`, `collection`} (`pokedex` interdit ici — passe par `/api/pokedex/replace`)
- Nombres positifs ou null
- 404 si carte n'existe pas

### Logique restock

Si la requête fait passer `status` à `'sold'`, après l'update :

```ts
const [{ data: stillForSale }, { data: hasPokedex }] = await Promise.all([
  supabase
    .from('cards')
    .select('id')
    .eq('pokemon_number', card.pokemon_number)
    .eq('status', 'for_sale')
    .limit(1),
  supabase
    .from('cards')
    .select('id, pokemon_name')
    .eq('pokemon_number', card.pokemon_number)
    .eq('status', 'pokedex')
    .maybeSingle(),
]);

const restock = (stillForSale?.length === 0 && hasPokedex)
  ? { pokemon_number: card.pokemon_number, pokemon_name: hasPokedex.pokemon_name }
  : null;
```

### Réponse

```ts
{
  card: Card,                      // carte mise à jour
  restock: { pokemon_number, pokemon_name } | null
}
```

---

## Groupement & tri

### Clé de groupement (pure fn)

```ts
function groupKey(card: Card): string {
  const id = card.card_id_tcg
    ?? `${card.pokemon_number}-${card.set_code ?? '?'}-${card.set_number ?? '?'}`;
  const variant = card.variant ?? 'standard';
  return `${id}|${card.language}|${card.condition}|${variant}`;
}
```

### Tri

- **Inter-groupes** : `date_added ASC` de la première carte de chaque groupe (FIFO global)
- **Intra-groupe** : `date_added ASC` — la "tête" du groupe (carte affichée + cible du bouton "Vendu") est la plus ancienne
- **Position globale** `#1, #2, ...` calculée après filtres+groupement

### Comportement "Vendu" sur un groupe

Le bouton vise toujours la tête du groupe (1re carte FIFO). Après confirmation :

- Si `groupSize > 1` → décrément `×N` localement, la 2e carte devient la nouvelle tête
- Si `groupSize === 1` → ligne supprimée du state
- Restock vérifié serveur-side, indépendant du groupement

---

## Affichage de ligne

### Layout `<VintedRow>`

```
[#3] [📷 thumb 60×84] [card_name + variant chip]              [×3] [💰 12,50 € ✏️] [Annonce] [Vendu]
                     [set_name (set_code) — set_number]
                     [🇯🇵 JP · SAR · NM]  [Registered ✓ / Not registered]
```

### Détails

- **Thumb** : `image_url` (Storage) > `tcg_image_url` (TCGdex) > placeholder PokeAPI sprite via `pokemon_number`
- **Variant chip** : visible uniquement si `variant !== null`. Couleur dépendant du variant (Poké Ball / Master Ball / Reverse Holo / Promo) — palette à définir dans le composant
- **Badge `×N`** : visible uniquement si `groupSize > 1`
- **Badge "Registered ✓"** (doré) si `registeredSet.has(pokemon_number)`, sinon "Not Registered" (vert). **Cliquable** → ouvre le `<PokedexDrawer>` existant
- **Prix** : `<EditablePriceCell>` — `12,50 €` en doré, hover → icône ✏️, clic → input inline (Enter/blur sauvegarde, Escape annule)

### Filtres (`<VintedFilters>`, sticky top)

- Search input (debounce 300ms) — recherche normalisée NFD insensible aux accents sur : `set_number`, `card_name`, `pokemon_name`, `set_name`, `set_code`, `language`, `rarity`
- Chips cumulables : Langue (JP/EN/FR/...), Rareté (SAR/AR/...), Variant (Standard/Poké Ball/Master Ball/Reverse Holo/Promo), Toggle "Registered uniquement / Not registered uniquement"
- Compteur "X cartes (Y groupes) sur Z" en haut à droite

---

## Modals

### `<SoldModal>`

- **Trigger** : clic "Vendu" sur ligne ou groupe
- **Champs** :
  - `sold_price` (number input €, optionnel)
  - `date_sold` (date picker, default = today)
- **Boutons** : `Annuler` / `Confirmer la vente`
- **Action** :
  1. `PATCH /api/cards/[id]` (id = tête du groupe) avec `{ status: 'sold', sold_price?, date_sold }`
  2. Optimistic : décrément/remove la carte du state local
  3. Si `restock !== null` dans la réponse → `setRestockAlert(restock)` → `<RestockToast>` apparaît 5s

### `<AnnonceModal>`

- **Trigger** : clic "Annonce"
- **Layout** :
  - **Gauche** : photo Storage + image TCG côte à côte (référence visuelle)
  - **Droite** : titre éditable (textarea + compteur live `42/80`, rouge si > 80) + description éditable (textarea height-auto) + boutons copier
- **Bloc prix** :
  - Lecture seule : `Low / Trend / Avg / **Suggéré** (gras doré)`
  - Champ éditable "Prix de vente Vinted" qui persiste comme `suggested_price` à la fermeture du modal (PATCH si modifié)
- **Boutons** :
  - `📋 Copier le titre` (Clipboard API + toast feedback "Copié ✓")
  - `📋 Copier la description` (idem)
- **Pas de submit serveur** — modal sert juste à composer + copier

### `<RestockToast>`

- Apparaît 5s après une vente déclenchant un restock
- Message : `"⚠️ Plus de stock pour {pokemon_name}, ta carte Pokédex est exposée"`
- Lien `/pokedex#{pokemon_number}` (anchor) qui ouvre la grille à la cellule concernée

---

## Template Vinted (`lib/utils/vinted-template.ts`)

### `buildTitle(card, opts): string`

Smart truncate. Ordre de chute jusqu'à ≤ 80 chars :

```
1. Plein  : "{card_name_full_bilingual} — {set_name} — {rarity} — {language} — {variant?} — {condition}"
   ex: "Gruikui (チャオブー) ex — Combat de Maîtres — SAR — JP — Poké Ball — NM"

2. Drop bilingual paren : "Gruikui ex — Combat de Maîtres — SAR — JP — Poké Ball — NM"

3. Drop condition NM (NM = défaut implicite, on garde EX/GD/PL/PO) :
   "Gruikui ex — Combat de Maîtres — SAR — JP — Poké Ball"

4. set_name → set_code : "Gruikui ex — sv11 — SAR — JP — Poké Ball"

5. Drop set entier : "Gruikui ex — SAR — JP — Poké Ball"
```

**Invariants** : card_name + rarity + language + variant (si présent) sont **toujours** conservés.

### `buildDescription(card, config): string`

```
✨ {card_name_bilingual} — {rarity_label}
📦 Set : {set_name} ({set_code}) — N° {set_number}
{language_flag} Langue : {language_full}
⭐ État : {condition_full}
{🎨 Variant : {variant_label}     ← uniquement si variant !== null}

{config.vinted_shipping_note}
{config.vinted_seller_note}
```

### Mappings

```ts
const LANGUAGE_FLAGS: Record<CardLanguage, string> = {
  JP: '🇯🇵', EN: '🇬🇧', FR: '🇫🇷', DE: '🇩🇪', IT: '🇮🇹',
  ES: '🇪🇸', KO: '🇰🇷', PT: '🇵🇹', ZH: '🇨🇳',
};

const LANGUAGE_FULL: Record<CardLanguage, string> = {
  JP: 'Japonais', EN: 'Anglais', FR: 'Français', DE: 'Allemand',
  IT: 'Italien', ES: 'Espagnol', KO: 'Coréen', PT: 'Portugais', ZH: 'Chinois',
};

const CONDITION_FULL: Record<CardCondition, string> = {
  NM: 'Near Mint', EX: 'Excellent', GD: 'Good',
  PL: 'Played', PO: 'Poor',
};

// rarity_label : hardcodé dans le module (mirror exact de la table rarity_ranks)
const RARITY_LABEL: Record<CardRarity, string> = {
  SAR: 'Special Art Rare', AR: 'Art Rare', SR: 'Super Rare',
  CHR: 'Character Rare', RR: 'Double Rare', R_HOLO: 'Rare Holo',
  R: 'Rare', UC: 'Uncommon', C: 'Common', OTHER: 'Other',
};
```

---

## Tests

### Pure functions (Vitest)

`lib/utils/vinted-template.test.ts` :
- Titre court : format plein
- Titre > 80 : drop bilingual → drop condition NM → set_name → set_code → drop set
- Conserve toujours card_name + rarity + langue + variant
- Description avec/sans variant, avec/sans set_number
- Drapeaux + langues full pour les 9 langues
- Conditions full pour les 5 conditions

`lib/utils/group-cards.test.ts` :
- Variant standard vs Poké Ball → 2 groupes distincts
- `card_id_tcg` null → fallback composite key
- Tri intra-groupe FIFO (`date_added ASC`)
- Position globale (#1, #2, ...) après groupement

### API

`app/api/cards/[id]/route.test.ts` :
- 401 sans auth
- 400 sur status invalide ou nombres négatifs
- 404 sur carte inexistante
- PATCH `status='sold'` déclenche check restock (mock supabase)
- PATCH `suggested_price` seul ne touche pas le status
- Restock retourne `null` si pas de pokedex pour ce pokemon_number
- Restock retourne `null` s'il reste d'autres cartes for_sale

### Cible

~12-15 nouveaux tests Vitest (total projet : 116 → ~130). Lint + tsc verts.

---

## Edge cases

| Cas | Traitement |
|---|---|
| Vente d'un groupe ×3 → 2 restent | Optimistic decrement, head devient la 2e carte FIFO |
| `image_url` null + `tcg_image_url` null | Placeholder PokeAPI sprite via `pokemon_number` |
| `card_id_tcg` null (catalogue manqué) | Fallback grouping key composite |
| Restock après vente d'un groupe ×3 dont 2 restent | Pas de restock (count for_sale > 0) |
| Édit prix inline puis Annonce | Modal lit le prix à jour depuis le state local |
| Search avec accents (ex: "Gruikui" vs "gruïkui") | Normalisation NFD côté client |
| Carte sans `cm_price_*` | Affichage `—`, EditablePriceCell ouvre l'édition au clic |
| Annonce sans Storage photo | Affiche image TCG en grand (1 colonne au lieu de 2) |

---

## Non-objectifs (déférés)

- ❌ Cron Cardmarket — Phase 3
- ❌ Dashboard / KPIs — Phase 4
- ❌ Bulk vendu — Phase 4
- ❌ DELETE carte — non demandé en Phase 2
- ❌ Variant pricing distinct — followup déféré Phase 1.13 #1
- ❌ Persistance feed restock — toast éphémère, dashboard verra plus tard
- ❌ Script Python CLI — Phase 3
- ❌ Tests E2E Playwright sur le flow complet — déféré (cohérent avec la note Phase 1.13)

---

## Critères de complétion

- [ ] `/vinted` affiche la liste FIFO avec groupement variant-aware
- [ ] Recherche debounce + 4 types de filter chips fonctionnels
- [ ] Édit prix inline persiste via PATCH
- [ ] Modal "Vendu" passe la carte à `sold` avec date + prix optionnels
- [ ] Restock toast apparaît quand applicable, lien vers `/pokedex`
- [ ] Modal "Annonce" génère titre ≤ 80 chars + description, copies fonctionnelles
- [ ] ~12-15 nouveaux tests verts, total ~130, 0 lint warning, tsc clean
- [ ] Bilan Phase 2 ajouté à `docs/phase1-summary.md` (renommé en `docs/phases-summary.md` à cette occasion)
