# Design — Catalogue local Pokémon TCG via Cardmarket

**Date** : 2026-04-28
**Statut** : Approuvé, prêt pour planification d'implémentation
**Phase projet** : Pré-Phase 2 (résout un blocage Phase 1 sur l'enrichissement OCR)

---

## PIVOT NOTE (2026-04-28)

**Cardmarket API fermée aux nouvelles applications.** La découverte en cours d'implémentation a révélé que Cardmarket a officiellement clos l'accès API à toute nouvelle application depuis 2023. Le code OAuth 1.0a préparatoire a été nettoyé.

**Pivot vers LimitlessTCG (limitlesstcg.com).** Leur robots.txt est entièrement ouvert. Le scraper `scripts/scrape-limitlesstcg.ts` crawle 7 langues × ~150 sets = **111,396 cartes** en ~12 minutes. Le reste de cette spec décrit l'architecture Cardmarket originale — l'implémentation réelle suit la même logique (table `tcg_catalog`, strategies d'enrichissement) mais alimentée par scraping LimitlessTCG au lieu d'OAuth Cardmarket.

Test bench post-catalogue : **19/30 (63%)** mesuré, ~22/30 (73%) effectif quand on accepte les variantes de nom de set. Up de 10/30 (33%) baseline.

---

## Contexte et problème

Le pipeline d'enrichissement actuel (post-OCR) atteint **10/30 (33%)** sur le bench de cartes réelles. L'investigation montre que **OCR Vision fait son boulot** dans 13/30 cas (43% extraction correcte du set+localId), mais **TCGdex JP n'a pas les cartes anciennes** : les sets antérieurs à SV-era sont listés en metadata mais avec `cards: []` vide.

**Cartes affectées dans le bench** :
- BW-era (3 cartes) : pas dans TCGdex JP du tout
- XY/SM/S-era ancien (~14 cartes) : sets listés mais `cards: []` vide
- SV-era moderne (~12 cartes) : OK, fonctionne actuellement

Plafond TCGdex JP estimé : ~12-15/30. Aucune amélioration côté OCR ne dépassera ce plafond — le problème est côté source de données.

## Objectif

Construire un **catalogue Pokémon TCG complet** stocké localement, peuplé via l'API Cardmarket, qui sert de source unique au runtime pour l'enrichissement post-scan. Cible : **>90% d'enrichissement réussi** sur le bench de 30 cartes.

## Décisions clés

| Décision | Choix | Raison |
|---|---|---|
| Source de données | Cardmarket API (Personal App, gratuit) | Couverture complète, OAuth officiel stable, `cardmarket_id` inclus pour Phase 3 |
| Stockage | Table Supabase `tcg_catalog` | Lookup O(1), indexable, pas d'alourdissement git, queryable depuis Studio |
| Stratégie images | Hot-link CDN Cardmarket (URL stockée) | 0 conso Storage Supabase ; migration possible plus tard si rupture |
| Bootstrap | Script Node one-shot, lancé à la main | ~5-15 min total, re-runnable, pas de dépendance Vercel cron |
| Rate limiting | 2 req/sec | Politesse + safety vs limites Personal App (~5K/jour) |
| Fallback runtime | TCGdex en filet de secours pour les sets pas encore scrapés | Coût zéro de garder le code existant |
| pokemontcg.io | Supprimé | Redondant + EN-only + obsolète après catalogue local |

## Architecture

### Bootstrap (one-shot + après chaque release de set)

```
scripts/scrape-cardmarket.ts
  ↓
GET /games/6/expansions      → ~200 expansions Pokémon
  ↓
Pour chaque expansion (rate-limit 2 req/sec) :
  GET /expansions/{id}/singles → produits du set
  ↓
Mapping rarity/language Cardmarket → enums I.R.I.S
  ↓
Upsert batché Supabase (100/batch) ON CONFLICT (set_code, set_number, language)
  ↓
~25K rows insérées en ~5-15 min
```

### Runtime (à chaque scan)

```
OCR Vision (inchangé)
  ↓
app/api/enrich/route.ts
  ↓
Strategy 1 : SELECT FROM tcg_catalog
             WHERE set_code = ? AND set_number = ? AND language = ?
  ↓ (miss)
Strategy 2 : SELECT FROM tcg_catalog
             WHERE set_number = ? AND set_total = ? AND language = ?
             + disambiguation par nom OCR (logique existante conservée)
  ↓ (miss)
Strategy 3 : TCGdex live (filet de secours nouvelles sorties)
  ↓ (miss)
Strategy 4 : renvoie null + setCode/setNumber extraits
             → frontend pré-remplit ce qu'il a, user complète à la main
```

## Schéma base de données

Migration : `supabase/migrations/20260428000000_tcg_catalog.sql` (à ajuster au timestamp réel via `supabase migration new tcg_catalog`)

```sql
CREATE TABLE tcg_catalog (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  cardmarket_id   text          NOT NULL,
  set_code        text          NOT NULL,
  set_number      text          NOT NULL,
  set_total       int,
  language        card_language NOT NULL,
  card_name       text          NOT NULL,
  pokemon_name    text,
  pokemon_number  int,
  set_name        text          NOT NULL,
  rarity          card_rarity,
  image_url       text,
  scraped_at      timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT tcg_catalog_unique UNIQUE (set_code, set_number, language)
);

CREATE INDEX tcg_catalog_lookup_idx     ON tcg_catalog (set_code, set_number, language);
CREATE INDEX tcg_catalog_cardmarket_idx ON tcg_catalog (cardmarket_id);

ALTER TABLE tcg_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tcg_catalog_read_authenticated" ON tcg_catalog
  FOR SELECT TO authenticated USING (true);
```

**Notes** :
- `id` UUID synthétique pour ne pas se coupler à `cardmarket_id` (autorise migration de source future)
- `(set_code, set_number, language)` UNIQUE pour upsert idempotent
- Réutilise les enums existants `card_language` et `card_rarity`
- Pas de Storage : économise ~600 MB

## Composants à créer / modifier

### Nouveaux fichiers
- `supabase/migrations/<timestamp>_tcg_catalog.sql` — schéma + index + RLS
- `lib/api/cardmarket.ts` (server-only) — wrapper OAuth 1.0a + endpoints
- `lib/api/tcg-catalog.ts` (server-only) — helpers `lookupByCode`, `lookupByTotal`, `disambiguateByName`
- `scripts/scrape-cardmarket.ts` — bootstrap script
- `scripts/cardmarket-ping.ts` — petit script de validation OAuth (`/account` → 200)
- `lib/api/cardmarket.test.ts` — tests signature OAuth (vectors depuis doc Cardmarket)
- `lib/api/tcg-catalog.test.ts` — tests lookup + disambiguation

### Fichiers modifiés
- `app/api/enrich/route.ts` — réécriture des 4 strategies, surface API inchangée
- `lib/utils/extract-from-words.ts` — aucun changement (Strategy 3 fallback continue d'utiliser `findKnownSetCodeInText`)

### Fichiers supprimés
- `lib/api/tcgapi.ts` — pokemontcg.io obsolète
- `lib/api/tcgapi.test.ts` — tests obsolètes

### Fichiers conservés mais simplifiés
- `lib/api/tcgdex.ts` — garde `extractPokemonName`, `enrichWithFrenchNames`, `findCardsByTotalAndLocalId`, `lookupById` (utilisés par Strategy 3 fallback)

## Configuration utilisateur (action manuelle)

Variables `.env.local` à ajouter :
```
CARDMARKET_APP_TOKEN=...
CARDMARKET_APP_SECRET=...
CARDMARKET_ACCESS_TOKEN=...
CARDMARKET_ACCESS_TOKEN_SECRET=...
```

Étapes pour obtenir les tokens :
1. Créer compte Cardmarket (gratuit)
2. Page "My Account" → "App Center" → "New App"
3. Type : Personal App (le wording exact varie — choisir l'option non-Dedicated qui donne accès lecture catalogue. À valider via `cardmarket-ping.ts` à l'étape B7)
4. Récupérer les 4 tokens générés
5. Coller dans `.env.local`

**Si le type d'app choisi ne donne pas accès aux endpoints `/games/*/expansions` et `/expansions/*/singles`** : recréer en sélectionnant un autre type. La doc Cardmarket distingue "Widget App" (anonyme limité) et "App with Owner accounts" (ton compte uniquement). Notre besoin tombe dans la seconde.

## Plan d'implémentation par phases

### Phase A — Infrastructure DB (~1h)
1. Migration `tcg_catalog` (Section schéma)
2. `supabase db push`
3. Vérifier création + RLS dans Studio

### Phase B — Wrapper OAuth (~3-4h)
4. `lib/api/cardmarket.ts` : signature HMAC-SHA1, header builder, endpoints `findExpansions` / `getExpansionSingles` / `getProduct`
5. Tests unitaires sur la signature (vectors doc Cardmarket)
6. **Action user** : créer compte + Personal App + tokens dans `.env.local`
7. `scripts/cardmarket-ping.ts` : valide OAuth via `/account`

### Phase C — Bootstrap (~2-3h)
8. `scripts/scrape-cardmarket.ts` (logique de Section bootstrap)
9. **Premier run sur 1 expansion** (ex SV11W) — valide mapping rarity/language
10. Ajuster mapping si besoin
11. **Run complet** sur ~200 expansions
12. Vérification SQL : `SELECT count(*), language FROM tcg_catalog GROUP BY language`

### Phase D — Re-câblage runtime (~2h)
13. Réécrire `app/api/enrich/route.ts` avec 4 strategies
14. `lib/api/tcg-catalog.ts` (helpers)
15. Tests sur Supabase local
16. Tests E2E manuels via scanner mobile

### Phase E — Validation (~30 min)
17. Re-run `scripts/test-bench.ts`
18. Cible : ≥27/30 (90%+)
19. Si écart : analyser misses, ajuster

**Total : ~10-12h dev, ~30 min user (compte + tokens)**

## Points d'incertitude à valider à l'exécution

1. **Forme du payload `/expansions/{id}/singles`** : retourne-t-il toutes les langues d'une carte, ou faut-il une requête par langue ? Plan B documenté dans la section bootstrap.
2. **Vocabulaire de rarity Cardmarket** : leur taxonomie diffère de TCGdex. Mapping construit empiriquement au premier scrape, raffiné itérativement. Fallback `OTHER` pour les inconnus.
3. **Stabilité des URLs d'images Cardmarket** : si elles bougent dans 6 mois, on migre vers Storage. Pas un risque immédiat.
4. **Coverage réelle Cardmarket pour cartes JP anciennes** : on suppose que toutes les cartes vendues y sont. À vérifier au premier scrape — si BW JP manquait sur Cardmarket aussi, on devrait revoir la stratégie (peu probable mais possible).

## Critères de succès

- [ ] Migration `tcg_catalog` appliquée sans erreur
- [ ] Wrapper Cardmarket OAuth retourne 200 sur `/account`
- [ ] Scrape complet termine sans erreur fatale
- [ ] `SELECT count(*) FROM tcg_catalog` ≥ 20,000 lignes
- [ ] Au moins 1 carte de chaque set du bench présente en DB (vérification ciblée)
- [ ] Test bench : **≥27/30 enrichies correctement** (vs 10/30 actuellement)
- [ ] Tous les 66 tests existants passent (+ nouveaux tests cardmarket/catalog)
- [ ] Lint + types verts

## Hors scope (volontairement)

- Cron Vercel automatique pour ré-scrape (manuel suffit, ~6 sets/an)
- Téléchargement local des images (hot-link suffit pour MVP)
- UI admin pour éditer manuellement le catalogue (pas nécessaire si scrape complet)
- Multi-utilisateur (mono-user reste l'hypothèse)
- Cardmarket pricing live (Phase 3 dédiée)
