'use client';

import { useEffect, useState } from 'react';
import { Download, CheckCircle2, Smartphone } from 'lucide-react';
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
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [showIosSteps, setShowIosSteps] = useState(false);

  useEffect(() => {
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
          Installation
        </h2>
        <p className="text-text-faint text-sm">Détection en cours...</p>
      </div>
    );
  }

  return (
    <div className="bg-surface border-border rounded-lg border p-5">
      <h2 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
        Installation
      </h2>

      {platform === 'installed' && (
        <div className="text-text flex items-center gap-2 text-sm">
          <CheckCircle2 className="text-staleness-fresh h-4 w-4" aria-hidden />
          <span>I.R.I.S est installée sur cet appareil.</span>
        </div>
      )}

      {platform === 'beforeinstallprompt' && (
        <div>
          <p className="text-text-muted mb-3 text-sm">
            Ajoute I.R.I.S à ton écran d&apos;accueil pour un accès rapide.
          </p>
          <button
            type="button"
            onClick={install}
            className="bg-red text-white inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-90"
          >
            <Download className="h-4 w-4" aria-hidden />
            Installer l&apos;application
          </button>
        </div>
      )}

      {platform === 'ios' && (
        <div>
          <p className="text-text-muted mb-3 text-sm">
            Sur iPhone, l&apos;installation se fait depuis Safari via le menu Partager.
          </p>
          <button
            type="button"
            onClick={() => setShowIosSteps(true)}
            className="bg-red text-white inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-90"
          >
            <Smartphone className="h-4 w-4" aria-hidden />
            Voir les étapes
          </button>
        </div>
      )}

      {platform === 'unsupported' && (
        <div>
          <p className="text-text-muted text-sm">
            Ton navigateur ne propose pas d&apos;installation directe. Utilise Chrome, Edge ou Safari (iOS) pour ajouter I.R.I.S à ton écran d&apos;accueil.
          </p>
        </div>
      )}

      {showIosSteps && <IosInstructionsModal onClose={() => setShowIosSteps(false)} />}
    </div>
  );
}
