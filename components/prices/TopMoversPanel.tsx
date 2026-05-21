'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface MoverRow {
  card_id: string;
  card_name: string;
  set_name: string;
  set_number: string;
  current_avg: number;
  base_avg: number;
  delta_pct: number;
}

interface Props {
  onCardClick: (cardId: string) => void;   // parent fetches Card and opens modal
}

const PERIOD_OPTIONS = [7, 30, 90] as const;
// Descending fallback chain: if the selected period has no movers yet (not
// enough history), automatically try shorter periods so the panel isn't empty
// while the price_history table is still accumulating data.
const ALL_PERIODS = [90, 30, 7, 1] as const;

export function TopMoversPanel({ onCardClick }: Props) {
  const t = useTranslations('prices.topMovers');
  const [period, setPeriod] = useState<number>(7);
  const [ups, setUps] = useState<MoverRow[]>([]);
  const [downs, setDowns] = useState<MoverRow[]>([]);
  const [actualPeriod, setActualPeriod] = useState<number>(7);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      // Build fallback chain: selected period first, then shorter ones.
      const chain = ALL_PERIODS.filter((p) => p <= period);
      for (const p of chain) {
        const [{ data: u }, { data: d }] = await Promise.all([
          supabase.rpc('price_history_top_movers', { period_days: p, direction: 'up' }),
          supabase.rpc('price_history_top_movers', { period_days: p, direction: 'down' }),
        ]);
        if (cancelled) return;
        const uRows = (u ?? []) as MoverRow[];
        const dRows = (d ?? []) as MoverRow[];
        if (uRows.length > 0 || dRows.length > 0) {
          setUps(uRows);
          setDowns(dRows);
          setActualPeriod(p);
          return;
        }
      }
      // All periods returned empty — not enough history yet.
      if (!cancelled) { setUps([]); setDowns([]); setActualPeriod(period); }
    })();
    return () => { cancelled = true; };
  }, [period]);

  return (
    <div className="border-border rounded border p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium">
          {t('title')}
          {actualPeriod !== period && (
            <span className="text-text-faint ml-1.5 text-xs font-normal">({actualPeriod}j)</span>
          )}
        </h2>
        <div className="flex gap-1">
          {PERIOD_OPTIONS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded px-2 py-0.5 text-xs ${period === p ? 'bg-red text-white' : 'bg-surface-2 hover:bg-surface-off'}`}
            >
              {t('periodDays', { days: p })}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Column title={t('ups')} emptyLabel={t('noData')} rows={ups} icon={<ArrowUp className="h-3 w-3 text-green-600 dark:text-green-400" />} onClick={onCardClick} />
        <Column title={t('downs')} emptyLabel={t('noData')} rows={downs} icon={<ArrowDown className="h-3 w-3 text-red-600 dark:text-red-400" />} onClick={onCardClick} />
      </div>
    </div>
  );
}

function Column({
  title,
  emptyLabel,
  rows,
  icon,
  onClick,
}: {
  title: string;
  emptyLabel: string;
  rows: MoverRow[];
  icon: React.ReactNode;
  onClick: (cardId: string) => void;
}) {
  return (
    <div>
      <p className="text-text-muted mb-1 text-xs uppercase tracking-wide">{title}</p>
      <ul className="space-y-1 text-xs">
        {rows.length === 0 && <li className="text-text-faint">{emptyLabel}</li>}
        {rows.map((r) => (
          <li key={r.card_id}>
            <button
              type="button"
              onClick={() => onClick(r.card_id)}
              className="hover:bg-surface-2 -mx-1 flex w-full items-center gap-2 rounded px-1 py-1 text-left"
            >
              {icon}
              <span className="flex-1 truncate">{r.card_name} <span className="text-text-faint">{r.set_number}</span></span>
              <span className={r.delta_pct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                {r.delta_pct >= 0 ? '+' : ''}{r.delta_pct.toFixed(1)}%
              </span>
              <span className="text-text-faint">{r.current_avg.toFixed(2)}€</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
