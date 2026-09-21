'use client';

import { useState } from 'react';
import { GripVertical } from 'lucide-react';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { createClient } from '@/lib/supabase/client';

interface Props {
  userId: string;
  editable: boolean;
  groupPriority: string[];
  presentGroups: string[];
  onSaved: () => void;
}

function initialDraft(groupPriority: string[], presentGroups: string[]): string[] {
  const extras = presentGroups.filter((g) => !groupPriority.includes(g));
  return [...groupPriority, ...extras];
}

interface GroupRowProps {
  id: string;
  index: number;
  draggable: boolean;
}

function GroupRow({ id, index, draggable }: GroupRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id, disabled: !draggable });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <li
      ref={setNodeRef}
      style={style}
      {...(draggable ? { ...attributes, ...listeners } : {})}
      className="border-border bg-surface flex items-center gap-2 rounded border px-2 py-1.5 text-sm"
    >
      {draggable && <GripVertical className="text-text-faint h-3.5 w-3.5 shrink-0" aria-hidden />}
      <span className="text-text-faint w-5 shrink-0 text-xs">#{index + 1}</span>
      <span className="text-text">{id}</span>
    </li>
  );
}

export default function GroupPriorityEditor({ userId, editable, groupPriority, presentGroups, onSaved }: Props) {
  const [draft, setDraft] = useState<string[]>(() => initialDraft(groupPriority, presentGroups));
  const [saving, setSaving] = useState(false);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = draft.indexOf(String(active.id));
    const newIndex = draft.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    setDraft((prev) => arrayMove(prev, oldIndex, newIndex));
  }

  async function save() {
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('vinted_bot_config')
        .upsert({ user_id: userId, group_priority: draft, updated_at: new Date().toISOString() });
      if (error) {
        console.error('GroupPriorityEditor save failed:', error);
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  if (draft.length === 0) {
    return (
      <p className="text-text-muted text-sm">
        Aucun groupe pour l’instant — ajoute des cartes ou des lots à la file pour pouvoir les prioriser.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={draft} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-1">
            {draft.map((group, index) => (
              <GroupRow key={group} id={group} index={index} draggable={editable} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      {editable && (
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="bg-surface-2 border-border mt-1 w-fit rounded border px-3 py-1.5 text-sm"
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      )}
    </div>
  );
}
