'use client';

import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';

type Theme = 'dark' | 'light';

interface ThemeToggleProps {
  initialTheme: Theme;
}

const ONE_YEAR = 60 * 60 * 24 * 365;

export default function ThemeToggle({ initialTheme }: ThemeToggleProps) {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    document.cookie = `theme=${next}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
  }

  const Icon = theme === 'dark' ? Sun : Moon;
  const label = theme === 'dark' ? 'Mode clair' : 'Mode sombre';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      className="text-text-muted hover:bg-surface-2 hover:text-text flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors"
    >
      <Icon className="h-4 w-4" aria-hidden />
      <span>{label}</span>
    </button>
  );
}
