# I.R.I.S — Notes pour les agents IA

## Le projet en 30 secondes

PWA mono-utilisateur (Next.js 16, App Router, TypeScript, Tailwind v4, Supabase, Vercel) pour gérer une collection Pokémon TCG. Deux flux : Pokédex (1 carte par Pokémon, 1025 cellules) et stock Vinted (FIFO + prix Cardmarket live + générateur d'annonces).

Spec complète : [context.md](context.md). Plan d'implémentation en 4 phases : `~/.claude/plans/j-aimerais-que-tu-lises-cached-robin.md` (résumé dans `docs/`).

## Stack à connaître

- **Next.js 16** — breaking changes vs 14/15 ; `params` est async, App Router strict, manifest via `app/manifest.ts` (pas `next-pwa`).
- **Tailwind v4** — config dans `app/globals.css` via `@theme` (pas de `tailwind.config.ts`).
- **Supabase** — via `@supabase/ssr` (helpers serveur + client dans `lib/supabase/`).
- **Tests** — Vitest + Testing Library + happy-dom. Lancer : `npm test`.

## Conventions

- Strict TypeScript, ESLint + Prettier, Geist (font Google), thème dark par défaut.
- Pas de `localStorage` — Supabase est la source de vérité unique.
- App mono-utilisateur (pas de partage/multi-user). Auth Supabase email/password volontairement minimale.
- Le matching multi-langues TCG API se fait par `set_code + set_number`, pas par nom du Pokémon (universel JP/EN/FR…).

## Setup local

Lire `docs/setup.md` (à venir en 1.2) pour la création des comptes externes (Supabase, Google Vision).

## Choses à NE PAS faire

Cf. context.md section 14. Notamment : pas de `next-pwa`, pas d'historique de prix Cardmarket, pas d'offline-first, pas de monitoring externe.

## Compatibilité IA

Voir [AGENTS.md](AGENTS.md) pour les conventions multi-agents.
