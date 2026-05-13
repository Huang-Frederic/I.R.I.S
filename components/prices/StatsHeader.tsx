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

export function StatsHeader() {
  const t = useTranslations('prices');
  const tStats = useTranslations('prices.stats');
  const [period, setPeriod] = useState<number>(7);
  const [stats, setStats] = useState<StatsRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.rpc('price_history_global_stats', { period_days: period });
      if (!cancelled) setStats((data?.[0] ?? null) as StatsRow | null);
    })();
    return () => { cancelled = true; };
  }, [period]);

  if (!stats) {
    return <div className="border-border rounded border p-3 text-sm text-text-faint">{t('loading')}</div>;
  }

  return (
    <div className="border-border rounded border p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium">{t('overview')}</h2>
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
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Stat icon={<TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />} label={tStats('labelUp')} value={stats.cards_up} />
        <Stat icon={<TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />} label={tStats('labelDown')} value={stats.cards_down} />
        <Stat icon={<Minus className="h-4 w-4 text-text-faint" />} label={tStats('labelStable')} value={stats.cards_stable} />
        <Stat label={tStats('labelVolatility', { period })} value={`±${stats.mean_volatility_pct}%`} />
      </div>
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
