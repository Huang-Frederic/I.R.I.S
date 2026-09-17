'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';
import { CATEGORY_OPTIONS } from '@/lib/ptcg/tournament-meta';
import type { PtcgTournamentCategory } from '@/lib/types';

interface Props {
  value: PtcgTournamentCategory;
  onChange: (value: PtcgTournamentCategory) => void;
}

/** Category needs an icon per option, which a native <select>'s <option>
 *  elements can't render — so this is a small custom button + list
 *  dropdown, following the same click-outside-closes pattern as
 *  DrillHome's row action menu. */
export default function CategorySelect({ value, onChange }: Props) {
  const t = useTranslations('ptcg');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = CATEGORY_OPTIONS.find((o) => o.value === value) ?? CATEGORY_OPTIONS[0];
  const SelectedIcon = selected.icon;

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t(selected.labelKey)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="border-border bg-surface-2 flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm"
      >
        <SelectedIcon className="h-4 w-4 shrink-0" aria-hidden />
        <span className="flex-1">{t(selected.labelKey)}</span>
        <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
      </button>
      {open && (
        <ul
          role="listbox"
          className="border-border bg-surface absolute z-10 mt-1 w-full overflow-hidden rounded-lg border shadow-lg"
        >
          {CATEGORY_OPTIONS.map((o) => {
            const Icon = o.icon;
            return (
              <li key={o.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className="hover:bg-surface-2 flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  {t(o.labelKey)}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
