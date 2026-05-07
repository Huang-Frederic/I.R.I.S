// components/dashboard/StockValueLineChart.tsx
'use client';
import { useEffect, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface Snapshot {
  date: string;
  value_for_sale: number | string;
  value_collection: number | string;
}

const TOOLTIP_CONTENT_STYLE = {
  fontSize: 11,
  backgroundColor: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: '6px',
  padding: '6px 10px',
} as const;

const TOOLTIP_LABEL_STYLE = {
  color: 'var(--color-text-muted)',
  marginBottom: '4px',
  fontWeight: 600,
} as const;

const TOOLTIP_ITEM_STYLE = {
  color: 'var(--color-text)',
} as const;

export default function StockValueLineChart({ data }: { data: readonly Snapshot[] }) {
  const [mounted, setMounted] = useState(false);
  // Recharts SSR/hydration mismatch workaround — see CostBarChart for rationale.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const series = data.map((s) => ({
    date: s.date,
    for_sale: Number(s.value_for_sale),
    collection: Number(s.value_collection),
  }));

  if (series.length === 0) {
    return (
      <div className="bg-surface border-border rounded-lg border p-4">
        <h3 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
          Valeur stock dans le temps
        </h3>
        <p className="text-text-faint text-sm">
          Données disponibles à partir du premier passage du cron pricing (2 AM UTC).
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface border-border rounded-lg border p-4">
      <h3 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
        Valeur stock dans le temps
      </h3>
      <div className="h-64 w-full">
        {mounted && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.1} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `€${v.toFixed(0)}`} />
              <Tooltip
                formatter={(v: number) => `€${v.toFixed(2)}`}
                contentStyle={TOOLTIP_CONTENT_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
                cursor={{ stroke: 'var(--color-text-faint)', strokeWidth: 1 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="for_sale" stackId="v" stroke="#5591c7" fill="#5591c7" fillOpacity={0.4} name="For Sale" />
              <Area type="monotone" dataKey="collection" stackId="v" stroke="#d97aa6" fill="#d97aa6" fillOpacity={0.4} name="Collection" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
