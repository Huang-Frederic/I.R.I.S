'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface StatsRow {
  cards_up: number;
  cards_down: number;
  cards_stable: number;
  mean_volatility_pct: number;
}

const PERIOD_OPTIONS = [7, 30, 90] as const;
// Fallback chain: if the selected period has no cards with a baseline,
// try shorter periods so the stats are never empty while the history builds up.
const FALLBACK_ORDER = [7, 30, 90] as const;

export function StatsHeader() {
  const t = useTranslations('prices');
  const tStats = useTranslations('prices.stats');
  const [period, setPeriod] = useState<number>(7);
  const [stats, setStats] = useState<StatsRow | null>(null);
  const [actualPeriod, setActualPeriod] = useState<number>(7);
  const [noData, setNoData] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStats(null);
    setNoData(false);
    (async () => {
      const supabase = createClient();
      // Try the selected period; if it returns 0 tracked cards, fall back to
      // shorter periods so the header is never a blank loading state while the
      // price_history table is still accumulating data.
      const chain = [period, ...FALLBACK_ORDER.filter((p) => p < period)];
      for (const p of chain) {
        const { data, error } = await supabase.rpc('price_history_global_stats', { period_days: p });
        if (cancelled) return;
        if (error) break; // surface as noData below
        const row = (data?.[0] ?? null) as StatsRow | null;
        if (row && (row.cards_up + row.cards_down + row.cards_stable) > 0) {
          setStats(row);
          setActualPeriod(p);
          return;
        }
      }
      // Either RPC errored or all periods returned 0 tracked cards.
      if (!cancelled) setNoData(true);
    })();
    return () => { cancelled = true; };
  }, [period]);

  if (noData) {
    return (
      <div className="border-border rounded border p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium">{t('overview')}</h2>
          <PeriodButtons period={period} setPeriod={setPeriod} />
        </div>
        <p className="text-text-faint text-xs">Pas encore de données — le premier snapshot arrive ce soir à 23h55.</p>
      </div>
    );
  }

  if (!stats) {
    return <div className="border-border rounded border p-3 text-sm text-text-faint">{t('loading')}</div>;
  }

  return (
    <div className="border-border rounded border p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium">
          {t('overview')}
          {actualPeriod !== period && (
            <span className="text-text-faint ml-1.5 text-xs font-normal">({actualPeriod}j)</span>
          )}
        </h2>
        <PeriodButtons period={period} setPeriod={setPeriod} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Stat icon={<TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />} label={tStats('labelUp')} value={stats.cards_up} />
        <Stat icon={<TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />} label={tStats('labelDown')} value={stats.cards_down} />
        <Stat icon={<Minus className="h-4 w-4 text-text-faint" />} label={tStats('labelStable')} value={stats.cards_stable} />
        <Stat label={tStats('labelVolatility', { period: actualPeriod })} value={`±${stats.mean_volatility_pct}%`} />
      </div>
    </div>
  );
}

function PeriodButtons({
  period,
  setPeriod,
}: {
  period: number;
  setPeriod: (p: number) => void;
}) {
  const tStats = useTranslations('prices.stats');
  return (
    <div className="flex gap-1">
      {PERIOD_OPTIONS.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => setPeriod(p)}
          className={`rounded px-2 py-0.5 text-xs ${period === p ? 'bg-red text-white' : 'bg-surface-2 hover:bg-surface-off'}`}
        >
          {tStats('periodDays', { days: p })}
        </button>
      ))}
    </div>
  );
}

function Stat({ icon, label, value }: { icon?: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="border-border flex items-center gap-2 rounded border p-2">
      {icon}
      <div>
        <p className="text-text-faint">{label}</p>
        <p className="font-medium">{value}</p>
      </div>
    </div>
  );
}
