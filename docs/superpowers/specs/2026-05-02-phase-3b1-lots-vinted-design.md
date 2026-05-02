# Phase 3b1 — Lots Vinted (bundles)

**Date** : 2026-05-02
**Statut** : Spec validé, prêt à planning
**Phase précédente** : 3a (Cron pricing TCGdex, 218 tests, 0 lint, 0 type error)
**Périmètre** : ingestion + revente de lots (bundles de cartes vendus en bloc sur Vinted). Le Python CLI = Phase 3b2 séparée. Le pivot par rapport au plan initial : on abandonne l'idée du "Mode lot ≤ 20 photos individuelles + OCR par carte" parce que chronophage et inadapté à l'usage réel (les lots sont vendus en bloc, jamais en pièces détachées, jamais ajoutés au Pokédex).

---

## 1. Contexte et motivation

À la sortie de Phase 3a, l'app gère bien les **cartes individuelles** (`cards` table) — scan unitaire, ingestion Pokédex/Stock/Vinted, AnnonceModal avec template par carte, cron pricing. Le pattern fonctionne mais ne couvre pas le cas où l'utilisateur revend un **lot complet** (ex: "Art Set Complet Shiny Gem Pack Vol 1") :

- Un lot a UNE photo principale (et éventuellement quelques angles)
- Le lot est vendu d'un bloc, pas carte par carte
- Pas de tracking dans le Pokédex
- Pas de pricing Cardmarket applicable (un lot n'est pas un produit Cardmarket)
- L'OCR carte par carte sur 20 cartes empilées est chronophage ET peu fiable (Gemini ne va matcher que 0-2 cartes utilement)

**Pivot** : on traite le lot comme une **entité distincte** avec sa propre table (`lots` étendue, qui existe déjà avec juste `id`/`photo_url`/`created_at` et était jusqu'ici inutilisée). Form rapide à 5 champs, template d'annonce 80% boilerplate, intégré dans `/vinted` à côté des cartes.

---

## 2. Objectifs et non-objectifs

### Objectifs

1. **Ingestion rapide** : créer un lot en < 60s (5 champs + 1 à N photos).
2. **Template d'annonce paramétré** : titre + description Vinted générés depuis le formulaire avec 3 variables (nom, langue, condition) sur un boilerplate fixe basé sur l'usage réel utilisateur.
3. **Multi-photos** : 1 à N photos par lot, stockées dans `lot-photos/{lot_id}/{index}.jpg`, carousel dans la AnnonceModal lot.
4. **Affichage `/vinted` interleavé** : lots et cartes dans la même liste FIFO, distingués par un badge "Lot".
5. **Cycle de vie complet** : `for_sale` (avec toggle 3 états offline/online/stale) → `sold` (avec date_sold + sold_price), même mécanique que les cartes.

### Non-objectifs

- ❌ **Pas d'OCR** sur les photos de lots (coût négligeable mais bénéfice nul, l'utilisateur décrit dans le titre).
- ❌ **Pas de Pokédex** (un lot n'a pas de `pokemon_number`).
- ❌ **Pas de Stock** (les lots vont direct en `for_sale`, pas de phase "collection" intermédiaire).
- ❌ **Pas de pricing Cardmarket / cron** (les lots ne sont pas dans Cardmarket, le prix est 100% utilisateur).
- ❌ **Pas de groupement variant-aware** (chaque lot est unique, pas de doublons par définition).
- ❌ **Pas de restock detection** (logique inappropriée pour un lot).
- ❌ **Pas de relation `cards` ↔ `lots`** : la FK `cards.lot_id` reste là (vestige) mais sera toujours `null`. Pas de cleanup destructif.
- ❌ **Pas de templates multiples** (un seul template hardcodé en code, modifiable plus tard si besoin).
- ❌ **Pas de Python CLI** pour les lots (pas pertinent, l'ingestion via formulaire web est déjà très rapide).

---

## 3. Architecture

### 3.1 Vue d'ensemble

```
[Submit page tab "Lot"]
       ↓ (form: name, price, language, condition, photos[], extra_description?)
[POST /api/lots] → upload photos to Storage + insert row
       ↓
[lots table: status='for_sale', vinted_listed_at=null]
       ↓
[/vinted page] fetch cards + lots in parallel → merge by date_added ASC
       ↓
[<LotRow>] avec badge "Lot", EditablePriceCell, VintedListedToggle, boutons Annonce + Vendu
       ↓
[<LotAnnonceModal>] = template rendu + carousel photos + copy clipboard
       ↓
[PATCH /api/lots/{id}] pour édit prix / status / vinted_listed_at / sold
```

### 3.2 Modèle DB (1 migration)

Migration `supabase/migrations/20260502120000_lots_vinted_bundle.sql` :

```sql
alter table lots
  add column name text not null default '',
  add column language card_language,                -- réutilise enum existant ('JP'|'EN'|'FR'|'DE'|'IT'|'ES'|'KO'|'PT'|'ZH')
  add column condition card_condition default 'NM', -- réutilise enum ('NM'|'EX'|'GD'|'PL'|'PO')
  add column extra_description text,                -- optionnel, middle text
  add column price numeric(10, 2),
  add column status text default 'for_sale'
    check (status in ('for_sale', 'sold')),
  add column date_sold timestamptz,
  add column sold_price numeric(10, 2),
  add column vinted_listed_at timestamptz,
  add column photo_urls jsonb default '[]'::jsonb,  -- array de paths Storage relatifs
  add column date_added timestamptz default now();

create index idx_lots_status on lots(status);
create index idx_lots_date_added on lots(date_added);
create index idx_lots_vinted_listed on lots(vinted_listed_at) where vinted_listed_at is not null;
```

Notes :
- Le `cards.lot_id` FK existante reste intacte mais ne sera plus utilisée (pas de cleanup pour éviter migration risquée).
- Le `lots.photo_url` (singular, ancien) reste et n'est plus utilisé. Les nouveaux lots écrivent dans `photo_urls` (jsonb array). À drop dans une future migration de cleanup si besoin.
- `status` est text + check au lieu de réutiliser `card_status` enum (qui contient `pokedex` et `collection` non applicables).

### 3.3 Endpoints

#### `POST /api/lots`

- **Auth** : Supabase user normale
- **Content-Type** : `multipart/form-data`
- **Champs** :
  - `name` (text, required)
  - `price` (number, required)
  - `language` (text, required, validé contre `card_language` enum)
  - `condition` (text, default 'NM', validé contre `card_condition` enum)
  - `extra_description` (text, optionnel)
  - `photos` (array de File, ≥ 1 fichier)
- **Process** :
  1. Insert row dans `lots` (sans `photo_urls` encore) → récupère `lot_id`
  2. Pour chaque photo, convertir en JPEG (qualité 85), upload à `lot-photos/{lot_id}/{index}.jpg`
  3. Update `photo_urls` avec l'array de paths Storage
  4. Renvoyer le lot complet
- **Erreurs** : 400 (champs manquants/invalides), 401 (no auth), 500 (Storage / DB fail)

#### `PATCH /api/lots/[id]`

- **Auth** : Supabase user normale
- **Content-Type** : `application/json`
- **Champs acceptés** : `name`, `language`, `condition`, `extra_description`, `price`, `status`, `date_sold`, `sold_price`, `vinted_listed_at`
- **Validation** : status ∈ {for_sale, sold}, status='sold' nécessite `date_sold` (auto-set à `now()` si non fourni), `sold_price` optionnel
- **Réponse** : le lot mis à jour
- **Erreurs** : 400, 401, 404 (id non trouvé)

#### `DELETE /api/lots/[id]`

- **Auth** : Supabase user normale
- **Process** :
  1. Read le lot pour récupérer `photo_urls`
  2. Delete chaque photo dans Storage (`lot-photos/{lot_id}/*`)
  3. Delete la row `lots`
- **Réponse** : 204 No Content
- **Erreurs** : 401, 404

### 3.4 Storage layout

Bucket `lot-photos` (déjà existant, public-read).

```
lot-photos/
  {lot_id}/
    0.jpg
    1.jpg
    2.jpg
    ...
```

Le nom de fichier est l'index dans `photo_urls` (donc `photo_urls[0]` correspond toujours à `0.jpg`).

---

## 4. Logique métier — template d'annonce

### 4.1 Mappings (`lib/utils/lot-template.ts`)

```ts
const LANGUAGE_LABELS: Record<CardLanguage, { name: string; flag: string }> = {
  JP: { name: 'Japonaise',  flag: '🇯🇵' },
  EN: { name: 'Anglaise',   flag: '🇬🇧' },
  FR: { name: 'Française',  flag: '🇫🇷' },
  DE: { name: 'Allemande',  flag: '🇩🇪' },
  IT: { name: 'Italienne',  flag: '🇮🇹' },
  ES: { name: 'Espagnole',  flag: '🇪🇸' },
  PT: { name: 'Portugaise', flag: '🇵🇹' },
  KO: { name: 'Coréenne',   flag: '🇰🇷' },
  ZH: { name: 'Chinoise',   flag: '🇨🇳' },
};

const CONDITION_LABELS: Record<CardCondition, { fr: string; en: string }> = {
  NM: { fr: 'Très bon état',  en: 'Near Mint' },
  EX: { fr: 'Bon état',       en: 'Excellent' },
  GD: { fr: 'État correct',   en: 'Good' },
  PL: { fr: 'État jouable',   en: 'Played' },
  PO: { fr: 'État abîmé',     en: 'Poor' },
};
```

Vérifier au moment de l'implémentation si `lib/utils/vinted-template.ts` (Phase 2) contient déjà des mappings similaires pour les cartes — si oui, factoriser dans un fichier partagé `lib/utils/locale-labels.ts`. Sinon, vivre avec une duplication mineure pour ne pas refactor un code stable.

### 4.2 Template

```ts
const DESCRIPTION_TEMPLATE = `✨ {{title}}
📘 Cartes officielles {{language_name}} {{language_flag}}
✅ État : {{condition_label}} ({{condition_code}}), carte en excellent état (voir photos).
{{extra_block}}
🛡️ Chaque carte est envoyée sous sleeve + toploader !
🚀 Expédition rapide sous 1 à 2 jours ouvrés 📦
🤝 Remise en main propre possible sur Paris / 92 / 95
📸 Besoin de photos supplémentaires ? N'hésitez pas à me demander !

🃏 Plein d'autres cartes sont disponibles sur mon profil !
📦 Possibilité de créer des lots personnalisés avec réduction sur les frais de port 🤑`;
```

Le placeholder `{{extra_block}}` est remplacé par :
- Une ligne vide + le texte `extra_description` + une ligne vide, si `extra_description` est non-vide
- Rien (chaîne vide), sinon

### 4.3 Helper `buildLotAnnonce`

```ts
interface LotForTemplate {
  name: string;
  language: CardLanguage;
  condition: CardCondition;
  extra_description: string | null;
}

interface LotAnnonce {
  title: string;
  description: string;
}

export function buildLotAnnonce(lot: LotForTemplate): LotAnnonce {
  const lang = LANGUAGE_LABELS[lot.language];
  const cond = CONDITION_LABELS[lot.condition];
  const title = lot.name;
  const extraBlock = lot.extra_description?.trim()
    ? `\n${lot.extra_description.trim()}\n`
    : '';

  const description = DESCRIPTION_TEMPLATE
    .replace('{{title}}', title)
    .replace('{{language_name}}', lang.name)
    .replace('{{language_flag}}', lang.flag)
    .replace('{{condition_label}}', cond.fr)
    .replace('{{condition_code}}', cond.en)
    .replace('{{extra_block}}', extraBlock);

  return { title, description };
}
```

Note : pas de smart-truncate du titre (contrairement aux cartes), parce que le `name` est entièrement écrit par l'utilisateur. Le formulaire affiche un compteur `X / 80` rouge si dépassement.

---

## 5. UI — composants

### 5.1 `<LotForm>` (composant nouveau)

Remplace le placeholder dans `components/submit/SubmitTabs.tsx` (onglet "Lot").

Layout 2 colonnes desktop, empilé mobile :

**Colonne gauche** :
- Zone multi-photo (drag/drop OU click pour file picker)
- Thumbnails des photos uploadées avec bouton "✕" pour retirer
- Form fields :
  - Nom (text, required, compteur 80 chars)
  - Prix (number, required)
  - Langue (dropdown, default JP)
  - Condition (dropdown, default NM)
  - Description additionnelle (textarea, optionnel)

**Colonne droite (sticky)** :
- Header "Aperçu Vinted"
- Preview du titre
- Preview de la description (rendue via `buildLotAnnonce`)
- Bouton "Enregistrer le lot" en bas

### 5.2 `<LotRow>` (composant nouveau)

Affiché dans `/vinted`, structure proche de `<VintedRow>` mais simplifiée :

- Thumbnail = `photo_urls[0]` (résolu en URL Storage publique)
- Nom du lot (truncate)
- Meta : badge "Lot" violet (`text-rarity-chr` ou nouveau token `lot-badge`)
- Langue + condition en chips
- `EditablePriceCell` (réutilisé, PATCH `/api/lots/[id]`)
- `VintedListedToggle` (réutilisé, PATCH `vinted_listed_at`)
- Bouton "Annonce" → ouvre `<LotAnnonceModal>`
- Bouton "Vendu" → ouvre `<SoldModal>` (réutilisé en mode `kind='lot'`)

### 5.3 `<LotAnnonceModal>` (composant nouveau)

Variante de `<AnnonceModal>` pour lots :

- Pas de grid Low/Trend/Avg/Annonce (pas de pricing Cardmarket)
- À la place : prix éditable inline (single value)
- Pas de PriceFreshnessBadge ni RefreshPriceButton
- Carousel de photos : chevrons gauche/droit pour naviguer + dot indicators en bas (cliquables pour jumper directement)
- Titre généré + éditable (compteur 80)
- Description générée + éditable
- Boutons Copier titre / Copier description
- Bouton Download img (réutilise `processImageForVinted` sur la photo courante du carousel)

### 5.4 `<SoldModal>` (extension)

Le SoldModal existant (`components/vinted/SoldModal.tsx`) accepte une carte. On l'étend pour accepter aussi un lot via une prop `kind: 'card' | 'lot'`. La logique de PATCH change selon le `kind` (`/api/cards/[id]` vs `/api/lots/[id]`). Le formulaire reste identique (date + prix optionnels).

### 5.5 `<VintedFilters>` (extension)

Ajouter une chip groupe "Type" : `Tout` (default) / `Cartes` / `Lots`. Mutuellement exclusif. Le filtre passe au front, qui restreint la liste merge.

### 5.6 `<VintedList>` (extension)

Modifications :
- Fetch parallèle ajouté : `lots` where `status in ('for_sale', 'sold')`
- Merge : ajouter chaque lot dans la liste avec un discriminant `kind: 'lot'`. Les cartes ont implicitement `kind: 'card'`.
- Rendu : `kind === 'card'` → `<VintedRow>`, `kind === 'lot'` → `<LotRow>`
- Sort : par `date_added` ASC pour les `for_sale`, par `date_sold` DESC pour les `sold` (mêmes règles que les cartes)
- Le filtre chip `Cartes / Lots / Tout` filtre la liste merge

---

## 6. Tests

### 6.1 Helpers purs (TDD)

| Fichier | Cas | Volume |
|---|---|---|
| `lib/utils/lot-template.test.ts` | rendu happy path / langue inconnue / condition inconnue / extra_description vide → pas de bloc / extra_description non-vide → bloc inséré / mappings de chaque langue (paramétrés) | 6-8 tests |

### 6.2 Endpoints integration

| Fichier | Cas | Volume |
|---|---|---|
| `app/api/lots/route.test.ts` | POST 401 sans auth / POST 400 sans name / POST 400 sans price / POST 400 sans photos / POST 200 happy path (mock Storage upload + DB insert) | 5 tests |
| `app/api/lots/[id]/route.test.ts` | PATCH 401 / PATCH 404 / PATCH 200 prix édité / PATCH 200 status='sold' avec date auto / DELETE 204 (mock Storage delete + DB delete) | 5 tests |

**Total estimé** : ~16 nouveaux tests (218 → 234).

### 6.3 UI

Pas de tests unitaires sur les composants React (cohérent avec la pratique du repo). Smoke test à la main + Playwright différé.

---

## 7. Erreurs / fallbacks

| Erreur | Comportement |
|---|---|
| Aucune photo uploadée | Form bloque le submit, message "Au moins 1 photo requise" |
| Photo upload Storage échoue (toutes les photos) | Rollback : delete la row `lots` insérée, renvoie 500 + message clair |
| Photo upload Storage échoue (partielle, ex 3/5 réussies) | La row est conservée avec `photo_urls = ['0.jpg', '1.jpg', '2.jpg']` (les 2 échecs sont log warn). UX-side, le form re-affiche les photos non uploadées avec un bouton "Réessayer cette photo" qui appelle un futur endpoint dédié — pour Phase 3b1, on accepte la dégradation et on laisse le user supprimer/recréer si vraiment problématique. |
| Nom > 80 chars | Pas de blocage backend (le user décide). UI affiche le compteur en rouge mais permet le submit. |
| Langue / condition non valides côté API | 400 avec message clair |
| DELETE échoue à supprimer une photo Storage | Log warn mais delete la row DB quand même (les fichiers orphelins seront cleanup périodiquement plus tard si besoin) |

---

## 8. Variables d'environnement

Aucune nouvelle. Tout passe par les env vars Supabase déjà présentes.

---

## 9. Volume estimé

| Tâche | Jours |
|---|---|
| Migration DB + types TS | 0.5 |
| Helper `lot-template` + tests | 1 |
| Endpoint `POST /api/lots` (multipart + Storage) + tests | 1 |
| Endpoint `PATCH /api/lots/[id]` + tests | 0.5 |
| Endpoint `DELETE /api/lots/[id]` + tests | 0.5 |
| `<LotForm>` (multi-upload + preview live) | 1 |
| `<LotRow>` + interleaving dans `<VintedList>` | 0.75 |
| `<LotAnnonceModal>` (carousel + template + copy) | 1 |
| Extension `<SoldModal>` pour lots + extension `<VintedFilters>` | 0.5 |
| Test e2e manuel + ajustements | 0.5 |
| **Total** | **~7.25 jours** |

---

## 10. Critères de succès

- [ ] Migration appliquée, types TS à jour
- [ ] `npm test` : 234/234 (218 + 16 nouveaux)
- [ ] `npm run lint` : 0 warning
- [ ] `npm run build` : 0 erreur typescript
- [ ] Création d'un lot via le form `/submit` onglet "Lot" : 5 champs + 2 photos → save → apparaît dans `/vinted` avec badge "Lot", offline par défaut
- [ ] Click "Annonce" sur un lot : modal s'ouvre, titre + description rendus depuis le template, copy fonctionne, carousel navigue les photos
- [ ] Click "Vendu" sur un lot : SoldModal accepte → status passe à 'sold', date_sold renseigné, lot disparaît de "for_sale" / apparaît dans "Vendus"
- [ ] Toggle "En ligne" sur un lot : 3 états offline/online/stale fonctionnent, persistés en DB
- [ ] Filtre `Lots / Cartes / Tout` dans VintedFilters fonctionne
- [ ] Édition prix inline sur un lot persiste via PATCH

---

## 11. Suite

### Phase 3b2 (suivante)

Python CLI `scripts/add_cards.py` pour import en masse de cartes individuelles depuis un dossier local (pas pour les lots — les lots ont déjà un workflow rapide via le form).

### Phase 4 (plus tard)

- Dashboard avec KPIs (incluant valeur des lots en stock)
- Bulk vendu (sélection multi-rows)
- Polish PWA
- Stats sur les lots (nombre vendus, prix moyen, langue la plus performante)

### Followups différés (non-bloquants)

1. **Templates multiples** : si l'utilisateur veut plusieurs presets (ex: "Lot CN", "Lot Booster Box", etc.), ajouter une table `lot_templates` ou un dropdown dans le form. YAGNI pour l'instant.
2. **Boilerplate hardcodé "Paris / 92 / 95"** : si l'utilisateur déménage ou veut adapter le template (ex: ajouter un département, retirer la remise en main propre), on stocke le template en DB ou config table. Pour l'instant le template vit en code.
3. **Reorder des photos** : permettre de drag-and-drop l'ordre des photos après upload (actuellement fixe par ordre d'upload).
4. **Endpoint "Réessayer photo"** : pour le cas d'upload Storage partiellement échoué (cf. §7), permettre de re-upload une photo individuelle sans recréer le lot. Pas critique pour Phase 3b1.
5. **Edit du lot post-création** : un bouton "Modifier" sur LotRow qui rouvre le LotForm pré-rempli. Pas critique car PATCH inline marche déjà pour les champs principaux.
6. **Compression photos** : actuellement upload brut JPEG 85%. Pour des photos > 5MB, ajouter une compression côté client avant upload.
7. **Cleanup `lots.photo_url`** (singular) : drop la colonne legacy dans une migration future après confirmation que rien ne lit dessus.
8. **Cleanup `cards.lot_id`** : drop si jamais un usage individual-card-import devient définitivement abandonné.
