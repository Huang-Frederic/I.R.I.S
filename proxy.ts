import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from '@/i18n';

const LANG_COOKIE = 'lang';
const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export async function proxy(request: NextRequest) {
  const response = await updateSession(request);

  // First-visit locale detection. The cookie is read by `i18n.ts` to pick the
  // active locale for next-intl. Once set (either by this best-match probe or
  // by the in-app LanguageToggle), we never touch it again.
  if (!request.cookies.has(LANG_COOKIE)) {
    response.cookies.set(LANG_COOKIE, pickBestLocale(request.headers.get('accept-language') ?? ''), {
      path: '/',
      maxAge: LANG_COOKIE_MAX_AGE,
      sameSite: 'lax',
    });
  }

  return response;
}

function pickBestLocale(acceptHeader: string): string {
  // "fr-FR,fr;q=0.9,en;q=0.8" → ['fr-FR', 'fr', 'en'] → first one whose base
  // is in our supported set.
  const tags = acceptHeader.split(',').map((s) => s.split(';')[0].trim().toLowerCase());
  for (const tag of tags) {
    const base = tag.split('-')[0];
    if (SUPPORTED_LOCALES.includes(base as never)) return base;
  }
  return DEFAULT_LOCALE;
}

export const config = {
  matcher: [
    /*
     * Run on every path except:
     * - /_next/static, /_next/image (Next.js internals)
     * - /favicon.ico, /manifest.webmanifest (PWA + favicon)
     * - /icons/* (PWA icons)
     * - /api/prices/update (cron, protected by CRON_SECRET instead of Supabase auth)
     * - any image asset
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|api/prices/update|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
