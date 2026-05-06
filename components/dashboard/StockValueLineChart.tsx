// components/dashboard/StockValueLineChart.tsx
'use client';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface Snapshot {
  date: string;
  value_for_sale: number | string;
  value_collection: number | string;
}

export default function StockValueLineChart({ data }: { data: readonly Snapshot[] }) {
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
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.1} />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `€${v.toFixed(0)}`} />
            <Tooltip formatter={(v: number) => `€${v.toFixed(2)}`} contentStyle={{ fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="for_sale" stackId="v" stroke="#5591c7" fill="#5591c7" fillOpacity={0.4} name="For Sale" />
            <Area type="monotone" dataKey="collection" stackId="v" stroke="#d97aa6" fill="#d97aa6" fillOpacity={0.4} name="Collection" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
