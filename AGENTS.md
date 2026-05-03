# I.R.I.S — Conventions multi-agents

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version (Next.js 16) has breaking changes — APIs, conventions, and file structure may differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Specifically for I.R.I.S

- `params` props in route handlers and pages are **async** in Next 16 — `await params` before use.
- PWA manifest lives in `app/manifest.ts` (Next 16 built-in), not `public/manifest.json` and not `next-pwa`.
- Tailwind v4 — design tokens in `app/globals.css` via `@theme { ... }`, no `tailwind.config.ts` file.
- Supabase clients : use `@supabase/ssr` (`createServerClient` for RSC/route handlers, `createBrowserClient` for client components). Never import the auth-helpers package — it's deprecated.
- Always read `context.md` (full spec) and `CLAUDE.md` (orientation) before adding features.
- L'état d'avancement réel du projet est dans [CLAUDE.md](CLAUDE.md) (mis à jour en continu) et [docs/phases-summary.md](docs/phases-summary.md). Le `context.md` est la spec ORIGINALE — elle a divergé sur plusieurs points (Cardmarket API fermée, Python script abandonné, mode lot pivot vers bundles). Toujours croiser avec CLAUDE.md.
