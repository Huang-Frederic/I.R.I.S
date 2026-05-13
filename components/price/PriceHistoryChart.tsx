'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { PriceHistoryPoint } from '@/lib/types/price-history';

export interface PriceHistoryChartProps {
  points: PriceHistoryPoint[];   // already sorted ascending
}

type Period = 7 | 30 | 90 | 365 | 'all';

export function PriceHistoryChart({ points }: PriceHistoryChartProps) {
  const t = useTranslations('prices.chart');
  const [period, setPeriod] = useState<Period>(30);

  const periodLabel = (p: Period): string => {
    switch (p) {
      case 7: return t('period7d');
      case 30: return t('period30d');
      case 90: return t('period90d');
      case 365: return t('period1y');
      case 'all': return t('periodAll');
    }
  };

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
      <div className="border-border text-text-muted rounded border p-4 text-center text-sm">
        {t('noHistory')}
      </div>
    );
  }

  return (
    <div className="border-border rounded border p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium">{t('title')}</h3>
        <div className="flex gap-1">
          {([7, 30, 90, 365, 'all'] as Period[]).map((p) => (
            <button
              key={String(p)}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded px-2 py-0.5 text-xs ${period === p ? 'bg-red text-white' : 'bg-surface-2 hover:bg-surface-off'}`}
            >
              {periodLabel(p)}
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
            <Line type="monotone" dataKey="avg" stroke="#dc2626" strokeWidth={2} dot={false} name={t('lineLabel')} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
