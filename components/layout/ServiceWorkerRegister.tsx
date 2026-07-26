'use client';

import { useEffect } from 'react';

/**
 * Registers the asset-caching service worker (public/sw.js) once on mount.
 * Best-effort — a failure (unsupported browser, private mode) is a no-op and
 * the app works exactly as before.
 *
 * Production only. sw.js caches /_next/static/ cache-first, which is safe when
 * filenames are content-hashed — but the dev server serves chunks at stable
 * paths, so the worker pins the first build it ever saw. The symptom is nasty
 * to diagnose: edits stop appearing, and React reports a hydration mismatch
 * because the server HTML is current while the client bundle is not. Clearing
 * .next and restarting the server does nothing, since the stale copy lives in
 * the browser. Anyone who already installed it gets unregistered here.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .then(() => caches?.keys())
        .then((keys) => Promise.all((keys ?? []).map((k) => caches.delete(k))))
        .catch(() => {});
      return;
    }

    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return null;
}
