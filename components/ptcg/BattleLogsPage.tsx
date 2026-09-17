// components/ptcg/BattleLogsPage.tsx
'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronDown, ChevronRight, Pencil } from 'lucide-react';
import { groupByDay } from '@/lib/utils/group-by-day';
import { getPokemonName } from '@/lib/data/pokemon-names';
import DeckSprites from './DeckSprites';
import GameLogViewer from './GameLogViewer';
import CreateLogModal, { type ResolvedArchetype } from './CreateLogModal';
import type { PtcgSnapshot, PtcgTurnIndex } from '@/lib/types';

export interface BattleLogGame {
  id: string;
  played_at: string;
  me: string;
  opponent: string;
  result: 'win' | 'loss' | 'tie';
  my_archetype_dex: number[] | null;
  opponent_archetype_dex: number[] | null;
  /** Null for games imported before this column existed — renders with no
   *  1st/2nd badge, same as an unclassified archetype renders with no sprite. */
  went_first: boolean | null;
}

const RESULT_ROW_CLASS: Record<'win' | 'loss' | 'tie', string> = {
  win: 'bg-emerald-500/10',
  loss: 'bg-red/10',
  tie: 'bg-amber-500/10',
};

interface ExpandedGame {
  me: string;
  opponent: string;
  rawLog: string;
  // Trimmed server-side — see GET /api/ptcg/games/[id] — to only what
  // GameLogViewer reads, not the full per-turn board reconstruction.
  snapshots: Pick<PtcgSnapshot, 'line' | 'turnNumber'>[];
  turns: PtcgTurnIndex[];
}

export default function BattleLogsPage({ initialGames }: { initialGames: BattleLogGame[] }) {
  const t = useTranslations('ptcg');
  const locale = useLocale();
  const nameLocale = locale === 'en' ? 'en' : 'fr';
  const [games, setGames] = useState(initialGames);
  const [text, setText] = useState('');
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [createModal, setCreateModal] = useState<{ raw: string; resolved: ResolvedArchetype } | null>(
    null,
  );
  const [editModal, setEditModal] = useState<{ gameId: string; resolved: ResolvedArchetype } | null>(
    null,
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ExpandedGame | null>(null);
  // Only the most recent day starts open — older days collapse to keep a
  // long history scannable, matching the reference app's per-day accordion.
  const [expandedDays, setExpandedDays] = useState<Set<string>>(
    () => new Set(groupByDay(initialGames).slice(0, 1).map((d) => d.dayKey)),
  );

  function toggleDay(dayKey: string) {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dayKey)) next.delete(dayKey);
      else next.add(dayKey);
      return next;
    });
  }

  const addLog = async () => {
    if (!text.trim()) return;
    setResolving(true);
    setResolveError(null);
    try {
      const res = await fetch('/api/ptcg/games/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: text }),
      });
      const body = await res.json();
      if (!res.ok) {
        setResolveError(body?.message ?? 'error');
        return;
      }
      setCreateModal({ raw: text, resolved: body as ResolvedArchetype });
    } finally {
      setResolving(false);
    }
  };

  const toggleExpand = async (game: BattleLogGame) => {
    if (expandedId === game.id) {
      setExpandedId(null);
      setExpanded(null);
      return;
    }
    setExpandedId(game.id);
    setExpanded(null);
    const res = await fetch(`/api/ptcg/games/${game.id}`);
    if (!res.ok) return;
    const body = await res.json();
    setExpanded({
      me: body.game.me,
      opponent: body.game.opponent,
      rawLog: body.game.raw_log,
      snapshots: body.game.state.snapshots,
      turns: body.game.state.turns,
    });
  };

  const openEdit = async (game: BattleLogGame) => {
    const res = await fetch(`/api/ptcg/games/${game.id}`);
    if (!res.ok) return;
    const body = await res.json();
    setEditModal({
      gameId: game.id,
      resolved: {
        me: body.game.me,
        opponent: body.game.opponent,
        myArchetypeDex: body.myArchetypeDex,
        opponentArchetypeDex: body.opponentArchetypeDex,
      },
    });
  };

  const days = useMemo(() => groupByDay(games), [games]);

  /** Falls back to the opponent's username when their deck isn't classified
   *  yet — matches the sprite's own "neutral placeholder" fallback. */
  function opponentLabel(game: BattleLogGame): string {
    const names = (game.opponent_archetype_dex ?? []).map((n) => getPokemonName(n, nameLocale));
    return names.length ? names.join(' / ') : game.opponent;
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="border-border bg-surface rounded-xl border p-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('importPlaceholder')}
          spellCheck={false}
          className="border-border bg-surface-2 focus:border-red h-40 w-full rounded-lg border p-3 font-mono text-xs outline-none"
        />
        <p className="text-text-muted mt-2 text-xs leading-relaxed">{t('importHint')}</p>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => void addLog()}
            disabled={!text.trim() || resolving}
            className="bg-red rounded-lg px-5 py-2 text-sm font-semibold text-white transition disabled:opacity-40"
          >
            {resolving ? t('resolving') : t('addLogButton')}
          </button>
        </div>
        {resolveError && <p className="text-red mt-2 text-sm">{resolveError}</p>}
      </section>

      {days.length === 0 ? (
        <p className="text-text-muted border-border bg-surface rounded-xl border p-4 text-sm">
          {t('noLogsYet')}
        </p>
      ) : (
        days.map((day) => {
          const wins = day.rows.filter((g) => g.result === 'win').length;
          const losses = day.rows.filter((g) => g.result === 'loss').length;
          const ties = day.rows.filter((g) => g.result === 'tie').length;
          const dayOpen = expandedDays.has(day.dayKey);
          return (
            <div key={day.dayKey} className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => toggleDay(day.dayKey)}
                className="text-text-muted hover:text-text flex items-center justify-between gap-2 text-xs font-semibold tracking-wide uppercase"
              >
                <span className="flex items-center gap-1.5">
                  {dayOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  )}
                  {day.date.toLocaleDateString()}
                </span>
                <span className="tabular-nums normal-case">
                  {t('dayRecord', { wins, losses, ties })}
                </span>
              </button>
              {dayOpen && (
              <ul className="divide-border border-border bg-surface divide-y rounded-xl border">
                {day.rows.map((game) => (
                  <li key={game.id}>
                    {/* A <div role="button">, not a <button> — the row needs to
                        contain the pencil's own real <button>, and the HTML
                        content model forbids nesting interactive elements
                        inside a <button>. */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => void toggleExpand(game)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          void toggleExpand(game);
                        }
                      }}
                      className={`hover:bg-surface-2 flex w-full items-center gap-3 p-4 text-left transition ${RESULT_ROW_CLASS[game.result]}`}
                    >
                      {expandedId === game.id ? (
                        <ChevronDown className="text-text-muted h-4 w-4 shrink-0" aria-hidden />
                      ) : (
                        <ChevronRight className="text-text-muted h-4 w-4 shrink-0" aria-hidden />
                      )}
                      <DeckSprites dex={game.my_archetype_dex} />
                      <span className="flex-1 truncate text-sm font-semibold">
                        {t(`result_${game.result}`)} {t('versus', { opponent: opponentLabel(game) })}
                      </span>
                      {game.went_first !== null && (
                        <span className="text-text-muted shrink-0 text-xs font-semibold uppercase">
                          {t(game.went_first ? 'wentFirst' : 'wentSecond')}
                        </span>
                      )}
                      <DeckSprites dex={game.opponent_archetype_dex} />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void openEdit(game);
                        }}
                        aria-label={t('editLog')}
                        className="hover:bg-surface-2 shrink-0 rounded-lg p-1.5"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                    {expandedId === game.id && expanded && (
                      <div className="border-border border-t p-4">
                        <GameLogViewer
                          me={expanded.me}
                          opponent={expanded.opponent}
                          rawLog={expanded.rawLog}
                          snapshots={expanded.snapshots}
                          turns={expanded.turns}
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              )}
            </div>
          );
        })
      )}

      {createModal && (
        <CreateLogModal
          mode="create"
          open
          onClose={() => setCreateModal(null)}
          raw={createModal.raw}
          resolved={createModal.resolved}
          onSaved={(game) => {
            setGames((prev) => [
              {
                id: game.id,
                played_at: game.played_at,
                me: createModal.resolved.me,
                opponent: createModal.resolved.opponent,
                result: game.result,
                my_archetype_dex: createModal.resolved.myArchetypeDex,
                opponent_archetype_dex: createModal.resolved.opponentArchetypeDex,
                // Not returned by POST /api/ptcg/games today — the row just
                // shows no 1st/2nd badge until the page is next reloaded.
                went_first: null,
              },
              ...prev,
            ]);
            setCreateModal(null);
            setText('');
          }}
        />
      )}

      {editModal && (
        <CreateLogModal
          mode="edit"
          open
          onClose={() => setEditModal(null)}
          gameId={editModal.gameId}
          resolved={editModal.resolved}
          onSaved={(dex) => {
            setGames((prev) =>
              prev.map((g) =>
                g.id === editModal.gameId
                  ? { ...g, my_archetype_dex: dex.myArchetypeDex, opponent_archetype_dex: dex.opponentArchetypeDex }
                  : g,
              ),
            );
            setEditModal(null);
          }}
        />
      )}
    </div>
  );
}
