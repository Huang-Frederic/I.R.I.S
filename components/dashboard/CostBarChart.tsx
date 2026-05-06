// components/dashboard/CostBarChart.tsx
'use client';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface Entry {
  created_at: string;
  engine: 'gemini' | 'vision';
  cost_eur: number | string;
}

interface DailyAgg {
  day: string;
  gemini: number;
  vision: number;
}

function aggregateByDay(entries: readonly Entry[]): DailyAgg[] {
  const map = new Map<string, DailyAgg>();
  // Ensure we have a row for every day in the last 30 days even if 0 cost.
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    map.set(d, { day: d, gemini: 0, vision: 0 });
  }
  for (const e of entries) {
    const day = e.created_at.slice(0, 10);
    const row = map.get(day);
    if (!row) continue;
    row[e.engine] += Number(e.cost_eur);
  }
  return Array.from(map.values());
}

export default function CostBarChart({ data }: { data: readonly Entry[] }) {
  const daily = aggregateByDay(data);
  return (
    <div className="bg-surface border-border rounded-lg border p-4">
      <h3 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
        Coût OCR (30 jours)
      </h3>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={daily} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
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
