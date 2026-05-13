'use client';

import { useEffect, useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { createClient } from '@/lib/supabase/client';

const PERIOD_OPTIONS = [30, 90, 365, 'all'] as const;
type Period = (typeof PERIOD_OPTIONS)[number];

interface Snapshot {
  date: string;
  value_for_sale: number;
  value_collection: number;
  value_pokedex: number;
}

export function PortfolioValueChart() {
  const [period, setPeriod] = useState<Period>(90);
  const [includes, setIncludes] = useState({ for_sale: true, collection: true, pokedex: false });
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      let query = supabase.from('stock_value_snapshots')
        .select('date, value_for_sale, value_collection, value_pokedex')
        .order('date', { ascending: true });
      if (period !== 'all') {
        const cutoff = new Date(Date.now() - (period as number) * 86_400_000).toISOString().slice(0, 10);
        query = query.gte('date', cutoff);
      }
      const { data } = await query;
      if (!cancelled) setSnapshots((data ?? []) as Snapshot[]);
    })();
    return () => { cancelled = true; };
  }, [period]);

  const chartData = useMemo(
    () =>
      snapshots.map((s) => ({
        date: s.date,
        total:
          (includes.for_sale ? s.value_for_sale : 0) +
          (includes.collection ? s.value_collection : 0) +
          (includes.pokedex ? s.value_pokedex : 0),
      })),
    [snapshots, includes],
  );

  const current = chartData[chartData.length - 1]?.total ?? 0;
  const start = chartData[0]?.total ?? 0;
  const deltaPct = start > 0 ? ((current - start) / start) * 100 : 0;

  return (
    <div className="border-border rounded border p-3">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium">Valeur du portefeuille</h2>
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
              {p === 'all' ? 'tout' : `${p}j`}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-2 flex flex-wrap gap-3 text-xs">
        {(['for_sale', 'collection', 'pokedex'] as const).map((k) => (
          <label key={k} className="inline-flex items-center gap-1">
            <input
              type="checkbox"
              checked={includes[k]}
              onChange={(e) => setIncludes((prev) => ({ ...prev, [k]: e.target.checked }))}
            />
            {k}
          </label>
        ))}
      </div>

      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity={0.4} />
                <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={(v) => `${Number(v).toFixed(0)}€`} tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v) => `${Number(v).toFixed(2)}€`} />
            <Area type="monotone" dataKey="total" stroke="currentColor" fill="url(#portfolioGradient)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
