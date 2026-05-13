'use client';

import { useTransition } from 'react';
import { LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { signOut } from '@/app/(auth)/login/actions';

export default function SignOutButton() {
  const [pending, startTransition] = useTransition();
  const t = useTranslations('auth');

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => signOut())}
      className="text-text-muted hover:bg-surface-2 hover:text-text flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors disabled:opacity-50"
    >
      <LogOut className="h-4 w-4" aria-hidden />
      <span>{pending ? t('signingOut') : t('signOut')}</span>
    </button>
  );
}
