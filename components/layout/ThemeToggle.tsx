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

  const setActive = (next: Theme) => {
    if (next === theme) return;
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    document.cookie = `theme=${next}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
  };

  // Both buttons are always visible side-by-side. The currently-active mode is
  // disabled (and visually highlighted) so the user can see at a glance which
  // mode is on; clicking the other one switches instantly.
  return (
    <div className="border-border inline-flex overflow-hidden rounded-md border" role="group" aria-label="Mode d'affichage">
      <button
        type="button"
        onClick={() => setActive('light')}
        disabled={theme === 'light'}
        aria-pressed={theme === 'light'}
        className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
          theme === 'light'
            ? 'bg-red-bg text-red font-medium cursor-default'
            : 'bg-surface-2 text-text-muted hover:text-text'
        }`}
      >
        <Sun className="h-4 w-4" aria-hidden />
        Mode clair
      </button>
      <button
        type="button"
        onClick={() => setActive('dark')}
        disabled={theme === 'dark'}
        aria-pressed={theme === 'dark'}
        className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
          theme === 'dark'
            ? 'bg-red-bg text-red font-medium cursor-default'
            : 'bg-surface-2 text-text-muted hover:text-text'
        }`}
      >
        <Moon className="h-4 w-4" aria-hidden />
        Mode sombre
      </button>
    </div>
  );
}
