'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

const LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'ja', label: '日本語' },
  { code: 'zh', label: '中文' },
] as const;

const COOKIE_NAME = 'lang';
const ONE_YEAR = 60 * 60 * 24 * 365;

function persistLocale(code: string) {
  document.cookie = `${COOKIE_NAME}=${code}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
}

export default function LanguageToggle() {
  const router = useRouter();
  const initialLocale = useLocale();
  const [current, setCurrent] = useState<string>(initialLocale);
  const t = useTranslations('options');

  const pick = (next: string) => {
    if (next === current) return;
    setCurrent(next);
    persistLocale(next);
    router.refresh();
  };

  return (
    <div
      className="border-border inline-flex flex-wrap overflow-hidden rounded-md border"
      role="group"
      aria-label={t('language')}
    >
      {LOCALES.map(({ code, label }) => (
        <button
          key={code}
          type="button"
          onClick={() => pick(code)}
          aria-pressed={current === code}
          className={`px-3 py-1.5 text-sm transition-colors ${
            current === code
              ? 'bg-red text-white'
              : 'text-text-muted hover:text-text hover:bg-surface-2'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
