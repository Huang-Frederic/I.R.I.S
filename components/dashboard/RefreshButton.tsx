'use client';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const t = useTranslations('dashboard');

  function refresh() {
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={refresh}
      disabled={pending}
      aria-label={t('refresh')}
      title={t('refresh')}
      className="text-text-muted hover:text-text hover:bg-surface-2 rounded-md p-1.5 transition-colors disabled:opacity-60"
    >
      <RefreshCw className={`h-4 w-4 ${pending ? 'animate-spin' : ''}`} aria-hidden />
    </button>
  );
}
