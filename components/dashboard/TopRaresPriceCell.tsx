'use client';

import { useState } from 'react';
import { PriceWithTrend } from '@/components/ui/PriceWithTrend';
import { PriceDetailModal } from '@/components/price/PriceDetailModal';
import { createClient } from '@/lib/supabase/client';
import type { Card } from '@/lib/types';

export interface TopRaresPriceCellProps {
  /** Subset received from the dashboard server query — enough for the chip;
   *  the modal needs the full row, fetched lazily on click. */
  cardId: string;
  cmPriceAvg: number | null;
}

/** Owns the price-chip click + modal state for a single TopRares row. The
 *  parent (TopRaresList) is a server component, so the click handler can't
 *  cross the RSC boundary directly — this client wrapper bridges it. */
export function TopRaresPriceCell({ cardId, cmPriceAvg }: TopRaresPriceCellProps) {
  const [open, setOpen] = useState(false);
  const [fullCard, setFullCard] = useState<Card | null>(null);
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (fullCard) {
      setOpen(true);
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.from('cards').select('*').eq('id', cardId).single();
      if (error || !data) return;
      setFullCard(data as Card);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* The chip lives inside a parent <Link> in TopRaresList — stop the
          click from bubbling so the row navigation doesn't fire when the user
          clicks the price specifically. */}
      <span
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
      >
        <PriceWithTrend
          cardId={cardId}
          cmPriceAvg={cmPriceAvg}
          variant="compact"
          onPriceClick={loading ? undefined : handleClick}
        />
      </span>
      {open && fullCard && (
        <PriceDetailModal
          card={fullCard}
          open={open}
          onClose={() => setOpen(false)}
          onCardUpdated={(updated) => setFullCard(updated)}
        />
      )}
    </>
  );
}
