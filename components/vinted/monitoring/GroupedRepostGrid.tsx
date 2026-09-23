// components/vinted/monitoring/GroupedRepostGrid.tsx
'use client';

import { useState } from 'react';
import { ArrowLeftToLine, RotateCw, Eye } from 'lucide-react';
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
import PosterCard, { CardConnector, PosterCardDragPreview, type PosterCardAction } from './PosterCard';
import { useSnakeColumns } from './hooks/useSnakeColumns';

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
  visualOrder: RepostPoolItem[],
  oldIndex: number,
  newIndex: number,
  columns: number,
): RepostPoolItem[] {
  const newVisualOrder = arrayMove(visualOrder, oldIndex, newIndex);
  return groupContiguousItems(newVisualOrder).flatMap((g) => toSnakeOrder(g.items, columns));
}

interface Props {
  items: RepostPoolItem[];
  active: boolean;
  groupPriority: string[];
  editable: boolean;
  onReorder: (items: RepostPoolItem[], movedId: string) => void;
  onRepostNow: (item: RepostPoolItem) => void;
  repostingId: string | null;
  onViewListing: (item: RepostPoolItem) => void;
  /** Ids marked as changed-but-unsaved since the last save — rendered with a persistent green dashed border. */
  pendingIds: ReadonlySet<string>;
  /** The card/lot the bot is actively processing right now, if any — that
   *  one item gets dimmed, made non-draggable, and has its posting actions
   *  disabled, so the user can't reorder or re-trigger something the bot
   *  already claimed. Everything else in the grid stays fully interactive. */
  activeJobTarget: { cardId: string | null; lotId: string | null } | null;
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
  pendingIds,
  activeJobTarget,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const columns = useSnakeColumns(container);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  if (items.length === 0) return null;

  const sortedItems = sortByGroupPriority(items, groupPriority);
  const groups = groupContiguousItems(sortedItems);
  const visualOrder = groups.flatMap((g) => toSnakeOrder(g.items, columns));
  const activeItem = activeId ? visualOrder.find((i) => itemId(i) === activeId) ?? null : null;

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active: activeDrag, over } = event;
    if (!over || activeDrag.id === over.id) return;
    const oldIndex = visualOrder.findIndex((i) => itemId(i) === activeDrag.id);
    const newIndex = visualOrder.findIndex((i) => itemId(i) === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(computeSnakeReorder(visualOrder, oldIndex, newIndex, columns), activeDrag.id as string);
  }

  function handleMoveToFront(id: string) {
    const group = groups.find((g) => g.items.some((i) => itemId(i) === id));
    if (!group) return;
    const groupOldIndex = group.items.findIndex((i) => itemId(i) === id);
    if (groupOldIndex <= 0) return;
    const reorderedGroupItems = arrayMove(group.items, groupOldIndex, 0);
    const newOrder = groups.flatMap((g) => (g.key === group.key ? reorderedGroupItems : g.items));
    onReorder(newOrder, id);
  }

  return (
    <div className={`border-border mt-3 border-t pt-3 ${active ? '' : 'opacity-40'}`}>
      <p className="text-text-muted mb-4 text-[11px] uppercase">
        Reposts éligibles — {active ? 'actif' : 'en attente'}
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
        <SortableContext items={visualOrder.map(itemId)} strategy={rectSortingStrategy}>
          <div ref={setContainer} className="flex flex-wrap items-start justify-center gap-3">
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
                      Repost · {group.key}
                    </span>
                    {rows.map((row, rowIndex) => {
                      const reversed = rowIndex % 2 === 1;
                      const displayRow = reversed ? [...row].reverse() : row;
                      return (
                        <div key={rowIndex} className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            {displayRow.map((item, i) => {
                              const groupIndex = group.items.findIndex((x) => itemId(x) === itemId(item));
                              const isBeingProcessed =
                                activeJobTarget !== null &&
                                ((item.cardId !== null && item.cardId === activeJobTarget.cardId) ||
                                  (item.lotId !== null && item.lotId === activeJobTarget.lotId));
                              const actions: PosterCardAction[] = [
                                ...(editable
                                  ? [
                                      {
                                        icon: ArrowLeftToLine,
                                        label: 'Mettre en premier dans le groupe',
                                        onClick: () => handleMoveToFront(itemId(item)),
                                        disabled: groupIndex === 0 || isBeingProcessed,
                                      },
                                      {
                                        icon: RotateCw,
                                        label: 'Reposter maintenant',
                                        onClick: () => onRepostNow(item),
                                        disabled: repostingId === itemId(item) || isBeingProcessed,
                                      },
                                    ]
                                  : []),
                                { icon: Eye, label: "Voir l'annonce", onClick: () => onViewListing(item) },
                              ];
                              return (
                                <div key={itemId(item)} className="flex items-center gap-2">
                                  {i > 0 && <CardConnector direction={reversed ? 'left' : 'right'} />}
                                  <PosterCard
                                    id={itemId(item)}
                                    imageUrl={item.imageUrl}
                                    name={item.name}
                                    price={item.price}
                                    draggable={editable && !isBeingProcessed}
                                    dimmed={isBeingProcessed}
                                    actions={actions}
                                    isPendingChange={pendingIds.has(itemId(item))}
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
