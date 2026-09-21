// components/vinted/monitoring/GroupedQueueGrid.tsx
'use client';

import { ArrowLeftToLine, Send } from 'lucide-react';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { sortByGroupPriority } from '@/lib/vinted/group-sort';
import { GROUP_FRAME_CLASSES, GROUP_LABEL_CLASSES, colorKeyForGroup } from '@/lib/vinted/group-frame-colors';

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

interface CardChipProps {
  item: PipelineItem;
  globalIndex: number;
  groupIndex: number;
  draggable: boolean;
  dimmed: boolean;
  onMoveToFront: () => void;
  onPostNow: () => void;
  isPosting: boolean;
}

function CardChip({ item, globalIndex, groupIndex, draggable, dimmed, onMoveToFront, onPostNow, isPosting }: CardChipProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: item.queueId,
    disabled: !draggable,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(draggable ? { ...attributes, ...listeners } : {})}
      className={`border-border bg-surface flex w-24 shrink-0 flex-col items-center gap-1 rounded-lg border p-2 text-center text-xs ${dimmed ? 'opacity-60' : ''}`}
    >
      <span className="text-text-faint text-[10px]">#{globalIndex + 1}</span>
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
              onPostNow();
            }}
            disabled={isPosting}
            title="Poster maintenant"
            aria-label="Poster maintenant"
            className="hover:bg-surface-2 rounded p-0.5 disabled:opacity-30"
          >
            <Send className="h-3 w-3" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}

interface Props {
  items: PipelineItem[];
  dailyQuota: number;
  groupPriority: string[];
  editable: boolean;
  onReorder: (items: PipelineItem[]) => void;
  onPostNow: (item: PipelineItem) => void;
  postingQueueId: string | null;
}

export default function GroupedQueueGrid({ items, dailyQuota, groupPriority, editable, onReorder, onPostNow, postingQueueId }: Props) {
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
                    {group.key}
                  </span>
                  {group.items.map((item, groupIndex) => {
                    const globalIndex = sortedItems.findIndex((i) => i.queueId === item.queueId);
                    return (
                      <CardChip
                        key={item.queueId}
                        item={item}
                        globalIndex={globalIndex}
                        groupIndex={groupIndex}
                        draggable={editable}
                        dimmed={globalIndex >= dailyQuota}
                        onMoveToFront={() => handleMoveToFront(item.queueId)}
                        onPostNow={() => onPostNow(item)}
                        isPosting={postingQueueId === item.queueId}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
