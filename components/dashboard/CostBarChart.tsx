// components/dashboard/CostBarChart.tsx
'use client';
import { useEffect, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface DailyAgg {
  day: string;
  gemini: number;
  vision: number;
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

export default function CostBarChart({ data, periodLabel }: { data: readonly DailyAgg[]; periodLabel: string }) {
  // Recharts generates internal IDs that mismatch between SSR and client hydration
  // (React 19 + Recharts 2.15 issue). Skip server render of the actual chart by
  // gating on a "mounted" flag set after first paint.
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  return (
    <div className="bg-surface border-border rounded-lg border p-4">
      <h3 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
        Coût OCR ({periodLabel})
      </h3>
      <div className="h-64 w-full">
        {mounted && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={[...data]} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.1} />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `€${v.toFixed(2)}`} />
              <Tooltip
                formatter={(v: number) => `€${v.toFixed(2)}`}
                contentStyle={TOOLTIP_CONTENT_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
                cursor={{ stroke: 'var(--color-text-faint)', strokeWidth: 1 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                type="monotone"
                dataKey="gemini"
                stroke="var(--color-red)"
                strokeWidth={2}
                dot={{ r: 2 }}
                activeDot={{ r: 4 }}
                name="Gemini"
              />
              <Line
                type="monotone"
                dataKey="vision"
                stroke="#4A90E2"
                strokeWidth={2}
                dot={{ r: 2 }}
                activeDot={{ r: 4 }}
                name="Vision"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
