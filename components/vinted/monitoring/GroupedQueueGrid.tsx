// components/vinted/monitoring/GroupedQueueGrid.tsx
'use client';

import { ArrowLeftToLine, Send, Eye } from 'lucide-react';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { sortByGroupPriority } from '@/lib/vinted/group-sort';
import { GROUP_FRAME_CLASSES, GROUP_LABEL_CLASSES, colorKeyForGroup } from '@/lib/vinted/group-frame-colors';
import PosterCard, { CardConnector, type PosterCardAction } from './PosterCard';

export interface PipelineItem {
  queueId: string;
  cardId: string | null;
  lotId: string | null;
  position: number;
  name: string;
  price: number | null;
  imageUrl: string;
  groupKey: string;
}

interface Group {
  key: string;
  items: PipelineItem[];
}

/** `items` must already be sorted so same-groupKey items are contiguous (sortByGroupPriority guarantees this). */
function groupContiguousItems(items: PipelineItem[]): Group[] {
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
  items: PipelineItem[];
  dailyQuota: number;
  groupPriority: string[];
  editable: boolean;
  onReorder: (items: PipelineItem[]) => void;
  onPostNow: (item: PipelineItem) => void;
  postingQueueId: string | null;
  onViewListing: (item: PipelineItem) => void;
}

export default function GroupedQueueGrid({
  items,
  dailyQuota,
  groupPriority,
  editable,
  onReorder,
  onPostNow,
  postingQueueId,
  onViewListing,
}: Props) {
  if (items.length === 0) {
    return <p className="text-text-muted text-sm">File de nouveaux posts : vide — plus rien en attente.</p>;
  }

  const sortedItems = sortByGroupPriority(items, groupPriority);
  const groups = groupContiguousItems(sortedItems);
  const todayCount = Math.min(dailyQuota, sortedItems.length);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sortedItems.findIndex((i) => i.queueId === active.id);
    const newIndex = sortedItems.findIndex((i) => i.queueId === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(sortedItems, oldIndex, newIndex));
  }

  function handleMoveToFront(queueId: string) {
    const group = groups.find((g) => g.items.some((i) => i.queueId === queueId));
    if (!group) return;
    const groupOldIndex = group.items.findIndex((i) => i.queueId === queueId);
    if (groupOldIndex <= 0) return;
    const reorderedGroupItems = arrayMove(group.items, groupOldIndex, 0);
    const newOrder = groups.flatMap((g) => (g.key === group.key ? reorderedGroupItems : g.items));
    onReorder(newOrder);
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-text-muted text-xs">
        Aujourd&apos;hui · {todayCount}/{dailyQuota}
      </p>
      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sortedItems.map((i) => i.queueId)} strategy={rectSortingStrategy}>
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
                      {group.key}
                    </span>
                    {group.items.map((item, groupIndex) => {
                      const globalIndex = sortedItems.findIndex((i) => i.queueId === item.queueId);
                      const actions: PosterCardAction[] = [
                        ...(editable
                          ? [
                              {
                                icon: ArrowLeftToLine,
                                label: 'Mettre en premier dans le groupe',
                                onClick: () => handleMoveToFront(item.queueId),
                                disabled: groupIndex === 0,
                              },
                              {
                                icon: Send,
                                label: 'Poster maintenant',
                                onClick: () => onPostNow(item),
                                disabled: postingQueueId === item.queueId,
                              },
                            ]
                          : []),
                        { icon: Eye, label: "Voir l'annonce", onClick: () => onViewListing(item) },
                      ];
                      return (
                        <div key={item.queueId} className="flex items-center gap-2">
                          {groupIndex > 0 && <CardConnector />}
                          <PosterCard
                            id={item.queueId}
                            imageUrl={item.imageUrl}
                            name={item.name}
                            price={item.price}
                            draggable={editable}
                            dimmed={globalIndex >= dailyQuota}
                            badge={`#${globalIndex + 1}`}
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
