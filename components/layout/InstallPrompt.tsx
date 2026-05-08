'use client';
import { useEffect, useState } from 'react';
import { Download, X, Share, Plus } from 'lucide-react';
import {
  detectInitialPlatform,
  type BeforeInstallPromptEvent,
  type Platform,
} from '@/lib/utils/pwa-install';

const DISMISS_KEY = 'iris.pwa.installDismissedAt';
const DISMISS_TTL_MS = 14 * 86_400_000; // re-prompt 2 weeks after dismissal

function dismissedRecently(): boolean {
  if (typeof localStorage === 'undefined') return false;
  const dismissed = localStorage.getItem(DISMISS_KEY);
  if (!dismissed) return false;
  const dismissedAt = Number(dismissed);
  if (!Number.isFinite(dismissedAt)) return false;
  return Date.now() - dismissedAt < DISMISS_TTL_MS;
}

export default function InstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [hidden, setHidden] = useState(true);
  const [showIosSteps, setShowIosSteps] = useState(false);

  useEffect(() => {
    if (dismissedRecently()) return;
    const initial = detectInitialPlatform();
    setPlatform(initial);
    if (initial === 'ios') {
      setHidden(false);
      return;
    }
    if (initial === 'installed') return;

    // Wait for Chrome/Edge/Android to fire the install event.
    const handler = (e: Event) => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
      setPlatform('beforeinstallprompt');
      setHidden(false);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setHidden(true);
    setShowIosSteps(false);
  }

  async function install() {
    if (!event) return;
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === 'accepted') {
      // App installed — no need to record dismissal; the standalone-mode
      // check will hide all future prompts.
      setHidden(true);
    } else {
      dismiss();
    }
  }

  if (hidden || platform === null) return null;

  return (
    <>
      <div
        role="dialog"
        aria-label="Installer I.R.I.S"
        className="bg-surface border-border fixed inset-x-3 bottom-20 z-40 flex items-center gap-3 rounded-lg border p-3 shadow-lg md:bottom-3 md:left-auto md:right-3 md:max-w-sm"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" className="h-9 w-9 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-text text-sm font-medium">Installer I.R.I.S</p>
          <p className="text-text-muted text-xs">Accès rapide depuis l&apos;écran d&apos;accueil</p>
        </div>
        {platform === 'beforeinstallprompt' ? (
          <button
            type="button"
            onClick={install}
            className="bg-red text-white inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Installer
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setShowIosSteps(true)}
            className="bg-red text-white inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90"
          >
            Comment ?
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Plus tard"
          title="Plus tard"
          className="text-text-muted hover:bg-surface-2 shrink-0 rounded-md p-1 transition-colors"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {showIosSteps && <IosInstructionsModal onClose={() => setShowIosSteps(false)} />}
    </>
  );
}

/**
 * iOS Safari has no install API — the user must use the share menu manually.
 * Shown as a modal sheet with illustrated steps.
 */
export function IosInstructionsModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Installer sur iPhone"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="bg-surface border-border w-full max-w-md rounded-t-2xl border p-6 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-text text-lg font-semibold">Installer sur iPhone</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="text-text-muted hover:bg-surface-2 rounded-md p-1"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <ol className="space-y-3 text-sm">
          <li className="flex items-start gap-3">
            <span className="bg-surface-2 text-text-muted flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium">
              1
            </span>
            <p className="text-text">
              Touche le bouton <Share className="mx-1 inline h-4 w-4 align-text-bottom" aria-label="Partager" /> en bas de Safari
            </p>
          </li>
          <li className="flex items-start gap-3">
            <span className="bg-surface-2 text-text-muted flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium">
              2
            </span>
            <p className="text-text">
              Fais défiler puis touche{' '}
              <span className="bg-surface-2 inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs">
                <Plus className="h-3 w-3" aria-hidden /> Sur l&apos;écran d&apos;accueil
              </span>
            </p>
          </li>
          <li className="flex items-start gap-3">
            <span className="bg-surface-2 text-text-muted flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium">
              3
            </span>
            <p className="text-text">Touche &quot;Ajouter&quot; en haut à droite. C&apos;est tout.</p>
          </li>
        </ol>

        <p className="text-text-muted mt-4 text-xs">
          L&apos;app apparaît alors comme une icône à part entière, sans la barre Safari.
        </p>
      </div>
    </div>
  );
}
