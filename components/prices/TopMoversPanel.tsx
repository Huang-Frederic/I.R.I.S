'use client';

import { useEffect, useState } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface MoverRow {
  card_id: string;
  card_name: string;
  set_name: string;
  set_number: string;
  current_avg: number;
  base_avg: number;
  delta_pct: number;
}

interface Props {
  onCardClick: (cardId: string) => void;   // parent fetches Card and opens modal
}

const PERIOD_OPTIONS = [7, 30, 90] as const;

export function TopMoversPanel({ onCardClick }: Props) {
  const [period, setPeriod] = useState<number>(7);
  const [ups, setUps] = useState<MoverRow[]>([]);
  const [downs, setDowns] = useState<MoverRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const [{ data: u }, { data: d }] = await Promise.all([
        supabase.rpc('price_history_top_movers', { period_days: period, direction: 'up' }),
        supabase.rpc('price_history_top_movers', { period_days: period, direction: 'down' }),
      ]);
      if (cancelled) return;
      setUps((u ?? []) as MoverRow[]);
      setDowns((d ?? []) as MoverRow[]);
    })();
    return () => { cancelled = true; };
  }, [period]);

  return (
    <div className="border-border rounded border p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium">Top mouvements</h2>
        <div className="flex gap-1">
          {PERIOD_OPTIONS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded px-2 py-0.5 text-xs ${period === p ? 'bg-red text-white' : 'bg-surface-2 hover:bg-surface-off'}`}
            >
              {p}j
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Column title="Top hausses" rows={ups} icon={<ArrowUp className="h-3 w-3 text-green-600 dark:text-green-400" />} onClick={onCardClick} />
        <Column title="Top baisses" rows={downs} icon={<ArrowDown className="h-3 w-3 text-red-600 dark:text-red-400" />} onClick={onCardClick} />
      </div>
    </div>
  );
}

function Column({
  title,
  rows,
  icon,
  onClick,
}: {
  title: string;
  rows: MoverRow[];
  icon: React.ReactNode;
  onClick: (cardId: string) => void;
}) {
  return (
    <div>
      <p className="text-text-muted mb-1 text-xs uppercase tracking-wide">{title}</p>
      <ul className="space-y-1 text-xs">
        {rows.length === 0 && <li className="text-text-faint">Pas encore de données.</li>}
        {rows.map((r) => (
          <li key={r.card_id}>
            <button
              type="button"
              onClick={() => onClick(r.card_id)}
              className="hover:bg-surface-2 -mx-1 flex w-full items-center gap-2 rounded px-1 py-1 text-left"
            >
              {icon}
              <span className="flex-1 truncate">{r.card_name} <span className="text-text-faint">{r.set_number}</span></span>
              <span className={r.delta_pct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                {r.delta_pct >= 0 ? '+' : ''}{r.delta_pct.toFixed(1)}%
              </span>
              <span className="text-text-faint">{r.current_avg.toFixed(2)}€</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
