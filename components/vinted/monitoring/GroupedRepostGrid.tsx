// components/vinted/monitoring/GroupedRepostGrid.tsx
'use client';

import { ArrowLeftToLine, RotateCw, Eye } from 'lucide-react';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { sortByGroupPriority } from '@/lib/vinted/group-sort';
import { GROUP_FRAME_CLASSES, GROUP_LABEL_CLASSES, colorKeyForGroup } from '@/lib/vinted/group-frame-colors';
import PosterCard, { CardConnector, type PosterCardAction } from './PosterCard';

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

interface Props {
  items: RepostPoolItem[];
  active: boolean;
  groupPriority: string[];
  editable: boolean;
  onReorder: (items: RepostPoolItem[]) => void;
  onRepostNow: (item: RepostPoolItem) => void;
  repostingId: string | null;
  onViewListing: (item: RepostPoolItem) => void;
}

export default function GroupedRepostGrid({
  items,
  active,
  groupPriority,
  editable,
  onReorder,
  onRepostNow,
  repostingId,
  onViewListing,
}: Props) {
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
          <div className="flex flex-wrap items-start gap-3">
            {groups.map((group, groupPos) => {
              const colorKey = colorKeyForGroup(group.key);
              return (
                <div key={group.key} className="flex items-start gap-2">
                  {groupPos > 0 && <CardConnector variant="group" />}
                  <div
                    className={`relative flex flex-wrap items-start gap-2 rounded-lg border-2 border-dashed p-3 pt-5 ${GROUP_FRAME_CLASSES[colorKey]}`}
                  >
                    <span
                      className={`text-bg absolute -top-2.5 left-3 rounded px-2 text-[10px] font-semibold uppercase ${GROUP_LABEL_CLASSES[colorKey]}`}
                    >
                      Repost · {group.key}
                    </span>
                    {group.items.map((item, groupIndex) => {
                      const actions: PosterCardAction[] = [
                        ...(editable
                          ? [
                              {
                                icon: ArrowLeftToLine,
                                label: 'Mettre en premier dans le groupe',
                                onClick: () => handleMoveToFront(itemId(item)),
                                disabled: groupIndex === 0,
                              },
                              {
                                icon: RotateCw,
                                label: 'Reposter maintenant',
                                onClick: () => onRepostNow(item),
                                disabled: repostingId === itemId(item),
                              },
                            ]
                          : []),
                        { icon: Eye, label: "Voir l'annonce", onClick: () => onViewListing(item) },
                      ];
                      return (
                        <div key={itemId(item)} className="flex items-center gap-2">
                          {groupIndex > 0 && <CardConnector />}
                          <PosterCard
                            id={itemId(item)}
                            imageUrl={item.imageUrl}
                            name={item.name}
                            price={item.price}
                            draggable={editable}
                            actions={actions}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
