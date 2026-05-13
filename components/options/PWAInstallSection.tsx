'use client';

import { useEffect, useState } from 'react';
import { Download, CheckCircle2, Smartphone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { IosInstructionsModal } from '@/components/layout/InstallPrompt';
import {
  detectInitialPlatform,
  type BeforeInstallPromptEvent,
  type Platform,
} from '@/lib/utils/pwa-install';

const DISMISS_KEY = 'iris.pwa.installDismissedAt';

/**
 * Always-visible PWA install control on the Options page. Mirrors the auto-show
 * banner but never auto-dismisses — lets the user install or view iOS steps
 * on demand, even after dismissing the banner.
 */
export default function PWAInstallSection() {
  const t = useTranslations('options');
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [showIosSteps, setShowIosSteps] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- detectInitialPlatform() reads navigator/matchMedia (no-op in SSR); deferred client-only init is the only option.
    setPlatform(detectInitialPlatform());

    // beforeinstallprompt may have already fired before this section mounted —
    // we won't catch it retroactively. We listen anyway for late-arriving
    // events (e.g. after a soft navigation).
    const handler = (e: Event) => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
      setPlatform('beforeinstallprompt');
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function install() {
    if (!event) return;
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === 'accepted') {
      // Clear the dismissal so a future re-install banner can appear.
      localStorage.removeItem(DISMISS_KEY);
      setPlatform('installed');
    }
  }

  if (platform === null) {
    return (
      <div className="bg-surface border-border rounded-lg border p-5">
        <h2 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
          {t('pwaInstallHeading')}
        </h2>
        <p className="text-text-faint text-sm">{t('pwaDetecting')}</p>
      </div>
    );
  }

  return (
    <div className="bg-surface border-border rounded-lg border p-5">
      <h2 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
        {t('pwaInstallHeading')}
      </h2>

      {platform === 'installed' && (
        <div className="text-text flex items-center gap-2 text-sm">
          <CheckCircle2 className="text-staleness-fresh h-4 w-4" aria-hidden />
          <span>{t('pwaInstalled')}</span>
        </div>
      )}

      {platform === 'beforeinstallprompt' && (
        <div>
          <p className="text-text-muted mb-3 text-sm">{t('pwaPromptDescription')}</p>
          <button
            type="button"
            onClick={install}
            className="bg-red text-white inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-90"
          >
            <Download className="h-4 w-4" aria-hidden />
            {t('pwaPromptInstall')}
          </button>
        </div>
      )}

      {platform === 'ios' && (
        <div>
          <p className="text-text-muted mb-3 text-sm">{t('pwaIosDescription')}</p>
          <button
            type="button"
            onClick={() => setShowIosSteps(true)}
            className="bg-red text-white inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-90"
          >
            <Smartphone className="h-4 w-4" aria-hidden />
            {t('pwaIosShowSteps')}
          </button>
        </div>
      )}

      {platform === 'unsupported' && (
        <div>
          <p className="text-text-muted text-sm">{t('pwaUnsupported')}</p>
        </div>
      )}

      {showIosSteps && <IosInstructionsModal onClose={() => setShowIosSteps(false)} />}
    </div>
  );
}
