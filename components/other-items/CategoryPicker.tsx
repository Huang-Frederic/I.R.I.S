'use client';

import { useId, useMemo, useState } from 'react';
import categories from '@/lib/data/vinted-categories.json';

export interface VintedCategory {
  id: number;
  path: string;
}

interface Props {
  value: VintedCategory | null;
  onChange: (category: VintedCategory) => void;
  /** Id of the visible label — the picker must not sit inside a <label>
   *  (see below), so it's named through aria-labelledby instead. */
  labelledBy?: string;
}

const ALL = categories as VintedCategory[];
const MAX_RESULTS = 30;

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Type-to-search over Vinted's categories. The list only opens while the
 * user is typing, and closes on a pick, a click elsewhere (blur) or Escape.
 * Options are picked on mousedown with the default prevented, so the input
 * never loses focus mid-pick. It used to sit inside a <label>: a click on an
 * option removed it from the page before the browser ran the label's
 * activation, which then sent the click on to the input — refocusing it and
 * reopening the list it had just closed, stuck over the fields below.
 */
export default function CategoryPicker({ value, onChange, labelledBy }: Props) {
  const listId = useId();
  const [query, setQuery] = useState(value?.path ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const results = useMemo(() => {
    const q = norm(query.trim());
    if (q === '') return [];
    return ALL.filter((c) => norm(c.path).includes(q)).slice(0, MAX_RESULTS);
  }, [query]);

  const showList = open && results.length > 0;

  function pick(category: VintedCategory) {
    onChange(category);
    setQuery(category.path);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!showList) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      // Enter in a form field would otherwise submit the item form.
      e.preventDefault();
      pick(results[Math.min(active, results.length - 1)]);
    }
  }

  return (
    <div className="relative mt-1">
      <input
        type="text"
        role="textbox"
        aria-labelledby={labelledBy}
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        placeholder="Rechercher une catégorie…"
        className="bg-surface-2 border-border focus:border-red w-full rounded border px-3 py-2 text-sm outline-none"
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="border-border bg-surface absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded border shadow-lg"
        >
          {results.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === active}
              // mousedown, not click: keeps the focus in the input (no blur
              // closing the list before the pick lands).
              onMouseDown={(e) => {
                e.preventDefault();
                pick(c);
              }}
              onClick={() => pick(c)}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-2 text-sm ${i === active ? 'bg-surface-2' : ''}`}
            >
              {c.path}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
