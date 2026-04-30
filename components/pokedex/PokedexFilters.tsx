'use client';

import { Search, Grid2x2, Grid3x3, List } from 'lucide-react';
import { GENERATIONS } from '@/lib/utils/pokemon-generations';

export type StatusFilter = 'all' | 'completed' | 'missing';
export type ViewMode = 'grid-large' | 'grid-compact' | 'list';

export interface FilterState {
  gen: string;
  status: StatusFilter;
  search: string;
}

interface PokedexFiltersProps {
  value: FilterState;
  onChange: (next: FilterState) => void;
  total: number;
  visible: number;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

export default function PokedexFilters({
  value,
  onChange,
  total,
  visible,
  viewMode,
  onViewModeChange,
}: PokedexFiltersProps) {
  return (
    <div className="bg-bg sticky top-0 z-10 -mx-4 mb-4 flex flex-col gap-3 px-4 py-3 md:mx-0 md:px-0">
      <div className="flex flex-wrap items-center gap-3">
        <div className="border-border flex overflow-hidden rounded border text-sm" role="group" aria-label="Mode d'affichage">
          {([
            { mode: 'grid-compact' as ViewMode, icon: Grid3x3, label: 'Grille compacte' },
            { mode: 'grid-large' as ViewMode, icon: Grid2x2, label: 'Grille large' },
            { mode: 'list' as ViewMode, icon: List, label: 'Liste' },
          ]).map(({ mode, icon: Icon, label }) => {
            const active = viewMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onViewModeChange(mode)}
                aria-label={label}
                aria-pressed={active}
                className={`px-3 py-2 flex items-center gap-2 transition-colors ${
                  active
                    ? 'bg-red-bg text-red'
                    : 'bg-surface-2 text-text-muted hover:text-text'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline text-xs">{label}</span>
              </button>
            );
          })}
        </div>
        <select
          value={value.gen}
          onChange={(e) => onChange({ ...value, gen: e.target.value })}
          className="bg-surface-2 border-border rounded border px-3 py-1.5 text-sm"
          aria-label="Filtre génération"
        >
          <option value="all">Toutes générations</option>
          {GENERATIONS.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>

        <div className="border-border flex overflow-hidden rounded border text-sm">
          {(['all', 'completed', 'missing'] as StatusFilter[]).map((s) => {
            const active = value.status === s;
            const label = s === 'all' ? 'Tous' : s === 'completed' ? 'Complétés' : 'Manquants';
            return (
              <button
                key={s}
                type="button"
                onClick={() => onChange({ ...value, status: s })}
                className={`px-3 py-1.5 transition-colors ${
                  active
                    ? 'bg-red-bg text-red font-medium'
                    : 'bg-surface-2 text-text-muted hover:text-text'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="relative flex-1 min-w-[160px]">
          <Search className="text-text-faint pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2" />
          <input
            type="search"
            placeholder="N° ou nom"
            value={value.search}
            onChange={(e) => onChange({ ...value, search: e.target.value })}
            className="bg-surface-2 border-border focus:border-red w-full rounded border py-1.5 pl-8 pr-3 text-sm outline-none"
          />
        </div>
      </div>

      <p className="text-text-muted text-xs">
        {visible} affiché{visible > 1 ? 's' : ''} · {total} dans le filtre
      </p>
    </div>
  );
}
