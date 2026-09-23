'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface ActiveJob {
  cardId: string | null;
  lotId: string | null;
  jobType: 'post' | 'repost' | 'delete';
  itemName: string;
  itemImage: string;
  startedAt: string;
}

export interface ActiveJobState {
  activeJob: ActiveJob | null;
  pendingCount: number;
}

function fallbackSprite(pokemonNumber: number | null): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemonNumber ?? 0}.png`;
}

/** Same shape as `Lot.photo_urls` elsewhere — see useMonitoringData.ts's own
 *  `lotImageUrl` for why this can't just read a raw `photo_url` column. */
function lotImageUrl(photoUrls: string[] | null | undefined): string {
  const path = photoUrls?.[0];
  return path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/lot-photos/${path}` : '';
}

const EMPTY_STATE: ActiveJobState = { activeJob: null, pendingCount: 0 };

export function useActiveJob(userId: string): ActiveJobState {
  const [state, setState] = useState<ActiveJobState>(EMPTY_STATE);

  const load = useCallback(async () => {
    if (!userId) return;
    const supabase = createClient();

    const [processingRes, pendingRes] = await Promise.all([
      supabase
        .from('vinted_post_jobs')
        .select('card_id, lot_id, job_type, created_at')
        .eq('user_id', userId)
        .eq('status', 'processing')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('vinted_post_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'pending'),
    ]);

    const job = processingRes.data as
      | { card_id: string | null; lot_id: string | null; job_type: 'post' | 'repost' | 'delete'; created_at: string }
      | null;
    const pendingCount = (pendingRes as { count: number | null }).count ?? 0;

    if (!job) {
      setState({ activeJob: null, pendingCount });
      return;
    }

    let itemName = '?';
    let itemImage = '';
    if (job.card_id) {
      const { data: card } = await supabase
        .from('cards')
        .select('card_name, image_url, tcg_image_url, pokemon_number')
        .eq('id', job.card_id)
        .maybeSingle();
      itemName = card?.card_name ?? '?';
      itemImage = card?.image_url ?? card?.tcg_image_url ?? fallbackSprite(card?.pokemon_number ?? null);
    } else if (job.lot_id) {
      const { data: lot } = await supabase
        .from('lots')
        .select('name, photo_urls')
        .eq('id', job.lot_id)
        .maybeSingle();
      itemName = lot?.name ?? '?';
      itemImage = lotImageUrl(lot?.photo_urls);
    }

    setState({
      activeJob: {
        cardId: job.card_id,
        lotId: job.lot_id,
        jobType: job.job_type,
        itemName,
        itemImage,
        startedAt: job.created_at,
      },
      pendingCount,
    });
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    // load() is also re-invoked from the Realtime subscription callback below,
    // so it can't be restructured into a plain synchronization effect — this
    // call is the intended initial fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const supabase = createClient();
    const channel = supabase
      .channel(`vinted-post-jobs-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vinted_post_jobs', filter: `user_id=eq.${userId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, load]);

  return state;
}
