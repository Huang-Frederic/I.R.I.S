'use client';

import { useMemo, useState } from 'react';
import categories from '@/lib/data/vinted-categories.json';

export interface VintedCategory {
  id: number;
  path: string;
}

interface Props {
  value: VintedCategory | null;
  onChange: (category: VintedCategory) => void;
}

const ALL = categories as VintedCategory[];
const MAX_RESULTS = 30;

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export default function CategoryPicker({ value, onChange }: Props) {
  const [query, setQuery] = useState(value?.path ?? '');
  const [open, setOpen] = useState(false);

  const results = useMemo(() => {
    const q = norm(query.trim());
    if (q === '') return [];
    return ALL.filter((c) => norm(c.path).includes(q)).slice(0, MAX_RESULTS);
  }, [query]);

  return (
    <div className="relative">
      <input
        type="text"
        role="textbox"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Rechercher une catégorie…"
        className="bg-surface-2 border-border focus:border-red w-full rounded border px-3 py-2 text-sm outline-none"
      />
      {open && results.length > 0 && (
        <ul className="border-border bg-surface absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded border shadow-lg">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(c);
                  setQuery(c.path);
                  setOpen(false);
                }}
                className="hover:bg-surface-2 block w-full px-3 py-2 text-left text-sm"
              >
                {c.path}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
