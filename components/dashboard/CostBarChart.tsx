// components/dashboard/CostBarChart.tsx
'use client';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface DailyAgg {
  day: string;
  gemini: number;
  vision: number;
}

// Pure renderer — aggregation is done server-side in the Dashboard page so that
// the same `daily` array is used for SSR and client hydration. Computing it in
// the client component would call Date.now() at hydration time, producing dates
// that don't match the SSR snapshot.
export default function CostBarChart({ data, periodLabel }: { data: readonly DailyAgg[]; periodLabel: string }) {
  return (
    <div className="bg-surface border-border rounded-lg border p-4">
      <h3 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
        Coût OCR ({periodLabel})
      </h3>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={[...data]} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.1} />
            <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `€${v.toFixed(3)}`} />
            <Tooltip
              formatter={(v: number) => `€${v.toFixed(6)}`}
              labelStyle={{ color: '#222' }}
              contentStyle={{ fontSize: 11 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="gemini" stackId="cost" fill="#5591c7" name="Gemini" />
            <Bar dataKey="vision" stackId="cost" fill="#d97aa6" name="Vision" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
