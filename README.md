# I.R.I.S

PWA 2-users (Lui + Elle) de gestion de collection Pokémon TCG partagée. **État actuel : Phase 4 terminée** (multi-user RLS via `card_listings` + `lot_listings`, identités Hisshiden/Hilyna avec couleurs distinctes, cross-listing per-user sur 2 comptes Vinted ; scan OCR multilang JP/EN/FR/KO/CN avec Gemini 3.1 Flash Lite Preview, Pokédex + Vinted + Stock + bulk vendu + cron pricing + lots bundles + bulk import web). 302 tests passing. Voir [CLAUDE.md](CLAUDE.md) pour le bilan détaillé.

- **Spec complète** : [context.md](context.md)
- **Setup local** : [docs/setup.md](docs/setup.md)
- **Conventions / orientation** : [CLAUDE.md](CLAUDE.md), [AGENTS.md](AGENTS.md)

## Commandes

```bash
npm run dev         # serveur Next.js en local
npm run build       # build de production
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint
npm run format      # Prettier --write
npm test            # Vitest
```

## Stack

Next.js 16 (App Router) · React 19 · Tailwind v4 · TypeScript strict · Supabase (Postgres + Storage + Auth) · Vercel.
