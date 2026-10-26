'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * When the partner sells/moves something, our own listing row on that same
 * card/lot/other_item is deleted server-side (promote-after-sold migrates
 * card_listings to a new card; the cross-account delete job clears ours on
 * whatever they sold). Without this, our page stays stale and shows
 * "À retirer" until we manually refresh — originally wired for card_listings
 * only, which left lot_listings and other_item_listings changes invisible
 * until a manual reload. Debounced to 2s to avoid cascading refreshes when
 * the agent posts many cards at once.
 */
export function useRealtimeListingsRefresh(myUserId: string) {
  const router = useRouter();
  const realtimeRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!myUserId) return;
    const supabase = createClient();
    const scheduleRefresh = () => {
      if (realtimeRefreshRef.current) clearTimeout(realtimeRefreshRef.current);
      realtimeRefreshRef.current = setTimeout(() => router.refresh(), 2000);
    };
    const channel = supabase
      .channel(`listings-${myUserId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'card_listings', filter: `user_id=eq.${myUserId}` },
        scheduleRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lot_listings', filter: `user_id=eq.${myUserId}` },
        scheduleRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'other_item_listings', filter: `user_id=eq.${myUserId}` },
        scheduleRefresh,
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
      if (realtimeRefreshRef.current) clearTimeout(realtimeRefreshRef.current);
    };
  }, [myUserId, router]);
}
