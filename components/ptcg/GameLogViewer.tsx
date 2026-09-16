'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { PtcgSnapshot, PtcgTurnIndex } from '@/lib/types';

interface Props {
  me: string;
  opponent: string;
  rawLog: string;
  // Only `line`/`turnNumber` are ever read here — the full snapshot also
  // carries a per-turn game-state reconstruction that's the bulk of a game's
  // payload size and this component never touches, so callers fetch/pass a
  // trimmed shape (see GET /api/ptcg/games/[id]).
  snapshots: Pick<PtcgSnapshot, 'line' | 'turnNumber'>[];
  turns: PtcgTurnIndex[];
}

/**
 * A static, colored transcript of a game: one section per turn, the exact
 * raw log lines for that turn, verbatim. No cursor, no card art, no
 * interactivity — replaces the old step-by-step replay with something to skim.
 */
export default function GameLogViewer({ me, opponent, rawLog, snapshots, turns }: Props) {
  const t = useTranslations('ptcg');
  const lines = useMemo(() => rawLog.split('\n'), [rawLog]);

  // The setup phase has no `Tour de X` line, so it gets no entry in `turns` —
  // without a segment for it, the opening hands and placements are unreachable.
  const setup = useMemo(
    () => snapshots.map((_, i) => i).filter((i) => snapshots[i].turnNumber === 0),
    [snapshots],
  );
  const allTurns = useMemo<PtcgTurnIndex[]>(
    () => (setup.length ? [{ number: 0, player: null, events: setup }, ...turns] : turns),
    [setup, turns],
  );

  return (
    <div className="flex flex-col gap-3">
      {allTurns.map((turn) => {
        const mine = turn.player === me;
        const heading =
          turn.number === 0
            ? t('setup')
            : t('turnHeading', { number: turn.number, player: mine ? t('you') : opponent });
        const turnLines = turn.events
          .map((i) => snapshots[i]?.line)
          .filter((line): line is number => line !== undefined)
          .map((line) => lines[line - 1]);

        return (
          <section
            key={turn.number}
            className={`rounded-xl border p-3 ${
              turn.number !== 0 && mine ? 'border-red/40 bg-red/5' : 'border-border bg-surface'
            }`}
          >
            <h3
              className={`mb-1.5 text-xs font-semibold tracking-wide uppercase ${
                turn.number !== 0 && mine ? 'text-red' : 'text-text-muted'
              }`}
            >
              {heading}
            </h3>
            <ol className="flex flex-col gap-0.5 font-mono text-xs">
              {turnLines.map((line, i) => (
                <li key={i} className="text-text-muted first-letter:uppercase">
                  {line}
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
