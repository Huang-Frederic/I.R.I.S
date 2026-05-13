'use client';

import { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { PriceHistoryPoint } from '@/lib/types/price-history';

export interface PriceHistoryChartProps {
  points: PriceHistoryPoint[];   // already sorted ascending
}

type Period = 7 | 30 | 90 | 365 | 'all';
const PERIOD_LABELS: Record<string, string> = {
  '7':   '7j',
  '30':  '30j',
  '90':  '90j',
  '365': '1an',
  'all': 'tout',
};

export function PriceHistoryChart({ points }: PriceHistoryChartProps) {
  const [period, setPeriod] = useState<Period>(30);

  const filtered = useMemo(() => {
    if (period === 'all') return points;
    const cutoff = Date.now() - period * 86_400_000;
    return points.filter((p) => new Date(p.bucket_date + 'T00:00:00Z').getTime() >= cutoff);
  }, [points, period]);

  const chartData = useMemo(
    () =>
      filtered
        .filter((p) => p.cm_price_avg != null)
        .map((p) => ({ date: p.bucket_date, avg: p.cm_price_avg as number })),
    [filtered],
  );

  if (chartData.length < 2) {
    return (
      <div className="border-border rounded border p-4 text-center text-sm text-text-faint">
        Pas encore d&apos;historique — reviens demain.
      </div>
    );
  }

  return (
    <div className="border-border rounded border p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium">Évolution</h3>
        <div className="flex gap-1">
          {([7, 30, 90, 365, 'all'] as Period[]).map((p) => (
            <button
              key={String(p)}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded px-2 py-0.5 text-xs ${period === p ? 'bg-red text-white' : 'bg-surface-2 hover:bg-surface-off'}`}
            >
              {PERIOD_LABELS[String(p)]}
            </button>
          ))}
        </div>
      </div>
      <div style={{ width: '100%', height: 200 }}>
        <ResponsiveContainer>
          <LineChart data={chartData}>
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={(v) => `${Number(v).toFixed(2)}€`} tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
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
            <Line type="monotone" dataKey="avg" stroke="#dc2626" strokeWidth={2} dot={false} name="Avg" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
