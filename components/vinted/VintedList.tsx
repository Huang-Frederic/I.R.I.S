// components/vinted/VintedList.tsx
'use client';

import { useState } from 'react';
import type { Card } from '@/lib/types';
import { groupCards } from '@/lib/utils/group-cards';

export interface VintedListProps {
  cards: Card[];
  registered: Set<number>;
  config: Record<string, string>;
}

export default function VintedList({ cards: initial, registered, config }: VintedListProps) {
  // State of truth during the session — modals optimistically mutate this.
  const [cards] = useState<Card[]>(initial);

  const groups = groupCards(cards);

  if (groups.length === 0) {
    return (
      <div className="bg-surface border-border rounded-lg border p-6">
        <p className="text-text-muted text-sm">Aucune carte en vente.</p>
      </div>
    );
  }

  // Subsequent tasks replace this block with VintedFilters + VintedRow.
  return (
    <div className="bg-surface border-border rounded-lg border p-6">
      <p className="text-text-muted text-sm">
        {groups.length} groupe{groups.length > 1 ? 's' : ''} — {cards.length} carte
        {cards.length > 1 ? 's' : ''}
      </p>
      <p className="text-text-faint mt-2 font-mono text-xs">
        registered={registered.size} · configKeys={Object.keys(config).length}
      </p>
    </div>
  );
}
