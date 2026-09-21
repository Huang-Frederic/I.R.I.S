'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { VintedBotScheduleRow, VintedAgentLogRow } from '@/lib/types';
import { isRepostEligible } from '@/lib/vinted/repost-eligibility';
import type { PipelineItem } from '../GroupedQueueGrid';
import { groupKeyFor } from '@/lib/vinted/group-key';
import type { RepostPoolItem } from '../RepostPool';
import type { SessionStatus } from '../AlertBanner';

const POLL_INTERVAL_MS = 30_000;

function fallbackSprite(pokemonNumber: number | null): string {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemonNumber ?? 0}.png`;
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
  refetch: () => void;
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

    const [queueRes, scheduleRes, configRes, logsRes, jobsRes, cardListingsRes, sessionRes] = await Promise.all([
      supabase.from('vinted_queue').select('id, card_id, lot_id, position').eq('user_id', viewedUserId).order('position'),
      supabase.from('vinted_bot_schedule').select('day_of_week, starts_at, ends_at').eq('user_id', viewedUserId),
      supabase.from('vinted_bot_config').select('daily_quota, repost_after_days, group_priority').eq('user_id', viewedUserId).maybeSingle(),
      supabase
        .from('vinted_agent_logs')
        .select('id, user_id, level, message, created_at')
        .eq('user_id', viewedUserId)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('vinted_post_jobs')
        .select('id')
        .eq('user_id', viewedUserId)
        .in('job_type', ['post', 'repost'])
        .gte('created_at', todayStart.toISOString()),
      supabase
        .from('card_listings')
        .select('card_id, vinted_listing_id, vinted_posted_at, cards(card_name, suggested_price, image_url, tcg_image_url, pokemon_number, status)')
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
        ? supabase.from('lots').select('id, name, price, photo_url, brand_id').in('id', lotIds)
        : Promise.resolve({ data: [] as { id: string; name: string; price: number | null; photo_url: string | null; brand_id: number | null }[] }),
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
        imageUrl: lot?.photo_url ?? '',
        groupKey: groupKeyFor({ cardId: null, language: null, brandId: lot?.brand_id ?? null }),
      };
    });

    const config = configRes.data
      ? { ...configRes.data, group_priority: (configRes.data.group_priority as string[]) ?? [] }
      : DEFAULT_CONFIG;
    const now = new Date();
    const repostCandidates: RepostPoolItem[] = (cardListingsRes.data ?? [])
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
        };
      })
      .filter((x): x is RepostPoolItem => x !== null)
      .sort((a, b) => a.vintedPostedAt.localeCompare(b.vintedPostedAt));

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
