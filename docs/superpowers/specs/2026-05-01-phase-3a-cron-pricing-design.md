# Phase 3a — Cron pricing TCGdex

**Date** : 2026-05-01
**Statut** : Spec validé, prêt à planning
**Phase précédente** : 2.1 (Restructuration Stock/Vinted, 199 tests, 0 lint, 0 type error)
**Périmètre** : pricing automatique uniquement. Mode lot + Python CLI = Phase 3b (séparée).

---

## 1. Contexte et motivation

À la sortie de la Phase 2.1, le pricing des cartes `for_sale` est :

- Renseigné une fois au scan (via `toEnrichedCard` qui pull `pricing.cardmarket` de TCGdex)
- Édité manuellement par l'utilisateur via `EditablePriceCell` (commit prix arbitraire)
- **Jamais rafraîchi automatiquement** — un prix vieux d'un mois reste affiché tel quel

Conséquence : les cartes vieillissent silencieusement. Les prix Vinted dérivent du marché Cardmarket. L'utilisateur n'a aucun signal visuel sur la fraîcheur d'un prix.

L'API Cardmarket étant **fermée aux nouvelles applications depuis 2023**, on ne peut pas l'attaquer directement. Mais TCGdex (`api.tcgdex.net/v2`) expose `pricing.cardmarket.{low, trend, avg, updated, ...}` gratuitement et le code récupère déjà ces champs au scan ([lib/api/tcgdex.ts:33-46](../../../lib/api/tcgdex.ts#L33-L46)). Il "suffit" de re-pull périodiquement.

**Stratégie retenue** : cron Vercel quotidien qui re-fetch TCGdex pour toutes les cartes `for_sale` éligibles + backfill `card_id_tcg` pour les cartes scannées avant que leur set ne soit dans le catalogue. Pas de scraping Cardmarket (fragile, demande infra anti-detection).

---

## 2. Objectifs et non-objectifs

### Objectifs

1. **Cron quotidien** Vercel à 02h00 UTC, protégé par `CRON_SECRET`, qui rafraîchit `cm_price_low/trend/avg`, `cardmarket_id`, `cm_updated_at` pour toutes les cartes `for_sale` éligibles.
2. **Backfill `card_id_tcg`** : tenter d'enrichir au cron les cartes qui n'avaient pas de match TCGdex au scan (souvent les sets très récents ou les langues exotiques).
3. **Recalcul `suggested_price`** automatique uniquement si l'utilisateur ne l'a pas touché manuellement.
4. **UI** : badge fraîcheur sur chaque row Vinted/Stock + bouton refresh manuel par carte.
5. Tests unitaires sur tous les helpers + tests d'intégration sur le endpoint cron.

### Non-objectifs

- ❌ **Pas de scraping Cardmarket** (HTML, OAuth, etc.). Cardmarket API fermée, scraping fragile.
- ❌ **Pas d'historisation des prix** (ligne 856 `context.md` : pas de time series). Le cron écrit juste la dernière valeur.
- ❌ **Pas de tracking delta** (cm_price_trend_previous, alertes pump/dump). Reporté Phase 4 dashboard si besoin.
- ❌ **Pas de variant-aware pricing** au cron. Les rows avec `variant IS NOT NULL` (Poké Ball, Master Ball, Reverse Holo, Promo) sont **skip** — leur prix manuel est préservé.
- ❌ **Pas de page admin** (status du cron, dernier run, etc.). Vercel logs suffisent.
- ❌ **Pas de retry async** ou queue. Si le cron échoue → on attend le prochain. Si certaines cartes échouent → on les revisite au cron suivant grâce au tri `cm_updated_at ASC`.

---

## 3. Architecture

### 3.1 Endpoint cron

- **Path** : `POST /api/prices/update`
- **Auth** : header `Authorization: Bearer ${CRON_SECRET}`. Renvoie `401` sinon.
- **Exempté de l'auth Supabase** dans [proxy.ts:18](../../../proxy.ts#L18) (déjà fait).
- **Single-card mode** : `POST /api/prices/update?card_id={uuid}` (sans Bearer, derrière auth Supabase normale). Permet le bouton "Refresh price" sur chaque row Vinted/Stock.
- **Réponse** : `{ ok: boolean, total: number, updated: number, backfilled: number, skipped: number, errors: Array<{ card_id, message }> }`

### 3.2 Trigger

`vercel.json` (à créer) :

```json
{
  "crons": [{ "path": "/api/prices/update", "schedule": "0 2 * * *" }]
}
```

Soit 02h00 UTC = 03h00 Paris hiver / 04h00 Paris été. Vercel passe automatiquement le header `Authorization: Bearer ${CRON_SECRET}` (lu de l'env var Vercel).

### 3.3 Process bulk (cron mode)

1. **Read** : `SELECT * FROM cards WHERE status='for_sale' ORDER BY cm_updated_at ASC NULLS FIRST LIMIT 200` (priorise les plus vieux + jamais maj)
2. **Categorize** : pour chaque carte, `categorize(card): 'tcgdex' | 'backfill' | 'skip'` (cf. §4.1)
3. **Batch fetch** : par groupes de 10 en parallèle (`Promise.all` avec contrôle de concurrence). Pour chaque carte tcgdex → `fetchTCGdexCard(card_id_tcg, language)`. Pour backfill → `lookupCatalog(set_code, set_number, language)` puis fetchTCGdexCard si match.
4. **Bulk update** : `UPDATE cards SET cm_price_low=..., cm_price_trend=..., cm_price_avg=..., cardmarket_id=..., cm_updated_at=now(), suggested_price=... WHERE id=...` (un round-trip Supabase par carte ; pas d'optimisation prématurée pour < 200 rows).
5. **Return** : JSON résumé.

**Limite Vercel Hobby = 10s par function invocation. Pro = 60s.** Estimation 150 cartes × 200ms TCGdex parallélisé 10× = ~30s. Si on dépasse 60s → on chunke par 50 (les autres seront traitées au cron du lendemain via `cm_updated_at ASC`).

### 3.4 Process single-card (refresh manuel)

1. Auth Supabase normale (user logged-in)
2. `card_id` du query string → fetch la row → categorize → fetch TCGdex → update DB → renvoyer la row mise à jour
3. UI fait un refresh local de la row (pas de full page reload)

---

## 4. Logique métier

### 4.1 Catégorisation des cartes (`lib/utils/categorize-pricing-card.ts`)

```ts
type Category = 'tcgdex' | 'backfill' | 'skip';

function categorize(card: Card): Category {
  if (card.variant !== null) return 'skip';
  if (card.card_id_tcg !== null) return 'tcgdex';
  if (card.set_code && card.set_number && isTCGdexLanguage(card.language)) return 'backfill';
  return 'skip';
}

function isTCGdexLanguage(lang: CardLanguage): boolean {
  return ['JP', 'EN', 'FR', 'DE', 'IT', 'ES', 'PT'].includes(lang);
  // KO et ZH ne sont pas catalogués TCGdex → skip
}
```

### 4.2 Recalcul `suggested_price` (`lib/utils/recalc-suggested-price.ts`)

L'utilisateur peut éditer `suggested_price` manuellement via `EditablePriceCell`. On ne veut pas écraser cet édit au cron suivant.

**Heuristique simple** : si l'ancien `suggested_price` correspond à `oldTrend × coeff` (à 1¢ près), c'est qu'il a été calculé automatiquement → on recalcule. Sinon (utilisateur a touché) → on conserve.

```ts
function recalcSuggestedPrice(args: {
  oldTrend: number | null;
  newTrend: number | null;
  oldSuggested: number | null;
  coeff: number;
}): number | null {
  if (args.newTrend === null) return args.oldSuggested; // pas de nouveau prix → garde l'ancien
  if (args.oldSuggested === null) return round2(args.newTrend * args.coeff); // jamais calculé → set
  if (args.oldTrend === null) return args.oldSuggested; // pas de baseline → respect manuel
  const expectedAuto = round2(args.oldTrend * args.coeff);
  const wasManual = Math.abs(args.oldSuggested - expectedAuto) > 0.01;
  if (wasManual) return args.oldSuggested; // user a touché → respect
  return round2(args.newTrend * args.coeff); // automatique → recalcule
}
```

### 4.3 Format de fraîcheur (`lib/utils/format-staleness.ts`)

```ts
type StalenessTone = 'fresh' | 'stale' | 'old' | 'never';

interface StalenessLabel {
  tone: StalenessTone;
  label: string; // "Frais", "Maj il y a 3j", "Maj il y a 12j", "Jamais maj"
  daysSince: number | null;
}

function formatStaleness(cm_updated_at: string | null, now: Date): StalenessLabel;
```

Seuils :
- `< 24h` → `fresh` / `Frais`
- `1-7j` → `stale` / `Maj il y a Nj`
- `> 7j` → `old` / `Maj il y a Nj`
- `null` → `never` / `Jamais maj`

### 4.4 Logique TCGdex fetch (déjà existant, ré-utilise)

`lib/api/tcgdex.ts` expose déjà `fetchCard({ id, language })` et `toEnrichedCard(card)`. On ré-utilise. Si TCGdex retourne `pricing.cardmarket = null` (peut arriver pour certains sets JP), on **n'update PAS** `cm_updated_at` ni les colonnes prix : la carte sera re-tentée au prochain cron. Coût : N tentatives jusqu'à ce que TCGdex ait la donnée. Acceptable car bornage par `LIMIT 200` et prio `cm_updated_at ASC NULLS FIRST` qui ramène ces cartes en tête de queue.

---

## 5. Changements DB

**Aucune migration nouvelle**. Tout existe :

| Colonne | Type | Source | Statut |
|---|---|---|---|
| `cards.cardmarket_id` | text | Migration initiale 2026-04-25 | ✅ |
| `cards.cm_price_low` | numeric(10,2) | Migration initiale 2026-04-25 | ✅ |
| `cards.cm_price_trend` | numeric(10,2) | Migration initiale 2026-04-25 | ✅ |
| `cards.cm_price_avg` | numeric(10,2) | Migration initiale 2026-04-25 | ✅ |
| `cards.cm_updated_at` | timestamptz | Migration initiale 2026-04-25 | ✅ |
| `cards.suggested_price` | numeric(10,2) | Migration initiale 2026-04-25 | ✅ |
| `tcg_catalog.cardmarket_id` index | btree | Migration 2026-04-28 ([fichier](../../../supabase/migrations/20260428114538_tcg_catalog.sql#L31)) | ✅ |
| `config.price_coefficient` | text → number | Lu au runtime, défaut `0.85` | ✅ |

---

## 6. Composants UI nouveaux

### 6.1 `<PriceFreshnessBadge cm_updated_at={...} />`

- Petit badge inline (text-xs, padding faible)
- 4 tons : vert (fresh), gris (stale), ambre (old), gris foncé (never)
- Tokens Tailwind existants (suit la convention `text-rarity-*` : préfixe `text-staleness-fresh/stale/old/never` à ajouter dans `globals.css` `@theme`)
- Lit `cm_updated_at` ISO string et compare à `Date.now()` côté client (re-render au mount, pas de live update)

### 6.2 `<RefreshPriceButton card_id={...} onRefreshed={...} />`

- Icône Lucide `RefreshCw` 14×14
- État `idle | loading | success | error`
- `onClick` → `fetch('/api/prices/update?card_id=' + card_id, { method: 'POST' })`
- Loading : spinner (icône qui tourne)
- Success : flash vert 1s puis idle
- Error : flash rouge + tooltip avec le message
- Callback `onRefreshed(updatedCard)` pour que le parent puisse mettre à jour son state local

### 6.3 Intégration

Dans **`VintedRow`** :
- Sous le prix éditable, ajouter `<PriceFreshnessBadge>` + `<RefreshPriceButton>` côte à côte (gap-2)
- Le `RefreshPriceButton` met à jour la row via callback (pas de full reload)

Dans **`StockRow`** :
- Idem que VintedRow

Dans **`PokedexDrawer`** (si carte possédée) :
- Sous le bloc prix Cardmarket, ajouter `<PriceFreshnessBadge>` + `<RefreshPriceButton>`

---

## 7. Tests

### 7.1 Helpers purs (TDD)

| Fichier | Cas | Volume |
|---|---|---|
| `lib/utils/categorize-pricing-card.test.ts` | variant=null → tcgdex / variant set → skip / no card_id_tcg + valid set → backfill / KO langue → skip / pas de set_code → skip | 5 tests |
| `lib/utils/format-staleness.test.ts` | null → never / 12h → fresh / 3j → stale / 12j → old | 4 tests |
| `lib/utils/recalc-suggested-price.test.ts` | newTrend null → garde / oldSuggested null → calcule / oldSuggested = oldTrend × coeff → recalcule / oldSuggested ≠ oldTrend × coeff → respecte (manuel) / oldTrend null → respecte (pas de baseline) | 5 tests |

### 7.2 Endpoint integration

`app/api/prices/update/route.test.ts` — happy-dom + mocks :

- 401 sans header `Authorization`
- 401 avec mauvais secret
- 200 avec bon secret + écrit dans DB (mock Supabase)
- Mode bulk : traite 3 cartes (1 tcgdex / 1 backfill / 1 skip) → renvoie `{ updated: 1, backfilled: 1, skipped: 1 }`
- TCGdex retourne `pricing.cardmarket = null` → ne touche pas aux colonnes prix mais log warning
- TCGdex 500 sur 1 carte → continue les autres + ajoute à `errors[]`
- Mode single-card : `?card_id=X` avec auth Supabase → renvoie la row mise à jour

**Total estimé : 14 nouveaux tests** (199 → 213).

### 7.3 Tests UI (différé)

Pas de tests unitaires sur les composants React (cohérent avec la pratique actuelle du repo : helpers purs testés, UI testée à la main + e2e Playwright différé depuis Phase 1.13).

---

## 8. Erreurs et fallbacks

| Erreur | Comportement |
|---|---|
| `CRON_SECRET` env var absent | Endpoint renvoie `500` au démarrage (logs explicit) |
| TCGdex 4xx/5xx sur 1 carte | Log `console.warn`, ajoute à `errors[]`, continue |
| TCGdex timeout (15s par carte) | Idem, on n'attend pas plus |
| TCGdex retourne `pricing.cardmarket = null` | N'update PAS `cm_updated_at` (sera retenté demain) ; pas de log spam |
| Supabase write échoue sur 1 carte | Idem (warn + errors[] + continue) |
| TCGdex API entièrement down (3 erreurs en début de run) | Endpoint renvoie `503` au scheduler Vercel + log alert |
| Cron dépasse 60s sur Pro | Vercel kill — le batch suivant reprendra grâce à `cm_updated_at ASC` |

---

## 9. Variables d'environnement

Nouvelle :
- `CRON_SECRET` : token aléatoire à générer (`openssl rand -hex 32`). À renseigner dans Vercel Dashboard > Settings > Env Variables ET dans `.env.local` pour les tests locaux. À ajouter dans `.env.example`.

Existante (déjà câblée, [lib/supabase/service.ts:15](../../../lib/supabase/service.ts#L15)) :
- `SUPABASE_SERVICE_ROLE_KEY` : utilisé par le cron pour bypass RLS (le cron tourne sans user authentifié).

---

## 10. Volume estimé

| Tâche | Jours |
|---|---|
| Helpers purs + tests | 1 |
| Endpoint `POST /api/prices/update` (bulk) + tests | 1.5 |
| Endpoint single-card mode + auth split | 0.5 |
| `vercel.json` cron + `.env.example` + déploiement | 0.5 |
| `<PriceFreshnessBadge>` composant + tokens CSS | 0.5 |
| `<RefreshPriceButton>` composant + intégration VintedRow/StockRow/PokedexDrawer | 1 |
| Test e2e manuel en preview Vercel + ajustements | 0.5 |
| **Total** | **~5 jours** |

---

## 11. Critères de succès

- [ ] Cron déployé sur Vercel, exécution visible dans Vercel Logs à 02h00 UTC
- [ ] Au moins 1 cycle complet en prod : cartes `for_sale` actuelles ont `cm_updated_at < 24h` après le 2e run
- [ ] Tous les helpers purs ont 100% de couverture sur les cas listés §7.1
- [ ] Endpoint protégé : `curl -X POST /api/prices/update` sans header → 401
- [ ] Bouton `Refresh` sur une row Vinted → loading → vert 1s → `cm_updated_at` mis à jour, badge passe à `Frais`
- [ ] `npm test` : 213/213 passent
- [ ] `npm run lint` : 0 warning
- [ ] `npm run build` : 0 erreur typescript
- [ ] Variants (`variant != null`) ont leur prix intact après cron
- [ ] Cartes éditées manuellement (`suggested_price` ≠ `trend × coeff`) ont leur prix intact après cron
- [ ] Au moins 1 carte sans `card_id_tcg` est backfillée par le cron (preuve que le backfill marche)

---

## 12. Suite : Phase 3b

Après validation prod de Phase 3a, brainstorm séparé pour Phase 3b :
- Mode lot ≤ 20 photos (UI multi-upload + file de revue + `lot_id` groupement)
- Script Python CLI `add_cards.py` pour import en masse depuis dossier local

Ces deux chantiers partagent l'API `/api/ocr` + `/api/enrich` + `/api/cards` actuelle, donc pas de dépendance technique avec Phase 3a.
