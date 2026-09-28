'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
 *  don't re-implement outside-click handling from scratch.
 *
 *  The open dropdown is rendered through a portal into `document.body`,
 *  positioned from the trigger's own `getBoundingClientRect()` — rows that
 *  opt into `content-visibility: auto` for scroll performance (Vinted/Lot
 *  rows) implicitly get CSS paint containment, which clips any
 *  absolutely-positioned descendant to the row's own box exactly like
 *  `overflow: hidden` would. A portal escapes that containment entirely. */
export default function RowActionsMenu({ items, ariaLabel, indicator }: Props) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    // Closes rather than re-positions on scroll — simpler than tracking the
    // trigger's position live, and a menu that's about to scroll out of
    // view being dismissed is the expected behavior for this kind of
    // viewport-anchored (not container-anchored) dropdown anyway.
    function handleScroll() {
      setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [open]);

  if (items.length === 0) return null;

  function toggleOpen() {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setOpen((o) => !o);
  }

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleOpen}
        className="border-border hover:bg-surface-2 relative rounded-lg border p-1.5 sm:p-2"
        aria-label={ariaLabel}
      >
        <MoreVertical className="h-4 w-4" aria-hidden />
        {indicator && (
          <span className="bg-orange-500 absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full" aria-hidden />
        )}
      </button>
      {open &&
        position &&
        createPortal(
          <div
            ref={menuRef}
            style={{ top: position.top, right: position.right }}
            className="border-border bg-surface fixed z-50 w-48 overflow-hidden rounded-lg border shadow-lg"
          >
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
          </div>,
          document.body,
        )}
    </div>
  );
}
