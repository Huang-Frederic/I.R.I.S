import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

export async function proxy(request: NextRequest) {
  return updateSession(request);
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
