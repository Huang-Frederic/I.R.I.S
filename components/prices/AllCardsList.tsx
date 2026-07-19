'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FixedSizeList } from 'react-window';
import { createClient } from '@/lib/supabase/client';
import { fetchAllRows, chunkArray } from '@/lib/api/fetch-all';
import { Sparkline } from '@/components/price/Sparkline';
import { findPointForTier } from '@/lib/utils/price-trend';
import type { PriceHistoryPoint } from '@/lib/types/price-history';

interface CardRow {
  id: string;
  card_id_tcg: string | null;
  card_name: string;
  set_name: string;
  set_code: string | null;
  set_number: string;
  cm_price_avg: number | null;
  status: string;
}

interface RowWithHistory extends CardRow {
  history: number[];        // up to last 30 daily points (avg)
  deltaPct: number | null;
  deltaPeriodDays: 30 | 7 | 1 | null;
}

const ROW_HEIGHT = 44;

interface Props {
  initialSetFilter: string | null;
  onCardClick: (cardId: string) => void;
}

type SortKey = 'delta' | 'price' | 'name' | 'set';

export function AllCardsList({ initialSetFilter, onCardClick }: Props) {
  const t = useTranslations('prices');
  const tList = useTranslations('prices.list');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('delta');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [setFilter, setSetFilter] = useState<string | null>(initialSetFilter);
  const [rows, setRows] = useState<RowWithHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const supabase = createClient();
      // Paginated: the priced-card set can exceed Supabase's 1000-row cap.
      const { data: cards } = await fetchAllRows<CardRow>((from, to) =>
        supabase
          .from('cards')
          .select('id, card_id_tcg, card_name, set_name, set_code, set_number, cm_price_avg, status')
          .in('status', ['for_sale', 'collection', 'pokedex'])
          .not('cm_price_avg', 'is', null)
          .order('id', { ascending: true })
          .range(from, to),
      );
      if (cancelled || !cards) { setLoading(false); return; }

      const ids = cards.map((c) => c.id);
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
      // Chunk ids (URL-length limits) and page each chunk: N cards × 30 daily
      // points blows way past the 1000-row cap, which used to silently blank
      // most sparklines/deltas on this list.
      const historyChunks = await Promise.all(
        chunkArray(ids, 100).map((chunk) =>
          fetchAllRows<Pick<PriceHistoryPoint, 'card_id' | 'bucket_date' | 'cm_price_avg'>>((from, to) =>
            supabase
              .from('price_history')
              .select('card_id, bucket_date, cm_price_avg')
              .in('card_id', chunk)
              .gte('bucket_date', since)
              .eq('granularity', 'daily')
              .order('bucket_date', { ascending: true })
              .order('card_id', { ascending: true })
              .range(from, to),
          ),
        ),
      );
      const history = historyChunks.flatMap((r) => r.data ?? []);

      const byCard = new Map<string, PriceHistoryPoint[]>();
      for (const p of (history ?? []) as PriceHistoryPoint[]) {
        const arr = byCard.get(p.card_id);
        if (arr) arr.push(p); else byCard.set(p.card_id, [p]);
      }

      const todayIso = new Date().toISOString().slice(0, 10);
      const enriched: RowWithHistory[] = cards.map((c) => {
        const points = byCard.get(c.id) ?? [];
        const values = points.map((p) => p.cm_price_avg).filter((v): v is number => v != null);
        // Try J-30 → J-7 → J-1: use the longest period that has a data point.
        let base: number | null = null;
        let deltaPeriodDays: 30 | 7 | 1 | null = null;
        for (const days of [30, 7, 1] as const) {
          const b = findPointForTier(points, todayIso, days);
          if (b !== null) { base = b; deltaPeriodDays = days; break; }
        }
        const last = c.cm_price_avg ?? values[values.length - 1] ?? null;
        const deltaPct = base != null && last != null && base > 0
          ? ((last - base) / base) * 100
          : null;
        return { ...(c as CardRow), history: values, deltaPct, deltaPeriodDays };
      });

      if (!cancelled) {
        // Collapse multiple copies of the same print into one row, preserving
        // the sort order from the enriched array (delta, price, name, or set).
        const seen = new Map<string, { row: RowWithHistory; index: number }>();
        for (let i = 0; i < enriched.length; i++) {
          const r = enriched[i];
          const key = r.card_id_tcg ?? r.id;
          const prev = seen.get(key);
          if (!prev || (r.cm_price_avg ?? 0) > (prev.row.cm_price_avg ?? 0)) {
            seen.set(key, { row: r, index: i });
          }
        }
        const deduplicated = Array.from(seen.values())
          .sort((a, b) => a.index - b.index)
          .map(({ row }) => row);
        setRows(deduplicated);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    let out = rows;
    if (statusFilter !== 'all') out = out.filter((r) => r.status === statusFilter);
    if (setFilter) out = out.filter((r) => r.set_code === setFilter);
    if (search) {
      const q = search.toLowerCase();
      out = out.filter(
        (r) =>
          r.card_name.toLowerCase().includes(q) ||
          r.set_number?.toLowerCase().includes(q) ||
          r.set_name?.toLowerCase().includes(q),
      );
    }
    out = [...out].sort((a, b) => {
      switch (sortKey) {
        case 'delta':
          return (b.deltaPct ?? -Infinity) - (a.deltaPct ?? -Infinity);
        case 'price':
          return (b.cm_price_avg ?? 0) - (a.cm_price_avg ?? 0);
        case 'name':
          return a.card_name.localeCompare(b.card_name);
        case 'set':
          return (a.set_name ?? '').localeCompare(b.set_name ?? '');
      }
    });
    return out;
  }, [rows, search, sortKey, statusFilter, setFilter]);

  if (loading) return <div className="border-border rounded border p-3 text-sm">{t('loading')}</div>;

  return (
    <div className="border-border rounded border p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-medium">{tList('title')}</h2>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tList('searchPlaceholder')}
          className="bg-surface-2 border-border rounded border px-2 py-1 text-xs"
        />
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="bg-surface-2 border-border rounded border px-2 py-1 text-xs"
        >
          <option value="delta">{tList('sortDelta')}</option>
          <option value="price">{tList('sortPrice')}</option>
          <option value="name">{tList('sortName')}</option>
          <option value="set">{tList('sortSet')}</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-surface-2 border-border rounded border px-2 py-1 text-xs"
        >
          <option value="all">{tList('statusAll')}</option>
          <option value="for_sale">{tList('statusForSale')}</option>
          <option value="collection">{tList('statusCollection')}</option>
          <option value="pokedex">{tList('statusPokedex')}</option>
        </select>
        {setFilter && (
          <button
            type="button"
            onClick={() => setSetFilter(null)}
            className="bg-surface-2 hover:bg-surface-off border-border rounded border px-2 py-1 text-xs"
          >
            {tList('setFilterClear', { set: setFilter })}
          </button>
        )}
      </div>

      <FixedSizeList
        height={Math.min(600, filtered.length * ROW_HEIGHT + ROW_HEIGHT)}
        itemCount={filtered.length}
        itemSize={ROW_HEIGHT}
        width="100%"
      >
        {({ index, style }) => {
          const r = filtered[index];
          return (
            <div
              style={style}
              role="button"
              tabIndex={0}
              onClick={() => onCardClick(r.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onCardClick(r.id); }}
              className="hover:bg-surface-2 flex cursor-pointer items-center gap-3 border-b border-border px-2 text-sm"
            >
              <span className="flex-1 truncate">
                {r.card_name} <span className="text-text-faint text-xs">{r.set_number} · {r.set_name}</span>
              </span>
              <Sparkline values={r.history} />
              <span className={`w-16 text-right text-xs ${r.deltaPct == null ? 'text-text-faint' : r.deltaPct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {r.deltaPct == null ? '—' : (
                  <>
                    {r.deltaPct >= 0 ? '+' : ''}{r.deltaPct.toFixed(1)}%
                    {r.deltaPeriodDays !== 30 && (
                      <span className="ml-0.5 opacity-50">{r.deltaPeriodDays}j</span>
                    )}
                  </>
                )}
              </span>
              <span className="w-14 text-right text-xs">
                {r.cm_price_avg == null ? '—' : `${r.cm_price_avg.toFixed(2)}€`}
              </span>
            </div>
          );
        }}
      </FixedSizeList>
    </div>
  );
}
