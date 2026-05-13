'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FixedSizeList } from 'react-window';
import { createClient } from '@/lib/supabase/client';
import { Sparkline } from '@/components/price/Sparkline';
import type { PriceHistoryPoint } from '@/lib/types/price-history';

interface CardRow {
  id: string;
  card_name: string;
  set_name: string;
  set_number: string;
  cm_price_avg: number | null;
  status: string;
}

interface RowWithHistory extends CardRow {
  history: number[];        // up to last 30 daily points (avg)
  delta30Pct: number | null;
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
      const { data: cards } = await supabase
        .from('cards')
        .select('id, card_name, set_name, set_number, cm_price_avg, status')
        .in('status', ['for_sale', 'collection', 'pokedex'])
        .not('cm_price_avg', 'is', null);
      if (cancelled || !cards) { setLoading(false); return; }

      const ids = cards.map((c) => c.id);
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
      const { data: history } = await supabase
        .from('price_history')
        .select('card_id, bucket_date, cm_price_avg')
        .in('card_id', ids)
        .gte('bucket_date', since)
        .eq('granularity', 'daily')
        .order('bucket_date', { ascending: true });

      const byCard = new Map<string, PriceHistoryPoint[]>();
      for (const p of (history ?? []) as PriceHistoryPoint[]) {
        const arr = byCard.get(p.card_id);
        if (arr) arr.push(p); else byCard.set(p.card_id, [p]);
      }

      const enriched: RowWithHistory[] = cards.map((c) => {
        const points = byCard.get(c.id) ?? [];
        const values = points.map((p) => p.cm_price_avg).filter((v): v is number => v != null);
        const base = values[0];
        const last = c.cm_price_avg ?? values[values.length - 1] ?? null;
        const deltaPct = base != null && last != null && base > 0
          ? ((last - base) / base) * 100
          : null;
        return { ...(c as CardRow), history: values, delta30Pct: deltaPct };
      });

      if (!cancelled) {
        setRows(enriched);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    let out = rows;
    if (statusFilter !== 'all') out = out.filter((r) => r.status === statusFilter);
    if (setFilter) out = out.filter((r) => r.set_name === setFilter || r.id.startsWith(setFilter));
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
          return (b.delta30Pct ?? -Infinity) - (a.delta30Pct ?? -Infinity);
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
              <span className={`w-16 text-right text-xs ${r.delta30Pct == null ? 'text-text-faint' : r.delta30Pct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {r.delta30Pct == null ? '—' : `${r.delta30Pct >= 0 ? '+' : ''}${r.delta30Pct.toFixed(1)}%`}
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
