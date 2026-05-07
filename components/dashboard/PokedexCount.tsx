// components/dashboard/PokedexCount.tsx
import Link from 'next/link';
import { BookOpen } from 'lucide-react';

interface Props {
  /** Number of distinct pokemon_number with status='pokedex'. */
  collected: number;
  /** Total of the National Dex covered by the app (1025 for gen 1-9). */
  total?: number;
}

export default function PokedexCount({ collected, total = 1025 }: Props) {
  const pct = total > 0 ? (collected / total) * 100 : 0;
  return (
    <Link
      href="/pokedex"
      className="bg-surface border-border hover:border-text-faint flex flex-col rounded-lg border p-4 transition-colors"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-text-muted text-xs font-semibold uppercase tracking-wide">
          Pokédex
        </h3>
        <BookOpen className="text-text-faint h-4 w-4" />
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-text text-3xl font-semibold">{collected}</span>
        <span className="text-text-muted text-sm">/ {total}</span>
        <span className="text-text-faint ml-auto text-xs">{pct.toFixed(1)}%</span>
      </div>
      <div className="bg-surface-2 mt-3 h-2 overflow-hidden rounded-full">
        <div
          className="bg-red h-full transition-all"
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </Link>
  );
}
