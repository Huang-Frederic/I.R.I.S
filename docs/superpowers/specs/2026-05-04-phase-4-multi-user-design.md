# Phase 4 — Multi-user (Feature 2) — Design Spec

> **Scope** : Feature 2 du brief `PHASE_4.md` uniquement. Feature 1 (script Python d'import Vinted) fera l'objet d'une spec séparée après livraison de Feature 2.

> **Goal** : Passer IRIS de mono-user à 2-user (Hisshiden + sa copine), avec stock physique + pokédex partagés mais cross-listing per-user sur 2 comptes Vinted distincts.

## 1. Modèle métier

- Pokédex partagé.
- Stock physique partagé : 1 seul exemplaire physique par carte.
- Cross-listing : les 2 users publient la même carte sur leurs 2 comptes Vinted respectifs pour maximiser la visibilité.
- Quand l'un vend, l'autre doit retirer son annonce (manuellement, jamais en silencieux).
- La SEULE différence par-user dans la base : qui a effectivement publié quoi sur son Vinted, et depuis quand.

## 2. Schema DB

### 2.1 Migration unique `20260505000000_phase4_multi_user.sql`

```sql
-- 1. Per-user listings table
create table card_listings (
  card_id uuid not null references cards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  listed_at timestamptz not null default now(),
  primary key (card_id, user_id)
);
create index idx_card_listings_user_listed
  on card_listings (user_id, listed_at desc);

-- 2. Display names table
create table user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null
);

-- 3. Backfill from cards.vinted_listed_at to card_listings (Hisshiden's user_id)
insert into card_listings (card_id, user_id, listed_at)
select id, '<HISSHIDEN_USER_ID>'::uuid, vinted_listed_at
from cards
where vinted_listed_at is not null;

-- 4. Seed user_profiles (toi + copine)
insert into user_profiles (user_id, display_name) values
  ('<HISSHIDEN_USER_ID>'::uuid, 'Hisshiden'),
  ('<COPINE_USER_ID>'::uuid, 'Copine');

-- 5. Drop the old per-card vinted_listed_at column + index
drop index if exists idx_cards_vinted_listed_at;
alter table cards drop column vinted_listed_at;

-- 6. RLS
alter table card_listings enable row level security;
alter table user_profiles enable row level security;

-- card_listings: tous les authenticated lisent ; un user n'écrit QUE ses propres lignes
create policy card_listings_select on card_listings for select to authenticated using (true);
create policy card_listings_insert on card_listings for insert to authenticated with check (user_id = auth.uid());
create policy card_listings_update on card_listings for update to authenticated using (user_id = auth.uid());
create policy card_listings_delete on card_listings for delete to authenticated using (user_id = auth.uid());

-- user_profiles: tous lisent ; chacun écrit que son propre profile
create policy user_profiles_select on user_profiles for select to authenticated using (true);
create policy user_profiles_insert on user_profiles for insert to authenticated with check (user_id = auth.uid());
create policy user_profiles_update on user_profiles for update to authenticated using (user_id = auth.uid());
```

**Pré-requis** : Hisshiden fournit son `user_id` Supabase (visible dans Studio → Auth → Users) + le `user_id` de la copine (créé manuellement avant la migration). Les UUIDs sont substitués dans le SQL avant apply.

**Sécurité du backfill** : la table `cards` a actuellement 0 lignes (post-wipe Phase 3c) → backfill no-op et triviale. Si à terme des cartes existent au moment du re-deploy de cette migration, le SQL est idempotent et safe.

### 2.2 RLS rationale

- `cards` / `lots` / `tcg_catalog` / `config` / `rarity_ranks` : RLS existant inchangé. Tout reste partagé en lecture/écriture entre users authentifiés (le brief dit "tout est rigoureusement partagé").
- `card_listings` : SELECT all (chaque user voit les annonces de l'autre pour les badges) + write per-user (l'un n'efface jamais l'annonce de l'autre).
- `user_profiles` : SELECT all + write per-user.

### 2.3 Auth setup (action utilisateur, hors migration)

1. Supabase Studio → Auth → Settings → décocher **Enable email signups** (bloque toute nouvelle inscription).
2. Auth → Users → **Add user** pour la copine (email + password, pas d'email d'invitation).
3. Récupérer les 2 UUIDs (Hisshiden + copine), les substituer dans le SQL de migration avant apply.

## 3. Types TypeScript

### 3.1 Modifications

```ts
// lib/types/index.ts
// SUPPRIMER : `vinted_listed_at?: string | null` sur Card et CardRow
```

### 3.2 Ajouts

```ts
export interface CardListing {
  card_id: string;
  user_id: string;
  listed_at: string; // ISO timestamp
}

export interface UserProfile {
  user_id: string;
  display_name: string;
}

/** Card hydrated avec ses listings (chargés en parallèle côté server). */
export interface CardWithListings extends Card {
  listings: CardListing[];
}
```

## 4. Helpers purs (lib/utils)

### 4.1 `lib/utils/listings.ts` (nouveau fichier)

```ts
export function getMyListing(card: CardWithListings, myUserId: string): CardListing | null;
export function getPartnerListing(card: CardWithListings, partnerUserId: string): CardListing | null;
export function isStaleForUser(card: CardWithListings, userId: string, now: number): boolean;
```

Tests : 4 (`getMyListing`/`getPartnerListing`), 3 (`isStaleForUser`).

### 4.2 `lib/utils/vinted-filter.ts` (extension)

Ajout du nouvel axe multi-user. Type :

```ts
export type MultiUserChip = 'all' | 'mine' | 'partner' | 'cross' | 'none' | 'to_delete';

export interface VintedFilterState {
  // ... champs existants ...
  multiUserChip: MultiUserChip; // default 'all'
}

export function passesMultiUserChip(
  card: CardWithListings,
  chip: MultiUserChip,
  myUserId: string,
  partnerUserId: string,
): boolean;
```

**Sémantique** :

| Chip | Passe si |
|---|---|
| `all` | toujours true |
| `mine` | `getMyListing(card, myUserId) !== null` |
| `partner` | `getPartnerListing(card, partnerUserId) !== null` |
| `cross` | `mine && partner` |
| `none` | `!mine && !partner` |
| `to_delete` | `mine && card.status !== 'for_sale'` |

**Combinaison avec axe d'état** : ET strict.

```ts
const visible = forSaleCards.filter((c) =>
  passesCommon(c) && passesStateChips(c, filters, now) && passesMultiUserChip(c, filters.multiUserChip, myId, partnerId)
);
```

Tests : 6 (1 par chip, edge cases : `partner` avec partnerId null = false).

## 5. API endpoints

### 5.1 Nouveaux

- `POST /api/listings` — body `{ card_id: string }` → INSERT `card_listings(card_id, auth.uid(), now())` ON CONFLICT (card_id, user_id) DO NOTHING. Renvoie 200 avec la ligne créée (ou existante).
- `DELETE /api/listings/[card_id]` → DELETE WHERE card_id = X AND user_id = auth.uid(). Renvoie 200 + count.

Les 2 endpoints utilisent le client Supabase server-side standard (RLS s'applique automatiquement).

### 5.2 Modifications endpoint existant

`PATCH /api/cards/[id]` : retirer toute logique référençant `vinted_listed_at`. Le body n'accepte plus ce champ.

### 5.3 Endpoint listings + lots

Lots ne sont PAS dans le scope multi-user (un lot = produit unique non cross-listable, vendu une seule fois sur une plateforme). Le toggle `<VintedListedToggle>` actuel des lots reste sur `lots.vinted_listed_at` (colonne distincte de la `cards.vinted_listed_at` qu'on drop).

## 6. Frontend

### 6.1 User context (nouveau)

`lib/hooks/useUserContext.ts` :

```ts
export interface UserContext {
  myUserId: string;
  myName: string;
  partnerUserId: string | null; // null si compte copine pas encore créé
  partnerName: string | null;
}

export function useUserContext(): UserContext;
```

Implémentation : Provider chargé au mount de l'app layout (`app/(app)/layout.tsx`). Charge `auth.uid()` + `select * from user_profiles`. Expose via React Context.

Fallback : si `user_profiles` row manquante pour un user, `display_name` = email.

### 6.2 Composant `<ListingBadges>` (nouveau)

`components/vinted/ListingBadges.tsx` :

```tsx
interface Props {
  card: CardWithListings;
  myUserId: string;
  partnerUserId: string | null;
  partnerName: string | null;
  onToggle: () => Promise<void>; // POST /api/listings
  onDelete: () => Promise<void>; // DELETE /api/listings/[card_id]
}
```

**Rendu** :
- Cas "j'ai une annonce" → badge vert `Listée par Moi · Xj` (+ tag rouge `Stale` si > 21j).
- Cas "partner a une annonce" → badge bleu `Listée par {partnerName}`.
- Cas "j'ai annonce + carte plus en vente" → badge rouge `À retirer` cliquable → `<ConfirmDialog>` "Retirer ton annonce de Vinted ?" → `onDelete`.
- Cas "personne ne liste" → bouton outline `Mettre en ligne` → `onToggle`.

Les 4 cas peuvent coexister (ex: badge vert + badge bleu + badge rouge si la carte est sold mais cross-listée).

### 6.3 `<VintedRow>` et `<LotRow>`

Remplacent leur `<VintedListedToggle>` actuel par `<ListingBadges>`. Reçoivent `myUserId` + `partnerUserId` + `partnerName` en props depuis `<VintedList>`.

`<VintedListedToggle>` : conservé uniquement pour les lots (pas dans scope multi-user). Pour les cards, sera unused → drop le composant.

### 6.4 `<VintedFilters>` extension

Nouvelle ligne de chips multi-user sous la ligne d'état existante, séparée par un séparateur visuel. Props :

```tsx
multiUserChip: MultiUserChip;
onMultiUserChipChange: (chip: MultiUserChip) => void;
hasPartner: boolean; // hide partner/cross/to_delete chips si false
```

Si `hasPartner=false` (compte copine pas encore créé), les chips `partner` / `cross` / `to_delete` sont hidden — pas d'erreur, dégradation gracieuse.

### 6.5 `<SoldModal>` modification

Props additionnelles :

```tsx
partnerListing: CardListing | null;
partnerName: string | null;
```

Si `partnerListing && partnerName` → bandeau rouge en haut de la modal :

> ⚠ **{partnerName}** a aussi cette carte en ligne sur Vinted.
> Si tu ne remets pas un autre exemplaire en vente, **{partnerName}** devra retirer son annonce manuellement.

Pas d'auto-action. Pas de toggle. Le partner verra le badge "À retirer" rouge dans son IRIS et agira lui-même.

**Side effect côté frontend** : sur `onConfirm` du SoldModal, après le PATCH /api/cards/[id] qui passe la carte en `sold`, supprimer **mon** propre listing si présent (`DELETE /api/listings/[card_id]`). Garde l'invariant "I'm not listed on a sold card from my POV".

### 6.6 `<BulkSoldModal>` + `<BulkSoldRecapModal>`

Pareil que `<SoldModal>` mais agrégé : si N items du bulk ont un partnerListing, bandeau "**{partnerName}** a aussi {N} de ces cartes en ligne ({card_name1}, {card_name2}, …)" en haut.

`<BulkSoldRecapModal>` : ajout d'une section listant ces cartes pour rappel visuel. Pas d'action automatique.

**Side effect côté frontend** : le `handleBulkSold` dans `<VintedList>` doit aussi DELETE `card_listings` pour CHAQUE carte vendue (mes propres listings uniquement) après le PATCH /api/cards/[id] qui les passe en sold. Boucle séquentielle ou parallèle. Garde l'invariant "I'm not listed on a sold card from my POV" en bulk comme en unitaire.

### 6.7 Page `/vinted` query

Server-side (`app/(app)/vinted/page.tsx`) :

```ts
// Charge cards + listings + user_profiles en parallèle
const [{ data: cards }, { data: listings }, { data: profiles }] = await Promise.all([
  supabase.from('cards').select('*').in('status', ['for_sale', 'sold']),
  supabase.from('card_listings').select('*'),
  supabase.from('user_profiles').select('*'),
]);

// Hydrate côté client
const cardsWithListings: CardWithListings[] = cards.map((c) => ({
  ...c,
  listings: listings.filter((l) => l.card_id === c.id),
}));
```

`<VintedList>` reçoit `cardsWithListings` + `userContext`.

### 6.8 Page `/stock`

Inchangée. Stock fonctionne par card seulement, pas de cross-listing. Pas de badges multi-user à afficher.

### 6.9 Page `/pokedex`

Inchangée. Pokédex est shared, pas de notion de listing.

## 7. Tests

### 7.1 Helpers purs (TDD obligatoire)

| Fichier | Tests projetés |
|---|---|
| `lib/utils/listings.test.ts` | `getMyListing` (3) + `getPartnerListing` (1 edge) + `isStaleForUser` (3) = **7** |
| `lib/utils/vinted-filter.test.ts` (extension) | `passesMultiUserChip` (6) + intégration ET avec state chips (2) = **8** |

**Total nouveaux tests** : ~15. Compteur projeté : 279 → ~294.

### 7.2 Composants

Pas de test UI direct (consistent avec le projet). `<VintedRow>` et tests existants doivent passer avec mock `listings: []`.

### 7.3 Migration

Pas de test SQL automatisé (pattern projet). Validation manuelle :
1. Apply sur DB locale ou de test (snapshot pré-migration).
2. Vérifier `select count(*) from card_listings` post-backfill = `count from cards where vinted_listed_at is not null` pré-migration.
3. Vérifier `\d cards` ne contient plus `vinted_listed_at`.

## 8. Cleanup

Fichiers/exports à supprimer après refactor livré :

- `components/vinted/VintedListedToggle.tsx` — **conservé** car encore utilisé par `<LotRow>` (lots ne sont pas dans le scope multi-user — un lot = produit unique non cross-listable). Aucune modif.
- `cards.vinted_listed_at` : drop par la migration → tous les `select '*'` ne le sélectionneront plus naturellement.
- Tous les `card.vinted_listed_at` dans les types, mappers, API (PATCH route, etc.) à enlever proprement (TS strict catch toutes les références après le drop sur le type `Card`).
- Tests/références à `vinted_listed_at` côté cards (pas lots) à mettre à jour ou supprimer.

## 9. Hors scope (Feature 1 ou plus tard)

- Script Python d'import Vinted → Spec B
- Avatar / color tag par user → extensible plus tard
- Audit log → yagni
- Notif email/push entre users → manuels via flag "À retirer"

## 10. Risques + mitigations

| Risque | Probabilité | Mitigation |
|---|---|---|
| Migration backfill irréversible | basse (table cards vide) | SQL idempotent, transaction explicite |
| Race condition POST /listings | moyenne | INSERT ON CONFLICT DO NOTHING + optimistic UI + rollback sur erreur |
| `partner_user_id` null pendant transition (compte copine pas créé) | haute | useUserContext expose `null`, `<ListingBadges>` cache les badges partner, `<VintedFilters>` cache les chips partner |
| User scan une carte qui existe déjà (collision avec stock partagé) | moyenne | Pas de protection nouvelle ici — comportement actuel avec modale 409 `<DuplicateForSaleModal>` couvre déjà |

## 11. Critères de succès

- 279 tests vitest baseline → ~294 (15 nouveaux pour helpers listings + multi-user filter)
- 0 lint warning, 0 type error
- Build Next.js ✓
- Migration appliquée avec succès (table card_listings + user_profiles présentes, colonne `vinted_listed_at` absente)
- Smoke test :
  1. Hisshiden se connecte → toggle annonce, badge vert apparaît
  2. Copine se connecte sur même carte → badge bleu "Listée par Hisshiden" visible
  3. Copine toggle → cross-listée (vert + bleu côté Hisshiden)
  4. Hisshiden marque Vendu → SoldModal montre bandeau "Copine a aussi cette carte"
  5. Côté Copine, badge rouge "À retirer" sur cette carte
  6. Copine clique → confirm → listing supprimé
- Filtres multi-user fonctionnent (mes / ses / cross / non listées / à retirer) en combinaison ET avec filtres d'état existants

## 12. Ordre d'implémentation recommandé (pour le plan)

1. Migration SQL + RLS + backfill (paramétré, attend les 2 UUIDs au moment de l'apply)
2. Types TypeScript (CardListing, UserProfile, CardWithListings)
3. Helpers purs (getMyListing, getPartnerListing, isStaleForUser, passesMultiUserChip) — TDD
4. Endpoints API (POST /listings, DELETE /listings/[card_id])
5. useUserContext hook + Provider
6. `<ListingBadges>` composant
7. `<VintedRow>` + `<LotRow>` refactor (passer du toggle aux badges)
8. `<VintedFilters>` extension (chips multi-user)
9. `<VintedList>` query + hydration `CardWithListings`
10. `<SoldModal>` + `<BulkSoldModal>` + `<BulkSoldRecapModal>` bandeaux partner
11. Cleanup `<VintedListedToggle>` côté cards
12. Lint + tests + build
13. Smoke test handoff
