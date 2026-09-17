'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import DeckSprites from './DeckSprites';
import TournamentModal from './TournamentModal';
import RoundForm from './RoundForm';
import ConfirmDialog from '@/components/vinted/ConfirmDialog';
import { deriveRoundResult } from '@/lib/ptcg/tournaments';
import { CATEGORY_OPTIONS, PLACEMENT_OPTIONS } from '@/lib/ptcg/tournament-meta';
import type { PtcgTournamentRoundRow, PtcgTournamentRow } from '@/lib/types';

const OUTCOME_ROW_CLASS: Record<'win' | 'loss' | 'tie', string> = {
  win: 'bg-emerald-500/10',
  loss: 'bg-red/10',
  tie: 'bg-amber-500/10',
};

function resultString(
  round: Pick<PtcgTournamentRoundRow, 'games' | 'outcome'>,
  t: (key: `outcome_${'id' | 'no_show' | 'bye'}`) => string,
): string {
  if (round.outcome) return t(`outcome_${round.outcome}`);
  return round.games.map((g) => (g.result === 'win' ? 'W' : g.result === 'loss' ? 'L' : 'T')).join('');
}

export default function TournamentDetailPage({
  tournament: initialTournament,
  initialRounds,
}: {
  tournament: PtcgTournamentRow;
  initialRounds: PtcgTournamentRoundRow[];
}) {
  const t = useTranslations('ptcg');
  const tCommon = useTranslations('common');
  const [tournament, setTournament] = useState(initialTournament);
  const [rounds, setRounds] = useState(initialRounds);
  const [editingTournament, setEditingTournament] = useState(false);
  const [roundForm, setRoundForm] = useState<
    { mode: 'create' } | { mode: 'edit'; round: PtcgTournamentRoundRow } | null
  >(null);
  const [deleting, setDeleting] = useState<PtcgTournamentRoundRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const wins = rounds.filter((r) => deriveRoundResult(r) === 'win').length;
  const losses = rounds.filter((r) => deriveRoundResult(r) === 'loss').length;
  const ties = rounds.filter((r) => deriveRoundResult(r) === 'tie').length;

  const category = CATEGORY_OPTIONS.find((o) => o.value === tournament.category);
  const placement = PLACEMENT_OPTIONS.find((o) => o.value === tournament.placement);

  async function handleDeleteConfirm() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/ptcg/tournaments/${tournament.id}/rounds/${deleting.id}`, {
        method: 'DELETE',
      });
      if (res.ok) setRounds((prev) => prev.filter((r) => r.id !== deleting.id));
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <div className="border-border bg-surface flex items-center gap-4 rounded-xl border p-5">
        <DeckSprites dex={tournament.my_archetype_dex} />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold">{tournament.name}</h2>
            <button
              type="button"
              onClick={() => setEditingTournament(true)}
              aria-label={t('editTournamentTitle')}
              className="hover:bg-surface-2 rounded-lg p-1"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
          <p className="text-text-muted mt-0.5 text-xs">
            {new Date(tournament.played_at).toLocaleDateString()}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {category && (
              <span className="bg-surface-2 rounded-full px-2.5 py-1 text-xs font-semibold">
                {t(category.labelKey)}
              </span>
            )}
            {placement && (
              <span className="bg-surface-2 rounded-full px-2.5 py-1 text-xs font-semibold">
                {t(placement.labelKey)}
              </span>
            )}
          </div>
        </div>
        <span className="text-text-muted text-sm font-semibold uppercase">
          {t('dayRecord', { wins, losses, ties })}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">{t('roundColumnHeader')}</h3>
        <button
          type="button"
          onClick={() => setRoundForm({ mode: 'create' })}
          className="bg-red flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {t('addRoundButton')}
        </button>
      </div>

      {rounds.length === 0 ? (
        <p className="text-text-muted border-border bg-surface rounded-xl border p-4 text-sm">
          {t('noRoundsYet')}
        </p>
      ) : (
        <ul className="divide-border border-border divide-y overflow-hidden rounded-xl border">
          {rounds.map((round) => {
            const outcome = deriveRoundResult(round);
            return (
              <li key={round.id} className={`flex items-center gap-4 p-5 ${OUTCOME_ROW_CLASS[outcome]}`}>
                <span className="w-20 shrink-0 text-sm font-semibold">
                  {t('roundLabel', { n: round.round_number })}
                </span>
                <DeckSprites dex={round.opponent_archetype_dex} />
                <span className="flex-1 font-mono text-base font-semibold">{resultString(round, t)}</span>
                <button
                  type="button"
                  onClick={() => setRoundForm({ mode: 'edit', round })}
                  aria-label={t('editRound')}
                  className="hover:bg-surface-2 shrink-0 rounded-lg p-1.5"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleting(round)}
                  aria-label={t('deleteRoundAria')}
                  className="hover:bg-surface-2 text-red shrink-0 rounded-lg p-1.5"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {editingTournament && (
        <TournamentModal
          mode="edit"
          open
          onClose={() => setEditingTournament(false)}
          tournament={tournament}
          onSaved={(updated) => {
            setTournament(updated);
            setEditingTournament(false);
          }}
        />
      )}

      {roundForm?.mode === 'create' && (
        <RoundForm
          mode="create"
          open
          onClose={() => setRoundForm(null)}
          tournamentId={tournament.id}
          bestOf={tournament.best_of}
          onSaved={(round) => {
            setRounds((prev) => [...prev, round].sort((a, b) => a.round_number - b.round_number));
            setRoundForm(null);
          }}
        />
      )}
      {roundForm?.mode === 'edit' && (
        <RoundForm
          mode="edit"
          open
          onClose={() => setRoundForm(null)}
          tournamentId={tournament.id}
          bestOf={tournament.best_of}
          round={roundForm.round}
          onSaved={(round) => {
            setRounds((prev) => prev.map((r) => (r.id === round.id ? round : r)));
            setRoundForm(null);
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={t('deleteRoundTitle')}
          body={t('deleteRoundBody')}
          confirmLabel={tCommon('delete')}
          confirmTone="danger"
          onConfirm={() => void handleDeleteConfirm()}
          onCancel={() => setDeleting(null)}
          busy={deleteBusy}
        />
      )}
    </div>
  );
}
