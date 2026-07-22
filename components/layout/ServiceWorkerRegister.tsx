'use client';

import { useEffect } from 'react';

/**
 * Registers the asset-caching service worker (public/sw.js) once on mount.
 * Best-effort — a failure (unsupported browser, private mode) is a no-op and
 * the app works exactly as before.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return null;
}
