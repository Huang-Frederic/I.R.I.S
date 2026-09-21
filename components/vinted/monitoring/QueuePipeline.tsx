'use client';

import { ArrowLeftToLine, Send } from 'lucide-react';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { splitPipelineByQuota } from '@/lib/vinted/pipeline-split';

export interface PipelineItem {
  queueId: string;
  cardId: string | null;
  lotId: string | null;
  position: number;
  name: string;
  price: number | null;
  imageUrl: string;
}

interface CardChipProps {
  item: PipelineItem;
  index: number;
  draggable: boolean;
  showArrowBefore: boolean;
  onMoveToFront: () => void;
  onPostNow: () => void;
  isPosting: boolean;
}

function CardChip({ item, index, draggable, showArrowBefore, onMoveToFront, onPostNow, isPosting }: CardChipProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: item.queueId,
    disabled: !draggable,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <>
      {showArrowBefore && (
        <span className="text-text-faint shrink-0" aria-hidden>
          →
        </span>
      )}
      <div
        ref={setNodeRef}
        style={style}
        {...(draggable ? { ...attributes, ...listeners } : {})}
        className="border-border bg-surface flex w-24 shrink-0 flex-col items-center gap-1 rounded-lg border p-2 text-center text-xs"
      >
        <span className="text-text-faint text-[10px]">#{index + 1}</span>
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
              disabled={index === 0}
              title="Mettre en premier"
              aria-label="Mettre en premier"
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
    </>
  );
}

interface Props {
  items: PipelineItem[];
  dailyQuota: number;
  editable: boolean;
  onReorder: (items: PipelineItem[]) => void;
  onPostNow: (item: PipelineItem) => void;
  postingQueueId: string | null;
}

export default function QueuePipeline({ items, dailyQuota, editable, onReorder, onPostNow, postingQueueId }: Props) {
  const { today, later } = splitPipelineByQuota(items, dailyQuota);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.queueId === active.id);
    const newIndex = items.findIndex((i) => i.queueId === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(items, oldIndex, newIndex));
  }

  function handleMoveToFront(queueId: string) {
    const oldIndex = items.findIndex((i) => i.queueId === queueId);
    if (oldIndex <= 0) return;
    onReorder(arrayMove(items, oldIndex, 0));
  }

  if (items.length === 0) {
    return <p className="text-text-muted text-sm">File de nouveaux posts : vide — plus rien en attente.</p>;
  }

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => i.queueId)} strategy={horizontalListSortingStrategy}>
        <div className="overflow-x-auto">
          <div className="border-rarity-sar relative flex items-center gap-2 rounded-lg border-2 border-dashed p-2">
            <span className="bg-rarity-sar text-bg absolute -top-3 left-3 rounded px-2 text-[10px] font-semibold uppercase">
              Aujourd&apos;hui · {today.length}/{dailyQuota}
            </span>
            {today.map((item, i) => (
              <CardChip
                key={item.queueId}
                item={item}
                index={i}
                draggable={editable}
                showArrowBefore={i > 0}
                onMoveToFront={() => handleMoveToFront(item.queueId)}
                onPostNow={() => onPostNow(item)}
                isPosting={postingQueueId === item.queueId}
              />
            ))}
          </div>
          {later.length > 0 && (
            <div className="mt-2 flex items-center gap-2 opacity-60">
              {later.map((item, i) => (
                <CardChip
                  key={item.queueId}
                  item={item}
                  index={today.length + i}
                  draggable={editable}
                  showArrowBefore={i > 0}
                  onMoveToFront={() => handleMoveToFront(item.queueId)}
                  onPostNow={() => onPostNow(item)}
                  isPosting={postingQueueId === item.queueId}
                />
              ))}
            </div>
          )}
        </div>
      </SortableContext>
    </DndContext>
  );
}
