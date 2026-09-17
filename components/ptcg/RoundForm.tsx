'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Modal from '@/components/ui/Modal';
import DeckSlots from './DeckSlots';
import type { PtcgTournamentRoundRow, TournamentGame } from '@/lib/types';

interface CreateProps {
  mode: 'create';
  open: boolean;
  onClose: () => void;
  tournamentId: string;
  bestOf: 1 | 3;
  onSaved: (round: PtcgTournamentRoundRow) => void;
}

interface EditProps {
  mode: 'edit';
  open: boolean;
  onClose: () => void;
  tournamentId: string;
  bestOf: 1 | 3;
  round: PtcgTournamentRoundRow;
  onSaved: (round: PtcgTournamentRoundRow) => void;
}

type Props = CreateProps | EditProps;

function isDecided(games: TournamentGame[]): boolean {
  const wins = games.filter((g) => g.result === 'win').length;
  const losses = games.filter((g) => g.result === 'loss').length;
  return wins === 2 || losses === 2;
}

/** How many "Game N" blocks to render: stop the instant a side has clinched
 *  the majority, otherwise show one more block than is filled, capped at
 *  the tournament's best-of. Recomputed on every game entered, not upfront —
 *  a Bo3 that goes 2-0 never renders a 3rd block. */
export function visibleGameCount(games: TournamentGame[], bestOf: number): number {
  if (isDecided(games)) return games.length;
  return Math.min(games.length + 1, bestOf);
}

export default function RoundForm(props: Props) {
  const t = useTranslations('ptcg');
  const tCommon = useTranslations('common');
  const initial = props.mode === 'edit' ? props.round : null;
  const [opponentArchetypeDex, setOpponentArchetypeDex] = useState<number[]>(
    initial?.opponent_archetype_dex ?? [],
  );
  const [games, setGames] = useState<TournamentGame[]>(initial?.games ?? []);
  const [outcome, setOutcome] = useState<'id' | 'no_show' | 'bye' | null>(initial?.outcome ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setGameResult = (index: number, result: TournamentGame['result']) => {
    setOutcome(null);
    setGames((prev) => {
      const next = prev.slice(0, index);
      next[index] = { result, wentFirst: prev[index]?.wentFirst ?? null };
      return next;
    });
  };

  const setGameWentFirst = (index: number, wentFirst: boolean) => {
    setGames((prev) => {
      if (!prev[index]) return prev;
      const next = [...prev];
      next[index] = { ...next[index], wentFirst };
      return next;
    });
  };

  const selectOutcome = (o: 'id' | 'no_show' | 'bye') => {
    setOutcome((prev) => (prev === o ? null : o));
    setGames([]);
  };

  const canSave = outcome !== null || games.length > 0;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = { opponentArchetypeDex, games, outcome };
      const url =
        props.mode === 'create'
          ? `/api/ptcg/tournaments/${props.tournamentId}/rounds`
          : `/api/ptcg/tournaments/${props.tournamentId}/rounds/${props.round.id}`;
      const res = await fetch(url, {
        method: props.mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const resBody = await res.json().catch(() => ({}));
        setError(resBody?.message ?? tCommon('errorUnknown'));
        return;
      }
      const { round } = (await res.json()) as { round: PtcgTournamentRoundRow };
      props.onSaved(round);
    } finally {
      setSaving(false);
    }
  };

  const count = visibleGameCount(games, props.bestOf);

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      ariaLabel={props.mode === 'create' ? t('addRoundTitle') : t('editRoundTitle')}
      layout="bottom-sheet"
      className="bg-surface border-border flex w-full max-w-md flex-col gap-4 overflow-hidden rounded-xl border p-5"
    >
      <h2 className="text-base font-bold">
        {props.mode === 'create' ? t('addRoundTitle') : t('editRoundTitle')}
      </h2>

      <DeckSlots label={t('opponentDeckLabel')} dex={opponentArchetypeDex} onChange={setOpponentArchetypeDex} />

      <div className="flex flex-col gap-3">
        {Array.from({ length: count }, (_, i) => i).map((i) => {
          const game = games[i];
          return (
            <div key={i} className="border-border rounded-lg border p-3">
              <p className="text-text-muted mb-2 text-xs font-semibold tracking-wide uppercase">
                {t('gameLabel', { n: i + 1 })}
              </p>
              <div className="flex gap-2">
                {(['win', 'loss', 'tie'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setGameResult(i, r)}
                    disabled={outcome !== null}
                    aria-pressed={game?.result === r}
                    className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-semibold disabled:opacity-40 ${
                      game?.result === r ? 'bg-red border-red text-white' : 'border-border bg-surface-2'
                    }`}
                  >
                    {t(`gameResult_${r}`)}
                  </button>
                ))}
              </div>
              {game && (
                <div className="mt-2 flex gap-2">
                  {([true, false] as const).map((wf) => (
                    <button
                      key={String(wf)}
                      type="button"
                      onClick={() => setGameWentFirst(i, wf)}
                      aria-pressed={game.wentFirst === wf}
                      className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                        game.wentFirst === wf ? 'bg-surface-2 border-red' : 'border-border'
                      }`}
                    >
                      {t(wf ? 'wentFirst' : 'wentSecond')}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div>
        <p className="text-text-muted mb-2 text-xs font-semibold tracking-wide uppercase">
          {t('otherOutcomeLabel')}
        </p>
        <div className="flex gap-2">
          {(['id', 'no_show', 'bye'] as const).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => selectOutcome(o)}
              aria-pressed={outcome === o}
              className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                outcome === o ? 'bg-red border-red text-white' : 'border-border bg-surface-2'
              }`}
            >
              {t(`outcome_${o}`)}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-red text-sm">{error}</p>}

      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={props.onClose}
          disabled={saving}
          className="border-border hover:bg-surface-2 rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {tCommon('cancel')}
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !canSave}
          className="bg-red rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {saving ? tCommon('saving') : tCommon('save')}
        </button>
      </div>
    </Modal>
  );
}
