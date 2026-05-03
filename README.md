# I.R.I.S

PWA mono-utilisateur de gestion de collection Pokémon TCG. **État actuel : Phase 3 terminée** (scan OCR + Pokédex + Vinted + Stock + cron pricing + lots bundles + bulk import web + bulk vendu + Gemini tokens optim). Voir [CLAUDE.md](CLAUDE.md) pour le bilan détaillé.

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
