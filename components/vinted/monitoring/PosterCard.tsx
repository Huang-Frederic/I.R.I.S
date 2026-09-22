// components/vinted/monitoring/PosterCard.tsx
'use client';

import { useState } from 'react';
import { ChevronRight, ChevronLeft, ChevronUp, Monitor, type LucideIcon } from 'lucide-react';
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
  /** Forces the green dashed "changed" border even when this card isn't the
   *  live drop target — the parent sets this for any item that moved since
   *  the last save, so the marker survives past the drag gesture itself. */
  isPendingChange?: boolean;
}

export function posterCardBorderClasses({
  isDragging,
  isPendingChange,
}: {
  isDragging: boolean;
  isPendingChange: boolean;
}): string {
  if (isDragging || isPendingChange) return 'border-staleness-fresh border-dashed';
  return 'border-white';
}

export default function PosterCard({
  id,
  imageUrl,
  name,
  price,
  draggable,
  dimmed = false,
  badge,
  actions,
  isPendingChange = false,
}: PosterCardProps) {
  const [revealed, setRevealed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !draggable,
  });
  // Tailwind v4 wraps `hover:`/`group-hover:` in `@media (hover: hover)` by
  // default, which some devices/browsers report as false even with a real
  // mouse attached — CSS group-hover silently never applies there. Tracking
  // hover with real mouse events instead is deterministic regardless of
  // what the device claims about its own capabilities.
  const showOverlay = revealed || hovered;
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(draggable ? { ...attributes, ...listeners } : {})}
      onClick={() => setRevealed((r) => !r)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`bg-surface-2 relative aspect-[63/88] w-34 shrink-0 overflow-hidden rounded-lg border sm:w-38 lg:w-43 ${posterCardBorderClasses({ isDragging, isPendingChange })} ${
        isDragging ? 'opacity-40' : dimmed ? 'opacity-60' : ''
      }`}
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
          showOverlay ? 'opacity-100' : 'opacity-0'
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
              className="rounded bg-white/10 p-1.5 text-white hover:bg-red disabled:opacity-30"
            >
              <action.icon className="h-3.5 w-3.5" aria-hidden />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CardConnector({
  variant = 'card',
  direction = 'right',
}: {
  variant?: 'card' | 'group';
  direction?: 'right' | 'left' | 'up';
}) {
  const Icon = direction === 'left' ? ChevronLeft : direction === 'up' ? ChevronUp : ChevronRight;
  return (
    <div className="flex shrink-0 items-center self-center" aria-hidden>
      <Icon className={variant === 'group' ? 'text-text-muted h-5 w-5' : 'text-text-faint h-4 w-4'} />
    </div>
  );
}

/** Static lead-in slot rendered before the queue grid's first card, showing where the flow is headed (Vinted). Never draggable/sortable — it's not a real item. */
export function PosterCardStartSlot() {
  return (
    <div
      className="border-border bg-surface flex aspect-[63/88] w-34 shrink-0 items-center justify-center rounded-lg border border-dashed sm:w-38 lg:w-43"
      title="Ta collection"
      aria-hidden
    >
      <Monitor className="text-text-faint h-8 w-8" />
    </div>
  );
}

/**
 * The floating clone that follows the cursor during a drag (rendered inside
 * each grid's <DragOverlay>). Deliberately styled to look nothing like the
 * stationary, red, faded source card sitting in the list behind it — a
 * plain-bordered dark clone was getting visually confused with that source
 * card, making it look like "the red thing is moving" when it was actually
 * this preview.
 */
export function PosterCardDragPreview({ imageUrl }: { imageUrl: string }) {
  return (
    <div className="aspect-[63/88] w-34 scale-110 overflow-hidden rounded-lg border border-white bg-white shadow-xl sm:w-38 lg:w-43">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt="" className="h-full w-full object-contain" />
    </div>
  );
}
