/**
 * Helpers for the PWA install flow. Shared between the auto-show banner
 * (components/layout/InstallPrompt.tsx) and the manual control panel
 * (components/options/PWAInstallSection.tsx).
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type Platform =
  /** iOS Safari — needs manual "Add to Home Screen" instructions. */
  | 'ios'
  /** Already running as installed PWA — no install needed. */
  | 'installed'
  /** Browsers that support beforeinstallprompt (Chrome, Edge, Samsung Internet). */
  | 'beforeinstallprompt'
  /** Desktop Safari, Firefox — no install path. */
  | 'unsupported';

/** True iff served from an installed PWA (standalone display mode). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // PWA installed via Chrome/Edge/Android
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  // PWA installed via iOS Safari "Add to Home Screen" (legacy property)
  return (window.navigator as { standalone?: boolean }).standalone === true;
}

/** True for iPad/iPhone/iPod regardless of browser. */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  // iPad on iOS 13+ reports "MacIntel" platform; check touch-points to
  // distinguish a real Mac from an iPad masquerading as one.
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

/**
 * Initial platform decision before the beforeinstallprompt event fires.
 * Returns 'ios' / 'installed' / 'unsupported'; the caller upgrades to
 * 'beforeinstallprompt' when (and if) the event fires.
 */
export function detectInitialPlatform(): Platform {
  if (isStandalone()) return 'installed';
  if (isIos()) return 'ios';
  return 'unsupported';
}
