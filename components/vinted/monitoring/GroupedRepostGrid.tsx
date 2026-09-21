// components/vinted/monitoring/GroupedRepostGrid.tsx
'use client';

import { ArrowLeftToLine, RotateCw } from 'lucide-react';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { sortByGroupPriority } from '@/lib/vinted/group-sort';
import { GROUP_FRAME_CLASSES, GROUP_LABEL_CLASSES, colorKeyForGroup } from '@/lib/vinted/group-frame-colors';

export interface RepostPoolItem {
  cardId: string | null;
  lotId: string | null;
  name: string;
  price: number | null;
  imageUrl: string;
  vintedPostedAt: string;
  groupKey: string;
  repostPosition: number | null;
}

function itemId(item: RepostPoolItem): string {
  return (item.cardId ?? item.lotId) as string;
}

interface Group {
  key: string;
  items: RepostPoolItem[];
}

/** `items` must already be sorted so same-groupKey items are contiguous (sortByGroupPriority guarantees this). */
function groupContiguousItems(items: RepostPoolItem[]): Group[] {
  const groups: Group[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.key === item.groupKey) {
      last.items.push(item);
    } else {
      groups.push({ key: item.groupKey, items: [item] });
    }
  }
  return groups;
}

interface RepostChipProps {
  item: RepostPoolItem;
  groupIndex: number;
  draggable: boolean;
  onMoveToFront: () => void;
  onRepostNow: () => void;
  isReposting: boolean;
}

function RepostChip({ item, groupIndex, draggable, onMoveToFront, onRepostNow, isReposting }: RepostChipProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: itemId(item),
    disabled: !draggable,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(draggable ? { ...attributes, ...listeners } : {})}
      className="border-border bg-surface flex w-24 shrink-0 flex-col items-center gap-1 rounded-lg border p-2 text-center text-xs"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.imageUrl} alt="" className="h-9 w-9 rounded object-contain" />
      <span className="text-text line-clamp-2">{item.name}</span>
      {item.price !== null && <span className="text-rarity-r font-semibold">{item.price.toFixed(2)} €</span>}
      {draggable && (
        <div className="flex gap-1">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onMoveToFront();
            }}
            disabled={groupIndex === 0}
            title="Mettre en premier dans le groupe"
            aria-label="Mettre en premier dans le groupe"
            className="hover:bg-surface-2 rounded p-0.5 disabled:opacity-30"
          >
            <ArrowLeftToLine className="h-3 w-3" aria-hidden />
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onRepostNow();
            }}
            disabled={isReposting}
            title="Reposter maintenant"
            aria-label="Reposter maintenant"
            className="hover:bg-surface-2 rounded p-0.5 disabled:opacity-30"
          >
            <RotateCw className="h-3 w-3" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}

interface Props {
  items: RepostPoolItem[];
  active: boolean;
  groupPriority: string[];
  editable: boolean;
  onReorder: (items: RepostPoolItem[]) => void;
  onRepostNow: (item: RepostPoolItem) => void;
  repostingId: string | null;
}

export default function GroupedRepostGrid({ items, active, groupPriority, editable, onReorder, onRepostNow, repostingId }: Props) {
  if (items.length === 0) return null;

  const sortedItems = sortByGroupPriority(items, groupPriority);
  const groups = groupContiguousItems(sortedItems);

  function handleDragEnd(event: DragEndEvent) {
    const { active: activeDrag, over } = event;
    if (!over || activeDrag.id === over.id) return;
    const oldIndex = sortedItems.findIndex((i) => itemId(i) === activeDrag.id);
    const newIndex = sortedItems.findIndex((i) => itemId(i) === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(sortedItems, oldIndex, newIndex));
  }

  function handleMoveToFront(id: string) {
    const group = groups.find((g) => g.items.some((i) => itemId(i) === id));
    if (!group) return;
    const groupOldIndex = group.items.findIndex((i) => itemId(i) === id);
    if (groupOldIndex <= 0) return;
    const reorderedGroupItems = arrayMove(group.items, groupOldIndex, 0);
    const newOrder = groups.flatMap((g) => (g.key === group.key ? reorderedGroupItems : g.items));
    onReorder(newOrder);
  }

  return (
    <div className={`border-border mt-3 border-t pt-3 ${active ? '' : 'opacity-40'}`}>
      <p className="text-text-muted mb-2 text-[11px] uppercase">
        Reposts éligibles — {active ? 'actif' : 'en attente'}
      </p>
      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sortedItems.map(itemId)} strategy={rectSortingStrategy}>
          <div className="flex flex-wrap gap-3">
            {groups.map((group) => {
              const colorKey = colorKeyForGroup(group.key);
              return (
                <div
                  key={group.key}
                  className={`relative flex flex-wrap items-start gap-2 rounded-lg border-2 border-dashed p-3 pt-5 ${GROUP_FRAME_CLASSES[colorKey]}`}
                >
                  <span
                    className={`text-bg absolute -top-2.5 left-3 rounded px-2 text-[10px] font-semibold uppercase ${GROUP_LABEL_CLASSES[colorKey]}`}
                  >
                    Repost · {group.key}
                  </span>
                  {group.items.map((item, groupIndex) => (
                    <RepostChip
                      key={itemId(item)}
                      item={item}
                      groupIndex={groupIndex}
                      draggable={editable}
                      onMoveToFront={() => handleMoveToFront(itemId(item))}
                      onRepostNow={() => onRepostNow(item)}
                      isReposting={repostingId === itemId(item)}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
