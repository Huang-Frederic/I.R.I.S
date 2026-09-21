'use client';

import { useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';

export interface RowActionsMenuItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

interface Props {
  items: RowActionsMenuItem[];
  ariaLabel: string;
  /** Shows a small dot on the trigger when something inside the (closed)
   *  menu needs attention — e.g. a stale listing that used to have its own
   *  always-visible ring before its trigger moved in here. */
  indicator?: boolean;
}

/** Generic "..." row-actions menu — extracted from the duplicated pattern in
 *  ptcg's TournamentDetailPage/DrillHome so new call sites (Vinted rows)
 *  don't re-implement outside-click handling from scratch. */
export default function RowActionsMenu({ items, ariaLabel, indicator }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div className="relative shrink-0" ref={open ? ref : undefined}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="border-border hover:bg-surface-2 relative rounded-lg border p-1.5 sm:p-2"
        aria-label={ariaLabel}
      >
        <MoreVertical className="h-4 w-4" aria-hidden />
        {indicator && (
          <span className="bg-orange-500 absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full" aria-hidden />
        )}
      </button>
      {open && (
        <div className="border-border bg-surface absolute right-0 z-10 mt-1 w-48 overflow-hidden rounded-lg border shadow-lg">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={`hover:bg-surface-2 flex w-full items-center gap-2 px-3 py-2 text-left text-sm disabled:opacity-40 ${item.destructive ? 'text-red' : ''}`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
