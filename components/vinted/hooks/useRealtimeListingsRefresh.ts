'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * When the partner migrates our listings to a new card (promote-after-sold),
 * the card_listings row for our user_id is deleted + re-inserted on the new
 * card. Without this, our page stays stale and shows "À retirer" until we
 * manually refresh. Debounced to 2s to avoid cascading refreshes when the
 * agent posts many cards at once.
 */
export function useRealtimeListingsRefresh(myUserId: string) {
  const router = useRouter();
  const realtimeRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!myUserId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`card-listings-${myUserId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'card_listings', filter: `user_id=eq.${myUserId}` },
        () => {
          if (realtimeRefreshRef.current) clearTimeout(realtimeRefreshRef.current);
          realtimeRefreshRef.current = setTimeout(() => router.refresh(), 2000);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
      if (realtimeRefreshRef.current) clearTimeout(realtimeRefreshRef.current);
    };
  }, [myUserId, router]);
}
