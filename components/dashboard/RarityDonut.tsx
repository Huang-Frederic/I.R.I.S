// components/dashboard/RarityDonut.tsx
'use client';
import { useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useRouter } from 'next/navigation';
import { RARITY_COLOR_HEX } from '@/lib/utils/labels';
import type { CardRarity } from '@/lib/types';

interface CountSlice {
  rarity: CardRarity;
  count: number;
}

interface ValueSlice {
  rarity: CardRarity;
  value: number;
}

interface Props {
  counts: readonly CountSlice[];
  values: readonly ValueSlice[];
}

type Mode = 'count' | 'value';

export default function RarityDonut({ counts, values }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('count');

  if (counts.length === 0) {
    return (
      <div className="bg-surface border-border rounded-lg border p-4">
        <h3 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
          Répartition rareté
        </h3>
        <p className="text-text-faint text-sm">Pas encore de cartes.</p>
      </div>
    );
  }

  const data = mode === 'count'
    ? counts.map((c) => ({ rarity: c.rarity, dataKey: c.count }))
    : values.map((v) => ({ rarity: v.rarity, dataKey: v.value }));

  return (
    <div className="bg-surface border-border rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-text-muted text-xs font-semibold uppercase tracking-wide">
          Répartition rareté
        </h3>
        <div className="bg-surface-2 inline-flex rounded-md p-0.5">
          {(['count', 'value'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-2 py-0.5 text-xs font-medium rounded transition-colors ${
                mode === m ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text'
              }`}
            >
              {m === 'count' ? 'Compte' : 'Valeur'}
            </button>
          ))}
        </div>
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={[...data]}
              dataKey="dataKey"
              nameKey="rarity"
              innerRadius="55%"
              outerRadius="85%"
              onClick={(d) => router.push(`/pokedex?rarity=${d.rarity}`)}
              cursor="pointer"
            >
              {data.map((d) => (
                <Cell key={d.rarity} fill={RARITY_COLOR_HEX[d.rarity] ?? '#888'} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v: number, name: string) =>
                mode === 'count'
                  ? [`${v} cartes`, name]
                  : [`€${v.toFixed(2)}`, name]
              }
              contentStyle={{ fontSize: 11 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
