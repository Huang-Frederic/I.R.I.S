'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { VintedBotScheduleRow, VintedAgentLogRow } from '@/lib/types';
import { isRepostEligible } from '@/lib/vinted/repost-eligibility';
import type { PipelineItem } from '../GroupedQueueGrid';
import { groupKeyFor } from '@/lib/vinted/group-key';
import type { RepostPoolItem } from '../GroupedRepostGrid';
import type { SessionStatus } from '../AlertBanner';

const POLL_INTERVAL_MS = 30_000;

function fallbackSprite(pokemonNumber: number | null): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemonNumber ?? 0}.png`;
}

/** `Lot.photo_urls` stores paths relative to the `lot-photos` Storage bucket
 *  (e.g. "{lot_id}/0.jpg"), not full URLs — same helper every other lot-photo
 *  call site in the app builds locally (there's no shared export for it). */
export function lotImageUrl(photoUrls: string[] | null | undefined): string {
  const path = photoUrls?.[0];
  return path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/lot-photos/${path}` : '';
}

export interface MonitoringData {
  pipeline: PipelineItem[];
  schedule: Pick<VintedBotScheduleRow, 'day_of_week' | 'starts_at' | 'ends_at'>[];
  config: { daily_quota: number; repost_after_days: number; group_priority: string[] };
  logs: VintedAgentLogRow[];
  todayJobCount: number;
  repostCandidates: RepostPoolItem[];
  sessionStatus: SessionStatus | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

const DEFAULT_CONFIG = { daily_quota: 8, repost_after_days: 14, group_priority: [] as string[] };

export function useMonitoringData(viewedUserId: string): MonitoringData {
  const [state, setState] = useState<Omit<MonitoringData, 'refetch'>>({
    pipeline: [],
    schedule: [],
    config: DEFAULT_CONFIG,
    logs: [],
    todayJobCount: 0,
    repostCandidates: [],
    sessionStatus: null,
    loading: true,
  });

  const load = useCallback(async () => {
    const supabase = createClient();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [queueRes, scheduleRes, configRes, logsRes, jobsRes, cardListingsRes, lotListingsRes, sessionRes] = await Promise.all([
      supabase.from('vinted_queue').select('id, card_id, lot_id, position').eq('user_id', viewedUserId).order('position'),
      supabase.from('vinted_bot_schedule').select('day_of_week, starts_at, ends_at').eq('user_id', viewedUserId),
      supabase.from('vinted_bot_config').select('daily_quota, repost_after_days, group_priority').eq('user_id', viewedUserId).maybeSingle(),
      supabase
        .from('vinted_agent_logs')
        .select('id, user_id, level, message, created_at')
        .eq('user_id', viewedUserId)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('vinted_post_jobs')
        .select('id')
        .eq('user_id', viewedUserId)
        .eq('triggered_by', 'schedule')
        .in('job_type', ['post', 'repost'])
        .gte('created_at', todayStart.toISOString()),
      supabase
        .from('card_listings')
        .select('card_id, vinted_listing_id, vinted_posted_at, repost_position, cards(card_name, suggested_price, image_url, tcg_image_url, pokemon_number, status, language)')
        .eq('user_id', viewedUserId)
        .not('vinted_listing_id', 'is', null),
      supabase
        .from('lot_listings')
        .select('lot_id, vinted_listing_id, vinted_posted_at, repost_position, lots(name, price, photo_urls, brand_id, language, status)')
        .eq('user_id', viewedUserId)
        .not('vinted_listing_id', 'is', null),
      fetch(`/api/vinted/sessions?userId=${viewedUserId}`).then((r) => (r.ok ? r.json() : null)),
    ]);

    const cardIds = (queueRes.data ?? []).filter((r) => r.card_id).map((r) => r.card_id as string);
    const lotIds = (queueRes.data ?? []).filter((r) => r.lot_id).map((r) => r.lot_id as string);

    const [cardsRes, lotsRes] = await Promise.all([
      cardIds.length
        ? supabase.from('cards').select('id, card_name, suggested_price, image_url, tcg_image_url, pokemon_number, language').in('id', cardIds)
        : Promise.resolve({ data: [] as { id: string; card_name: string; suggested_price: number | null; image_url: string | null; tcg_image_url: string | null; pokemon_number: number | null; language: string }[] }),
      lotIds.length
        ? supabase.from('lots').select('id, name, price, photo_urls, brand_id, language').in('id', lotIds)
        : Promise.resolve({ data: [] as { id: string; name: string; price: number | null; photo_urls: string[]; brand_id: number | null; language: string | null }[] }),
    ]);

    const cardsById = new Map((cardsRes.data ?? []).map((c) => [c.id, c]));
    const lotsById = new Map((lotsRes.data ?? []).map((l) => [l.id, l]));

    const pipeline: PipelineItem[] = (queueRes.data ?? []).map((row) => {
      if (row.card_id) {
        const card = cardsById.get(row.card_id);
        return {
          queueId: row.id,
          cardId: row.card_id,
          lotId: null,
          position: row.position,
          name: card?.card_name ?? '?',
          price: card?.suggested_price ?? null,
          imageUrl: card?.image_url ?? card?.tcg_image_url ?? fallbackSprite(card?.pokemon_number ?? null),
          groupKey: groupKeyFor({ cardId: row.card_id, language: card?.language ?? null, brandId: null }),
        };
      }
      const lot = lotsById.get(row.lot_id as string);
      return {
        queueId: row.id,
        cardId: null,
        lotId: row.lot_id,
        position: row.position,
        name: lot?.name ?? '?',
        price: lot?.price ?? null,
        imageUrl: lotImageUrl(lot?.photo_urls),
        groupKey: groupKeyFor({ cardId: null, language: lot?.language ?? null, brandId: lot?.brand_id ?? null }),
      };
    });

    const config = configRes.data
      ? { ...configRes.data, group_priority: (configRes.data.group_priority as string[]) ?? [] }
      : DEFAULT_CONFIG;
    const now = new Date();
    const cardRepostCandidates: RepostPoolItem[] = (cardListingsRes.data ?? [])
      .map((row): RepostPoolItem | null => {
        const card = Array.isArray(row.cards) ? row.cards[0] : row.cards;
        if (!card) return null;
        const eligible = isRepostEligible(
          { vintedListingId: row.vinted_listing_id, vintedPostedAt: row.vinted_posted_at, status: card.status },
          config.repost_after_days,
          now,
        );
        if (!eligible) return null;
        return {
          cardId: row.card_id,
          lotId: null,
          name: card.card_name,
          price: card.suggested_price,
          imageUrl: card.image_url ?? card.tcg_image_url ?? fallbackSprite(card.pokemon_number),
          vintedPostedAt: row.vinted_posted_at as string,
          groupKey: groupKeyFor({ cardId: row.card_id, language: card.language ?? null, brandId: null }),
          repostPosition: row.repost_position ?? null,
        };
      })
      .filter((x): x is RepostPoolItem => x !== null);

    const lotRepostCandidates: RepostPoolItem[] = (lotListingsRes.data ?? [])
      .map((row): RepostPoolItem | null => {
        const lot = Array.isArray(row.lots) ? row.lots[0] : row.lots;
        if (!lot) return null;
        const eligible = isRepostEligible(
          { vintedListingId: row.vinted_listing_id, vintedPostedAt: row.vinted_posted_at, status: lot.status },
          config.repost_after_days,
          now,
        );
        if (!eligible) return null;
        return {
          cardId: null,
          lotId: row.lot_id,
          name: lot.name,
          price: lot.price,
          imageUrl: lotImageUrl(lot.photo_urls),
          vintedPostedAt: row.vinted_posted_at as string,
          groupKey: groupKeyFor({ cardId: null, language: lot.language ?? null, brandId: lot.brand_id ?? null }),
          repostPosition: row.repost_position ?? null,
        };
      })
      .filter((x): x is RepostPoolItem => x !== null);

    const repostCandidates: RepostPoolItem[] = [...cardRepostCandidates, ...lotRepostCandidates].sort((a, b) => {
      const aNull = a.repostPosition === null;
      const bNull = b.repostPosition === null;
      if (aNull !== bNull) return aNull ? 1 : -1;
      if (!aNull && !bNull && a.repostPosition !== b.repostPosition) {
        return (a.repostPosition as number) - (b.repostPosition as number);
      }
      return a.vintedPostedAt.localeCompare(b.vintedPostedAt);
    });

    setState({
      pipeline,
      schedule: (scheduleRes.data ?? []) as Pick<VintedBotScheduleRow, 'day_of_week' | 'starts_at' | 'ends_at'>[],
      config,
      logs: (logsRes.data ?? []) as VintedAgentLogRow[],
      todayJobCount: jobsRes.data?.length ?? 0,
      repostCandidates,
      sessionStatus: sessionRes,
      loading: false,
    });
  }, [viewedUserId]);

  useEffect(() => {
    // load() is also exposed as `refetch` for imperative re-fetching after a
    // save, so it can't be restructured into a plain synchronization effect —
    // the polling kick-off here is the intended initial fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const id = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load]);

  return { ...state, refetch: load };
}
