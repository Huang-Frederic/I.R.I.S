'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ChevronLeft } from 'lucide-react';
import {
  aggregateStats,
  groupByMyArchetype,
  matchupsForArchetype,
  type GameForStats,
} from '@/lib/ptcg/game-stats';
import { archetypeKey } from '@/lib/ptcg/archetype-dex';
import DeckSprites from './DeckSprites';
import StatsDetailSections from './StatsDetailSections';

export interface StatsGame extends GameForStats {
  id: string;
  opponent: string;
}

function recordLabel(wins: number, losses: number, ties: number): string {
  return `${wins}-${losses}${ties ? `-${ties}` : ''}`;
}

export default function StatsPage({ games }: { games: StatsGame[] }) {
  const t = useTranslations('ptcgStats');
  const [myKey, setMyKey] = useState<string | null>(null);
  const [oppKey, setOppKey] = useState<string | null>(null);

  const archetypes = useMemo(() => groupByMyArchetype(games), [games]);

  const myGames = useMemo(
    () => (myKey === null ? [] : games.filter((g) => archetypeKey(g.myArchetypeDex) === myKey)),
    [games, myKey],
  );
  const matchups = useMemo(() => matchupsForArchetype(myGames), [myGames]);

  const matchupGames = useMemo(
    () =>
      oppKey === null ? [] : myGames.filter((g) => archetypeKey(g.opponentArchetypeDex) === oppKey),
    [myGames, oppKey],
  );
  const matchupStats = useMemo(() => aggregateStats(matchupGames), [matchupGames]);

  if (games.length === 0) {
    return (
      <div className="border-border bg-surface rounded-xl border px-4 py-12 text-center">
        <p className="text-sm font-semibold">{t('emptyTitle')}</p>
        <p className="text-text-muted mx-auto mt-1 mb-5 max-w-md text-sm">{t('emptyBody')}</p>
        <div className="flex justify-center">
          <Link
            href="/ptcg"
            className="bg-red hover:bg-red/90 rounded-full px-3.5 py-1.5 text-xs font-semibold text-white transition"
          >
            {t('importBtn')}
          </Link>
        </div>
      </div>
    );
  }

  // Level 3: a matchup is selected — the rich detail for that exact pairing.
  if (myKey !== null && oppKey !== null) {
    const matchup = matchups.find((m) => archetypeKey(m.dex) === oppKey);
    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setOppKey(null)}
          className="text-text-muted hover:text-text flex items-center gap-1 self-start text-xs font-semibold"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> {t('backToMatchups')}
        </button>
        <div className="flex items-center gap-3">
          <DeckSprites dex={matchup?.dex ?? []} />
          <p className="text-sm font-semibold">
            {matchup ? recordLabel(matchup.wins, matchup.losses, matchup.ties) : ''}
          </p>
        </div>
        <StatsDetailSections stats={matchupStats} />
      </div>
    );
  }

  // Level 2: a my-archetype is selected — its matchups.
  if (myKey !== null) {
    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setMyKey(null)}
          className="text-text-muted hover:text-text flex items-center gap-1 self-start text-xs font-semibold"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> {t('backToArchetypes')}
        </button>
        <ul className="divide-border border-border bg-surface divide-y rounded-xl border">
          {matchups.map((m) => {
            const key = archetypeKey(m.dex);
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => setOppKey(key)}
                  className="hover:bg-surface-2 flex w-full items-center gap-3 p-4 text-left transition"
                >
                  <DeckSprites dex={m.dex} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm font-semibold">
                      {m.dex.length === 0 ? t('unclassified') : null}
                    </span>
                    {/* Spec-required per-matchup breakdown: winrate on the play vs.
                        on the draw — a matchup can swing hard on turn order alone. */}
                    <span className="text-text-faint text-[11px] tabular-nums">
                      {t('goingFirst')} {m.first.games ? `${m.first.winratePct.toFixed(0)}%` : '—'} ·{' '}
                      {t('goingSecond')} {m.second.games ? `${m.second.winratePct.toFixed(0)}%` : '—'}
                    </span>
                  </span>
                  <span className="text-text-muted text-xs tabular-nums">
                    {recordLabel(m.wins, m.losses, m.ties)}
                  </span>
                  <span
                    className={`font-mono text-sm font-bold tabular-nums ${
                      m.winratePct >= 50 ? 'text-emerald-500' : 'text-red'
                    }`}
                  >
                    {m.winratePct.toFixed(0)}%
                  </span>
                  <span className="text-text-faint text-xs tabular-nums">
                    {t('lastPlayed')} {m.lastPlayed.slice(0, 10)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  // Level 1: my archetypes.
  return (
    <ul className="divide-border border-border bg-surface divide-y rounded-xl border">
      {archetypes.map((a) => {
        const key = archetypeKey(a.dex);
        return (
          <li key={key}>
            <button
              type="button"
              onClick={() => setMyKey(key)}
              className="hover:bg-surface-2 flex w-full items-center gap-3 p-4 text-left transition"
            >
              <DeckSprites dex={a.dex} />
              <span className="flex-1 text-sm font-semibold">
                {a.dex.length === 0 ? t('unclassified') : null}
              </span>
              <span className="text-text-muted text-xs tabular-nums">
                {recordLabel(a.wins, a.losses, a.ties)}
              </span>
              <span
                className={`font-mono text-sm font-bold tabular-nums ${
                  a.winratePct >= 50 ? 'text-emerald-500' : 'text-red'
                }`}
              >
                {a.winratePct.toFixed(0)}%
              </span>
              <span className="text-text-faint text-xs tabular-nums">
                {t('lastPlayed')} {a.lastPlayed.slice(0, 10)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
