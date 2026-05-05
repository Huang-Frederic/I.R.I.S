'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

/**
 * Triggers `router.refresh()` whenever the route pathname changes inside the
 * (app) segment. Without this, Next.js serves the cached client tree on a
 * back-and-forth like Stock → Pokédex → Stock, even though a sibling tab may
 * have just inserted a row in the DB. The refresh re-runs the server
 * component for the new route and pushes new SSR props down — combined with
 * the matching `useEffect(() => set...(initial), [initial])` in each list,
 * the UI stays in sync without a full page reload.
 *
 * The first render (initialPathname) is intentionally skipped — the SSR is
 * already fresh; we only refresh on subsequent navigations.
 */
export default function RouteChangeRefresher() {
  const pathname = usePathname();
  const router = useRouter();
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    router.refresh();
  }, [pathname, router]);

  return null;
}
