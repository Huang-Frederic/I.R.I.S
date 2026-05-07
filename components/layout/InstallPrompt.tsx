'use client';
import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

const DISMISS_KEY = 'iris.pwa.installDismissedAt';
const DISMISS_TTL_MS = 14 * 86_400_000; // re-prompt 2 weeks after dismissal

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function shouldHide(): boolean {
  // Already running as installed PWA → never prompt
  if (typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches) {
    return true;
  }
  const dismissed = typeof localStorage !== 'undefined' ? localStorage.getItem(DISMISS_KEY) : null;
  if (!dismissed) return false;
  const dismissedAt = Number(dismissed);
  if (!Number.isFinite(dismissedAt)) return false;
  return Date.now() - dismissedAt < DISMISS_TTL_MS;
}

export default function InstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (shouldHide()) return;
    const handler = (e: Event) => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
      setHidden(false);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setHidden(true);
  }

  async function install() {
    if (!event) return;
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === 'accepted') {
      // App installed — don't store a dismiss timestamp; the standalone-mode check will hide future prompts
      setHidden(true);
    } else {
      dismiss();
    }
  }

  if (hidden || !event) return null;

  return (
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
      <button
        type="button"
        onClick={install}
        className="bg-red text-white inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90"
      >
        <Download className="h-3.5 w-3.5" aria-hidden />
        Installer
      </button>
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
  );
}
