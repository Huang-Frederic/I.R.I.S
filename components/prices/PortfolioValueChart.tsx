'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { createClient } from '@/lib/supabase/client';
import { fetchAllRows, chunkArray } from '@/lib/api/fetch-all';

const PERIOD_OPTIONS = [30, 90, 365, 'all'] as const;
type Period = (typeof PERIOD_OPTIONS)[number];

interface Snapshot {
  date: string;
  value_for_sale: number;
  value_collection: number;
  value_pokedex: number;
}

interface CardEntry {
  id: string;
  status: 'for_sale' | 'collection' | 'pokedex';
  cm_price_avg: number;
}

interface FirstPrice {
  date: string;  // earliest bucket_date in price_history
  price: number; // cm_price_avg at that date
}

export function PortfolioValueChart() {
  const t = useTranslations('prices.portfolio');
  const [period, setPeriod] = useState<Period>(90);
  const [includes, setIncludes] = useState({ for_sale: true, collection: true, pokedex: false });
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  // For each card: the earliest price_history entry (date + price).
  // Used to backfill snapshot dates that predate the card's first snapshot,
  // so adding a new card doesn't appear as an instant profit spike.
  const [cards, setCards] = useState<CardEntry[]>([]);
  const [firstPriceMap, setFirstPriceMap] = useState<Map<string, FirstPrice>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();

      // 1. Snapshots for the selected period
      let snapQuery = supabase
        .from('stock_value_snapshots')
        .select('date, value_for_sale, value_collection, value_pokedex')
        .order('date', { ascending: true });
      if (period !== 'all') {
        const cutoff = new Date(Date.now() - (period as number) * 86_400_000).toISOString().slice(0, 10);
        snapQuery = snapQuery.gte('date', cutoff);
      }

      // 2. All currently priceable cards (to detect which ones are new).
      // Paginated: this set can exceed Supabase's 1000-row response cap.
      const cardQuery = fetchAllRows<CardEntry>((from, to) =>
        supabase
          .from('cards')
          .select('id, status, cm_price_avg')
          .in('status', ['for_sale', 'collection', 'pokedex'])
          .not('cm_price_avg', 'is', null)
          .order('id', { ascending: true })
          .range(from, to),
      );

      const [{ data: snapData }, { data: cardData }] = await Promise.all([snapQuery, cardQuery]);
      if (cancelled) return;

      const loadedCards = (cardData ?? []) as CardEntry[];
      setSnapshots((snapData ?? []) as Snapshot[]);
      setCards(loadedCards);

      if (loadedCards.length === 0) { setFirstPriceMap(new Map()); return; }

      // 3. Earliest price_history entry per card (daily granularity only).
      // Ordered ASC so we can stop at the first row per card client-side.
      // No date lower bound: we need the absolute earliest entry regardless of
      // the chart window, because a card added 200 days ago with a 90-day chart
      // window should still be treated as "always present" within that window.
      // Chunk ids (URL-length limits) and page each chunk past the 1000-row
      // response cap — otherwise most cards silently lose their backfill entry.
      // Ordering stays bucket_date ASC within each chunk so the first row seen
      // per card is still its earliest entry.
      const histChunks = await Promise.all(
        chunkArray(loadedCards.map((c) => c.id), 100).map((chunk) =>
          fetchAllRows<{ card_id: string; bucket_date: string; cm_price_avg: number | null }>((from, to) =>
            supabase
              .from('price_history')
              .select('card_id, bucket_date, cm_price_avg')
              .in('card_id', chunk)
              .eq('granularity', 'daily')
              .order('bucket_date', { ascending: true })
              .order('card_id', { ascending: true })
              .range(from, to),
          ),
        ),
      );

      if (cancelled) return;

      const map = new Map<string, FirstPrice>();
      for (const row of histChunks.flatMap((r) => r.data ?? [])) {
        if (!map.has(row.card_id) && row.cm_price_avg != null) {
          map.set(row.card_id, { date: row.bucket_date, price: row.cm_price_avg });
        }
      }
      setFirstPriceMap(map);
    })();
    return () => { cancelled = true; };
  }, [period]);

  const chartData = useMemo(() => {
    return snapshots.map((s) => {
      // For each snapshot date, add the contribution of cards that did NOT
      // appear in that snapshot yet (their first price_history entry is after
      // this date, or they have no history at all). This makes the portfolio
      // line flat before a card's first snapshot rather than spiking upward
      // the day the card was discovered/priced.
      let adj_for_sale = 0;
      let adj_collection = 0;
      let adj_pokedex = 0;

      for (const card of cards) {
        const first = firstPriceMap.get(card.id);
        const appearsOnDate = first != null && first.date <= s.date;
        if (!appearsOnDate) {
          // Use first-known price as the constant backfill; fall back to
          // current price for cards that have never had a price_history entry.
          const backfill = first?.price ?? card.cm_price_avg;
          if (card.status === 'for_sale') adj_for_sale += backfill;
          else if (card.status === 'collection') adj_collection += backfill;
          else if (card.status === 'pokedex') adj_pokedex += backfill;
        }
      }

      return {
        date: s.date,
        total:
          (includes.for_sale ? (s.value_for_sale ?? 0) + adj_for_sale : 0) +
          (includes.collection ? (s.value_collection ?? 0) + adj_collection : 0) +
          (includes.pokedex ? (s.value_pokedex ?? 0) + adj_pokedex : 0),
      };
    });
  }, [snapshots, cards, firstPriceMap, includes]);

  const current = chartData[chartData.length - 1]?.total ?? 0;
  const start = chartData[0]?.total ?? 0;
  const deltaPct = start > 0 ? ((current - start) / start) * 100 : 0;

  return (
    <div className="border-border rounded border p-3">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium">{t('title')}</h2>
          <p className="text-lg font-semibold">
            {current.toFixed(2)}€{' '}
            <span className={`text-xs ${deltaPct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {deltaPct >= 0 ? '↑' : '↓'} {Math.abs(deltaPct).toFixed(1)}%
            </span>
          </p>
        </div>
        <div className="flex gap-1">
          {PERIOD_OPTIONS.map((p) => (
            <button
              key={String(p)}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded px-2 py-0.5 text-xs ${period === p ? 'bg-red text-white' : 'bg-surface-2 hover:bg-surface-off'}`}
            >
              {p === 'all' ? t('periodAll') : t('periodDays', { days: p })}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-3 text-xs">
        {(['for_sale', 'collection', 'pokedex'] as const).map((k) => (
          <label key={k} className="inline-flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={includes[k]}
              onChange={(e) => setIncludes((prev) => ({ ...prev, [k]: e.target.checked }))}
              className="accent-[#e05252] h-3.5 w-3.5 cursor-pointer"
            />
            <span>{t(k)}</span>
          </label>
        ))}
      </div>

      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={(v) => `${Number(v).toFixed(0)}€`} tick={{ fontSize: 10 }} />
            <Tooltip
              formatter={(v) => `${Number(v).toFixed(2)}€`}
              contentStyle={{
                background: 'var(--color-surface-2)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
                borderRadius: 4,
                fontSize: 12,
              }}
              labelStyle={{ color: 'var(--color-text-muted)' }}
              itemStyle={{ color: 'var(--color-text)' }}
            />
            <Area
              name={t('lineLabel')}
              type="monotone"
              dataKey="total"
              stroke="#22c55e"
              fill="url(#portfolioGradient)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
