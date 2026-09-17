'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import DeckSprites from './DeckSprites';
import TournamentModal from './TournamentModal';
import { deriveRoundResult } from '@/lib/ptcg/tournaments';
import { CATEGORY_OPTIONS, PLACEMENT_OPTIONS } from '@/lib/ptcg/tournament-meta';
import type { PtcgTournamentCategory, PtcgTournamentRoundRow, PtcgTournamentRow } from '@/lib/types';

export interface TournamentListRow extends PtcgTournamentRow {
  rounds: Pick<PtcgTournamentRoundRow, 'games' | 'outcome'>[];
}

function record(rounds: TournamentListRow['rounds']) {
  let wins = 0;
  let losses = 0;
  let ties = 0;
  for (const r of rounds) {
    const result = deriveRoundResult(r);
    if (result === 'win') wins++;
    else if (result === 'loss') losses++;
    else ties++;
  }
  return { wins, losses, ties };
}

export default function TournamentsPage({
  initialTournaments,
}: {
  initialTournaments: TournamentListRow[];
}) {
  const t = useTranslations('ptcg');
  const [tournaments, setTournaments] = useState(initialTournaments);
  const [categoryFilter, setCategoryFilter] = useState<PtcgTournamentCategory | 'all'>('all');
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(
    () =>
      categoryFilter === 'all' ? tournaments : tournaments.filter((tn) => tn.category === categoryFilter),
    [tournaments, categoryFilter],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as PtcgTournamentCategory | 'all')}
          aria-label={t('categoryFilterAria')}
          className="bg-surface-2 border-border rounded-lg border px-3 py-1.5 text-sm"
        >
          <option value="all">{t('allCategories')}</option>
          {CATEGORY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.labelKey)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="bg-red flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {t('newTournamentButton')}
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-text-muted border-border bg-surface rounded-xl border p-4 text-sm">
          {t('noTournamentsYet')}
        </p>
      ) : (
        <ul className="divide-border border-border bg-surface divide-y rounded-xl border">
          {filtered.map((tn) => {
            const { wins, losses, ties } = record(tn.rounds);
            const placementLabelKey = PLACEMENT_OPTIONS.find((o) => o.value === tn.placement)?.labelKey;
            return (
              <li key={tn.id}>
                <Link
                  href={`/ptcg/tournaments/${tn.id}`}
                  className="hover:bg-surface-2 flex items-center gap-3 p-4 transition"
                >
                  <DeckSprites dex={tn.my_archetype_dex} />
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{tn.name}</p>
                    <p className="text-text-muted text-xs">{new Date(tn.played_at).toLocaleDateString()}</p>
                  </div>
                  <span className="text-text-muted text-xs font-semibold uppercase">
                    {t('dayRecord', { wins, losses, ties })}
                  </span>
                  {placementLabelKey && (
                    <span className="bg-surface-2 rounded-full px-2 py-1 text-xs font-semibold">
                      {t(placementLabelKey)}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {createOpen && (
        <TournamentModal
          mode="create"
          open
          onClose={() => setCreateOpen(false)}
          onSaved={(tournament) => {
            setTournaments((prev) => [{ ...tournament, rounds: [] }, ...prev]);
            setCreateOpen(false);
          }}
        />
      )}
    </div>
  );
}
