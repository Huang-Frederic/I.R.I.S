// components/dashboard/RarityDonut.tsx
'use client';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useRouter } from 'next/navigation';
import { RARITY_COLOR_HEX } from '@/lib/utils/labels';
import type { CardRarity } from '@/lib/types';

interface Slice {
  rarity: CardRarity;
  count: number;
}

export default function RarityDonut({ data }: { data: readonly Slice[] }) {
  const router = useRouter();

  if (data.length === 0) {
    return (
      <div className="bg-surface border-border rounded-lg border p-4">
        <h3 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
          Répartition rareté
        </h3>
        <p className="text-text-faint text-sm">Pas encore de cartes.</p>
      </div>
    );
  }

  return (
    <div className="bg-surface border-border rounded-lg border p-4">
      <h3 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
        Répartition rareté
      </h3>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={[...data]}
              dataKey="count"
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
            <Tooltip formatter={(v: number, name: string) => [`${v} cartes`, name]} contentStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
