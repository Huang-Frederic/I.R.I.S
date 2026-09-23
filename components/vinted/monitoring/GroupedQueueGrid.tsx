// components/vinted/monitoring/GroupedQueueGrid.tsx
'use client';

import { useState } from 'react';
import { ArrowLeftToLine, Send, Eye } from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  pointerWithin,
  closestCenter,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { sortByGroupPriority } from '@/lib/vinted/group-sort';
import { chunkIntoRows, toSnakeOrder } from '@/lib/vinted/snake-order';
import { GROUP_FRAME_CLASSES, GROUP_LABEL_CLASSES, colorKeyForGroup } from '@/lib/vinted/group-frame-colors';
import PosterCard, { CardConnector, PosterCardStartSlot, PosterCardDragPreview, type PosterCardAction } from './PosterCard';
import { useSnakeColumns } from './hooks/useSnakeColumns';

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

/**
 * Converts a post-drag visual (on-screen snake) order back into the logical
 * order to save. `toSnakeOrder` is its own inverse (lib/vinted/snake-order.ts)
 * — applying it again turns the moved visual order back into logical order.
 * Group runs are re-derived from the MOVED array (not the pre-drag `groups`)
 * so a drop that lands in a different group's frame degrades to the same
 * harmless no-op it already was before the snake layout (the next render's
 * groupKey-based re-sort overrides it either way).
 */
export function computeSnakeReorder(
  visualOrder: PipelineItem[],
  oldIndex: number,
  newIndex: number,
  columns: number,
): PipelineItem[] {
  const newVisualOrder = arrayMove(visualOrder, oldIndex, newIndex);
  return groupContiguousItems(newVisualOrder).flatMap((g) => toSnakeOrder(g.items, columns));
}

interface Props {
  items: PipelineItem[];
  dailyQuota: number;
  groupPriority: string[];
  editable: boolean;
  onReorder: (items: PipelineItem[], movedId: string) => void;
  onPostNow: (item: PipelineItem) => void;
  postingQueueId: string | null;
  onViewListing: (item: PipelineItem) => void;
  /** Ids marked as changed-but-unsaved since the last save — rendered with a persistent green dashed border. */
  pendingIds: ReadonlySet<string>;
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
  pendingIds,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const columns = useSnakeColumns(container);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  if (items.length === 0) {
    return <p className="text-text-muted text-sm">File de nouveaux posts : vide — plus rien en attente.</p>;
  }

  const sortedItems = sortByGroupPriority(items, groupPriority);
  const groups = groupContiguousItems(sortedItems);
  const todayCount = Math.min(dailyQuota, sortedItems.length);
  // Flat, left-to-right/top-to-bottom reading order of the ON-SCREEN snake —
  // this is what dnd-kit needs for its sorting preview and drag-end index
  // math, since it must match what's actually rendered, not the plain
  // (non-snake) `sortedItems` order.
  const visualOrder = groups.flatMap((g) => toSnakeOrder(g.items, columns));
  const activeItem = activeId ? visualOrder.find((i) => i.queueId === activeId) ?? null : null;

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = visualOrder.findIndex((i) => i.queueId === active.id);
    const newIndex = visualOrder.findIndex((i) => i.queueId === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(computeSnakeReorder(visualOrder, oldIndex, newIndex, columns), active.id as string);
  }

  function handleMoveToFront(queueId: string) {
    const group = groups.find((g) => g.items.some((i) => i.queueId === queueId));
    if (!group) return;
    const groupOldIndex = group.items.findIndex((i) => i.queueId === queueId);
    if (groupOldIndex <= 0) return;
    const reorderedGroupItems = arrayMove(group.items, groupOldIndex, 0);
    const newOrder = groups.flatMap((g) => (g.key === group.key ? reorderedGroupItems : g.items));
    onReorder(newOrder, queueId);
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-text-muted text-xs">
        Aujourd&apos;hui · {todayCount}/{dailyQuota}
      </p>
      <DndContext
        sensors={sensors}
        collisionDetection={(args) => {
          const pointerCollisions = pointerWithin(args);
          return pointerCollisions.length > 0 ? pointerCollisions : closestCenter(args);
        }}
        onDragStart={(event: DragStartEvent) => setActiveId(event.active.id as string)}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <SortableContext items={visualOrder.map((i) => i.queueId)} strategy={rectSortingStrategy}>
          <div ref={setContainer} className="flex flex-wrap items-start gap-3">
            {groups.map((group, groupPos) => {
              const colorKey = colorKeyForGroup(group.key);
              const rows = chunkIntoRows(group.items, columns);
              return (
                <div key={group.key} className="flex items-start gap-2">
                  {groupPos > 0 && <CardConnector variant="group" />}
                  <div
                    className={`relative flex flex-col gap-2 rounded-lg border-2 border-dashed p-3 pt-5 ${GROUP_FRAME_CLASSES[colorKey]}`}
                  >
                    <span
                      className={`text-bg absolute -top-2.5 left-3 rounded px-2 text-[10px] font-semibold uppercase ${GROUP_LABEL_CLASSES[colorKey]}`}
                    >
                      {group.key}
                    </span>
                    {rows.map((row, rowIndex) => {
                      const reversed = rowIndex % 2 === 1;
                      const displayRow = reversed ? [...row].reverse() : row;
                      return (
                        <div key={rowIndex} className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            {groupPos === 0 && rowIndex === 0 && <PosterCardStartSlot />}
                            {displayRow.map((item, i) => {
                              const globalIndex = sortedItems.findIndex((x) => x.queueId === item.queueId);
                              const groupIndex = group.items.findIndex((x) => x.queueId === item.queueId);
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
                                  {i > 0 && <CardConnector direction={reversed ? 'left' : 'right'} />}
                                  <PosterCard
                                    id={item.queueId}
                                    imageUrl={item.imageUrl}
                                    name={item.name}
                                    price={item.price}
                                    draggable={editable}
                                    dimmed={globalIndex >= dailyQuota}
                                    badge={`#${globalIndex + 1}`}
                                    actions={actions}
                                    isPendingChange={pendingIds.has(item.queueId)}
                                  />
                                </div>
                              );
                            })}
                          </div>
                          {rowIndex < rows.length - 1 && (
                            <div className={`flex ${reversed ? 'justify-start' : 'justify-end'}`}>
                              <CardConnector direction="up" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </SortableContext>
        <DragOverlay>
          {activeItem ? <PosterCardDragPreview imageUrl={activeItem.imageUrl} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
