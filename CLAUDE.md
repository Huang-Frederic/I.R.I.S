# I.R.I.S — Notes pour les agents IA

## Le projet en 30 secondes

PWA mono-utilisateur (Next.js 16, App Router, TypeScript, Tailwind v4, Supabase, Vercel) pour gérer une collection Pokémon TCG. Deux flux : Pokédex (1 carte par Pokémon, 1025 cellules) et stock Vinted (FIFO + prix Cardmarket live + générateur d'annonces).

Spec complète : [context.md](context.md). Plan d'implémentation en 4 phases : `~/.claude/plans/j-aimerais-que-tu-lises-cached-robin.md`.

## Avancement

- **Phase 1** — TERMINEE. Auth, layout, OCR, enrichissement TCGdex, scan mobile, suggestion Pokédex, grille Pokédex, candidate picker. 52 tests, 0 lint warning.
- **Phase 1.11** — TERMINEE. Catalogue local Pokémon TCG via scraping LimitlessTCG. 111K cartes JP/EN/FR/DE/IT/ES/PT. Enrichissement post-scan passe de 33% à 63-73% (test bench). 81 tests, 0 lint warning.
- **Phase 2** — A FAIRE. Module Vinted (liste FIFO, générateur d'annonce, action "vendu").
- **Phase 3** — A FAIRE. Cardmarket OAuth, cron prix, mode lot, script Python CLI.
- **Phase 4** — A FAIRE. Dashboard, bulk vendu, polish PWA.

Bilan détaillé : [docs/phase1-summary.md](docs/phase1-summary.md).

## Stack à connaître

- **Next.js 16** — `proxy.ts` (pas `middleware.ts`), `params` est async, App Router strict, manifest via `app/manifest.ts`.
- **Tailwind v4** — config dans `app/globals.css` via `@theme` (pas de `tailwind.config.ts`).
- **Supabase** — via `@supabase/ssr` (helpers dans `lib/supabase/`).
- **TCGdex** — Fallback API live pour sets non scrapés. Cardmarket pricing inclus.
- **LimitlessTCG** — Source du catalogue local (111K cartes, scraping robots.txt OK).
- **Google Vision** — `DOCUMENT_TEXT_DETECTION` + `languageHints: ['ja', 'en']`.
- **Tests** — Vitest + happy-dom. Lancer : `npm test`.

## Architecture clé

| Module | Fichiers |
|---|---|
| OCR | `lib/api/vision.ts`, `app/api/ocr/route.ts` |
| Catalogue local | `lib/api/tcg-catalog.ts`, table `tcg_catalog` (111K cartes) |
| Scraper LimitlessTCG | `scripts/scrape-limitlesstcg.ts` (~12 min, 7 langues, 1163 sets) |
| Enrichissement | `app/api/enrich/route.ts` (catalogue → TCGdex fallback) |
| Smart extraction | `lib/utils/extract-from-words.ts` (set_code + set_number depuis bounding boxes Vision) |
| Scan mobile | `components/submit/MobileSubmit.tsx` (OCR → enrich → candidate picker → form → save) |
| Suggestion | `lib/utils/pokedex-suggestion.ts`, `app/api/pokedex/suggest/route.ts` |
| Pokédex | `components/pokedex/PokedexGrid.tsx`, `components/pokedex/PokedexDrawer.tsx` |

## Pipeline d'enrichissement

1. OCR (Vision) → texte + bounding boxes → extraction smart set_number + set_code
2. Enrich Strategy 1 : `setCode + setNumber` → lookup direct table `tcg_catalog`
3. Enrich Strategy 2 : `total + setNumber` → lookup loose dans `tcg_catalog` (gère JP où denominator imprimé != cardCount officiel) + disambiguation par nom OCR
4. Enrich Strategy 3 : TCGdex live fallback (nouveaux sets pas encore dans le catalogue)
5. Strategy 4 : null (OCR extractions conservées pour pré-remplir le form, user complète à la main)

**Disambiguation par nom** : si le nom du Pokémon dans l'OCR match un seul candidat → auto-select. Sinon → picker visuel.

## Conventions

- Strict TypeScript, ESLint + Prettier, Geist (font Google), theme dark par defaut.
- Pas de `localStorage` — Supabase est la source de verite unique.
- App mono-utilisateur. Auth Supabase email/password minimale.
- Matching multi-langues par `set_code + set_number` (universel JP/EN/FR).

## Setup local

Lire [docs/setup.md](docs/setup.md) pour la creation des comptes externes (Supabase, Google Vision).

**Note pour scripts locaux** : si erreur `UNABLE_TO_VERIFY_LEAF_SIGNATURE` lors du scraping LimitlessTCG, lancer `export INSECURE_HTTPS=1` avant le script (contournement temporaire pour certificats strictement valides mais rejetés par Node 22 sur WSL).

## Choses a NE PAS faire

Cf. context.md section 14. Notamment : pas de `next-pwa`, pas d'historique de prix Cardmarket, pas d'offline-first, pas de monitoring externe.

**Cardmarket API** : fermée aux nouvelles applications depuis 2023. Ne pas tenter d'obtenir des tokens OAuth Cardmarket — le catalogue est alimenté par scraping LimitlessTCG (robots.txt OK).

## Compatibilite IA

Voir [AGENTS.md](AGENTS.md) pour les conventions multi-agents.
