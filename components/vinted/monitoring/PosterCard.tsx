// components/vinted/monitoring/PosterCard.tsx
'use client';

import { useState } from 'react';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export interface PosterCardAction {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface PosterCardProps {
  /** Sortable id — must match the id passed to the parent's `SortableContext`. */
  id: string;
  imageUrl: string;
  name: string;
  price: number | null;
  draggable: boolean;
  dimmed?: boolean;
  /** Always-visible corner badge, e.g. queue position "#3". */
  badge?: string;
  actions: PosterCardAction[];
}

export default function PosterCard({ id, imageUrl, name, price, draggable, dimmed = false, badge, actions }: PosterCardProps) {
  const [revealed, setRevealed] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id, disabled: !draggable });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(draggable ? { ...attributes, ...listeners } : {})}
      onClick={() => setRevealed((r) => !r)}
      className={`group border-border bg-surface-2 relative aspect-[63/88] w-28 shrink-0 overflow-hidden rounded-lg border sm:w-32 lg:w-36 ${dimmed ? 'opacity-60' : ''}`}
    >
      {badge && (
        <span className="bg-bg/80 text-text-faint absolute left-1 top-1 z-10 rounded px-1 font-mono text-[10px]">
          {badge}
        </span>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt="" className="h-full w-full object-contain" />
      <div
        data-testid="poster-card-overlay"
        className={`absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/60 p-2 text-center backdrop-blur-[1px] transition-opacity ${
          revealed ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        <p className="line-clamp-2 text-xs font-medium text-white">{name}</p>
        {price !== null && <p className="text-rarity-r text-sm font-semibold">{price.toFixed(2)} €</p>}
        <div className="flex gap-1.5">
          {actions.map((action, i) => (
            <button
              key={i}
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                action.onClick();
              }}
              disabled={action.disabled}
              title={action.label}
              aria-label={action.label}
              className="rounded bg-white/10 p-1.5 text-white hover:bg-white/20 disabled:opacity-30"
            >
              <action.icon className="h-3.5 w-3.5" aria-hidden />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CardConnector({ variant = 'card' }: { variant?: 'card' | 'group' }) {
  return (
    <div className="flex shrink-0 items-center self-center" aria-hidden>
      <ChevronRight className={variant === 'group' ? 'text-text-muted h-5 w-5' : 'text-text-faint h-4 w-4'} />
    </div>
  );
}
